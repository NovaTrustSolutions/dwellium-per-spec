/**
 * Cycle 2 — Scribe ingestion storage layer unit tests.
 *
 * Covers the two ingestion primitives created this cycle:
 *   1. ingestionStore  — per-user localStorage state (createLocalStorageStore
 *                        dynamic-key sister to fileExplorerStore). SSR-safety
 *                        (getServerSnapshot), normalize/coerce, per-user isolation,
 *                        converted-index mutation helpers, in-memory handle refs.
 *   2. ingestionApi    — typed /api/ingest client over a mocked fetch.
 *
 * NO React render, no fake timers (Phase-7 Finding (B) convention — pure
 * synchronous + mocked-fetch async assertions). Per the v2.72.1 standing
 * convention, the factory-produced store is .reset() in beforeEach to avoid
 * cross-test module-cache pollution.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    ingestionStore,
    ingestionUserIdHolder,
    ingestionHandles,
    saveIngestion,
    setConvertedIndex,
    recordConverted,
    clearConvertedIndex,
    clearIngestion,
    DEFAULT_STATE,
    type ConvertedFileEntry,
} from '../components/Scribe/ingestion/ingestionStore';

beforeEach(() => {
    localStorage.clear();
    ingestionStore.reset();
    ingestionUserIdHolder.current = null;
    ingestionHandles.source = null;
    ingestionHandles.backup = null;
});

const entry = (over: Partial<ConvertedFileEntry> = {}): ConvertedFileEntry => ({
    sourceName: 'notes.html',
    destName: 'notes.md',
    status: 'converted',
    bytes: 120,
    convertedAt: '2026-05-29T00:00:00.000Z',
    ...over,
});

describe('Cycle 2 — ingestionStore: SSR-safety contract', () => {
    it('getServerSnapshot() returns DEFAULT_STATE (no init-time localStorage read)', () => {
        const snap = ingestionStore.getServerSnapshot();
        expect(snap).toEqual(DEFAULT_STATE);
        expect(snap.sourceFolderName).toBeNull();
        expect(snap.backupFolderName).toBeNull();
        expect(snap.lastSyncAt).toBeNull();
        expect(snap.converted).toEqual([]);
    });

    it('getSnapshot() returns DEFAULT_STATE when nothing is persisted', () => {
        expect(ingestionStore.getSnapshot()).toEqual(DEFAULT_STATE);
    });
});

describe('Cycle 2 — ingestionStore: persistence + per-user key', () => {
    it('saveIngestion persists a patch under the user-scoped key and round-trips', () => {
        ingestionUserIdHolder.current = 'andy';
        saveIngestion({ sourceFolderName: 'Desktop/Inbox', backupFolderName: 'Drive/Backup' });
        const snap = ingestionStore.getSnapshot();
        expect(snap.sourceFolderName).toBe('Desktop/Inbox');
        expect(snap.backupFolderName).toBe('Drive/Backup');
        expect(localStorage.getItem('scribe-ingestion:andy')).toContain('Desktop/Inbox');
        // anonymous key untouched
        expect(localStorage.getItem('scribe-ingestion:_anonymous')).toBeNull();
    });

    it('setConvertedIndex replaces the index and stamps the passed-in sync time', () => {
        ingestionUserIdHolder.current = 'andy';
        setConvertedIndex([entry(), entry({ sourceName: 'a.txt', destName: 'a.md' })], '2026-05-29T10:00:00.000Z');
        const snap = ingestionStore.getSnapshot();
        expect(snap.converted).toHaveLength(2);
        expect(snap.lastSyncAt).toBe('2026-05-29T10:00:00.000Z');
        // a second run REPLACES (not appends) the index
        setConvertedIndex([entry({ sourceName: 'only.md', destName: 'only.md', status: 'passthrough' })], '2026-05-29T11:00:00.000Z');
        const snap2 = ingestionStore.getSnapshot();
        expect(snap2.converted).toHaveLength(1);
        expect(snap2.converted[0].sourceName).toBe('only.md');
        expect(snap2.lastSyncAt).toBe('2026-05-29T11:00:00.000Z');
    });

    it('recordConverted prepends a single entry (newest first)', () => {
        ingestionUserIdHolder.current = 'andy';
        recordConverted(entry({ sourceName: 'first.html' }));
        recordConverted(entry({ sourceName: 'second.html' }));
        const snap = ingestionStore.getSnapshot();
        expect(snap.converted.map(e => e.sourceName)).toEqual(['second.html', 'first.html']);
    });

    it('clearConvertedIndex wipes the index + lastSyncAt but keeps folder metadata', () => {
        ingestionUserIdHolder.current = 'andy';
        saveIngestion({ sourceFolderName: 'Inbox' });
        setConvertedIndex([entry()], '2026-05-29T10:00:00.000Z');
        clearConvertedIndex();
        const snap = ingestionStore.getSnapshot();
        expect(snap.converted).toEqual([]);
        expect(snap.lastSyncAt).toBeNull();
        expect(snap.sourceFolderName).toBe('Inbox'); // metadata survives
    });

    it('isolates per-user state (Andy ≠ Lisa)', () => {
        ingestionUserIdHolder.current = 'andy';
        saveIngestion({ sourceFolderName: 'AndyInbox' });
        ingestionUserIdHolder.current = 'lisa';
        // dynamic-key resolver flips → fresh read → Lisa sees default, not Andy's
        expect(ingestionStore.getSnapshot().sourceFolderName).toBeNull();
        saveIngestion({ sourceFolderName: 'LisaInbox' });
        expect(ingestionStore.getSnapshot().sourceFolderName).toBe('LisaInbox');
        // Andy's value is intact under his key
        ingestionUserIdHolder.current = 'andy';
        expect(ingestionStore.getSnapshot().sourceFolderName).toBe('AndyInbox');
    });
});

describe('Cycle 2 — ingestionStore: normalize / coerce malformed data', () => {
    it('coerces an unknown status to "converted" and drops entries missing sourceName', () => {
        ingestionUserIdHolder.current = 'andy';
        localStorage.setItem('scribe-ingestion:andy', JSON.stringify({
            sourceFolderName: 42,           // wrong type → null
            converted: [
                { sourceName: 'ok.html', destName: 'ok.md', status: 'bogus', bytes: -5 },
                { destName: 'orphan.md', status: 'converted' }, // no sourceName → dropped
                'not-an-object',
            ],
        }));
        const snap = ingestionStore.getSnapshot();
        expect(snap.sourceFolderName).toBeNull();
        expect(snap.converted).toHaveLength(1);
        expect(snap.converted[0].status).toBe('converted'); // bogus → default
        expect(snap.converted[0].bytes).toBe(0);            // negative → 0
    });

    it('falls back to DEFAULT_STATE on malformed JSON', () => {
        ingestionUserIdHolder.current = 'andy';
        localStorage.setItem('scribe-ingestion:andy', '{not json');
        expect(ingestionStore.getSnapshot()).toEqual(DEFAULT_STATE);
    });

    it('preserves queued-backend + error statuses and their notes', () => {
        ingestionUserIdHolder.current = 'andy';
        setConvertedIndex([
            entry({ sourceName: 'doc.pdf', destName: null, status: 'queued-backend', note: 'needs backend conversion (pdf)' }),
            entry({ sourceName: 'bad.html', destName: null, status: 'error', note: 'read failed' }),
        ], '2026-05-29T10:00:00.000Z');
        const snap = ingestionStore.getSnapshot();
        expect(snap.converted[0].status).toBe('queued-backend');
        expect(snap.converted[0].note).toContain('pdf');
        expect(snap.converted[1].status).toBe('error');
    });
});

describe('Cycle 2 — ingestionStore: handle refs + full reset', () => {
    it('clearIngestion wipes persisted state AND in-memory handles', () => {
        ingestionUserIdHolder.current = 'andy';
        ingestionHandles.source = { fake: 'sourceHandle' };
        ingestionHandles.backup = { fake: 'backupHandle' };
        saveIngestion({ sourceFolderName: 'Inbox' });
        setConvertedIndex([entry()], '2026-05-29T10:00:00.000Z');

        clearIngestion();

        expect(ingestionStore.getSnapshot()).toEqual(DEFAULT_STATE);
        expect(localStorage.getItem('scribe-ingestion:andy')).toBeNull();
        expect(ingestionHandles.source).toBeNull();
        expect(ingestionHandles.backup).toBeNull();
    });
});

describe('Cycle 2 — ingestionApi: typed /api/ingest client', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    function mockFetch(body: unknown, ok = true, status = 200) {
        const fn = vi.fn().mockResolvedValue({
            ok,
            status,
            json: () => Promise.resolve(body),
        });
        vi.stubGlobal('fetch', fn);
        return fn;
    }

    it('registerWatch POSTs source/dest and returns the WatchedFolder', async () => {
        const watched = { id: 'w1', sourcePath: '/src', destPath: '/dest', registeredAt: '2026-05-29T00:00:00.000Z' };
        const fn = mockFetch({ success: true, data: watched });
        const { registerWatch } = await import('../components/Scribe/ingestion/ingestionApi');
        const res = await registerWatch('/src', '/dest', 'Inbox');
        expect(res).toEqual(watched);
        const [url, opts] = fn.mock.calls[0];
        expect(String(url)).toContain('/api/ingest/watch');
        expect(opts.method).toBe('POST');
        expect(JSON.parse(opts.body)).toMatchObject({ sourcePath: '/src', destPath: '/dest', label: 'Inbox' });
    });

    it('fetchIngestStatus returns the daemon snapshot', async () => {
        const status = { watching: [], lastRunAt: null, queueDepth: 3 };
        mockFetch({ success: true, data: status });
        const { fetchIngestStatus } = await import('../components/Scribe/ingestion/ingestionApi');
        expect(await fetchIngestStatus()).toEqual(status);
    });

    it('fetchBackendConverted defaults to [] when data is not an array', async () => {
        mockFetch({ success: true, data: null });
        const { fetchBackendConverted } = await import('../components/Scribe/ingestion/ingestionApi');
        expect(await fetchBackendConverted()).toEqual([]);
    });

    it('throws a typed error when the backend route is not implemented (success:false)', async () => {
        mockFetch({ success: false, error: 'Backend route not implemented yet' }, false, 404);
        const { fetchIngestStatus } = await import('../components/Scribe/ingestion/ingestionApi');
        await expect(fetchIngestStatus()).rejects.toThrow('Backend route not implemented yet');
    });
});
