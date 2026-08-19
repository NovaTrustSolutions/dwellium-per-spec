/**
 * Interactive Docs — outline-first "Create with Agent": normalizeOutline coercion,
 * generateOutline (fenced JSON, presets in prompt), generateFromOutline batches of ≤6
 * honoring titles + progress + stub fallback, research via injected search runner →
 * grounding + Sources card, last-outline cache. Real timers only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    OUTLINE_BATCH, LAST_OUTLINE_KEY, STYLE_PRESETS, canResearch, generateFromOutline, generateOutline, loadLastOutline,
    loadRecentOutlines, normalizeOutline, parseSources, researchTopic, saveLastOutline, sourcesCard, type DocOutline,
} from '../components/Scribe/idocs/idocsOutline';
import type { LlmBundle } from '../components/Scribe/idocs/idocsAi';

const LLM_ON = { active: 'openai', openai: { enabled: true, apiKey: 'sk-test', model: 'gpt-x' } } as unknown as LlmBundle;
const LLM_OFF = { active: null } as unknown as LlmBundle;
const reply = (obj: unknown) => ({ text: JSON.stringify(obj), provider: 'openai', model: 'm' });

beforeEach(() => localStorage.clear());

describe('normalizeOutline', () => {
    it('coerces titles, bullets (array / newline string / goal), hints; drops title-less cards; never throws', () => {
        const o = normalizeOutline({
            title: ' Plan ', description: 'd',
            cards: [
                { title: 'A', bullets: ['- one', '• two', ''], layoutHint: 'hero', blocksHint: ['chart', 'nope', 'text'] },
                { heading: 'B', points: 'x\ny' },
                { title: 'C', goal: 'cover c', layout: 'weird' },
                { bullets: ['no title'] },
                'D as string',
            ],
        });
        expect(o.title).toBe('Plan');
        expect(o.cards.map((c) => c.title)).toEqual(['A', 'B', 'C', 'D as string']);
        expect(o.cards[0]).toEqual({ title: 'A', bullets: ['one', 'two'], layoutHint: 'hero', blocksHint: ['chart', 'text'] });
        expect(o.cards[1].bullets).toEqual(['x', 'y']);
        expect(o.cards[2]).toEqual({ title: 'C', bullets: ['cover c'] });
        expect(normalizeOutline(null)).toEqual({ title: 'Untitled doc', description: '', cards: [] });
        expect(normalizeOutline('garbage').cards).toEqual([]);
    });
});

describe('generateOutline', () => {
    it('parses fenced JSON, caps at opts.cards, puts the preset hint + source in the prompts; null when off / empty', async () => {
        const callLlmFn = vi.fn().mockResolvedValue({ text: '```json\n' + JSON.stringify({ title: 'T', description: 'D', cards: [{ title: 'One', bullets: ['a'] }, { title: 'Two', bullets: ['b'] }, { title: 'Three', bullets: ['c'] }] }) + '\n```', provider: 'openai', model: 'm' });
        const out = await generateOutline({ prompt: 'topic', sourceText: 'SOURCE TEXT' }, { cards: 2, preset: 'consultant', tone: 'crisp' }, LLM_ON, callLlmFn);
        expect(out).toEqual({ title: 'T', description: 'D', cards: [{ title: 'One', bullets: ['a'] }, { title: 'Two', bullets: ['b'] }] });
        const req = callLlmFn.mock.calls[0][0] as { prompt: string; systemPrompt: string; responseFormat: string };
        expect(req.systemPrompt).toContain('Exactly 2 cards');
        expect(req.systemPrompt).toContain(STYLE_PRESETS.consultant.hint);
        expect(req.systemPrompt).toContain('Tone: crisp');
        expect(req.prompt).toContain('topic');
        expect(req.prompt).toContain('<source>\nSOURCE TEXT');
        expect(req.responseFormat).toBe('json');
        const spy = vi.fn();
        expect(await generateOutline({ prompt: 'x' }, {}, LLM_OFF, spy)).toBeNull();
        expect(await generateOutline({ prompt: '  ' }, {}, LLM_ON, spy)).toBeNull();
        expect(spy).not.toHaveBeenCalled();
        expect(await generateOutline({ prompt: 'x' }, {}, LLM_ON, vi.fn().mockResolvedValue({ text: 'nope', provider: 'openai', model: 'm' }))).toBeNull();
    });
});

const outline8: DocOutline = {
    title: 'Big doc', description: 'desc',
    cards: Array.from({ length: 8 }, (_, i) => ({ title: `Sec ${i + 1}`, bullets: [`point ${i + 1}a`, `point ${i + 1}b`], ...(i === 0 ? { layoutHint: 'hero' as const, blocksHint: ['callout' as const] } : {}) })),
};

describe('generateFromOutline', () => {
    it('writes cards in batches of ≤6 with outline titles fixed, bullets in the prompt, progress callbacks, normalized doc', async () => {
        const callLlmFn = vi.fn().mockImplementation(async (req: { prompt: string }) => {
            const want = [...req.prompt.matchAll(/^\d+\. (Sec \d+)/gm)].map((m) => m[1]);
            // model renames titles + adds garbage — titles must be overridden, garbage coerced
            return reply({ cards: want.map((t) => ({ title: `RENAMED ${t}`, layout: 'split-left', blocks: [{ type: 'text', md: `body of ${t}` }, { type: 'wat' }] })) });
        });
        const progress = vi.fn();
        const doc = await generateFromOutline(outline8, { preset: 'visual', language: 'Spanish' }, LLM_ON, callLlmFn, progress);
        expect(callLlmFn).toHaveBeenCalledTimes(Math.ceil(8 / OUTLINE_BATCH)); // 6 + 2
        expect(doc!.title).toBe('Big doc');
        expect(doc!.description).toBe('desc');
        expect(doc!.language).toBe('Spanish');
        expect(doc!.dir).toBe('ltr');
        expect(doc!.cards.map((c) => c.title)).toEqual(outline8.cards.map((c) => c.title));
        expect(doc!.cards[0].layout).toBe('split-left');
        expect(doc!.cards[0].blocks.map((b) => b.type)).toEqual(['text', 'text']);
        expect(doc!.cards[7].blocks[0]).toMatchObject({ type: 'text', md: 'body of Sec 8' });
        for (const c of doc!.cards) { expect(c.id).toBeTruthy(); for (const b of c.blocks) expect(b.id).toBeTruthy(); }
        expect(progress.mock.calls).toEqual([[0, 8], [6, 8], [8, 8]]);
        const first = callLlmFn.mock.calls[0][0] as { prompt: string; systemPrompt: string };
        expect(first.prompt).toContain('Write cards 1-6:');
        expect(first.prompt).toContain('1. Sec 1 [layout: hero] [blocks: callout]\n   - point 1a\n   - point 1b');
        expect(first.prompt).toContain('Full outline (context): 1. Sec 1; 2. Sec 2');
        expect(first.systemPrompt).toContain(STYLE_PRESETS.visual.hint);
        expect(first.systemPrompt).toContain('Language: write ALL text');
        expect((callLlmFn.mock.calls[1][0] as { prompt: string }).prompt).toContain('Write cards 7-8:');
    });

    it('a failed batch keeps bullet stubs (title + hint layout); all failed → null; no LLM → null without calls', async () => {
        let n = 0;
        const callLlmFn = vi.fn().mockImplementation(async () => (n++ === 0 ? null : reply({ cards: [{ blocks: [{ type: 'text', md: 'ok7' }] }, { blocks: [{ type: 'text', md: 'ok8' }] }] })));
        const doc = await generateFromOutline(outline8, {}, LLM_ON, callLlmFn);
        expect(doc!.cards).toHaveLength(8);
        expect(doc!.cards[0]).toMatchObject({ title: 'Sec 1', layout: 'hero' });
        expect(doc!.cards[0].blocks[0]).toMatchObject({ type: 'text', md: '- point 1a\n- point 1b' });
        expect(doc!.cards[6].blocks[0]).toMatchObject({ md: 'ok7' });
        expect(await generateFromOutline(outline8, {}, LLM_ON, vi.fn().mockResolvedValue(null))).toBeNull();
        expect(await generateFromOutline(outline8, {}, LLM_ON, vi.fn().mockRejectedValue(new Error('boom')))).toBeNull();
        const spy = vi.fn();
        expect(await generateFromOutline(outline8, {}, LLM_OFF, spy)).toBeNull();
        expect(await generateFromOutline({ title: 'x', description: '', cards: [] }, {}, LLM_ON, spy)).toBeNull();
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('research', () => {
    const skillText = 'Answer text here.\n\nSources:\n- [Acme Guide](https://acme.example/guide)\n  A great guide.\n- [Wiki](https://wiki.example/x)\n- [Acme Guide](https://acme.example/guide)';

    it('parseSources: markdown links → dedup, cap 5, snippet from the indented line', () => {
        expect(parseSources(skillText)).toEqual([{ title: 'Acme Guide', url: 'https://acme.example/guide', snippet: 'A great guide.' }, { title: 'Wiki', url: 'https://wiki.example/x', snippet: undefined }]);
        expect(parseSources(Array.from({ length: 9 }, (_, i) => `[t${i}](https://h.example/${i})`).join(' '))).toHaveLength(5);
    });

    it('canResearch: tavily/brave/anthropic keys enable it', () => {
        expect(canResearch({ llm: LLM_ON, search: { active: null } })).toBe(false);
        expect(canResearch({ llm: LLM_ON, search: { active: 'tavily', tavily: { apiKey: 'tv', enabled: true } } })).toBe(true);
        expect(canResearch({ llm: LLM_ON, search: { active: 'brave', brave: { apiKey: 'br', enabled: false } } })).toBe(false);
        expect(canResearch({ llm: { ...LLM_ON, anthropic: { apiKey: 'a', enabled: true } } as unknown as LlmBundle })).toBe(true);
    });

    it('researchTopic via injected runner → grounding text + sources; null when not ok / no-live-web / throws', async () => {
        const runSearch = vi.fn().mockResolvedValue({ ok: true, text: skillText, via: 'tavily' });
        const r = await researchTopic('  best HVAC maintenance schedule ', { llm: LLM_ON }, runSearch);
        expect(runSearch).toHaveBeenCalledWith('best HVAC maintenance schedule', { llm: LLM_ON });
        expect(r).toMatchObject({ query: 'best HVAC maintenance schedule', via: 'tavily' });
        expect(r!.sources).toHaveLength(2);
        expect(await researchTopic('x', { llm: LLM_ON }, vi.fn().mockResolvedValue({ ok: false, text: '', via: 'web-search' }))).toBeNull();
        expect(await researchTopic('x', { llm: LLM_ON }, vi.fn().mockResolvedValue({ ok: true, text: 'guess', via: 'openai (no live web)' }))).toBeNull();
        expect(await researchTopic('x', { llm: LLM_ON }, vi.fn().mockRejectedValue(new Error('net')))).toBeNull();
        expect(await researchTopic('   ', { llm: LLM_ON }, runSearch)).toBeNull();
    });

    it('research on generateFromOutline: snippets in every prompt + a final "Sources" card with links', async () => {
        const research = (await researchTopic('hvac', { llm: LLM_ON }, vi.fn().mockResolvedValue({ ok: true, text: skillText, via: 'brave' })))!;
        const callLlmFn = vi.fn().mockResolvedValue(reply({ cards: [{ blocks: [{ type: 'text', md: 'a' }] }] }));
        const doc = await generateFromOutline({ title: 'HVAC', description: '', cards: [{ title: 'Only', bullets: ['x'] }] }, { research }, LLM_ON, callLlmFn);
        expect((callLlmFn.mock.calls[0][0] as { prompt: string }).prompt).toContain('<research>\nAnswer text here.');
        expect(doc!.cards.map((c) => c.title)).toEqual(['Only', 'Sources']);
        const src = doc!.cards[1].blocks[0];
        expect(src.type === 'text' && src.md).toContain('[Acme Guide](https://acme.example/guide) — A great guide.');
        expect(src.type === 'text' && src.md).toContain('[Wiki](https://wiki.example/x)');
        expect(doc!.cards[1].blocks[1]).toMatchObject({ type: 'callout', md: 'Researched via brave for “hvac”.' });
        // outline prompt also gets grounding
        const oFn = vi.fn().mockResolvedValue(reply({ title: 'T', cards: [{ title: 'A', bullets: [] }] }));
        await generateOutline({ prompt: 'hvac' }, { research }, LLM_ON, oFn);
        expect((oFn.mock.calls[0][0] as { prompt: string }).prompt).toContain('<research>');
        // no links → falls back to the raw text
        expect(sourcesCard({ query: 'q', via: 'v', text: 'plain', sources: [] }).blocks[0]).toMatchObject({ type: 'text', md: 'plain' });
    });
});

describe('outline cache', () => {
    it('saveLastOutline → loadLastOutline round-trips under scribe-idocs:last-outline; recent list dedups by title, caps 5', () => {
        expect(loadLastOutline()).toBeNull();
        saveLastOutline(outline8, { preset: 'minimal', cards: 8 });
        expect(JSON.parse(localStorage.getItem(LAST_OUTLINE_KEY)!).outline.title).toBe('Big doc');
        const last = loadLastOutline()!;
        expect(last.outline).toEqual(outline8);
        expect(last.opts).toMatchObject({ preset: 'minimal', cards: 8, research: null });
        for (let i = 0; i < 6; i++) saveLastOutline({ ...outline8, title: `T${i}` }, {});
        saveLastOutline({ ...outline8, title: 'T5' }, {});
        const recent = loadRecentOutlines();
        expect(recent).toHaveLength(5);
        expect(recent.map((r) => r.outline.title)).toEqual(['T5', 'T4', 'T3', 'T2', 'T1']);
        localStorage.setItem(LAST_OUTLINE_KEY, '{not json');
        expect(loadLastOutline()).toBeNull();
    });
});
