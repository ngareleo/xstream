# Configuration

## mediaFiles.json

Lives at the project root. Committed to git. Paths are machine-specific — edit them locally. Do not add machine-specific paths to a `.env` file; the JSON structure makes the intent clear.

### Format

```json
{
  "libraries": [
    {
      "name": "My Videos",
      "path": "/home/dag/Videos",
      "mediaType": "movies",
      "env": "dev"
    },
    {
      "name": "Movies",
      "path": "/mnt/storage/Movies",
      "mediaType": "movies",
      "env": "prod"
    },
    {
      "name": "TV Shows",
      "path": "/mnt/storage/TV",
      "mediaType": "tvShows",
      "env": "prod"
    }
  ]
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name shown in the UI. Not unique — two libraries can share a name. |
| `path` | string | **Unique.** Absolute path to the root directory. Duplicate paths are skipped with a warning. |
| `mediaType` | `"movies"` \| `"tvShows"` | Stored in the DB and surfaced via GraphQL; the scanner currently walks all directories recursively regardless of this value. |
| `env` | `"dev"` \| `"prod"` | Which environment this entry is active in. Filtered by `NODE_ENV` at startup. |

### Rules

- `path` is the unique key. Two entries with the same path — the first wins, the second is logged and skipped.
- Entries with `env` not matching the current environment are silently ignored.
- If a path does not exist on disk, the library is skipped with a `[scanner] Path not accessible` warning. The server continues starting up.
- The server picks up config changes on restart or when the `scanLibraries` GraphQL mutation is called.

---

## AppConfig (server/src/config.ts)

### Dev (default)

Active when `NODE_ENV` is absent or `development`.

| Field | Value |
|---|---|
| `port` | `3001` |
| `segmentDir` | `./tmp/segments` (relative to project root) |
| `dbPath` | `./tmp/tvke.db` |
| `mediaConfigPath` | `./mediaFiles.json` |

### Prod

Active when `NODE_ENV=production`. Fields marked with an env var are required in production.

| Field | Env var | Default |
|---|---|---|
| `port` | `PORT` | `8080` |
| `segmentDir` | `SEGMENT_DIR` | `./tmp/segments` |
| `dbPath` | `DB_PATH` | `./tmp/tvke.db` |
| `mediaConfigPath` | — | `./mediaFiles.json` |

In production, `segmentDir` and `dbPath` should be set to persistent storage locations (not `/tmp`). The same `mediaFiles.json` is used in both environments — `env: "prod"` entries activate when `NODE_ENV=production`.

---

## tmp/ Layout

```
tmp/
├── tvke.db                    # SQLite database (WAL mode)
├── tvke.db-shm                # WAL shared memory file
├── tvke.db-wal                # WAL write-ahead log
└── segments/
    └── <jobId>/               # SHA-1 of (videoPath + resolution + start + end)
        ├── init.mp4           # fMP4 init segment (moov box)
        ├── segment_0000.m4s
        ├── segment_0001.m4s
        ├── ...
        └── segments.txt       # ffmpeg segment list (internal use)
```

`tmp/` is gitignored. In dev it accumulates indefinitely. In production, implement a cleanup policy (e.g. evict job directories older than 24h when disk usage exceeds a threshold).

---

## Resolution Profiles

Defined in `RESOLUTION_PROFILES` in `server/src/config.ts`.

| Label | Width | Height | Video Bitrate | H.264 Level | Segment ≈ size |
|---|---|---|---|---|---|
| `240p` | 426 | 240 | 300k | 3.0 | 75 KB |
| `360p` | 640 | 360 | 800k | 3.0 | 200 KB |
| `480p` | 854 | 480 | 1500k | 3.0 | 375 KB |
| `720p` | 1280 | 720 | 2500k | 3.1 | 625 KB |
| `1080p` | 1920 | 1080 | 4000k | 4.0 | 1 MB |
| `4k` | 3840 | 2160 | 15000k | 5.1 | 3.75 MB |

All profiles:
- Segment duration: 2 seconds
- GOP size: 48 frames (forces keyframe every 2s at 24fps)
- Audio: AAC, bitrate varies by profile (96k–192k)
- Container: fragmented MP4 (fMP4)
