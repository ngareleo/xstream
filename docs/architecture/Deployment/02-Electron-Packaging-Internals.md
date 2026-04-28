# Electron Packaging Internals

> **Audience:** an architect who knows the streaming + Bun + ffmpeg surface but has never shipped a desktop app. The goal is to walk every layer from "source code" to "installed app" to "auto-update," in detail, and correct the common mental model along the way.

The user's working assumption was: *"each OS has an installer that has all the build dependencies, takes a specific version of source code, compiles it into an executable. The installer also handles updates by creating diffs of source code, so it's up to the source code to be backward compatible."*

This is the right intuition for a *native* app (C++ compiled per OS, deltas of compiled bytes). For an **Electron** app, two things are different:

- There is no per-machine compile. The build happens once on a CI runner per OS; what users download is a pre-compiled bundle. Installers contain the bundle, not a compiler.
- The "executable" is the **Electron runtime** (Chromium + Node.js + Electron's native glue). Your TypeScript / React / Bun code lives inside the bundle as data — the runtime loads it. So updates ship a new bundle of *data*, not a new compiled `.exe` from your source.

The rest of this doc walks each layer, from source on disk to a running app on a user's machine, with the actual mechanics named.

## 1. The end-to-end picture

```
Developer machine                  CI runner (per OS)              User's machine
─────────────────                  ──────────────────              ──────────────────
git push                                                           
                          ─────►   checkout                        
                                   bun install                     
                                   bun run build  ────► client/dist/   
                                                       server/dist/    
                                   bun run setup-ffmpeg ──► vendor/ffmpeg/<plat>/
                                   bun run compile-server ──► vendor/bun/<plat>/bun-server  
                                                                   
                                   electron-builder              
                                     │                            
                                     ├─► asar pack app code        
                                     │   ──► resources/app.asar    
                                     ├─► copy extraResources       
                                     │   ──► resources/{ffmpeg/, bun-server} 
                                     ├─► copy Electron runtime     
                                     │   ──► <Electron binary>     
                                     ├─► OS-specific package      
                                     │   ──► .dmg / .exe / .AppImage 
                                     ├─► code-sign + notarize    
                                     └─► publish manifest         
                                         (latest.yml, etc.)         
                                                                  
                                                ─────────► download installer
                                                           run installer
                                                           ──► installed app  
                                                                                
                                                           electron-updater   
                                                            checks manifest    
                                                            downloads delta   
                                                            verifies signature 
                                                            applies on quit    
```

Each box is a discrete artefact with a name. The rest of this doc walks them.

## 2. What "source code" looks like on disk

The xstream repo has three workspaces relevant to packaging:

```
xstream/
├── client/                    # React + Relay (Rsbuild output: client/dist/)
├── server/                    # Bun server (compile output: vendor/bun/<plat>/bun-server)
├── electron/                  # NEW — Electron main process glue
│   ├── main.ts                # window creation, sidecar spawn, IPC handlers
│   ├── preload.ts             # bridge exposed to the renderer (folder-picker IPC, etc.)
│   └── electron-builder.yml   # bundle config — see §6
├── scripts/
│   ├── ffmpeg-manifest.json   # pinned jellyfin-ffmpeg per OS (unchanged)
│   ├── setup-ffmpeg           # downloads + verifies portable ffmpeg into vendor/ffmpeg/<plat>/
│   └── compile-server         # NEW — runs `bun build --compile` per host platform
└── package.json               # root workspace — version field added here
```

`electron/main.ts` is the new entry point. It is plain TypeScript that imports from `electron`, creates a `BrowserWindow`, spawns the Bun sidecar via `child_process.spawn`, and wires up IPC handlers (folder picker, sidecar restart, etc.). At build time it gets transpiled to CommonJS and embedded in the asar archive.

## 3. The build pipeline — what `electron-builder` actually does

The build is one command per OS:

```sh
electron-builder --mac          # produces .dmg + .app + .zip
electron-builder --win          # produces .exe (NSIS) + .msi
electron-builder --linux        # produces .AppImage + .deb
```

Each invocation runs the same logical pipeline, with OS-specific artefact production at the end. The pipeline:

### 3.1 Dependency resolution + native rebuild

`electron-builder` reads `package.json` and figures out which `node_modules` directories need to ship. Pure-JS modules ship as-is. **Native modules (`.node` binaries)** require a per-OS rebuild — `electron-builder` runs `node-gyp rebuild` (or uses prebuilt binaries from `prebuild-install`) so the `.node` files in the bundle match the host OS the build is running on.

In our case there are no native node modules — the Bun sidecar handles everything that would otherwise need a `.node` (sqlite, ffmpeg). The Electron main process is pure TypeScript.

### 3.2 File collection

`electron-builder` reads the `files` glob from config. Default: anything in the project except `node_modules/{dev-deps}` and conventional excludes. Output: a flat list of files to ship.

### 3.3 ASAR archive creation

By default, `electron-builder` packs the collected files into a single **asar archive** at `resources/app.asar`. asar is Electron-specific:

- It's a *virtual filesystem* — Node and web APIs treat it as a directory tree, but the files are concatenated into one big archive with a header listing offsets.
- Benefits: faster `require()`, mitigates Windows long-path issues, and concealing source code (slightly — asar is trivially extractable).
- Limitations:
  - Native modules (`.node` files) **cannot execute from inside asar** — `process.dlopen` can't read from a virtual FS. They must be unpacked.
  - `child_process.execFile` and `fs.open` against asar paths trigger Electron to extract the file to a temp directory first. This is automatic but adds a one-time cost.

For us this matters because **the Bun sidecar binary cannot live inside asar**. We use `extraResources` (next section) to ship it outside the asar archive. Same for ffmpeg.

The `asar: true` default is fine for the React client bundle and the Electron main process JS — they're all Node-readable.

### 3.4 `extraResources` vs `extraFiles`

These are the two escape hatches for files that need to land somewhere specific in the installed app:

- **`extraResources`** copies into the *resources* directory:
  - macOS: `<App>.app/Contents/Resources/`
  - Linux + Windows: `resources/` next to the Electron binary.
  - Runtime path: `process.resourcesPath`.
- **`extraFiles`** copies into the *content* directory (one level up):
  - macOS: `<App>.app/Contents/`
  - Linux + Windows: the app root directory.

Both bypass asar. We use `extraResources` for everything that isn't the Electron runtime itself — Bun sidecar, ffmpeg, the `client/dist/` static assets.

### 3.5 Electron runtime injection

`electron-builder` downloads (and caches) the Electron binary for the target platform. Versions match the `electron` devDependency in `package.json`. The download is ~80–100 MB per OS — Chromium + V8 + Node.js + Electron's native glue, all in one binary.

This binary is what the user clicks on to launch the app. It does *not* contain your code — it's the runtime that reads your asar archive at startup.

### 3.6 OS-specific packaging

The collected files (Electron runtime + `app.asar` + `extraResources`) are then wrapped into an OS-specific installer:

- **macOS.** Wrapped into a `<App>.app` bundle (a directory with a specific structure that macOS treats as an executable). The `.app` is then put inside a `.dmg` (a disk image) for distribution.
- **Windows.** Wrapped into a self-extracting `.exe` (NSIS — Nullsoft Scriptable Install System) and / or `.msi` (Microsoft Installer). Both are container formats; their contents are nearly identical to the Linux unpacked layout.
- **Linux.** Multiple options; we default to `.AppImage` (a self-contained executable that mounts itself at runtime) and `.deb` (Debian package, extracts to `/opt/<app>/`).

### 3.7 Code signing

The OS installers go through code-signing with platform-native tools:

- macOS: `electron-builder` invokes `codesign` against the `.app`, then the `.dmg`. With `notarize: true`, it also runs `xcrun notarytool` to send the signed app to Apple, wait for notarization, and staple the ticket.
- Windows: `signtool sign` against the `.exe` and `.msi`, with timestamping (`/tr <url>`) so signatures don't expire when the cert does.
- Linux: no platform signing for installers themselves. Update payloads get signed separately (see §8).

### 3.8 Manifest publication

After the installers are built, `electron-builder --publish always` writes update manifests:

- `latest.yml` — Windows + generic
- `latest-mac.yml` — macOS
- `latest-linux.yml` — Linux AppImage

Each manifest contains: version, file URLs, file SHA512 hashes, file sizes, release date. `electron-updater` on user machines fetches one of these to decide whether an update is available.

## 4. What the user actually downloads

Per-OS, the user clicks one file:

| OS      | File                            | Size (xstream estimate) | What's inside                                                                 |
|---------|---------------------------------|-------------------------|-------------------------------------------------------------------------------|
| macOS   | `xstream-1.0.0-arm64.dmg`       | ~250 MB                 | Disk image containing `xstream.app` (the Electron runtime + asar + resources) |
| Windows | `xstream-Setup-1.0.0.exe`       | ~220 MB                 | NSIS installer that extracts the app folder to `%LOCALAPPDATA%\Programs\`     |
| Linux   | `xstream-1.0.0.AppImage`        | ~200 MB                 | Self-mounting executable; runs without install                                |
| Linux   | `xstream_1.0.0_amd64.deb`       | ~200 MB                 | Debian package; extracts to `/opt/xstream/`                                   |

Sizes assume Bun runtime ~100 MB (compiled), jellyfin-ffmpeg ~50 MB, Chromium ~80 MB, our app code ~10 MB.

## 5. What's inside the installed app

After install, the user's machine has a directory structure like this:

### macOS (`/Applications/xstream.app/`)

```
xstream.app/
└── Contents/
    ├── Info.plist                         # bundle metadata (version, identifier, entitlements ref)
    ├── MacOS/
    │   └── xstream                        # the Electron runtime binary (~80 MB)
    ├── Frameworks/
    │   ├── Electron Framework.framework/  # Chromium + Node + V8
    │   ├── ...                            # helpers for renderer / GPU / etc.
    └── Resources/
        ├── app.asar                       # ~10 MB — your client/dist + electron/main.ts
        ├── app.asar.unpacked/             # files excluded from asar (none here today)
        ├── ffmpeg/
        │   └── darwin-arm64/
        │       ├── ffmpeg                 # jellyfin-ffmpeg portable binary (~50 MB)
        │       └── ffprobe
        ├── bun-server                     # bun build --compile output (~110 MB)
        ├── client-dist/                   # Rsbuild static output (HTML/CSS/JS)
        └── icon.icns
```

### Windows (`%LOCALAPPDATA%\Programs\xstream\`)

```
xstream\
├── xstream.exe                            # the Electron runtime binary
├── chrome_100_percent.pak
├── chrome_200_percent.pak
├── ...                                    # Electron framework dlls + paks
├── resources\
│   ├── app.asar                           # your code
│   ├── ffmpeg\
│   │   └── win32-x64\
│   │       ├── ffmpeg.exe
│   │       └── ffprobe.exe
│   ├── bun-server.exe
│   └── client-dist\
└── locales\
```

### Linux (`/opt/xstream/`)

Similar to Windows: `xstream` binary at the root, `resources/` alongside, `chrome_*.pak` files. AppImage extracts to a temp directory at runtime; layout is identical to a `.deb` install.

## 6. Runtime — what happens when the user clicks the icon

1. **OS launches the Electron runtime binary.** macOS reads `Info.plist` and locates `Contents/MacOS/xstream`. Windows runs the `.exe` directly. Linux executes the AppImage's mount stub.
2. **Electron runtime initialises.** Chromium boots, Node.js boots, V8 starts.
3. **`app.asar` is mounted as a virtual FS.** `require('./main.js')` from the asar header points the runtime at `electron/main.ts`'s compiled output.
4. **Main process runs `electron/main.ts`.** It:
   - Resolves `process.resourcesPath` to find `bun-server`, `ffmpeg/`, and `client-dist/`.
   - Spawns the Bun sidecar via `child_process.spawn(bunServerPath)` with env vars set (`DB_PATH`, `SEGMENT_DIR`, `FFMPEG_DIR`, `XSTREAM_INTERIM_SHELL=1`, `HW_ACCEL=auto`).
   - Waits for the sidecar to log `Server listening` on stdout (or polls `http://127.0.0.1:<port>/graphql` with a few retries).
   - Creates a `BrowserWindow` and calls `loadURL('http://127.0.0.1:<port>/')`.
5. **Renderer loads the React client.** The Bun server's static handler serves `client-dist/index.html`, then the JS/CSS bundles, then the React app boots. From the renderer's perspective, this is a regular browser session — `window.location.host` is `127.0.0.1:<port>`, GraphQL goes to `/graphql`, streaming to `/stream/:jobId`.

Two processes are running: the Electron main (which spawned everything) and the Bun sidecar. plus Electron's own renderer + GPU helper processes for Chromium. So a `ps` shows ~5 processes for one xstream instance.

### What's different from "the source code is compiled into an executable"

- The Electron runtime *is* the executable. Your code is data inside `app.asar` and `resources/`.
- The Bun sidecar binary `bun-server` *is* "compiled" in a sense — `bun build --compile` packages the Bun runtime + your server bundle into a single static binary. But this happens once on CI, not on each user's machine.
- The renderer's React code is plain JavaScript inside `app.asar`. Chromium reads it at runtime. No "compile" step on the user's machine.

## 7. Auto-update — how `electron-updater` actually works

The user's intuition was: *"the same software that installs on machines also handles updates by creating diffs of source code."* This is **half right**. The diff happens, but it's a diff of the *built bundle*, not the source.

### 7.1 Update detection

The Electron main process imports `electron-updater` and calls `autoUpdater.checkForUpdatesAndNotify()`. This:

1. Fetches the manifest at `<provider>/latest.yml` (or per-OS variant).
2. Compares `manifest.version` to the running app's `package.json` version.
3. If newer, fetches the **update payload** referenced in the manifest.

`<provider>` is configured in `electron-builder.yml` `publish`. We use either `generic` (a static origin we control — Cloudflare R2 / GH Pages) or `github` (the GH Releases page directly).

### 7.2 Update payload format — per OS

This is where the "diff vs full bundle" distinction lives:

- **macOS — Squirrel.Mac, full `.zip` replacement.** No deltas. The full `.app` bundle is downloaded (~250 MB) and replaces the installed one atomically. Mostly a trade-off: macOS's filesystem semantics make in-place patching hard, and Apple's signing chain wants atomicity. The `.zip` is decently compressed but no smaller than the original `.app`.
- **Windows — NSIS-web with bsdiff.** Two artefacts published: the full `.exe` installer and a `.7z` block-aligned archive of the app contents. `electron-updater` runs `bsdiff` between the *installed* `.7z` and the *target* `.7z` and downloads only the diff (~10–50 MB for our installer, depending on whether Chromium + Bun changed). The `.7z` is repacked client-side.
- **Linux AppImage — zsync.** Block-level diff against the *installed* AppImage file. `electron-updater` reads `latest-linux.yml`'s `.zsync` URL, fetches the block hashes, and downloads only the changed blocks (~5–30 MB). The new AppImage is reassembled in-place.
- **Linux `.deb` — no auto-update.** `electron-updater` doesn't manage `.deb` updates because the package manager owns that. Users install `.deb` once and follow distro update mechanisms.

### 7.3 What the diffs are *of*

bsdiff and zsync work on **bytes of the built bundle**, not source code. The bundle is the same one `electron-builder` produced on CI:

- Most of the bundle is Chromium (~80 MB) + Electron framework (~10 MB) + Node modules. These rarely change between two versions of *our* app, so the diff is very small for those bytes.
- Bun runtime (~100 MB embedded in `bun-server`) — also rarely changes.
- jellyfin-ffmpeg (~50 MB) — changes only when we bump the manifest pin.
- Our app code in `app.asar` (~10 MB) — this is what changes most often.

So a typical patch is dominated by changes to `app.asar` plus whatever else moved. bsdiff is good at this — it sees "these huge regions are identical" and emits a tiny patch.

### 7.4 Backward compatibility — where it actually lives

The user's framing was: *"it's up to the source code to be backward compatible and produce a backward-compatible exec that will handle change."*

This **is** true — but the surface area is smaller than it looks:

- **The bundle layout is fully replaceable.** The `electron-updater` flow swaps the entire installed bundle (or the bsdiff-patched bundle) atomically. There is no "old bundle + new code" mixed state. So the `electron/main.ts`, the asar, and `extraResources` together form one version-locked unit. No backward compat across versions for that surface.
- **What needs backward compat is *external state*** that survives an update:
  - The SQLite DB schema (`docs/server/DB-Schema/00-Tables.md`). New version's `migrate.ts` must safely apply on top of an old version's schema. This is the same constraint as a normal long-running server.
  - The segment cache on disk (`<app_cache_dir>/xstream/segments/`). New ffmpeg version may produce different segment shapes. We invalidate the cache on ffmpeg manifest bumps — store the manifest version in `user_settings`, compare on startup, wipe + re-encode if mismatched.
  - User preferences in `user_settings`. Treat the table as schema-versioned key-value.
- **Config and code do *not* need cross-version compat.** A v1.2.3 user gets exactly v1.2.3's `main.ts` + asar + sidecar, all together. The next update gives them exactly v1.2.4's. No inter-version mix.

### 7.5 Signature verification at update time

The user's machine will reject an update payload it can't verify:

- **macOS.** The downloaded `.zip` contains a signed `.app`. `electron-updater` runs `codesign --verify` against the embedded `.app` and checks that its signing identity matches the running app's. A mismatched cert (e.g. attacker-signed payload) fails verification and aborts.
- **Windows.** The `.exe` payload is signed with our Authenticode cert. `electron-updater` checks the cert chain and the identity matches; mismatch aborts.
- **Linux AppImage.** The `latest-linux.yml` manifest is signed with `electron-builder`'s own per-app key (generated at first build). The installed AppImage embeds the public key; updates verify against it.

This means a compromised cert is the worst-case. Rotating requires shipping a non-update reinstall — see [`01-Decisions.md`](01-Decisions.md) §"Update signing".

### 7.6 When the update is applied

`electron-updater` does **not** apply the update immediately:

- The download happens in the background; the user keeps using the running version.
- On `app.quit()` (or a manual call to `autoUpdater.quitAndInstall()`), the old binaries get replaced and the new version starts.
- If a download fails, no state is corrupted — the old version keeps running and the next 24h check retries.
- There is no rollback. If the new version is broken, the user installs an older release manually.

## 8. Where the user's mental model needs adjusting

| User's intuition | Reality |
|---|---|
| The installer has all the build dependencies. | The installer has the *built bundle*. The build deps live on CI. |
| The installer compiles source into an executable. | There's no compile on the user's machine. The Electron runtime is the executable; your code is data it reads. |
| Updates are diffs of source code. | Updates are byte-level diffs (bsdiff / zsync) of the *built bundle*. The bundle includes our app code, Chromium, Bun, ffmpeg — all together. |
| Source code must be backward-compatible across updates. | The *bundle* is fully replaceable. What needs backward compat is *external state* the bundle interacts with — DB schema, segment cache layout, user-settings keys. |
| One executable per OS. | A bundle per OS. The "executable" is the Electron runtime, which is identical between two versions of *our* app at the same Electron version — what changes is the data it loads. |

## 9. Cross-references

- [`00-Interim-Desktop-Shell.md`](00-Interim-Desktop-Shell.md) — the index doc that picks Electron and lists invariants.
- [`01-Decisions.md`](01-Decisions.md) — Bun packaging strategy (`bun build --compile`), update signing keys, channel rollout.
- [`03-Shipping-FFmpeg.md`](03-Shipping-FFmpeg.md) — the manifest, portable binaries, runtime path resolution.
- [`08-Tauri-Packaging.md`](../../migrations/rust-rewrite/08-Tauri-Packaging.md) — the Rust + Tauri packaging spec; many of the same patterns reappear there with a different shell.
