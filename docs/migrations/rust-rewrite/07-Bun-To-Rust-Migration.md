# Bun → Rust Migration — Synthesis

The cross-cutting decisions that don't belong to a single layer doc: runtime model shift, concurrency primitives, idiom translations, the strict-mode improvements Rust forces (and which existing TS-prototype invariants graduate to compile-time), and the recommended migration order.

For per-layer detail read the layer docs first — `01-Streaming-Layer.md` through `06-File-Handling-Layer.md` — then come here for the glue.

## 1. Runtime model shift

| Bun | Rust target | Implication |
|---|---|---|
| Single event loop, JS module-global state | `tokio` multi-threaded runtime, explicit `AppState` | Closures over module-scope variables become `Arc<AppState>` clones. State that is "obviously thread-safe" in JS (single-threaded by construction) requires `Send + Sync` bounds in Rust. |
| `Promise<T>` resolved on the JS event loop | `Future<Output = T>` driven by `tokio` workers | The "implicit await on each await point" model is identical in shape. The big difference: a Rust future does NOTHING until polled, so spawning `tokio::spawn(future)` is required for fire-and-forget. JS-style `void asyncFn()` does not work — the future is dropped without execution. |
| `EventEmitter` (Node) / `addEventListener` (Bun) | `tokio::sync::broadcast` (multi-consumer) or `watch` (latest-value-wins) | The duplicate-subscriber semantics of `EventEmitter` (one event per subscriber) maps to `broadcast`; the "give me the current state" semantics of `scanStore` (latest-value broadcast) maps to `watch`. |
| Mutable closures over module state | `Arc<DashMap<K, V>>` or `Arc<RwLock<HashMap<K, V>>>` | Concurrent mutation needs explicit synchronisation. `DashMap` is the lower-friction default for the in-memory `jobStore` and `scanStore`. |
| `AbortController` / `AbortSignal` | `tokio_util::sync::CancellationToken` | One-to-many cancellation with cheap `is_cancelled()` polling and `cancelled().await`. The shape matches Bun's `AbortSignal` semantics directly. |
| Synchronous `bun:sqlite` queries on the event loop | Async `rusqlite` via `tokio::task::spawn_blocking` (or sync code on a fixed-size blocking pool) | Today the Bun server makes blocking SQLite calls on the event loop. This is fine because the queries are <1 ms and the event loop is single-threaded. In Rust, blocking calls inside async functions block the worker — must wrap with `spawn_blocking` or use a connection pool that runs queries on a dedicated blocking thread. (See `05-Database-Layer.md`.) |

### `Send + Sync` is contagious

Anything stored in `AppState` (which is shared across handler tasks) must be `Send + Sync + 'static`. In practice every type used in the Rust port satisfies this — `Arc<T>` makes a `T: Sync` shareable, `Mutex<T>` makes a `T: !Sync` shareable for mutex-guarded access, `DashMap` is internally synchronised. The places to watch:

- `tokio::process::Child` is `Send` but only one task can `wait()` on it. Use `JoinHandle<ChildStatus>` from a dedicated supervisor task instead of passing the child around.
- `notify::Watcher` is `Send` but its callback is called on a non-tokio thread; the watcher's mpsc bridge to a tokio task is the recommended pattern (see `06-File-Handling-Layer.md`).

## 2. Concurrency primitives map

| JS pattern | Rust | When |
|---|---|---|
| `Promise.all([a, b])` | `tokio::join!(a, b)` | Two known awaits, want both to complete. |
| `Promise.all(arr.map(f))` | `futures::future::join_all(arr.map(f))` or `try_join_all` for fallible | Variable-size set, all must complete. |
| `Promise.race([a, b])` | `tokio::select! { v = a => ..., v = b => ... }` | First-to-complete wins; useful for "either job done, or cancellation token fired". |
| Bounded concurrency over a stream of work | `futures::stream::iter(...).buffer_unordered(N)` or a `tokio::sync::Semaphore` with N permits | Library walk, scanner ffprobe — see `06-File-Handling-Layer.md` for the exact `buffer_unordered(4)` pattern. |
| `EventEmitter` with multiple listeners | `tokio::sync::broadcast::channel(cap)` | Each subscriber gets every event; slow subscribers fall behind and may receive `RecvError::Lagged`. |
| `EventEmitter` where only the latest matters | `tokio::sync::watch::channel(initial)` | Latest-value-wins broadcast; ideal for scan progress / connection liveness counters. |
| In-process pub/sub for streaming subscribers | `tokio::sync::mpsc` per consumer + a producer that fans out by enqueueing on each | Per-connection backpressure, see `01-Streaming-Layer.md`. |
| `AbortController.signal` passed down a call tree | Pass `CancellationToken` by reference; nested cancellation via `child_token()` | Streaming pipeline, ffmpeg supervision. |
| `AbortController.abort()` | `token.cancel()` | Idempotent. Pairs with `child.kill_on_drop(true)` for ffmpeg cleanup. |
| `Map<K, V>` / `Set<T>` mutated freely from multiple async functions | `Arc<DashMap<K, V>>` / `Arc<DashSet<T>>` | The current `jobStore`, `ffmpegPool`'s `reservations`/`liveCommands`/`dyingJobIds` sets all become DashMap/DashSet on `AppState`. |
| `setTimeout(f, ms)` | `tokio::time::sleep(Duration::from_millis(ms)).await` (in a `tokio::spawn`) | One-shot delayed action. |
| `setInterval(f, ms)` | `tokio::time::interval(Duration::from_millis(ms))` polled in a `tokio::spawn` | The connection-liveness ticker, scan-progress flush. |

## 3. Crate shortlist (locked)

One winner per concern. Rationale is one line per pick; the layer docs justify each in detail.

| Concern | Crate | Why this one |
|---|---|---|
| HTTP / WS server | `axum` 0.7 (+ `axum-server` for graceful shutdown) | Tokio-native, tower middleware ecosystem, first-class `WebSocketUpgrade`. |
| GraphQL | `async-graphql` 7 + `async-graphql-axum` | Macro-driven SDL, native `graphql-transport-ws` subscriptions, Union/InputObject derives. |
| GraphQL tower middleware | `tower-http` 0.5 | CORS, trace, fallback service. Standard with axum. |
| SQLite | `rusqlite` 0.31 with `bundled` feature | Bundles libsqlite3, no system dep — satisfies "no apt install" Tauri rule. |
| SQLite connection pool | `r2d2` + `r2d2_sqlite` | Sync pool; pair with `tokio::task::spawn_blocking` at the query call site. |
| Process spawn | `tokio::process` (built-in) | First-class async; `kill_on_drop(true)` for ffmpeg supervision. |
| File walk | `walkdir` 2 | Mature, depth-first, cross-platform; sync — wrap in `spawn_blocking` for huge libraries. |
| File watch | `notify` 6 (optionally `notify-debouncer-full`) | Cross-platform inotify/FSEvents/RDCW; battle-tested. |
| OTel SDK | `opentelemetry` 0.24 + `opentelemetry_sdk` | Standard. |
| OTel tracing bridge | `tracing` 0.1 + `tracing-opentelemetry` 0.25 | The Rust `tracing` ecosystem is the de facto standard; opentelemetry-rs bridges to OTLP. |
| OTLP exporter | `opentelemetry-otlp` 0.17 with `http-proto` feature | HTTP/proto transport matches what the current Bun exporter ships. |
| HTTP client (OMDb) | `reqwest` 0.12 with `rustls-tls` | Async, TLS bundled (no openssl system dep). |
| Hashing (content fingerprint, job ID) | `sha1` 0.10 | API matches the Node `createHash("sha1")` shape. |
| Hex encoding | `hex` 0.4 | One-line `hex::encode(bytes)`. |
| Base64 (global IDs) | `base64` 0.22 | Standard alphabet, matches current encoding (URL-encoded by client at link time, see `03-GraphQL-Layer.md`). |
| JSON / serialization | `serde` 1 + `serde_json` 1 | Universal. |
| Async runtime | `tokio` 1 (multi-threaded, all features) | The whole stack assumes tokio. |
| Cancellation | `tokio_util::sync::CancellationToken` | Cheap, idempotent, hierarchical. |
| Concurrent maps | `dashmap` 6 | Lockless concurrent hash map; matches the Bun in-memory `Map` semantics. |
| Async streams | `futures` 0.3 (specifically `futures::stream`) | `Stream` + `StreamExt` extension methods. |
| Date/time | `time` 0.3 (or `chrono` 0.4) | Use `time` if no chrono-specific feature is needed. ISO-8601 strings on the DB layer are stored verbatim. |
| Ed25519 (sharing, future) | `ed25519-dalek` 2 | RustCrypto-maintained; pairs with `rand_core`. Ships when sharing does. |
| Identity-side secret store (sharing, future) | `tauri-plugin-stronghold` (Tauri context) or `keyring` (cross-platform) | Defer to sharing implementation. |

## 4. Idiom translation

### Optional chaining

```ts
// TS
const title = video?.metadata?.title ?? "Untitled";
```
```rust
// Rust
let title = video.as_ref()
    .and_then(|v| v.metadata.as_ref())
    .map(|m| m.title.clone())
    .unwrap_or_else(|| "Untitled".to_string());
```

If the chain is more than 2 hops deep, extract a helper or use a `let-else` ladder. Don't try to one-line `?` through `Option<&T>` chains — readability tanks fast.

### JSON marshalling

```ts
// TS — implicit
const row: VideoMetadataRow = { video_id: id, title, year, ... };
```
```rust
// Rust — explicit
#[derive(Debug, Serialize, Deserialize)]
struct VideoMetadataRow {
    video_id: String,
    title: String,
    year: Option<u32>,
    // ...
}
let row = VideoMetadataRow { video_id: id, title, year, /* ... */ };
let json = serde_json::to_string(&row)?;
```

Every wire-shape gets a `#[derive(Serialize, Deserialize)]` struct. Use `serde(rename_all = "camelCase")` only at the GraphQL boundary; keep snake_case on the DB side to match SQL columns.

### Async iterators (subscriptions)

```ts
// TS — async generator
async function* watchScanProgress(libraryId: string) {
    while (running) { yield store.snapshot(libraryId); await sleep(100); }
}
```
```rust
// Rust — Stream + async-stream macro
use async_stream::stream;
use futures::Stream;

fn watch_scan_progress(library_id: &str) -> impl Stream<Item = ScanProgress> + '_ {
    stream! {
        loop {
            if !running() { break; }
            yield store.snapshot(library_id);
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
}
```

Or use a `tokio::sync::watch::Receiver::changed_stream()` adapter for the watch-channel-as-stream pattern — preferred when the source is already a `watch::Sender`.

### Error handling at GraphQL boundaries

```ts
// TS — typed-error union (see invariant #11)
return { __typename: "PlaybackError", code: "VIDEO_NOT_FOUND", message: "...", retryable: false };
```
```rust
// Rust — async-graphql Union derive
#[derive(SimpleObject)]
struct PlaybackError {
    code: PlaybackErrorCode,
    message: String,
    retryable: bool,
}

#[derive(Union)]
enum StartTranscodeResult {
    TranscodeJob(TranscodeJob),
    PlaybackError(PlaybackError),
}

// Resolver returns Ok(StartTranscodeResult::PlaybackError(...)) for known failures.
// Unexpected errors return Err(async_graphql::Error::new("...")) — these
// surface as GraphQL errors, NOT as union members.
```

The compile-time guarantee is structural: `Result<StartTranscodeResult, _>` cannot accidentally contain a free-text error in the success branch. (See `03-GraphQL-Layer.md` for full resolver shapes.)

### Abort signals → cancellation tokens

```ts
// TS — propagated AbortSignal
async function pull(signal: AbortSignal) {
    while (!signal.aborted) { await step(); }
}
```
```rust
// Rust — CancellationToken (cooperative)
async fn pull(token: CancellationToken) {
    loop {
        tokio::select! {
            _ = token.cancelled() => break,
            _ = step() => continue,
        }
    }
}
```

Or — for the streaming pipeline where `step()` itself owns blocking I/O — drop the token into the `step` future and have it check `token.is_cancelled()` between work units.

## 5. Strict-mode improvements

Rust forces things the Bun prototype only enforces by convention. These are **benefits, not regressions** — load-bearing TS invariants graduate to compile-time guarantees, and the doc footprint shrinks accordingly.

| TS-prototype invariant | What enforces it today | What enforces it in Rust |
|---|---|---|
| Invariant #7 — one resolver per field | Eslint + `validateSchema.ts` runtime check (silent overwrites are still possible mid-bundling) | `#[Object]` derive — proc-macro merge fails at compile time on duplicate field names. The invariant becomes informational, not load-bearing. (See `03-GraphQL-Layer.md`.) |
| `setFfmpegPath` discipline (one caller, at startup, never per-module) | Convention + the comment block in `libraryScanner.ts:25-28` | No global to clobber — every ffmpeg invocation is `tokio::process::Command::new(&app_state.ffmpeg_paths.ffmpeg)`. (See `06-File-Handling-Layer.md`.) |
| Non-null assertions banned in client code (`!`) | `eslint-plugin-react-hooks` + `no-non-null-assertion` rule | `Option<T>` is the only nullable type; `unwrap()` is visible at every site and grep-able. |
| `bun:sqlite` column-index access (e.g. `row[0]`) | Code review | `rusqlite::Row::get::<&str, T>("col_name")` — every column access is named. (See `05-Database-Layer.md`.) |
| Module-global state (e.g. `setFfmpegPath`, the in-memory `jobStore`) | Module pattern | `AppState` is the only shared state surface; nothing is implicitly global. |
| All SQL routes through `db/queries/` (Invariant #1) | Convention | The structural rule survives — every query function lives in `db/queries/<table>.rs`; resolver/handler code that constructs SQL inline does not compile because the helpers don't exist there. |
| Init segment is the first frame on every new stream | The `pull()` ordering in `stream.ts` | Same — the order is in code, not in types. Convention preserved. |
| Length-prefix wire framing | Documented; `pull()` writes a 4-byte BE prefix per chunk | Same — typed `Bytes` writes via `body::Body::from_stream(...)`. (See `01-Streaming-Layer.md`.) |
| Floating promises (`no-floating-promises`) | Eslint rule | Compile-time error in Rust — a `Future` that is not awaited or spawned does nothing. The rule becomes structural. |

## 6. Things that DON'T change

| Surface | Rule |
|---|---|
| GraphQL SDL | Byte-identical. Verified by introspection diff against the Bun server. |
| Wire framing | 4-byte BE uint32 length prefix + raw fMP4 bytes. Init segment first. (`01-Streaming-Layer.md`.) |
| 180s idle kill (`config.stream.connectionIdleTimeoutMs`) | Do NOT weaken. (User feedback memory: safety timeouts encode intent.) |
| `config.transcode.maxConcurrentJobs = 3` (default; configurable) | Same. Becomes `Arc<Semaphore>`. AppConfig consolidation (commits `d3f98fa`/`9d146b3`) is already landed on main; Phase A inherits the structured `transcode`/`stream` shape rather than building it from scattered consts. |
| Two-layer config model — `AppConfig` (server) ↔ `clientConfig` (client) | Preserve the deliberate symmetry. `client/src/config/appConfig.ts`'s docstring states verbatim "Mirrors the server's `AppConfig` shape" (commits `680e209`, `dbe2a8b`). Same nested namespaces (`playback`, `streaming`, `transcode`, `stream`, etc.) on both sides where the concept overlaps. |
| DB schema | Identical. WAL pragma, FK pragma, `CREATE TABLE IF NOT EXISTS` migrations. (`05-Database-Layer.md`.) |
| `content_fingerprint` formula `<sizeBytes>:<sha1(first 64 KB)>` | Same. |
| Job ID derivation `sha1(contentKey | resolution | startS | endS)` | Same. |
| OTel attribute names (e.g. `kill_reason`, `job.id`, `job.video_id`, `chunk.start_s`, `hwaccel.hdr_tonemap`) | Same. See `01-Streaming-Layer.md` §1.5 for the full surface including `transcode_silent_failure`. |
| `kill_reason` enum values (`client_request`, `client_disconnected`, `stream_idle_timeout`, `orphan_no_connection`, `max_encode_timeout`, `cascade_retry`, `server_shutdown`) | Same. |
| Logging policy | Implementation-agnostic. `docs/architecture/Observability/01-Logging-Policy.md` survives unchanged. |
| One-shot vs snapshot span-attribute pattern (commits `419861a`, `b6db738`) | Rust `tracing` layer must support both: long-lived spans (`playback.session`) accept post-creation `set_attribute(...)` for one-shot session metrics (`time_to_first_frame_ms`) and `add_event(...)` for periodic snapshots. (`02-Observability-Layer.md` §1.4.) |
| Test side-effects policy (per-PID temp dir, orphan reaper) | Re-implement against real SQLite + real ffmpeg in Rust. (`docs/architecture/Testing/00-Side-Effects-Policy.md`.) |
| Tmp segment layout `tmp/segments/<jobId>/init.mp4` + `segment_NNNN.m4s` | Same. (`06-File-Handling-Layer.md`.) |
| Subscription transport | Same — `graphql-ws` WebSocket on both sides (current Bun server already wires `graphql-ws/lib/use/bun` at `server/src/index.ts:6, 87-92, 111-112`). The Rust port reproduces it via `async-graphql-axum`'s WebSocket subscription handler. No client change. |

## 7. Migration order

Phased, with each phase verifiable before the next. The Rust workspace lives at `server-rust/` alongside the Bun `server/` during the transition — both can build, only one runs at a time.

### Phase A — DB foundation (no external deps)

Goal: identical DB schema running in Rust, with the same migration semantics.

- Scaffold `server-rust/` cargo workspace.
- Copy `server/src/db/migrate.ts`'s SQL strings verbatim into `server-rust/src/db/migrate.rs`.
- Port `server/src/db/queries/<table>.ts` → `server-rust/src/db/queries/<table>.rs`. One file per table, struct-per-row.
- Run both servers' migrations against a fresh DB; `sqlite3 .schema` should match byte-for-byte.

**Verify**: `cargo test --test db_schema_parity` runs both migrators and diffs the output of `PRAGMA table_info(<table>)` for every table.

### Phase B — GraphQL surface

Goal: byte-identical SDL exposed by an `async-graphql` server, no resolvers wired beyond a stub.

- Port `server/src/graphql/schema.ts` SDL → `async-graphql` derive macros (`SimpleObject`, `Object`, `Union`, `InputObject`, `Enum`).
- Implement `server/src/graphql/relay.ts` global ID helpers in `server-rust/src/graphql/relay.rs`.
- Add a Bun-side script `scripts/check-sdl-parity.ts` that introspects both servers and diffs.

**Verify**: introspection diff is empty. Add a CI check.

### Phase C — Streaming pipeline

Goal: the binary stream protocol works end-to-end, with concurrent-jobs cap enforcement and idle-timeout semantics intact.

- Port `server/src/services/chunker.ts` + `server/src/services/ffmpegPool.ts` → `server-rust/src/services/chunker/` + `ffmpeg_pool/`.
  - In-memory `jobStore` → `Arc<DashMap<JobId, ActiveJob>>`.
  - `ffmpegPool`'s reservation/cap/dying-set bookkeeping → `Arc<Semaphore>` with `config.transcode.max_concurrent_jobs` permits + a `dying_jobs` set on `AppState` so SIGTERM frees the slot immediately.
  - Segment watcher → `notify::RecommendedWatcher` + `tokio::sync::mpsc`.
- Port `server/src/services/ffmpegFile.ts` argv builder → `server-rust/src/services/ffmpeg_file.rs`. Cover the three-tier VAAPI cascade per `01-Streaming-Layer.md`.
- Port `server/src/services/ffmpegPath.ts` → `server-rust/src/services/ffmpeg_path.rs` (no `setFfmpegPath` global).
- Port `server/src/routes/stream.ts` → an `axum` handler at `GET /stream/:job_id` returning `Body::from_stream`.

**Verify**: capture `/stream/<id>` for the same job from both servers, `cmp` the byte streams. Open a parity harness as a sibling test once the Rust handler responds.

### Phase D — Library scanner + scan subscription

Goal: scanner walks a real library, populates the DB, emits scan-progress events to subscribed clients.

- Port `server/src/services/libraryScanner.ts` → `server-rust/src/services/library_scanner.rs` using `walkdir` + `buffer_unordered(4)` (per `06-File-Handling-Layer.md`).
- Port `server/src/services/scanStore.ts` (in-memory pub/sub) → `tokio::sync::watch::Sender` for "current scan state" + a `broadcast` for individual progress events.
- Port `server/src/services/diskCache.ts` → `prune_lru_jobs()`.
- Wire `query.libraries`, `query.video`, `subscription.libraryScanUpdated` resolvers.

**Verify**: scan a known library; the row count and per-table contents match the Bun server's. Run a long-running subscription and observe progress events on both servers.

### Phase E — Cutover

Goal: `Bun.serve()` is decommissioned; only `axum` runs.

- Port `server/src/index.ts` boot sequence → `server-rust/src/main.rs`. (See `04-Web-Server-Layer.md`.)
- Port `server/src/services/jobRestore.ts` boot-time job restoration policy.
- Port `server/src/telemetry/*` → `server-rust/src/telemetry/` using `tracing` + `tracing-opentelemetry` + `opentelemetry-otlp` (per `02-Observability-Layer.md`).
- Switch the Rsbuild dev proxy / Tauri bundle to point at the Rust server's port.
- Delete `server/`. Update `package.json` workspace, `bun run dev` calls `cargo run`, lint scripts, `bun run lint` becomes `cargo clippy`.

**Verify**: a fresh `bun install && cargo run` boots the same surface the Bun server presented. Run the React client end-to-end; play a 4K file; observe a single trace in Seq spanning client → Rust server.

### Phase F — Tauri packaging

Covered in `08-Tauri-Packaging.md`. Bundling ffmpeg, code-signing, self-hosted updates.

### Phase G — Sharing (later)

Out of scope for the Rust port itself. Forward constraints established in phases A-F (per `Sharing/00-Peer-Streaming.md`). When sharing implementation starts:

- Identity DB tables (`node_keypair`, `trusted_peers`, `issued_invites`, `received_invites`).
- `RequestContext::Identity` enum filled in (today: `Local` only).
- Invite-token signing + verification (`ed25519-dalek`).
- Configurable bind address + CORS allowlist exposed in settings UI.
- Per-resolver scope checks against the request's identity grant.

## 8. Workspace layout (post-cutover)

```
xstream/
├── client/                          # unchanged across the migration
├── server-rust/                     # Rust workspace
│   ├── Cargo.toml                   # workspace root
│   ├── crates/
│   │   ├── xstream-server/          # axum + GraphQL handlers + main()
│   │   ├── xstream-db/              # rusqlite migrations + queries
│   │   ├── xstream-chunker/         # ffmpeg supervision + segment cache
│   │   ├── xstream-scanner/         # walkdir + ffprobe pipeline
│   │   ├── xstream-graphql/         # async-graphql schema + resolvers
│   │   └── xstream-telemetry/       # tracing + OTLP setup
│   └── tests/
│       └── parity/                  # SDL diff, wire framing diff
├── src-tauri/                       # Tauri config + main shell, see 08-Tauri-Packaging.md
├── scripts/
│   ├── ffmpeg-manifest.json         # unchanged across migration
│   └── setup-ffmpeg                 # unchanged; manages vendor/ffmpeg/<platform>
├── docs/                            # this set of docs
└── tmp/                             # gitignored: cache DB + segment cache (cache class)
```

The crate split is suggestive, not mandatory. A single `xstream-server` crate with internal modules works for the initial port; the split exists to make it obvious where future code goes (and to keep build times reasonable as the codebase grows).

## 9. CI pipeline notes

The transition phase (both servers buildable in the same repo):

- `bun run lint` runs `tsc --noEmit && eslint src` for `client/` and `server/`.
- `cargo clippy --workspace -- -D warnings` runs for `server-rust/`.
- `cargo test --workspace` runs Rust integration tests.
- The SDL parity check runs both servers' introspection (or both schema strings) and diffs.

Post-cutover, `bun run lint` only covers `client/`. The Rust workspace owns its own CI lane.

## Cross-references

- [`00-Rust-Tauri-Port.md`](00-Rust-Tauri-Port.md) — anchor doc with stable contracts.
- [`01-Streaming-Layer.md`](01-Streaming-Layer.md) — segment serving, concurrent-jobs cap, ffmpeg supervision.
- [`02-Observability-Layer.md`](02-Observability-Layer.md) — tracing + OTLP, traceparent threading.
- [`03-GraphQL-Layer.md`](03-GraphQL-Layer.md) — async-graphql migration, SDL parity, subscription transport (already WebSocket on the Bun side).
- [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) — axum router, RequestContext middleware, configurable CORS/bind.
- [`05-Database-Layer.md`](05-Database-Layer.md) — rusqlite (bundled), two-DB split for sharing.
- [`06-File-Handling-Layer.md`](06-File-Handling-Layer.md) — walkdir + notify, content-addressed cache index.
- [`Sharing/00-Peer-Streaming.md`](../../architecture/Sharing/00-Peer-Streaming.md) — peer-to-peer streaming model.
- [`08-Tauri-Packaging.md`](08-Tauri-Packaging.md) — bundling, signing, self-hosted updates.
