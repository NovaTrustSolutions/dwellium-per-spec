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
    /** The active data root (where files/notes live). */
    dataRoot: () => ipcRenderer.invoke('dwellium:dataRoot'),
    /** Persist a new data root (Settings → Data Folder); applies on relaunch. */
    setDataRoot: (p) => ipcRenderer.invoke('dwellium:setDataRoot', p),
    /** Relaunch the app (to apply a new data folder). */
    relaunch: () => ipcRenderer.invoke('dwellium:relaunch'),
    /** Restart just the backend sidecar (System Health → Launch backend). */
    restartBackend: () => ipcRenderer.invoke('dwellium:restartBackend'),
});
