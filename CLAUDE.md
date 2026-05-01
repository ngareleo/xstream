# xstream — Agent Context

High-resolution web streaming. Bun server transcodes video files to fMP4 segments with ffmpeg and streams them over HTTP as length-prefixed binary chunks; the React client renders them via Media Source Extensions. Current phase: 4K/1080p fixed-resolution playback with a full 240p → 4K ladder.

> **Session-start directive:** Before doing task work, read [`docs/SUMMARY.md`](docs/SUMMARY.md) for the shared architecture + coding-style orientation. It's ≤120 lines, owned and maintained by the `architect` subagent.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| HTTP + WS | `Bun.serve()` + `graphql-yoga` + `graphql-ws` |
| DB | `bun:sqlite` — raw SQL only, no ORM |
| Video | `fluent-ffmpeg` + pinned jellyfin-ffmpeg (`scripts/ffmpeg-manifest.json`, per-platform SHA256). VAAPI on Linux; macOS/Windows HW paths stubbed. |
| Client bundler | Rsbuild |
| UI | React 18 + React Router v6 |
| Styles | `@griffel/react` — atomic CSS-in-JS |
| Data fetching | `react-relay` + `relay-compiler` |
| Events | `@nova/react` + `@nova/types` |

## Repo Layout

```
xstream/
├── CLAUDE.md                       # this file — routing index for agents
├── package.json                    # bun workspace root
├── tmp/                            # gitignored — SQLite DB + ffmpeg segment cache
├── docs/                           # knowledge base owned by the architect subagent (see docs/README.md)
│   ├── README.md                   # super-domain index
│   ├── architecture/               # cross-cutting concepts (Streaming, Relay, Observability, Startup, Library-Scan)
│   ├── client/                     # client-only topics (Feature-Flags, Debugging-Playbooks)
│   ├── server/                     # server-only topics (Config, GraphQL-Schema, DB-Schema, Hardware-Acceleration)
│   ├── design/                     # UI design spec
│   ├── product/                    # product spec, customers, roadmap
│   ├── code-style/                 # conventions, invariants, anti-patterns, naming
│   ├── diagrams/                   # .mmd + .png (stable filenames; owned by `update-docs` skill)
│   └── todo.md                     # owned by `todo` skill
│
├── server/src/
│   ├── index.ts                    # Bun.serve() entry + HTTP/WS upgrade + startup sequence
│   ├── config.ts                   # dev/prod AppConfig + RESOLUTION_PROFILES
│   ├── types.ts                    # shared types
│   ├── db/                         # index.ts, migrate.ts, queries/ (one file per table)
│   ├── graphql/                    # schema.ts, relay.ts, mappers.ts, presenters.ts, resolvers/
│   ├── services/                   # libraryScanner, omdbService, scanStore, chunker, jobStore, jobRestore, ffmpegFile, ffmpegPath, hwAccel
│   └── routes/                     # graphql.ts (yoga handler) + stream.ts (GET /stream/:jobId)
│
└── client/src/
    ├── main.tsx router.tsx         # RelayEnvironmentProvider + RouterProvider + NovaEventingProvider
    ├── relay/                      # environment.ts + __generated__/ (gitignored, regenerated)
    ├── styles/tokens.ts            # Moran design tokens
    ├── lib/icons.tsx               # icon exports
    ├── pages/                      # XxxPage.tsx (Suspense shell) + XxxPageContent.tsx (data + layout)
    ├── components/                 # one kebab-case directory per component — colocated .styles.ts, .strings.ts, .events.ts, .stories.tsx
    ├── hooks/                      # useChunkedPlayback, useVideoPlayback, useVideoSync, useJobSubscription, useSplitResize
    ├── services/                   # StreamingService, BufferManager, StreamingLogger
    ├── storybook/                  # withNovaEventing, withLayout, withRelay decorators
    └── utils/                      # pure helpers — formatters, lazy
```

## Engineering principles

Three non-negotiables that govern how bugs, unknowns, and error paths are approached:

- **Fix root causes, not symptoms.** When a bug's cause is unknown, the plan starts with *find the cause* — usually by adding the diagnostic instrumentation that's currently missing. Do not propose a behavioural workaround in the same plan. If a workaround already exists in production, the plan to address the underlying bug must include removing it, not leave it indefinitely. Reject patterns like *bump the constant past the failing threshold*, *force the fallback path that's worse*, *add a special-case branch that sidesteps the broken code* — each wins time-to-recovery at the cost of permanent debt. "If we don't know, we investigate" is the default.
- **Don't weaken safety timeouts as a bug fix.** Safety timeouts encode intent; if a legit case looks like an abandonment, fix the structural reason — don't bump the timer. Same shape as the rule above, narrower domain.
- **Never swallow errors. Both happy and unhappy paths are part of the design.** In Rust, that means **no `expect`, no `unwrap`, no `let _ = fallible_call()`** in production code (`#[cfg(test)]` blocks may use `.expect("clear message")`). Every fallible operation propagates via `Result<T, E>`; `main()` returns `AppResult<()>`; mutex poisoning becomes a typed error, not a panic; silent JSON-parse fallbacks on data that was supposed to be well-formed log a warning with the row id. **And every error is also emitted through `tracing::error!`** — propagation alone is invisible to operators; the error must hit Seq with the request TraceId attached (the `ErrorLogger` async-graphql extension does this for resolver errors; `main()` does it for startup failures). Picking Rust is picking the type system as the safety net — `expect` opts out of it. Full rationale + the matching JS/TS rule lives in [`docs/code-style/Invariants/00-Never-Violate.md`](docs/code-style/Invariants/00-Never-Violate.md) §14.
- **Tests are the spec — they travel with the port.** When porting a subsystem from one stack to another, every test that documents an expectation about its surface must be reproduced in the new stack. The implementation can be a rewrite; the assertions are the contract. Out-of-scope tests are skipped with a TODO comment pointing at the migration step that will reinstate them, never with silence. Negative paths (missing-row → None, malformed input → typed error) carry over too — a port that only covers the happy path is the same trap as `unwrap()`. Detail: [`docs/migrations/README.md`](docs/migrations/README.md) → "Cross-migration principles".

All three rules pair with the existing `docs/code-style/Anti-Patterns/00-What-Not-To-Do.md` list. When a plan or PR seems to violate any of them, surface that fact before shipping.

## Code style and invariants

Full content lives under `docs/code-style/`. Agents working on code MUST respect these — they are the non-negotiables, not suggestions.

- [`docs/code-style/Invariants/00-Never-Violate.md`](docs/code-style/Invariants/00-Never-Violate.md) — the structural rules that, if broken, silently corrupt runtime behaviour (SQL routing, MSE state, init-segment order, URL-encoded Relay IDs, one-resolver-per-field, typed-error contract, pull-based streaming, …).
- [`docs/code-style/Naming/00-Conventions.md`](docs/code-style/Naming/00-Conventions.md) — React components vs camelCase everything else.
- [`docs/code-style/Server-Conventions/00-Patterns.md`](docs/code-style/Server-Conventions/00-Patterns.md) — resolver shape, presenter layer, `setFfmpegPath` discipline.
- [`docs/code-style/Client-Conventions/00-Patterns.md`](docs/code-style/Client-Conventions/00-Patterns.md) — Relay fragment contract, Griffel, Nova eventing, localization.
- [`docs/code-style/Anti-Patterns/00-What-Not-To-Do.md`](docs/code-style/Anti-Patterns/00-What-Not-To-Do.md) — the full "don't" list.

## Where to read / who to ask

Most domain knowledge lives in skills, subagents, or `docs/`. The main agent should route — not recite. The `architect` subagent owns the `docs/` knowledge base; prefer asking it before reading `docs/` directly for anything larger than a single file.

| Topic | Go to |
|---|---|
| Architecture, streaming pipeline, backpressure, HW-accel, tech-choice trade-offs | `architect` subagent |
| Rust/Tauri migration plan + release-journey playbook (layer refs, Plan/ steps, what's in/out of scope per step) | `migrations-lead` subagent |
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
| Config (AppConfig, library configuration, resolution profiles) | `docs/server/Config/` |
| GraphQL schema surface | `docs/server/GraphQL-Schema/` |
| DB schema | `docs/server/DB-Schema/` |
| Hardware acceleration (VAAPI, HDR, fluent-ffmpeg quirks) | `docs/server/Hardware-Acceleration/` |
| Feature-flag catalog | `docs/client/Feature-Flags/` |
| Debugging playbooks (client + GraphQL) | `docs/client/Debugging-Playbooks/` |

## Code Quality Tooling

- **Linting:** ESLint v10 + `typescript-eslint` + `eslint-plugin-react-hooks` (client). Each workspace: `bun run lint` → `tsc --noEmit && eslint src`.
- **Formatting:** Prettier v3. `bun run format` (write) / `format:check` (CI).
- **Pre-commit:** Husky v9 + lint-staged auto-fix staged `.ts`/`.tsx`.

Key enforced rules:

- Explicit return types on exported functions (`explicit-module-boundary-types`)
- Floating promises must use `void` or be awaited (`no-floating-promises`)
- Type-only imports use `import type` (`consistent-type-imports`)
- Non-null assertions (`!`) forbidden (`no-non-null-assertion`) — use `?.` or explicit guards (tests post-`expect` excepted)
- React hook rules enforced (`rules-of-hooks: error`, `exhaustive-deps: warn`)
- Cross-module imports use the `~/` alias; `../` is banned via `no-restricted-imports` — same-directory `./` for colocated files is fine

## Observability agent rules

Full policy: [`docs/architecture/Observability/01-Logging-Policy.md`](docs/architecture/Observability/01-Logging-Policy.md). The load-bearing rules:

- Prefer `span.addEvent()` on an existing span over a new span for instantaneous transitions.
- Message bodies must be self-describing — `log.info("Stream paused — 23.4s buffered ahead (target: 20s)", { … })`.
- Levels: `info` = normal lifecycle, `warn` = recoverable, `error` = UX-affecting or a bug.
- Always log WHY on cleanup/kill (standard `kill_reason`: `client_disconnected`, `stream_idle_timeout`, `orphan_no_connection`, `server_shutdown`).
- No duplicate lifecycle logs: one owner per state change.
- Don't cascade errors. Log once, break the loop.
- Client: `getClientLogger` + wrap playback-path fetches with `context.with(getSessionContext(), () => fetch(…))`.
- Server: extract `traceparent` from headers; yoga resolvers receive it as `ctx.otelCtx`.

## Update protocol — notify the curator after changes

Before marking **any task that modified code or docs** as complete, spawn the relevant curator subagent with a short change summary:

- **Files changed** — list of paths touched by `Write`/`Edit` during the task.
- **Description** — one sentence on what changed.
- **Why** — rationale (fix, feature, refactor) and a link to the issue or feedback memory if applicable.

Routing:

- Edits inside `docs/migrations/**` OR `design/Release/**` → notify `migrations-lead`. It curates the migration tree (incl. `release-design/Components/<Name>.md` per-component specs that travel with the Prerelease → Release port) and loops `architect` in if a cross-cutting INDEX row needs adding.
- Everything else (server / client code, other `docs/` subtrees, `design/Prerelease/**` (frozen), `.claude/`, `CLAUDE.md`, `README.md`) → notify `architect`.

The curator decides whether `docs/`, `SUMMARY.md`, or the cross-cutting index needs updating, and does so directly (architect-only for `INDEX.md` and `SUMMARY.md`). This keeps the RAG coherent without requiring the caller to know what to update.

**When the rule fires:**

- Any `Write` or `Edit` in `client/`, `server/`, `docs/`, `.claude/`, `CLAUDE.md`, or `README.md` during the task.
- Not fired by: read-only investigation, log inspection, browser verification, test-run observation — observational work doesn't change the baseline.

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

- **Subagents** (`.claude/agents/`): `architect` (knowledge-base curator + design / tech choices), `migrations-lead` (Rust/Tauri migration playbook + layer refs in `docs/migrations/`), `devops` (dev flow / release / backend ops)
- **Skills** (`.claude/skills/`): `browser`, `write-component`, `implement-design`, `feature-flags`, `test`, `debug-backend`, `debug-ui`, `e2e-test`, `update-docs`, `otel-logs`, `setup-local`, `create-pr`, `resolve-comments`, `reflect`, `todo`, `groom-knowledge-base`

When the user asks about "ultrareview" or how to run it, explain that `/ultrareview` launches a multi-agent cloud review. It is user-triggered and billed; don't attempt to launch it yourself.

When the user asks for `/help` or wants to give feedback, point them at `/help` and `https://github.com/anthropics/claude-code/issues`.
