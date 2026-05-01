# Rust + Tauri — Release-Journey Playbook

This folder is the **execution playbook** for the Bun → Rust + Tauri migration. The sibling files at `docs/migrations/rust-rewrite/01–08-*.md` are **layer references** — they answer "what must each layer become and never foreclose." The Plan docs here answer "what do I do, in what order, and what is in/out of scope for this step."

The single source of truth for stable protocol contracts that every step must preserve is [`../00-Rust-Tauri-Port.md`](../00-Rust-Tauri-Port.md). Plan docs cite it; they do not redefine it. Any contract drift (SDL, global IDs, `/stream/:jobId` framing, subscriptions transport) is a regression.

## The four steps

The migration ships in a strict order, each step gated on the prior. Architecture stays intact across all of them: client + server, GraphQL + binary stream contract, no client edits forced by the server move.

1. **[Step 1 — GraphQL + Observability](01-GraphQL-And-Observability.md).** Port these two layers first. Side-by-side servers; client routes via the `useRustBackend` flag. Every page works against Rust EXCEPT the player page (streaming has not moved). Bun stays default — `main` is fully functional with the flag off.
2. **[Step 2 — Streaming](02-Streaming.md).** Port chunker + ffmpeg pool + `/stream/:jobId` to the same Rust process. The `useRustBackend` flag now toggles the entire backend (GraphQL + `/stream/*`) — one switch, no split traffic. With it on, the whole product runs on Rust.
3. **[Step 3 — Tauri Packaging](03-Tauri-Packaging.md).** Wrap the Rust server + React client into a single Tauri desktop binary. The cutover flag is deleted in this step — there is no more Bun. **In flight on `feat/rust-step3-tauri` (PR #43). Linux MVP running; HW-accel softening, library picker UX, and flag-removal sweep are the remaining open items.**
4. **[Step 4 — Release](04-Release.md).** Per-OS code signing, Ed25519-signed auto-update, CI release matrix on tag push. Ship the first beta to a soak group.

## Reading order for an implementing agent

1. Read this README to orient on the four-step shape.
2. Read your step's playbook in this folder.
3. Read the layer references the playbook points at — they hold the implementation detail.
4. Read [`../00-Rust-Tauri-Port.md`](../00-Rust-Tauri-Port.md) for the contracts your step must preserve.

Skip the layer references not cited by your step. They are organized by layer, not by release-journey step, so each step pulls from a subset.

## Topic table

| File | Hook |
|---|---|
| [`01-GraphQL-And-Observability.md`](01-GraphQL-And-Observability.md) | Rust GraphQL + tracing/OTLP behind `useRustBackend`. Player page known-broken when flagged on at Step-1 state — `/stream/*` is still on Bun. |
| [`02-Streaming.md`](02-Streaming.md) | axum `/stream/:jobId` + chunker + ffmpeg pool on the same Rust process — `useRustBackend` now toggles the whole backend. Length-prefixed binary preserved end-to-end. |
| [`03-Tauri-Packaging.md`](03-Tauri-Packaging.md) | Tauri shell, embedded Rust server, bundled jellyfin-ffmpeg, flag removal sweep. **In flight on `feat/rust-step3-tauri` (PR #43) — Linux MVP running; HW-accel softening + library picker + flag sweep still open.** |
| [`04-Release.md`](04-Release.md) | Per-OS signing, Ed25519 updates, tag-driven CI release matrix, first beta. |

## Per-step doc shape

Every step doc follows the same skeleton so an agent picking up Step N has the same orientation as one picking up Step 1:

1. **Where this step sits** — what precedes, what follows, what the user can and cannot do at the end.
2. **Scope — in / out.**
3. **Stable contracts to preserve** — pointer-only, citing `00-Rust-Tauri-Port.md` and the layer refs.
4. **Cutover mechanism** — Steps 1 & 2 only; the feature flag, port routing, default-off discipline.
5. **Pointers to layer references** — which `01–08-*.md` files hold the detail.
6. **Sharing forward-constraints to honour** — pointer-only, citing the layer ref that details each.
7. **Decisions to lock before starting** — bounded open questions the implementing agent must resolve on day one.

## Parallel track — Interim Electron alpha

Separately from this playbook, there is an **interim Electron alpha** that ships the current Bun prototype as a desktop app. It is a stop-gap to discover packaging edge cases and put the product in users' hands earlier, and it is **discarded when Step 3 ships**. See [`../../../architecture/Deployment/00-Interim-Desktop-Shell.md`](../../../architecture/Deployment/00-Interim-Desktop-Shell.md) for its analysis and trade-offs.

The interim alpha **does not gate Steps 1–3**. Lessons from it (per-OS signing keys, CI matrix shape, Ed25519 / Authenticode flow, env-driven path overrides for `DB_PATH` / `SEGMENT_DIR`, library-picker UX, VAAPI probe softening) feed Step 4 release plumbing. Treat it as a parallel learning surface, not a prerequisite.

## Out of scope for v1

- **Peer-to-peer media sharing.** Forward-constrained in the Rust port (per-connection pull isolation, content-addressed cache key, two-DB split, traceparent on the wire) so it remains additive later. Not shipped in v1 beta. Spec at [`../../../architecture/Sharing/00-Peer-Streaming.md`](../../../architecture/Sharing/00-Peer-Streaming.md).
- **UI redesign.** Optional and minimal; tracked outside this playbook. If it grows non-trivial, an implementing agent should open a Plan doc for it.
- **Stable channel.** Step 4 ships a beta channel only. Stable graduates after the soak group reports.
