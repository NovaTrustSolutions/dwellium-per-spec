#!/usr/bin/env bash
#
# preview-app.sh — launch a standalone, self-contained copy of qualia-shell
# for local evaluation. Static API mode (no backend dependency) + AppFolio
# seed data so all modules render real data instead of server-error states.
#
# Usage:
#   bash Scripts/preview-app.sh           # production build + SSR serve (what ships)
#   bash Scripts/preview-app.sh --dev     # dev server with hot reload (fastest)
#   PORT=4000 bash Scripts/preview-app.sh  # override the serve port (default 3000)
#
# Login: click the splash ("Click to Access Terminal") -> pick Andy -> passphrase: Comet2878!
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/../qualia-shell"
PORT="${PORT:-3000}"

export VITE_USE_STATIC_API=true
export VITE_APPFOLIO_SEEDS=true

cd "$APP_DIR"

# --- Dev mode: fastest, hot reload ---
if [[ "${1:-}" == "--dev" ]]; then
  echo "==> Launching DEV server (hot reload, static mode)…"
  echo "    Open the URL it prints below (typically http://localhost:5173)"
  echo "    Login: splash -> Andy -> passphrase Comet2878!"
  echo ""
  exec npm run dev
fi

# --- Production build + SSR serve (default) ---
echo "==> [1/2] Building standalone copy (static mode + seeds)… (~30-60s)"
npm run build

echo ""
echo "==> [2/2] Serving the built app on http://localhost:$PORT"
echo "    ----------------------------------------------------------"
echo "    Open:       http://localhost:$PORT"
echo "    Login:      click splash -> pick Andy -> passphrase: Comet2878!"
echo "    Stop:       press Ctrl+C"
echo "    ----------------------------------------------------------"
echo ""
exec env PORT="$PORT" npx react-router-serve build/server/index.js
