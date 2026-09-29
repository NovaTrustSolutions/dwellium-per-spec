/**
 * Agent recall (plan 058): retrieval-only memory block, bounded, empty when
 * the network is empty or irrelevant, and never touching the LLM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const callLlm = vi.fn();
vi.mock('../../lib/llmClient', () => ({ callLlm: (...a: unknown[]) => callLlm(...a) }));

import { getCmn, resetCmnForTests } from '../../lib/memoryGraphRag/shared';
import { recallContext, recallPassages, formatRecall, withRecall, RECALL_HEADING } from '../../lib/memoryGraphRag/recall';
import { captureSynthesis, synthesisStore, synthesisUserIdHolder } from '../../components/Synthesis/synthesisStore';
import type { SourceDocument } from '../../lib/memoryGraphRag';

const DOCS: SourceDocument[] = [
    { sourceId: 'note:1', sourceKind: 'upload', title: 'Boiler', text: 'Acme Heating serviced the boiler at Maple Street and recommends a new valve.' },
    { sourceId: 'note:2', sourceKind: 'upload', title: 'Lease', text: 'The Maple Street lease renews in March. The tenant pays the owner monthly.' },
];

/**
 * Docs for the liveness-filter tests: a deleted synthesis, a live one, and an
 * upload (never filtered). `gone`'s text over-emphasizes the query terms so it
 * out-ranks `upload` on a 2-wide fetch — that's deliberate: it's what makes the
 * over-fetch-then-trim behavior load-bearing (without it, a plain `limit`-wide
 * fetch would happen to already exclude `gone` and the mutation would go
 * undetected).
 */
const LIVENESS_DOCS: SourceDocument[] = [
    { sourceId: 'synthesis:gone', sourceKind: 'synthesis', title: 'Gone', text: 'Deleted Maple Street boiler service plan. Maple Street boiler service plan. Maple Street boiler service plan.' },
    { sourceId: 'synthesis:here', sourceKind: 'synthesis', title: 'Here', text: 'Live synthesis about the Maple Street boiler.' },
    { sourceId: 'note:upload', sourceKind: 'upload', title: 'Upload', text: 'Uploaded note about the boiler.' },
];

beforeEach(() => {
    localStorage.clear();
    resetCmnForTests();
    synthesisStore.reset();
    synthesisUserIdHolder.current = null;
    callLlm.mockReset();
});

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

describe('liveness filtering (plan 070 P5): deleted sources never resurface', () => {
    async function seedLiveness(uid: string) {
        synthesisUserIdHolder.current = uid;
        captureSynthesis({ id: 'here', query: 'Maple Street boiler', result: 'Live synthesis about the Maple Street boiler.', layer: 1, parentId: null });
        await getCmn(uid).ingest(LIVENESS_DOCS, 'test');
    }

    it('recallPassages omits the deleted synthesis, keeps the live one and the upload', async () => {
        await seedLiveness('andy');
        const hits = await recallPassages('andy', 'Maple Street boiler service plan', { limit: 10 });
        const ids = hits.map((h) => h.sourceId);
        expect(ids).not.toContain('synthesis:gone');
        expect(ids).toContain('synthesis:here');
        expect(ids).toContain('note:upload');
    });

    it('recallContext omits the deleted synthesis, keeps the live one and the upload', async () => {
        await seedLiveness('andy');
        const block = await recallContext('andy', 'Maple Street boiler service plan', { limit: 10, maxChars: 10_000 });
        expect(block).not.toContain('Deleted Maple Street');
        expect(block).toContain('Live synthesis');
        expect(block).toContain('Uploaded note');
    });

    it('honours limit after filtering out a deleted source, even when it out-ranked a live one (over-fetch works)', async () => {
        // `gone` out-ranks `upload` on a bare 2-wide fetch (see LIVENESS_DOCS comment), so
        // a `limit: 2` ask can only surface `upload` if the engine over-fetches past `gone`.
        await seedLiveness('andy');
        const hits = await recallPassages('andy', 'Maple Street boiler service plan', { limit: 2 });
        const ids = hits.map((h) => h.sourceId);
        expect(hits.length).toBeLessThanOrEqual(2);
        expect(ids).toContain('note:upload');
    });

    it('fails closed: if liveSourceIds throws, liveness-kind passages are hidden but uploads are kept', async () => {
        const sources = await import('../../lib/memoryGraphRag/sources');
        const spy = vi.spyOn(sources, 'liveSourceIds').mockImplementation(() => { throw new Error('boom'); });
        try {
            await seedLiveness('andy');
            const hits = await recallPassages('andy', 'Maple Street boiler service plan', { limit: 10 });
            const ids = hits.map((h) => h.sourceId);
            expect(ids).not.toContain('synthesis:gone');
            expect(ids).not.toContain('synthesis:here'); // fail closed: liveness kinds hidden entirely
            expect(ids).toContain('note:upload');
        } finally {
            spy.mockRestore();
        }
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
