#!/usr/bin/env bash
# Background-runner for notebooklm-mcp-auth (auto mode). The auth tool
# launches Chrome and waits for the user to sign in. Output streams to
# /tmp/dwellium-nlm-auth.log so the orchestrator can poll.
exec > /tmp/dwellium-nlm-auth.log 2>&1
export PATH=/Users/ilyaklipinitser/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
echo "[$(date)] Starting notebooklm-mcp-auth (auto mode)"
echo "Chrome will launch in a few seconds. Sign in to your Google account inside that Chrome window."
echo "============================================================"
/Users/ilyaklipinitser/.local/bin/notebooklm-mcp-auth
status=$?
echo "============================================================"
echo "[$(date)] notebooklm-mcp-auth exited with $status"
