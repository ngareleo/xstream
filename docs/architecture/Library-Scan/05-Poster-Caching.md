# Poster Caching

OMDb metadata carries a `Poster` URL pointing at the OMDb CDN (currently `m.media-amazon.com`). Hitting that URL on every render means the app:

1. **Stops working offline** the moment the user disconnects.
2. **Hammers the OMDb CDN** for content that's effectively immutable.
3. **Couples render latency to a third party** that has nothing to do with playback.

The poster cache fixes this by downloading every OMDb poster into the user's local cache directory and serving it from the same origin as the GraphQL endpoint.

## Storage

| Mode | Path |
|---|---|
| Tauri (prod) | `app_cache_dir()/posters/` (per-OS — XDG on Linux, `~/Library/Caches` on macOS, `%LOCALAPPDATA%` on Windows) |
| Dev | `tmp/poster-cache/` at repo root |

The path is set via `AppConfig.poster_dir`, mirroring `segment_dir`. `ServerConfig` plumbs it through `with_paths` / `dev_defaults` and the Tauri shell wires it from `app.path().app_cache_dir()`.

Files inside the directory are content-addressed by `sha1(poster_url)` (without extension). The worker downloads once, resizes to 4 sized variants (240px, 400px, 800px, 1600px) using Lanczos3 resampling, and encodes each as WebP (q75). Files are written atomically as `<sha1>.w{N}.webp` (e.g. `abc123…ef.w240.webp`). A given OMDb poster URL maps to exactly four cached files — one per size. The same URL across films / shows shares the same four WebP variants.

## DB shape

Two metadata tables carry an OMDb `poster_url`:

- `video_metadata.poster_url`
- `show_metadata.poster_url`

Each gains a sibling `poster_local_path TEXT` (basename without extension, e.g. `abc123…ef`) that the worker fills in once the resized variants are written. The OMDb URL stays as the canonical source — it's still useful as a fallback when the local copy is missing or download has failed.

`upsert_*_metadata` does **not** write `poster_local_path` — it's worker-managed. On conflict the existing local path is preserved (COALESCE pattern) so a re-match against the same OMDb URL doesn't bounce a freshly-resized set. Stale-cache invalidation when the OMDb URL itself changes is logged tech debt.

## Legacy cache migration

At startup, `services::poster_cache::purge_legacy_cache(ctx)` runs to clean up pre-sized-variant files (the old single-file `<sha1>.<ext>` format):

1. Enumerates `poster_dir` and deletes any files NOT matching the regex `^[a-f0-9]+\.w\d+\.webp$` (i.e., not a sized-variant).
2. For any `poster_local_path` rows still containing a legacy `<sha1>.<ext>` pattern, nulls out the column so the worker re-downloads and creates the sized variants on the next cycle.

After purge, all rows have either a modern `.w{N}.webp` path or `NULL`, and all stray legacy files are gone. The cache is idempotent — running purge multiple times is safe.

## Worker

`services::poster_cache::spawn_periodic_poster_cache` runs every `POLL_INTERVAL` (15 s). Each cycle:

1. `list_videos_needing_poster_download` + `list_shows_needing_poster_download` — rows with `poster_url IS NOT NULL AND poster_local_path IS NULL`.
2. Dedupe in-flight URLs across cycles (a slow download from cycle N+1 doesn't re-download for cycle N+2).
3. Concurrent fetch with `MAX_CONCURRENCY = 4` (`reqwest::Client` with a 20 s timeout and a `User-Agent: xstream/poster-cache`).
4. Decode the downloaded image (handles JPEG, PNG, WebP, GIF via the `image` crate).
5. `spawn_blocking` resize via Lanczos3 to each of the 4 widths (240, 400, 800, 1600 pixels), then encode as WebP at q75.
6. Atomic write: stage all 4 variants to `.part` suffixes, then rename each atomically to `.w{N}.webp`. A crash mid-batch leaves some `.part` files behind but never half-written `.w{N}.webp` files.
7. `set_*_poster_local_path(owner_id, basename)` — single UPDATE per row (basename is `sha1`, without the suffix; resolvers append `.w{N}.webp` based on the requested size).

Per-row failures (decode error, resize OOM, encode failure) log a `warn!` and are retried on the next cycle (no failure-state recorded in DB). Network blips, OMDb outages, and 4xx all heal automatically once the upstream comes back.

## HTTP route

`GET /poster/:basename` (`routes::poster::get_poster`):

- Validates the basename via the regex `^[a-f0-9]+\.w\d+\.webp$` (32–40 hex chars, dot, `w` and digits, `.webp` suffix). Rejects `..`, `/`, leading dots, and any other format.
- Streams the file from `poster_dir` with `Content-Type: image/webp` and `Cache-Control: public, max-age=31536000, immutable`.
- 404 when the file isn't (yet) cached. Common case before the worker has caught up.

Same-origin as the GraphQL endpoint, so the client doesn't need to know the cache directory exists.

## Client GraphQL contract

The `VideoMetadata.posterUrl` and `ShowMetadata.posterUrl` fields now take a required `size` argument:

```graphql
enum PosterSize {
  W240
  W400
  W800
  W1600
}

type VideoMetadata {
  posterUrl(size: PosterSize!): String
}

type ShowMetadata {
  posterUrl(size: PosterSize!): String
}
```

The resolver (`graphql::types::poster_url_for_metadata`) appends the size suffix before returning:

- If `poster_local_path` is set → return `/poster/<basename>.w{width}.webp` (e.g. `/poster/abc123.w400.webp` for W400).
- Else fall back to `poster_url` (the OMDb URL, unchanged).

## Client fragment alias convention

Multiple fragments on the same Video or Show entity select `posterUrl` at different sizes (e.g., `FilmTile` wants W400, `VideoArea` wants W1600). Relay forbids identical field selections with conflicting args, so each fragment aliases `posterUrl` uniquely:

| Fragment | Alias | Size |
|---|---|---|
| `FilmRow_video` | `thumbPoster` | W240 |
| `FilmTile_video`, `ShowTile_show`, `PlayerEndScreen_video`, `PlayerSidebar_video`, `WatchlistPageContentQuery` (film tile) | `tilePoster` | W400 |
| `DetailPane_video` | `panelPoster` | W800 |
| `VideoArea_video` | `backdropPoster` | W1600 |
| `FilmDetailsOverlay_video`, `ShowDetailsOverlay_show` | `overlayPoster` | W1600 |
| `HomePageContent_videoNode`, `HomePageContent_filmNode`, `HOMEPAGE_QUERY tvShows.metadata` | `heroPoster` | W1600 |

Each fragment declares its default size via `@argumentDefinitions(posterSize: { type: "PosterSize!", defaultValue: <bin> })` so the parent query can override the default if needed.

## Failure modes

| Failure | Behaviour |
|---|---|
| OMDb returns the URL but the CDN 404s the image | Worker logs warn; row stays `poster_local_path NULL`; client shows the OMDb URL (which 404s in the `<img>`). Retried every poll cycle — declared tech debt to back off. |
| Decode error (corrupted image, unsupported format) | Worker logs warn; no DB update; retries next cycle. |
| Resize/encode OOM | Worker logs warn; no DB update; retries next cycle. |
| Disk write fails | Worker logs warn; no DB update; retries next cycle. |
| Disk full | Same as above; worker keeps retrying. Eviction policy is declared tech debt. |
| App restarts mid-batch | `.part` stragglers stay; next cycle re-downloads cleanly (the .part files are invisible to the route until rename). |
| User changes OMDb match → poster URL changes | Currently the cached files stay; the new URL won't be downloaded until `poster_local_path` is cleared. Declared tech debt. |

## Cross-references

- [`02-Film-Entity.md`](02-Film-Entity.md) — Film metadata pipeline.
- [`03-Show-Entity.md`](03-Show-Entity.md) — Show metadata pipeline.
- [`docs/server/Config/`](../../server/Config/) — `AppConfig.poster_dir` knob.
- [`docs/server/DB-Schema/`](../../server/DB-Schema/) — `video_metadata` + `show_metadata` table layouts.
