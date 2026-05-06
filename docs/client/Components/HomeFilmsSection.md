# HomeFilmsSection

The films-side of the homepage: hero carousel, search bar + slide, filter
slide, films row, search results grid, and the `FilmDetailsOverlay`
short-circuit. Owns the Relay fragment for the films connection and reads
all film/video fields the page needs (filter dimensions, hero poster,
copies for the variant picker) without leaking those reads into the page.

**Source:** `client/src/components/home-films-section/`
**Used by:** [Library](Library.md) (the `/` page).

## Role

Encapsulates everything films-related on the homepage: data shape, hero
carousel state, search/filter state, and overlay routing. The Library
page is reduced to: empty-libraries check, show-details overlay, page
container + the rendered TV shows row passed in as a prop.

The component owns three fragments:

- `HomeFilmsSection_films` on `FilmConnection` — the prop fragment; the
  page query spreads exactly this and nothing else for the films side.
- `HomeFilmsSection_film` on `Film` — internal sub-fragment for each edge
  node; declares Film fields + spreads `HomeFilmsSection_video @relay(mask: false)`
  on `bestCopy` and `copies`.
- `HomeFilmsSection_video` on `Video` — internal sub-fragment for the
  copy nodes; declares filter / hero fields and spreads
  `FilmTile_video` + `FilmDetailsOverlay_video`.

The connection-level fragment uses `@relay(mask: false)` on its inner
spread so `useFragment` returns flat Film data the component can read
directly. The unmask is scoped inside the component's own data graph —
no `@relay(mask: false)` at the page-query boundary.

## Props

| Prop | Type | Notes |
|---|---|---|
| `films` | `HomeFilmsSection_films$key \| null \| undefined` | Fragment ref to the `FilmConnection` from the page query. |
| `tvShowsRow` | `ReactNode` (optional) | Rendered after the films row when not in flat search-results mode. The Library page passes the TV shows `<PosterRow>` here so the layout still has the shows row below the films row. |

## Layout & styles

Style rules live in `HomeFilmsSection.styles.ts` (relocated from the page
when this component was extracted). Key rules:

- **`hero`** (`75vh` rounded inset) and **`heroActive`** modifier (no
  border-radius, height auto) for search/filter modes.
- **`heroSlides` / `heroImg` / `heroEdgeFade` / `heroBottomFade`** —
  rotating Ken Burns poster carousel with elliptical alpha mask and edge
  gradients.
- **`searchBar`** — top-right 320px input with horizontal alpha-gradient
  backdrop, custom green caret, and clear button.
- **`heroBody` / `heroBodyFlow`** — absolutely-positioned content layer in
  idle mode; reflows in search/filter modes.
- **`rowsScroll`** — vertical column of `<PosterRow>`s, with a `-32vh`
  negative margin that pulls the rows up under the hero's bottom fade.
  `rowsScrollFlat` resets the negative margin in search/filter mode.
- **`searchGrid`** — flat results grid, `auto-fill 200px`.
- **`searchResults` / `noResults`** — search-mode containers.
- **`slideDots`** — bottom-left hero pagination dots (3px tall, animated
  fill on the active one).

## Behaviour

### Hero cycling

- `HERO_INTERVAL_MS = 7000`, `HERO_FADE_MS = 700`.
- Up to 4 movies with non-null `metadata.heroPoster` cycle every 7s with
  a 700ms crossfade. Paused while the FilmDetailsOverlay is open.
- Slide dots invoke `goToHero(idx)` for manual navigation.

### Hero modes

`useHeroMode(rows, paused)` derives `heroMode: "idle" | "searching" |
"filtering"` from search input focus, query string, filter open state,
and active filter count. ESC keybind closes the filter slide first, then
clears all state.

### Film selection

- `?film=<id>` URL param drives the `FilmDetailsOverlay`. Set by clicking
  any tile, cleared by the overlay's close action.
- `pickSuggestions(selectedRow, rows)` produces up to 8 related films
  ranked by director/genre/resolution match.

### Filter derivation

`toFilterRowFromFilm(film)` produces a `FilterRow` (defined in
`HomeFilmsSection.utils.ts`) from each Film, exposing `title`,
`filename`, `director`, `genre`, `resolution`, `codec`, `year` for the
search/filter logic. The `node` field is the `bestCopy` Video — what
`FilmTile` and `FilmDetailsOverlay` render.

## Data

Fragments are colocated with the component. The page query becomes:

```graphql
query HomePageContentQuery {
  libraries { id }
  movies: films(first: 200) {
    ...HomeFilmsSection_films
  }
  tvShows: shows(first: 200) {
    edges {
      node {
        id
        ...ShowTile_show
        ...ShowDetailsOverlay_show
      }
    }
  }
}
```

No `@relay(mask: false)` at the page boundary. The shows side is
unchanged and remains owned by `ShowTile` / `ShowDetailsOverlay`.

The hero slideshow renders the poster at viewport width × `75vh` with
`object-fit: cover`. Both fragments select `heroPoster: posterUrl(size:
W3200)` as a literal — the largest cached variant — so the image is
downscaled by the browser rather than upscaled. W3200 is the same alias
the detail-overlay and player-backdrop fragments use; co-spread
fragments must agree on the size, and W3200 is the right ceiling for
any full-area rendering at 2× DPR. See
[`docs/architecture/Library-Scan/05-Poster-Caching.md`](../../architecture/Library-Scan/05-Poster-Caching.md)
for the full alias / size table.

## Notes

- `useHeroMode` is a films-specific hook colocated under
  `home-films-section/`. A future rename to `useFilmSearchMode` would
  better describe its scope but was deferred to keep the data-ownership
  refactor focused.
- The "Continue Watching", "New Releases", and "Watchlist" rows
  documented in [Library.md](Library.md) are not yet in production —
  the homepage currently shows a single Movies row plus the optional TV
  shows row.
