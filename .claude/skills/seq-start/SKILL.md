---
name: seq-start
description: Start the Seq structured log management container for viewing OpenTelemetry traces and logs
disable-model-invocation: true
allowed-tools: Bash(docker *) Bash(bun *)
---

Start (or create) the Seq container:

```bash
bun run seq:start
```

- Already running → prints the URL and exits.
- Stopped container → restarts it.
- No container → creates one from `datalust/seq:latest` on port `5341`, persisting data to `SEQ_STORE` (default `~/.seq-store`).

Seq UI: **http://localhost:5341**

**First-time API key setup:**
1. Open http://localhost:5341 → Settings → API Keys → Add API Key
2. Copy the key into `.env`: `OTEL_EXPORTER_OTLP_HEADERS=X-Seq-ApiKey=<key>`
3. Restart the dev server — traces and logs flow into Seq automatically.

Requires Docker to be running (`docker info`).
