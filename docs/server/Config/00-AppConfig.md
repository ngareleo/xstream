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
- The server picks up config changes on restart or on the next automatic scan cycle (every `scanIntervalMs`, default 30 s). The `scanLibraries` GraphQL mutation can also be called to trigger an immediate rescan.

---

## AppConfig (server/src/config.ts)

`AppConfig` is exported from `server/src/config.ts` as the `config` singleton. It composes five groups of fields:

### Top-level scalar fields

| Field | Env var | Dev default | Prod default | Notes |
|---|---|---|---|---|
| `port` | `PORT` | `3001` | `8080` | |
| `segmentDir` | `SEGMENT_DIR` | `./tmp/segments` | `./tmp/segments` | Override in tests to route to a per-PID temp dir |
| `dbPath` | `DB_PATH` | `./tmp/xstream.db` | `./tmp/xstream.db` | Override in tests; persistent storage recommended in prod |
| `scanIntervalMs` | `SCAN_INTERVAL_MS` | `30000` | `30000` | |
| `hardwareAcceleration` | `HW_ACCEL` | `"auto"` | `"auto"` | `"off"` forces software encode |

`SEGMENT_DIR` and `DB_PATH` are honored in dev (not just prod) so the test harness can route writes to a per-PID temp dir — see [`../../architecture/Testing/00-Side-Effects-Policy.md`](../../architecture/Testing/00-Side-Effects-Policy.md). Don't set them by hand in your dev shell unless you know what you're doing.

### `transcode` section (`TranscodeConfig`)

All ops-tunable timing and policy knobs for ffmpeg process management. Both dev and prod profiles use the shared `transcodeDefaults` object — these values apply in both environments unless overridden in code.

| Field | Default | Purpose |
|---|---|---|
| `maxConcurrentJobs` | `3` | Cap on concurrently encoding ffmpeg processes (dying jobs excluded from count). |
| `forceKillTimeoutMs` | `2 000` | SIGTERM → SIGKILL grace per job. Caps the dying-zombie window for 4K-software encodes. |
| `shutdownTimeoutMs` | `5 000` | Total wait in `killAllJobs` before the terminal SIGKILL pass. Must be > `forceKillTimeoutMs`. |
| `orphanTimeoutMs` | `30 000` | Kill ffmpeg if a job has zero connections after this many ms (covers prefetched chunks where the user seeks away). |
| `maxEncodeRateMultiplier` | `3` | Wall-clock budget multiplier — actual budget = `chunk_duration_s × this × 1 000 ms`. |
| `capacityRetryHintMs` | `1 000` | `retryAfterMs` returned to the client on a `CAPACITY_EXHAUSTED` rejection. |
| `inflightDedupTimeoutMs` | `5 000` | Max time a concurrent caller polls jobStore waiting for a peer to finish registering the same job. |

The pool reads these via `config.transcode.*`. See [`../../architecture/Streaming/06-FfmpegPool.md`](../../architecture/Streaming/06-FfmpegPool.md) for the cap formula and shutdown sweep logic.

### `stream` section (`StreamConfig`)

| Field | Default | Purpose |
|---|---|---|
| `connectionIdleTimeoutMs` | `180 000` | Idle window before `/stream/:jobId` declares the connection dead and kills the job. Must exceed the widest back-pressure halt the client can induce (~60 s with default `forwardTargetS`). |

### Dev vs Prod

Active profile is selected by `NODE_ENV`:

| `NODE_ENV` | Profile |
|---|---|
| absent or `development` | `dev` (port 3001) |
| `production` | `prod` (port 8080, `PORT` env var honored) |

Both profiles share `transcodeDefaults` and `streamDefaults` — there are no per-environment overrides on the policy knobs today. Env-var overrides for the `transcode.*` / `stream.*` fields are planned groundwork for ops tuning.

In production, `segmentDir` and `dbPath` should be set to persistent storage locations (not `/tmp`). The same `mediaFiles.json` is used in both environments — `env: "prod"` entries activate when `NODE_ENV=production`.

---

## tmp/ Layout

```
tmp/
├── xstream.db                    # SQLite database (WAL mode)
├── xstream.db-shm                # WAL shared memory file
├── xstream.db-wal                # WAL write-ahead log
└── segments/
    └── <jobId>/               # SHA-1 of (content_fingerprint + resolution + startS + endS)
        ├── init.mp4           # fMP4 init segment (moov box)
        ├── segment_0000.m4s
        ├── segment_0001.m4s
        ├── ...
        └── segments.txt       # ffmpeg segment list (internal use)
```

Job IDs are deterministic — the same video, resolution, start time, and end time always produce the same ID. If a client requests a chunk that was previously encoded, the server finds the existing directory on disk and streams from cache without launching a new ffmpeg process.

`tmp/` is gitignored. In dev it accumulates indefinitely. In production, implement a cleanup policy (e.g. evict job directories older than 24h when disk usage exceeds a threshold). See `docs/todo.md` for `CACHE-001`.

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
