/**
 * Plan 070 phase 4 W1 — synthesisTombstones. Captures merge as a UNION across
 * devices, so deletes need tombstones or a stale device resurrects them.
 * These tests pin the merge/prune/apply rules AND include mutation-checks
 * (documented inline) that must fail if the guard logic regresses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { oneSaveClient } from '../lib/oneSaveClient';
import type { Synthesis } from '../components/Synthesis/synthesisStore';
import { synthesisUserIdHolder } from '../lib/perUserIdentity';
import {
    EMPTY_TOMBSTONES,
    MAX_TOMBSTONES,
    applyTombstones,
    mergeTombstones,
    recordClear,
    recordDelete,
    resolveTombstoneKey,
    synthesisTombstoneStore,
    type SynthesisTombstones,
} from '../components/Synthesis/synthesisTombstones';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        putBatch: vi.fn().mockResolvedValue('unsupported'),
    },
}));

function synth(id: string, capturedAt: string): Synthesis {
    return { id, query: 'q', result: 'r', layer: 1, parentId: null, capturedAt };
}

describe('resolveTombstoneKey', () => {
    beforeEach(() => { synthesisUserIdHolder.current = null; });

    it('namespaces by user id, falling back to _anonymous', () => {
        expect(resolveTombstoneKey()).toBe('dwellium:synthesis-tombstones:_anonymous');
        synthesisUserIdHolder.current = 'u-1';
        expect(resolveTombstoneKey()).toBe('dwellium:synthesis-tombstones:u-1');
    });
});

describe('deserializer tolerance', () => {
    // Exercised indirectly via localStorage + the store's key resolver.
    beforeEach(() => {
        localStorage.clear();
        synthesisTombstoneStore.reset();
        synthesisUserIdHolder.current = 'u-deser';
    });

    it('falls back to EMPTY_TOMBSTONES for missing/invalid/non-object raw', () => {
        expect(synthesisTombstoneStore.getSnapshot()).toEqual(EMPTY_TOMBSTONES);

        localStorage.setItem(resolveTombstoneKey(), 'not json');
        synthesisTombstoneStore.reset();
        expect(synthesisTombstoneStore.getSnapshot()).toEqual(EMPTY_TOMBSTONES);

        localStorage.setItem(resolveTombstoneKey(), '"a string"');
        synthesisTombstoneStore.reset();
        expect(synthesisTombstoneStore.getSnapshot()).toEqual(EMPTY_TOMBSTONES);

        localStorage.setItem(resolveTombstoneKey(), '42');
        synthesisTombstoneStore.reset();
        expect(synthesisTombstoneStore.getSnapshot()).toEqual(EMPTY_TOMBSTONES);
    });

    it('drops non-numeric/negative times but keeps valid ones, and always shapes {v,clearedAt,deleted}', () => {
        localStorage.setItem(resolveTombstoneKey(), JSON.stringify({
            v: 1,
            clearedAt: -5,
            deleted: { good: 100, bad1: 'nope', bad2: -1, bad3: null },
        }));
        synthesisTombstoneStore.reset();
        expect(synthesisTombstoneStore.getSnapshot()).toEqual({ v: 1, clearedAt: 0, deleted: { good: 100 } });
    });
});

describe('mergeTombstones', () => {
    it('is commutative: merge(a,b) deep-equals merge(b,a)', () => {
        const a: SynthesisTombstones = { v: 1, clearedAt: 10, deleted: { x: 20, y: 50 } };
        const b: SynthesisTombstones = { v: 1, clearedAt: 30, deleted: { y: 40, z: 60 } };
        expect(mergeTombstones(a, b)).toEqual(mergeTombstones(b, a));
    });

    it('takes max clearedAt and per-id max deleted time', () => {
        const a: SynthesisTombstones = { v: 1, clearedAt: 10, deleted: { x: 100 } };
        const b: SynthesisTombstones = { v: 1, clearedAt: 5, deleted: { x: 50, y: 200 } };
        expect(mergeTombstones(a, b)).toEqual({ v: 1, clearedAt: 10, deleted: { x: 100, y: 200 } });
    });

    it('prunes entries with time <= clearedAt', () => {
        const a: SynthesisTombstones = { v: 1, clearedAt: 100, deleted: { old: 50, exact: 100, keep: 150 } };
        const b: SynthesisTombstones = { v: 1, clearedAt: 0, deleted: {} };
        expect(mergeTombstones(a, b)).toEqual({ v: 1, clearedAt: 100, deleted: { keep: 150 } });
    });

    it('caps at MAX_TOMBSTONES, keeping the newest', () => {
        const deleted: Record<string, number> = {};
        for (let i = 0; i < MAX_TOMBSTONES + 5; i++) deleted[`id-${i}`] = 1000 + i;
        const a: SynthesisTombstones = { v: 1, clearedAt: 0, deleted };
        const merged = mergeTombstones(a, EMPTY_TOMBSTONES);
        const keys = Object.keys(merged.deleted);
        expect(keys.length).toBe(MAX_TOMBSTONES);
        // MUTATION-CHECK: flipping the sort direction (oldest-kept) would keep
        // id-0..id-4 instead — assert the newest survive.
        expect(merged.deleted['id-0']).toBeUndefined();
        expect(merged.deleted[`id-${MAX_TOMBSTONES + 4}`]).toBe(1000 + MAX_TOMBSTONES + 4);
    });

    it('is pure: never mutates inputs', () => {
        const a: SynthesisTombstones = { v: 1, clearedAt: 10, deleted: { x: 20 } };
        const b: SynthesisTombstones = { v: 1, clearedAt: 0, deleted: { y: 30 } };
        const aCopy = JSON.parse(JSON.stringify(a));
        const bCopy = JSON.parse(JSON.stringify(b));
        mergeTombstones(a, b);
        expect(a).toEqual(aCopy);
        expect(b).toEqual(bCopy);
    });
});

describe('applyTombstones', () => {
    it('keeps a re-captured item deleted BEFORE its capture (re-capture survives)', () => {
        const items = [synth('a', '2026-01-02T00:00:00.000Z')];
        const t: SynthesisTombstones = { v: 1, clearedAt: 0, deleted: { a: Date.parse('2026-01-01T00:00:00.000Z') } };
        expect(applyTombstones(items, t)).toBe(items); // unchanged → same reference
    });

    it('removes an item deleted AFTER its capture', () => {
        const items = [synth('a', '2026-01-01T00:00:00.000Z')];
        const t: SynthesisTombstones = { v: 1, clearedAt: 0, deleted: { a: Date.parse('2026-01-02T00:00:00.000Z') } };
        const result = applyTombstones(items, t);
        expect(result).toEqual([]);
    });

    it('clear removes older items, including ones with an unparseable capturedAt', () => {
        const items = [
            synth('a', '2026-01-01T00:00:00.000Z'),
            synth('b', 'not-a-date'),
            synth('c', '2026-06-01T00:00:00.000Z'),
        ];
        const t: SynthesisTombstones = { v: 1, clearedAt: Date.parse('2026-03-01T00:00:00.000Z'), deleted: {} };
        const result = applyTombstones(items, t);
        expect(result.map((i) => i.id)).toEqual(['c']);
    });

    it('returns the SAME array reference when nothing was removed', () => {
        const items = [synth('a', '2026-06-01T00:00:00.000Z'), synth('b', '2026-06-02T00:00:00.000Z')];
        const t: SynthesisTombstones = { v: 1, clearedAt: 0, deleted: {} };
        expect(applyTombstones(items, t)).toBe(items);
    });

    it('preserves order', () => {
        const items = [
            synth('a', '2026-06-01T00:00:00.000Z'),
            synth('b', '2026-01-01T00:00:00.000Z'), // will be dropped
            synth('c', '2026-06-03T00:00:00.000Z'),
        ];
        const t: SynthesisTombstones = { v: 1, clearedAt: Date.parse('2026-02-01T00:00:00.000Z'), deleted: {} };
        expect(applyTombstones(items, t).map((i) => i.id)).toEqual(['a', 'c']);
    });

    // MUTATION-CHECK: using `>=` instead of `>` would flip this to survive —
    // the rule is strictly AFTER clearedAt, so an exact tie is removed.
    it('an item captured exactly AT clearedAt is removed (strict >, not >=)', () => {
        const ts = Date.parse('2026-03-01T00:00:00.000Z');
        const items = [synth('a', '2026-03-01T00:00:00.000Z')];
        const t: SynthesisTombstones = { v: 1, clearedAt: ts, deleted: {} };
        expect(applyTombstones(items, t)).toEqual([]);
    });
});

describe('recordDelete / recordClear', () => {
    beforeEach(() => {
        localStorage.clear();
        synthesisTombstoneStore.reset();
        synthesisUserIdHolder.current = 'u-record';
    });

    it('recordDelete persists a tombstone under the per-user key', () => {
        recordDelete('syn-1', 500);
        expect(synthesisTombstoneStore.getSnapshot().deleted).toEqual({ 'syn-1': 500 });
        const raw = localStorage.getItem(resolveTombstoneKey());
        expect(raw && JSON.parse(raw).deleted).toEqual({ 'syn-1': 500 });
    });

    it('recordClear persists clearedAt and prunes older deletes', () => {
        recordDelete('syn-1', 100);
        recordClear(200);
        const snap = synthesisTombstoneStore.getSnapshot();
        expect(snap.clearedAt).toBe(200);
        expect(snap.deleted).toEqual({});
        const raw = localStorage.getItem(resolveTombstoneKey());
        expect(raw && JSON.parse(raw).clearedAt).toBe(200);
    });
});

describe('hydrate merges remote with local (mocked oneSaveClient)', () => {
    beforeEach(() => {
        localStorage.clear();
        synthesisTombstoneStore.reset();
    });

    it('unions a remote tombstone object with an unsaved local one', async () => {
        synthesisUserIdHolder.current = 'u-hydrate';
        recordDelete('local-only', 1000); // unsaved local write → dirty marker set
        vi.mocked(oneSaveClient.get).mockResolvedValue({
            id: 'synthesis-tombstones_u-hydrate', type: 'synthesis-tombstones', ownerId: 'u-hydrate', schema: 1,
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
            payload: { v: 1, clearedAt: 0, deleted: { 'remote-only': 2000 } },
        });
        await synthesisTombstoneStore.hydrate();
        expect(synthesisTombstoneStore.getSnapshot().deleted).toEqual({ 'local-only': 1000, 'remote-only': 2000 });
    });
});
