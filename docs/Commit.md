# Architect Commit Log

Append-only log of doc updates made by the `architect` subagent. **Newest entry on top.** Each entry is terminated by a single line containing exactly three hyphens (a markdown horizontal rule) so `sed -n '1,/^---$/p' docs/Commit.md` returns just the latest one.

The architect reads the top entry on every invocation and compares its SHA to `git rev-parse HEAD`. If they differ, it scans the intervening commits and brings docs back in sync, then prepends a new entry. See [`.claude/agents/architect.md`](../.claude/agents/architect.md) → "Commit synchronisation" for the full protocol (first-run handling, `git merge-base` ancestry check, worktree handling, and the 20-commit cap on drift).

Entry shape (each entry ends with the divider line described above):

- `## <short-sha> — <YYYY-MM-DD>` heading
- `**Files:**` followed by a comma-separated list of doc paths touched (or "no doc updates needed" if a sync scan found nothing actionable)
- `**Why:**` followed by a one-line summary
- `**Source commits scanned:**` followed by a `<sha>..<sha>` range, included only when the entry was triggered by a sync scan rather than a same-session edit

**IMPORTANT for the preamble:** do not use bare `---` lines anywhere in this top-of-file block — `sed` would stop at the first one and miss real entries below. The first `---` line in this file MUST be the terminator of the most recent entry.

<!-- ENTRIES BELOW — newest first; each ends with a bare `---` line. The architect's next invocation will treat the no-entries state as the first-run case and prepend a bootstrap entry at HEAD. -->

## 29b5c41 — 2026-05-03

**Files:** `docs/architecture/Streaming/06-FfmpegPool.md`, `docs/server/FFmpeg-Caveats/00-Overview.md`
**Why:** Pool permit moved into `LivePid` and released on kill, not at reap. Decouples "slot claimed" from "kernel reaped child" so post-seek transcode requests don't hit `CAPACITY_EXHAUSTED` during zombie grace window.

---

## fc6fda9 — 2026-05-03 (final)

**Files:** `docs/server/FFmpeg-Caveats/00-Overview.md`, `docs/server/FFmpeg-Caveats/01-Negative-DTS.md`, `docs/server/FFmpeg-Caveats/02-Tfdt-Sample-Mismatch.md`, `docs/server/FFmpeg-Caveats/README.md`, `docs/INDEX.md`, `server-rust/src/services/fmp4_tail_reader.rs`, `server-rust/src/services/mod.rs`, `server-rust/src/services/ffmpeg_file.rs`, `server-rust/src/services/chunker.rs`
**Why:** FFmpeg negative-DTS and tfdt-mismatch bugs are both fixed by dropping HLS muxer for direct `-f mp4 + tail-reader`. The `-bf 0` interim workaround is removed; B-frames re-enabled. New `02-Tfdt-Sample-Mismatch.md` documents the deeper bug (elst empty-edit causes fragment tfdt to disagree with first-sample DTS by 504 ticks; offset accumulates and kills playback at 2–5 s). E2E verified: Furiosa 4K plays cleanly to 41.97 s buffered_end=74 s.

---

## (pending) — 2026-05-03

**Files:** `docs/SUMMARY.md`, `docs/INDEX.md`, `docs/README.md`, `docs/release/README.md`, `docs/client/Components/README.md`, `docs/design/README.md`, `docs/design/UI-Design-Spec/README.md`, `.claude/agents/migrations-lead.md`, `CLAUDE.md`, `README.md`, `docs/Commit.md`, `docs/History.md`
**Why:** Curator pass after release-design migration retirement: promoted per-component specs from `docs/migrations/release-design/Components/` to `docs/client/Components/`; created `docs/release/Outstanding-Work.md` for post-redesign work; purged Moran/Prerelease framing from active docs; updated migrations-lead agent scope to own `design/Release/` + `docs/client/Components/`; added Commit.md and History.md entries

---

## 6a875fd — 2026-05-03 (corrected)

**Files:** `docs/architecture/Relay/00-Fragment-Contract.md`, `docs/code-style/Client-Conventions/00-Patterns.md`
**Why:** User preference is declarative-first React-Relay (no imperative store manipulation). Rewrote "Mutations and cache invalidation" to recommend `fetchPolicy: "store-and-network"` on destination query instead of `updater: store.invalidateStore()`. Mutation just commits + navigates. Moved old pattern to historical note. Code now shows CreateProfilePage.tsx (slim mutation) + HomePageContent.tsx pattern.

---

## 2026-05-03 — M8 Settings section-tab Relay exception

**Files:** `docs/code-style/Client-Conventions/00-Patterns.md`, `docs/SUMMARY.md`
**Why:** M8 Settings ships `TraceHistoryTab` with its own `useLazyLoadQuery` to avoid fetching playback history on other Settings sections; documented exception to "pages-only" rule + updated SUMMARY.md pointer

---

## 2026-05-03 — storybook testing policy (console.error, play assertions, resolver patterns)

**Files:** `docs/code-style/Client-Conventions/01-Storybook-Testing.md` (new), `docs/code-style/Client-Conventions/README.md`, `docs/INDEX.md`
**Why:** documented three CI-enforced storybook testing invariants after client/.storybook/vitest.setup.ts hardening: (1) every story must assert on real content via play function, (2) console.error during render fails tests (opt-out via parameters.expectConsoleErrors), (3) Relay resolvers must be path-aware to avoid edge-node dedup collisions

---

## 5749b76 — 2026-05-03 (boot-pack reorg + Principles/Tooling sub-trees + History.md)

**Files:** `CLAUDE.md`, `docs/SUMMARY.md`, `docs/INDEX.md`, `docs/code-style/README.md`, `docs/code-style/Principles/README.md`, `docs/code-style/Principles/00-Fix-Root-Causes.md`, `docs/code-style/Principles/01-Safety-Timeouts.md`, `docs/code-style/Tooling/README.md`, `docs/code-style/Tooling/00-Linting-And-Formatting.md`, `docs/History.md`, `.claude/agents/architect.md`
**Why:** removed inline content from CLAUDE.md (engineering principles, code-quality tooling, observability rules) — replaced with one-line pointers and an upgraded Session-start directive that names the boot pack explicitly. Two new sub-trees: `code-style/Principles/` (fix-root-causes + safety-timeouts now have a canonical home) and `code-style/Tooling/` (linting + formatting per language: Rust, TS/React, SQL). New `docs/History.md` is a narrative log paired with `Commit.md` — Commit.md answers *did the docs sync at this SHA*, History.md answers *what's been changing and why*. Architect prompt updated with the pairing protocol. Added INDEX rows for all new files. Curator step (this entry + INDEX rows + History.md bootstrap) was performed by the main agent because the architect notification produced a fabricated report.

---

## 38ed25d — 2026-05-03 (M6 relay-compiler operation-naming rule promotion + page-story convention)

**Files:** `docs/code-style/Invariants/00-Never-Violate.md`, `docs/code-style/Client-Conventions/00-Patterns.md`, `docs/SUMMARY.md`
**Why:** M6 (Watchlist) exposed relay-compiler operation-naming violation (M5 `DetailPaneEdit.tsx` with operations named `DetailPaneSearchQuery` / `DetailPaneMatchMutation` halted project-wide artifact generation silently); promoted to invariant #14 with explicit blast-radius call-out; added page-story convention to Client-Conventions (pages can't use `@relay_test_operation`, no storybook precedent); updated SUMMARY.md invariants shortlist to #10 (relay ops) + renumbered error-swallowing to #15

---

## 3733748 — 2026-05-02 (client-side `.utils.ts` convention — new code-style bullet)

**Files:** `docs/code-style/Client-Conventions/00-Patterns.md`
**Why:** codified rule that `*.tsx` files house only React components, props, fragments, mutations, queries; constants/formatters/type aliases/helper functions move to colocated `ComponentName.utils.ts`; applied refactor sweep to DetailPane + HomePageContent per user review direction on PR #51

---

## 931c982 — 2026-05-02 (release-design M0 INDEX row for Plan.md)

**Files:** `docs/INDEX.md`
**Why:** added retrieval row for `docs/migrations/release-design/Plan.md` (agent-orchestration scaffold for M0–M10 milestones) per migrations-lead notification; Schema-Changes.md and Porting-Guide.md are navigation-discoverable from Plan.md, no separate rows needed; SUMMARY.md unchanged (M0 is scaffolding, not architecture-level)

---

## ac4c7fd — 2026-05-02 (forward note for Rust Step 2/3 nativeResolution field)

**Files:** `docs/server/GraphQL-Schema/00-Surface.md`
**Why:** forward-note added for upcoming `Video.nativeResolution: Resolution!` field; tracks `06-File-Handling-Layer.md` §5 contract on DB column nullability and ladder-rung mapping

---

## ac4c7fd — 2026-05-02 (icon library standardisation)

**Files:** `docs/code-style/Client-Conventions/00-Patterns.md`
**Why:** curator update — both workspaces (design/Release lab + production client) standardised on @heroicons/react@1.0.6 replacing hand-rolled SVG icons; added icon sourcing convention + Figma kit link to client docs

---

## f75e3ca — 2026-05-01

**Files:** `docs/INDEX.md`
**Why:** added INDEX row for the release-design redesign cross-cutting diff per migrations-lead notification after PR #46 landed

---

## 92da4bc — 2026-05-01 (PR #46 release-design Griffel sweep + poster offline cache)

**Files:** release-design component specs (DetailPane, Poster, Library, Player, Settings, Goodbye, NotFound, Profiles)
**Why:** PR #46 Griffel sweep — added `.styles.ts` to 7 lab files and removed stale "inline styles only" TODO entries; updated Poster API note (geometry now caller-supplied via className, style prop dropped); Profiles row-internals inline TODO removed (covered by sweep)

---

## 92da4bc — 2026-05-01

**Files:** no doc updates needed
**Why:** sync scan — `874c246` ports library scanner to Rust (rust-rewrite migration in-flight under migrations-lead ownership, no architect action); `92da4bc` scaffolds design/Release/ lab + release-design redesign (INDEX rows already landed in prior session)
**Source commits scanned:** `ae702ab..92da4bc`

---

## ae702ab — 2026-05-01 (release-design migration INDEX rows)

**Files:** `docs/INDEX.md`
**Why:** added two retrieval rows for the release-design migration sub-tree (README + AppHeader spec) forwarded from migrations-lead — no SUMMARY.md update needed per migrations-lead sign-off

---

## ae702ab — 2026-05-01 (design-lab mprocs + port assignment)

**Files:** `design/mprocs.yaml` (new), `design/Release/vite.config.ts`, `design/Release/README.md`, `docs/design/UI-Design-Spec/00-Tokens-And-Layout.md`, `docs/design/UI-Design-Spec/README.md`
**Why:** mprocs added to `design/` so the lab boots from the repo root; port `5001` assigned to the design lab; doc port references updated to match — no structural doc additions needed

---

## ae702ab — 2026-05-01

**Files:** `docs/design/UI-Design-Spec/00-Tokens-And-Layout.md`, `docs/design/UI-Design-Spec/README.md`, `docs/SUMMARY.md`, `docs/INDEX.md`, `.claude/skills/implement-design/SKILL.md`
**Why:** design-lab spec landed at `design/Release/`; doc index + retrieval rows updated accordingly
**Source commits scanned:** `8534bc2..ae702ab`

---

## 8534bc2 — 2026-05-01

**Files:** `docs/Commit.md` (new file — bootstrap entry, preamble-only prior to this session)
**Why:** initial bootstrap — no prior log; first-run case triggered by notification of new Commit.md file landing on main

---
