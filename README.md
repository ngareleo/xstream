# xstream

High-resolution media streaming with a full resolution ladder (240p → 4K). The Rust server transcodes video files on demand using ffmpeg and streams fMP4 segments over HTTP. The client renders them using the browser's Media Source Extensions (MSE) API. The whole thing ships as a [Tauri](https://v2.tauri.app/) desktop bundle for Linux, Windows, and macOS — see [`docs/architecture/Deployment/`](docs/architecture/Deployment/README.md).

## Stack

- **Server:** Rust + tokio, axum, async-graphql 7, rusqlite (bundled), `tokio::process` driving bundled jellyfin-ffmpeg.
- **Desktop shell:** Tauri v2 — system WebView; the Rust server runs as a tokio task in the same process on a free `127.0.0.1:<port>` loopback.
- **Client:** React 18, Relay, Griffel (atomic CSS-in-JS), Rsbuild, React Router v6.

---

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) stable (1.75+) via `rustup` — required for the server. The `server-rust` workspace's dev script prepends `~/.cargo/bin` to PATH automatically, so once rustup is installed `bun run dev` finds `cargo` even in non-interactive shells.
- [Bun](https://bun.sh) v1.1+ — used for the client toolchain (Rsbuild, Relay compiler, lint-staged) and to invoke `scripts/setup-ffmpeg`.
- [`mprocs`](https://github.com/pvolok/mprocs) — TUI dev orchestrator. One-time install (~2 min, cached after):
  ```bash
  cargo install --locked mprocs
  ```
  `bun run dev` exits 127 with the install hint above if `mprocs` isn't on PATH. A fallback `bun run dev:plain` exists for headless contexts where you don't want the TUI.
- [`cargo-tauri`](https://v2.tauri.app/start/prerequisites/) — only required to run / build the desktop shell:
  ```bash
  cargo install tauri-cli --version '^2' --locked
  ```
- [Docker](https://docs.docker.com/get-docker/) — required for the local Seq log container; optional for basic development.

ffmpeg is provisioned per-project via `bun run setup-ffmpeg`; no system ffmpeg is required and none is used.

---

## Setup

### 1. Install dependencies

```bash
bun install
bun run setup-ffmpeg     # downloads + verifies pinned jellyfin-ffmpeg into vendor/ffmpeg/<platform>/
```

### 2. Generate Relay artifacts

The client uses Relay; compiler artifacts must exist before the client can build. The Rust server's GraphQL schema is fetched live for compilation in dev (or pre-generated for CI):

```bash
bun run --filter client relay
```

### 3. Configure media libraries

Libraries live in the SQLite DB. Add one via the `createLibrary` GraphQL mutation once the server is running, e.g. from a GraphQL client pointed at `http://localhost:3002/graphql`:

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

---

## Running in Development

Start the Rust server and the client in parallel via the `mprocs` TUI:

```bash
bun run dev
```

This opens a terminal UI with one pane per workspace:

| Workspace | Port | Purpose |
|---|---|---|
| `server-rust` | `3002` | GraphQL + `/stream/:job_id` (chunker, ffmpeg) |
| `client` (Rsbuild) | `5173` | WebView dev server |

Each pane has independent scrollback. Keybindings:

| Key | Action |
|---|---|
| `↑` / `↓` | Switch between panes |
| `r` | Restart the focused process |
| `x` | Stop the focused process |
| `s` | Start the focused process (if stopped) |
| `q` | Quit — gracefully stops everything |
| `?` | In-app help |

Open [http://localhost:5173](http://localhost:5173). The server scans your configured media libraries on startup; you should see your videos within a few seconds. Large libraries with many files take longer to ffprobe.

### Tauri shell

To run the full desktop app (Rust server + client embedded in a Tauri WebView):

```bash
bun run tauri:dev
```

The Tauri shell picks a free loopback port, spawns the Rust server in-process on it, and injects the port into the WebView. See [`docs/architecture/Deployment/00-Tauri-Desktop-Shell.md`](docs/architecture/Deployment/00-Tauri-Desktop-Shell.md).

### Fallback / individual processes

For headless terminals or scripted contexts:

```bash
bun run dev:plain   # bun run --filter '*' dev — colored prefixes, no TUI
```

Or start workspaces individually in separate terminals:

```bash
# Terminal 1 — Rust server on :3002
cd server-rust && bun run dev

# Terminal 2 — client on :5173
cd client && bun run dev
```

---

## Using the App

1. Open the app — your media libraries are listed with all indexed videos.
2. Click **Rescan Libraries** to pick up newly added files without restarting.
3. Click a video to open the player.
4. The player defaults to the highest resolution the source file supports.
5. Use the resolution badges in the control bar to switch quality (240p → 4K).
6. The first play triggers a transcode job — playback begins after the first 1–2 segments are ready (~2–4 seconds).

---

## Project Structure

```
xstream/
├── server-rust/           # Rust server (GraphQL + streaming + chunker + DB)
├── src-tauri/             # Tauri shell crate (bundle + updater)
├── client/                # React client (Rsbuild)
├── scripts/               # tooling — ffmpeg-manifest.json, setup-ffmpeg.ts, dev shells
├── docs/                  # architecture documentation
├── Cargo.toml             # Rust workspace root
├── package.json           # Bun workspace root (client + server-rust + scripts)
├── mprocs.yaml            # dev orchestrator config — one process per workspace
└── tmp/                   # generated at runtime (gitignored)
    ├── xstream-rust.db    # SQLite database (dev)
    └── segments-rust/     # ffmpeg segment cache (dev)
```

See [`docs/architecture/00-System-Overview.md`](docs/architecture/00-System-Overview.md) for a full system overview, and [`docs/SUMMARY.md`](docs/SUMMARY.md) for the 30-second orientation.

---

## Documentation

Docs are organised as a nested knowledge base under `docs/` — super-domains (`architecture`, `client`, `server`, `design`, `product`, `code-style`) each contain concept folders with `NN-Topic-Name.md` files and a `README.md` per folder acting as a TOC. Start at [`docs/README.md`](docs/README.md).

| Area | Contents |
|---|---|
| [`docs/architecture/`](docs/architecture/README.md) | Streaming protocol, playback scenarios, Relay contract, observability, startup, deployment, sharing, testing |
| [`docs/client/`](docs/client/README.md) | Client-only topics: feature flags, debugging playbooks |
| [`docs/server/`](docs/server/README.md) | Server-only topics: config, GraphQL schema, DB schema, hardware acceleration |
| [`docs/code-style/`](docs/code-style/README.md) | Invariants, naming, conventions, anti-patterns, testing policy |
| [`docs/design/`](docs/design/README.md) | UI design spec (Prerelease frozen, Release active) |
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

The release artefact is the Tauri desktop bundle — see [`docs/architecture/Deployment/`](docs/architecture/Deployment/README.md) for the per-OS bundle layouts, code-signing, and auto-update flow.

For a headless / dev-style production run of the Rust server (without the Tauri shell):

```bash
DB_PATH=/var/xstream/xstream.db \
  SEGMENT_DIR=/var/xstream/segments \
  RUST_LOG=info \
  cargo run --release -p xstream-server
```

Create library entries with `env: "prod"` (the `createLibrary` mutation accepts an `env` arg) and point `DB_PATH` / `SEGMENT_DIR` at persistent storage (not `/tmp`).

---

## Development Notes

- The `tmp/` directory is gitignored. Delete it (`bun run clean --all`) to reset all cached segments and the database.
- After any GraphQL schema change, re-run `bun run --filter client relay` to regenerate Relay artifacts.
- Transcode jobs are cached by `(video_id + resolution + start_s + end_s)`. Re-requesting the same combination serves segments from the existing job immediately.
