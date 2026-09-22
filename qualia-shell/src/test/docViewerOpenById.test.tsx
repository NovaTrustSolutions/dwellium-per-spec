/**
 * P1 item 8 (audit #7: open-by-id fails for files past the first 50 —
 * GET /api/files has no paging and the opener only did `files.find`) +
 * EXTRA N2 (a request consumed via the live event listener must ALSO clear
 * `window.__qualiaDocViewerPendingFile`, or a later remount's drain-pending
 * effect reopens the same stale request).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import DocViewer from '../components/DocViewer/DocViewer';

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

// 50 files — the backend's default `GET /api/files` page size (audit #7).
const FIRST_PAGE = Array.from({ length: 50 }, (_, i) => ({ id: `f${i + 1}`, name: `file${i + 1}.pdf`, type: 'pdf' }));
const FILE_51 = { id: 'f51', name: 'file51.pdf', type: 'pdf' };

function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
}

describe('DocViewer open-by-id past the first page of GET /api/files (P1 item 8)', () => {
    beforeEach(() => {
        (window as any).__qualiaDocViewerPendingFile = null;
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: FIRST_PAGE });
            }
            if (url.endsWith(`/api/files/${FILE_51.id}`) && method === 'GET') {
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

    it('opens the 51st file by id even though the list only has the first 50, and adds it to the dropdown', async () => {
        render(<DocViewer />);
        const select = await screen.findByRole('combobox') as HTMLSelectElement;
        await waitFor(() => expect(select.options.length).toBe(51)); // "Select a document..." + 50

        window.dispatchEvent(new CustomEvent('qualia-docviewer-open-file', { detail: { fileId: FILE_51.id, name: FILE_51.name } }));

        await waitFor(() => expect(select.value).toBe(FILE_51.id));
        expect(screen.getByText(FILE_51.name)).toBeTruthy();
    });

    it('clears window.__qualiaDocViewerPendingFile once the event listener consumes it (EXTRA N2)', async () => {
        render(<DocViewer />);
        const select = await screen.findByRole('combobox');
        await waitFor(() => expect((select as HTMLSelectElement).options.length).toBe(51));

        // Mirrors Desktop.tsx: it sets the pending slot as a cold-open
        // fallback AND dispatches the event for an already-mounted listener.
        (window as any).__qualiaDocViewerPendingFile = { fileId: FILE_51.id, name: FILE_51.name };
        window.dispatchEvent(new CustomEvent('qualia-docviewer-open-file', { detail: { fileId: FILE_51.id, name: FILE_51.name } }));

        await waitFor(() => expect((select as HTMLSelectElement).value).toBe(FILE_51.id));
        expect((window as any).__qualiaDocViewerPendingFile).toBeNull();
    });

    it('a remount after the pending slot was cleared does NOT reopen the stale request', async () => {
        const first = render(<DocViewer />);
        let select = await screen.findByRole('combobox');
        await waitFor(() => expect((select as HTMLSelectElement).options.length).toBe(51));

        (window as any).__qualiaDocViewerPendingFile = { fileId: FILE_51.id, name: FILE_51.name };
        window.dispatchEvent(new CustomEvent('qualia-docviewer-open-file', { detail: { fileId: FILE_51.id, name: FILE_51.name } }));
        await waitFor(() => expect((select as HTMLSelectElement).value).toBe(FILE_51.id));
        expect((window as any).__qualiaDocViewerPendingFile).toBeNull();

        first.unmount();
        render(<DocViewer />);
        select = await screen.findByRole('combobox');
        await waitFor(() => expect((select as HTMLSelectElement).options.length).toBeGreaterThan(1));
        // Give the drain-pending effect a tick to (not) fire.
        await new Promise(r => setTimeout(r, 0));
        expect((select as HTMLSelectElement).value).toBe(''); // "Select a document..." — nothing auto-opened
    });
});
