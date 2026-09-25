/**
 * twImportedStore — per-user record of Supabase `thought_weaver_captures` row
 * ids that have already been imported into the local ThoughtWeaver store.
 *
 * Bug (verified, Ilya 2026-09-25): the widget used to pull Supabase rows on
 * every load and display them as non-local (no delete button); deleting the
 * local copy never touched Supabase, so a deleted capture reappeared on next
 * load — undeletable. Fix: import each Supabase row into the local store
 * ONCE, then remember its id here so it is never re-imported, even after the
 * user deletes their local copy. This set is One-Save-synced (via `withSync`)
 * so "deleted stays deleted" holds across devices, not just this browser.
 *
 * Same dynamic-key pattern as `thoughtWeaverStore.ts` (sister store):
 * Storage key shape:   thought-weaver:imported:<userId>
 * Fallback for anon:   thought-weaver:imported:_anonymous
 */

import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

/** id -> ISO timestamp the row was imported. */
export type TwImported = Record<string, string>;

/** Holder updated by the ThoughtWeaver render path BEFORE useSyncExternalStore reads. */
export const twImportedUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = twImportedUserIdHolder.current;
    return uid ? `thought-weaver:imported:${uid}` : 'thought-weaver:imported:_anonymous';
}

function deserialize(raw: string | null): TwImported {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const out: TwImported = {};
        for (const [id, importedAt] of Object.entries(parsed)) {
            if (typeof id === 'string' && typeof importedAt === 'string') out[id] = importedAt;
        }
        return out;
    } catch {
        return {};
    }
}

export const twImportedStore = withSync(
    createLocalStorageStore<TwImported>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: {},
    }),
    { objectType: 'thought-weaver-imported', holder: twImportedUserIdHolder, resolveKey },
);

/** Union `ids` into the imported set, stamped with `now`. No-op if nothing new. */
export function markImported(ids: string[], now: string = new Date().toISOString()): void {
    if (typeof window === 'undefined') return;
    if (ids.length === 0) return;
    const current = twImportedStore.getSnapshot();
    let changed = false;
    const next: TwImported = { ...current };
    for (const id of ids) {
        if (Object.prototype.hasOwnProperty.call(next, id)) continue;
        next[id] = now;
        changed = true;
    }
    if (!changed) return;
    twImportedStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}
