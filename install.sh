#!/bin/bash
#
# Dwellium one-command install for a fresh Mac.
#
# Usage:
#   ./install.sh <path-to-backend-tarball.tar.gz>
#
# The backend is shipped as a tarball (no-git posture per security pattern).
# Pass the path to the .tar.gz containing the ai-dashboard369-file-manager
# folder. This script will:
#
#   1. Verify nvm + Node (≥20) is available
#   2. Extract the backend to ~/dwellium-backend/
#   3. npm install in both frontend (this repo) and backend
#   4. Apply the DnD backend routes (src/routes/scribeDndRoutes.ts + app.ts patch)
#   5. Build the frontend
#   6. Install both launchd agents (com.dwellium.backend + com.dwellium.frontend)
#   7. Load both agents (autostart at every login + restart on crash)
#   8. Verify both services are answering on :3000 + :5173
#
# After this finishes successfully, the user can open http://localhost:5173/
# in any browser and the app will work identically to the development machine.
#
# Re-runs are safe — every step is idempotent.

set -e
set -u

# ── Argument handling ──────────────────────────────────────────────────
if [ $# -lt 1 ] || [ ! -f "$1" ]; then
  cat <<EOF
Usage: $0 <path-to-backend-tarball.tar.gz>

Example:
  $0 ~/Downloads/dwellium-backend-2026-05-28.tar.gz
  $0 /Volumes/USB/dwellium-backend.tar.gz

The tarball must contain the "ai-dashboard369-file-manager" folder at its root
or one level deep.
EOF
  exit 1
fi
BACKEND_TARBALL="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$REPO_ROOT/qualia-shell"
BACKEND_HOME="$HOME/dwellium-backend"
BACKEND_DIR="$BACKEND_HOME/ai-dashboard369-file-manager"
APPSUP="$HOME/Library/Application Support/Dwellium"
LAUNCHAGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs"
BUILD_DIR="$APPSUP/frontend-build"

echo "════════════════════════════════════════════════════════════════"
echo "  Dwellium install — repo: $REPO_ROOT"
echo "  Backend tarball: $BACKEND_TARBALL"
echo "════════════════════════════════════════════════════════════════"

# ── 1: Verify Node ─────────────────────────────────────────────────────
echo ""
echo "── 1/8: Verifying Node ≥20 ──"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "/opt/homebrew/opt/nvm/nvm.sh"
elif [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node not found. Install nvm + Node 20:"
  echo "   brew install nvm   # or per https://github.com/nvm-sh/nvm#install--update-script"
  echo "   nvm install 20"
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node version is v$(node -v) — need ≥20."
  exit 1
fi
echo "✅ Node $(node -v)"

# ── 2: Extract backend tarball ─────────────────────────────────────────
echo ""
echo "── 2/8: Extracting backend to $BACKEND_HOME ──"
if [ -d "$BACKEND_DIR" ]; then
  echo "⚠️  $BACKEND_DIR already exists — skipping extraction."
  echo "   To force re-extract: rm -rf $BACKEND_HOME && re-run install."
else
  mkdir -p "$BACKEND_HOME"
  tar -xzf "$BACKEND_TARBALL" -C "$BACKEND_HOME"
  # Tar may have produced ./ai-dashboard369-file-manager/ or wrapped it in another folder.
  if [ ! -d "$BACKEND_DIR" ]; then
    NESTED=$(find "$BACKEND_HOME" -maxdepth 3 -type d -name 'ai-dashboard369-file-manager' | head -1)
    if [ -n "$NESTED" ] && [ "$NESTED" != "$BACKEND_DIR" ]; then
      mv "$NESTED" "$BACKEND_DIR"
    fi
  fi
fi
[ -d "$BACKEND_DIR" ] || { echo "❌ Backend folder not found after extraction"; exit 1; }
echo "✅ Backend at $BACKEND_DIR"

# ── 3: npm install (both repos) ────────────────────────────────────────
echo ""
echo "── 3/8: npm install (backend) ──"
( cd "$BACKEND_DIR" && npm install --no-audit --no-fund )
echo ""
echo "── 3.5/8: npm install (frontend) ──"
( cd "$SOURCE_DIR" && npm install --no-audit --no-fund )

# ── 4: Apply DnD backend additions (idempotent) ────────────────────────
echo ""
echo "── 4/8: Applying DnD backend routes ──"
if [ -f "$REPO_ROOT/Docs/backend-scribe-dnd-routes.ts" ]; then
  cp "$REPO_ROOT/Docs/backend-scribe-dnd-routes.ts" "$BACKEND_DIR/src/routes/scribeDndRoutes.ts"
  ( cd "$BACKEND_DIR" && npm install --save multer @types/multer @mozilla/readability jsdom @types/jsdom turndown @types/turndown --no-audit --no-fund )
  APP_TS="$BACKEND_DIR/src/app.ts"
  if ! grep -q "scribeDndRoutes" "$APP_TS"; then
    python3 - "$APP_TS" <<'PY'
import re, sys
p = sys.argv[1]
with open(p) as f: s = f.read()
s = re.sub(r"(import scribeRoutes from './routes/scribeRoutes';)", r"\1\nimport scribeDndRoutes from './routes/scribeDndRoutes';", s)
s = re.sub(r"(app\.use\('/api/scribe', scribeRoutes\);)", r"\1\napp.use('/api/scribe', scribeDndRoutes);", s)
with open(p, 'w') as f: f.write(s)
PY
    echo "✅ app.ts patched"
  else
    echo "✅ app.ts already has scribeDndRoutes"
  fi
else
  echo "⚠️  Docs/backend-scribe-dnd-routes.ts not in repo — skipping DnD route install"
fi

# ── 5: Build frontend ──────────────────────────────────────────────────
echo ""
echo "── 5/8: Building frontend ──"
( cd "$SOURCE_DIR" && npm run build )

# ── 6: Stage frontend build artifacts + serve runtime ──────────────────
echo ""
echo "── 6/8: Staging build artifacts in $BUILD_DIR/build/ (TCC-free, canonical layout) ──"
mkdir -p "$BUILD_DIR/build" "$APPSUP" "$LAUNCHAGENTS" "$LOGS"
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

# ── 7: Install launchd agents ──────────────────────────────────────────
echo ""
echo "── 7/8: Installing launchd agents ──"
# Backend launcher
cp "$REPO_ROOT/Scripts/autorun/start-backend.sh" "$APPSUP/start-backend.sh"
chmod +x "$APPSUP/start-backend.sh"
# Frontend launcher
cp "$REPO_ROOT/Scripts/autorun/start-frontend.sh" "$APPSUP/start-frontend.sh"
chmod +x "$APPSUP/start-frontend.sh"

# Plist files — substitute the user's actual path on this machine.
# The committed plists reference /Users/ilyaklipinitser/... — make portable.
for label in backend frontend; do
  PLIST_SRC="$REPO_ROOT/Scripts/autorun/com.dwellium.${label}.plist"
  PLIST_DST="$LAUNCHAGENTS/com.dwellium.${label}.plist"
  if [ ! -f "$PLIST_SRC" ]; then
    echo "⚠️  $PLIST_SRC missing — skipping ${label}"; continue
  fi
  # Replace any hardcoded /Users/ilyaklipinitser/ with the current $HOME
  sed "s|/Users/ilyaklipinitser|$HOME|g" "$PLIST_SRC" > "$PLIST_DST"
  echo "✅ Installed $PLIST_DST"
done

# ── 8: Load + verify ───────────────────────────────────────────────────
echo ""
echo "── 8/8: Loading agents + verifying ──"
# Bootout existing agents (idempotent — ignore errors)
launchctl bootout "gui/$(id -u)/com.dwellium.backend" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.dwellium.frontend" 2>/dev/null || true
# Kill any orphan processes on our ports
lsof -ti :3000 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti :5173 2>/dev/null | xargs kill 2>/dev/null || true

launchctl bootstrap "gui/$(id -u)" "$LAUNCHAGENTS/com.dwellium.backend.plist"
launchctl bootstrap "gui/$(id -u)" "$LAUNCHAGENTS/com.dwellium.frontend.plist"
echo "Waiting 10s for agents to boot..."
sleep 10

BACKEND_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")
FRONTEND_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ || echo "000")

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Dwellium install: VERIFICATION"
echo "════════════════════════════════════════════════════════════════"
echo "  Backend  :3000/health  → HTTP $BACKEND_OK $([ "$BACKEND_OK" = "200" ] && echo '✅' || echo '❌')"
echo "  Frontend :5173/        → HTTP $FRONTEND_OK $(echo "$FRONTEND_OK" | grep -qE '^[23]' && echo '✅' || echo '❌')"
echo ""
if [ "$BACKEND_OK" = "200" ] && echo "$FRONTEND_OK" | grep -qE '^[23]'; then
  echo "🎉 Install complete. Open http://localhost:5173/ in your browser."
  echo ""
  echo "  Logs:    ~/Library/Logs/dwellium-{backend,frontend}.{out,err}.log"
  echo "  Rebuild: $REPO_ROOT/Scripts/rebuild-frontend.sh"
  echo ""
  echo "  Stop:    launchctl bootout gui/\$(id -u) com.dwellium.{backend,frontend}"
  echo "  Status:  launchctl print gui/\$(id -u)/com.dwellium.backend"
else
  echo "❌ One or more services failed to start. Check logs:"
  echo "   tail ~/Library/Logs/dwellium-backend.err.log"
  echo "   tail ~/Library/Logs/dwellium-frontend.err.log"
  exit 1
fi
