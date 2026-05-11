# Remote Seq on a DigitalOcean droplet

A self-hosted [Seq](https://datalust.co/seq) instance is the production OTel sink for shipped Tauri installs. It runs in Docker on a single DigitalOcean droplet behind Caddy with automatic Let's Encrypt TLS, accepts OTLP/HTTP ingestion on a public hostname authenticated by a Seq ingestion API key, and is reachable for inspection either through the public UI (admin login) or via SSH tunnel.

This page is the bring-up runbook + steady-state ops notes. For the policy this telemetry upholds (always-on, PII-redacted), see [`../Observability/01-Logging-Policy.md` § PII Redaction](../Observability/01-Logging-Policy.md#pii-redaction) and the user-facing disclosure at [`../../product/Privacy/00-Telemetry.md`](../../product/Privacy/00-Telemetry.md).

## Why self-hosted Seq (vs. Axiom / SaaS)

| Factor | Self-hosted Seq | SaaS (Axiom etc.) |
|---|---|---|
| Cost at our volume | ~$12–24/mo droplet, fixed | per-event billing, scales with users |
| Data control | All telemetry stays on a box we own | Routed through a third-party processor |
| Operator workflow | Same UI as local dev — `seq.example` is just a remote `localhost:5341` | New query syntax, second mental model |
| Operational burden | We maintain droplet + cert renewal + retention | Provider handles it |
| Cross-peer correlation | Both peers ship to the same Seq → one trace tree | Same outcome, different invoice |

Choice for v1: self-hosted Seq. The operator workflow continuity (one Seq query language, one mental model from dev → prod) is worth the small ops surface. Axiom remains documented as a drop-in alternative in [`../Observability/03-Config-And-Backends.md`](../Observability/03-Config-And-Backends.md) — switching is an env-var change, no code.

## Provisioning the droplet

| Setting | Value | Why |
|---|---|---|
| Region | Closest to the operator | Latency of UI access, not ingestion |
| Plan | Basic / Regular SSD / 2 vCPU / 4 GB RAM / 80 GB SSD | Seq + Caddy + OS headroom; events compress in storage so 14 days of dev+early-prod fits comfortably |
| Image | Ubuntu 22.04 LTS x64 | Long-term support, broad Docker support |
| SSH | Key-only (no password auth) | `PasswordAuthentication no` in `/etc/ssh/sshd_config` |
| Firewall (DO Cloud Firewall or `ufw`) | Inbound 22 / 80 / 443; outbound: open | Caddy needs 80/443; SSH needs 22; nothing else faces the public |
| Hostname | `seq.<your-domain>` | DNS A record points to droplet's public IPv4 (and AAAA for IPv6 if applicable) |

After provisioning:

```bash
ssh root@<droplet-ip>
adduser ops && usermod -aG sudo,docker ops
rsync -av ~/.ssh/authorized_keys /home/ops/.ssh/
chown -R ops:ops /home/ops/.ssh
# Lock root SSH down once the ops user is verified.
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Install Docker (DO ships it preinstalled on some images; verify with `docker --version`):

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

## The Docker Compose stack

The executable form of this section lives at [`seq/`](../../../seq/) at the repo root — `docker-compose.yml` + `Caddyfile.template` + a bootstrap `setup.sh`. On the droplet:

```bash
git clone https://github.com/<owner>/xstream
cd xstream/seq
cp .env.example .env
$EDITOR .env       # set SEQ_HOSTNAME + SEQ_ADMIN_PASSWORD_HASH
./setup.sh         # validates env, installs Docker if missing, renders Caddyfile,
                   # brings the stack up, waits for the Let's Encrypt cert
```

What `setup.sh` does and does not do is detailed in [`../../../seq/README.md`](../../../seq/README.md). The short version: it's a non-idempotent bootstrap that assumes the droplet is already provisioned, DNS is in place, and the firewall allows 80/443. It does not provision the droplet, manage DNS, touch SSH, or mint Seq API keys — those are operator concerns covered in this runbook.

If DNS hasn't propagated when Caddy starts, the ACME challenge fails. `setup.sh` detects this in the Caddy logs and exits with a hint; fix DNS, then `docker compose restart caddy` and `./setup.sh` again (it's safe to re-run after the env is correct).

## First-run Seq setup

1. Open `https://seq.<your-domain>` in a browser. Sign in as `admin` with the password you hashed into `SEQ_FIRSTRUN_ADMINPASSWORDHASH`.
2. Seq forces a password change on first login — accept and pick a strong one. Stash it in your password manager.
3. **Settings → API Keys → Add API Key**:
   - Title: `xstream-desktop-ingest`
   - Permissions: **Ingest** only (do not grant Read/Write/Project)
   - Rate limit: ~10,000 events/minute (enough for healthy use, contains spam from a leaked key)
   - Copy the generated token — this is the `<api-key>` value used in env vars below. Seq shows the token only once.
4. **Settings → Retention**: set to **14 days** (adjust per disk budget — Seq compresses events ~10× so 14 days at expected volume should sit well under 80 GB).

## Wiring xstream to ship to this Seq

For the local dev machine (or any single operator install), set in `.env`:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://seq.<your-domain>/ingest/otlp
OTEL_EXPORTER_OTLP_HEADERS=X-Seq-ApiKey=<api-key>
PUBLIC_OTEL_ENDPOINT=https://seq.<your-domain>/ingest/otlp
PUBLIC_OTEL_HEADERS=X-Seq-ApiKey=<api-key>
```

The same four vars are baked into release Tauri bundles via the CI build env — see [`../../code-style/`](../../code-style/) and the release workflow once it lands. The PII-redaction switch in `server-rust/src/telemetry.rs` and `client/src/telemetry.ts` flips on automatically when the resolved endpoint is non-localhost; redaction policy is documented in [`../Observability/01-Logging-Policy.md` § PII Redaction](../Observability/01-Logging-Policy.md#pii-redaction).

## Operator access patterns

Two ways the operator (the developer) inspects telemetry: the public UI for everyday work, and an SSH tunnel for box-level operations when the public hostname is misbehaving. Both — plus per-developer access policy, dev-traffic filtering, and Seq-down fallback to local Seq — are documented in [`05-Accessing-Remote-Seq.md`](05-Accessing-Remote-Seq.md).

## Steady-state operations

### Backup

The `seq-data` named volume is the only stateful surface. Snapshot weekly:

```bash
docker run --rm \
  -v seq-data:/data \
  -v /home/ops/backups:/out \
  alpine \
  tar czf /out/seq-$(date +%F).tar.gz -C /data .
```

Off-box copy: `scp` or `s3 cp` to a separate location. Retain ~4 snapshots.

### Restore

```bash
docker compose down
docker volume rm seq_seq-data
docker volume create seq_seq-data
docker run --rm -v seq_seq-data:/data -v /home/ops/backups:/in alpine \
  tar xzf /in/seq-YYYY-MM-DD.tar.gz -C /data
docker compose up -d
```

### Updating Seq

```bash
docker compose pull seq
docker compose up -d seq
```

Datalust ships Seq with strong forward-compat for the data dir; routine `latest` pulls are safe. Major-version bumps: read the changelog first.

### Rotating the ingestion API key

1. Create a new key in Seq UI (Settings → API Keys → Add API Key) with the same Ingest-only scope and rate limit.
2. Roll it out to every install / CI build via the env-var update.
3. After confirming traffic on the new key (Seq dashboard → API Key activity), revoke the old one.

### Cert renewal

Caddy auto-renews ~30 days before expiry. Verify via `docker compose logs caddy | grep -i "certificate obtained"`. If renewal is failing, the most common cause is DNS or firewall changes blocking the ACME HTTP-01 challenge on port 80.

## Risks and trade-offs

- **Single-node, no HA.** A droplet outage means a telemetry gap, not user-visible breakage. Acceptable for v1.
- **Embedded ingestion key in shipped binaries.** A leaked key allows arbitrary parties to spam our Seq. Threat model, mitigations (Ingest-scope-only key, per-key rate limit, easy rotation, separate keys per shipping component), and explicit alpha non-goals are documented in [`04-Telemetry-Ingestion-Security.md`](04-Telemetry-Ingestion-Security.md).
- **Always-on telemetry.** Defensible only because of the redaction policy upstream — the privacy disclosure at [`../../product/Privacy/00-Telemetry.md`](../../product/Privacy/00-Telemetry.md) is load-bearing for this.
- **Operator login = single point.** One admin user; loss of that password = restore from backup or re-provision. Document the password storage in the team password manager. Per-developer access policy is in [`05-Accessing-Remote-Seq.md` § Per-developer access policy](05-Accessing-Remote-Seq.md#per-developer-access-policy).

## Open questions

These are recorded so the runbook doesn't lose them when the migration playbook retires.

1. **Per-install API-key enrollment.** Right now every shipped binary embeds the same ingestion key. A future "first-run handshake" could mint a per-install key, capping blast radius if any one binary is reverse-engineered. Authoritative discussion (threat model, why we defer for alpha, when to revisit) lives in [`04-Telemetry-Ingestion-Security.md` § Open questions](04-Telemetry-Ingestion-Security.md#open-questions).
2. **Geographic placement of the droplet.** Operator UX is most sensitive — pick the region closest to the developer, not the users (ingestion latency doesn't matter; UI latency does).
3. **Retention vs disk budget calibration.** 14 days is a guess. Re-evaluate after a month of real ingest with the disk usage graph in DO.
4. **Multi-operator access.** Today this assumes one operator. Per-developer access policy and the path to read-only-per-teammate Seq users is documented in [`05-Accessing-Remote-Seq.md` § Per-developer access policy](05-Accessing-Remote-Seq.md#per-developer-access-policy).
5. **Sentry-style crash reporting.** Out of scope here; tracked alongside the open question in [`00-Tauri-Desktop-Shell.md`](00-Tauri-Desktop-Shell.md). Crash reports are not a Seq concern.

## Appendix: bring-up checklist

```
[ ] DigitalOcean droplet provisioned (Ubuntu 22.04 LTS, 4 GB RAM)
[ ] DNS A/AAAA record for seq.<your-domain> → droplet IP
[ ] Cloud Firewall: 22 / 80 / 443 inbound only
[ ] Non-root ops user with sudo + docker group, key-only SSH
[ ] Root SSH disabled
[ ] git clone <repo> on droplet; cd xstream/seq
[ ] cp .env.example .env; fill in SEQ_HOSTNAME + SEQ_ADMIN_PASSWORD_HASH
[ ] ./setup.sh → both containers Up + Let's Encrypt cert obtained
[ ] Seq UI reachable at https://seq.<your-domain>
[ ] Admin password rotated on first login (manual UI step)
[ ] Ingestion API key created — Ingest scope, ~10k/min rate limit (manual UI step)
[ ] Retention set to 14 days (manual UI step)
[ ] xstream env vars updated, smoke trace lands in remote Seq
[ ] Backup cron / weekly snapshot scheduled
```
