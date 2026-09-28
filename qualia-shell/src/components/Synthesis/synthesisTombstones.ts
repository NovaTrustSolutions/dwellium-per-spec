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

export function resolveTombstoneKey(): string { throw new Error('plan 070 P4 W1: not implemented'); }

/** Pure: max clearedAt, per-id max deleted time; drop entries ≤ clearedAt; cap MAX_TOMBSTONES (drop oldest). */
export function mergeTombstones(a: SynthesisTombstones, b: SynthesisTombstones): SynthesisTombstones {
    void a; void b; throw new Error('plan 070 P4 W1: not implemented');
}

/** Pure: keep items whose Date.parse(capturedAt) > clearedAt AND > deleted[id] (unparseable capturedAt → treat as 0). Order preserved. */
export function applyTombstones(items: Synthesis[], t: SynthesisTombstones): Synthesis[] {
    void items; void t; throw new Error('plan 070 P4 W1: not implemented');
}

/** Synced store (withSync, objectType 'synthesis-tombstones', holder synthesisUserIdHolder, merge = mergeTombstones). */
export declare const synthesisTombstoneStore: import('../../lib/oneSaveStore').SyncedStore<SynthesisTombstones>;

/** Record a user delete / clear-all (now = Date.now()). Persists + syncs. */
export function recordDelete(id: string, now?: number): void { void id; void now; throw new Error('plan 070 P4 W1: not implemented'); }
export function recordClear(now?: number): void { void now; throw new Error('plan 070 P4 W1: not implemented'); }
