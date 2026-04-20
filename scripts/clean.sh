#!/usr/bin/env bash
# xstream clean — stop all processes, then wipe encoded segment output.
#
# What gets removed:
#   tmp/segments/*/     — ffmpeg output directories (can be GBs; safe to delete,
#                         re-transcode on demand)
#   /tmp/xstream-test-*/   — per-PID SQLite databases written by the test suite
#
# What is NOT removed:
#   tmp/xstream.db         — the media library database; survives so you don't
#                         lose library/video metadata between runs
#
# Pass --db to also wipe tmp/xstream.db (forces a full rescan on next startup):
#   ./scripts/clean.sh --db

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[clean]${NC} $*"; }
warning() { echo -e "${YELLOW}[clean]${NC} $*"; }

WIPE_DB=false
for arg in "$@"; do
  [[ "$arg" == "--db" ]] && WIPE_DB=true
done

# ── 1. Stop running processes ─────────────────────────────────────────────────

"$SCRIPT_DIR/stop.sh"

# ── 2. Remove segment directories ────────────────────────────────────────────

SEGMENTS_DIR="$ROOT/tmp/segments"
if [ -d "$SEGMENTS_DIR" ] && [ "$(ls -A "$SEGMENTS_DIR" 2>/dev/null)" ]; then
  seg_size=$(du -sh "$SEGMENTS_DIR" 2>/dev/null | cut -f1)
  rm -rf "${SEGMENTS_DIR:?}"/*
  info "Cleared tmp/segments/ ($seg_size freed)"
else
  info "tmp/segments/ already empty"
fi

# ── 3. Remove test databases ──────────────────────────────────────────────────

test_dirs=(/tmp/xstream-test-*)
if compgen -G "/tmp/xstream-test-*" > /dev/null 2>&1; then
  test_size=$(du -sh "${test_dirs[@]}" 2>/dev/null | awk '{sum += $1} END {print sum "K"}' || echo "?")
  rm -rf /tmp/xstream-test-*
  info "Cleared test databases (/tmp/xstream-test-*)"
else
  info "No test databases found"
fi

# ── 4. Optionally wipe the main DB ───────────────────────────────────────────

if $WIPE_DB; then
  db="$ROOT/tmp/xstream.db"
  for f in "$db" "${db}-shm" "${db}-wal"; do
    [ -f "$f" ] && rm -f "$f" && info "Removed $f"
  done
  warning "Main DB wiped — server will rescan your library on next start."
else
  info "Main DB preserved (pass --db to also wipe it)"
fi

echo ""
info "Clean complete."
