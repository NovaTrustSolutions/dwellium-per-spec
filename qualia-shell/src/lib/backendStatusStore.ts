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

export type BackendConnState = 'online' | 'offline' | 'checking';

export interface BackendStatusSnapshot {
    state: BackendConnState;
    message: string | null;
    lastCheckedAt: number | null;
}

const ONLINE: BackendStatusSnapshot = { state: 'online', message: null, lastCheckedAt: null };

let current: BackendStatusSnapshot = ONLINE;
const listeners = new Set<() => void>();

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
        const message = friendlyLoadError(reason) || BACKEND_DOWN_MESSAGE;
        current = { state: 'offline', message, lastCheckedAt: Date.now() };
        emit();
    },

    /** Mark the backend reachable again — clears the banner. */
    markOnline(): void {
        if (current.state === 'online' && current.message === null) return;
        current = { state: 'online', message: null, lastCheckedAt: Date.now() };
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
        current = { state: 'checking', message: current.message, lastCheckedAt: current.lastCheckedAt };
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

    /** Test escape-hatch — reset to the initial online state. */
    reset(): void {
        current = ONLINE;
        emit();
    },
};
