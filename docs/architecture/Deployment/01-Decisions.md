# Decisions — Open Questions Resolved

> **Status:** decisions for the interim Electron + Bun-as-sidecar shell. Each section answers a deferred question with rationale; together they replace the "Open questions" list from the first pass.

This doc resolves the open questions left by [`00-Interim-Desktop-Shell.md`](00-Interim-Desktop-Shell.md). Each section gives background, options, and the call. Where a question turned out to need its own deep-dive (Electron packaging mechanics, ffmpeg shipping), the section here is short and points at the dedicated doc.

## 1. Hardware acceleration

The biggest product risk surfaced in the first pass — and the section that needs the most context, since the current code makes the wrong default for an end-user shell.

### 1.1 Background — what's the current setup

`server/src/services/hwAccel.ts` exposes a **tagged union**: `software` / `vaapi` / `videotoolbox` / `qsv` / `nvenc` / `amf`. The shape is documented in [`docs/server/Hardware-Acceleration/00-Overview.md`](../../server/Hardware-Acceleration/00-Overview.md):

> HW-accel is a tagged union: `HwAccelConfig` in `server/src/services/hwAccel.ts` with variants `software` / `vaapi` / `videotoolbox` / `qsv` / `nvenc` / `amf`. Only `vaapi` is implemented today; stubs exist for macOS/Windows.

At startup, `detectHwAccel` runs a probe:

- **Linux.** Tries a 0.1-second synthetic VAAPI encode via `/dev/dri/renderD128`. Success → `HwAccelConfig::Vaapi`. Probe failure → process exits with diagnostics; the user must re-run `bun run setup-ffmpeg` or fix `/dev/dri/renderD128` permissions.
- **macOS.** Branch *immediately throws* — the doc literally says "VideoToolbox not implemented." Process exits.
- **Windows.** Branch *immediately throws* — same shape. "QSV/NVENC/AMF not implemented." Process exits.

The chosen variant drives `FFmpegFile.applyOutputOptions` in `server/src/services/ffmpegFile.ts`, where the encoder string and per-pipeline filters are built. The software path uses `libx264` exclusively. **Software is reserved for benchmarking and edge-case retry** — never the auto-fallback when probe fails. This is intentional today because the prototype is developer-focused and a probe failure means a misconfigured dev environment.

#### Why software libx264 is not enough

The streaming protocol's encode-rate budget is `duration × 3` (`server/src/config.ts` `transcode.maxEncodeRateMultiplier`). 4K H.264 encode on libx264 stalls below 1× on most consumer CPUs — well below the 3× wall-clock budget. The architecture of the chunker and the playback timeline assume the server can produce segments at least as fast as real-time. Drop below 1×, and `/stream/:jobId` runs out of segments, the client stalls, and `StallTracker` flags the playback session.

In practice: **shipping mac/win on libx264 only means a 1080p ceiling.** Above that, playback degrades to "ffmpeg is the bottleneck" stalls.

### 1.2 Options for the interim shell

| Option | Coverage | Effort | Bundle impact | 4K supported? |
|---|---|---|---|---|
| A. Accept 1080p ceiling on mac/win | Linux only (4K), mac/win 1080p | none | none | mac/win: no |
| B. Implement VideoToolbox (mac only) | Linux + mac (4K), win 1080p | medium | none (jellyfin-ffmpeg ships codec) | mac: yes |
| C. Implement Windows hardware (NVENC + QSV + AMF) | All OSes 4K | high | none | all: yes |
| D. Defer all HW work until Rust port | Linux only | none | none | mac/win: no |

#### Option B in more detail

`jellyfin-ffmpeg` already ships VideoToolbox encoders on macOS — both `h264_videotoolbox` and `hevc_videotoolbox`. The work is additive to the existing tagged union:

1. **Probe** — `services/hwAccel.ts` macOS branch runs `ffmpeg -hide_banner -encoders | grep videotoolbox`. If `h264_videotoolbox` appears, return `HwAccelConfig::VideoToolbox`. If not, return `HwAccelConfig::Software` with a one-time toast (see "soft fallback" below).
2. **Apply** — `FFmpegFile.applyOutputOptions` learns a `VideoToolbox` arm: `-c:v h264_videotoolbox` + appropriate `-b:v` / `-allow_sw 0`. No GPU filter graph — VideoToolbox does its own scaling on Apple Silicon.
3. **Test** — encode-pipeline test fixture for one 4K Apple-Silicon-friendly source. Per [`02-Encoder-Edge-Case-Policy.md`](../Testing/02-Encoder-Edge-Case-Policy.md): every fix needs a fixture in the same PR.

Apple Silicon's media engine handles 4K H.264 encode in real-time. Intel Macs still exist but represent a declining share of the macOS install base; for those, the implementation falls back to software with the same 1080p caveat as Option A.

#### Option C — why we don't take it for the interim

Three vendor-specific paths (Nvidia / Intel iGPU / AMD), each with its own probe, codec name, filter graph, and edge cases. Each needs a test fixture. The Rust port will rewrite all of this against a different ffmpeg-rs API anyway. Cost-benefit doesn't justify the work for a throwaway shell.

### 1.3 Recommendation

**Option B for macOS + Option A for Windows + soft-fallback for Linux probe failures.**

- **macOS.** Implement `videotoolbox` arm now. Apple Silicon dominates current macOS sales, and the implementation is bounded.
- **Windows.** Accept 1080p ceiling for interim. Document in the Settings → "About" panel ("4K playback on Windows requires the Rust port — coming in a future release"). Users with 4K source content on Windows watch at 1080p quality until then.
- **Linux.** Keep VAAPI as the auto path, but **soften probe failure to a one-time toast + automatic software fallback**, mirroring the migration-spec policy in [`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md) §5. Fresh Linux users may lack `/dev/dri/renderD128` permissions — fatal-on-probe-failure would brick the app for them.

This keeps the bundle scope tight, ships a working 4K experience on the most common consumer-laptop OS targets (Linux + Apple Silicon Mac), and pushes Windows 4K to the Rust port where the rewrite happens anyway.

### 1.4 Soft-fallback shape (all OSes)

```ts
// services/hwAccel.ts (Electron-aware)
export function detectHwAccelWithFallback(): HwAccelOutcome {
  const result = probeHwAccel();
  if (result.ok) return { strategy: result.config };

  if (process.env.XSTREAM_INTERIM_SHELL === "1") {
    log.warn("HW-accel probe failed, falling back to software", { error: result.error });
    return {
      strategy: HwAccelConfig.Software,
      fallbackToast: { reason: result.error.message, dismissable: true },
    };
  }
  // dev mode keeps the existing fatal behavior
  throw result.error;
}
```

The `XSTREAM_INTERIM_SHELL=1` env var is set by the Electron main process before spawning the Bun sidecar, so the soft-fallback only activates in the production shell. Dev workflows (`bun run dev`) keep fatal-on-probe-failure as today.

The toast is delivered to the renderer via a one-time `hwaccel.fallback` log line that the Electron main process tail-greps from the sidecar's stdout and forwards via `webContents.send`. Persisted in `user_settings`: once dismissed, no further nags.

## 2. Bun packaging — how the runtime ships

The Bun runtime is **not statically linked** — we have to ship something.

### Options

- **A. `bun build --compile --outfile=server`** — produces a single binary that bundles the Bun runtime *and* the bundled server JS into one file. ~110–150 MB.
- **B. Ship the Bun binary + the JS bundle separately** — Electron main process spawns `child_process.spawn(bunBinaryPath, [bundleJsPath])`. Bun binary ~100 MB, JS bundle ~few MB.

### Recommendation — Option A (`bun build --compile`)

- **Simpler to ship.** One file in `extraResources`; no path-resolution dance for "which Bun binary on this OS."
- **Version pinning.** The Bun runtime version is locked to the build — no chance of a host-installed Bun being picked up.
- **Update payload size is unaffected.** `electron-updater`'s NSIS-web delta on Windows and AppImage zsync on Linux both do block-level diffs. The Bun runtime portion of the binary doesn't change between versions where only the server JS changes — the diff will be small regardless of whether Bun + JS are one file or two. macOS Squirrel.Mac sends full bundles either way.
- **No moving parts.** The Bun process needs no command-line arguments; the bundled JS is the entrypoint. Electron's main process spawns the binary by path and that's it.

### Per-OS ffmpeg / Bun layout in the bundle

`extraResources` config (`electron-builder.yml`):

```yaml
extraResources:
  - from: "vendor/bun/${os}/${arch}/bun-server"
    to: "bun-server"
  - from: "vendor/ffmpeg/${os}-${arch}/"
    to: "ffmpeg/"
    filter: ["ffmpeg*", "ffprobe*"]
```

At runtime, Electron's main process resolves these via `process.resourcesPath`:

```ts
// electron/main.ts
const resourcesDir = process.resourcesPath;
const bunServerPath = path.join(resourcesDir, "bun-server");
const ffmpegDir = path.join(resourcesDir, "ffmpeg");

const sidecar = spawn(bunServerPath, [], {
  env: {
    ...process.env,
    DB_PATH: path.join(app.getPath("userData"), "xstream.db"),
    SEGMENT_DIR: path.join(app.getPath("cache"), "xstream", "segments"),
    FFMPEG_DIR: ffmpegDir,
    XSTREAM_INTERIM_SHELL: "1",
    HW_ACCEL: "auto",
  },
});
```

`FFMPEG_DIR` is read by `services/ffmpegPath.ts` to skip the manifest-prescribed lookup path and use the bundle's resources path instead. Details in [`03-Shipping-FFmpeg.md`](03-Shipping-FFmpeg.md).

## 3. Static asset serving

The Bun server today only handles `/graphql` and `/stream/*`. Everything else 404s. Under Electron there are two ways for the renderer to load `index.html`:

- **A. Add a static handler to the Bun server.** Falls through to `client/dist/` for any path that isn't `/graphql` or `/stream/*`. Renderer loads `http://127.0.0.1:<port>/`.
- **B. `BrowserWindow.loadFile('client/dist/index.html')`.** Renderer reads from the filesystem; only API calls hit the Bun server.

### Recommendation — Option A

Add a static handler. The dev workflow already has the Rsbuild dev server proxying API calls to the Bun server on a different port (with `/graphql` and `/stream/*` rules); under Electron, the renderer talks to the Bun server directly for *everything* — assets and APIs share an origin. This keeps `client/src/relay/environment.ts`'s relative URL discovery (`window.location.host`) uniform across dev and prod.

Implementation: a single `Bun.serve()` route handler that falls through after `/graphql` and `/stream/*` checks fail, looks up `client/dist/<path>` and serves with appropriate `Content-Type`. Files unknown → return `index.html` (so React Router client-side routes work). The bundled `client/dist/` lives in `extraResources` next to the Bun binary; the server reads `process.env.CLIENT_DIST_PATH` for the location.

## 4. Library picker UX

`mediaFiles.json` has been removed from the codebase (see this PR's cleanup commit). Libraries live exclusively in the `libraries` DB table, populated by the `createLibrary` GraphQL mutation.

Under the interim shell:

- **First-run flow.** Empty `libraries` table → renderer shows an empty-state screen with a single button: "Add a library folder to get started." Clicking it opens an Electron native folder picker via main-process IPC (`dialog.showOpenDialog`). The selected path becomes the argument to an `createLibrary` mutation.
- **Settings page.** Existing Settings → Libraries section gets an "Add another library" button with the same flow. Per-library "Remove" affordance also lives here.
- **No CLI / config-file alternative.** The desktop user has no shell access path to add libraries.

The folder picker dialog needs the Electron main process — the renderer cannot open native dialogs directly. The IPC path is one-way (renderer → main → renderer with the chosen path), small surface area, no Relay churn.

## 5. Update signing

`electron-builder` uses the same code-signing certs that produce the installer for update verification. There is no separate "update signing key" for macOS or Windows.

- **macOS.** Apple Developer ID cert signs the `.app` bundle; `electron-updater` verifies the codesign chain on the downloaded `.zip` payload before applying.
- **Windows.** Authenticode cert signs the `.exe` and `.msi`; `electron-updater` verifies the cert chain before applying NSIS-web deltas.
- **Linux.** `electron-builder` generates a per-app signing key (a `cert.pem` + `key.pem` pair) used to sign the `latest-linux.yml` manifest. The first installed AppImage embeds the public key; updates verify against it.

### Where the keys live

| Key | Storage | CI secret name |
|---|---|---|
| Apple Developer ID `.p12` | 1Password Secrets Automation | `CSC_LINK` (base64), `CSC_KEY_PASSWORD` |
| Apple notarization | 1Password | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Windows Authenticode `.p12` | 1Password (OV) or HSM token (EV) | `CSC_LINK`, `CSC_KEY_PASSWORD` |
| Linux update signing | Repo: `build/linux-key.pem` (gitignored, added to GH secrets) | `LINUX_UPDATE_PRIVATE_KEY` |

A compromised cert is the most damaging incident this app can have — it lets an attacker ship a "signed" update that runs arbitrary code. If a private key is ever exposed:

1. Revoke at the issuer (Apple, Sectigo / DigiCert, ours).
2. Issue a new cert.
3. Ship a new build signed with the new cert. Existing users must reinstall manually — auto-update *cannot* hop certs (the old chain is no longer valid).

This is acceptable risk for an interim build. The Rust + Tauri port uses an Ed25519 key for `tauri-plugin-updater` separate from the OS code-signing certs ([`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md) §6); we do not adopt that pattern in the interim because `electron-updater` cannot verify Ed25519 signatures.

## 6. Update channel strategy

- **`stable` only at first.** No `beta` until we have ~3 versions of stable in users' hands and a clear soak protocol. Adding a channel before that creates noise.
- **`beta` re-introduced** when we have ~10 willing testers + a separate `latest-beta.yml` manifest path. `electron-updater`'s `provider.channel` config switches a build's update target.
- **`alpha` not used** — likely the Rust port lands before we'd need it.

Per-channel CI: the same `release.yml` workflow, gated on tag suffix (`-beta` → channel `beta`, no suffix → `stable`).

## 7. Summary table

| Question | Decision | Where executed |
|---|---|---|
| HW accel on mac | Implement `videotoolbox` arm in `hwAccel.ts` | `services/hwAccel.ts`, `services/ffmpegFile.ts` |
| HW accel on Windows | Defer to Rust port; ship 1080p ceiling | UX disclosure in Settings; no code change |
| HW accel probe failure | Soft fallback + one-time toast under interim shell | `services/hwAccel.ts` (env-gated) |
| Bun packaging | `bun build --compile` to single binary in `extraResources` | `electron-builder.yml` + `electron/main.ts` |
| Static assets | Bun server gains static handler under `/`, prod + dev uniform | `server/src/index.ts`, `server/src/routes/static.ts` (new) |
| Library picker | First-run + Settings → Electron folder picker → `createLibrary` mutation | `electron/main.ts` IPC + renderer Settings page |
| Update signing | Reuse OS code-sign certs; Linux uses `electron-builder`-generated key | CI secrets via 1Password |
| Update channels | `stable` only at v1; `beta` later if needed | `electron-builder.yml` `publish.channel` |
