#!/bin/bash
# tools/office-mac/seed.sh — data seeds (plan 054 phase 4). UPSERT-only:
# nothing here ever deletes or overwrites; both halves are safe to re-run.
#  1. listmonk audiences + notice templates via tools/listmonk/seed.sh
#     (needs LISTMONK_USER + LISTMONK_TOKEN — created once in the listmonk UI).
#  2. Immich per-property albums (only if IMMICH_API_KEY is set) — same
#     find-or-create by albumName that the backend's /api/photos/albums/ensure
#     does (plans/053-photos-backend.patch: GET /albums, POST /albums).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)

# ── listmonk ────────────────────────────────────────────────────────────────
export LISTMONK_URL=${LISTMONK_URL:-http://127.0.0.1:9000}
if [ -n "${LISTMONK_USER:-}" ] && [ -n "${LISTMONK_TOKEN:-}" ]; then
    "$HERE/../listmonk/seed.sh"
else
    echo "listmonk seed SKIPPED — set LISTMONK_USER + LISTMONK_TOKEN first"
    echo "  (listmonk admin at $LISTMONK_URL -> Users -> create API user 'dwellium')"
fi

# ── Immich per-property albums ──────────────────────────────────────────────
IMMICH_URL=${IMMICH_URL:-http://127.0.0.1:2283}
if [ -z "${IMMICH_API_KEY:-}" ]; then
    echo "Immich album seed SKIPPED — set IMMICH_API_KEY (Immich UI -> Account Settings -> API Keys)"
    exit 0
fi
command -v jq >/dev/null 2>&1 || { echo "seed needs jq (brew install jq)"; exit 1; }
albums=$(curl -fsS -H "x-api-key: $IMMICH_API_KEY" "$IMMICH_URL/api/albums")
# Property names match the listmonk seeds / LeasingModule fixtures.
printf '%s\n' "Woodland Parc Townhomes" "Riverwood Club Apartments" | while read -r name; do
    if printf '%s' "$albums" | jq -e --arg n "$name" 'map(.albumName) | index($n) != null' >/dev/null; then
        echo "album exists (untouched): $name"
    else
        curl -fsS -X POST -H "x-api-key: $IMMICH_API_KEY" -H 'Content-Type: application/json' \
            -d "$(jq -n --arg n "$name" '{albumName: $n}')" "$IMMICH_URL/api/albums" >/dev/null
        echo "album created:            $name"
    fi
done
echo "seed done — nothing deleted, nothing overwritten."
