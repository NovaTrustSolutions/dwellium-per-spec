/**
 * Plan 069 W1-A — pure card-data derivation for the Cognitive Harness widget.
 * No React, no store reads, no Date.now: everything comes from `HarnessInputs`
 * (see harnessTypes.ts, the module contract; do not change it here).
 */
import type { HarnessCard, HarnessCardId, HarnessInputs, HarnessMetric, HarnessStatus } from './harnessTypes';
import type { HermesRunRecord } from '../HonchoHermesPanel/hermesLearningStore';
import { ROUTER_TOOL, ROUTER_CONFIDENCE_THRESHOLD, ROUTE_INTENTS } from '../../lib/llmRouter';
import { ARA_CHAT_TOOL, ARA_FEWSHOT_K } from '../ARAConsole/araHermes';

/** null → '—' (unknown/never measured), else `${ms} ms`. */
export function formatMs(ms: number | null): string {
    return ms === null ? '—' : `${ms} ms`;
}

function metric(label: string, value: string): HarnessMetric {
    return { label, value };
}

function persistText(input: HarnessInputs): string {
    switch (input.cmn.persist) {
        case 'ok': return `saved · ${Math.round(input.cmn.persistedBytes / 1024)} KB`;
        case 'full': return 'NOT SAVED — full';
        case 'unavailable': return 'NOT SAVED';
        case 'empty': return 'nothing saved';
    }
}

/** Engine cards (rag/graph-rag/vector-db/memory) are always ok/degraded, never idle. */
function engineStatus(id: HarnessCardId, input: HarnessInputs): HarnessStatus {
    const { kind } = input.probe;
    const degraded = kind === 'engine' || (kind === 'storage' && id === 'memory');
    return degraded ? { state: 'degraded', label: input.probe.detail } : { state: 'ok', label: 'Connected' };
}

/** Non-engine cards: zero records → idle, otherwise ok/Live. */
function activityStatus(hasRecords: boolean): HarnessStatus {
    return hasRecords ? { state: 'ok', label: 'Live' } : { state: 'idle', label: 'No activity yet' };
}

const isMisroute = (r: HermesRunRecord): boolean => r.outcome === 'fail' || (typeof r.rating === 'number' && r.rating < 0);
const isDownVoted = (r: HermesRunRecord): boolean => typeof r.rating === 'number' && r.rating < 0;
const isUpVoted = (r: HermesRunRecord): boolean => typeof r.rating === 'number' && r.rating > 0;

function ragCard(input: HarnessInputs): HarnessCard {
    const { cmn } = input;
    return {
        metrics: [
            metric('Queries', String(cmn.queries)),
            metric('Last latency', formatMs(cmn.lastQueryMs)),
            metric('Passages', String(cmn.counts.passages)),
            metric('Ingests', String(cmn.ingests)),
        ],
        status: engineStatus('rag', input),
        source: 'Local MemoryGraphRAG engine (this browser tab).',
    };
}

function graphRagCard(input: HarnessInputs): HarnessCard {
    const { cmn } = input;
    return {
        metrics: [
            metric('Entities', String(cmn.counts.entities)),
            metric('Facts', String(cmn.counts.facts)),
            metric('Bridges', String(cmn.bridges)),
        ],
        status: engineStatus('graph-rag', input),
        source: 'Local MemoryGraphRAG engine (this browser tab).',
    };
}

function vectorDbCard(input: HarnessInputs): HarnessCard {
    const { cmn } = input;
    return {
        metrics: [
            metric('Embedded names', String(cmn.counts.entities)),
            metric('Embedding', 'local hashed words + trigrams'),
            metric('Threshold', String(cmn.similarityThreshold)),
        ],
        status: engineStatus('vector-db', input),
        source: 'Local MemoryGraphRAG engine — passages are matched by word overlap, not vectors.',
    };
}

function memoryCard(input: HarnessInputs): HarnessCard {
    const { cmn } = input;
    return {
        metrics: [
            metric('Documents', String(cmn.documents)),
            metric('Storage', persistText(input)),
            metric('Restored on load', cmn.hydrated ? 'yes' : 'no'),
            metric('Conflicts resolved', String(cmn.conflictsResolved)),
        ],
        status: engineStatus('memory', input),
        source: 'Local MemoryGraphRAG engine, persisted to this browser\'s localStorage.',
    };
}

function semanticRoutingCard(input: HarnessInputs): HarnessCard {
    const runs = input.runs.filter((r) => r.toolsUsed.includes(ROUTER_TOOL));
    const misroutes = runs.filter(isMisroute).length;
    return {
        metrics: [
            metric('Decisions', String(runs.length)),
            metric('Mis-routes', String(misroutes)),
            metric('Confidence threshold', String(ROUTER_CONFIDENCE_THRESHOLD)),
            metric('Intents', String(ROUTE_INTENTS.length)),
        ],
        status: activityStatus(runs.length > 0),
        source: 'Hermes run log (llm-router decisions), this browser.',
    };
}

function promptOptCard(input: HarnessInputs): HarnessCard {
    const runs = input.runs.filter((r) => r.toolsUsed.includes(ARA_CHAT_TOOL));
    const pool = runs.filter((r) => !isDownVoted(r)).length;
    const up = runs.filter(isUpVoted).length;
    const down = runs.filter(isDownVoted).length;
    return {
        metrics: [
            metric('Few-shot pool', String(pool)),
            metric('👍 / 👎', `${up} / ${down}`),
            metric('Examples per answer', String(ARA_FEWSHOT_K)),
        ],
        status: activityStatus(runs.length > 0),
        source: 'Hermes run log (ara-chat runs), this browser.',
    };
}

function toolUseCard(input: HarnessInputs): HarnessCard {
    const runs = input.runs.filter((r) =>
        r.toolsUsed.some((t) => t !== ROUTER_TOOL && t !== ARA_CHAT_TOOL),
    );
    // An unchecked run answered but had no Sources to fact-check (logged 'fail' + unchecked so it isn't reused):
    // not a failure, not a success — left out of the rate, as personaStats does.
    const scored = runs.filter((r) => !r.unchecked);
    const success = scored.filter((r) => r.outcome === 'success').length;
    const rate = scored.length === 0 ? '—' : `${Math.round((100 * success) / scored.length)}%`;
    const distinct = new Set(
        runs.flatMap((r) => r.toolsUsed.filter((t) => t !== ROUTER_TOOL && t !== ARA_CHAT_TOOL)),
    );
    return {
        metrics: [
            metric('Runs', String(runs.length)),
            metric('Success rate', rate),
            metric('Distinct tools', String(distinct.size)),
        ],
        status: activityStatus(runs.length > 0),
        source: 'Hermes run log (non-router, non-chat tool calls), this browser.',
    };
}

function planningCard(input: HarnessInputs): HarnessCard {
    // Stored snapshots are not shape-checked on load (personaWorkStore deserialize), so guard tasks.
    const tasks = Object.values(input.work).flatMap((w) => (Array.isArray(w?.tasks) ? w.tasks : []));
    const count = (status: string) => tasks.filter((t) => t.status === status).length;
    return {
        metrics: [
            metric('Queued', String(count('todo'))),
            metric('Running', String(count('running'))),
            metric('Done', String(count('done'))),
            metric('Failed', String(count('failed'))),
        ],
        status: activityStatus(tasks.length > 0),
        source: 'Persona work store, this browser.',
    };
}

function evaluationCard(input: HarnessInputs): HarnessCard {
    const runs = input.runs;
    const rated = runs.filter((r) => typeof r.rating === 'number');
    const approved = rated.filter((r) => (r.rating ?? 0) > 0).length;
    const approval = rated.length === 0 ? '—' : `${Math.round((100 * approved) / rated.length)}%`;
    const failed = runs.filter((r) => r.outcome === 'fail' && !r.unchecked).length; // unchecked answers are not failures
    return {
        metrics: [
            metric('Rated', String(rated.length)),
            metric('Approval', approval),
            metric('Failed runs', String(failed)),
        ],
        status: activityStatus(runs.length > 0),
        source: 'Hermes run log (all recorded runs), this browser.',
    };
}

function extKnowledgeCard(input: HarnessInputs): HarnessCard {
    return {
        metrics: [
            // Not a subset: "ingested" also counts pastes, uploads and transcripts fed via the CMN widget.
            metric('Local sources', String(input.availableDocs)),
            metric('Ingested (all sources)', String(input.cmn.documents)),
        ],
        status: activityStatus(input.availableDocs > 0 || input.cmn.documents > 0),
        source: 'Tag, Scribe, capture and synthesis documents in this browser; ingested also counts pastes, uploads and transcripts.',
    };
}

const BUILDERS: Record<HarnessCardId, (input: HarnessInputs) => HarnessCard> = {
    'rag': ragCard,
    'graph-rag': graphRagCard,
    'vector-db': vectorDbCard,
    'memory': memoryCard,
    'semantic-routing': semanticRoutingCard,
    'prompt-opt': promptOptCard,
    'tool-use': toolUseCard,
    'planning': planningCard,
    'evaluation': evaluationCard,
    'ext-knowledge': extKnowledgeCard,
};

export function harnessCard(id: HarnessCardId, input: HarnessInputs): HarnessCard {
    return BUILDERS[id](input);
}
