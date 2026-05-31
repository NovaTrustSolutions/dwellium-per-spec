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
 * Cycle 7: adds the pure `threadsForProject()` selector (thread-tier children of
 *   the matching project node, again off the cached tree — same source of truth) plus the
 *   `loadThreadMetas()` thunk that ENRICHES threads with their `.thread.json` sidecar
 *   metadata (status/stage/counts) via workspaceApi.fetchThreadMeta(). Metas are best-effort:
 *   each per-thread fetch is settled independently (Promise.allSettled) so a missing/erroring
 *   sidecar (e.g. the sibling backend route not yet implemented) simply yields no badge — the
 *   thread LIST itself always renders from the tree regardless. Tests mock the api modules
 *   (vi.mock) so this stays deterministic.
 * Cycle 8 (this edit): the MUTATION layer. Structure mutations (`createEntry` / `renameEntry`
 *   / `removeEntry` / `moveEntry`) go over the SHARED file-explorer routes (mkdir/rename/
 *   move/entry — decision D1/D3); metadata mutations (`saveDomaineMeta` via putDomaine,
 *   `setThreadStatus` via putThreadMeta) go over the workspace sidecar routes. Each structure
 *   mutation re-fetches the affected cache on success (`loadTree`, plus `loadDomaines` when a
 *   depth-1 domaine folder changed) so the view reflects reality without a manual refresh —
 *   mirroring FileExplorer's refetch-on-mutation (no live watcher, plan §2). A dedicated
 *   `mutating`/`mutationError` pair keeps mutation feedback separate from the load
 *   `loading`/`error` + `treeLoading`/`treeError` pairs, so a failed create never blanks the
 *   list. Folder names are validated client-side to match the backend's rename guard (no
 *   empty / `/` / `\` / `..`). Thunks return a boolean so the UI can close its inline editor
 *   on success only. Tests mock both api modules (vi.mock) for determinism.
 */
import { create } from 'zustand';
import {
    fetchDomaines, fetchThreadMeta, putDomaine, putThreadMeta,
    type DomaineMeta, type DomainePatch, type ThreadMeta,
} from './workspaceApi';
import { fetchTree, mkdir, rename, move, deleteEntry } from '../FileExplorer/fileExplorerApi';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';
import { SEED_DOMAINES, SEED_TREE } from './workspaceLocalSeed';

/** Which drill-down altitude the widget is showing. */
export type WorkspaceView = 'index' | 'domaine' | 'project';

/** Number of path segments — 1 = domaine, 2 = project, 3 = thread (D3, path is the tier). */
function pathDepth(p: string): number {
    return p.split('/').filter(Boolean).length;
}

/**
 * Validate a folder name against the same guard the backend rename route enforces
 * (`Docs/backend-file-explorer-routes.ts:192`). Returns an error message, or null if valid.
 */
function nameError(name: string): string | null {
    if (!name) return 'Name cannot be empty';
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
        return 'Name cannot contain  /  \\  or  ..';
    }
    return null;
}

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

    /** True while a create/rename/move/delete/metadata mutation is in flight (Cycle 8). */
    mutating: boolean;
    /** Last mutation error message, or null. Separate from load `error`/`treeError`. */
    mutationError: string | null;

    /**
     * True when the view is showing the built-in local sample workspace because the
     * backend domaines/tree routes were unreachable (Cycle 9). Read-only fallback so the
     * Domaine→Project→Thread drill-down stays reachable offline; the UI shows an honest
     * banner. Cleared automatically the next time a real fetch succeeds.
     */
    offline: boolean;

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

    /**
     * Populate domaines + tree from the built-in local sample workspace and flag `offline`
     * (Cycle 9). Used by the index/drill-down views as a fallback when the backend routes
     * are unreachable, so the drill-down is demonstrable offline. Clears load errors +
     * loading flags. Sets domaines AND tree together so the pure selectors stay consistent.
     */
    useLocalWorkspace: () => void;

    /** Best-effort enrich the given threads with their sidecar metadata (Cycle 7). */
    loadThreadMetas: (threadPaths: string[]) => Promise<void>;

    /** Clear the last mutation error (UI dismiss). */
    clearMutationError: () => void;

    /**
     * Create a folder. `parentPath === null` creates a depth-1 domaine (name only);
     * otherwise the child is `${parentPath}/${name}`. Reloads the tree (and the domaines
     * list for a depth-1 create) on success. Returns true iff the mutation succeeded.
     */
    createEntry: (parentPath: string | null, name: string) => Promise<boolean>;

    /** Rename a folder to `toName` (same parent). Reloads affected caches. Returns success. */
    renameEntry: (path: string, toName: string) => Promise<boolean>;

    /** Delete a folder (recursive, backend-side). Steps out if the active node was removed. */
    removeEntry: (path: string) => Promise<boolean>;

    /** Move/rename a folder to a new full path (cross-parent). Reloads affected caches. */
    moveEntry: (fromPath: string, toPath: string) => Promise<boolean>;

    /** Upsert a domaine's `.domaine.json` sidecar (color/description/position); reloads domaines. */
    saveDomaineMeta: (domainePath: string, patch: DomainePatch) => Promise<boolean>;

    /** Toggle a thread's status sidecar field; merges the result into the threadMetas cache. */
    setThreadStatus: (threadPath: string, status: 'active' | 'complete') => Promise<boolean>;

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
    mutating: false,
    mutationError: null as string | null,
    offline: false,
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
            set({ domaines: list, loading: false, offline: false });
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
            set({ tree, treeLoading: false, offline: false });
        } catch (err) {
            set({
                treeError: err instanceof Error ? err.message : 'Failed to load workspace tree',
                treeLoading: false,
            });
        }
    },

    useLocalWorkspace: () => set({
        domaines: SEED_DOMAINES,
        tree: SEED_TREE,
        offline: true,
        loading: false,
        treeLoading: false,
        error: null,
        treeError: null,
    }),

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

    clearMutationError: () => set({ mutationError: null }),

    createEntry: async (parentPath, rawName) => {
        const name = rawName.trim();
        const invalid = nameError(name);
        if (invalid) { set({ mutationError: invalid }); return false; }
        const fullPath = parentPath ? `${parentPath}/${name}` : name;
        set({ mutating: true, mutationError: null });
        try {
            await mkdir(fullPath);
            await get().loadTree();
            // A new depth-1 folder is a new domaine — refresh the domaines list too.
            if (parentPath === null) await get().loadDomaines();
            set({ mutating: false });
            return true;
        } catch (err) {
            set({ mutating: false, mutationError: err instanceof Error ? err.message : 'Failed to create' });
            return false;
        }
    },

    renameEntry: async (path, rawToName) => {
        const toName = rawToName.trim();
        const invalid = nameError(toName);
        if (invalid) { set({ mutationError: invalid }); return false; }
        set({ mutating: true, mutationError: null });
        try {
            const { toPath } = await rename(path, toName);
            // Defensive: if the renamed node happens to be one we've drilled into, follow it.
            const st = get();
            const patch: Partial<WorkspaceState> = {};
            if (st.activeProjectPath === path) patch.activeProjectPath = toPath;
            if (st.activeDomainePath === path) patch.activeDomainePath = toPath;
            if (Object.keys(patch).length) set(patch);
            await get().loadTree();
            if (pathDepth(path) === 1) await get().loadDomaines();
            set({ mutating: false });
            return true;
        } catch (err) {
            set({ mutating: false, mutationError: err instanceof Error ? err.message : 'Failed to rename' });
            return false;
        }
    },

    removeEntry: async (path) => {
        set({ mutating: true, mutationError: null });
        try {
            await deleteEntry(path);
            // Defensive: stepping out if we deleted the node we're currently inside.
            const st = get();
            if (st.activeProjectPath === path) set({ view: 'domaine', activeProjectPath: null });
            else if (st.activeDomainePath === path) {
                set({ view: 'index', activeDomainePath: null, activeProjectPath: null });
            }
            await get().loadTree();
            if (pathDepth(path) === 1) await get().loadDomaines();
            set({ mutating: false });
            return true;
        } catch (err) {
            set({ mutating: false, mutationError: err instanceof Error ? err.message : 'Failed to delete' });
            return false;
        }
    },

    moveEntry: async (fromPath, toPath) => {
        set({ mutating: true, mutationError: null });
        try {
            await move(fromPath, toPath);
            await get().loadTree();
            if (pathDepth(fromPath) === 1 || pathDepth(toPath) === 1) await get().loadDomaines();
            set({ mutating: false });
            return true;
        } catch (err) {
            set({ mutating: false, mutationError: err instanceof Error ? err.message : 'Failed to move' });
            return false;
        }
    },

    saveDomaineMeta: async (domainePath, patch) => {
        set({ mutating: true, mutationError: null });
        try {
            await putDomaine(domainePath, patch);
            await get().loadDomaines();
            set({ mutating: false });
            return true;
        } catch (err) {
            set({ mutating: false, mutationError: err instanceof Error ? err.message : 'Failed to save domaine' });
            return false;
        }
    },

    setThreadStatus: async (threadPath, status) => {
        set({ mutating: true, mutationError: null });
        try {
            const saved = await putThreadMeta(threadPath, { status });
            const existing = get().threadMetas[threadPath];
            // Optimistically reflect the new status; merge any fuller meta the route echoed back.
            const merged = { ...(existing ?? {}), ...saved, status } as ThreadMeta;
            set({ threadMetas: { ...get().threadMetas, [threadPath]: merged }, mutating: false });
            return true;
        } catch (err) {
            set({ mutating: false, mutationError: err instanceof Error ? err.message : 'Failed to update thread' });
            return false;
        }
    },

    reset: () => set({ ...INITIAL }),
}));
