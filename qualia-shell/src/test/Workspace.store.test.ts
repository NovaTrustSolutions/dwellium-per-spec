/**
 * Cycle 4 — Workspace store scaffold unit tests.
 *
 * Covers the two Workspace state primitives created this cycle:
 *   1. workspaceUiStore  — per-user localStorage prefs (createLocalStorageStore
 *                          dynamic-key sister to fileExplorerStore). SSR-safety
 *                          (getServerSnapshot), normalize/coerce, per-user isolation.
 *   2. useWorkspaceStore — transient zustand drill-down nav (index→domaine→project).
 *
 * NO fetch is wired this cycle, so these are pure synchronous assertions — no React
 * render, no fake timers (Phase-7 Finding (B) convention). Per the v2.72.1 standing
 * convention, every factory-produced store is .reset() in beforeEach to avoid
 * cross-test module-cache pollution.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    workspaceUiStore,
    workspaceUserIdHolder,
    saveWorkspaceUi,
    toggleWorkspaceExpanded,
    DEFAULT_STATE,
} from '../components/Workspace/workspaceUiStore';
import { useWorkspaceStore } from '../components/Workspace/workspaceStore';
import type { DomaineMeta } from '../components/Workspace/workspaceApi';

beforeEach(() => {
    localStorage.clear();
    workspaceUiStore.reset();
    workspaceUserIdHolder.current = null;
    useWorkspaceStore.getState().reset();
});

describe('Cycle 4 — workspaceUiStore: SSR-safety contract', () => {
    it('getServerSnapshot() returns DEFAULT_STATE (no init-time localStorage read)', () => {
        const snap = workspaceUiStore.getServerSnapshot();
        expect(snap).toEqual(DEFAULT_STATE);
        expect(snap.sortDomaine).toBe('position-asc');
        expect(snap.sortProject).toBe('name-asc');
        expect(snap.sortThread).toBe('modified-desc');
        expect(snap.lastActiveDomainePath).toBeNull();
        expect(snap.expanded).toEqual({});
    });

    it('getSnapshot() returns DEFAULT_STATE when no value is persisted', () => {
        expect(workspaceUiStore.getSnapshot()).toEqual(DEFAULT_STATE);
    });
});

describe('Cycle 4 — workspaceUiStore: persistence + normalize', () => {
    it('saveWorkspaceUi persists a patch and round-trips through localStorage', () => {
        workspaceUserIdHolder.current = 'andy';
        saveWorkspaceUi({ sortDomaine: 'name-asc', lastActiveDomainePath: 'Legal' });
        const snap = workspaceUiStore.getSnapshot();
        expect(snap.sortDomaine).toBe('name-asc');
        expect(snap.lastActiveDomainePath).toBe('Legal');
        // untouched fields keep their defaults
        expect(snap.sortThread).toBe('modified-desc');
        // it actually hit localStorage under the user-scoped key
        expect(localStorage.getItem('workspace:andy')).toContain('name-asc');
    });

    it('toggleWorkspaceExpanded flips a path boolean and persists', () => {
        workspaceUserIdHolder.current = 'andy';
        toggleWorkspaceExpanded('Legal/Acme');
        expect(workspaceUiStore.getSnapshot().expanded['Legal/Acme']).toBe(true);
        toggleWorkspaceExpanded('Legal/Acme');
        expect(workspaceUiStore.getSnapshot().expanded['Legal/Acme']).toBe(false);
    });

    it('normalize coerces an invalid sort value back to the default', () => {
        localStorage.setItem('workspace:andy', JSON.stringify({ sortDomaine: 'bogus-sort' }));
        workspaceUserIdHolder.current = 'andy';
        workspaceUiStore.reset(); // force re-read of the just-written value
        expect(workspaceUiStore.getSnapshot().sortDomaine).toBe('position-asc');
    });

    it('normalize falls back to DEFAULT_STATE on malformed JSON', () => {
        localStorage.setItem('workspace:andy', '{not valid json');
        workspaceUserIdHolder.current = 'andy';
        workspaceUiStore.reset();
        expect(workspaceUiStore.getSnapshot()).toEqual(DEFAULT_STATE);
    });
});

describe('Cycle 4 — workspaceUiStore: per-user isolation (dynamic key)', () => {
    it('Andy and Lisa get separate namespaces; switching the holder re-reads', () => {
        workspaceUserIdHolder.current = 'andy';
        saveWorkspaceUi({ sortDomaine: 'name-asc' });

        // Lisa has nothing persisted → her snapshot is the default
        workspaceUserIdHolder.current = 'lisa';
        expect(workspaceUiStore.getSnapshot().sortDomaine).toBe('position-asc');

        // back to Andy → his persisted value returns (cache invalidates on key change)
        workspaceUserIdHolder.current = 'andy';
        expect(workspaceUiStore.getSnapshot().sortDomaine).toBe('name-asc');
    });
});

describe('Cycle 4 — useWorkspaceStore: drill-down navigation reducers', () => {
    it('starts at the index with nothing active', () => {
        const s = useWorkspaceStore.getState();
        expect(s.view).toBe('index');
        expect(s.activeDomainePath).toBeNull();
        expect(s.activeProjectPath).toBeNull();
    });

    it('openDomaine → openProject → goBack walks the altitudes correctly', () => {
        const { openDomaine, openProject, goBack } = useWorkspaceStore.getState();

        openDomaine('Legal');
        expect(useWorkspaceStore.getState().view).toBe('domaine');
        expect(useWorkspaceStore.getState().activeDomainePath).toBe('Legal');

        openProject('Legal/Acme');
        expect(useWorkspaceStore.getState().view).toBe('project');
        expect(useWorkspaceStore.getState().activeProjectPath).toBe('Legal/Acme');

        goBack();
        expect(useWorkspaceStore.getState().view).toBe('domaine');
        expect(useWorkspaceStore.getState().activeProjectPath).toBeNull();

        goBack();
        expect(useWorkspaceStore.getState().view).toBe('index');
        expect(useWorkspaceStore.getState().activeDomainePath).toBeNull();

        goBack(); // no-op at index
        expect(useWorkspaceStore.getState().view).toBe('index');
    });

    it('openDomaine clears any previously active project', () => {
        const { openProject, openDomaine } = useWorkspaceStore.getState();
        openProject('Legal/Acme');
        openDomaine('Finance');
        expect(useWorkspaceStore.getState().activeProjectPath).toBeNull();
        expect(useWorkspaceStore.getState().activeDomainePath).toBe('Finance');
    });

    it('domaineForProject resolves the parent domaine from the path prefix', () => {
        const domaines: DomaineMeta[] = [
            { name: 'Legal', path: 'Legal', description: '', color: '#6366f1', position: 0 },
            { name: 'Finance', path: 'Finance', description: '', color: '#8b5cf6', position: 1 },
        ];
        useWorkspaceStore.getState().setDomaines(domaines);
        const resolved = useWorkspaceStore.getState().domaineForProject('Finance/Q3-Budget');
        expect(resolved?.name).toBe('Finance');
        expect(useWorkspaceStore.getState().domaineForProject('Unknown/x')).toBeNull();
    });

    it('setLoading / setError / setDomaines update the fetch-status fields', () => {
        const { setLoading, setError, setDomaines } = useWorkspaceStore.getState();
        setLoading(true);
        expect(useWorkspaceStore.getState().loading).toBe(true);
        setError('boom');
        expect(useWorkspaceStore.getState().error).toBe('boom');
        setDomaines([{ name: 'X', path: 'X', description: '', color: '#000', position: 0 }]);
        expect(useWorkspaceStore.getState().domaines).toHaveLength(1);
    });
});
