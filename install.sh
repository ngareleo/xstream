#!/usr/bin/env bash
set -euo pipefail

# xstream — setup script
# Installs bun (if missing), dependencies, and prepares the project for development.

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # no colour

info()    { echo -e "${GREEN}[xstream]${NC} $*"; }
warning() { echo -e "${YELLOW}[xstream]${NC} $*"; }
error()   { echo -e "${RED}[xstream]${NC} $*" >&2; exit 1; }

# ── 0. Docker (optional — required for Seq) ───────────────────────────────────

if ! command -v docker &>/dev/null; then
  warning "docker not found — Seq log management will not be available."
  warning "Install Docker from https://docs.docker.com/get-docker/ to enable Seq."
elif ! docker info &>/dev/null 2>&1; then
  warning "Docker is installed but not running — start Docker to use Seq."
else
  info "docker found: $(docker --version)"
fi

# ── 1. Bun ────────────────────────────────────────────────────────────────────

if ! command -v bun &>/dev/null; then
  info "bun not found — installing..."
  curl -fsSL https://bun.sh/install | bash
  # Make bun available in this shell session
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  info "bun installed: $(bun --version)"
else
  info "bun found: $(bun --version)"
fi

# ── 2. Dependencies ───────────────────────────────────────────────────────────

info "Installing workspace dependencies..."
bun install

# ── 3. tmp/ directories ───────────────────────────────────────────────────────

info "Creating tmp/ directories..."
mkdir -p tmp/segments

# ── 4. Relay compiler ─────────────────────────────────────────────────────────

# server/schema.graphql is committed. Re-run relay-compiler if you change the
# schema, then commit the updated __generated__/ artifacts.
info "Generating Relay compiler artifacts..."
(cd client && bun relay) && info "Relay artifacts up to date." || warning "Relay compiler failed — run 'cd client && bun relay' after fixing schema issues."

# ── 5. Scripts ────────────────────────────────────────────────────────────────

chmod +x scripts/stop.sh scripts/clean.sh scripts/seq-start.sh scripts/seq-stop.sh
info "Utility scripts ready:"
info "  bun stop          — kill server, client, and any ffmpeg jobs"
info "  bun clean         — stop + wipe tmp/segments/ and test databases"
info "  bun clean:db      — clean + also wipe the main SQLite database"
info "  bun seq:start     — start (or create) the Seq log management container"
info "  bun seq:stop      — stop the Seq container"

# ── 6. Environment ────────────────────────────────────────────────────────────

if [ ! -f ".env" ]; then
  warning "No .env file found."
  warning "  Copy .env.example to .env and fill in SEQ_ADMIN_PASSWORD and"
  warning "  OTEL_EXPORTER_OTLP_HEADERS before starting Seq."
else
  info ".env found."
fi

# ── 7. Done ───────────────────────────────────────────────────────────────────

echo ""
info "Setup complete. To start development:"
echo ""
echo "    bun run dev"
echo ""
echo "  Server:  http://localhost:3001/graphql"
echo "  Client:  http://localhost:5173"
echo ""
info "See README.md for full usage instructions."
