# xstream Knowledge Base

This tree is the project's single source of truth. Each super-domain has its own README listing its concepts; each concept folder has its own README listing its topics. The **architect** subagent (`.claude/agents/architect.md`) owns this tree and curates updates into it.

## Super-domains

- [`architecture/`](architecture/README.md) — Cross-cutting concepts that span client and server: Streaming, Relay, Observability, Startup, Library-Scan, Sharing.
- [`client/`](client/README.md) — Topics scoped to the React client: Feature-Flags, Debugging-Playbooks.
- [`server/`](server/README.md) — Topics scoped to the Rust server: Config, GraphQL-Schema, DB-Schema, Hardware-Acceleration.
- [`migrations/`](migrations/README.md) — Time-bounded migration efforts that span multiple domains: Rust + Tauri rewrite.
- [`design/`](design/README.md) — UI design spec: tokens, layout, visual language.
- [`product/`](product/README.md) — What we're building, for whom, and where the roadmap points.
- [`code-style/`](code-style/README.md) — Invariants, naming, conventions, anti-patterns. Non-negotiables for anyone writing code.

## Special files at the root

- [`SUMMARY.md`](SUMMARY.md) — ≤120-line orientation read by the `architect` subagent at the start of every invocation. Maintained by `/groom-knowledge-base`.
- [`INDEX.md`](INDEX.md) — topic → file retrieval table used by the `architect` subagent. Add a row when you add a top-level-routable topic file.
- [`todo.md`](todo.md) — project todo list, owned by the `todo` skill.

## Placement rule (for curators)

- Cross-cutting (client + server both touch it) → `architecture/<Concept>/`. Shared content at the concept root; side-specific nuance under `client/` or `server/` subfolders.
- Client-only → `client/<Concept>/`. Server-only → `server/<Concept>/`.
- Every concept folder has a `README.md` that lists siblings with a one-line hook per row.
- Topic files: `NN-PascalCase.md`. `README.md` is the only exemption.
