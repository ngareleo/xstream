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

## f75e3ca — 2026-05-01

**Files:** `docs/INDEX.md`
**Why:** added INDEX row for `docs/migrations/release-design/Changes.md` (Prerelease → Release cross-cutting diff) per migrations-lead notification after PR #46 landed

---

## 92da4bc — 2026-05-01 (PR #46 release-design Griffel sweep + poster offline cache)

**Files:** `docs/migrations/release-design/Components/DetailPane.md`, `docs/migrations/release-design/Components/Poster.md`, `docs/migrations/release-design/Components/Library.md`, `docs/migrations/release-design/Components/Player.md`, `docs/migrations/release-design/Components/Settings.md`, `docs/migrations/release-design/Components/Goodbye.md`, `docs/migrations/release-design/Components/NotFound.md`, `docs/migrations/release-design/Components/Profiles.md`
**Why:** PR #46 Griffel sweep — added `.styles.ts` to 7 lab files and removed stale "inline styles only" TODO entries; updated Poster API note (geometry now caller-supplied via className, style prop dropped); Profiles row-internals inline TODO removed (covered by sweep)

---

## 92da4bc — 2026-05-01

**Files:** no doc updates needed
**Why:** sync scan — `874c246` ports library scanner to Rust (docs/migrations/rust-rewrite/06-File-Handling-Layer.md in-flight under migrations-lead ownership, no architect action); `92da4bc` scaffolds design/Release/ lab + release-design migration (INDEX rows already landed in prior session)
**Source commits scanned:** `ae702ab..92da4bc`

---

## ae702ab — 2026-05-01 (release-design migration INDEX rows)

**Files:** `docs/INDEX.md`
**Why:** added two retrieval rows for the release-design migration sub-tree (README + AppHeader spec) forwarded from migrations-lead — no SUMMARY.md update needed per migrations-lead sign-off

---

## ae702ab — 2026-05-01 (design-lab mprocs + port assignment)

**Files:** `design/mprocs.yaml` (new), `design/Prerelease/vite.config.ts`, `design/Release/vite.config.ts`, `design/Prerelease/README.md`, `design/Release/README.md`, `docs/design/UI-Design-Spec/01-Release-Tokens-And-Layout.md`, `docs/design/UI-Design-Spec/README.md`
**Why:** mprocs added to `design/` so both labs boot together; ports assigned from 5000 up (Prerelease 5000, Release 5001); doc port references updated to match — no structural doc additions needed

---

## ae702ab — 2026-05-01

**Files:** `docs/design/UI-Design-Spec/00-Prerelease-Tokens-And-Layout.md`, `docs/design/UI-Design-Spec/01-Release-Tokens-And-Layout.md`, `docs/design/UI-Design-Spec/README.md`, `docs/SUMMARY.md`, `docs/INDEX.md`, `.claude/skills/implement-design/SKILL.md`
**Why:** design-lab split — `design/` restructured into `design/Prerelease/` (frozen Moran) and `design/Release/` (active Xstream); doc era index + retrieval rows updated accordingly
**Source commits scanned:** `8534bc2..ae702ab`

---

## 8534bc2 — 2026-05-01

**Files:** `docs/Commit.md` (new file — bootstrap entry, preamble-only prior to this session)
**Why:** initial bootstrap — no prior log; first-run case triggered by notification of new Commit.md file landing on main

---
