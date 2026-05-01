# Profiles (page)

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/pages/Profiles/Profiles.tsx`
- `design/Release/src/pages/Profiles/Profiles.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/pages/Dashboard/`

## Purpose

Profile-tree directory (`/profiles`). Each library expands to reveal its films; selecting a film opens [`DetailPane`](DetailPane.md) in a drag-resizable right column. The page opens directly at the breadcrumb — there is no hero.

## Visual

### Split-body grid (`splitBody` + `splitBodyOpen`)
- Closed: `gridTemplateColumns: "1fr 0px 0px"`.
- Open: `gridTemplateColumns: \`1fr 4px ${paneWidth}px\`` (overridden inline so the `useSplitResize`-driven width animates smoothly).
- `height: 100%`, `transition: grid-template-columns ${transitionSlow}` (0.25s ease).
- **`paddingTop: tokens.headerHeight`, `boxSizing: border-box`** — the page is responsible for its own header clearance (AppShell no longer reserves a header row). The split-body starts below the header.
- `isResizing` adds `transitionProperty: none` so the drag is jank-free.

### Left column (`leftCol`)
Flex column, `overflow: hidden`, `position: relative`.

### Breadcrumb
- Path-style breadcrumb: `~ / media / films` with the leaf in `var(--text)`, others muted.
- Trailing `breadcrumbScanning` chunk: `● scanning {scanningCount} of {profiles.length}` (when any profile is currently scanning).

### Column header (`colHeader`)
- 5-column grid header row: `[chevron] · Profile / File · Match · Size · [actions]`.

### Rows scroll (`rowsScroll`)
- Maps `profiles` to `<ProfileRow>` (subcomponent below).

### Footer
- Sticky bottom row: `{profiles.length} PROFILES · {totalFilms} FILMS · {totalUnmatched} UNMATCHED` + `+ NEW PROFILE` CTA button.

### Resize handle
- Visible only when `paneOpen`. `<div onMouseDown={onResizeMouseDown}>` with `backgroundColor: tokens.colorBorder`, `cursor: col-resize`, `:hover` flips to `tokens.colorGreen`.

## Behaviour

### URL pane state
- `?film=<id>` — selected film. `useSearchParams()` reads/writes.
- `openFilm(id)`:
  - If `filmId === id`, clear params (toggle close).
  - Else `setParams({ film: id })`.
- `closePane()` clears params.

### Expansion state
- Local `expandedIds: Set<string>`.
- Initial state pre-expands `profiles[0]` AND the profile containing the selected film (so deep-link to `?film=<id>` opens the right tree branch).
- `toggleProfile(id)` adds/removes from the set.

### Drag-resize
- `useSplitResize` hook returns `paneWidth`, `containerRef`, `onResizeMouseDown`. Inline style on `splitBody` overrides the static `splitBodyOpen` columns when the pane is open.

## Subcomponents

### `ProfileRow` (inline)
- 5-column grid row: chevron · name+path · match-bar · size · actions.
- `padding: 11px 24px`, gap 16, `cursor: pointer`.
- `background: var(--surface)` when expanded.
- Chevron: `<IconChevron>` rotated 90° when expanded with 0.15s transition.
- Name: 13px, `color: var(--text)`. Path: Mono 10px, `color: var(--text-muted)` / 0.04em.
- **Match bar**:
  - When `profile.scanning`: shows a 10×10 spinner (`border: 1.5px solid var(--green)`, `border-top: transparent`, `animation: spin 0.9s linear infinite`) + `{done}/{total}` in Mono 10px green.
  - Otherwise: 3px tall progress bar (`background: var(--surface-2)`) filled to `matchPct` width with green (or yellow when `unmatched > 0`); right-side label `{round(matchPct)}%` in Mono 10px (yellow if unmatched, else muted).
- Size cell: Mono 11px / `var(--text-dim)`.
- Actions cell: Mono 9px / 0.12em / muted, right-aligned. Shows `SCANNING…` while scanning, else `EDIT · ↻`.
- Children render only when `expanded && children.length > 0`, in a `paddingLeft: 30px, background: var(--bg-1)` container.

### `FilmRow` (inline, nested under `ProfileRow`)
- Same 5-column grid, `padding: 8px 24px`.
- Selected: `background: var(--green-soft)`, `borderLeft: 2px solid var(--green)` (transparent border when not selected so layout doesn't shift).
- Poster thumbnail: 26×38, `border: 1px solid var(--border)`.
- Title: 12px / `var(--text)`. Year suffix: `· {year}` in `var(--text-muted)`.
- Sub-line: `{genre.toUpperCase()} · {duration}` in Mono 10px / `var(--text-muted)`.
- Chip group: green resolution chip + (optional) HDR chip (font-size 9, padding `2px 5px`).
- Rating: `<ImdbBadge>` + `{rating}` in yellow (when present).
- Play link: `<Link to="/player/:id">` styled as a small button. Selected variant gets green bg + green-ink text; unselected gets transparent + 1px border.
- `e.stopPropagation()` on the play-link click so it doesn't toggle selection.

## Changes from Prerelease

- **Route:** OLD — primary home route `/` (was `<Dashboard>`). NEW — secondary route `/profiles`.
- **Component name:** OLD — `<Dashboard>` at `pages/Dashboard/`. NEW — `<Profiles>` at `pages/Profiles/`.
- **Hero:** OLD — a full-width slideshow hero existed above the profile directory in the Dashboard (Prerelease `<Slideshow>` component, cycling 4 images, greeting overlay). NEW — no hero. The page opens directly at the breadcrumb. (A hero slideshow with Ken Burns was added in commit e088fb5, then removed in commit 04ea22b — the final state is no hero.)
- **URL pane state:** OLD — Dashboard used `?pane=film-detail&filmId=xxx` (two params: `pane` and `filmId`). NEW — Profiles uses `?film=<id>` (single param, matching the Library pattern).
- **Pane width:** OLD — `useSplitResize(360)` — 360px default pane width. NEW — same hook, pane width unchanged at 360px (Release `useSplitResize` call still passes 360).
- **Header clearance:** OLD — the AppShell grid reserved a 52px header row; Dashboard did not need to add any `paddingTop`. NEW — `splitBody` adds `paddingTop: tokens.headerHeight, boxSizing: border-box` because the shell no longer reserves a grid row.
- **AppHeader rendering:** OLD — Dashboard rendered its own `<AppHeader>` as a direct child, placing it in the `gridArea: head` grid cell. NEW — AppHeader is rendered by `<AppShell>` (absolute layer); Profiles does not render its own header.
- **NewProfilePane:** OLD — Dashboard had a `<NewProfilePane>` form rendered in the right rail when `?pane=new-profile` was set. NEW — no equivalent in Release Profiles (the `+ NEW PROFILE` footer button exists but has no handler — `TODO(redesign)`).
- **Film detail surface:** OLD — `<FilmDetailPane>` inline component with gradient-placeholder 200px hero + re-link/linking toggle. NEW — Release `<Profiles>` uses the standalone `<DetailPane>` component (with real OMDb poster via `<Poster>`).
- **Identity:** Active film row: OLD — `background: var(--red-dim)`, `borderLeft: 2px solid var(--red)`. NEW — `background: var(--green-soft)`, `borderLeft: 2px solid var(--green)`. Match bar: OLD — filled red when unmatched. NEW — filled yellow when unmatched.

## TODO(redesign)

- `+ NEW PROFILE` footer button has no handler. Needs URL pane state (e.g. `?pane=new-profile`) + form pane.
- "EDIT · ↻" actions string is decorative — no onClick handlers wired.

## Porting checklist (`client/src/pages/Profiles/`)

- [ ] Split-body grid: `1fr 0px 0px` closed, `1fr 4px <paneWidth>px` open, with `transitionSlow` ease; `paddingTop: tokens.headerHeight`, `boxSizing: border-box` (page manages header clearance)
- [ ] `useSplitResize` for drag-resize handle + `isResizing` no-transition state
- [ ] Breadcrumb path with scanning indicator (page opens here — no hero above it)
- [ ] 5-column ProfileRow: chevron / name+path / match-bar / size / actions
- [ ] Match bar: green (or yellow if unmatched) progress fill OR spinner during scan
- [ ] Expanded ProfileRow shows nested FilmRow children with `bg-1` background
- [ ] FilmRow selected state: green-soft bg + 2px green left border (transparent when not selected to prevent shift)
- [ ] Play link in FilmRow uses `e.stopPropagation()` so row toggle doesn't fire
- [ ] URL pane state: `?film=<id>` (toggle off on second click)
- [ ] Pre-expand profile containing the deep-linked film
- [ ] Footer: counts in Mono uppercase + `+ NEW PROFILE` CTA wired to GraphQL mutation

## Status

- [x] Designed in `design/Release` lab — hero cycling + Ken Burns + animated edge fade landed 2026-05-01, PR #46 commit e088fb5; hero then removed in same PR commit 04ea22b (page now opens at breadcrumb). `splitBody` gains `paddingTop: tokens.headerHeight, boxSizing: border-box` for positioned-shell header clearance (2026-05-01, PR #46 commit 5301df6). Remaining `TODO(redesign)` items: `+ NEW PROFILE` handler, EDIT/rescan actions.
- [ ] Production implementation
