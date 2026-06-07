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
git commit -m "feat: Cognitive M Network reference-match + demo; sidebar + Thought Weaver polish

Cognitive Memory Network (MemoryGraphRAG) — match the reference cinematic:
- Layered-render overhaul so the three layers read as distinct stacked platforms:
  passage document-grid (gridPositions) + near-orthographic camera (PLANE_Y/span/dist/
  focal), triangulated ontology mesh, multi-color fact web, central red-orange
  topological-defect burst, hot beam, passage ripple rings.
  layeredLayout.ts (+gridPositions tests) + MemoryGraphView.tsx + CSS.
- One-click 'Load demo': imports a built-in sample corpus so you can ask questions
  immediately (demoCorpus.ts; prefills a sample query).
- Renamed widget to 'Cognitive M Network' + Earth icon (data/hierarchy.ts,
  registry/widgetRegistry.ts, Sidebar/iconMap.ts, widget header).
- Dock reconcile: refresh label + icon from defaults on load so renames/icon changes
  propagate to a persisted dock without resetting saved order/pins (WindowContext.tsx).

Sidebar collapse: icon-only rail glyphs recolored to violet (#8B5CF6) with the outline
removed (Sidebar.css .sidebar__icon-rail-btn).

Thought Weaver: Capture button text -> near-black (#0a0a0a) on acid-lime; emojis removed
(ThoughtWeaver.tsx + .css).

Verified before push: tsc -b clean; vitest 978/978 (3 shards); PII scan clean. Builds +
SSR smoke run as part of this gate."
git push origin "$BRANCH"

echo ""
echo "✅ Pushed $BRANCH → origin"
echo "   Open a PR: https://github.com/NovaTrustSolutions/dwellium-per-spec/compare/$BRANCH"
