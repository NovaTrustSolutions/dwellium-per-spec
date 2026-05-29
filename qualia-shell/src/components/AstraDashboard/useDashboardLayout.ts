/**
 * useDashboardLayout — read + mutate the active user's AstraDashboard panel
 * layout. Updates the dynamic-key holder DURING render so useSyncExternalStore
 * resolves the per-user namespace on the same pass (mirror of useIntegrations
 * / WindowContext savedLayouts pattern).
 *
 * Cycle 4 (PM-exec dashboard arc). The mutators delegate to the pure
 * transform helpers in dashboardLayoutStore.ts and persist the result.
 */

import { useCallback, useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../../context/UserContext';
import {
    dashboardLayoutStore,
    dashboardLayoutUserIdHolder,
    saveDashboardLayout,
    resetDashboardLayout,
    hidePanelIn,
    showPanelIn,
    movePanelIn,
    type DashboardLayout,
    type MoveDirection,
} from './dashboardLayoutStore';

export function useDashboardLayout() {
    // Raw context (NOT useUser()) — useUser throws with no provider (tests,
    // anonymous routes); degrade gracefully to the _anonymous namespace.
    const userCtx = useContext(UserContext);
    const userId = userCtx?.user?.id ?? null;

    // Update holder DURING render BEFORE the store reads → factory cache
    // invalidates on key change and returns the fresh per-user layout.
    dashboardLayoutUserIdHolder.current = userId;

    const layout = useSyncExternalStore(
        dashboardLayoutStore.subscribe,
        dashboardLayoutStore.getSnapshot,
        dashboardLayoutStore.getServerSnapshot,
    );

    const hidePanel = useCallback((id: string) => {
        saveDashboardLayout(hidePanelIn(dashboardLayoutStore.getSnapshot(), id));
    }, []);

    const showPanel = useCallback((id: string) => {
        saveDashboardLayout(showPanelIn(dashboardLayoutStore.getSnapshot(), id));
    }, []);

    const movePanel = useCallback((id: string, dir: MoveDirection) => {
        saveDashboardLayout(movePanelIn(dashboardLayoutStore.getSnapshot(), id, dir));
    }, []);

    const replace = useCallback((next: DashboardLayout) => {
        saveDashboardLayout(next);
    }, []);

    const reset = useCallback(() => {
        resetDashboardLayout();
    }, []);

    return { layout, hidePanel, showPanel, movePanel, replace, reset };
}
