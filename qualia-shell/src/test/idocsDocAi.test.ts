/**
 * Interactive Docs — doc-level AI actions: each returns a NEW normalized doc,
 * translate sets language/dir, summarize inserts at 0, regenerateCard keeps id,
 * restyle keeps structure/ids, DOC_AI_ACTIONS catalog shape.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    DOC_AI_ACTIONS, addCardWithAi, regenerateCard, restyleDoc, summarizeDocToCard, translateDoc,
} from '../components/Scribe/idocs/idocsDocAi';
import { normalizeDoc, type LlmBundle } from '../components/Scribe/idocs/idocsAi';

const LLM_ON = { active: 'openai', openai: { enabled: true, apiKey: 'sk-test', model: 'gpt-x' } } as unknown as LlmBundle;
const LLM_OFF = { active: null } as unknown as LlmBundle;
const reply = (obj: unknown) => ({ text: JSON.stringify(obj), provider: 'openai', model: 'm' });

const base = () => normalizeDoc({
    title: 'Owner report', description: 'Monthly',
    cards: [
        { id: 'c1', title: 'Intro', blocks: [{ id: 'b1', type: 'text', md: 'Hello **world**' }, { id: 'b2', type: 'callout', tone: 'info', md: 'Note' }] },
        { id: 'c2', title: 'Numbers', blocks: [{ id: 'b3', type: 'chart', kind: 'bar', data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }, { label: 'C', value: 3 }] }] },
    ],
});

describe('translateDoc', () => {
    it('returns a new doc with translated cards (ids kept), language + dir set; original untouched', async () => {
        const doc = base();
        const snapshot = JSON.stringify(doc);
        const callLlmFn = vi.fn().mockImplementation(async (req: { prompt: string; systemPrompt: string }) => {
            if (req.systemPrompt.startsWith('Translate the values')) return reply({ title: 'تقرير المالك', description: 'شهري' });
            const { cards } = JSON.parse(req.prompt) as { cards: { id: string; title: string; blocks: Record<string, unknown>[] }[] };
            return reply({ cards: cards.map((c) => ({ ...c, title: `AR ${c.title}`, blocks: c.blocks.map((b) => (typeof b.md === 'string' ? { ...b, md: `AR ${b.md}` } : b)) })) });
        });
        const out = await translateDoc(doc, 'Arabic', LLM_ON, callLlmFn);
        expect(out).not.toBeNull();
        expect(out).not.toBe(doc);
        expect(JSON.stringify(doc)).toBe(snapshot);
        expect(out!.title).toBe('تقرير المالك');
        expect(out!.language).toBe('Arabic');
        expect(out!.dir).toBe('rtl');
        expect(out!.id).toBe(doc.id);
        expect(out!.cards.map((c) => c.id)).toEqual(['c1', 'c2']);
        expect(out!.cards[0].blocks[0]).toMatchObject({ id: 'b1', type: 'text', md: 'AR Hello **world**' });
        expect(out!.cards[1].blocks[0]).toMatchObject({ id: 'b3', type: 'chart' });
    });

    it('null when no LLM / empty language / model garbage', async () => {
        const doc = base();
        const spy = vi.fn();
        expect(await translateDoc(doc, 'French', LLM_OFF, spy)).toBeNull();
        expect(await translateDoc(doc, '  ', LLM_ON, spy)).toBeNull();
        expect(spy).not.toHaveBeenCalled();
        expect(await translateDoc(doc, 'French', LLM_ON, vi.fn().mockResolvedValue({ text: 'nope', provider: 'openai', model: 'm' }))).toBeNull();
    });
});

describe('summarizeDocToCard', () => {
    it('inserts an "Executive summary" card at index 0 (normalized) and keeps the rest', async () => {
        const doc = base();
        const callLlmFn = vi.fn().mockResolvedValue(reply({ layout: 'hero', blocks: [{ type: 'callout', tone: 'success', md: 'TL;DR' }, { type: 'boxes', items: [{ title: 'A', md: 'a' }] }, { type: 'wat' }] }));
        const out = await summarizeDocToCard(doc, LLM_ON, callLlmFn);
        expect(out!.cards).toHaveLength(3);
        expect(out!.cards[0].title).toBe('Executive summary');
        expect(out!.cards[0].layout).toBe('hero');
        expect(out!.cards[0].blocks.map((b) => b.type)).toEqual(['callout', 'boxes', 'text']);
        expect(out!.cards[1].id).toBe('c1');
        expect(doc.cards).toHaveLength(2);
        expect(callLlmFn.mock.calls[0][0].prompt).toContain('Hello **world**');
    });
});

describe('addCardWithAi', () => {
    it('appends by default, inserts at index when given, null on empty instruction', async () => {
        const doc = base();
        const callLlmFn = vi.fn().mockResolvedValue(reply({ title: 'FAQ', blocks: [{ type: 'accordion', items: [{ title: 'Q', md: 'A' }] }] }));
        const appended = await addCardWithAi(doc, 'an FAQ', LLM_ON, callLlmFn);
        expect(appended!.cards.map((c) => c.title)).toEqual(['Intro', 'Numbers', 'FAQ']);
        const inserted = await addCardWithAi(doc, 'an FAQ', LLM_ON, callLlmFn, 1);
        expect(inserted!.cards.map((c) => c.title)).toEqual(['Intro', 'FAQ', 'Numbers']);
        expect(inserted!.cards[1].id).toBeTruthy();
        expect(await addCardWithAi(doc, '   ', LLM_ON, callLlmFn)).toBeNull();
        expect(callLlmFn.mock.calls[0][0].prompt).toContain('an FAQ');
    });
});

describe('restyleDoc', () => {
    it('rewrites md, keeps card + block ids/types/counts, batches >8 cards', async () => {
        const doc = normalizeDoc({ title: 'Big', cards: Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, title: `T${i}`, blocks: [{ id: `b${i}`, type: 'text', md: `p${i}` }] })) });
        const callLlmFn = vi.fn().mockImplementation(async (req: { prompt: string }) => {
            const { cards } = JSON.parse(req.prompt) as { cards: { title: string; blocks: { md: string }[] }[] };
            return reply({ cards: cards.map((c) => ({ title: c.title, blocks: c.blocks.map((b) => ({ type: 'text', md: `${b.md}!` })) })) }); // no ids returned on purpose
        });
        const out = await restyleDoc(doc, 'more energetic', LLM_ON, callLlmFn);
        expect(callLlmFn).toHaveBeenCalledTimes(2);
        expect(out!.cards.map((c) => c.id)).toEqual(doc.cards.map((c) => c.id));
        expect(out!.cards[10].blocks[0]).toMatchObject({ id: 'b10', md: 'p10!' });
        expect(callLlmFn.mock.calls[0][0].systemPrompt).toContain('more energetic');
    });

    it('a failed batch keeps its original cards; all failed → null', async () => {
        const doc = base();
        expect(await restyleDoc(doc, 'x', LLM_ON, vi.fn().mockResolvedValue(null))).toBeNull();
    });
});

describe('regenerateCard', () => {
    it('replaces the card in place with the same id (children/notes kept); unknown id → null', async () => {
        const doc = base();
        doc.cards[1].notes = 'keep me';
        const callLlmFn = vi.fn().mockResolvedValue(reply({ title: 'Numbers v2', layout: 'split-left', blocks: [{ type: 'steps', items: [{ title: 's1', md: 'm' }] }] }));
        const out = await regenerateCard(doc, 'c2', 'use steps', LLM_ON, callLlmFn);
        expect(out!.cards).toHaveLength(2);
        expect(out!.cards[1]).toMatchObject({ id: 'c2', title: 'Numbers v2', layout: 'split-left', notes: 'keep me' });
        expect(out!.cards[1].blocks[0].type).toBe('steps');
        expect(out!.cards[0]).toBe(doc.cards[0]);
        expect(callLlmFn.mock.calls[0][0].prompt).toContain('Instruction: use steps');
        expect(await regenerateCard(doc, 'nope', undefined, LLM_ON, callLlmFn)).toBeNull();
    });
});

describe('DOC_AI_ACTIONS catalog', () => {
    it('has the five actions with the documented shape and runs through run()', async () => {
        expect(DOC_AI_ACTIONS.map((a) => a.id)).toEqual(['summarize', 'add-card', 'translate', 'restyle', 'regenerate-card']);
        for (const a of DOC_AI_ACTIONS) { expect(typeof a.label).toBe('string'); expect(typeof a.run).toBe('function'); }
        expect(DOC_AI_ACTIONS.find((a) => a.id === 'translate')!.needsInput).toBe(true);
        expect(DOC_AI_ACTIONS.find((a) => a.id === 'regenerate-card')!.perCard).toBe(true);
        const doc = base();
        const callLlmFn = vi.fn().mockResolvedValue(reply({ title: 'Regen', blocks: [{ type: 'text', md: 'r' }] }));
        const out = await DOC_AI_ACTIONS.find((a) => a.id === 'regenerate-card')!.run(doc, 'c1|shorter', LLM_ON, callLlmFn);
        expect(out!.cards[0]).toMatchObject({ id: 'c1', title: 'Regen' });
        expect(callLlmFn.mock.calls[0][0].prompt).toContain('Instruction: shorter');
        // no LLM → every action resolves null without calling the model
        const spy = vi.fn();
        for (const a of DOC_AI_ACTIONS) expect(await a.run(doc, a.perCard ? 'c1' : 'x', LLM_OFF, spy)).toBeNull();
        expect(spy).not.toHaveBeenCalled();
    });
});
