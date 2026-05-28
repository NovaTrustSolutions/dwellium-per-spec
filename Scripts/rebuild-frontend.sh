#!/bin/bash
#
# rebuild-frontend.sh — build the frontend in-place + deploy to TCC-free
# location + kick the launchd agent.
#
# Run this any time you change source in qualia-shell/ and want the served
# version to update. The launchd-managed frontend on :5173 will pick up
# the new bundle within ~5 seconds.
#
# Architecture:
#   SOURCE: /Users/.../Dwellium -Per Spec/qualia-shell  (TCC-blocked for launchd)
#       → npm run build  →  qualia-shell/build/
#   BUILD_DIR: ~/Library/Application Support/Dwellium/frontend-build  (TCC-free)
#       ← rsync the build artifacts here
#       ← npm install @react-router/serve as a sibling
#   launchd serves from BUILD_DIR via react-router-serve.

set -e
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/qualia-shell"
BUILD_DIR="$HOME/Library/Application Support/Dwellium/frontend-build"
LAUNCHD_LABEL="com.dwellium.frontend"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "❌ FATAL: $SOURCE_DIR not found." >&2
  exit 1
fi

echo "── 1/5: Building frontend in $SOURCE_DIR ──"
cd "$SOURCE_DIR"
npm run build

if [ ! -d "$SOURCE_DIR/build" ] || [ ! -f "$SOURCE_DIR/build/server/index.js" ]; then
  echo "❌ FATAL: Build did not produce $SOURCE_DIR/build/server/index.js" >&2
  exit 1
fi

echo ""
echo "── 2/5: Syncing build artifacts to $BUILD_DIR/build/ ──"
# react-router-serve expects the canonical layout: <cwd>/build/{client,server}
mkdir -p "$BUILD_DIR/build"
# Remove stale artifacts (handles both old direct-child layout AND new build/ layout)
rm -rf "$BUILD_DIR/client" "$BUILD_DIR/server" "$BUILD_DIR/build/client" "$BUILD_DIR/build/server"
cp -R "$SOURCE_DIR/build/client" "$BUILD_DIR/build/client"
cp -R "$SOURCE_DIR/build/server" "$BUILD_DIR/build/server"

echo ""
echo "── 3/5: Installing production runtime deps in $BUILD_DIR ──"
# The SSR bundle externalizes runtime deps (isbot, react, react-dom, @react-router/*, etc.)
# Build a runtime package.json that:
#   - inherits qualia-shell's full production dependency list (same versions)
#   - sets "type": "module" so Node loads the ESM server bundle correctly
#   - has no dev/test scripts (this is a deployment artifact, not a dev workspace)
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
// Ensure @react-router/serve is in deps (it might be in devDependencies in the source)
if (!out.dependencies['@react-router/serve']) {
  const fromDev = (src.devDependencies || {})['@react-router/serve'];
  if (fromDev) out.dependencies['@react-router/serve'] = fromDev;
}
require('fs').writeFileSync('$BUILD_DIR/package.json', JSON.stringify(out, null, 2));
console.log('  Wrote $BUILD_DIR/package.json (' + Object.keys(out.dependencies).length + ' prod deps)');
"
# Copy the lockfile so npm install resolves to the exact versions used in build
if [ -f "$SOURCE_DIR/package-lock.json" ]; then
  cp "$SOURCE_DIR/package-lock.json" "$BUILD_DIR/package-lock.json"
fi
( cd "$BUILD_DIR" && npm install --omit=dev --no-audit --no-fund --silent )

echo ""
echo "── 4/5: Kicking launchd agent ──"
if launchctl print "gui/$(id -u)/$LAUNCHD_LABEL" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/$LAUNCHD_LABEL"
  echo "✅ Frontend agent restarted"
else
  echo "⚠️  Frontend launchd agent not yet installed."
  echo "   Run: launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/$LAUNCHD_LABEL.plist"
fi

echo ""
echo "── 5/5: Verification ──"
sleep 6
PORT="${DWELLIUM_FRONTEND_PORT:-5173}"
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" | grep -q "^[23]"; then
  echo "✅ Frontend listening on :$PORT and serving."
else
  echo "⚠️  Frontend on :$PORT not responding. Check ~/Library/Logs/dwellium-frontend.err.log"
fi
