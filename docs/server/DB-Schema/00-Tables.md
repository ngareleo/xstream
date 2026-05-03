# Database Schema

xstream uses SQLite via `rusqlite` with raw SQL. All queries are located in `server-rust/src/db/queries/`. WAL mode and foreign key enforcement are enabled on every connection.

The database file lives at `tmp/xstream.db` (dev) or `$DB_PATH` (prod).

---

## Tables

### `libraries`

Populated via the `createLibrary` GraphQL mutation. Upserted by `path` so renames update the display name without losing associated videos.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | SHA-1 of `path` |
| `name` | TEXT | NOT NULL | Display name supplied by the mutation |
| `path` | TEXT | NOT NULL UNIQUE | Absolute path to library root directory |
| `media_type` | TEXT | NOT NULL | `'movies'` or `'tvShows'` |
| `env` | TEXT | NOT NULL | `'dev'` or `'prod'` — filtered against `RUST_ENV` at scan time |

---

### `films`

One row per distinct movie entity (movies only; TV uses video-as-series). Populated by the scanner's `resolve_films_for_library` pass (step 2) and updated by the auto-match pass (step 3). Owns 1+ rows in `videos` via the `film_id` foreign key.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | SHA-1 of `parsed_title_key + media_type` (until OMDb match sets imdb_id) |
| `parsed_title_key` | TEXT | NOT NULL UNIQUE | `"<lowercased_title>\|<year>"` computed by `parse_title_from_filename`. Used for pre-OMDb dedup and as the natural key when no IMDb match exists. |
| `imdb_id` | TEXT | nullable UNIQUE | IMDb ID (e.g., `tt15397572`), set by `link_video_film_to_imdb` after OMDb lookup succeeds. If a different film already owns this `imdb_id`, the two films are merged (duplicate deleted, videos repointed). |
| `media_type` | TEXT | NOT NULL | `'movies'` (TV is excluded; shows remain video-as-series). |

**Indices:** `films(parsed_title_key, media_type)` (used to deduplicate during scan pass 2), `films(imdb_id)` (used to detect collisions during scan pass 3 OMDb merge).

**Why two dedup keys?** Pre-OMDb (parsed_title_key) ensures files that *look* the same are grouped immediately, even if OMDb lookup fails or is pending. Post-OMDb (imdb_id) is authoritative — when two initially separate Films both match the same IMDb entry, the merge consolidates them into one. See [`docs/architecture/Library-Scan/02-Film-Entity.md`](../../architecture/Library-Scan/02-Film-Entity.md) for the full dedup flow.

---

### `videos`

One row per video file. Populated by the library scanner via ffprobe. Upserted on `path` — re-scans refresh metadata without creating duplicates. For movies, each row is linked to a `films` row via `film_id`; for TV, all videos in a show series share the same logical show (TV support uses the video-as-series pattern and does not use the films table).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | SHA-1 of `path` |
| `library_id` | TEXT | NOT NULL, FK → libraries(id) | Owning library |
| `film_id` | TEXT | nullable, FK → films(id) ON DELETE CASCADE | **Movies only.** The logical Film this video belongs to. NULL for TV videos. Set by `resolve_films_for_library` (scanner pass 2). |
| `role` | TEXT | nullable | **Movies only.** `'main'` (primary encoding, or single copy) or `'extra'` (trailers, deleted scenes, etc.). NULL for TV. When multiple `role='main'` videos exist for one Film, the FilmVariants UI lets the user choose which to play. |
| `path` | TEXT | NOT NULL UNIQUE | Absolute path to video file |
| `filename` | TEXT | NOT NULL | `basename(path)` |
| `title` | TEXT | nullable | From `tags.title` in file metadata; falls back to cleaned filename |
| `duration_seconds` | REAL | NOT NULL | Total duration from ffprobe `format.duration` |
| `file_size_bytes` | INTEGER | NOT NULL | Bytes on disk from `fs.stat` |
| `bitrate` | INTEGER | NOT NULL | Overall bitrate in bps from ffprobe `format.bit_rate` |
| `scanned_at` | TEXT | NOT NULL | ISO 8601 timestamp of last ffprobe scan |
| `content_fingerprint` | TEXT | NOT NULL | `"<sizeBytes>:<sha1hex>"` — SHA-1 of the first 64 KB of the file, prefixed with file size. Stable across renames; changes only when content changes. Used as the basis for transcode job cache keys. |

**Index:** `videos_library_id` on `library_id` — used by the `videos(first, after)` connection resolver.
**Index:** `videos_film_id` on `film_id` — used by the `Film.copies` resolver to fetch all videos for a film, ordered by `role` (main first), then `resolution` (highest first), then `bitrate` (highest first).

> **Breaking migration note:** `content_fingerprint TEXT NOT NULL` is part of the original `CREATE TABLE` definition. If you have an existing `tmp/xstream.db` from before this column was added, delete it — the server will recreate the schema and re-scan all libraries on next startup.

---

### `video_streams`

One row per codec stream within a video file. A typical file has one video stream and one audio stream. Replaced wholesale on re-scan (DELETE + INSERT).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Internal row ID |
| `video_id` | TEXT | NOT NULL, FK → videos(id) ON DELETE CASCADE | Owning video |
| `stream_type` | TEXT | NOT NULL | `'video'` or `'audio'` |
| `codec` | TEXT | NOT NULL | Codec name from ffprobe (e.g. `h264`, `aac`, `hevc`) |
| `width` | INTEGER | nullable | Frame width in pixels — null for audio streams |
| `height` | INTEGER | nullable | Frame height in pixels — null for audio streams |
| `fps` | REAL | nullable | Frames per second — null for audio streams |
| `channels` | INTEGER | nullable | Audio channel count — null for video streams |
| `sample_rate` | INTEGER | nullable | Audio sample rate in Hz — null for video streams |

**Index:** `video_streams_video_id` on `video_id`.

**Why cascade delete?** When a video is removed (future: library cleanup), its stream rows should go with it automatically.

---

### `transcode_jobs`

One row per unique transcode request (keyed by video path + resolution + time range). Jobs persist across server restarts. On startup, any job found in `'running'` state is inspected: if segments exist on disk they are restored into memory and the job is marked `'complete'` (so the client can stream the recovered output); if no segments exist the job is marked `'error'` since the transcode never produced usable output.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | SHA-1 of `videoPath + resolution + startTime + endTime` |
| `video_id` | TEXT | NOT NULL, FK → videos(id) | Source video |
| `resolution` | TEXT | NOT NULL | `'240p'` \| `'360p'` \| `'480p'` \| `'720p'` \| `'1080p'` \| `'4k'` |
| `status` | TEXT | NOT NULL | `'pending'` \| `'running'` \| `'complete'` \| `'error'` |
| `segment_dir` | TEXT | NOT NULL | Absolute path to `tmp/segments/<id>/` |
| `total_segments` | INTEGER | nullable | Set once ffmpeg finishes; null while running |
| `completed_segments` | INTEGER | NOT NULL DEFAULT 0 | Incremented as each `.m4s` file is written |
| `start_time_seconds` | REAL | nullable | Range start passed to ffmpeg `-ss`; null = beginning of file |
| `end_time_seconds` | REAL | nullable | Range end passed to ffmpeg `-to`; null = end of file |
| `created_at` | TEXT | NOT NULL | ISO 8601 — when the job was first created |
| `updated_at` | TEXT | NOT NULL | ISO 8601 — updated on every status change |
| `error` | TEXT | nullable | Error message when `status = 'error'`; null otherwise |

**Job deduplication:** The ID is derived from `content_fingerprint + resolution + start + end`. Re-requesting the same transcode (even if the file was renamed/moved) returns the existing job immediately, serving cached segments.

---

### `segments`

One row per completed `.m4s` file. Inserted by `watchSegments()` as ffmpeg writes each file. Used to serve individual segments for seeking and to reconstruct a job's segment list after server restart.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Internal row ID |
| `job_id` | TEXT | NOT NULL, FK → transcode_jobs(id) ON DELETE CASCADE | Owning job |
| `segment_index` | INTEGER | NOT NULL | Zero-based sequential index matching the ffmpeg filename suffix |
| `path` | TEXT | NOT NULL | Absolute path to `.m4s` file |
| `duration_seconds` | REAL | nullable | Segment duration — currently null; can be populated via ffprobe post-processing |
| `size_bytes` | INTEGER | nullable | File size in bytes from `fs.stat` at write time |

**Unique constraint:** `(job_id, segment_index)` — prevents duplicate inserts from watcher races.

**Index:** `segments_job_id` on `job_id`.

---

### `watchlist_items`

One row per film queued on the user's watchlist. Keyed by `film_id` (movies only); points to the primary `bestCopy` video at query time via the `Film.bestCopy` resolver.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | `watchlist_item:<uuid>` (unique stable ID for the watchlist row itself) |
| `film_id` | TEXT | NOT NULL UNIQUE, FK → films(id) ON DELETE CASCADE | The film queued for watching. **Movies only.** A film may appear on the watchlist only once. |
| `added_at` | TEXT | NOT NULL | ISO 8601 timestamp when the film was added. |

**Why `film_id` instead of `video_id`?** Films can have multiple video copies (different encodes). The watchlist is semantically a queue of *films*, not specific files. When the user taps Play, the client fetches the film and resolves `bestCopy` to pick the primary video. If the user manually selects a specific copy (e.g., "play the BluRay encode"), that selection is stored in the Player route params, not in the watchlist.

---

### `watch_progress`

One row per film the user has started watching. Tracks playback progress (current time, total duration, last updated timestamp).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | `watch_progress:<uuid>` |
| `film_id` | TEXT | NOT NULL UNIQUE, FK → films(id) ON DELETE CASCADE | The film being watched. **Movies only.** One progress row per film. |
| `video_id` | TEXT | NOT NULL, FK → videos(id) | The specific video file the user is watching (the selected copy). Used to resume on the correct copy if the film has multiple. |
| `current_time_seconds` | REAL | NOT NULL | Current playback position. |
| `duration_seconds` | REAL | NOT NULL | Total video duration (cached for UI display). |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp of last update. |

**Why both film_id and video_id?** A film may have multiple copies. `film_id` links to the logical entity; `video_id` ensures we resume on the *same copy* the user was watching, even if they manually switched copies before pausing. If the user clears watchlist progress, both rows are deleted together (FK cascade).

---

## Design Decisions

**Why SHA-1 for IDs?** Deterministic, collision-resistant for our purposes, and allows deduplication without a sequence generator. Library and video IDs are stable across restarts as long as the path doesn't change.

**Why no down migrations?** The schema is append-only during active development. `CREATE TABLE IF NOT EXISTS` in `migrate.ts` is idempotent. When a breaking schema change is needed, bump the DB file name or add a schema version table.

**Why WAL mode?** Write-Ahead Logging allows concurrent reads alongside writes. The scanner writes to the DB while the GraphQL layer reads from it simultaneously. WAL prevents read starvation.
