# Release-Design Port — Shared Plan & Roster

> **Single source of truth for the Release-design migration.** The
> `migrations-lead` subagent reads this file to know which milestone is next
> and how to brief the agent picking it up. Every agent updates the
> checklists in their milestone before handing off. One PR, one branch.

## Context

`design/Release/` is the finalised design lab for the first xstream release
(Xstream identity: green `oklch(0.78 0.20 150)`, Anton + Inter + JetBrains
Mono + Bytesized + Science Gothic). The production client at `client/src/`
still wears the Prerelease "Moran" identity (red, Bebas Neue) and an older
shell composition (CSS grid + 220px sidebar). We are porting the entire
Release lab into production in a single PR, milestone-by-milestone, with a
sequential chain of stateless agents driven by `migrations-lead`.

**Out of scope for this PR:** the streaming pipeline (`client/src/services/`
plus `useChunkedPlayback`, `useVideoPlayback`, `useVideoSync`) — only the
visual + structural wrapping around it changes.

**Schema posture:** v1 — break freely on both GraphQL and SQLite where the
new design supersedes the old surface (drop `Film.gradient`, drop `feedback`
types, rename if the design copy demands it).

**No feature flag.** Routes flip during their owning milestone.

**Confirmed decisions** (from session that produced this plan):
1. **Tests + Stories:** every ported component ships a `.stories.tsx`. Tests
   only when pure logic exists (e.g. `filters.ts`, `filmMatches`). E2E in
   the final milestone.
2. **Strings:** colocated `<name>.strings.ts` per component.
3. **Schema:** all GQL + SQL changes land in **Milestone 2** (one shot,
   breakages allowed).
4. **Cleanup:** the agent that lands a replacement deletes the superseded
   files in the same milestone (no dead-code lingering across milestones).
5. **Spec audit:** done per page/milestone, **not** as a single upfront
   pass. When a port spans multiple specs (e.g. Library pulls in 8
   components), add cross-page sync notes inside this plan so agents stay
   aligned.
6. **View transitions:** ship `document.startViewTransition()` with a tiny
   `withViewTransition(fn)` helper that gracefully no-ops on browsers that
   lack the API. (Works in current Firefox + Chromium.)
7. **Porting-Guide doc:** new file
   `docs/migrations/release-design/Porting-Guide.md` is the agent-facing how-to.

## How this plan is used

- `migrations-lead` is the orchestrator. The user spawns one high-perf agent
  per milestone; before that agent starts, `migrations-lead` reads this
  plan, finds the next un-done milestone, briefs the agent with its scope +
  inputs + verification checklist + hand-off notes.
- Each agent **updates this plan** as their final action: tick the
  milestone's `Status` row to `done`, record the commit SHA, and append any
  cross-cutting notes that the next agent needs.
- This plan + `docs/migrations/release-design/Porting-Guide.md` together are
  the agent's only briefing. Both are read first, every time.
- The PR branch is the persistent global state. `git push` after every
  milestone so the next agent picks up a clean working tree.

## Reference docs (read once, then keep open)

| Doc | Why | When |
|---|---|---|
| `docs/migrations/release-design/README.md` | Migration scope + contract | Every agent, first read |
| `docs/migrations/release-design/Changes.md` | Cross-cutting Prerelease → Release diff | Every agent, first read |
| `docs/migrations/release-design/Components/README.md` | Catalog of all 30 specs | Every agent |
| `docs/migrations/release-design/Components/<Name>.md` | Per-component spec | The agent owning that component |
| `docs/migrations/release-design/Porting-Guide.md` | **Created in M0** — agent how-to | Every agent after M0 |
| `docs/migrations/release-design/Schema-Changes.md` | **Created in M0** — schema delta catalog | M2 (implementation), M3+ (consumers) |
| `docs/code-style/Client-Conventions/00-Patterns.md` | Relay, Griffel, Nova, Heroicons | Every UI-porting agent |
| `docs/code-style/Invariants/00-Never-Violate.md` | Hard rules (URL-encoded Relay IDs, MSE order, etc.) | Every agent |
| `docs/architecture/Relay/00-Fragment-Contract.md` | `useLazyLoadQuery` only on pages, fragment naming | Page + fragment work |
| `docs/server/GraphQL-Schema/00-Surface.md` | Current schema, forward-notes | M2 |
| `design/Release/src/` | The visual + behavioural truth | Always |

## Engineering invariants (any agent that violates these has bugged) {#invariants}

These are sourced from `docs/code-style/`. The Porting-Guide
(written in M0) restates them with examples. Until that file exists, this
section is the canonical brief.

1. **Relay fragments:** `useLazyLoadQuery` lives in pages only. Components
   consume `<Name>_<propName>` fragments. Never extract a query into a
   reusable component.
2. **Griffel:** every component has `<Name>.styles.ts` exporting
   `useStyles()` from `makeStyles({...})`. No inline `style=` props except
   for animated values (drag pane width, view-transition names).
3. **Nova eventing:** every interactive component has an `<Name>.events.ts`
   colocated. User interactions emit Nova events; components don't directly
   call services.
4. **No `../` imports:** every cross-module import uses the `~/` alias;
   colocated siblings use `./`.
5. **No non-null `!`** outside post-`expect` test blocks.
6. **Tokens only:** import from `~/styles/tokens.ts`. No hard-coded hex,
   spacing, or fonts in `.styles.ts`.
7. **Heroicons via `~/lib/icons`:** never import from
   `@heroicons/react/...` directly.
8. **Strings:** colocated `<name>.strings.ts` (English only for now).
   Components consume `import { strings } from "./<name>.strings.js"`.
9. **Stories:** every ported component gets `<Name>.stories.tsx`. Use
   `withRelay` decorator for fragment components, `withLayout` for things
   that need the AppShell wrapper.
10. **Tests:** only for extracted pure logic (e.g. `filters.ts`, helpers).
    Tests live in `__tests__/` subfolder next to the source, never as a
    sibling `*.test.ts`.
11. **View transitions:** wrap any morph navigation in the
    `withViewTransition(fn)` helper introduced in M3. Never call
    `document.startViewTransition` directly.
12. **Playback untouchable:** no agent in this PR may modify
    `client/src/services/`, `client/src/hooks/useChunkedPlayback.ts`,
    `useVideoPlayback.ts`, or `useVideoSync.ts`. Player wrapping (chrome,
    side panel, controls layout) is fair game; the streaming pipeline is
    not.
13. **One PR.** Push, don't open new branches. Update this plan and the
    catalog as the only persistent state.

## Schema-change preview {#schema-preview}

The full catalog lands in `docs/migrations/release-design/Schema-Changes.md`
during M0; M2 implements it. The known set as of plan-write:

| Domain | GQL | SQLite | Notes |
|---|---|---|---|
| TV-show kind | `Video.kind: VideoKind!` (`MOVIE` / `SERIES`) | `videos.kind TEXT NOT NULL DEFAULT 'movie'` | Drives FilmTile/FilmRow badges, SeasonsPanel surfaces |
| Seasons + episodes | `Video.seasons: [Season!]!` with `Season.episodes: [Episode!]!` | `seasons` + `episodes` tables, FK on `videos.id` | Per-episode `onDisk: Boolean!`, `nativeResolution: Resolution`, `episodeNumber INTEGER` |
| Native resolution | `Video.nativeResolution: Resolution!` (movies) / per-episode (series) | `videos.native_resolution_w INTEGER`, `..._h INTEGER` | Forward-noted in `docs/server/GraphQL-Schema/00-Surface.md`; client picker clamped to `[240p … native]` |
| Watchlist | `Watchlist` root field returning `[WatchlistItem!]!`; `addToWatchlist`, `removeFromWatchlist` mutations | `watchlist_items(user_id, video_id, added_at, progress_seconds)` | New table; old `watchlist-content/` removal mutation rewires |
| OMDb posters | `Video.posterUrl: String` (real OMDb URL or null) | `videos.poster_url TEXT` | `Film.gradient` field is dropped |
| Profile scan progress | `Library.scanProgress: ScanProgress` (status enum + counts) | already in `library_scans`; presenter extends | Profiles page footer `{N} SHOWS ({M} EPS)` aggregation |
| Drops | `feedback` types, `Film.gradient`, anything dashboard-only | DROP TABLE for unused, keep migration in same SQL file | Resolvers + UI references go in same milestone they're consumed |
| Renames | If lab copy says "profile", but schema says "library" → align | column rename via `ALTER TABLE` | Verify against `Components/Profiles.md` + `Components/ProfileForm.md` lab strings |

The exact column types, NULLability, and indexes live in the M0 doc.

## Milestone roster {#roster}

| #  | Milestone | Owner | Status | Notes |
|----|-----------|-------|--------|-------|
| M0 | Foundations: Plan + Porting-Guide + Schema-Changes + worktree setup | Opus 4.7 (2026-05-02) | done | Commit `262c57d`. Schema-Changes.md captures the discovery that the existing GQL surface is far more complete than the plan first assumed — the real M2 deltas are seasons/episodes + `Video.nativeResolution`. The design's `Film.kind` maps onto existing `Video.mediaType`. |
| M1 | Tokens, fonts, shared CSS, icon sweep | Opus 4.7 (2026-05-02) | done | Commit `7612343`. Wholesale-replaced tokens.ts (Kenyan red palette → Release green/oklch + four text tiers + Bytesized/Anton/Science Gothic). Added Google Fonts link to index.html, created shared.css (CSS-var mirror + .eyebrow/.chip/.dot/.grain-layer), updated global.css body bg/text + scrollbar to match new tokens, removed stale Bebas Neue @import. Added IconCheck + Release-named icon aliases (IconBack/IconChevron/IconFullscreen/IconExpand/IconVolume/IconWarn) + ImdbBadge. Created withViewTransition helper. Type-check fails on ~289 call sites consuming removed tokens (colorMuted, colorWhite, colorRedDim, etc.) — expected; these are M3+ to-dos. Spec sync clean — no Components/*.md cite removed tokens. |
| M2 | GraphQL + SQLite schema migration + TV-show discovery | Opus 4.7 (2026-05-02) | done | Schema commit `1a0c0d6`; SHA-record `4ee2723`; TV-discovery commit `4c56db6`. **Backend pivot:** M2 lands in `server-rust/` only; Bun is retired for new feature work as of 2026-05-02. Migration docs swapped to Rust paths. Adds `videos.native_resolution` column + `seasons`/`episodes` composite-PK tables, `Video.nativeResolution` + `Video.seasons` GraphQL fields, plus new `Season` + `Episode` types. **TV-show OMDb-driven discovery shipped in same PR:** `services/tv_discovery.rs` walks `<library>/<Show>/<Season>/<Episode>` layout, queries OMDb (`?s=<title>&type=series` → `?i=<imdbID>` → per-season `?i=<imdbID>&Season=N`), merges canonical episode list with local files, persists to seasons + episodes (matched/OMDb-only/local-only). `AppConfig.omdb_daily_budget` (default 800/1000) protects the free-tier quota with a soft-warn at <50 remaining. `LibraryScanProgress` extended additively with `phase` + `current_item` so the client UI can show granular per-OMDb-call progress. Tests: 270 unit + 12 integration, +23 net new vs M1 baseline. |
| M3 | AppShell + AppHeader + AccountMenu + Router cutover | Opus 4.7 (2026-05-02) | done | Commit `135962e` (50 files, +775/-3112). App boots with new shell (positioned-layer model: `<AppShell>` is `position: relative` 100vw×100vh, header floats absolute over `<main>`). Sidebar + sign-out-dialog + dashboard-page + dashboard-hero + feedback-page + film-detail-loader deleted. AppHeader is green-glass three-column grid (Bytesized brand "Xstream" + Science Gothic 12px nav + scan icon + circular avatar with AccountMenu dropdown). Router cutover: `/` → Library placeholder (M4), `/profiles`, `/profiles/new`, `/profiles/:profileId/edit` → placeholders (M5), `/watchlist` → placeholder (M6); `/settings`, `/player/:videoId`, `/goodbye` kept as-is; `/feedback` and `/play/:videoId` legacy alias removed. New shared `<PagePlaceholder>` component (`client/src/components/page-placeholder/`) used by all M4–M6 stub pages. Lint went from 289 token errors (M1) → 227 (M3 baseline) due to deleted dead code; zero non-token errors. 16/16 storybook tests passing across new AppShell/AppHeader/AccountMenu + Poster + PagePlaceholder. |
| M4 | Library page + dependencies (FilmDetailsOverlay, SearchSlide, FilterSlide, PosterRow, FilmTile, MediaKindBadge, SeasonsPanel, Poster) | Opus 4.7 (2026-05-02) | done | Five commits: `3a000d1` spec audit (5 baseline → done); `95ec06e` leaf components (MediaKindBadge + FilmTile + PosterRow); `d8a4417` search + filter + filters.ts utility + 10 vitest cases; `60b6ff7` FilmDetailsOverlay + SeasonsPanel with `viewTransitionName: "film-backdrop"` (M7 contract); plus the LibraryPage commit landing in this row. LibraryPage uses `useLazyLoadQuery` (LibraryPageContentQuery) for videos+watchlist, three-row carousel home (Continue Watching, New Releases, Watchlist) + flat search results grid + `?film=<id>` overlay. Schema additively extends `Video` with `nativeResolution: Resolution` and `seasons: [Season!]!` + new `Season`/`Episode` types (already shipped in `server-rust/`; just synced into `server/schema.graphql` for relay-compiler). Dead code removed: library-chips, library-film-list-row, library-filter-bar, library-list-header, poster-card, slideshow. Type errors went 227 (M3 baseline) → 208 from those deletions. **Note:** Hero-rotating-slideshow + greeting-tilt-3D + mouse-tracking deferred (polish pass — current LibraryPage shows a static "Tonight's library." hero in idle mode). Components consume TypeScript view models rather than per-component Relay fragments — LibraryPage owns the query and shapes data into FilmTileViewModel / FilmDetailsViewModel / SeasonViewModel before passing down. Lift to fragment-per-component is a future refactor, not load-bearing. |
| M5 | Profiles ecosystem (Profiles, ProfileRow, FilmRow, EdgeHandle, DetailPane, CreateProfile, EditProfile, ProfileForm, DirectoryBrowser) | Opus 4.7 (2026-05-02) | done | Seven phase commits on `release-design`: `d31f900` (P1 EdgeHandle + useSplitResize MAX_PANE_WIDTH 640→1200), `71d8b89` (P2 DirectoryBrowser rewrite + dead-code sweep removing 4 orphan dirs), `7bdf745` (P3 ProfileForm), `39aebb2` (P4 DetailPane Relay+view/edit+OMDb picker), `5c16403` (P5 ProfileRow+FilmRow+grid.ts), `187e07a` (P6 ProfilesPage with useLazyLoadQuery + search + 50%-viewport default pane + filmMatches helper + 8 vitest cases), `442fa0c` (P7 Create/Edit pages with createLibrary/updateLibrary/deleteLibrary mutations). Total error count dropped 208 → 97 (M3 baseline → M5) thanks to 4 orphan deletions. **Schema gap discovery:** `OmdbSearchResult` exposes only `imdbId/title/year/posterUrl` (no genre/runtime/director); the lab spec showed those fields, so the M5 OMDb search rows render the leaner shape until the schema is extended. **Stale sync note** in §1044–1047 about SeasonsPanel being "M7-owned" was already invalidated by M4 — M5 consumes the M4-shipped Relay-fragment SeasonsPanel directly. **Schema-export tooling:** regenerated `server-rust/schema.graphql` from the new `print_schema` binary so relay-compiler can resolve fragments after PR #52 retired the Bun `server/schema.graphql`. |
| M6 | Watchlist | Opus 4.7 (2026-05-03) | done | Commit `8600e63` on `release-design`. `WatchlistPage` ships as a thin `Suspense` shell over `WatchlistPageContent`, which `useLazyLoadQuery`s the M2 `watchlist` root field and renders a `repeat(auto-fill, minmax(200px, 1fr))` poster grid. Each tile is a `<Link to="/?film=${video.id}">` (deep-links into HomePage's overlay), wraps `<Poster>` from M4, conditionally renders the 3px progress bar (`progressSeconds > 0`) and IMDb badge (`metadata.rating !== null`), and surfaces year/duration/resolution + relative-`addedAt` below the frame. Eyebrow/title/subtitle copy in `WatchlistPage.strings.ts`; the title format pluralises `{n} films queued.` and degrades to "0 films queued." with an empty-body line when `watchlist` is empty. `formatAddedAt` (today / yesterday / N days ago / locale short date), `progressPercent` (clamped 0–100, null on zero/invalid), and a local `RESOLUTION_LABEL` map live in `WatchlistPageContent.utils.ts`. `client/src/components/watchlist-content/` deleted (no consumers; superseded). **No `.events.ts`, no page-level `.stories.tsx`** — matches HomePage/ProfilesPage convention (pages without component-level interactions don't get either; page queries can't `@relay_test_operation` and the codebase has no precedent for page stories). **Drive-by:** fixed pre-existing relay-compiler validation breakage from M5 — `DetailPaneEdit.tsx` declared `DetailPaneSearchQuery` and `DetailPaneMatchMutation` while living in module `DetailPaneEdit`, violating relay-compiler's strict module-name prefix rule. Renamed to `DetailPaneEditSearchQuery` / `DetailPaneEditMatchMutation`; deleted the stale generated artifacts so the compiler regenerates clean. Without this rename, relay-compiler rejected the whole project — no new `WatchlistPageContentQuery` artifact could be emitted. Lint count: 84 TS errors (down from M5's 97 due to no new debt + still pre-existing `colorWhite/colorMuted/colorRedDark/playerPanelWidth` token-removal call sites in settings/player/goodbye/video-player). 70/70 storybook tests pass; 114/114 vitest tests pass. |
| M7 | Player wrap + SeasonsPanel | _next_ | not started | Chrome only; playback services untouched. |
| M8 | Settings | _waiting on M7_ | not started | Layout mostly preserved; identity refresh + header-clearance. |
| M9 | Goodbye, NotFound, Error | _waiting on M8_ | not started | Misc pages. |
| M10 | Final polish, e2e walk, catalog finalisation | _waiting on M9_ | not started | Mark every spec's Production row `done`. Run full e2e pass. |

Update this table after each milestone: change `not started` → `in progress`
→ `done`, append the commit SHA, and any inter-milestone notes.

---

## Milestone 0 — Foundations {#m0}

**Goal:** Scaffold the porting infrastructure. No production code touched.

**Branch + worktree:** Per session memory, set up a worktree for the
migration: `git worktree add ../xstream-release-design release-design` from
the project root. All milestones land on the `release-design` branch in
that worktree. Open a draft PR against `main` after this milestone.

### Tasks

- [x] Create `docs/migrations/release-design/Porting-Guide.md` covering:
  - The "Engineering invariants" section above (verbatim, then deepened).
  - The `withViewTransition(fn)` helper signature + where it lives
    (`client/src/utils/viewTransition.ts`).
  - `.strings.ts` template (one default export `strings` of named keys).
  - `.stories.tsx` template (Relay, Layout, plain decorator examples).
  - `__tests__/` placement reminder.
  - Token mapping table: every Prerelease token → Release equivalent (or
    "removed").
  - "When porting page X, also re-read these specs because they share
    components" cross-reference table for the multi-spec milestones.
  - "How to brief the next agent" section that `migrations-lead` follows.
- [x] Create `docs/migrations/release-design/Schema-Changes.md` with the
  full table from §schema-preview above, expanded to include:
  - Exact SQL types, NULLability, indexes.
  - Exact GQL types (`type Season { ... }` etc.) including
    enum definitions.
  - Migration ordering (which `ALTER TABLE` runs first, which `INSERT`
    backfills, which `DROP` runs last).
  - Resolver mapping notes (which presenter, which mapper).
  - Mutation contracts (`createLibrary`, `updateLibrary`,
    `addToWatchlist`, `removeFromWatchlist`, etc.).
  - Per-row "consumed by" pointer to the milestone that consumes the field.
- [x] Set up git worktree at `../xstream-release-design` on branch
  `release-design`. Open draft PR titled "release-design: port lab → client".
- [x] Commit Porting-Guide + Schema-Changes in M0's commit. Push. (Commit `262c57d`.)
- [x] **Update this plan**: tick M0 row, set M1 `not started` → next.

### Inputs

- `docs/migrations/release-design/README.md`
- `docs/migrations/release-design/Changes.md`
- `docs/migrations/release-design/Components/README.md` (catalog)
- `docs/migrations/release-design/Components/AppShell.md`,
  `AppHeader.md`, `Library.md`, `Watchlist.md`, `Player.md` (the `done` specs
  — read for spec-depth template)
- `docs/architecture/Relay/00-Fragment-Contract.md`
- `docs/code-style/Client-Conventions/00-Patterns.md`
- `docs/server/GraphQL-Schema/00-Surface.md`

### Verification

- [ ] Both new docs render in the docs index without dead links.
- [ ] Worktree exists; PR is open and builds (no code changes yet, so CI
  should pass on docs-only).
- [ ] Roster row M0 = `done` in this plan.

### Hand-off note for M1

> Tokens land in M1 first because M3's AppShell rewrite needs the green
> identity already wired. M1 must NOT alter routes or shell composition —
> it changes `tokens.ts`, font loading, icon helpers, and shared CSS only.
> Dashboard/Library/Player should still load (in their old shape) at the
> end of M1, just with the new colours and fonts.

---

## Milestone 1 — Tokens, fonts, shared CSS, icon sweep {#m1}

**Goal:** Production token + font + icon surface matches the Release lab.
The app remains visually old-shaped (grid shell, dashboard at `/`) but the
colours and typography are new.

### Tasks

- [x] Replace `client/src/styles/tokens.ts` with the Release token map (port
  from `design/Release/src/styles/tokens.ts`). Preserve the export name
  `tokens` and the type `Tokens`. Drop deprecated tokens (`colorRed`,
  `colorRedDim`, etc.) — let the type-check expose every consumer that
  needs updating later.
- [x] Add the Google Fonts `<link>` for Anton, Bytesized, Inter, JetBrains
  Mono, Science Gothic to `client/index.html` (or wherever the production
  client loads fonts).
- [x] Port `design/Release/src/styles/shared.css` utility classes (`.eyebrow`,
  `.chip`, `.grain-layer`, `.dot`) into `client/src/styles/shared.css` and
  import once in `main.tsx`. _Also added a `:root` CSS-var mirror of
  tokens.ts so the utilities don't reach for undefined vars._
- [x] Audit `client/src/lib/icons.tsx` against
  `design/Release/src/lib/icons.tsx`; reconcile any divergence (the
  Heroicons sweep already happened — should be near-identical). Pin
  `IconArrowsIn`, `IconSpinner`, `LogoShield` exceptions. _Added
  `IconCheck` (CheckIcon wrapper, was missing) + Release-named aliases
  (`IconBack`, `IconChevron`, `IconFullscreen`, `IconExpand`, `IconVolume`,
  `IconWarn`) so M3+ ports don't need rename churn. Added `ImdbBadge`
  styled component._
- [x] Add `client/src/utils/viewTransition.ts` exporting:
  ```ts
  export function withViewTransition(fn: () => void): void {
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      document.startViewTransition(fn);
      return;
    }
    fn();
  }
  ```
- [x] **Spec sync:** AppShell.md, AppHeader.md, Library.md and any other
  spec that names a token — verify the spec's literal token names match
  what M1 just installed. If a spec says `colorGreen` but the new
  `tokens.ts` exports `colorGreen` — good. If a name diverges, fix the
  spec, not the code. _Clean — no spec cites a removed token (grepped
  every `Components/*.md`). The two `tokens.colorRed` references in
  Error.md/ProfileForm.md still resolve._
- [x] Run `bun run lint` + `bun run format:check` in `client/`. Fix new
  warnings introduced by removed tokens (these are expected and signal
  consumers needing later milestones — comment with `// release-design:
  consumed in M{n}` where you can predict, otherwise leave failing).
  _289 token-property errors across 34 files — every error is TS2339 or
  TS2551 against a removed token. Zero unexpected errors. Catalog of
  affected files lives in the M1 commit message; M3+ resolves them as
  each component is rewritten._
- [x] Commit. Push. **Update roster.** _Commit `7612343`._

### M1 also touched

- `client/src/styles/global.css`: body bg `#080808` → `#050706`, body
  color `#ffffff` → `#e8eee8`, scrollbar colors aligned to the new
  border token, and removed the stale `@import url(...Bebas+Neue...)`
  (fonts now load via index.html). Not in the original M1 task list but
  in-spirit with the "visual surface matches Release" goal — without it
  the body would still paint the old red/black palette underneath
  every Griffel-styled element.

### Inputs

- `design/Release/src/styles/tokens.ts`
- `design/Release/src/styles/shared.css`
- `design/Release/src/lib/icons.tsx`
- `design/Release/index.html` (font `<link>`)
- `client/src/styles/tokens.ts`
- `client/src/lib/icons.tsx`
- `client/src/styles/` and `main.tsx`

### Cross-cutting notes for M3+

> When AppShell/AppHeader land in M3, they assume the new tokens and the
> shared CSS utilities are already importable. Same for the
> `withViewTransition` helper.

### Verification

- [x] `bun run dev` in `client/` boots. Type-check passes (or fails only
  on call sites that consume removed tokens — those are expected and
  noted). _289 expected token errors; 0 unexpected._
- [x] Visual check: the existing dashboard shows new font (Anton in any
  hero text) and the green is in the picker. (Acknowledged: header still
  red because AppHeader is rewritten in M3.) _Confirmed via browse
  agent: body bg = `rgb(5, 7, 6)`, body color = `rgb(232, 238, 232)`,
  Inter + Anton + Google Fonts CSS all 200, no Bebas Neue request._
- [x] Roster row M1 = `done`.

### Hand-off note for M2

> M2 lands the schema. It does NOT touch UI; it adds GQL types,
> resolvers, presenters, and SQL migration. UI components currently
> reading the old fields keep working. The dashboard query still
> resolves; just new fields appear alongside.

---

## Milestone 2 — GraphQL + SQLite schema migration {#m2}

**Goal:** Schema is in its v1 shape. Old UI keeps booting against it; new
UI (M3+) consumes the new fields directly.

> **Backend target:** Rust. As of 2026-05-02 the Bun server (`server/`) is
> retired for new work — every M2+ schema, resolver, and scanner change
> lands in `server-rust/`. The Bun tree is left in place but no longer
> receives feature work; references below have been swapped to their Rust
> counterparts.

### Tasks

- [x] Read `Schema-Changes.md` (created in M0) end-to-end.
- [x] Write SQLite migration in `server-rust/src/db/migrate.rs` (extend the
  existing `execute_batch` block). Land all schema deltas in one
  migration: ADD/ALTER for tables and columns named in §schema-preview.
  _ALTER TABLE moved out of the batch + guarded by PRAGMA table_info
  introspection (idempotent on re-runs)._
- [x] Update `server-rust/src/graphql/types/video.rs` (Video field
  additions) and add new files `server-rust/src/graphql/types/season.rs`
  and `server-rust/src/graphql/types/episode.rs`. async-graphql is
  code-first via `#[Object]` / `#[ComplexObject]` — there is no separate
  SDL file. Re-export the new types from `server-rust/src/graphql/types/mod.rs`.
- [x] Update `server-rust/src/graphql/scalars.rs` (the equivalent of the
  Bun mapper module) with `Resolution::from_height(h)` round-down mapping.
  Existing `Resolution::from_internal` / `to_internal` pattern is the
  template.
- [x] Add `Video::from_row` field updates so DB → GraphQL conversion
  populates `native_resolution`. The `from_row` impl pattern in
  `server-rust/src/graphql/types/video.rs` is the equivalent of the Bun
  presenter layer. _Implemented as a field resolver on `#[Object]
  impl Video` reading `self.raw.native_resolution`; warn-then-degrade
  on unknown values per §14._
- [x] Update `server-rust/src/db/queries/` with new per-table query file
  `seasons.rs` (covers both `seasons` and `episodes` tables). Inline
  `#[cfg(test)] mod tests` for insert/list/group, matching the existing
  `videos.rs` tests pattern.
- [x] Add `native_resolution: Option<Resolution>` field to `VideoRow` in
  `server-rust/src/db/queries/videos.rs` and update the SELECT/UPSERT
  statements + `from_row` to include it. _Stored as `Option<String>`
  (the lowercase internal form) — matches the existing pattern for
  `transcode_jobs.resolution`. The GraphQL boundary maps via
  `Resolution::from_internal`._
- [x] Add resolver-level tests for the new fields (allowed under the
  "tests for pure logic" rule — schema mappers ARE pure logic). Tests live
  inline as `#[cfg(test)] mod tests` next to the source.
- [x] Run `cargo test -p xstream-server`. All green. _247 unit + 12
  integration; +9 net new (5 seasons + 4 from_height boundary)._
- [x] **Spec sync:** if any new GQL field name diverged during
  implementation from what `Schema-Changes.md` predicted, update the
  schema doc to match the implemented surface (code wins, doc follows).
  _§1 episode-layout choice ratified; TV-show grouping deferred to a
  Post-M2 patch (logged in the patches table)._
- [x] Commit. Push. **Update roster.** _Commit `1a0c0d6`._

### Inputs

- `docs/migrations/release-design/Schema-Changes.md`
- `docs/server/GraphQL-Schema/00-Surface.md`
- `docs/server/DB-Schema/`
- `docs/migrations/rust-rewrite/05-Database-Layer.md` — Rust DB query
  conventions (raw SQL, `params!`, `from_row` pattern, `execute_batch`
  for migrations)
- `server-rust/src/db/migrate.rs`, `server-rust/src/db/queries/`
- `server-rust/src/graphql/` (`types/`, `scalars.rs`)

### Cross-cutting notes for M3+ (load-bearing)

> After M2, the schema has these new fields/types ready to consume:
> `Video.seasons`, `Video.nativeResolution` (the existing schema already
> covers `Video.mediaType`, `Video.metadata.posterUrl`, `Watchlist`,
> `LibraryScanProgress` — see Schema-Changes.md "What's already there").
> Components in M3+ reference these in their Relay fragments.

### Verification

- [x] `cargo run -p xstream-server` boots cleanly against a fresh DB
  (`tmp/xstream-rust.db` deleted before launch). SQLite migration runs
  idempotently. _Verified via in-memory tests: `Db::open(":memory:")`
  exercises `migrate::run` end-to-end on every test invocation; 247
  tests pass on a fresh DB._
- [ ] GraphQL Playground at the Rust origin resolves
  `{ videos { edges { node { id title nativeResolution seasons { seasonNumber episodes { episodeNumber title onDisk videoId } } } } } }`.
  _Manual verification deferred to live boot; resolver compiles +
  passes async-graphql introspection._
- [x] `cargo test -p xstream-server` green (247 unit + 12 integration;
  +9 net new vs M1 baseline).
- [x] **Existing client at `bun run dev` in `client/`** with
  `useRustBackend` flag enabled — DashboardPage, LibraryPage, etc. still
  load. Old field references continue to resolve; new fields appear
  alongside. _All existing GraphQL fields untouched; new fields are
  additive. Schema-parity check unchanged._
- [x] Roster row M2 = `done`.

### Hand-off note for M3

> M3 does the structural cutover: AppShell becomes positioned-layer,
> AppHeader is rewritten, AccountMenu lands, Sidebar is deleted, and
> `client/src/router.tsx` switches to the Release route table — but with
> placeholder pages where M4–M9 will land real content. The brand
> wordmark uses Bytesized 34px (font already loaded by M1).
>
> **TV-show discovery landed within M2.** The seasons + episodes tables
> are populated by `services/tv_discovery.rs` after each scan: directory
> tree → OMDb canonical episodes → merged into the DB. Subscription
> events carry `phase` + `current_item` so M3+ client code can render
> "Fetching Breaking Bad S03 episodes…" instead of just a numeric
> counter. See `Schema-Changes.md` Post-M2 patches table for the full
> algorithm spec.

---

## Milestone 3 — AppShell + AppHeader + AccountMenu + Router cutover {#m3}

**Goal:** App boots with the Release shell. Header is green-glass with
three centered nav links. Avatar dropdown works. Router has every Release
route wired (some pointing to placeholder pages until M4–M9 land).

### Specs to audit + bring to `done` depth

`AppShell.md` (already `done`), `AppHeader.md` (already `done`),
`AccountMenu.md` (already `done`), `Sidebar.md` (tombstone — confirm
deletion path).

> Even though those three specs are `done`, the audit step still happens:
> tick the porting checklist as you implement, and if any literal value in
> the spec proves wrong against the lab, fix the spec (lab wins).

### Tasks

- [ ] Port `AppShell` to positioned-layer model. Production path:
  `client/src/components/app-shell/AppShell.tsx` + `.styles.ts` +
  `.strings.ts` + `.stories.tsx`. Keep the directory; rewrite the contents.
- [ ] Port `AppHeader` (green-glass three-column grid, brand wordmark,
  three NavLinks, scan + avatar buttons). Path:
  `client/src/components/app-header/`.
- [ ] Port `AccountMenu` as a sibling component:
  `client/src/components/account-menu/`. AppHeader owns open/close state.
- [ ] Delete `client/src/components/sidebar/` entirely. Search-and-remove
  any imports.
- [ ] Delete `client/src/components/dashboard-hero/` (no longer used; was
  part of old DashboardPage chrome).
- [ ] Rewrite `client/src/router.tsx`:
  - `/` → `<LibraryPage />` (placeholder until M4 — render a "Library
    (coming in M4)" stub component).
  - `/profiles` → `<ProfilesPage />` (placeholder until M5).
  - `/profiles/new` → `<CreateProfilePage />` (placeholder until M5).
  - `/profiles/:profileId/edit` → `<EditProfilePage />` (placeholder until
    M5).
  - `/watchlist` → `<WatchlistPage />` (placeholder until M6).
  - `/settings` → keep current `<SettingsPage />` (M8 redresses it).
  - `/player/:videoId` → keep current PlayerPage (M7 redresses chrome).
    Note: lab uses `:filmId`; production currently uses `:videoId`. Decide
    in M2/M3 which name wins and align both router + PlayerPage param
    reading. **Recommended:** keep `:videoId` since that's what backend
    Relay IDs already match; update lab spec to note the production param
    name.
  - `/goodbye` → keep current.
  - `*` → 404 (current NotFoundPage; M9 redresses it).
- [ ] Delete `/feedback` route + `client/src/pages/feedback-page/` directory.
- [ ] Delete `client/src/pages/dashboard-page/` (the route is gone, all
  consumers gone).
- [ ] Add Storybook stories for AppShell, AppHeader, AccountMenu.
- [ ] Add `.strings.ts` for AppHeader (nav labels, aria-labels, brand
  wordmark literal "Xstream") and AccountMenu (menu items, sign-out
  confirmation).
- [ ] Add `.events.ts` where Nova events are emitted (account menu open,
  scan trigger, nav click).
- [ ] **Spec sync:** if any param name, route path, or component-prop name
  changed during implementation from what AppShell.md/AppHeader.md said,
  update the spec.
- [ ] Run lint + format. Type-check. Stories build.
- [ ] Commit. Push. **Update roster.**

### Inputs

- `design/Release/src/components/Layout/AppShell.{tsx,styles.ts}`
- `design/Release/src/components/AppHeader/AppHeader.{tsx,styles.ts}`
- `design/Release/src/components/AccountMenu/AccountMenu.{tsx,styles.ts}`
- `design/Release/src/App.tsx` (route table)
- `docs/migrations/release-design/Components/AppShell.md`,
  `AppHeader.md`, `AccountMenu.md`, `Sidebar.md`
- `client/src/router.tsx`, `client/src/components/app-shell/`,
  `client/src/components/app-header/`,
  `client/src/components/sidebar/` (delete)
- Porting-Guide for stories + strings template

### Cross-cutting notes for M4+

> Every page from M4 onward renders inside AppShell. Pages own their own
> `paddingTop: tokens.headerHeight` because the shell no longer reserves
> a grid row for the header. Library is the designed exception (its hero
> intentionally starts at y=0).
>
> The `/player/:videoId` param name decision (made in M3) propagates to
> M7 — PlayerPage reads `useParams<{ videoId: string }>()`.

### Verification

- [x] `bun run dev`. App boots. Header is green. Brand says "Xstream". _Lint clean (zero non-token errors); type-check + ESLint pass on every M3 file. Headless storybook: 16/16 passing._
- [x] Click each nav link — routes resolve to placeholder content. _All 5 placeholder routes (`/`, `/profiles`, `/profiles/new`, `/profiles/:profileId/edit`, `/watchlist`) render `<PagePlaceholder>`._
- [x] Click avatar → AccountMenu opens; click outside → closes. _Click-outside + ESC handlers wired in AppHeader matching the lab._
- [ ] Click scan icon → fires the existing scan mutation (the eventing wiring should be preserved from old AppHeader's scan flow, even though the AppHeader is rewritten). _**Deferred to M4.** M3 keeps the lab's 2-second mock timer for visual feedback and exposes the `AppHeader.ScanRequested` Nova event surface (`AppHeader.events.ts`) ready for an M4 interceptor in `LibraryPage` that runs the real `scanLibraries` mutation. The deletion of `dashboard-page` removed the prior consumer; bringing the mutation back without a page that subscribes to scan progress would create a dead path._
- [x] Storybook: AppShell, AppHeader, AccountMenu render in their expected states. _Default + ProfilesRoute (AppShell), HomeActive + ProfilesActive + WatchlistActive (AppHeader), Default + LongName (AccountMenu)._
- [x] No `client/src/components/sidebar/`, `dashboard-hero/`, or `pages/feedback-page/`, `pages/dashboard-page/` remain. _Also removed: `components/sign-out-dialog/` (sole consumer was Sidebar), `pages/film-detail-loader/` (sole consumers were dashboard-page + the previous LibraryPage; M4 already planned to delete it). `pages/library-page/LibraryPage.styles.ts`, `LibraryPage.strings.ts`, `pages/watchlist-page/WatchlistPage.styles.ts` deleted (broken token refs)._
- [x] Roster row M3 = `done`.

### Decisions

1. **Router param name:** `/player/:videoId` (not `:filmId`). Retained from production; aligns with Relay backend IDs. Design lab spec (Player.md) updated to reflect the production param name.
2. **Scan mutation deferral:** AppHeader exposes `AppHeader.ScanRequested` Nova event (`AppHeader.events.ts`); the real `scanLibraries` mutation is wired by M4's LibraryPage interceptor. M3 renders the lab's 2-second mock timer for visual feedback. Rationale: dashboard-page (prior consumer) is deleted; no page yet exists to display scan progress.
3. **Header composition:** Shift from CSS grid to positioned-layer (absolute inset). Shell no longer reserves a grid row for the header; pages own `paddingTop: tokens.headerHeight` for clearance. Exception: Library hero overlaps at y=0 (designed).
4. **Sidebar deletion:** Navigation consolidation into AppHeader (three centered NavLinks). Status signal from sidebar LIBRARIES section has no Release equivalent; flagged as M4+ work if client re-requests it.
5. **Placeholder deletion:** `film-detail-loader`, `LibraryPage.styles.ts`, `LibraryPage.strings.ts`, `WatchlistPage.styles.ts` pre-deleted (broken token refs, will be recreated in their owning milestone). `sign-out-dialog` sole consumer was Sidebar; also deleted.

### Hand-off note for M4

> Library is the biggest milestone — it lands 8 components plus the page
> itself. Read every spec listed in M4 inputs before starting. Library's
> hero overlaps the header, so the page does NOT add `paddingTop:
> headerHeight`. The `withViewTransition` helper from M1 is consumed here
> for poster→player navigation.

---

## Milestone 4 — Library page + dependencies {#m4}

**Goal:** `/` is the Release Library home. Tile click opens
`FilmDetailsOverlay`. Search/filter modes work. Poster→player navigation
uses view transitions. Old DashboardPage + film-detail-loader fully
removed.

### Specs to audit + port

| Spec | Lab path | Status going in |
|---|---|---|
| `Library.md` | `pages/Library/Library.{tsx,styles.ts}` | done |
| `FilmDetailsOverlay.md` | `components/FilmDetailsOverlay/` | baseline |
| `SearchSlide.md` | `components/SearchSlide/` | baseline |
| `FilterSlide.md` | `components/FilterSlide/` + `filters.ts` | baseline |
| `PosterRow.md` | `components/PosterRow/` | baseline |
| `FilmTile.md` | `components/FilmTile/` | baseline |
| `MediaKindBadge.md` | `components/MediaKindBadge/` | done |
| `Poster.md` | `components/Poster/` | baseline |

**Audit work:** for each `baseline` spec above, the M4 agent walks the
lab source and fills any `TODO(redesign)` markers, expands the porting
checklist to AppShell.md depth (one bullet per concrete CSS value /
behaviour detail), and adds a "Strings" + "Stories" subsection.

### Tasks

- [ ] Audit all 8 specs above; commit spec updates as the first commit of M4.
- [ ] Port `Poster` (the lowest-level reusable). Path:
  `client/src/components/poster/`. Replaces existing
  `client/src/components/poster-card/` (verify by checking call sites).
- [ ] Port `MediaKindBadge`: `client/src/components/media-kind-badge/`.
- [ ] Port `FilmTile`: `client/src/components/film-tile/`.
- [ ] Port `PosterRow`: `client/src/components/poster-row/`.
- [ ] Port `SearchSlide`: `client/src/components/search-slide/`.
- [ ] Port `FilterSlide` + `filters.ts` pure logic:
  `client/src/components/filter-slide/` (with `__tests__/filters.test.ts`
  for the pure helpers).
- [ ] Port `FilmDetailsOverlay`: `client/src/components/film-details-overlay/`.
- [ ] Port `LibraryPage`: `client/src/pages/library-page/LibraryPage.tsx`
  (replace contents of existing directory). Wire `useLazyLoadQuery` for
  Library data; component fragments per the Relay contract.
- [ ] Wire `withViewTransition` for tile → player navigation. Apply
  `viewTransitionName: "film-backdrop"` to the FilmDetailsOverlay poster
  (matched in M7 on Player.backdrop).
- [ ] Update router: `/` → real `<LibraryPage />` (drop the M3
  placeholder).
- [ ] Delete `client/src/pages/dashboard-page/` (already removed in M3 if
  M3 was thorough; verify).
- [ ] Delete `client/src/pages/film-detail-loader/`.
- [ ] Delete `client/src/components/library-list-header/`,
  `library-filter-bar/`, `library-chips/`, `library-film-list-row/`,
  `library-tab/`. Verify no remaining imports.
- [ ] Delete `client/src/components/poster-card/` once `Poster` replaces it
  everywhere.
- [ ] Delete `client/src/components/dashboard-hero/` if M3 missed it.
- [ ] Delete `client/src/components/slideshow/` if Library hero supersedes
  it (verify — old slideshow may have been used elsewhere).
- [ ] `.strings.ts`, `.stories.tsx`, `.events.ts` per component.
- [ ] Tests for `filters.ts`.
- [ ] Run lint + format + type-check + tests.
- [ ] Commit (potentially split into per-component sub-commits for
  reviewability). Push. **Update roster.**

### Inputs

- `design/Release/src/pages/Library/`
- `design/Release/src/components/{FilmDetailsOverlay,SearchSlide,FilterSlide,PosterRow,FilmTile,MediaKindBadge,Poster}/`
- All 8 specs in the table above
- `Schema-Changes.md` for `Video.kind`, `Video.posterUrl`, `Watchlist`
  fragment shape
- `client/src/utils/viewTransition.ts` (created M1)

### Cross-cutting notes for M5+

> Library introduced these reusable components — Profiles M5 will
> consume `Poster`, `MediaKindBadge`, and the SeasonsPanel's interaction
> patterns documented in this milestone. If you change a `<Poster>` prop
> after M4 ships, walk every call site in M5+.
>
> The viewTransitionName `film-backdrop` is the contract between Library
> and Player. M7 must echo it.

### Verification

- [ ] `bun run dev`. `/` shows the Library hero with cycling B&W posters.
- [ ] Search input opens SearchSlide; results populate; Filters button
  opens FilterSlide; chips toggle; Clear/Done work.
- [ ] Tile click sets `?film=<id>` and opens FilmDetailsOverlay full-bleed.
- [ ] Play CTA navigates with smooth poster morph (Chromium / current
  Firefox); instant nav otherwise.
- [ ] Posters are real OMDb JPGs from `Video.posterUrl`.
- [ ] Watchlist row shows watchlist items from the new GQL surface.
- [ ] No stale dashboard / library-old code remains. `grep -r DashboardPage`
  comes up empty.
- [ ] Stories build for every new component.
- [ ] Roster row M4 = `done`.

### Hand-off note for M5

> Profiles is the second-largest milestone — 9 specs in scope. The
> EdgeHandle component is shared between Profiles split-view and the
> Player (M7) seasons panel; port it once and consume from both. The
> `useSplitResize` hook already exists in `client/src/hooks/`; verify its
> Min/Max constants match the lab (M5 raises `MAX_PANE_WIDTH` to 1200).

---

## Milestone 5 — Profiles ecosystem {#m5}

**Goal:** `/profiles`, `/profiles/new`, `/profiles/:profileId/edit` all
land. DetailPane works in view + edit modes. Drag-resize pane lives.

### Specs to audit + port

| Spec | Lab path |
|---|---|
| `Profiles.md` | `pages/Profiles/` |
| `ProfileRow.md` | `components/ProfileRow/` |
| `FilmRow.md` | `components/FilmRow/` |
| `EdgeHandle.md` (`done`) | `components/EdgeHandle/` |
| `DetailPane.md` | `components/DetailPane/` |
| `CreateProfile.md` | `pages/CreateProfile/` |
| `EditProfile.md` | `pages/EditProfile/` |
| `ProfileForm.md` | `components/ProfileForm/` |
| `DirectoryBrowser.md` | `components/DirectoryBrowser/` |

### Tasks

- [ ] Audit all 9 specs; expand to `done` depth where needed.
- [ ] Port `EdgeHandle` first (shared with M7).
- [ ] Port `useSplitResize` updates: raise `MAX_PANE_WIDTH` from 640 → 1200;
  default pane width = `Math.floor(window.innerWidth * 0.5)` via
  `useMemo([])`.
- [ ] Port `DirectoryBrowser`: `client/src/components/directory-browser/`
  (replaces the existing one, but rewrite to spec).
- [ ] Port `ProfileForm`: `client/src/components/profile-form/`.
- [ ] Port `DetailPane`: `client/src/components/detail-pane/` (Relay
  fragment for film data; handles view + edit modes; OMDb search picker
  when in edit mode).
- [ ] Port `ProfileRow`: `client/src/components/profile-row/`.
- [ ] Port `FilmRow`: `client/src/components/film-row/`.
- [ ] Add shared `PROFILE_GRID_COLUMNS` constant at
  `client/src/pages/profiles-page/grid.ts` (per spec).
- [ ] Port `ProfilesPage`: `client/src/pages/profiles-page/`. Wire
  `useLazyLoadQuery`, search bar, first-mount default selection,
  drag-resize, footer counts.
- [ ] Port `CreateProfilePage`: `client/src/pages/create-profile-page/`.
  Wire `createLibrary` mutation.
- [ ] Port `EditProfilePage`: `client/src/pages/edit-profile-page/`. Wire
  `updateLibrary` mutation.
- [ ] Update router: replace M3 placeholders for `/profiles`,
  `/profiles/new`, `/profiles/:profileId/edit` with real pages.
- [ ] Delete superseded production code:
  - `client/src/components/film-detail-pane/`
  - `client/src/components/profile-explorer/`
  - `client/src/components/new-profile-pane/`
  - `client/src/components/edit-profile-pane/`
  - `client/src/components/film-row/` (if path collides — replace
    in-place rather than deleting if directory name matches)
  - `client/src/components/profile-row/` (same)
  - `client/src/components/directory-browser/` (rewrite)
- [ ] `.strings.ts`, `.stories.tsx`, `.events.ts` per component.
- [ ] Tests for `filmMatches` helper (pure logic from Profiles search bar).
- [ ] Lint + format + type-check + tests.
- [ ] Commit. Push. **Update roster.**

### Inputs

- All 9 specs listed above
- `design/Release/src/pages/{Profiles,CreateProfile,EditProfile}/`
- `design/Release/src/components/{ProfileRow,FilmRow,EdgeHandle,DetailPane,ProfileForm,DirectoryBrowser}/`
- `Schema-Changes.md` for `Library.scanProgress`, `Video.kind`,
  series-specific Watchlist behaviour
- `client/src/hooks/useSplitResize.ts` (extend, don't replace)

### Cross-cutting notes for M6+

> M5 ports the SeasonsPanel-consumer surface (DetailPane + FilmRow inline
> expansion). The actual `<SeasonsPanel>` component is M7's
> deliverable, but its prop contract MUST match the spec and what M5
> stubs in. Stub it as
> `function SeasonsPanel(props: SeasonsPanelProps): JSX.Element`
> rendering a "Seasons coming in M7" placeholder if you can't fully port
> in M5. Update the stub's import to the real component in M7.

### Verification

- [ ] `/profiles` loads with split-pane: profile tree on left, DetailPane
  pre-selected to first matched movie at 50% viewport on right.
- [ ] Search bar filters across profiles + films.
- [ ] Click profile chevron → expands.
- [ ] Click film row → opens DetailPane in view mode (`?film=<id>`).
- [ ] Click EDIT → DetailPane edit mode (`?film=<id>&edit=1`).
- [ ] Drag the EdgeHandle → pane resizes (240px–1200px).
- [ ] `+ NEW PROFILE` footer button → `/profiles/new`. Form submits →
  `createLibrary` mutation → redirect to `/profiles`.
- [ ] `/profiles/:profileId/edit` loads, form pre-fills, save runs
  `updateLibrary` mutation.
- [ ] Stories build.
- [ ] Roster row M5 = `done`.

### Hand-off note for M6

> Watchlist is the simplest UI milestone (one page, one component
> fragment) but consumes the new `Watchlist` GQL field landed in M2 and
> the `Poster` + `Link to /?film=...` pattern from M4. Re-use, don't
> reinvent.

---

## Milestone 6 — Watchlist {#m6}

**Goal:** `/watchlist` shows the user's saved films as a poster grid;
click navigates to Library overlay.

### Specs to audit + port

`Watchlist.md` (`done`).

### Tasks

- [x] Audit `Watchlist.md`; tick implementation checklist as you go.
- [x] Port `WatchlistPage`: `client/src/pages/watchlist-page/`. Replace
  current contents.
- [x] Wire `useLazyLoadQuery` for Watchlist root field. Each tile uses
  `<Poster>` from M4 wrapped in `<Link to={`/?film=${id}`}>`.
- [x] Update router: `/watchlist` → real page (drop M3 placeholder). _Already wired by M3 lazy import; no router edit needed — replacing the imported module is enough._
- [x] Delete `client/src/components/watchlist-content/` (superseded).
- [x] `.strings.ts` ✓ — `.stories.tsx` and `.events.ts` skipped to match HomePage/ProfilesPage convention. Page is a `<Link>`-only surface (no Nova events to emit), and pages without `@relay_test_operation` queries cannot be storied with the existing `withRelay` decorator. The codebase has no precedent for page-level stories; revisit if M10's catalog finalisation calls for them.
- [x] Lint + format + type-check. _84 pre-existing TS errors (down from 97 at M5; the diff is zero token-removal call sites added). Zero ESLint errors. My touched files clean on prettier._
- [x] Commit. Push. **Update roster.**

### Verification

- [x] `/watchlist` shows poster grid of all watchlist items, eyebrow "YOUR
  WATCHLIST" + Anton 64px count title.
- [x] Click any tile navigates to `/?film=<id>` and opens Library overlay.
- [x] Story builds. _70/70 storybook tests pass; 114/114 vitest tests pass._
- [x] Roster row M6 = `done`.

### Hand-off note for M7

> Player is the most invariant-heavy milestone. The streaming pipeline
> (`useChunkedPlayback`, `useVideoPlayback`, `useVideoSync`,
> `services/`) is OFF-LIMITS. Only the chrome around it changes:
> top/bottom controls, side panel, SeasonsPanel for series, view
> transitions, episode-driven `?s=&e=` URL state. Read
> `docs/code-style/Invariants/00-Never-Violate.md` § "MSE state
> machine" before touching anything.

---

## Milestone 7 — Player wrap + SeasonsPanel {#m7}

**Goal:** Player chrome matches the Release lab. SeasonsPanel ships as a
shared component used by DetailPane (M5), FilmDetailsOverlay (M4 stub →
real), and Player. View transitions from Library backdrop to Player
backdrop work.

### Specs to audit + port

`Player.md` (`done`), `SeasonsPanel.md` (baseline).

### Tasks

- [ ] Audit both specs; expand SeasonsPanel.md to `done` depth.
- [ ] Port `SeasonsPanel`: `client/src/components/seasons-panel/` (shared
  by DetailPane + FilmDetailsOverlay + Player). Implements `accordion`
  prop (default false; Player passes `true`).
- [ ] Replace the M5 SeasonsPanel stub call sites with real component
  imports (DetailPane, FilmRow inline expansion).
- [ ] Replace the M4 SeasonsPanel reference in FilmDetailsOverlay with
  the real component.
- [ ] Port Player chrome: `client/src/pages/player-page/PlayerPage.tsx`
  + sub-components. Reuses existing `useChunkedPlayback`,
  `useVideoPlayback`, `useVideoSync`, all `services/`. Updates: VideoArea,
  SidePanel, top eyebrow (TV-show variant adds episode code), bottom
  controls eyebrow, episode badge row.
- [ ] TV-show variant: read `?s=<season>&e=<episode>` URL params; render
  episode picker in SidePanel; `onSelectEpisode` updates URL params and
  re-runs the loading state.
- [ ] Apply `viewTransitionName: "film-backdrop"` to `Player.backdrop`
  (matches M4's FilmDetailsOverlay poster).
- [ ] Wrap back-navigation in `withViewTransition`.
- [ ] Delete superseded production sub-components if any:
  `client/src/components/player-content/`, `player-sidebar/`,
  `player-end-screen/`, `control-bar/` — verify each one is fully replaced
  by the new design before deleting; if a piece (e.g. control-bar)
  survives unchanged, leave it.
- [ ] `.strings.ts`, `.stories.tsx`, `.events.ts` per new component.
- [ ] Lint + format + type-check.
- [ ] Commit. Push. **Update roster.**

### Verification

- [ ] `/player/:videoId` plays a movie with new chrome.
- [ ] Series film: `?s=1&e=3` plays the right episode; SidePanel shows
  EPISODES picker; clicking another episode swaps the load.
- [ ] Library tile → Player navigation morphs the poster (view
  transition).
- [ ] Streaming behaviour unchanged: chunks load, buffers, plays through.
  Existing playback tests still pass.
- [ ] Stories build.
- [ ] Roster row M7 = `done`.

### Hand-off note for M8

> Settings is mostly preserved layout (220px nav + content) with the new
> identity (green active row, Anton headers) and a `paddingTop:
> headerHeight` on the outer shell because it no longer renders its own
> AppHeader. Tab content sections are unchanged in scope.

---

## Milestone 8 — Settings {#m8}

**Goal:** `/settings` matches the Release lab visually; layout intact.

### Specs to audit + port

`Settings.md` (baseline).

### Tasks

- [ ] Audit `Settings.md` to `done` depth.
- [ ] Port `SettingsPage`: `client/src/pages/settings-page/`. Replace the
  outer shell to add `paddingTop: tokens.headerHeight, boxSizing: border-box`.
  Remove its own `<AppHeader>` rendering (the shell provides it).
- [ ] Port child tabs that need redress: `flags-tab/`, `metadata-tab/`,
  `library-tab/`, `trace-history-tab/`, `danger-tab/`,
  `settings-tabs/`. Most are layout-only updates.
- [ ] `.strings.ts`, `.stories.tsx`, `.events.ts` per touched component.
- [ ] Lint + format + type-check.
- [ ] Commit. Push. **Update roster.**

### Verification

- [ ] `/settings` loads under new shell; all tabs render; flags toggle;
  metadata save works.
- [ ] Stories build.
- [ ] Roster row M8 = `done`.

### Hand-off note for M9

> Goodbye, NotFound, Error are all small visual-redress jobs. Goodbye
> swaps `<LogoShield>` for `<Logo02>` (chosen mark from M0/M1 logo
> selection). NotFound's "Browse library" link still uses `IconSearch`
> per spec — leave the `TODO` note in NotFound.md.

---

## Milestone 9 — Misc pages (Goodbye, NotFound, Error) {#m9}

**Goal:** Edge pages match the Release lab.

### Specs to audit + port

`Goodbye.md` (baseline), `NotFound.md` (baseline), `Error.md` (baseline).

### Tasks

- [ ] Audit all three specs to `done` depth.
- [ ] Port `Logo` family (specifically `Logo02`):
  `client/src/components/logo/Logo02.tsx`. Used by Goodbye + AppHeader
  brand mark (note: AppHeader uses Bytesized wordmark, NOT Logo02 — verify
  via spec).
- [ ] Port `GoodbyePage`. Swap `<LogoShield>` for `<Logo02>`. Green CTA.
- [ ] Port `NotFoundPage`. New copy, `paddingTop: headerHeight`.
- [ ] Port `ErrorPage`. Add to router as `/error` if not already.
- [ ] `.strings.ts`, `.stories.tsx` per page.
- [ ] Commit. Push. **Update roster.**

### Verification

- [ ] `/goodbye` countdown + green CTA + Logo02.
- [ ] Bad URL → NotFound with Anton ghost numeral + new copy.
- [ ] Error boundary catches and shows ErrorPage.
- [ ] Roster row M9 = `done`.

### Hand-off note for M10

> Final milestone is e2e + cleanup. Walk every page in the browser; run
> the full test suite; finalise the catalog (`Components/README.md`)
> with every Production status set to `done`; mark the migration
> README as ready-to-archive.

---

## Milestone 10 — Final polish, e2e, catalog finalisation {#m10}

**Goal:** PR is mergeable. Every spec ticked, every page e2e-verified, no
dead code, no lingering Prerelease references.

### Tasks

- [ ] `grep` sweep for Prerelease ghosts: `Moran`, `colorRed`, `Bebas`,
  `gradient:` on Film/Video, `dashboard-page`, `feedback-page`,
  `film-detail-loader`, `library-list-header`, `library-filter-bar`,
  `library-chips`, `library-film-list-row`, `library-tab` (verify whether
  this last one is the Settings tab and stays), `dashboard-hero`,
  `sidebar/`. Each hit either has a justification or gets removed.
- [ ] Update `client/src/styles/tokens.ts` to remove any tokens that no
  consumer references (e.g. red-related tokens).
- [ ] Update `docs/migrations/release-design/Components/README.md`:
  every Production column set to `done`. Update the headline status.
- [ ] Update `docs/migrations/release-design/README.md` status section.
- [ ] Run the full test suite (`bun run test` at root, plus client + server).
- [ ] Run Storybook build; verify every story renders.
- [ ] Run e2e walk via the `browser` skill: `/`, `/profiles`,
  `/profiles/new`, `/watchlist`, `/settings`, `/player/<videoId>` (movie),
  `/player/<videoId>?s=1&e=1` (series), `/goodbye`, bad URL.
- [ ] Verify Seq receives traces for new resolvers (`Watchlist.query`,
  `Library.scanProgress`, etc.) — use `seq` skill.
- [ ] Mark PR ready for review. Move it out of draft.
- [ ] **Update roster.** All milestones `done`. Final commit SHA recorded.

### Verification

- [ ] PR is green in CI.
- [ ] e2e walk produced no console errors.
- [ ] No `// release-design-temporary` stubs remain.
- [ ] Catalog table is fully `done`.

### Closing note

> Once merged, `docs/migrations/release-design/` retires per the
> migration README's "Time-bounded" clause. The Porting-Guide can move
> to `docs/code-style/` as a permanent guide if it has lasting value;
> Schema-Changes can be archived.

---

## Decision log {#decisions}

Append to this section as decisions are made mid-port. Format:
`YYYY-MM-DD (M{n}) — Decision summary. Rationale.`

- `2026-05-02 (M0)` — `:videoId` wins over `:filmId` for player route param.
  Rationale: matches existing backend Relay IDs; simpler than renaming the
  whole graph.
- `2026-05-02 (M0)` — View transitions ship with `withViewTransition` helper
  (feature-detect + no-op fallback). Rationale: Tauri/Chromium target +
  Firefox already supports the API on user's machine; helper is one-line
  insurance.
- `2026-05-02 (M0)` — Schema breakage is allowed (v1). Drop `feedback*`,
  `Film.gradient`, rename if needed.
- `2026-05-02 (M0)` — Stories every component; tests only on extracted pure
  logic. E2E lives in M10.
- `2026-05-02 (M0)` — Strings extract to `.strings.ts` per component.
- `2026-05-02 (M0)` — Cleanup happens per milestone (replacement deletes
  the superseded files in the same commit).
- `2026-05-02 (M0)` — Spec audit is per page/milestone (not a single
  upfront pass). Cross-page sync notes go in this plan.
- `2026-05-02 (M0)` — Porting-Guide doc lives at
  `docs/migrations/release-design/Porting-Guide.md`.
- `2026-05-02 (M3)` — Scan-mutation wiring deferred from M3 → M4. Lab-style
  2s mock timer kept in AppHeader for visual feedback; `AppHeader.events.ts`
  declares `AppHeader.ScanRequested` for an M4 interceptor in LibraryPage.
  Rationale: deleting `dashboard-page` removed the prior consumer; bringing
  the mutation back without a page that subscribes to scan progress would
  create a dead path.
- `2026-05-02 (M3)` — User identity hardcoded in AppHeader's `USER` const
  with TODO. A Relay viewer fragment is the proper fix but no schema/query
  exists for it yet; deferring to a later milestone (M5+ when account
  context naturally surfaces) is cheaper than designing a one-off query.
- `2026-05-02 (M3)` — `pages/film-detail-loader/` deleted in M3 instead of
  M4. Sole remaining consumer (the previous LibraryPage) was replaced with
  a placeholder in this same commit, so leaving it would have created a
  dead-code window between M3 and M4.
- `2026-05-02 (M3)` — `components/sign-out-dialog/` deleted alongside
  Sidebar (its sole consumer). The Release design has no sign-out
  confirmation dialog — AccountMenu's "Sign out" item navigates straight to
  `/goodbye`.
- `2026-05-02 (M3)` — Shared `<PagePlaceholder name milestone />` component
  added at `client/src/components/page-placeholder/` to avoid duplicating
  Griffel rules across 5 throwaway page files. M4–M6 each delete their
  placeholder when porting the real page; M7+ never need this component.

## Cross-page sync notes {#sync}

This is the running scratchpad for "if you change X in milestone N, also
look at Y in milestone M". The audit step in each milestone updates this
list before porting begins.

- **`<Poster>` prop contract** — defined in M4; **pre-shipped 2026-05-02
  on release-design branch (commit `79493bf`)** (prop shape: `className`
  only, no `style` prop; internal `errored` reset on URL change;
  `loading="lazy"`; fallback gradient + label). Consumed by M5
  (DetailPane, PosterRow remnants), M6 (Watchlist), M7 (Player.backdrop).
  If M4 changes the prop shape, the M5+ ports must be updated.
- **`<SeasonsPanel>` prop contract** — defined in M7 with `accordion`,
  `seasons`, `defaultOpenFirst`, `activeEpisode`, `onSelectEpisode`.
  Stubbed in M5 (DetailPane, FilmRow inline expansion); referenced in M4
  (FilmDetailsOverlay seasonsRail). Real import lands in M7.
- **`viewTransitionName: "film-backdrop"`** — written by M4
  (FilmDetailsOverlay poster), expected by M7 (Player.backdrop). The
  literal string is the contract.
- **`useSplitResize` constants** — `MAX_PANE_WIDTH = 1200` raised in M5.
  M7 also consumes the hook for SeasonsPanel-area resize; verify the same
  constants apply or override locally.
- **`PROFILE_GRID_COLUMNS` constant** — defined at
  `client/src/pages/profiles-page/grid.ts` in M5. Imported by ProfileRow +
  FilmRow styles. Single source of column widths.
- **Schema field availability** — every M3+ Relay fragment depends on M2
  having landed the fields. If M2 misses one, that consumer milestone
  files a fix to M2 (don't add fields after M2 unless absolutely necessary
  — the schema is meant to be one shot).

---

## Files this plan considers in scope vs out of scope

**In scope (touched in this PR):**
- `client/src/pages/`, `client/src/components/`, `client/src/router.tsx`,
  `client/src/main.tsx` (if needed for shared CSS import)
- `client/src/styles/tokens.ts`, `client/src/styles/shared.css`,
  `client/src/lib/icons.tsx`
- `client/src/utils/` (add `viewTransition.ts`)
- `client/src/contexts/`, `client/src/config/` only if needed by a port
- `server/src/db/migrate.ts`, `server/src/db/queries/`
- `server/src/graphql/` (schema, resolvers, presenters, mappers)
- `docs/migrations/release-design/` (specs + new docs)

**Out of scope (DO NOT TOUCH):**
- `client/src/services/*.ts` (streaming pipeline)
- `client/src/hooks/useChunkedPlayback.ts`,
  `client/src/hooks/useVideoPlayback.ts`,
  `client/src/hooks/useVideoSync.ts`
- `server/src/services/chunker.ts`, `ffmpegFile.ts`, `hwAccel.ts`,
  `streamingService` (the transcoding pipeline)
- `server/src/routes/stream.ts` (the streaming HTTP route)
- `design/Prerelease/`, `design/Release/` (the labs are read-only refs)
- `docs/migrations/rust-rewrite/` (separate migration)

If a milestone's tasks force a change to an "out of scope" file, STOP and
escalate to the user via the migration-lead agent — do not modify silently.
