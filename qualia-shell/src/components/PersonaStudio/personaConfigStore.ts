/**
 * personaConfigStore — per-user Persona Studio config persistence.
 *
 * Dynamic-key createLocalStorageStore (Phase-8+ Task 8.10 Option β), sister to
 * integrationsStore / savedLayoutsStore: Andy and Lisa each get their own
 * persona namespace, loaded on login and persisted across logout:
 *   persona-studio:user-andy-id → Andy's persona
 *   persona-studio:_anonymous   → no-auth fallback (tests / anon routes)
 *
 * Consumers must update `personaUserIdHolder.current` DURING render BEFORE
 * useSyncExternalStore reads (usePersonaConfig does this).
 */

import { useCallback, useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../../context/UserContext';
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { defaultPersonaConfig, type PersonaConfig } from './personaEngine';

export const personaUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = personaUserIdHolder.current;
    return uid ? `persona-studio:${uid}` : 'persona-studio:_anonymous';
}

function deserialize(raw: string | null): PersonaConfig {
    const defaults = defaultPersonaConfig();
    if (!raw) return defaults;
    try {
        const parsed = JSON.parse(raw);
        return {
            ...defaults,
            ...(parsed && typeof parsed === 'object' ? parsed : {}),
            tools: { ...defaults.tools, ...(parsed?.tools && typeof parsed.tools === 'object' ? parsed.tools : {}) },
            faceRegions: {
                ...defaults.faceRegions,
                ...(parsed?.faceRegions && typeof parsed.faceRegions === 'object' ? parsed.faceRegions : {}),
            },
            customTools: Array.isArray(parsed?.customTools) ? parsed.customTools : defaults.customTools,
            llmDisabled: parsed?.llmDisabled === undefined ? defaults.llmDisabled : !!parsed.llmDisabled,
            // Legacy-default migration (2026-07-06): 'browser-samantha' was the
            // shipped default nobody chose — upgrade it to 'auto' (best tier
            // available) UNLESS the user explicitly picked it (voiceUserPicked).
            voiceId: parsed?.voiceId === undefined ||
                (parsed.voiceId === 'browser-samantha' && parsed.voiceUserPicked !== true)
                ? defaults.voiceId
                : parsed.voiceId,
        };
    } catch {
        return defaults;
    }
}

export const personaConfigStore = createLocalStorageStore<PersonaConfig>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: defaultPersonaConfig(),
});

export function savePersonaConfig(next: PersonaConfig): void {
    if (typeof window === 'undefined') return;
    personaConfigStore.set(next, () => {
        try {
            localStorage.setItem(resolveKey(), JSON.stringify(next));
        } catch {
            /* storage full / sandboxed — in-memory cache still current */
        }
    });
}

/** Hook: read + patch the active user's persona config from any widget. */
export function usePersonaConfig() {
    const userCtx = useContext(UserContext);
    personaUserIdHolder.current = userCtx?.user?.id ?? null;

    const config = useSyncExternalStore(
        personaConfigStore.subscribe,
        personaConfigStore.getSnapshot,
        personaConfigStore.getServerSnapshot,
    );

    const patch = useCallback((partial: Partial<PersonaConfig>) => {
        savePersonaConfig({ ...personaConfigStore.getSnapshot(), ...partial });
    }, []);

    return { config, patch };
}
