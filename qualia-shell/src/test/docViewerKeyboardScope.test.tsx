/**
 * P1 item 9 (audit #9: the global `window` keydown handler hijacked Cmd+Z
 * inside the text textarea and blocked native undo there). The listener is
 * now scoped to the viewer root and ignores the shortcut whenever the event
 * target is an input/textarea/select/contenteditable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DocViewer from '../components/DocViewer/DocViewer';

const FILE = { id: 'k1', name: 'contract.pdf', type: 'pdf' };

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

describe('DocViewer Cmd/Ctrl+Z is scoped to the viewer, not window (P1 item 9)', () => {
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

    it('Cmd+Z inside an input does not undo and is not preventDefault-ed; Cmd+Z on the viewer does both', async () => {
        const { container } = render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });

        // Create one undoable annotation via the highlight tool.
        fireEvent.click(await screen.findByTitle('Highlight'));
        const overlay = container.querySelector('.dv-overlay-canvas')!;
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 1 });
        fireEvent.pointerUp(overlay, { clientX: 60, clientY: 40, pointerId: 1 });

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        await waitFor(() => expect(undoBtn).not.toBeDisabled());

        // The page-number input is a real <input> in the SAME viewer tree —
        // Cmd+Z fired there must be ignored entirely (not prevented, not undone).
        const pageInput = container.querySelector('.dv-toolbar__page-input') as HTMLInputElement;
        expect(pageInput).toBeTruthy();
        const notPrevented = fireEvent.keyDown(pageInput, { key: 'z', metaKey: true, bubbles: true });
        expect(notPrevented).toBe(true); // fireEvent returns true when NOT defaultPrevented
        expect(undoBtn).not.toBeDisabled(); // still nothing undone

        // Cmd+Z anywhere else in the viewer DOES undo (and preventDefault).
        const prevented = fireEvent.keyDown(container.querySelector('.doc-viewer')!, { key: 'z', metaKey: true, bubbles: true });
        expect(prevented).toBe(false); // fireEvent returns false when defaultPrevented
        await waitFor(() => expect(undoBtn).toBeDisabled());
    });

    it('R5 (adversarial review of P1 item 9): Cmd+Z still undoes after focus falls back to <body> following a click on the non-focusable overlay canvas', async () => {
        const { container } = render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });

        fireEvent.click(await screen.findByTitle('Highlight'));
        const overlay = container.querySelector('.dv-overlay-canvas')!;
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 1 });
        fireEvent.pointerUp(overlay, { clientX: 60, clientY: 40, pointerId: 1 });

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        await waitFor(() => expect(undoBtn).not.toBeDisabled());

        // Simulate the browser's real behavior of dropping focus to <body>
        // after a mousedown/pointerdown on a non-focusable element (a plain
        // <canvas>, like the overlay above) — clicking a focusable button
        // then blurring it (with nothing else to take focus) lands focus on
        // <body>, same end state.
        const highlightBtn = screen.getByTitle('Highlight');
        (highlightBtn as HTMLElement).focus();
        (highlightBtn as HTMLElement).blur();
        expect(document.activeElement).toBe(document.body);

        // A pointerdown on the overlay reclaims focus onto the (tabIndex=-1,
        // programmatically-focusable) viewer root — R5's fix. Without it,
        // focus stays on <body>, a real keydown there never bubbles into
        // `.doc-viewer` (body is an ANCESTOR of it, not a descendant), and
        // Cmd+Z would silently do nothing.
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 2 });
        expect(document.activeElement).toBe(container.querySelector('.doc-viewer'));
        fireEvent.pointerUp(overlay, { clientX: 10, clientY: 10, pointerId: 2 });

        fireEvent.keyDown(document.activeElement!, { key: 'z', metaKey: true, bubbles: true });
        await waitFor(() => expect(undoBtn).toBeDisabled());
    });
});
