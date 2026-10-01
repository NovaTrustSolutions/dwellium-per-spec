/**
 * Plan 072 phase 5 — fixes from the other session's review of #174: no nested
 * interactive tab controls, no hard-coded file list under other repos, honest
 * GitHub wording in the "Ask the map" seed, "Match X of N", PNG failure message.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import HalocronKnowledgeGraph from '../components/Shell/HalocronKnowledgeGraph';
import { callLlm } from '../lib/llmClient';
import { halocronKnowledgeGraphStore, setKgView, upsertKgProject, type KgGraphData } from '../lib/halocronKnowledgeGraphStore';

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

describe('HalocronKnowledgeGraph phase 5 review fixes', () => {
    beforeEach(() => {
        localStorage.clear();
        halocronKnowledgeGraphStore.reset();
        vi.stubGlobal('ResizeObserver', MockResizeObserver);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeFakeCanvasContext());
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => fixtureGraph() })));
        setKgView('repos');
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.restoreAllMocks(); });

    it('project tabs have no nested interactive controls: the tab body is a button, × is its sibling', async () => {
        upsertKgProject({ id: 'gh-acme-w', name: 'w', lang: 'TS', files: 3, clusters: 1, blurb: '' }, { ...fixtureGraph(), source: 'github-tree' });
        const { container } = render(<HalocronKnowledgeGraph />);
        const tabs = Array.from(container.querySelectorAll('.kg-tab'));
        expect(tabs.length).toBeGreaterThan(1);
        for (const t of tabs) {
            expect(t.getAttribute('role')).toBeNull();
            for (const b of Array.from(t.querySelectorAll('button'))) expect(b.querySelector('button, [role="button"]')).toBeNull();
        }
        const userTab = tabs.find((t) => t.querySelector('.kg-tab__remove'))!;
        expect(userTab.querySelector('.kg-tab__main')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('while a graph is loading, "Most important files" shows no hard-coded file names', () => {
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
        const { container } = render(<HalocronKnowledgeGraph />);
        const text = container.querySelector('.kg-rail')!.textContent ?? '';
        expect(text).toContain('Loading…');
        expect(text).not.toMatch(/widgetRegistry\.ts|WindowContext\.tsx|oneSaveClient\.ts/);
    });

    it('the "Ask the map" seed never claims imports for a GitHub (structure-only) repo', async () => {
        vi.mocked(callLlm).mockResolvedValue({ text: 'ok', provider: 'anthropic', model: 't' });
        upsertKgProject({ id: 'gh-acme-w', name: 'w', lang: 'TS', files: 3, clusters: 1, blurb: '' }, { ...fixtureGraph(), source: 'github-tree' });
        const { container } = render(<HalocronKnowledgeGraph />);
        const input = container.querySelector<HTMLInputElement>('.kg-chat__input')!;
        fireEvent.change(input, { target: { value: 'what is here?' } });
        await act(async () => { fireEvent.click(container.querySelector('.kg-chat__send')!); await Promise.resolve(); });
        const system = vi.mocked(callLlm).mock.calls[0][0].systemPrompt ?? '';
        expect(system).not.toMatch(/importers|import edges|most-depended-on/i);
        expect(system).toMatch(/no import information/);
    });

    it('cycling with Enter announces "Match X of N"', async () => {
        const { container, getByLabelText } = render(<HalocronKnowledgeGraph />);
        await waitFor(() => expect(container.querySelector('.kg-live')).not.toBeNull());
        const input = getByLabelText('Search files in this map');
        fireEvent.change(input, { target: { value: 'window' } });
        await waitFor(() => expect(container.querySelector('.kg-search__status')?.textContent).toBe('2 matches'));
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(container.querySelector('.kg-search__status')?.textContent).toBe('Match 1 of 2'));
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(container.querySelector('.kg-search__status')?.textContent).toBe('Match 2 of 2'));
    });

    it('Export PNG says so when the browser cannot produce an image', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(null));
        const { container, getByText } = render(<HalocronKnowledgeGraph />);
        await waitFor(() => expect(container.querySelector('.kg-live')).not.toBeNull());
        fireEvent.click(getByText('Export PNG'));
        await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/Couldn.t create the image/));
    });
});
