/**
 * PermissionsContext — Per-user widget/section visibility
 *
 * Fetches permissions from backend on login.
 * Exposes `can(key)` hook: god users always get `true`.
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useUser } from './UserContext';
import { API_BASE } from '../config';

// API_BASE imported from config

export interface PermissionMap {
    [key: string]: boolean;
}

interface PermissionsContextValue {
    permissions: PermissionMap;
    loading: boolean;
    can: (key: string) => boolean;
    reload: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
    const { user, token, role, isAuthenticated } = useUser();
    const [permissions, setPermissions] = useState<PermissionMap>({});
    const [loading, setLoading] = useState(true);

    const fetchPermissions = useCallback(async () => {
        if (!isAuthenticated || !token) {
            setPermissions({});
            setLoading(false);
            return;
        }

        // God users always have all permissions — skip fetch
        if (role === 'god') {
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/auth/my-permissions`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setPermissions(data.permissions || {});
            }
        } catch (err) {
            console.warn('[Permissions] Failed to fetch:', err);
        }
        setLoading(false);
    }, [isAuthenticated, token, role]);

    useEffect(() => {
        fetchPermissions();
    }, [fetchPermissions]);

    const can = useCallback((key: string): boolean => {
        // God users always get true
        if (role === 'god') return true;
        // Not loaded yet — default allow to prevent flicker
        if (loading) return true;
        // Explicit check
        return permissions[key] !== false && permissions[key] !== undefined
            ? permissions[key]
            : false;
    }, [role, loading, permissions]);

    const reload = useCallback(async () => {
        setLoading(true);
        await fetchPermissions();
    }, [fetchPermissions]);

    return (
        <PermissionsContext.Provider value={{ permissions, loading, can, reload }}>
            {children}
        </PermissionsContext.Provider>
    );
}

export function usePermissions() {
    const ctx = useContext(PermissionsContext);
    if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
    return ctx;
}
