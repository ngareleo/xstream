# FilterSlide

TUI-style filter table panel displayed inside the Library hero when filter mode is active. Renders monospaced toggle checkboxes for each filter dimension (resolution, HDR, codec, decade).

**Source:** `client/src/components/filter-slide/`
**Used by:** Library page (hero panel when `heroMode === "filtering"`).

## Role

Presentational filter control panel with four filter dimensions and toggle buttons. Replaces SearchSlide when filters are active. Owns no state — parent (Library page) manages filters and filter counts via props + callbacks.

## Props

| Prop | Type | Notes |
|---|---|---|
| `query` | `string` | Current search query (for eyebrow display). |
| `filters` | `Filters` | Object: `{ resolutions, hdrs, codecs, decades }` (all Sets). |
| `setFilters` | `(updater) => void` | State setter for filter updates. |
| `resultCount` | `number` | Films matching query + filters. |
| `totalMatched` | `number` | Films matching query alone (before filters). |
| `onClose` | `() => void` | Done button callback. |
| `onClearFilters` | `() => void` | Clear button callback. |

## Layout & styles

### Container (`.slidePanel`)

- `flexGrow: 1`, `display: flex`, `flexDirection: column`, `rowGap: 20px`.
- `fontFamily: tokens.fontMono`, `color: tokens.colorText`, `paddingTop: 12px`.

### Eyebrow row

- Mono 11px, uppercase, `colorGreen`.
- Pattern: `"· filters"` + optional query: `" · {query.trim()}"` + arrow (always): `" · "` + `<span>"totalMatched → resultCount"` (white).
- The accent span uses `color: tokens.colorText`.

### TUI table

- `display: flex`, `flexDirection: column`, `rowGap: 10px`, Mono 13px.
- `paddingTop/Bottom: 8px`, `paddingLeft/Right: 16px`.
- Left border: 1px `colorBorder`.
- Background: `rgba(20, 24, 22, 0.55)` (semi-transparent dark).

#### Filter rows

- CSS grid `gridTemplateColumns: 120px 1fr`, `columnGap: 16px`, `alignItems: center`.
- **Label (`tuiRowLabel`):** Mono 11px, `letterSpacing: 0.22em`, uppercase, `colorTextFaint`. Renders dimension: `"resolution"`, `"hdr"`, `"codec"`, `"decade"`.
- **Options (`tuiRowOptions`):** `display: flex`, `flexWrap: wrap`, `columnGap: 16px`, `rowGap: 6px`. Houses toggle buttons.

#### Toggle button

- `<button type="button">` with `aria-pressed={checked}`.
- Mono 13px, `letterSpacing: 0.04em`.
- `color: tokens.colorTextDim` at rest, `tokens.colorText` on hover.
- When checked: `color: tokens.colorGreen` (stays green on hover).
- Inline-flex, `columnGap: 8px`.
- **Box:** Mono, `"[x]"` when checked, `"[ ]"` when unchecked.
- **Label:** filter option label (e.g. `"4K"`, `"HDR10"`, `"HEVC"`, `"'90s"`). Special case: HDR value `"—"` is labeled `"SDR"`.
- Click: `setFilters((f) => ({ ...f, <dimension>: toggleSetItem(f.<dimension>, item) }))`.

### Actions row

- `marginTop: auto`, flex, `columnGap: 20px`, `paddingTop: 16px`.
- **Primary:** `"[↩] Done"` — green underlined text (Mono 13px uppercase), hover white. Calls `onClose()`.
- **Secondary:** `"[⇧⌫] Clear"` — grey underlined text (Mono 12px uppercase). Disabled when no filters active (`opacity: 0.35`, `cursor: not-allowed`). Hover white (when enabled). Calls `onClearFilters()`.
- **Hint:** `marginLeft: auto`, Mono 10px faint text. Renders `"{profiles.length} libraries · {totalMatched} matches before filters"`.

## Behaviour

### Filter application

**`applyFilters(list, filters)`** — if no filters active, return list unchanged. Otherwise, exclude films not matching **all** active dimensions:
- If `filters.resolutions.size > 0` and film's resolution not in set, exclude.
- If `filters.hdrs.size > 0` and film's HDR value (or `"—"` if null) not in set, exclude.
- If `filters.codecs.size > 0` and film's codec not in set, exclude.
- If `filters.decades.size > 0`, exclude if film's year is null OR `Math.floor(film.year / 10) * 10` not in set.

### Helpers (from `filters.ts`)

- **`toggleSetItem(set, item)`** — adds item if not present, removes if present. Returns new Set.
- **`filtersActive(filters)`** — returns total count of selected items across all dimensions.
- **`EMPTY_FILTERS`** — Filters object with all dimensions as empty Sets.

### Constants (from `filters.ts`)

- `RESOLUTIONS = ["4K", "1080p", "720p"]`
- `HDRS = ["DV", "HDR10", "HDR10+", "—"]` (where `"—"` = SDR; UI relabels as `"SDR"`).
- `CODECS = ["HEVC", "H264", "AV1"]`
- `DECADES = [{ decade: 1990, label: "'90s" }, { decade: 2000, label: "'00s" }, { decade: 2010, label: "'10s" }, { decade: 2020, label: "'20s" }]`

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#filter-slide).
