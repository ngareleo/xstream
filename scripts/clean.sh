#!/usr/bin/env bash
# xstream clean — stop all processes, then wipe encoded segment output.
#
# What gets removed:
#   tmp/segments-rust/*/   — ffmpeg output directories (can be GBs; safe to
#                            delete, re-transcode on demand)
#   /tmp/xstream-test-*/   — per-PID SQLite databases written by the test suite
#
# What is NOT removed:
#   tmp/xstream-rust.db    — the media library database; survives so you don't
#                            lose library/video metadata between runs
#   target/                — the Rust build cache; gigabytes of .o files
#                            that take 30–60s to rebuild from scratch
#
# Flags:
#   --db        also wipe tmp/xstream-rust.db (forces a full library rescan)
#   --target    also wipe the Rust build cache via `cargo clean` (forces
#               a full rebuild on next `bun run dev`)
#   --all       both of the above
#
# Examples:
#   ./scripts/clean.sh
#   ./scripts/clean.sh --db
#   ./scripts/clean.sh --target
#   ./scripts/clean.sh --all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[clean]${NC} $*"; }
warning() { echo -e "${YELLOW}[clean]${NC} $*"; }

WIPE_DB=false
WIPE_TARGET=false
for arg in "$@"; do
  case "$arg" in
    --db)     WIPE_DB=true ;;
    --target) WIPE_TARGET=true ;;
    --all)    WIPE_DB=true; WIPE_TARGET=true ;;
  esac
done

# ── 1. Stop running processes ─────────────────────────────────────────────────

"$SCRIPT_DIR/stop.sh"

# ── 2. Remove segment directories ────────────────────────────────────────────

SEGMENTS_DIR="$ROOT/tmp/segments-rust"
if [ -d "$SEGMENTS_DIR" ] && [ "$(ls -A "$SEGMENTS_DIR" 2>/dev/null)" ]; then
  seg_size=$(du -sh "$SEGMENTS_DIR" 2>/dev/null | cut -f1)
  rm -rf "${SEGMENTS_DIR:?}"/*
  info "Cleared tmp/segments-rust/ ($seg_size freed)"
else
  info "tmp/segments-rust/ already empty"
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
  db="$ROOT/tmp/xstream-rust.db"
  for f in "$db" "${db}-shm" "${db}-wal"; do
    [ -f "$f" ] && rm -f "$f" && info "Removed $f"
  done
  warning "Main DB wiped — server will rescan your library on next start."
else
  info "Main DB preserved (pass --db to also wipe it)"
fi

# ── 5. Optionally wipe the Rust build cache ─────────────────────────────────

TARGET_DIR="$ROOT/target"
if $WIPE_TARGET; then
  if [ -d "$TARGET_DIR" ]; then
    target_size=$(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1)
    if command -v cargo >/dev/null 2>&1; then
      ( cd "$ROOT" && cargo clean --quiet )
      info "Ran cargo clean — wiped target/ ($target_size freed)"
    else
      # Fallback if cargo isn't on PATH (rustup not installed); just rm.
      rm -rf "$TARGET_DIR"
      info "Removed target/ ($target_size freed) — cargo not on PATH so used rm -rf"
    fi
    warning "Rust build cache wiped — next 'bun run dev' rebuilds from scratch (~30–60s)."
  else
    info "target/ doesn't exist — skipping"
  fi
else
  info "Rust build cache preserved (pass --target to also wipe it)"
fi

echo ""
info "Clean complete."
