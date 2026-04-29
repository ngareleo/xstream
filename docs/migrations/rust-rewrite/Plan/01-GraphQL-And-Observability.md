# Step 1 — Rust GraphQL + Observability

## Where this step sits

First Rust step. Predecessor: the Bun prototype on `main` plus the landed migration docs (PR #32). Successor: [Step 2 — Streaming](02-Streaming.md).

At the end of this step, with `useRustGraphQL` flag **on**, every page in the client works end-to-end against the Rust GraphQL server **except the player page** — that page requires `/stream/:jobId`, which is still served by Bun until Step 2 lands. With the flag **off**, behaviour is identical to today: `main` stays fully functional for any user who never opts in.

> **For reviewers:** the player page being broken when the flag is on is an *expected, documented* state at the end of Step 1 — not a regression. Do not block the PR on it. Step 2 closes the loop.

## Scope

**In:**

- Rust GraphQL service: SDL parity with the current Bun schema (same types, field names, enum values, nullability), typed-error union preserved, subscriptions over `graphql-ws` subprotocol.
- OTel/tracing wiring: `tracing` + `opentelemetry-otlp` exporter, W3C `traceparent` extraction middleware, span-surface parity for non-streaming spans (`job.resolve`, GraphQL operation spans, library-scan spans).
- `RequestContext` middleware threaded through every resolver from day one (forward-constrained for sharing — see below).
- `rusqlite` for non-streaming queries: library, video, job metadata, user settings.
- Side-by-side process model: the Rust binary binds a separate port; Bun keeps its current port; both run during cutover.

**Out:**

- `/stream/:jobId`, chunker, ffmpeg pool — that is [Step 2](02-Streaming.md).
- Tauri shell, embedded server, code signing, distribution — Steps [3](03-Tauri-Packaging.md) and [4](04-Release.md).
- Removing the Bun server. It stays the default until [Step 3](03-Tauri-Packaging.md) collapses everything into Tauri.

## Stable contracts to preserve

Authoritative list at [`../00-Rust-Tauri-Port.md`](../00-Rust-Tauri-Port.md). For Step 1 specifically:

- GraphQL SDL **identical** — no field rename, no nullability tweak, no enum-value change. The client's Relay artefacts must keep working unmodified.
- Global IDs: `base64("TypeName:localId")`.
- Subscription transport: `graphql-ws` subprotocol on the same path as HTTP GraphQL.
- Typed-error union: same shape and member names as today.

## Cutover mechanism

Side-by-side, client-routes, default-off.

- **Two processes, two ports.** Bun keeps its current `config.port`. Rust binds a separate port (decision below). Both servers run during cutover; nothing proxies between them.
- **Client flag.** Add `useRustGraphQL` to [`client/src/config/flagRegistry.ts`](../../../../client/src/config/flagRegistry.ts) (per the [feature-flag registry](../../../client/Feature-Flags/00-Registry.md)). The Relay environment ([`client/src/relay/environment.ts`](../../../../client/src/relay/environment.ts)) reads the flag and selects the alternate origin for both HTTP `/graphql` and the WebSocket subscription URL.
- **Default-off.** Bun is the default. `main` builds with the flag false; testers opt in via the Settings → Flags UI. `main` is *fully functional* without the flag — no UX regression unless the user opts in.
- **Player page warning copy.** When the flag is on and the user navigates to the player page, the Relay environment is talking to Rust but the streaming client is talking to Bun's `/stream` (unchanged). The page will render but playback will fail because Bun lacks the new GraphQL job-resolution shape (or vice-versa). Decide during implementation whether to surface a "this page is in cutover, expect breakage" toast — minimum bar is that it's documented and not a silent crash.

## Pointers to layer references

- [`../03-GraphQL-Layer.md`](../03-GraphQL-Layer.md) — primary. `graphql-yoga` → `async-graphql`; SDL parity strategy; typed-error union mapping; subscription transport on `graphql-ws` already-correct on the Bun side.
- [`../02-Observability-Layer.md`](../02-Observability-Layer.md) — OTel SDK → `tracing` + `opentelemetry-otlp`; W3C extraction middleware; cross-peer traceparent flow.
- [`../04-Web-Server-Layer.md`](../04-Web-Server-Layer.md) — `Bun.serve()` → `axum` router + `tower` stack; `RequestContext` middleware threaded from day one; configurable CORS + bind address.
- [`../05-Database-Layer.md`](../05-Database-Layer.md) — `bun:sqlite` → `rusqlite` (bundled); identical schema + WAL pragma; identity-vs-cache DB split (only the identity DB is exercised in Step 1).

## Sharing forward-constraints to honour

Pointer-only — these are detailed in the layer refs. Step 1 must not foreclose:

- **`RequestContext` middleware shape** — auth is no-op today, but the structure must be in place from day one. Detail in [`../04-Web-Server-Layer.md`](../04-Web-Server-Layer.md).
- **Cross-peer `traceparent` flow** — the W3C extraction middleware works unchanged for cross-peer requests later. Detail in [`../02-Observability-Layer.md`](../02-Observability-Layer.md).
- **Two-DB split** — identity DB lives in `app_data_dir()`, not `tmp/`. Detail in [`../05-Database-Layer.md`](../05-Database-Layer.md).

## Decisions to lock before starting

These were open on day one of Step 1; all four are now locked by implementation (PR #39).

1. **Rust port number.** Locked: Bun on `3001`, Rust on `3002`. Hard-coded in `server-rust/src/main.rs`; `client/src/config/rustOrigin.ts` hard-codes `localhost:3002`. The Tauri step kills both.
2. **How the client discovers the alternate origin.** Locked: hard-coded `localhost:3002` in `rustOrigin.ts`. Step 2 reuses the same origin — no second discovery mechanism needed. Flag toggle requires a page reload (localStorage mirror writes synchronously; Relay environment is re-read on next mount).
3. **Flag shape.** Locked: one boolean (`useRustGraphQL`). `useRustStreaming` is a separate boolean for Step 2 — same pattern.
4. **Scope of the Step 1 PR.** Locked: one PR (#39) — but scope grew significantly beyond the original spec during review. See "What shipped beyond the spec" below.

## What shipped beyond the spec (PR #39, commits a422976…ec6c90e)

The original Step 1 spec covered the GraphQL/observability shell. The following shipped in the same PR during a review-and-iterate session. Future step implementors should treat these as established patterns.

### Error / panic discipline (commits e5ca445 + b40b989)

`server-rust/src/error.rs` introduces `DbError` (variants: rusqlite, mutex-poison, invariant, malformed-JSON) and `AppError` (top-level with `#[source]` chain). `main()` returns `AppResult<()>`. No `expect`/`unwrap`/silent-discard in production code. Mutex poisoning is a typed error, not a panic. Codified as §14 of `docs/code-style/Invariants/00-Never-Violate.md`. **This is a cross-migration pattern — Step 2 must follow the same discipline, and the chunker / ffmpeg pool are the biggest exposure surface.**

### ErrorLogger async-graphql extension (commit e5ca445)

`server-rust/src/graphql/error_logger.rs` — an `async-graphql` `Extension` that fires `tracing::error!` for each entry in `errors[]`, inside the per-request `http.request` span. Consequence for Step 2: **every resolver added in Step 2 gets error logging for free** via this extension — no per-resolver logging needed.

### localStorage-first flag system (commit 4713116)

`client/src/config/featureFlags.ts` reads every flag from localStorage at module load (synchronous); server hydration fills cache entries only where there is no existing localStorage override — local toggles win. New `useFeatureFlagControls()` hook backs two buttons in FlagsTab: "Clear local overrides" (drops localStorage; reload pulls server values) and "Reset all to defaults" (every flag set to registry default, persisted to localStorage AND server). The `useRustGraphQL`-specific localStorage mirror was subsumed by this general pattern. **Step 2's `useRustStreaming` flag is covered automatically by this mechanism.**

> Note: `docs/client/Feature-Flags/00-Registry.md` still describes the old server-truth model. Architect has been asked to update it after PR #39 merges.

### Mapper Option-shape convention (commit 23ab952)

`MediaType::from_internal` and `JobStatus::from_internal` previously returned silent defaults on unknown input — a §14 violation. Both now return `Option<Self>`. Call sites in `graphql/types/{library,video,transcode_job}.rs` and `graphql/query.rs` log `tracing::warn!` with row id + raw value before degrading. **Step 2 must use the same `Option<Self>` + warn-then-degrade pattern for any new enum conversions.**

### Per-request access log (commit ec6c90e)

Bun's `Bun.serve` fetch handler and Rust's `extract_request_context` middleware each emit one structured `info` event per request: `method`, `path`, `status`, `duration_ms`, `trace_id`. Both shapes are locked to those five fields plus a human-readable message body. Seq queries by `trace_id` work uniformly across both stacks.

### Code-organisation (commit 4713116)

`server-rust/src/db.rs` split into `db/{mod,migrate}.rs` + `db/queries/{libraries,videos,jobs,video_metadata,watchlist,user_settings,playback_history}.rs`, mirroring Bun's `server/src/db/queries/*.ts` layout. `server-rust/src/graphql/types.rs` split into `types/{node,library,video,watchlist,transcode_job,playback_session,omdb,misc}.rs`. Re-exports keep call-site imports flat. **Step 2 adds write functions to the existing `db/queries/*.rs` files — they slot in next to the existing reads.**

### Test discipline (commits ed8c088 + 21e8d84 + 23ab952)

85 tests total (74 unit + 3 cascade integration + 8 GraphQL integration). Every `server-rust/src/db/queries/*.rs` has a `#[cfg(test)] mod tests` block. Every Bun test on main since branch diverged was ported in scope: relay, libraries/jobs/videos, pragmas, cascade, mappers, traceparent extraction, and an initial-state-only subscription scan test. Skipped: subscription-error-atomicity (chunker is Step 2). New cross-migration principle: **tests are the spec; they travel with the port.** See "Cross-migration principles" in `docs/migrations/rust-rewrite/README.md` (pending addition).

### mprocs dev orchestrator (commit 4e6ea6f)

Replaced `bun run --filter '*' dev` with mprocs (TUI per-process panes). New `mprocs.yaml` at repo root. Root `package.json` `dev` script prechecks for the mprocs binary and exits 127 with install instructions if missing; `dev:plain` keeps the old behaviour. `cargo install --locked mprocs` added to README prereqs.

### CI for the Rust workspace (commit 100b213)

New `server-rust` job in `.github/workflows/ci.yml`: `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo build`, `cargo test`, then SDL parity (boots the Rust binary, runs `scripts/check-sdl-parity.ts`, kills it). Step 2 should extend this job — add the streaming integration test run after `cargo test`.

### server-rust + scripts/ as Bun workspaces (commits 4713116 + 1c379a0)

`server-rust/package.json` is a workspace member with a `dev` script that prepends `~/.cargo/bin` to PATH. `scripts/` became a workspace member with `tsc --noEmit` lint, so `scripts/check-sdl-parity.ts` and sibling scripts are type-checked in CI.
