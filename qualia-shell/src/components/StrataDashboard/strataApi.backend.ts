/**
 * Strata API — backend implementation.
 *
 * Talks to the real backend at /api/dwellium/* via vite's dev proxy
 * (or directly in prod builds). Used when VITE_USE_STATIC_API is unset
 * or false. Routing is done in strataApi.ts (the module barrel).
 *
 * Shape contract MUST stay identical to strataApi.static.ts so the
 * router in strataApi.ts can swap between them transparently.
 *
 * Phase-5 Task 5.1d (2026-04-30): backend column-add migrations
 * (`db/migrations/20260420_parity_fields.{up,down}.sql`) ship out-of-repo
 * per `Docs/Phases/Phase_5_Plan.md` L100-124 + R-4 v2.26 cross-repo
 * amendment; no consumer-side complement (SQL migrations are purely backend).
 */

import { getAuthToken } from '../../context/UserContext';

const API_BASE = '/api/dwellium';

async function request<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    let url = `${API_BASE}${path}`;
    if (params) {
        const qs = new URLSearchParams(
            Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
        ).toString();
        if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {};
    headers['X-Qualia-API'] = 'v2';
    const token = getAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    if (body) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `API error ${res.status}`);
    }

    return res.json();
}

export function strataGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    return request<T>('GET', path, undefined, params);
}

export function strataPost<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, body);
}

// Task 3.8 — multipart upload. Issues `POST <path>` with FormData body;
// no `Content-Type` header so the browser sets the multipart boundary
// automatically. Auth header still forwarded. Mirrors `request` error
// handling but keeps body untransformed.
export async function strataUpload<T>(path: string, formData: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    headers['X-Qualia-API'] = 'v2';
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `API error ${res.status}`);
    }
    return res.json();
}

export function strataPut<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, body);
}

export async function strataDelete(path: string): Promise<void> {
    await request<unknown>('DELETE', path);
}

// ── Cursor Pagination ──────────────────────────────────────

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        hasMore: boolean;
        nextCursor: string | null;
        limit: number;
    };
}

export function strataGetPaginated<T>(path: string, params?: Record<string, string>): Promise<PaginatedResponse<T>> {
    return request<PaginatedResponse<T>>('GET', path, undefined, params);
}
