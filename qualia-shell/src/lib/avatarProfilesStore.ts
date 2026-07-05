/**
 * avatarProfilesStore — per-user, per-agent avatar profile persistence
 * (plan 041 — backendless avatar harness).
 *
 * Replaces the plan-040 backend-mediated avatar-profile routes. Each
 * user has their own map of `agentId -> AvatarProfile` (avatarId, voiceId,
 * systemPrompt, displayName), stored locally and synced via One Save exactly
 * like `workspacesStore` / `tagsStore` (createLocalStorageStore dynamic-key
 * factory + `withSync`; F-015 single-writer discipline via
 * `avatarProfilesUserIdHolder` in perUserIdentity.ts).
 *
 * No secrets live here — avatarId/voiceId/systemPrompt/displayName are not
 * sensitive, so (unlike integrationsStore) this store is NOT encrypted at
 * rest; it follows the plain workspacesStore/tagsStore shape.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { avatarProfilesUserIdHolder } from './perUserIdentity';
import { withSync } from './oneSaveStore';

export interface AvatarProfile {
    avatarId: string | null;
    voiceId: string | null;
    systemPrompt: string | null;
    displayName: string | null;
    updatedAt: number;
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
        updatedAt: Number(p.updatedAt) || Date.now(),
    };
}

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
        const existing = current[agentId] ?? { avatarId: null, voiceId: null, systemPrompt: null, displayName: null, updatedAt: 0 };
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
