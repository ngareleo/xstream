# Step 3 — Tauri Packaging

## Where this step sits

Third step. Predecessors: [Step 1](01-GraphQL-And-Observability.md) and [Step 2](02-Streaming.md), both live behind their feature flags and exercised end-to-end. Successor: [Step 4 — Release](04-Release.md).

At the end of this step there is a **Tauri-bundled desktop binary** that runs the Rust server in-process and serves the React client from the same shell. The Bun runtime is gone. The two cutover flags (`useRustGraphQL`, `useRustStreaming`) are deleted because there is no alternate origin to route to.

This is the step where "we have a Rust port we can flag-test against" turns into "we have a desktop app." Sign-off needs both flags green in real use, not just in CI.

## Scope

**In:**

- Tauri shell + bundle layout per [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md).
- **Embedded Rust server** — in-process loopback. The webview talks to `http://127.0.0.1:<port>/` like any browser. **No Tauri IPC in the request path** — JSON serialization would break `/stream/:jobId` framing.
- Bundled **jellyfin-ffmpeg** under `vendor/ffmpeg/<platform>/` per [`../06-File-Handling-Layer.md`](../06-File-Handling-Layer.md). The pinned manifest (`scripts/ffmpeg-manifest.json`) is the source of truth for per-platform SHA256.
- Per-OS path resolution: `app_data_dir()` for the identity DB and any persistent state; `app_cache_dir()` for the segment cache. Env-var overrides (`DB_PATH`, `SEGMENT_DIR`, `SEGMENT_CACHE_GB`) preserved for advanced users / testing.
- HW-accel probe softening on macOS / Windows. The current code is *fatal* on those OSes (per [`../../../server/Hardware-Acceleration/00-Overview.md`](../../../server/Hardware-Acceleration/00-Overview.md) and [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md) §5). A user on mac/win must get a one-time toast and fall back to software encode, not a crashed app.
- **Flag removal sweep.** Delete `useRustGraphQL` and `useRustStreaming` from `flagRegistry.ts`. Delete the alternate-origin discovery code in the Relay environment and streaming service. Delete the Bun server entry point and its workspace dependencies.

**Out:**

- Code signing per OS, auto-update, CI release matrix, distribution — [Step 4](04-Release.md).
- Peer sharing.

## Stable contracts to preserve

Authoritative list at [`../00-Rust-Tauri-Port.md`](../00-Rust-Tauri-Port.md). For Step 3 specifically:

- **No Tauri IPC for `/graphql` or `/stream/*`.** The webview hits `http://127.0.0.1:<port>/` directly. The Tauri IPC channel exists for native menu items, file pickers, and OS-level integrations only. Detail in [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md) §3.
- **`setFfmpegPath` called once at startup** — same invariant as today, just sourced from the Tauri-bundled `vendor/` path. Detail in [`../../../server/Hardware-Acceleration/02-Fluent-FFmpeg-Quirks.md`](../../../server/Hardware-Acceleration/02-Fluent-FFmpeg-Quirks.md).
- **All client-server traffic stays on `/graphql` or `/stream/:jobId`** — no implementation-coupling smuggled in via Tauri commands.

## Cutover mechanism

N/A — this step **removes** the cutover mechanism. The flags are dead code at the start of this step (Steps 1 & 2 are both green) and deleted by the end of it.

Discipline note: do **not** keep the flags around "just in case." Half-removed flag scaffolding rots fast and makes the next bug bisectable only against a confusing two-mode binary. Delete on this step or do not start it.

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
