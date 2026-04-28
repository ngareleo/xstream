# Shipping FFmpeg

How `jellyfin-ffmpeg` gets bundled into the Electron app per OS, where it lives at install time, how the running Bun sidecar locates it, and how SHA256 verification moves from a runtime concern to a build-time invariant.

## 1. Current state — the manifest

`scripts/ffmpeg-manifest.json` is the lockfile for our native binary deps. It pins one version of `jellyfin-ffmpeg` per platform with SHA256 hashes:

```jsonc
{
  "ffmpeg": {
    "distribution": "jellyfin-ffmpeg",
    "version": "7.1.3-5",
    "versionString": "7.1.3-Jellyfin",
    "releaseUrl": "https://github.com/jellyfin/jellyfin-ffmpeg/releases/download/v7.1.3-5",
    "platforms": {
      "linux-x64":   { "asset": "jellyfin-ffmpeg7_7.1.3-5-noble_amd64.deb",          "strategy": "deb-install",      "sha256": "..." },
      "linux-arm64": { "asset": "jellyfin-ffmpeg7_7.1.3-5-noble_arm64.deb",          "strategy": "deb-install",      "sha256": "..." },
      "darwin-x64":  { "asset": "jellyfin-ffmpeg_7.1.3-5_portable_mac64-gpl.tar.xz", "strategy": "portable-tarball", "sha256": "..." },
      "darwin-arm64":{ "asset": "jellyfin-ffmpeg_7.1.3-5_portable_macarm64-gpl.tar.xz","strategy": "portable-tarball","sha256": "..." },
      "win32-x64":   { "asset": "jellyfin-ffmpeg_7.1.3-5_portable_win64-clang-gpl.zip","strategy": "portable-zip",   "sha256": "..." }
    }
  }
}
```

`scripts/setup-ffmpeg` reads this, downloads the matching asset, verifies SHA256, and stages the binaries based on `strategy`:

- `deb-install` — runs `dpkg -i` and the binaries land at `/usr/lib/jellyfin-ffmpeg/{ffmpeg,ffprobe}`. The host-installed approach.
- `portable-tarball` / `portable-zip` — extracts under `vendor/ffmpeg/<platform>/{ffmpeg,ffprobe}[.exe]`. Self-contained, no host install.

At runtime, `server/src/services/ffmpegPath.ts` (the memoised `setFfmpegPath` resolver) walks a priority order:

1. `FFMPEG_PATH` + `FFPROBE_PATH` env vars — dev override.
2. Manifest-prescribed location (Linux `/usr/lib/jellyfin-ffmpeg/`, mac/win `vendor/ffmpeg/<platform>/`).
3. Version validation — runs `ffmpeg -version`, parses the first line, compares to `manifest.versionString`. Mismatch → fatal exit with a pointer to `bun run setup-ffmpeg --force`.

This works in dev because every contributor runs `setup-ffmpeg` once and the binaries land in known places. **It breaks for end users** because:

- `deb-install` assumes `apt` and `/usr/lib/` write access — not present on `.AppImage` users, not present on macOS, not present on Windows.
- The runtime version check is a developer ergonomics tool — fatal-on-version-mismatch protects against forgetting `setup-ffmpeg --force` after a manifest bump. End users have no `setup-ffmpeg` to run; the only correct version is the one we shipped.

## 2. The strategy change — portable for every OS

Under Electron, **all five platforms switch to the portable strategy**. No `deb-install` for end users; the bundled `.AppImage` and `.deb` ship the portable ffmpeg under the app's resources directory, identically to mac and win.

The `ffmpeg-manifest.json` file gains a portable-strategy variant for the two Linux platforms. The manifest stays single-source-of-truth — the new entries cover what we ship in the bundle:

```jsonc
"linux-x64": {
  "asset": "jellyfin-ffmpeg_7.1.3-5_portable_linux64-gpl.tar.xz",
  "strategy": "portable-tarball",
  "sha256": "..."
},
"linux-arm64": {
  "asset": "jellyfin-ffmpeg_7.1.3-5_portable_linuxarm64-gpl.tar.xz",
  "strategy": "portable-tarball",
  "sha256": "..."
},
```

The original `deb-install` entries can stay (dev-only path for contributors who want host-installed ffmpeg) or be removed (one less code path). **Recommendation:** keep `deb-install` as a manifest variant gated by an env var for contributors, but **CI release builds always use portable**. This keeps the dev-only convenience without contaminating the bundle.

`scripts/setup-ffmpeg` learns a `--target=electron-bundle` flag (mirroring the migration spec's `--target=tauri-bundle` from [`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md) §4):

```sh
bun run setup-ffmpeg --target=electron-bundle
```

This downloads the portable asset, verifies SHA256, and stages it at `vendor/ffmpeg/<platform>/` exactly as the existing portable path does. The CI release workflow runs this between `bun run build` and `electron-builder`.

## 3. Where ffmpeg lives in the Electron bundle

`electron-builder.yml`:

```yaml
extraResources:
  - from: "vendor/ffmpeg/${os}-${arch}/"
    to: "ffmpeg/${os}-${arch}/"
    filter: ["ffmpeg*", "ffprobe*"]
```

The `${os}-${arch}` template expands at build time per matrix runner:

| Runner OS | Build target | Directory in installed app |
|---|---|---|
| `macos-13` | `darwin-x64` | `Contents/Resources/ffmpeg/darwin-x64/` |
| `macos-14` | `darwin-arm64` | `Contents/Resources/ffmpeg/darwin-arm64/` |
| `ubuntu-latest` | `linux-x64` | `resources/ffmpeg/linux-x64/` |
| `windows-latest` | `win32-x64` | `resources\ffmpeg\win32-x64\` |

Each per-OS bundle contains **only the ffmpeg matching that OS** — we do not ship a multi-arch directory in any single installer. The macOS universal bundle is the exception; see §5.

`electron-builder` does not asar-pack `extraResources`. The binaries land on disk as plain files, executable bit preserved on macOS / Linux. `child_process.spawn(ffmpegPath)` from the Bun sidecar runs them directly.

## 4. Runtime path resolution under Electron

The Electron main process passes the resources directory to the Bun sidecar via env var:

```ts
// electron/main.ts
import { app } from "electron";
import path from "node:path";

const ffmpegDir = path.join(
  process.resourcesPath,
  "ffmpeg",
  `${process.platform}-${process.arch}`,
);

const sidecar = spawn(bunServerPath, [], {
  env: {
    ...process.env,
    FFMPEG_DIR: ffmpegDir,
    XSTREAM_INTERIM_SHELL: "1",
    // ...DB_PATH, SEGMENT_DIR, HW_ACCEL, etc.
  },
});
```

`services/ffmpegPath.ts` learns a new branch at the top of its priority order:

```ts
// services/ffmpegPath.ts (priority order, after env var dev override)
function resolveBundledPath(): FfmpegPaths | undefined {
  const dir = process.env.FFMPEG_DIR;
  if (!dir) return undefined;
  const binName = (base: string) => process.platform === "win32" ? `${base}.exe` : base;
  return {
    ffmpeg: join(dir, binName("ffmpeg")),
    ffprobe: join(dir, binName("ffprobe")),
  };
}
```

When `FFMPEG_DIR` is set (Electron production), the resolver short-circuits the manifest-based lookup and skips the runtime version check. **The bundle is the source of truth at this point** — any drift would be impossible after a successful `electron-builder` (the SHA256 was checked at build time and the file system is read-only on macOS / Windows app installs).

The runtime resolver is shaped exactly like the migration spec's Tauri version ([`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md) §4 "Runtime resolution"):

> The Tauri-context resolver does NOT check the version against the manifest — the bundle is the source of truth and any drift is impossible after a successful `tauri build`. The version is read for telemetry only.

The same logic applies under Electron. The version *is* still read and emitted as a startup log attribute (`hwaccel_detected` / `ffmpeg_version`) for telemetry, but never compared.

## 5. macOS universal binary

`electron-builder` produces a universal `.app` for macOS by lipo-merging the x64 and arm64 builds. **jellyfin-ffmpeg portable does not ship a universal-fat binary** — there's a separate `darwin-x64` tarball and a separate `darwin-arm64` tarball.

Two ways to handle this:

- **A. Ship both architectures in the universal bundle.** Both `darwin-x64/ffmpeg` and `darwin-arm64/ffmpeg` live in `Contents/Resources/ffmpeg/`; the runtime resolver picks the one matching `process.arch` ("x64" or "arm64"). Adds ~50 MB to the universal `.dmg`.
- **B. Ship arch-specific `.dmg`s.** Two macOS artefacts in the release: `xstream-1.0.0-arm64.dmg` and `xstream-1.0.0-x64.dmg`. Each contains only its own ffmpeg. Smaller per-file but doubles the macOS hosting cost.

**Recommendation: Option A** for the interim. ~50 MB on a ~250 MB bundle is acceptable, and a single download URL is simpler for the support / docs surface. Re-evaluate at the Rust port; `08-Tauri-Packaging.md` §10 lists the same trade-off as deferred there.

## 6. Build-time SHA256 verification

The verification stays — it just moves earlier in the pipeline.

`scripts/setup-ffmpeg --target=electron-bundle` performs the SHA256 check before staging:

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
(electron-builder copies to bundle/Contents/Resources/ffmpeg/darwin-arm64/)
```

A mismatched SHA256 fails the CI build before any installer is produced. The manifest stays the lockfile; bumping ffmpeg is one PR that updates `version`, asset names, and SHA256s, then runs `setup-ffmpeg --force` to verify locally.

The runtime version check is removed from the bundle path — but **kept in the dev path**, gated on `FFMPEG_DIR` not being set. Contributors who run `bun run setup-ffmpeg` get the same fatal-on-mismatch behavior they have today.

## 7. ffmpeg upgrade flow

When we bump jellyfin-ffmpeg (e.g. 7.1.3-5 → 7.2.0-1):

1. **Manifest PR.** `scripts/ffmpeg-manifest.json` gets new version + asset names + SHA256s. Verify locally with `bun run setup-ffmpeg --force`.
2. **Encode-pipeline tests.** Run the test fixtures from [`01-Encode-Pipeline-Tests.md`](../Testing/01-Encode-Pipeline-Tests.md) against the new binaries. The 4K-no-fallback assertion must still pass.
3. **Segment cache invalidation.** The new ffmpeg may produce subtly different segment outputs. Bump a `ffmpeg_manifest_version` key in `user_settings`; on startup, compare it to the bundled value, and wipe `<app_cache_dir>/xstream/segments/` if mismatched. Re-encoded segments will be produced on next playback. (Acceptable cost for a per-version event; users see a one-time warm-up.)
4. **Release.** Tag → CI runs `setup-ffmpeg --target=electron-bundle` → `electron-builder` produces installers with new binaries → users get the new ffmpeg via auto-update on next check.

This is identical to the manifest-bump flow today, plus one extra step (the cache invalidation).

## 8. Licensing — what shipping ffmpeg means

`jellyfin-ffmpeg` is built with `--enable-gpl --enable-libx264` (and many other GPL components). **Distributing GPL binaries inside our Electron bundle places the bundle under GPL** unless we treat ffmpeg as a separate program (linked at runtime via process boundary) and document the GPL'd artefact's source availability.

Concretely:

- Our app code (`client/dist`, `electron/main.ts`, the Bun server) does **not** become GPL-licensed by association — `child_process.spawn(ffmpeg)` is a process boundary, the same legal stance Jellyfin / Plex / Emby take.
- The bundled ffmpeg binary itself remains under GPL. Distribution requires:
  1. A copy of the GPL license shipped with the app (a `licenses/` directory in `extraResources` or referenced from the About dialog).
  2. An offer of source code for the bundled binary — we link to the upstream `jellyfin/jellyfin-ffmpeg` GitHub release for the exact pinned version, satisfying the source-availability requirement.

A short "Open Source Notices" entry in the About dialog covers both. This applies equally to the Tauri rewrite — see [`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md) (item not yet covered there; future addition).

## 9. Summary

| Concern | Today (dev) | Under Electron (interim production) |
|---|---|---|
| Manifest | `scripts/ffmpeg-manifest.json` | unchanged |
| Linux strategy | `deb-install` to `/usr/lib/jellyfin-ffmpeg/` | `portable-tarball` to `vendor/ffmpeg/linux-<arch>/` (CI release builds) |
| mac/win strategy | `portable-tarball` / `portable-zip` to `vendor/ffmpeg/<plat>/` | unchanged |
| Bundle location | n/a | `Contents/Resources/ffmpeg/<plat>/` (mac), `resources/ffmpeg/<plat>/` (win/linux) |
| Runtime resolver | manifest path + version check | `FFMPEG_DIR` env → bundle path; no version check |
| SHA256 verification | runtime in `setup-ffmpeg`, then again at startup version-check | build-time only (in `setup-ffmpeg --target=electron-bundle`) |
| Cache invalidation on bump | n/a | bump `ffmpeg_manifest_version` in `user_settings`; wipe segments on mismatch |
| License compliance | n/a | ship GPL notice + upstream source link in About dialog |

## 10. Cross-references

- [`00-Interim-Desktop-Shell.md`](00-Interim-Desktop-Shell.md) — index doc, Electron decision, architectural surface.
- [`01-Decisions.md`](01-Decisions.md) — Bun packaging strategy and the rest of the resolved open questions.
- [`02-Electron-Packaging-Internals.md`](02-Electron-Packaging-Internals.md) — what `extraResources` actually does, where `process.resourcesPath` resolves to, the runtime layout per OS.
- [`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md) §4 — the Tauri-version of this doc, which the Electron version consciously mirrors.
- [`docs/server/Hardware-Acceleration/00-Overview.md`](../../server/Hardware-Acceleration/00-Overview.md) — the encoder pipeline that depends on this binary's specific build.
- [`docs/server/Hardware-Acceleration/02-Fluent-FFmpeg-Quirks.md`](../../server/Hardware-Acceleration/02-Fluent-FFmpeg-Quirks.md) — the `setFfmpegPath`-once invariant the resolver upholds.
