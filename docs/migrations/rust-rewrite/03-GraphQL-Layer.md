# GraphQL Layer — Bun → Rust Migration

**Scope.** Schema, resolvers, presenter layer, global-ID encoding, enum mappers, subscription transport. The Rust port preserves byte-identical SDL and the typed-error union contract — the React/Relay client must require **zero changes** across the rewrite.

**Read first.**

- [`server/GraphQL-Schema/00-Surface.md`](../../server/GraphQL-Schema/00-Surface.md) — full schema, enum mapping table, error contract, transport notes (current doc is slightly behind `schema.ts` head — see §1.1 deltas)
- [`code-style/Invariants/00-Never-Violate.md`](../../code-style/Invariants/00-Never-Violate.md) — invariants #6 (URL-encoded IDs in route links), #7 (one resolver per field), #11 (typed-error union for playback)
- [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) — yoga mount, WS upgrade plumbing, `RequestContext` middleware

---

## 1. Current Bun implementation

### 1.1 Schema definition — `server/src/graphql/schema.ts` (288 lines)

Single SDL string, exported as `typeDefs`. The schema doc captures the broad shape; the live file has a few additions worth flagging for the migration:

- `Library.stats: LibraryStats!` (`schema.ts:33`) and `Library.videos(...)` with `search` + `mediaType` filter args (`schema.ts:35`)
- `Video.matched: Boolean!` (`schema.ts:59`) — derived from join with `video_metadata`
- `WatchlistItem implements Node` (`schema.ts:93-99`) — full watchlist surface
- `Mutation.matchVideo`, `unmatchVideo`, `addToWatchlist`, `removeFromWatchlist`, `updateWatchProgress`, `setSetting`, `recordPlaybackSession` (`schema.ts:250-260`)
- `Query.searchOmdb`, `listDirectory`, `playbackHistory`, `settings` (`schema.ts:218-221`)
- `Subscription.libraryScanProgress` (`schema.ts:286`) — alongside `libraryScanUpdated`

The Rust port replicates the head SDL verbatim — not the doc's snapshot. The **stable contract** is: every type, field, enum value, and nullability marker must round-trip through introspection unchanged. A `scripts/check-sdl-parity` harness should be the first thing the implementing agent writes — it diffs Rust SDL against Bun SDL, fails CI on any drift.

### 1.2 Schema construction + validation — `server/src/routes/graphql.ts:19-39`

```ts
export const schema = makeExecutableSchema({
  typeDefs,
  resolvers: [
    queryResolvers,
    libraryResolvers,
    videoResolvers,
    jobResolvers,
    mutationResolvers,
    subscriptionResolvers,
  ],
  resolverValidationOptions: {
    requireResolversForArgs: "warn",
  },
});
assertValidSchema(schema);
```

Resolver merge is `graphql-tools`' shallow `Object.assign` over the array. **Invariant #7**: duplicate field resolvers silently overwrite. The Rust port using `async-graphql` `#[Object]` derives eliminates this risk structurally — the proc macro fails compilation on a duplicate field.

`server/src/graphql/validateSchema.ts` (17 lines) is a standalone CI script — runs `buildSchema(typeDefs)` and exits non-zero on parse failure. Useful in CI today; the Rust port replaces it with `cargo build` (the schema is rejected at compile time).

### 1.3 Global IDs — `server/src/graphql/relay.ts` (19 lines)

```ts
export function toGlobalId(type: string, id: string | number): string {
  return Buffer.from(`${type}:${id}`).toString("base64");
}
export function fromGlobalId(globalId: string): { type: string; id: string } {
  const decoded = Buffer.from(globalId, "base64").toString("utf8");
  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) throw new Error(`Invalid global ID: "${globalId}"`);
  const type = decoded.slice(0, colonIndex);
  const id = decoded.slice(colonIndex + 1);
  if (!type || !id) throw new Error(`Invalid global ID: "${globalId}" — type or id is empty`);
  return { type, id };
}
```

**Standard alphabet, NOT URL-safe.** Output contains `/`, `+`, `=`. The React client URL-encodes IDs in route links (invariant #6) — that constraint is on the client and survives the migration unchanged.

The Rust port: `base64::engine::general_purpose::STANDARD.encode(format!("{type}:{id}"))` and `STANDARD.decode(...)` then `from_utf8`. Use `splitn(2, ':')` to handle local IDs that contain colons.

### 1.4 Enum mappers — `server/src/graphql/mappers.ts` (73 lines)

Six lookup tables (resolution × 2, status × 2, media-type × 2) plus six wrapper functions that throw on unknown values. The GraphQL enums are ALL_CAPS prefixed (`RESOLUTION_240P`, `JOBSTATUS_RUNNING` — actually `RUNNING`, no prefix on JobStatus); internal types use kebab-case strings (`240p`, `running`, `tvShows`).

The Rust port replaces this with `async-graphql::Enum` derives on Rust enums and a `From<GqlResolution> for InternalResolution` impl pair. The 73 lines collapse to ~30 lines of derive + impls, with compile-time exhaustiveness checking.

### 1.5 Presenter layer — `server/src/graphql/presenters.ts` (222 lines)

Pure functions that map DB rows to GraphQL response shapes. Resolvers stay thin; presentation logic is unit-testable in isolation. Lines 91-204 cover one presenter per type:

- `presentLibrary(row)` — JSON-decodes `video_extensions`, encodes global ID
- `presentVideo(row, matched = false)` — falls back from `title` to `filename`
- `presentVideoMetadata(row)` — JSON-decodes `cast_list`
- `presentWatchlistItem(row)`
- `presentJob(row)` — handles both `TranscodeJobRow` (DB) and `ActiveJob` (in-memory) inputs; sets `__typename: "TranscodeJob"` for the union discriminator (line 158)
- `presentPlaybackError(args)` — sets `__typename: "PlaybackError"` (line 180)
- `presentPlaybackSession(row)`
- `encodeCursor(offset)` / `decodeCursor(cursor)` — opaque base64-encoded `offset:N` strings (lines 208-222)

The `_raw` field on `GQLLibrary`, `GQLVideo`, `GQLWatchlistItem` (lines 32, 55, 63) lets sub-resolvers reach the original row without re-querying. The Rust port replaces this with a struct that owns the row directly and exposes accessors via `#[Object]` impls.

### 1.6 Resolvers — `server/src/graphql/resolvers/` (six files, ~630 lines total)

| File | Lines | Surface |
|---|---|---|
| `query.ts` | 148 | `node`, `libraries`, `videos`, `video`, `transcodeJob`, `watchlist`, `searchOmdb`, `listDirectory`, `playbackHistory`, `settings` + `WatchlistItem.video` sub-resolver |
| `mutation.ts` | 231 | All mutations + the `StartTranscodeResult.__resolveType` discriminator |
| `subscription.ts` | 93 | Three subscriptions, all as async generators |
| `library.ts` | 87 | `Library.stats`, `Library.videos` (paginated connection) |
| `video.ts` | 60 | `Video.library`, `Video.metadata`, `Video.videoStream`, `Video.audioStream`, `Video.mediaType` |
| `job.ts` | 11 | `TranscodeJob.video` |

**`node(id)` resolver** (`query.ts:28-54`) is the Relay refetch entry point. Decodes global ID, switches on type prefix (`Library`, `Video`, `TranscodeJob`, `WatchlistItem`), routes to the matching DB query. Adding a new Node type requires four touchpoints (cf. [`server/GraphQL-Schema/00-Surface.md`](../../server/GraphQL-Schema/00-Surface.md) §"Adding a New Type"). The Rust port encodes this routing in a single `async fn node` returning `Option<NodeUnion>` where `NodeUnion` is a `#[derive(Union)]` of all node types.

**Typed-error union** (`mutation.ts:43-47, 55-101`):

```ts
StartTranscodeResult: {
  __resolveType(obj: GQLTranscodeJob | GQLPlaybackError): string {
    return obj.__typename;
  },
},

async startTranscode(_, { videoId, ... }, ctx) {
  ...
  try {
    const result = await startTranscodeJob(localVideoId, internalResolution, ..., ctx.otelCtx);
    return result.kind === "ok"
      ? presentJob(result.job)
      : presentPlaybackError({ code: result.code, ... });
  } catch (err) {
    return presentPlaybackError({ code: "INTERNAL", message: (err as Error).message, retryable: false });
  }
}
```

Invariant #11: known failure modes return `PlaybackError` as a union member, never throw. Genuinely unexpected throws are caught and mapped to `INTERNAL`. The Rust port using `async-graphql::Union` enforces this at compile time — the resolver returns `Result<StartTranscodeResult, async_graphql::Error>` and the `Err` path is reserved for protocol violations only.

### 1.7 Subscriptions — `subscription.ts` + transport flip

The async-generator pattern is uniform (`subscription.ts:24-91`):

```ts
async *subscribe(_, { jobId }) {
  const { id: localId } = fromGlobalId(jobId);
  for await (const job of subscribeToJob(localId)) {
    yield { transcodeJobUpdated: job ? presentJob(job) : null };
  }
}
```

`subscribeToJob` (`server/src/services/jobStore.ts:38-88`) is a hand-rolled `AsyncIterable` that wakes the consumer on every `notifySubscribers(job)` call from the chunker.

**Transport flip.** The schema doc says graphql-yoga delivers subscriptions over SSE because graphql-ws upgrade isn't fully wired in Bun. **The current `server/src/index.ts:87-96` DOES wire `graphql-ws/lib/use/bun` for the upgrade**, so subscriptions go over WS today. The doc note is outdated; the migration concern simplifies to "preserve the same `graphql-ws` `graphql-transport-ws` subprotocol". `async-graphql-axum::GraphQLSubscription` speaks this protocol natively (cf. [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) §3.4).

### 1.8 Pagination — connection pattern

`Library.videos` (`library.ts:42-85`) returns a `VideoConnection` with `edges`, `pageInfo`, `totalCount`. Cursor encoding: opaque base64-wrapped offset (`presenters.ts:208-222`). `MAX_PAGE_SIZE = 100` enforced server-side regardless of the client's `first` arg (`library.ts:19, 61`).

**Rust port:** keep cursor encoding identical (Relay decodes cursors only by passing them back; opacity is the contract). `async-graphql::connection::query` provides the boilerplate but is opt-in.

---

## 2. Stable contracts (must not change)

| Contract | Where | Rust port must |
|---|---|---|
| Full SDL — every type, field, enum value, nullability | `schema.ts` | Emit byte-identical introspection (CI: SDL parity diff) |
| Global ID encoding — `base64("TypeName:localId")` standard alphabet | `relay.ts` | Same encoding (`base64` crate, `STANDARD` engine) |
| Pagination cursor — opaque `base64("offset:N")` | `presenters.ts:208-222` | Same encoding (or a different opaque encoding if Relay never inspects them — verify before changing) |
| `__typename` on union branches | `presenters.ts:158, 180` | `async-graphql::Union` derive emits `__typename` automatically |
| One resolver per field — no duplicate registration | `routes/graphql.ts:21-28` | `async-graphql` proc-macro enforces at compile time (invariant #7 becomes informational in Rust) |
| Typed-error union for playback path | `mutation.ts:55-101` | Same shape — `Result<StartTranscodeResult, async_graphql::Error>` with PlaybackError as a union member |
| Subscription subprotocol — `graphql-transport-ws` | `index.ts:87-96` + `routes/graphql.ts` | `async-graphql-axum::GraphQLSubscription` speaks this protocol |
| `MAX_PAGE_SIZE = 100` server cap | `library.ts:19` | Same cap |
| Enum CAPS↔kebab mapping table | `mappers.ts` | Identical mapping (encode in Rust enum derives) |

---

## 3. Rust target shape

### 3.1 Crates (locked)

| Concern | Crate | Why |
|---|---|---|
| GraphQL runtime | `async-graphql` 7.x | Idiomatic Rust GraphQL with proc-macro derives |
| HTTP/WS integration | `async-graphql-axum` | Mounts on the axum router from [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) |
| Base64 | `base64` (`STANDARD` engine) | Standard alphabet for global IDs |
| JSON cast list, video extensions | `serde_json::Value` or typed `Vec<String>` with custom deserializer | Today these are `TEXT` columns holding JSON; Rust port deserializes lazily |

### 3.2 Resolver shape

```rust
#[derive(SimpleObject)]
struct PageInfo {
    has_next_page: bool,
    has_previous_page: bool,
    start_cursor: Option<String>,
    end_cursor: Option<String>,
}

pub struct Library { row: LibraryRow }

#[Object]
impl Library {
    async fn id(&self) -> ID { ID(to_global_id("Library", &self.row.id)) }
    async fn name(&self) -> &str { &self.row.name }
    async fn path(&self) -> &str { &self.row.path }
    async fn media_type(&self) -> MediaType { self.row.media_type.into() }
    async fn video_extensions(&self) -> Result<Vec<String>> {
        Ok(serde_json::from_str(&self.row.video_extensions)?)
    }

    async fn stats(&self, ctx: &Context<'_>) -> Result<LibraryStats> {
        let db = ctx.data::<DbPool>()?;
        let total = db::videos::count_by_library(db, &self.row.id, &VideoFilter::default())?;
        let (matched, unmatched) = db::video_metadata::count_matched(db, &self.row.id)?;
        let total_size = db::videos::sum_size_by_library(db, &self.row.id)?;
        Ok(LibraryStats { total_count: total, matched_count: matched, unmatched_count: unmatched, total_size_bytes: total_size })
    }

    async fn videos(&self, ctx: &Context<'_>, first: Option<i32>, after: Option<String>, search: Option<String>, media_type: Option<MediaType>) -> Result<VideoConnection> {
        let req_ctx = ctx.data::<RequestContext>()?;     // §3.4 — present from day one
        let limit = first.unwrap_or(20).min(MAX_PAGE_SIZE);
        let offset = after.as_deref().map(decode_cursor).transpose()?.unwrap_or(0);
        let filter = VideoFilter { search, media_type: media_type.map(Into::into) };
        let db = ctx.data::<DbPool>()?;
        let rows = db::videos::list_by_library(db, &self.row.id, limit, offset, &filter)?;
        let total = db::videos::count_by_library(db, &self.row.id, &filter)?;
        Ok(VideoConnection::from_rows(rows, total, offset))
    }
}
```

The `_raw` escape hatch from the JS presenters disappears — sub-resolvers receive the full struct.

### 3.3 The typed-error union

```rust
#[derive(SimpleObject)]
struct PlaybackError {
    code: PlaybackErrorCode,
    message: String,
    retryable: bool,
    retry_after_ms: Option<i32>,
}

#[derive(Union)]
enum StartTranscodeResult {
    TranscodeJob(TranscodeJob),
    PlaybackError(PlaybackError),
}

async fn start_transcode(
    ctx: &Context<'_>,
    video_id: ID,
    resolution: Resolution,
    start_time_seconds: Option<f64>,
    end_time_seconds: Option<f64>,
) -> StartTranscodeResult {
    let local_id = match from_global_id(&video_id) {
        Ok((_, id)) => id,
        Err(_) => return StartTranscodeResult::PlaybackError(PlaybackError {
            code: PlaybackErrorCode::VideoNotFound,
            message: format!("Invalid video ID: {video_id:?}"),
            retryable: false,
            retry_after_ms: None,
        }),
    };
    match chunker::start_transcode_job(ctx, &local_id, resolution.into(), start_time_seconds, end_time_seconds).await {
        Ok(job) => StartTranscodeResult::TranscodeJob(TranscodeJob::from_active(job)),
        Err(StartJobError::CapacityExhausted { retry_after_ms }) => StartTranscodeResult::PlaybackError(PlaybackError {
            code: PlaybackErrorCode::CapacityExhausted,
            message: "Too many concurrent streams (limit: 3). Close another player tab and try again.".into(),
            retryable: true,
            retry_after_ms: Some(retry_after_ms as i32),
        }),
        // ... other typed errors mapped to PlaybackError variants
    }
}
```

The resolver returns `StartTranscodeResult` directly (not `Result<StartTranscodeResult, ...>`) because every known failure mode is a union member. Genuine protocol violations are rare enough that they can fall back to `Result<_, async_graphql::Error>`.

### 3.4 Resolver context

`async-graphql`'s `ctx.data::<T>()` is the equivalent of yoga's `ctx.otelCtx`. Schema is built with `.data(state)` to inject `AppState`, and HTTP/WS handlers attach the per-request `RequestContext` via `.data(req_ctx)` on each request (cf. [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) §3.4):

```rust
async fn graphql_handler(
    Extension(schema): Extension<XstreamSchema>,
    Extension(req_ctx): Extension<RequestContext>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(req.into_inner().data(req_ctx)).await.into()
}
```

Resolvers needing OTel context: `let req_ctx = ctx.data::<RequestContext>()?;` then `req_ctx.otel_ctx`.

### 3.5 Subscriptions

```rust
#[Subscription]
impl SubscriptionRoot {
    async fn transcode_job_updated(&self, ctx: &Context<'_>, job_id: ID) -> impl Stream<Item = Option<TranscodeJob>> + '_ {
        let local_id = from_global_id(&job_id).map(|(_, id)| id).unwrap_or_default();
        let store = ctx.data::<JobStore>().unwrap().clone();
        async_stream::stream! {
            let mut rx = store.subscribe(&local_id);
            while let Some(job) = rx.recv().await {
                yield job.map(TranscodeJob::from_active);
            }
        }
    }
}
```

`JobStore::subscribe(local_id)` returns a `tokio::sync::mpsc::Receiver<Option<ActiveJob>>` — the Rust analogue of the hand-rolled async iterable. Replace with `tokio::sync::broadcast` if multiple subscribers per job ever land (sharing brings this).

---

## 4. Forward constraints for peer-sharing

### 4.1 Resolver context already carries `RequestContext` from day one

Already covered in [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) §3.3. Repeated as the GraphQL-side specific: `ctx.data::<RequestContext>()` returns the same struct that `axum::Extension<RequestContext>` carries. When `share_grant` becomes load-bearing, every resolver that returns peer-visible data does `ctx.data::<RequestContext>()?.share_grant.as_ref().ok_or(...)?` to gate access.

### 4.2 Schema additions reserved for sharing

Schema fields that will be added when sharing ships (NOT in this port — listed for forward awareness):

- `Mutation.createShareInvite(videoId: ID!, scope: ShareScope!, expirySeconds: Int): ShareInvite!`
- `Query.peers: [Peer!]!` — list of trusted peers
- `Subscription.peerJobUpdated(peerNodeId: ID!, jobId: ID!): TranscodeJob!` — proxy view of a peer's job
- `Video.sharedFrom: Peer` — non-null when the video originates from a peer

These do not exist today and are NOT to be added speculatively. Listed here so future-author of `Sharing/00-Peer-Streaming.md` knows what schema additions to specify.

### 4.3 Global ID type-name uniqueness across peers

The current global ID encoding is `base64("Video:<sha1>")`. Across peers, two videos on different machines can have the same `<sha1>` (different content with the same first 64 KB — vanishingly rare but possible) OR the same `<sha1>` for the same content (intended — content fingerprint is content-addressable). The current encoding works for both: deduplication-friendly when the content matches, ambiguous when it doesn't.

**Forward decision (deferred to Sharing doc):** whether `Video` global IDs need a peer-namespace prefix (e.g. `base64("Video:<peer_node_id>:<sha1>")`). Today's encoding is preserved; the change happens in the `Sharing/00-Peer-Streaming.md` doc as part of the broader identity model. The Rust port emits today's encoding unchanged.

### 4.4 Subscription auth surface

When sharing ships, peer B subscribing to `transcodeJobUpdated(jobId)` against peer A must present a valid share-token. Today the subscription has no auth surface. The Rust port's `RequestContext` extension on the WS upgrade (cf. [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) §3.4) carries the seed structure; resolver-side enforcement is a one-line addition when sharing arrives. Document the seam in the Rust subscription resolver doc-comment.

---

## 5. Open questions

1. **`async-graphql` Federation.** The current schema is monolithic. If sharing ever introduces a "remote field" (peer A's resolvers querying peer B's resolvers), federation enters the conversation. `async-graphql` supports Apollo Federation v2; for now the design is "two separate schemas, the client speaks to each directly" — federation is a future tool, not a current need.

2. **`async-graphql` schema export for SDL parity.** `async-graphql::Schema::sdl()` produces the introspection SDL. The `scripts/check-sdl-parity` harness (mentioned in §1.1) compares this against `schema.ts`'s `typeDefs` literal. Whitespace and ordering differences are cosmetic — the parity check should normalise via `graphql::print_schema` or equivalent.

3. **Cursor encoding stability.** Today's cursors are `base64("offset:N")`. Relay treats them opaquely so the encoding could change in the Rust port without breaking the client — but if the migration is staged (Bun and Rust running side-by-side during dev), a Relay store hydrated against Bun and then routed to Rust would fail to paginate further until the page-info refreshed. Keep the encoding identical to avoid this transient mode.

4. **`@graphql-tools/schema` pagination defaults.** `Library.videos(first: Int = 20, ...)` (`schema.ts:35`) sets a SDL default. `async-graphql` honours SDL defaults when the field is declared with `default = 20`. Verify this round-trips.

5. **Pre-flight introspection vs runtime introspection.** The Rust port's `assertValidSchema` equivalent is compile-time (`cargo build`). Useful: a CI step that boots the server and queries `__schema` to confirm runtime SDL matches the source-of-truth SDL — catches accidental `disable_introspection()` calls during prod-config drift.

---

## 6. Critical files reference

| File | Lines | Role in the port |
|---|---|---|
| `server/src/graphql/schema.ts` | 288 | Full SDL — Rust derives `#[Object]` impls match this 1:1 |
| `server/src/graphql/relay.ts` | 19 | Global ID encode/decode |
| `server/src/graphql/mappers.ts` | 73 | Enum maps — collapse into `From` impls |
| `server/src/graphql/presenters.ts` | 222 | Row → GQL shape — `_raw` escape hatch eliminated |
| `server/src/graphql/validateSchema.ts` | 17 | CI script — replaced by `cargo build` |
| `server/src/graphql/resolvers/query.ts` | 148 | Top-level queries + `node(id)` router |
| `server/src/graphql/resolvers/mutation.ts` | 231 | All mutations + union `__resolveType` discriminator |
| `server/src/graphql/resolvers/subscription.ts` | 93 | Three async-iterable subscriptions |
| `server/src/graphql/resolvers/library.ts` | 87 | `Library.stats` + paginated `Library.videos` |
| `server/src/graphql/resolvers/video.ts` | 60 | Video sub-resolvers |
| `server/src/graphql/resolvers/job.ts` | 11 | `TranscodeJob.video` |
| `server/src/routes/graphql.ts` | 57 | Yoga mount + `GQLContext` (cf. [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md)) |
