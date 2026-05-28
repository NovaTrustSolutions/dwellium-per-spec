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
        setSelectedPath: (path) => saveFileExplorer({ selectedPath: path }),
        setLocked: (locked) => saveFileExplorer({ locked }),
        setViewMode: (mode) => saveFileExplorer({ viewMode: mode }),
        setFlatSort: (sort) => saveFileExplorer({ flatSort: sort }),
        toggleFolder: (path) => toggleFolderExpanded(path),
    };
}
