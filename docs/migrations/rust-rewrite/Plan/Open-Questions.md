# Pre-Release Open Questions

This is the **decisions register** for the Rust + Tauri migration. The four step docs in this folder ([`00-README.md`](00-README.md) → [`04-Release.md`](04-Release.md)) each end with a "Decisions to lock before starting" list. The architect's pre-implementation review surfaced more — concrete unknowns about hardware acceleration on mac/Windows, code-signing infrastructure, universal-binary mechanics, CI partial-failure handling, and cross-platform quirks the Bun prototype hasn't been pressure-tested against.

Rather than scatter these across the playbook, they live here as one register. Each entry is short — what we know, candidate paths, the cheapest test that resolves it, and a conservative recommendation. **The decision stays with the user**; this doc surfaces the question, it does not answer it.

## How to use this register

- **Implementing agent:** before starting a step, read the sections that block your step (each section names the latest step that can still defer it). If a question is unresolved, raise it with the user before beginning the affected work.
- **User:** when you decide an entry, edit the **Recommendation** subsection to record the chosen path + reason, then move the entry to the [Resolved](#resolved) section at the bottom. The historical entry stays as the audit trail.
- **Don't expand entries with raw resolution work.** If validating a question takes a meaningful investigation (a benchmark, a probe-script, a vendor email thread), open a sibling doc and link it from the entry. This register is the index, not the workspace.

## Reading legend

- **`[decide]`** — answerable now without more information. The work is choosing between known paths.
- **`[investigate]`** — answer requires validation against running code, vendor docs, or hardware we don't yet have on hand.
- **`[defer]`** — a real decision but a later step blocks it; tracked here for visibility so it doesn't get forgotten.

---

## 1. Hardware-acceleration coverage

The VAAPI / Linux path is the only HW backend implemented today (per [`../../../server/Hardware-Acceleration/00-Overview.md`](../../../server/Hardware-Acceleration/00-Overview.md)). The migration docs specify the tagged-union shape (`HwAccelConfig`) and the three-tier cascade, but the per-OS argv specifics for macOS and Windows are open. For 4K on Apple Silicon, software libx264 is a first-class UX regression — these are not "nice to have" for a 3-OS release.

### 1.1 VideoToolbox ffmpeg argv shape on macOS  `[investigate]`

**Why it matters.** Without a working VideoToolbox path, every macOS user falls back to libx264 software encode. On a 4K source on an M-series Mac, that's a CPU-pinning regression that makes the app unusable for the primary content tier.

**What we know.** No concrete argv exists. The VAAPI tier-2 path uses `scale_vaapi` to pad/scale on the GPU; the equivalent for VideoToolbox would be `scale_videotoolbox`, which has different surface format constraints. `08-Tauri-Packaging.md` and the `00-Rust-Tauri-Port.md` background note "macOS/Windows HW paths stubbed." No tier-2 / tier-3 argv specifics anywhere in `docs/server/Hardware-Acceleration/`.

**Candidate paths.**

1. **Single-tier (decode + encode on GPU, no scale step).** `-hwaccel videotoolbox -hwaccel_output_format videotoolbox -i <in> -c:v hevc_videotoolbox -b:v <rate> <out>`. Works for same-resolution transcodes. Doesn't cover the scaling case.
2. **Tier-2 with `scale_videotoolbox`.** Adds `-vf scale_videotoolbox=w=W:h=H` between decode and encode. Need to verify the filter exists in jellyfin-ffmpeg's macOS build and handles the pad operation we use today on VAAPI.
3. **Hybrid (HW decode, software scale, HW encode).** Round-trip through system memory between filters. Half the win of full-GPU but more flexible. Likely the fallback if (2) doesn't pad cleanly.

**What to validate / decide-by.** A 30-second probe per candidate against a 4K HEVC sample on macOS hardware (any Apple Silicon Mac). Confirm: clean exit, non-zero output, fps ≥ 60. Latest defer: end of Step 3 — the binary cannot ship to a macOS soak user without it.

**Recommendation.** Validate (2) first; if `scale_videotoolbox` doesn't pad, fall back to (3). Document the chosen argv under a new `docs/server/Hardware-Acceleration/03-VideoToolbox.md`.

### 1.2 D3D11VA / QSV path on Windows  `[investigate]`

**Why it matters.** Same as 1.1 for Windows users. Intel iGPUs are the dominant Windows accelerator for transcode; QSV via `h264_qsv` / `hevc_qsv` is the well-trodden path. D3D11VA is the decode-side primitive.

**What we know.** Stubbed. No probe exists, no argv documented. The VAAPI three-tier cascade was hard-won through the silent-failure work documented in `docs/server/Hardware-Acceleration/`; the Windows equivalents have no comparable history.

**Candidate paths.**

1. **QSV-only on Intel hardware** — `-init_hw_device qsv=qsv -filter_hw_device qsv -hwaccel qsv -hwaccel_output_format qsv -i <in> -c:v hevc_qsv -global_quality <q> <out>`. Limited to Intel iGPU + Arc.
2. **D3D11VA decode + libx264 encode** — broader hardware coverage, but encode stays on CPU. Cuts decode CPU significantly; less of a 4K win than full HW.
3. **NVENC for NVIDIA users** — `-hwaccel cuda -c:v hevc_nvenc`. Requires per-vendor probe; doubles the matrix.

**What to validate / decide-by.** Probe each on Windows hardware available (Intel iGPU is most common). Latest defer: end of Step 3 for Windows soak users.

**Recommendation.** Ship (1) first if any Intel hardware is available for testing. (2) is the universal floor. Treat NVENC as Phase 2; the v1 release does not need to cover NVIDIA-specific paths.

### 1.3 Per-source HW-failure memory beyond VAAPI  `[defer]`

**Why it matters.** Today, `vaapiVideoState` (per `01-Streaming-Layer.md`) tracks "this source failed VAAPI tier-2, don't retry — use software." The same memory is likely needed for VideoToolbox / QSV (some HEVC profiles are HW-decodable but not HW-encodable on certain backends). Without it, every restart re-attempts a known-failing source.

**What we know.** The VAAPI memory works because the failure mode is documented (HDR + `-ss 0 -t 30` clean-exit-zero-output). The mac/Windows failure modes aren't catalogued yet — answering 1.1 / 1.2 may surface them.

**Recommendation.** Defer until 1.1 and 1.2 are validated. The shape will likely follow the existing `vaapiVideoState` map keyed by `(videoId, backend)` rather than by `videoId` alone.

### 1.4 Silent-failure test coverage per backend  `[investigate]`

**Why it matters.** The VAAPI HDR silent-failure class (clean exit, zero bytes output) is the kind of bug that ships — the process returns success, the segment is empty, the player stalls. Each new HW backend brings its own silent-failure profile. Without a test per backend, we discover them in production.

**What we know.** The existing test (`-ss 0 -t 30` on an HDR source) is documented in `docs/server/Hardware-Acceleration/`. No equivalent for VideoToolbox / QSV.

**Recommendation.** As 1.1 and 1.2 are answered, run the same `-ss 0 -t 30` shape against an HDR sample on each backend. If output is zero bytes despite exit code 0, add the failure mode to the per-backend memory (1.3).

### 1.5 Software-encode floor on Apple Silicon at 4K  `[decide]`

**Why it matters.** Even with VideoToolbox working, some sources fall through to libx264 (HDR, exotic codecs, tier-2 failures). On M1/M2 at 4K libx264 chokes; we need to know whether to ship a "this source can't transcode in real time" UX rather than letting the player stall waiting for chunks.

**What we know.** Bun prototype has no fallback UX for this case — software encode is just slower; if it's slow enough the player stalls. No telemetry on this today.

**Candidate paths.**

1. **No floor** — accept that some sources are unwatchable on Apple Silicon; rely on bug reports.
2. **Soft floor** — emit a warning toast when transcode fps < playback rate after N seconds. User keeps watching; we know about it.
3. **Hard floor** — refuse to start playback if a quick benchmark shows the source can't keep up; show a "needs HW accel" error.

**Recommendation.** (2). A soft floor + telemetry tells us the size of the problem before we over-engineer a fix.

---

## 2. Code signing infrastructure

Procurement, identity verification, and key-custody decisions all have weeks of lead time. If signing isn't set up before Step 4 begins, the Windows release warns on every install and the macOS release fails Gatekeeper. The decisions are not technically deep but they are time-blocking — start them early.

### 2.1 OV vs EV Authenticode  `[decide]`

**Why it matters.** OV (Organization Validation) certs are cheaper (~$100–300/yr) but require a SmartScreen reputation warm-up period — early users see a "Windows protected your PC" warning until enough downloads accumulate without flag. EV (Extended Validation) certs (~$300–500/yr) skip the warm-up entirely.

**What we know.** Per `08-Tauri-Packaging.md:317-356`, both options are documented as viable. EV requires a hardware token (HSM), which complicates CI.

**Candidate paths.**

1. **OV + reputation wait.** Cheaper. Soak users will see SmartScreen warnings for the first ~weeks. Acceptable for a beta if the soak group is briefed.
2. **EV + remote-signing service** (SSL.com eSigner, DigiCert KeyLocker). Hardware-token requirement is offloaded to the service; CI calls a signing API. Cleaner first-install UX.
3. **EV + self-hosted Windows runner with hardware token.** Cheapest EV option but adds infra to maintain.

**What to validate / decide-by.** Latest defer: 4 weeks before Step 4 (cert procurement is 1–2 weeks for an individual / new org).

**Recommendation.** (1) for the first beta — soak users tolerate it, and it lets the cert procurement run in parallel with Step 4 work. Switch to EV before the stable channel ships.

### 2.2 EV signing execution model  `[decide]`

**Why it matters.** Only relevant if 2.1 = EV. Hardware-token requirement means GitHub Actions hosted runners can't sign directly.

**Candidate paths.** Remote-signing service (recommended) vs self-hosted Windows runner with token attached.

**Recommendation.** Remote-signing service if EV is chosen. Self-hosted runner is cheaper but adds an always-on Windows machine to maintain.

### 2.3 Apple Developer ID enrolment timing  `[decide]`

**Why it matters.** Apple Developer Program ($99/yr) takes hours to days for individuals, longer for new organizations (DUNS verification). Notarization requires the Developer ID Application cert + a notarytool API key.

**What we know.** Lead time is real but bounded.

**Recommendation.** Enrol immediately if not already done. Latest defer: 2 weeks before Step 4.

### 2.4 Key custody location  `[decide]`

**Why it matters.** Lost or leaked keys invalidate the signing chain. The Tauri Ed25519 update private key is especially load-bearing — a leak means an attacker can sign updates and ship malware to every existing install. This is `Plan/04-Release.md` decision #1.

**Candidate paths.**

1. **1Password Secrets Automation → GitHub Actions secret.** Operationally clean, audited access, rotation playbook is straightforward.
2. **GitHub Actions secret only.** Simpler, no audit trail beyond GH. Acceptable for a one-developer project.
3. **HSM (cloud KMS).** Heavier; usually overkill until a real org structure exists.

**Recommendation.** (1) if 1Password is already in the toolchain (it is per the Plan/04 hint); otherwise (2) is acceptable for v1 with a documented rotation runbook.

---

## 3. Universal mac binary

`08-Tauri-Packaging.md:483` defers the universal-binary decision but doesn't surface a hidden complexity: jellyfin-ffmpeg distributes per-arch tarballs, no pre-built universal. This shapes the build, not just the decision.

### 3.1 Universal vs arch-specific bundles  `[decide]`

**Why it matters.** A universal `.app` ships one binary that runs on both Apple Silicon and Intel. Arch-specific bundles ship two `.app`s and the user picks. Universal is the better UX; arch-specific is simpler.

**Candidate paths.**

1. **Arch-specific bundles.** Two `.app`s on the download page, user picks. Updater manifest has separate `darwin-aarch64` and `darwin-x86_64` channels.
2. **Universal `.app`.** One download. The Rust binary is `lipo`-merged; ffmpeg stays per-arch (since jellyfin-ffmpeg has no universal build), staged under `resources/ffmpeg/darwin-aarch64/` and `darwin-x86_64/`, resolved at runtime.

**What to validate / decide-by.** Universal build path needs the `setup-ffmpeg` script extended (3.2). Latest defer: end of Step 3.

**Recommendation.** (1) for the first beta. Universal adds ffmpeg-staging complexity for marginal user benefit when downloads are small (~70-80 MB per arch). Switch to universal before the stable channel if the soak shows confusion about which build to download.

### 3.2 setup-ffmpeg `--target=universal-apple-darwin` shape  `[investigate]`

**Why it matters.** Only relevant if 3.1 = universal. The current `setup-ffmpeg --target=tauri-bundle` script (per `06-File-Handling-Layer.md`) downloads one ffmpeg per host-OS triple. Universal needs both arches staged side-by-side.

**Recommendation.** If pursuing universal: extend the script to download both `darwin-aarch64` and `darwin-x86_64` builds and stage under arch-keyed subdirectories. The runtime resolver (3.3) keys on `std::env::consts::ARCH`.

### 3.3 Runtime arch resolution in `ffmpeg_path.rs`  `[decide]`

**What we know.** The current sketch in `06-File-Handling-Layer.md` uses `format!("{}-{}", OS, ARCH)`, which already does the right thing at runtime — it works for both arch-specific and universal staging if the directories are named `darwin-aarch64` / `darwin-x86_64`.

**Recommendation.** Keep the current sketch. No code change needed if 3.1 = arch-specific; the universal case is handled by the same path lookup against arch-keyed staging directories.

---

## 4. Linux soft-fallback UX

`08-Tauri-Packaging.md:209` correctly specifies that the fatal-on-probe-failure VAAPI behavior must become a soft fallback under Tauri (otherwise a user with `/dev/dri` permission issues — common on fresh installs — gets a bricked app). The Rust-side fallback is sketched; the React-side surface is not.

### 4.1 `/dev/dri` permission failure toast component  `[decide]`

**Why it matters.** Without a user-facing notification, the app silently falls to software encode. Users on capable hardware never realize they could fix this with a `usermod -aG video,render` and get HW back.

**Candidate paths.**

1. **Existing toast system** (if one exists in the React app).
2. **New `<HwAccelFallbackBanner>` component** — persistent banner at the top of the player page.
3. **Settings-only surface** — silent fallback; a Settings indicator shows current backend.

**Recommendation.** (2) on first occurrence with a "don't show again" affordance, plus (3) as the persistent indicator. The first-time toast tells the user there's a fix; the Settings indicator lets them check after.

### 4.2 `user_settings` schema for "stay on software encode"  `[decide]`

**Why it matters.** Once a user has dismissed the toast and decided to live with software encode, we shouldn't re-prompt every launch.

**Candidate paths.**

1. **One column** — `hw_accel_user_preference` enum (`auto`, `force_off`).
2. **Two columns** — separate `hw_accel_dismissed_until` (timestamp) + `hw_accel_force_off` (bool). More flexible; probably YAGNI.

**Recommendation.** (1).

### 4.3 Tauri `hwaccel_fallback` event wiring  `[decide]`

**Why it matters.** The Rust side detects the probe failure; the React side renders the toast. Need a Tauri event channel.

**Recommendation.** Standard Tauri `app.emit_all("hwaccel_fallback", payload)` from the probe code; React side subscribes via `listen("hwaccel_fallback", …)` in a top-level effect. Payload includes the backend name and the recommended user fix string.

---

## 5. CI release matrix gaps

The matrix in `08-Tauri-Packaging.md` shows 4 runners (ubuntu, macos-13, macos-14, windows). What's not shown: how the manifest aggregation handles a partial build.

### 5.1 Partial-build / partial-sign aggregation policy  `[decide]`

**Why it matters.** The current sketch has the `latest.json` aggregation job set `needs: build` with no `if`. A single OS signing failure blocks the manifest for all OSes — users on healthy platforms can't auto-update.

**Candidate paths.**

1. **All-or-nothing.** One platform fails → no manifest update. Safe but brittle.
2. **Per-platform fallback.** Aggregate whatever platforms succeeded; alert on the failed one. Healthy platforms keep updating.

**Recommendation.** (2). Add `if: always() && needs.build.result != 'failure'` per-platform-job aggregation, and a slack/email alert on partial. Document the policy so on-call doesn't panic when a partial fires.

### 5.2 Tag-on-push vs cadence  `[decide]`

**Why it matters.** Tag-on-push is responsive — every signed tag publishes. Cadence (e.g. weekly) is predictable and limits update fatigue.

**Recommendation.** Tag-on-push for beta (soak users want fast iteration). Switch to a weekly or biweekly cadence for stable.

---

## 6. Updater + app identity

### 6.1 Reverse-DNS identifier locking  `[decide]`

**Why it matters.** `tauri.conf.json` currently has `com.example.xstream` as a placeholder. The updater plugin scopes its local state (preferences, update history) to this identifier. Once a beta user has installed v0.1.0, changing the identifier means they cannot auto-update — they must reinstall.

**Candidate paths.**

1. **Owner's domain reversed.** `dev.ngareleo.xstream` or similar.
2. **GitHub-handle-based.** `io.github.ngareleo.xstream`.
3. **Custom domain.** `app.xstream.tv` style (requires owning the domain).

**Recommendation.** (1) or (2) — pick whichever has the longer-lived squatting story. Lock before any user binary ships.

### 6.2 Linux `.deb` auto-update gap  `[decide]`

**Why it matters.** Per `08-Tauri-Packaging.md:484, 487`, `tauri-plugin-updater` does not support `.deb` self-updates (apt manages the package, not the app). AppImage updates work; `.deb` users are stranded on whatever version they install.

**Candidate paths.**

1. **AppImage-only on Linux.** Document `.deb` as "no auto-update; use AppImage for that." Simpler.
2. **Hand-rolled `.deb` channel.** Host a `.deb` repo, configure apt source on first install. Real infra commitment.
3. **Both, AppImage primary.** Ship both formats; `.deb` users are warned about manual updates.

**Recommendation.** (1) for v1. Linux users are split between AppImage / Flatpak / native — AppImage is the simplest universal answer; defer `.deb` repo work until users ask.

### 6.3 Pause update checks during active stream  `[decide]`

**Why it matters.** If `tauri-plugin-updater` replaces the binary mid-playback, the embedded server dies and the stream stalls. Linux is most exposed (the binary file is unlinked while running, the running process keeps its FD but a restart loses everything).

**Recommendation.** Gate the updater's check loop on a "playback active" flag emitted by the streaming code. Pause on `playback.session.start`, resume on `playback.session.end`. Three lines of glue; cheap insurance.

### 6.4 Rollback story  `[decide]`

**Why it matters.** `tauri-plugin-updater` doesn't ship a rollback primitive. If we publish a bad beta, every auto-updater installs it. Recovery is "publish a fast-follow patch" or "users manually reinstall an older signed bundle."

**Candidate paths.**

1. **Forward-fix only.** Document the playbook; ship a patch within hours of a bad release.
2. **Manual rollback.** Keep the prior signed bundle accessible at a stable URL; instruct users to download + reinstall.
3. **Pinned versions in the manifest.** Ship a `manifest-rollback.json` that downgrades; switch the live manifest URL during incident.

**Recommendation.** (1) + (2). The forward-fix discipline keeps the on-call playbook simple; (2) is the safety net.

---

## 7. Crash reporting + production telemetry

### 7.1 Crash reporter (Sentry vs nothing)  `[decide]`

**Why it matters.** Tauri does not bundle a crash reporter. Without one, production panics arrive as user complaints with no stack trace. Combined with telemetry-off-by-default (7.2), bug reports have no actionable signal.

**Candidate paths.**

1. **Nothing.** Rely on user-reported bugs. Cheapest; slowest debug loop.
2. **Sentry (sentry-rust + crash handler).** Industry default; needs first-run consent for beta users.
3. **Self-hosted (Glitchtip, etc).** Privacy-clean; ops cost.

**Recommendation.** (2) with first-run consent. The Tauri ecosystem has well-maintained Sentry integrations; opt-in keeps the privacy posture clean.

### 7.2 Telemetry posture for beta users  `[decide]`

**Why it matters.** OTel currently points at `localhost:4317` (Seq). For a packaged app, that endpoint won't exist on user machines. Without a remote collector, we have no visibility into beta behavior. This is `Plan/03-Tauri-Packaging.md` decision #5 + `Plan/04-Release.md` decision #5.

**Candidate paths.**

1. **Off-by-default + Settings opt-in.** Conservative. Beta users who want to help enable it; we get partial signal.
2. **Hosted collector + first-run consent.** Data-rich. Soak group accepts a consent dialog at install.
3. **Off-by-default for stable, on-by-default for beta with explicit consent on the download page.** Hybrid.

**Recommendation.** (2). The soak group exists specifically to surface bugs; data-rich is the point.

---

## 8. Coordination with the Electron interim (PR #36)

The interim alpha (`docs/architecture/Deployment/00-Interim-Desktop-Shell.md`, lands when PR #36 merges) ships before the Rust port and exercises the same packaging surface area. Without coordination, the two shells diverge and the Rust port has to rebuild what the alpha already established.

### 8.1 Shared ffmpeg staging contract  `[decide]`

**Why it matters.** If Electron stages ffmpeg differently from `setup-ffmpeg --target=tauri-bundle`, the Rust port has to clean up a parallel system. Both should consume the same `scripts/ffmpeg-manifest.json` and stage at the same `vendor/ffmpeg/<platform>/` shape.

**Recommendation.** Decide the shared contract before PR #36 ships its packaging step. Document it in `06-File-Handling-Layer.md` as the canonical staging shape.

### 8.2 UX patterns to back-port (folder picker)  `[decide]`

**Why it matters.** `Plan/03-Tauri-Packaging.md` decision #2 already names this — the Electron alpha is likely to ship a folder picker that calls `createLibrary`. Step 3 should reuse that UX rather than design a second one.

**Recommendation.** Wait for PR #36 to ship its picker, then back-port the React component into the Tauri build of Step 3.

### 8.3 Shared signing infrastructure  `[decide]`

**Why it matters.** Apple Developer ID, Authenticode cert, GH Actions secrets — all should be provisioned once and reused. If the Electron alpha procures separately, we pay twice.

**Recommendation.** Procure signing materials in this order: Apple Developer ID (immediate, low risk), Authenticode (start when 2.1 decided), Ed25519 update key (immediate, can be generated locally). All three feed both shells.

---

## 9. Cross-platform quirks needing pressure-test

These are stated unknowns in the migration docs that need empirical validation before each platform ships. Cheap to test, painful to discover in production.

### 9.1 `%04d` ffmpeg segment-pattern quoting on Windows  `[investigate]`

**Why it matters.** Per `01-Streaming-Layer.md:307`, the segment output pattern uses `%04d` (zero-padded segment index). On Windows shells, `%` is a special character — needs verification that `tokio::process::Command::args()` passes it unmolested.

**Recommendation.** Run a 30-second probe on Windows: `ffmpeg ... -f segment seg_%04d.m4s` via `Command::args(&["-f", "segment", "seg_%04d.m4s"])`. Confirm files are named `seg_0001.m4s` etc, not `seg_%04d.m4s` literal.

### 9.2 `notify` / FSEvents coalescing during 4K encode  `[investigate]`

**Why it matters.** The chunker watches the segment dir for new files. macOS FSEvents and Windows ReadDirectoryChangesW debounce events differently from Linux inotify — under heavy write load (4K encode at ~200 segments/sec), events may coalesce or arrive out of order. A missed `init.mp4` event stalls the stream.

**Recommendation.** Run a 4K encode with the `notify::RecommendedWatcher` on each OS; assert event count == file count and order matches creation time. Test before Step 3 closes.

### 9.3 `spawn_blocking` exhaustion on >100k file libraries  `[investigate]`

**Why it matters.** `06-File-Handling-Layer.md:430` flags this. `tokio`'s blocking pool is finite (default 512 threads). A large library scan that spawns one task per file could saturate it.

**Recommendation.** Switch the scanner to use a bounded concurrency primitive (`futures::stream::iter(...).buffer_unordered(N)` with N=32 or so) rather than unbounded `spawn_blocking`. Test against a synthetic 100k-file directory before Step 1 ships.

### 9.4 WAL sidecar cleanup under Tauri  `[investigate]`

**Why it matters.** `05-Database-Layer.md:443` flags this. SQLite WAL mode produces `db.sqlite-wal` and `db.sqlite-shm` sidecar files. If Tauri's resource cleanup deletes only the main DB file on uninstall, orphaned WAL files corrupt a future reinstall.

**Recommendation.** Test uninstall + reinstall on each OS; confirm no orphaned `*-wal` / `*-shm` files in `app_data_dir()`. Add a startup sweep that deletes orphans if the main file is missing.

### 9.5 Path / argv quoting on Windows when `app_cache_dir()` contains spaces  `[investigate]`

**Why it matters.** Windows `app_cache_dir()` resolves to `C:\Users\<user>\AppData\Local\<identifier>\cache`. If `<user>` contains a space (very common — "John Doe"), every ffmpeg argv that includes this path needs correct quoting. `tokio::process::Command::args()` handles this correctly only if arguments are passed as separate slice elements, never as a single space-joined string.

**Recommendation.** Audit every `Command::new("ffmpeg")` call site: confirm `.args()` receives a `&[&str]` or `&[String]`, never `.arg("a b c")` with shell-interpolation. Spot-test on a Windows VM with a spaced-username profile.

---

## 10. Step-level cutover decisions (consolidated from Plan/01-04)

These are the "Decisions to lock before starting" lines extracted from each step doc, restated as a single list. Most are `[decide]` — pick a path and move on.

### Step 1 — GraphQL + Observability

**10.1 Rust port number.** Recommend `3001` (Bun stays on `3000`). Hard-coded for cutover; deleted in Step 3.

**10.2 Alternate-origin discovery.** Recommend hard-coded `http://localhost:<port>` with the port baked into `flagRegistry.ts` alongside the boolean. Dead-simple; deleted in Step 3 along with the flag. Step 2 reuses the same mechanism.

**10.3 Flag shape.** ~~Recommend one boolean per cutover (`useRustGraphQL`, then `useRustStreaming`). Enum is YAGNI.~~ **→ Superseded.** A two-boolean design was tried in Step 1 + Step 2; the combinations where the flags drift apart (Bun GraphQL + Rust streaming, or vice versa) produce 404 split-brain because the two backends do not share state. Collapsed to one boolean (`useRustBackend`) before Step 2 PR merge — it routes both `/graphql` and `/stream/*` to the same backend. See `02-Streaming.md` "Where this step sits".

### Step 2 — Streaming

**10.4 Cache directory during cutover.** ~~Recommend `tmp/segments-rust/` for Rust; Bun keeps `tmp/segments/`. Different content-addressed indexes; mixing risks corruption. Document the env var override path so testers can swap.~~ **→ Resolved. See Resolved section.**

**10.5 Mid-session flag-flip behavior.** ~~Recommend graceful next-segment switch — let the current segment finish on Bun, the next request lands on Rust. Fail-fast is uglier (spinner blip during the switch).~~ **→ Resolved. See Resolved section.**

**10.6 Rust ffmpeg subprocess wrapper.** ~~Recommend hand-rolled `tokio::process::Command` (per `07-Bun-To-Rust-Migration.md`). The wrapper crates add little when SIGTERM/SIGKILL escalation is the load-bearing part.~~ **→ Resolved. See Resolved section.**

**10.7 Span-surface validation method.** ~~Recommend Seq diff: same playback session against both origins, assert span name + key attribute set match. Document the diff command in the Step 2 PR.~~ **→ Resolved. See Resolved section.**

### Step 3 — Tauri Packaging

**10.8 OS coverage for first Tauri build.** Recommend Linux-only for the first Tauri build (lowest friction — VAAPI works, signing is Ed25519-free). All three for the second build, which feeds the Step 4 release matrix.

**10.9 Library-picker UX.** See **8.2** — back-port from the Electron alpha if it ships first.

**10.10 HW-accel softening shape.** See **§1** (and specifically **4.1**) for the toast UX.

**10.11 Bundled binary size budget.** Recommend "fail the bundle build at >200 MB per platform." Rough projection per `Plan/03-Tauri-Packaging.md`: ~120-160 MB. 200 MB gives headroom without hiding bloat.

**10.12 Telemetry endpoint default.** See **7.2**.

### Step 4 — Release

**10.13 Signing-key custody.** See **2.4**.

**10.14 Static-origin host for updater manifests.** Recommend GitHub Releases for v1. Cheapest, fastest; integrated with the tag-on-push CI shape. Switch to R2 / S3 when scale demands.

**10.15 Update channel naming.** Recommend `beta` only at first; `stable` graduates after the soak. Defer `nightly` / `canary` until a real ask.

**10.16 Soak group definition.** Open question for the user — needs naming actual people, an enrolment mechanism, and an issue-reporting channel. Recommend: 5–10 people from the existing user/contributor circle, enrolled via a private download link, issues filed on GitHub with a `beta` label.

**10.17 Release cadence.** See **5.2**.

**10.18 Rollback story.** See **6.4**.

---

## Resolved

_Move resolved entries here with the date and chosen path._

---

### 10.4 Cache directory during cutover — Resolved 2026-04-30

**Chosen path:** `tmp/segments-rust/` for Rust; Bun keeps `tmp/segments/`. Implemented in `AppConfig::dev_defaults` at `server-rust/src/config.rs`. Separate directories prevent index cross-contamination if one process evicts a segment the other still indexes. An env var override (`SEGMENT_DIR`) lets testers swap directories without recompiling.

### 10.5 Mid-session flag-flip behaviour — Resolved 2026-04-30

**Chosen path:** Single module-init snapshot in `rustOrigin.ts` — `getFlag(useRustBackend, false)` is read exactly once at module load and cached in `RUST_BACKEND_ENABLED`. Both `graphqlHttpUrl()` and `streamUrl(jobId)` consult the cached value. A mid-session toggle is invisible to both channels until the next page reload — matching the flag description's "Reload required after toggle." Earlier iteration tried a per-call read for `streamUrl`; that produced a 404 split-brain when a user toggled mid-session (Bun-frozen GraphQL created the job, Rust-live /stream couldn't find it). The single-snapshot rule keeps the two channels in lockstep. See **10.3** for the consolidation rationale.

### 10.6 Rust ffmpeg subprocess wrapper — Resolved 2026-04-30

**Chosen path:** Hand-rolled `tokio::process::Command` with `kill_on_drop(true)`. POSIX SIGTERM/SIGKILL escalation via the `nix` crate (Unix-only; stubs on Windows remain). Implementation lives in `server-rust/src/services/ffmpeg_pool.rs`. No wrapper crate adopted — the SIGTERM→SIGKILL escalation logic is the load-bearing part and is cleaner as first-class code.

### 10.7 Span-surface validation — Resolved 2026-04-30 (partial)

**Chosen path:** Seq diff plan documented in PR #41 test plan. The diff method is: run the same playback session against both origins (Bun on port 3001 with `useRustBackend` off, Rust on port 3002 with `useRustBackend` on), query Seq for `transcode.job` and `stream.request` spans on each trace ID, and assert span name + key attribute set match. `transcode_started`, `transcode_complete`, `transcode_killed`, and `transcode_silent_failure` all emit. **Not yet executed** — span parity is in the test plan, not yet asserted as of PR #41. Follow-up: user must run the Seq diff before Step 3 begins. The missing gap is `transcode_progress` periodic events (see `Plan/02-Streaming.md` — skipped piece #1).
