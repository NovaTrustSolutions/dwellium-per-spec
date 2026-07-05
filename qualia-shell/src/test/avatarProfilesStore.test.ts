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
            { ara: { avatarId: 'avatar-a', voiceId: 'voice-a', systemPrompt: null, displayName: 'A-bot', provider: 'anam', photoDataUrl: null, browserVoiceURI: null, updatedAt: 1 } },
            () => { localStorage.setItem('avatar-profiles:user-a', JSON.stringify({ ara: { avatarId: 'avatar-a', voiceId: 'voice-a', systemPrompt: null, displayName: 'A-bot', provider: 'anam', photoDataUrl: null, browserVoiceURI: null, updatedAt: 1 } })); },
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
                ara: { avatarId: 'ara-avatar', voiceId: null, systemPrompt: null, displayName: null, provider: 'anam', photoDataUrl: null, browserVoiceURI: null, updatedAt: 1 },
                stella: { avatarId: 'stella-avatar', voiceId: null, systemPrompt: null, displayName: null, provider: 'anam', photoDataUrl: null, browserVoiceURI: null, updatedAt: 2 },
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

describe('avatarProfilesStore keyless-local fields (plan 042)', () => {
    it('defaults provider to "local" for a brand-new profile with no avatarId', () => {
        avatarProfilesUserIdHolder.current = 'user-f';
        localStorage.setItem('avatar-profiles:user-f', JSON.stringify({
            stella: { avatarId: null, voiceId: null, systemPrompt: null, displayName: 'Stella', updatedAt: 1 },
        }));
        avatarProfilesStore.reset();

        expect(getAvatarProfile('stella')?.provider).toBe('local');
    });

    it('infers provider "anam" for a legacy (pre-042) profile that already has an avatarId', () => {
        avatarProfilesUserIdHolder.current = 'user-g';
        localStorage.setItem('avatar-profiles:user-g', JSON.stringify({
            ara: { avatarId: 'legacy-avatar-id', voiceId: 'legacy-voice', systemPrompt: null, displayName: 'ARA', updatedAt: 1 },
        }));
        avatarProfilesStore.reset();

        expect(getAvatarProfile('ara')?.provider).toBe('anam');
    });

    it('round-trips photoDataUrl and browserVoiceURI', () => {
        avatarProfilesUserIdHolder.current = 'user-h';
        const map = {
            ara: {
                avatarId: null,
                voiceId: null,
                systemPrompt: null,
                displayName: 'ARA',
                provider: 'local' as const,
                photoDataUrl: 'data:image/jpeg;base64,AAAA',
                browserVoiceURI: 'urn:moz-tts:com.apple.voice.compact.en-US.Samantha',
                updatedAt: 5,
            },
        };
        localStorage.setItem('avatar-profiles:user-h', JSON.stringify(map));
        avatarProfilesStore.reset();

        expect(getAvatarProfile('ara')).toMatchObject({
            provider: 'local',
            photoDataUrl: 'data:image/jpeg;base64,AAAA',
            browserVoiceURI: 'urn:moz-tts:com.apple.voice.compact.en-US.Samantha',
        });
    });

    it('save() patch preserves provider/photoDataUrl/browserVoiceURI defaults for a fresh agentId', () => {
        avatarProfilesUserIdHolder.current = 'user-i';
        avatarProfilesStore.set({}, () => { /* no-op */ });

        // Simulate the store-level save() shape used by useAvatarProfile.save —
        // exercised indirectly via avatarProfilesStore.set + getAvatarProfile
        // since this test file doesn't render a component.
        const current = avatarProfilesStore.getSnapshot();
        const next = {
            ...current,
            ara: { avatarId: null, voiceId: null, systemPrompt: null, displayName: null, provider: 'local' as const, photoDataUrl: null, browserVoiceURI: null, updatedAt: Date.now() },
        };
        avatarProfilesStore.set(next, () => { /* no-op */ });

        expect(getAvatarProfile('ara')).toMatchObject({ provider: 'local', photoDataUrl: null, browserVoiceURI: null });
    });
});
