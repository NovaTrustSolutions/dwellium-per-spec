/**
 * installApiAuthFetch — make every bare `fetch('/api/…')` carry the session.
 *
 * Why: dozens of widgets (InboxZero, TaskMenu, FileManager, DocViewer,
 * CommandPalette, Notepad, …) call `fetch('/api/inbox')` etc. with no
 * Authorization header. The backend now requires a session on those routes
 * (2026-08-15: /api/files, /api/inbox, /api/tasks, /api/dwellium/tenant/admin
 * were world-readable — real Gmail bodies leaked). Rather than touch every
 * caller, patch fetch once: same-origin (or API_BASE) `/api/*` requests get
 * `Authorization: Bearer <dwellium-auth-token>` when the caller didn't set one.
 *
 * ponytail: global fetch patch; per-caller authFetch migration is the upgrade
 * path if a caller ever needs the refresh-on-401 behaviour of authFetch.
 */
import { API_BASE } from '../config';
import { backendStatusStore } from './backendStatusStore';

const TOKEN_KEY = 'dwellium-auth-token';
const FLAG = '__dwelliumApiAuthFetch';
/** Default pause when a 429 arrives with no `Retry-After` header. */
const DEFAULT_RETRY_AFTER_SEC = 60;

/** Plan 060 phase 2: any `/api/*` 429 — from ANY widget, not just One Save —
 *  drives the same global banner/pill state as oneSaveClient's 429 handling. */
function reportIfRateLimited(res: Response): void {
    if (res.status !== 429) return;
    const header = res.headers?.get?.('Retry-After');
    const sec = header != null ? Number(header) : NaN;
    const retryAfterSec = Number.isFinite(sec) ? sec : DEFAULT_RETRY_AFTER_SEC;
    backendStatusStore.markRateLimited(Date.now() + retryAfterSec * 1000);
}

function isApiUrl(input: RequestInfo | URL): boolean {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let u: URL;
    try {
        u = new URL(raw, window.location.href);
    } catch {
        return false;
    }
    if (!u.pathname.startsWith('/api/')) return false;
    if (u.origin === window.location.origin) return true;
    if (API_BASE) {
        try {
            return u.origin === new URL(API_BASE, window.location.href).origin;
        } catch {
            return false;
        }
    }
    return false;
}

export function installApiAuthFetch(): void {
    if (typeof window === 'undefined' || (window as unknown as Record<string, unknown>)[FLAG]) return;
    const orig = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const api = (() => {
            try { return isApiUrl(input); } catch { return false; }
        })();
        const tag = (p: Promise<Response>): Promise<Response> =>
            api ? p.then((res) => { reportIfRateLimited(res); return res; }) : p;
        try {
            if (api) {
                const token = localStorage.getItem(TOKEN_KEY);
                // Skip local/offline pseudo-sessions — the backend can't validate them.
                if (token && !token.startsWith('static-')) {
                    const headers = new Headers(
                        init?.headers ?? (input instanceof Request ? input.headers : undefined),
                    );
                    if (!headers.has('Authorization')) {
                        headers.set('Authorization', `Bearer ${token}`);
                        return tag(orig(input, { ...init, headers }));
                    }
                }
            }
        } catch {
            /* fall through to the untouched call */
        }
        return tag(orig(input, init));
    };
    (window as unknown as Record<string, unknown>)[FLAG] = true;
}
