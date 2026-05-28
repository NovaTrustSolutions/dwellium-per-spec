#!/usr/bin/env bash
# system-update.sh — driven by /api/system/apply. Pulls main, installs deps if
# package.json changed, rebuilds the frontend, kicks launchd, then writes a
# DONE status to $PROGRESS_FILE so the UI can stop polling.
set -e

REPO_ROOT="${REPO_ROOT:-/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec}"
PROGRESS_FILE="${PROGRESS_FILE:-/tmp/dwellium-system-update.status.json}"
UPDATE_LOG="${UPDATE_LOG:-/tmp/dwellium-system-update.log}"

exec > "$UPDATE_LOG" 2>&1

# nvm-aware shell — sister to Scripts/_rebuild-with-nvm.sh
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use --silent default 2>/dev/null || true

write_status() {
    local state="$1"; local msg="$2"
    python3 -c "
import json, os, time
p = '$PROGRESS_FILE'
try:
    with open(p) as f: d = json.load(f)
except Exception:
    d = {}
d['state'] = '$state'
d['message'] = '''$msg'''
if d.get('state') in ('done', 'error'):
    d['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
with open(p, 'w') as f: json.dump(d, f, indent=2)
"
}

fail() {
    write_status "error" "$1"
    echo "[ERROR] $1"
    # Set exit code in status
    python3 -c "
import json
with open('$PROGRESS_FILE') as f: d = json.load(f)
d['exitCode'] = $2
with open('$PROGRESS_FILE','w') as f: json.dump(d, f, indent=2)
"
    exit "$2"
}

echo "[$(date)] system-update starting in $REPO_ROOT"

cd "$REPO_ROOT"

# --- 1. Fetch + pull ---
write_status "fetching" "Fetching latest commits…"
git fetch origin main || fail "git fetch failed" 10

BEFORE=$(git rev-parse HEAD)
BEHIND=$(git rev-list --count "$BEFORE"..origin/main)
echo "Before: $BEFORE  Behind: $BEHIND"

if [ "$BEHIND" = "0" ]; then
    write_status "done" "Already up to date (no new commits)."
    python3 -c "
import json
with open('$PROGRESS_FILE') as f: d = json.load(f)
d['exitCode'] = 0
with open('$PROGRESS_FILE','w') as f: json.dump(d, f, indent=2)
"
    echo "[$(date)] Up to date — exiting cleanly."
    exit 0
fi

write_status "pulling" "Pulling $BEHIND new commit(s)…"
git pull --ff-only origin main || fail "git pull failed — local changes may need stashing" 11
AFTER=$(git rev-parse HEAD)
echo "Pulled: $BEFORE → $AFTER"

# --- 2. npm install if package.json changed ---
if git diff --name-only "$BEFORE" "$AFTER" | grep -q '^qualia-shell/package\.json$\|^qualia-shell/package-lock\.json$'; then
    write_status "installing" "package.json changed — running npm install…"
    cd qualia-shell
    npm install --no-fund --no-audit || fail "npm install failed" 12
    cd "$REPO_ROOT"
fi

# --- 3. Rebuild + sync to production frontend ---
write_status "building" "Building + syncing production frontend…"
bash Scripts/_rebuild-with-nvm.sh || fail "frontend rebuild failed" 13

# --- 4. Kick backend (in case backend files were touched) ---
write_status "restarting" "Restarting backend launchd agent…"
launchctl kickstart -k gui/$(id -u)/com.dwellium.backend 2>/dev/null || true

# --- 5. Done ---
write_status "done" "Updated to $(git rev-parse --short HEAD) ($BEHIND commit(s) pulled)."
python3 -c "
import json
with open('$PROGRESS_FILE') as f: d = json.load(f)
d['exitCode'] = 0
with open('$PROGRESS_FILE','w') as f: json.dump(d, f, indent=2)
"
echo "[$(date)] Update complete: $AFTER"
