/**
 * subscriptionsStore follows the login (feat/settings-follow-login): per-USER
 * key + One Save write-through/hydrate, so the Home "AI Spend" figure is the
 * same on every machine after login. Existing device-local values are adopted,
 * never reset. Sister to araPrefsPerUser.test.ts + accountResumeStores.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));

import { oneSaveClient, type DwelliumObject } from '../lib/oneSaveClient';
import { oneSaveSync } from '../lib/oneSaveStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { saveSubscriptions, subscriptionsStore, type Subscription } from '../lib/subscriptionsStore';

const ANDY = 'u-andy';
const OBJECT_ID = `subscriptions_${ANDY}`;
const KEY = `subscriptions:${ANDY}`;
const SEED: Subscription[] = [{ id: 'claude-pro', name: 'Claude Pro', vendor: 'Anthropic', monthly: 20 }];

function remote<T>(payload: T): DwelliumObject<T> {
    return { id: OBJECT_ID, type: 'subscriptions', ownerId: ANDY, schema: 1, createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z', deletedAt: null, payload };
}

function putFor(id: string) {
    return vi.mocked(oneSaveClient.put).mock.calls.map(([o]) => o).find((o) => o.id === id);
}

beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    setPerUserIdentity(null);
    await oneSaveSync.bootstrap(null);
    subscriptionsStore.reset();
    vi.mocked(oneSaveClient.get).mockReset().mockResolvedValue(null);
    vi.mocked(oneSaveClient.put).mockReset().mockResolvedValue({} as never);
});
afterEach(() => { vi.useRealTimers(); });

describe('subscriptionsStore follows the login', () => {
    it('writes under the per-user key and isolates Andy from Lisa', () => {
        setPerUserIdentity(ANDY);
        saveSubscriptions(SEED);
        expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(SEED);
        setPerUserIdentity('u-lisa');
        expect(subscriptionsStore.getSnapshot().map((s) => s.id)).toContain('claude-max'); // shipped defaults, not Andy's list
        expect(subscriptionsStore.getSnapshot()).not.toEqual(SEED);
        setPerUserIdentity(ANDY);
        expect(subscriptionsStore.getSnapshot()).toEqual(SEED);
    });

    it('set() reaches the One Save path: debounced put of subscriptions_<userId>', async () => {
        setPerUserIdentity(ANDY);
        saveSubscriptions(SEED);
        await vi.advanceTimersByTimeAsync(800);
        const write = putFor(OBJECT_ID);
        expect(write).toEqual(expect.objectContaining({ id: OBJECT_ID, type: 'subscriptions', ownerId: ANDY }));
        expect(write?.payload).toEqual(SEED);
    });

    it('existing device-local subscriptions survive (same key, adopted not reset) and backfill on login', async () => {
        localStorage.setItem(KEY, JSON.stringify(SEED));
        setPerUserIdentity(ANDY);
        expect(subscriptionsStore.getSnapshot()).toEqual(SEED);
        await oneSaveSync.bootstrap(ANDY); // nothing remote → migrate() backfills the local value
        expect(subscriptionsStore.getSnapshot()).toEqual(SEED);
        expect(putFor(OBJECT_ID)?.payload).toEqual(SEED);
    });

    it('a fresh machine hydrates the account value on login', async () => {
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => (id === OBJECT_ID ? remote(SEED) : null));
        await oneSaveSync.bootstrap(ANDY);
        expect(subscriptionsStore.getSnapshot()).toEqual(SEED);
        expect(localStorage.getItem(KEY)).toContain('Claude Pro');
    });
});
