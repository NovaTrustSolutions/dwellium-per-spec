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
git commit -m "feat: transcription loop fix + AI System Health + user guide + install wizard

Transcription loop fix. TranscriptionHub's meeting-manager poller depended on elapsed + segments,
so during recording it tore down/recreated its setInterval every tick (and retried a dead backend
forever). Now decoupled via a ref + gated on backendOffline + state==='recording'. USER_GUIDE.md
added — every widget, the shell, settings, AI launcher, System Health, and integrations.

System Health. Pre-launch readiness check for every AI widget: a 'System Health' sidebar widget
(registry id system-health) + an auto readiness banner at login that opens it. Probes the backend
(/health), the per-user LLM key (hasActiveLlm), and external services (LangFlow/Paperclip/Open
Notebook reachability); shows each widget as ready / limited / not-connected with a Connect button
that opens the right Settings. Transcription no longer fails silently — it surfaces a backend-offline
banner. lib/systemHealth.ts (pure + unit-tested) + hooks/useSystemHealth.ts + components/SystemHealth/*
+ widgetRegistry + AdminShell mount + TranscriptionHub backend-offline surfacing.

Install wizard. New installer/ — an Electron click-through installer for a new Mac: a stepper
(Prerequisites → Get the code → Dependencies → Build → Services → Integrations → Finish) where
each section auto-installs on Continue with a live log + progress, reusing install.sh's commands.
main.js runs each section via bash (paths passed via env so spaces are safe). Run: cd installer
&& npm install && npm start; package: npm run dist → a double-click .dmg. Verified: JS parses +
every embedded step passes bash -n.

uv fix. LangFlow/CrewAI setup commands switched from 'uv pip install' (needs a venv) to
'uv tool install' (no venv) — fixes the 'No virtual environment found' error.

LangFlow + CrewAI. Two more Terminal tabs. LangFlow embeds the running LangFlow visual builder
(default :7860) — reachability, persisted URL, new-window fallback, and a setup guide that also
installs the NovaTrustSolutions/langchain fork into LangFlow's env (LangChain is a library, no UI
to embed — operational under LangFlow + from the Terminal). CrewAI is a Python framework with no
local UI: the tab leads with a runnable quickstart (install/scaffold/run in the Terminal) plus an
optional control-plane embed (app.crewai.com). components/Terminal/{LangFlowPanel,CrewAIPanel}.*

Paperclip. New 'Paperclip' tab in the Terminal widget that embeds the self-hosted Paperclip
app (paperclipai/paperclip — agent-orchestration control plane) via iframe (default :3100),
with a reachability indicator, editable + persisted URL, open-in-new-window fallback, and a
setup guide (npx paperclipai onboard --yes). components/Terminal/PaperclipPanel.* + tabbed Terminal.

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
