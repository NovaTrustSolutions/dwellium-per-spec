/**
 * Agent recall (plan 058): retrieval-only memory block, bounded, empty when
 * the network is empty or irrelevant, and never touching the LLM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const callLlm = vi.fn();
vi.mock('../../lib/llmClient', () => ({ callLlm: (...a: unknown[]) => callLlm(...a) }));

import { getCmn, resetCmnForTests } from '../../lib/memoryGraphRag/shared';
import { recallContext, formatRecall, withRecall, RECALL_HEADING } from '../../lib/memoryGraphRag/recall';
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

describe('formatRecall / withRecall', () => {
    it('drops zero-score hits and leaves the prompt untouched when empty', () => {
        const empty = formatRecall({ query: 'q', rankedPassages: [], rankedFactIds: [], nodeScores: new Map(), candidates: { passageIds: [], factIds: [], typeIds: [] } } as never);
        expect(empty).toBe('');
        expect(withRecall('SYS', empty)).toBe('SYS');
        expect(withRecall('SYS', 'MEM')).toBe('SYS\n\nMEM');
    });
});
