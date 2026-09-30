/**
 * cliUsage — plan 068 Phase 3. Mutation-check discipline: each test breaks
 * the piece of lib/cliUsage.ts it names and confirms it fails first.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { parseCliUsageStats, useClaudeCodeUsage } from '../lib/cliUsage';

const REAL_DEV = import.meta.env.DEV;
afterEach(() => {
    import.meta.env.DEV = REAL_DEV;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function setDev(value: boolean) {
    import.meta.env.DEV = value;
}

const STATS_NO_MODEL = {
    generated_at: '2026-09-25T00:00:00Z',
    totals: {
        fresh_input_tokens: 100_000,
        cache_read_tokens: 2_000_000,
        cache_creation_tokens: 50_000,
        output_tokens: 20_000,
    },
};

describe('parseCliUsageStats — pure parser', () => {
    it('parses totals from a well-formed payload (breaks if any field is dropped)', () => {
        const usage = parseCliUsageStats(STATS_NO_MODEL);
        expect(usage).not.toBeNull();
        expect(usage!.totals).toEqual({
            freshInputTokens: 100_000,
            cacheReadTokens: 2_000_000,
            cacheCreationTokens: 50_000,
            outputTokens: 20_000,
        });
    });

    it('labels the period from generated_at (breaks if the date is ignored)', () => {
        const usage = parseCliUsageStats(STATS_NO_MODEL);
        expect(usage!.periodLabel).toContain('as of');
    });

    it('falls back to "all time" when generated_at is missing/garbage', () => {
        const usage = parseCliUsageStats({ totals: STATS_NO_MODEL.totals });
        expect(usage!.periodLabel).toBe('all time');
    });

    it('returns null for garbage JSON (not an object)', () => {
        expect(parseCliUsageStats('not json')).toBeNull();
        expect(parseCliUsageStats(null)).toBeNull();
        expect(parseCliUsageStats([1, 2, 3])).toBeNull();
    });

    it('returns null when totals is missing entirely', () => {
        expect(parseCliUsageStats({ generated_at: 'x' })).toBeNull();
    });

    it('tolerates missing/garbage individual token fields (coerces to 0)', () => {
        const usage = parseCliUsageStats({
            totals: { fresh_input_tokens: 'oops', cache_read_tokens: null },
        });
        expect(usage!.totals).toEqual({
            freshInputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 0,
        });
    });

    it('apiEquivalentUsd is null when no model is named (never guesses)', () => {
        const usage = parseCliUsageStats(STATS_NO_MODEL);
        expect(usage!.apiEquivalentUsd).toBeNull();
    });

    it('computes apiEquivalentUsd from priceFor when a model IS named', () => {
        // claude-sonnet-5: inPerM 2, outPerM 10, no cacheReadPerM/cacheWritePerM
        // in the table -> 0.1x input for cache read, 1.25x input for cache write.
        const usage = parseCliUsageStats({
            model: 'claude-sonnet-5',
            totals: {
                fresh_input_tokens: 1_000_000,
                cache_read_tokens: 1_000_000,
                cache_creation_tokens: 1_000_000,
                output_tokens: 1_000_000,
            },
        });
        // fresh: 1M * $2 = $2
        // cache read: 1M * ($2 * 0.1) = $0.20
        // cache write: 1M * ($2 * 1.25) = $2.50
        // output: 1M * $10 = $10
        // total = $14.70
        expect(usage!.apiEquivalentUsd).toBeCloseTo(14.7, 2);
    });

    it('apiEquivalentUsd is null for an unpriced/unknown model (never guesses)', () => {
        const usage = parseCliUsageStats({ model: 'totally-unknown-model', totals: STATS_NO_MODEL.totals });
        expect(usage!.apiEquivalentUsd).toBeNull();
    });
});

describe('useClaudeCodeUsage — dev gating + fetch', () => {
    it('returns null in production and never fetches', async () => {
        setDev(false);
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const { result } = renderHook(() => useClaudeCodeUsage());

        expect(result.current).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null when the stats file is missing (404)', async () => {
        setDev(true);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

        const { result } = renderHook(() => useClaudeCodeUsage());

        await waitFor(() => expect(result.current).toBeNull());
    });

    it('returns null on garbage JSON from the fetch', async () => {
        setDev(true);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve('garbage') }));

        const { result } = renderHook(() => useClaudeCodeUsage());

        await waitFor(() => {
            // still resolved (no perpetual loading state) but parsed to null
            expect(fetchWasCalled()).toBe(true);
        });
        expect(result.current).toBeNull();

        function fetchWasCalled() {
            return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length > 0;
        }
    });

    it('parses real totals from a successful dev fetch', async () => {
        setDev(true);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(STATS_NO_MODEL) }));

        const { result } = renderHook(() => useClaudeCodeUsage());

        await waitFor(() => expect(result.current).not.toBeNull());
        expect(result.current!.totals.freshInputTokens).toBe(100_000);
        expect(result.current!.apiEquivalentUsd).toBeNull();
    });
});
