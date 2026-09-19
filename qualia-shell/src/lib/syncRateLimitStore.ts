/**
 * syncRateLimitStore — surfaces a 429 from the objects API instead of letting
 * `call()`'s no-throw contract swallow it as an indistinguishable `null`.
 * Login fans a bulk list (or, on fallback, N per-store GETs) across every
 * registered One Save store; if the backend's request-rate limiter trips,
 * the UI should say so (SyncStatusPill: "Sync paused — retrying") instead of
 * silently degrading to localStorage. Mirrors `sessionHealthStore`'s shape
 * (module-level external store, no React context) but is a DISTINCT concern:
 * a 429 means the session is fine and just throttled, not dead.
 */
export interface SyncRateLimitSnapshot {
    /** True since the most recent 429; cleared on the next successful call. */
    limited: boolean;
    /** Epoch ms of the most recent 429 (null = never this session). */
    lastLimitedAt: number | null;
    /** Epoch ms when the backend's `Retry-After` window opens (null = never this session). */
    retryAt: number | null;
}
/** Default pause when a 429 arrives with no `Retry-After` header (plan 060 phase 1). */
const DEFAULT_RETRY_AFTER_SEC = 60;
const RATE_OK: SyncRateLimitSnapshot = { limited: false, lastLimitedAt: null, retryAt: null };
let rateState: SyncRateLimitSnapshot = RATE_OK;
const rateListeners = new Set<() => void>();
function emitRate(): void {
    rateListeners.forEach((cb) => cb());
}
export const syncRateLimitStore = {
    subscribe(cb: () => void): () => void {
        rateListeners.add(cb);
        return () => { rateListeners.delete(cb); };
    },
    getSnapshot(): SyncRateLimitSnapshot { return rateState; },
    getServerSnapshot(): SyncRateLimitSnapshot { return RATE_OK; },
    /** Test escape hatch (repo convention: reset in beforeEach). */
    reset(): void { rateState = RATE_OK; },
};

/**
 * Called by oneSaveClient on a 429. `retryAfterSec` is the backend's
 * `Retry-After` header value (seconds); defaults to 60s when absent.
 */
export function markRateLimited(retryAfterSec?: number): void {
    const sec = retryAfterSec ?? DEFAULT_RETRY_AFTER_SEC;
    rateState = { limited: true, lastLimitedAt: Date.now(), retryAt: Date.now() + sec * 1000 };
    emitRate();
}

/** Called by oneSaveClient on the next successful call. */
export function clearRateLimited(): void {
    if (rateState.limited) { rateState = RATE_OK; emitRate(); }
}
