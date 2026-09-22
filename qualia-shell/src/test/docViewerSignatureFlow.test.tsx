/**
 * The signature pad → place → Save Back flow through the LIVE component, checked on the saved
 * bytes with the real pdf.js (legacy build). Found in the harness on 2026-09-22: the pad's
 * mouse-up handler queued `[...sigCurrentStroke.current]` inside a functional state updater and
 * then cleared the ref, so the stored strokes were empty — "Signature placed" appeared, nothing
 * was drawn, and nothing reached the PDF even once the bake handled signatures.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import DocViewer from '../components/DocViewer/DocViewer';

const FILE = { id: 's1', name: 'sign-me.pdf', type: 'pdf' };

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

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: () => ({
        promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
                getViewport: () => ({
                    width: 450, height: 450, scale: 1.5,
                    convertToViewportPoint: (x: number, y: number) => [x, y],
                    // P1 item 6: the overlay converts viewport-space pointer
                    // coords to PDF space at commit — the live component now
                    // needs BOTH conversion directions from the viewport.
                    convertToPdfPoint: (x: number, y: number) => [x, y],
                }),
                render: () => ({ promise: Promise.resolve() }),
                getTextContent: async () => ({ items: [] }),
            }),
        }),
    }),
}));

async function pathOpsOnPage1(bytes: Uint8Array): Promise<number> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: bytes.slice(), disableWorker: true } as never).promise;
    const ops = await (await doc.getPage(1)).getOperatorList();
    return ops.fnArray.filter((fn: number) => fn === pdfjs.OPS.constructPath).length;
}

describe('DocViewer signature: draw on the pad, place, Save Back', () => {
    let putBodies: FormData[];
    let blank: Uint8Array;

    beforeEach(async () => {
        putBodies = [];
        const doc = await PDFDocument.create();
        doc.addPage([300, 300]);
        blank = await doc.save();
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        vi.stubGlobal('confirm', vi.fn(() => true));
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return { ok: true, status: 200, json: async () => ({ success: true, data: [FILE] }) } as unknown as Response;
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                return { ok: true, status: 200, arrayBuffer: async () => blank.slice().buffer } as unknown as Response;
            }
            if (url.endsWith(`/api/files/${FILE.id}/content`) && method === 'PUT') {
                putBodies.push(init!.body as FormData);
                return { ok: true, status: 200, json: async () => ({ success: true, data: { file: FILE, savedPath: null } }) } as unknown as Response;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        }));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('the drawn strokes are stored, placed, and baked into the saved PDF', async () => {
        expect(await pathOpsOnPage1(blank)).toBe(0);

        const { container } = render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });
        fireEvent.click(await screen.findByTitle('Signature'));

        const pad = await waitFor(() => {
            const el = container.querySelector('.dv-sig-canvas');
            if (!el) throw new Error('pad not open');
            return el;
        });
        // P1 item 10: the pad/overlay only bind pointer events now.
        fireEvent.pointerDown(pad, { clientX: 20, clientY: 80, pointerId: 1 });
        fireEvent.pointerMove(pad, { clientX: 80, clientY: 30, pointerId: 1 });
        fireEvent.pointerMove(pad, { clientX: 160, clientY: 90, pointerId: 1 });
        fireEvent.pointerUp(pad, { pointerId: 1 });
        fireEvent.click(screen.getByRole('button', { name: /use signature/i }));

        const overlay = container.querySelector('.dv-overlay-canvas')!;
        fireEvent.pointerDown(overlay, { clientX: 60, clientY: 60, pointerId: 2 });
        fireEvent.pointerUp(overlay, { clientX: 60, clientY: 60, pointerId: 2 });

        const save = screen.getByRole('button', { name: /save back/i });
        await waitFor(() => expect(save).not.toBeDisabled());
        fireEvent.click(save);
        await waitFor(() => expect(putBodies.length).toBe(1));

        const saved = new Uint8Array(await (putBodies[0].get('file') as Blob).arrayBuffer());
        // One stroke of 3 points = 2 line segments, each its own path.
        expect(await pathOpsOnPage1(saved)).toBe(2);
    });
});
