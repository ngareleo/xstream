## Overview

Video is delivered over a single HTTP GET request using chunked transfer encoding. The body is a continuous binary stream of length-prefixed fMP4 segments. The client uses the browser's Media Source Extensions (MSE) API to decode and render frames as segments arrive.

This is not HLS, DASH, or any standard protocol — it is a minimal custom binary framing protocol designed for simplicity and low overhead.

---

## Why fMP4?

The MSE `SourceBuffer.appendBuffer()` method requires **fragmented MP4** (fMP4). A standard MP4 file stores its index (`moov` box) at the end of the file, which means the browser must receive the entire file before it can begin decoding. fMP4 stores a small init segment up front and then streams self-contained media fragments (`moof` + `mdat` boxes) in sequence.

Codec: **H.264 (AVC) + AAC**, encoded with:
- `-movflags frag_keyframe+empty_moov+default_base_moof` (ffmpeg flags that produce valid fMP4)
- `-g 48 -keyint_min 48 -sc_threshold 0` (forces a keyframe at least every 2s at 24fps, enabling clean segment boundaries)

---

## Wire Format

```
┌────────────────────────────────────────────────────────────┐
│ Frame 1: Init Segment                                      │
│  ┌──────────────────┐  ┌──────────────────────────────┐   │
│  │ uint32 BE: N     │  │ N bytes: fMP4 init segment   │   │
│  │ (4 bytes)        │  │ (moov box — codec metadata)  │   │
│  └──────────────────┘  └──────────────────────────────┘   │
├────────────────────────────────────────────────────────────┤
│ Frame 2: Media Segment 0                                   │
│  ┌──────────────────┐  ┌──────────────────────────────┐   │
│  │ uint32 BE: M     │  │ M bytes: segment_0000.m4s    │   │
│  └──────────────────┘  └──────────────────────────────┘   │
├────────────────────────────────────────────────────────────┤
│ Frame 3: Media Segment 1                                   │
│  ...                                                       │
└────────────────────────────────────────────────────────────┘
```

- All length values are **unsigned 32-bit integers in big-endian byte order**
- The first frame is **always** the init segment — no exceptions
- Frames arrive in ascending segment index order
- The stream ends when the HTTP response body closes

---

## Init Segment Requirement

The init segment must be the **first** data appended to the MSE `SourceBuffer`. It contains the `moov` box, which tells the browser:
- Which codecs are in use (H.264 profile/level, AAC variant)
- The track layout (video resolution, audio channels, sample rates)
- Timing metadata

If any media segment is appended before the init segment, `appendBuffer()` fires an error event and the `SourceBuffer` enters an unrecoverable error state. The entire MSE pipeline must be torn down and re-initialized.

The server generates the init segment by running a zero-duration ffmpeg pass on the first `.m4s` output file.

---

## Server Streaming Logic

`server/src/routes/stream.ts`:

1. `addConnection(jobId)` — increments the in-memory connection counter for this job.
2. Wait for `job.initSegmentPath` to be set (polling 100ms, max 60s).
   - Uses `req.signal.addEventListener("abort", ...)` to detect early disconnects (Bun may mark the signal aborted before the coroutine runs its first `await`).
   - Each `Bun.sleep()` is wrapped in try/catch; a thrown error means Bun cancelled the coroutine because the underlying TCP connection closed.
3. Read init segment bytes from disk → write `[4-byte length][bytes]` to response.
4. Loop over segments:
   - If segment file exists at the expected path → read → write frame → increment index.
   - If `job.status === 'complete'` or `'error'` → break.
   - Else → `await sleep(100)` and retry.
   - **90-second idle timeout**: if no segment has been sent for 90s while waiting for the encoder, close the connection and kill the job (see below).
5. On `req.signal.aborted` (client disconnect): `removeConnection(jobId)`. If `connections === 0` and job is `running` → `killJob(jobId)` (SIGTERM).
6. On natural stream end: `removeConnection(jobId)` and close.

**Connection counting + ffmpeg lifecycle:**
- `ActiveJob.connections` tracks how many HTTP connections are consuming each job.
- When the last connection drops (or times out), `killJob` sends SIGTERM to the ffmpeg process. This prevents zombie processes when users navigate away.
- Multiple tabs on the same job share a `connections` count; ffmpeg is only killed when **all** connections close.
- Maximum concurrent running jobs: `MAX_CONCURRENT_JOBS = 3`. A 4th `startTranscode` call while 3 are running throws `"Too many concurrent streams"`.

The `?from=N` query parameter skips directly to segment index N. The init segment is always sent regardless of `from`.

---

## Client Parsing Logic

`client/src/services/StreamingService.ts`:

```
fetch('/stream/<jobId>')
  └─ response.body.getReader()
       └─ loop: reader.read() → Uint8Array chunks
            └─ concat into accumulator buffer
                 └─ while buffer.length >= 4:
                      read uint32 BE → segLen
                      if buffer.length >= 4 + segLen:
                        extract buffer[4 .. 4+segLen] as ArrayBuffer
                        call onSegment(data, isInit)
                        advance buffer by 4 + segLen
```

The accumulator handles TCP fragmentation — a single `reader.read()` call may return a partial segment, multiple segments, or any combination.

---

## MSE Constraints

The MSE `SourceBuffer` has strict rules:

| Rule | Consequence of violation |
|---|---|
| Init segment must be first | `appendBuffer` fires error event, SourceBuffer enters error state |
| `appendBuffer` while `updating === true` | Throws `InvalidStateError` synchronously |
| `MediaSource.endOfStream()` not called | `<video>` stalls indefinitely waiting for more data |
| Object URL not revoked | Memory leak — the MediaSource stays alive |

`BufferManager` handles all of these: it serializes appends through a queue, calls `endOfStream()` when done, and revokes the URL in `teardown()`.

---

## Seeking Protocol

Seeks always flush and restart at a 300-second chunk boundary:

1. `"seeking"` event fires on the `<video>` element.
2. `StreamingService.cancel()` — aborts the current fetch.
3. Snap seek time to chunk boundary: `snapTime = Math.floor(seekTime / 300) * 300`.
4. `BufferManager.seek(snapTime)`:
   - `await waitForUpdateEnd()`
   - `sourceBuffer.remove(0, Infinity)` — clear all buffered content
   - `await waitForUpdateEnd()`
   - Reset append queue, flags, and `afterAppendCb`
   - Set `video.currentTime = snapTime`
5. `startChunkSeries(res, snapTime, buffer)` — fires a new `startTranscode` mutation for `[snapTime, snapTime+300s)` and begins streaming.
6. Server streams init segment + all media segments from the beginning of the chunk.

Snapping to a 300-second boundary ensures the new job reuses an existing cached segment directory if the same chunk was previously encoded.

**Note:** Because seeks always restart at a chunk boundary, seek accuracy is at most `video.currentTime - snapTime` (up to 300s) from the user's target. The video element then fast-forwards through the already-buffered content to reach the actual seek point.

---

## Startup Buffer

`useChunkedPlayback` waits until `bufferedEnd >= STARTUP_BUFFER_S[res]` before calling `video.play()`. This keeps the loading spinner up long enough for smooth initial playback, calibrated per resolution:

| Resolution | Startup threshold |
|---|---|
| `240p` | 2s |
| `360p` | 2s |
| `480p` | 3s |
| `720p` | 4s |
| `1080p` | 6s |
| `4k` | 10s |

Detection is driven by `BufferManager.setAfterAppend(tryStart)` — a callback that fires synchronously inside `drainQueue` after every real `appendBuffer` call. This works correctly in headless environments (Playwright, CI) where `requestAnimationFrame` fires slowly or not at all between segment appends. A RAF loop is also started as a fallback for slow live-transcode paths where no new segment arrives for several seconds.

## Back-Pressure

The client pauses fetching when the forward buffer exceeds a configurable threshold (default 20 seconds) to avoid unbounded memory growth:

```
after each appendBuffer:
  bufferedAhead = sourceBuffer.buffered.end(last) - video.currentTime
  if bufferedAhead > forwardTarget   → StreamingService.pause()
  if bufferedAhead < forwardTarget×0.75 → StreamingService.resume()
```

`forwardTarget` defaults to 20s and is passed as a constructor argument to `BufferManager`. The resume threshold is 75% of the target (15s at the default).

Back buffer eviction keeps at most 5 seconds behind `currentTime`:

```
after each appendBuffer:
  evictEnd = video.currentTime - 5s
  if sourceBuffer.buffered.start(0) < evictEnd:
    sourceBuffer.remove(buffered.start(0), evictEnd)
```

At 4K (15 Mbps), 25 seconds of buffer is approximately **46 MB** — acceptable for a desktop browser.
