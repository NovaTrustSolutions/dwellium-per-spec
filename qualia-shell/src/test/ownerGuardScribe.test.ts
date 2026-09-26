/**
 * Owner-race guard coverage for Scribe's async writers (scribeStore create/open/save/delete,
 * the .pdf → markdown chain, folder ingestion, Brain Dump report). Each starts as user-a,
 * switches the account mid-await (setPerUserIdentity + the 'dwellium-user' localStorage record
 * that scribeStore's local cache keys on), resolves, and asserts NEITHER account got the write —
 * and that nothing is POSTed with the new account's token for a job the old account started.
 * See ownerGuard.test.ts for the base primitive.
 */
import { createElement } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { setPerUserIdentity, captureOwner, ACCOUNT_CHANGED } from '../lib/perUserIdentity';
import { useScribeStore } from '../components/Scribe/scribeStore';
import { openPdfBytesAsMarkdown } from '../components/Scribe/pdfOpen';
import { pdfToMarkdown } from '../components/Scribe/pdfToMarkdown';
import { convertFolder } from '../components/Scribe/ingestion/ingestionConvert';
import { ingestionHandles, setConvertedIndex } from '../components/Scribe/ingestion/ingestionStore';
import { useIngestion } from '../components/Scribe/ingestion/useIngestion';
import { callLlm } from '../lib/llmClient';
import { appendDump, dumpStore } from '../components/Scribe/dumpStore';
import DumpMode from '../components/Scribe/DumpMode';

vi.mock('../components/Scribe/pdfToMarkdown', async (orig) => ({
    ...(await orig<typeof import('../components/Scribe/pdfToMarkdown')>()),
    pdfToMarkdown: vi.fn(),
}));
vi.mock('../components/Scribe/ingestion/ingestionConvert', async (orig) => ({
    ...(await orig<typeof import('../components/Scribe/ingestion/ingestionConvert')>()),
    convertFolder: vi.fn(),
}));
vi.mock('../components/Scribe/ingestion/ingestionStore', async (orig) => ({
    ...(await orig<typeof import('../components/Scribe/ingestion/ingestionStore')>()),
    setConvertedIndex: vi.fn(),
}));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { provider: 'test' } } }),
}));
vi.mock('../lib/llmClient', async (orig) => ({
    ...(await orig<typeof import('../lib/llmClient')>()),
    hasActiveLlm: () => true,
    callLlm: vi.fn(),
}));

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
const tick = () => new Promise(r => setTimeout(r, 0));

/** Sign in the way the app does: the per-user holders AND the 'dwellium-user' record. */
function signIn(id: string | null) {
    if (id) localStorage.setItem('dwellium-user', JSON.stringify({ id }));
    else localStorage.removeItem('dwellium-user');
    setPerUserIdentity(id);
}
const switchAccount = () => { signIn(null); signIn('user-b'); };
const localFiles = (id: string): Record<string, { content: string; dirty: boolean }> =>
    JSON.parse(localStorage.getItem(`scribe-local-files:${id}`) ?? '{}');
const ok = (body: unknown = { success: true }) => ({ ok: true, status: 200, json: async () => body }) as Response;

/** Scribe files API stub; the first request matching `gate` waits on its deferred. */
function stubFetch(gate?: { method: string; url?: string; d: ReturnType<typeof deferred<Response>> }) {
    const requests: Array<{ url: string; method: string }> = [];
    let gated = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        requests.push({ url, method });
        if (gate && !gated && gate.method === method && (!gate.url || url.endsWith(gate.url))) {
            gated = true;
            return gate.d.promise;
        }
        if (method === 'GET' && url.endsWith('/api/scribe/files')) return ok({ success: true, files: [] });
        if (method === 'GET') return ok({ success: true, content: 'server body' });
        return ok();
    }));
    return requests;
}

beforeEach(() => {
    localStorage.clear();
    useScribeStore.setState({ openFiles: [], activeFilepath: null, loading: false, error: null, comments: [] });
    dumpStore.reset();
    vi.mocked(pdfToMarkdown).mockReset();
    vi.mocked(convertFolder).mockReset();
    vi.mocked(setConvertedIndex).mockReset();
    vi.mocked(callLlm).mockReset();
    signIn('user-a');
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    signIn(null);
});

describe('owner-race guard — scribeStore async actions', () => {
    it('createFile: switch mid-POST → not cached under A or B, not opened, loading cleared', async () => {
        const d = deferred<Response>();
        stubFetch({ method: 'POST', d });
        const p = useScribeStore.getState().createFile('notes.md', 'A secret');
        await tick();
        switchAccount();
        d.resolve(ok());
        await p;
        expect(localFiles('user-b')).toEqual({});
        expect(localFiles('user-a')).toEqual({});
        expect(useScribeStore.getState().openFiles).toEqual([]);
        expect(useScribeStore.getState().loading).toBe(false);
    });

    it('createFile: POST fails after the switch → no dirty copy lands in B (never re-uploaded to B)', async () => {
        const d = deferred<Response>();
        stubFetch({ method: 'POST', d });
        const p = useScribeStore.getState().createFile('notes.md', 'A secret');
        await tick();
        switchAccount();
        d.reject(new TypeError('Failed to fetch'));
        await p;
        expect(localFiles('user-b')).toEqual({});
        expect(useScribeStore.getState().openFiles).toEqual([]);
        expect(useScribeStore.getState().loading).toBe(false);
    });

    it('createFile: a caller\'s pre-switch stillOwner → no POST with the new account\'s token', async () => {
        const requests = stubFetch();
        const stillOwner = captureOwner();
        switchAccount();
        await useScribeStore.getState().createFile('Imported.md', 'A docx body', { stillOwner });
        expect(requests.filter(r => r.method === 'POST')).toEqual([]);
        expect(localFiles('user-b')).toEqual({});
        expect(useScribeStore.getState().openFiles).toEqual([]);
    });

    it('control: createFile with no switch caches under A and opens', async () => {
        stubFetch();
        await useScribeStore.getState().createFile('notes.md', 'A body', { stillOwner: captureOwner() });
        expect(localFiles('user-a')['notes.md']).toMatchObject({ content: 'A body', dirty: false });
        expect(useScribeStore.getState().activeFilepath).toBe('notes.md');
    });

    it('openFile: switch mid-GET → A\'s file is not cached under B nor opened, loading cleared', async () => {
        const d = deferred<Response>();
        stubFetch({ method: 'GET', d });
        const p = useScribeStore.getState().openFile('notes.md');
        await tick();
        switchAccount();
        d.resolve(ok({ success: true, content: 'A server body' }));
        await p;
        expect(localFiles('user-b')).toEqual({});
        expect(useScribeStore.getState().openFiles).toEqual([]);
        expect(useScribeStore.getState().loading).toBe(false);
    });

    it('control: openFile with no switch caches under A and opens', async () => {
        stubFetch();
        await useScribeStore.getState().openFile('notes.md');
        expect(localFiles('user-a')['notes.md']).toMatchObject({ content: 'server body', dirty: false });
        expect(useScribeStore.getState().activeFilepath).toBe('notes.md');
    });

    it('saveFile: switch mid-PUT → A\'s content is not cached under B', async () => {
        useScribeStore.setState({ openFiles: [{ filepath: 'notes.md', content: 'A draft', dirty: true, scrollTop: 0 }] });
        const d = deferred<Response>();
        stubFetch({ method: 'PUT', d });
        const p = useScribeStore.getState().saveFile('notes.md');
        await tick();
        switchAccount();
        d.resolve(ok());
        await p;
        expect(localFiles('user-b')).toEqual({});
    });

    it('control: saveFile with no switch caches clean under A', async () => {
        useScribeStore.setState({ openFiles: [{ filepath: 'notes.md', content: 'A draft', dirty: true, scrollTop: 0 }] });
        stubFetch();
        await useScribeStore.getState().saveFile('notes.md');
        expect(localFiles('user-a')['notes.md']).toMatchObject({ content: 'A draft', dirty: false });
        expect(useScribeStore.getState().openFiles[0].dirty).toBe(false);
    });

    it('deleteFile: switch mid-DELETE → B\'s same-path local copy (unsynced edits) survives', async () => {
        localStorage.setItem('scribe-local-files:user-b', JSON.stringify({
            'notes.md': { content: 'B unsynced', modified: '2026-01-01T00:00:00.000Z', dirty: true },
        }));
        const d = deferred<Response>();
        stubFetch({ method: 'DELETE', d });
        const p = useScribeStore.getState().deleteFile('notes.md');
        await tick();
        switchAccount();
        d.resolve(ok());
        await p;
        expect(localFiles('user-b')['notes.md']).toMatchObject({ content: 'B unsynced', dirty: true });
    });

    it('control: deleteFile with no switch removes A\'s local copy', async () => {
        localStorage.setItem('scribe-local-files:user-a', JSON.stringify({
            'notes.md': { content: 'A', modified: '2026-01-01T00:00:00.000Z', dirty: false },
        }));
        stubFetch();
        await useScribeStore.getState().deleteFile('notes.md');
        expect(localFiles('user-a')).toEqual({});
    });
});

describe('owner-race guard — .pdf → markdown chain', () => {
    it('openPdfBytesAsMarkdown: switch mid-conversion → nothing POSTed or cached for B', async () => {
        const conv = deferred<{ markdown: string; pages: number; truncated: boolean }>();
        vi.mocked(pdfToMarkdown).mockReturnValue(conv.promise);
        const requests = stubFetch();
        const p = openPdfBytesAsMarkdown('report.pdf', new Uint8Array([1, 2, 3]));
        await tick();
        switchAccount();
        conv.resolve({ markdown: 'A pdf text', pages: 1, truncated: false });
        await p;
        expect(requests.filter(r => r.method === 'POST')).toEqual([]);
        expect(localFiles('user-b')).toEqual({});
        expect(useScribeStore.getState().openFiles).toEqual([]);
    });

    it('openFile(".pdf"): switch mid-listFiles → A\'s PDF is never fetched/created with B\'s token', async () => {
        vi.mocked(pdfToMarkdown).mockResolvedValue({ markdown: 'A pdf text', pages: 1, truncated: false });
        const d = deferred<Response>();
        const requests = stubFetch({ method: 'GET', url: '/api/scribe/files', d });
        const p = useScribeStore.getState().openFile('report.pdf');
        await tick(); await tick();
        switchAccount();
        d.resolve(ok({ success: true, files: [] }));
        await p;
        expect(requests.filter(r => r.method === 'POST')).toEqual([]);
        expect(requests.some(r => r.url.endsWith('/api/scribe/files/report.pdf'))).toBe(false);
        expect(localFiles('user-b')).toEqual({});
        expect(useScribeStore.getState().openFiles).toEqual([]);
    });

    it('control: openPdfBytesAsMarkdown with no switch creates and opens the sibling .md under A', async () => {
        vi.mocked(pdfToMarkdown).mockResolvedValue({ markdown: 'A pdf text', pages: 1, truncated: false });
        const requests = stubFetch();
        await openPdfBytesAsMarkdown('report.pdf', new Uint8Array([1]));
        expect(requests.filter(r => r.method === 'POST')).toHaveLength(1);
        expect(localFiles('user-a')['report (from PDF).md'].content).toContain('A pdf text');
        expect(useScribeStore.getState().activeFilepath).toBe('report (from PDF).md');
    });
});

describe('owner-race guard — folder ingestion convert', () => {
    function mountConvert() {
        const api: { convert?: () => Promise<void>; converting?: boolean } = {};
        function Harness() {
            const ing = useIngestion();
            api.convert = ing.convert;
            api.converting = ing.converting;
            return null;
        }
        render(createElement(Harness));
        return api;
    }
    const result = {
        entries: [], syncedAt: '2026-09-26T00:00:00.000Z',
        documents: [{ destName: 'a.md', content: 'A doc 1' }, { destName: 'b.md', content: 'A doc 2' }],
    };

    beforeEach(() => {
        ingestionHandles.source = { kind: 'directory', name: 'Source' };
        ingestionHandles.backup = { kind: 'directory', name: 'Backup' };
    });

    it('switch during convertFolder → no index write, no POST, nothing opened, converting clears', async () => {
        const conv = deferred<typeof result>();
        vi.mocked(convertFolder).mockReturnValue(conv.promise as never);
        const requests = stubFetch();
        const api = mountConvert();
        let p!: Promise<void>;
        act(() => { p = api.convert!(); });
        await tick();
        switchAccount();
        await act(async () => { conv.resolve(result); await p; });
        expect(setConvertedIndex).not.toHaveBeenCalled();
        expect(requests.filter(r => r.method === 'POST')).toEqual([]);
        expect(localFiles('user-b')).toEqual({});
        expect(useScribeStore.getState().openFiles).toEqual([]);
        expect(api.converting).toBe(false);
    });

    it('switch during the import loop → the rest is not POSTed with B\'s token', async () => {
        vi.mocked(convertFolder).mockResolvedValue(result as never);
        const d = deferred<Response>();
        const requests = stubFetch({ method: 'POST', d });
        const api = mountConvert();
        let p!: Promise<void>;
        act(() => { p = api.convert!(); });
        await tick();
        switchAccount();
        await act(async () => { d.resolve(ok()); await p; });
        expect(requests.filter(r => r.method === 'POST')).toHaveLength(1); // only A's first, pre-switch
        expect(localFiles('user-b')).toEqual({});
        expect(useScribeStore.getState().openFiles).toEqual([]);
        expect(api.converting).toBe(false);
    });

    it('control: no switch → index written, every doc POSTed, first one opened', async () => {
        vi.mocked(convertFolder).mockResolvedValue(result as never);
        const requests = stubFetch();
        const api = mountConvert();
        await act(async () => { await api.convert!(); });
        expect(setConvertedIndex).toHaveBeenCalledTimes(1);
        expect(requests.filter(r => r.method === 'POST')).toHaveLength(2);
        expect(useScribeStore.getState().activeFilepath).toBe('Ingested/a.md');
    });
});

describe('owner-race guard — Brain Dump report', () => {
    async function generate() {
        appendDump('first thought');
        render(createElement(DumpMode));
        fireEvent.click(screen.getByRole('button', { name: 'Report' }));
        fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
        await tick();
    }

    it('switch mid-LLM call → the report is not opened in B\'s Scribe; busy clears; says why', async () => {
        const d = deferred<{ text: string }>();
        vi.mocked(callLlm).mockReturnValue(d.promise as never);
        await generate();
        switchAccount();
        await act(async () => { d.resolve({ text: '# A report' }); await tick(); });
        expect(useScribeStore.getState().openFiles).toEqual([]);
        expect(screen.getByRole('button', { name: 'Generate' })).not.toBeDisabled();
        expect(screen.getByText(ACCOUNT_CHANGED)).toBeInTheDocument();
    });

    it('control: no switch → the report opens in Scribe', async () => {
        vi.mocked(callLlm).mockResolvedValue({ text: '# A report' } as never);
        await generate();
        await waitFor(() => expect(useScribeStore.getState().openFiles).toHaveLength(1));
        expect(useScribeStore.getState().openFiles[0].content).toBe('# A report');
    });
});
