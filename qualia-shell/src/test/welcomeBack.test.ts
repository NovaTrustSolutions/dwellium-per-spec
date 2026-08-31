/**
 * Plan 055 phase 3 — welcome-back toast.
 *
 * The restore paths accumulate a RestoreSummary in sessionRestoreStore;
 * `fireWelcomeBackToast()` consumes it once and fires the string-only
 * `qualia-toast` bus. Fresh login (no restore) → no toast.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getLastRestoreSummary,
    consumeRestoreSummary,
    resetRestoreSummary,
    restoreClassicWindows,
    restoreOsTabs,
    type SessionSnapshot,
} from '../lib/sessionRestoreStore';
import { buildWelcomeBackMessage, pickRestoreLabel, fireWelcomeBackToast } from '../lib/welcomeBack';
import { patchWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';
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

const snap = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
    version: 1,
    classic: [],
    halocron: { tabs: [], active: null },
    fluid: { tabs: [], active: null },
    savedAt: 1,
    ...over,
});

const win = (component: string, title: string, zIndex: number) => ({
    component, title, icon: '', x: 0, y: 0, width: 400, height: 300, zIndex, minimized: false, groupId: null,
});

beforeEach(() => {
    localStorage.clear();
    resetRestoreSummary();
    resetWidgetMemory();
    setPerUserIdentity(null);
});

describe('restore summary accumulation', () => {
    it('restoreClassicWindows records count + top-z title + components', () => {
        restoreClassicWindows(snap({ classic: [win('notepad', 'Notepad', 3), win('scribe', 'Scribe', 9)] }));
        const s = getLastRestoreSummary();
        expect(s).toEqual({ windows: 2, tabs: 0, topTitle: 'Scribe', components: ['notepad', 'scribe'] });
    });

    it('restoreOsTabs accumulates tab counts across halocron + fluid', () => {
        restoreOsTabs({ tabs: ['notepad'], active: 'notepad' }, 'halocron');
        restoreOsTabs({ tabs: ['scribe', 'inbox'], active: null }, 'fluid');
        const s = getLastRestoreSummary();
        expect(s?.tabs).toBe(3);
        expect(s?.components).toEqual(['notepad', 'scribe', 'inbox']);
    });

    it('re-running a restore path replaces its slot — counts stay truthful (the "Restored 16 windows" bug)', () => {
        const s2 = snap({ classic: [win('notepad', 'Notepad', 3), win('scribe', 'Scribe', 9)] });
        // StrictMode double-invoke + provider remounts re-run the same restore.
        for (let i = 0; i < 8; i++) restoreClassicWindows(s2);
        restoreOsTabs({ tabs: ['inbox'], active: null }, 'halocron');
        restoreOsTabs({ tabs: ['inbox'], active: null }, 'halocron');
        const s = getLastRestoreSummary();
        expect(s?.windows).toBe(2);
        expect(s?.tabs).toBe(1);
        expect(buildWelcomeBackMessage(s!, null)).toContain('Restored 2 windows');
    });

    it('nothing restored → summary stays null', () => {
        restoreClassicWindows(snap());
        restoreOsTabs({ tabs: [], active: null });
        expect(getLastRestoreSummary()).toBeNull();
    });

    it('consumeRestoreSummary is once-only', () => {
        restoreOsTabs({ tabs: ['notepad'], active: null });
        expect(consumeRestoreSummary()).not.toBeNull();
        expect(consumeRestoreSummary()).toBeNull();
    });
});

describe('welcome-back message', () => {
    it('names the top-z restored window', () => {
        restoreClassicWindows(snap({ classic: [win('notepad', 'Notepad', 3), win('strata-dashboard', 'Strata Dashboard', 9)] }));
        const msg = buildWelcomeBackMessage(getLastRestoreSummary()!, null);
        expect(msg).toContain('Restored 2 windows');
        expect(msg).toContain('Strata Dashboard');
        expect(msg).toContain('⌘K → Fresh start');
    });

    it('prefers the Scribe active file basename when a scribe window was restored', () => {
        restoreClassicWindows(snap({ classic: [win('scribe', 'Scribe', 5)] }));
        expect(pickRestoreLabel(getLastRestoreSummary()!, 'leases/WoodlandLease.md')).toBe('WoodlandLease.md');
        const msg = buildWelcomeBackMessage(getLastRestoreSummary()!, 'leases/WoodlandLease.md');
        expect(msg).toContain('WoodlandLease.md');
    });

    it('does NOT use the scribe file when scribe was not restored', () => {
        restoreClassicWindows(snap({ classic: [win('notepad', 'Notepad', 5)] }));
        expect(pickRestoreLabel(getLastRestoreSummary()!, 'a/b.md')).toBe('Notepad');
    });

    it('tab-only restores read "N tabs"', () => {
        restoreOsTabs({ tabs: ['notepad'], active: null });
        expect(buildWelcomeBackMessage(getLastRestoreSummary()!, null)).toContain('Restored 1 tab');
    });
});

describe('fireWelcomeBackToast', () => {
    it('seeded restore → one qualia-toast; second call is silent', () => {
        const spy = vi.fn();
        window.addEventListener('qualia-toast', spy);
        restoreClassicWindows(snap({ classic: [win('scribe', 'Scribe', 5)] }));
        patchWidgetMemory('scribe', { activeFilepath: 'docs/Lease.md' });
        fireWelcomeBackToast();
        expect(spy).toHaveBeenCalledTimes(1);
        const detail = (spy.mock.calls[0][0] as CustomEvent).detail as string;
        expect(detail).toContain('Lease.md');
        fireWelcomeBackToast(); // consumed — quiet
        expect(spy).toHaveBeenCalledTimes(1);
        window.removeEventListener('qualia-toast', spy);
    });

    it('fresh login (no restore) → no toast', () => {
        const spy = vi.fn();
        window.addEventListener('qualia-toast', spy);
        fireWelcomeBackToast();
        expect(spy).not.toHaveBeenCalled();
        window.removeEventListener('qualia-toast', spy);
    });
});
