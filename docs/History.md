# Architect History

Narrative log of how the knowledge base has evolved. **Newest entries on top.**

This file is distinct from [`Commit.md`](Commit.md):

- **`Commit.md`** is the terse machine-readable sync log. The architect reads only the top entry on every invocation, compares the SHA to `git rev-parse HEAD`, and decides whether a sync scan is needed. Format is rigid (`sed`-friendly, `---` dividers, top-only read).
- **`History.md`** is the prose record. The architect reads recent narrative entries on demand to build familiarity with how the docs have evolved over time — not to detect drift, but to understand the *why* behind successive changes.

**Pairing rule.** Every `Commit.md` entry has a paired `History.md` entry, written in the same session. The `Commit.md` entry says *what changed*; the `History.md` entry says *why it mattered, what alternatives were considered, and what the change unblocks for future agents*.

How to use this file:

- **At start of architect session:** skim the most recent ~5 entries. They are the cheapest way to load "what's happened lately and why".
- **When asked a question whose answer turns on a recent decision:** search this file for the topic. The narrative entry will name the doc that landed and the rationale.
- **When writing a new entry:** keep it to one paragraph plus a "Files:" line. Cross-link to the docs touched. Don't restate the `Commit.md` entry — assume the reader has it open.

Entry shape:

```markdown
## <YYYY-MM-DD> — <short title>

<One-paragraph narrative of what changed and why. Name the constraint that prompted it. Name the alternative that was considered and rejected, if any. Name what this unblocks.>

**Files:** `path/a.md`, `path/b.md`
**Related Commit.md entry:** `<short-sha>`

---
```

<!-- ENTRIES BELOW — newest first; each ends with a bare `---` line. -->

## 2026-05-03 — Boot-pack reorg + History.md added

CLAUDE.md grew to inline four content sections (engineering principles, code-style pointers, code-quality tooling, observability rules) that duplicated or could-have-duplicated content under `docs/code-style/**` and `docs/architecture/Observability/`. The risk was drift: the literal `kill_reason` enum, the ESLint rule list, and the engineering meta-rules each had a canonical source of truth that CLAUDE.md was repeating. This session moved every duplicated rule into the canonical doc, replaced the CLAUDE.md sections with one-line pointers, and upgraded the session-start directive to name the boot pack explicitly: `SUMMARY.md` + `code-style/README.md` + `architecture/Observability/01-Logging-Policy.md`. Two new sub-trees landed: `code-style/Principles/` (which previously had no home) and `code-style/Tooling/` (linting + formatting per language). The session also added this file (`History.md`) as a counterpart to `Commit.md` — `Commit.md` answers *did the docs sync at this SHA*, `History.md` answers *what's been changing and why*. Future agents reading the boot pack now see the four engineering principles as one-liners directly in `SUMMARY.md`, with the deep rationale a single click away. Multi-language coverage was a stated goal; Rust + TS/React + SQL are all addressed in `Tooling/`. Shell scripts in `scripts/` are not in scope and remain undocumented.

**Files:** `CLAUDE.md`, `docs/SUMMARY.md`, `docs/code-style/README.md`, `docs/code-style/Principles/README.md`, `docs/code-style/Principles/00-Fix-Root-Causes.md`, `docs/code-style/Principles/01-Safety-Timeouts.md`, `docs/code-style/Tooling/README.md`, `docs/code-style/Tooling/00-Linting-And-Formatting.md`, `docs/History.md`, `.claude/agents/architect.md`
**Related Commit.md entry:** _to be added by architect on next sync_

---
