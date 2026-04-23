---
name: groom-knowledge-base
description: Mechanical hygiene pass over docs/ — verify README TOCs, detect stale file paths, reconcile code↔doc literal values (code wins), report undocumented symbols, regenerate docs/SUMMARY.md, and refresh the architect's index. Use on demand (`/groom-knowledge-base`) after significant code or docs churn.
allowed-tools: Read Write Edit Glob Grep Bash(git *) Bash(rg *) Bash(find *) Bash(ls *) Bash(wc *) Bash(test *) Bash(sort *) Bash(uniq *) Bash(head *) Bash(diff *)
---

# Groom the Knowledge Base

Mechanical pass that keeps the `docs/` RAG tree coherent with the code. Fixes what it can; reports what needs human or architect judgement.

**Policy: code is authoritative.** When doc and code disagree on a literal (number, path, enum), the skill rewrites the doc to match the code — never the other way. Conceptual/prose mismatches are *reported*, not auto-rewritten.

**What it doesn't do:** drafting new prose, adding new concepts, restructuring folders, editing source code. All those remain human or architect decisions.

## Invocation

User runs `/groom-knowledge-base` after a period of churn (merged PRs, refactor wave, new concept added without docs). Not automatic.

## Steps

Run each step sequentially. Collect results in a scratch list you'll print at the end (§Report).

### 1. Tree integrity

For every directory under `docs/` (excluding `diagrams/`):

```sh
find docs -type d -not -path 'docs/diagrams*' | while read d; do
  if [ ! -f "$d/README.md" ] && [ "$d" != "docs" ]; then
    echo "MISSING README: $d"
  fi
done
```

For every folder *with* a `README.md`:

- Read the README — extract the list of filenames mentioned in its Markdown tables.
- List actual sibling `*.md` files in the folder (excluding `README.md` itself).
- Report any actual file missing from the README → auto-fix: append a row with a placeholder hook `TODO: summarise`, and add the row to the report so architect can refine later.
- Report any README row whose target file doesn't exist → auto-fix: remove the row.

Also flag empty concept folders (`find docs -type d -empty`) — usually a sign of a rmdir-gone-wrong; report, don't auto-delete.

### 2. Stale path scan

Extract every backticked `\`path/to/file\`` reference from docs:

```sh
rg -oN "\`([a-zA-Z0-9_./-]+\.(ts|tsx|js|json|md|mmd|sh))\`" docs/ CLAUDE.md README.md --only-matching --no-filename | sort -u
```

For each extracted path, check `test -e <path>`. If the path doesn't resolve:

- Try to find the likely new location: strip directory, grep for the basename across the repo (`rg -l "<basename>"`).
- If exactly one match → auto-fix: rewrite the doc to point at the new path.
- If zero or multiple matches → report as stale, skip.

### 3. Contradiction scan (code wins)

Look for doc claims that embed code-side literals. Common patterns:

- **Backticked numbers with units:** `60s`, `20 s`, `300s`, `30_000ms`, `2 s`.
- **Enum string values:** `"hw_unsafe"`, `"needs_sw_pad"`, `"software"`, `"vaapi"`.
- **Threshold constants:** references like `STARTUP_BUFFER_S`, `FORWARD_TARGET_S`, `ORPHAN_TIMEOUT_MS`.

For each such claim:

- Search the named constant in source (`rg -n "CONSTANT_NAME\s*=" client/ server/`).
- Compare the source value against what the doc asserts.
- If they differ → **auto-fix the doc** to match the source. Add to the report with old → new.

The skill is conservative here: if the constant name is ambiguous (multiple definitions) or the doc's literal isn't cleanly extractable via regex, skip and keep moving. This scan is a safety net, not a compiler.

### 4. Coverage gap scan (report-only)

List public exports that likely deserve a doc mention:

```sh
rg -n "^export (async )?(function|const|class) [A-Z][A-Za-z0-9_]+" \
   client/src/services/ server/src/services/ \
   client/src/hooks/ server/src/routes/ \
   server/src/graphql/resolvers/ \
   --no-heading
```

For each exported symbol name, grep `docs/` for mentions:

```sh
rg -l -w "<SymbolName>" docs/
```

Symbols with zero doc hits → report as "possibly undocumented." Do **not** auto-write prose.

### 5. Regenerate `docs/SUMMARY.md`

Read the current:

- `docs/architecture/README.md` — for the concept map
- `docs/code-style/Invariants/00-Never-Violate.md` — for the top-7 list
- `CLAUDE.md` — for the stack table

Write a fresh `docs/SUMMARY.md` following the template already in the tree (≤120 lines, sections: what-is-xstream, Stack, Invariants shortlist, Streaming pipeline paragraph, Code-style headlines, Tree navigation, footer with today's date).

Verify: `wc -l docs/SUMMARY.md` ≤ 120.

### 6. Architect index freshness

Read `.claude/agents/architect.md`. Extract each row of the index table. For each file path:

- If the file doesn't exist → remove the row (log to report).
- For each topic file actually present in `docs/` that has no row → report as "consider adding to index" (don't auto-add; architect decides based on question likelihood).

### 7. Print the groom report

One consolidated stdout block:

```markdown
# Groom Report — <YYYY-MM-DD>

## Auto-fixed (committable)
- README in `<path>`: added row for `<missing-file>` with placeholder hook
- Stale path `<old>` → `<new>` in `<doc-file>`
- Contradiction: `<doc>` claimed `<old-value>`, code at `<file:line>` shows `<new-value>` — doc updated
- SUMMARY.md regenerated (lines: N)
- Architect index: removed row pointing at non-existent `<path>`

## Report only (needs human / architect)
- Empty concept folder: `docs/architecture/Foo/`
- Possibly undocumented symbol: `<name>` in `<source-file>`
- Stale path with ambiguous fix: `<path>` — zero or multiple candidates
- Prose/conceptual mismatch candidates: <list>

## Summary
- N files edited
- M items flagged
```

If no items in any section, say so explicitly — an all-clean run should be easy to spot.

## Rules

- **Never edit source code.** This skill operates on docs only, plus `.claude/agents/architect.md`'s index and `docs/SUMMARY.md`.
- **Never guess on ambiguity.** If a fix candidate isn't exactly one file, skip and report.
- **Preserve section structure.** When patching a README, add rows in alphabetical or `NN-` order to match sibling tables.
- **Don't touch `docs/diagrams/`** — those filenames are stable and owned by `update-docs`.
- **Groom is idempotent.** A second run immediately after a first run should produce an empty auto-fix list.

## After writing — notify architect

This skill modifies docs, so when finishing a groom run that actually edited something:

- Spawn the `architect` subagent with: files changed (paste the auto-fix list), description ("groom pass: <N> auto-fixes, <M> reports"), why ("routine groom").
- Architect decides whether SUMMARY.md or its own index needs further curation based on what surfaced. Skip this when the run produced zero auto-fixes.
