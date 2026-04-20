#!/usr/bin/env bash
# xstream seq-start — start (or create) the Seq log management container.
# Safe to run when Seq is already running — exits immediately with a status message.

set -euo pipefail

SEQ_CONTAINER=seq
SEQ_PORT=5341
SEQ_STORE="${SEQ_STORE:-$HOME/.seq-store}"
CREDS_FILE="$(cd "$(dirname "$0")/.." && pwd)/.seq-credentials"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[seq]${NC} $*"; }
skipped() { echo -e "${YELLOW}[seq]${NC} $*"; }
fail()    { echo -e "${RED}[seq]${NC} $*" >&2; }

# ── Credentials ──────────────────────────────────────────────────────────────
# Generate a random admin password on first run and persist it in .seq-credentials
# (gitignored). All scripts and skills read from this file — never hardcode credentials.

if [[ ! -f "$CREDS_FILE" ]]; then
  info "Generating Seq credentials → .seq-credentials"
  _PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  printf 'SEQ_ADMIN_USERNAME=admin\nSEQ_ADMIN_PASSWORD=%s\n' "$_PASS" > "$CREDS_FILE"
  info "Credentials saved. Run: cat .seq-credentials"
fi
# shellcheck source=/dev/null
source "$CREDS_FILE"

# ── Sudo askpass setup ────────────────────────────────────────────────────────
# Create a zenity-based askpass helper so sudo can prompt for a password
# without a terminal TTY. Cleaned up on exit.

_ASKPASS=""
if command -v zenity &>/dev/null; then
  _ASKPASS=$(mktemp --suffix=.sh)
  printf '#!/bin/sh\nzenity --password --title="[seq] sudo authentication"\n' > "$_ASKPASS"
  chmod +x "$_ASKPASS"
  export SUDO_ASKPASS="$_ASKPASS"
  trap 'rm -f "$_ASKPASS"' EXIT
fi

# sudo wrapper: uses NOPASSWD if available, otherwise falls back to askpass
sudo_cmd() {
  if sudo -n "$@" 2>/dev/null; then
    return 0
  elif [[ -n "$_ASKPASS" ]]; then
    sudo -A "$@"
  else
    fail "sudo requires a password but no askpass helper is available."
    fail "Run manually: sudo $*"
    exit 1
  fi
}

# docker wrapper: uses sudo if the user lacks socket access
docker() {
  if command docker "$@" 2>/dev/null; then
    return 0
  else
    sudo_cmd docker "$@"
  fi
}

# ── Ensure Docker daemon is running ──────────────────────────────────────────

if ! systemctl is-active --quiet docker; then
  info "Docker not running — starting daemon..."
  if systemctl --user start docker &>/dev/null; then
    : # rootless Docker started
  else
    sudo_cmd systemctl start docker
  fi
  for i in $(seq 1 10); do
    systemctl is-active --quiet docker && break
    sleep 1
  done
  if ! systemctl is-active --quiet docker; then
    fail "Docker daemon did not become ready in time"
    exit 1
  fi
fi

# ── Manage Seq container ──────────────────────────────────────────────────────

# Already running
if docker ps --format '{{.Names}}' | grep -q "^${SEQ_CONTAINER}$"; then
  skipped "Seq already running at http://localhost:${SEQ_PORT}"
  exit 0
fi

# Container exists but is stopped — restart it
if docker ps -a --format '{{.Names}}' | grep -q "^${SEQ_CONTAINER}$"; then
  info "Restarting stopped container..."
  docker start "${SEQ_CONTAINER}"
else
  # Create a new container using the persistent store
  info "Creating new Seq container (store: ${SEQ_STORE})..."
  mkdir -p "${SEQ_STORE}"
  docker run -d \
    --name "${SEQ_CONTAINER}" \
    --restart unless-stopped \
    -e ACCEPT_EULA=Y \
    -e SEQ_FIRSTRUN_ADMINPASSWORD="${SEQ_ADMIN_PASSWORD}" \
    -p "${SEQ_PORT}:80" \
    -v "${SEQ_STORE}:/data" \
    datalust/seq:latest
  echo ""
  info "Seq available at http://localhost:${SEQ_PORT}"
  info "Login: username=admin  password=$(grep '^SEQ_ADMIN_PASSWORD=' "$CREDS_FILE" | cut -d= -f2)"
  info "Credentials file: ${CREDS_FILE} (gitignored — do not commit)"
fi
