# Library (page)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec updated: 2026-05-01 (PR #46, commit 04ea22b) — full rewrite. Prior spec described a grid/filter/DetailPane layout that has been replaced by a hero+rows dash view with a full-bleed film-details overlay.

## Files

- `design/Release/src/pages/Library/Library.tsx`
- `design/Release/src/pages/Library/Library.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/pages/Library/`

## Purpose

Landing page for the film catalogue (`/`). Two URL-driven states: **dash view** (hero + horizontal-scroll rows) and **overlay view** (full-bleed film-details overlay). A tile click sets `?film=<id>`; clearing it returns to the dash.

## URL state

Single param, read/write via `useSearchParams`:

- `?film=<id>` — overlay open, showing that film's details. Absent → dash view.

No profile filter, no search query, no view-mode toggle in this layout.

## Visual — dash view

### Hero (420px tall)

Same pattern as the Profiles hero, tuned larger:

- **Slide deck.** Four canonical poster images rendered simultaneously (`position: absolute, inset: 0`) inside `heroSlides`. Each carries `heroImg` (`opacity: 0`, `filter: grayscale(1) brightness(0.55)`, `transition: opacity 0.7s ease`). Active slide gets `heroImgActive` (`opacity: 1`); outgoing slide gets `heroImgFading` (`opacity: 0`) during the crossfade so both transitions overlap.
- **Ken Burns.** Every `heroImg` has a looping animation: `scale(1.08) translate(-1%, -0.8%)` → `scale(1.08) translate(1%, 0.8%)` over 20s, ease-in-out, alternate, infinite.
- **Edge-fade overlay (`heroEdgeFade`).** Same two-gradient pattern as Profiles (top+bottom + right dark edges), with `backgroundSize: 100% 115%, 115% 100%`. Drift animation cycles `backgroundPosition` over 22s (ease-in-out, infinite): `0% 0%, 0% 0%` → `0% 100%, 100% 0%` → back.
- **Bottom-fade overlay (`heroBottomFade`).** Additional `position: absolute` overlay at the bottom edge, `background: linear-gradient(to top, <page-bg-color>, transparent)`. Bleeds the hero seamlessly into the rows section below — the hero has no visible hard bottom edge.
- **Left-side gradient (`heroGradient`).** Same as Profiles: `linear-gradient(90deg, colorBg0 0%, rgba(5,7,6,0.85) 30%, transparent 65%)`.
- **Grain layer.** Shared `.grain-layer` utility class.
- **Hero body (`heroBody`).** Absolute, inset 0, `padding: 36px 44px`, flex column `justify-content: space-between`, `z-index: 2`:
  - **Greeting text:** `"Tonight's library."` Anton 84px / `colorText` / `lineHeight: 0.9`.
  - **Slide dots:** 4 `<button type="button">` in the bottom-left of the hero body. Active: 22×3px, `colorGreen`. Inactive: 6×3px, `colorTextFaint`. `width` + `background-color` transition at `transitionSlow`. Each button: `aria-label="Show <film.title>"`.
- **Cycle timing:** `HERO_INTERVAL_MS` = 7 000ms, `HERO_FADE_MS` = 700ms (vs. Profiles' 6 000ms / 600ms).
- **Canonical poster order:** `["oppenheimer", "barbie", "nosferatu", "civilwar"]`. Falls back to `films.slice(0, 4)` if any id is absent.

### Row section (below hero)

Two horizontal-scroll rows. Shared row anatomy:

- Track: `display: flex`, `gap: 12px`, `overflow-x: auto`, `padding: 0 28px`. Scrollbar hidden.
- Section label above each row: JetBrains Mono 9px / 0.28em / `colorTextFaint`, `padding: 0 28px`.

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

- Full-color (not grayscale) poster fills the overlay background (`object-fit: cover`, `position: absolute, inset: 0`).
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
6. **Play CTA:** `<Link to="/player/:id">` styled as a green filled button.
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

## TODO(redesign)

- `?q=<query>` URL param is not yet wired — AppHeader search submits to `/library?q=` but the row filter does not consume it. Needed when production wires live search.
- The scroll teaser timings (700ms / 2 200ms) are hardcoded; consider extracting to a constant.
- Production: "Continue watching" and "Watchlist" derivation must come from a backend query (progress field on the job/film relation) not mock data.

## Porting checklist (`client/src/pages/Library/`)

### Dash view — hero

- [ ] Hero 420px tall, `overflow: hidden`
- [ ] `heroSlides` absolute container; all four canonical posters rendered simultaneously
- [ ] Active slide `opacity: 1`; fading slide `heroImgFading` brings to `opacity: 0`; `transition: opacity 0.7s ease`
- [ ] Ken Burns: `scale(1.08) translate(-1%, -0.8%)` → `scale(1.08) translate(1%, 0.8%)` over 20s, ease-in-out, alternate, infinite
- [ ] `heroEdgeFade` two-gradient overlay with 22s drift cycle on `backgroundPosition`
- [ ] `heroBottomFade` overlay — gradient to page bg at bottom edge, no hard seam into rows
- [ ] `heroGradient` left-side linear-gradient for text legibility
- [ ] Grain layer
- [ ] Greeting text `"Tonight's library."` in Anton 84px
- [ ] 4 slide dots bottom-left: active 22×3px green / inactive 6×3px faint, `width`+`color` transitioning
- [ ] `useEffect` interval (7 000ms) + inner timeout (700ms); both refs cleaned up on unmount
- [ ] `goToHero(idx)` — half-duration (350ms) manual crossfade; no-op if already active

### Dash view — rows

- [ ] "Continue watching" section label in Mono 9px / 0.28em / faint
- [ ] Horizontal scroll track: `display: flex`, gap 12, scrollbar hidden, `padding: 0 28px`
- [ ] Scroll teaser on mount: 700ms delay → scroll right 240px (smooth), 2 200ms delay → scroll back to 0 (smooth); timers cleaned up on unmount
- [ ] Tile: 180px wide, 2:3 aspect, poster fill, `border-radius: 2px`
- [ ] Progress bar: 3px green bar at poster bottom, `width = progress%`
- [ ] "Watchlist" section label + row; no auto-scroll, no progress bars
- [ ] Tile click → `setSearchParams({ film: id })`

### Overlay view

- [ ] `FilmDetailsOverlay`: `position: absolute, inset: 0` (page-scoped, not shell-scoped)
- [ ] Full-color background poster with 26s Ken Burns, alternate, infinite
- [ ] Vertical bottom-fade gradient: transparent 25–38%, opaque dark 72–100%
- [ ] Horizontal left-fade gradient: dark left to transparent at 35%
- [ ] Close button: 40×40 circle, top-right, `<IconClose>`, `aria-label="Close details"`, clears `?film`
- [ ] Content stack bottom-left, `max-width: 720px`, `padding: 48px 56px`
- [ ] Chips row: resolution / HDR / codec / IMDb rating
- [ ] Title: Anton 72px, `lineHeight: 0.9`
- [ ] Meta line: `{year} · {genre} · {duration}` in Mono muted
- [ ] Director line in Mono muted
- [ ] Plot paragraph: Inter 14px / `line-height: 1.6` / `colorTextDim` / `max-width: 560px`
- [ ] Play CTA: green filled `<Link to="/player/:id">`
- [ ] Filename: Mono 10px / `colorTextFaint`

### Data + backend

- [ ] "Continue watching" derived from films with `progress` defined (backend: progress field on job/film relation)
- [ ] "Watchlist" derived from films without `progress`
- [ ] `?q=<query>` wired from AppHeader → filter both rows by title/filename/genre
- [ ] Replace mock derivation with Relay query

## Status

- [x] Designed in `design/Release` lab — hero+rows+overlay layout (2026-05-01, PR #46 commit 04ea22b). Grid/filter/DetailPane layout superseded.
- [ ] Production implementation
