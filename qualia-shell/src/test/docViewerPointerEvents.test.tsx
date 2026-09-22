/**
 * P1 item 10 (audit #12: mouse-only input — overlay and signature pad bound
 * `onMouse*` only, so no signing on tablets). Both now bind
 * onPointerDown/Move/Up/Cancel; this pins that a `pointerType: 'touch'`
 * sequence places a highlight on the overlay and records a stroke on the pad
 * — a regression that switching back to onMouse* handlers would reintroduce
 * (a touch pointerdown/up does not also fire mousedown/mouseup in a real
 * browser).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DocViewer from '../components/DocViewer/DocViewer';

const FILE = { id: 'pt1', name: 'touch-me.pdf', type: 'pdf' };

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
            destroy: () => {},
            getPage: async () => ({
                getViewport: () => ({
                    width: 300, height: 300, scale: 1,
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

describe('DocViewer pointer events (touch) — overlay + signature pad (P1 item 10)', () => {
    beforeEach(() => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
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

    it('a touch pointerdown/up on the overlay places a highlight (Undo enables)', async () => {
        const { container } = render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });
        fireEvent.click(await screen.findByTitle('Highlight'));

        const overlay = container.querySelector('.dv-overlay-canvas')!;
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 7, pointerType: 'touch' });
        fireEvent.pointerMove(overlay, { clientX: 50, clientY: 40, pointerId: 7, pointerType: 'touch' });
        fireEvent.pointerUp(overlay, { clientX: 50, clientY: 40, pointerId: 7, pointerType: 'touch' });

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        await waitFor(() => expect(undoBtn).not.toBeDisabled());
    });

    it('R6 (adversarial review of P1 item 10): a second concurrent pointer contact on the overlay is ignored — it does not steal the in-progress draw', async () => {
        // A single SHARED context per canvas (routed by class name) so we
        // can inspect what the FINAL committed-annotation render actually
        // drew — the default per-call `getContext` factory used elsewhere in
        // this file returns a fresh (unobservable) object every call.
        const overlayCtx = fakeCanvasContext();
        const baseCtx = fakeCanvasContext();
        HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
            return this.classList.contains('dv-overlay-canvas') ? overlayCtx : baseCtx;
        }) as never;

        const { container } = render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });
        fireEvent.click(await screen.findByTitle('Freehand Draw'));

        const overlay = container.querySelector('.dv-overlay-canvas')!;
        // Pointer 1 starts a stroke at (10,10)->(40,10).
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch' });
        fireEvent.pointerMove(overlay, { clientX: 40, clientY: 10, pointerId: 1, pointerType: 'touch' });

        // A second contact (e.g. a palm graze) lands mid-drag at a very
        // different position — WITHOUT the guard this OVERWRITES
        // drawStart/currentPath, so pointer 1's stroke is lost and a
        // completely different (200,200)->(250,250) stroke commits instead.
        fireEvent.pointerDown(overlay, { clientX: 200, clientY: 200, pointerId: 2, pointerType: 'touch' });
        fireEvent.pointerMove(overlay, { clientX: 250, clientY: 250, pointerId: 2, pointerType: 'touch' });
        fireEvent.pointerUp(overlay, { clientX: 250, clientY: 250, pointerId: 2, pointerType: 'touch' });

        // Pointer 1 continues and finishes at (70,40) — its own stroke
        // should be the one that commits.
        fireEvent.pointerMove(overlay, { clientX: 70, clientY: 40, pointerId: 1, pointerType: 'touch' });
        fireEvent.pointerUp(overlay, { clientX: 70, clientY: 40, pointerId: 1, pointerType: 'touch' });

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        await waitFor(() => expect(undoBtn).not.toBeDisabled());

        // The mocked viewport's convertToPdfPoint/convertToViewportPoint are
        // both identity, so the committed annotation's points round-trip
        // back to the SAME pixel coordinates it was drawn at — the final
        // renderOverlay pass's moveTo/lineTo calls read pointer 1's own
        // (10,10)/(70,40)-ish path, never pointer 2's (200,200)/(250,250).
        const moveToArgs = overlayCtx.moveTo.mock.calls.map((c: number[]) => c.join(','));
        const lineToArgs = overlayCtx.lineTo.mock.calls.map((c: number[]) => c.join(','));
        expect(moveToArgs).toContain('10,10');
        expect(lineToArgs.some((a: string) => a.startsWith('70,'))).toBe(true);
        expect(moveToArgs).not.toContain('200,200');
        expect(lineToArgs).not.toContain('250,250');
    });

    it('R6: a second concurrent pointer contact on the signature pad is ignored while the first is still drawing', async () => {
        const sigCtx = fakeCanvasContext();
        const otherCtx = fakeCanvasContext();
        HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
            return this.classList.contains('dv-sig-canvas') ? sigCtx : otherCtx;
        }) as never;

        const { container } = render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });
        fireEvent.click(await screen.findByTitle('Signature'));

        const pad = await waitFor(() => {
            const el = container.querySelector('.dv-sig-canvas');
            if (!el) throw new Error('pad not open');
            return el;
        });
        fireEvent.pointerDown(pad, { clientX: 20, clientY: 80, pointerId: 9, pointerType: 'touch' });
        fireEvent.pointerMove(pad, { clientX: 80, clientY: 30, pointerId: 9, pointerType: 'touch' });

        // A second contact mid-stroke, at a very different position — must
        // be ignored entirely. WITHOUT the guard, handleSigPointerDown
        // unconditionally resets sigCurrentStroke to this pointer's own
        // position, discarding pointer 9's in-progress stroke.
        fireEvent.pointerDown(pad, { clientX: 400, clientY: 5, pointerId: 11, pointerType: 'touch' });
        fireEvent.pointerMove(pad, { clientX: 450, clientY: 5, pointerId: 11, pointerType: 'touch' });
        fireEvent.pointerUp(pad, { clientX: 450, clientY: 5, pointerId: 11, pointerType: 'touch' });

        // Pointer 9 continues and finishes its own stroke.
        fireEvent.pointerMove(pad, { clientX: 160, clientY: 90, pointerId: 9, pointerType: 'touch' });
        fireEvent.pointerUp(pad, { pointerId: 9, pointerType: 'touch' });

        const lineToArgs = sigCtx.lineTo.mock.calls.map((c: number[]) => c.join(','));
        expect(lineToArgs).toContain('80,30'); // pointer 9's own path drew
        expect(lineToArgs).not.toContain('450,5'); // pointer 11 never touched the canvas
    });

    it('a touch pointerdown/move/up on the signature pad records a stroke', async () => {
        const { container } = render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });
        fireEvent.click(await screen.findByTitle('Signature'));

        const pad = await waitFor(() => {
            const el = container.querySelector('.dv-sig-canvas');
            if (!el) throw new Error('pad not open');
            return el;
        });
        fireEvent.pointerDown(pad, { clientX: 20, clientY: 80, pointerId: 9, pointerType: 'touch' });
        fireEvent.pointerMove(pad, { clientX: 80, clientY: 30, pointerId: 9, pointerType: 'touch' });
        fireEvent.pointerMove(pad, { clientX: 160, clientY: 90, pointerId: 9, pointerType: 'touch' });
        fireEvent.pointerUp(pad, { pointerId: 9, pointerType: 'touch' });

        // A recorded stroke enables "Use Signature" to actually place
        // something — confirm() dialog would follow if strokes were empty
        // ("Please draw your signature first" toast instead of closing).
        fireEvent.click(screen.getByRole('button', { name: /use signature/i }));
        await waitFor(() => expect(container.querySelector('.dv-modal-overlay')).toBeNull());
    });
});
