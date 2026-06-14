/**
 * useActivation — read + update the active user's activation config (the
 * "create everything, activate any time" capabilities). Mirrors
 * useIntegrations: raw UserContext (degrades to _anonymous in tests), holder
 * updated DURING render so useSyncExternalStore resolves the per-user key.
 */
import { useCallback, useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../context/UserContext';
import {
    activationStore,
    activationUserIdHolder,
    saveActivation,
    type ActivationConfig,
} from '../lib/activationStore';

export function useActivation() {
    const userCtx = useContext(UserContext);
    activationUserIdHolder.current = userCtx?.user?.id ?? null;

    const config = useSyncExternalStore(
        activationStore.subscribe,
        activationStore.getSnapshot,
        activationStore.getServerSnapshot,
    );

    const update = useCallback((updater: (c: ActivationConfig) => ActivationConfig) => {
        saveActivation(updater(config));
    }, [config]);

    return { config, update };
}
