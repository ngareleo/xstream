---
name: build
description: Build the server and client for production
disable-model-invocation: true
allowed-tools: Bash(bun *)
---

Build everything for production:

```bash
bun run build
```

Runs sequentially:
1. `bun run --filter server build` → `server/dist/index.js`
2. `bun run --filter client build` → `client/dist/`

The client build runs `tsc --noEmit` first, so TypeScript errors fail the build.

To start the production server after building:

```bash
cd server && bun run start
```

Set `PORT`, `DB_PATH`, `SEGMENT_DIR`, and `SCAN_INTERVAL_MS` as needed. Run `/check-env` with `--prod` first.

If the build fails with missing `__generated__/` imports, run `bun relay` from `client/` first.
