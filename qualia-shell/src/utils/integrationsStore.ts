/**
 * integrationsStore — per-user integrations persistence.
 *
 * Uses createLocalStorageStore dynamic-key signature (Phase-8+ Task 8.10
 * Option β; sister-shape to the 14 factory-produced stores in this codebase
 * per CLAUDE.md). The storage key resolves per-render from a module-level
 * userIdHolder, so Andy and Lisa get separate namespaces:
 *   integrations:user-andy-id  → Andy's keys
 *   integrations:user-lisa-id  → Lisa's keys
 *
 * When the active user changes (login or logout), update userIdHolder.current
 * BEFORE the React render that should see the new namespace. The store
 * invalidates its cache automatically when the resolver returns a different
 * key vs the cached key.
 *
 * Safety: useSyncExternalStore pattern; SSR-safe via getServerSnapshot
 * returning emptyIntegrations(). No render-path localStorage reads.
 */

import { createLocalStorageStore } from './createLocalStorageStore';
import { emptyIntegrations, IntegrationsBundle } from '../types/integrations';

/** Holder updated by UserProvider during render BEFORE useSyncExternalStore reads. */
export const integrationsUserIdHolder: { current: string | null } = { current: null };

/** Resolve the localStorage key for the currently-active user (or null fallback). */
function resolveKey(): string {
    const uid = integrationsUserIdHolder.current;
    return uid ? `integrations:${uid}` : 'integrations:_anonymous';
}

function deserialize(raw: string | null): IntegrationsBundle {
    if (!raw) return emptyIntegrations();
    try {
        const parsed = JSON.parse(raw);
        // Defensive: ensure required top-level shape exists. If a stored bundle
        // is missing fields (older schema), merge with empty defaults.
        const empty = emptyIntegrations();
        return {
            llm: { ...empty.llm, ...(parsed.llm || {}) },
            google: { ...empty.google, ...(parsed.google || {}) },
            supabase: parsed.supabase,
            tests: { ...empty.tests, ...(parsed.tests || {}) },
        };
    } catch {
        return emptyIntegrations();
    }
}

/**
 * Per-user integrations store. Dynamic-key shape: each user has their own
 * localStorage entry; the store re-reads when integrationsUserIdHolder.current
 * changes.
 */
export const integrationsStore = createLocalStorageStore<IntegrationsBundle>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: emptyIntegrations(),
});

/** Persist an updated bundle to the active user's localStorage namespace. */
export function saveIntegrations(bundle: IntegrationsBundle): void {
    if (typeof window === 'undefined') return;
    integrationsStore.set(bundle, () => {
        try {
            localStorage.setItem(resolveKey(), JSON.stringify(bundle));
        } catch {
            // localStorage full / sandboxed — fail silently; in-memory cache still up to date.
        }
    });
}

/** Clear active user's integrations (e.g., manual reset from UI). */
export function clearIntegrations(): void {
    if (typeof window === 'undefined') return;
    integrationsStore.set(emptyIntegrations(), () => {
        try {
            localStorage.removeItem(resolveKey());
        } catch {
            /* sandboxed */
        }
    });
}
