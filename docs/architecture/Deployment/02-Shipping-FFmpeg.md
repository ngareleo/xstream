# Shipping FFmpeg

How `jellyfin-ffmpeg` gets bundled into the Tauri app per OS, where it lives at install time, how the running Rust server locates it, and how SHA256 verification moves from a runtime concern to a build-time invariant.

## 1. The manifest

`scripts/ffmpeg-manifest.json` is the lockfile for our native binary deps. It pins one version of `jellyfin-ffmpeg` per platform with SHA256 hashes:

```jsonc
{
  "ffmpeg": {
    "distribution": "jellyfin-ffmpeg",
    "version": "7.1.3-5",
    "versionString": "7.1.3-Jellyfin",
    "releaseUrl": "https://github.com/jellyfin/jellyfin-ffmpeg/releases/download/v7.1.3-5",
    "platforms": {
      "linux-x64":   { "asset": "jellyfin-ffmpeg_7.1.3-5_portable_linux64-gpl.tar.xz",       "strategy": "portable-tarball", "sha256": "..." },
      "linux-arm64": { "asset": "jellyfin-ffmpeg_7.1.3-5_portable_linuxarm64-gpl.tar.xz",    "strategy": "portable-tarball", "sha256": "..." },
      "darwin-x64":  { "asset": "jellyfin-ffmpeg_7.1.3-5_portable_mac64-gpl.tar.xz",         "strategy": "portable-tarball", "sha256": "..." },
      "darwin-arm64":{ "asset": "jellyfin-ffmpeg_7.1.3-5_portable_macarm64-gpl.tar.xz",      "strategy": "portable-tarball", "sha256": "..." },
      "win32-x64":   { "asset": "jellyfin-ffmpeg_7.1.3-5_portable_win64-clang-gpl.zip",      "strategy": "portable-zip",     "sha256": "..." }
    }
  }
}
```

`scripts/setup-ffmpeg` reads this, downloads the matching asset, verifies SHA256, and stages the binaries. **All five platforms use the portable strategy** — every bundle ships its own self-contained ffmpeg, no host install required.

- `portable-tarball` / `portable-zip` — extracts under `vendor/ffmpeg/<platform>/{ffmpeg,ffprobe}[.exe]` for dev use, and (with `--target=tauri-bundle`) also into `src-tauri/resources/ffmpeg/<platform>/` for `tauri build`.

## 2. Build-time staging

`scripts/setup-ffmpeg --target=tauri-bundle` is the one command that prepares the binaries for a release build. It is wired into `tauri.conf.json` as the `beforeBuildCommand` so a plain `bun run tauri:build` always runs it; the same command is also explicit in CI between checkout and `tauri-action`.

```
scripts/setup-ffmpeg --target=tauri-bundle
    │
    ▼
For the current build's target platform:
  - Read scripts/ffmpeg-manifest.json
  - Download the matching asset (or use cached vendor/ffmpeg/<platform>/ if hash matches)
  - Verify SHA256
  - Extract to vendor/ffmpeg/<platform>/
  - Copy vendor/ffmpeg/<platform>/{ffmpeg,ffprobe}[.exe] → src-tauri/resources/ffmpeg/<platform>/
    │
    ▼
Tauri bundles src-tauri/resources/** into the app payload via tauri.conf.json bundle.resources
```

The `--target=tauri-bundle` flag is what stages the per-platform `src-tauri/resources/ffmpeg/<platform>/` tree.

## 3. Where ffmpeg lives in the installed Tauri bundle

Tauri's `bundle.resources` glob in `tauri.conf.json` declares which files become part of the installed app's resource tree:

```jsonc
"bundle": {
  "resources": ["resources/ffmpeg/**/*"]
}
```

Only the platform matching the build target gets shipped — there is no multi-platform fat directory in any single installer. The macOS universal bundle is the exception; see §5.

| OS | Build target | Directory in installed app |
|---|---|---|
| macOS | `darwin-x64` / `darwin-arm64` | `<App>.app/Contents/Resources/_up_/resources/ffmpeg/<platform>/` |
| Linux (AppImage) | `linux-x64` | `usr/lib/xstream/resources/ffmpeg/linux-x64/` (squashfs payload) |
| Linux (`.deb`) | `linux-x64` | `/usr/lib/xstream/resources/ffmpeg/linux-x64/` |
| Windows | `win32-x64` | `<install dir>\resources\ffmpeg\win32-x64\` |

Tauri preserves the executable bit on macOS / Linux. The Rust server spawns these as subprocesses (`tokio::process::Command`) — there is no JIT-loaded native module path.

## 4. Runtime path resolution

`src-tauri/src/ffmpeg_path.rs` resolves the bundled binaries via Tauri's `AppHandle`:

```rust
pub fn resolve(app: &tauri::AppHandle) -> Result<FfmpegPaths, FfmpegPathError> {
    let resource_dir = app.path().resource_dir()?;
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let bin = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let probe = if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" };
    let ffmpeg = resource_dir.join("ffmpeg").join(&platform).join(bin);
    let ffprobe = resource_dir.join("ffmpeg").join(&platform).join(probe);
    if !ffmpeg.exists() || !ffprobe.exists() {
        return Err(FfmpegPathError::NotInstalled { ffmpeg, ffprobe });
    }
    let version = run_version(&ffmpeg).unwrap_or_else(|| "(unknown)".into());
    Ok(FfmpegPaths { ffmpeg, ffprobe, version_string: version })
}
```

The Tauri-context resolver does NOT check the version against the manifest — the bundle is the source of truth and any drift is impossible after a successful `tauri build`. The version is read once at startup for telemetry only.

In dev mode (running under `bun run tauri:dev` or a plain `cargo run -p xstream-server`), `server-rust/src/services/ffmpeg_path.rs` walks a different priority order:

1. `FFMPEG_PATH` + `FFPROBE_PATH` env vars — explicit override (CI uses this).
2. `vendor/ffmpeg/<platform>/{ffmpeg,ffprobe}[.exe]` — the staged contributor-local install.
3. Version validation — runs `ffmpeg -version`, parses the first line, compares to `manifest.versionString`. Mismatch → fatal exit with a pointer to `bun run setup-ffmpeg --force`.

The dev fatal-on-version-mismatch behaviour is a contributor ergonomics tool — it protects against forgetting `setup-ffmpeg --force` after a manifest bump. End users have no `setup-ffmpeg` to run; the only correct version is the one we shipped, and the Tauri-context resolver enforces that by reading from the bundle.

## 5. macOS universal binary

Tauri can produce a universal `.app` for macOS by lipo-merging the x64 and arm64 builds. **jellyfin-ffmpeg portable does not ship a universal-fat binary** — there's a separate `darwin-x64` tarball and a separate `darwin-arm64` tarball.

Two ways to handle this:

- **A. Ship both architectures in the universal bundle.** Both `darwin-x64/ffmpeg` and `darwin-arm64/ffmpeg` live in `Contents/Resources/.../ffmpeg/`; the runtime resolver picks the one matching `std::env::consts::ARCH` (`"x86_64"` or `"aarch64"`). Adds ~50 MB to the universal `.dmg`.
- **B. Ship arch-specific `.dmg`s.** Two macOS artefacts in the release: `xstream-1.0.0-arm64.dmg` and `xstream-1.0.0-x64.dmg`. Each contains only its own ffmpeg. Smaller per-file but doubles the macOS hosting cost.

**Recommendation: Option A** for v1. ~50 MB on a ~110 MB Tauri bundle is acceptable, and a single download URL is simpler for the support / docs surface. Re-evaluate if download size becomes the dominant complaint.

## 6. Build-time SHA256 verification

The verification stays — it just moves earlier in the pipeline.

`scripts/setup-ffmpeg --target=tauri-bundle` performs the SHA256 check before staging:

```
manifest.json says darwin-arm64 SHA256 = abc123...
   │
   ▼
download to /tmp/jellyfin-ffmpeg-...-tarball.tar.xz
   │
   ▼
sha256sum /tmp/...   →   abc123...?     ←  no  ─►  abort, error message
   │   yes
   ▼
extract to vendor/ffmpeg/darwin-arm64/
   │
   ▼
copy to src-tauri/resources/ffmpeg/darwin-arm64/
   │
   ▼
tauri build embeds resources/ffmpeg/<plat>/ into the bundle
```

A mismatched SHA256 fails the CI build before any installer is produced. The manifest stays the lockfile; bumping ffmpeg is one PR that updates `version`, asset names, and SHA256s, then runs `setup-ffmpeg --force` to verify locally.

## 7. ffmpeg upgrade flow

When we bump jellyfin-ffmpeg (e.g. 7.1.3-5 → 7.2.0-1):

1. **Manifest PR.** `scripts/ffmpeg-manifest.json` gets new version + asset names + SHA256s. Verify locally with `bun run setup-ffmpeg --force`.
2. **Encode-pipeline tests.** Run the test fixtures from [`docs/architecture/Testing/01-Encode-Pipeline-Tests.md`](../Testing/01-Encode-Pipeline-Tests.md) against the new binaries. The 4K-no-fallback assertion must still pass.
3. **Segment cache invalidation.** The new ffmpeg may produce subtly different segment outputs. The cache key is content-addressed `(video_id, resolution, start_s, end_s)`, so cross-version output drift is undetectable from the key alone — bump a `ffmpeg_manifest_version` value in `user_settings`; on startup, compare it to the bundled value and wipe `<app_cache_dir>/segments/` if mismatched. Re-encoded segments will be produced on next playback. (Acceptable cost for a per-version event; users see a one-time warm-up.)
4. **Release.** Tag → CI runs `setup-ffmpeg --target=tauri-bundle` → `tauri build` produces installers with new binaries → users get the new ffmpeg via auto-update on next check.

## 8. Licensing — what shipping ffmpeg means

`jellyfin-ffmpeg` is built with `--enable-gpl --enable-libx264` (and many other GPL components). **Distributing GPL binaries inside our Tauri bundle places the bundle under GPL** unless we treat ffmpeg as a separate program (linked at runtime via process boundary) and document the GPL'd artefact's source availability.

Concretely:

- Our app code (`client/dist`, `server-rust/`, `src-tauri/`) does **not** become GPL-licensed by association — `tokio::process::Command::new(ffmpeg_path)` is a process boundary, the same legal stance Jellyfin / Plex / Emby take.
- The bundled ffmpeg binary itself remains under GPL. Distribution requires:
  1. A copy of the GPL license shipped with the app (a `licenses/` directory in `bundle.resources`, or referenced from the About dialog).
  2. An offer of source code for the bundled binary — we link to the upstream `jellyfin/jellyfin-ffmpeg` GitHub release for the exact pinned version, satisfying the source-availability requirement.

A short "Open Source Notices" entry in the About dialog covers both.

## 9. Cross-references

- [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) §4 — the Tauri-bundling overview that this doc deepens.
- [`01-Packaging-Internals.md`](01-Packaging-Internals.md) — what `bundle.resources` actually does at build time, where `app.path().resource_dir()` resolves to per OS.
- [`docs/server/Hardware-Acceleration/00-Overview.md`](../../server/Hardware-Acceleration/00-Overview.md) — the encoder pipeline that depends on this binary's specific build.
