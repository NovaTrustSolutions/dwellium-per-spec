/**
 * Hook for reading the Workspace widget's per-user UI preferences.
 * Sister to useFileExplorer — sets the dynamic-key holder during render
 * (BEFORE useSyncExternalStore reads) so Andy's prefs ≠ Lisa's, then exposes
 * the persisted state plus thin setters.
 *
 * `useContext(UserContext)` (NOT `useUser()`) so the widget renders in tests
 * without an auth provider (sister to integrationsStore / useFileExplorer).
 */
import { useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../../context/UserContext';
import {
    workspaceUiStore,
    workspaceUserIdHolder,
    saveWorkspaceUi,
    toggleWorkspaceExpanded,
    type WorkspaceUiState,
    type WorkspaceSort,
} from './workspaceUiStore';

export function useWorkspaceUi(): WorkspaceUiState & {
    setSortDomaine: (sort: WorkspaceSort) => void;
    setSortProject: (sort: WorkspaceSort) => void;
    setSortThread: (sort: WorkspaceSort) => void;
    setLastActiveDomainePath: (path: string | null) => void;
    toggleExpanded: (path: string) => void;
} {
    const userCtx = useContext(UserContext);
    workspaceUserIdHolder.current = userCtx?.user?.id ?? null;

    const state = useSyncExternalStore(
        workspaceUiStore.subscribe,
        workspaceUiStore.getSnapshot,
        workspaceUiStore.getServerSnapshot,
    );

    return {
        ...state,
        setSortDomaine: (sort) => saveWorkspaceUi({ sortDomaine: sort }),
        setSortProject: (sort) => saveWorkspaceUi({ sortProject: sort }),
        setSortThread: (sort) => saveWorkspaceUi({ sortThread: sort }),
        setLastActiveDomainePath: (path) => saveWorkspaceUi({ lastActiveDomainePath: path }),
        toggleExpanded: (path) => toggleWorkspaceExpanded(path),
    };
}
