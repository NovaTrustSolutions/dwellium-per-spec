/**
 * Plan 070 phase 4: synthesisStore cross-device merge + tombstone-arrival
 * pruning. mergeSyntheses is pure and unit-tested directly; the hydrate /
 * cross-store-subscription paths need oneSaveClient mocked (sister-shape to
 * src/test/twImportedStoreMerge.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { oneSaveClient } from '../lib/oneSaveClient';
import {
    synthesisStore, synthesisUserIdHolder, captureSynthesis, mergeSyntheses, MAX_SYNTHESES,
    type Synthesis,
} from '../components/Synthesis/synthesisStore';
import { synthesisTombstoneStore, EMPTY_TOMBSTONES, type SynthesisTombstones } from '../components/Synthesis/synthesisTombstones';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        putBatch: vi.fn().mockResolvedValue('unsupported'),
    },
}));

function s(id: string, capturedAt: string, extra: Partial<Synthesis> = {}): Synthesis {
    return { id, query: `q-${id}`, result: `r-${id}`, layer: 1, parentId: null, capturedAt, ...extra };
}

beforeEach(() => {
    localStorage.clear();
    synthesisStore.reset();
    synthesisTombstoneStore.reset();
    synthesisUserIdHolder.current = null;
    vi.mocked(oneSaveClient.get).mockReset();
});

describe('mergeSyntheses (pure)', () => {
    it('unions captures present on only one side', () => {
        const local = [s('a', '2026-01-01T00:00:00.000Z')];
        const remote = [s('b', '2026-01-02T00:00:00.000Z')];
        const merged = mergeSyntheses(local, remote, EMPTY_TOMBSTONES);
        expect(merged.map((x) => x.id).sort()).toEqual(['a', 'b']);
    });

    it('same id on both sides: later capturedAt wins', () => {
        const local = [s('a', '2026-01-01T00:00:00.000Z', { result: 'old' })];
        const remote = [s('a', '2026-01-02T00:00:00.000Z', { result: 'new' })];
        const merged = mergeSyntheses(local, remote, EMPTY_TOMBSTONES);
        expect(merged.length).toBe(1);
        expect(merged[0].result).toBe('new');
    });

    it('exact-tie capturedAt favors local', () => {
        const local = [s('a', '2026-01-01T00:00:00.000Z', { result: 'local' })];
        const remote = [s('a', '2026-01-01T00:00:00.000Z', { result: 'remote' })];
        const merged = mergeSyntheses(local, remote, EMPTY_TOMBSTONES);
        expect(merged[0].result).toBe('local');
    });

    it('drops an entry tombstoned by delete', () => {
        const local = [s('a', '2026-01-01T00:00:00.000Z')];
        const remote = [s('b', '2026-01-01T00:00:00.000Z')];
        const t: SynthesisTombstones = { v: 1, clearedAt: 0, deleted: { b: Date.parse('2026-01-02T00:00:00.000Z') } };
        const merged = mergeSyntheses(local, remote, t);
        expect(merged.map((x) => x.id)).toEqual(['a']);
    });

    it('a re-capture (fresh capturedAt) survives an old tombstone for the same id', () => {
        const local = [s('a', '2026-01-05T00:00:00.000Z')]; // re-captured AFTER the delete below
        const t: SynthesisTombstones = { v: 1, clearedAt: 0, deleted: { a: Date.parse('2026-01-01T00:00:00.000Z') } };
        const merged = mergeSyntheses(local, [], t);
        expect(merged.map((x) => x.id)).toEqual(['a']);
    });

    it('sorts newest-first', () => {
        const local = [s('old', '2026-01-01T00:00:00.000Z')];
        const remote = [s('new', '2026-01-03T00:00:00.000Z')];
        const merged = mergeSyntheses(local, remote, EMPTY_TOMBSTONES);
        expect(merged.map((x) => x.id)).toEqual(['new', 'old']);
    });

    it('caps at MAX_SYNTHESES', () => {
        const base = Date.parse('2026-01-01T00:00:00.000Z');
        const local = Array.from({ length: MAX_SYNTHESES }, (_, i) => s(`l${i}`, new Date(base + i * 1000).toISOString()));
        const remote = [s('extra', '2026-02-01T00:00:00.000Z')];
        const merged = mergeSyntheses(local, remote, EMPTY_TOMBSTONES);
        expect(merged.length).toBe(MAX_SYNTHESES);
        expect(merged[0].id).toBe('extra'); // newest survives the cap
    });

    it('drops a remote entry that fails sanitization (no string result)', () => {
        const remote = [{ id: 'bad', capturedAt: '2026-01-01T00:00:00.000Z' } as unknown as Synthesis];
        const merged = mergeSyntheses([], remote, EMPTY_TOMBSTONES);
        expect(merged).toEqual([]);
    });
});

describe('tombstone-arrival prunes the captures store', () => {
    it('prunes when a delete tombstone written by "another device" arrives after hydrate', async () => {
        synthesisUserIdHolder.current = 'u-prune';
        captureSynthesis({ id: 'keep', query: 'q', result: 'r', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
        captureSynthesis({ id: 'gone', query: 'q', result: 'r', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));

        const setSpy = vi.spyOn(synthesisStore, 'set');

        // Simulate the tombstone store hydrating a remote delete recorded on
        // another device, well after the captures above already landed here.
        synthesisTombstoneStore.set(
            { v: 1, clearedAt: 0, deleted: { gone: Date.parse('2026-01-02T00:00:00.000Z') } },
            () => {},
        );

        const snap = synthesisStore.getSnapshot();
        expect(snap.map((x) => x.id)).toEqual(['keep']);
        expect(setSpy).toHaveBeenCalledTimes(1); // no loop
        setSpy.mockRestore();
    });

    it('does not call set() again when the tombstone store changes but nothing is prunable', () => {
        synthesisUserIdHolder.current = 'u-noop';
        captureSynthesis({ id: 'a', query: 'q', result: 'r', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
        const setSpy = vi.spyOn(synthesisStore, 'set');
        synthesisTombstoneStore.set({ v: 1, clearedAt: 0, deleted: {} }, () => {});
        expect(setSpy).not.toHaveBeenCalled();
        setSpy.mockRestore();
    });
});

describe('plan 070 P4 orchestrator fixes', () => {
    it('an item with an unparseable capturedAt survives when nothing was ever cleared or deleted', async () => {
        const { applyTombstones, EMPTY_TOMBSTONES } = await import('../components/Synthesis/synthesisTombstones');
        const items = [{ id: 'odd', query: 'q', result: 'r', layer: 1, parentId: null, capturedAt: 'not a date' }];
        expect(applyTombstones(items, { ...EMPTY_TOMBSTONES, deleted: {} })).toBe(items);
    });

    it('clock skew: deleting / clearing a capture stamped in the future still removes it everywhere', async () => {
        const store = await import('../components/Synthesis/synthesisStore');
        const tomb = await import('../components/Synthesis/synthesisTombstones');
        const future = new Date(Date.now() + 10 * 60_000).toISOString(); // other device's clock is 10 min ahead
        const item = { id: 'skewed', query: 'q', result: 'r', layer: 1, parentId: null, capturedAt: future };
        store.synthesisStore.set([item], () => {});
        store.removeSynthesis('skewed');
        // A stale device still holding the item merges with these tombstones → gone.
        expect(tomb.applyTombstones([item], tomb.synthesisTombstoneStore.getSnapshot())).toEqual([]);

        const item2 = { ...item, id: 'skewed-2' };
        store.synthesisStore.set([item2], () => {});
        store.clearSyntheses();
        expect(tomb.applyTombstones([item2], tomb.synthesisTombstoneStore.getSnapshot())).toEqual([]);
    });
});
