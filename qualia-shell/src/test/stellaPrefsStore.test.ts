/**
 * stellaPrefsStore follows the login (feat/settings-follow-login): Stella's
 * voice / ttsEnabled / humanize live under a per-USER key + One Save
 * write-through/hydrate, adopted once from the raw browser-wide keys
 * StellaAgent used to write, never resetting a value saved per-user.
 * Sister to araPrefsStore.test.ts (keying/adoption) + tagsPerUser.test.ts (sync).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));

import { oneSaveClient, type DwelliumObject } from '../lib/oneSaveClient';
import { oneSaveSync } from '../lib/oneSaveStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { DEFAULT_STELLA_PREFS, stellaPrefsStore, type StellaPrefs } from '../lib/stellaPrefsStore';

const ANDY = 'u-andy';
const OBJECT_ID = `stellaPrefs_${ANDY}`;
const KEY = `dwellium-stella-prefs:${ANDY}`;

function remote(payload: StellaPrefs): DwelliumObject<StellaPrefs> {
    return { id: OBJECT_ID, type: 'stellaPrefs', ownerId: ANDY, schema: 1, createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z', deletedAt: null, payload };
}

function putFor(id: string) {
    return vi.mocked(oneSaveClient.put).mock.calls.map(([o]) => o).find((o) => o.id === id);
}

beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    setPerUserIdentity(null);
    await oneSaveSync.bootstrap(null);
    stellaPrefsStore.reset();
    vi.mocked(oneSaveClient.get).mockReset().mockResolvedValue(null);
    vi.mocked(oneSaveClient.put).mockReset().mockResolvedValue({} as never);
    setPerUserIdentity(ANDY);
});
afterEach(() => { vi.useRealTimers(); });

describe('stellaPrefsStore follows the login', () => {
    it('defaults match StellaAgent legacy defaults', () => {
        expect(stellaPrefsStore.getSnapshot()).toEqual({ voice: 'openai-alloy', ttsEnabled: false, humanize: true });
        expect(DEFAULT_STELLA_PREFS).toEqual({ voice: 'openai-alloy', ttsEnabled: false, humanize: true });
    });

    it('adopts the raw legacy keys into a fresh per-user store and persists them on next write', () => {
        localStorage.setItem('dwellium-stella-voice', 'openai-nova');
        localStorage.setItem('dwellium-stella-tts', 'true');
        localStorage.setItem('dwellium-stella-humanize', 'false');
        setPerUserIdentity('u-fresh');
        expect(stellaPrefsStore.getSnapshot()).toEqual({ voice: 'openai-nova', ttsEnabled: true, humanize: false });
        stellaPrefsStore.set('ttsEnabled', false);
        expect(JSON.parse(localStorage.getItem('dwellium-stella-prefs:u-fresh')!)).toEqual({ voice: 'openai-nova', ttsEnabled: false, humanize: false });
        // raw keys untouched
        expect(localStorage.getItem('dwellium-stella-voice')).toBe('openai-nova');
        expect(localStorage.getItem('dwellium-stella-tts')).toBe('true');
        expect(localStorage.getItem('dwellium-stella-humanize')).toBe('false');
    });

    it('an existing per-user saved value wins over the legacy raw key', () => {
        localStorage.setItem('dwellium-stella-prefs:u-saved', JSON.stringify({ voice: 'mine', ttsEnabled: true }));
        localStorage.setItem('dwellium-stella-voice', 'stale');
        localStorage.setItem('dwellium-stella-tts', 'false');
        localStorage.setItem('dwellium-stella-humanize', 'false'); // field absent per-user -> adopted
        setPerUserIdentity('u-saved');
        expect(stellaPrefsStore.getSnapshot()).toEqual({ voice: 'mine', ttsEnabled: true, humanize: false });
    });

    it('isolates users: Lisa gets defaults, Andy keeps his voice', () => {
        stellaPrefsStore.set('voice', 'openai-echo');
        expect(JSON.parse(localStorage.getItem(KEY)!).voice).toBe('openai-echo');
        setPerUserIdentity('u-lisa');
        expect(stellaPrefsStore.getSnapshot().voice).toBe('openai-alloy');
        setPerUserIdentity(ANDY);
        expect(stellaPrefsStore.getSnapshot().voice).toBe('openai-echo');
    });

    it('set() reaches the One Save path: debounced put of stellaPrefs_<userId>', async () => {
        stellaPrefsStore.set('voice', 'openai-shimmer');
        await vi.advanceTimersByTimeAsync(800);
        const write = putFor(OBJECT_ID);
        expect(write).toEqual(expect.objectContaining({ id: OBJECT_ID, type: 'stellaPrefs', ownerId: ANDY }));
        expect(write?.payload).toEqual({ voice: 'openai-shimmer', ttsEnabled: false, humanize: true });
    });

    it('a fresh machine hydrates the account value on login', async () => {
        const account: StellaPrefs = { voice: 'openai-fable', ttsEnabled: true, humanize: false };
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => (id === OBJECT_ID ? remote(account) : null));
        await oneSaveSync.bootstrap(ANDY);
        expect(stellaPrefsStore.getSnapshot()).toEqual(account);
        expect(localStorage.getItem(KEY)).toContain('openai-fable');
    });
});
