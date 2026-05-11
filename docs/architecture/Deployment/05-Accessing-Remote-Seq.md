# Accessing the production Seq instance

How developers and operators reach the live self-hosted Seq during normal work — viewing traces, filtering noise, dropping into the box when the public hostname is misbehaving, and falling back to local Seq when the remote is unreachable.

This page is the expanded version of what was § "Operator access patterns" in [`03-Remote-Seq-DigitalOcean.md`](03-Remote-Seq-DigitalOcean.md); the runbook keeps a one-line pointer back here. For the bring-up details (provisioning, Caddy, API keys) the runbook is authoritative.

## Two access paths

### 1. Public UI (everyday path)

```
https://seq.<your-domain>
```

Sign in with the admin credentials stashed in the team password manager. This is the path 95% of dev-time inspection uses — searching by `trace_id`, filtering by `service.name`, scanning recent errors.

Use it when:

- Investigating a trace someone shared from a user report.
- Cross-correlating client + server spans under a single `traceId`.
- Building or tweaking a saved query.
- Reading any signal at all that's already inside Seq.

### 2. SSH tunnel (box-level work)

When the public hostname is broken — expired cert, Caddy crashed, certs in a renew-failed state, container restart needed — reach the loopback-bound Seq directly:

```bash
ssh -L 5341:localhost:5341 ops@<droplet-ip>
# In another terminal on your laptop:
open http://localhost:5341
# Container ops from the SSH session:
docker compose -f /home/ops/seq/docker-compose.yml logs -f seq
docker compose -f /home/ops/seq/docker-compose.yml restart caddy
```

The tunnel hits the `127.0.0.1:5341` binding Caddy normally proxies — bypassing Caddy is the point. Use it when:

- The public UI is unreachable and you need to know whether Seq itself is alive.
- You need to read container logs (Caddy ACME errors, Seq startup messages).
- You're rotating retention or applying a Seq settings change that requires a container restart.

The runbook § "Cert renewal" + § "Steady-state operations" cover the specific recipes — this section is just the access mechanic.

## Per-developer access policy

**Alpha posture: one shared admin account.** The credentials live in the team password manager; everyone who needs Seq access reads them from there. This is deliberately a simple shared-secret model.

Why not per-developer Seq users for alpha:

- The instance is single-tenant and managed by one ops person.
- Seq's user model is rich, but managing it (provisioning, deprovisioning, permission tiers) is its own ops surface.
- We want zero "I spun up a parallel Seq instance because I couldn't get into the shared one" friction — a single password in the manager makes the shared instance the path of least resistance.

If a teammate needs **read-only** access — e.g., a non-engineer reviewing playback metrics — create a Seq user via **Settings → Users** with the **User** role (read-only across all projects), not a second admin. Document the creation in the runbook bring-up checklist appendix when you do it.

Open question carried over from [`03-Remote-Seq-DigitalOcean.md` § Open questions](03-Remote-Seq-DigitalOcean.md#open-questions) #4: when the team grows past one ops person, revisit whether the admin login should rotate to a sponsor model (one named admin, the rest read-only).

## Filtering dev traffic out of production traces

When you point your local dev build at the remote Seq (e.g. to reproduce a user issue with a real datasource), your traces land in the same instance as real production traffic. Filter them apart with an attribute set at startup:

| Attribute | Production | Dev pointing at remote |
|---|---|---|
| `deployment.environment` | `production` | `development` |
| `service.instance.id` | random per-install UUID | your machine's hostname |

The OTel SDK setup in `server-rust/src/telemetry.rs` and `client/src/telemetry.ts` reads `OTEL_RESOURCE_ATTRIBUTES` for these — set it locally before running:

```bash
export OTEL_RESOURCE_ATTRIBUTES="deployment.environment=development,service.instance.id=$(hostname)"
```

Then in Seq, default your everyday saved queries to filter `deployment.environment = "production"` so dev noise doesn't pollute "is the app behaving?" dashboards.

This convention is documented here (rather than in the privacy disclosure) because it is purely a developer-side hygiene rule — production users always emit `deployment.environment=production` baked in at build time and have no way to override it.

## Offline / Seq-down behaviour

If the remote Seq is unreachable mid-debug — droplet outage, DNS hiccup, cert misbehaving — the OTel SDKs queue events in memory and retry the OTLP exporter's batch on the next interval. They do **not** persist to disk (intentionally — see [`../../product/Privacy/00-Telemetry.md` § In an offline app](../../product/Privacy/00-Telemetry.md#in-an-offline-app)). If the queue overflows before connectivity returns, the oldest events are dropped silently.

When this matters for debugging — i.e., you need to actually see your traces and the remote is down — fall back to **local Seq**:

```bash
bash scripts/seq-start.sh           # local container at http://localhost:5341
# Then point your local build at it:
unset OTEL_EXPORTER_OTLP_ENDPOINT   # falls back to the default localhost
unset OTEL_EXPORTER_OTLP_HEADERS
unset PUBLIC_OTEL_ENDPOINT
unset PUBLIC_OTEL_HEADERS
bun run dev                         # restart so the env changes take effect
```

The redaction layer activates only when the resolved endpoint is non-localhost (see [`../Observability/01-Logging-Policy.md` § PII Redaction](../Observability/01-Logging-Policy.md#pii-redaction)), so local Seq gives you the full unredacted attribute content — which is precisely what you want for debugging.

## Common queries

Saved-query authoring lives in [`../Observability/02-Searching-Seq.md`](../Observability/02-Searching-Seq.md) — that's the canonical home for Seq filter syntax and trace-scoped lookup patterns. This doc deliberately does not duplicate them; if a new common query emerges that everyone is rewriting, add it there.

## Cross-references

- Bring-up + steady-state ops: [`03-Remote-Seq-DigitalOcean.md`](03-Remote-Seq-DigitalOcean.md)
- Telemetry ingestion auth + distribution surface: [`04-Telemetry-Ingestion-Security.md`](04-Telemetry-Ingestion-Security.md)
- Local Seq lifecycle scripts: [`../../../scripts/seq-start.sh`](../../../scripts/seq-start.sh), [`../../../scripts/seq-stop.sh`](../../../scripts/seq-stop.sh)
- Seq query syntax: [`../Observability/02-Searching-Seq.md`](../Observability/02-Searching-Seq.md)
- PII redaction policy (why local dev sees full attributes, remote sees redacted): [`../Observability/01-Logging-Policy.md` § PII Redaction](../Observability/01-Logging-Policy.md#pii-redaction)
