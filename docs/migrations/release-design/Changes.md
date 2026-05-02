# Prerelease → Release: What Changed

> A high-signal index of every meaningful design difference between
> `design/Prerelease/` and `design/Release/`. Per-component literal-level
> deltas live in the matching `Components/<Name>.md` files under a
> `## Changes from Prerelease` section added alongside this document.

## Update log

- **2026-05-02 (Rust-rewrite: resolution handling):** The Rust-port migration plan now formalises per-job resolution handling and native-resolution clamping. Captured in [`docs/migrations/rust-rewrite/06-File-Handling-Layer.md`](../rust-rewrite/06-File-Handling-Layer.md) §5 — includes the TV-show per-episode `native_resolution` column, GraphQL `Video.nativeResolution: Resolution` field, server-side clamp in `startTranscode`, and client picker bounded to `[240p … native]`. The Release design lab's TV-show support (SeasonsPanel + per-episode resolution badges) is the driver for this formalization. No code changes in this pass; the §5 section captures the proposal and Rust sketch code for implementation during Step 2 / Step 3.

- **2026-05-02 (icon library standardisation):** Both `design/Release/` lab and production `client/` standardised on `@heroicons/react@1.0.6` (Outline). Hand-rolled SVG icon libraries in both workspaces have been replaced with a thin wrapper over Heroicons. All existing icon call sites preserved (IconPlay, IconPause, etc.). **Lab files changed:** `package.json` (added dependency), `src/lib/icons.tsx` (full rewrite), `DetailPane.tsx`, `FilmRow.tsx`, `Player.tsx` (text glyphs replaced with icon components). **Client files changed:** `package.json`, `src/lib/icons.tsx` (full rewrite, ~30 exports). Design-system source of truth now: [Figma Admin System UI Kit (Community)](https://www.figma.com/design/zO44HkPod5kUESUofiCn8o/Admin-System-UI-Kit--Community-) "Heroicons Outline" frame. Three hand-rolled exceptions retained: `IconArrowsIn` (v1 has no equivalent — uses v2 path as fallback until major upgrade), `IconSpinner` (CSS animation), `LogoShield` (brand mark).

- **2026-05-02 (third pass):** Two TV-show affordance refinements landed in PR #49:
  1. **Episode picker shortcut:** Available episodes in DetailPane and FilmDetailsOverlay are now clickable; clicking one navigates straight to `/player/<id>?s&e` to launch playback directly, bypassing the intermediate player open.
  2. **Player side-panel accordion mode:** SeasonsPanel now accepts `accordion?: boolean` prop (default false, multi-open). When true, opening a season closes any previously-open season; closing the only open season leaves none open. Player side panel uses `accordion={true}` to prevent the narrow rail from becoming overwhelmed when browsing across seasons. DetailPane and FilmDetailsOverlay retain multi-open mode (default).
  
  Updated files: `SeasonsPanel.md` (added `accordion` prop + accordion toggle logic), `DetailPane.md` (noted `onSelectEpisode={playEpisode}` wiring in SEASONS & EPISODES), `FilmDetailsOverlay.md` (noted same wiring in seasonsRail), `Player.md` (noted `accordion={true}` in side-panel SeasonsPanel).

- **2026-05-02:** TV-show support added to the design lab and migration specs. See "TV Show Support — new in Release" section below for component changes and specs.

Sources of truth:
- Prerelease lab: `design/Prerelease/src/`
- Release lab: `design/Release/src/`
- Per-component specs: `docs/migrations/release-design/Components/`

---

## Cross-cutting (architectural)

### Routing and navigation surface

In Prerelease, `App.tsx` routed `/` to `<Dashboard>` (the Profiles/file-tree page), `/library` to the flat grid Library, `/settings`, `/feedback`. In Release, the routes are:

- `/` → `<Library>` (the home page is now the film catalogue)
- `/profiles` → `<Profiles>` (the file-tree page moves off-home)
- `/watchlist` → `<Watchlist>` (new — did not exist in Prerelease)
- `/settings` → unchanged path, but visual shell changed
- `/design-system` → new lab-only tool, not ported to production
- `/player/:filmId` → unchanged path
- `/goodbye` → unchanged path
- The `/feedback` route is removed entirely from Release.

Full routing diff lives in `design/Release/src/App.tsx`.

### Shell composition — grid vs. positioned-layer

In Prerelease, `AppShell` used a CSS grid:
- `gridTemplateRows: 52px 1fr`
- `gridTemplateColumns: 220px 1fr`
- `gridTemplateAreas: '"header header" "sidebar main"'`

The header occupied `gridArea: head`; the sidebar occupied `gridArea: side`; main content occupied `gridArea: main`. Every page rendered its own `<AppHeader>` + a `.main` div as direct children of the shell so they landed in the correct grid areas.

In Release, the shell is a positioned-layer model. No grid:
- `.shell`: `position: relative`, `width: 100vw`, `height: 100vh`, `overflow: hidden`
- `.main`: `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `bottom: 0`, `overflow: hidden`
- `<AppHeader>` is `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `height: 52px`, `zIndex: 10`

Because `<AppHeader>` and `<main>` share the same absolute inset, page content fills the full viewport from y=0. Each page is responsible for adding `paddingTop: tokens.headerHeight` (or a calc variant) to clear the header. The Library hero is the designed exception — it intentionally starts at y=0 so the glass-blurred header overlays the poster image.

Details: [`AppShell.md`](Components/AppShell.md), [`AppHeader.md`](Components/AppHeader.md).

### Sidebar — deleted

In Prerelease, `<Sidebar>` was a 220px collapsible left rail rendered by `AppShell`. It contained:
- A `NAVIGATION` section with icon-based nav links (Profiles, Library, Settings, Feedback)
- A `LIBRARIES` section with per-profile status dots and scan counts
- A user-row pinned to the bottom (30×30 gradient avatar + name + `hostMode` + chevron)
- A collapse toggle that animated the grid column from 220px to 52px

In Release, the Sidebar component and directory are deleted. Navigation moved to a centred three-link `<NavLink>` row in `<AppHeader>`. The avatar moved to the header right cluster at 34×34. The `LIBRARIES` status signal has no equivalent surface in Release — flagged as an open porting decision.

Tombstone: [`Sidebar.md`](Components/Sidebar.md).

### AppHeader — full rewrite

In Prerelease, the header was a `gridArea: head` strip that spanned the full two-column grid. It rendered a brand cell (matching the sidebar width, containing a shield SVG + "MORAN" in Bebas Neue) and a content slot used by pages to inject actions (scan button, "New Profile" button, search bar). Visual identity: red glass — `linear-gradient(160deg, rgba(235,45,60,0.30)…rgba(130,5,18,0.52))`, `backdropFilter: blur(28px) saturate(2.8) brightness(0.72)`, `borderBottom: 1px solid rgba(206,17,38,0.28)`.

In Release, the header is `position: absolute` over the page content. It is a three-column grid (`1fr auto 1fr`):
- Left: "Xstream" brand wordmark in **Bytesized** 34px — `X` in green with green-glow shadow, `stream` in `colorText`.
- Centre: three `<NavLink>` elements (Home `/`, Profiles `/profiles`, Watchlist `/watchlist`) in **Science Gothic** 12px, lowercase, with `::after` underline that scales in on active.
- Right: icon-only 38×38 scan button (`<IconRefresh>`) + 34×34 gradient-avatar button.

Visual identity: green glass — `linear-gradient(180deg, rgba(20,28,24,0.55)…rgba(8,11,10,0.78))`, `backdropFilter: blur(20px) saturate(1.6)`, `borderBottom: 1px solid rgba(37,48,42,0.45)`.

Details: [`AppHeader.md`](Components/AppHeader.md).

### Fonts

| Token | Prerelease | Release |
|---|---|---|
| `fontHead` | `'Bebas Neue', sans-serif` | `'Anton', sans-serif` |
| `fontBody` | `'Inter', sans-serif` | `'Inter', sans-serif` (unchanged) |
| `fontMono` | `'SF Mono', 'Fira Code', monospace` | `'JetBrains Mono', ui-monospace, monospace` |
| `fontDisplay` | (not present) | `'Bytesized', system-ui, sans-serif` — brand wordmark |
| `fontNav` | (not present) | `'Science Gothic', system-ui, sans-serif` — nav links |

Google Fonts `<link>` in Release `index.html` loads: Anton, Bytesized, Inter, JetBrains Mono, Science Gothic (not Bowlby One, not Jersey 25 — both were intermediate values during PR #46 development).

### Colour identity

| Aspect | Prerelease (Moran) | Release (Xstream) |
|---|---|---|
| Primary accent | `#CE1126` (crimson red) | `oklch(0.78 0.20 150)` (green) |
| Background 0 | `#080808` | `#050706` |
| Background 1 | `#0F0F0F` (`colorSurface`) | `#0a0d0c` (`colorBg1`) |
| Display font | Bebas Neue | Anton |
| Brand name | Moran | Xstream |

The Prerelease token file declares `colorRed: "#CE1126"` as the primary accent. Every active state, badge, CTA, progress bar, and glass treatment in Prerelease is red. In Release, `colorGreen: "oklch(0.78 0.20 150)"` fills the equivalent role. Every active state, badge, CTA, progress bar, glass treatment, and glow in Release is green.

### Mock data shape

In Prerelease, the `films` array holds 4 canonical entries rendered as mock poster gradients (no real images): Dune: Part Two, Parasite, Mad Max: Fury Road, and others, each with a `gradient: string` field for the colour placeholder.

In Release, the `films` array holds 13 entries. Poster images are real OMDb-fetched JPGs served from `/posters/<id>.jpg`. The `Film` interface drops `gradient` and adds `posterUrl: string | null`. Films added beyond the Prerelease four: Nosferatu, Barbie, Civil War, Furiosa, F1, Superman, Zack Snyder's Justice League, and three alternate-cut variants (Oppenheimer Director's Cut, Nosferatu B&W, Barbie IMAX, Civil War Theatrical). The `watchlist` array grows to 13 entries (wl-1 through wl-13); 12 carry a `progress` field.

A `newReleaseIds` curated array is new in Release: `["f1", "superman", "furiosa", "justiceleague", "madmax"]` — drives the "New releases" row on the Library home page.

### Visual language

Prerelease used contained, bordered surfaces: the shell was a grid of distinct areas; the Library was a flat grid of poster cards with a filter bar; hero sections used fixed-height, colour-gradient placeholder images.

Release uses a full-bleed, atmospheric visual language:
- **Library hero**: 75vh inset slideshow (grayscale posters, Ken Burns pan, cycling crossfade) overlaid with glass header — "poster behind glass" effect.
- **Overlay/details**: full-bleed `position: absolute` poster with Ken Burns, layered gradients, overlaid typography.
- **View transitions**: `document.startViewTransition` morphs the poster element (`viewTransitionName: "film-backdrop"`) between Library overlay and Player backdrop.
- **Grain layer**: shared `.grain-layer` utility used in Library hero, Player, Goodbye, NotFound — not present in Prerelease.
- **Green-glow shadows**: `colorGreenGlow: oklch(0.78 0.20 150 / 0.35)` used for tile hover, CTA hover, active nav links — Prerelease had no equivalent glow pattern.

---

## Per-page summary

### Library

**Was (Prerelease):** Secondary route `/library`. Flat grid of poster cards (`PosterCard`) with a filter bar (search input + profile chips + type select + grid/list toggle) across the top. Right-rail `<DetailPane>` slides in at 360px via `?film=<id>` URL state. Resize handle between content and pane. List view alternative.

**Is now (Release):** Primary home route `/`. Two URL-driven states: dash view and overlay view. Dash view: 75vh inset hero (B&W cycling posters, Ken Burns, 3D-tilted greeting, floating top-right ghost search) + three horizontal-scroll rows below the hero (Continue Watching, New Releases, Watchlist). Tile click sets `?film=<id>` → full-bleed `FilmDetailsOverlay` replaces the page. No filter bar. No list view. No resize handle.

Full spec: [`Library.md`](Components/Library.md).

### Profiles (was Dashboard)

**Was (Prerelease):** Primary home route `/` as `<Dashboard>`. Rendered `<AppHeader>` + `<Slideshow>` hero + profile/film directory tree with `?pane=film-detail&filmId=xxx` URL state (not `?film=`). Had a `NewProfilePane` form in the right rail.

**Is now (Release):** Secondary route `/profiles` as `<Profiles>`. Opens directly at the breadcrumb — there is no hero (a hero slideshow was added in commit e088fb5, then removed in commit 04ea22b; the page now opens at the breadcrumb). URL pane state simplified to `?film=<id>` (no `pane=` prefix). Core profile/film tree retained but slightly renamed internals. Shell now uses `paddingTop: tokens.headerHeight, boxSizing: border-box` instead of a grid row.

Full spec: [`Profiles.md`](Components/Profiles.md).

### Watchlist — new in Release

No Prerelease counterpart. Route `/watchlist`, mounted inside `<AppShell>`. Shows a page header (eyebrow "YOUR WATCHLIST" + Anton 64px count title) above a `repeat(auto-fill, minmax(200px, 1fr))` poster grid. Each tile is `<Link to="/?film={id}">` — clicking navigates to the Library home overlay for that film. All 13 watchlist entries are shown.

Full spec: [`Watchlist.md`](Components/Watchlist.md). Cross-reference: this document.

### Player

**Was (Prerelease):** Full-screen `/player/:filmId`, bypasses AppShell. Same 2-column grid (`1fr / 290px` collapsed to `1fr / 0px` when chrome hidden), same state machine (`idle → loading → playing`), same SidePanel structure. Back navigation used plain `navigate(-1)` inline lambdas. No view transitions.

**Is now (Release):** Functionally equivalent layout and state machine. Two changes:
1. The 2-column grid is expressed as two Griffel classes (`.shell` / `.shellChromeHidden`) rather than a dynamic inline `style` — Griffel-specific but no visual difference.
2. Back navigation (`navigate(-1)`) is now wrapped in `document.startViewTransition` at both callsites (VideoArea topbar + SidePanel footer) via a shared `goBackWithTransition()` helper.
3. `Player.backdrop` carries `viewTransitionName: "film-backdrop"` — must match `Library.overlayPoster` for the morph to work.
4. SidePanel "UP NEXT" source corrected to same-profile films (not watchlist). "FROM YOUR WATCHLIST" is a distinct second section in the panel body.

Full spec: [`Player.md`](Components/Player.md).

### Settings

**Was (Prerelease):** 220px left nav + 1fr right content, full-height grid. Rendered `<AppHeader>` as its own child (required by the Prerelease grid model). `?section=<id>` URL state. Six sections unchanged.

**Is now (Release):** Identical layout and section model, with one structural change: `paddingTop: tokens.headerHeight, boxSizing: border-box` added to the outer `.shell` so the page clears the now-absolute header. The page no longer renders its own `<AppHeader>` — the shell provides it.

Full spec: [`Settings.md`](Components/Settings.md).

### Sidebar — deleted

**Was (Prerelease):** 220px collapsible left rail in the AppShell grid. Owned NAVIGATION links, LIBRARIES status section, user-row avatar, collapse toggle, sign-out flow.

**Is now (Release):** Deleted. Tombstone spec preserved for porting reference.

Tombstone: [`Sidebar.md`](Components/Sidebar.md).

### Goodbye

**Was (Prerelease):** Full-screen `/goodbye`. Displayed `<LogoShield>` SVG (shield mark), "Moran" design language, red primary CTA button (`btnRed` class).

**Is now (Release):** Same page structure and countdown timer. Visual identity changed: `<Logo02>` (stacked X monogram) replaces `<LogoShield>`; CTA is green (`background: var(--green)`, `color: var(--green-ink)`) instead of red. "GOODBYE" ghost watermark retained. StrictMode countdown artefact is the same minor edge case.

Full spec: [`Goodbye.md`](Components/Goodbye.md).

### NotFound

**Was (Prerelease):** 404 inside AppShell (rendered `<AppHeader>` as its own child, then a `.main` container). Title `"Page not found"`, body `"The page you're looking for doesn't exist or has been moved."`.

**Is now (Release):** Still inside AppShell (header provided by shell). Page owns `paddingTop: tokens.headerHeight, boxSizing: border-box` for header clearance. Title changed to `"Nothing here."`. Body copy changed to `"The page you tried to reach has moved or never existed. Head back to the library to keep browsing."`. Ghost numeral changed from `code`-style `"404"` to a 32vw Anton atmospheric. The "Browse library" link points to `/` (Library home) but still carries `IconSearch` — noted as a TODO.

Full spec: [`NotFound.md`](Components/NotFound.md).

### DetailPane

**Was (Prerelease Dashboard/Library):** Inline component within both Dashboard and Library. Gradient-placeholder hero (200px, `film.gradient` background). Red resolution badge (`badgeRed`). "PLAY" CTA uses `<Link to="/player/:id">` styled as a red-filled button. Border colour `colorBorder` (`#222222`).

**Is now (Release):** Standalone component at `design/Release/src/components/DetailPane/`. OMDb poster image via `<Poster>` fills the 220px hero. Resolution chip uses `var(--green)` class. Border colour `var(--border)` (`#25302a`). Otherwise same structure: body scroll, plot, cast, file-info box, re-link button, close callback.

Full spec: [`DetailPane.md`](Components/DetailPane.md).

### Poster

**Was (Prerelease):** Not present as a standalone component. Poster images were simulated by CSS `gradient` strings on the `Film` interface (e.g. `linear-gradient(160deg, #0d1b2a, #1b2838)`).

**Is now (Release):** Dedicated `<Poster>` component with `<img>` + `onError` fallback to a gradient placeholder div. Callers supply geometry via `className` only (no `style` prop). Used by Library tiles, overlays, Player backdrop, DetailPane hero.

Full spec: [`Poster.md`](Components/Poster.md).

### Logo

**Was (Prerelease):** `<LogoShield>` — a shield-shaped SVG icon exported from `lib/icons.tsx`. Used in AppHeader brand cell and Goodbye page. Not a design-system sandbox.

**Is now (Release):** Seven candidate marks (`Logo01` through `Logo07`) in a dedicated `components/Logo/` directory. A `LogoCard` component frames each mark in a boxed card for review on the `/design-system` page. `Logo02` (stacked X monogram) is the current working default, used standalone in the Goodbye page. A logo is not yet chosen for production — selection workflow tracked in [`Logo.md`](Components/Logo.md).

Full spec: [`Logo.md`](Components/Logo.md).

### DesignSystem — new in Release

No Prerelease counterpart. Lab-only page at `/design-system`. Showcases color tokens, type scale, spacing scale, all 7 logo candidates, app-icon contexts, and the header lockup. Not ported to production.

Full spec: [`DesignSystem.md`](Components/DesignSystem.md). Cross-reference: this document.

---

## TV Show Support — new in Release (2026-05-02, PR #49)

No Prerelease counterpart. Release models TV series as a first-class concept alongside movies. The discriminator lives in the Film model: `kind: "movie" | "series"`. Accompanying `seasons: Season[]` array (only present for series) holds season and episode metadata.

### Data model

- `Film.kind` — discriminator: `"movie"` or `"series"`.
- `Film.seasons` — array of Season objects (only when `kind === "series"`).
  - `Season.seasonNumber` — 1-indexed.
  - `Season.episodes[]` — array of Episode objects.
    - `Episode.episodeNumber` — 1-indexed.
    - `Episode.title` — optional; placeholder if null.
    - `Episode.onDisk` — boolean; true if file exists.

### UI surfaces affected

- **FilmTile:** Kind badge (green TV icon, top-left corner) appears only on series tiles. Movies unchanged.
- **FilmRow:** Kind glyph (Film icon for movies, TV icon for series in green) next to title. Series rows show a chevron-expand button that toggles an inline `<SeasonsPanel>` below the row. Series metadata line shows `X/Y EPISODES` instead of duration. Movies unchanged.
- **DetailPane:** New "SEASONS & EPISODES" section below CAST for series films. Bordered card with header showing total episode count (green). Body contains `<SeasonsPanel defaultOpenFirst={true} />` so season 1 opens by default.
- **FilmDetailsOverlay:** Right-side glass `seasonsRail` for series (380px wide). Header shows total episode count. Body contains scrollable `<SeasonsPanel>`. Main content max-width reduces from 720px → 560px when rail is present to prevent title collision.
- **Player (NEW series variant):** URL contract `/player/:filmId?s=<season>&e=<episode>`. Top-right status eyebrow injects episode code (e.g. "● PLAYING · S01E03 · 4K · HDR10"). Bottom controls eyebrow changes from `[year, genre, duration]` to `[Season N, genre, episode duration]`. New episode badge row above the show title displays green-bordered episode code + episode title. Side panel header gains a `sideEpisodeRow` showing the current episode with green code chip + title. Side panel body replaces UP NEXT + WATCHLIST sections with EPISODES picker: `<SeasonsPanel seasons={...} activeEpisode={{...}} onSelectEpisode={selectEpisode} />`. Missing episodes are read-only; available episodes are clickable buttons. Episode selection updates URL params and re-runs the loading state.
- **Profiles footer:** Counts now include shows and episodes: `{shows} SHOWS ({episodes} EPS)` aggregated across all series.
- **ProfileForm:** New media-type segment hint explains parsing semantics: "Each video file is matched as a single film" (MOVIES) vs. "Files are grouped by show, then by season folder. Episode numbers are read from filenames (S01E03, 1x03, etc.)" (TV_SHOWS).

### New component: SeasonsPanel (extended in second 2026-05-02 pass)

Reusable accordion widget for season/episode browsing. Props: `seasons: Season[]`, `defaultOpenFirst?: boolean`, `activeEpisode?: { seasonNumber; episodeNumber }`, `onSelectEpisode?: (s, e) => void`. Season headers collapse/expand with progress indicators (green complete, yellow partial, grey missing). Episode rows show code (S01E03), title, duration, and on-disk dot (filled green or outlined grey). 

When `activeEpisode` and `onSelectEpisode` are provided (Player variant only):
- Available episodes render as `<button>` elements; missing episodes render as non-interactive `<div>`.
- The active episode row displays "● PLAYING" eyebrow + green left-rail styling + `aria-current="true"`.
- The season containing the active episode auto-expands on mount.
- Clicking an available episode calls `onSelectEpisode(seasonNumber, episodeNumber)`.

Used by FilmRow inline expansion, DetailPane series section, FilmDetailsOverlay seasons rail (read-only), and Player side panel (interactive) — single source of truth for consistency across all entry points.

Full spec: [`SeasonsPanel.md`](Components/SeasonsPanel.md).

---

## Discoverability

This file is linked from [`Components/README.md`](Components/README.md) (see the catalog header) and from the migration [`README.md`](README.md) under Links. It is the agent-facing entry point for understanding what is architecturally different between the two labs before opening any per-component spec.
