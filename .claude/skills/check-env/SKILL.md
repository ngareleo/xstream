---
name: check-env
description: Audit environment variable configuration — use when setting up the project, before a production deploy, or after adding a new env var
allowed-tools: Bash(bun *)
---

Run the environment audit:

```bash
bun run check-env             # dev mode — warns on missing optionals
bun run check-env -- --prod   # production mode — errors on unsafe defaults
```

Loads `.env` from the repo root, then checks each variable with colour-coded output. Exit code 1 if any required variable is missing or a URL points to localhost in production.

| Helper | Behaviour |
|---|---|
| `check_secret` | Name in **bold green** if set, **bold red** if not. Value never printed. |
| `check_default` | Always passes — shows effective value or built-in default. |
| `check_optional` | Warns if unset. |
| `check_required` | Errors if unset. |
| `check_not_localhost` | Errors in `--prod` if URL still points to localhost. |

To add a new variable: add it to `.env.example`, add a `check_*` call in `scripts/check-env.sh`, and wire it into `server/src/config.ts` if the server reads it.
