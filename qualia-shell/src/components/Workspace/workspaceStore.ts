/**
 * Transient drill-down state for the Workspace widget (Domaine → Project → Thread).
 *
 * Plain zustand (NOT persisted) — mirrors Holocron's domainesStore navigation logic
 * (index → domaine → project) translated to the web runtime. Per-user PREFERENCES
 * (sort modes, last-active domaine) live separately in workspaceUiStore (localStorage);
 * server DATA (the domaines list) is cached here, not persisted, because it's fetched.
 *
 * Cycle 4 scaffold: state shape + pure synchronous setters only. The async
 * `loadDomaines()` action that calls workspaceApi.fetchDomaines() is deliberately
 * NOT wired this cycle (plan §11 — Cycle 5 adds fetch + the index view). Keeping the
 * fetch out of this cycle keeps the unit tests pure and the gate fast.
 */
import { create } from 'zustand';
import type { DomaineMeta } from './workspaceApi';

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

    /** Replace the cached domaines list (Cycle 5 fetch result sink). */
    setDomaines: (domaines: DomaineMeta[]) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;

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
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
    ...INITIAL,

    setDomaines: (domaines) => set({ domaines }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

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

    reset: () => set({ ...INITIAL }),
}));
