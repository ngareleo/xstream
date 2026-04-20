#!/usr/bin/env bash
# tvke seq-start — start (or create) the Seq log management container.
# Safe to run when Seq is already running — exits immediately with a status message.

set -euo pipefail

SEQ_CONTAINER=seq
SEQ_PORT=5341
SEQ_STORE="${SEQ_STORE:-$HOME/.seq-store}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[seq]${NC} $*"; }
skipped() { echo -e "${YELLOW}[seq]${NC} $*"; }

# Already running
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${SEQ_CONTAINER}$"; then
  skipped "Seq already running at http://localhost:${SEQ_PORT}"
  exit 0
fi

# Container exists but is stopped — restart it
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${SEQ_CONTAINER}$"; then
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
    -p "${SEQ_PORT}:80" \
    -v "${SEQ_STORE}:/data" \
    datalust/seq:latest
fi

echo ""
info "Seq available at http://localhost:${SEQ_PORT}"
info "Create an API key: Settings → API Keys → Add API Key"
info "Paste the key into .env as: OTEL_EXPORTER_OTLP_HEADERS=X-Seq-ApiKey=<key>"
