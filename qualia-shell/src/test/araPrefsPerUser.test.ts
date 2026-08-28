/**
 * araPrefsStore is per-USER + One Save synced (2026-08-28, Ilya: "make linked
 * to user") — Andy's toggles never bleed into Lisa's, and the pre-per-user
 * device-local value is adopted once so an upgrade resets nobody.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), history: vi.fn() },
}));

import { araPrefsStore, DEFAULT_ARA_PREFS } from '../lib/araPrefsStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';

beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity('u-andy');
    araPrefsStore.reset();
});

describe('araPrefsStore per-user', () => {
    it('writes under the per-user key and isolates Andy from Lisa', () => {
        araPrefsStore.set('holdToTalk', true);
        expect(JSON.parse(localStorage.getItem('dwellium-ara-prefs:u-andy')!).holdToTalk).toBe(true);
        setPerUserIdentity('u-lisa');
        expect(araPrefsStore.getSnapshot().holdToTalk).toBe(false);
        araPrefsStore.set('showToolActivity', true);
        setPerUserIdentity('u-andy');
        expect(araPrefsStore.getSnapshot()).toMatchObject({ holdToTalk: true, showToolActivity: false });
    });

    it('adopts the legacy device-local value once (incl. the v2 streamTokens migration)', () => {
        localStorage.setItem('dwellium-ara-prefs', JSON.stringify({ streamTokens: false, introSeen: true }));
        setPerUserIdentity('u-fresh');
        const got = araPrefsStore.getSnapshot();
        expect(got.introSeen).toBe(true);          // adopted
        expect(got.streamTokens).toBe(true);       // v2 migration applied on adoption
        expect(got.prefsVersion).toBe(2);
    });

    it('anonymous (logged-out) reads fall back to a namespaced anonymous key with defaults', () => {
        setPerUserIdentity(null);
        expect(araPrefsStore.getSnapshot()).toEqual(DEFAULT_ARA_PREFS);
        araPrefsStore.set('introSeen', true);
        expect(JSON.parse(localStorage.getItem('dwellium-ara-prefs:_anonymous')!).introSeen).toBe(true);
    });
});
