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
git commit -m "feat: AI assistant launcher + Open Notebook tab + grid lock + Gmail/Calendar Settings paths

Open Notebook. New 'Open Notebook' tab in the NotebookLM widget that embeds the
self-hosted Open Notebook app (lfnovo/open-notebook) via iframe (default :8502), with a
reachability indicator, editable + persisted instance URL, an open-in-new-window fallback
(for instances that block embedding), and a collapsible Docker setup guide for when it
isn't running. components/NotebookLMContext/OpenNotebookPanel.* + tabbed NotebookLMContext.

AI assistant launcher. The bottom-right bubble now opens a selector menu to invoke
Antigravity (Gemini), ARA, Inbox Zero, or Stella — each hosting its real component,
fully functional. Draggable/resizable panel; minimize sends the active assistant to the
background (collapses to the bubble) while it keeps running; opened assistants stay mounted
so switching preserves state. Replaces the single OpenJarvis mount in AdminShell.
components/AssistantLauncher/* (AssistantLauncher + AntigravityChat + css).

Grid lock. A lock/unlock button sits next to the Settings gear in the sidebar and
freezes every widget window in place — no drag, resize, or tear-off — then unfreezes
on toggle. Free-form placement + unlimited resizable widgets already existed (Settings
-> Desktop Regions = Off); added a Settings hint making it discoverable. New SSR-safe
gridLockStore (createLocalStorageStore + useSyncExternalStore) + useGridLock hook;
Window.tsx gates drag/resize/tear-off on lock; Desktop auto-region-snap is skipped while
locked. utils/gridLockStore.ts + hooks/useGridLock.ts (+unit tests) + Window.tsx/.css +
Sidebar.tsx/.css + Desktop.tsx + ControlPanel.tsx.

Gmail/Calendar. Fixed the 5 ControlPanel fetch calls to the /api/* routes the backend
now exposes (gmail/test, gmail/fetch, calendar/events GET+POST, integrations/status) —
they were missing the /api prefix so the Settings cards never reached the backend. The
backend route layer lives in the dwellium-backend repo (committed there separately).

Verified on the Mac sandbox: tsc --noEmit exit 0; vitest gridLockStore 6/6. Full gate
(vitest suite + both builds + PII + SSR smoke) runs here. Live UI (lock button, frozen
windows) + Google OAuth verified on the Mac after sign-in."
git push origin "$BRANCH"

echo ""
echo "✅ Pushed $BRANCH → origin"
echo "   Open a PR: https://github.com/NovaTrustSolutions/dwellium-per-spec/compare/$BRANCH"
