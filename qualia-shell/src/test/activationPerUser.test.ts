/**
 * activationStore follows the login (feat/settings-follow-login): per-USER key
 * + One Save write-through/hydrate, so the Activation Center config is the same
 * on every machine after login. Existing device-local values are adopted (and
 * still normalized by the deserializer), never reset.
 * Sister to araPrefsPerUser.test.ts (keying) + accountResumeStores.test.ts (sync).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));

import { oneSaveClient, type DwelliumObject } from '../lib/oneSaveClient';
import { oneSaveSync } from '../lib/oneSaveStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { activationStore, emptyActivation, saveActivation, type ActivationConfig } from '../lib/activationStore';

const ANDY = 'u-andy';
const OBJECT_ID = `activation_${ANDY}`;
const KEY = `activation:${ANDY}`;
const SEED: ActivationConfig = { ...emptyActivation(), notifications: { enabled: true, morningBrief: true } };

function remote<T>(payload: T): DwelliumObject<T> {
    return { id: OBJECT_ID, type: 'activation', ownerId: ANDY, schema: 1, createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z', deletedAt: null, payload };
}

function putFor(id: string) {
    return vi.mocked(oneSaveClient.put).mock.calls.map(([o]) => o).find((o) => o.id === id);
}

beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    setPerUserIdentity(null);
    await oneSaveSync.bootstrap(null);
    activationStore.reset();
    vi.mocked(oneSaveClient.get).mockReset().mockResolvedValue(null);
    vi.mocked(oneSaveClient.put).mockReset().mockResolvedValue({} as never);
});
afterEach(() => { vi.useRealTimers(); });

describe('activationStore follows the login', () => {
    it('writes under the per-user key and isolates Andy from Lisa', () => {
        setPerUserIdentity(ANDY);
        saveActivation(SEED);
        expect(JSON.parse(localStorage.getItem(KEY)!).notifications.enabled).toBe(true);
        setPerUserIdentity('u-lisa');
        expect(activationStore.getSnapshot()).toEqual(emptyActivation());
        setPerUserIdentity(ANDY);
        expect(activationStore.getSnapshot()).toEqual(SEED);
    });

    it('set() reaches the One Save path: debounced put of activation_<userId>', async () => {
        setPerUserIdentity(ANDY);
        saveActivation(SEED);
        await vi.advanceTimersByTimeAsync(800);
        const write = putFor(OBJECT_ID);
        expect(write).toEqual(expect.objectContaining({ id: OBJECT_ID, type: 'activation', ownerId: ANDY }));
        expect(write?.payload).toEqual(SEED);
    });

    it('existing device-local config survives (same key, adopted + normalized, not reset) and backfills on login', async () => {
        // Partial pre-upgrade value: the deserializer still fills the missing capabilities.
        localStorage.setItem(KEY, JSON.stringify({ notifications: { enabled: true, morningBrief: true } }));
        setPerUserIdentity(ANDY);
        expect(activationStore.getSnapshot()).toEqual(SEED);
        await oneSaveSync.bootstrap(ANDY); // nothing remote → migrate() backfills the local value
        expect(activationStore.getSnapshot()).toEqual(SEED);
        expect(putFor(OBJECT_ID)?.payload).toEqual(SEED);
    });

    it('a fresh machine hydrates the account value on login', async () => {
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => (id === OBJECT_ID ? remote(SEED) : null));
        await oneSaveSync.bootstrap(ANDY);
        expect(activationStore.getSnapshot()).toEqual(SEED);
        expect(localStorage.getItem(KEY)).toContain('"morningBrief":true');
    });
});
