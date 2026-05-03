# xstream — Agent Context

High-resolution media streaming. A Rust server transcodes video files to fMP4 segments with ffmpeg and streams them over HTTP as length-prefixed binary chunks; a React client renders them via Media Source Extensions. The Rust server runs **in-process** inside a Tauri desktop bundle for Linux, Windows, and macOS. Current phase: 4K/1080p fixed-resolution playback with a full 240p → 4K ladder.

> **Session-start directive — read the boot pack before any code or design work:**
>
> 1. [`docs/SUMMARY.md`](docs/SUMMARY.md) — ≤120-line architecture orientation. Surfaces the four engineering principles (fix root causes, don't weaken safety timeouts, never swallow errors, tests travel with the port) as one-liners and links to the deep rationale.
> 2. [`docs/code-style/README.md`](docs/code-style/README.md) — canonical home for conventions, per language (Rust, TS/React, SQL). Engineering principles live in `Principles/`; tooling (linters, formatters, pre-commit) in `Tooling/`.
> 3. [`docs/architecture/Observability/01-Logging-Policy.md`](docs/architecture/Observability/01-Logging-Policy.md) — logging discipline (span vs log decision tree, levels, `kill_reason` literal values, request-context threading).
>
> The architect subagent owns and maintains all three.

## Stack

| Layer | Technology |
|---|---|
| Server runtime | Rust + tokio |
| HTTP + WS | `axum` + `tower` + `async-graphql` (`graphql-ws` subprotocol) |
| DB | `rusqlite` (bundled, WAL mode, foreign keys ON) — raw SQL only, no ORM |
| Video | `tokio::process::Command` spawning bundled jellyfin-ffmpeg (`scripts/ffmpeg-manifest.json`, per-platform SHA256). VAAPI on Linux; macOS/Windows HW paths stubbed. |
| Desktop shell | Tauri v2 — system WebView, the Rust server runs as a tokio task in the same process |
| Client bundler | Rsbuild (run via `bun run`) |
| UI | React 18 + React Router v6 |
| Styles | `@griffel/react` — atomic CSS-in-JS |
| Data fetching | `react-relay` + `relay-compiler` |
| Events | `@nova/react` + `@nova/types` |

## Repo Layout

```
xstream/
├── CLAUDE.md                       # this file — routing index for agents
├── package.json                    # bun workspace root (client + server-rust + scripts)
├── Cargo.toml                      # cargo workspace root (server-rust + src-tauri)
├── tmp/                            # gitignored — SQLite DB + ffmpeg segment cache (dev)
├── docs/                           # knowledge base owned by the architect subagent (see docs/README.md)
│   ├── README.md                   # super-domain index
│   ├── architecture/               # cross-cutting concepts (Streaming, Relay, Observability, Startup, Library-Scan, Deployment, Sharing, Testing)
│   ├── client/                     # client-only topics (Components, Feature-Flags, Debugging-Playbooks)
│   ├── server/                     # server-only topics (Config, GraphQL-Schema, DB-Schema, Hardware-Acceleration)
│   ├── design/                     # UI design spec — tokens, type, spacing, behavioural contracts
│   ├── release/                    # outstanding redesign work (working document)
│   ├── product/                    # product spec, customers, roadmap
│   ├── code-style/                 # conventions, invariants, anti-patterns, naming, testing policy
│   ├── diagrams/                   # .mmd + .png (stable filenames; owned by `update-docs` skill)
│   └── todo.md                     # owned by `todo` skill
│
├── server-rust/src/
│   ├── main.rs                     # binary entry — calls lib::run() and exits with AppResult
│   ├── lib.rs                      # axum + async-graphql wiring, `run(config)` async fn
│   ├── config.rs                   # AppConfig + RESOLUTION_PROFILES
│   ├── error.rs                    # AppError + AppResult
│   ├── relay.rs                    # global ID encoding/decoding helpers
│   ├── request_context.rs          # axum extension threading trace context (and future Identity)
│   ├── telemetry.rs                # tracing-subscriber + opentelemetry-otlp setup
│   ├── db/                         # mod.rs, migrate.rs, queries/ (one file per table)
│   ├── graphql/                    # schema, scalars, query, mutation, subscription, types, error_logger
│   ├── services/                   # library_scanner, omdb, scan_state, chunker, job_store, job_restore, ffmpeg_file, ffmpeg_path, ffmpeg_pool, hw_accel, active_job, cache_index, kill_reason
│   └── routes/                     # graphql.rs (async-graphql-axum) + stream.rs (GET /stream/:job_id)
│
├── src-tauri/                      # Tauri shell crate
│   ├── tauri.conf.json             # bundle config (frontendDist, resources, signing, updater)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs / lib.rs        # Tauri Builder; spawns xstream_server::run on tokio
│       └── ffmpeg_path.rs          # resolves resource_dir() → bundled ffmpeg per platform
│
└── client/src/
    ├── main.tsx router.tsx         # RelayEnvironmentProvider + RouterProvider + NovaEventingProvider
    ├── relay/                      # environment.ts + __generated__/ (gitignored, regenerated)
    ├── styles/tokens.ts            # Xstream design tokens
    ├── lib/icons.tsx               # icon exports
    ├── pages/                      # XxxPage.tsx (Suspense shell) + XxxPageContent.tsx (data + layout)
    ├── components/                 # one kebab-case directory per component — colocated .styles.ts, .strings.ts, .events.ts, .stories.tsx
    ├── hooks/                      # useChunkedPlayback, useVideoPlayback, useVideoSync, useJobSubscription, useSplitResize
    ├── services/                   # StreamingService, BufferManager, StreamingLogger
    ├── storybook/                  # withNovaEventing, withLayout, withRelay decorators
    └── utils/                      # pure helpers — formatters, lazy
```

## Engineering principles + code style

The four engineering meta-rules and every per-language convention live under [`docs/code-style/`](docs/code-style/README.md). Agents reading the boot pack already have them; this section is just the routing pointer.

## Where to read / who to ask

Most domain knowledge lives in skills, subagents, or `docs/`. The main agent should route — not recite. The `architect` subagent owns the `docs/` knowledge base; prefer asking it before reading `docs/` directly for anything larger than a single file.

| Topic | Go to |
|---|---|
| Architecture, streaming pipeline, backpressure, HW-accel, tech-choice trade-offs | `architect` subagent |
| Per-component design specs (style, layout, behaviour, data) | `docs/client/Components/` |
| Outstanding redesign work | `docs/release/Outstanding-Work.md` |
| Local dev setup, ffmpeg pinning, env vars, CI/CD, zombie ffmpeg, VAAPI driver gaps, OMDb auto-match | `devops` subagent |
| Any browser interaction (UI verification, Seq inspection, playback checks) | `browser` skill |
| Writing a React component | `write-component` skill |
| Porting a design-lab page to production | `implement-design` skill |
| Feature-flag add/read/remove | `feature-flags` skill |
| Tests (run, analyse, extend) | `test` skill |
| Backend (GraphQL / stream / DB) debugging | `debug-backend` skill |
| End-to-end playback verification | `e2e-test` skill |
| Updating streaming diagrams + docs naming convention | `update-docs` skill |
| Observability / OTel / Seq verification | `otel-logs` skill |
| System overview + component tables | `docs/architecture/00-System-Overview.md` |
| Streaming protocol + playback scenarios | `docs/architecture/Streaming/` |
| Observability (spans, logging policy, Seq) | `docs/architecture/Observability/` |
| Relay fragment contract | `docs/architecture/Relay/` |
| Tauri bundling, code-signing, auto-updates, ffmpeg distribution | `docs/architecture/Deployment/` |
| Config (AppConfig, library configuration, resolution profiles) | `docs/server/Config/` |
| GraphQL schema surface | `docs/server/GraphQL-Schema/` |
| DB schema | `docs/server/DB-Schema/` |
| Hardware acceleration (VAAPI, HDR) | `docs/server/Hardware-Acceleration/` |
| Feature-flag catalog | `docs/client/Feature-Flags/` |
| Debugging playbooks (client + GraphQL) | `docs/client/Debugging-Playbooks/` |

## Code Quality Tooling

Linting, formatting, and pre-commit hooks per language: [`docs/code-style/Tooling/`](docs/code-style/Tooling/README.md).

## Observability agent rules

Full policy and load-bearing rules: [`docs/architecture/Observability/01-Logging-Policy.md`](docs/architecture/Observability/01-Logging-Policy.md). `kill_reason` literal values are sourced from `server-rust/src/services/kill_reason.rs`.

## Update protocol — notify the curator after changes

Before marking **any task that modified code or docs** as complete, spawn the relevant curator subagent with a short change summary:

- **Files changed** — list of paths touched by `Write`/`Edit` during the task.
- **Description** — one sentence on what changed.
- **Why** — rationale (fix, feature, refactor) and a link to the issue or feedback memory if applicable.

Routing:

- Edits inside `design/Release/**` → notify `migrations-lead`. It owns the design lab and forwards cross-cutting changes (component-spec updates under `docs/client/Components/`, INDEX rows) to `architect`.
- Everything else (server / client code, `docs/` subtrees, `.claude/`, `CLAUDE.md`, `README.md`) → notify `architect`.

The curator decides whether `docs/`, `SUMMARY.md`, or the cross-cutting index needs updating, and does so directly (architect-only for `INDEX.md` and `SUMMARY.md`). This keeps the RAG coherent without requiring the caller to know what to update.

**When the rule fires:**

- Any `Write` or `Edit` in `client/`, `server-rust/`, `src-tauri/`, `docs/`, `.claude/`, `CLAUDE.md`, or `README.md` during the task.
- Not fired by: read-only investigation, log inspection, browser verification, test-run observation — observational work doesn't change the baseline.

**Per-component spec sync (load-bearing).** Every directory under `client/src/components/<name>/` and every page under `client/src/pages/<name>-page/` has a paired spec at [`docs/client/Components/<Name>.md`](docs/client/Components/README.md). When a task edits a component's `.tsx` / `.styles.ts` / `.strings.ts` / `.events.ts`, **explicitly mention the paired spec path** in the architect notification (e.g. "files changed: `client/src/components/account-menu/AccountMenu.tsx`; paired spec: `docs/client/Components/AccountMenu.md`"). Architect updates the spec to match the new code. This keeps the agent-facing reference in lockstep with reality — the spec is authoritative for *what the component is supposed to be*, the code wins on *what it currently does*, and the architect's job is to close the gap. New components mean a new spec under `Components/` and a new row in `Components/README.md`.

If the change is genuinely irrelevant to the knowledge base (a typo fix, a lint-only change, a dev-only script tweak), tell architect that explicitly — "files changed: X; no docs impact." Architect will log it and return. This preserves the "always notify" discipline without forcing a doc edit on every commit.

## Branch & PR policy

**Main stays healthy.** Never merge a PR into `main` on the user's behalf unless they have explicitly said "merge it" — and even then, only after they have had a chance to test and review. The user's reviews are the gate for main. Don't treat a PR being green in CI as sign-off; green is necessary but not sufficient.

If the user says something ambiguous mid-session like "merge the PR" or "merge the 2 PRs", confirm which of the following they mean BEFORE touching GitHub:
- "Merge into main" — needs prior review; if they haven't tested yet, say so.
- "Collapse multiple open PRs into one" — a branch-surgery task, not a GitHub merge.
- "Merge branch X into branch Y locally" — a git operation on feature branches, main untouched.

Merging to main is not cleanly reversible (`git revert` leaves two reverted merge commits in history; force-push to main is forbidden). The cost of a wrong merge is permanent history noise — always worth a confirming sentence.

**One PR per session.** When a session opens a PR, every subsequent change in that session keeps landing on the same branch and the same PR — push new commits onto it, update the PR description if scope grew, don't open a second PR.

Exceptions (only when the user explicitly says so):
- "Open a new PR for this" — user wants the next block of work on a separate branch.
- "Merge what's open first" — user wants the current PR closed before starting the next.

If the current work feels architecturally separable from the open PR and a second PR seems cleaner, **ask before branching** — don't assume. The cost of pausing to confirm is low; the cost of landing scope as two PRs when the user wanted one (or vice-versa) is an awkward history the reviewer then has to reconcile.

## Skills & Agents index

The full registry is surfaced by the Skill tool at session start. Brief map:

- **Subagents** (`.claude/agents/`): `architect` (knowledge-base curator + design / tech choices), `migrations-lead` (`design/Release/` lab + per-component specs in `docs/client/Components/`), `devops` (dev flow / release / backend ops)
- **Skills** (`.claude/skills/`): `browser`, `write-component`, `implement-design`, `feature-flags`, `test`, `debug-backend`, `debug-ui`, `e2e-test`, `update-docs`, `otel-logs`, `setup-local`, `create-pr`, `resolve-comments`, `reflect`, `todo`, `groom-knowledge-base`

**Subagent model policy:** invoke all subagents on `haiku` by default. Custom agents in `.claude/agents/` are pinned via frontmatter; built-in agents (`Explore`, `Plan`, `general-purpose`, …) need `model: "haiku"` passed per `Agent` call. Escalate to `sonnet` only when Haiku is known to be insufficient for the specific task; never default a subagent to `opus`.

When the user asks about "ultrareview" or how to run it, explain that `/ultrareview` launches a multi-agent cloud review. It is user-triggered and billed; don't attempt to launch it yourself.

When the user asks for `/help` or wants to give feedback, point them at `/help` and `https://github.com/anthropics/claude-code/issues`.
