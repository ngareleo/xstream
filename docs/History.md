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

## 2026-05-04 — PR #59 (UX consolidation slice) — Loading affordance simplification

User feedback flagged the large full-area loading overlay (56×56 spinner on a dimmed scrim) as heavy and screen-obscuring, particularly during playback stalls where visibility matters most. The ControlBar already had a sophisticated modern alternative — the play-button icon morphs to a 20×20 spinner with a green arc when `status === "loading"`. This in-place spinner is the industry-standard affordance (minimal, stays put, doesn't demand mouse movement), and we were rendering both simultaneously, forcing the user to look past the overlay to find the real signal. The fix collapses to the single spinner: the overlay is gone, and the play button's morphed state is now the sole loading indicator. To keep it visible during stalls without requiring the user to move the mouse, controls are forced `visible: true` when `status === "loading"` (the control-hide timer only resets on mouse movement, so a stalled stream with an idle mouse would normally hide controls — the force prevents that UX trap). This is purely UX cleanup with no schema/contract changes; the loading state machine remains unchanged. Two component specs were updated to articulate the new affordance structure and control-visibility rule. This also unblocks cleaner observability signals downstream — a single spinner means one span/event for "user sees loading" rather than two overlapping UI states to reconcile in traces.

**Files:** `docs/client/Components/VideoPlayer.md`, `docs/client/Components/ControlBar.md`
**Related Commit.md entry:** `8941fcb`

---

## 2026-05-04 — PR #59 (probe-cache slice) — Per-source ffprobe result caching

Seq trace 354eefb4… revealed that seek latency is dominated by ffmpeg cold-start (~2.4 s), and within that, a significant component is ffprobe re-running on the same source file per chunk. When the user seeks, 5–10 fresh encodes happen in quick succession (one ramp + one per seek), each hitting ffprobe before entering the VAAPI cascade. Since ffprobe answers are stable per file (codec, stream count, HDR/SDR state never change mid-session), caching ffprobe results by `video_id` (keyed like `vaapi_state`) eliminates ~1 s of cumulative server work per session. Per-seek win is ~150–200 ms. The cache lives on `AppContext` (sibling to `vaapi_state`), is populated lazily (first chunk of a file runs ffprobe, clones the result into the DashMap), and has no explicit invalidation (server restart clears it; a user re-scanning the library creates new `video_id` entries, so old cache entries age out naturally). Errors on the miss path propagate the same way (cascade fallback or silent-failure detection), so code correctness is unchanged. The cache is query-transparent — callers don't know or care whether the metadata came from ffprobe or the DashMap. Three doc files were updated to articulate the design: AppConfig got a new subsection documenting the cache, Streaming/06-FfmpegPool got a sibling-caches paragraph in "Why a separate module", and Observability server spans documented probe performance characteristics (cache hit/miss is not directly emitted as an event yet, but the span duration will show the latency reduction in production traces).

**Files:** `docs/server/Config/00-AppConfig.md`, `docs/architecture/Streaming/06-FfmpegPool.md`, `docs/architecture/Observability/server/00-Spans.md`
**Related Commit.md entry:** `[pending-commit]`

---

## 2026-05-04 — PR #59 (seek-latency slice) — Seek-cancel mutation + serial-lookahead gate

Three load-bearing changes landed to cut seek latency by eliminating orphan ffmpeg processes at the old playhead position. **Problem:** Seq trace `6f0ef574…` showed slowest seek waited 1205 ms for a pool slot because cold-start prefetch chunks at the OLD position kept ffmpeg running, and the seek's own lookahead grabbed the third pool slot 11 ms before the seek's foreground. **Solution:** (1) New `cancelTranscode(jobIds[])` mutation + `KillReason::ClientCancel` wired into seek handler. When user drags the slider, `PlaybackController.handleSeeking` now gathers current foreground+lookahead job IDs via `pipeline.currentJobIds()` and fires cancel before the stream abort, freeing pool slots immediately. (2) **Serial-lookahead-gate dual-check:** prefetch was firing on a simple RAF timer (`timeUntilEnd ≤ 90 s`), allowing multiple lookaheads to queue at the old playhead. Now the gate is serial primary + RAF safety net: prefetch fires only when `foregroundTranscodeComplete === true` (the prior lookahead finished) OR the RAF timeout fires (safety fallback if lookahead is slow). `onTranscodeComplete(jobId)` updates the gate from ffmpeg's COMPLETE event with stale-update filtering (comparing `jobId` to expected foreground); `promoteLookahead` resets the gate when lookahead becomes foreground. Initial chunks skip serial check (no prior lookahead). Result: at most one lookahead in flight per foreground at any moment (Seq audit: `playback.lookahead_job_id` never overlaps with a second active lookahead). Pre-fix evidence (trace `7f9c6d03…`): 2-3 concurrent lookaheads during aggressive seek; post-fix: 1 per foreground, serialized. (3) Pool cap bumped 3 → 5 to handle the higher permissiveness of rapid seek-cancel-respawn cycles without hitting `CAPACITY_EXHAUSTED`. At cap 3, aggressive seeks could exhaust: 1 (dying from cancel in flight) + 1 (new seek transcode queued) + 1 (prior foreground still running) = full. At cap 5, the same sequence leaves headroom for lookahead. The structural benefit: seek latency drops from 16–60 s (pre-ramp, slow pool refill) to ~700–1200 ms post-fix, dominated by ffmpeg cold-start and initial segment latency on a lightly-loaded system. Docs were kept coherent across the playback pipeline (scenarios, invariants, pool config, observability).

**Files:** `docs/server/GraphQL-Schema/00-Surface.md`, `docs/architecture/Streaming/01-Playback-Scenarios.md`, `docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md`, `docs/architecture/Streaming/06-FfmpegPool.md`, `docs/server/Config/00-AppConfig.md`, `docs/architecture/Observability/server/00-Spans.md`, `docs/architecture/Observability/client/00-Spans.md`
**Related Commit.md entry:** `[pending-commit]`

---

## 2026-05-04 — PR #59 (TTFF reduction slice) — Page-mount prewarm + uniform startup buffer

Two load-bearing changes landed to cut TTFF (time-to-first-frame) from ~4 s to ~700–800 ms on 4K cold-start, measured post-prewarm window on a live production session. (1) **Page-mount prewarm pattern:** When `VideoPlayer` mounts, `useChunkedPlayback.prewarm(nativeMax)` fires a side-effect `startTranscode(videoId, nativeMax, 0, 10)` mutation with errors swallowed. The user spends 1–5 seconds looking at the poster + Play button; ffmpeg encodes chunk 0 (10 s of media) silently in the background. When the user clicks Play, the click-path mutation fires with the same parameters and cache-hits the prewarm's result — `job_id` is deterministic from `SHA1(fingerprint + res + 0 + 10)`, so the segments are already on disk and the stream opens immediately. If the user takes >30 s to click, the server's `orphan_timeout_ms` (30 s) kills the unclaimed ffmpeg automatically; the user clicking afterward re-spawns fresh (no regression vs. today's cold start). If the user toggles resolution before clicking, the cache key changes and the click path re-spawns at the new resolution. The structural safety (orphan timer) ensures no code path depends on the prewarm succeeding; it's a pure latency optimization. (2) **Uniform startup buffer:** Changed `clientConfig.playback.startupBufferS` from per-resolution (2–6 s for 240p–4K) to a uniform **2 seconds** across all resolutions. This is safe because the chunk ramp's first element is always 10 s; the buffer holds 2 s before calling `video.play()`, leaving an 8 s safety margin. If the playhead catches up to the encoding rate, that's itself a signal worth surfacing via `playback.stalled` rather than masking with a deeper startup gate. The per-resolution stratification was an artifact of the old fixed 300 s chunk grid and is no longer load-bearing under the ramp model. Together these changes shift ffmpeg's ~2.4 s cold-start overhead (58% of old 4K TTFF) out of the critical path and cut the startup-buffer fill phase from ~1.7 s (at 5 s buffer @ 4K) to ~0.7 s (at 2 s buffer, faster fill rate thanks to prewarm). Expected new TTFF: 700–800 ms (measured in trace + MSE setup latencies), down from 4137 ms on the same content. Docs were kept coherent across the streaming pipeline (SUMMARY, protocol, scenarios, observability), component specs (VideoPlayer added mount-time prewarm docs), and config (ClientConfig updated with rationale).

**Files:** `docs/SUMMARY.md`, `docs/client/Config/00-ClientConfig.md`, `docs/architecture/Streaming/00-Protocol.md`, `docs/architecture/Streaming/01-Playback-Scenarios.md`, `docs/client/Components/VideoPlayer.md`, `docs/architecture/Observability/client/00-Spans.md`
**Related Commit.md entry:** `[pending-commit]`

---

## 2026-05-04 — PR #59 (OBS-STDERR-001 slice) — Silent-failure detection and cascade fallback

OBS-STDERR-001 implements structural detection and recovery for the VAAPI HDR silent-failure edge case: ffmpeg exits cleanly with zero segments on `-ss 0 -t SHORT` 4K HDR input. The previous approach (300 s cold-start workaround in the client) was removed when the ramp-controller landed, re-exposing the bug. Now the chunker detects zero-segment completion as a failure (not success), posts a `transcode_silent_failure` event with stderr attached for diagnosis, and cascades to the next tier — exactly like a non-zero exit, but with the benefit that we capture what ffmpeg stderr says about the root cause. Silent failures on FastVaapi/SDR → NeedsSwPad cache + retry SwPadVaapi; FastVaapi/HDR → skip tier 2, straight to Software; SwPadVaapi → HwUnsafe cache + Software; Software → cascade exhausted, fatal. This handles the edge-case gracefully while preserving the ramp's cold-start win (first chunk is 10 s, triggering the bug surface, but cascading recovers). The `transcode_tier_failed` event (for non-zero exits) and `transcode_silent_failure` event (for zero-exit failures) both carry structured `tier` + `ffmpeg_stderr` attributes, making Seq queries like `@MessageTemplate = 'transcode_silent_failure' and tier = 'FastVaapi'` possible.

**Files:** `docs/architecture/Observability/server/00-Spans.md`, `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md`, `docs/todo.md`
**Related Commit.md entry:** `[pending-commit]`

---

## 2026-05-04 — PR #59 (ramp-controller slice) — Chunk-duration ramp controller

The ramp-controller refactor on feat/library-film-entity replaced the old fixed 300 s steady-state / 30 s first-chunk two-tier model with a per-session ramp (`clientConfig.playback.chunkRampS: [10, 15, 20, 30, 45, 60]`, then `chunkSteadyStateS: 60` steady-state). The ramp resets at every anchor point — session start, seek, MSE-detached recovery, resolution switch — so seeks benefit from the same fast cold-start curve as initial play, eliminating the old 210 s wait for eager-prefetch to fire on cold-start. The change cuts time-to-first-frame after a seek from 16–60 s (pre-ramp) to ~2–5 s (post-ramp, matching initial play). Cost: the first chunk is now 10 s instead of 30 s at `startS === 0`, which re-exposes a VAAPI HDR bug on 4K (`-ss 0 -t 10` exits cleanly with zero segments, same failure shape as `-ss 0 -t 30` did before). The user explicitly accepted this trade-off during pre-prod design ("embrace breaking changes; declare and clean up tech debt"). Verification required: test on a 4K HDR fixture before merging to main. If 4K HDR regresses, OBS-STDERR-001 (capture ffmpeg stderr and detect zero-segment-on-clean-exit, fall back to software) is the structural fix — neither a hack nor a reversion to the old workaround. Removed `flag.devForceShortChunkAtZero` (the escape hatch is now obsolete; the ramp provides the cold-start win for all resolutions). Nine doc files updated to reflect the ramp semantics (no more chunk grid, no more snap-back math, no special `startS === 0` guard outside of the declared tech debt). The old CHUNK-001 todo ("adaptive chunk duration per resolution") is reframed post-ramp as a calibration task: once the ramp lands in production, gather latency traces and tune `chunkSteadyStateS` per resolution for constant encoding latency.

**Files:** `docs/SUMMARY.md`, `docs/architecture/Streaming/00-Protocol.md`, `docs/architecture/Streaming/01-Playback-Scenarios.md`, `docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md`, `docs/client/Config/00-ClientConfig.md`, `docs/client/Feature-Flags/00-Registry.md`, `docs/architecture/Observability/client/00-Spans.md`, `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md`, `docs/todo.md`
**Related Commit.md entry:** `bf710b6`

---

## 2026-05-03 — PR #59 — Show entity, profile availability, local poster cache

Three layered additions on top of the Film entity, landing on the same PR as one cohesive bundle. The user's framing was "this is pre-prod — embrace breaking changes; declare and clean up tech debt." (1) **Show entity** mirrors Film for TV — `shows` and `show_metadata` tables with the same dedup contract (imdb_id canonical, parsed_title_key fallback). The synthetic show-Video pattern from the prerelease design was dropped cleanly: series identity now lives in `shows`, episode files in `videos` joined via `videos.show_id` + `(show_season, show_episode)`. Two libraries indexing the same episode file produce two `videos` rows pointing at the same coordinate (axis-2 dedup, exposed as `Episode.copies`). (2) **Profile availability** makes "the drive is unplugged" a first-class state — `libraries.status`/`last_seen_at` driven by a periodic probe, scanner skips offline libraries, re-kicks on offline→online. The alternative — sweep-and-delete unreachable rows — was rejected because the user can still browse what's catalogued while the drive is offline; only playback should be blocked. (3) **Local poster cache** mirrors OMDb posters into `app_cache_dir/posters/`, hash-addressed by `sha1(url)+ext`, served from `GET /poster/:basename`. The GraphQL `posterUrl` field rewrites to a same-origin local path when the cache has it — the app works offline once metadata has been matched, and stops re-hitting the OMDb CDN. The motivation came directly from a quota-exhaustion incident mid-session (OMDb 401 "Request limit reached") — the cache stops the bleed and the user owns their assets. Twelve tech-debt items were declared (poster eviction, retry backoff, stale-cache invalidation, format conversion, concurrency tuning; addShowToWatchlist, continue-watching, episode extras, Title unification, MediaType redundancy, show suggestions, episode-reconciliation UX). Three new architecture docs land alongside: 03-Show-Entity, 04-Profile-Availability, 05-Poster-Caching. The component layer adds ShowTile + ShowDetailsOverlay (sibling to FilmTile + FilmDetailsOverlay; the homepage routes between them by URL param `?film=<id>` vs `?show=<id>`). Component-spec sync sweeps Poster (HTTP_ORIGIN rewrite via `resolvePosterUrl`), ProfileRow (status pill), SeasonsPanel (`Video.show.seasons` traversal), and the four other consumers of the old `Video.seasons` field.

**Files:** `docs/architecture/Library-Scan/03-Show-Entity.md` (new), `docs/architecture/Library-Scan/04-Profile-Availability.md` (new), `docs/architecture/Library-Scan/05-Poster-Caching.md` (new), `docs/architecture/Library-Scan/README.md`, `docs/architecture/Observability/server/00-Spans.md`, `docs/server/DB-Schema/00-Tables.md`, `docs/server/GraphQL-Schema/00-Surface.md`, `docs/server/Config/00-AppConfig.md`, `docs/client/Components/ShowTile.md` (new), `docs/client/Components/ShowDetailsOverlay.md` (new), `docs/client/Components/README.md`, `docs/client/Components/Poster.md`, `docs/client/Components/ProfileRow.md`, `docs/client/Components/SeasonsPanel.md`, `docs/client/Components/FilmDetailsOverlay.md`, `docs/client/Components/PlayerContent.md`, `docs/INDEX.md`, `docs/SUMMARY.md`, `docs/todo.md`
**Related Commit.md entry:** `a7479d5`

---

## 2026-05-03 — Film entity architecture: logical dedup layer for movies

The Film entity landed on feat/library-film-entity, addressing the 5-duplicate-movie problem by introducing a logical layer above Videos. One Film owns 1+ video copies (different encodes of the same movie), dedup'd by two keys: `imdb_id` (authoritative, post-OMDb-match) and `parsed_title_key` (pre-OMDb, `<title>|<year>`). The scanner now runs three passes: (1) file walk (unchanged), (2) resolve_films_for_library (new, movies-only, groups files by MovieUnit and links via parsed_title_key), (3) auto_match_library with merge (new, repoints duplicate Films when both match the same OMDb ID). TV is unchanged (shows remain video-as-series). Watchlist and watch_progress are now film-keyed; the variant picker (FilmVariants component) lets users choose which copy to play when multiple main-role videos exist. The database schema adds `films` table, `videos.film_id`, `videos.role`, `watchlist_items.film_id`, and `watch_progress.film_id`. GraphQL adds `Query.films`, `Query.film`, `Film` type with `bestCopy`/`copies`/`extras` fields, and new mutations `addFilmToWatchlist`, `removeFilmFromWatchlist`, `updateWatchProgress`. Nine doc files updated or created to cover architecture, DB schema, GraphQL surface, and the new FilmVariants + updated FilmDetailsOverlay + Library page specs. Forward-only migration; user re-scans to populate the logical layer.

**Files:** `docs/architecture/Library-Scan/02-Film-Entity.md` (new), `docs/architecture/Library-Scan/README.md`, `docs/server/DB-Schema/00-Tables.md` (added films + watchlist_items + watch_progress sections), `docs/server/GraphQL-Schema/00-Surface.md`, `docs/client/Components/FilmVariants.md` (new), `docs/client/Components/FilmDetailsOverlay.md`, `docs/client/Components/Library.md`, `docs/client/Components/README.md`, `docs/INDEX.md`
**Related Commit.md entry:** `(pending Film entity merge)`

---

## 2026-05-03 — AppHeader spec refinement: scan button holdover mechanism

The scan button was given a 2-second click-triggered holdover in the code to ensure users see visual feedback even when the `scanLibraries` mutation resolves in < 200 ms (as it typically does). The spec entry from `b594485` attempted to document the GraphQL mutation wiring but incompletely stated "No timeout; mutation lifecycle is the authority," which was inaccurate. The current spec now clearly documents the dual-state machine: spin runs while `mutationPending || spinHoldover` is true, with `spinHoldover` being a `useState` flag set on click and cleared by `setTimeout` after 2000 ms. This is a refinement with no code changes in this session — the design-lab reference implementation in `design/Release/src/components/AppHeader/AppHeader.tsx` (lines 28–32) has always used this 2 s mock, and the production code now matches it exactly. The spec was updated to catch up with the code's current state.

**Files:** `docs/client/Components/AppHeader.md`
**Related Commit.md entry:** `(current HEAD)`

---

## 2026-05-03 — Component specs curation: AppHeader, FilmDetailsOverlay, VideoArea

Four bug-fix commits landed in parallel (AppHeader scan → mutation wiring, FilmDetailsOverlay OMDb title preference, VideoArea poster unmount on play, topbar status removal) and the three paired component specs were stale. AppHeader spec documented the old stub behavior (local spinning state + 2s timeout) instead of the new GraphQL-driven mutation lifecycle. FilmDetailsOverlay spec said the title was `data.title` but it now prefers `metadata?.title ?? data.title` (OMDb-sanitised). VideoArea spec documented opacity-fade + orphaned topbar status badge; code now unmounts the poster entirely when playing and the topbar contains only the back button. Updated all three specs to match current code and removed obsolete sections (resolution label helper, status badge note, fade-out subsection). The "Derived" data list now omits unused items (`resolution label`, `videoStream.width/height`). No index or architecture-level changes.

**Files:** `docs/client/Components/AppHeader.md`, `docs/client/Components/FilmDetailsOverlay.md`, `docs/client/Components/VideoArea.md`
**Related Commit.md entry:** `b594485`

---

## 2026-05-03 — Pool permit lifecycle: release at kill, not at reap

When a user seeks during active playback, the old foreground + prefetch transcode jobs receive `client_disconnected` and `kill_job` is called. Before this fix, the semaphore permit (which counts against the concurrency cap) was held until the OS reaped the child process, typically 100–500 ms after SIGTERM/SIGKILL. This caused post-seek transcode requests to fail with `CAPACITY_EXHAUSTED` even though the old jobs were already dead to the user's playback. The fix moves the permit into the `LivePid` struct at spawn time and extracts + drops it immediately in `kill_job`, the moment we decide to kill. If the job exits naturally (no kill), the permit is dropped at reap as before. This decouples "job is conceptually free" from "kernel has finished bookkeeping," making the cap responsive to user interactions. Updated pool architecture doc with permit-lifecycle section and added row 03 to FFmpeg-Caveats overview (marked as pool design, not an ffmpeg caveat, but surfaced for downstream awareness).

**Files:** `docs/architecture/Streaming/06-FfmpegPool.md`, `docs/server/FFmpeg-Caveats/00-Overview.md`
**Related Commit.md entry:** `29b5c41`

---

## 2026-05-03 — FFmpeg-Caveats: Option B shipped (negative-DTS + tfdt mismatch both fixed)

The negative-DTS bug evolved through three layers: (1) B-frame reorder produces DTS<0; ffmpeg writes `elst` to compensate, but MSE ignores it (Chromium by design). (2) The HLS-fmp4 muxer wrapper silently eats all timestamp-correction flags, making `-avoid_negative_ts` and `-movflags +negative_cts_offsets` no-ops. (3) Deeper still, even when fixed at the flag level, a mismatched `tfdt` (track fragment decode time) box remains: the mov muxer writes `tfdt` in the post-edit timeline (0) while samples use the pre-edit timeline (+504 ticks), and the offset accumulates across fragments until MSE fails at 2–5 s — indistinguishable from the DTS error until you inspect the `tfdt` box. Initial approach ("-bf 0" to disable B-frames) traded bitrate for simplicity but left the tfdt bug intact. Final fix (Option B): drop the HLS wrapper entirely, use direct `-f mp4 -movflags +frag_keyframe+empty_moov+separate_moof+default_base_moof+negative_cts_offsets -avoid_negative_ts make_zero`, and spawn a Rust tail-reader (`fmp4_tail_reader.rs`) as a tokio task to atomically split the single growing `chunk.fmp4` into `init.mp4 + segment_NNNN.m4s`. This preserves the on-disk shape the rest of the pipeline expects and re-enables B-frames (5–10% bitrate saved). New caveat entry `02-Tfdt-Sample-Mismatch.md` documents the tfdt bug with a diagnostic walkthrough (python `tfdt` decoder + ffprobe script). E2E verified on Furiosa 4K: clean playback to 41.97 s, `buffered_end=74 s`, no errors.

**Files:** `docs/server/FFmpeg-Caveats/00-Overview.md`, `docs/server/FFmpeg-Caveats/01-Negative-DTS.md`, `docs/server/FFmpeg-Caveats/02-Tfdt-Sample-Mismatch.md`, `docs/server/FFmpeg-Caveats/README.md`, `docs/INDEX.md`, `server-rust/src/services/fmp4_tail_reader.rs`, `server-rust/src/services/mod.rs`, `server-rust/src/services/ffmpeg_file.rs`, `server-rust/src/services/chunker.rs`
**Related Commit.md entry:** `fc6fda9`

---

## 2026-05-03 — Release-design migration retirement: component specs promoted, Outstanding-Work audit created

The Prerelease → Release client redesign migration shipped in April 2026 and was declared complete. The migration tree (`docs/migrations/release-design/`) had outlived its purpose — it was a temporary artifact holding 300+ ported specifications and checklists, all framed as "OLD → NEW" diffs and porting status. But the specs themselves were valuable and durable; they document the contract for every component in the client. Three structural moves solved this: (1) Per-component specs moved from `docs/migrations/release-design/Components/` to `docs/client/Components/` with Moran-era framing stripped; added 26 new specs for components that never had one (player subcomponents, settings primitives, dev infrastructure). Total: 53 stable per-component references. (2) Created `docs/release/Outstanding-Work.md` as a working document for unfinished items — 300+ unchecked checkboxes scattered across 53 migration spec files were consolidated into one audit point, grouped by component, so the next redesign sweep doesn't have to re-mine 30 files. (3) Strict-purged "Moran" / "Prerelease" / "Bebas Neue" framing from every active doc — the Prerelease era is historical fact but not a current concept in the docs. Paths in append-only logs (Commit.md, History.md) are preserved as historical accuracy. Updated `migrations-lead` agent scope: it now owns `design/Release/` + `docs/client/Components/` (the design lab and its contract specs), separate from `architect`'s cross-cutting knowledge base. This keeps the curator disciplines orthogonal — component specs are design, not architecture. Updated CLAUDE.md routing (lines ~92, ~134) to map design-lab questions directly to migrations-lead; architect stays focused on cross-cutting structure and INDEX/SUMMARY updates.

**Files:** `docs/SUMMARY.md`, `docs/INDEX.md`, `docs/README.md`, `docs/release/README.md`, `docs/client/Components/README.md`, `docs/design/README.md`, `docs/design/UI-Design-Spec/README.md`, `.claude/agents/migrations-lead.md`, `CLAUDE.md`, `README.md`, `docs/Commit.md`, `docs/History.md`
**Related Commit.md entry:** `(pending)`

---

## 2026-05-03 — Mutation + cache invalidation: declarative-first pattern established

Creating a library affects multiple pages (homepage, profiles, …), but the old code pre-fetched only the `PROFILES_QUERY` before navigating. This left the homepage query cached as empty on the create-and-redirect flow. The initial fix attempted Relay's `store.invalidateStore()` in the mutation's `updater` callback, but the user expressed a preference: "I have reservations about manually dealing with the relay store. Instead, can we try to trigger a query refetch." This prompted a pattern shift to **declarative-first React-Relay**: mutations just commit and navigate; destination pages express data freshness via `fetchPolicy: "store-and-network"` on their `useLazyLoadQuery`. This is simpler (no cache knowledge needed at the mutation site), more testable (intent is local to the query, not hidden in an updater callback), and aligns with React's functional paradigm — data properties are declared, not imperatively forced. The new pattern applies to all mutations affecting shared collections (`createLibrary`, `deleteLibrary`, `addToWatchlist`, …). Updated `docs/architecture/Relay/00-Fragment-Contract.md` with code examples (CreateProfilePage.tsx slim mutation + HomePageContent.tsx pattern) and moved the old `invalidateStore()` approach to a historical note. Cross-linked to `docs/code-style/Client-Conventions/00-Patterns.md` §2 ("Prefer the declarative React-Relay surface").

**Files:** `docs/architecture/Relay/00-Fragment-Contract.md`, `docs/code-style/Client-Conventions/00-Patterns.md`
**Related Commit.md entry:** `6a875fd`

---

## 2026-05-03 — M8 Settings: section-tab Relay exception

The Settings page originally fetched data from multiple section components at the page level (`SettingsPageContentQuery` spreading fragments from every tab). This created an upfront cost even when the user navigated directly to Library or Metadata — the Trace section's history data was fetched but unused. M8 pushes the trace query down into `TraceHistoryTab` itself via `useLazyLoadQuery`, wrapping the section in a `<Suspense>` boundary at the page level. This breaks the documented "pages only" rule for `useLazyLoadQuery`, so the exception was formally documented in `Client-Conventions/00-Patterns.md` with the preconditions (dispatched tab/section components, data needed by only one section, section wrapped in Suspense). The rule change is narrow and intentional: it solves the "fetch on entry, don't use" antipattern by making data ownership precise. No other Settings sections are affected; this pattern is expected to be rare. Updated SUMMARY.md pointer to flag the exception so future agents don't see a blanket "pages only" rule that later surprises them.

**Files:** `docs/code-style/Client-Conventions/00-Patterns.md`, `docs/SUMMARY.md`
**Related Commit.md entry:** `2026-05-03` (M8 Settings section-tab Relay exception)

---

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

## 2026-05-01 — PR #45 — Xstream design lab + per-component spec scaffold

Stood up `design/Release/` — the live Xstream design lab — with full page parity (Profiles, Library, Player, Settings, DesignSystem, Goodbye, NotFound) seeded from Figma handoff. AppHeader iterated to glass treatment with custom green pulsing caret (mirror-span pinned to end-of-text), hover-breathing, functional search with film/library suggestions + keyboard nav, scan button. Scaffolded a portable per-component spec sub-tree for porting the lab into `client/src/`. Wired the porting effort through `migrations-lead`: agent definition extended with the new domain + redesign section + `design/Release/**` routing branch. CLAUDE.md routing sends `design/Release/**` edits to `migrations-lead`.

**Files:** `design/Release/`, redesign component-spec sub-tree, `.claude/agents/migrations-lead.md`, `CLAUDE.md`
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

## 2026-04-12 — PR #8 — initial design system implementation

Full design-system implementation across the client: design tokens (`styles/tokens.ts`), AppShell CSS grid (sidebar 220px + header 56px + main), Sidebar with Nova eventing toggle, AppHeader with `actions` slot rendered by pages, Dashboard page with hero slideshow + ProfileRow + ProfileExplorer + FilmDetailPane + URL-driven pane state, Library page with PosterCard grid + LibraryFilterBar + LibraryChips, Player page Griffel layout + inactivity hide (3s) + PlayerSidebar, Watchlist + Settings + Feedback pages. Server side: `video_metadata`, `watchlist_items`, `user_settings` tables; OMDb service; `matchVideo` / `unmatchVideo` mutations.

**Files:** `client/src/{pages,components,styles,services}/`, `server/src/{db,services,graphql}/`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `16f0e3f`_

---

## 2026-04-11 — PR #10 — interactions, navigation polish, Library overhaul (design lab)

Sidebar user row opens a popover profile menu (profiles list, Go to home, Account settings, Sign out). Sign out → confirmation dialog → full-screen `/goodbye` farewell page (auto-redirects home after 4s). Settings page reads `?section=<id>` for deep-linking. New `useSplitResize` hook for drag-to-resize on Profiles + Library split-body layouts. Pure-CSS tooltips (`[data-tip]` attribute). ErrorBoundary prod screen rewritten as a customer help page. Library overhaul: removed per-profile sections; profile filter chips below filter bar; list view fully implemented with column-aligned rows. Watchlist removed. Dashboard breadcrumb removed.

**Files:** `design/src/pages/`, `design/src/components/`, `design/src/hooks/useSplitResize.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `d44747a`_

---

## 2026-04-11 — PR #9 — design lab: 404 + ErrorBoundary + tooltips + DevTools + split panes

NotFound page (atmospheric grain + radial gradient, ghost "404" in display font, Go-back + Browse-library actions). ErrorBoundary wraps full app above `<BrowserRouter>` — dev mode with full stack trace + copy-to-clipboard, prod mode with friendly "Something went wrong". Global loading bar (3px fixed, three-phase state machine `loading → completing → idle`, `transform: scaleX()` no-reflow animation, `LoadingBarProvider` counts active loaders). DevTools kill switch — `DevPanel` floating panel that force-throws render errors from registered targets; correctly handles React 18 concurrent-mode retry. Resizable split panes via `useSplitResize` hook.

**Files:** `design/src/pages/{NotFound,ErrorBoundary}/`, `design/src/components/{LoadingBar,DevPanel}/`, `design/src/hooks/useSplitResize.ts`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `b395b2c`_

---

## 2026-04-11 — PR #7 — design lab: shimmer skeleton loading states

`useSimulatedLoad` hook (700ms default) simulates Relay Suspense delay. `.skeleton` utility class + `@keyframes shimmer` in `shared.css`. Per-page skeletons mirror the geometry of the real page to prevent layout shift (Profiles/Dashboard, Library, Watchlist, Settings).

**Files:** `design/src/hooks/useSimulatedLoad.ts`, `design/src/components/skeletons/`, `design/src/styles/shared.css`
**Related Commit.md entry:** _pre-Commit.md era; merge SHA `78d3979`_

---

## 2026-04-11 — PR #6 — design lab: UI spec + implement-design skill + annotated source

Authoritative UI spec for the xstream client authored as a runnable React prototype using mock data. `design/README.md` covers page layouts, pane routing scheme, player state machine, inactivity hide, visual details, component-to-production mapping. `docs/ui-design-spec.md` is the implementation reference for the main repo. New `/implement-design` skill — step-by-step guide for porting design lab pages to production with data-layer mapping tables, UX invariants checklist, visual detail verification list. Three pages prototyped: Profiles (pane routing via `useSearchParams`), Library (poster grid, search, pane), Player (idle → loading → playing state machine, 3s inactivity hide, `navigate(-1)` back).

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
