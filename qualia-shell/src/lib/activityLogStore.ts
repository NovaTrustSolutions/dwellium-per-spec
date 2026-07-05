/**
 * activityLogStore — universal per-login app-usage history (plan 038).
 *
 * Owner requirement (2026-07-04, verbatim): "every single app within the app
 * should be attached and saved as history within the app, accessible via the
 * login." Two capture layers:
 *
 *   1. UNIVERSAL lifecycle — `WindowContext.tsx` calls `logActivity(component,
 *      title, 'open')` when a NEW window is created (not on dedupe-focus of an
 *      already-open one) and `logActivity(component, title, 'close')` in the
 *      close path. These two call sites cover every current AND future widget
 *      automatically — no per-widget wiring required for open/close.
 *   2. DOMAIN events — any widget may call `logActivity(widgetId, widgetLabel,
 *      action, details)` for a meaningful in-app action (a command run, a
 *      message sent, a capture made, etc). Wiring a new widget's domain event
 *      is exactly ONE `logActivity(...)` call at its action site — see the
 *      Terminal / StellaAgent / ThoughtWeaver call sites for the pattern.
 *
 * `details` MUST be a small, non-sensitive summary — NEVER secrets, API keys,
 * or full message bodies. Truncate any free text to 140 chars before passing
 * it in `details`.
 *
 * Per-user dynamic-key factory + One Save ('activity-log'), the costKpiStore /
 * agentContextStore sister shape incl. `.reset()`. Namespacing rides its own
 * independent holder (`activityUserIdHolder`), written ONLY by
 * `setPerUserIdentity()` in `perUserIdentity.ts` — see that file's header for
 * the #185 render-loop invariants this must never violate.
 *
 * Ring buffer: capped at 2,000 entries (oldest dropped first) so both the
 * localStorage payload and the One Save write-through stay bounded.
 *
 * Storage key: dwellium-activity-log:<userId> (anon → dwellium-activity-log:_anonymous)
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { activityUserIdHolder, usePerUserIdentity } from './perUserIdentity';
export { activityUserIdHolder };

export interface ActivityEntry {
    id: string;            // crypto.randomUUID()
    ts: number;             // Date.now()
    widgetId: string;       // registry key, e.g. 'scribe', 'terminal', or 'shell'
    widgetLabel: string;    // human label at time of logging
    action: string;         // 'open' | 'close' | domain verbs ('command-run', 'message-sent', 'capture')
    details?: Record<string, unknown>; // small, non-sensitive summary — NEVER secrets/full message bodies
}

/** Ring-buffer cap — oldest entries are dropped first on append. */
export const ACTIVITY_LOG_MAX_ENTRIES = 2000;

function resolveKey(): string {
    const uid = activityUserIdHolder.current;
    return uid ? `dwellium-activity-log:${uid}` : 'dwellium-activity-log:_anonymous';
}

function deserialize(raw: string | null): ActivityEntry[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((e): e is ActivityEntry =>
            e && typeof e === 'object' &&
            typeof e.id === 'string' &&
            typeof e.ts === 'number' &&
            typeof e.widgetId === 'string' &&
            typeof e.widgetLabel === 'string' &&
            typeof e.action === 'string');
    } catch {
        return [];
    }
}

export const activityLogStore = withSync(
    createLocalStorageStore<ActivityEntry[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'activity-log', holder: activityUserIdHolder, resolveKey },
);

function persist(next: ActivityEntry[]): void {
    activityLogStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/**
 * Append a new activity entry (newest-first storage order). Fire-and-forget
 * and try/catch-wrapped: a logging failure must NEVER break the app action
 * that triggered it (e.g. a throwing localStorage in private-browsing mode).
 */
export function logActivity(
    widgetId: string,
    widgetLabel: string,
    action: string,
    details?: Record<string, unknown>,
): void {
    try {
        const entry: ActivityEntry = {
            id: crypto.randomUUID(),
            ts: Date.now(),
            widgetId,
            widgetLabel,
            action,
            details,
        };
        const current = activityLogStore.getSnapshot();
        const next = [entry, ...current].slice(0, ACTIVITY_LOG_MAX_ENTRIES);
        persist(next);
    } catch {
        /* logging must never break the caller's action */
    }
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetActivityLog(): void {
    activityLogStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

export function useActivityLog(): ActivityEntry[] {
    // Single writer: sets every per-user holder to the active user.id at once.
    usePerUserIdentity();
    return useSyncExternalStore(
        activityLogStore.subscribe,
        activityLogStore.getSnapshot,
        activityLogStore.getServerSnapshot,
    );
}
