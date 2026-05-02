# Profiles (page)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 — Added top search bar between breadcrumb and column header. Search input with icon + match count + clear button. Auto-expands all profiles while searching and narrows films to matches. No-matches empty state. `filmMatches` helper checks title / filename / director / genre. FilmRow updated: click poster → player; click body → detail pane; Edit text link only (Play dropped).

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

### Search bar (`searchBar`)
- Positioned between breadcrumb and column header, full-width of the left column.
- Layout: `display: flex`, `alignItems: center`, `columnGap: 12px`, `paddingTop/Bottom: 8px`, `paddingLeft/Right: 16px`.
- `focus-within` styling: `borderColor: tokens.colorGreen` (1px border all sides, rounded corners 3px).
- **Search icon (`searchPrompt`):** `<IconSearch>` at `color: tokens.colorGreen`, `flexShrink: 0`.
- **Input (`searchInput`):** `type="text"`, `backgroundColor: transparent`, no border. JetBrains Mono 12px, `color: tokens.colorText`. Placeholder: `"Search films, directors, genres in every profile…"` (muted text). `aria-label="Search profiles"`, `spellCheck={false}`, `autoComplete="off"`.
- **Match count and clear button (shown only when `isSearching`):**
  - **Count (`searchCount`):** Mono 10px, `color: tokens.colorGreen`, uppercase. Text: `"{matchCount} {matchCount === 1 ? 'match' : 'matches'} · {visibleProfiles.length} {visibleProfiles.length === 1 ? 'profile' : 'profiles'}"`. Flex-shrink for word wrapping.
  - **Clear button (`searchClear`):** 20×20 button, `<IconClose 12×12>`, `color: colorTextMuted` at rest, hover `color: colorText`. `aria-label="Clear search"`. Click: `setSearch("")` (resets query and rebuilds filtered view).

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

### Search state and filtering

- **Local state:** `[search, setSearch]` — the query string (raw, not trimmed).
- **Derived values:**
  - `trimmedSearch = search.trim().toLowerCase()` — for matching logic.
  - `isSearching = trimmedSearch.length > 0` — flag to show match counts and clear button.
  - `visibleProfiles` computed via `useMemo`: when `isSearching`, map each profile to its matching films (filtered via `filmMatches`), then drop profiles with zero hits. When not searching, show every profile with its full film list.
  - `matchCount` — total films across all visible profiles.
- **Film matching:** `filmMatches(film, query)` helper checks title, filename, director, genre (all `.toLowerCase()`) for substring inclusion. Example: `filmMatches(oppenheimer, "nolan")` → true (director contains "nolan").
- **Auto-expand while searching:** when `isSearching`, every profile is force-expanded (toggle disabled). When search clears, expansion state reverts to manual control. This ensures users always see matching films without needing to expand each profile.
- **No-matches state:** when `isSearching && visibleProfiles.length === 0`, show `noMatches` message: `"No films match "{search.trim()}""` (Mono, dimmed, centred).

### URL pane state
- `?film=<id>` — selected film in view mode. `useSearchParams()` reads/writes.
- `?film=<id>&edit=1` — selected film in edit mode (DetailPane shows inline edit form instead of view content).
- `openFilm(id)`:
  - If `filmId === id` and `edit` param absent, clear params (toggle close).
  - Else `setParams({ film: id })` (no `edit` param, opens in view mode).
- `editFilm(id)`:
  - Sets `setParams({ film: id, edit: "1" })` (opens in edit mode).
- `closePane()` clears params.
- `onEditChange(editing: boolean)` called when DetailPane exits edit mode; parent syncs URL (`editing=false` removes `edit` param, `editing=true` adds it).

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

One film inside an expanded ProfileRow. See [`FilmRow.md`](FilmRow.md) for the full spec. Same 5-column grid layout. Click targets split: poster → player page; row body → opens DetailPane; Edit text link in right cell. Props: `film`, `selected`, `onOpen`, `onEdit`.

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

None. The `+ NEW PROFILE` footer button now links to `/profiles/new` (CreateProfile page). The "EDIT" link in FilmRow calls `onEdit(filmId)`, which Profiles passes to `editFilm(id)` → `setParams({ film: id, edit: "1" })`. Production should wire the DetailPane `onSave` callback to an edit-film or update-film GraphQL mutation. The empty state is live at `?empty=1`.

## Porting checklist (`client/src/pages/Profiles/`)

### Layout and container
- [ ] Split-body grid: `1fr 0px 0px` closed, `1fr 4px <paneWidth>px` open, with `transitionSlow` ease; `paddingTop: tokens.headerHeight`, `boxSizing: border-box` (page manages header clearance)
- [ ] `useSplitResize` for drag-resize handle + `isResizing` no-transition state

### Header and search
- [ ] Breadcrumb path with scanning indicator (page opens here — no hero above it)
- [ ] Search bar: `display: flex`, `columnGap: 12px`, `paddingTop/Bottom: 8px`, `paddingLeft/Right: 16px`, `focus-within borderColor: colorGreen`
- [ ] `<IconSearch>` icon at `colorGreen`, `flexShrink: 0`
- [ ] Search input: Mono 12px, transparent bg, placeholder `"Search films, directors, genres in every profile…"`, `aria-label="Search profiles"`
- [ ] Match count display (shown when `isSearching`): Mono 10px green uppercase, `"{matchCount} {match/matches} · {visibleProfiles.length} {profile/profiles}"`
- [ ] Clear button (shown when `isSearching`): 20×20, `<IconClose 12×12>`, click resets `search` state
- [ ] **Auto-expand behavior:** when `isSearching`, force-expand all profiles (toggle disabled); when not searching, revert to manual control
- [ ] **No-matches state:** when `isSearching && visibleProfiles.length === 0`, show `"No films match "{search.trim()}""`
- [ ] `filmMatches(film, query)` helper: checks title / filename / director / genre (case-insensitive substring match)

### ProfileRow and FilmRow
- [ ] 5-column ProfileRow: chevron / name+path / match-bar / size / actions
- [ ] Match bar: green (or yellow if unmatched) progress fill OR spinner during scan
- [ ] Expanded ProfileRow shows nested FilmRow children with `bg-1` background
- [ ] FilmRow at-rest: `background: transparent`, `borderLeft: 2px solid transparent`; `:hover`: `background: rgba(232, 238, 232, 0.05)`, `borderLeftColor: var(--border)`
- [ ] FilmRow selected state: `background: var(--green-soft)`, `borderLeft: 2px solid var(--green)`, `:hover` locked to green-soft (no flicker)
- [ ] Poster thumbnail (`filmThumbBtn`): 26×38 button, no visible bg; contains image + hover overlay; `:hover` adds `scale(1.05)` + green shadow
- [ ] Hover overlay (`filmThumbHover`): absolute fill, flexed center, displays `▶` in green, `backgroundColor: rgba(5, 7, 6, 0.55)`, `opacity: 0` → `1` on parent `:hover`
- [ ] Poster button navigates to `/player/:id` on click
- [ ] Right cell: one text-link button (`filmEditAction`, Edit only — no Play link)
- [ ] `filmEditAction`: white Mono 9px underline text, faint white underline; hover white → green; calls `onEdit(film.id)`
- [ ] Edit button uses `e.stopPropagation()` so click doesn't toggle row selection

### Detail pane and URL state
- [ ] URL pane state: `?film=<id>` (view mode) or `?film=<id>&edit=1` (edit mode); toggle off on second click in view mode
- [ ] Pre-expand profile containing the deep-linked film
- [ ] Pass FilmRow props: `onOpen={(id) => openFilm(id)}`, `onEdit={(id) => editFilm(id)}`
- [ ] Pass DetailPane props: `initialEdit={editParamSet}`, `onEditChange={handleEditModeChange}`, `onClose={closePane}`
- [ ] `editFilm(id)` helper sets URL params to `{ film: id, edit: "1" }` → DetailPane mounts in edit mode
- [ ] DetailPane `onEditChange` callback syncs URL: `editing=false` removes `edit` param, `editing=true` adds it

### Footer and empty state
- [ ] Footer: counts in Mono uppercase + `+ NEW PROFILE` CTA wired to `/profiles/new` (or create-profile mutation in GraphQL)
- [ ] Empty state: `?empty=1` design-lab toggle renders watermark + content section with headline/rule/body/CTA + hint

## Extracted components (2026-05-02, PR #48)

The Profiles page is now a thin shell (ca. 160 lines) that delegates to two extracted child components. Each component has its own spec file and `.tsx` + `.styles.ts` pair in the design lab:

- [`ProfileRow.md`](ProfileRow.md) — 5-column library row with chevron, name+path, match-bar, size, actions (EDIT link)
- [`FilmRow.md`](FilmRow.md) — 5-column film row with poster button, metadata, chips, Play/Edit text links

Profiles.tsx owns the split-body grid, `useSplitResize` hook, URL pane state (`?film=<id>`), expansion state, empty state, and footer. Shared `PROFILE_GRID_COLUMNS = "30px 1.3fr 0.7fr 0.6fr 80px"` constant lives in `pages/Profiles/grid.ts` so both ProfileRow and FilmRow style sheets import it, keeping column widths locked together.

## Status

- [x] Designed in `design/Release` lab — components extracted 2026-05-02, PR #48. Profiles became a thinner page shell (~160 lines). **Search bar added (2026-05-02):** input + icon + match count + clear button, between breadcrumb and column header. Auto-expands all profiles while searching; narrows films via `filmMatches` helper (checks title / filename / director / genre). No-matches empty state. ProfileRow handles expansion state, match-bar spinner, EDIT link. FilmRow handles click-target split (poster → player, body → detail pane), hover tints + green border (locked when selected to prevent flicker), Edit text link only (Play button dropped). DetailPane edit mode: OMDb search picker with search input + result cards + Link button. URL contract: `?film=<id>` (view) vs `?film=<id>&edit=1` (edit). Each extracted child component has its own `.tsx` + `.styles.ts` + `.md` spec.
- [ ] Production implementation (`client/src/pages/Profiles/` + `client/src/components/` split)
