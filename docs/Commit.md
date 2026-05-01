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

## 8534bc2 — 2026-05-01

**Files:** `docs/Commit.md` (new file — bootstrap entry, preamble-only prior to this session)
**Why:** initial bootstrap — no prior log; first-run case triggered by notification of new Commit.md file landing on main

---
