import { beforeEach, describe, expect, it } from 'vitest';
import { avatarProfilesUserIdHolder } from '../lib/perUserIdentity';
import { avatarProfilesStore, getAvatarProfile } from '../lib/avatarProfilesStore';

beforeEach(() => {
    localStorage.clear();
    avatarProfilesUserIdHolder.current = null;
    avatarProfilesStore.reset();
});

describe('avatarProfilesStore per-user isolation (plan 041)', () => {
    it('keeps profiles isolated by authenticated account id', () => {
        avatarProfilesUserIdHolder.current = 'user-a';
        avatarProfilesStore.set(
            { ara: { avatarId: 'avatar-a', voiceId: 'voice-a', systemPrompt: null, displayName: 'A-bot', updatedAt: 1 } },
            () => { localStorage.setItem('avatar-profiles:user-a', JSON.stringify({ ara: { avatarId: 'avatar-a', voiceId: 'voice-a', systemPrompt: null, displayName: 'A-bot', updatedAt: 1 } })); },
        );

        avatarProfilesUserIdHolder.current = 'user-b';
        expect(avatarProfilesStore.getSnapshot()).toEqual({});
        expect(getAvatarProfile('ara')).toBeNull();

        avatarProfilesUserIdHolder.current = 'user-a';
        expect(getAvatarProfile('ara')).toMatchObject({ avatarId: 'avatar-a', voiceId: 'voice-a', displayName: 'A-bot' });
        expect(localStorage.getItem('avatar-profiles:user-a')).toContain('avatar-a');
        expect(localStorage.getItem('avatar-profiles:user-b')).toBeNull();
    });

    it('round-trips a profile through JSON (deserialize survives reload)', () => {
        avatarProfilesUserIdHolder.current = 'user-c';
        const map = {
            stella: { avatarId: 'av-1', voiceId: 'v-1', systemPrompt: 'Be warm.', displayName: 'Stella', updatedAt: 42 },
        };
        localStorage.setItem('avatar-profiles:user-c', JSON.stringify(map));
        avatarProfilesStore.reset();

        expect(getAvatarProfile('stella')).toMatchObject({
            avatarId: 'av-1',
            voiceId: 'v-1',
            systemPrompt: 'Be warm.',
            displayName: 'Stella',
        });
    });

    it('multiple agents coexist independently under the same user', () => {
        avatarProfilesUserIdHolder.current = 'user-d';
        avatarProfilesStore.set(
            {
                ara: { avatarId: 'ara-avatar', voiceId: null, systemPrompt: null, displayName: null, updatedAt: 1 },
                stella: { avatarId: 'stella-avatar', voiceId: null, systemPrompt: null, displayName: null, updatedAt: 2 },
            },
            () => { /* no-op for this test */ },
        );

        expect(getAvatarProfile('ara')?.avatarId).toBe('ara-avatar');
        expect(getAvatarProfile('stella')?.avatarId).toBe('stella-avatar');
        expect(getAvatarProfile('unknown-agent')).toBeNull();
    });

    it('returns an empty map (never throws) for malformed localStorage content', () => {
        avatarProfilesUserIdHolder.current = 'user-e';
        localStorage.setItem('avatar-profiles:user-e', 'not json{{{');
        avatarProfilesStore.reset();
        expect(() => avatarProfilesStore.getSnapshot()).not.toThrow();
        expect(avatarProfilesStore.getSnapshot()).toEqual({});
    });
});
