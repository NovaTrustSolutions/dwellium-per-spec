/**
 * pdfToMarkdown — real tiny PDFs (generated with pdf-lib in the test) parsed
 * through the pdfjs legacy build via the injectable `loadPdf` seam (the
 * browser loader in PDFGear/pdfRaster needs a worker URL the test env lacks).
 * Cap behavior is driven by a mocked page count.
 */
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
    pdfToMarkdown,
    itemsToParagraphs,
    scannedPageNotice,
    MAX_PDF_PAGES,
    type PdfLikeDocument,
} from '../components/Scribe/pdfToMarkdown';

async function loadPdfViaLegacyBuild(bytes: Uint8Array): Promise<PdfLikeDocument> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return pdfjs.getDocument({ data: bytes.slice(), disableWorker: true } as never).promise as Promise<PdfLikeDocument>;
}

async function makePdf(pages: Array<Array<{ text: string; y: number }>>): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const lines of pages) {
        const page = doc.addPage([300, 300]);
        for (const { text, y } of lines) page.drawText(text, { x: 20, y, size: 12, font });
    }
    return doc.save();
}

describe('pdfToMarkdown on real PDFs', () => {
    it('extracts a text page with the page marker', async () => {
        const bytes = await makePdf([[{ text: 'Hello world', y: 250 }]]);
        const { markdown, pages, truncated } = await pdfToMarkdown(bytes, loadPdfViaLegacyBuild);
        expect(pages).toBe(1);
        expect(truncated).toBe(false);
        expect(markdown).toContain('<!-- page 1 -->');
        expect(markdown).toContain('Hello world');
    });

    it('separates pages with --- and emits the scanned notice for an empty page', async () => {
        const bytes = await makePdf([
            [{ text: 'Page one text', y: 250 }],
            [], // no text layer → "looks scanned"
        ]);
        const { markdown } = await pdfToMarkdown(bytes, loadPdfViaLegacyBuild);
        expect(markdown).toContain('\n\n---\n\n');
        expect(markdown).toContain('<!-- page 1 -->');
        expect(markdown).toContain('<!-- page 2 -->');
        expect(markdown).toContain(scannedPageNotice(2));
        expect(markdown).toContain('PDF Gear and run OCR');
    });

    it('groups close lines into one paragraph and breaks on a big vertical gap (two-pager)', async () => {
        const bytes = await makePdf([
            [
                { text: 'First line', y: 250 },
                { text: 'second line', y: 236 },   // 14pt gap — same paragraph
                { text: 'New paragraph', y: 180 }, // 56pt gap — break
            ],
            [{ text: 'Second page', y: 250 }],
        ]);
        const { markdown, pages } = await pdfToMarkdown(bytes, loadPdfViaLegacyBuild);
        expect(pages).toBe(2);
        expect(markdown).toContain('First line second line');
        expect(markdown).toContain('\n\nNew paragraph');
        expect(markdown).toContain('Second page');
    });
});

describe('page cap', () => {
    it('stops at MAX_PDF_PAGES with an honest trailing note', async () => {
        const fake: PdfLikeDocument = {
            numPages: MAX_PDF_PAGES + 50,
            getPage: async (n: number) => ({
                getTextContent: async () => ({ items: [{ str: `p${n}`, transform: [1, 0, 0, 1, 20, 250] }] }),
            }),
        };
        const { markdown, pages, truncated } = await pdfToMarkdown(new Uint8Array(0), async () => fake);
        expect(pages).toBe(MAX_PDF_PAGES + 50);
        expect(truncated).toBe(true);
        expect(markdown).toContain(`<!-- page ${MAX_PDF_PAGES} -->`);
        expect(markdown).not.toContain(`<!-- page ${MAX_PDF_PAGES + 1} -->`);
        expect(markdown).toContain(`Stopped at page ${MAX_PDF_PAGES} of ${MAX_PDF_PAGES + 50}`);
    });
});

describe('itemsToParagraphs', () => {
    it('joins items on the same y into one line', () => {
        const paras = itemsToParagraphs([
            { str: 'a', transform: [1, 0, 0, 1, 0, 100] },
            { str: 'b', transform: [1, 0, 0, 1, 10, 100] },
        ]);
        expect(paras).toEqual(['a b']);
    });
    it('drops empty items and returns [] for a scanned-like page', () => {
        expect(itemsToParagraphs([{ str: '  ', transform: [1, 0, 0, 1, 0, 0] }])).toEqual([]);
        expect(itemsToParagraphs([])).toEqual([]);
    });
});
