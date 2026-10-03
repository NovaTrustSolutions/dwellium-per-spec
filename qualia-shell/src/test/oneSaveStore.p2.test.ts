/**
 * Plan 079 phase 2, part A — generic oneSaveStore behaviour behind the two new
 * opt-in options (`objectSuffix`, `acceptRemote`) and the hardening they need:
 *   A1 suffix in the object id (and what bootstrap matches on)
 *   A2 hydrate: objectId captured across the await
 *   A3 failed-write replay dies when the object changed
 *   A4 per-object "did hydrate see it?" memo (migrate never trusts another object's answer)
 *   A5 acceptRemote (non-merge only; after the dirty check; null keeps local + pushes it)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync, oneSaveSync, syncStatusStore } from '../lib/oneSaveStore';
import { oneSaveClient } from '../lib/oneSaveClient';
import type { DwelliumObject } from '../lib/oneSaveClient';
import { backendStatusStore } from '../lib/backendStatusStore';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        listAll: vi.fn(),
        putBatch: vi.fn().mockResolvedValue('unsupported'),
    },
}));

const TYPE = 'p2-board';

function obj(id: string, payload: unknown): DwelliumObject {
    return {
        id, type: TYPE, ownerId: 'user-1', schema: 1,
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
        deletedAt: null, payload,
    };
}

/** A string store whose localStorage key follows the live suffix, like a per-board store. */
function makeBoardStore(extra: Record<string, unknown> = {}) {
    const holder: { current: string | null } = { current: 'user-1' };
    const ref = { suffix: '__a' };
    const resolveKey = () => `${TYPE}:${holder.current}${ref.suffix}`;
    const base = createLocalStorageStore<string>({ key: resolveKey, deserializer: (raw) => raw ?? '', defaultValue: '' });
    const store = withSync(base, {
        objectType: TYPE, holder, resolveKey, debounceMs: 10,
        serialize: (v: string) => v, objectSuffix: () => ref.suffix, ...extra,
    });
    const setLocal = (v: string) => store.set(v, () => localStorage.setItem(resolveKey(), v));
    return { store, ref, resolveKey, setLocal };
}

const ID_A = `${TYPE}_user-1__a`;
const ID_B = `${TYPE}_user-1__b`;
const dirty = (id: string) => localStorage.getItem(`onesave:dirty:${id}`);

describe('oneSaveStore plan 079 p2 (objectSuffix / acceptRemote)', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
        for (const fn of [oneSaveClient.get, oneSaveClient.put, oneSaveClient.listAll]) vi.mocked(fn).mockReset();
        vi.mocked(oneSaveClient.putBatch).mockReset().mockResolvedValue('unsupported');
        syncStatusStore.reset();
        backendStatusStore.reset();
    });

    afterEach(async () => {
        await oneSaveSync.bootstrap(null); // later-registered stores must not auto-catch-up
        backendStatusStore.reset();
        vi.useRealTimers();
    });

    it('A1: the suffix is part of the object id that is written and that bootstrap matches', async () => {
        const { store, setLocal } = makeBoardStore();
        vi.mocked(oneSaveClient.put).mockImplementation(async (o) => obj(o.id, o.payload));

        setLocal('board A');
        await vi.advanceTimersByTimeAsync(10);
        expect(oneSaveClient.put).toHaveBeenCalledWith(expect.objectContaining({ id: ID_A, ownerId: 'user-1', payload: 'board A' }));
        expect(oneSaveSync.registeredObjectIds()).toContain(ID_A);

        // bootstrap hands this store ITS bulk-listed object (matched by suffix id), no per-store GET.
        vi.mocked(oneSaveClient.listAll).mockResolvedValue([obj(ID_A, 'bulk A'), obj(`${TYPE}_user-1`, 'legacy, no suffix')]);
        vi.mocked(oneSaveClient.get).mockClear();
        await oneSaveSync.bootstrap('user-1');
        expect(store.getSnapshot()).toBe('bulk A');
        expect(oneSaveClient.get).not.toHaveBeenCalledWith(ID_A);
    });

    it('A2: an objectId change during an in-flight GET means the payload is not applied', async () => {
        const { store, ref, resolveKey } = makeBoardStore();
        let resolveGet!: (v: DwelliumObject | null) => void;
        vi.mocked(oneSaveClient.get).mockReturnValue(new Promise((res) => { resolveGet = res; }));

        const hydrating = store.hydrate(); // about board A
        const keyA = resolveKey();
        ref.suffix = '__b';                // owner unchanged, board switched
        const keyB = resolveKey();
        resolveGet(obj(ID_A, 'A payload'));
        await hydrating;

        expect(store.getSnapshot()).toBe('');
        expect(localStorage.getItem(keyA)).toBeNull();
        expect(localStorage.getItem(keyB)).toBeNull();
    });

    describe('A3: failed write replay', () => {
        async function failBoardAWrite() {
            const ctx = makeBoardStore();
            vi.mocked(oneSaveClient.put).mockResolvedValue(null as unknown as DwelliumObject);
            ctx.setLocal('A value');
            await vi.advanceTimersByTimeAsync(10 + 500 + 1000);
            expect(backendStatusStore.getSnapshot().state).toBe('offline');
            expect(dirty(ID_A)).toBe('1');
            vi.mocked(oneSaveClient.put).mockReset().mockImplementation(async (o) => obj(o.id, o.payload));
            return ctx;
        }

        it('control: replays while the same object is still active', async () => {
            await failBoardAWrite();
            backendStatusStore.markOnline();
            await vi.advanceTimersByTimeAsync(10);
            expect(oneSaveClient.put).toHaveBeenCalledWith(expect.objectContaining({ id: ID_A, payload: 'A value' }));
        });

        it('review 2: a newer write supersedes the parked replay of an older failed one (no rollback)', async () => {
            const { ref, setLocal } = await failBoardAWrite();   // A1 failed and is parked
            setLocal('A2');                                       // newer edit queued for A
            ref.suffix = '__b';                                   // user flips to B inside the debounce
            backendStatusStore.markOnline();                      // reconnect fires any parked replays
            await vi.advanceTimersByTimeAsync(10 + 500);
            const putsToA = vi.mocked(oneSaveClient.put).mock.calls.map(c => c[0]).filter(o => o.id === ID_A).map(o => o.payload);
            expect(putsToA[putsToA.length - 1]).toBe('A2');
            expect(putsToA).not.toContain('A1');
        });

        it('review: replays the captured payload to ITS OWN object after the suffix changed (never onto B)', async () => {
            const { ref } = await failBoardAWrite();
            ref.suffix = '__b';
            backendStatusStore.markOnline();
            await vi.advanceTimersByTimeAsync(10 + 500);
            expect(oneSaveClient.put).toHaveBeenCalledWith(expect.objectContaining({ id: ID_A, payload: 'A value' }));
            expect(oneSaveClient.put).not.toHaveBeenCalledWith(expect.objectContaining({ id: ID_B }));
            expect(dirty(ID_A)).toBeNull(); // saved → marker cleared
            expect(dirty(ID_B)).toBeNull();
        });
    });

    describe('A4: migrate after a hydrate of another object', () => {
        it('does its own existence check and does not clobber board B that exists remotely', async () => {
            const { store, ref } = makeBoardStore();
            vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => (id === ID_B ? obj(ID_B, 'B remote') : null));
            vi.mocked(oneSaveClient.put).mockImplementation(async (o) => obj(o.id, o.payload));

            await store.hydrate();          // A: confirmed absent remotely -> memo says "absent"
            ref.suffix = '__b';
            localStorage.setItem(`${TYPE}:user-1__b`, 'B local');
            vi.mocked(oneSaveClient.get).mockClear();

            await store.migrate();          // B: must ask the server about B
            expect(oneSaveClient.get).toHaveBeenCalledWith(ID_B);
            expect(oneSaveClient.put).not.toHaveBeenCalled();
        });

        it('backfills board B when it is absent even though A was seen present', async () => {
            const { store, ref } = makeBoardStore();
            vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => (id === ID_A ? obj(ID_A, 'A remote') : null));
            vi.mocked(oneSaveClient.put).mockImplementation(async (o) => obj(o.id, o.payload));

            await store.hydrate();          // A: present -> memo says "present"
            ref.suffix = '__b';
            localStorage.setItem(`${TYPE}:user-1__b`, 'B local');
            vi.mocked(oneSaveClient.get).mockClear();

            await store.migrate();
            expect(oneSaveClient.get).toHaveBeenCalledWith(ID_B);
            expect(oneSaveClient.put).toHaveBeenCalledWith(expect.objectContaining({ id: ID_B, payload: 'B local' }));
        });
    });

    describe('A5: acceptRemote', () => {
        it('null keeps local and schedules a write-through of the local snapshot', async () => {
            const accept = vi.fn(() => null);
            localStorage.setItem(`${TYPE}:user-1__a`, 'local board');
            const { store } = makeBoardStore({ acceptRemote: accept });
            vi.mocked(oneSaveClient.get).mockResolvedValue(obj(ID_A, 'remote board'));
            vi.mocked(oneSaveClient.put).mockImplementation(async (o) => obj(o.id, o.payload));

            await store.hydrate();
            expect(store.getSnapshot()).toBe('local board');
            expect(accept).toHaveBeenCalledWith('remote board', 'local board');
            await vi.advanceTimersByTimeAsync(10);
            expect(oneSaveClient.put).toHaveBeenCalledWith(expect.objectContaining({ id: ID_A, payload: 'local board' }));
        });

        it('a returned value is applied (and persisted locally) instead of the raw remote', async () => {
            localStorage.setItem(`${TYPE}:user-1__a`, 'L');
            const { store, resolveKey } = makeBoardStore({ acceptRemote: (r: unknown, l: string) => `${String(r)}+${l}` });
            vi.mocked(oneSaveClient.get).mockResolvedValue(obj(ID_A, 'R'));

            await store.hydrate();
            expect(store.getSnapshot()).toBe('R+L');
            expect(localStorage.getItem(resolveKey())).toBe('R+L');
        });

        it('runs AFTER the dirty-marker check: an unsaved local edit wins and acceptRemote is not called', async () => {
            const accept = vi.fn((r: unknown) => String(r));
            const { store, setLocal } = makeBoardStore({ acceptRemote: accept, debounceMs: 10_000 });
            setLocal('unsaved edit');       // marker set, flush far away
            vi.mocked(oneSaveClient.get).mockResolvedValue(obj(ID_A, 'stale remote'));

            await store.hydrate();
            expect(store.getSnapshot()).toBe('unsaved edit');
            expect(accept).not.toHaveBeenCalled();
        });

        it('is never called for a merge store', async () => {
            const accept = vi.fn(() => null);
            const { store } = makeBoardStore({ acceptRemote: accept, merge: (l: string, r: string) => `${l}|${r}` });
            vi.mocked(oneSaveClient.get).mockResolvedValue(obj(ID_A, 'R'));

            await store.hydrate();
            expect(accept).not.toHaveBeenCalled();
            expect(store.getSnapshot()).toBe('|R');
        });
    });

    it('regression: a store without either option behaves as before (plain id, remote replaces local, migrate trusts hydrate)', async () => {
        const holder: { current: string | null } = { current: 'user-1' };
        const resolveKey = () => `p2-plain:${holder.current}`;
        const store = withSync(
            createLocalStorageStore<string>({ key: resolveKey, deserializer: (raw) => raw ?? '', defaultValue: '' }),
            { objectType: 'p2-plain', holder, resolveKey, serialize: (v: string) => v },
        );
        vi.mocked(oneSaveClient.get).mockResolvedValue(obj('p2-plain_user-1', 'remote'));

        await store.hydrate();
        expect(oneSaveClient.get).toHaveBeenCalledWith('p2-plain_user-1');
        expect(store.getSnapshot()).toBe('remote');
        expect(localStorage.getItem(resolveKey())).toBe('remote');

        vi.mocked(oneSaveClient.get).mockClear();
        await store.migrate();
        expect(oneSaveClient.get).not.toHaveBeenCalled();
        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });
});

describe('oneSaveStore plan 079 p2 review: a reply older than a save that landed mid-GET', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
        for (const fn of [oneSaveClient.get, oneSaveClient.put, oneSaveClient.listAll]) vi.mocked(fn).mockReset();
        vi.mocked(oneSaveClient.putBatch).mockReset().mockResolvedValue('unsupported');
    });
    afterEach(async () => { vi.useRealTimers(); await oneSaveSync.bootstrap(null); });

    it('does not roll back an edit whose save landed while the GET was in flight', async () => {
        const { store, setLocal } = makeBoardStore();
        await oneSaveSync.bootstrap('user-1');
        vi.mocked(oneSaveClient.put).mockImplementation(async (o) => obj(o.id, o.payload));
        setLocal('NEW');                                   // unsaved: dirty marker set
        let release!: (v: DwelliumObject | null) => void;
        vi.mocked(oneSaveClient.get).mockImplementation(() => new Promise((r) => { release = r; }));
        const hydrating = store.hydrate();                 // GET leaves while NEW is unsaved
        await vi.advanceTimersByTimeAsync(10);             // NEW is saved; marker cleared
        expect(dirty(ID_A)).toBeNull();
        release(obj(ID_A, 'old'));                         // ...but the reply predates that save
        await hydrating;
        expect(store.getSnapshot()).toBe('NEW');
    });
});
