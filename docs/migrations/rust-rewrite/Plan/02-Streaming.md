# Step 2 — Rust Streaming

## Where this step sits

Second Rust step. Predecessor: [Step 1 — GraphQL + Observability](01-GraphQL-And-Observability.md). Successor: [Step 3 — Tauri Packaging](03-Tauri-Packaging.md).

At the end of this step, with the single `useRustBackend` flag on, the entire product runs on the Rust binary at `localhost:3002` — both GraphQL and `/stream/:jobId`. With the flag off, the entire product runs on Bun at `localhost:3001`. There is no mixed mode: the two services are runtime-independent (neither knows about the other's job store, segment cache, or DB writes), so split traffic produces a 404 / split-brain. They are flipped together as one backend.

> **Single-flag rule (post-Step-2 correction).** The original Step 2 design proposed two independent flags (`useRustGraphQL` + `useRustStreaming`) so each channel could be flipped alone for per-channel A/B and regression isolation. Real-world testing on `feat/rust-step2-streaming` showed that combination produces a structural failure: Bun creates a job in its in-memory store, the client routes `/stream/<id>` to Rust, Rust has no record of the id → universal 404 "Job not found." The independence the docs intended is a *runtime* property (no shared state between servers), not a flag-flippability property. The two flags were collapsed to one (`useRustBackend`) before the PR merged.

## Scope

**In:**

- `axum` `/stream/:jobId` endpoint with the existing length-prefixed binary framing.
- Chunker port: per-connection pull isolation, per-consumer `mpsc` channel for backpressure.
- ffmpeg pool: `Arc<Semaphore>` cap (today's `config.transcode.maxConcurrentJobs`), dying-set exclusion, SIGTERM → SIGKILL escalation grace, `KillReason` union, shutdown sweep.
- Content-addressed cache key `(videoId, resolution, startS, endS)` decoupled from job ID. Cache index lives alongside the segment files.
- `transcode.job` and `stream.request` span surfaces preserved (including `transcode_silent_failure` event).
- Single `useRustBackend` flag wired into both the Relay environment and the streaming service — toggles GraphQL + `/stream/*` together.

**Out:**

- Tauri shell, embedded server, distribution — Steps [3](03-Tauri-Packaging.md) and [4](04-Release.md).
- Peer-to-peer sharing. Forward-constrained but not shipped — see [`../../../architecture/Sharing/00-Peer-Streaming.md`](../../../architecture/Sharing/00-Peer-Streaming.md).
- Removing the Bun stream endpoint. Both keep running until [Step 3](03-Tauri-Packaging.md).

## Stable contracts to preserve

Authoritative list at [`../00-Rust-Tauri-Port.md`](../00-Rust-Tauri-Port.md). For Step 2 specifically:

- **`/stream/:jobId` framing** — 4-byte big-endian uint32 length prefix + raw fMP4 bytes, init segment **first**. Length prefix is per-chunk, not per-stream.
- **No JSON serialization in the request path.** Same reasoning as the Tauri-IPC ban in [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md) §3 — any IPC layer that re-encodes the body breaks framing.
- **Pull-based** — the server emits chunks only when the client requests, never push. Detail in [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md).
- **Init-segment-first invariant** — every per-chunk re-init scenario (resolution switch, MSE detach recovery) must keep this discipline. Detail in [`../../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md`](../../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md).

## Cutover mechanism

Side-by-side, single-flag.

- **Two `/stream` endpoints, two ports.** Bun's `/stream/:jobId` keeps serving on `localhost:3001`. Rust binds the same port chosen for Step 1's GraphQL service (`localhost:3002`); one Rust process serves both `/graphql` and `/stream/*`, matching the Bun shape.
- **Single client flag.** `useRustBackend` in [`client/src/config/flagRegistry.ts`](../../../../client/src/config/flagRegistry.ts) routes BOTH GraphQL and `/stream/*` to the same backend. `client/src/config/rustOrigin.ts` exposes one predicate (`isRustBackendEnabled()`) consumed by both `relay/environment.ts` and `services/streamingService.ts`. The two backends are runtime-independent — neither knows about the other's job store, segment cache, or DB writes — so splitting traffic between them produces 404s. They are flipped together as one backend.
- **Bun is the default.** `main` builds with the flag false. `main` stays fully functional unless the user opts in.
- **Both servers always run in dev.** `mprocs.yaml` boots Bun (3001) and Rust (3002) in parallel so a flag flip is instant — no restart needed. Reload required because `rustOrigin.ts` snapshots the flag value at module-init.
- **Module-init snapshot, not per-call read.** `rustOrigin.ts` reads `getFlag(useRustBackend, false)` exactly once at module load and caches it in `RUST_BACKEND_ENABLED`. Both `graphqlHttpUrl()` and `streamUrl()` consult the cached value. This is load-bearing: a per-call read for `streamUrl` would let a mid-session toggle flip /stream while GraphQL (frozen by `relay/environment.ts` at module-init) stayed on the previous backend, producing 404 split-brain. The single-snapshot rule keeps both channels in lockstep — flip in Settings → reload → both move together.

## Pointers to layer references

- [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md) — primary. Stream endpoint + chunker + ffmpegPool — pull contract → axum, semaphore cap → `Arc<Semaphore>` + dying-set, content-addressed cache key, per-consumer pull isolation, full span surface.
- [`../06-File-Handling-Layer.md`](../06-File-Handling-Layer.md) — ffmpeg manifest pinning per platform, content-addressed cache index, two-DB split for the cache layer.
- [`../07-Bun-To-Rust-Migration.md`](../07-Bun-To-Rust-Migration.md) — runtime model + concurrency primitives map: `Bun.spawn` → `tokio::process`, `ReadableStream` pull → `mpsc` channels, `setTimeout` → `tokio::time::sleep`.
- [`../../../architecture/Streaming/`](../../../architecture/Streaming/) — full streaming protocol reference, demand-driven streaming, single-SourceBuffer ADR, chunk-pipeline invariants. Authoritative on the client-facing contract.

## Sharing forward-constraints to honour

Pointer-only:

- **Per-connection pull isolation** — every `GET /stream/:jobId` has its own watcher / channel / mpsc receiver. No cross-connection state. Detail in [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md).
- **Content-addressed cache key decoupled from job ID** — `(videoId, resolution, startS, endS)` indexes the cache, not the job ID. A peer streaming the same content produces a cache hit. Detail in [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md) and [`../06-File-Handling-Layer.md`](../06-File-Handling-Layer.md).
- **Per-consumer mpsc backpressure** — the chunker drops nothing for a slow consumer; backpressure pushes back to ffmpeg, not to other consumers. Detail in [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md).
- **Cache eviction keeps the index consistent** — segment file deletion and index entry removal are atomic. Detail in [`../06-File-Handling-Layer.md`](../06-File-Handling-Layer.md).

## Lessons from Step 1 that apply here

These are established patterns as of PR #39. An implementing agent must follow them — they are no longer open questions.

### Error / panic discipline (§14 of `docs/code-style/Invariants/00-Never-Violate.md`)

No `expect`/`unwrap`/silent-discard in production Rust code. The chunker and ffmpeg pool are the highest exposure surface in Step 2 — every `Mutex::lock()`, every `mpsc::send()`, every `Child::wait()` must return a typed `Result`. Mutex poisoning is a `DbError::MutexPoisoned` variant, not a panic. If a subprocess exits unexpectedly, that is a typed error in `AppError`, not an unwrap site. `main()` already returns `AppResult<()>`; all Step 2 code paths must chain through it.

### Mapper Option-shape + warn-then-degrade convention

Any new enum conversion from a DB or wire value uses `Option<Self>` (not a silent default). Call sites log `tracing::warn!` with the row id and raw value before degrading. The pattern is established in `graphql/types/{library,video,transcode_job}.rs`. Step 2 adds `KillReason` and `StreamError` variants — follow the same shape.

### traceparent threading — no additional wiring needed

The `extract_request_context` middleware already propagates `traceparent` into every handler's `OtelContext`. New Step 2 spans (`transcode.job`, `chunk.stream`, `stream.request`) are created as children of the per-request span automatically — no additional W3C extraction code is needed. What the implementing agent must do is confirm the **span names and key attributes** match the Bun side (see "Span surface validation" in Decisions to lock). The Bun span surface is documented in `docs/architecture/Observability/server/00-Spans.md`.

### ErrorLogger extension covers new resolvers

`server-rust/src/graphql/error_logger.rs` fires `tracing::error!` per `errors[]` entry inside the per-request `http.request` span. Any new GraphQL resolver added in Step 2 (e.g., `startTranscode` write path) gets error logging for free — no per-resolver logging boilerplate needed.

### DB write functions slot into existing query files

The `db/queries/` split is already in place (libraries, videos, jobs, video_metadata, watchlist, user_settings, playback_history). Step 2 needs write functions: `insert_job`, `update_job_status`, `insert_segment`, `delete_segment`, and segment-index maintenance. These slot in next to the existing read functions in `db/queries/jobs.rs` and a new `db/queries/segments.rs`. Follow the `#[cfg(test)] mod tests` pattern — every new query file gets a test block.

### localStorage-first flag system

`useRustBackend` is covered by the general flag mechanism landed in Step 1. It lives in `client/src/config/flagRegistry.ts` with a default of `false` — the localStorage-first system handles everything else (local override wins, server hydration fills the rest, reset-to-default via FlagsTab). One key, one switch — toggling in the UI updates both localStorage and the server-side `user_settings` row atomically.

### Test checklist — tests are the spec, they travel with the port

Every Bun test that covers streaming behaviour must be ported before Step 2 ships. The following Bun test files are the porting checklist. Mark each as ported in the PR description:

| Bun test | Rust target location | Notes |
|---|---|---|
| `server/src/services/__tests__/chunker.inflight.test.ts` | `server-rust/src/services/chunker/tests/inflight.rs` | In-flight deduplication — same semaphore semantics |
| `server/src/services/__tests__/chunker.encode.test.ts` | `server-rust/src/services/chunker/tests/encode.rs` | Round-trip encode + segment write |
| `server/src/services/__tests__/chunker.cache-stability.test.ts` | `server-rust/src/services/chunker/tests/cache_stability.rs` | Cache key stability across restarts |
| `server/src/services/__tests__/chunker.span-events.test.ts` | `server-rust/src/services/chunker/tests/span_events.rs` | `transcode_silent_failure` event fires |
| `server/src/services/__tests__/chunker.telemetry.test.ts` | `server-rust/src/services/chunker/tests/telemetry.rs` | OTel span attributes on the job span |
| `server/src/services/__tests__/ffmpegPool.test.ts` | `server-rust/src/services/ffmpeg_pool/tests/` | Cap enforcement, dying-set exclusion, SIGKILL escalation |
| `server/src/routes/__tests__/segments.test.ts` | `server-rust/src/routes/tests/segments.rs` | Segment byte-range serve correctness |
| `server/src/routes/__tests__/stream.pull.test.ts` | `server-rust/src/routes/tests/stream_pull.rs` | Pull contract — chunks emitted only on demand |
| `server/src/routes/__tests__/stream.kill-paths.test.ts` | `server-rust/src/routes/tests/stream_kill.rs` | All `KillReason` variants reachable |
| `server/src/routes/__tests__/stream.telemetry.test.ts` | `server-rust/src/routes/tests/stream_telemetry.rs` | `stream.request` span attributes |
| `server/src/services/__tests__/chunker.subscription-error-atomicity.test.ts` | `server-rust/src/services/chunker/tests/subscription_error_atomicity.rs` | This was skipped in Step 1; Step 2 is the first port that exercises the chunker — port it here |

> Target file paths above are proposed, not pre-created. The implementing agent picks the actual layout; what matters is that every Bun test in the left column has a counterpart before the PR ships.

## Decisions to lock before starting

These were open on day one of Step 2; all five are now locked by implementation (PR #41).

1. **Origin discovery for `/stream`.** Locked: reuses the Step 1 mechanism. Hard-coded `localhost:3002` in `rustOrigin.ts` serves both `/graphql` and `/stream/*`. No second discovery mechanism introduced.
2. **Cache directory during cutover.** Locked: `tmp/segments-rust/` for Rust; Bun keeps `tmp/segments/`. Implemented in `AppConfig::dev_defaults` at `server-rust/src/config.rs`. See `Plan/Open-Questions.md §10.4`.
3. **Flag count and mid-session flip.** Locked: ONE flag (`useRustBackend`) routes both GraphQL and `/stream/*`. The original two-flag design (`useRustGraphQL` + `useRustStreaming`) was shown to produce 404 split-brain when the flags drift apart. GraphQL routing is read at module-init (reload required); streaming routing is read at fetch-time but in practice flips with the GraphQL reload. See `Plan/Open-Questions.md §10.5`.
4. **Rust ffmpeg subprocess wrapper.** Locked: hand-rolled `tokio::process::Command` with `kill_on_drop(true)`; POSIX SIGTERM/SIGKILL via `nix` crate in `services/ffmpeg_pool.rs`. See `Plan/Open-Questions.md §10.6`.
5. **Span surface validation.** Locked (plan only — not yet executed): Seq diff approach documented in PR #41 test plan. `transcode_progress` periodic events are the known gap. See `Plan/Open-Questions.md §10.7` and "Skipped" section below.
6. **Stale-segment-dir wipe on re-encode.** Locked: `start_transcode` calls `remove_dir_all` (best-effort, ignores `NotFound`) before `create_dir_all` so a job re-encoded after error/interrupt cannot serve a stale-tail mix. Documented contract was already in `services/job_restore.rs`; this PR honors it in code. Surfaced by a "Invalid Top-Level Box" failure on `feat/rust-step2-streaming` traced to interleaved big/tiny segment files in `tmp/segments-rust/<id>/` from successive killed runs.

## What shipped beyond the spec (PR #41)

### Cache-key seam landed (§4.1 in `01-Streaming-Layer.md`)

The Rust port keeps the byte-identical SHA-1 hash for the in-memory job store but introduces a separate structural lookup at `services/cache_index.rs::lookup(SegmentCacheKey { video_id, resolution, start_s, end_s })`. The chunker tries the `cache_index` lookup BEFORE computing the hash, so a future peer with a different hash function can still hit the cache. The hash is now an internal id, not the cache primitive — the seam `01-Streaming-Layer.md §4.1` foreshadowed is now in place.

### New module surface in `server-rust/src/services/`

The chunker port introduced these modules:

| Module | Role |
|---|---|
| `chunker.rs` | Orchestrator + cascade-as-loop (`run_cascade`) |
| `ffmpeg_pool.rs` | `Arc<Semaphore>` cap + dying-set + SIGTERM/SIGKILL escalation |
| `ffmpeg_path.rs` | Manifest-pinned binary resolver (typed `FfmpegPathError`) |
| `ffmpeg_file.rs` | `FfmpegFile::probe` + pure `build_encode_argv` |
| `hw_accel.rs` | VAAPI probe + `HwAccelMode::from_env` + typed `HwAccelError` |
| `active_job.rs` | `Arc<Mutex<ActiveJobInner>>` + `Notify` for in-memory job state |
| `job_store.rs` | `DashMap<String, ActiveJob>` |
| `kill_reason.rs` | Locked wire-format strings + Option-shape mapper |
| `cache_index.rs` | Structural-tuple lookup against `transcode_jobs` |
| `job_restore.rs` | Boot-time stale-job sweep |

Plus `routes/stream.rs` (length-prefixed binary streamer) and `config::AppContext` (bundle threaded through schema + router).

New crates landed: `dashmap`, `notify`, `bytes`, `tokio-stream`, `nix` (Unix only).

### `AppContext` as the DI bundle

`config::AppContext` (a `Clone` struct) carries long-lived state: `db`, `pool`, `ffmpeg_paths`, `hw_accel`, `vaapi_state`, `job_store`, `config`. It is threaded through both the GraphQL schema (`build_schema(ctx)`) and the axum router (`Extension(ctx)` layer). Step 3 must NOT re-introduce module globals alongside it.

### `build_encode_argv` shape

`ffmpeg_file::build_encode_argv` returns `Vec<String>` split at the input boundary — a pure value transform with no command-builder mutation. The chunker assembles `[pre_input..., "-i", input, post_input..., output_pattern]`. This makes the argv builder trivially testable via window-match assertions and eliminates the fluent-ffmpeg module-global `setFfmpegPath` footgun.

### Cascade is a loop, not recursion

Per `01-Streaming-Layer.md §3.4` — implemented in `services/chunker.rs::run_cascade` as `loop { match … }` over a `CascadeTier { FastVaapi, SwPadVaapi, Software }` enum. `vaapi_state` cache writes happen between iterations so subsequent chunks skip already-known-failing tiers.

## Skipped — surfaced for follow-up

Two pieces from the Bun chunker's contract were deferred. A future agent picking up Step 3 or a targeted follow-up step should address these before the Tauri package ships.

### 1. `transcode_progress` periodic span events

Bun's chunker uses fluent-ffmpeg's per-second progress callback to emit `transcode_progress` events (~10 s cadence) on the `transcode.job` span with `frames`, `fps`, `kbps`, `timemark`, `percent`. The Rust port spawns ffmpeg directly via `tokio::process` and does not currently parse `frame=N fps=… time=…` lines from stderr. All other span events (`transcode_started`, `transcode_complete`, `transcode_killed`, `transcode_silent_failure`) still emit correctly.

**Follow-up:** add a stderr-line parser in `services/ffmpeg_pool.rs`. The stderr ring buffer is already in place; this is parsing logic on top of it. The parser pattern is a line-by-line scan for `frame=` prefix; the parsed struct maps directly to the existing `transcode_progress` event attribute set in `docs/architecture/Observability/server/00-Spans.md`.

### 2. `orphan_no_connection` and `max_encode_timeout` watchdog timers

The route's `kill_job(ClientDisconnected)` on the last-connection-drop covers the most common abandonment path. The absolute-budget timers (Bun's `chunker.ts:460` orphan timer, `chunker.ts:480` max-encode timer) are not yet wired in the Rust port.

**Follow-up:** add `tokio::spawn`-driven timers in `services/chunker.rs::run_cascade` keyed on `AppConfig::orphan_timeout_ms` (30 s default) and `AppConfig::max_encode_rate_multiplier` (3× default). The two `kill_reason` values (`orphan_no_connection`, `max_encode_timeout`) are already defined in `kill_reason.rs`; the timers are the missing callers.

## Lessons from Step 2 that apply to Step 3 and beyond

These are now established conventions in the Rust workspace. Step 3's implementing agent inherits them.

### `AppContext` is the dependency-injection bundle

Long-lived state (`db`, `pool`, `ffmpeg_paths`, `hw_accel`, `vaapi_state`, `job_store`, `config`) lives on a single `Clone` struct threaded through both the GraphQL schema and the axum router via `Extension`. Do NOT re-introduce module globals in Step 3 (Tauri packaging). Any new long-lived state goes on `AppContext`.

### `build_schema_for_tests(db)` exists for integration tests

Integration tests that don't have a real ffmpeg binary construct a stub `AppContext::for_tests` with `/bin/true` paths. This pattern is in place; Step 3 tests that exercise the server layer should follow it.

### No-`unwrap`/`expect` discipline held through the chunker port

Mutex poisoning surfaces as `.lock().expect("…poisoned…")` only inside `ActiveJob::with_inner*` where the panic is a structural invariant; everywhere else returns `Result`. This is §14 of `docs/code-style/Invariants/00-Never-Violate.md` applied to the highest-exposure surface in the codebase.

### `build_encode_argv` is a pure value transform

`build_encode_argv` returns `Vec<String>` split at the input boundary. The chunker assembles the full argv slice. This makes argv construction trivially testable — no side-effects, no fluent-ffmpeg chain mutation, no module-global write. Keep this shape for any future codec/filter additions.

### The cascade is a loop, not recursion

`services/chunker.rs::run_cascade` is `loop { match … }` over `CascadeTier`. This eliminates the recursive-call + duplicated-event-emission problem in the Bun chunker. When adding a new HW backend tier (VideoToolbox, QSV), extend the enum — do not re-introduce recursion.
