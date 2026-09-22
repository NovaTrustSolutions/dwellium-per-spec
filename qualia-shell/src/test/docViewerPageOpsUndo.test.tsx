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
        setTransform: vi.fn(),
        fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', font: '', globalAlpha: 1,
    };
}

// R7's render-count check needs to know how many times page.render() actually
// ran on the mocked pdf.js doc — reset per test.
let pageRenderCalls = 0;

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
                getViewport: () => ({
                    width: 300, height: 300, scale: 1, rotation: 0,
                    convertToViewportPoint: (x: number, y: number) => [x, y],
                    convertToPdfPoint: (x: number, y: number) => [x, y],
                }),
                render: () => { pageRenderCalls += 1; return { promise: Promise.resolve() }; },
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

/** pdf.js's own Util.transform(m1, m2): composes m1 THEN m2 (row-vector
 * convention) — same helper as docViewerPdfCoords.test.ts's upright-angle
 * check, duplicated locally (it isn't exported from pdfCoords.ts). */
function composeTransforms(m1: number[], m2: number[]): number[] {
    return [
        m1[0] * m2[0] + m1[1] * m2[2],
        m1[0] * m2[1] + m1[1] * m2[3],
        m1[2] * m2[0] + m1[3] * m2[2],
        m1[2] * m2[1] + m1[3] * m2[3],
        m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
        m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
    ];
}

describe('DocViewer page ops + undo — real byte round-trip through the live component', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let putBodies: FormData[];

    beforeEach(() => {
        putBodies = [];
        pageRenderCalls = 0;
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

    it('R1: rotating a page AFTER placing a text annotation re-syncs its baked rotation (adversarial review of item6-coordinates)', async () => {
        vi.stubGlobal('prompt', vi.fn(() => 'HELLO'));
        const { container } = render(<DocViewer />);
        const select = await screen.findByRole('combobox');
        fireEvent.change(select, { target: { value: FILE.id } });

        fireEvent.click(await screen.findByTitle('Add Text'));
        const overlay = container.querySelector('.dv-overlay-canvas')!;
        fireEvent.pointerDown(overlay, { clientX: 50, clientY: 50, pointerId: 1 });
        fireEvent.pointerUp(overlay, { clientX: 50, clientY: 50, pointerId: 1 });

        const saveBtn = await screen.findByRole('button', { name: /save back/i });
        await waitFor(() => expect(saveBtn).not.toBeDisabled());

        // Rotate the page AFTER placing the text — mirrors the exact
        // sequence the adversarial review reproduced live. Without the R1
        // fix, the annotation's stored `rotation` stays at the STALE value
        // (0, from placement time) while the page's real /Rotate is now 90,
        // so pdfBake.ts's counter-rotation no longer cancels the page
        // rotation and the baked text reads sideways.
        fireEvent.click(await screen.findByTitle('Rotate CW'));
        await waitFor(() => expect(saveBtn).not.toBeDisabled());

        fireEvent.click(saveBtn);
        await waitFor(() => expect(putBodies.length).toBe(1));

        const filePart = putBodies[0].get('file') as Blob;
        const bakedBytes = new Uint8Array(await filePart.arrayBuffer());

        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const doc = await pdfjs.getDocument({ data: bakedBytes.slice(), disableWorker: true } as never).promise;
        const page = await doc.getPage(1);
        expect(page.rotate).toBe(90);
        const viewport = page.getViewport({ scale: 1 }); // uses page.rotate (90) by default
        const textContent = await page.getTextContent();
        const item = textContent.items.find((i: any) => 'str' in i && i.str === 'HELLO') as { transform: number[] } | undefined;
        expect(item).toBeDefined();

        const combined = composeTransforms(item!.transform, viewport.transform);
        const angleDeg = (Math.atan2(combined[1], combined[0]) * 180) / Math.PI;
        const normalized = ((angleDeg % 360) + 360) % 360;
        const distanceFromUpright = Math.min(normalized, 360 - normalized);
        expect(distanceFromUpright).toBeLessThan(1);
    });

    it('R7: rotating a page renders it exactly once, not twice (adversarial review of item7-load-lifecycle — concurrent canvas render race)', async () => {
        render(<DocViewer />);
        const select = await screen.findByRole('combobox');
        fireEvent.change(select, { target: { value: FILE.id } });

        const rotateBtn = await screen.findByTitle('Rotate CW');
        await waitFor(() => expect(pageRenderCalls).toBeGreaterThan(0));
        const before = pageRenderCalls;

        fireEvent.click(rotateBtn);
        await waitFor(() => expect(pageRenderCalls).toBeGreaterThan(before));
        // Give any extra (incorrect) concurrent render a chance to fire too.
        await new Promise(r => setTimeout(r, 0));
        expect(pageRenderCalls - before).toBe(1);
    });
});
