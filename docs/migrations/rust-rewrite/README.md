# Rust + Tauri Rewrite

The Bun/TypeScript server is a prototype used to validate the architecture. The long-term target is a Rust rewrite shipped together with the React/Relay client as a Tauri desktop app for Linux, Windows, and macOS, distributed by the user (no third-party app stores). A second forward requirement — peer-to-peer media sharing — is baked into the Rust port's design without shipping in v1.

This folder is the authoritative migration plan: a future agent should be able to read it end-to-end and execute the rewrite. The `00-Rust-Tauri-Port.md` anchor + the nine `01`-`09` deep-dives are self-contained; the synthesis docs (`07`, `08`, `09`) cross-link rather than duplicate.

## Reading order

1. **`00-Rust-Tauri-Port.md`** — anchor doc. Stable contracts the rewrite must preserve; forward pointer to peer sharing.
2. **`01`-`06`** — layer-by-layer deep-dives. Each follows the same shape: current Bun implementation (with `file:line` excerpts), stable contracts, Rust target shape with locked crate picks, open questions.
3. **`07`** — synthesis: runtime model shift, concurrency primitives map, idiom translations, phased migration order, post-cutover workspace layout.
4. **`08`** — Tauri packaging: prescriptive spec — bundle config, embedded server, ffmpeg bundling, Ed25519 self-hosted updates, code-signing per OS, CI matrix.
5. **`09`** — Tauri packaging internals: pedagogical walkthrough — what `tauri build` actually does, what's inside an installed Tauri app per OS, how `tauri-plugin-updater` actually applies updates, and the Electron-derived mental-model corrections. Read this for *why*; read `08` for *what to configure*.

Forward design that ships AFTER the rewrite (peer-to-peer sharing) lives at [`docs/architecture/Sharing/00-Peer-Streaming.md`](../../architecture/Sharing/00-Peer-Streaming.md). Forward constraints from that design are inlined in the relevant layer docs here so the rewrite does not foreclose sharing.

## Cross-migration principles

These principles were codified during Step 1 (PR #39) and apply to every subsequent step:

- **Tests are the spec; they travel with the port.** Every Bun test that covers behaviour being ported must have a counterpart in the Rust workspace before the step's PR ships. Skipping a test because "it tests Step N+1 behaviour" is acceptable only when that behaviour is explicitly out of scope for the current step and documented as such in the playbook.
- **No `expect`/`unwrap`/silent-discard in production code (§14).** All fallible paths return `Result`. Mutex poisoning is a `DbError::MutexPoisoned` variant. See `docs/code-style/Invariants/00-Never-Violate.md` §14.
- **Mapper Option-shape + warn-then-degrade.** Enum conversions from DB/wire values return `Option<Self>`. Call sites log `tracing::warn!` with the row id and raw value before degrading — never return a silent default.
- **Per-request access log shape is locked.** Both Bun and Rust emit one structured `info` per request: `method`, `path`, `status`, `duration_ms`, `trace_id`. Do not change the field set without updating both servers.

## Topic files

| File | Hook |
|---|---|
| [`00-Rust-Tauri-Port.md`](00-Rust-Tauri-Port.md) | Anchor: stable contracts (SDL, global IDs, binary framing, subscription transport, bundleable ffmpeg) + forward pointer to Sharing. |
| [`01-Streaming-Layer.md`](01-Streaming-Layer.md) | Stream endpoint + chunker + ffmpegPool — pull contract → axum, `config.transcode.maxConcurrentJobs` cap → `Arc<Semaphore>` + dying-set, content-addressed cache key, per-consumer pull isolation, full span surface incl. `transcode_silent_failure`. |
| [`02-Observability-Layer.md`](02-Observability-Layer.md) | OTel SDK → tracing + opentelemetry-otlp; W3C extraction middleware; cross-peer traceparent flow. |
| [`03-GraphQL-Layer.md`](03-GraphQL-Layer.md) | graphql-yoga → async-graphql; SDL parity; typed-error union; subscription transport already on `graphql-ws` WebSocket on the Bun side. |
| [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) | Bun.serve → axum router + tower stack; RequestContext middleware threaded from day one; configurable CORS + bind addr. |
| [`05-Database-Layer.md`](05-Database-Layer.md) | bun:sqlite → rusqlite (bundled); identical schema + WAL pragma; two-DB split (cache vs identity) for forward sharing. |
| [`06-File-Handling-Layer.md`](06-File-Handling-Layer.md) | Library walk → walkdir + buffer_unordered; fs.watch → notify; ffmpeg manifest pinning; content-addressed cache index. |
| [`07-Bun-To-Rust-Migration.md`](07-Bun-To-Rust-Migration.md) | Synthesis: runtime model, concurrency primitives, idiom translations, locked crates, phased migration order (A→G), post-cutover workspace layout. |
| [`08-Tauri-Packaging.md`](08-Tauri-Packaging.md) | Tauri shell + bundle layout, embedded server (in-process loopback), bundled jellyfin-ffmpeg, Ed25519 self-hosted updates, code-signing per OS, CI matrix. |
| [`09-Tauri-Packaging-Internals.md`](09-Tauri-Packaging-Internals.md) | Pedagogical deep-dive on how Tauri produces cross-platform apps — source → cargo build → bundle resources → installer → installed app → `tauri-plugin-updater`. Walks the architect's mental model and corrects what's actually happening (no Chromium ships, no sidecar process, full-bundle updates, Ed25519-not-OS-chain update verification). Companion to `08`. |
| [`Architecture-Review-2026-04-28.md`](Architecture-Review-2026-04-28.md) | Snapshot of the architecture review held immediately before Step 1 implementation kicked off. Captures open questions, locked decisions, and rationale that fed into the `Plan/` playbook. |
| [`Plan/`](Plan/00-README.md) | Step-by-step execution playbook: one doc per step (`01-GraphQL-And-Observability.md`, `02-Streaming.md`, `03-Tauri-Packaging.md`, `04-Release.md`) plus an `Open-Questions.md` register. The 01–09 layer references above answer "what must each layer become"; the Plan docs answer "what do I do, in what order, what is in/out of scope for this step." |

## Status

Documentation set complete (with `09-Tauri-Packaging-Internals.md` added 2026-04-29).

**Step 1 — GraphQL + Observability** merged on `main` as **PR #39** (2026-04-30).

**Step 2 — Streaming** merged on `main` as **PR #41** (2026-05-01, worktree `xstream-rust-step2/`). All four commit groups landed:

- DB writes + content-addressed cache index + `job_restore` (Group 1).
- `ffmpeg_path` manifest resolver (Group 2a).
- `config` + `ffmpeg_file` (probe + argv builders, software + VAAPI HDR/sw-pad cascades) (Group 2b).
- `hw_accel` probe + selection (Group 2c).
- `chunker` + `ffmpeg_pool` + `routes/stream.rs` + `start_transcode` resolver wired (Group 2/3).
- Single `useRustBackend` flag wired on the client — replaces the previously-planned `useRustGraphQL` + `useRustStreaming` pair. Covers GraphQL (`graphqlHttpUrl`/`graphqlWsUrl`) and streaming (`streamUrl(jobId)`) together. The two services are runtime-independent (no shared state), so a split-flag design produces 404 / split-brain — surfaced during Step 2 testing and folded into the consolidation. Read once at module-init in `rustOrigin.ts` (cached in `RUST_BACKEND_ENABLED`) so `/stream` and `/graphql` cannot diverge mid-session.
- Per-process DB isolation: Bun keeps `tmp/xstream.db`, Rust uses `tmp/xstream-rust.db`. Rust's DB is seeded once by copying Bun's (`cp tmp/xstream.db tmp/xstream-rust.db`) so libraries + videos come along; the cache tables (`transcode_jobs`, `segments`) are per-process from then on. Without this, deterministic content-addressed job-ids cross-contaminate: Bun and Rust both compute the same id for the same content but write conflicting `segment_dir` values into the row, and whichever backend reads it back tries to serve from the wrong filesystem.
- Stale-segment-dir wipe in `start_transcode`: `remove_dir_all` (best-effort, ignores `NotFound`) before `create_dir_all`. Honors the contract documented in `services/job_restore.rs`. Without this, a job re-encoded after error/interrupt serves a fresh-prefix-plus-stale-tail mix that Firefox rejects with "Invalid Top-Level Box".

Skipped, surfaced for follow-up: `transcode_progress` periodic span events (no fluent-ffmpeg stderr parser yet), the `orphan_no_connection` and `max_encode_timeout` watchdog timers (the route's `client_disconnected` kill covers the most common abandonment).

**Step 3 — Tauri packaging** in flight on `feat/rust-step3-tauri` (PR #43). MVP commits:

- `c885653` — server-side refactor: `pub struct ServerConfig` (bind_addr, db_path, segment_dir, project_root, ffmpeg_override) + `pub async fn run(ServerConfig) -> AppResult<()>` extracted from `main()`. `AppConfig::with_paths(segment_dir, db_path)` added so explicit-path callers bypass `dev_defaults`. `main.rs` slimmed to env-read + `xstream_server::run`.
- `8687c85` — new `src-tauri/` workspace member. Picks a free `127.0.0.1:<port>`, spawns `xstream_server::run` on the Tauri async runtime with `app_local_data_dir/xstream.db` + `app_cache_dir/segments` + bundled ffmpeg; injects port via `webview.eval("window.__XSTREAM_SERVER_PORT__ = N")`. **No Tauri IPC in the request path** — `/graphql` and `/stream/*` stay HTTP, preserving the length-prefixed binary stream contract. `client/src/config/rustOrigin.ts` reads `window.__XSTREAM_SERVER_PORT__` at module init, overriding both the `useRustBackend` flag and the `localhost:3002` dev-time literal. Linux-only first (AppImage + deb); `bun run tauri:dev` / `tauri:build` commands added. Bundled ffmpeg staged under `src-tauri/resources/ffmpeg/<platform>/` from a new `linux-x64-portable` / `linux-arm64-portable` manifest entry in `scripts/ffmpeg-manifest.json`.
- `bdedfdd` — smoke-test fixes: 256×256 icon (gdk-pixbuf assertion), corrected resource path (`<resource_dir>/resources/ffmpeg/<platform>/`), `HW_ACCEL=off` forced in Tauri shell (temporary; HW-accel probe softening is the next subtask), full `#[source]` chain in `server_supervisor.rs`.

Smoke test verified: `xstream-server listening addr=127.0.0.1:38511`, `Hardware acceleration selected kind="software"`, `POST /graphql 200`, `GET /graphql 101`.

**Locked decisions for this iteration (Plan/03 §Decisions):**
- OS coverage: Linux-only first.
- ffmpeg sourcing: bundled portable jellyfin-ffmpeg under `src-tauri/resources/ffmpeg/<platform>/`.
- Server embedding: in-process loopback (Option A) — no IPC.

**Deferred within Step 3 (will land before PR closes):**
1. HW-accel probe softening (Tauri-mode soft-fallback + toast per `08-Tauri-Packaging.md` §5) — `HW_ACCEL=off` hard-coded as temporary stand-in.
2. Library picker UX (Tauri folder picker → `createLibrary` mutation).
3. `useRustBackend` flag-removal sweep — flag stays for the browser-mode dev workflow; removal sweep is the final commit in this step.
4. macOS / Windows bundling (portable manifest entries already added; `setup-ffmpeg --target=tauri-bundle` reuses them).
5. Segment cache eviction policy (currently unbounded).
6. OTLP endpoint stays at `localhost:5341` — user-facing telemetry settings are Step 4.

Step 4 (release) has not started.
