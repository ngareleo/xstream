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

- **`xstream`** — telemetry from release Tauri installs, plus opt-in dev traffic tagged with `deployment.environment=development` for filtering.

The second dataset slot is reserved (e.g. for `xstream-staging` once we cut a beta channel, or for a load-test capture).

**Why one dataset for both prod and dev?** Two reasons:
1. The 2-dataset cap is tight; spending one slot on dev work would burn the spare.
2. The OTel `deployment.environment` resource attribute does the separation server-side at query time — every event carries `development` or `production`, so dev traffic is one APL filter away from being invisible to prod queries.

Default behaviour: **a release build hits Axiom; dev hits local Seq** (via `scripts/seq-start.sh`). The `flag.useAxiomExporter` feature flag (see § "Dev flow" below) lets a developer flip a single dev session to Axiom to verify the end-to-end pipeline.

## API tokens

Four **Basic API tokens** — Axiom's ingest-only token type, scoped at the dataset level. Created in **Settings → API tokens → New API token**, with **Allowed actions = Ingest** and **Datasets = `xstream`**.

| Token | Used by | Lives in |
|---|---|---|
| `xstream-server-prod` | release Tauri server-side OTLP exporter | GitHub Actions secret (release workflow only) |
| `xstream-client-prod` | release Tauri client-side OTLP exporter | GitHub Actions secret (release workflow only) |
| `xstream-server-dev` | local dev server when `flag.useAxiomExporter` is ON | repo-root `.env` (gitignored) |
| `xstream-client-dev` | local dev client when `flag.useAxiomExporter` is ON | repo-root `.env` (gitignored), baked into `bun run dev` build |

**Two tokens per environment** (server vs client) so either can be revoked without taking down the other side — extracting from the JS bundle is a different attack surface from extracting from the native binary. **Two environment tiers** (prod vs dev) so a leaked `.env` only burns dev credentials; production tokens live exclusively in CI secrets and never touch a developer machine.

Basic API tokens cannot read data, cannot list datasets, cannot manage users. A leaked token's worst case is rate-limited spam into a single dataset. The threat model is documented in full at [`05-Telemetry-Ingestion-Security.md`](05-Telemetry-Ingestion-Security.md).

Prod token rotation = cut a new release with new tokens + revoke old (see § "Rotating a token"). Dev tokens rotate independently with just a `.env` edit and an app restart.

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

## Dev flow — flipping a session to Axiom

The default dev backend stays local Seq (faster to query, no quota, no SaaS dependency). To verify the production pipeline end-to-end, flip the `flag.useAxiomExporter` feature flag in **Settings → Flags → telemetry**. See the [Feature-Flags registry row](../../client/Feature-Flags/00-Registry.md#telemetry) for the canonical description.

**Both sides must align.** Every meaningful xstream trace spans the browser → Rust server boundary via `traceparent` propagation. If the client posts to Axiom and the server posts to local Seq (or vice versa), the trace gets split between backends and is unqueryable in either. The flag therefore gates **both sides atomically**:

- **Client.** Picks up the change on next page reload — the browser exporter is reconstructed at module init.
- **Server.** Reads the flag from `user_settings` at boot. **Flag flips require an app restart on the server side.** The in-process OTLP exporter is constructed once at server startup; hot-swap is possible in the OTel Rust SDK but adds complexity for marginal value in a dev tool. The Flags-tab description surfaces this constraint.

What you need locally:
1. Both `xstream-server-dev` and `xstream-client-dev` tokens in `.env` (see § "API tokens" above).
2. The four `*_AXIOM_*` env vars set in `.env` (the env-var contract is in [`../Observability/03-Config-And-Backends.md`](../Observability/03-Config-And-Backends.md)).
3. Toggle the flag in Settings → Flags. Close + reopen the app.

Verify in the Axiom UI: open the `xstream` dataset, filter `where ['attributes.deployment.environment'] == 'development'`, trigger a playback session, confirm a single trace contains both client `playback.session` and server `stream.request` + `transcode.job` spans. Switching the flag back off (and restarting the app) returns to local Seq.

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
- [ ] **Settings → API tokens → New API token** — mint **four** tokens, all with Allowed actions: **Ingest** only, Datasets: `xstream`. Copy each immediately (Axiom won't show them again):
  - `xstream-server-prod` — release Tauri server-side OTLP.
  - `xstream-client-prod` — release Tauri client-side OTLP.
  - `xstream-server-dev` — dev server-side OTLP (used when `flag.useAxiomExporter` is ON).
  - `xstream-client-dev` — dev client-side OTLP (used when `flag.useAxiomExporter` is ON).
- [ ] Store the two `*-prod` tokens in the team password manager. **Never put them on a developer machine.**
- [ ] Drop the two `*-dev` tokens into the repo-root `.env` against the four `*_AXIOM_*` keys documented in `.env.example`.
- [ ] **GitHub repo → Settings → Secrets and variables → Actions → New repository secret** (prod only):
  - `AXIOM_INGEST_TOKEN_SERVER` = the `xstream-server-prod` token
  - `AXIOM_INGEST_TOKEN_CLIENT` = the `xstream-client-prod` token
- [ ] In the release workflow YAML (separate PR, not in this docs PR), wire the secrets into the build env. See the env-var contract above for the exact mapping.
- [ ] **Dev smoke test:** in the running app, flip **Settings → Flags → telemetry → `flag.useAxiomExporter`** to ON, close + reopen the app. Open the **Stream** view in Axiom for the `xstream` dataset filtered to `deployment.environment == 'development'` — events should appear within ~30 s of triggering a playback session.
- [ ] Cut a release tag. Watch the **Stream** view filtered to `deployment.environment == 'production'` — events from real installs should appear within ~30 s of someone opening the app.
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
