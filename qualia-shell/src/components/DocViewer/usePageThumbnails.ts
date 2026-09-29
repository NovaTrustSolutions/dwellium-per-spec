/**
 * DocViewer — P3 item 16c: real page thumbnails. Renders each page small
 * with pdf.js into an offscreen canvas, ONLY for pages PageSidebar actually
 * asks for (it calls `requestThumbnail` from an IntersectionObserver, so a
 * page never scrolled into view is never rendered), caches the result by
 * page number, and drops the whole cache whenever the document's bytes
 * change (insert/delete/rotate/undo/redo) so a stale thumbnail never
 * outlives the page it was drawn from.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdfDocLike } from './usePdfDocument';

const DEFAULT_THUMB_WIDTH = 96;

export interface UsePageThumbnailsOptions {
    pdfDoc: PdfDocLike | null;
    /** Any value that changes whenever the underlying PDF bytes change —
     * DocViewer passes `pdfBytes`. Invalidates every cached thumbnail. */
    bytesVersion: unknown;
    thumbWidth?: number;
}

export interface UsePageThumbnails {
    /** A cached data-URL for this page, or null if it hasn't been rendered
     * (not yet requested, still rendering, or rendering failed). */
    getThumbnail: (page: number) => string | null;
    /** Lazily renders (once) the thumbnail for `page`. Idempotent — a no-op
     * if already cached or already in flight. Safe to call from a
     * visibility check on every scroll/mount. */
    requestThumbnail: (page: number) => void;
    /** R6 (adversarial review): bumped ONLY when bytesVersion invalidates the
     * cache (never on an ordinary new-thumbnail-landed re-render) — the one
     * signal PageSidebar's per-button "already requested" guard needs to
     * know a previously-rendered thumbnail is gone and worth asking for
     * again after an insert/delete/rotate/undo. */
    invalidationEpoch: number;
}

export function usePageThumbnails(opts: UsePageThumbnailsOptions): UsePageThumbnails {
    const { pdfDoc, bytesVersion, thumbWidth = DEFAULT_THUMB_WIDTH } = opts;

    const cacheRef = useRef<Map<number, string>>(new Map());
    const inFlightRef = useRef<Set<number>>(new Set());
    // Bumped whenever a NEW thumbnail lands in the cache, so components
    // reading getThumbnail() re-render and pick it up (the cache itself is a
    // ref, invisible to React on its own).
    const [readyTick, setReadyTick] = useState(0);
    // R8 (adversarial review): an in-flight render closes over the pdfDoc
    // that was current when it started. If bytesVersion invalidates the
    // cache before that render finishes, the stale render must not write
    // its (now wrong) result into the fresh cache. Checked via `pdfDoc`
    // OBJECT IDENTITY itself (mirrored into a ref, updated unconditionally
    // on every render — see below) rather than a counter bumped in an
    // effect: a counter bumped in usePageThumbnails' own effect races
    // against a REAL first load, because React runs a newly-mounted CHILD's
    // effects (e.g. PageSidebar's "the active page always gets a thumbnail"
    // effect) before this hook's own effect in the SAME commit — a counter
    // bump would wrongly mark that legitimate, still-current first request
    // as stale before it even resolves. Reading a ref mirrored during
    // render has no such ordering dependency: render always precedes every
    // effect in a commit, so the mirror is already correct by the time any
    // effect (child or parent) can call requestThumbnail.
    const pdfDocRef = useRef<PdfDocLike | null>(null);
    pdfDocRef.current = pdfDoc;
    // R6: a SEPARATE counter from readyTick — bumped only on invalidation,
    // never on an ordinary thumbnail landing — see invalidationEpoch above.
    const [invalidationEpoch, setInvalidationEpoch] = useState(0);
    // Skips the cache/inFlight reset on the effect's MOUNT run (every
    // useEffect runs on mount too, not just on a dependency change) —
    // nothing needs invalidating then, the cache already starts empty, and
    // an invalidationEpoch bump on mount would be a false "something was
    // just invalidated" signal to PageSidebar's R6 effect.
    const mountedRef = useRef(false);

    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            return;
        }
        cacheRef.current = new Map();
        inFlightRef.current = new Set();
        setReadyTick(t => t + 1);
        setInvalidationEpoch(t => t + 1);
    }, [bytesVersion]);

    const requestThumbnail = useCallback((page: number) => {
        if (!pdfDoc) return;
        if (cacheRef.current.has(page) || inFlightRef.current.has(page)) return;
        inFlightRef.current.add(page);
        const myDoc = pdfDoc;
        void (async () => {
            try {
                const pdfPage = await myDoc.getPage(page);
                const base = pdfPage.getViewport({ scale: 1 });
                const scale = base.width > 0 ? thumbWidth / base.width : 1;
                const viewport = pdfPage.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.ceil(viewport.width));
                canvas.height = Math.max(1, Math.ceil(viewport.height));
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('no 2D context');
                await pdfPage.render({ canvasContext: ctx, canvas, viewport }).promise;
                // R8: the document moved on while this render was in flight
                // — discard the (stale) result instead of writing a pre-edit
                // thumbnail into the fresh cache.
                if (pdfDocRef.current !== myDoc) return;
                cacheRef.current.set(page, canvas.toDataURL('image/png'));
            } catch {
                // ponytail: a thumbnail is a nicety — a page that fails to
                // render one just keeps showing the "p.N" text fallback
                // (PageSidebar.tsx) rather than surfacing an error anywhere.
            } finally {
                if (pdfDocRef.current === myDoc) {
                    inFlightRef.current.delete(page);
                    setReadyTick(t => t + 1);
                }
            }
        })();
    }, [pdfDoc, thumbWidth]);

    const getThumbnail = useCallback((page: number): string | null => {
        void readyTick; // subscribe this closure to cache-changed re-renders
        return cacheRef.current.get(page) ?? null;
    }, [readyTick]);

    return { getThumbnail, requestThumbnail, invalidationEpoch };
}
