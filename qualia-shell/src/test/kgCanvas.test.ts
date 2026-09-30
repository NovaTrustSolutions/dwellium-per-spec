import { describe, it, expect } from 'vitest';
import {
    seedFor, forceLayout, buildGraph, pickNearest, neighbours, rescale, matchNodes, centreOn, toExportJson, type KgNode,
} from '../components/Shell/kgCanvas';
import type { KgAgent } from '../components/Shell/HalocronKnowledgeGraph.agents';
import type { KgGraphData, KgProject } from '../lib/halocronKnowledgeGraphStore';

const AGENTS: KgAgent[] = [
    { id: 'hermes', name: 'Hermes', god: 'Messenger', color: '#e7c879' },
];

const PROJECT: KgProject = { id: 'p1', name: 'p1', lang: 'TS', files: 100, clusters: 28, blurb: '' };

function gdata(nodeCount: number, linkCount = 0): KgGraphData {
    const nodes = Array.from({ length: nodeCount }, (_, i) => ({ label: `f${i}`, cluster: i % 3, importance: 1, deg: 0 }));
    const links: [number, number][] = [];
    for (let i = 0; i < linkCount; i++) links.push([i % nodeCount, (i + 1) % nodeCount]);
    return {
        files: nodeCount, edges: links.length, clusters: 3, tokens: 0, usdPerSession: 0,
        importantFiles: [], nodes, links, builtAt: new Date(0).toISOString(),
    };
}

describe('seedFor', () => {
    it('is stable across calls', () => {
        expect(seedFor('project-a')).toBe(seedFor('project-a'));
    });
    it('differs for different ids', () => {
        expect(seedFor('project-a')).not.toBe(seedFor('project-b'));
    });
});

describe('buildGraph determinism', () => {
    it('same seed -> identical positions', () => {
        const a = buildGraph(PROJECT, 800, 520, gdata(30, 20), AGENTS, 42);
        const b = buildGraph(PROJECT, 800, 520, gdata(30, 20), AGENTS, 42);
        expect(a.nodes).toEqual(b.nodes);
    });
    it('different seed -> different positions', () => {
        const a = buildGraph(PROJECT, 800, 520, gdata(30, 20), AGENTS, 1);
        const b = buildGraph(PROJECT, 800, 520, gdata(30, 20), AGENTS, 2);
        expect(a.nodes).not.toEqual(b.nodes);
    });
    it('data=null returns fallback nodes with agents appended last, cluster -1', () => {
        const { nodes } = buildGraph(PROJECT, 800, 520, null, AGENTS, 7);
        const agentNodes = nodes.slice(-AGENTS.length);
        expect(agentNodes).toHaveLength(1);
        expect(agentNodes[0].cluster).toBe(-1);
        expect(agentNodes[0].importance).toBe(100);
        expect(agentNodes[0].god).toBe(AGENTS[0]);
        expect(nodes.length).toBeGreaterThan(AGENTS.length);
    });
    it('no NaN/Infinity even with all nodes coincident', () => {
        const nodes: KgNode[] = Array.from({ length: 50 }, () => ({
            x: 0, y: 0, hx: 0, hy: 0, vx: 0, vy: 0, r: 2, cluster: 0, label: 'n', importance: 0,
        }));
        forceLayout(nodes, [], 100, 80, (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })());
        for (const n of nodes) {
            expect(Number.isFinite(n.x)).toBe(true);
            expect(Number.isFinite(n.y)).toBe(true);
        }
    });
});

describe('pickNearest', () => {
    it('picks the nearest node, not the last one found within range (B1 counterexample)', () => {
        const nodes = [
            { x: 5, y: 0, r: 2 },   // d=5 from origin
            { x: 12, y: 0, r: 20 }, // d=12 from origin, big radius
        ];
        expect(pickNearest(nodes, 0, 0, 1)).toBe(0);
    });
    it('returns -1 when nothing in range', () => {
        const nodes = [{ x: 1000, y: 1000, r: 1 }];
        expect(pickNearest(nodes, 0, 0, 1)).toBe(-1);
    });
    it('respects zoom (16/zoom threshold)', () => {
        const nodes = [{ x: 20, y: 0, r: 1 }];
        expect(pickNearest(nodes, 0, 0, 1)).toBe(-1); // 16/1=16 < 20, r+6=7 < 20
        expect(pickNearest(nodes, 0, 0, 0.2)).toBe(0); // 16/0.2=80 > 20
    });
});

describe('neighbours', () => {
    it('is unique, sorted, and counts both link directions', () => {
        const links: [number, number][] = [[0, 2], [2, 0], [1, 2], [2, 3]];
        expect(neighbours(links, 2)).toEqual([0, 1, 3]);
    });
});

describe('rescale', () => {
    it('scales x/y/hx/hy proportionally', () => {
        const nodes: KgNode[] = [{ x: 10, y: 20, hx: 10, hy: 20, vx: 0, vy: 0, r: 1, cluster: 0, label: 'n', importance: 0 }];
        rescale(nodes, 100, 100, 200, 50);
        expect(nodes[0]).toMatchObject({ x: 20, y: 10, hx: 20, hy: 10 });
    });
    it('is a no-op on zero size', () => {
        const nodes: KgNode[] = [{ x: 10, y: 20, hx: 10, hy: 20, vx: 0, vy: 0, r: 1, cluster: 0, label: 'n', importance: 0 }];
        rescale(nodes, 0, 100, 200, 50);
        expect(nodes[0]).toMatchObject({ x: 10, y: 20, hx: 10, hy: 20 });
    });
    it('is a no-op when from === to', () => {
        const nodes: KgNode[] = [{ x: 10, y: 20, hx: 10, hy: 20, vx: 0, vy: 0, r: 1, cluster: 0, label: 'n', importance: 0 }];
        rescale(nodes, 100, 100, 100, 100);
        expect(nodes[0]).toMatchObject({ x: 10, y: 20, hx: 10, hy: 20 });
    });
});

describe('matchNodes', () => {
    const NODES: Pick<KgNode, 'label' | 'god'>[] = [
        { label: 'WindowContext.tsx' },
        { label: 'llmClient.ts' },
        { label: 'Hermes', god: AGENTS[0] },
        { label: 'windowState.ts' },
    ];
    it('matches case-insensitively, in stable ascending index order', () => {
        expect(matchNodes(NODES, 'window')).toEqual([0, 3]);
    });
    it('excludes god/agent nodes even when the label matches', () => {
        expect(matchNodes(NODES, 'hermes')).toEqual([]);
    });
    it('returns [] for an empty (or whitespace-only) query', () => {
        expect(matchNodes(NODES, '')).toEqual([]);
        expect(matchNodes(NODES, '   ')).toEqual([]);
    });
});

describe('centreOn', () => {
    it('places the node at the centre of a w x h canvas, keeping zoom', () => {
        const view = centreOn({ zoom: 2, ox: 5, oy: 5 }, { x: 40, y: 30 }, 800, 520);
        expect(view.zoom).toBe(2);
        // screen = ox + x*zoom must equal w/2, h/2
        expect(view.ox + 40 * view.zoom).toBeCloseTo(400);
        expect(view.oy + 30 * view.zoom).toBeCloseTo(260);
    });
});

describe('toExportJson', () => {
    it('has no positions, no god nodes, and correct degree from the given links', () => {
        const g = gdata(3, 0);
        const links: [number, number][] = [[0, 1], [0, 2]];
        const out = toExportJson({ id: 'p1', name: 'Project One' }, g, links);
        expect(out.project).toEqual({ id: 'p1', name: 'Project One' });
        expect(out.builtAt).toBe(g.builtAt);
        expect(out.links).toEqual(links);
        expect(out.nodes).toHaveLength(3);
        expect(out.nodes.every((n) => !('x' in n) && !('y' in n))).toBe(true);
        expect(out.nodes[0]).toEqual({ label: 'f0', cluster: 0, importance: 1, degree: 2 });
        expect(out.nodes[1]).toEqual({ label: 'f1', cluster: 1, importance: 1, degree: 1 });
        expect(out.nodes[2]).toEqual({ label: 'f2', cluster: 2, importance: 1, degree: 1 });
    });
});
