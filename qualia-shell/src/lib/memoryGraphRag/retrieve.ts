/**
 * Online retrieval pipeline (Steps 1–3).
 *
 *   Step 1 — Memory-Guided Retrieval: pull candidate passages, facts, and
 *            schema types from all three layers in one pass.
 *   Step 2 — Structure-Aware Node Initialization: map evidence to PPR reset
 *            weights; suppress generic hub categories ("person", "particle"),
 *            prioritise rare / high-information-density nodes.
 *   Step 3 — Graph Propagation: Personalized PageRank over the heterogeneous
 *            graph; energy flows out from query-relevant seeds; rank passages.
 *
 * Pure + deterministic (no LLM, no network) — answer generation is layered on
 * top in index.ts. This is the fully unit-testable retrieval brain.
 */
import type { MemoryStore } from './memory';
import type { GraphEdge, RetrievalCandidates, RetrievalResult, Entity, Passage } from './types';
import { personalizedPageRank, ENTITY, PASSAGE, topNodes } from './pagerank';

const GENERIC_HUBS = new Set([
    'person', 'people', 'particle', 'thing', 'entity', 'object',
    'concept', 'number', 'date', 'literal', 'misc', 'item',
]);

export function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
}

/** Step 1 — candidates from each layer + the entities the query names. */
export function memoryGuidedRetrieval(store: MemoryStore, query: string): {
    candidates: RetrievalCandidates;
    matchedEntities: Entity[];
    passageOverlap: Map<string, number>;
} {
    const qTokens = new Set(tokenize(query));
    const matchedEntities: Entity[] = [];
    for (const e of store.entities.values()) {
        const names = [e.name, ...(e.aliases ?? [])];
        if (names.some((n) => tokenize(n).some((t) => qTokens.has(t)))) matchedEntities.push(e);
    }
    const passageOverlap = new Map<string, number>();
    for (const p of store.passages.values()) {
        const pt = tokenize(p.text);
        let overlap = 0;
        for (const t of pt) if (qTokens.has(t)) overlap++;
        if (overlap > 0) passageOverlap.set(p.id, overlap);
    }
    const matchedIds = new Set(matchedEntities.map((e) => e.id));
    const factIds: string[] = [];
    for (const f of store.facts.values()) {
        if (matchedIds.has(f.subjectId) || matchedIds.has(f.objectId)) factIds.push(f.id);
    }
    const typeIds = [...new Set(matchedEntities.map((e) => e.typeId))];
    return {
        candidates: { passageIds: [...passageOverlap.keys()], factIds, typeIds },
        matchedEntities,
        passageOverlap,
    };
}

/** Step 2 — reset weights with generic-hub suppression + rarity/density priors. */
export function initNodeWeights(
    store: MemoryStore,
    matchedEntities: Entity[],
    passageOverlap: Map<string, number>,
    opts: { hubTypes?: Set<string> } = {},
): Map<string, number> {
    const reset = new Map<string, number>();
    const hubTypes = opts.hubTypes ?? GENERIC_HUBS;

    // mean type frequency → dynamic hub detection
    const counts = [...store.types.values()].map((t) => t.count);
    const mean = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 1;
    const dynamicHubThreshold = Math.max(3, mean * 3);

    for (const e of matchedEntities) {
        const type = store.types.get(e.typeId);
        const isHub = hubTypes.has(e.typeId.toLowerCase()) || (type ? type.count >= dynamicHubThreshold : false);
        let w = 1;
        if (isHub) w *= 0.2;                 // suppress generic hubs
        if (type && type.count === 1) w *= 1.5; // boost rare, specific entities
        reset.set(ENTITY(e.id), (reset.get(ENTITY(e.id)) ?? 0) + w);
    }

    for (const [pid, overlap] of passageOverlap) {
        const p = store.passages.get(pid);
        if (!p) continue;
        const len = Math.max(1, tokenize(p.text).length);
        const density = overlap / Math.sqrt(len); // favour concise, high-density passages
        reset.set(PASSAGE(pid), (reset.get(PASSAGE(pid)) ?? 0) + overlap * 0.5 + density);
    }
    return reset;
}

/** Full pipeline → ranked passages + facts + node scores. */
export function retrieve(
    store: MemoryStore,
    query: string,
    opts: { bridges?: GraphEdge[]; alpha?: number; limit?: number; hubTypes?: Set<string> } = {},
): RetrievalResult {
    const { candidates, matchedEntities, passageOverlap } = memoryGuidedRetrieval(store, query);
    const reset = initNodeWeights(store, matchedEntities, passageOverlap, { hubTypes: opts.hubTypes });
    const graph = store.toGraph(opts.bridges ?? []);
    const scores = personalizedPageRank(graph.nodes, graph.edges, reset, { alpha: opts.alpha ?? 0.15 });

    const limit = opts.limit ?? 8;
    const topPassageNodes = topNodes(scores, 'passage:', limit);
    const rankedPassages = topPassageNodes
        .map(({ id, score }) => {
            const passage = store.passages.get(id);
            return passage ? { passage, score } : null;
        })
        .filter((x): x is { passage: Passage; score: number } => x !== null);

    const rankedFactIds = [...store.facts.values()]
        .map((f) => ({ f, s: (scores.get(ENTITY(f.subjectId)) ?? 0) + (scores.get(ENTITY(f.objectId)) ?? 0) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .filter((x) => x.s > 0)
        .map((x) => x.f.id);

    return { query, rankedPassages, rankedFactIds, nodeScores: scores, candidates };
}
