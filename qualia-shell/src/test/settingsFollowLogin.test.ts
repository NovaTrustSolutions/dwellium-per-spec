/**
 * personaWork / dictationHotkey / gridLock follow the login
 * (feat/settings-follow-login — Ilya: every setting identical on every machine).
 *
 * Mirrors araPrefsPerUser.test.ts, but with ONE_SAVE_ENABLED on so the One Save
 * write-through is proven rather than assumed. Per store: (1) per-user key,
 * (2) set() reaches oneSaveClient.put under the store's object type for the
 * active user, (3) an existing per-user value is adopted, never reset.
 * gridLock additionally (4) adopts the legacy device-global key once and never
 * deletes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));

import { oneSaveClient, type DwelliumObject } from '../lib/oneSaveClient';
import { addMemory, getWork, personaWorkStore, personaWorkUserIdHolder } from '../lib/agents/personaWorkStore';
import {
    DEFAULT_DICTATION_HOTKEY, dictationHotkeyStore, dictationUserIdHolder, setDictationHotkey,
} from '../lib/dictationHotkeyStore';
import { GRID_LOCK_KEY, gridLockStore, isGridLocked, setGridLocked } from '../utils/gridLockStore';
import { gridLockUserIdHolder, setPerUserIdentity } from '../lib/perUserIdentity';

const DEBOUNCE_MS = 800; // withSync default write-through debounce
const SAVED: DwelliumObject = {
    id: 'x', type: 'x', ownerId: 'u-andy', schema: 1,
    createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z', deletedAt: null, payload: null,
};
const HK_M = { altKey: false, ctrlKey: true, metaKey: false, shiftKey: true, code: 'KeyM' };

/** The same raw user.id into every holder — the single-writer contract. */
function login(uid: string | null): void {
    setPerUserIdentity(uid);
    personaWorkUserIdHolder.current = uid;
    dictationUserIdHolder.current = uid;
}

/** Flush the debounce and return the one durable write it produced. */
async function lastPut() {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
    return vi.mocked(oneSaveClient.put).mock.calls[0][0];
}

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    login('u-andy');
    personaWorkStore.reset();
    dictationHotkeyStore.reset();
    gridLockStore.reset();
    vi.mocked(oneSaveClient.put).mockReset().mockResolvedValue(SAVED);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('personaWorkStore follows the login', () => {
    it('writes under the per-user key and isolates Andy from Lisa', () => {
        addMemory('researcher', 'Always cite the statute');
        expect(localStorage.getItem('personawork:u-andy')).toContain('Always cite the statute');
        login('u-lisa');
        expect(getWork('researcher').memory).toHaveLength(0);
        login('u-andy');
        expect(getWork('researcher').memory[0].text).toBe('Always cite the statute');
    });

    it('set() reaches One Save as objectType personaWork for the active user', async () => {
        addMemory('researcher', 'Always cite the statute');
        const put = await lastPut();
        expect(put).toMatchObject({ id: 'personaWork_u-andy', type: 'personaWork', ownerId: 'u-andy' });
        expect(JSON.stringify(put.payload)).toContain('Always cite the statute');
    });

    it('adopts an existing per-user value instead of resetting it', () => {
        localStorage.setItem('personawork:u-andy', JSON.stringify({
            researcher: { memory: [{ id: 'm1', text: 'kept', kind: 'note', ts: 1 }], tasks: [], audit: [], usageCount: 3 },
        }));
        personaWorkStore.reset();
        expect(getWork('researcher')).toMatchObject({ usageCount: 3, memory: [{ text: 'kept' }] });
    });
});

describe('dictationHotkeyStore follows the login', () => {
    it('writes under the per-user key and isolates Andy from Lisa', () => {
        setDictationHotkey(HK_M);
        expect(JSON.parse(localStorage.getItem('dictation-hotkey:u-andy')!)).toMatchObject({ code: 'KeyM' });
        login('u-lisa');
        expect(dictationHotkeyStore.getSnapshot()).toEqual(DEFAULT_DICTATION_HOTKEY);
        login('u-andy');
        expect(dictationHotkeyStore.getSnapshot().code).toBe('KeyM');
    });

    it('set() reaches One Save as objectType dictationHotkey for the active user', async () => {
        setDictationHotkey(HK_M);
        expect(await lastPut()).toMatchObject({ id: 'dictationHotkey_u-andy', type: 'dictationHotkey', ownerId: 'u-andy', payload: HK_M });
    });

    it('adopts an existing per-user value instead of resetting it', () => {
        localStorage.setItem('dictation-hotkey:u-andy', JSON.stringify(HK_M));
        dictationHotkeyStore.reset();
        expect(dictationHotkeyStore.getSnapshot()).toEqual(HK_M);
    });
});

describe('gridLockStore follows the login', () => {
    it('writes under the per-user key (holder set by the single writer) and isolates Andy from Lisa', () => {
        expect(gridLockUserIdHolder.current).toBe('u-andy'); // pre-registered in perUserIdentity ALL_HOLDERS
        setGridLocked(true);
        expect(localStorage.getItem('dwellium:gridLocked:u-andy')).toBe('true');
        expect(localStorage.getItem(GRID_LOCK_KEY)).toBeNull(); // the legacy global key is never written
        login('u-lisa');
        expect(isGridLocked()).toBe(false);
        login('u-andy');
        expect(isGridLocked()).toBe(true);
    });

    it('set() reaches One Save as objectType gridLock for the active user', async () => {
        setGridLocked(true);
        expect(await lastPut()).toMatchObject({ id: 'gridLock_u-andy', type: 'gridLock', ownerId: 'u-andy', payload: true });
    });

    it('adopts an existing per-user value instead of resetting it (explicit false beats legacy true)', () => {
        localStorage.setItem('dwellium:gridLocked:u-andy', 'false');
        localStorage.setItem(GRID_LOCK_KEY, 'true');
        gridLockStore.reset();
        expect(isGridLocked()).toBe(false);
    });

    it('adopts the legacy device-global value once per user and never deletes it', () => {
        localStorage.setItem(GRID_LOCK_KEY, 'true');
        expect(isGridLocked()).toBe(true);                                        // adopted on first per-user read
        setGridLocked(false);
        expect(localStorage.getItem('dwellium:gridLocked:u-andy')).toBe('false');
        expect(localStorage.getItem(GRID_LOCK_KEY)).toBe('true');                 // legacy key untouched
        login('u-fresh');
        expect(isGridLocked()).toBe(true);                                        // next user on this device adopts it too
    });
});
