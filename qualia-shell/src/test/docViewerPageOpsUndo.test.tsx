/**
 * Pins R5 (adversarial review of P0 item 5): insertPage/deletePage's calls
 * into the annotationModel shifters and the pushUndo/applySnapshot
 * round-trip were only tested as pure functions/hooks in isolation
 * (docViewerAnnotationModel.test.ts, docViewerHistory.test.ts). No test
 * drove the LIVE DocViewer through Insert Page + Undo and checked the real
 * page count round-trips — a wiring bug (e.g. a stale closure in pushUndo's
 * deps snapshotting outdated state, or passing the wrong page number) would
 * pass every existing test while silently breaking the running app.
 *
 * This test decodes the REAL pdf-lib bytes sent in the Save Back PUT after
 * each step, so it exercises the actual byte mutation + undo/redo pipeline
 * end to end rather than a component-internal spy.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import DocViewer from '../components/DocViewer/DocViewer';

const FILE = { id: 'p1', name: 'contract.pdf', type: 'pdf' };

function fakeCanvasContext() {
    return {
        clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), strokeRect: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
        save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), ellipse: vi.fn(),
        measureText: vi.fn(() => ({ width: 10 })),
        fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', font: '', globalAlpha: 1,
    };
}

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    // Like real pdf.js, take ownership of a `data` buffer (it is transferred to the worker and
    // the caller's Uint8Array becomes length 0). A mock that skips this hid a live bug: the
    // component kept the same array for Save Back and then baked from 0 bytes.
    getDocument: (src: unknown) => {
        const data = (src as { data?: Uint8Array })?.data;
        if (data?.buffer) structuredClone(data.buffer, { transfer: [data.buffer] });
        return {
        promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
                getViewport: () => ({ width: 300, height: 300, scale: 1, convertToViewportPoint: (x: number, y: number) => [x, y] }),
                render: () => ({ promise: Promise.resolve() }),
                getTextContent: async () => ({ items: [] }),
            }),
        }),
        };
    },
}));

async function makeRealPdfBytes(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    return doc.save();
}

function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
}

describe('DocViewer page ops + undo — real byte round-trip through the live component', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let putBodies: FormData[];

    beforeEach(() => {
        putBodies = [];
        vi.stubGlobal('HTMLCanvasElement', HTMLCanvasElement);
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        vi.stubGlobal('confirm', vi.fn(() => true));
        fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [FILE] });
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                const bytes = await makeRealPdfBytes();
                return {
                    ok: true,
                    status: 200,
                    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
                } as unknown as Response;
            }
            if (url.endsWith(`/api/files/${FILE.id}/content`) && method === 'PUT') {
                putBodies.push(init!.body as FormData);
                return jsonResponse({ success: true, data: { file: FILE, savedPath: null } });
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    async function pageCountOfLastPut(): Promise<number> {
        const filePart = putBodies[putBodies.length - 1].get('file') as Blob;
        const bytes = new Uint8Array(await filePart.arrayBuffer());
        const doc = await PDFDocument.load(bytes);
        return doc.getPageCount();
    }

    it('Insert Page x2 then Undo x1 restores the byte-level page count to 2, not 3 or 1', async () => {
        render(<DocViewer />);
        const select = await screen.findByRole('combobox');
        fireEvent.change(select, { target: { value: FILE.id } });

        const insertBtn = await screen.findByTitle('Insert Blank Page');
        const saveBtn = await screen.findByRole('button', { name: /save back/i });

        // Baseline round-trip: 1 real page, no edits yet.
        fireEvent.click(saveBtn); // clean — disabled, should no-op
        expect(putBodies.length).toBe(0);

        fireEvent.click(insertBtn); // 1 -> 2 pages
        await waitFor(() => expect(saveBtn).not.toBeDisabled());
        fireEvent.click(saveBtn);
        await waitFor(() => expect(putBodies.length).toBe(1));
        expect(await pageCountOfLastPut()).toBe(2);

        fireEvent.click(insertBtn); // 2 -> 3 pages
        await waitFor(() => expect(saveBtn).not.toBeDisabled());
        fireEvent.click(saveBtn);
        await waitFor(() => expect(putBodies.length).toBe(2));
        expect(await pageCountOfLastPut()).toBe(3);

        // Undo the 2nd insert: byte-level page count must round-trip back
        // to 2 (not stay at 3, and not over-correct to 1) — this is exactly
        // the wiring a stale pushUndo/applySnapshot closure would break.
        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        fireEvent.click(undoBtn);
        await waitFor(() => expect(saveBtn).not.toBeDisabled());
        fireEvent.click(saveBtn);
        await waitFor(() => expect(putBodies.length).toBe(3));
        expect(await pageCountOfLastPut()).toBe(2);
    });
});
