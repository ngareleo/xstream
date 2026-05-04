# ProfilesExplorer

Left-column library browser showing profiles (folders) and their films in a
hierarchical collapsible structure with search and column headers. Owned by the
Profiles page; renders search bar, column header, and row hierarchy only.

**Source:** `client/src/components/profiles-explorer/`
**Used by:** `ProfilesPageContent` (left cell of the split-body grid).

## Role

Hierarchical library explorer with integrated search and per-profile scan
indicators. Does not own page chrome (breadcrumb, footer); those are managed by
the page. Delegates selection callbacks to parent.

## Props

| Prop | Type | Notes |
|---|---|---|
| `libraries` | `ReadonlyArray<Library>` | Profiles from the GraphQL query result. |
| `selectedFilmId` | `string \| null` | Currently highlighted film for detail panel. |
| `selectedLibraryId` | `string \| undefined` | Currently highlighted profile. |
| `scanByLibrary` | `Map<string, LibraryScanSnapshot>` | Real-time scan progress per profile. |
| `onOpenFilm` | `(id: string) => void` | Film selection callback. |
| `onEditFilm` | `(id: string) => void` | Film detail edit trigger. |

## Layout & styles

### Root container (`.root`)

- `display: flex`, `flexDirection: column`, `overflow: hidden`, `height: 100%`.

### Search bar (`.searchBar`)

- `display: flex`, `alignItems: center`, `columnGap: 10px`, `padding: 8px 24px 8px 24px`.
- `borderBottom: 1px solid colorBorderSoft`, `backgroundColor: colorSurface`.
- Focus-within: `borderBottomColor: colorGreen`.
- **Search prompt** (`.searchPrompt`) — `<IconSearch>`, `color: colorGreen`, `flexShrink: 0`.
- **Search input** (`.searchInput`) — `flexGrow: 1`, `background: none`, `border: none`, `fontFamily: fontMono`, `fontSize: 12px`, `letterSpacing: 0.04em`, `color: colorText`. Placeholder: `colorTextMuted` italic.
- **Match count** (`.searchCount`, shown only when searching) — `fontFamily: fontMono`, `fontSize: 10px`, `letterSpacing: 0.16em`, `color: colorGreen`. Format: `"{N} match(es) · {M} profile(s)"`.
- **Clear button** (`.searchClear`, shown only when searching) — `20×20px`, `background: none`, `border: none`, `color: colorTextMuted`, hover `colorText`. Icon: `<IconClose 12×12>`.

### Column header (`.colHeader`)

- `display: grid`, `gridTemplateColumns: PROFILE_GRID_COLUMNS` (5 columns: chevron, profile/file, match, size, actions).
- `padding: 10px 24px`, `columnGap: 16px`, `fontFamily: fontMono`, `fontSize: 9px`, `letterSpacing: 0.18em`, `color: colorTextFaint`, `textTransform: uppercase`.
- `borderBottom: 1px solid colorBorderSoft`.

### Rows scroll area (`.rowsScroll`)

- `flexGrow: 1`, `overflowY: auto`.
- Contains `<ProfileRow>` elements (one per library), each possibly containing `<FilmRow>` children.

### No matches state (`.noMatches`)

- Shown when `isSearching && visibleProfiles.length === 0`.
- Centered message: `padding: 40px`, `fontFamily: fontMono`, `fontSize: 11px`, `letterSpacing: 0.18em`, `color: colorTextMuted`, `textTransform: uppercase`.
- Format: `'No films match "QUERY"'`.

## Behaviour

### Search state

- `[search, setSearch]`: raw query string (not trimmed).
- `trimmedSearch = search.trim().toLowerCase()`.
- `isSearching = trimmedSearch.length > 0`.
- **Film matching**: `filmMatches(node, query)` checks title, filename, director, genre (case-insensitive substring).
- **Auto-expand during search**: when `isSearching`, all profiles are forced expanded (toggle disabled). When search clears, expansion reverts to manual control.
- **Match count**: total films across visible profiles; only shown when searching.
- **Clear button**: resets `search` to `""`.

### Profile expansion

- `expandedIds: Set<string>` local state; pre-initializes with `libraries[0]` and the profile containing `selectedFilmId` (for deep-link support).
- `toggleProfile(id)`: adds/removes from set (disabled while searching).
- When expanded, `ProfileRow` renders its child `FilmRow` elements inline.

### Scan progress

- Receives `scanByLibrary: Map<string, LibraryScanSnapshot>` from parent.
- Passes scan state to each `ProfileRow` via `scanning` and `scanProgress` props.
- Does not render breadcrumb or scanning badge; the page owns those.

### Rendering

- Renders search bar (with match count + clear button, visible only when searching).
- Renders column header (`Profile / File · Match · Size`).
- Renders `<ProfileRow>` for each visible profile; `ProfileRow` conditionally renders `<FilmRow>` children.

## Data

- Derives `visibleProfiles` from `libraries` by filtering via `filmMatches()` when searching.
- Computes `matchCount` as total films across all visible profiles.
- Scan progress is received from parent; not computed here.
- Aggregate statistics (total profiles, films, shows, episodes, unmatched) are computed by the page, not the explorer.

## Notes

- The explorer is a **left-column content component**, not a full page. Page chrome (breadcrumb, footer) is owned by `ProfilesPageContent`.
- Search is client-side filtering of the loaded libraries array; not URL-driven.
- The `PROFILE_GRID_COLUMNS` constant is defined in `~/pages/profiles-page/grid.ts`.
- `filmMatches()` helper is in `~/pages/profiles-page/filmMatches.ts`.
- Scan progress received from parent is passed through to `ProfileRow` components for display.
