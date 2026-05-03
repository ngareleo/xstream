# SearchSlide

TUI-style hero panel for the search-active state. Renders a monospaced prompt row (giant `>` caret + query text + blinking cursor), status row (match counts, profile counts, filter indicator), and action buttons ([F] Filter / [ESC] Clear).

**Source:** `client/src/components/search-slide/`
**Used by:** Library page (hero panel when `heroMode === "searching"`).

## Role

Presentational search display panel with dynamic eyebrow/status based on query/filter state. Shows search prompt in large monospace font with pulsing green cursor. Owns no state — parent (Library page) manages query and filter counts via props + callbacks.

## Props

| Prop | Type | Notes |
|---|---|---|
| `query` | `string` | Current search query (trimmed display value). |
| `resultCount` | `number` | Films matching query + filters. |
| `totalMatched` | `number` | Films matching query (ignoring filters). |
| `profilesMatched` | `number` | Profiles containing at least one match. |
| `activeFilterCount` | `number` | Total selected filter items. |
| `onOpenFilter` | `() => void` | [F] Filter button callback. |
| `onClear` | `() => void` | [ESC] Clear button callback. |

## Layout & styles

### Container (`.slidePanel`)

- `flexGrow: 1`, `display: flex`, `flexDirection: column`, `rowGap: 20px`.
- `fontFamily: tokens.fontMono`, `color: tokens.colorText`, `paddingTop: 12px`.

### Eyebrow row

- Mono 11px, `letterSpacing: 0.22em`, uppercase, `colorGreen`.
- Dynamic patterns:
  - No query, no filters: `"· search"`.
  - Query, no filters: `"· query · {resultCount} result(s)"`.
  - No query, filters active: `"· filtered · {resultCount} film(s)"`.
  - Query + filters active: same as "Query, no filters" + append `" · "` + `<span>"filterCount filter(s)"` (white).
- Pluralization: `count === 1 ? singular : plural`.

### Prompt row

- Mono **56px**, `lineHeight: 1`, `letterSpacing: -0.01em`.
- **Caret:** green `">"`, fixed.
- **Text:** white, `display: inline-flex`, `alignItems: center`, `columnGap: 4px`, `minHeight: 1em`, `overflowX: hidden`, `whiteSpace: nowrap`. Renders `query.trim()` or empty.
- **Cursor:** green block (`width: 12px`, `height: 0.85em`), `boxShadow: 0 0 6px ${tokens.colorGreen}, 0 0 14px ${tokens.colorGreenGlow}`. Pulsing animation (1.05s ease-in-out): opacity 1 → 0.25 → 1, `scaleY(1)` → `scaleY(0.86)` → `scaleY(1)`. Always visible.

### Status row

- Mono 12px, `letterSpacing: 0.06em`, `colorTextDim`.
- Flex row wrap, `columnGap: 10px`, `rowGap: 6px`.
- Three variants:
  - **Query (with or without filters):** `"{resultCount} of {totalMatched} match(es)"` + separator · + `"{profilesMatched} profile(s)"` + if filters: · + `<span>"filtered ({activeFilterCount})"` (green).
  - **No query, no filters:** `<span italicized>"type to search films, directors, genres"` (muted).
  - **No query, filters active:** `"{resultCount} of {totalMatched} films · {profilesMatched} profile(s) · "` + `<span>"{activeFilterCount} filter(s) on"` (green).

### Actions row

- `marginTop: auto` (push to bottom).
- `display: flex`, `alignItems: center`, `columnGap: 20px`, `paddingTop: 16px`, `flexWrap: wrap`.
- **Primary:** `"[F] Filter"` — green underlined text, Mono 13px, `letterSpacing: 0.18em`, uppercase. Hover: text + underline → white. Calls `onOpenFilter()`.
- **Secondary:** `"[ESC] Clear"` — grey underlined text, Mono 12px, `letterSpacing: 0.18em`, uppercase. Hover: white. Calls `onClear()`.

## Behaviour

- Eyebrow updates based on query presence and filter status.
- Prompt caret always green; text white; cursor always visible and pulsing.
- Status row updates counts dynamically.
- ESC handling is **parent-owned** by Library page's top-level keyboard handler — SearchSlide's `[ESC] Clear` button calls `onClear()` for click-only access.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#search-slide).
