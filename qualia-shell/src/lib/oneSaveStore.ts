/**
 * oneSaveStore — write-through wrappers + sync orchestrator for One Save.
 *
 * COMPOSES existing `createLocalStorageStore` stores (does NOT modify the
 * factory). Wrapping keeps localStorage as the instant, offline cache AND adds:
 *   - debounced write-through to the backend object store on every `set()`
 *   - `hydrate()` — pull the durable value back (on login / device switch)
 *   - `migrate()` — one-time backfill of a local-only value to the backend
 *
 * Two wrappers, same machinery:
 *   - `withSync`       — for per-user DYNAMIC-key stores (have a `holder` +
 *                        `resolveKey`, e.g. wikiStore, savedLayoutsStore).
 *   - `withSyncStatic` — for STATIC-key stores (no per-user holder, e.g.
 *                        themeStore). Owner comes from the logged-in user that
 *                        `oneSaveSync.bootstrap` records, so a single static
 *                        localStorage key still syncs PER-USER to the backend
 *                        ("my theme follows me" without per-user local keys).
 *
 * Holders are set by consuming components during render and widgets are
 * lazy-loaded, so a store may register AFTER login. The registry handles both
 * timings: `oneSaveSync.bootstrap(userId)` covers already-loaded stores, and a
 * store that registers later auto-catches-up if a user is already active.
 *
 * Everything is gated by `VITE_ONE_SAVE` (see `oneSaveClient.ONE_SAVE_ENABLED`):
 * with the flag off, `set()` behaves exactly as today and hydrate/migrate are
 * no-ops, so wrapping a store is inert until you opt in. SSR-safe: registration
 * touches no browser globals; hydrate/migrate are client-only + flag-gated;
 * `getServerSnapshot` is delegated unchanged (preserves SSR defaults + FOUC).
 */

import type { LocalStorageStore } from '../utils/createLocalStorageStore';
import { oneSaveClient, ONE_SAVE_ENABLED } from './oneSaveClient';
import { backendStatusStore } from './backendStatusStore';

/** Write-through retry policy: total attempts and per-attempt backoff base (ms). */
const WRITE_THROUGH_MAX_ATTEMPTS = 3;
const WRITE_THROUGH_BACKOFF_MS = 500;

export interface SyncOptions<T> {
    /** Object type bucket, e.g. 'wiki' | 'foundry' | 'saved-layouts'. */
    objectType: string;
    /** The store's existing per-user id holder (passed by reference). */
    holder: { current: string | null };
    /** The store's existing localStorage key resolver (e.g. resolveWikiKey). */
    resolveKey: () => string;
    /** Serialize value → localStorage string (default JSON.stringify). */
    serialize?: (value: T) => string;
    /** Write-through debounce; default 800ms. */
    debounceMs?: number;
}

export interface StaticSyncOptions<T> {
    /** Object type bucket, e.g. 'theme' | 'accent'. */
    objectType: string;
    /** Static localStorage key for the default flat persist. Omit when persistLocal is supplied. */
    storageKey?: string;
    /** Custom localStorage writer — e.g. merge into a composite blob. Overrides storageKey. */
    persistLocal?: (value: T) => void;
    /** Serialize value → localStorage string (default JSON.stringify). */
    serialize?: (value: T) => string;
    /** Write-through debounce; default 800ms. */
    debounceMs?: number;
}

export interface SyncedStore<T> extends LocalStorageStore<T> {
    /** Pull the durable backend value (if present) into the local cache. */
    hydrate(): Promise<void>;
    /** Backfill a local-only value to the backend if none exists there yet. */
    migrate(): Promise<void>;
}

interface RegistryEntry {
    /** Point this store's owner at `userId` (sets a holder, or no-op for static). */
    setOwner: (userId: string | null) => void;
    hydrate: () => Promise<void>;
    migrate: () => Promise<void>;
}

const registry: RegistryEntry[] = [];
let currentUserId: string | null = null;

/** Shared machinery for both wrappers. */
function makeSynced<T>(
    base: LocalStorageStore<T>,
    objectType: string,
    ownerId: () => string,
    persistLocal: (value: T) => void,
    debounceMs: number,
    setOwner: (userId: string | null) => void,
): SyncedStore<T> {
    const objectId = (): string => `${objectType}_${ownerId()}`;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function scheduleWriteThrough(value: T): void {
        if (!ONE_SAVE_ENABLED) return;
        if (timer) clearTimeout(timer);
        const scheduledOwnerId = ownerId();
        const scheduledObjectId = objectId();
        timer = setTimeout(async () => {
            timer = null;
            // Never let an account switch redirect a pending private write into
            // the next user's namespace.
            if (ownerId() !== scheduledOwnerId) return;
            // Retry on transient failure with bounded backoff. `put` resolves to
            // the saved object on success, `null` on failure (no throw); a
            // dropped write is no longer silently lost.
            for (let attempt = 0; attempt < WRITE_THROUGH_MAX_ATTEMPTS; attempt++) {
                // Guard before EVERY attempt: if the account switched during the
                // prior backoff, drop the retry — never re-issue the prior user's
                // write after a switch.
                if (ownerId() !== scheduledOwnerId) return;
                const saved = await oneSaveClient.put({
                    id: scheduledObjectId,
                    type: objectType,
                    ownerId: scheduledOwnerId,
                    payload: value,
                });
                if (saved) return; // persisted — done
                // Last attempt failed → don't sleep, fall through to surface it.
                if (attempt < WRITE_THROUGH_MAX_ATTEMPTS - 1) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, WRITE_THROUGH_BACKOFF_MS * (attempt + 1)),
                    );
                }
            }
            // All attempts failed: surface persistent failure via the global
            // banner instead of silently dropping the durable write.
            backendStatusStore.markOffline('One Save write failed');
        }, debounceMs);
    }

    const store: SyncedStore<T> = {
        subscribe: base.subscribe,
        getSnapshot: base.getSnapshot,
        getServerSnapshot: base.getServerSnapshot,
        reset: base.reset,

        set(next, persistToStorage) {
            base.set(next, persistToStorage); // instant localStorage cache (unchanged)
            scheduleWriteThrough(next);        // debounced durable write-through
        },

        async hydrate() {
            if (!ONE_SAVE_ENABLED) return;
            const remote = await oneSaveClient.get<T>(objectId());
            if (remote && remote.deletedAt == null) {
                const value = remote.payload as T;
                base.set(value, () => persistLocal(value));
            }
        },

        async migrate() {
            if (!ONE_SAVE_ENABLED) return;
            const existing = await oneSaveClient.get<T>(objectId());
            if (existing) return; // already durable — don't clobber
            const local = base.getSnapshot();
            await oneSaveClient.put({ id: objectId(), type: objectType, ownerId: ownerId(), payload: local });
        },
    };

    const entry: RegistryEntry = { setOwner, hydrate: store.hydrate, migrate: store.migrate };
    registry.push(entry);
    // Late-registered (lazy-loaded) store catches up if a user is already active.
    if (ONE_SAVE_ENABLED && currentUserId) {
        entry.setOwner(currentUserId);
        void store.hydrate().then(() => store.migrate());
    }
    return store;
}

/** Wrap a per-user dynamic-key store (holder + resolveKey). */
export function withSync<T>(base: LocalStorageStore<T>, opts: SyncOptions<T>): SyncedStore<T> {
    const serialize = opts.serialize ?? ((v: T) => JSON.stringify(v));
    const ownerId = (): string => opts.holder.current ?? '_anonymous';
    const persistLocal = (value: T): void => {
        try { localStorage.setItem(opts.resolveKey(), serialize(value)); } catch { /* sandboxed */ }
    };
    return makeSynced(base, opts.objectType, ownerId, persistLocal, opts.debounceMs ?? 800, (userId) => {
        opts.holder.current = userId;
    });
}

/** Wrap a static-key store; owner is the logged-in user (set by bootstrap). */
export function withSyncStatic<T>(base: LocalStorageStore<T>, opts: StaticSyncOptions<T>): SyncedStore<T> {
    const serialize = opts.serialize ?? ((v: T) => JSON.stringify(v));
    const ownerId = (): string => currentUserId ?? '_anonymous';
    const persistLocal = opts.persistLocal ?? ((value: T): void => {
        if (!opts.storageKey) return;
        try { localStorage.setItem(opts.storageKey, serialize(value)); } catch { /* sandboxed */ }
    });
    // No holder to set — owner is resolved from the shared currentUserId.
    return makeSynced(base, opts.objectType, ownerId, persistLocal, opts.debounceMs ?? 800, () => { /* shared owner */ });
}

export const oneSaveSync = {
    /**
     * Run on login: point every registered store's owner at `userId`, pull
     * durable values, then backfill any local-only values. No-op when the flag
     * is off or no user. Idempotent (hydrate/migrate don't clobber).
     */
    async bootstrap(userId: string | null): Promise<void> {
        currentUserId = userId;
        for (const e of registry) e.setOwner(userId);
        if (!ONE_SAVE_ENABLED || !userId) return;
        // Isolate per-store failures: one store's hydrate/migrate rejecting must
        // not skip every store registered after it (allSettled also parallelizes
        // the N round-trips, speeding login). hydrate and migrate stay in two
        // ordered phases so no store is backfilled before all are hydrated.
        await Promise.allSettled(registry.map((e) => e.hydrate()));
        await Promise.allSettled(registry.map((e) => e.migrate()));
    },

    /** Test/diagnostic: how many stores are wrapped. */
    get registeredCount(): number {
        return registry.length;
    },
};
