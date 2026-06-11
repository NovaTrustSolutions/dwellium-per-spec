/**
 * useGridLock — read + toggle the "lock grid in place" state from any component.
 *
 *   const { locked, toggle, setLocked } = useGridLock();
 *
 * SSR-safe (useSyncExternalStore + getServerSnapshot). Consumed by the sidebar
 * lock button, the Window frame (gates drag/resize/tear-off), and the Desktop
 * auto-snap effect.
 */
import { useSyncExternalStore, useCallback } from 'react';
import { gridLockStore, setGridLocked } from '../utils/gridLockStore';

export function useGridLock() {
    const locked = useSyncExternalStore(
        gridLockStore.subscribe,
        gridLockStore.getSnapshot,
        gridLockStore.getServerSnapshot,
    );

    const setLocked = useCallback((v: boolean) => setGridLocked(v), []);
    const toggle = useCallback(() => setGridLocked(!gridLockStore.getSnapshot()), []);

    return { locked, setLocked, toggle };
}
