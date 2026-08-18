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

function wave1(): IDoc {
    return createEmptyDoc({
        title: 'W1',
        theme: 'graphite',
        pageSize: 'a4',
        language: 'de',
        dir: 'rtl',
        chrome: { header: 'Head', footer: 'Foot', logo: 'https://img.example/logo.png', sectionNumbers: true, hideOnFirst: true },
        cards: [
            { id: 'c1', title: 'One', layout: 'background', headerImage: 'https://img.example/bg.jpg', background: { overlay: 'frosted', intensity: 30, align: 'bottom' }, blocks: [
                { id: 'b1', type: 'text', md: 'Note here[^1] and[^2]' },
                { id: 'b2', type: 'button', label: 'Jump', href: '#card:c2', variant: 'secondary' },
                { id: 'b3', type: 'toc' },
            ], footnotes: [{ id: 'f1', text: 'first' }, { id: 'f2', text: 'second' }] },
            { id: 'c2', title: 'Two', layout: 'image-top', headerImage: 'https://img.example/top.jpg', background: { color: '#abcdef' }, blocks: [
                { id: 'b4', type: 'steps', items: [{ title: 'S1', md: 'go' }] },
                { id: 'b5', type: 'funnel', items: [{ label: 'Top', value: 10 }, { label: 'Bottom', value: 5 }] },
                { id: 'b6', type: 'boxes', columns: 4, items: [{ title: 'Box', md: 'x', emphasis: true }] },
                { id: 'b7', type: 'math', latex: 'a^2', inline: true },
                { id: 'b8', type: 'diagram', mermaid: 'graph TD; A-->B' },
                { id: 'b9', type: 'qr', url: 'https://example.com/x', caption: 'cap' },
                { id: 'b10', type: 'chart', kind: 'donut', data: [{ label: 'a', value: 1 }, { label: 'b', value: 3 }] },
                { id: 'b11', type: 'chart', kind: 'area', data: [{ label: 'a', value: 1 }, { label: 'b', value: 3 }] },
            ], children: [
                { id: 'c2a', title: 'Nested A', layout: 'default', blocks: [{ id: 'b12', type: 'text', md: 'inner text' }], children: [
                    { id: 'c2aa', title: 'Deeper', layout: 'default', blocks: [{ id: 'b13', type: 'text', md: 'deepest' }] },
                ] },
            ] },
        ],
    });
}

describe('exportHtml — wave 1', () => {
    const html = exportHtml(wave1());
    it('still has no scripts; carries lang/dir, page-size aspect var and @page size', () => {
        expect(html).not.toMatch(/<script/i);
        expect(html).toContain('<html lang="de" dir="rtl">');
        expect(html).toContain('--idoc-aspect:210 / 297');
        expect(html).toContain('@media print{@page{size:A4}}');
    });
    it('mirrors backgrounds + layouts via inline style vars and classes', () => {
        expect(html).toMatch(/<section id="card-c1" class="idoc-card idoc-card--background idoc-card--has-image idoc-card--overlay-frosted" style="--idoc-card-image:url\(&quot;https:\/\/img\.example\/bg\.jpg&quot;\);--idoc-card-image-pos:bottom;--idoc-overlay:0\.3"/);
        expect(html).toMatch(/<section id="card-c2" class="idoc-card idoc-card--image-top idoc-card--has-color" style="--idoc-card-bg:#abcdef"/);
        expect(html).toContain('<img class="idoc-card-media" src="https://img.example/top.jpg"');
    });
    it('renders chrome (hidden on first card), nested cards as <details>, footnotes + refs, toc with children', () => {
        const c1 = html.slice(html.indexOf('id="card-c1"'), html.indexOf('id="card-c2"'));
        const c2 = html.slice(html.indexOf('id="card-c2"'));
        expect(c1).not.toContain('idoc-chrome');
        expect(c2).toContain('<div class="idoc-chrome idoc-chrome--top"><span>Head</span><img class="idoc-chrome-logo" src="https://img.example/logo.png" alt=""/></div>');
        expect(c2).toContain('<span>Foot</span><span class="idoc-chrome-num">2 / 2</span>');
        expect(c2).toContain('<details class="idoc-subcard" open><summary>Nested A</summary><section id="card-c2a" class="idoc-card idoc-card--default idoc-card--nested">');
        expect(c2).toContain('<summary>Deeper</summary>');
        expect(c2).toContain('deepest');
        expect(c1).toContain('<sup class="idoc-fnref"><a href="#fn-c1-1">1</a></sup>');
        expect(c1).toContain('<ol class="idoc-footnotes"><li id="fn-c1-1">');
        expect(c1).toContain('second');
        expect(c1).toContain('<li><a href="#card-c2">Two</a><ol><li><a href="#card-c2a">Nested A</a><ol><li><a href="#card-c2aa">Deeper</a></li></ol></li></ol></li>');
    });
    it('exports the new blocks + donut/area + card-link anchors + local QR svg', () => {
        expect(html).toContain('<a class="idoc-btn idoc-btn--secondary" href="#card-c2">Jump</a>');
        expect(html).toContain('<ol class="idoc-steps"><li><span class="idoc-step-marker">1</span>');
        expect(html).toContain('<div class="idoc-funnel__row" style="width:50%"><span>Bottom</span><em>5</em></div>');
        expect(html).toContain('<div class="idoc-boxes" style="grid-template-columns:repeat(4,1fr)"><div class="idoc-box idoc-box--emphasis">');
        expect(html).toContain('<code class="idoc-math">a^2</code>');
        expect(html).toContain('<pre class="idoc-diagram mermaid">graph TD; A--&gt;B</pre>');
        expect(html).toContain('<figure class="idoc-qr"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33"');
        expect(html).not.toContain('api.qrserver.com');
        expect(html).toContain('aria-label="Donut chart"');
        expect(html).toContain('aria-label="Area chart"');
    });
});

describe('exportMarkdown — wave 1', () => {
    const md = exportMarkdown(wave1());
    it('nests children as deeper headings, emits footnote definitions and card-link anchors', () => {
        expect(md).toContain('## Two');
        expect(md).toContain('### Nested A');
        expect(md).toContain('#### Deeper');
        expect(md).toContain('[^1]: first\n[^2]: second');
        expect(md).toContain('[Jump](#card-c2)');
        expect(md).toContain('1. One\n2. Two\n   1. Nested A\n      1. Deeper');
    });
});

describe('safeFilename', () => {
    it('slugs', () => {
        expect(safeFilename('My Doc: v2 / final!')).toBe('my-doc-v2-final');
        expect(safeFilename('   ')).toBe('interactive-doc');
    });
});
