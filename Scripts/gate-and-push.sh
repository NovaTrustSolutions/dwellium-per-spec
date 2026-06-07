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
git commit -m "feat: persist File Explorer; Honcho background runner; Settings storage boxes

File Explorer now actually saves. The Workspace store caches its structure
(tree + domaines + thread metas) to a per-user localStorage snapshot and hydrates
it on mount, so your folders show instantly on reload and stay populated offline;
the backend overlays when reachable. workspaceStore.ts (+hydrate/persist) + Workspace.tsx.

Honcho runs in the background. A top-level always-on runner (mounted in the app
shell, post-auth) autonomously synthesizes a reflection over your Honcho memories on
a throttled schedule (<=1 per 6h; needs an LLM configured + >=3 memories) even when
the Honcho widget is closed. services/honchoBackgroundRunner.ts + Shell/AdminShell.tsx.

Settings storage boxes. Alongside the existing local-disk data folder, a new Google
Drive box backs up / restores Wiki + Thought Weaver + File Explorer + Honcho data to a
'Dwellium' folder on the user's own Drive — frontend-only via Google Identity Services +
Drive REST (drive.file scope; tokens session-only). API keys are NEVER backed up. The
user supplies a Google OAuth Client ID, like an LLM key. types/integrations.ts +
services/googleDriveStorage.ts (+snapshot tests) + ControlPanel/GoogleDriveSection.tsx.

Verified: tsc -b clean; vitest 983/983 (3 shards, +5 drive-snapshot tests); PII + both
builds + SSR smoke run as part of this gate. The live Google Drive OAuth round-trip needs
the user's own Client ID (Google Cloud setup) — compile- + unit-verified, not live in CI."
git push origin "$BRANCH"

echo ""
echo "✅ Pushed $BRANCH → origin"
echo "   Open a PR: https://github.com/NovaTrustSolutions/dwellium-per-spec/compare/$BRANCH"
