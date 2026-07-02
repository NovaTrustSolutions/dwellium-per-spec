/**
 * googleOAuthConnect — frontend client for the SINGLE-ACCOUNT Google (Gmail +
 * Calendar + Drive/Sheets) web OAuth connect that lights up the automation
 * engine's existing token store (credentials/oauth2-token.json).
 *
 * Task A fix (SPEC_google_and_models.md §A): the old GoogleConnectCard did a raw
 * top-level navigation — `window.open('/api/google/oauth/start')` — to a
 * PROTECTED endpoint. A top-level navigation can't carry the app's
 * `Authorization` header, so the OAuth-start guard returned
 * 401 {"error":"Authentication required"}.
 *
 * The fix is the fetch-then-redirect pattern already used by lib/googleAccounts.ts
 * (the multi-account client): make an AUTHENTICATED `fetch` to the start endpoint,
 * which returns the Google consent URL as JSON `{ url }`, then open ONLY that
 * public consent URL in a popup. The protected call stays authenticated; the
 * browser only navigates to Google's own (public) consent page.
 *
 * Every call degrades gracefully — if the backend is offline or hasn't been
 * updated to return `{ url }`, the caller surfaces an honest message instead of
 * dumping the user in a broken 401 tab.
 *
 * NOTE (backend prerequisite): the deployed backend's `/api/google/oauth/start`
 * must (a) be reachable behind the same auth the app's other /api/* calls use so
 * the Bearer token is honored, and (b) return `{ success, data: { url } }` for a
 * JSON request (it historically issued a 302 redirect, which a cross-origin
 * fetch cannot read). See Docs/Google_OAuth_Start_Backend_Patch.md.
 */
import { API_BASE } from '../config';
import { getAuthToken } from '../context/UserContext';

function headers(): Record<string, string> {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Qualia-API': 'v2',
        Accept: 'application/json',
    };
    try {
        const t = getAuthToken();
        if (t) h['Authorization'] = `Bearer ${t}`;
    } catch {
        /* SSR / no token */
    }
    return h;
}

export interface GoogleOAuthStatus {
    /** Backend has the OAuth client JSON (credentials/oauth2-credentials.json). */
    configured: boolean;
    /** A token has been stored — an account is connected. */
    connected: boolean;
    /** Human-readable setup hint when not configured. */
    blocker?: string;
}

export interface GoogleOAuthStatusResult {
    status: GoogleOAuthStatus | null;
    /** false when the backend is unreachable / erroring (UI shows "backend offline"). */
    reachable: boolean;
    error?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** Read the connect status (authenticated — matches the app's other /api/* calls). */
export async function getGoogleOAuthStatus(): Promise<GoogleOAuthStatusResult> {
    if (typeof window === 'undefined') return { status: null, reachable: false };
    try {
        const res = await fetch(`${API_BASE}/api/google/oauth/status`, { headers: headers() });
        if (!res.ok) return { status: null, reachable: false, error: `Backend returned ${res.status}` };
        const json = asRecord(await res.json().catch(() => null));
        const data = asRecord(json?.data);
        if (json?.success && data) {
            return {
                status: {
                    configured: data.configured === true,
                    connected: data.connected === true,
                    blocker: typeof data.blocker === 'string' ? data.blocker : undefined,
                },
                reachable: true,
            };
        }
        return { status: null, reachable: false, error: 'Malformed status response' };
    } catch (e) {
        return { status: null, reachable: false, error: e instanceof Error ? e.message : 'Network error' };
    }
}

export interface StartConnectResult {
    /** The Google consent URL to open (public — safe to navigate to). */
    url?: string;
    error?: string;
}

/**
 * Start the OAuth connect: authenticated fetch → `{ url }`. The caller opens the
 * returned (public) consent URL. Never does a raw navigation to the protected
 * endpoint, so the app's Bearer token is always attached.
 */
export async function startGoogleOAuthConnect(): Promise<StartConnectResult> {
    if (typeof window === 'undefined') return { error: 'unavailable' };
    try {
        // `mode=json` asks the backend to return the consent URL as JSON instead
        // of issuing a 302 (a cross-origin 302 is unreadable from fetch).
        const res = await fetch(`${API_BASE}/api/google/oauth/start?mode=json`, { headers: headers() });
        if (res.status === 401 || res.status === 403) {
            return { error: 'Not authorized to start Google connect (sign in again).' };
        }
        if (!res.ok) return { error: `Backend returned ${res.status}` };
        const json = asRecord(await res.json().catch(() => null));
        const data = asRecord(json?.data);
        const url = (typeof data?.url === 'string' && data.url)
            || (typeof json?.url === 'string' && json.url)
            || '';
        if (url) return { url };
        return { error: 'Backend did not return a consent URL (needs the /oauth/start {url} update).' };
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Network error' };
    }
}

/**
 * Open a centered blank popup synchronously (on the click gesture, so it isn't
 * popup-blocked), to be navigated to the consent URL once the authenticated
 * fetch returns. Returns null if the popup was blocked (caller falls back to a
 * same-tab navigation).
 */
export function openConsentPopup(): Window | null {
    const w = 520, h = 640;
    const left = Math.max(0, (window.screen.width - w) / 2);
    const top = Math.max(0, (window.screen.height - h) / 2);
    return window.open('', 'dwellium-google-oauth', `width=${w},height=${h},left=${left},top=${top}`);
}
