/**
 * widgetMemory (plan 055 phase 2) — the resume-point primitive.
 *
 * Round-trip, per-user isolation (Andy ≠ Lisa), corrupt-slice isolation,
 * debounced localStorage write + flush, and reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    flushWidgetMemory,
    patchWidgetMemory,
    readWidgetMemory,
    resetWidgetMemory,
    widgetMemoryStore,
    widgetMemoryUserIdHolder,
} from '../lib/widgetMemory';

beforeEach(() => {
    localStorage.clear();
    widgetMemoryUserIdHolder.current = null;
    resetWidgetMemory(); // v2.72.1 standing convention
});

afterEach(() => {
    vi.useRealTimers();
});

describe('round-trip', () => {
    it('patches merge into a widget slice and read back over defaults', () => {
        patchWidgetMemory('scribe', { activeFile: '/leases/woodland.md' });
        patchWidgetMemory('scribe', { scrollTop: 420 });
        const mem = readWidgetMemory('scribe', { activeFile: null as string | null, scrollTop: 0, zoom: 1 });
        expect(mem.activeFile).toBe('/leases/woodland.md');
        expect(mem.scrollTop).toBe(420);
        expect(mem.zoom).toBe(1); // untouched default survives
    });

    it('persisted value survives a cache reset (localStorage round-trip)', () => {
        patchWidgetMemory('inbox-zero', { folder: 'archive', messageId: 'm-7' });
        flushWidgetMemory();
        widgetMemoryStore.reset(); // simulate fresh session: cache dropped, storage kept
        expect(readWidgetMemory('inbox-zero', { folder: 'inbox', messageId: null as string | null }))
            .toEqual({ folder: 'archive', messageId: 'm-7' });
    });
});

describe('per-user isolation', () => {
    it('Andy and Lisa never see each other’s memory', () => {
        widgetMemoryUserIdHolder.current = 'andy';
        patchWidgetMemory('strata', { module: 'leasing' });
        flushWidgetMemory();

        widgetMemoryUserIdHolder.current = 'lisa';
        expect(readWidgetMemory('strata', { module: 'overview' }).module).toBe('overview');
        patchWidgetMemory('strata', { module: 'vendors' });
        flushWidgetMemory();

        widgetMemoryUserIdHolder.current = 'andy';
        expect(readWidgetMemory('strata', { module: 'overview' }).module).toBe('leasing');
        expect(localStorage.getItem('widgetMemory:andy')).toContain('leasing');
        expect(localStorage.getItem('widgetMemory:lisa')).toContain('vendors');
    });
});

describe('corrupt-slice isolation', () => {
    it('a corrupt slice falls back to defaults without breaking other widgets', () => {
        localStorage.setItem('widgetMemory:_anonymous', JSON.stringify({
            'task-board': 'not-an-object',
            guide: { scrollTop: 900 },
        }));
        expect(readWidgetMemory('task-board', { swimlanes: true })).toEqual({ swimlanes: true });
        expect(readWidgetMemory('guide', { scrollTop: 0 }).scrollTop).toBe(900);
    });

    it('a fully corrupt blob deserializes to an empty map', () => {
        localStorage.setItem('widgetMemory:_anonymous', '{nope');
        expect(readWidgetMemory('guide', { scrollTop: 0 }).scrollTop).toBe(0);
    });
});

describe('debounce + flush', () => {
    it('localStorage write is debounced ~500ms; snapshot updates immediately', () => {
        vi.useFakeTimers();
        patchWidgetMemory('esign', { tab: 'templates' });
        expect(readWidgetMemory('esign', { tab: 'inbox' }).tab).toBe('templates'); // immediate
        expect(localStorage.getItem('widgetMemory:_anonymous')).toBeNull();        // not yet persisted
        vi.advanceTimersByTime(500);
        expect(localStorage.getItem('widgetMemory:_anonymous')).toContain('templates');
    });

    it('flushWidgetMemory persists the pending write synchronously', () => {
        vi.useFakeTimers();
        patchWidgetMemory('esign', { tab: 'sent' });
        expect(localStorage.getItem('widgetMemory:_anonymous')).toBeNull();
        flushWidgetMemory();
        expect(localStorage.getItem('widgetMemory:_anonymous')).toContain('sent');
    });

    it('an account switch mid-debounce never writes the previous user’s data', () => {
        vi.useFakeTimers();
        widgetMemoryUserIdHolder.current = 'andy';
        patchWidgetMemory('scribe', { activeFile: 'andys-secret.md' });
        widgetMemoryUserIdHolder.current = 'lisa';
        patchWidgetMemory('scribe', { activeFile: 'lisas-doc.md' });
        vi.advanceTimersByTime(500);
        flushWidgetMemory();
        expect(localStorage.getItem('widgetMemory:andy')).toBeNull();
        expect(localStorage.getItem('widgetMemory:lisa')).toContain('lisas-doc.md');
    });
});

describe('reset', () => {
    it('resetWidgetMemory drops cache and pending writes', () => {
        vi.useFakeTimers();
        patchWidgetMemory('guide', { scrollTop: 123 });
        resetWidgetMemory();
        vi.advanceTimersByTime(1000);
        expect(localStorage.getItem('widgetMemory:_anonymous')).toBeNull();
        expect(readWidgetMemory('guide', { scrollTop: 0 }).scrollTop).toBe(0);
    });
});
