/**
 * idocsImport — URL / PDF → Interactive Doc. Pure functions with injectable
 * seams (`fetchFn`, `callLlmFn`, `extractPdfText`) so tests run without
 * network, pdfjs or a model.
 *
 * URL path: backend Readability proxy (`POST /api/scribe/fetch-article`, same
 * route the Scribe drop-handler uses) → falls back to a direct `fetch` +
 * DOMParser strip → `generateDocFromText`. A CORS/network failure on the
 * direct path yields `{ error: 'blocked' }` with a human message.
 */
import { API_BASE } from '../../../config';
import { getAuthHeaders } from '../../../context/UserContext';
import { callLlm, hasActiveLlm } from '../../../lib/llmClient';
import { htmlToMarkdown } from '../htmlToMarkdown';
import { docFromMarkdownHeadings, generateDocFromText, type CallLlmFn, type GenerateOpts, type LlmBundle } from './idocsAi';
import { createEmptyDoc, newId, type IDoc } from './idocTypes';

export type ImportResult =
    | { doc: IDoc; source: 'ai' | 'headings' | 'pages' }
    | { error: 'blocked' | 'empty' | 'invalid' | 'failed'; message: string };

const NOISE = 'script,style,noscript,template,svg,canvas,iframe,nav,footer,header[role="banner"],aside,form,[aria-hidden="true"],.cookie,.ad,.ads,.advert,.sidebar';

/** HTML → markdown-ish text: drops chrome/noise, prefers <article>/<main>, keeps headings + paragraphs. No deps (DOMParser). */
export function htmlToText(html: string): { title: string; text: string } {
    if (typeof DOMParser === 'undefined') return { title: '', text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = doc.querySelector('title')?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim() || '';
    doc.querySelectorAll(NOISE).forEach((el) => el.remove());
    const root = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body;
    const text = htmlToMarkdown(root?.innerHTML ?? '').replace(/\n{3,}/g, '\n\n').trim();
    return { title, text };
}

async function viaBackend(url: string, fetchFn: typeof fetch): Promise<{ title: string; text: string } | null> {
    try {
        const res = await fetchFn(`${API_BASE}/api/scribe/fetch-article`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ url }),
        });
        const data = (await res.json()) as { success?: boolean; title?: string; content?: string };
        if (!res.ok || !data.success || !data.content?.trim()) return null;
        return { title: data.title ?? '', text: data.content };
    } catch { return null; }
}

/** Fetch a URL as text (backend proxy first, then direct). */
export async function fetchUrlText(url: string, fetchFn: typeof fetch = fetch): Promise<{ title: string; text: string } | { error: 'blocked' | 'invalid' | 'failed'; message: string }> {
    let u: URL;
    try { u = new URL(url.trim()); } catch { return { error: 'invalid', message: 'That is not a valid URL.' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'invalid', message: 'Only http(s) URLs can be imported.' };
    const proxied = await viaBackend(u.toString(), fetchFn);
    if (proxied) return proxied;
    try {
        const res = await fetchFn(u.toString());
        if (!res.ok) return { error: 'failed', message: `The page returned HTTP ${res.status}.` };
        const body = await res.text();
        const ct = res.headers?.get?.('content-type') ?? '';
        if (/html/i.test(ct) || /^\s*<(!doctype|html)/i.test(body)) return htmlToText(body);
        return { title: u.hostname, text: body };
    } catch (e) {
        // fetch() rejects with TypeError on CORS / network — the browser hides the reason.
        return { error: 'blocked', message: `Couldn't read ${u.hostname} from the browser (CORS or network). Copy the page text and use “Paste text” instead, or start the Dwellium backend so the URL proxy is available. (${(e as Error).message})` };
    }
}

/** URL → IDoc. Uses the model when active, otherwise splits by headings. */
export async function importFromUrl(url: string, llm: LlmBundle, opts: GenerateOpts = {}, callLlmFn: CallLlmFn = callLlm, fetchFn: typeof fetch = fetch): Promise<ImportResult> {
    const got = await fetchUrlText(url, fetchFn);
    if ('error' in got) return got;
    if (!got.text.trim()) return { error: 'empty', message: 'The page had no readable text.' };
    const title = got.title || safeHost(url);
    if (hasActiveLlm(llm)) {
        try {
            const doc = await generateDocFromText(got.text, opts, llm, callLlmFn);
            if (doc) return { doc: { ...doc, title: doc.title || title }, source: 'ai' };
        } catch { /* fall through to headings */ }
    }
    return { doc: docFromMarkdownHeadings(got.text, title), source: 'headings' };
}

function safeHost(url: string): string { try { return new URL(url).hostname; } catch { return 'Imported page'; } }

/** Default PDF text seam — pdfjs via the PDFGear helper (lazy, browser-only, same worker setup). */
export async function defaultExtractPdfText(bytes: Uint8Array): Promise<string[]> {
    const { extractTextPerPage } = await import('../../PDFGear/pdfRaster');
    return extractTextPerPage(bytes);
}

/** PDF → IDoc. Model when active; otherwise one card per page (headings-split when the text looks like markdown). */
export async function importFromPdf(file: Blob & { name?: string }, llm: LlmBundle, opts: GenerateOpts = {}, callLlmFn: CallLlmFn = callLlm, extractPdfText: (bytes: Uint8Array) => Promise<string[]> = defaultExtractPdfText): Promise<ImportResult> {
    let pages: string[];
    try { pages = await extractPdfText(new Uint8Array(await file.arrayBuffer())); } catch (e) { return { error: 'failed', message: `Couldn't read the PDF: ${(e as Error).message}` }; }
    const cleaned = pages.map((p) => p.replace(/\s+/g, ' ').trim());
    if (!cleaned.some(Boolean)) return { error: 'empty', message: 'No text layer found in that PDF (scanned image?). Run OCR first.' };
    const title = (file.name ?? 'Imported PDF').replace(/\.pdf$/i, '');
    if (hasActiveLlm(llm)) {
        try {
            const doc = await generateDocFromText(cleaned.map((p, i) => `[Page ${i + 1}]\n${p}`).join('\n\n'), opts, llm, callLlmFn);
            if (doc) return { doc: { ...doc, title: doc.title || title }, source: 'ai' };
        } catch { /* fall through */ }
    }
    // ponytail: no-LLM fallback = one card per page (cap 30); a headings-aware split needs the model.
    const cards = cleaned.slice(0, 30).map((p, i) => ({ id: newId('c'), title: `Page ${i + 1}`, layout: 'default' as const, blocks: p ? [{ id: newId(), type: 'text' as const, md: p }] : [] }));
    return { doc: createEmptyDoc({ title, cards }), source: 'pages' };
}
