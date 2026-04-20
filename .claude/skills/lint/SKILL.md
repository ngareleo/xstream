---
name: lint
description: Run TypeScript type-checking and ESLint across all packages
disable-model-invocation: true
allowed-tools: Bash(bun *) Bash(bunx eslint *)
---

Lint all packages:

```bash
bun run lint
```

Runs `tsc --noEmit && eslint src` in both `server/` and `client/`. A clean run exits 0.

To lint a single package:

```bash
cd server && bun run lint
cd client && bun run lint
```

To auto-fix ESLint violations:

```bash
cd server && bunx eslint src --fix
cd client && bunx eslint src --fix
bun run format
```

Key rules: explicit return types on exports, no floating promises, `import type` for type-only imports, no `!` non-null assertions, no `../` cross-module imports in `client/` (use `~/` alias instead).
