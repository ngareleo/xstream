# MediaKindBadge (component)

> Status: **done** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — Extracted discriminator badge for movie/TV-series identity. Two visual variants: `tile` (absolute-positioned 22×22 corner badge for posters) and `row` (inline 12×12 glyph for list rows). Series rendered in green; movies in muted grey. ARIA labels differ by variant.

## Files

- `design/Release/src/components/MediaKindBadge/MediaKindBadge.tsx`
- `design/Release/src/components/MediaKindBadge/MediaKindBadge.styles.ts`

## Purpose

Reusable badge component that renders a film/TV-series discriminator icon. Extracted from inline badge code in `FilmTile.tsx` and `FilmRow.tsx` to enable consistent styling across all contexts where the kind must be visually signaled (poster cards, list rows, detail contexts).

## Visual

### Props

- `kind: "movie" | "series"` — the film's media kind.
- `variant?: "tile" | "row"` — rendering size and chrome. Default: `"row"`.

### Tile variant (`.tile`)

Used in `FilmTile` (poster cards). Absolute-positioned top-left corner badge.

- `position: absolute`, `top: 8px`, `left: 8px`, `zIndex: 2`.
- **Dimensions:** 22×22, `borderRadius: 2px`.
- **Glass treatment:** `backgroundColor: transparent`, `border: 1.5px solid tokens.colorGreen`, `backdropFilter: blur(8px)`.
- **Flexed center:** `display: flex`, `alignItems: center`, `justifyContent: center`.
- **Icon:** `<IconTv>` for series (22×22, `color: tokens.colorGreen`), `<IconFilm>` for movies (22×22, `color: tokens.colorTextMuted` — only rendered when kind is "series" or never shown; see Behaviour below).
- **Opacity on tile hover:** may increase slightly; core badge stays in place.

### Row variant (`.row`)

Used in `FilmRow` (list rows). Inline glyph at the start of the title cell.

- **Dimensions:** 12×12, no chrome.
- **Icon:** `<IconTv>` for series (12×12, `color: tokens.colorGreen`), `<IconFilm>` for movies (12×12, `color: tokens.colorTextMuted`).
- Inline-flex, no padding or margin — parent (FilmRow title cell) controls spacing via `columnGap`.

## Behaviour

### Props and rendering

| Prop | Value | Icon | Icon colour | Aria |
|---|---|---|---|---|
| `kind="series"`, `variant="tile"` | TV series badge | `<IconTv>` | green | `"TV series"` |
| `kind="series"`, `variant="row"` | TV series glyph | `<IconTv>` | green | `"TV series"` |
| `kind="movie"`, `variant="tile"` | NOT RENDERED | — | — | — |
| `kind="movie"`, `variant="row"` | Movie glyph | `<IconFilm>` | muted | `"Movie"` |

**ARIA labeling:**

- **Tile variant (`aria-label`):** `"TV series"` (for series) or unlabeled (movies; the badge is not rendered).
- **Row variant (`aria-hidden`):** `true` for both. The title text in the same cell already disambiguates the media type (and the row's own parent may carry an `aria-label`).

### Conditional rendering

- **Series with tile variant:** badge rendered at full 22×22 with green TV icon.
- **Series with row variant:** glyph rendered as 12×12 inline element with green TV icon.
- **Movie with tile variant:** badge **not rendered** at all.
- **Movie with row variant:** glyph rendered as 12×12 inline element with muted Film icon.

## Changes from Prerelease

This component is new in Release. Previously, the kind badge was inlined directly in `FilmTile.tsx` (22×22 corner badge for series) and `FilmRow.tsx` (inline icon glyph). Extraction enables code reuse and consistent updates.

## Porting checklist (`client/src/components/MediaKindBadge/`)

- [ ] Component signature: `{ kind: MediaKind; variant?: "tile" | "row" }` (variant defaults to `"row"`)
- [ ] **Tile variant:**
  - [ ] `position: absolute`, `top: 8px`, `left: 8px`, `zIndex: 2`
  - [ ] 22×22 square, `borderRadius: 2px`
  - [ ] Glass treatment: transparent bg, `border: 1.5px solid colorGreen`, `backdropFilter: blur(8px)`
  - [ ] `display: flex`, `alignItems: center`, `justifyContent: center` (icon centred)
  - [ ] Series: `<IconTv>` (22×22, green). Movie: **not rendered** at all
  - [ ] `aria-label="TV series"` for series (no aria for movies)
- [ ] **Row variant:**
  - [ ] 12×12 icon, inline-flex, no chrome
  - [ ] Series: `<IconTv>` (12×12, green). Movie: `<IconFilm>` (12×12, muted)
  - [ ] `aria-hidden="true"` for both kinds (title text disambiguates)
- [ ] Wire to real `MediaKind` discriminator enum

## Status

- [x] Designed in `design/Release` lab — extracted from FilmTile + FilmRow inline code 2026-05-02, PR #49. Two variants: tile (22×22 absolute corner badge for posters, series only) and row (12×12 inline glyph for list rows, series or movie). Series always green; movies muted in row variant, not rendered in tile variant. ARIA labeling differs by variant.
- [ ] Production implementation
