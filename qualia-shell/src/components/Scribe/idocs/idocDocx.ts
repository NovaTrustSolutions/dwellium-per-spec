/**
 * idocDocx — Wave 3A: Interactive Doc → Word (.docx) via the already-installed
 * `docx` library. Pure `buildIdocDocx(doc, images)` → `Document` (node-testable
 * with Packer.toBuffer); `exportDocx(doc)` fetches images best-effort in the
 * browser, packs to a Blob and downloads `<slug>.docx`.
 *
 * Mapping: card title → Heading 1 (nested → 2/3) · heading block → Heading n+1 ·
 * text/columns/tabs/accordion → paragraphs (bullets from markdown) · callout →
 * shaded paragraph · quote → italic + cite · table → Table · chart → small
 * data table + caption "chart: <kind> — see live doc" · image/gallery/header →
 * ImageRun (fetched; unreachable → "[image: alt]") · everything else → text ·
 * card.notes → "Presenter notes" appendix.
 */
import {
    AlignmentType, Document, ExternalHyperlink, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
    type IParagraphOptions, type ParagraphChild,
} from 'docx';
import { safeFilename } from './idocExport';
import { hex6, mdInline, mdToParas, pptxTheme, type PptxPara, type PptxRun } from './idocPptx';
import type { Block, Card, IDoc } from './idocTypes';

export interface DocxImage { data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp'; width: number; height: number }
export type DocxImages = ReadonlyMap<string, DocxImage>;

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6] as const;
const heading = (text: string, level: number): Paragraph => new Paragraph({ text, heading: HEADINGS[Math.min(5, Math.max(0, level))] });

function runs(rs: PptxRun[], extra: { italics?: boolean; bold?: boolean; color?: string } = {}): ParagraphChild[] {
    return rs.map((r) => {
        const tr = new TextRun({ text: r.text, bold: r.bold || extra.bold, italics: r.italic || extra.italics, color: extra.color, font: r.code ? 'Courier New' : undefined, style: r.href ? 'Hyperlink' : undefined });
        return r.href ? new ExternalHyperlink({ link: r.href, children: [tr] }) : tr;
    });
}
function paras(ps: PptxPara[], opts: Partial<IParagraphOptions> = {}, extra: { italics?: boolean; bold?: boolean; color?: string } = {}): Paragraph[] {
    return ps.map((p) => new Paragraph({ ...opts, children: runs(p.runs, extra), bullet: p.bullet ? { level: p.indent ?? 0 } : undefined }));
}
const mdParas = (md: string, opts: Partial<IParagraphOptions> = {}, extra = {}): Paragraph[] => paras(mdToParas(md), opts, extra);
const shaded = (fill: string): Partial<IParagraphOptions> => ({ shading: { type: ShadingType.CLEAR, fill, color: 'auto' }, spacing: { before: 80, after: 80 } });
const TONE_FILL: Record<string, string> = { info: 'EEF2FF', success: 'ECFDF5', warning: 'FFFBEB', danger: 'FEF2F2' };

function table(rows: string[][], header: boolean, accent: string): Table {
    const cols = Math.max(1, ...rows.map((r) => r.length));
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map((r, ri) => new TableRow({
            tableHeader: header && ri === 0,
            children: Array.from({ length: cols }, (_, ci) => new TableCell({
                shading: header && ri === 0 ? { type: ShadingType.CLEAR, fill: accent, color: 'auto' } : undefined,
                children: [new Paragraph({ children: [new TextRun({ text: r[ci] ?? '', bold: header && ri === 0, color: header && ri === 0 ? 'FFFFFF' : undefined })] })],
            })),
        })),
    });
}
function image(src: string, alt: string | undefined, images: DocxImages, maxW = 600): Paragraph {
    const img = images.get(src);
    if (!img) return new Paragraph({ children: [new TextRun({ text: `[image: ${alt || src.slice(0, 80)}]`, italics: true, color: '6B7280' })] });
    const scale = Math.min(1, maxW / Math.max(1, img.width));
    return new Paragraph({ children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) }, altText: alt ? { title: alt, description: alt, name: alt } : undefined })], alignment: AlignmentType.CENTER });
}

function blockToDocx(b: Block, doc: IDoc, depth: number, images: DocxImages, accent: string): (Paragraph | Table)[] {
    switch (b.type) {
        case 'heading': return [heading(b.text, depth + b.level)];
        case 'text': return mdParas(b.md);
        case 'callout': return mdParas(b.md, shaded(TONE_FILL[b.tone] ?? 'EEF2FF'));
        case 'quote': return [...mdParas(b.md, { indent: { left: 720 } }, { italics: true }), ...(b.cite ? [new Paragraph({ indent: { left: 720 }, children: [new TextRun({ text: `— ${b.cite}`, italics: true, color: '6B7280' })] })] : [])];
        case 'image': return b.src ? [image(b.src, b.alt || b.caption, images), ...(b.caption ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.caption, italics: true, color: '6B7280' })] })] : [])] : [];
        case 'gallery': return b.images.filter((i) => i.src).map((i) => image(i.src, i.alt, images, 280));
        case 'embed': return b.url ? [new Paragraph({ children: runs([{ text: `Embedded ${b.provider || 'content'}: ${b.url}`, href: b.url }]) })] : [];
        case 'chart': return [table([['Label', 'Value'], ...b.data.map((d) => [d.label, String(d.value)])], true, accent), new Paragraph({ children: [new TextRun({ text: `chart: ${b.kind}${b.title ? ` — ${b.title}` : ''} — see live doc`, italics: true, color: '6B7280' })], spacing: { after: 160 } })];
        case 'table': return [table([b.headers, ...b.rows].filter((r) => r.length), b.headers.length > 0, accent)];
        case 'accordion': case 'tabs': return b.items.flatMap((it) => [new Paragraph({ children: [new TextRun({ text: it.title, bold: true })] }), ...mdParas(it.md)]);
        case 'columns': return b.columns.flatMap((c) => mdParas(c));
        case 'button': return b.href ? [new Paragraph({ children: runs([{ text: b.label, href: b.href, bold: true }]) })] : [];
        case 'code': return b.code.split('\n').map((l) => new Paragraph({ children: [new TextRun({ text: l, font: 'Courier New', size: 18 })], ...shaded('F3F4F6'), spacing: { before: 0, after: 0 } }));
        case 'divider': return [new Paragraph({ text: '', border: { bottom: { style: 'single', size: 6, color: 'CCCCCC', space: 1 } } })];
        case 'timeline': return b.items.flatMap((it) => [new Paragraph({ children: [new TextRun({ text: `${it.date} — `, color: '6B7280' }), new TextRun({ text: it.title, bold: true })] }), ...mdParas(it.md, { indent: { left: 720 } })]);
        case 'quiz': return [new Paragraph({ children: [new TextRun({ text: `Q: ${b.question}`, bold: true })] }), ...b.options.map((o, i) => new Paragraph({ text: `${String.fromCharCode(65 + i)}) ${o}` })), new Paragraph({ children: [new TextRun({ text: `Answer: ${b.options[b.answerIndex] ?? ''}${b.explanation ? ` — ${b.explanation}` : ''}`, italics: true })] })];
        case 'toc': return tocParas(doc.cards);
        case 'steps': return b.items.flatMap((it, i) => [new Paragraph({ children: [new TextRun({ text: `${b.numbered === false ? '•' : `${i + 1}.`} ${it.title}`, bold: true })] }), ...mdParas(it.md, { indent: { left: 720 } })]);
        case 'funnel': return b.items.map((it) => new Paragraph({ text: `${it.label}${it.value == null ? '' : `: ${it.value}`}`, bullet: { level: 0 } }));
        case 'boxes': return b.items.flatMap((it) => [new Paragraph({ children: [new TextRun({ text: it.title, bold: true })], ...(it.emphasis ? shaded('EEF2FF') : {}) }), ...mdParas(it.md)]);
        case 'math': return [new Paragraph({ children: [new TextRun({ text: b.latex, font: 'Courier New' })], alignment: b.inline ? AlignmentType.LEFT : AlignmentType.CENTER })];
        case 'diagram': return b.mermaid.split('\n').map((l) => new Paragraph({ children: [new TextRun({ text: l, font: 'Courier New', size: 18 })], spacing: { before: 0, after: 0 } }));
        case 'qr': return b.url ? [new Paragraph({ children: runs([{ text: `QR: ${b.caption || b.url}`, href: b.url }]) })] : [];
    }
    return [];
}
function tocParas(cards: Card[], depth = 0): Paragraph[] {
    return cards.flatMap((c, i) => [new Paragraph({ text: c.title || `Card ${i + 1}`, bullet: { level: Math.min(3, depth) } }), ...(c.children?.length ? tocParas(c.children, depth + 1) : [])]);
}

/** Pure: IDoc (+ pre-fetched images keyed by src) → docx Document. */
export function buildIdocDocx(doc: IDoc, images: DocxImages = new Map()): Document {
    const accent = hex6(pptxTheme(doc).accent, '4F46E5');
    const body: (Paragraph | Table)[] = [new Paragraph({ text: doc.title || 'Untitled', heading: HeadingLevel.TITLE })];
    if (doc.description) body.push(new Paragraph({ children: [new TextRun({ text: doc.description, italics: true })] }));
    const notes: { title: string; notes: string }[] = [];
    const walk = (c: Card, depth: number, i: number): void => {
        body.push(heading(c.title || (depth ? `Section ${i + 1}` : `Card ${i + 1}`), depth));
        if (c.headerImage && c.layout !== 'background') body.push(image(c.headerImage, c.title, images));
        for (const b of c.blocks) body.push(...blockToDocx(b, doc, depth, images, accent));
        if (c.footnotes?.length) body.push(...c.footnotes.map((f, n) => new Paragraph({ children: [new TextRun({ text: `${n + 1}. `, superScript: true }), ...runs(mdInline(f.text))], spacing: { before: 0, after: 0 } })));
        if (c.notes?.trim()) notes.push({ title: c.title || `Card ${i + 1}`, notes: c.notes });
        (c.children ?? []).forEach((ch, j) => walk(ch, depth + 1, j));
    };
    doc.cards.forEach((c, i) => walk(c, 0, i));
    if (notes.length) {
        body.push(new Paragraph({ text: 'Presenter notes', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
        for (const n of notes) { body.push(new Paragraph({ children: [new TextRun({ text: n.title, bold: true })] })); body.push(...mdParas(n.notes)); }
    }
    return new Document({ creator: 'Dwellium Scribe', title: doc.title, sections: [{ children: body }] });
}

/** Best-effort image fetch (browser): remote/data URL → bytes + intrinsic size; anything unreadable → skipped. */
async function fetchDocxImage(src: string, timeoutMs = 5000): Promise<DocxImage | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const res = await fetch(src, { mode: 'cors', signal: ctl.signal });
        if (!res.ok) return null;
        const blob = await res.blob();
        const type = /jpe?g/.test(blob.type) ? 'jpg' : /png/.test(blob.type) ? 'png' : /gif/.test(blob.type) ? 'gif' : /bmp/.test(blob.type) ? 'bmp' : null;
        if (!type) return null; // svg/webp/… — docx can't embed without conversion
        const url = URL.createObjectURL(blob);
        try {
            const size = await new Promise<{ w: number; h: number }>((resolve, reject) => { const im = new Image(); im.onload = () => resolve({ w: im.naturalWidth || 400, h: im.naturalHeight || 300 }); im.onerror = () => reject(new Error('decode')); im.src = url; });
            return { data: new Uint8Array(await blob.arrayBuffer()), type, width: size.w, height: size.h };
        } finally { URL.revokeObjectURL(url); }
    } catch { return null; } finally { clearTimeout(timer); }
}
function imageSrcs(doc: IDoc): string[] {
    const out = new Set<string>();
    const walk = (c: Card) => {
        if (c.headerImage && c.layout !== 'background') out.add(c.headerImage);
        for (const b of c.blocks) { if (b.type === 'image' && b.src) out.add(b.src); if (b.type === 'gallery') b.images.forEach((i) => i.src && out.add(i.src)); }
        c.children?.forEach(walk);
    };
    doc.cards.forEach(walk);
    return [...out];
}

export async function exportDocx(doc: IDoc): Promise<void> {
    const images = new Map<string, DocxImage>();
    await Promise.all(imageSrcs(doc).map(async (s) => { const im = await fetchDocxImage(s); if (im) images.set(s, im); }));
    const blob = await Packer.toBlob(buildIdocDocx(doc, images));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safeFilename(doc.title)}.docx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
