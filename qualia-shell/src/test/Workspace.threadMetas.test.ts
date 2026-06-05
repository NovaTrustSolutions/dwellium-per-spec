/**
 * Cycle 7 — workspaceStore.threadsForProject() selector + loadThreadMetas() thunk.
 *
 * threadsForProject() is pure: it walks the cached file-explorer tree (domain → project) and
 * returns the thread-tier children of the matching project node — non-thread siblings ignored,
 * empty for a childless or unknown project. loadThreadMetas() enriches threads with their
 * `.thread.json` sidecar via workspaceApi.fetchThreadMeta(); it is best-effort — each fetch is
 * settled independently so a rejecting sidecar (e.g. the sibling backend route not implemented)
 * is simply skipped while the rest still cache. We vi.mock both api modules so the store stays
 * deterministic (no real HTTP).
 *
 * Pure async/sync assertions — no React render, no fake timers (Phase-7 Finding (B)).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';
import type { ThreadMeta } from '../components/Workspace/workspaceApi';

const fetchTreeMock = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', () => ({
    fetchTree: () => fetchTreeMock(),
}));

const fetchThreadMetaMock = vi.fn();
const fetchDomainesMock = vi.fn();
vi.mock('../components/Workspace/workspaceApi', () => ({
    fetchThreadMeta: (path: string) => fetchThreadMetaMock(path),
    fetchDomaines: () => fetchDomainesMock(),
}));

import { useWorkspaceStore } from '../components/Workspace/workspaceStore';

const TREE: FileEntry[] = [
    {
        name: 'Legal', path: 'Legal', tier: 'domain',
        children: [
            {
                name: 'Acme Contract', path: 'Legal/Acme Contract', tier: 'project',
                children: [
                    {
                        name: 'intake', path: 'Legal/Acme Contract/intake', tier: 'thread',
                        children: [
                            { name: 'notes.md', path: 'Legal/Acme Contract/intake/notes.md', tier: 'file' },
                            { name: 'refs', path: 'Legal/Acme Contract/intake/refs', tier: 'folder' },
                        ],
                    },
                    { name: 'review', path: 'Legal/Acme Contract/review', tier: 'thread', children: [] },
                    // a stray file directly under the project must NOT be treated as a thread
                    { name: 'project.md', path: 'Legal/Acme Contract/project.md', tier: 'file' },
                ],
            },
            { name: 'NDA', path: 'Legal/NDA', tier: 'project', children: [] },
        ],
    },
];

function metaFor(name: string, status: ThreadMeta['status'], stage: string | null): ThreadMeta {
    return {
        name, projectName: 'Acme Contract',
        createdAt: '2026-01-01T00:00:00Z', lastModified: '2026-01-02T00:00:00Z',
        status, stage, continuedFrom: null, inheritedContext: null,
        honchoSessionId: null, compressionCount: 0, dumpCount: 0, reportCount: 0,
        lastDreamQuery: null, intakePromptShown: false,
    };
}

beforeEach(async () => {
    fetchTreeMock.mockReset();
    fetchThreadMetaMock.mockReset();
    fetchDomainesMock.mockReset();
    useWorkspaceStore.getState().reset();
    fetchTreeMock.mockResolvedValueOnce(TREE);
    await useWorkspaceStore.getState().loadTree();
});

describe('Cycle 7 — workspaceStore.threadsForProject()', () => {
    it('returns only the thread-tier children of the matching project', () => {
        const threads = useWorkspaceStore.getState().threadsForProject('Legal/Acme Contract');
        expect(threads.map((t) => t.name)).toEqual(['intake', 'review']);
    });

    it('ignores non-thread siblings (files) under the project', () => {
        const threads = useWorkspaceStore.getState().threadsForProject('Legal/Acme Contract');
        expect(threads.some((t) => t.tier !== 'thread')).toBe(false);
    });

    it('returns an empty array for a project with no children', () => {
        expect(useWorkspaceStore.getState().threadsForProject('Legal/NDA')).toEqual([]);
    });

    it('returns an empty array for an unknown project path', () => {
        expect(useWorkspaceStore.getState().threadsForProject('Legal/Nope')).toEqual([]);
    });
});

describe('Cycle 7 — workspaceStore.loadThreadMetas()', () => {
    it('caches each thread meta keyed by path and clears the loading flag', async () => {
        fetchThreadMetaMock
            .mockResolvedValueOnce(metaFor('intake', 'active', 'discovery'))
            .mockResolvedValueOnce(metaFor('review', 'complete', null));
        await useWorkspaceStore.getState().loadThreadMetas([
            'Legal/Acme Contract/intake',
            'Legal/Acme Contract/review',
        ]);
        const s = useWorkspaceStore.getState();
        expect(s.threadMetas['Legal/Acme Contract/intake'].status).toBe('active');
        expect(s.threadMetas['Legal/Acme Contract/intake'].stage).toBe('discovery');
        expect(s.threadMetas['Legal/Acme Contract/review'].status).toBe('complete');
        expect(s.threadMetaLoading).toBe(false);
    });

    it('best-effort: skips a rejecting sidecar but still caches the others', async () => {
        fetchThreadMetaMock
            .mockResolvedValueOnce(metaFor('intake', 'active', null))
            .mockRejectedValueOnce(new Error('Backend route not implemented yet'));
        await useWorkspaceStore.getState().loadThreadMetas([
            'Legal/Acme Contract/intake',
            'Legal/Acme Contract/review',
        ]);
        const s = useWorkspaceStore.getState();
        expect(s.threadMetas['Legal/Acme Contract/intake'].status).toBe('active');
        expect(s.threadMetas['Legal/Acme Contract/review']).toBeUndefined();
        expect(s.threadMetaLoading).toBe(false);
    });

    it('is a no-op (no fetch) for an empty path list', async () => {
        await useWorkspaceStore.getState().loadThreadMetas([]);
        expect(fetchThreadMetaMock).not.toHaveBeenCalled();
        expect(useWorkspaceStore.getState().threadMetaLoading).toBe(false);
    });

    it('merges newly-loaded metas into any already cached', async () => {
        fetchThreadMetaMock.mockResolvedValueOnce(metaFor('intake', 'active', null));
        await useWorkspaceStore.getState().loadThreadMetas(['Legal/Acme Contract/intake']);
        fetchThreadMetaMock.mockResolvedValueOnce(metaFor('review', 'complete', null));
        await useWorkspaceStore.getState().loadThreadMetas(['Legal/Acme Contract/review']);
        const metas = useWorkspaceStore.getState().threadMetas;
        expect(Object.keys(metas).sort()).toEqual([
            'Legal/Acme Contract/intake',
            'Legal/Acme Contract/review',
        ]);
    });
});
