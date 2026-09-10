/**
 * oneSaveClient — One Save persistence-spine HTTP client.
 *
 * Talks to the backend object store at `/api/objects/*` (see
 * `Docs/Dwellium_One_Save_Design.md` and `Docs/OneSave_Backend_P0.md`).
 *
 * SAFETY CONTRACT — this client can NEVER break the app:
 *  - Gated behind `VITE_ONE_SAVE`. When the flag is unset/false every method
 *    is a no-op (`get`→null, `list`→[], `put`→null, `remove`→false), so the
 *    spine ships INERT until both the flag is on AND the backend route exists.
 *  - All network failures are swallowed (return the empty/no-op value). The
 *    localStorage cache (via `createLocalStorageStore`) remains the live value;
 *    write-through is fire-and-forget and retried by the caller's debounce.
 *
 * Matches the canonical client conventions in `strataApi.backend.ts`:
 * `X-Qualia-API: v2` + `Authorization: Bearer <token>` + `{ success, data }`
 * response envelope.
 */

import { getAuthToken } from '../context/UserContext';
import { API_BASE } from '../config';
import { sessionHealthStore } from './sessionHealthStore';

/** Master flag — the spine ships inert until this is `'true'` at build time. */
export const ONE_SAVE_ENABLED =
    (import.meta.env.VITE_ONE_SAVE as string | undefined) === 'true';

const OBJECTS_API = `${API_BASE}/api/objects`;

/** Hard ceiling for a single `listAll` page — matches the backend's own MAX_LIST_LIMIT. */
const BULK_LIST_LIMIT = 500;

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
}
const RATE_OK: SyncRateLimitSnapshot = { limited: false, lastLimitedAt: null };
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

/** A persisted object — the universal unit of "One Save" storage. */
export interface DwelliumObject<T = unknown> {
    id: string;
    type: string;
    ownerId: string;
    schema: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    payload: T;
}

/** Input shape for an upsert. */
export interface DwelliumObjectInput<T = unknown> {
    id: string;
    type: string;
    ownerId: string;
    payload: T;
    schema?: number;
}

interface Envelope<T> {
    success?: boolean;
    data?: T;
    error?: string;
}

function isEnvelope<T>(v: unknown): v is Envelope<T> {
    return typeof v === 'object' && v !== null && 'data' in v;
}

/**
 * Single request primitive. Returns `null` on disabled/offline/non-OK —
 * NEVER throws into React.
 */
async function call<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    if (!ONE_SAVE_ENABLED) return null;
    try {
        const headers: Record<string, string> = { 'X-Qualia-API': 'v2' };
        const token = getAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        const res = await fetch(`${OBJECTS_API}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            // F-016: a 401/403 with a token attached is NOT "offline" — it means
            // the session credential is dead and NOTHING is being persisted
            // under the user's account. Surface it (AuthGate overlays the
            // re-sign-in modal via sessionHealthStore) instead of silently
            // degrading to localStorage-only forever.
            // static- tokens are client-side dev accounts (Architect/local):
            // the backend rejects them BY DESIGN, so they are not a "dead
            // session" — don't nag those with the re-auth modal.
            if ((res.status === 401 || res.status === 403) && token && !token.startsWith('static-')) {
                sessionHealthStore.markAuthRejected();
            }
            // The login-storm fix (bulk listAll + skip-redundant-migrate-GET)
            // cuts requests dramatically, but a 429 must still be VISIBLE
            // rather than collapsing into the same silent `null` as any other
            // failure — see syncRateLimitStore above.
            if (res.status === 429) {
                rateState = { limited: true, lastLimitedAt: Date.now() };
                emitRate();
            }
            return null;
        }
        sessionHealthStore.markAuthOk();
        if (rateState.limited) { rateState = RATE_OK; emitRate(); } // recovered

        const json: unknown = await res.json();
        if (isEnvelope<T>(json)) return json.data ?? null;
        return json as T;
    } catch {
        return null; // offline / route absent / parse error → no-op
    }
}

export const oneSaveClient = {
    /** True when the spine is active (flag on). */
    enabled: ONE_SAVE_ENABLED,

    /** Fetch one object by id, or null. */
    async get<T = unknown>(id: string): Promise<DwelliumObject<T> | null> {
        return call<DwelliumObject<T>>('GET', `/${encodeURIComponent(id)}`);
    },

    /** List objects of a type for an owner (empty array on failure). */
    async list<T = unknown>(type: string, ownerId: string): Promise<DwelliumObject<T>[]> {
        const params = `?type=${encodeURIComponent(type)}&owner=${encodeURIComponent(ownerId)}`;
        const r = await call<DwelliumObject<T>[]>('GET', params);
        return r ?? [];
    },

    /**
     * Bulk-list EVERY object (any type) for the owner in one round trip —
     * login bootstrap uses this instead of one GET per registered store
     * (46+ stores × hydrate+migrate was ~100-150 requests and tripped the
     * backend's rate limiter). `owner` rides along for self-documentation;
     * the backend derives the real owner from the authenticated session
     * regardless (`objectRoutes.ts` never reads a query-string owner).
     *
     * UNLIKE `list()` (empty array on failure), this keeps `call()`'s
     * null-on-failure DISTINCT from a real empty page: `null` means the bulk
     * call itself failed (offline/disabled/non-OK/429) so the caller MUST
     * fall back to per-store hydrate() — collapsing that to `[]` would read
     * as "this owner has zero durable objects" and let migrate() clobber
     * existing remote data with stale local values.
     */
    async listAll(ownerId: string, limit: number = BULK_LIST_LIMIT): Promise<DwelliumObject[] | null> {
        const params = `?owner=${encodeURIComponent(ownerId)}&limit=${limit}`;
        return call<DwelliumObject[]>('GET', params);
    },

    /**
     * Upsert an object (write-through). Appends an event server-side.
     *
     * SUCCESS/FAILURE CONTRACT: resolves to the persisted `DwelliumObject` on
     * success, or `null` on failure (disabled flag / offline / non-OK / parse
     * error — see `call`). `null` DISTINCTLY means "not persisted"; callers
     * (e.g. `oneSaveStore.scheduleWriteThrough`) test the result to decide
     * whether to retry. Never throws into React (the no-throw safety contract
     * above is intentional).
     */
    async put<T = unknown>(obj: DwelliumObjectInput<T>): Promise<DwelliumObject<T> | null> {
        return call<DwelliumObject<T>>('PUT', `/${encodeURIComponent(obj.id)}`, {
            type: obj.type,
            ownerId: obj.ownerId,
            schema: obj.schema ?? 1,
            payload: obj.payload,
        });
    },

    /** Soft-delete (tombstone). Returns true if the backend acknowledged. */
    async remove(id: string): Promise<boolean> {
        const r = await call<unknown>('DELETE', `/${encodeURIComponent(id)}`);
        return r !== null;
    },

    /**
     * Time-travel (assessment sweep upgrade #7): read an object's append-only
     * event history (`events/*.ndjson` server-side). Returns [] when the
     * backend `/api/objects/:id/history` route isn't present yet — honest
     * no-op, sister to the test-postgres pattern. The TimeTravel widget shows
     * a "history route not available" banner in that case.
     */
    async history<T = unknown>(id: string): Promise<ObjectVersion<T>[]> {
        const r = await call<ObjectVersion<T>[]>('GET', `/${encodeURIComponent(id)}/history`);
        return r ?? [];
    },
};

/** One append-only event for an object (a version snapshot). */
export interface ObjectVersion<T = unknown> {
    /** Monotonic version index (0 = first write). */
    version: number;
    /** ISO timestamp the version was written. */
    at: string;
    /** 'put' | 'delete' — the op that produced this version. */
    op: string;
    /** Full payload at this version (for restore + diff). */
    payload: T;
}
