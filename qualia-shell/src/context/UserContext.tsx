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

interface UserContextValue {
    user: DwelliumUser | null;
    token: string | null;
    role: string | null;
    permissions: PermissionsMap;
    isAuthenticated: boolean;
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
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(EXPIRES_AT_KEY);
        localStorage.removeItem('dwellium-user');
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
    }, []);

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

    const doRefresh = useCallback(async (): Promise<boolean> => {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (!refreshToken || isRefreshingRef.current) return false;

        isRefreshingRef.current = true;
        try {
            const res = await fetch(`${API_BASE}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });
            if (!res.ok) {
                // Refresh token expired or invalid — force logout
                clearTokens();
                return false;
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
            scheduleRefresh(data.expiresAt);
            return true;
        } catch {
            // Network error — don't logout, just skip this cycle
            return false;
        } finally {
            isRefreshingRef.current = false;
        }
    }, [saveTokens, clearTokens]); // eslint-disable-line react-hooks/exhaustive-deps

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

        // On 401, try refreshing the token once and retry
        if (response.status === 401 && localStorage.getItem(REFRESH_TOKEN_KEY)) {
            const refreshed = await doRefresh();
            if (refreshed) {
                const newToken = localStorage.getItem(TOKEN_KEY);
                const retryHeaders = new Headers(opts.headers);
                if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`);
                if (!retryHeaders.has('Content-Type') && opts.body && typeof opts.body === 'string') {
                    retryHeaders.set('Content-Type', 'application/json');
                }
                return fetch(fullUrl, { ...opts, headers: retryHeaders });
            }
        }

        return response;
    }, [doRefresh]);

    /* ── Login ────────────────────────────────────────── */

    const login = useCallback(async (email: string, password: string) => {
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
        if (!token) {
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
        if (token.startsWith('static-')) {
            if (!restored) clearTokens();
            setIsLoading(false);
            return;
        }

        // Validate against the backend. Only a DEFINITIVE auth rejection (401/403)
        // clears the session. Transient failures (network error, backend down, 5xx)
        // KEEP the optimistically-restored session — being unable to reach the
        // server is not proof the token is invalid (mirrors doRefresh's network
        // policy). This fixes "clicking a widget bounces me back to the login
        // screen": a single backend hiccup on remount/reload used to hard-log-out.
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.status === 401 || res.status === 403) {
                    // Backend IS reachable (it answered) — clear any offline banner.
                    backendStatusStore.markOnline();
                    const refreshed = await doRefresh();
                    if (!refreshed) clearTokens();
                    setIsLoading(false);
                    return;
                }
                if (!res.ok) {
                    // Backend reachable but erroring (5xx) — keep the session and
                    // surface the global banner; do NOT log out.
                    backendStatusStore.markOffline(`Backend returned ${res.status}.`);
                    setIsLoading(false);
                    return;
                }
                const data = await res.json();
                const validatedUser: DwelliumUser = data.user ?? (data as DwelliumUser);
                setUser(validatedUser);
                setPermissions(data.permissions || {});
                try { localStorage.setItem('dwellium-user', JSON.stringify(validatedUser)); } catch { /* ignore */ }
                backendStatusStore.markOnline();
                // Schedule refresh based on stored expiry
                const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);
                if (expiresAt) {
                    scheduleRefresh(expiresAt);
                }
                setIsLoading(false);
            } catch (err) {
                // Network error / backend unreachable — keep the existing session
                // (NEVER log out) and surface the global "connect?" banner.
                backendStatusStore.markOffline(err instanceof Error ? err.message : String(err));
                setIsLoading(false);
            }
        })();

        return () => {
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <UserContext.Provider value={{
            user,
            token,
            role: user?.role ?? null,
            permissions,
            isAuthenticated: !!user,
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
