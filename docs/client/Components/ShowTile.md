# ShowTile

Sibling to `FilmTile` — renders a TV-show poster card on the homepage TV row. Reads from a `Show` GraphQL fragment (not a `Video` fragment, the way FilmTile does).

**Source:** `client/src/components/show-tile/`
**Used by:** `HomePageContent` (TV row), search results when shows are surfaced.

## Role

Presentational poster card for a logical Show entity. Same visual contract as `FilmTile` (200px width, 2:3 aspect, hover lift, two-line title clamp) — the structural difference is what it points at:

- `FilmTile` renders against `Video` (the `bestCopy` of a Film).
- `ShowTile` renders against `Show` directly — title and posterUrl come from `Show.metadata`, year from `Show.year` / `Show.metadata.year`.

There is no progress bar — progress for shows is per-episode and surfaces in the detail overlay, not on the tile.

## Fragment

```graphql
fragment ShowTile_show on Show {
  id
  title
  year
  metadata {
    year
    posterUrl
  }
}
```

## Props

| Prop | Type | Notes |
|---|---|---|
| `show` | `ShowTile_show$key` | Relay fragment key for the Show. |
| `onClick` | `(id: string) => void` | Receives the Show id (Relay global ID). HomePage opens the overlay via `?show=<id>`. |

## Layout & styles

Mirrors `FilmTile.styles.ts`:

- `width: 200px`, `flexShrink: 0`, `backgroundColor: transparent`.
- Frame: `position: relative`, `aspectRatio: 2/3`, 1px solid `colorBorder`, `backgroundColor: colorSurface`.
- Hover: `transform: translateY(-3px)` + green glow shadow.
- Image: `width/height: 100%`, `objectFit: cover`.
- Metadata: 13px title (two-line clamp), 10px mono subtitle for year.
- `MediaKindBadge kind="TV_SHOWS" variant="tile"` rendered top-left.

## Behaviour

- Entire tile clickable; calls `onClick(show.id)` with the Relay global ID.
- Poster falls through to the existing `Poster` component, which uses `resolvePosterUrl` from `~/config/rustOrigin` to handle locally cached `/poster/<basename>` URLs (see [`docs/architecture/Library-Scan/05-Poster-Caching.md`](../../architecture/Library-Scan/05-Poster-Caching.md)).

## Notes

- No progress bar (movie-only feature today).
- Search/filter against shows is declared tech debt — see `docs/todo.md` (`SHOW-SEARCH-001`).
