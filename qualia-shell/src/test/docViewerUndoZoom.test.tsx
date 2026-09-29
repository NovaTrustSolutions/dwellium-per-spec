/**
 * Pins R2 (adversarial review of P0 item 5): `applySnapshot` is a
 * `useCallback` keyed only on `currentPage`. Its `reloadPdfFromBytes` call
 * used to read `zoom` from JS closure, so an undo performed after a zoom
 * change (with no page change in between) re-rendered the restored page at
 * the STALE zoom that was live when `applySnapshot` was last recreated,
 * racing the page-render effect that reads the live zoom. The fix reads the
 * live zoom off a ref instead of the closure.
 *
 * Reuses the mocked-pdfjs-dist + real-pdf-lib-bytes + no-op-canvas-context
 * pattern from docViewerSaveGating.test.tsx. `getViewport` is a spy so the
 * test can inspect the `scale` each render pass actually used.
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

// Only the MAIN (visible, DOM-attached) canvas render's scale is tracked —
// P3 16c's page thumbnails legitimately call getViewport/render too (their
// own, unrelated-to-zoom thumbnail scale, on an offscreen
// `document.createElement('canvas')` that's never attached to the DOM), so
// recording from getViewport() itself would pollute this array with
// thumbnail scales having nothing to do with the zoom bug this test pins.
// `canvas.isConnected` (checked at render() time, once BOTH the canvas and
// its viewport/scale are known) tells the two apart.
const getViewportScales: number[] = [];

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: () => ({
        promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
                getViewport: ({ scale }: { scale: number }) => (
                    { width: 300, height: 300, scale, convertToViewportPoint: (x: number, y: number) => [x, y] }
                ),
                render: (renderOpts: { canvas?: HTMLCanvasElement; viewport?: { scale: number } }) => {
                    if (renderOpts?.canvas?.isConnected && renderOpts.viewport) {
                        getViewportScales.push(renderOpts.viewport.scale);
                    }
                    return { promise: Promise.resolve() };
                },
                getTextContent: async () => ({ items: [] }),
            }),
        }),
    }),
}));

async function makeRealPdfBytes(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    return doc.save();
}

function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
}

describe('DocViewer undo after a zoom change (no page change)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let resolveBytes: ((r: Response) => void) | null;

    beforeEach(() => {
        getViewportScales.length = 0;
        vi.stubGlobal('HTMLCanvasElement', HTMLCanvasElement);
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        resolveBytes = null;
        fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [FILE] });
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                return new Promise<Response>(resolve => { resolveBytes = resolve; });
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

    it('renders the restored page at the CURRENT zoom, not the zoom from when applySnapshot was last created', async () => {
        render(<DocViewer />);
        const select = await screen.findByRole('combobox');
        fireEvent.change(select, { target: { value: FILE.id } });

        await waitFor(() => expect(resolveBytes).not.toBeNull());
        const bytes = await makeRealPdfBytes();
        resolveBytes!({
            ok: true,
            status: 200,
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        } as unknown as Response);

        // Byte-changing mutation so there's something to undo — currentPage
        // does not change (still page 1), so applySnapshot's memoized
        // closure is NOT recreated by this step either.
        const insertBtn = await screen.findByTitle('Insert Blank Page');
        fireEvent.click(insertBtn);
        await waitFor(() => expect(getViewportScales.length).toBeGreaterThan(0));
        // Let every render pass insertPage kicked off (its own
        // reloadPdfFromBytes call AND the pdfDoc-change effect) fully settle
        // before moving on, so none of their in-flight scale readings can
        // land in the window we inspect below.
        await new Promise(r => setTimeout(r, 50));

        // Zoom in — no page change, so applySnapshot (keyed on currentPage
        // only) is still the closure from before this zoom change.
        const zoomInBtn = document.querySelector('.dv-zoom__btn:last-of-type') as HTMLButtonElement;
        expect(zoomInBtn).toBeTruthy();
        fireEvent.click(zoomInBtn);
        await new Promise(r => setTimeout(r, 0));

        getViewportScales.length = 0; // only care about the render(s) triggered by undo below
        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        fireEvent.click(undoBtn);

        await waitFor(() => expect(getViewportScales.length).toBeGreaterThan(0));
        await new Promise(r => setTimeout(r, 50));
        // zoom went 1.0 -> 1.25; renderPage scales the viewport by * 1.5.
        // Every render triggered by the undo — both applySnapshot's own
        // reloadPdfFromBytes call and the pdfDoc-change effect — must use
        // the CURRENT zoom, never the stale 1.0 * 1.5 = 1.5.
        expect(getViewportScales.every(s => Math.abs(s - 1.25 * 1.5) < 1e-6)).toBe(true);
    });
});
