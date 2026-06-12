/**
 * llmUsageStore — P12-1 AI-spend ledger (gap item 6, 2026-06-12).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    llmUsageStore,
    llmUsageUserIdHolder,
    recordLlmUsage,
    lastNDays,
    todayRollup,
    planAdvice,
    estimateCost,
    clearLlmUsage,
    resetLlmUsage,
} from '../lib/llmUsageStore';

beforeEach(() => {
    llmUsageUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    resetLlmUsage();
});

describe('recordLlmUsage', () => {
    it('appends an entry and rolls up the day', () => {
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-4-6', promptChars: 4000, responseChars: 2000 });
        recordLlmUsage({ provider: 'openai', model: 'gpt-4o-mini', promptChars: 400, responseChars: 100 });
        const ledger = llmUsageStore.getSnapshot();
        expect(ledger.entries).toHaveLength(2);
        const today = todayRollup(ledger);
        expect(today.calls).toBe(2);
        expect(today.estIn).toBe(1000 + 100);
        expect(today.estOut).toBe(500 + 25);
        expect(today.estCost).toBeGreaterThan(0);
        expect(today.byProvider.anthropic?.calls).toBe(1);
        expect(today.byProvider.openai?.calls).toBe(1);
    });

    it('never throws — even with a broken localStorage', () => {
        expect(() => recordLlmUsage({ provider: 'local', model: 'llama', promptChars: 10, responseChars: 10 })).not.toThrow();
    });
});

describe('pricing', () => {
    it('sonnet > haiku > local for the same tokens', () => {
        const sonnet = estimateCost('claude-sonnet-4-6', 1000, 1000, 'anthropic');
        const haiku = estimateCost('claude-haiku-4-5', 1000, 1000, 'anthropic');
        expect(sonnet).toBeGreaterThan(haiku);
        expect(estimateCost('anything', 1000, 1000, 'local')).toBe(0);
    });
});

describe('read helpers', () => {
    it('lastNDays returns N zero-filled rollups, today last', () => {
        recordLlmUsage({ provider: 'gemini', model: 'gemini-flash', promptChars: 100, responseChars: 100 });
        const days = lastNDays(7);
        expect(days).toHaveLength(7);
        expect(days[6].calls).toBe(1);
        expect(days[0].calls).toBe(0);
    });

    it('planAdvice speaks to empty and active weeks', () => {
        expect(planAdvice()).toContain('No LLM usage');
        recordLlmUsage({ provider: 'anthropic', model: 'claude-opus-4', promptChars: 400_000, responseChars: 200_000 });
        expect(planAdvice()).toMatch(/\$\d/);
    });

    it('clear empties everything', () => {
        recordLlmUsage({ provider: 'openai', model: 'gpt-4o', promptChars: 100, responseChars: 100 });
        clearLlmUsage();
        expect(llmUsageStore.getSnapshot().entries).toHaveLength(0);
        expect(todayRollup().calls).toBe(0);
    });
});
