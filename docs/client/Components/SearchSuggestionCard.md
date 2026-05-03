# SearchSuggestionCard

Card button showing a single OMDb search result: poster thumbnail, title, and
optional year. Rendered inside `LinkSearch` suggestions list. Emits a
`SELECTED` Nova event on click with the full suggestion data.

**Source:** `client/src/components/search-suggestion-card/`
**Used by:** `LinkSearch` (renders one card per result).

## Role

Presentational result item for OMDb title selection. Passes clicked suggestion
data via Nova eventing to parent modal.

## Props

| Prop | Type | Notes |
|---|---|---|
| `suggestion` | `SuggestionSelectedData` | OMDb result containing `imdbId`, `title`, `year`, `posterUrl`. |

## Layout & styles

### Root button

- `display: flex`, `alignItems: center`, `gap: 12px`, `width: 100%`.
- `padding: 10px 14px`, `background: none`, `border: none`, `borderBottom: 1px solid colorBorder`.
- `cursor: pointer`, `textAlign: left`, `fontFamily: fontBody`.
- Hover: `backgroundColor: rgba(255,255,255,0.05)`.

### Thumbnail

- `width: 36px`, `height: 52px`, `borderRadius: 3px`, `flexShrink: 0`.
- `backgroundSize: cover`, `backgroundPosition: center`, `backgroundColor: colorSurface2`.
- If `suggestion.posterUrl` is present, rendered as background image via `backgroundImage: url(...)`.

### Info column

- `display: flex`, `flexDirection: column`, `gap: 3px`, `minWidth: 0` (allows ellipsis).

### Title

- `fontSize: 13px`, `fontWeight: 600`, `color: rgba(255,255,255,0.85)`.
- Ellipsis on overflow: `whiteSpace: nowrap`, `overflow: hidden`, `textOverflow: ellipsis`.

### Year (optional)

- `fontSize: 11px`, `color: colorTextMuted`.
- Only rendered if `suggestion.year != null`.

## Behaviour

- Click handler bubbles a `SELECTED` Nova event via `useNovaEventing()` with the full suggestion object.
- Nova event data includes `imdbId`, `title`, `year`, `posterUrl` (allows parent to process the selection).

## Nova Events

- **SuggestionSelectedEvent** — emitted on button click with type `SELECTED` and the suggestion data payload.

## Notes

- The poster image will not load if `posterUrl` is null or undefined; in that case the thumbnail shows the fallback background color (`colorSurface2`).
- Year is optional in the data model; the component conditionally renders it only if non-null.
