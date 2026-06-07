/**
 * gridLockStore — SSR-safe boolean store for the "lock grid in place" toggle.
 *
 * When locked, widget windows can't be dragged, resized, or torn off (the
 * arrangement is frozen). Unlocked = the normal free-form behavior. Global UI
 * preference (not per-user); persisted so the lock survives reload.
 *
 * Mirrors the established createLocalStorageStore + useSyncExternalStore
 * pattern (Phase-8+ Task 8.9). Read via the useGridLock() hook.
 */
import { createLocalStorageStore } from './createLocalStorageStore';

export const GRID_LOCK_KEY = 'dwellium:gridLocked';

export const gridLockStore = createLocalStorageStore<boolean>(
    () => {
        try {
            return localStorage.getItem(GRID_LOCK_KEY) === 'true';
        } catch {
            return false;
        }
    },
    false, // SSR / default: unlocked
);

/** Persist the lock state and notify subscribers. */
export function setGridLocked(locked: boolean): void {
    gridLockStore.set(locked, () => localStorage.setItem(GRID_LOCK_KEY, String(locked)));
}

/** Read the current lock state without subscribing (for event handlers). */
export function isGridLocked(): boolean {
    return gridLockStore.getSnapshot();
}
