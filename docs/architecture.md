# Architecture

## Overview

xstream is split into two workspaces: a Bun server and an Rsbuild/React client. The server handles media indexing, video transcoding, and streaming. The client renders a browsable library and a streaming video player.

> **Note on the server implementation:** The Bun/JS server is a prototype for rapid architecture validation. A Rust rewrite is planned for production performance at 4K bitrates. The GraphQL schema and the `/stream/:jobId` binary protocol are the stable contracts — the client will require no changes across the rewrite provided these interfaces stay compatible. See `CLAUDE.md` for the exact compatibility requirements.

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (React + Relay + Rsbuild :5173)                         │
│                                                                 │
│  LibraryPage ──── GraphQL query ──────────────────────────────┐ │
│  PlayerPage  ──── GraphQL mutation (startTranscode) ─────────┐│ │
│  VideoPlayer ──── GET /stream/:jobId (binary HTTP) ─────────┐││ │
│  BufferManager ── MSE SourceBuffer append ─────────────────┐│││ │
│                                                            ││││ │
└────────────────────────────────────────────────────────────┼┼┼┼─┘
                                                             ││││
                         HTTP/WebSocket                      ││││
┌────────────────────────────────────────────────────────────┼┼┼┼─┐
│  Server (Bun :3001)                                        ││││ │
│                                                            ││││ │
│  POST /graphql ── graphql-yoga ── resolvers ───────────────┘│││ │
│  WS  /graphql  ── graphql-yoga ── subscriptions ────────────┘││ │
│  GET /stream/:jobId ── stream.ts ────────────────────────────┘│ │
│                              │                                 │ │
│                         jobStore (memory)                      │ │
│                              │                                 │ │
│              ┌───────────────┴──────────────────┐              │ │
│              │                                  │              │ │
│         chunker.ts                        libraryScanner.ts    │ │
│         ffmpeg → .m4s segments            ffprobe → DB         │ │
│              │                                  │              │ │
│         tmp/segments/<jobId>/            SQLite (tmp/xstream.db)  │ │
│                                                │              │ │
│                                         db/queries/           │ │
└───────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### Server

| Component | File | Responsibility |
|---|---|---|
| Entry point | `src/index.ts` | Startup sequence, `Bun.serve()`, route dispatch |
| Config | `src/config.ts` | Dev/prod AppConfig, resolution profiles, mediaFiles.json loader |
| DB connection | `src/db/index.ts` | SQLite singleton with WAL mode and foreign keys enabled; `closeDb()` for graceful shutdown |
| Migrations | `src/db/migrate.ts` | Idempotent schema creation on every startup |
| Query layer | `src/db/queries/` | All SQL — one file per table |
| Library scanner | `src/services/libraryScanner.ts` | Walks media directories, runs ffprobe + content fingerprint concurrently per file, upserts DB |
| Scan store | `src/services/scanStore.ts` | In-memory scan state pub/sub; exposes `isScanRunning`, `markScanStarted/Ended`, async `subscribeToScan()` |
| Chunker | `src/services/chunker.ts` | Manages ffmpeg jobs, watches output dir, updates jobStore + DB; `killAllActiveJobs()` for graceful shutdown |
| Job store | `src/services/jobStore.ts` | In-memory map of active jobs (source of truth for streaming) |
| GraphQL handler | `src/routes/graphql.ts` | graphql-yoga instance with schema and CORS config |
| Stream handler | `src/routes/stream.ts` | Reads segments from jobStore, writes length-prefixed binary frames |
| Schema | `src/graphql/schema.ts` | SDL type definitions |
| Relay helpers | `src/graphql/relay.ts` | `toGlobalId` / `fromGlobalId` |
| Enum mappers | `src/graphql/mappers.ts` | Converts between GQL enum strings and internal values |
| Resolvers | `src/graphql/resolvers/` | Query, Mutation, Subscription implementations |

### Client

| Component | File | Responsibility |
|---|---|---|
| Entry | `src/main.tsx` | Mounts providers: Relay, `NovaEventingProvider` (`AppEventing`), Router |
| Router | `src/router.tsx` | `/` → LibraryPage, `/play/:videoId` → PlayerPage |
| Relay env | `src/relay/environment.ts` | HTTP fetch + WebSocket subscribe network layer |
| Library page | `src/pages/LibraryPage.tsx` | Queries all libraries, renders grids, subscribes to scan state for live spinner |
| Player page | `src/pages/PlayerPage.tsx` | Loads video metadata, renders VideoPlayer |
| Library grid | `src/components/library-grid/LibraryGrid.tsx` | Relay fragment over a Library's videos connection |
| Video card | `src/components/video-card/VideoCard.tsx` | Relay fragment, clickable tile with title + duration |
| Video player | `src/components/video-player/VideoPlayer.tsx` | `NovaEventingInterceptor` for ControlBar events; delegates MSE + transcoding to `useChunkedPlayback` |
| Control bar | `src/components/control-bar/ControlBar.tsx` | Seek slider, play/pause, resolution selector; raises events via `useNovaEventing().bubble()` |
| Control bar events | `src/components/control-bar/ControlBar.events.ts` | Event type constants, factory functions, and type guards for ControlBar events |
| Chunked playback hook | `src/hooks/useChunkedPlayback.ts` | Client-driven chunk scheduling, prefetch, seek restart, resolution switch via background buffer |
| Streaming service | `src/services/StreamingService.ts` | Fetch loop, length-prefix frame parser, pause/resume/cancel |
| Buffer manager | `src/services/BufferManager.ts` | MSE SourceBuffer wrapper, sliding window eviction, back-pressure, `setAfterAppend` notification |

---

## Startup Sequence

1. `src/index.ts` reads `config.ts` based on `NODE_ENV`
2. `tmp/segments/` directory created if missing
3. `getDb()` opens SQLite connection, enables WAL + foreign keys, runs `migrate.ts`
4. `restoreInterruptedJobs()` inspects any `transcode_jobs` rows with `status = 'running'`: jobs with segments on disk are restored into memory and marked `complete`; jobs with no segments are marked `error`
5. Continuous scan loop starts (background async loop): `while(true) { scanLibraries(); sleep(scanIntervalMs) }` — runs immediately then repeats every `config.scanIntervalMs` (default 30s)
6. `Bun.serve()` starts on configured port

### Graceful Shutdown

SIGTERM and SIGINT handlers call `shutdown()`:
1. `killAllActiveJobs()` — sends SIGTERM to every running ffmpeg process
2. `closeDb()` — closes the SQLite connection (flushes WAL)
3. `process.exit(0)`

In-progress transcode jobs are left in `status='running'` in the DB so `restoreInterruptedJobs()` handles them correctly on the next startup.

---

## Data Flow: Library Scan

```
Continuous loop (every scanIntervalMs, default 30s)
      │
      ▼
loadMediaConfig() → filter by env → validate path exists
      │
      ▼
walkDirectory() → yield video file paths (async generator, depth-first)
      │
      ▼  ← for each file, launched concurrently via Promise.all
stat(filePath)
      │
      ├── ffprobe(filePath)  ─────────────────────────┐  (concurrent)
      └── computeContentFingerprint(filePath, size)  ─┘
                │
                ▼
upsertLibrary() → libraries table
upsertVideo()   → videos table   (keyed on path, includes content_fingerprint)
replaceVideoStreams() → video_streams table
```

The content fingerprint is `"<sizeBytes>:<sha1hex>"` over the first 64 KB of the file. It is stable across renames/moves and changes only when file content changes. Transcode job IDs are derived from the fingerprint rather than the file path, so the segment cache survives file renames.

## Data Flow: Playback

The client drives transcoding in **300-second chunks** rather than encoding the full video upfront. Each chunk is a separate ffmpeg job covering a time window `[startS, endS)`. Four distinct flows cover the pipeline end-to-end: initial playback, back-pressure, seek, and resolution switch. Each has its own sequence diagram below; the `.mmd` sources are authoritative and can be re-rendered in draw.io via the `open_drawio_mermaid` MCP tool.

### Scenario 1: Initial playback (happy path)

![Initial playback sequence diagram](./diagrams/streaming-01-initial-playback.png)

> Source: [`streaming-01-initial-playback.mmd`](./diagrams/streaming-01-initial-playback.mmd)

`useChunkedPlayback.startPlayback(res)` opens the `playback.session` span and drives the boot sequence:

1. `BufferManager.init(mimeType)` creates a `MediaSource` and arms a `SourceBuffer`.
2. The `startTranscode` GraphQL mutation hands the server a `(videoId, resolution, 0, 300)` window.
3. `chunker.startTranscodeJob` computes a deterministic `jobId = SHA-1(fingerprint + res + start + end)`. If `tmp/segments/<jobId>/init.mp4` exists the job is restored from cache; otherwise a new ffmpeg process spawns and `fs.watch` starts tracking segment files.
4. The client opens a `chunk.stream` span and calls `StreamingService.start(jobId, …, ctx)`. `ctx` is propagated as `traceparent`, so the server's `stream.request` span nests under the client's `chunk.stream`.
5. `GET /stream/<jobId>` waits up to 60 s for `init.mp4`, writes it length-prefixed, then loops over newly-appearing `segment_NNNN.m4s` files.
6. `StreamingService` accumulates bytes, extracts complete frames by the 4-byte length prefix, and calls `onSegment(data, isInit)` back into `BufferManager`.
7. `BufferManager.appendSegment` serialises `SourceBuffer.appendBuffer` calls through a queue. After each append it runs `evictBackBuffer()`, `checkForwardBuffer()`, and the `afterAppendCb`.
8. Once `bufferedEnd >= STARTUP_BUFFER_S[res]`, `video.play()` is called and `status` flips to `playing`.

#### Chunk chaining

When the current chunk stream finishes, `startChunkSeries` chains to the next one. A RAF prefetch loop fires the next chunk's `startTranscode` mutation when `currentTime > chunkEnd - 60s`, so the next `jobId` is usually already in hand (`nextJobIdRef`) — no mutation RTT before streaming resumes. Continuation chunks skip re-appending the init segment; the `SourceBuffer` (in `mode="sequence"`) picks up seamlessly.

#### Connection-aware ffmpeg lifecycle

`ActiveJob.connections` tracks open `/stream/:jobId` HTTP connections:
- `addConnection(id)` increments on stream open.
- `removeConnection(id)` decrements on disconnect, stream completion, or the 90 s idle timeout.
- When `connections` drops to `0` while the job is still `running`, `killJob(id)` sends `SIGTERM` to ffmpeg.

ffmpeg dies within seconds of the last tab closing — no zombies. `chunker.startTranscodeJob` also enforces `MAX_CONCURRENT_JOBS = 3`; a fourth simultaneous transcode throws `"Too many concurrent streams"`, surfaced as a playback error.

### Scenario 2: Back-pressure (pause and resume)

![Back-pressure pause/resume sequence diagram](./diagrams/streaming-02-backpressure.png)

> Source: [`streaming-02-backpressure.mmd`](./diagrams/streaming-02-backpressure.mmd)

Once the steady-state append loop is running, `BufferManager.checkForwardBuffer` runs after every append. If `bufferedAhead > FORWARD_TARGET_S (20 s)` it calls `StreamingService.pause()`, which suspends the fetch loop on a `resumeResolve` promise — no further `reader.read()` calls are issued, so TCP back-pressure propagates all the way to the server's write loop and ffmpeg throttles naturally.

As the `<video>` element plays and `timeupdate` fires, `bufferedAhead` drains. When it falls below `RESUME_THRESHOLD_S (15 s)`, `BufferManager` calls `StreamingService.resume()`, which resolves the promise and reawakens `reader.read()`. The 20 s / 15 s split is a hysteresis band to avoid thrashing on the boundary.

### Scenario 3: Seek

![Seek sequence diagram](./diagrams/streaming-03-seek.png)

> Source: [`streaming-03-seek.mmd`](./diagrams/streaming-03-seek.mmd)

When the user drags the slider, `VideoPlayer` forwards a `SeekRequested` Nova event to `PlaybackController.seekTo(t)`, which sets `video.currentTime = t`. The DOM then fires the `seeking` event back into `PlaybackController.handleSeeking`.

If `t` lies within the current `SourceBuffer`'s buffered range, playback resumes naturally — no network activity. Otherwise:

1. `snapTime = Math.floor(t / 300) * 300` aligns the restart to a chunk boundary so the new job shares a cache directory with any existing `(videoId, res, snapTime)` job.
2. `StreamingService.cancel()` aborts the current fetch.
3. `BufferManager.seek(snapTime)` flushes the `SourceBuffer` (`remove(0, Infinity)`), resets `timestampOffset`, and sets `video.currentTime`.
4. `startTranscode(videoId, res, snapTime, snapTime + 300)` re-enters the Scenario 1 flow from the GraphQL step onward.

### Scenario 4: Resolution switch (background buffer)

![Resolution switch sequence diagram](./diagrams/streaming-04-resolution-switch.png)

> Source: [`streaming-04-resolution-switch.mmd`](./diagrams/streaming-04-resolution-switch.mmd)

MSE's `SourceBuffer` can only be initialised with one MIME type / resolution profile for its lifetime. Switching resolution mid-playback therefore requires a fresh `MediaSource` — but tearing down the live one would blank the screen. Instead a second `BufferManager` is created offscreen:

1. `PlaybackController.switchResolution(newRes)` snaps the current playhead to the nearest chunk boundary (`chunkStart`).
2. `bgBuffer.initBackground()` creates a `MediaSource` attached to an offscreen `<video>`, returning a `bgObjectUrl`. `sourceopen` fires and the background `SourceBuffer` is armed without disturbing the visible `<video>`.
3. A new transcode job starts at `(videoId, newRes, chunkStart, chunkStart + 300)` and streams silently into `bgBuffer`.
4. A RAF loop polls `bgBuffer.bufferedEnd`. When it clears `STARTUP_BUFFER_S[newRes]`:
   - The foreground stream is cancelled and its `BufferManager` torn down (releasing the foreground object URL).
   - `video.src = bgObjectUrl`, `video.currentTime = playhead`, `video.play()`.
   - The background buffer is promoted to foreground.

The user sees a brief pause (< 1 s for lower resolutions) while `bgBuffer` fills — no flash of blank video.

---

## Binary Framing Protocol

The `/stream/:jobId` endpoint sends a continuous octet-stream. Each segment is framed as:

```
┌──────────────────────────────────────┐
│  4 bytes: uint32 big-endian length N │
├──────────────────────────────────────┤
│  N bytes: fMP4 segment data          │
└──────────────────────────────────────┘
```

The first frame is always the init segment (contains the `moov` box — codec and track metadata). All subsequent frames are media segments (`moof` + `mdat` boxes).

The client accumulates incoming `Uint8Array` chunks from the `ReadableStream`, reads the 4-byte header, waits until the full segment is buffered, extracts it, then advances the buffer pointer.

See `docs/Streaming Protocol.md` for full detail.
