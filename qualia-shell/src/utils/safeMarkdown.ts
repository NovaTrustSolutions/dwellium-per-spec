/**
 * safeMarkdown — Centralized XSS-safe markdown/HTML renderer.
 *
 * All `dangerouslySetInnerHTML` usages MUST go through this utility.
 * Uses DOMPurify to strip all script injection vectors.
 *
 * @see Fix #024 in docs/code.md
 */

import DOMPurify from 'dompurify';

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

/**
 * Lightweight markdown → HTML converter with XSS protection.
 * For widgets that don't use react-markdown (ARA, Stella, Hydra, Astra).
 *
 * ALWAYS sanitized — safe for dangerouslySetInnerHTML.
 */
export function renderSafeMarkdown(text: string): string {
  // Escape raw HTML in the source text first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced code blocks with language + copy support
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    return `<div class="code-block">${langLabel}<button class="code-copy-btn" type="button" data-copy="${encodeURIComponent(code.trim())}">Copy</button><pre><code>${code.trim()}</code></pre></div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

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

  // SANITIZE: final security gate
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
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
