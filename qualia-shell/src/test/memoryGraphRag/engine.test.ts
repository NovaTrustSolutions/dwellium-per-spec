/**
 * Unit tests for the MemoryGraphRAG pure engine core (no DOM / LLM / network).
 * Covers: Personalized PageRank, bridging, conflict detect+resolve, embedding/
 * cosine, the three-layer store + schema alignment, the retrieval pipeline, and
 * the offline facade end-to-end.
 */
import { describe, it, expect } from 'vitest';
import {
    personalizedPageRank, ENTITY, PASSAGE,
    typeBasedBridges, similarityBridges,
    detectConflicts, resolveConflictLocal,
    localEmbed, cosine,
    MemoryStore, retrieve,
    createMemoryGraphRagEngine,
    type Fact, type Entity, type GraphEdge,
} from '../../lib/memoryGraphRag';

const now = '2026-06-05T00:00:00.000Z';

describe('personalizedPageRank', () => {
    it('converges to a distribution summing to ~1', () => {
        const nodes = ['A', 'B', 'C'];
        const edges: GraphEdge[] = [
            { from: 'A', to: 'B', weight: 1, kind: 'fact' },
            { from: 'B', to: 'C', weight: 1, kind: 'fact' },
        ];
        const scores = personalizedPageRank(nodes, edges, new Map(), {});
        const sum = [...scores.values()].reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 4);
    });

    it('a symmetric two-node graph with uniform reset scores both equally', () => {
        const scores = personalizedPageRank(['A', 'B'], [{ from: 'A', to: 'B', weight: 1, kind: 'fact' }], new Map());
        expect(scores.get('A')).toBeCloseTo(scores.get('B')!, 6);
    });

    it('seeding the reset on A favours the seed locally and dominates under strong restart', () => {
        const nodes = ['A', 'B', 'C'];
        const edges: GraphEdge[] = [
            { from: 'A', to: 'B', weight: 1, kind: 'fact' },
            { from: 'B', to: 'C', weight: 1, kind: 'fact' },
        ];
        // Locality: the seed (A) and its neighbour (B) both outrank the distant node C.
        const def = personalizedPageRank(nodes, edges, new Map([['A', 1]]), {});
        expect(def.get('A')!).toBeGreaterThan(def.get('C')!);
        expect(def.get('B')!).toBeGreaterThan(def.get('C')!);
        // Strong restart → personalization dominates structure, so the seed is the max.
        const strong = personalizedPageRank(nodes, edges, new Map([['A', 1]]), { alpha: 0.7 });
        const maxNode = [...strong.entries()].sort((a, b) => b[1] - a[1])[0][0];
        expect(maxNode).toBe('A');
    });

    it('returns empty for an empty graph', () => {
        expect(personalizedPageRank([], [], new Map()).size).toBe(0);
    });
});

describe('bridging', () => {
    it('type-based bridges connect same-type entities and skip singletons', () => {
        const entities: Entity[] = [
            { id: 'a', name: 'A', typeId: 'person' },
            { id: 'b', name: 'B', typeId: 'person' },
            { id: 'c', name: 'C', typeId: 'place' },
        ];
        const edges = typeBasedBridges(entities);
        const touches = (id: string) => edges.some((e) => e.from === ENTITY(id) || e.to === ENTITY(id));
        expect(edges.length).toBeGreaterThan(0);
        expect(touches('a')).toBe(true);
        expect(touches('b')).toBe(true);
        expect(touches('c')).toBe(false); // 'place' is a singleton
        edges.forEach((e) => expect(e.kind).toBe('type-bridge'));
    });

    it('similarity bridges link vectors above the threshold only', () => {
        const vecs = new Map<string, number[]>([
            ['a', [1, 0, 0]],
            ['b', [0.98, 0.02, 0]],
            ['c', [0, 0, 1]],
        ]);
        const edges = similarityBridges(vecs, { threshold: 0.6 });
        const pair = (x: string, y: string) =>
            edges.some((e) => (e.from === ENTITY(x) && e.to === ENTITY(y)) || (e.from === ENTITY(y) && e.to === ENTITY(x)));
        expect(pair('a', 'b')).toBe(true);
        expect(pair('a', 'c')).toBe(false);
    });
});

describe('conflicts', () => {
    const mkFact = (id: string, lit: string, conf: number): Fact => ({
        id, subjectId: 'newton', predicate: 'born', objectId: '', objectLiteral: lit, passageId: `p-${id}`, confidence: conf, createdAt: now,
    });

    it('detects a contradiction on (subject, predicate)', () => {
        const conflicts = detectConflicts([mkFact('f1', '1643', 0.9), mkFact('f2', '1645', 0.5)]);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].facts).toHaveLength(2);
    });

    it('does not flag agreeing facts', () => {
        expect(detectConflicts([mkFact('f1', '1643', 0.9), mkFact('f2', '1643', 0.5)])).toHaveLength(0);
    });

    it('resolves to the higher-confidence fact', () => {
        const [conflict] = detectConflicts([mkFact('f1', '1643', 0.9), mkFact('f2', '1645', 0.5)]);
        const res = resolveConflictLocal(conflict, []);
        expect(res.winnerId).toBe('f1');
        expect(res.losers).toEqual(['f2']);
    });
});

describe('embedding + cosine', () => {
    it('localEmbed is deterministic and L2-normalized', () => {
        const a = localEmbed('hello world');
        const b = localEmbed('hello world');
        expect(a).toEqual(b);
        const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
        expect(norm).toBeCloseTo(1, 5);
    });
    it('cosine: identical = 1, related > unrelated', () => {
        expect(cosine(localEmbed('cat dog'), localEmbed('cat dog'))).toBeCloseTo(1, 6);
        const related = cosine(localEmbed('the cat sat'), localEmbed('the cat ran'));
        const unrelated = cosine(localEmbed('the cat sat'), localEmbed('quantum entropy lattice'));
        expect(related).toBeGreaterThan(unrelated);
    });
});

describe('MemoryStore + schema-instance alignment', () => {
    function seeded(): MemoryStore {
        const m = new MemoryStore();
        m.addEntity({ id: 'newton', name: 'Newton', typeId: 'person' });
        m.addEntity({ id: 'england', name: 'England', typeId: 'place' });
        m.addPassage({ id: 'p1', text: 'Isaac Newton was born in England in 1643.', sourceId: 'd1', sourceKind: 'upload' });
        return m;
    }
    it('aligns a fact to an induced schema relation', () => {
        const m = seeded();
        const f = m.addFact({ id: 'f1', subjectId: 'newton', predicate: 'born-in', objectId: 'england', passageId: 'p1', confidence: 0.9, createdAt: now });
        expect(f.schemaRelId).toBe('person::born-in::place');
        expect(m.schemaRelations.has('person::born-in::place')).toBe(true);
        expect(m.validate()).toHaveLength(0);
    });
    it('flags a fact whose entity types are unknown', () => {
        const m = seeded();
        m.addFact({ id: 'f2', subjectId: 'ghost', predicate: 'born-in', objectId: 'england', passageId: 'p1', confidence: 0.5, createdAt: now });
        expect(m.validate().map((f) => f.id)).toContain('f2');
    });
    it('counts the three layers', () => {
        const m = seeded();
        m.addFact({ id: 'f1', subjectId: 'newton', predicate: 'born-in', objectId: 'england', passageId: 'p1', confidence: 0.9, createdAt: now });
        const c = m.counts();
        expect(c.entities).toBe(2);
        expect(c.passages).toBe(1);
        expect(c.facts).toBe(1);
    });
});

describe('retrieval pipeline', () => {
    it('ranks the passage that matches the query to the top', () => {
        const m = new MemoryStore();
        m.addEntity({ id: 'newton', name: 'Newton', typeId: 'person' });
        m.addEntity({ id: 'england', name: 'England', typeId: 'place' });
        m.addPassage({ id: 'p1', text: 'Isaac Newton was born in England.', sourceId: 'd1', sourceKind: 'upload' });
        m.addPassage({ id: 'p2', text: 'Photosynthesis converts light into energy.', sourceId: 'd2', sourceKind: 'upload' });
        m.addFact({ id: 'f1', subjectId: 'newton', predicate: 'born-in', objectId: 'england', passageId: 'p1', confidence: 0.9, createdAt: now });

        const r = retrieve(m, 'Where was Newton born England', { limit: 5 });
        expect(r.rankedPassages.length).toBeGreaterThan(0);
        expect(r.rankedPassages[0].passage.id).toBe('p1');
    });
});

describe('engine facade (offline)', () => {
    it('ingests a document and answers extractively without an LLM', async () => {
        const engine = createMemoryGraphRagEngine(); // no llm → local extract + extractive answer
        await engine.ingest([
            { sourceId: 'd1', sourceKind: 'upload', title: 'Bio', text: 'Isaac Newton was born in England.\n\nParis is the capital of France.' },
        ]);
        expect(engine.store.counts().passages).toBeGreaterThan(0);
        expect(engine.store.counts().entities).toBeGreaterThan(0);

        const ans = await engine.answer('Where was Newton born?');
        expect(ans.generatedByLlm).toBe(false);
        expect(ans.answer.toLowerCase()).toContain('newton');
        expect(ans.rankedPassages[0].passage.text.toLowerCase()).toContain('newton');
    });
});
