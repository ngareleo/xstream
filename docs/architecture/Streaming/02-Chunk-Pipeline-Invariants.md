# Chunk pipeline invariants

The three load-bearing rules that keep chunked playback from skipping or stalling under foreground+lookahead concurrency. All three must hold simultaneously — violating any one silently breaks the buffered-range timeline. Each entry below names the symptom that exposed it (so a future regression is recognizable in a trace).

## 1. Chunk PTS contract — relative tfdt + `mode = "segments"` + per-chunk `timestampOffset`

ffmpeg's HLS-fmp4 muxer writes each chunk's segments with **chunk-relative `tfdt`** (0, 2, 4, …, within the chunk window), regardless of `-output_ts_offset`. The `-output_ts_offset {chunkStartSeconds}` flag does not change the segments' baseMediaDecodeTime — it only causes the ffmpeg muxer to emit an `elst` empty edit of `chunkStartSeconds` into init.mp4 alongside the relative-`tfdt` segments. Chromium MSE in `mode = "segments"` ignores edit lists, so segments land at raw `tfdt`.

To bridge that gap into source-time playback positions, `ChunkPipeline.processSegment` calls `BufferManager.setTimestampOffset(slot.opts.chunkStartS)` on every chunk's init append before the first media segment lands. The browser then resolves `timestampOffset + tfdt = source-time` per segment. Chunk [4200, 4500)'s segment_0080 with `tfdt = 160 s` lands at playback position `4200 + 160 = 4360 s`, which is what `currentTime` is after a seek to mid-chunk.

`mode = "segments"` (NOT `"sequence"`) is required because `"sequence"` auto-advances `timestampOffset` per append and would fight the explicit per-chunk assignment — segments would interleave from foreground+lookahead at the buffer's timeline end and the buffer would balloon unbounded (426 MB / 128 s buffered ahead → `QuotaExceededError` × 3 → user-visible stall, observed historically).

The pre-fix bug: before `setTimestampOffset` was wired (see commit XYZ), the offset stayed at 0 for every chunk. Chunk 0 worked by accident (chunkStart=0 → no offset needed). After a mid-chunk seek to e.g. 4365 s, post-seek segments landed at playback time 160 s; `currentTime` was 4360 s; back-buffer eviction (`evictEnd = currentTime − 10`) wiped them on every append; `v.buffered` stayed empty indefinitely, `seeking = true` never cleared. Trace `334667f2…` captured the symptom.

Code: `client/src/services/bufferManager.ts::setTimestampOffset` (assigns `sb.timestampOffset` with `waitForUpdateEnd` guard), `client/src/services/chunkPipeline.ts::processSegment` (calls it on every `isInit === true`), `server/src/services/ffmpegFile.ts::applyOutputOptions` (`-output_ts_offset` is now mostly cosmetic — the elst it produces is stripped server-side per § 2a).

## 2. Per-chunk init segments are required

`ChunkPipeline.openSlot` appends every chunk's `init.mp4` to the SourceBuffer, including continuations (chunks N>0). Each chunk's ffmpeg encode emits its own `elst` (edit list) box carrying that chunk's source-time lead-in offset; without re-appending the init, chunk N's media segments are parsed against chunk 0's edit list and Chrome silently drops them — they land in the SourceBuffer (bytes counter rises) but never extend `sb.buffered` past chunk 0's PTS.

Trace `8281b0fb…` confirmed this empirically (chunks 2-3 streamed cleanly with TFDT 300+/600+ but `sb.buffered` stayed capped at 300.04, playhead skipped past them). SPS/PPS are identical across our chunk encodes (only `elst` differs), so re-init causes at most a one-frame decoder hiccup, not a stall — the earlier "no continuation init" defensive filter was wrong.

Code: `client/src/services/chunkPipeline.ts::processSegment` (init flows through to BufferManager unconditionally).

### 2a. Server strips `edts` from each init.mp4 (defensive cleanup)

ffmpeg's mov muxer writes an empty `edts > elst` of duration `output_ts_offset` into every init.mp4 it emits with that flag set. Chromium MSE in `mode = "segments"` **ignores** edit lists today — the load-bearing PTS shift now lives in the client's per-chunk `timestampOffset` (see Invariant #1). Stripping the `edts` is therefore not strictly required for correctness, but it is shipped as defense-in-depth: a future Chromium release that starts honouring edit lists in segments mode would silently double-shift segment PTS (`elst` empty edit + client `timestampOffset`) and re-introduce the same stuck-buffer symptom. Removing the box up front makes the resolved PTS unambiguous on the wire.

`server/src/routes/stream.ts` runs each init.mp4 through `services/initSegment.ts::stripEdtsBoxes` before the length-prefixed write, removing the `edts` box from every `trak` and patching parent `trak` + `moov` size headers. Stripped bytes are cached on `ActiveJob.strippedInitBytes` so reconnects skip the parse. Idempotent for chunk 0 (no `output_ts_offset` → no `edts` written → strip is a no-op).

The strip is byte-surgical: only the `edts` box is removed, every other box (`mvhd`, `mdhd`, `tkhd`, codec config) is byte-identical.

Code: `server/src/services/initSegment.ts` (`stripEdtsBoxes`), `server/src/routes/stream.ts` (cache + strip wiring), `server/src/services/__tests__/initSegment.test.ts` (fixture-driven assertions).

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

