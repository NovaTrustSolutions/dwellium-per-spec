import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { oneSaveSync, withSync, syncStatusStore } from '../lib/oneSaveStore';
import { oneSaveClient } from '../lib/oneSaveClient';
import { syncRateLimitStore, markRateLimited } from '../lib/syncRateLimitStore';
import { backendStatusStore } from '../lib/backendStatusStore';
import type { DwelliumObject } from '../lib/oneSaveClient';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        // Default: every pre-existing test in this file exercises the per-id
        // `put()` fallback path unchanged — 'unsupported' latches oneSaveStore's
        // batchUnsupported flag on first flush, same as an old backend. Tests
        // for the batch path itself override this per-test (see "batched
        // write-through" below) and reset the flag via syncStatusStore.reset().
        putBatch: vi.fn().mockResolvedValue('unsupported'),
    },
}));

/** A minimal "persisted" object so a `put` success resolves to a truthy value. */
function savedObject(id: string, ownerId: string, payload: unknown): DwelliumObject {
    return {
        id,
        type: 'race-test',
        ownerId,
        schema: 1,
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
        deletedAt: null,
        payload,
    };
}

describe('oneSaveStore account isolation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.get).mockReset();
    });

    it('drops a pending write when the authenticated account changes', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;
        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('private account A value', () => localStorage.setItem(resolveKey(), 'private account A value'));
        holder.current = 'account-b';
        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });

    it('clears dynamic store owners when the active account logs out', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `logout-test:${holder.current ?? '_anonymous'}`;
        withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'logout-test', holder, resolveKey, debounceMs: 10 },
        );

        await oneSaveSync.bootstrap(null);

        expect(holder.current).toBeNull();
    });
});

describe('oneSaveStore write-through retry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.get).mockReset();
        syncRateLimitStore.reset();
        backendStatusStore.reset();
    });

    afterEach(() => {
        backendStatusStore.reset();
        vi.useRealTimers();
    });

    it('stops after one attempt on a 429 (no backoff retry), replay parked', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;
        const markOffline = vi.spyOn(backendStatusStore, 'markOffline');

        // 429-shaped failure: put resolves null AND the rate-limit store reports limited.
        // retryAt is already in the past (-1s) so this test exercises the EXISTING
        // 059 mid-attempt break, not the phase-1 pre-schedule pause (covered below).
        vi.mocked(oneSaveClient.put).mockResolvedValue(null);
        markRateLimited(-1);

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('v', () => localStorage.setItem(resolveKey(), 'v'));
        // debounce (10) only — if a backoff retry fired, this window wouldn't include it.
        await vi.advanceTimersByTimeAsync(10 + 500 + 1000);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
        expect(markOffline).toHaveBeenCalledTimes(1);
        expect(backendStatusStore.getSnapshot().state).toBe('offline');
    });

    // Control: with `limited` false, the existing 3-attempt behaviour is
    // unchanged — see the neighbouring "retries up to the cap" test above.

    it('retries a failed write and succeeds on a later attempt (no banner)', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;
        const markOffline = vi.spyOn(backendStatusStore, 'markOffline');

        // Fail once (null), then succeed (truthy saved object).
        vi.mocked(oneSaveClient.put)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(savedObject('race-test_account-a', 'account-a', 'v'));

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('v', () => localStorage.setItem(resolveKey(), 'v'));
        // debounce (10) + first backoff (500) covers the single retry.
        await vi.advanceTimersByTimeAsync(10 + 500);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(2);
        expect(markOffline).not.toHaveBeenCalled();
    });

    it('retries up to the cap then surfaces persistent failure (value not dropped)', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;
        const markOffline = vi.spyOn(backendStatusStore, 'markOffline');

        // Always fail → all attempts exhausted.
        vi.mocked(oneSaveClient.put).mockResolvedValue(null);

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('v', () => localStorage.setItem(resolveKey(), 'v'));
        // debounce (10) + backoff 500 + backoff 1000 covers all 3 attempts.
        await vi.advanceTimersByTimeAsync(10 + 500 + 1000);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(3);
        expect(markOffline).toHaveBeenCalledTimes(1);
        expect(backendStatusStore.getSnapshot().state).toBe('offline');
    });

    it('never writes into the next user namespace when the account switches mid-retry', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;

        // First attempt fails; before the retry fires, the account switches.
        vi.mocked(oneSaveClient.put).mockResolvedValue(null);

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('private account A value', () => localStorage.setItem(resolveKey(), 'private account A value'));
        // Let the debounce fire and the first (failing) put run.
        await vi.advanceTimersByTimeAsync(10);
        // Switch account during the backoff window before the retry.
        holder.current = 'account-b';
        await vi.advanceTimersByTimeAsync(500 + 1000);

        // Exactly one put happened (for account-a); the guard dropped the retry.
        expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
        // No put ever targeted account-b's namespace.
        const targetedB = vi
            .mocked(oneSaveClient.put)
            .mock.calls.some(([obj]) => obj.ownerId === 'account-b' || obj.id.includes('account-b'));
        expect(targetedB).toBe(false);
    });

    // Plan 060 phase 1 — honor Retry-After: pause ALL sync until the window opens.
    it('holds the write until the Retry-After window opens (no put before retryAt)', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;

        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject('race-test_account-a', 'account-a', 'v'));
        markRateLimited(30); // retryAt = now + 30s

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('v', () => localStorage.setItem(resolveKey(), 'v'));
        // Normal debounce (10ms) elapses — the pause must still be holding it.
        await vi.advanceTimersByTimeAsync(10);
        expect(oneSaveClient.put).not.toHaveBeenCalled();

        // The rest of the 30s window elapses — now it flushes.
        await vi.advanceTimersByTimeAsync(30_000);
        expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
    });

    it('coalesces writes issued during the pause into a single flush', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;

        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject('race-test_account-a', 'account-a', 'v2'));
        markRateLimited(30);

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('v1', () => localStorage.setItem(resolveKey(), 'v1'));
        await vi.advanceTimersByTimeAsync(15_000);
        store.set('v2', () => localStorage.setItem(resolveKey(), 'v2')); // re-arms the same timer

        await vi.advanceTimersByTimeAsync(30_000);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
        expect(oneSaveClient.put).toHaveBeenCalledWith(expect.objectContaining({ payload: 'v2' }));
    });

    it('retryAt already in the past behaves like normal debounce', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;

        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject('race-test_account-a', 'account-a', 'v'));
        syncRateLimitStore.reset(); // limited: false, retryAt: null → normal debounceMs path

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('v', () => localStorage.setItem(resolveKey(), 'v'));
        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
    });
});

// plan 046 S1d — sync-state snapshot + reconnect replay.
describe('oneSaveStore syncStatusStore', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.get).mockReset();
        backendStatusStore.reset();
        syncStatusStore.reset();
    });

    afterEach(() => {
        syncStatusStore.reset();
        backendStatusStore.reset();
        vi.useRealTimers();
    });

    function makeStore(objectType: string) {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `${objectType}:${holder.current ?? '_anonymous'}`;
        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType, holder, resolveKey, debounceMs: 10 },
        );
        return { store, holder, resolveKey };
    }

    it('set() → pending 1; after the put resolves → pending 0 + lastSavedAt', async () => {
        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject('sync-a_account-a', 'account-a', 'v'));
        const { store, resolveKey } = makeStore('sync-a');

        expect(syncStatusStore.getSnapshot().pending).toBe(0);
        store.set('v', () => localStorage.setItem(resolveKey(), 'v'));
        expect(syncStatusStore.getSnapshot().pending).toBe(1);
        expect(syncStatusStore.getSnapshot().lastSavedAt).toBeNull();

        await vi.advanceTimersByTimeAsync(10);
        const snap = syncStatusStore.getSnapshot();
        expect(snap.pending).toBe(0);
        expect(snap.lastSavedAt).toBeTypeOf('number');
    });

    it('3 failed puts → offline + pending 0; markOnline() replays the same payload once', async () => {
        vi.mocked(oneSaveClient.put).mockResolvedValue(null);
        const { store, resolveKey } = makeStore('sync-b');

        store.set('v', () => localStorage.setItem(resolveKey(), 'v'));
        await vi.advanceTimersByTimeAsync(10 + 500 + 1000);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(3);
        expect(backendStatusStore.getSnapshot().state).toBe('offline');
        expect(syncStatusStore.getSnapshot().pending).toBe(0);

        // Reconnect → the parked write is re-scheduled (debounced) and re-put.
        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject('sync-b_account-a', 'account-a', 'v'));
        backendStatusStore.markOnline();
        expect(syncStatusStore.getSnapshot().pending).toBe(1);
        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(4);
        const last = vi.mocked(oneSaveClient.put).mock.calls[3][0];
        expect(last).toMatchObject({ id: 'sync-b_account-a', ownerId: 'account-a', payload: 'v' });
        expect(syncStatusStore.getSnapshot().pending).toBe(0);

        // A second markOnline() must not replay again (failed set was cleared).
        backendStatusStore.markOffline('x');
        backendStatusStore.markOnline();
        await vi.advanceTimersByTimeAsync(10);
        expect(oneSaveClient.put).toHaveBeenCalledTimes(4);
    });

    it('replay never writes into a switched account namespace', async () => {
        vi.mocked(oneSaveClient.put).mockResolvedValue(null);
        const { store, holder, resolveKey } = makeStore('sync-c');

        store.set('private A', () => localStorage.setItem(resolveKey(), 'private A'));
        await vi.advanceTimersByTimeAsync(10 + 500 + 1000);
        expect(oneSaveClient.put).toHaveBeenCalledTimes(3);

        holder.current = 'account-b';
        backendStatusStore.markOnline();
        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(3);
        expect(syncStatusStore.getSnapshot().pending).toBe(0);
    });
});

describe('oneSaveStore bootstrap isolation', () => {
    beforeEach(async () => {
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.get).mockReset();
        // Reset the shared currentUserId to null so stores registered below do
        // NOT auto-hydrate at registration time (the late-registration catch-up
        // only fires when a user is already active). Keeps each store's first
        // get() deterministically driven by the explicit bootstrap() below.
        await oneSaveSync.bootstrap(null);
    });

    it('still hydrates later stores when an earlier store hydrate rejects', async () => {
        const baselineCount = oneSaveSync.registeredCount;

        // First store: its hydrate rejects (simulates a corrupt remote payload).
        const holderA: { current: string | null } = { current: null };
        const resolveKeyA = () => `boot-a:${holderA.current ?? '_anonymous'}`;
        withSync(
            createLocalStorageStore<string>({
                key: resolveKeyA,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            {
                objectType: 'boot-a',
                holder: holderA,
                resolveKey: resolveKeyA,
                debounceMs: 10,
            },
        );

        // Second store: its hydrate should still run even though the first rejected.
        const holderB: { current: string | null } = { current: null };
        const resolveKeyB = () => `boot-b:${holderB.current ?? '_anonymous'}`;
        withSync(
            createLocalStorageStore<string>({
                key: resolveKeyB,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'boot-b', holder: holderB, resolveKey: resolveKeyB, debounceMs: 10 },
        );

        expect(oneSaveSync.registeredCount).toBe(baselineCount + 2);

        // get() is called once per store during hydrate. Make the FIRST registered
        // store's hydrate reject, everything else resolve to null (no remote value).
        // Stores hydrate via Promise.allSettled(registry.map(e => e.hydrate())), so
        // a single rejection must not prevent the others from calling get().
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => {
            if (id.startsWith('boot-a_')) throw new Error('corrupt remote payload');
            return null;
        });

        await oneSaveSync.bootstrap('user-1');

        // boot-b's hydrate ran despite boot-a rejecting (proven by its get() call).
        const calledIds = vi.mocked(oneSaveClient.get).mock.calls.map(([id]) => id);
        expect(calledIds).toContain('boot-a_user-1'); // the rejecting store was attempted
        expect(calledIds).toContain('boot-b_user-1'); // the later store STILL hydrated
    });
    it('hydrate never overwrites a local edit made while its GET was in flight', async () => {
        const holder: { current: string | null } = { current: null };
        const resolveKey = () => `race:${holder.current ?? '_anonymous'}`;
        const store = withSync(
            createLocalStorageStore<string>({ key: resolveKey, deserializer: (raw) => raw ?? '', defaultValue: '' }),
            { objectType: 'race', holder, resolveKey, debounceMs: 10 },
        );
        await oneSaveSync.bootstrap('user-1');

        let release!: (v: DwelliumObject | null) => void;
        vi.mocked(oneSaveClient.get).mockImplementation(() => new Promise((r) => { release = r; }));

        const hydrating = store.hydrate();
        store.set('typed locally', () => localStorage.setItem(resolveKey(), 'typed locally'));
        release(savedObject('race_user-1', 'user-1', 'stale remote'));
        await hydrating;

        expect(store.getSnapshot()).toBe('typed locally');

        // Control: once the local edit is durably saved (the flush clears the
        // plan-067 dirty marker), the remote value IS applied.
        localStorage.removeItem('onesave:dirty:race_user-1');
        vi.mocked(oneSaveClient.get).mockResolvedValue(savedObject('race_user-1', 'user-1', 'fresh remote'));
        await store.hydrate();
        expect(store.getSnapshot()).toBe('fresh remote');
    });
});

// SyncOptions.merge (wiki-widget-hardening plan §A): hydrate() can reconcile
// the remote payload against the local snapshot instead of remote always
// replacing local outright — and schedule a write-through when the
// reconciled result carries local-only data the backend doesn't have yet.
describe('oneSaveStore hydrate merge option', () => {
    interface Item { v: number }
    type ItemMap = Record<string, Item>;

    function higherValueWins(local: ItemMap, remote: ItemMap): ItemMap {
        const out: ItemMap = { ...remote };
        for (const [k, lv] of Object.entries(local)) {
            const rv = out[k];
            if (!rv || lv.v > rv.v) out[k] = lv;
        }
        return out;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.get).mockReset();
        vi.mocked(oneSaveClient.put).mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('merges local + remote on hydrate and schedules a write-through for the reconciled result', async () => {
        const holder: { current: string | null } = { current: 'user-1' };
        const resolveKey = () => `merge-test:${holder.current}`;
        const store = withSync(
            createLocalStorageStore<ItemMap>({ key: resolveKey, deserializer: () => ({}), defaultValue: {} }),
            { objectType: 'merge-test', holder, resolveKey, debounceMs: 10, merge: higherValueWins },
        );
        // A local-only edit, newer than whatever the backend has for `a`.
        store.set({ a: { v: 2 } }, () => { /* not exercising real persistence */ });
        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject('merge-test_user-1', 'user-1', {}));
        vi.mocked(oneSaveClient.get).mockResolvedValue(
            savedObject('merge-test_user-1', 'user-1', { a: { v: 1 }, b: { v: 5 } }),
        );

        await store.hydrate();

        // Local's newer `a` survives; remote-only `b` is picked up too.
        expect(store.getSnapshot()).toEqual({ a: { v: 2 }, b: { v: 5 } });

        await vi.advanceTimersByTimeAsync(10);
        expect(oneSaveClient.put).toHaveBeenCalledWith(expect.objectContaining({
            id: 'merge-test_user-1',
            payload: { a: { v: 2 }, b: { v: 5 } },
        }));
    });

    it('control: a store with no merge option still has hydrate replace local with remote outright', async () => {
        const holder: { current: string | null } = { current: 'user-1' };
        const resolveKey = () => `no-merge-test:${holder.current}`;
        const store = withSync(
            createLocalStorageStore<ItemMap>({ key: resolveKey, deserializer: () => ({}), defaultValue: {} }),
            { objectType: 'no-merge-test', holder, resolveKey, debounceMs: 10 },
        );
        store.set({ a: { v: 2 } }, () => { /* not exercising real persistence */ });
        // Let the local set's own write-through flush and clear before
        // isolating what hydrate() itself does.
        vi.mocked(oneSaveClient.put).mockResolvedValue(savedObject('no-merge-test_user-1', 'user-1', {}));
        await vi.advanceTimersByTimeAsync(10);
        vi.mocked(oneSaveClient.put).mockReset();

        vi.mocked(oneSaveClient.get).mockResolvedValue(
            savedObject('no-merge-test_user-1', 'user-1', { a: { v: 1 }, b: { v: 5 } }),
        );

        await store.hydrate();

        expect(store.getSnapshot()).toEqual({ a: { v: 1 }, b: { v: 5 } });
        // Byte-identical to pre-merge behaviour: hydrate alone never PUTs.
        await vi.advanceTimersByTimeAsync(10);
        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });
});

// Plan 060 phase 4 — module-level flush queue: many stores' debounced writes
// coalesce into one oneSaveClient.putBatch call instead of one PUT each.
describe('oneSaveStore batched write-through', () => {
    function makeBatchStore(objectType: string, ownerId = 'account-a') {
        const holder: { current: string | null } = { current: ownerId };
        const resolveKey = () => `${objectType}:${holder.current ?? '_anonymous'}`;
        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType, holder, resolveKey, debounceMs: 10 },
        );
        return { store, holder, resolveKey };
    }

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.get).mockReset();
        vi.mocked(oneSaveClient.putBatch).mockReset();
        syncRateLimitStore.reset();
        backendStatusStore.reset();
        syncStatusStore.reset(); // clears the flush queue + batchUnsupported flag
        // Reset the shared currentUserId so newly-registered stores below don't
        // get late-registration-catch-up'd onto a previous test's bootstrap user
        // (see the "bootstrap isolation" describe above — same pattern).
        await oneSaveSync.bootstrap(null);
    });

    afterEach(() => {
        syncStatusStore.reset();
        backendStatusStore.reset();
        vi.useRealTimers();
    });

    it('a set() that lands while putBatch is in flight is sent in the next flush, not dropped', async () => {
        let release!: (v: { saved: string[]; failed: [] }) => void;
        vi.mocked(oneSaveClient.putBatch)
            .mockImplementationOnce(() => new Promise((r) => { release = r; }))
            .mockResolvedValueOnce({ saved: ['batch-a_account-a'], failed: [] });
        const a = makeBatchStore('batch-a');

        a.store.set('v1', () => localStorage.setItem(a.resolveKey(), 'v1'));
        await vi.advanceTimersByTimeAsync(10); // flush #1 starts, awaiting the network
        expect(oneSaveClient.putBatch).toHaveBeenCalledTimes(1);

        a.store.set('v2', () => localStorage.setItem(a.resolveKey(), 'v2')); // newer value, same id
        release({ saved: ['batch-a_account-a'], failed: [] });
        await vi.advanceTimersByTimeAsync(1000); // flush #1 settles; re-arm fires flush #2

        expect(oneSaveClient.putBatch).toHaveBeenCalledTimes(2);
        const second = vi.mocked(oneSaveClient.putBatch).mock.calls[1][0];
        expect(second.map((o) => o.payload)).toEqual(['v2']);
        expect(syncStatusStore.getSnapshot().pending).toBe(0);
    });

    it('three stores set within the debounce window ⇒ one putBatch call with three objects', async () => {
        vi.mocked(oneSaveClient.putBatch).mockResolvedValue({
            saved: ['batch-a_account-a', 'batch-b_account-a', 'batch-c_account-a'],
            failed: [],
        });

        const a = makeBatchStore('batch-a');
        const b = makeBatchStore('batch-b');
        const c = makeBatchStore('batch-c');

        a.store.set('va', () => localStorage.setItem(a.resolveKey(), 'va'));
        b.store.set('vb', () => localStorage.setItem(b.resolveKey(), 'vb'));
        c.store.set('vc', () => localStorage.setItem(c.resolveKey(), 'vc'));

        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.putBatch).toHaveBeenCalledTimes(1);
        expect(oneSaveClient.put).not.toHaveBeenCalled();
        const objects = vi.mocked(oneSaveClient.putBatch).mock.calls[0][0];
        expect(objects).toHaveLength(3);
        expect(objects.map((o) => o.payload).sort()).toEqual(['va', 'vb', 'vc']);

        // Each store's own bookkeeping updated from the shared batch result.
        expect(syncStatusStore.getSnapshot().pending).toBe(0);
        expect(syncStatusStore.getSnapshot().lastSavedAt).toBeTypeOf('number');
    });

    it('putBatch reporting "unsupported" (404, old backend) ⇒ falls back to three puts', async () => {
        vi.mocked(oneSaveClient.putBatch).mockResolvedValue('unsupported');
        vi.mocked(oneSaveClient.put).mockImplementation(async (obj) =>
            savedObject(obj.id, obj.ownerId, obj.payload),
        );

        const a = makeBatchStore('batch-d');
        const b = makeBatchStore('batch-e');
        const c = makeBatchStore('batch-f');

        a.store.set('va', () => localStorage.setItem(a.resolveKey(), 'va'));
        b.store.set('vb', () => localStorage.setItem(b.resolveKey(), 'vb'));
        c.store.set('vc', () => localStorage.setItem(c.resolveKey(), 'vc'));

        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.putBatch).toHaveBeenCalledTimes(1);
        expect(oneSaveClient.put).toHaveBeenCalledTimes(3);
        expect(syncStatusStore.getSnapshot().pending).toBe(0);
    });

    it('account switch mid-window drops the switched store from the batch', async () => {
        vi.mocked(oneSaveClient.putBatch).mockResolvedValue({
            saved: ['batch-g_account-a'],
            failed: [],
        });

        const a = makeBatchStore('batch-g');
        const b = makeBatchStore('batch-h');

        a.store.set('va', () => localStorage.setItem(a.resolveKey(), 'va'));
        b.store.set('vb', () => localStorage.setItem(b.resolveKey(), 'vb'));
        b.holder.current = 'account-b'; // switched before the flush fires

        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.putBatch).toHaveBeenCalledTimes(1);
        const objects = vi.mocked(oneSaveClient.putBatch).mock.calls[0][0];
        expect(objects).toHaveLength(1);
        expect(objects[0].id).toBe('batch-g_account-a');
        expect(syncStatusStore.getSnapshot().pending).toBe(0);
    });

    it('a 207 with one failed id parks only that store, other stores are saved', async () => {
        vi.mocked(oneSaveClient.putBatch).mockResolvedValue({
            saved: ['batch-i_account-a'],
            failed: [{ id: 'batch-j_account-a', error: 'owner mismatch' }],
        });

        const a = makeBatchStore('batch-i');
        const b = makeBatchStore('batch-j');

        a.store.set('va', () => localStorage.setItem(a.resolveKey(), 'va'));
        b.store.set('vb', () => localStorage.setItem(b.resolveKey(), 'vb'));

        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.putBatch).toHaveBeenCalledTimes(1);
        expect(syncStatusStore.getSnapshot().pending).toBe(0);

        // Reconnect replay only re-schedules the failed store (batch-j), not batch-i.
        // (state is already 'online' — a 207 partial failure never flips the
        // global banner — so force a transition for markOnline's listener to fire.)
        vi.mocked(oneSaveClient.putBatch).mockResolvedValue({ saved: ['batch-j_account-a'], failed: [] });
        backendStatusStore.markOffline('x');
        backendStatusStore.markOnline();
        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.putBatch).toHaveBeenCalledTimes(2);
        const replayed = vi.mocked(oneSaveClient.putBatch).mock.calls[1][0];
        expect(replayed).toHaveLength(1);
        expect(replayed[0].id).toBe('batch-j_account-a');
    });
});
