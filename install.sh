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

# ── 0b. Linux system libraries (required for Tauri build) ─────────────────────

# Tauri's webview backend (`wry` → `webkit2gtk`) needs system libraries that
# don't ship with most distros by default. The list mirrors the one in
# `docs/migrations/rust-rewrite/08-Tauri-Packaging.md` §9. Mac/Windows have
# their webview baked into the OS — this block is Linux-only.
if [ "$(uname -s)" = "Linux" ]; then
  TAURI_DEPS=(pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev)
  MISSING=()
  for pkg in "${TAURI_DEPS[@]}"; do
    if ! dpkg -s "$pkg" &>/dev/null; then
      MISSING+=("$pkg")
    fi
  done
  if [ "${#MISSING[@]}" -gt 0 ]; then
    info "Installing Tauri Linux build deps (missing: ${MISSING[*]})..."
    sudo apt-get update
    sudo apt-get install -y "${MISSING[@]}"
  else
    info "Tauri Linux build deps already installed."
  fi
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

# ── 1b. Rust toolchain + tauri-cli ────────────────────────────────────────────

# The Rust port (server-rust) and the Tauri shell (src-tauri) both compile
# against stable Rust. tauri-cli provides the `cargo tauri dev|build`
# subcommands invoked by `bun run tauri:dev` / `tauri:build`.
if ! command -v cargo &>/dev/null; then
  warning "cargo not found — install Rust from https://rustup.rs and re-run this script."
  warning "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
else
  info "cargo found: $(cargo --version)"
  if ! command -v cargo-tauri &>/dev/null; then
    info "tauri-cli not found — installing (this takes a few minutes the first time)..."
    cargo install tauri-cli --version '^2' --locked
  else
    info "tauri-cli found: $(cargo-tauri --version 2>/dev/null || echo unknown)"
  fi
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

if command -v doppler >/dev/null 2>&1 && doppler configure get project >/dev/null 2>&1; then
  info "Doppler configured — secrets injected by 'doppler run' (bun run dev)."
else
  warning "Doppler not set up. Install the CLI (https://docs.doppler.com/docs/cli), then run:"
  warning "  doppler login"
  warning "  doppler setup --project xstream --config dev"
fi

# ── 7. Done ───────────────────────────────────────────────────────────────────

echo ""
info "Setup complete. To start development:"
echo ""
echo "    bun run dev          # browser-mode: Bun + Rust + client dev (mprocs)"
echo "    bun run tauri:dev    # desktop-mode: Tauri window with embedded Rust server"
echo ""
echo "  Browser-mode:"
echo "    Bun:    http://localhost:3001/graphql"
echo "    Rust:   http://localhost:3002/graphql  (toggle 'useRustBackend' flag in Settings)"
echo "    Client: http://localhost:5173"
echo ""
info "See README.md for full usage instructions."
