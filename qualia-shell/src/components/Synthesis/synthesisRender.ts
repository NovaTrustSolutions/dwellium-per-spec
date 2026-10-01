/**
 * synthesisRender — answer Markdown → safe HTML with clickable `[n]` citations
 * (plan 070 phase 3). Pure except for DOM parsing; unit-testable in jsdom.
 *
 * Pipeline: `renderSafeMarkdown` (escape → markdown → DOMPurify) FIRST, then
 * walk the sanitized DOM's text nodes (skipping <pre>, <code>, <a>, <button>)
 * and replace in-range `[n]` tokens with citation buttons built via DOM APIs
 * (createElement / textContent / setAttribute) — never string concatenation,
 * so a source title can't inject markup. Out-of-range `[n]` stays text.
 *
 * Citation button shape (the widget uses ONE delegated click listener):
 *   <button type="button" class="syn-cite" data-cite="n"
 *           aria-label="Open source n: <title|(untitled)>" title="<title>">[n]</button>
 *   + `disabled` and title "No widget opens this source" when sourceWidget(kind) is null.
 */
import { renderSafeMarkdown } from '../../utils/safeMarkdown';
import { sourceWidget } from './synthesisContext';

export interface CiteSource { sourceKind: string; title: string }

const SKIP_ANCESTOR_TAGS = new Set(['PRE', 'CODE', 'A', 'BUTTON']);

function hasSkippedAncestor(node: Node, root: Node): boolean {
    let el = node.parentElement;
    while (el && el !== root) {
        if (SKIP_ANCESTOR_TAGS.has(el.tagName)) return true;
        el = el.parentElement;
    }
    return false;
}

function makeCiteButton(n: number, label: string, src: CiteSource): HTMLButtonElement {
    const widget = sourceWidget(src.sourceKind);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'syn-cite';
    btn.setAttribute('data-cite', String(n));
    const title = src.title || '(untitled)';
    btn.setAttribute('aria-label', `Open source ${n}: ${title}`);
    btn.setAttribute('title', widget ? title : 'No widget opens this source');
    if (!widget) btn.disabled = true;
    btn.textContent = label;
    return btn;
}

/** CONTRACT (plan 070 phase 3 P0) — implemented by the W1 render agent. */
export function renderAnswerHtml(markdown: string, sources: CiteSource[]): string {
    const html = renderSafeMarkdown(markdown);
    if (sources.length === 0 || typeof document === 'undefined') return html;

    const template = document.createElement('template');
    template.innerHTML = html;

    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
        if (!hasSkippedAncestor(node, template.content)) textNodes.push(node as Text);
    }

    const CITE_RE = /\[([1-9]\d*)\]/g;
    for (const textNode of textNodes) {
        const text = textNode.textContent ?? '';
        CITE_RE.lastIndex = 0;
        if (!CITE_RE.test(text)) continue;
        CITE_RE.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = CITE_RE.exec(text))) {
            const n = parseInt(match[1], 10);
            if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            if (n >= 1 && n <= sources.length) {
                frag.appendChild(makeCiteButton(n, match[0], sources[n - 1]));
            } else {
                frag.appendChild(document.createTextNode(match[0]));
            }
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));

        textNode.replaceWith(frag);
    }

    return template.innerHTML;
}
