# Profiles (page)

Directory of user libraries, each expanded to reveal films within. Clicking a
film poster navigates to the player; clicking the row body opens a detail pane
in a drag-resizable right column. Integrates a search bar that filters films
across all profiles by title, filename, director, or genre. Auto-expands
profiles during search; reverts to manual expansion when search clears.

**Source:** `client/src/pages/profiles-page/`
**Used by:** Router as secondary route `/profiles`.

## Role

Library browser. Displays hierarchical list of profiles (user-defined media
libraries) with expandable rows. Each profile row shows name, match status
(progress bar or scanning indicator), and file size. Expanded profiles show
nested film rows with poster thumbnail + metadata + edit link. Clicking a
poster opens the player directly; clicking a row body opens `DetailPane` in
the right rail (drag-resizable, gated by `?film=<id>` URL param). Implements
search filtering (title/filename/director/genre) and URL-driven pane state.

## Props

None — the page is a route shell. Manages expansion state, search state, detail
pane URL params, and split-body resize via `useSplitResize` hook.

## Layout & styles

### Page container (`.shell`)

- `display: grid`, `gridTemplateColumns: "1fr 0px 0px"` (closed) or
  `"1fr 4px ${paneWidth}px"` (open, inline override for animation).
- `height: 100%`, `overflow: hidden`.
- **`paddingTop: tokens.headerHeight`, `boxSizing: border-box`** — page manages
  header clearance.
- `transition: grid-template-columns ${transitionSlow}` (0.25s ease).
- When `isResizing`, `transitionProperty: none` (jank-free drag).

### Left column (`.leftCol`)

- `flex` column, `overflow: hidden`, `position: relative`.
- **Breadcrumb** (path-style): `~ / media / films` with leaf in `colorText`,
  others muted. Includes `breadcrumbScanning` chunk: `● scanning {count} of
  {profiles.length}` (when any profile is currently scanning).

### Search bar (`.searchBar`)

- `display: flex`, `alignItems: center`, `columnGap: 12px`, `paddingTop/Bottom:
  8px`, `paddingLeft/Right: 16px`.
- `focus-within`: `borderColor: colorGreen` (1px border all sides, rounded
  corners 3px).
- **Icon** (`searchPrompt`): `<IconSearch>`, `color: colorGreen`, `flexShrink: 0`.
- **Input** (`searchInput`): `type="text"`, `backgroundColor: transparent`, no
  border. Mono 12px, `color: colorText`. Placeholder: `"Search films, directors,
  genres in every profile…"` (muted). `aria-label="Search profiles"`,
  `spellCheck={false}`, `autoComplete="off"`.
- **Match count + clear button** (shown only when `isSearching`):
  - **Count** (`searchCount`): Mono 10px, `color: colorGreen`, uppercase. Text:
    `"{matchCount} match(es) · {visibleProfiles} profile(s)"`.
  - **Clear button** (`searchClear`): 20×20, `<IconClose 12×12>`, `color:
    colorTextMuted` at rest, hover `colorText`. `aria-label="Clear search"`.
    Click: `setSearch("")`.

### Column header

- 5-column grid: `[chevron] · Profile / File · Match · Size · [actions]`.

### Profile/Film rows (`.rowsScroll`)

- `<ProfileRow>` component per profile (see Subcomponents).
- Only rendered when `showEmpty` is false (empty state replaces entire layout
  when `?empty=1`).

### Footer

- Sticky bottom row (Mono uppercase): `{profiles} PROFILES · {films} FILMS · {shows}
  SHOWS ({episodes} EPS) · {unmatched} UNMATCHED` + `+ NEW PROFILE` CTA button
  (links to `/profiles/new`).
- Episode counts aggregated across all series in all profiles.

### Empty state (when `?empty=1`)

- Large watermark text `"profiles"` (Anton 340px, top-right, alpha 0.022).
- Radial dot-grid background (28px circles, white 1px, alpha 0.045).
- Content column: `flexDirection: column`, `rowGap: 20px`.
  - Eyebrow: Mono 10px green uppercase `"· no libraries yet"`.
  - Headline: Anton 96px uppercase (split into two spans — "your collection"
    white + "starts here." green).
  - Rule: 56px × 3px green, `borderRadius: 2px`.
  - Body: 14px body font, `lineHeight: 1.65`, dimmed, max 360px.
  - Actions: flex row `columnGap: 20px`, link to `/profiles/new` + hint
    (Mono 10px faint `"⌘ N · paths can be local or networked"`).

### Resize handle

- Visible only when `paneOpen`. `backgroundColor: colorBorder`, `cursor:
  col-resize`, hover → `colorGreen`.

## Behaviour

### Search state and filtering

- `[search, setSearch]`: query string (raw, not trimmed).
- `trimmedSearch = search.trim().toLowerCase()`.
- `isSearching = trimmedSearch.length > 0`.
- `visibleProfiles`: when searching, map each profile to its matching films
  (filtered via `filmMatches`), then drop profiles with zero hits. When not
  searching, show every profile with full film list.
- `matchCount`: total films across all visible profiles.
- **Film matching**: `filmMatches(film, query)` checks title, filename, director,
  genre (all `.toLowerCase()`) for substring inclusion.
- **Auto-expand while searching**: when `isSearching`, every profile is
  force-expanded (toggle disabled). When search clears, expansion state reverts
  to manual control.
- **No-matches state**: when `isSearching && visibleProfiles.length === 0`,
  show centered message: `"No films match "{search.trim()}""` (Mono, dimmed).

### URL pane state

- `?film=<id>` — selected film in view mode. Uses `useSearchParams()`.
- `?film=<id>&edit=1` — selected film in edit mode.
- `openFilm(id)`: if `filmId === id` and `edit` param absent, clear params
  (toggle close). Else `setParams({ film: id })` (opens in view mode).
- `editFilm(id)`: sets `setParams({ film: id, edit: "1" })`.
- `closePane()`: clears params.
- `onEditChange(editing: boolean)`: called when DetailPane exits edit mode;
  parent syncs URL (editing=false removes `edit` param, editing=true adds it).

### Expansion state

- `expandedIds: Set<string>` local state.
- Initial state pre-expands `profiles[0]` AND the profile containing the
  selected film (so deep-link to `?film=<id>` opens the right tree branch).
- `toggleProfile(id)`: adds/removes from the set.

### Drag-resize

- `useSplitResize(defaultPaneWidth)` hook returns `paneWidth`, `containerRef`,
  `onResizeMouseDown`. Inline style on `splitBody` overrides static
  `splitBodyOpen` columns when the pane is open.
- `defaultPaneWidth = Math.floor(window.innerWidth * 0.5)` (computed once via
  `useMemo([])` for 50% default). SSR fallback: 720.
- `MIN_PANE_WIDTH = 240`, `MAX_PANE_WIDTH = 1200`.
- Drag bounds apply; user can shrink to 240px or stretch to 1200px.

### First-mount default selection

- `useEffect` on mount: if `params.get("film")` is unset AND
  `params.get("empty") !== "1"`, set `?film=<firstMatchedMovie.id>` via
  `setParams({ film }, { replace: true })`.
- "First matched movie" = `films.find(f => f.kind === "movie" && f.matched)`.
  Skips series intentionally.
- Effect runs **once** (deps `[]` with eslint-disable comment).
- `replace: true` keeps the no-`?film` URL out of browser history.

## Data

### Relay fragments

- Root query: `ProfilesPageQuery` fetching profiles + films + watchlist.
- Profile fragment: name, path, match status, file size, scanning state.
- Film fragment: title, filename, director, genre, kind, matched, resolution,
  etc.

### Derived data

- `visibleProfiles`: computed via `useMemo` based on search query.
- `matchCount`: total films in visible profiles.
- `totalShows`, `totalEpisodes`, `totalUnmatched`: aggregated across profiles.

## Subcomponents

### `ProfileRow`

5-column library row with chevron, name+path, match-bar, size, actions. See
`ProfileRow.md` for full spec. Props: `profile`, `expanded`, `onToggleExpand`,
`children` (FilmRow list).

### `FilmRow`

5-column film row with poster button, metadata, chips, edit link. See
`FilmRow.md` for full spec. Same grid layout as ProfileRow. Click targets
split: poster → player page; row body → opens DetailPane; Edit text link only
(Play dropped). Props: `film`, `selected`, `onOpen`, `onEdit`.

## Notes

- **Outstanding work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#profiles).
- **TV-show support**: FilmRow displays kind glyph (Film/TV), series rows show
  chevron-expand button toggling inline `<SeasonsPanel>`, series metadata shows
  episode count. Profiles footer counts include shows and episodes.
- **Search URL param** (`?q=<query>`): Not wired in production. Future: wire to
  URL for shareability.
- The `+ NEW PROFILE` footer button links to `/profiles/new`. Production should
  wire DetailPane `onSave` callback to an edit-film or update-film GraphQL
  mutation when implemented.
