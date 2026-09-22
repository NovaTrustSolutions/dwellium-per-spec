/**
 * P1 item 7 (audit #10 race on rapid file switch / #11 pdf.js docs never
 * destroyed) + EXTRA N1 (found live: opening a PDF never draws page 1).
 *
 * pdfjs-dist's getDocument() and the byte fetch are both DEFERRED per URL so
 * the test can control resolve order precisely — proving a slower EARLIER
 * load can never overwrite a newer one, and that its pdf.js doc gets
 * destroy()-ed instead of leaking.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DocViewer from '../components/DocViewer/DocViewer';

const FILE_A = { id: 'a1', name: 'alpha.pdf', type: 'pdf' };
const FILE_B = { id: 'b1', name: 'beta.pdf', type: 'pdf' };

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

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
}

let deferredDocs: Map<string, ReturnType<typeof deferred<any>>>;
let deferredFetches: Map<string, ReturnType<typeof deferred<Response>>>;
let destroyedIds: string[];
let renderCalls: number;

function getDeferredDoc(url: string) {
    if (!deferredDocs.has(url)) deferredDocs.set(url, deferred());
    return deferredDocs.get(url)!;
}
function getDeferredFetch(url: string) {
    if (!deferredFetches.has(url)) deferredFetches.set(url, deferred());
    return deferredFetches.get(url)!;
}

function makeFakeDoc(id: string, numPages: number) {
    return {
        numPages,
        destroy: () => { destroyedIds.push(id); },
        getPage: async () => ({
            getViewport: () => ({
                width: 300, height: 300, scale: 1,
                convertToViewportPoint: (x: number, y: number) => [x, y],
                convertToPdfPoint: (x: number, y: number) => [x, y],
            }),
            render: () => { renderCalls += 1; return { promise: Promise.resolve() }; },
            getTextContent: async () => ({ items: [] }),
        }),
    };
}

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: (src: unknown) => {
        // load(url) passes a plain URL string; replaceBytes passes {data}
        // (not exercised by this file) — key deferreds by the string form.
        const url = typeof src === 'string' ? src : JSON.stringify(src);
        return { promise: getDeferredDoc(url).promise };
    },
}));

/** Resolves BOTH the deferred pdf.js doc and the deferred byte fetch for
 * whichever in-flight request matches `file.id`. */
function resolveFile(file: { id: string }, numPages: number) {
    const key = [...deferredDocs.keys()].find(k => k.endsWith(`/api/files/${file.id}`))
        ?? [...deferredFetches.keys()].find(k => k.endsWith(`/api/files/${file.id}`));
    if (!key) throw new Error(`no in-flight request for ${file.id} yet`);
    getDeferredDoc(key).resolve(makeFakeDoc(file.id, numPages));
    getDeferredFetch(key).resolve({
        ok: true, status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response);
}

describe('DocViewer load lifecycle — sequence token + destroy() (P1 item 7)', () => {
    beforeEach(() => {
        deferredDocs = new Map();
        deferredFetches = new Map();
        destroyedIds = [];
        renderCalls = 0;
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return { ok: true, status: 200, json: async () => ({ success: true, data: [FILE_A, FILE_B] }) } as unknown as Response;
            }
            if ((url.endsWith(`/api/files/${FILE_A.id}`) || url.endsWith(`/api/files/${FILE_B.id}`)) && method === 'GET') {
                return getDeferredFetch(url).promise;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        }));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('open A then B; A resolves LAST — B wins (name/pages shown) and As pdf.js doc is destroyed', async () => {
        render(<DocViewer />);
        const select = await screen.findByRole('combobox');

        fireEvent.change(select, { target: { value: FILE_A.id } });
        await waitFor(() => expect([...deferredDocs.keys()].some(k => k.endsWith(FILE_A.id))).toBe(true));

        fireEvent.change(select, { target: { value: FILE_B.id } });
        await waitFor(() => expect([...deferredDocs.keys()].some(k => k.endsWith(FILE_B.id))).toBe(true));

        // B resolves first.
        resolveFile(FILE_B, 3);
        await waitFor(() => expect(screen.getByText('/ 3')).toBeTruthy());

        // A resolves AFTER B — it must be silently discarded and destroyed,
        // never overwriting B's now-displayed state.
        resolveFile(FILE_A, 1);
        await waitFor(() => expect(destroyedIds).toContain(FILE_A.id));

        // Give any (incorrect) stomping render a chance to happen, then
        // assert B is still what's shown.
        await new Promise(r => setTimeout(r, 0));
        expect(screen.getByText('/ 3')).toBeTruthy();
        expect(screen.queryByText('/ 1')).toBeNull();
        expect(destroyedIds).not.toContain(FILE_B.id);
    });
});

describe('DocViewer opening a PDF renders page 1 immediately (EXTRA N1)', () => {
    beforeEach(() => {
        deferredDocs = new Map();
        deferredFetches = new Map();
        destroyedIds = [];
        renderCalls = 0;
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return { ok: true, status: 200, json: async () => ({ success: true, data: [FILE_A] }) } as unknown as Response;
            }
            if (url.endsWith(`/api/files/${FILE_A.id}`) && method === 'GET') {
                return getDeferredFetch(url).promise;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        }));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('draws page 1 without the user navigating (canvas grows past the browser default 300x150)', async () => {
        const { container } = render(<DocViewer />);
        const select = await screen.findByRole('combobox');
        fireEvent.change(select, { target: { value: FILE_A.id } });
        await waitFor(() => expect([...deferredDocs.keys()].some(k => k.endsWith(FILE_A.id))).toBe(true));
        resolveFile(FILE_A, 1);

        // The mocked viewport is 300x300 — the browser default canvas is
        // 300x150. Only an ACTUAL render() call resizes it to 300x300 (N1:
        // it used to stay at the 300x150 default until the user navigated).
        await waitFor(() => {
            const canvas = container.querySelector('.dv-canvas-wrapper canvas') as HTMLCanvasElement;
            expect(canvas).toBeTruthy();
            expect(canvas.height).toBe(300);
        });
        expect(renderCalls).toBeGreaterThan(0);
    });

    it('a StrictMode-wrapped render also draws page 1', async () => {
        const { container } = render(
            <StrictMode><DocViewer /></StrictMode>,
        );
        const select = await screen.findByRole('combobox');
        fireEvent.change(select, { target: { value: FILE_A.id } });
        await waitFor(() => expect([...deferredDocs.keys()].some(k => k.endsWith(FILE_A.id))).toBe(true));
        resolveFile(FILE_A, 1);

        await waitFor(() => {
            const canvas = container.querySelector('.dv-canvas-wrapper canvas') as HTMLCanvasElement;
            expect(canvas).toBeTruthy();
            expect(canvas.height).toBe(300);
        });
    });
});

describe('DocViewer clears the stale canvas bitmap on file switch (R4, adversarial review of N1)', () => {
    beforeEach(() => {
        deferredDocs = new Map();
        deferredFetches = new Map();
        destroyedIds = [];
        renderCalls = 0;
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return { ok: true, status: 200, json: async () => ({ success: true, data: [FILE_A, FILE_B] }) } as unknown as Response;
            }
            if ((url.endsWith(`/api/files/${FILE_A.id}`) || url.endsWith(`/api/files/${FILE_B.id}`)) && method === 'GET') {
                return getDeferredFetch(url).promise;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        }));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('the canvas bitmap is cleared immediately on switching files, not left showing the previous file while the new one loads', async () => {
        const { container } = render(<DocViewer />);
        const select = await screen.findByRole('combobox');

        // Open + fully render file A first.
        fireEvent.change(select, { target: { value: FILE_A.id } });
        await waitFor(() => expect([...deferredDocs.keys()].some(k => k.endsWith(FILE_A.id))).toBe(true));
        resolveFile(FILE_A, 1);
        await waitFor(() => {
            const canvas = container.querySelector('.dv-canvas-wrapper canvas') as HTMLCanvasElement;
            expect(canvas.height).toBe(300);
        });

        // Switch to file B, but do NOT resolve it yet — the loading spinner
        // (translucent + blurred, not opaque) is up, and N1 deliberately
        // keeps the SAME canvas element mounted underneath it. Without R4,
        // that canvas still shows A's rendered page (300x300) bleeding
        // through the spinner; R4 clears the bitmap in resetDocumentState so
        // there is nothing stale to bleed through.
        fireEvent.change(select, { target: { value: FILE_B.id } });
        await waitFor(() => expect([...deferredDocs.keys()].some(k => k.endsWith(FILE_B.id))).toBe(true));

        const canvas = container.querySelector('.dv-canvas-wrapper canvas') as HTMLCanvasElement;
        expect(canvas.width).toBe(0);
        expect(canvas.height).toBe(0);
    });
});
