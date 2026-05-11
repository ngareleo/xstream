# Axiom production telemetry backend

xstream's production OTel sink is [Axiom](https://axiom.co), a hosted log + trace store. Free-tier headroom is ~3,000× our current ingest rate (see § "Free-tier headroom" below), so we get production telemetry without running our own droplet, Caddy, or ACME stack.

OTel SDK wiring is unchanged from local dev — only the env-var values flip when the release binary is built. Local dev continues to use the embedded Seq container via `scripts/seq-start.sh`; nothing in this document affects that flow.

## Why Axiom for production

- **OTLP/HTTP native.** Axiom accepts OpenTelemetry over HTTP at `/v1/traces` and `/v1/logs` without a collector. Our existing exporters (`opentelemetry_otlp` on the server, `@opentelemetry/exporter-trace-otlp-http` + `@opentelemetry/exporter-logs-otlp-http` on the client) post directly.
- **Zero maintenance.** No droplet to patch, no TLS cert to renew, no disk to monitor. The cost of self-hosting Seq was disproportionate to the value at alpha scale.
- **Reversible.** The env-var contract in [`../Observability/03-Config-And-Backends.md`](../Observability/03-Config-And-Backends.md) is backend-agnostic — swapping Axiom for Grafana Cloud, Honeycomb, or a re-hosted Seq later is a one-line endpoint change in CI.

## Free-tier headroom

Axiom's Personal plan (free forever, no credit card) at 2026-05-11:

| Limit | Personal plan | Our current footprint |
|---|---|---|
| Monthly ingest | 500 GB | ~180 MB/month (extrapolated from local-dev: 115 MB / 19 days) |
| Retention | 30 days | We want 30; this matches the privacy doc |
| Datasets | 2 | We use 1 for prod (see § "Datasets") |
| User seats | 1 | Alpha: single shared admin account in password manager |
| Query compute | 10 GB-hrs/mo | Plenty for hand-rolled trace lookups |

If real-install traffic balloons past 500 GB/mo we revisit (Axiom Cloud Team is the next rung). If the team grows past one operator before that, we either upgrade for the seat or stand up a read-only OAuth proxy.

## Datasets

We provision **one** Axiom dataset on the free plan:

- **`xstream`** — production telemetry from release Tauri installs.

The second dataset slot is reserved (e.g. for `xstream-staging` once we cut a beta channel, or for a load-test capture).

**Why not split dev into Axiom?** Two reasons:
1. The 2-dataset cap is tight; spending one slot on dev work would burn the spare.
2. Local Seq is already in place via `scripts/seq-start.sh` — it's faster to query, has no quota, and keeps dev signal off the production-cost meter.

The boundary stays clean: **a release build hits Axiom; everything else hits local Seq**. The `dev` vs `prod` switch is the OTLP endpoint env-var, not a dataset attribute.

## API tokens

Two **Basic API tokens** — Axiom's ingest-only token type, scoped at the dataset level. Created in **Settings → API tokens → New API token**, with **Allowed actions = Ingest** and **Datasets = `xstream`**.

- `xstream-server` — used by `xstream-server-rust` inside the Tauri shell.
- `xstream-client` — used by the browser-side OTel exporter.

Two tokens, not one, so either can be revoked without taking down the other side. Both are baked into the release Tauri bundle (the client one via Rsbuild at build time, the server one via the release env). Token rotation = cut a new release with new tokens, then revoke the old ones in the Axiom UI — see § "Rotating a token" below.

Basic API tokens cannot read data, cannot list datasets, cannot manage users. A leaked token's worst case is rate-limited spam into a single dataset. The threat model is documented in full at [`05-Telemetry-Ingestion-Security.md`](05-Telemetry-Ingestion-Security.md).

## Build-env contract

The env vars baked into the release Tauri bundle:

```bash
# Server (xstream-server-rust running inside the Tauri shell)
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.axiom.co
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <xstream-server-token>,X-Axiom-Dataset=xstream

# Client (Rsbuild bakes PUBLIC_* into the JS bundle at build time)
PUBLIC_OTEL_ENDPOINT=https://api.axiom.co
PUBLIC_OTEL_HEADERS=Authorization=Bearer <xstream-client-token>,X-Axiom-Dataset=xstream
```

The full env-var schema (defaults, dev values, how the exporters consume them) lives in [`../Observability/03-Config-And-Backends.md`](../Observability/03-Config-And-Backends.md). This file just documents the production values.

### Where the tokens live

GitHub Actions repository secrets, read by the release workflow only:

- `AXIOM_INGEST_TOKEN_SERVER`
- `AXIOM_INGEST_TOKEN_CLIENT`

The release workflow exports them as `OTEL_EXPORTER_OTLP_HEADERS` / `PUBLIC_OTEL_HEADERS` before invoking `bun run build` and `cargo tauri build`. They never appear in repo files, never in commits, never in `.env.example`.

PR and main-branch CI runs do **not** receive these secrets — Rsbuild's `PUBLIC_*` substitution falls back to the dev defaults (relative `/ingest/otlp` path), which the dev Vite proxy points at local Seq. CI does not produce telemetry as a result; that's intentional.

## Accessing the dataset (dev-time)

Single admin login at `https://app.axiom.co`, credentials in the team password manager. The free-tier 1-user cap means we don't have per-developer accounts at alpha — every operator uses the shared login. Two follow-ups when we outgrow this:

1. **Two operators needed simultaneously:** upgrade to Axiom Cloud Team ($25/seat at present), or proxy reads through a small Cloudflare Worker with org SSO.
2. **Read-only access for a teammate:** Axiom's role model supports read-only members on paid tiers; not exposed on free.

For trace/log query syntax, Axiom uses **APL** (Axiom Processing Language). It is *not* the same as Seq's SQL-like filter. APL primer: <https://axiom.co/docs/apl/introduction>. We'll add a `docs/architecture/Observability/02-Searching-Axiom.md` sibling to the existing Seq guide once someone actually needs to query prod regularly.

## Rotating a token

Token rotation is **release-bound** because the tokens are baked into the bundle at build time:

1. **Settings → API tokens → New API token** in the Axiom UI. Same scope as the old one (Ingest, dataset `xstream`). Label it with a date suffix.
2. Update the matching GitHub Actions secret (`AXIOM_INGEST_TOKEN_SERVER` or `AXIOM_INGEST_TOKEN_CLIENT`).
3. Cut a release. The new bundle ships with the new token.
4. Once the release is out and analytics show installs migrating to it (give it ~2 weeks for the auto-updater to catch most users), **revoke the old token** in Axiom.
5. Until step 4 completes, both tokens are live. That's fine — they have identical scope.

This is intentionally less ergonomic than rotating a server-side secret. The build-bake constraint is a real cost we accept; the alternative (per-install enrollment) is enumerated as a deferred decision in [`05-Telemetry-Ingestion-Security.md` § "What we are NOT doing for alpha"](05-Telemetry-Ingestion-Security.md).

## Bring-up checklist

Executable top-to-bottom for someone with no prior Axiom setup.

- [ ] Sign up at <https://axiom.co/signup> (free, no card). Use the team email so the account is recoverable.
- [ ] **Settings → Datasets → New dataset** → name: `xstream`. Retention defaults to 30 days; leave it.
- [ ] **Settings → API tokens → New API token** for `xstream-server`:
  - Description: `xstream-server (release build)`
  - Allowed actions: **Ingest** only
  - Datasets: `xstream`
  - Copy the displayed token immediately — Axiom won't show it again.
- [ ] Repeat for `xstream-client`.
- [ ] Store both tokens in the team password manager (master record + one entry per token).
- [ ] **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**:
  - `AXIOM_INGEST_TOKEN_SERVER` = the server token
  - `AXIOM_INGEST_TOKEN_CLIENT` = the client token
- [ ] In the release workflow YAML (separate PR, not in this docs PR), wire the secrets into the build env. See the env-var contract above for the exact mapping.
- [ ] Cut a release tag. Watch the **Stream** view in Axiom for the `xstream` dataset — events should appear within ~30 seconds of an install opening the app for the first time.
- [ ] **Settings → Notifications** → set a low-volume monitor for ingest spikes (>10× baseline) so we notice if a token is being abused (see [`05-Telemetry-Ingestion-Security.md` § Tripwires](05-Telemetry-Ingestion-Security.md)).

## Open questions

1. **Per-install enrollment.** Every release bundle embeds the same two tokens. A motivated attacker who downloads our installer can extract them and dump fake events. Mitigations (rate limit + revocation + dataset-only scope) are documented in [`05-Telemetry-Ingestion-Security.md`](05-Telemetry-Ingestion-Security.md). Re-evaluate after a real leak or after 90 days of alpha data.
2. **Crash reporting.** Distinct from telemetry (we don't ship `panic!` traces today). Axiom can receive them as log records; alternatives are Sentry or `crashpad`. Decide before v1.
3. **Metrics SDK.** `OBS-001` through `OBS-004` in `docs/todo.md` track wiring up the OTel `MeterProvider`. When that lands, Axiom requires a **separate** dataset for metrics (it enforces signal-per-dataset for `/v1/metrics`). With 2 free datasets, we either burn the spare on metrics or upgrade.

## Cross-references

- [`../Observability/00-Architecture.md`](../Observability/00-Architecture.md) — OTel SDK wiring overview.
- [`../Observability/03-Config-And-Backends.md`](../Observability/03-Config-And-Backends.md) — full env-var schema for both sides.
- [`../Observability/01-Logging-Policy.md` § PII Redaction](../Observability/01-Logging-Policy.md#pii-redaction) — what gets scrubbed before export.
- [`05-Telemetry-Ingestion-Security.md`](05-Telemetry-Ingestion-Security.md) — threat model, defence in depth, distribution surface.
- [`00-Tauri-Desktop-Shell.md` § 6](00-Tauri-Desktop-Shell.md#6-self-hosted-updates) — release signing (protects bundle integrity; does not prevent token extraction from a legitimate install).
- [`../../product/Privacy/00-Telemetry.md`](../../product/Privacy/00-Telemetry.md) — user-facing disclosure of what we collect.
