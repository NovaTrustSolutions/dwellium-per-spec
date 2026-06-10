/**
 * serviceLaunch — one-click launch for the external services Dwellium can host
 * (LangFlow, Paperclip, Open Notebook) and the Dwellium backend itself.
 *
 * External services run their start command in the in-app Terminal. The backend
 * is adaptive: in the packaged Electron app it's restarted via IPC (the app
 * spawns the backend as a child); in dev/web the in-app Terminal can't boot the
 * very backend it talks through, so we copy the start command + drop it into the
 * Terminal for the user to run in their own shell.
 */

import { launchInTerminal } from './terminalLaunch';

export type ServiceId = 'langflow' | 'paperclip' | 'open-notebook';

/** Start commands (mirrors the setup snippets in each service panel). */
export const SERVICE_COMMANDS: Record<ServiceId, string> = {
    langflow: 'uv tool install langflow && langflow run',
    paperclip: 'npx paperclipai onboard --yes',
    'open-notebook': 'docker run -d -p 8502:8502 -p 5055:5055 lfnovo/open_notebook:v1-latest',
};

export const SERVICE_LABELS: Record<ServiceId, string> = {
    langflow: 'LangFlow',
    paperclip: 'Paperclip',
    'open-notebook': 'Open Notebook',
};

/** Dev command to start the Dwellium backend (sibling repo). Editable in the Terminal. */
export const BACKEND_START_CMD = 'cd ~/dwellium-backend/ai-dashboard369-file-manager && AUTH_ENABLED=false npm run dev';

/** Run a service's start command in the Terminal. */
export function launchService(id: ServiceId): void {
    launchInTerminal({ command: SERVICE_COMMANDS[id], tab: 'terminal', run: true });
}

interface ElectronApi {
    isElectron?: boolean;
    restartBackend?: () => Promise<boolean>;
    relaunch?: () => Promise<void>;
}

function electron(): ElectronApi | null {
    try {
        return (window as unknown as { electronAPI?: ElectronApi }).electronAPI ?? null;
    } catch {
        return null;
    }
}

/** True when running inside the packaged Electron app. */
export function isElectron(): boolean {
    return !!electron()?.isElectron;
}

export type BackendLaunchOutcome = 'electron-restart' | 'electron-relaunch' | 'dev-terminal';

export interface BackendLaunchResult {
    outcome: BackendLaunchOutcome;
    message: string;
}

/**
 * Adaptive backend launch. Electron → restart the bundled sidecar via IPC (or
 * fall back to a relaunch hint on older builds). Dev/web → copy the start
 * command and drop it into the Terminal for the user to run.
 */
export async function launchBackend(): Promise<BackendLaunchResult> {
    const api = electron();
    if (api?.isElectron && typeof api.restartBackend === 'function') {
        try { await api.restartBackend(); } catch { /* surfaced as a retry by the health re-check */ }
        return { outcome: 'electron-restart', message: 'Restarting the bundled backend…' };
    }
    if (api?.isElectron && typeof api.relaunch === 'function') {
        return { outcome: 'electron-relaunch', message: 'This build restarts the backend on app relaunch (Settings → Relaunch).' };
    }
    // Dev/web: the in-app Terminal runs THROUGH the backend, so it can't start it.
    try { await navigator.clipboard.writeText(BACKEND_START_CMD); } catch { /* clipboard blocked */ }
    launchInTerminal({ command: BACKEND_START_CMD, tab: 'terminal', run: false });
    return { outcome: 'dev-terminal', message: 'Start command copied + opened in the Terminal — run it in your own shell.' };
}
