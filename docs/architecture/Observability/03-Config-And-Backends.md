# Configuration and Backends

## Environment variables

### Server

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:5341/ingest/otlp` | Default OTLP base URL (no trailing slash, no `/v1/...` path). Points at local Seq in dev. |
| `OTEL_EXPORTER_OTLP_HEADERS` | _(empty)_ | Comma-separated `Key=Value` headers for the default endpoint, e.g. `X-Seq-ApiKey=abc123`. |
| `OTEL_EXPORTER_OTLP_AXIOM_ENDPOINT` | _(empty)_ | OTLP base URL used when `flag.useAxiomExporter` is ON. Typically `https://api.axiom.co`. |
| `OTEL_EXPORTER_OTLP_AXIOM_HEADERS` | _(empty)_ | Comma-separated `Key=Value` headers for the Axiom endpoint, e.g. `Authorization=Bearer <token>,X-Axiom-Dataset=xstream`. |
| `XSTREAM_VARIANT` | _(unset → "dev")_ | Drives the prod/dev build split (`03-Build-Variants.md`) and the `deployment.environment` resource attribute on every span (`development` vs `production`). |

### Client (baked at build time by Rsbuild)

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_OTEL_ENDPOINT` | `/ingest/otlp` | Default OTLP base URL for browser. Relative path works in dev (proxied). |
| `PUBLIC_OTEL_HEADERS` | _(empty)_ | Comma-separated `Key=Value` headers for the default endpoint. |
| `PUBLIC_OTEL_AXIOM_ENDPOINT` | _(empty)_ | OTLP base URL used when `flag.useAxiomExporter` is ON. Typically `https://api.axiom.co`. |
| `PUBLIC_OTEL_AXIOM_HEADERS` | _(empty)_ | Comma-separated `Key=Value` headers for the Axiom endpoint. |

The `flag.useAxiomExporter` feature flag in [`../../client/Feature-Flags/00-Registry.md`](../../client/Feature-Flags/00-Registry.md) chooses between the default and `*_AXIOM_*` pair at boot. Client picks up the change on the next page load; the server reads the flag from SQLite at startup and therefore requires an app restart. The flag is dead-code-eliminated in production builds — release bundles always use the values that CI bakes into `PUBLIC_OTEL_ENDPOINT` / `OTEL_EXPORTER_OTLP_ENDPOINT`.

## Production backend: Axiom

Production Tauri installs ship telemetry to a single Axiom dataset (`xstream`). Axiom accepts OTLP/HTTP natively, so the exporters above post directly with no collector in front. The operational runbook (account setup, datasets, API tokens, build-env wiring, rotation, bring-up checklist) is at [`../Deployment/04-Axiom-Production-Backend.md`](../Deployment/04-Axiom-Production-Backend.md). Threat model and embedded-token safeguards live at [`../Deployment/05-Telemetry-Ingestion-Security.md`](../Deployment/05-Telemetry-Ingestion-Security.md).

Env-var contract (baked into the release Tauri bundle via the CI build env):

```bash
# Server (xstream-server-rust running inside the Tauri shell)
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.axiom.co
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <xstream-server-token>,X-Axiom-Dataset=xstream

# Client (Rsbuild bakes PUBLIC_* into the JS bundle at build time)
PUBLIC_OTEL_ENDPOINT=https://api.axiom.co
PUBLIC_OTEL_HEADERS=Authorization=Bearer <xstream-client-token>,X-Axiom-Dataset=xstream
```

Two distinct **Basic API tokens** (ingest-only, dataset-scoped) — one per surface — so either side can be revoked without taking down the other. When the resolved endpoint is non-localhost, the PII-redaction layer activates automatically — see [`01-Logging-Policy.md` § PII Redaction](01-Logging-Policy.md#pii-redaction).

### Alternative: Grafana Cloud, Honeycomb, self-hosted Seq, etc.

The env-var contract is provider-agnostic — Axiom is just the values we ship at alpha. Any OTLP/HTTP backend works by swapping the endpoint and the auth header:

```bash
# Grafana Cloud OTLP
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-<region>.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64 user:token>

# Honeycomb
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=<api-key>,x-honeycomb-dataset=xstream
```

Self-hosted Seq behind Caddy + Let's Encrypt is also an option (we ran the spike for it; the data footprint did not justify the operational cost — see commit history on `docs/remote-seq` for the abandoned runbook).

## Local dev: Seq API key setup

Production points at Axiom; local dev still runs an embedded Seq container so engineers see full unredacted attribute content while debugging. This section is for the local dev flow only — production tokens follow the runbook at [`../Deployment/04-Axiom-Production-Backend.md`](../Deployment/04-Axiom-Production-Backend.md).

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
