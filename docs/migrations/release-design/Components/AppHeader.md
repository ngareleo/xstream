# AppHeader

> Status: **done** (Spec) · **not started** (Production) · last design change **2026-05-01**

## Files

- `design/Release/src/components/AppHeader/AppHeader.tsx`
- `design/Release/src/components/AppHeader/AppHeader.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/components/AppHeader/`

## Purpose

Top header strip — brand wordmark on the left, searchable + functional search input in the centre-left, scan trigger on the far right. Lives inside [`AppShell`](AppShell.md), spans both grid columns.

## Visual

### Header shell
- `gridArea: head`, `position: relative`, `zIndex: 10`.
- `gridTemplateColumns: ${tokens.sidebarWidth} 1fr auto` — brand cell aligned to the sidebar width, search occupies the middle, scan button auto-sizes on the right.
- **Glass treatment**:
  - `backgroundImage: linear-gradient(180deg, rgba(20,28,24,0.55) 0%, rgba(8,11,10,0.78) 100%)`
  - `backgroundColor: rgba(8,11,10,0.62)` (fallback under the gradient)
  - `backdropFilter: blur(20px) saturate(1.6)` (+ `-webkit-` prefix)
  - `borderBottom: 1px solid rgba(37,48,42,0.45)` — soft division from main
  - `boxShadow: inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.18), 0 6px 22px rgba(0,0,0,0.42)` — top sheen + bottom shadow
- The header is a sibling row in the AppShell grid (not absolute over main); the glass effect is therefore **cosmetic** — `backdrop-filter` only affects content within the same grid row. If a true overlay-glass is desired later, the AppShell grid must be restructured (see [`AppShell.md`](AppShell.md)).

### Brand cell
- `paddingLeft/Right: 18px`, no border (no vertical divider between brand and search — this was removed in the iteration session).
- `<Link to="/">` with `aria-label="Xstream — home"`, two spans:
  - `<span>X</span>` — Anton, 26px, `letter-spacing: -0.02em`, `color: var(--green)`, `text-shadow: 0 0 12px var(--green-glow)`
  - `<span>stream</span>` — same font/size, `color: var(--text)`

### Search cell (the form element)
- `width: 380px`, `justifySelf: start` — pinned compact, sits adjacent to brand instead of stretching across the column.
- `marginTop/Bottom: 8px`, `marginLeft: 14px`, `marginRight: 0`.
- `paddingLeft/Right: 14px`, `borderRadius: ${tokens.radiusMd}` (4px on all corners).
- **Background — horizontal-fade gradient** (so the box's left/right edges blend into the header instead of forming a hard rectangle):
  - At rest: `linear-gradient(90deg, rgba(20,28,24,0) 0%, rgba(20,28,24,0.55) 22%, rgba(20,28,24,0.55) 78%, rgba(20,28,24,0) 100%)`
  - On focus (`searchCellFocused`): same shape, alpha `0.78` instead of `0.55`
  - On hover (`searchCellHover`, only when not focused): animates the gradient between `rgba(20,28,24,0.45)` and `rgba(28,40,34,0.7)` over 3.4s ease-in-out infinite, with an outer `box-shadow: 0 0 14px var(--green-soft)` at the apex
- `backgroundColor: transparent` (the gradient does the work).
- **No border, no outline.** `outlineWidth: 0` on the form; `outlineStyle: none` on the input. *Both* are required because Chromium's `:focus-visible` UA outline renders even at `outline-width: 0` when `outline-style` is `auto` (the UA default).

### Search icon
- `<IconSearch>`, `color: var(--green)`, flex-shrink 0, sits in the columnGap row (10px gap to the input wrap).

### Input
- `width: 100%`, height 100%, transparent bg, no border, `outline-style: none`.
- `color: var(--text)`, JetBrains Mono 12px, `letter-spacing: 0.08em`.
- `paddingRight: 16px` (room for the custom caret).
- `caret-color: transparent` — native caret hidden.
- `::placeholder` styled `color: var(--text-muted)`, `letter-spacing: 0.12em`, `text-transform: uppercase`.
- Placeholder text `"Search films, profiles, paths…"`, **hidden when focused** (`placeholder={focused ? "" : PLACEHOLDER}` in TSX).

### Custom pulsing caret
- A `<span>` rendered only when `focused`, absolutely positioned inside `inputWrap`.
- Geometry: `8px × 16px`, `top: 50%`, `marginTop: -8px`, 1px corner radius.
- Colour: `backgroundColor: var(--green)`, `box-shadow: 0 0 6px var(--green), 0 0 16px var(--green-glow)`.
- **Position pinned to end-of-text** via a hidden mirror span:
  - `<span ref={mirrorRef} className={s.mirror}>{query}</span>` rendered alongside the input with the same font + size, `position: absolute`, `visibility: hidden`, `white-space: pre`.
  - `useLayoutEffect(() => setCaretX(mirrorRef.current?.offsetWidth ?? 0), [query, focused])` measures the rendered text width.
  - Caret is positioned via inline `style={{ left: \`${caretX}px\` }}`.
- Animation: keyframes `{ "0%, 100%": { opacity: "1", transform: "scaleY(1)" }, "50%": { opacity: "0.25", transform: "scaleY(0.86)" } }`, 1.05s ease-in-out infinite.

### Scan button
- Mirrors the Prerelease `btn` idiom (transparent + no border + JetBrains Mono uppercase). Only the colour cue is Xstream-green.
- `paddingTop/Bottom: 8px`, `paddingLeft/Right: 14px`.
- `backgroundColor: transparent`, `border-width: 0` on all sides, `outlineStyle: none`.
- `color: var(--text-muted)` at rest, JetBrains Mono 11px / `letter-spacing: 0.18em` / uppercase.
- `transition: color, text-shadow ${tokens.transition}`.
- `:hover`: `color: var(--green)`, `text-shadow: 0 0 6px var(--green), 0 0 16px var(--green-glow)`.

## Behaviour

### Search submit
- `<form onSubmit={submit}>` wraps icon + input + suggestions.
- On submit:
  - If a suggestion is highlighted, `navigate(suggestion.href)`.
  - Else if `query.trim()`, `navigate(\`/library?q=${encodeURIComponent(query.trim())}\`)`.
  - Then clear `query` + blur input.

### Suggestions dropdown
- Sourced live from `films` and `profiles` in `src/data/mock.ts` (production: replace with backend search query).
- Films match on `title` / `director` / `filename` (case-insensitive substring), max 5.
- Profiles match on `name` / `path`, max 3.
- Shown when `focused && (suggestions.length > 0 || query.trim().length > 0)`.
- Empty state when query is non-empty but matches `[]`: `"No matches — press Enter to search"`.
- Item shape: `<span class={suggLabel}>{label}</span>` (Inter 13px, `var(--text)`) + `<span class={suggMeta}>` (JetBrains Mono 10px, `var(--text-muted)`, prefixed `FILM · ` or `LIBRARY · ` then the meta line).
- Highlight via state `highlight: number`. Highlighted row gets `backgroundColor: var(--green-soft)` (inline style; takes precedence over the shared `:hover` rule).
- Mouse-enter on a row updates `highlight` so click-area state stays in sync.

### Keyboard navigation
- `ArrowDown` / `ArrowUp` move highlight, clamped `[0, suggestions.length - 1]`.
- `Enter` triggers `submit` (handled by the form, not key handler).
- `Escape` clears `query` and blurs.

### Mouse navigation
- `onMouseDown` on a suggestion item calls `e.preventDefault()` (prevents input blur from firing first), then `navigate(suggestion.href)`, clears, blurs.
- Click navigates: film → `/library?film=<id>`, profile → `/library?profile=<id>`.

### Scan button click
- Calls `handleScan()`. If already `scanning`, no-op.
- Sets `scanning = true`, `setTimeout(() => setScanning(false), 2000)`.
- Label flips: `"Scan"` → `"Scanning…"`.
- `<IconRefresh>` gets `s.scanIconSpinning` class — `animationName: { to: { transform: "rotate(360deg)" } }`, 1.1s linear infinite.
- `aria-busy={scanning}` on the button.
- Production: replace the `setTimeout` with a `scanLibraries` mutation; reflect job state in `scanning`.

### Suggestions dropdown — animation
- `position: absolute`, `top: calc(100% + 6px)`, `left/right: 0`.
- Translucent bg (`rgba(10,13,12,0.92)`), `backdrop-filter: blur(18px) saturate(1.4)`, border `var(--border)`, `box-shadow: 0 18px 40px rgba(0,0,0,0.55)`.
- `animationName: { from: { opacity: 0, transform: translateY(-4px) }, to: { opacity: 1, transform: translateY(0) } }`, 0.14s ease-out fillMode both.

### Accessibility
- Form `role="search"`.
- Input `aria-label="Search"`, `aria-autocomplete="list"`, `aria-expanded={showSuggestions}`, `aria-controls="header-search-suggestions"`, `spellCheck={false}`, `autoComplete="off"`.
- Suggestions list `id="header-search-suggestions"`, `role="listbox"`, items `role="option"`, `aria-selected={idx === highlight}`.
- Caret span `aria-hidden="true"`. Mirror span `aria-hidden="true"`. Search icon span `aria-hidden="true"`.
- Scan button `aria-busy={scanning}`.
- Brand link `aria-label="Xstream — home"`.

### Mock data shapes
The component reads `films` (Film[]) and `profiles` (Profile[]) from `~/data/mock.ts`. Production: replace with a Relay query / GraphQL fetch. Suggestion shape is internal to the component:
```ts
interface Suggestion {
  id: string;          // "film:<id>" or "profile:<id>"
  kind: "film" | "profile";
  label: string;
  meta: string;        // "<year> · <resolution> · <profile>" or "<path>"
  href: string;
}
```

## Porting checklist (`client/src/components/AppHeader/`)

- [ ] Glass treatment matches: gradient + backdrop-filter + inner highlight + drop shadow
- [ ] No vertical divider between brand cell and search
- [ ] Brand wordmark Anton 26px, X in `var(--green)` with `text-shadow: 0 0 12px var(--green-glow)`
- [ ] Search input pinned to ~380px with `justifySelf: start`, sits adjacent to brand
- [ ] Search box background uses horizontal `linear-gradient` fade — transparent at 0%/100%, opaque from 22%–78%
- [ ] No border on the search box
- [ ] **`outline-style: none` on the input** (Chromium UA `:focus-visible` ring suppressed — `outline-width: 0` alone is insufficient)
- [ ] Placeholder hidden when focused (`placeholder={focused ? "" : PLACEHOLDER}`)
- [ ] Native caret hidden via `caret-color: transparent`
- [ ] Custom 8×16 green pulsing caret pinned to end-of-text via hidden mirror span (`useLayoutEffect` measures `offsetWidth`)
- [ ] Caret animation: opacity 1↔0.25 + scaleY 1↔0.86, 1.05s ease-in-out infinite, with green glow
- [ ] Hover breathing animation only when **not** focused (`mergeClasses(s.searchCell, !focused && s.searchCellHover, focused && s.searchCellFocused)`)
- [ ] Search wired to backend search API (films + libraries) — replace mock filter
- [ ] Suggestions dropdown: ArrowDown/Up moves highlight, Enter selects (submit), Escape clears + blurs, click navigates
- [ ] Empty-results message `"No matches — press Enter to search"`
- [ ] Suggestion item: label (Inter 13) + meta (Mono 10, prefixed `FILM · ` / `LIBRARY · `)
- [ ] Suggestions dropdown styled with own translucent bg + backdrop-blur + entry animation translateY -4px → 0 over 0.14s
- [ ] Scan button: transparent bg, no border, JetBrains Mono uppercase, text-muted → green text-shadow glow on hover
- [ ] Scan button wired to `scanLibraries` mutation (replaces the 2s mock timer)
- [ ] Refresh icon spins (1.1s linear infinite) while scanning; `aria-busy` toggled
- [ ] Brand link `aria-label="Xstream — home"`; form `role="search"`; input has full ARIA (`aria-autocomplete`, `aria-expanded`, `aria-controls`)

## Status

- [x] Designed in `design/Release` lab — last change **2026-05-01**
- [ ] Production implementation
