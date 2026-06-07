/**
 * Dwellium Desktop — Electron main process.
 *
 * Makes the app a true standalone: it (1) spawns the bundled Node backend as a
 * sidecar on a private port, (2) serves the static SPA + reverse-proxies /api,
 * /health, /uploads → the sidecar from one front origin, and (3) opens a window
 * on that origin. No separate server to start, no :3000 conflict with a dev
 * backend, and — because the backend stores everything on the filesystem under
 * DWELLIUM_DATA_ROOT — pointing that root at a passport-drive folder makes the
 * app AND its data travel together.
 *
 * Ports are fixed + private so the SPA (built with VITE_API_URL=http://127.0.0.1:FRONT_PORT)
 * always reaches the proxy. See Scripts/build-electron-mac.sh + electron/README.md.
 *
 * Verified here with `node --check`; the .dmg is produced on macOS (electron +
 * electron-builder can't run in the Linux build sandbox).
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const FRONT_PORT = Number(process.env.DWELLIUM_FRONT_PORT || 38472); // must match VITE_API_URL at build time
const BACKEND_PORT = Number(process.env.DWELLIUM_BACKEND_PORT || 38473);

// Where the SPA + backend live. Packaged: under resources/. Dev: repo paths.
const isPackaged = app.isPackaged;
const RES = isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const SPA_DIR = isPackaged ? path.join(RES, 'client') : path.join(RES, 'qualia-shell', 'build', 'client');
const BACKEND_DIR = isPackaged ? path.join(RES, 'backend') : path.join(RES, '..', 'ai-dashboard369-file-manager');
// Backend entrypoint (relative to BACKEND_DIR). Overridable for whatever the
// real backend's built entry is (dist/index.js, server.js, …).
const BACKEND_ENTRY = process.env.DWELLIUM_BACKEND_ENTRY || 'dist/index.js';

// Data root — point this at a passport-drive / iCloud folder to make data
// portable. Resolution: env override > persisted choice (Settings → Data Folder)
// > default ~/.dwellium. The chosen folder is remembered across launches.
const CONFIG_PATH = path.join(app.getPath('userData'), 'dwellium-config.json');
function readConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) || {}; } catch { return {}; }
}
function writeConfig(patch) {
    try {
        const next = { ...readConfig(), ...patch };
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
        return true;
    } catch { return false; }
}
let DATA_ROOT = process.env.DWELLIUM_DATA_ROOT || readConfig().dataRoot || path.join(app.getPath('home'), '.dwellium');

let backendProc = null;
let frontServer = null;
let mainWindow = null;
const backendLog = [];

function logBackend(line) {
    backendLog.push(line);
    if (backendLog.length > 500) backendLog.shift();
    process.stdout.write(`[backend] ${line}\n`);
}

/** Reap any process still holding one of our private ports — e.g. a sidecar
 *  orphaned by a prior hard-crash — so the app never leaves a backend running
 *  across restarts. No-op when nothing is listening. */
function killStaleOnPort(port) {
    try {
        const { execSync } = require('child_process');
        if (process.platform === 'win32') {
            execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`, { stdio: 'ignore' });
        } else {
            execSync(`lsof -ti tcp:${port} -sTCP:LISTEN | xargs kill -9`, { stdio: 'ignore', shell: '/bin/sh' });
        }
    } catch { /* nothing was listening — fine */ }
}

/** Spawn the bundled backend via Electron's own Node (no Node needed on host). */
function startBackend() {
    killStaleOnPort(BACKEND_PORT); // reap an orphaned sidecar from a prior crash
    const entry = path.join(BACKEND_DIR, BACKEND_ENTRY);
    if (!fs.existsSync(entry)) {
        logBackend(`entry not found: ${entry} — backend features will show offline states.`);
        return;
    }
    backendProc = spawn(process.execPath, [entry], {
        cwd: BACKEND_DIR,
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            NODE_ENV: 'production',
            PORT: String(BACKEND_PORT),
            DWELLIUM_DATA_ROOT: DATA_ROOT,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    backendProc.stdout.on('data', (d) => logBackend(String(d).trimEnd()));
    backendProc.stderr.on('data', (d) => logBackend(String(d).trimEnd()));
    backendProc.on('exit', (code) => logBackend(`exited with code ${code}`));
}

const MIME = {
    '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
    '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.map': 'application/json',
};

/** Proxy a request to the backend sidecar, streaming the response back. */
function proxyToBackend(req, res) {
    const opts = {
        hostname: '127.0.0.1', port: BACKEND_PORT, path: req.url, method: req.method, headers: req.headers,
    };
    const up = http.request(opts, (bRes) => {
        res.writeHead(bRes.statusCode || 502, bRes.headers);
        bRes.pipe(res);
    });
    up.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Backend not reachable' }));
    });
    req.pipe(up);
}

/** Front server: static SPA + reverse proxy for backend routes (same origin → no CORS). */
function startFrontServer() {
    return new Promise((resolve) => {
        frontServer = http.createServer((req, res) => {
            const url = (req.url || '/').split('?')[0];
            if (url.startsWith('/api') || url === '/health' || url.startsWith('/uploads')) {
                return proxyToBackend(req, res);
            }
            let fp = path.join(SPA_DIR, decodeURIComponent(url));
            try {
                if (!fp.startsWith(SPA_DIR)) fp = path.join(SPA_DIR, 'index.html'); // path-escape guard
                if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(SPA_DIR, 'index.html');
            } catch { fp = path.join(SPA_DIR, 'index.html'); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
            fs.createReadStream(fp).pipe(res);
        });
        killStaleOnPort(FRONT_PORT); // reap a stale front server from a prior crash
        frontServer.listen(FRONT_PORT, '127.0.0.1', () => resolve());
    });
}

/** Best-effort wait for the backend /health (never blocks startup hard). */
function waitForBackend(timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
        const tryOnce = () => {
            const r = http.request({ hostname: '127.0.0.1', port: BACKEND_PORT, path: '/health', method: 'GET' }, () => resolve(true));
            r.on('error', () => (Date.now() > deadline ? resolve(false) : setTimeout(tryOnce, 300)));
            r.end();
        };
        tryOnce();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440, height: 900, minWidth: 1024, minHeight: 700,
        backgroundColor: '#000000', show: false,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.loadURL(`http://127.0.0.1:${FRONT_PORT}/`);
    // External links open in the default browser, not a new Electron window.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
        return { action: 'allow' };
    });
}

// ── IPC: native actions the web build can't do ───────────────────────────────
ipcMain.handle('dwellium:showItemInFolder', (_e, fullPath) => {
    if (typeof fullPath === 'string' && fullPath) { shell.showItemInFolder(fullPath); return true; }
    return false;
});
ipcMain.handle('dwellium:chooseDataRoot', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'], title: 'Choose Dwellium data folder (e.g. on your passport drive)' });
    return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dwellium:dataRoot', () => DATA_ROOT);
// Persist a new data root (Settings → Data Folder). Takes effect on relaunch
// (the backend sidecar is spawned with DATA_ROOT at startup).
ipcMain.handle('dwellium:setDataRoot', (_e, p) => {
    if (typeof p !== 'string' || !p.trim()) return false;
    DATA_ROOT = p;
    return writeConfig({ dataRoot: p });
});
ipcMain.handle('dwellium:relaunch', () => { app.relaunch(); app.exit(0); });
// Synchronous read so the preload can inject window.__dwelliumWorkspaceRoot
// BEFORE the SPA's first render (the File Explorer header reads it synchronously).
ipcMain.on('dwellium:dataRootSync', (e) => { e.returnValue = DATA_ROOT; });

app.whenReady().then(async () => {
    startBackend();
    await startFrontServer();
    await waitForBackend();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Self-contained desktop app (not a dock/menubar resident): closing the window
// shuts the WHOLE app down on every platform, which tears the sidecar down with
// it via the before-quit handler below.
app.on('window-all-closed', () => app.quit());

// Guarantee the backend dies BEFORE the app exits. before-quit fires while the
// app is still alive, so we hold the quit (preventDefault) until SIGTERM — then
// a SIGKILL fallback — has actually reaped the sidecar. No orphaned backend is
// ever left listening after the app closes.
let isShuttingDown = false;
app.on('before-quit', (e) => {
    if (isShuttingDown) return;          // 2nd pass (after we re-call quit) → let it proceed
    isShuttingDown = true;
    try { frontServer && frontServer.close(); } catch { /* */ }
    const proc = backendProc; backendProc = null;
    if (!proc) return;                   // no sidecar → nothing to wait for
    e.preventDefault();                  // hold the quit until the child is confirmed dead
    let finished = false;
    const finish = () => { if (finished) return; finished = true; app.quit(); };
    proc.on('exit', finish);
    try { proc.kill('SIGTERM'); } catch { /* */ }
    setTimeout(() => { try { if (!proc.killed) proc.kill('SIGKILL'); } catch { /* */ } finish(); }, 1500);
});

// Terminal launch (`electron .`) or OS-level termination: still reap the sidecar.
function reapAndExit() { try { backendProc && backendProc.kill('SIGKILL'); } catch { /* */ } try { frontServer && frontServer.close(); } catch { /* */ } process.exit(0); }
process.on('SIGINT', reapAndExit);
process.on('SIGTERM', reapAndExit);
process.on('SIGHUP', reapAndExit);
