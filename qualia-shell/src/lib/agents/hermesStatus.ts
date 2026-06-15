/**
 * hermesStatus — pure status model for the Hermes agent profile cards.
 *
 * Derives a green/yellow/red readiness tone for each persona from REAL state:
 *   - red    → provider/LLM not wired ("incorrect wiring" / no key)
 *   - yellow → a task is currently running; carries the task + an estimated
 *              completion computed from the persona's historical average
 *   - green  → wired and idle (ready to go)
 *
 * Kept dependency-light and side-effect-free so it can be unit-tested without
 * rendering or a store. The card component maps this to glow + copy.
 */
import type { PersonaTask, PersonaWork } from './personaWorkStore';
import { formatDuration } from './personaWorkStore';

export type StatusTone = 'green' | 'yellow' | 'red';

/** Provider readiness, sourced from the workspace's providerDetails(). */
export interface ProviderReadiness {
    ready: boolean;
    provider: string | null;
    fallback: boolean;
}

export interface PersonaStatus {
    tone: StatusTone;
    /** Short label for the status pill: "Ready" | "On task" | "Unavailable". */
    label: string;
    /** The running task (yellow only). */
    runningTask?: PersonaTask;
    /** Human ETA text (yellow only): "~3.2 s left" | "wrapping up…" | "estimating…". */
    etaText?: string;
    /** Absolute projected finish epoch-ms (yellow only, when estimable). */
    finishAt?: number;
    /** Why the agent is unavailable (red only). */
    hint?: string;
    /** Count of queued (todo) tasks waiting. */
    queued: number;
}

/** Average duration (ms) of this persona's completed tasks, or null if no history. */
export function averageTaskMs(work?: PersonaWork): number | null {
    if (!work) return null;
    const durations = work.tasks
        .filter(t => t.status === 'done' && typeof t.durationMs === 'number' && (t.durationMs as number) > 0)
        .map(t => t.durationMs as number);
    if (durations.length === 0) return null;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
}

/** Estimate completion for a running task from the persona's average duration. */
export function estimateCompletion(
    task: PersonaTask,
    avgMs: number | null,
    now: number = Date.now(),
): { etaText: string; finishAt?: number; remainingMs: number | null } {
    if (avgMs == null) return { etaText: 'estimating…', remainingMs: null };
    const started = task.startedAt ?? now;
    const finishAt = started + avgMs;
    const remaining = finishAt - now;
    if (remaining <= 0) return { etaText: 'wrapping up…', finishAt, remainingMs: 0 };
    return { etaText: `~${formatDuration(remaining)} left`, finishAt, remainingMs: remaining };
}

/** Compute the full status for a persona card. */
export function computePersonaStatus(
    readiness: ProviderReadiness,
    work: PersonaWork | undefined,
    now: number = Date.now(),
): PersonaStatus {
    const tasks = work?.tasks ?? [];
    const queued = tasks.filter(t => t.status === 'todo').length;

    if (!readiness.ready) {
        return {
            tone: 'red',
            label: 'Unavailable',
            hint: readiness.provider
                ? `${readiness.provider} key not configured`
                : 'No provider assigned — add an LLM key',
            queued,
        };
    }

    const running = tasks.find(t => t.status === 'running');
    if (running) {
        const { etaText, finishAt } = estimateCompletion(running, averageTaskMs(work), now);
        return { tone: 'yellow', label: 'On task', runningTask: running, etaText, finishAt, queued };
    }

    return { tone: 'green', label: 'Ready', queued };
}
