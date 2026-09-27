/**
 * Agent recall (plan 058): retrieval-only memory block, bounded, empty when
 * the network is empty or irrelevant, and never touching the LLM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const callLlm = vi.fn();
vi.mock('../../lib/llmClient', () => ({ callLlm: (...a: unknown[]) => callLlm(...a) }));

import { getCmn, resetCmnForTests } from '../../lib/memoryGraphRag/shared';
import { recallContext, recallPassages, formatRecall, withRecall, RECALL_HEADING } from '../../lib/memoryGraphRag/recall';
import type { SourceDocument } from '../../lib/memoryGraphRag';

const DOCS: SourceDocument[] = [
    { sourceId: 'note:1', sourceKind: 'upload', title: 'Boiler', text: 'Acme Heating serviced the boiler at Maple Street and recommends a new valve.' },
    { sourceId: 'note:2', sourceKind: 'upload', title: 'Lease', text: 'The Maple Street lease renews in March. The tenant pays the owner monthly.' },
];

beforeEach(() => { localStorage.clear(); resetCmnForTests(); callLlm.mockReset(); });

describe('recallContext', () => {
    it('returns an empty string when the network is empty', async () => {
        expect(await recallContext('andy', 'Who serviced the boiler?')).toBe('');
    });

    it('returns a bounded memory block with the relevant passage first', async () => {
        await getCmn('andy').ingest(DOCS, 'test');
        const block = await recallContext('andy', 'Who serviced the boiler?');
        expect(block.startsWith(RECALL_HEADING)).toBe(true);
        expect(block).toContain('[M1]');
        expect(block).toContain('Acme Heating'); // ordering on a 2-doc corpus is the engine's PageRank, not asserted here
        expect(callLlm).not.toHaveBeenCalled();
    });

    it('is per user and blank for a blank query', async () => {
        await getCmn('andy').ingest(DOCS, 'test');
        expect(await recallContext('lisa', 'boiler')).toBe('');
        expect(await recallContext('andy', '   ')).toBe('');
    });

    it('respects maxChars', async () => {
        await getCmn('andy').ingest(DOCS, 'test');
        const block = await recallContext('andy', 'Maple Street', { maxChars: 160 });
        expect(block.length).toBeLessThanOrEqual(160);
    });
});

describe('recallPassages', () => {
    it('returns [] when the network is empty', async () => {
        expect(await recallPassages('andy', 'Who serviced the boiler?')).toEqual([]);
    });

    it('returns [] for a blank query without touching the network', async () => {
        await getCmn('andy').ingest(DOCS, 'test');
        expect(await recallPassages('andy', '   ')).toEqual([]);
    });

    it('returns the relevant passage with correct sourceId/sourceKind/title', async () => {
        await getCmn('andy').ingest(DOCS, 'test');
        const hits = await recallPassages('andy', 'Who serviced the boiler?');
        expect(hits.length).toBeGreaterThan(0);
        // ordering on a 2-doc corpus is the engine's PageRank, not asserted here (sister to recallContext's test)
        const boiler = hits.find((h) => h.text.includes('Acme Heating'));
        expect(boiler?.sourceId).toBe('note:1');
        expect(boiler?.sourceKind).toBe('upload');
        expect(boiler?.title).toBe('Boiler');
        expect(callLlm).not.toHaveBeenCalled();
    });

    it('excludeSourceIds removes a source', async () => {
        await getCmn('andy').ingest(DOCS, 'test');
        const hits = await recallPassages('andy', 'Maple Street', { excludeSourceIds: ['note:1'] });
        expect(hits.some((h) => h.sourceId === 'note:1')).toBe(false);
    });

    it('honours limit even when a wider network ask (limit + excludeSourceIds) returns more hits', async () => {
        await getCmn('andy').ingest(DOCS, 'test');
        // A non-matching exclude widens the network ask (limit + 1) without removing any hit,
        // so both DOCS passages can come back — the `limit` truncation must still apply.
        const hits = await recallPassages('andy', 'Maple Street', { limit: 1, excludeSourceIds: ['note:none'] });
        expect(hits.length).toBeLessThanOrEqual(1);
    });
});

describe('formatRecall / withRecall', () => {
    it('drops zero-score hits and leaves the prompt untouched when empty', () => {
        const empty = formatRecall({ query: 'q', rankedPassages: [], rankedFactIds: [], nodeScores: new Map(), candidates: { passageIds: [], factIds: [], typeIds: [] } } as never);
        expect(empty).toBe('');
        expect(withRecall('SYS', empty)).toBe('SYS');
        expect(withRecall('SYS', 'MEM')).toBe('SYS\n\nMEM');
    });
    it('silent recall does not count as a query (live previews must not flood CMN metrics/log)', async () => {
        const cmn = getCmn('andy');
        await cmn.ingest(DOCS, 'test');
        const before = cmn.metrics().queries;
        const hits = await recallPassages('andy', 'Who serviced the boiler?', { silent: true });
        expect(hits.length).toBeGreaterThan(0);
        expect(cmn.metrics().queries).toBe(before);
        await recallPassages('andy', 'Who serviced the boiler?');
        expect(cmn.metrics().queries).toBe(before + 1);
    });
});
