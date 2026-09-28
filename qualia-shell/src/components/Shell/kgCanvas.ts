/**
 * kgCanvas — deterministic, framework-free extraction of the KG "code repos"
 * canvas math (plan 072 phase 2, findings B1/B2). Pulled out of
 * HalocronKnowledgeGraph.tsx so it can be unit-tested without a <canvas>: the
 * force layout, graph builder, and click hit-test all take an explicit `rand`
 * (via `seedFor` + `mulberry32`) instead of `Math.random`, so the same seed
 * always produces the same node positions.
 *
 * Colour is intentionally NOT stored on KgNode — the caller resolves cluster
 * index (or god.color) against the active theme at draw time.
 */
import { mulberry32 } from '../MemoryGraphRAG/layeredLayout';
import type { KgAgent } from './HalocronKnowledgeGraph.agents';
import type { KgGraphData, KgProject } from '../../lib/halocronKnowledgeGraphStore';

export interface KgNode {
    x: number; y: number; hx: number; hy: number; vx: number; vy: number;
    r: number; cluster: number; label: string; god?: KgAgent; importance: number;
}

/** Stable 32-bit hash of a string key (e.g. a project id) for use as a mulberry32 seed. */
export function seedFor(key: string): number {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// Real Fruchterman-Reingold force layout — identical to the reference implementation
// except every source of randomness comes from `rand`, so results are reproducible.
export function forceLayout(nodes: KgNode[], links: [number, number][], w: number, h: number, rand: () => number): void {
    const n = nodes.length;
    if (!n) return;
    const k = Math.sqrt((w * h) / n) * 0.8;
    const iters = n > 350 ? 90 : 150;
    const capSq = (k * 6) * (k * 6);
    let temp = Math.min(w, h) * 0.18;
    const cool = temp / (iters + 1);
    for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n; i++) { nodes[i].vx = 0; nodes[i].vy = 0; }
        for (let i = 0; i < n; i++) {
            const a = nodes[i];
            for (let j = i + 1; j < n; j++) {
                const b = nodes[j];
                let dx = a.x - b.x, dy = a.y - b.y;
                let d2 = dx * dx + dy * dy;
                if (d2 < 0.01) { d2 = 0.01; dx = rand() - 0.5; dy = rand() - 0.5; }
                if (d2 > capSq) continue;
                const f = (k * k) / d2;
                a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
            }
        }
        for (const [s, t] of links) {
            const a = nodes[s], b = nodes[t]; if (!a || !b) continue;
            let dx = a.x - b.x, dy = a.y - b.y;
            const dist = Math.hypot(dx, dy) || 0.01;
            const f = (dist * dist) / k;
            const fx = (dx / dist) * f, fy = (dy / dist) * f;
            a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
        }
        for (let i = 0; i < n; i++) {
            const a = nodes[i];
            const disp = Math.hypot(a.vx, a.vy) || 0.01;
            a.x += (a.vx / disp) * Math.min(disp, temp);
            a.y += (a.vy / disp) * Math.min(disp, temp);
            a.x += (w / 2 - a.x) * 0.022; a.y += (h / 2 - a.y) * 0.022;
        }
        temp = Math.max(temp - cool, 1);
    }
    for (const a of nodes) { a.hx = a.x; a.hy = a.y; a.vx = 0; a.vy = 0; }
}

// Build the render graph. When `data` is present, nodes/edges/clusters/importance
// are real; otherwise a representative fallback is generated from project stats.
// Agent "god nodes" are always appended last, overlaid near center.
export function buildGraph(project: KgProject, w: number, h: number, data: KgGraphData | null, agents: readonly KgAgent[], seed: number): { nodes: KgNode[]; links: [number, number][] } {
    const rand = mulberry32(seed);
    const nodes: KgNode[] = [];
    const links: [number, number][] = [];

    if (data && data.nodes.length) {
        const clusterCount = Math.max(1, data.clusters);
        const centers = Array.from({ length: clusterCount }, (_, i) => {
            const ang = (i / clusterCount) * Math.PI * 2;
            const rad = Math.min(w, h) * 0.32;
            return { x: w / 2 + Math.cos(ang) * rad, y: h / 2 + Math.sin(ang) * rad };
        });
        const maxImp = Math.max(1, ...data.nodes.map((n) => n.importance));
        data.nodes.forEach((n) => {
            const ctr = centers[n.cluster % clusterCount] ?? { x: w / 2, y: h / 2 };
            const spread = 60 + rand() * 80;
            const a = rand() * Math.PI * 2;
            const x = ctr.x + Math.cos(a) * spread * rand();
            const y = ctr.y + Math.sin(a) * spread * rand();
            nodes.push({
                x, y, hx: x, hy: y, vx: 0, vy: 0,
                r: 1.6 + (n.importance / maxImp) * 5,
                cluster: n.cluster, label: n.label, importance: n.importance,
            });
        });
        data.links.forEach(([a, b]) => { if (a < nodes.length && b < nodes.length) links.push([a, b]); });
    } else {
        const clusterCount = Math.min(8, Math.max(4, Math.round(project.clusters / 14)));
        const centers = Array.from({ length: clusterCount }, (_, i) => {
            const ang = (i / clusterCount) * Math.PI * 2;
            const rad = Math.min(w, h) * 0.30;
            return { x: w / 2 + Math.cos(ang) * rad, y: h / 2 + Math.sin(ang) * rad };
        });
        const total = Math.min(160, Math.max(60, Math.round(project.files / 7)));
        for (let i = 0; i < total; i++) {
            const cl = i % clusterCount; const ctr = centers[cl];
            const a = rand() * Math.PI * 2; const spread = 70 + rand() * 70;
            const x = ctr.x + Math.cos(a) * spread * rand(), y = ctr.y + Math.sin(a) * spread * rand();
            nodes.push({ x, y, hx: x, hy: y, vx: 0, vy: 0, r: 1.6 + rand() * 2.6, cluster: cl, label: `file-${i}`, importance: 0 });
        }
    }

    forceLayout(nodes, links, w, h, rand);

    agents.forEach((g, i) => {
        const a = (i / agents.length) * Math.PI * 2;
        const rad = Math.min(w, h) * 0.13;
        const x = w / 2 + Math.cos(a) * rad, y = h / 2 + Math.sin(a) * rad;
        nodes.push({ x, y, hx: x, hy: y, vx: 0, vy: 0, r: 9, cluster: -1, label: g.name, god: g, importance: 100 });
    });
    return { nodes, links };
}

// Index of the NEAREST node within hit range, or -1. (B1: the reference click
// handler kept the LAST node found within range, not the nearest — e.g. a node
// at distance 5 examined before a node at distance 12 with a bigger radius
// would be displaced by the second, farther node. This picks the true nearest.)
export function pickNearest(nodes: readonly { x: number; y: number; r: number }[], wx: number, wy: number, zoom: number): number {
    const baseRange = 16 / zoom;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const d = Math.hypot(n.x - wx, n.y - wy);
        const range = Math.max(baseRange, n.r + 6);
        if (d < range && d < bestD) { best = i; bestD = d; }
    }
    return best;
}

/** Unique, ascending neighbour indices of node `i`, counting both link directions. */
export function neighbours(links: readonly [number, number][], i: number): number[] {
    const set = new Set<number>();
    for (const [a, b] of links) {
        if (a === i) set.add(b);
        else if (b === i) set.add(a);
    }
    return Array.from(set).sort((a, b) => a - b);
}

/** Scales x/y/hx/hy proportionally for a canvas resize; no-op if the size is unchanged or invalid. */
export function rescale(nodes: KgNode[], fromW: number, fromH: number, toW: number, toH: number): void {
    if (fromW <= 0 || fromH <= 0 || toW <= 0 || toH <= 0) return;
    if (fromW === toW && fromH === toH) return;
    const sx = toW / fromW, sy = toH / fromH;
    for (const n of nodes) {
        n.x *= sx; n.y *= sy; n.hx *= sx; n.hy *= sy;
    }
}
