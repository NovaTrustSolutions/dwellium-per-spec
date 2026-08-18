/**
 * Interactive Docs — AI helpers: normalizeDoc coercion, generateDocFromPrompt
 * with an injected callLlmFn (fenced JSON), llm-off → null, embedSrcFor map.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    normalizeDoc, normalizeBlock, generateDocFromPrompt, generateDocFromText, rewriteBlockMd,
    embedSrcFor, suggestThemeFor, parseJsonLoose, docFromMarkdownHeadings, dirForLanguage, BLOCK_CONTRACT, type LlmBundle,
} from '../components/Scribe/idocs/idocsAi';
import { BUILTIN_TEMPLATES, docFromTemplate } from '../components/Scribe/idocs/idocsTemplates';
import { BLOCK_TYPES } from '../components/Scribe/idocs/idocTypes';

const LLM_ON = { active: 'openai', openai: { enabled: true, apiKey: 'sk-test', model: 'gpt-x' } } as unknown as LlmBundle;
const LLM_OFF = { active: null } as unknown as LlmBundle;

describe('normalizeDoc / normalizeBlock', () => {
    it('coerces unknown block types to text and fills missing ids / clamps levels', () => {
        const doc = normalizeDoc({
            title: 'T',
            cards: [{ title: 'C1', layout: 'weird', blocks: [
                { type: 'heading', level: 9, text: 'H' },
                { type: 'wat', foo: 1 },
                { type: 'quiz', question: 'Q', options: ['a', 'b'], answerIndex: 7 },
                { type: 'columns', columns: ['only one'] },
                { type: 'chart', kind: 'donut', data: [{ label: 'a', value: '3' }, { name: 'b', y: 4 }, { value: 1 }] },
            ] }],
        });
        expect(doc.cards).toHaveLength(1);
        expect(doc.cards[0].layout).toBe('default');
        const [h, wat, quiz, cols, chart] = doc.cards[0].blocks;
        expect(h.type === 'heading' && h.level).toBe(3);
        expect(wat.type).toBe('text');
        expect(wat.type === 'text' && wat.md).toContain('"wat"');
        expect(quiz.type === 'quiz' && quiz.answerIndex).toBe(1);
        expect(cols.type === 'columns' && cols.columns.length).toBe(2);
        expect(chart.type === 'chart' && chart.kind).toBe('bar');
        expect(chart.type === 'chart' && chart.data).toEqual([{ label: 'a', value: 3 }, { label: 'b', value: 4 }]);
        for (const b of doc.cards[0].blocks) expect(b.id).toBeTruthy();
        expect(doc.cards[0].id).toBeTruthy();
    });

    it('never throws on garbage and always yields at least one card', () => {
        expect(normalizeDoc(null).cards.length).toBeGreaterThan(0);
        expect(normalizeDoc('nope').cards.length).toBeGreaterThan(0);
        expect(normalizeBlock(42).type).toBe('text');
        expect(normalizeBlock({ type: 'divider' })).toMatchObject({ type: 'divider' });
    });
});

describe('generateDocFromPrompt', () => {
    it('parses a fenced JSON reply into an IDoc with N cards', async () => {
        const reply = '```json\n' + JSON.stringify({
            title: 'Onboarding', description: 'd',
            cards: Array.from({ length: 4 }, (_, i) => ({ title: `Card ${i + 1}`, layout: i === 0 ? 'hero' : 'default', blocks: [{ type: 'text', md: 'hi' }, { type: 'callout', tone: 'info', md: 'x' }] })),
        }) + '\n```';
        const callLlmFn = vi.fn().mockResolvedValue({ text: reply, provider: 'openai', model: 'm' });
        const doc = await generateDocFromPrompt('make an onboarding doc', { cards: 4 }, LLM_ON, callLlmFn);
        expect(doc).not.toBeNull();
        expect(doc!.title).toBe('Onboarding');
        expect(doc!.cards).toHaveLength(4);
        expect(doc!.cards[0].layout).toBe('hero');
        expect(callLlmFn).toHaveBeenCalledTimes(1);
        const req = callLlmFn.mock.calls[0][0];
        expect(req.systemPrompt).toContain('Exactly 4 cards');
        expect(req.responseFormat).toBe('json');
    });

    it('returns null when no LLM is active (and never calls the model)', async () => {
        const callLlmFn = vi.fn();
        expect(await generateDocFromPrompt('x', {}, LLM_OFF, callLlmFn)).toBeNull();
        expect(await generateDocFromText('x', {}, LLM_OFF, callLlmFn)).toBeNull();
        expect(await rewriteBlockMd('x', 'shorten', LLM_OFF, callLlmFn)).toBeNull();
        expect(callLlmFn).not.toHaveBeenCalled();
    });

    it('returns null on unparsable reply; empty prompt short-circuits', async () => {
        const callLlmFn = vi.fn().mockResolvedValue({ text: 'sorry, no', provider: 'openai', model: 'm' });
        expect(await generateDocFromPrompt('x', {}, LLM_ON, callLlmFn)).toBeNull();
        expect(await generateDocFromPrompt('   ', {}, LLM_ON, callLlmFn)).toBeNull();
    });

    it('generateDocFromText truncates >12k chars with a note', async () => {
        const callLlmFn = vi.fn().mockResolvedValue({ text: '{"title":"T","cards":[{"title":"a","blocks":[]}]}', provider: 'openai', model: 'm' });
        await generateDocFromText('x'.repeat(20_000), {}, LLM_ON, callLlmFn);
        const prompt: string = callLlmFn.mock.calls[0][0].prompt;
        expect(prompt).toContain('[Source truncated at 12000 chars]');
        expect(prompt.length).toBeLessThan(13_000);
    });

    it('rewriteBlockMd strips fences and returns text', async () => {
        const callLlmFn = vi.fn().mockResolvedValue({ text: '```markdown\nShorter.\n```', provider: 'openai', model: 'm' });
        expect(await rewriteBlockMd('A long paragraph.', 'shorten', LLM_ON, callLlmFn)).toBe('Shorter.');
    });

    it('puts amount / audience / language / tone in the system prompt and lists all 24 block types', async () => {
        const callLlmFn = vi.fn().mockResolvedValue({ text: '{"title":"T","cards":[{"title":"a","blocks":[]}]}', provider: 'openai', model: 'm' });
        const doc = await generateDocFromPrompt('x', { cards: 3, amount: 'brief', audience: 'owners', language: 'Spanish', tone: 'friendly' }, LLM_ON, callLlmFn);
        const sys: string = callLlmFn.mock.calls[0][0].systemPrompt;
        expect(sys).toContain('Exactly 3 cards');
        expect(sys).toContain('2-3 blocks per card');
        expect(sys).toContain('Audience: owners');
        expect(sys).toContain('Tone: friendly');
        expect(sys).toContain('in Spanish');
        for (const t of BLOCK_TYPES) expect(sys).toContain(`"type":"${t}"`);
        expect(sys).toContain('"children"');
        expect(doc!.language).toBe('Spanish');
        expect(doc!.dir).toBe('ltr');
    });

    it('RTL language sets dir=rtl; dirForLanguage covers names and codes', async () => {
        const callLlmFn = vi.fn().mockResolvedValue({ text: '{"title":"T","cards":[{"title":"a","blocks":[]}]}', provider: 'openai', model: 'm' });
        const doc = await generateDocFromPrompt('x', { language: 'Arabic' }, LLM_ON, callLlmFn);
        expect(doc!.dir).toBe('rtl');
        expect(dirForLanguage('he')).toBe('rtl');
        expect(dirForLanguage('Hebrew')).toBe('rtl');
        expect(dirForLanguage('French')).toBe('ltr');
        expect(dirForLanguage(undefined)).toBeUndefined();
    });

    it('>12 cards → outline call then ≤10-card batches, merged in order (cap 30)', async () => {
        const outline = { title: 'Big', description: 'd', cards: Array.from({ length: 25 }, (_, i) => ({ title: `Sec ${i + 1}`, goal: `cover ${i + 1}` })) };
        const callLlmFn = vi.fn().mockImplementation(async (req: { prompt: string; systemPrompt: string }) => {
            if (req.systemPrompt.includes('planning')) return { text: JSON.stringify(outline), provider: 'openai', model: 'm' };
            const m = req.prompt.match(/Write cards (\d+)-(\d+):/)!;
            const from = Number(m[1]); const to = Number(m[2]);
            const cards = Array.from({ length: to - from + 1 }, (_, k) => ({ title: `Sec ${from + k}`, layout: 'default', blocks: [{ type: 'steps', items: [{ title: 's', md: 'm' }] }] }));
            return { text: JSON.stringify({ cards }), provider: 'openai', model: 'm' };
        });
        const doc = await generateDocFromPrompt('long thing', { cards: 25, language: 'fa' }, LLM_ON, callLlmFn);
        expect(callLlmFn).toHaveBeenCalledTimes(1 + 3); // outline + 10 + 10 + 5
        expect(doc!.title).toBe('Big');
        expect(doc!.cards).toHaveLength(25);
        expect(doc!.cards[0].title).toBe('Sec 1');
        expect(doc!.cards[24].title).toBe('Sec 25');
        expect(doc!.cards[12].blocks[0].type).toBe('steps');
        expect(doc!.dir).toBe('rtl');
        expect(callLlmFn.mock.calls[1][0].systemPrompt).toContain(BLOCK_CONTRACT.slice(0, 40));
    });

    it('outline-first: a failed batch keeps title-only stubs; cards>30 is capped', async () => {
        const callLlmFn = vi.fn().mockImplementation(async (req: { prompt: string; systemPrompt: string }) => {
            if (req.systemPrompt.includes('planning')) return { text: JSON.stringify({ title: 'X', cards: Array.from({ length: 40 }, (_, i) => ({ title: `S${i}` })) }), provider: 'openai', model: 'm' };
            return req.prompt.includes('Write cards 1-10:') ? { text: JSON.stringify({ cards: [{ title: 'S0', blocks: [{ type: 'text', md: 'ok' }] }] }), provider: 'openai', model: 'm' } : { text: 'garbage', provider: 'openai', model: 'm' };
        });
        const doc = await generateDocFromPrompt('x', { cards: 99 }, LLM_ON, callLlmFn);
        expect(doc!.cards).toHaveLength(30);
        expect(doc!.cards[0].blocks[0]).toMatchObject({ type: 'text', md: 'ok' });
        expect(doc!.cards[1].blocks).toEqual([]);
        expect(doc!.cards[29].title).toBe('S29');
    });

    it('normalizeCard keeps children / background / notes / footnotes; normalizeDoc keeps a valid theme + isTemplate', () => {
        const doc = normalizeDoc({
            title: 'T', theme: 'midnight', isTemplate: true, language: 'ar',
            cards: [{ title: 'P', notes: 'speaker', background: { color: '#000', overlay: 'faded', intensity: 500 }, footnotes: [{ text: 'fn1' }, 'fn2'],
                children: [{ title: 'K', blocks: [{ type: 'boxes', columns: 9, items: [{ title: 'b' }] }], children: [{ title: 'KK', children: [{ title: 'KKK' }] }] }] }],
        });
        expect(doc.theme).toBe('midnight');
        expect(doc.isTemplate).toBe(true);
        expect(doc.dir).toBe('rtl');
        const c = doc.cards[0];
        expect(c.notes).toBe('speaker');
        expect(c.background).toEqual({ color: '#000', image: undefined, overlay: 'faded', intensity: 100, align: undefined });
        expect(c.footnotes?.map((f) => f.text)).toEqual(['fn1', 'fn2']);
        expect(c.children?.[0].title).toBe('K');
        expect(c.children?.[0].blocks[0]).toMatchObject({ type: 'boxes', columns: 3 });
        expect(c.children?.[0].children?.[0].title).toBe('KK');
        expect(c.children?.[0].children?.[0].children).toBeUndefined(); // depth guard
        expect(normalizeDoc({ title: 'x', theme: 'nope' }).theme).toBe('inherit');
    });
});

describe('built-in templates', () => {
    it('ships 6 property-manager templates, each 4–6 cards with only known block types', () => {
        expect(BUILTIN_TEMPLATES).toHaveLength(6);
        const seen = new Set<string>();
        for (const tpl of BUILTIN_TEMPLATES) {
            const doc = docFromTemplate(tpl);
            expect(doc.isTemplate).toBe(false);
            expect(doc.cards.length).toBeGreaterThanOrEqual(4);
            expect(doc.cards.length).toBeLessThanOrEqual(6);
            const rawBlocks = (tpl.doc as { cards: { blocks: { type: string }[] }[] }).cards.flatMap((c) => c.blocks);
            for (const b of rawBlocks) { expect(BLOCK_TYPES).toContain(b.type); seen.add(b.type); }
            expect(docFromTemplate(tpl).id).not.toBe(doc.id);
        }
        for (const t of ['steps', 'boxes', 'funnel', 'quiz', 'timeline', 'chart', 'diagram', 'table', 'accordion']) expect(seen.has(t)).toBe(true);
    });
});

describe('parseJsonLoose', () => {
    it('tolerates fences and leading prose', () => {
        expect(parseJsonLoose('Sure! ```json\n{"a":1}\n```')).toEqual({ a: 1 });
        expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
        expect(parseJsonLoose('nope')).toBeNull();
    });
});

describe('embedSrcFor', () => {
    it.each([
        ['https://www.youtube.com/watch?v=abc123', 'https://www.youtube.com/embed/abc123', 'youtube'],
        ['https://youtu.be/xyz789', 'https://www.youtube.com/embed/xyz789', 'youtube'],
        ['https://www.youtube.com/shorts/sh0rt', 'https://www.youtube.com/embed/sh0rt', 'youtube'],
        ['https://vimeo.com/123456', 'https://player.vimeo.com/video/123456', 'vimeo'],
        ['https://www.loom.com/share/abcDEF123', 'https://www.loom.com/embed/abcDEF123', 'loom'],
        ['https://docs.google.com/document/d/ID/edit?usp=sharing', 'https://docs.google.com/document/d/ID/preview', 'google-docs'],
        ['https://docs.google.com/spreadsheets/d/ID/edit#gid=0', 'https://docs.google.com/spreadsheets/d/ID/preview', 'google-sheets'],
        ['https://www.google.com/maps/embed?pb=!1m18', 'https://www.google.com/maps/embed?pb=!1m18', 'google-maps'],
        ['https://airtable.com/shrXYZ', 'https://airtable.com/embed/shrXYZ', 'airtable'],
        ['https://miro.com/app/board/uXj=/', 'https://miro.com/app/live-embed/uXj=/', 'miro'],
        ['https://open.spotify.com/track/abc', 'https://open.spotify.com/embed/track/abc', 'spotify'],
        ['https://calendly.com/me/30min', 'https://calendly.com/me/30min', 'calendly'],
        ['https://form.typeform.com/to/abc', 'https://form.typeform.com/to/abc', 'typeform'],
        ['https://example.com/file.pdf', 'https://example.com/file.pdf', 'pdf'],
        ['https://example.com/page', 'https://example.com/page', 'web'],
        // wave 1
        ['https://www.tiktok.com/@someone/video/7234567890123456789', 'https://www.tiktok.com/embed/v2/7234567890123456789', 'tiktok'],
        ['https://acme.wistia.com/medias/abc123xyz', 'https://fast.wistia.net/embed/iframe/abc123xyz', 'wistia'],
        ['https://form.jotform.com/240012345678901', 'https://form.jotform.com/240012345678901', 'jotform'],
        ['https://www.instagram.com/p/CxYz123/', 'https://www.instagram.com/p/CxYz123/embed', 'instagram'],
        ['https://www.instagram.com/reel/CxYz456/?utm_source=x', 'https://www.instagram.com/p/CxYz456/embed', 'instagram'],
        ['https://x.com/someone/status/1234567890', 'https://platform.twitter.com/embed/Tweet.html?id=1234567890', 'x'],
        ['https://twitter.com/someone/status/987?s=20', 'https://platform.twitter.com/embed/Tweet.html?id=987', 'x'],
        ['https://onedrive.live.com/embed?resid=ABC&authkey=xyz', 'https://onedrive.live.com/embed?resid=ABC&authkey=xyz', 'office-365'],
        ['https://contoso.sharepoint.com/:p:/r/sites/x/Doc.pptx?action=embedview', 'https://contoso.sharepoint.com/:p:/r/sites/x/Doc.pptx?action=embedview', 'office-365'],
        ['https://app.powerbi.com/view?r=eyJrIjoi', 'https://app.powerbi.com/view?r=eyJrIjoi', 'power-bi'],
        ['https://public.tableau.com/views/Book1/Dash', 'https://public.tableau.com/views/Book1/Dash?:showVizHome=no&:embed=true', 'tableau'],
        ['https://public.tableau.com/views/Book1/Dash?:language=en', 'https://public.tableau.com/views/Book1/Dash?:language=en&:showVizHome=no&:embed=true', 'tableau'],
        ['https://drive.google.com/file/d/1AbCdEf/view?usp=sharing', 'https://drive.google.com/file/d/1AbCdEf/preview', 'google-drive'],
    ])('%s → %s (%s)', (input, src, provider) => {
        const r = embedSrcFor(input);
        expect(r).not.toBeNull();
        expect(r!.src).toBe(src);
        expect(r!.provider).toBe(provider);
    });

    it('figma wraps the url; plain maps links become output=embed', () => {
        expect(embedSrcFor('https://www.figma.com/file/ABC/Design')!.src).toBe(`https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent('https://www.figma.com/file/ABC/Design')}`);
        expect(embedSrcFor('https://www.google.com/maps/place/Eiffel+Tower')!.src).toBe('https://www.google.com/maps?q=Eiffel%20Tower&output=embed');
    });

    it('new providers without an id yield null (no half-built iframes)', () => {
        expect(embedSrcFor('https://www.tiktok.com/@someone')).toBeNull();
        expect(embedSrcFor('https://x.com/someone')).toBeNull();
        expect(embedSrcFor('https://www.instagram.com/someone/')).toBeNull();
        expect(embedSrcFor('https://acme.wistia.com/')).toBeNull();
    });

    it('rejects javascript:, data:, and garbage', () => {
        expect(embedSrcFor('javascript:alert(1)')).toBeNull();
        expect(embedSrcFor('data:text/html,hi')).toBeNull();
        expect(embedSrcFor('not a url')).toBeNull();
        expect(embedSrcFor('')).toBeNull();
    });
});

describe('heuristics', () => {
    it('suggestThemeFor maps keywords', () => {
        expect(suggestThemeFor('Q3 Revenue Review')).toBe('slate');
        expect(suggestThemeFor('Community garden plan')).toBe('forest');
        expect(suggestThemeFor('Random topic')).toBe('inherit');
    });
    it('docFromMarkdownHeadings splits on # / ##', () => {
        const d = docFromMarkdownHeadings('# Intro\nhello\n## Part A\nbody a\n## Part B\nbody b');
        expect(d.cards.map((c) => c.title)).toEqual(['Intro', 'Part A', 'Part B']);
        expect(d.cards[1].blocks[0]).toMatchObject({ type: 'text', md: 'body a' });
    });
});
