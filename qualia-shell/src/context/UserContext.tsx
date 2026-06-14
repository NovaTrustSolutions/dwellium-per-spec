/**
 * UserContext — Authentication state management
 *
 * Provides: user, role, token, login/logout, authFetch, isAuthenticated.
 * Persists access + refresh tokens in localStorage.
 * Auto-refreshes access token before expiry (silent background call).
 * Auto-validates on mount via GET /api/auth/me.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, useSyncExternalStore, ReactNode } from 'react';
import { API_BASE } from '../config';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { backendStatusStore } from '../lib/backendStatusStore';
import { oneSaveSync } from '../lib/oneSaveStore';
import { unlockIntegrations } from '../utils/integrationsStore';

// API_BASE imported from config
const TOKEN_KEY = 'dwellium-auth-token';
const REFRESH_TOKEN_KEY = 'dwellium-refresh-token';
const EXPIRES_AT_KEY = 'dwellium-token-expires';

// ============================================
// SSR-SAFE EXTERNAL STORE (Phase-8+ Task 8.9 PROVIDER-SSR-REMEDIATION)
// ============================================
// Migrated from useState lazy initializer at L52 (fired during render and
// threw ReferenceError on SSR) to useSyncExternalStore + getServerSnapshot
// per Cowork Verdict 3 LOCK. getServerSnapshot returns null — server renders
// auth-token=null → AuthGate renders SecurityRoute (login screen) → client
// hydrates → if real token present, useSyncExternalStore triggers re-render
// to DefaultRoute. This produces a HYDRATION FLASH for authenticated users
// at SSR-enabled altitudes (Finding EE cemented at Task 8.9 §0 for Task 8.11
// architectural decision: ClientOnly wrap of AuthGate OR Suspense boundary
// OR accept flash). At ssr: false (HEAD-post-8.9) the flash is absent
// because SPA Mode does not server-render.
// Exported for unit test access at src/test/appfolioParity/.

export const tokenStore = createLocalStorageStore<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
    null,
);

export interface DwelliumUser {
    id: string;
    email: string;
    name: string;
    role: string;
    assignedProperties: string[];
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export type PermissionsMap = Record<string, boolean>;

/** Outcome of a silent token refresh attempt. `dead` means the refresh token
 *  was definitively rejected (or absent) — the session cannot be recovered
 *  silently. `transient` means a backend/network hiccup — keep the session. */
type RefreshResult = 'refreshed' | 'dead' | 'transient';

interface UserContextValue {
    user: DwelliumUser | null;
    token: string | null;
    role: string | null;
    permissions: PermissionsMap;
    isAuthenticated: boolean;
    /** True when the backend has DEFINITIVELY rejected the session (a 401/403
     *  from /api/auth/me with no successful refresh) while a user is present.
     *  The shell stays mounted; AuthGate overlays a recoverable "sign in again"
     *  modal instead of nuking state to the login screen. */
    sessionExpired: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
    hasMinRole: (minRole: string) => boolean;
    hasPermission: (key: string) => boolean;
}

const ROLE_HIERARCHY = ['tenant', 'agent', 'maintenance', 'advisor', 'management', 'corporate', 'god'];

// Exported (2026-05-26) so hooks like useIntegrations can read the context
// directly without going through useUser() — useUser throws when called
// outside a UserProvider, which breaks tests that mount widgets without
// auth setup. Raw-context consumers degrade to null user instead.
export const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<DwelliumUser | null>(null);
    const [permissions, setPermissions] = useState<PermissionsMap>({});
    const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.getSnapshot, tokenStore.getServerSnapshot);
    const [isLoading, setIsLoading] = useState(true);
    const [sessionExpired, setSessionExpired] = useState(false);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isRefreshingRef = useRef(false);

    /* ── Token persistence helpers ────────────────────── */

    const saveTokens = useCallback((data: {
        token: string;
        expiresAt?: string;
        refreshToken?: string;
    }) => {
        tokenStore.set(data.token, () => localStorage.setItem(TOKEN_KEY, data.token));
        if (data.refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
        }
        if (data.expiresAt) {
            localStorage.setItem(EXPIRES_AT_KEY, data.expiresAt);
        }
    }, []);

    const clearTokens = useCallback(() => {
        tokenStore.set(null, () => localStorage.removeItem(TOKEN_KEY));
        setUser(null);
        setPermissions({});
        setSessionExpired(false);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(EXPIRES_AT_KEY);
        localStorage.removeItem('dwellium-user');
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
    }, []);

    /* ── Dead-session handling (recoverable) ──────────────
     * Called ONLY when the session is definitively dead (a 401/403 from the
     * authoritative /api/auth/me validator, or a rejected/absent refresh token).
     * If we have a persisted identity to preserve, keep the shell mounted and
     * flip `sessionExpired` so AuthGate overlays an in-place re-auth modal — the
     * user resumes exactly where they were after signing back in. If there's no
     * identity to preserve, fall back to a full clear (→ login screen). A
     * TRANSIENT backend failure must NEVER reach here — that path keeps the
     * session and shows the "connect?" banner instead. */
    const endDeadSession = useCallback(() => {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
        if (localStorage.getItem('dwellium-user')) {
            setSessionExpired(true);
        } else {
            clearTokens();
        }
    }, [clearTokens]);

    /* ── Role helpers ─────────────────────────────────── */

    const hasMinRole = useCallback((minRole: string): boolean => {
        if (!user) return false;
        const userLevel = ROLE_HIERARCHY.indexOf(user.role);
        const minLevel = ROLE_HIERARCHY.indexOf(minRole);
        return userLevel >= minLevel;
    }, [user]);

    const hasPermission = useCallback((key: string): boolean => {
        // God gets all bypass
        if (user?.role === 'god') return true;
        return permissions[key] === true;
    }, [permissions, user]);

    /* ── Silent refresh ───────────────────────────────── */

    const doRefresh = useCallback(async (): Promise<RefreshResult> => {
        if (isRefreshingRef.current) return 'transient';
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        // No refresh token: cannot recover silently. Reached only from the
        // /api/auth/me validator (authFetch guards on a refresh token existing),
        // where a 401/403 with no way to refresh means the session is dead.
        if (!refreshToken) return 'dead';

        isRefreshingRef.current = true;
        try {
            const res = await fetch(`${API_BASE}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });
            if (!res.ok) {
                // Distinguish a DEAD session from a TRANSIENT backend failure.
                // A rejected refresh token (401/403) means the session cannot be
                // recovered silently → 'dead' (the caller decides whether to
                // overlay the recoverable re-auth modal). A 5xx/404 is the backend
                // being unreachable or mid-deploy → 'transient': keep the session
                // and raise the "connect?" banner. Either way we must NEVER
                // clearTokens() here — that was the "click a widget → bounced to
                // the login screen" bug (one widget 401 → doRefresh → logout).
                if (res.status === 401 || res.status === 403) {
                    return 'dead';
                }
                if (res.status >= 500 || res.status === 404) {
                    backendStatusStore.markOffline(`Auth refresh failed (${res.status}).`);
                }
                return 'transient';
            }
            const data = await res.json();
            saveTokens({
                token: data.token,
                expiresAt: data.expiresAt,
                refreshToken: data.refreshToken,
            });
            if (data.user) {
                setUser(data.user);
                try { localStorage.setItem('dwellium-user', JSON.stringify(data.user)); } catch { /* ignore */ }
            }
            if (data.permissions) setPermissions(data.permissions);
            setSessionExpired(false); // a successful refresh recovers the session
            scheduleRefresh(data.expiresAt);
            return 'refreshed';
        } catch {
            // Network error — not authority to log out; treat as transient.
            return 'transient';
        } finally {
            isRefreshingRef.current = false;
        }
    }, [saveTokens]); // eslint-disable-line react-hooks/exhaustive-deps -- clearTokens intentionally NOT a dep: doRefresh must never log out

    const scheduleRefresh = useCallback((expiresAt: string) => {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
        }
        if (!expiresAt) return; // Prevent calculating NaN if expiresAt is undefined
        
        const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
        if (isNaN(msUntilExpiry)) return; // Prevent NaN calculation if Date is invalid

        // Refresh 2 minutes before expiry (or immediately if < 2 min left)
        const refreshIn = Math.max(msUntilExpiry - 2 * 60 * 1000, 5000);
        refreshTimerRef.current = setTimeout(() => {
            doRefresh();
        }, refreshIn);
    }, [doRefresh]);

    /* ── Auth fetch wrapper ───────────────────────────── */

    const authFetch = useCallback(async (url: string, opts: RequestInit = {}): Promise<Response> => {
        const currentToken = localStorage.getItem(TOKEN_KEY);
        const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
        const headers = new Headers(opts.headers);
        if (currentToken) {
            headers.set('Authorization', `Bearer ${currentToken}`);
        }
        if (!headers.has('Content-Type') && opts.body && typeof opts.body === 'string') {
            headers.set('Content-Type', 'application/json');
        }

        const response = await fetch(fullUrl, { ...opts, headers });

        // On 401/403, try one silent refresh, then retry.
        if ((response.status === 401 || response.status === 403) && localStorage.getItem(REFRESH_TOKEN_KEY)) {
            const result = await doRefresh();
            if (result === 'refreshed') {
                const newToken = localStorage.getItem(TOKEN_KEY);
                const retryHeaders = new Headers(opts.headers);
                if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`);
                if (!retryHeaders.has('Content-Type') && opts.body && typeof opts.body === 'string') {
                    retryHeaders.set('Content-Type', 'application/json');
                }
                return fetch(fullUrl, { ...opts, headers: retryHeaders });
            }
            if (result === 'dead') {
                // Refresh token definitively rejected → the session is dead.
                // Surface the recoverable re-auth modal (shell stays mounted);
                // the widget still receives its original 401 to render locally.
                endDeadSession();
            }
            // 'transient' → keep the session; the widget handles its own error.
        }

        return response;
    }, [doRefresh, endDeadSession]);

    /* ── Authoritative session validation ─────────────────
     * Hits /api/auth/me (the single source of truth for "is this session still
     * valid"). Used on mount, and on window focus / regaining connectivity. Safe
     * to call repeatedly. Policy:
     *   • 401/403  → one silent refresh; if that fails, the session is dead.
     *   • 5xx/network → transient: KEEP the session, raise the "connect?" banner.
     *   • ok       → refresh the in-memory user + clear any expired flag. */
    const validateSession = useCallback(async () => {
        const tok = localStorage.getItem(TOKEN_KEY);
        if (!tok || tok.startsWith('static-')) return;
        try {
            const res = await fetch(`${API_BASE}/api/auth/me`, {
                headers: { Authorization: `Bearer ${tok}` },
            });
            if (res.status === 401 || res.status === 403) {
                backendStatusStore.markOnline(); // backend answered → it's reachable
                const result = await doRefresh();
                if (result === 'refreshed') setSessionExpired(false);
                else if (result === 'dead') endDeadSession();
                return;
            }
            if (!res.ok) {
                backendStatusStore.markOffline(`Backend returned ${res.status}.`);
                return;
            }
            const data = await res.json();
            const validatedUser: DwelliumUser = data.user ?? (data as DwelliumUser);
            setUser(validatedUser);
            setPermissions(data.permissions || {});
            setSessionExpired(false);
            try { localStorage.setItem('dwellium-user', JSON.stringify(validatedUser)); } catch { /* ignore */ }
            backendStatusStore.markOnline();
            const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);
            if (expiresAt) scheduleRefresh(expiresAt);
        } catch (err) {
            backendStatusStore.markOffline(err instanceof Error ? err.message : String(err));
        }
    }, [doRefresh, endDeadSession, scheduleRefresh]);

    /* ── Login ────────────────────────────────────────── */

    const login = useCallback(async (email: string, password: string) => {
        // Fresh logon: allow the ARA intro video to play once this session.
        try { sessionStorage.removeItem('dwellium-ara-intro-played'); } catch { /* sandboxed */ }
        try {
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: 'Login failed' }));
                return { success: false, error: data.error || 'Invalid credentials' };
            }
            const data = await res.json();
            saveTokens({
                token: data.token,
                expiresAt: data.expiresAt,
                refreshToken: data.refreshToken,
            });
            setUser(data.user);
            setPermissions(data.permissions || {});
            setSessionExpired(false); // re-auth from the expired-session modal recovers in place
            // Persist identity so it survives reloads / remounts / backend blips
            try { localStorage.setItem('dwellium-user', JSON.stringify(data.user)); } catch { /* ignore */ }

            // Schedule the first auto-refresh
            if (data.expiresAt) {
                scheduleRefresh(data.expiresAt);
            }
            return { success: true };
        } catch {
            // Static fallback: load user from exported data
            try {
                const usersRes = await fetch('/data/users.json');
                if (usersRes.ok) {
                    const users = await usersRes.json();
                    const foundUser = users.find((u: any) => u.email === email);
                    if (foundUser) {
                        const staticToken = `static-${Date.now()}-${foundUser.id}`;
                        const userData = {
                            id: foundUser.id,
                            name: foundUser.name || email.split('@')[0],
                            email: foundUser.email,
                            role: foundUser.role,
                            assignedProperties: [],
                            active: true,
                            createdAt: foundUser.created_at || new Date().toISOString(),
                            updatedAt: foundUser.updated_at || new Date().toISOString(),
                        };
                        tokenStore.set(staticToken, () => localStorage.setItem(TOKEN_KEY, staticToken));
                        setUser(userData);
                        setPermissions({});
                        setSessionExpired(false);
                        localStorage.setItem('dwellium-user', JSON.stringify(userData));
                        return { success: true };
                    }
                }
            } catch { /* ignore */ }
            return { success: false, error: 'Cannot reach server' };
        }
    }, [saveTokens, scheduleRefresh]);

    /* ── Logout ───────────────────────────────────────── */

    const logout = useCallback(() => {
        const currentToken = localStorage.getItem(TOKEN_KEY);
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (currentToken) {
            fetch(`${API_BASE}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${currentToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken }),
            }).catch(() => { });
        }
        clearTokens();
    }, [clearTokens]);

    /* ── Auto-validate stored token on mount ──────────── */

    useEffect(() => {
        // Read the token straight from localStorage — NOT the `token` render
        // variable. During the SSR-hydration window, useSyncExternalStore returns
        // getServerSnapshot (null) until after the first commit, so the render var
        // is null here even when a valid token exists. Relying on it made this
        // effect bail early and flash the LOGIN screen for a perfectly valid
        // session. localStorage always holds the real value on the client.
        let storedToken: string | null = null;
        try { storedToken = localStorage.getItem(TOKEN_KEY); } catch { /* ignore */ }
        if (!storedToken) {
            setIsLoading(false);
            return;
        }
        // Optimistically restore the persisted identity FIRST, so a reload or a
        // remount during a backend blip does NOT flash the login screen. The
        // background /api/auth/me call below refreshes it (or, on a genuine
        // 401/403, revokes it).
        let restored = false;
        try {
            const savedUser = localStorage.getItem('dwellium-user');
            if (savedUser) {
                setUser(JSON.parse(savedUser));
                restored = true;
            }
        } catch { /* ignore */ }

        // Static token — restored from localStorage only (no backend round-trip).
        if (storedToken.startsWith('static-')) {
            if (!restored) clearTokens();
            setIsLoading(false);
            return;
        }

        // Validate against the backend via the shared authoritative validator.
        // Only a DEFINITIVE 401/403 (with a failed refresh) ends the session;
        // transient failures KEEP the optimistically-restored session and raise
        // the "connect?" banner. This is what stops "clicking a widget bounces me
        // back to the login screen" on a backend hiccup. On a genuinely dead
        // session WITH a stored identity, validateSession flips `sessionExpired`
        // (recoverable modal) rather than nuking state.
        (async () => {
            await validateSession();
            setIsLoading(false);
        })();

        return () => {
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Re-validate on focus / reconnect ─────────────────
     * /api/auth/me only runs on mount, so a session that dies while the app is
     * open would otherwise go unnoticed until a manual reload (widgets silently
     * failing). Re-validate when the window regains focus or the device comes
     * back online, so a dead session promptly surfaces the recoverable modal and
     * a recovered backend clears the banner. Guarded so it never piles onto an
     * in-flight refresh. */
    useEffect(() => {
        const onWake = () => {
            if (localStorage.getItem(TOKEN_KEY) && !isRefreshingRef.current) {
                void validateSession();
            }
        };
        window.addEventListener('focus', onWake);
        window.addEventListener('online', onWake);
        return () => {
            window.removeEventListener('focus', onWake);
            window.removeEventListener('online', onWake);
        };
    }, [validateSession]);

    /* ── One Save: hydrate durable stores + backfill local-only ones on login.
     * Inert unless VITE_ONE_SAVE is on (oneSaveSync.bootstrap no-ops). ── */
    useEffect(() => {
        void oneSaveSync.bootstrap(user?.id ?? null);
        // Decrypt at-rest API keys for this user into the in-memory snapshot so
        // every consumer reads plaintext while localStorage keeps ciphertext.
        void unlockIntegrations(user?.id ?? null);
    }, [user?.id]);

    return (
        <UserContext.Provider value={{
            user,
            token,
            role: user?.role ?? null,
            permissions,
            isAuthenticated: !!user,
            sessionExpired,
            isLoading,
            login,
            logout,
            authFetch,
            hasMinRole,
            hasPermission,
        }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const ctx = useContext(UserContext);
    if (!ctx) throw new Error('useUser must be used within UserProvider');
    return ctx;
}

/**
 * Non-hook auth token accessor — for use in service files, API helpers,
 * and other non-component contexts where hooks can't be called.
 *
 * Prefer `useUser().authFetch()` inside components.
 */
export function getAuthToken(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/**
 * Non-hook auth headers builder — returns a headers object with
 * Authorization + Content-Type pre-set for JSON requests.
 *
 * Usage (in service files):
 *   const headers = getAuthHeaders();
 *   fetch(url, { headers });
 */
export function getAuthHeaders(): Record<string, string> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}
