# GraphQL Schema

The server exposes a single GraphQL endpoint at `POST /graphql` (queries and mutations). Subscriptions are served over WebSocket via async-graphql's built-in WebSocket transport using the `graphql-ws` subprotocol.

## SDL emission — the client's contract

The Rust `Schema<Query, Mutation, Subscription>` is the source of truth. The wire SDL the React client sees is generated from it via the `print_schema` binary in `server-rust/src/bin/print_schema.rs`:

```sh
bun run schema:emit
# → cargo run --bin print_schema -p xstream-server > server-rust/schema.graphql
```

`server-rust/schema.graphql` is **checked in** so `relay-compiler` can read it without booting the server. `client/relay.config.json` points at the file via `../server-rust/schema.graphql`. CI's `server-rust` job runs the same binary and diffs against the checked-in copy — drift fails the build with a hint to run `bun run schema:emit`.

Run `bun run schema:emit` after any change that affects SDL output (new field, renamed type, changed nullability, enum variant added) and commit the regenerated `server-rust/schema.graphql` alongside the Rust change.

---

## Relay Compliance

Relay imposes three requirements on the server schema:

1. **Node interface** — every queryable object type implements `Node { id: ID! }` where `id` is a globally unique, opaque base64-encoded string.

2. **Global object identification** — the `Query` root must expose `node(id: ID!): Node`. Relay uses this to refetch any object by its global ID.

3. **Cursor-based connections** — list fields use the connection pattern (`VideoConnection`, `VideoEdge`, `PageInfo`) instead of plain arrays. This enables Relay's pagination and cache merging.

### Global ID encoding

IDs are encoded as `base64("TypeName:localId")`:

```
Video:abc123def456  →  base64  →  VmlkZW86YWJjMTIzZGVmNDU2
```

The server encodes with `to_global_id(type, id)` and decodes with `from_global_id(global_id)` in `server-rust/src/relay.rs`. The `node` query uses the decoded type name to route to the correct DB query.

---

## Full Schema

```graphql
interface Node {
  id: ID!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

# ── Library ───────────────────────────────────────────────────────────────────

enum MediaType {
  MOVIES
  TV_SHOWS
}

type Library implements Node {
  id: ID!
  name: String!
  mediaType: MediaType!
  videos(first: Int, after: String): VideoConnection!
}

# ── Video ────────────────────────────────────────────────────────────────────

type Video implements Node {
  id: ID!
  title: String!
  filename: String!
  durationSeconds: Float!
  fileSizeBytes: Int!
  bitrate: Int!
  library: Library!
  videoStream: VideoStreamInfo
  audioStream: AudioStreamInfo
}

### Forward note — nativeResolution

The `Video` type will gain a `nativeResolution: Resolution!` field sourced from a new `videos.native_resolution` DB column populated at scan time via ffprobe height → closest-ladder-rung mapping (rounds DOWN). The field is non-null at the boundary; the column is nullable in DB for backward compatibility with rows scanned before the column existed.

type VideoStreamInfo {
  codec: String!
  width: Int!
  height: Int!
  fps: Float!
}

type AudioStreamInfo {
  codec: String!
  channels: Int!
  sampleRate: Int!
}

type VideoConnection {
  edges: [VideoEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type VideoEdge {
  node: Video!
  cursor: String!
}

# ── Transcode Job ─────────────────────────────────────────────────────────────

enum Resolution {
  RESOLUTION_240P
  RESOLUTION_360P
  RESOLUTION_480P
  RESOLUTION_720P
  RESOLUTION_1080P
  RESOLUTION_4K
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETE
  ERROR
}

enum PlaybackErrorCode {
  CAPACITY_EXHAUSTED
  VIDEO_NOT_FOUND
  PROBE_FAILED
  ENCODE_FAILED
  INTERNAL
  MSE_DETACHED
}

"""
Returned by startTranscode when a known failure mode prevents the job from
being created or completed. retryable=true means the client should back off
and retry; retryAfterMs is a hint (absent for non-capacity errors).
"""
type PlaybackError {
  code: PlaybackErrorCode!
  message: String!
  retryable: Boolean!
  retryAfterMs: Int
}

"""
Discriminated union returned by startTranscode. On success the job node is
returned; on known failure a PlaybackError is returned instead of throwing.
"""
union StartTranscodeResult = TranscodeJob | PlaybackError

type TranscodeJob implements Node {
  id: ID!
  video: Video!
  resolution: Resolution!
  status: JobStatus!
  totalSegments: Int
  completedSegments: Int!
  startTimeSeconds: Float
  endTimeSeconds: Float
  createdAt: String!
  error: String
  """
  Set to PROBE_FAILED or ENCODE_FAILED when a mid-job failure occurs.
  Populated on the in-memory ActiveJob before notify.notify_waiters() fires
  so the subscription delivers the final error state atomically.
  """
  errorCode: PlaybackErrorCode
}

# ── Root ─────────────────────────────────────────────────────────────────────

type Query {
  node(id: ID!): Node
  libraries: [Library!]!
  video(id: ID!): Video
  transcodeJob(id: ID!): TranscodeJob
}

type Mutation {
  scanLibraries: [Library!]!
  startTranscode(
    videoId: ID!
    resolution: Resolution!
    startTimeSeconds: Float
    endTimeSeconds: Float
  ): StartTranscodeResult!
}

type LibraryScanUpdate {
  scanning: Boolean!
}

type Subscription {
  transcodeJobUpdated(jobId: ID!): TranscodeJob!
  """
  Emits immediately with the current scan state, then on every state change.
  scanning=true  → a scan is in progress
  scanning=false → scan completed; re-query libraries for updated data
  """
  libraryScanUpdated: LibraryScanUpdate!
}
```

---

## Enum Mapping

GraphQL enums use ALL_CAPS. Internally the server uses lowercase / snake_case Rust enums. The mapping is generated by async-graphql derives split across `server-rust/src/graphql/scalars.rs` (`Resolution`, `JobStatus`, `MediaKind`, etc.) and the per-domain modules under `server-rust/src/graphql/types/` (e.g. `transcode_job.rs`, `library.rs`, `playback_session.rs`).

| GraphQL | Internal |
|---|---|
| `RESOLUTION_240P` | `240p` |
| `RESOLUTION_360P` | `360p` |
| `RESOLUTION_480P` | `480p` |
| `RESOLUTION_720P` | `720p` |
| `RESOLUTION_1080P` | `1080p` |
| `RESOLUTION_4K` | `4k` |
| `PENDING` | `pending` |
| `RUNNING` | `running` |
| `COMPLETE` | `complete` |
| `ERROR` | `error` |
| `MOVIES` | `movies` |
| `TV_SHOWS` | `tvShows` |
| `CAPACITY_EXHAUSTED` | `capacity_exhausted` (StartJobResult kind) |
| `VIDEO_NOT_FOUND` | `video_not_found` (StartJobResult kind) |
| `PROBE_FAILED` | `probe_failed` (ActiveJob errorCode) |
| `ENCODE_FAILED` | `encode_failed` (ActiveJob errorCode) |
| `INTERNAL` | resolver catch-all — only genuinely unexpected throws |
| `MSE_DETACHED` | client-only; Chrome silently removed our SourceBuffer under memory pressure; never crosses the wire |

---

## Subscription Transport

Subscriptions use WebSocket with the `graphql-ws` protocol (not the legacy `subscriptions-transport-ws`). async-graphql handles the upgrade automatically on the same port as HTTP.

The client connects via `graphql-ws`'s `createClient`:

```typescript
const wsClient = createClient({ url: `ws://${window.location.host}/graphql` });
```

The `transcodeJobUpdated` subscription fires every time a new segment is written or the job status changes. The client uses this to display progress during transcoding.

The `libraryScanUpdated` subscription emits the current scan state immediately on connect (so clients joining mid-scan are informed), then on every subsequent state change. When `scanning` transitions to `false`, clients should re-query the `libraries` field to pick up newly indexed videos. The server scans continuously on a timer (`scanIntervalMs`, default 30 s) — clients do not need to trigger scans manually.

---

## Adding a New Type

1. Define the Rust type in the matching per-domain file under `server-rust/src/graphql/types/` (`library.rs`, `transcode_job.rs`, `video.rs`, `watchlist.rs`, `playback_session.rs`, `omdb.rs`, `node.rs`, `misc.rs`) with `#[derive(SimpleObject)]` (or `#[Object]` for resolvers with logic). Re-export from `types/mod.rs` if it needs to be visible outside the module.
2. If it's a queryable entity, add a `Query` impl method in `server-rust/src/graphql/query.rs` and wire it into the `node` resolver in `server-rust/src/relay.rs`.
3. Add DB query functions in `server-rust/src/db/queries/<table>.rs`.
4. From `client/`: run `bun run --filter client relay` to regenerate Relay artifacts.

### Adding a union return type

async-graphql unions are derived via `#[derive(Union)]` over an enum. Each variant carries a struct that itself derives `SimpleObject` / `Object`. The `__typename` discrimination happens at compile time via the variant name; there is no `__resolveType` boilerplate to maintain.

See `StartTranscodeResult` in `server-rust/src/graphql/types/transcode_job.rs` as the canonical example.

## Error-handling contract

`startTranscode` is the first resolver to use a typed-error contract instead of throwing. The pattern:

- `chunker::start_transcode_job` (in `server-rust/src/services/chunker.rs`) returns `StartJobResult` — a Rust enum with `Ok(ActiveJob)` and `Error { code: PlaybackErrorCode, message: String, retryable: bool, retry_after_ms: Option<u64> }` variants.
- The resolver maps `Ok` to `TranscodeJob` and `Error` to `PlaybackError` per the `StartTranscodeResult` async-graphql `#[derive(Union)]`. The async-graphql `ErrorLogger` extension catches any genuinely unexpected error and surfaces it as `INTERNAL` with the request `TraceId` attached — see `server-rust/src/graphql/error_logger.rs`.
- This is the **target pattern for all playback-path mutations** — `update_library`, `match_video`, `unmatch_video`, `update_watch_progress`, and disk-full paths inside the chunker should adopt the same `*Result` union shape rather than throwing.

See invariant #11 in [`docs/code-style/Invariants/00-Never-Violate.md`](../../code-style/Invariants/00-Never-Violate.md) for the `error_code`-before-notify-waiters requirement.
