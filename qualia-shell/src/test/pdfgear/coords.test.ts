/**
 * Unit tests for PDFGear/coords.ts — the pure screen↔PDF coordinate glue.
 * The projection itself is delegated to pdfjs in production; here we drive a
 * rotation-0 stub viewport (same contract) and assert the scaling, corner
 * ordering, y-flip, and clamping math.
 */
import { describe, it, expect } from 'vitest';
import * as c from '../../components/PDFGear/coords';

describe('cssToCanvasPixel', () => {
    it('rescales CSS coords into the canvas bitmap space', () => {
        // Canvas displayed at 100×100 but bitmap is 200×200 → factor 2.
        const rect = { left: 0, top: 0, width: 100, height: 100 };
        expect(c.cssToCanvasPixel(50, 25, rect, 200, 200)).toEqual({ x: 100, y: 50 });
    });
    it('accounts for the bounding-rect offset', () => {
        const rect = { left: 20, top: 10, width: 100, height: 100 };
        expect(c.cssToCanvasPixel(70, 60, rect, 100, 100)).toEqual({ x: 50, y: 50 });
    });
    it('degrades gracefully on a zero-size rect', () => {
        const rect = { left: 0, top: 0, width: 0, height: 0 };
        expect(c.cssToCanvasPixel(10, 10, rect, 100, 100)).toEqual({ x: 10, y: 10 });
    });
});

describe('normalizeRect', () => {
    it('orders arbitrary corners into x/y/width/height', () => {
        expect(c.normalizeRect({ x: 80, y: 90 }, { x: 20, y: 10 })).toEqual({ x: 20, y: 10, width: 60, height: 80 });
    });
});

describe('projection via rotation-0 viewport', () => {
    const scale = 2;
    const pageH = 792;
    const vp = c.makeViewport0(scale, pageH);

    it('pdfPointFromViewport0 flips y and divides by scale', () => {
        expect(c.pdfPointFromViewport0(0, 0, scale, pageH)).toEqual({ x: 0, y: 792 });
        expect(c.pdfPointFromViewport0(100, 200, scale, pageH)).toEqual({ x: 50, y: 692 });
    });

    it('canvasPointToPdf uses the viewport', () => {
        expect(c.canvasPointToPdf({ x: 100, y: 200 }, vp)).toEqual({ x: 50, y: 692 });
    });

    it('canvasRectToPdfRect re-normalizes AFTER the y-flip', () => {
        // Drag from canvas (0,0) → (100,200). In PDF space those become
        // (0,792) and (50,692); the rect must take the lower y (692).
        const rect = c.canvasRectToPdfRect({ x: 0, y: 0 }, { x: 100, y: 200 }, vp);
        expect(rect).toEqual({ x: 0, y: 692, width: 50, height: 100 });
    });
});

describe('clampRectToPage', () => {
    it('keeps an in-bounds rect unchanged', () => {
        expect(c.clampRectToPage({ x: 10, y: 10, width: 50, height: 50 }, 600, 800)).toEqual({
            x: 10,
            y: 10,
            width: 50,
            height: 50,
        });
    });
    it('trims a rect that spills past the page box', () => {
        expect(c.clampRectToPage({ x: 580, y: 10, width: 100, height: 50 }, 600, 800)).toEqual({
            x: 580,
            y: 10,
            width: 20,
            height: 50,
        });
    });
});
