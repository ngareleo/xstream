---
name: dev
description: Start the full xstream development environment (server + client)
disable-model-invocation: true
allowed-tools: Bash(bun *)
---

Run the full dev environment:

```bash
bun run dev
```

This starts both workspaces in parallel:
- **Server** — `bun --watch src/index.ts` on `http://localhost:3001`
- **Client** — runs `relay-compiler` first, then `rsbuild dev` on `http://localhost:5173`

The Rsbuild proxy forwards `/graphql` to the server, including WebSocket upgrades for subscriptions.

If the client fails to start with a missing `__generated__/` import, run `bun relay` from `client/` first.

To stop everything: `bun run stop`
