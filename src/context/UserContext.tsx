/**
 * UserContext — Authentication state management
 *
 * Provides: user, role, token, login/logout, authFetch, isAuthenticated.
 * Persists token in localStorage. Auto-validates on mount via GET /api/auth/me.
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { API_BASE } from '../config';

// API_BASE imported from config
const TOKEN_KEY = 'dwellium-auth-token';

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

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<DwelliumUser | null>(null);
    const [permissions, setPermissions] = useState<PermissionsMap>({});
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
    const [isLoading, setIsLoading] = useState(true);

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

    /* ── Auth fetch wrapper ───────────────────────────── */

    const authFetch = useCallback(async (url: string, opts: RequestInit = {}): Promise<Response> => {
        const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
        const headers = new Headers(opts.headers);
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        if (!headers.has('Content-Type') && opts.body && typeof opts.body === 'string') {
            headers.set('Content-Type', 'application/json');
        }
        return fetch(fullUrl, { ...opts, headers });
    }, [token]);

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
            setToken(data.token);
            setUser(data.user);
            setPermissions(data.permissions || {});
            localStorage.setItem(TOKEN_KEY, data.token);
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
                        setToken(staticToken);
                        setUser(userData);
                        setPermissions({});
                        localStorage.setItem(TOKEN_KEY, staticToken);
                        localStorage.setItem('dwellium-user', JSON.stringify(userData));
                        return { success: true };
                    }
                }
            } catch { /* ignore */ }
            return { success: false, error: 'Cannot reach server' };
        }
    }, []);

    /* ── Logout ───────────────────────────────────────── */

    const logout = useCallback(() => {
        if (token) {
            fetch(`${API_BASE}/api/auth/logout`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => { });
        }
        setUser(null);
        setPermissions({});
        setToken(null);
        localStorage.removeItem(TOKEN_KEY);
    }, [token]);

    /* ── Auto-validate stored token on mount ──────────── */

    useEffect(() => {
        if (!token) {
            setIsLoading(false);
            return;
        }
        // Static token — restore from localStorage
        if (token.startsWith('static-')) {
            try {
                const savedUser = localStorage.getItem('dwellium-user');
                if (savedUser) {
                    setUser(JSON.parse(savedUser));
                    setPermissions({});
                    setIsLoading(false);
                    return;
                }
            } catch { /* ignore */ }
            localStorage.removeItem(TOKEN_KEY);
            setToken(null);
            setIsLoading(false);
            return;
        }
        fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(res => {
                if (!res.ok) throw new Error('expired');
                return res.json();
            })
            .then(data => {
                if (data.user) {
                    setUser(data.user);
                    setPermissions(data.permissions || {});
                } else {
                    setUser(data as DwelliumUser);
                }
                setIsLoading(false);
            })
            .catch(() => {
                localStorage.removeItem(TOKEN_KEY);
                setToken(null);
                setIsLoading(false);
            });
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
