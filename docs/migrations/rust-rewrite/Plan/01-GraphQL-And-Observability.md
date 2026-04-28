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

Bounded open questions the implementing agent must resolve on day one:

1. **Rust port number.** Pick a convention (e.g., Bun on `3000`, Rust on `3001`) and document it. Hard-coding is acceptable for cutover; the Tauri step kills both.
2. **How the client discovers the alternate origin.** Three plausible options: env var read at build time, a small runtime config endpoint on the Bun server, or hard-coded `localhost:<port>`. Pick one and document — and pick something Step 2 can reuse for `/stream` routing without a second discovery mechanism.
3. **Flag shape.** One boolean (`useRustGraphQL`) or a richer enum if more transports get added later. Default to one boolean unless there's a specific reason to generalize.
4. **Scope of the Step 1 PR.** All of the above ships in one PR vs. several smaller ones. The bias is one PR per step (consistent with the layer-doc PRs), but if the diff balloons, a split is acceptable as long as no intermediate state breaks the default-off invariant.
