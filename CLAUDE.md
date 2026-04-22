# xstream — Agent Context

High-resolution web streaming. Bun server transcodes video files to fMP4 segments with ffmpeg and streams them over HTTP as length-prefixed binary chunks; the React client renders them via Media Source Extensions. Current phase: 4K/1080p fixed-resolution playback with a full 240p → 4K ladder.

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
├── CLAUDE.md
├── package.json                   # bun workspace root
├── tmp/                           # gitignored — SQLite DB + ffmpeg segment cache
├── docs/                          # NN-PascalCase + domain directories (client/server/design/product)
│   ├── 00-Architecture.md   01-Streaming-Protocol.md   02-Observability.md
│   ├── todo.md                    # owned by `todo` skill (exempt from NN-convention)
│   ├── diagrams/                  # .mmd + .png (filenames stable; owned by `update-docs` skill)
│   ├── client/                    # 00-Relay 01-Feature-Flags 02-Debugging-Playbooks
│   ├── server/                    # 00-Config 01-GraphQL-Schema 02-DB-Schema
│   ├── design/                    # 00-UI-Design-Spec
│   └── product/                   # 00-Product-Spec
│
├── server/src/
│   ├── index.ts                   # Bun.serve() entry + HTTP/WS upgrade + startup sequence
│   ├── config.ts                  # dev/prod AppConfig + RESOLUTION_PROFILES
│   ├── types.ts                   # shared types
│   ├── db/
│   │   ├── index.ts migrate.ts
│   │   └── queries/               # ALL SQL lives here — one file per table
│   ├── graphql/
│   │   ├── schema.ts relay.ts mappers.ts presenters.ts
│   │   └── resolvers/             # query.ts mutation.ts subscription.ts library.ts video.ts job.ts
│   ├── services/                  # libraryScanner, omdbService, scanStore, chunker, jobStore, jobRestore, ffmpegFile, ffmpegPath, hwAccel
│   └── routes/                    # graphql.ts (yoga handler) + stream.ts (GET /stream/:jobId)
│
└── client/src/
    ├── main.tsx router.tsx        # RelayEnvironmentProvider + RouterProvider + NovaEventingProvider
    ├── relay/                     # environment.ts + __generated__/ (gitignored, regenerated)
    ├── styles/tokens.ts           # Moran design tokens
    ├── lib/icons.tsx              # icon exports
    ├── pages/                     # XxxPage.tsx (Suspense shell) + XxxPageContent.tsx (data + layout)
    ├── components/                # one kebab-case directory per component — colocated .styles.ts, .strings.ts, .events.ts, .stories.tsx
    ├── hooks/                     # useChunkedPlayback, useVideoPlayback, useVideoSync, useJobSubscription, useSplitResize
    ├── services/                  # StreamingService, BufferManager, StreamingLogger
    ├── storybook/                 # withNovaEventing, withLayout, withRelay decorators
    └── utils/                     # pure helpers — formatters, lazy
```

## Key Invariants — Never Violate These

1. **All SQL goes through `db/queries/`** — no `getDb().prepare(...)` calls outside that directory.
2. **GraphQL schema changes require `bun relay` in `client/`.** `__generated__/` artifacts are gitignored; a stale artifact breaks Relay queries at runtime.
3. **`SourceBuffer.appendBuffer()` must never be called while `updating === true`.** Always `await waitForUpdateEnd()` first — violation throws `InvalidStateError` and breaks MSE.
4. **Init segment is the first frame on every new stream connection.** Server sends `init.mp4` before any `.m4s`; client appends it before any media segment. Order broken = decoder can't initialise.
5. **`path` is the unique key for libraries and videos.** Two libraries can share `name`; only `path` is unique.
6. **`MediaSource.endOfStream()` must be called when streaming finishes.** `BufferManager.markStreamDone()` handles it — skipping it stalls `<video>`.
7. **Revoke object URLs on teardown.** `BufferManager.teardown()` calls `URL.revokeObjectURL()`. Always teardown on unmount or resolution switch.
8. **`content_fingerprint` is `NOT NULL`.** Old `tmp/xstream.db` without this column must be deleted and regenerated — no backward-compatible migration.
9. **Relay global IDs must be URL-encoded in route links.** Global IDs are base64 and may contain `/`, `+`, `=`. Use `encodeURIComponent(id)` on the way in, `decodeURIComponent` (or `resolveVideoId`) on the way out.
10. **One resolver owns each GraphQL field.** `@graphql-tools/schema` merges via `Object.assign` — duplicates silently overwrite. Pick one home (`video.ts` for `Video.*`, `library.ts` for `Library.*`) and keep it there.

## Where to read / who to ask

Most domain knowledge lives in skills, subagents, or `docs/`. The main agent should route — not recite.

| Topic | Go to |
|---|---|
| Architecture, streaming pipeline, backpressure, tech-choice trade-offs, Rust/Tauri plan | `architect` subagent |
| Local dev setup, ffmpeg pinning, env vars, CI/CD, zombie ffmpeg, VAAPI driver gaps, OMDb auto-match | `devops` subagent |
| Any browser interaction (UI verification, playback checks) | `browser` skill |
| Reading Seq logs / inspecting traces (HTTP API) | `seq` skill |
| Writing a React component | `write-component` skill |
| Porting a design-lab page to production | `implement-design` skill |
| Feature-flag add/read/remove | `feature-flags` skill |
| Tests (run, analyse, extend) | `test` skill |
| Backend (GraphQL / stream / DB) debugging | `debug-backend` skill |
| End-to-end playback verification | `e2e-test` skill |
| Updating streaming diagrams + enforcing docs naming convention | `update-docs` skill |
| Observability / OTel / Seq verification | `otel-logs` skill |
| Config (`mediaFiles.json`, AppConfig, resolution profiles) | `docs/server/00-Config.md` |
| GraphQL schema surface | `docs/server/01-GraphQL-Schema.md` |
| DB schema | `docs/server/02-DB-Schema.md` |
| Relay conventions | `docs/client/00-Relay.md` |
| Feature-flag catalog | `docs/client/01-Feature-Flags.md` |
| Debugging playbooks (client + GraphQL) | `docs/client/02-Debugging-Playbooks.md` |
| Streaming protocol binary framing | `docs/01-Streaming-Protocol.md` |
| Observability (span tree, log policy) | `docs/02-Observability.md` |

## File Naming Convention

| What | Pattern | Examples |
|---|---|---|
| React component (`.tsx` exporting a component) | `PascalCase.tsx` | `VideoCard.tsx`, `ControlBar.tsx`, `DashboardPage.tsx` |
| React component folder | `kebab-case/` | `video-card/`, `control-bar/`, `dashboard-page/` |
| Component-satellite files (live in the same folder) | mirror the component's PascalCase prefix | `VideoCard.styles.ts`, `VideoCard.strings.ts`, `VideoCard.events.ts`, `VideoCard.stories.tsx` |
| Anything else (hook, util, service, config, test, server file) | `camelCase.ts` | `useChunkedPlayback.ts`, `formatters.ts`, `chunkPipeline.ts`, `playbackController.ts`, `chunker.ts`, `streamingService.test.ts` |

**Files exporting a class are still camelCase** — `chunkPipeline.ts` exports `class ChunkPipeline`. The class name stays PascalCase; the filename does not mirror it. The PascalCase-mirrors-filename rule applies only to React components and their satellites.

**Relay-compiler enforces** that operation/fragment names start with the containing filename — renaming a `.tsx` file requires `bun relay` in `client/` to regenerate `__generated__/` artifacts. The `update-docs` skill owns docs filenames (`NN-PascalCase.md` under `docs/`); diagram files under `docs/diagrams/` are explicitly stable and exempt from this convention.

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

## Observability — agent rules

Full policy: `docs/02-Observability.md`. Rules agents must respect:

- **Prefer `span.addEvent()` on an existing span** over creating a new span for instantaneous transitions. New spans are for operations with meaningful duration.
- **Message bodies must be self-describing.** `log.info("Stream paused — 23.4s buffered ahead (target: 20s)", { … })` — not `log.info("Stream paused", { … })`.
- **Log levels:** `info` = normal lifecycle, `warn` = recoverable, `error` = UX-affecting or a bug. Don't use `info` for errors; don't use `error` for handled edge cases.
- **Always log WHY on cleanup/kill.** Pass a `kill_reason` and log it — standard reasons: `client_disconnected`, `stream_idle_timeout`, `orphan_no_connection`, `server_shutdown`.
- **No duplicate lifecycle logs.** If a span event already captures a transition, don't also `log.info` the same thing. Owner closest to the state change keeps the log; others get a span event or nothing.
- **Don't cascade errors.** Log once on a non-recoverable loop error, set a `fatalError` flag, break both loops.
- **Client:** use `getClientLogger` (carries active session traceId automatically). Wrap playback-path fetches: `context.with(getSessionContext(), () => fetch(…))`.
- **Server:** extract `traceparent` from incoming headers and pass it through as `parentOtelCtx?: OtelContext`; yoga resolvers receive it via `ctx.otelCtx`.

## Server Conventions

- Resolvers have explicit return types (`: GQLLibrary`, `: Promise<GQLTranscodeJob>`).
- Formatting lives in `server/src/graphql/presenters.ts` — resolvers call `presentLibrary()` / `presentVideo()` / `presentJob()`, never `toGlobalId` directly.
- Resolvers → services → `db/queries/`. Simple read-only resolvers may import from `db/queries/` directly, but formatting still goes through presenters.
- **One resolver per field** (see Invariant 10).
- **`setFfmpegPath` is module-global.** Only `resolveFfmpegPaths` in `ffmpegPath.ts` is allowed to call it. Any other module that sets it at module-load time silently clobbers the resolver.

## Client Conventions

- `useLazyLoadQuery` lives **only** in `src/pages/`. Components read data via fragments + `useFragment`.
- Fragment naming: `<ComponentName>_<propName>` (e.g. `VideoCard_video`). Operation names must start with the containing filename (relay-compiler enforces).
- Component definition style: `export const Name: FC<Props> = (…) => { … };` — always `FC`. Never function declarations.
- Styles: Griffel (`makeStyles`) only. Classes in `global.css` are limited to browser globals (resets, fonts, scrollbar, `[data-tip]`, `body.resizing`).
- Nova eventing: bubble events from children via `useNovaEventing().bubble()`; intercept in parents via `NovaEventingInterceptor`. One `NovaEventingProvider` at the app root, never more. Events are colocated: `ComponentName.events.ts`.
- User-visible strings use `react-localization` (`new LocalizedStrings({ en: { … } })`) — no plain string exports in `*.strings.ts`.
- Every component has a `<ComponentName>.stories.tsx`. Relay fragment components use the `withRelay` decorator from `client/src/storybook/withRelay.tsx` (not raw `createMockEnvironment`). Story queries carry `@relay_test_operation`.

## What Not To Do

- **No ORM.** Raw `bun:sqlite` prepared statements only.
- **No ad-hoc SQL** outside `db/queries/`.
- **No server framework** beyond `graphql-yoga`. `Bun.serve()` handles routing directly.
- **No global mutable state** outside `db/`, `jobStore.ts`, `scanStore.ts`.
- **No base64 / text encoding** of video data — binary framing (length-prefixed raw bytes) stays; JSON overhead at 4K is unacceptable.
- **Don't call `appendBuffer` in a loop without awaiting `updateend`** — queue via `BufferManager.appendSegment()`.
- **No non-null assertions (`!`).** Use `?.` or explicit `if` guards.
- **No callback props for user actions.** Use `@nova/react` eventing. Data-flow props (fragment keys, `resolution`, `status`) are still plain props.
- **One `NovaEventingProvider` at the app root** — deeper providers fragment the event graph. Intermediate parents intercept.
- **No literal `className` strings.** All styles go through Griffel; consume via `const styles = useComponentNameStyles()`.
- **No duplicate resolver definitions.** Same `Type.field` in two files = silent override.
- **No unencoded Relay IDs in route links.**
- **No plain-string `*.strings.ts` exports.** Use `LocalizedStrings`.
- **Icons use the `base()` helper** (`client/src/lib/icons.tsx`). Known exceptions: `IconEdit` (20×20 artboard), `IconSpinner` (inline animation). New exceptions need a comment explaining why.
- **No magic numbers.** Extract named constants with a comment. Group related constants and describe the behaviour they control.
- **No comments that restate code or reference the current task** (see the top-level "Don't write comments" rule in the harness default prompt).

## Skills & Agents index

The full registry is surfaced by the Skill tool at session start. Brief map of what each does:

- **Subagents** (`.claude/agents/`): `architect` (design / tech choices), `devops` (dev flow / release / backend ops)
- **Skills** (`.claude/skills/`): `browser`, `seq`, `write-component`, `implement-design`, `feature-flags`, `test`, `debug-backend`, `debug-ui`, `e2e-test`, `update-docs`, `otel-logs`, `setup-local`, `create-pr`, `resolve-comments`, `reflect`, `todo`

When the user asks about "ultrareview" or how to run it, explain that `/ultrareview` launches a multi-agent cloud review. It is user-triggered and billed; don't attempt to launch it yourself.

When the user asks for `/help` or wants to give feedback, point them at `/help` and `https://github.com/anthropics/claude-code/issues`.
