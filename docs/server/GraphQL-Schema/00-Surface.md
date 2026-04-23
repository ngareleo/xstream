# GraphQL Schema

The server exposes a single GraphQL endpoint at `POST /graphql` (queries and mutations). Subscriptions are served over Server-Sent Events (SSE) via graphql-yoga's built-in SSE transport. WebSocket upgrade support in Bun (`Bun.serve()`) is not yet implemented; until it is, `graphql-ws` clients will fall back to SSE automatically through graphql-yoga.

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

The server encodes with `toGlobalId(type, id)` and decodes with `fromGlobalId(globalId)` in `server/src/graphql/relay.ts`. The `node` query uses the decoded type name to route to the correct DB query.

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
  ): TranscodeJob!
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

GraphQL enums use ALL_CAPS. Internally the server uses lowercase strings. The mapping lives in `server/src/graphql/mappers.ts`.

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

---

## Subscription Transport

Subscriptions use WebSocket with the `graphql-ws` protocol (not the legacy `subscriptions-transport-ws`). graphql-yoga handles the upgrade automatically on the same port as HTTP.

The client connects via `graphql-ws`'s `createClient`:

```typescript
const wsClient = createClient({ url: `ws://${window.location.host}/graphql` });
```

The `transcodeJobUpdated` subscription fires every time a new segment is written or the job status changes. The client uses this to display progress during transcoding.

The `libraryScanUpdated` subscription emits the current scan state immediately on connect (so clients joining mid-scan are informed), then on every subsequent state change. When `scanning` transitions to `false`, clients should re-query the `libraries` field to pick up newly indexed videos. The server scans continuously on a timer (`scanIntervalMs`, default 30 s) — clients do not need to trigger scans manually.

---

## Adding a New Type

1. Add the type to `server/src/graphql/schema.ts` (SDL)
2. If it's a queryable entity, add it to the `node` resolver switch in `resolvers/query.ts`
3. Add DB query functions in `server/src/db/queries/<type>.ts`
4. Add a resolver object and export it merged into `resolvers/query.ts` or a new file
5. From `client/`: run `bun relay` to regenerate Relay artifacts
