#!/usr/bin/env bash
#
# Auto-create the bundled backend tarball for the Dwellium installer.
#
# Runs automatically before `npm start` (prestart) and `npm run dist` (predist),
# so the installer always ships with an up-to-date backend — the end user never
# has to find or build a tarball.
#
# Backend source priority:
#   1. $BACKEND_SRC                                  (explicit override)
#   2. ~/dwellium-backend/ai-dashboard369-file-manager
#   3. ../../dwellium-backend/ai-dashboard369-file-manager   (sibling checkout)
#
# Non-fatal: if no backend source is found, it exits 0 and the wizard falls back
# to letting the user pick a tarball manually.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RES="$HERE/../resources"
OUT="$RES/backend.tar.gz"
mkdir -p "$RES"

CANDIDATES=(
  "${BACKEND_SRC:-}"
  "$HOME/dwellium-backend/ai-dashboard369-file-manager"
  "$HERE/../../../dwellium-backend/ai-dashboard369-file-manager"
)

SRC=""
for c in "${CANDIDATES[@]}"; do
  [ -n "$c" ] && [ -d "$c" ] && { SRC="$(cd "$c" && pwd)"; break; }
done

if [ -z "$SRC" ]; then
  echo "⚠ make-backend-tarball: backend source not found."
  echo "   Looked in: \$BACKEND_SRC, ~/dwellium-backend/ai-dashboard369-file-manager, sibling checkout."
  echo "   Set BACKEND_SRC=/path/to/ai-dashboard369-file-manager and re-run to bundle it,"
  echo "   or the installer will ask the user to pick the tarball (Change… in the Get-the-code step)."
  exit 0
fi

PARENT="$(cd "$SRC/.." && pwd)"
BASE="$(basename "$SRC")"   # ai-dashboard369-file-manager
echo "▸ Creating backend tarball from: $SRC"
tar --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='build' \
    --exclude='credentials' --exclude='.env' \
    -czf "$OUT" -C "$PARENT" "$BASE"
echo "✓ Wrote $OUT ($(du -h "$OUT" 2>/dev/null | cut -f1))"
echo "  (node_modules, .git, dist, build, credentials, .env excluded — installed/configured on the target machine)"
