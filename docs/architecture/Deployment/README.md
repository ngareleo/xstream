# Deployment

How xstream gets packaged and delivered to end users — desktop shells, code signing, auto-update, and CI release pipelines.

This concept folder is **interim-focused**. The terminal-form deployment story for xstream is the Rust + Tauri rewrite ([`docs/migrations/rust-rewrite/`](../../migrations/rust-rewrite/), packaging in [`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md)). The docs here cover the **stop-gap question** of how to ship the current Bun-server + React-client architecture as a desktop app *before* the Rust port lands, so the product can be released and iterated on without rushing the rewrite.

The decision has landed: **Electron + Bun-as-sidecar.** Read [`00-Interim-Desktop-Shell.md`](00-Interim-Desktop-Shell.md) first — it states the choice and lists the architectural surface a shell must accept. The other three docs deepen specific decisions and mechanics.

| File | Hook |
|---|---|
| [`00-Interim-Desktop-Shell.md`](00-Interim-Desktop-Shell.md) | Decision: Electron + Bun-as-sidecar. Why this beats Tauri-with-Bun-sidecar and Electrobun for *interim*. The architectural surface a shell must accept; distribution, updates, CI shape; invariants every interim shell must preserve. Index doc — points at the three deep dives. |
| [`01-Decisions.md`](01-Decisions.md) | Open questions resolved: hardware-acceleration decision (background, options, recommendation — VideoToolbox on macOS, software ceiling on Windows, soft fallback on Linux), Bun packaging via `bun build --compile`, library-picker UX (first-run + Settings → Electron folder picker → `createLibrary` mutation), static-asset serving, update-signing keys, channel rollout. |
| [`02-Electron-Packaging-Internals.md`](02-Electron-Packaging-Internals.md) | Deep dive on how Electron produces cross-platform apps. Walks every layer from source on disk to a running app on a user's machine — `electron-builder` pipeline, asar archive, `extraResources`, what's inside the installed bundle per OS, how `electron-updater` actually applies updates (Squirrel.Mac / NSIS-web bsdiff / AppImage zsync), and the corrections to a common mental model. |
| [`03-Shipping-FFmpeg.md`](03-Shipping-FFmpeg.md) | How `jellyfin-ffmpeg` ships under Electron — manifest pinning, the switch from `deb-install` to portable for every OS, where binaries live in the bundle (`extraResources` → `resources/ffmpeg/<plat>/`), runtime path resolution via `FFMPEG_DIR` env, build-time SHA256 verification, segment-cache invalidation on manifest bumps, GPL compliance. |
