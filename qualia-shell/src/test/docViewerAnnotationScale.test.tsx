/**
 * R2/R3 (adversarial review of P1 item 6, findings #3/#14): renderOverlay
 * converts annotation POSITIONS through pdfCoords (which already accounts for
 * the live viewport's scale), but every drawn SIZE — font size, stroke width,
 * arrowhead length, stamp padding — used the Annotation's own raw value with
 * no equivalent `* viewport.scale`, so annotations stopped growing/shrinking
 * with the page at non-default zoom (pre-P1 this was `* (zoom * 1.5)`, which
 * got dropped instead of replaced). This pins that at a non-1 viewport scale,
 * a committed text annotation's font size and a committed draw stroke's line
 * width both come out multiplied by that scale.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DocViewer from '../components/DocViewer/DocViewer';

const FILE = { id: 'sc1', name: 'scaled.pdf', type: 'pdf' };
const VIEWPORT_SCALE = 2; // simulates a zoomed-in page.getViewport({ scale }).scale

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

let overlayCtx: ReturnType<typeof fakeCanvasContext>;
let baseCtx: ReturnType<typeof fakeCanvasContext>;

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: () => ({
        promise: Promise.resolve({
            numPages: 1,
            destroy: () => {},
            getPage: async () => ({
                getViewport: () => ({
                    width: 300, height: 300, scale: VIEWPORT_SCALE, rotation: 0,
                    convertToViewportPoint: (x: number, y: number) => [x, y],
                    convertToPdfPoint: (x: number, y: number) => [x, y],
                }),
                render: () => ({ promise: Promise.resolve() }),
                getTextContent: async () => ({ items: [] }),
            }),
        }),
    }),
}));

function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
}

describe('DocViewer annotation render sizes scale with viewport.scale (adversarial review of item6-coordinates)', () => {
    beforeEach(() => {
        overlayCtx = fakeCanvasContext();
        baseCtx = fakeCanvasContext();
        HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
            return this.classList.contains('dv-overlay-canvas') ? overlayCtx : baseCtx;
        }) as never;
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [FILE] });
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as unknown as Response;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        }));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('a committed text annotation\'s font size and a committed draw stroke\'s line width are multiplied by viewport.scale', async () => {
        const { container } = render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });

        // Place a 16pt text annotation — committed font should read
        // `${16 * VIEWPORT_SCALE}px`. P2 item 13 (a11y): the 'text' tool no
        // longer uses window.prompt() — pointer-up opens an inline,
        // ref-focused field (aria-label "New text annotation") that commits
        // on Enter.
        fireEvent.click(await screen.findByTitle('Add Text'));
        const overlay = container.querySelector('.dv-overlay-canvas')!;
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 1 });
        fireEvent.pointerUp(overlay, { clientX: 10, clientY: 10, pointerId: 1 });
        const textInput = await screen.findByLabelText('New text annotation');
        fireEvent.change(textInput, { target: { value: 'HI' } });
        fireEvent.keyDown(textInput, { key: 'Enter' });
        await waitFor(() => expect(overlayCtx.font).toContain(`${16 * VIEWPORT_SCALE}px`));

        // Draw a freehand stroke at the default size (3) — committed
        // lineWidth should read `3 * VIEWPORT_SCALE`.
        fireEvent.click(await screen.findByTitle('Freehand Draw'));
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 2 });
        fireEvent.pointerMove(overlay, { clientX: 40, clientY: 10, pointerId: 2 });
        fireEvent.pointerMove(overlay, { clientX: 70, clientY: 40, pointerId: 2 });
        fireEvent.pointerUp(overlay, { clientX: 70, clientY: 40, pointerId: 2 });
        await waitFor(() => expect(overlayCtx.lineWidth).toBe(3 * VIEWPORT_SCALE));
    });
});
