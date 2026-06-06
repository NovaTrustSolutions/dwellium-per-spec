/**
 * memoryGraphScene — pure layout for the MemoryGraphRAG layered visualization.
 *
 * Turns the engine's real data (Ontology types, Fact entities + triplets,
 * Passage evidence, bridges, PageRank node scores, conflict resolutions) into
 * positioned nodes + edges across three stacked elliptical "discs" — Ontology
 * (top), Fact (middle), Passage (bottom) — matching the Cognitive Memory
 * Network concept. No DOM, no React, fully deterministic → unit-testable.
 *
 * PageRank node-score keys follow the engine's convention: `entity:<id>` and
 * `passage:<id>` (see lib/memoryGraphRag/pagerank.ts ENTITY/PASSAGE).
 */
import type {
    OntologyType, SchemaRelation, Entity, Fact, Passage, GraphEdge, ConflictResolution,
} from '../../lib/memoryGraphRag';

export type SceneLayer = 'ontology' | 'fact' | 'passage';

export interface SceneNode {
    id: string;            // raw id (type/entity/passage id)
    layer: SceneLayer;
    label: string;
    x: number;
    y: number;
    r: number;             // radius (entities scale by score; passages drawn as rounded squares)
    score: number;         // 0..1 normalized (PageRank for fact/passage; count for ontology)
    highlighted: boolean;  // on the query's retrieval path
    conflict: boolean;     // entity is the subject of a resolved conflict
    kind: 'type' | 'entity' | 'passage';
    sourceKind?: string;
    title?: string;        // tooltip text
}

export interface SceneEdge {
    id: string;
    x1: number; y1: number; x2: number; y2: number;
    kind: 'schema' | 'fact' | 'bridge' | 'instantiation' | 'evidence';
    highlighted: boolean;
}

export interface SceneBand {
    layer: SceneLayer;
    label: string;
    cx: number; cy: number; rx: number; ry: number;
}

export interface GraphScene {
    width: number;
    height: number;
    bands: SceneBand[];
    nodes: SceneNode[];
    edges: SceneEdge[];
    meta: {
        shown: Record<SceneLayer, number>;
        total: Record<SceneLayer, number>;
        edges: number;
        queryActive: boolean;
    };
}

export interface SceneInput {
    types: OntologyType[];
    schemaRelations: SchemaRelation[];
    entities: Entity[];
    facts: Fact[];
    passages: Passage[];
    bridges: GraphEdge[];
    resolutions?: ConflictResolution[];
    nodeScores?: Map<string, number> | null;   // PageRank, keyed entity:<id> / passage:<id>
    rankedPassageIds?: string[];                // retrieval result order (raw passage ids)
}

export interface SceneCaps {
    width?: number;
    height?: number;
    ontology?: number;
    fact?: number;
    passage?: number;
    maxEdges?: number;
}

const DEFAULTS = { width: 1000, height: 660, ontology: 14, fact: 40, passage: 26, maxEdges: 150 };

/** Lay nodes around a flattened ellipse ("disc rim"), starting at the top. */
function ringPositions(n: number, cx: number, cy: number, rx: number, ry: number): Array<{ x: number; y: number }> {
    if (n <= 0) return [];
    if (n === 1) return [{ x: cx, y: cy }];
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    return out;
}

function normalize(values: number[]): (v: number) => number {
    const max = values.length ? Math.max(...values) : 0;
    const min = values.length ? Math.min(...values) : 0;
    const span = max - min;
    return (v: number) => (span > 1e-9 ? (v - min) / span : 0.5);
}

/**
 * Build the full positioned scene from real engine data. Deterministic:
 * identical input → identical output (no randomness, stable ordering).
 */
export function buildGraphScene(input: SceneInput, caps: SceneCaps = {}): GraphScene {
    const C = { ...DEFAULTS, ...caps };
    const W = C.width, H = C.height;

    const bands: SceneBand[] = [
        { layer: 'ontology', label: '01 · ONTOLOGY', cx: W / 2, cy: H * 0.18, rx: W * 0.38, ry: H * 0.07 },
        { layer: 'fact', label: '02 · FACT', cx: W / 2, cy: H * 0.50, rx: W * 0.43, ry: H * 0.11 },
        { layer: 'passage', label: '03 · PASSAGE', cx: W / 2, cy: H * 0.83, rx: W * 0.40, ry: H * 0.09 },
    ];
    const oBand = bands[0], fBand = bands[1], pBand = bands[2];

    const score = (key: string): number => input.nodeScores?.get(key) ?? 0;
    const conflictSubjects = new Set((input.resolutions ?? []).map((r) => r.conflict.subjectId));
    const rankedSet = new Set(input.rankedPassageIds ?? []);
    const queryActive = (input.nodeScores?.size ?? 0) > 0 || rankedSet.size > 0;

    // ── Select nodes per layer (highest-signal first) ──────────────────────────
    const totalTypes = input.types.length;
    const topTypes = [...input.types].sort((a, b) => b.count - a.count).slice(0, C.ontology);

    // Entities: by PageRank if a query ran, else by fact-degree.
    const degree = new Map<string, number>();
    for (const f of input.facts) {
        degree.set(f.subjectId, (degree.get(f.subjectId) ?? 0) + 1);
        if (f.objectId) degree.set(f.objectId, (degree.get(f.objectId) ?? 0) + 1);
    }
    const totalEntities = input.entities.length;
    const topEntities = [...input.entities]
        .sort((a, b) => (score(`entity:${b.id}`) - score(`entity:${a.id}`)) || ((degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)))
        .slice(0, C.fact);

    // Passages: retrieval-ranked first, then PageRank, then original order.
    const totalPassages = input.passages.length;
    const passById = new Map(input.passages.map((p) => [p.id, p]));
    const orderedPassages: Passage[] = [];
    const seen = new Set<string>();
    for (const id of input.rankedPassageIds ?? []) {
        const p = passById.get(id);
        if (p && !seen.has(id)) { orderedPassages.push(p); seen.add(id); }
    }
    [...input.passages]
        .sort((a, b) => score(`passage:${b.id}`) - score(`passage:${a.id}`))
        .forEach((p) => { if (!seen.has(p.id)) { orderedPassages.push(p); seen.add(p.id); } });
    const topPassages = orderedPassages.slice(0, C.passage);

    const shownEntityIds = new Set(topEntities.map((e) => e.id));
    const shownTypeIds = new Set(topTypes.map((t) => t.id));
    const shownPassageIds = new Set(topPassages.map((p) => p.id));

    // ── Position nodes ─────────────────────────────────────────────────────────
    const nodes: SceneNode[] = [];
    const pos = new Map<string, { x: number; y: number }>();

    // Ontology ring — radius scales gently with instance count.
    const oNorm = normalize(topTypes.map((t) => t.count));
    ringPositions(topTypes.length, oBand.cx, oBand.cy, oBand.rx, oBand.ry).forEach((p, i) => {
        const t = topTypes[i];
        const key = `type:${t.id}`;
        pos.set(key, p);
        nodes.push({
            id: t.id, layer: 'ontology', kind: 'type', label: t.name, x: p.x, y: p.y,
            r: 7 + oNorm(t.count) * 5, score: oNorm(t.count), highlighted: false, conflict: false,
            title: `${t.name} — ${t.count} entit${t.count === 1 ? 'y' : 'ies'}`,
        });
    });

    // Fact ring — top entity at the center (the "core"), rest around the rim.
    const eScores = topEntities.map((e) => score(`entity:${e.id}`));
    const eNorm = normalize(eScores.some((s) => s > 0) ? eScores : topEntities.map((e) => degree.get(e.id) ?? 0));
    if (topEntities.length > 0) {
        const core = topEntities[0];
        const corePos = { x: fBand.cx, y: fBand.cy };
        pos.set(`entity:${core.id}`, corePos);
        const cs = score(`entity:${core.id}`);
        nodes.push({
            id: core.id, layer: 'fact', kind: 'entity', label: core.name, x: corePos.x, y: corePos.y,
            r: 9 + eNorm(cs || (degree.get(core.id) ?? 0)) * 9, score: eNorm(cs || (degree.get(core.id) ?? 0)),
            highlighted: queryActive && cs > 0, conflict: conflictSubjects.has(core.id),
            title: `${core.name}${cs ? ` — PageRank ${cs.toFixed(3)}` : ''}`,
        });
        const rest = topEntities.slice(1);
        ringPositions(rest.length, fBand.cx, fBand.cy, fBand.rx, fBand.ry).forEach((p, i) => {
            const e = rest[i];
            const s = score(`entity:${e.id}`);
            const norm = eNorm(s || (degree.get(e.id) ?? 0));
            pos.set(`entity:${e.id}`, p);
            nodes.push({
                id: e.id, layer: 'fact', kind: 'entity', label: e.name, x: p.x, y: p.y,
                r: 6 + norm * 9, score: norm, highlighted: queryActive && s > 0,
                conflict: conflictSubjects.has(e.id),
                title: `${e.name}${s ? ` — PageRank ${s.toFixed(3)}` : ''}`,
            });
        });
    }

    // Passage ring.
    ringPositions(topPassages.length, pBand.cx, pBand.cy, pBand.rx, pBand.ry).forEach((p, i) => {
        const pg = topPassages[i];
        const s = score(`passage:${pg.id}`);
        pos.set(`passage:${pg.id}`, p);
        nodes.push({
            id: pg.id, layer: 'passage', kind: 'passage', label: pg.title || pg.sourceId, x: p.x, y: p.y,
            r: 7, score: s, highlighted: rankedSet.has(pg.id), conflict: false, sourceKind: pg.sourceKind,
            title: `${pg.sourceKind} · ${pg.title || pg.sourceId}\n${pg.text.slice(0, 140)}${pg.text.length > 140 ? '…' : ''}`,
        });
    });

    // ── Edges (only between shown nodes; budget-capped) ───────────────────────
    const edges: SceneEdge[] = [];
    const hi = new Set(nodes.filter((n) => n.highlighted).map((n) => `${n.kind}:${n.id}`));
    const push = (key: string, aKey: string, bKey: string, kind: SceneEdge['kind']) => {
        if (edges.length >= C.maxEdges) return;
        const a = pos.get(aKey), b = pos.get(bKey);
        if (!a || !b) return;
        edges.push({
            id: key, x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind,
            highlighted: hi.has(aKey) && hi.has(bKey),
        });
    };

    // schema: type → type
    for (const sr of input.schemaRelations) {
        if (shownTypeIds.has(sr.subjectType) && shownTypeIds.has(sr.objectType) && sr.subjectType !== sr.objectType) {
            push(`sch:${sr.id}`, `type:${sr.subjectType}`, `type:${sr.objectType}`, 'schema');
        }
    }
    // facts: subject entity → object entity; + evidence: subject entity → passage
    for (const f of input.facts) {
        if (f.objectId && shownEntityIds.has(f.subjectId) && shownEntityIds.has(f.objectId)) {
            push(`fact:${f.id}`, `entity:${f.subjectId}`, `entity:${f.objectId}`, 'fact');
        }
        if (shownEntityIds.has(f.subjectId) && shownPassageIds.has(f.passageId)) {
            push(`ev:${f.id}`, `entity:${f.subjectId}`, `passage:${f.passageId}`, 'evidence');
        }
    }
    // instantiation: entity → its ontology type
    for (const e of input.entities) {
        if (shownEntityIds.has(e.id) && shownTypeIds.has(e.typeId)) {
            push(`inst:${e.id}`, `entity:${e.id}`, `type:${e.typeId}`, 'instantiation');
        }
    }
    // bridges: entity ↔ entity (type / similarity)
    for (let i = 0; i < input.bridges.length; i++) {
        const br = input.bridges[i];
        const from = br.from.replace(/^entity:/, ''), to = br.to.replace(/^entity:/, '');
        if (shownEntityIds.has(from) && shownEntityIds.has(to) && from !== to) {
            push(`br:${i}`, `entity:${from}`, `entity:${to}`, 'bridge');
        }
    }

    return {
        width: W, height: H, bands, nodes, edges,
        meta: {
            shown: { ontology: topTypes.length, fact: topEntities.length, passage: topPassages.length },
            total: { ontology: totalTypes, fact: totalEntities, passage: totalPassages },
            edges: edges.length,
            queryActive,
        },
    };
}
