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

enum ProfileStatus {
  ONLINE
  OFFLINE
  UNKNOWN
}

type Library implements Node {
  id: ID!
  name: String!
  path: String!
  mediaType: MediaType!
  videoExtensions: [String!]!
  """
  Reachability of this library's storage path. Driven by
  `services::profile_availability`. ONLINE = path stats as a directory;
  OFFLINE = path missing/denied; UNKNOWN = not yet probed (default for
  fresh rows; the probe upgrades within one cycle, ~30s).
  """
  status: ProfileStatus!
  """
  ISO-8601 timestamp of the most recent probe (online or offline).
  Null until the first probe runs.
  """
  lastSeenAt: String
  stats: LibraryStats!
  videos(first: Int, after: String, search: String, mediaType: MediaType): VideoConnection!
}

type LibraryStats {
  totalCount: Int!
  matchedCount: Int!
  unmatchedCount: Int!
  totalSizeBytes: Float!
}

# ── Video ────────────────────────────────────────────────────────────────────

type Video implements Node {
  id: ID!
  title: String!
  filename: String!
  durationSeconds: Float!
  fileSizeBytes: Float!
  bitrate: Int!
  matched: Boolean!
  mediaType: MediaType!
  library: Library!
  metadata: VideoMetadata
  videoStream: VideoStreamInfo
  audioStream: AudioStreamInfo
  """
  Native resolution rung determined at scan time. Null for rows scanned
  before the column existed.
  """
  nativeResolution: Resolution
  """
  The Show this video is an episode of, when set. Movie videos and
  unmatched episode files return null.
  """
  show: Show
  """
  Episode coordinate `(season, episode)` for episode files; null for
  movies.
  """
  seasonNumber: Int
  episodeNumber: Int
}

type VideoMetadata {
  imdbId: String!
  title: String!
  year: Int
  genre: String
  director: String
  cast: [String!]!
  rating: Float
  plot: String
  """
  Poster URL sized to the requested dimension. When the worker has cached
  the poster locally this returns `/poster/<basename>.w{N}.webp` 
  (same-origin, WebP-encoded); else the OMDb canonical URL (unchanged).
  The poster_local_path column is internal — `services::poster_cache`
  resizes and encodes all 4 width variants (240, 400, 800, 1600px).
  See `docs/architecture/Library-Scan/05-Poster-Caching.md` and
  `docs/architecture/Library-Scan/05-Poster-Caching.md` § "Client
  fragment alias convention" for per-fragment size selection.
  """
  posterUrl(size: PosterSize!): String
}

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

# ── Watchlist ─────────────────────────────────────────────────────────────────

type WatchlistItem implements Node {
  id: ID!
  film: Film!
  addedAt: String!
}

type WatchProgress implements Node {
  id: ID!
  film: Film!
  video: Video!
  currentTimeSeconds: Float!
  durationSeconds: Float!
  updatedAt: String!
}

# ── Film (Movies Only) ────────────────────────────────────────────────────────

type Film implements Node {
  id: ID!
  title: String!
  year: Int
  genre: String
  director: String
  plot: String
  """
  The primary video to display as the poster. Selected via the first role='main'
  video, or the highest-resolution/bitrate video if multiple role='main' exist.
  """
  bestCopy: Video!
  """
  All videos belonging to this film, ordered by role ('main' first),
  then resolution (highest first), then bitrate (highest first).
  """
  copies: [Video!]!
  """
  Convenience field: copies filtered to role='extra'. Empty if no extras exist.
  """
  extras: [Video!]!
}

type FilmConnection {
  edges: [FilmEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type FilmEdge {
  node: Film!
  cursor: String!
}

# ── Show (TV Series) ─────────────────────────────────────────────────────────

type Show implements Node {
  id: ID!
  title: String!
  year: Int
  metadata: ShowMetadata
  """
  Distinct libraries that contain at least one episode file for this
  show. Surfaces the "Available in: <profiles>" line in the detail
  overlay.
  """
  profiles: [Library!]!
  seasons: [Season!]!
}

type ShowMetadata {
  imdbId: String!
  title: String!
  year: Int
  genre: String
  director: String
  cast: [String!]!
  rating: Float
  plot: String
  """
  Poster URL sized to the requested dimension. Same contract as
  `VideoMetadata.posterUrl` — server-relative WebP variants when cached,
  else OMDb CDN URL.
  """
  posterUrl(size: PosterSize!): String
}

type ShowConnection {
  edges: [ShowEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type ShowEdge {
  node: Show!
  cursor: String!
}

type Season {
  seasonNumber: Int!
  episodes: [Episode!]!
}

type Episode {
  seasonNumber: Int!
  episodeNumber: Int!
  title: String
  durationSeconds: Float
  nativeResolution: Resolution
  """
  True when at least one `videos` row exists for this episode coordinate.
  """
  onDisk: Boolean!
  """
  All file rows for this episode coordinate (`videos` joined on
  show_id/show_season/show_episode). Multiple rows = the same episode
  file indexed in two libraries (axis-2 dedup). Ordered by resolution
  desc, bitrate desc — picker renders best-first.
  """
  copies: [Video!]!
  """
  First entry of `copies` (best-quality), or null when off-disk.
  """
  bestCopy: Video
  """
  The bestCopy's owning library, when present. Lets the client mark an
  episode "offline" when its host library's status is OFFLINE without
  an extra round-trip.
  """
  library: Library
  """
  Carry-over for clients still keying on a single video id. Mirrors
  `bestCopy.id` when present. Tech debt: clients should migrate to
  `bestCopy.id`.
  """
  videoId: ID
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

enum PosterSize {
  W240
  W400
  W800
  W3200
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
  """
  List films (movies). Cursor-paginated. `libraryId` and `search` are optional filters.
  """
  films(first: Int, libraryId: ID, search: String): FilmConnection!
  film(id: ID!): Film
  """
  List shows (TV series). Same shape as `films`. The TV row on the
  homepage queries this connection.
  """
  shows(first: Int, libraryId: ID, search: String): ShowConnection!
  show(id: ID!): Show
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
  """
  Add a film to the user's watchlist. Idempotent — adding the same film twice is a no-op.
  """
  addFilmToWatchlist(filmId: ID!): WatchlistItem!
  """
  Remove a film from the watchlist.
  """
  removeFilmFromWatchlist(filmId: ID!): Boolean!
  """
  Cancel one or more in-flight transcode jobs. Fire-and-forget; always returns true.
  Per-job failures are logged internally. Wired to the client-driven cancel-on-seek
  path so aggressive seeks don't accumulate orphan ffmpeg processes.
  """
  cancelTranscode(jobIds: [ID!]!): Boolean!
  """
  Update the user's playback progress on a film. Upserts a watch_progress row.
  """
  updateWatchProgress(
    filmId: ID!
    videoId: ID!
    currentTimeSeconds: Float!
  ): WatchProgress!
  """
  Wipe the local SQLite database of all content (libraries, films, shows,
  videos, metadata, watchlist, playback progress). Preserves user_settings
  and schema. Gates on job_store.is_empty() and scan_state.is_scanning().
  """
  wipeDb: Boolean!
  """
  Delete all poster image files from the local cache directory. Gates on
  job_store.is_empty() and scan_state.is_scanning(). Subsequent metadata
  queries will re-download posters as needed.
  """
  wipePosterCache: Boolean!
  """
  Delete all transcoded segment files from the local cache directory. Gates
  on job_store.is_empty() and scan_state.is_scanning(). In-flight
  transcode jobs will have their output deleted, breaking playback; the
  user should be advised not to call this during streaming.
  """
  wipeSegmentCache: Boolean!
  """
  Equivalent to calling wipeDb, wipePosterCache, and wipeSegmentCache in
  sequence. First kills all in-flight jobs via job_store.kill_all_jobs(),
  then wipes the three layers. Atomic from the user's perspective — one
  button, one mutation, fresh state after it returns.
  """
  wipeAll: Boolean!
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
| `W240` | `w240` (PosterSize variant) |
| `W400` | `w400` (PosterSize variant) |
| `W800` | `w800` (PosterSize variant) |
| `W3200` | `w3200` (PosterSize variant) |
| `PENDING` | `pending` |
| `RUNNING` | `running` |
| `COMPLETE` | `complete` |
| `ERROR` | `error` |
| `MOVIES` | `movies` |
| `TV_SHOWS` | `tvShows` |
| `ONLINE` | `online` |
| `OFFLINE` | `offline` |
| `UNKNOWN` | `unknown` |
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
