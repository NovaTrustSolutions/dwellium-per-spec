#!/usr/bin/env bash
# bootstrap-new-machine.sh
# ─────────────────────────────────────────────────────────────────────────────
# One-shot, idempotent installer for the entire Dwellium app on a fresh Mac.
# Produces a byte-identical functional copy of the source machine:
#   - clones the repo (or updates if already present)
#   - installs node via nvm if missing
#   - installs the backend (extracts tarball OR clones from REPO_BACKEND_URL)
#   - npm-installs frontend + backend
#   - builds the frontend in production mode
#   - syncs the build to ~/Library/Application Support/Dwellium/frontend-build
#   - installs launchd plists (backend on :3000, frontend on :5173)
#   - installs LibreOffice for PDF↔Office conversion
#   - installs the NotebookLM MCP via pipx + patches Claude Desktop config
#   - kicks all launchd agents
#   - prints a green/red summary
#
# Re-runnable: skips steps whose post-conditions are already satisfied. Each
# phase prints a banner so the operator (or Claude Code) can see progress.
#
# Usage on a fresh machine:
#   curl -fsSL https://raw.githubusercontent.com/NovaTrustSolutions/dwellium-per-spec/main/Scripts/bootstrap-new-machine.sh | bash
# OR, after cloning the repo:
#   bash Scripts/bootstrap-new-machine.sh
#
# Environment overrides:
#   REPO_URL          (default https://github.com/NovaTrustSolutions/dwellium-per-spec)
#   INSTALL_ROOT      (default $HOME/dwellium)        — where the repo lives
#   BACKEND_TARBALL   (default <repo>/Docs/backend-snapshot.tgz, falls back to BACKEND_REPO_URL)
#   BACKEND_REPO_URL  (default unset; if set, cloned instead of using the tarball)
#   BACKEND_ROOT      (default $HOME/dwellium-backend)
#   SKIP_LIBREOFFICE  (set to 1 to skip LibreOffice; PDF→Office will fall back to the friendly notice)
#   SKIP_NOTEBOOKLM   (set to 1 to skip NotebookLM MCP install)
#   SKIP_NOTEBOOKLM_AUTH (set to 1 to skip the interactive Google auth step)

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/NovaTrustSolutions/dwellium-per-spec}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/dwellium}"
BACKEND_ROOT="${BACKEND_ROOT:-$HOME/dwellium-backend}"
FRONTEND_BUILD_DIR="$HOME/Library/Application Support/Dwellium/frontend-build"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs"

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[0;33m"; BLUE="\033[0;34m"; NC="\033[0m"

phase()  { echo -e "\n${BLUE}=== $* ===${NC}"; }
ok()     { echo -e "${GREEN}✓${NC} $*"; }
warn()   { echo -e "${YELLOW}⚠${NC} $*"; }
fail()   { echo -e "${RED}✗${NC} $*"; exit 1; }

# ─── Phase 0: macOS + Homebrew + xcode-select ────────────────────────────────
phase "0. Verify macOS prerequisites"
[[ "$(uname -s)" == "Darwin" ]] || fail "This script targets macOS (got $(uname))"
xcode-select -p >/dev/null 2>&1 || { warn "Installing Xcode Command Line Tools (~5 min)…"; xcode-select --install || true; }
if ! command -v brew >/dev/null 2>&1; then
    phase "Installing Homebrew"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Ensure brew is on PATH for the rest of this script
    eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"
fi
ok "Homebrew: $(brew --version | head -1)"

# ─── Phase 1: nvm + node ─────────────────────────────────────────────────────
phase "1. nvm + node"
export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    warn "Installing nvm"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
# shellcheck disable=SC1090
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
if ! nvm list 2>/dev/null | grep -q 'v20\.'; then
    nvm install 20
fi
nvm use --silent 20 || nvm use --silent default
NODE_BIN="$(nvm which current)"
ok "node: $(node --version) ($NODE_BIN)"
ok "npm: $(npm --version)"

# ─── Phase 2: Clone or update the repo ───────────────────────────────────────
phase "2. Clone / update Dwellium repo"
if [[ -d "$INSTALL_ROOT/.git" ]]; then
    ok "Repo already at $INSTALL_ROOT; running git pull"
    git -C "$INSTALL_ROOT" pull --ff-only origin main || warn "git pull failed; continuing with current HEAD"
else
    mkdir -p "$(dirname "$INSTALL_ROOT")"
    git clone "$REPO_URL" "$INSTALL_ROOT"
fi
ok "HEAD: $(git -C "$INSTALL_ROOT" rev-parse --short HEAD)"

# ─── Phase 3: Backend tarball or clone ───────────────────────────────────────
phase "3. Backend"
BACKEND_TARBALL_DEFAULT="$INSTALL_ROOT/Docs/backend-snapshot.tgz"
BACKEND_TARBALL="${BACKEND_TARBALL:-$BACKEND_TARBALL_DEFAULT}"
if [[ -d "$BACKEND_ROOT/ai-dashboard369-file-manager" ]]; then
    ok "Backend already extracted at $BACKEND_ROOT"
elif [[ -n "${BACKEND_REPO_URL:-}" ]]; then
    mkdir -p "$BACKEND_ROOT"
    git clone "$BACKEND_REPO_URL" "$BACKEND_ROOT/ai-dashboard369-file-manager"
elif [[ -f "$BACKEND_TARBALL" ]]; then
    mkdir -p "$BACKEND_ROOT"
    tar -xzf "$BACKEND_TARBALL" -C "$BACKEND_ROOT"
    ok "Extracted backend tarball"
else
    warn "Backend not found — set BACKEND_REPO_URL or place a tarball at $BACKEND_TARBALL_DEFAULT"
    warn "Skipping backend install. App will work in LLM-only mode."
    BACKEND_SKIPPED=1
fi

if [[ -z "${BACKEND_SKIPPED:-}" ]]; then
    pushd "$BACKEND_ROOT/ai-dashboard369-file-manager" >/dev/null
    npm install --no-fund --no-audit
    # better-sqlite3 needs to be built against the local Node version
    npm_config_build_from_source=true npm rebuild better-sqlite3 2>/dev/null || true
    popd >/dev/null
    ok "Backend deps installed"
fi

# ─── Phase 4: Frontend deps + build + sync to production dir ─────────────────
phase "4. Frontend"
pushd "$INSTALL_ROOT/qualia-shell" >/dev/null
npm install --no-fund --no-audit
popd >/dev/null

# Reuses the rebuild-frontend.sh path the App Updates button drives
bash "$INSTALL_ROOT/Scripts/_rebuild-with-nvm.sh"
ok "Frontend built and synced to: $FRONTEND_BUILD_DIR"

# ─── Phase 5: launchd plists (backend on :3000, frontend on :5173) ───────────
phase "5. launchd autostart agents"
mkdir -p "$LAUNCHD_DIR" "$LOG_DIR"

# Copy plists from the repo (already shipped in Scripts/autorun/) and
# rewrite hard-coded user-specific paths to the current user.
for plist in "$INSTALL_ROOT/Scripts/autorun/"com.dwellium.*.plist; do
    [[ -f "$plist" ]] || continue
    name=$(basename "$plist")
    sed -e "s|/Users/ilyaklipinitser|$HOME|g" "$plist" > "$LAUNCHD_DIR/$name"
    launchctl unload "$LAUNCHD_DIR/$name" 2>/dev/null || true
    launchctl load "$LAUNCHD_DIR/$name"
    ok "Loaded $name"
done

# ─── Phase 6: Optional dependencies ──────────────────────────────────────────
phase "6. Optional dependencies"

if [[ "${SKIP_LIBREOFFICE:-0}" != "1" ]]; then
    if [[ -d /Applications/LibreOffice.app ]]; then
        ok "LibreOffice already installed"
    else
        warn "Installing LibreOffice (~700 MB, several min)…"
        brew install --cask libreoffice
        ok "LibreOffice installed"
    fi
else
    warn "Skipping LibreOffice install (SKIP_LIBREOFFICE=1)"
fi

if [[ "${SKIP_NOTEBOOKLM:-0}" != "1" ]]; then
    if ! command -v pipx >/dev/null 2>&1; then
        brew install pipx
        pipx ensurepath
    fi
    if ! [[ -x "$HOME/.local/pipx/venvs/notebooklm-mcp-server/bin/notebooklm-mcp" ]]; then
        pipx install notebooklm-mcp-server
    else
        ok "notebooklm-mcp-server already installed"
    fi

    # Patch Claude Desktop config (if Claude Desktop is installed)
    CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    if [[ -d "$HOME/Library/Application Support/Claude" ]]; then
        python3 - <<'PY' "$CLAUDE_CONFIG" "$HOME/.local/pipx/venvs/notebooklm-mcp-server/bin/notebooklm-mcp"
import json, os, sys, time, shutil
from pathlib import Path
cfg_path = Path(sys.argv[1])
binary = sys.argv[2]
if not cfg_path.exists():
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg_path.write_text('{}')
# Backup
backup = cfg_path.with_suffix(f'.json.bak-bootstrap-{int(time.time())}')
shutil.copy2(cfg_path, backup)
data = json.loads(cfg_path.read_text())
mcp = data.setdefault('mcpServers', {})
mcp['notebooklm-mcp'] = { 'command': binary, 'args': ['--transport', 'stdio'] }
cfg_path.write_text(json.dumps(data, indent=2))
print(f'Patched {cfg_path} (backup: {backup.name})')
PY
    else
        warn "Claude Desktop not installed; skipping config patch"
    fi

    if [[ "${SKIP_NOTEBOOKLM_AUTH:-0}" != "1" ]]; then
        if [[ -f "$HOME/.notebooklm-mcp/auth.json" ]]; then
            ok "NotebookLM auth cookies already cached"
        else
            warn "NotebookLM auth required (interactive — opens Chrome)."
            warn "Run when ready:    ~/.local/bin/notebooklm-mcp-auth"
        fi
    fi
else
    warn "Skipping NotebookLM MCP install (SKIP_NOTEBOOKLM=1)"
fi

# ─── Phase 7: Final smoke test ───────────────────────────────────────────────
phase "7. Smoke test"
sleep 3
backend_ok=0; frontend_ok=0
if curl -s -m 3 http://localhost:3000/health | grep -q '"status":"ok"'; then
    backend_ok=1
    ok "Backend responding on :3000"
fi
if curl -s -m 3 -o /dev/null -w '%{http_code}' http://localhost:5173/ | grep -q '200'; then
    frontend_ok=1
    ok "Frontend responding on :5173"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo
phase "✨ Bootstrap complete"
echo "Repo:            $INSTALL_ROOT  ($(git -C "$INSTALL_ROOT" rev-parse --short HEAD))"
echo "Backend:         $BACKEND_ROOT/ai-dashboard369-file-manager"
echo "Frontend build:  $FRONTEND_BUILD_DIR"
echo "Backend health:  $([[ $backend_ok == 1 ]] && echo OK || echo OFFLINE)"
echo "Frontend health: $([[ $frontend_ok == 1 ]] && echo OK || echo OFFLINE)"
echo
echo "Open the app:   http://localhost:5173/"
echo
echo "If anything failed, re-run this script — it is idempotent."
