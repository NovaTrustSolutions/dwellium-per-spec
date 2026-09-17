/**
 * Cognitive Memory Network shared layer: persistence, de-duplication, measured
 * metrics, per-user isolation, the liveness probe, and the no-LLM-spend
 * guarantee for background ingestion.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const callLlm = vi.fn();
vi.mock('../../lib/llmClient', () => ({ callLlm: (...a: unknown[]) => callLlm(...a) }));

import { CognitiveMemoryNetwork, getCmn, peekCmn, resetCmnForTests } from '../../lib/memoryGraphRag/shared';
import type { SourceDocument } from '../../lib/memoryGraphRag';

const DOCS: SourceDocument[] = [
    { sourceId: 'note:1', sourceKind: 'upload', title: 'Lease', text: 'The Maple Street lease renews in March. The tenant pays rent monthly to the owner.' },
    { sourceId: 'note:2', sourceKind: 'upload', title: 'Boiler', text: 'The boiler at Maple Street was serviced by Acme Heating. Acme Heating recommends a new valve.' },
];

beforeEach(() => {
    localStorage.clear();
    resetCmnForTests();
    callLlm.mockReset();
});

describe('CognitiveMemoryNetwork', () => {
    it('persists what it ingests and a new instance restores it', async () => {
        const a = new CognitiveMemoryNetwork('u1');
        await a.ingest(DOCS, 'test');
        const before = a.metrics();
        expect(before.counts.passages).toBeGreaterThan(0);
        expect(before.persist).toBe('ok');
        expect(before.persistedBytes).toBeGreaterThan(0);

        const b = new CognitiveMemoryNetwork('u1');
        await b.ready;
        expect(b.metrics().counts).toEqual(before.counts);
        expect(b.metrics().hydrated).toBe(true);
        expect(b.metrics().documents).toBe(2);
    });

    it('skips documents it has already seen and re-ingests changed text', async () => {
        const n = new CognitiveMemoryNetwork('u1');
        expect(await n.ingest(DOCS, 'test')).toEqual({ ingested: 2, skipped: 0 });
        expect(await n.ingest(DOCS, 'test')).toEqual({ ingested: 0, skipped: 2 });
        expect(n.metrics().ingests).toBe(1);

        const changed = [{ ...DOCS[0], text: DOCS[0].text + ' The deposit is held in escrow.' }, DOCS[1]];
        expect(await n.ingest(changed, 'test')).toEqual({ ingested: 1, skipped: 1 });
    });

    it('reports measured metrics and a real event log', async () => {
        const n = new CognitiveMemoryNetwork('u1');
        expect(n.metrics().lastIngestMs).toBeNull();
        expect(n.metrics().lastQueryMs).toBeNull();
        await n.ingest(DOCS, 'scribe');
        const a = await n.answer('Who serviced the boiler?');
        n.recall('lease renewal');
        const m = n.metrics();
        expect(typeof m.lastIngestMs).toBe('number');
        expect(typeof m.lastQueryMs).toBe('number');
        expect(m.queries).toBe(2);
        expect(a.rankedPassages.length).toBeGreaterThan(0);
        expect(m.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['ingest', 'query']));
        expect(m.events.find((e) => e.kind === 'ingest')?.source).toBe('scribe');
    });

    it('notifies subscribers when state changes', async () => {
        const n = new CognitiveMemoryNetwork('u1');
        const seen: number[] = [];
        const off = n.subscribe(() => seen.push(n.getVersion()));
        await n.ingest(DOCS, 'test');
        off();
        await n.answer('boiler');
        expect(seen.length).toBe(1);
    });

    it('background (offline) ingest never calls the LLM even when one is active', async () => {
        const llm = { active: true } as never;
        const n = new CognitiveMemoryNetwork('u1', llm);
        await n.ingest(DOCS, 'auto', { offline: true });
        expect(callLlm).not.toHaveBeenCalled();
        expect(n.metrics().counts.passages).toBeGreaterThan(0);
    });

    it('flags a full browser store instead of pretending to save', async () => {
        const n = new CognitiveMemoryNetwork('u1');
        await n.ready;
        const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
        await n.ingest(DOCS, 'test');
        spy.mockRestore();
        expect(n.metrics().persist).toBe('full');
        expect(n.probe().ok).toBe(false);
        expect(n.probe().detail).toMatch(/full/i);
    });

    it('probe is healthy on a working engine and describes real contents', async () => {
        const n = new CognitiveMemoryNetwork('u1');
        await n.ingest(DOCS, 'test');
        const p = n.probe();
        expect(p.ok).toBe(true);
        expect(p.detail).toMatch(/\d+ passages/);
    });

    it('reset clears memory and its saved copy', async () => {
        const n = new CognitiveMemoryNetwork('u1');
        await n.ingest(DOCS, 'test');
        await n.reset();
        expect(n.metrics().counts.passages).toBe(0);
        expect(localStorage.getItem('dwellium-cmn-v1:u1')).toBeNull();
        expect(await n.ingest(DOCS, 'test')).toEqual({ ingested: 2, skipped: 0 });
    });

    it('leaves an unreadable saved copy on disk rather than deleting it', async () => {
        localStorage.setItem('dwellium-cmn-v1:u1', '{not json');
        const n = new CognitiveMemoryNetwork('u1');
        await n.ready;
        expect(n.metrics().counts.passages).toBe(0);
        expect(localStorage.getItem('dwellium-cmn-v1:u1')).toBe('{not json');
    });
});

describe('getCmn', () => {
    it('returns one shared instance per user and isolates users', async () => {
        expect(peekCmn()).toBeNull();
        const andy = getCmn('andy');
        expect(getCmn('andy')).toBe(andy);
        expect(peekCmn()).toBe(andy);
        await andy.ingest(DOCS, 'test');

        const lisa = getCmn('lisa');
        await lisa.ready;
        expect(lisa).not.toBe(andy);
        expect(lisa.metrics().counts.passages).toBe(0);

        const andyAgain = getCmn('andy');
        await andyAgain.ready;
        expect(andyAgain.metrics().counts.passages).toBeGreaterThan(0);
    });
});
