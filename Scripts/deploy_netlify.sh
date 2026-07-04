#!/usr/bin/env bash
#
# Scripts/deploy_netlify.sh
#
# Plan 036 — checked Netlify deploy wrapper.
#
# On 2026-07-04 a manual `netlify deploy --prod --dir build/client` shipped a
# BROKEN production build (root -> 404, ~3 min outage): the netlify-cli
# re-ran the netlify.toml build locally WITHOUT the NETLIFY env var, so
# qualia-shell/react-router.config.ts (`ssr: !process.env.NETLIFY`) built
# SSR mode -- no build/client/index.html -- overwriting the correct SPA
# build right before upload.
#
# This script encodes the known-good sequence (session-memory-only until
# now) as a checked, repeatable script with hard gates that would have
# caught that exact failure before it reached production:
#   1. Build with NETLIFY=true set explicitly (forces ssr:false / SPA mode).
#   2. Hard-assert build/client/index.html exists before touching netlify-cli.
#   3. Hard-assert the API proxy redirect line exists in _redirects.
#   4. Deploy with --no-build so netlify-cli uploads our verified artifact
#      instead of re-running its own build (which is what caused the outage).
#   5. Post-deploy, run the plan-031 read-only drift verifier against the
#      live site so a bad deploy is caught immediately, not next session.
#
# Usage:
#   DEPLOY_DRY_RUN=true bash Scripts/deploy_netlify.sh   # build + gates only, no deploy
#   bash Scripts/deploy_netlify.sh                        # real deploy (requires netlify-cli auth)
#
# Run from the repository root (this script cd's into qualia-shell itself).
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Config (overridable via environment)
# ---------------------------------------------------------------------------
NETLIFY_SITE_ID="${NETLIFY_SITE_ID:-ee11c6c2-ac8d-494c-b390-e1d2162d7480}"
NETLIFY_API_PROXY_TARGET="${NETLIFY_API_PROXY_TARGET:-https://dwellium-backend-472241012306.us-central1.run.app}"
VITE_API_URL="${VITE_API_URL:-}"
VITE_APPFOLIO_SEEDS="${VITE_APPFOLIO_SEEDS:-false}"
VITE_ONE_SAVE="${VITE_ONE_SAVE:-true}"
DEPLOY_DRY_RUN="${DEPLOY_DRY_RUN:-false}"

# Resolve repo root (this script lives at <root>/Scripts/deploy_netlify.sh).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
QUALIA_DIR="${REPO_ROOT}/qualia-shell"

echo "== Scripts/deploy_netlify.sh =="
echo "repo root:        ${REPO_ROOT}"
echo "site id:          ${NETLIFY_SITE_ID}"
echo "proxy target:     ${NETLIFY_API_PROXY_TARGET}"
echo "seeds:            ${VITE_APPFOLIO_SEEDS}"
echo "dry run:          ${DEPLOY_DRY_RUN}"
echo ""

cd "${QUALIA_DIR}"

# ---------------------------------------------------------------------------
# Build (NETLIFY=true is load-bearing -- see react-router.config.ts:
# `ssr: !process.env.NETLIFY`. Without it this builds SSR mode and produces
# NO build/client/index.html, which is the exact 2026-07-04 outage.)
# ---------------------------------------------------------------------------
echo "-- building (NETLIFY=true, forces SPA/ssr:false mode) --"
export NETLIFY=true
export VITE_API_URL
export VITE_APPFOLIO_SEEDS
export VITE_ONE_SAVE
export NETLIFY_API_PROXY_TARGET

npx react-router build

echo ""
echo "-- writing Netlify _redirects (api proxy) --"
node scripts/write-netlify-redirects.mjs

# ---------------------------------------------------------------------------
# Hard gate 1: SPA build must exist. This is THE check that would have
# caught the 2026-07-04 outage before the upload step ever ran.
# ---------------------------------------------------------------------------
if [[ ! -f build/client/index.html ]]; then
  echo ""
  echo "FATAL: build/client/index.html is missing." >&2
  echo "SPA build missing index.html — NETLIFY env not applied? Refusing to deploy (this exact bug caused the 2026-07-04 prod 404)." >&2
  exit 1
fi
echo "[gate 1 PASS] build/client/index.html exists"

# ---------------------------------------------------------------------------
# Hard gate 2: the /api/* proxy redirect must be present in _redirects,
# otherwise the deployed SPA has no backend to talk to.
# ---------------------------------------------------------------------------
if ! grep -q "/api/\*" build/client/_redirects; then
  echo ""
  echo "FATAL: build/client/_redirects is missing the /api/* proxy rule." >&2
  echo "Check NETLIFY_API_PROXY_TARGET and scripts/write-netlify-redirects.mjs output." >&2
  exit 1
fi
echo "[gate 2 PASS] build/client/_redirects contains /api/* proxy rule"

# ---------------------------------------------------------------------------
# Dry run stops here.
# ---------------------------------------------------------------------------
if [[ "${DEPLOY_DRY_RUN}" == "true" ]]; then
  echo ""
  echo "DRY RUN — skipping deploy"
  exit 0
fi

# ---------------------------------------------------------------------------
# Real deploy. --no-build is load-bearing: it tells netlify-cli to upload
# the build/client/ we just verified instead of re-running netlify.toml's
# own build (without NETLIFY=true set in that subprocess), which is exactly
# what silently overwrote the correct build on 2026-07-04.
# ---------------------------------------------------------------------------
echo ""
echo "-- deploying to Netlify (--no-build, --prod) --"
npx netlify-cli deploy --prod --no-build --dir build/client --site "${NETLIFY_SITE_ID}"

# ---------------------------------------------------------------------------
# Post-deploy verification: re-check the live site with the plan-031
# read-only drift verifier so a bad deploy is caught immediately.
# ---------------------------------------------------------------------------
echo ""
echo "-- post-deploy verification (Scripts/verify_deploy_env.mjs) --"
cd "${REPO_ROOT}"
node Scripts/verify_deploy_env.mjs
