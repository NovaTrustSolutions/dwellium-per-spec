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
    integrationsOwnerIdHolder,
    saveIntegrationsSecure,
    saveIntegrationsForceRemoval,
    clearIntegrations,
    stableIntegrationsOwnerId,
} from '../utils/integrationsStore';
import { usePerUserIdentity } from '../lib/perUserIdentity';
import type { IntegrationsBundle } from '../types/integrations';

export function useIntegrations() {
    // Use raw context (NOT useUser()) — useUser throws when no provider is
    // present (test environments, anonymous routes). Reading the context
    // directly lets useIntegrations degrade gracefully to the `_anonymous`
    // namespace when there's no user.
    const userCtx = useContext(UserContext);
    // Task C: the VAULT + at-rest crypto are keyed by the STABLE person id
    // (email-based) — NOT the login-path-dependent user.id — so the same human
    // reads/writes ONE namespace regardless of how they signed in. The stable
    // id lives in the PRIVATE integrationsOwnerIdHolder; the SHARED
    // integrationsUserIdHolder keeps the raw user.id because 7+ other stores
    // alias that object and write user.id into it during render — mixing
    // values there alternates dynamic-store keys mid-render and infinite-loops
    // React (#185, the dbcfe00 incident).
    const userId = stableIntegrationsOwnerId(userCtx?.user ?? null);

    // Update holders DURING render BEFORE useSyncExternalStore reads.
    // Factory cache invalidates automatically on key change → returns the
    // fresh per-person value without a separate re-init effect.
    integrationsOwnerIdHolder.current = userId;
    // Every per-user store's identity holder (llmUsage / goals / workspaces /
    // etc.) is set from ONE place here — no shared-mutable holder to churn.
    usePerUserIdentity();

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
