# Architecture

## Overview

tvke is split into two workspaces: a Bun server and an Rsbuild/React client. The server handles media indexing, video transcoding, and streaming. The client renders a browsable library and a streaming video player.

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
│         tmp/segments/<jobId>/            SQLite (tmp/tvke.db)  │ │
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

The client drives transcoding in **300-second chunks** rather than encoding the full video upfront. Each chunk is a separate ffmpeg job covering a time window `[startS, endS)`.

```
User clicks Play (resolution selected)
      │
      ▼
useChunkedPlayback.startPlayback(res)
  → BufferManager.init(mimeType)        ← creates MediaSource, arms SourceBuffer
  → startChunkSeries(res, 0, buffer)    ← fires chunk [0s, 300s)
  → startPrefetchLoop(res, buffer)      ← RAF loop watching for prefetch trigger
      │
      ▼
startChunkSeries → startTranscode mutation → POST /graphql
  variables: { videoId, resolution, startTimeSeconds: 0, endTimeSeconds: 300 }
      │
      ▼
Server: chunker.startTranscodeJob(videoId, res, start, end)
  → jobId = SHA-1(fingerprint + res + start + end)  ← deterministic (cache-friendly)
  → if tmp/segments/<jobId>/init.mp4 exists → restore from cache (no new ffmpeg)
  → else: mkdir, insertJob, setJob(connections=0), ffmpeg, watchSegments()
      │
      ▼
Server: stream.ts GET /stream/<jobId>
  → addConnection(jobId)                ← increment connection counter
  → wait up to 60s for initSegmentPath
  → writeLengthPrefixed(init.mp4)
  → loop: writeLengthPrefixed(segment_NNNN.m4s) as they appear
  → on client disconnect: removeConnection; if connections=0 → killJob(ffmpeg)
  → on 90s idle timeout: removeConnection; if connections=0 → killJob(ffmpeg)
      │
      ▼
Client: StreamingService.start()
  → fetch /stream/<jobId>
  → ReadableStream reader.read() loop
  → accumulate bytes, extract complete frames by length prefix
  → onSegment(data, isInit) callback
      │
      ▼
Client: BufferManager.appendSegment(data)
  → SourceBuffer.appendBuffer(data) via serialised queue
  → after each append: evictBackBuffer(), checkForwardBuffer(), afterAppendCb?.()
      │
      ▼
First chunk, first media segment:
  afterAppendCb = tryStart()
  → if bufferedEnd >= STARTUP_BUFFER_S[res] → video.play(), status = "playing"
  → RAF loop fires as fallback for slow live-transcode paths
      │
      ▼
Browser MSE decoder → <video> element renders

During playback (RAF prefetch loop):
  → when video.currentTime > chunkEnd - 60s:
       fire startTranscode for next chunk [300s, 600s) (prefetch)
  → when chunk stream ends → chain to next chunk using prefetched jobId
```

### Chunk Chaining

When the current chunk stream finishes, `startChunkSeries` chains to the next chunk. If prefetch fired in time, the next job's ID is already available (`nextJobIdRef`) — no mutation RTT before streaming begins. If prefetch hasn't fired yet, a new mutation is fired on demand.

Continuation chunks skip re-appending the init segment; the SourceBuffer (in `mode="sequence"`) picks up the new media segments seamlessly.

### Connection-Aware ffmpeg Lifecycle

`ActiveJob.connections` tracks how many `/stream/:jobId` HTTP connections are open for each job:
- `addConnection(id)` increments on stream open.
- `removeConnection(id)` decrements on disconnect, stream completion, or idle timeout.
- When `connections` drops to `0` and the job is still `running`, `killJob(id)` sends `SIGTERM` to the ffmpeg process.

This means ffmpeg is killed within seconds of the last tab closing — no zombie processes.

**Concurrent stream limit:** `chunker.startTranscodeJob` enforces `MAX_CONCURRENT_JOBS = 3`. A fourth simultaneous transcode throws `"Too many concurrent streams"`, surfaced as a playback error.

### Seek Behaviour

On `"seeking"` event:
1. Cancel the active `StreamingService`.
2. `BufferManager.seek(snapTime)` — flushes the SourceBuffer and sets `video.currentTime`.
3. Snap the seek position to the chunk boundary: `Math.floor(seekTime / 300) * 300`.
4. `startChunkSeries(res, snapTime, buffer)` — starts a new chunk at the boundary.

Snapping to a boundary ensures the new job aligns with cached segment directories.

### Resolution Switch (Background Buffer)

When the user selects a different resolution while playing:
1. A second `BufferManager` (`bgBuffer`) is initialised with `initBackground()` — attached to a temporary offscreen video element so `sourceopen` fires without affecting the live `<video>`.
2. A new chunk job starts at the current chunk boundary, streaming into `bgBuffer` silently.
3. A RAF loop polls `bgBuffer.bufferedEnd`. When it reaches `STARTUP_BUFFER_S[newRes]`:
   - The foreground stream is cancelled and its `BufferManager` torn down.
   - `video.src` is swapped to the background buffer's object URL.
   - `video.currentTime` is restored; `video.play()` is called.
   - The background buffer is promoted to foreground.

The viewer experiences a brief pause (typically < 1s for lower resolutions) while the background buffer fills.

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
