# Architecture

## Overview

tvke is split into two workspaces: a Bun server and a Vite/React client. The server handles media indexing, video transcoding, and streaming. The client renders a browsable library and a streaming video player.

> **Note on the server implementation:** The Bun/JS server is a prototype for rapid architecture validation. A Rust rewrite is planned for production performance at 4K bitrates. The GraphQL schema and the `/stream/:jobId` binary protocol are the stable contracts — the client will require no changes across the rewrite provided these interfaces stay compatible. See `CLAUDE.md` for the exact compatibility requirements.

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (React + Relay + Vite :5173)                            │
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
| Entry | `src/main.tsx` | Mounts providers: Relay, Chakra, `NovaEventingProvider` (`AppEventing`), Router |
| Router | `src/router.tsx` | `/` → LibraryPage, `/play/:videoId` → PlayerPage |
| Relay env | `src/relay/environment.ts` | HTTP fetch + WebSocket subscribe network layer |
| Library page | `src/pages/LibraryPage.tsx` | Queries all libraries, renders grids, subscribes to scan state for live spinner |
| Player page | `src/pages/PlayerPage.tsx` | Loads video metadata, renders VideoPlayer |
| Library grid | `src/components/LibraryGrid.tsx` | Relay fragment over a Library's videos connection |
| Video card | `src/components/VideoCard.tsx` | Relay fragment, clickable tile with title + duration |
| Video player | `src/components/VideoPlayer.tsx` | `NovaEventingInterceptor` for ControlBar events; delegates MSE + transcoding to `useVideoPlayback` |
| Control bar | `src/components/ControlBar.tsx` | Seek slider, play/pause, resolution selector; raises events via `useNovaEventing().bubble()` |
| Control bar events | `src/components/ControlBar.events.ts` | Event type constants, factory functions, and type guards for ControlBar events |
| Streaming service | `src/services/StreamingService.ts` | Fetch loop, length-prefix frame parser, pause/resume/cancel |
| Buffer manager | `src/services/BufferManager.ts` | MSE SourceBuffer wrapper, sliding window eviction, back-pressure |

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

```
User clicks Play (resolution selected)
      │
      ▼
VideoPlayer → startTranscode mutation → POST /graphql
      │
      ▼
Server: chunker.startTranscodeJob()
  → mkdir tmp/segments/<jobId>/
  → insertJob() into DB
  → setJob() into jobStore
  → ffmpeg command (async)
  → watchSegments() monitors output dir
      │
      ▼
Server: stream.ts GET /stream/<jobId>
  → wait for initSegmentPath
  → writeLengthPrefixed(init.mp4)
  → loop: writeLengthPrefixed(segment_NNNN.m4s) as they appear
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
  → first call: SourceBuffer.appendBuffer(initData)  ← mandatory first
  → subsequent calls: SourceBuffer.appendBuffer(mediaData)
  → after each append: evictBackBuffer(), checkForwardBuffer()
      │
      ▼
Browser MSE decoder → <video> element renders
```

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

See `docs/streaming-protocol.md` for full detail.
