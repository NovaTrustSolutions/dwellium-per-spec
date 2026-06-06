/**
 * pdfOps — pure, client-side PDF operations built on pdf-lib.
 *
 * Every function takes raw PDF `Uint8Array` bytes and returns new bytes (or an
 * array of byte chunks for split operations). No React, no DOM, no network —
 * which makes the whole module unit-testable under node/vitest and reusable
 * from the PDFGear UI, the Scribe export path, or a headless pipeline.
 *
 * pdfjs-dependent operations (text extraction, rasterise, OCR, true
 * redaction-by-flatten) live in `pdfRaster.ts` so importing this module never
 * pulls the pdfjs DOMMatrix dependency (keeps SSR + tests clean).
 *
 * Coverage mirrors the client-addressable half of the Stirling-PDF / PDF Gear
 * tool matrix. Operations that genuinely require native binaries (Ghostscript
 * real-compression, LibreOffice office conversions, AES encryption add,
 * certificate signing, PDF/A, qpdf repair) are intentionally NOT here — they
 * are honest backend-gated calls in the component.
 */
import {
    PDFDocument,
    PDFName,
    StandardFonts,
    degrees,
    rgb,
    type PDFPage,
    type Color,
} from 'pdf-lib';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** A rectangle in PDF user-space (origin bottom-left, y points up). */
export interface PdfRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TextPlacement {
    pageIndex: number; // 0-based
    x: number;
    y: number;
    text: string;
    size?: number;
    color?: { r: number; g: number; b: number };
    /** Use an oblique (italic) face — handy for signatures. */
    oblique?: boolean;
    bold?: boolean;
    rotate?: number; // degrees
    opacity?: number;
}

export interface ImageStamp {
    pageIndex: number; // 0-based
    /** PNG or JPG bytes. */
    bytes: Uint8Array;
    type: 'png' | 'jpg';
    x: number;
    y: number;
    width: number;
    height: number;
    opacity?: number;
    rotate?: number;
}

export interface PdfMetadata {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    creator?: string;
    producer?: string;
}

export interface WatermarkOptions {
    text: string;
    opacity?: number;
    fontSize?: number; // fraction of min(width,height) when <= 1, else absolute pt
    color?: { r: number; g: number; b: number };
    rotate?: number;
    pages?: number[]; // 0-based; default all
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// pdf-lib never detaches the input buffer, but callers often share a buffer
// with pdfjs (which DOES detach). Hand pdf-lib a private copy to be safe.
function load(bytes: Uint8Array, ignoreEncryption = false): Promise<PDFDocument> {
    return PDFDocument.load(bytes.slice(), { ignoreEncryption });
}

function toColor(c?: { r: number; g: number; b: number }): Color {
    if (!c) return rgb(0, 0, 0);
    return rgb(c.r, c.g, c.b);
}

/**
 * pdf-lib's page embedder (`embedPage`/`embedPages`) throws
 * MissingPageContentsEmbeddingError on pages that have no content stream — e.g.
 * a page just created by `addPage`/`insertPage`. Materialise an empty (fully
 * transparent, zero-size) draw op so n-up / overlay never crash on such pages.
 */
function ensureContents(doc: PDFDocument): void {
    doc.getPages().forEach((p) => {
        const node = p.node as unknown as { Contents?: () => unknown };
        const hasContents = typeof node.Contents === 'function' ? node.Contents() : undefined;
        if (!hasContents) p.drawRectangle({ x: 0, y: 0, width: 0, height: 0, opacity: 0 });
    });
}

/** Expand a 1-based "1-3,5,7-9" range string into sorted, de-duped 0-based indices. */
export function parsePageRange(input: string, total: number): number[] {
    const out: number[] = [];
    for (const part of input.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (trimmed.includes('-')) {
            const [s, e] = trimmed.split('-').map((n) => Number(n.trim()));
            if (Number.isNaN(s) || Number.isNaN(e)) continue;
            const lo = Math.min(s, e);
            const hi = Math.max(s, e);
            for (let i = Math.max(1, lo); i <= Math.min(total, hi); i++) out.push(i - 1);
        } else {
            const n = Number(trimmed);
            if (n >= 1 && n <= total) out.push(n - 1);
        }
    }
    return Array.from(new Set(out)).sort((a, b) => a - b);
}

/** Number of pages in a document without committing to a full render. */
export async function getPageCount(bytes: Uint8Array): Promise<number> {
    const doc = await load(bytes, true);
    return doc.getPageCount();
}

/** Per-page sizes in points (post-rotation-agnostic media box). */
export async function getPageSizes(bytes: Uint8Array): Promise<Array<{ width: number; height: number }>> {
    const doc = await load(bytes, true);
    return doc.getPages().map((p) => p.getSize());
}

// ---------------------------------------------------------------------------
// Document assembly: merge / split / extract / reorder / duplicate
// ---------------------------------------------------------------------------

export async function mergePdfs(sources: Uint8Array[]): Promise<Uint8Array> {
    if (sources.length === 0) throw new Error('No PDFs to merge');
    const out = await PDFDocument.create();
    for (const src of sources) {
        const doc = await load(src);
        const pages = await out.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => out.addPage(p));
    }
    return out.save();
}

/** Keep only `indices` (0-based), in the order given. */
export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
    if (indices.length === 0) throw new Error('No pages selected');
    const doc = await load(bytes);
    const out = await PDFDocument.create();
    const copied = await out.copyPages(doc, indices);
    copied.forEach((p) => out.addPage(p));
    return out.save();
}

/** Remove `indices` (0-based); errors if it would empty the document. */
export async function deletePages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
    const doc = await load(bytes);
    const total = doc.getPageCount();
    const removeSet = new Set(indices.filter((i) => i >= 0 && i < total));
    if (removeSet.size === 0) throw new Error('No valid pages to delete');
    if (removeSet.size >= total) throw new Error('Cannot delete every page');
    Array.from(removeSet)
        .sort((a, b) => b - a)
        .forEach((i) => doc.removePage(i));
    return doc.save();
}

/** Reorder pages to the given 0-based permutation. Missing pages are dropped; duplicates allowed. */
export async function reorderPages(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
    const doc = await load(bytes);
    const total = doc.getPageCount();
    const valid = order.filter((i) => i >= 0 && i < total);
    if (valid.length === 0) throw new Error('Empty page order');
    const out = await PDFDocument.create();
    const copied = await out.copyPages(doc, valid);
    copied.forEach((p) => out.addPage(p));
    return out.save();
}

/** Append copies of `indices` to the end of the document. */
export async function duplicatePages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
    const doc = await load(bytes);
    const copied = await doc.copyPages(doc, indices);
    copied.forEach((p) => doc.addPage(p));
    return doc.save();
}

/** Split into chunks of at most `n` pages each. Returns one byte array per chunk. */
export async function splitByCount(bytes: Uint8Array, n: number): Promise<Uint8Array[]> {
    if (n < 1) throw new Error('Chunk size must be ≥ 1');
    const doc = await load(bytes);
    const total = doc.getPageCount();
    const chunks: Uint8Array[] = [];
    for (let start = 0; start < total; start += n) {
        const out = await PDFDocument.create();
        const indices: number[] = [];
        for (let i = start; i < Math.min(start + n, total); i++) indices.push(i);
        const copied = await out.copyPages(doc, indices);
        copied.forEach((p) => out.addPage(p));
        chunks.push(await out.save());
    }
    return chunks;
}

/** Burst into one document per page. */
export function splitToSingles(bytes: Uint8Array): Promise<Uint8Array[]> {
    return splitByCount(bytes, 1);
}

// ---------------------------------------------------------------------------
// Page geometry: rotate / crop / scale / blank page / n-up
// ---------------------------------------------------------------------------

export async function rotatePages(bytes: Uint8Array, angle: number, indices?: number[]): Promise<Uint8Array> {
    const doc = await load(bytes);
    const total = doc.getPageCount();
    const target = indices && indices.length ? indices : Array.from({ length: total }, (_, i) => i);
    target.forEach((i) => {
        if (i < 0 || i >= total) return;
        const p = doc.getPage(i);
        p.setRotation(degrees((p.getRotation().angle + angle + 360) % 360));
    });
    return doc.save();
}

/** Set the crop box (PDF points, origin bottom-left) on the given pages. */
export async function cropPages(bytes: Uint8Array, box: PdfRect, indices?: number[]): Promise<Uint8Array> {
    const doc = await load(bytes);
    const total = doc.getPageCount();
    const target = indices && indices.length ? indices : Array.from({ length: total }, (_, i) => i);
    target.forEach((i) => {
        if (i < 0 || i >= total) return;
        doc.getPage(i).setCropBox(box.x, box.y, box.width, box.height);
    });
    return doc.save();
}

/** Uniformly scale page size + content by `factor`. */
export async function scalePages(bytes: Uint8Array, factor: number, indices?: number[]): Promise<Uint8Array> {
    if (factor <= 0) throw new Error('Scale factor must be > 0');
    const doc = await load(bytes);
    const total = doc.getPageCount();
    const target = indices && indices.length ? indices : Array.from({ length: total }, (_, i) => i);
    target.forEach((i) => {
        if (i < 0 || i >= total) return;
        doc.getPage(i).scale(factor, factor);
    });
    return doc.save();
}

/** Insert a blank page (default: copy the size of the page before it) after `afterIndex` (−1 = front). */
export async function addBlankPage(
    bytes: Uint8Array,
    afterIndex: number,
    size?: { width: number; height: number },
): Promise<Uint8Array> {
    const doc = await load(bytes);
    const total = doc.getPageCount();
    const ref = Math.min(Math.max(afterIndex, -1), total - 1);
    const dims = size || (ref >= 0 ? doc.getPage(ref).getSize() : { width: 612, height: 792 });
    const insertAt = ref + 1;
    const page = doc.insertPage(insertAt, [dims.width, dims.height]);
    void page;
    return doc.save();
}

const NUP_GRID: Record<number, { cols: number; rows: number }> = {
    2: { cols: 2, rows: 1 },
    4: { cols: 2, rows: 2 },
    6: { cols: 3, rows: 2 },
    8: { cols: 4, rows: 2 },
    9: { cols: 3, rows: 3 },
    16: { cols: 4, rows: 4 },
};

/**
 * N-up: place `n` source pages on each output sheet in a grid. Output sheet
 * size matches the first source page; each cell scales its page to fit while
 * preserving aspect ratio. Output page count = ceil(total / n).
 */
export async function nUpPdf(bytes: Uint8Array, n: number, gap = 8): Promise<Uint8Array> {
    const grid = NUP_GRID[n];
    if (!grid) throw new Error(`Unsupported n-up value: ${n} (use 2,4,6,8,9,16)`);
    const src = await load(bytes);
    const total = src.getPageCount();
    if (total === 0) throw new Error('Empty document');
    const out = await PDFDocument.create();
    const first = src.getPage(0).getSize();
    const sheetW = first.width;
    const sheetH = first.height;
    const embedded = await out.embedPages(src.getPages());

    const cellW = (sheetW - gap * (grid.cols + 1)) / grid.cols;
    const cellH = (sheetH - gap * (grid.rows + 1)) / grid.rows;

    for (let start = 0; start < total; start += n) {
        const sheet = out.addPage([sheetW, sheetH]);
        for (let k = 0; k < n && start + k < total; k++) {
            const ep = embedded[start + k];
            const col = k % grid.cols;
            const row = Math.floor(k / grid.cols);
            const scale = Math.min(cellW / ep.width, cellH / ep.height);
            const w = ep.width * scale;
            const h = ep.height * scale;
            const cellX = gap + col * (cellW + gap);
            // rows fill top → bottom; PDF y origin is bottom-left
            const cellTop = sheetH - (gap + row * (cellH + gap));
            const x = cellX + (cellW - w) / 2;
            const y = cellTop - cellH + (cellH - h) / 2;
            sheet.drawPage(ep, { x, y, width: w, height: h });
        }
    }
    return out.save();
}

// ---------------------------------------------------------------------------
// Overlay / stamp another PDF
// ---------------------------------------------------------------------------

/** Stamp every page of `stampBytes` (page 0 by default) over the matching base pages. */
export async function overlayPdf(
    baseBytes: Uint8Array,
    stampBytes: Uint8Array,
    opts: { opacity?: number; stampPageIndex?: number; pages?: number[] } = {},
): Promise<Uint8Array> {
    const base = await load(baseBytes);
    const stampDoc = await load(stampBytes);
    const stampIdx = opts.stampPageIndex ?? 0;
    const [embedded] = await base.embedPages([stampDoc.getPage(stampIdx)]);
    const total = base.getPageCount();
    const target = opts.pages && opts.pages.length ? opts.pages : Array.from({ length: total }, (_, i) => i);
    target.forEach((i) => {
        if (i < 0 || i >= total) return;
        const page = base.getPage(i);
        const { width, height } = page.getSize();
        const scale = Math.min(width / embedded.width, height / embedded.height);
        page.drawPage(embedded, {
            x: (width - embedded.width * scale) / 2,
            y: (height - embedded.height * scale) / 2,
            width: embedded.width * scale,
            height: embedded.height * scale,
            opacity: opts.opacity ?? 0.5,
        });
    });
    return base.save();
}

// ---------------------------------------------------------------------------
// Image ↔ PDF
// ---------------------------------------------------------------------------

/** Build a PDF from an ordered list of PNG/JPG images, one image per page. */
export async function imagesToPdf(
    images: Array<{ bytes: Uint8Array; type: 'png' | 'jpg' }>,
    opts: { fit?: 'page' | 'image'; pageSize?: { width: number; height: number } } = {},
): Promise<Uint8Array> {
    if (images.length === 0) throw new Error('No images provided');
    const out = await PDFDocument.create();
    for (const img of images) {
        const embedded = img.type === 'png' ? await out.embedPng(img.bytes) : await out.embedJpg(img.bytes);
        if (opts.fit === 'page' && opts.pageSize) {
            const page = out.addPage([opts.pageSize.width, opts.pageSize.height]);
            const scale = Math.min(page.getWidth() / embedded.width, page.getHeight() / embedded.height);
            const w = embedded.width * scale;
            const h = embedded.height * scale;
            page.drawImage(embedded, {
                x: (page.getWidth() - w) / 2,
                y: (page.getHeight() - h) / 2,
                width: w,
                height: h,
            });
        } else {
            const page = out.addPage([embedded.width, embedded.height]);
            page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
        }
    }
    return out.save();
}

/** Stamp a raster image (signature, logo, photo) onto a page at PDF coords. */
export async function stampImage(bytes: Uint8Array, stamp: ImageStamp): Promise<Uint8Array> {
    const doc = await load(bytes);
    if (stamp.pageIndex < 0 || stamp.pageIndex >= doc.getPageCount()) throw new Error('Page out of range');
    const embedded = stamp.type === 'png' ? await doc.embedPng(stamp.bytes) : await doc.embedJpg(stamp.bytes);
    doc.getPage(stamp.pageIndex).drawImage(embedded, {
        x: stamp.x,
        y: stamp.y,
        width: stamp.width,
        height: stamp.height,
        opacity: stamp.opacity ?? 1,
        rotate: stamp.rotate ? degrees(stamp.rotate) : undefined,
    });
    return doc.save();
}

// ---------------------------------------------------------------------------
// Drawing primitives at PDF coordinates (used by click-on-canvas placement)
// ---------------------------------------------------------------------------

export async function placeText(bytes: Uint8Array, p: TextPlacement): Promise<Uint8Array> {
    const doc = await load(bytes);
    if (p.pageIndex < 0 || p.pageIndex >= doc.getPageCount()) throw new Error('Page out of range');
    const fontName = p.bold
        ? StandardFonts.HelveticaBold
        : p.oblique
          ? StandardFonts.HelveticaOblique
          : StandardFonts.Helvetica;
    const font = await doc.embedFont(fontName);
    doc.getPage(p.pageIndex).drawText(p.text, {
        x: p.x,
        y: p.y,
        size: p.size ?? 14,
        font,
        color: toColor(p.color),
        rotate: p.rotate ? degrees(p.rotate) : undefined,
        opacity: p.opacity ?? 1,
    });
    return doc.save();
}

export async function drawHighlight(bytes: Uint8Array, pageIndex: number, rect: PdfRect): Promise<Uint8Array> {
    const doc = await load(bytes);
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) throw new Error('Page out of range');
    doc.getPage(pageIndex).drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: rgb(1, 0.9, 0.2),
        opacity: 0.4,
    });
    return doc.save();
}

export async function drawRectangleOutline(
    bytes: Uint8Array,
    pageIndex: number,
    rect: PdfRect,
    color = { r: 0.85, g: 0.1, b: 0.1 },
    borderWidth = 1.5,
): Promise<Uint8Array> {
    const doc = await load(bytes);
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) throw new Error('Page out of range');
    doc.getPage(pageIndex).drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        borderColor: toColor(color),
        borderWidth,
    });
    return doc.save();
}

export async function drawUnderline(
    bytes: Uint8Array,
    pageIndex: number,
    from: { x: number; y: number },
    length: number,
    color = { r: 0.85, g: 0.1, b: 0.1 },
): Promise<Uint8Array> {
    const doc = await load(bytes);
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) throw new Error('Page out of range');
    doc.getPage(pageIndex).drawLine({
        start: { x: from.x, y: from.y },
        end: { x: from.x + length, y: from.y },
        thickness: 1.5,
        color: toColor(color),
    });
    return doc.save();
}

/**
 * Draw opaque black boxes over the given rects. NOTE: this is *visual* only —
 * the underlying text still exists in the content stream. For true redaction
 * (text removed) use `redactAndFlatten` in pdfRaster.ts, which rasterises the
 * affected pages so nothing is recoverable.
 */
export async function drawRedactionBoxes(
    bytes: Uint8Array,
    rectsByPage: Record<number, PdfRect[]>,
): Promise<Uint8Array> {
    const doc = await load(bytes);
    const total = doc.getPageCount();
    for (const [pageStr, rects] of Object.entries(rectsByPage)) {
        const i = Number(pageStr);
        if (i < 0 || i >= total) continue;
        const page = doc.getPage(i);
        rects.forEach((r) => page.drawRectangle({ x: r.x, y: r.y, width: r.width, height: r.height, color: rgb(0, 0, 0) }));
    }
    return doc.save();
}

// ---------------------------------------------------------------------------
// Watermark / page numbers / compress
// ---------------------------------------------------------------------------

export async function addWatermark(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array> {
    const doc = await load(bytes);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const pages = doc.getPages();
    const target = opts.pages && opts.pages.length ? opts.pages : pages.map((_, i) => i);
    target.forEach((i) => {
        if (i < 0 || i >= pages.length) return;
        const p = pages[i];
        const { width, height } = p.getSize();
        const size = !opts.fontSize ? Math.min(width, height) * 0.18 : opts.fontSize <= 1 ? Math.min(width, height) * opts.fontSize : opts.fontSize;
        const textWidth = font.widthOfTextAtSize(opts.text, size);
        p.drawText(opts.text, {
            x: (width - textWidth) / 2,
            y: height / 2,
            size,
            font,
            color: toColor(opts.color || { r: 0.75, g: 0.75, b: 0.75 }),
            opacity: opts.opacity ?? 0.35,
            rotate: degrees(opts.rotate ?? 45),
        });
    });
    return doc.save();
}

export async function addPageNumbers(
    bytes: Uint8Array,
    opts: { format?: 'n' | 'n/total'; fontSize?: number; marginBottom?: number } = {},
): Promise<Uint8Array> {
    const doc = await load(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const size = opts.fontSize ?? 10;
    pages.forEach((p, i) => {
        const { width } = p.getSize();
        const label = opts.format === 'n' ? `${i + 1}` : `${i + 1} / ${pages.length}`;
        const textWidth = font.widthOfTextAtSize(label, size);
        p.drawText(label, { x: (width - textWidth) / 2, y: opts.marginBottom ?? 24, size, font, color: rgb(0.4, 0.4, 0.4) });
    });
    return doc.save();
}

/** Re-serialise with object streams. Lossless structural packing (~15-30% on uncompressed PDFs). */
export async function compressStructural(bytes: Uint8Array): Promise<Uint8Array> {
    const doc = await load(bytes, true);
    return doc.save({ useObjectStreams: true, addDefaultPage: false });
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export async function addTextField(
    bytes: Uint8Array,
    pageIndex: number,
    rect: PdfRect,
    name: string,
): Promise<Uint8Array> {
    const doc = await load(bytes);
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) throw new Error('Page out of range');
    const form = doc.getForm();
    const field = form.createTextField(`${name}_${Math.random().toString(36).slice(2, 7)}`);
    field.setText('');
    field.addToPage(doc.getPage(pageIndex), {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        borderWidth: 1,
        borderColor: rgb(0.4, 0.4, 0.4),
    });
    return doc.save();
}

export async function flattenForm(bytes: Uint8Array): Promise<Uint8Array> {
    const doc = await load(bytes);
    doc.getForm().flatten();
    return doc.save();
}

// ---------------------------------------------------------------------------
// Metadata / sanitise / restrictions
// ---------------------------------------------------------------------------

export async function setMetadata(bytes: Uint8Array, meta: PdfMetadata): Promise<Uint8Array> {
    const doc = await load(bytes, true);
    if (meta.title !== undefined) doc.setTitle(meta.title);
    if (meta.author !== undefined) doc.setAuthor(meta.author);
    if (meta.subject !== undefined) doc.setSubject(meta.subject);
    if (meta.keywords !== undefined) doc.setKeywords(meta.keywords);
    if (meta.creator !== undefined) doc.setCreator(meta.creator);
    if (meta.producer !== undefined) doc.setProducer(meta.producer);
    doc.setModificationDate(new Date());
    return doc.save();
}

/** Read the document-info dictionary fields pdf-lib exposes. */
export async function readMetadata(bytes: Uint8Array): Promise<PdfMetadata & { pageCount: number }> {
    const doc = await load(bytes, true);
    return {
        title: doc.getTitle() || undefined,
        author: doc.getAuthor() || undefined,
        subject: doc.getSubject() || undefined,
        keywords: doc.getKeywords() ? [doc.getKeywords() as string] : undefined,
        creator: doc.getCreator() || undefined,
        producer: doc.getProducer() || undefined,
        pageCount: doc.getPageCount(),
    };
}

/**
 * Strip document metadata and best-effort remove document-level JavaScript
 * (OpenAction + Names→JavaScript). Returns the cleaned bytes plus a list of
 * what was actually removed so the UI can report honestly.
 */
export async function sanitize(
    bytes: Uint8Array,
    opts: { metadata?: boolean; javascript?: boolean } = { metadata: true, javascript: true },
): Promise<{ bytes: Uint8Array; removed: string[] }> {
    const doc = await load(bytes, true);
    const removed: string[] = [];
    if (opts.metadata !== false) {
        doc.setTitle('');
        doc.setAuthor('');
        doc.setSubject('');
        doc.setKeywords([]);
        doc.setCreator('');
        doc.setProducer('');
        removed.push('document metadata');
    }
    if (opts.javascript !== false) {
        try {
            const catalog = doc.catalog;
            if (catalog.has(PDFName.of('OpenAction'))) {
                catalog.delete(PDFName.of('OpenAction'));
                removed.push('OpenAction');
            }
            const names = catalog.lookup(PDFName.of('Names'));
            // names is a PDFDict when present; remove the JavaScript name tree.
            if (names && typeof (names as any).has === 'function' && (names as any).has(PDFName.of('JavaScript'))) {
                (names as any).delete(PDFName.of('JavaScript'));
                removed.push('document JavaScript');
            }
        } catch {
            /* best-effort; never throw on sanitise */
        }
    }
    return { bytes: await doc.save(), removed };
}

/**
 * Re-save with encryption ignored — clears owner-level restrictions (printing,
 * copying, editing flags) on PDFs whose content streams are not strongly
 * encrypted. Does NOT decrypt user-password-locked content (that needs the
 * password via pdfjs, or a backend). Honest label: "remove restrictions".
 */
export async function removeRestrictions(bytes: Uint8Array): Promise<Uint8Array> {
    const doc = await load(bytes, true);
    return doc.save();
}

/** Helper used by the UI: build a single-checkmark drawing (two strokes) on a page. */
export async function drawCheckmark(bytes: Uint8Array, pageIndex: number, x: number, y: number): Promise<Uint8Array> {
    const doc = await load(bytes);
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) throw new Error('Page out of range');
    const page = doc.getPage(pageIndex);
    const color = rgb(0.13, 0.55, 0.13);
    page.drawLine({ start: { x, y: y + 4 }, end: { x: x + 6, y }, thickness: 2.5, color });
    page.drawLine({ start: { x: x + 6, y }, end: { x: x + 18, y: y + 16 }, thickness: 2.5, color });
    return doc.save();
}

/** Create a blank single-page document (US Letter by default). */
export async function createBlank(size: { width: number; height: number } = { width: 612, height: 792 }): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([size.width, size.height]);
    return doc.save();
}

// Re-export a couple of pdf-lib helpers used as values by the component.
export { PDFPage };
