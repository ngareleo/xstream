# Profiles (page)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 — FilmRow split into three click targets: poster → player page; row body → opens DetailPane; Play/Edit text links in right cell. FilmRow hover adds background tint + 2px green border (except when selected, which locks the green state). Poster thumbnail wraps in a `<button>` with green-tinted hover overlay (▶ Play icon) + scale effect.

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
- Only rendered when `showEmpty` is false — empty state replaces the entire layout when `?empty=1` is set.

### Footer
- Sticky bottom row: `{profiles.length} PROFILES · {totalFilms} FILMS · {totalUnmatched} UNMATCHED` + `+ NEW PROFILE` CTA button (links to `/profiles/new`).

### Empty state
- Gated by `?empty=1` search param in the design lab — previews the no-libraries UX.
- Large watermark text `"profiles"` in Anton 340px, top-right, at `-60px` bottom/right (alpha 0.022, pointer-events none).
- Radial dot grid background (`28px 28px` circles, white 1px, alpha 0.045).
- Content column: `flexDirection: column`, `rowGap: 20px`.
  - Eyebrow: Mono 10px green uppercase "· no libraries yet".
  - Headline: Anton 96px uppercase, split into two spans — "your collection" (white) + "starts here." (green).
  - Rule: 56px wide × 3px tall, green, `border-radius: 2px`.
  - Body text: 14px body font, `lineHeight: 1.65`, dimmed, max 360px wide.
  - Actions: flex row `columnGap: 20px`, contains a `<Link to="/profiles/new">` styled as `emptyCta` + a hint span (Mono 10px faint "⌘ N · paths can be local or networked").
  - `emptyCta`: Mono 12px green underline text, `textUnderlineOffset: 5px`, transition colour on hover to full white.

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

The Profiles page now delegates to two extracted child components:

### **`ProfileRow` component** (extracted to `components/ProfileRow/`)

One library row in the tree. See [`ProfileRow.md`](ProfileRow.md) for the full spec. 5-column grid: chevron · name+path · match-bar · size · actions. Contains inline children (FilmRow list) with expandable state. Props: `profile`, `expanded`, `onToggleExpand`, `children`.

### **`FilmRow` component** (extracted to `components/FilmRow/`)

One film inside an expanded ProfileRow. See [`FilmRow.md`](FilmRow.md) for the full spec. Same 5-column grid layout. Click targets split: poster → player page; row body → opens DetailPane; Play/Edit text links are right-aligned. Props: `film`, `selected`, `onSelect`, `onOpenDetail`.

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

None. The `+ NEW PROFILE` footer button now links to `/profiles/new` (CreateProfile page); the "EDIT" link in the actions cell links to `/profiles/:profileId/edit` (EditProfile page). The empty state is live at `?empty=1`.

## Porting checklist (`client/src/pages/Profiles/`)

- [ ] Split-body grid: `1fr 0px 0px` closed, `1fr 4px <paneWidth>px` open, with `transitionSlow` ease; `paddingTop: tokens.headerHeight`, `boxSizing: border-box` (page manages header clearance)
- [ ] `useSplitResize` for drag-resize handle + `isResizing` no-transition state
- [ ] Breadcrumb path with scanning indicator (page opens here — no hero above it)
- [ ] 5-column ProfileRow: chevron / name+path / match-bar / size / actions
- [ ] Match bar: green (or yellow if unmatched) progress fill OR spinner during scan
- [ ] Expanded ProfileRow shows nested FilmRow children with `bg-1` background
- [ ] FilmRow at-rest: `background: transparent`, `borderLeft: 2px solid transparent`; `:hover`: `background: rgba(232, 238, 232, 0.05)`, `borderLeftColor: var(--border)`
- [ ] FilmRow selected state: `background: var(--green-soft)`, `borderLeft: 2px solid var(--green)`, `:hover` locked to green-soft (no flicker)
- [ ] Poster thumbnail (`filmThumbBtn`): 26×38 button, no visible bg; contains image + hover overlay; `:hover` adds `scale(1.05)` + green shadow
- [ ] Hover overlay (`filmThumbHover`): absolute fill, flexed center, displays `▶` in green, `backgroundColor: rgba(5, 7, 6, 0.55)`, `opacity: 0` → `1` on parent `:hover`
- [ ] Poster button navigates to `/player/:id` on click
- [ ] Right cell: two text-link buttons (`filmPlayAction` + `filmEditAction`) in `columnGap: 12px`
- [ ] `filmPlayAction`: green Mono 9px underline text, `letterSpacing: 0.16em`, uppercase, `textUnderlineOffset: 3px`; hover green → white; links to `/player/:id`
- [ ] `filmEditAction`: white Mono 9px underline text, faint white underline; hover white → green; wired to `/profiles/:profileId/edit` (or delete modal)
- [ ] Both Play and Edit buttons use `e.stopPropagation()` so clicks don't toggle row selection
- [ ] URL pane state: `?film=<id>` (toggle off on second click)
- [ ] Pre-expand profile containing the deep-linked film
- [ ] Footer: counts in Mono uppercase + `+ NEW PROFILE` CTA wired to `/profiles/new` (or create-profile mutation in GraphQL)
- [ ] Empty state: `?empty=1` design-lab toggle renders watermark + content section with headline/rule/body/CTA + hint
- [ ] "EDIT" action link wired to `/profiles/:profileId/edit`

## Extracted components (2026-05-02, PR #48)

The Profiles page is now a thin shell (ca. 160 lines) that delegates to two extracted child components. Each component has its own spec file and `.tsx` + `.styles.ts` pair in the design lab:

- [`ProfileRow.md`](ProfileRow.md) — 5-column library row with chevron, name+path, match-bar, size, actions (EDIT link)
- [`FilmRow.md`](FilmRow.md) — 5-column film row with poster button, metadata, chips, Play/Edit text links

Profiles.tsx owns the split-body grid, `useSplitResize` hook, URL pane state (`?film=<id>`), expansion state, empty state, and footer. Shared `PROFILE_GRID_COLUMNS = "30px 1.3fr 0.7fr 0.6fr 80px"` constant lives in `pages/Profiles/grid.ts` so both ProfileRow and FilmRow style sheets import it, keeping column widths locked together.

## Status

- [x] Designed in `design/Release` lab — components extracted 2026-05-02, PR #48. Profiles became a thinner page shell (~160 lines). ProfileRow handles expansion state, match-bar spinner, EDIT link. FilmRow handles click-target split (poster → player, body → detail pane), hover tints + green border (locked when selected to prevent flicker), Play/Edit text links. Each extracted child component has its own `.tsx` + `.styles.ts` + `.md` spec.
- [ ] Production implementation (`client/src/pages/Profiles/` + `client/src/components/` split)
