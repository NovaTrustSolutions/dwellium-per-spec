/**
 * Interactive Docs — AI helpers: normalizeDoc coercion, generateDocFromPrompt
 * with an injected callLlmFn (fenced JSON), llm-off → null, embedSrcFor map.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    normalizeDoc, normalizeBlock, generateDocFromPrompt, generateDocFromText, rewriteBlockMd,
    embedSrcFor, suggestThemeFor, parseJsonLoose, docFromMarkdownHeadings, type LlmBundle,
} from '../components/Scribe/idocs/idocsAi';

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
