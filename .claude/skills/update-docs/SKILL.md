---
name: update-docs
description: Update documentation when code changes — rewrite the relevant .mmd, regenerate its PNG screenshot, and refresh prose in docs/. Enforces the xstream docs naming + namespacing convention (nested super-domain → concept folder → NN-PascalCase, with README per folder).
allowed-tools: Read Write Edit Glob Grep Bash(python3 *) Bash(ls *) Bash(cp *) Bash(mv *) Bash(mkdir *) Bash(rmdir *) Bash(google-chrome *) Bash(file *) Bash(wc *) mcp__drawio__open_drawio_mermaid
---

# Update Documentation

**Policy:** any change to the streaming pipeline MUST be reflected in the corresponding diagram, its screenshot, and the prose under `docs/architecture/Streaming/`. Code and docs ship together — never in separate PRs.

The knowledge base is owned by the **architect** subagent (`.claude/agents/architect.md`). This skill covers diagram updates + docs tree hygiene; the architect curates content placement.

## Docs naming convention — enforce when adding or moving a doc

All markdown docs under `docs/` follow a nested convention.

**Path shape:** `docs/<super-domain>/<Concept-Folder>/(<client|server>/)?NN-Topic-Name.md`

- **Super-domains** (fixed set): `architecture`, `client`, `server`, `design`, `product`, `code-style`.
- **Concept folder**: `Pascal-Case-With-Dashes` (e.g. `Streaming`, `Hardware-Acceleration`, `Feature-Flags`).
- **Optional `client/` or `server/` sub-folder** inside a concept, only inside `architecture/`, and only when one side of the wire has material distinct from the shared content at the concept root.
- **Topic file**: `NN-Topic-Name-In-PascalCase.md`. `NN` is a two-digit prefix scoped to the containing folder (`00`, `01`, `02`, …). Name self-describing — someone reading only the filename knows the topic.
- **`README.md`** in every concept folder (and every `client/`/`server/` sub-folder). The README is the folder's table of contents — a Markdown table with one row per sibling listing file name + one-line hook. Max ~30 lines.

**Placement rule:**

- Cross-cutting (client + server both touch it) → `architecture/<Concept>/`. Shared content at the concept root; side-specific nuance under `client/` or `server/` sub-folders.
- Client-only or server-only → `client/<Concept>/` or `server/<Concept>/` respectively.
- Invariants, conventions, naming, anti-patterns → `code-style/<Concept>/`.
- Product / customers / roadmap → `product/<Concept>/`.
- Design system → `design/<Concept>/`.

**Exemptions:**

- `docs/README.md` and every folder's `README.md` are exempt from the `NN-` prefix — they're indexes, not topics.
- `docs/todo.md` stays at the docs root (owned by the `todo` skill).
- `docs/diagrams/streaming-0{1..4}-*.{mmd,png}` filenames are stable — referenced by this skill and by `docs/architecture/Streaming/01-Playback-Scenarios.md`.

**When you add a new topic file:**

1. Pick the super-domain, then the concept folder (create a new concept folder if needed with its own `README.md`).
2. Determine `NN` — next unused two-digit prefix in that folder.
3. Write the file at `docs/<super-domain>/<Concept>/NN-Topic-Name.md`.
4. **Update the folder's `README.md`** to add a row for the new topic in the same change.
5. If the topic is important enough to route callers directly from the architect's retrieval index, notify the architect (or add the row yourself to `docs/INDEX.md`).
6. If the topic is referenced from CLAUDE.md, skills, agents, or source comments, update those references in the same commit.

**When you rename or move a doc:** use `git mv` so history is preserved, and grep the whole repo for the old path before committing — `grep -rn "<old-path>" .` should return zero hits.

## When this skill applies

Run this skill when your change touches one of:

- `client/src/services/playbackController.ts`
- `client/src/services/streamingService.ts`
- `client/src/services/bufferManager.ts`
- `client/src/hooks/useChunkedPlayback.ts`
- `server-rust/src/routes/stream.rs`
- `server-rust/src/services/chunker.rs`
- `server-rust/src/graphql/mutation.rs` (only the `start_transcode` resolver)

…**and** the change alters an interaction visible in one of the four sequence diagrams: actor calls, ordering, span boundaries, back-pressure thresholds, seek/snap logic, or the resolution-switch handoff.

Purely internal refactors (renames, extracting private helpers, tightening types) that do not change the visible call sequence do not require a diagram update. If unsure, update the diagram.

## The four diagrams

| # | File | Covers |
|---|---|---|
| 1 | `docs/diagrams/streaming-01-initial-playback.mmd` | Click-play through first pixels; full actor chain including ffmpeg |
| 2 | `docs/diagrams/streaming-02-backpressure.mmd` | Pause/resume hysteresis (60 s / 20 s); one `buffer.halt` span per cycle — `StreamingService` ↔ `BufferManager` ↔ `<video>` |
| 3 | `docs/diagrams/streaming-03-seek.mmd` | Seek slider, buffered-vs-not branch, chunk-boundary snap |
| 4 | `docs/diagrams/streaming-04-resolution-switch.mmd` | Offscreen `bgBuffer` fill + promotion to foreground |

Each diagram has a matching `.png` in the same directory (committed — `!docs/diagrams/*.png` is whitelisted in `.gitignore`) and a `## Scenario N:` subsection in `docs/architecture/Streaming/01-Playback-Scenarios.md`.

**`.mmd` is authoritative.** The `.png` is always regenerated from it. Never hand-edit a `.png` or treat it as a source.

## Steps

### 1. Identify the affected diagram(s)

Map your code change to one or more scenarios. A single change can span multiple diagrams — e.g. changing the back-pressure thresholds affects Scenario 2, but changing `STARTUP_BUFFER_S` affects Scenarios 1 and 4.

### 2. Edit the `.mmd` source

Rules for the Mermaid files:

- **ASCII only.** No em-dashes, no smart quotes, no parentheses with colons, no `→`, no HTML entities. The draw.io Mermaid parser rejects these silently or produces corrupt pako streams. Use `-` for dashes and `div` / `times` words instead of operators inside `Note` blocks.
- **Actor list at the top.** Only include actors the scenario actually uses — don't carry unused participants from other scenarios.
- **`autonumber` on.** Keeps screenshots cross-referenceable from the prose.
- **Keep comments minimal.** Two `%%` header lines max: title + one-line regen hint. Do not document the mermaid syntax in the mermaid file.
- **Call patterns:**
  - `A->>B: method(arg)` — synchronous call
  - `B-->>A: result` — response
  - `Note right of X: ...` — intra-actor note (e.g. span-open markers)
  - `Note over A,B: ...` — spans multiple actors
  - `loop / end` for polling/streaming loops
  - `alt / else / end` for branches (Scenario 3 uses this)

### 3. Regenerate the PNG screenshot

The draw.io MCP `open_drawio_mermaid` tool returns a viewer URL. Some payloads come back with a corrupt pako stream (stray `%` not followed by two hex digits), and draw.io's `decodeURIComponent` throws `URI malformed` on those. If the rendered page blanks, bypass the MCP and build the URL yourself.

**Option A — MCP path (try first):**

Call `mcp__drawio__open_drawio_mermaid` with the contents of the `.mmd` file. Open the returned URL in a headless Chrome and screenshot it.

**Option B — Python fallback (when MCP payload is corrupt):**

```sh
python3 - <<'PY'
import urllib.parse, json, base64, zlib, sys
mermaid = open('docs/diagrams/streaming-0N-name.mmd').read()
encoded = urllib.parse.quote(mermaid, safe='')
c = zlib.compressobj(9, zlib.DEFLATED, -15)   # raw deflate == pako.deflateRaw
compressed = c.compress(encoded.encode('utf-8')) + c.flush()
b64 = base64.b64encode(compressed).decode('ascii')
payload = json.dumps({'type': 'mermaid', 'compressed': True, 'data': b64})
hash_val = urllib.parse.quote(payload, safe='')
print(f'https://app.diagrams.net/?lightbox=1&edit=_blank&border=10#create={hash_val}')
PY
```

Use `?lightbox=1` — it hides the editor chrome so the screenshot is just the diagram.

**Screenshot with isolated Chrome user-data-dir:**

```sh
URL='<url from above>'
google-chrome --headless=new \
  --user-data-dir=/tmp/chrome-shot-$$ \
  --window-size=1600,1200 \
  --screenshot=.claude/screenshots/streaming-0N-name.png \
  "$URL"
```

A fresh `--user-data-dir` per invocation is required — a reused dir can surface a stale "All changes will be lost!" modal that blocks the diagram.

Verify the capture is non-blank (≥ 30 KB, renders all autonumbered steps):

```sh
ls -la .claude/screenshots/streaming-0N-name.png
file .claude/screenshots/streaming-0N-name.png
```

Then move it into the docs tree:

```sh
cp .claude/screenshots/streaming-0N-name.png docs/diagrams/streaming-0N-name.png
```

### 4. Update `docs/architecture/Streaming/01-Playback-Scenarios.md`

Each diagram has its own `## Scenario N:` subsection. When the diagram changes, the prose under it must stay consistent. Required structure:

```markdown
## Scenario N: <short name>

![<alt text>](../../diagrams/streaming-0N-name.png)

> Source: [`streaming-0N-name.mmd`](../../diagrams/streaming-0N-name.mmd)

<prose overview — numbered steps for linear flows, paragraphs for loops>
```

Rules for the prose:

- Refer to actors and methods by their real names (`PlaybackController`, `BufferManager.appendSegment`, `STARTUP_BUFFER_S`). Do not paraphrase.
- State invariants and thresholds as numbers (`20 s / 15 s`, `300 s chunks`, `MAX_CONCURRENT_JOBS = 3`). If a threshold changed, the prose number MUST change too.
- Do not duplicate the Mermaid steps verbatim — the prose exists to add the *why*, the screenshot shows the *what*.

### 5. Verify before committing

```sh
for f in docs/diagrams/streaming-0{1,2,3,4}-*.{mmd,png}; do
  test -f "$f" && echo "OK  $f  ($(wc -c < "$f") bytes)" || echo "MISS $f"
done
```

All eight files must exist. PNG sizes below ~30 KB almost always indicate a blank/error render — re-run step 3.

Grep the wiki for the filenames to confirm both the image and the source link resolve:

```sh
grep -c 'streaming-0[1-4]' docs/architecture/Streaming/01-Playback-Scenarios.md   # expect >= 8 (image + source link per scenario)
```

### 6. Commit all artifacts together

The `.mmd`, the `.png`, the wiki edit, and the underlying code change belong in the **same commit**. Reviewers should never see the code change land without the docs catching up. If the code landed in a prior commit on the branch, amend or add a follow-up commit — do not open a separate "docs" PR.

## Rules

- **`.mmd` is the source of truth.** PNGs are build artifacts, but they are committed so GitHub renders them inline.
- **ASCII-only Mermaid.** Non-ASCII characters silently break the draw.io parser.
- **Screenshots go to `.claude/screenshots/` first**, then are copied into `docs/diagrams/`. Never save directly into `docs/diagrams/` from Chrome — the `.claude/screenshots/` staging directory is where all skill screenshots live per project policy.
- **One scenario per diagram.** Do not merge scenarios into a single `.mmd` — the combined diagram is too dense to screenshot legibly.
- **Keep prose and diagram in lock-step.** If the prose says "20 s threshold" and the diagram says "25 s", the next agent will trust the wrong one. Update both or neither.


## After writing — notify architect

If this task edited code or docs, spawn the `architect` subagent before marking it complete:

- **Files changed** — paths touched by `Write`/`Edit` during the task.
- **Description** — one sentence on what changed.
- **Why** — fix / feature / refactor, with issue or memory link if applicable.

Architect decides whether `docs/`, `docs/SUMMARY.md`, or the architect index needs updating, and does so directly. For trivial changes (typo, lint-only) say so explicitly — architect logs and skips. See `CLAUDE.md → Update protocol`.
