# Watchlist (page)

Dedicated page listing all films queued for watching. Shows a title block with
a count, then a responsive poster-tile grid. Each tile deep-links to the home
Library page with that film's details overlay opened.

**Source:** `client/src/pages/watchlist-page/`
**Used by:** Router as `/watchlist` route.

## Role

Queue browser. Displays all watchlist items as a gallery of posters. Clicking a
tile navigates to the Library home page (`/`) with `?film=<id>` set, opening
the FilmDetailsOverlay for that film. The back button returns to `/watchlist`.
Watchlist items can optionally have a `progress` field indicating the user has
started watching; such items may also appear in the Library's "Continue watching"
row.

## Props

None — the page is a route shell. Queries watchlist data via Relay and renders
the full dataset (no filtering).

## Layout & styles

### Page container (`.page`)

- `height: 100%`, `overflowY: auto`, `backgroundColor: colorBg0`.
- **`paddingTop: calc(${tokens.headerHeight} + 60px)`**, `paddingBottom: 80px`,
  `paddingLeft: 60px`, `paddingRight: 60px`, `boxSizing: border-box`.
- The 60px gap below header is the original spacing between header and page
  content, preserved now that page owns its own clearance.

### Page header

- `display: flex`, `flexDirection: column`, `rowGap: 10px`, `marginBottom: 44px`.
- **Eyebrow**: `"YOUR WATCHLIST"` — Mono 12px, `letterSpacing: 0.22em`,
  uppercase, `colorGreen`.
- **Title**: `"{N} films queued."` — Anton 64px, `lineHeight: 0.95`,
  `letterSpacing: -0.02em`, `colorText`. `{N}` is the count of watchlist items.
- **Subtitle**: Mono 12px / `letterSpacing: 0.06em` / `colorTextMuted`.
  Copy: `"Saved across sessions. Click a poster to play."`.

### Tile grid

- `display: grid`, `gridTemplateColumns: repeat(auto-fill, minmax(200px, 1fr))`,
  **`gap: 24px`**.
- Rendered below page header.

### Tile

Each tile is a `<Link to="/?film={id}">` — clicking deep-links to Library home
with `?film=<id>` set, opening FilmDetailsOverlay for that film.

- Flex column, `rowGap: 10px`. `transitionProperty: transform`, `:hover {
  transform: translateY(-3px) }`.
- **Tile frame** (`tileFrame`): `aspectRatio: 2/3`, `overflow: hidden`, 1px
  `solid colorBorder` all sides, `backgroundColor: colorSurface`. `:hover` —
  all four border sides → `colorGreen` + `boxShadow: 0 8px 24px colorGreenSoft`.
- **Poster image**: fills frame, `object-fit: cover`.
- **Progress bar** (optional): `position: absolute`, `left/right: 0`, `bottom:
  0`, 3px tall. Track: `rgba(0,0,0,0.55)`, fill: `colorGreen`, `width:
  {progress}%`. Only rendered when `progress` is defined.
- **IMDb rating badge** (`ratingBadge`): `position: absolute`, `top: 8px`,
  `right: 8px`. `backgroundColor: rgba(0,0,0,0.7)`, `color: colorYellow`,
  Mono 10px, `padding: 3px 6px`, `borderRadius: 2px`, flex row with `columnGap:
  4px` (star icon + rating string).
- **Below-poster meta** (`tileMeta`): flex column, `rowGap: 3px`.
  - **Title**: 13px / `colorText`.
  - **Subtitle**: Mono 10px / `letterSpacing: 0.06em` / `colorTextMuted` — year
    + genre or similar.
  - **"Added {addedAt}"** (`tileAdded`): Mono 10px / `letterSpacing: 0.04em` /
    `colorTextFaint`.

## Behaviour

### Tile click

- Each tile is a `<Link to="/?film={id}">`.
- Navigates to Library home (`/`) with `?film=<id>` in the query string.
- Library page reads `?film=<id>` on mount and opens `FilmDetailsOverlay`
  immediately.
- Browser's back button returns to `/watchlist`.

## Data

### Relay query

- Root query: `WatchlistPageContentQuery` fetching `watchlist` array.
- Watchlist item fields: `filmId`, `addedAt`, optional `progressSeconds` (0
  when no progress, indicating the sentinel for "not started").
- Film fields: title, year, genre, duration, resolution, posterUrl, IMDb
  rating.

### Derived data

- `{N}` count is the number of watchlist items.
- Subtitle is a constant template: `"Saved across sessions. Click a poster to
  play."`.
- `addedAt` formatted as a human-readable date or relative string (e.g., "3 days
  ago", "May 2, 2026").

## Notes

- **Outstanding work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#watchlist).
- **Watchlist item overlap with Library**: A watchlist item can have both
  `progress > 0` (appearing in Library's "Continue watching" row) and be in the
  full watchlist. The overlap rule (whether items transition out of watchlist
  once playback completes) is deferred — production's existing policy carries
  forward (films with progress appear in both rows).
- Tiles link to Library's overlay rather than navigating directly to Player
  (following the "queue → detail → play" user flow in the design).
