#!/usr/bin/env bash
# Scripts/gate.sh — the canonical Dwellium strict gate (mirrors the AppFolio
# Parity Gate CI). Run this GREEN before committing/pushing.
#
#   bash Scripts/gate.sh
#
# Runs, in order: tsc -b → vitest → react-router build (seeds=true) →
# react-router build (seeds=false) → PII scan → SSR smoke test. Exits non-zero
# on the first failure (set -euo pipefail).
#
# It does NOT commit, push, or touch git history — that stays a deliberate,
# manual step you do yourself after the gate is green.
#
# Repo root is derived from this script's own location, so it works from any cwd
# and on any machine (no hardcoded paths).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO"

# Stale .git/index.lock cleanup — only if no git process is actually running.
if [ -f .git/index.lock ] && ! pgrep -x git >/dev/null 2>&1; then
  echo "• removing stale .git/index.lock"; rm -f .git/index.lock
fi

echo "▶ STRICT GATE (mirrors CI): tsc + vitest + build(seeds=true) + build(seeds=false) + PII + SSR smoke"
echo "  repo: $REPO"
echo "  (ETA ~4–7 min)"

(
  cd qualia-shell
  npx tsc -b
  # Lint is advisory only — NON-BLOCKING by design. A non-zero eslint exit (warnings,
  # or eslint not yet installed) must NOT abort the gate, so swallow it with `|| echo`.
  # We are already inside `cd qualia-shell` (above), so run the script directly.
  npm run lint || echo "[gate] lint reported issues (non-blocking)"
  npx vitest run
  npx react-router build
  VITE_APPFOLIO_SEEDS=false npx react-router build
)
node Scripts/verify_no_pii_leak.mjs
SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs

echo
echo "✅ GATE GREEN — safe to commit + push (do that yourself; this script won't)."
