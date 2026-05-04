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

### Page container (`.page`)

- `display: flex`, `flexDirection: column`, `height: 100%`, `paddingTop: tokens.headerHeight`, `boxSizing: border-box`.
- Flex column containing full-bleed breadcrumb, split-body grid, and full-bleed footer in top-to-bottom order.

### Breadcrumb (`.breadcrumb`)

- Full-width top bar. `height: 38px`, `paddingLeft/Right: 24px`, `display: flex`, `alignItems: center`, `columnGap: 8px`.
- `borderBottom: 1px solid colorBorderSoft`, `fontFamily: fontMono`, `fontSize: 11px`, `color: colorTextMuted`, `letterSpacing: 0.1em`.
- Format: `~ / media / films` with leaf (`films`) in `colorText`, others (`~`, `/`, `media`) muted.
- **Scanning badge** (`.breadcrumbScanning`): appears when any profile is scanning. `marginLeft: auto`, `color: colorGreen`. Format: `● scanning N of TOTAL`.
- `flexShrink: 0` (sticky height).

### Split body (`.splitBody`)

- `display: grid`, `gridTemplateColumns: "1fr 0px 0px"` (closed) or `"1fr 4px ${paneWidth}px"` (open, inline override for animation).
- `flexGrow: 1`, `minHeight: 0` (ensures scrollable content respects flex column height).
- `transition: grid-template-columns ${transitionSlow}` (0.25s ease).
- When `isResizing`, `transitionProperty: none` (jank-free drag).
- Contains: `<ProfilesExplorer>` (left column, flex-grow), resize handle (middle, 4px), `<DetailPane>` (right, fixed width when open).

### Resize handle (`.resizeHandle`)

- Visible only when pane is open. `backgroundColor: colorBorder`, `cursor: col-resize`, hover → `colorGreen`.
- Transition on hover: `transitionProperty: background-color`, `transitionDuration: tokens.transition`.

### Footer (`.footer`)

- Full-width bottom bar. `display: flex`, `justifyContent: space-between`, `paddingTop/Bottom: 10px`, `paddingLeft/Right: 24px`.
- `borderTop: 1px solid colorBorder`, `fontFamily: fontMono`, `fontSize: 10px`, `color: colorTextMuted`, `letterSpacing: 0.1em`.
- **Stats** (left): `{profiles} PROFILES · {films} FILMS · {shows} SHOWS ({episodes} EPS) · {unmatched} UNMATCHED`.
- **CTA button** (`.footerCta`, right): `+ NEW PROFILE` button; `color: colorGreen`, `backgroundColor: transparent`, no border, cursor pointer. Hover: `color: colorText`. Font: Mono 10px uppercase with `letterSpacing: 0.18em`. Click navigates to `/profiles/new`.
- `flexShrink: 0` (sticky height).

### ProfilesExplorer child (search bar, column header, rows)

- Occupies left cell of the split-body grid; `overflow: hidden` flex column.
- **Search bar**: integrated in `ProfilesExplorer` component; see `ProfilesExplorer.md` for full layout.
- **Column header**: 5-column grid layout; see `ProfilesExplorer.md`.
- **Rows scroll**: `<ProfileRow>` + `<FilmRow>` structure; see `ProfilesExplorer.md`.

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

### Page-level responsibilities

- **Manages `?film=<id>` and `?edit=1` URL params** for detail-pane state.
- **Computes aggregate footer stats**: total profiles, films, shows, episodes, unmatched.
- **Tracks live scan progress** via `useLibraryScanSubscription`; passes to `ProfilesExplorer` for display.
- **Renders full-bleed breadcrumb and footer** so they span the viewport even when the detail pane is open.
- **Drag-resize state** via `useSplitResize` hook; inline style overrides grid columns when pane is open.

### Search state and filtering

- Delegated to `ProfilesExplorer`. The page passes `libraries` and `selectedFilmId`, but the explorer owns search state and filtering logic.
- `ProfilesExplorer` computes `visibleProfiles`, `matchCount`, and filtering via `filmMatches()`.
- See `ProfilesExplorer.md` for search behaviour details.

### URL pane state

- `?film=<id>` — selected film in view mode.
- `?film=<id>&edit=1` — selected film in edit mode.
- `openFilm(id)`: toggle logic — if already open, close; else open in view mode.
- `editFilm(id)`: open in edit mode.
- `closePane()`: clears params.
- `onEditChange(editing: boolean)`: called when DetailPane exits edit mode; page syncs URL.

### Profile expansion state

- Delegated to `ProfilesExplorer`. The page does not manage expansion; the explorer owns the `expandedIds` set.
- Pre-expands `profiles[0]` and the profile containing the selected film (for deep-link support).
- See `ProfilesExplorer.md` for expansion behaviour details.

### Drag-resize

- `useSplitResize(defaultPaneWidth)` hook returns `paneWidth`, `containerRef`, `onResizeMouseDown`.
- Inline style on `splitBody` overrides static grid columns when pane is open.
- `defaultPaneWidth = Math.floor(window.innerWidth * 0.5)` (50% default). SSR fallback: 720.
- `MIN_PANE_WIDTH = 240`, `MAX_PANE_WIDTH = 1200`.

### First-mount default selection

- `useEffect` on mount: if `params.get("film")` is unset and `?empty !== "1"`, auto-select first matched movie via `?film=<id>`.
- "First matched movie" = `node.mediaType === "MOVIES" && node.title` (has both kind and matched OMDb title).
- Effect runs **once** (deps `[]`); `replace: true` keeps unselected URL out of browser history.

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

### `ProfilesExplorer`

Main library browser. Renders search bar, column header, and hierarchical profile/film rows. Delegates selection callbacks to the page. See `ProfilesExplorer.md` for full spec.

### `ProfileRow`

5-column library row. Owned and rendered by `ProfilesExplorer`. Contains: chevron, name+path, match progress bar, size, actions. See `ProfileRow.md` for full spec.

### `FilmRow`

5-column film row. Nested within expanded `ProfileRow`. Contains: poster button, title+metadata, kind badge, edit link. See `FilmRow.md` for full spec.

### `DetailPane`

Right-rail inspector. Opened by `?film=<id>` URL param. Rendered by the page alongside `ProfilesExplorer`. See `DetailPane.md` for full spec.

### `EmptyLibrariesHero`

Full-page watermark overlay. Shown when zero profiles exist or `?empty=1` is set. See `EmptyLibrariesHero.md` for full spec.

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
