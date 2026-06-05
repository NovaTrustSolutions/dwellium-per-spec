/**
 * ocr — client-side OCR for scanned PDFs via tesseract.js.
 *
 * tesseract.js is dynamically imported (never at module init) so it stays out
 * of the main bundle and never runs during SSR. The WASM core + language model
 * are fetched + cached on first use, so the UI shows an honest "preparing OCR
 * engine…" state. One worker is cached per language; call `terminateOcr()` to
 * free it.
 */
import type { Worker } from 'tesseract.js';
import { renderPageToPng } from './pdfRaster';
import { mergePdfs } from './pdfOps';

export interface OcrProgress {
    /** tesseract status string, e.g. "recognizing text", "loading language traineddata". */
    status: string;
    /** 0..1 within the current status. */
    progress: number;
    /** 1-based page currently being processed, when known. */
    page?: number;
    pageCount?: number;
}

export type OcrProgressFn = (p: OcrProgress) => void;

const workerCache = new Map<string, Promise<Worker>>();

async function getWorker(lang: string, onProgress?: OcrProgressFn): Promise<Worker> {
    let existing = workerCache.get(lang);
    if (!existing) {
        existing = (async () => {
            const { createWorker } = await import('tesseract.js');
            return createWorker(lang, 1, {
                logger: (m: { status: string; progress: number }) =>
                    onProgress?.({ status: m.status, progress: m.progress }),
            });
        })();
        workerCache.set(lang, existing);
    }
    return existing;
}

/** Terminate + drop all cached workers (frees WASM memory). */
export async function terminateOcr(): Promise<void> {
    const workers = Array.from(workerCache.values());
    workerCache.clear();
    await Promise.all(
        workers.map(async (wp) => {
            try {
                const w = await wp;
                await w.terminate();
            } catch {
                /* ignore */
            }
        }),
    );
}

/** OCR a single image (Blob/canvas/dataURL) → recognized text. */
export async function ocrImage(image: Blob | HTMLCanvasElement | string, lang = 'eng', onProgress?: OcrProgressFn): Promise<string> {
    const worker = await getWorker(lang, onProgress);
    const { data } = await worker.recognize(image as any);
    return data.text;
}

/**
 * OCR every page of a PDF → plain text (per page + combined). Renders each page
 * to a PNG raster first (scanned PDFs have no text layer to extract).
 */
export async function ocrPdfToText(
    bytes: Uint8Array,
    opts: { lang?: string; scale?: number; onProgress?: OcrProgressFn } = {},
): Promise<{ perPage: string[]; text: string }> {
    const lang = opts.lang ?? 'eng';
    const scale = opts.scale ?? 2;
    // page count without a second parse: render lazily, but we need the count —
    // derive it from pdfRaster via a cheap getInfo-free loop by rendering until
    // it throws. Simpler: import getInfo.
    const { getInfo } = await import('./pdfRaster');
    const info = await getInfo(bytes);
    const worker = await getWorker(lang, opts.onProgress);
    const perPage: string[] = [];
    for (let i = 0; i < info.numPages; i++) {
        opts.onProgress?.({ status: 'rendering page', progress: 0, page: i + 1, pageCount: info.numPages });
        const png = await renderPageToPng(bytes, i, scale);
        opts.onProgress?.({ status: 'recognizing text', progress: 0, page: i + 1, pageCount: info.numPages });
        const { data } = await worker.recognize(png as any);
        perPage.push(data.text);
    }
    return { perPage, text: perPage.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n') };
}

/**
 * OCR a (scanned) PDF into a SEARCHABLE PDF — each page becomes its image with
 * an invisible recognized-text layer behind it, so the output is selectable +
 * findable. Uses tesseract's per-page PDF output, merged with pdf-lib.
 *
 * Best-effort: if tesseract's PDF output is unavailable in the runtime, throws
 * a clear error so the caller can fall back to `ocrPdfToText`.
 */
export async function ocrPdfToSearchablePdf(
    bytes: Uint8Array,
    opts: { lang?: string; scale?: number; onProgress?: OcrProgressFn } = {},
): Promise<Uint8Array> {
    const lang = opts.lang ?? 'eng';
    const scale = opts.scale ?? 2;
    const { getInfo } = await import('./pdfRaster');
    const info = await getInfo(bytes);
    const worker = await getWorker(lang, opts.onProgress);
    const pagePdfs: Uint8Array[] = [];
    for (let i = 0; i < info.numPages; i++) {
        opts.onProgress?.({ status: 'recognizing text', progress: 0, page: i + 1, pageCount: info.numPages });
        const png = await renderPageToPng(bytes, i, scale);
        const { data } = await worker.recognize(png as any, {}, { pdf: true } as any);
        const pdfOut = (data as any).pdf as number[] | Uint8Array | undefined;
        if (!pdfOut) throw new Error('OCR PDF output unavailable in this runtime — use OCR → text instead');
        pagePdfs.push(pdfOut instanceof Uint8Array ? pdfOut : Uint8Array.from(pdfOut));
    }
    if (pagePdfs.length === 1) return pagePdfs[0];
    return mergePdfs(pagePdfs);
}
