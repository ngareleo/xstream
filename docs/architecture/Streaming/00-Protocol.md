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

**Each chunk has its own init segment, and continuation chunks (N>0) MUST re-append theirs** — each chunk is a separate ffmpeg encode with its own `avcC` (SPS/PPS in v3 also flow in-band via the `dump_extra=keyframe` bitstream filter). The client also calls `BufferManager.setTimestampOffset(chunkStartS)` on every init append; together these are what place each chunk's segments at their absolute timeline position. See [`02-Chunk-Pipeline-Invariants.md`](02-Chunk-Pipeline-Invariants.md) § "Per-chunk init segments are required".

The server generates the init segment by running a zero-duration ffmpeg pass on the first `.m4s` output file.

---

## Server Streaming Logic

`server-rust/src/routes/stream.rs`:

1. Register the connection with the job (increments connection counter).
2. Wait for `job.init_segment_path` to be set (polling 100ms, max 60s).
   - Uses async cancellation to detect early disconnects.
   - Errors are caught and propagated through the Result type.
3. Read init segment bytes from disk → write `[4-byte length][bytes]` to response.
4. Loop over segments:
   - If segment file exists at the expected path → read → write frame → increment index.
   - If `job.status === 'Complete'` or `'Error'` → break.
   - Else → sleep 100ms and retry.
   - **`config.stream.connection_idle_timeout_ms` (default 180 s)**: if no segment has been sent within that window while waiting for the encoder, close the connection and kill the job (see below).
5. On client disconnect: deregister the connection. If `connections === 0` and job is `running` → `kill_job(job_id)` (SIGTERM).
6. On natural stream end: deregister connection and close.

**Connection counting + ffmpeg lifecycle:**
- `ActiveJob.connections` tracks how many HTTP connections are consuming each job.
- When the last connection drops (or times out), `kill_job` sends SIGTERM to the ffmpeg process. This prevents zombie processes when users navigate away.
- Multiple tabs on the same job share a `connections` count; ffmpeg is only killed when **all** connections close.
- Maximum concurrent running jobs: `config.transcode.max_concurrent_jobs` (default `3`, defined in `server-rust/src/config.rs`). A 4th `startTranscode` call while 3 slots are occupied returns a typed `CAPACITY_EXHAUSTED` `PlaybackError` (with `retry_after_ms = config.transcode.capacity_retry_hint_ms`) — never throws. Jobs that have been SIGTERM'd but haven't yet exited do **not** count toward the cap — they are tracked separately and their slot is freed immediately on the kill call. This prevents rapid back-to-back seeks from exhausting the cap while 4K-software flushes are still in flight. After `config.transcode.force_kill_timeout_ms` (default 2 s) a SIGKILL is escalated automatically, bounding the zombie window.

---

## Client Parsing Logic

`client/src/services/streamingService.ts`:

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

Seeks anchor a fresh ffmpeg encode at the user's seek position. The chunk runs from `seekTime` to the next 300-second grid line (so the *prefetched* continuation chunk lands back on the canonical grid and is cache-friendly for forward play).

1. `"seeking"` event fires on the `<video>` element.
2. `StreamingService.cancel()` — aborts the current fetch.
3. `BufferManager.seek(seekTime)`:
   - `await waitForUpdateEnd()`
   - `sourceBuffer.remove(0, Infinity)` — clear all buffered content
   - `await waitForUpdateEnd()`
   - Reset append queue, flags, and `afterAppendCb`
   - Set `video.currentTime = seekTime` (the user's intended position, not a snapped boundary)
4. `startChunkSeries(res, seekTime, buffer)` — fires a new `startTranscode` mutation for `[seekTime, nextSnap)` where `nextSnap = Math.ceil(seekTime / 300) * 300`. The server runs ffmpeg with `-ss seekTime`, so segment 0 of the produced fMP4 *is* the user's first useful frame.
5. On every init append, `BufferManager.setTimestampOffset(chunkStartS)` shifts MSE placement so segments land at their absolute source-time position.
6. Server streams init segment + media segments as ffmpeg produces them.

Trade-off: re-seeking to the same exact second misses the chunk cache (the `jobId` hash is keyed on `start_s`). Acceptable — interactive scrubbing dominates, and the seek-to-ready latency benefit (sub-5 s vs. 16–60 s pre-refactor) is the load-bearing UX win.

**Seek accuracy:** the first appended segment starts at the keyframe ffmpeg's `-ss` lands on (typically within ~1 s of `seekTime`); the video element resumes at `seekTime` once `bufferedAhead ≥ clientConfig.playback.startupBufferS[res]`.

---

## Startup Buffer

`useChunkedPlayback` waits until `bufferedEnd >= clientConfig.playback.startupBufferS[res]` before calling `video.play()`. This keeps the loading spinner up long enough for smooth initial playback, calibrated per resolution:

| Resolution | Startup threshold |
|---|---|
| `240p` | 2s |
| `360p` | 2s |
| `480p` | 3s |
| `720p` | 4s |
| `1080p` | 6s |
| `4k` | 5s |

The 4K threshold was lowered from 10 s after a Seq cold-start trace showed the startup-buffer fill phase accounted for ~69 % of TTFF (~2.1 s of a ~3.1 s total). 5 s gives ~1 s back to the user; immediate post-`play()` stalls are surfaced by the existing `playback.stalled` span.

Detection is driven by `BufferManager.setAfterAppend(tryStart)` — a callback that fires synchronously inside `drainQueue` after every real `appendBuffer` call. This works correctly in headless environments (Playwright, CI) where `requestAnimationFrame` fires slowly or not at all between segment appends. A RAF loop is also started as a fallback for slow live-transcode paths where no new segment arrives for several seconds.

## Back-Pressure

The client pauses fetching when the forward buffer exceeds a configurable threshold (default 60 seconds) to avoid unbounded memory growth:

```
after each appendBuffer:
  bufferedAhead = sourceBuffer.buffered.end(last) - video.currentTime
  if bufferedAhead > forwardTarget  → StreamingService.pause()
  if bufferedAhead < forwardResume  → StreamingService.resume()
```

`forwardTargetS` defaults to 60s and `forwardResumeS` to 20s — both live on `BufferConfig`, passed to `BufferManager`'s constructor. The 40-second hysteresis gap is deliberately wide so each pause/drain cycle lasts ~40s of real playback and cycles don't chain back-to-back at steady state; one pause → resume cycle produces one `buffer.halt` telemetry span (see `../Observability/`).

Back buffer eviction keeps at most 10 seconds behind `currentTime`:

```
after each appendBuffer:
  evictEnd = video.currentTime - 10s
  if sourceBuffer.buffered.start(0) < evictEnd:
    sourceBuffer.remove(buffered.start(0), evictEnd)
```

At 4K (15 Mbps), 70 seconds of buffer is approximately **133 MB** — acceptable for a desktop browser.

### Hysteresis: tuning the gap

The three buffer knobs (`forwardTargetS`, `forwardResumeS`, `backBufferKeepS`) are overridable at runtime via the `flag.experimentalBuffer` feature flag + the `config.bufferForwardTargetS` / `config.bufferForwardResumeS` tunables. This section captures the tradeoffs so future tuning stays grounded.

#### Mental model

Two thresholds, one decoder-starvation line:

```
bufferedAhead (seconds in front of playhead)
 ▲
 │   pause  ───────────────────────  forwardTargetS  (default 60s)
 │                                   ↑
 │         hysteresis gap            │  gap = target - resume
 │         (= halt duration)         │
 │                                   ↓
 │   resume ───────────────────────  forwardResumeS  (default 20s)
 │
 │   ───────────────────────────────  0  (decoder starves, video stalls)
 ▼
```

The TCP back-pressure chain when the client calls `StreamingService.pause()`:

```
BufferManager.checkForwardBuffer  →  onPause()
           ↓
StreamingService holds a pending resumeResolve promise
           ↓
reader.read() suspends (no pull from the network)
           ↓
TCP receive window stops draining
           ↓
Server's controller.enqueue() eventually blocks in writable.write()
           ↓
ffmpeg stdout.pipe(serverWriter) blocks
           ↓
ffmpeg stops producing new segments
```

No ffmpeg kill, no reconnect. When playback drains the buffer below `forwardResumeS`, `StreamingService.resume()` resolves the promise and the chain unblocks in reverse.

#### What the gap controls

| Axis | Narrow gap (<5s, e.g. 20/16) | Wide gap (30–50s, default 60/20) |
|---|---|---|
| **Halt frequency** | Many, short cycles (~5s each) | Few, long cycles (~40s each) |
| **Halt duration** | ≈ gap (a few seconds) | ≈ gap (tens of seconds) |
| **Underrun margin** | 16s → safe; rarely starves | 20s → safe; resume floor ≥5s is plenty |
| **Telemetry volume** | One `buffer.halt` span per short cycle — noisy | One span per ~40s of playback — calm |
| **ffmpeg throttling** | Frequent flip between blocked/unblocked; ffmpeg stays warm | Long idle windows; must stay under `config.stream.connectionIdleTimeoutMs` (180 s) or the server kills the job |
| **Network-blip resilience** | Smaller buffer ceiling, less cushion during jitter | Larger cushion absorbs transient stalls |

Narrow gaps are pathological — they spam `buffer.halt` spans and make it hard to see real problems in Seq. Very wide gaps (>120s halts) risk tripping `config.stream.connectionIdleTimeoutMs`. The default 40s gap sits comfortably between the two.

#### Key numbers separate from the gap

The three knobs each do a different job:

- `forwardTargetS` — **memory ceiling.** Peak resident buffer is `forwardTargetS + backBufferKeepS` (bytes depend on bitrate — see table below). Raising it costs memory, lowering it risks underruns on bursty networks.
- `forwardResumeS` — **underrun margin.** How much buffer exists when the stream un-pauses. Refill latency is ~0.1–2s at steady state (server already has segments ready) so a resume floor of **≥5s is safe**; below that, a single network hiccup during refill can drain to 0 and stall the video.
- **Gap = target − resume** — **halt duration.** Each halt lasts ≈ gap seconds because playback drains the buffer at 1× while the stream is paused. Default 60 − 20 = 40s.

#### Memory table (at default `forwardTargetS + backBufferKeepS = 70s`)

Using `RESOLUTION_PROFILES` video + audio bitrates from `server-rust/src/config.rs`:

| Resolution | Bitrate (v + a) | Peak resident buffer (70s × bitrate / 8) |
|---|---|---|
| 240p | 300 + 96 kbps = 396 kbps | ~3.5 MB |
| 360p | 800 + 128 kbps = 928 kbps | ~8.1 MB |
| 480p | 1500 + 128 kbps = 1628 kbps | ~14.2 MB |
| 720p | 2500 + 192 kbps = 2692 kbps | ~23.6 MB |
| 1080p | 4000 + 192 kbps = 4192 kbps | ~36.7 MB |
| 4K | 15000 + 192 kbps = 15192 kbps | ~133.0 MB |

4K is the only resolution where the buffer is non-trivial. Desktop browsers handle it comfortably; mobile should use a lower `forwardTargetS` via the flag layer.

#### Chunks vs segments vs buffer — three independent levers

Easy to conflate, but each knob affects a different part of the pipeline:

| Lever | Default | What it controls |
|---|---|---|
| `clientConfig.playback.chunkDurationS` (`client/src/config/appConfig.ts`) | 300s | ffmpeg transcode unit — one ffmpeg process produces one chunk. Affects first-byte latency (smaller = faster start) and chunk-cutover cost (smaller = more frequent cutovers) |
| Segment duration (ffmpeg `-seg_duration`) | 2s | Wire framing unit — each `.m4s` is 2 seconds of fMP4. Affects append cadence and `appendBuffer` throughput |
| `clientConfig.buffer.forwardTargetS` (`client/src/config/appConfig.ts`) | 60s | Client-side buffer ceiling — how much media is resident in the SourceBuffer. Independent of ffmpeg; the network can deliver hundreds of segments but the client only keeps `forwardTargetS` ahead of the playhead |

If playback feels choppy at 4K, the right lever depends on the symptom:
- Long time-to-first-frame → shrink `clientConfig.playback.chunkDurationS` (documented in `docs/todo.md` CHUNK-001)
- Decoder underruns mid-stream → raise `forwardResumeS` (more cushion when stream resumes)
- Out-of-memory on a low-spec client → lower `forwardTargetS`

Don't reach for a bigger chunk size to "stream more over the wire" — the stream is already continuous; segments are emitted as ffmpeg produces them. A larger chunk just delays the first byte.
