/**
 * shortLinksApi — thin client for the plan-047 Dub backend proxy (/api/links).
 *
 * The backend answers 503 while DUB_API_KEY is unset (dub.co free plan —
 * ~25 links/mo with QR + API per the plan-047 addendum), so callers key a
 * "needs setup" UI on the typed result. Same authFetch shape as esignApi.ts;
 * the Dub key never reaches the browser. QR PNGs come straight from Dub's
 * unauthenticated qr endpoint (the `qrCode` field on each link).
 */
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';

export interface ShortLink {
    id: string;
    shortLink: string;
    url: string;
    key: string;
    clicks: number;
    qrCode: string;
}

export type ShortLinksResult<T> =
    | { kind: 'ok'; data: T }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string };

/** Authenticated fetch — attaches the session token (esignApi.ts pattern). */
function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = getAuthToken();
    const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...init, headers });
}

export async function listShortLinks(): Promise<ShortLinksResult<ShortLink[]>> {
    try {
        const res = await authFetch(`${API_BASE}/api/links`);
        if (res.status === 503) return { kind: 'needs-setup' };
        if (!res.ok) return { kind: 'error', message: `Backend answered ${res.status}` };
        const body = await res.json().catch(() => null);
        return { kind: 'ok', data: Array.isArray(body?.data) ? body.data : [] };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

export async function createShortLink(input: { url: string; key?: string }): Promise<ShortLinksResult<ShortLink>> {
    try {
        const res = await authFetch(`${API_BASE}/api/links`, {
            method: 'POST',
            body: JSON.stringify(input),
        });
        if (res.status === 503) return { kind: 'needs-setup' };
        const body = await res.json().catch(() => null);
        if (!res.ok) return { kind: 'error', message: body?.error || `Backend answered ${res.status}` };
        return { kind: 'ok', data: body?.data ?? null };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}
