/**
 * Owner-race follow-up: workspaceStore.hydrate() now clears the previous account's structure when a
 * different user signs in. The widget must then fetch the NEW account's domaines — its fetch effect
 * used to run once per mount, so a widget left open across the switch showed an empty index.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import type { DomaineMeta } from '../components/Workspace/workspaceApi';

const fetchDomainesMock = vi.fn();
vi.mock('../components/Workspace/workspaceApi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../components/Workspace/workspaceApi')>()),
    fetchDomaines: () => fetchDomainesMock(),
}));

import Workspace from '../components/Workspace/Workspace';
import { UserContext } from '../context/UserContext';
import { useWorkspaceStore } from '../components/Workspace/workspaceStore';

const dom = (name: string): DomaineMeta => ({ name, path: name, description: '', color: '', position: 0 });
const asUser = (id: string) => (
    <UserContext.Provider value={{ user: { id, name: id } } as never}><Workspace /></UserContext.Provider>
);

describe('Workspace — a different account signs in while the widget is open', () => {
    beforeEach(() => { localStorage.clear(); useWorkspaceStore.getState().reset(); fetchDomainesMock.mockReset(); });
    afterEach(() => cleanup());

    it("fetches and shows the new account's domaines, not an empty index or the old list", async () => {
        fetchDomainesMock.mockResolvedValueOnce([dom('Alpha-Legal')]).mockResolvedValueOnce([dom('Bravo-Finance')]);
        const { rerender } = render(asUser('user-a'));
        expect(await screen.findByText('Alpha-Legal')).toBeInTheDocument();
        rerender(asUser('user-b'));
        await waitFor(() => expect(fetchDomainesMock).toHaveBeenCalledTimes(2));
        expect(await screen.findByText('Bravo-Finance')).toBeInTheDocument();
        expect(screen.queryByText('Alpha-Legal')).toBeNull();
    });

    it('control: re-rendering for the same account does not refetch', async () => {
        fetchDomainesMock.mockResolvedValue([dom('Alpha-Legal')]);
        const { rerender } = render(asUser('user-a'));
        expect(await screen.findByText('Alpha-Legal')).toBeInTheDocument();
        rerender(asUser('user-a'));
        await new Promise((r) => setTimeout(r, 20));
        expect(fetchDomainesMock).toHaveBeenCalledTimes(1);
    });
});
