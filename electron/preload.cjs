/**
 * Dwellium Desktop — preload bridge.
 *
 * Exposes a minimal, safe `window.electronAPI` (contextIsolation on) for the
 * native actions the web build can't do — Show-in-Finder (spec §4.3 #17),
 * choose-data-folder, open-data-folder — and injects
 * `window.__dwelliumWorkspaceRoot` synchronously so the File Explorer header
 * (spec §2.4) shows the real on-disk root from the first render.
 */
const { contextBridge, ipcRenderer } = require('electron');

// Synchronous data-root read → inject the workspace root before page scripts run.
let dataRoot = '';
try { dataRoot = ipcRenderer.sendSync('dwellium:dataRootSync') || ''; } catch { /* */ }
contextBridge.exposeInMainWorld('__dwelliumWorkspaceRoot', dataRoot ? `${dataRoot}/files` : undefined);

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    /** Reveal a path in Finder (spec §4.3 Show-in-Finder). */
    showItemInFolder: (fullPath) => ipcRenderer.invoke('dwellium:showItemInFolder', fullPath),
    /** Prompt for a data folder (e.g. on a passport drive); returns the chosen path or null. */
    chooseDataRoot: () => ipcRenderer.invoke('dwellium:chooseDataRoot'),
    chooseDirectory: () => ipcRenderer.invoke('dwellium:chooseDirectory'),
    /** The active data root (where files/notes live). */
    dataRoot: () => ipcRenderer.invoke('dwellium:dataRoot'),
    /** Persist a new data root (Settings → Data Folder); applies on relaunch. */
    setDataRoot: (p) => ipcRenderer.invoke('dwellium:setDataRoot', p),
    /** Relaunch the app (to apply a new data folder). */
    relaunch: () => ipcRenderer.invoke('dwellium:relaunch'),
    /** Restart just the backend sidecar (System Health → Launch backend). */
    restartBackend: () => ipcRenderer.invoke('dwellium:restartBackend'),

    // ── BACKGROUND (botless, private) meeting capture — Recall.ai Desktop SDK ──
    // Records this Mac locally (mic + system audio) with NO bot joining the call,
    // and forwards a live transcript to the backend. Apple-Silicon Mac / Windows
    // only (the desktop app); both resolve to a structured { ok, reason? } so the
    // UI can show "background mode needs the desktop app" when unsupported.
    /** Start background capture. args: { sessionId, apiBase, windowId? }.
     *  Resolves { ok:true, sessionId, windowId } or { ok:false, reason, message }. */
    startBackgroundMeeting: (args) => ipcRenderer.invoke('meeting:start-background', args),
    /** Stop background capture + tear the SDK down. Resolves { ok, stopped }. */
    stopBackgroundMeeting: () => ipcRenderer.invoke('meeting:stop-background'),
});
