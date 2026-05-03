# LinkSearch

Modal search interface for linking a media file to an OMDb title. Displays the
file being linked, a debounced search input with live results from the OMDb API,
and a cancel button. Emits a `CANCELLED` Nova event when dismissed.

**Source:** `client/src/components/link-search/`
**Used by:** Modal dialog launched from film metadata editing flows.

## Role

Modal-hosted search component for OMDb title lookup during file-to-metadata
linking. Owns internal search state and result fetching; parent modal owns
visibility and dismiss logic via the `CANCELLED` event.

## Props

| Prop | Type | Notes |
|---|---|---|
| `filename` | `string` | Name of the file being linked. Displayed in the header with ellipsis on overflow. |

## Layout & styles

### Root

- `display: flex`, `flexDirection: column`, `flex: 1`, `overflow: hidden`.

### File row

- `padding: 12px 16px 10px`, `borderBottom: 1px solid colorBorder`.
- `backgroundColor: colorSurface2`.
- **File label** — `fontSize: 9px`, `fontWeight: 700`, `letterSpacing: 0.12em`, `color: colorTextMuted`, `textTransform: uppercase`.
- **File name** — `fontSize: 11px`, `fontFamily: fontMono`, `color: colorTextDim`, ellipsis on overflow.

### Search input

- Container: `display: flex`, `alignItems: center`, `gap: 8px`, `padding: 10px 14px`.
- `borderBottom: 1px solid colorBorder`, `backgroundColor: colorSurface`.
- **Search icon** — `13px`, `color: colorTextMuted`, `flexShrink: 0`.
- **Input** — `flex: 1`, `background: none`, `border: none`, `fontSize: 13px`, `fontFamily: fontBody`, `color: colorText`.
- Placeholder: `color: colorTextMuted`.
- **Spinner** — animating when searching, `13px`, `color: colorTextMuted`.
- **Clear button** — appears when query is non-empty and not searching. `background: none`, `border: none`, `color: colorTextMuted`, `padding: 2px`, `borderRadius: 50%`. Hover: `color: colorText`, `backgroundColor: rgba(255,255,255,0.08)`.

### Suggestions list

- `flex: 1`, `overflowY: auto`.
- Entry animation: `opacity: 0 → 1`, `transform: translateY(-6px) → translateY(0)` over `0.15s ease`.
- Empty state: `padding: 12px 0`, `fontSize: 12px`, `color: colorTextMuted`, `textAlign: center`, `text: "No results found"`.

### Cancel button

- `padding: 10px 16px`, `background: none`, `border: none`, `borderTop: 1px solid colorBorder`.
- `fontSize: 12px`, `fontFamily: fontBody`, `color: colorTextMuted`, `textAlign: left`.
- `marginTop: auto`.
- Hover: `color: colorTextDim`, `backgroundColor: rgba(255,255,255,0.03)`.
- Text: "Cancel".

## Behaviour

- On mount, autofocus the input field.
- On input change: clear `query`, reset status to `idle`, clear suggestions (if input is empty).
- If input is non-empty and trimmed: set status to `searching`, wait 500ms (debounce), then fetch from `searchOmdb(query)` GraphQL query.
- On fetch success: set status to `results`, render `SearchSuggestionCard` for each result.
- On fetch error: set status to `results` anyway (shows empty state).
- Clear button resets query to `""`.
- Cancel button bubbles a `CANCELLED` Nova event via `useNovaEventing()`.

## Data

Uses Relay `fetchQuery()` to execute:
```graphql
query LinkSearchQuery($query: String!) {
  searchOmdb(query: $query) {
    imdbId
    title
    year
    posterUrl
  }
}
```

## Nova Events

- **LinkSearchCancelledEvent** — emitted on cancel button click via `createLinkSearchCancelledEvent()`.

## Notes

- Debounce delay is 500ms to avoid hammering the OMDb API.
- Subscription is cleaned up on unmount or query change.
- No-results state is shown when `suggestions.length === 0` after fetch.
- Search suggestions are rendered as `SearchSuggestionCard` children; each card emits a `SELECTED` event when clicked.
