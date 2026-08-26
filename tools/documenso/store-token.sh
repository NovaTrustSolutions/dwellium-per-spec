#!/bin/bash
# Store the Documenso API token safely: prompts once (no echo, no history),
# VALIDATES it against the local Documenso before saving, then wires the
# demo backend. If validation fails, nothing is stored.
set -u
BASE="${DOCUMENSO_URL:-http://127.0.0.1:3140}"
printf 'Paste the Documenso API token (input hidden): '
IFS= read -rs TOK; echo
TOK=$(printf '%s' "$TOK" | tr -d '[:space:]')
[ -z "$TOK" ] && { echo "Nothing entered — aborted, nothing stored."; exit 1; }
echo "Token length: ${#TOK} (a real Documenso token is ~40+ chars)"
code=$(/usr/bin/curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Authorization: $TOK" "$BASE/api/v2/template")
if [ "$code" != "200" ]; then
  echo "REJECTED: $BASE answered HTTP $code with this token — nothing stored."
  echo "In Documenso: delete the old token, create a new one, copy ALL of it, re-run this."
  exit 1
fi
security delete-generic-password -s dwellium-documenso-api >/dev/null 2>&1 || true
security add-generic-password -a dwellium -s dwellium-documenso-api -w "$TOK"
echo "VALIDATED (HTTP 200) and stored in Keychain. Wiring the demo backend…"
exec "$(cd "$(dirname "$0")" && pwd)/connect-local.sh"
