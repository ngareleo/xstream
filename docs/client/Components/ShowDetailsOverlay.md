# ShowDetailsOverlay

Full-bleed overlay shown when a TV-show tile is clicked on the homepage (`?show=<id>`). Reads from a `Show` GraphQL fragment; renders the show's poster as a hero, metadata content stack, and a per-episode season rail. Sibling to `FilmDetailsOverlay` — `FilmDetailsOverlay` is now movies-only, this carries the TV side.

**Source:** `client/src/components/show-details-overlay/`
**Used by:** `HomePageContent` when a show is selected.

## Role

TV-show detail surface. Lists every season + episode (merged from `Show.seasons` — local files unioned with the OMDb canonical episode tree). Each on-disk episode is clickable and routes to `/player/<bestCopy.id>`. Off-disk episodes (OMDb-known but no `videos` row) are dimmed and disabled.

## Fragment

```graphql
fragment ShowDetailsOverlay_show on Show {
  id
  title
  year
  metadata {
    title
    year
    genre
    director
    plot
    rating
    posterUrl
  }
  profiles {
    id
    name
    status
  }
  seasons {
    seasonNumber
    episodes {
      seasonNumber
      episodeNumber
      title
      durationSeconds
      onDisk
      bestCopy {
        id
      }
    }
  }
}
```

## Props

| Prop | Type | Notes |
|---|---|---|
| `show` | `ShowDetailsOverlay_show$key` | Relay fragment key for the Show. |
| `onClose` | `() => void` | Back / close action. HomePage clears the `?show=<id>` URL param. |

## Layout & styles

Reuses the `FilmDetailsOverlay` styles file (`useShowDetailsOverlayStyles` is structurally a clone with the renamed export). Same hero / gradient / chips / title / meta-row / director / plot stack, plus a fixed-position seasons rail.

### Hero

- `Poster` from `Show.metadata.posterUrl` at width 1600.
- Vertical + horizontal gradients identical to `FilmDetailsOverlay`.
- Close button top-right.

### Title block

- Anton 72px uppercase: `metadata.title ?? title`.
- Meta row: `{year ?? metadata.year} · {metadata.genre}`.
- Optional director + plot lines.

### Seasons rail (always rendered when `seasons.length > 0`)

- Header: `{N} season(s)` + `{available}/{total} on disk`.
- Body lists each season with `Season {n}` heading; episodes rendered inline as buttons:
  - **On-disk:** clickable, routes to `/player/<bestCopy.id>`.
  - **Off-disk:** disabled, dimmed text colour.
- Title: `E{episodeNumber}. {title ?? "—"}`.

### Play CTA

- `playFirst` jumps to the first on-disk episode (across all seasons). Disabled when nothing's playable.

## Behaviour

- Clicking an on-disk episode calls `navigate("/player/<bestCopy.id>")` directly — no view-transition wrapper today.
- The "Available in: <profiles>" line is provisioned in the fragment (`Show.profiles { name status }`) but the current rendering is minimal — declared tech debt to surface this prominently when the picker UI lands.

## Notes

- Inline styles on the season rail are a bridge — full Griffel adoption is declared tech debt (`SHOW-OVERLAY-STYLE-001`).
- Suggestion rail (`pickSuggestions`) is movie-only; not surfaced here yet (`SHOW-SUGGEST-001`).
- Episode-level `FilmVariants` (per-episode picker when `copies.length > 1`) is the next iteration — fragment doesn't yet carry the full `copies` array.

See [`docs/architecture/Library-Scan/03-Show-Entity.md`](../../architecture/Library-Scan/03-Show-Entity.md) for the data model behind the rendering.
