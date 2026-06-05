/**
 * pdfRaster — PDF operations that need pdfjs (text extraction, rasterise,
 * metadata, blank-page detection, true redaction, PDF compare, image export).
 *
 * Kept separate from pdfOps.ts because pdfjs-dist touches DOMMatrix/canvas at
 * import time, which throws during SSR. Everything here is invoked only from
 * event handlers on the client; the lazy `loadPdfjs()` loader is the single
 * SSR-safe entry point (mirrors the guard pattern in PDFGear.tsx and the
 * Phase-9+ widget-altitude SSR taxonomy in CLAUDE.md).
 */
import { PDFDocument } from 'pdf-lib';
import { drawRedactionBoxes, deletePages, type PdfRect } from './pdfOps';

type PdfjsLib = typeof import('pdfjs-dist');
let pdfjsLibPromise: Promise<PdfjsLib> | null = null;

/** Lazy, cached, client-only pdfjs loader with worker wiring. */
export function loadPdfjs(): Promise<PdfjsLib> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('pdfjs-dist is browser-only'));
    }
    if (!pdfjsLibPromise) {
        pdfjsLibPromise = import('pdfjs-dist').then((lib) => {
            lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
            return lib;
        });
    }
    return pdfjsLibPromise;
}

async function getDoc(bytes: Uint8Array) {
    const pdfjsLib = await loadPdfjs();
    // pdfjs detaches the buffer it parses — hand it a copy.
    return pdfjsLib.getDocument({ data: bytes.slice() }).promise;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Per-page plain text (joined). */
export async function extractTextPerPage(bytes: Uint8Array): Promise<string[]> {
    const pdf = await getDoc(bytes);
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' '));
    }
    return pages;
}

export async function extractText(bytes: Uint8Array): Promise<string> {
    const pages = await extractTextPerPage(bytes);
    return pages.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n');
}

// ---------------------------------------------------------------------------
// Rasterise
// ---------------------------------------------------------------------------

/** Render one page (0-based) to a PNG blob at the given scale. Browser only. */
export async function renderPageToPng(bytes: Uint8Array, pageIndex: number, scale = 2): Promise<Blob> {
    const pdf = await getDoc(bytes);
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    );
}

/** Render every page to a PNG blob (Stirling "PDF → images", all pages). */
export async function renderAllPagesToPng(bytes: Uint8Array, scale = 2): Promise<Blob[]> {
    const pdf = await getDoc(bytes);
    const out: Blob[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (blob) out.push(blob);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Info / metadata
// ---------------------------------------------------------------------------

export interface PdfInfo {
    numPages: number;
    fingerprint: string | null;
    pdfVersion?: string;
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modDate?: string;
    pageSizes: Array<{ width: number; height: number }>;
}

export async function getInfo(bytes: Uint8Array): Promise<PdfInfo> {
    const pdf = await getDoc(bytes);
    const meta = await pdf.getMetadata().catch(() => null);
    const info: any = meta?.info ?? {};
    const pageSizes: Array<{ width: number; height: number }> = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        pageSizes.push({ width: Math.round(vp.width), height: Math.round(vp.height) });
    }
    return {
        numPages: pdf.numPages,
        fingerprint: Array.isArray((pdf as any).fingerprints) ? (pdf as any).fingerprints[0] : (pdf as any).fingerprint ?? null,
        pdfVersion: info.PDFFormatVersion,
        title: info.Title || undefined,
        author: info.Author || undefined,
        subject: info.Subject || undefined,
        keywords: info.Keywords || undefined,
        creator: info.Creator || undefined,
        producer: info.Producer || undefined,
        creationDate: info.CreationDate || undefined,
        modDate: info.ModDate || undefined,
        pageSizes,
    };
}

// ---------------------------------------------------------------------------
// Blank-page detection / removal
// ---------------------------------------------------------------------------

/**
 * Render each page at low resolution and measure the fraction of non-white
 * pixels. Pages below `threshold` (default 0.2%) are considered blank.
 * Returns the cleaned bytes (via pdf-lib delete) plus the removed indices.
 */
export async function removeBlankPages(
    bytes: Uint8Array,
    threshold = 0.002,
): Promise<{ bytes: Uint8Array; removed: number[] }> {
    const pdf = await getDoc(bytes);
    const blanks: number[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) continue;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let nonWhite = 0;
        const totalPx = canvas.width * canvas.height;
        for (let p = 0; p < data.length; p += 4) {
            // luminance; treat near-white as blank
            if (data[p] < 245 || data[p + 1] < 245 || data[p + 2] < 245) nonWhite++;
        }
        if (nonWhite / totalPx < threshold) blanks.push(i - 1);
    }
    if (blanks.length === 0 || blanks.length >= pdf.numPages) {
        // nothing to do, or would empty the doc — return original untouched
        return { bytes, removed: [] };
    }
    const cleaned = await deletePages(bytes, blanks);
    return { bytes: cleaned, removed: blanks };
}

// ---------------------------------------------------------------------------
// True redaction (rasterise affected pages so text is unrecoverable)
// ---------------------------------------------------------------------------

/**
 * Genuine redaction. First bakes opaque black boxes into the content stream,
 * then RASTERISES every page that had a redaction box — replacing it with an
 * image-only page so the underlying text/vector data is gone (not merely
 * covered). Pages without redactions stay vector (sharp + small).
 */
export async function redactAndFlatten(
    bytes: Uint8Array,
    rectsByPage: Record<number, PdfRect[]>,
    scale = 2,
): Promise<Uint8Array> {
    const baked = await drawRedactionBoxes(bytes, rectsByPage);
    const pdf = await getDoc(baked);
    const out = await PDFDocument.create();
    const sourceForCopy = await PDFDocument.load(baked.slice());
    const redactedPages = new Set(Object.keys(rectsByPage).map(Number).filter((i) => (rectsByPage[i]?.length ?? 0) > 0));

    for (let i = 0; i < pdf.numPages; i++) {
        if (redactedPages.has(i)) {
            const page = await pdf.getPage(i + 1);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas 2D context unavailable');
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            const pngUrl = canvas.toDataURL('image/png');
            const pngBytes = Uint8Array.from(atob(pngUrl.split(',')[1]), (ch) => ch.charCodeAt(0));
            const img = await out.embedPng(pngBytes);
            // Preserve the original page size in points (canvas is scaled up).
            const newPage = out.addPage([viewport.width / scale, viewport.height / scale]);
            newPage.drawImage(img, { x: 0, y: 0, width: viewport.width / scale, height: viewport.height / scale });
        } else {
            const [copied] = await out.copyPages(sourceForCopy, [i]);
            out.addPage(copied);
        }
    }
    return out.save();
}

// ---------------------------------------------------------------------------
// Compare two PDFs (per-page text diff)
// ---------------------------------------------------------------------------

export interface PageDiff {
    page: number; // 1-based
    same: boolean;
    addedWords: number;
    removedWords: number;
}

export interface PdfCompareResult {
    pageCountA: number;
    pageCountB: number;
    pages: PageDiff[];
    identical: boolean;
}

export async function comparePdfs(aBytes: Uint8Array, bBytes: Uint8Array): Promise<PdfCompareResult> {
    const [a, b] = await Promise.all([extractTextPerPage(aBytes), extractTextPerPage(bBytes)]);
    const max = Math.max(a.length, b.length);
    const pages: PageDiff[] = [];
    let identical = a.length === b.length;
    for (let i = 0; i < max; i++) {
        const aw = (a[i] || '').trim().split(/\s+/).filter(Boolean);
        const bw = (b[i] || '').trim().split(/\s+/).filter(Boolean);
        const aSet = new Map<string, number>();
        aw.forEach((w) => aSet.set(w, (aSet.get(w) || 0) + 1));
        const bSet = new Map<string, number>();
        bw.forEach((w) => bSet.set(w, (bSet.get(w) || 0) + 1));
        let added = 0;
        let removed = 0;
        for (const [w, n] of bSet) added += Math.max(0, n - (aSet.get(w) || 0));
        for (const [w, n] of aSet) removed += Math.max(0, n - (bSet.get(w) || 0));
        const same = added === 0 && removed === 0;
        if (!same) identical = false;
        pages.push({ page: i + 1, same, addedWords: added, removedWords: removed });
    }
    return { pageCountA: a.length, pageCountB: b.length, pages, identical };
}

// ---------------------------------------------------------------------------
// Extract embedded raster images (best-effort) — falls back to page rasters
// ---------------------------------------------------------------------------

/**
 * Pull embedded image XObjects out of the PDF. pdfjs exposes decoded images via
 * `page.objs`, but only after the page has rendered, so we render first, then
 * read the paintImageXObject operands. Best-effort: returns whatever decodes;
 * the caller can fall back to `renderAllPagesToPng` for a guaranteed result.
 */
export async function extractEmbeddedImages(bytes: Uint8Array): Promise<Blob[]> {
    const pdf = await getDoc(bytes);
    const pdfjsLib = await loadPdfjs();
    const OPS = pdfjsLib.OPS;
    const blobs: Blob[] = [];
    const seen = new Set<string>();

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        // Render so page.objs are populated.
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        const opList = await page.getOperatorList();
        for (let j = 0; j < opList.fnArray.length; j++) {
            const fn = opList.fnArray[j];
            if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject) continue;
            const name = opList.argsArray[j]?.[0];
            if (typeof name !== 'string' || seen.has(`${i}:${name}`)) continue;
            seen.add(`${i}:${name}`);
            try {
                const imgObj: any = await new Promise((resolve) => {
                    try {
                        page.objs.get(name, resolve);
                    } catch {
                        resolve(null);
                    }
                });
                if (!imgObj || !imgObj.width || !imgObj.height) continue;
                const c2 = document.createElement('canvas');
                c2.width = imgObj.width;
                c2.height = imgObj.height;
                const cx = c2.getContext('2d');
                if (!cx) continue;
                if (imgObj.bitmap) {
                    cx.drawImage(imgObj.bitmap, 0, 0);
                } else if (imgObj.data) {
                    const id = cx.createImageData(imgObj.width, imgObj.height);
                    // pdfjs may give RGB (3 bpp) or RGBA (4 bpp)
                    const src = imgObj.data as Uint8ClampedArray;
                    const bpp = src.length / (imgObj.width * imgObj.height);
                    for (let p = 0, q = 0; p < id.data.length; p += 4) {
                        id.data[p] = src[q];
                        id.data[p + 1] = src[q + 1] ?? src[q];
                        id.data[p + 2] = src[q + 2] ?? src[q];
                        id.data[p + 3] = bpp >= 4 ? src[q + 3] : 255;
                        q += Math.round(bpp);
                    }
                    cx.putImageData(id, 0, 0);
                } else {
                    continue;
                }
                const blob = await new Promise<Blob | null>((res) => c2.toBlob(res, 'image/png'));
                if (blob) blobs.push(blob);
            } catch {
                /* skip undecodable image */
            }
        }
    }
    return blobs;
}
