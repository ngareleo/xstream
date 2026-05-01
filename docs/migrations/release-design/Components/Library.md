# Library (page)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec updated: 2026-05-01 (PR #46, commit 73a9cca) — hero height 300 → 420px; greeting marginTop 12 → 28px; search results replaced by vertical CSS grid; `.overlayPoster` gains `viewTransitionName: "film-backdrop"`; Play CTA changed from `<Link>` to `<button onClick={playWithTransition}>` wrapping `document.startViewTransition`. Prior update (6fd44e4) search bar moves inside hero (top-right, absolute), gradient strip replaces bordered card, custom pulsing green caret + mirror span, `caretColor: transparent`. Prior update (773681e) hero grows to 300px; heroBody paddingTop calc(headerHeight + 32px), paddingBottom 24, paddingLeft/Right 56, rowGap 20; search bar becomes centered pill (width min(420px, 90%), tighter paddings, smaller font). Prior update (45d1097) hero shrinks to 280px and heroBody stacks greeting + dots with `rowGap: 18px` (no more flex space-between). Prior update (5301df6) made hero full-bleed (no border/radius). Prior update (9cc6d48) added page padding + 340px bordered card. Prior update (787f136) added search bar. Prior update (04ea22b) replaced grid/filter/DetailPane with hero+rows+overlay.

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

### Hero (420px tall, full-bleed)

Same pattern as the Profiles hero, tuned larger. The hero is now **full-bleed** — no border, no border-radius, no page-level horizontal padding. It starts at viewport y=0 and extends edge-to-edge so the floating glass header blurs the poster image behind it ("poster behind glass"). `.page` has no `paddingTop`, `paddingLeft`, or `paddingRight`.

- **Slide deck.** Four canonical poster images rendered simultaneously (`position: absolute, inset: 0`) inside `heroSlides`. Each carries `heroImg` (`opacity: 0`, `filter: grayscale(1) brightness(0.55)`, `transition: opacity 0.9s ease`). Active slide gets `heroImgActive` (`opacity: 1`); outgoing slide gets `heroImgFading` (`opacity: 0`) during the crossfade so both transitions overlap.
- **Ken Burns.** Every `heroImg` has a looping animation: `scale(1.06) translate(-0.8%, -0.6%)` → `scale(1.06) translate(0.8%, 0.6%)` over 20s, ease-in-out, alternate, infinite.
- **No border or radius.** `overflow: hidden` is still present (clips poster to the hero rectangle), but there is no `borderRadius` and no `border` rule.
- **Edge-fade overlay (`heroEdgeFade`).** Same two-gradient pattern as Profiles (top+bottom + right dark edges), with `backgroundSize: 100% 115%, 115% 100%`. Drift animation cycles `backgroundPosition` over 22s (ease-in-out, infinite): `0% 0%, 0% 0%` → `0% 100%, 100% 0%` → back.
- **Bottom-fade overlay (`heroBottomFade`).** `position: absolute` overlay that blends the hero into the rows section below. Two-gradient: bottom dark fade (`transparent 50%`, `rgba(5,7,6,0.8) 88%`, `colorBg0 100%`) + left dark fade (`colorBg0 0%`, `rgba(5,7,6,0.85) 22%`, `transparent 55%`). Hero has no visible hard bottom edge.
- **Grain layer.** Shared `.grain-layer` utility class.
- **Hero body (`heroBody`).** Absolute, inset 0, **`paddingTop: calc(${tokens.headerHeight} + 32px)`** (greeting text 32px below the header's bottom edge — 84px computed at the 52px header height), `paddingBottom: 24px`, `paddingLeft: 56px`, `paddingRight: 56px`, flex column with **`rowGap: 20px`** (greeting block stacks above dots — no `justify-content: space-between`, so dots sit right under the title rather than pinned to the hero bottom), `z-index: 2`:
  - **Greeting text:** `"Tonight's library."` Anton 64px / `colorText` / `lineHeight: 0.92` / `marginTop: 28px`.
  - **Slide dots:** 4 `<button type="button">` in the bottom-left of the hero body. Active: 26×3px, `colorGreen`. Inactive: 8×3px, `colorTextFaint`. `width` + `background-color` transition at `transitionSlow`. Each button: `aria-label="Show <film.title>"`.
- **Cycle timing:** `HERO_INTERVAL_MS` = 7 000ms, `HERO_FADE_MS` = 700ms (vs. Profiles' 6 000ms / 600ms).
- **Canonical poster order:** `["oppenheimer", "barbie", "nosferatu", "civilwar"]`. Falls back to `films.slice(0, 4)` if any id is absent.

### Search bar (inside hero, top-right)

Lifted into the hero block, rendered between `grain-layer` and `heroBody`. Present in the dash view only (hidden when the overlay is open). Position: **`position: absolute`, `top: calc(${tokens.headerHeight} + 24px)`, `right: 32px`, `zIndex: 3`, `width: 320px`** — opposite corner from the bottom-left greeting.

- **Input container (`searchBar`):** no border, no border-radius, no solid background. Instead a horizontal gradient strip: `backgroundImage: linear-gradient(90deg, rgba(20,28,24,0) 0%, rgba(20,28,24,0.42) 22%, rgba(20,28,24,0.42) 78%, rgba(20,28,24,0) 100%)`. `transition: background-image 0.15s`.
- **Focused state (`searchBarFocused`):** bumps gradient mid-stop alpha to 0.7. Applied on `:focus-within` via JS state (`searchFocused`).
- **Input wrap (`searchInputWrap`):** relative container, `flex: 1`, `height: 20px`. Houses the real input, the hidden mirror span, and the custom caret span.
- **Input (`searchInput`):** `caretColor: transparent` (hides the native browser caret). JetBrains Mono `fontSize: 12px`, `letterSpacing: 0.06em`. Placeholder: `fontSize: 10px`, `letterSpacing: 0.14em`, `textTransform: uppercase`. `paddingRight: 12px` (leaves room for the clear button).
- **Mirror span (`searchMirror`):** `position: absolute`, `visibility: hidden`, Mono 12px, `letterSpacing: 0.06em`, `whiteSpace: pre`. Receives the same text as the input. Used only to measure caret X via `mirrorRef.current.offsetWidth`. A `useEffect` recomputes `searchCaretX` from `mirrorRef.current.offsetWidth` whenever `search` or `searchFocused` changes.
- **Custom caret span (`searchCaret`):** rendered inside `searchInputWrap` only when `searchFocused` is true. `position: absolute`, `top: 50%`, `7×14px`, green fill, `boxShadow: 0 0 6px green, 0 0 14px greenGlow`. Pulsing keyframe: opacity + scaleY alternate at 1.05s ease-in-out infinite.
- **Clear button:** `✕` icon button, shown when query is non-empty. Clicking clears the query and resets to the two-row view.
- **Empty state:** when query is empty → show the two default rows (Continue Watching + Watchlist).
- **Results state:** when query is non-empty → replace both rows with a vertical `<div>` containing the row header (`"Results · {N}"`, JetBrains Mono 9px / faint) and a `searchGrid` below it. `searchGrid` is a CSS grid: `gridTemplateColumns: repeat(auto-fill, 180px)`, `justifyContent: start`, `columnGap: 16px`, `rowGap: 24px`. The existing `.tile` (180px wide) is reused. Filtered against `title`, `filename`, `director`, and `genre` across all `films`. The container (`searchResults`) is a flex column with `rowGap: 16px` between the header and the grid.
- **No-match state:** when query is non-empty but zero results → `"No films match"` empty-state message.
- All filtering is client-side against the in-memory `films` array. Production: replace with a backend search query (Relay refetch or subscription).

### Row section (below search bar)

Two horizontal-scroll rows (shown when search query is empty). `rowsScroll`: `paddingTop: 16px`, **`paddingLeft: 32px`, `paddingRight: 32px`**, `paddingBottom: 60px`, `rowGap: 28px` (between the two rows). Shared row anatomy:

- **`row`:** flex column, `rowGap: 12px` (between label and track).
- **`rowHeader`:** JetBrains Mono 11px / 0.22em / uppercase / `colorTextDim`. No additional horizontal padding — `rowsScroll`'s 32px padding provides the inset.
- **`rowTrack`:** `display: flex`, `columnGap: 16px`, `overflow-x: auto`, scrollbar hidden. No additional horizontal padding — `rowsScroll` handles the inset.

#### "Continue watching" row

- Tiles from films where `progress` is defined (mock: Oppenheimer 42%, Nosferatu 73%, Civil War 18%).
- **Scroll teaser:** on mount, after 700ms → `el.scrollTo({ left: 240, behavior: "smooth" })`; after 2 200ms → `el.scrollTo({ left: 0, behavior: "smooth" })`. This hints to the user that the track extends beyond the viewport. Both timers are cleaned up on unmount.
- **Tile:** 180px wide, 2:3 aspect ratio poster. 3px green progress bar at the bottom of the poster (width = `${progress}%`).

#### "Watchlist" row

- Tiles from films where `progress` is absent (mock: Barbie — no progress).
- No auto-scroll, no progress bars.

### Tile (both rows)

- 180px wide, `aspect-ratio: 2/3`, `overflow: hidden`, `border-radius: 2px`, `cursor: pointer`.
- Poster image fills the tile (`object-fit: cover`).
- Clicking a tile calls `openFilm(id)` → `setSearchParams({ film: id })`.

## Visual — overlay view (when `?film=<id>` is set)

`<FilmDetailsOverlay>` is rendered via `position: absolute, inset: 0` within the Library page container (not the AppShell). It covers the full page area without affecting the shell chrome.

### Background

- Full-color (not grayscale) poster fills the overlay background (`object-fit: cover`, `position: absolute, inset: 0`). The `.overlayPoster` rule carries **`viewTransitionName: "film-backdrop"`** — this value must stay in sync with Player's `.backdrop` rule (see [cross-cutting View Transitions note](#view-transitions-contract) below).
- Slow Ken Burns animation on the background image: 26s, ease-in-out, alternate, infinite.
- **Two-stack gradient overlay** (on top of the poster, below the content):
  - Vertical bottom-fade: `transparent` at 25–38%, `rgba(dark, 1)` from 72%, into page background color at 100%.
  - Horizontal left-fade: `rgba(dark, ~0.85)` on the left to `transparent` at 35%.

### Close button

- 40×40 circular button, top-right corner. `<IconClose>`, `aria-label="Close details"`.
- Clicking calls `closeFilm()` → `setSearchParams({})` (clears `?film`).

### Content stack (bottom-left)

`position: absolute, bottom: 0, left: 0`, `padding: 48px 56px`, `max-width: 720px`.

From top to bottom:

1. **Chips row:** resolution chip + (if HDR) HDR chip + codec chip + (if IMDb rating present) IMDb rating chip. Same green pill style used elsewhere.
2. **Title:** Anton 72px / `colorText` / `lineHeight: 0.9`.
3. **Meta line:** `{year} · {genre} · {duration}` in JetBrains Mono, muted.
4. **Director line:** `"Directed by {director}"` — same Mono muted style.
5. **Plot paragraph:** Inter / `colorTextDim` / `font-size: 14px` / `line-height: 1.6` / `max-width: 560px`.
6. **Play CTA:** `<button onClick={playWithTransition}>` styled as a green filled button. `playWithTransition` calls `document.startViewTransition(() => navigate(\`/player/${film.id}\`))` when the View Transitions API is available, falling back to `navigate(...)` directly. The `<Link>` previously used here is replaced — navigation happens programmatically so the transition wraps the route change.
7. **Filename:** JetBrains Mono, `colorTextFaint`, `font-size: 10px`.

## Behaviour

### `openFilm(id)`

`setSearchParams({ film: id })` — sets `?film=<id>`.

### `closeFilm()`

`setSearchParams({})` — clears params, returns to dash view.

### Hero cycling

Same state machine as Profiles:

- `heroIndex: number` + `heroFading: boolean`.
- `setInterval` every 7 000ms. On tick: `setHeroFading(true)` → after 700ms: advance index + `setHeroFading(false)`.
- `goToHero(idx)`: if `idx === heroIndex`, no-op; else `setHeroFading(true)` → after 350ms (half of `HERO_FADE_MS`): set index + `setHeroFading(false)`.
- Effect dependency `[heroFilms.length]`. Both the interval and the inner timeout ref are cleaned up on unmount.

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

## TODO(redesign)

- `?q=<query>` URL param is not yet wired in the lab — the search bar filters in local state only. Production should write `?q=` to the URL so the filtered view is shareable/bookmarkable. When wired, the Library page should also read an incoming `?q=` on mount and pre-populate the input.
- The scroll teaser timings (700ms / 2 200ms) are hardcoded; consider extracting to a constant.
- Production: "Continue watching" and "Watchlist" derivation must come from a backend query (progress field on the job/film relation) not mock data.
- Search bar: confirm exact container width and whether the input has a visible background fill or is fully transparent.

## Porting checklist (`client/src/pages/Library/`)

### Search bar

- [ ] Search container is **inside the hero block** (between `grain-layer` and `heroBody`), not between hero and rows
- [ ] `searchBar`: `position: absolute`, `top: calc(${tokens.headerHeight} + 24px)`, `right: 32px`, `zIndex: 3`, `width: 320px` — no border, no border-radius, no solid background
- [ ] `searchBar` background: horizontal gradient strip `linear-gradient(90deg, rgba(20,28,24,0) 0%, rgba(20,28,24,0.42) 22%, rgba(20,28,24,0.42) 78%, rgba(20,28,24,0) 100%)`, `transition: background-image 0.15s`
- [ ] `searchBarFocused` state bumps gradient mid-stop alpha to 0.7 (applied via JS `searchFocused` state, not pure CSS `:focus-within`)
- [ ] `searchInputWrap`: relative, `flex: 1`, `height: 20px` — contains input + mirror span + caret span
- [ ] `searchInput`: `caretColor: transparent`, Mono 12px, `letterSpacing: 0.06em`, `paddingRight: 12px`; placeholder 10px, `letterSpacing: 0.14em`, uppercase
- [ ] `searchMirror` span: `position: absolute`, `visibility: hidden`, Mono 12px, `letterSpacing: 0.06em`, `whiteSpace: pre`; `useEffect` reads `mirrorRef.current.offsetWidth` to set `searchCaretX` whenever `search` or `searchFocused` changes
- [ ] `searchCaret` span: rendered only when `searchFocused`; `position: absolute`, 7×14px, green fill, pulsing opacity+scaleY keyframe at 1.05s ease-in-out infinite; `boxShadow: 0 0 6px green, 0 0 14px greenGlow`
- [ ] Clear (✕) button appears when query is non-empty; click resets to two-row view
- [ ] Empty query → two default rows (Continue Watching + Watchlist)
- [ ] Non-empty query → vertical layout: `searchResults` flex column (`rowGap: 16px`) containing row header (`"Results · {N}"`, Mono 9px / faint) + `searchGrid` CSS grid (`gridTemplateColumns: repeat(auto-fill, 180px)`, `justifyContent: start`, `columnGap: 16px`, `rowGap: 24px`), filtered by title / filename / director / genre
- [ ] "No films match" empty state when query non-empty and zero results
- [ ] Production: replace client-side filter with backend search query / Relay refetch

### Dash view — hero

- [ ] `.page`: no padding (full-bleed — page starts at viewport y=0)
- [ ] Hero 420px tall, `overflow: hidden`, no border, no border-radius (full-bleed)
- [ ] `heroSlides` absolute container; all four canonical posters rendered simultaneously
- [ ] Active slide `opacity: 1`; fading slide `heroImgFading` brings to `opacity: 0`; `transition: opacity 0.9s ease`
- [ ] Ken Burns: `scale(1.06) translate(-0.8%, -0.6%)` → `scale(1.06) translate(0.8%, 0.6%)` over 20s, ease-in-out, alternate, infinite
- [ ] `heroEdgeFade` two-gradient overlay with 22s drift cycle on `backgroundPosition`
- [ ] `heroBottomFade` overlay — gradient to page bg at bottom edge, no hard seam into rows
- [ ] `heroBody`: `paddingTop: calc(${tokens.headerHeight} + 32px)` (84px), `paddingBottom: 24px`, `paddingLeft: 56px`, `paddingRight: 56px`, flex column `rowGap: 20px` (no space-between)
- [ ] Grain layer
- [ ] Greeting text `"Tonight's library."` in Anton 64px, `lineHeight: 0.92`, `marginTop: 28px`
- [ ] 4 slide dots bottom-left: active 26×3px green / inactive 8×3px faint, `width`+`color` transitioning
- [ ] `useEffect` interval (7 000ms) + inner timeout (700ms); both refs cleaned up on unmount
- [ ] `goToHero(idx)` — half-duration (350ms) manual crossfade; no-op if already active

### Dash view — rows

- [ ] `rowsScroll`: `paddingTop: 16px`, `paddingLeft: 32px`, `paddingRight: 32px`, `paddingBottom: 60px`, `rowGap: 28px` (between the two rows)
- [ ] `row`: flex column, `rowGap: 12px` (between header label and track)
- [ ] `rowHeader`: Mono 11px / 0.22em / uppercase / `colorTextDim`; no additional horizontal padding (`rowsScroll` provides the 32px inset)
- [ ] `rowTrack`: `display: flex`, `columnGap: 16px`, scrollbar hidden; no additional horizontal padding
- [ ] Scroll teaser on mount: 700ms delay → scroll right 240px (smooth), 2 200ms delay → scroll back to 0 (smooth); timers cleaned up on unmount
- [ ] Tile: 180px wide, 2:3 aspect, poster fill, `border-radius: 2px`
- [ ] Progress bar: 3px green bar at poster bottom, `width = progress%`
- [ ] "Watchlist" section label + row; no auto-scroll, no progress bars
- [ ] Tile click → `setSearchParams({ film: id })`

### Overlay view

- [ ] `FilmDetailsOverlay`: `position: absolute, inset: 0` (page-scoped, not shell-scoped)
- [ ] Full-color background poster with 26s Ken Burns, alternate, infinite; `.overlayPoster` carries `viewTransitionName: "film-backdrop"` (must match Player `.backdrop`)
- [ ] Vertical bottom-fade gradient: transparent 25–38%, opaque dark 72–100%
- [ ] Horizontal left-fade gradient: dark left to transparent at 35%
- [ ] Close button: 40×40 circle, top-right, `<IconClose>`, `aria-label="Close details"`, clears `?film`
- [ ] Content stack bottom-left, `max-width: 720px`, `padding: 48px 56px`
- [ ] Chips row: resolution / HDR / codec / IMDb rating
- [ ] Title: Anton 72px, `lineHeight: 0.9`
- [ ] Meta line: `{year} · {genre} · {duration}` in Mono muted
- [ ] Director line in Mono muted
- [ ] Plot paragraph: Inter 14px / `line-height: 1.6` / `colorTextDim` / `max-width: 560px`
- [ ] Play CTA: green filled `<button onClick={playWithTransition}>` — wraps `document.startViewTransition(() => navigate(...))` with plain `navigate` fallback; NOT a `<Link>`
- [ ] Filename: Mono 10px / `colorTextFaint`

### Data + backend

- [ ] "Continue watching" derived from films with `progress` defined (backend: progress field on job/film relation)
- [ ] "Watchlist" derived from films without `progress`
- [ ] `?q=<query>` wired from AppHeader → filter both rows by title/filename/genre
- [ ] Replace mock derivation with Relay query

## Status

- [x] Designed in `design/Release` lab — hero+rows+overlay layout (2026-05-01, PR #46 commit 04ea22b). Search bar between hero and rows added (2026-05-01, PR #46 commit 787f136). Page-level padding + hero downsized to 340px card + body/greeting/search/row spacing tightened (2026-05-01, PR #46 commit 9cc6d48). Hero made full-bleed (no border/radius), 340px→380px, heroBody paddingTop `calc(headerHeight + 4px)`, searchBar marginLeft/Right 32px, rowsScroll paddingLeft/Right 32px, page padding removed (2026-05-01, PR #46 commit 5301df6). Hero shrunk to 280px and dots stacked under greeting via rowGap (no space-between) so first carousel fills the gap (2026-05-01, PR #46 commit 45d1097). Hero grown to 300px, heroBody paddingTop calc(headerHeight+32px), paddingLeft/Right 56px, paddingBottom 24px, rowGap 20px; search bar became centered pill (width min(420px,90%), tighter paddings, smaller font) (2026-05-01, PR #46 commit 773681e). Search bar moved inside hero top-right (position: absolute, top: calc(headerHeight+24px), right: 32px, width: 320px); bordered-card style replaced by horizontal gradient strip with focused alpha bump; native caret hidden (`caretColor: transparent`), custom pulsing green caret block + hidden mirror span for caret-X measurement introduced (2026-05-01, PR #46 commit 6fd44e4). Hero height 300→420px; greeting marginTop 12→28px; search results restructured as vertical CSS grid (searchResults flex column + searchGrid); `.overlayPoster` gains `viewTransitionName: "film-backdrop"`; Play CTA changed from `<Link>` to `<button onClick={playWithTransition}>` with startViewTransition wrapping; `goBackWithTransition` symmetric path introduced on Player side (2026-05-01, PR #46 commit 73a9cca). Grid/filter/DetailPane layout superseded. PR #46 on `feat/release-design-omdb-griffel`, not yet merged to main.
- [ ] Production implementation
