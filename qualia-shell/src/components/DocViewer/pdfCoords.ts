/**
 * DocViewer — the ONE coordinate helper shared by the overlay (pointer input
 * + annotation rendering) and pdfBake (P1 item 6, audit findings #6/#14).
 *
 * All Annotation geometry is stored in PDF user space (points, unrotated
 * default user space; MediaBox/CropBox origin respected) — the exact space
 * pdf.js's `PDFPageProxy.getTextContent()` item transforms and pdf-lib's
 * `drawText`/`drawRectangle`/`drawLine` already use. The overlay converts
 * PDF space <-> viewport (CSS-pixel, top-left origin, y-down) space with the
 * LIVE pdf.js viewport for the rendered page; bake never touches viewport
 * space at all.
 *
 * `viewportToPdf`/`pdfToViewport` accept anything with pdf.js's
 * `convertToPdfPoint`/`convertToViewportPoint` methods — a REAL
 * `PageViewport` at runtime, or the pure `makeViewport()` below in tests
 * that must not depend on pdf.js being loaded. `makeViewport` implements
 * pdf.js's own `PageViewport` transform construction (display/display_utils)
 * point for point, so its output is provably identical to the real thing —
 * proven by the parity test against `pdfjs-dist/legacy/build/pdf.mjs` in
 * `docViewerPdfCoords.test.ts`.
 */
import type { Point, Rect } from './docViewerTypes';
import type { PageViewport } from 'pdfjs-dist';

export interface ViewportLike {
    convertToViewportPoint(x: number, y: number): [number, number];
    convertToPdfPoint(x: number, y: number): [number, number];
    /** Page rotation in degrees (0/90/180/270), clockwise-on-display per the
     * PDF spec's /Rotate. Used to keep added text/stamps upright — see
     * `pdfBake.ts`. Real pdf.js viewports always carry this; test doubles
     * that never place text/stamp annotations may omit it (treated as 0). */
    rotation?: number;
}

export interface RawViewportParams {
    /** [x0, y0, x1, y1] — the page's effective view box in default
     * (unrotated) user space, e.g. pdf.js's `PDFPageProxy.view` (CropBox
     * intersected with MediaBox, already origin-adjusted). */
    viewBox: [number, number, number, number];
    scale: number;
    /** Degrees, must be a multiple of 90. */
    rotation: number;
    offsetX?: number;
    offsetY?: number;
    dontFlip?: boolean;
}

export interface Viewport extends ViewportLike {
    viewBox: [number, number, number, number];
    scale: number;
    rotation: number;
    width: number;
    height: number;
    /** [a, b, c, d, e, f] — PDF user space -> viewport space. */
    transform: [number, number, number, number, number, number];
}

function applyTransform(m: readonly number[], x: number, y: number): [number, number] {
    return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

/** Matches pdf.js's `Util.applyInverseTransform` exactly. */
function applyInverseTransform(m: readonly number[], x: number, y: number): [number, number] {
    const d = m[0] * m[3] - m[1] * m[2];
    return [
        (x * m[3] - y * m[2] + m[2] * m[5] - m[3] * m[4]) / d,
        (-x * m[1] + y * m[0] + m[1] * m[4] - m[0] * m[5]) / d,
    ];
}

/**
 * Pure re-implementation of pdf.js's `PageViewport` constructor
 * (display/display_utils.js). No pdf.js import — testable standalone, and
 * usable at runtime as a `ViewportLike` wherever a real pdf.js viewport
 * isn't in hand (e.g. computing a PDF-space -> viewport-space conversion
 * from a rotation value alone).
 */
export function makeViewport(params: RawViewportParams): Viewport {
    const { viewBox, scale, offsetX = 0, offsetY = 0, dontFlip = false } = params;
    const centerX = (viewBox[2] + viewBox[0]) / 2;
    const centerY = (viewBox[3] + viewBox[1]) / 2;

    let rotation = params.rotation % 360;
    if (rotation < 0) rotation += 360;

    let rotateA: number, rotateB: number, rotateC: number, rotateD: number;
    switch (rotation) {
        case 180:
            rotateA = -1; rotateB = 0; rotateC = 0; rotateD = 1;
            break;
        case 90:
            rotateA = 0; rotateB = 1; rotateC = 1; rotateD = 0;
            break;
        case 270:
            rotateA = 0; rotateB = -1; rotateC = -1; rotateD = 0;
            break;
        case 0:
            rotateA = 1; rotateB = 0; rotateC = 0; rotateD = -1;
            break;
        default:
            throw new Error('makeViewport: rotation must be a multiple of 90 degrees');
    }
    if (dontFlip) {
        rotateC = -rotateC;
        rotateD = -rotateD;
    }

    let offsetCanvasX: number, offsetCanvasY: number, width: number, height: number;
    if (rotateA === 0) {
        offsetCanvasX = Math.abs(centerY - viewBox[1]) * scale + offsetX;
        offsetCanvasY = Math.abs(centerX - viewBox[0]) * scale + offsetY;
        width = Math.abs(viewBox[3] - viewBox[1]) * scale;
        height = Math.abs(viewBox[2] - viewBox[0]) * scale;
    } else {
        offsetCanvasX = Math.abs(centerX - viewBox[0]) * scale + offsetX;
        offsetCanvasY = Math.abs(centerY - viewBox[1]) * scale + offsetY;
        width = Math.abs(viewBox[2] - viewBox[0]) * scale;
        height = Math.abs(viewBox[3] - viewBox[1]) * scale;
    }

    const transform: [number, number, number, number, number, number] = [
        rotateA * scale,
        rotateB * scale,
        rotateC * scale,
        rotateD * scale,
        offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY,
        offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY,
    ];

    return {
        viewBox, scale, rotation, width, height, transform,
        convertToViewportPoint: (x, y) => applyTransform(transform, x, y),
        convertToPdfPoint: (x, y) => applyInverseTransform(transform, x, y),
    };
}

/**
 * Adapts a REAL pdf.js `PageViewport` into this module's `Viewport`. pdf.js's
 * own `.d.ts` types `convertToViewportPoint`/`convertToPdfPoint` as returning
 * `any[]` (not the 2-tuple they always actually produce) — item 12: this is
 * the one place that gap is bridged, so every other caller in this module
 * (and in DocViewer.tsx) works with a properly 2-tuple-typed `ViewportLike`
 * with no `any` of its own.
 */
export function fromPdfjsViewport(viewport: PageViewport): Viewport {
    return {
        viewBox: viewport.viewBox as [number, number, number, number],
        scale: viewport.scale,
        rotation: viewport.rotation,
        width: viewport.width,
        height: viewport.height,
        transform: viewport.transform as [number, number, number, number, number, number],
        convertToViewportPoint: (x, y) => viewport.convertToViewportPoint(x, y) as [number, number],
        convertToPdfPoint: (x, y) => viewport.convertToPdfPoint(x, y) as [number, number],
    };
}

export function viewportToPdf(viewport: ViewportLike, x: number, y: number): Point {
    const [px, py] = viewport.convertToPdfPoint(x, y);
    return { x: px, y: py };
}

export function pdfToViewport(viewport: ViewportLike, x: number, y: number): Point {
    const [vx, vy] = viewport.convertToViewportPoint(x, y);
    return { x: vx, y: vy };
}

/**
 * Converts a rect given as its (x, y) corner and (x + w, y + h) opposite
 * corner. Deliberately NOT a 4-corner min/max bounding box: that would
 * destroy the start/end direction a 'line'/'arrow' shape rect encodes.
 * Under a 90-degree-multiple rotation (the only kind /Rotate supports) an
 * axis-aligned rect's two opposite corners still map to two opposite
 * corners of an axis-aligned rect, so this stays correct for
 * highlight/rectangle/circle too — negative resulting w/h is valid PDF
 * (`re` with negative width/height) and valid canvas (`strokeRect`/
 * `fillRect` with negative width/height); pdfBake.ts takes `Math.abs` only
 * where a negative scale would actually break rendering (ellipse).
 */
export function viewportRectToPdfRect(viewport: ViewportLike, rect: Rect): Rect {
    const start = viewportToPdf(viewport, rect.x, rect.y);
    const end = viewportToPdf(viewport, rect.x + rect.w, rect.y + rect.h);
    return { x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y };
}

export function pdfRectToViewportRect(viewport: ViewportLike, rect: Rect): Rect {
    const start = pdfToViewport(viewport, rect.x, rect.y);
    const end = pdfToViewport(viewport, rect.x + rect.w, rect.y + rect.h);
    return { x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y };
}
