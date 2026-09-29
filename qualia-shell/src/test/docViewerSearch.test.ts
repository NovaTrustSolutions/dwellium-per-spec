/**
 * P3 item 16b — pure text-search math (docSearch.ts). No React, no pdf.js.
 */
import { describe, it, expect } from 'vitest';
import { findMatchesInItems, computeMatchHighlightRects } from '../components/DocViewer/docSearch';
import type { TextItem } from '../components/DocViewer/docViewerTypes';

describe('findMatchesInItems', () => {
    it('finds a case-insensitive match', () => {
        const items = [{ str: 'Hello World', itemIndex: 0 }];
        const matches = findMatchesInItems(3, items, 'world');
        expect(matches).toEqual([{ page: 3, itemIndex: 0, matchStart: 6, matchLength: 5 }]);
    });

    it('finds every occurrence within one item, not just the first', () => {
        const items = [{ str: 'ababab', itemIndex: 0 }];
        const matches = findMatchesInItems(1, items, 'ab');
        expect(matches).toEqual([
            { page: 1, itemIndex: 0, matchStart: 0, matchLength: 2 },
            { page: 1, itemIndex: 0, matchStart: 2, matchLength: 2 },
            { page: 1, itemIndex: 0, matchStart: 4, matchLength: 2 },
        ]);
    });

    it('advances past the WHOLE match (non-overlapping), not by one character', () => {
        // 'aaaa' searched for 'aa': overlapping-from-every-char would (wrongly)
        // find matches at 0, 1, 2 — advancing by matchLength finds 0, 2 only.
        const items = [{ str: 'aaaa', itemIndex: 0 }];
        const matches = findMatchesInItems(1, items, 'aa');
        expect(matches).toEqual([
            { page: 1, itemIndex: 0, matchStart: 0, matchLength: 2 },
            { page: 1, itemIndex: 0, matchStart: 2, matchLength: 2 },
        ]);
    });

    it('searches across multiple items on the page', () => {
        const items = [{ str: 'foo', itemIndex: 0 }, { str: 'foobar', itemIndex: 1 }];
        const matches = findMatchesInItems(1, items, 'foo');
        expect(matches).toHaveLength(2);
        expect(matches[0].itemIndex).toBe(0);
        expect(matches[1].itemIndex).toBe(1);
    });

    it('an empty/whitespace-only query matches nothing', () => {
        expect(findMatchesInItems(1, [{ str: 'anything', itemIndex: 0 }], '')).toEqual([]);
        expect(findMatchesInItems(1, [{ str: 'anything', itemIndex: 0 }], '   ')).toEqual([]);
    });

    it('no match returns an empty array', () => {
        expect(findMatchesInItems(1, [{ str: 'hello', itemIndex: 0 }], 'zzz')).toEqual([]);
    });
});

function textItem(over: Partial<TextItem>): TextItem {
    return {
        str: 'Hello World', x: 10, y: 20, width: 100, height: 16, fontSize: 16,
        fontFamily: 'sans-serif', transform: [16, 0, 0, 16, 0, 0], itemIndex: 0, pdfWidth: 100,
        ...over,
    };
}

describe('computeMatchHighlightRects', () => {
    it('takes the proportional slice of the item width the match occupies', () => {
        const items = [textItem({ itemIndex: 0, str: 'Hello World', x: 0, width: 110, y: 5, height: 16 })];
        const matches = [{ page: 1, itemIndex: 0, matchStart: 6, matchLength: 5 }]; // "World"
        const rects = computeMatchHighlightRects(items, matches, null);
        expect(rects).toHaveLength(1);
        // "Hello World".length === 11, "World" starts at 6 -> frac0 = 6/11, frac1 = 11/11
        expect(rects[0].rect.x).toBeCloseTo(0 + 110 * (6 / 11), 5);
        expect(rects[0].rect.w).toBeCloseTo(110 * (5 / 11), 5);
        expect(rects[0].rect.y).toBe(5);
        expect(rects[0].rect.h).toBe(16);
        expect(rects[0].isCurrent).toBe(false);
    });

    it('marks the current match', () => {
        const items = [textItem({ itemIndex: 0 })];
        const m = { page: 1, itemIndex: 0, matchStart: 0, matchLength: 5 };
        const rects = computeMatchHighlightRects(items, [m], m);
        expect(rects[0].isCurrent).toBe(true);
    });

    it('skips a match whose textItem is not (yet) rendered on this page', () => {
        const items = [textItem({ itemIndex: 0 })];
        const matches = [{ page: 1, itemIndex: 5, matchStart: 0, matchLength: 2 }];
        expect(computeMatchHighlightRects(items, matches, null)).toEqual([]);
    });
});
