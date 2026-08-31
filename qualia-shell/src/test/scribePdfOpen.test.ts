/**
 * Scribe .pdf-open interception — converter mocked; asserts the sibling
 * "<name> (from PDF).md" is created + opened, the original PDF is untouched,
 * and a second open reuses the existing conversion (no re-convert).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScribeStore } from '../components/Scribe/scribeStore';
import {
    convertedMdPath,
    pdfSourceFromContent,
    openPdfBytesAsMarkdown,
    FROM_PDF_MARKER,
} from '../components/Scribe/pdfOpen';
import { pdfToMarkdown, MAX_PDF_BYTES } from '../components/Scribe/pdfToMarkdown';

vi.mock('../components/Scribe/pdfToMarkdown', async (importOriginal) => {
    const real = await importOriginal<typeof import('../components/Scribe/pdfToMarkdown')>();
    return {
        ...real,
        pdfToMarkdown: vi.fn(async () => ({ markdown: '<!-- page 1 -->\nconverted body\n', pages: 1, truncated: false })),
    };
});

const pdfToMarkdownMock = vi.mocked(pdfToMarkdown);

/** fetch stub: scribe-files API backed by an in-memory map; records every request. */
function stubScribeBackend(files: Record<string, string>) {
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        requests.push({ url, method });
        const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
        if (url.endsWith('/api/scribe/files') && method === 'GET') {
            return json({ success: true, files: Object.keys(files).map(filepath => ({ filepath, size: 1, modified: '' })) });
        }
        if (url.includes('/api/scribe/files/') && method === 'GET') {
            const path = decodeURIComponent(url.split('/api/scribe/files/')[1]);
            if (path in files) return json({ success: true, content: files[path] });
            return { ok: false, json: async () => ({ success: false, error: 'not found' }) } as Response;
        }
        if (url.endsWith('/api/scribe/files') && method === 'POST') {
            const body = JSON.parse(String(init?.body)) as { filepath: string; content: string };
            files[body.filepath] = body.content;
            return json({ success: true });
        }
        return json({ success: true });
    }));
    return { requests, files };
}

beforeEach(() => {
    localStorage.clear();
    pdfToMarkdownMock.mockClear();
    useScribeStore.setState({ openFiles: [], activeFilepath: null, loading: false, error: null });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('convertedMdPath / marker helpers', () => {
    it('names the sibling doc and never the bare .md', () => {
        expect(convertedMdPath('reports/Q1.pdf')).toBe('reports/Q1 (from PDF).md');
        expect(convertedMdPath('Q1.PDF')).toBe('Q1 (from PDF).md');
    });
    it('round-trips the source pdf through the marker line', () => {
        expect(pdfSourceFromContent(`${FROM_PDF_MARKER} a/b.pdf -->\n\nbody`)).toBe('a/b.pdf');
        expect(pdfSourceFromContent('# plain doc')).toBeNull();
    });
});

describe('openFile(".pdf") interception', () => {
    it('converts, creates the sibling .md, opens it, and leaves the PDF untouched', async () => {
        const backend = stubScribeBackend({ 'report.pdf': '%PDF-1.4 fake bytes' });

        await useScribeStore.getState().openFile('report.pdf');

        const s = useScribeStore.getState();
        expect(s.activeFilepath).toBe('report (from PDF).md');
        const doc = s.openFiles.find(f => f.filepath === 'report (from PDF).md');
        expect(doc?.content.startsWith(`${FROM_PDF_MARKER} report.pdf -->`)).toBe(true);
        expect(doc?.content).toContain('converted body');
        expect(pdfToMarkdownMock).toHaveBeenCalledTimes(1);

        // Original untouched: still present, never written to or deleted.
        expect(backend.files['report.pdf']).toBe('%PDF-1.4 fake bytes');
        expect(backend.requests.some(r => r.url.includes('report.pdf') && r.method !== 'GET')).toBe(false);
        // The pdf itself was never opened as a tab.
        expect(s.openFiles.some(f => f.filepath === 'report.pdf')).toBe(false);
    });

    it('reuses the existing conversion on a second open (no duplicate conversion)', async () => {
        stubScribeBackend({
            'report.pdf': '%PDF-1.4 fake bytes',
            'report (from PDF).md': `${FROM_PDF_MARKER} report.pdf -->\n\nalready converted`,
        });

        await useScribeStore.getState().openFile('report.pdf');

        const s = useScribeStore.getState();
        expect(s.activeFilepath).toBe('report (from PDF).md');
        expect(s.openFiles.find(f => f.filepath === 'report (from PDF).md')?.content).toContain('already converted');
        expect(pdfToMarkdownMock).not.toHaveBeenCalled();
    });

    it('never overwrites an unrelated report.md (sibling name is always suffixed)', async () => {
        const backend = stubScribeBackend({
            'report.pdf': '%PDF-1.4 fake bytes',
            'report.md': '# my own notes',
        });

        await useScribeStore.getState().openFile('report.pdf');

        expect(backend.files['report.md']).toBe('# my own notes');
        expect(useScribeStore.getState().activeFilepath).toBe('report (from PDF).md');
    });

    it('creates an honest fallback doc when conversion fails', async () => {
        stubScribeBackend({ 'broken.pdf': 'not really a pdf' });
        pdfToMarkdownMock.mockRejectedValueOnce(new Error('bad xref'));

        await useScribeStore.getState().openFile('broken.pdf');

        const doc = useScribeStore.getState().openFiles.find(f => f.filepath === 'broken (from PDF).md');
        expect(doc?.content).toContain("Couldn't extract text");
        expect(doc?.content).toContain('PDF Gear');
    });
});

describe('size cap', () => {
    it('refuses >20 MB with an honest toast and opens PDF Gear instead', async () => {
        stubScribeBackend({});
        const toasts: string[] = [];
        const opened: unknown[] = [];
        const onToast = (e: Event) => toasts.push(String((e as CustomEvent).detail));
        const onOpen = (e: Event) => opened.push((e as CustomEvent).detail);
        window.addEventListener('qualia-toast', onToast);
        window.addEventListener('dwellium:open-widget', onOpen);
        try {
            await openPdfBytesAsMarkdown('huge.pdf', new Uint8Array(MAX_PDF_BYTES + 1));
        } finally {
            window.removeEventListener('qualia-toast', onToast);
            window.removeEventListener('dwellium:open-widget', onOpen);
        }
        expect(pdfToMarkdownMock).not.toHaveBeenCalled();
        expect(toasts.join(' ')).toContain('over 20 MB');
        expect((opened[0] as { widgetId?: string })?.widgetId).toBe('pdf-gear');
        expect(useScribeStore.getState().openFiles).toHaveLength(0);
    });
});
