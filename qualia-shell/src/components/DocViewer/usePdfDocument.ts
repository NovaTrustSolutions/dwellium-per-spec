/**
 * DocViewer — pdf.js document lifecycle (P1 item 7, audit findings #10/#11).
 *
 * A sequence token + AbortController mean a slower, earlier `load`/
 * `replaceBytes` call can never overwrite state a newer call already set —
 * it destroys whatever pdf.js document IT produced and backs out silently
 * instead. Every pdf.js document this hook creates is `destroy()`-ed the
 * moment it stops being the current one: on supersession, on `destroy()`
 * (file switch / unmount), and there is never a window with two live docs.
 */
import { useCallback, useRef, useState } from 'react';
import { loadPdfjs } from '../PDFGear/pdfRaster';
import type { PDFPageProxy } from 'pdfjs-dist';

export type PdfLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PdfDocLike {
    numPages: number;
    destroy?: () => void | Promise<void>;
    getPage: (n: number) => Promise<PDFPageProxy>;
}

export interface UsePdfDocument {
    doc: PdfDocLike | null;
    bytes: Uint8Array | null;
    numPages: number;
    status: PdfLoadStatus;
    error: string | null;
    /** Parses `url` with pdf.js AND fetches the raw bytes. Returns null if a
     * newer `load`/`replaceBytes`/`destroy` call superseded this one before
     * it finished — the caller should just stop, state has already moved on. */
    load: (url: string) => Promise<{ doc: PdfDocLike; bytes: Uint8Array } | null>;
    /** Re-parses after a local byte mutation (insert/delete/rotate/text-edit/
     * undo). Hands pdf.js a COPY — pdf.js detaches the buffer it parses, and
     * `next` is also what Save Back/Export bake from. */
    replaceBytes: (next: Uint8Array) => Promise<PdfDocLike | null>;
    /** Destroys the current pdf.js doc (if any) and resets all state —
     * file switch / unmount. */
    destroy: () => void;
}

export function usePdfDocument(): UsePdfDocument {
    const [doc, setDoc] = useState<PdfDocLike | null>(null);
    const [bytes, setBytes] = useState<Uint8Array | null>(null);
    const [numPages, setNumPages] = useState(0);
    const [status, setStatus] = useState<PdfLoadStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const seqRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const docRef = useRef<PdfDocLike | null>(null);

    const destroyDoc = useCallback((d: PdfDocLike | null | undefined) => {
        try { void d?.destroy?.(); } catch { /* already gone */ }
    }, []);

    const destroy = useCallback(() => {
        seqRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        destroyDoc(docRef.current);
        docRef.current = null;
        setDoc(null);
        setBytes(null);
        setNumPages(0);
        setStatus('idle');
        setError(null);
    }, [destroyDoc]);

    const load = useCallback(async (url: string) => {
        const mySeq = ++seqRef.current;
        abortRef.current?.abort();
        // R3/R4 (adversarial review of P1 item 7): pdfjs-dist's getDocument()
        // has NO AbortSignal of its own — only the raw-bytes `fetch` below is
        // abortable. The old code raced them with Promise.all, whose
        // all-or-nothing semantics meant that when a NEWER load()/
        // replaceBytes()/destroy() call aborted the fetch (which happens on
        // every ordinary file switch, since resetDocumentState() calls
        // destroy() unconditionally), Promise.all rejected via the fetch
        // immediately — discarding any reference to getDocument()'s own
        // still-running parse. When THAT eventually resolved in the
        // background, its PDFDocumentProxy (and Worker) had no reference
        // left to destroy() it: a real leak on the single most common
        // lifecycle action. Awaiting both via allSettled means we always get
        // a reference to a resolved doc — even one we're about to discard —
        // so it can be destroy()-ed instead of leaked.
        const controller = new AbortController();
        abortRef.current = controller;
        setStatus('loading');
        setError(null);
        try {
            // P2 item 12: pdf.js loaded through the existing loadPdfjs()
            // vendor (bundled worker via `new URL(..., import.meta.url)`)
            // instead of wiring a CDN worker URL here — removes the cdnjs
            // dependency (offline/CSP exposure, audit #20).
            const pdfjsLib = await loadPdfjs();
            const loadingTask = pdfjsLib.getDocument(url);
            const [docResult, bytesResult] = await Promise.allSettled([
                loadingTask.promise,
                fetch(url, { signal: controller.signal }).then(async response => {
                    if (!response.ok) throw new Error(`Could not load file bytes (${response.status})`);
                    return new Uint8Array(await response.arrayBuffer());
                }),
            ]);

            if (docResult.status === 'rejected') {
                if (mySeq !== seqRef.current) return null;
                setStatus('error');
                setError(docResult.reason instanceof Error ? docResult.reason.message : 'Failed to load PDF');
                throw docResult.reason;
            }
            const newDoc: PdfDocLike = docResult.value;

            if (bytesResult.status === 'rejected') {
                // We DID get a parsed doc, but can't use it (bytes failed or
                // this load was aborted/superseded) — always destroy() it,
                // nothing else holds a reference.
                destroyDoc(newDoc);
                if (mySeq !== seqRef.current) return null;
                setStatus('error');
                setError(bytesResult.reason instanceof Error ? bytesResult.reason.message : 'Failed to load PDF bytes');
                throw bytesResult.reason;
            }

            if (mySeq !== seqRef.current) {
                destroyDoc(newDoc);
                return null;
            }
            const newBytes = bytesResult.value;
            destroyDoc(docRef.current);
            docRef.current = newDoc;
            setDoc(newDoc);
            setBytes(newBytes);
            setNumPages(newDoc.numPages);
            setStatus('ready');
            return { doc: newDoc, bytes: newBytes };
        } catch (err) {
            if (mySeq !== seqRef.current) return null;
            setStatus('error');
            setError(err instanceof Error ? err.message : 'Failed to load PDF');
            throw err;
        }
    }, [destroyDoc]);

    const replaceBytes = useCallback(async (next: Uint8Array) => {
        const mySeq = ++seqRef.current;
        abortRef.current?.abort();
        abortRef.current = null;
        try {
            const pdfjsLib = await loadPdfjs();
            const newDoc: PdfDocLike = await pdfjsLib.getDocument({ data: next.slice() }).promise;
            if (mySeq !== seqRef.current) {
                destroyDoc(newDoc);
                return null;
            }
            destroyDoc(docRef.current);
            docRef.current = newDoc;
            setDoc(newDoc);
            setBytes(next);
            setNumPages(newDoc.numPages);
            setStatus('ready');
            return newDoc;
        } catch (err) {
            if (mySeq !== seqRef.current) return null;
            setStatus('error');
            setError(err instanceof Error ? err.message : 'Failed to reload PDF');
            throw err;
        }
    }, [destroyDoc]);

    return { doc, bytes, numPages, status, error, load, replaceBytes, destroy };
}
