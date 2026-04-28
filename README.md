# xstream

High-resolution web streaming with a full resolution ladder (240p → 4K). The server transcodes video files on demand using ffmpeg and streams fMP4 segments over HTTP. The client renders them using the browser's Media Source Extensions (MSE) API.

## Stack

- **Server:** Bun, graphql-yoga, SQLite (`bun:sqlite`), fluent-ffmpeg
- **Client:** React, Relay, Griffel (atomic CSS-in-JS), Rsbuild, React Router

---

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- `ffmpeg` accessible via `@ffmpeg-installer/ffmpeg` (installed automatically as a dependency — no system ffmpeg required)
- [Docker](https://docs.docker.com/get-docker/) (required for Seq log management — optional for basic development)

---

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure media libraries

Libraries live in the SQLite DB. Add one via the `createLibrary` GraphQL mutation once the server is running, e.g. from a GraphQL client pointed at `http://localhost:3001/graphql`:

```graphql
mutation {
  createLibrary(
    name: "My Videos"
    path: "/absolute/path/to/your/videos"
    mediaType: "movies"
    extensions: [".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"]
  ) {
    id
    name
  }
}
```

`path` must be an absolute path to a directory containing video files. Files can be nested in subdirectories. Use `deleteLibrary` / `updateLibrary` to manage entries; the next scan cycle picks up changes automatically.

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
xstream/
├── server/                # Bun server (GraphQL + streaming)
├── client/                # Vite + React client
├── docs/                  # architecture documentation
└── tmp/                   # generated at runtime (gitignored)
    ├── xstream.db            # SQLite database
    └── segments/          # ffmpeg segment cache
```

See [`docs/architecture/00-System-Overview.md`](docs/architecture/00-System-Overview.md) for a full system overview.

---

## Documentation

Docs are organised as a nested knowledge base under `docs/` — super-domains (`architecture`, `client`, `server`, `design`, `product`, `code-style`) each contain concept folders with `NN-Topic-Name.md` files and a `README.md` per folder acting as a TOC. Start at [`docs/README.md`](docs/README.md).

| Area | Contents |
|---|---|
| [`docs/architecture/`](docs/architecture/README.md) | Streaming protocol, playback scenarios, Relay contract, observability, startup, deployment |
| [`docs/client/`](docs/client/README.md) | Client-only topics: feature flags, debugging playbooks |
| [`docs/server/`](docs/server/README.md) | Server-only topics: config, GraphQL schema, DB schema, hardware acceleration |
| [`docs/code-style/`](docs/code-style/README.md) | Invariants, naming, conventions, anti-patterns |
| [`docs/design/`](docs/design/README.md) | UI design spec |
| [`docs/product/`](docs/product/README.md) | Product spec, customers, roadmap |

---

## Observability

xstream uses [OpenTelemetry](https://opentelemetry.io/) for structured logs and distributed traces. In development, telemetry is routed to a local [Seq](https://datalust.co/seq) instance. Switching to a cloud backend (e.g. Axiom) in production requires only env var changes — no code changes.

### Local Seq setup

```bash
bun run seq:start
```

On first run this generates a random admin password and stores it in `.seq-credentials` (gitignored), then starts the Seq Docker container with that password. Open the file to find your login:

```bash
cat .seq-credentials
```

Then open [http://localhost:5341](http://localhost:5341) and sign in with `username=admin` and the generated password.

> **First login:** Seq will prompt you to change the initial password. Choose a new password (it must differ from the generated one), then update `.seq-credentials` manually:
> ```bash
> # replace <new-password> with what you typed into Seq
> printf 'SEQ_ADMIN_USERNAME=admin\nSEQ_ADMIN_PASSWORD=<new-password>\n' > .seq-credentials
> ```

To stop Seq: `bun run seq:stop`

**Resetting Seq** (e.g. to rotate credentials or after a schema change):

```bash
bun run seq:stop
sudo docker rm seq
sudo rm -rf ~/.seq-store   # must delete the data store or SEQ_FIRSTRUN_ADMINPASSWORD is ignored
rm .seq-credentials
bun run seq:start          # generates a new password and fresh container
```

See [`docs/architecture/Observability/`](docs/architecture/Observability/README.md) for the full telemetry architecture and instructions for switching to a production backend (Axiom, Grafana Cloud, etc.).

---

## Production

```bash
NODE_ENV=production \
  PORT=8080 \
  SEGMENT_DIR=/var/xstream/segments \
  DB_PATH=/var/xstream/xstream.db \
  bun run start
```

In production, create library entries with `env: "prod"` (the `createLibrary` mutation accepts an `env` arg) and point `SEGMENT_DIR` and `DB_PATH` to persistent storage (not `/tmp`).

---

## Development Notes

- The `tmp/` directory is gitignored. Delete it to reset all cached segments and the database.
- After any GraphQL schema change, re-run `bun relay` inside `client/` to regenerate Relay artifacts.
- Transcode jobs are cached by `(videoPath + resolution + timeRange)`. Re-requesting the same combination serves segments from the existing job immediately.
