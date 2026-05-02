# Library (page)

> Status: **done** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 (PR #48) — Added hero modes (idle / searching / filtering) and TUI-style slide panels. When the search bar gains focus or content, hero backdrop swaps to `heroPanelBg` (dark + dot-grid + subtle green glow); hero body shows `SearchSlide` (giant monospace prompt + match counts + `[F] Filter` button). Clicking Filter opens `FilterSlide` (TUI table: resolution / HDR / codec / decade toggles as `[ ] label` / `[x] label`, `[↩] Done` and `[⇧⌫] Clear` buttons). ESC keybind: in filter mode → close filter; in search mode → clear all (query + filters + focus). Clear button now shows when filters are active too. Search bar stays mounted in all modes; only hero body content swaps. Earlier 2026-05-02 — Play CTA's inner `<IconPlay>` now renders with an **engraved** treatment (`& svg` rule: muted color + paired drop-shadows for a recessed-into-glass illusion). Earlier 2026-05-02 — `FilmDetailsOverlay` Play CTA restyled as a glass pill (Liquid Glass): translucent white bg, `border-radius: 999px`, backdrop blur, beveled borders, layered shadows. Replaces the solid-green 3px-radius styling. Matches Player big-play and DetailPane play buttons. Note: the shared `IconPlay` SVG path was corrected (centroid → 8,8) on the same date. Earlier 2026-05-01 (PR #46, commit 907c331) — hero changed to `75vh` with `borderRadius: 6px`; page is now **inset** (`.page` has `paddingLeft/Right: 40px`); `heroBody paddingLeft/Right: 44px`, `paddingBottom: 20px`; three rows (Continue Watching + New Releases + Watchlist); `rowsScroll` has `paddingTop: 20px` only (no left/right — page provides 40px inset); `searchGrid` uses `repeat(auto-fill, 200px)` columns; tile width is 200px. Prior update (73a9cca) hero height 300 → 420px; `.overlayPoster` gains `viewTransitionName: "film-backdrop"`; Play CTA changed from `<Link>` to `<button onClick={playWithTransition}>`. Prior update (6fd44e4) search bar moves inside hero (top-right, absolute), gradient strip replaces bordered card, custom pulsing green caret + mirror span, `caretColor: transparent`. Prior update (773681e) hero grows to 300px; heroBody paddingTop calc(headerHeight + 32px), paddingBottom 24, paddingLeft/Right 56, rowGap 20. Prior update (45d1097) hero shrinks to 280px; dots stack under greeting via rowGap. Prior update (5301df6) made hero full-bleed (no border/radius). Prior update (9cc6d48) added page padding + 340px bordered card. Prior update (787f136) added search bar. Prior update (04ea22b) replaced grid/filter/DetailPane with hero+rows+overlay.

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

### Hero modes (idle / searching / filtering)

The hero has three states controlled by the `heroMode` state machine:

```js
heroMode = filterOpen ? "filtering" : (searchFocused || searching ? "searching" : "idle")
```

- **`idle`** (default): Rotating poster slideshow + rotating-greeting overlay. Backdrop is the grain layer + edge-fade + bottom-fade. Hero body shows the greeting text + slide dots. Hero `.heroActive` class not applied.
- **`searching`**: Search input has focus or contains a query. Hero backdrop swaps to `heroPanelBg` (dark semi-transparent + subtle green radial glow + dot-grid pattern). Hero body shows `<SearchSlide>` component instead of greeting. Hero gets `.heroActive` class.
- **`filtering`**: Filter panel is open (triggered by `[F] Filter` button from SearchSlide). Hero backdrop remains `heroPanelBg`. Hero body shows `<FilterSlide>` component. Hero gets `.heroActive` class.

When `heroMode !== "idle"`, the `searchBar` automatically gains focused styling (`searchBarFocused` class applied when `searchFocused || heroMode !== "idle"`), bumping the gradient alpha from 0.42 to 0.7.

#### `heroPanelBg` (backdrop for searching and filtering modes)

Applied to the hero when `heroMode !== "idle"`:

- `position: absolute`, `inset: 0`, `pointerEvents: none`, `backgroundColor: tokens.colorBg1`.
- **Radial glow:** `radial-gradient(circle at 70% 30%, rgba(120, 200, 150, 0.06) 0%, transparent 60%)`.
- **Dot-grid pattern:** `radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)`, `backgroundSize: 28px 28px`.
- Together, the glow + grid creates a subtle tech-forward backdrop that reads as "active" without overwhelming the large text rendered on top.

### Search bar (inside hero, always present, all modes)

Rendered inside the hero block between `grain-layer` and `heroBody` in **all three hero modes**. Contains: `<span searchIcon>`, `<div searchInputWrap>`, optional `<button searchClear>`. Position: **`position: absolute`, `top: calc(${tokens.headerHeight} + 24px)`, `right: 32px`, `zIndex: 3`, `width: 320px`** — opposite corner from the bottom-left greeting. `display: flex`, `alignItems: center`, `columnGap: 10px`, `paddingTop: 8px`, `paddingBottom: 8px`, `paddingLeft: 16px`, `paddingRight: 12px`.

- **Input container (`searchBar`):** no border, no border-radius, no solid background. Horizontal gradient strip: `backgroundImage: linear-gradient(90deg, rgba(20,28,24,0) 0%, rgba(20,28,24,0.42) 22%, rgba(20,28,24,0.42) 78%, rgba(20,28,24,0) 100%)`. `transitionProperty: background-image`, `transitionDuration: tokens.transition` (0.15s).
- **Active state (`searchBarFocused`):** bumps gradient mid-stop alpha to 0.7. Applied via JS when `searchFocused || heroMode !== "idle"`. Blur clears `searchFocused` after 120ms `window.setTimeout` (so clicks on the clear button register before the blur handler fires).
- **Search icon (`searchIcon`):** `<IconSearch>` at `color: colorGreen`, `flexShrink: 0`.
- **Input wrap (`searchInputWrap`):** `position: relative`, `flexGrow: 1`, `display: flex`, `alignItems: center`, `minWidth: 0`, `height: 20px`. Houses the real input, the hidden mirror span, and the custom caret span.
- **Input (`searchInput`):** `caretColor: transparent` (hides the native browser caret). `width: 100%`, `backgroundColor: transparent`, no border, `outlineStyle: none`. `fontFamily: tokens.fontMono`, `fontSize: 12px`, `letterSpacing: 0.06em`, `color: tokens.colorText`. `paddingTop/Bottom: 0`, `paddingLeft: 0`, `paddingRight: 12px`. Placeholder: `color: colorTextMuted`, `letterSpacing: 0.14em`, `textTransform: uppercase`, `fontSize: 10px`. `spellCheck={false}`, `autoComplete="off"`, `aria-label="Search the library"`. Placeholder text: `"Search films, directors, genres…"` (shown only when not focused; cleared when focused via conditional prop).
- **Mirror span (`searchMirror`):** `position: absolute`, `left: 0`, `top: 50%`, `transform: translateY(-50%)`, `visibility: hidden`, `pointerEvents: none`, `whiteSpace: pre`, Mono 12px, `letterSpacing: 0.06em`. Receives the same text value as the input. A `useEffect` reads `searchMirrorRef.current.offsetWidth` to set `searchCaretX` whenever `search` or `searchFocused` changes.
- **Custom caret span (`searchCaret`):** rendered inside `searchInputWrap` only when `searchFocused` is true. `position: absolute`, `top: 50%`, `marginTop: -7px` (centres 14px element on midline), `width: 7px`, `height: 14px`. `borderRadius: 1px` on all corners. `backgroundColor: tokens.colorGreen`. `boxShadow: 0 0 6px ${tokens.colorGreen}, 0 0 14px ${tokens.colorGreenGlow}`. Pulsing keyframe: `0%, 100%` → `opacity: 1, transform: scaleY(1)`; `50%` → `opacity: 0.25, transform: scaleY(0.86)`. `animationDuration: 1.05s`, `animationIterationCount: infinite`, `animationTimingFunction: ease-in-out`. Positioned via inline `style={{ left: searchCaretX + "px" }}`.
- **Clear button (`searchClear`):** `<IconClose width={12} height={12}>` inside a 20×20 button, `aria-label="Clear search"`. Shown when `searching || activeFilterCount > 0` (i.e., there is either a query or active filters to clear). `color: colorTextMuted`, hover `color: colorText`. Clicking calls `clearAll()` (resets query, filters, filter-open flag, and focus).

### Search + filter state machine

Core state variables and derived values:

- `[search, setSearch]` — the query string (raw, not trimmed).
- `[searchFocused, setSearchFocused]` — true when the input element is focused.
- `[filterOpen, setFilterOpen]` — true when the filter slide is active.
- `[filters, setFilters]` — the Filters object: `{ resolutions: Set<Resolution>, hdrs: Set<Hdr>, codecs: Set<Codec>, decades: Set<number> }`.
- `trimmedQuery = search.trim().toLowerCase()` — controls matching logic.
- `searching = trimmedQuery.length > 0` — query is not empty.
- `heroMode = filterOpen ? "filtering" : (searchFocused || searching ? "searching" : "idle")` — three-state selector.
- `activeFilterCount = filtersActive(filters)` — total number of selected filter items.
- `queryMatched = useMemo(...)` — all films whose title/filename/director/genre contains `trimmedQuery` (case-insensitive).
- `searchResults = useMemo(...)` — `applyFilters(queryMatched, filters)`. **Filters always apply on top of query matches; they never broaden the result set.**

#### Filter application

**`applyFilters(list: Film[], filters: Filters): Film[]`** — if no filters active, return list unchanged. Otherwise, exclude films that don't match **all** active filter dimensions:
- If `filters.resolutions.size > 0` and film's resolution not in set, exclude.
- If `filters.hdrs.size > 0` and film's HDR value (or `"—"` if null) not in set, exclude.
- If `filters.codecs.size > 0` and film's codec not in set, exclude.
- If `filters.decades.size > 0`, exclude if film's year is null OR `Math.floor(film.year / 10) * 10` not in set.

#### ESC keybind

When `heroMode !== "idle"`, ESC key triggers:
- If `filterOpen === true`: `setFilterOpen(false)` (exit filter mode; search slide takes over).
- Else: `clearAll()` (exit search mode entirely, reset all state).

#### Clear all helper

**`clearAll()`** — sets `search = ""`, `filters = EMPTY_FILTERS`, `filterOpen = false`, `searchFocused = false` simultaneously.

### SearchSlide component (inline in hero body, searching mode only)

Rendered as `<SearchSlide ... />` when `heroMode === "searching"`. A TUI-style prompt panel showing the search query, match counts, and filter affordance.

**Props:** `query: string`, `resultCount: number`, `totalMatched: number`, `profilesMatched: number`, `activeFilterCount: number`, `onOpenFilter: () => void`, `onClear: () => void`.

- **`slidePanel` container:** `flexGrow: 1`, `display: flex`, `flexDirection: column`, `rowGap: 20px`, `fontFamily: tokens.fontMono`, `color: tokens.colorText`, `paddingTop: 12px`. Flex column layout so action buttons stick to the bottom.
- **Eyebrow (`slideEyebrow`):** Mono 11px / `letterSpacing: 0.22em` / uppercase / `colorGreen`. Text pattern varies by state:
  - No query, no filters: `"· search"`
  - Query but no filters: `"· query · {resultCount} result(s)"`
  - Filters active (regardless of query): append `" · "` + `<span slideEyebrowAccent>` (white text) `"{activeFilterCount} filter(s)"`
- **Prompt row (`slidePromptRow`):** `display: flex`, `alignItems: baseline`, `columnGap: 16px`, Mono **56px** / `lineHeight: 1` / `letterSpacing: -0.01em`.
  - **Caret (`slidePromptCaret`):** green Mono `">"`.
  - **Text (`slidePromptText`):** white, `display: inline-flex`, `alignItems: center`, `columnGap: 4px`, `minHeight: 1em`, `overflowX: hidden`, `whiteSpace: nowrap`. Renders `query.trim()` if present, empty string otherwise.
  - **Cursor (`slidePromptCursor`):** green block cursor (`width: 12px`, `height: 0.85em`), glowing shadow. Pulsing animation (same as search-bar caret: 1.05s ease-in-out). **Always visible** when in searching mode (no conditional render).
- **Status row (`slideStatus`):** Mono 12px / `letterSpacing: 0.06em` / `colorTextDim`. Flex row with wrap, `columnGap: 10px`, `rowGap: 6px`. Two variants:
  - **With query:** `"{resultCount} of {totalMatched} match(es)"` + `·` (sep, `colorTextFaint`) + `"{profilesMatched} profile(s)"` + if filters: `·` (sep) + `<span slideStatusAccent>"filtered ({activeFilterCount})"` (green).
  - **No query:** `<span slideStatusHint>` (italic, `colorTextMuted`) `"type to search films, directors, genres"`.
- **Actions row (`slideActions`):** `marginTop: auto` (push to bottom), `display: flex`, `alignItems: center`, `columnGap: 20px`, `paddingTop: 16px`, `flexWrap: wrap`.
  - **Primary (`slidePrimary`):** `"[F] Filter"` — green underlined text, Mono 13px / `letterSpacing: 0.18em` / uppercase. `textDecorationColor: colorGreen`, `textUnderlineOffset: 5px`, `textDecorationThickness: 1px`. Hover: text + underline → white. `onClick={onOpenFilter}`.
  - **Secondary (`slideSecondary`):** `"[ESC] Clear"` — grey underlined text, Mono 12px / `letterSpacing: 0.18em` / uppercase. Same underline styling. Hover: white. `onClick={onClear}`.

### FilterSlide component (inline in hero body, filtering mode only)

Rendered as `<FilterSlide ... />` when `heroMode === "filtering"`. A TUI-style table panel with toggle checkboxes for each filter dimension.

**Props:** `query: string`, `filters: Filters`, `setFilters: React.Dispatch<React.SetStateAction<Filters>>`, `resultCount: number`, `totalMatched: number`, `onClose: () => void`, `onClearFilters: () => void`.

- **`slidePanel` container:** same as SearchSlide.
- **Eyebrow:** Mono 11px / uppercase / `colorGreen`. Text pattern:
  - Base: `"· filters"` + if query: `" · {query.trim()}"` + if query and results differ: `" · "` + `<span slideEyebrowAccent>"{totalMatched} → {resultCount}"` (white).
- **TUI table (`tuiTable`):** `display: flex`, `flexDirection: column`, `rowGap: 10px`, Mono 13px, `paddingTop/Bottom: 8px`, `paddingLeft/Right: 16px`. Left border: 1px `colorBorder`. Background: `rgba(20, 24, 22, 0.55)` (semi-transparent dark).
  - **Filter row (`tuiRow`):** CSS grid `gridTemplateColumns: 120px 1fr`, `columnGap: 16px`, `alignItems: center`.
    - **Label (`tuiRowLabel`):** Mono 11px / `letterSpacing: 0.22em` / uppercase / `colorTextFaint`. Renders dimension name: `"resolution"`, `"hdr"`, `"codec"`, `"decade"`.
    - **Options (`tuiRowOptions`):** `display: flex`, `flexWrap: wrap`, `columnGap: 16px`, `rowGap: 6px`. Houses 3–4 `<TuiToggle>` buttons.
  - **TUI toggle button (`tuiToggle`):** `<button type="button">` with `aria-pressed={checked}`. Mono 13px / `letterSpacing: 0.04em`. `color: colorTextDim` at rest, `colorText` on hover. When checked: `color: colorGreen` (and stays green on hover). Inline-flex, `columnGap: 8px`, renders:
    - **Box (`tuiToggleBox`):** Mono, color inherited from parent. Renders `"[x]"` when checked, `"[ ]"` when unchecked.
    - **Label:** the filter option label (e.g., `"4K"`, `"HDR10"`, `"HEVC"`, `"'90s"`). Special case: HDR value `"—"` is labeled as `"SDR"`.
  - Clicking a toggle calls `setFilters((f) => ({ ...f, <dimension>: toggleSetItem(f.<dimension>, item) }))` where `toggleSetItem` implements a Set toggle (add if not present, remove if present).
- **Actions row:** `marginTop: auto`, `display: flex`, `alignItems: center`, `columnGap: 20px`, `paddingTop: 16px`, `flexWrap: wrap`.
  - **Primary (`slidePrimary`):** `"[↩] Done"` — green underlined text (same style as SearchSlide primary). `onClick={onClose}`.
  - **Secondary (`slideSecondary`):** `"[⇧⌫] Clear"` — grey underlined text (same style as SearchSlide secondary). `disabled={active === 0}` (where `active = filtersActive(filters)`). When disabled: `opacity: 0.35`, `cursor: not-allowed`. `onClick={onClearFilters}` (sets all filters to empty Sets).
  - **Hint (`slideHint`):** `marginLeft: auto`, Mono 10px / `letterSpacing: 0.12em` / `colorTextFaint` / uppercase. Text: `"{profiles.length} libraries · {totalMatched} matches before filters"`.

### Search results display (rowsScroll section)

When `heroMode === "searching"`:

- **With results:** `trimmedQuery.length > 0` AND `searchResults.length > 0` → `rowsScroll` renders a `<div searchResults>` (flex column `rowGap: 16px`) with a `<div rowHeader>` reading `"Results · {N}"` (Mono 11px / `colorTextDim`) + `<div searchGrid>`.
  - **`searchGrid`:** `display: grid`, `gridTemplateColumns: repeat(auto-fill, 200px)`, `justifyContent: start`, `columnGap: 16px`, `rowGap: 24px`. Reuses `<FilmTile>` (same 200px component as the rows).
- **No matches:** `trimmedQuery.length > 0` AND `searchResults.length === 0` → `<div noResults>` (Mono 12px / `letterSpacing: 0.18em` / uppercase / `colorTextMuted` / `textAlign: center` / `paddingTop/Bottom: 40px`) with text `"No films match "{search.trim()}""`.

When `heroMode === "idle"` (empty query, filters inactive):
- Show the three default rows (Continue Watching, New Releases, Watchlist) as documented in the Row section below.

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

The Library page now delegates to several extracted child components:

### **`SearchSlide` component** (extracted to `components/SearchSlide/`)

TUI-style search results panel displayed in the hero when the search input has focus or contains a query. See [`SearchSlide.md`](SearchSlide.md) for the full spec. Props: `query`, `resultCount`, `totalMatched`, `profilesMatched`, `activeFilterCount`, `onOpenFilter`, `onClear`.

### **`FilterSlide` component** (extracted to `components/FilterSlide/`)

TUI-style filter table (resolution / HDR / codec / decade toggles). See [`FilterSlide.md`](FilterSlide.md) for the full spec. Props: `query`, `filters`, `setFilters`, `resultCount`, `totalMatched`, `onClose`, `onClearFilters`.

### **`PosterRow` component** (extracted to `components/PosterRow/`)

Horizontal-scroll carousel row with smooth-scroll pagination arrows. See [`PosterRow.md`](PosterRow.md) for the full spec. Displays tiles (continue watching, new releases, watchlist). Props: `title`, `films`, `onSelectFilm`.

### **`FilmTile` component** (extracted to `components/FilmTile/`)

Poster card used in carousels and search results grid. See [`FilmTile.md`](FilmTile.md) for the full spec. 200px width, aspect ratio 2/3, progress bar optional. Exports `TILE_WIDTH`, `TILE_GAP`, `TILE_STRIDE` constants for callers. Props: `film`, `progress`, `onClick`.

### **`FilmDetailsOverlay` component** (extracted to `components/FilmDetailsOverlay/`)

Full-bleed film-details overlay. See [`FilmDetailsOverlay.md`](FilmDetailsOverlay.md) for the full spec. Rendered when `?film=<id>` is set. Props: `film`, `onClose`. Uses `document.startViewTransition` for play-CTA crossfade.
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

### Hero modes (idle / searching / filtering)

- [ ] State: `[heroMode, heroMode]` derived from `filterOpen`, `searchFocused`, `searching`. `heroMode = filterOpen ? "filtering" : (searchFocused || searching ? "searching" : "idle")`
- [ ] `.heroActive` class applied when `heroMode !== "idle"` — visual changes:
  - [ ] `borderRadius: 0` (hero loses rounded corners; becomes flush with page edges)
  - [ ] `backgroundColor: colorBg0` (dark hero reads as continuous with page background, no visible border)
- [ ] `heroPanelBg` (dark backdrop + dot-grid + radial glow) rendered when `heroMode !== "idle"`, positioned `absolute inset: 0 pointerEvents: none`
  - [ ] `backgroundImage: radial-gradient(ellipse 92% 88% at 50% 48%, #000 55%, transparent 100%)` — soft radial mask that fades the dot grid + green glow into transparency at the edges
  - [ ] Rationale: dissolve the hero's visual edge into the page background when in search or filter mode
- [ ] Hero body conditionally renders:
  - **idle mode:** greeting eyebrow + 3D-tilted greeting text + slide dots (existing behavior)
  - **searching mode:** `<SearchSlide ... />` component
  - **filtering mode:** `<FilterSlide ... />` component
- [ ] `searchBarFocused` class applied when `searchFocused || heroMode !== "idle"` (bumps gradient alpha from 0.42 to 0.7)

### SearchSlide component (hero body, searching mode)

- [ ] `slidePanel`: flex column, `rowGap: 20px`, `fontFamily: fontMono`, `paddingTop: 12px`, `flexGrow: 1` (push actions down)
- [ ] Eyebrow: Mono 11px / `letterSpacing: 0.22em` / uppercase / green. Text: `"· search"` (no query) or `"· query · {resultCount} result(s)"` (with query) + if filters active: `" · "` + `<span slideEyebrowAccent>` (white) `"{activeFilterCount} filter(s)"`
- [ ] Prompt row: flex `alignItems: baseline columnGap: 16px`, Mono **56px** / `lineHeight: 1`
  - [ ] Caret (`slidePromptCaret`): green `">"`, Mono weight
  - [ ] Text (`slidePromptText`): white, `display: inline-flex alignItems: center columnGap: 4px minHeight: 1em overflowX: hidden whiteSpace: nowrap`. Renders trimmed query if present
  - [ ] Cursor (`slidePromptCursor`): green block (`width: 12px height: 0.85em`), glowing shadow, pulsing animation 1.05s ease-in-out. Always visible in searching mode.
- [ ] Status row: Mono 12px / `letterSpacing: 0.06em` / `colorTextDim`, flex wrap `columnGap: 10px rowGap: 6px`
  - [ ] With query: `"{resultCount} of {totalMatched} match(es) · {profilesMatched} profile(s)"` + if filtered: `" · "` + `<span slideStatusAccent>` (green) `"filtered ({activeFilterCount})"`
  - [ ] No query: `<span slideStatusHint>` (italic `colorTextMuted`) `"type to search films, directors, genres"`
  - [ ] Separators: `<span slideStatusSep>` (dim) `"·"`
- [ ] Actions row: `marginTop: auto`, flex `alignItems: center columnGap: 20px paddingTop: 16px flexWrap: wrap`
  - [ ] Primary button (`slidePrimary`): `"[F] Filter"`, green underlined text, Mono 13px / `letterSpacing: 0.18em` / uppercase, `textDecorationColor: colorGreen textUnderlineOffset: 5px textDecorationThickness: 1px`. Hover: white. `onClick={onOpenFilter}`
  - [ ] Secondary button (`slideSecondary`): `"[ESC] Clear"`, grey underlined text, Mono 12px / `letterSpacing: 0.18em` / uppercase. Hover: white. `onClick={onClear}`

### FilterSlide component (hero body, filtering mode)

- [ ] `slidePanel`: flex column, `rowGap: 20px`, `fontFamily: fontMono`, `paddingTop: 12px`, `flexGrow: 1`
- [ ] Eyebrow: Mono 11px / `letterSpacing: 0.22em` / uppercase / green. Text: `"· filters"` + if query: `" · {query.trim()}"` + if query and results differ: `" · "` + `<span slideEyebrowAccent>` (white) `"{totalMatched} → {resultCount}"`
- [ ] TUI table (`tuiTable`): flex column, `rowGap: 10px`, Mono 13px, `paddingTop/Bottom: 8px paddingLeft/Right: 16px`, left border 1px `colorBorder`, bg `rgba(20, 24, 22, 0.55)`
  - [ ] Each dimension (resolution, HDR, codec, decade) rendered as `<FilterRow label="..." >` containing 3–4 `<TuiToggle>` buttons
  - [ ] `tuiRow`: CSS grid `gridTemplateColumns: 120px 1fr columnGap: 16px alignItems: center`
    - [ ] `tuiRowLabel`: Mono 11px / `letterSpacing: 0.22em` / uppercase / `colorTextFaint`. Dimension name.
    - [ ] `tuiRowOptions`: flex `flexWrap: wrap columnGap: 16px rowGap: 6px`, houses toggle buttons
  - [ ] `tuiToggle` button: Mono 13px / `letterSpacing: 0.04em`, `aria-pressed={checked}`. `color: colorTextDim` at rest, `colorText` on hover. When checked: `color: colorGreen`. Inline-flex `alignItems: center columnGap: 8px`.
    - [ ] `tuiToggleBox`: Mono, color inherited. Renders `"[x]"` (checked) or `"[ ]"` (unchecked)
    - [ ] Label: filter option (e.g., `"4K"`, `"HDR10"`, `"HEVC"`, `"'90s"`). Special case: HDR `"—"` → label `"SDR"`
  - [ ] Filter constants:
    - [ ] `RESOLUTIONS = ["4K", "1080p", "720p"]`
    - [ ] `HDRS = ["DV", "HDR10", "HDR10+", "—"]`
    - [ ] `CODECS = ["HEVC", "H264", "AV1"]`
    - [ ] `DECADES = [{decade: 1990, label: "'90s"}, {decade: 2000, label: "'00s"}, {decade: 2010, label: "'10s"}, {decade: 2020, label: "'20s"}]`
- [ ] Actions row: `marginTop: auto`, flex `alignItems: center columnGap: 20px paddingTop: 16px flexWrap: wrap`
  - [ ] Primary button (`slidePrimary`): `"[↩] Done"`, green underlined text (same style as SearchSlide). `onClick={onClose}`
  - [ ] Secondary button (`slideSecondary`): `"[⇧⌫] Clear"`, grey underlined text. `disabled={activeFilterCount === 0}`. When disabled: `opacity: 0.35 cursor: not-allowed`. `onClick={onClearFilters}` (resets all filters to empty Sets)
  - [ ] Hint (`slideHint`): `marginLeft: auto`, Mono 10px / `letterSpacing: 0.12em` / `colorTextFaint` / uppercase. Text: `"{profiles.length} libraries · {totalMatched} matches before filters"`
- [ ] Filter state and application:
  - [ ] `Filters` type: `{ resolutions: Set<Resolution>, hdrs: Set<Hdr>, codecs: Set<Codec>, decades: Set<number> }`
  - [ ] `activeFilterCount = resolutions.size + hdrs.size + codecs.size + decades.size`
  - [ ] `searchResults = applyFilters(queryMatched, filters)` — filters apply on top of query matches, never broaden
  - [ ] `applyFilters` excludes films that don't match all active filter dimensions (see "Filter application" section above)
  - [ ] `toggleSetItem<T>(set: Set<T>, item: T)` helper: add if not present, remove if present
  - [ ] `clearAll()` helper: resets `search`, `filters`, `filterOpen`, `searchFocused` simultaneously
- [ ] ESC keybind:
  - [ ] When `heroMode !== "idle"`: attach window keydown listener
  - [ ] If `filterOpen === true`: `setFilterOpen(false)`
  - [ ] Else: `clearAll()`

### Search bar (inside hero)

- [ ] `searchBar`: `position: absolute`, `top: calc(headerHeight + 24px)`, `right: 32px`, `zIndex: 3`, `width: 320px`, `display: flex`, `alignItems: center`, `columnGap: 10px`, `paddingTop/Bottom: 8px`, `paddingLeft: 16px`, `paddingRight: 12px`
- [ ] `searchBar` background: `linear-gradient(90deg, rgba(20,28,24,0) 0%, rgba(20,28,24,0.42) 22%, rgba(20,28,24,0.42) 78%, rgba(20,28,24,0) 100%)`, `transitionProperty: background-image`, `transitionDuration: tokens.transition`
- [ ] `searchBarFocused` bumps alpha to 0.7 at 22% and 78% stops (applied via JS `searchFocused` state)
- [ ] `searchIcon`: `<IconSearch>`, `color: colorGreen`, `flexShrink: 0`
- [ ] `searchInputWrap`: `position: relative`, `flexGrow: 1`, `display: flex`, `alignItems: center`, `minWidth: 0`, `height: 20px`
- [ ] `searchInput`: `caretColor: transparent`, `width: 100%`, transparent bg, no border, no outline, Mono 12px, `letterSpacing: 0.06em`, `paddingRight: 12px`, `paddingTop/Bottom/Left: 0`. Placeholder: `colorTextMuted`, `letterSpacing: 0.14em`, uppercase, 10px. `spellCheck={false}`, `autoComplete="off"`, `aria-label="Search the library"`. Placeholder cleared on focus (conditional prop on `placeholder`).
- [ ] `searchMirror`: `position: absolute`, `left: 0`, `top: 50%`, `transform: translateY(-50%)`, `visibility: hidden`, `pointerEvents: none`, `whiteSpace: pre`, Mono 12px, `letterSpacing: 0.06em`. `useEffect([search, searchFocused])` reads `mirrorRef.current.offsetWidth` → `setSearchCaretX`
- [ ] `searchCaret`: rendered when `searchFocused`. `position: absolute`, `top: 50%`, `marginTop: -7px`, `width: 7px`, `height: 14px`, `borderRadius: 1px` all corners, `backgroundColor: colorGreen`, `boxShadow: 0 0 6px colorGreen, 0 0 14px colorGreenGlow`. Pulsing keyframe: 0%/100% `opacity:1 scaleY(1)`, 50% `opacity:0.25 scaleY(0.86)`, 1.05s ease-in-out infinite. Positioned via `style={{ left: searchCaretX + "px" }}`
- [ ] `searchClear`: 20×20 button, `<IconClose 12×12>`, `aria-label="Clear search"`, shown when `searching || activeFilterCount > 0`. Click: `clearAll()` (resets query + filters + focus)
- [ ] `onBlur` clears `searchFocused` after 120ms `window.setTimeout` (so clicks on the clear button register first)
- [ ] State variables: `[search, setSearch]`, `[searchFocused, setSearchFocused]`, `[filterOpen, setFilterOpen]`, `[filters, setFilters]`
- [ ] Derived values: `trimmedQuery = search.trim().toLowerCase()`, `searching = trimmedQuery.length > 0`, `heroMode = filterOpen ? "filtering" : (searchFocused || searching ? "searching" : "idle")`, `activeFilterCount = filtersActive(filters)`
- [ ] `queryMatched`: all films whose title/filename/director/genre (case-insensitive) includes `trimmedQuery`. Recomputed by `useMemo([trimmedQuery])`
- [ ] `searchResults = applyFilters(queryMatched, filters)`. Recomputed by `useMemo([queryMatched, filters])`
- [ ] When `heroMode === "idle"` and `trimmedQuery.length === 0` → rows section renders three default row components
- [ ] When `heroMode === "searching"` with results found → `searchResults` flex column `rowGap: 16px` containing `rowHeader` (`"Results · {N}"`) + `searchGrid` (`display: grid gridTemplateColumns: repeat(auto-fill, 200px) justifyContent: start columnGap: 16px rowGap: 24px`) with `<FilmTile>` per result
- [ ] When `heroMode === "searching"` with no results → `<div noResults>` (Mono 12px / `letterSpacing: 0.18em` / uppercase / `colorTextMuted` / `textAlign: center` / `paddingTop/Bottom: 40px`) with text `"No films match "{search.trim()}""` 
- [ ] Query filter logic: title / filename / director / genre (all `.toLowerCase()`) includes `trimmedQuery`
- [ ] Production: replace client-side query/filter with backend search query / Relay refetch. Wire `?q=<query>` URL param for shareability.

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

- [x] Designed in `design/Release` lab — hero+rows+overlay layout (2026-05-01, PR #46 commit 04ea22b). Search bar between hero and rows added (787f136). Page-level padding + hero downsized to 340px card + spacing tightened (9cc6d48). Hero made full-bleed (5301df6). Hero shrunk to 280px; dots stack under greeting (45d1097). Hero grown to 300px; search bar refactored to centered pill (773681e). Search bar moved inside hero top-right; gradient strip style; custom green caret + mirror span (6fd44e4). Hero height → 420px; search grid restructured; `.overlayPoster` gets `viewTransitionName: "film-backdrop"`; Play CTA → `<button onClick={playWithTransition}>` (73a9cca). Hero changed to `75vh` + `borderRadius: 6px` + page inset (40px); RAF-eased row scroll (720ms easeInOutCubic); three rows (Continue Watching + New Releases + Watchlist); greeting eyebrow line; heroBody `paddingLeft/Right: 44px`, `paddingBottom: 20px`; `searchGrid` → 200px columns; overlay Back pill (top-left) added alongside Close button (907c331). PR #46 on `feat/release-design-omdb-griffel`, merged to main 2026-05-01. **Latest (2026-05-02, PR #48):** hero modes (idle / searching / filtering); SearchSlide + FilterSlide TUI panels; `heroPanelBg` dark backdrop with dot-grid + subtle green glow; ESC keybind for mode exit; filter dimensions (resolution / HDR / codec / decade) with checkbox toggles; **active-mode visual updates: `.heroActive` now sets `borderRadius: 0` (flush with page edges) + `backgroundColor: colorBg0` (continuous with page bg); `heroPanelBg` radial mask: `radial-gradient(ellipse 92% 88% at 50% 48%, #000 55%, transparent 100%)` fades dot grid + green glow into transparency at edges**.
- [ ] Production implementation
