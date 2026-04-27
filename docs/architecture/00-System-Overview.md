# System Overview

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
| Chunker | `src/services/chunker.ts` | Manages ffmpeg jobs, watches output dir, updates jobStore + DB. Process-pool concerns (cap, kill/SIGKILL escalation, `killAllJobs()` for graceful shutdown) live in `src/services/ffmpegPool.ts`. |
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
| Library film list row | `src/components/library-film-list-row/LibraryFilmListRow.tsx` | Relay fragment (`LibraryFilmListRow_video`) over a single video in a library list; raises `FilmSelected` event on click |
| Film row | `src/components/film-row/FilmRow.tsx` | Relay fragment (`FilmRow_video`); richer list row used in the detail view — title, filename, duration, file size, edit/play actions |
| Film detail pane | `src/components/film-detail-pane/FilmDetailPane.tsx` | Relay fragment + match/unmatch mutations; side-panel with poster, OMDb metadata, `LinkSearch` for re-matching |
| Video player | `src/components/video-player/VideoPlayer.tsx` | `NovaEventingInterceptor` for ControlBar events; delegates MSE + transcoding to `useChunkedPlayback` |
| Control bar | `src/components/control-bar/ControlBar.tsx` | Seek slider, play/pause, resolution selector; raises events via `useNovaEventing().bubble()` |
| Control bar events | `src/components/control-bar/ControlBar.events.ts` | Event type constants, factory functions, and type guards for ControlBar events |
| Chunked playback hook | `src/hooks/useChunkedPlayback.ts` | Client-driven chunk scheduling, prefetch, seek restart, resolution switch via background buffer |
| Streaming service | `src/services/streamingService.ts` | Fetch loop, length-prefix frame parser, pause/resume/cancel |
| Buffer manager | `src/services/bufferManager.ts` | MSE SourceBuffer wrapper, sliding window eviction, back-pressure, `setAfterAppend` notification |
