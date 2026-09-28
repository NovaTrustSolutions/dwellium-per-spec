/**
 * Plan 072 phase 2 — canvas correctness, resize/refetch wiring, chat history
 * cap, and the inline add/remove-project UI (fixes B1-B7). The existing
 * `halocronKnowledgeGraph.test.tsx` / `halocronKnowledgeGraphReview.test.tsx`
 * cover phase 1 + the pre-existing zoom/pan/view-tab behaviour; this file
 * covers what phase 2 changed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import HalocronKnowledgeGraph from '../components/Shell/HalocronKnowledgeGraph';
import { callLlm } from '../lib/llmClient';
import {
    halocronKnowledgeGraphStore,
    setKgView,
    upsertKgProject,
    type KgGraphData,
} from '../lib/halocronKnowledgeGraphStore';
import * as kgCanvas from '../components/Shell/kgCanvas';

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

// Wrap the real kgCanvas module so calls can be counted / asserted on without
// losing the real math (mulberry32 determinism, force layout, rescale).
vi.mock('../components/Shell/kgCanvas', async (importOriginal) => {
    const actual = await importOriginal<typeof kgCanvas>();
    return {
        ...actual,
        buildGraph: vi.fn(actual.buildGraph),
        rescale: vi.fn(actual.rescale),
    };
});

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

class MockResizeObserver {
    static instances: MockResizeObserver[] = [];
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; MockResizeObserver.instances.push(this); }
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
}

function fixtureGraph(overrides: Partial<KgGraphData> = {}): KgGraphData {
    return {
        files: 100, edges: 1, clusters: 2, tokens: 1000, usdPerSession: 0.01,
        importantFiles: [{ name: 'a.ts', score: 10, pct: 100 }],
        nodes: [
            { label: 'f0', cluster: 0, importance: 5, deg: 1 },
            { label: 'f1', cluster: 0, importance: 3, deg: 1 },
        ],
        links: [[0, 1]],
        builtAt: '2026-09-01T00:00:00.000Z',
        ...overrides,
    };
}

function stubGithub(files: number) {
    const tree = Array.from({ length: files }, (_, i) => ({ type: 'blob', path: `src/f${i}.ts`, size: 100 + i }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        // The component's own static-graph fetch (unrelated to Add-a-project)
        // must not be answered by the GitHub stub below, or it'll crash on a
        // shape it doesn't understand — let it fail normally (E3's "error" state).
        if (typeof url === 'string' && url.startsWith('/data/kg/')) return { ok: false, status: 404 };
        return {
            ok: true, status: 200,
            json: async () => (url.includes('/git/trees/') ? { tree, truncated: false } : { default_branch: 'main', language: 'TypeScript' }),
        };
    }));
}

describe('HalocronKnowledgeGraph phase 2 (B1-B7)', () => {
    beforeEach(() => {
        localStorage.clear();
        halocronKnowledgeGraphStore.reset();
        MockResizeObserver.instances = [];
        vi.stubGlobal('ResizeObserver', MockResizeObserver);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeFakeCanvasContext());
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
        setKgView('repos');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    describe('rAF draw-on-demand (B4)', () => {
        it('does not keep scheduling frames while paused; resumes on unpause; cancels on unmount', () => {
            let pendingId = 0;
            let pendingCb: FrameRequestCallback | null = null;
            const rafMock = vi.fn((cb: FrameRequestCallback) => { pendingId += 1; pendingCb = cb; return pendingId; });
            const cafMock = vi.fn((id: number) => { if (id === pendingId) pendingCb = null; });
            vi.stubGlobal('requestAnimationFrame', rafMock);
            vi.stubGlobal('cancelAnimationFrame', cafMock);
            const tick = () => { const cb = pendingCb; pendingCb = null; act(() => { cb?.(performance.now()); }); };

            const { getByRole, unmount } = render(<HalocronKnowledgeGraph />);
            expect(rafMock).toHaveBeenCalledTimes(1);

            // Unpaused: each frame reschedules itself.
            tick();
            expect(rafMock).toHaveBeenCalledTimes(2);

            // Pause: the already-pending frame is allowed to land, but must not reschedule.
            fireEvent.click(getByRole('button', { name: 'Pause' }));
            tick();
            const countWhilePaused = rafMock.mock.calls.length;
            expect(countWhilePaused).toBe(2); // no new schedule
            expect(pendingCb).toBeNull(); // and nothing left pending to fire again
            tick(); // no-op — nothing pending
            expect(rafMock).toHaveBeenCalledTimes(countWhilePaused);

            // Unpause: restarts the loop.
            fireEvent.click(getByRole('button', { name: 'Play' }));
            expect(rafMock).toHaveBeenCalledTimes(countWhilePaused + 1);

            // Unmount: cancels the pending frame.
            const idAtUnmount = pendingId;
            unmount();
            expect(cafMock).toHaveBeenCalledWith(idAtUnmount);
        });
    });

    describe('resize debounce + rescale, not relayout (B2/B3)', () => {
        it('collapses two ResizeObserver callbacks within 150ms into one rescale (not a rebuild)', async () => {
            vi.useFakeTimers();
            try {
                const { container, getByRole } = render(<HalocronKnowledgeGraph />);
                // Pause drift first — otherwise the continuous rAF loop (also
                // driven by the faked clock) nudges positions during the
                // advance below, which would make the scale-factor check flaky
                // for reasons unrelated to what this test verifies.
                fireEvent.click(getByRole('button', { name: 'Pause' }));
                const wrap = container.querySelector<HTMLDivElement>('.kg-canvaswrap')!;
                const canvas = container.querySelector<HTMLCanvasElement>('.kg-canvas')!;
                let rect = { width: 800, height: 520 };
                const rectOf = (r: typeof rect) => ({ left: 0, top: 0, right: r.width, bottom: r.height, width: r.width, height: r.height, x: 0, y: 0, toJSON: () => ({}) });
                Object.defineProperty(wrap, 'getBoundingClientRect', { value: () => rectOf(rect), configurable: true });
                Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => rectOf(rect), configurable: true });

                const buildGraphMock = vi.mocked(kgCanvas.buildGraph);
                const rescaleMock = vi.mocked(kgCanvas.rescale);
                await vi.waitFor(() => expect(buildGraphMock).toHaveBeenCalledTimes(1));
                const initialNodes = buildGraphMock.mock.results[0].value.nodes as { x: number }[];
                const x0 = initialNodes[0].x;

                const ro = MockResizeObserver.instances[MockResizeObserver.instances.length - 1]!;
                rect = { width: 400, height: 260 };
                act(() => { ro.cb([], ro as unknown as ResizeObserver); });
                act(() => { ro.cb([], ro as unknown as ResizeObserver); }); // second callback within the debounce window
                expect(rescaleMock).not.toHaveBeenCalled(); // still debounced

                act(() => { vi.advanceTimersByTime(150); });

                expect(rescaleMock).toHaveBeenCalledTimes(1); // two callbacks -> one handling
                expect(buildGraphMock).toHaveBeenCalledTimes(1); // resize never re-lays-out
                expect(initialNodes[0].x).toBeCloseTo(x0 * 0.5, 5); // scaled, not reshuffled
            } finally {
                vi.useRealTimers();
            }
        });

        it('a store write for a DIFFERENT project does not refetch or relayout the active one (B3)', async () => {
            const fetchMock = vi.fn(() => Promise.resolve({ ok: false }));
            vi.stubGlobal('fetch', fetchMock);
            render(<HalocronKnowledgeGraph />);
            await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
            const buildGraphMock = vi.mocked(kgCanvas.buildGraph);
            await waitFor(() => expect(buildGraphMock).toHaveBeenCalledTimes(1));

            // A store write that touches a DIFFERENT project's cached graph
            // only (e.g. a One Save hydrate) — NOT `upsertKgProject`, which
            // also switches the active tab to the project it just added and
            // would trigger a real, correct rebuild for a different reason.
            act(() => {
                const current = halocronKnowledgeGraphStore.getSnapshot();
                halocronKnowledgeGraphStore.set(
                    { ...current, graphs: { ...current.graphs, 'gh-other': fixtureGraph() } },
                    () => {},
                );
            });
            await new Promise((r) => setTimeout(r, 0));

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(buildGraphMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('"Ask the map" history cap (B6)', () => {
        it('sends only the last 8 messages once the conversation exceeds that', async () => {
            const callLlmMock = vi.mocked(callLlm);
            callLlmMock.mockResolvedValue({ text: 'ok', provider: 'anthropic', model: 'test' });
            const { container } = render(<HalocronKnowledgeGraph />);
            const input = container.querySelector<HTMLInputElement>('.kg-chat__input')!;
            const send = async (text: string) => {
                fireEvent.change(input, { target: { value: text } });
                await act(async () => {
                    fireEvent.click(container.querySelector('.kg-chat__send')!);
                    await Promise.resolve(); await Promise.resolve();
                });
            };
            for (let i = 0; i < 5; i++) await send(`m${i}`); // 10 chat entries (5 user + 5 assistant)

            callLlmMock.mockClear();
            await send('final');

            const prompt = callLlmMock.mock.calls[0][0].prompt;
            expect(prompt).not.toContain('m0'); // oldest pair dropped
            expect(prompt).toContain('m1');      // still within the last 8
            expect(prompt).toContain('m4');
        });
    });

    describe('inline add/remove project (B7)', () => {
        it('replaces window.prompt/alert with an inline form; adds via fetch; errors show inline', async () => {
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
            const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => { throw new Error('must not use window.prompt'); });
            stubGithub(5);
            const { getByPlaceholderText, getByRole, queryByRole } = render(<HalocronKnowledgeGraph />);

            fireEvent.click(getByRole('button', { name: /Add a project/ }));
            const urlInput = getByPlaceholderText('https://github.com/owner/repo');
            fireEvent.change(urlInput, { target: { value: 'https://github.com/acme/widgets' } });
            await act(async () => {
                fireEvent.click(getByRole('button', { name: 'Graph' }));
                await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
            });

            expect(promptSpy).not.toHaveBeenCalled();
            expect(alertSpy).not.toHaveBeenCalled();
            await waitFor(() => expect(queryByRole('button', { name: 'Remove widgets' })).not.toBeNull());
        });

        it('shows an inline error (not window.alert) when graphing fails', async () => {
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
            vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
            const { getByPlaceholderText, getByRole, findByRole } = render(<HalocronKnowledgeGraph />);

            fireEvent.click(getByRole('button', { name: /Add a project/ }));
            fireEvent.change(getByPlaceholderText('https://github.com/owner/repo'), { target: { value: 'https://github.com/acme/widgets' } });
            fireEvent.click(getByRole('button', { name: 'Graph' }));

            const err = await findByRole('alert');
            expect(err.textContent).toMatch(/repo not found|http/i);
            expect(alertSpy).not.toHaveBeenCalled();
        });

        it('shows a × to remove a user-added tab, but not on a default tab', async () => {
            upsertKgProject(
                { id: 'gh-acme-widgets', name: 'widgets', lang: 'TYPESCRIPT', files: 10, clusters: 1, blurb: 'acme/widgets' },
                fixtureGraph(),
            );
            const { getByRole, queryByRole } = render(<HalocronKnowledgeGraph />);

            expect(queryByRole('button', { name: 'Remove Hermes Agent' })).toBeNull(); // default tab
            const removeBtn = getByRole('button', { name: 'Remove widgets' });
            fireEvent.click(removeBtn);
            expect(queryByRole('button', { name: 'Remove widgets' })).toBeNull();
        });
    });

    describe('Selected card neighbours (B/C rail improvement)', () => {
        it('lists clickable neighbour names; clicking one selects it', () => {
            const buildGraphMock = vi.mocked(kgCanvas.buildGraph);
            buildGraphMock.mockReturnValueOnce({
                nodes: [
                    { x: 50, y: 50, hx: 50, hy: 50, vx: 0, vy: 0, r: 5, cluster: 0, label: 'alpha', importance: 10 },
                    { x: 120, y: 50, hx: 120, hy: 50, vx: 0, vy: 0, r: 5, cluster: 0, label: 'beta', importance: 5 },
                    { x: 50, y: 120, hx: 50, hy: 120, vx: 0, vy: 0, r: 5, cluster: 1, label: 'gamma', importance: 5 },
                ],
                links: [[0, 1], [0, 2]],
            });

            const { container, getByText } = render(<HalocronKnowledgeGraph />);
            const canvas = container.querySelector<HTMLCanvasElement>('.kg-canvas')!;
            Object.defineProperty(canvas, 'getBoundingClientRect', {
                value: () => ({ left: 0, top: 0, right: 800, bottom: 520, width: 800, height: 520, x: 0, y: 0, toJSON: () => ({}) }),
            });

            fireEvent.click(canvas, { clientX: 50, clientY: 50 });
            expect(getByText('alpha')).toBeTruthy();
            expect(container.textContent).toContain('degree 2');
            expect(getByText('beta')).toBeTruthy();
            expect(getByText('gamma')).toBeTruthy();

            fireEvent.click(getByText('beta'));
            expect(container.querySelector('.kg-sel__name')?.textContent).toBe('beta');
        });
    });
});
