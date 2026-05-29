/**
 * Per-user Workspace UI preferences — sort modes, last-active domaine, expansion.
 * Sister-shape to fileExplorerStore (Phase-8+ Task 8.10 Option β dynamic-key):
 * Andy's sort prefs ≠ Lisa's; loads on login, persists across logout.
 *
 * SSR-safe via createLocalStorageStore (`getServerSnapshot` returns DEFAULT_STATE
 * — no init-time localStorage read). Holder pattern: workspaceUserIdHolder.current
 * is updated by the Workspace widget during render BEFORE useSyncExternalStore reads
 * (mirrors fileExplorerUserIdHolder + integrationsUserIdHolder).
 *
 * Cycle 4 scaffold: state shape + setters + persistence. NO server data lives here
 * (domaines list / tree are fetched into the transient zustand workspaceStore). Cycle 5+
 * wires the views that read/write these prefs.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

/** Sort order for a tier list (domaines / projects / threads). */
export type WorkspaceSort = 'name-asc' | 'modified-desc' | 'position-asc';

export interface WorkspaceUiState {
    /** Sort applied to the domaine index grid. Persisted per-user. */
    sortDomaine: WorkspaceSort;
    /** Sort applied to the project list within a domaine. */
    sortProject: WorkspaceSort;
    /** Sort applied to the thread list within a project. */
    sortThread: WorkspaceSort;
    /** Last domaine the user had open — used to restore drill-down on remount. */
    lastActiveDomainePath: string | null;
    /** Map of path → expanded boolean (collapsible sections within a view). */
    expanded: Record<string, boolean>;
}

export const DEFAULT_STATE: WorkspaceUiState = {
    sortDomaine: 'position-asc',
    sortProject: 'name-asc',
    sortThread: 'modified-desc',
    lastActiveDomainePath: null,
    expanded: {},
};

const VALID_SORTS: readonly WorkspaceSort[] = ['name-asc', 'modified-desc', 'position-asc'];

export const workspaceUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = workspaceUserIdHolder.current;
    return uid ? `workspace:${uid}` : 'workspace:_anonymous';
}

function coerceSort(raw: unknown, fallback: WorkspaceSort): WorkspaceSort {
    return VALID_SORTS.includes(raw as WorkspaceSort) ? (raw as WorkspaceSort) : fallback;
}

function normalize(raw: unknown): WorkspaceUiState {
    if (!raw || typeof raw !== 'object') return DEFAULT_STATE;
    const obj = raw as Record<string, unknown>;
    return {
        sortDomaine: coerceSort(obj.sortDomaine, DEFAULT_STATE.sortDomaine),
        sortProject: coerceSort(obj.sortProject, DEFAULT_STATE.sortProject),
        sortThread: coerceSort(obj.sortThread, DEFAULT_STATE.sortThread),
        lastActiveDomainePath: typeof obj.lastActiveDomainePath === 'string' ? obj.lastActiveDomainePath : null,
        expanded: typeof obj.expanded === 'object' && obj.expanded !== null
            ? (obj.expanded as Record<string, boolean>)
            : {},
    };
}

export const workspaceUiStore = createLocalStorageStore<WorkspaceUiState>({
    key: resolveKey,
    deserializer: (raw) => {
        if (!raw) return DEFAULT_STATE;
        try { return normalize(JSON.parse(raw)); } catch { return DEFAULT_STATE; }
    },
    defaultValue: DEFAULT_STATE,
});

export function saveWorkspaceUi(patch: Partial<WorkspaceUiState>): void {
    const prev = workspaceUiStore.getSnapshot();
    const next: WorkspaceUiState = { ...prev, ...patch };
    workspaceUiStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function toggleWorkspaceExpanded(path: string): void {
    const prev = workspaceUiStore.getSnapshot();
    const next: WorkspaceUiState = {
        ...prev,
        expanded: { ...prev.expanded, [path]: !prev.expanded[path] },
    };
    workspaceUiStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}
