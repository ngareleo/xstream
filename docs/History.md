# Architect History

Narrative log of how the knowledge base has evolved. **Newest entries on top.**

This file is distinct from [`Commit.md`](Commit.md):

- **`Commit.md`** is the terse machine-readable sync log. The architect reads only the top entry on every invocation, compares the SHA to `git rev-parse HEAD`, and decides whether a sync scan is needed. Format is rigid (`sed`-friendly, `---` dividers, top-only read).
- **`History.md`** is the prose record. The architect reads recent narrative entries on demand to build familiarity with how the docs have evolved over time — not to detect drift, but to understand the *why* behind successive changes.

**Pairing rule.** Every `Commit.md` entry has a paired `History.md` entry, written in the same session. The `Commit.md` entry says *what changed*; the `History.md` entry says *why it mattered, what alternatives were considered, and what the change unblocks for future agents*.

How to use this file:

- **At start of architect session — read only the top entry** via `sed -n '1,/^---$/p' docs/History.md`. This returns the preamble plus the most recent entry up to its terminating divider, so the file can grow unbounded without inflating the boot-read cost. The protocol mirrors `Commit.md`.
- **When recent context is needed:** widen to the top N entries with `awk '/^---$/{n++; if(n>=N) exit} {print}' docs/History.md` (substitute N=5 for "the last few"). Pure `sed` can't natively count divider matches, so a tiny `awk` pass is the right tool for top-N — but the default cadence is top-1 only.
- **When asked a question whose answer turns on a recent decision:** grep this file for the topic. The narrative entry will name the doc that landed and the rationale.
- **When writing a new entry:** keep it to one paragraph plus a "Files:" line. Cross-link to the docs touched. Don't restate the `Commit.md` entry — assume the reader has it open. Prepend the new entry **after the preamble block but before the first existing `---` divider** so newest-on-top stays intact.

**IMPORTANT for the preamble:** do not use bare `---` lines anywhere in this top-of-file block — `sed -n '1,/^---$/p'` would stop at the first one and miss real entries below. The first `---` line in this file MUST be the terminator of the most recent entry. (Same constraint as `Commit.md` §preamble.)

Entry shape (the entry ends with a single line containing exactly three hyphens — see existing entries below for the literal format):

```markdown
## <YYYY-MM-DD> — PR #<N> — <short title>

<One-paragraph narrative of what changed and why. Name the constraint that prompted it. Name the alternative that was considered and rejected, if any. Name what this unblocks.>

**Files:** `path/a.md`, `path/b.md`
**Related Commit.md entry:** `<short-sha>`

(terminating divider line goes here — see real entries below)
```

> **Note on entries before 2026-05-01.** `docs/Commit.md` only began tracking architect-driven doc edits at PR #42 (`8534bc2`). Earlier entries below are seeded from PR titles + descriptions and carry the merge SHA in the Related-Commit slot rather than a true `Commit.md` cross-reference. The narrative is preserved; the cross-reference is best-effort for the pre-Commit.md era.

<!-- ENTRIES BELOW — newest first; each ends with a bare three-hyphen divider line. -->

## 2026-05-03 — PR #54 — boot-pack reorg + Principles/Tooling subtrees + History.md

CLAUDE.md had grown to inline four content sections (engineering principles, code-style pointers, code-quality tooling, observability rules) that duplicated or risked-duplicating canonical homes elsewhere. The risk was drift: the literal `kill_reason` enum, the ESLint rule list, and the engineering meta-rules each had a source of truth that CLAUDE.md was repeating. This session moved every duplicated rule into the canonical doc, replaced the CLAUDE.md sections with one-line pointers, and upgraded the session-start directive to name the boot pack explicitly: `SUMMARY.md` + `code-style/README.md` + `Observability/01-Logging-Policy.md`. Two new sub-trees landed: `code-style/Principles/` (which previously had no canonical home for "fix root causes" + "don't weaken safety timeouts") and `code-style/Tooling/` (linting + formatting per language: Rust, TS/React, SQL). The session also added this `History.md` file as a counterpart to `Commit.md` — `Commit.md` answers *did the docs sync at this SHA*, `History.md` answers *what's been changing and why*. Future agents reading the boot pack now see the four engineering principles as one-liners directly in `SUMMARY.md`, with the deep rationale a single click away.

**Files:** `CLAUDE.md`, `docs/SUMMARY.md`, `docs/INDEX.md`, `docs/code-style/README.md`, `docs/code-style/Principles/`, `docs/code-style/Tooling/`, `docs/History.md`, `.claude/agents/architect.md`
**Related Commit.md entry:** `(pending-commit)` — see top of `Commit.md`

---

## 2026-05-02 — PR #53 — mechanical KB groom + lift "report-only" policy on prose

Mechanical `/groom-knowledge-base` hygiene pass that doubled as a policy change. Found two stale paths (an undocumented `Commit.md` row in `docs/README.md`; a stale `types.rs` reference after the per-domain split) and fixed them. The bigger move was lifting the skill's prior "report-only for prose mismatches" guard so it now rewrites prose drift directly — but with off-limits zones preserved (Invariants rationale, `docs/migrations/`, `design/Release/`, source code, undocumented symbols). After the policy change, two source-true rewrites landed in the same PR: `FfmpegPool.md` (full pool API + state machine) and `HDR-Pad-Artifact.md` (cascade now reads from Rust). Established that mechanical groom + bounded prose rewrites is the right scope for the skill — paving the way for the deeper boot-pack reorg in #54.

**Files:** `.claude/skills/groom-knowledge-base/SKILL.md`, `docs/README.md`, `docs/server/GraphQL-Schema/00-Surface.md`, `docs/architecture/Streaming/06-FfmpegPool.md`, `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md`
**Related Commit.md entry:** `f90b884`

---

## 2026-05-02 — PR #52 — retire Bun server; Rust-only northstar

The Rust + Tauri migration is complete; this PR removes every trace of the Bun TypeScript server so the codebase reads as if there was no Bun server (Bun-the-package-manager and Rsbuild legitimately stay for the React client toolchain). Deleted the entire `server/` package, ripped out the `useRustBackend` flag, scrubbed `// Mirrors server/src/...` markers from ~25 Rust files, and retired `docs/migrations/rust-rewrite/` since it's now history. Salvaged the Tauri-packaging content into `docs/architecture/Deployment/` and replaced the Electron-era files with the Tauri reality (`00-Tauri-Desktop-Shell.md`, `01-Packaging-Internals.md`, `02-Shipping-FFmpeg.md`). Promoted the *tests travel with the port* rule from a migrations note to a permanent code-style invariant. After this, no agent reading the docs cold should suspect Bun ever existed on the server side.

**Files:** `server/` (deleted), `docs/migrations/rust-rewrite/` (retired), `docs/architecture/Deployment/`, `docs/code-style/Testing/00-Tests-Travel-With-The-Port.md`, ~25 `server-rust/` files
**Related Commit.md entry:** `7462a37`

---

## 2026-05-02 — PR #50 — TV-show support, Heroicons sweep, resolution-handling proposal

Two product additions plus a planning doc. TV-show support adds a `Film.kind` discriminator + `Season`/`Episode` model with watched/in-progress state, a `getResumeEpisode` selector, and a shared `<SeasonsPanel>` used inline by FilmRow expand, DetailPane, FilmDetailsOverlay rail, and the Player picker. The Heroicons sweep standardised both workspaces on `@heroicons/react@1.0.6` (Outline v1, matches the user's Figma kit), keeping three hand-rolled exceptions (`IconArrowsIn` no v1 equivalent, `IconSpinner` CSS animation, `LogoShield` brand). Per-component lab polish landed alongside (circular EdgeHandle, control-bar pulse, FilmDetailsOverlay backdrop breathing, view-transition morph from DetailPane to overlay). The resolution-handling proposal added §5 to `06-File-Handling-Layer.md` formalising per-job resolution selection + per-episode native-resolution clamping, with a forward-note in the GraphQL schema doc.

**Files:** `design/Release/`, `docs/migrations/release-design/`, `docs/migrations/rust-rewrite/06-File-Handling-Layer.md`, `docs/server/GraphQL-Schema/00-Surface.md`
**Related Commit.md entry:** `931c982`

---

## 2026-05-02 — PR #49 — profile flows, hero modes, AppHeader polish + decomposition

Three loosely-grouped batches in `design/Release/`. (1) Profile management flows — new `CreateProfile` / `EditProfile` / `Error` pages plus a shared `ProfileForm`, with empty-state branch and hover affordances on profile + film rows. (2) Hero modes — Library hero is now a tri-state machine (`idle | searching | filtering`) with a TUI-flavoured `>` prompt + filter table; AppHeader gets an avatar circle + AccountMenu dropdown. (3) AppHeader decomposition — extracted into smaller subcomponents to make the per-component spec actionable.

**Files:** `design/Release/src/pages/Profiles/`, `design/Release/src/components/AppHeader/`, `docs/migrations/release-design/Components/AppHeader.md`
**Related Commit.md entry:** `ac4c7fd`

---

## 2026-05-01 — PR #48 — player drawer + Liquid-Glass play buttons

Player-page redesign in `design/Release/`. SidePanel was a `1fr 290px` grid column that resized the video on toggle; now it's an absolutely-positioned drawer (closed by default), slides in via `transform: translateX`, three close paths (×, click-outside, chrome auto-hide). New `EdgeHandle` component bulges out as the cursor approaches. iOS-26-style "Liquid-Glass" play buttons (translucent white bg, `backdrop-filter: blur(20px) saturate(180%)`, beveled borders, layered insets) on Player big idle, FilmDetailsOverlay Play CTA, and DetailPane Play. `IconPlay` rebuilt so the path centroid lands at the exact viewBox centre.

**Files:** `design/Release/src/pages/Player/`, `design/Release/src/components/EdgeHandle/`, `design/Release/src/lib/icons/IconPlay.tsx`
**Related Commit.md entry:** `b633ae3`

---

## 2026-05-01 — PR #47 — pin all subagents to haiku to cut token spend

Flipped all five custom subagents (`architect`, `browse`, `devops`, `inspect-seq`, `migrations-lead`) from `sonnet` to `haiku`. Added a "Subagent model policy" line to CLAUDE.md covering built-in agents (`Explore`, `Plan`, `general-purpose`) — those have no on-disk model field, so the main agent must pass `model: "haiku"` per Agent call. Main agent stays on opus. Escape hatch documented: flip a single frontmatter line back to `sonnet` if Haiku turns out too weak for one curator.

**Files:** `.claude/agents/architect.md`, `.claude/agents/browse.md`, `.claude/agents/devops.md`, `.claude/agents/inspect-seq.md`, `.claude/agents/migrations-lead.md`, `CLAUDE.md`
**Related Commit.md entry:** `5bc8c61`

---

## 2026-05-01 — PR #46 — real OMDb posters + Griffel sweep

Two design-lab cleanups. (1) Replaced live `m.media-amazon.com` poster URLs with cached JPGs under `design/Release/public/posters/` — added `fetch-posters.ts` script + a `.gitignore` exception so the cached files ship with the repo (no more rotting CDN URLs). (2) Griffel sweep — replaced ~270 inline `style={{}}` blocks across Library, DetailPane, Player, Settings, DesignSystem, Goodbye, NotFound, Profiles, Poster, Sidebar with colocated `*.styles.ts` files. Poster's API flips from `style` → `className` only — geometry is now the parent's responsibility supplied via Griffel-generated classes. Intentional inline style holdouts documented (runtime-driven values like `left: ${caretX}px`).

**Files:** `design/Release/scripts/fetch-posters.ts`, `design/Release/public/posters/`, ~12 `design/Release/src/**/*.styles.ts`, `docs/migrations/release-design/`
**Related Commit.md entry:** `60ca2c3`

---

## 2026-05-01 — PR #45 — Release lab split + Xstream identity + per-component spec migration

Split `design/` into `design/Prerelease/` (frozen Moran) and `design/Release/` (active Xstream). Full page parity in Release — Profiles, Library, Player, Settings, DesignSystem, Goodbye, NotFound — seeded from Figma handoff. AppHeader iterated to glass treatment with custom green pulsing caret (mirror-span pinned to end-of-text), hover-breathing, functional search with film/library suggestions + keyboard nav, Prerelease-idiom scan button. Scaffolded `docs/migrations/release-design/` — portable per-component spec for porting Release into `client/src/`. Wired the migration through `migrations-lead`: agent definition extended with the new domain + Release-design migration section + `design/Release/**` routing branch. CLAUDE.md routing now sends `design/Release/**` edits to `migrations-lead`; Prerelease stays on architect, frozen.

**Files:** `design/Prerelease/`, `design/Release/`, `docs/migrations/release-design/`, `.claude/agents/migrations-lead.md`, `CLAUDE.md`
**Related Commit.md entry:** `92da4bc`

---

## 2026-05-01 — PR #44 — port library scanner + chain it from create_library

The Rust backend's `scanLibraries` was a no-op stub — clicking **Scan All** or adding a library profile (with `useRustBackend=ON`) returned the library list in ~1 ms with zero filesystem walk. This PR ports the file-walking scanner so the user-facing flow works end-to-end, and ports OMDb auto-match so freshly-scanned videos pick up posters / IMDb ratings without a manual link step. Identical fingerprint formula and video-id derivation to Bun, so existing rows survive the cross-backend cutover. `services/scan_state.rs` is a process-wide actor (`RwLock<ScanSnapshot>` + `tokio::sync::broadcast`); both `libraryScanUpdated` and `libraryScanProgress` subscriptions seed from `current()` and forward live broadcasts. `services/omdb.rs` makes every failure path observable via `tracing::warn!` — the Bun version's bare `catch {}` was the explicit anti-pattern Invariant §14 prohibits.

**Files:** `server-rust/src/services/library_scanner.rs`, `server-rust/src/services/scan_state.rs`, `server-rust/src/services/omdb.rs`
**Related Commit.md entry:** `874c246`

---

## 2026-05-01 — PR #43 — Tauri MVP scaffolding (Linux only)

First MVP iteration of Step 3 of the Bun → Rust + Tauri migration. Wraps the Rust server (`xstream-server`) and React/Relay client into a single Tauri desktop binary. Server runs in-process on a free `127.0.0.1:<port>`; webview reaches it over HTTP (not Tauri IPC) so the length-prefixed `/stream/:job_id` binary protocol stays intact. Adds `bun run tauri:dev` and `bun run tauri:build`. Bundles **portable jellyfin-ffmpeg** under `src-tauri/resources/ffmpeg/linux-x64/` via a new `setup-ffmpeg --target=tauri-bundle` flag, with SHA256 pins added to the manifest for the new portable assets. Locked decisions: Linux-only first (mac/Windows follow-up), portable ffmpeg bundled under `src-tauri/resources/`, in-process loopback server.

**Files:** `src-tauri/`, `scripts/setup-ffmpeg.ts`, `scripts/ffmpeg-manifest.json`, `docs/migrations/rust-rewrite/Plan/03-Tauri-Packaging.md`
**Related Commit.md entry:** `ae702ab`

---

## 2026-05-01 — PR #42 — drop landing/, architect splitting + Commit.md sync

Two unrelated bits of housekeeping bundled together. (1) Deleted unused 1,769-line vanilla-HTML mockup at `landing/index.html`. (2) Two architect directives: **Proactive splitting during grooming** — `groom-knowledge-base` flags `*.md` files > 200 lines and topic-folders with > 8 sibling files; architect handles the actual split (file-splits along `## H2` seams, folder-splits by theme), with a carve-out that `docs/migrations/**` stays with `migrations-lead`. **Commit-based sync via `docs/Commit.md`** — append-only checked-in log of doc updates tied to git commits, newest entry on top, terminated by a bare `---` divider so `sed -n '1,/^---$/p' docs/Commit.md` returns just the latest entry without scanning the whole file. On every invocation the architect compares the recorded SHA to HEAD; on divergence it runs `git merge-base` for ancestry, scans up to 20 intervening commits, and prepends a new entry. Failure modes baked in: first-run, non-ancestor SHA (feature branches / linked worktrees), > 20-commit drift cap. **This PR is the origin of the `Commit.md` sync protocol that History.md is now paired with (see #54).**

**Files:** `landing/` (deleted), `.claude/skills/groom-knowledge-base/SKILL.md`, `.claude/agents/architect.md`, `docs/Commit.md` (new)
**Related Commit.md entry:** `8534bc2` (the bootstrap entry)

---

## 2026-04-30 — PR #41 — Step 2: Rust streaming port (chunker + ffmpeg_pool + /stream)

Step 2 of the Bun → Rust + Tauri migration ports the streaming layer behind a `useRustStreaming` flag (independent of `useRustGraphQL`). With both flags on, the entire product runs on the Rust binary at `localhost:3002`. Seven commits, ~5500 lines new Rust + ~50 lines client glue: DB writes + cache index + job_restore (structural `(video_id, resolution, start_s, end_s)` lookup as a forward-constraint for peer sharing — decoupled from job-id); `ffmpeg_path` (manifest-pinned binary resolver); `config` + `ffmpeg_file` (AppConfig, ResolutionProfile, HwAccelConfig, ffprobe via tokio + JSON parse, `build_encode_argv` for software / VAAPI normal / VAAPI sw-pad / VAAPI HDR); `hw_accel` (synthetic VAAPI probe via tokio + 10s timeout); `chunker` + `ffmpeg_pool` + `/stream` route + `start_transcode`. Pull-based streaming via `axum::Body::from_stream` over an `mpsc::Receiver` — one segment per consumer demand, demand-driven with no internal loop or hidden queue, exactly as the Rust target shape was designed (#26).

**Files:** `server-rust/src/services/{chunker,ffmpeg_pool,ffmpeg_file,ffmpeg_path,hw_accel,cache_index,job_restore}.rs`, `server-rust/src/routes/stream.rs`, `server-rust/src/db/queries/{jobs,segments}.rs`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `8534bc2`'s parent_

---

## 2026-04-29 — PR #40 — lock down Bun behavior contract via tests pre-port

Test-coverage push that turns the Bun server's behavior into an explicit contract — the Rust port (or its translated test suite) has to satisfy this surface or we know we've regressed. **122 pass, 8 skip, 0 fail across 22 files** (up from 79/1/11 at branch base) in ~1.4 s. Bar throughout: integration tests of behavior not implementation; real DB / `jobStore` / `ffmpegPool` / `chunker` / `graphql-yoga` / `ReadableStream({ pull })`; boundaries (ffmpeg subprocess, real movies, the wall clock) mocked only when keeping them real causes flakiness or unacceptable runtime. Span/event assertions via `drainCapturedSpans()` — never log-string matching. Production timeouts never bumped. This PR is what made *tests travel with the port* a load-bearing rule.

**Files:** `server/src/db/queries/__tests__/`, `server/src/graphql/__tests__/`, `server/src/services/__tests__/`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `d6fc3a7`_

---

## 2026-04-29 — PR #39 — Step 1: Rust GraphQL + observability service, side-by-side with Bun

Step 1 of the Rust + Tauri migration. New `useRustGraphQL` flag (default OFF) routes Relay to a Rust async-graphql server on `localhost:3002`; non-player pages work, player page is knowingly broken (Step 2 ships `/stream/:job_id` and the chunker). SDL byte-equivalent at the structural level via `scripts/check-sdl-parity.ts` — 27 types match. Sharing forward-constraints baked in from day one: `RequestContext` middleware with empty `peer_node_id` / `share_grant` slots; W3C `traceparent` extracted via `opentelemetry-http` and set as the parent of the per-request `http.request` tracing span (distributed traces survive the boundary); two-DB split design preserved (Step 1 only opens the cache DB).

**Files:** `server-rust/src/{db.rs,relay.rs,request_context.rs,telemetry.rs}`, `server-rust/src/graphql/`, `scripts/check-sdl-parity.ts`, `client/src/config/{flagRegistry.ts,rustOrigin.ts}`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `e953e25`_

---

## 2026-04-29 — PR #38 — Tauri packaging-internals deep-dive

Pedagogical deep-dive on Tauri packaging that parallels the Electron-interim companion doc. Walks the build pipeline, installed-app layout per OS, `tauri-plugin-updater` mechanics, and Electron-derived mental-model corrections (no bundled Chromium, no sidecar, full-bundle updates, Ed25519 update keys instead of the OS code-sign chain). §9 folds in the open release risks from `Architecture-Review-2026-04-28.md` so a reader sees the architecture-fit picture without bouncing through every layer ref. `08-Tauri-Packaging.md` stays the prescriptive spec ("what to configure"); `09` explains *why* and *how*. INDEX row added so retrieval splits correctly: implementing engineers asking "what do I configure" land on `08`; architects asking "how does Tauri packaging actually work" land on `09`.

**Files:** `docs/migrations/rust-rewrite/09-Tauri-Packaging-Internals.md`, `docs/INDEX.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `4bdc38e`_

---

## 2026-04-29 — PR #37 — Rust+Tauri release-journey playbook + migrations-lead subagent

Adds `docs/migrations/rust-rewrite/Plan/` — execution playbook for the Rust+Tauri migration. README + four step docs (GraphQL+Observability → Streaming → Tauri packaging → Release plumbing). Adds `Open-Questions.md` consolidating ~30 pre-release open questions tagged `[decide]` / `[investigate]` / `[defer]` so an implementing agent can scan for what blocks their step. Adds `.claude/agents/migrations-lead.md` — RAG curator for `docs/migrations/`, peer to `architect`. Defers to architect on new tech-choice evaluations and to devops on operational release plumbing. The landed migration tree at `00–08-*.md` covers the *layer references* (what each layer must become and never foreclose); what was missing was (a) the execution playbook and (b) a single home for cross-step open questions.

**Files:** `docs/migrations/rust-rewrite/Plan/`, `.claude/agents/migrations-lead.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `63c1083`_

---

## 2026-04-28 — PR #36 — interim desktop-shell compatibility analysis (Electron, later replaced)

Two-commit analysis. First trade-off comparison of Electron / Tauri+Bun-sidecar / Electrobun for shipping the current Bun+React architecture as a desktop app *before* the Rust+Tauri port lands. After the user picked Electron + Bun-as-sidecar, second commit rewrote `00-Interim-Desktop-Shell.md` as Electron-decided (resolved deferred questions on HW-accel coverage, Bun packaging via `bun build --compile`, library-picker UX, static-asset serving, update-signing keys, channel rollout) and added two companion docs: `02-Electron-Packaging-Internals.md` (deep dive on `electron-builder`, asar, `extraResources`, installed bundle layout per OS, Squirrel.Mac/NSIS-web bsdiff/AppImage zsync update mechanics) and `03-Shipping-FFmpeg.md` (manifest pinning, jellyfin-ffmpeg under Electron). **Now historical:** PR #52 retired the Electron-interim path entirely once the Rust+Tauri migration shipped; the Electron docs were replaced with Tauri reality.

**Files:** `docs/architecture/Deployment/00-Interim-Desktop-Shell.md`, `docs/architecture/Deployment/01-Decisions.md`, `docs/architecture/Deployment/02-Electron-Packaging-Internals.md`, `docs/architecture/Deployment/03-Shipping-FFmpeg.md` (all later replaced)
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `8c4e9f8`_

---

## 2026-04-28 — PR #35 — parallel mutation+init + small first chunk for fast start

Cuts post-seek latency on 4K and lays groundwork for a future cold-start win. Three perf changes: (1) parallelise `startTranscode` mutation with `buffer.init()` so ffmpeg cold-start overlaps MSE bootstrap; (2) `FIRST_CHUNK_DURATION_S = 30` shrinks the chunk window for mid-file seeks (RAF prefetch trips immediately); (3) lower 4K `STARTUP_BUFFER_S` 10 → 5 s. Fixes-along-the-way: removed redundant `prefetchFired` reset in `startChunkSeries` (introduced new invariant rule 13: caller-owned transition state). Investigation infrastructure added for a VAAPI HDR 4K `-ss 0 -t SHORT` silent failure discovered during verification — `transcode_silent_failure` span event when ffmpeg exits cleanly with zero segments, plus a dev flag `flag.devForceShortChunkAtZero` to reproduce. The temporary workaround (force `CHUNK_DURATION_S` whenever `startS === 0`) is explicitly scaffolding — the plan is to find the root cause and remove it. **This PR is what codified the "Fix root causes, not symptoms" engineering principle that lives at `code-style/Principles/00-Fix-Root-Causes.md` (#54).**

**Files:** `client/src/services/PlaybackController.ts`, `client/src/services/playbackConfig.ts`, `server-rust/src/services/chunker.rs`, `docs/code-style/Invariants/00-Never-Violate.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `d505670`_

---

## 2026-04-28 — PR #32 — Rust + Tauri migration documentation set

Authoritative documentation set ahead of the Bun → Rust + Tauri migration, authored in batches. Decisions locked: every layer doc covers BOTH the current Bun reality AND the Rust target shape, with `file:line` citations into the current source. Crate picks decisive (axum, async-graphql, rusqlite-bundled, tracing + opentelemetry-otlp, notify, walkdir, reqwest, sha1, serde, tokio). Forward constraints for peer-sharing baked into each layer doc so the Rust port doesn't foreclose multi-peer streaming. All 8 layer docs landed: streaming, observability, GraphQL, scan, database, file-handling, Bun-to-Rust migration tactics, Tauri packaging.

**Files:** `docs/migrations/rust-rewrite/00-08-*.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `8dae520`_

---

## 2026-04-27 — PR #34 — drop chunk-boundary on seek + in-band SPS/PPS for MSE

Five-commit follow-up after #30 that together makes mid-chunk seek and Chromium MSE decode actually work end-to-end on 4K HDR sources. Per-chunk `timestampOffset` + `edts` strip fixed mid-chunk seek wedge (chunk PTS landed at 0 not source-time, muxer wrote `elst` empty edit). Then dropped the chunk-boundary constraint entirely: pre-fix evidence showed mid-chunk seek wall-clock 16–60 s because ffmpeg encodes segments in order — server-side `?from=K` dropped them on the wire but couldn't avoid the encode work. Post-fix: ffmpeg now spawns at `-ss seekTime` so segment 0 *is* what the user wants; seek-to-ready dropped to 4.4 s. Trade-off accepted: re-seeking to the same exact second misses cache; interactive seek wins. SPS/PPS forced in-band per segment via `-bsf:v dump_extra=freq=keyframe` because Chromium's MSE demuxer rejects out-of-band parameter sets across segments.

**Files:** `client/src/services/{ChunkPipeline,BufferManager,PlaybackController}.ts`, `server/src/services/chunker.ts` (later ported in #41)
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `68a936d`_

---

## 2026-04-27 — PR #33 — extract ffmpegPool to free cap slots at SIGTERM

Trace `1ac6637e` showed rapid seeks failing with `CAPACITY_EXHAUSTED` because dying ffmpegs still counted toward the 3-slot cap (software 4K flush after SIGTERM takes 20+ s; during that window every new chunk request is starved). Extracted ffmpeg process lifecycle + cap into `ffmpegPool.ts`. Cap formula now excludes dying jobs so SIGTERM frees the slot immediately. Bonus: pool dispatches `onKilled` xor `onError` xor `onComplete` exactly once, structurally fixing a latent cascade-after-kill bug (a SIGTERM mid-VAAPI used to re-spawn software ffmpeg for a disconnected user). Added 2 s SIGKILL escalation per kill so the dying-zombie window is bounded. Telemetry: `concurrency_cap_reached` event gains `cap.dying_count` + `cap.dying_ids_json` so future traces distinguish "cap genuinely full" from "cap held by zombies".

**Files:** `server/src/services/ffmpegPool.ts` (later ported in #41), `server/src/services/chunker.ts`, `docs/architecture/Streaming/06-FfmpegPool.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `f7230d2`_

---

## 2026-04-27 — PR #30 — seek spinner race + post-seek startup gate + user-pause buffer release

Two-round PR. Round 1: spinner appeared late after a seek (flashed off, re-shown ~2 s later via StallTracker debounce); `waitForStartupBuffer` compared absolute `bufferedEnd` against a small target so first segment trivially passed and `video.play()` fired with only ~2 s ahead; user-pause buffer would grow unbounded because `timeupdate` is silent while paused (added 1s setInterval poller + chunk N+1 prefetch with suspended lookahead). Round 2: clicking at 720s used to snap the playhead back to 600s (chunk boundary) — `handleSeeking` now passes `seekTime` (user intent) to `buf.seek` instead of `snapTime`, while the chunk REQUEST still uses `snapTime` so the server cache key stays aligned. Successive-seeks crash fixed via `const reader = this.reader` snapshot per iteration + synchronous `chunkEnd = 0` reset. Single-SourceBuffer ADR documented: xstream uses one SourceBuffer per session, not per-chunk rotation. Server max-encode budget added as a safety timeout.

**Files:** `client/src/services/{StreamingService,BufferManager,PlaybackController}.ts`, `docs/architecture/Streaming/05-Single-SourceBuffer-ADR.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `6bd0050`_

---

## 2026-04-26 — PR #29 — browse + inspect-seq wrapper subagents

Adds `.claude/agents/browse.md` and `.claude/agents/inspect-seq.md` — thin subagents that wrap the `browser` and `seq` skills. Goal: **context isolation**. Verbose Playwright snapshots and Seq event JSON stay in the subagent's window; the main agent only sees a focused report. Both agents read their respective `SKILL.md` on every invocation as the canonical playbook (no procedure duplication, no drift). Both include the `Agent` tool so they can escalate genuinely ambiguous architectural questions to `architect` directly rather than bouncing back to the caller. Naming is verb-form (`browse`, `inspect-seq`) so they read as actions and don't collide verbally with the underlying skills.

**Files:** `.claude/agents/browse.md`, `.claude/agents/inspect-seq.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `4391d49`_

---

## 2026-04-26 — PR #28 — recoverable-error stack: inflight fix + typed errors + demand-driven streaming + MSE recovery

Combined re-land of #25 + #26 after the branch/PR policy in #27 settled. Six commits, three distinct layers of recovery, two new architectural invariants. (1) Inflight-leak fix — trace `bf25cb77…` showed a 4k session dying on chunk 4 because `startTranscodeJob`'s `job_restored_from_db` path and `runFfmpeg`'s `probe_error` catch both added to `inflightJobIds` without a paired delete. (2) Typed `StartTranscodeResult = TranscodeJob | PlaybackError` union with `PlaybackErrorCode` enum (CAPACITY_EXHAUSTED, VIDEO_NOT_FOUND, PROBE_FAILED, ENCODE_FAILED, MSE_DETACHED, INTERNAL); chunker returns a discriminated `StartJobResult` instead of throwing for known cases; mid-job failures populate `ActiveJob.errorCode` *before* `notifySubscribers`. (3) Demand-driven pull streaming — switched `handleStream` from `new ReadableStream({ start })` (push) to `new ReadableStream({ pull })` (one segment per consumer `read()`, TCP backpressure flows naturally, shape translates 1:1 to `axum::Body::from_stream`). (4) Typed `MSE_DETACHED` recovery — Chrome's cumulative-byte watchdog detaches our SourceBuffer once the MSE budget exceeded; new `onMseDetached` callback rebuilds MediaSource + BufferManager + ChunkPipeline at floor-aligned chunk boundary, 3 recreates per session.

**Files:** `server/src/{routes/stream.ts,services/chunker.ts,graphql/}` (later ported in #41), `client/src/services/{BufferManager,PlaybackController,ChunkPipeline}.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `d2d53a8`_

---

## 2026-04-24 — PR #27 — codify branch/PR policy, return feature work to review branches

Adds Branch & PR policy section to CLAUDE.md. **Main stays healthy** — never merge a PR into main without explicit user sign-off following review + test (green CI is necessary, not sufficient). **Clarify ambiguous "merge" asks before touching GitHub** — "merge the PR" could mean land into main, combine multiple PRs into one, or merge a local branch; all three read similarly but have very different consequences. **One PR per session** — continue on the open PR rather than spawning new ones; ask before branching a second one. Returned recent feature work (`feat/playback-error-contract`, `feat/demand-driven-streaming`) to branches for proper review after they had been pushed direct-to-main; tree restored to pre-feature-work state.

**Files:** `CLAUDE.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `d21436c`_

---

## 2026-04-24 — PR #26 — demand-driven pull + MSE-detach recovery (later re-landed in #28)

Stacked on #25. Switched `stream.ts::handleStream` from push-based to demand-driven pull: one segment per consumer `read()`, TCP backpressure flows through `pull` naturally, no hidden queues between disk and client, same loop body serves live-encoded and DB-restored jobs uniformly. The shape translates 1:1 to `axum::Body::from_stream` over a `tokio_stream::Stream` in the Rust rewrite. Closed the chunk-handover bloat hole (trace `e699c0ae…`): `ChunkPipeline.drainAndDispatch` previously appended every queued lookahead segment in a tight loop at promotion (200–400 MB into MSE in 1–2 s on 4k); now awaits `BufferManager.waitIfPaused()` between iterations. Added typed `MSE_DETACHED` recovery for Chrome's cumulative-byte watchdog detach. **This PR was returned to a feature branch via #27 and re-landed via #28.**

**Files:** `server/src/routes/stream.ts` (later ported in #41), `client/src/services/{BufferManager,ChunkPipeline,PlaybackController}.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `4dd6216`_

---

## 2026-04-24 — PR #25 — typed PlaybackError contract + orchestration retry (later re-landed in #28)

Fix for trace `bf25cb77…` (inflight leak — 4k playback dying on chunk 4, two `startTranscodeJob` exit paths added an id to `inflightJobIds` but never released it). Introduced typed error contract on `startTranscode` — `union StartTranscodeResult = TranscodeJob | PlaybackError` with `code`, `retryable`, `retryAfterMs`. Resolver wraps only genuinely unexpected failures as `INTERNAL`. Added orchestration-level retry policy in `PlaybackController.requestChunk` mirroring `BufferManager.appendBuffer`'s 3-tier shape; honours server's `retryAfterMs` hint, emits `playback.recovery_attempt` span events, sets `recovery.outcome: succeeded | gave_up | non_retryable`. `playback.stalled` intentionally NOT opened for cap retries — backpressure is healthy, not a freeze. **This PR was returned to a feature branch via #27 and re-landed via #28.**

**Files:** `server/src/services/chunker.ts` (later ported in #41), `client/src/services/PlaybackController.ts`, `server/schema.graphql`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `9000e00`_

---

## 2026-04-24 — PR #24 — vendor-misc cadence-grouped chunks + extract architect retrieval index

Two related changes. (1) Bundle perf: broke 396 KB `vendor-misc` catch-all into targeted Rsbuild cache groups by upgrade cadence (`vendor-otel`, `vendor-griffel`, `vendor-nova`, `vendor-router`; folded `graphql-ws` into `vendor-relay`). `vendor-misc` drops to 46 KB (88% reduction); single dep bump no longer busts the whole vendor cache. Tightened the `react` cache-group regex from `[/+]react@` to `[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/` — old pattern was mis-routing `@nova/react` into `vendor-react`. (2) Process gap: extracted architect retrieval index from `architect.md` into `docs/INDEX.md` so adding the Bundle-Chunks doc could land alongside its index row in the same PR. Established the principle that retrieval state lives in `docs/`, not in the agent prompt.

**Files:** `client/rsbuild.config.ts`, `docs/client/Bundle-Chunks/`, `docs/INDEX.md`, `.claude/agents/architect.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `f5545f9`_

---

## 2026-04-24 — PR #21 — chunk-handover pipeline + observability + HDR fix

Started as a single instrumentation span around chunk handover and grew, trace-by-trace, into a structural fix plus tooling work. Added `chunk.first_segment_append` span; data showed handover latency was hitting 60s+ on 4k, so bumped prefetch lead 60 → 90 s. Bump exposed a server-side `orphan_no_connection` race — prefetched job was being killed before client opened its fetch. Fixed structurally with `ChunkPipeline` (lookahead fetch opens at prefetch time, server's `connections > 0` is satisfied immediately, 30 s safety threshold keeps its meaning). Layered in `PlaybackTicker` (one RAF for all playback timers) and `PlaybackTimeline` (predictions surfaced as span attributes + drift events). Side fixes: HDR green-bar `pad_vaapi` artifact (tag VAAPI output bt709) and a new `seq` skill so agents query Seq via HTTP API instead of driving the UI.

**Files:** `client/src/services/{ChunkPipeline,PlaybackController,PlaybackTicker,PlaybackTimeline}.ts`, `server/src/services/chunker.ts`, `.claude/skills/seq/`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `bf145f7`_

---

## 2026-04-23 — PR #23 — RAG maturity: SUMMARY.md + notify-architect protocol + Groom skill

Three capabilities that turn the knowledge base from "architect reads on demand" into a shared, self-maintaining baseline. (1) `docs/SUMMARY.md` (new, 65 lines) — single orientation file every agent reads at session start (what-is-xstream, stack, top-7 invariants, streaming pipeline paragraph, code-style headlines, tree nav). Owned by architect; regenerated mechanically by groom. (2) Notify-architect protocol — CLAUDE.md + every modifying skill's SKILL.md get a closeout: before marking a code-/docs-modifying task complete, spawn architect with a short change summary; architect decides what (if anything) needs updating and does so directly. Trivial changes explicitly logged as "no docs impact". (3) `/groom-knowledge-base` skill — mechanical hygiene pass: verifies folder READMEs list every sibling, detects stale file paths, reconciles code↔doc literal values (code wins), reports undocumented exported symbols, regenerates SUMMARY.md, prunes the architect index. Builds on #22's RAG tree.

**Files:** `docs/SUMMARY.md` (new), `CLAUDE.md`, `.claude/skills/groom-knowledge-base/` (new), 9 modifying SKILL.md files
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `78c695b`_

---

## 2026-04-23 — PR #22 — Restructure docs/ into RAG knowledge base + rewrite architect agent

Reshaped `docs/` from flat `NN-PascalCase` under `{client,server,design,product}/` into a nested **super-domain / concept-folder** hierarchy with a `README.md` TOC in every folder and a single top-level index at `docs/README.md`. Rewrote `.claude/agents/architect.md` as a slim retriever (96 lines, was 140) that navigates this tree via an index table, reads the narrowest relevant file per question, and curates updates from other agents into the right place. Moved convention content out of `CLAUDE.md` into `docs/code-style/` — Invariants, Naming, Client/Server Conventions, Anti-Patterns each get their own folder. The old architect forced reading 7 docs (~1,480 lines) on every invocation regardless of topic; new flow is a local RAG: one file per question, path handed back to caller. Typical questions now read ~1 file instead of 7.

**Files:** `docs/` (full restructure), `.claude/agents/architect.md` (rewrite), `CLAUDE.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `f020cdb`_

---

## 2026-04-22 — PR #20 — split client services (bufferConfig + playbackConfig + StallTracker)

Two changes. (1) Bundle fix: pulled `DEFAULT_BUFFER_CONFIG` out of `services/BufferManager.ts` into a side-effect-free `services/bufferConfig.ts`. The eagerly-loaded `config/featureFlags.ts` was importing a runtime value from `BufferManager.ts`, which dragged the whole class (plus module-level logger/tracer init) into the index bundle even though `VideoPlayer` is lazy-loaded. **`index.*.js` drops 52.4 → 43.3 kB** (gzip 15.3 → 13.0); `BufferManager` lands only in `async/VideoPlayer.*.js` as intended. (2) Responsibility split: moved `PlaybackController` tuning constants + `PlaybackStatus` type into `services/playbackConfig.ts`; extracted `StallTracker.ts` to own the `playback.stalled` span + spinner-debounce lifecycle. Controller shrinks ~100 lines.

**Files:** `client/src/services/{bufferConfig,playbackConfig,StallTracker,BufferManager,PlaybackController}.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `fab20b5`_

---

## 2026-04-22 — PR #19 — slim CLAUDE.md, add architect/devops subagents, namespace docs

**CLAUDE.md: 1026 → 173 lines (83% reduction).** Domain knowledge pushed into specialist subagents/skills so the main context stays lean. CLAUDE.md now holds invariants, what-not-to-do, quality-tooling rules, and a routing table. New subagents: `architect` (architecture + tech-choice), `devops` (dev flow + release + backend ops debugging). New skills: `browser` (Playwright MCP — self-maintaining "Known Quirks" section), `feature-flags` (registry + docs-sync rule). Docs namespaced: `NN-PascalCase.md` under `docs/{client,server,design,product}/`. Cross-cutting topics live at `docs/NN-*.md`. Policy hooks in `.claude/settings.json`: `UserPromptSubmit` reminds the agent to consult architect before non-trivial work; `PostToolUse` reminds to update `architect.md` when a change shifts architecture.

**Files:** `CLAUDE.md` (slim), `.claude/agents/{architect,devops}.md` (new), `.claude/skills/{browser,feature-flags}/`, `docs/` (namespacing), `.claude/settings.json`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `ee4a1ba`_

---

## 2026-04-22 — PR #18 — HW-accelerated transcoding (jellyfin-ffmpeg) + buffering/encode-rate telemetry

Two tightly-linked changes. (1) Telemetry — new `playback.stalled` span on the HTMLMediaElement `waiting` event (the existing `buffer.halt` covered the *opposite* case, never the actual "video froze because buffer is empty"); rename `buffer.halt` → `buffer.backpressure` to keep semantics distinguishable; re-parent `transcode.job` on `job.resolve` (was parented on the 34 ms GraphQL HTTP POST, so a 5-minute child appeared under a 34 ms parent in the trace tree); periodic `transcode_progress` events on `transcode.job` via fluent-ffmpeg's progress callback (throttled to ~10s) carrying fps/kbps/timemark/percent. (2) Hardware acceleration — replaced 2018 `@ffmpeg-installer/ffmpeg` static build (couldn't drive modern VAAPI) with per-platform vendored **jellyfin-ffmpeg** binary downloaded via `bun run setup-ffmpeg`. The telemetry is what let us *see* that software 4K encode was stalling, which motivated the HW path.

**Files:** `server/src/services/chunker.ts`, `client/src/services/StallTracker.ts`, `scripts/setup-ffmpeg.ts`, `scripts/ffmpeg-manifest.json`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `e05cf38`_

---

## 2026-04-21 — PR #16 — buffer.halt + transcode.request spans

Closed two gaps in streaming-pipeline observability without adding noise. `buffer.halt` opens in `BufferManager.checkForwardBuffer` when `bufferedAhead` crosses `FORWARD_TARGET_S` (20s) and we pause the append loop; closes when it drains back below `RESUME_THRESHOLD_S` (15s). Parented under `playback.session` so halts that span chunk boundaries are still measured end-to-end. `transcode.request` wraps `startTranscodeChunk` in `PlaybackController.requestChunk` so the automatic `graphql.request` HTTP span nests underneath; `chunk.is_prefetch` attribute separates click-play / seek / resolution-switch requests from 60s-lookahead prefetches. Enriched `chunk.stream` span with `chunk.bytes_streamed` + `chunk.segments_received` end-attributes so per-chunk bandwidth is one span away.

**Files:** `client/src/services/{BufferManager,PlaybackController}.ts`, `docs/architecture/observability.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `a920c5d`_

---

## 2026-04-21 — PR #15 — per-scenario streaming timeline diagrams

Split streaming data-flow docs into four sequence diagrams — initial playback, back-pressure, seek, resolution switch — authored in Mermaid under `docs/diagrams/` with rendered PNG screenshots committed alongside. Restructured `## Data Flow: Playback` so each scenario has its own `###` subsection with screenshot embedded, `.mmd` source linked, and prose overview. Added `!docs/diagrams/*.png` exception to the repo-wide `*.png` ignore so diagram images render on GitHub.

**Files:** `docs/diagrams/streaming-0[1-4]-*.mmd`, `docs/diagrams/streaming-0[1-4]-*.png`, `docs/architecture.md`, `.gitignore`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `c7342b6`_

---

## 2026-04-21 — PR #14 — extract PlaybackController service

Extracted the ~880-line `useChunkedPlayback` hook's orchestration into a new plain-TS `PlaybackController` class under `client/src/services/`. Hook shrinks to a thin React bridge (~160 lines) holding only Relay mutation plumbing and status/error `useState`. The 15+ refs (buffer, activeStream, sessionSpan, 3 RAF handles, seek dedup flags) became private class fields; the duplicated startup-buffer polling pattern collapsed into a single `waitForStartupBuffer()`. Old hook had ~5 distinct responsibilities (session lifecycle, chunk streaming, chunk scheduling + prefetch, seeking, buffering detection, resolution switching) wired together with refs — hard to scan, hard to extend. Moving state into a class gives one source of truth (`this.status`) and a single `attachVideoListeners()` replacing two `useEffect`s. Behaviour unchanged; controller has zero Relay imports (hook wraps `useMutation` commits into domain-shaped callables).

**Files:** `client/src/services/PlaybackController.ts` (new), `client/src/hooks/useChunkedPlayback.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `f1f1bce`_

---

## 2026-04-20 — PR #13 — OpenTelemetry structured logs + distributed traces (client → server)

Server OTel bootstrap (`BasicTracerProvider` + `LoggerProvider` reading `OTEL_EXPORTER_OTLP_*` env; `W3CTraceContextPropagator` registered globally so incoming `traceparent` headers from browser are extracted and server spans become children of the client trace). Client OTel bootstrap (`WebTracerProvider` + `LoggerProvider`; `FetchInstrumentation` auto-patches `window.fetch` so all Relay GraphQL queries and StreamingService stream requests carry `traceparent` headers — no changes to Relay environment or StreamingService needed). Instrumented spans: `stream.request`, `transcode.job`, `library.scan`. Structured logs via `getOtelLogger()` / `getClientLogger()`. Seq infrastructure: `scripts/seq-{start,stop}.sh` manages local Docker container; `bun seq:start` / `bun seq:stop` added. Dev proxy in Rsbuild forwards `/ingest/otlp` → `http://localhost:5341` to avoid CORS; credentials never exposed in browser bundle.

**Files:** `server/src/telemetry.ts`, `client/src/telemetry.ts`, `scripts/seq-*.sh`, `client/rsbuild.config.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `9df5187`_

---

## 2026-04-16 — PR #12 — chunked streaming + connection-aware job lifecycle + dev log overlay

Client-driven chunked transcoding — instead of encoding the whole video on play, the client fires 5-minute chunk jobs (`startTranscode` with `startTimeSeconds`/`endTimeSeconds`); next chunk is prefetched 60s before the current one ends. Connection-aware job lifecycle — `ActiveJob.connections` tracks live `/stream/:jobId` consumers; when last connection drops (or the 90-second idle timeout fires), ffmpeg is SIGTERMed for that specific job. Background buffer resolution switch — switching resolution while playing creates a second off-screen `BufferManager`/`MediaSource`, buffers `STARTUP_BUFFER_S[res]` seconds, then atomically swaps `video.src`. Seek flushes SourceBuffer and starts a new chunk at the snapped chunk boundary (segment reuse deferred). Startup buffer per resolution (`video.play()` withheld until buffer holds 2 s for 240p to 10 s for 4K). LRU disk eviction (`diskCache.ts` evicts oldest completed jobs when cache exceeds 20 GB).

**Files:** `server/src/services/{chunker,jobStore,diskCache}.ts`, `client/src/services/{StreamingService,BufferManager}.ts`, `client/src/components/dev-log-overlay/`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `7d67f06`_

---

## 2026-04-12 — PR #11 — Griffel migration + URL-driven pane state + Library UX

CSS → Griffel migration: deleted all per-component `.css` files; every component now has a colocated `ComponentName.styles.ts`. `shared.css` reduced to global resets and CSS variable declarations only; `tokens.ts` is the single source for design values. URL-driven RE-LINK mode (`?linking=true`) so Back exits without closing the pane; switching films auto-resets it. Deep-link auto-expand for `/?pane=film-detail&filmId=<id>`. Profile menu → filtered Library (`/library?profile=<id>`); Library `?profile=` read on mount. Library scroll fade. `IconEdit` from Figma replaces `IconPencil`.

**Files:** Multiple `*.styles.ts` files, `client/src/styles/`, `client/src/pages/{Profiles,Library}/`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `c1d4768`_

---

## 2026-04-12 — PR #8 — Moran design system implementation

Full Moran design implementation across the client: design tokens (`styles/tokens.ts`), AppShell CSS grid (sidebar 220px + header 56px + main), Sidebar with Nova eventing toggle, AppHeader with `actions` slot rendered by pages, Dashboard page with hero slideshow + ProfileRow + ProfileExplorer + FilmDetailPane + URL-driven pane state, Library page with PosterCard grid + LibraryFilterBar + LibraryChips, Player page Griffel layout + inactivity hide (3s) + PlayerSidebar, Watchlist + Settings + Feedback pages. Server side: `video_metadata`, `watchlist_items`, `user_settings` tables; OMDb service; `matchVideo` / `unmatchVideo` mutations.

**Files:** `client/src/{pages,components,styles,services}/`, `server/src/{db,services,graphql}/`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `16f0e3f`_

---

## 2026-04-11 — PR #10 — interactions, navigation polish, Library overhaul (design lab)

Sidebar user row opens a popover profile menu (profiles list, Go to home, Account settings, Sign out). Sign out → confirmation dialog → full-screen `/goodbye` farewell page (auto-redirects home after 4s). Settings page reads `?section=<id>` for deep-linking. New `useSplitResize` hook for drag-to-resize on Profiles + Library split-body layouts. Pure-CSS tooltips (`[data-tip]` attribute). ErrorBoundary prod screen rewritten as a customer help page. Library overhaul: removed per-profile sections; profile filter chips below filter bar; list view fully implemented with column-aligned rows. Watchlist removed. Dashboard breadcrumb removed.

**Files:** `design/src/pages/`, `design/src/components/`, `design/src/hooks/useSplitResize.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `d44747a`_

---

## 2026-04-11 — PR #9 — design lab: 404 + ErrorBoundary + tooltips + DevTools + split panes

NotFound page (atmospheric grain + radial red-black gradient, ghost "404" in Bebas Neue, Go-back + Browse-library actions). ErrorBoundary wraps full app above `<BrowserRouter>` — dev mode with full stack trace + copy-to-clipboard, prod mode with friendly "Something went wrong". Global loading bar (3px fixed, three-phase state machine `loading → completing → idle`, `transform: scaleX()` no-reflow animation, `LoadingBarProvider` counts active loaders). DevTools kill switch — `DevPanel` floating panel that force-throws render errors from registered targets; correctly handles React 18 concurrent-mode retry. Resizable split panes via `useSplitResize` hook.

**Files:** `design/src/pages/{NotFound,ErrorBoundary}/`, `design/src/components/{LoadingBar,DevPanel}/`, `design/src/hooks/useSplitResize.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `b395b2c`_

---

## 2026-04-11 — PR #7 — design lab: shimmer skeleton loading states

`useSimulatedLoad` hook (700ms default) simulates Relay Suspense delay. `.skeleton` utility class + `@keyframes shimmer` in `shared.css`. Per-page skeletons mirror the geometry of the real page to prevent layout shift (Profiles/Dashboard, Library, Watchlist, Settings).

**Files:** `design/src/hooks/useSimulatedLoad.ts`, `design/src/components/skeletons/`, `design/src/styles/shared.css`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `78d3979`_

---

## 2026-04-11 — PR #6 — design lab: UI spec + implement-design skill + annotated source

Authoritative UI spec for the Moran client UI authored as a runnable React prototype using mock data. `design/README.md` covers page layouts, pane routing scheme, player state machine, inactivity hide, visual details, component-to-production mapping. `docs/ui-design-spec.md` is the implementation reference for the main repo. New `/implement-design` skill — step-by-step guide for porting design lab pages to production with data-layer mapping tables, UX invariants checklist, visual detail verification list. Three pages prototyped: Profiles (pane routing via `useSearchParams`), Library (poster grid, search, pane), Player (idle → loading → playing state machine, 3s inactivity hide, `navigate(-1)` back).

**Files:** `design/`, `docs/ui-design-spec.md`, `.claude/commands/implement-design.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `cbdc5f4`_

---

## 2026-04-11 — PR #5 — restructure client (snake_case dirs + ~ alias + Rsbuild)

Moved each component into its own `snake_case` subdirectory under `components/` (e.g. `VideoPlayer` → `video_player/`) so the flat file list doesn't grow unbounded; colocated `.events.ts` and `Async` variants share the same directory. Introduced `~` → `src/` path alias in tsconfig, rsbuild, and Storybook. Added ESLint `no-restricted-imports` rule banning `../` to enforce alias usage at the linter level. Replaced `vite.config.ts` with `rsbuild.config.ts` (Rsbuild was already powering Storybook); extracted unit-test config into `vitest.config.ts`; per-chunk gzip size reporting on every production build.

**Files:** `client/src/components/`, `client/{tsconfig,rsbuild.config,vitest.config}.ts`, `client/.eslintrc`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `eba16fe`_

---

## 2026-04-11 — PR #4 — graceful shutdown on SIGTERM/SIGINT + content fingerprint + scan pipeline

Three commits. (1) Graceful shutdown — `chunker.ts` tracks live `FfmpegCommand` instances in a Map; `killAllActiveJobs()` SIGTERMs each on shutdown; `closeDb()` flushes WAL and releases the file lock. SIGTERM/SIGINT handlers: kill ffmpeg → close DB → exit 0. Running jobs left as `status='running'` so `restoreInterruptedJobs()` handles them on next start. (2) Content fingerprint — `content_fingerprint TEXT NOT NULL` added to `videos`; SHA-1 of first 64 KB + file size prefix, stable across renames/moves; chunker uses fingerprint as job cache key instead of file path. **Breaking change** for existing DBs: delete `tmp/tvke.db` and restart. (3) Scan pipeline — `walkDirectory` converted to async generator; `probeVideo` + `computeContentFingerprint` run concurrently per file; new `scanStore.ts` tracks scan state; `libraries` query auto-triggers a background scan; `libraryScanUpdated` GraphQL subscription emits state on connect + on each change.

**Files:** `server/src/services/{chunker,libraryScanner,scanStore}.ts`, `server/src/db/`, `server/index.ts`, `client/src/pages/LibraryPageContent.tsx`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `8fb27d3`_

---

## 2026-04-11 — PR #3 — docs refresh after pages/components added

Docs-only update reflecting the new page architecture from #2. CLAUDE.md repo layout expanded for new pages, components, decorators, and utils. Two new "Common Tasks" entries documented: *Add a new page* (`XxxPage.tsx` Suspense shell + `XxxPageContent.tsx` Relay query split), *Code-split a heavy component* (`ComponentNameAsync.tsx` + `lazyNamedExport`). Storybook section corrected: `withRelay` is a locally-maintained decorator; `getReferenceEntries` for multi-fragment stories. Note that relay `__generated__` artifacts are gitignored and regenerated at startup.

**Files:** `CLAUDE.md`, `docs/relay.md`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `79e630a`_

---

## 2026-04-10 — PR #2 — ProfilesPage + SetupPage + LibraryPage UI redesign

ProfilesPage three-pane layout — `ProfilesSidebar` (library nav), `MediaList` (list/grid toggle with `MediaListItem`/`MediaGridItem`), `VideoDetailsPanel` (metadata + play); all wired via `NovaEventingInterceptor` with colocated `.events.ts` files. SetupPage shows library configuration from `mediaFiles.json` with rescan button. LibraryPage redesigned with narrow 64px `LibraryRail` icon sidebar + `LibraryGrid` main area; auto-selects first library on load. AppHeader shared navigation bar with active-tab highlighting via `useLocation`. Schema: `path: String!` added to `Library`; relay-compiler regenerated (29 operations, 19 normalization artifacts). Every new component has a `.stories.tsx` using `@imchhh/storybook-addon-relay` with `@relay_test_operation` queries.

**Files:** `client/src/pages/{Profiles,Setup,Library}/`, `client/src/components/`, `server/schema.graphql`, `server/src/graphql/schema.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `dc08e3b`_

---

## 2026-04-10 — PR #1 — initial tvke streaming app implementation

The genesis PR. Server (Bun): GraphQL API via `graphql-yoga`, SQLite with raw SQL (`bun:sqlite`), ffmpeg chunker service producing fMP4 segments, binary HTTP streaming endpoint with length-prefixed framing, media library scanner with ffprobe metadata extraction. Client (React + Relay + Vite): Relay-powered library browser and video player, MSE-based streaming via `SourceBuffer` with sliding window buffer management (20s forward cap, 5s back eviction), resolution picker (240p → 4K). Infra: `mediaFiles.json` config, `install.sh` setup script, initial `CLAUDE.md` agent context, full architecture docs in `docs/`. Architecture: client → GraphQL (POST + WS `/graphql`) → graphql-yoga resolvers; client → `GET /stream/:jobId` → length-prefixed fMP4 binary stream; jobStore in memory; chunker.ts ffmpeg → `.m4s`; libraryScanner.ts ffprobe → SQLite. **Everything below this line in History.md is what built up on top of this foundation.**

**Files:** `server/`, `client/`, `docs/architecture.md`, `CLAUDE.md`, `install.sh`, `mediaFiles.json`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `e09d337`_

---
