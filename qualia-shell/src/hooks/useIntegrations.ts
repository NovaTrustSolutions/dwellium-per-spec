/**
 * useIntegrations — hook to read + update the active user's integrations
 * bundle from any widget. Updates the dynamic-key holder DURING render so
 * useSyncExternalStore resolves the per-user namespace on the same pass.
 *
 * 2026-05-26 created. Pattern matches WindowContext's savedLayoutsStore /
 * savedLayoutsUserIdHolder (Phase-8+ Task 8.10 Option β).
 */

import { useCallback, useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../context/UserContext';
import {
    integrationsStore,
    integrationsUserIdHolder,
    saveIntegrationsSecure,
    saveIntegrationsForceRemoval,
    clearIntegrations,
} from '../utils/integrationsStore';
import type { IntegrationsBundle } from '../types/integrations';

export function useIntegrations() {
    // Use raw context (NOT useUser()) — useUser throws when no provider is
    // present (test environments, anonymous routes). Reading the context
    // directly lets useIntegrations degrade gracefully to the `_anonymous`
    // namespace when there's no user.
    const userCtx = useContext(UserContext);
    const userId = userCtx?.user?.id ?? null;

    // Update holder DURING render BEFORE useSyncExternalStore reads.
    // Factory cache invalidates automatically on key change → returns the
    // fresh per-user-id value without a separate re-init effect.
    integrationsUserIdHolder.current = userId;

    const bundle = useSyncExternalStore(
        integrationsStore.subscribe,
        integrationsStore.getSnapshot,
        integrationsStore.getServerSnapshot,
    );

    /**
     * Apply an updater function to the current bundle and persist. Use:
     *   update(b => ({ ...b, llm: { ...b.llm, active: 'openai' } }))
     */
    const update = useCallback((updater: (current: IntegrationsBundle) => IntegrationsBundle) => {
        const next = updater(bundle);
        void saveIntegrationsSecure(next, userId); // plaintext to memory now, ciphertext to disk async
    }, [bundle, userId]);

    /** Replace the bundle wholesale (used by import-from-JSON UI later). */
    const replace = useCallback((next: IntegrationsBundle) => {
        void saveIntegrationsSecure(next, userId);
    }, [userId]);

    /** Clear the active user's integrations entirely. */
    const clear = useCallback(() => {
        clearIntegrations();
    }, []);

    /**
     * Remove a single secret by applying `updater` to clear that field, then
     * FORCE-persisting through the anti-clobber guard. Use this (not `update`)
     * whenever the change empties a key — `update` → `saveIntegrationsSecure`
     * refuses to persist a now-secret-free bundle over stored ciphertext, so a
     * naive `update(b => ...apiKey:'')` would leave the encrypted key on disk.
     * Remaining providers' keys are re-encrypted and kept at rest.
     */
    const removeSecret = useCallback((updater: (current: IntegrationsBundle) => IntegrationsBundle) => {
        const next = updater(bundle);
        void saveIntegrationsForceRemoval(next, userId);
    }, [bundle, userId]);

    return { integrations: bundle, update, replace, clear, removeSecret };
}
