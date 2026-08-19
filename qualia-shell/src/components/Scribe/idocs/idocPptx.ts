/**
 * idocPptx — Wave 3A: Interactive Doc → PowerPoint (.pptx).
 *
 * Two layers:
 *   buildPptxSpec(doc)  PURE (no DOM, no library): IDoc → plain-object slide
 *                       spec (inches). 1 card = 1 slide (+ "(cont.)" slides on
 *                       overflow); nested cards follow their parent. Every block
 *                       type maps to ≥1 element (see README.wave3-a.md table).
 *   exportPptx(doc)     browser: lazy `import('pptxgenjs')`, renders the spec
 *                       with native addText/addTable/addChart/addImage/addNotes,
 *                       fetches remote images (5 s timeout; CORS failure → grey
 *                       placeholder with the alt text), downloads `<slug>.pptx`.
 *
 * Also exports `mdToParas` (tiny markdown → runs parser) reused by idocDocx.
 */
import { exportThemeVars, safeFilename } from './idocExport';
import type { Block, Card, ChartKind, IDoc } from './idocTypes';
import { qrSvg } from './blocks/qr';

// ── spec types ──────────────────────────────────────────────────────────

export type PptxLayout = '16x9' | '4x3' | 'A4' | 'LETTER';
export interface PptxTheme { bg: string; surface: string; text: string; muted: string; accent: string; border: string; fontHead: string; fontBody: string; /** original CSS families when a fallback font was substituted */ fontNote?: string }
export interface PptxRun { text: string; bold?: boolean; italic?: boolean; code?: boolean; href?: string }
export interface PptxPara { runs: PptxRun[]; bullet?: 'dot' | 'num'; indent?: number }
interface Geo { x: number; y: number; w: number; h: number }
export type PptxElement =
    | (Geo & { kind: 'text'; paras: PptxPara[]; fontSize?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle'; mono?: boolean; fill?: string })
    | (Geo & { kind: 'bullets'; items: PptxRun[][]; numbered?: boolean; fontSize?: number })
    | (Geo & { kind: 'image'; src: string; alt?: string })
    | (Geo & { kind: 'table'; rows: string[][]; header?: boolean; fontSize?: number })
    | (Geo & { kind: 'chart'; chartKind: ChartKind; title?: string; labels: string[]; values: number[] })
    | (Geo & { kind: 'shape'; fill: string; fillAlpha?: number; line?: string; rounded?: boolean; paras?: PptxPara[]; fontSize?: number; color?: string; align?: 'left' | 'center' | 'right' })
    | (Geo & { kind: 'link'; text: string; href: string; fontSize?: number; button?: boolean });
export interface PptxSlide { title?: string; notes?: string; background?: string; elements: PptxElement[] }
export interface PptxSpec { layout: PptxLayout; width: number; height: number; theme: PptxTheme; fileName: string; slides: PptxSlide[] }

// ── markdown → runs (shared with idocDocx) ──────────────────────────────

const INLINE = /(\*\*|__)(.+?)\1|(\*|_)([^*_]+?)\3|`([^`]+)`|!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\(([^)\s]+)\)/g;
export function mdInline(s: string): PptxRun[] {
    const text = s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    const out: PptxRun[] = [];
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
        if (m.index! > last) out.push({ text: text.slice(last, m.index) });
        if (m[2] !== undefined) out.push({ text: m[2], bold: true });
        else if (m[4] !== undefined) out.push({ text: m[4], italic: true });
        else if (m[5] !== undefined) out.push({ text: m[5], code: true });
        else if (m[6] !== undefined) out.push({ text: m[6] || 'image' });
        else out.push({ text: m[7], href: m[8] });
        last = m.index! + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out.length ? out : [{ text: '' }];
}

/** Line-based markdown → paragraphs (headings→bold, bullets/numbers, quotes stripped, fences→code, tables flattened). */
export function mdToParas(md: string): PptxPara[] {
    const paras: PptxPara[] = [];
    const lines = (md || '').replace(/\r\n/g, '\n').split('\n');
    let fence: string[] | null = null;
    for (const raw of lines) {
        if (/^\s*```/.test(raw)) { if (fence) { paras.push({ runs: [{ text: fence.join('\n'), code: true }] }); fence = null; } else fence = []; continue; }
        if (fence) { fence.push(raw); continue; }
        const line = raw.replace(/^>\s?/, '');
        if (!line.trim() || /^\s*(-{3,}|\*{3,})\s*$/.test(line) || /^\s*\|?\s*:?-{2,}/.test(line)) continue;
        const h = /^(#{1,6})\s+(.*)$/.exec(line);
        if (h) { paras.push({ runs: mdInline(h[2]).map((r) => ({ ...r, bold: true })) }); continue; }
        const b = /^(\s*)[-*+]\s+(.*)$/.exec(line);
        if (b) { paras.push({ runs: mdInline(b[2]), bullet: 'dot', indent: Math.min(3, Math.floor(b[1].length / 2)) }); continue; }
        const n = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
        if (n) { paras.push({ runs: mdInline(n[2]), bullet: 'num', indent: Math.min(3, Math.floor(n[1].length / 2)) }); continue; }
        if (line.trim().startsWith('|')) { paras.push({ runs: mdInline(line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join(' · ')) }); continue; }
        paras.push({ runs: mdInline(line) });
    }
    if (fence) paras.push({ runs: [{ text: fence.join('\n'), code: true }] });
    return paras;
}
export const plainText = (paras: PptxPara[]): string => paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n');

// ── theme ───────────────────────────────────────────────────────────────

/** CSS color → 6-digit hex without '#'; anything unparsable → fallback. */
export function hex6(v: string | undefined, fallback: string): string {
    const s = (v ?? '').trim();
    const m3 = /^#([0-9a-f]{3})$/i.exec(s);
    if (m3) return m3[1].split('').map((c) => c + c).join('').toUpperCase();
    const m6 = /^#([0-9a-f]{6})/i.exec(s);
    if (m6) return m6[1].toUpperCase();
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
    if (rgb) return rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('').toUpperCase();
    return fallback;
}
/** First family of a CSS font stack, unquoted; generic/system names → Calibri. */
function firstFamily(stack: string | undefined, fallback: string): string {
    const first = (stack ?? '').split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
    return !first || /^(var\(|-apple|ui-|system|sans-serif|serif|monospace|blink|segoe)/i.test(first) ? fallback : first;
}
export function pptxTheme(doc: IDoc): PptxTheme {
    const v = exportThemeVars(doc);
    const uploaded = new Set((doc.customTheme?.fontFaces ?? []).map((f) => f.family));
    let fontHead = firstFamily(v['--idoc-heading-font'], 'Calibri');
    let fontBody = firstFamily(v['--idoc-body-font'], 'Calibri');
    const notes: string[] = [];
    // Uploaded (data-URL) fonts can't be embedded by pptxgenjs → substitute, keep the name for the caller/README.
    if (uploaded.has(fontHead)) { notes.push(`heading: ${fontHead}`); fontHead = 'Calibri'; }
    if (uploaded.has(fontBody)) { notes.push(`body: ${fontBody}`); fontBody = 'Arial'; }
    return {
        bg: hex6(v['--idoc-bg'], 'FFFFFF'), surface: hex6(v['--idoc-surface'], 'FFFFFF'), text: hex6(v['--idoc-text'], '1F1B16'),
        muted: hex6(v['--idoc-muted'], '6B635A'), accent: hex6(v['--idoc-accent'], 'B4532A'), border: hex6(v['--idoc-border'], 'E3DBCD'),
        fontHead, fontBody, fontNote: notes.length ? notes.join('; ') : undefined,
    };
}

// ── layout ──────────────────────────────────────────────────────────────

const LAYOUTS: Record<PptxLayout, [number, number]> = { '16x9': [10, 5.625], '4x3': [10, 7.5], A4: [8.27, 11.69], LETTER: [8.5, 11] };
export function layoutFor(pageSize: IDoc['pageSize']): PptxLayout {
    switch (pageSize) {
        case '4:3': case '1:1': return '4x3'; // ponytail: no square slide layout — 4:3 is the closest
        case 'a4': return 'A4';
        case 'letter': return 'LETTER';
        default: return '16x9';
    }
}
const M = 0.5, GAP = 0.15, BODY_PT = 14, SMALL_PT = 10;
const TONE_HEX: Record<string, string> = { info: '', success: '22C55E', warning: 'F59E0B', danger: 'EF4444' };

/** Rough text height in inches for `paras` in a `w`-inch box at `pt`. */
function textH(paras: PptxPara[], w: number, pt = BODY_PT): number {
    const cpl = Math.max(8, w * (120 / pt)); // chars per line
    const lines = paras.reduce((n, p) => n + Math.max(1, Math.ceil(plainText([p]).length / cpl)), 0);
    return Math.max(0.3, lines * pt * 1.45 / 72 + 0.12);
}
const R = (n: number) => Math.round(n * 100) / 100;

interface Row { h: number; els: (y: number) => PptxElement[] }
const textRow = (paras: PptxPara[], w: number, x: number, extra: Partial<Extract<PptxElement, { kind: 'text' }>> = {}, pt = BODY_PT): Row => {
    const h = textH(paras, w, pt);
    return { h, els: (y) => [{ kind: 'text', x, y, w, h, paras, fontSize: pt, ...extra }] };
};

function blockRows(b: Block, doc: IDoc, W: number, theme: PptxTheme): Row[] {
    const cw = W - M * 2;
    const box = (paras: PptxPara[], fill: string, alpha: number, line?: string, pt = BODY_PT): Row => {
        const h = textH(paras, cw - 0.4, pt) + 0.2;
        return { h, els: (y) => [{ kind: 'shape', x: M, y, w: cw, h, fill, fillAlpha: alpha, line, rounded: true, paras, fontSize: pt }] };
    };
    switch (b.type) {
        case 'heading': { const pt = b.level === 1 ? 28 : b.level === 2 ? 22 : 18; return [textRow([{ runs: [{ text: b.text, bold: true }] }], cw, M, { bold: true }, pt)]; }
        case 'text': return [textRow(mdToParas(b.md), cw, M)];
        case 'callout': return [box(mdToParas(b.md), TONE_HEX[b.tone] || theme.accent, 85, TONE_HEX[b.tone] || theme.accent)];
        case 'quote': return [box([...mdToParas(b.md).map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, italic: true })) })), ...(b.cite ? [{ runs: [{ text: `— ${b.cite}` }] }] : [])], theme.muted, 90)];
        case 'image': return b.src ? [{ h: 3, els: (y) => [{ kind: 'image', x: M, y, w: cw, h: 3, src: b.src, alt: b.alt || b.caption }, ...(b.caption ? [{ kind: 'text' as const, x: M, y: y + 3.02, w: cw, h: 0.3, paras: [{ runs: [{ text: b.caption, italic: true }] }], fontSize: SMALL_PT, color: theme.muted, align: 'center' as const }] : [])] }, ...(b.caption ? [{ h: 0.3, els: () => [] }] : [])] : [];
        case 'gallery': {
            const imgs = b.images.filter((i) => i.src);
            if (!imgs.length) return [];
            const per = Math.min(4, imgs.length), rows = Math.ceil(imgs.length / per), iw = (cw - GAP * (per - 1)) / per, ih = Math.min(2, iw * 0.75);
            return [{ h: rows * (ih + GAP) - GAP, els: (y) => imgs.map((img, i) => ({ kind: 'image', x: R(M + (i % per) * (iw + GAP)), y: R(y + Math.floor(i / per) * (ih + GAP)), w: R(iw), h: R(ih), src: img.src, alt: img.alt })) }];
        }
        case 'embed': return b.url ? [{ h: 0.4, els: (y) => [{ kind: 'link', x: M, y, w: cw, h: 0.4, text: `▶ Embedded ${b.provider || 'content'}: ${b.url}`, href: b.url }] }] : [];
        case 'chart': return [{ h: 3.2, els: (y) => [{ kind: 'chart', x: M, y, w: cw, h: 3.2, chartKind: b.kind, title: b.title, labels: b.data.map((d) => d.label), values: b.data.map((d) => d.value) }] }];
        case 'table': { const rows = [b.headers, ...b.rows].filter((r) => r.length); const h = Math.min(4, rows.length * 0.36 + 0.1); return [{ h, els: (y) => [{ kind: 'table', x: M, y, w: cw, h, rows, header: b.headers.length > 0, fontSize: 12 }] }]; }
        case 'accordion': case 'tabs': return b.items.map((it) => textRow([{ runs: [{ text: it.title, bold: true }] }, ...mdToParas(it.md)], cw, M));
        case 'columns': {
            const n = Math.max(1, b.columns.length), colW = (cw - GAP * (n - 1)) / n;
            const paras = b.columns.map(mdToParas), h = Math.max(...paras.map((p) => textH(p, colW)));
            return [{ h, els: (y) => paras.map((p, i) => ({ kind: 'text', x: R(M + i * (colW + GAP)), y, w: R(colW), h, paras: p, fontSize: BODY_PT })) }];
        }
        case 'button': return b.href ? [{ h: 0.45, els: (y) => [{ kind: 'link', x: M, y, w: Math.min(cw, 3), h: 0.45, text: b.label, href: b.href, button: true }] }] : [];
        case 'code': return [textRow([{ runs: [{ text: b.code, code: true }] }], cw, M, { mono: true, fill: 'F3F4F6' }, 11)];
        case 'divider': return [{ h: 0.02, els: (y) => [{ kind: 'shape', x: M, y, w: cw, h: 0.02, fill: theme.border }] }];
        case 'timeline': return b.items.map((it) => { const paras = [{ runs: [{ text: it.title, bold: true }] }, ...mdToParas(it.md)]; const h = textH(paras, cw - 1.4); return { h, els: (y) => [{ kind: 'text', x: M, y, w: 1.2, h, paras: [{ runs: [{ text: it.date }] }], fontSize: 12, color: theme.muted }, { kind: 'text', x: M + 1.4, y, w: cw - 1.4, h, paras, fontSize: BODY_PT }] }; });
        case 'quiz': return [textRow([{ runs: [{ text: `Q: ${b.question}`, bold: true }] }, ...b.options.map((o, i) => ({ runs: [{ text: `${String.fromCharCode(65 + i)}) ${o}` }] })), { runs: [{ text: `Answer: ${b.options[b.answerIndex] ?? ''}${b.explanation ? ` — ${b.explanation}` : ''}`, italic: true }] }], cw, M)];
        case 'toc': { const items = tocItems(doc.cards); return items.length ? [{ h: Math.min(4, items.length * 0.3 + 0.1), els: (y) => [{ kind: 'bullets', x: M, y, w: cw, h: Math.min(4, items.length * 0.3 + 0.1), items, fontSize: 12 }] }] : []; }
        case 'steps': return b.items.map((it, i) => { const paras = [{ runs: [{ text: it.title, bold: true }] }, ...mdToParas(it.md)]; const h = Math.max(0.45, textH(paras, cw - 0.6)); return { h, els: (y) => [{ kind: 'shape', x: M, y, w: 0.4, h: 0.4, fill: theme.accent, rounded: true, paras: [{ runs: [{ text: b.numbered === false ? '•' : String(i + 1), bold: true }] }], fontSize: 12, color: theme.bg, align: 'center' }, { kind: 'text', x: M + 0.6, y, w: cw - 0.6, h, paras, fontSize: BODY_PT }] }; });
        case 'funnel': { const max = Math.max(1, ...b.items.map((it) => it.value ?? 0)); return b.items.map((it) => { const w = it.value == null ? cw : Math.max(cw * 0.2, cw * (it.value / max)); return { h: 0.42, els: (y) => [{ kind: 'shape', x: R(M + (cw - w) / 2), y, w: R(w), h: 0.38, fill: theme.accent, paras: [{ runs: [{ text: it.value == null ? it.label : `${it.label} — ${it.value}`, bold: true }] }], fontSize: 12, color: theme.bg, align: 'center' }] }; }); }
        case 'boxes': {
            const cols = b.columns ?? 3, bw = (cw - GAP * (cols - 1)) / cols, rows = Math.ceil(b.items.length / cols);
            const paras = b.items.map((it) => [{ runs: [{ text: it.title, bold: true }] }, ...mdToParas(it.md)]);
            const bh = Math.max(0.6, ...paras.map((p) => textH(p, bw - 0.3) + 0.2));
            return [{ h: rows * (bh + GAP) - GAP, els: (y) => b.items.map((it, i) => ({ kind: 'shape', x: R(M + (i % cols) * (bw + GAP)), y: R(y + Math.floor(i / cols) * (bh + GAP)), w: R(bw), h: R(bh), fill: it.emphasis ? theme.accent : theme.text, fillAlpha: it.emphasis ? 85 : 95, line: it.emphasis ? theme.accent : theme.border, rounded: true, paras: paras[i], fontSize: 12 })) }];
        }
        case 'math': return [textRow([{ runs: [{ text: b.latex, code: true }] }], cw, M, { mono: true, align: b.inline ? 'left' : 'center' }, 13)];
        case 'diagram': return [textRow([{ runs: [{ text: b.mermaid, code: true }] }], cw, M, { mono: true, fill: 'F3F4F6' }, 10)];
        case 'qr': {
            if (!b.url) return [];
            const svg = qrSvg(b.url, { title: `QR code for ${b.url}` });
            const src = svg && typeof btoa === 'function' ? `data:image/svg+xml;base64,${btoa(svg)}` : null;
            return [{ h: src ? 2.2 : 0.4, els: (y) => [...(src ? [{ kind: 'image' as const, x: R(M + cw / 2 - 0.9), y, w: 1.8, h: 1.8, src, alt: b.caption || b.url }] : []), { kind: 'link', x: M, y: y + (src ? 1.85 : 0), w: cw, h: 0.35, text: b.caption || b.url, href: b.url, fontSize: SMALL_PT }] }];
        }
    }
    // Exhaustive over Block['type']; TS narrows to never here.
    return [];
}
function tocItems(cards: Card[], depth = 0): PptxRun[][] {
    return cards.flatMap((c, i) => [[{ text: `${'  '.repeat(depth)}${c.title || `Card ${i + 1}`}` }], ...(c.children?.length ? tocItems(c.children, depth + 1) : [])]);
}

// ── spec builder ────────────────────────────────────────────────────────

export function buildPptxSpec(doc: IDoc): PptxSpec {
    const layout = layoutFor(doc.pageSize);
    const [W, H] = LAYOUTS[layout];
    const theme = pptxTheme(doc);
    const slides: PptxSlide[] = [];
    const total = doc.cards.length;

    const emitCard = (card: Card, index: number, depth: number): void => {
        const chrome = depth === 0 && !(doc.chrome?.hideOnFirst && index === 0) ? doc.chrome : undefined;
        const bgImage = card.background?.image || (card.layout === 'background' ? card.headerImage : undefined);
        const top = M + (chrome?.header || chrome?.logo ? 0.3 : 0), bottom = H - M - (chrome?.footer || chrome?.sectionNumbers ? 0.3 : 0);
        const chromeEls = (): PptxElement[] => {
            const els: PptxElement[] = [];
            if (bgImage) els.push({ kind: 'image', x: 0, y: 0, w: W, h: H, src: bgImage, alt: 'background' });
            if (chrome?.header) els.push({ kind: 'text', x: M, y: 0.12, w: W - M * 2 - (chrome.logo ? 1 : 0), h: 0.3, paras: [{ runs: [{ text: chrome.header }] }], fontSize: SMALL_PT, color: theme.muted });
            if (chrome?.logo) els.push({ kind: 'image', x: W - M - 0.9, y: 0.1, w: 0.9, h: 0.35, src: chrome.logo, alt: 'logo' });
            if (chrome?.footer) els.push({ kind: 'text', x: M, y: H - 0.42, w: W - M * 2 - 1.2, h: 0.3, paras: [{ runs: [{ text: chrome.footer }] }], fontSize: SMALL_PT, color: theme.muted });
            if (chrome?.sectionNumbers) els.push({ kind: 'text', x: W - M - 1.2, y: H - 0.42, w: 1.2, h: 0.3, paras: [{ runs: [{ text: `${index + 1} / ${total}` }] }], fontSize: SMALL_PT, color: theme.muted, align: 'right' });
            return els;
        };
        const newSlide = (cont: boolean): { slide: PptxSlide; y: number } => {
            const slide: PptxSlide = { title: card.title ? `${card.title}${cont ? ' (cont.)' : ''}` : undefined, notes: cont ? undefined : card.notes || undefined, background: card.background?.color ? hex6(card.background.color, theme.bg) : theme.bg, elements: chromeEls() };
            let y = top;
            if (slide.title) { slide.elements.push({ kind: 'text', x: M, y, w: W - M * 2, h: 0.7, paras: [{ runs: [{ text: slide.title, bold: true }] }], fontSize: depth ? 22 : 26, bold: true, color: theme.text }); y += 0.85; }
            slides.push(slide);
            return { slide, y };
        };
        let cur = newSlide(false);
        let placed = 0;
        const rows: Row[] = [];
        if (card.headerImage && card.layout !== 'background') rows.push({ h: 2.2, els: (y) => [{ kind: 'image', x: M, y, w: W - M * 2, h: 2.2, src: card.headerImage!, alt: card.title }] });
        for (const b of card.blocks) rows.push(...blockRows(b, doc, W, theme));
        if (card.footnotes?.length) rows.push(textRow(card.footnotes.map((f, i) => ({ runs: [{ text: `${i + 1}. ` }, ...mdInline(f.text)] })), W - M * 2, M, { color: theme.muted }, SMALL_PT));
        for (const row of rows) {
            if (placed > 0 && cur.y + row.h > bottom) { cur = newSlide(true); placed = 0; }
            cur.slide.elements.push(...row.els(R(cur.y)));
            cur.y += row.h + GAP;
            placed++;
        }
        (card.children ?? []).forEach((ch, i) => emitCard(ch, i, depth + 1));
    };
    doc.cards.forEach((c, i) => emitCard(c, i, 0));
    return { layout, width: W, height: H, theme, fileName: `${safeFilename(doc.title)}.pptx`, slides };
}

// ── browser: render spec with pptxgenjs ─────────────────────────────────

/** Remote/blob URL → data URL (base64) with a timeout; data: URLs pass through; failure → null. */
export async function fetchImageDataUrl(src: string, timeoutMs = 5000, fetchFn: typeof fetch = fetch): Promise<string | null> {
    if (src.startsWith('data:')) return src;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), timeoutMs);
    try {
        const res = await fetchFn(src, { mode: 'cors', signal: ctl?.signal });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!/^image\//.test(blob.type)) return null;
        return await new Promise<string | null>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
    } catch { return null; } finally { clearTimeout(timer); }
}

const PPTX_CHART: Record<ChartKind, 'bar' | 'line' | 'pie' | 'doughnut' | 'area'> = { bar: 'bar', line: 'line', pie: 'pie', donut: 'doughnut', area: 'area' };

export async function exportPptx(doc: IDoc): Promise<void> {
    const spec = buildPptxSpec(doc);
    const { default: PptxGenJS } = await import('pptxgenjs');
    const pptx = new PptxGenJS();
    if (spec.layout === '16x9' || spec.layout === '4x3') pptx.layout = `LAYOUT_${spec.layout}`;
    else { pptx.defineLayout({ name: spec.layout, width: spec.width, height: spec.height }); pptx.layout = spec.layout; }
    pptx.title = doc.title;
    const t = spec.theme;
    // Resolve every image up-front (dedup by src) so slides render synchronously.
    const srcs = new Set<string>();
    for (const s of spec.slides) for (const e of s.elements) if (e.kind === 'image') srcs.add(e.src);
    const images = new Map<string, string | null>();
    await Promise.all([...srcs].map(async (s) => images.set(s, await fetchImageDataUrl(s))));

    const runsToText = (paras: PptxPara[], base: { fontSize?: number; color?: string; mono?: boolean; bold?: boolean }) => paras.flatMap((p, pi) => p.runs.map((r, ri) => ({
        text: r.text,
        options: {
            bold: r.bold || base.bold || undefined, italic: r.italic || undefined,
            fontFace: r.code || base.mono ? 'Courier New' : t.fontBody, fontSize: base.fontSize ?? BODY_PT, color: r.href ? t.accent : base.color ?? t.text,
            hyperlink: r.href ? { url: r.href } : undefined,
            bullet: ri === 0 && p.bullet ? (p.bullet === 'num' ? { type: 'number' as const } : true) : undefined,
            indentLevel: ri === 0 && p.indent ? p.indent : undefined,
            breakLine: ri === p.runs.length - 1 && pi < paras.length - 1,
        },
    })));

    for (const s of spec.slides) {
        const slide = pptx.addSlide();
        slide.background = { color: s.background ?? t.bg };
        if (s.notes) slide.addNotes(s.notes);
        for (const e of s.elements) {
            const geo = { x: e.x, y: e.y, w: e.w, h: e.h };
            switch (e.kind) {
                case 'text': slide.addText(runsToText(e.paras, e), { ...geo, align: e.align, valign: e.valign ?? 'top', margin: 2, fill: e.fill ? { color: e.fill } : undefined, fontFace: e.mono ? 'Courier New' : (e.bold ? t.fontHead : t.fontBody), fit: 'shrink' }); break;
                case 'bullets': slide.addText(e.items.flatMap((runs, i) => runs.map((r, ri) => ({ text: r.text, options: { bold: r.bold || undefined, italic: r.italic || undefined, hyperlink: r.href ? { url: r.href } : undefined, bullet: ri === 0 ? (e.numbered ? { type: 'number' as const } : true) : undefined, breakLine: ri === runs.length - 1 && i < e.items.length - 1 } }))), { ...geo, fontSize: e.fontSize ?? BODY_PT, color: t.text, fontFace: t.fontBody, valign: 'top', fit: 'shrink' }); break;
                case 'image': {
                    const data = images.get(e.src);
                    if (data) slide.addImage({ ...geo, data, altText: e.alt, sizing: { type: 'contain', w: e.w, h: e.h } });
                    else slide.addText(e.alt || 'image', { ...geo, fill: { color: 'E5E7EB' }, color: '6B7280', fontSize: SMALL_PT, align: 'center', valign: 'middle', fontFace: t.fontBody });
                    break;
                }
                case 'table': slide.addTable(e.rows.map((r, ri) => r.map((c) => ({ text: c, options: e.header && ri === 0 ? { bold: true, fill: { color: t.accent }, color: t.bg } : { color: t.text } }))), { ...geo, fontSize: e.fontSize ?? 12, fontFace: t.fontBody, border: { type: 'solid', pt: 0.5, color: t.border }, autoPage: false }); break;
                case 'chart': slide.addChart(PPTX_CHART[e.chartKind], [{ name: e.title || 'Series', labels: e.labels, values: e.values }], { ...geo, showTitle: !!e.title, title: e.title, titleFontSize: 14, titleColor: t.text, chartColors: [t.accent, t.muted, t.text, t.border], showLegend: e.chartKind === 'pie' || e.chartKind === 'donut', legendPos: 'r', showValue: e.chartKind === 'bar', catAxisLabelColor: t.muted, valAxisLabelColor: t.muted, dataLabelColor: t.text, ...(e.chartKind === 'donut' ? { holeSize: 55 } : {}) }); break;
                case 'shape': slide.addText(e.paras ? runsToText(e.paras, { fontSize: e.fontSize, color: e.color }) : '', { ...geo, shape: e.rounded ? 'roundRect' : 'rect', rectRadius: e.rounded ? 0.08 : undefined, fill: { color: e.fill, transparency: e.fillAlpha ?? 0 }, line: e.line ? { color: e.line, width: 1 } : undefined, align: e.align ?? 'left', valign: 'middle', margin: 6, fontFace: t.fontBody, fit: 'shrink' }); break;
                case 'link': slide.addText(e.text, { ...geo, hyperlink: { url: e.href }, color: e.button ? t.bg : t.accent, fill: e.button ? { color: t.accent } : undefined, shape: e.button ? 'roundRect' : undefined, rectRadius: e.button ? 0.2 : undefined, align: e.button ? 'center' : 'left', valign: 'middle', fontSize: e.fontSize ?? 12, bold: e.button, fontFace: t.fontBody, margin: 4 }); break;
            }
        }
    }
    await pptx.writeFile({ fileName: spec.fileName });
}
