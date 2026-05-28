#!/usr/bin/env bash
# Wrapper that sources nvm + runs rebuild-frontend.sh so launchd/osascript
# non-interactive shells get Node on PATH. See memory: feedback-nvm-non-interactive-subshells
set -e
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090,SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use --silent default 2>/dev/null || true
cd "$(dirname "$0")/.."
exec bash Scripts/rebuild-frontend.sh
