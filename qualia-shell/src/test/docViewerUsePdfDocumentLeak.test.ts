/**
 * R3/R4/R6 (adversarial review of P1 item 7, findings #4/#6/#10): usePdfDocument's
 * load() raced an un-cancellable pdfjs-dist getDocument().promise against an
 * AbortController-bound fetch via Promise.all. Aborting the fetch (which
 * destroy()/a newer load() does on every ordinary file switch) made Promise.all
 * reject via the fetch BEFORE the independent, still-parsing getDocument()
 * task necessarily settled — the catch block had no reference to the
 * eventual PDFDocumentProxy, so once it resolved in the background nothing
 * ever destroy()-ed it (a real pdf.js document + Worker leak on the single
 * most common lifecycle action).
 *
 * This test controls resolve order directly (deferred doc + deferred fetch,
 * per URL) rather than going through the whole DocViewer component and its
 * component-mocked fetch — the existing docViewerLoadLifecycle.test.tsx fetch
 * mock never wires AbortSignal to rejection, so it structurally cannot
 * exercise this interleaving (adversarial review finding #5).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePdfDocument } from '../components/DocViewer/usePdfDocument';

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

let deferredDoc: ReturnType<typeof deferred<any>>;
let destroyed: string[];

function makeFakeDoc(id: string) {
    return { numPages: 1, destroy: async () => { destroyed.push(id); } };
}

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: () => ({ promise: deferredDoc.promise }),
}));

describe('usePdfDocument.load() does not leak a pdf.js doc when the fetch is aborted before getDocument() settles', () => {
    beforeEach(() => {
        deferredDoc = deferred();
        destroyed = [];
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('destroy()-s the eventually-resolved doc when the raw-bytes fetch is aborted first', async () => {
        // fetch() honors AbortSignal for real, unlike the DocViewer component
        // tests' fetch mocks — this is the exact interleaving the leak needs.
        vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
            return new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    const err = new Error('The operation was aborted');
                    err.name = 'AbortError';
                    reject(err);
                });
            });
        }));

        const { result } = renderHook(() => usePdfDocument());

        // Kick off load() — do NOT await it (it won't settle until destroy()
        // aborts the fetch AND the deferred doc resolves).
        let loadPromise: Promise<unknown>;
        act(() => {
            loadPromise = result.current.load('/api/files/slow.pdf').catch(() => null);
        });
        await waitFor(() => expect(result.current.status).toBe('loading'));

        // Abort the in-flight fetch — mirrors resetDocumentState()'s
        // unconditional pdfLifecycle.destroy() on every file switch, which
        // happens while the SLOW file's pdf.js parse is still running.
        act(() => { result.current.destroy(); });

        // The pdf.js parse finishes AFTER the fetch already rejected —
        // exactly the interleaving the leak depends on. Promise.allSettled
        // (the fix) waits for BOTH to settle, so load()'s own promise only
        // resolves once this happens — resolve it before awaiting loadPromise.
        const fakeDoc = makeFakeDoc('slow');
        await act(async () => { deferredDoc.resolve(fakeDoc); });
        await loadPromise!;

        await waitFor(() => expect(destroyed).toContain('slow'));
    });
});
