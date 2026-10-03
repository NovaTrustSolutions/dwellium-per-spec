/**
 * FILE_TREE_CHANGED consumers (plan 076 P4): Workspace store, Wiki, ContentSearch and
 * KnowledgeGraph (Workspace Files tab) refetch the tree ~300 ms after the event, coalesce
 * bursts, and stop listening on unmount.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const fetchTreeMock = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', async (orig) => ({
    ...(await orig<typeof import('../components/FileExplorer/fileExplorerApi')>()),
    fetchTree: () => fetchTreeMock(),
}));
vi.mock('../components/ContentSearch/remoteSearch', () => ({
    fetchFileNames: async () => new Map(),
    searchRemote: async () => ({ hits: [], failed: false }),
}));
vi.mock('../hooks/useIntegrations', () => ({ useIntegrations: () => ({ integrations: { llm: { active: null } } }) }));

import { FILE_TREE_CHANGED } from '../components/FileExplorer/fileExplorerApi';
import { useWorkspaceStore } from '../components/Workspace/workspaceStore';
import Wiki from '../components/Wiki/Wiki';
import ContentSearch from '../components/ContentSearch/ContentSearch';
import KnowledgeGraph from '../components/KnowledgeGraph/KnowledgeGraph';

const TREE = [{ name: 'A', path: 'A', tier: 'domain', children: [] }];
const fire = () => window.dispatchEvent(new Event(FILE_TREE_CHANGED));
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    fetchTreeMock.mockReset();
    fetchTreeMock.mockResolvedValue(TREE);
});
afterEach(() => { vi.useRealTimers(); });

/** Shared contract: settle initial load, then assert the three behaviours. */
async function checkConsumer(mount: () => { unmount: () => void } | null) {
    const handle = mount();
    await advance(10);
    const base = fetchTreeMock.mock.calls.length;

    fire();
    await advance(299);
    expect(fetchTreeMock.mock.calls.length).toBe(base);
    await advance(2);
    expect(fetchTreeMock.mock.calls.length).toBe(base + 1);

    fire(); await advance(100); fire(); await advance(100); fire();
    await advance(400);
    expect(fetchTreeMock.mock.calls.length).toBe(base + 2);

    return handle;
}
async function checkNoRefetchAfter(before: number) {
    fire();
    await advance(1000);
    expect(fetchTreeMock.mock.calls.length).toBe(before);
}

describe('FILE_TREE_CHANGED consumers', () => {
    it('Wiki', async () => {
        const h = await checkConsumer(() => render(<Wiki />));
        h!.unmount();
        await checkNoRefetchAfter(fetchTreeMock.mock.calls.length);
    });

    it('ContentSearch', async () => {
        const h = await checkConsumer(() => render(<ContentSearch />));
        h!.unmount();
        await checkNoRefetchAfter(fetchTreeMock.mock.calls.length);
    });

    it('KnowledgeGraph (Workspace Files)', async () => {
        const h = await checkConsumer(() => {
            const r = render(<KnowledgeGraph />);
            fireEvent.click(screen.getByRole('tab', { name: 'Workspace Files' }));
            return r;
        });
        h!.unmount();
        await checkNoRefetchAfter(fetchTreeMock.mock.calls.length);
    });

    it('Workspace store (refetches only once a tree is cached)', async () => {
        useWorkspaceStore.setState({ tree: [] });
        fire(); await advance(500);
        expect(fetchTreeMock).not.toHaveBeenCalled();

        useWorkspaceStore.setState({ tree: TREE as never });
        await checkConsumer(() => null);

        // reset() (account switch) empties the tree: a pending timer becomes a no-op.
        const before = fetchTreeMock.mock.calls.length;
        fire(); useWorkspaceStore.getState().reset();
        await advance(500);
        expect(fetchTreeMock.mock.calls.length).toBe(before);
    });
});

describe('newest load wins (plan 076 P4 review)', () => {
    it('Workspace: an older loadTree resolving after a newer one does not overwrite it', async () => {
        const { useWorkspaceStore } = await import('../components/Workspace/workspaceStore');
        let rOld!: (t: unknown) => void; let rNew!: (t: unknown) => void;
        fetchTreeMock.mockReturnValueOnce(new Promise((r) => { rOld = r; }) as never).mockReturnValueOnce(new Promise((r) => { rNew = r; }) as never);
        const a = useWorkspaceStore.getState().loadTree();
        const b = useWorkspaceStore.getState().loadTree();
        rNew([{ name: 'NEWER.md', path: 'NEWER.md', tier: 'file' }]); await b;
        rOld([{ name: 'OLDER.md', path: 'OLDER.md', tier: 'file' }]); await a;
        expect(useWorkspaceStore.getState().tree.map((x) => x.name)).toEqual(['NEWER.md']);
    });
});

describe('newest load wins — KnowledgeGraph (plan 076 P4 review)', () => {
    it('an older fetch resolving after a newer one does not overwrite the graph', async () => {
        // The Workspace store also listens (module-level); an earlier test left a tree cached there.
        (await import('../components/Workspace/workspaceStore')).useWorkspaceStore.getState().reset();
        const pending: Array<(t: unknown) => void> = [];
        fetchTreeMock.mockReset();
        fetchTreeMock.mockImplementation(() => new Promise((r) => { pending.push(r); }));
        const tree = (d: string) => [{ name: d, path: d, tier: 'domain', children: [{ name: 'f.md', path: `${d}/f.md`, tier: 'file' }] }];
        render(<KnowledgeGraph />);
        fireEvent.click(screen.getByRole('tab', { name: 'Workspace Files' }));
        await advance(10);
        const before = pending.length;
        fire(); await advance(310); // the event starts a newer load
        expect(pending.length).toBe(before + 1);
        await act(async () => { pending[pending.length - 1](tree('NEWERDOM')); });
        await act(async () => { pending.slice(0, -1).forEach((r) => r(tree('OLDERDOM'))); });
        await advance(10);
        expect(document.body.textContent).toContain('NEWERDOM');
        expect(document.body.textContent).not.toContain('OLDERDOM');
    });
});
