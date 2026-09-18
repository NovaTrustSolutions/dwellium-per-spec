/**
 * backendStatusStore — GLOBAL, app-wide backend connectivity state.
 *
 * Requirement (Ilya, 2026-06): a backend failure must NEVER log the user out.
 * Instead the app shows a message + a "Do you want to connect?" prompt. This
 * store is the single source of truth for that global banner. Fetch layers
 * (auth validation, data loads) report outcomes here; <BackendConnectionBanner>
 * subscribes via useSyncExternalStore and renders the prompt when offline.
 *
 * SSR-safe: getServerSnapshot returns a stable "online" state so the server
 * never renders the offline banner (no hydration mismatch).
 */
import { API_BASE } from '../config';
import { isBackendDownError, BACKEND_DOWN_MESSAGE, friendlyLoadError } from './backendStatus';

export type BackendConnState = 'online' | 'offline' | 'checking' | 'rate-limited';

export interface BackendStatusSnapshot {
    state: BackendConnState;
    message: string | null;
    lastCheckedAt: number | null;
    /** Epoch ms when the rate limit's Retry-After window opens (only set while 'rate-limited'). */
    retryAt: number | null;
}

const ONLINE: BackendStatusSnapshot = { state: 'online', message: null, lastCheckedAt: null, retryAt: null };

let current: BackendStatusSnapshot = ONLINE;
// The state to restore to once the rate limit's window opens (whatever the
// store was showing right before markRateLimited fired).
let preRateLimitState: BackendStatusSnapshot = ONLINE;
let rateLimitTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function clearRateLimitTimer(): void {
    if (rateLimitTimer) { clearTimeout(rateLimitTimer); rateLimitTimer = null; }
}

function emit() {
    listeners.forEach((l) => l());
}

function authHeader(): Record<string, string> {
    try {
        const t = localStorage.getItem('dwellium-auth-token');
        return t ? { Authorization: `Bearer ${t}` } : {};
    } catch {
        return {};
    }
}

/**
 * Automatic-reconnect backoff (ms). The app reconnects ON ITS OWN — the user
 * should never have to click "Connect" (Ilya, 2026-06). First attempt is
 * immediate; it then backs off and, once the schedule is exhausted, keeps
 * retrying at the final interval until the backend answers. The manual button
 * stays as an instant-retry fallback.
 */
export const AUTO_CONNECT_DELAYS_MS = [0, 2000, 5000, 10000, 20000] as const;

/** Shared "N s left" countdown text (banner + SyncStatusPill both use it). */
export function rateLimitCountdownText(retryAt: number): string {
    const secondsLeft = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    return `Too many requests — retrying in ${secondsLeft}s`;
}
/** Delay before auto-attempt N (0-based); null once the schedule is exhausted. */
export function autoConnectDelay(attempt: number): number | null {
    return attempt >= 0 && attempt < AUTO_CONNECT_DELAYS_MS.length ? AUTO_CONNECT_DELAYS_MS[attempt] : null;
}

let autoTimer: ReturnType<typeof setTimeout> | null = null;
let autoAttempt = 0;
let autoRunning = false;

function stopAuto(): void {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    autoAttempt = 0;
    autoRunning = false;
}

/** Begin reconnecting automatically (bounded backoff, then steady retry).
 *  Idempotent — no-op when already online or a loop is already running. Only
 *  ever calls checkConnection(), so it NEVER touches auth / logs anyone out. */
function startAuto(): void {
    if (autoRunning || current.state === 'online') return;
    autoRunning = true;
    autoAttempt = 0;
    const run = async (): Promise<void> => {
        autoTimer = null;
        const reachable = await backendStatusStore.checkConnection();
        if (reachable || !autoRunning) return;   // recovered (markOnline stopped us) or cancelled
        autoAttempt = Math.min(autoAttempt + 1, AUTO_CONNECT_DELAYS_MS.length);
        const delay = autoConnectDelay(autoAttempt) ?? AUTO_CONNECT_DELAYS_MS[AUTO_CONNECT_DELAYS_MS.length - 1];
        autoTimer = setTimeout(() => { void run(); }, delay);
    };
    autoTimer = setTimeout(() => { void run(); }, autoConnectDelay(0) ?? 0);
}

export const backendStatusStore = {
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },

    getSnapshot(): BackendStatusSnapshot {
        return current;
    },

    // Server always renders "online" → banner is null on the server.
    getServerSnapshot(): BackendStatusSnapshot {
        return ONLINE;
    },

    /** Mark the backend unreachable. NEVER logs anyone out — only surfaces the banner. */
    markOffline(reason?: string | null): void {
        clearRateLimitTimer();
        const message = friendlyLoadError(reason) || BACKEND_DOWN_MESSAGE;
        current = { state: 'offline', message, lastCheckedAt: Date.now(), retryAt: null };
        emit();
    },

    /** Mark the backend reachable again — clears the banner. */
    markOnline(): void {
        stopAuto(); // reconnected (or forced online) → cancel any pending auto-retry
        clearRateLimitTimer();
        if (current.state === 'online' && current.message === null) return;
        current = { state: 'online', message: null, lastCheckedAt: Date.now(), retryAt: null };
        emit();
    },

    /**
     * Mark the shared bucket as rate-limited (plan 060 phase 2). `retryAt` is
     * an epoch-ms timestamp — when it passes, the store auto-clears back to
     * whatever state it showed right before (a single timer; re-arms on every
     * call so a fresh 429 during the pause just extends it).
     */
    markRateLimited(retryAt: number): void {
        if (current.state !== 'rate-limited') preRateLimitState = current;
        clearRateLimitTimer();
        current = { state: 'rate-limited', message: null, lastCheckedAt: Date.now(), retryAt };
        emit();
        const delay = Math.max(0, retryAt - Date.now());
        rateLimitTimer = setTimeout(() => {
            rateLimitTimer = null;
            if (current.state !== 'rate-limited') return; // already changed (e.g. markOffline)
            current = preRateLimitState;
            emit();
        }, delay);
    },

    /** The bucket answered a call successfully before `retryAt`: drop the countdown now
     *  so the banner never keeps counting while sync has already resumed. */
    clearRateLimited(): void {
        if (current.state !== 'rate-limited') return;
        clearRateLimitTimer();
        current = preRateLimitState;
        emit();
    },

    /** Inspect a thrown fetch error; flip offline ONLY if it looks like the backend is down. */
    reportError(err: unknown): void {
        if (isBackendDownError(err)) {
            this.markOffline(err instanceof Error ? err.message : String(err));
        }
    },

    /**
     * "Do you want to connect?" action. Pings the backend; ANY HTTP response
     * (even 401) means it is reachable → online. A thrown error → still offline.
     * Returns true if the backend is reachable.
     */
    async checkConnection(): Promise<boolean> {
        current = { state: 'checking', message: current.message, lastCheckedAt: current.lastCheckedAt, retryAt: null };
        emit();
        try {
            await fetch(`${API_BASE}/api/auth/me`, { method: 'GET', headers: authHeader() });
            this.markOnline();
            return true;
        } catch (e) {
            this.markOffline(e instanceof Error ? e.message : String(e));
            return false;
        }
    },

    /**
     * Auto-connect on launch / whenever offline — the user never has to click.
     * Pings immediately, then backs off (autoConnectDelay) and keeps retrying at
     * the final interval until the backend answers. Safe to call repeatedly.
     */
    startAutoConnect(): void {
        startAuto();
    },
    /** Stop any in-flight auto-reconnect loop (e.g., on banner unmount). */
    stopAutoConnect(): void {
        stopAuto();
    },

    /** Test escape-hatch — reset to the initial online state. */
    reset(): void {
        stopAuto();
        clearRateLimitTimer();
        current = ONLINE;
        preRateLimitState = ONLINE;
        emit();
    },
};
