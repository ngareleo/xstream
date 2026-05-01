# Library (page)

> Status: **done** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 (latest in day) — Play CTA's inner `<IconPlay>` now renders with an **engraved** treatment (`& svg` rule: muted color + paired drop-shadows for a recessed-into-glass illusion). Earlier 2026-05-02 — `FilmDetailsOverlay` Play CTA restyled as a glass pill (Liquid Glass): translucent white bg, `border-radius: 999px`, backdrop blur, beveled borders, layered shadows. Replaces the solid-green 3px-radius styling. Matches Player big-play and DetailPane play buttons. Note: the shared `IconPlay` SVG path was corrected (centroid → 8,8) on the same date. Earlier 2026-05-01 (PR #46, commit 907c331) — hero changed to `75vh` with `borderRadius: 6px`; page is now **inset** (`.page` has `paddingLeft/Right: 40px`); `heroBody paddingLeft/Right: 44px`, `paddingBottom: 20px`; three rows (Continue Watching + New Releases + Watchlist); `rowsScroll` has `paddingTop: 20px` only (no left/right — page provides 40px inset); `searchGrid` uses `repeat(auto-fill, 200px)` columns; tile width is 200px. Prior update (73a9cca) hero height 300 → 420px; `.overlayPoster` gains `viewTransitionName: "film-backdrop"`; Play CTA changed from `<Link>` to `<button onClick={playWithTransition}>`. Prior update (6fd44e4) search bar moves inside hero (top-right, absolute), gradient strip replaces bordered card, custom pulsing green caret + mirror span, `caretColor: transparent`. Prior update (773681e) hero grows to 300px; heroBody paddingTop calc(headerHeight + 32px), paddingBottom 24, paddingLeft/Right 56, rowGap 20. Prior update (45d1097) hero shrinks to 280px; dots stack under greeting via rowGap. Prior update (5301df6) made hero full-bleed (no border/radius). Prior update (9cc6d48) added page padding + 340px bordered card. Prior update (787f136) added search bar. Prior update (04ea22b) replaced grid/filter/DetailPane with hero+rows+overlay.

## Files

- `design/Release/src/pages/Library/Library.tsx`
- `design/Release/src/pages/Library/Library.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/pages/Library/`

## Purpose

Landing page for the film catalogue (`/`). Two URL-driven states: **dash view** (hero + horizontal-scroll rows) and **overlay view** (full-bleed film-details overlay). A tile click sets `?film=<id>`; clearing it returns to the dash.

## URL state

Single param, read/write via `useSearchParams`:

- `?film=<id>` — overlay open, showing that film's details. Absent → dash view.

The search bar (see below) filters in-page via local state only — it does not write a URL param in the current lab iteration. The `?q=<query>` TODO below tracks the production wiring.

## Visual — dash view

### Page layout

`.page` is a flex column with `height: 100%`, `overflowX: hidden`, `overflowY: auto`, `backgroundColor: tokens.colorBg0`, **`paddingLeft: 40px`**, **`paddingRight: 40px`** (no `paddingTop`). The hero sits inside this padded container — it is **inset by 40px on each side**, not full-bleed. The floating glass header overlays y=0 across the full viewport, but the hero image itself starts 40px from each edge.

### Hero (`75vh` tall, inset, rounded)

The hero is `height: 75vh`, `position: relative`, `overflow: hidden`, **`borderRadius: 6px`**, `flexShrink: 0`. It is contained within the page's 40px horizontal padding. Because the header is `position: absolute` over the entire shell, the hero poster image is still partially visible behind the glass header — the "poster behind glass" effect applies across the 40px inset region.

- **Slide deck.** Four canonical poster images rendered simultaneously (`position: absolute, inset: 0`) inside `heroSlides`. Each carries `heroImg` (`opacity: 0`, `filter: grayscale(1) brightness(0.55)`, `transitionProperty: opacity`, `transitionDuration: 0.9s`, `transitionTimingFunction: ease`). Active slide gets `heroImgActive` (`opacity: 1`); when `heroFading` is true, the active slide also gets `heroImgFading` (`opacity: 0`) so the outgoing image fades while the incoming one fades in simultaneously.
- **Ken Burns.** Every `heroImg` has a looping animation: `scale(1.06) translate(-0.8%, -0.6%)` → `scale(1.06) translate(0.8%, 0.6%)` over 20s, ease-in-out, alternate, infinite. Applied via `animationName` keyframe in Griffel (0% → 100%).
- **Border radius.** The hero has `borderRadius: 6px`. The `overflow: hidden` clips poster to this rounded rectangle.
- **Edge-fade overlay (`heroEdgeFade`).** Two-gradient pattern: `linear-gradient(to bottom, rgba(5,7,6,0.55) 0%, transparent 28%, transparent 62%, rgba(5,7,6,0.78) 100%)` + `linear-gradient(to right, transparent 0%, transparent 80%, rgba(5,7,6,0.55) 100%)`. `backgroundSize: 100% 115%, 115% 100%`. Drift animation cycles `backgroundPosition` over 22s (ease-in-out, infinite): `0% 0%, 0% 0%` → `0% 100%, 100% 0%` → `0% 0%, 0% 0%`.
- **Bottom-fade overlay (`heroBottomFade`).** `position: absolute, inset: 0`, pointer-events none. Two-gradient: `linear-gradient(180deg, transparent 50%, rgba(5,7,6,0.8) 88%, colorBg0 100%)` + `linear-gradient(90deg, colorBg0 0%, rgba(5,7,6,0.85) 22%, transparent 55%)`.
- **Grain layer.** Shared `.grain-layer` utility class (`<div className="grain-layer" />`).
- **Hero body (`heroBody`).** `position: absolute`, `inset: 0`, **`paddingTop: calc(${tokens.headerHeight} + 32px)`** (84px at 52px header height), **`paddingBottom: 20px`**, **`paddingLeft: 44px`**, **`paddingRight: 44px`**, flex column with **`rowGap: 20px`** (no `justify-content: space-between`), `zIndex: 2`:
  - **Greeting eyebrow (`greetingEyebrow`).** `"· {greeting()}, {user.name.toUpperCase()}"` — `fontMono`, 12px, `letterSpacing: 0.18em`, `textTransform: uppercase`, `color: tokens.colorGreen`. Rendered above the greeting.
  - **Greeting text (`greeting`).** `"Tonight's library."` (two lines via `<br/>`). Anton (`fontHead`) 64px / `colorText` / `lineHeight: 0.92` / `letterSpacing: -0.02em` / **`marginTop: 28px`**. `display: inline-block`, `transformOrigin: center center`, `transformStyle: preserve-3d`, `willChange: transform`. **3D tilt on mouse.** `transitionProperty: transform`, `transitionDuration: 0.18s`, `transitionTimingFunction: ease-out`.
  - **Slide dots (`slideDots`).** `display: flex`, `columnGap: 8px`. 4 `<button type="button">` elements. Active (`slideDotActive`): `width: 26px`, `height: 3px`, `borderRadius: 2px`, `backgroundColor: colorGreen`. Inactive (`slideDotInactive`): `width: 8px`, same height and radius, `backgroundColor: colorTextFaint`. Both classes share `transitionProperty: width, background-color`, `transitionDuration: tokens.transitionSlow`. Each button: `aria-label={Show ${film.title ?? film.filename}}`.
- **Cycle timing:** `HERO_INTERVAL_MS` = 7 000ms, `HERO_FADE_MS` = 700ms.
- **Canonical poster order:** `["oppenheimer", "barbie", "nosferatu", "civilwar"]` (constant `HERO_FILM_IDS`). Falls back gracefully — any id not found in `films` is filtered out of the list.

### Greeting 3D tilt

The `.greeting` div handles `onMouseMove` and `onMouseLeave` on itself:
- `onMouseMove(e)`: `rect = e.currentTarget.getBoundingClientRect()`, `nx = (e.clientX - rect.left) / rect.width - 0.5`, `ny = (e.clientY - rect.top) / rect.height - 0.5`. Sets `greetingTilt({ rx: ny * 18, ry: -nx * 18 })`. Applied via inline `style.transform: perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`.
- `onMouseLeave()`: resets to `{ rx: 0, ry: 0 }`.
- **Sign convention (invariant):** `ry = -nx * 18` — negative because CSS `rotateY` positive rotates the right edge **back**, but cursor-on-right should bring the right edge **forward**. Flip the sign and the tilt reverses.
- The Griffel `.greeting` class supplies `transitionProperty: transform`, `transitionDuration: 0.18s`, `transitionTimingFunction: ease-out` for the snap-back animation.
- **Rotation magnitude:** ±9° in each axis (normalized offset ±0.5 × factor 18).

### Search bar (inside hero, top-right)

Rendered inside the hero block between `grain-layer` and `heroBody`. Contains: `<span searchIcon>`, `<div searchInputWrap>`, optional `<button searchClear>`. Present in the dash view only (the overlay replaces the whole page component). Position: **`position: absolute`, `top: calc(${tokens.headerHeight} + 24px)`, `right: 32px`, `zIndex: 3`, `width: 320px`** — opposite corner from the bottom-left greeting. `display: flex`, `alignItems: center`, `columnGap: 10px`, `paddingTop: 8px`, `paddingBottom: 8px`, `paddingLeft: 16px`, `paddingRight: 12px`.

- **Input container (`searchBar`):** no border, no border-radius, no solid background. Horizontal gradient strip: `backgroundImage: linear-gradient(90deg, rgba(20,28,24,0) 0%, rgba(20,28,24,0.42) 22%, rgba(20,28,24,0.42) 78%, rgba(20,28,24,0) 100%)`. `transitionProperty: background-image`, `transitionDuration: tokens.transition` (0.15s). Note: `background-image` transition is the spec value — browsers may not animate this, but the token reference is correct.
- **Focused state (`searchBarFocused`):** bumps gradient mid-stop alpha to 0.7. Applied via JS `searchFocused` state (set `onFocus`, cleared `onBlur` after 120ms `window.setTimeout` so clicks on the clear button register before blur).
- **Search icon (`searchIcon`):** `<IconSearch>` at `color: colorGreen`, `flexShrink: 0`.
- **Input wrap (`searchInputWrap`):** `position: relative`, `flexGrow: 1`, `display: flex`, `alignItems: center`, `minWidth: 0`, `height: 20px`. Houses the real input, the hidden mirror span, and the custom caret span.
- **Input (`searchInput`):** `caretColor: transparent` (hides the native browser caret). `width: 100%`, `backgroundColor: transparent`, no border, `outlineStyle: none`. `fontFamily: tokens.fontMono`, `fontSize: 12px`, `letterSpacing: 0.06em`, `color: tokens.colorText`. `paddingTop/Bottom: 0`, `paddingLeft: 0`, `paddingRight: 12px`. Placeholder: `color: colorTextMuted`, `letterSpacing: 0.14em`, `textTransform: uppercase`, `fontSize: 10px`. `spellCheck={false}`, `autoComplete="off"`, `aria-label="Search the library"`. Placeholder text: `"Search films, directors, genres…"` (shown only when not focused; cleared when focused via conditional prop).
- **Mirror span (`searchMirror`):** `position: absolute`, `left: 0`, `top: 50%`, `transform: translateY(-50%)`, `visibility: hidden`, `pointerEvents: none`, `whiteSpace: pre`, Mono 12px, `letterSpacing: 0.06em`. Receives the same text value as the input. A `useEffect` reads `searchMirrorRef.current.offsetWidth` to set `searchCaretX` whenever `search` or `searchFocused` changes.
- **Custom caret span (`searchCaret`):** rendered inside `searchInputWrap` only when `searchFocused` is true. `position: absolute`, `top: 50%`, `marginTop: -7px` (centres 14px element on midline), `width: 7px`, `height: 14px`. `borderRadius: 1px` on all corners. `backgroundColor: tokens.colorGreen`. `boxShadow: 0 0 6px ${tokens.colorGreen}, 0 0 14px ${tokens.colorGreenGlow}`. Pulsing keyframe: `0%, 100%` → `opacity: 1, transform: scaleY(1)`; `50%` → `opacity: 0.25, transform: scaleY(0.86)`. `animationDuration: 1.05s`, `animationIterationCount: infinite`, `animationTimingFunction: ease-in-out`. Positioned via inline `style={{ left: searchCaretX + "px" }}` from the mirror-span measurement.
- **Clear button (`searchClear`):** `<IconClose width={12} height={12}>` inside a 20×20 button, `aria-label="Clear search"`. Shown when `searching` (`trimmedQuery.length > 0`). `color: colorTextMuted`, hover `color: colorText`. Clicking `setSearch("")`.
- **Trimmed query:** the derived value `trimmedQuery = search.trim().toLowerCase()` controls the searching/empty branch.
- **Empty state:** `trimmedQuery.length === 0` → show three default rows below.
- **Results state:** `trimmedQuery.length > 0` AND `searchResults.length > 0` → `rowsScroll` renders a `<div searchResults>` (flex column `rowGap: 16px`) containing a `<div rowHeader>` reading `"Results · {N}"` (Mono 11px / `colorTextDim`) + `<div searchGrid>`.
- **`searchGrid`:** `display: grid`, `gridTemplateColumns: repeat(auto-fill, 200px)`, `justifyContent: start`, `columnGap: 16px`, `rowGap: 24px`. Reuses `<FilmTile>` (same 200px wide component as the rows).
- **No-match state:** `trimmedQuery.length > 0` AND `searchResults.length === 0` → `<div noResults>` with `"No films match "{search.trim()}""`. Mono 12px, `letterSpacing: 0.18em`, uppercase, `colorTextMuted`, `textAlign: center`, `paddingTop/Bottom: 40px`.
- **Filter logic:** all `films` entries whose `title`, `filename`, `director`, or `genre` (each `.toLowerCase()`) includes `trimmedQuery`. Computed by `useMemo` on `trimmedQuery`.
- All filtering is client-side against the in-memory `films` array. Production: replace with a backend search query (Relay refetch or subscription).

### Row section (below hero)

Three horizontal-scroll rows (shown when search query is empty), rendered in `rowsScroll`. `rowsScroll` has: `flexGrow: 1`, **`paddingTop: 20px`**, `paddingBottom: 60px`, `display: flex`, `flexDirection: column`, `rowGap: 28px` (between rows). **No `paddingLeft` or `paddingRight`** — the `.page`'s 40px padding provides the inset for both the hero and the rows section uniformly.

Rows are rendered conditionally — each is skipped if its data array is empty. The order is:

1. **"Continue watching"** — shown when `continueWatching.length > 0`.
2. **"New releases"** — shown when `newReleases.length > 0`.
3. **"Watchlist"** — shown when `watchlistRest.length > 0`.

Shared row anatomy (the `<Row title>` component):

- **`row`:** flex column, `rowGap: 12px` (between label and track).
- **`rowHeader`:** JetBrains Mono 11px / `letterSpacing: 0.22em` / uppercase / `colorTextDim`.
- **`rowFrame`:** `position: relative` wrapper that hosts the `rowTrack` and the edge arrows.
- **`rowTrack`:** `display: flex`, `columnGap: 16px`, `overflowX: auto`, `overflowY: hidden`, scrollbar hidden (`scrollbarWidth: none`, `msOverflowStyle: none`, `::webkit-scrollbar: display: none`), `scrollSnapType: x proximity`, `paddingBottom: 8px`.

#### Row pagination (edge arrows)

- `hasPrev` and `hasNext` state updated by a `scroll` listener + `ResizeObserver` on the track element. Tolerance: 4px (`hasPrev = scrollLeft > 4`, `hasNext = scrollLeft + clientWidth < scrollWidth - 4`).
- **`rowArrow`** (base): `position: absolute`, `top: calc(50% - 24px)`, `width: 44px`, `height: 44px`, inline-flex centred, `backgroundColor: rgba(8,11,10,0.65)`, `backdropFilter: blur(10px) saturate(1.4)` (+ `-webkit-` prefix), 1px solid `colorBorder` all sides, `borderRadius: 50%`, `color: colorText`, `zIndex: 4`. Hover: `backgroundColor: rgba(8,11,10,0.85)`, border all sides → `colorGreen`, `color: colorGreen`, `transform: scale(1.06)`.
- **`rowArrowLeft`:** `left: -12px`. Contains `<IconBack>`, `aria-label="Previous"`.
- **`rowArrowRight`:** `right: -12px`. Contains `<IconChevron>`, `aria-label="Next"`.
- Smooth scroll is RAF-based (`smoothScrollBy`): `easeInOutCubic` easing (cubic formula: `t < 0.5 ? 4t³ : 1 - (-2t+2)³/2`), `ROW_SCROLL_DURATION_MS = 720`.
- **Page-size computation (`pageSize()`):** `tilesPerPage = Math.max(1, Math.floor(el.clientWidth / TILE_STRIDE))`, then `tilesPerPage * TILE_STRIDE`. This ensures scroll distance is always a multiple of `TILE_STRIDE` so the animation lands on a tile boundary.
- **Constants:** `TILE_WIDTH = 200`, `TILE_GAP = 16`, `TILE_STRIDE = 216`.
- **Pagination invariant:** page size must be a multiple of `TILE_STRIDE` (216px). If it is not, `scroll-snap-type: proximity` on the track does NOT enforce snap during the RAF animation, leaving tiles visually misaligned at rest. The `Math.floor(clientWidth / TILE_STRIDE) * TILE_STRIDE` formula guarantees this.

#### "Continue watching" row

- Source: `watchlist` items where `item.progress !== undefined`, then resolved to their `Film` via `getFilmById(item.filmId)`. Items without a matching film are filtered out.
- Mock data: `wl-1` Oppenheimer 42%, `wl-2` Nosferatu 73%, `wl-3` Civil War 18%, `wl-5` Furiosa 64%, `wl-6` Mad Max 91%, `wl-7` F1 8%, `wl-8` Superman 36%, `wl-9` Justice League 22%, `wl-10` Oppenheimer Director's Cut 55%, `wl-11` Nosferatu B&W 81%, `wl-12` Barbie IMAX 12%, `wl-13` Civil War Theatrical 47% (12 items with progress).
- No auto-scroll teaser on the Row component (removed in the paginated arrow iteration).
- Tiles show green progress bar at poster bottom.

#### "New releases" row

- Source: `newReleaseIds` exported from `mock.ts`. Current order: `["f1", "superman", "furiosa", "justiceleague", "madmax"]` (5 entries). Each id resolved via `getFilmById`; missing ids filtered out.
- No progress bars on these tiles.

#### "Watchlist" row

- Source: `watchlist` items where `item.progress === undefined`, resolved to films. Only `wl-4` (Barbie) has no progress in mock data — so this row renders one tile.
- No progress bars.

### Tile (`FilmTile` component, all rows and search grid)

- `<button type="button">` with `className={styles.tile}`, `textAlign: left`, `color: inherit`.
- `width: 200px`, `flexShrink: 0`, `backgroundColor: transparent`, no border, no padding, `cursor: pointer`, `scrollSnapAlign: start`.
- **`tileFrame`:** `position: relative`, `aspectRatio: 2/3`, 1px solid `colorBorder` all sides, `backgroundColor: colorSurface`. `transitionProperty: box-shadow, transform`, `transitionDuration: tokens.transitionSlow` (0.25s).
  - **`::after` border wipe (green):** `content: ""`, `position: absolute`, `top/right/bottom/left: -1px`, 1px solid `colorGreen` all sides, `clipPath: inset(100% 0 0 0)` at rest → `inset(0 0 0 0)` on hover. `transitionProperty: clip-path`, `transitionDuration: tokens.transitionSlow`, `transitionTimingFunction: ease-out`. `pointerEvents: none`.
  - **Hover on `tileFrame`:** `transform: translateY(-3px)`, `boxShadow: 0 8px 20px ${tokens.colorGreenGlow}, 0 2px 6px ${tokens.colorGreenSoft}`.
  - **Hover on `tileFrame::after`:** `clipPath: inset(0 0 0 0)` (wipe completes — full green border visible).
- **`tileImage`:** `width: 100%`, `height: 100%`, `objectFit: cover`, `display: block`.
- **Progress bar (optional):** `progressTrack` — `position: absolute`, `left: 0`, `right: 0`, `bottom: 0`, `height: 3px`, `backgroundColor: rgba(0,0,0,0.55)`. `progressFill` — `height: 100%`, `backgroundColor: colorGreen`, `width: {progress}%`.
- **`tileMeta`** (below frame): `marginTop: 10px`. Contains `tileTitle` (13px, `colorText`) and `tileSubtitle` (`fontMono`, 10px, `colorTextMuted`, `letterSpacing: 0.06em`, `marginTop: 3px`). The subtitle renders `{year} · {duration}` filtered through `filter(Boolean).join(" · ")`.
- Clicking calls `openFilm(film.id)` → `setSearchParams({ film: id })`.

## Visual — overlay view (when `?film=<id>` is set)

When `selectedFilm` is set, `<Library>` renders `<FilmDetailsOverlay film={selectedFilm} onClose={closeFilm} />` instead of the dash view. The overlay component returns its own root div (it replaces the full page output, not rendered inside the page container).

### Overlay container (`.overlay`)

- `position: absolute`, `inset: 0`, `overflow: hidden`, `backgroundColor: tokens.colorBg0`.

### Background poster (`.overlayPoster`)

- `<Poster>` component fills the overlay (`position: absolute`, `inset: 0`, `width: 100%`, `height: 100%`, `objectFit: cover`).
- **`viewTransitionName: "film-backdrop"`** — this value must stay in sync with Player's `.backdrop` rule (see [View Transitions contract](#view-transitions-contract) below).
- Slow Ken Burns animation: `scale(1.04) translate(-0.4%, -0.3%)` → `scale(1.04) translate(0.4%, 0.3%)` over **26s**, ease-in-out, alternate, infinite.
- **Full-color** (no grayscale filter).

### Gradient overlay (`.overlayGradient`)

- `position: absolute`, `inset: 0`, `pointerEvents: none`.
- Two-gradient `backgroundImage`:
  - `linear-gradient(180deg, rgba(5,7,6,0.45) 0%, transparent 25%, transparent 38%, rgba(5,7,6,0.85) 72%, ${tokens.colorBg0} 100%)`
  - `linear-gradient(90deg, rgba(5,7,6,0.5) 0%, transparent 35%)`

### Back pill (`.overlayBack`) — top-left

- `position: absolute`, `top: 24px`, `left: 28px`, `zIndex: 4`.
- `<IconBack>` + `<span>Back</span>` in an inline-flex row, `columnGap: 8px`.
- `paddingTop/Bottom: 8px`, `paddingLeft: 12px`, `paddingRight: 16px`. `backgroundColor: rgba(0,0,0,0.45)`, 1px solid `colorBorder` all sides, `borderRadius: 999px`.
- `fontMono`, `fontSize: 11px`, `letterSpacing: 0.16em`, `textTransform: uppercase`, `color: colorText`.
- Hover: `backgroundColor: rgba(0,0,0,0.7)`, border all sides → `colorGreen`, `color: colorGreen`. Transition `background-color, border-color, color`.
- `aria-label="Back to home"`. Clicking calls `onClose` → `closeFilm()`.

### Close button (`.overlayClose`) — top-right

- `position: absolute`, `top: 24px`, `right: 28px`, `zIndex: 4`.
- 40×40, inline-flex centred. `backgroundColor: rgba(0,0,0,0.45)`, 1px solid `colorBorder` all sides, `borderRadius: 50%`.
- Contains `<IconClose>`. `aria-label="Close details"`. Clicking calls `onClose` → `closeFilm()`.
- Hover: `backgroundColor: rgba(0,0,0,0.7)`, border all sides → `colorGreen`.

### Content stack (`.overlayContent`) — lower area

- `position: absolute`, **`left: 60px`**, **`right: 60px`**, **`bottom: 72px`**, `zIndex: 3`.
- `display: flex`, `flexDirection: column`, `rowGap: 14px`, `maxWidth: 720px`.

From top to bottom:

1. **Chips row (`.overlayChips`):** `display: flex`, `columnGap: 8px`, `alignItems: center`. Contains:
   - Resolution chip: `<span className="chip green">{film.resolution}</span>`.
   - HDR chip (if `film.hdr && film.hdr !== "—"`): `<span className="chip">{film.hdr}</span>`.
   - Codec chip (if `film.codec`): `<span className="chip">{film.codec}</span>`.
   - IMDb rating (if `film.rating !== null`): `<span overlayRating>` — inline-flex, `columnGap: 5px`, `fontMono`, `fontSize: 11px`, `color: colorYellow`, `paddingLeft: 4px`. Contains `<ImdbBadge>` + rating number.
2. **Title (`.overlayTitle`):** `fontHead` (Anton) **72px** / `colorText` / **`lineHeight: 0.95`** / `letterSpacing: -0.02em`.
3. **Meta row (`.overlayMetaRow`):** `fontMono`, **`fontSize: 13px`**, `letterSpacing: 0.08em`, `color: colorTextDim`, `textTransform: uppercase`. Renders `{year} · {genre} · {duration}` joined via `filter(v => v !== null && v !== undefined).join(" · ")`.
4. **Director line (`.overlayDirector`):** `fontSize: 13px`, `color: colorTextMuted`. Text: `"Directed by "` + `<span overlayDirectorName>{director}</span>` (`color: colorText`). Rendered only when `film.director` is truthy.
5. **Plot paragraph (`.overlayPlot`):** **`fontSize: 15px`** / **`lineHeight: 1.55`** / `color: colorTextDim` / **`maxWidth: 640px`**. Rendered only when `film.plot` is truthy.
6. **Actions row (`.overlayActions`):** `display: flex`, `alignItems: center`, `columnGap: 20px`, `marginTop: 8px`. Contains:
   - **Play CTA (`.playCta`):** `<button onClick={playWithTransition}>` — **glass pill** (iOS-26 Liquid Glass inspired): inline-flex, `columnGap: 10px`, `backgroundColor: rgba(255,255,255,0.12)`, `color: #fff`, `paddingTop/Bottom: 14px`, `paddingLeft: 26px`, `paddingRight: 30px`, `borderRadius: 999px`, beveled-light borders (top brighter than bottom), `backdropFilter: blur(20px) saturate(180%)`, `boxShadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.20), 0 10px 32px rgba(0,0,0,0.45)`. `fontMono` 12px / 0.18em / uppercase / 600. Hover: `translateY(-1px)` + bg `rgba(255,255,255,0.18)` + amplified shadow + subtle white halo. `:active`: `translateY(0) scale(0.98)`. The inner `<IconPlay>` is **engraved** — `& svg` rule: `color: rgba(255,255,255,0.55)` + `filter: drop-shadow(0 1px 0.5px rgba(255,255,255,0.45)) drop-shadow(0 -1px 0.5px rgba(0,0,0,0.55))` (recessed-into-glass illusion). Contains `<IconPlay>` + `<span>Play</span>`. `playWithTransition` uses `document.startViewTransition(() => navigate("/player/{film.id}"))` when available, else plain `navigate(...)`.
   - **Filename (`.overlayFilename`):** `fontMono`, `fontSize: 10px`, `letterSpacing: 0.06em`, `color: colorTextFaint`.

## Mock data (lab)

### `films` array — 13 entries total

| id | title | year |
|---|---|---|
| `oppenheimer` | Oppenheimer | 2023 |
| `nosferatu` | Nosferatu | 2024 |
| `barbie` | Barbie | 2023 |
| `civilwar` | Civil War | 2024 |
| `furiosa` | Furiosa: A Mad Max Saga | 2024 |
| `madmax` | Mad Max: Fury Road | 2015 |
| `f1` | F1 | 2025 |
| `superman` | Superman | 2025 |
| `justiceleague` | Zack Snyder's Justice League | 2021 |
| `oppenheimer-cut` | Oppenheimer (Director's Cut) | 2023 |
| `nosferatu-bw` | Nosferatu (B&W Print) | 2024 |
| `barbie-imax` | Barbie (IMAX) | 2023 |
| `civilwar-theatrical` | Civil War (Theatrical) | 2024 |

Plus one unmatched synthetic entry (`unmatched-rip`, no poster, no title).

### `watchlist` array — 13 entries (wl-1 … wl-13)

- `wl-4` (Barbie) has **no `progress`** field — it appears only in the "Watchlist" row.
- All other 12 items (`wl-1, wl-2, wl-3, wl-5 … wl-13`) have a `progress` field — they appear in "Continue watching".

### `newReleaseIds` — curated order for "New releases" row

`["f1", "superman", "furiosa", "justiceleague", "madmax"]` (5 entries).

## Behaviour

### `openFilm(id)`

Creates a new `URLSearchParams` from the current params, sets `film = id`, calls `setParams(next)`. This preserves any other query params that may be present.

### `closeFilm()`

Creates a new `URLSearchParams` from the current params, deletes `film`, calls `setParams(next)`.

### Hero cycling

- State: `heroIndex: number` (default 0) + `heroFading: boolean` (default false) + `heroFadeTimerRef`.
- `useEffect([heroFilms.length, selectedFilm])`: when `selectedFilm` is set, no interval runs (overlay is showing). Otherwise, `setInterval` every 7 000ms. On tick: `setHeroFading(true)` → `setTimeout` of 700ms → `setHeroIndex((i) => (i + 1) % heroFilms.length)` + `setHeroFading(false)`.
- Cleanup: `clearInterval` + `clearTimeout(heroFadeTimerRef.current)`.
- `goToHero(idx)`: if `idx === heroIndex`, no-op; else `setHeroFading(true)` → after **350ms** (half of `HERO_FADE_MS`): `setHeroIndex(idx)` + `setHeroFading(false)`. Note: `goToHero` uses a plain `setTimeout`, not the ref — the timeout is not cleaned up on unmount in the current lab (minor edge case).
- `heroFilms` is computed by `useMemo` over `HERO_FILM_IDS` — any id not found is filtered out.

## Subcomponents

### `FilmDetailsOverlay` (inline or co-located)

- Props: `film: FilmShape`, `onClose: () => void`.
- Renders the full-bleed overlay described in the overlay view section above.

## View Transitions contract

**Both `Library.overlayPoster` and `Player.backdrop` MUST carry `viewTransitionName: "film-backdrop"`** (the same value). The View Transitions API uses this shared name to auto-morph the poster element across routes when navigation is wrapped in `document.startViewTransition`. If the two values diverge, the morph silently degrades to a cross-fade without any element continuity.

The contract applies in both directions:
- **Forward (Play):** `FilmDetailsOverlay`'s `playWithTransition` calls `document.startViewTransition(() => navigate(\`/player/${film.id}\`))`.
- **Reverse (Back):** Player's `goBackWithTransition` wraps `navigate(-1)` identically.

Fallback on browsers without View Transitions support (e.g., Safari < 18): plain `navigate(...)` — no morph, no error.

## Changes from Prerelease

- **Route:** OLD — secondary route `/library`. NEW — primary home route `/`.
- **Page purpose:** OLD — flat catalogue browser (grid or list view of all films). NEW — Netflix-style home page with hero + horizontal-scroll rows + full-bleed overlay.
- **Layout model:** OLD — `split-body` grid (`1fr / 4px / 360px`), right-rail `DetailPane` at 360px via `?film=<id>`. NEW — flex column with 75vh inset hero + `rowsScroll` rows below; tile click opens full-bleed `FilmDetailsOverlay` (replaces entire page output). No split-body, no resize handle.
- **Hero:** OLD — no hero on the Library page (hero existed on Dashboard/Profiles). NEW — `height: 75vh`, `borderRadius: 6px`, inset 40px from page edges. B&W cycling poster slideshow (four canonical posters, 7 000ms interval, 0.9s opacity crossfade) with Ken Burns pan. 3D-tilted greeting (Anton 64px, `±9°` mouse-tilt, `perspective(800px) rotateX/rotateY`). Floating ghost search bar top-right inside hero.
- **Filter bar:** OLD — horizontal filter strip: search input, profile chip row, type select, grid/list toggle. NEW — no filter bar. Search is a ghost pill inside the hero, client-side only against `films` array.
- **Search:** OLD — standard `<input>` in the filter bar, filters by title/genre/filename. NEW — ghost search bar inside hero (absolute positioned, `width: 320px`, horizontal gradient background, `caretColor: transparent`, custom pulsing green caret via mirror-span measurement). Same filter fields (title, filename, director, genre). Results render as a vertical CSS grid (`repeat(auto-fill, 200px)`, `justifyContent: start`) instead of a horizontal row.
- **Rows:** OLD — no horizontal-scroll rows. NEW — three rows: "Continue watching" (watchlist items with `progress`), "New releases" (curated `newReleaseIds`), "Watchlist" (watchlist items without `progress`). Arrow-driven RAF-eased pagination (`easeInOutCubic` 720ms, page = `Math.floor(clientWidth/216)*216` px).
- **Tile size:** OLD — `<PosterCard>` in Prerelease Library used a `posterImg` div sized by the grid (approx. 180px wide). NEW — `<FilmTile>` `width: 200px`, `aspectRatio: 2/3`, `scrollSnapAlign: start`.
- **Tile hover:** OLD — gray `border-color` change + `box-shadow`. NEW — bottom-up green border wipe via `tileFrame::after` `clipPath: inset(100% 0 0 0)` → `inset(0 0 0 0)` + `translateY(-3px)` lift + `boxShadow: 0 8px 20px colorGreenGlow`.
- **Click → detail:** OLD — tile click sets `?film=<id>`, slides in a 360px `DetailPane` on the right (the `<DetailPane>` component). NEW — tile click sets `?film=<id>`, renders full-bleed `FilmDetailsOverlay` (replaces the whole page). The overlay has a Back pill (top-left) and Close button (top-right), both calling `onClose`.
- **Overlay content:** OLD — `DetailPane` had poster gradient hero (200px) + body with badges + rating + plot. NEW — `FilmDetailsOverlay` has full-bleed poster (Ken Burns 26s, full-colour), layered gradients, content stack at `bottom: 72px` with Anton 72px title, chips row, meta row, director line, plot (15px, 1.55 line-height), green Play CTA.
- **View transitions:** OLD — no view transitions. NEW — `PlayCTA` calls `document.startViewTransition(() => navigate("/player/{id}"))`. `.overlayPoster` carries `viewTransitionName: "film-backdrop"` (must match Player `.backdrop`).
- **Play CTA:** OLD — `<Link to="/player/:id">` (standard navigation). NEW — `<button onClick={playWithTransition}>` wrapping `startViewTransition` with plain-navigate fallback.
- **Play CTA visual (2026-05-02):** OLD — solid green button (`backgroundColor: colorGreen`, `color: colorGreenInk`, `borderRadius: 3px`). NEW — **glass pill** (iOS-26 Liquid Glass inspired): translucent white bg, `border-radius: 999px`, `backdrop-filter: blur(20px) saturate(180%)`, beveled-light borders, inset highlights + drop shadow + on-hover lift. Matches the Player big-play button and the DetailPane play button — green is no longer the action-button identity colour.
- **Mock data:** OLD — 4 canonical films with `gradient` string fields. NEW — 13 films with `posterUrl: string | null` (real OMDb JPGs). `watchlist` grows to 13 entries (12 with `progress`). `newReleaseIds` curated array is new.

## TODO(redesign)

- `?q=<query>` URL param is not yet wired in the lab — the search bar filters in local state only. Production should write `?q=` to the URL so the filtered view is shareable/bookmarkable. When wired, the Library page should also read an incoming `?q=` on mount and pre-populate the input.
- Production: "Continue watching", "New releases", and "Watchlist" derivation must come from backend queries, not mock data.
- `goToHero`'s inner `setTimeout` is not cleaned up on unmount — minor edge case, no visible bug in the lab; fix at port time by storing the timeout in a ref.

## Porting checklist (`client/src/pages/Library/`)

### Page shell

- [ ] `.page`: flex column, `height: 100%`, `overflowX: hidden`, `overflowY: auto`, `backgroundColor: colorBg0`, **`paddingLeft: 40px`**, **`paddingRight: 40px`** (no top padding — hero starts at y=0 inside the padded container)

### Hero

- [ ] Hero `height: 75vh`, `position: relative`, `overflow: hidden`, `flexShrink: 0`, **`borderRadius: 6px`** (inset from page edges by 40px, NOT full-bleed)
- [ ] `heroSlides`: `position: absolute`, `inset: 0`; all four canonical posters rendered simultaneously
- [ ] Each `heroImg`: `position: absolute`, `inset: 0`, `width/height: 100%`, `objectFit: cover`, `filter: grayscale(1) brightness(0.55)`, `opacity: 0`, `transitionProperty: opacity`, `transitionDuration: 0.9s`, `transitionTimingFunction: ease`
- [ ] Ken Burns on every `heroImg`: 0% `scale(1.06) translate(-0.8%, -0.6%)` → 100% `scale(1.06) translate(0.8%, 0.6%)`, 20s ease-in-out alternate infinite
- [ ] `heroImgActive`: `opacity: 1`. `heroImgFading` (active + fading flag): `opacity: 0`
- [ ] `heroEdgeFade`: two-gradient (`to bottom` + `to right`), `backgroundSize: 100% 115%, 115% 100%`, 22s `backgroundPosition` animation cycling `0% 0%, 0% 0%` → `0% 100%, 100% 0%` → back
- [ ] `heroBottomFade`: `linear-gradient(180deg, transparent 50%, rgba(5,7,6,0.8) 88%, colorBg0 100%)` + `linear-gradient(90deg, colorBg0 0%, rgba(5,7,6,0.85) 22%, transparent 55%)`
- [ ] Grain layer: `<div className="grain-layer" />`
- [ ] Search bar: inside hero block, between `grain-layer` and `heroBody` (see Search bar checklist below)
- [ ] `heroBody`: `position: absolute`, `inset: 0`, `paddingTop: calc(headerHeight + 32px)` (84px), `paddingBottom: 20px`, **`paddingLeft: 44px`**, **`paddingRight: 44px`**, flex column `rowGap: 20px` (no space-between), `zIndex: 2`
- [ ] `greetingEyebrow`: `fontMono`, 12px, `letterSpacing: 0.18em`, uppercase, `colorGreen`. Text: `"· {greeting()}, {user.name.toUpperCase()}"` where `greeting()` returns time-of-day string
- [ ] `.greeting` div: Anton 64px, `lineHeight: 0.92`, `letterSpacing: -0.02em`, `marginTop: 28px`, `display: inline-block`, `transformOrigin: center center`, `transformStyle: preserve-3d`, `willChange: transform`, `transitionProperty: transform`, `transitionDuration: 0.18s`, `transitionTimingFunction: ease-out`
- [ ] 3D tilt: `onMouseMove` computes `nx = (clientX - left)/width - 0.5`, `ny = (clientY - top)/height - 0.5`; sets `transform: perspective(800px) rotateX(${ny*18}deg) rotateY(${-nx*18}deg)`. `onMouseLeave` resets to 0,0.
- [ ] Slide dots: 4 `<button type="button">`, `display: flex`, `columnGap: 8px`. Active: `width: 26px`, `height: 3px`, `borderRadius: 2px`, `backgroundColor: colorGreen`. Inactive: `width: 8px`, same. Transition: `width, background-color`, `transitionDuration: transitionSlow`. `aria-label={Show ${film.title}}`
- [ ] Interval: 7 000ms; inner timeout: 700ms; both cleaned up via refs on unmount. Effect dependency: `[heroFilms.length, selectedFilm]`
- [ ] `goToHero(idx)`: no-op if same index; else fade out (setHeroFading true), 350ms later set index + fade in

### Search bar (inside hero)

- [ ] `searchBar`: `position: absolute`, `top: calc(headerHeight + 24px)`, `right: 32px`, `zIndex: 3`, `width: 320px`, `display: flex`, `alignItems: center`, `columnGap: 10px`, `paddingTop/Bottom: 8px`, `paddingLeft: 16px`, `paddingRight: 12px`
- [ ] `searchBar` background: `linear-gradient(90deg, rgba(20,28,24,0) 0%, rgba(20,28,24,0.42) 22%, rgba(20,28,24,0.42) 78%, rgba(20,28,24,0) 100%)`, `transitionProperty: background-image`, `transitionDuration: tokens.transition`
- [ ] `searchBarFocused` bumps alpha to 0.7 at 22% and 78% stops (applied via JS `searchFocused` state)
- [ ] `searchIcon`: `<IconSearch>`, `color: colorGreen`, `flexShrink: 0`
- [ ] `searchInputWrap`: `position: relative`, `flexGrow: 1`, `display: flex`, `alignItems: center`, `minWidth: 0`, `height: 20px`
- [ ] `searchInput`: `caretColor: transparent`, `width: 100%`, transparent bg, no border, no outline, Mono 12px, `letterSpacing: 0.06em`, `paddingRight: 12px`, `paddingTop/Bottom/Left: 0`. Placeholder: `colorTextMuted`, `letterSpacing: 0.14em`, uppercase, 10px. `spellCheck={false}`, `autoComplete="off"`, `aria-label="Search the library"`. Placeholder cleared on focus (conditional prop on `placeholder`).
- [ ] `searchMirror`: `position: absolute`, `left: 0`, `top: 50%`, `transform: translateY(-50%)`, `visibility: hidden`, `pointerEvents: none`, `whiteSpace: pre`, Mono 12px, `letterSpacing: 0.06em`. `useEffect([search, searchFocused])` reads `mirrorRef.current.offsetWidth` → `setSearchCaretX`
- [ ] `searchCaret`: rendered when `searchFocused`. `position: absolute`, `top: 50%`, `marginTop: -7px`, `width: 7px`, `height: 14px`, `borderRadius: 1px` all corners, `backgroundColor: colorGreen`, `boxShadow: 0 0 6px colorGreen, 0 0 14px colorGreenGlow`. Pulsing keyframe: 0%/100% `opacity:1 scaleY(1)`, 50% `opacity:0.25 scaleY(0.86)`, 1.05s ease-in-out infinite. Positioned via `style={{ left: searchCaretX + "px" }}`
- [ ] `searchClear`: 20×20 button, `<IconClose 12×12>`, `aria-label="Clear search"`, shown when `searching` (trimmedQuery.length > 0). Click: `setSearch("")`
- [ ] `onBlur` clears `searchFocused` after 120ms `window.setTimeout` (so clicks on the clear button register first)
- [ ] Empty query (`trimmedQuery.length === 0`) → rows section renders three row components
- [ ] Non-empty query, results found → `searchResults` flex column `rowGap: 16px` containing `rowHeader` (`"Results · {N}"`) + `searchGrid` (`display: grid`, `gridTemplateColumns: repeat(auto-fill, 200px)`, `justifyContent: start`, `columnGap: 16px`, `rowGap: 24px`) with `<FilmTile>` per result
- [ ] Non-empty query, no results → `<div noResults>` `"No films match …"`, Mono 12px, `letterSpacing: 0.18em`, uppercase, `colorTextMuted`, `textAlign: center`, `paddingTop/Bottom: 40px`
- [ ] Filter: title / filename / director / genre (all `.toLowerCase()`) includes `trimmedQuery`
- [ ] Production: replace client-side filter with backend search query / Relay refetch

### Rows section

- [ ] `rowsScroll`: `flexGrow: 1`, `paddingTop: 20px`, `paddingBottom: 60px`, `display: flex`, `flexDirection: column`, `rowGap: 28px`. **No `paddingLeft` or `paddingRight`** (page provides 40px inset)
- [ ] Three rows in order: "Continue watching" (watchlist items with progress), "New releases" (from `newReleaseIds`), "Watchlist" (watchlist items without progress). Each row skipped if empty.
- [ ] `row`: flex column, `rowGap: 12px`
- [ ] `rowHeader`: Mono 11px, `letterSpacing: 0.22em`, uppercase, `colorTextDim`
- [ ] `rowFrame`: `position: relative` (hosts the track + arrow buttons)
- [ ] `rowTrack`: `display: flex`, `columnGap: 16px`, `overflowX: auto`, `overflowY: hidden`, scrollbar hidden, `scrollSnapType: x proximity`, `paddingBottom: 8px`
- [ ] `rowArrow` (base): 44×44 circle, `position: absolute`, `top: calc(50% - 24px)`, glass bg `rgba(8,11,10,0.65)` `backdropFilter: blur(10px) saturate(1.4)`, 1px solid `colorBorder`, `borderRadius: 50%`, `zIndex: 4`. Hover: `rgba(8,11,10,0.85)`, border → `colorGreen`, `color: colorGreen`, `scale(1.06)`
- [ ] `rowArrowLeft`: `left: -12px`. `rowArrowRight`: `right: -12px`
- [ ] `hasPrev`: `scrollLeft > 4`. `hasNext`: `scrollLeft + clientWidth < scrollWidth - 4`. Updated by scroll listener + `ResizeObserver`
- [ ] RAF smooth scroll: `easeInOutCubic` easing, `ROW_SCROLL_DURATION_MS = 720`
- [ ] Page size: `Math.max(1, Math.floor(clientWidth / TILE_STRIDE)) * TILE_STRIDE` (must be a multiple of 216px — invariant)
- [ ] `TILE_WIDTH = 200`, `TILE_GAP = 16`, `TILE_STRIDE = 216`

### Tile (`FilmTile`)

- [ ] `<button type="button">`, `width: 200px`, `flexShrink: 0`, `textAlign: left`, `scrollSnapAlign: start`
- [ ] `tileFrame`: `position: relative`, `aspectRatio: 2/3`, 1px solid `colorBorder` all sides, `backgroundColor: colorSurface`, `transitionProperty: box-shadow, transform`, `transitionDuration: transitionSlow (0.25s)`
- [ ] `tileFrame::after`: `position: absolute`, `top/right/bottom/left: -1px`, 1px solid `colorGreen` all sides, `clipPath: inset(100% 0 0 0)` at rest, `inset(0 0 0 0)` on hover. `transitionProperty: clip-path`, `transitionDuration: transitionSlow`, `transitionTimingFunction: ease-out`. `pointerEvents: none`
- [ ] `tileFrame:hover`: `transform: translateY(-3px)`, `boxShadow: 0 8px 20px colorGreenGlow, 0 2px 6px colorGreenSoft`
- [ ] `tileFrame:hover::after`: `clipPath: inset(0 0 0 0)`
- [ ] `tileImage`: `width: 100%`, `height: 100%`, `objectFit: cover`, `display: block`
- [ ] Progress bar: `progressTrack` 3px absolute bottom, `rgba(0,0,0,0.55)` track; `progressFill` `colorGreen`, `width: {progress}%`. Only rendered when `progress !== undefined`
- [ ] `tileMeta`: `marginTop: 10px`; `tileTitle`: 13px, `colorText`; `tileSubtitle`: Mono 10px, `colorTextMuted`, `letterSpacing: 0.06em`, `marginTop: 3px`. Subtitle text: `{year} · {duration}` via `filter(Boolean).join(" · ")`
- [ ] Tile click: `openFilm(film.id)` → `setSearchParams({ film: id })`

### Overlay view (`FilmDetailsOverlay`)

- [ ] Replaces entire Library page output (not rendered inside page container)
- [ ] `.overlay`: `position: absolute`, `inset: 0`, `overflow: hidden`, `backgroundColor: colorBg0`
- [ ] `.overlayPoster`: `position: absolute`, `inset: 0`, `width/height: 100%`, `objectFit: cover`, **`viewTransitionName: "film-backdrop"`** (MUST match Player `.backdrop`). Ken Burns: `scale(1.04) translate(-0.4%, -0.3%)` → `scale(1.04) translate(0.4%, 0.3%)`, 26s, ease-in-out, alternate, infinite. Full-color (no filter)
- [ ] `.overlayGradient`: `position: absolute`, `inset: 0`, `pointerEvents: none`. `backgroundImage: linear-gradient(180deg, rgba(5,7,6,0.45) 0%, transparent 25%, transparent 38%, rgba(5,7,6,0.85) 72%, colorBg0 100%), linear-gradient(90deg, rgba(5,7,6,0.5) 0%, transparent 35%)`
- [ ] `.overlayBack` (top-left pill): `position: absolute`, `top: 24px`, `left: 28px`, `zIndex: 4`. `<IconBack>` + `"Back"` in inline-flex `columnGap: 8px`. `paddingTop/Bottom: 8px`, `paddingLeft: 12px`, `paddingRight: 16px`. `backgroundColor: rgba(0,0,0,0.45)`, border `colorBorder`, `borderRadius: 999px`. Mono 11px, `letterSpacing: 0.16em`, uppercase. Hover: `rgba(0,0,0,0.7)`, border → `colorGreen`, `color: colorGreen`. `aria-label="Back to home"`. Calls `onClose`
- [ ] `.overlayClose` (top-right circle): `position: absolute`, `top: 24px`, `right: 28px`, `zIndex: 4`. 40×40, `borderRadius: 50%`, `rgba(0,0,0,0.45)`, border `colorBorder`. `<IconClose>`, `aria-label="Close details"`. Hover: `rgba(0,0,0,0.7)`, border → `colorGreen`. Calls `onClose`
- [ ] `.overlayContent`: `position: absolute`, `left: 60px`, `right: 60px`, `bottom: 72px`, `zIndex: 3`, flex column `rowGap: 14px`, `maxWidth: 720px`
- [ ] Chips row: resolution green chip + HDR chip (if hdr and not "—") + codec chip + IMDb badge+rating (if `film.rating !== null`) in `colorYellow` Mono 11px
- [ ] Title: Anton 72px, `lineHeight: 0.95`, `letterSpacing: -0.02em`
- [ ] Meta row: Mono 13px, `letterSpacing: 0.08em`, `colorTextDim`, uppercase. `{year} · {genre} · {duration}`
- [ ] Director: 13px, `colorTextMuted`, `"Directed by "` + `<span colorText>{director}</span>`. Only when `film.director`
- [ ] Plot: 15px, `lineHeight: 1.55`, `colorTextDim`, `maxWidth: 640px`. Only when `film.plot`
- [ ] Actions row: flex, `columnGap: 20px`, `marginTop: 8px`. **Play CTA (glass pill, Liquid Glass): translucent white bg, `borderRadius: 999px`, `backdrop-filter: blur(20px) saturate(180%)`, beveled-light borders, inset highlights + drop shadow + on-hover lift, Mono 12px uppercase, `paddingTop/Bottom: 14px`, `paddingLeft: 26px`, `paddingRight: 30px`** + filename (Mono 10px, `colorTextFaint`)
- [ ] Play CTA: `<button onClick={playWithTransition}>` — wraps `document.startViewTransition(() => navigate("/player/{id}"))` with plain `navigate` fallback. NOT a `<Link>`
- [ ] View Transitions invariant: `.overlayPoster` `viewTransitionName: "film-backdrop"` must match Player `.backdrop` — if they diverge, the morph silently breaks

### Data + backend

- [ ] "Continue watching": `watchlist.filter(w => w.progress !== undefined)`, resolved to Film via `getFilmById`. Backend: watchlist join with job/progress
- [ ] "New releases": resolved from `newReleaseIds` constant. Backend: CMS-curated row or release-date sorted query
- [ ] "Watchlist": `watchlist.filter(w => w.progress === undefined)`. Backend: items with no playback progress
- [ ] Search: wired to backend query / Relay refetch (currently client-side only)
- [ ] `?q=<query>` URL param not yet wired in lab — production should write `?q=` so the filtered view is shareable/bookmarkable

## Status

- [x] Designed in `design/Release` lab — hero+rows+overlay layout (2026-05-01, PR #46 commit 04ea22b). Search bar between hero and rows added (787f136). Page-level padding + hero downsized to 340px card + spacing tightened (9cc6d48). Hero made full-bleed (5301df6). Hero shrunk to 280px; dots stack under greeting (45d1097). Hero grown to 300px; search bar refactored to centered pill (773681e). Search bar moved inside hero top-right; gradient strip style; custom green caret + mirror span (6fd44e4). Hero height → 420px; search grid restructured; `.overlayPoster` gets `viewTransitionName: "film-backdrop"`; Play CTA → `<button onClick={playWithTransition}>` (73a9cca). Hero changed to `75vh` + `borderRadius: 6px` + page inset (40px); RAF-eased row scroll (720ms easeInOutCubic); three rows (Continue Watching + New Releases + Watchlist); greeting eyebrow line; heroBody `paddingLeft/Right: 44px`, `paddingBottom: 20px`; `searchGrid` → 200px columns; overlay Back pill (top-left) added alongside Close button (907c331). PR #46 on `feat/release-design-omdb-griffel`, not yet merged to main.
- [ ] Production implementation
