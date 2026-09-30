/**
 * copawStore v2 sync correctness (plan 071 Phase 4). `merge()` is tested as
 * a pure function (fast, no store plumbing) plus one interleave test through
 * withSync's real hydrate() path with a mocked oneSave client, following the
 * `oneSaveStore hydrate merge option` precedent in oneSaveStore.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { merge, normalize, type StoredCopaw, type MemoryFact } from '../components/Hive/copawStore';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from '../lib/oneSaveStore';
import { oneSaveClient } from '../lib/oneSaveClient';
import type { DwelliumObject } from '../lib/oneSaveClient';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        putBatch: vi.fn().mockResolvedValue('unsupported'),
    },
}));

function savedObject(id: string, ownerId: string, payload: unknown): DwelliumObject {
    return {
        id, type: 'copaw', ownerId, schema: 1,
        createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z',
        deletedAt: null, payload,
    };
}

function fact(id: string, text: string, createdAt: string): MemoryFact {
    return { id, text, source: 'test', createdAt };
}

function stored(facts: MemoryFact[], deleted: Record<string, number> = {}, clearedAt = 0): StoredCopaw {
    return { v: 2, facts, deleted, clearedAt };
}

describe('copaw merge()', () => {
    it('unions two devices facts (A has f1,f2; B has f1,f3 -> f1,f2,f3)', () => {
        const a = stored([fact('f1', 'Shared fact one about the property.', '2026-01-01T00:00:00.000Z'), fact('f2', 'Device A only fact about the lease.', '2026-01-01T00:00:00.000Z')]);
        const b = stored([fact('f1', 'Shared fact one about the property.', '2026-01-01T00:00:00.000Z'), fact('f3', 'Device B only fact about the vendor.', '2026-01-01T00:00:00.000Z')]);
        const merged = merge(a, b);
        expect(merged.facts.map((f) => f.id).sort()).toEqual(['f1', 'f2', 'f3']);
    });

    it('a per-fact delete on A survives merge with B still holding the fact', () => {
        const a = stored([fact('f2', 'Device A only fact about the lease.', '2026-01-01T00:00:00.000Z')], { f1: Date.parse('2026-01-02T00:00:00.000Z') });
        const b = stored([fact('f1', 'Shared fact one about the property.', '2026-01-01T00:00:00.000Z'), fact('f2', 'Device A only fact about the lease.', '2026-01-01T00:00:00.000Z')]);
        const merged = merge(a, b);
        expect(merged.facts.map((f) => f.id)).toEqual(['f2']);
        expect(merged.deleted.f1).toBe(Date.parse('2026-01-02T00:00:00.000Z'));
    });

    it('a clear on A drops B older facts but keeps a fact B captured AFTER the clear', () => {
        const clearedAt = Date.parse('2026-01-02T00:00:00.000Z');
        const a = stored([], {}, clearedAt);
        const b = stored([
            fact('old', 'An old fact captured before the clear happened on device A.', '2026-01-01T00:00:00.000Z'),
            fact('new', 'A brand new fact captured on device B after the clear.', '2026-01-03T00:00:00.000Z'),
        ]);
        const merged = merge(a, b);
        expect(merged.facts.map((f) => f.id)).toEqual(['new']);
        expect(merged.clearedAt).toBe(clearedAt);
    });

    it('dedupes by lowercase text, keeping the newest', () => {
        const a = stored([fact('old', 'The Boiler needs servicing every year.', '2026-01-01T00:00:00.000Z')]);
        const b = stored([fact('new', 'the boiler needs servicing every year.', '2026-01-02T00:00:00.000Z')]);
        const merged = merge(a, b);
        expect(merged.facts.length).toBe(1);
        expect(merged.facts[0].id).toBe('new');
    });

    it('caps merged facts at 500, newest first', () => {
        const many: MemoryFact[] = Array.from({ length: 600 }, (_, i) =>
            fact(`f${i}`, `Fact number ${i} about the property portfolio here.`, new Date(2026, 0, 1, 0, 0, i).toISOString()));
        const merged = merge(stored(many), stored([]));
        expect(merged.facts.length).toBe(500);
        // Newest first: index 599 has the latest createdAt.
        expect(merged.facts[0].id).toBe('f599');
    });

    it('mutation check: a remote-wins merge would fail the union test (evidence the real merge does not remote-win)', () => {
        const remoteWins = (_local: StoredCopaw, remote: StoredCopaw): StoredCopaw => remote;
        const a = stored([fact('f1', 'Shared fact one about the property.', '2026-01-01T00:00:00.000Z'), fact('f2', 'Device A only fact about the lease.', '2026-01-01T00:00:00.000Z')]);
        const b = stored([fact('f1', 'Shared fact one about the property.', '2026-01-01T00:00:00.000Z'), fact('f3', 'Device B only fact about the vendor.', '2026-01-01T00:00:00.000Z')]);
        const brokenMerged = remoteWins(a, b);
        expect(brokenMerged.facts.map((f) => f.id).sort()).not.toEqual(['f1', 'f2', 'f3']); // A's f2 is lost
        // The real merge (asserted above) does NOT exhibit this loss.
        expect(merge(a, b).facts.map((f) => f.id).sort()).toEqual(['f1', 'f2', 'f3']);
    });
});

describe('normalize()', () => {
    it('migrates a v1 fact array', () => {
        const v1 = [fact('a1', 'An old fact stored before the v2 tombstone shape existed.', '2026-01-01T00:00:00.000Z')];
        expect(normalize(v1)).toEqual(stored(v1));
    });

    it('falls back to empty for garbage', () => {
        expect(normalize('nonsense')).toEqual(stored([]));
        expect(normalize(null)).toEqual(stored([]));
        expect(normalize(42)).toEqual(stored([]));
    });
});

describe('copaw hydrate() interleave (mocked oneSave client)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.get).mockReset();
        vi.mocked(oneSaveClient.put).mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('remote-then-local interleave keeps both devices facts', async () => {
        const holder: { current: string | null } = { current: 'user-1' };
        const resolveKey = () => `copaw-sync-test:${holder.current}`;
        const store = withSync(
            createLocalStorageStore<StoredCopaw>({ key: resolveKey, deserializer: () => stored([]), defaultValue: stored([]) }),
            { objectType: 'copaw-sync-test', holder, resolveKey, debounceMs: 10, merge },
        );

        // Local device captures its own fact first.
        store.set(stored([fact('local1', 'A fact captured locally on this device just now.', '2026-01-02T00:00:00.000Z')]), () => { /* not exercising real persistence */ });

        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject('copaw-sync-test_user-1', 'user-1', {}));
        vi.mocked(oneSaveClient.get).mockResolvedValue(savedObject('copaw-sync-test_user-1', 'user-1',
            stored([fact('remote1', 'A fact another device captured earlier and synced.', '2026-01-01T00:00:00.000Z')])));

        await store.hydrate();

        const ids = store.getSnapshot().facts.map((f) => f.id).sort();
        expect(ids).toEqual(['local1', 'remote1']);

        await vi.advanceTimersByTimeAsync(10);
        expect(oneSaveClient.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'copaw-sync-test_user-1' }));
    });
});

describe('copaw normalize — id stability (plan 071 W2 review)', () => {
    it('gives an id-less stored fact the same id every time it is read', () => {
        const raw = [{ text: 'Vendors must renew their insurance certificate every year.', source: 'x', createdAt: '2026-09-01T00:00:00.000Z' }];
        const a = normalize(raw).facts[0].id;
        const b = normalize(JSON.parse(JSON.stringify(raw))).facts[0].id;
        expect(a).toBe(b);
        expect(a.startsWith('legacy-')).toBe(true);
    });
});

