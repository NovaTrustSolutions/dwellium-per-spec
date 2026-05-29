/**
 * Transient drill-down state for the Workspace widget (Domaine → Project → Thread).
 *
 * Plain zustand (NOT persisted) — mirrors Holocron's domainesStore navigation logic
 * (index → domaine → project) translated to the web runtime. Per-user PREFERENCES
 * (sort modes, last-active domaine) live separately in workspaceUiStore (localStorage);
 * server DATA (the domaines list) is cached here, not persisted, because it's fetched.
 *
 * Cycle 4 scaffold: state shape + pure synchronous setters only.
 * Cycle 5: adds the async `loadDomaines()` thunk that calls workspaceApi.fetchDomaines()
 *   and drives the loading/error/domaines triplet — consumed by the index view.
 * Cycle 6 (this edit): adds `loadTree()` (over the SHARED file-explorer tree endpoint,
 *   per decision D3) and the pure `projectsForDomaine()` selector that derives a domaine's
 *   projects from the tier-classified tree. The projects list is NOT a separate fetch —
 *   it's read off the cached `tree`. Tree fetch has its own loading/error pair so the
 *   index view's loading/error stays independent of the domaine (projects) view. Tests
 *   mock the api modules (vi.mock) so this stays deterministic.
 */
import { create } from 'zustand';
import { fetchDomaines, type DomaineMeta } from './workspaceApi';
import { fetchTree } from '../FileExplorer/fileExplorerApi';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';

/** Which drill-down altitude the widget is showing. */
export type WorkspaceView = 'index' | 'domaine' | 'project';

interface WorkspaceState {
    /** Current drill-down altitude. */
    view: WorkspaceView;
    /** Path of the domaine currently drilled into (null at index). */
    activeDomainePath: string | null;
    /** Path of the project currently drilled into (null above project view). */
    activeProjectPath: string | null;

    /** Cached domaines list (populated by Cycle 5's loadDomaines; not persisted). */
    domaines: DomaineMeta[];
    /** True while a fetch is in flight (Cycle 5 toggles this). */
    loading: boolean;
    /** Last fetch/mutation error message, or null. */
    error: string | null;

    /** Cached file-explorer tree (Cycle 6 loadTree sink; source for projectsForDomaine). */
    tree: FileEntry[];
    /** True while the tree fetch is in flight (independent of the domaines `loading`). */
    treeLoading: boolean;
    /** Last tree-fetch error message, or null (independent of the domaines `error`). */
    treeError: string | null;

    /** Replace the cached domaines list (Cycle 5 fetch result sink). */
    setDomaines: (domaines: DomaineMeta[]) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    /** Replace the cached tree (Cycle 6 fetch result sink). */
    setTree: (tree: FileEntry[]) => void;

    /** Navigate to the domaines index (clears active domaine + project). */
    goToIndex: () => void;
    /** Drill into a domaine (clears any active project). */
    openDomaine: (domainePath: string) => void;
    /** Drill into a project within the active domaine. */
    openProject: (projectPath: string) => void;
    /** Step back one altitude (project → domaine → index). */
    goBack: () => void;

    /** Resolve a project's parent domaine path from the path prefix (web analog of useDomaineForProject). */
    domaineForProject: (projectPath: string) => DomaineMeta | null;

    /** Derive the project-tier children of a domaine from the cached tree (Cycle 6, pure). */
    projectsForDomaine: (domainePath: string) => FileEntry[];

    /** Fetch the domaines list from the backend, driving loading/error/domaines (Cycle 5). */
    loadDomaines: () => Promise<void>;

    /** Fetch the shared file-explorer tree, driving treeLoading/treeError/tree (Cycle 6). */
    loadTree: () => Promise<void>;

    /** Reset all transient state to initial (test-friendly + logout-friendly). */
    reset: () => void;
}

const INITIAL = {
    view: 'index' as WorkspaceView,
    activeDomainePath: null as string | null,
    activeProjectPath: null as string | null,
    domaines: [] as DomaineMeta[],
    loading: false,
    error: null as string | null,
    tree: [] as FileEntry[],
    treeLoading: false,
    treeError: null as string | null,
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
    ...INITIAL,

    setDomaines: (domaines) => set({ domaines }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setTree: (tree) => set({ tree }),

    goToIndex: () => set({ view: 'index', activeDomainePath: null, activeProjectPath: null }),

    openDomaine: (domainePath) =>
        set({ view: 'domaine', activeDomainePath: domainePath, activeProjectPath: null }),

    openProject: (projectPath) => set({ view: 'project', activeProjectPath: projectPath }),

    goBack: () => {
        const { view } = get();
        if (view === 'project') {
            set({ view: 'domaine', activeProjectPath: null });
        } else if (view === 'domaine') {
            set({ view: 'index', activeDomainePath: null });
        }
        // already at index — no-op
    },

    domaineForProject: (projectPath) => {
        // A project folder is physically nested under its domaine folder, so the
        // domaine path is the project path's first segment (D3 — path is the map).
        const firstSeg = projectPath.split('/').filter(Boolean)[0];
        if (!firstSeg) return null;
        return get().domaines.find((d) => d.path === firstSeg) ?? null;
    },

    projectsForDomaine: (domainePath) => {
        // Projects are the depth-2 folders the backend tier-classifies as 'project',
        // sitting directly under the matching depth-1 'domain' node (D3 — the tree is
        // the source of structure; sidecar metadata is layered separately). The tree's
        // top level is the domain nodes, so a direct match on path is sufficient.
        const domainNode = get().tree.find((n) => n.path === domainePath);
        if (!domainNode?.children) return [];
        return domainNode.children.filter((c) => c.tier === 'project');
    },

    loadDomaines: async () => {
        set({ loading: true, error: null });
        try {
            const list = await fetchDomaines();
            set({ domaines: list, loading: false });
        } catch (err) {
            set({
                error: err instanceof Error ? err.message : 'Failed to load domaines',
                loading: false,
            });
        }
    },

    loadTree: async () => {
        set({ treeLoading: true, treeError: null });
        try {
            const tree = await fetchTree();
            set({ tree, treeLoading: false });
        } catch (err) {
            set({
                treeError: err instanceof Error ? err.message : 'Failed to load workspace tree',
                treeLoading: false,
            });
        }
    },

    reset: () => set({ ...INITIAL }),
}));
