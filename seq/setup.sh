#!/usr/bin/env bash
# xstream seq/setup.sh — bootstrap the self-hosted Seq stack on a fresh droplet.
#
# Usage (on the droplet, as the ops user):
#   git clone https://github.com/<owner>/xstream
#   cd xstream/seq
#   cp .env.example .env && $EDITOR .env   # fill in SEQ_HOSTNAME + SEQ_ADMIN_PASSWORD_HASH
#   ./setup.sh
#
# This is a NON-IDEMPOTENT bootstrap script. It assumes:
#   - the droplet is already provisioned (Ubuntu 22.04 LTS, ops user with sudo + docker group)
#   - DNS for SEQ_HOSTNAME already points at this droplet
#   - inbound firewall allows 80/443
# It does NOT touch SSH config, firewall rules, DNS, or Seq API keys.
#
# Steady-state ops (cert renewal is automatic; API key rotation is manual via Seq UI)
# live in docs/architecture/Deployment/03-Remote-Seq-DigitalOcean.md.

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "  ${GREEN}✔${NC}  $*"; }
warn()    { echo -e "  ${YELLOW}!${NC}  $*"; }
fail()    { echo -e "  ${RED}✘${NC}  $*" >&2; }
section() { echo -e "\n${CYAN}$*${NC}"; }

CADDY_CERT_TIMEOUT="${CADDY_CERT_TIMEOUT:-300}"

cd "$(dirname "${BASH_SOURCE[0]}")"

# ── .env ──────────────────────────────────────────────────────────────────────

section "── Configuration"

if [[ ! -f .env ]]; then
  fail ".env not found in $(pwd)"
  fail "Run: cp .env.example .env && \$EDITOR .env"
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

if [[ -z "${SEQ_HOSTNAME:-}" ]]; then
  fail "SEQ_HOSTNAME is unset in .env"
  exit 1
fi
if [[ -z "${SEQ_ADMIN_PASSWORD_HASH:-}" ]]; then
  fail "SEQ_ADMIN_PASSWORD_HASH is unset in .env"
  fail "Generate with: docker run --rm datalust/seq config hash <password>"
  exit 1
fi
info "${BOLD}${CYAN}SEQ_HOSTNAME${NC}=${SEQ_HOSTNAME}"
info "${BOLD}${CYAN}SEQ_ADMIN_PASSWORD_HASH${NC} (set, ${#SEQ_ADMIN_PASSWORD_HASH} chars)"

# ── Docker prerequisites ──────────────────────────────────────────────────────

section "── Docker"

if command -v docker &>/dev/null; then
  info "docker present: $(docker --version)"
else
  warn "docker not found — installing via get.docker.com"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  info "docker installed: $(docker --version)"
fi

if docker compose version &>/dev/null; then
  info "docker compose present: $(docker compose version --short)"
else
  fail "docker compose plugin missing — install docker-compose-plugin"
  exit 1
fi

# ── Caddyfile render ──────────────────────────────────────────────────────────

section "── Caddyfile"

if [[ ! -f Caddyfile.template ]]; then
  fail "Caddyfile.template missing — corrupted checkout?"
  exit 1
fi

# In-process substitution; the rendered Caddyfile is gitignored.
sed "s|{{DOMAIN}}|${SEQ_HOSTNAME}|g" Caddyfile.template > Caddyfile
info "Rendered Caddyfile for ${SEQ_HOSTNAME}"

# ── Bring the stack up ───────────────────────────────────────────────────────

section "── docker compose up"

docker compose up -d
info "Containers started"

# ── Wait for Let's Encrypt cert ──────────────────────────────────────────────

section "── Cert acquisition (timeout ${CADDY_CERT_TIMEOUT}s)"

info "Tailing Caddy logs for cert. Ctrl-C is safe here — the stack stays up."

deadline=$(( $(date +%s) + CADDY_CERT_TIMEOUT ))
acquired=false
while [[ $(date +%s) -lt $deadline ]]; do
  if docker compose logs caddy 2>&1 | grep -qi "certificate obtained"; then
    acquired=true
    break
  fi
  if docker compose logs caddy 2>&1 | grep -qiE "acme: error|no such host|connection refused"; then
    fail "Caddy hit an ACME error — likely DNS or firewall:"
    docker compose logs caddy 2>&1 | grep -iE "acme|error" | tail -10 >&2
    fail "Fix DNS / firewall, then: docker compose restart caddy"
    exit 1
  fi
  sleep 5
done

if $acquired; then
  info "Let's Encrypt cert obtained"
else
  warn "Cert not observed within ${CADDY_CERT_TIMEOUT}s — check: docker compose logs caddy"
fi

# ── Next steps ────────────────────────────────────────────────────────────────

section "── Next steps"

echo ""
echo "  1. Open ${BOLD}https://${SEQ_HOSTNAME}${NC}, sign in as admin with the password you hashed."
echo "  2. Seq forces a password change on first login — pick a strong one, stash in your password manager."
echo "  3. ${BOLD}Settings → API Keys${NC}: create an Ingest-only key with a ~10k/min rate limit."
echo "     Copy the token immediately — Seq shows it once."
echo "  4. ${BOLD}Settings → Retention${NC}: set to 14 days (or adjust per disk budget)."
echo "  5. Wire the four OTel env vars into the production xstream build — see"
echo "     docs/architecture/Deployment/03-Remote-Seq-DigitalOcean.md § 'Wiring xstream to ship to this Seq'."
echo ""
echo -e "${GREEN}setup.sh: done${NC}"
