/**
 * Knowledge Graph force layout + graph helpers (spec §7.5).
 */
import { describe, it, expect } from 'vitest';
import { buildGraph, communities, isolatedNodes, simulate } from '../components/KnowledgeGraph/forceLayout';

describe('buildGraph', () => {
    it('links files that share domain + project; not cross-domain', () => {
        const { nodes, links } = buildGraph([
            'Acme/Reno/a.md',
            'Acme/Reno/b.md',     // same domain+project as a → linked
            'Acme/Legal/c.md',    // same domain, diff project → not linked
            'Beta/Reno/d.md',     // diff domain → not linked
        ]);
        expect(nodes).toHaveLength(4);
        expect(links).toHaveLength(1);
        expect(links[0]).toEqual({ source: 'Acme/Reno/a.md', target: 'Acme/Reno/b.md' });
        const a = nodes.find((n) => n.id === 'Acme/Reno/a.md')!;
        expect(a.degree).toBe(1);
        expect(a.group).toBe('Acme');
    });
});

describe('communities + gaps', () => {
    it('groups connected nodes and finds isolated ones', () => {
        const { nodes, links } = buildGraph([
            'D/P/a.md', 'D/P/b.md',   // connected pair
            'E/Q/solo.md',            // isolated (own domain+project)
        ]);
        const comp = communities(nodes, links);
        expect(comp.get('D/P/a.md')).toBe(comp.get('D/P/b.md')); // same component
        expect(comp.get('E/Q/solo.md')).not.toBe(comp.get('D/P/a.md'));
        const iso = isolatedNodes(nodes).map((n) => n.id);
        expect(iso).toEqual(['E/Q/solo.md']);
    });
});

describe('simulate', () => {
    it('keeps nodes within bounds and is deterministic', () => {
        const mk = () => buildGraph(['D/P/a.md', 'D/P/b.md', 'D/P/c.md']);
        const g1 = mk(); simulate(g1.nodes, g1.links, { width: 600, height: 400, iterations: 120 });
        const g2 = mk(); simulate(g2.nodes, g2.links, { width: 600, height: 400, iterations: 120 });
        for (const n of g1.nodes) {
            expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x).toBeLessThanOrEqual(600);
            expect(n.y).toBeGreaterThanOrEqual(0); expect(n.y).toBeLessThanOrEqual(400);
            expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
        }
        // Determinism: same seed/input → same settled positions.
        expect(g1.nodes.map((n) => [Math.round(n.x), Math.round(n.y)]))
            .toEqual(g2.nodes.map((n) => [Math.round(n.x), Math.round(n.y)]));
    });
});
