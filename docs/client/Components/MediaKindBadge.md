# MediaKindBadge

Badge component that renders a film/TV-series discriminator icon. Extracted as a reusable element to enable consistent styling across all contexts where the media kind must be visually signaled.

**Source:** `client/src/components/media-kind-badge/`
**Used by:** `FilmTile` (poster cards, tile variant), `FilmRow` (list rows, row variant).

## Role

Conditional badge or glyph that signals whether content is a movie or TV series. Two size/chrome variants: `tile` (absolute-positioned 22×22 corner badge for posters) and `row` (inline 12×12 glyph for list rows). Series always rendered in green; movies muted in row variant, not rendered in tile variant.

## Props

| Prop | Type | Notes |
|---|---|---|
| `kind` | `"movie" \| "series"` | The media's discriminator. |
| `variant` | `"tile" \| "row"` | Size and chrome. Default: `"row"`. |

## Layout & styles

### Tile variant (`.tile`)

- `position: absolute`, `top: 8px`, `left: 8px`, `zIndex: 2`.
- **Dimensions:** 22×22, `borderRadius: 2px`.
- **Glass treatment:** `backgroundColor: transparent`, `border: 1.5px solid colorGreen`, `backdropFilter: blur(8px)`.
- **Flexed center:** `display: flex`, `alignItems: center`, `justifyContent: center`.
- **Icon:** `<IconTv>` for series (22×22, `color: colorGreen`). Movies are **not rendered** in this variant.

### Row variant (`.row`)

- **Dimensions:** 12×12, no chrome.
- **Icon:** `<IconTv>` for series (12×12, `color: colorGreen`), `<IconFilm>` for movies (12×12, `color: colorTextMuted`).
- Inline-flex, no padding or margin — parent (FilmRow title cell) controls spacing via `columnGap`.

## Behaviour

### Conditional rendering

| Kind | Variant | Rendered | Icon | Icon colour | ARIA |
|---|---|---|---|---|---|
| `series` | `tile` | Yes | `<IconTv>` | green | `"TV series"` |
| `series` | `row` | Yes | `<IconTv>` | green | `"TV series"` |
| `movie` | `tile` | **No** | — | — | — |
| `movie` | `row` | Yes | `<IconFilm>` | muted | `"Movie"` |

### ARIA labeling

- **Tile variant:** `aria-label="TV series"` for series; unlabeled for movies (badge is not rendered).
- **Row variant:** `aria-hidden="true"` for both kinds (title text in the same cell already disambiguates media type).

## Data

No data dependencies — `kind` is passed as a prop from the parent (sourced from the media's `MediaKind` enum).

## Notes

The component handles the conditional rendering logic (series in tile, both kinds in row) internally so consumers don't need to guard the render themselves.
