/**
 * avatarProfilesStore — per-user, per-agent avatar profile persistence
 * (plan 041 — backendless avatar harness; plan 042 — keyless local provider).
 *
 * Replaces the plan-040 backend-mediated avatar-profile routes. Each
 * user has their own map of `agentId -> AvatarProfile` (avatarId, voiceId,
 * systemPrompt, displayName), stored locally and synced via One Save exactly
 * like `workspacesStore` / `tagsStore` (createLocalStorageStore dynamic-key
 * factory + `withSync`; F-015 single-writer discipline via
 * `avatarProfilesUserIdHolder` in perUserIdentity.ts).
 *
 * Plan 042 adds three fields for the keyless `LocalPhotoAvatarAdapter`:
 *   - `provider`: 'local' | 'anam', defaults to 'local' for any profile that
 *     predates this field (existing Anam profiles keep working — they just
 *     don't have `provider` set explicitly, and the harness treats a missing
 *     value the same as 'local' UNLESS an `avatarId` is already present, in
 *     which case it infers 'anam' — see `inferProvider()` below).
 *   - `photoDataUrl`: the local provider's source image, downscaled
 *     client-side (see `downscaleImageDataUrl`) BEFORE it ever reaches this
 *     store — One Save payload discipline (same reasoning as the ≤2MB budget
 *     documented in the plan).
 *   - `browserVoiceURI`: the local provider's chosen `SpeechSynthesisVoice`
 *     (matched by `.voiceURI`, not by index — indices are not stable across
 *     browser sessions).
 *
 * No secrets live here — none of these fields are sensitive, so (unlike
 * integrationsStore) this store is NOT encrypted at rest; it follows the
 * plain workspacesStore/tagsStore shape.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { avatarProfilesUserIdHolder } from './perUserIdentity';
import { withSync } from './oneSaveStore';

export type AvatarProviderKind = 'local' | 'anam';

export interface AvatarProfile {
    avatarId: string | null;
    voiceId: string | null;
    systemPrompt: string | null;
    displayName: string | null;
    /** Defaults to 'local' — see file header. */
    provider: AvatarProviderKind;
    /** Downscaled (≤768px longest edge) JPEG data URL — the local provider's source photo. */
    photoDataUrl: string | null;
    /** `SpeechSynthesisVoice.voiceURI` chosen for the local provider. Null = browser default. */
    browserVoiceURI: string | null;
    updatedAt: number;
}

/**
 * Legacy (pre-042) profiles have no `provider` field. Infer 'anam' only when
 * an avatarId is already present (a real Anam avatar was created under the
 * old flow) — every brand-new profile defaults to 'local' per plan 042.
 */
function inferProvider(p: Record<string, unknown>): AvatarProviderKind {
    if (p.provider === 'anam' || p.provider === 'local') return p.provider;
    return typeof p.avatarId === 'string' && p.avatarId ? 'anam' : 'local';
}

/** Per-user map of agentId -> profile. */
export type AvatarProfilesMap = Record<string, AvatarProfile>;

function resolveKey(): string {
    const uid = avatarProfilesUserIdHolder.current;
    return uid ? `avatar-profiles:${uid}` : 'avatar-profiles:_anonymous';
}

function isProfile(x: unknown): x is AvatarProfile {
    if (!x || typeof x !== 'object') return false;
    const p = x as Record<string, unknown>;
    return (
        (p.avatarId === null || typeof p.avatarId === 'string') &&
        (p.voiceId === null || typeof p.voiceId === 'string' || p.voiceId === undefined) &&
        (p.systemPrompt === null || typeof p.systemPrompt === 'string' || p.systemPrompt === undefined) &&
        (p.displayName === null || typeof p.displayName === 'string' || p.displayName === undefined)
    );
}

function normalizeProfile(x: unknown): AvatarProfile {
    const p = (x && typeof x === 'object') ? (x as Record<string, unknown>) : {};
    return {
        avatarId: typeof p.avatarId === 'string' ? p.avatarId : null,
        voiceId: typeof p.voiceId === 'string' ? p.voiceId : null,
        systemPrompt: typeof p.systemPrompt === 'string' ? p.systemPrompt : null,
        displayName: typeof p.displayName === 'string' ? p.displayName : null,
        provider: inferProvider(p),
        photoDataUrl: typeof p.photoDataUrl === 'string' ? p.photoDataUrl : null,
        browserVoiceURI: typeof p.browserVoiceURI === 'string' ? p.browserVoiceURI : null,
        updatedAt: Number(p.updatedAt) || Date.now(),
    };
}

/** The zero-value profile shape — used as the `existing` fallback in `save()` below. */
const EMPTY_PROFILE: Omit<AvatarProfile, 'updatedAt'> = {
    avatarId: null,
    voiceId: null,
    systemPrompt: null,
    displayName: null,
    provider: 'local',
    photoDataUrl: null,
    browserVoiceURI: null,
};

function deserialize(raw: string | null): AvatarProfilesMap {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const out: AvatarProfilesMap = {};
        for (const [agentId, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof agentId !== 'string' || !agentId) continue;
            if (isProfile(value) || (value && typeof value === 'object')) {
                out[agentId] = normalizeProfile(value);
            }
        }
        return out;
    } catch {
        return {};
    }
}

export const avatarProfilesStore = withSync(
    createLocalStorageStore<AvatarProfilesMap>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: {},
    }),
    { objectType: 'avatar-profiles', holder: avatarProfilesUserIdHolder, resolveKey },
);

function persist(map: AvatarProfilesMap): void {
    avatarProfilesStore.set(map, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(map)); } catch { /* sandboxed */ }
    });
}

/** Read the active user's full profiles map (reactive). */
export function useAvatarProfiles(): AvatarProfilesMap {
    return useSyncExternalStore(
        avatarProfilesStore.subscribe,
        avatarProfilesStore.getSnapshot,
        avatarProfilesStore.getServerSnapshot,
    );
}

/** Read + write a single agent's profile (reactive; the shape AvatarSetupPanel wants). */
export function useAvatarProfile(agentId: string): {
    profile: AvatarProfile | null;
    save: (patch: Partial<Omit<AvatarProfile, 'updatedAt'>>) => void;
} {
    const map = useAvatarProfiles();
    const profile = map[agentId] ?? null;

    const save = useCallback((patch: Partial<Omit<AvatarProfile, 'updatedAt'>>) => {
        const current = avatarProfilesStore.getSnapshot();
        const existing = current[agentId] ?? { ...EMPTY_PROFILE, updatedAt: 0 };
        const next: AvatarProfilesMap = {
            ...current,
            [agentId]: { ...existing, ...patch, updatedAt: Date.now() },
        };
        persist(next);
    }, [agentId]);

    return { profile, save };
}

/** Non-reactive read — used by AvatarHarness/AvatarSetupPanel effects that don't need re-renders on every keystroke. */
export function getAvatarProfile(agentId: string): AvatarProfile | null {
    return avatarProfilesStore.getSnapshot()[agentId] ?? null;
}
