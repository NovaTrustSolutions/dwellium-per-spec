/**
 * DocViewer — P3 item 16b: text search. Owns the toolbar-toggle open/closed
 * state, the query, a LAZY per-page text index (built with pdf.js
 * `getTextContent()` only for pages actually searched, cached, and
 * invalidated whenever the document's bytes change), and cross-page
 * next/previous navigation.
 *
 * Search state never touches the `annotations` Map — matches/highlights are
 * a separate render input DocViewer feeds straight to
 * `annotationOverlay.ts`'s draw call. `pdfBake.ts` only ever reads
 * `annotations`, so a saved PDF can never pick up a search highlight by
 * construction (pinned by docViewerSearch.test.tsx's no-bake test).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdfDocLike } from './usePdfDocument';
import { findMatchesInItems, type SearchMatch, type SearchableItem } from './docSearch';

interface PageTextCacheEntry {
    items: SearchableItem[];
}

// A brief typing debounce keeps a multi-page document from re-scanning every
// page on every single keystroke.
const SEARCH_DEBOUNCE_MS = 250;

export interface UseDocumentSearchOptions {
    pdfDoc: PdfDocLike | null;
    totalPages: number;
    /** Any value that changes whenever the underlying PDF bytes change
     * (insert/delete/rotate page, a baked text edit, undo/redo) — DocViewer
     * passes `pdfBytes` itself. Invalidates the cached per-page text index,
     * so search never reads a stale page's text after an edit. */
    bytesVersion: unknown;
    /** Called to bring a match's page into view — DocViewer's `goToPage`. */
    onJumpToPage: (page: number) => void;
}

export interface UseDocumentSearch {
    isOpen: boolean;
    toggleOpen: () => void;
    query: string;
    setQuery: (q: string) => void;
    isSearching: boolean;
    matches: SearchMatch[];
    matchCount: number;
    /** -1 when there is no current match. */
    currentIndex: number;
    currentMatch: SearchMatch | null;
    goNext: () => void;
    goPrev: () => void;
}

export function useDocumentSearch(opts: UseDocumentSearchOptions): UseDocumentSearch {
    const { pdfDoc, totalPages, bytesVersion, onJumpToPage } = opts;

    const [isOpen, setIsOpen] = useState(false);
    const [query, setQueryState] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [matches, setMatches] = useState<SearchMatch[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);

    const cacheRef = useRef<Map<number, PageTextCacheEntry>>(new Map());
    useEffect(() => { cacheRef.current = new Map(); }, [bytesVersion]);

    const getPageText = useCallback(async (page: number): Promise<PageTextCacheEntry> => {
        const cached = cacheRef.current.get(page);
        if (cached) return cached;
        if (!pdfDoc) return { items: [] };
        const p = await pdfDoc.getPage(page);
        const textContent = await p.getTextContent();
        const items: SearchableItem[] = [];
        textContent.items.forEach((it, itemIndex) => {
            if ('str' in it && it.str && it.str.trim() !== '') items.push({ str: it.str, itemIndex });
        });
        const entry: PageTextCacheEntry = { items };
        cacheRef.current.set(page, entry);
        return entry;
    }, [pdfDoc]);

    // ---- Run (debounced) a full-document search whenever the query changes ----
    const searchSeqRef = useRef(0);
    useEffect(() => {
        if (!isOpen || !query.trim() || !pdfDoc || totalPages === 0) {
            setMatches([]);
            setCurrentIndex(-1);
            setIsSearching(false);
            return;
        }
        const mySeq = ++searchSeqRef.current;
        setIsSearching(true);
        const timer = setTimeout(() => {
            void (async () => {
                const results: SearchMatch[] = [];
                for (let page = 1; page <= totalPages; page++) {
                    if (mySeq !== searchSeqRef.current) return; // superseded by a newer query
                    const { items } = await getPageText(page);
                    results.push(...findMatchesInItems(page, items, query));
                }
                if (mySeq !== searchSeqRef.current) return;
                setMatches(results);
                setIsSearching(false);
                if (results.length > 0) {
                    setCurrentIndex(0);
                    onJumpToPage(results[0].page);
                } else {
                    setCurrentIndex(-1);
                }
            })();
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [isOpen, query, pdfDoc, totalPages, getPageText, onJumpToPage]);

    const goNext = useCallback(() => {
        setCurrentIndex(prev => {
            if (matches.length === 0) return prev;
            const next = prev < 0 ? 0 : (prev + 1) % matches.length;
            onJumpToPage(matches[next].page);
            return next;
        });
    }, [matches, onJumpToPage]);

    const goPrev = useCallback(() => {
        setCurrentIndex(prev => {
            if (matches.length === 0) return prev;
            const next = prev < 0 ? matches.length - 1 : (prev - 1 + matches.length) % matches.length;
            onJumpToPage(matches[next].page);
            return next;
        });
    }, [matches, onJumpToPage]);

    const toggleOpen = useCallback(() => {
        setIsOpen(o => {
            const next = !o;
            if (!next) {
                setQueryState('');
                setMatches([]);
                setCurrentIndex(-1);
            }
            return next;
        });
    }, []);

    const setQuery = useCallback((q: string) => setQueryState(q), []);

    return {
        isOpen, toggleOpen, query, setQuery, isSearching,
        matches, matchCount: matches.length, currentIndex,
        currentMatch: currentIndex >= 0 && currentIndex < matches.length ? matches[currentIndex] : null,
        goNext, goPrev,
    };
}
