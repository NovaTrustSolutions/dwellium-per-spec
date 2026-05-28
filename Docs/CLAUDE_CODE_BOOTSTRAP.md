# Claude Code Bootstrap Playbook — Dwellium on a fresh Mac

> **Audience:** Claude Code (or any agent) running on a brand-new macOS machine that has nothing installed except Safari.
> **Outcome:** identical functioning Dwellium app to the source machine, with backend + frontend autostart on every login.
> **Total time:** ~15-25 minutes depending on the LibreOffice download.

This document is a deterministic, idempotent recipe. Each step states a goal and the exact command to run. Steps are safe to re-run. If a step fails, fix it and re-run from there.

---

## Step 0 — Read the operator preferences

Before running anything else, ask the operator:

1. **Do you have a copy of the backend repo or tarball?** If yes, get the URL or path.
2. **Do you want LibreOffice installed for PDF↔Office conversion?** (~700 MB)
3. **Do you want to authenticate NotebookLM now?** (requires you to sign in to Google in a browser window)

Save these as env vars:

```bash
export BACKEND_REPO_URL="https://github.com/<your>/dwellium-backend"   # OR
export BACKEND_TARBALL="/path/to/backend-snapshot.tgz"
export SKIP_LIBREOFFICE=0           # set to 1 to skip
export SKIP_NOTEBOOKLM_AUTH=0       # set to 1 to defer auth
```

---

## Step 1 — Run the one-shot bootstrap

> **🔴 The repo is PRIVATE.** Anonymous `curl | bash` from `raw.githubusercontent.com` will return **HTTP 400 / 404** because GitHub does not serve raw files from private repos to unauthenticated requests. **Pick one of the three options below** to get past Step 1. The script itself, once running, then handles every later step idempotently.

### Option A — GitHub CLI (recommended, fewest commands)

```bash
brew install gh
gh auth login                                # follow the browser prompts
gh repo clone NovaTrustSolutions/dwellium-per-spec ~/dwellium
bash ~/dwellium/Scripts/bootstrap-new-machine.sh
```

### Option B — SSH (if your Mac has an SSH key registered on GitHub)

```bash
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -C "$(whoami)@$(hostname)"
# Add ~/.ssh/id_ed25519.pub to github.com → Settings → SSH and GPG keys (if not already there)
ssh -T git@github.com                        # should say "successfully authenticated"
git clone git@github.com:NovaTrustSolutions/dwellium-per-spec.git ~/dwellium
bash ~/dwellium/Scripts/bootstrap-new-machine.sh
```

### Option C — Personal Access Token

```bash
# 1. Create a fine-grained PAT at https://github.com/settings/tokens
#    Resource: NovaTrustSolutions/dwellium-per-spec
#    Permissions: Contents → Read
# 2. Export it before running:
export GITHUB_TOKEN=<paste-PAT-here>
curl -fsSL -H "Authorization: token $GITHUB_TOKEN" \
  https://raw.githubusercontent.com/NovaTrustSolutions/dwellium-per-spec/main/Scripts/bootstrap-new-machine.sh \
  -o /tmp/bootstrap.sh
bash /tmp/bootstrap.sh
```

Watch for the green ✓ summary at the end:

```
Backend health:  OK
Frontend health: OK
```

If you see those two greens, **you are done**. Open http://localhost:5173/ and the app is live.

If you see a 400 / 404 / "Repository not found" at Phase 2, the bootstrap printed exactly which auth option to use — pick one of A/B/C and re-run.

If anything else is red, read the per-phase output and address the failure using the steps below.

---

## Step 2 — Install Homebrew (if missing)

```bash
which brew || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"
brew --version
```

---

## Step 3 — Install nvm + Node 20

```bash
[ -s "$HOME/.nvm/nvm.sh" ] || curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
node --version    # must print v20.x.x
npm --version
```

> **Why Node 20 specifically:** `better-sqlite3` in the backend was built against `NODE_MODULE_VERSION 115` (Node 20). If you use Node 22 you'll see a `Could not locate the bindings file` error on every backend boot.

---

## Step 4 — Clone the repo

```bash
git clone https://github.com/NovaTrustSolutions/dwellium-per-spec ~/dwellium
cd ~/dwellium
git rev-parse --short HEAD       # save this — it is the version you're installing
```

---

## Step 5 — Backend

Pick the path that matches the operator's answer in Step 0.

**Option A — backend repo:**
```bash
mkdir -p ~/dwellium-backend
git clone "$BACKEND_REPO_URL" ~/dwellium-backend/ai-dashboard369-file-manager
```

**Option B — backend tarball:**
```bash
mkdir -p ~/dwellium-backend
tar -xzf "$BACKEND_TARBALL" -C ~/dwellium-backend
```

Then build:
```bash
cd ~/dwellium-backend/ai-dashboard369-file-manager
npm install --no-fund --no-audit
npm_config_build_from_source=true npm rebuild better-sqlite3 || true
```

---

## Step 6 — Frontend deps + production build

```bash
cd ~/dwellium/qualia-shell
npm install --no-fund --no-audit
cd ~/dwellium
bash Scripts/_rebuild-with-nvm.sh    # writes to ~/Library/Application Support/Dwellium/frontend-build
```

---

## Step 7 — launchd autostart agents

Copies the canonical plists from the repo, rewriting the hard-coded source-machine username to whoever ran the script:

```bash
mkdir -p ~/Library/LaunchAgents ~/Library/Logs
for plist in ~/dwellium/Scripts/autorun/com.dwellium.*.plist; do
    name=$(basename "$plist")
    sed -e "s|/Users/ilyaklipinitser|$HOME|g" "$plist" > "$HOME/Library/LaunchAgents/$name"
    launchctl unload "$HOME/Library/LaunchAgents/$name" 2>/dev/null || true
    launchctl load "$HOME/Library/LaunchAgents/$name"
done
launchctl list | grep dwellium
```

You should see at least `com.dwellium.backend` and `com.dwellium.frontend` in the listing.

---

## Step 8 — Optional: LibreOffice for PDF↔Office conversion

Skip this if `SKIP_LIBREOFFICE=1`. Otherwise the PDF Gear's "PDF → DOCX/XLSX/PPTX" buttons will show a friendly "LibreOffice not installed" notice.

```bash
brew install --cask libreoffice
ls /Applications/LibreOffice.app/Contents/MacOS/soffice
```

---

## Step 9 — Optional: NotebookLM MCP server

```bash
brew install pipx
pipx ensurepath
pipx install notebooklm-mcp-server
```

Patch Claude Desktop config to register the MCP (only if Claude Desktop is installed):

```bash
python3 <<'PY'
import json, time, shutil
from pathlib import Path
p = Path.home() / 'Library/Application Support/Claude/claude_desktop_config.json'
if not p.exists(): p.parent.mkdir(parents=True, exist_ok=True); p.write_text('{}')
shutil.copy2(p, p.with_suffix(f'.json.bak-{int(time.time())}'))
data = json.loads(p.read_text())
data.setdefault('mcpServers', {})['notebooklm-mcp'] = {
    'command': str(Path.home() / '.local/pipx/venvs/notebooklm-mcp-server/bin/notebooklm-mcp'),
    'args': ['--transport', 'stdio'],
}
p.write_text(json.dumps(data, indent=2))
print('Patched:', p)
PY
```

Run the cookie auth (interactive — quit Chrome first, sign in to Google in the dedicated Chrome window that opens):

```bash
osascript -e 'tell application "Google Chrome" to quit' 2>/dev/null || true
sleep 2
~/.local/bin/notebooklm-mcp-auth
ls ~/.notebooklm-mcp/auth.json && echo "Auth cookies cached ✓"
```

Restart Claude Desktop to pick up the new MCP server, then ask any Claude session "list my NotebookLM notebooks" to verify.

---

## Step 10 — Smoke test

```bash
# Backend
curl -s http://localhost:3000/health
# Should print: {"status":"ok",…}

# Frontend
curl -s -o /dev/null -w 'HTTP=%{http_code}\n' http://localhost:5173/
# Should print: HTTP=200

# Open the app
open http://localhost:5173/
```

---

## Step 11 — Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **HTTP 400 / 404 during git clone or `curl \| bash`** | Repo is private; anonymous fetch is blocked by GitHub. Older curl + git surface this as 400 instead of 404. | Use Option A (gh CLI), B (SSH), or C (GITHUB_TOKEN) in Step 1 above. The bootstrap script also prints the same three options when it fails at Phase 2. |
| `remote: Repository not found.` during git clone | Same as above — your terminal has no GitHub credentials | Same fix |
| `better-sqlite3 NODE_MODULE_VERSION` mismatch | Backend was built against a different Node version | `cd ~/dwellium-backend/ai-dashboard369-file-manager && npm_config_build_from_source=true npm rebuild better-sqlite3` |
| Backend `Operation not permitted` on `~/Downloads` | macOS TCC blocks launchd-run scripts in `~/Downloads/~/Desktop/~/Documents` | Move repo to `~/dwellium` (default in this playbook), NOT `~/Downloads/…` |
| `npm: command not found` inside launchd | nvm isn't loaded in non-interactive launchd shells | The plists already source nvm. If you wrote a custom plist, see `Scripts/_rebuild-with-nvm.sh` for the pattern. |
| `/api/system/status` hangs first request | Backend cold-boot >5s | Wait 5-10s after `launchctl load`, then retry. Subsequent requests are <100 ms. |
| Frontend serves wrong assets after pulling new commits | `frontend-build` dir is stale | Open Settings → App Updates → ⬇️ Update now (or `bash Scripts/system-update.sh` from CLI) |
| NotebookLM MCP says `needs_auth` | Cookies expired (weeks) | Re-run `~/.local/bin/notebooklm-mcp-auth` |

---

## What this playbook installs

| Component | Where | Started by |
|---|---|---|
| Dwellium repo | `~/dwellium/` | git |
| Backend repo | `~/dwellium-backend/ai-dashboard369-file-manager/` | launchd → ts-node-dev :3000 |
| Frontend prod build | `~/Library/Application Support/Dwellium/frontend-build/` | launchd → react-router-serve :5173 |
| launchd plists | `~/Library/LaunchAgents/com.dwellium.*.plist` | macOS at login |
| LibreOffice | `/Applications/LibreOffice.app` (`/opt/homebrew/bin/soffice`) | backend on-demand |
| pipx + notebooklm-mcp-server | `~/.local/pipx/venvs/notebooklm-mcp-server/` | Claude Desktop on-demand |
| NotebookLM auth cookies | `~/.notebooklm-mcp/auth.json` | re-run `notebooklm-mcp-auth` to refresh |
| Claude Desktop MCP entry | `~/Library/Application Support/Claude/claude_desktop_config.json` | Claude Desktop on launch |

---

## Updating later

Once installed, in-app updates work via:

- **UI:** open Settings → App Updates → ⬇️ Update now
- **CLI:** `bash ~/dwellium/Scripts/system-update.sh`

Both pull `main`, conditionally re-install dependencies if `package.json` changed, rebuild + sync the frontend, and kick the backend launchd agent. No re-run of this bootstrap is needed for ordinary updates — only for fresh-machine installs.
