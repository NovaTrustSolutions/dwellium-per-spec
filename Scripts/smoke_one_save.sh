#!/usr/bin/env bash
# One Save — backend /api/objects end-to-end smoke test.
#
# Exercises the spine the way the client does: upsert → read back → list →
# soft-delete → (optional) verify the on-disk object + append-only event log.
#
# Usage:
#   # backend running with AUTH_ENABLED=false (uses the dev user — no token):
#   bash Scripts/smoke_one_save.sh
#
#   # against a custom host, with a real session token, and disk verification:
#   BACKEND_URL=http://127.0.0.1:3000 \
#   TOKEN=<96-char session token> \
#   ONE_SAVE_DATA_DIR=~/dwellium-backend/ai-dashboard369-file-manager/data \
#   bash Scripts/smoke_one_save.sh
#
# Exits 0 on PASS, 1 on FAIL. Read-only except for the one throwaway object it
# creates + soft-deletes (id: smoke_<timestamp>).
set -uo pipefail

BACKEND="${BACKEND_URL:-http://localhost:3000}"
TOKEN="${TOKEN:-}"                       # required only if AUTH_ENABLED=true
DATA_DIR="${ONE_SAVE_DATA_DIR:-}"        # optional: <backend>/data for disk check
ID="smoke_$(date +%s)"

AUTH=()
[ -n "$TOKEN" ] && AUTH=(-H "Authorization: Bearer $TOKEN")

pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass + 1)); }
no() { echo "  ✗ $1"; fail=$((fail + 1)); }

echo "== One Save smoke test =="
echo "backend : $BACKEND"
echo "object  : $ID"
echo "auth    : $([ -n "$TOKEN" ] && echo 'bearer token' || echo 'dev user (AUTH_ENABLED=false)')"
echo

# 0. Reachability
code=$(curl -s -o /dev/null -w '%{http_code}' "$BACKEND/health" 2>/dev/null || echo 000)
echo "0) GET /health → HTTP $code"
[ "$code" = "200" ] || echo "   (no /health endpoint? continuing — the /api/objects calls are the real check)"
echo

# 1. PUT (upsert)
put=$(curl -s -X PUT "$BACKEND/api/objects/$ID" ${AUTH[@]+"${AUTH[@]}"} \
  -H 'Content-Type: application/json' \
  -d '{"type":"smoke","payload":{"hello":"world","n":42}}')
echo "1) PUT /api/objects/$ID"
if echo "$put" | grep -q '"success":true'; then ok "upsert acknowledged"; else no "upsert acknowledged → $put"; fi

# 2. GET back, payload intact
got=$(curl -s "$BACKEND/api/objects/$ID" ${AUTH[@]+"${AUTH[@]}"})
echo "2) GET /api/objects/$ID"
echo "$got" | grep -q '"hello":"world"' && ok "payload.hello round-trips" || no "payload.hello round-trips → $got"
echo "$got" | grep -q '"n":42' && ok "payload.n round-trips" || no "payload.n round-trips"
echo "$got" | grep -q '"deletedAt":null' && ok "not tombstoned" || no "not tombstoned"

# 3. list by type
lst=$(curl -s "$BACKEND/api/objects?type=smoke" ${AUTH[@]+"${AUTH[@]}"})
echo "3) GET /api/objects?type=smoke"
echo "$lst" | grep -q "$ID" && ok "appears in owner-scoped list" || no "appears in owner-scoped list"

# 4. soft-delete → excluded from list, still on disk
curl -s -X DELETE "$BACKEND/api/objects/$ID" ${AUTH[@]+"${AUTH[@]}"} >/dev/null
lst2=$(curl -s "$BACKEND/api/objects?type=smoke" ${AUTH[@]+"${AUTH[@]}"})
echo "4) DELETE (soft) then re-list"
if echo "$lst2" | grep -q "$ID"; then no "removed from list after soft-delete"; else ok "removed from list after soft-delete"; fi

# 5. on-disk object + append-only event log (optional)
echo "5) on-disk source of truth"
if [ -n "$DATA_DIR" ]; then
  DD="${DATA_DIR/#\~/$HOME}"
  [ -f "$DD/objects/$ID.json" ] && ok "objects/$ID.json exists" || no "objects/$ID.json exists (DATA_DIR=$DD)"
  if [ -f "$DD/events/$ID.ndjson" ]; then
    lines=$(wc -l < "$DD/events/$ID.ndjson" | tr -d ' ')
    [ "$lines" -ge 2 ] && ok "events/$ID.ndjson has $lines events (create…delete)" || no "event log too short ($lines)"
  else
    no "events/$ID.ndjson exists"
  fi
else
  echo "   (skipped — set ONE_SAVE_DATA_DIR=<backend>/data to verify object + event files)"
fi

echo
echo "== $pass passed, $fail failed =="
if [ "$fail" -eq 0 ]; then echo "PASS"; else echo "FAIL"; exit 1; fi
