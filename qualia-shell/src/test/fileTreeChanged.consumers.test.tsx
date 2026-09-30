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
