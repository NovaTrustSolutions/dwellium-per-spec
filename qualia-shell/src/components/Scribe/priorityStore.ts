/**
 * priorityStore — per-document priority badges for Scribe (spec §5.11).
 *
 * Each user owns a `{ [filepath]: DocPriority }` map persisted in a per-user
 * localStorage namespace via the established `createLocalStorageStore`
 * dynamic-key factory (Phase-8+ Task 8.10 Option β). Backend-free, so it works
 * in the offline / Electron build and survives restarts.
 *
 * Storage key shape:  scribe:priority:<userId>   (fallback :_anonymous)
 */

import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export type DocPriority = 'none' | 'low' | 'medium' | 'high';

export const PRIORITY_ORDER: DocPriority[] = ['none', 'low', 'medium', 'high'];

export const PRIORITY_META: Record<DocPriority, { label: string; color: string }> = {
    none: { label: 'No priority', color: '#808080' },
    low: { label: 'Low', color: '#74c4ff' },
    medium: { label: 'Medium', color: '#ffce3a' },
    high: { label: 'High', color: '#ff7a93' },
};

export type PriorityMap = Record<string, DocPriority>;

/** Holder updated by the badge render path BEFORE useSyncExternalStore reads. */
export const priorityUserIdHolder: { current: string | null } = { current: null };

export function resolvePriorityKey(): string {
    const uid = priorityUserIdHolder.current;
    return uid ? `scribe:priority:${uid}` : 'scribe:priority:_anonymous';
}

function deserialize(raw: string | null): PriorityMap {
    if (!raw) return {};
    try {
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
        const out: PriorityMap = {};
        for (const [k, v] of Object.entries(o)) {
            if (v === 'low' || v === 'medium' || v === 'high') out[k] = v;
        }
        return out;
    } catch {
        return {};
    }
}

export const priorityStore = withSync(
    createLocalStorageStore<PriorityMap>({
        key: resolvePriorityKey,
        deserializer: deserialize,
        defaultValue: {},
    }),
    { objectType: 'scribe-priority', holder: priorityUserIdHolder, resolveKey: resolvePriorityKey },
);

export function getDocPriority(map: PriorityMap, filepath: string | null): DocPriority {
    if (!filepath) return 'none';
    return map[filepath] ?? 'none';
}

/** Set (or clear, when 'none') a document's priority, persist, and notify. */
export function setDocPriority(filepath: string, p: DocPriority): void {
    if (typeof window === 'undefined' || !filepath) return;
    const cur = priorityStore.getSnapshot();
    const next: PriorityMap = { ...cur };
    if (p === 'none') delete next[filepath];
    else next[filepath] = p;
    priorityStore.set(next, () => {
        try { localStorage.setItem(resolvePriorityKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}
