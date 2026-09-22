/**
 * DocViewer — pure annotation/page-index math. No React, no pdf-lib, no DOM.
 *
 * shiftAnnotationsForInsert/Delete keep the page-keyed annotation Map (and
 * the page-keyed text-edit list) pointed at the right page after
 * insertPage/deletePage — P0 item 5 (audit finding #5: insert/delete never
 * re-keyed annotations, so they baked onto the wrong page).
 *
 * normalizeSignatureStrokes converts a freehand signature captured in the
 * signature-modal's own pixel space into the same annotation-space units
 * every other annotation uses (position/rect in PDF-point-like, unscaled
 * canvas units) — P0 item 1 (kills the ad-hoc `* 0.5` overlay-only factor;
 * overlay and bake now draw the exact same absolute points).
 */
import type { Annotation, AnnotationMap, Point, Rect, TextEdit } from './docViewerTypes';

function cloneAnnotations(map: AnnotationMap): AnnotationMap {
    const next: AnnotationMap = new Map();
    map.forEach((list, page) => next.set(page, [...list]));
    return next;
}

/**
 * insertedPage is the 1-based page number the NEW page receives. Any
 * existing annotation on a page >= insertedPage shifts down (+1) to stay
 * with its original content; the new (blank) page starts with no entry.
 */
export function shiftAnnotationsForInsert(map: AnnotationMap, insertedPage: number): AnnotationMap {
    const source = cloneAnnotations(map);
    const next: AnnotationMap = new Map();
    source.forEach((list, page) => {
        const shifted = page >= insertedPage ? page + 1 : page;
        const anns = list.map((a: Annotation) => (shifted === page ? a : { ...a, page: shifted }));
        next.set(shifted, [...(next.get(shifted) || []), ...anns]);
    });
    return next;
}

/**
 * deletedPage is the 1-based page number being removed. Its annotations are
 * dropped; annotations on later pages shift up (-1).
 */
export function shiftAnnotationsForDelete(map: AnnotationMap, deletedPage: number): AnnotationMap {
    const source = cloneAnnotations(map);
    const next: AnnotationMap = new Map();
    source.forEach((list, page) => {
        if (page === deletedPage) return;
        const shifted = page > deletedPage ? page - 1 : page;
        const anns = list.map((a: Annotation) => (shifted === page ? a : { ...a, page: shifted }));
        next.set(shifted, [...(next.get(shifted) || []), ...anns]);
    });
    return next;
}

/** Same re-keying as shiftAnnotationsForInsert, for the page-keyed TextEdit list. */
export function shiftTextEditsForInsert(edits: TextEdit[], insertedPage: number): TextEdit[] {
    return edits.map(e => (e.pageNum >= insertedPage ? { ...e, pageNum: e.pageNum + 1 } : e));
}

/** Drops edits on the deleted page; later pages shift up. */
export function shiftTextEditsForDelete(edits: TextEdit[], deletedPage: number): TextEdit[] {
    return edits
        .filter(e => e.pageNum !== deletedPage)
        .map(e => (e.pageNum > deletedPage ? { ...e, pageNum: e.pageNum - 1 } : e));
}

/**
 * Scales a freehand signature (captured as one or more strokes of points in
 * the signature-modal canvas's own pixel space) into annotation-space,
 * anchored so its own ink bounding box's top-left corner sits at
 * `target.x`/`target.y` and its width equals `target.width` (aspect
 * preserved). Returns strokes already in absolute annotation-space units —
 * no further per-draw scaling factor is needed by the overlay or the bake.
 */
export function normalizeSignatureStrokes(
    strokes: Point[][],
    target: { x: number; y: number; width: number },
): { strokes: Point[][]; rect: Rect } {
    const allPoints = strokes.flat();
    if (allPoints.length === 0) {
        return { strokes: [], rect: { x: target.x, y: target.y, w: 0, h: 0 } };
    }

    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rawWidth = Math.max(maxX - minX, 1);
    const rawHeight = Math.max(maxY - minY, 1);
    const scaleFactor = target.width / rawWidth;
    const height = rawHeight * scaleFactor;

    const normalized = strokes.map(stroke =>
        stroke.map(p => ({
            x: target.x + (p.x - minX) * scaleFactor,
            y: target.y + (p.y - minY) * scaleFactor,
        })),
    );

    return { strokes: normalized, rect: { x: target.x, y: target.y, w: target.width, h: height } };
}
