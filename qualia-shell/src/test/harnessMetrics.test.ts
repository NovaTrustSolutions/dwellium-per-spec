import { describe, expect, it } from 'vitest';
import { harnessCard, formatMs } from '../components/CognitiveHarness/harnessMetrics';
import type { HarnessInputs } from '../components/CognitiveHarness/harnessTypes';
import type { CmnMetrics, CmnProbe } from '../lib/memoryGraphRag/shared';
import type { HermesRunRecord } from '../components/HonchoHermesPanel/hermesLearningStore';
import type { PersonaWorkState, PersonaTask } from '../lib/agents/personaWorkStore';
import { ROUTER_TOOL, ROUTER_CONFIDENCE_THRESHOLD, ROUTE_INTENTS } from '../lib/llmRouter';
import { ARA_CHAT_TOOL, ARA_FEWSHOT_K } from '../components/ARAConsole/araHermes';

function makeCmn(overrides: Partial<CmnMetrics> = {}): CmnMetrics {
    return {
        counts: { types: 0, schemaRelations: 0, entities: 0, facts: 0, passages: 0 },
        bridges: 0,
        documents: 0,
        ingests: 0,
        queries: 0,
        lastIngestMs: null,
        lastQueryMs: null,
        conflictsResolved: 0,
        persist: 'empty',
        persistedBytes: 0,
        hydrated: false,
        similarityThreshold: 0.6,
        events: [],
        ...overrides,
    };
}

function makeProbe(overrides: Partial<CmnProbe> = {}): CmnProbe {
    return { ok: true, detail: 'ok', kind: 'ok', ...overrides };
}

function makeRun(overrides: Partial<HermesRunRecord> = {}): HermesRunRecord {
    return {
        id: 'r1',
        prompt: 'do a thing',
        taskType: 'general',
        toolsUsed: [],
        steps: 1,
        outcome: 'success',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function makeTask(overrides: Partial<PersonaTask> = {}): PersonaTask {
    return { id: 't1', title: 'x', status: 'todo', assignedBy: 'user', createdAt: 0, ...overrides };
}

function makeInputs(overrides: Partial<HarnessInputs> = {}): HarnessInputs {
    return {
        cmn: makeCmn(),
        probe: makeProbe(),
        runs: [],
        work: {},
        availableDocs: 0,
        ...overrides,
    };
}

describe('formatMs', () => {
    it('renders null as an em dash', () => {
        expect(formatMs(null)).toBe('—');
    });
    it('renders a number with a unit suffix', () => {
        expect(formatMs(42)).toBe('42 ms');
    });
});

describe('harnessCard: zero-activity idle state', () => {
    it('idles non-engine cards with no backing records', () => {
        const input = makeInputs();
        for (const id of ['semantic-routing', 'prompt-opt', 'tool-use', 'planning', 'evaluation', 'ext-knowledge'] as const) {
            const card = harnessCard(id, input);
            expect(card.status).toEqual({ state: 'idle', label: 'No activity yet' });
        }
    });

    it('never shows a rate as 0% — renders — instead', () => {
        const toolUse = harnessCard('tool-use', makeInputs());
        expect(toolUse.metrics.find((m) => m.label === 'Success rate')?.value).toBe('—');
        const evaluation = harnessCard('evaluation', makeInputs());
        expect(evaluation.metrics.find((m) => m.label === 'Approval')?.value).toBe('—');
    });
});

describe('harnessCard: engine cards (rag/graph-rag/vector-db/memory)', () => {
    it('are ok/Connected when the probe is healthy', () => {
        const input = makeInputs();
        for (const id of ['rag', 'graph-rag', 'vector-db', 'memory'] as const) {
            expect(harnessCard(id, input).status).toEqual({ state: 'ok', label: 'Connected' });
        }
    });

    it('probe.kind "engine" degrades all four engine cards', () => {
        const input = makeInputs({ probe: makeProbe({ kind: 'engine', detail: 'engine down' }) });
        for (const id of ['rag', 'graph-rag', 'vector-db', 'memory'] as const) {
            expect(harnessCard(id, input).status.state).toBe('degraded');
        }
    });

    it('probe.kind "storage" degrades only the memory card', () => {
        const input = makeInputs({ probe: makeProbe({ kind: 'storage', detail: 'quota full' }) });
        expect(harnessCard('memory', input).status.state).toBe('degraded');
        for (const id of ['rag', 'graph-rag', 'vector-db'] as const) {
            expect(harnessCard(id, input).status).toEqual({ state: 'ok', label: 'Connected' });
        }
    });

    it('rag reads queries/latency/passages/ingests from cmn', () => {
        const input = makeInputs({
            cmn: makeCmn({ queries: 3, lastQueryMs: 12, counts: { types: 0, schemaRelations: 0, entities: 0, facts: 0, passages: 7 }, ingests: 2 }),
        });
        const card = harnessCard('rag', input);
        expect(card.metrics).toEqual([
            { label: 'Queries', value: '3' },
            { label: 'Last latency', value: '12 ms' },
            { label: 'Passages', value: '7' },
            { label: 'Ingests', value: '2' },
        ]);
    });

    it('rag renders — latency when nothing has been queried yet', () => {
        const card = harnessCard('rag', makeInputs());
        expect(card.metrics.find((m) => m.label === 'Last latency')?.value).toBe('—');
    });

    it('vector-db states passages are matched by word overlap, not vectors', () => {
        const card = harnessCard('vector-db', makeInputs());
        expect(card.source).toMatch(/word overlap, not vectors/);
        expect(card.metrics.find((m) => m.label === 'Threshold')?.value).toBe(String(0.6));
    });

    it('memory renders storage/restored/conflicts text', () => {
        const full = harnessCard('memory', makeInputs({ cmn: makeCmn({ persist: 'full' }) }));
        expect(full.metrics.find((m) => m.label === 'Storage')?.value).toBe('NOT SAVED — full');
        const unavailable = harnessCard('memory', makeInputs({ cmn: makeCmn({ persist: 'unavailable' }) }));
        expect(unavailable.metrics.find((m) => m.label === 'Storage')?.value).toBe('NOT SAVED');
        const empty = harnessCard('memory', makeInputs({ cmn: makeCmn({ persist: 'empty' }) }));
        expect(empty.metrics.find((m) => m.label === 'Storage')?.value).toBe('nothing saved');
        const ok = harnessCard('memory', makeInputs({ cmn: makeCmn({ persist: 'ok', persistedBytes: 2048, hydrated: true }) }));
        expect(ok.metrics.find((m) => m.label === 'Storage')?.value).toBe('saved · 2 KB');
        expect(ok.metrics.find((m) => m.label === 'Restored on load')?.value).toBe('yes');
    });
});

describe('harnessCard: semantic-routing', () => {
    it('counts only runs tagged with ROUTER_TOOL, mis-routes via outcome or rating<0', () => {
        const runs: HermesRunRecord[] = [
            makeRun({ id: 'a', toolsUsed: [ROUTER_TOOL], outcome: 'success' }),
            makeRun({ id: 'b', toolsUsed: [ROUTER_TOOL], outcome: 'fail' }),
            makeRun({ id: 'c', toolsUsed: [ROUTER_TOOL], outcome: 'success', rating: -1 }),
            makeRun({ id: 'd', toolsUsed: ['other-tool'], outcome: 'fail' }),
        ];
        const card = harnessCard('semantic-routing', makeInputs({ runs }));
        expect(card.metrics).toEqual([
            { label: 'Decisions', value: '3' },
            { label: 'Mis-routes', value: '2' },
            { label: 'Confidence threshold', value: String(ROUTER_CONFIDENCE_THRESHOLD) },
            { label: 'Intents', value: String(ROUTE_INTENTS.length) },
        ]);
        expect(card.status.state).toBe('ok');
    });
});

describe('harnessCard: prompt-opt', () => {
    it('excludes down-voted runs from the few-shot pool and counts votes', () => {
        const runs: HermesRunRecord[] = [
            makeRun({ id: 'a', toolsUsed: [ARA_CHAT_TOOL], rating: 1 }),
            makeRun({ id: 'b', toolsUsed: [ARA_CHAT_TOOL], rating: -1 }),
            makeRun({ id: 'c', toolsUsed: [ARA_CHAT_TOOL] }),
            makeRun({ id: 'd', toolsUsed: ['other-tool'] }),
        ];
        const card = harnessCard('prompt-opt', makeInputs({ runs }));
        expect(card.metrics).toEqual([
            { label: 'Few-shot pool', value: '2' },
            { label: '👍 / 👎', value: '1 / 1' },
            { label: 'Examples per answer', value: String(ARA_FEWSHOT_K) },
        ]);
    });

    it('idles with no runs and goes Live once a run is recorded', () => {
        expect(harnessCard('prompt-opt', makeInputs()).status).toEqual({ state: 'idle', label: 'No activity yet' });
        const withRun = harnessCard('prompt-opt', makeInputs({ runs: [makeRun({ toolsUsed: [ARA_CHAT_TOOL] })] }));
        expect(withRun.status).toEqual({ state: 'ok', label: 'Live' });
    });
});

describe('harnessCard: tool-use', () => {
    it('only counts runs with a real (non-router, non-chat) tool; rounds success rate', () => {
        const runs: HermesRunRecord[] = [
            makeRun({ id: 'a', toolsUsed: ['fs-write'], outcome: 'success' }),
            makeRun({ id: 'b', toolsUsed: ['fs-write'], outcome: 'fail' }),
            makeRun({ id: 'c', toolsUsed: ['web-search'], outcome: 'success' }),
            makeRun({ id: 'd', toolsUsed: [ROUTER_TOOL] }),
            makeRun({ id: 'e', toolsUsed: [ARA_CHAT_TOOL] }),
        ];
        const card = harnessCard('tool-use', makeInputs({ runs }));
        expect(card.metrics).toEqual([
            { label: 'Runs', value: '3' },
            { label: 'Success rate', value: '67%' },
            { label: 'Distinct tools', value: '2' },
        ]);
    });
});

describe('harnessCard: planning', () => {
    it('spreads task counts across multiple personas', () => {
        const work: PersonaWorkState = {
            mercury: { memory: [], audit: [], usageCount: 0, tasks: [makeTask({ status: 'todo' }), makeTask({ status: 'running' })] },
            orpheus: { memory: [], audit: [], usageCount: 0, tasks: [makeTask({ status: 'done' }), makeTask({ status: 'failed' }), makeTask({ status: 'done' })] },
        };
        const card = harnessCard('planning', makeInputs({ work }));
        expect(card.metrics).toEqual([
            { label: 'Queued', value: '1' },
            { label: 'Running', value: '1' },
            { label: 'Done', value: '2' },
            { label: 'Failed', value: '1' },
        ]);
        expect(card.status).toEqual({ state: 'ok', label: 'Live' });
    });

    it('idles when no persona has any tasks', () => {
        const work: PersonaWorkState = { mercury: { memory: [], audit: [], usageCount: 0, tasks: [] } };
        expect(harnessCard('planning', makeInputs({ work })).status).toEqual({ state: 'idle', label: 'No activity yet' });
    });
});

describe('harnessCard: evaluation', () => {
    it('computes approval only over rated runs, — when none are rated', () => {
        const runs: HermesRunRecord[] = [
            makeRun({ id: 'a', rating: 1 }),
            makeRun({ id: 'b', rating: -1 }),
            makeRun({ id: 'c' }),
            makeRun({ id: 'd', outcome: 'fail' }),
        ];
        const card = harnessCard('evaluation', makeInputs({ runs }));
        expect(card.metrics).toEqual([
            { label: 'Rated', value: '2' },
            { label: 'Approval', value: '50%' },
            { label: 'Failed runs', value: '1' },
        ]);
    });
});

describe('harnessCard: ext-knowledge', () => {
    it('reads availableDocs and cmn.documents', () => {
        const card = harnessCard('ext-knowledge', makeInputs({ availableDocs: 5, cmn: makeCmn({ documents: 2 }) }));
        expect(card.metrics).toEqual([
            { label: 'Local sources', value: '5' },
            { label: 'Ingested (all sources)', value: '2' },
        ]);
        expect(card.status).toEqual({ state: 'ok', label: 'Live' });
    });
});
