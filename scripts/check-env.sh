#!/usr/bin/env bash
# xstream check-env — audit environment variable configuration.
#
# Usage:
#   bash scripts/check-env.sh          # dev check (warns on missing optionals)
#   bash scripts/check-env.sh --prod   # production check (errors on unsafe defaults)
#
# Exit codes:
#   0  all checks passed
#   1  one or more required variables are missing or unsafe for production

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

# ── Mode ──────────────────────────────────────────────────────────────────────

PROD=false
if [[ "${1:-}" == "--prod" || "${NODE_ENV:-}" == "production" ]]; then
  PROD=true
fi

ERRORS=0
WARNINGS=0

# ── Helpers ───────────────────────────────────────────────────────────────────

# check_default NAME DEFAULT DESCRIPTION
# Var has a built-in fallback — always OK, but surface the effective value.
check_default() {
  local name="$1" default="$2" desc="$3"
  if [[ -n "${!name:-}" ]]; then
    info "${BOLD}${CYAN}${name}${NC}=${!name}  ($desc)"
  else
    info "${BOLD}${CYAN}${name}${NC} (unset — default: $default)  ($desc)"
  fi
}

# check_optional NAME DESCRIPTION
# Var has no fallback — functionality is limited without it, but not fatal.
check_optional() {
  local name="$1" desc="$2"
  if [[ -n "${!name:-}" ]]; then
    info "${BOLD}${CYAN}${name}${NC} (set)  ($desc)"
  else
    warn "${BOLD}${CYAN}${name}${NC} unset  ($desc)"
    WARNINGS=$((WARNINGS + 1))
  fi
}

# check_required NAME DESCRIPTION
# Var must be set — exits non-zero if missing.
check_required() {
  local name="$1" desc="$2"
  if [[ -n "${!name:-}" ]]; then
    info "${BOLD}${CYAN}${name}${NC} (set)  ($desc)"
  else
    fail "${BOLD}${CYAN}${name}${NC} missing  ($desc)"
    ERRORS=$((ERRORS + 1))
  fi
}

# check_secret NAME DESCRIPTION
# Sensitive var — name printed in green if set, red if not. Value never shown.
check_secret() {
  local name="$1" desc="$2"
  if [[ -n "${!name:-}" ]]; then
    echo -e "  ${BOLD}${GREEN}${name}${NC}  ($desc)"
  else
    echo -e "  ${BOLD}${RED}${name}${NC}  (not set — $desc)"
    if $PROD; then
      ERRORS=$((ERRORS + 1))
    else
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
}

# check_not_localhost NAME DESCRIPTION
# Warns/errors if a URL var still points to localhost (unsafe in production).
check_not_localhost() {
  local name="$1" desc="$2"
  local val="${!name:-}"
  if [[ -z "$val" ]]; then
    warn "${BOLD}${CYAN}${name}${NC} unset  ($desc)"
    WARNINGS=$((WARNINGS + 1))
  elif [[ "$val" == *"localhost"* || "$val" == *"127.0.0.1"* ]]; then
    if $PROD; then
      fail "${BOLD}${CYAN}${name}${NC}=${val}  (localhost in production — set to your OTLP backend)"
      ERRORS=$((ERRORS + 1))
    else
      info "${BOLD}${CYAN}${name}${NC}=${val}  ($desc)"
    fi
  else
    info "${BOLD}${CYAN}${name}${NC}=${val}  ($desc)"
  fi
}

# ── .env file ─────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

section "── Environment file"
if [[ -f "$ROOT/.env" ]]; then
  info ".env found at $ROOT/.env"
  # shellcheck disable=SC1091
  set -a; source "$ROOT/.env"; set +a
else
  warn ".env not found — copy .env.example and fill in credentials"
  WARNINGS=$((WARNINGS + 1))
fi

# ── Server ────────────────────────────────────────────────────────────────────

section "── Server"
check_default   NODE_ENV          "development"              "runtime mode (development | production)"
check_default   PORT              "8080"                     "HTTP server port"
check_default   DB_PATH           "tmp/xstream.db"           "SQLite database path"
check_default   SEGMENT_DIR       "tmp/segments"             "transcoded segment storage directory"
check_default   SCAN_INTERVAL_MS  "30000"                    "library rescan interval (ms)"
check_default   SEGMENT_CACHE_GB  "20"                       "max disk space for segment cache (GB)"

# ── FFmpeg / hardware acceleration ────────────────────────────────────────────

section "── FFmpeg / hardware acceleration"
check_default   HW_ACCEL          "auto"                     "hardware encode mode (auto | off). auto probes + exits on failure; off forces software"

check_ffmpeg_path() {
  local name="$1" desc="$2"
  local val="${!name:-}"
  if [[ -z "$val" ]]; then
    info "${BOLD}${CYAN}${name}${NC} (unset — resolver falls back to vendor/ffmpeg/ then PATH)  ($desc)"
  elif [[ ! -x "$val" ]]; then
    fail "${BOLD}${CYAN}${name}${NC}=${val}  (file missing or not executable)"
    ERRORS=$((ERRORS + 1))
  else
    info "${BOLD}${CYAN}${name}${NC}=${val}  ($desc)"
  fi
}
check_ffmpeg_path FFMPEG_PATH  "override path to the ffmpeg binary (dev override of the vendor/ lookup)"
check_ffmpeg_path FFPROBE_PATH "override path to the ffprobe binary (dev override of the vendor/ lookup)"

# ── Metadata ──────────────────────────────────────────────────────────────────

section "── Metadata"
check_secret OMDB_API_KEY "OMDb API key — metadata matching disabled without it; set here or via Settings → Metadata"

# ── Telemetry ─────────────────────────────────────────────────────────────────

section "── Telemetry (server)"
check_not_localhost OTEL_EXPORTER_OTLP_ENDPOINT  "OTLP ingest URL (default: http://localhost:5341/ingest/otlp)"
check_secret        OTEL_EXPORTER_OTLP_HEADERS    "OTLP auth headers — required for Axiom / cloud backends"

section "── Telemetry (client build)"
check_default PUBLIC_OTEL_ENDPOINT  "/ingest/otlp"  "client OTLP endpoint (baked into bundle at build time)"
check_secret  PUBLIC_OTEL_HEADERS                   "client OTLP auth headers — required for Axiom / cloud backends"

# ── Seq (dev only) ────────────────────────────────────────────────────────────

if ! $PROD; then
  section "── Seq (dev)"
  check_secret SEQ_ADMIN_PASSWORD "Seq container admin password — only needed when creating the container for the first time"
  check_default SEQ_STORE  "~/.seq-store"  "Seq data directory (mounted into the Docker container)"
fi

# ── Test fixtures (dev only) ─────────────────────────────────────────────────

# check_test_media — when XSTREAM_TEST_MEDIA_DIR is set, validate that it
# exists and contains at least one expected fixture basename. Unset is fine
# (the encode tests skip cleanly).
check_test_media() {
  local name="XSTREAM_TEST_MEDIA_DIR"
  local val="${!name:-}"
  local -a expected=(
    "Mad Max- Fury Road (2015).mkv"
    "Furiosa- A Mad Max Saga (2024) 4K.mkv"
  )
  if [[ -z "$val" ]]; then
    info "${BOLD}${CYAN}${name}${NC} (unset — encode tests will skip)"
    return
  fi
  if [[ ! -d "$val" ]]; then
    fail "${BOLD}${CYAN}${name}${NC}=${val}  (directory does not exist)"
    ERRORS=$((ERRORS + 1))
    return
  fi
  local found=0 missing=0
  for basename in "${expected[@]}"; do
    if [[ -e "$val/$basename" ]]; then
      info "  ✔ ${basename}"
      found=$((found + 1))
    else
      warn "  missing: ${basename}"
      missing=$((missing + 1))
    fi
  done
  if (( found == 0 )); then
    fail "${BOLD}${CYAN}${name}${NC}=${val}  (no expected fixtures found — symlink them in)"
    ERRORS=$((ERRORS + 1))
  elif (( missing > 0 )); then
    info "${BOLD}${CYAN}${name}${NC}=${val}  (${found} fixture(s) found, ${missing} skipped)"
    WARNINGS=$((WARNINGS + 1))
  else
    info "${BOLD}${CYAN}${name}${NC}=${val}  (all ${found} fixture(s) present)"
  fi
}

if ! $PROD; then
  section "── Test fixtures (dev)"
  check_test_media
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}check-env: $ERRORS error(s), $WARNINGS warning(s) — fix errors before starting${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}check-env: 0 errors, $WARNINGS warning(s) — some optional vars are unset${NC}"
else
  echo -e "${GREEN}check-env: all checks passed${NC}"
fi
