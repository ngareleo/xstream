# Architecture Review — Rust + Tauri Port

**Snapshot: 2026-04-28.** This is a point-in-time architectural assessment of the in-progress Bun → Rust + Tauri migration. It synthesises the architect's pre-implementation gap analysis with an inventory of what is already on record across `docs/migrations/rust-rewrite/00-08-*.md` and `Plan/01-04-*.md`. The conclusions reflect the state of the codebase and migration docs at the date stamped above.

The companion document is [`Plan/Open-Questions.md`](Plan/Open-Questions.md) — the **live decisions register** that turns the gaps surfaced here into actionable per-question entries (tagged `[decide]` / `[investigate]` / `[defer]`). When this review's conclusions are out-of-date, prefer the register.

## Verdict

**The port is structurally sound; risk is operational, not architectural.** The Bun prototype was built with the rewrite in mind — every load-bearing contract is explicit ([`00-Rust-Tauri-Port.md`](00-Rust-Tauri-Port.md)), the pull-based stream protocol translates 1:1 to `axum::Body::from_stream`, and the React client stays untouched. There is no Bun-ism that forces a protocol break. Real risk lives in code-signing, hardware-acceleration coverage on macOS / Windows, and OS-specific quirks the prototype hasn't been pressure-tested against.

## What Rust structurally retires (Bun pain → gone)

These are *invariants today, structural in Rust* — the kind of bug class that disappears by construction, not by discipline:

- **`fluent-ffmpeg.setFfmpegPath` module-global footgun** — [`01-Streaming-Layer.md:236`](01-Streaming-Layer.md), [`06-File-Handling-Layer.md:313`](06-File-Handling-Layer.md). Every ffmpeg call goes through `tokio::process::Command::new(&state.ffmpeg_paths.ffmpeg)`; nothing to clobber.
- **Bun's `fs/promises.watch` async-iterable bug** — [`01-Streaming-Layer.md:123, 235`](01-Streaming-Layer.md). `notify::RecommendedWatcher` is the cross-platform default; the `chunker.ts:780` workaround vanishes.
- **`req.signal.aborted` defensive blocks become dead code** — [`01-Streaming-Layer.md:234`](01-Streaming-Layer.md). Bun marks aborts before the first `await`; in axum the dropped consumer fails the channel send. The `try { await Bun.sleep() } catch { ... }` patterns at `stream.ts:192-336` have no Rust equivalent.
- **One-resolver-per-field invariant → compile error** — [`03-GraphQL-Layer.md:48`](03-GraphQL-Layer.md). `async-graphql`'s `#[Object]` proc macro fails compilation on duplicates; Invariant #7 becomes informational.
- **Counter-cap race → `Arc<Semaphore>` + dying-set** — [`01-Streaming-Layer.md:237, 262`](01-Streaming-Layer.md). The reservation pattern at `ffmpegPool.ts:72-84` becomes race-safe across SIGTERM kills by construction; SIGTERMed jobs don't count toward the cap, so a slow-to-exit ffmpeg can't starve the next request.
- **Floating promises → compile error** — [`07-Bun-To-Rust-Migration.md:201`](07-Bun-To-Rust-Migration.md). A `Future` that is not awaited or spawned does nothing; the lint becomes structural.
- **Named DB column access** — [`07-Bun-To-Rust-Migration.md:196`](07-Bun-To-Rust-Migration.md). The positional `row[0]` footgun is gone.
- **OTel flush on shutdown** — [`04-Web-Server-Layer.md:163, 330`](04-Web-Server-Layer.md). Currently buffered spans are dropped on `process.exit(0)`; the Rust port flushes properly.
- **Real `graphql-transport-ws` subscriptions** — [`03-GraphQL-Layer.md:293`](03-GraphQL-Layer.md). The yoga subscription transport currently negotiates the legacy `graphql-ws` subprotocol; `async-graphql-axum::GraphQLSubscription` ships the modern one.

## What Rust loses (worth flagging)

- **OTel-Logs Rust SDK is pre-1.0** — [`02-Observability-Layer.md:189, 306`](02-Observability-Layer.md). The Tracing API is fine; the *logs* API is less stable than what Bun's OTel SDK ships. Practical impact small — the project mostly uses `span.addEvent` per the logging policy — but worth not pretending otherwise.

## Sharing forward-constraints already baked into v1

These are foreclosed-against today so peer streaming can land later without re-cutting the plumbing. Listed for confidence, not action:

- Per-connection pull isolation + per-consumer 16-segment mpsc backpressure — [`01-Streaming-Layer.md:285-291`](01-Streaming-Layer.md).
- Content-addressed cache key `(videoId, resolution, startS, endS)` decoupled from `jobId` — [`06-File-Handling-Layer.md:367-399`](06-File-Handling-Layer.md).
- `RequestContext` middleware threaded day-one with no-op auth — [`04-Web-Server-Layer.md:230`](04-Web-Server-Layer.md), [`03-GraphQL-Layer.md:319`](03-GraphQL-Layer.md).
- Configurable CORS allowlist + bind address (loopback default) — [`04-Web-Server-Layer.md:351, 357`](04-Web-Server-Layer.md).
- `traceparent` passthrough invariant — auth must not strip OTel headers — [`02-Observability-Layer.md:271`](02-Observability-Layer.md), [`04-Web-Server-Layer.md:365`](04-Web-Server-Layer.md).
- Two-DB split: cache in `tmp/`-class storage, identity in `app_data_dir()` — [`05-Database-Layer.md:402`](05-Database-Layer.md), [`06-File-Handling-Layer.md:409`](06-File-Handling-Layer.md).

## Highest-risk gaps for the 3-OS release

These were surfaced by the architect as **not yet captured** (or only weakly) in the migration docs at the time of this review. Each has a corresponding entry in [`Plan/Open-Questions.md`](Plan/Open-Questions.md).

### 1. HW-accel coverage on mac / Windows is the biggest open item

VAAPI on Linux is the only implemented HW path; VideoToolbox (macOS) and D3D11VA / QSV (Windows) are stubbed. The migration docs specify the tagged-union shape but **not the concrete ffmpeg argv** for VideoToolbox, the macOS probe, or the Windows D3D11VA / QSV probe. Specifically unknown: whether `-hwaccel videotoolbox -hwaccel_output_format videotoolbox -c:v hevc_videotoolbox` round-trips cleanly across all macOS codec / pix_fmt combos, and whether `scale_videotoolbox` handles pad like `scale_vaapi` does in the Linux tier-2 path. The VAAPI HDR silent-failure class (clean exit, zero output) needs an equivalent test on each backend before each platform ships. **For 4K on Apple Silicon, software libx264 is a first-class UX regression** — this isn't optional. A new doc section under [`docs/server/Hardware-Acceleration/`](../../server/Hardware-Acceleration/) is warranted before Step 3 is "complete" for macOS. See `Open-Questions.md` §1.

### 2. Code signing has weeks of lead time and an unmade decision

Apple Developer ID enrolment is days; OV / EV Authenticode certs are 1–2 weeks (longer for a new org). **EV avoids SmartScreen warm-up but requires a hardware token on the CI runner** — meaning either a self-hosted Windows runner or a remote-signing service (SSL.com eSigner, etc.). Neither option is documented or decided. If signing isn't set up before Step 4 begins, the Windows release warns on every install. See `Open-Questions.md` §2.

### 3. The universal mac binary has hidden complexity

[`08-Tauri-Packaging.md:483`](08-Tauri-Packaging.md) defers the universal-binary decision but doesn't surface this: jellyfin-ffmpeg ships separate per-arch tarballs, no pre-built universal. So a universal `.app` either bundles two ffmpegs (`resources/ffmpeg/darwin-x86_64/` + `darwin-aarch64/`) and resolves at runtime via `std::env::consts::ARCH`, or you ship two arch-specific bundles. The current `ffmpeg_path.rs` sketch using `format!("{}-{}", OS, ARCH)` works at runtime, but the `setup-ffmpeg --target=universal-apple-darwin` build step is unspecified. See `Open-Questions.md` §3.

### 4. Linux soft-fallback UX has no client-side home

[`08-Tauri-Packaging.md`](08-Tauri-Packaging.md) correctly specifies the Rust-side soft fallback for `/dev/dri` permission failures, but the React-side toast component, the `hwaccel_fallback` Tauri event wiring, and the `user_settings` schema for "stay on software encode" preference are all unspecified. Not a Step-3 blocker mechanically, but blocks Linux being user-friendly at release. See `Open-Questions.md` §4.

### 5. Other concrete gaps worth a line each

- **CI partial-build handling** — the `latest.json` aggregation in [`08-Tauri-Packaging.md`](08-Tauri-Packaging.md) has `needs: build` with no `if`, so one OS signing failure blocks the manifest for all OSes. Needs a per-platform fallback policy before the first release tag. (`Open-Questions.md` §5.1)
- **Reverse-DNS identifier** (`com.example.xstream` placeholder in `tauri.conf.json`) — once shipped, can't change without breaking auto-update for existing installs. One-time decision needed before any user binary. (`Open-Questions.md` §6.1)
- **Crash reporting unmade** — [`08-Tauri-Packaging.md:488`](08-Tauri-Packaging.md) flags "Sentry vs nothing" as undecided. Combined with telemetry-off-by-default, production bug reports arrive context-free. (`Open-Questions.md` §7.1)
- **Coordination with the Electron interim (PR #36)** — if Electron uses a different ffmpeg staging strategy from `setup-ffmpeg --target=tauri-bundle`, you'll end up cleaning up a parallel system. Worth an explicit shared contract. (`Open-Questions.md` §8)
- **Unvalidated cross-platform quirks already on record but not pressure-tested:** `%04d` quoting on Windows ([`01-Streaming-Layer.md:307`](01-Streaming-Layer.md)), `notify` coalescing on macOS FSEvents during 4K encode ([`06-File-Handling-Layer.md:428`](06-File-Handling-Layer.md)), `spawn_blocking` exhaustion on >100k file libraries ([`06-File-Handling-Layer.md:430`](06-File-Handling-Layer.md)), WAL sidecar cleanup under Tauri ([`05-Database-Layer.md:443`](05-Database-Layer.md)), Tauri-updater Linux `.deb` not supported ([`08-Tauri-Packaging.md:484`](08-Tauri-Packaging.md)), pause-update-during-active-stream policy ([`08-Tauri-Packaging.md:485`](08-Tauri-Packaging.md)). All in `Open-Questions.md` §9.

## What to track next

These aren't actions to take now — they're the things to lock before each step starts. Each has an entry in `Open-Questions.md` with the recommended path.

- **Before Step 3:** universal-mac decision; HW-accel argv specs for VideoToolbox + D3D11VA written into `docs/server/Hardware-Acceleration/`; soft-fallback toast designed; reverse-DNS identifier locked.
- **Before Step 4:** signing decision (OV vs EV + remote signer); CI partial-build policy; crash-reporting decision; telemetry-posture decision; Electron-interim ffmpeg-staging contract reconciled.

## Methodology

This review synthesises two parallel analyses run on 2026-04-28:

1. **Architect (forward-looking):** identified gaps not yet captured in the migration docs that affect the 3-OS release — the bulk of §"Highest-risk gaps" above.
2. **Documentation inventory (read-only):** traversed `00-Rust-Tauri-Port.md`, the eight layer references, and `07-Bun-To-Rust-Migration.md` to extract every cited place where Rust > Bun/JS, the recorded sharing forward-constraints, and stated cross-platform release blockers (constraints + unknowns) — sourcing the bulk of §"What Rust structurally retires" and §"Sharing forward-constraints" above.

Both analyses ran against the state of the migration docs as merged through PR #32. Subsequent doc changes may invalidate specific citations; when in doubt, re-read the cited file rather than trusting this snapshot.
