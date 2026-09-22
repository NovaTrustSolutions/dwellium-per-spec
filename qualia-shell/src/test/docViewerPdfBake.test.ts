/**
 * Pins P0 item 1 (signature never baked into Save Back / Export) and item 3
 * (bakeAnnotations refuses to fabricate a document from empty bytes).
 *
 * Real PDFs via pdf-lib, read back with the pdfjs legacy build
 * (disableWorker: true) per the plan's node-testable pattern
 * (src/test/pdfToMarkdown.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { bakeAnnotations } from '../components/DocViewer/pdfBake';
import type { Annotation, AnnotationMap } from '../components/DocViewer/docViewerTypes';

async function makeBlankPdf(width = 300, height = 300): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([width, height]);
    return doc.save();
}

async function getOperatorCount(bytes: Uint8Array): Promise<number> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: bytes.slice(), disableWorker: true } as never).promise;
    const page = await doc.getPage(1);
    const opList = await page.getOperatorList();
    return opList.fnArray.length;
}

function flattenNumbers(x: unknown, out: number[]): void {
    if (typeof x === 'number') {
        out.push(x);
    } else if (ArrayBuffer.isView(x)) {
        // pdf.js path-construction args carry point coords in typed arrays
        // (e.g. Float32Array), which JSON round-trips as plain arrays but
        // are NOT `Array.isArray` at runtime — handle them explicitly.
        Array.from(x as unknown as ArrayLike<number>).forEach(v => out.push(v));
    } else if (Array.isArray(x)) {
        x.forEach(v => flattenNumbers(v, out));
    }
}

async function getAllOperatorArgNumbers(bytes: Uint8Array): Promise<number[]> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: bytes.slice(), disableWorker: true } as never).promise;
    const page = await doc.getPage(1);
    const opList = await page.getOperatorList();
    const nums: number[] = [];
    flattenNumbers(opList.argsArray, nums);
    return nums;
}

function signatureAnnotations(): AnnotationMap {
    const signature: Annotation = {
        id: 'sig-1',
        type: 'signature',
        page: 1,
        color: '#1a1a2e',
        opacity: 1,
        position: { x: 20, y: 40 },
        rect: { x: 20, y: 40, w: 60, h: 30 },
        // absolute annotation-space points, as normalizeSignatureStrokes produces
        signatureData: [[{ x: 20, y: 40 }, { x: 50, y: 55 }, { x: 80, y: 40 }]],
    };
    return new Map([[1, [signature]]]);
}

describe('bakeAnnotations — signature (P0 item 1)', () => {
    it('draws strokes into the page — baking with a signature differs from baking without one', async () => {
        const pdf = await makeBlankPdf();
        const withSig = await bakeAnnotations(pdf, signatureAnnotations());
        const withoutSig = await bakeAnnotations(pdf, new Map());

        expect(Buffer.compare(Buffer.from(withSig), Buffer.from(withoutSig))).not.toBe(0);
    });

    it('adds real drawing operators to page 1 (strokes are actually placed on the page)', async () => {
        const pdf = await makeBlankPdf();
        const withSig = await bakeAnnotations(pdf, signatureAnnotations());
        const withoutSig = await bakeAnnotations(pdf, new Map());

        const opsWith = await getOperatorCount(withSig);
        const opsWithout = await getOperatorCount(withoutSig);
        expect(opsWith).toBeGreaterThan(opsWithout);
    });

    it('places the signature at the expected PDF-space coordinates (y flipped from page height)', async () => {
        const height = 300;
        const pdf = await makeBlankPdf(300, height);
        const withSig = await bakeAnnotations(pdf, signatureAnnotations());
        const nums = await getAllOperatorArgNumbers(withSig);

        // Stroke point {x:20, y:40} bakes to PDF coords (20, height-40) = (20, 260).
        expect(nums.some(n => Math.abs(n - 20) < 0.5)).toBe(true);
        expect(nums.some(n => Math.abs(n - (height - 40)) < 0.5)).toBe(true);
    });
});

describe('bakeAnnotations — refuses to fabricate a document (P0 item 3)', () => {
    it('throws on empty pdfBytes', async () => {
        await expect(bakeAnnotations(new Uint8Array(0), new Map())).rejects.toThrow();
    });
});

describe('bakeAnnotations — other annotation types still bake (regression guard)', () => {
    it('bakes a highlight rectangle', async () => {
        const pdf = await makeBlankPdf();
        const highlight: Annotation = {
            id: 'h1', type: 'highlight', page: 1, color: '#f59e0b', opacity: 0.3,
            rect: { x: 10, y: 10, w: 50, h: 20 },
        };
        const baked = await bakeAnnotations(pdf, new Map([[1, [highlight]]]));
        const opsWith = await getOperatorCount(baked);
        const opsWithout = await getOperatorCount(await bakeAnnotations(pdf, new Map()));
        expect(opsWith).toBeGreaterThan(opsWithout);
    });
});
