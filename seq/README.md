# `seq/` — production Seq bootstrap

This directory is cloned onto a fresh DigitalOcean droplet and used to stand up the production OTel sink — a self-hosted [Seq](https://datalust.co/seq) instance behind Caddy + Let's Encrypt.

For the full architectural context — why self-hosted Seq, droplet sizing, steady-state ops (backup, restore, cert rotation, API-key rotation) — read [`../docs/architecture/Deployment/03-Remote-Seq-DigitalOcean.md`](../docs/architecture/Deployment/03-Remote-Seq-DigitalOcean.md). The runbook is authoritative; this directory is the executable shape of its "Docker Compose stack" section.

## Files

| File | Role |
|---|---|
| `docker-compose.yml` | Seq + Caddy stack. Loopback-bound Seq, Caddy reverse-proxy with auto TLS. |
| `Caddyfile.template` | `{{DOMAIN}}` placeholder; `setup.sh` renders it to `Caddyfile` using `SEQ_HOSTNAME` from `.env`. |
| `.env.example` | Template for the two operator-supplied values (`SEQ_HOSTNAME`, `SEQ_ADMIN_PASSWORD_HASH`). Copy to `.env`. |
| `.gitignore` | Excludes `.env` and the rendered `Caddyfile`. |
| `setup.sh` | One-shot bootstrap. Validates env, installs Docker if missing, renders the Caddyfile, brings up the stack, waits for the LE cert. |

## Quick start (on the droplet)

```bash
git clone https://github.com/<owner>/xstream
cd xstream/seq
cp .env.example .env
$EDITOR .env         # set SEQ_HOSTNAME + SEQ_ADMIN_PASSWORD_HASH (see .env.example for hash recipe)
./setup.sh
```

Prerequisites the script does **not** verify or fix:

- The droplet is provisioned (Ubuntu 22.04 LTS, ops user with `sudo` + `docker` group, key-only SSH, root SSH disabled). See the runbook § "Provisioning the droplet".
- DNS `A`/`AAAA` for `SEQ_HOSTNAME` already points at this droplet. Without this Caddy's ACME challenge fails.
- The DO Cloud Firewall (or `ufw`) allows inbound 22 / 80 / 443.

## `setup.sh` is a bootstrap, not a manager

Run it once on a fresh droplet. It is **not** idempotent — running it again will re-render the Caddyfile and re-issue `docker compose up -d` (mostly harmless), but it makes no attempt to reconcile drifted state.

What it does NOT do:

- Provision the droplet, configure the firewall, or manage DNS.
- Touch SSH config, manage `ops` user creation, or rotate keys.
- Mint, rotate, or revoke Seq API keys — those are manual steps in the Seq UI per the runbook.
- Configure backups — see runbook § "Backup".

For all of those, the runbook ([`../docs/architecture/Deployment/03-Remote-Seq-DigitalOcean.md`](../docs/architecture/Deployment/03-Remote-Seq-DigitalOcean.md)) is the source of truth.

## Cross-references

- Runbook: [`../docs/architecture/Deployment/03-Remote-Seq-DigitalOcean.md`](../docs/architecture/Deployment/03-Remote-Seq-DigitalOcean.md)
- Ingestion auth + distribution safety: [`../docs/architecture/Deployment/04-Telemetry-Ingestion-Security.md`](../docs/architecture/Deployment/04-Telemetry-Ingestion-Security.md)
- Dev-time access patterns: [`../docs/architecture/Deployment/05-Accessing-Remote-Seq.md`](../docs/architecture/Deployment/05-Accessing-Remote-Seq.md)
- User-facing telemetry disclosure: [`../docs/product/Privacy/00-Telemetry.md`](../docs/product/Privacy/00-Telemetry.md)
