/**
 * P3 item 16c: real page thumbnails, rendered lazily (only pages
 * requested), cached, and invalidated when the document's bytes change.
 * Unit-tests the hook directly against a fake pdf.js page, plus a
 * PageSidebar/DocViewer regression pass proving the P2b rail behavior
 * (real <button>s, aria-current, data-page) survives.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { usePageThumbnails } from '../components/DocViewer/usePageThumbnails';
import DocViewer from '../components/DocViewer/DocViewer';
import { PDFDocument } from 'pdf-lib';
import type { PdfDocLike } from '../components/DocViewer/usePdfDocument';

function fakeCanvasContext() {
    return {
        clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), strokeRect: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
        save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), ellipse: vi.fn(),
        measureText: vi.fn(() => ({ width: 10 })), setTransform: vi.fn(), setLineDash: vi.fn(),
        fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', font: '', globalAlpha: 1,
    };
}

describe('usePageThumbnails (hook)', () => {
    beforeEach(() => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
    });
    afterEach(() => {
        // renderHook mounts a real (hidden) React tree — without an explicit
        // cleanup() here it stays mounted (and its effects pending) into the
        // NEXT test, which was observed to intermittently perturb the timing
        // of the later component-level tests below in this same file.
        cleanup();
        vi.restoreAllMocks();
    });

    function fakePdfDoc(getPageSpy: ReturnType<typeof vi.fn>): PdfDocLike {
        return {
            numPages: 3,
            destroy: () => {},
            getPage: getPageSpy,
        } as unknown as PdfDocLike;
    }

    function fakePage() {
        return {
            getViewport: ({ scale }: { scale: number }) => ({ width: 200 * scale, height: 300 * scale, scale }),
            render: () => ({ promise: Promise.resolve() }),
        };
    }

    it('renders a thumbnail lazily on request and caches it (no re-render on a second request)', async () => {
        const getPageSpy = vi.fn(async () => fakePage());
        const { result } = renderHook(() => usePageThumbnails({ pdfDoc: fakePdfDoc(getPageSpy), bytesVersion: 'v1' }));

        expect(result.current.getThumbnail(1)).toBeNull();
        act(() => result.current.requestThumbnail(1));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.getThumbnail(1)).toBe('data:image/png;base64,mock');

        act(() => result.current.requestThumbnail(1)); // already cached
        await act(async () => { await Promise.resolve(); });
        expect(getPageSpy).toHaveBeenCalledTimes(1); // only rendered once
    });

    it('does not render pages that were never requested', async () => {
        const getPageSpy = vi.fn(async () => fakePage());
        const { result } = renderHook(() => usePageThumbnails({ pdfDoc: fakePdfDoc(getPageSpy), bytesVersion: 'v1' }));
        act(() => result.current.requestThumbnail(1));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.getThumbnail(2)).toBeNull();
        expect(result.current.getThumbnail(3)).toBeNull();
        expect(getPageSpy).toHaveBeenCalledTimes(1);
        expect(getPageSpy).toHaveBeenCalledWith(1);
    });

    it('a concurrent second request for the same still-rendering page does not re-render it', async () => {
        let resolveRender: () => void = () => {};
        const getPageSpy = vi.fn(async () => ({
            getViewport: ({ scale }: { scale: number }) => ({ width: 200 * scale, height: 300 * scale, scale }),
            render: () => ({ promise: new Promise<void>(res => { resolveRender = res; }) }),
        }));
        const { result } = renderHook(() => usePageThumbnails({ pdfDoc: fakePdfDoc(getPageSpy), bytesVersion: 'v1' }));

        act(() => result.current.requestThumbnail(1));
        await act(async () => { await Promise.resolve(); }); // getPage resolves, render() in flight
        act(() => result.current.requestThumbnail(1)); // still in flight — must be a no-op
        expect(getPageSpy).toHaveBeenCalledTimes(1);

        resolveRender();
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.getThumbnail(1)).toBe('data:image/png;base64,mock');
    });

    it('invalidates the whole cache when bytesVersion changes', async () => {
        const getPageSpy = vi.fn(async () => fakePage());
        const { result, rerender } = renderHook(
            (props: { v: string }) => usePageThumbnails({ pdfDoc: fakePdfDoc(getPageSpy), bytesVersion: props.v }),
            { initialProps: { v: 'v1' } },
        );
        act(() => result.current.requestThumbnail(1));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.getThumbnail(1)).not.toBeNull();

        rerender({ v: 'v2' }); // e.g. a rotate/insert/delete changed the bytes
        expect(result.current.getThumbnail(1)).toBeNull(); // stale thumbnail dropped

        act(() => result.current.requestThumbnail(1));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.getThumbnail(1)).not.toBeNull();
        expect(getPageSpy).toHaveBeenCalledTimes(2); // re-rendered after invalidation
    });

    it('a render failure leaves the thumbnail unavailable rather than throwing', async () => {
        const getPageSpy = vi.fn(async () => { throw new Error('boom'); });
        const { result } = renderHook(() => usePageThumbnails({ pdfDoc: fakePdfDoc(getPageSpy), bytesVersion: 'v1' }));
        act(() => result.current.requestThumbnail(1));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.getThumbnail(1)).toBeNull();
    });

    it('R8: a render still in flight when bytesVersion invalidates the cache discards its (stale) result instead of writing it into the fresh cache', async () => {
        let resolveRender: () => void = () => {};
        const getPageSpy = vi.fn(async () => ({
            getViewport: ({ scale }: { scale: number }) => ({ width: 200 * scale, height: 300 * scale, scale }),
            render: () => ({ promise: new Promise<void>(res => { resolveRender = res; }) }),
        }));
        const { result, rerender } = renderHook(
            (props: { v: string }) => usePageThumbnails({ pdfDoc: fakePdfDoc(getPageSpy), bytesVersion: props.v }),
            { initialProps: { v: 'v1' } },
        );

        act(() => result.current.requestThumbnail(1));
        await act(async () => { await Promise.resolve(); }); // getPage resolves; render() now in flight

        // The bytes change (e.g. a rotate) BEFORE that render finishes.
        rerender({ v: 'v2' });
        expect(result.current.getThumbnail(1)).toBeNull();

        // The stale (pre-edit) render now completes.
        resolveRender();
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });

        // Its result must NOT have landed in the (post-invalidation) cache.
        expect(result.current.getThumbnail(1)).toBeNull();
    });
});

// ---- Regression: PageSidebar/DocViewer rail behavior from P2b ----

const FILE = { id: 'thumb1', name: 'three-pages.pdf', type: 'pdf' };

// R6/R8 pinning tests need to observe getPage() call counts (proving a
// thumbnail re-renders after an edit invalidates the cache, and never
// double-counts a discarded stale render) — a module-scoped spy, created via
// vi.hoisted so it's available inside the hoisted vi.mock factory below.
const { thumbGetPageSpy } = vi.hoisted(() => ({ thumbGetPageSpy: vi.fn() }));

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: (src: unknown) => {
        const data = (src as { data?: Uint8Array })?.data;
        if (data?.buffer) structuredClone(data.buffer, { transfer: [data.buffer] });
        return {
            promise: Promise.resolve({
                numPages: 3,
                destroy: () => {},
                getPage: async (page: number) => {
                    thumbGetPageSpy(page);
                    return {
                        getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({
                            width: 300 * scale, height: 300 * scale, scale, rotation: 0,
                            convertToViewportPoint: (x: number, y: number) => [x, y],
                            convertToPdfPoint: (x: number, y: number) => [x, y],
                        }),
                        render: () => ({ promise: Promise.resolve() }),
                        getTextContent: async () => ({ items: [] }),
                    };
                },
            }),
        };
    },
}));

async function makeThreePagePdfBytes(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]); doc.addPage([300, 300]); doc.addPage([300, 300]);
    return doc.save();
}

function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
}

describe('PageSidebar rail regression (P2b behavior preserved) + P3 16c lazy render', () => {
    beforeEach(() => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/api/files')) return jsonResponse({ success: true, data: [FILE] });
            if (url.endsWith(`/api/files/${FILE.id}`)) {
                const bytes = await makeThreePagePdfBytes();
                return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as unknown as Response;
            }
            if (url.includes(`/api/files/${FILE.id}/annotations`)) {
                return { ok: false, status: 404, json: async () => ({ success: false, error: 'No draft' }) } as unknown as Response;
            }
            throw new Error(`unexpected fetch: ${url}`);
        }));
        cleanup();
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('renders a real <button> per page with data-page/aria-label/aria-current, and clicking still navigates', async () => {
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });

        const p1 = await screen.findByLabelText('Page 1');
        expect(p1.tagName).toBe('BUTTON');
        expect(p1).toHaveAttribute('data-page', '1');
        expect(p1).toHaveAttribute('aria-current', 'true');

        const p2 = screen.getByLabelText('Page 2');
        expect(p2).not.toHaveAttribute('aria-current');
        fireEvent.click(p2);
        await waitFor(() => expect((screen.getByLabelText('Current page') as HTMLInputElement).value).toBe('2'));
        await waitFor(() => expect(screen.getByLabelText('Page 2')).toHaveAttribute('aria-current', 'true'));
    });

    it('the currently-open page gets a real rendered thumbnail (an <img>) without the whole rail rendering up front', async () => {
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });

        // A generous timeout here: under a full parallel test-suite run this
        // component stacks several async effects (pdf load, drafts GET,
        // search index, thumbnail render) on top of each other — the
        // underlying behavior is ALSO pinned directly (with no timing
        // sensitivity) by the usePageThumbnails hook tests above.
        const p1 = await screen.findByLabelText('Page 1', {}, { timeout: 5000 });
        await waitFor(() => expect(p1.querySelector('img.dv-nav__thumb-img')).toBeTruthy(), { timeout: 5000 });
        expect(p1.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,mock');
    });

    // ---- R7/R10/R12/R14/R15 (adversarial review) ----
    it('R7: the visible "p.N" label survives a rendered thumbnail (never replaced by an aria-hidden <img> alone)', async () => {
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });

        const p1 = await screen.findByLabelText('Page 1', {}, { timeout: 5000 });
        await waitFor(() => expect(p1.querySelector('img.dv-nav__thumb-img')).toBeTruthy(), { timeout: 5000 });
        // The button's own visible text — not just its aria-label — still
        // reads "p.1" once the thumbnail image has rendered. This is what
        // this project's own live-browser regression scripts locate page
        // buttons by (a `.dv-nav button` filtered by visible text).
        expect(p1.textContent).toContain('p.1');
    });

    // ---- R6 (adversarial review) ----
    it('R6: a page whose thumbnail already rendered gets a fresh one after an edit invalidates the cache, instead of permanently falling back to text', async () => {
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });

        const p1 = await screen.findByLabelText('Page 1', {}, { timeout: 5000 });
        await waitFor(() => expect(p1.querySelector('img.dv-nav__thumb-img')).toBeTruthy(), { timeout: 5000 });

        // Rotate changes pdfBytes -> usePageThumbnails wipes its cache. The
        // already-mounted page-1 button (same component instance, same
        // `key={page}`) must ask for a fresh thumbnail rather than being
        // permanently stuck showing "p.1" as plain text from here on.
        fireEvent.click(await screen.findByTitle('Rotate CW'));

        // Must actually observe the invalidated (no image) state first —
        // asserting "truthy" alone would trivially pass against the STALE
        // pre-rotate <img>, which react hasn't removed yet at the instant
        // waitFor's synchronous first check runs.
        await waitFor(() => expect(p1.querySelector('img.dv-nav__thumb-img')).toBeNull(), { timeout: 5000 });
        await waitFor(() => expect(p1.querySelector('img.dv-nav__thumb-img')).toBeTruthy(), { timeout: 5000 });
    });
});
