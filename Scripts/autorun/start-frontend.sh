#!/bin/bash
#
# Auto-start launcher for Dwellium frontend (production build).
# Sourced by launchd at user login (com.dwellium.frontend.plist).
# Serves the pre-built React Router v7 framework-mode bundle on :5173.
# Restart-on-crash handled by launchd KeepAlive.
#
# This script does NOT build. It only serves an already-built bundle
# from BUILD_DIR. To rebuild after source changes, run:
#   "$REPO/Scripts/rebuild-frontend.sh"
# That script builds in the (TCC-protected) source dir, copies artifacts
# to BUILD_DIR (TCC-free), and kicks this launchd agent.

set -u

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# nvm sourcing (same pattern as start-backend.sh)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "/opt/homebrew/opt/nvm/nvm.sh"
elif [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

BUILD_DIR="$HOME/Library/Application Support/Dwellium/frontend-build"
PORT="${DWELLIUM_FRONTEND_PORT:-5173}"

if [ ! -d "$BUILD_DIR" ]; then
  echo "[start-frontend] FATAL: $BUILD_DIR not found. Run rebuild-frontend.sh first." >&2
  exit 1
fi

if [ ! -f "$BUILD_DIR/build/server/index.js" ]; then
  echo "[start-frontend] FATAL: $BUILD_DIR/build/server/index.js missing — invalid build." >&2
  exit 1
fi

if [ ! -d "$BUILD_DIR/node_modules/@react-router/serve" ]; then
  echo "[start-frontend] FATAL: react-router-serve not installed in $BUILD_DIR. Run rebuild-frontend.sh." >&2
  exit 1
fi

cd "$BUILD_DIR" || exit 1

# react-router-serve expects the canonical <cwd>/build/{client,server} layout.
# CWD is BUILD_DIR; serve build/server/index.js → static assets resolved
# automatically from BUILD_DIR/build/client/.
export PORT
exec npx --no-install react-router-serve "$BUILD_DIR/build/server/index.js"
