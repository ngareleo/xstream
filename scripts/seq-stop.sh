#!/usr/bin/env bash
# tvke seq-stop — stop the Seq log management container.
# Safe to run when Seq is not running — exits immediately with a status message.

set -euo pipefail

SEQ_CONTAINER=seq

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[seq]${NC} $*"; }
skipped() { echo -e "${YELLOW}[seq]${NC} $*"; }

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${SEQ_CONTAINER}$"; then
  info "Stopping ${SEQ_CONTAINER}..."
  docker stop "${SEQ_CONTAINER}"
  info "Stopped."
else
  skipped "Seq is not running."
fi
