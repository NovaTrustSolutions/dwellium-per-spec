/**
 * scribeMemory (plan 055 phase 2) — Scribe reopens at its exact point.
 *
 * Restore reopens remembered tabs + active file (skipping deleted files),
 * tracking mirrors the tab list into widget memory, and per-file
 * scroll/cursor round-trips through capture/read.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useScribeStore } from '../components/Scribe/scribeStore';
import {
    captureScribeView,
    readScribeView,
    restoreScribeSession,
    trackScribeSession,
} from '../components/Scribe/scribeMemory';
import { flushWidgetMemory, patchWidgetMemory, readWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';

const FILES: Record<string, string> = {
    'leases/woodland-parc.md': '# Woodland Parc lease\n\nAndy was editing here.',
    'notes/vendors.md': '# Vendor notes',
};

function stubScribeBackend() {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const m = url.match(/\/api\/scribe\/files\/(.+)$/);
        const filepath = m ? decodeURIComponent(m[1]) : null;
        if (filepath && FILES[filepath] !== undefined) {
            return { ok: true, status: 200, json: async () => ({ success: true, content: FILES[filepath] }) } as unknown as Response;
        }
        return { ok: false, status: 404, json: async () => ({ success: false, error: 'not found' }) } as unknown as Response;
    }));
}

beforeEach(() => {
    localStorage.clear();
    resetWidgetMemory(); // v2.72.1 standing convention
    useScribeStore.setState({ openFiles: [], activeFilepath: null, loading: false, error: null, comments: [] });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('restoreScribeSession', () => {
    it('reopens remembered tabs + active file; a deleted file is skipped without sinking the rest', async () => {
        stubScribeBackend();
        patchWidgetMemory('scribe', {
            openFilepaths: ['leases/woodland-parc.md', 'deleted/gone.md', 'notes/vendors.md'],
            activeFilepath: 'leases/woodland-parc.md',
        });
        await restoreScribeSession();
        const s = useScribeStore.getState();
        expect(s.openFiles.map(f => f.filepath)).toEqual(['leases/woodland-parc.md', 'notes/vendors.md']);
        expect(s.activeFilepath).toBe('leases/woodland-parc.md');
        expect(s.openFiles[0].content).toContain('Andy was editing here');
    });

    it('is a no-op when the session is already live (widget remount)', async () => {
        stubScribeBackend();
        useScribeStore.setState({ openFiles: [{ filepath: 'live.md', content: 'x', dirty: false, scrollTop: 0 }], activeFilepath: 'live.md' });
        patchWidgetMemory('scribe', { openFilepaths: ['notes/vendors.md'], activeFilepath: 'notes/vendors.md' });
        await restoreScribeSession();
        expect(useScribeStore.getState().openFiles.map(f => f.filepath)).toEqual(['live.md']);
    });
});

describe('trackScribeSession', () => {
    it('mirrors open tabs + active file into widget memory as the store changes', async () => {
        stubScribeBackend();
        const untrack = trackScribeSession();
        await useScribeStore.getState().openFile('notes/vendors.md');
        flushWidgetMemory();
        const mem = readWidgetMemory('scribe', { openFilepaths: [] as string[], activeFilepath: null as string | null });
        expect(mem.openFilepaths).toEqual(['notes/vendors.md']);
        expect(mem.activeFilepath).toBe('notes/vendors.md');
        untrack();
    });
});

describe('capture/readScribeView', () => {
    it('round-trips per-file scroll + cursor without clobbering other files', () => {
        captureScribeView('a.md', 420, 1337);
        captureScribeView('b.md', 7, 3);
        expect(readScribeView('a.md')).toEqual({ scrollTop: 420, cursor: 1337 });
        expect(readScribeView('b.md')).toEqual({ scrollTop: 7, cursor: 3 });
        expect(readScribeView('missing.md')).toBeNull();
        expect(readScribeView(null)).toBeNull();
    });
});
