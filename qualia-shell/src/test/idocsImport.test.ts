/**
 * Interactive Docs — import: html→text keeps headings/paragraphs and drops
 * chrome; URL import via injected fetch (backend proxy → direct → blocked);
 * PDF import via injected extractPdfText seam (AI + no-AI page fallback).
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchUrlText, htmlToText, importFromPdf, importFromUrl } from '../components/Scribe/idocs/idocsImport';
import type { LlmBundle } from '../components/Scribe/idocs/idocsAi';

const LLM_ON = { active: 'openai', openai: { enabled: true, apiKey: 'sk-test', model: 'gpt-x' } } as unknown as LlmBundle;
const LLM_OFF = { active: null } as unknown as LlmBundle;

const HTML = `<!doctype html><html><head><title>Move-in Guide | Acme</title><style>.x{}</style><script>alert(1)</script></head>
<body><nav><a href="/">Home</a></nav>
<article><h1>Move-in Guide</h1><p>Welcome <b>home</b>.</p><h2>Utilities</h2><p>Set up electric.</p><ul><li>Gas</li><li>Water</li></ul><aside>ad ad ad</aside></article>
<footer>© Acme</footer></body></html>`;

const htmlResponse = (body: string, ok = true, status = 200) => ({ ok, status, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }), text: async () => body, json: async () => ({}) }) as unknown as Response;
const jsonResponse = (obj: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, headers: new Headers({ 'content-type': 'application/json' }), json: async () => obj, text: async () => JSON.stringify(obj) }) as unknown as Response;

describe('htmlToText', () => {
    it('keeps headings/paragraphs/lists as markdown, drops script/style/nav/aside/footer, picks the <title>', () => {
        const { title, text } = htmlToText(HTML);
        expect(title).toBe('Move-in Guide | Acme');
        expect(text).toContain('# Move-in Guide');
        expect(text).toContain('## Utilities');
        expect(text).toContain('Welcome **home**.');
        expect(text).toContain('- Gas');
        expect(text).not.toContain('alert(1)');
        expect(text).not.toContain('Home');
        expect(text).not.toContain('ad ad ad');
        expect(text).not.toContain('© Acme');
    });
});

describe('fetchUrlText / importFromUrl', () => {
    it('uses the backend proxy when it answers', async () => {
        const fetchFn = vi.fn().mockImplementation(async (u: string) => (u.includes('/api/scribe/fetch-article') ? jsonResponse({ success: true, title: 'Proxied', content: '# A\n\nbody' }) : htmlResponse(HTML)));
        const r = await fetchUrlText('https://example.com/x', fetchFn as unknown as typeof fetch);
        expect(r).toEqual({ title: 'Proxied', text: '# A\n\nbody' });
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('falls back to a direct fetch + html strip when the proxy is down; no-LLM → headings split', async () => {
        const fetchFn = vi.fn().mockImplementation(async (u: string) => (u.includes('/api/scribe/fetch-article') ? Promise.reject(new TypeError('Failed to fetch')) : htmlResponse(HTML)));
        const r = await importFromUrl('https://example.com/guide', LLM_OFF, {}, vi.fn(), fetchFn as unknown as typeof fetch);
        expect('doc' in r).toBe(true);
        if ('doc' in r) {
            expect(r.source).toBe('headings');
            expect(r.doc.cards.map((c) => c.title)).toEqual(['Move-in Guide', 'Utilities']);
        }
    });

    it('with an LLM: generateDocFromText gets the stripped text and the doc opens with the model title', async () => {
        const fetchFn = vi.fn().mockImplementation(async (u: string) => (u.includes('/api/scribe/fetch-article') ? jsonResponse({ success: false }, false) : htmlResponse(HTML)));
        const callLlmFn = vi.fn().mockResolvedValue({ text: '{"title":"From model","cards":[{"title":"c","blocks":[{"type":"text","md":"m"}]}]}', provider: 'openai', model: 'm' });
        const r = await importFromUrl('https://example.com/guide', LLM_ON, { cards: 3 }, callLlmFn, fetchFn as unknown as typeof fetch);
        expect('doc' in r && r.doc.title).toBe('From model');
        expect('doc' in r && r.source).toBe('ai');
        expect(callLlmFn.mock.calls[0][0].prompt).toContain('## Utilities');
        expect(callLlmFn.mock.calls[0][0].systemPrompt).toContain('Exactly 3 cards');
    });

    it('CORS/network failure on the direct path → { error: "blocked" } with a helpful message', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        const r = await importFromUrl('https://blocked.example/x', LLM_ON, {}, vi.fn(), fetchFn as unknown as typeof fetch);
        expect(r).toMatchObject({ error: 'blocked' });
        expect('message' in r && r.message).toMatch(/blocked\.example/);
        expect('message' in r && r.message).toMatch(/Paste text/);
    });

    it('invalid / non-http urls and HTTP errors are reported, never thrown', async () => {
        expect(await fetchUrlText('not a url', vi.fn() as unknown as typeof fetch)).toMatchObject({ error: 'invalid' });
        expect(await fetchUrlText('javascript:alert(1)', vi.fn() as unknown as typeof fetch)).toMatchObject({ error: 'invalid' });
        const fetchFn = vi.fn().mockImplementation(async (u: string) => (u.includes('/api/') ? Promise.reject(new Error('x')) : htmlResponse('', false, 404)));
        expect(await fetchUrlText('https://example.com/missing', fetchFn as unknown as typeof fetch)).toMatchObject({ error: 'failed', message: expect.stringContaining('404') });
        const empty = vi.fn().mockImplementation(async (u: string) => (u.includes('/api/') ? Promise.reject(new Error('x')) : htmlResponse('<html><body><script>x()</script></body></html>')));
        expect(await importFromUrl('https://example.com/empty', LLM_OFF, {}, vi.fn(), empty as unknown as typeof fetch)).toMatchObject({ error: 'empty' });
    });
});

describe('importFromPdf', () => {
    const file = Object.assign(new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), { name: 'Lease Renewal.pdf' });

    it('no LLM → one card per page, title from filename', async () => {
        const extract = vi.fn().mockResolvedValue(['Page one   text', '', 'Page three']);
        const r = await importFromPdf(file, LLM_OFF, {}, vi.fn(), extract);
        expect(extract).toHaveBeenCalledTimes(1);
        expect(extract.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
        expect('doc' in r && r.source).toBe('pages');
        if ('doc' in r) {
            expect(r.doc.title).toBe('Lease Renewal');
            expect(r.doc.cards.map((c) => c.title)).toEqual(['Page 1', 'Page 2', 'Page 3']);
            expect(r.doc.cards[0].blocks[0]).toMatchObject({ type: 'text', md: 'Page one text' });
            expect(r.doc.cards[1].blocks).toEqual([]);
        }
    });

    it('with LLM → page-tagged text goes to generateDocFromText', async () => {
        const extract = vi.fn().mockResolvedValue(['alpha', 'beta']);
        const callLlmFn = vi.fn().mockResolvedValue({ text: '{"title":"Renewal","cards":[{"title":"c","blocks":[]}]}', provider: 'openai', model: 'm' });
        const r = await importFromPdf(file, LLM_ON, {}, callLlmFn, extract);
        expect('doc' in r && r.doc.title).toBe('Renewal');
        expect(callLlmFn.mock.calls[0][0].prompt).toContain('[Page 2]\nbeta');
    });

    it('empty text layer → error "empty"; extractor throw → error "failed"', async () => {
        expect(await importFromPdf(file, LLM_OFF, {}, vi.fn(), vi.fn().mockResolvedValue(['', '  ']))).toMatchObject({ error: 'empty' });
        expect(await importFromPdf(file, LLM_OFF, {}, vi.fn(), vi.fn().mockRejectedValue(new Error('bad xref')))).toMatchObject({ error: 'failed', message: expect.stringContaining('bad xref') });
    });
});
