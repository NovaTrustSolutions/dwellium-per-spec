/**
 * idocExport — standalone HTML / Markdown / PDF / print / JSON exports for an
 * IDoc. Pure string builders (unit-testable) + tiny DOM download helpers.
 *
 * exportHtml emits ZERO <script> tags: accordions are <details>, tabs degrade
 * to stacked sections, quiz answers hide behind <details>, bar/pie charts are
 * inline SVG, line charts fall back to a table, embeds are sandboxed iframes.
 *
 * ── Wave 2 seam for the Export menu (IDocEditor maps this into its menu) ──
 *   EXPORT_ACTIONS: { id, label, hint?, run(doc, ctx) }[]
 *     ctx = { activeCardEl?: HTMLElement | null; docEl?: HTMLElement | null }
 *       activeCardEl → the rendered `.scribe-idocs__card` for "PNG (this card)"
 *       docEl        → root that contains the rendered cards for "PNG (all cards)"; falls back to document
 *   ids: html · markdown · pdf-text · pdf-styled · print · png-card · png-all
 *   (JSON stays in the editor — it needs idocsStore.exportDoc.)
 *   exportStyledPdf(doc)          — hidden same-origin <iframe srcdoc=exportHtml(doc)> → contentWindow.print()
 *   exportCardPng(cardEl, opts?)  — DOM → SVG <foreignObject> → canvas → PNG download (limitations in the JSDoc)
 */
import { markdownToPdfBytes, downloadPdf } from '../pdfExport';
import { renderSafeMarkdown } from '../../../utils/safeMarkdown';
import { embedSrcFor } from './idocsAi';
import { themeById, themeVarsFor, type Block, type Card, type IDoc } from './idocTypes';
import { qrSvg } from './blocks/qr';
import { imgOptsCss, imgOptsOf } from './blocks/imageOpts';
import { PAGE_ASPECT, PAGE_PRINT_SIZE, cardLinkId, fontFaceCss } from './IDocRenderer';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Sanitized markdown; `[^n]` (which survives sanitizing as literal text) becomes a superscript footnote link. */
const md = (s: string, cardId = ''): string => {
    const html = renderSafeMarkdown(s || '');
    return cardId ? html.replace(/\[\^(\w+)\](?!:)/g, (_m, n: string) => `<sup class="idoc-fnref"><a href="#fn-${esc(cardId)}-${n}">${n}</a></sup>`) : html;
};
const safeUrl = (u: string): string => (/^(https?:|mailto:|data:image\/)/i.test(u.trim()) ? esc(u.trim()) : '');

function svgBars(data: { label: string; value: number }[]): string {
    const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
    const W = 480, H = 220, pad = 28, gap = 8;
    const bw = (W - pad * 2) / data.length - gap;
    const bars = data.map((d, i) => {
        const h = Math.max(1, (Math.abs(d.value) / max) * (H - pad * 2));
        const x = pad + i * (bw + gap), y = H - pad - h;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="var(--idoc-accent)"/>`
            + `<text x="${(x + bw / 2).toFixed(1)}" y="${H - pad + 14}" font-size="10" text-anchor="middle" fill="var(--idoc-muted)">${esc(d.label)}</text>`
            + `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--idoc-text)">${d.value}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart" style="width:100%;height:auto">${bars}</svg>`;
}

function svgArea(data: { label: string; value: number }[]): string {
    const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
    const W = 480, H = 220, pad = 28;
    const n = Math.max(1, data.length - 1);
    const pts = data.map((d, i) => [pad + (i / n) * (W - pad * 2), H - pad - (Math.abs(d.value) / max) * (H - pad * 2)] as const);
    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${pad},${H - pad} ${line} ${(pts[pts.length - 1]?.[0] ?? pad).toFixed(1)},${H - pad}`;
    const labels = data.map((d, i) => `<text x="${pts[i][0].toFixed(1)}" y="${H - pad + 14}" font-size="10" text-anchor="middle" fill="var(--idoc-muted)">${esc(d.label)}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Area chart" style="width:100%;height:auto"><polygon points="${area}" fill="var(--idoc-accent)" fill-opacity=".25"/><polyline points="${line}" fill="none" stroke="var(--idoc-accent)" stroke-width="2"/>${labels}</svg>`;
}

function svgPie(data: { label: string; value: number }[], donut = false): string {
    const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
    const R = 80, cx = 100, cy = 100;
    let angle = -Math.PI / 2;
    const ops = [1, 0.75, 0.5, 0.35, 0.9, 0.6, 0.45, 0.25];
    const slices = data.map((d, i) => {
        const frac = Math.max(0, d.value) / total;
        const a2 = angle + frac * Math.PI * 2;
        const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
        const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
        const large = frac > 0.5 ? 1 : 0;
        const path = frac >= 0.999
            ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="var(--idoc-accent)"/>`
            : `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="var(--idoc-accent)" fill-opacity="${ops[i % ops.length]}" stroke="var(--idoc-surface)"/>`;
        angle = a2;
        return path;
    }).join('');
    const legend = data.map((d, i) => `<li><span style="display:inline-block;width:10px;height:10px;background:var(--idoc-accent);opacity:${ops[i % ops.length]};margin-right:6px"></span>${esc(d.label)} — ${d.value}</li>`).join('');
    const hole = donut ? `<circle cx="${cx}" cy="${cy}" r="${R * 0.55}" fill="var(--idoc-surface)"/>` : '';
    return `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 200 200" role="img" aria-label="${donut ? 'Donut' : 'Pie'} chart" style="width:200px;height:200px">${slices}${hole}</svg><ul style="list-style:none;padding:0;margin:0;font-size:13px">${legend}</ul></div>`;
}

function dataTable(data: { label: string; value: number }[]): string {
    return `<table class="idoc-table"><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody>${data.map((d) => `<tr><td>${esc(d.label)}</td><td>${d.value}</td></tr>`).join('')}</tbody></table>`;
}

export function blockToHtml(b: Block, doc: IDoc, cardId = ''): string {
    switch (b.type) {
        case 'heading': return `<h${b.level}>${esc(b.text)}</h${b.level}>`;
        case 'text': return `<div class="idoc-md">${md(b.md, cardId)}</div>`;
        case 'callout': return `<div class="idoc-callout idoc-callout--${b.tone}">${md(b.md, cardId)}</div>`;
        case 'quote': return `<blockquote class="idoc-quote">${md(b.md, cardId)}${b.cite ? `<cite>— ${esc(b.cite)}</cite>` : ''}</blockquote>`;
        case 'image': {
            if (!safeUrl(b.src)) return '';
            const css = imgOptsCss(imgOptsOf(b));
            return `<figure class="idoc-figure"><img src="${safeUrl(b.src)}" alt="${esc(b.alt || '')}"${css ? ` style="${css}"` : ''}/>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`;
        }
        case 'gallery': return `<div class="idoc-gallery">${b.images.filter((i) => safeUrl(i.src)).map((i) => `<img src="${safeUrl(i.src)}" alt="${esc(i.alt || '')}"/>`).join('')}</div>`;
        case 'embed': {
            const info = embedSrcFor(b.url);
            if (!info) return '';
            return `<div class="idoc-embed idoc-embed--${info.aspect.replace(':', 'x')}"><iframe src="${esc(info.src)}" title="${esc(info.provider)} embed" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe></div>`;
        }
        case 'chart': {
            const body = b.kind === 'bar' ? svgBars(b.data) : b.kind === 'pie' || b.kind === 'donut' ? svgPie(b.data, b.kind === 'donut') : b.kind === 'area' ? svgArea(b.data) : dataTable(b.data);
            return `<figure class="idoc-chart">${b.title ? `<figcaption>${esc(b.title)}</figcaption>` : ''}${body}</figure>`;
        }
        case 'table': return `<table class="idoc-table">${b.headers.length ? `<thead><tr>${b.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        case 'accordion': return `<div class="idoc-accordion">${b.items.map((it) => `<details><summary>${esc(it.title)}</summary><div class="idoc-md">${md(it.md)}</div></details>`).join('')}</div>`;
        case 'tabs': return `<div class="idoc-tabs">${b.items.map((it) => `<section class="idoc-tab"><h4>${esc(it.title)}</h4><div class="idoc-md">${md(it.md)}</div></section>`).join('')}</div>`;
        case 'columns': return `<div class="idoc-columns" style="grid-template-columns:repeat(${b.columns.length},1fr)">${b.columns.map((c) => `<div class="idoc-md">${md(c)}</div>`).join('')}</div>`;
        case 'button': {
            const cid = cardLinkId(b.href);
            if (cid) return `<p><a class="idoc-btn idoc-btn--${b.variant}" href="#card-${esc(cid)}">${esc(b.label)}</a></p>`;
            return safeUrl(b.href) ? `<p><a class="idoc-btn idoc-btn--${b.variant}" href="${safeUrl(b.href)}" target="_blank" rel="noopener noreferrer">${esc(b.label)}</a></p>` : '';
        }
        case 'code': return `<pre class="idoc-code"><code>${esc(b.code)}</code></pre>`;
        case 'divider': return '<hr/>';
        case 'timeline': return `<ol class="idoc-timeline">${b.items.map((it) => `<li><span class="idoc-tl-date">${esc(it.date)}</span><div><strong>${esc(it.title)}</strong><div class="idoc-md">${md(it.md)}</div></div></li>`).join('')}</ol>`;
        case 'quiz': return `<div class="idoc-quiz"><p><strong>${esc(b.question)}</strong></p><ol type="A">${b.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol><details><summary>Show answer</summary><p>Answer: <strong>${esc(b.options[b.answerIndex] ?? '')}</strong>${b.explanation ? ` — ${esc(b.explanation)}` : ''}</p></details></div>`;
        case 'toc': return `<nav class="idoc-toc">${tocList(doc.cards)}</nav>`;
        case 'steps': return `<ol class="idoc-steps${b.numbered === false ? ' idoc-steps--plain' : ''}">${b.items.map((it, i) => `<li><span class="idoc-step-marker">${b.numbered === false ? '' : i + 1}</span><div><strong>${esc(it.title)}</strong><div class="idoc-md">${md(it.md, cardId)}</div></div></li>`).join('')}</ol>`;
        case 'funnel': { const max = Math.max(1, ...b.items.map((it) => it.value ?? 0)); return `<div class="idoc-funnel">${b.items.map((it) => `<div class="idoc-funnel__row" style="width:${it.value == null ? 100 : Math.max(20, Math.round((it.value / max) * 100))}%"><span>${esc(it.label)}</span>${it.value == null ? '' : `<em>${it.value}</em>`}</div>`).join('')}</div>`; }
        case 'boxes': return `<div class="idoc-boxes" style="grid-template-columns:repeat(${b.columns ?? 3},1fr)">${b.items.map((it) => `<div class="idoc-box${it.emphasis ? ' idoc-box--emphasis' : ''}"><strong>${esc(it.title)}</strong><div class="idoc-md">${md(it.md, cardId)}</div></div>`).join('')}</div>`;
        case 'math': return b.inline ? `<code class="idoc-math">${esc(b.latex)}</code>` : `<pre class="idoc-math idoc-math--block">${esc(b.latex)}</pre>`;
        case 'diagram': return `<pre class="idoc-diagram mermaid">${esc(b.mermaid)}</pre>`;
        case 'qr': {
            if (!safeUrl(b.url)) return '';
            // Local SVG first; the remote service is only the fallback when the URL is too long for version 10.
            const svg = qrSvg(b.url, { title: `QR code for ${b.url}` }) ?? `<img alt="QR code for ${esc(b.url)}" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(b.url)}"/>`;
            return `<figure class="idoc-qr">${svg}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`;
        }
    }
}

function tocList(cards: Card[]): string {
    return `<ol>${cards.map((c, i) => `<li><a href="#card-${esc(c.id)}">${esc(c.title || `Card ${i + 1}`)}</a>${c.children?.length ? tocList(c.children) : ''}</li>`).join('')}</ol>`;
}

/** Inline style mirroring IDocRenderer.cardBackgroundStyle (CSS vars consumed by EXPORT_CSS). */
function cardBgStyle(c: Card): string {
    const bg = c.background;
    const parts: string[] = [];
    if (bg?.color) parts.push(`--idoc-card-bg:${esc(bg.color.replace(/[;{}]/g, ''))}`);
    const img = bg?.image || (c.layout === 'background' ? c.headerImage : undefined);
    if (img && safeUrl(img)) {
        parts.push(`--idoc-card-image:url(&quot;${safeUrl(img)}&quot;)`);
        parts.push(`--idoc-card-image-pos:${bg?.align === 'top' ? 'top' : bg?.align === 'bottom' ? 'bottom' : 'center'}`);
    }
    if (bg?.intensity != null) parts.push(`--idoc-overlay:${Math.max(0, Math.min(100, bg.intensity)) / 100}`);
    return parts.length ? ` style="${parts.join(';')}"` : '';
}

function cardToHtml(c: Card, doc: IDoc, index: number, depth = 0): string {
    const media = c.headerImage && c.layout !== 'background' && safeUrl(c.headerImage) ? `<img class="idoc-card-media" src="${safeUrl(c.headerImage)}" alt=""/>` : '';
    const children = (c.children ?? []).map((ch, i) => `<details class="idoc-subcard" open><summary>${esc(ch.title || `Section ${i + 1}`)}</summary>${cardToHtml(ch, doc, i, depth + 1)}</details>`).join('\n');
    const footnotes = c.footnotes?.length ? `<ol class="idoc-footnotes">${c.footnotes.map((f, i) => `<li id="fn-${esc(c.id)}-${i + 1}">${md(f.text)}</li>`).join('')}</ol>` : '';
    const body = `<div class="idoc-card-body">${c.title ? `<h2 class="idoc-card-title">${esc(c.title)}</h2>` : ''}${c.blocks.map((b) => blockToHtml(b, doc, c.id)).join('\n')}${children}${footnotes}</div>`;
    const chrome = depth === 0 && !(doc.chrome?.hideOnFirst && index === 0) ? doc.chrome : undefined;
    const top = chrome && (chrome.header || chrome.logo) ? `<div class="idoc-chrome idoc-chrome--top"><span>${esc(chrome.header || '')}</span>${chrome.logo && safeUrl(chrome.logo) ? `<img class="idoc-chrome-logo" src="${safeUrl(chrome.logo)}" alt=""/>` : ''}</div>` : '';
    const bottom = chrome && (chrome.footer || chrome.sectionNumbers) ? `<div class="idoc-chrome idoc-chrome--bottom"><span>${esc(chrome.footer || '')}</span>${chrome.sectionNumbers ? `<span class="idoc-chrome-num">${index + 1} / ${doc.cards.length}</span>` : ''}</div>` : '';
    const hasImage = !!(c.background?.image || (c.layout === 'background' && c.headerImage));
    const cls = `idoc-card idoc-card--${c.layout}${depth ? ' idoc-card--nested' : ''}${hasImage ? ` idoc-card--has-image idoc-card--overlay-${c.background?.overlay ?? 'faded'}` : ''}${c.background?.color ? ' idoc-card--has-color' : ''}`;
    return `<section id="card-${esc(c.id)}" class="${cls}"${cardBgStyle(c)}>${top}${c.layout === 'split-right' ? body + media : media + body}${bottom}</section>`;
}

const EXPORT_CSS = `
*{box-sizing:border-box}body{margin:0;background:var(--idoc-bg);color:var(--idoc-text);font-family:var(--idoc-body-font);line-height:1.6}
h1,h2,h3,h4{font-family:var(--idoc-heading-font);line-height:1.2;margin:.6em 0 .4em}
.idoc-wrap{max-width:860px;margin:0 auto;padding:32px 20px}
.idoc-title{font-size:2.2rem;margin:0 0 .3em}.idoc-desc{color:var(--idoc-muted);margin:0 0 2rem}
.idoc-card{background:var(--idoc-surface);border:1px solid var(--idoc-border);border-radius:var(--idoc-radius);padding:28px;margin:0 0 20px;break-inside:avoid;page-break-inside:avoid}
.idoc-card--split-left,.idoc-card--split-right{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
.idoc-card--hero{padding:0;overflow:hidden}.idoc-card--hero .idoc-card-body{padding:28px}.idoc-card--hero .idoc-card-title{font-size:2rem}
.idoc-card-media{width:100%;height:auto;border-radius:calc(var(--idoc-radius) - 2px);object-fit:cover}
.idoc-callout{border-left:4px solid var(--idoc-accent);background:color-mix(in srgb,var(--idoc-accent) 10%,transparent);padding:10px 14px;border-radius:6px;margin:12px 0}
.idoc-callout--warning{border-color:#f59e0b}.idoc-callout--danger{border-color:#ef4444}.idoc-callout--success{border-color:#22c55e}
.idoc-quote{border-left:3px solid var(--idoc-accent);margin:12px 0;padding:4px 14px;color:var(--idoc-muted)}.idoc-quote cite{display:block;font-size:.85em;margin-top:4px}
.idoc-figure img,.idoc-gallery img{max-width:100%;border-radius:6px}.idoc-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.idoc-embed{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:6px;overflow:hidden}.idoc-embed--4x3{aspect-ratio:4/3}.idoc-embed--auto{aspect-ratio:auto;height:380px}
.idoc-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.idoc-table{border-collapse:collapse;width:100%;margin:12px 0}.idoc-table th,.idoc-table td{border:1px solid var(--idoc-border);padding:6px 10px;text-align:left}.idoc-table th{background:color-mix(in srgb,var(--idoc-accent) 12%,transparent)}
.idoc-accordion details{border:1px solid var(--idoc-border);border-radius:6px;padding:8px 12px;margin:6px 0}.idoc-accordion summary{cursor:pointer;font-weight:600}
.idoc-tabs .idoc-tab{border-top:1px solid var(--idoc-border);padding:8px 0}.idoc-tabs h4{margin:.4em 0;color:var(--idoc-accent)}
.idoc-columns{display:grid;gap:16px}
.idoc-btn{display:inline-block;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600}.idoc-btn--primary{background:var(--idoc-accent);color:var(--idoc-bg)}.idoc-btn--secondary{border:1px solid var(--idoc-accent);color:var(--idoc-accent)}
.idoc-code{background:color-mix(in srgb,var(--idoc-text) 8%,transparent);border:1px solid var(--idoc-border);border-radius:6px;padding:12px;overflow:auto;font-size:.9em}
.idoc-timeline{list-style:none;padding:0;margin:12px 0;border-left:2px solid var(--idoc-border)}.idoc-timeline li{display:flex;gap:14px;padding:0 0 14px 16px;position:relative}.idoc-timeline li::before{content:"";position:absolute;left:-6px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--idoc-accent)}
.idoc-tl-date{color:var(--idoc-muted);min-width:70px;font-size:.9em}
.idoc-quiz{border:1px solid var(--idoc-border);border-radius:8px;padding:12px 16px}
.idoc-toc ol{padding-left:20px}.idoc-toc a{color:var(--idoc-accent)}
.idoc-chart figcaption{font-weight:600;margin-bottom:6px}
hr{border:0;border-top:1px solid var(--idoc-border);margin:16px 0}
.idoc-card{position:relative;background:var(--idoc-card-bg,var(--idoc-surface));aspect-ratio:var(--idoc-aspect,auto);overflow:auto}
.idoc-card--has-image{background-image:var(--idoc-card-image);background-size:cover;background-position:var(--idoc-card-image-pos,center)}
.idoc-card--has-image>*{position:relative}
.idoc-card--has-image::before{content:"";position:absolute;inset:0;pointer-events:none;background:color-mix(in srgb,var(--idoc-surface) calc(var(--idoc-overlay,.6)*100%),transparent)}
.idoc-card--overlay-frosted::before{backdrop-filter:blur(calc(var(--idoc-overlay,.6)*14px))}
.idoc-card--overlay-clear::before,.idoc-card--overlay-none::before{background:transparent}
.idoc-card--overlay-clear{color:var(--idoc-text);text-shadow:0 1px 3px var(--idoc-bg)}
.idoc-card--image-top{padding-top:0}.idoc-card--image-top .idoc-card-media{margin:0 0 16px}
.idoc-card--background{min-height:320px;display:flex;flex-direction:column;justify-content:center}
.idoc-card--nested{margin:0;border:0;padding:8px 0 0}
.idoc-subcard{border:1px solid var(--idoc-border);border-radius:8px;padding:8px 14px;margin:12px 0}.idoc-subcard>summary{cursor:pointer;font-weight:600;font-family:var(--idoc-heading-font)}
.idoc-footnotes{margin:18px 0 0;padding:10px 0 0 22px;border-top:1px solid var(--idoc-border);font-size:.85em;color:var(--idoc-muted)}
.idoc-fnref{font-size:.75em;line-height:0}.idoc-fnref a{color:var(--idoc-accent);text-decoration:none}
.idoc-chrome{display:flex;justify-content:space-between;align-items:center;font-size:.8em;color:var(--idoc-muted)}
.idoc-chrome--top{margin:-12px 0 12px}.idoc-chrome--bottom{margin:16px 0 -12px}.idoc-chrome-logo{height:22px;width:auto}
.idoc-steps{list-style:none;padding:0;margin:12px 0}.idoc-steps li{display:flex;gap:14px;position:relative;padding:0 0 18px}
.idoc-steps li::before{content:"";position:absolute;left:13px;top:28px;bottom:0;width:2px;background:var(--idoc-border)}.idoc-steps li:last-child::before{display:none}
.idoc-step-marker{flex:none;width:28px;height:28px;border-radius:50%;background:var(--idoc-accent);color:var(--idoc-bg);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85em}
.idoc-steps--plain .idoc-step-marker{width:12px;height:12px;margin:8px 8px 0}.idoc-steps--plain li::before{left:13px}
.idoc-funnel{display:flex;flex-direction:column;align-items:center;gap:6px;margin:12px 0}
.idoc-funnel__row{display:flex;justify-content:space-between;gap:12px;padding:8px 14px;border-radius:6px;background:var(--idoc-accent);color:var(--idoc-bg);font-weight:600;min-width:20%}
.idoc-funnel__row:nth-child(2n){opacity:.85}.idoc-funnel__row em{font-style:normal;opacity:.85}
.idoc-boxes{display:grid;gap:12px;margin:12px 0}.idoc-box{border:1px solid var(--idoc-border);border-radius:8px;padding:12px 14px;background:color-mix(in srgb,var(--idoc-text) 3%,transparent)}
.idoc-box--emphasis{border-color:var(--idoc-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--idoc-accent) 30%,transparent);background:color-mix(in srgb,var(--idoc-accent) 10%,transparent)}
.idoc-math{font-family:ui-monospace,monospace}.idoc-math--block{text-align:center;padding:10px;overflow:auto}
.idoc-diagram{white-space:pre;overflow:auto;background:color-mix(in srgb,var(--idoc-text) 6%,transparent);padding:12px;border-radius:6px}
.idoc-qr{margin:12px 0;text-align:center}.idoc-qr svg,.idoc-qr img{width:200px;height:200px}.idoc-qr figcaption{color:var(--idoc-muted);font-size:.85em}
@media print{body{background:#fff}.idoc-card{page-break-after:always;break-after:page;box-shadow:none}.idoc-embed{display:none}.idoc-card--overlay-frosted::before{backdrop-filter:none}}
`;

/** Standalone HTML document — no scripts, inline CSS, theme vars on :root. */
/** Theme vars for a standalone document: `inherit` app tokens don't exist outside the app → paper base. */
export function exportThemeVars(doc: IDoc): Record<string, string> {
    const paper = themeById('paper').vars;
    if (doc.theme === 'custom' && doc.customTheme) return { ...paper, ...doc.customTheme.vars };
    return doc.theme === 'inherit' ? { ...paper } : themeVarsFor(doc);
}

export function exportHtml(doc: IDoc): string {
    const vars = exportThemeVars(doc);
    const pageSize = doc.pageSize ?? 'fluid';
    // Strip anything that could break out of the style block; values are theme strings, not user HTML.
    const rootVars = Object.entries({ ...vars, '--idoc-aspect': PAGE_ASPECT[pageSize] }).map(([k, v]) => `${k}:${String(v).replace(/[<>{}]/g, '')}`).join(';');
    const pageCss = PAGE_PRINT_SIZE[pageSize] ? `@media print{@page{size:${PAGE_PRINT_SIZE[pageSize]}}}` : '';
    const fontCss = doc.theme === 'custom' ? fontFaceCss(doc.customTheme?.fontFaces) : '';
    return `<!doctype html>
<html lang="${esc(doc.language || 'en')}"${doc.dir ? ` dir="${esc(doc.dir)}"` : ''}>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(doc.title)}</title>
<style>${fontCss}:root{${rootVars}}${EXPORT_CSS}${pageCss}</style>
</head>
<body>
<main class="idoc-wrap">
<h1 class="idoc-title">${esc(doc.title)}</h1>
${doc.description ? `<p class="idoc-desc">${esc(doc.description)}</p>` : ''}
${doc.cards.map((c, i) => cardToHtml(c, doc, i)).join('\n')}
</main>
</body>
</html>`;
}

function blockToMd(b: Block, doc: IDoc): string {
    switch (b.type) {
        case 'heading': return `${'#'.repeat(b.level + 1)} ${b.text}`;
        case 'text': return b.md;
        case 'callout': return `> **${b.tone.toUpperCase()}:** ${b.md.replace(/\n/g, '\n> ')}`;
        case 'quote': return `> ${b.md.replace(/\n/g, '\n> ')}${b.cite ? `\n> — ${b.cite}` : ''}`;
        case 'image': return b.src ? `![${b.alt || ''}](${b.src})${b.caption ? `\n*${b.caption}*` : ''}` : '';
        case 'gallery': return b.images.map((i) => `![${i.alt || ''}](${i.src})`).join('\n');
        case 'embed': return b.url ? `[Embedded content](${b.url})` : '';
        case 'chart': return `${b.title ? `**${b.title}**\n\n` : ''}| Label | Value |\n|---|---|\n${b.data.map((d) => `| ${d.label} | ${d.value} |`).join('\n')}`;
        case 'table': return `| ${b.headers.join(' | ')} |\n|${b.headers.map(() => '---').join('|')}|\n${b.rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
        case 'accordion': return b.items.map((it) => `<details><summary>${it.title}</summary>\n\n${it.md}\n\n</details>`).join('\n\n');
        case 'tabs': return b.items.map((it) => `#### ${it.title}\n\n${it.md}`).join('\n\n');
        case 'columns': return b.columns.join('\n\n');
        case 'button': { const cid = cardLinkId(b.href); return `[${b.label}](${cid ? `#card-${cid}` : b.href})`; }
        case 'code': return `\`\`\`${b.lang}\n${b.code}\n\`\`\``;
        case 'divider': return '---';
        case 'timeline': return b.items.map((it) => `- **${it.date}** — ${it.title}${it.md ? `\n  ${it.md.replace(/\n/g, '\n  ')}` : ''}`).join('\n');
        case 'quiz': return `**${b.question}**\n\n${b.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n<details><summary>Answer</summary>${b.options[b.answerIndex] ?? ''}${b.explanation ? ` — ${b.explanation}` : ''}</details>`;
        case 'toc': return tocMd(doc.cards);
        case 'steps': return b.items.map((it, i) => `${b.numbered === false ? '-' : `${i + 1}.`} **${it.title}**${it.md ? ` — ${it.md}` : ''}`).join('\n');
        case 'funnel': return b.items.map((it) => `- ${it.label}${it.value == null ? '' : `: ${it.value}`}`).join('\n');
        case 'boxes': return b.items.map((it) => `**${it.title}**${it.md ? `\n${it.md}` : ''}`).join('\n\n');
        case 'math': return b.inline ? `$${b.latex}$` : `$$\n${b.latex}\n$$`;
        case 'diagram': return `\`\`\`mermaid\n${b.mermaid}\n\`\`\``;
        case 'qr': return `[QR: ${b.url}](${b.url})${b.caption ? ` — ${b.caption}` : ''}`;
    }
}

function tocMd(cards: Card[], indent = ''): string {
    return cards.map((c, i) => `${indent}${i + 1}. ${c.title || `Card ${i + 1}`}${c.children?.length ? `\n${tocMd(c.children, `${indent}   `)}` : ''}`).join('\n');
}

function cardToMd(c: Card, doc: IDoc, parts: string[], depth: number): void {
    parts.push(`\n${'#'.repeat(Math.min(6, depth + 2))} ${c.title || (depth ? 'Section' : 'Card')}`);
    if (c.headerImage) parts.push(`![](${c.headerImage})`);
    for (const b of c.blocks) { const s = blockToMd(b, doc); if (s) parts.push(s); }
    for (const ch of c.children ?? []) cardToMd(ch, doc, parts, depth + 1);
    if (c.footnotes?.length) parts.push(c.footnotes.map((f, i) => `[^${i + 1}]: ${f.text}`).join('\n'));
}

export function exportMarkdown(doc: IDoc): string {
    const parts = [`# ${doc.title}`];
    if (doc.description) parts.push(doc.description);
    for (const c of doc.cards) cardToMd(c, doc, parts, 0);
    return parts.join('\n\n').trim() + '\n';
}

export function download(filename: string, mime: string, text: string): void {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(title: string): string {
    return (title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'interactive-doc');
}

/** ponytail: text-only PDF via existing pdf-lib helper; a styled render would need html→canvas. Print covers the styled case. */
export async function exportPdf(doc: IDoc): Promise<void> {
    const bytes = await markdownToPdfBytes(doc.title, exportMarkdown(doc));
    downloadPdf(`${safeFilename(doc.title)}.pdf`, bytes);
}

/** Print the current page — InteractiveDocs.css carries the @media print rules that lay cards page-per-card. */
export function printDoc(): void {
    try { window.print(); } catch { /* sandboxed */ }
}

// ── Wave 2: styled PDF (print-to-PDF of the export HTML) ─────────────────

/**
 * Styled PDF: the script-free export HTML is loaded into a hidden same-origin
 * <iframe srcdoc> (theme vars, @font-face, per-card `break-after: page`,
 * `@page{margin:12mm}`), then `contentWindow.print()` opens the browser's print
 * dialog where "Save as PDF" keeps every style. Resolves once the dialog closes
 * (afterprint) or after a timeout; the iframe is removed either way.
 * Limitations: needs a browser print dialog (no headless/silent save); iframes
 * (embeds) are hidden by the print CSS; remote images print only if reachable.
 */
export function exportStyledPdf(doc: IDoc, opts: { timeoutMs?: number } = {}): Promise<void> {
    return new Promise((resolve) => {
        const html = exportHtml(doc).replace('</head>', `<style>@page{margin:12mm}.idoc-card{break-after:page;page-break-after:always}</style></head>`);
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.title = 'PDF export';
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
        let done = false;
        const finish = () => { if (done) return; done = true; iframe.remove(); resolve(); };
        const timer = setTimeout(finish, opts.timeoutMs ?? 120_000);
        iframe.onload = () => {
            const win = iframe.contentWindow;
            if (!win) { clearTimeout(timer); finish(); return; }
            win.addEventListener('afterprint', () => { clearTimeout(timer); setTimeout(finish, 50); });
            const go = () => { try { win.focus(); win.print(); } catch { clearTimeout(timer); finish(); } };
            const fonts = (win.document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
            if (fonts?.ready) fonts.ready.then(go, go); else setTimeout(go, 50);
        };
        iframe.srcdoc = html;
        document.body.appendChild(iframe);
    });
}

// ── Wave 2: PNG per card (DOM → SVG foreignObject → canvas) ──────────────

const SKIP_TAGS = new Set(['IFRAME', 'EMBED', 'OBJECT', 'VIDEO', 'AUDIO', 'SCRIPT', 'STYLE', 'CANVAS']);

async function toDataUrl(src: string): Promise<string | null> {
    if (src.startsWith('data:')) return src;
    try {
        const res = await fetch(src, { mode: 'cors' });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
    } catch { return null; }
}

/** Deep-clone `src` inlining computed styles; media that can't be rasterized becomes a placeholder box. */
async function cloneWithStyles(src: Element): Promise<HTMLElement> {
    const dst = src.cloneNode(false) as HTMLElement;
    const cs = getComputedStyle(src);
    let css = '';
    for (let i = 0; i < cs.length; i++) { const p = cs[i]; css += `${p}:${cs.getPropertyValue(p)};`; }
    dst.setAttribute('style', css);
    if (src instanceof HTMLImageElement) {
        const url = await toDataUrl(src.currentSrc || src.src);
        if (url) (dst as HTMLImageElement).src = url;
        else { const ph = document.createElement('div'); ph.setAttribute('style', `${css}display:flex;align-items:center;justify-content:center;background:#e5e7eb;color:#6b7280;font:12px sans-serif`); ph.textContent = 'image'; return ph; }
        return dst;
    }
    for (const child of Array.from(src.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) dst.appendChild(child.cloneNode());
        else if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as Element;
            if (SKIP_TAGS.has(el.tagName)) {
                const r = el.getBoundingClientRect();
                const ph = document.createElement('div');
                ph.setAttribute('style', `width:${r.width}px;height:${r.height}px;display:flex;align-items:center;justify-content:center;background:#e5e7eb;color:#6b7280;font:12px sans-serif;border-radius:6px`);
                ph.textContent = el.tagName === 'IFRAME' ? 'embed' : el.tagName.toLowerCase();
                dst.appendChild(ph);
            } else dst.appendChild(await cloneWithStyles(el));
        }
    }
    return dst;
}

/**
 * Rasterize a rendered card element to PNG and download it.
 * How: deep-clone the card with computed styles inlined → wrap in
 * `<svg><foreignObject>` → draw the SVG onto a canvas (× `scale`) → toBlob.
 * Limitations (by construction of foreignObject rasterization):
 *  - remote images are fetched and inlined as data URLs; CORS-blocked ones become a grey "image" box
 *  - iframes/embeds/videos/canvas (recharts SVG survives; the ResponsiveContainer sizes are frozen) → placeholder box
 *  - ::before/::after (card background overlays) and web fonts that aren't installed locally are not captured
 *  - CSS `background-image: url(remote)` is not inlined (renders empty); data-URL backgrounds work
 */
export async function exportCardPng(cardEl: HTMLElement, opts: { filename?: string; scale?: number; background?: string } = {}): Promise<Blob | null> {
    const rect = cardEl.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(rect.width)), h = Math.max(1, Math.ceil(cardEl.scrollHeight || rect.height));
    const clone = await cloneWithStyles(cardEl);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    clone.style.margin = '0';
    const bg = opts.background ?? getComputedStyle(cardEl).backgroundColor;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
    const scale = opts.scale ?? Math.min(3, Math.max(1, window.devicePixelRatio || 1) * 2);
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('SVG rasterization failed')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (bg && bg !== 'rgba(0, 0, 0, 0)') { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob && opts.filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = opts.filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return blob;
}

/** Top-level rendered cards inside `root` (nested cards are part of their parent's PNG). */
export function renderedCardEls(root: ParentNode = document): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.scribe-idocs__card')).filter((el) => !el.classList.contains('scribe-idocs__card--nested'));
}

/** Sequential per-card PNG downloads (`<name>-01.png`, …). ponytail: no zip lib — sequential downloads with a small gap. */
export async function exportAllCardsPng(doc: IDoc, root: ParentNode = document): Promise<number> {
    const els = renderedCardEls(root);
    const base = safeFilename(doc.title);
    let n = 0;
    for (const el of els) {
        n++;
        try { await exportCardPng(el, { filename: `${base}-${String(n).padStart(2, '0')}.png` }); } catch { /* skip card */ }
        await new Promise((r) => setTimeout(r, 250));
    }
    return n;
}

export interface ExportActionCtx { activeCardEl?: HTMLElement | null; docEl?: HTMLElement | null }
export interface ExportAction { id: string; label: string; hint?: string; run: (doc: IDoc, ctx: ExportActionCtx) => void | Promise<void> }

/** Export menu entries — see the file header. IDocEditor maps these into its Export menu (JSON stays there). */
export const EXPORT_ACTIONS: readonly ExportAction[] = [
    { id: 'html', label: 'HTML (standalone)', run: (doc) => download(`${safeFilename(doc.title)}.html`, 'text/html', exportHtml(doc)) },
    { id: 'markdown', label: 'Markdown', run: (doc) => download(`${safeFilename(doc.title)}.md`, 'text/markdown', exportMarkdown(doc)) },
    { id: 'pdf-styled', label: 'PDF (styled)', hint: 'Opens the print dialog — choose “Save as PDF”', run: (doc) => exportStyledPdf(doc) },
    { id: 'pdf-text', label: 'PDF (text)', run: (doc) => exportPdf(doc) },
    { id: 'print', label: 'Print…', hint: 'Show all cards first, then print', run: () => printDoc() },
    { id: 'png-card', label: 'PNG (this card)', run: async (doc, ctx) => { if (ctx.activeCardEl) await exportCardPng(ctx.activeCardEl, { filename: `${safeFilename(doc.title)}-card.png` }); } },
    { id: 'png-all', label: 'PNG (all cards)', hint: 'One download per card', run: async (doc, ctx) => { await exportAllCardsPng(doc, ctx.docEl ?? document); } },
    // Wave 3A — lazy modules: pptxgenjs / docx stay out of the entry chunk.
    { id: 'pptx', label: 'PowerPoint (.pptx)', hint: 'Editable slides — text, tables, charts, images, notes', run: (doc) => import('./idocPptx').then((m) => m.exportPptx(doc)) },
    { id: 'docx', label: 'Word (.docx)', run: (doc) => import('./idocDocx').then((m) => m.exportDocx(doc)) },
];
