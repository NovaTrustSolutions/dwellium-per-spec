/**
 * Per-user FileExplorer state — expansion state, selection, lock, view mode.
 * Sister-shape to scribeLayoutStore (Phase-8+ Task 8.10 Option β dynamic-key).
 * Andy's expanded folders ≠ Lisa's; loads on login.
 *
 * Cycle 2 scaffold: state shape defined, no data fetching yet. Cycle 3 will
 * wire /api/files/tree and populate the entries list.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

export type ViewMode = 'tree' | 'flat';

export interface FileExplorerState {
    /** Map of folder path → expanded boolean. Persisted per-user. */
    expanded: Record<string, boolean>;
    /** Currently selected file/folder path. Null = nothing selected. */
    selectedPath: string | null;
    /** UI-only hierarchy lock — prevents drag/rename/move when true. Backend NOT enforced (Cycle 2 default per Ilya). */
    locked: boolean;
    /** Tree view (folders + children) vs Flat view (all files sorted by date). */
    viewMode: ViewMode;
}

export const DEFAULT_STATE: FileExplorerState = {
    expanded: {},
    selectedPath: null,
    locked: false,
    viewMode: 'tree',
};

export const fileExplorerUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = fileExplorerUserIdHolder.current;
    return uid ? `file-explorer:${uid}` : 'file-explorer:_anonymous';
}

function normalize(raw: unknown): FileExplorerState {
    if (!raw || typeof raw !== 'object') return DEFAULT_STATE;
    const obj = raw as Record<string, unknown>;
    return {
        expanded: typeof obj.expanded === 'object' && obj.expanded !== null
            ? obj.expanded as Record<string, boolean>
            : {},
        selectedPath: typeof obj.selectedPath === 'string' ? obj.selectedPath : null,
        locked: typeof obj.locked === 'boolean' ? obj.locked : false,
        viewMode: obj.viewMode === 'flat' ? 'flat' : 'tree',
    };
}

export const fileExplorerStore = createLocalStorageStore<FileExplorerState>({
    key: resolveKey,
    deserializer: (raw) => {
        if (!raw) return DEFAULT_STATE;
        try { return normalize(JSON.parse(raw)); } catch { return DEFAULT_STATE; }
    },
    defaultValue: DEFAULT_STATE,
});

export function saveFileExplorer(patch: Partial<FileExplorerState>): void {
    const prev = fileExplorerStore.getSnapshot();
    const next: FileExplorerState = { ...prev, ...patch };
    fileExplorerStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function toggleFolderExpanded(path: string): void {
    const prev = fileExplorerStore.getSnapshot();
    const next: FileExplorerState = {
        ...prev,
        expanded: { ...prev.expanded, [path]: !prev.expanded[path] },
    };
    fileExplorerStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}
