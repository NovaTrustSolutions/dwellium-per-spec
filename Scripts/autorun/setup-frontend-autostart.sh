#!/bin/bash
#
# One-time setup script for THIS machine to enable frontend autostart.
#
# Backend autostart was set up earlier (com.dwellium.backend launchd agent).
# This script does the same for the frontend, so opening Chrome → localhost:5173
# Just Works at every login.
#
# Idempotent — safe to re-run.

set -e
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/qualia-shell"
APPSUP="$HOME/Library/Application Support/Dwellium"
LAUNCHAGENTS="$HOME/Library/LaunchAgents"
BUILD_DIR="$APPSUP/frontend-build"
LABEL="com.dwellium.frontend"

echo "════════════════════════════════════════════════════════════════"
echo "  Dwellium frontend autostart setup (one-time, idempotent)"
echo "  Repo: $REPO_ROOT"
echo "════════════════════════════════════════════════════════════════"

# ── 1: nvm sourcing ────────────────────────────────────────────────────
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "/opt/homebrew/opt/nvm/nvm.sh"
elif [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi
echo ""
echo "── 1/5: Node $(node -v)"

# ── 2: Build frontend ──────────────────────────────────────────────────
echo ""
echo "── 2/5: Building frontend ──"
cd "$SOURCE_DIR"
npm run build

if [ ! -f "$SOURCE_DIR/build/server/index.js" ]; then
  echo "❌ Build did not produce build/server/index.js" >&2
  exit 1
fi

# ── 3: Stage build + serve runtime in TCC-free location ────────────────
echo ""
echo "── 3/5: Staging build artifacts in $BUILD_DIR/build/ ──"
mkdir -p "$BUILD_DIR/build" "$APPSUP" "$LAUNCHAGENTS" "$HOME/Library/Logs"
rm -rf "$BUILD_DIR/client" "$BUILD_DIR/server" "$BUILD_DIR/build/client" "$BUILD_DIR/build/server"
cp -R "$SOURCE_DIR/build/client" "$BUILD_DIR/build/client"
cp -R "$SOURCE_DIR/build/server" "$BUILD_DIR/build/server"

node -e "
const src = require('$SOURCE_DIR/package.json');
const out = {
  name: 'dwellium-frontend-runtime',
  version: '1.0.0',
  private: true,
  type: 'module',
  description: 'Runtime container for the Dwellium frontend SSR server',
  dependencies: src.dependencies || {},
};
if (!out.dependencies['@react-router/serve']) {
  const fromDev = (src.devDependencies || {})['@react-router/serve'];
  if (fromDev) out.dependencies['@react-router/serve'] = fromDev;
}
require('fs').writeFileSync('$BUILD_DIR/package.json', JSON.stringify(out, null, 2));
"
if [ -f "$SOURCE_DIR/package-lock.json" ]; then
  cp "$SOURCE_DIR/package-lock.json" "$BUILD_DIR/package-lock.json"
fi
( cd "$BUILD_DIR" && npm install --omit=dev --no-audit --no-fund --silent )
echo "✅ Build staged"

# ── 4: Install launcher script + plist ─────────────────────────────────
echo ""
echo "── 4/5: Installing launcher + plist ──"
cp "$REPO_ROOT/Scripts/autorun/start-frontend.sh" "$APPSUP/start-frontend.sh"
chmod +x "$APPSUP/start-frontend.sh"

# Substitute home path in plist (replaces /Users/ilyaklipinitser with $HOME for portability)
sed "s|/Users/ilyaklipinitser|$HOME|g" \
    "$REPO_ROOT/Scripts/autorun/com.dwellium.frontend.plist" \
    > "$LAUNCHAGENTS/$LABEL.plist"
echo "✅ $LAUNCHAGENTS/$LABEL.plist installed"

# ── 5: Load + verify ───────────────────────────────────────────────────
echo ""
echo "── 5/5: Loading agent + verifying ──"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
lsof -ti :5173 2>/dev/null | xargs kill 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$LAUNCHAGENTS/$LABEL.plist"
echo "Waiting 8s for agent to boot..."
sleep 8

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  VERIFICATION"
echo "════════════════════════════════════════════════════════════════"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ || echo "000")
echo "  Backend  :3000/health  → HTTP $HEALTH  $([ "$HEALTH" = "200" ] && echo '✅' || echo '❌')"
echo "  Frontend :5173/        → HTTP $FRONTEND $(echo "$FRONTEND" | grep -qE '^[23]' && echo '✅' || echo '❌')"
echo ""
if [ "$HEALTH" = "200" ] && echo "$FRONTEND" | grep -qE '^[23]'; then
  echo "🎉 Done. Both services autostart at every login."
  echo ""
  echo "  Open: http://localhost:5173/"
  echo "  Logs: ~/Library/Logs/dwellium-{backend,frontend}.{out,err}.log"
  echo "  Redeploy after source changes: $REPO_ROOT/Scripts/rebuild-frontend.sh"
else
  echo "⚠️  One service didn't come up. Check logs:"
  echo "   tail ~/Library/Logs/dwellium-frontend.err.log"
  exit 1
fi
