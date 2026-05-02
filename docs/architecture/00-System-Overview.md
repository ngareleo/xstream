# System Overview

xstream is split into two workspaces: a Rust server and an Rsbuild/React client. The server handles media indexing, video transcoding, and streaming. The client renders a browsable library and a streaming video player.

> **Note on the server implementation:** The server is written in Rust for production performance at 4K bitrates. The GraphQL schema and the `/stream/:jobId` binary protocol are stable interfaces. See `CLAUDE.md` for the exact interface compatibility details.

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
│  Server (Rust :3002)                                       ││││ │
│                                                            ││││ │
│  POST /graphql ── async-graphql + axum ── resolvers ──────┘│││ │
│  WS  /graphql  ── async-graphql + axum ── subscriptions ───┘││ │
│  GET /stream/:jobId ── routes::stream ──────────────────────┘│ │
│                              │                                 │ │
│                         job_store (memory)                     │ │
│                              │                                 │ │
│              ┌───────────────┴──────────────────┐              │ │
│              │                                  │              │ │
│         chunker                       library_scanner          │ │
│         ffmpeg → .m4s segments       ffprobe → DB             │ │
│              │                                  │              │ │
│         tmp/segments/<jobId>/           SQLite (tmp/xstream.db)  │ │
│                                                │              │ │
│                                         db/queries/           │ │
└───────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Server

| Component | File | Responsibility |
|---|---|---|
| Entry point | `src/main.rs` | Startup sequence, axum server bind, route dispatch |
| Config | `src/config.rs` | Dev/prod AppConfig, resolution profiles |
| DB connection | `src/db/mod.rs` | SQLite singleton with WAL mode and foreign keys enabled; graceful shutdown handling |
| Migrations | `src/db/migrate.rs` | Idempotent schema creation on every startup |
| Query layer | `src/db/queries/` | All SQL — one module per table |
| Library scanner | `src/services/library_scanner.rs` | Walks media directories, runs ffprobe + content fingerprint concurrently per file, upserts DB |
| Scan state | `src/services/scan_state.rs` | In-memory scan state pub/sub; exposes scan running status and subscription |
| Chunker | `src/services/chunker.rs` | Manages ffmpeg jobs, watches output dir, updates job_store + DB. Process-pool concerns (cap, kill/SIGKILL escalation) live in `src/services/ffmpeg_pool.rs`. |
| Job store | `src/services/job_store.rs` | In-memory map of active jobs (source of truth for streaming) |
| GraphQL handler | `src/routes/graphql.rs` | async-graphql + axum integration with schema and CORS config |
| Stream handler | `src/routes/stream.rs` | Reads segments from job_store, writes length-prefixed binary frames |
| Schema | `src/graphql/mod.rs` | async-graphql schema with derive macros |
| Relay helpers | `src/relay.rs` | `to_global_id` / `from_global_id` |
| Resolvers | `src/graphql/query.rs`, `src/graphql/mutation.rs`, `src/graphql/subscription.rs` | Query, Mutation, Subscription implementations |

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
