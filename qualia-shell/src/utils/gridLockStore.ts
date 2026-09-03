/**
 * gridLockStore — SSR-safe boolean store for the "lock grid in place" toggle.
 *
 * When locked, widget windows can't be dragged, resized, or torn off (the
 * arrangement is frozen). Unlocked = the normal free-form behavior.
 *
 * Per-USER since settings-follow-login: dynamic key `dwellium:gridLocked:<uid>`
 * (holder `gridLockUserIdHolder`, written by the perUserIdentity single writer)
 * + One Save `withSync('gridLock')` — araPrefsStore sister shape — so the lock
 * follows the account to any machine. One-time adoption: a user whose per-user
 * key is empty inherits this device's legacy global `dwellium:gridLocked` value
 * (never written or removed again), so nobody's lock resets on upgrade.
 *
 * Mirrors the established createLocalStorageStore + useSyncExternalStore
 * pattern (Phase-8+ Task 8.9). Read via the useGridLock() hook.
 */
import { createLocalStorageStore } from './createLocalStorageStore';
import { withSync } from '../lib/oneSaveStore';
import { gridLockUserIdHolder } from '../lib/perUserIdentity';

/** Legacy device-global key (pre per-user). Read once for adoption; never written or removed. */
export const GRID_LOCK_KEY = 'dwellium:gridLocked';

function resolveKey(): string {
    return `${GRID_LOCK_KEY}:${gridLockUserIdHolder.current ?? '_anonymous'}`;
}

function deserialize(raw: string | null): boolean {
    // Empty per-user key → adopt the legacy global value once (an explicit 'false' is kept as-is).
    return (raw ?? localStorage.getItem(GRID_LOCK_KEY)) === 'true';
}

export const gridLockStore = withSync(
    createLocalStorageStore<boolean>({ key: resolveKey, deserializer: deserialize, defaultValue: false }),
    { objectType: 'gridLock', holder: gridLockUserIdHolder, resolveKey },
);

/** Persist the lock state and notify subscribers. */
export function setGridLocked(locked: boolean): void {
    gridLockStore.set(locked, () => localStorage.setItem(resolveKey(), String(locked)));
}

/** Read the current lock state without subscribing (for event handlers). */
export function isGridLocked(): boolean {
    return gridLockStore.getSnapshot();
}
