# SearchSlide (component)

> Status: **done** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — TUI-style search results panel displayed inside the Library hero when the search input has focus or contains a query.
> Audited: 2026-05-02 — corrected eyebrow + status accents to match design source (`filtered (n)`, `n filter(s) on`); added ESC contract, Strings + Stories (M4 audit pass).

## Files

- `design/Release/src/components/SearchSlide/SearchSlide.tsx`
- `design/Release/src/components/SearchSlide/SearchSlide.styles.ts`

## Purpose

TUI-style hero panel for the search-active state. Renders a monospaced prompt row (giant `>` caret + query text + blinking cursor), status row (match counts, profile counts, filter indicator), and action buttons ([F] Filter / [ESC] Clear). Replaces the idle greeting when `heroMode === "searching"`.

## Visual

### Container (`slidePanel`)
- `flexGrow: 1`, `display: flex`, `flexDirection: column`, `rowGap: 20px`.
- `fontFamily: tokens.fontMono`, `color: tokens.colorText`, `paddingTop: 12px`.
- Flex column so action buttons stick to the bottom via `marginTop: auto` on the actions row.

### Eyebrow row (`slideEyebrow`)
- Mono 11px / `letterSpacing: 0.22em` / uppercase / `colorGreen`.
- Text pattern varies by state (matches design source `SearchSlide.tsx`):
  - No query, no filters: `"· search"`
  - Query, no filters: `"· query · {resultCount} result(s)"`
  - No query, filters active: `"· filtered · {resultCount} film(s)"`
  - Query + filters active: same as "Query, no filters" + append `" · "` + `<span slideEyebrowAccent>"{activeFilterCount} filter(s)"</span>` (white).
- Pluralization rule throughout: `count === 1 ? "result"/"film"/"filter" : "results"/"films"/"filters"`.
- The accent span uses `color: tokens.colorText` (white).

### Prompt row (`slidePromptRow`)
- `display: flex`, `alignItems: baseline`, `columnGap: 16px`.
- Mono **56px** / `lineHeight: 1` / `letterSpacing: -0.01em`.
- **Caret (`slidePromptCaret`):** green Mono `">"`.
- **Text (`slidePromptText`):** white, `display: inline-flex`, `alignItems: center`, `columnGap: 4px`, `minHeight: 1em`, `overflowX: hidden`, `whiteSpace: nowrap`. Renders `query.trim()` if present, empty string otherwise.
- **Cursor (`slidePromptCursor`):** green block cursor (`width: 12px`, `height: 0.85em`), glowing shadow: `boxShadow: 0 0 6px ${tokens.colorGreen}, 0 0 14px ${tokens.colorGreenGlow}`. Pulsing animation (1.05s ease-in-out):
  - 0%, 100%: `opacity: 1`, `transform: scaleY(1)`
  - 50%: `opacity: 0.25`, `transform: scaleY(0.86)`
- **Always visible** when in searching mode (no conditional render).

### Status row (`slideStatus`)
- Mono 12px / `letterSpacing: 0.06em` / `colorTextDim`.
- Flex row with wrap, `columnGap: 10px`, `rowGap: 6px`.
- Three variants (matches design source):
  - **Query (with or without filters):** `"{resultCount} of {totalMatched} match(es)"` + `·` (sep, `colorTextFaint`) + `"{profilesMatched} profile(s)"` + if filters active: `·` (sep) + `<span slideStatusAccent>"filtered ({activeFilterCount})"</span>` (green).
  - **No query, no filters:** `<span slideStatusHint>"type to search films, directors, genres"</span>` (italic, `colorTextMuted`).
  - **No query, filters active:** `"{resultCount} of {totalMatched} films · {profilesMatched} profile(s) · "` + `<span slideStatusAccent>"{activeFilterCount} filter(s) on"</span>` (green).

### Actions row (`slideActions`)
- `marginTop: auto` (push to bottom).
- `display: flex`, `alignItems: center`, `columnGap: 20px`, `paddingTop: 16px`, `flexWrap: wrap`.
- **Primary (`slidePrimary`):** `"[F] Filter"` — green underlined text, Mono 13px / `letterSpacing: 0.18em` / uppercase. `textDecorationColor: tokens.colorGreen`, `textUnderlineOffset: 5px`, `textDecorationThickness: 1px`. Transition `color, text-decoration-color` on 0.15s. Hover: text + underline → `tokens.colorText` (white). `onClick={onOpenFilter}`.
- **Secondary (`slideSecondary`):** `"[ESC] Clear"` — grey underlined text, Mono 12px / `letterSpacing: 0.18em` / uppercase. `color: tokens.colorTextMuted`, `textDecorationColor: rgba(232, 238, 232, 0.35)` (faint white). Same underline styling. Hover: white. `onClick={onClear}`.

## Behaviour

### Props

- `query: string` — the current search query (trimmed display value).
- `resultCount: number` — films matching the current query + filters.
- `totalMatched: number` — films matching the current query (ignoring filters).
- `profilesMatched: number` — profiles (libraries) containing at least one matched film.
- `activeFilterCount: number` — total number of selected filter items (across all dimensions).
- `onOpenFilter: () => void` — callback when [F] Filter button is clicked.
- `onClear: () => void` — callback when [ESC] Clear button is clicked.

### Rendering

- Eyebrow updates based on query presence, filter status.
- Prompt caret always green; text white; cursor always visible and pulsing.
- Status row updates counts dynamically.
- Action buttons always present.

## Changes from Prerelease

This component is new in Release — no Prerelease equivalent. In Prerelease, the Library page had a simple search bar but no TUI-style search state display.

## Porting checklist (`client/src/components/SearchSlide/`)

- [ ] Container: `flexGrow: 1`, flex column, `rowGap: 20px`, Mono, `color: colorText`, `paddingTop: 12px`
- [ ] Eyebrow: Mono 11px uppercase, green, dynamic text pattern (no query / query / query+filters)
- [ ] Eyebrow accent span (filter count): white text
- [ ] Prompt row: flex, `columnGap: 16px`, `alignItems: baseline`, Mono 56px, `lineHeight: 1`, `letterSpacing: -0.01em`
- [ ] Caret: green `">"`, fixed
- [ ] Text: white, `display: inline-flex`, `overflowX: hidden`, `whiteSpace: nowrap`, renders `query.trim()` or empty
- [ ] Cursor: green block `width: 12px`, `height: 0.85em`, `boxShadow: 0 0 6px colorGreen, 0 0 14px colorGreenGlow`; pulsing animation 1.05s ease-in-out (`scaleY(1)` → `scaleY(0.86)` at 50%)
- [ ] Cursor always visible (no conditional render)
- [ ] Status row: Mono 12px, `letterSpacing: 0.06em`, flex row wrap, `columnGap: 10px`, `rowGap: 6px`, `colorTextDim`
- [ ] Status with query: `"{resultCount} of {totalMatched} match(es)" · "{profilesMatched} profile(s)"` + filter indicator if active (green accent span)
- [ ] Status without query, no filters: italic hint text `"type to search films, directors, genres"` in `colorTextMuted`
- [ ] Status without query, filters active: `"{resultCount} of {totalMatched} films · {profilesMatched} profile(s) · {activeFilterCount} filter(s) on"` (normal text, not hint)
- [ ] Status accent span (filter count): green text
- [ ] Actions row: `marginTop: auto`, flex, `columnGap: 20px`, `paddingTop: 16px`, `flexWrap: wrap`
- [ ] Primary action: `"[F] Filter"` green underlined text (Mono 13px uppercase), hover white; calls `onOpenFilter()`
- [ ] Secondary action: `"[ESC] Clear"` grey underlined text (Mono 12px uppercase), hover white; calls `onClear()`
- [ ] Wire `onOpenFilter` and `onClear` callbacks to parent Library state machine

## ESC + keyboard contract

ESC handling is **parent-owned** by `LibraryPage`'s top-level keyboard handler — it clears query/filters and returns the hero to `idle` mode. SearchSlide's `[ESC] Clear` button calls `onClear()` for click-only access; the actual ESC keypress wiring lives in the page so it works even when focus is in the search input.

## Strings (`SearchSlide.strings.ts`)

| Key | Value | Used as |
|---|---|---|
| `eyebrowSearch` | `"search"` | Idle eyebrow |
| `eyebrowQuery` | `"query"` | Eyebrow prefix when query present |
| `eyebrowFiltered` | `"filtered"` | Eyebrow when filters active without query |
| `result` / `results` | `"result"` / `"results"` | Pluralized count |
| `film` / `films` | `"film"` / `"films"` | Pluralized count for filter-only |
| `filter` / `filters` | `"filter"` / `"filters"` | Pluralized count for filter accent |
| `match` / `matches` | `"match"` / `"matches"` | Pluralized status word |
| `profile` / `profiles` | `"profile"` / `"profiles"` | Pluralized profile count |
| `statusFiltered` | `"filtered ({n})"` | Green accent when query AND filters |
| `statusFiltersOn` | `"{n} filter(s) on"` | Green accent when no-query AND filters |
| `statusHint` | `"type to search films, directors, genres"` | Italic hint when idle |
| `actionFilter` | `"[F] Filter"` | Primary action button |
| `actionClear` | `"[ESC] Clear"` | Secondary action button |

## Stories (`SearchSlide.stories.tsx`)

| Story | Setup | What it verifies |
|---|---|---|
| Idle | empty query, no filters | "search" eyebrow + italic hint, cursor pulsing |
| WithQuery | `query: "blade"`, results > 0 | Query echoed in 56px monospace + result count |
| WithQueryNoMatch | `query: "xyzzy"`, `resultCount: 0` | "0 of 0 matches" status |
| FiltersOnly | empty query, `activeFilterCount: 2` | "filtered" eyebrow, green accent status |
| QueryAndFilters | `query: "noir"`, `activeFilterCount: 3` | Both eyebrow accent and status accent shown |
| LongQuery | 60-char query | Text overflows + clips inside `overflow-x: hidden` |

## Status

- [x] Designed in `design/Release` lab — SearchSlide component extracted from Library's inline hero-mode panel 2026-05-02, PR #48. TUI-style monospaced prompt, status display, and action buttons. Pulsing green cursor, dynamic eyebrow/status based on query/filter state. Updated 2026-05-02 (follow-up): three eyebrow branches (no query / query / filters only) and three status branches (no query+no filters / query / no query+filters). Filters now apply against the full library even without a query.
- [ ] Production implementation
