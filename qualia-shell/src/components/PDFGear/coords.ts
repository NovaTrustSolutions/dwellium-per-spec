/**
 * coords — screen ↔ PDF user-space coordinate mapping for click-on-canvas
 * placement in PDFGear.
 *
 * The actual page projection (which depends on scale + rotation + viewBox) is
 * delegated to the live pdfjs `PageViewport.convertToPdfPoint`, which is the
 * authoritative source of truth. This module owns the pure, framework-free
 * glue around it — turning a pointer event into canvas-bitmap pixels, ordering
 * drag corners, and assembling a normalized PDF-space rectangle (handling the
 * y-axis flip). All of that is unit-testable without pdfjs by passing a stub
 * viewport.
 */
import type { PdfRect } from './pdfOps';

/** Minimal slice of a pdfjs PageViewport we rely on. */
export interface ViewportLike {
    convertToPdfPoint(x: number, y: number): number[];
}

export interface Point {
    x: number;
    y: number;
}

export interface RectLike {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Convert a pointer event's client coordinates into the canvas BITMAP pixel
 * space. The canvas is frequently displayed (CSS) at a different size than its
 * intrinsic bitmap (`canvas.width`/`canvas.height`), so we rescale by the ratio.
 */
export function cssToCanvasPixel(
    clientX: number,
    clientY: number,
    rect: RectLike,
    canvasWidth: number,
    canvasHeight: number,
): Point {
    const sx = rect.width > 0 ? canvasWidth / rect.width : 1;
    const sy = rect.height > 0 ? canvasHeight / rect.height : 1;
    return {
        x: (clientX - rect.left) * sx,
        y: (clientY - rect.top) * sy,
    };
}

/** Order two corners into a top-left-origin rectangle (screen/bitmap space, y-down). */
export function normalizeRect(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
    };
}

/** Project a single canvas-bitmap point into PDF user-space via the viewport. */
export function canvasPointToPdf(p: Point, vp: ViewportLike): Point {
    const [x, y] = vp.convertToPdfPoint(p.x, p.y);
    return { x, y };
}

/**
 * Assemble a normalized PDF-space rectangle from two canvas-bitmap corners.
 * Because `convertToPdfPoint` flips the y-axis (canvas y-down → PDF y-up), the
 * min/max must be recomputed AFTER projection — you cannot normalize in screen
 * space and then project.
 */
export function canvasRectToPdfRect(a: Point, b: Point, vp: ViewportLike): PdfRect {
    const p1 = canvasPointToPdf(a, vp);
    const p2 = canvasPointToPdf(b, vp);
    return {
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        width: Math.abs(p1.x - p2.x),
        height: Math.abs(p1.y - p2.y),
    };
}

/**
 * Reference projection for rotation 0 — identical to what pdfjs computes when a
 * page's `viewBox` starts at the origin and rotation is 0. Useful as a tested
 * fallback when a live viewport isn't available, and as the basis for a stub
 * viewport in unit tests.
 *
 *   pdf_x = vx / scale
 *   pdf_y = pageHeightPts − vy / scale     (y flip: canvas top-left → PDF bottom-left)
 */
export function pdfPointFromViewport0(vx: number, vy: number, scale: number, pageHeightPts: number): Point {
    return { x: vx / scale, y: pageHeightPts - vy / scale };
}

/** Build a rotation-0 stub viewport (real pdfjs viewports satisfy the same contract). */
export function makeViewport0(scale: number, pageHeightPts: number): ViewportLike {
    return {
        convertToPdfPoint: (x: number, y: number) => {
            const p = pdfPointFromViewport0(x, y, scale, pageHeightPts);
            return [p.x, p.y];
        },
    };
}

/** Clamp a PDF rect to the page box so placements never spill past the media box. */
export function clampRectToPage(rect: PdfRect, pageWidth: number, pageHeight: number): PdfRect {
    const x = Math.max(0, Math.min(rect.x, pageWidth));
    const y = Math.max(0, Math.min(rect.y, pageHeight));
    return {
        x,
        y,
        width: Math.max(0, Math.min(rect.width, pageWidth - x)),
        height: Math.max(0, Math.min(rect.height, pageHeight - y)),
    };
}
