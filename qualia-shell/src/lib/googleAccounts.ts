/**
 * googleAccounts — frontend client for MULTI-ACCOUNT Gmail + Calendar.
 *
 * OAuth tokens never touch the browser: the backend owns the connect/callback
 * flow and stores per-account tokens, then makes the Google API calls. This
 * client only:
 *   • lists connected accounts          GET    /api/google/accounts
 *   • starts an OAuth connect            POST   /api/google/auth/start  → { url }
 *   • disconnects an account             DELETE /api/google/accounts/:id
 *   • toggles an account on/off          PATCH  /api/google/accounts/:id
 *
 * Every call degrades gracefully: if the backend multi-account routes aren't
 * present yet (patch not applied / backend down), `available` is false and the
 * Settings UI shows a "apply the backend patch" note instead of breaking.
 */
import { API_BASE } from '../config';
import { getAuthToken } from '../context/UserContext';
import type { GoogleAccount } from '../types/integrations';

const TIMEOUT_MS = 5000;

function headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Qualia-API': 'v2' };
    try {
        const t = getAuthToken();
        if (t) h['Authorization'] = `Bearer ${t}`;
    } catch { /* SSR / no token */ }
    return h;
}

async function envelope(res: Response): Promise<unknown> {
    const json = (await res.json()) as unknown;
    if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
        return (json as Record<string, unknown>).data;
    }
    return json;
}

function normalizeAccount(a: unknown): GoogleAccount {
    const o = (a ?? {}) as Record<string, unknown>;
    const scopes = Array.isArray(o.scopes)
        ? (o.scopes.filter(s => s === 'gmail' || s === 'calendar') as Array<'gmail' | 'calendar'>)
        : [];
    return {
        id: String(o.id ?? o.email ?? ''),
        email: String(o.email ?? ''),
        scopes,
        connectedAt: typeof o.connectedAt === 'number' ? o.connectedAt : undefined,
        enabled: o.enabled !== false,
    };
}

export interface GoogleAccountsResult {
    accounts: GoogleAccount[];
    /** false when the backend multi-account route isn't available. */
    available: boolean;
    error?: string;
}

export async function listGoogleAccounts(): Promise<GoogleAccountsResult> {
    if (typeof window === 'undefined') return { accounts: [], available: false };
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch(`${API_BASE}/api/google/accounts`, { headers: headers(), signal: ctrl.signal });
        clearTimeout(timer);
        if (res.status === 404) return { accounts: [], available: false, error: 'Backend multi-account route not found — apply the backend patch.' };
        if (!res.ok) return { accounts: [], available: false, error: `Backend returned ${res.status}` };
        const data = await envelope(res);
        const arr = Array.isArray(data)
            ? data
            : Array.isArray((data as Record<string, unknown>)?.accounts)
                ? ((data as Record<string, unknown>).accounts as unknown[])
                : [];
        return { accounts: arr.map(normalizeAccount), available: true };
    } catch (e) {
        return { accounts: [], available: false, error: e instanceof Error ? e.message : 'Network error' };
    }
}

export interface StartAuthResult {
    url?: string;
    available: boolean;
    error?: string;
}

/**
 * Start an OAuth connect for the given scopes. Returns the Google consent URL
 * (the backend builds it with a signed `state` so no token rides in the URL);
 * the caller opens it in a popup. The backend callback stores the token and the
 * caller re-lists accounts.
 */
export async function startGoogleAuth(scopes: Array<'gmail' | 'calendar'>): Promise<StartAuthResult> {
    try {
        const res = await fetch(`${API_BASE}/api/google/auth/start`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ scopes }),
        });
        if (res.status === 404) return { available: false, error: 'Backend multi-account route not found — apply the backend patch.' };
        if (!res.ok) return { available: false, error: `Backend returned ${res.status}` };
        const data = await envelope(res);
        const url = typeof (data as Record<string, unknown>)?.url === 'string' ? (data as Record<string, unknown>).url as string : undefined;
        return url ? { url, available: true } : { available: false, error: 'No auth URL returned by backend' };
    } catch (e) {
        return { available: false, error: e instanceof Error ? e.message : 'Network error' };
    }
}

export async function disconnectGoogleAccount(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const res = await fetch(`${API_BASE}/api/google/accounts/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: headers(),
        });
        if (!res.ok) return { ok: false, error: `Backend returned ${res.status}` };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    }
}

export async function setGoogleAccountEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    try {
        const res = await fetch(`${API_BASE}/api/google/accounts/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ enabled }),
        });
        if (!res.ok) return { ok: false, error: `Backend returned ${res.status}` };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    }
}

/** Open the OAuth consent URL in a centered popup; resolves when the popup closes. */
export function openAuthPopup(url: string): Promise<void> {
    return new Promise(resolve => {
        const w = 520, h = 640;
        const left = Math.max(0, (window.screen.width - w) / 2);
        const top = Math.max(0, (window.screen.height - h) / 2);
        const popup = window.open(url, 'dwellium-google-oauth', `width=${w},height=${h},left=${left},top=${top}`);
        if (!popup) { resolve(); return; } // popup blocked — caller falls back to re-list on focus
        const timer = setInterval(() => {
            if (popup.closed) { clearInterval(timer); resolve(); }
        }, 600);
    });
}
