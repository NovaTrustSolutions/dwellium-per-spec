/**
 * forceLayout — a tiny dependency-free force-directed graph layout for the
 * Knowledge Graph (spec §7.5). Implements the same physics d3-force provides
 * (charge repulsion + link springs + centering + damping) without pulling in
 * the d3 dependency, so the build stays self-contained. Deterministic given a
 * fixed seed, so layouts are stable across renders and unit-testable.
 *
 * Also exposes pure graph helpers: building nodes/edges from file paths via
 * tag-overlap, connected-component communities (a lightweight stand-in for
 * Louvain), and structural-gap (isolated-node) detection.
 */

export interface GraphNode {
    id: string;          // file path
    label: string;       // file name
    group: string;       // domain (first path segment) — community/color key
    x: number; y: number; vx: number; vy: number;
    degree: number;
}
export interface GraphLink { source: string; target: string; }

/** Deterministic [0,1) PRNG (mulberry32) seeded from the node count. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Build graph nodes + tag-overlap edges from file paths. Two files are linked
 * when they share a Domain (first segment) AND a Project (second segment) —
 * the path-derived tag overlap. `group` is the domain.
 */
export function buildGraph(filePaths: string[]): { nodes: GraphNode[]; links: GraphLink[] } {
    const nodes: GraphNode[] = filePaths.map((p) => {
        const segs = p.split('/');
        return {
            id: p,
            label: segs[segs.length - 1],
            group: segs.length > 1 ? segs[0] : '(root)',
            x: 0, y: 0, vx: 0, vy: 0, degree: 0,
        };
    });
    const links: GraphLink[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < filePaths.length; i++) {
        for (let j = i + 1; j < filePaths.length; j++) {
            const a = filePaths[i].split('/');
            const b = filePaths[j].split('/');
            const sharedDomain = a[0] && a[0] === b[0];
            const sharedProject = a.length > 1 && b.length > 1 && a[1] === b[1];
            if (sharedDomain && sharedProject) {
                const key = `${filePaths[i]}|${filePaths[j]}`;
                if (!seen.has(key)) { seen.add(key); links.push({ source: filePaths[i], target: filePaths[j] }); }
            }
        }
    }
    const deg = new Map<string, number>();
    for (const l of links) { deg.set(l.source, (deg.get(l.source) ?? 0) + 1); deg.set(l.target, (deg.get(l.target) ?? 0) + 1); }
    for (const n of nodes) n.degree = deg.get(n.id) ?? 0;
    return { nodes, links };
}

/** Connected-component communities (lightweight Louvain stand-in). Returns a map id→componentIndex. */
export function communities(nodes: GraphNode[], links: GraphLink[]): Map<string, number> {
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const l of links) { adj.get(l.source)?.push(l.target); adj.get(l.target)?.push(l.source); }
    const comp = new Map<string, number>();
    let c = 0;
    for (const n of nodes) {
        if (comp.has(n.id)) continue;
        const stack = [n.id];
        comp.set(n.id, c);
        while (stack.length) {
            const cur = stack.pop()!;
            for (const nb of adj.get(cur) ?? []) if (!comp.has(nb)) { comp.set(nb, c); stack.push(nb); }
        }
        c++;
    }
    return comp;
}

/** Structural gaps = isolated nodes (degree 0). */
export function isolatedNodes(nodes: GraphNode[]): GraphNode[] {
    return nodes.filter((n) => n.degree === 0);
}

/**
 * Run the force simulation in-place, settling node x/y within [0,width]×[0,height].
 * Charge repulsion (O(n²) — fine for the small graphs here), link springs,
 * centering pull, velocity damping.
 */
export function simulate(
    nodes: GraphNode[],
    links: GraphLink[],
    opts: { width: number; height: number; iterations?: number } = { width: 600, height: 400 },
): void {
    const { width, height } = opts;
    const iterations = opts.iterations ?? 300;
    const cx = width / 2, cy = height / 2;
    const rand = rng(nodes.length * 2654435761 + links.length + 1);
    // Seed on a circle so the layout is deterministic.
    nodes.forEach((n, i) => {
        const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        const r = Math.min(width, height) * 0.3 * (0.6 + rand() * 0.4);
        n.x = cx + Math.cos(a) * r; n.y = cy + Math.sin(a) * r; n.vx = 0; n.vy = 0;
    });
    const linkDist = 70, charge = -1200, damping = 0.85, centerPull = 0.012;
    for (let it = 0; it < iterations; it++) {
        // Repulsion
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                let dx = a.x - b.x, dy = a.y - b.y;
                let d2 = dx * dx + dy * dy;
                if (d2 < 0.01) { dx = (rand() - 0.5); dy = (rand() - 0.5); d2 = 0.01; }
                const f = charge / d2;
                const d = Math.sqrt(d2);
                const fx = (dx / d) * f, fy = (dy / d) * f;
                a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
            }
        }
        // Link springs
        const byId = new Map(nodes.map((n) => [n.id, n]));
        for (const l of links) {
            const a = byId.get(l.source), b = byId.get(l.target);
            if (!a || !b) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const f = (d - linkDist) * 0.05;
            const fx = (dx / d) * f, fy = (dy / d) * f;
            a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
        // Centering + integrate + damp
        for (const n of nodes) {
            n.vx += (cx - n.x) * centerPull;
            n.vy += (cy - n.y) * centerPull;
            n.vx *= damping; n.vy *= damping;
            n.x += n.vx; n.y += n.vy;
            n.x = Math.max(16, Math.min(width - 16, n.x));
            n.y = Math.max(16, Math.min(height - 16, n.y));
        }
    }
}
