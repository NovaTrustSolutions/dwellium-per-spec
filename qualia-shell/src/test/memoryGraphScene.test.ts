/**
 * memoryGraphScene — unit tests for the layered-visualization layout.
 *
 * Verifies the pure scene builder turns real engine data into correctly
 * layered, deterministic, query-aware nodes + edges (no DOM).
 */
import { describe, it, expect } from 'vitest';
import { buildGraphScene, type SceneInput } from '../components/MemoryGraphRAG/memoryGraphScene';
import type {
    OntologyType, SchemaRelation, Entity, Fact, Passage, GraphEdge, ConflictResolution,
} from '../lib/memoryGraphRag';

const types: OntologyType[] = [
    { id: 'person', name: 'Person', count: 2 },
    { id: 'org', name: 'Org', count: 1 },
];
const schemaRelations: SchemaRelation[] = [
    { id: 'sr1', subjectType: 'person', predicate: 'works_at', objectType: 'org' },
];
const entities: Entity[] = [
    { id: 'alice', name: 'Alice', typeId: 'person' },
    { id: 'bob', name: 'Bob', typeId: 'person' },
    { id: 'acme', name: 'Acme', typeId: 'org' },
];
const facts: Fact[] = [
    { id: 'f1', subjectId: 'alice', predicate: 'works_at', objectId: 'acme', passageId: 'p1', confidence: 1, createdAt: '' },
    { id: 'f2', subjectId: 'bob', predicate: 'knows', objectId: 'alice', passageId: 'p2', confidence: 1, createdAt: '' },
];
const passages: Passage[] = [
    { id: 'p1', text: 'Alice works at Acme.', sourceId: 's1', sourceKind: 'upload', title: 'Doc 1' },
    { id: 'p2', text: 'Bob knows Alice.', sourceId: 's2', sourceKind: 'upload', title: 'Doc 2' },
];
const bridges: GraphEdge[] = [
    { from: 'entity:alice', to: 'entity:bob', weight: 0.7, kind: 'similarity-bridge' },
];
const resolutions: ConflictResolution[] = [
    { conflict: { subjectId: 'alice', predicate: 'works_at', facts: [] }, winnerId: 'f1', reason: 'higher confidence', losers: [] },
];

const base: SceneInput = { types, schemaRelations, entities, facts, passages, bridges, resolutions };

describe('buildGraphScene', () => {
    it('splits nodes into the three layers with correct totals', () => {
        const s = buildGraphScene(base);
        expect(s.nodes.filter((n) => n.layer === 'ontology')).toHaveLength(2);
        expect(s.nodes.filter((n) => n.layer === 'fact')).toHaveLength(3);
        expect(s.nodes.filter((n) => n.layer === 'passage')).toHaveLength(2);
        expect(s.meta.total).toEqual({ ontology: 2, fact: 3, passage: 2 });
    });

    it('emits edges of every relationship kind among shown nodes', () => {
        const kinds = new Set(buildGraphScene(base).edges.map((e) => e.kind));
        expect(kinds.has('schema')).toBe(true);        // person → org
        expect(kinds.has('fact')).toBe(true);          // alice → acme, bob → alice
        expect(kinds.has('instantiation')).toBe(true); // entity → type
        expect(kinds.has('evidence')).toBe(true);      // entity → passage
        expect(kinds.has('bridge')).toBe(true);        // alice ↔ bob
    });

    it('rings a conflicted entity', () => {
        const alice = buildGraphScene(base).nodes.find((n) => n.id === 'alice' && n.layer === 'fact');
        expect(alice?.conflict).toBe(true);
    });

    it('is idle (no highlights) without a query', () => {
        const s = buildGraphScene(base);
        expect(s.meta.queryActive).toBe(false);
        expect(s.nodes.every((n) => !n.highlighted)).toBe(true);
    });

    it('lights the PageRank path and centers the top entity when a query runs', () => {
        const nodeScores = new Map<string, number>([
            ['entity:alice', 0.9], ['entity:bob', 0.1], ['passage:p1', 0.8], ['passage:p2', 0.05],
        ]);
        const s = buildGraphScene({ ...base, nodeScores, rankedPassageIds: ['p1'] });
        expect(s.meta.queryActive).toBe(true);
        const alice = s.nodes.find((n) => n.id === 'alice' && n.layer === 'fact')!;
        const p1 = s.nodes.find((n) => n.id === 'p1')!;
        expect(alice.highlighted).toBe(true);
        expect(p1.highlighted).toBe(true);
        // highest-scored entity is placed at the fact-band core (center x)
        expect(alice.x).toBeCloseTo(s.width / 2, 5);
        // at least one highlighted edge (the lit retrieval path)
        expect(s.edges.some((e) => e.highlighted)).toBe(true);
    });

    it('respects caps and reports shown-vs-total', () => {
        const s = buildGraphScene(base, { fact: 1 });
        expect(s.nodes.filter((n) => n.layer === 'fact')).toHaveLength(1);
        expect(s.meta.shown.fact).toBe(1);
        expect(s.meta.total.fact).toBe(3);
    });

    it('produces finite, in-bounds coordinates', () => {
        const s = buildGraphScene(base);
        for (const n of s.nodes) {
            expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
            expect(n.x).toBeGreaterThanOrEqual(0);
            expect(n.x).toBeLessThanOrEqual(s.width);
            expect(n.y).toBeGreaterThanOrEqual(0);
            expect(n.y).toBeLessThanOrEqual(s.height);
        }
    });

    it('is deterministic (same input → identical scene)', () => {
        expect(JSON.stringify(buildGraphScene(base))).toEqual(JSON.stringify(buildGraphScene(base)));
    });

    it('renders an empty scene with zero nodes', () => {
        const s = buildGraphScene({ types: [], schemaRelations: [], entities: [], facts: [], passages: [], bridges: [] });
        expect(s.nodes).toHaveLength(0);
        expect(s.meta.queryActive).toBe(false);
    });
});
