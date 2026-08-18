/**
 * Interactive Docs — standalone HTML / Markdown export builders.
 */
import { describe, it, expect } from 'vitest';
import { exportHtml, exportMarkdown, safeFilename } from '../components/Scribe/idocs/idocExport';
import { createEmptyDoc, type IDoc } from '../components/Scribe/idocs/idocTypes';

function fixture(): IDoc {
    return createEmptyDoc({
        title: 'Export Me',
        description: 'A test doc',
        theme: 'midnight',
        cards: [
            { id: 'c1', title: 'First Card', layout: 'hero', headerImage: 'https://img.example/x.jpg', blocks: [
                { id: 'b1', type: 'heading', level: 2, text: 'Hello <world>' },
                { id: 'b2', type: 'text', md: 'Some **bold** text' },
                { id: 'b3', type: 'accordion', items: [{ title: 'FAQ 1', md: 'Answer 1' }] },
                { id: 'b4', type: 'embed', url: 'https://www.youtube.com/watch?v=abc' },
                { id: 'b5', type: 'chart', kind: 'bar', title: 'Sales', data: [{ label: 'Q1', value: 3 }, { label: 'Q2', value: 5 }] },
                { id: 'b6', type: 'quiz', question: 'Q?', options: ['A', 'B'], answerIndex: 1, explanation: 'Because' },
            ] },
            { id: 'c2', title: 'Second Card', layout: 'default', blocks: [
                { id: 'b7', type: 'chart', kind: 'pie', data: [{ label: 'x', value: 1 }, { label: 'y', value: 1 }] },
                { id: 'b8', type: 'chart', kind: 'line', data: [{ label: 'x', value: 1 }] },
                { id: 'b9', type: 'tabs', items: [{ title: 'Tab A', md: 'a' }, { title: 'Tab B', md: 'b' }] },
                { id: 'b10', type: 'button', label: 'Go', href: 'javascript:alert(1)', variant: 'primary' },
                { id: 'b11', type: 'toc' },
                { id: 'b12', type: 'timeline', items: [{ date: '2024', title: 'Start', md: 'go' }] },
            ] },
        ],
    });
}

describe('exportHtml', () => {
    const html = exportHtml(fixture());
    it('is a full standalone document with NO scripts', () => {
        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).not.toMatch(/<script/i);
        expect(html).toContain('<title>Export Me</title>');
    });
    it('inlines theme vars on :root', () => {
        expect(html).toContain('--idoc-bg:#0b1020');
        expect(html).toContain('--idoc-accent:#7aa2ff');
    });
    it('renders accordion as <details>, embed as sandboxed iframe, charts as svg/table', () => {
        expect(html).toContain('<details><summary>FAQ 1</summary>');
        expect(html).toMatch(/<iframe src="https:\/\/www\.youtube\.com\/embed\/abc"[^>]*sandbox="allow-scripts allow-same-origin allow-popups allow-forms"/);
        expect(html).toContain('aria-label="Bar chart"');
        expect(html).toContain('aria-label="Pie chart"');
        expect(html).toContain('<table class="idoc-table"><thead><tr><th>Label</th><th>Value</th>'); // line → table
    });
    it('escapes text, drops unsafe button hrefs, degrades tabs + quiz without JS', () => {
        expect(html).toContain('Hello &lt;world&gt;');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('<h4>Tab A</h4>');
        expect(html).toContain('<summary>Show answer</summary>');
        expect(html).toContain('Answer: <strong>B</strong> — Because');
        expect(html).toContain('href="#card-c2"'); // toc
    });
    it('falls back to paper theme for `inherit`', () => {
        const h = exportHtml(createEmptyDoc({ theme: 'inherit' }));
        expect(h).toContain('--idoc-bg:#f6f1e7');
        expect(h).not.toContain('var(--bg-surface)');
    });
});

describe('exportMarkdown', () => {
    const md = exportMarkdown(fixture());
    it('lists all card titles as ## headings', () => {
        expect(md).toContain('# Export Me');
        expect(md).toContain('## First Card');
        expect(md).toContain('## Second Card');
    });
    it('renders blocks as markdown', () => {
        expect(md).toContain('### Hello <world>');
        expect(md).toContain('| Q1 | 3 |');
        expect(md).toContain('[Embedded content](https://www.youtube.com/watch?v=abc)');
        expect(md).toContain('- **2024** — Start');
        expect(md).toContain('1. First Card\n2. Second Card'); // toc
    });
});

describe('safeFilename', () => {
    it('slugs', () => {
        expect(safeFilename('My Doc: v2 / final!')).toBe('my-doc-v2-final');
        expect(safeFilename('   ')).toBe('interactive-doc');
    });
});
