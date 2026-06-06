/**
 * Heterogeneous graph construction + Personalized PageRank.
 *
 * Nodes are entities (`entity:<id>`) and passages (`passage:<id>`). Edges come
 * from facts (entity↔entity), evidence (entity↔passage), and the offline
 * bridges (type / similarity). Online retrieval seeds a reset distribution over
 * query-relevant nodes and lets "semantic energy" propagate via PPR, surfacing
 * the most critical entities + passages — Step 3 of the pipeline.
 *
 * Pure + deterministic: given the same graph + reset vector it always returns
 * the same scores, so it is fully unit-testable.
 */
import type { Fact, Passage, GraphEdge, HeteroGraph } from './types';

export const ENTITY = (id: string) => `entity:${id}`;
export const PASSAGE = (id: string) => `passage:${id}`;

export interface PageRankOptions {
    /** Teleport probability (restart). Higher = stay closer to the seeds. */
    alpha?: number;
    maxIter?: number;
    tol?: number;
}

/**
 * Build the heterogeneous graph from the fact + passage layers plus the
 * precomputed bridge edges. Fact and evidence edges are treated as undirected
 * (energy flows both ways) by emitting symmetric adjacency at PPR time.
 */
export function buildHeteroGraph(facts: Fact[], passages: Passage[], bridges: GraphEdge[]): HeteroGraph {
    const nodeSet = new Set<string>();
    const edges: GraphEdge[] = [];

    for (const p of passages) nodeSet.add(PASSAGE(p.id));

    for (const f of facts) {
        const subj = ENTITY(f.subjectId);
        nodeSet.add(subj);
        if (!f.objectLiteral) {
            const obj = ENTITY(f.objectId);
            nodeSet.add(obj);
            edges.push({ from: subj, to: obj, weight: Math.max(0.1, f.confidence), kind: 'fact' });
        }
        // evidence tether: entities ↔ the passage that grounds the fact
        if (f.passageId) {
            const pid = PASSAGE(f.passageId);
            nodeSet.add(pid);
            edges.push({ from: subj, to: pid, weight: 0.5, kind: 'evidence' });
            if (!f.objectLiteral) edges.push({ from: ENTITY(f.objectId), to: pid, weight: 0.5, kind: 'evidence' });
        }
    }

    for (const b of bridges) {
        nodeSet.add(b.from);
        nodeSet.add(b.to);
        edges.push(b);
    }

    return { nodes: [...nodeSet], edges };
}

/** Normalize a (possibly partial / unnormalized) reset map into a distribution over `nodes`. */
function normalizeReset(nodes: string[], reset: Map<string, number>): Map<string, number> {
    const p = new Map<string, number>();
    let total = 0;
    for (const n of nodes) {
        const v = Math.max(0, reset.get(n) ?? 0);
        if (v > 0) total += v;
    }
    if (total === 0) {
        // uniform teleport when no seeds
        const u = 1 / Math.max(1, nodes.length);
        for (const n of nodes) p.set(n, u);
        return p;
    }
    for (const n of nodes) p.set(n, (Math.max(0, reset.get(n) ?? 0)) / total);
    return p;
}

/**
 * Personalized PageRank via power iteration.
 *   r = alpha * p  +  (1 - alpha) * (Wᵀ r)   (+ dangling mass → p)
 * where W is the row-normalized symmetric adjacency and p is the reset vector.
 */
export function personalizedPageRank(
    nodes: string[],
    edges: GraphEdge[],
    reset: Map<string, number>,
    opts: PageRankOptions = {},
): Map<string, number> {
    const alpha = opts.alpha ?? 0.15;
    const maxIter = opts.maxIter ?? 100;
    const tol = opts.tol ?? 1e-8;
    if (nodes.length === 0) return new Map();

    const p = normalizeReset(nodes, reset);

    // Build symmetric weighted adjacency + out-weight totals.
    const adj = new Map<string, Array<{ to: string; w: number }>>();
    const outW = new Map<string, number>();
    for (const n of nodes) { adj.set(n, []); outW.set(n, 0); }
    const addDir = (from: string, to: string, w: number) => {
        if (!adj.has(from) || !adj.has(to)) return;
        adj.get(from)!.push({ to, w });
        outW.set(from, (outW.get(from) ?? 0) + w);
    };
    for (const e of edges) {
        const w = Math.max(0, e.weight);
        if (w === 0) continue;
        addDir(e.from, e.to, w);
        addDir(e.to, e.from, w); // symmetric
    }

    let r = new Map<string, number>();
    for (const n of nodes) r.set(n, p.get(n) ?? 0);

    for (let iter = 0; iter < maxIter; iter++) {
        const next = new Map<string, number>();
        for (const n of nodes) next.set(n, alpha * (p.get(n) ?? 0));

        let dangling = 0;
        for (const n of nodes) {
            const rn = r.get(n) ?? 0;
            const ow = outW.get(n) ?? 0;
            if (ow === 0) { dangling += rn; continue; }
            const share = (1 - alpha) * rn;
            for (const { to, w } of adj.get(n)!) {
                next.set(to, (next.get(to) ?? 0) + (share * w) / ow);
            }
        }
        // dangling nodes teleport their mass according to p
        if (dangling > 0) {
            const dm = (1 - alpha) * dangling;
            for (const n of nodes) next.set(n, (next.get(n) ?? 0) + dm * (p.get(n) ?? 0));
        }

        // convergence (L1)
        let diff = 0;
        for (const n of nodes) diff += Math.abs((next.get(n) ?? 0) - (r.get(n) ?? 0));
        r = next;
        if (diff < tol) break;
    }
    return r;
}

/** Sort node ids by descending score, filtered by a prefix (e.g. 'passage:'). */
export function topNodes(scores: Map<string, number>, prefix: string, limit: number): Array<{ id: string; score: number }> {
    const out: Array<{ id: string; score: number }> = [];
    for (const [id, score] of scores) if (id.startsWith(prefix)) out.push({ id: id.slice(prefix.length), score });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
}
