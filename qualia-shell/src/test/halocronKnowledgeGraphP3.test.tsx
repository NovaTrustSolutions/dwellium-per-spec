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

describe('HalocronKnowledgeGraph phase 3 (C1-C3)', () => {
    beforeEach(() => {
        localStorage.clear();
        halocronKnowledgeGraphStore.reset();
        vi.stubGlobal('ResizeObserver', MockResizeObserver);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeFakeCanvasContext());
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
            ok: true, status: 200, json: async () => fixtureGraph(),
        })));
        setKgView('repos');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('canvas has role=img and an aria-label naming the project and counts', async () => {
        const { container } = render(<HalocronKnowledgeGraph />);
        await waitFor(() => expect(container.querySelector('.kg-live')).not.toBeNull()); // real graph loaded
        const canvas = container.querySelector('canvas.kg-canvas')!;
        expect(canvas.getAttribute('role')).toBe('img');
        const label = canvas.getAttribute('aria-label') ?? '';
        expect(label).toContain('Hermes Agent'); // default project name
        expect(label).toMatch(/\d+ of \d+ files/);
        expect(label).toContain('WindowContext.tsx'); // top importantFiles entry from the fixture
        expect(label).toContain('Use the node list for keyboard access.');
    });

    it('typing narrows "N matches" (or "No matches") in a live region; Escape clears it', async () => {
        const { container, getByLabelText } = render(<HalocronKnowledgeGraph />);
        await waitFor(() => expect(container.querySelector('.kg-live')).not.toBeNull()); // real graph loaded
        const input = getByLabelText('Search files in this map');

        fireEvent.change(input, { target: { value: 'window' } });
        await waitFor(() => expect(container.querySelector('.kg-search__status')?.textContent).toBe('2 matches'));

        fireEvent.change(input, { target: { value: 'nothing-matches-this' } });
        await waitFor(() => expect(container.querySelector('.kg-search__status')?.textContent).toBe('No matches'));

        fireEvent.keyDown(input, { key: 'Escape' });
        expect((input as HTMLInputElement).value).toBe('');
        expect(container.querySelector('.kg-search__status')?.textContent).toBe('');
    });

    it('Enter cycles selection through the matches and wraps', async () => {
        const { container, getByLabelText } = render(<HalocronKnowledgeGraph />);
        await waitFor(() => expect(container.querySelector('.kg-live')).not.toBeNull()); // real graph loaded
        const input = getByLabelText('Search files in this map');
        fireEvent.change(input, { target: { value: 'window' } });
        await waitFor(() => expect(container.querySelector('.kg-search__status')?.textContent).toBe('2 matches'));

        fireEvent.keyDown(input, { key: 'Enter' });
        const firstSel = container.querySelector('.kg-sel__name')?.textContent;
        expect(firstSel).toMatch(/window/i);

        fireEvent.keyDown(input, { key: 'Enter' });
        const secondSel = container.querySelector('.kg-sel__name')?.textContent;
        expect(secondSel).toMatch(/window/i);
        expect(secondSel).not.toBe(firstSel);

        fireEvent.keyDown(input, { key: 'Enter' }); // wraps back to the first match
        expect(container.querySelector('.kg-sel__name')?.textContent).toBe(firstSel);
    });

    describe('accessible node list (C1)', () => {
        it('toggle button flips aria-expanded and shows/hides the list', async () => {
            const { getByRole, queryByRole } = render(<HalocronKnowledgeGraph />);
            await waitFor(() => expect(queryByRole('group', { name: /files, most important first/i })).toBeNull());
            const toggle = getByRole('button', { name: 'Show node list' });
            expect(toggle.getAttribute('aria-expanded')).toBe('false');

            fireEvent.click(toggle);
            expect(toggle.getAttribute('aria-expanded')).toBe('true');
            expect(toggle.textContent).toBe('Hide node list');
            const list = getByRole('group', { name: /files, most important first/i });
            expect(toggle.getAttribute('aria-controls')).toBe(list.id);
        });

        it('clicking a row selects that node (Selected card updates) and marks it aria-current', async () => {
            const { getByRole, container } = render(<HalocronKnowledgeGraph />);
            await waitFor(() => expect(container.querySelector('.kg-live')).not.toBeNull()); // real graph loaded
            fireEvent.click(getByRole('button', { name: 'Show node list' }));
            const list = getByRole('group', { name: /files, most important first/i });
            await waitFor(() => expect(within(list).getAllByRole('button').some((r) => r.textContent?.includes('llmClient.ts'))).toBe(true));
            const rows = within(list).getAllByRole('button');
            const target = rows.find((r) => r.textContent?.includes('llmClient.ts'))!;

            fireEvent.click(target);
            expect(container.querySelector('.kg-sel__name')?.textContent).toBe('llmClient.ts');
            expect(target.getAttribute('aria-current')).toBe('true');
        });

        it('ArrowDown moves focus to the next row', async () => {
            const { getByRole } = render(<HalocronKnowledgeGraph />);
            fireEvent.click(getByRole('button', { name: 'Show node list' }));
            const list = getByRole('group', { name: /files, most important first/i });
            await waitFor(() => expect(within(list).getAllByRole('button').length).toBeGreaterThan(1));
            const rows = within(list).getAllByRole('button');
            rows[0].focus();
            fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
            expect(document.activeElement).toBe(rows[1]);
        });
    });

    describe('export (C3)', () => {
        it('Export PNG/JSON are disabled until a graph is loaded, then enabled', async () => {
            vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves -> stays "loading"
            const { getByRole } = render(<HalocronKnowledgeGraph />);
            expect(getByRole('button', { name: 'Export PNG' })).toBeDisabled();
            expect(getByRole('button', { name: 'Export JSON' })).toBeDisabled();
        });

        it('Export JSON creates a Blob whose text parses to the expected shape, revoking the URL after the click', async () => {
            const revoked: string[] = [];
            const created: string[] = [];
            vi.stubGlobal('URL', {
                ...URL,
                createObjectURL: vi.fn((b: Blob) => { const u = `blob:${created.length}`; created.push(u); (globalThis as unknown as { __blobs: Record<string, Blob> }).__blobs ??= {}; (globalThis as unknown as { __blobs: Record<string, Blob> }).__blobs[u] = b; return u; }),
                revokeObjectURL: vi.fn((u: string) => { revoked.push(u); }),
            });
            const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
                // At click time the URL must not have been revoked yet.
                expect(revoked).not.toContain(this.href);
            });

            const { getByRole } = render(<HalocronKnowledgeGraph />);
            await waitFor(() => expect(getByRole('button', { name: 'Export JSON' })).not.toBeDisabled());
            fireEvent.click(getByRole('button', { name: 'Export JSON' }));

            expect(clickSpy).toHaveBeenCalledTimes(1);
            const blob = (globalThis as unknown as { __blobs: Record<string, Blob> }).__blobs[created[0]];
            const text = await blob.text();
            const parsed = JSON.parse(text);
            expect(parsed.project).toEqual({ id: 'hermes', name: 'Hermes Agent' });
            expect(parsed.nodes).toHaveLength(3);
            expect(parsed.nodes[0]).toMatchObject({ label: 'WindowContext.tsx', degree: 1 });
            expect(parsed.nodes.every((n: Record<string, unknown>) => !('x' in n))).toBe(true);

            await waitFor(() => expect(revoked).toEqual(created));
        });
    });
});
