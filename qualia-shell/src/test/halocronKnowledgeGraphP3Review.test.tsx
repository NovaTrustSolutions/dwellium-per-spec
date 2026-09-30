/**
 * Plan 072 phase 3 — search + centring (C2), the accessible node list + canvas
 * semantics (C1), and PNG/JSON export (C3). Sister file to
 * `halocronKnowledgeGraphP2.test.tsx`; same mocking pattern (fake 2D context,
 * ResizeObserver shim, `setKgView('repos')`, a fixture graph via fetch mock).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import HalocronKnowledgeGraph from '../components/Shell/HalocronKnowledgeGraph';
import { halocronKnowledgeGraphStore, setKgView, type KgGraphData } from '../lib/halocronKnowledgeGraphStore';

vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: {} } }),
}));
vi.mock('../lib/llmClient', () => ({ callLlm: vi.fn() }));
vi.mock('../components/common/AgentEta', () => ({
    default: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock('../components/KnowledgeGraph/GraphifyView', () => ({
    default: () => <div data-testid="graphify-mock">graphify view</div>,
}));

class MockResizeObserver { observe = vi.fn(); disconnect = vi.fn(); }

function makeFakeCanvasContext(): CanvasRenderingContext2D {
    const gradient = { addColorStop: vi.fn() };
    return {
        clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
        arc: vi.fn(), createRadialGradient: vi.fn(() => gradient), setTransform: vi.fn(),
        set globalAlpha(_v: number) {}, get globalAlpha() { return 1; },
        set strokeStyle(_v: unknown) {}, get strokeStyle() { return ''; },
        set fillStyle(_v: unknown) {}, get fillStyle() { return ''; },
        set lineWidth(_v: number) {}, get lineWidth() { return 1; },
    } as unknown as CanvasRenderingContext2D;
}

// 3 file nodes + the 0 real links needed for these tests; labels chosen so a
// "window" query matches exactly 2 of them and excludes the god/agent nodes.
function fixtureGraph(): KgGraphData {
    return {
        files: 3, edges: 2, clusters: 2, tokens: 1000, usdPerSession: 0.01,
        importantFiles: [
            { name: 'WindowContext.tsx', score: 10, pct: 100 },
            { name: 'llmClient.ts', score: 6, pct: 60 },
        ],
        nodes: [
            { label: 'WindowContext.tsx', cluster: 0, importance: 10, deg: 1 },
            { label: 'llmClient.ts', cluster: 0, importance: 6, deg: 1 },
            { label: 'windowState.ts', cluster: 1, importance: 3, deg: 0 },
        ],
        links: [[0, 1]],
        builtAt: '2026-09-01T00:00:00.000Z',
        source: 'static-import-graph',
    };
}


describe('Knowledge Graph P3 review', () => {
    beforeEach(() => {
        localStorage.clear();
        halocronKnowledgeGraphStore.reset();
        vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeFakeCanvasContext());
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('two mounted instances get distinct ids, and arrow keys move focus within their own tablist', () => {
        const { container } = render(<><div data-i="1"><HalocronKnowledgeGraph /></div><div data-i="2"><HalocronKnowledgeGraph /></div></>);
        const ids = Array.from(container.querySelectorAll('[id]')).map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        const second = container.querySelector('[data-i="2"]') as HTMLElement;
        const [mine, repos] = within(second).getAllByRole('tab');
        mine.focus();
        act(() => { fireEvent.keyDown(mine, { key: 'ArrowRight' }); });
        expect(document.activeElement).toBe(repos);
    });

    it('the canvas summary does not claim "0 of 0 files" while the graph is loading or failed', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => null })));
        setKgView('repos');
        const { container } = render(<HalocronKnowledgeGraph />);
        const canvas = container.querySelector('canvas') as HTMLCanvasElement;
        await waitFor(() => expect(canvas.getAttribute('aria-label')).toMatch(/couldn't load/));
        expect(canvas.getAttribute('aria-label')).not.toMatch(/0 of 0/);
    });
});
