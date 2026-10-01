import { describe, it, expect } from 'vitest';
import { renderAnswerHtml, type CiteSource } from '../components/Synthesis/synthesisRender';
import { renderSafeMarkdown } from '../utils/safeMarkdown';

const src = (sourceKind: string, title: string): CiteSource => ({ sourceKind, title });

describe('renderAnswerHtml', () => {
    it('renders markdown (bold, list) via renderSafeMarkdown', () => {
        const html = renderAnswerHtml('**bold** text\n- item one', [src('synthesis', 'A')]);
        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('<li>item one</li>');
    });

    it('turns an in-range [1] into a citation button', () => {
        const html = renderAnswerHtml('See [1] for details.', [src('synthesis', 'My Title')]);
        expect(html).toContain('data-cite="1"');
        expect(html).toContain('class="syn-cite"');
        expect(html).toContain('aria-label="Open source 1: My Title"');
        expect(html).not.toContain('disabled');
    });

    it('leaves out-of-range [3] as plain text with only 2 sources', () => {
        const html = renderAnswerHtml('[3] is out of range', [src('synthesis', 'A'), src('scribe', 'B')]);
        expect(html).not.toContain('data-cite');
        expect(html).toContain('[3]');
    });

    it('leaves [0] and [01] as plain text', () => {
        const html = renderAnswerHtml('[0] and [01] should not cite', [src('synthesis', 'A')]);
        expect(html).not.toContain('data-cite');
        expect(html).toContain('[0]');
        expect(html).toContain('[01]');
    });

    it('does not cite inside inline code or fenced code', () => {
        const md = 'inline `[1]` code\n\n```\n[1] fenced\n```';
        const html = renderAnswerHtml(md, [src('synthesis', 'A')]);
        expect(html).not.toContain('data-cite');
    });


    it('turns adjacent [1][2] into two separate buttons', () => {
        const html = renderAnswerHtml('[1][2]', [src('synthesis', 'A'), src('scribe', 'B')]);
        expect((html.match(/data-cite="1"/g) ?? []).length).toBe(1);
        expect((html.match(/data-cite="2"/g) ?? []).length).toBe(1);
    });

    it('never lets a malicious source title inject markup — only appears as attribute text', () => {
        const evilImg = '<img src=x onerror=alert(1)>';
        const html = renderAnswerHtml('cite [1]', [src('synthesis', evilImg)]);
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
        expect(doc.querySelector('img')).toBeNull();
        expect(doc.querySelector('script')).toBeNull();
        expect(doc.querySelector('button')?.getAttribute('aria-label')).toBe(`Open source 1: ${evilImg}`);

        const evilQuote = '"><script>alert(1)</script>';
        const html2 = renderAnswerHtml('cite [1]', [src('synthesis', evilQuote)]);
        const doc2 = new DOMParser().parseFromString(`<div>${html2}</div>`, 'text/html');
        expect(doc2.querySelector('script')).toBeNull();
    });

    it('escapes a <script> tag embedded in the markdown answer text', () => {
        const html = renderAnswerHtml('<script>alert(1)</script> [1]', [src('synthesis', 'A')]);
        expect(html).not.toMatch(/<script/i);
    });

    it('disables the button and sets the no-widget tooltip for a kind with no widget', () => {
        const html = renderAnswerHtml('see [1]', [src('upload', 'Some Upload')]);
        expect(html).toContain('disabled');
        expect(html).toContain('title="No widget opens this source"');
    });

    it('returns renderSafeMarkdown output unchanged when there are no sources', () => {
        const md = '**bold** [1] text';
        expect(renderAnswerHtml(md, [])).toBe(renderSafeMarkdown(md));
    });
});
