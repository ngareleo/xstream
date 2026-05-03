# ProfilesExplorer

Library browser UI showing profiles (folders) and their films in a two-tier
collapsible structure with search, column headers, and footer stats. Mounted
inside the profiles page as the main content area.

**Source:** `client/src/components/profiles-explorer/`
**Used by:** `ProfilesPageContent` (main library/film browser panel).

## Role

Hierarchical library explorer with integrated search, scan progress, and bulk
statistics. Delegates film/profile mutations to parent callbacks.

## Props

| Prop | Type | Notes |
|---|---|---|
| `libraries` | `ReadonlyArray<Library>` | Profiles from the GraphQL query result. |
| `selectedFilmId` | `string \| null` | Currently highlighted film for detail panel. |
| `selectedLibraryId` | `string \| undefined` | Currently highlighted profile. |
| `scanByLibrary` | `Map<string, LibraryScanSnapshot>` | Real-time scan progress per profile. |
| `onOpenFilm` | `(id: string) => void` | Film selection callback. |
| `onEditFilm` | `(id: string) => void` | Film detail edit trigger. |
| `onCreateProfile` | `() => void` | New profile creation callback (footer CTA). |

## Layout & styles

### Root container

- `display: flex`, `flexDirection: column`, `overflow: hidden`, `position: relative`, `height: 100%`.

### Breadcrumb

- `height: 38px`, `paddingLeft/Right: 24px`, `display: flex`, `alignItems: center`, `columnGap: 8px`.
- `borderBottom: 1px solid colorBorderSoft`, `fontFamily: fontMono`, `fontSize: 11px`, `color: colorTextMuted`, `letterSpacing: 0.1em`.
- Format: "~ / media / films", with real-time scanning indicator appended if active.
- **Scanning badge** — `marginLeft: auto`, `color: colorGreen`, format "● scanning N of TOTAL".

### Search bar

- `display: flex`, `alignItems: center`, `columnGap: 10px`, `padding: 8px 24px 8px 24px`.
- `borderBottom: 1px solid colorBorderSoft`, `backgroundColor: colorSurface`.
- Focus-within: `borderBottomColor: colorGreen`.
- **Search prompt** — `color: colorGreen`, icon, `flexShrink: 0`.
- **Search input** — `flexGrow: 1`, `background: none`, `border: none`, `fontFamily: fontMono`, `fontSize: 12px`, `letterSpacing: 0.04em`, `color: colorText`, placeholder color `colorTextMuted` italic.
- **Match count** — `fontFamily: fontMono`, `fontSize: 10px`, `letterSpacing: 0.16em`, `color: colorGreen`, format "N matches · M profiles".
- **Clear button** — `20x20px`, `background: none`, `border: none`, `color: colorTextMuted`, hover `color: colorText`.

### Column header

- `display: grid`, `gridTemplateColumns: PROFILE_GRID_COLUMNS`.
- `padding: 10px 24px`, `columnGap: 16px`, `fontFamily: fontMono`, `fontSize: 9px`, `letterSpacing: 0.18em`, `color: colorTextFaint`, `textTransform: uppercase`.
- `borderBottom: 1px solid colorBorderSoft`.
- Columns: `Profile / File`, `Match`, `Size`, with empty columns for expand/action icons.

### Rows scroll area

- `flexGrow: 1`, `overflowY: auto`.

### No matches state

- Centered message: `padding: 40px`, `fontFamily: fontMono`, `fontSize: 11px`, `letterSpacing: 0.18em`, `color: colorTextMuted`, `textTransform: uppercase`.
- Format: 'No films match "QUERY"'.

### Footer

- `display: flex`, `justifyContent: space-between`, `paddingTop/Bottom: 10px`, `paddingLeft/Right: 24px`.
- `borderTop: 1px solid colorBorder`, `fontFamily: fontMono`, `fontSize: 10px`, `color: colorTextMuted`, `letterSpacing: 0.1em`.
- **Stats** — format "{N} PROFILES · {M} FILMS · {S} SHOWS ({E} EPS) · {U} UNMATCHED".
- **CTA button** — "+ NEW PROFILE", `color: colorGreen`, `background: none`, `border: none`, hover `color: colorText`.

## Behaviour

- Profiles expand on click to show child films (unless actively searching; search auto-expands all).
- Search filters films by title, director, or genre across all profiles.
- Match count updates live as query changes.
- Clear button on the search input resets to empty string.
- Renders `ProfileRow` for each profile, `FilmRow` for each child film.
- Scan progress (if active) shows real-time counts under the breadcrumb.

## Data

- Derives visible profiles and film counts from `libraries` array.
- Counts unique media types: MOVIES, TV_SHOWS, episodes (currently 0, TODO wire from seasons).
- Unmatched count is films where `!title` (no OMDb match yet).

## Notes

- Search is client-side filtering of the loaded libraries array.
- The `PROFILE_GRID_COLUMNS` constant comes from `~/pages/profiles-page/grid`.
- Scan progress uses `Map<libraryId, {done, total}>` to show per-profile badge.
- Searching disables profile toggle to keep all matches visible.
