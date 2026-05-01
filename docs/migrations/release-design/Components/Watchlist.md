# Watchlist (page)

> Status: **done** (Spec) · **not started** (Production) · last design change **2026-05-01** (PR #46 commit 5301df6, audited 2026-05-01)

## Files

- `design/Release/src/pages/Watchlist/Watchlist.tsx`
- `design/Release/src/pages/Watchlist/Watchlist.styles.ts`
- Prerelease behavioural reference: n/a — no equivalent page in the Prerelease (Moran) prototype.

## Purpose

Dedicated page (`/watchlist`) listing all films queued for watching. Shows a title block with a count, then a responsive poster-tile grid. Each tile deep-links to the home/Library overlay for that film.

## Route

- Path: `/watchlist`
- Mounted inside `<AppShell>` (shelled layout, header visible).
- Added via `<Route path="/watchlist" element={<Watchlist />} />` inside the shelled `<App.tsx>` route block.

## Visual

### Outer container (`.page`)

- `height: 100%`, `overflowY: auto`, `backgroundColor: colorBg0`.
- **`paddingTop: calc(${tokens.headerHeight} + 60px)`**, `paddingBottom: 80px`, `paddingLeft: 60px`, `paddingRight: 60px`, `boxSizing: border-box`.
- The 60px gap below the header is the original spacing between the header strip and the page content, preserved now that the page owns its own clearance.

### Page header

- `display: flex`, `flexDirection: column`, `rowGap: 10px`, `marginBottom: 44px`.
- **Eyebrow:** `"YOUR WATCHLIST"` — JetBrains Mono, 12px, `letterSpacing: 0.22em`, uppercase, `color: colorGreen`.
- **Title:** `"{N} films queued."` — Anton (`fontHead`), 64px, `lineHeight: 0.95`, `letterSpacing: -0.02em`, `color: colorText`. `{N}` is the count of watchlist tiles.
- **Subtitle:** JetBrains Mono 12px / `letterSpacing: 0.06em` / `colorTextMuted`. Copy TBD — `TODO(redesign)`.

### Tile grid

- `display: grid`, `gridTemplateColumns: repeat(auto-fill, minmax(200px, 1fr))`, **`gap: 24px`**.
- Rendered below the page header.

### Tile

Each tile is a `<Link to="/?film={id}">` — clicking deep-links to the Library/home page with `?film=<id>` set, opening the FilmDetailsOverlay for that film.

- Flex column, `rowGap: 10px`. `transitionProperty: transform`, `:hover { transform: translateY(-3px) }`.
- **Tile frame (`tileFrame`):** `aspectRatio: 2/3`, `overflow: hidden`, 1px `solid colorBorder` on all sides, `backgroundColor: colorSurface`. `:hover` — all four border sides → `colorGreen` + `boxShadow: 0 8px 24px colorGreenSoft`.
- **Poster image:** fills the frame, `object-fit: cover`.
- **Progress bar (optional):** `position: absolute`, `left/right: 0`, `bottom: 0`, 3px tall. Track `rgba(0,0,0,0.55)`, fill `colorGreen`, `width: {progress}%`. Only rendered when `progress` is defined.
- **IMDb rating badge (`ratingBadge`):** `position: absolute`, `top: 8px`, `right: 8px`. `backgroundColor: rgba(0,0,0,0.7)`, `color: colorYellow`, Mono 10px, `padding: 3px 6px`, `borderRadius: 2px`, flex row with `columnGap: 4px` (star icon + rating string).
- **Below-poster meta (`tileMeta`):** flex column, `rowGap: 3px`.
  - **Title:** 13px / `colorText`.
  - **Subtitle:** Mono 10px / `letterSpacing: 0.06em` / `colorTextMuted` — year + genre or similar.
  - **"Added {addedAt}" (`tileAdded`):** Mono 10px / `letterSpacing: 0.04em` / `colorTextFaint`.

## Behaviour

### Tile click

- Each tile is a `<Link to="/?film={id}">`.
- Navigates to the Library/home page (`/`) with `?film=<id>` in the query string.
- The Library page reads `?film=<id>` on mount and opens the `FilmDetailsOverlay` for that film immediately.
- This is a page navigation (not a modal), so the browser's back button returns to `/watchlist`.

### Tile subtitle

Subtitle line renders `{item.year} · {item.duration} · {item.resolution}` — fields from `WatchlistItem`, not the `Film` object directly.

### Data source

- In the lab: iterates the full `watchlist` array from `mock.ts` — all **13 entries** (`wl-1` through `wl-13`). Each entry is resolved to its `Film` via `getFilmById(item.filmId)`; entries without a matching film are filtered. **All 13 items are shown, including those with `progress`** — the Watchlist page is a complete queue view. This is distinct from the Library "Watchlist" row which shows only items with `progress === undefined`.
- The subtitle text is resolved: `"Saved across sessions. Click a poster to play."`.
- Production: replace with a Relay query / backend watchlist relation that provides `filmId`, `addedAt`, and optionally `progress`.

## Subcomponents

None promoted — the tile is an inline element within the page. Promote to a separate file (`WatchlistTile`) when porting to production if the tile logic grows.

## Changes from Prerelease

No Prerelease counterpart — the Watchlist page is new in the Release redesign. The Prerelease lab had no `/watchlist` route and no watchlist surface in `App.tsx`.

Cross-reference: [`Changes.md`](../Changes.md) — "Watchlist" entry.

## TODO(redesign)

- Production: decide whether `progress` on a watchlist item means the film is in both "Continue watching" (on Library) and the Watchlist simultaneously, or whether a film transitions out of the Watchlist once it has any progress.

## Porting checklist (`client/src/pages/Watchlist/`)

### Outer container

- [ ] `paddingTop: calc(${tokens.headerHeight} + 60px)`, `paddingBottom: 80px`, `paddingLeft/Right: 60px`, `boxSizing: border-box` (page owns header clearance)

### Page header

- [ ] Eyebrow `"YOUR WATCHLIST"` in JetBrains Mono 12px / 0.22em / uppercase / `colorGreen`
- [ ] Title `"{N} films queued."` in Anton 64px, `lineHeight: 0.95`, `letterSpacing: -0.02em`
- [ ] Count `{N}` is derived from the number of watchlist items (backend query)
- [ ] Subtitle in JetBrains Mono 12px / `colorTextMuted` below title
- [ ] Header `display: flex; flex-direction: column; rowGap: 10px; marginBottom: 44px`

### Tile grid

- [ ] `repeat(auto-fill, minmax(200px, 1fr))` grid, `gap: 24px`

### Tile

- [ ] Each tile is a `<Link to="/?film={id}">` — navigates to Library overlay for that film
- [ ] Tile frame: 2:3 aspect ratio, 1px `solid colorBorder` all sides, `overflow: hidden`; `:hover` → green border + `boxShadow`
- [ ] Tile `translateY(-3px)` on hover
- [ ] Poster image fills frame, `object-fit: cover`
- [ ] Optional 3px progress bar: absolute bottom, track `rgba(0,0,0,0.55)`, fill `colorGreen` (only if `progress` defined)
- [ ] IMDb rating badge: absolute `top: 8px, right: 8px`, black-70 bg, `colorYellow` Mono 10px, `padding: 3px 6px`, `borderRadius: 2px`
- [ ] Below-poster: title 13px / `colorText` + subtitle Mono 10px / `colorTextMuted` + `tileAdded` Mono 10px / `colorTextFaint`
- [ ] `addedAt` formatted as a human-readable date/relative string

### Data + backend

- [ ] Data source is the full `watchlist` array (all 13 entries including those with `progress`) — NOT a filter of films-without-progress
- [ ] Subtitle copy: `"Saved across sessions. Click a poster to play."` (Mono 12px / `colorTextMuted`)
- [ ] Derive watchlist items from backend query (filmId, addedAt, optional progress)
- [ ] Replace mock derivation with Relay query
- [ ] Clarify overlap rule with Library "Continue watching" row when `progress` is present

## Status

- [x] Designed in `design/Release` lab (2026-05-01, PR #46 commit 787f136). Page gains `paddingTop: calc(headerHeight + 60px)` for positioned-shell header clearance; tile and badge specs pinned from source (2026-05-01, PR #46 commit 5301df6). Data derivation corrected: full `watchlist` array (not films-without-progress); subtitle copy resolved (2026-05-01, PR #46 audit). PR #46 on `feat/release-design-omdb-griffel`, not yet merged to main.
- [ ] Production implementation
