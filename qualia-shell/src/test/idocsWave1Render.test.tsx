/**
 * Interactive Docs — Wave 1 renderer features (RTL, real timers only):
 * backgrounds/layouts, page sizes, nested cards, footnotes, chrome, new blocks,
 * donut/area charts, card-link buttons, spotlight, themes.
 */
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import IDocRenderer, { cardLinkId, footnoteRefs, topLevelIndexOf } from '../components/Scribe/idocs/IDocRenderer';
import { createEmptyDoc, IDOC_THEMES, themeById, type IDoc } from '../components/Scribe/idocs/idocTypes';
import { encodeQr, qrSvg } from '../components/Scribe/idocs/blocks/qr';

class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('ResizeObserver', MockResizeObserver); });
afterEach(cleanup);

function fixture(over: Partial<IDoc> = {}): IDoc {
    return createEmptyDoc({
        title: 'Wave 1',
        theme: 'ocean',
        pageSize: '16:9',
        chrome: { header: 'ACME Quarterly', footer: 'Confidential', logo: 'https://img.example/logo.png', sectionNumbers: true, hideOnFirst: true },
        cards: [
            { id: 'c1', title: 'Intro', layout: 'default', blocks: [
                { id: 'b1', type: 'text', md: 'Hello[^1] world' },
                { id: 'b2', type: 'button', label: 'Go deep', href: '#card:c2', variant: 'primary' },
                { id: 'b3', type: 'toc' },
            ], footnotes: [{ id: 'f1', text: 'First note' }] },
            { id: 'c2', title: 'Deep', layout: 'background', headerImage: 'https://img.example/bg.jpg', background: { overlay: 'frosted', intensity: 40, align: 'top' }, blocks: [
                { id: 'b4', type: 'steps', numbered: true, items: [{ title: 'Plan', md: 'p' }, { title: 'Build', md: 'b' }] },
                { id: 'b5', type: 'funnel', items: [{ label: 'Visits', value: 100 }, { label: 'Signups', value: 25 }] },
                { id: 'b6', type: 'boxes', columns: 2, items: [{ title: 'A', md: 'a' }, { title: 'B', md: 'b', emphasis: true }] },
                { id: 'b7', type: 'math', latex: 'E = mc^2' },
                { id: 'b8', type: 'diagram', mermaid: 'flowchart LR\n  A --> B' },
                { id: 'b9', type: 'qr', url: 'https://example.com', caption: 'Scan me' },
                { id: 'b10', type: 'chart', kind: 'donut', title: 'Share', data: [{ label: 'x', value: 3 }, { label: 'y', value: 1 }] },
                { id: 'b11', type: 'chart', kind: 'area', data: [{ label: 'q1', value: 1 }, { label: 'q2', value: 2 }] },
                { id: 'b12', type: 'code', lang: 'ts', code: 'const a = 1;' },
            ], children: [
                { id: 'c2a', title: 'Sub One', layout: 'default', blocks: [{ id: 'b13', type: 'text', md: 'nested body' }] },
                { id: 'c2b', title: 'Sub Two', layout: 'default', blocks: [{ id: 'b14', type: 'text', md: 'second nested' }] },
            ] },
            { id: 'c3', title: 'Colored', layout: 'image-top', headerImage: 'https://img.example/top.jpg', background: { color: '#123456' }, blocks: [{ id: 'b15', type: 'text', md: 'end' }] },
        ],
        ...over,
    });
}

describe('wave 1 helpers', () => {
    it('footnoteRefs rewrites [^n] to card-scoped links, leaves definitions alone', () => {
        expect(footnoteRefs('a[^1] b[^x] c[^2]: def', 'c9')).toBe('a[1](#fn-c9-1) b[x](#fn-c9-x) c[^2]: def');
    });
    it('cardLinkId parses #card: and #card- forms only', () => {
        expect(cardLinkId('#card:abc')).toBe('abc');
        expect(cardLinkId('#card-abc')).toBe('abc');
        expect(cardLinkId('https://x.y')).toBeNull();
        expect(cardLinkId('#other')).toBeNull();
    });
    it('topLevelIndexOf finds nested ids', () => {
        expect(topLevelIndexOf(fixture().cards, 'c2b')).toBe(1);
        expect(topLevelIndexOf(fixture().cards, 'nope')).toBe(-1);
    });
    it('ships 47 themes with complete var maps; themeById falls back to inherit', () => {
        expect(IDOC_THEMES.length).toBe(47);
        const ids = new Set(IDOC_THEMES.map((t) => t.id));
        expect(ids.size).toBe(47);
        for (const t of IDOC_THEMES) {
            for (const k of ['--idoc-bg', '--idoc-surface', '--idoc-text', '--idoc-muted', '--idoc-accent', '--idoc-heading-font', '--idoc-body-font', '--idoc-radius', '--idoc-border']) expect(t.vars[k], `${t.id} ${k}`).toBeTruthy();
            expect(t.swatch).toBeTruthy();
        }
        expect(themeById('ocean').vars['--idoc-accent']).toBe('#0e7490');
        expect(themeById('nope').id).toBe('inherit');
    });
});

describe('local QR encoder', () => {
    it('encodes into a square matrix with three finder patterns and grows with input', () => {
        const m = encodeQr('https://example.com')!;
        expect(m.length).toBe(25); // version 2 at ECC M
        expect(m.every((r) => r.length === m.length)).toBe(true);
        // finder pattern centers are dark, separators light
        const n = m.length;
        for (const [x, y] of [[3, 3], [n - 4, 3], [3, n - 4]]) expect(m[y][x]).toBe(true);
        for (const [x, y] of [[7, 0], [0, 7], [7, 7], [n - 8, 0], [n - 8, 7], [0, n - 8], [7, n - 8]]) expect(m[y][x], `separator ${x},${y}`).toBe(false);
        expect(m[n - 8][8]).toBe(true); // dark module
        expect(encodeQr('x'.repeat(200))!.length).toBe(57); // version 10
        expect(encodeQr('x'.repeat(300))).toBeNull(); // > version 10 at M
        expect(encodeQr('x'.repeat(250), 'L')!.length).toBe(57);
    });
    it('is deterministic and emits an SVG with a black-on-white path', () => {
        expect(encodeQr('same')).toEqual(encodeQr('same'));
        const svg = qrSvg('https://example.com', { title: 'x<y' })!;
        expect(svg).toMatch(/^<svg xmlns=/);
        expect(svg).toContain('<title>x&lt;y</title>');
        expect(svg).toContain('fill="#000"');
        expect(svg).toContain('viewBox="0 0 33 33"');
    });
});

describe('scroll mode: wave 1 rendering', () => {
    it('applies page-size aspect var, dir/lang, and the theme', () => {
        render(<IDocRenderer doc={fixture({ dir: 'rtl', language: 'he' })} />);
        const root = screen.getByTestId('idoc-scroll');
        expect(root.getAttribute('style')).toContain('--idoc-aspect: 16 / 9');
        expect(root.getAttribute('dir')).toBe('rtl');
        expect(root.getAttribute('lang')).toBe('he');
        expect(root.className).toContain('scribe-idocs__doc--ps-16x9');
        expect(root.querySelector('style')!.textContent).toContain('@page{size:13.333in 7.5in}');
        expect(root.getAttribute('style')).toContain('--idoc-accent: #0e7490');
    });
    it('renders backgrounds + layouts via classes and inline vars', () => {
        render(<IDocRenderer doc={fixture()} />);
        const c2 = document.getElementById('idoc-card-c2')!;
        expect(c2.className).toContain('scribe-idocs__card--background');
        expect(c2.className).toContain('scribe-idocs__card--has-image');
        expect(c2.className).toContain('scribe-idocs__card--overlay-frosted');
        expect(c2.getAttribute('style')).toContain('--idoc-card-image: url("https://img.example/bg.jpg")');
        expect(c2.getAttribute('style')).toContain('--idoc-overlay: 0.4');
        expect(c2.getAttribute('style')).toContain('--idoc-card-image-pos: top');
        expect(c2.querySelector('img.scribe-idocs__card-media')).toBeNull(); // background layout: image is the backdrop, not an <img>
        const c3 = document.getElementById('idoc-card-c3')!;
        expect(c3.className).toContain('scribe-idocs__card--image-top');
        expect(c3.className).toContain('scribe-idocs__card--has-color');
        expect(c3.getAttribute('style')).toContain('--idoc-card-bg: #123456');
        expect(c3.querySelector('img.scribe-idocs__card-media')?.getAttribute('src')).toBe('https://img.example/top.jpg');
    });
    it('renders footnotes list + superscript refs scoped to the card', () => {
        render(<IDocRenderer doc={fixture()} />);
        const ref = document.querySelector('sup.scribe-idocs__fnref a')!;
        expect(ref.getAttribute('href')).toBe('#fn-c1-1');
        expect(ref.textContent).toBe('1');
        expect(document.getElementById('fn-c1-1')).toHaveTextContent('First note');
        expect(screen.getByRole('list', { name: 'Footnotes' })).toBeInTheDocument();
    });
    it('renders chrome on every card except the first when hideOnFirst', () => {
        render(<IDocRenderer doc={fixture()} />);
        const c1 = document.getElementById('idoc-card-c1')!;
        const c2 = document.getElementById('idoc-card-c2')!;
        expect(c1.querySelector('.scribe-idocs__chrome')).toBeNull();
        expect(c2.querySelector('.scribe-idocs__chrome-header')).toHaveTextContent('ACME Quarterly');
        expect(c2.querySelector('.scribe-idocs__chrome-footer')).toHaveTextContent('Confidential');
        expect(c2.querySelector('.scribe-idocs__chrome-num')).toHaveTextContent('2 / 3');
        expect(c2.querySelector('img.scribe-idocs__chrome-logo')?.getAttribute('src')).toBe('https://img.example/logo.png');
    });
    it('renders nested cards as open <details>, collapsible, ⌘⇧O toggles all; TOC lists children indented', () => {
        render(<IDocRenderer doc={fixture()} />);
        const subs = document.querySelectorAll('details.scribe-idocs__subcard');
        expect(subs.length).toBe(2);
        expect(subs[0].hasAttribute('open')).toBe(true);
        expect(screen.getByText('nested body')).toBeInTheDocument();
        expect(subs[0].id).toBe('idoc-card-c2a');
        // individual collapse via summary
        fireEvent.click(subs[0].querySelector('summary')!);
        expect(subs[0].hasAttribute('open')).toBe(false);
        // ⌘⇧O collapses all (remounts closed)
        fireEvent.keyDown(window, { key: 'O', metaKey: true, shiftKey: true });
        document.querySelectorAll('details.scribe-idocs__subcard').forEach((d) => expect(d.hasAttribute('open')).toBe(false));
        fireEvent.keyDown(window, { key: 'o', ctrlKey: true, shiftKey: true });
        document.querySelectorAll('details.scribe-idocs__subcard').forEach((d) => expect(d.hasAttribute('open')).toBe(true));
        // TOC nests children
        const toc = screen.getByRole('navigation', { name: 'Contents' });
        const nestedList = toc.querySelector('ol ol')!;
        expect(within(nestedList as HTMLElement).getByText('Sub Two')).toBeInTheDocument();
    });
    it('renders steps / funnel / boxes / math / diagram / qr / code / donut / area', () => {
        render(<IDocRenderer doc={fixture()} />);
        const steps = document.querySelector('ol.scribe-idocs__steps')!;
        expect(steps.querySelectorAll('li.scribe-idocs__step').length).toBe(2);
        expect(steps.querySelector('.scribe-idocs__step-marker')).toHaveTextContent('1');
        const funnel = document.querySelectorAll('.scribe-idocs__funnel-row');
        expect((funnel[0] as HTMLElement).style.width).toBe('100%');
        expect((funnel[1] as HTMLElement).style.width).toBe('25%');
        const boxes = document.querySelector('.scribe-idocs__boxes') as HTMLElement;
        expect(boxes.getAttribute('style')).toContain('--idoc-cols: 2');
        expect(boxes.querySelectorAll('.scribe-idocs__box--emphasis').length).toBe(1);
        // math/diagram/code: imperative fallback content present before (or without) CDN enhancers
        expect(document.querySelector('.scribe-idocs__math--block')).toHaveTextContent('$$E = mc^2$$');
        expect(document.querySelector('.scribe-idocs__diagram code.language-mermaid')).toHaveTextContent('flowchart LR');
        expect(document.querySelector('.scribe-idocs__code code.language-ts')).toHaveTextContent('const a = 1;');
        // qr: local svg, no remote image
        const qr = document.querySelector('.scribe-idocs__qr')!;
        expect(qr.querySelector('svg')?.getAttribute('aria-label')).toBe('QR code for https://example.com');
        expect(qr.querySelector('img')).toBeNull();
        expect(qr.querySelector('figcaption')).toHaveTextContent('Scan me');
        // charts
        expect(document.querySelector('figure[data-kind="donut"] table caption')).toHaveTextContent('Share — data');
        expect(document.querySelector('figure[data-kind="donut"] tbody tr td:last-child')).toHaveTextContent('75%');
        expect(document.querySelector('figure[data-kind="area"]')).not.toBeNull();
    });
    it('card-link button jumps in-doc (scrollIntoView) instead of opening a link', () => {
        const spy = vi.fn();
        Element.prototype.scrollIntoView = spy;
        render(<IDocRenderer doc={fixture()} />);
        const btn = screen.getByRole('button', { name: 'Go deep' });
        expect(btn.tagName).toBe('BUTTON');
        fireEvent.click(btn);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(document.querySelector('a[href="#card:c2"]')).toBeNull();
    });
});

const count = () => document.querySelector('.scribe-idocs__present-count')!.textContent;

describe('present mode: wave 1', () => {
    it('card-link button switches the active card and reports it', () => {
        const onChange = vi.fn();
        render(<IDocRenderer doc={fixture()} mode="present" onActiveCardChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Go deep' }));
        expect(onChange).toHaveBeenLastCalledWith(1);
        expect(count()).toBe('2 / 3');
    });
    it('S toggles spotlight; ArrowDown reveals, ArrowUp hides; end of card advances', () => {
        render(<IDocRenderer doc={fixture()} mode="present" />);
        fireEvent.keyDown(window, { key: 'ArrowRight' }); // card 2 (9 blocks)
        expect(document.querySelectorAll('.scribe-idocs__blockslot').length).toBe(0);
        fireEvent.keyDown(window, { key: 's' });
        const pill = screen.getByRole('button', { name: /Spotlight/ });
        expect(pill).toHaveAttribute('aria-pressed', 'true');
        let slots = document.querySelectorAll('.scribe-idocs__blockslot');
        expect(slots.length).toBe(9);
        expect(slots[0].className).not.toContain('is-dimmed');
        expect(slots[1].className).toContain('is-dimmed');
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        slots = document.querySelectorAll('.scribe-idocs__blockslot');
        expect(slots[1].className).not.toContain('is-dimmed');
        expect(slots[2].className).toContain('is-dimmed');
        expect(document.querySelectorAll('.scribe-idocs__spot-dots i.is-on').length).toBe(2);
        fireEvent.keyDown(window, { key: 'ArrowUp' });
        expect(document.querySelectorAll('.scribe-idocs__blockslot')[1].className).toContain('is-dimmed');
        // reveal all remaining then one more → next card, spotlight stays on at block 0
        for (let i = 0; i < 8; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(count()).toBe('2 / 3');
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(count()).toBe('3 / 3');
        expect(document.querySelectorAll('.scribe-idocs__blockslot').length).toBe(1);
        // ⌘S must not toggle spotlight
        fireEvent.keyDown(window, { key: 's', metaKey: true });
        expect(screen.getByRole('button', { name: /Spotlight/ })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.keyDown(window, { key: 'S' });
        expect(document.querySelectorAll('.scribe-idocs__blockslot').length).toBe(0);
    });
    it('present mode still shows chrome + section numbers on the current card', () => {
        render(<IDocRenderer doc={fixture()} mode="present" activeCardIndex={2} />);
        expect(document.querySelector('.scribe-idocs__chrome-num')).toHaveTextContent('3 / 3');
    });
});
