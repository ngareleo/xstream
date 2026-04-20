---
name: format
description: Format all TypeScript, TSX, and JSON files with Prettier
disable-model-invocation: true
allowed-tools: Bash(bun *)
---

Auto-format all files:

```bash
bun run format
```

Check without writing (CI mode):

```bash
bun run format:check
```

Config is in `.prettierrc.json`. Ignored paths are in `.prettierignore` (covers `relay/__generated__/`, `dist/`, `node_modules/`).

lint-staged runs Prettier automatically on staged files at commit time, so manual formatting is only needed for unstaged files.
