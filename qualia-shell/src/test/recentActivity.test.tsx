/**
 * Plan 055 phase 3 — recentActivityStore + the ⌘K "Resume" group.
 *
 * Store: record / dedupe-by-(kind,id) / cap 20 / Andy ≠ Lisa. Palette: the
 * Resume section renders at the top with the last 5 touches; Enter opens the
 * widget, and a scribe-doc row sets the scribe widgetMemory activeFilepath
 * (+ open list) before opening so Scribe lands on that doc.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { defaultDockItems } from '../data/hierarchy';

vi.mock('../config', () => ({ API_BASE: '' }));
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(null),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

const openWindow = vi.fn();
const focusWindow = vi.fn();
const restoreWindow = vi.fn();
vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({
        dockItems: defaultDockItems,
        windows: [],
        openWindow,
        focusWindow,
        restoreWindow,
    }),
}));

import CommandPalette from '../components/CommandPalette/CommandPalette';
import { recentActivityStore, recordActivity, readRecentActivity } from '../lib/recentActivityStore';
import { readWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';
import { SCRIBE_MEM_DEFAULTS } from '../components/Scribe/scribeMemory';
import { setPerUserIdentity } from '../lib/perUserIdentity';

beforeEach(() => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    recentActivityStore.reset();
    resetWidgetMemory();
    setPerUserIdentity(null);
    openWindow.mockClear();
    focusWindow.mockClear();
    restoreWindow.mockClear();
});

describe('recentActivityStore', () => {
    it('records newest-first and dedupes by (kind, id) with move-to-front', () => {
        recordActivity('widget', 'scribe', 'Scribe');
        recordActivity('widget', 'notepad', 'Notepad');
        recordActivity('widget', 'scribe', 'Scribe'); // touch again → front, no dupe
        const list = readRecentActivity(10);
        expect(list.map(e => e.id)).toEqual(['scribe', 'notepad']);
    });

    it('same id under different kinds stays distinct', () => {
        recordActivity('widget', 'scribe', 'Scribe');
        recordActivity('scribe-doc', 'scribe', 'scribe');
        expect(readRecentActivity(10)).toHaveLength(2);
    });

    it('caps at 20 entries', () => {
        for (let i = 0; i < 30; i++) recordActivity('widget', `w-${i}`, `W${i}`);
        const all = recentActivityStore.getSnapshot();
        expect(all).toHaveLength(20);
        expect(all[0].id).toBe('w-29');
    });

    it('Andy ≠ Lisa — trails are per-user namespaces', () => {
        setPerUserIdentity('andy');
        recordActivity('widget', 'scribe', 'Scribe');
        expect(readRecentActivity(5)).toHaveLength(1);
        setPerUserIdentity('lisa');
        expect(readRecentActivity(5)).toHaveLength(0);
        recordActivity('widget', 'notepad', 'Notepad');
        setPerUserIdentity('andy');
        expect(readRecentActivity(5).map(e => e.id)).toEqual(['scribe']);
    });

    it('the dwellium:open-widget bus records a widget touch (central listener)', () => {
        window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: 'notepad', label: 'Notepad' } }));
        expect(readRecentActivity(5).map(e => e.id)).toEqual(['notepad']);
    });
});

describe('⌘K Resume group', () => {
    const openPalette = async () => {
        render(<CommandPalette />);
        await act(async () => { fireEvent.keyDown(window, { key: 'k', metaKey: true }); });
    };

    it('renders the last touches as the FIRST section, capped at 5', async () => {
        for (const id of ['scribe', 'notepad', 'inbox', 'task-board', 'strata-dashboard', 'whiteboard']) {
            recordActivity('widget', id, id);
        }
        recordActivity('scribe-doc', 'leases/WoodlandLease.md', 'WoodlandLease.md');
        await openPalette();
        const firstSection = document.querySelector('.command-palette__section');
        expect(firstSection?.querySelector('.command-palette__section-title')?.textContent).toBe('Resume');
        const rows = firstSection!.querySelectorAll('.command-palette__result');
        expect(rows).toHaveLength(5);
        expect(rows[0].textContent).toContain('Resume: Scribe — WoodlandLease.md');
    });

    it('no activity → no Resume section', async () => {
        await openPalette();
        const titles = Array.from(document.querySelectorAll('.command-palette__section-title')).map(t => t.textContent);
        expect(titles).not.toContain('Resume');
    });

    it('Enter on a widget row opens the widget', async () => {
        recordActivity('widget', 'notepad', 'Notepad');
        await openPalette();
        const input = document.querySelector('.command-palette__input')!;
        await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
        expect(openWindow).toHaveBeenCalledWith('notepad', 'Notepad', expect.any(String));
    });

    it('Enter on a scribe-doc row sets scribe widgetMemory activeFilepath + open list, then opens Scribe', async () => {
        recordActivity('scribe-doc', 'leases/WoodlandLease.md', 'WoodlandLease.md');
        await openPalette();
        const input = document.querySelector('.command-palette__input')!;
        await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
        const mem = readWidgetMemory('scribe', SCRIBE_MEM_DEFAULTS);
        expect(mem.activeFilepath).toBe('leases/WoodlandLease.md');
        expect(mem.openFilepaths).toContain('leases/WoodlandLease.md');
        expect(openWindow).toHaveBeenCalledWith('scribe', 'Scribe', 'pen-tool');
    });
});
