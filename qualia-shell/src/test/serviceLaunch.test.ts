/**
 * serviceLaunch / terminalLaunch — the Launch-button bridge: queues a command
 * for the Terminal, and routes the backend launch adaptively (Electron IPC
 * restart vs dev copy-into-Terminal).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { launchService, launchBackend, SERVICE_COMMANDS, BACKEND_START_CMD } from '../lib/serviceLaunch';
import { consumePendingTerminalRun } from '../lib/terminalLaunch';

beforeEach(() => {
    consumePendingTerminalRun(); // drain any leftover
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('launchService', () => {
    it('queues the service start command for the Terminal and opens it', () => {
        const opened: string[] = [];
        const onOpen = (e: Event) => opened.push((e as CustomEvent).detail?.widgetId);
        window.addEventListener('dwellium:open-widget', onOpen);
        launchService('paperclip');
        window.removeEventListener('dwellium:open-widget', onOpen);

        expect(opened).toContain('terminal');
        const pending = consumePendingTerminalRun();
        expect(pending?.command).toBe(SERVICE_COMMANDS.paperclip);
        expect(pending?.tab).toBe('terminal');
        expect(pending?.run).toBe(true);
    });

    it('uses the right command per service', () => {
        launchService('langflow');
        expect(consumePendingTerminalRun()?.command).toBe(SERVICE_COMMANDS.langflow);
        launchService('open-notebook');
        expect(consumePendingTerminalRun()?.command).toContain('lfnovo/open_notebook');
    });
});

describe('launchBackend (adaptive)', () => {
    it('restarts via Electron IPC when available', async () => {
        const restartBackend = vi.fn().mockResolvedValue(true);
        (window as unknown as { electronAPI?: unknown }).electronAPI = { isElectron: true, restartBackend };
        const r = await launchBackend();
        expect(restartBackend).toHaveBeenCalledOnce();
        expect(r.outcome).toBe('electron-restart');
    });

    it('falls back to relaunch hint on an Electron build without restartBackend', async () => {
        (window as unknown as { electronAPI?: unknown }).electronAPI = { isElectron: true, relaunch: vi.fn() };
        const r = await launchBackend();
        expect(r.outcome).toBe('electron-relaunch');
    });

    it('in dev/web, drops the start command into the Terminal', async () => {
        const r = await launchBackend();
        expect(r.outcome).toBe('dev-terminal');
        const pending = consumePendingTerminalRun();
        expect(pending?.command).toBe(BACKEND_START_CMD);
        expect(pending?.run).toBe(false); // pre-fill only — the Terminal can't boot its own backend
    });
});
