#!/usr/bin/env bash
#
# build-electron-mac.sh — produce the standalone Dwellium .dmg ON A MAC.
#
# What it does (one command):
#   1. Builds the SPA in SPA mode (ssr:false) with the API base pinned to the
#      in-app front proxy — non-destructively (config is patched then restored).
#   2. Builds + stages the bundled Node backend sidecar (filesystem-backed; no DB).
#   3. Runs electron-builder to produce a universal (Intel+Apple Silicon),
#      unsigned .dmg under electron/dist-installer/.
#
# Requirements (Mac): Node 18+, npm. The backend repo must be present (default
# sibling ../ai-dashboard369-file-manager, or set DWELLIUM_BACKEND_DIR).
#
# Env overrides:
#   DWELLIUM_BACKEND_DIR    path to the backend repo (default: ../ai-dashboard369-file-manager)
#   DWELLIUM_BACKEND_ENTRY  built entry relative to backend (default: dist/index.js)
#   DWELLIUM_FRONT_PORT     front proxy port baked into the SPA (default: 38472)
#
# Gatekeeper: the .dmg is UNSIGNED. On a new Mac, right-click the app → Open
# (once) to bypass "unidentified developer". For signed/notarized builds, add an
# Apple Developer ID (see electron/README.md).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SHELL_DIR="$REPO/qualia-shell"
ELEC="$REPO/electron"
BACKEND_DIR="${DWELLIUM_BACKEND_DIR:-$REPO/../ai-dashboard369-file-manager}"
BACKEND_ENTRY="${DWELLIUM_BACKEND_ENTRY:-dist/index.js}"
FRONT_PORT="${DWELLIUM_FRONT_PORT:-38472}"

echo "==> Repo:    $REPO"
echo "==> Backend: $BACKEND_DIR  (entry: $BACKEND_ENTRY)"

# ── 1. Build the SPA (ssr:false) with the front-proxy API base ───────────────
echo "==> [1/4] Building SPA (ssr:false, VITE_API_URL=http://127.0.0.1:$FRONT_PORT) …"
cd "$SHELL_DIR"
# Non-destructive: snapshot the 3 files we patch, restore them on exit.
cp react-router.config.ts /tmp/dwellium.rr.bak
cp app/routes.ts /tmp/dwellium.routes.bak
cp vite.config.ts /tmp/dwellium.vite.bak
restore() {
  cp /tmp/dwellium.rr.bak react-router.config.ts
  cp /tmp/dwellium.routes.bak app/routes.ts
  cp /tmp/dwellium.vite.bak vite.config.ts
  echo "==> Restored react-router.config.ts / app/routes.ts / vite.config.ts"
}
trap restore EXIT
# SPA mode + drop the server-only /api proxy route + single CSS chunk.
sed -i '' 's/    ssr: true,/    ssr: false,/' react-router.config.ts || sed -i 's/    ssr: true,/    ssr: false,/' react-router.config.ts
sed -i '' "/route('\/api\/\*', 'routes\/apiProxy.tsx'),/d" app/routes.ts || sed -i "/route('\/api\/\*', 'routes\/apiProxy.tsx'),/d" app/routes.ts
grep -q cssCodeSplit vite.config.ts || perl -0pi -e "s/plugins: \[reactRouter\(\)\],/plugins: [reactRouter()],\n    build: { cssCodeSplit: false },/" vite.config.ts

VITE_API_URL="http://127.0.0.1:$FRONT_PORT" npx react-router build
test -f build/client/index.html || { echo "SPA build failed"; exit 1; }

# ── 2. Stage the SPA ─────────────────────────────────────────────────────────
echo "==> [2/4] Staging SPA …"
rm -rf "$ELEC/staging"; mkdir -p "$ELEC/staging/client"
cp -R build/client/. "$ELEC/staging/client/"

# ── 3. Build + stage the backend sidecar ─────────────────────────────────────
echo "==> [3/4] Building + staging backend …"
if [ -d "$BACKEND_DIR" ]; then
  cd "$BACKEND_DIR"
  npm ci || npm install
  npm run build || echo "   (no backend build script — copying as-is)"
  mkdir -p "$ELEC/staging/backend"
  cp -R ./. "$ELEC/staging/backend/" 2>/dev/null || true
  # Trim heavy/dev cruft from the bundled backend.
  rm -rf "$ELEC/staging/backend/.git" "$ELEC/staging/backend/.github" "$ELEC/staging/backend/test" "$ELEC/staging/backend/tests"
  test -f "$ELEC/staging/backend/$BACKEND_ENTRY" || echo "   WARNING: $BACKEND_ENTRY not found — set DWELLIUM_BACKEND_ENTRY to the real built entry."
else
  echo "   WARNING: backend repo not found at $BACKEND_DIR — building a UI-only app."
  echo "   Set DWELLIUM_BACKEND_DIR to bundle the backend (File Explorer / Scribe-save / Strata need it)."
  mkdir -p "$ELEC/staging/backend"
fi

# ── 4. Package the .dmg ──────────────────────────────────────────────────────
echo "==> [4/4] Packaging universal .dmg …"
cd "$ELEC"
npm install
npm run dist

echo ""
echo "✅ Done. Installer(s):"
ls -1 "$ELEC/dist-installer/"*.dmg 2>/dev/null || echo "   (check $ELEC/dist-installer/)"
echo ""
echo "Tip: to make data ride a passport drive, launch with"
echo "   DWELLIUM_DATA_ROOT=/Volumes/<DRIVE>/Dwellium open -a Dwellium"
echo "or choose the folder in-app (Settings → data folder)."
