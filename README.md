# tvke

High-resolution web streaming with a full resolution ladder (240p → 4K). The server transcodes video files on demand using ffmpeg and streams fMP4 segments over HTTP. The client renders them using the browser's Media Source Extensions (MSE) API.

## Stack

- **Server:** Bun, graphql-yoga, SQLite (`bun:sqlite`), fluent-ffmpeg
- **Client:** React, Relay, Chakra UI, Vite, React Router

---

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- `ffmpeg` accessible via `@ffmpeg-installer/ffmpeg` (installed automatically as a dependency — no system ffmpeg required)

---

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure media libraries

Edit `mediaFiles.json` in the project root. Add entries for your local video directories:

```json
{
  "libraries": [
    {
      "name": "My Videos",
      "path": "/absolute/path/to/your/videos",
      "mediaType": "movies",
      "env": "dev"
    }
  ]
}
```

The `path` must be an absolute path to a directory containing video files (`.mp4`, `.mkv`, `.mov`, `.avi`, `.m4v`, `.webm`). Files can be nested in subdirectories.

### 3. Generate Relay artifacts

The client uses Relay for GraphQL queries. The compiler artifacts need to be generated before the client can build.

`server/schema.graphql` is committed to the repository and must be kept in sync with `server/src/graphql/schema.ts` manually whenever the schema changes. Once it is up to date, regenerate the client artifacts:

```bash
cd client
bun relay
cd ..
```

---

## Running in Development

Start both the server and client in parallel:

```bash
bun run dev
```

Or start them individually:

```bash
# Terminal 1 — server on :3001
cd server && bun run dev

# Terminal 2 — client on :5173
cd client && bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

The server scans your configured media libraries on startup. You should see your videos in the library view within a few seconds. Large libraries with many files will take longer to ffprobe.

---

## Using the App

1. Open the app — your media libraries are listed with all indexed videos
2. Click **Rescan Libraries** to pick up newly added files without restarting
3. Click a video to open the player
4. The player defaults to the highest resolution the source file supports
5. Use the resolution badges in the control bar to switch quality (240p → 4K)
6. The first play triggers a transcode job — playback begins after the first 1–2 segments are ready (~2–4 seconds)

---

## Project Structure

```
tvke/
├── mediaFiles.json        # media library paths (edit locally)
├── server/                # Bun server (GraphQL + streaming)
├── client/                # Vite + React client
├── docs/                  # architecture documentation
└── tmp/                   # generated at runtime (gitignored)
    ├── tvke.db            # SQLite database
    └── segments/          # ffmpeg segment cache
```

See [`docs/architecture.md`](docs/architecture.md) for a full system overview.

---

## Documentation

| Doc | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System overview, component map, data flow |
| [`docs/db-schema.md`](docs/db-schema.md) | SQLite schema with field descriptions |
| [`docs/graphql-schema.md`](docs/graphql-schema.md) | Full GraphQL schema, Relay compliance, subscriptions |
| [`docs/streaming-protocol.md`](docs/streaming-protocol.md) | Binary framing spec, MSE constraints, seeking |
| [`docs/config.md`](docs/config.md) | mediaFiles.json format, AppConfig, resolution profiles |

---

## Production

```bash
NODE_ENV=production \
  PORT=8080 \
  SEGMENT_DIR=/var/tvke/segments \
  DB_PATH=/var/tvke/tvke.db \
  bun run start
```

In production, set `env: "prod"` on your `mediaFiles.json` entries and point `SEGMENT_DIR` and `DB_PATH` to persistent storage (not `/tmp`).

---

## Development Notes

- The `tmp/` directory is gitignored. Delete it to reset all cached segments and the database.
- After any GraphQL schema change, re-run `bun relay` inside `client/` to regenerate Relay artifacts.
- Transcode jobs are cached by `(videoPath + resolution + timeRange)`. Re-requesting the same combination serves segments from the existing job immediately.
