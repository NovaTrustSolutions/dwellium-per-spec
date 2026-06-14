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

/** Master flag — the spine ships inert until this is `'true'` at build time. */
export const ONE_SAVE_ENABLED =
    (import.meta.env.VITE_ONE_SAVE as string | undefined) === 'true';

const OBJECTS_API = `${API_BASE}/api/objects`;

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
        if (!res.ok) return null;

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

    /** Upsert an object (write-through). Appends an event server-side. */
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
