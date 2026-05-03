# FilmTile

Reusable poster card for Library carousels and search results. 200px width, 2:3 aspect ratio. Displays film poster image, optional progress bar at bottom, and metadata (title + year/duration subtitle) below.

**Source:** `client/src/components/film-tile/`
**Used by:** PosterRow carousels, search results grids.

## Role

Presentational poster card with optional progress bar and metadata. Purely compositional — parent owns data, click handlers, and context. Exported constants (TILE_WIDTH, TILE_GAP, TILE_STRIDE) allow callers to compute correct scroll distances.

## Props

| Prop | Type | Notes |
|---|---|---|
| `film` | `FilmShape` | Film object (title, posterUrl, year, duration, kind, filename). |
| `progress` | `number \| undefined` | Optional progress percentage (0–100). Renders progress bar when defined. |
| `onClick` | `() => void` | Tile click handler. |

## Layout & styles

### Dimensions

- `width: 200px`, `flexShrink: 0`, `backgroundColor: transparent`.
- Exported constants:
  - **`TILE_WIDTH = 200`** — poster width.
  - **`TILE_GAP = 16`** — gap between tiles in carousel.
  - **`TILE_STRIDE = 216`** — width + gap (used by PosterRow for snap alignment).

### Kind badge (top-left corner)

- Renders `<MediaKindBadge kind={film.kind} variant="tile" />` only for series.
- See `MediaKindBadge.md` spec. Returns null for movies.

### Frame (`.tileFrame`)

- `position: relative`, `aspectRatio: 2/3`, 1px solid `colorBorder`, `backgroundColor: colorSurface`.
- Transition: `box-shadow, transform` (0.25s).
- **`::after` green border wipe:**
  - `content: ""`, `position: absolute`, `top/right/bottom/left: -1px`, 1px solid `colorGreen`.
  - `clipPath: inset(100% 0 0 0)` at rest → `inset(0 0 0 0)` on hover (wipe from top).
  - Transition: `clip-path` (0.25s, ease-out).
  - `pointerEvents: none`.
- **Hover:**
  - `transform: translateY(-3px)`.
  - `boxShadow: 0 8px 20px ${tokens.colorGreenGlow}, 0 2px 6px ${tokens.colorGreenSoft}`.

### Image (`.tileImage`)

- `width: 100%`, `height: 100%`, `objectFit: cover`, `display: block`.

### Progress bar (optional)

- Rendered only when `progress !== undefined`.
- **Track:** `position: absolute`, `left: 0`, `right: 0`, `bottom: 0`, `height: 3px`, `backgroundColor: rgba(0,0,0,0.55)`.
- **Fill:** `height: 100%`, `backgroundColor: tokens.colorGreen`, `width: {progress}%`.

### Metadata (below frame)

- `marginTop: 10px`.
- **Title:** 13px, `color: tokens.colorText`, renders `film.title || film.filename`.
- **Subtitle:** Mono 10px, `color: tokens.colorTextMuted`, `letterSpacing: 0.06em`, `marginTop: 3px`. Renders `{year} · {duration}` with null filtering.

## Behaviour

- Entire tile is clickable (frame + metadata).
- Calls `onClick()` on click.
- `scrollSnapAlign: start` — aligns to track start when scroll-snapping.
- Native `<button>` handles Enter/Space activation; focus ring preserved.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#film-tile).
