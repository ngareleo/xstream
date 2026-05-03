# Playback Scenarios

The client drives transcoding via a **per-session chunk-duration ramp** (`clientConfig.playback.chunkRampS: [10, 15, 20, 30, 45, 60]` seconds, then `chunkSteadyStateS: 60` seconds for all subsequent chunks). The ramp resets at session start, seek, MSE-detached recovery, and resolution switch, so each anchor point benefits from the fast cold-start curve. Each chunk is a separate ffmpeg job covering a time window `[startS, endS)`. Four distinct flows cover the pipeline end-to-end: initial playback, back-pressure, seek, and resolution switch. Each has its own sequence diagram below; the `.mmd` sources are authoritative and can be re-rendered in draw.io via the `open_drawio_mermaid` MCP tool.

## Scenario 1: Initial playback (happy path)

![Initial playback sequence diagram](../../diagrams/streaming-01-initial-playback.png)

> Source: [`streaming-01-initial-playback.mmd`](../../diagrams/streaming-01-initial-playback.mmd)

**Prewarm phase (page mount → user click Play):** When `VideoPlayer` mounts, `useChunkedPlayback.prewarm(nativeMax)` issues a `startTranscode(videoId, nativeMax, 0, 10)` mutation. Errors are swallowed; ffmpeg spins up silently in the background for 1–5 seconds while the user looks at the poster + Play button. The job's deterministic `job_id` (computed from `SHA1(fingerprint + res + 0 + 10)`) is cached — when the user clicks Play and the click-path mutation fires with the same parameters, it cache-hits immediately. If the user takes >30 s to click (the `orphan_timeout_ms`), the warmup ffmpeg is killed automatically; the user clicking afterward re-spawns fresh (equivalent to no prewarm). If the user toggles resolution before clicking, the prewarm is discarded and the click path proceeds with the new resolution.

**Playback phase (user clicks Play):** When the user clicks the Play button, `PlaybackController.startPlayback(res)` opens the `playback.session` span and drives the boot sequence:

1. **`buffer.init` and the `startTranscode` mutation run in parallel via `Promise.all`.** `BufferManager.init(mimeType)` creates a `MediaSource` and arms a `SourceBuffer`; simultaneously `PlaybackController.requestChunk` fires the `startTranscode` GraphQL mutation using the first duration from the ramp (e.g., `clientConfig.playback.chunkRampS[0]` = `10` seconds). If the prewarm matched (same resolution), the mutation returns the cached `ActiveJob` and this step is a cache hit. If not (prewarm was discarded or timed out), ffmpeg spawns fresh. Either way, ffmpeg's encode is overlapped with the `sourceopen` handshake rather than waiting behind it.
2. `PlaybackController.requestChunk` opens a `transcode.request` span (with `chunk.is_prefetch = false`) around the mutation. The auto-generated `graphql.request` HTTP span nests underneath via `context.with`. The span closes when the mutation resolves and records `chunk.job_id`. The pre-issued `jobId` is plumbed directly into `pipeline.startForeground` — no second mutation fires when the pipeline opens.
3. `chunker::start_transcode_job` (in `server-rust/src/services/chunker.rs`) computes a deterministic `job_id = SHA-1(fingerprint + res + start + end)`. If `tmp/segments-rust/<job_id>/init.mp4` exists the job is restored from cache; otherwise a new ffmpeg process spawns and a `notify::RecommendedWatcher` starts tracking segment files. The `transcode.job` span covers the full ffmpeg lifetime (probe + encode) and closes on `transcode_complete`, `transcode_error`, or `transcode_killed`.
4. The client opens a `chunk.stream` span and calls `StreamingService.start(jobId, …, ctx)`. `ctx` is propagated as `traceparent`, so the server's `stream.request` span nests under the client's `chunk.stream`. On span end it records `chunk.bytes_streamed` and `chunk.segments_received` — giving per-chunk bandwidth in a single Seq query.
5. `GET /stream/<jobId>` waits up to 60 s for `init.mp4`, writes it length-prefixed, then loops over newly-appearing `segment_NNNN.m4s` files.
6. `StreamingService` accumulates bytes, extracts complete frames by the 4-byte length prefix, and calls `onSegment(data, isInit)` back into `BufferManager`.
7. `BufferManager.appendSegment` serialises `SourceBuffer.appendBuffer` calls through a queue. After each append it runs `evictBackBuffer()`, `checkForwardBuffer()`, and the `afterAppendCb`.
8. Once `bufferedEnd >= clientConfig.playback.startupBufferS (2s)`, `video.play()` is called and `status` flips to `playing`.

### Chunk chaining

When the current chunk stream finishes, `startChunkSeries` chains to the next one. A RAF prefetch loop fires the next chunk's `startTranscode` mutation when `currentTime > chunkEnd - clientConfig.playback.prefetchThresholdS (90 s)`. Because the first ramp chunk is only 10 s, `chunkEnd − 90` is negative — the prefetch fires immediately after play starts, so chunk 2 begins encoding in parallel with chunk 1's fill, re-entering the ramp at the next step (15 s). Prefetch requests open their own `transcode.request` span with `chunk.is_prefetch = true`, so Seq queries can separate prefetch RTT from on-demand RTT. Continuation chunks **must re-append their init segment** (each chunk is a fresh ffmpeg encode with its own `avcC` metadata); the `SourceBuffer` (in `mode="segments"`, NOT `"sequence"`) places each segment by its TFDT so chunks stitch seamlessly. See [`02-Chunk-Pipeline-Invariants.md`](02-Chunk-Pipeline-Invariants.md) for the full set of rules.

### Connection-aware ffmpeg lifecycle

`ActiveJob.connections` tracks open `/stream/:jobId` HTTP connections:

- `add_connection(id)` increments on stream open.
- `remove_connection(id)` decrements on disconnect, stream completion, or the 90 s idle timeout.
- When `connections` drops to `0` while the job is still `running`, `pool.kill_job(id, KillReason::OrphanNoConnection)` sends `SIGTERM` to ffmpeg.

ffmpeg dies within seconds of the last tab closing — no zombies. `chunker::start_transcode_job` also enforces `config.transcode.max_concurrent_jobs` (default 3); a fourth simultaneous transcode returns a `CAPACITY_EXHAUSTED` typed error, surfaced as a playback error. Cap accounting (live, dying, inflight) lives in `server-rust/src/services/ffmpeg_pool.rs` — see [`06-FfmpegPool.md`](06-FfmpegPool.md).

## Scenario 2: Back-pressure (pause and resume)

![Back-pressure pause/resume sequence diagram](../../diagrams/streaming-02-backpressure.png)

> Source: [`streaming-02-backpressure.mmd`](../../diagrams/streaming-02-backpressure.mmd)

Once the steady-state append loop is running, `BufferManager.checkForwardBuffer` runs after every append. If `bufferedAhead > clientConfig.buffer.forwardTargetS (60 s)` it opens a `buffer.halt` span (parented on `playback.session` so it survives chunk boundaries) and calls `StreamingService.pause()`, which suspends the fetch loop on a `resumeResolve` promise — no further `reader.read()` calls are issued, so TCP back-pressure propagates all the way to the server's write loop and ffmpeg throttles naturally.

As the `<video>` element plays and `timeupdate` fires, `bufferedAhead` drains. When it falls below `clientConfig.buffer.forwardResumeS (20 s)`, the `BufferManager` calls `StreamingService.resume()`, which resolves the promise and reawakens `reader.read()`, and closes the `buffer.halt` span with `buffer.buffered_ahead_s_at_resume` recorded. The 60 s / 20 s split is a 40-second hysteresis gap — wide enough that each pause/drain cycle lasts ~40 s and cycles don't chain back-to-back at steady state, so one halt = one span and the span duration reads directly as the stall length. Seeks and teardowns close the span early via a `halt_ended_by_seek` or `halt_ended_by_teardown` event. See [`../Streaming/00-Protocol.md#hysteresis-tuning-the-gap`](./00-Protocol.md#hysteresis-tuning-the-gap) for the considerations behind those numbers.

## Scenario 3: Seek

![Seek sequence diagram](../../diagrams/streaming-03-seek.png)

> Source: [`streaming-03-seek.mmd`](../../diagrams/streaming-03-seek.mmd)

When the user drags the slider, `VideoPlayer` forwards a `SeekRequested` Nova event to `PlaybackController.seekTo(t)`, which sets `video.currentTime = t`. The DOM then fires the `seeking` event back into `PlaybackController.handleSeeking`.

If `t` lies within the current `SourceBuffer`'s buffered range, playback resumes naturally — no network activity. Otherwise:

1. `StreamingService.cancel()` aborts the current fetch.
2. `chunkEnd` is reset to `0` synchronously at the top of the seek handler (before any async work) to prevent the RAF prefetch loop from firing a stale chunk request while the seek is in flight.
3. `BufferManager.seek(t)` flushes the `SourceBuffer` (`remove(0, Infinity)`), resets `timestampOffset`, and sets `video.currentTime = t`.
4. `RampController.reset()` rewinds the ramp cursor so the seek benefits from the cold-start curve — the next chunk will use `chunkRampS[0]` again.
5. `startTranscode(videoId, res, seekTime, seekChunkEnd)` fires the seek chunk at the user's actual seek position (no snapping). The duration comes from the (now-reset) ramp, so the first chunk after a seek is fast. `seekChunkEnd = seekTime + rampController.next()` — for `seekTime > 0` mid-file seeks, the ramp typically completes before reaching the next canonical 300 s boundary, so continuation chunks eventually land back on a grid-friendly boundary for efficient cache reuse during forward play.

**Seek-anchored behavior:** seeks anchor at the user's exact click position (no snap-back). ffmpeg runs with `-ss seekTime` so segment 0 of the produced fMP4 *is* the user's first useful frame. The duration model means mid-file seeks (`seekTime > 0`) still enjoy the fast first-frame optimization while keeping cache-friendly boundaries for continuation chunks.

## Scenario 4: Resolution switch (background buffer)

![Resolution switch sequence diagram](../../diagrams/streaming-04-resolution-switch.png)

> Source: [`streaming-04-resolution-switch.mmd`](../../diagrams/streaming-04-resolution-switch.mmd)

MSE's `SourceBuffer` can only be initialised with one MIME type / resolution profile for its lifetime. Switching resolution mid-playback therefore requires a fresh `MediaSource` — but tearing down the live one would blank the screen. Instead a second `BufferManager` is created offscreen:

1. `PlaybackController.switchResolution(newRes)` snaps the current playhead to the nearest chunk boundary (`chunkStart`).
2. `bgBuffer.initBackground()` creates a `MediaSource` attached to an offscreen `<video>`, returning a `bgObjectUrl`. `sourceopen` fires and the background `SourceBuffer` is armed without disturbing the visible `<video>`.
3. A new transcode job starts at `(videoId, newRes, chunkStart, chunkStart + 300)` and streams silently into `bgBuffer`.
4. A RAF loop polls `bgBuffer.bufferedEnd`. When it clears `clientConfig.playback.startupBufferS (2s)`:
   - The foreground stream is cancelled and its `BufferManager` torn down (releasing the foreground object URL).
   - `video.src = bgObjectUrl`, `video.currentTime = playhead`, `video.play()`.
   - The background buffer is promoted to foreground.

The user sees a brief pause (< 1 s for lower resolutions) while `bgBuffer` fills — no flash of blank video.
