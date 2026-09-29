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
    annotationBounds, hitTestAnnotation, translateAnnotation,
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

// 16a — select / move / delete
describe('annotationBounds', () => {
    it('highlight/shape/signature use rect, normalized for negative w/h', () => {
        const hl: Annotation = { id: 'h', type: 'highlight', page: 1, color: '#f00', opacity: 0.3, rect: { x: 50, y: 50, w: -20, h: -10 } };
        expect(annotationBounds(hl)).toEqual({ x: 30, y: 40, w: 20, h: 10 });
    });

    it('draw uses the point bounding box, padded by half the line width', () => {
        const d: Annotation = { id: 'd', type: 'draw', page: 1, color: '#000', opacity: 1, lineWidth: 4, points: [{ x: 10, y: 10 }, { x: 30, y: 20 }, { x: 5, y: 25 }] };
        expect(annotationBounds(d)).toEqual({ x: 3, y: 8, w: 29, h: 19 });
    });

    it('text/stamp/draw/highlight with no geometry return null', () => {
        expect(annotationBounds({ id: 't', type: 'text', page: 1, color: '#000', opacity: 1 })).toBeNull();
        expect(annotationBounds({ id: 's', type: 'stamp', page: 1, color: '#000', opacity: 1 })).toBeNull();
        expect(annotationBounds({ id: 'w', type: 'draw', page: 1, color: '#000', opacity: 1 })).toBeNull();
        expect(annotationBounds({ id: 'g', type: 'highlight', page: 1, color: '#000', opacity: 1 })).toBeNull();
    });

    it('text bounds anchor at position and grow with text length/fontSize', () => {
        const short: Annotation = { id: 'a', type: 'text', page: 1, color: '#000', opacity: 1, text: 'Hi', fontSize: 16, position: { x: 0, y: 0 } };
        const long: Annotation = { id: 'b', type: 'text', page: 1, color: '#000', opacity: 1, text: 'A much longer string', fontSize: 16, position: { x: 0, y: 0 } };
        const b1 = annotationBounds(short)!;
        const b2 = annotationBounds(long)!;
        expect(b1.x).toBe(0);
        expect(b1.y).toBe(0);
        expect(b2.w).toBeGreaterThan(b1.w);
    });

    // ---- R9 (adversarial review): text/stamp glyphs always render UPRIGHT
    // in viewport space (annotationOverlay.ts never ctx.rotate()s them) —
    // an axis-aligned-in-PDF-space box is wrong under a 90/270 page
    // rotation, since pdfRectToViewportRect would then swap its extents
    // onto the wrong screen axis relative to the actually-drawn glyphs. ----
    it('text/stamp bounds swap width/height under a 90 or 270 degree viewport rotation, unchanged at 0/180', () => {
        const text: Annotation = { id: 't', type: 'text', page: 1, color: '#000', opacity: 1, text: 'Hello', fontSize: 16, position: { x: 0, y: 0 } };
        const stamp: Annotation = { id: 's', type: 'stamp', page: 1, color: '#000', opacity: 1, stampType: 'APPROVED', position: { x: 0, y: 0 } };

        for (const ann of [text, stamp]) {
            const b0 = annotationBounds(ann, 0)!;
            const b180 = annotationBounds(ann, 180)!;
            const b90 = annotationBounds(ann, 90)!;
            const b270 = annotationBounds(ann, 270)!;

            expect(b180).toEqual(b0); // 180 keeps both axes aligned — no swap
            expect(b90.w).toBe(b0.h);
            expect(b90.h).toBe(b0.w);
            expect(b270.w).toBe(b0.h);
            expect(b270.h).toBe(b0.w);
        }
    });

    it('rotation defaults to 0 (unrotated) when omitted — existing callers are unaffected', () => {
        const text: Annotation = { id: 't', type: 'text', page: 1, color: '#000', opacity: 1, text: 'Hi', fontSize: 16, position: { x: 0, y: 0 } };
        expect(annotationBounds(text)).toEqual(annotationBounds(text, 0));
    });
});

describe('hitTestAnnotation', () => {
    const under: Annotation = { id: 'under', type: 'highlight', page: 1, color: '#f00', opacity: 0.3, rect: { x: 0, y: 0, w: 100, h: 100 } };
    const over: Annotation = { id: 'over', type: 'highlight', page: 1, color: '#0f0', opacity: 0.3, rect: { x: 20, y: 20, w: 30, h: 30 } };

    it('returns the topmost (last-drawn) annotation when overlapping', () => {
        expect(hitTestAnnotation([under, over], { x: 25, y: 25 })?.id).toBe('over');
    });

    it('falls through to a lower annotation outside the top one\'s bounds', () => {
        expect(hitTestAnnotation([under, over], { x: 5, y: 5 })?.id).toBe('under');
    });

    it('returns null when nothing is under the point', () => {
        expect(hitTestAnnotation([under, over], { x: 500, y: 500 })).toBeNull();
    });

    it('returns null for an empty list', () => {
        expect(hitTestAnnotation([], { x: 0, y: 0 })).toBeNull();
    });

    // ---- R9 ----
    it('a rotated text annotation is hit-tested against its rotation-aware (viewport-space-upright) box', () => {
        // At fontSize 16, 'Hi' is narrower than it is tall in the UNROTATED
        // box (w ~= 2*16*0.55 = 17.6, h = 16*1.3 = 20.8) — under a 90-degree
        // page rotation the glyphs still render upright on screen, so the
        // box's PDF-space footprint must swap: what reads as "20.8 tall" on
        // screen now needs 20.8 of PDF-space extent along whichever PDF
        // axis maps to the screen's vertical under that rotation.
        const text: Annotation = { id: 't', type: 'text', page: 1, color: '#000', opacity: 1, text: 'Hi', fontSize: 16, position: { x: 0, y: 0 } };
        const unrotatedBounds = annotationBounds(text, 0)!;
        // A point inside the unrotated box's height but past its (much
        // narrower) width — misses at rotation 0, but the 90-degree box has
        // width/height swapped, so this same point now falls inside it.
        const probe = { x: unrotatedBounds.w + 1, y: 5 };
        expect(hitTestAnnotation([text], probe, 0)).toBeNull();
        expect(hitTestAnnotation([text], probe, 90)?.id).toBe('t');
    });
});

describe('translateAnnotation', () => {
    it('moves position (text/stamp)', () => {
        const t: Annotation = { id: 't', type: 'text', page: 1, color: '#000', opacity: 1, position: { x: 10, y: 20 } };
        expect(translateAnnotation(t, 5, -3).position).toEqual({ x: 15, y: 17 });
    });

    it('moves rect (highlight/shape/signature) without touching w/h', () => {
        const r: Annotation = { id: 'r', type: 'shape', page: 1, color: '#000', opacity: 1, rect: { x: 10, y: 10, w: 30, h: 40 } };
        expect(translateAnnotation(r, 2, 3).rect).toEqual({ x: 12, y: 13, w: 30, h: 40 });
    });

    it('moves every point (draw)', () => {
        const d: Annotation = { id: 'd', type: 'draw', page: 1, color: '#000', opacity: 1, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] };
        expect(translateAnnotation(d, 1, 1).points).toEqual([{ x: 1, y: 1 }, { x: 6, y: 6 }]);
    });

    it('moves every point of every signature stroke', () => {
        const sig: Annotation = {
            id: 's', type: 'signature', page: 1, color: '#000', opacity: 1,
            rect: { x: 0, y: 0, w: 10, h: 10 },
            signatureData: [[{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 2, y: 2 }]],
        };
        const moved = translateAnnotation(sig, 10, 10);
        expect(moved.signatureData).toEqual([[{ x: 10, y: 10 }, { x: 11, y: 11 }], [{ x: 12, y: 12 }]]);
        expect(moved.rect).toEqual({ x: 10, y: 10, w: 10, h: 10 });
    });

    it('does not mutate the original annotation', () => {
        const t: Annotation = { id: 't', type: 'text', page: 1, color: '#000', opacity: 1, position: { x: 0, y: 0 } };
        translateAnnotation(t, 5, 5);
        expect(t.position).toEqual({ x: 0, y: 0 });
    });
});
