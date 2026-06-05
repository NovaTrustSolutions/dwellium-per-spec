/**
 * Cycle 9 — Workspace local-first fallback (offline drill-down reachability).
 *
 * When the backend domaines/tree routes are unreachable the Workspace index view used to
 * dead-end at "Failed to load domaines — HTTP 404" with nothing to drill into. The store
 * now exposes `useLocalWorkspace()` which loads a small self-consistent sample workspace
 * and flips `offline`, so the Domaine→Project→Thread drill-down stays reachable offline.
 *
 * These tests assert (1) the action populates domaines+tree+offline and clears load errors,
 * (2) the seed is self-consistent so the pure derivation selectors return the expected
 * projects/threads, and (3) a successful real load clears the offline flag. Pure store
 * assertions — no React render, no fake timers (Phase-7 Finding (B)).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fetchDomainesMock = vi.fn();
const fetchTreeMock = vi.fn();
vi.mock('../components/Workspace/workspaceApi', () => ({
    fetchDomaines: () => fetchDomainesMock(),
}));
vi.mock('../components/FileExplorer/fileExplorerApi', () => ({
    fetchTree: () => fetchTreeMock(),
    mkdir: vi.fn(), rename: vi.fn(), move: vi.fn(), deleteEntry: vi.fn(),
}));

import { useWorkspaceStore } from '../components/Workspace/workspaceStore';
import { SEED_DOMAINES, SEED_TREE } from '../components/Workspace/workspaceLocalSeed';

beforeEach(() => {
    fetchDomainesMock.mockReset();
    fetchTreeMock.mockReset();
    useWorkspaceStore.getState().reset();
});

describe('Cycle 9 — Workspace local fallback', () => {
    it('useLocalWorkspace() populates domaines + tree, flags offline, clears errors', () => {
        // Simulate a prior failed load having set an error.
        useWorkspaceStore.setState({ error: 'HTTP 404', treeError: 'HTTP 404' });
        useWorkspaceStore.getState().useLocalWorkspace();
        const s = useWorkspaceStore.getState();
        expect(s.offline).toBe(true);
        expect(s.domaines.length).toBe(SEED_DOMAINES.length);
        expect(s.domaines.length).toBeGreaterThan(0);
        expect(s.tree.length).toBe(SEED_TREE.length);
        expect(s.error).toBeNull();
        expect(s.treeError).toBeNull();
        expect(s.loading).toBe(false);
        expect(s.treeLoading).toBe(false);
    });

    it('seed is self-consistent: every domaine path matches a top-level tree node', () => {
        useWorkspaceStore.getState().useLocalWorkspace();
        const s = useWorkspaceStore.getState();
        for (const d of s.domaines) {
            expect(s.tree.some((n) => n.path === d.path && n.tier === 'domain')).toBe(true);
        }
    });

    it('drill-down selectors derive projects + threads off the seed', () => {
        useWorkspaceStore.getState().useLocalWorkspace();
        const s = useWorkspaceStore.getState();

        // Pick the first domaine and confirm it has project children.
        const domainePath = s.domaines[0].path;
        const projects = s.projectsForDomaine(domainePath);
        expect(projects.length).toBeGreaterThan(0);
        expect(projects.every((p) => p.tier === 'project')).toBe(true);

        // Drill into the first project and confirm it has thread children.
        const projectPath = projects[0].path;
        const threads = s.threadsForProject(projectPath);
        expect(threads.length).toBeGreaterThan(0);
        expect(threads.every((t) => t.tier === 'thread')).toBe(true);

        // Navigation actions update the view altitude.
        s.openDomaine(domainePath);
        expect(useWorkspaceStore.getState().view).toBe('domaine');
        s.openProject(projectPath);
        expect(useWorkspaceStore.getState().view).toBe('project');
        s.goBack();
        expect(useWorkspaceStore.getState().view).toBe('domaine');
    });

    it('a successful real load clears the offline flag', async () => {
        useWorkspaceStore.getState().useLocalWorkspace();
        expect(useWorkspaceStore.getState().offline).toBe(true);

        fetchDomainesMock.mockResolvedValueOnce([
            { name: 'Real', path: 'Real', description: '', color: '#fff', position: 0 },
        ]);
        await useWorkspaceStore.getState().loadDomaines();
        expect(useWorkspaceStore.getState().offline).toBe(false);
        expect(useWorkspaceStore.getState().domaines[0].name).toBe('Real');
    });

    it('a successful tree load also clears the offline flag', async () => {
        useWorkspaceStore.getState().useLocalWorkspace();
        fetchTreeMock.mockResolvedValueOnce([]);
        await useWorkspaceStore.getState().loadTree();
        expect(useWorkspaceStore.getState().offline).toBe(false);
    });

    it('reset() clears the offline flag', () => {
        useWorkspaceStore.getState().useLocalWorkspace();
        useWorkspaceStore.getState().reset();
        expect(useWorkspaceStore.getState().offline).toBe(false);
    });
});
