/**
 * R1 (adversarial review of P2 item 15 launcher unification, findings 1-5):
 * requestDocViewerOpen() redispatches its open event up to 6 times over
 * ~9.5s so a still-mounting Doc Viewer has several chances to catch it
 * (docViewerLauncher.ts). Because 'doc-viewer' is a singleton window
 * (WindowContext.tsx::openWindow re-focuses an existing window instead of
 * spawning a new one), DocViewer is normally ALREADY mounted and subscribed
 * for every dispatch after the first — including CommandPalette's, which
 * pre-unification used a single-shot dispatchDeferred() and never replayed.
 * Without a same-file guard, openFileFromPalette re-ran loadDocument ->
 * resetDocumentState on every replay of an ALREADY-OPEN file, silently
 * wiping any annotation/signature/text edit made in the meantime — a
 * P0-class data-loss regression. This pins the fix: a replayed open-file
 * event for the file that's already open is a no-op.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DocViewer from '../components/DocViewer/DocViewer';
import { DOCVIEWER_OPEN_EVENT } from '../lib/docViewerLauncher';

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

const FILE = { id: 'reopen1', name: 'reopen-me.pdf', type: 'pdf' };

function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
}

describe('DocViewer reopen guard (adversarial finding on P2 item 15 launcher unification)', () => {
    beforeEach(() => {
        (window as any).__qualiaDocViewerPendingFile = null;
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
        (window as any).__qualiaDocViewerPendingFile = null;
    });

    it('a replayed open-file event for the SAME already-open file does not wipe an in-progress annotation', async () => {
        const { container } = render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });
        fireEvent.click(await screen.findByTitle('Highlight'));

        const overlay = container.querySelector('.dv-overlay-canvas')!;
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'mouse' });
        fireEvent.pointerMove(overlay, { clientX: 50, clientY: 40, pointerId: 1, pointerType: 'mouse' });
        fireEvent.pointerUp(overlay, { clientX: 50, clientY: 40, pointerId: 1, pointerType: 'mouse' });

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        await waitFor(() => expect(undoBtn).not.toBeDisabled());

        // Simulate 3 of requestDocViewerOpen's redispatches for the SAME
        // file landing on the already-mounted, already-showing DocViewer —
        // exactly what happens when Desktop/CommandPalette reopen (or the
        // user re-clicks) a file that's already the focused singleton
        // window.
        for (let i = 0; i < 3; i++) {
            window.dispatchEvent(new CustomEvent(DOCVIEWER_OPEN_EVENT, { detail: { fileId: FILE.id, name: FILE.name } }));
        }
        // Let any (wrongly) re-triggered async loadDocument settle.
        await new Promise(r => setTimeout(r, 0));

        // The annotation must survive — a resetDocumentState() run on any
        // of those replays would have disabled Undo again.
        expect(screen.getByTitle('Undo (Ctrl+Z)')).not.toBeDisabled();
    });

    it('an open-file event for a DIFFERENT file still loads normally (guard is same-file only)', async () => {
        const OTHER = { id: 'reopen2', name: 'other.pdf', type: 'pdf' };
        vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [FILE, OTHER] });
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as unknown as Response;
            }
            if (url.endsWith(`/api/files/${OTHER.id}`) && method === 'GET') {
                return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer } as unknown as Response;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        });

        render(<DocViewer />);
        const select = await screen.findByRole('combobox') as HTMLSelectElement;
        fireEvent.change(select, { target: { value: FILE.id } });
        await waitFor(() => expect(select.value).toBe(FILE.id));

        window.dispatchEvent(new CustomEvent(DOCVIEWER_OPEN_EVENT, { detail: { fileId: OTHER.id, name: OTHER.name } }));

        await waitFor(() => expect(select.value).toBe(OTHER.id));
    });
});
