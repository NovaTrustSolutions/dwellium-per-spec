/**
 * Strata API — Centralized fetch wrapper for all Strata modules.
 * Talks to the backend at /api/dwellium/*.
 */

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
    const token = localStorage.getItem('dwellium-auth-token');
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

export function strataPut<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, body);
}

export async function strataDelete(path: string): Promise<void> {
    await request<unknown>('DELETE', path);
}
