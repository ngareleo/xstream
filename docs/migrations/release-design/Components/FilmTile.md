# FilmTile (component)

> Status: **done** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — Poster card component used in carousel rows and search results grid. Exported constants (TILE_WIDTH, TILE_GAP, TILE_STRIDE) allow callers (PosterRow) to compute correct scroll distances and grid alignment.
> Audited: 2026-05-02 — added FilmShape interface, Strings + Stories sections (M4 audit pass).

## Files

- `design/Release/src/components/FilmTile/FilmTile.tsx`
- `design/Release/src/components/FilmTile/FilmTile.styles.ts`

## Purpose

Reusable poster card for Library carousels and search results. 200px width, 2:3 aspect ratio. Displays film poster image, optional progress bar at bottom, and metadata (title + year/duration subtitle) below. Hover: lift with shadow, green border wipe-in from top, scale 1.05. Used by PosterRow and search results grid.

## Visual

### Dimensions & layout
- `width: 200px`, `flexShrink: 0` (carousel constraint), `backgroundColor: transparent`, no border, no padding, `cursor: pointer`.
- Exported constants for callers:
  - **`TILE_WIDTH = 200`** — poster width in pixels.
  - **`TILE_GAP = 16`** — gap between tiles in flex row.
  - **`TILE_STRIDE = 216`** — width + gap combined (200 + 16). Used by PosterRow to compute scroll distance; must be a multiple of stride for scroll-snap alignment.

### Kind badge — top-left corner

See [`MediaKindBadge`](MediaKindBadge.md) spec for full visual detail. FilmTile uses the **`tile` variant**:

- **Only rendered for series films** (`film.kind === "series"`).
- Renders `<MediaKindBadge kind={film.kind} variant="tile" />` as an absolutely-positioned 22×22 corner badge.
- **For movies** (`film.kind === "movie"`): no badge rendered (MediaKindBadge returns null).

### Frame (`tileFrame`)
- `position: relative`, `aspectRatio: 2/3`, 1px solid `colorBorder` all sides, `backgroundColor: colorSurface`.
- `transitionProperty: box-shadow, transform`, `transitionDuration: tokens.transitionSlow` (0.25s).
- **`::after` green border wipe:** 
  - `content: ""`, `position: absolute`, `top/right/bottom/left: -1px`, 1px solid `colorGreen` all sides.
  - `clipPath: inset(100% 0 0 0)` at rest → `inset(0 0 0 0)` on hover (wipe from top).
  - `transitionProperty: clip-path`, `transitionDuration: tokens.transitionSlow`, `transitionTimingFunction: ease-out`.
  - `pointerEvents: none`.
- **Hover on `tileFrame`:**
  - `transform: translateY(-3px)`.
  - `boxShadow: 0 8px 20px ${tokens.colorGreenGlow}, 0 2px 6px ${tokens.colorGreenSoft}`.
- **Hover on `tileFrame::after`:**
  - `clipPath: inset(0 0 0 0)` (wipe completes — full green border visible).

### Image (`tileImage`)
- `width: 100%`, `height: 100%`, `objectFit: cover`, `display: block`.
- Fills the frame and is clipped to the rounded corners (if any) via frame overflow.

### Progress bar (optional)
- Rendered only when `progress !== undefined`.
- **Track (`progressTrack`):** `position: absolute`, `left: 0`, `right: 0`, `bottom: 0`, `height: 3px`, `backgroundColor: rgba(0,0,0,0.55)`.
- **Fill (`progressFill`):** `height: 100%`, `backgroundColor: tokens.colorGreen`, `width: {progress}%`.
- No animation on progress change (instant fill update).

### Metadata (below frame)
- `marginTop: 10px`.
- **Title (`tileTitle`):** 13px, `color: tokens.colorText`, rendered as `film.title || film.filename`.
- **Subtitle (`tileSubtitle`):** Mono 10px, `color: tokens.colorTextMuted`, `letterSpacing: 0.06em`, `marginTop: 3px`. Renders `{year} · {duration}` via `filter(Boolean).join(" · ")` (omits null values).

## Behaviour

### Props

```ts
interface FilmTileProps {
  film: FilmShape;       // see FilmShape below
  progress?: number;     // 0–100; renders progress bar when defined
  onClick: () => void;   // tile click handler
}
```

- `film: FilmShape` — the film data (title, posterUrl, year, duration, progress).
- `progress?: number` — optional progress percentage (0–100). If undefined, no progress bar is shown. Used for "continue watching" rows.
- `onClick: () => void` — callback when the tile is clicked. Parent (PosterRow or search grid) typically calls `openFilm(film.id)`.

### FilmShape (production)

The lab uses `Film` from `data/mock.ts`. In production, FilmTile reads from a Relay fragment `FilmTile_film` with the following fields:

```graphql
fragment FilmTile_film on Video {
  id
  title         # may be null → fall back to filename
  filename
  kind          # MOVIE | SERIES → MediaKindBadge variant
  posterUrl     # OMDb URL or null → Poster shows gradient placeholder
  year          # may be null
  duration      # seconds, may be null
}
```

### Click behaviour
- Entire tile is clickable (frame + metadata).
- Calls `onClick()` on click.
- Native `<button type="button">` handles Enter/Space activation; default focus ring (`:focus-visible`) is preserved by the browser.

### Scroll snap
- `scrollSnapAlign: start` — aligns to the start of the track when scroll-snapping occurs.

## Strings (`FilmTile.strings.ts`)

| Key | Value | Used as |
|---|---|---|
| (no localized strings) | — | Title falls back to `film.filename` when `film.title` is null; meta uses raw `year`/`duration` joined with `" · "`. No labels, button text, or aria-labels in this component. |

The kind badge (which does have an aria-label) lives in `MediaKindBadge` and owns its own strings.

## Stories (`FilmTile.stories.tsx`)

| Story | Setup | What it verifies |
|---|---|---|
| Movie | `kind: "MOVIE"`, year + duration | Default tile, no kind badge |
| Series | `kind: "SERIES"` | Kind badge visible top-left |
| WithProgress | `progress: 35` | Progress bar bottom of frame, green fill 35% |
| ProgressFull | `progress: 100` | Full-width green fill |
| Unmatched | `title: null, filename: "weird.file.mkv"` | Falls back to filename, no year/duration |
| MissingPoster | `posterUrl: null` | Poster gradient placeholder |
| Hover | `parameters: { pseudo: { hover: true } }` | Frame lift + green border wipe

## Changes from Prerelease

This component is new in Release as an extracted, reusable unit. In Prerelease, carousel tiles were inline inside the carousel component.

## Porting checklist (`client/src/components/FilmTile/`)

- [ ] `TILE_WIDTH = 200`, `TILE_GAP = 16`, `TILE_STRIDE = 216` exported as module constants
- [ ] Button element: `type="button"`, `width: 200px`, `flexShrink: 0`, `textAlign: left`, `color: inherit`, transparent bg, no border
- [ ] Kind badge: render `<MediaKindBadge kind={film.kind} variant="tile" />` — see [`MediaKindBadge.md`](MediaKindBadge.md) for tile variant detail
- [ ] Frame: `position: relative`, `aspectRatio: 2/3`, 1px solid `colorBorder`, `backgroundColor: colorSurface`, transition box-shadow + transform (0.25s)
- [ ] Frame::after border wipe: green border all sides, `clipPath: inset(100% 0 0 0)` → `inset(0 0 0 0)` on hover, ease-out transition
- [ ] Hover on frame: `translateY(-3px)` + `boxShadow: 0 8px 20px colorGreenGlow, 0 2px 6px colorGreenSoft`
- [ ] Image: `width/height: 100%`, `objectFit: cover`, `display: block`
- [ ] Progress bar (optional): absolute bottom, 3px tall, dark background, green fill to `{progress}%`
- [ ] Metadata: `marginTop: 10px`
- [ ] Title: 13px, `colorText`, `film.title || film.filename`
- [ ] Subtitle: Mono 10px, `colorTextMuted`, `letterSpacing: 0.06em`, `marginTop: 3px`, `"{year} · {duration}"` with null filtering
- [ ] Click handler: calls `onClick()` (parent sets up navigation)
- [ ] `scrollSnapAlign: start` (carousel alignment constraint)
- [ ] Wire to real `Film` data model (replace mock data) including `kind` discriminator

## Status

- [x] Designed in `design/Release` lab — FilmTile component extracted from inline carousel/grid tile 2026-05-02, PR #48. Constant exports (TILE_WIDTH, TILE_GAP, TILE_STRIDE) for scroll-distance computation. Hover lift + green border wipe. Optional progress bar for continue-watching context. **Kind badge added 2026-05-02, PR #49:** green TV icon badge (top-left corner) for series tiles; movie tiles unchanged.
- [ ] Production implementation

## Notes

- **Stride invariant:** Carousel smooth-scroll must always move by a multiple of `TILE_STRIDE` (216px) to land on tile boundaries. PosterRow computes page size as `Math.floor(clientWidth / TILE_STRIDE) * TILE_STRIDE` and uses that for scroll distance.
- **Progress percentage:** Passed as a number 0–100. Renderless when undefined (continue-watching rows use it; new releases don't).
- **Metadata fallback:** Title falls back to `filename` if `title` is null (unmatched files). Year and duration may be null; subtitle filters them out.
