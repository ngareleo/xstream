# Film Entity (Logical Deduplication)

xstream models two distinct semantic layers:

- **File layer** (`videos` table): one row per video file on disk, keyed by path. Stable across renames, immutable once content changes.
- **Logical layer** (`films` table, movies only): one row per distinct movie entity, with 1+ video file copies. Multiple `.mkv` files of the same movie (e.g., a Blu-ray encode + a web encode) become one `Film` with multiple `videos.role='copy'` rows. TV remains unaffected — shows still use the video-as-series pattern with episodes.

## Deduplication keys

The scanner identifies duplicates via two keys, applied in order. The first to match wins; if a second match surfaces later, `merge_films` repoints all videos and deletes the duplicate:

1. **`films.imdb_id`** (canonical) — set by the OMDb auto-match step post-scan. Most accurate. When OMDb lookup succeeds and a different `Film` already has that `imdb_id`, the two are merged (smaller `film_id` deleted, its videos repointed to the survivor).

2. **`films.parsed_title_key`** — `"<lowercased_title>|<year>"` computed from `parse_title_from_filename`. Used pre-OMDb-match to group files with the same apparent movie. Files without a year in their name are keyed by resolution-stripped filename instead. This key is set during the `resolve_films_for_library` pass (scanner step 3a), before OMDb lookup.

## Resolver data model

`FilmShape` in the GraphQL schema has:

- `id` (global ID)
- `title`, `year`, `genre`, `director`, `plot` — metadata fields (populated by OMDb)
- `bestCopy: Video!` — the "main" video to display as the primary poster; selection logic below
- `copies: [Video!]!` — all videos for this film, ordered by `role` (main first) then resolution (highest first) then bitrate
- `extras: [Video!]!` — convenience field, same as `copies` filtered to `role='extra'`

## Scanner flow

Three distinct passes upsert films and link videos:

### Pass 1: Walk files (unchanged)

`scan_one_library` → `walkdir::WalkDir` → for each video file → ffprobe + fingerprint → upsert `videos` row (exactly as before). No film linking yet.

### Pass 2: Resolve films (new, movies only)

`resolve_films_for_library(library_id, media_type)` runs **only for `media_type='movies'`**.

1. Enumerate `MovieUnit`s — atomic groups of files that represent a single movie:

   - **Flat layout:** each root-level video file is its own `MovieUnit`. Upsert a `Film` with `parsed_title_key` (from the filename), insert a `videos.role='main'` row for the file.
   - **Folder layout:** one folder = one movie. The **main** file is the largest by size (or the file whose stem matches the folder name as a tiebreaker). All other files in the folder become `role='extra'`. Folder name is used for title parsing if it contains a year; otherwise the main file's name is used. `nesting_level > 1` (e.g., `Genre/Year/Movie/file.mkv`) is **not** supported; the user must restructure.

2. For each `MovieUnit`:
   - Parse title + year from the anchor filename (main file in folder layout, the file itself in flat layout).
   - Compute `parsed_title_key = "<lowercased_title>|<year>"` (or use resolution-stripped filename if no year).
   - Upsert `films(parsed_title_key, media_type='movies')` with that key.
   - Upsert/update `videos(film_id, role)` for the main file + all extras.

### Pass 3: Auto-match to OMDb (existing, now with merge)

`auto_match_library` → per video → `link_video_film_to_imdb`:

1. Fetch OMDb entry for the video's film title + year.
2. On success: set `films.imdb_id = <fetched_id>`.
3. **Check for imdb_id collision:** if a **different** `Film` already has `imdb_id = <fetched_id>`, call `merge_films(survivor_film_id, duplicate_film_id)`:
   - Repoint all videos of the duplicate to the survivor.
   - Update `watch_progress`, `watchlist_items` to point at the survivor's video (prefer `bestCopy`).
   - Delete the duplicate film.
4. On OMDb failure: keep the `Film` row with `imdb_id = NULL`. The film remains visible and playable; it just won't have OMDb-sourced metadata.

## Role semantics

Videos linked to a film carry a `role` enum:

| Role | Meaning | Selection in `bestCopy` |
|---|---|---|
| `'main'` | Primary encoding (or the only encoding) | Preferred; first in `copies` list |
| `'extra'` | Supplementary (trailers, behind-the-scenes, deleted scenes, alternate cuts) | Skipped for playback; visible in UI as "variants" |

When a film has multiple files with `role='main'`, the variant picker (FilmVariants component) surfaces all of them so the user can choose which to play. The chosen copy's ID is stored in the player route (`?film=<id>&copy=<video_id>` or equivalent), and the Play CTA uses that specific video.

## Watchlist and playback progress

Pre-Film schema:
- `watchlist_items.video_id` — which video to play
- `watch_progress.video_id` — which video the user was watching
- Editing watchlist, updating progress: keyed on `video_id`

Post-Film schema:
- `watchlist_items.film_id` — which film is queued
- `watch_progress.film_id` — which film the user was watching
- The "best copy" is resolved at query time (`bestCopy` resolver)
- If the user selected a specific copy, that selection is stored separately (route param or a new column; TBD per client implementation)

Forward-only migration: **No backfill is performed.** Old rows with `video_id` are converted to `film_id` during the schema migration. Existing `videos` rows are linked to newly created `Film` rows via `resolve_films_for_library` on the next scan. The user re-scans the library to populate the logical layer.

## Example: Duplicate dedup

Scenario: User has two libraries, both indexing the movie "Oppenheimer" (2023):

- `/home/user/Movies/Oppenheimer.2023.BluRay.mkv` → ffprobe + fingerprint → video_id=abc123
- `/mnt/archive/Movies/Oppenheimer (2023).mkv` → ffprobe + fingerprint → video_id=def456

**Scan pass 2 (resolve films):**
- Both filenames parse to title="Oppenheimer", year=2023, parsed_title_key="oppenheimer|2023".
- Upsert `films(parsed_title_key="oppenheimer|2023")` → returns `film_id=1`.
- Upsert `videos(film_id=1, video_id=abc123, role='main')` and `videos(film_id=1, video_id=def456, role='main')`.
- Result: one `Film` with two `role='main'` videos.

**Scan pass 3 (OMDb match):**
- Lookup OMDb for "Oppenheimer" (2023) → `imdb_id=tt15397572` (real example).
- Update `films(id=1, imdb_id=tt15397572)`.
- No collision; dedup complete.
- When the user opens FilmDetailsOverlay, the variant picker shows two copies (both `role='main'`), and the user can choose which to play.

## Implementation notes

**Scanner code location:** `server-rust/src/services/library_scanner.rs`

- `parse_title_from_filename` — enhanced with Scene-token stripper (38 tests, see tokens list in `01-Filename-Conventions.md`).
- `MovieUnit` struct — groups a main file + optional extras.
- `enumerate_movie_units(library_path, media_type)` — yields MovieUnits.
- `resolve_films_for_library(library_id, media_type)` — walks MovieUnits and links videos to films.
- `link_video_film_to_imdb(film_id, title, year)` — performs OMDb lookup and collision merge.
- `merge_films(survivor_film_id, duplicate_film_id)` — repoints videos + watchlist and deletes the duplicate.

**GraphQL types:** `server-rust/src/graphql/types/film.rs`

- `Film` type with `id`, `title`, `year`, `genre`, `director`, `plot`, `bestCopy`, `copies`, `extras`.
- `FilmConnection` + `FilmEdge` for cursor-based pagination.
- Resolvers for `bestCopy` (selects the first `role='main'` video, or the largest by resolution/bitrate if multiple), `copies` (ordered list), `extras` (filtered copies).

**DB schema:** `server-rust/src/db/migrate.rs` + `server-rust/src/db/queries/films.rs`

- `films` table with `id`, `parsed_title_key`, `imdb_id`, `media_type`, etc.
- `videos.film_id` FK + `videos.role` enum.
- `watchlist_items.film_id` FK (replaces `video_id`).
- Indices on `films(parsed_title_key, media_type)` and `films(imdb_id)` for efficient lookups.
