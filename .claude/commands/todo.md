Read the file at `docs/todo.md` in the current project root.

If arguments are provided, interpret them as one of the following commands:

- `add <text>` — Append a new TODO item under the most appropriate section. Infer the section from context (e.g. mentions of streaming → "Streaming / Playback", disk/storage → "Cache / Storage", UI/settings → "Settings / UI"). Auto-assign the next ID within that section (e.g. SEEK-002 if SEEK-001 exists). Format: `- [ ] **ID** Description.`
- `done <id>` — Mark the item with that ID as complete: change `- [ ]` to `- [x]`.
- `list` — Display all open (`- [ ]`) items grouped by section, formatted as a concise list.
- `list all` — Display all items including completed ones.

If no arguments are given, display all open items grouped by section and ask the user what they'd like to do.

After any modification, write the updated file back to `docs/todo.md`.

Keep item descriptions concise (one sentence for the summary, optional detail sentence). Do not add metadata beyond the ID and checkbox.
