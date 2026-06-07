#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║          QRIS Simulator - Setup & Run Script               ║
# ╚══════════════════════════════════════════════════════════════╝

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[QRIS-SIM]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Check Prerequisites ─────────────────────────────────────────
log "Checking prerequisites..."

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 is installed"
    return 0
  else
    err "$1 is NOT installed. Please install it first."
    return 1
  fi
}

MISSING=0
check_cmd node || MISSING=1
check_cmd npm  || MISSING=1

if [ $MISSING -ne 0 ]; then
  err "Missing prerequisites. Please install them and re-run."
  exit 1
fi

# ─── Check/Install Redis ─────────────────────────────────────────
log "Checking Redis..."
if command -v redis-server &>/dev/null; then
  ok "Redis server found"
elif command -v redis-cli &>/dev/null; then
  ok "Redis CLI found"
else
  warn "Redis not found. Attempting to install..."

  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v apt-get &>/dev/null; then
      sudo apt-get update -qq && sudo apt-get install -y redis-server
    elif command -v yum &>/dev/null; then
      sudo yum install -y redis
    elif command -v dnf &>/dev/null; then
      sudo dnf install -y redis
    fi
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &>/dev/null; then
      brew install redis
    else
      warn "Homebrew not found. Install Redis manually: https://redis.io/download"
    fi
  else
    warn "Cannot auto-install Redis on this OS. The simulator will use in-memory fallback."
  fi
fi

# Start Redis if available
if command -v redis-server &>/dev/null; then
  if ! redis-cli ping &>/dev/null 2>&1; then
    log "Starting Redis server..."
    redis-server --daemonize yes 2>/dev/null || true
    sleep 1
    if redis-cli ping &>/dev/null 2>&1; then
      ok "Redis server started"
    else
      warn "Could not start Redis. Using in-memory fallback."
    fi
  else
    ok "Redis server is already running"
  fi
fi

# ─── Setup Backend ───────────────────────────────────────────────
log "Setting up backend..."
cd "$SCRIPT_DIR/backend"

if [ ! -d "node_modules" ]; then
  log "Installing backend dependencies..."
  npm install
else
  ok "Backend dependencies already installed"
fi

# Create .env if not exists
if [ ! -f ".env" ]; then
  cat > .env << 'EOF'
PORT=3000
REDIS_URL=redis://localhost:6379
NODE_ENV=development
EOF
  ok "Created .env file"
fi

# ─── Setup Playwright ────────────────────────────────────────────
log "Setting up Playwright tests..."
cd "$SCRIPT_DIR"

if [ ! -d "tests/playwright/node_modules" ]; then
  log "Installing Playwright..."
  cd tests/playwright
  npm init -y 2>/dev/null
  npm install --save-dev @playwright/test
  npx playwright install chromium 2>/dev/null || warn "Could not install Chromium browser"
  cd "$SCRIPT_DIR"
else
  ok "Playwright already installed"
fi

# ─── Setup Postman ───────────────────────────────────────────────
if command -v newman &>/dev/null; then
  ok "Newman (Postman CLI) is installed"
else
  warn "Newman not installed. Install with: npm install -g newman"
  warn "Postman collection is available at: tests/postman/qris-simulator.postman_collection.json"
fi

# ─── Create required directories ─────────────────────────────────
mkdir -p "$SCRIPT_DIR/docs/sequence"
ok "Directory structure verified"

# ─── Start the server ────────────────────────────────────────────
log "Starting QRIS Simulator..."
cd "$SCRIPT_DIR/backend"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                              ║${NC}"
echo -e "${CYAN}║              🚀 QRIS SIMULATOR IS STARTING...               ║${NC}"
echo -e "${CYAN}║                                                              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Frontend${NC}  : http://localhost:3000"
echo -e "  ${GREEN}API${NC}       : http://localhost:3000/api"
echo -e "  ${GREEN}Health${NC}    : http://localhost:3000/api/health"
echo ""
echo -e "  ${YELLOW}Playwright${NC}: cd tests/playwright && npx playwright test"
echo -e "  ${YELLOW}Postman${NC}  : newman run tests/postman/qris-simulator.postman_collection.json"
echo ""

# Start the server (blocking)
node src/index.js
