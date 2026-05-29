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
 * Cycle 6: adds `loadTree()` (over the SHARED file-explorer tree endpoint, per decision
 *   D3) and the pure `projectsForDomaine()` selector that derives a domaine's projects from
 *   the tier-classified tree. The projects list is NOT a separate fetch — it's read off the
 *   cached `tree`. Tree fetch has its own loading/error pair so the index view's
 *   loading/error stays independent of the domaine (projects) view.
 * Cycle 7 (this edit): adds the pure `threadsForProject()` selector (thread-tier children of
 *   the matching project node, again off the cached tree — same source of truth) plus the
 *   `loadThreadMetas()` thunk that ENRICHES threads with their `.thread.json` sidecar
 *   metadata (status/stage/counts) via workspaceApi.fetchThreadMeta(). Metas are best-effort:
 *   each per-thread fetch is settled independently (Promise.allSettled) so a missing/erroring
 *   sidecar (e.g. the sibling backend route not yet implemented) simply yields no badge — the
 *   thread LIST itself always renders from the tree regardless. Tests mock the api modules
 *   (vi.mock) so this stays deterministic.
 */
import { create } from 'zustand';
import { fetchDomaines, fetchThreadMeta, type DomaineMeta, type ThreadMeta } from './workspaceApi';
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

    /** Cached per-thread sidecar metadata, keyed by thread path (Cycle 7 enrichment). */
    threadMetas: Record<string, ThreadMeta>;
    /** True while the active project's thread metas are being fetched (best-effort). */
    threadMetaLoading: boolean;

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

    /** Derive the thread-tier children of a project from the cached tree (Cycle 7, pure). */
    threadsForProject: (projectPath: string) => FileEntry[];

    /** Fetch the domaines list from the backend, driving loading/error/domaines (Cycle 5). */
    loadDomaines: () => Promise<void>;

    /** Fetch the shared file-explorer tree, driving treeLoading/treeError/tree (Cycle 6). */
    loadTree: () => Promise<void>;

    /** Best-effort enrich the given threads with their sidecar metadata (Cycle 7). */
    loadThreadMetas: (threadPaths: string[]) => Promise<void>;

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
    threadMetas: {} as Record<string, ThreadMeta>,
    threadMetaLoading: false,
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

    threadsForProject: (projectPath) => {
        // Threads are the thread-tier children of the matching project node. A project sits
        // one level under its domaine, so walk domain → project (mirrors projectsForDomaine's
        // single-hop derivation; the tree is the source of structure, D3).
        for (const domain of get().tree) {
            const proj = (domain.children ?? []).find((c) => c.path === projectPath);
            if (proj) return (proj.children ?? []).filter((c) => c.tier === 'thread');
        }
        return [];
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

    loadThreadMetas: async (threadPaths) => {
        if (threadPaths.length === 0) return;
        set({ threadMetaLoading: true });
        // Best-effort: settle each independently so one missing/erroring sidecar (e.g. the
        // sibling backend route not yet implemented) never blocks the rest or the thread list.
        const results = await Promise.allSettled(threadPaths.map((p) => fetchThreadMeta(p)));
        const next = { ...get().threadMetas };
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') next[threadPaths[i]] = r.value;
        });
        set({ threadMetas: next, threadMetaLoading: false });
    },

    reset: () => set({ ...INITIAL }),
}));
