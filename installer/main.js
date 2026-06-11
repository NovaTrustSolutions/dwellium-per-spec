/**
 * Dwellium Installer — Electron main process.
 *
 * A click-through installation wizard. Each section is a bash script (mirroring
 * the repo's proven install.sh) that the main process runs via `bash -lc`,
 * streaming stdout/stderr to the renderer so the user sees live progress. Paths
 * are passed through environment variables (NOT string-interpolated) so folders
 * containing spaces — e.g. "Dwellium -Per Spec" — are handled safely.
 *
 * Run in dev:   npm install && npm start
 * Package .dmg: npm run dist   (on a Mac; produces a double-click installer)
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 960,
        height: 720,
        minWidth: 820,
        minHeight: 600,
        title: 'Dwellium Installer',
        backgroundColor: '#0a0a0a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── Bash step scripts (mirror install.sh + integration installs) ──────────
// Each references env vars set per-run; never string-interpolates paths.
const STEP_SCRIPTS = {
    prereqs: `
set -uo pipefail
brew_env() { for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done; }
brew_env
if ! command -v brew >/dev/null 2>&1; then
  echo "▸ Installing Homebrew (you may be prompted for your password)…"
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || { echo "Homebrew install failed"; exit 1; }
  brew_env
fi
echo "✓ Homebrew: $(brew --version | head -1)"
for pkg in node git "python@3.12" uv; do
  if brew list "$pkg" >/dev/null 2>&1; then echo "✓ $pkg already installed";
  else echo "▸ brew install $pkg"; brew install "$pkg" || { echo "Failed: $pkg"; exit 1; }; fi
done
if [ "\${INSTALL_DOCKER:-0}" = "1" ]; then
  if brew list --cask docker >/dev/null 2>&1; then echo "✓ Docker already installed";
  else echo "▸ brew install --cask docker"; brew install --cask docker || echo "⚠ Docker install skipped (install manually if you need Open Notebook/Paperclip)"; fi
fi
echo "✓ node $(node -v)  •  git $(git --version | awk '{print $3}')  •  uv $(uv --version 2>/dev/null || echo 'n/a')"
echo "DONE prereqs"
`,
    code: `
set -uo pipefail
BACKEND_HOME="$HOME/dwellium-backend"
BACKEND_DIR="$BACKEND_HOME/ai-dashboard369-file-manager"
if [ -d "$BACKEND_DIR" ]; then
  echo "✓ Backend already present at $BACKEND_DIR — skipping extraction."
else
  [ -f "\${BACKEND_TARBALL:-}" ] || { echo "No backend tarball selected. Go back and choose the backend .tar.gz."; exit 1; }
  mkdir -p "$BACKEND_HOME"
  echo "▸ Extracting backend → $BACKEND_HOME"
  tar -xzf "$BACKEND_TARBALL" -C "$BACKEND_HOME"
  if [ ! -d "$BACKEND_DIR" ]; then
    NESTED=$(find "$BACKEND_HOME" -maxdepth 3 -type d -name 'ai-dashboard369-file-manager' | head -1)
    [ -n "$NESTED" ] && [ "$NESTED" != "$BACKEND_DIR" ] && mv "$NESTED" "$BACKEND_DIR"
  fi
fi
[ -d "$BACKEND_DIR" ] || { echo "Backend folder not found after extraction"; exit 1; }
[ -d "$REPO_ROOT/qualia-shell" ] || { echo "Frontend not found at $REPO_ROOT/qualia-shell — pick the Dwellium repo folder."; exit 1; }
echo "✓ Frontend: $REPO_ROOT/qualia-shell"
echo "✓ Backend:  $BACKEND_DIR"
echo "DONE code"
`,
    deps: `
set -uo pipefail
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
SOURCE_DIR="$REPO_ROOT/qualia-shell"
BACKEND_DIR="$HOME/dwellium-backend/ai-dashboard369-file-manager"
echo "▸ npm install (backend) — this can take a few minutes…"
( cd "$BACKEND_DIR" && npm install --no-audit --no-fund ) || { echo "backend npm install failed"; exit 1; }
echo "▸ npm install (frontend)…"
( cd "$SOURCE_DIR" && npm install --no-audit --no-fund ) || { echo "frontend npm install failed"; exit 1; }
# DnD backend routes (idempotent), mirroring install.sh step 4
if [ -f "$REPO_ROOT/Docs/backend-scribe-dnd-routes.ts" ]; then
  cp "$REPO_ROOT/Docs/backend-scribe-dnd-routes.ts" "$BACKEND_DIR/src/routes/scribeDndRoutes.ts"
  ( cd "$BACKEND_DIR" && npm install --save multer @types/multer @mozilla/readability jsdom @types/jsdom turndown @types/turndown --no-audit --no-fund ) || true
  APP_TS="$BACKEND_DIR/src/app.ts"
  if ! grep -q "scribeDndRoutes" "$APP_TS"; then
    python3 - "$APP_TS" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = re.sub(r"(import scribeRoutes from './routes/scribeRoutes';)", r"\\1\\nimport scribeDndRoutes from './routes/scribeDndRoutes';", s)
s = re.sub(r"(app\\.use\\('/api/scribe', scribeRoutes\\);)", r"\\1\\napp.use('/api/scribe', scribeDndRoutes);", s)
open(p,'w').write(s)
PY
    echo "✓ app.ts patched with scribeDndRoutes"
  else echo "✓ app.ts already wired"; fi
fi
echo "DONE deps"
`,
    build: `
set -uo pipefail
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
SOURCE_DIR="$REPO_ROOT/qualia-shell"
APPSUP="$HOME/Library/Application Support/Dwellium"
BUILD_DIR="$APPSUP/frontend-build"
echo "▸ Building frontend (tsc -b && react-router build)…"
( cd "$SOURCE_DIR" && npm run build ) || { echo "frontend build failed"; exit 1; }
echo "▸ Staging build artifacts → $BUILD_DIR/build/"
mkdir -p "$BUILD_DIR/build" "$APPSUP"
rm -rf "$BUILD_DIR/build/client" "$BUILD_DIR/build/server"
cp -R "$SOURCE_DIR/build/client" "$BUILD_DIR/build/client"
cp -R "$SOURCE_DIR/build/server" "$BUILD_DIR/build/server"
node -e "
const src = require('$SOURCE_DIR/package.json');
const out = { name:'dwellium-frontend-runtime', version:'1.0.0', private:true, type:'module', dependencies: src.dependencies||{} };
if (!out.dependencies['@react-router/serve']) { const d=(src.devDependencies||{})['@react-router/serve']; if (d) out.dependencies['@react-router/serve']=d; }
require('fs').writeFileSync('$BUILD_DIR/package.json', JSON.stringify(out,null,2));
" || true
[ -f "$SOURCE_DIR/package-lock.json" ] && cp "$SOURCE_DIR/package-lock.json" "$BUILD_DIR/package-lock.json" || true
( cd "$BUILD_DIR" && npm install --omit=dev --no-audit --no-fund --silent ) || true
echo "DONE build"
`,
    services: `
set -uo pipefail
REPO="$REPO_ROOT"
APPSUP="$HOME/Library/Application Support/Dwellium"
LAUNCHAGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs"
mkdir -p "$APPSUP" "$LAUNCHAGENTS" "$LOGS"
if [ -f "$REPO/Scripts/autorun/start-backend.sh" ] && [ -f "$REPO/Scripts/autorun/start-frontend.sh" ]; then
  cp "$REPO/Scripts/autorun/start-backend.sh" "$APPSUP/start-backend.sh" && chmod +x "$APPSUP/start-backend.sh"
  cp "$REPO/Scripts/autorun/start-frontend.sh" "$APPSUP/start-frontend.sh" && chmod +x "$APPSUP/start-frontend.sh"
  for label in backend frontend; do
    SRC="$REPO/Scripts/autorun/com.dwellium.\${label}.plist"
    DST="$LAUNCHAGENTS/com.dwellium.\${label}.plist"
    [ -f "$SRC" ] && sed "s|/Users/ilyaklipinitser|$HOME|g" "$SRC" > "$DST" && echo "✓ installed $DST"
  done
  launchctl bootout "gui/$(id -u)/com.dwellium.backend" 2>/dev/null || true
  launchctl bootout "gui/$(id -u)/com.dwellium.frontend" 2>/dev/null || true
  lsof -ti :3000 2>/dev/null | xargs kill 2>/dev/null || true
  lsof -ti :5173 2>/dev/null | xargs kill 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$LAUNCHAGENTS/com.dwellium.backend.plist" || true
  launchctl bootstrap "gui/$(id -u)" "$LAUNCHAGENTS/com.dwellium.frontend.plist" || true
  echo "▸ Waiting 10s for services to boot…"; sleep 10
else
  echo "⚠ Autorun scripts not found — starting services directly for this session."
  ( cd "$HOME/dwellium-backend/ai-dashboard369-file-manager" && (npm run dev >"$LOGS/dwellium-backend.out.log" 2>&1 &) )
  ( cd "$APPSUP" && (npx --yes @react-router/serve build/server/index.js >"$LOGS/dwellium-frontend.out.log" 2>&1 &) )
  sleep 10
fi
BACKEND_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo 000)
FRONTEND_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ || echo 000)
echo "Backend :3000/health → $BACKEND_OK"
echo "Frontend :5173/ → $FRONTEND_OK"
echo "DONE services"
`,
    integrations: `
set -uo pipefail
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
BACKEND_DIR="$HOME/dwellium-backend/ai-dashboard369-file-manager"
if [ "\${I_LANGFLOW:-0}" = "1" ]; then echo "▸ LangFlow…"; uv tool install langflow && echo "✓ LangFlow installed (run: langflow run)"; fi
if [ "\${I_CREWAI:-0}" = "1" ]; then echo "▸ CrewAI…"; uv tool install 'crewai[tools]' && echo "✓ CrewAI installed (run: crewai create crew)"; fi
if [ "\${I_PAPERCLIP:-0}" = "1" ]; then echo "▸ Paperclip…"; npx -y paperclipai onboard --yes || echo "⚠ Paperclip onboarding needs attention — run 'npx paperclipai onboard --yes' in a terminal"; fi
if [ "\${I_OPENNOTEBOOK:-0}" = "1" ]; then
  echo "▸ Open Notebook (Docker)…"
  if command -v docker >/dev/null 2>&1; then
    D="$HOME/dwellium-open-notebook"; mkdir -p "$D"
    curl -fsSL -o "$D/docker-compose.yml" https://raw.githubusercontent.com/lfnovo/open-notebook/main/docker-compose.yml || true
    ( cd "$D" && docker compose up -d ) && echo "✓ Open Notebook starting at http://localhost:8502" || echo "⚠ Start Docker Desktop, then re-run"
  else echo "⚠ Docker not installed — enable it on the Prerequisites step, or install Docker Desktop"; fi
fi
if [ "\${I_GOOGLEOAUTH:-0}" = "1" ]; then
  echo "▸ Google OAuth (a browser window will open to sign in)…"
  ( cd "$BACKEND_DIR" && npm run oauth-setup ) || echo "⚠ Finish Google sign-in, then re-run if needed"
fi
echo "DONE integrations"
`,
};

function runStep(event, { id, env }) {
    return new Promise((resolve) => {
        const script = STEP_SCRIPTS[id];
        if (!script) { resolve({ ok: false, code: -1, error: 'unknown step ' + id }); return; }
        const child = spawn('bash', ['-lc', script], {
            cwd: env.REPO_ROOT || app.getPath('home'),
            env: { ...process.env, ...env },
        });
        const send = (stream, data) => {
            String(data).split(/\r?\n/).forEach((line) => {
                if (line.length) event.sender.send('step:log', { id, stream, line });
            });
        };
        child.stdout.on('data', (d) => send('out', d));
        child.stderr.on('data', (d) => send('err', d));
        child.on('error', (e) => { event.sender.send('step:log', { id, stream: 'err', line: String(e.message) }); });
        child.on('close', (code) => resolve({ ok: code === 0, code }));
    });
}

ipcMain.handle('step:run', (event, payload) => runStep(event, payload));

ipcMain.handle('prereqs:check', () => new Promise((resolve) => {
    const probe = `
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
for t in brew node git python3 uv docker; do
  if command -v "$t" >/dev/null 2>&1; then echo "$t|OK|$($t --version 2>&1 | head -1)"; else echo "$t|MISSING|"; fi
done`;
    const child = spawn('bash', ['-lc', probe]);
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', () => {
        const tools = {};
        out.trim().split('\n').forEach((l) => {
            const [name, status, version] = l.split('|');
            if (name) tools[name] = { ok: status === 'OK', version: version || '' };
        });
        resolve(tools);
    });
    child.on('error', () => resolve({}));
}));

ipcMain.handle('pick:folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Select the Dwellium repo folder (contains qualia-shell/)' });
    return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('pick:file', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], title: 'Select the backend tarball', filters: [{ name: 'Tarball', extensions: ['gz', 'tgz', 'tar'] }] });
    return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('detect:repo', () => {
    // When run from <repo>/installer, the repo root is one level up.
    const guess = path.join(__dirname, '..');
    try { if (fs.existsSync(path.join(guess, 'qualia-shell', 'package.json'))) return guess; } catch { /* ignore */ }
    return null;
});

ipcMain.handle('backend:locate', () => {
    // Bundled backend tarball: packaged → process.resourcesPath; dev → installer/resources.
    const candidates = [
        process.resourcesPath ? path.join(process.resourcesPath, 'backend.tar.gz') : null,
        path.join(__dirname, 'resources', 'backend.tar.gz'),
    ];
    let tarball = null;
    for (const p of candidates) { try { if (p && fs.existsSync(p)) { tarball = p; break; } } catch { /* ignore */ } }
    let present = false;
    try { present = fs.existsSync(path.join(app.getPath('home'), 'dwellium-backend', 'ai-dashboard369-file-manager')); } catch { /* ignore */ }
    return { tarball, present };
});

ipcMain.handle('app:open', (_e, url) => shell.openExternal(url || 'http://localhost:5173/'));
