#!/bin/bash
# Wire the local demo backend (:3010) to the self-hosted Documenso (:3140).
# One-time first: in Documenso (http://127.0.0.1:3140) → avatar → Settings →
# API Tokens → Create token "dwellium-backend", then store it once:
#   security add-generic-password -a dwellium -s dwellium-documenso-api -w
# (paste the token when prompted; nothing lands in shell history)
set -euo pipefail
TOK=$(security find-generic-password -s dwellium-documenso-api -w)
SCR=${SCR:-/tmp}; cd "$(dirname "$0")/../../.." 2>/dev/null || true
for p in $(lsof -nP -iTCP:3010 -sTCP:LISTEN -t 2>/dev/null); do kill "$p"; done; sleep 2
cd ~/dwellium-backend/ai-dashboard369-file-manager
PORT=3010 NODE_ENV=development AUTH_ENABLED=false CORS_ORIGINS="http://localhost:5174" \
  DOCUMENSO_API_URL=http://127.0.0.1:3140 DOCUMENSO_API_KEY="$TOK" \
  SCHEDULER_ENABLED=false GMAIL_FETCHER_ENABLED=false \
  nohup node dist/app.js > /tmp/dwellium-be-3010.log 2>&1 &
sleep 6; curl -s -m 6 http://localhost:3010/api/esign/documents | head -c 200; echo
