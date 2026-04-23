# Configuration and Backends

## Environment variables

### Server

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:5341/ingest/otlp` | OTLP base URL (no trailing slash, no `/v1/...` path) |
| `OTEL_EXPORTER_OTLP_HEADERS` | _(empty)_ | Comma-separated `Key=Value` headers, e.g. `X-Seq-ApiKey=abc123` |

### Client (baked at build time by Rsbuild)

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_OTEL_ENDPOINT` | `/ingest/otlp` | OTLP base URL for browser. Relative path works in dev (proxied). Use full URL in prod. |
| `PUBLIC_OTEL_HEADERS` | _(empty)_ | Comma-separated `Key=Value` headers for browser OTLP export |

## Switching to a production backend

To route telemetry to Axiom in production, update the env vars (no code changes needed):

```bash
# Server
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.axiom.co
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <axiom-token>,X-Axiom-Dataset=xstream-prod

# Client (set before running bun run build)
PUBLIC_OTEL_ENDPOINT=https://api.axiom.co
PUBLIC_OTEL_HEADERS=Authorization=Bearer <axiom-token>,X-Axiom-Dataset=xstream-prod
```

Axiom accepts OTLP/HTTP natively. Other OTLP-compatible backends (Grafana Cloud, Honeycomb, Jaeger, etc.) follow the same pattern — just change the endpoint and headers.

## Seq API key setup

1. Run `bun run seq:start` — this auto-generates `.seq-credentials` on first run (gitignored, project root) and boots the container. Open [http://localhost:5341](http://localhost:5341).
2. Sign in with the username + password from `.seq-credentials`:
   ```sh
   grep '^SEQ_ADMIN_USERNAME=' .seq-credentials | cut -d= -f2
   grep '^SEQ_ADMIN_PASSWORD=' .seq-credentials | cut -d= -f2
   ```
   Seq forces a password change on the first login — pick a new password and immediately write it back to `.seq-credentials` so the `/otel-logs` skill (and future logins) can still find it:
   ```sh
   printf 'SEQ_ADMIN_USERNAME=admin\nSEQ_ADMIN_PASSWORD=<new>\n' > .seq-credentials
   ```
3. Navigate to **Settings → API Keys → Add API Key**
4. Give it a name (e.g. `xstream-dev`), set permissions to **Ingest**
5. Copy the key and add it to `.env`:
   ```
   OTEL_EXPORTER_OTLP_HEADERS=X-Seq-ApiKey=<key>
   PUBLIC_OTEL_HEADERS=X-Seq-ApiKey=<key>
   ```
6. Restart the dev server (`bun run dev`) — telemetry will start flowing immediately

To reset Seq entirely (forget the container-initial password), see CLAUDE.md → "Local Dev Setup → Seq credentials" — you must delete both the container and `~/.seq-store` before `SEQ_FIRSTRUN_ADMINPASSWORD` will be honoured again.

## Release-time metrics

See `docs/todo.md` items `OBS-001` through `OBS-004` for the planned metrics instrumentation (buffer rates, error classification, usage metrics). These require the OTel metrics SDK (`MeterProvider`) which is not yet wired up.
