# xstream — Agent Context

## What This Is

xstream is a high-resolution web streaming application. The server transcodes video files to fMP4 segments using ffmpeg and streams them over HTTP as raw binary chunks. The client receives those chunks and renders them using the browser's Media Source Extensions (MSE) API.

**Current phase:** 4K/1080p fixed-resolution streaming with a full resolution ladder (240p → 4K). Adaptive bitrate switching is deferred.

---

## Stack at a Glance

| Layer | Technology |
|---|---|
| Runtime | Bun |
| HTTP + WebSocket server | `Bun.serve()` + `graphql-yoga` + `graphql-ws` |
| Database | SQLite via `bun:sqlite` — **raw SQL only, no ORM** |
| GraphQL server | `graphql-yoga` + `@graphql-tools/schema` |
| Video processing | `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg` |
| Client bundler | Rsbuild |
| UI framework | React 18 + React Router v6 |
| UI styling | `@griffel/react` (atomic CSS-in-JS) |
| Data fetching | Relay (`react-relay`) + `relay-compiler` |
| Component eventing | `@nova/react` + `@nova/types` |

---

## Repo Layout

```
xstream/
├── CLAUDE.md                      # this file
├── package.json                   # bun workspace root
├── tsconfig.base.json             # shared TS compiler options
├── tmp/                           # gitignored — SQLite DB + ffmpeg segment cache
├── docs/                          # architecture documentation
│
├── server/src/
│   ├── index.ts                   # Bun.serve() entry — HTTP + WebSocket upgrade handler + startup sequence
│   ├── config.ts                  # dev/prod AppConfig + RESOLUTION_PROFILES
│   ├── types.ts                   # all shared TypeScript types
│   ├── db/
│   │   ├── index.ts               # SQLite singleton (getDb)
│   │   ├── migrate.ts             # idempotent CREATE TABLE IF NOT EXISTS
│   │   └── queries/               # one file per table — all SQL lives here
│   │       ├── libraries.ts       # library CRUD + video_extensions persistence
│   │       ├── videos.ts          # video upsert + stream replacement + aggregation
│   │       ├── videoMetadata.ts   # OMDb metadata upsert/get/exists/delete
│   │       ├── watchlist.ts       # watchlist add/remove/update/list
│   │       ├── userSettings.ts    # key-value settings get/set/delete
│   │       ├── jobs.ts            # transcode job lifecycle
│   │       └── segments.ts        # segment tracking
│   ├── graphql/
│   │   ├── schema.ts              # SDL type definitions (typeDefs)
│   │   ├── relay.ts               # toGlobalId / fromGlobalId
│   │   ├── mappers.ts             # enum conversion between GQL and internal strings
│   │   ├── presenters.ts          # data mapping — presentLibrary, presentVideo, presentJob, etc.
│   │   └── resolvers/
│   │       ├── query.ts           # Query field resolvers
│   │       ├── mutation.ts        # Mutation field resolvers
│   │       ├── subscription.ts    # Subscription resolvers (libraryScanUpdated, transcodeJobUpdated)
│   │       ├── library.ts         # Library sub-field resolvers (stats, videos)
│   │       ├── video.ts           # Video sub-field resolvers (matched, metadata, streams)
│   │       └── job.ts             # TranscodeJob sub-field resolvers
│   ├── services/
│   │   ├── libraryScanner.ts      # walks dirs, ffprobe + fingerprint, upserts DB; parseTitleFromFilename
│   │   ├── omdbService.ts         # OMDb API client; getApiKey() checks env + user_settings fallback
│   │   ├── scanStore.ts           # in-memory scan state pub/sub; isScanRunning, markScanStarted/Ended
│   │   ├── chunker.ts             # ffmpeg job lifecycle + fs.watch segment watcher; killAllActiveJobs()
│   │   ├── jobStore.ts            # in-memory Map<jobId, ActiveJob>
│   │   ├── jobRestore.ts          # restores interrupted jobs on server restart
│   │   └── ffmpegFile.ts          # ffmpeg file helpers
│   └── routes/
│       ├── graphql.ts             # graphql-yoga handler; exports schema for WebSocket handler
│       └── stream.ts              # GET /stream/:jobId binary chunk endpoint
│
└── client/src/
    ├── main.tsx                   # RelayEnvironmentProvider + RouterProvider + NovaEventingProvider (root)
    ├── router.tsx                 # AppShell layout + all page routes
    ├── relay/environment.ts       # RelayEnvironment (HTTP fetch + graphql-ws WebSocket subscribe)
    ├── relay/__generated__/       # relay-compiler output — gitignored, generated at dev startup
    ├── styles/
    │   └── tokens.ts              # Moran design tokens (colors, spacing, radii, etc.)
    ├── lib/
    │   └── icons.ts               # icon component exports
    ├── pages/
    │   ├── dashboard-page/        # DashboardPage — hero slideshow + profile rows + film detail pane
    │   ├── library-page/          # LibraryPage — poster grid + list view + filter bar + film detail pane
    │   ├── player-page/           # PlayerPage — video player + sidebar + inactivity hide
    │   ├── watchlist-page/        # WatchlistPage — queued/in-progress/watched rails
    │   ├── settings-page/         # SettingsPage — Library / Metadata / Danger Zone tabs
    │   ├── feedback-page/         # FeedbackPage — static feedback form
    │   ├── goodbye-page/          # GoodbyePage — full-screen farewell on sign-out
    │   └── not-found-page/        # NotFoundPage — 404
    ├── components/
    │   │   Each component lives in its own kebab-case directory.
    │   │   Colocated files: ComponentName.styles.ts, ComponentName.strings.ts,
    │   │   ComponentName.events.ts, ComponentName.stories.tsx
    │   ├── app-shell/             # AppShell — top-level grid layout (sidebar + header + page outlet)
    │   ├── app-header/            # AppHeader — nav tabs + action slot
    │   ├── sidebar/               # Sidebar — left nav rail
    │   ├── loading-bar/           # LoadingBar — global route-transition progress bar
    │   ├── error-boundary/        # ErrorBoundary — catches render errors, shows fallback
    │   ├── page-skeleton/         # PageSkeleton — Suspense fallback shimmer
    │   ├── slideshow/             # Slideshow — hero background image carousel
    │   ├── dashboard-hero/        # DashboardHero — hero section with slideshow + greeting
    │   ├── profile-row/           # ProfileRow — library card on dashboard with stats + scan progress
    │   ├── profile-explorer/      # ProfileExplorer — film grid within a library on dashboard
    │   ├── new-profile-pane/      # NewProfilePane — create-library slide-in pane
    │   ├── edit-profile-pane/     # EditProfilePane — edit-library slide-in pane
    │   ├── poster-card/           # PosterCard — 160px poster tile with badge + hover overlay
    │   ├── film-row/              # FilmRow — list-view film row with metadata
    │   ├── film-detail-loader/    # FilmDetailLoader — preloaded query bridge for FilmDetailPane
    │   ├── film-detail-pane/      # FilmDetailPane — right-side detail panel (poster, plot, cast, file info)
    │   ├── link-search/           # LinkSearch — OMDb search UI for manual linking
    │   ├── library-chips/         # LibraryChips — library filter tab row
    │   ├── library-filter-bar/    # LibraryFilterBar — search + type filter + grid/list toggle
    │   ├── library-film-list-row/ # LibraryFilmListRow — single row in library list view
    │   ├── library-tab/           # LibraryTab — settings library management tab
    │   ├── metadata-tab/          # MetadataTab — settings OMDb API key tab
    │   ├── danger-tab/            # DangerTab — settings danger zone tab
    │   ├── settings-tabs/         # SettingsTabs — tab container for settings page
    │   ├── player-content/        # PlayerContent — video + control bar layout
    │   ├── player-sidebar/        # PlayerSidebar — Now Playing + Up Next panel
    │   ├── control-bar/           # ControlBar — seek bar, play/pause, resolution; bubbles Nova events
    │   ├── video-player/          # VideoPlayer — MSE orchestration; intercepts ControlBar events; click-to-play/pause on <video> element directly
    │   ├── player-end-screen/     # PlayerEndScreen + PlayerEndScreenAsync — up-next cards + Replay; lazy-loaded
    │   ├── stream-log-overlay/    # StreamingLogOverlay + StreamingLogPanel — dev-only stream event log panel
    │   ├── watchlist-content/     # WatchlistContent — watchlist rails + empty state
    │   ├── directory-browser/     # DirectoryBrowser — filesystem path picker for new library form
    │   ├── sign-out-dialog/       # SignOutDialog — confirmation before signing out
    │   ├── not-found/             # NotFound — inline 404 message (used within pages)
    │   ├── router-navigation-loader/ # RouterNavigationLoader — bridges React Router to LoadingBar
    │   ├── dev-tools/             # DevPanel + DevPanelAsync — dev-only throw tester + stream log toggle (prod-excluded)
    │   └── dev-throw-target/      # DevThrowTarget — wraps content; throws on demand from DevPanel
    ├── hooks/
    │   ├── useChunkedPlayback.ts  # client-driven chunk scheduling, prefetch, seek restart, background-buffer resolution switch; returns { status, error, startPlayback, seekTo }
    │   ├── useVideoPlayback.ts    # thin wrapper around useChunkedPlayback preserving original VideoPlayer call-site signature
    │   ├── useVideoSync.ts        # syncs currentTime + isPlaying from <video> via RAF
    │   ├── useJobSubscription.ts  # subscribes to transcodeJobUpdated for a given jobId
    │   └── useSplitResize.ts      # drag-to-resize for split-pane layouts
    ├── services/
    │   ├── StreamingService.ts    # fetch loop, length-prefix parser, async pause/resume (resumeResolve promise), cancel
    │   ├── BufferManager.ts       # MSE SourceBuffer wrapper, sliding window eviction, setAfterAppend callback, offscreen element for background buffer, promoteToForeground()
    │   └── StreamingLogger.ts     # in-memory event log (dev only); subscribe/push/clear; no-ops in production
    ├── storybook/
    │   ├── withNovaEventing.tsx   # decorator: no-op NovaEventingProvider for stories
    │   ├── withLayout.tsx         # decorator: wraps story in a sized <div>
    │   └── withRelay.tsx          # decorator: mock Relay environment for fragment stories
    └── utils/
        ├── formatters.ts          # pure helpers: formatDuration, formatDurationHuman, resolutionLabel, etc.
        └── lazy.ts                # lazyNamedExport() factory for code-split named exports
```

---

## Key Invariants — Never Violate These

1. **All SQL goes through `db/queries/`** — no `getDb().prepare(...)` calls outside that directory.

2. **GraphQL schema changes require re-running relay-compiler** — from `client/`: `bun relay`. The `__generated__/` artifacts are gitignored and generated at dev startup and in CI; they must be up to date or Relay queries will fail at runtime.

3. **`SourceBuffer.appendBuffer()` must never be called while `updating === true`** — always `await waitForUpdateEnd()` before each call. Violating this throws `InvalidStateError` and breaks the MSE pipeline.

4. **Init segment must be the first frame sent on every new stream connection** — the server always sends the init segment (`init.mp4`) before any `.m4s` media segments. The client must append it first before any media segment. If this order is broken, the browser decoder cannot initialize and playback fails.

5. **`path` is the unique key for libraries and videos** — never use `name` as an identifier. Two libraries can share the same `name`; only `path` is unique.

6. **`MediaSource.endOfStream()` must be called when streaming finishes** — otherwise the `<video>` element stalls. `BufferManager.markStreamDone()` handles this.

7. **Revoke object URLs on teardown** — `BufferManager.teardown()` calls `URL.revokeObjectURL()`. Always call teardown when the player unmounts or a resolution switch occurs.

8. **`content_fingerprint` is non-null** — the `videos` table was created with `content_fingerprint TEXT NOT NULL`. If you have an old `tmp/xstream.db` without this column, delete it and let the server recreate it on startup. There is no backward-compatible migration; this was an intentional breaking schema change.

9. **Relay global IDs must be URL-encoded in route links** — Relay global IDs are base64 and can contain `/`, `+`, `=`. Always use `encodeURIComponent(id)` when constructing `/player/:videoId` or any route that embeds a Relay ID. The page must call `decodeURIComponent` (or `resolveVideoId`) on the param before passing it to Relay.

10. **One resolver owns each GraphQL field** — when resolvers are merged in `server/src/routes/graphql.ts`, later entries override earlier ones for the same type+field. Never define the same field in multiple resolver objects; pick a single home (`video.ts` for `Video.*`, `library.ts` for `Library.*`) and keep it there.

---

## Config System

`NODE_ENV` selects the active config:
- `development` (default) → `dev` object in `config.ts`
- `production` → `prod` object; reads `SEGMENT_DIR`, `DB_PATH`, `PORT`, and `SCAN_INTERVAL_MS` env vars

`scanIntervalMs` (default `30_000` ms) controls how often the server automatically rescans all media libraries. Override with `SCAN_INTERVAL_MS` in production.

`tmp/` layout:
```
tmp/
  xstream.db               # SQLite database
  segments/
    <jobId>/            # one directory per transcode job
      init.mp4          # init segment (moov box)
      segment_0000.m4s
      segment_0001.m4s
      ...
      segments.txt      # ffmpeg segment list file
```

---

## Local Dev Setup

Run `/setup-local` to set up a fresh environment end-to-end (deps, Seq, dev servers).

### Seq credentials

`.seq-credentials` is a gitignored shell-sourceable file at the project root, auto-generated by `bun run seq:start` on first run. It contains the Seq admin username and password for the local Docker instance.

```
SEQ_ADMIN_USERNAME=admin
SEQ_ADMIN_PASSWORD=<random>
```

Skills and scripts must always read credentials from this file — never hardcode them.

```sh
# Parse in bash
grep '^SEQ_ADMIN_PASSWORD=' .seq-credentials | cut -d= -f2
```

If the file is missing, run `bun run seq:start` to generate it (and create the Seq container).

To reset Seq with a new password: `bun run seq:stop && sudo docker rm seq && sudo rm -rf ~/.seq-store && rm .seq-credentials && bun run seq:start`

> **`~/.seq-store` must be deleted alongside the container.** `SEQ_FIRSTRUN_ADMINPASSWORD` is only applied when Seq initialises its data directory for the first time. If the store directory already exists, the env var is silently ignored and the old password remains in effect.

> **First login after a fresh container forces a password change.** Seq rejects reusing the initial password — choose a new one and update `.seq-credentials` immediately after:
> `printf 'SEQ_ADMIN_USERNAME=admin\nSEQ_ADMIN_PASSWORD=<new>\n' > .seq-credentials`

### Verifying OTel logs

Run `/otel-logs` after any playback session to log into Seq and confirm server traces are arriving. The skill reads credentials from `.seq-credentials` automatically.

---

## Common Tasks

### Add a new GraphQL field to an existing type
1. Add the field to `server/src/graphql/schema.ts` (SDL)
2. Add the resolver to the **single authoritative resolver file** for that type (e.g. `video.ts` for `Video.*`, `library.ts` for `Library.*`) — do not split the same type across multiple resolver objects
3. If data mapping is needed, add a helper to `server/src/graphql/presenters.ts`
4. From `client/`: `bun relay` to regenerate artifacts
5. Use the field in a fragment or query in the client

### Add a new SQLite table
1. Add `CREATE TABLE IF NOT EXISTS ...` to `server/src/db/migrate.ts` — use individual `db.run()` calls inside `db.transaction()()`, not `db.exec()` (deprecated in bun:sqlite)
2. Create `server/src/db/queries/<table>.ts` with typed query functions
3. Import and use those functions from services or resolvers

### Change resolution profiles
Edit `RESOLUTION_PROFILES` in `server/src/config.ts` and the `Resolution` enum in `server/src/types.ts`. Also update the `GQL_TO_RESOLUTION` / `RESOLUTION_TO_GQL` maps in `server/src/graphql/mappers.ts` and the schema enum in `schema.ts`.

### Add a new client component with data
1. Create `client/src/components/<kebab-case-name>/ComponentName.tsx` — the directory name is the kebab-case of the component name (e.g. `VideoCard` → `video-card/`)
2. Define a `graphql` fragment in the component file (`fragment ComponentName_prop on TypeName { ... }`)
3. Import the generated `$key` type from `~/relay/__generated__/`
4. Accept the `$key` as a prop; call `useFragment` inside the component
5. Spread the fragment in the parent query or parent fragment
6. Run `bun relay` from `client/`
7. Put any formatting/computation helpers in `client/src/utils/`, not in the component file — import them with the `~/` alias (e.g. `~/utils/formatters.js`)
8. If the component has stateful side-effect logic (timers, event listeners, refs, async pipelines), extract it into a hook in `client/src/hooks/`

### Add a new page
Pages follow a two-file shell/content split:
- `XxxPage.tsx` — the Suspense shell. Wraps `XxxPageContent` in `<Suspense fallback={<PageSkeleton />}>`. Contains no data-fetching logic.
- `XxxPageContent.tsx` — the actual page. Calls `useLazyLoadQuery` at the top. All Relay, state, and layout logic lives here.

Add the route in `client/src/router.tsx` inside the `AppShell` layout route.

### Code-split a heavy component
Heavy components (video player, large detail panels) are split into their own JS chunk so they don't block the initial page load.

1. Write the component normally in `ComponentName.tsx` inside its `<kebab-case>/` directory
2. Create `ComponentNameAsync.tsx` alongside it (same directory):

```tsx
// ComponentNameAsync.tsx
import type { LazyExoticComponent } from "react";

import { lazyNamedExport } from "~/utils/lazy.js";
import type { ComponentName as ComponentNameType } from "./ComponentName.js";

export const ComponentNameAsync: LazyExoticComponent<typeof ComponentNameType> = lazyNamedExport(
  () => import(/* webpackChunkName: "ComponentName" */ "./ComponentName.js"),
  (m) => m.ComponentName
);
```

**Always include the `/* webpackChunkName: "ComponentName" */` magic comment** in the `import()` call. Without it, Rspack emits an anonymous numeric chunk ID (e.g. `async_744`) that is meaningless in bundle analysis and the production file listing. The comment name should match the component name exactly.

3. Import `ComponentNameAsync` (not `ComponentName`) at the call site
4. Wrap the usage in `<Suspense fallback={...}>` at the appropriate ancestor

The `lazyNamedExport` helper in `client/src/utils/lazy.ts` wraps `React.lazy()` to handle named exports while preserving the full component type. The bundler names the chunk after the imported module file automatically.

### Preload a Relay query on user interaction (not on mount)
When a user action (e.g. clicking a card) should open a detail pane, start the network request at click time — not when the pane mounts — to eliminate the waterfall:

```tsx
// In the page component
const [queryRef, loadQuery] = useQueryLoader<MyQuery>(MY_QUERY);

const handleCardClick = (id: string): void => {
  loadQuery({ id });          // fires the request immediately
  setSearchParams({ item: id });  // pane becomes visible
};

// In JSX
{queryRef && (
  <Suspense fallback={null}>
    <MyDetailPane queryRef={queryRef} />  {/* already has data by the time it mounts */}
  </Suspense>
)}
```

Add `key={id}` to the detail pane component when the `queryRef` can change between items — this forces a clean remount and prevents Relay's "preloaded query was disposed" warning when switching from one item to another.

### Add a live-updating subscription with auto-refetch
Pattern used by `DashboardPage` and `LibraryPage` for scan progress:

```tsx
const wasScanning = useRef(false);
const [fetchKey, setFetchKey] = useState(0);
const [, startTransition] = useTransition();

const scanConfig = useMemo(() => ({
  subscription: SCAN_SUBSCRIPTION,
  variables: {},
  onNext: (response) => {
    const isScanning = response?.libraryScanUpdated?.scanning ?? false;
    if (wasScanning.current && !isScanning) {
      // Scan just ended — refetch in the background without suspending
      startTransition(() => setFetchKey((k) => k + 1));
    }
    wasScanning.current = isScanning;
  },
  onError: () => {},
}), []);

useSubscription(scanConfig);

const data = useLazyLoadQuery(QUERY, variables, {
  fetchKey,
  fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network",
});
```

The `wasScanning` ref detects the `true → false` transition. `startTransition` keeps the current UI visible while the refetch runs in the background.

### Add a test for a pure utility or parser function
Tests live alongside source in a `__tests__/` subdirectory. Use real-world input examples — not invented ones — especially for any function that parses human-generated strings (filenames, URLs):

```ts
// server/src/services/__tests__/myService.test.ts
import { describe, expect, it } from "bun:test";
import { myParser } from "../myService.js";

describe("myParser", () => {
  it("handles the common case", () => {
    expect(myParser("input")).toEqual({ title: "Input", year: 2024 });
  });
  it("documents known limitations as expectations", () => {
    // "2049" is part of the title but looks like a year — document, don't hide
    expect(myParser("Blade-Runner-2049-2017.mkv")).toEqual({ title: "Blade-Runner", year: 2049 });
  });
});
```

Run with `bun test` from `server/`.

### Add a new feature flag

Feature flags are split across two files: `client/src/config/flagRegistry.ts` holds the declarations only (`FLAG_KEYS`, `FLAG_REGISTRY`, `FlagDescriptor`), and `client/src/config/featureFlags.ts` holds the runtime (cache, hydration, pub/sub, `getEffectiveBufferConfig`). They persist per-user in the server's `user_settings` key/value table, hydrate once on app boot via the `settings(keys)` GraphQL query, and are readable from both React (`useFeatureFlag`) and non-React code (`getFlag`, `getEffectiveBufferConfig`).

1. Append an entry to `FLAG_REGISTRY` in `flagRegistry.ts` with a `key`, human `name`, `description`, `valueType` (`"boolean"` or `"number"`), `defaultValue`, and `category` (`"playback" | "telemetry" | "ui" | "experimental"`). Storage-key convention: `flag.<camelCase>` for booleans, `config.<camelCase>` for tunable numbers. The FlagsTab in Settings renders from the registry automatically.
2. **Update `docs/feature-flags.md` in the same commit** — add a row to the table for the flag's category (or add the category if it was previously empty). Policy: the catalog must stay in lock-step with `FLAG_REGISTRY` so future contributors can audit what flags exist without reading TypeScript. A flag change with no doc update is a review-blocker.
3. Read the flag in a React component via `const { value, setValue } = useFeatureFlag(FLAG_KEYS.myFlag, defaultValue)`. The setter calls the existing `setSetting` mutation and updates the module cache optimistically.
4. Read the flag in non-React code via `getFlag(FLAG_KEYS.myFlag, defaultValue)` — synchronous, returns the hydrated value or the fallback. `PlaybackController` follows this pattern: it calls `getEffectiveBufferConfig()` at `new BufferManager(...)` construction time so toggling a flag takes effect on the *next* playback session, not mid-stream.
5. Do not introduce a new React context for the flag — the module-level cache + `useSyncExternalStore` is the only subscription mechanism. Additional providers fragment the cache and break the non-React read path.

### Add a new environment variable

1. Add the variable to `.env.example` with a placeholder or default value and a one-line comment explaining it.
2. Add a corresponding entry in `scripts/check-env.sh`:
   - Use `check_secret` for API keys, passwords, and auth headers — the name is printed green/red; the value is never revealed.
   - Use `check_default` for variables that have a safe built-in fallback.
   - Use `check_not_localhost` for URL variables that must not point to localhost in production.
   - Place the new check in the appropriate section (Server, Metadata, Telemetry, etc.); add a new `section` heading if the variable belongs to a new concern.
3. If the variable is read in `server/src/config.ts`, add it to both `dev` and `prod` objects as appropriate.
4. Run `bun check-env` to confirm the new variable shows up correctly.

---

**Hooks (see `client/src/hooks/`):**
- `useChunkedPlayback(videoRef, videoId, resolution, onJobCreated?)` — primary playback hook; owns client-driven chunk scheduling, prefetch trigger at `chunkEnd - 60s`, seek restart at chunk boundaries, background-buffer resolution switch, and the `chunk.stream` span per chunk (whose context is passed into `StreamingService.start` so the server's `stream.request` becomes its child); returns `{ status, error, startPlayback, seekTo }`
- `useVideoPlayback(videoRef, videoId, onJobCreated?)` — thin wrapper around `useChunkedPlayback` that preserves the original `VideoPlayer` call-site signature; returns `{ status, error, startPlayback }`
- `useVideoSync(videoRef)` — syncs `currentTime` and `isPlaying` from a `<video>` element using `requestAnimationFrame`; returns `{ currentTime, isPlaying }`
- `useJobSubscription(jobId, onProgress)` — subscribes to `transcodeJobUpdated` for the given job ID and calls `onProgress` on each update; pass `null` to unsubscribe
- `useSplitResize(defaultWidth)` — drag-to-resize for split-pane layouts; returns `{ paneWidth, containerRef, onResizeMouseDown }`
- New hooks belong in `client/src/hooks/`. Component files should contain only the component, its Relay fragment/mutation tags, and prop types.

`useSubscription` from `react-relay` can be called directly in page components for subscriptions scoped to the page. Use `useMemo` for the subscription config object to avoid identity churn.

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

export function isMyComponentEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === MY_ORIGINATOR;
}
export function createSomethingHappenedEvent(value: string): NovaEvent<SomethingHappenedData> {
  return { originator: MY_ORIGINATOR, type: MyEventTypes.SOMETHING_HAPPENED, data: () => ({ value }) };
}
export function isSomethingHappenedEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === MY_ORIGINATOR && wrapper.event.type === MyEventTypes.SOMETHING_HAPPENED;
}
```

In the parent that handles the events:
```tsx
const interceptor = useCallback(async (wrapper, _forwardEvent) => {
  if (isSomethingHappenedEvent(wrapper) && wrapper.event.data) {
    const { value } = wrapper.event.data() as SomethingHappenedData;
    // handle it
  }
  return wrapper; // forward; only return undefined to consume
}, [deps]);

<NovaEventingInterceptor interceptor={interceptor}>
  <MyComponent ... />
</NovaEventingInterceptor>
```

Event files are colocated with their component (`ControlBar.events.ts` next to `ControlBar.tsx`). Do not define event constants inline in component files or in a shared top-level `events.ts`.

**Relay rules (see `docs/relay.md` for full detail):**
- `useLazyLoadQuery` only in `src/pages/` — never in components
- Components receive fragment keys (`$key`), not raw data props
- The GraphQL schema is the single source of truth for types — import from relay-generated artifacts or `src/types.ts`, never redefine locally
- Fragment naming: `<ComponentName>_<propName>` (e.g. `VideoCard_video`)
- **Operation naming**: the graphql tag's operation name must start with the containing module's filename. In `useChunkedPlayback.ts`, the mutation must be `useChunkedPlaybackStartChunkMutation`; in `PlayerPage.tsx`, the query must be `PlayerPageQuery`. relay-compiler enforces this and will error on mismatches.

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
- Relay fragment components use the **`withRelay` decorator** from `client/src/storybook/withRelay.tsx` — add `parameters.relay` with a `@relay_test_operation` query and `mockResolvers`. Do NOT use `createMockEnvironment` / `RelayEnvironmentProvider` directly in story files.
- Story queries must have `@relay_test_operation` directive; run `bun relay` from `client/` after adding/changing a story query
- Each visual variant is a named export with its own `parameters.relay.mockResolvers` override
- Stories test visual states, not behaviour; keep them free of application logic
- Add `play` functions (from `@storybook/test`) to verify interactive states

**Storybook shared decorators (`client/src/storybook/`):**
- `withRelay` — mock Relay environment for fragment components. Add to `meta.decorators` and set `parameters.relay`:
  - `query` — a `graphql` tagged template with `@relay_test_operation`
  - `variables` — query variables
  - `mockResolvers` — object keyed by GraphQL type name, values are resolver functions
  - `getReferenceEntry(result)` — maps one root field to a component prop (single-fragment case)
  - `getReferenceEntries(result)` — maps multiple root fields (multi-fragment case)
- `withNovaEventing` — wraps a story in a no-op `NovaEventingProvider`. Required for any component that calls `useNovaEventing()`.
- `withLayout(style)` — wraps a story in a plain `<div>` with the given CSS styles. Never write inline JSX decorators in story files — the classic Babel transform requires `React` to be in scope for JSX, but the shared decorator files already import it.

**React Router in Storybook (React Router v6):**
- The global Storybook preview (`client/.storybook/preview.tsx`) already wraps every story in a `MemoryRouter`. Components using `useLocation`, `useNavigate`, or `Link` work automatically.
- To control the active route in a story, set `parameters.router.initialEntries` — an array of path strings (e.g. `["/settings"]`).
- Do NOT add a second `MemoryRouter` in a story decorator.

---

## Debugging Playbooks

### GraphQL subscriptions not receiving events

Symptoms: `onNext` is never called; the UI doesn't refresh after a scan; no subscription messages appear in the browser's Network → WS tab.

**Check 1 — Rsbuild proxy forwards WebSocket upgrades**

In `client/rsbuild.config.ts`, the `/graphql` proxy entry must have `ws: true`:
```ts
proxy: {
  "/graphql": { target: "http://localhost:3001", ws: true },
}
```
Without this, Rsbuild intercepts the WebSocket upgrade and returns HTTP 200, silently killing the connection.

**Check 2 — Bun.serve has a WebSocket upgrade handler**

In `server/src/index.ts`, the `fetch` handler must explicitly upgrade WebSocket requests, and `Bun.serve` must have a `websocket` key:
```ts
import { handleProtocols, makeHandler as makeWsHandler } from "graphql-ws/lib/use/bun";
import { schema } from "./routes/graphql.js";

// Inside fetch():
if (url.pathname === "/graphql" && req.headers.get("upgrade") === "websocket") {
  const protocol = req.headers.get("sec-websocket-protocol") ?? "";
  if (!handleProtocols(protocol)) return new Response("Bad Request", { status: 400 });
  if (!server.upgrade(req)) return new Response("WebSocket upgrade failed", { status: 500 });
  return new Response();
}

// In Bun.serve options:
websocket: makeWsHandler({ schema }),
```

**Check 3 — Verify in browser DevTools**

Open Network → WS → click the `/graphql` connection → Messages tab. You should see `{"type":"connection_ack"}` from the server within 1s of page load. If the connection shows status 200 instead of 101, the upgrade handler is missing.

**Check 4 — Subscription config is stable (no identity churn)**

The `useMemo` wrapping the subscription config object must have an empty or stable dependency array. A new object reference on every render causes `useSubscription` to resubscribe constantly.

---

### UI not refreshing after a scan completes

Symptoms: scan runs (spinner shows), scan ends, but the library/dashboard data doesn't update.

The scan subscription drives a `wasScanning` ref pattern. The full chain is:

```
server emits scanning=true  → wasScanning.current = true
server emits scanning=false → wasScanning.current && !isScanning → setFetchKey(k+1)
fetchKey change             → useLazyLoadQuery re-fetches with network-only
```

If any link in this chain is broken, the refetch won't fire:
1. If the WebSocket isn't connected, `onNext` is never called → see playbook above.
2. If `wasScanning.current` is never set to `true`, the `scanning=false` event is ignored. Add a `console.log` inside `onNext` to verify events are arriving.
3. If `fetchKey` isn't being passed to `useLazyLoadQuery`, the query won't re-run. Verify: `useLazyLoadQuery(QUERY, vars, { fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network" })`.

---

### GraphQL field resolving to wrong value (resolver ordering conflict)

Symptoms: a field (e.g. `Video.matched`) always returns `false`/`null` even when data exists in the DB.

**Root cause:** `@graphql-tools/schema`'s `makeExecutableSchema` merges resolvers by `Object.assign`. If two resolver objects define the same type+field, the **last one wins**. Check the merge order in `server/src/routes/graphql.ts`.

**Fix:** Each GraphQL type has exactly one authoritative resolver file:
- `Video.*` → `resolvers/video.ts`
- `Library.*` → `resolvers/library.ts`
- `TranscodeJob.*` → `resolvers/job.ts`
- Root fields → `resolvers/query.ts`, `mutation.ts`, `subscription.ts`

Never define `Video.matched` in `query.ts` and again in `video.ts`. Search for the field name across all resolver files to find conflicts:
```
grep -r "matched:" server/src/graphql/resolvers/
```

---

### OMDb auto-match not linking well-labelled files

Symptoms: `[scanner] Auto-matching N unmatched video(s)` appears in server logs but no `[scanner] Matched:` lines follow.

**Step 1 — Verify OMDB_API_KEY is configured**

`omdbService.ts` checks `process.env.OMDB_API_KEY` first, then falls back to `getSetting("omdbApiKey")` (saved via Settings → Metadata). If neither is set, `isOmdbConfigured()` returns `false` and auto-match is skipped entirely. The server logs a warning on startup if the key is absent.

**Step 2 — Test title extraction against your actual filenames**

`parseTitleFromFilename` in `libraryScanner.ts` handles dot-separated torrent names, parenthesized years `(2024)`, and year-at-end patterns. Test it directly:

```ts
import { parseTitleFromFilename } from "./server/src/services/libraryScanner.ts";
console.log(parseTitleFromFilename("Furiosa: A Mad Max Saga (2024) 4K.mkv"));
// Expected: { title: "Furiosa: A Mad Max Saga", year: 2024 }
```

If the extracted title is wrong, add the filename as a test case in `server/src/services/__tests__/libraryScanner.test.ts` and fix the regex. Drive all regex changes from real filenames, not invented ones.

**Step 3 — Check whether the title is in OMDb's catalog**

OMDb doesn't have every film. Titles with unusual characters, regional names, or very new releases may not match. The `searchOmdb` call returns `null` on no-match — this is silent by design. If a specific title should match, verify it at `https://www.omdbapi.com/?t=<title>&y=<year>&apikey=<key>` directly.

**Step 4 — Trigger a fresh re-scan**

Unmatched videos stay in `getUnmatchedVideoIds()` across scans. After fixing a parser bug or adding the API key, trigger a new scan (click "Scan" in Settings → Library, or restart the server) — the fix applies automatically to all previously-unmatched videos.

---

### Effect cleanup: intervals with nested timeouts

Symptoms: React warns "Can't perform a state update on an unmounted component"; state changes fire after a component is gone.

When a `setInterval` callback schedules a `setTimeout` (e.g. for slide fade transitions in `Slideshow`), the cleanup function must cancel **both**:

```ts
useEffect(() => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const intervalId = setInterval(() => {
    // ... update state ...
    timeoutId = setTimeout(() => {
      // ... update state again ...
    }, FADE_DURATION);
  }, SLIDE_INTERVAL);

  return () => {
    clearInterval(intervalId);
    if (timeoutId !== null) clearTimeout(timeoutId);
  };
}, [deps]);
```

If only the interval is cleared, any in-flight timeout fires after unmount and calls `setState` on a dead component.

---

### Relay "preloaded query was disposed" warning

Symptoms: switching between detail items (e.g. clicking film A then film B) triggers a React warning about a disposed preloaded query.

**Root cause:** `usePreloadedQuery` holds a reference to a query ref. When `loadQuery` is called again (new film), the old ref is disposed. If the component holding `usePreloadedQuery` hasn't remounted, it tries to read a disposed ref.

**Fix:** Add `key={selectedId}` to the component that calls `usePreloadedQuery`:

```tsx
{queryRef && (
  <Suspense fallback={null}>
    <FilmDetailLoader key={filmId} queryRef={queryRef} linking={linkingParam} />
  </Suspense>
)}
```

This forces a clean remount for each new film, so `usePreloadedQuery` always reads a fresh ref.

---

### Identifying the active dev server port

When multiple Rsbuild instances are running (e.g. a stale session + a new one), the correct server is always the one started with `bun run client` from the workspace root, listening on the configured port (default: `5173`). Check with:

```sh
lsof -i :5173   # should show the Rsbuild process
lsof -i :5177   # stale instance if present — kill it
```

Always test at `http://localhost:5173`, not at any other port that happens to respond.

---

### Zombie ffmpeg processes consuming memory

Symptoms: `ps aux | grep ffmpeg` shows multiple identical ffmpeg processes (same video, resolution, and time range); server RAM climbs continuously; `pgrep ffmpeg | wc -l` is higher than the number of active player tabs.

**Diagnosis**

Each process line will look identical — same input file, same `-ss`/`-t` flags, same output pattern. That confirms they're encoding the same chunk, not different ones.

```sh
ps aux | grep ffmpeg | grep -v grep
# Look for 2+ lines with the same -ss, -t, and segment_dir
```

**Root cause — async initialization window**

The most common cause is a race condition in `startTranscodeJob` (`server/src/services/chunker.ts`): the duplicate-check (`getJob(id)`) and the concurrent-job cap (`activeCommands.size`) are both evaluated *before* the new job is registered. If two calls arrive during the window between the first `await` (e.g. `access`, `mkdir`) and the `setJob()` call that makes the job visible, both pass all guards and each spawns an independent ffmpeg process.

The fix is a synchronous `inflightJobIds = new Set<string>()` that is updated before any `await`:

```ts
inflightJobIds.add(id);   // before first await
// ... async work (access, mkdir) ...
insertJob(job);
setJob(job);
inflightJobIds.delete(id); // job now visible in jobStore
```

Include `inflightJobIds.size` in the `MAX_CONCURRENT_JOBS` check:
```ts
if (activeCommands.size + inflightJobIds.size >= MAX_CONCURRENT_JOBS) { ... }
```

And for duplicate IDs, poll `getJob(id)` rather than proceeding:
```ts
if (inflightJobIds.has(id)) {
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(100);
    const pending = getJob(id);
    if (pending) return pending;
  }
}
```

**Kill existing zombies**

```sh
ps aux | grep ffmpeg | grep -v grep | awk '{print $2}' | xargs -r kill -9
```

`pkill ffmpeg` may return exit code 1 (no match) or 144 (signal delivery issue on some kernels) even when processes are killed — use the `awk | xargs kill` form instead and verify with a follow-up `pgrep ffmpeg | wc -l`.

---

### React state persisting across React Router navigation (component reuse)

Symptoms: navigating from page A to page B (same route pattern, different params) leaves stale state visible — e.g. an "ended" playback overlay shows on the new video, or a detail pane shows data from the previous item.

**Root cause**

React Router v6 reuses the component instance when navigating between routes with the same pattern (e.g. `/player/:id → /player/:otherId`). `useState` values are not reset; only props change. Any state that is logically "per-item" (ended, selected, open) must be explicitly reset when the item changes.

**Fix — reset state in a `useEffect` keyed on the changing identifier**

```tsx
// Reset ended/selected/open state when the item changes
useEffect(() => {
  setIsEnded(false);
}, [data.id]);   // or whatever the unique identifier is
```

**Detection**

Use Playwright (or manual testing) to navigate between two items and check that no state from item A leaks into item B. Specifically test:

1. Trigger the state on item A (play to end, open a pane, select something)
2. Navigate to item B via a link/route change (not a page reload)
3. Verify item B starts with clean state

If the bug is subtle (e.g. only visible for one render frame before the effect fires), add a `key` prop at the route level to force a full remount instead:

```tsx
<VideoPlayer key={videoId} video={data} />
```

Use the `useEffect` reset for lightweight state; use `key` remounting when the component has refs, subscriptions, or MSE pipelines that need full teardown.

---

### Griffel style property type errors

Symptoms: TypeScript errors like `Type '"rgba(...)"' is not assignable to type 'undefined'` or `Object literal may only specify known properties` inside a `makeStyles()` call, even though the value looks correct.

**Common causes**

1. **Wrong shorthand vs longhand in pseudo-selectors.** Inside `:hover`, `:focus`, etc., Griffel requires the same shorthand form used in the base rule. If the base rule uses the `border` shorthand, the hover rule must also use `border` (not `borderColor`, `borderWidth`, etc. separately). Mixing shorthands and longhands in the same property tree causes TypeScript to infer `undefined` for the longhand variant.

   ```ts
   // Wrong — borderColor alone inside :hover when base uses `border` shorthand
   ":hover": { borderColor: "rgba(255,255,255,0.35)" }

   // Correct — repeat the full shorthand
   ":hover": { border: "1px solid rgba(255,255,255,0.35)" }
   ```

2. **Non-Griffel CSS property names.** Griffel uses camelCase React CSS property names (`backgroundColor`, not `background-color`). Vendor-prefixed properties use the React convention (`WebkitLineClamp`, not `-webkit-line-clamp`).

3. **`animationName` must use a keyframe object, not a string.** Griffel generates class names for keyframes inline:
   ```ts
   animationName: { to: { transform: "rotate(360deg)" } }  // correct
   animationName: "spin"  // wrong — Griffel doesn't accept string keyframe names
   ```

**Debugging approach:** When a property inside a pseudo-selector errors, check the base rule for that element first. If the base uses a shorthand, the pseudo-selector must use the same shorthand. TypeScript's error message will say `undefined` but the real issue is property name mismatch.

---

### `useCallback`/`useEffect` ordering: hook used before it is declared

Symptoms: TypeScript error `Block-scoped variable 'X' used before its declaration` on a `useEffect` that references a `useCallback` defined later in the file.

**Root cause**

React hooks must be called in consistent order (Rules of Hooks), but `useCallback`/`useEffect` are just function calls — JavaScript hoists `const` declarations to the top of the block but does not initialize them (temporal dead zone). A `useEffect` that closes over a `useCallback` declared below it will fail at runtime and at compile time.

**Fix — declare `useCallback` hooks before any `useEffect` that references them**

Reorder the hooks so dependencies are always declared above their consumers. A natural ordering is:

1. Fragment reads (`useFragment`)
2. State declarations (`useState`)
3. Refs (`useRef`)
4. Callbacks (`useCallback`) — in dependency order (callbacks used by other callbacks go first)
5. Effects (`useEffect`) — after all callbacks they reference

When an effect and a callback have a circular dependency, extract the shared logic into a plain (non-hook) function called by both.

---

### Stream log disappears after navigating to the player

Symptoms: stream log overlay was visible on the dashboard/library page, but after clicking through to `/player/:id` the overlay is gone and logs do not appear during playback.

**Root cause**

`DevToolsContext` (which holds `streamingLogsOpen`) is mounted at the app root and resets to its default state (`false`) on each React Router navigation that unmounts and remounts the context subtree. The overlay toggle is not persisted to `localStorage` or any server-side setting — it is ephemeral UI state.

**Fix for e2e / manual testing**

After navigating to the player page, re-open the DEV panel (bottom-right pill) and re-enable **"Stream Logs ON"** before starting playback. This is a known workflow quirk and is documented in the `/e2e_test` skill.

**Fix if persistence is needed**

Persist `streamingLogsOpen` to `localStorage` inside `DevToolsContext`. On mount, read the stored value and initialise from it. Use a `useEffect` to write back when the value changes. Key: `"devtools.streamingLogsOpen"`.

---

## Future Direction — Rust Server Rewrite

The Bun/JS server is a **prototype** used to validate the architecture quickly. Once the design is proven, the server will be rewritten in Rust for performance gains (critical at 4K bitrates). The React/Relay client is intended to remain **completely untouched** across this rewrite.

GraphQL and the binary stream endpoint are the stable contracts between server and client. When porting to Rust:

- The **GraphQL schema SDL** must be identical — same types, field names, enum values, and nullability
- **Global ID encoding** must match: `base64("TypeName:localId")` — Relay's cache depends on this
- **`/stream/:jobId` binary framing** must match: 4-byte big-endian uint32 length prefix + raw fMP4 bytes, init segment always first — documented in `docs/Streaming Protocol.md`
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
- `client/eslint.config.js` — extends root, adds `react-hooks` rules, relaxes `explicit-module-boundary-types` for `*.stories.*` files, bans `../` cross-module imports

**Key enforced rules:**
- All exported functions must have explicit return types (`@typescript-eslint/explicit-module-boundary-types`)
- Floating promises must use `void` or be awaited (`@typescript-eslint/no-floating-promises`)
- Type-only imports must use `import type` (`@typescript-eslint/consistent-type-imports`)
- Non-null assertions (`!`) are forbidden (`@typescript-eslint/no-non-null-assertion`) — use optional chaining or explicit guards; exception: test files where `!` post-`expect` is acceptable
- React hook rules enforced: `react-hooks/rules-of-hooks: error`, `react-hooks/exhaustive-deps: warn`
- Cross-module imports must use the `~/` alias (`no-restricted-imports` bans `../`) — same-directory `./` imports are still allowed for colocated files within a component directory

---

## Server Resolver Conventions

- **Explicit return types** — all resolver functions must have a TypeScript return type annotation (`: GQLLibrary`, `: Promise<GQLTranscodeJob>`, etc.)
- **Presenters, not inline formatting** — data mapping (global ID encoding, enum conversion, camelCase) lives in `server/src/graphql/presenters.ts`. Resolver files call `presentLibrary()`, `presentVideo()`, `presentJob()` — never call `toGlobalId` or mapper functions directly from resolvers
- **Resolvers call services; services call DB** — resolver files (`resolvers/`) should not import from `db/queries/` directly. Business/service logic (like chunker, libraryScanner) is the bridge. For simple read-only cases the DB import in resolvers is acceptable but the formatting must still go through presenters
- **One resolver per field** — each `Type.field` has exactly one home. See "One resolver owns each GraphQL field" in Key Invariants.

---

## Skills and Agent Workflows

### Screenshots
All screenshots taken by skills or agents must be saved to `.claude/screenshots/` relative to the project root. Never save screenshots to the project root or any other directory. Use descriptive filenames prefixed with the step number (e.g. `.claude/screenshots/01-home.png`).

### Verify UI changes in the browser — required

After implementing any UI feature or component, always verify it works before reporting the task complete. Run `/debug-ui` for any UI interaction — navigating pages, taking screenshots, verifying feature behaviour, and inspecting runtime errors.

**If the change touches the streaming pipeline** (BufferManager, StreamingService, useChunkedPlayback, server stream route, or chunker): run `/e2e-test` to confirm end-to-end playback is unbroken.

**If the change is a significant backend modification** (new GraphQL resolver, DB schema change, stream protocol change): run `/e2e-test` before reporting complete.

Never report a task complete without having opened the browser and taken at least one screenshot confirming the feature works.

### Reflect skill
After any significant session, run `/reflect` to capture non-obvious learnings into skill files and CLAUDE.md. The PreCompact hook runs this automatically before context compaction. Only write actionable gotcha-prevention notes — not narrative summaries of what was done.

### Update docs when the streaming pipeline changes — required

The four sequence diagrams in `docs/diagrams/streaming-0{1..4}-*.mmd` and the `### Scenario N:` subsections under `## Data Flow: Playback` in `docs/architecture.md` describe the playback pipeline. When a code change alters a visible interaction in any of those diagrams — actor calls, ordering, span boundaries, back-pressure thresholds, seek/snap logic, or the resolution-switch handoff — run `/update-docs` to update the affected `.mmd`, regenerate its PNG, and refresh the prose. The `.mmd` file is authoritative; PNGs are regenerated from it.

Trigger files: `PlaybackController.ts`, `StreamingService.ts`, `BufferManager.ts`, `useChunkedPlayback.ts`, `server/src/routes/stream.ts`, `server/src/services/chunker.ts`, and the `startTranscode` resolver. Pure internal refactors that don't alter the visible call sequence don't need a diagram update. Docs and code ship in the same commit — never in separate PRs.

---

## Observability and Logging

Full policy in `docs/observability.md`. Key rules agents must follow:

**Spans at a glance.** When working in a file that emits telemetry, know which spans already exist before adding new ones:

| Side | Span | Where it's opened |
|---|---|---|
| Client | `playback.session` | `PlaybackController.startPlayback` |
| Client | `chunk.stream` | `PlaybackController.streamChunk` — one per chunk; its context is threaded into `StreamingService.start(parentContext)` so the `GET /stream/:jobId` fetch span (and the server's `stream.request`) nest under it. Records `chunk.bytes_streamed` and `chunk.segments_received` at end |
| Client | `transcode.request` | `PlaybackController.requestChunk` — one per `startTranscode` mutation (including prefetches). `chunk.is_prefetch` attribute distinguishes RAF-driven prefetches from on-demand chain calls. The `graphql.request` HTTP span nests under it |
| Client | `buffer.halt` | `BufferManager.checkForwardBuffer` — one per back-pressure pause→resume cycle. Parented on `playback.session` (halts can outlast a single `chunk.stream`). Span duration is the stall length |
| Client | `graphql.request` | FetchInstrumentation (automatic) |
| Server | `stream.request` | `routes/stream.ts` — child of client's `chunk.stream` |
| Server | `job.resolve` | `chunker.startTranscodeJob` — covers cache-hit / inflight / restored-from-db / newly-started paths via one of four events (`job_cache_hit`, `job_inflight_resolved`, `job_restored_from_db`, `job_started`) |
| Server | `transcode.job` | `chunker` when ffmpeg is actually spawned |
| Server | `library.scan` | `libraryScanner.scanLibraries` |

Add a new span only when none of these covers the work. Prefer `span.addEvent()` on an existing span for discrete transitions.

**Message bodies must be self-describing.** A log record's body should read as a complete sentence without needing to expand attributes:
```ts
// Bad
log.info("Stream paused", { buffered_ahead_s: 23.4 });
// Good
log.info("Stream paused — 23.4s buffered ahead (target: 20s)", { buffered_ahead_s: 23.4, target_s: 20 });
```

**Spans vs. log records:** Use a span for operations with meaningful duration (HTTP requests, transcode jobs, playback sessions). Use a log record for discrete events within a span (state transitions, errors, counters). Never emit a span for something instantaneous — use `span.addEvent()` instead.

**Log levels:** `info` for normal lifecycle events; `warn` for recoverable problems; `error` for failures that affect the user or indicate a bug. Do not use `info` for errors that degrade UX. Do not use `error` for expected edge cases handled gracefully.

**Always log WHY on cleanup/kill.** Pass and log the kill reason — never just "Killing job":
```ts
killJob(id, "client_disconnected"); // → logs "Killing ffmpeg — client_disconnected"
```
Standard kill reasons: `client_disconnected`, `stream_idle_timeout`, `orphan_no_connection`, `server_shutdown`.

**Don't cascade errors.** On a non-recoverable error in a processing loop, log once, set a `fatalError` flag, and break both the inner retry loop and the outer drain loop. Twenty identical errors mean the loop is not guarded.

**What NOT to log:** per-segment appends (too noisy), re-scanned existing videos (only log newly discovered), successful no-ops, timing details that belong on span attributes.

**No duplicate lifecycle logs when a span event already covers the transition.** If `chunker` fires a `job_started` event on `job.resolve`, do not also `log.info("Transcode started")`. If `BufferManager` logs the detailed back-pressure pause message, `StreamingService.pause()` must stay silent. Two records for the same event inflate Seq cost and split searches across near-duplicate strings. When in doubt: the owner closest to the state change keeps the log; everyone else gets a span event or nothing.

**Client:** all async logs must carry the active session traceId — handled automatically by `getClientLogger`. All fetch calls in the playback path must be wrapped: `context.with(getSessionContext(), () => fetch(url, options))`.

**Server:** request handlers must extract `traceparent` from incoming headers and pass the resulting context to `tracer.startSpan`. OTel context flows through the call chain as `parentOtelCtx?: OtelContext` — graphql-yoga resolvers receive it via `ctx.otelCtx`.

---

## What Not To Do

- **No ORM** — SQLite is accessed with raw `bun:sqlite` prepared statements only
- **No ad-hoc SQL** outside `db/queries/` — keeps all schema knowledge in one place
- **No server framework** beyond `graphql-yoga` — `Bun.serve()` handles routing directly
- **No global mutable state** outside `db/` (persisted), `jobStore.ts` (in-memory active jobs), and `scanStore.ts` (in-memory scan state)
- **No base64 or text encoding** of video data — the binary framing protocol (length-prefixed raw bytes) must not be replaced with base64 or JSON; the overhead at 4K bitrates is unacceptable
- **Do not call `appendBuffer` in a loop without awaiting `updateend`** — queue appends through `BufferManager.appendSegment()` which serializes them correctly
- **No non-null assertions (`!`)** — use optional chaining (`?.`) or explicit `if` guards instead; `!` masks null errors rather than preventing them
- **No callback props for user actions** — components use `@nova/react` eventing (`useNovaEventing().bubble()`) to surface interactions; intermediate parents handle events via `NovaEventingInterceptor`. Do not add `onXxx` callback props to components for things the user does (clicks, selections). Data-flow props (fragment keys, state values like `resolution` and `status`) are still plain props.
- **One `NovaEventingProvider` at the app root** — do not add more providers deeper in the tree. Intermediate components use `NovaEventingInterceptor` instead. Event files (`ComponentName.events.ts`) are colocated with their component, not in a shared top-level file.
- **No literal `className` strings** — all component styles must use Griffel (`makeStyles` / `mergeClasses`). Define styles in a colocated `ComponentName.styles.ts` file and consume them via `const styles = useComponentNameStyles()`. The only classes permitted in `global.css` are true browser globals: CSS resets, fonts, scrollbar, `[data-tip]` / `[data-tip-right]` tooltip attributes, `body.resizing` / `.is-resizing` (applied via `document.body.classList`). Everything else belongs in a Griffel styles file.
- **No duplicate resolver definitions** — defining the same `Type.field` in two resolver objects causes the second to silently override the first. Always consolidate into the single authoritative resolver file for that type.
- **No unencoded Relay IDs in route links** — always `encodeURIComponent(id)` when embedding a Relay global ID in a URL path segment. Relay IDs are base64 and may contain `/`, which breaks React Router's `:param` matching.
- **No plain string exports in `*.strings.ts` files** — all user-visible strings must use `react-localization`: `export const strings = new LocalizedStrings({ en: { key: "Value" } })`. A plain `export const strings = { key: "Value" } as const` bypasses the localization layer. Every `*.strings.ts` file must import `LocalizedStrings` from `"react-localization"`.
- **Icon pattern in `client/src/lib/icons.tsx`** — all icons must wrap their SVG paths with the `base()` helper, which applies the standard `24×24` viewBox, `stroke="currentColor"`, and size prop. Two documented exceptions exist: `IconEdit` (uses a `20×20` artboard with heavier stroke — passes overrides through `base()`) and `IconSpinner` (raw `<svg>` due to inline animation styles). Any new exception must be documented with a comment explaining why `base()` cannot be used. `LogoShield` is a brand mark, not an icon, and is exempt from the pattern.
- **No magic numbers** — numeric literals with non-obvious meaning must be extracted to named constants with a brief inline comment explaining the value. Example: instead of `for (let i = 0; i < 50; i++) { await sleep(100); }`, declare `const POLL_MS = 100; const TIMEOUT_MS = 5_000; const MAX_RETRIES = TIMEOUT_MS / POLL_MS;` and use the names. Group related constants together and add a comment block explaining the behaviour they control (e.g. `// Maximum time to wait for an in-flight job to register before falling through`).
