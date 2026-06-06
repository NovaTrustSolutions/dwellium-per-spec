/**
 * layeredLayout — pure geometry for the Cognitive Memory Network visualization.
 *
 * Turns the engine's real three-layer memory into nodes positioned on three
 * stacked, tilted planes (Ontology / Fact / Passage) and projects them to screen
 * with a perspective foreshortening, plus a seeded ambient particle field and
 * sparkline series for the HUD. No DOM / no canvas → fully deterministic +
 * unit-testable; the canvas renderer (MemoryGraphView) only draws what this
 * module computes.
 *
 * PageRank node-score keys follow the engine convention: `entity:<id>` /
 * `passage:<id>` (see lib/memoryGraphRag/pagerank.ts).
 */
import type {
    OntologyType, SchemaRelation, Entity, Fact, Passage, GraphEdge, ConflictResolution,
} from '../../lib/memoryGraphRag';

export type Layer = 'ontology' | 'fact' | 'passage';

export interface LayeredNode {
    id: string;
    layer: Layer;
    kind: 'type' | 'entity' | 'passage';
    label: string;
    u: number;            // planar disc coords in [-1,1] (u² + v² ≲ 1)
    v: number;
    score: number;        // 0..1 (PageRank for fact/passage; freq for ontology)
    highlighted: boolean; // on the retrieval path
    conflict: boolean;
    sourceKind?: string;
    title: string;
}

export interface LayeredEdge {
    id: string;
    from: string;         // node id
    to: string;
    kind: 'schema' | 'fact' | 'bridge' | 'instantiation' | 'evidence';
    highlighted: boolean;
    cross: boolean;       // spans two layers
}

export interface LayerStat { shown: number; total: number; edges: number; }

export interface LayeredGraph {
    nodes: LayeredNode[];
    edges: LayeredEdge[];
    byId: Map<string, LayeredNode>;
    stats: Record<Layer, LayerStat>;
    queryActive: boolean;
    coreId: string | null;       // highest-PageRank fact entity (beam origin)
    conflictId: string | null;   // a conflicted entity (conflict-zone marker)
    totalEdges: number;
}

export interface LayeredInput {
    types: OntologyType[];
    schemaRelations: SchemaRelation[];
    entities: Entity[];
    facts: Fact[];
    passages: Passage[];
    bridges: GraphEdge[];
    resolutions?: ConflictResolution[];
    nodeScores?: Map<string, number> | null;
    rankedPassageIds?: string[];
}

export interface LayoutCaps {
    ontology?: number;
    fact?: number;
    passage?: number;
    maxEdges?: number;
}

const CAPS = { ontology: 36, fact: 110, passage: 140, maxEdges: 520 };
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ≈2.39996 rad

/** Even disc fill (sunflower / phyllotaxis). index 0 lands at the center. */
export function phyllotaxis(i: number, n: number): { u: number; v: number } {
    if (n <= 1 || i === 0) return { u: 0, v: 0 };
    const r = Math.sqrt(i / (n - 1));          // 0 (center) .. 1 (rim)
    const a = i * GOLDEN;
    return { u: r * Math.cos(a), v: r * Math.sin(a) };
}

function normalizer(vals: number[]): (v: number) => number {
    const mx = vals.length ? Math.max(...vals) : 0;
    const mn = vals.length ? Math.min(...vals) : 0;
    const span = mx - mn;
    return (v: number) => (span > 1e-9 ? (v - mn) / span : 0.5);
}

/**
 * Deterministic disc relaxation — pushes overlapping nodes apart within each
 * layer so dense rings read cleanly (the highest-PageRank node stays pinned at
 * the disc center as the beam origin). Pure: identical input → identical output.
 */
function relaxLayers(nodes: LayeredNode[]): void {
    const groups: Record<Layer, LayeredNode[]> = { ontology: [], fact: [], passage: [] };
    for (const n of nodes) groups[n.layer].push(n);
    (Object.keys(groups) as Layer[]).forEach((layer) => {
        const arr = groups[layer];
        if (arr.length < 2) return;
        const rad = arr.map((n) => 0.030 + n.score * 0.05);
        const pinned = arr.map((n) => n.u === 0 && n.v === 0); // center node = beam origin
        for (let it = 0; it < 80; it++) {
            for (let i = 0; i < arr.length; i++) {
                for (let j = i + 1; j < arr.length; j++) {
                    let dx = arr[j].u - arr[i].u, dy = arr[j].v - arr[i].v;
                    let d = Math.hypot(dx, dy);
                    const min = rad[i] + rad[j];
                    if (d > 1e-6 && d < min) {
                        const push = (min - d) / 2; dx /= d; dy /= d;
                        if (!pinned[i]) { arr[i].u -= dx * push; arr[i].v -= dy * push; }
                        if (!pinned[j]) { arr[j].u += dx * push; arr[j].v += dy * push; }
                    } else if (d <= 1e-6 && !pinned[j]) {
                        arr[j].u += 0.01 * (j + 1); arr[j].v += 0.008 * (j + 1);
                    }
                }
            }
            for (let i = 0; i < arr.length; i++) {
                if (pinned[i]) continue;
                const rr = Math.hypot(arr[i].u, arr[i].v);
                if (rr > 1) { arr[i].u = (arr[i].u / rr) * 0.98; arr[i].v = (arr[i].v / rr) * 0.98; }
            }
        }
    });
}

/** Build the positioned layered graph from real engine data (deterministic). */
export function buildLayeredGraph(input: LayeredInput, caps: LayoutCaps = {}): LayeredGraph {
    const C = { ...CAPS, ...caps };
    const score = (k: string) => input.nodeScores?.get(k) ?? 0;
    const conflictSubjects = new Set((input.resolutions ?? []).map((r) => r.conflict.subjectId));
    const ranked = new Set(input.rankedPassageIds ?? []);
    const queryActive = (input.nodeScores?.size ?? 0) > 0 || ranked.size > 0;

    // selection (highest-signal first)
    const topTypes = [...input.types].sort((a, b) => b.count - a.count).slice(0, C.ontology);
    const degree = new Map<string, number>();
    for (const f of input.facts) {
        degree.set(f.subjectId, (degree.get(f.subjectId) ?? 0) + 1);
        if (f.objectId) degree.set(f.objectId, (degree.get(f.objectId) ?? 0) + 1);
    }
    const topEntities = [...input.entities]
        .sort((a, b) => (score(`entity:${b.id}`) - score(`entity:${a.id}`)) || ((degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)) || a.id.localeCompare(b.id))
        .slice(0, C.fact);

    const passById = new Map(input.passages.map((p) => [p.id, p]));
    const orderedP: Passage[] = [];
    const seen = new Set<string>();
    for (const id of input.rankedPassageIds ?? []) { const p = passById.get(id); if (p && !seen.has(id)) { orderedP.push(p); seen.add(id); } }
    [...input.passages].sort((a, b) => score(`passage:${b.id}`) - score(`passage:${a.id}`) || a.id.localeCompare(b.id))
        .forEach((p) => { if (!seen.has(p.id)) { orderedP.push(p); seen.add(p.id); } });
    const topPassages = orderedP.slice(0, C.passage);

    const shownTypes = new Set(topTypes.map((t) => t.id));
    const shownEnts = new Set(topEntities.map((e) => e.id));
    const shownPass = new Set(topPassages.map((p) => p.id));

    const nodes: LayeredNode[] = [];
    const byId = new Map<string, LayeredNode>();
    const add = (n: LayeredNode) => { nodes.push(n); byId.set(n.id, n); };

    // Ontology disc
    const oN = normalizer(topTypes.map((t) => t.count));
    topTypes.forEach((t, i) => {
        const { u, v } = phyllotaxis(i, topTypes.length);
        add({ id: `type:${t.id}`, layer: 'ontology', kind: 'type', label: t.name, u, v, score: oN(t.count),
            highlighted: false, conflict: false, title: `${t.name} · ${t.count} instance${t.count === 1 ? '' : 's'}` });
    });

    // Fact disc — core (top score) at center.
    const eRaw = topEntities.map((e) => score(`entity:${e.id}`));
    const eN = normalizer(eRaw.some((s) => s > 0) ? eRaw : topEntities.map((e) => degree.get(e.id) ?? 0));
    let coreId: string | null = null;
    topEntities.forEach((e, i) => {
        const { u, v } = phyllotaxis(i, topEntities.length);
        const s = score(`entity:${e.id}`);
        const norm = eN(s || (degree.get(e.id) ?? 0));
        const id = `entity:${e.id}`;
        if (i === 0) coreId = id;
        add({ id, layer: 'fact', kind: 'entity', label: e.name, u, v, score: norm,
            highlighted: queryActive && s > 0, conflict: conflictSubjects.has(e.id),
            title: `${e.name}${s ? ` · PageRank ${s.toFixed(3)}` : ''}` });
    });
    const conflictId = topEntities.find((e) => conflictSubjects.has(e.id)) ? `entity:${topEntities.find((e) => conflictSubjects.has(e.id))!.id}` : null;

    // Passage disc
    topPassages.forEach((p, i) => {
        const { u, v } = phyllotaxis(i, topPassages.length);
        add({ id: `passage:${p.id}`, layer: 'passage', kind: 'passage', label: p.title || p.sourceId, u, v,
            score: score(`passage:${p.id}`), highlighted: ranked.has(p.id), conflict: false, sourceKind: p.sourceKind,
            title: `${p.sourceKind} · ${p.title || p.sourceId}` });
    });

    // De-overlap each disc (deterministic relaxation) so dense layers read clean.
    relaxLayers(nodes);

    // Edges (only between shown nodes; capped)
    const edges: LayeredEdge[] = [];
    const recordCounts: Record<Layer, number> = { ontology: 0, fact: 0, passage: 0 };
    const hi = (id: string) => byId.get(id)?.highlighted ?? false;
    const push = (id: string, from: string, to: string, kind: LayeredEdge['kind'], lyr: Layer | null) => {
        if (edges.length >= C.maxEdges) return;
        if (!byId.has(from) || !byId.has(to)) return;
        const a = byId.get(from)!, b = byId.get(to)!;
        edges.push({ id, from, to, kind, highlighted: hi(from) && hi(to), cross: a.layer !== b.layer });
        if (lyr) recordCounts[lyr]++;
    };
    for (const sr of input.schemaRelations)
        if (shownTypes.has(sr.subjectType) && shownTypes.has(sr.objectType) && sr.subjectType !== sr.objectType)
            push(`sch:${sr.id}`, `type:${sr.subjectType}`, `type:${sr.objectType}`, 'schema', 'ontology');
    for (const f of input.facts) {
        if (f.objectId && shownEnts.has(f.subjectId) && shownEnts.has(f.objectId))
            push(`fact:${f.id}`, `entity:${f.subjectId}`, `entity:${f.objectId}`, 'fact', 'fact');
        if (shownEnts.has(f.subjectId) && shownPass.has(f.passageId))
            push(`ev:${f.id}`, `entity:${f.subjectId}`, `passage:${f.passageId}`, 'evidence', 'passage');
    }
    for (const e of input.entities)
        if (shownEnts.has(e.id) && shownTypes.has(e.typeId))
            push(`inst:${e.id}`, `entity:${e.id}`, `type:${e.typeId}`, 'instantiation', null);
    input.bridges.forEach((br, i) => {
        const from = br.from.replace(/^entity:/, ''), to = br.to.replace(/^entity:/, '');
        if (shownEnts.has(from) && shownEnts.has(to) && from !== to)
            push(`br:${i}`, `entity:${from}`, `entity:${to}`, 'bridge', 'fact');
    });

    return {
        nodes, edges, byId, coreId, conflictId, queryActive, totalEdges: edges.length,
        stats: {
            ontology: { shown: topTypes.length, total: input.types.length, edges: recordCounts.ontology },
            fact: { shown: topEntities.length, total: input.entities.length, edges: recordCounts.fact },
            passage: { shown: topPassages.length, total: input.passages.length, edges: recordCounts.passage },
        },
    };
}

// ── Projection: planar (u,v) on a tilted disc → screen ──────────────────────
export interface Viewport { width: number; height: number; }
export interface Projected { x: number; y: number; depth: number; bright: number; rScale: number; }

const LAYER_CY: Record<Layer, number> = { ontology: 0.20, fact: 0.50, passage: 0.80 };

/** Project a layered node to screen coordinates with perspective foreshortening. */
export function projectNode(n: { layer: Layer; u: number; v: number }, vp: Viewport): Projected {
    const cx = vp.width / 2;
    const cy = LAYER_CY[n.layer] * vp.height;
    const rx = vp.width * 0.40;
    const ry = vp.height * 0.085;               // strong tilt (discs read as ellipses)
    const depth = (n.v + 1) / 2;                // 0 back … 1 front
    const x = cx + n.u * rx * (0.82 + 0.18 * depth); // mild convergence toward the back
    const y = cy + n.v * ry;
    return { x, y, depth, bright: 0.5 + depth * 0.5, rScale: 0.78 + depth * 0.6 };
}

/** Screen position of a layer's center (beam + wavefront origin). */
export function layerCenter(layer: Layer, vp: Viewport): { x: number; y: number } {
    return { x: vp.width / 2, y: LAYER_CY[layer] * vp.height };
}

// ── True-3D orbit projection (real perspective; planes are horizontal in world) ─
export interface Vec3 { x: number; y: number; z: number; }
export interface Camera { angle: number; pitch: number; dist: number; focal: number; }
export interface Projected3 { x: number; y: number; scale: number; camZ: number; focus: number; visible: boolean; }

const PLANE_Y: Record<Layer, number> = { ontology: 2.0, fact: 0, passage: -2.0 };

/** World-space position of a node: its layer sets the height plane; (u,v) place
 *  it on that horizontal plane (x = u, z = v). */
export function nodeWorld(n: { layer: Layer; u: number; v: number }): Vec3 {
    return { x: n.u, y: PLANE_Y[n.layer], z: n.v };
}

/** Screen-space world center of a layer plane (beam endpoints / wavefront origin). */
export function layerWorldCenter(layer: Layer): Vec3 { return { x: 0, y: PLANE_Y[layer], z: 0 }; }

export const DEFAULT_CAMERA: Camera = { angle: 0.62, pitch: 1.0, dist: 3.4, focal: 2.5 };

/**
 * Perspective projection with a Y-axis orbit + downward pitch — the three
 * horizontal planes read as stacked tilted discs (the concept), and orbiting
 * `angle` rotates the whole stack with genuine parallax. Returns screen coords,
 * a perspective scale, camera-space depth (for painter's-algorithm sorting), and
 * a `focus` distance from the focal plane (drives depth-of-field).
 */
export function project3D(p: Vec3, cam: Camera, vp: Viewport): Projected3 {
    const ca = Math.cos(cam.angle), sa = Math.sin(cam.angle);
    const x1 = p.x * ca - p.z * sa;
    const z1 = p.x * sa + p.z * ca;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const y2 = p.y * cp - z1 * sp;
    const z2 = p.y * sp + z1 * cp;
    const camZ = z2 + cam.dist;
    const persp = cam.focal / Math.max(0.25, camZ);
    const span = Math.min(vp.width, vp.height * 1.5) * 0.26;
    return {
        x: vp.width / 2 + x1 * persp * span,
        y: vp.height / 2 - y2 * persp * span,
        scale: persp,
        camZ,
        focus: Math.abs(camZ - cam.dist),
        visible: camZ > 0.3,
    };
}

// ── Real-data telemetry (drives the HUD sparkline baselines + readouts) ─────
export function telemetryBase(graph: LayeredGraph): { signal: number; flow: number; healing: number } {
    const nodes = graph.nodes.length || 1;
    const scored = graph.nodes.filter((n) => n.score > 0);
    const signal = scored.length ? scored.reduce((s, n) => s + n.score, 0) / scored.length : 0.3;
    const flow = Math.min(1, graph.totalEdges / (nodes * 2));
    const conflicts = graph.nodes.filter((n) => n.conflict).length;
    const healing = Math.min(1, conflicts / Math.max(3, nodes * 0.05));
    return { signal: Math.max(0.15, signal), flow: Math.max(0.1, flow), healing: Math.max(0.06, healing) };
}

// ── Deterministic helpers for ambient field + HUD sparklines ────────────────
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface AmbientParticle { layer: Layer; u: number; v: number; tw: number; vx: number; vy: number; }
/** A faint, slowly-drifting background field so sparse real data still reads as
 *  a dense network. vx/vy are small per-particle drift velocities (disc-space). */
export function ambientField(perLayer = 150, seed = 1337): AmbientParticle[] {
    const rnd = mulberry32(seed);
    const out: AmbientParticle[] = [];
    (['ontology', 'fact', 'passage'] as Layer[]).forEach((layer) => {
        for (let i = 0; i < perLayer; i++) {
            const r = Math.sqrt(rnd());
            const a = rnd() * Math.PI * 2;
            out.push({ layer, u: r * Math.cos(a), v: r * Math.sin(a), tw: rnd(), vx: (rnd() - 0.5) * 0.05, vy: (rnd() - 0.5) * 0.05 });
        }
    });
    return out;
}

/** Deterministic sparkline series in [0,1] (seeded smooth noise) for the HUD. */
export function sparkSeries(seed: number, len = 40, drift = 0): number[] {
    const rnd = mulberry32(seed);
    let y = 0.5;
    const out: number[] = [];
    for (let i = 0; i < len; i++) {
        y += (rnd() - 0.5) * 0.28 + drift * 0.01;
        y = Math.max(0.05, Math.min(0.95, y));
        out.push(y);
    }
    return out;
}

// ── Wave propagation (drives the wavefront + HUD time step + node reveal) ────
export interface WaveResult { arrival: Map<string, number>; maxStep: number; order: string[]; }

/**
 * Breadth-first, PageRank-style propagation from the query seed across the graph.
 * Returns the step at which the wave reaches each node (seed = step 0), the total
 * step count, and the visitation order. Deterministic (neighbours de-duped +
 * sorted). The renderer reveals nodes/edges as the wavefront arrives and shows
 * the live step in the HUD ("TIME STEP n / 64").
 */
export function propagateWave(graph: LayeredGraph, seedId?: string | null, maxSteps = 64): WaveResult {
    const seed = seedId ?? graph.coreId;
    const arrival = new Map<string, number>();
    const order: string[] = [];
    if (!seed || !graph.byId.has(seed)) return { arrival, maxStep: 0, order };
    const adj = new Map<string, string[]>();
    const link = (a: string, b: string) => {
        const list = adj.get(a) ?? (adj.set(a, []), adj.get(a)!);
        list.push(b);
    };
    for (const e of graph.edges) { link(e.from, e.to); link(e.to, e.from); }
    for (const [k, v] of adj) adj.set(k, [...new Set(v)].sort());
    arrival.set(seed, 0); order.push(seed);
    let frontier = [seed]; let step = 0;
    while (frontier.length && step < maxSteps) {
        const next: string[] = [];
        for (const n of frontier) for (const m of adj.get(n) ?? []) {
            if (!arrival.has(m)) { arrival.set(m, step + 1); order.push(m); next.push(m); }
        }
        frontier = next; step++;
    }
    return { arrival, maxStep: step, order };
}
