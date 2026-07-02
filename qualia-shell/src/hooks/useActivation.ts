/**
 * useActivation — read + update the active user's activation config (the
 * "create everything, activate any time" capabilities). Mirrors
 * useIntegrations: raw UserContext (degrades to _anonymous in tests), holder
 * updated DURING render so useSyncExternalStore resolves the per-user key.
 */
import { useCallback, useSyncExternalStore } from 'react';
import {
    activationStore,
    saveActivation,
    type ActivationConfig,
} from '../lib/activationStore';
import { usePerUserIdentity } from '../lib/perUserIdentity';

export function useActivation() {
    // Single writer: sets every per-user holder to the active user.id at once.
    usePerUserIdentity();

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
