/**
 * safeMarkdown — Centralized XSS-safe markdown/HTML renderer.
 *
 * All `dangerouslySetInnerHTML` usages MUST go through this utility.
 * Uses DOMPurify to strip all script injection vectors.
 *
 * @see Fix #024 in docs/code.md
 */

import DOMPurify from 'dompurify';
import { splitFences, eachCodeSpan, OPEN, CLOSE, TOKEN, type MdBlock } from '../lib/markdownText';

// Configure DOMPurify: allow safe HTML elements, strip everything dangerous
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'b', 'i', 'em', 'strong', 'u', 's', 'strike', 'del',
    'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'span', 'div',
    'pre', 'code', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'details', 'summary',
    'sup', 'sub', 'mark',
    'button',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'title', 'alt', 'src',
    'class', 'className', 'id',
    'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width',
    'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'points', 'stroke-linecap', 'stroke-linejoin',
    // Inert data attribute used by the code-block copy button (handled by a
    // single delegated click listener registered in main.tsx — no inline JS).
    'data-copy',
    'colspan', 'rowspan',
    'open',
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
};

/**
 * Sanitize raw HTML to prevent XSS.
 * Call this BEFORE passing to dangerouslySetInnerHTML.
 */
export function sanitizeHtml(dirtyHtml: string): string {
  return DOMPurify.sanitize(dirtyHtml, PURIFY_CONFIG);
}

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Lightweight markdown → HTML converter with XSS protection.
 * For widgets that don't use react-markdown (Stella, Hydra, Antigravity, Knowledge Graph, Scribe export).
 * Fences and code spans come from the shared scanner (lib/markdownText.ts) — the same rules as ARA and
 * as speech, so a code block is shown exactly where speech says "code block" — and code is never run
 * through the markdown passes below.
 *
 * ALWAYS sanitized — safe for dangerouslySetInnerHTML.
 */
export function renderSafeMarkdown(text: string): string {
  const html = splitFences(text)
    .map(b => (b.kind === 'code' ? codeBlockHtml(b) : textHtml(b.lines.join('\n'))))
    .join('');
  // SANITIZE: final security gate
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

/** encodeURIComponent throws on a lone surrogate (an emoji cut in half), so replace those with U+FFFD. */
const wellFormed = (t: string) =>
  Array.from(t, ch => (ch.length === 1 && (ch.charCodeAt(0) & 0xf800) === 0xd800 ? String.fromCharCode(0xfffd) : ch)).join('');

/** Fenced code block with language label + copy button (the payload is the raw code; see main.tsx).
 *  Blank lines just inside the fence are dropped — a copied command ending in a newline runs on paste. */
function codeBlockHtml(b: MdBlock): string {
  const blank = (l: string) => /^[ \t]*$/.test(l);
  let from = 0, to = b.lines.length; // trim on the line array: a regex for this is quadratic on long blank runs
  while (from < to && blank(b.lines[from])) from++;
  while (to > from && blank(b.lines[to - 1])) to--;
  const code = wellFormed(b.lines.slice(from, to).join('\n'));
  const lang = b.info?.split(/\s+/)[0];
  const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
  return `<div class="code-block">${langLabel}<button class="code-copy-btn" type="button" data-copy="${encodeURIComponent(code)}">Copy</button><pre><code>${escapeHtml(code)}</code></pre></div>`;
}

function textHtml(text: string): string {
  // Escape raw HTML in the source text first; inline code (per line) is swapped for placeholders so nothing inside is formatted
  const spans: string[] = [];
  let html = eachCodeSpan(escapeHtml(text), c => `${OPEN}${spans.push(`<code class="inline-code">${c}</code>`) - 1}${CLOSE}`);

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^## (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>');

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (line) => {
    const cells = line.split('|').filter(c => c.trim());
    if (cells.every(c => /^[\s-:]+$/.test(c))) return '';
    const cellHtml = cells.map(c => `<td>${c.trim()}</td>`).join('');
    return `<tr>${cellHtml}</tr>`;
  });
  html = html.replace(/(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g, '<table>$1</table>');

  // Bullet lists
  html = html.replace(/^[-•]\s(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>(\s*<li>[\s\S]*?<\/li>)*)/g, '<ul>$1</ul>');

  // Numbered lists
  html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');

  // Newlines → <br/>
  html = html.replace(/\n/g, '<br/>');

  // Clean up excessive <br/> around block elements
  html = html.replace(/<br\/>(<\/?(?:h[2-5]|ul|li|table|tr|div|pre))/g, '$1');
  html = html.replace(/(<\/(?:h[2-5]|ul|li|table|tr|div|pre)>)<br\/>/g, '$1');

  return html.replace(TOKEN, (m, i: string) => spans[Number(i)] ?? m);
}

/**
 * Sanitize SVG content (for CivilEngineering, DesignStudio).
 * More permissive for SVG — uses DOMPurify SVG profile.
 */
export function sanitizeSvg(dirtySvg: string): string {
  return DOMPurify.sanitize(dirtySvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: false,
  });
}
