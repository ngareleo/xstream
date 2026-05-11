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

## Production backend: self-hosted Seq

Production Tauri installs ship telemetry to a self-hosted Seq instance running on a DigitalOcean droplet behind Caddy + Let's Encrypt. The bring-up runbook is at [`../Deployment/03-Remote-Seq-DigitalOcean.md`](../Deployment/03-Remote-Seq-DigitalOcean.md); the executable Docker Compose stack lives in [`seq/`](../../../seq/) at the repo root. For dev-time access patterns (public UI, SSH tunnel, dev-traffic filtering, fallback to local Seq), see [`../Deployment/05-Accessing-Remote-Seq.md`](../Deployment/05-Accessing-Remote-Seq.md). For ingestion-key security and the alpha-posture trade-offs, see [`../Deployment/04-Telemetry-Ingestion-Security.md`](../Deployment/04-Telemetry-Ingestion-Security.md).

Env-var contract (baked into the release Tauri bundle via the CI build env):

```bash
# Server (xstream-server-rust running inside the Tauri shell)
OTEL_EXPORTER_OTLP_ENDPOINT=https://seq.<your-domain>/ingest/otlp
OTEL_EXPORTER_OTLP_HEADERS=X-Seq-ApiKey=<ingestion-api-key>

# Client (Rsbuild bakes PUBLIC_* into the JS bundle at build time)
PUBLIC_OTEL_ENDPOINT=https://seq.<your-domain>/ingest/otlp
PUBLIC_OTEL_HEADERS=X-Seq-ApiKey=<ingestion-api-key>
```

The same ingestion API key works for both server and browser clients (Seq API keys are per-application bearer tokens with rate limits, not per-user credentials). When the resolved endpoint is non-localhost, the PII-redaction layer activates automatically — see [`01-Logging-Policy.md` § PII Redaction](01-Logging-Policy.md#pii-redaction).

### Alternative: Axiom or another OTLP SaaS

The env-var contract is provider-agnostic — to route telemetry to Axiom instead of self-hosted Seq:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.axiom.co
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <axiom-token>,X-Axiom-Dataset=xstream-prod

PUBLIC_OTEL_ENDPOINT=https://api.axiom.co
PUBLIC_OTEL_HEADERS=Authorization=Bearer <axiom-token>,X-Axiom-Dataset=xstream-prod
```

Axiom accepts OTLP/HTTP natively. Grafana Cloud, Honeycomb, Jaeger, etc. follow the same pattern — change the endpoint and headers. The trade-off vs self-hosted Seq is recorded in [`../Deployment/03-Remote-Seq-DigitalOcean.md` § Why self-hosted Seq](../Deployment/03-Remote-Seq-DigitalOcean.md#why-self-hosted-seq-vs-axiom--saas).

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
