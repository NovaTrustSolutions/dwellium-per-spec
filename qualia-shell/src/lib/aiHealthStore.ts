/**
 * aiHealthStore — live AI-call health signal (assessment sweep 2026-06-12,
 * weakness #8: "no single contract for what a widget does with no model").
 *
 * llmClient's callLlm() chokepoint records every outcome here (success /
 * LlmError status). Widgets read it via useAIAvailability() — they never
 * track provider errors themselves. Zero imports (leaf module) so llmClient
 * can import it without a cycle.
 *
 * useSyncExternalStore-shaped per the repo's factory-store convention,
 * incl. the standing `.reset()` escape hatch.
 */

export interface AiFailure {
    provider: string;
    /** HTTP status of the failure; 429 = rate-limited (cooldown applies). */
    status: number;
    at: number;
}

export interface AiHealthSnapshot {
    lastFailure: AiFailure | null;
    consecutiveFailures: number;
    lastSuccessAt: number | null;
}

/** 429s suppress retries for this long (provider-respectful default). */
export const RATE_LIMIT_COOLDOWN_MS = 60_000;

const SERVER_SNAPSHOT: AiHealthSnapshot = { lastFailure: null, consecutiveFailures: 0, lastSuccessAt: null };

let current: AiHealthSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(): void {
    listeners.forEach((l) => l());
}

export const aiHealthStore = {
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    getSnapshot(): AiHealthSnapshot {
        return current;
    },
    getServerSnapshot(): AiHealthSnapshot {
        return SERVER_SNAPSHOT;
    },
    /** Standing convention: test escape hatch. */
    reset(): void {
        current = SERVER_SNAPSHOT;
        emit();
    },
};

/** Called by llmClient on every successful completion. */
export function recordAiSuccess(): void {
    current = { lastFailure: null, consecutiveFailures: 0, lastSuccessAt: Date.now() };
    emit();
}

/** Called by llmClient when a provider call throws. */
export function recordAiFailure(provider: string, status: number): void {
    current = {
        lastFailure: { provider, status, at: Date.now() },
        consecutiveFailures: current.consecutiveFailures + 1,
        lastSuccessAt: current.lastSuccessAt,
    };
    emit();
}

/** True while a recent 429 puts the active provider in cooldown. */
export function isRateLimited(snapshot: AiHealthSnapshot = current): boolean {
    const f = snapshot.lastFailure;
    return !!f && f.status === 429 && Date.now() - f.at < RATE_LIMIT_COOLDOWN_MS;
}
