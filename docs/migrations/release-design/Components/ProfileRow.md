# ProfileRow (component)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — One library row in the Profiles tree. Expandable chevron, name+path, match progress bar, size, and actions (EDIT link).

## Files

- `design/Release/src/components/ProfileRow/ProfileRow.tsx`
- `design/Release/src/components/ProfileRow/ProfileRow.styles.ts`
- Shared constant: imported from `pages/Profiles/grid.ts` — `PROFILE_GRID_COLUMNS = "30px 1.3fr 0.7fr 0.6fr 80px"`

## Purpose

One library row in the Profiles tree view. Displays the profile name, path, match progress (with spinner during scan), size, and EDIT link. Expandable to reveal nested FilmRow children. Uses a 5-column grid layout shared with FilmRow via the `PROFILE_GRID_COLUMNS` constant.

## Visual

### Row container
- 5-column CSS grid: `gridTemplateColumns: PROFILE_GRID_COLUMNS` (`"30px 1.3fr 0.7fr 0.6fr 80px"`).
- `padding: 11px 24px`, `columnGap: 16px`, `cursor: pointer`.
- `background: var(--surface)` when expanded; transparent otherwise.

### Column 1: Chevron
- `<IconChevron>` (20×20 or similar).
- Rotated 90° when expanded via CSS `transform: rotate(90deg)`.
- Transition: `transitionProperty: transform`, `transitionDuration: 0.15s`.

### Column 2: Profile name + path
- Two-line stack: name (13px, `color: var(--text)`) + path (Mono 10px, `color: var(--text-muted)`, `letterSpacing: 0.04em`).
- Flex column, `rowGap: 2px`.

### Column 3: Match progress bar
- Flex row, `alignItems: center`, `columnGap: 8px`.
- **During scan (`profile.scanning`):**
  - Spinner: 10×10, `border: 1.5px solid var(--green)`, `border-top: transparent`, `animation: spin 0.9s linear infinite`.
  - Label: Mono 10px green, `"{done}/{total}"`.
- **Otherwise:**
  - Progress bar: 3px tall, `background: var(--surface-2)`, filled to `matchPct` width with green (or yellow when `unmatched > 0`).
  - Label: Mono 10px (yellow if unmatched, else muted), `"{round(matchPct)}%"`.

### Column 4: Size
- Mono 11px, `color: var(--text-dim)`, right-aligned.
- Renders formatted file size (e.g., "12.3 GB").

### Column 5: Actions
- Mono 9px, `letterSpacing: 0.12em`, `color: var(--text-muted)`, right-aligned.
- **While scanning:** `"SCANNING…"` (non-interactive text).
- **Otherwise:** `.editLink` (green Mono 9px, `letterSpacing: 0.16em`, underline with 3px offset, transitions on hover to white). Reads `"EDIT"` and links to `/profiles/:profileId/edit`.

### Expanded children (`children`)
- Rendered only when `expanded && children.length > 0`.
- Container: `paddingLeft: 30px`, `background: var(--bg-1)`, flex column.
- Houses the nested FilmRow children (via `children` prop or slot).

## Behaviour

### Props

- `profile: ProfileShape` — the library object (name, path, scanning, scanProgress, totalSize, etc.).
- `expanded: boolean` — whether the profile's children are currently visible.
- `onToggleExpand: (profileId: string) => void` — callback when the row is clicked (toggle expansion).
- `children?: React.ReactNode` — nested FilmRow elements (or a callback render function). Rendered only when `expanded && children.length > 0`.

### Click behaviour
- Clicking anywhere on the row (except the EDIT link) calls `onToggleExpand(profile.id)`.
- The EDIT link uses `e.stopPropagation()` to prevent toggle on click.

### Hover state
- Subtle background tint on hover (part of parent page-level styling in Profiles.tsx, not isolated to this component).

## Changes from Prerelease

- **Extraction:** OLD — ProfileRow was an inline component inside Dashboard.tsx. NEW — ProfileRow is a standalone component.
- **Identity:** OLD — red accent (red progress bar when unmatched). NEW — green progress bar + green EDIT link.
- **Affordance:** OLD — "RE-LINK" button (no-op). NEW — "EDIT" link that navigates to `/profiles/:profileId/edit`.

## Subcomponents

None. ProfileRow is a leaf component; FilmRow children are passed via the `children` prop.

## Porting checklist (`client/src/components/ProfileRow/`)

- [ ] Import `PROFILE_GRID_COLUMNS` from `pages/Profiles/grid.ts`
- [ ] 5-column grid: `gridTemplateColumns: PROFILE_GRID_COLUMNS`
- [ ] Row: `padding: 11px 24px`, `columnGap: 16px`, `cursor: pointer`, `background: var(--surface)` when expanded
- [ ] Column 1 (chevron): `<IconChevron>`, `transform: rotate(90deg)` when expanded, 0.15s transition
- [ ] Column 2 (name+path): flex column `rowGap: 2px`; name 13px white; path Mono 10px muted
- [ ] Column 3 (match bar):
  - [ ] When scanning: spinner (10×10, green border-top-transparent, 0.9s linear spin) + label `"{done}/{total}"` (Mono 10px green)
  - [ ] Otherwise: 3px progress bar (dark bg, green or yellow fill) + label `"{round(matchPct)}%"` (yellow if unmatched, else muted)
- [ ] Column 4 (size): Mono 11px, `color: var(--text-dim)`, right-aligned
- [ ] Column 5 (actions): Mono 9px muted at rest
  - [ ] While scanning: `"SCANNING…"` text (non-interactive)
  - [ ] Otherwise: `.editLink` (green Mono 9px, `letterSpacing: 0.16em`, underline 3px offset, hover white), navigates to `/profiles/:profileId/edit`
  - [ ] EDIT link uses `e.stopPropagation()` to prevent toggle on click
- [ ] Expanded children: rendered only when `expanded && children.length > 0`, in a `paddingLeft: 30px`, `background: var(--bg-1)` container
- [ ] Click row (except EDIT link): calls `onToggleExpand(profile.id)`
- [ ] Wire to real Profile data model (replace mock data)

## Status

- [x] Designed in `design/Release` lab — ProfileRow component extracted from Profiles page inline 2026-05-02, PR #48. Expandable chevron, name+path, scanning spinner with progress, size display, EDIT link (green). Grid layout shared with FilmRow via `PROFILE_GRID_COLUMNS` constant.
- [ ] Production implementation

## Notes

- **Grid layout sharing:** ProfileRow and FilmRow both use `PROFILE_GRID_COLUMNS = "30px 1.3fr 0.7fr 0.6fr 80px"` imported from `pages/Profiles/grid.ts`. This ensures column widths stay locked between parent rows and child rows, maintaining visual alignment across the tree.
- **Scanning indicator:** The spinner (border-top-transparent) provides a visual "loading" metaphor while the label `{done}/{total}` gives numeric feedback.
- **Match bar states:** The bar color changes from green (all matched) to yellow (some unmatched) — a subtle visual cue without requiring explicit text.
