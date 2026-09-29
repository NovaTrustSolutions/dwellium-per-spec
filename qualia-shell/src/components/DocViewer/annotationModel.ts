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

// ============================================
// 16a — select / move / delete a placed annotation. All in PDF user space
// (same space every Annotation is stored in), so hit-testing/dragging stay
// correct across zoom and page rotation with no extra conversion.
// ============================================

// ponytail: text/stamp bounds are an ESTIMATE (avg glyph-width factor, not
// real font metrics) — good enough for hit-testing and drawing a selection
// outline, not for pixel-exact typography. Upgrade to a measured width (e.g.
// via an offscreen canvas/pdf.js glyph metrics) if selection outlines need
// to hug the text exactly.
const TEXT_CHAR_WIDTH_FACTOR = 0.55;

function normalizeRect(r: Rect): Rect {
    return { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) };
}

/** R9 (adversarial review): 'text'/'stamp' glyphs always render UPRIGHT in
 * viewport (screen) space — annotationOverlay.ts's own 'text' case draws
 * with no ctx.rotate() at all, and pdfBake.ts's `rotate: degrees(ann.rotation)`
 * only counter-rotates the raw PDF content stream so a viewer applying the
 * page's /Rotate metadata reproduces that SAME upright screen appearance.
 * A PDF-space box built as if width/height simply extend along the PDF's
 * own (unrotated) x/y axes is therefore wrong under a 90/270-degree page
 * rotation: pdfRectToViewportRect (used by both hitTestAnnotation's caller
 * and the selection-outline draw) would swap its extents onto the WRONG
 * screen axis relative to the actually-upright-rendered glyphs. Swapping
 * width/height here keeps the box's SCREEN-space footprint axis-aligned
 * with what's actually drawn, for whatever rotation is live right now.
 */
function normalizeRotation(deg: number): number {
    const r = deg % 360;
    return r < 0 ? r + 360 : r;
}

/** PDF-space bounding box for hit-testing / the selection outline. Null when
 * the annotation carries none of the geometry its type needs (defensive —
 * shouldn't happen for a committed annotation). `viewportRotation` is the
 * CURRENT page rotation (0/90/180/270) — see the R9 note above; it defaults
 * to 0 for existing (non-text/stamp) call sites that never pass it. */
export function annotationBounds(ann: Annotation, viewportRotation = 0): Rect | null {
    switch (ann.type) {
        case 'text': {
            if (!ann.position) return null;
            const size = ann.fontSize || 16;
            const rawWidth = Math.max((ann.text?.length || 0) * size * TEXT_CHAR_WIDTH_FACTOR, size);
            const rawHeight = size * 1.3;
            const swapped = normalizeRotation(viewportRotation) % 180 === 90;
            const width = swapped ? rawHeight : rawWidth;
            const height = swapped ? rawWidth : rawHeight;
            return { x: ann.position.x, y: ann.position.y, w: width, h: height };
        }
        case 'stamp': {
            if (!ann.position) return null;
            const label = ann.stampType || '';
            const size = 28;
            const rawWidth = Math.max(label.length * size * 0.6, size * 2);
            const rawHeight = size * 1.4;
            const swapped = normalizeRotation(viewportRotation) % 180 === 90;
            const width = swapped ? rawHeight : rawWidth;
            const height = swapped ? rawWidth : rawHeight;
            return { x: ann.position.x - size * 0.4, y: ann.position.y, w: width, h: height };
        }
        case 'highlight':
        case 'shape':
        case 'signature':
            return ann.rect ? normalizeRect(ann.rect) : null;
        case 'draw': {
            if (!ann.points || ann.points.length === 0) return null;
            const xs = ann.points.map(p => p.x);
            const ys = ann.points.map(p => p.y);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const pad = (ann.lineWidth || 3) / 2;
            return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
        }
        default:
            return null;
    }
}

function rectContains(r: Rect, p: Point): boolean {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Topmost annotation under `point` (PDF space) — last-drawn wins, so this
 * walks the list back-to-front, matching draw order in annotationOverlay.ts.
 * `viewportRotation` — see the R9 note on annotationBounds above. */
export function hitTestAnnotation(annotations: Annotation[], point: Point, viewportRotation = 0): Annotation | null {
    for (let i = annotations.length - 1; i >= 0; i--) {
        const bounds = annotationBounds(annotations[i], viewportRotation);
        if (bounds && rectContains(bounds, point)) return annotations[i];
    }
    return null;
}

/** Returns a NEW annotation shifted by (dx, dy) in PDF space — every geometry
 * field the type carries (position / rect / points / signatureData strokes)
 * moves together so the shape doesn't distort. */
export function translateAnnotation(ann: Annotation, dx: number, dy: number): Annotation {
    const next: Annotation = { ...ann };
    if (next.position) next.position = { x: next.position.x + dx, y: next.position.y + dy };
    if (next.rect) next.rect = { ...next.rect, x: next.rect.x + dx, y: next.rect.y + dy };
    if (next.points) next.points = next.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    if (next.signatureData) next.signatureData = next.signatureData.map(stroke => stroke.map(p => ({ x: p.x + dx, y: p.y + dy })));
    return next;
}
