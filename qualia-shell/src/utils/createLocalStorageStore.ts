/**
 * createLocalStorageStore — Phase-8+ Task 8.9 SSR-safe external store factory.
 *
 * Factory for `useSyncExternalStore`-compatible stores that back React state
 * with `localStorage`-persisted values. Migrates the `useState(() =>
 * localStorage.getItem(K))` lazy-initializer anti-pattern (which fires during
 * render and throws `ReferenceError: localStorage is not defined` on SSR) to
 * the React 19 canonical pattern: `subscribe` + `getSnapshot` +
 * `getServerSnapshot`.
 *
 * Each store maintains an in-memory cache + a Set of listeners. Setters
 * write to localStorage AND update the cache AND notify subscribers in one
 * atomic operation. `getServerSnapshot` returns a documented default value
 * — server-rendered HTML uses this default; client hydrates with the
 * cached/localStorage value via `useSyncExternalStore`'s post-hydration
 * `getSnapshot` call.
 *
 * SSR safety: the factory function and its closures do NOT call
 * `localStorage` at module-evaluation time. localStorage is only touched
 * inside `getSnapshot()` (which `useSyncExternalStore` calls only on the
 * client) and inside the `set()` user-supplied persistence callback (which
 * only runs in event-handler / effect contexts).
 *
 * Cross-tab sync: NOT supported by this factory (matches pre-Task-8.9
 * behavior byte-for-byte — original `useState(() => localStorage.getItem)`
 * pattern also had no cross-tab sync). If cross-tab sync is needed in a
 * future task, add a `window.addEventListener('storage', notify)` subscribe
 * hook here.
 *
 * Phase-8+ Task 8.10 extension (Cowork Q2 LOCK Option β): factory accepts
 * a SECOND object signature `{ key, deserializer, defaultValue }` where
 * `key` may be either a static `string` OR a `() => string` resolver
 * function. Dynamic-key shape supports per-render-resolvable storage keys
 * (auth-context / route-param / user-input driven) — empirically required
 * by `WindowContext.tsx` `savedLayoutsKey` (`qualia_saved_layouts_${user.id}`).
 * Cache is invalidated automatically when the dynamic-key resolver returns
 * a different value vs the cached key (per `getSnapshot()` call). The
 * positional signature `(readFromStorage, serverDefault)` is preserved
 * byte-for-byte for Task 8.9 baseline callers.
 *
 * Sister-shape to:
 * - Phase-7 Task 7.10 `lazyWithReload.ts` utility (same `src/utils/` altitude)
 * - Task 8.6 Finding S `@react-router/node` install-shipping discipline
 *   (this factory is the runtime counterpart of the framework SSR primitive)
 */

export type SnapshotListener = () => void;

export interface LocalStorageStore<T> {
    /** Subscribe to in-tab change notifications. Returns unsubscribe fn. */
    subscribe(cb: SnapshotListener): () => void;
    /** Returns cached value (lazy-reads localStorage on first call). */
    getSnapshot(): T;
    /** Returns the SSR default. Never reads localStorage. */
    getServerSnapshot(): T;
    /** Updates cache + persists + notifies subscribers atomically. */
    set(next: T, persistToStorage: () => void): void;
    /**
     * Test-only escape hatch — clears the in-memory cache so the next
     * `getSnapshot()` re-reads `readFromStorage()` fresh. Use in `beforeEach`
     * to prevent cross-test pollution: the original `useState(() => localStorage.getItem)`
     * pattern read fresh per-component-mount; the store cache survives across
     * mounts by design (single source of truth in production) but interferes
     * with test isolation when localStorage is cleared between tests.
     * Listeners are NOT notified (cache reset is silent).
     *
     * Standing convention per Phase-8+ Task 8.10 Cowork Q3 LOCK (v2.72.1
     * PRE-FLIGHT discipline candidate): test files importing any
     * factory-produced store MUST call `.reset()` in `beforeEach` to prevent
     * cross-test module-cache pollution. Empirical precedent: Task 8.9
     * Step-4 strict-gate first-run vitest failure at
     * `UserContext.test.tsx` token-cache-pollution.
     */
    reset(): void;
}

/**
 * Object-signature options for dynamic-key factory invocation
 * (Phase-8+ Task 8.10 Cowork Q2 LOCK Option β).
 */
export interface CreateLocalStorageStoreOptions<T> {
    /**
     * Storage key — static string OR per-render-resolvable function.
     * When function, the resolver is called on each `getSnapshot()` and
     * `set()` invocation; cache is invalidated automatically when the
     * resolver returns a different value vs the cached key.
     */
    key: string | (() => string);
    /**
     * Parses raw `localStorage.getItem()` output (string | null) into T.
     * Wrapped in try/catch by the factory — throws fall back to
     * `defaultValue`.
     */
    deserializer: (raw: string | null) => T;
    /**
     * Value returned by `getServerSnapshot()` AND by deserialization
     * try/catch fallback. Must match any pre-hydration HTML mutation
     * (e.g., FOUC IIFE) to avoid hydration mismatch.
     */
    defaultValue: T;
}

/**
 * Create an SSR-safe localStorage-backed store (positional signature —
 * Task 8.9 baseline).
 *
 * @param readFromStorage Function called once on first `getSnapshot()`
 *   client-side. Should return the current value from localStorage with
 *   any default-coalescing logic. Wrapped in try/catch by the factory —
 *   throws fall back to `serverDefault`.
 * @param serverDefault Value returned by `getServerSnapshot()`. Must match
 *   any pre-hydration HTML mutation (e.g., FOUC IIFE) to avoid hydration
 *   mismatch.
 */
export function createLocalStorageStore<T>(
    readFromStorage: () => T,
    serverDefault: T,
): LocalStorageStore<T>;
/**
 * Create an SSR-safe localStorage-backed store (object signature —
 * Task 8.10 Option β dynamic-key extension).
 */
export function createLocalStorageStore<T>(
    options: CreateLocalStorageStoreOptions<T>,
): LocalStorageStore<T>;
export function createLocalStorageStore<T>(
    arg1: (() => T) | CreateLocalStorageStoreOptions<T>,
    arg2?: T,
): LocalStorageStore<T> {
    let readFromStorage: () => T;
    let serverDefault: T;
    let keyResolver: (() => string) | null = null;

    if (typeof arg1 === 'function') {
        // Positional signature (Task 8.9 baseline — preserved byte-for-byte)
        readFromStorage = arg1;
        serverDefault = arg2 as T;
    } else {
        // Object signature (Task 8.10 dynamic-key extension)
        const opts = arg1;
        serverDefault = opts.defaultValue;
        if (typeof opts.key === 'function') {
            keyResolver = opts.key;
            readFromStorage = () => opts.deserializer(localStorage.getItem(keyResolver!()));
        } else {
            const staticKey = opts.key;
            readFromStorage = () => opts.deserializer(localStorage.getItem(staticKey));
        }
    }

    const listeners = new Set<SnapshotListener>();
    let cached: T = serverDefault;
    let initialized = false;
    let cachedKey: string | null = null;

    return {
        subscribe(cb) {
            listeners.add(cb);
            return () => { listeners.delete(cb); };
        },
        getSnapshot() {
            // Dynamic-key: invalidate cache when resolved key changes.
            // useSyncExternalStore calls getSnapshot on every render, so a
            // key change at Provider render altitude (e.g., user.id change
            // → savedLayoutsKey change) automatically triggers re-read.
            if (keyResolver) {
                const currentKey = keyResolver();
                if (cachedKey !== currentKey) {
                    cachedKey = currentKey;
                    initialized = false;
                }
            }
            if (!initialized) {
                try {
                    cached = readFromStorage();
                } catch {
                    // private browsing / sandboxed contexts — fall back to default
                    cached = serverDefault;
                }
                initialized = true;
            }
            return cached;
        },
        getServerSnapshot() {
            return serverDefault;
        },
        set(next, persistToStorage) {
            cached = next;
            initialized = true;
            if (keyResolver) cachedKey = keyResolver();
            try { persistToStorage(); } catch { /* private browsing — accept in-memory only */ }
            listeners.forEach(cb => cb());
        },
        reset() {
            cached = serverDefault;
            initialized = false;
            cachedKey = null;
        },
    };
}
