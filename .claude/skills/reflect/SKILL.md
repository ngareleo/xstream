---
name: reflect
description: Review the current session transcript and update skill files with new learnings, gotchas, and workflow improvements to help future agents
allowed-tools: Bash(ls *) Bash(cat *) Bash(grep *) Read Write Edit Glob
---

You are running a reflection pass over the current session. Your goal is to extract durable, actionable learnings and write them into the project's skill files so future agents don't repeat the same mistakes.

## What to look for

Scan the session transcript for:

- **Corrections** — moments where the user said "no", "stop", "that's wrong", or corrected your approach. These are the highest-value signals.
- **Repeated attempts** — cases where you tried the same thing twice before it worked. The second attempt's approach should be documented.
- **Surprising constraints** — things that turned out to be different from what you assumed (env vars, file formats, tool behaviour, Docker socket permissions, etc.).
- **Effective workflows** — multi-step sequences that worked cleanly and would save time if known upfront.
- **Dead ends** — approaches you tried that don't work in this codebase/environment. Document what NOT to do.

## Where to write

- **Skill file** — if a learning is scoped to a specific workflow (e2e testing, OTel setup, Seq), add it to the relevant `.claude/skills/<name>/SKILL.md` as a note, warning, or updated step.
- **CLAUDE.md** — if a learning is broadly applicable (a project invariant, a common mistake, a debugging pattern), add it to the relevant section of `CLAUDE.md`.
- **New skill** — if a recurring workflow emerged that doesn't have a skill yet, propose creating one.

## How to write learnings

Be surgical — add only what is genuinely non-obvious and saves future agents from a real mistake. Do not summarise what was done; only write what would prevent a future gotcha.

**Good:** `Seq only accepts OTLP in protobuf format — the -http exporter sends JSON which Seq silently rejects with 400. Always use -proto packages.`

**Bad:** `We switched from exporter-logs-otlp-http to exporter-logs-otlp-proto because Seq doesn't accept JSON.` (This is a narrative, not an instruction.)

Format new entries as short imperative notes or numbered steps, consistent with the existing style of the target file.

## Steps

1. Find the session transcript:
   ```sh
   ls -t ~/.claude/projects/$(ls -t ~/.claude/projects/ | head -1)/*.jsonl 2>/dev/null | head -1
   ```
   Read the most recent `.jsonl` file in the project's transcript directory.

2. Scan for the signals listed above. Keep a mental list of candidates before writing anything.

3. For each candidate learning:
   - Decide: skill file, CLAUDE.md, or new skill?
   - Check the target file — is this already documented? If yes, skip.
   - Write a concise, imperative note in the appropriate location.

4. Report what you added and where. If you found nothing worth adding, say so — that's a valid outcome.

## Scope

- Only update files in `.claude/skills/` and `CLAUDE.md` (both relative to the project root).
- Do not modify source code, tests, or documentation outside `.claude/`.
- Do not create new skill files unless a clear recurring workflow emerged — if in doubt, leave it out.
