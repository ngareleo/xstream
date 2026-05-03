# Library (page)

Landing page for the film catalogue. Features a 75vh inset rounded hero with
rotating-poster slideshow + 3D-tilted greeting + integrated search bar, three
horizontal-scroll carousels (Continue Watching, New Releases, Watchlist), and
full-bleed film-details overlay when a poster is selected. Search filters
in-page via client-side query + TUI-style filter panel (resolution, HDR, codec,
decade).

**Source:** `client/src/pages/homepage/`
**Used by:** Router as the primary home route `/`.

## Role

Home page dashboard. Displays hero with the user's library via three rows
(Continue Watching for films with playback progress, New Releases as a curated
row, Watchlist for queued films without progress). Clicking a poster opens a
full-bleed overlay with film details, poster background, and a Play CTA that
uses View Transitions to morph into the Player backdrop. Search bar inside the
hero accepts queries and opens a TUI-style filter panel; ESC keybind clears
all state. URL param `?film=<id>` controls overlay visibility.

## Props

None — the page is a route shell with no props. Reads URL params via
`useSearchParams()` and manages hero/search/filter state locally. Queries
watchlist + library data via Relay.

## Layout & styles

### Page container

- `display: flex`, `flexDirection: column`, `height: 100%`, `overflowX: hidden`,
  `overflowY: auto`, `backgroundColor: colorBg0`.
- `paddingLeft: 40px`, `paddingRight: 40px` (insets all child content).
- No `paddingTop` (hero starts at y=0 inside padded container).

### Hero (75vh inset, rounded)

- `height: 75vh`, `position: relative`, `overflow: hidden`,
  `borderRadius: 6px`, `flexShrink: 0`.
- **Poster slideshow** (`heroSlides`): Four canonical poster images
  (`oppenheimer`, `barbie`, `nosferatu`, `civilwar`) rendered simultaneously
  (`position: absolute, inset: 0`). Each poster (`heroImg`): `opacity: 0`,
  `filter: grayscale(1) brightness(0.55)`, `transitionProperty: opacity`,
  `transitionDuration: 0.9s ease`. Active image gets `heroImgActive` class
  (`opacity: 1`). When fading: `heroImgFading` also sets `opacity: 0` so
  outgoing fades while incoming fades in simultaneously.
- **Ken Burns animation**: Every `heroImg` runs a 20s ease-in-out infinite
  alternate loop: `scale(1.06) translate(-0.8%, -0.6%)` at 0% → `scale(1.06)
  translate(0.8%, 0.6%)` at 100%.
- **Edge-fade overlay** (`heroEdgeFade`): Two-gradient pattern (bottom +
  right), `backgroundSize: 100% 115%, 115% 100%`, drifts via 22s `backgroundPosition`
  animation (ease-in-out, infinite).
- **Bottom-fade overlay** (`heroBottomFade`): Two-gradient (top-down + left-to-right)
  that darkens the bottom-left corner, fading transparent at top-right.
- **Grain layer**: Shared `.grain-layer` utility (`opacity: 0.2–0.22`).
- **Search bar** (see Search bar section below): `position: absolute`,
  `top: calc(headerHeight + 24px)`, `right: 32px`, `zIndex: 3`, `width: 320px`.

### Hero body (idle mode)

When not searching or filtering:

- `position: absolute`, `inset: 0`, `paddingTop: calc(headerHeight + 32px)`,
  `paddingBottom: 20px`, `paddingLeft: 44px`, `paddingRight: 44px`,
  flex column `rowGap: 20px`, `zIndex: 2`.
- **Greeting eyebrow** (`greetingEyebrow`): `fontMono`, 12px,
  `letterSpacing: 0.18em`, uppercase, `colorGreen`. Text: `"· {greeting()},
  {user.name.toUpperCase()}"` where `greeting()` returns time-of-day string
  (e.g., "good evening").
- **Greeting text** (`.greeting` div): Anton 64px, `lineHeight: 0.92`,
  `letterSpacing: -0.02em`, `marginTop: 28px`, `display: inline-block`.
  - **3D tilt on mouse**: `onMouseMove` computes normalized offsets `nx`,
    `ny` from bounding rect, then `transform: perspective(800px) rotateX(${ny*18}deg)
    rotateY(${-nx*18}deg)`. `onMouseLeave` resets to 0,0. Transition:
    `transitionDuration: 0.18s ease-out`.
- **Slide dots** (4 buttons): `display: flex`, `columnGap: 8px`. Active:
  `width: 26px`, `height: 3px`, `borderRadius: 2px`, `backgroundColor: colorGreen`.
  Inactive: `width: 8px`, same height/radius, `backgroundColor: colorTextFaint`.
  Both transition `width, background-color` at `transitionSlow` (0.25s).

### Rows section (when not searching or filtering)

- `rowsScroll`: `flexGrow: 1`, `paddingTop: 20px`, `paddingBottom: 60px`,
  `display: flex`, `flexDirection: column`, `rowGap: 28px`. No `paddingLeft/Right`
  (page provides 40px inset).
- Renders three rows in order (each skipped if empty):
  1. "Continue Watching" — `watch_progress` entries with active sessions, resolved to Films.
  2. "New Releases" — curated `newReleaseIds` array (Films).
  3. "Watchlist" — `watchlist_items` entries (Films without active progress).
- **Row anatomy**: `rowHeader` (Mono 11px uppercase), `rowFrame` (relative
  wrapper), `rowTrack` (horizontal-scroll flex, hidden scrollbar, `scrollSnapType:
  x proximity`). Pagination arrows (44×44 circles) at `left: -12px` and `right:
  -12px`, glass styling (`backdrop-filter: blur(10px) saturate(1.4)`). Arrow
  visibility controlled by `hasPrev` / `hasNext` (computed from scroll position
  with 4px tolerance). Smooth scroll (RAF, 720ms, `easeInOutCubic`).

### Tile (`FilmTile`)

- `<button type="button">`, `width: 200px`, `flexShrink: 0`, `scrollSnapAlign:
  start`. `textAlign: left`, no border, transparent bg.
- **Frame** (`tileFrame`): `position: relative`, `aspectRatio: 2/3`, 1px solid
  `colorBorder`, `backgroundColor: colorSurface`.
  - `::after` border wipe (green): `position: absolute, inset: -1px`, 1px solid
    `colorGreen`, `clipPath: inset(100% 0 0 0)` at rest → `inset(0 0 0 0)` on hover.
    Transition: `clip-path` at `transitionSlow` ease-out.
  - `:hover`: `transform: translateY(-3px)`,
    `boxShadow: 0 8px 20px colorGreenGlow, 0 2px 6px colorGreenSoft`.
- **Image** (`tileImage`): `width: 100%`, `height: 100%`, `objectFit: cover`.
- **Progress bar** (optional): `position: absolute`, `bottom: 0`, `left/right:
  0`, `height: 3px`. Track: `rgba(0,0,0,0.55)`. Fill: `colorGreen`,
  `width: {progress}%`. Only rendered when `progress` is defined.
- **Meta** (`tileMeta`, below frame): `marginTop: 10px`. Title: 13px,
  `colorText`. Subtitle (Mono 10px, `colorTextMuted`, `letterSpacing: 0.06em`):
  `{year} · {duration}`.

### Search bar (inside hero, all modes)

- `position: absolute`, `top: calc(headerHeight + 24px)`, `right: 32px`,
  `zIndex: 3`, `width: 320px`, `display: flex`, `alignItems: center`,
  `columnGap: 10px`, `paddingTop/Bottom: 8px`, `paddingLeft: 16px`,
  `paddingRight: 12px`.
- **Container** (`searchBar`): Horizontal gradient `linear-gradient(90deg,
  rgba(20,28,24,0) 0%, rgba(20,28,24,0.42) 22%, rgba(20,28,24,0.42) 78%,
  rgba(20,28,24,0) 100%)`. Transition: `background-image` at `transition` (0.15s).
  When focused or in search/filter mode, gradient alpha bumps to 0.7.
- **Icon** (`searchIcon`): `<IconSearch>`, `color: colorGreen`, `flexShrink: 0`.
- **Input wrap** (`searchInputWrap`): `position: relative`, `flexGrow: 1`,
  `display: flex`, `alignItems: center`, `minWidth: 0`, `height: 20px`.
- **Input** (`searchInput`): `caretColor: transparent`, `width: 100%`,
  `backgroundColor: transparent`, no border, Mono 12px, `letterSpacing: 0.06em`.
  Placeholder: `colorTextMuted`, `letterSpacing: 0.14em`, uppercase, 10px.
  Placeholder conditionally cleared on focus. `aria-label="Search the library"`,
  `spellCheck={false}`, `autoComplete="off"`.
- **Mirror span** (`searchMirror`): `position: absolute, left: 0, top: 50%,
  transform: translateY(-50%)`, `visibility: hidden`, `whiteSpace: pre`. Same
  text + font as input. Measured to compute caret X position.
- **Custom caret** (`searchCaret`, rendered when focused): `position: absolute`,
  `top: 50%`, `marginTop: -7px`, `width: 7px`, `height: 14px`,
  `borderRadius: 1px`, `backgroundColor: colorGreen`, `boxShadow: 0 0 6px
  colorGreen, 0 0 14px colorGreenGlow`. Pulsing keyframe (1.05s ease-in-out
  infinite): 0%/100% `opacity: 1 scaleY(1)`, 50% `opacity: 0.25 scaleY(0.86)`.
  Positioned via `left: searchCaretX + "px"`.
- **Clear button** (`searchClear`): 20×20, `<IconClose 12×12>`, shown when
  `searching || activeFilterCount > 0`. Click: `clearAll()`. `color:
  colorTextMuted` at rest, `colorText` on hover.

### Hero modes (idle / searching / filtering)

Three states derived from `filterOpen`, `searchFocused`, `searching`:
- **`idle`** (default): Greeting + slide dots shown; no `.heroActive` class.
- **`searching`**: Search input focused or query present. Hero renders
  `<SearchSlide>` component. `.heroActive` class applied.
- **`filtering`**: Filter panel open. Hero renders `<FilterSlide>` component.
  `.heroActive` class applied.

When `.heroActive` is applied:
- `borderRadius: 0` (hero loses rounded corners, becomes flush).
- `backgroundColor: colorBg0` (reads as continuous with page background).

A `heroPanelBg` backdrop renders (dark + dot-grid + subtle radial green glow)
when not in idle mode, positioned `absolute inset: 0 pointerEvents: none`.

### SearchSlide component (searching mode)

TUI-style search results panel. Displays search query, match counts, and
filter-open affordance.

- **Container** (`slidePanel`): `flexGrow: 1`, `display: flex`,
  `flexDirection: column`, `rowGap: 20px`, `fontFamily: fontMono`,
  `paddingTop: 12px`.
- **Eyebrow** (Mono 11px green uppercase): Varies by state:
  - No query, no filters: `"· search"`.
  - With query, no filters: `"· query · {resultCount} result(s)"`.
  - With filters: append `" · "` + `<span slideEyebrowAccent>` (white)
    `"{activeFilterCount} filter(s)"`.
- **Prompt row** (Mono 56px, `lineHeight: 1`): Flex `alignItems: baseline,
  columnGap: 16px`. Green caret `">"`, white text (query or empty), green
  pulsing block cursor (always visible in searching mode).
- **Status row** (Mono 12px, `colorTextDim`, flex wrap): With query:
  `"{resultCount} of {totalMatched} match(es)"` + profile count + if filtered,
  green accent `"filtered ({activeFilterCount})"`. No query: italic hint text
  `"type to search films, directors, genres"`.
- **Actions row** (`marginTop: auto`): Primary `"[F] Filter"` (green underlined,
  Mono 13px), Secondary `"[ESC] Clear"` (grey underlined, Mono 12px).

### FilterSlide component (filtering mode)

TUI-style filter table with checkboxes for resolution, HDR, codec, decade.

- **Container** (`slidePanel`): Same as SearchSlide.
- **Eyebrow** (Mono 11px green uppercase): `"· filters"` + if query: `" · {query}"` +
  if results differ from full library: `" · "` + white accent `"{totalMatched}
  → {resultCount}"`.
- **TUI table** (`tuiTable`): Flex column, `rowGap: 10px`, Mono 13px,
  `paddingTop/Bottom: 8px, paddingLeft/Right: 16px`, left border 1px
  `colorBorder`, `backgroundColor: rgba(20, 24, 22, 0.55)`.
  - Each filter dimension (resolution, HDR, codec, decade) rendered as a row.
  - **Row label** (Mono 11px uppercase `colorTextFaint`): dimension name.
  - **Options** (flex wrap, `columnGap: 16px, rowGap: 6px`): Toggle buttons.
    - **Toggle button** (Mono 13px): `[x]` (checked) or `[ ]` (unchecked). Label
      next to it (e.g., `"4K"`, `"HDR10"`, `"HEVC"`, `"'90s"`). Special case:
      HDR `"—"` labeled as `"SDR"`. Colors: dim at rest, green when checked.
- **Actions row** (`marginTop: auto`): Primary `"[↩] Done"` (green underlined),
  Secondary `"[⇧⌫] Clear"` (grey, disabled when no filters active, `opacity:
  0.35, cursor: not-allowed`). Right-aligned hint: `"{profiles} libraries · {totalMatched}
  matches before filters"` (Mono 10px uppercase `colorTextFaint`).

### Search results display (flat grid, when searching or filtering)

When `showFlatResults === true` (query present OR filters active):

- **With results**: `rowHeader` ("Results · {N}" if query, or "Filtered · {N}
  of {M}" if filters only). `searchGrid`: `display: grid,
  gridTemplateColumns: repeat(auto-fill, 200px), justifyContent: start,
  columnGap: 16px, rowGap: 24px`. Renders `<FilmTile>` per result.
- **No matches**: Centered message (Mono 12px uppercase `colorTextMuted`):
  `"No films match "{search.trim()}""` (if query) or `"No films match the
  selected filters"` (if filters only).

When `showFlatResults === false` (no query, no filters): Shows the three
default rows (Continue Watching, New Releases, Watchlist).

### Overlay view (`FilmDetailsOverlay`)

Full-bleed film details page rendered when `?film=<id>` is set. Replaces
entire Library page output. Scrollable (`.overlay` has `overflow-y: auto`).

- **Background poster** (`.overlayPoster`): `position: absolute, inset: 0`,
  `width/height: 100%`, `objectFit: cover`, `viewTransitionName:
  "film-backdrop"` (MUST sync with Player's `.backdrop`). Ken Burns: 26s
  ease-in-out alternate infinite. Full-color (no grayscale).
- **Gradient overlay** (`.overlayGradient`): `position: absolute, inset: 0,
  pointerEvents: none`. Two-gradient pattern (top-down fade + left-to-right
  side fade).
- **Back pill** (top-left): `position: absolute, top: 24px, left: 28px,
  zIndex: 4`. `<IconBack> Back`, Mono 11px uppercase, `backgroundColor:
  rgba(0,0,0,0.45)`, 1px solid `colorBorder`, `borderRadius: 999px`. Hover:
  `rgba(0,0,0,0.7)`, border → `colorGreen`, `color: colorGreen`.
- **Close button** (top-right): 40×40, `position: absolute, top: 24px,
  right: 28px, zIndex: 4`, circle button (`borderRadius: 50%`), `<IconClose>`,
  same hover behaviour as back pill.
- **Content stack** (`.overlayContent`): `position: absolute, left: 60px,
  right: 60px, bottom: 72px, zIndex: 3`, flex column `rowGap: 14px,
  maxWidth: 720px`. From top to bottom:
  1. **Chips row**: Resolution (green), HDR (if present and not `"—"`), codec,
     IMDb rating (if present, `colorYellow` Mono 11px).
  2. **Title**: Anton 72px, `lineHeight: 0.95`, `letterSpacing: -0.02em`.
  3. **Meta row**: Mono 13px uppercase `colorTextDim`. `{year} · {genre} · {duration}`.
  4. **Director** (if present): 13px, `colorTextMuted`. `"Directed by "` +
     director name in `colorText`.
  5. **Plot** (if present): 15px, `lineHeight: 1.55`, `colorTextDim,
     maxWidth: 640px`.
  6. **Actions row**: Play CTA (glass pill, see below) + filename (Mono 10px
     `colorTextFaint`).
- **Play CTA** (glass pill, Liquid Glass style): Translucent white bg,
  `borderRadius: 999px`, `backdropFilter: blur(20px) saturate(180%)`,
  beveled-light borders, inset highlights + drop shadow. Mono 12px uppercase,
  `paddingTop/Bottom: 14px, paddingLeft: 26px, paddingRight: 30px`. On hover:
  glass lights up with oklch green tint, alpha-gradient green borders, green
  text + two-layer text-shadow glow, amplified outer shadows + green halos,
  icon gets green drop-shadow. Contains `<IconPlay>` + `"Play"`. `<button
  onClick={playWithTransition}>` wraps `document.startViewTransition(() =>
  navigate("/player/{film.id}"))` with plain `navigate` fallback.
- **Scroll hint** (optional, animated): Mono 10px below actions, `"▾ scroll for
  suggestions"`. Pulsing animation (1.8s, 0.4 → 0.85 opacity). Shown only when
  suggestions carousel is present.

### Suggestions carousel (optional)

When `suggestions.length > 0`, rendered below the hero (sibling section, not
nested). Uses `<PosterRow title="You might also like">` with `<FilmTile>` cards.
Click handler: `onSelectSuggestion(id)` or navigate to `/player/{id}`.

## Behaviour

### State machine — `heroMode`

Derived state: `heroMode = filterOpen ? "filtering" : (searchFocused || searching ? "searching" : "idle")`.

Toggles three visual presentations:
- **`idle`**: Greeting + dots visible; hero body shows default content.
- **`searching`**: `<SearchSlide>` visible; hero `.heroActive` class applied.
- **`filtering`**: `<FilterSlide>` visible; hero `.heroActive` class applied.

### Hero cycling

- `HERO_INTERVAL_MS = 7000`, `HERO_FADE_MS = 700`.
- On mount, `useEffect` starts an interval (paused when overlay open via
  `selectedFilm`). Every 7s, fade out (700ms), swap image, fade in.
- Clicking a slide dot calls `goToHero(index)` — if different from current,
  fade out → 350ms later: swap index + fade in.
- `heroFilms` computed from `HERO_FILM_IDS = ["oppenheimer", "barbie",
  "nosferatu", "civilwar"]`; missing ids filtered out.

### Search + filter state

- `[search, setSearch]`: query string (raw).
- `[searchFocused, setSearchFocused]`: input focus state.
- `[filterOpen, setFilterOpen]`: filter panel visibility.
- `[filters, setFilters]`: `{ resolutions: Set<Resolution>, hdrs: Set<Hdr>,
  codecs: Set<Codec>, decades: Set<number> }`.
- `trimmedQuery = search.trim().toLowerCase()`.
- `searching = trimmedQuery.length > 0`.
- `activeFilterCount = filtersActive(filters)` (sum of all Set sizes).
- `queryMatched = useMemo(...)`: films matching title/filename/director/genre
  (case-insensitive substring). When `trimmedQuery.length === 0`, returns all
  `films`.
- `searchResults = applyFilters(queryMatched, filters)`: filters apply on top
  of query matches; never broaden the result set.
- `showFlatResults = hasQuery || activeFilterCount > 0`: flag to show flat grid
  (results) instead of carousel rows.

### Filter application

**Key design pattern:** Filters apply against the full library when there is no
query. So toggling a filter chip has visible effect even with empty search box.

`applyFilters(list: Film[], filters: Filters): Film[]`:
- If no filters active, return list unchanged.
- Otherwise, exclude films that don't match **all** active filter dimensions:
  - If `filters.resolutions.size > 0` and film's resolution not in set, exclude.
  - If `filters.hdrs.size > 0` and film's HDR value (or `"—"` if null) not in
    set, exclude.
  - If `filters.codecs.size > 0` and film's codec not in set, exclude.
  - If `filters.decades.size > 0`, exclude if film year is null OR floor-decade
    not in set.

### ESC keybind

When `heroMode !== "idle"`, ESC key triggers:
- If `filterOpen === true`: exit filter mode (close filter panel).
- Else: `clearAll()` (reset query, filters, focus, panel state).

### URL state

- `?film=<id>`: overlay open, showing that film's details. Clicking a tile
  sets this param. Clearing it returns to dash view.
- Clear button in search bar resets query + filters + focus (not URL params).

### Film selection

- `openFilm(id)`: sets `setSearchParams({ film: id })`.
- `closeFilm()`: deletes `film` param.

## Data

### Backend queries

- **Continue Watching**: `watch_progress` table joined to Films, ordered by `updated_at` (most recent first). Shows films the user has started but not finished.
- **New Releases**: curated `newReleaseIds` array (e.g., `["f1", "superman",
  "furiosa", "justiceleague", "madmax"]`), resolved to Films via `Query.films`.
- **Watchlist**: `watchlist_items` table joined to Films, filtered to films not in `watch_progress` (queued but not started).
- **Search**: `Query.films` pagination (backend cursor-based) with client-side text filters
  against title/director/genre; production may add server-side `?q=` param for
  shareability.

### Relay fragments

- Root query: `LibraryPageContentQuery` fetching `Query.films` (paginated, first N films) + `watchlist_items` + `watch_progress` + user identity.
- Per-row query: Continue Watching uses `watch_progress` connection; Watchlist uses `watchlist_items` connection; New Releases uses a hardcoded array of film IDs resolved via `Query.film(id)` in parallel.
- Overlay: Film fragment including `id`, poster URL, OMDb rating, director, plot, year, genre, and `copies` (array of videos for the variant selector).

### Suggestions algorithm (`pickSuggestions`)

Ranks all films except the input film by scoring:
- Director match: same director, +50.
- Profile match: same library, +8.
- Genre overlap: for each genre token > 2 chars in film's genre, +12 if found
  in candidate's genre.
- Resolution match: same resolution, +2.
- Sort descending by score, cap at 8 results.

## Subcomponents

The Library page delegates to several extracted child components, each with
its own spec:

- **`SearchSlide`** (`client/src/components/search-slide/`) — TUI search results
  panel with query display and filter affordance.
- **`FilterSlide`** (`client/src/components/filter-slide/`) — TUI filter table
  with resolution/HDR/codec/decade toggles.
- **`PosterRow`** (`client/src/components/poster-row/`) — Horizontal-scroll
  carousel with pagination arrows.
- **`FilmTile`** (`client/src/components/film-tile/`) — 200px poster card with
  optional progress bar.
- **`FilmDetailsOverlay`** (`client/src/components/film-details-overlay/`) —
  Full-bleed film details with glass Play CTA.
- **`SeasonsPanel`** (`client/src/components/seasons-panel/`) — Episode picker
  (used by overlay when film is a series).

## View Transitions contract

Both `Library.overlayPoster` and `Player.backdrop` MUST carry
`viewTransitionName: "film-backdrop"` (the same value). The View Transitions
API uses this shared name to auto-morph the poster element across routes when
navigation is wrapped in `document.startViewTransition`. If the two values
diverge, the morph silently degrades to a cross-fade.

Forward (Play): `FilmDetailsOverlay`'s Play CTA wraps the navigate call in
`document.startViewTransition`.

Reverse (Back): Player's back navigation similarly wraps the navigate call.

Fallback on unsupported browsers (Safari < 18): plain navigation — no morph,
no error.

## Notes

- **Unfinished work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#library).
- **Search URL param** (`?q=<query>`): Not yet wired in production. When wired,
  the Library page should read an incoming `?q=` on mount and pre-populate the
  input so the filtered view is shareable/bookmarkable.
- **Hero slideshow rotation and greeting 3D tilt** are deferred to a polish
  pass — the hero background can use a static poster or a simpler rotation
  until animation polish is added.
- The row pagination uses RAF-based smooth scroll with `easeInOutCubic` easing
  (720ms duration) to ensure tiles land on snap boundaries. Page size is always
  a multiple of 216px (`TILE_STRIDE = TILE_WIDTH(200) + TILE_GAP(16)`).
