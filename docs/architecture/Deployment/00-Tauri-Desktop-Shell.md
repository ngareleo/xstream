# Tauri Desktop Shell

How the Rust server + React/Relay client ship as a single signed Tauri desktop bundle for Linux, Windows, and macOS, distributed by the user (no third-party app stores). Self-hosted updates, bundled jellyfin-ffmpeg, code-signing per OS, and a CI matrix to produce all artefacts on every release tag.

This is the prescriptive spec; for the underlying mechanics walkthrough read [`01-Packaging-Internals.md`](01-Packaging-Internals.md).

## 1. Tauri v2 project layout

```
xstream/
├── client/                          # React app (Rsbuild)
├── server-rust/                     # Rust workspace — the server
├── src-tauri/                       # Tauri shell
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── src/
│   │   ├── main.rs                  # Tauri app entry; spawns the Rust server thread
│   │   ├── server_supervisor.rs     # Manages the embedded server's lifecycle
│   │   └── ffmpeg_path.rs           # Tauri-aware ffmpeg path resolution
│   ├── icons/                       # Per-OS app icons
│   └── resources/                   # See "Bundling ffmpeg" — vendor/ffmpeg/<platform>/
└── scripts/
    ├── ffmpeg-manifest.json         # see 02-Shipping-FFmpeg.md
    └── setup-ffmpeg                 # populates src-tauri/resources/ffmpeg/<platform>
```

`src-tauri/` is a sibling of `client/` and `server-rust/`, owned by the Tauri runtime. `tauri.conf.json` is the single source of truth for bundle metadata.

### Key `tauri.conf.json` fields

```jsonc
{
  "productName": "xstream",
  "version": "0.0.0",                                       // injected by CI from git tag
  "identifier": "com.example.xstream",                      // reverse-DNS — locked, used by tauri-plugin-updater for path scoping
  "build": {
    "beforeBuildCommand": "bun run build:client && bun run setup-ffmpeg --target=tauri-bundle",
    "frontendDist": "../client/dist",                       // Rsbuild output
    "devUrl": "http://localhost:5173"                       // dev only
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg", "deb", "appimage", "msi", "nsis"],
    "resources": ["resources/ffmpeg/**/*"],                 // bundled ffmpeg per platform
    "macOS": {
      "signingIdentity": "Developer ID Application: <ORG> (<TEAMID>)",
      "entitlements": "src-tauri/entitlements.plist",
      "minimumSystemVersion": "11.0"
    },
    "windows": {
      "certificateThumbprint": null,                        // CI sets via env / signtool
      "wix": {
        "language": "en-US"
      }
    },
    "linux": {
      "deb": {
        "depends": []                                       // empty — ffmpeg bundled
      },
      "appimage": {
        "bundleMediaFramework": false                       // we ship our own ffmpeg
      }
    }
  },
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://updates.example.com/{{target}}/{{arch}}/{{current_version}}"
      ],
      "pubkey": "<base64-encoded ed25519 public key>",      // counterpart of the signer key in CI
      "windows": { "installMode": "passive" }
    }
  }
}
```

The `pubkey` is the **update signing public key**, NOT the node's identity pubkey from sharing — they are unrelated keypairs.

## 2. Embedding the React client

The React/Relay client is built once by Rsbuild (`client/dist/`) and bundled into the Tauri app's resources via `frontendDist`. At runtime the webview loads `tauri://localhost/index.html` directly from the bundle — no HTTP serve from the Rust server is involved for the client itself.

This means **the Rust server does NOT serve static files in production.** Production routes are only `/graphql` and `/stream/:job_id`.

### OTLP exporter under Tauri

When running under Tauri there is no Rsbuild dev proxy at `/ingest/otlp` — that proxy only exists in dev. The Rust process exports OTLP directly to the configured endpoint:

- Default: `http://localhost:4317` (a user-installed local Seq with the OTLP receiver enabled), failing silently if unreachable.
- Configurable via in-app settings (`<app_data_dir>/xstream.db` `user_settings` table) — `OTEL_EXPORTER_OTLP_ENDPOINT` env override remains supported for dev/CI.

Cross-reference [`docs/architecture/Observability/`](../Observability/README.md) for the OTLP transport.

## 3. Embedding the Rust server

Two options were on the table; one is rejected.

### Option A — server runs in-process, bound to a random free `127.0.0.1` port (chosen)

```rust
// src-tauri/src/main.rs
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            let port = pick_free_port();                              // bind 0 then read .local_addr()
            tauri::async_runtime::spawn(async move {
                xstream_server::run(ServerConfig {
                    bind_addr: format!("127.0.0.1:{port}").parse().unwrap(),
                    cache_db_path: app_handle.path().app_cache_dir().unwrap().join("xstream.db"),
                    identity_db_path: app_handle.path().app_data_dir().unwrap().join("xstream-identity.db"),
                    ffmpeg_paths: ffmpeg_path::resolve(&app_handle).unwrap(),
                    cors_allowlist: vec!["tauri://localhost".to_string()],
                }).await.expect("server crashed");
            });
            // Inject the port into the webview
            let main_window = app.get_webview_window("main").unwrap();
            main_window.eval(&format!("window.__XSTREAM_SERVER_PORT__ = {};", port))?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

The client reads `window.__XSTREAM_SERVER_PORT__` at boot to construct its base URL:

```ts
// client/src/relay/environment.ts (Tauri-aware)
const BASE_URL = (window as any).__XSTREAM_SERVER_PORT__
    ? `http://127.0.0.1:${(window as any).__XSTREAM_SERVER_PORT__}`
    : "http://localhost:3001";                                       // dev fallback
```

**Why this option won**: every protocol stays HTTP (no IPC churn), the Rust server's binary streaming endpoint works unchanged, and the React/Relay client stays unchanged across the bundle.

### Option B — server logic compiled directly into Tauri commands (REJECTED)

Replace the HTTP layer with Tauri's IPC bridge: every GraphQL request becomes `invoke("graphql", { ... })` and the binary stream becomes a custom Tauri event channel.

**Rejected** because:
- It breaks the `/stream/:jobId` length-prefixed binary protocol — Tauri events serialize via JSON.
- It forces a wholesale client rewrite of the Relay environment.
- It violates the invariant that the React/Relay client stays unchanged across the migration.

Documented for completeness; not chosen.

## 4. Bundling ffmpeg

[`02-Shipping-FFmpeg.md`](02-Shipping-FFmpeg.md) covers manifest pinning + runtime path resolution end-to-end; this section is the build-time bundling overview and Tauri's resource discovery.

### Build flow

```
scripts/setup-ffmpeg --target=tauri-bundle  (run by tauri.conf.json beforeBuildCommand)
    │
    ▼
For the current build's target platform:
  - Read scripts/ffmpeg-manifest.json
  - Download the matching asset (or use cached vendor/ffmpeg/<platform>/ if hash matches)
  - Verify SHA256
  - Extract to vendor/ffmpeg/<platform>/
  - Copy vendor/ffmpeg/<platform>/{ffmpeg,ffprobe}[.exe] to src-tauri/resources/ffmpeg/<platform>/
    │
    ▼
Tauri bundles src-tauri/resources/** into the app payload
```

The `--target=tauri-bundle` flag tells the existing setup script to also stage `src-tauri/resources/ffmpeg/<platform>/`. Linux deb-install strategy is replaced under Tauri by the portable build (we don't expect users to have apt access, and the deb path would not work on AppImage).

### Runtime resolution

```rust
// src-tauri/src/ffmpeg_path.rs
pub fn resolve(app: &tauri::AppHandle) -> Result<FfmpegPaths, FfmpegPathError> {
    let resource_dir = app.path().resource_dir().expect("resource dir");
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let bin_name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let probe_name = if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" };
    let ffmpeg = resource_dir.join("ffmpeg").join(&platform).join(bin_name);
    let ffprobe = resource_dir.join("ffmpeg").join(&platform).join(probe_name);
    if !ffmpeg.exists() || !ffprobe.exists() {
        return Err(FfmpegPathError::NotInstalled { ffmpeg, ffprobe });
    }
    let version = run_version(&ffmpeg).unwrap_or_else(|| "(unknown)".into());
    Ok(FfmpegPaths { ffmpeg, ffprobe, version_string: version })
}
```

The Tauri-context resolver does NOT check the version against the manifest — the bundle is the source of truth and any drift is impossible after a successful `tauri build`. The version is read for telemetry only.

### Why jellyfin-ffmpeg portable builds

The `jellyfin-ffmpeg` distribution publishes statically-linked portable builds for every supported platform. Static linking matters under Tauri because:

- **Linux**: no `libva` / `libdrm` userspace dependency to install on the user's system. VAAPI works against `/dev/dri/renderD128` directly via the bundled binary's static linkage.
- **macOS**: no `brew install` requirement; the portable tarball ships everything.
- **Windows**: no DLL hell; `.exe` is self-contained.

See [`docs/server/Hardware-Acceleration/00-Overview.md`](../../server/Hardware-Acceleration/00-Overview.md) for the HW-accel pipeline that depends on this binary's specific build.

## 5. VAAPI Linux fallback under Tauri

Under Tauri the user may not be in the `video` / `render` group; permissions to `/dev/dri/renderD128` may not be available on first launch. Fatal-on-probe-failure would brick the app for any user on a fresh Linux install.

**Tauri-mode policy**: probe-failure becomes a soft fallback to software encode + a one-time toast.

```rust
// services/hw_accel.rs (Tauri-aware)
pub fn probe_vaapi_with_fallback(strategy: &mut HwAccelStrategy) -> ProbeOutcome {
    match probe_vaapi() {
        Ok(()) => ProbeOutcome::Ok,
        Err(e) if running_under_tauri() => {
            tracing::warn!(error = %e, "VAAPI probe failed under Tauri — falling back to software encode");
            *strategy = HwAccelStrategy::Software;
            ProbeOutcome::FallbackSoftware { reason: e.to_string() }
        }
        Err(e) => Err(e).expect("VAAPI probe failed and not running under Tauri"),
    }
}
```

The toast is delivered via Tauri's event system: the server emits a `hwaccel_fallback` event, the React layer catches it and shows a one-time-per-launch banner. The user's options surface in settings: "Try hardware acceleration" (re-probe), "Stay on software encode" (persist the choice in `user_settings`).

Cross-reference [`docs/server/Hardware-Acceleration/00-Overview.md`](../../server/Hardware-Acceleration/00-Overview.md).

## 6. Self-hosted updates

Tauri v2 `tauri-plugin-updater` ships with built-in support for a custom JSON update endpoint and Ed25519 signature verification. No third-party auto-updater (Sparkle, Squirrel) is involved.

### Manifest format

The endpoint at `https://updates.example.com/{{target}}/{{arch}}/{{current_version}}` returns either a 204 (no update) or a JSON manifest:

```json
{
  "version": "1.2.3",
  "notes": "Bug fixes and performance improvements.",
  "pub_date": "2026-05-15T18:30:00Z",
  "platforms": {
    "linux-x86_64": {
      "signature": "<base64 ed25519 sig over the asset bytes>",
      "url": "https://releases.example.com/xstream_1.2.3_amd64.AppImage"
    },
    "darwin-aarch64": {
      "signature": "<base64 ed25519 sig>",
      "url": "https://releases.example.com/xstream_1.2.3_aarch64.app.tar.gz"
    },
    "darwin-x86_64": { "signature": "...", "url": "..." },
    "windows-x86_64": { "signature": "...", "url": "..." }
  }
}
```

Tauri verifies the `signature` against the `pubkey` baked into `tauri.conf.json` BEFORE applying the update. A mismatched signature aborts the update with no installation attempted.

### Signing keys

Generate once:
```sh
tauri signer generate -w ~/.tauri/xstream.key
```

Outputs:
- `~/.tauri/xstream.key` — private signing key (PASSWORD-PROTECTED).
- `~/.tauri/xstream.key.pub` — public key (paste into `tauri.conf.json` `plugins.updater.pubkey`).

The private key + its password live in CI secrets:
- `TAURI_SIGNING_PRIVATE_KEY` (the key file's contents)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

**Never commit the private key.** A compromised signing key is the most damaging incident this app can have — an attacker can ship a "signed" update that runs arbitrary code on every user's machine. Store the private key in CI secrets only; if rotated, every user must reinstall once via a non-update path.

### Endpoint hosting

Any static file host works. Recommended:
- Cloudflare R2 / Cloudflare Pages — free tier covers a small user base.
- AWS S3 + CloudFront — same shape, more knobs.
- A `gh-pages` branch on a GitHub Pages site — simplest for OSS.

Both the manifest JSON and the binary assets are static; serve them with a long cache header on assets and a short cache on the manifest.

### In-app updater behaviour

```rust
// src-tauri/src/main.rs (excerpted)
.plugin(tauri_plugin_updater::Builder::new().build())
.setup(|app| {
    let updater = app.updater_builder().build()?;
    tauri::async_runtime::spawn(async move {
        // Check at startup
        if let Ok(Some(update)) = updater.check().await {
            // Surface to the UI; user can defer or accept.
            // On accept, updater.download_and_install().await;
        }
        // Re-check every 24h while the app is running
        loop {
            tokio::time::sleep(Duration::from_secs(24 * 3600)).await;
            let _ = updater.check().await;
        }
    });
    Ok(())
})
```

Failed download → silent retry on the next 24h tick. The user is never blocked from using the app while an update is pending.

## 7. Code-signing per OS

Required to avoid scary OS warnings on first install. Costs are real and recurring.

### macOS — Apple Developer ID + notarization

- **Cost**: $99/yr Apple Developer Program membership.
- **Cert**: "Developer ID Application" cert (NOT "Mac Developer"); install in Keychain on the build machine (CI macOS runner).
- **Signing**: `tauri.conf.json` `bundle.macOS.signingIdentity` — Tauri runs `codesign` automatically.
- **Entitlements**: `src-tauri/entitlements.plist`. Minimum:
  ```xml
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>  <!-- ffmpeg JIT -->
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.network.client</key><true/>
  <key>com.apple.security.network.server</key><true/>                       <!-- the Rust server binds 127.0.0.1 -->
  <key>com.apple.security.files.user-selected.read-only</key><true/>        <!-- library scanner reads user-selected dirs -->
  ```
- **Notarization**: required for distribution outside the App Store. Tauri runs `xcrun notarytool` automatically when `tauri.conf.json` has `bundle.macOS.notarize` configured. Needs an `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID`.
- **Hardened runtime**: required for notarization; enabled by default in Tauri's signing flow.

### Windows — Authenticode

- **Cost**: ~$100-300/yr OV cert from Sectigo / DigiCert / Certum / SSL.com. EV cert (~$300-500/yr) avoids SmartScreen warm-up but requires hardware token.
- **Cert storage**: HSM (preferred) or `.pfx` file with password in CI secrets:
  ```
  WINDOWS_CERTIFICATE          (base64-encoded .pfx)
  WINDOWS_CERTIFICATE_PASSWORD
  ```
- **Signing**: `signtool sign /f cert.pfx /p $pwd /tr http://timestamp.sectigo.com /td sha256 /fd sha256 /a path-to.exe`. Tauri's Windows action handles this when env vars are set.
- **SmartScreen**: even with a valid OV cert, fresh installations may warn the user. EV certs bypass this. For OV, reputation builds over weeks — the warning self-resolves.

### Linux — AppImage signature + optional repo signing

- **Cost**: $0.
- **Signing**: Tauri's updater verifies AppImage downloads via the same Ed25519 key as macOS / Windows updates. No platform-level trust store is involved.
- **Optional**: sign `.deb` packages for users adding a custom apt repo (`gpg --sign`). Skip for v1; ship raw `.deb` + AppImage and let users install directly.

### Summary table

| OS | Cert source | Recurring cost | Tauri config | CI secrets |
|---|---|---|---|---|
| macOS | Apple Developer ID | $99/yr | `bundle.macOS.signingIdentity` + `notarize` | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` |
| Windows OV | Sectigo / DigiCert | $100-300/yr | `bundle.windows.certificateThumbprint` | `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` |
| Windows EV | DigiCert / SSL.com | $300-500/yr + HSM token | Same | Same; hardware token in build runner |
| Linux | Self-signed Ed25519 (Tauri updater) | $0 | `plugins.updater.pubkey` | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |

## 8. Distribution mechanics

### Primary host: GitHub Releases

Each release tag (`v1.2.3`) triggers the CI workflow, which produces:

| Artifact | Filename | Bucket |
|---|---|---|
| macOS app (universal binary, x64+arm64) | `xstream_1.2.3_universal.dmg` + `.app.tar.gz` | GH Release |
| Windows installer | `xstream_1.2.3_x64-setup.exe` (NSIS) + `xstream_1.2.3_x64_en-US.msi` | GH Release |
| Linux AppImage | `xstream_1.2.3_amd64.AppImage` | GH Release |
| Linux deb | `xstream_1.2.3_amd64.deb` | GH Release |
| Update manifest | `latest.json` | Updates host (R2 / S3 / Pages) |
| Per-platform updater bundles | `*.app.tar.gz`, `*.AppImage`, `*.msi.zip` | Updates host |

The CI workflow uses `tauri-action` to drive `tauri build` per OS. The `latest.json` is generated and uploaded by the same job.

### `latest.json` flow

```
Release tag pushed
    │
    ▼
GH Actions matrix (ubuntu-latest, macos-13, macos-14, windows-latest)
    │
    ├─ Build + sign per OS
    ├─ Upload artefacts to GH Release
    └─ Generate per-platform signature lines for latest.json
    │
    ▼
Final job: aggregate latest.json
    {
      version: "1.2.3",
      pub_date: "...",
      platforms: { linux-x86_64: {...}, darwin-aarch64: {...}, ... }
    }
    │
    ▼
Upload latest.json to updates host (with short cache TTL)
```

In-app updater checks at startup + every 24h; the manifest is fetched, version-compared, signature-verified, downloaded, and applied. Failed download = silent retry next tick.

### User-side install paths

| OS | First install | Auto-update path |
|---|---|---|
| macOS | Download `.dmg`, drag to Applications | `tauri-plugin-updater` patches the `.app` in place |
| Windows | Run `.msi` or `.exe` installer | Updater downloads new `.msi.zip` and re-runs the installer in passive mode |
| Linux AppImage | `chmod +x; ./xstream.AppImage` | Updater replaces the AppImage file with the new one |
| Linux deb | `dpkg -i xstream_<v>.deb` | Updater not used; users follow distro update path. Ship apt repo separately if needed (deferred). |

## 9. CI matrix

GitHub Actions workflow at `.github/workflows/release.yml`. Triggered by `push` of tags matching `v*.*.*`.

**Baseline today:** a Linux-only, unsigned, draft-pre-release form of `release.yml` is in place. It uses `tauri-apps/tauri-action@v0` with no signing secrets, produces `.deb` + `.AppImage` as draft GitHub Release artefacts and 7-day workflow artefacts, and carries `HW_ACCEL=off` (CI runners have no `/dev/dri`). A `tauri-build` job in `ci.yml` enforces per-push build parity. The eventual-state matrix shown below is what the signed-release rollout promotes to.

```yaml
name: Release
on:
  push:
    tags: ["v*.*.*"]

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: ubuntu-latest,  target: x86_64-unknown-linux-gnu,    bundles: "appimage,deb" }
          - { os: macos-13,       target: x86_64-apple-darwin,         bundles: "app,dmg" }
          - { os: macos-14,       target: aarch64-apple-darwin,        bundles: "app,dmg" }
          - { os: windows-latest, target: x86_64-pc-windows-msvc,      bundles: "msi,nsis" }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: "${{ matrix.target }}" }
      - uses: tauri-apps/tauri-action@v0
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
          WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "xstream ${{ github.ref_name }}"
          releaseBody: "See CHANGELOG.md"
          args: --target ${{ matrix.target }} --bundles ${{ matrix.bundles }}

  update_manifest:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/build-update-manifest.sh ${{ github.ref_name }} > latest.json
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_R2_TOKEN }}
          command: r2 object put xstream-updates/latest.json --file=latest.json
```

The `build-update-manifest.sh` script reads each platform's signature (uploaded as a GH Release asset by `tauri-action`) and assembles the JSON.

### Ubuntu runner notes

The Linux runner needs a few system libraries to build Tauri (wry / tao depend on libgtk + libwebkit2gtk):

```yaml
- name: Install Linux build deps
  if: matrix.os == 'ubuntu-latest'
  run: |
    sudo apt update
    sudo apt install -y libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
```

These are **build-time only** — nothing the user installs. The bundled AppImage/deb has its own runtime deps managed by Tauri.

## 10. Open questions

The deployment-wide open questions live in this folder's [`README.md`](README.md) — they are tracked there because they cut across all three docs in this folder.

## Cross-references

- [`01-Packaging-Internals.md`](01-Packaging-Internals.md) — the pedagogical deep-dive companion to this spec; walks the build pipeline, installed-app layout per OS, and update mechanics.
- [`02-Shipping-FFmpeg.md`](02-Shipping-FFmpeg.md) — ffmpeg manifest pinning, portable strategy, runtime resolution.
- [`docs/architecture/Streaming/00-Protocol.md`](../Streaming/00-Protocol.md) — the binary stream protocol that Option B would have broken.
- [`docs/architecture/Observability/`](../Observability/README.md) — OTLP exporter behaviour under Tauri (no proxy).
- [`docs/server/Hardware-Acceleration/00-Overview.md`](../../server/Hardware-Acceleration/00-Overview.md) — VAAPI Linux fallback motivations.
