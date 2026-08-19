/**
 * Interactive Docs — Wave 3A PPTX spec builder (pure; pptxgenjs writer is not exercised under jsdom).
 */
import { describe, it, expect } from 'vitest';
import { buildPptxSpec, hex6, layoutFor, mdToParas, pptxTheme, type PptxElement } from '../components/Scribe/idocs/idocPptx';
import { BLOCK_TYPES, createEmptyDoc, defaultBlock, type Block, type IDoc } from '../components/Scribe/idocs/idocTypes';

const allBlocks = (): Block[] => BLOCK_TYPES.map((t) => {
    const b = defaultBlock(t);
    // defaults for media/link blocks are empty → give them content so they emit
    if (b.type === 'image') return { ...b, src: 'https://img.example/a.png', alt: 'A', caption: 'cap' };
    if (b.type === 'gallery') return { ...b, images: [{ src: 'https://img.example/1.png' }, { src: 'https://img.example/2.png' }] };
    if (b.type === 'embed') return { ...b, url: 'https://www.youtube.com/watch?v=abc' };
    if (b.type === 'button') return { ...b, href: 'https://example.com' };
    if (b.type === 'qr') return { ...b, url: 'https://example.com/qr' };
    return b;
});

function fixture(partial: Partial<IDoc> = {}): IDoc {
    return createEmptyDoc({
        title: 'Deck <Test>',
        theme: 'midnight',
        cards: [
            { id: 'c1', title: 'Intro', layout: 'hero', headerImage: 'https://img.example/h.jpg', notes: 'Say hello', blocks: [
                { id: 'b1', type: 'text', md: 'Plain **bold** and *it* with [link](https://x.y)\n\n- one\n- two\n1. first' },
                { id: 'b2', type: 'chart', kind: 'donut', title: 'Share', data: [{ label: 'A', value: 1 }, { label: 'B', value: 3 }] },
            ], children: [{ id: 'c1a', title: 'Nested', layout: 'default', blocks: [{ id: 'b3', type: 'text', md: 'child' }], notes: 'nested notes' }] },
            { id: 'c2', title: 'All blocks', layout: 'default', blocks: allBlocks(), footnotes: [{ id: 'f1', text: 'a footnote' }] },
        ],
        ...partial,
    });
}

describe('buildPptxSpec', () => {
    const spec = buildPptxSpec(fixture());
    it('maps every card (nested included) to slides, in order, with notes', () => {
        const titles = spec.slides.map((s) => s.title?.replace(/ \(cont\.\)$/, ''));
        // Intro (header image + text + chart overflows 16:9 → "(cont.)"), then its nested child, then All blocks.
        expect(titles[0]).toBe('Intro');
        const nested = titles.indexOf('Nested');
        expect(nested).toBeGreaterThan(0);
        expect(titles.slice(0, nested).every((t) => t === 'Intro')).toBe(true);
        expect(titles.slice(nested + 1).every((t) => t === 'All blocks')).toBe(true);
        expect(spec.slides[0].notes).toBe('Say hello');
        expect(spec.slides[nested].notes).toBe('nested notes');
        expect(spec.fileName).toBe('deck-test.pptx');
    });
    it('every block type produces at least one element', () => {
        const doc = fixture();
        for (const b of allBlocks()) {
            const one = buildPptxSpec({ ...doc, cards: [{ id: 'x', layout: 'default', blocks: [b] }] });
            const els = one.slides.flatMap((s) => s.elements);
            expect(els.length, `block ${b.type} emitted nothing`).toBeGreaterThan(0);
        }
    });
    it('maps block kinds to the right element kinds', () => {
        const kinds = (t: Block['type']): PptxElement['kind'][] => {
            const b = allBlocks().find((x) => x.type === t)!;
            return buildPptxSpec({ ...fixture(), cards: [{ id: 'x', layout: 'default', blocks: [b] }] }).slides[0].elements.map((e) => e.kind);
        };
        expect(kinds('table')).toEqual(['table']);
        expect(kinds('chart')).toEqual(['chart']);
        expect(kinds('image')).toEqual(['image', 'text']);
        expect(kinds('gallery')).toEqual(['image', 'image']);
        expect(kinds('callout')).toEqual(['shape']);
        expect(kinds('button')).toEqual(['link']);
        expect(kinds('embed')).toEqual(['link']);
        expect(kinds('boxes').every((k) => k === 'shape')).toBe(true);
        expect(kinds('columns')).toEqual(['text', 'text']);
        expect(kinds('toc')).toEqual(['bullets']);
        expect(kinds('qr')).toEqual(['image', 'link']);
        expect(kinds('steps')).toEqual(['shape', 'text', 'shape', 'text', 'shape', 'text']);
    });
    it('markdown → runs: bold / italic / link / bullets, quiz flattened to Q/Answer', () => {
        const paras = mdToParas('Plain **bold** and *it* with [link](https://x.y)\n\n- one\n1. first');
        expect(paras[0].runs).toEqual([{ text: 'Plain ' }, { text: 'bold', bold: true }, { text: ' and ' }, { text: 'it', italic: true }, { text: ' with ' }, { text: 'link', href: 'https://x.y' }]);
        expect(paras[1]).toMatchObject({ bullet: 'dot', runs: [{ text: 'one' }] });
        expect(paras[2]).toMatchObject({ bullet: 'num', runs: [{ text: 'first' }] });
        const quiz = spec.slides.flatMap((s) => s.elements).find((e) => e.kind === 'text' && JSON.stringify(e.paras).includes('Q: Question?'));
        expect(quiz && quiz.kind === 'text' ? JSON.stringify(quiz.paras) : '').toContain('Answer: Option A');
    });
    it('applies theme colours (hex, no #) and header image / chart data / footnotes', () => {
        expect(spec.theme.bg).toBe('0B1020');
        expect(spec.theme.accent).toBe('7AA2FF');
        expect(spec.slides[0].background).toBe('0B1020');
        const first = spec.slides[0].elements;
        expect(first.some((e) => e.kind === 'image' && e.src === 'https://img.example/h.jpg')).toBe(true);
        const chart = spec.slides.filter((s) => s.title?.startsWith('Intro')).flatMap((s) => s.elements).find((e) => e.kind === 'chart');
        expect(chart).toMatchObject({ chartKind: 'donut', labels: ['A', 'B'], values: [1, 3], title: 'Share' });
        expect(JSON.stringify(spec.slides[spec.slides.length - 1].elements)).toContain('a footnote');
    });
    it('geometry stays inside the slide and layout follows pageSize', () => {
        for (const s of spec.slides) for (const e of s.elements) { expect(e.x).toBeGreaterThanOrEqual(0); expect(e.y).toBeGreaterThanOrEqual(0); expect(e.x + e.w).toBeLessThanOrEqual(spec.width + 0.01); }
        expect(spec.layout).toBe('16x9');
        expect(buildPptxSpec(fixture({ pageSize: 'a4' }))).toMatchObject({ layout: 'A4', width: 8.27, height: 11.69 });
        expect(buildPptxSpec(fixture({ pageSize: '4:3' })).layout).toBe('4x3');
        expect(layoutFor('letter')).toBe('LETTER');
        expect(layoutFor(undefined)).toBe('16x9');
    });
    it('overflowing cards continue on "(cont.)" slides', () => {
        const long = { id: 'l', type: 'text' as const, md: Array.from({ length: 60 }, (_, i) => `- bullet ${i} with a bit of text`).join('\n') };
        const s = buildPptxSpec(fixture({ cards: [{ id: 'c', title: 'Long', layout: 'default', blocks: [long, long, long] }] }));
        expect(s.slides.length).toBeGreaterThan(1);
        expect(s.slides[1].title).toBe('Long (cont.)');
        expect(s.slides[1].notes).toBeUndefined();
    });
    it('chrome header/footer/section numbers land on top-level slides (not the first when hideOnFirst)', () => {
        const s = buildPptxSpec(fixture({ chrome: { header: 'ACME', footer: 'Confidential', sectionNumbers: true, hideOnFirst: true } }));
        const txt = (i: number) => JSON.stringify(s.slides[i].elements);
        const nested = s.slides.findIndex((x) => x.title === 'Nested'), all = s.slides.findIndex((x) => x.title === 'All blocks');
        expect(txt(0)).not.toContain('ACME'); // hideOnFirst
        expect(txt(nested)).not.toContain('ACME'); // nested → no chrome
        expect(txt(all)).toContain('ACME');
        expect(txt(all)).toContain('Confidential');
        expect(txt(all)).toContain('2 / 2');
    });
    it('custom theme: uploaded fonts fall back to Calibri/Arial and are noted; inherit → paper', () => {
        const t = pptxTheme(fixture({ theme: 'custom', customTheme: { name: 'x', vars: { '--idoc-heading-font': '"MyFont", sans-serif', '--idoc-accent': 'rgb(1, 2, 3)' }, fontFaces: [{ family: 'MyFont', dataUrl: 'data:font/ttf;base64,AA==' }] } }));
        expect(t.fontHead).toBe('Calibri');
        expect(t.fontNote).toContain('MyFont');
        expect(t.accent).toBe('010203');
        expect(pptxTheme(fixture({ theme: 'inherit' })).bg).toBe('F6F1E7');
        expect(hex6('#abc', '000000')).toBe('AABBCC');
        expect(hex6('var(--x)', '123456')).toBe('123456');
    });
});
