/**
 * DocViewer — page thumbnail rail (P2 item 11 module split; P3 item 16c adds
 * real lazily-rendered thumbnails). Presentational: no pdf.js/render state
 * of its own — `getThumbnail`/`requestThumbnail` come from
 * usePageThumbnails.ts, owned by DocViewer.
 */
import { useCallback, useEffect, useRef } from 'react';

export interface PageSidebarProps {
    totalPages: number;
    currentPage: number;
    onGoToPage: (page: number) => void;
    onInsertPage: () => void;
    /** A cached thumbnail data-URL for a page, or null if not rendered yet —
     * the button falls back to its plain "p.N" label until then. */
    getThumbnail?: (page: number) => string | null;
    /** Lazily renders a page's thumbnail — called once a button scrolls into
     * view (P3 16c: "only what is visible"), never for the whole document
     * up front. */
    requestThumbnail?: (page: number) => void;
    /** R6 (adversarial review): bumped only when usePageThumbnails
     * invalidates its whole cache (insert/delete/rotate/undo/redo) — resets
     * this button's own "already requested" guard so a page whose
     * thumbnail was already rendered before the edit asks again instead of
     * permanently falling back to the plain "p.N" text. */
    thumbnailEpoch?: number;
}

function PageThumbButton({
    page, active, onGoToPage, getThumbnail, requestThumbnail, thumbnailEpoch,
}: {
    page: number;
    active: boolean;
    onGoToPage: (page: number) => void;
    getThumbnail?: (page: number) => string | null;
    requestThumbnail?: (page: number) => void;
    thumbnailEpoch?: number;
}) {
    const elRef = useRef<HTMLButtonElement | null>(null);
    const requested = useRef(false);

    const maybeRequest = useCallback(() => {
        if (requested.current || !requestThumbnail) return;
        requested.current = true;
        requestThumbnail(page);
    }, [page, requestThumbnail]);

    // R6: on invalidation, re-request ONLY a page that either already had a
    // thumbnail (or one in flight) or is the currently-open page — never the
    // never-visited/off-screen pages, which must stay lazy.
    useEffect(() => {
        if (requested.current || active) {
            requested.current = false;
            maybeRequest();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thumbnailEpoch]);

    useEffect(() => {
        const el = elRef.current;
        // ponytail: jsdom (unit tests) has no IntersectionObserver — this
        // simply never fires there, so a test environment always falls back
        // to the plain "p.N" label instead of crashing or eagerly rendering
        // every page's thumbnail (which would also hit jsdom's un-implemented
        // canvas.toDataURL). A real browser gets real lazy thumbnails.
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) maybeRequest();
        }, { root: el.closest('.dv-nav'), rootMargin: '200px' });
        observer.observe(el);
        return () => observer.disconnect();
    }, [maybeRequest]);

    // The currently-open page is always worth having a thumbnail for even
    // before it's scrolled past (e.g. page 1 on first open).
    useEffect(() => {
        if (active) maybeRequest();
    }, [active, maybeRequest]);

    const thumbUrl = getThumbnail?.(page) ?? null;

    return (
        // P2 item 13 (a11y): a real <button> — focusable, Enter/Space
        // activate it natively, aria-current marks the open page.
        <button ref={elRef} type="button" data-page={page}
            className={`dv-nav__thumb ${active ? 'dv-nav__thumb--active' : ''}`}
            aria-current={active ? 'true' : undefined}
            aria-label={`Page ${page}`}
            onClick={() => onGoToPage(page)}>
            {/* R7/R10/R12/R14/R15 (adversarial review): the visible "p.N"
                label must survive a rendered thumbnail — it was previously
                REPLACED by an aria-hidden <img>, which (1) removed the
                numeric page label sighted users read to confirm which page
                they're clicking, and (2) broke this project's own
                live-browser P0/P1/capabilities regression scripts, which
                locate page buttons by that visible text. axe doesn't catch
                this: aria-label alone satisfies the automated accessible-
                name rules, and jsdom (no IntersectionObserver) never
                exercises the rendered-thumbnail state in a unit test. */}
            {thumbUrl && <img className="dv-nav__thumb-img" src={thumbUrl} alt="" aria-hidden="true" />}
            <span className="dv-nav__thumb-label">{`p.${page}`}</span>
        </button>
    );
}

export default function PageSidebar({ totalPages, currentPage, onGoToPage, onInsertPage, getThumbnail, requestThumbnail, thumbnailEpoch }: PageSidebarProps) {
    if (totalPages <= 0) return null;
    return (
        <div className="dv-nav">
            {Array.from({ length: totalPages }, (_, i) => {
                const page = i + 1;
                return (
                    <PageThumbButton
                        key={page}
                        page={page}
                        active={currentPage === page}
                        onGoToPage={onGoToPage}
                        getThumbnail={getThumbnail}
                        requestThumbnail={requestThumbnail}
                        thumbnailEpoch={thumbnailEpoch}
                    />
                );
            })}
            <button type="button" className="dv-nav__add-page" onClick={onInsertPage}
                aria-label="Insert blank page after current page" title="Insert blank page">
                +
            </button>
        </div>
    );
}
