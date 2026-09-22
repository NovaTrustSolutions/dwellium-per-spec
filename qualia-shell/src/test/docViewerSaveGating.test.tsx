/**
 * Pins P0 item 3: Save Back is disabled until real pdfBytes are loaded (no
 * window where previewMode==='pdf' but pdfBytes is still null), disabled
 * when the document is clean (nothing to save), and a cancelled
 * window.confirm sends no PUT.
 *
 * jsdom has no canvas/pdf.js worker: pdfjs-dist is mocked with a tiny fake
 * doc, and HTMLCanvasElement.prototype.getContext is stubbed with a no-op
 * 2D context, per the plan's pattern. The bytes the mocked "network" fetch
 * returns are a REAL pdf-lib PDF so pdf-lib page-mutation code (insertPage)
 * still runs for real.
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

// R4: a hoisted, test-toggleable flag so the render-failure test (below)
// can make page.render() reject without a second vi.mock (only one
// 'pdfjs-dist' mock is allowed per file).
const { getFailRender, setFailRender } = vi.hoisted(() => {
    let fail = false;
    return { getFailRender: () => fail, setFailRender: (v: boolean) => { fail = v; } };
});

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: () => ({
        promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
                getViewport: () => ({ width: 300, height: 300, scale: 1, convertToViewportPoint: (x: number, y: number) => [x, y] }),
                render: () => ({ promise: getFailRender() ? Promise.reject(new Error('render boom')) : Promise.resolve() }),
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

describe('DocViewer PDF Save Back gating', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let resolveBytes: ((r: Response) => void) | null;

    beforeEach(() => {
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
                // Deferred: caller controls when the byte fetch resolves.
                return new Promise<Response>(resolve => { resolveBytes = resolve; });
            }
            if (url.endsWith(`/api/files/${FILE.id}/content`) && method === 'PUT') {
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

    async function openPdfFile() {
        render(<DocViewer />);
        const select = await screen.findByRole('combobox');
        fireEvent.change(select, { target: { value: FILE.id } });
    }

    it('Save Back does not appear while the byte fetch is pending, then appears disabled (clean) once loaded', async () => {
        await openPdfFile();

        // Still pending: no window where previewMode is 'pdf' but bytes are null —
        // structurally, the Save Back button cannot render yet.
        await new Promise(r => setTimeout(r, 0));
        expect(screen.queryByRole('button', { name: /save back/i })).toBeNull();

        const bytes = await makeRealPdfBytes();
        resolveBytes!({
            ok: true,
            status: 200,
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        } as unknown as Response);

        const saveBtn = await screen.findByRole('button', { name: /save back/i });
        expect(saveBtn).toBeDisabled();
        expect(saveBtn.getAttribute('title')).toMatch(/no changes to save/i);
    });

    it('a cancelled confirm sends no PUT', async () => {
        await openPdfFile();
        await waitFor(() => expect(resolveBytes).not.toBeNull());
        const bytes = await makeRealPdfBytes();
        resolveBytes!({
            ok: true,
            status: 200,
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        } as unknown as Response);

        // Dirty the document via a real page insert (pdf-lib mutation).
        const insertBtn = await screen.findByTitle('Insert Blank Page');
        fireEvent.click(insertBtn);

        const saveBtn = await screen.findByRole('button', { name: /save back/i });
        await waitFor(() => expect(saveBtn).not.toBeDisabled());

        vi.stubGlobal('confirm', vi.fn(() => false));
        fireEvent.click(saveBtn);

        await new Promise(r => setTimeout(r, 0));
        expect(fetchMock.mock.calls.some(c => String(c[0]).endsWith('/content'))).toBe(false);
    });
});

// R4 (adversarial review): the claim that a real page-render failure shows
// an honest `dv-canvas-error` banner instead of the old fabricated
// `renderDemoPage` ("MASTER SERVICES AGREEMENT") had zero test coverage.
// A regression that reintroduces a demo/fallback page, or makes the
// renderError path a silent no-op, would pass every other test in this
// suite.
describe('DocViewer PDF render failure — honest error, never fabricated content', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setFailRender(true);
        vi.stubGlobal('HTMLCanvasElement', HTMLCanvasElement);
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/api/files')) return jsonResponse({ success: true, data: [FILE] });
            if (url.endsWith(`/api/files/${FILE.id}`)) {
                return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(3) } as unknown as Response;
            }
            throw new Error(`unexpected fetch: ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        cleanup();
    });

    afterEach(() => {
        setFailRender(false);
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('shows the dv-canvas-error banner and never a fabricated document when page.render() throws', async () => {
        render(<DocViewer />);
        const select = await screen.findByRole('combobox');
        fireEvent.change(select, { target: { value: FILE.id } });

        const banner = await screen.findByText('This page could not be rendered.', {}, { timeout: 3000 });
        expect(banner.className).toBe('dv-canvas-error');
        expect(screen.queryByText(/MASTER SERVICES AGREEMENT/i)).toBeNull();
    });
});
