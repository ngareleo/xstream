# xstream

High-resolution web streaming with a full resolution ladder (240p → 4K). The server transcodes video files on demand using ffmpeg and streams fMP4 segments over HTTP. The client renders them using the browser's Media Source Extensions (MSE) API.

## Stack

- **Server (Bun, today):** Bun, graphql-yoga, SQLite (`bun:sqlite`), fluent-ffmpeg
- **Server (Rust, Step 1 of the migration):** axum + async-graphql 7 + rusqlite — runs side-by-side with Bun on `localhost:3002`. Toggle the `useRustGraphQL` flag in Settings → Flags to route Relay at it. See [`docs/migrations/rust-rewrite/Plan/01-GraphQL-And-Observability.md`](docs/migrations/rust-rewrite/Plan/01-GraphQL-And-Observability.md).
- **Client:** React, Relay, Griffel (atomic CSS-in-JS), Rsbuild, React Router

---

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- [Rust](https://www.rust-lang.org/tools/install) stable (1.75+) via `rustup` — required for the Rust GraphQL server. The `server-rust` workspace's dev script prepends `~/.cargo/bin` to PATH automatically, so once rustup is installed `bun run dev` finds `cargo` even in non-interactive shells.
- [`mprocs`](https://github.com/pvolok/mprocs) — TUI dev orchestrator. One-time install (~2 min, cached after):
  ```bash
  cargo install --locked mprocs
  ```
  `bun run dev` exits 127 with the install hint above if `mprocs` isn't on PATH. A fallback `bun run dev:plain` exists for headless contexts where you don't want the TUI.
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

Start the Bun server, the Rust server, and the client in parallel via the `mprocs` TUI:

```bash
bun run dev
```

This opens a terminal UI with one pane per workspace:

| Workspace | Port | Purpose |
|---|---|---|
| `server` (Bun) | `3001` | Default GraphQL + `/stream/:jobId` (chunker, ffmpeg) |
| `server-rust` (Rust) | `3002` | Step 1 cutover GraphQL — opt-in via `useRustGraphQL` flag |
| `client` (Rsbuild) | `5173` | Webview; proxies `/graphql` and `/stream` to Bun |

Each pane has independent scrollback so you can debug one process without losing another's output. Keybindings:

| Key | Action |
|---|---|
| `↑` / `↓` | Switch between panes |
| `r` | Restart the focused process |
| `x` | Stop the focused process |
| `s` | Start the focused process (if stopped) |
| `q` | Quit — gracefully stops everything |
| `?` | In-app help |

Open [http://localhost:5173](http://localhost:5173). The Bun server scans your configured media libraries on startup; you should see your videos within a few seconds. Large libraries with many files take longer to ffprobe.

### Fallback / individual processes

If you don't want the TUI (headless terminal, log capture, scripted contexts), use the plain interleaved variant:

```bash
bun run dev:plain   # bun run --filter '*' dev — colored prefixes, no TUI
```

Or start workspaces individually in separate terminals:

```bash
# Terminal 1 — Bun server on :3001
cd server && bun run dev

# Terminal 2 — Rust server on :3002 (skip if you don't need the cutover path)
cd server-rust && cargo run

# Terminal 3 — client on :5173
cd client && bun run dev
```

### Toggling the Rust GraphQL server

Navigate to **Settings → Flags → Use Rust GraphQL server (Step 1 cutover)**. When ON, Relay points at `http://localhost:3002/graphql` instead of the proxied Bun route. Library / Watchlist / Settings work; **the player page is knowingly broken** because `/stream/:jobId` and the chunker land in Step 2 of the Rust port. The flag is mirrored to `localStorage` (key `flag.useRustGraphQL`); a page reload is required after toggling because the Relay environment initialises before the GraphQL hydration query runs. The two **Bulk actions** buttons in the same tab let you wipe local overrides (server values become authoritative on next reload) or reset every flag back to its registry default.

### SDL parity check

Whenever the Bun schema (`server/src/graphql/schema.ts`) changes, the Rust server's introspection must keep matching. Run the gate from the worktree root with both servers up:

```bash
RUST_GRAPHQL_URL=http://127.0.0.1:3002/graphql bun run scripts/check-sdl-parity.ts
```

It exits 0 on parity and 1 with a structural diff on drift (added / removed types, fields, args, defaults, enum variants, union members).

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
├── server-rust/           # Rust server — Step 1 of the migration (GraphQL + observability)
├── client/                # React client (Rsbuild)
├── scripts/               # tooling — incl. check-sdl-parity.ts (the Step 1 gate)
├── docs/                  # architecture documentation
│   └── migrations/rust-rewrite/  # the Rust port playbook + layer references
├── Cargo.toml             # Rust workspace root
├── mprocs.yaml            # dev orchestrator config — one process per workspace
└── tmp/                   # generated at runtime (gitignored)
    ├── xstream.db            # SQLite database (shared between Bun and Rust)
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
