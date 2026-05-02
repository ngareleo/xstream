# FilterSlide (component)

> Status: **done** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — TUI-style filter table panel displayed inside the Library hero when the filter mode is active.
> Audited: 2026-05-02 — pinned constants from `filters.ts` (HDRS, CODECS, DECADES); resolved HDR-null + decade-format TODOs; added Strings + Stories (M4 audit pass).

## Files

- `design/Release/src/components/FilterSlide/FilterSlide.tsx`
- `design/Release/src/components/FilterSlide/FilterSlide.styles.ts`
- `design/Release/src/components/FilterSlide/filters.ts` — filter types, constants, helpers (`applyFilters`, `filtersActive`, `toggleSetItem`, `EMPTY_FILTERS`)

## Purpose

TUI-style hero panel for the filter-active state. Renders a monospaced table with toggle checkboxes for each filter dimension (resolution, HDR, codec, decade). Replaces the SearchSlide when `heroMode === "filtering"`.

## Visual

### Container (`slidePanel`)
- Same as SearchSlide: `flexGrow: 1`, `display: flex`, `flexDirection: column`, `rowGap: 20px`.
- `fontFamily: tokens.fontMono`, `color: tokens.colorText`, `paddingTop: 12px`.

### Eyebrow row (`slideEyebrow`)
- Mono 11px / uppercase / `colorGreen`.
- Text pattern: `"· filters"` + if query: `" · {query.trim()}"` + always show arrow: `" · "` + `<span slideEyebrowAccent>"{totalMatched} → {resultCount}"` (white).
- The accent span uses `color: tokens.colorText` (white).
- The `totalMatched → resultCount` arrow is now always present (even without a query, since `totalMatched = films.length` and filters narrow from there).

### TUI table (`tuiTable`)
- `display: flex`, `flexDirection: column`, `rowGap: 10px`, Mono 13px.
- `paddingTop/Bottom: 8px`, `paddingLeft/Right: 16px`.
- Left border: 1px `colorBorder`.
- Background: `rgba(20, 24, 22, 0.55)` (semi-transparent dark).

#### Filter rows (`tuiRow`)
- CSS grid `gridTemplateColumns: 120px 1fr`, `columnGap: 16px`, `alignItems: center`.
- **Label (`tuiRowLabel`):** Mono 11px / `letterSpacing: 0.22em` / uppercase / `colorTextFaint`. Renders dimension name: `"resolution"`, `"hdr"`, `"codec"`, `"decade"`.
- **Options (`tuiRowOptions`):** `display: flex`, `flexWrap: wrap`, `columnGap: 16px`, `rowGap: 6px`. Houses 3–4 `<TuiToggle>` buttons.

#### TUI toggle button (`tuiToggle`)
- `<button type="button">` with `aria-pressed={checked}`.
- Mono 13px / `letterSpacing: 0.04em`.
- `color: tokens.colorTextDim` at rest, `tokens.colorText` on hover.
- When checked: `color: tokens.colorGreen` (and stays green on hover).
- Inline-flex, `columnGap: 8px`, renders:
  - **Box (`tuiToggleBox`):** Mono, color inherited from parent. Renders `"[x]"` when checked, `"[ ]"` when unchecked.
  - **Label:** the filter option label (e.g., `"4K"`, `"HDR10"`, `"HEVC"`, `"'90s"`). Special case: HDR value `"—"` is labeled as `"SDR"`.
- Clicking calls `setFilters((f) => ({ ...f, <dimension>: toggleSetItem(f.<dimension>, item) }))`.

### Actions row (`slideActions`)
- Same layout as SearchSlide: `marginTop: auto`, flex, `columnGap: 20px`, `paddingTop: 16px`.
- **Primary (`slidePrimary`):** `"[↩] Done"` — green underlined text (Mono 13px uppercase). Hover white. `onClick={onClose}`.
- **Secondary (`slideSecondary`):** `"[⇧⌫] Clear"` — grey underlined text (Mono 12px uppercase). `disabled={active === 0}` (where `active = filtersActive(filters)`). When disabled: `opacity: 0.35`, `cursor: not-allowed`. Hover white (when enabled). `onClick={onClearFilters}` (sets all filters to empty Sets).
- **Hint (`slideHint`):** `marginLeft: auto`, Mono 10px / `letterSpacing: 0.12em` / `colorTextFaint` / uppercase. Text: `"{profiles.length} libraries · {totalMatched} matches before filters"`.

## Behaviour

### Props

- `query: string` — the current search query (for eyebrow display).
- `filters: Filters` — the Filters object: `{ resolutions: Set<Resolution>, hdrs: Set<Hdr>, codecs: Set<Codec>, decades: Set<number> }`.
- `setFilters: React.Dispatch<React.SetStateAction<Filters>>` — state setter.
- `resultCount: number` — films matching the current query + filters.
- `totalMatched: number` — films matching the query alone (before filters).
- `onClose: () => void` — callback when [↩] Done button is clicked.
- `onClearFilters: () => void` — callback when [⇧⌫] Clear button is clicked.

### Filter application

**`applyFilters(list: Film[], filters: Filters): Film[]`** — if no filters active, return list unchanged. Otherwise, exclude films that don't match **all** active filter dimensions:
- If `filters.resolutions.size > 0` and film's resolution not in set, exclude.
- If `filters.hdrs.size > 0` and film's HDR value (or `"—"` if null) not in set, exclude.
- If `filters.codecs.size > 0` and film's codec not in set, exclude.
- If `filters.decades.size > 0`, exclude if film's year is null OR `Math.floor(film.year / 10) * 10` not in set.

### Helpers (from `filters.ts`)

- **`toggleSetItem(set: Set<T>, item: T): Set<T>`** — adds item if not present, removes if present. Returns a new Set.
- **`filtersActive(filters: Filters): number`** — returns the total count of selected items across all dimensions.
- **`EMPTY_FILTERS`** — a Filters object with all dimensions as empty Sets. Used for reset.
- **Constants** (single source of truth: `filters.ts`):
  - `RESOLUTIONS: Resolution[] = ["4K", "1080p", "720p"]`
  - `HDRS: Hdr[] = ["DV", "HDR10", "HDR10+", "—"]` (where `"—"` represents SDR; UI relabels as `"SDR"`)
  - `CODECS: Codec[] = ["HEVC", "H264", "AV1"]`
  - `DECADES: { decade: number; label: string }[] = [{ decade: 1990, label: "'90s" }, { decade: 2000, label: "'00s" }, { decade: 2010, label: "'10s" }, { decade: 2020, label: "'20s" }]`
  - `EMPTY_FILTERS: Filters` — all four sets empty.

## Changes from Prerelease

This component is new in Release — no Prerelease equivalent. In Prerelease, there was no search or filter UI.

## Porting checklist (`client/src/components/FilterSlide/`)

- [ ] Container: same as SearchSlide (flexGrow, flex column, Mono)
- [ ] Eyebrow: Mono 11px uppercase, green, pattern: `"· filters" + optional query + count arrow` (arrow always shown: `totalMatched → resultCount`)
- [ ] TUI table: `display: flex`, `flexDirection: column`, `rowGap: 10px`, Mono 13px, semi-transparent dark bg, left border
- [ ] Four filter rows (or more if more dimensions added): resolution / HDR / codec / decade
- [ ] Each row: `gridTemplateColumns: 120px 1fr`, dimension label (left), toggle buttons (right)
- [ ] Toggle button: `[ ]` or `[x]` box + label, Mono 13px, `color: colorTextDim` at rest, `colorGreen` when checked
- [ ] Hover on toggle: `color: colorText` (when not checked), stay `colorGreen` (when checked)
- [ ] Clicking toggle calls `setFilters` with `toggleSetItem` helper
- [ ] Clear button disabled when no filters are active (`opacity: 0.35`, `cursor: not-allowed`)
- [ ] Actions row: `marginTop: auto`, flex, `columnGap: 20px`, `paddingTop: 16px`
- [ ] Primary action: `"[↩] Done"` green underlined text (Mono 13px), hover white; calls `onClose()`
- [ ] Secondary action: `"[⇧⌫] Clear"` grey underlined text (Mono 12px), hover white (enabled), disabled style when no filters; calls `onClearFilters()`
- [ ] Hint: `marginLeft: auto`, Mono 10px faint text (profile + match count display)
- [ ] Import and use `toggleSetItem`, `filtersActive`, `EMPTY_FILTERS` from `filters.ts`
- [ ] Wire `onClose` and `onClearFilters` callbacks to parent Library state machine
- [ ] Ensure filter application order: filters always narrow query results, never broaden them

## Decided 2026-05-02 (audit)

- **HDR null**: stored model uses `"—"` as the SDR sentinel. UI labels this as `"SDR"` via the toggle's `label === "—" ? "SDR" : label` branch. Keep this mapping in production.
- **Decade format**: `"'90s"` style (matches design source `DECADES` constant — short, monospace-friendly, fits the TUI aesthetic). Production uses the same `{ decade, label }` pair shape.

## Strings (`FilterSlide.strings.ts`)

| Key | Value | Used as |
|---|---|---|
| `eyebrow` | `"filters"` | Eyebrow prefix |
| `dimResolution` | `"resolution"` | Row label |
| `dimHdr` | `"hdr"` | Row label |
| `dimCodec` | `"codec"` | Row label |
| `dimDecade` | `"decade"` | Row label |
| `sdrLabel` | `"SDR"` | Display label for `"—"` HDR value |
| `actionDone` | `"[↩] Done"` | Primary action button |
| `actionClear` | `"[⇧⌫] Clear"` | Secondary action button |
| `hintFormat` | `"{libraries} libraries · {totalMatched} matches before filters"` | Bottom-right hint |
| `boxOn` / `boxOff` | `"[x]"` / `"[ ]"` | Toggle box glyphs |

## Stories (`FilterSlide.stories.tsx`)

| Story | Setup | What it verifies |
|---|---|---|
| Empty | `EMPTY_FILTERS` | All toggles `[ ]`, Clear button disabled |
| OneDimension | `resolutions: { "4K" }` | One green toggle in resolution row, Clear enabled |
| AllDimensions | one selected per dimension | Counter `totalMatched → resultCount` shrinks visibly |
| WithQuery | `query: "noir"` | Eyebrow shows `"· filters · noir · {n} → {m}"` |
| HdrSdr | `hdrs: { "—" }` | SDR toggle shows `"[x] SDR"` (mapped from `"—"`) |

## Status

- [x] Designed in `design/Release` lab — FilterSlide component extracted from Library's inline filter-mode panel 2026-05-02, PR #48. TUI table with four filter dimensions (resolution / HDR / codec / decade), checkbox toggles, dynamic hint. Filters narrowly query results (AND logic per dimension, OR logic within dimension). Updated 2026-05-02 (follow-up): eyebrow `totalMatched → resultCount` arrow always shown (meaningful even without a query, since filters apply against the full library).
- [ ] Production implementation

## Notes

- **Filter logic:** Filters always narrow the query results. A film must match the query AND all active filter dimensions to appear in results. Selecting no filters in a dimension means "include all values for that dimension."
- **Decade bucketing:** Films are grouped into 10-year buckets. A 1995 film belongs to the `1990` decade; a 2025 film belongs to the `2020` decade. The filter displays the bucket year (e.g. `"'90s"` for the 1990 bucket).
- **HDR null handling:** When `film.hdr === null`, it is treated as SDR (`"—"` in the model). The UI labels this as `"SDR"` for user clarity.
