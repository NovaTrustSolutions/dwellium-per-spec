/**
 * activeThreadStore — the globally-shared "active thread" context (spec §4.3,
 * Thread switcher). Any widget (Scribe, the agents, Brain Dump) can read this to
 * scope its work to the current Domain → Project → Thread. Persisted per-user,
 * backend-free, via the `createLocalStorageStore` dynamic-key factory.
 *
 * Storage key:  dwellium:active-thread:<userId>   (fallback :_anonymous)
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

export interface ActiveThread {
    /** Tree path of the selected node (thread/project/domain/folder). */
    path: string;
    /** Display name. */
    name: string;
    /** Tier of the selected node, for labeling. */
    tier: string;
}

export const activeThreadUserIdHolder: { current: string | null } = { current: null };

export function resolveActiveThreadKey(): string {
    const uid = activeThreadUserIdHolder.current;
    return uid ? `dwellium:active-thread:${uid}` : 'dwellium:active-thread:_anonymous';
}

function deserialize(raw: string | null): ActiveThread | null {
    if (!raw) return null;
    try {
        const o = JSON.parse(raw);
        if (o && typeof o.path === 'string' && typeof o.name === 'string') {
            return { path: o.path, name: o.name, tier: typeof o.tier === 'string' ? o.tier : 'thread' };
        }
        return null;
    } catch {
        return null;
    }
}

export const activeThreadStore = createLocalStorageStore<ActiveThread | null>({
    key: resolveActiveThreadKey,
    deserializer: deserialize,
    defaultValue: null,
});

/** Set (or clear, when null) the active thread for the current user. */
export function setActiveThread(t: ActiveThread | null): void {
    if (typeof window === 'undefined') return;
    activeThreadStore.set(t, () => {
        try {
            if (t) localStorage.setItem(resolveActiveThreadKey(), JSON.stringify(t));
            else localStorage.removeItem(resolveActiveThreadKey());
        } catch { /* sandboxed */ }
    });
}
