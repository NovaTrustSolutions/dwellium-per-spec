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
const BACKEND_ENTRY = process.env.DWELLIUM_BACKEND_ENTRY || 'dist/app.js';

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
            // P13-2: NOT 'production' — the backend's production env-gate
            // demands AUTH_ENABLED=true, but the app ships in the same
            // auth-disabled local mode the dev machine runs (Ilya: "exactly
            // as it's working right now"). Sidecar binds 127.0.0.1 only.
            NODE_ENV: 'sidecar',
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
ipcMain.handle('dwellium:chooseDirectory', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'], title: 'Select Folder' });
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
// Restart just the backend sidecar (System Health → Launch backend) without a
// full app relaunch. Kills the current child, then re-spawns via startBackend().
ipcMain.handle('dwellium:restartBackend', async () => {
    try {
        const proc = backendProc; backendProc = null;
        if (proc) {
            try { proc.kill('SIGTERM'); } catch { /* */ }
            await new Promise((r) => setTimeout(r, 800));
            try { if (!proc.killed) proc.kill('SIGKILL'); } catch { /* */ }
        }
        startBackend();
        return true;
    } catch (err) {
        logBackend('restart failed: ' + (err && err.message));
        return false;
    }
});
// Synchronous read so the preload can inject window.__dwelliumWorkspaceRoot
// BEFORE the SPA's first render (the File Explorer header reads it synchronously).
ipcMain.on('dwellium:dataRootSync', (e) => { e.returnValue = DATA_ROOT; });

// ── BACKGROUND (botless, private) meeting capture via Recall.ai Desktop SDK ───
//
// What this is: a LOCAL, bot-free meeting recorder. Unlike the visible Meet-bot
// path (a Recall *bot* dials into the call), NOTHING joins the meeting here — the
// Recall Desktop SDK (`@recallai/desktop-sdk`) records this Mac's mic + system
// audio locally, transcribes in real time, and we forward each utterance to the
// backend. The other participants never see a bot in the room.
//
// Platform + signing constraints (HARD):
//   • Apple-Silicon Mac or Windows ONLY. The SDK's init() throws on any other
//     platform ("Platform <x> is not supported by Desktop SDK"). We surface that
//     as a structured { ok:false, reason } so the renderer can tell the user
//     "background mode needs the desktop app on Apple-Silicon Mac / Windows".
//   • The SDK ships a NATIVE helper binary (macOS: desktop_sdk_macos_exe; Windows:
//     agent-windows.exe) + bundled GStreamer. `npm install` MUST run on the Mac,
//     and the packaged .app MUST be code-signed with Recall's osx-sign fork
//     (mic / screen-capture / system-audio entitlements + hardened runtime) or
//     macOS silently denies capture. See electron/package.json dependency note.
//   • macOS permissions required at first run: Microphone, Screen Recording (for
//     system audio / video), and Accessibility (window detection). The SDK
//     exposes requestPermission('microphone'|'screen-capture'|'system-audio'|
//     'accessibility'|'full-disk-access'); the OS shows its own consent prompts.
//
// API coded against (verified from the published package @recallai/desktop-sdk
// @2.0.19 — index.js + index.d.ts — and https://docs.recall.ai/docs/desktop-sdk):
//   • init({ api_url?, apiUrl?, acquirePermissionsOnStartup?, ... }) → Promise
//   • requestPermission(permission) → Promise
//   • startRecording({ windowId, uploadToken }) → Promise   (config JSON-encoded
//     internally; the upload token is minted by the BACKEND from Recall's
//     "Create Desktop SDK Upload" API, which is also where the real-time
//     transcript provider + realtime_endpoints config lives — see TODO below)
//   • stopRecording({ windowId }) / pauseRecording / resumeRecording
//   • addEventListener(type, cb) / removeEventListener / removeAllEventListeners
//   • shutdown() → Promise
//   Event types (EventTypeToPayloadMap in index.d.ts): 'meeting-detected',
//   'recording-started', 'recording-ended', 'realtime-event', 'error',
//   'permission-status', 'shutdown', … The live transcript arrives on
//   'realtime-event' as { window, event, data }, where `event` is the sub-type
//   ('transcript.data' = finalized utterance, 'transcript.partial_data' = interim)
//   and `data` carries the Recall envelope → words[] + participant.
//
// NOTE / backend contract: minting the upload token requires a backend route
//   POST ${apiBase}/api/ara/meeting/desktop-token  → { uploadToken, recordingId? }
// that calls Recall's "Create Desktop SDK Upload" API server-side (keeps the
// Recall API key off the client) and sets recording_config.realtime_endpoints to
//   [{ type: 'desktop_sdk_callback', events: ['transcript.data','transcript.partial_data'] }]
// plus a transcript provider (e.g. assembly_ai_v3_streaming / deepgram). The
// SDK then delivers those events to THIS process via the 'realtime-event'
// listener. If that route is absent we still record locally but cannot start an
// upload (see HALT in the structured failure below). We forward each utterance to
// the agreed ingest:  POST ${apiBase}/api/ara/meeting/transcript
//   body { sessionId, speaker?, text, isFinal, tsMs, mode:'background' }.

let recallSdk = null;            // lazily-required module (native; absent in Linux build sandbox)
let meetingState = null;         // { sessionId, apiBase, windowId, listeners } while capturing

/** Lazy + guarded require so a missing native binary / unsupported platform never
 *  crashes app startup — only the start handler reports the failure. */
function loadRecallSdk() {
    if (recallSdk) return recallSdk;
    // eslint-disable-next-line global-require
    recallSdk = require('@recallai/desktop-sdk');
    return recallSdk.default || recallSdk;
}

/** POST one transcript utterance to the backend ingest. Fire-and-forget: a
 *  failed POST must never tear down an in-progress recording (matches the
 *  repo rule "backend failure never logs the user out"). */
function postTranscript(apiBase, body) {
    try {
        const u = new URL(`${apiBase}/api/ara/meeting/transcript`);
        const payload = Buffer.from(JSON.stringify(body), 'utf-8');
        const lib = u.protocol === 'https:' ? require('https') : http;
        const req = lib.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, 'X-Qualia-API': 'v2' },
        }, (r) => { r.resume(); }); // drain so the socket frees
        req.on('error', (e) => logBackend(`meeting transcript POST failed: ${e && e.message}`));
        req.write(payload);
        req.end();
    } catch (e) {
        logBackend(`meeting transcript POST threw: ${e && e.message}`);
    }
}

/** Pull the best speaker label + text + finality out of a 'realtime-event'.
 *  Defensive across envelope nesting: Recall wraps the provider payload, and the
 *  exact depth differs by provider, so we probe the documented locations and
 *  fall back gracefully. */
function parseRealtimeTranscript(evt) {
    // evt = { window, event: 'transcript.data' | 'transcript.partial_data', data }
    const isFinal = evt.event === 'transcript.data';
    // Recall envelope: words + participant typically at evt.data.data (one wrap),
    // occasionally one level deeper for some providers (evt.data.data.data.payload).
    const d = evt.data || {};
    const core = d.data?.data || d.data || d;
    const payload = core?.payload || core || {};
    const words = payload.words || core?.words || d.words || [];
    const participant = payload.participant || core?.participant || d.participant || {};
    let text = '';
    if (Array.isArray(words) && words.length) {
        text = words.map((w) => (w && (w.text ?? w.word)) || '').join(' ').replace(/\s+/g, ' ').trim();
    } else if (typeof payload.text === 'string') {
        text = payload.text.trim();
    } else if (typeof core?.text === 'string') {
        text = core.text.trim();
    }
    const speaker = participant.name || participant.id || undefined;
    return { text, speaker, isFinal };
}

ipcMain.handle('meeting:start-background', async (_e, args) => {
    const sessionId = args && args.sessionId;
    const apiBase = (args && args.apiBase) || `http://127.0.0.1:${FRONT_PORT}`;
    if (!sessionId) return { ok: false, reason: 'missing-session', message: 'A sessionId is required to start background capture.' };
    if (meetingState) return { ok: false, reason: 'already-recording', message: 'Background capture is already running.' };
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
        return { ok: false, reason: 'unsupported-platform', message: 'Background (botless) capture needs the desktop app on an Apple-Silicon Mac or Windows.' };
    }
    let sdk;
    try {
        sdk = loadRecallSdk();
    } catch (err) {
        // Native binary not packaged (e.g. installed in the Linux build sandbox,
        // or `npm install` not yet run on the Mac).
        return { ok: false, reason: 'sdk-unavailable', message: 'The Recall Desktop SDK native module is not installed. Run `npm install` in electron/ on the Mac and code-sign the build.', detail: String(err && err.message) };
    }
    try {
        // 1) Mint an upload token from the backend (keeps the Recall API key
        //    server-side and is where the real-time transcript config lives).
        let uploadToken = null;
        try {
            uploadToken = await fetchUploadToken(apiBase, sessionId);
        } catch (tokenErr) {
            logBackend(`meeting desktop-token fetch failed: ${tokenErr && tokenErr.message}`);
        }
        if (!uploadToken) {
            // HALT: cannot start a Recall upload without a token. Tell the UI
            // exactly what's missing so the backend agent can add the route.
            return {
                ok: false,
                reason: 'no-upload-token',
                message: 'Background capture needs a Recall upload token. The backend must expose POST /api/ara/meeting/desktop-token (calls Recall’s "Create Desktop SDK Upload" with realtime_endpoints desktop_sdk_callback + transcript.data/partial_data).',
            };
        }

        // 2) Init the SDK and proactively request capture permissions. The OS
        //    shows its own consent dialogs; we don't block on the result.
        await sdk.init({ acquirePermissionsOnStartup: ['microphone', 'screen-capture', 'system-audio', 'accessibility'] });
        for (const p of ['microphone', 'screen-capture', 'system-audio', 'accessibility']) {
            try { await sdk.requestPermission(p); } catch { /* OS will surface the prompt; non-fatal */ }
        }

        // 3) Wire listeners. The transcript rides on 'realtime-event'; we also
        //    log lifecycle + errors. Keep handles so the stop handler can detach.
        const onRealtime = (evt) => {
            try {
                if (!evt || (evt.event !== 'transcript.data' && evt.event !== 'transcript.partial_data')) return;
                const { text, speaker, isFinal } = parseRealtimeTranscript(evt);
                if (!text) return;
                postTranscript(apiBase, { sessionId, speaker, text, isFinal, tsMs: Date.now(), mode: 'background' });
            } catch (e) {
                logBackend(`meeting realtime-event handler error: ${e && e.message}`);
            }
        };
        const onRecordingStarted = (evt) => logBackend(`meeting recording-started: ${evt && evt.window && evt.window.id}`);
        const onRecordingEnded = (evt) => logBackend(`meeting recording-ended: ${evt && evt.window && evt.window.id}`);
        const onError = (evt) => logBackend(`meeting SDK error: ${evt && evt.type} ${evt && evt.message}`);
        sdk.addEventListener('realtime-event', onRealtime);
        sdk.addEventListener('recording-started', onRecordingStarted);
        sdk.addEventListener('recording-ended', onRecordingEnded);
        sdk.addEventListener('error', onError);

        // 4) Start recording. The Desktop SDK supports recording a detected
        //    meeting window OR a desktop-audio session. For botless background
        //    capture of the local machine we use the desktop-audio path when no
        //    specific meeting window is supplied; `prepareDesktopAudioRecording`
        //    returns a synthetic windowId that startRecording then drives.
        let windowId = (args && args.windowId) || null;
        if (!windowId && typeof sdk.prepareDesktopAudioRecording === 'function') {
            try { windowId = await sdk.prepareDesktopAudioRecording({}); } catch (e) { logBackend(`prepareDesktopAudioRecording failed: ${e && e.message}`); }
        }
        await sdk.startRecording({ windowId: windowId || undefined, uploadToken });

        meetingState = {
            sessionId, apiBase, windowId,
            listeners: { onRealtime, onRecordingStarted, onRecordingEnded, onError },
        };
        logBackend(`meeting background capture started (session ${sessionId})`);
        return { ok: true, sessionId, windowId };
    } catch (err) {
        logBackend(`meeting start-background failed: ${err && err.message}`);
        // Best-effort cleanup of any half-wired SDK state.
        try { recallSdk && (recallSdk.default || recallSdk).removeAllEventListeners(); } catch { /* */ }
        try { await (recallSdk && (recallSdk.default || recallSdk).shutdown()); } catch { /* */ }
        meetingState = null;
        return { ok: false, reason: 'start-failed', message: 'Failed to start background capture.', detail: String(err && err.message) };
    }
});

ipcMain.handle('meeting:stop-background', async () => {
    if (!meetingState) return { ok: true, stopped: false };
    const sdk = recallSdk && (recallSdk.default || recallSdk);
    const { windowId, listeners } = meetingState;
    try {
        if (sdk) {
            try { if (windowId) await sdk.stopRecording({ windowId }); } catch (e) { logBackend(`meeting stopRecording failed: ${e && e.message}`); }
            try {
                sdk.removeEventListener('realtime-event', listeners.onRealtime);
                sdk.removeEventListener('recording-started', listeners.onRecordingStarted);
                sdk.removeEventListener('recording-ended', listeners.onRecordingEnded);
                sdk.removeEventListener('error', listeners.onError);
            } catch { /* */ }
            try { await sdk.shutdown(); } catch (e) { logBackend(`meeting SDK shutdown failed: ${e && e.message}`); }
        }
        logBackend('meeting background capture stopped');
        return { ok: true, stopped: true };
    } catch (err) {
        logBackend(`meeting stop-background failed: ${err && err.message}`);
        return { ok: false, reason: 'stop-failed', message: 'Failed to cleanly stop background capture.', detail: String(err && err.message) };
    } finally {
        meetingState = null;
    }
});

/** Ask the backend to mint a Recall Desktop SDK upload token for this session.
 *  Expected route (backend agent owns it):
 *    POST ${apiBase}/api/ara/meeting/desktop-token  body { sessionId }
 *    → { uploadToken: string, recordingId?: string }
 *  Returns the token string, or null when the route is absent / errors. */
function fetchUploadToken(apiBase, sessionId) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(`${apiBase}/api/ara/meeting/desktop-token`); } catch (e) { return reject(e); }
        const payload = Buffer.from(JSON.stringify({ sessionId }), 'utf-8');
        const lib = u.protocol === 'https:' ? require('https') : http;
        const req = lib.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, 'X-Qualia-API': 'v2' },
        }, (r) => {
            let buf = '';
            r.setEncoding('utf-8');
            r.on('data', (c) => { buf += c; });
            r.on('end', () => {
                if (!r.statusCode || r.statusCode >= 400) return resolve(null); // route absent / not implemented
                try {
                    const j = JSON.parse(buf || '{}');
                    resolve(j.uploadToken || j.upload_token || (j.data && (j.data.uploadToken || j.data.upload_token)) || null);
                } catch { resolve(null); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

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
