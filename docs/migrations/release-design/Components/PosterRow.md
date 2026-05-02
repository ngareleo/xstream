# PosterRow (component)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — Carousel row with smooth-scroll pagination arrows and RAF-eased animation. Used by Library page for continue-watching, new-releases, and watchlist rows.

## Files

- `design/Release/src/components/PosterRow/PosterRow.tsx`
- `design/Release/src/components/PosterRow/PosterRow.styles.ts`

## Purpose

Horizontal-scroll carousel row with pagination arrows (left/right). Renders a row label (title), left/right edge arrows (conditionally visible based on scroll position), and a flex track of `<FilmTile>` components. Smooth scroll uses RAF-based easing (easeInOutCubic, 720ms). Used by Library page for "Continue Watching", "New Releases", and "Watchlist" rows.

## Visual

### Container (`row`)
- Flex column, `rowGap: 12px` (between label and track).

### Header (`rowHeader`)
- JetBrains Mono 11px / `letterSpacing: 0.22em` / uppercase / `colorTextDim`.
- Renders the row title (e.g., "Continue watching", "New releases").

### Frame (`rowFrame`)
- `position: relative` — acts as a container for the track + arrows.

### Track (`rowTrack`)
- `display: flex`, `columnGap: 16px` (matching `TILE_GAP` from FilmTile), `overflowX: auto`, `overflowY: hidden`.
- Scrollbar hidden: `scrollbarWidth: none`, `msOverflowStyle: none`, `::webkit-scrollbar: display: none`.
- `scrollSnapType: x proximity` — loose snap during manual scroll.
- `paddingBottom: 8px` (space for scrollbar-area).
- Flex children (FilmTile) have `scrollSnapAlign: start`.

### Edge arrows

#### Arrow base styles (`rowArrow`)
- `position: absolute`, `top: calc(50% - 24px)`, `width: 44px`, `height: 44px`.
- Inline-flex centred.
- `backgroundColor: rgba(8,11,10,0.65)`, `backdropFilter: blur(10px) saturate(1.4)` (+ `-webkit-` prefix).
- 1px solid `colorBorder` all sides, `borderRadius: 50%` (circular).
- `color: tokens.colorText`, `zIndex: 4`.
- Transition: `background-color, border-color, color, transform` (0.15s).
- Hover: `backgroundColor: rgba(8,11,10,0.85)`, border all sides → `colorGreen`, `color: colorGreen`, `transform: scale(1.06)`.

#### Left arrow (`rowArrowLeft`)
- `left: -12px` (slightly overlaps left edge of track).
- Contains `<IconBack>`, `aria-label="Previous"`.

#### Right arrow (`rowArrowRight`)
- `right: -12px` (slightly overlaps right edge of track).
- Contains `<IconChevron>`, `aria-label="Next"`.

### Arrow visibility (`hasPrev`, `hasNext`)
- State updated by `scroll` listener + `ResizeObserver` on the track element.
- Tolerance: 4px (`hasPrev = scrollLeft > 4`, `hasNext = scrollLeft + clientWidth < scrollWidth - 4`).
- Only rendered when visible (`{hasPrev && <arrow>}`).

## Behaviour

### Smooth scroll animation
- **RAF-based:** `easeInOutCubic` easing curve (cubic formula: `t < 0.5 ? 4t³ : 1 - (-2t+2)³/2`).
- **Duration:** `ROW_SCROLL_DURATION_MS = 720` ms.
- **Page size computation (`pageSize()`):**
  - `tilesPerPage = Math.max(1, Math.floor(el.clientWidth / TILE_STRIDE))`.
  - `pageSize = tilesPerPage * TILE_STRIDE`.
  - This ensures scroll distance is always a multiple of `TILE_STRIDE` (216px) so tiles align on boundaries.
- **Invariant:** page size must be a multiple of TILE_STRIDE. If not, `scroll-snap-type: proximity` does NOT enforce snap during RAF animation, leaving tiles misaligned at rest.

### Scroll direction and distance
- On left arrow click: scroll left by `pageSize()`.
- On right arrow click: scroll right by `pageSize()`.
- Scroll uses `element.scrollLeft += distance` over the RAF loop.

### Props

- `title: string` — row header text (e.g., "Continue watching").
- `films: FilmShape[]` — array of film objects to render as tiles.
- `onSelectFilm: (film: FilmShape) => void` — callback when a tile is clicked. Parent (Library) typically navigates or opens the detail pane.

### Constants

- **`TILE_WIDTH = 200`**, **`TILE_GAP = 16`**, **`TILE_STRIDE = 216`** — imported from FilmTile module.
- **`ROW_SCROLL_DURATION_MS = 720`** — smooth-scroll animation duration.

## Changes from Prerelease

This component is new in Release as an extracted, reusable carousel unit. In Prerelease, carousel rows were inline inside the Library page.

## Porting checklist (`client/src/components/PosterRow/`)

- [ ] Import `TILE_WIDTH`, `TILE_GAP`, `TILE_STRIDE` from FilmTile
- [ ] Container: flex column, `rowGap: 12px`
- [ ] Header: Mono 11px uppercase, `colorTextDim`, renders `title` prop
- [ ] Frame: `position: relative` (arrow container)
- [ ] Track: `display: flex`, `columnGap: 16px`, `overflowX: auto`, `overflowY: hidden`, scrollbar hidden, `scrollSnapType: x proximity`
- [ ] Track children (FilmTile): `scrollSnapAlign: start`
- [ ] Left arrow: `position: absolute`, `left: -12px`, `top: calc(50% - 24px)`, 44×44 circular glass pill, `<IconBack>`, `aria-label="Previous"`
- [ ] Right arrow: `position: absolute`, `right: -12px`, same styling, `<IconChevron>`, `aria-label="Next"`
- [ ] Arrow glass styling: `backgroundColor: rgba(8,11,10,0.65)`, `backdropFilter: blur(10px) saturate(1.4)`, border `colorBorder`, `borderRadius: 50%`, `zIndex: 4`
- [ ] Arrow hover: `backgroundColor: rgba(8,11,10,0.85)`, border/color → `colorGreen`, `scale(1.06)`, smooth transitions
- [ ] Arrow visibility: `hasPrev` and `hasNext` state based on scroll position (tolerance 4px)
- [ ] Scroll listener: update `hasPrev`/`hasNext` on scroll + ResizeObserver on track resize
- [ ] Page size function: `Math.max(1, Math.floor(trackWidth / TILE_STRIDE)) * TILE_STRIDE`
- [ ] On left arrow click: RAF-animate scroll left by page size (720ms easeInOutCubic)
- [ ] On right arrow click: RAF-animate scroll right by page size (720ms easeInOutCubic)
- [ ] Render `<FilmTile>` for each film in `films`, passing `onSelectFilm` as onClick
- [ ] Wire to real film data (replace mock data)

## TODO(redesign)

- Arrow icon choice: confirm IconBack is the correct left arrow. (Consider: use a ChevronLeft instead if that feels better.)

## Status

- [x] Designed in `design/Release` lab — PosterRow component extracted from Library's inline carousel 2026-05-02, PR #48. Glass-effect pagination arrows with hover lift/glow. RAF-based smooth scroll (easeInOutCubic, 720ms). Page size computed as multiple of TILE_STRIDE for snap alignment.
- [ ] Production implementation

## Notes

- **Scroll snap alignment:** The `scroll-snap-type: x proximity` constraint on the track only works reliably during manual scroll. During the RAF animation (programmatic `scrollLeft +=`), snap-point alignment is not enforced by the browser. The component ensures snapping by computing page size as a multiple of TILE_STRIDE.
- **RAF easing:** The easeInOutCubic curve gives a smooth acceleration → deceleration feel. The 720ms duration (0.72s) is long enough to be perceived as smooth but short enough to feel responsive.
- **Arrow visibility:** Arrows are hidden when the track content fits entirely in the viewport (hasPrev + hasNext both false), providing a clean UX when no scrolling is needed.
