/**
 * Dwellium Installer — preload bridge. Exposes a minimal, safe API to the
 * renderer (contextIsolation on, nodeIntegration off).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wizard', {
    checkPrereqs: () => ipcRenderer.invoke('prereqs:check'),
    pickFolder: () => ipcRenderer.invoke('pick:folder'),
    pickFile: () => ipcRenderer.invoke('pick:file'),
    detectRepo: () => ipcRenderer.invoke('detect:repo'),
    locateBackend: () => ipcRenderer.invoke('backend:locate'),
    runStep: (id, env) => ipcRenderer.invoke('step:run', { id, env }),
    openApp: (url) => ipcRenderer.invoke('app:open', url),
    onLog: (cb) => {
        const handler = (_e, data) => cb(data);
        ipcRenderer.on('step:log', handler);
        return () => ipcRenderer.removeListener('step:log', handler);
    },
});
