/**
 * P2 item 12: usePdfDocument loads pdf.js through the shared, already-tested
 * `loadPdfjs()` vendor in `PDFGear/pdfRaster.ts` (which wires the worker via
 * `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)`) instead of
 * wiring its own `https://cdnjs.cloudflare.com/...` worker URL — removes the
 * CDN dependency (offline/CSP exposure, audit #20).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePdfDocument } from '../components/DocViewer/usePdfDocument';

const workerOptions: { workerSrc?: string } = {};

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: workerOptions,
    version: 'test',
    getDocument: () => ({ promise: Promise.resolve({ numPages: 1, destroy: async () => {} }) }),
}));

describe('usePdfDocument pdf.js worker wiring', () => {
    beforeEach(() => {
        workerOptions.workerSrc = undefined;
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        })));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('wires the worker through the bundled pdf.worker.mjs URL, never a cdnjs CDN URL', async () => {
        const { result } = renderHook(() => usePdfDocument());
        await act(async () => {
            await result.current.load('http://example.test/doc.pdf');
        });

        expect(workerOptions.workerSrc).toBeDefined();
        expect(workerOptions.workerSrc).not.toMatch(/cdnjs\.cloudflare\.com/);
        expect(workerOptions.workerSrc).toMatch(/pdf\.worker\.mjs/);
    });
});
