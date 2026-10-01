/**
 * synthesisTombstones — cross-device deletes for Synthesis Lab (plan 070 phase 4).
 *
 * Captures merge as a UNION across devices (synthesisStore `merge`). Deletes
 * therefore need tombstones or a stale device resurrects them. Tombstones live
 * in their OWN One Save object type ('synthesis-tombstones', NOT in the
 * backend KG_TYPES list) so they never reach the Knowledge Graph export, and
 * the captures array keeps its shape for every reader (ContentSearch, CMN
 * captureDocuments, backend KG).
 *
 * Rule: a capture survives iff its capturedAt is AFTER both `clearedAt` and
 * `deleted[id]`. So re-capturing a deleted id (new capturedAt) survives, and
 * tombstones never need to be removed. Only user clicks create tombstones.
 *
 * Storage key: dwellium:synthesis-tombstones:<userId> (fallback :_anonymous)
 * CONTRACT (plan 070 phase 4 P0) — implemented by the W1 tombstone agent.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';
import { synthesisUserIdHolder } from '../../lib/perUserIdentity';
import type { Synthesis } from './synthesisStore';

export interface SynthesisTombstones {
    v: 1;
    /** ms epoch of the last clear-all; 0 = never. */
    clearedAt: number;
    /** id → ms epoch it was deleted. */
    deleted: Record<string, number>;
}

/** Tombstones older than clearedAt are redundant; beyond this many, the oldest are dropped. */
export const MAX_TOMBSTONES = 1000;

export const EMPTY_TOMBSTONES: SynthesisTombstones = { v: 1, clearedAt: 0, deleted: {} };

export function resolveTombstoneKey(): string {
    const uid = synthesisUserIdHolder.current;
    return uid ? `dwellium:synthesis-tombstones:${uid}` : 'dwellium:synthesis-tombstones:_anonymous';
}

function isValidTime(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function deserialize(raw: string | null): SynthesisTombstones {
    if (!raw) return { ...EMPTY_TOMBSTONES, deleted: {} };
    try {
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return { ...EMPTY_TOMBSTONES, deleted: {} };
        const clearedAt = isValidTime(o.clearedAt) ? o.clearedAt : 0;
        const deleted: Record<string, number> = {};
        if (o.deleted && typeof o.deleted === 'object') {
            for (const [id, t] of Object.entries(o.deleted as Record<string, unknown>)) {
                if (isValidTime(t)) deleted[id] = t;
            }
        }
        return { v: 1, clearedAt, deleted };
    } catch {
        return { ...EMPTY_TOMBSTONES, deleted: {} };
    }
}

/** Pure: max clearedAt, per-id max deleted time; drop entries ≤ clearedAt; cap MAX_TOMBSTONES (drop oldest). */
export function mergeTombstones(a: SynthesisTombstones, b: SynthesisTombstones): SynthesisTombstones {
    const clearedAt = Math.max(a.clearedAt ?? 0, b.clearedAt ?? 0);
    const ids = new Set([...Object.keys(a.deleted), ...Object.keys(b.deleted)]);
    const deleted: Record<string, number> = {};
    for (const id of ids) {
        const t = Math.max(a.deleted[id] ?? -Infinity, b.deleted[id] ?? -Infinity);
        if (t > clearedAt) deleted[id] = t;
    }
    const entries = Object.entries(deleted);
    if (entries.length > MAX_TOMBSTONES) {
        entries.sort((x, y) => y[1] - x[1]); // newest first
        return { v: 1, clearedAt, deleted: Object.fromEntries(entries.slice(0, MAX_TOMBSTONES)) };
    }
    return { v: 1, clearedAt, deleted };
}

/** Pure: keep items whose Date.parse(capturedAt) > clearedAt AND > deleted[id] (unparseable capturedAt → treat as 0). Order preserved. */
export function applyTombstones(items: Synthesis[], t: SynthesisTombstones): Synthesis[] {
    let changed = false;
    const kept = items.filter((item) => {
        const parsed = Date.parse(item.capturedAt);
        const capturedAt = Number.isFinite(parsed) ? parsed : 0;
        const deletedAt = t.deleted[item.id];
        // Only an actual clear / delete may remove an item: with clearedAt 0 (never
        // cleared) and no tombstone, even an unparseable date (→ 0) must survive.
        const survives = (t.clearedAt === 0 || capturedAt > t.clearedAt)
            && (deletedAt === undefined || capturedAt > deletedAt);
        if (!survives) changed = true;
        return survives;
    });
    return changed ? kept : items;
}

function persist(value: SynthesisTombstones): void {
    try { localStorage.setItem(resolveTombstoneKey(), JSON.stringify(value)); } catch { /* sandboxed */ }
}

const baseStore = createLocalStorageStore<SynthesisTombstones>({
    key: resolveTombstoneKey,
    deserializer: deserialize,
    defaultValue: EMPTY_TOMBSTONES,
});

/** Synced store (withSync, objectType 'synthesis-tombstones', holder synthesisUserIdHolder, merge = mergeTombstones). */
export const synthesisTombstoneStore = withSync(baseStore, {
    objectType: 'synthesis-tombstones',
    holder: synthesisUserIdHolder,
    resolveKey: resolveTombstoneKey,
    merge: mergeTombstones,
});

function isSsr(): boolean {
    return typeof window === 'undefined' || typeof localStorage === 'undefined';
}

/** Record a user delete / clear-all (now = Date.now()). Persists + syncs. */
export function recordDelete(id: string, now: number = Date.now()): void {
    if (isSsr()) return;
    const current = synthesisTombstoneStore.getSnapshot();
    const next = mergeTombstones(current, { v: 1, clearedAt: 0, deleted: { [id]: now } });
    synthesisTombstoneStore.set(next, () => persist(next));
}

export function recordClear(now: number = Date.now()): void {
    if (isSsr()) return;
    const current = synthesisTombstoneStore.getSnapshot();
    const next = mergeTombstones(current, { v: 1, clearedAt: now, deleted: {} });
    synthesisTombstoneStore.set(next, () => persist(next));
}
