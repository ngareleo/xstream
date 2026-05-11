# Telemetry ingestion security

How we keep the production Seq instance from getting flooded with fake data, and how the binary-distribution surface relates to that risk. Both concerns share one root: every shipped Tauri install embeds the same Seq ingestion API key, and we publicly distribute the binary that holds it. This document is the alpha-posture answer to "what stops an attacker from extracting that key and dumping garbage into our telemetry?"

For the bring-up runbook this policy ships into, see [`03-Remote-Seq-DigitalOcean.md`](03-Remote-Seq-DigitalOcean.md). For dev-time access to the running instance, see [`05-Accessing-Remote-Seq.md`](05-Accessing-Remote-Seq.md). For the user-facing privacy promise this defends, see [`../../product/Privacy/00-Telemetry.md`](../../product/Privacy/00-Telemetry.md).

## Threat model

The endpoint at `https://seq.<our-domain>/ingest/otlp` accepts OTLP/HTTP authenticated by `X-Seq-ApiKey: <token>`. That token is embedded — in plaintext — inside every shipped desktop binary, because the application has to authenticate at startup with no user involvement.

An attacker who reverse-engineers the binary (or just `strings`-greps it) extracts the token. With it they can:

- POST fake span/log payloads at our Seq endpoint.
- Burn through retention with junk events, displacing real signal.
- Trigger noisy queries / dashboards / alerts if we wire any.

They **cannot**:

- Read anyone else's telemetry. The token is **Ingest-scope only** (no Read, no Write, no Project admin). Re-state from [`03-Remote-Seq-DigitalOcean.md` § First-run Seq setup](03-Remote-Seq-DigitalOcean.md#first-run-seq-setup).
- Reach the droplet for anything besides ingestion — Caddy fronts only Seq; SSH is on a separate port behind key-only auth and a DO Cloud Firewall.
- Forge another user's telemetry in a way we can attribute. There is no per-user signing; every install is anonymous by design (see the privacy disclosure).

The realistic blast radius of a leaked key, then, is **rate-limited spam that pollutes our 14-day retention** — annoying, recoverable, and detectable.

## Defence in depth — alpha posture

Four layers, none of which is sufficient alone:

1. **Ingest-scope-only key.** No Read, no Write, no project admin. The key cannot be used to look at telemetry, change configuration, or escalate inside Seq. Configured at API-key creation time in the Seq UI per the runbook.

2. **Per-key rate limit (~10k events/minute).** Set when the key is minted. Sized to comfortably exceed healthy real usage at alpha scale (a busy install emits hundreds of events/minute, not thousands), but caps the cost of any single leaked key. A spammer can degrade retention slowly, not instantly.

3. **Easy rotation.** Generating a replacement key, rolling it into the release build, and revoking the old one is a few minutes of work. The mechanics live in [`03-Remote-Seq-DigitalOcean.md` § Rotating the ingestion API key](03-Remote-Seq-DigitalOcean.md#rotating-the-ingestion-api-key). Because rotation is cheap, the cost of "someone leaked the key" is "we rotate it" — not "we redesign our auth."

4. **One key per shipping component, both Ingest-only.** The desktop server (`OTEL_EXPORTER_OTLP_HEADERS`) and the desktop client (`PUBLIC_OTEL_HEADERS`) receive separate keys. If one is leaked, rotation can be scoped to that surface without disturbing the other. Both keys are bearer tokens, not user credentials — they identify the application, not the person.

## Binary distribution surface

The signed-update model in [`00-Tauri-Desktop-Shell.md` § 6](00-Tauri-Desktop-Shell.md#6-self-hosted-updates) is **adjacent to but not a substitute for** this story. Ed25519 update signing protects **binary integrity**: an attacker cannot ship a tampered installer to our users via the update channel, because Tauri verifies the signature against the public key baked into `tauri.conf.json` before applying anything. The compromised-signing-key scenario described there is far more catastrophic than the compromised-ingestion-key scenario described here.

But signed updates do nothing against **secret extraction from a legitimate binary**: the attacker downloads our genuine signed installer, runs it, dumps the process memory or scans the executable, and finds the API key. There is no cryptographic protection against this — embedded secrets in client-distributed software are extractable in principle, always.

The two stories link from both directions:

- This doc → [`00-Tauri-Desktop-Shell.md` § 6](00-Tauri-Desktop-Shell.md#6-self-hosted-updates) for the integrity story.
- That doc gets a back-link from § 6 to this section for the secret-extraction story.

## What we are NOT doing for alpha

Each of these is a reasonable mitigation we are explicitly choosing not to ship now. Re-evaluate after a real leak or after 30 days of real-world ingest data.

- **Per-install API-key enrollment.** A first-run handshake could mint a unique key per install, capping blast radius to one user if any single binary is reverse-engineered. We defer because the enrollment endpoint becomes a new attack surface (anyone can request a key) and we'd then need anti-abuse on enrollment — which lands us back in the same threat model one level up. Acceptable today because we are pre-prod and our user count is small enough that a rotation handles any incident.
- **Captcha / proof-of-work on the OTLP endpoint.** Adds latency to every export and complicates the OTel SDK integration for marginal security gain at our scale. Re-evaluate if we observe automated abuse.
- **Mutual TLS.** The single-tenant, single-API-key shape means mTLS adds operational drag (cert distribution, rotation) without changing the leaked-key threat — the attacker still has whatever the client has.
- **Geo-IP allow/deny.** No fixed user geography; would only fire on automated abuse, which the rate limit handles equivalently.

## Tripwires

Things to watch in Seq once telemetry is live, so abuse is noticed before it pollutes retention badly:

- **Events/minute per API key.** Healthy steady state is a function of installed-user count; a spike to the rate-limit ceiling is suspicious. Filter on `@SeqApiKey` (the attribute Seq attaches to ingested events).
- **Ratio of malformed to well-formed payloads.** Real OTLP from our SDKs has stable schema; junk events tend to fail attribute-schema constraints. Seq's ingestion-rejected counters surface this.
- **Source-IP diversity per key.** A legitimate desktop install ingests from one IP per session. A single key suddenly ingesting from hundreds of IPs is a leak indicator.
- **Untyped or attacker-controlled `service.name` values.** Our SDKs always set `service.name=xstream-server` or `xstream-client`. Foreign values are abuse.

Query syntax for these — and other Seq filters — lives in [`../Observability/02-Searching-Seq.md`](../Observability/02-Searching-Seq.md). This doc deliberately does not duplicate it.

## Open questions

Carried forward from [`03-Remote-Seq-DigitalOcean.md` § Open questions](03-Remote-Seq-DigitalOcean.md#open-questions) — this is now the authoritative home for #1.

1. **Per-install API-key enrollment.** Discussed above. Re-open when (a) a real leak happens and we want a precise revoke surface, or (b) installed-user count exceeds the point where "rotate the global key and ship an update" becomes user-disruptive.
2. **Detection automation.** Right now the tripwires above are manual queries. A scheduled Seq dashboard with the four ratios pre-baked would catch slow abuse without a human in the loop. Defer until we have ~1 month of baseline traffic to set thresholds against.
3. **Secret-extraction resistance.** Embedded secrets are extractable in principle; obfuscation (encrypted-at-rest in the binary, fetched at runtime via DPAPI / macOS Keychain / kwallet) raises the attacker's bar without eliminating the risk. Defer — the engineering cost is real, the threat is mitigated by rate limit + rotation, and no platform's keychain genuinely solves "what stops the legitimate app from reading its own secret."

## Cross-references

- Bring-up + steady-state ops: [`03-Remote-Seq-DigitalOcean.md`](03-Remote-Seq-DigitalOcean.md)
- Binary integrity (Ed25519 signed updates): [`00-Tauri-Desktop-Shell.md` § 6](00-Tauri-Desktop-Shell.md#6-self-hosted-updates)
- Dev-time access patterns + offline fallback: [`05-Accessing-Remote-Seq.md`](05-Accessing-Remote-Seq.md)
- User-facing privacy promise: [`../../product/Privacy/00-Telemetry.md`](../../product/Privacy/00-Telemetry.md)
- PII redaction policy (the upstream control that makes always-on telemetry defensible): [`../Observability/01-Logging-Policy.md` § PII Redaction](../Observability/01-Logging-Policy.md#pii-redaction)
- Seq query syntax for the tripwires: [`../Observability/02-Searching-Seq.md`](../Observability/02-Searching-Seq.md)
