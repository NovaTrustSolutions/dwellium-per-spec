/**
 * useDashboardData — the AstraDashboard loader hook (DASH arc, Cycle 3).
 *
 * Wraps `loadDashboardData` (Cycle 2) with the loading / error / reload
 * state the panels need, and keeps the network read inside `useEffect`
 * so it is a no-op during server render — the panels render their empty
 * state on the server and hydrate, then this effect fires on the client
 * and fills them in (Per-provider-SSR-safety taxonomy: effect-time SAFE).
 *
 * `deps` is injectable (defaults to the real `strataGet` path inside
 * `loadDashboardData`) so a test can drive the hook with a fake `get`
 * against the real clock via RTL `waitFor` — no fake timers, per the
 * `vi.useFakeTimers` + React 19 scheduler anti-pattern in repo CLAUDE.md.
 * It is read once per load and intentionally excluded from the effect
 * dependency list (an inline-object `deps` must not retrigger fetches);
 * use `reload()` to refetch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadDashboardData, type DashboardData, type DashboardDataDeps } from './dashboardData';

export interface UseDashboardData {
    data: DashboardData | null;
    loading: boolean;
    error: string | null;
    /** Refetch every section. */
    reload: () => void;
}

export function useDashboardData(deps?: DashboardDataDeps): UseDashboardData {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);

    // Keep the latest deps without making them an effect dependency.
    const depsRef = useRef(deps);
    depsRef.current = deps;

    const reload = useCallback(() => setNonce((n) => n + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        loadDashboardData(depsRef.current)
            .then((d) => {
                if (!cancelled) setData(d);
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [nonce]);

    return { data, loading, error, reload };
}
