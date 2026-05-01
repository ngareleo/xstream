# Step 3 — Tauri Packaging

## Status — in flight on `feat/rust-step3-tauri` (PR #43)

**Branch state as of 2026-05-01:** MVP running on Linux. Three commit groups landed.

**What is done:**

- `ServerConfig` struct + `pub async fn run(ServerConfig)` extracted out of `main()` in `server-rust/`. `main.rs` now reads env vars (`DB_PATH`, `XSTREAM_PROJECT_ROOT`, `FFMPEG_PATH`, `FFPROBE_PATH`, `XSTREAM_BIND_ADDR`) and delegates to `xstream_server::run`.
- `AppConfig::with_paths(segment_dir, db_path)` added so the Tauri shell can pass explicit OS data/cache dirs without going through `dev_defaults`.
- `src-tauri/` crate is a workspace member. On startup it picks a free `127.0.0.1:<port>` and spawns `xstream_server::run` on the Tauri async runtime with `app_local_data_dir/xstream.db` and `app_cache_dir/segments`. Port injected into the webview via `webview.eval("window.__XSTREAM_SERVER_PORT__ = N")`.
- `client/src/config/rustOrigin.ts` reads `window.__XSTREAM_SERVER_PORT__` at module init; when set, this overrides both `useRustBackend` and the `localhost:3002` dev-time literal. Module-init snapshot pattern preserved.
- **No Tauri IPC in the request path.** `/graphql` and `/stream/*` stay HTTP — the length-prefixed binary stream contract is preserved end-to-end.
- Bundled jellyfin-ffmpeg under `src-tauri/resources/ffmpeg/<platform>/`. New `linux-x64-portable` + `linux-arm64-portable` entries in `scripts/ffmpeg-manifest.json` (deb-install can't ship inside an AppImage). `setup-ffmpeg --target=tauri-bundle` flag added.
- `bun run tauri:dev` and `bun run tauri:build` (Linux: `appimage,deb`) in root `package.json`.
- `install.sh` extended: Linux system libs (pkg-config, libgtk-3-dev, libwebkit2gtk-4.1-dev, libayatana-appindicator3-dev, librsvg2-dev) + Rust toolchain + tauri-cli.
- Smoke test green: `xstream-server listening addr=127.0.0.1:38511`, `Hardware acceleration selected kind="software"`, `POST /graphql 200 — 3ms`, `GET /graphql 101`.

**Still open within this step (must land before PR closes):**

1. HW-accel probe softening — `HW_ACCEL=off` is hard-coded in `src-tauri/src/lib.rs` as a temporary stand-in. Proper Tauri-mode soft-fallback + one-time toast (per §5 below) is the follow-up subtask.
2. Library picker UX — no folder picker UI yet; libraries still populated only via `createLibrary` mutation. Step 3 is incomplete for a normal user until this lands.
3. `useRustBackend` flag-removal sweep — the flag is kept alive for the browser-mode dev workflow; the sweep (`flagRegistry.ts` + `rustOrigin.ts` call sites + Bun server entry) is the final commit for this step.
4. macOS / Windows bundling — portable manifest entries are already added and `setup-ffmpeg --target=tauri-bundle` reuses them; bundler steps remain.
5. Segment cache eviction — `app_cache_dir/segments` grows unbounded; eviction policy is unwired.
6. OTLP endpoint — stays at `localhost:5341/ingest/otlp`; user-facing telemetry settings are a Step 4 deliverable.

**Technical note — `<resource_dir>/resources/ffmpeg/<platform>/` double prefix:** Tauri preserves the `resources/` glob prefix from the source tree in the packaged output (`target/debug/resources/` in dev; OS-specific resource root in prod). The source path is `src-tauri/resources/ffmpeg/<platform>/`, so at runtime the binary sits at `<resource_dir>/resources/ffmpeg/<platform>/`. The `ffmpeg_path.rs` resolver in the Tauri crate has been updated to account for this double prefix.

---

## Where this step sits

Third step. Predecessors: [Step 1](01-GraphQL-And-Observability.md) and [Step 2](02-Streaming.md), both reachable via the `useRustBackend` flag and exercised end-to-end. Successor: [Step 4 — Release](04-Release.md).

At the end of this step there is a **Tauri-bundled desktop binary** that runs the Rust server in-process and serves the React client from the same shell. The Bun runtime is gone. The single cutover flag (`useRustBackend`) is deleted because there is no alternate origin to route to.

This is the step where "we have a Rust port we can flag-test against" turns into "we have a desktop app." Sign-off needs the Rust backend green in real use, not just in CI.

## Scope

**In:**

- Tauri shell + bundle layout per [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md).
- **Embedded Rust server** — in-process loopback. The webview talks to `http://127.0.0.1:<port>/` like any browser. **No Tauri IPC in the request path** — JSON serialization would break `/stream/:jobId` framing.
- Bundled **jellyfin-ffmpeg** under `vendor/ffmpeg/<platform>/` per [`../06-File-Handling-Layer.md`](../06-File-Handling-Layer.md). The pinned manifest (`scripts/ffmpeg-manifest.json`) is the source of truth for per-platform SHA256.
- Per-OS path resolution: `app_data_dir()` for the identity DB and any persistent state; `app_cache_dir()` for the segment cache. Env-var overrides (`DB_PATH`, `SEGMENT_DIR`, `SEGMENT_CACHE_GB`) preserved for advanced users / testing.
- HW-accel probe softening on macOS / Windows. The current code is *fatal* on those OSes (per [`../../../server/Hardware-Acceleration/00-Overview.md`](../../../server/Hardware-Acceleration/00-Overview.md) and [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md) §5). A user on mac/win must get a one-time toast and fall back to software encode, not a crashed app.
- **Flag removal sweep.** Delete `useRustBackend` from `flagRegistry.ts`. Delete `client/src/config/rustOrigin.ts` and the alternate-origin call sites in the Relay environment and streaming service. Delete the Bun server entry point and its workspace dependencies.

**Out:**

- Code signing per OS, auto-update, CI release matrix, distribution — [Step 4](04-Release.md).
- Peer sharing.

## Stable contracts to preserve

Authoritative list at [`../00-Rust-Tauri-Port.md`](../00-Rust-Tauri-Port.md). For Step 3 specifically:

- **No Tauri IPC for `/graphql` or `/stream/*`.** The webview hits `http://127.0.0.1:<port>/` directly. The Tauri IPC channel exists for native menu items, file pickers, and OS-level integrations only. Detail in [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md) §3.
- **`setFfmpegPath` called once at startup** — same invariant as today, just sourced from the Tauri-bundled `vendor/` path. Detail in [`../../../server/Hardware-Acceleration/02-Fluent-FFmpeg-Quirks.md`](../../../server/Hardware-Acceleration/02-Fluent-FFmpeg-Quirks.md).
- **All client-server traffic stays on `/graphql` or `/stream/:jobId`** — no implementation-coupling smuggled in via Tauri commands.

## Cutover mechanism

N/A — this step **removes** the cutover mechanism. The flag is dead code at the start of this step (Steps 1 & 2 are both green on the Rust backend) and deleted by the end of it.

Discipline note: do **not** keep the flag around "just in case." Half-removed flag scaffolding rots fast and makes the next bug bisectable only against a confusing two-mode binary. Delete on this step or do not start it.

## Pointers to layer references

- [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md) — primary. Bundle layout, embedded server, ffmpeg bundling, Ed25519 self-hosted updates (forward-pointer to Step 4), code-signing per OS (forward-pointer to Step 4), CI matrix (forward-pointer to Step 4).
- [`../06-File-Handling-Layer.md`](../06-File-Handling-Layer.md) — ffmpeg manifest pinning; the `setup-ffmpeg --target=tauri-bundle` shape.
- [`../../../server/Hardware-Acceleration/`](../../../server/Hardware-Acceleration/) — what HW-accel paths exist and which OSes need probe-failure softening.
- [`../../../architecture/Deployment/00-Interim-Desktop-Shell.md`](../../../architecture/Deployment/00-Interim-Desktop-Shell.md) §4 — caveats that apply to *any* desktop shell (static asset serving, env-driven paths, library-picker UX, OTel endpoint defaults). Lessons from the interim Electron alpha for the same surface area.

## Sharing forward-constraints to honour

None new. Tauri does not change the protocol surface; the streaming + GraphQL layers ported in Steps 1 & 2 already carry the sharing constraints.

## Decisions to lock before starting

1. **OS coverage for the first Tauri build.** Linux-only first (lowest friction — VAAPI works, signing is GPG-only) vs. mac + win + linux from day one. Recommend Linux-only if the soak group is comfortable with that; the per-OS bundler steps in Step 4 are easier when you've already shipped a single-OS bundle once.
2. **Library picker UX.** No add-library UI exists today; libraries live in the DB and are populated via the `createLibrary` GraphQL mutation. The interim Electron alpha is likely to ship a folder picker — decide whether to back-port that UX or build fresh in this step. Either way, Step 3 cannot ship without a folder picker that calls `createLibrary` — the desktop app is otherwise unusable for a normal user.
3. **HW-accel softening shape.** A one-time toast + fall-back to `HW_ACCEL=off` is the floor (per [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md) §5). Decide whether to add a "retry HW probe" Settings affordance now or defer.
4. **Bundled binary size budget.** Rough projection: Tauri shell (~10 MB) + Rust server (~20 MB) + jellyfin-ffmpeg (~80–120 MB) + React assets (~5 MB) ≈ 120–160 MB per platform. Decide whether that's acceptable or whether ffmpeg gets aggressively stripped (drop unused codecs, strip symbols).
5. **Telemetry endpoint default.** OTel currently points at `localhost:5341` (Seq). For a packaged app, that endpoint won't exist on user machines. Decide: ship with telemetry off by default and a Settings opt-in, OR point at a hosted collector with user consent at first run. Step 4 has to make this decision concrete; deciding it earlier here makes the Step 3 binary testable in user hands without a Seq install.
