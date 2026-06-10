/**
 * Per-user FileExplorer state — expansion state, selection, lock, view mode.
 * Sister-shape to scribeLayoutStore (Phase-8+ Task 8.10 Option β dynamic-key).
 * Andy's expanded folders ≠ Lisa's; loads on login.
 *
 * Cycle 2 scaffold: state shape defined, no data fetching yet. Cycle 3 will
 * wire /api/files/tree and populate the entries list.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export type ViewMode = 'tree' | 'flat';
/** Sort order applied in flat view. Tree view uses backend sort (folders first, then a→z). */
export type FlatSort = 'modified-desc' | 'name-asc' | 'size-desc';

export interface FileExplorerState {
    /** Map of folder path → expanded boolean. Persisted per-user. */
    expanded: Record<string, boolean>;
    /** Currently active/focused path. Used as anchor for Shift+range and for visual focus. */
    selectedPath: string | null;
    /** Cycle 11: multi-selection set (paths). selectedPath is always included if not null. */
    selectedPaths: string[];
    /** UI-only hierarchy lock — prevents drag/rename/move when true. Backend NOT enforced (Cycle 2 default per Ilya). */
    locked: boolean;
    /** Tree view (folders + children) vs Flat view (all files sorted by date). */
    viewMode: ViewMode;
    /** Sort order for flat view (Cycle 10). Ignored in tree mode. */
    flatSort: FlatSort;
}

export const DEFAULT_STATE: FileExplorerState = {
    expanded: {},
    selectedPath: null,
    selectedPaths: [],
    locked: false,
    viewMode: 'tree',
    flatSort: 'modified-desc',
};

export const fileExplorerUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = fileExplorerUserIdHolder.current;
    return uid ? `file-explorer:${uid}` : 'file-explorer:_anonymous';
}

function normalize(raw: unknown): FileExplorerState {
    if (!raw || typeof raw !== 'object') return DEFAULT_STATE;
    const obj = raw as Record<string, unknown>;
    const flatSort = obj.flatSort === 'name-asc' || obj.flatSort === 'size-desc'
        ? obj.flatSort
        : 'modified-desc';
    return {
        expanded: typeof obj.expanded === 'object' && obj.expanded !== null
            ? obj.expanded as Record<string, boolean>
            : {},
        selectedPath: typeof obj.selectedPath === 'string' ? obj.selectedPath : null,
        selectedPaths: Array.isArray(obj.selectedPaths)
            ? (obj.selectedPaths as unknown[]).filter((x): x is string => typeof x === 'string')
            : (typeof obj.selectedPath === 'string' ? [obj.selectedPath] : []),
        locked: typeof obj.locked === 'boolean' ? obj.locked : false,
        viewMode: obj.viewMode === 'flat' ? 'flat' : 'tree',
        flatSort: flatSort as FlatSort,
    };
}

export const fileExplorerStore = withSync(
    createLocalStorageStore<FileExplorerState>({
        key: resolveKey,
        deserializer: (raw) => {
            if (!raw) return DEFAULT_STATE;
            try { return normalize(JSON.parse(raw)); } catch { return DEFAULT_STATE; }
        },
        defaultValue: DEFAULT_STATE,
    }),
    { objectType: 'file-explorer', holder: fileExplorerUserIdHolder, resolveKey },
);

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
