/**
 * Plan 055 phase 4 — ARA resume context (pure derivation + prompt).
 *
 * Covers: derivation from seeded sessionRestore (top-z Classic window wins),
 * Holocron/Fluid active-tab fallback, Scribe doc basename from widgetMemory,
 * null when nothing is restored, the exact starter prompt text, and the DATA
 * BOUNDARY — only the basename ever appears, never the full path or contents.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(null),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

import { sessionRestoreStore, type SessionSnapshot, type WindowProjection } from '../lib/sessionRestoreStore';
import { patchWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';
import {
    deriveResumeContext,
    buildResumePrompt,
    RESUME_STARTER_LABEL,
    isResumeChipDismissed,
    dismissResumeChip,
    resetResumeChip,
} from '../components/ARAConsole/araResumeContext';

const GUEST_KEY = 'dwellium_session_restore_guest';

const win = (over: Partial<WindowProjection> = {}): WindowProjection => ({
    component: 'scribe',
    title: 'Scribe',
    icon: 'pen-line',
    x: 0, y: 0, width: 800, height: 600,
    zIndex: 1,
    minimized: false,
    groupId: null,
    ...over,
});

function seedSession(over: Partial<SessionSnapshot> = {}): void {
    const snap: SessionSnapshot = {
        version: 1,
        classic: [],
        halocron: { tabs: [], active: null },
        fluid: { tabs: [], active: null },
        savedAt: Date.now(),
        ...over,
    };
    localStorage.setItem(GUEST_KEY, JSON.stringify(snap));
    sessionRestoreStore.reset();
}

beforeEach(() => {
    localStorage.clear();
    sessionRestoreStore.reset();
    resetWidgetMemory();
    resetResumeChip();
});

describe('deriveResumeContext', () => {
    it('is null when nothing is restored (fresh account / default stack)', () => {
        expect(deriveResumeContext()).toBeNull();
        seedSession(); // empty snapshot: no windows, no tabs
        expect(deriveResumeContext()).toBeNull();
    });

    it('picks the top-z Classic window and the active Scribe doc basename', () => {
        seedSession({
            classic: [
                win({ component: 'notepad', title: 'Notepad', zIndex: 3 }),
                win({ component: 'scribe', title: 'Scribe', zIndex: 9 }),
            ],
        });
        patchWidgetMemory('scribe', { activeFilepath: '/docs/leases/WoodlandLease.md' });
        expect(deriveResumeContext()).toEqual({
            widgetId: 'scribe',
            widgetLabel: 'Scribe',
            docBasename: 'WoodlandLease.md',
        });
    });

    it('non-Scribe top window has no docBasename', () => {
        seedSession({ classic: [win({ component: 'notepad', title: 'Notepad', zIndex: 5 })] });
        const ctx = deriveResumeContext();
        expect(ctx?.widgetId).toBe('notepad');
        expect(ctx?.docBasename).toBeUndefined();
    });

    it('falls back to the active Holocron tab when Classic is empty', () => {
        seedSession({ halocron: { tabs: ['scribe', 'notepad'], active: 'scribe' } });
        expect(deriveResumeContext()?.widgetLabel).toBe('Scribe');
    });
});

describe('buildResumePrompt', () => {
    it('produces the exact grounded prompt with doc + widget', () => {
        expect(buildResumePrompt({ widgetId: 'scribe', widgetLabel: 'Scribe', docBasename: 'WoodlandLease.md' }))
            .toBe('I was last working on WoodlandLease.md in Scribe. Give me a quick re-orientation: what this document is, and suggest the next 2–3 concrete actions to continue.');
    });

    it('produces the widget-only prompt when there is no doc', () => {
        expect(buildResumePrompt({ widgetId: 'notepad', widgetLabel: 'Notepad' }))
            .toBe('I was last working in Notepad. Give me a quick re-orientation: what I was doing there, and suggest the next 2–3 concrete actions to continue.');
    });

    it('BOUNDARY: the prompt carries the basename only — never the path or contents', () => {
        const longPath = '/Users/andy/Dwellium/private/portfolios/riverwood/leases/2026/WoodlandLease.md';
        seedSession({ classic: [win({ zIndex: 1 })] });
        patchWidgetMemory('scribe', {
            activeFilepath: longPath,
            // A content-shaped slice must never leak into the prompt either.
            fileView: { [longPath]: { scrollTop: 42, cursor: 7 } },
        });
        const ctx = deriveResumeContext()!;
        const prompt = buildResumePrompt(ctx);
        expect(ctx.docBasename).toBe('WoodlandLease.md');
        expect(prompt).toContain('WoodlandLease.md');
        expect(prompt).not.toContain('/Users/andy');
        expect(prompt).not.toContain('riverwood');
        expect(prompt).not.toContain('42');
    });
});

describe('resume chip dismissal (session-scoped)', () => {
    it('persists dismissal until reset', () => {
        expect(isResumeChipDismissed()).toBe(false);
        dismissResumeChip();
        expect(isResumeChipDismissed()).toBe(true);
        resetResumeChip();
        expect(isResumeChipDismissed()).toBe(false);
    });
});

describe('starter label', () => {
    it('is the plan-055 phrase', () => {
        expect(RESUME_STARTER_LABEL).toBe('Pick up where I left off');
    });
});
