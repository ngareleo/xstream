# Playback subsystems

Three small, single-purpose modules that `PlaybackController` composes to keep the playback path observable, well-paced, and stable. Each was extracted from `PlaybackController` itself in the chunk-handover branch — they exist to keep the controller focused on chunk scheduling while moving cross-cutting concerns (timing, stall detection, prediction) into testable units.

## `PlaybackTicker` — single RAF tick

`client/src/services/playbackTicker.ts` is the one `requestAnimationFrame` tick that drives every per-frame poll the playback subsystem needs:

- Startup-buffer check (waits for ≥ `STARTUP_BUFFER_S` seconds buffered before calling `video.play()`)
- Prefetch trigger (fires when `currentTime` crosses `chunkEnd - PREFETCH_THRESHOLD_S`)
- Background-buffer ready check during a resolution swap
- `StallTracker`'s 2 s spinner debounce

Replaces what was four scattered RAF loops + a `setTimeout`. Handlers register with `ticker.register(handler)` and return `true` to stay or `false` to self-deregister. **Auto-starts on first registration, auto-stops when the last handler leaves** — no explicit start/stop calls in production code.

`shutdown()` clears all handlers — called by `PlaybackController.resetForNewSession`.

Owned by `PlaybackController`; passed into `StallTracker` via deps so the spinner debounce shares the same tick instead of running its own `setTimeout`.

## `StallTracker` — buffering-spinner debounce

`client/src/services/stallTracker.ts` watches the HTMLMediaElement `waiting` event and shows the buffering spinner only after a continuous stall exceeds `BUFFERING_SPINNER_DELAY_MS` (default 2 s). Brief decoder hiccups under the threshold are swallowed.

Uses the shared `PlaybackTicker` for its delay timer (registered handler fires every frame, checks elapsed time vs the threshold). Opens the `playback.stalled` span when the threshold trips, ends it on `playing` / `seek` / `teardown`.

Gated on `hasStartedPlayback` — the initial startup-buffer wait is its own loading path, not a stall.

## `PlaybackTimeline` — observability data

`client/src/services/playbackTimeline.ts` is a pure observability data structure that holds **wall-clock predictions** for upcoming pipeline events:

- Next chunk-handover seam crossing (`expected_seam_at_ms`)
- Next prefetch fire
- Lookahead first-byte arrival (`expected_lookahead_first_byte_at_ms`)

Predictions are based on a rolling window of the last 5 first-byte latencies (`rolling_avg_first_byte_latency_ms`). The first chunk handover in a session has no prediction; subsequent ones compare actual against the rolling average and emit a `playback.timeline_drift` event on `playback.session` when a prediction diverges from reality by more than 5 s.

The rest of the system **never reads from `PlaybackTimeline` for coordination decisions** — it exists so that future trace inspection can see expected-vs-actual at a glance, and so prefetch regressions surface as drift events instead of being inferred from latency-tail metrics.

Snapshots are surfaced as attributes on `playback.session` and `chunk.stream` spans (see [`../Observability/client/00-Spans.md`](../Observability/client/00-Spans.md)).

`PlaybackController` owns the timeline, calls its update methods at the right transitions (foreground change, lookahead open, first byte arrival, promotion).

## Why three files instead of one

- `PlaybackTicker` is dependency-free and used by anyone (including `StallTracker`). Lives separately so future RAF-driven features don't re-invent the multiplexer.
- `StallTracker` is lifecycle-bound (per playback session) and has its own integration tests.
- `PlaybackTimeline` is pure data with rolling-window math; testable in isolation with no React or DOM deps.

If any of these grow public surface area beyond the current ~50–100-line files, prefer extracting another module over inflating one.
