/**
 * serverSpend — plan 068 Phase 3. Read-only client for the server-side AI
 * ledger and (god-only) real-bill reconciliation.
 *
 * `useServerUsage()` reads the current user's own `llm-usage-server_<uid>`
 * One Save object (written server-side by `recordServerLlmUsage`) and feeds it
 * into `llmUsageStore`'s aggregate via `setExternalDevices('server', …)` so
 * every existing consumer (AiSpend, HalocronOS, dailySynthesis, honcho,
 * budget, breakdown) sees server-side spend as part of the user's total
 * without any of them changing. `useSystemUsage`/`useBilling` are god-only
 * (unattributed "Shared / system" bucket + provider invoice reconciliation).
 *
 * Never throws, never blocks the widget: any fetch failure (404 / offline /
 * non-OK / a stale row this account can't see) resolves to `null`, same
 * contract as `oneSaveClient`.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { API_BASE } from '../config';
import { oneSaveClient } from './oneSaveClient';
import { getAuthToken } from '../context/UserContext';
import { llmUsageUserIdHolder, captureOwner } from './perUserIdentity';
import { normalize, setExternalDevices, type StoredLedgerV2 } from './llmUsageStore';

const REFRESH_MS = 5 * 60_000;

/* ─── useServerUsage: shared module-level fetch, one per mounted consumer set ─── */

let serverSnapshot: StoredLedgerV2 | null = null;
const serverListeners = new Set<() => void>();
let serverRefreshTimer: ReturnType<typeof setInterval> | null = null;
let serverMountCount = 0;

function notifyServer(): void {
    for (const l of serverListeners) l();
}

async function fetchServerUsage(): Promise<void> {
    const uid = llmUsageUserIdHolder.current;
    if (!uid) {
        serverSnapshot = null;
        setExternalDevices('server', null);
        notifyServer();
        return;
    }
    const stillOwner = captureOwner();
    const obj = await oneSaveClient.get<unknown>(`llm-usage-server_${uid}`);
    // The account may have switched (or logged out) while the request was in
    // flight — never let A's server usage render under B (or _anonymous).
    if (!stillOwner() || llmUsageUserIdHolder.current !== uid) return;
    const parsed = obj?.payload != null ? normalize(obj.payload) : null;
    serverSnapshot = parsed;
    setExternalDevices('server', parsed);
    notifyServer();
}

function subscribeServer(cb: () => void): () => void {
    serverListeners.add(cb);
    serverMountCount++;
    if (serverMountCount === 1) {
        fetchServerUsage();
        if (!serverRefreshTimer) serverRefreshTimer = setInterval(fetchServerUsage, REFRESH_MS);
    }
    return () => {
        serverListeners.delete(cb);
        serverMountCount--;
        if (serverMountCount === 0 && serverRefreshTimer) {
            clearInterval(serverRefreshTimer);
            serverRefreshTimer = null;
        }
    };
}

/** Test-only: forces the next mount to refetch rather than reuse the shared snapshot. */
export function _resetServerUsageForTests(): void {
    serverSnapshot = null;
    serverListeners.clear();
    if (serverRefreshTimer) clearInterval(serverRefreshTimer);
    serverRefreshTimer = null;
    serverMountCount = 0;
    setExternalDevices('server', null);
}

/**
 * Read-only: the signed-in user's server-side ledger, refreshed on mount and
 * every 5 minutes while at least one consumer is mounted. `null` on 404 /
 * offline / no user — never throws, never blocks the widget. Several
 * components mounting this hook share one underlying fetch + refresh timer.
 */
export function useServerUsage(): StoredLedgerV2 | null {
    return useSyncExternalStore(subscribeServer, () => serverSnapshot, () => null);
}

/* ─── useSystemUsage: god-only "Shared / system" bucket ─── */

interface Envelope<T> { success?: boolean; data?: T; error?: string }
function unwrap<T>(json: unknown): T | null {
    if (json && typeof json === 'object' && 'data' in (json as Envelope<T>)) {
        return (json as Envelope<T>).data ?? null;
    }
    return json as T;
}

async function getJson<T>(path: string): Promise<T | null> {
    try {
        const headers: Record<string, string> = { 'X-Qualia-API': 'v2' };
        const token = getAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}${path}`, { headers });
        // 403 (non-god) is a normal, expected shape here — not an error to surface.
        if (!res.ok) return null;
        const json: unknown = await res.json();
        return unwrap<T>(json);
    } catch {
        return null;
    }
}

/** God-only: the unattributed server-side "Shared / system" ledger bucket. `null` when not god, offline, or empty. */
export function useSystemUsage(isGod: boolean): StoredLedgerV2 | null {
    const [snapshot, setSnapshot] = useState<StoredLedgerV2 | null>(null);
    const stillOwnerRef = useRef(captureOwner());
    useEffect(() => {
        if (!isGod) { setSnapshot(null); return; }
        stillOwnerRef.current = captureOwner();
        let cancelled = false;
        (async () => {
            const json = await getJson<unknown>('/api/ai-spend/system');
            if (cancelled || !stillOwnerRef.current()) return;
            setSnapshot(json != null ? normalize(json) : null);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGod]);
    return snapshot;
}

/* ─── useBilling: god-only real-invoice reconciliation ─── */

export interface BillingProviderResult {
    provider: string;
    status: 'ok' | 'no-key' | 'unavailable' | 'error';
    billedUsd: number | null;
    message?: string;
}

export interface BillingResult {
    month: string;
    providers: BillingProviderResult[];
    fetchedAt: string;
}

export interface UseBillingResult {
    data: BillingResult | null;
    loading: boolean;
    error: string | null;
}

/** God-only: billed (real invoice) vs the app's own estimate for `month` ('YYYY-MM'). 403 is treated as "not god" — never an error banner. */
export function useBilling(isGod: boolean, month: string): UseBillingResult {
    const [state, setState] = useState<UseBillingResult>({ data: null, loading: false, error: null });
    useEffect(() => {
        if (!isGod || !month) { setState({ data: null, loading: false, error: null }); return; }
        const stillOwner = captureOwner();
        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));
        (async () => {
            try {
                const headers: Record<string, string> = { 'X-Qualia-API': 'v2' };
                const token = getAuthToken();
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const res = await fetch(`${API_BASE}/api/ai-spend/billing?month=${encodeURIComponent(month)}`, { headers });
                if (cancelled || !stillOwner()) return;
                if (res.status === 403) { setState({ data: null, loading: false, error: null }); return; }
                if (!res.ok) { setState({ data: null, loading: false, error: `Billing request failed (${res.status})` }); return; }
                const json: unknown = await res.json();
                const data = unwrap<BillingResult>(json);
                setState({ data, loading: false, error: data ? null : 'Billing response was empty' });
            } catch {
                if (cancelled || !stillOwner()) return;
                setState({ data: null, loading: false, error: 'Could not reach the billing service' });
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGod, month]);
    return state;
}
