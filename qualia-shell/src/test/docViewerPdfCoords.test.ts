/**
 * P1 item 6 — the ONE coordinate helper (pdfCoords.ts) used by the overlay
 * and pdfBake, proven correct against the REAL pdf.js viewport (parity), and
 * proven to round-trip through a real bake on a rotated page.
 *
 * Real PDFs via pdf-lib; read back with pdfjs-dist/legacy/build/pdf.mjs +
 * disableWorker: true (the plan's node-testable pattern, per
 * src/test/pdfToMarkdown.test.ts / docViewerPdfBake.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import {
    makeViewport, viewportToPdf, pdfToViewport,
    viewportRectToPdfRect, pdfRectToViewportRect,
} from '../components/DocViewer/pdfCoords';
import { bakeAnnotations } from '../components/DocViewer/pdfBake';
import type { Annotation, AnnotationMap } from '../components/DocViewer/docViewerTypes';

type Rotation = 0 | 90 | 180 | 270;

async function loadPdfjsPage(bytes: Uint8Array, pageNum = 1) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: bytes.slice(), disableWorker: true } as never).promise;
    return doc.getPage(pageNum);
}

async function getAllOperatorArgNumbers(bytes: Uint8Array): Promise<number[]> {
    const page = await loadPdfjsPage(bytes);
    const opList = await page.getOperatorList();
    const nums: number[] = [];
    const flatten = (x: unknown): void => {
        if (typeof x === 'number') nums.push(x);
        else if (ArrayBuffer.isView(x)) Array.from(x as unknown as ArrayLike<number>).forEach(flatten);
        else if (Array.isArray(x)) x.forEach(flatten);
    };
    flatten(opList.argsArray);
    return nums;
}

/** pdf.js's own Util.transform(m1, m2): composes m1 THEN m2 (row-vector convention). */
function composeTransforms(m1: number[], m2: number[]): number[] {
    return [
        m1[0] * m2[0] + m1[1] * m2[2],
        m1[0] * m2[1] + m1[1] * m2[3],
        m1[2] * m2[0] + m1[3] * m2[2],
        m1[2] * m2[1] + m1[3] * m2[3],
        m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
        m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
    ];
}

// ============================================================
// Test (i): parity — makeViewport's conversions match a REAL pdf.js
// viewport exactly, for rotation 0/90/180/270 and an offset CropBox.
// ============================================================
describe('pdfCoords.makeViewport parity with real pdfjs-dist viewport (test i)', () => {
    it('convertToViewportPoint/convertToPdfPoint match pdf.js at several points, all four 90-degree rotations, with an offset CropBox', async () => {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([300, 300]);
        // Offset CropBox (MediaBox stays 0,0,300,300) — the origin-adjustment
        // case the plan calls out.
        page.setCropBox(20, 30, 200, 150);
        const bytes = await pdfDoc.save();

        const pdfjsPage = await loadPdfjsPage(bytes);
        const viewBox = pdfjsPage.view as [number, number, number, number];

        const testPoints: Array<[number, number]> = [
            [viewBox[0], viewBox[1]],
            [viewBox[2], viewBox[3]],
            [viewBox[0], viewBox[3]],
            [viewBox[2], viewBox[1]],
            [(viewBox[0] + viewBox[2]) / 2, (viewBox[1] + viewBox[3]) / 2],
            [viewBox[0] + 30, viewBox[1] + 45],
            [viewBox[2] - 10, viewBox[3] - 5],
        ];

        for (const rotation of [0, 90, 180, 270] as Rotation[]) {
            const real = pdfjsPage.getViewport({ scale: 1.5, rotation });
            const mine = makeViewport({ viewBox, scale: 1.5, rotation });

            expect(mine.width).toBeCloseTo(real.width, 2);
            expect(mine.height).toBeCloseTo(real.height, 2);

            for (const [x, y] of testPoints) {
                const [rvx, rvy] = real.convertToViewportPoint(x, y);
                const mv = pdfToViewport(mine, x, y);
                expect(mv.x).toBeCloseTo(rvx, 2);
                expect(mv.y).toBeCloseTo(rvy, 2);

                const [rpx, rpy] = real.convertToPdfPoint(rvx, rvy);
                const mp = viewportToPdf(mine, rvx, rvy);
                expect(mp.x).toBeCloseTo(rpx, 2);
                expect(mp.y).toBeCloseTo(rpy, 2);
            }
        }
    });
});

// ============================================================
// Test (ii): bake round trip on a /Rotate 90 page — a highlight defined by
// a viewport rect bakes to PDF space, the baked bytes carry those exact
// numbers, and mapping back to viewport space returns the original rect
// within 1pt.
// ============================================================
describe('bake round-trip on a rotated page (P1 item 6, test ii)', () => {
    it('a highlight rect defined in viewport space survives bake -> read -> viewport round trip within 1pt', async () => {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([300, 400]);
        page.setRotation(degrees(90));
        const bytes = await pdfDoc.save();

        const pdfjsPage = await loadPdfjsPage(bytes);
        const viewBox = pdfjsPage.view as [number, number, number, number];
        expect(pdfjsPage.rotate).toBe(90);
        const viewport = makeViewport({ viewBox, scale: 1, rotation: pdfjsPage.rotate });

        const originalViewportRect = { x: 40, y: 60, w: 80, h: 30 };
        const pdfRect = viewportRectToPdfRect(viewport, originalViewportRect);

        const annotations: AnnotationMap = new Map([[1, [{
            id: 'h1', type: 'highlight', page: 1, color: '#f59e0b', opacity: 0.3, rect: pdfRect,
        } as Annotation]]]);
        const baked = await bakeAnnotations(bytes, annotations);

        // "Read the operator list": the baked PDF's own numbers carry the
        // PDF-space rect pdfBake.ts wrote (no more `height - y` flip — a
        // straight pass-through of pdfRect.x/y/w/h, P1 item 6).
        const nums = await getAllOperatorArgNumbers(baked);
        for (const target of [pdfRect.x, pdfRect.y, pdfRect.w, pdfRect.h]) {
            expect(nums.some(n => Math.abs(n - target) < 0.5)).toBe(true);
        }

        // Baked page still reports /Rotate 90 — bake never touches rotation.
        const bakedPage = await loadPdfjsPage(baked);
        expect(bakedPage.rotate).toBe(90);

        // Map the (unchanged-by-bake) PDF rect back to viewport space with
        // the SAME rotated viewport and compare to the ORIGINAL rect.
        const roundTripped = pdfRectToViewportRect(viewport, pdfRect);
        expect(Math.abs(roundTripped.x - originalViewportRect.x)).toBeLessThan(1);
        expect(Math.abs(roundTripped.y - originalViewportRect.y)).toBeLessThan(1);
        expect(Math.abs(roundTripped.w - originalViewportRect.w)).toBeLessThan(1);
        expect(Math.abs(roundTripped.h - originalViewportRect.h)).toBeLessThan(1);
    });
});

// ============================================================
// Test (iii): baked text on a rotated page reads upright — the text
// content item's own transform, composed with the (rotated) viewport
// transform, has ~0 rotation angle.
// ============================================================
describe('baked text/stamp stays upright on a rotated page (P1 item 6, test iii)', () => {
    it('a text annotation created with rotation:90 bakes upright in viewport space', async () => {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([300, 400]);
        page.setRotation(degrees(90));
        const bytes = await pdfDoc.save();

        const annotations: AnnotationMap = new Map([[1, [{
            id: 't1', type: 'text', page: 1, color: '#000000', opacity: 1,
            text: 'UPRIGHT', fontSize: 24,
            position: { x: 50, y: 50 },
            rotation: 90, // the page's /Rotate at creation time
        } as Annotation]]]);
        const baked = await bakeAnnotations(bytes, annotations);

        const bakedPage = await loadPdfjsPage(baked);
        const viewport = bakedPage.getViewport({ scale: 1 }); // uses page.rotate (90) by default
        const textContent = await bakedPage.getTextContent();
        const item = textContent.items.find((i: any) => 'str' in i && i.str === 'UPRIGHT') as { transform: number[] } | undefined;
        expect(item).toBeDefined();

        const combined = composeTransforms(item!.transform, viewport.transform);
        // Angle of the text's own x-axis after both transforms — ~0 (mod
        // 360) means the glyphs read left-to-right, upright, exactly as
        // typed, regardless of the page's /Rotate.
        const angleDeg = (Math.atan2(combined[1], combined[0]) * 180) / Math.PI;
        const normalized = ((angleDeg % 360) + 360) % 360;
        const distanceFromUpright = Math.min(normalized, 360 - normalized);
        expect(distanceFromUpright).toBeLessThan(1);
    });

    it('WITHOUT the rotation fix (rotation:0 on a rotated page) the text would NOT be upright — sanity check that the test can fail', async () => {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([300, 400]);
        page.setRotation(degrees(90));
        const bytes = await pdfDoc.save();

        const annotations: AnnotationMap = new Map([[1, [{
            id: 't2', type: 'text', page: 1, color: '#000000', opacity: 1,
            text: 'SIDEWAYS', fontSize: 24,
            position: { x: 50, y: 50 },
            rotation: 0, // deliberately wrong — proves the assertion is meaningful
        } as Annotation]]]);
        const baked = await bakeAnnotations(bytes, annotations);

        const bakedPage = await loadPdfjsPage(baked);
        const viewport = bakedPage.getViewport({ scale: 1 });
        const textContent = await bakedPage.getTextContent();
        const item = textContent.items.find((i: any) => 'str' in i && i.str === 'SIDEWAYS') as { transform: number[] } | undefined;
        expect(item).toBeDefined();

        const combined = composeTransforms(item!.transform, viewport.transform);
        const angleDeg = (Math.atan2(combined[1], combined[0]) * 180) / Math.PI;
        const normalized = ((angleDeg % 360) + 360) % 360;
        const distanceFromUpright = Math.min(normalized, 360 - normalized);
        expect(distanceFromUpright).toBeGreaterThan(45); // clearly NOT upright
    });
});

// ============================================================
// Unit-level: rect helper preserves line/arrow direction (not a 4-corner
// bounding box) and stays correct for axis-aligned shapes too.
// ============================================================
describe('viewportRectToPdfRect / pdfRectToViewportRect round trip (unrotated)', () => {
    it('round-trips an axis-aligned rect through an identity-ish (rotation 0) viewport', () => {
        const viewport = makeViewport({ viewBox: [0, 0, 300, 300], scale: 1, rotation: 0 });
        const rect = { x: 20, y: 30, w: 50, h: 15 };
        const pdfRect = viewportRectToPdfRect(viewport, rect);
        const back = pdfRectToViewportRect(viewport, pdfRect);
        expect(back.x).toBeCloseTo(rect.x, 6);
        expect(back.y).toBeCloseTo(rect.y, 6);
        expect(back.w).toBeCloseTo(rect.w, 6);
        expect(back.h).toBeCloseTo(rect.h, 6);
    });

    it('preserves a negative-w/h "line" rect (direction) through rotation 90', () => {
        const viewport = makeViewport({ viewBox: [0, 0, 300, 300], scale: 1, rotation: 90 });
        // A line from (100, 100) to (40, 160): w=-60, h=60.
        const lineRect = { x: 100, y: 100, w: -60, h: 60 };
        const pdfRect = viewportRectToPdfRect(viewport, lineRect);
        const back = pdfRectToViewportRect(viewport, pdfRect);
        expect(back.x).toBeCloseTo(lineRect.x, 6);
        expect(back.y).toBeCloseTo(lineRect.y, 6);
        expect(back.w).toBeCloseTo(lineRect.w, 6);
        expect(back.h).toBeCloseTo(lineRect.h, 6);
    });
});
