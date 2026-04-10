# tvke — Agent Context

## What This Is

tvke is a high-resolution web streaming application. The server transcodes video files to fMP4 segments using ffmpeg and streams them over HTTP as raw binary chunks. The client receives those chunks and renders them using the browser's Media Source Extensions (MSE) API.

**Current phase:** 4K/1080p fixed-resolution streaming with a full resolution ladder (240p → 4K). Adaptive bitrate switching is deferred.

---

## Stack at a Glance

| Layer | Technology |
|---|---|
| Runtime | Bun |
| HTTP + WebSocket server | `Bun.serve()` + `graphql-yoga` |
| Database | SQLite via `bun:sqlite` — **raw SQL only, no ORM** |
| GraphQL server | `graphql-yoga` + `@graphql-tools/schema` |
| Video processing | `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg` |
| Client bundler | Vite |
| UI framework | React 18 + React Router v6 |
| UI components | Chakra UI v3 |
| Data fetching | Relay (`react-relay`) + `relay-compiler` |
| Component eventing | `@nova/react` + `@nova/types` |

---

## Repo Layout

```
tvke/
├── CLAUDE.md                      # this file
├── mediaFiles.json                # media library config (edit paths locally)
├── package.json                   # bun workspace root
├── tsconfig.base.json             # shared TS compiler options
├── tmp/                           # gitignored — SQLite DB + ffmpeg segment cache
├── docs/                          # architecture documentation
│
├── server/src/
│   ├── index.ts                   # Bun.serve() entry + startup sequence
│   ├── config.ts                  # dev/prod AppConfig + RESOLUTION_PROFILES + loadMediaConfig()
│   ├── types.ts                   # all shared TypeScript types
│   ├── db/
│   │   ├── index.ts               # SQLite singleton (getDb)
│   │   ├── migrate.ts             # idempotent CREATE TABLE IF NOT EXISTS
│   │   └── queries/               # one file per table — all SQL lives here
│   ├── graphql/
│   │   ├── schema.ts              # SDL type definitions (typeDefs)
│   │   ├── relay.ts               # toGlobalId / fromGlobalId
│   │   ├── mappers.ts             # enum conversion between GQL and internal strings
│   │   └── resolvers/             # query.ts, mutation.ts, subscription.ts
│   ├── services/
│   │   ├── libraryScanner.ts      # walks dirs, ffprobes files, upserts DB
│   │   ├── chunker.ts             # ffmpeg job lifecycle + fs.watch segment watcher
│   │   └── jobStore.ts            # in-memory Map<jobId, ActiveJob>
│   └── routes/
│       ├── graphql.ts             # graphql-yoga handler
│       └── stream.ts              # GET /stream/:jobId binary chunk endpoint
│
└── client/src/
    ├── main.tsx                   # RelayEnvironmentProvider + ChakraProvider + RouterProvider + NovaEventingProvider (root)
    ├── router.tsx                 # / → LibraryPage, /play/:videoId → PlayerPage
    ├── relay/environment.ts       # RelayEnvironment (HTTP fetch + WebSocket subscribe)
    ├── relay/__generated__/       # relay-compiler output (run: bun relay in client/)
    ├── pages/
    │   ├── LibraryPage.tsx        # lists libraries + triggers rescan
    │   └── PlayerPage.tsx         # loads video metadata, renders VideoPlayer
    ├── components/
    │   ├── ControlBar.events.ts   # Nova event constants, payload types, isControlBarEvent() guard
    │   ├── ControlBar.tsx         # seek bar, play/pause, resolution badges; bubbles Nova events
    │   ├── LibraryGrid.tsx        # Relay fragment — video grid within a library
    │   ├── VideoCard.tsx          # Relay fragment — clickable video tile
    │   └── VideoPlayer.tsx        # MSE orchestration; NovaEventingInterceptor for ControlBar events
    ├── hooks/
    │   ├── useVideoPlayback.ts    # MSE + streaming pipeline (teardown, startPlayback, status, error)
    │   └── useVideoSync.ts        # syncs currentTime + isPlaying from a <video> element via RAF
    └── services/
        ├── StreamingService.ts    # fetch loop, length-prefix parser, pause/resume/cancel
        └── BufferManager.ts       # MSE SourceBuffer wrapper, sliding window eviction
```

---

## Key Invariants — Never Violate These

1. **All SQL goes through `db/queries/`** — no `getDb().prepare(...)` calls outside that directory.

2. **GraphQL schema changes require re-running relay-compiler** — from `client/`: `bun relay`. The `__generated__/` artifacts must be up to date or Relay queries will fail at runtime.

3. **`SourceBuffer.appendBuffer()` must never be called while `updating === true`** — always `await waitForUpdateEnd()` before each call. Violating this throws `InvalidStateError` and breaks the MSE pipeline.

4. **Init segment must be the first frame sent on every new stream connection** — the server always sends the init segment (`init.mp4`) before any `.m4s` media segments. The client must append it first before any media segment. If this order is broken, the browser decoder cannot initialize and playback fails.

5. **`path` is the unique key for libraries and videos** — never use `name` as an identifier. Two libraries can share the same `name`; only `path` is unique.

6. **`MediaSource.endOfStream()` must be called when streaming finishes** — otherwise the `<video>` element stalls. `BufferManager.markStreamDone()` handles this.

7. **Revoke object URLs on teardown** — `BufferManager.teardown()` calls `URL.revokeObjectURL()`. Always call teardown when the player unmounts or a resolution switch occurs.

---

## Config System

`NODE_ENV` selects the active config:
- `development` (default) → `dev` object in `config.ts`; `mediaFiles.json` entries with `env: "dev"`
- `production` → `prod` object; reads `SEGMENT_DIR` and `DB_PATH` env vars; `env: "prod"` entries

`tmp/` layout:
```
tmp/
  tvke.db               # SQLite database
  segments/
    <jobId>/            # one directory per transcode job
      init.mp4          # init segment (moov box)
      segment_0000.m4s
      segment_0001.m4s
      ...
      segments.txt      # ffmpeg segment list file
```

---

## Common Tasks

### Add a new GraphQL field to an existing type
1. Add the field to `server/src/graphql/schema.ts` (SDL)
2. Add resolver logic in the appropriate `resolvers/` file
3. From `client/`: `bun relay` to regenerate artifacts
4. Use the field in a fragment or query in the client

### Add a new SQLite table
1. Add `CREATE TABLE IF NOT EXISTS ...` to `server/src/db/migrate.ts` — use individual `db.run()` calls inside `db.transaction()()`, not `db.exec()` (deprecated in bun:sqlite)
2. Create `server/src/db/queries/<table>.ts` with typed query functions
3. Import and use those functions from services or resolvers

### Change resolution profiles
Edit `RESOLUTION_PROFILES` in `server/src/config.ts` and the `Resolution` enum in `server/src/types.ts`. Also update the `GQL_TO_RESOLUTION` / `RESOLUTION_TO_GQL` maps in `server/src/graphql/mappers.ts` and the schema enum in `schema.ts`.

### Add a new media library
Edit `mediaFiles.json` — add an entry with `name`, `path`, `mediaType` (`movies` | `tvShows`), `env` (`dev` | `prod`), and optionally `videoExtensions` (array of lowercase extensions, e.g. `[".mp4", ".mkv"]`). The server picks it up on next startup or when `scanLibraries` mutation is called.

### Add a new client component with data
1. Define a `graphql` fragment in the component file (`fragment ComponentName_prop on TypeName { ... }`)
2. Import the generated `$key` type from `relay/__generated__/`
3. Accept the `$key` as a prop; call `useFragment` inside the component
4. Spread the fragment in the parent query or parent fragment
5. Run `bun relay` from `client/`
6. Put any formatting/computation helpers in `client/src/utils/`, not in the component file
7. If the component has stateful side-effect logic (timers, event listeners, refs, async pipelines), extract it into a hook in `client/src/hooks/`

**Hooks (see `client/src/hooks/`):**
- `useVideoPlayback(videoRef, videoId, onJobCreated?)` — owns the full MSE + StreamingService + BufferManager pipeline including `START_TRANSCODE_MUTATION`; returns `{ status, error, startPlayback }`
- `useVideoSync(videoRef)` — syncs `currentTime` and `isPlaying` from a `<video>` element using `requestAnimationFrame`; returns `{ currentTime, isPlaying }`
- `useJobSubscription(jobId, onProgress)` — subscribes to `transcodeJobUpdated` for the given job ID and calls `onProgress` on each update; pass `null` to unsubscribe
- New hooks belong in `client/src/hooks/`. Component files should contain only the component, its Relay fragment/mutation tags, and prop types.

**Nova eventing (`@nova/react`) — component→parent communication:**

Components do not accept callback props for user actions. Instead they bubble typed events up through the provider tree.

```
ComponentName.events.ts       ← colocated with component; event constants, payload types, isXxxEvent()
ComponentName.tsx             ← calls useNovaEventing().bubble() on user interactions
ParentComponent.tsx           ← uses NovaEventingInterceptor to handle/consume events
main.tsx                      ← single NovaEventingProvider at the app root (terminal handler)
```

**Three-layer structure:**
1. **`NovaEventingProvider`** — one instance at the app root (`main.tsx`). Terminal handler for any event that no interceptor consumes.
2. **`NovaEventingInterceptor`** — used by intermediate components (e.g. `VideoPlayer`) to intercept and handle specific events. Return `undefined` to consume; return the wrapper to forward up.
3. **`useNovaEventing().bubble()`** — called inside the event-emitting component (e.g. `ControlBar`).

Pattern for a component that raises events (`ComponentName.events.ts`, colocated):
```ts
import type { EventWrapper } from "@nova/types";

export const MY_ORIGINATOR = "ComponentName";
export const MyEventTypes = { SOMETHING_HAPPENED: "SomethingHappened" } as const;
export interface SomethingHappenedData { value: string; }

// Always export an isXxxEvent guard — used by interceptors instead of raw string comparison
export function isMyComponentEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === MY_ORIGINATOR;
}
```

In the component:
```tsx
import { useNovaEventing } from "@nova/react";
import { MY_ORIGINATOR, MyEventTypes } from "./ComponentName.events.js";

const { bubble } = useNovaEventing();

void bubble({
  reactEvent,    // the React SyntheticEvent from the user interaction
  event: createSomethingHappenedEvent(value),
});
```

Use factory functions and type guards from the colocated `.events.ts` file — never build event objects inline at the call site:
```ts
// ControlBar.events.ts
export function createSomethingHappenedEvent(value: string): NovaEvent<SomethingHappenedData> {
  return { originator: MY_ORIGINATOR, type: MyEventTypes.SOMETHING_HAPPENED, data: () => ({ value }) };
}
export function isSomethingHappenedEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === MY_ORIGINATOR && wrapper.event.type === MyEventTypes.SOMETHING_HAPPENED;
}
```

In the parent that handles the events (`NovaEventingInterceptor`):
```tsx
import { NovaEventingInterceptor } from "@nova/react";
import { isMyComponentEvent, MyEventTypes } from "./ComponentName.events.js";

const interceptor = useCallback(async (wrapper, _forwardEvent) => {
  if (isMyComponentEvent(wrapper)) {
    if (wrapper.event.type === MyEventTypes.SOMETHING_HAPPENED && wrapper.event.data) {
      const { value } = wrapper.event.data() as SomethingHappenedData;
      // handle it
    }
  }
  return wrapper; // always forward — only stop bubbling if forwarding causes an unwanted side effect
}, [deps]);

<NovaEventingInterceptor interceptor={interceptor}>
  <MyComponent ... />
</NovaEventingInterceptor>
```

Stories for components that use `useNovaEventing()` require a `NovaEventingProvider` ancestor — the hook throws without one. The app-root provider in `main.tsx` covers the real app; stories need their own:
```tsx
const noopEventing = { bubble: (_e: EventWrapper): Promise<void> => Promise.resolve() };
<NovaEventingProvider eventing={noopEventing} reactEventMapper={mapEventMetadata}>
  <MyComponent ... />
</NovaEventingProvider>
```

Event files are colocated with their component (`ControlBar.events.ts` next to `ControlBar.tsx`). Do not define event constants inline in component files or in a shared top-level `events.ts`.

**Relay rules (see `docs/relay.md` for full detail):**
- `useLazyLoadQuery` only in `src/pages/` — never in components
- Components receive fragment keys (`$key`), not raw data props
- The GraphQL schema is the single source of truth for types — import from relay-generated artifacts or `src/types.ts`, never redefine locally
- Fragment naming: `<ComponentName>_<propName>` (e.g. `VideoCard_video`)
- **Operation naming**: the graphql tag's operation name must start with the containing module's filename. In `useVideoPlayback.ts`, the mutation must be `useVideoPlaybackStartTranscodeMutation`; in `PlayerPage.tsx`, the query must be `PlayerPageQuery`. relay-compiler enforces this and will error on mismatches.

**Component definition style — always use `React.FC`:**
```tsx
// Correct
export const VideoCard: FC<Props> = ({ video }) => { ... };

// Wrong — do not use function declarations for components
export function VideoCard({ video }: Props): JSX.Element { ... }
```
Import `FC` as a type: `import { type FC } from "react"`. Pages and inner components follow the same style.

**Storybook rule — every component must have a story:**
- Stories live in `<ComponentName>.stories.tsx` alongside the component
- Relay fragment components use **`@imchhh/storybook-addon-relay`** — add `parameters.relay` with a `@relay_test_operation` query, `getReferenceEntry`, and `mockResolvers`. The addon handles the mock environment automatically.
- Do NOT use `createMockEnvironment` / `RelayEnvironmentProvider` directly — use the addon instead
- Story queries must have `@relay_test_operation` directive; run `bun relay` from `client/` after adding/changing a story query
- Each visual variant is a named export with its own `parameters.relay.mockResolvers` override
- Stories test visual states, not behaviour; keep them free of application logic
- Add `play` functions (from `@storybook/test`) to verify interactive states

**Storybook shared decorators (`client/src/storybook/`):**
- `withNovaEventing` — wraps a story in a no-op `NovaEventingProvider`. Required for any component that calls `useNovaEventing()`. Import and add to `meta.decorators`; do not inline `noopEventing` + `NovaEventingProvider` in individual story files.
- `withLayout(style)` — wraps a story in a plain `<div>` with the given CSS styles. Use for width/height constraints (e.g. `withLayout({ width: 380 })`). Never write inline JSX decorators in story files — the classic Babel transform used by Storybook requires `React` to be in scope for any JSX in story files, but the shared decorator files already import it.

**React Router in Storybook (React Router v6):**
- The global Storybook preview (`client/.storybook/preview.tsx`) already wraps every story in a `MemoryRouter`. Components using `useLocation`, `useNavigate`, or `Link` work automatically.
- To control the active route in a story, set `parameters.router.initialEntries` — an array of path strings (e.g. `["/setup"]`). The preview reads this parameter and passes it to `MemoryRouter`.
- Do NOT add a second `MemoryRouter` in a story decorator — React Router v6 throws if two routers are nested.
- `createRoutesStub` from `react-router` is a v7 API and is not available in this project (v6).

Example — AppHeader story with Setup tab active:
```ts
export const SetupActive: Story = {
  parameters: { router: { initialEntries: ["/setup"] } },
};
```

---

## Future Direction — Rust Server Rewrite

The Bun/JS server is a **prototype** used to validate the architecture quickly. Once the design is proven, the server will be rewritten in Rust for performance gains (critical at 4K bitrates). The React/Relay client is intended to remain **completely untouched** across this rewrite.

GraphQL and the binary stream endpoint are the stable contracts between server and client. When porting to Rust:

- The **GraphQL schema SDL** must be identical — same types, field names, enum values, and nullability
- **Global ID encoding** must match: `base64("TypeName:localId")` — Relay's cache depends on this
- **`/stream/:jobId` binary framing** must match: 4-byte big-endian uint32 length prefix + raw fMP4 bytes, init segment always first — documented in `docs/streaming-protocol.md`
- **WebSocket subscriptions** must use the `graphql-ws` subprotocol (not the legacy `subscriptions-transport-ws`)

Do not couple the client to anything server-implementation-specific. All client↔server communication must go through the GraphQL endpoint or the `/stream/` binary endpoint.

---

## Code Quality Tooling

**Linting:** ESLint v10 with `typescript-eslint` (both packages) and `eslint-plugin-react-hooks` (client only). Run via `bun run lint` in each package — this runs `tsc --noEmit && eslint src`. CI runs both.

**Formatting:** Prettier v3. Config in root `.prettierrc.json`. Run `bun run format` (writes) or `bun run format:check` (CI-style check). Ignored paths in `.prettierignore`.

**Pre-commit hooks:** Husky v9 + lint-staged. On every commit, staged `.ts`/`.tsx` files are auto-fixed with ESLint and Prettier before the commit lands. Config in root `package.json` under `"lint-staged"`.

**ESLint config hierarchy:**
- `eslint.config.js` (root) — shared base: `typescript-eslint/recommended`, `explicit-module-boundary-types`, `no-floating-promises`, `consistent-type-imports`, Prettier compat
- `server/eslint.config.js` — extends root, sets `parserOptions.project`
- `client/eslint.config.js` — extends root, adds `react-hooks` rules, relaxes `explicit-module-boundary-types` for `*.stories.*` files

**Key enforced rules:**
- All exported functions must have explicit return types (`@typescript-eslint/explicit-module-boundary-types`)
- Floating promises must use `void` or be awaited (`@typescript-eslint/no-floating-promises`)
- Type-only imports must use `import type` (`@typescript-eslint/consistent-type-imports`)
- Non-null assertions (`!`) are forbidden (`@typescript-eslint/no-non-null-assertion`) — use optional chaining or explicit guards; exception: test files where `!` post-`expect` is acceptable
- React hook rules enforced: `react-hooks/rules-of-hooks: error`, `react-hooks/exhaustive-deps: warn`

---

## Server Resolver Conventions

- **Explicit return types** — all resolver functions must have a TypeScript return type annotation (`: GQLLibrary`, `: Promise<GQLTranscodeJob>`, etc.)
- **Presenters, not inline formatting** — data mapping (global ID encoding, enum conversion, camelCase) lives in `server/src/graphql/presenters.ts`. Resolver files call `presentLibrary()`, `presentVideo()`, `presentJob()` — never call `toGlobalId` or mapper functions directly from resolvers
- **Resolvers call services; services call DB** — resolver files (`resolvers/`) should not import from `db/queries/` directly. Business/service logic (like chunker, libraryScanner) is the bridge. For simple read-only cases the DB import in resolvers is acceptable but the formatting must still go through presenters

---

## What Not To Do

- **No ORM** — SQLite is accessed with raw `bun:sqlite` prepared statements only
- **No ad-hoc SQL** outside `db/queries/` — keeps all schema knowledge in one place
- **No server framework** beyond `graphql-yoga` — `Bun.serve()` handles routing directly
- **No global mutable state** outside `db/` (persisted) and `jobStore.ts` (in-memory active jobs)
- **No base64 or text encoding** of video data — the binary framing protocol (length-prefixed raw bytes) must not be replaced with base64 or JSON; the overhead at 4K bitrates is unacceptable
- **Do not call `appendBuffer` in a loop without awaiting `updateend`** — queue appends through `BufferManager.appendSegment()` which serializes them correctly
- **No non-null assertions (`!`)** — use optional chaining (`?.`) or explicit `if` guards instead; `!` masks null errors rather than preventing them
- **No callback props for user actions** — components use `@nova/react` eventing (`useNovaEventing().bubble()`) to surface interactions; intermediate parents handle events via `NovaEventingInterceptor`. Do not add `onXxx` callback props to components for things the user does (clicks, selections). Data-flow props (fragment keys, state values like `resolution` and `status`) are still plain props.
- **One `NovaEventingProvider` at the app root** — do not add more providers deeper in the tree. Intermediate components use `NovaEventingInterceptor` instead. Event files (`ComponentName.events.ts`) are colocated with their component, not in a shared top-level file.
