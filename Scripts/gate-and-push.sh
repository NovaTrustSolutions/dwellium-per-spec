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
git commit -m "feat: recoverable session re-auth + Cognitive Memory Network 3D visualization

Auth (fixes 'clicking a widget kicks me to the login screen'):
- doRefresh() no longer logs out on a failed refresh; it returns refreshed/dead/transient.
  The ONLY authorities that clear the session are the /api/auth/me validator (a definitive
  401/403) and explicit logout(). A widget data-call 401 can no longer tear down the session.
- A genuinely-dead session keeps the shell mounted and shows a recoverable 'Session expired'
  modal (SessionExpiredModal) instead of bouncing to login; re-validates on focus + reconnect.
  UserContext.tsx + App.tsx + components/Auth/SessionExpiredModal.tsx.

MemoryGraphRAG — Cognitive Memory Network:
- Wired into the AI Tools sidebar + widget search (data/hierarchy.ts, Sidebar/widgetSearch.ts).
- New true-3D cinematic 'Network' view: orbiting perspective camera (project3D), painter's-
  algorithm depth-sort + depth-of-field, ~1.8k-particle drift field, query beam, real BFS
  wavefront (propagateWave) driving the HUD time step, bloom + vignette, edge-flow particles,
  node hover/click inspector, full HUD with real-data telemetry (telemetryBase).
  MemoryGraphView.tsx + pure layeredLayout.ts + memoryGraphScene.ts (+ CSS).

Tests: +51 unit tests (layeredLayout 26, memoryGraphScene 9, UserContext recoverable-reauth 7,
plus projection/wave/relaxation/telemetry). tsc + full suite green; PII clean.
Logged F-009 (auth fix claimed-done-but-incomplete miss). Adds Scripts/apply-auth-fix.{sh,patch}."
git push origin "$BRANCH"

echo ""
echo "✅ Pushed $BRANCH → origin"
echo "   Open a PR: https://github.com/NovaTrustSolutions/dwellium-per-spec/compare/$BRANCH"
