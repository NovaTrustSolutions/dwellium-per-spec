/**
 * araPrefsStore voice fields (voice / gender / avatar / ttsEnabled / humanize /
 * sideWidth) — per-user + One Save synced; adopted once from the raw
 * browser-wide keys ARAConsole used to write, never resetting a value the
 * user already saved per-user.
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

describe('araPrefsStore voice prefs', () => {
    it('defaults match ARAConsole legacy defaults', () => {
        expect(araPrefsStore.getSnapshot()).toMatchObject({
            voice: 'female', gender: 'female', avatar: false, ttsEnabled: true, humanize: true, sideWidth: 380,
        });
        expect(DEFAULT_ARA_PREFS.sideWidth).toBe(380);
    });

    it('adopts the raw legacy keys into a fresh per-user store and persists them on next write', () => {
        localStorage.setItem('dwellium-ara-voice', 'cloned-abc');
        localStorage.setItem('dwellium-ara-gender', 'male');
        localStorage.setItem('dwellium-ara-avatar', 'true');
        localStorage.setItem('dwellium-ara-tts', 'false');
        localStorage.setItem('dwellium-ara-humanize', 'false');
        localStorage.setItem('dwellium-ara-side-w', '500');
        setPerUserIdentity('u-fresh');
        expect(araPrefsStore.getSnapshot()).toMatchObject({
            voice: 'cloned-abc', gender: 'male', avatar: true, ttsEnabled: false, humanize: false, sideWidth: 500,
        });
        araPrefsStore.set('holdToTalk', true);
        const saved = JSON.parse(localStorage.getItem('dwellium-ara-prefs:u-fresh')!);
        expect(saved).toMatchObject({ voice: 'cloned-abc', gender: 'male', sideWidth: 500, holdToTalk: true });
        expect(localStorage.getItem('dwellium-ara-voice')).toBe('cloned-abc'); // raw keys untouched
    });

    it('an existing per-user saved value wins over the legacy raw key', () => {
        localStorage.setItem('dwellium-ara-prefs:u-saved', JSON.stringify({ voice: 'mine', ttsEnabled: true, prefsVersion: 2 }));
        localStorage.setItem('dwellium-ara-voice', 'stale');
        localStorage.setItem('dwellium-ara-tts', 'false');
        localStorage.setItem('dwellium-ara-humanize', 'false'); // field absent per-user -> adopted
        setPerUserIdentity('u-saved');
        expect(araPrefsStore.getSnapshot()).toMatchObject({ voice: 'mine', ttsEnabled: true, humanize: false });
    });

    it('clamps sideWidth to 280..640 on read and write', () => {
        localStorage.setItem('dwellium-ara-side-w', '9999');
        setPerUserIdentity('u-wide');
        expect(araPrefsStore.getSnapshot().sideWidth).toBe(640);
        araPrefsStore.set('sideWidth', 10);
        expect(araPrefsStore.getSnapshot().sideWidth).toBe(280);
        araPrefsStore.patch({ sideWidth: NaN });
        expect(araPrefsStore.getSnapshot().sideWidth).toBe(380);
    });
});
