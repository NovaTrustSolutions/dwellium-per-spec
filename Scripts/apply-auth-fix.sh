#!/usr/bin/env bash
#
# apply-auth-fix.sh — apply the recoverable session/auth fix to a clone, then verify.
#
# WHAT IT DOES (the "best fix" for "click a widget → bounced to login"):
#   1. doRefresh() never logs you out on a failed refresh — it returns
#      'refreshed' | 'dead' | 'transient'. Transient (5xx/404/network) keeps the
#      session + raises the "connect?" banner.
#   2. A DEFINITIVELY dead session (a 401/403 from the authoritative
#      /api/auth/me, or a rejected refresh token) keeps the shell mounted and
#      flips `sessionExpired` → AuthGate overlays a recoverable "sign in again"
#      modal (src/components/Auth/SessionExpiredModal.tsx). The user resumes in
#      place; only an explicit logout() goes to the login screen.
#   3. /api/auth/me re-validates on window focus + regaining connectivity, so a
#      session that dies while the app is open surfaces the modal promptly
#      instead of failing widgets silently until a manual reload.
#
# Mechanism: applies Scripts/dwellium-auth-fix.patch (UserContext.tsx + App.tsx
# + SessionExpiredModal.tsx + UserContext.test.tsx) with `git apply --3way`, then
# runs tsc + the auth test file. Idempotent: skips if already applied.
#
# Usage:
#   bash Scripts/apply-auth-fix.sh                 # apply (if needed) + verify
#   SKIP_VERIFY=1 bash Scripts/apply-auth-fix.sh   # apply only
#
# If `git apply` fails due to context drift on a divergent clone, the cleaner
# path is to merge the feature branch rather than force the patch.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
PATCH="$SCRIPT_DIR/dwellium-auth-fix.patch"
CTX="$REPO/qualia-shell/src/context/UserContext.tsx"
MODAL="$REPO/qualia-shell/src/components/Auth/SessionExpiredModal.tsx"

[ -f "$PATCH" ] || { echo "ERROR: $PATCH not found." >&2; exit 1; }
[ -f "$CTX" ]   || { echo "ERROR: run from inside the repo ($CTX missing)." >&2; exit 1; }

# ── Apply (idempotent) ────────────────────────────────────────────────────────
if [ -f "$MODAL" ] && grep -q "sessionExpired" "$CTX"; then
  echo "==> Recoverable re-auth already present — skipping patch."
else
  echo "==> Applying Scripts/dwellium-auth-fix.patch (git apply --3way) …"
  if ! git -C "$REPO" apply --3way --whitespace=nowarn "$PATCH"; then
    echo "ERROR: git apply failed — this clone has diverged from the patch base." >&2
    echo "       Merge the feature branch (feat/scribe-ingestion-honcho) instead," >&2
    echo "       or apply the change by hand from the patch." >&2
    exit 1
  fi
  echo "   ✓ applied."
fi

# ── Verify (per repo rule: prove it before claiming it) ───────────────────────
if [ "${SKIP_VERIFY:-0}" = "1" ]; then
  echo "==> SKIP_VERIFY=1 — applied only, not verified."; exit 0
fi
echo "==> Verifying (cd qualia-shell) …"
cd "$REPO/qualia-shell"
echo "    npx tsc -b …";                                  npx tsc -b
echo "    npx vitest run src/test/UserContext.test.tsx …"; npx vitest run src/test/UserContext.test.tsx
echo ""
echo "✅ Applied and verified. Now run the FULL gate before pushing:"
echo "   cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && \\"
echo "   VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && \\"
echo "   node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs"
