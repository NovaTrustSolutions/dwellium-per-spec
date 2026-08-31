/**
 * pdfToMarkdown — PDF bytes → markdown for Scribe's "open a PDF" path.
 *
 * Reuses PDF Gear's lazy pdfjs loader (`loadPdfjs` in PDFGear/pdfRaster —
 * the single SSR-safe entry point, same seam idocsImport already imports).
 * Per page: extract the text layer, group items into lines by y-position,
 * merge lines into paragraphs on vertical gaps. Pages are separated by
 * `\n\n---\n\n` and each carries an `<!-- page N -->` marker; a page with
 * no text layer emits an honest "looks scanned" notice instead.
 *
 * The pdfjs document is injectable (`loadPdf` seam) so tests can drive the
 * Node legacy build or a mock without touching the browser-only loader.
 */

export const MAX_PDF_PAGES = 200;
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

/** Minimal shape of the pdfjs objects we consume (keeps the seam mockable). */
export interface PdfLikeDocument {
    numPages: number;
    getPage(n: number): Promise<{
        getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
    }>;
}

export interface PdfMarkdownResult {
    markdown: string;
    pages: number;
    truncated: boolean;
}

export function scannedPageNotice(pageNum: number): string {
    return `> _Page ${pageNum} looks scanned — open the original in PDF Gear and run OCR._`;
}

/**
 * Text items → paragraphs. Items sharing a y (±2) form a line; a vertical
 * gap > 1.8× the median line gap (or with no history, > 14) starts a new
 * paragraph, otherwise lines join with a space.
 * ponytail: y-grouping only, no column/indent detection — layout heroics
 * live in PDF Gear if ever needed.
 */
export function itemsToParagraphs(items: Array<{ str?: string; transform?: number[] }>): string[] {
    interface Line { y: number; parts: string[] }
    const lines: Line[] = [];
    for (const it of items) {
        const str = (it.str ?? '').trim();
        if (!str) continue;
        const y = it.transform?.[5] ?? 0;
        const line = lines.find(l => Math.abs(l.y - y) <= 2);
        if (line) line.parts.push(str);
        else lines.push({ y, parts: [str] });
    }
    if (lines.length === 0) return [];
    lines.sort((a, b) => b.y - a.y); // top of page first (PDF y grows upward)

    const gaps = lines.slice(1).map((l, i) => Math.abs(lines[i].y - l.y)).filter(g => g > 0);
    // Lower median — the typical line gap, not inflated by paragraph gaps.
    const median = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor((gaps.length - 1) / 2)] : 0;
    const breakGap = median > 0 ? median * 1.8 : 14;

    const paragraphs: string[] = [];
    let current: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const text = lines[i].parts.join(' ');
        if (i > 0 && Math.abs(lines[i - 1].y - lines[i].y) > breakGap && current.length) {
            paragraphs.push(current.join(' '));
            current = [];
        }
        current.push(text);
    }
    if (current.length) paragraphs.push(current.join(' '));
    return paragraphs;
}

/** Default loader — PDF Gear's shared pdfjs machinery (browser-only). */
async function defaultLoadPdf(bytes: Uint8Array): Promise<PdfLikeDocument> {
    const { loadPdfjs } = await import('../PDFGear/pdfRaster');
    const lib = await loadPdfjs();
    // pdfjs detaches the buffer it parses — hand it a copy.
    return lib.getDocument({ data: bytes.slice() }).promise as Promise<PdfLikeDocument>;
}

/** PDF bytes → markdown. Caps at MAX_PDF_PAGES with an honest trailing note. */
export async function pdfToMarkdown(
    bytes: Uint8Array,
    loadPdf: (bytes: Uint8Array) => Promise<PdfLikeDocument> = defaultLoadPdf,
): Promise<PdfMarkdownResult> {
    const pdf = await loadPdf(bytes);
    const total = pdf.numPages;
    const limit = Math.min(total, MAX_PDF_PAGES);
    const parts: string[] = [];
    for (let n = 1; n <= limit; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const paragraphs = itemsToParagraphs(content.items);
        const body = paragraphs.length ? paragraphs.join('\n\n') : scannedPageNotice(n);
        parts.push(`<!-- page ${n} -->\n${body}`);
    }
    const truncated = total > limit;
    if (truncated) {
        parts.push(`> _Stopped at page ${limit} of ${total} — open the original in PDF Gear for the rest._`);
    }
    return { markdown: parts.join('\n\n---\n\n') + '\n', pages: total, truncated };
}
