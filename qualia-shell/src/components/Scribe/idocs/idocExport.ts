/**
 * idocExport — standalone HTML / Markdown / PDF / print / JSON exports for an
 * IDoc. Pure string builders (unit-testable) + tiny DOM download helpers.
 *
 * exportHtml emits ZERO <script> tags: accordions are <details>, tabs degrade
 * to stacked sections, quiz answers hide behind <details>, bar/pie charts are
 * inline SVG, line charts fall back to a table, embeds are sandboxed iframes.
 */
import { markdownToPdfBytes, downloadPdf } from '../pdfExport';
import { renderSafeMarkdown } from '../../../utils/safeMarkdown';
import { embedSrcFor } from './idocsAi';
import { themeById, type Block, type Card, type IDoc } from './idocTypes';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (s: string): string => renderSafeMarkdown(s || '');
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

function svgPie(data: { label: string; value: number }[]): string {
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
    return `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 200 200" role="img" aria-label="Pie chart" style="width:200px;height:200px">${slices}</svg><ul style="list-style:none;padding:0;margin:0;font-size:13px">${legend}</ul></div>`;
}

function dataTable(data: { label: string; value: number }[]): string {
    return `<table class="idoc-table"><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody>${data.map((d) => `<tr><td>${esc(d.label)}</td><td>${d.value}</td></tr>`).join('')}</tbody></table>`;
}

export function blockToHtml(b: Block, doc: IDoc): string {
    switch (b.type) {
        case 'heading': return `<h${b.level}>${esc(b.text)}</h${b.level}>`;
        case 'text': return `<div class="idoc-md">${md(b.md)}</div>`;
        case 'callout': return `<div class="idoc-callout idoc-callout--${b.tone}">${md(b.md)}</div>`;
        case 'quote': return `<blockquote class="idoc-quote">${md(b.md)}${b.cite ? `<cite>— ${esc(b.cite)}</cite>` : ''}</blockquote>`;
        case 'image': return safeUrl(b.src) ? `<figure class="idoc-figure"><img src="${safeUrl(b.src)}" alt="${esc(b.alt || '')}"/>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>` : '';
        case 'gallery': return `<div class="idoc-gallery">${b.images.filter((i) => safeUrl(i.src)).map((i) => `<img src="${safeUrl(i.src)}" alt="${esc(i.alt || '')}"/>`).join('')}</div>`;
        case 'embed': {
            const info = embedSrcFor(b.url);
            if (!info) return '';
            return `<div class="idoc-embed idoc-embed--${info.aspect.replace(':', 'x')}"><iframe src="${esc(info.src)}" title="${esc(info.provider)} embed" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe></div>`;
        }
        case 'chart': {
            const body = b.kind === 'bar' ? svgBars(b.data) : b.kind === 'pie' ? svgPie(b.data) : dataTable(b.data);
            return `<figure class="idoc-chart">${b.title ? `<figcaption>${esc(b.title)}</figcaption>` : ''}${body}</figure>`;
        }
        case 'table': return `<table class="idoc-table">${b.headers.length ? `<thead><tr>${b.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        case 'accordion': return `<div class="idoc-accordion">${b.items.map((it) => `<details><summary>${esc(it.title)}</summary><div class="idoc-md">${md(it.md)}</div></details>`).join('')}</div>`;
        case 'tabs': return `<div class="idoc-tabs">${b.items.map((it) => `<section class="idoc-tab"><h4>${esc(it.title)}</h4><div class="idoc-md">${md(it.md)}</div></section>`).join('')}</div>`;
        case 'columns': return `<div class="idoc-columns" style="grid-template-columns:repeat(${b.columns.length},1fr)">${b.columns.map((c) => `<div class="idoc-md">${md(c)}</div>`).join('')}</div>`;
        case 'button': return safeUrl(b.href) ? `<p><a class="idoc-btn idoc-btn--${b.variant}" href="${safeUrl(b.href)}" target="_blank" rel="noopener noreferrer">${esc(b.label)}</a></p>` : '';
        case 'code': return `<pre class="idoc-code"><code>${esc(b.code)}</code></pre>`;
        case 'divider': return '<hr/>';
        case 'timeline': return `<ol class="idoc-timeline">${b.items.map((it) => `<li><span class="idoc-tl-date">${esc(it.date)}</span><div><strong>${esc(it.title)}</strong><div class="idoc-md">${md(it.md)}</div></div></li>`).join('')}</ol>`;
        case 'quiz': return `<div class="idoc-quiz"><p><strong>${esc(b.question)}</strong></p><ol type="A">${b.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol><details><summary>Show answer</summary><p>Answer: <strong>${esc(b.options[b.answerIndex] ?? '')}</strong>${b.explanation ? ` — ${esc(b.explanation)}` : ''}</p></details></div>`;
        case 'toc': return `<nav class="idoc-toc"><ol>${doc.cards.map((c, i) => `<li><a href="#card-${esc(c.id)}">${esc(c.title || `Card ${i + 1}`)}</a></li>`).join('')}</ol></nav>`;
    }
}

function cardToHtml(c: Card, doc: IDoc): string {
    const media = c.headerImage && safeUrl(c.headerImage) ? `<img class="idoc-card-media" src="${safeUrl(c.headerImage)}" alt=""/>` : '';
    const body = `<div class="idoc-card-body">${c.title ? `<h2 class="idoc-card-title">${esc(c.title)}</h2>` : ''}${c.blocks.map((b) => blockToHtml(b, doc)).join('\n')}</div>`;
    return `<section id="card-${esc(c.id)}" class="idoc-card idoc-card--${c.layout}">${c.layout === 'split-right' ? body + media : media + body}</section>`;
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
@media print{body{background:#fff}.idoc-card{page-break-after:always;break-after:page;box-shadow:none}.idoc-embed{display:none}}
`;

/** Standalone HTML document — no scripts, inline CSS, theme vars on :root. */
export function exportHtml(doc: IDoc): string {
    const theme = themeById(doc.theme);
    // `inherit` references app tokens that don't exist outside the app — fall back to paper for the export.
    const vars = theme.id === 'inherit' ? themeById('paper').vars : theme.vars;
    const rootVars = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(doc.title)}</title>
<style>:root{${rootVars}}${EXPORT_CSS}</style>
</head>
<body>
<main class="idoc-wrap">
<h1 class="idoc-title">${esc(doc.title)}</h1>
${doc.description ? `<p class="idoc-desc">${esc(doc.description)}</p>` : ''}
${doc.cards.map((c) => cardToHtml(c, doc)).join('\n')}
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
        case 'button': return `[${b.label}](${b.href})`;
        case 'code': return `\`\`\`${b.lang}\n${b.code}\n\`\`\``;
        case 'divider': return '---';
        case 'timeline': return b.items.map((it) => `- **${it.date}** — ${it.title}${it.md ? `\n  ${it.md.replace(/\n/g, '\n  ')}` : ''}`).join('\n');
        case 'quiz': return `**${b.question}**\n\n${b.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n<details><summary>Answer</summary>${b.options[b.answerIndex] ?? ''}${b.explanation ? ` — ${b.explanation}` : ''}</details>`;
        case 'toc': return doc.cards.map((c, i) => `${i + 1}. ${c.title || `Card ${i + 1}`}`).join('\n');
    }
}

export function exportMarkdown(doc: IDoc): string {
    const parts = [`# ${doc.title}`];
    if (doc.description) parts.push(doc.description);
    for (const c of doc.cards) {
        parts.push(`\n## ${c.title || 'Card'}`);
        if (c.headerImage) parts.push(`![](${c.headerImage})`);
        for (const b of c.blocks) { const s = blockToMd(b, doc); if (s) parts.push(s); }
    }
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
