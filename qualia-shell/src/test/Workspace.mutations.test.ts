/**
 * Cycle 8 — workspaceStore mutation thunks (create / rename / remove / move / metadata).
 *
 * Structure mutations go over the SHARED file-explorer routes (mkdir/rename/move/entry); the
 * metadata mutations (saveDomaineMeta / setThreadStatus) go over the workspace sidecar routes.
 * We vi.mock BOTH api modules so every thunk is deterministic (no real HTTP). The mocks for
 * fetchTree/fetchDomaines also let us assert the refetch-on-mutation contract: a successful
 * structure mutation reloads the tree, and a depth-1 (domaine) change reloads the domaines list.
 *
 * Pure async/sync assertions — no React render, no fake timers (Phase-7 Finding (B)).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mkdirMock = vi.fn();
const renameMock = vi.fn();
const moveMock = vi.fn();
const deleteEntryMock = vi.fn();
const fetchTreeMock = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', () => ({
    fetchTree: () => fetchTreeMock(),
    mkdir: (path: string) => mkdirMock(path),
    rename: (fromPath: string, toName: string) => renameMock(fromPath, toName),
    move: (fromPath: string, toPath: string) => moveMock(fromPath, toPath),
    deleteEntry: (path: string) => deleteEntryMock(path),
}));

const fetchDomainesMock = vi.fn();
const putDomaineMock = vi.fn();
const putThreadMetaMock = vi.fn();
const fetchThreadMetaMock = vi.fn();
vi.mock('../components/Workspace/workspaceApi', () => ({
    fetchDomaines: () => fetchDomainesMock(),
    fetchThreadMeta: (path: string) => fetchThreadMetaMock(path),
    putDomaine: (path: string, patch: unknown) => putDomaineMock(path, patch),
    putThreadMeta: (path: string, patch: unknown) => putThreadMetaMock(path, patch),
}));

import { useWorkspaceStore } from '../components/Workspace/workspaceStore';

beforeEach(() => {
    mkdirMock.mockReset();
    renameMock.mockReset();
    moveMock.mockReset();
    deleteEntryMock.mockReset();
    fetchTreeMock.mockReset().mockResolvedValue([]);
    fetchDomainesMock.mockReset().mockResolvedValue([]);
    putDomaineMock.mockReset();
    putThreadMetaMock.mockReset();
    fetchThreadMetaMock.mockReset();
    useWorkspaceStore.getState().reset();
});

describe('Cycle 8 — createEntry', () => {
    it('creates a depth-1 domaine (name only) and reloads tree + domaines', async () => {
        mkdirMock.mockResolvedValueOnce(undefined);
        const ok = await useWorkspaceStore.getState().createEntry(null, 'Legal');
        expect(ok).toBe(true);
        expect(mkdirMock).toHaveBeenCalledWith('Legal');
        expect(fetchTreeMock).toHaveBeenCalledTimes(1);
        expect(fetchDomainesMock).toHaveBeenCalledTimes(1); // depth-1 → domaines refreshed
        expect(useWorkspaceStore.getState().mutating).toBe(false);
        expect(useWorkspaceStore.getState().mutationError).toBeNull();
    });

    it('creates a child under a parent and does NOT reload the domaines list', async () => {
        mkdirMock.mockResolvedValueOnce(undefined);
        const ok = await useWorkspaceStore.getState().createEntry('Legal', 'Acme Contract');
        expect(ok).toBe(true);
        expect(mkdirMock).toHaveBeenCalledWith('Legal/Acme Contract');
        expect(fetchTreeMock).toHaveBeenCalledTimes(1);
        expect(fetchDomainesMock).not.toHaveBeenCalled();
    });

    it('trims the name before building the path', async () => {
        mkdirMock.mockResolvedValueOnce(undefined);
        await useWorkspaceStore.getState().createEntry('Legal', '  intake  ');
        expect(mkdirMock).toHaveBeenCalledWith('Legal/intake');
    });

    it('rejects an empty name without calling the backend', async () => {
        const ok = await useWorkspaceStore.getState().createEntry(null, '   ');
        expect(ok).toBe(false);
        expect(mkdirMock).not.toHaveBeenCalled();
        expect(useWorkspaceStore.getState().mutationError).toMatch(/empty/i);
    });

    it('rejects a name containing a path separator', async () => {
        const ok = await useWorkspaceStore.getState().createEntry('Legal', 'a/b');
        expect(ok).toBe(false);
        expect(mkdirMock).not.toHaveBeenCalled();
        expect(useWorkspaceStore.getState().mutationError).toMatch(/\//);
    });

    it('captures a backend error and leaves mutating false', async () => {
        mkdirMock.mockRejectedValueOnce(new Error('EEXIST'));
        const ok = await useWorkspaceStore.getState().createEntry(null, 'Legal');
        expect(ok).toBe(false);
        expect(useWorkspaceStore.getState().mutationError).toBe('EEXIST');
        expect(useWorkspaceStore.getState().mutating).toBe(false);
    });
});

describe('Cycle 8 — renameEntry', () => {
    it('renames and reloads the tree; depth-1 rename reloads domaines too', async () => {
        renameMock.mockResolvedValueOnce({ fromPath: 'Legal', toPath: 'Law' });
        const ok = await useWorkspaceStore.getState().renameEntry('Legal', 'Law');
        expect(ok).toBe(true);
        expect(renameMock).toHaveBeenCalledWith('Legal', 'Law');
        expect(fetchTreeMock).toHaveBeenCalledTimes(1);
        expect(fetchDomainesMock).toHaveBeenCalledTimes(1);
    });

    it('a project-tier rename does not reload domaines', async () => {
        renameMock.mockResolvedValueOnce({ fromPath: 'Legal/Old', toPath: 'Legal/New' });
        await useWorkspaceStore.getState().renameEntry('Legal/Old', 'New');
        expect(fetchDomainesMock).not.toHaveBeenCalled();
    });

    it('follows the active project path when the renamed node was active', async () => {
        useWorkspaceStore.setState({ activeProjectPath: 'Legal/Old', view: 'project' });
        renameMock.mockResolvedValueOnce({ fromPath: 'Legal/Old', toPath: 'Legal/New' });
        await useWorkspaceStore.getState().renameEntry('Legal/Old', 'New');
        expect(useWorkspaceStore.getState().activeProjectPath).toBe('Legal/New');
    });

    it('rejects an invalid name without hitting the backend', async () => {
        const ok = await useWorkspaceStore.getState().renameEntry('Legal', '..');
        expect(ok).toBe(false);
        expect(renameMock).not.toHaveBeenCalled();
    });

    it('captures a rename error', async () => {
        renameMock.mockRejectedValueOnce(new Error('nope'));
        const ok = await useWorkspaceStore.getState().renameEntry('Legal', 'Law');
        expect(ok).toBe(false);
        expect(useWorkspaceStore.getState().mutationError).toBe('nope');
    });
});

describe('Cycle 8 — removeEntry', () => {
    it('deletes and reloads the tree; depth-1 delete reloads domaines', async () => {
        deleteEntryMock.mockResolvedValueOnce(undefined);
        const ok = await useWorkspaceStore.getState().removeEntry('Legal');
        expect(ok).toBe(true);
        expect(deleteEntryMock).toHaveBeenCalledWith('Legal');
        expect(fetchTreeMock).toHaveBeenCalledTimes(1);
        expect(fetchDomainesMock).toHaveBeenCalledTimes(1);
    });

    it('steps out to the domaine view when the active project is deleted', async () => {
        useWorkspaceStore.setState({ activeProjectPath: 'Legal/Acme', view: 'project' });
        deleteEntryMock.mockResolvedValueOnce(undefined);
        await useWorkspaceStore.getState().removeEntry('Legal/Acme');
        const s = useWorkspaceStore.getState();
        expect(s.view).toBe('domaine');
        expect(s.activeProjectPath).toBeNull();
    });

    it('steps back to the index when the active domaine is deleted', async () => {
        useWorkspaceStore.setState({ activeDomainePath: 'Legal', view: 'domaine' });
        deleteEntryMock.mockResolvedValueOnce(undefined);
        await useWorkspaceStore.getState().removeEntry('Legal');
        const s = useWorkspaceStore.getState();
        expect(s.view).toBe('index');
        expect(s.activeDomainePath).toBeNull();
    });

    it('captures a delete error and stays put', async () => {
        deleteEntryMock.mockRejectedValueOnce(new Error('busy'));
        const ok = await useWorkspaceStore.getState().removeEntry('Legal');
        expect(ok).toBe(false);
        expect(useWorkspaceStore.getState().mutationError).toBe('busy');
    });
});

describe('Cycle 8 — moveEntry', () => {
    it('moves and reloads the tree', async () => {
        moveMock.mockResolvedValueOnce(undefined);
        const ok = await useWorkspaceStore.getState().moveEntry('Legal/Acme', 'Finance/Acme');
        expect(ok).toBe(true);
        expect(moveMock).toHaveBeenCalledWith('Legal/Acme', 'Finance/Acme');
        expect(fetchTreeMock).toHaveBeenCalledTimes(1);
        expect(fetchDomainesMock).not.toHaveBeenCalled(); // both endpoints depth-2
    });

    it('reloads domaines when a depth-1 folder is involved', async () => {
        moveMock.mockResolvedValueOnce(undefined);
        await useWorkspaceStore.getState().moveEntry('Legal', 'Archive');
        expect(fetchDomainesMock).toHaveBeenCalledTimes(1);
    });

    it('captures a move error', async () => {
        moveMock.mockRejectedValueOnce(new Error('conflict'));
        const ok = await useWorkspaceStore.getState().moveEntry('a', 'b');
        expect(ok).toBe(false);
        expect(useWorkspaceStore.getState().mutationError).toBe('conflict');
    });
});

describe('Cycle 8 — saveDomaineMeta', () => {
    it('upserts the sidecar and reloads domaines', async () => {
        putDomaineMock.mockResolvedValueOnce({ color: '#abc' });
        const ok = await useWorkspaceStore.getState().saveDomaineMeta('Legal', { color: '#abc' });
        expect(ok).toBe(true);
        expect(putDomaineMock).toHaveBeenCalledWith('Legal', { color: '#abc' });
        expect(fetchDomainesMock).toHaveBeenCalledTimes(1);
    });

    it('captures a metadata error', async () => {
        putDomaineMock.mockRejectedValueOnce(new Error('500'));
        const ok = await useWorkspaceStore.getState().saveDomaineMeta('Legal', { position: 2 });
        expect(ok).toBe(false);
        expect(useWorkspaceStore.getState().mutationError).toBe('500');
    });
});

describe('Cycle 8 — setThreadStatus', () => {
    it('merges the new status into the threadMetas cache', async () => {
        putThreadMetaMock.mockResolvedValueOnce({ status: 'complete', stage: 'review' });
        const ok = await useWorkspaceStore.getState().setThreadStatus('Legal/Acme/intake', 'complete');
        expect(ok).toBe(true);
        expect(putThreadMetaMock).toHaveBeenCalledWith('Legal/Acme/intake', { status: 'complete' });
        const meta = useWorkspaceStore.getState().threadMetas['Legal/Acme/intake'];
        expect(meta.status).toBe('complete');
        expect(meta.stage).toBe('review');
    });

    it('preserves existing cached meta fields when toggling status', async () => {
        useWorkspaceStore.setState({
            threadMetas: {
                'Legal/Acme/intake': { name: 'intake', stage: 'draft', status: 'active' } as never,
            },
        });
        putThreadMetaMock.mockResolvedValueOnce({ status: 'complete' });
        await useWorkspaceStore.getState().setThreadStatus('Legal/Acme/intake', 'complete');
        const meta = useWorkspaceStore.getState().threadMetas['Legal/Acme/intake'];
        expect(meta.status).toBe('complete');
        expect(meta.stage).toBe('draft'); // preserved from the prior cache entry
    });

    it('captures a status error and leaves the cache untouched', async () => {
        putThreadMetaMock.mockRejectedValueOnce(new Error('locked'));
        const ok = await useWorkspaceStore.getState().setThreadStatus('Legal/Acme/intake', 'complete');
        expect(ok).toBe(false);
        expect(useWorkspaceStore.getState().mutationError).toBe('locked');
        expect(useWorkspaceStore.getState().threadMetas['Legal/Acme/intake']).toBeUndefined();
    });
});

describe('Cycle 8 — clearMutationError + reset', () => {
    it('clearMutationError nulls the error', async () => {
        await useWorkspaceStore.getState().createEntry(null, '');
        expect(useWorkspaceStore.getState().mutationError).not.toBeNull();
        useWorkspaceStore.getState().clearMutationError();
        expect(useWorkspaceStore.getState().mutationError).toBeNull();
    });

    it('reset restores mutating + mutationError to defaults', () => {
        useWorkspaceStore.setState({ mutating: true, mutationError: 'x' });
        useWorkspaceStore.getState().reset();
        expect(useWorkspaceStore.getState().mutating).toBe(false);
        expect(useWorkspaceStore.getState().mutationError).toBeNull();
    });
});
