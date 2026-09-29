/**
 * DocViewer — P3 item 16b: pure text-search math. No React, no pdf.js — just
 * finding matches inside already-extracted text runs and turning them into
 * viewport-space highlight rects. Kept separate from useDocumentSearch.ts
 * (the pdf.js/React side) the same way annotationModel.ts stays separate
 * from the hooks that call it.
 *
 * ponytail: a match is found WITHIN a single pdf.js text "item" (the run
 * pdf.js's own `getTextContent()` breaks a page into) — a query that spans
 * two adjacent runs (e.g. split across a line/column break pdf.js reports as
 * separate items) won't match. Good enough for the common case; a real
 * "reflow the whole page into one string" search would need to track each
 * character's origin item to still produce a highlight rect, which is a
 * bigger lift than this feature needs today.
 */
import type { Rect, TextItem } from './docViewerTypes';

export interface SearchableItem {
    str: string;
    /** The item's index in that page's pdf.js getTextContent().items — the
     * SAME numbering DocViewer's own per-page text-layer extraction uses, so
     * a match can be matched back up to a rendered TextItem with no
     * re-extraction. */
    itemIndex: number;
}

export interface SearchMatch {
    /** 1-based page number. */
    page: number;
    itemIndex: number;
    /** Character offset of the match within that item's string. */
    matchStart: number;
    matchLength: number;
}

/** Case-insensitive substring search within one page's already-extracted
 * text items. Returns every occurrence (not just the first per item). */
export function findMatchesInItems(page: number, items: SearchableItem[], query: string): SearchMatch[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchMatch[] = [];
    for (const item of items) {
        const hay = item.str.toLowerCase();
        let from = 0;
        for (;;) {
            const idx = hay.indexOf(q, from);
            if (idx === -1) break;
            out.push({ page, itemIndex: item.itemIndex, matchStart: idx, matchLength: q.length });
            from = idx + q.length;
        }
    }
    return out;
}

/** Converts this page's matches into viewport-space highlight rects, by
 * finding each match's rendered TextItem (already viewport-scaled/positioned
 * by DocViewer's extractTextLayer) and taking the proportional slice of its
 * width that the match's characters occupy. `currentMatch` (if given) marks
 * which returned rect should be drawn as the "active" one. */
export function computeMatchHighlightRects(
    textItems: TextItem[],
    pageMatches: SearchMatch[],
    currentMatch: SearchMatch | null,
): Array<{ rect: Rect; isCurrent: boolean }> {
    const out: Array<{ rect: Rect; isCurrent: boolean }> = [];
    for (const m of pageMatches) {
        const item = textItems.find(t => t.itemIndex === m.itemIndex);
        if (!item) continue;
        const total = Math.max(item.str.length, 1);
        const frac0 = m.matchStart / total;
        const frac1 = (m.matchStart + m.matchLength) / total;
        const x = item.x + item.width * frac0;
        const w = item.width * (frac1 - frac0);
        out.push({
            rect: { x, y: item.y, w, h: item.height },
            isCurrent: !!currentMatch && currentMatch.page === m.page
                && currentMatch.itemIndex === m.itemIndex && currentMatch.matchStart === m.matchStart,
        });
    }
    return out;
}
