/**
 * Unit tests for the pure pdf-lib operations in PDFGear/pdfOps.ts.
 * Runs under node/jsdom (pdf-lib is pure JS — no canvas/pdfjs needed).
 *
 * Strategy: every op must produce bytes that RELOAD as a valid PDF with the
 * expected page count, and — where measurable — the structural change is
 * asserted directly (page sizes, rotation angle, metadata fields).
 */
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as ops from '../../components/PDFGear/pdfOps';

// 1×1 transparent PNG — smallest valid raster for image-embed tests.
const PNG_1x1_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
function png1x1(): Uint8Array {
    const bin = atob(PNG_1x1_BASE64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function fixture(pages = 3, w = 612, h = 792): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) {
        const p = doc.addPage([w, h]);
        // Give each page a real content stream so it mirrors a genuine PDF
        // (pages created by addPage alone are content-less).
        p.drawText(`Page ${i + 1}`, { x: 20, y: h - 40, size: 12 });
    }
    return doc.save();
}

async function countOf(bytes: Uint8Array): Promise<number> {
    const doc = await PDFDocument.load(bytes);
    return doc.getPageCount();
}

describe('parsePageRange', () => {
    it('expands ranges + singletons to sorted 0-based indices', () => {
        expect(ops.parsePageRange('1-3,5', 10)).toEqual([0, 1, 2, 4]);
    });
    it('drops out-of-range singletons, de-dupes + sorts', () => {
        // total=4 → "5" (idx 4) and "99" are out of range and dropped.
        expect(ops.parsePageRange('5,1,2-3,99', 4)).toEqual([0, 1, 2]);
    });
    it('tolerates reversed ranges and whitespace', () => {
        expect(ops.parsePageRange(' 3 - 1 ', 10)).toEqual([0, 1, 2]);
    });
    it('ignores garbage', () => {
        expect(ops.parsePageRange('abc,,', 10)).toEqual([]);
    });
});

describe('inspection', () => {
    it('getPageCount', async () => {
        expect(await ops.getPageCount(await fixture(4))).toBe(4);
    });
    it('getPageSizes', async () => {
        const sizes = await ops.getPageSizes(await fixture(2, 100, 200));
        expect(sizes).toHaveLength(2);
        expect(sizes[0]).toEqual({ width: 100, height: 200 });
    });
});

describe('assembly', () => {
    it('mergePdfs sums page counts', async () => {
        const merged = await ops.mergePdfs([await fixture(2), await fixture(3)]);
        expect(await countOf(merged)).toBe(5);
    });
    it('mergePdfs throws on empty input', async () => {
        await expect(ops.mergePdfs([])).rejects.toThrow();
    });
    it('extractPages keeps only selected', async () => {
        expect(await countOf(await ops.extractPages(await fixture(5), [0, 2, 4]))).toBe(3);
    });
    it('deletePages removes selected', async () => {
        expect(await countOf(await ops.deletePages(await fixture(5), [1, 3]))).toBe(3);
    });
    it('deletePages refuses to empty the document', async () => {
        await expect(ops.deletePages(await fixture(2), [0, 1])).rejects.toThrow();
    });
    it('reorderPages applies a permutation', async () => {
        expect(await countOf(await ops.reorderPages(await fixture(3), [2, 0, 1]))).toBe(3);
    });
    it('duplicatePages appends copies', async () => {
        expect(await countOf(await ops.duplicatePages(await fixture(3), [0, 1]))).toBe(5);
    });
    it('splitByCount chunks correctly', async () => {
        const chunks = await ops.splitByCount(await fixture(5), 2);
        expect(chunks).toHaveLength(3);
        expect(await countOf(chunks[0])).toBe(2);
        expect(await countOf(chunks[2])).toBe(1);
    });
    it('splitToSingles bursts to one page each', async () => {
        const singles = await ops.splitToSingles(await fixture(4));
        expect(singles).toHaveLength(4);
        expect(await countOf(singles[0])).toBe(1);
    });
});

describe('geometry', () => {
    it('rotatePages adds the angle to the page rotation', async () => {
        const out = await ops.rotatePages(await fixture(2), 90);
        const doc = await PDFDocument.load(out);
        expect(doc.getPage(0).getRotation().angle).toBe(90);
        expect(doc.getPage(1).getRotation().angle).toBe(90);
    });
    it('rotatePages only the targeted page', async () => {
        const out = await ops.rotatePages(await fixture(2), 180, [0]);
        const doc = await PDFDocument.load(out);
        expect(doc.getPage(0).getRotation().angle).toBe(180);
        expect(doc.getPage(1).getRotation().angle).toBe(0);
    });
    it('scalePages changes page dimensions by the factor', async () => {
        const out = await ops.scalePages(await fixture(1, 100, 200), 2);
        const sizes = await ops.getPageSizes(out);
        expect(sizes[0].width).toBeCloseTo(200, 1);
        expect(sizes[0].height).toBeCloseTo(400, 1);
    });
    it('scalePages rejects non-positive factors', async () => {
        await expect(ops.scalePages(await fixture(1), 0)).rejects.toThrow();
    });
    it('cropPages produces a valid document', async () => {
        const out = await ops.cropPages(await fixture(2), { x: 10, y: 10, width: 200, height: 300 });
        expect(await countOf(out)).toBe(2);
    });
    it('addBlankPage inserts after the index', async () => {
        const out = await ops.addBlankPage(await fixture(2), 0);
        expect(await countOf(out)).toBe(3);
    });
    it('addBlankPage at front (-1)', async () => {
        const out = await ops.addBlankPage(await fixture(2), -1, { width: 300, height: 300 });
        const sizes = await ops.getPageSizes(out);
        expect(sizes[0]).toEqual({ width: 300, height: 300 });
    });
    it('nUpPdf yields ceil(total/n) sheets', async () => {
        expect(await countOf(await ops.nUpPdf(await fixture(3), 2))).toBe(2);
        expect(await countOf(await ops.nUpPdf(await fixture(5), 4))).toBe(2);
        expect(await countOf(await ops.nUpPdf(await fixture(9), 9))).toBe(1);
    });
    it('nUpPdf rejects unsupported n', async () => {
        await expect(ops.nUpPdf(await fixture(3), 3)).rejects.toThrow();
    });
});

describe('overlay + images', () => {
    it('overlayPdf preserves base page count', async () => {
        const out = await ops.overlayPdf(await fixture(3), await fixture(1));
        expect(await countOf(out)).toBe(3);
    });
    it('imagesToPdf makes one page per image', async () => {
        const out = await ops.imagesToPdf([
            { bytes: png1x1(), type: 'png' },
            { bytes: png1x1(), type: 'png' },
        ]);
        expect(await countOf(out)).toBe(2);
    });
    it('imagesToPdf fit=page uses the requested page size', async () => {
        const out = await ops.imagesToPdf([{ bytes: png1x1(), type: 'png' }], {
            fit: 'page',
            pageSize: { width: 595, height: 842 },
        });
        const sizes = await ops.getPageSizes(out);
        expect(sizes[0]).toEqual({ width: 595, height: 842 });
    });
    it('stampImage keeps page count + stays valid', async () => {
        const out = await ops.stampImage(await fixture(2), {
            pageIndex: 1,
            bytes: png1x1(),
            type: 'png',
            x: 10,
            y: 10,
            width: 50,
            height: 50,
        });
        expect(await countOf(out)).toBe(2);
    });
    it('stampImage rejects out-of-range page', async () => {
        await expect(
            ops.stampImage(await fixture(1), { pageIndex: 9, bytes: png1x1(), type: 'png', x: 0, y: 0, width: 1, height: 1 }),
        ).rejects.toThrow();
    });
});

describe('annotations + placement', () => {
    it('placeText writes onto the page', async () => {
        const out = await ops.placeText(await fixture(1), { pageIndex: 0, x: 50, y: 50, text: 'hello' });
        expect(await countOf(out)).toBe(1);
    });
    it('placeText rejects out-of-range page', async () => {
        await expect(ops.placeText(await fixture(1), { pageIndex: 5, x: 0, y: 0, text: 'x' })).rejects.toThrow();
    });
    it('drawHighlight / outline / underline / checkmark stay valid', async () => {
        const base = await fixture(1);
        expect(await countOf(await ops.drawHighlight(base, 0, { x: 10, y: 10, width: 100, height: 12 }))).toBe(1);
        expect(await countOf(await ops.drawRectangleOutline(base, 0, { x: 10, y: 10, width: 80, height: 40 }))).toBe(1);
        expect(await countOf(await ops.drawUnderline(base, 0, { x: 10, y: 10 }, 120))).toBe(1);
        expect(await countOf(await ops.drawCheckmark(base, 0, 20, 20))).toBe(1);
    });
    it('drawRedactionBoxes paints across multiple pages', async () => {
        const out = await ops.drawRedactionBoxes(await fixture(3), {
            0: [{ x: 10, y: 10, width: 50, height: 20 }],
            2: [{ x: 5, y: 5, width: 100, height: 30 }],
        });
        expect(await countOf(out)).toBe(3);
    });
});

describe('watermark / numbers / compress', () => {
    it('addWatermark keeps page count', async () => {
        expect(await countOf(await ops.addWatermark(await fixture(2), { text: 'DRAFT' }))).toBe(2);
    });
    it('addPageNumbers keeps page count', async () => {
        expect(await countOf(await ops.addPageNumbers(await fixture(3)))).toBe(3);
    });
    it('compressStructural reloads valid', async () => {
        expect(await countOf(await ops.compressStructural(await fixture(4)))).toBe(4);
    });
});

describe('forms', () => {
    it('addTextField + flattenForm round-trip', async () => {
        const withField = await ops.addTextField(await fixture(1), 0, { x: 60, y: 60, width: 160, height: 22 }, 'name');
        expect(await countOf(withField)).toBe(1);
        const flat = await ops.flattenForm(withField);
        expect(await countOf(flat)).toBe(1);
    });
});

describe('metadata / sanitise / restrictions', () => {
    it('setMetadata + readMetadata round-trip', async () => {
        const out = await ops.setMetadata(await fixture(1), {
            title: 'My Title',
            author: 'Ilya',
            subject: 'Testing',
            creator: 'Dwellium',
        });
        const meta = await ops.readMetadata(out);
        expect(meta.title).toBe('My Title');
        expect(meta.author).toBe('Ilya');
        expect(meta.subject).toBe('Testing');
        expect(meta.creator).toBe('Dwellium');
        expect(meta.pageCount).toBe(1);
    });
    it('sanitize clears metadata and reports what it removed', async () => {
        const withMeta = await ops.setMetadata(await fixture(1), { title: 'Secret', author: 'Someone' });
        const { bytes, removed } = await ops.sanitize(withMeta);
        expect(removed).toContain('document metadata');
        const meta = await ops.readMetadata(bytes);
        expect(meta.title).toBeUndefined();
        expect(meta.author).toBeUndefined();
    });
    it('removeRestrictions reloads valid', async () => {
        expect(await countOf(await ops.removeRestrictions(await fixture(2)))).toBe(2);
    });
    it('createBlank makes a single page of the requested size', async () => {
        const out = await ops.createBlank({ width: 400, height: 500 });
        const sizes = await ops.getPageSizes(out);
        expect(sizes).toHaveLength(1);
        expect(sizes[0]).toEqual({ width: 400, height: 500 });
    });
});
