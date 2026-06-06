/**
 * Anti-fragmentation bridging — offline methods that keep the graph from
 * breaking into disconnected "islands" that would block multi-hop retrieval.
 *
 *   • Type-based: link entities that share a high-level ontology type, so any
 *     two same-type entities are reachable (a connected component per type).
 *   • Similarity-based: link entities whose embeddings are highly similar
 *     (cosine ≥ threshold), drawing connections across document boundaries.
 *
 * Both return `GraphEdge[]` with `entity:`-prefixed node ids, ready to drop
 * straight into `buildHeteroGraph`.
 */
import type { Entity, GraphEdge } from './types';
import { cosine } from './embedding';
import { ENTITY } from './pagerank';

/**
 * Connect same-type entities. To stay O(n) per type (not O(n²)), each type's
 * entities form a hub+chain: every entity links to the type's first entity
 * (hub) and to the next one (chain) — guaranteeing one connected component per
 * type without an edge explosion.
 */
export function typeBasedBridges(entities: Entity[], weight = 0.3): GraphEdge[] {
    const byType = new Map<string, Entity[]>();
    for (const e of entities) {
        if (!byType.has(e.typeId)) byType.set(e.typeId, []);
        byType.get(e.typeId)!.push(e);
    }
    const edges: GraphEdge[] = [];
    for (const group of byType.values()) {
        if (group.length < 2) continue;
        const hub = group[0];
        for (let i = 1; i < group.length; i++) {
            edges.push({ from: ENTITY(hub.id), to: ENTITY(group[i].id), weight, kind: 'type-bridge' });
            if (i > 1) edges.push({ from: ENTITY(group[i - 1].id), to: ENTITY(group[i].id), weight: weight * 0.6, kind: 'type-bridge' });
        }
    }
    return edges;
}

/**
 * Link entities whose embeddings exceed a cosine threshold. Each entity keeps
 * at most `maxPerNode` strongest neighbours to bound density. Symmetric
 * duplicates are de-duped.
 */
export function similarityBridges(
    vectors: Map<string, number[]>,
    opts: { threshold?: number; maxPerNode?: number; weight?: number } = {},
): GraphEdge[] {
    const threshold = opts.threshold ?? 0.6;
    const maxPerNode = opts.maxPerNode ?? 5;
    const ids = [...vectors.keys()];
    const seen = new Set<string>();
    const edges: GraphEdge[] = [];

    for (let i = 0; i < ids.length; i++) {
        const a = ids[i];
        const va = vectors.get(a)!;
        const neighbours: Array<{ id: string; sim: number }> = [];
        for (let j = 0; j < ids.length; j++) {
            if (i === j) continue;
            const sim = cosine(va, vectors.get(ids[j])!);
            if (sim >= threshold) neighbours.push({ id: ids[j], sim });
        }
        neighbours.sort((x, y) => y.sim - x.sim);
        for (const { id: b, sim } of neighbours.slice(0, maxPerNode)) {
            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push({ from: ENTITY(a), to: ENTITY(b), weight: (opts.weight ?? 0.4) * sim, kind: 'similarity-bridge' });
        }
    }
    return edges;
}
