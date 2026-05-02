---
name: groom-knowledge-base
description: Hygiene pass over docs/ — verify README TOCs, detect stale file paths, reconcile code↔doc literals AND prose drift (code always wins), regenerate docs/SUMMARY.md, refresh the architect's index, refresh CLAUDE.md when its stack/repo-layout/literal lists drift. Reports only what truly needs human judgement (undocumented symbols, structural splits, prose deep enough to need replacement). Use on demand (`/groom-knowledge-base`) after significant code or docs churn.
allowed-tools: Read Write Edit Glob Grep Bash(git *) Bash(rg *) Bash(find *) Bash(ls *) Bash(wc *) Bash(test *) Bash(sort *) Bash(uniq *) Bash(head *) Bash(diff *)
---

# Groom the Knowledge Base

Mechanical pass that keeps the `docs/` RAG tree coherent with the code. Fixes everything it safely can — including conceptual prose drift — and reports only what truly needs human judgement.

**Policy: code is authoritative.** When doc and code disagree on anything (literal value, path, enum, or the surrounding prose that names retired files / wrong runtime / outdated APIs), the skill rewrites the doc to match the code. *Never* the other way around.

**Scope of doc edits — what's fair game:**

- **Stale file paths and extensions** (`chunker.ts` → `chunker.rs` after a port). Fix even when the file was renamed AND moved AND has a different language extension, as long as the basename's new home is unambiguous.
- **Conceptual prose drift** caused by code reality changing — examples: `Promise<T>` references when the function is now Rust `async fn ... -> T`, `Map<string, X>` JS-isms when the type is a Rust enum, `Bun server` mentions when the server is Rust.
- **CLAUDE.md** stack table, repo-layout tree, observability rules, agent routing, and any literal lists (kill_reason values, paths, enum members) that have drifted from code.
- **README TOC mismatches** (add missing files with a placeholder hook, remove dangling rows).
- **`docs/SUMMARY.md` regen** when content drifted or line cap exceeded.
- **`docs/INDEX.md` row removals** when a path no longer exists.

**Scope of doc edits — what's still off-limits (report only):**

- **`docs/code-style/Invariants/00-Never-Violate.md` rationale prose.** You may correct a literal value the rule quotes (a constant, an enum) but never reword the *why*. The file is the safety net; rewording it risks losing the force.
- **`docs/migrations/**`** — *all of it*. `migrations-lead` owns those files. If a stale link or claim lives under `docs/migrations/**`, route it to that subagent (notify protocol below) rather than auto-rewriting.
- **`design/Release/**`** — same migrations-lead boundary.
- **New prose for undocumented symbols.** Step 4 still detects coverage gaps but never invents prose to fill them. Architect or the feature author decides if a symbol deserves a doc and where it lives.
- **Structural splits.** Step 7 still reports oversized files and overcrowded folders but never executes a split. Natural seams are architect's call.
- **Source code edits** — never. The skill rewrites `docs/`, `docs/INDEX.md`, `docs/SUMMARY.md`, `CLAUDE.md`, and the root `README.md`. Nothing under `client/`, `server-rust/`, `src-tauri/`, `design/`, or `scripts/`.

The boundary in one line: **don't invent new concepts or narratives; rewrite existing ones to match reality.**

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

Look for doc claims that disagree with code. Two layers:

**Literals** — backticked numbers/enums/constants:

- **Numbers with units:** `60s`, `20 s`, `300s`, `30_000ms`, `2 s`.
- **Enum string values:** `"hw_unsafe"`, `"needs_sw_pad"`, `"software"`, `"vaapi"`.
- **Threshold constants:** `STARTUP_BUFFER_S`, `FORWARD_TARGET_S`, `ORPHAN_TIMEOUT_MS`, `BACKPRESSURE_BUFFER`, etc.

For each: grep the named constant in source, compare values, **auto-fix the doc** if they differ.

**Conceptual drift** — prose that describes a retired runtime, language, or API surface. Examples encountered in past runs:

- `chunker.ts` referenced after the chunker was ported to Rust (`server-rust/src/services/chunker.rs`).
- `Promise<StartJobResult>` claimed when the signature is `async fn start_transcode_job(...) -> StartJobResult`.
- `Map<string, "needs_sw_pad" | "hw_unsafe">` JS-isms when the type is a Rust `enum VaapiVideoState` in `server-rust/src/config.rs`.
- `Bun server` / `bun:sqlite` / `fluent-ffmpeg` / `graphql-yoga` mentions when the actual stack is Rust + tokio + rusqlite + axum + async-graphql (per `Cargo.toml` and `server-rust/`).
- `kill_reason` enums quoting fewer values than the source enum defines.

For conceptual drift: read the surrounding paragraph(s), rewrite to match current code reality, preserve the doc's structure (headings, lists, link targets that still resolve). When the prose change is more than a sentence or two, leave a brief inline note (`<!-- updated: <YYYY-MM-DD> for Rust port -->`) only if the section is load-bearing for retrieval. Most rewrites need no marker.

**Off-limits even here:**

- Don't reword the *rationale* prose in `docs/code-style/Invariants/00-Never-Violate.md`. Fix only literals it quotes.
- Don't touch `docs/migrations/**` or `design/Release/**` — route those findings to `migrations-lead` instead.

If the drift is so deep that the section needs *replacement* rather than rewriting (e.g., an entire architecture doc was written for the wrong stack), report it for architect rather than rewriting in place.

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

Read `docs/INDEX.md`. Extract each row. For each file path:

- If the file doesn't exist → remove the row (log to report).
- For each topic file actually present in `docs/` that has no row → report as "consider adding to index" (don't auto-add; architect decides based on question likelihood).

### 7. Size audit (report-only)

Detect docs that have outgrown their container. Report-only — splitting is judgement work the architect handles, not the skill.

```sh
# files over 200 lines (excluding diagrams/)
find docs -name '*.md' -not -path 'docs/diagrams/*' -exec wc -l {} \; \
  | awk '$1 > 200 { print $0 }'

# topic-folders with > 8 sibling *.md files (excluding README.md)
find docs -mindepth 2 -type d -not -path 'docs/diagrams*' \
  | while read d; do
      n=$(find "$d" -maxdepth 1 -name '*.md' -not -name 'README.md' | wc -l)
      [ "$n" -gt 8 ] && echo "$d ($n files)"
    done
```

Both lists feed the report's **Split candidates (architect)** section. Thresholds match the architect's reactive split rule (200 lines / 8 files); below those, the file/folder is fine.

### 8. Print the groom report

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

## Split candidates (architect)
- Oversized file: `<path>` (`<N>` lines, > 200) — architect decides where the natural seam is
- Overcrowded folder: `<path>` (`<N>` files, > 8) — architect decides the theme split
- Note: `docs/migrations/**` is owned by `migrations-lead`; do NOT route those candidates to architect

## Summary
- N files edited
- M items flagged
```

If no items in any section, say so explicitly — an all-clean run should be easy to spot.

## Rules

- **Never edit source code.** Skill writes inside `docs/`, plus `docs/INDEX.md`, `docs/SUMMARY.md`, `CLAUDE.md`, and the root `README.md`. Nothing under `client/`, `server-rust/`, `src-tauri/`, `design/`, or `scripts/`.
- **Don't touch `docs/migrations/**` or `design/Release/**`.** Those belong to `migrations-lead`. Findings inside that subtree get routed to that subagent (see notify protocol).
- **Don't reword the rationale prose in `docs/code-style/Invariants/00-Never-Violate.md`.** Fix only literals it quotes (constants, enum values). The rules' force depends on the wording — leave the wording alone.
- **Don't invent new prose.** If a symbol is undocumented (step 4), report it. Don't fabricate a doc entry. If a doc is missing an entire concept, report it. Don't write the missing concept.
- **Don't guess on ambiguity.** If a fix candidate isn't exactly one file (path scan) or one canonical replacement (constant scan), skip and report.
- **Preserve section structure.** When patching a README, add rows in alphabetical or `NN-` order to match sibling tables. When rewriting prose, keep headings, list shape, and link anchors stable.
- **Don't touch `docs/diagrams/`** — those filenames are stable and owned by `update-docs`.
- **Groom is idempotent.** A second run immediately after a first run should produce an empty auto-fix list.

## After writing — notify architect

This skill modifies docs, so when finishing a groom run that actually edited something:

- Spawn the `architect` subagent with: files changed (paste the auto-fix list), description ("groom pass: <N> auto-fixes, <M> reports"), why ("routine groom").
- Architect decides whether SUMMARY.md or its own index needs further curation based on what surfaced. Skip this when the run produced zero auto-fixes.
