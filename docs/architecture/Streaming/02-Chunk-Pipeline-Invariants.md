# Chunk pipeline invariants

The three load-bearing rules that keep chunked playback from skipping or stalling under foreground+lookahead concurrency. All three must hold simultaneously — violating any one silently breaks the buffered-range timeline. Each entry below names the symptom that exposed it (so a future regression is recognizable in a trace).

## 1. Chunk PTS contract — raw tfdt + `mode = "segments"` + per-chunk `timestampOffset`

The chunker spawns ffmpeg with `-ss <chunkStartS>`, no `-output_ts_offset`. ffmpeg's HLS-fmp4 muxer writes each chunk's segments with **raw `tfdt`** (0, 2, 4, …, relative to whatever `-ss` lands on). The init.mp4 is edit-list-free.

`ChunkPipeline.processSegment` calls `BufferManager.setTimestampOffset(slot.opts.chunkStartS)` on every chunk's init append before the first media segment lands. The browser then resolves `timestampOffset + tfdt = source-time` per segment. A seek-anchored chunk requested at `seekTime = 4365` produces segment 0 with `tfdt = 0`, lands at playback position `4365 + 0 = 4365` — exactly where the user clicked.

`mode = "segments"` (NOT `"sequence"`) is required because `"sequence"` auto-advances `timestampOffset` per append and would fight the explicit per-chunk assignment — segments would interleave from foreground+lookahead at the buffer's timeline end and the buffer would balloon unbounded (426 MB / 128 s buffered ahead → `QuotaExceededError` × 3 → user-visible stall, observed historically).

### Forward play vs. seek anchoring

- **Forward play / lookahead** chunks are anchored on the canonical 300 s grid (`chunkStartS = N × 300`) from chunk 2 onward. The **first chunk** in a new play session uses `[0, clientConfig.playback.firstChunkDurationS)` = `[0, 30)` rather than `[0, 300)`. This is a deliberate one-off cache key (distinct from any pre-existing `[0, 300)` warm entry) that shrinks the time-to-first-frame by letting the prefetch RAF fire at ~0 s rather than ~210 s, so chunk 2 (`[30, 330)`) starts encoding in parallel almost immediately. Subsequent chunks resume the canonical grid via the `nextSnap` cap. The cache-key (`jobId = sha1("v3|content|res|start|end")`) hits across replays for every chunk that falls on the canonical grid.
- **Seek chunks** are anchored at the user's actual `seekTime` (NOT the snap boundary). This avoids forcing ffmpeg to encode the chunk-prefix segments the user doesn't need before producing their first useful one — the chunker spawns `-ss seekTime` so segment 0 is already what the user wants. The seek chunk window ends at `min(seekTime + clientConfig.playback.firstChunkDurationS, nextSnap, videoDurationS)` — the 30 s cap ensures the prefetch RAF trips immediately after the seek, eager-warming the next ffmpeg job in parallel. If `nextSnap` is closer than 30 s, the window is clamped to `nextSnap` so the continuation chunk (still requested on the canonical grid) is still cache-friendly.

Trade-off: seek chunks are one-offs that don't cache across re-seeks. Re-seeking to the same exact second misses cache. Acceptable; interactive scrubbing dominates over second-precise re-seeking. Pre-fix evidence (trace `9da5539d…`): fresh-cache mid-chunk seek wall-clock latency was 16-60 s because ffmpeg had to grind through the chunk-prefix encode before reaching the user's segment. Post-fix: ~1-2 s (VAAPI cold-start + first-segment latency).

Code: `client/src/services/bufferManager.ts::setTimestampOffset`, `client/src/services/chunkPipeline.ts::processSegment` (calls it on every `isInit === true`), `client/src/services/playbackController.ts::handleSeeking` (anchors at `seekTime`), `server-rust/src/services/chunker.rs::job_id` (hash version `v3` — `v2` invalidated `output_ts_offset`-era chunks; `v3` invalidates chunks encoded without the `dump_extra=keyframe` BSF, see § 1a).

### 1a. Encoder must inject SPS/PPS in-band on every keyframe

ffmpeg writes SPS/PPS NAL units only into init.mp4's `avcC` box by default. Chromium's chunk demuxer needs them in-band on every keyframe to reset its decoder context across fragment seams; without them, `appendBuffer()` accepts the bytes silently but the demuxer can fail at the sample-prepare step and Chromium internally calls `endOfStream(decode_error)` on the MediaSource — sealing it permanently with no JavaScript-visible event other than `videoEl.error` (`code = 3`, `MEDIA_ERR_DECODE`) and the `sourceended` MediaSource event. Trace `38e711a9…` captured this: 5.6 s after a fresh seek, the demuxer rejected a video sample and 16 ms later the MS was sealed.

`server-rust/src/services/ffmpeg_file.rs::apply_output_options` adds `-bsf:v dump_extra=keyframe` to both encoder branches (libx264 software, h264_vaapi). The bitstream filter is encoder-agnostic — it injects SPS/PPS NAL units before every keyframe in the encoded output, regardless of which encoder produced the frame.

Defense-in-depth: if a future codec bug or unknown-Chromium-behaviour still flips MS to `"ended"` mid-playback, `BufferManager.init`'s `sourceended` event listener invokes `onMseDetached` (when `streamDone === false`) which routes through to `PlaybackController.handleMseDetached` — the existing per-session 3-recreate budget rebuilds the MediaSource at the user's current position. Diagnostic listeners on `sourceended` / `sourceclose` / `videoEl.error` are kept in place for future regressions.

`handleMseDetached` is the single convergence point for two distinct Chromium failure modes:

1. **Explicit SB detach under memory pressure** — `InvalidStateError` from `appendBuffer` with `source_buffer_in_ms_list: false` (trace `65ef5d6c`). Detected in `BufferManager.drainQueue`.
2. **`endOfStream(decode_error)` from the chunk demuxer** — MS sealed with no JS-visible exception; surfaces via the `sourceended` listener when `streamDone === false` (trace `38e711a9`). Added after the `dump_extra=keyframe` BSF fix reduced but did not eliminate the path.

When the 3-recreate budget is exhausted, the surfaced error code is `MSE_DETACHED` for both paths. The code is intentionally not renamed to `MSE_RECOVERY_EXHAUSTED` or similar: (a) it is client-only — never crosses the wire, no external consumer; (b) from the retry-policy and error-overlay perspective both paths mean the same thing ("MSE session unrecoverable, rebuild budget spent"); (c) the rename cost (propagates across `playbackErrors.ts`, `playbackController.ts`, Seq filter strings, ADR, this doc) is not worth the marginal precision gain on a defensive path the user rarely sees.

Code: `server-rust/src/services/ffmpeg_file.rs::apply_output_options` (BSF), `client/src/services/bufferManager.ts::init` (sourceended listener + recovery hook), `client/src/services/playbackController.ts::handleMseDetached` (rebuild — now seek-anchored, resumes at `videoEl.currentTime` directly per § 1).

## 2. Per-chunk init segments are required

`ChunkPipeline.openSlot` appends every chunk's `init.mp4` to the SourceBuffer, including continuations (chunks N>0). The init append is the moment `setTimestampOffset(chunkStartS)` is applied (see Invariant #1) — without it, chunk N's segments would land at the previous chunk's offset and overwrite the buffered range.

Historically (pre-`v2` cached chunks) the init also carried an `elst` empty edit derived from `-output_ts_offset`. That mechanism is gone — the chunker no longer emits `-output_ts_offset` and the muxer therefore writes no `elst`. Future re-init still costs at most a one-frame decoder hiccup (SPS/PPS are identical across same-resolution chunks), so re-init is structurally cheap and behaviourally required by the timestampOffset contract.

Code: `client/src/services/chunkPipeline.ts::processSegment` (init flows through to BufferManager unconditionally).

## 3. Lookahead buffers segments locally; appends only on promotion

Naively appending the lookahead's init while the foreground is still streaming re-parents the foreground's in-flight segments against the wrong chunk's edit list — the SourceBuffer accepts the bytes but Chrome can only decode the keyframes (one per ~2 s segment) and emits a cascade of micro-fragments instead of a contiguous range. Trace `a96bded1…` showed the failure shape (chunk 1's range stops at PTS 232 when chunk 2's init lands; chunk 2's range fragments after PTS 362 when chunk 3's init lands).

The pipeline:

- While `slot.isLookahead`, the network's `onSegment` callback pushes `{data, isInit}` into `slot.queuedSegments` and returns immediately. Nothing reaches the SourceBuffer.
- The lookahead's stream completion is captured in `slot.pendingCompletion` (boolean), but the outcome is **not** decided yet — `totalMediaBytes` is only incremented during `processSegment`, which the queueing path skips, so a "no_real_content" decision based on the pre-drain counter would always be wrong.
- On `promoteLookahead`, the slot becomes foreground synchronously (so `PlaybackController` sees the new `chunkStartS` immediately) and `drainAndDispatch` runs in the background: drain `queuedSegments` through the same `processSegment` path the live network uses, then read the now-correct `totalMediaBytes` to decide outcome and dispatch.
- If the slot is cancelled mid-drain (`slot.cancelled === true` — separate from the natural `slot.ended` set by span end), the drain stops and the queue is dropped.

What this preserves: lookahead's network connection still opens at prefetch time (orphan-timer satisfied), bytes still download ahead of when they're needed (drain is fast — bytes are already in JS memory), and chunk N's init only replaces chunk N-1's init at the chunk-boundary moment when no other chunk is mid-append.

What this costs: lookahead holds ~60–90 s of media in JS memory (~100–300 MB at 4 K) until promotion. Bounded; freed on promotion or cancel.

`promoteLookahead` returns `{ chunkStartS, drain: Promise<void> }`. Production callers can ignore `drain` (`PlaybackController` does); tests await it to assert post-drain state.

Code: `client/src/services/chunkPipeline.ts::openSlot` (queueing branch), `::drainAndDispatch` (drain + outcome decision).

## How they interact

| Without #1 (PTS) | Without #2 (re-init) | Without #3 (queueing) |
|---|---|---|
| Chunks stack at the same PTS, buffer balloons → QuotaExceeded | Chunks N>0 invisible past chunk 0's PTS, playhead skips ahead | Foreground tail fragments into keyframes-only after lookahead init clobber |

A trace where the playhead "skips" a whole chunk and later stalls is almost always (2) or (3); a trace where the buffer balloons to hundreds of MB before stalling is (1).

## Supporting constants

| Constant | Value | Source | Role |
|---|---|---|---|
| `clientConfig.playback.firstChunkDurationS` | `30` | [`client/src/config/appConfig.ts`](../../../client/src/config/appConfig.ts) | Window length of the first chunk after Play and after a seek. Short enough that `clientConfig.playback.prefetchThresholdS = 90` trips almost immediately (at `currentTime ≥ firstChunkDurationS − 90`, clamped to 0), eager-warming ffmpeg for the next chunk in parallel. Reduces time-to-first-frame and time-to-first-frame-after-seek by overlapping chunk N+1's ffmpeg cold-start with chunk N's initial fill. Does not affect the steady-state 300 s cadence. |
| `clientConfig.playback.minRealChunkBytes` | `1024` | [`client/src/config/appConfig.ts`](../../../client/src/config/appConfig.ts) | Threshold under which a finished chunk's `slot.totalMediaBytes` is treated as a placeholder (ffmpeg emits a ~24-byte tail when `-ss <start>` lands past the encoded content). At 1024 we sit comfortably above any placeholder ffmpeg has been observed to write and well below any real fmp4 init+segment, so the "completed" vs "no_real_content" outcome decision is unambiguous. Drives whether `dispatchOutcome` calls `BufferManager.markStreamDone()` (which fires `MediaSource.endOfStream()`). The `chunk_no_real_content` event on the `chunk.stream` span is the trace-side signal. |

