# Tauri Packaging Internals

> **Audience:** an architect who knows the streaming + Rust + ffmpeg surface but has never shipped a desktop app. The goal is to walk every layer from "source code" to "installed app" to "auto-update," in detail, and correct the common mental model along the way — especially the Electron-derived intuition that desktop apps ship a bundled browser engine and run their server logic in a sidecar process.

The companion doc [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) is the **prescriptive spec** for our Tauri build (config, CI matrix, secrets, signing checklist). This doc is the **internals walkthrough** — it explains *what is happening under the hood* and *why* the spec landed where it did. Read `00` for what to configure; read this for why.

A common starting mental model — often imported from Electron — is: *"The desktop app is a Chromium-bundle with my code injected, and the server runs as a sidecar process the shell spawns."* For a **Tauri** app, both halves are different:

- The "executable" is your **Rust binary**. It is compiled per-OS by `cargo` and `tauri build` and contains your server logic, the Tauri WebView glue, and metadata. There is no second runtime layered on top.
- The WebView is the **operating system's** WebView (WebKit on macOS / Linux, WebView2 on Windows). No Chromium ships with the bundle.
- The server is **not a sidecar**. `xstream_server::run(...)` is a function call inside the same Rust binary, running on the same `tokio` runtime as Tauri itself. The 127.0.0.1 loopback is preserved so the binary stream protocol keeps working unchanged from the client's perspective — but operationally there is one process, not two.

The rest of this doc walks each layer with the actual mechanics named.

## 1. The end-to-end picture

```
Developer machine                  CI runner (per OS)              User's machine
─────────────────                  ──────────────────              ──────────────────
git push (tag v1.2.3)
                          ─────►   checkout
                                   bun run build:client  ────► client/dist/
                                   scripts/setup-ffmpeg
                                     --target=tauri-bundle
                                   ──► src-tauri/resources/ffmpeg/<plat>/

                                   tauri build (per target triple)
                                     │
                                     ├─► cargo build --release
                                     │   ──► target/release/xstream  (Rust binary)
                                     ├─► embed client/dist/ as bundle resources
                                     ├─► copy bundle.resources
                                     │   ──► resources/ffmpeg/<plat>/
                                     ├─► OS-specific package
                                     │   ──► .dmg+.app / .msi+.exe / .AppImage / .deb
                                     ├─► code-sign + notarize
                                     ├─► Ed25519-sign each artefact
                                     └─► emit per-platform signature lines

                                   release.yml aggregator
                                     │
                                     └─► latest.json on updates host

                                                ─────────► download installer
                                                           run installer
                                                           ──► installed app
                                                                                
                                                           tauri-plugin-updater
                                                            checks latest.json
                                                            verifies Ed25519 sig
                                                            downloads full bundle
                                                            installs on quit
```

Four artefacts an architect needs to be able to name:

1. **The Rust binary** — `target/<triple>/release/xstream`. One per OS+arch. Contains the server, the Tauri shell, the embedded React client, and the public Ed25519 update key.
2. **The OS-specific installer** — wraps the binary + resources into `.dmg`+`.app` / `.msi`+`.exe` / `.AppImage` / `.deb`.
3. **The per-platform updater asset** — the same bundle re-packaged for `tauri-plugin-updater` (`.app.tar.gz` / `.msi.zip` / `.AppImage`), each with an Ed25519 signature.
4. **The `latest.json` update manifest** — a tiny JSON file on the updates host that points at the per-platform updater assets and carries their signatures.

The rest of this doc walks each one.

## 2. What "source code" looks like on disk

The xstream repo has three workspaces relevant to Tauri packaging:

```
xstream/
├── client/                    # React + Relay (Rsbuild output: client/dist/)
├── server-rust/               # Rust workspace — the server
├── src-tauri/                 # Tauri shell — the bundle entry point
│   ├── Cargo.toml
│   ├── tauri.conf.json        # bundle config — see 08-Tauri-Packaging.md §1
│   ├── build.rs
│   ├── src/
│   │   ├── main.rs            # Tauri Builder + spawns xstream_server::run on tokio
│   │   ├── server_supervisor.rs
│   │   └── ffmpeg_path.rs     # resolves Tauri resource_dir() → ffmpeg binary
│   ├── icons/
│   ├── resources/             # populated by setup-ffmpeg --target=tauri-bundle
│   │   └── ffmpeg/<plat>/
│   └── entitlements.plist     # macOS (JIT, network server, files.user-selected)
└── scripts/
    ├── ffmpeg-manifest.json   # pinned jellyfin-ffmpeg per OS (unchanged)
    └── setup-ffmpeg           # extended to stage src-tauri/resources/ffmpeg/<plat>/
```

`src-tauri/src/main.rs` is the program entry. The Tauri build has *one* entry point: `main.rs` boots Tauri, opens a WebView, and calls `xstream_server::run(...)` as a function on the same `tokio::async_runtime`. [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §3 documents this as **Option A — server runs in-process, bound to a random free 127.0.0.1 port** and rejects Option B (Tauri IPC) because IPC's JSON serialisation would break the binary length-prefixed `/stream/:jobId` framing pinned in [`docs/architecture/Streaming/00-Protocol.md`](../Streaming/00-Protocol.md).

## 3. The build pipeline — what `tauri build` actually does

The build is one command per OS:

```sh
tauri build --target x86_64-apple-darwin     --bundles app,dmg
tauri build --target aarch64-apple-darwin    --bundles app,dmg
tauri build --target x86_64-pc-windows-msvc  --bundles msi,nsis
tauri build --target x86_64-unknown-linux-gnu --bundles appimage,deb
```

Each invocation runs the same logical pipeline, with OS-specific artefact production at the end. The pipeline:

### 3.1 Dependency resolution + native compile

`cargo build --release` compiles the workspace `server-rust/` + `src-tauri/` into a single static binary. Three things are different from Electron's §3.1:

- **No `node-gyp` rebuild.** There are no native Node modules in the bundle because there is no Node bundle. SQLite is `rusqlite` with the `bundled` feature; ffmpeg is a subprocess (`tokio::process::Command`); OTel is `tracing` + `opentelemetry-otlp` — all pure Rust crates statically linked into the binary.
- **The Rust toolchain is the build dependency.** Cross-compilation is OS-bound (you cannot reliably cross-compile to macOS from Linux without Apple's signing chain), so CI uses native runners per target — same shape as the Electron release matrix.
- **HW-accel features are compile-time.** `vaapi` / `videotoolbox` / `d3d11va` Cargo features turn on the per-OS hardware paths. The Linux bundle ships the VAAPI path; macOS gets VideoToolbox; Windows gets D3D11VA / QSV. VAAPI is the only currently-implemented HW path; the macOS / Windows paths are stubbed and are a **release blocker** for those bundles that Tauri packaging does not unblock on its own.

### 3.2 Frontend resource collection

`tauri.conf.json` declares `frontendDist: "../client/dist"` (see [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §1). At build time `tauri build` reads `client/dist/` and embeds it as bundle resources. At runtime the Tauri WebView intercepts the `tauri://localhost/` URL scheme and serves files from those embedded resources — there is no HTTP server in the path for static assets.

This means **the Rust server does NOT serve static files in production.** [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §2 already calls this out: production routes are only `/graphql` and `/stream/:jobId`.

### 3.3 No asar — what replaces it

Tauri does not have an asar archive. Frontend assets are bundled via the platform's standard resource mechanisms:

- macOS: `<App>.app/Contents/Resources/`
- Windows: `resources/` next to `.exe`
- Linux AppImage: a squashfs that the AppImage mounts at runtime
- Linux `.deb`: `/opt/xstream/resources/`

Source-code concealment is the same level as Electron's asar — i.e., trivially extractable with the right tool. The asar-specific limitation that `process.dlopen` cannot read native modules from inside the archive does not apply here: there are no native loadable modules in a Tauri bundle, only the statically-linked Rust binary plus opaque resource files.

### 3.4 `bundle.resources` — the only escape hatch

`tauri.conf.json`'s `bundle.resources` glob is Tauri's analogue to Electron's `extraResources`. Files matching the glob are copied into the platform's resource directory (the same paths listed in §3.3) untouched.

We use this for `resources/ffmpeg/**/*` — the portable jellyfin-ffmpeg binaries per platform. They cannot be embedded as Rust `include_bytes!` because we need to spawn them as subprocesses (`tokio::process::Command::new(&ffmpeg_path)`) and that requires a real on-disk path. The runtime resolver at `src-tauri/src/ffmpeg_path.rs` calls `app.path().resource_dir()` and joins `ffmpeg/<plat>/{ffmpeg,ffprobe}` against it — see [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §4 for the resolver code and [`02-Shipping-FFmpeg.md`](02-Shipping-FFmpeg.md) for the manifest pin policy.

### 3.5 No Electron runtime injection — what does ship

This is the headline mental-model adjustment relative to Electron.

Electron's §3.5 describes the bundler downloading an ~80–100 MB Electron binary (Chromium + V8 + Node.js + Electron's native glue) and shipping it as the executable the user clicks. Tauri does **not** do this. The user's machine **already has a system WebView** that Tauri is built against:

- **macOS:** WebKit, accessed via the `WKWebView` API. Always present.
- **Linux:** WebKit, via `webkit2gtk` (`libwebkit2gtk-4.1-0`). The runtime needs a sufficiently new version installed — the AppImage / `.deb` do not ship their own. Older distros are a real risk; see §9 below.
- **Windows:** WebView2 (Chromium-based, Microsoft-distributed). Bundled with Windows 11 by default; auto-installed via `Edge` runtime updates on Windows 10.

So a Tauri bundle ships only:

- The Rust binary (~30–50 MB, depending on enabled HW-accel features)
- The embedded React frontend (~10 MB after Rsbuild's compression)
- The bundled jellyfin-ffmpeg (~50 MB per platform, the largest single component)

Net installer size: ~100–150 MB versus Electron's ~220–250 MB. The savings are real, but they come with two trade-offs:

1. **WebView behavioural drift across OSes** — WebKit and WebView2 are *not* the same engine. Browser-spec features the player path depends on (MSE, fetch streaming, MediaSource buffer ranges) need verification on each WebView. This becomes a per-OS integration-test surface.
2. **Linux WebKit version lock-in** — see §9.

### 3.6 OS-specific packaging

The wrapping matrix:

- **macOS.** The Rust binary becomes `<App>.app/Contents/MacOS/xstream`; the `.app` is then put inside a `.dmg` for distribution. We additionally produce `.app.tar.gz` for the updater (§7).
- **Windows.** The binary becomes `xstream.exe`; `tauri build` produces both an MSI (WiX) and an NSIS `.exe` installer. The MSI is the primary updater artefact.
- **Linux.** AppImage (self-mounting executable; preferred for the auto-updater) and `.deb` (extracts to `/opt/xstream/`; falls outside the auto-updater path — users follow distro update mechanics).

What's *inside* differs from a hypothetical Electron build at every layer — see §5.

### 3.7 Code signing

Same platform-native chains as Electron, driven by `tauri.conf.json` and CI env vars rather than `electron-builder`'s config block:

- **macOS.** `tauri build` invokes `codesign` against the `.app` and the `.dmg` using the identity in `tauri.conf.json`'s `bundle.macOS.signingIdentity`. With `bundle.macOS.notarize` configured it also runs `xcrun notarytool` to send the signed app to Apple, wait for notarization, and staple the ticket. Hardened runtime is on by default (notarization requires it).
- **Windows.** `signtool sign` against `.exe` and `.msi`, with timestamping. The cert is supplied via the `WINDOWS_CERTIFICATE` + `WINDOWS_CERTIFICATE_PASSWORD` env vars (or HSM token for EV) — see [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §7.
- **Linux.** No platform-level signing. Update payloads are signed separately with the Tauri Ed25519 key (§7).

The cert procurement specifics, costs, and the SmartScreen-warm-up trade-off live in [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §7. Signing has weeks of lead time and an unmade decision (OV vs EV; remote signer vs self-hosted runner) — this needs to be resolved before the first signed release.

### 3.8 Manifest publication

Tauri uses a **JSON** manifest (`latest.json`), not `electron-updater`'s YAML files. After the per-OS `tauri build` jobs complete, a release-aggregator job pulls each platform's signature out of the build artefacts and assembles a single `latest.json`:

```json
{
  "version": "1.2.3",
  "pub_date": "2026-05-15T18:30:00Z",
  "platforms": {
    "linux-x86_64":  { "signature": "<base64 ed25519 sig>", "url": "https://releases.example.com/xstream_1.2.3_amd64.AppImage" },
    "darwin-aarch64": { "signature": "...", "url": "..." },
    "darwin-x86_64":  { "signature": "...", "url": "..." },
    "windows-x86_64": { "signature": "...", "url": "..." }
  }
}
```

Per [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §6 + §8 the manifest gets uploaded to the updates host (Cloudflare R2 / S3 / GitHub Pages) with a short cache TTL while the binary assets get long-cache headers. The aggregator job today has `needs: build` with no `if: always()`, so a single OS signing failure blocks the manifest for *all* OSes — a CI-policy gap to resolve before the first release tag.

## 4. What the user actually downloads

Per-OS, the user clicks one file:

| OS      | File                              | Size (xstream estimate) | What's inside                                                                  |
|---------|-----------------------------------|-------------------------|--------------------------------------------------------------------------------|
| macOS   | `xstream_1.0.0_universal.dmg`     | ~120 MB                 | Disk image containing `xstream.app` (Rust binary + embedded frontend + ffmpeg) |
| Windows | `xstream_1.0.0_x64-setup.exe`     | ~110 MB                 | NSIS installer that drops the binary tree into `%LOCALAPPDATA%\Programs\xstream\` |
| Windows | `xstream_1.0.0_x64_en-US.msi`     | ~110 MB                 | WiX installer with the same payload — primary updater artefact (§7)            |
| Linux   | `xstream_1.0.0_amd64.AppImage`    | ~110 MB                 | Self-mounting executable; runs without install                                  |
| Linux   | `xstream_1.0.0_amd64.deb`         | ~110 MB                 | Debian package; extracts to `/opt/xstream/` — outside the auto-updater path    |

Sizes assume Rust binary ~40 MB, jellyfin-ffmpeg ~50 MB, embedded frontend ~10 MB, plus Tauri-side bundle metadata. The `.dmg`-vs-Electron-`.dmg` delta (~120 MB vs ~250 MB) is the missing Chromium.

## 5. What's inside the installed app

After install, the user's machine has a directory structure like this:

### macOS (`/Applications/xstream.app/`)

```
xstream.app/
└── Contents/
    ├── Info.plist                   # bundle metadata (version, identifier, entitlements ref)
    ├── MacOS/
    │   └── xstream                  # the Rust binary (~40 MB) — this IS the executable
    └── Resources/
        ├── (no app.asar — embedded frontend lives here as static files)
        ├── ffmpeg/
        │   └── darwin-arm64/
        │       ├── ffmpeg           # jellyfin-ffmpeg portable (~50 MB)
        │       └── ffprobe
        └── icon.icns
```

The contrast with Electron's macOS layout: there is **no `Frameworks/Electron Framework.framework/`**, no `Helpers/`, no `Locales/`, and **no `app.asar`**. `xstream.app/Contents/MacOS/xstream` is your Rust binary itself, not a runtime that loads your code as data.

### Windows (`%LOCALAPPDATA%\Programs\xstream\`)

```
xstream\
├── xstream.exe                      # the Rust binary
├── resources\
│   ├── ffmpeg\
│   │   └── win32-x64\
│   │       ├── ffmpeg.exe
│   │       └── ffprobe.exe
│   └── (embedded frontend)
└── (Tauri-side metadata)
```

No `chrome_*.pak`, no `locales/` directory, no `resources\app.asar`, no `*.dll` for the Electron framework. The contrast with Electron's directory tree (Electron's §5) is striking — the Tauri install layout is roughly *5x smaller* in file count.

### Linux (`/opt/xstream/`)

Similar to Windows: an `xstream` binary at the root, `resources/ffmpeg/linux-x64/`, plus Tauri-side metadata. AppImage extracts to a temp directory at runtime; the layout it mounts is identical to the `.deb` install.

### Process count at runtime

When the user is running xstream, `ps` shows ~1–2 processes for one Tauri instance:

- The Rust binary (the main process — Tauri shell, the `xstream_server::run(...)` task on `tokio`, the WebView host).
- A WebView child process (managed by the OS WebView — WebKit on macOS / Linux, WebView2 on Windows).
- Plus N ffmpeg subprocesses, one per active transcode job (capped at 3 by `config.transcode.max_concurrent_jobs` — see [`docs/architecture/Streaming/`](../Streaming/README.md) for the streaming pipeline).

An Electron equivalent would show ~5 processes per instance (Electron main + GPU helper + ≥1 renderer + sidecar server). The collapse to 1 main + 1 WebView + N ffmpeg is the operational consequence of the in-process server choice.

## 6. Runtime — what happens when the user clicks the icon

1. **OS launches the Rust binary directly.** macOS reads `Info.plist` and locates `Contents/MacOS/xstream`. Windows runs the `.exe`. Linux executes the AppImage's mount stub or the `.deb`'s `/opt/xstream/xstream`. There is no Electron-runtime intermediation step.
2. **`main.rs` boots Tauri.** `tauri::Builder::default()` constructs the app; `tauri::generate_context!()` wires the embedded resources into the WebView's `tauri://localhost/` scheme handler. The OS WebView is created (WebKit / WebView2).
3. **`Builder::setup` runs the in-process server.** From [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §3 Option A:
   - Pick a free port by binding `127.0.0.1:0` and reading `.local_addr()`.
   - `tauri::async_runtime::spawn` `xstream_server::run(ServerConfig { ... })` with that port + `app.path().app_cache_dir()` for the cache DB + `app.path().app_data_dir()` for the identity DB + `ffmpeg_path::resolve(&app_handle)` for the bundled binaries.
   - The server runs on the same `tokio` runtime as Tauri itself — **same process, separate task**, not a child process. This is the load-bearing departure from Electron's sidecar model.
4. **`main_window.eval` injects `window.__XSTREAM_SERVER_PORT__`** into the WebView so the React client knows where to point its Relay environment when it boots.
5. **WebView loads `tauri://localhost/index.html` from embedded resources.** The React app boots, reads `window.__XSTREAM_SERVER_PORT__`, and points `/graphql` (HTTP+WS) and `/stream/:jobId` (binary chunked HTTP) at `http://127.0.0.1:<port>/...`. From the renderer's perspective this is a regular browser session over loopback.

### What's different from "the source code is compiled into an executable"

For a Tauri app the user's original "compile source into an executable" intuition is **closer to true than for Electron**:

- The Rust binary actually *is* compiled per-OS by `cargo`. Your server code, the Tauri shell, and the public update key are all part of that binary's `.text` / `.rodata`.
- The embedded frontend (React HTML/CSS/JS) is the only meaningful "data" surface — read at runtime by the WebView from bundle resources.
- jellyfin-ffmpeg lives outside the binary as a portable subprocess for licensing + size reasons (see [`02-Shipping-FFmpeg.md`](02-Shipping-FFmpeg.md) §"manifest pinning") — but that is a deliberate carve-out, not the default model.

So the data-vs-code distinction Electron has to constantly explain is small here. The mental model that needs adjusting is the *Electron-derived* one: Tauri does *not* ship a runtime + script bundle.

## 7. Auto-update — how `tauri-plugin-updater` actually works

The user's intuition for Electron — *"updates are diffs of the built bundle"* — was half right for Electron (bsdiff / zsync against the built bundle). For **Tauri** the diffing half is wrong: Tauri does **full-bundle replacement** on every platform. The "diff" mental model needs to come out entirely.

### 7.1 Update detection

The Rust binary registers `tauri_plugin_updater` and runs `updater.check().await` at startup and every 24h while the app is running. From [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §6 the endpoint is:

```
https://updates.example.com/{{target}}/{{arch}}/{{current_version}}
```

Tauri substitutes `{{target}}` (e.g. `darwin`, `linux`, `windows`), `{{arch}}` (`aarch64`, `x86_64`), and `{{current_version}}` from compile-time + runtime values. The endpoint returns either:

- **HTTP 204** — no update available; the updater goes quiet until the next tick.
- **HTTP 200 + JSON manifest** — the `latest.json` shape from §3.8 above.

Tauri compares `manifest.version` to the running binary's compile-time version (from `tauri.conf.json` → injected via `env!("CARGO_PKG_VERSION")`).

### 7.2 Update payload format — per OS

**This is where the biggest mental-model adjustment relative to Electron lives.** Tauri does **full-bundle replacement** on every platform — there is no bsdiff (Windows) or zsync (Linux) or Squirrel.Mac partial swap:

- **macOS — full `.app.tar.gz` replacement.** Download the entire ~120 MB tarball, atomically replace the `.app` in `/Applications/`. Same shape as Squirrel.Mac except no Squirrel involvement; `tauri-plugin-updater` does the swap directly.
- **Windows — full `.msi.zip` replacement.** Download the new MSI (zipped), re-run the installer in `passive` mode (`tauri.conf.json` `bundle.windows.installMode: "passive"` — see [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §1). Replaces the entire install tree.
- **Linux AppImage — full file replacement.** Download the new ~110 MB AppImage, replace the old file in-place (the AppImage is a single self-contained executable so this is one `rename(2)`-class operation).
- **Linux `.deb` — not supported by the plugin.** Users on the `.deb` path follow distro-update mechanics (apt repo if we ever ship one; manual `dpkg -i` otherwise). [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §10.5 flags this as an open item; the implication is in-app messaging needs to set the right expectation for `.deb` users.

#### Why this trade

Tauri's design prioritises end-to-end Ed25519 signature verification and atomic-replace simplicity over delta size. The cost is bandwidth per update (~110 MB instead of Electron's typical 10–50 MB Windows bsdiff or 5–30 MB Linux zsync). The benefit is a smaller, auditable update surface: one signature per platform, one verifier in `tauri-plugin-updater`, no bsdiff/zsync code path to harden against malformed-input attacks.

For xstream's release cadence (small user base, infrequent releases) this is acceptable. If the user base or release frequency grows, the bandwidth cost may justify revisiting.

### 7.3 What the diffs are *of* (and why "diff" is the wrong word here)

There are no diffs. Each `.app.tar.gz` / `.msi.zip` / `.AppImage` is the entire post-build artefact, signed once by CI. Architects coming from Electron should expect every update to be a ~110 MB download.

UX implication: the install should not interrupt mid-playback. `bundle.windows.installMode: passive` defers the install until quit; the macOS / Linux flows already do this. [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §10.3 flags "pause checks during active stream" as an open UX question — defaulting to `windows.installMode: passive` and only running `update.download_and_install().await` after `app.quit()` is the recommended posture until that lands.

### 7.4 Backward compatibility — where it actually lives

The bundle is fully replaceable — `tauri-plugin-updater` swaps the entire installed binary atomically. There is no "old binary + new code" mixed state. So the Rust binary, embedded frontend, and bundled ffmpeg together form one version-locked unit. No backward compat across versions for *that* surface.

What needs backward compat is **external state** that survives an update:

- **Two-DB schema split.** Two SQLite databases — the **cache DB** (`app_cache_dir/xstream.db`, wipe-safe) and the **identity DB** (`app_data_dir/xstream-identity.db`, must migrate forward). The cache DB carries transcode / segment / library state; wiping on schema change is acceptable. The identity DB carries user preferences, persistent session state, and (when sharing ships) node keypairs + trusted-peer records — it MUST migrate forward and MUST NOT be in `tmp/`-class storage. A new agent adding a "trusted peers" feature must put the table in the identity DB; this constraint outlives any single release. See [`docs/server/DB-Schema/`](../../server/DB-Schema/README.md).
- **Segment cache layout.** Content-addressed cache key `(video_id, resolution, start_s, end_s) → job_id` decoupled from `job_id`. On ffmpeg manifest bumps the cache is wiped (segments may have different byte-shapes under a different ffmpeg version). The DB row shape is stable.
- **Reverse-DNS bundle identifier.** `tauri.conf.json` `identifier: "com.example.xstream"` (placeholder). Once shipped to users, **this cannot change** without breaking auto-update for existing installs — `tauri-plugin-updater` uses it for path scoping. One-time pre-release decision; must be locked before the first release tag.

### 7.5 Signature verification at update time

Ed25519 verification runs **before** the update is applied. The flow:

1. The `pubkey` field in `tauri.conf.json` `plugins.updater.pubkey` is baked into the Rust binary at compile time (it ends up in `.rodata`).
2. The downloaded payload's `signature` field in `latest.json` is verified against the bundled public key.
3. Mismatch → abort, no install attempted, retry on next 24h tick.

#### Compare/contrast with Electron's chain

- **Electron** piggybacks on the OS code-signing chain (codesign on macOS, Authenticode on Windows) for update verification. The cert that signed the *installer* must match the cert in the running app for the update to be accepted. Linux AppImage uses `electron-builder`'s own per-app key (a separate concept from OS signing).
- **Tauri** uses a single self-signed Ed25519 key for **all three platforms**. Operationally simpler — one key to rotate, one verifier in the plugin — but a compromised signing key is the most damaging incident class. An attacker with the Ed25519 private key can ship a "signed" update that runs arbitrary code on every user's machine.

[`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §6 documents the key generation + CI secret storage; §7 calls out that rotation requires every user to reinstall once via a non-update path. The macOS Developer ID cert rotation runbook is a gap to close before the first cert rotates.

### 7.6 When the update is applied

`tauri-plugin-updater` does **not** apply the update immediately:

- The download happens in the background; the user keeps using the running version.
- On `app.quit()` (or a manual call to `update.download_and_install().await`), the old binary gets replaced and the new version starts on next launch.
- If a download fails, no state is corrupted — the old version keeps running and the next 24h check retries.
- There is no rollback. If a release is broken, users install a previous release manually. Same trade-off as Electron, same UX shape.

## 8. Where the user's mental model needs adjusting

| Common intuition (often Electron-derived) | Tauri reality |
|---|---|
| Desktop apps bundle a browser engine. | Tauri uses the OS WebView (WebKit on macOS/Linux, WebView2 on Windows). No Chromium ships. ~120 MB savings per installer. |
| The server runs as a sidecar process the shell spawns. | The Rust server is an **in-process** task on the same `tokio` runtime as Tauri ([`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §3 Option A). 127.0.0.1 loopback is preserved so the binary stream protocol doesn't change, but `ps` shows one main process, not two. |
| Updates are byte-level diffs of the built bundle. | True for Electron. **False for Tauri** — every platform downloads the full signed bundle (~110 MB). The wire shape is simpler; the bandwidth cost is higher. |
| Code signing for updates is the OS chain. | OS signing (codesign, Authenticode) covers the **installer** trust path. The **update** signing key is a separate Ed25519 keypair baked into `tauri.conf.json`. Tauri verifies updates with its own key, not the OS's. |
| The same React app behaves identically on every OS WebView. | Real concern. WebKit (macOS/Linux) and WebView2 (Windows) have small but non-zero behavioural deltas. Browser-spec features used by xstream's player (MSE, fetch streaming) need explicit per-WebView verification. See §9. |
| Source code is compiled into one executable per OS. | Closer to true for Tauri than for Electron — the Rust binary really is the executable, with your server logic in `.text`. The frontend is read at runtime as data; everything else is statically linked. |

## 9. Architecture-fit callouts

Cross-cutting constraints that justify or threaten the Tauri packaging story. Read alongside the per-section detail above.

- **In-process server preserves the streaming invariant.** [`docs/architecture/Streaming/00-Protocol.md`](../Streaming/00-Protocol.md) pins the pull-based stream protocol (`axum::Body::from_stream` driven by an `mpsc::Receiver`). [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §3 rejects Option B (Tauri IPC) because the binary length-prefixed `/stream/:jobId` framing would not survive IPC's JSON serialisation. Option A keeps every protocol on HTTP over loopback so the React client doesn't change — non-negotiable.
- **Two-DB split is forward-loaded for sharing.** Identity (`app_data_dir`) and cache (`app_cache_dir`) live in separate SQLite files. Tauri's `app_data_dir()` / `app_cache_dir()` resolution maps cleanly — `xstream-identity.db` lives at `~/Library/Application Support/xstream/` (macOS), `$XDG_CONFIG_HOME/xstream/` (Linux), `%APPDATA%\xstream\` (Windows), and survives reinstall + update. See [`docs/server/DB-Schema/`](../../server/DB-Schema/README.md).
- **HW-accel coverage on macOS / Windows is the largest open release risk.** VAAPI on Linux is the only currently-implemented HW path; VideoToolbox + D3D11VA / QSV are stubbed. For 4K on Apple Silicon, software libx264 is a UX regression — this isn't optional. Tauri packaging does not unblock this; it must be unblocked separately before the macOS bundle ships. See [`docs/server/Hardware-Acceleration/`](../../server/Hardware-Acceleration/README.md).
- **CI partial-build policy is unmade.** The `latest.json` aggregation in [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §9 has `needs: build` with no `if: always()`, so one OS signing failure blocks the manifest for all OSes. A per-platform fallback policy is needed before the first release tag.
- **Reverse-DNS identifier is one-shot.** `com.example.xstream` is a placeholder; once shipped, can't change without breaking auto-update for existing installs. One-time decision needed before any user binary.
- **Linux `webkit2gtk` runtime version drift.** AppImage / `.deb` users get the OS's WebKit, not a bundled one. Older distros may ship a too-old `webkit2gtk` (MSE feature gaps, codec coverage holes, fetch-streaming bugs). Three options when this bites: document a minimum-version policy in release notes, require `webkit2gtk` ≥ X via `bundle.linux.deb.depends`, or build a Flatpak that ships its own WebKit. Unresolved risk for the v1 Linux launch.
- **Crash reporting is unmade.** Tauri does not bundle a crash reporter. `sentry-tauri` is the standard integration; without it (and with telemetry off-by-default), production bug reports arrive context-free. Decide before v1.

## 10. Cross-references

- [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) — the prescriptive spec; *what* to configure (Tauri config, CI matrix, secrets, signing checklist).
- [`02-Shipping-FFmpeg.md`](02-Shipping-FFmpeg.md) — manifest pinning + portable strategy + content-addressed segment cache key.
- [`docs/architecture/Streaming/00-Protocol.md`](../Streaming/00-Protocol.md) — pull-based stream protocol; why in-process server preserves the invariant.
- [`docs/server/DB-Schema/`](../../server/DB-Schema/README.md) — two-DB split rationale and the constraints that survive reinstalls.
- [`docs/server/Hardware-Acceleration/`](../../server/Hardware-Acceleration/README.md) — HW-accel coverage; the macOS / Windows gap that blocks those bundles.
