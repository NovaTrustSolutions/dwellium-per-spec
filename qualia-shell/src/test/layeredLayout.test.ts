/**
 * layeredLayout — unit tests for the Cognitive Memory Network geometry.
 */
import { describe, it, expect } from 'vitest';
import {
    buildLayeredGraph, phyllotaxis, gridPositions, projectNode, layerCenter, mulberry32, ambientField, sparkSeries, propagateWave,
    nodeWorld, project3D, telemetryBase, DEFAULT_CAMERA,
    type LayeredInput,
} from '../components/MemoryGraphRAG/layeredLayout';
import type {
    OntologyType, SchemaRelation, Entity, Fact, Passage, GraphEdge, ConflictResolution,
} from '../lib/memoryGraphRag';

const types: OntologyType[] = [
    { id: 'organelle', name: 'Organelle', count: 3 },
    { id: 'protein', name: 'Protein', count: 5 },
    { id: 'process', name: 'Process', count: 2 },
];
const schemaRelations: SchemaRelation[] = [
    { id: 's1', subjectType: 'organelle', predicate: 'releases', objectType: 'protein' },
];
const entities: Entity[] = [
    { id: 'mito', name: 'Mitochondria', typeId: 'organelle' },
    { id: 'cytc', name: 'Cytochrome c', typeId: 'protein' },
    { id: 'casp', name: 'Caspase-9', typeId: 'protein' },
    { id: 'apop', name: 'Apoptosis', typeId: 'process' },
];
const facts: Fact[] = [
    { id: 'f1', subjectId: 'mito', predicate: 'releases', objectId: 'cytc', passageId: 'p1', confidence: 1, createdAt: '' },
    { id: 'f2', subjectId: 'cytc', predicate: 'activates', objectId: 'casp', passageId: 'p2', confidence: 1, createdAt: '' },
    { id: 'f3', subjectId: 'casp', predicate: 'executes', objectId: 'apop', passageId: 'p3', confidence: 1, createdAt: '' },
];
const passages: Passage[] = [
    { id: 'p1', text: 'Mitochondria release cytochrome c.', sourceId: 'd1', sourceKind: 'upload', title: 'DOC-1' },
    { id: 'p2', text: 'Cytochrome c activates caspase-9.', sourceId: 'd2', sourceKind: 'scribe', title: 'DOC-2' },
    { id: 'p3', text: 'Caspase cascade executes apoptosis.', sourceId: 'd3', sourceKind: 'transcript', title: 'DOC-3' },
];
const bridges: GraphEdge[] = [{ from: 'entity:cytc', to: 'entity:casp', weight: 0.7, kind: 'similarity-bridge' }];
const resolutions: ConflictResolution[] = [
    { conflict: { subjectId: 'mito', predicate: 'releases', facts: [] }, winnerId: 'f1', reason: 'evidence', losers: [] },
];
const base: LayeredInput = { types, schemaRelations, entities, facts, passages, bridges, resolutions };

describe('phyllotaxis', () => {
    it('places index 0 at the disc center', () => {
        expect(phyllotaxis(0, 50)).toEqual({ u: 0, v: 0 });
    });
    it('keeps every point inside the unit disc', () => {
        for (let i = 0; i < 200; i++) {
            const { u, v } = phyllotaxis(i, 200);
            expect(u * u + v * v).toBeLessThanOrEqual(1.0001);
        }
    });
});

describe('buildLayeredGraph', () => {
    it('layers nodes and reports shown-vs-total per layer', () => {
        const g = buildLayeredGraph(base);
        expect(g.nodes.filter((n) => n.layer === 'ontology')).toHaveLength(3);
        expect(g.nodes.filter((n) => n.layer === 'fact')).toHaveLength(4);
        expect(g.nodes.filter((n) => n.layer === 'passage')).toHaveLength(3);
        expect(g.stats.fact.total).toBe(4);
        expect(g.stats.ontology.total).toBe(3);
    });
    it('emits every edge kind and marks cross-layer edges', () => {
        const kinds = new Set(buildLayeredGraph(base).edges.map((e) => e.kind));
        expect(kinds.has('schema')).toBe(true);
        expect(kinds.has('fact')).toBe(true);
        expect(kinds.has('evidence')).toBe(true);
        expect(kinds.has('instantiation')).toBe(true);
        expect(kinds.has('bridge')).toBe(true);
        expect(buildLayeredGraph(base).edges.some((e) => e.cross)).toBe(true);
    });
    it('flags the conflict entity and picks a conflict marker', () => {
        const g = buildLayeredGraph(base);
        expect(g.conflictId).toBe('entity:mito');
        expect(g.byId.get('entity:mito')?.conflict).toBe(true);
    });
    it('is idle with no query, lit with one — core = top PageRank entity', () => {
        expect(buildLayeredGraph(base).queryActive).toBe(false);
        const nodeScores = new Map([['entity:apop', 0.9], ['entity:mito', 0.4], ['passage:p3', 0.8]]);
        const g = buildLayeredGraph({ ...base, nodeScores, rankedPassageIds: ['p3'] });
        expect(g.queryActive).toBe(true);
        expect(g.coreId).toBe('entity:apop');
        expect(g.byId.get('entity:apop')?.highlighted).toBe(true);
        expect(g.byId.get('passage:p3')?.highlighted).toBe(true);
        // core sits at disc center
        expect(g.byId.get('entity:apop')).toMatchObject({ u: 0, v: 0 });
    });
    it('respects caps', () => {
        const g = buildLayeredGraph(base, { fact: 2 });
        expect(g.nodes.filter((n) => n.layer === 'fact')).toHaveLength(2);
        expect(g.stats.fact.shown).toBe(2);
        expect(g.stats.fact.total).toBe(4);
    });
    it('is deterministic', () => {
        expect(JSON.stringify(buildLayeredGraph(base).nodes)).toEqual(JSON.stringify(buildLayeredGraph(base).nodes));
    });
});

describe('projection', () => {
    const vp = { width: 1200, height: 760 };
    it('separates the three layer centers vertically', () => {
        const o = layerCenter('ontology', vp).y, f = layerCenter('fact', vp).y, p = layerCenter('passage', vp).y;
        expect(o).toBeLessThan(f);
        expect(f).toBeLessThan(p);
    });
    it('makes front nodes bigger + brighter than back nodes', () => {
        const back = projectNode({ layer: 'fact', u: 0, v: -1 }, vp);
        const front = projectNode({ layer: 'fact', u: 0, v: 1 }, vp);
        expect(front.rScale).toBeGreaterThan(back.rScale);
        expect(front.bright).toBeGreaterThan(back.bright);
        expect(front.depth).toBeGreaterThan(back.depth);
    });
    it('keeps projected x within the viewport', () => {
        for (const u of [-1, -0.5, 0, 0.5, 1]) {
            const pr = projectNode({ layer: 'passage', u, v: 0 }, vp);
            expect(pr.x).toBeGreaterThanOrEqual(0);
            expect(pr.x).toBeLessThanOrEqual(vp.width);
        }
    });
});

describe('ambient + sparklines', () => {
    it('mulberry32 is deterministic for a seed', () => {
        const a = mulberry32(42), b = mulberry32(42);
        expect(a()).toBe(b());
        expect(a()).toBe(b());
    });
    it('ambientField returns perLayer × 3 particles inside the disc', () => {
        const f = ambientField(50, 7);
        expect(f).toHaveLength(150);
        expect(f.every((p) => p.u * p.u + p.v * p.v <= 1.0001)).toBe(true);
    });
    it('sparkSeries has the requested length in [0,1]', () => {
        const s = sparkSeries(9, 30);
        expect(s).toHaveLength(30);
        expect(s.every((v) => v >= 0 && v <= 1)).toBe(true);
    });
});

describe('de-overlap relaxation', () => {
    it('separates a dense fact ring (no coincident nodes) and keeps the core centered', () => {
        const many = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, name: `E${i}`, typeId: 'protein' }));
        const f = Array.from({ length: 39 }, (_, i) => ({ id: `f${i}`, subjectId: `e${i}`, predicate: 'r', objectId: `e${i + 1}`, passageId: 'p1', confidence: 1, createdAt: '' }));
        const g = buildLayeredGraph({ ...base, entities: many, facts: f });
        const fact = g.nodes.filter((n) => n.layer === 'fact');
        let min = Infinity;
        for (let i = 0; i < fact.length; i++)
            for (let j = i + 1; j < fact.length; j++)
                min = Math.min(min, Math.hypot(fact[i].u - fact[j].u, fact[i].v - fact[j].v));
        expect(min).toBeGreaterThan(0.02);
        expect(fact.every((n) => n.u * n.u + n.v * n.v <= 1.02)).toBe(true);
        expect(g.coreId && g.byId.get(g.coreId)).toMatchObject({ u: 0, v: 0 });
    });
    it('stays deterministic after relaxation', () => {
        const a = buildLayeredGraph(base).nodes.map((n) => [n.u, n.v]);
        const b = buildLayeredGraph(base).nodes.map((n) => [n.u, n.v]);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});

describe('propagateWave', () => {
    it('reaches the seed at step 0 and neighbours later, deterministically', () => {
        const nodeScores = new Map([['entity:mito', 1], ['entity:cytc', 0.8]]);
        const g = buildLayeredGraph({ ...base, nodeScores });
        const w = propagateWave(g, 'entity:mito');
        expect(w.arrival.get('entity:mito')).toBe(0);
        expect(w.arrival.get('entity:cytc') ?? -1).toBeGreaterThan(0); // f1: mito → cytc
        expect(w.maxStep).toBeGreaterThan(0);
        expect(propagateWave(g, 'entity:mito').order).toEqual(w.order);
    });
    it('falls back to the core seed when none is given', () => {
        const g = buildLayeredGraph(base);
        expect(propagateWave(g, null).arrival.size).toBeGreaterThanOrEqual(1);
    });
    it('returns an empty result for an unknown seed', () => {
        const g = buildLayeredGraph(base);
        const w = propagateWave(g, 'entity:nope');
        expect(w.maxStep).toBe(0);
        expect(w.arrival.size).toBe(0);
    });
});

describe('true-3D projection', () => {
    const vp = { width: 1200, height: 760 };
    it('orders plane heights ontology > fact > passage', () => {
        expect(nodeWorld({ layer: 'ontology', u: 0, v: 0 }).y).toBeGreaterThan(nodeWorld({ layer: 'fact', u: 0, v: 0 }).y);
        expect(nodeWorld({ layer: 'fact', u: 0, v: 0 }).y).toBeGreaterThan(nodeWorld({ layer: 'passage', u: 0, v: 0 }).y);
    });
    it('projects the world origin to screen center x and is visible', () => {
        const pr = project3D({ x: 0, y: 0, z: 0 }, DEFAULT_CAMERA, vp);
        expect(pr.x).toBeCloseTo(vp.width / 2, 3);
        expect(pr.visible).toBe(true);
    });
    it('projects nearer points (smaller camZ) larger', () => {
        const a = project3D({ x: 0, y: 0, z: 0.9 }, DEFAULT_CAMERA, vp);
        const b = project3D({ x: 0, y: 0, z: -0.9 }, DEFAULT_CAMERA, vp);
        const [small, big] = a.camZ < b.camZ ? [a, b] : [b, a];
        expect(small.scale).toBeGreaterThan(big.scale);
    });
    it('moves an off-axis point horizontally as the camera orbits', () => {
        const a = project3D({ x: 0.8, y: 0, z: 0 }, { ...DEFAULT_CAMERA, angle: 0 }, vp);
        const b = project3D({ x: 0.8, y: 0, z: 0 }, { ...DEFAULT_CAMERA, angle: 1 }, vp);
        expect(Math.abs(a.x - b.x)).toBeGreaterThan(1);
    });
    it('has focus ~0 at the focal plane, larger off it', () => {
        const atFocus = project3D({ x: 0, y: 0, z: 0 }, DEFAULT_CAMERA, vp);
        const off = project3D({ x: 0, y: 2, z: 0 }, DEFAULT_CAMERA, vp);
        expect(atFocus.focus).toBeLessThan(0.001);
        expect(off.focus).toBeGreaterThan(atFocus.focus);
    });
});

describe('telemetryBase', () => {
    it('returns values in [0,1] and reflects conflicts in healing', () => {
        const a = telemetryBase(buildLayeredGraph(base));                 // base has a conflict
        const b = telemetryBase(buildLayeredGraph({ ...base, resolutions: [] }));
        for (const t of [a, b]) for (const v of [t.signal, t.flow, t.healing]) {
            expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
        }
        expect(a.healing).toBeGreaterThan(b.healing);
    });
    it('is deterministic', () => {
        expect(telemetryBase(buildLayeredGraph(base))).toEqual(telemetryBase(buildLayeredGraph(base)));
    });
});

describe('gridPositions (passage document-matrix)', () => {
    it('returns one centered point for n=1', () => {
        expect(gridPositions(1)).toEqual([{ u: 0, v: 0 }]);
    });
    it('returns n points inside the centered span', () => {
        const g = gridPositions(81);
        expect(g).toHaveLength(81);
        for (const { u, v } of g) {
            expect(Math.abs(u)).toBeLessThanOrEqual(0.76);
            expect(Math.abs(v)).toBeLessThanOrEqual(0.76);
        }
    });
    it('is centered on the origin for a full square', () => {
        const g = gridPositions(64); // 8×8 exactly
        const mu = g.reduce((s, p) => s + p.u, 0) / g.length;
        const mv = g.reduce((s, p) => s + p.v, 0) / g.length;
        expect(Math.abs(mu)).toBeLessThan(1e-9);
        expect(Math.abs(mv)).toBeLessThan(1e-9);
    });
    it('is deterministic', () => {
        expect(gridPositions(50)).toEqual(gridPositions(50));
    });
});
