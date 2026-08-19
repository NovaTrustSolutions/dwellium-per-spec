/**
 * Interactive Docs — Wave 2A media/theme/export seams (network-free, real timers):
 * chartData (CSV / Sheets), imageSources fetchers (injected fetch), aiImage
 * helpers, imageOpts, ThemeEditor callbacks, renderer @font-face, exportHtml
 * custom theme + font-face + image opts, EXPORT_ACTIONS shape.
 */
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { parseCsv, chartDataFromCsv, sheetsCsvUrl, fetchChartData } from '../components/Scribe/idocs/blocks/chartData';
import { searchOpenverse, searchUnsplash, searchGiphy, picsumUrl, attributionFor, loadMediaKeys, saveMediaKeys, MEDIA_KEYS_STORAGE } from '../components/Scribe/idocs/blocks/imageSources';
import { buildImagePrompt, dataUrlFromSkillText, hasImageGenKey, generateImageDataUrl } from '../components/Scribe/idocs/blocks/aiImage';
import { imgOptsOf, imgOptsStyle, imgOptsCss } from '../components/Scribe/idocs/blocks/imageOpts';
import IDocRenderer, { fontFaceCss, themeStyle } from '../components/Scribe/idocs/IDocRenderer';
import { exportHtml, exportThemeVars, EXPORT_ACTIONS, renderedCardEls } from '../components/Scribe/idocs/idocExport';
import ThemeEditor from '../components/Scribe/idocs/ThemeEditor';
import { createEmptyDoc, type Block, type CustomTheme, type IDoc } from '../components/Scribe/idocs/idocTypes';

class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('ResizeObserver', MockResizeObserver); });
afterEach(cleanup);

const jsonRes = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const textRes = (body: string, ok = true, status = 200) => ({ ok, status, text: async () => body, json: async () => JSON.parse(body) }) as unknown as Response;

// ── chartData ─────────────────────────────────────────────────────────────
describe('chartData', () => {
    it('parseCsv handles quotes, escaped quotes, CRLF and newlines inside quotes', () => {
        const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n"multi\nline",3\n');
        expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['multi\nline', '3']]);
    });
    it('parseCsv sniffs ; and tab delimiters when the first line has no comma', () => {
        expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
        expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    });
    it('chartDataFromCsv: header detection, first text col = label, first numeric col = value, currency/percent/thousands', () => {
        expect(chartDataFromCsv('Region,Notes,Sales\nWest,foo,"1,200"\nEast,bar,$800\nSouth,baz,45%')).toEqual([
            { label: 'West', value: 1200 }, { label: 'East', value: 800 }, { label: 'South', value: 45 },
        ]);
        // no header row
        expect(chartDataFromCsv('A,3\nB,5')).toEqual([{ label: 'A', value: 3 }, { label: 'B', value: 5 }]);
        // all-numeric: first numeric col is the label (Year), second the value
        expect(chartDataFromCsv('Year,Sales\n2020,10\n2021,20')).toEqual([{ label: '2020', value: 10 }, { label: '2021', value: 20 }]);
        // no numeric column at all
        expect(chartDataFromCsv('a,b\nx,y')).toEqual([]);
        expect(chartDataFromCsv('')).toEqual([]);
    });
    it('sheetsCsvUrl rewrites share/edit URLs (with gid) and keeps published pub?output=csv', () => {
        expect(sheetsCsvUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=77')).toBe('https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=77');
        expect(sheetsCsvUrl('https://docs.google.com/spreadsheets/d/ABC123/edit?usp=sharing')).toBe('https://docs.google.com/spreadsheets/d/ABC123/export?format=csv');
        expect(sheetsCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv')).toBe('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv');
        expect(sheetsCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pubhtml')).toBe('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv');
        expect(sheetsCsvUrl('https://example.com/data.csv')).toBe('https://example.com/data.csv');
    });
    it('fetchChartData rewrites Sheets URLs, uses the injected fetch, and throws on HTTP / empty', async () => {
        const fetchFn = vi.fn(async (url: RequestInfo | URL) => (String(url).includes('export?format=csv') ? textRes('Label,Value\nA,1\nB,2') : textRes('nope', false, 404)));
        const data = await fetchChartData('https://docs.google.com/spreadsheets/d/ID1/edit#gid=0', fetchFn as unknown as typeof fetch);
        expect(fetchFn.mock.calls[0][0]).toBe('https://docs.google.com/spreadsheets/d/ID1/export?format=csv&gid=0');
        expect(data).toEqual([{ label: 'A', value: 1 }, { label: 'B', value: 2 }]);
        await expect(fetchChartData('https://example.com/x.csv', fetchFn as unknown as typeof fetch)).rejects.toThrow('HTTP 404');
        await expect(fetchChartData('https://example.com/y.csv', (async () => textRes('a,b\nx,y')) as unknown as typeof fetch)).rejects.toThrow(/No numeric/);
        await expect(fetchChartData('ftp://nope', fetchFn as unknown as typeof fetch)).rejects.toThrow(/http/);
    });
});

// ── imageSources ──────────────────────────────────────────────────────────
describe('imageSources', () => {
    it('searchOpenverse maps results and hits the keyless API', async () => {
        const fetchFn = vi.fn(async (_u: RequestInfo | URL) => jsonRes({ results: [
            { title: 'Lighthouse', url: 'https://img/1.jpg', thumbnail: 'https://img/1t.jpg', creator: 'Ann', license: 'by', license_version: '4.0', foreign_landing_url: 'https://src/1' },
            { title: 'No url', url: '', thumbnail: '' },
        ] }));
        const out = await searchOpenverse('lighthouse', fetchFn as unknown as typeof fetch);
        expect(String(fetchFn.mock.calls[0][0])).toMatch(/^https:\/\/api\.openverse\.org\/v1\/images\/\?q=lighthouse/);
        expect(out).toEqual([{ url: 'https://img/1.jpg', thumb: 'https://img/1t.jpg', title: 'Lighthouse', creator: 'Ann', license: 'CC BY 4.0', source: 'openverse', link: 'https://src/1' }]);
        expect(attributionFor(out[0])).toBe('Photo: Ann · CC BY 4.0 · via Openverse');
        expect(await searchOpenverse('   ', fetchFn as unknown as typeof fetch)).toEqual([]);
    });
    it('searchUnsplash sends Client-ID auth and maps urls/user; searchGiphy maps images + needs key', async () => {
        const uf = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => jsonRes({ results: [{ urls: { regular: 'https://u/r.jpg', small: 'https://u/s.jpg' }, alt_description: 'a cat', user: { name: 'Bob' }, links: { html: 'https://unsplash.com/p/1' } }] }));
        const u = await searchUnsplash('cat', 'KEY1', uf as unknown as typeof fetch);
        expect(uf.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Client-ID KEY1' } });
        expect(u[0]).toMatchObject({ url: 'https://u/r.jpg', thumb: 'https://u/s.jpg', title: 'a cat', creator: 'Bob', license: 'Unsplash License', source: 'unsplash' });
        await expect(searchUnsplash('cat', '', uf as unknown as typeof fetch)).rejects.toThrow(/key/);

        const gf = vi.fn(async (_u: RequestInfo | URL) => jsonRes({ data: [{ title: 'wow gif', url: 'https://giphy.com/g/1', user: { display_name: 'Gia' }, images: { downsized: { url: 'https://g/d.gif' }, fixed_width: { url: 'https://g/fw.gif' }, original: { url: 'https://g/o.gif' } } }] }));
        const g = await searchGiphy('wow', 'GKEY', gf as unknown as typeof fetch);
        expect(String(gf.mock.calls[0][0])).toContain('api_key=GKEY');
        expect(g[0]).toMatchObject({ url: 'https://g/d.gif', thumb: 'https://g/fw.gif', title: 'wow gif', creator: 'Gia', source: 'giphy' });
        await expect(searchGiphy('wow', '', gf as unknown as typeof fetch)).rejects.toThrow(/key/);
    });
    it('fetchers surface HTTP + network errors as plain Errors', async () => {
        await expect(searchOpenverse('x', (async () => jsonRes({}, false, 429)) as unknown as typeof fetch)).rejects.toThrow('HTTP 429');
        await expect(searchOpenverse('x', (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).rejects.toThrow(/Network error/);
    });
    it('picsumUrl + media keys round-trip', () => {
        expect(picsumUrl(800, 450)).toBe('https://picsum.photos/800/450');
        expect(picsumUrl(800, 450, 'hero 1')).toBe('https://picsum.photos/seed/hero%201/800/450');
        expect(loadMediaKeys()).toEqual({});
        saveMediaKeys({ unsplash: ' U1 ', giphy: '' });
        expect(JSON.parse(localStorage.getItem(MEDIA_KEYS_STORAGE)!)).toEqual({ unsplash: 'U1' });
        expect(loadMediaKeys()).toEqual({ unsplash: 'U1', giphy: undefined });
    });
});

// ── aiImage ───────────────────────────────────────────────────────────────
describe('aiImage', () => {
    it('builds prompts with style + size hints and extracts the data URL from skill markdown', () => {
        expect(buildImagePrompt(' a fox ', 'line-art', 'wide')).toMatch(/^a fox, minimal black line art.*wide 16:9/);
        expect(dataUrlFromSkillText('![fox](data:image/png;base64,AAAA)')).toBe('data:image/png;base64,AAAA');
        expect(dataUrlFromSkillText('no image')).toBeNull();
        expect(hasImageGenKey({ active: null })).toBe(false);
        expect(hasImageGenKey({ active: 'openai', openai: { apiKey: 'k', model: 'x' } } as never)).toBe(true);
    });
    it('generateImageDataUrl throws a clear hint when no key is configured (no network)', async () => {
        await expect(generateImageDataUrl('fox', { style: 'photo', size: 'square', llm: { active: null } })).rejects.toThrow(/OpenAI or Gemini key/);
        await expect(generateImageDataUrl('  ', { style: 'photo', size: 'square', llm: { active: null } })).rejects.toThrow(/Describe/);
    });
});

// ── imageOpts ─────────────────────────────────────────────────────────────
describe('imageOpts', () => {
    const img = { id: 'i', type: 'image', src: 'https://x/y.jpg', imgOpts: { ratio: '16:9', fit: 'cover', focal: '30% 70%' } } as unknown as Block;
    it('reads defensively and produces style + css', () => {
        expect(imgOptsOf(img)).toEqual({ ratio: '16:9', fit: 'cover', focal: '30% 70%' });
        expect(imgOptsOf({ id: 'i', type: 'image', src: '', imgOpts: { ratio: 'nope', focal: 'left' } } as unknown as Block)).toBeUndefined();
        expect(imgOptsStyle(imgOptsOf(img))).toEqual({ aspectRatio: '16 / 9', width: '100%', objectFit: 'cover', objectPosition: '30% 70%' });
        expect(imgOptsCss(imgOptsOf(img))).toBe('aspect-ratio:16/9;width:100%;object-fit:cover;object-position:30% 70%');
        expect(imgOptsCss(undefined)).toBe('');
    });
});

// ── custom theme: renderer + export ───────────────────────────────────────
const FONT_URL = 'data:font/woff2;base64,d09GMgABAAAA';
const custom: CustomTheme = { name: 'Brand', vars: { '--idoc-bg': '#101010', '--idoc-accent': '#ff0088', '--idoc-heading-font': '"Brand Sans", sans-serif' }, fontFaces: [{ family: 'Brand Sans', dataUrl: FONT_URL, weight: '600' }], logo: 'https://img.example/logo.png' };
function customDoc(): IDoc {
    return createEmptyDoc({ title: 'Custom', theme: 'custom', customTheme: custom, cards: [{ id: 'c1', title: 'One', layout: 'default', blocks: [
        { id: 'b1', type: 'text', md: 'hi' },
        { id: 'b2', type: 'image', src: 'https://x/y.jpg', alt: 'y', imgOpts: { ratio: '1:1', focal: '10% 90%' } } as unknown as Block,
    ] }] });
}

describe('custom theme + font-face', () => {
    it('fontFaceCss emits sanitized @font-face for data URLs only', () => {
        expect(fontFaceCss(custom.fontFaces)).toBe(`@font-face{font-family:"Brand Sans";src:url("${FONT_URL}");font-weight:600;font-display:swap}`);
        expect(fontFaceCss([{ family: 'Evil"', dataUrl: 'https://evil/x.woff2' }])).toBe('');
        expect(fontFaceCss(undefined)).toBe('');
    });
    it('renderer merges custom vars over inherit, emits the @font-face <style>, and applies image opts', () => {
        const doc = customDoc();
        const vars = themeStyle(doc) as unknown as Record<string, string>;
        expect(vars['--idoc-bg']).toBe('#101010');
        expect(vars['--idoc-accent']).toBe('#ff0088');
        expect(vars['--idoc-surface']).toBe('var(--bg-surface-elevated)'); // inherit base
        render(<IDocRenderer doc={doc} />);
        const style = document.querySelector('style[data-idoc-style]');
        expect(style?.textContent).toContain('@font-face{font-family:"Brand Sans"');
        const img = document.querySelector('.scribe-idocs__figure img') as HTMLImageElement;
        expect(img.style.aspectRatio).toBe('1 / 1');
        expect(img.style.objectPosition).toBe('10% 90%');
    });
    it('exportHtml inlines custom vars (paper base) + @font-face + image opts', () => {
        const doc = customDoc();
        const vars = exportThemeVars(doc);
        expect(vars['--idoc-bg']).toBe('#101010');
        expect(vars['--idoc-surface']).toBe('#ffffff'); // paper base, no app tokens
        const html = exportHtml(doc);
        expect(html).toContain('--idoc-accent:#ff0088');
        expect(html).toContain('@font-face{font-family:"Brand Sans"');
        expect(html).toContain('style="aspect-ratio:1/1;width:100%;object-fit:cover;object-position:10% 90%"');
        expect(html).not.toMatch(/<script/i);
    });
    it('EXPORT_ACTIONS exposes the menu seam with stable ids and run(doc, ctx)', () => {
        expect(EXPORT_ACTIONS.map((a) => a.id)).toEqual(['html', 'markdown', 'pdf-styled', 'pdf-text', 'print', 'png-card', 'png-all']);
        for (const a of EXPORT_ACTIONS) { expect(typeof a.label).toBe('string'); expect(typeof a.run).toBe('function'); }
        render(<IDocRenderer doc={customDoc()} />);
        expect(renderedCardEls(document)).toHaveLength(1);
    });
});

// ── ThemeEditor ───────────────────────────────────────────────────────────
describe('ThemeEditor', () => {
    it('renders seeded from the doc theme, previews a sample card, and fires apply/save/delete/close with a CustomTheme', () => {
        const onApply = vi.fn(); const onSave = vi.fn(); const onDelete = vi.fn(); const onClose = vi.fn();
        const doc = createEmptyDoc({ theme: 'midnight' });
        render(<ThemeEditor doc={doc} customThemes={[{ name: 'Brand', vars: { '--idoc-accent': '#123456' } }]} onApply={onApply} onSave={onSave} onDelete={onDelete} onClose={onClose} />);
        expect(screen.getByRole('dialog', { name: 'Theme editor' })).toBeInTheDocument();
        expect(screen.getByText('Sample card')).toBeInTheDocument();
        expect((screen.getByLabelText('Accent value') as HTMLInputElement).value).toBe('#7aa2ff'); // midnight seed
        fireEvent.change(screen.getByLabelText('Theme name'), { target: { value: 'Brand' } });
        fireEvent.change(screen.getByLabelText('Accent value'), { target: { value: '#ff0088' } });
        fireEvent.change(screen.getByLabelText('Heading font'), { target: { value: 'Georgia, serif' } });
        fireEvent.click(screen.getByRole('button', { name: 'Apply to this doc' }));
        expect(onApply).toHaveBeenCalledTimes(1);
        const applied = onApply.mock.calls[0][0] as CustomTheme;
        expect(applied.name).toBe('Brand');
        expect(applied.vars['--idoc-accent']).toBe('#ff0088');
        expect(applied.vars['--idoc-heading-font']).toBe('Georgia, serif');
        expect(applied.vars['--idoc-bg']).toBe('#0b1020');
        expect(applied.fontFaces).toBeUndefined();
        fireEvent.click(screen.getByRole('button', { name: 'Update saved theme' }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Brand', vars: expect.objectContaining({ '--idoc-accent': '#ff0088' }) }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onDelete).toHaveBeenCalledWith('Brand');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
    it('loads a saved theme and lists uploaded fonts from doc.customTheme', () => {
        const doc = createEmptyDoc({ theme: 'custom', customTheme: custom });
        render(<ThemeEditor doc={doc} customThemes={[{ name: 'Other', vars: { '--idoc-accent': '#00ff00' } }]} onApply={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByRole('list', { name: 'Uploaded fonts' })).toHaveTextContent('Brand Sans');
        fireEvent.change(screen.getByLabelText('Load saved theme'), { target: { value: 'Other' } });
        expect((screen.getByLabelText('Accent value') as HTMLInputElement).value).toBe('#00ff00');
    });
});
