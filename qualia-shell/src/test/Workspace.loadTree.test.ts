/**
 * Cycle 6 — workspaceStore.loadTree() async thunk + projectsForDomaine() selector.
 *
 * loadTree imports fetchTree from the SHARED file-explorer api (decision D3); we vi.mock
 * that module so the thunk is deterministic (no real HTTP). Covers the happy path (tree
 * cached, treeLoading cleared), the error path (treeError captured, treeLoading cleared,
 * tree left empty), stale-error clearing on reload, and the non-Error fallback. Then the
 * pure projectsForDomaine() derivation: project-tier children of the matching domain node,
 * non-project siblings ignored, and an empty result for an unknown domaine.
 *
 * Pure async/sync assertions — no React render, no fake timers (Phase-7 Finding (B)).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

const fetchTreeMock = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', () => ({
    fetchTree: () => fetchTreeMock(),
}));

import { useWorkspaceStore } from '../components/Workspace/workspaceStore';

const TREE: FileEntry[] = [
    {
        name: 'Legal', path: 'Legal', tier: 'domain',
        children: [
            {
                name: 'Acme Contract', path: 'Legal/Acme Contract', tier: 'project',
                children: [
                    { name: 'intake', path: 'Legal/Acme Contract/intake', tier: 'thread' },
                    { name: 'review', path: 'Legal/Acme Contract/review', tier: 'thread' },
                ],
            },
            { name: 'NDA', path: 'Legal/NDA', tier: 'project', children: [] },
            // a stray file at the domaine root must NOT be treated as a project
            { name: 'readme.md', path: 'Legal/readme.md', tier: 'file' },
        ],
    },
    { name: 'Finance', path: 'Finance', tier: 'domain', children: [] },
];

beforeEach(() => {
    fetchTreeMock.mockReset();
    useWorkspaceStore.getState().reset();
});

describe('Cycle 6 — workspaceStore.loadTree()', () => {
    it('happy path: caches the tree and clears treeLoading', async () => {
        fetchTreeMock.mockResolvedValueOnce(TREE);
        await useWorkspaceStore.getState().loadTree();
        const s = useWorkspaceStore.getState();
        expect(s.tree).toHaveLength(2);
        expect(s.tree[0].name).toBe('Legal');
        expect(s.treeLoading).toBe(false);
        expect(s.treeError).toBeNull();
    });

    it('error path: captures the message, clears treeLoading, leaves tree empty', async () => {
        fetchTreeMock.mockRejectedValueOnce(new Error('HTTP 500'));
        await useWorkspaceStore.getState().loadTree();
        const s = useWorkspaceStore.getState();
        expect(s.treeError).toBe('HTTP 500');
        expect(s.treeLoading).toBe(false);
        expect(s.tree).toEqual([]);
    });

    it('clears a stale treeError on a subsequent successful load', async () => {
        fetchTreeMock.mockRejectedValueOnce(new Error('boom'));
        await useWorkspaceStore.getState().loadTree();
        expect(useWorkspaceStore.getState().treeError).toBe('boom');

        fetchTreeMock.mockResolvedValueOnce(TREE);
        await useWorkspaceStore.getState().loadTree();
        const s = useWorkspaceStore.getState();
        expect(s.treeError).toBeNull();
        expect(s.tree).toHaveLength(2);
    });

    it('falls back to a generic message for a non-Error rejection', async () => {
        fetchTreeMock.mockRejectedValueOnce('weird');
        await useWorkspaceStore.getState().loadTree();
        expect(useWorkspaceStore.getState().treeError).toBe('Failed to load workspace tree');
    });
});

describe('Cycle 6 — workspaceStore.projectsForDomaine()', () => {
    beforeEach(async () => {
        fetchTreeMock.mockResolvedValueOnce(TREE);
        await useWorkspaceStore.getState().loadTree();
    });

    it('returns only the project-tier children of the matching domaine', () => {
        const projects = useWorkspaceStore.getState().projectsForDomaine('Legal');
        expect(projects.map((p) => p.name)).toEqual(['Acme Contract', 'NDA']);
    });

    it('ignores non-project siblings (files) at the domaine root', () => {
        const projects = useWorkspaceStore.getState().projectsForDomaine('Legal');
        expect(projects.some((p) => p.tier !== 'project')).toBe(false);
    });

    it('returns an empty array for a domaine with no children', () => {
        expect(useWorkspaceStore.getState().projectsForDomaine('Finance')).toEqual([]);
    });

    it('returns an empty array for an unknown domaine path', () => {
        expect(useWorkspaceStore.getState().projectsForDomaine('Nope')).toEqual([]);
    });
});
