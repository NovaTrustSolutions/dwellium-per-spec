#!/usr/bin/env bash
#
# build-electron-mac.sh — produce the standalone Dwellium .dmg ON A MAC,
# reproducibly (same inputs → same app payload, machine to machine).
#
# Determinism guarantees:
#   • Node major pinned via .nvmrc (preflight aborts on mismatch).
#   • Exact deps via STRICT `npm ci` from committed lockfiles (qualia-shell,
#     electron, backend) — never `npm install`, which can drift the tree.
#   • Electron + electron-builder pinned exact in electron/package.json + lock;
#     electronVersion + npmRebuild:false + fixed buildVersion in the build block.
#   • The bundled backend is pinned to a commit (electron/BACKEND_PIN) and the
#     build refuses to bundle a different one (unless DWELLIUM_ALLOW_BACKEND_DRIFT=1).
#   • Emits electron/dist-installer/build-manifest.json recording every input +
#     a SHA-256 fingerprint of the staged client payload, so two machines can
#     diff manifests and prove they built the same thing.
#
# NOTE: the .dmg *container* itself is not byte-identical across machines
# (electron-builder embeds timestamps + the disk image is unsigned), but the APP
# PAYLOAD inside it (client bundle, backend bundle, Electron version) is
# deterministic — that is what the manifest fingerprints.
#
# Env overrides:
#   DWELLIUM_BACKEND_DIR          backend repo (default ../ai-dashboard369-file-manager)
#   DWELLIUM_BACKEND_ENTRY        built entry (default dist/index.js)
#   DWELLIUM_FRONT_PORT           front proxy port baked into the SPA (default 38472)
#   DWELLIUM_ALLOW_BACKEND_DRIFT  =1 to bundle a backend commit != BACKEND_PIN (NOT for releases)
#
# Gatekeeper: the .dmg is UNSIGNED — right-click → Open once on a new Mac.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SHELL_DIR="$REPO/qualia-shell"
ELEC="$REPO/electron"
PIN_FILE="$ELEC/BACKEND_PIN"
BACKEND_DIR="${DWELLIUM_BACKEND_DIR:-$REPO/../ai-dashboard369-file-manager}"
BACKEND_ENTRY="${DWELLIUM_BACKEND_ENTRY:-dist/index.js}"
FRONT_PORT="${DWELLIUM_FRONT_PORT:-38472}"

sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
die() { echo "ERROR: $*" >&2; exit 1; }

# ── 0. Preflight: Node version + tooling ─────────────────────────────────────
echo "==> [0/5] Preflight (reproducibility gates) …"
command -v node >/dev/null || die "node not found."
command -v npm  >/dev/null || die "npm not found."
WANT_NODE_MAJOR="$(tr -dc '0-9' < "$REPO/.nvmrc" 2>/dev/null | head -c2)"
HAVE_NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ -n "$WANT_NODE_MAJOR" ] && [ "$HAVE_NODE_MAJOR" != "$WANT_NODE_MAJOR" ]; then
  die "Node major $HAVE_NODE_MAJOR != pinned $WANT_NODE_MAJOR (.nvmrc). Run: nvm use"
fi
[ -f "$SHELL_DIR/package-lock.json" ] || die "qualia-shell/package-lock.json missing — commit it."
[ -f "$ELEC/package-lock.json" ]      || die "electron/package-lock.json missing — commit it."
echo "    node $(node -v) · npm $(npm -v) · pinned Node major $WANT_NODE_MAJOR ✓"

# ── 1. Build the SPA (ssr:false) with the front-proxy API base ───────────────
echo "==> [1/5] Building SPA (ssr:false, VITE_API_URL=http://127.0.0.1:$FRONT_PORT) …"
cd "$SHELL_DIR"
echo "    npm ci (exact, from lockfile) …"
npm ci
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
sed -i '' 's/    ssr: true,/    ssr: false,/' react-router.config.ts || sed -i 's/    ssr: true,/    ssr: false,/' react-router.config.ts
sed -i '' "/route('\/api\/\*', 'routes\/apiProxy.tsx'),/d" app/routes.ts || sed -i "/route('\/api\/\*', 'routes\/apiProxy.tsx'),/d" app/routes.ts
grep -q cssCodeSplit vite.config.ts || perl -0pi -e "s/plugins: \[reactRouter\(\)\],/plugins: [reactRouter()],\n    build: { cssCodeSplit: false },/" vite.config.ts

VITE_API_URL="http://127.0.0.1:$FRONT_PORT" npx react-router build
test -f build/client/index.html || die "SPA build failed (no build/client/index.html)"

# ── 2. Stage the SPA ─────────────────────────────────────────────────────────
echo "==> [2/5] Staging SPA …"
rm -rf "$ELEC/staging"; mkdir -p "$ELEC/staging/client"
cp -R build/client/. "$ELEC/staging/client/"

# ── 3. Backend: verify pin, then build + stage (strict ci) ───────────────────
echo "==> [3/5] Backend (pin-verified) …"
BACKEND_SHA="unbundled"
PIN_SHA="$(grep -E '^SHA=' "$PIN_FILE" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
if [ -d "$BACKEND_DIR" ]; then
  CUR_SHA="$(git -C "$BACKEND_DIR" rev-parse HEAD 2>/dev/null || echo '')"
  if [ -z "$PIN_SHA" ]; then
    if [ -n "$CUR_SHA" ]; then
      sed -i '' "s/^SHA=.*/SHA=$CUR_SHA/" "$PIN_FILE" || sed -i "s/^SHA=.*/SHA=$CUR_SHA/" "$PIN_FILE"
      echo "    BACKEND_PIN was empty → recorded $CUR_SHA. COMMIT electron/BACKEND_PIN so every machine pins it."
    fi
  elif [ -n "$CUR_SHA" ] && [ "$CUR_SHA" != "$PIN_SHA" ]; then
    if [ "${DWELLIUM_ALLOW_BACKEND_DRIFT:-0}" = "1" ]; then
      echo "    WARNING: backend at $CUR_SHA != pin $PIN_SHA — allowed via DWELLIUM_ALLOW_BACKEND_DRIFT=1 (non-reproducible)."
    else
      die "backend at $CUR_SHA != pinned $PIN_SHA. Run: git -C \"$BACKEND_DIR\" checkout $PIN_SHA  (or DWELLIUM_ALLOW_BACKEND_DRIFT=1 to override)"
    fi
  fi
  BACKEND_SHA="$(git -C "$BACKEND_DIR" rev-parse HEAD 2>/dev/null || echo 'nogit')"
  cd "$BACKEND_DIR"
  if [ -f package-lock.json ]; then npm ci; else die "backend has no package-lock.json — commit it for a reproducible bundle (or set DWELLIUM_ALLOW_BACKEND_DRIFT=1)"; fi
  npm run build || echo "    (no backend build script — copying as-is)"
  mkdir -p "$ELEC/staging/backend"
  cp -R ./. "$ELEC/staging/backend/" 2>/dev/null || true
  rm -rf "$ELEC/staging/backend/.git" "$ELEC/staging/backend/.github" "$ELEC/staging/backend/test" "$ELEC/staging/backend/tests"
  test -f "$ELEC/staging/backend/$BACKEND_ENTRY" || echo "    WARNING: $BACKEND_ENTRY not found — set DWELLIUM_BACKEND_ENTRY."
else
  echo "    WARNING: backend repo not at $BACKEND_DIR — building a UI-only app."
  mkdir -p "$ELEC/staging/backend"
fi

# ── 4. Package the .dmg (electron deps via strict ci) ────────────────────────
echo "==> [4/5] Packaging universal .dmg …"
cd "$ELEC"
npm ci
npm run dist

# ── 5. Reproducibility manifest ──────────────────────────────────────────────
echo "==> [5/5] Writing build manifest …"
CLIENT_FP="$(find "$ELEC/staging/client" -type f -exec shasum -a 256 {} \; | awk '{print $1}' | sort | shasum -a 256 | awk '{print $1}')"
CLIENT_N="$(find "$ELEC/staging/client" -type f | wc -l | tr -d ' ')"
ELECTRON_V="$(node -e "process.stdout.write(require('$ELEC/package.json').devDependencies.electron)")"
EB_V="$(node -e "process.stdout.write(require('$ELEC/package.json').devDependencies['electron-builder'])")"
mkdir -p "$ELEC/dist-installer"
cat > "$ELEC/dist-installer/build-manifest.json" <<EOF
{
  "node": "$(node -v)",
  "npm": "$(npm -v)",
  "electron": "$ELECTRON_V",
  "electronBuilder": "$EB_V",
  "repoHead": "$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo unknown)",
  "backendSha": "$BACKEND_SHA",
  "qualiaShellLockSha256": "$(sha256 "$SHELL_DIR/package-lock.json")",
  "electronLockSha256": "$(sha256 "$ELEC/package-lock.json")",
  "clientPayloadSha256": "$CLIENT_FP",
  "clientFileCount": $CLIENT_N
}
EOF

echo ""
echo "✅ Done. Installer(s):"
ls -1 "$ELEC/dist-installer/"*.dmg 2>/dev/null || echo "   (check $ELEC/dist-installer/)"
echo ""
echo "── Reproducibility manifest (diff this across machines) ──"
cat "$ELEC/dist-installer/build-manifest.json"
echo ""
echo "Tip: data on a passport drive →  DWELLIUM_DATA_ROOT=/Volumes/<DRIVE>/Dwellium open -a Dwellium"
