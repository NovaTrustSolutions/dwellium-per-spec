#!/bin/bash
#
# Auto-start launcher for Dwellium backend.
# Sourced by launchd at user login (com.dwellium.backend.plist).
# Backend listens on :3000. Restart-on-crash handled by launchd KeepAlive.
#
# nvm-aware per memory entry: launchd runs in a non-interactive context
# where ~/.zshrc is not read, so nvm must be sourced explicitly here.

set -u

# ── PATH bootstrap ─────────────────────────────────────────────────────────
# launchd starts with a minimal PATH. Add common dev tool locations so
# nvm-installed node + Homebrew binaries are discoverable.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# ── nvm sourcing ───────────────────────────────────────────────────────────
# Try Homebrew nvm first (most common on Apple Silicon), then ~/.nvm.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "/opt/homebrew/opt/nvm/nvm.sh"
elif [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

# ── Run the backend ────────────────────────────────────────────────────────
cd "$HOME/dwellium-backend/ai-dashboard369-file-manager" || {
  echo "[start-backend] FATAL: backend directory not found at $HOME/dwellium-backend/ai-dashboard369-file-manager" >&2
  exit 1
}

# exec replaces this shell so launchd's KeepAlive tracks the npm/node process directly
exec npm run dev
