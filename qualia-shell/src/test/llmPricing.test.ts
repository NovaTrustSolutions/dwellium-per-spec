/**
 * llmPricing — plan 068. Table-driven over every id named in the plan's
 * defect-B table plus every CURATED_MODELS id, so a future price edit that
 * silently drops an id fails loudly here instead of showing up as a wrong
 * dollar amount in the widget.
 */
import { describe, it, expect } from 'vitest';
import { priceFor, perCallFeeUsd, PRICES_AS_OF } from '../lib/llmPricing';
import { CURATED_MODELS } from '../types/integrations';

describe('priceFor — anchored table', () => {
    const cases: Array<[string, 'anthropic' | 'openai' | 'gemini', number, number]> = [
        ['claude-fable-5-1', 'anthropic', 10, 50],
        ['claude-fable-5', 'anthropic', 10, 50],
        ['claude-mythos-5-1', 'anthropic', 10, 50],
        ['claude-opus-5-5', 'anthropic', 4, 20],
        ['claude-opus-5', 'anthropic', 5, 25],
        ['claude-opus-4-8', 'anthropic', 5, 25],
        ['claude-opus-4-7', 'anthropic', 5, 25],
        ['claude-opus-4-6', 'anthropic', 5, 25],
        ['claude-sonnet-5', 'anthropic', 2, 10],
        ['claude-sonnet-4-6', 'anthropic', 3, 15],
        ['claude-haiku-4-5', 'anthropic', 1, 5],
        ['gpt-4o', 'openai', 2.5, 10],
        ['gpt-4o-mini', 'openai', 0.15, 0.6],
        ['gpt-4.1', 'openai', 2, 8],
        ['gpt-4.1-mini', 'openai', 0.4, 1.6],
        ['gpt-4.1-nano', 'openai', 0.1, 0.4],
        ['o1', 'openai', 15, 60],
        ['o3', 'openai', 2, 8],
        ['o3-mini', 'openai', 1.1, 4.4],
        ['o4-mini', 'openai', 1.1, 4.4],
        ['gemini-2.5-flash', 'gemini', 0.3, 2.5],
        ['gemini-2.5-flash-lite', 'gemini', 0.1, 0.4],
        ['gemini-2.5-pro', 'gemini', 1.25, 10],
    ];

    it.each(cases)('%s (%s) → %s / %s per MTok', (model, provider, inPerM, outPerM) => {
        const p = priceFor(model, provider);
        expect(p).not.toBeNull();
        expect(p?.inPerM).toBe(inPerM);
        expect(p?.outPerM).toBe(outPerM);
    });

    it('gpt-5 family (fetched from developers.openai.com/api/docs/pricing)', () => {
        expect(priceFor('gpt-5', 'openai')).toEqual(expect.objectContaining({ inPerM: 1.25, outPerM: 10 }));
        expect(priceFor('gpt-5-mini', 'openai')).toEqual(expect.objectContaining({ inPerM: 0.25, outPerM: 2 }));
        expect(priceFor('gpt-5-nano', 'openai')).toEqual(expect.objectContaining({ inPerM: 0.05, outPerM: 0.4 }));
    });

    it('gpt-4-turbo and gpt-3.5-turbo (curated, previously UNVERIFIED — now confirmed)', () => {
        expect(priceFor('gpt-4-turbo', 'openai')).toEqual({ inPerM: 10, outPerM: 30 });
        expect(priceFor('gpt-3.5-turbo', 'openai')).toEqual({ inPerM: 0.5, outPerM: 1.5 });
    });

    it('local is always free regardless of model id', () => {
        expect(priceFor('anything-goes', 'local')).toEqual({ inPerM: 0, outPerM: 0 });
    });

    it('image models with no confirmed per-image fee are unpriced, never "free"', () => {
        expect(priceFor('dall-e-3', 'openai')).toBeNull();
        expect(priceFor('image-generation-001', 'gemini')).toBeNull();
    });

    it('strips vendor/ prefix, -latest, and a trailing -YYYYMMDD date', () => {
        expect(priceFor('anthropic/claude-sonnet-4-6', 'custom')).toEqual({ inPerM: 3, outPerM: 15 });
        expect(priceFor('claude-haiku-4-5-20251001', 'anthropic')).toEqual({ inPerM: 1, outPerM: 5 });
        expect(priceFor('gpt-4o-latest', 'openai')).toEqual({ inPerM: 2.5, outPerM: 10 });
    });

    it('anchored prefix rule catches opus-4 variants the exact map does not list, never by bare substring', () => {
        expect(priceFor('claude-opus-4-9', 'anthropic')).toEqual({ inPerM: 5, outPerM: 25 });
        // "opus" appearing anywhere must NOT match — only an anchored ^claude-opus-... id does.
        expect(priceFor('my-opus-clone', 'anthropic')).toBeNull();
    });

    it('unknown or retired ids return null, never a guessed default (defect B1)', () => {
        expect(priceFor('some-model-nobody-has-heard-of', 'openai')).toBeNull();
        // gemini-1.5-* is no longer listed on ai.google.dev/gemini-api/docs/pricing.
        expect(priceFor('gemini-1.5-flash', 'gemini')).toBeNull();
        expect(priceFor('gemini-1.5-pro', 'gemini')).toBeNull();
    });

    it('CURATED_MODELS: every id either prices or is explicitly documented as unpriced', () => {
        const knownUnpriced = new Set(['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro']);
        for (const [provider, ids] of Object.entries(CURATED_MODELS)) {
            for (const id of ids) {
                const p = priceFor(id, provider as 'anthropic' | 'openai' | 'gemini' | 'local' | 'custom');
                if (knownUnpriced.has(id)) {
                    expect(p, `${provider}/${id} expected unpriced (retired, no longer listed)`).toBeNull();
                } else {
                    expect(p, `${provider}/${id} expected a price`).not.toBeNull();
                }
            }
        }
    });

    it('PRICES_AS_OF is a dated string', () => {
        expect(PRICES_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('perCallFeeUsd', () => {
    it('Anthropic web search is $10 per 1,000 searches (confirmed platform.claude.com pricing page)', () => {
        expect(perCallFeeUsd('web_search', 'claude-sonnet-4-6')).toBeCloseTo(0.01, 6);
        expect(perCallFeeUsd('web_search', 'claude-opus-4-8')).toBeCloseTo(0.01, 6);
    });

    it('web search fee is unconfirmed (null) for non-Anthropic models', () => {
        expect(perCallFeeUsd('web_search', 'gpt-4o')).toBeNull();
    });

    it('dall-e-3 image fee is unconfirmed (null) — not listed on the current OpenAI pricing page', () => {
        expect(perCallFeeUsd('image', 'dall-e-3')).toBeNull();
    });
});
