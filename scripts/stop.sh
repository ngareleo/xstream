#!/usr/bin/env bash
# xstream stop — kill the Rust server, the Rsbuild client,
# any in-flight ffmpeg jobs, and the Seq container.
# Safe to run at any time; reports what it killed and exits 0 even if nothing
# was running. Preserves all persisted data (DB, segments, .seq-credentials,
# ~/.seq-store).

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

stop_seq() {
  local container=seq
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
    docker stop "${container}" >/dev/null
    info "Stopped Seq container"
    killed=$((killed + 1))
  else
    skipped "Seq — not running"
  fi
}

# Kill in reverse start order so dependents go first.
kill_pattern "Rsbuild dev server"          "rsbuild"
# Rust server — match both the binary itself (cargo build artifact) and the
# `cargo run` driver process, because killing one without the other leaves
# the orphan holding port 3002.
kill_pattern "Rust server (binary)"        "target/(debug|release)/xstream-server"
kill_pattern "Rust server (cargo driver)"  "cargo run.*xstream-server"
kill_pattern "ffmpeg jobs"                 "ffmpeg"
stop_seq

echo ""
if [ "$killed" -gt 0 ]; then
  info "$killed process group(s) stopped."
else
  info "Nothing was running."
fi
