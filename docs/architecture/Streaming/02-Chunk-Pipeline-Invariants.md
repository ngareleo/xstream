# Chunk pipeline invariants

The three load-bearing rules that keep chunked playback from skipping or stalling under foreground+lookahead concurrency. All three must hold simultaneously — violating any one silently breaks the buffered-range timeline. Each entry below names the symptom that exposed it (so a future regression is recognizable in a trace).

## 1. Chunk PTS contract — `-output_ts_offset` + `mode = "segments"`

Every chunk's segments are emitted with `-output_ts_offset {chunkStartSeconds}` so chunk N's segments live at PTS `[chunkStart, chunkEnd)` in the source-time timeline, NOT at PTS 0 (which is what ffmpeg's `-ss <start>` seek defaults to). Paired with the client's `sourceBuffer.mode = "segments"` (NOT `"sequence"`), this means each chunk's segments land at the correct buffer-time regardless of append order.

Without the offset + segments-mode combo, parallel foreground+lookahead appends interleave at the buffer's timeline end (sequence-mode auto-advances `timestampOffset` per append) and the buffer balloons unbounded — observed as 426 MB / 128 s buffered ahead → `QuotaExceededError` × 3 → user-visible stall.

Code: `server/src/services/ffmpegFile.ts::applyOutputOptions` (offset emission), `client/src/services/bufferManager.ts::init` (mode flip).

## 2. Per-chunk init segments are required

`ChunkPipeline.openSlot` appends every chunk's `init.mp4` to the SourceBuffer, including continuations (chunks N>0). Each chunk's ffmpeg encode emits its own `elst` (edit list) box carrying that chunk's source-time lead-in offset; without re-appending the init, chunk N's media segments are parsed against chunk 0's edit list and Chrome silently drops them — they land in the SourceBuffer (bytes counter rises) but never extend `sb.buffered` past chunk 0's PTS.

Trace `8281b0fb…` confirmed this empirically (chunks 2-3 streamed cleanly with TFDT 300+/600+ but `sb.buffered` stayed capped at 300.04, playhead skipped past them). SPS/PPS are identical across our chunk encodes (only `elst` differs), so re-init causes at most a one-frame decoder hiccup, not a stall — the earlier "no continuation init" defensive filter was wrong.

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
| `MIN_REAL_CHUNK_BYTES` | `1024` | [`client/src/services/playbackConfig.ts:39`](../../../client/src/services/playbackConfig.ts) | Threshold under which a finished chunk's `slot.totalMediaBytes` is treated as a placeholder (ffmpeg emits a ~24-byte tail when `-ss <start>` lands past the encoded content). At 1024 we sit comfortably above any placeholder ffmpeg has been observed to write and well below any real fmp4 init+segment, so the "completed" vs "no_real_content" outcome decision is unambiguous. Drives whether `dispatchOutcome` calls `BufferManager.markStreamDone()` (which fires `MediaSource.endOfStream()`). The `chunk_no_real_content` event on the `chunk.stream` span is the trace-side signal. |

