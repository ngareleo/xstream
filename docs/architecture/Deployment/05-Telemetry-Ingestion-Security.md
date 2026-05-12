# Telemetry ingestion security

The production telemetry pipeline ships every release Tauri install with embedded API tokens for our Axiom dataset (see [`04-Axiom-Production-Backend.md`](04-Axiom-Production-Backend.md)). Those tokens are extractable from any downloaded binary. This doc captures the threat model, the defence layers that make that surface acceptable for alpha, and the things we explicitly are **not** doing yet.

The same logic applies to any backend we swap in (Grafana Cloud, Honeycomb, self-hosted Seq) — only the specific control surfaces change.

## Threat model

**Surface.** xstream's release bundle ships to anonymous users from a public download. The OTLP exporter inside the binary needs credentials to write to Axiom. Anyone who installs the legitimate binary can:

1. Run the OS-level tool of their choice (`strings`, `ldd`, a debugger, `gron` against the asar/js bundle) to recover both API tokens.
2. Use those tokens to POST arbitrary OTLP payloads to `https://api.axiom.co/v1/{traces,logs}` for our `xstream` dataset.

**Who would do this.** A bored attacker who wants to make our debugging hard, a competitor with no real upside, or an automated scanner trawling installer files for credentials. None of these are well-funded or persistent — the upside for the attacker is minimal because:

3. The token cannot **read** any data (Basic API tokens are ingest-only).
4. The token cannot **enumerate or delete** datasets.
5. The token is scoped to one dataset (`xstream`); it cannot bleed into anything else we run in Axiom.

**Blast radius.** A leaked token's worst case:

- **Pollute our 30-day retention window** with fake events. Costs us signal-to-noise during debugging, and burns into our 500 GB/mo ingest quota.
- **Trigger Axiom rate-limit responses** that look like legitimate traffic flapping. Annoying, not catastrophic.

What it **cannot** do:

- Read existing telemetry. (Basic tokens are ingest-only.)
- Read any other dataset we run. (Dataset-scoped.)
- Modify or delete data already in the dataset. (Ingest-only — no admin paths.)
- Pivot to billing, account settings, or user management. (Not a PAT.)
- Pivot to any other system we run. (Token is Axiom-only.)

## Defence in depth (alpha posture)

Five layers, none of which require us to write code:

### 1. Ingest-only token scope

Both production tokens are Axiom **Basic API tokens** with `Allowed actions = Ingest` and `Datasets = xstream`. No "Query" scope, no "Manage" scope. A leak gives an attacker the same surface the legitimate binary has — writes to one dataset, nothing else.

This is the load-bearing control. Verified in the bring-up checklist at [`04-Axiom-Production-Backend.md` § "Bring-up checklist"](04-Axiom-Production-Backend.md).

### 2. Two tokens, not one

Server (`xstream-server`) and client (`xstream-client`) get distinct tokens with identical scope. A leak that originates on one surface (say, an attacker pulls the client token out of the JS bundle but never touches the native server binary) can be revoked without taking down the other side of telemetry.

### 3. Dataset isolation

The `xstream` dataset is the only place these tokens can write. Other Axiom datasets we add later (e.g. `xstream-staging`) live behind separate tokens with separate scopes. A poisoned `xstream` does not poison anything else.

### 4. Easy rotation

Token rotation = cut a release with new token values + revoke old. The procedure is in [`04-Axiom-Production-Backend.md` § "Rotating a token"](04-Axiom-Production-Backend.md). Rotation is release-bound, not server-side-bound, but it's a routine release-engineering step. Once we detect abuse we can disable the leaked token in the Axiom UI within seconds; the new release ships when CI completes.

### 5. Rate-limit and ingest cap as a backstop

Axiom enforces per-account rate limits (current values undocumented in their public docs; verify before relying on them as a tripwire). The 500 GB/mo personal-plan ingest cap is itself a backstop — if an attacker tries to fill it, the dataset stops ingesting before they can rack up cost. The legitimate signal stops too, which is bad for us, but it's a self-limiting attack and resolves the moment we rotate.

## Binary distribution surface

Tauri's signed self-hosted updater (Ed25519 signature over the binary asset, see [`00-Tauri-Desktop-Shell.md` § 6](00-Tauri-Desktop-Shell.md#6-self-hosted-updates)) protects **integrity** — an attacker cannot trick our auto-updater into shipping a tampered installer onto our users' machines, because the signature verification happens before install.

That protection does **not** extend to secret extraction:

- An attacker who installs the legitimate binary holds a copy of the bundle. They can inspect it offline.
- The Ed25519 keypair is for *signing what we ship*, not *encrypting what we ship*. Anyone who downloads the official release sees what we send.

This is a well-understood property of any client-side embedded credential. The threat is real but bounded by § "Defence in depth" above.

If we ever discover the private signing key has leaked, that is **catastrophic** — an attacker can ship a signed update that runs arbitrary code on every user's machine. The remediation in that case is documented in [`00-Tauri-Desktop-Shell.md` § "Signing keys"](00-Tauri-Desktop-Shell.md#signing-keys). A leaked ingestion token is **annoying**; a leaked signing key is **emergency**. Different incident classes, different runbooks.

## What we are NOT doing for alpha

Each of these is a real defence-in-depth option. Each is deferred with a stated reason.

### Per-install enrollment

A first-run handshake where the desktop app talks to a small "enroll" endpoint we host, receives an install-scoped ingestion token, and uses that going forward. A leak only exposes one user's slot, which we can revoke without touching the release bundle.

Deferred because:
- Requires us to run an enrollment endpoint, which is the cost we just pivoted *away* from.
- Doesn't actually solve the "attacker extracts and uses the embedded enrollment client_secret" problem; it pushes it down one layer.
- We have not seen a real leak; the rate-limit + revocation defence is sufficient for alpha.

Re-evaluate after either (a) a real leak, or (b) 90 days of alpha data with no incidents.

### Mutual TLS

Single-tenant single-API-key over HTTPS. mTLS would prevent a third party with the token but no client cert from writing — but the same attacker who extracts the token can extract the client cert from the same bundle, so the threat model doesn't actually change. Pure operational drag.

### Client-side proof-of-work / captcha

A POW on every OTLP export would raise the cost of fake-event flooding. It would also add latency to every legitimate export, and adds a non-trivial maintenance surface (POW difficulty tuning). At alpha scale the rate-limit backstop is cheaper and equally effective.

### Per-event signing

We could HMAC each OTLP payload with a key the server side only generates for "trusted" senders. Same observation as mTLS — the key has to live in the client bundle, and an attacker who pulls the API token can pull the HMAC key too. Doesn't move the needle.

## Tripwires

Things to look for in the Axiom UI to detect abuse early. Set as monitors on the `xstream` dataset under **Settings → Monitors**.

- **Ingest rate spikes.** Baseline is roughly N events/min per active install — establish the real number after the first week of alpha. A monitor triggering on >10× baseline should fire a notification.
- **Malformed payload ratio.** Axiom rejects malformed OTLP and exposes the reject rate in its ingestion dashboard. A non-trivial reject rate from a single token means someone is fuzzing or hand-crafting payloads, not running the real binary.
- **Geographic spread.** Axiom does not currently expose source-IP in event metadata on the free tier (verify), but if we later opt in to retaining the ingest IP, a token suddenly ingesting from a single IP that does not match the expected install distribution is suspicious.
- **Resource attribute distribution.** Our spans carry `service.name`, `service.version`, `os.type`, `host.arch`. A token suddenly ingesting events with mismatched or absent resource attributes is not running our binary.

The APL queries to surface these signals will land in `02-Searching-Axiom.md` when we write it — for now, hand-roll them in the Axiom UI.

## Cross-references

- [`04-Axiom-Production-Backend.md`](04-Axiom-Production-Backend.md) — the operational runbook this doc protects.
- [`00-Tauri-Desktop-Shell.md` § 6](00-Tauri-Desktop-Shell.md#6-self-hosted-updates) — bundle integrity via Ed25519 signing. Different threat class.
- [`../Observability/01-Logging-Policy.md` § PII Redaction](../Observability/01-Logging-Policy.md#pii-redaction) — what is scrubbed before export; the redaction guarantee is what makes always-on telemetry defensible.
- [`../../product/Privacy/00-Telemetry.md`](../../product/Privacy/00-Telemetry.md) — user-facing disclosure of the same surface.
