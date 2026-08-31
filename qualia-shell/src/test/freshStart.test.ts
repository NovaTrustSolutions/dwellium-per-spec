/**
 * Plan 055 phase 3 — Fresh start (the welcome-back toast's escape hatch).
 *
 * `clearSessionForFreshStart` forgets ONLY the session projection (what was
 * open) — widgetMemory and data stores are untouched; the ⌘K command routes
 * through the `dwellium:fresh-start` event Desktop handles.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    sessionRestoreStore,
    captureSession,
    flushSession,
    readSessionSnapshot,
    clearSessionForFreshStart,
    getLastRestoreSummary,
    resetRestoreSummary,
    restoreOsTabs,
} from '../lib/sessionRestoreStore';
import { patchWidgetMemory, readWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';
import { shouldOpenDefaultStack } from '../components/Shell/defaultStack';
import { parseCommand } from '../lib/dwelliumCommands';
import { setPerUserIdentity } from '../lib/perUserIdentity';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(null),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

beforeEach(() => {
    setPerUserIdentity('__scrub__');
    flushSession();
    localStorage.clear();
    sessionRestoreStore.reset();
    resetRestoreSummary();
    resetWidgetMemory();
    setPerUserIdentity(null);
});

describe('clearSessionForFreshStart', () => {
    it('clears the persisted projection (snapshot + localStorage key)', () => {
        captureSession({ halocron: { tabs: ['notepad'], active: 'notepad' } });
        flushSession();
        expect(readSessionSnapshot()).not.toBeNull();
        clearSessionForFreshStart();
        expect(readSessionSnapshot()).toBeNull();
        expect(localStorage.getItem('dwellium_session_restore_guest')).toBeNull();
    });

    it('drops a pending (unflushed) capture so it cannot resurrect the session', () => {
        captureSession({ classic: [] }); // pending, not yet flushed
        clearSessionForFreshStart();
        flushSession(); // pending was dropped — nothing to write
        expect(readSessionSnapshot()).toBeNull();
    });

    it('after a fresh start the default-stack predicate treats the user as having no session', () => {
        captureSession({ fluid: { tabs: ['notepad'], active: null } });
        flushSession();
        expect(shouldOpenDefaultStack(null, 0, readSessionSnapshot() !== null)).toBe(false);
        clearSessionForFreshStart();
        expect(shouldOpenDefaultStack(null, 0, readSessionSnapshot() !== null)).toBe(true);
    });

    it('clears any pending restore summary (no stale welcome-back toast)', () => {
        restoreOsTabs({ tabs: ['notepad'], active: null });
        expect(getLastRestoreSummary()).not.toBeNull();
        clearSessionForFreshStart();
        expect(getLastRestoreSummary()).toBeNull();
    });

    it('never touches widgetMemory', () => {
        patchWidgetMemory('scribe', { activeFilepath: 'a/b.md' });
        clearSessionForFreshStart();
        expect(readWidgetMemory('scribe', { activeFilepath: null as string | null }).activeFilepath).toBe('a/b.md');
    });
});

describe('⌘K "Fresh start" command', () => {
    it.each(['fresh start', 'fresh', 'clean desk', 'start fresh'])('parses %j', (q) => {
        const cmd = parseCommand(q);
        expect(cmd?.label).toContain('Fresh start');
    });

    it('running it fires dwellium:fresh-start', () => {
        const spy = vi.fn();
        window.addEventListener('dwellium:fresh-start', spy);
        parseCommand('fresh start')!.run();
        expect(spy).toHaveBeenCalledTimes(1);
        window.removeEventListener('dwellium:fresh-start', spy);
    });
});
