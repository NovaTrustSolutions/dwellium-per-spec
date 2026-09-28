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
export interface CiteSource { sourceKind: string; title: string }

/** CONTRACT (plan 070 phase 3 P0) — implemented by the W1 render agent. */
export function renderAnswerHtml(markdown: string, sources: CiteSource[]): string {
    void markdown; void sources;
    throw new Error('plan 070 P3 W1: not implemented');
}
