# Deployment

How xstream ships to end users — Tauri desktop bundles for Linux, Windows, and macOS, with bundled jellyfin-ffmpeg, code-signing per OS, and self-hosted Ed25519-signed auto-updates.

The Rust server runs **in-process** inside the Tauri shell on a free `127.0.0.1` loopback port — there is no sidecar process and no separate runtime. Read [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) first; it is the prescriptive spec for the bundle. Then read [`01-Packaging-Internals.md`](01-Packaging-Internals.md) for the underlying mechanics, and [`02-Shipping-FFmpeg.md`](02-Shipping-FFmpeg.md) for how `jellyfin-ffmpeg` ends up in the bundle and on disk after install.

| File | Hook |
|---|---|
| [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md) | Prescriptive spec: `tauri.conf.json` shape, the in-process server, bundled ffmpeg, VAAPI Linux soft fallback, Ed25519-signed self-hosted updates, code-signing per OS, the GitHub Actions release matrix, and the open release-engineering questions. |
| [`01-Packaging-Internals.md`](01-Packaging-Internals.md) | Internals walkthrough: source on disk → `cargo` + `tauri build` → OS-specific installer → installed app layout per OS → `tauri-plugin-updater` mechanics. Corrects the Electron-derived intuition that desktop apps ship a bundled browser engine and run their server logic in a sidecar. |
| [`02-Shipping-FFmpeg.md`](02-Shipping-FFmpeg.md) | How `jellyfin-ffmpeg` gets bundled — manifest pinning, the portable strategy used for every OS, where binaries live in the Tauri resource tree (`resources/ffmpeg/<plat>/`), how `src-tauri/src/ffmpeg_path.rs` resolves them at runtime, build-time SHA256 verification, segment-cache invalidation on manifest bumps, and GPL compliance. |

## What's still open

These were marked open at the time the spec landed and are not yet resolved — they are tracked here so the deployment story doesn't lose them when the migration playbook is retired.

1. **Universal macOS binary vs. per-arch.** Tauri can produce a single universal binary (`--target universal-apple-darwin`) or two arch-specific ones. Universal is simpler to host but doubles the download size. Defer until update-payload size matters.
2. **Linux `.deb` apt repository.** Shipping a `.deb` is easy; hosting an apt repo with a key signature is more involved. v1 ships the `.deb` as a one-shot download; defer apt repo until users ask.
3. **Auto-update scheduling under heavy use.** Today the updater checks every 24 h regardless of user activity. Pause checks while a stream is active to avoid replacing the binary mid-playback? Likely yes; defer to UX.
4. **Code-signing identity rotation.** When the macOS Developer ID cert expires (yearly) we re-sign all current artefacts. Document the runbook before the first cert rotates.
5. **Tauri auto-updater on Linux `.deb`.** Not supported by the plugin. Users on `.deb` follow distro updates manually — set in-app expectations.
6. **Crash reporting.** Tauri does not bundle a crash reporter. Sentry has a `sentry-tauri` integration; needs a decision before v1 ships. Without it, OS-level reports are the only signal.
7. **Bundle size.** jellyfin-ffmpeg portable builds are ~50 MB compressed per platform. The bundled AppImage is therefore ~70–80 MB. Acceptable for v1; defer optimisation.
