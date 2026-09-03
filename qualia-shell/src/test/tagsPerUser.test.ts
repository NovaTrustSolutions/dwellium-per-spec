/**
 * tagsStore follows the login (feat/settings-follow-login): per-USER key + One
 * Save write-through/hydrate, so Cmd/Ctrl+T tags are identical on every machine
 * after login. Existing device-local values are adopted, never reset.
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
import { addTag, tagsStore, type Tag } from '../lib/tagsStore';

const ANDY = 'u-andy';
const OBJECT_ID = `tags_${ANDY}`;
const KEY = `tags:${ANDY}`;
const SEED: Tag[] = [{ id: 'tag-1', name: 'Roof leak', projects: ['Stella'], content: 'unit 4B', source: 'selection', createdAt: 1 }];

function remote<T>(payload: T): DwelliumObject<T> {
    return { id: OBJECT_ID, type: 'tags', ownerId: ANDY, schema: 1, createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z', deletedAt: null, payload };
}

function putFor(id: string) {
    return vi.mocked(oneSaveClient.put).mock.calls.map(([o]) => o).find((o) => o.id === id);
}

beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    setPerUserIdentity(null);
    await oneSaveSync.bootstrap(null);
    tagsStore.reset();
    vi.mocked(oneSaveClient.get).mockReset().mockResolvedValue(null);
    vi.mocked(oneSaveClient.put).mockReset().mockResolvedValue({} as never);
});
afterEach(() => { vi.useRealTimers(); });

describe('tagsStore follows the login', () => {
    it('writes under the per-user key and isolates Andy from Lisa', () => {
        setPerUserIdentity(ANDY);
        addTag({ name: 'Roof leak', projects: ['Stella'], content: 'unit 4B', source: 'selection' });
        expect(JSON.parse(localStorage.getItem(KEY)!)[0].name).toBe('Roof leak');
        setPerUserIdentity('u-lisa');
        expect(tagsStore.getSnapshot()).toEqual([]);
        setPerUserIdentity(ANDY);
        expect(tagsStore.getSnapshot()[0].name).toBe('Roof leak');
    });

    it('set() reaches the One Save path: debounced put of tags_<userId>', async () => {
        setPerUserIdentity(ANDY);
        addTag({ name: 'Roof leak', projects: ['Stella'], content: 'unit 4B', source: 'selection' });
        await vi.advanceTimersByTimeAsync(800);
        const write = putFor(OBJECT_ID);
        expect(write).toEqual(expect.objectContaining({ id: OBJECT_ID, type: 'tags', ownerId: ANDY }));
        expect(JSON.stringify(write?.payload)).toContain('Roof leak');
    });

    it('existing device-local tags survive (same key, adopted not reset) and backfill on login', async () => {
        localStorage.setItem(KEY, JSON.stringify(SEED));
        setPerUserIdentity(ANDY);
        expect(tagsStore.getSnapshot()).toEqual(SEED);
        await oneSaveSync.bootstrap(ANDY); // nothing remote → migrate() backfills the local value
        expect(tagsStore.getSnapshot()).toEqual(SEED);
        expect(putFor(OBJECT_ID)?.payload).toEqual(SEED);
    });

    it('a fresh machine hydrates the account value on login', async () => {
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => (id === OBJECT_ID ? remote(SEED) : null));
        await oneSaveSync.bootstrap(ANDY);
        expect(tagsStore.getSnapshot()).toEqual(SEED);
        expect(localStorage.getItem(KEY)).toContain('Roof leak');
    });
});
