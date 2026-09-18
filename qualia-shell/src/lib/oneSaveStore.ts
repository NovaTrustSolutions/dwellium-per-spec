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
import { oneSaveClient, ONE_SAVE_ENABLED, type DwelliumObject } from './oneSaveClient';
import { syncRateLimitStore } from './syncRateLimitStore';
import { backendStatusStore } from './backendStatusStore';

/**
 * Ceiling asserted by `src/test/oneSaveLoginRequests.test.ts` for a fresh
 * login across every registered store: 1 bulk `listAll` + a small constant
 * slack for stores that still need their own PUT (first-ever login, nothing
 * durable yet — migrate() backfills each). Was ~100-150 requests/login
 * (N stores × hydrate GET + migrate's redundant re-GET), which tripped the
 * backend's 300/min limiter. dod/login-requests memory key targets this.
 */
export const MAX_LOGIN_REQUESTS = 15;

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
    /**
     * Pull the durable backend value (if present) into the local cache.
     * `prefetched` lets bootstrap's bulk `listAll` hand this store its object
     * directly (no per-store GET); omit it to fetch individually as before.
     * `null` means "bulk fetch ran and confirmed this object doesn't exist"
     * (also skips the GET); `undefined` (the default) means "fetch it yourself".
     */
    hydrate(prefetched?: DwelliumObject<unknown> | null): Promise<void>;
    /** Backfill a local-only value to the backend if none exists there yet. */
    migrate(): Promise<void>;
}

interface RegistryEntry {
    /** Point this store's owner at `userId` (sets a holder, or no-op for static). */
    setOwner: (userId: string | null) => void;
    /** This store's current `${objectType}_${ownerId}` — lets bootstrap match a bulk-listed object to its store. */
    objectId: () => string;
    hydrate: (prefetched?: DwelliumObject<unknown> | null) => Promise<void>;
    migrate: () => Promise<void>;
}

const registry: RegistryEntry[] = [];
let currentUserId: string | null = null;

/* ---------- sync status (plan 046 S1d) ----------
 * Counter lives where the timer lives: every scheduled write-through is
 * `pending` until it persists or is dropped; exhausted retries park a replay
 * closure in `failed` and re-run when the backend comes back online.
 * SSR-safe: no browser globals. */
export interface SyncStatusSnapshot {
    /** Write-throughs scheduled or in flight. */
    pending: number;
    /** Epoch ms of the last successful durable write this session. */
    lastSavedAt: number | null;
}

const SYNC_SERVER: SyncStatusSnapshot = { pending: 0, lastSavedAt: null };
const pending = new Set<string>();
const failed = new Map<string, () => void>();
let lastSavedAt: number | null = null;
let syncSnap: SyncStatusSnapshot = SYNC_SERVER;
const syncListeners = new Set<() => void>();

function emitSync(): void {
    syncSnap = { pending: pending.size, lastSavedAt };
    syncListeners.forEach((l) => l());
}

export const syncStatusStore = {
    subscribe(listener: () => void): () => void {
        syncListeners.add(listener);
        return () => { syncListeners.delete(listener); };
    },
    getSnapshot(): SyncStatusSnapshot {
        return syncSnap;
    },
    getServerSnapshot(): SyncStatusSnapshot {
        return SYNC_SERVER;
    },
    /** Standing convention: test escape hatch. */
    reset(): void {
        pending.clear();
        failed.clear();
        lastSavedAt = null;
        flushQueue.clear();
        batchUnsupported = false;
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        emitSync();
    },
};

/* ---------- module-level flush queue (plan 060 phase 4) ----------
 * Every synced store's `scheduleWriteThrough` used to arm its OWN debounce
 * timer and PUT its own object. A page load with N stores setting within the
 * same debounce window fired N separate PUTs. Instead: every schedule enqueues
 * `{objectType, ownerId, payload}` here (last write wins per id, via Map.set)
 * and arms ONE shared timer; the flush tries `oneSaveClient.putBatch` once for
 * every queued id, falling back to per-id `put()` the first time a backend
 * answers 404 ("unsupported" — see oneSaveClient.putBatch doc). The 3-attempt
 * backoff + "never retry a 429" rule (059/060 phase 1) now apply to the WHOLE
 * flush, not per id. */
interface FlushEntry {
    objectType: string;
    scheduledOwnerId: string;
    payload: unknown;
    /** Live owner getter — re-checked at flush time (account-switch guard). */
    ownerId: () => string;
    onSaved: () => void;
    onFailed: () => void;
}

const flushQueue = new Map<string, FlushEntry>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
// Remembered for the session once a putBatch call reports 404 ("unsupported"):
// an old backend without the batch route. Reset by syncStatusStore.reset() (tests only).
let batchUnsupported = false;

function armFlush(delay: number): void {
    // ponytail: last-requested delay wins — every registered store shares the
    // 800 ms default. A deadline-aware timer was tried and reverted: stale
    // handles across clock swaps are worse than an occasional early flush.
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flushTimer = null; void runFlush(); }, delay);
}

/** Drop queued entries whose owner has switched since they were scheduled. */
function dropSwitchedOwners(): void {
    for (const [id, entry] of [...flushQueue.entries()]) {
        if (entry.ownerId() !== entry.scheduledOwnerId) {
            flushQueue.delete(id);
            pending.delete(id);
            emitSync();
        }
    }
}

async function runFlush(): Promise<void> {
    // Entries enqueued while a flush is awaiting the network stay in
    // flushQueue (settle() only resolves the exact entry that was sent) and
    // are picked up by the re-arm below. Overlapping flushes can re-send an
    // identical entry — an idempotent upsert, so harmless.
    try {
        await runFlushOnce();
    } finally {
        if (flushQueue.size > 0 && !flushTimer) armFlush(WRITE_THROUGH_BACKOFF_MS);
    }
}

/** Resolve `id` only if the entry we SENT is still the one queued; a newer
 *  set() for the same id during the await must stay queued for the next flush. */
function settle(sent: Map<string, FlushEntry>, id: string, ok: boolean): void {
    const cur = flushQueue.get(id);
    const was = sent.get(id);
    if (!was || cur !== was) return;
    if (ok) was.onSaved(); else was.onFailed();
    flushQueue.delete(id);
}

async function runFlushOnce(): Promise<void> {
    dropSwitchedOwners();
    if (flushQueue.size === 0) return;

    for (let attempt = 0; attempt < WRITE_THROUGH_MAX_ATTEMPTS; attempt++) {
        dropSwitchedOwners();
        if (flushQueue.size === 0) return;

        if (!batchUnsupported && typeof oneSaveClient.putBatch !== 'function') {
            // A test double (or a hypothetically older client shape) without
            // putBatch at all — same "no batch route" signal as a 404.
            batchUnsupported = true;
        }
        if (!batchUnsupported) {
            const sent = new Map(flushQueue);
            const objects = [...sent.entries()].map(([id, e]) => ({ id, type: e.objectType, ownerId: e.scheduledOwnerId, payload: e.payload }));
            const result = await oneSaveClient.putBatch(objects);
            if (result === 'unsupported') {
                batchUnsupported = true; // fall through to per-id puts below, same attempt
            } else if (result && typeof result === 'object' && Array.isArray(result.saved) && Array.isArray(result.failed)) {
                for (const id of result.saved) settle(sent, id, true);
                for (const f of result.failed) settle(sent, f.id, false);
                return; // backend answered definitively (200/207) — nothing to retry
            }
            // result === null: whole-batch failure (offline/429) — retry/backoff below
        }

        if (batchUnsupported) {
            const sent = new Map(flushQueue);
            await Promise.all([...sent.entries()].map(async ([id, e]) => {
                const saved = await oneSaveClient.put({ id, type: e.objectType, ownerId: e.scheduledOwnerId, payload: e.payload });
                if (saved) settle(sent, id, true);
            }));
            if (flushQueue.size === 0) return;
        }

        // A 429 means WE are the excess load — retrying only adds to the
        // shared bucket. Stop after this attempt (059 rule, now batch-wide).
        if (syncRateLimitStore.getSnapshot().limited) break;
        if (attempt < WRITE_THROUGH_MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, WRITE_THROUGH_BACKOFF_MS * (attempt + 1)));
        }
    }

    // Exhausted: whatever's left is a persistent failure this flush.
    if (flushQueue.size > 0) {
        const remaining = [...flushQueue.values()];
        flushQueue.clear();
        remaining.forEach((e) => e.onFailed());
        backendStatusStore.markOffline('One Save write failed');
    }
}

// Reconnect replay — makes "Offline — will retry" true. Each parked closure
// checks its original owner before re-scheduling, so a switched account never
// gets the old user's write.
// ponytail: last-value replay only; full outbox if multi-tab ordering ever matters
if (ONE_SAVE_ENABLED) {
    backendStatusStore.subscribe(() => {
        if (backendStatusStore.getSnapshot().state !== 'online' || failed.size === 0) return;
        const fns = [...failed.values()];
        failed.clear();
        fns.forEach((f) => f());
    });
}

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
    // Set by the most recent hydrate() this session; lets migrate() skip its
    // own existence-check GET when hydrate() (bulk-fed or its own GET) already
    // answered "does this object exist remotely?" — halves the request count
    // on a first-ever login (see MAX_LOGIN_REQUESTS). `null` = unknown (no
    // hydrate() ran yet this session) → migrate() falls back to its own GET.
    let lastHydrateSeen: boolean | null = null;
    // Bumped on every local set(); hydrate() compares before/after its await so a
    // remote snapshot fetched BEFORE a local edit never overwrites that edit.
    let localWriteSeq = 0;

    function scheduleWriteThrough(value: T): void {
        if (!ONE_SAVE_ENABLED) return;
        const scheduledOwnerId = ownerId();
        const scheduledObjectId = objectId();
        pending.add(scheduledObjectId);
        emitSync();
        // Plan 060 phase 1: while the backend's Retry-After window hasn't opened
        // yet, arm the SHARED flush timer for the remaining pause instead of the
        // normal debounce — writes issued during the pause just keep re-arming
        // it (armFlush), so they coalesce into one flush right when it opens.
        const { retryAt } = syncRateLimitStore.getSnapshot();
        const delay = retryAt != null && retryAt > Date.now() ? retryAt - Date.now() : debounceMs;
        // Last-write-wins per id via Map.set (a second set() before the flush
        // just replaces this entry — same coalescing as the old per-store timer).
        flushQueue.set(scheduledObjectId, {
            objectType,
            scheduledOwnerId,
            payload: value,
            ownerId,
            onSaved: () => {
                pending.delete(scheduledObjectId);
                failed.delete(scheduledObjectId);
                lastSavedAt = Date.now();
                emitSync();
            },
            onFailed: () => {
                pending.delete(scheduledObjectId);
                // Replay only while the SAME owner is still active — scheduleWriteThrough
                // re-captures ownerId() at call time, so without this guard a switched
                // account would inherit the previous user's payload.
                failed.set(scheduledObjectId, () => { if (ownerId() === scheduledOwnerId) scheduleWriteThrough(value); });
                emitSync();
            },
        });
        armFlush(delay);
    }

    const store: SyncedStore<T> = {
        subscribe: base.subscribe,
        getSnapshot: base.getSnapshot,
        getServerSnapshot: base.getServerSnapshot,
        reset: base.reset,

        set(next, persistToStorage) {
            localWriteSeq++;
            base.set(next, persistToStorage); // instant localStorage cache (unchanged)
            scheduleWriteThrough(next);        // debounced durable write-through
        },

        async hydrate(prefetched?: DwelliumObject<unknown> | null) {
            if (!ONE_SAVE_ENABLED) return;
            const seqAtStart = localWriteSeq;
            const remote = (prefetched !== undefined ? prefetched : await oneSaveClient.get<T>(objectId())) as DwelliumObject<T> | null;
            lastHydrateSeen = remote != null;
            // A local edit landed while the GET was in flight (e.g. typing in a
            // just-opened lazy widget): local is newer and is already queued for
            // write-through — applying the stale remote would eat the user's input.
            if (localWriteSeq !== seqAtStart) return;
            if (remote && remote.deletedAt == null) {
                const value = remote.payload as T;
                base.set(value, () => persistLocal(value));
            }
        },

        async migrate() {
            if (!ONE_SAVE_ENABLED) return;
            // Reuse hydrate()'s answer when we have one this session — skips a
            // second GET for the exact same object migrate() would otherwise ask about.
            const exists = lastHydrateSeen ?? (await oneSaveClient.get<T>(objectId())) != null;
            if (exists) return; // already durable — don't clobber
            const local = base.getSnapshot();
            await oneSaveClient.put({ id: objectId(), type: objectType, ownerId: ownerId(), payload: local });
        },
    };

    const entry: RegistryEntry = { setOwner, objectId, hydrate: store.hydrate, migrate: store.migrate };
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

        // One bulk GET fans out to every registered store instead of one GET
        // per store (was the login request storm: 46+ stores × hydrate GET +
        // migrate's redundant re-GET ≈ 100-150 requests, tripping the
        // backend's rate limiter). `listAll` returns `null` — NOT `[]` — when
        // the bulk call itself fails, so a real outage falls back to the old
        // safe per-store GETs instead of a false "owner has zero objects"
        // reading letting migrate() clobber existing remote data.
        let bulk: DwelliumObject[] | null;
        try {
            bulk = await oneSaveClient.listAll(userId);
        } catch {
            bulk = null; // defensive: a test double or older client shape without listAll()
        }

        // Isolate per-store failures: one store's hydrate/migrate rejecting must
        // not skip every store registered after it (allSettled also parallelizes
        // any per-store round-trips, speeding login). hydrate and migrate stay in
        // two ordered phases so no store is backfilled before all are hydrated.
        if (bulk) {
            const byId = new Map(bulk.map((obj) => [obj.id, obj] as const));
            await Promise.allSettled(registry.map((e) => e.hydrate(byId.get(e.objectId()) ?? null)));
        } else {
            await Promise.allSettled(registry.map((e) => e.hydrate()));
        }
        await Promise.allSettled(registry.map((e) => e.migrate()));
    },

    /** Test/diagnostic: how many stores are wrapped. */
    get registeredCount(): number {
        return registry.length;
    },

    /**
     * Test/diagnostic: every registered store's CURRENT `${objectType}_${ownerId}`
     * id (reflects whichever owner `setOwner`/`bootstrap` last set). Lets a test
     * build a matching bulk-`listAll` fixture without hand-enumerating every
     * store's objectType — see `src/test/oneSaveLoginRequests.test.ts`.
     */
    registeredObjectIds(): string[] {
        return registry.map((e) => e.objectId());
    },
};
