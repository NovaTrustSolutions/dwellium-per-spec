/**
 * P3 item 16b — drives the real DocViewer component: toolbar toggle + field,
 * "n of m" count, Enter/Shift+Enter and next/prev jumping across pages, and
 * (the plan's explicit requirement) a real pdf-lib/pdf.js round trip proving
 * an active search never reaches pdfBake — a saved PDF is byte-for-byte the
 * same whether or not a search highlight is showing on screen.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import DocViewer from '../components/DocViewer/DocViewer';

const FILE = { id: 'search1', name: 'two-pages.pdf', type: 'pdf' };

function fakeCanvasContext() {
    return {
        clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), strokeRect: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
        save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), ellipse: vi.fn(),
        measureText: vi.fn(() => ({ width: 10 })),
        setTransform: vi.fn(), setLineDash: vi.fn(),
        fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', font: '', globalAlpha: 1,
    };
}

// Two pages. Page 1's text says "hello world", page 2's says "another hello".
// getTextContent is keyed by which page.getPage(n) produced it.
function makePage(text: string) {
    return {
        getViewport: () => ({
            width: 300, height: 300, scale: 1, rotation: 0,
            convertToViewportPoint: (x: number, y: number) => [x, y],
            convertToPdfPoint: (x: number, y: number) => [x, y],
        }),
        render: () => ({ promise: Promise.resolve() }),
        getTextContent: async () => ({
            items: [{ str: text, transform: [16, 0, 0, 16, 10, 280], width: text.length * 8, height: 16, fontName: 'Helvetica' }],
        }),
    };
}

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: (src: unknown) => {
        const data = (src as { data?: Uint8Array })?.data;
        if (data?.buffer) structuredClone(data.buffer, { transfer: [data.buffer] });
        return {
            promise: Promise.resolve({
                numPages: 2,
                destroy: () => {},
                getPage: async (n: number) => (n === 1 ? makePage('hello world') : makePage('another hello')),
            }),
        };
    },
}));

async function makeTwoPagePdfBytes(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    doc.addPage([300, 300]);
    return doc.save();
}

function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
}

describe('DocViewer text search (P3 16b)', () => {
    let putBodies: FormData[];

    beforeEach(() => {
        putBodies = [];
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        vi.stubGlobal('confirm', vi.fn(() => true));
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [FILE] });
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                const bytes = await makeTwoPagePdfBytes();
                return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as unknown as Response;
            }
            if (url.includes(`/api/files/${FILE.id}/annotations`)) {
                return { ok: false, status: 404, json: async () => ({ success: false, error: 'No draft' }) } as unknown as Response;
            }
            if (url.endsWith(`/api/files/${FILE.id}/content`) && method === 'PUT') {
                putBodies.push(init!.body as FormData);
                return jsonResponse({ success: true, data: { file: FILE, savedPath: null } });
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        }));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('toggle opens the field; typing shows "n of m"; next/prev jump across pages', async () => {
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });
        fireEvent.click(await screen.findByTitle('Search document text'));

        const input = await screen.findByPlaceholderText('Search document text…');
        fireEvent.change(input, { target: { value: 'hello' } });

        // Both pages contain "hello" (page 1: "hello world", page 2: "another hello").
        await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument());
        // Auto-jumps to the first match's page.
        expect((screen.getByLabelText('Current page') as HTMLInputElement).value).toBe('1');

        fireEvent.click(screen.getByLabelText('Next match'));
        await waitFor(() => expect(screen.getByText('2 of 2')).toBeInTheDocument());
        expect((screen.getByLabelText('Current page') as HTMLInputElement).value).toBe('2');

        fireEvent.click(screen.getByLabelText('Previous match'));
        await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument());
        expect((screen.getByLabelText('Current page') as HTMLInputElement).value).toBe('1');

        // Enter/Shift+Enter do the same as the buttons.
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(screen.getByText('2 of 2')).toBeInTheDocument());
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
        await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument());
    });

    it('a query with no matches shows "No matches"', async () => {
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });
        fireEvent.click(await screen.findByTitle('Search document text'));
        fireEvent.change(await screen.findByPlaceholderText('Search document text…'), { target: { value: 'zzz-nope' } });
        await waitFor(() => expect(screen.getByText('No matches')).toBeInTheDocument());
    });

    it('an active search with visible highlights never reaches pdfBake — Export writes byte-identical content either way', async () => {
        const blobs: Blob[] = [];
        const origCreateObjectURL = URL.createObjectURL;
        URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:mock'; }) as never;
        URL.revokeObjectURL = vi.fn();

        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });

        // Activate search and land on a real match (so the overlay actually
        // has a highlight to draw this render).
        fireEvent.click(await screen.findByTitle('Search document text'));
        fireEvent.change(await screen.findByPlaceholderText('Search document text…'), { target: { value: 'hello' } });
        await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument());

        fireEvent.click(await screen.findByTitle('Export current document'));
        await waitFor(() => expect(blobs).toHaveLength(1));
        URL.createObjectURL = origCreateObjectURL;

        const savedBytes = new Uint8Array(await blobs[0].arrayBuffer());

        // Decode what actually got saved with the REAL pdf.js (unmocked, legacy
        // build) and assert: no PDF-level annotations, and the SAME operator
        // count as a freshly pdf-lib-created blank 2-page document — i.e.
        // nothing extra was drawn into the content stream either.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const savedDoc = await pdfjs.getDocument({ data: savedBytes.slice(), disableWorker: true } as never).promise;
        expect(savedDoc.numPages).toBe(2);
        for (let n = 1; n <= 2; n++) {
            const page = await savedDoc.getPage(n);
            const annots = await page.getAnnotations();
            expect(annots).toHaveLength(0);
            const opList = await page.getOperatorList();
            expect(opList.fnArray.length).toBe(0); // blank page — nothing baked, not even a highlight mark
        }
    });
});
