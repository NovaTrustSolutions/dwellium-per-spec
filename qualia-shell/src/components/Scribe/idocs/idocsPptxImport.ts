/**
 * idocsPptxImport — Wave 3A: PowerPoint (.pptx) → Interactive Doc, and
 * .pptx theme → CustomTheme. Zero-dependency OOXML walk over `jszip` (lazy) +
 * DOMParser (browser + jsdom).
 *
 *   importPptxFile(file)   1 slide = 1 card. Title placeholder → card.title;
 *                          text bodies → `text` blocks (a:buChar/a:buAutoNum →
 *                          markdown bullets; b/i runs → bold/italic md; hyperlinks →
 *                          [text](url)); p:pic → `image` (data URL from
 *                          ppt/media); a:tbl → `table`; chart graphicFrame →
 *                          `chart` from ppt/charts/chartN.xml (else callout
 *                          placeholder); notesSlide → card.notes.
 *   importPptxTheme(file)  ppt/theme/theme1.xml clrScheme + fontScheme → the
 *                          `--idoc-*` vars.
 *
 * ponytail: no master/layout inheritance — a body placeholder with ≥2
 * paragraphs and no explicit a:buNone is treated as a bullet list (that is
 * what the default Office layouts do). Groups (p:grpSp) are flattened.
 */
import type JSZipType from 'jszip';
import { createEmptyDoc, newId, type Block, type Card, type ChartKind, type CustomTheme, type IDoc } from './idocTypes';

type Zip = JSZipType;
const loadZip = async (file: Blob): Promise<Zip> => { const { default: JSZip } = await import('jszip'); return JSZip.loadAsync(await file.arrayBuffer()); };
const parseXml = (xml: string): Document => new DOMParser().parseFromString(xml, 'application/xml');
const byLocal = (root: ParentNode, local: string): Element[] => Array.from((root as Element | Document).getElementsByTagNameNS('*', local));
const text = (el: ParentNode | null | undefined): string => (el ? byLocal(el, 't').map((t) => t.textContent ?? '').join('') : '');
async function readXml(zip: Zip, path: string): Promise<Document | null> { const f = zip.file(path); return f ? parseXml(await f.async('string')) : null; }
/** `ppt/slides/_rels/slide1.xml.rels` → { rId → absolute zip path } */
async function readRels(zip: Zip, ownerPath: string): Promise<Map<string, string>> {
    const dir = ownerPath.slice(0, ownerPath.lastIndexOf('/')), name = ownerPath.slice(ownerPath.lastIndexOf('/') + 1);
    const rels = await readXml(zip, `${dir}/_rels/${name}.rels`);
    const map = new Map<string, string>();
    if (!rels) return map;
    for (const r of byLocal(rels, 'Relationship')) {
        const target = r.getAttribute('Target') ?? '';
        if (r.getAttribute('TargetMode') === 'External') { map.set(r.getAttribute('Id') ?? '', target); continue; }
        map.set(r.getAttribute('Id') ?? '', resolvePath(dir, target));
    }
    return map;
}
function resolvePath(dir: string, target: string): string {
    if (target.startsWith('/')) return target.slice(1);
    const parts = dir.split('/');
    for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
    return parts.join('/');
}
const rId = (el: Element, attr: 'embed' | 'id'): string => Array.from(el.attributes).find((a) => a.localName === attr)?.value ?? '';

/** Ordered slide paths from presentation.xml (falls back to numeric sort of ppt/slides/slideN.xml). */
async function slidePaths(zip: Zip): Promise<string[]> {
    const pres = await readXml(zip, 'ppt/presentation.xml');
    const rels = await readRels(zip, 'ppt/presentation.xml');
    const ordered = pres ? byLocal(pres, 'sldId').map((s) => rels.get(rId(s, 'id'))).filter((p): p is string => !!p && !!zip.file(p)) : [];
    if (ordered.length) return ordered;
    return Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf' };
async function mediaDataUrl(zip: Zip, path: string): Promise<string | null> {
    const f = zip.file(path);
    if (!f) return null;
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${await f.async('base64')}`;
}

/** One a:p → markdown line ('' for empty). */
function paragraphMd(p: Element, rels: Map<string, string>, defaultBullets: boolean): string {
    const pPr = Array.from(p.children).find((c) => c.localName === 'pPr');
    const lvl = Number(pPr?.getAttribute('lvl') ?? 0) || 0;
    const kids = pPr ? Array.from(pPr.children).map((c) => c.localName) : [];
    const bullet = kids.includes('buChar') ? '-' : kids.includes('buAutoNum') ? '1.' : kids.includes('buNone') ? '' : defaultBullets ? '-' : '';
    let s = '';
    for (const c of Array.from(p.children)) {
        if (c.localName === 'br') { s += '\n'; continue; }
        if (c.localName !== 'r' && c.localName !== 'fld') continue;
        const t = text(c);
        if (!t) continue;
        const rPr = Array.from(c.children).find((x) => x.localName === 'rPr');
        let run = t;
        const link = rPr ? byLocal(rPr, 'hlinkClick')[0] : undefined;
        const href = link ? rels.get(rId(link, 'id')) : undefined;
        if (rPr?.getAttribute('b') === '1' && run.trim()) run = `**${run}**`;
        if (rPr?.getAttribute('i') === '1' && run.trim()) run = `*${run}*`;
        if (href && /^https?:/i.test(href)) run = `[${run}](${href})`;
        s += run;
    }
    if (!s.trim()) return '';
    return bullet ? `${'  '.repeat(Math.min(3, lvl))}${bullet} ${s}` : s;
}
function bodyMd(sp: Element, rels: Map<string, string>): string {
    const txBody = byLocal(sp, 'txBody')[0];
    if (!txBody) return '';
    const paras = Array.from(txBody.children).filter((c) => c.localName === 'p');
    const ph = byLocal(sp, 'ph')[0];
    const phType = ph?.getAttribute('type') ?? (ph ? 'body' : null);
    const defaultBullets = (phType === 'body' || phType === 'obj') && paras.length >= 2;
    return paras.map((p) => paragraphMd(p, rels, defaultBullets)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
const isTitlePh = (sp: Element): boolean => { const t = byLocal(sp, 'ph')[0]?.getAttribute('type'); return t === 'title' || t === 'ctrTitle'; };

const CHART_KIND: [string, ChartKind][] = [['barChart', 'bar'], ['bar3DChart', 'bar'], ['lineChart', 'line'], ['line3DChart', 'line'], ['pieChart', 'pie'], ['pie3DChart', 'pie'], ['doughnutChart', 'donut'], ['areaChart', 'area'], ['area3DChart', 'area']];
async function chartBlock(zip: Zip, path: string): Promise<Block> {
    const x = await readXml(zip, path);
    const kind = x ? CHART_KIND.find(([tag]) => byLocal(x, tag).length)?.[1] : undefined;
    const ser = x ? byLocal(x, 'ser')[0] : undefined;
    if (!x || !kind || !ser) return { id: newId(), type: 'callout', tone: 'info', md: 'Chart placeholder — this chart type could not be imported from PowerPoint.' };
    const pts = (tag: string) => { const node = byLocal(ser, tag)[0]; return node ? byLocal(node, 'pt').map((pt) => byLocal(pt, 'v')[0]?.textContent ?? '') : []; };
    const labels = pts('cat'), values = pts('val');
    const title = text(byLocal(x, 'title')[0]) || undefined;
    return { id: newId(), type: 'chart', kind, title, data: values.map((v, i) => ({ label: labels[i] ?? String(i + 1), value: Number(v) || 0 })) };
}

function tableBlock(tbl: Element): Block {
    const rows = byLocal(tbl, 'tr').map((tr) => byLocal(tr, 'tc').map((tc) => text(tc)));
    return { id: newId(), type: 'table', headers: rows[0] ?? [], rows: rows.slice(1) };
}

async function slideToCard(zip: Zip, path: string): Promise<Card> {
    const xml = await readXml(zip, path);
    const rels = await readRels(zip, path);
    const card: Card = { id: newId('c'), layout: 'default', blocks: [] };
    if (!xml) return card;
    const spTree = byLocal(xml, 'spTree')[0];
    const shapes: Element[] = [];
    const collect = (el: Element) => { for (const c of Array.from(el.children)) { if (c.localName === 'grpSp') collect(c); else if (['sp', 'pic', 'graphicFrame'].includes(c.localName)) shapes.push(c); } };
    if (spTree) collect(spTree);
    for (const s of shapes) {
        if (s.localName === 'sp') {
            if (!card.title && isTitlePh(s)) { card.title = text(s).trim() || undefined; continue; }
            const md = bodyMd(s, rels);
            if (md) card.blocks.push({ id: newId(), type: 'text', md });
        } else if (s.localName === 'pic') {
            const blip = byLocal(s, 'blip')[0];
            const target = blip ? rels.get(rId(blip, 'embed')) : undefined;
            const src = target ? await mediaDataUrl(zip, target) : null;
            if (src) card.blocks.push({ id: newId(), type: 'image', src, alt: byLocal(s, 'cNvPr')[0]?.getAttribute('descr') || undefined });
        } else {
            const tbl = byLocal(s, 'tbl')[0];
            if (tbl) { card.blocks.push(tableBlock(tbl)); continue; }
            const chart = byLocal(s, 'chart')[0];
            if (chart) { const target = rels.get(rId(chart, 'id')); card.blocks.push(target ? await chartBlock(zip, target) : { id: newId(), type: 'callout', tone: 'info', md: 'Chart placeholder' }); }
        }
    }
    const notesPath = [...rels.values()].find((p) => /notesSlides\/notesSlide\d+\.xml$/.test(p));
    const notes = notesPath ? await readXml(zip, notesPath) : null;
    if (notes) {
        const lines = byLocal(notes, 'sp').filter((sp) => { const t = byLocal(sp, 'ph')[0]?.getAttribute('type'); return t !== 'sldNum' && t !== 'sldImg'; })
            .flatMap((sp) => byLocal(sp, 'p').map((p) => text(p).trim())).filter(Boolean);
        if (lines.length) card.notes = lines.join('\n');
    }
    return card;
}

/** .pptx → IDoc (title from the file name; theme stays 'inherit' — use importPptxTheme for colours). */
export async function importPptxFile(file: Blob & { name?: string }): Promise<IDoc> {
    const zip = await loadZip(file);
    const paths = await slidePaths(zip);
    if (!paths.length) throw new Error('No slides found in that .pptx');
    const cards: Card[] = [];
    for (const p of paths) cards.push(await slideToCard(zip, p));
    return createEmptyDoc({ title: (file.name ?? 'Imported presentation').replace(/\.pptx$/i, ''), cards });
}

// ── theme ───────────────────────────────────────────────────────────────

function schemeColor(scheme: Element, local: string): string | undefined {
    const el = byLocal(scheme, local)[0];
    if (!el) return undefined;
    const c = byLocal(el, 'srgbClr')[0]?.getAttribute('val') ?? byLocal(el, 'sysClr')[0]?.getAttribute('lastClr');
    return c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : undefined;
}
/** Blend `a` toward `b` by `t` (0–1); both '#rrggbb'. */
function mix(a: string, b: string, t: number): string {
    const ch = (i: number) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0');
    return `#${ch(1)}${ch(3)}${ch(5)}`;
}

/** ppt/theme/theme1.xml → CustomTheme (lt1→card, lt2→page bg, dk1→text, dk2→muted, accent1→accent, major/minor latin → fonts). */
export async function importPptxTheme(file: Blob & { name?: string }): Promise<CustomTheme> {
    const zip = await loadZip(file);
    const themePath = Object.keys(zip.files).find((p) => /^ppt\/theme\/theme\d*\.xml$/.test(p));
    const x = themePath ? await readXml(zip, themePath) : null;
    const clr = x ? byLocal(x, 'clrScheme')[0] : undefined;
    if (!x || !clr) throw new Error('No theme found in that .pptx');
    const lt1 = schemeColor(clr, 'lt1') ?? '#ffffff', lt2 = schemeColor(clr, 'lt2') ?? '#f3f4f6', dk1 = schemeColor(clr, 'dk1') ?? '#111827', dk2 = schemeColor(clr, 'dk2') ?? '#4b5563';
    const accent = schemeColor(clr, 'accent1') ?? '#4f46e5';
    const face = (tag: string) => byLocal(byLocal(x, tag)[0] ?? x, 'latin')[0]?.getAttribute('typeface') || '';
    const major = face('majorFont'), minor = face('minorFont');
    const name = (clr.getAttribute('name') || (file.name ?? '').replace(/\.pptx$/i, '') || 'PowerPoint theme').trim();
    return {
        name,
        vars: {
            '--idoc-bg': lt2, '--idoc-surface': lt1, '--idoc-text': dk1, '--idoc-muted': dk2, '--idoc-accent': accent,
            '--idoc-border': mix(lt2, dk2, 0.25),
            '--idoc-heading-font': major ? `"${major}", sans-serif` : "'Hanken Grotesk', sans-serif",
            '--idoc-body-font': minor ? `"${minor}", sans-serif` : "'Inter', sans-serif",
            '--idoc-radius': '8px',
        },
    };
}
