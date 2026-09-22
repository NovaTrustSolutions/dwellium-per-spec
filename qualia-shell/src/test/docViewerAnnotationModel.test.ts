/**
 * Pins P0 item 5 (page-insert/delete re-keying) and item 1
 * (normalizeSignatureStrokes — the fix for the ad-hoc `* 0.5` overlay-only
 * scale factor).
 */
import { describe, it, expect } from 'vitest';
import {
    shiftAnnotationsForInsert, shiftAnnotationsForDelete,
    shiftTextEditsForInsert, shiftTextEditsForDelete,
    normalizeSignatureStrokes,
} from '../components/DocViewer/annotationModel';
import type { Annotation, AnnotationMap, TextEdit } from '../components/DocViewer/docViewerTypes';

function ann(page: number, id: string): Annotation {
    return { id, type: 'highlight', page, color: '#ef4444', opacity: 0.3, rect: { x: 0, y: 0, w: 10, h: 10 } };
}

function mapOf(entries: Array<[number, Annotation[]]>): AnnotationMap {
    return new Map(entries);
}

describe('shiftAnnotationsForInsert', () => {
    it('inserting before page 1 (insertedPage=1) shifts everything up', () => {
        const src = mapOf([[1, [ann(1, 'a')]], [2, [ann(2, 'b')]]]);
        const next = shiftAnnotationsForInsert(src, 1);
        expect([...next.keys()].sort()).toEqual([2, 3]);
        expect(next.get(2)![0].page).toBe(2);
        expect(next.get(3)![0].page).toBe(3);
    });

    it('inserting in the middle (insertedPage) only shifts pages >= it', () => {
        const src = mapOf([[1, [ann(1, 'a')]], [2, [ann(2, 'b')]], [3, [ann(3, 'c')]]]);
        // e.g. currentPage=2 -> insertedPage = 3 (new page becomes page 3)
        const next = shiftAnnotationsForInsert(src, 3);
        expect(next.get(1)![0].id).toBe('a');
        expect(next.get(2)![0].id).toBe('b');
        expect(next.get(4)![0].id).toBe('c');
        expect(next.has(3)).toBe(false);
    });

    it('inserting after the last page leaves everything alone', () => {
        const src = mapOf([[1, [ann(1, 'a')]]]);
        const next = shiftAnnotationsForInsert(src, 2);
        expect(next.get(1)![0].id).toBe('a');
        expect(next.has(2)).toBe(false);
    });

    it('does not mutate the source map', () => {
        const src = mapOf([[1, [ann(1, 'a')]]]);
        shiftAnnotationsForInsert(src, 1);
        expect(src.get(1)![0].page).toBe(1);
    });
});

describe('shiftAnnotationsForDelete', () => {
    it('deleting the first page drops it and shifts the rest down', () => {
        const src = mapOf([[1, [ann(1, 'a')]], [2, [ann(2, 'b')]], [3, [ann(3, 'c')]]]);
        const next = shiftAnnotationsForDelete(src, 1);
        expect(next.has(1) && next.get(1)![0].id === 'b').toBe(true);
        expect(next.get(2)![0].id).toBe('c');
        expect([...next.keys()].sort()).toEqual([1, 2]);
    });

    it('deleting a middle page drops only that page', () => {
        const src = mapOf([[1, [ann(1, 'a')]], [2, [ann(2, 'b')]], [3, [ann(3, 'c')]]]);
        const next = shiftAnnotationsForDelete(src, 2);
        expect(next.get(1)![0].id).toBe('a');
        expect(next.get(2)![0].id).toBe('c');
        expect([...next.keys()].sort()).toEqual([1, 2]);
    });

    it('deleting the last page just drops it', () => {
        const src = mapOf([[1, [ann(1, 'a')]], [2, [ann(2, 'b')]]]);
        const next = shiftAnnotationsForDelete(src, 2);
        expect([...next.keys()]).toEqual([1]);
        expect(next.get(1)![0].id).toBe('a');
    });
});

function edit(pageNum: number, itemIndex: number): TextEdit {
    return { pageNum, itemIndex, originalText: 'a', newText: 'b', x: 0, y: 0, width: 1, height: 1, fontSize: 12 };
}

describe('shiftTextEditsForInsert / Delete', () => {
    it('insert shifts edits on later pages up by one', () => {
        const edits = [edit(1, 0), edit(2, 0)];
        const next = shiftTextEditsForInsert(edits, 2);
        expect(next.find(e => e.pageNum === 1)).toBeTruthy();
        expect(next.find(e => e.pageNum === 3)).toBeTruthy();
        expect(next.find(e => e.pageNum === 2)).toBeFalsy();
    });

    it('delete drops edits on the deleted page and shifts later ones down', () => {
        const edits = [edit(1, 0), edit(2, 0), edit(3, 0)];
        const next = shiftTextEditsForDelete(edits, 2);
        expect(next).toHaveLength(2);
        expect(next.find(e => e.pageNum === 1)).toBeTruthy();
        expect(next.find(e => e.pageNum === 2)).toBeTruthy(); // was page 3
        expect(next.find(e => e.pageNum === 3)).toBeFalsy();
    });
});

describe('normalizeSignatureStrokes', () => {
    it('anchors the ink bounding box top-left at target.x/y and scales to target.width', () => {
        // Raw stroke spans x:[100,300] (width 200), y:[50,150] (height 100) in modal-pixel space.
        const strokes = [[{ x: 100, y: 50 }, { x: 300, y: 150 }]];
        const { strokes: out, rect } = normalizeSignatureStrokes(strokes, { x: 40, y: 60, width: 100 });

        // scaleFactor = 100 / 200 = 0.5
        expect(out[0][0]).toEqual({ x: 40, y: 60 }); // top-left point maps exactly to target
        expect(out[0][1]).toEqual({ x: 40 + 200 * 0.5, y: 60 + 100 * 0.5 });
        expect(rect).toEqual({ x: 40, y: 60, w: 100, h: 50 });
    });

    it('preserves aspect ratio (height scales by the same factor as width)', () => {
        const strokes = [[{ x: 0, y: 0 }, { x: 480, y: 200 }]];
        const { rect } = normalizeSignatureStrokes(strokes, { x: 0, y: 0, width: 160 });
        // scaleFactor = 160/480 = 1/3 -> height = 200/3
        expect(rect.h).toBeCloseTo(200 / 3, 5);
    });

    it('returns an empty rect for no strokes', () => {
        const { strokes: out, rect } = normalizeSignatureStrokes([], { x: 5, y: 5, width: 50 });
        expect(out).toEqual([]);
        expect(rect).toEqual({ x: 5, y: 5, w: 0, h: 0 });
    });
});
