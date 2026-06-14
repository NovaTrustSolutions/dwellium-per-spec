/**
 * useAIAvailability — THE single contract for "what can AI do right now?"
 * (assessment sweep 2026-06-12, weakness #8).
 *
 * Composes three live signals:
 *   1. per-user LLM key state    (integrationsStore + hasActiveLlm)
 *   2. backend reachability      (backendStatusStore)
 *   3. live call health          (aiHealthStore — fed by llmClient's chokepoint)
 *
 * Verdicts:
 *   'ready'        — user key configured, no active failure state
 *   'backend-only' — no user key, but the backend is up (backend-routed AI ok)
 *   'rate-limited' — active provider 429'd within the cooldown window
 *   'erroring'     — ≥2 consecutive provider failures (keys/network suspect)
 *   'unavailable'  — no key AND backend offline (no model path at all)
 *
 * Widgets render <AIDegradedState> for anything ≠ 'ready' — never their own
 * ad-hoc banner. `configure()` deep-links to Control Panel via the typed bus.
 */

import { useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../context/UserContext';
import { integrationsStore, integrationsUserIdHolder } from '../utils/integrationsStore';
import { hasActiveLlm } from '../lib/llmClient';
import { backendStatusStore } from '../lib/backendStatusStore';
import { aiHealthStore, isRateLimited } from '../lib/aiHealthStore';
import { openWidgetBus } from '../lib/busChannels';

export type AiAvailabilityStatus =
    | 'ready'
    | 'backend-only'
    | 'rate-limited'
    | 'erroring'
    | 'unavailable';

export interface AiAvailability {
    status: AiAvailabilityStatus;
    /** True when SOME model path exists (user key or backend). */
    canCall: boolean;
    /** Human-readable reason for any non-'ready' status. */
    reason: string | null;
    /** Deep-link to Control Panel → API Keys. */
    configure: () => void;
}

function configure(): void {
    openWidgetBus.emit({ widgetId: 'control-panel' });
}

export function useAIAvailability(): AiAvailability {
    // Raw context, NOT useUser() — degrades to the _anonymous namespace in
    // tests/anonymous routes (repo convention; see useIntegrations.ts).
    const userCtx = useContext(UserContext);
    integrationsUserIdHolder.current = userCtx?.user?.id ?? null;

    const bundle = useSyncExternalStore(
        integrationsStore.subscribe,
        integrationsStore.getSnapshot,
        integrationsStore.getServerSnapshot,
    );
    const health = useSyncExternalStore(
        aiHealthStore.subscribe,
        aiHealthStore.getSnapshot,
        aiHealthStore.getServerSnapshot,
    );
    const backend = useSyncExternalStore(
        backendStatusStore.subscribe,
        backendStatusStore.getSnapshot,
        backendStatusStore.getServerSnapshot,
    );

    const hasKey = hasActiveLlm(bundle.llm);
    const backendUp = backend.state === 'online';

    if (isRateLimited(health)) {
        return {
            status: 'rate-limited',
            canCall: false,
            reason: `${health.lastFailure?.provider ?? 'Provider'} rate limit hit — cooling down before retrying.`,
            configure,
        };
    }
    if (hasKey && health.consecutiveFailures >= 2) {
        return {
            status: 'erroring',
            canCall: backendUp, // backend fallback may still work
            reason: `${health.lastFailure?.provider ?? 'Provider'} failing repeatedly (last status ${health.lastFailure?.status ?? '?'}). Check the key in Settings.`,
            configure,
        };
    }
    if (hasKey) {
        return { status: 'ready', canCall: true, reason: null, configure };
    }
    if (backendUp) {
        return {
            status: 'backend-only',
            canCall: true,
            reason: 'No personal AI key configured — using the backend’s model path.',
            configure,
        };
    }
    return {
        status: 'unavailable',
        canCall: false,
        reason: 'No AI key configured and the backend is unreachable.',
        configure,
    };
}
