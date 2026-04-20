# Database Schema

xstream uses SQLite via `bun:sqlite` with raw SQL. All queries go through `server/src/db/queries/`. WAL mode and foreign key enforcement are enabled on every connection.

The database file lives at `tmp/xstream.db` (dev) or `$DB_PATH` (prod).

---

## Tables

### `libraries`

Populated from `mediaFiles.json` on each startup. Upserted by `path` so renames in config update the display name without losing associated videos.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | SHA-1 of `path` |
| `name` | TEXT | NOT NULL | Display name from `mediaFiles.json` |
| `path` | TEXT | NOT NULL UNIQUE | Absolute path to library root directory |
| `media_type` | TEXT | NOT NULL | `'movies'` or `'tvShows'` |
| `env` | TEXT | NOT NULL | `'dev'` or `'prod'` — mirrors `mediaFiles.json` |

---

### `videos`

One row per video file. Populated by the library scanner via ffprobe. Upserted on `path` — re-scans refresh metadata without creating duplicates.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | SHA-1 of `path` |
| `library_id` | TEXT | NOT NULL, FK → libraries(id) | Owning library |
| `path` | TEXT | NOT NULL UNIQUE | Absolute path to video file |
| `filename` | TEXT | NOT NULL | `basename(path)` |
| `title` | TEXT | nullable | From `tags.title` in file metadata; falls back to cleaned filename |
| `duration_seconds` | REAL | NOT NULL | Total duration from ffprobe `format.duration` |
| `file_size_bytes` | INTEGER | NOT NULL | Bytes on disk from `fs.stat` |
| `bitrate` | INTEGER | NOT NULL | Overall bitrate in bps from ffprobe `format.bit_rate` |
| `scanned_at` | TEXT | NOT NULL | ISO 8601 timestamp of last ffprobe scan |
| `content_fingerprint` | TEXT | NOT NULL | `"<sizeBytes>:<sha1hex>"` — SHA-1 of the first 64 KB of the file, prefixed with file size. Stable across renames; changes only when content changes. Used as the basis for transcode job cache keys. |

**Index:** `videos_library_id` on `library_id` — used by the `videos(first, after)` connection resolver.

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

## Design Decisions

**Why SHA-1 for IDs?** Deterministic, collision-resistant for our purposes, and allows deduplication without a sequence generator. Library and video IDs are stable across restarts as long as the path doesn't change.

**Why no down migrations?** The schema is append-only during active development. `CREATE TABLE IF NOT EXISTS` in `migrate.ts` is idempotent. When a breaking schema change is needed, bump the DB file name or add a schema version table.

**Why WAL mode?** Write-Ahead Logging allows concurrent reads alongside writes. The scanner writes to the DB while the GraphQL layer reads from it simultaneously. WAL prevents read starvation.
