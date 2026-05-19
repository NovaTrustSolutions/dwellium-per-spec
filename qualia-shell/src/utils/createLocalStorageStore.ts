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
     */
    reset(): void;
}

/**
 * Create an SSR-safe localStorage-backed store.
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
): LocalStorageStore<T> {
    const listeners = new Set<SnapshotListener>();
    let cached: T = serverDefault;
    let initialized = false;

    return {
        subscribe(cb) {
            listeners.add(cb);
            return () => { listeners.delete(cb); };
        },
        getSnapshot() {
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
            try { persistToStorage(); } catch { /* private browsing — accept in-memory only */ }
            listeners.forEach(cb => cb());
        },
        reset() {
            cached = serverDefault;
            initialized = false;
        },
    };
}
