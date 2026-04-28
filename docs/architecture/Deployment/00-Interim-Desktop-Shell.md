# Interim Desktop Shell

> **Decision:** ship the interim desktop build using **Electron + Bun-as-sidecar**. The northstar is the Rust + Tauri rewrite ([`docs/migrations/rust-rewrite/`](../../migrations/rust-rewrite/)); this shell is throwaway, picked for tooling maturity so we can release without rushing the rewrite.

The Rust + Tauri migration spec at [`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md) is phase F of the migration — it assumes the Rust port has already landed. Nothing in `docs/` covered the *before-Rust-port* desktop story, and that's the gap this folder fills.

This doc is the index. It states the choice, lists the architectural surface a shell must accept, and points at the companion docs in `Deployment/` for each decision (HW accel, Bun packaging, ffmpeg shipping, Electron packaging internals).

## 1. Why Electron — and what was reconsidered

The first pass of this analysis recommended Tauri-with-Bun-sidecar to maximise carryover to the Rust + Tauri northstar. After a closer read, **Electron wins on the axes that matter most for an interim shell**:

- **Zero compatibility risk for the streaming protocol.** Electron's renderer is Chromium, so it loads `http://127.0.0.1:<port>/` like any browser. Our `/graphql` HTTP+WS and `/stream/:jobId` length-prefixed binary surface need *zero* changes — no transport-layer surprises.
- **Production-grade tooling on every OS.** `electron-builder` covers macOS Developer ID + notarization, Windows Authenticode, and Linux `.AppImage` / `.deb` / `.rpm` / `.snap`. `electron-updater` handles auto-updates with delta support on Windows (NSIS-web), full-replace on macOS (Squirrel.Mac), and AppImage zsync on Linux.
- **The `child_process.spawn` sidecar pattern is the most-trodden in desktop apps** — Postman, GitHub Desktop, and many others run a long-lived Node / Bun / Go server alongside the UI. There's nothing to *prove*; it works.
- **We ship Chromium anyway.** A WebView-based shell (Tauri, Electrobun) saves bundle size by reusing the OS's web engine — but we'd ship libx264 / Chromium-equivalent decoders transitively for video playback regardless. The bundle-size delta isn't as large as it looks.

What we trade off: **~150 MB extra installer** (Chromium per OS) and **shell glue gets thrown away at migration time**. Signing keys, CI runner matrix, and release-tagging convention carry over to Rust + Tauri regardless of shell choice — so the throwaway is concentrated in the `electron/main.ts` entry, the `electron-builder` config, and the `electron-updater` integration. That's bounded.

Tauri-with-Bun-sidecar and Electrobun were both reconsidered:

- **Tauri-with-Bun-sidecar** is a viable alternative. It would maximise migration carryover but requires verifying that Bun-as-sidecar with binary streaming through it works in practice (the `tauri-plugin-shell` sidecar pattern is documented for Node / Python / Go but not for our HTTP-binary-stream shape). Lower risk than Electrobun but higher than Electron. **Rejected because** the migration carryover argument is partly aspirational — we have no Tauri experience yet, so "carryover" is two learning curves not one.
- **Electrobun** has two undocumented areas (subprocess support, `Bun.serve()` + webview localhost loading) sitting on the critical path of our streaming protocol, plus mac-only signing docs. **Rejected as too immature** for an interim ship-target. Re-evaluate if Electrobun's docs cover sidecars and Windows / Linux signing.

## 2. The architectural surface a shell must accept

Every load-bearing runtime concern, with a code pointer. Electron must accommodate each of these or we break something. Companion docs cover the implementation detail.

- **Bun runtime + `bun:sqlite`.** Server entry at `server/src/index.ts`; DB initialisation at `server/src/db/index.ts` (WAL + foreign keys, auto-migrate on first `getDb()` call). Bun is *not* statically linked; we ship the runtime alongside or compile to a single binary. → see [`01-Decisions.md`](01-Decisions.md) §"Bun packaging".
- **`Bun.serve()` listening on `config.port` with `idleTimeout: 0`** (`server/src/index.ts`, lines 77–113). Two endpoints share the path: `/graphql` (HTTP GET/POST + WS upgrade for `graphql-ws`) and `/stream/:jobId` (binary length-prefixed chunked HTTP, can run for minutes per request). Same path, same port, both transports. Electron's renderer talks to this directly — no IPC layer in the request path.
- **Long-lived ffmpeg children.** 3 concurrent jobs maximum, 5 s SIGTERM → SIGKILL grace, 30 s orphan timeout (`server/src/config.ts`, lines 63–71). Per-job process supervision in `server/src/services/ffmpegFile.ts`. Bun spawns these children directly — Electron is not in the path.
- **Pinned `jellyfin-ffmpeg` per OS.** `scripts/ffmpeg-manifest.json` pins `7.1.3-5` with per-platform SHA256s. → see [`03-Shipping-FFmpeg.md`](03-Shipping-FFmpeg.md) for the Electron-bundled portable strategy.
- **Hardware acceleration is Linux-only today.** macOS (VideoToolbox) and Windows (QSV / NVENC / AMF) are *fatal stubs* in `server/src/services/hwAccel.ts`. → see [`01-Decisions.md`](01-Decisions.md) §"Hardware acceleration" for the decision and rollout.
- **Filesystem writes default to `tmp/`.** `tmp/xstream.db` (DB), `tmp/segments/` (20 GB LRU segment cache). Both env-overridable via `DB_PATH`, `SEGMENT_DIR`, `SEGMENT_CACHE_GB` ([`00-AppConfig.md`](../../server/Config/00-AppConfig.md)). Electron's main process sets these to `app.getPath('userData')` / `app.getPath('cache')` before spawning the sidecar.
- **Library config.** Libraries live in the `libraries` DB table, populated via the `createLibrary` GraphQL mutation. Interim shell needs a "pick folder" UX in the renderer — see [`01-Decisions.md`](01-Decisions.md) §"Library picker".
- **OTel / OTLP outbound.** Defaults to `http://localhost:5341/ingest/otlp` (Seq), overridable via `OTEL_EXPORTER_OTLP_ENDPOINT`. Production builds disable the exporter unless the user opts in via settings.
- **Client → server URL.** `client/src/relay/environment.ts` uses `/graphql` for HTTP and `${wsProtocol}//${window.location.host}/graphql` for WS. The renderer loads `http://127.0.0.1:<port>/` from the Bun server, so `window.location.host` resolves correctly without code changes — but the Bun server **does not currently serve the client bundle**. → see [`01-Decisions.md`](01-Decisions.md) §"Static asset serving".
- **Signal handling.** SIGTERM and SIGINT trigger graceful shutdown (`server/src/index.ts`, lines 118–131). Electron's main process forwards window-close to a sidecar-shutdown sequence with a 5+ second grace.

## 3. Distribution

`electron-builder` produces per-OS artefacts. CI matrix uses native runners — no cross-compilation.

| OS         | Primary format        | Secondary           | Architectures              |
|------------|-----------------------|---------------------|----------------------------|
| macOS      | `.dmg`                | `.zip`              | universal (x64 + arm64)    |
| Windows    | `.exe` (NSIS)         | `.msi` (WiX)        | x64 (arm64 deferred)       |
| Linux      | `.AppImage`           | `.deb`, `.rpm`      | x64 (arm64 deferred)       |

Code-signing requirements are platform-level, not Electron-specific:

- **macOS.** Apple Developer ID Application cert + `notarytool` notarization. Hardened runtime + entitlements for Bun's JIT (`com.apple.security.cs.allow-jit`).
- **Windows.** Authenticode cert. OV is acceptable; EV avoids SmartScreen warm-up but requires hardware token.
- **Linux.** No OS-mandated signing; AppImage update payloads are signed by `electron-updater`'s own key.

Cross-platform packaging mechanics, asar, `extraResources`, and what an installed app actually contains — see [`02-Electron-Packaging-Internals.md`](02-Electron-Packaging-Internals.md).

## 4. Updates — `electron-updater`

Production-grade, self-hosted, signature-verified. The wire shape:

- **Provider.** `generic` (a static origin: Cloudflare R2, AWS S3, GitHub Pages) or `github` (uses GH Releases directly). Manifests live at `latest.yml` (Windows / generic), `latest-mac.yml`, `latest-linux.yml`.
- **Mechanism per OS.**
  - macOS: Squirrel.Mac. Full `.zip` replaces the installed `.app` atomically. No deltas — but `.zip` compression on the `.app` payload is decent.
  - Windows: NSIS-web. **Delta updates via bsdiff** between the installed and target build — typical patch size 10–50 MB for our Chromium-heavy installer.
  - Linux: AppImage zsync — block-level diff against the installed AppImage. Typical delta ~5–30 MB.
- **Signature verification.** macOS: `codesign` chain; Windows: Authenticode; Linux: `electron-updater`'s own SHA512 + the manifest's signing key. The updater refuses unsigned payloads on macOS and Windows.
- **Channels.** `stable` / `beta` / `alpha` first-class via `provider.channel` config + per-channel manifest paths.
- **Rollback.** Not built in. Users who need to revert install a previous release manually. Acceptable for prototype.
- **Schedule.** Default check-on-startup + every 24h while running. Tunable. Pause checks during active playback (settings toggle) is a future improvement.

For the per-version signing keys, channel rollout strategy, and the open release-engineering questions, see [`01-Decisions.md`](01-Decisions.md) §"Update signing".

## 5. CI integration

The current `.github/workflows/ci.yml` is `ubuntu-latest`-only and has no release artefacts. Release is a separate workflow tag-triggered.

- **New file:** `.github/workflows/release.yml`, triggered on tag push (`v*.*.*`).
- **Matrix (no cross-compile):**
  - `macos-14` (arm64) + `macos-13` (x64) → universal `.dmg`
  - `windows-latest` (x64) → `.exe` (NSIS) + `.msi`
  - `ubuntu-latest` (x64) → `.AppImage` + `.deb`
- **Per-job sequence:** checkout → `bun install` → `bun run build` (server bundle + client bundle) → `bun run setup-ffmpeg --target=portable` → `electron-builder --<os>` → sign → upload artefact → publish updater manifest.
- **Secrets:**
  - macOS: `CSC_LINK` (base64 .p12), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
  - Windows: `CSC_LINK` + `CSC_KEY_PASSWORD` (or HSM token reference for EV).
  - Updater: `electron-builder` signs implicitly via the OS code-sign chain; no separate updater key needed for macOS/Windows. Linux AppImage updates use `electron-builder`'s built-in signing.
- **Artefact upload** to the GitHub Release. `electron-builder --publish always` writes `latest.yml`, `latest-mac.yml`, `latest-linux.yml` alongside the artefacts; `electron-updater` reads those at runtime.
- **The existing `ci.yml` stays as-is** — it's the per-PR validation pipeline. Release is tag-driven and separate.

The `ci.yml` matrix and secrets carry over verbatim to the Rust + Tauri release pipeline at migration time — only the bundler invocation (`electron-builder` → `tauri build`) and the updater secret names change.

## 6. Invariants — what the interim shell must preserve

The Rust + Tauri port enumerates the full client-side invariant list in [`00-Rust-Tauri-Port.md`](../../migrations/rust-rewrite/00-Rust-Tauri-Port.md). The interim Electron shell must preserve a strict subset:

1. **Client code unchanged.** No edits to `client/src/relay/environment.ts` or to any Relay fragment to accommodate the shell. The renderer loads `http://127.0.0.1:<port>/`, `window.location.host` resolves to the Bun server, full stop.
2. **`/stream/:jobId` framing untouched.** Length-prefixed binary chunks pass through the renderer as raw HTTP. No IPC layer JSON-serializes the body — same reasoning as [`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md) §3 rejects Tauri IPC for the Rust server.
3. **`setFfmpegPath` called once at startup.** The shell does not re-invoke `setFfmpegPath` from a separate path; the `services/ffmpegPath.ts` memoised resolver remains the only writer ([`02-Fluent-FFmpeg-Quirks.md`](../../server/Hardware-Acceleration/02-Fluent-FFmpeg-Quirks.md)).
4. **OTel traceparent threading preserved.** The shell does not strip headers from loopback requests; client → server traceparent continues to flow.
5. **DB and segment cache paths configurable via env, not hard-coded.** The Electron main process sets `DB_PATH` / `SEGMENT_DIR` / `SEGMENT_CACHE_GB` before spawning the sidecar; the server itself does not learn it is "running under a shell."
6. **Graceful shutdown honoured.** Window-close → SIGTERM to sidecar → 5+ second grace → SIGKILL. ffmpeg children get cleaned up the same way they are during a normal Bun shutdown.

## 7. Companion docs

| File | Covers |
|---|---|
| [`01-Decisions.md`](01-Decisions.md) | Hardware-acceleration decision (background + options + recommendation), Bun packaging strategy, library picker UX, static-asset serving, update signing, channel rollout. |
| [`02-Electron-Packaging-Internals.md`](02-Electron-Packaging-Internals.md) | Deep dive on how Electron produces cross-platform apps — source → asar → app folder → installer → installed bundle → updates. Walks the user's mental model and corrects what's actually happening. |
| [`03-Shipping-FFmpeg.md`](03-Shipping-FFmpeg.md) | How `jellyfin-ffmpeg` gets bundled per OS, where it lives in the Electron resources tree, how `services/ffmpegPath.ts` resolves it at runtime, and how SHA256 verification moves from runtime to build time. |
