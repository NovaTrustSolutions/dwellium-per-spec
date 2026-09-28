import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import HalocronKnowledgeGraph from '../components/Shell/HalocronKnowledgeGraph';
import { UserContext } from '../context/UserContext';
import { callLlm } from '../lib/llmClient';
import {
    halocronKnowledgeGraphStore,
    setKgView,
    upsertKgProject,
    type KgGraphData,
} from '../lib/halocronKnowledgeGraphStore';

vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: {} } }),
}));

vi.mock('../lib/llmClient', () => ({
    callLlm: vi.fn(),
}));

vi.mock('../components/common/AgentEta', () => ({
    default: ({ label }: { label: string }) => <div>{label}</div>,
}));

// GraphifyView does its own fetching (status/view) — mocked so tests that
// don't need it (everything except the view-switch test itself) never hit
// its network path.
vi.mock('../components/KnowledgeGraph/GraphifyView', () => ({
    default: () => <div data-testid="graphify-mock">graphify view</div>,
}));

class MockResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
}

const makePointerEvent = (
    type: string,
    init: MouseEventInit & { pointerId?: number } = {},
) => {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ...init,
    }) as PointerEvent;
    Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
    return event;
};

const userValue = (id: string) => ({ user: { id } }) as unknown as never;

function fixtureGraph(overrides: Partial<KgGraphData> = {}): KgGraphData {
    return {
        files: 3278,
        edges: 100,
        clusters: 5,
        tokens: 4000,
        usdPerSession: 0.01,
        importantFiles: [{ name: 'a.ts', score: 10, pct: 100 }],
        nodes: [
            { label: 'f0', cluster: 0, importance: 5, deg: 1 },
            { label: 'f1', cluster: 0, importance: 3, deg: 1 },
            { label: 'f2', cluster: 1, importance: 1, deg: 0 },
        ],
        links: [[0, 1]],
        builtAt: '2026-09-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('HalocronKnowledgeGraph', () => {
    beforeEach(() => {
        localStorage.clear();
        halocronKnowledgeGraphStore.reset();
        vi.stubGlobal('ResizeObserver', MockResizeObserver);
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('zoom handling (code-repo view)', () => {
        beforeEach(() => {
            setKgView('repos');
        });

        it('keeps wheel zoom on the canvas instead of bubbling to scroll containers', () => {
            const addEventListenerSpy = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
            const { container } = render(<HalocronKnowledgeGraph />);
            const canvas = container.querySelector<HTMLCanvasElement>('.kg-canvas');
            const body = container.querySelector<HTMLElement>('.kg-body');
            expect(canvas).not.toBeNull();
            expect(body).not.toBeNull();

            Object.defineProperty(canvas, 'getBoundingClientRect', {
                value: () => ({
                    left: 0,
                    top: 0,
                    right: 800,
                    bottom: 520,
                    width: 800,
                    height: 520,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                }),
            });

            const bodyWheel = vi.fn();
            body!.addEventListener('wheel', bodyWheel);
            const wheel = new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                clientX: 400,
                clientY: 260,
                deltaY: -120,
            });
            const dispatched = canvas!.dispatchEvent(wheel);

            const wheelRegistration = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'wheel');
            expect(wheelRegistration?.[2]).toMatchObject({ passive: false });
            expect(wheel.defaultPrevented).toBe(true);
            expect(dispatched).toBe(false);
            expect(bodyWheel).not.toHaveBeenCalled();
        });

        it('pans the graph with a left-button pointer drag instead of scrolling the graph container', () => {
            const addEventListenerSpy = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
            const { container } = render(<HalocronKnowledgeGraph />);
            const canvas = container.querySelector<HTMLCanvasElement>('.kg-canvas');
            const body = container.querySelector<HTMLElement>('.kg-body');
            expect(canvas).not.toBeNull();
            expect(body).not.toBeNull();

            Object.defineProperty(canvas, 'getBoundingClientRect', {
                value: () => ({
                    left: 0,
                    top: 0,
                    right: 800,
                    bottom: 520,
                    width: 800,
                    height: 520,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                }),
            });

            const pointerDownRegistration = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'pointerdown');
            expect(pointerDownRegistration).toBeTruthy();

            const bodyPointerMove = vi.fn();
            body!.addEventListener('pointermove', bodyPointerMove);

            const pointerDown = makePointerEvent('pointerdown', {
                button: 0,
                buttons: 1,
                clientX: 100,
                clientY: 100,
                pointerId: 7,
            });
            const downDispatched = canvas!.dispatchEvent(pointerDown);

            const pointerMove = makePointerEvent('pointermove', {
                button: 0,
                buttons: 1,
                clientX: 160,
                clientY: 135,
                pointerId: 7,
            });
            const moveDispatched = canvas!.dispatchEvent(pointerMove);

            canvas!.dispatchEvent(makePointerEvent('pointerup', {
                button: 0,
                buttons: 0,
                clientX: 160,
                clientY: 135,
                pointerId: 7,
            }));

            expect(pointerDown.defaultPrevented).toBe(true);
            expect(downDispatched).toBe(false);
            expect(pointerMove.defaultPrevented).toBe(true);
            expect(moveDispatched).toBe(false);
            expect(bodyPointerMove).not.toHaveBeenCalled();
        });
    });

    describe('view tabs', () => {
        it('defaults to "My knowledge" (GraphifyView) and switches to "Code repos" on click', () => {
            const { container, getByRole } = render(<HalocronKnowledgeGraph />);

            expect(container.querySelector('[data-testid="graphify-mock"]')).not.toBeNull();
            expect(container.querySelector('.kg-canvas')).toBeNull();

            const knowledgeTab = getByRole('tab', { name: 'My knowledge' });
            const reposTab = getByRole('tab', { name: 'Code repos' });
            expect(knowledgeTab).toHaveAttribute('aria-selected', 'true');
            expect(reposTab).toHaveAttribute('aria-selected', 'false');

            fireEvent.click(reposTab);

            expect(container.querySelector('[data-testid="graphify-mock"]')).toBeNull();
            expect(container.querySelector('.kg-canvas')).not.toBeNull();
            expect(getByRole('tab', { name: 'Code repos' })).toHaveAttribute('aria-selected', 'true');
            expect(getByRole('tab', { name: 'My knowledge' })).toHaveAttribute('aria-selected', 'false');
        });
    });

    describe('per-source rail copy + N-of-M disclosure', () => {
        it('static-import-graph source: "real imports", ranked by importers, N-of-M when capped', () => {
            halocronKnowledgeGraphStore.set(
                { ...halocronKnowledgeGraphStore.getSnapshot(), activeId: 'hermes', graphs: { hermes: fixtureGraph() } },
                () => {},
            );
            setKgView('repos');
            const { container } = render(<HalocronKnowledgeGraph />);

            expect(container.textContent).toContain('Links are real imports read from the code.');
            expect(container.textContent).toContain('ranked by how many other files import them');
            expect(container.textContent).toContain('3 of 3,278 files shown (the most imported)');
        });

        it('github-tree source: "structure only", ranked by size, N-of-M when capped', () => {
            upsertKgProject(
                { id: 'gh-x', name: 'X', lang: 'TYPESCRIPT', files: 4000, clusters: 1, blurb: 'owner/x' },
                fixtureGraph({ source: 'github-tree', totalFiles: 4000, files: 4000 }),
            );
            setKgView('repos');
            const { container } = render(<HalocronKnowledgeGraph />);

            expect(container.textContent).toContain("Structure only — links join files to their folder's largest file, not real imports.");
            expect(container.textContent).toContain('ranked by size');
            expect(container.textContent).toContain('3 of 4,000 files shown (the largest)');
        });
    });

    describe('static graph fetch failure (E3)', () => {
        it('shows an error + Retry instead of "loading…" forever, and Retry refetches', async () => {
            const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 500 }));
            vi.stubGlobal('fetch', fetchMock);
            setKgView('repos');
            const { container, getByRole } = render(<HalocronKnowledgeGraph />);

            await waitFor(() => {
                expect(container.textContent).toContain("Couldn't load this project's graph.");
            });
            expect(container.textContent).not.toContain('loading…');
            expect(fetchMock).toHaveBeenCalledTimes(1);

            const retry = getByRole('button', { name: 'Retry' });
            fireEvent.click(retry);

            await waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe('per-user identity (E1)', () => {
        it('keys the active view by user id so an account switch clears the previous chat, even for a late reply', async () => {
            setKgView('repos');
            let resolveLlm!: (v: Awaited<ReturnType<typeof callLlm>>) => void;
            vi.mocked(callLlm).mockReturnValue(new Promise((resolve) => { resolveLlm = resolve; }));

            const { container, rerender } = render(
                <UserContext.Provider value={userValue('a')}><HalocronKnowledgeGraph /></UserContext.Provider>,
            );

            const input = container.querySelector<HTMLInputElement>('.kg-chat__input')!;
            fireEvent.change(input, { target: { value: 'hello from A' } });
            fireEvent.click(container.querySelector('.kg-chat__send')!);
            expect(container.textContent).toContain('hello from A');

            // Account switch — RepoGraph is keyed by uid, so this remounts it
            // with fresh state before the pending LLM call ever resolves.
            rerender(<UserContext.Provider value={userValue('b')}><HalocronKnowledgeGraph /></UserContext.Provider>);

            await act(async () => {
                resolveLlm({ text: 'reply to A', provider: 'anthropic', model: 'test' });
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(container.textContent).not.toContain('hello from A');
            expect(container.textContent).not.toContain('reply to A');
        });
    });
});
