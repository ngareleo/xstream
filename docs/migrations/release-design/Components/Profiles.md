# Profiles (page)

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/pages/Profiles/Profiles.tsx`
- `design/Release/src/pages/Profiles/Profiles.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/pages/Dashboard/`

## Purpose

Landing page (`/`). Profile-tree directory: each library expands to reveal its films; selecting a film opens [`DetailPane`](DetailPane.md) in a drag-resizable right column.

## Visual

### Split-body grid (`splitBody` + `splitBodyOpen`)
- Closed: `gridTemplateColumns: "1fr 0px 0px"`.
- Open: `gridTemplateColumns: \`1fr 4px ${paneWidth}px\`` (overridden inline so the `useSplitResize`-driven width animates smoothly).
- `height: 100%`, `transition: grid-template-columns ${transitionSlow}` (0.25s ease).
- `isResizing` adds `transitionProperty: none` so the drag is jank-free.

### Left column (`leftCol`)
Flex column, `overflow: hidden`, `position: relative`.

### Hero (220px tall)

**Slide deck (`heroSlides`).** All four canonical poster images are rendered simultaneously inside an absolute-inset `heroSlides` container. Each `<Poster>` carries the `heroImg` class (`position: absolute, inset: 0, object-fit: cover, filter: grayscale(1) brightness(0.55), opacity: 0, transition: opacity 0.8s ease`). The active slide gets `heroImgActive` (`opacity: 1`); when a transition is in flight the active slide gets `heroImgFading` (`opacity: 0`) so the outgoing image fades while the incoming one fades in simultaneously.

**Ken Burns pan/scale.** Every `heroImg` carries a looping CSS animation (16s, ease-in-out, alternate, infinite) that drifts between `scale(1.06) translate(-0.8%, -0.6%)` and `scale(1.06) translate(0.8%, 0.6%)`. Each slide is always slightly zoomed and drifting; the crossfade gives the impression of a live panorama.

**Edge-fade overlay (`heroEdgeFade`).** A `pointer-events: none` overlay using two `background-image` gradients — top + bottom dark edge (`rgba(5,7,6,0.55)` top, `rgba(5,7,6,0.78)` bottom) and a right-side dark edge (`rgba(5,7,6,0.55)`). `backgroundSize` is `100% 115%, 115% 100%` (slightly oversized so the animated drift doesn't reveal a gap). The `backgroundPosition` loops on an 18s cycle (ease-in-out, infinite): `0% 0%, 0% 0%` → `0% 100%, 100% 0%` → back, giving the vignette a subtle breathing drift.

**Left-side gradient (`heroGradient`).** `linear-gradient(90deg, ${colorBg0} 0%, rgba(5,7,6,0.85) 30%, transparent 65%)` — hard-darkens the left column for text legibility, independent of the animated edge fade.

**Grain layer.** Shared `.grain-layer` utility class.

**Body block (`heroBody`).** Absolute, inset 0, `padding: 30px 36px`, flex column with `justify-content: space-between`, `z-index: 2`:
  - `greetingEyebrow`: time-of-day greeting + uppercased user name (e.g. `· Good evening, ALEX`). Mono 11px / `colorGreen` / 0.18em.
  - `greeting`: `{totalFilms} films,` line break `quietly indexed.` Anton 56px / `lineHeight: 0.92` / `colorText` / −0.01em.
  - `slideDots`: 4 `<button type="button">` elements. Active: 22×3px, `colorGreen`. Inactive: 6×3px, `colorTextFaint`. Transition on `width` + `background-color` at `transitionSlow`. Each button carries `aria-label="Show <film.title>"`. Click calls `goToHero(i)`.

**Canonical poster order:** `["oppenheimer", "barbie", "nosferatu", "civilwar"]`. Falls back to `films.slice(0, 4)` if any id is absent from mock data.

### Breadcrumb
- Path-style breadcrumb: `~ / media / films` with the leaf in `var(--text)`, others muted.
- Trailing `breadcrumbScanning` chunk: `● scanning {scanningCount} of {profiles.length}` (when any profile is currently scanning).

### Column header (`colHeader`)
- 5-column grid header row: `[chevron] · Profile / File · Match · Size · [actions]`.

### Rows scroll (`rowsScroll`)
- Maps `profiles` to `<ProfileRow>` (subcomponent below).

### Footer
- Sticky bottom row: `{profiles.length} PROFILES · {totalFilms} FILMS · {totalUnmatched} UNMATCHED` + `+ NEW PROFILE` CTA button.

### Resize handle
- Visible only when `paneOpen`. `<div onMouseDown={onResizeMouseDown}>` with `backgroundColor: tokens.colorBorder`, `cursor: col-resize`, `:hover` flips to `tokens.colorGreen`.

## Behaviour

### Hero cycling

`heroFilms` is a stable `useMemo` array built from `HERO_FILM_IDS` (`["oppenheimer", "barbie", "nosferatu", "civilwar"]`).

State: `heroIndex: number` (current active slide, 0-based) + `heroFading: boolean` (crossfade in flight).

**Auto-advance interval.** `setInterval` every `HERO_INTERVAL_MS` (6 000ms). On tick:
1. `setHeroFading(true)` — active slide begins fading out (opacity transition: 0.8s).
2. After `HERO_FADE_MS` (600ms): `setHeroIndex(i => (i + 1) % heroFilms.length)`, `setHeroFading(false)`.
Cleanup clears both the `setInterval` and the inner `setTimeout` ref (`heroFadeTimerRef`). Effect dependency is `[heroFilms.length]`.

**Manual dot click (`goToHero(idx)`).** If `idx === heroIndex`, no-op. Otherwise:
1. `setHeroFading(true)`.
2. After `HERO_FADE_MS / 2` (300ms): `setHeroIndex(idx)`, `setHeroFading(false)`.
Half-duration makes the manual jump feel snappier than an auto-cycle.

### URL pane state
- `?film=<id>` — selected film. `useSearchParams()` reads/writes.
- `openFilm(id)`:
  - If `filmId === id`, clear params (toggle close).
  - Else `setParams({ film: id })`.
- `closePane()` clears params.

### Expansion state
- Local `expandedIds: Set<string>`.
- Initial state pre-expands `profiles[0]` AND the profile containing the selected film (so deep-link to `?film=<id>` opens the right tree branch).
- `toggleProfile(id)` adds/removes from the set.

### Drag-resize
- `useSplitResize` hook returns `paneWidth`, `containerRef`, `onResizeMouseDown`. Inline style on `splitBody` overrides the static `splitBodyOpen` columns when the pane is open.

## Subcomponents

### `ProfileRow` (inline)
- 5-column grid row: chevron · name+path · match-bar · size · actions.
- `padding: 11px 24px`, gap 16, `cursor: pointer`.
- `background: var(--surface)` when expanded.
- Chevron: `<IconChevron>` rotated 90° when expanded with 0.15s transition.
- Name: 13px, `color: var(--text)`. Path: Mono 10px, `color: var(--text-muted)` / 0.04em.
- **Match bar**:
  - When `profile.scanning`: shows a 10×10 spinner (`border: 1.5px solid var(--green)`, `border-top: transparent`, `animation: spin 0.9s linear infinite`) + `{done}/{total}` in Mono 10px green.
  - Otherwise: 3px tall progress bar (`background: var(--surface-2)`) filled to `matchPct` width with green (or yellow when `unmatched > 0`); right-side label `{round(matchPct)}%` in Mono 10px (yellow if unmatched, else muted).
- Size cell: Mono 11px / `var(--text-dim)`.
- Actions cell: Mono 9px / 0.12em / muted, right-aligned. Shows `SCANNING…` while scanning, else `EDIT · ↻`.
- Children render only when `expanded && children.length > 0`, in a `paddingLeft: 30px, background: var(--bg-1)` container.

### `FilmRow` (inline, nested under `ProfileRow`)
- Same 5-column grid, `padding: 8px 24px`.
- Selected: `background: var(--green-soft)`, `borderLeft: 2px solid var(--green)` (transparent border when not selected so layout doesn't shift).
- Poster thumbnail: 26×38, `border: 1px solid var(--border)`.
- Title: 12px / `var(--text)`. Year suffix: `· {year}` in `var(--text-muted)`.
- Sub-line: `{genre.toUpperCase()} · {duration}` in Mono 10px / `var(--text-muted)`.
- Chip group: green resolution chip + (optional) HDR chip (font-size 9, padding `2px 5px`).
- Rating: `<ImdbBadge>` + `{rating}` in yellow (when present).
- Play link: `<Link to="/player/:id">` styled as a small button. Selected variant gets green bg + green-ink text; unselected gets transparent + 1px border.
- `e.stopPropagation()` on the play-link click so it doesn't toggle selection.

## TODO(redesign)

- `+ NEW PROFILE` footer button has no handler. Needs URL pane state (e.g. `?pane=new-profile`) + form pane.
- "EDIT · ↻" actions string is decorative — no onClick handlers wired.

## Porting checklist (`client/src/pages/Profiles/`)

- [ ] Split-body grid: `1fr 0px 0px` closed, `1fr 4px <paneWidth>px` open, with `transitionSlow` ease
- [ ] `useSplitResize` for drag-resize handle + `isResizing` no-transition state
- [ ] Hero 220px tall, `overflow: hidden`, bottom 1px border
- [ ] `heroSlides` absolute container; all four canonical posters rendered simultaneously, active at `opacity: 1`, others at `opacity: 0`, `transition: opacity 0.8s ease`
- [ ] `heroImgFading` brings active poster back to `opacity: 0` during crossfade; transition is symmetric (fade-out + fade-in overlap)
- [ ] Ken Burns: every poster animates `scale(1.06) translate(-0.8%, -0.6%)` → `scale(1.06) translate(0.8%, 0.6%)` over 16s, ease-in-out, alternate, infinite
- [ ] Edge-fade overlay (`heroEdgeFade`): two-gradient `background-image` (top+bottom dark, right dark), `backgroundSize: 100% 115%, 115% 100%`, 18s drift animation cycling `backgroundPosition`
- [ ] Left-side gradient (`heroGradient`): `linear-gradient(90deg, colorBg0 0%, rgba(5,7,6,0.85) 30%, transparent 65%)`
- [ ] Grain layer + greeting eyebrow + display title
- [ ] Slide dots: 4 `<button type="button">` with `aria-label`, active 22×3px green / inactive 6×3px faint, width+color transitioning at `transitionSlow`
- [ ] `useEffect` interval (6 000ms) with inner `setTimeout` (600ms) for crossfade; both refs cleaned up on unmount
- [ ] `goToHero(idx)` on dot click: half-duration (300ms) manual crossfade, no-op if already active
- [ ] Breadcrumb path with scanning indicator
- [ ] 5-column ProfileRow: chevron / name+path / match-bar / size / actions
- [ ] Match bar: green (or yellow if unmatched) progress fill OR spinner during scan
- [ ] Expanded ProfileRow shows nested FilmRow children with `bg-1` background
- [ ] FilmRow selected state: green-soft bg + 2px green left border (transparent when not selected to prevent shift)
- [ ] Play link in FilmRow uses `e.stopPropagation()` so row toggle doesn't fire
- [ ] URL pane state: `?film=<id>` (toggle off on second click)
- [ ] Pre-expand profile containing the deep-linked film
- [ ] Footer: counts in Mono uppercase + `+ NEW PROFILE` CTA wired to GraphQL mutation

## Status

- [x] Designed in `design/Release` lab (hero cycling + Ken Burns + animated edge fade — 2026-05-01, PR #46 commit e088fb5; remaining `TODO(redesign)` items: `+ NEW PROFILE` handler, EDIT/rescan actions)
- [ ] Production implementation
