# PosterRow

Horizontal-scroll carousel row with pagination arrows (left/right). Renders a row label (title), left/right edge arrows (conditionally visible based on scroll position), and a flex track of arbitrary children (typically `<FilmTile>` instances).

**Source:** `client/src/components/poster-row/`
**Used by:** Library page (carousels for continue-watching, new-releases, watchlist rows).

## Role

Presentational carousel layout with smooth-scroll pagination via RAF-eased animation. Owns no data — parent renders and wires `<FilmTile>` children. Exports scroll constants for callers to align snap points correctly.

## Props

| Prop | Type | Notes |
|---|---|---|
| `title` | `string` | Row header text (e.g. "Continue watching"). |
| `children` | `ReactNode` | Typically `<FilmTile>` instances (parent owns data + clicks). |

## Layout & styles

### Container (`.row`)

- Flex column, `rowGap: 12px`.

### Header (`.rowHeader`)

- Mono 11px, `letterSpacing: 0.22em`, uppercase, `colorTextDim`.
- Renders `title` prop.

### Frame (`.rowFrame`)

- `position: relative` — container for track + arrows.

### Track (`.rowTrack`)

- `display: flex`, `columnGap: 16px` (matching `TILE_GAP` from FilmTile).
- `overflowX: auto`, `overflowY: hidden`, scrollbar hidden.
- `scrollSnapType: x proximity` — loose snap during manual scroll.
- `paddingBottom: 8px` (scrollbar-area space).

### Edge arrows (`.rowArrow`)

- `position: absolute`, `top: calc(50% - 24px)`, `width: 44px`, `height: 44px`, inline-flex centred.
- `backgroundColor: rgba(8,11,10,0.65)`, `backdropFilter: blur(10px) saturate(1.4)` (+ `-webkit-` prefix).
- 1px solid `colorBorder`, `borderRadius: 50%` (circular).
- `color: tokens.colorText`, `zIndex: 4`.
- Transition: `background-color, border-color, color, transform` (0.15s).
- Hover: `backgroundColor: rgba(8,11,10,0.85)`, border/text → `colorGreen`, `transform: scale(1.06)`.

#### Left arrow (`.rowArrowLeft`)

- `left: -12px` (slightly overlaps left edge).
- Contains `<IconBack>`, `aria-label="Previous"`.

#### Right arrow (`.rowArrowRight`)

- `right: -12px` (slightly overlaps right edge).
- Contains `<IconChevron>`, `aria-label="Next"`.

### Arrow visibility

- State `hasPrev` and `hasNext` updated by scroll listener + `ResizeObserver` on track.
- Tolerance: 4px (`hasPrev = scrollLeft > 4`, `hasNext = scrollLeft + clientWidth < scrollWidth - 4`).
- Only rendered when visible.

## Behaviour

### Smooth scroll animation

- **RAF-based:** `easeOutQuint` easing (`1 - Math.pow(1 - t, 5)`) — strong front-loaded acceleration, gentle settle.
- **Duration:** `SCROLL_DURATION_MS = 1100` ms.
- **Page size computation:**
  - `tilesPerPage = Math.max(1, Math.floor(trackWidth / TILE_STRIDE))`.
  - `pageSize = tilesPerPage * TILE_STRIDE`.
  - Ensures scroll distance is always a multiple of TILE_STRIDE (216px) for snap alignment.

### Scroll direction

- Left arrow click: scroll left by `pageSize()`.
- Right arrow click: scroll right by `pageSize()`.

### Constants

- **`TILE_WIDTH = 200`**, **`TILE_GAP = 16`**, **`TILE_STRIDE = 216`** — imported from FilmTile.
- **`SCROLL_DURATION_MS = 1100`** — smooth-scroll duration.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#poster-row).
