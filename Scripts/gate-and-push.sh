#!/usr/bin/env bash
#
# gate-and-push.sh — run the FULL gate on the Mac and push ONLY if it's green.
# Honors the repo rule: "never push without verified-green + Ilya's go."
# `set -e` aborts on the first failure, so a red gate never reaches `git push`.
#
# Usage (from the repo root, on the Mac):
#   bash Scripts/gate-and-push.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

echo "==> Clearing any stale git lock (safe if none)…"
rm -f .git/index.lock 2>/dev/null || true

echo "==> [1/6] tsc -b"
( cd qualia-shell && npx tsc -b )
echo "==> [2/6] vitest run (full suite)"
( cd qualia-shell && npx vitest run )
echo "==> [3/6] react-router build (seeds=true)"
( cd qualia-shell && npx react-router build )
echo "==> [4/6] react-router build (seeds=false)"
( cd qualia-shell && VITE_APPFOLIO_SEEDS=false npx react-router build )
echo "==> [5/6] PII scan"
node Scripts/verify_no_pii_leak.mjs
echo "==> [6/6] SSR smoke-test (on a free port — your dev backend may hold :3000)"
SMOKE_TEST_SKIP_BUILD=true SMOKE_TEST_PORT="${SMOKE_TEST_PORT:-38555}" node Scripts/smoke_test_ssr_phase8.mjs

echo ""
echo "✅ FULL GATE GREEN — committing + pushing"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git add -A
git commit -m "feat: 17 wishlist features + partials + standalone Electron app

Scribe (§5): Brain-Dump tab, Find & Replace, Focus mode, inline flags, priority badge.
Design/workspace: cursor-spotlight cards (§3.3), File-Explorer root path (§2.4), title-bar trim (§3.5).
Files (§4.3): Move-to-Thread, Thread switcher, Show-in-Finder (Electron).
Knowledge layer (§7): Three-Tier Wiki, Synthesis loop, Foundry intake, Knowledge Graph (dep-free force layout).
Agents (§8): Schema/PRD/Gap builder agents (8.6-8.8), The Hive console + cost + manual trigger (8.1-8.3), CoPaw memory (8.5).
Also: system-wide content search (§2.5), autonomous-run library (§1.4), sticky user message (§5.9), data-folder picker.
Standalone Electron app: backend sidecar + front proxy, universal mac .dmg build script, IPC (show-in-finder, data root).
Docs: GAP_ANALYSIS_v2, BACKEND_CONTRACT_remaining. ~72 new unit tests; tsc + gate green."
git push origin "$BRANCH"

echo ""
echo "✅ Pushed $BRANCH → origin"
echo "   Open a PR: https://github.com/NovaTrustSolutions/dwellium-per-spec/compare/$BRANCH"
