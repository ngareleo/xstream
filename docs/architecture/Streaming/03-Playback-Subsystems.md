# Playback subsystems

Three small, single-purpose modules that `PlaybackController` composes to keep the playback path observable, well-paced, and stable. Each was extracted from `PlaybackController` itself in the chunk-handover branch — they exist to keep the controller focused on chunk scheduling while moving cross-cutting concerns (timing, stall detection, prediction) into testable units.

## `PlaybackTicker` — single RAF tick

`client/src/services/playbackTicker.ts` is the one `requestAnimationFrame` tick that drives every per-frame poll the playback subsystem needs:

- Startup-buffer check (waits for ≥ `clientConfig.playback.startupBufferS` seconds buffered before calling `video.play()`)
- Prefetch trigger (fires when `currentTime` crosses `chunkEnd - clientConfig.playback.prefetchThresholdS`)
- Background-buffer ready check during a resolution swap
- `StallTracker`'s 2 s spinner debounce

Replaces what was four scattered RAF loops + a `setTimeout`. Handlers register with `ticker.register(handler)` and return `true` to stay or `false` to self-deregister. **Auto-starts on first registration, auto-stops when the last handler leaves** — no explicit start/stop calls in production code.

`shutdown()` clears all handlers — called by `PlaybackController.resetForNewSession`.

Owned by `PlaybackController`; passed into `StallTracker` via deps so the spinner debounce shares the same tick instead of running its own `setTimeout`.

## `StallTracker` — buffering-spinner debounce

`client/src/services/stallTracker.ts` watches the HTMLMediaElement `waiting` event and shows the buffering spinner only after a continuous stall exceeds `clientConfig.playback.bufferingSpinnerDelayMs` (default 2 s). Brief decoder hiccups under the threshold are swallowed.

Uses the shared `PlaybackTicker` for its delay timer (registered handler fires every frame, checks elapsed time vs the threshold). Opens the `playback.stalled` span when the threshold trips, ends it on `playing` / `seek` / `teardown`.

The spinner-state machine has **four mutually exclusive layers**. The first three are checked inside `StallTracker.onWaiting`; the fourth is a guard in `PlaybackController.handlePlaying`:

| Layer | Owner | Guard | Suppresses |
|---|---|---|---|
| Cold-start loading | `StallTracker` | `hasStartedPlayback === false` | `onWaiting` arming the debounce — startup has its own loading-spinner path |
| Decoder warmup post-`play()` | `StallTracker` | `isInFirstRenderGrace()` — a 5 s timestamp window set in `waitForStartupBuffer.tryPlay` when `hasStartedPlayback` flips true, cleared on the first DOM `playing` event or `resetForNewSession` | `onWaiting` arming the debounce — the decoder fires `waiting` for hundreds of ms after `video.play()` before rendering the first frame; this is not a stall |
| Mid-playback stall | `StallTracker` | neither guard active | debounce arms; spinner shows after 2 s; `playback.stalled` span opens |
| Seek-resume auto-resume | `PlaybackController` | `firstFrameRecorded === true` in `handlePlaying` | status staying "loading" after a seek — `handleSeeking` sets `status("loading")` but the video element auto-resumes (we never `pause()` on seek), so the DOM `playing` event fires before `tryPlay → onPlay` does; `firstFrameRecorded` (set once per session in `tryPlay`'s threshold-met branch, reset only by `resetForNewSession`) is the correct discriminator: session has played before → flip status immediately; true cold-start → wait for `tryPlay` |

**Note — paused-at-seek case (PR #35):** when the user is already paused at `handleSeeking` time, the startup-buffer path still runs (so the spinner hides via `setStatus("playing")`), but `onPlay` checks `videoEl.paused` before calling `videoEl.play()` and skips it if true. `status` and `videoEl.paused` are independent axes — controller-level "in session" vs DOM-level "actively rendering frames" — and seek-resume must respect both.

Only the third layer represents a genuine user-visible stall. `playback.stalled` spans are therefore always mid-playback events, never startup or warmup noise. The fourth layer is not a stall at all — it is a status-flip gap unique to the seek path where the browser's auto-resume races ahead of the controller's startup-buffer machinery.

`isInFirstRenderGrace` is supplied as a dep `() => boolean` from `PlaybackController` so `StallTracker` stays free of controller state.

## `PlaybackTimeline` — observability data

`client/src/services/playbackTimeline.ts` is a pure observability data structure that holds **wall-clock predictions** for upcoming pipeline events:

- Next chunk-handover seam crossing (`expected_seam_at_ms`)
- Next prefetch fire
- Lookahead first-byte arrival (`expected_lookahead_first_byte_at_ms`)

Predictions are based on a rolling window of the last 5 first-byte latencies (`rolling_avg_first_byte_latency_ms`). The first chunk handover in a session has no prediction; subsequent ones compare actual against the rolling average and emit a `playback.timeline_drift` event on `playback.session` when a prediction diverges from reality by more than 5 s.

The rest of the system **never reads from `PlaybackTimeline` for coordination decisions** — it exists so that future trace inspection can see expected-vs-actual at a glance, and so prefetch regressions surface as drift events instead of being inferred from latency-tail metrics.

Snapshots are surfaced as attributes on `playback.session` and `chunk.stream` spans (see [`../Observability/client/00-Spans.md`](../Observability/client/00-Spans.md)).

`PlaybackController` owns the timeline, calls its update methods at the right transitions (foreground change, lookahead open, first byte arrival, promotion).

## User-pause backpressure poller

While the `<video>` element is paused by the user, `timeupdate` is silent, so `BufferManager.checkForwardBuffer` (the normal backpressure driver) never runs. Without intervention the network fetch keeps appending until Chrome detaches the `SourceBuffer` under memory pressure.

`PlaybackController` wires two event listeners to plug this gap:

- `pause` → `handleUserPause`: starts a `setInterval` at 1 s, calling `checkUserPauseTick()` immediately and on every tick.
- `play` → `handleUserPlay`: clears the interval and calls `pipeline.resumeLookahead()` to wake the lookahead reader (see below).

Guards in `handleUserPause` skip the implicit `pause` that fires when `video.ended` is true, and skip any pause-side-effect of a seek (browser fires `pause / seeking / play` in some seek paths).

### `checkUserPauseTick` — one tick

Each tick does two things:

1. `buffer.tickBackpressure()` — calls `BufferManager.checkForwardBuffer()` (promoted to public for this purpose) so the backpressure hysteresis loop runs normally even while `timeupdate` is silent.
2. **Pause-time prefetch** — once buffered-ahead ≥ `forwardTargetS` (default 60 s), fires the chunk N+1 `startTranscode` mutation exactly once (guarded by `userPausePrefetchFired`). On success, opens a lookahead slot via `pipeline.openLookahead(...)` and **immediately** calls `pipeline.pauseLookahead()`. Result: ffmpeg pre-encodes segments to disk; segments stay on disk — nothing accumulates in the JS `queuedSegments` queue during the pause. When the user resumes, `handleUserPlay` calls `pipeline.resumeLookahead()`, the reader wakes, segments drain into the queue and are ready for promotion at the next chunk boundary.

### `pauseLookahead` / `resumeLookahead` (`ChunkPipeline`)

Two methods parallel to the existing `pauseAll` / `resumeAll` but targeting only the lookahead slot. Used exclusively by the user-pause path so the foreground slot's reader is never touched.

### `waitForStartupBuffer` — buffered-ahead, not absolute bufferedEnd

`waitForStartupBuffer` gates `video.play()` on `bufferedAhead >= target` (seconds ahead of `currentTime`) rather than `bufferedEnd >= target` (absolute timeline position). The fix matters on seek: after a seek to e.g. 600 s, `BufferManager.setTimestampOffset(600)` places the chunk's raw `tfdt`-relative segments at PTS ≈ 600 s in the source timeline, so `bufferedEnd ≈ 602 s` trivially exceeded a 5 s threshold after just one 2 s segment — `video.play()` fired with only ~2 s of data ahead and stalled immediately. Comparing ahead-of-currentTime makes the threshold resolution-independent and seek-safe.

## Why three files instead of one

- `PlaybackTicker` is dependency-free and used by anyone (including `StallTracker`). Lives separately so future RAF-driven features don't re-invent the multiplexer.
- `StallTracker` is lifecycle-bound (per playback session) and has its own integration tests.
- `PlaybackTimeline` is pure data with rolling-window math; testable in isolation with no React or DOM deps.

If any of these grow public surface area beyond the current ~50–100-line files, prefer extracting another module over inflating one.
