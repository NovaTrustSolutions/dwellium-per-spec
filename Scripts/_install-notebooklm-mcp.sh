#!/usr/bin/env bash
# Install pipx (if missing) + notebooklm-mcp-server. Logs everything for
# osascript-driven background execution. See: /tmp/dwellium-nlm-install.log
set -e
exec > /tmp/dwellium-nlm-install.log 2>&1
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
echo "[$(date)] Starting"

echo "== brew --version =="
brew --version

if ! command -v pipx >/dev/null 2>&1; then
    echo "== brew install pipx =="
    brew install pipx
    pipx ensurepath
fi

echo "== pipx --version =="
pipx --version

echo "== pipx install notebooklm-mcp-server =="
pipx install notebooklm-mcp-server

echo "== which notebooklm-mcp =="
which notebooklm-mcp || true
echo "== which notebooklm-mcp-auth =="
which notebooklm-mcp-auth || true

echo "[$(date)] Done"
