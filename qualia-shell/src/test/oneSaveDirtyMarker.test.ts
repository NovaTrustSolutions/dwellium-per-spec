/**
 * Dirty marker (plan 067 Phase 1) — a local write() persists to localStorage
 * synchronously but its durable write-through is debounced (800ms) and a
 * failed flush only parks an in-memory replay closure. Without a persisted
 * marker, a reload inside that debounce window (or after a failed flush
 * while the backend IS reachable) lets hydrate() apply a stale remote and
 * silently discard the unsaved edit. See oneSaveStore.ts's dirty-marker block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync, withSyncStatic, oneSaveSync, syncStatusStore } from '../lib/oneSaveStore';
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
        id,
        type: 'dirty-test',
        ownerId,
        schema: 1,
        createdAt: '2026-09-25T00:00:00.000Z',
        updatedAt: '2026-09-25T00:00:00.000Z',
        deletedAt: null,
        payload,
    };
}

function dirtyKey(objectId: string): string {
    return `onesave:dirty:${objectId}`;
}

describe('oneSaveStore dirty marker', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.get).mockReset();
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.putBatch).mockReset().mockResolvedValue('unsupported');
        syncStatusStore.reset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('a) an unflushed local write survives a reload: hydrate keeps it and reschedules the write-through', async () => {
        const holder: { current: string | null } = { current: 'user-1' };
        const resolveKey = () => `dirty-test:${holder.current}`;
        const opts = { objectType: 'dirty-test', holder, resolveKey, debounceMs: 10_000 };

        // First "tab": writes locally but the debounce (10s) never fires in this test.
        const store1 = withSync(
            createLocalStorageStore<string>({ key: resolveKey, deserializer: (raw) => raw ?? '', defaultValue: '' }),
            opts,
        );
        store1.set('local edit', () => localStorage.setItem(resolveKey(), 'local edit'));
        expect(localStorage.getItem(dirtyKey('dirty-test_user-1'))).toBe('1');

        // Simulate a reload: a fresh store instance over the SAME localStorage key/objectId
        // (base pre-seeded from storage by createLocalStorageStore, same as after a real reload).
        const store2 = withSync(
            createLocalStorageStore<string>({ key: resolveKey, deserializer: (raw) => raw ?? '', defaultValue: '' }),
            opts,
        );

        vi.mocked(oneSaveClient.get).mockResolvedValue(savedObject('dirty-test_user-1', 'user-1', 'stale remote'));
        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject('dirty-test_user-1', 'user-1', 'local edit'));

        await store2.hydrate();

        // Local wins — the stale remote is never applied.
        expect(store2.getSnapshot()).toBe('local edit');

        // The dirty write-through is rescheduled (not lost).
        await vi.advanceTimersByTimeAsync(10_000);
        expect(oneSaveClient.put).toHaveBeenCalledWith(expect.objectContaining({
            id: 'dirty-test_user-1',
            payload: 'local edit',
        }));
    });

    it('b) control: no marker set — hydrate applies remote exactly as before', async () => {
        const holder: { current: string | null } = { current: 'user-1' };
        const resolveKey = () => `dirty-control:${holder.current}`;
        const store = withSync(
            createLocalStorageStore<string>({ key: resolveKey, deserializer: (raw) => raw ?? '', defaultValue: '' }),
            { objectType: 'dirty-control', holder, resolveKey, debounceMs: 10 },
        );

        expect(localStorage.getItem(dirtyKey('dirty-control_user-1'))).toBeNull();
        vi.mocked(oneSaveClient.get).mockResolvedValue(savedObject('dirty-control_user-1', 'user-1', 'fresh remote'));

        await store.hydrate();

        expect(store.getSnapshot()).toBe('fresh remote');
    });

    it('c) a successful flush clears the marker; a failed flush keeps it', async () => {
        const holder: { current: string | null } = { current: 'user-1' };
        const resolveKey = () => `dirty-flush:${holder.current}`;
        const store = withSync(
            createLocalStorageStore<string>({ key: resolveKey, deserializer: (raw) => raw ?? '', defaultValue: '' }),
            { objectType: 'dirty-flush', holder, resolveKey, debounceMs: 10 },
        );
        const id = 'dirty-flush_user-1';

        // Failure path first: put() resolves falsy -> onFailed -> marker stays.
        vi.mocked(oneSaveClient.put).mockResolvedValue(null as unknown as DwelliumObject);
        store.set('will fail', () => localStorage.setItem(resolveKey(), 'will fail'));
        expect(localStorage.getItem(dirtyKey(id))).toBe('1');
        await vi.advanceTimersByTimeAsync(10 + 500 + 1000);
        expect(localStorage.getItem(dirtyKey(id))).toBe('1');

        // Success path: next set()'s flush succeeds -> marker cleared.
        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject(id, 'user-1', 'will succeed'));
        store.set('will succeed', () => localStorage.setItem(resolveKey(), 'will succeed'));
        await vi.advanceTimersByTimeAsync(10);
        expect(localStorage.getItem(dirtyKey(id))).toBeNull();
    });

    it('d) a second set() while the first flush is in flight keeps the marker until the second is saved', async () => {
        const holder: { current: string | null } = { current: 'user-1' };
        const resolveKey = () => `dirty-inflight:${holder.current}`;
        const store = withSync(
            createLocalStorageStore<string>({ key: resolveKey, deserializer: (raw) => raw ?? '', defaultValue: '' }),
            { objectType: 'dirty-inflight', holder, resolveKey, debounceMs: 10 },
        );
        const id = 'dirty-inflight_user-1';

        // Resolve with whatever was actually sent — a set() during an in-flight
        // PUT re-arms the shared flush timer (armFlush), which can overlap the
        // still-running flush and fire a second put() for the same id (the
        // module comment on runFlush calls this "idempotent upsert, harmless").
        // Exactly how many overlapping calls happen is an implementation
        // detail; what must hold is settle()'s contract: only the call whose
        // entry is STILL the one queued clears the marker.
        const deferred: Array<() => void> = [];
        vi.mocked(oneSaveClient.put).mockImplementation((obj) => new Promise((resolve) => {
            deferred.push(() => resolve(savedObject(obj.id, obj.ownerId, obj.payload)));
        }));

        store.set('v1', () => localStorage.setItem(resolveKey(), 'v1'));
        // Debounce fires; putBatch resolves 'unsupported' -> falls through to
        // put(v1), which hangs.
        await vi.advanceTimersByTimeAsync(10);
        expect(localStorage.getItem(dirtyKey(id))).toBe('1');

        // A second set() arrives while the v1 PUT is still in flight.
        store.set('v2', () => localStorage.setItem(resolveKey(), 'v2'));

        // Resolving v1's (stale) PUT must NOT clear the marker: settle() only
        // fires for the exact entry sent, and v2 already replaced it in the
        // flush queue.
        const [v1Resolve] = deferred.splice(0, 1);
        v1Resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(localStorage.getItem(dirtyKey(id))).toBe('1');

        // Drain every subsequent PUT (overlapping flush + backoff retry) with
        // its own actual payload until the marker clears.
        for (let round = 0; round < 5 && localStorage.getItem(dirtyKey(id)) != null; round++) {
            deferred.splice(0, deferred.length).forEach((resolve) => resolve());
            await vi.advanceTimersByTimeAsync(600);
        }

        expect(localStorage.getItem(dirtyKey(id))).toBeNull();
        // The last write actually persisted is v2's.
        expect(localStorage.getItem(resolveKey())).toBe('v2');
    });

    it('e) shared-slot (static) store: A\'s stale marker never pushes B\'s data into A\'s remote', async () => {
        await oneSaveSync.bootstrap(null);
        const store = withSyncStatic(
            createLocalStorageStore<string>({ key: 'slot-test', deserializer: (raw) => raw ?? '', defaultValue: '' }),
            { objectType: 'slot-test', storageKey: 'slot-test', debounceMs: 10_000, serialize: (v: string) => v },
        );
        const remoteFor = (payloads: Record<string, string | null>) => vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => {
            const p = payloads[id];
            return p == null ? null : savedObject(id, id.split('_')[1], p);
        });

        remoteFor({});
        await oneSaveSync.bootstrap('A');
        store.set('A edit', () => localStorage.setItem('slot-test', 'A edit')); // unsaved → marker for slot-test_A
        expect(localStorage.getItem(dirtyKey('slot-test_A'))).toBe('1');

        remoteFor({ 'slot-test_B': 'B theme' });
        await oneSaveSync.bootstrap('B'); // B's remote fills the shared slot
        expect(store.getSnapshot()).toBe('B theme');

        remoteFor({ 'slot-test_A': 'A remote' });
        await oneSaveSync.bootstrap('A');
        expect(store.getSnapshot()).toBe('A remote');
        expect(localStorage.getItem(dirtyKey('slot-test_A'))).toBeNull();

        await vi.advanceTimersByTimeAsync(30_000);
        const pushedIntoA = vi.mocked(oneSaveClient.put).mock.calls.filter(([o]) => o.id === 'slot-test_A' && o.payload === 'B theme');
        expect(pushedIntoA).toHaveLength(0);
        await oneSaveSync.bootstrap(null);
    });

    it('f) shared-slot store, same owner reload: the unsaved edit still wins', async () => {
        await oneSaveSync.bootstrap(null);
        vi.mocked(oneSaveClient.get).mockResolvedValue(null);
        await oneSaveSync.bootstrap('A');
        const mk = () => withSyncStatic(
            createLocalStorageStore<string>({ key: 'slot-test2', deserializer: (raw) => raw ?? '', defaultValue: '' }),
            { objectType: 'slot-test2', storageKey: 'slot-test2', debounceMs: 10_000, serialize: (v: string) => v },
        );
        mk().set('A edit', () => localStorage.setItem('slot-test2', 'A edit'));
        const reloaded = mk();
        vi.mocked(oneSaveClient.get).mockResolvedValue(savedObject('slot-test2_A', 'A', 'stale remote'));
        await reloaded.hydrate();
        expect(reloaded.getSnapshot()).toBe('A edit');
        await oneSaveSync.bootstrap(null);
    });
});

