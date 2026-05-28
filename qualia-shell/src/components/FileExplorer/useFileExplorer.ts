/**
 * Hook for reading FileExplorer's per-user state.
 * Sister to useScribeLayout / useScribeTheme.
 */
import { useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../../context/UserContext';
import {
    fileExplorerStore,
    fileExplorerUserIdHolder,
    saveFileExplorer,
    toggleFolderExpanded,
    type FileExplorerState,
    type ViewMode,
    type FlatSort,
} from './fileExplorerStore';

export function useFileExplorer(): FileExplorerState & {
    setSelectedPath: (path: string | null) => void;
    setSelectedPaths: (paths: string[]) => void;
    toggleSelected: (path: string) => void;
    selectRange: (anchor: string | null, target: string, allPaths: string[]) => void;
    setLocked: (locked: boolean) => void;
    setViewMode: (mode: ViewMode) => void;
    setFlatSort: (sort: FlatSort) => void;
    toggleFolder: (path: string) => void;
} {
    const userCtx = useContext(UserContext);
    fileExplorerUserIdHolder.current = userCtx?.user?.id ?? null;

    const state = useSyncExternalStore(
        fileExplorerStore.subscribe,
        fileExplorerStore.getSnapshot,
        fileExplorerStore.getServerSnapshot,
    );

    return {
        ...state,
        setSelectedPath: (path) => saveFileExplorer({ selectedPath: path, selectedPaths: path ? [path] : [] }),
        setSelectedPaths: (paths) => saveFileExplorer({
            selectedPaths: paths,
            // Keep selectedPath as anchor — last item in the list, or null if empty
            selectedPath: paths.length > 0 ? paths[paths.length - 1] : null,
        }),
        toggleSelected: (path) => {
            const current = new Set(state.selectedPaths);
            if (current.has(path)) current.delete(path);
            else current.add(path);
            const next = Array.from(current);
            saveFileExplorer({ selectedPaths: next, selectedPath: path });
        },
        selectRange: (anchor, target, allPaths) => {
            if (!anchor) {
                saveFileExplorer({ selectedPaths: [target], selectedPath: target });
                return;
            }
            const aIdx = allPaths.indexOf(anchor);
            const bIdx = allPaths.indexOf(target);
            if (aIdx === -1 || bIdx === -1) {
                saveFileExplorer({ selectedPaths: [target], selectedPath: target });
                return;
            }
            const [lo, hi] = aIdx <= bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
            saveFileExplorer({ selectedPaths: allPaths.slice(lo, hi + 1), selectedPath: target });
        },
        setLocked: (locked) => saveFileExplorer({ locked }),
        setViewMode: (mode) => saveFileExplorer({ viewMode: mode }),
        setFlatSort: (sort) => saveFileExplorer({ flatSort: sort }),
        toggleFolder: (path) => toggleFolderExpanded(path),
    };
}
