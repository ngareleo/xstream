#!/usr/bin/env bash
# xstream stop — kill the server, client dev server, and any running ffmpeg jobs.
# Safe to run at any time; reports what it killed and exits 0 even if nothing
# was running.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[stop]${NC} $*"; }
skipped() { echo -e "${YELLOW}[stop]${NC} $*"; }

killed=0

kill_pattern() {
  local label="$1"
  local pattern="$2"
  local pids
  # shellcheck disable=SC2009
  pids=$(pgrep -f "$pattern" 2>/dev/null | grep -v "^$$\$" || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -TERM 2>/dev/null || true
    info "Stopped $label (pids: $(echo "$pids" | tr '\n' ' '))"
    killed=$((killed + 1))
  else
    skipped "$label — not running"
  fi
}

# Kill in reverse start order so dependents go first
kill_pattern "Vite dev server"  "vite"
kill_pattern "Bun server"       "bun.*src/index"
kill_pattern "ffmpeg jobs"      "ffmpeg"

echo ""
if [ "$killed" -gt 0 ]; then
  info "$killed process group(s) stopped."
else
  info "Nothing was running."
fi
