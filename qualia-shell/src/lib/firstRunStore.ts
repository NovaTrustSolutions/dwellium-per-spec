/**
 * firstRunStore — plan 046 F1 "Get to your first win" checklist state.
 *
 * Per-user One Save ('first-run'), morningBriefStore sister shape. `done` is
 * sticky: a step ticked once stays ticked even if the live signal later goes
 * away (key removed, property deleted). Session dismiss lives in
 * sessionStorage (reappears next tab/session); "Don't show again" is durable.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { firstRunUserIdHolder, usePerUserIdentity } from './perUserIdentity';
import { logFirstWin, resetOnboarding } from './onboardingStore';

export type FirstRunStep = 'key' | 'data' | 'ara';
export const FIRST_RUN_STEPS: readonly FirstRunStep[] = ['key', 'data', 'ara'];

export interface FirstRunState {
    neverShow: boolean;
    done: FirstRunStep[];
}

/** sessionStorage flag for the per-session "Dismiss". */
export const FIRST_RUN_DISMISSED_SESSION_KEY = 'dwellium:first-run:dismissed';

export { firstRunUserIdHolder };

const EMPTY: FirstRunState = { neverShow: false, done: [] };

function resolveKey(): string {
    const uid = firstRunUserIdHolder.current;
    return uid ? `firstrun:${uid}` : 'firstrun:_anonymous';
}

function isStep(s: unknown): s is FirstRunStep {
    return (FIRST_RUN_STEPS as readonly unknown[]).includes(s);
}

function deserialize(raw: string | null): FirstRunState {
    if (!raw) return EMPTY;
    try {
        const parsed = JSON.parse(raw) as Partial<FirstRunState> | null;
        if (!parsed || typeof parsed !== 'object') return EMPTY;
        return {
            neverShow: parsed.neverShow === true,
            done: Array.isArray(parsed.done) ? parsed.done.filter(isStep) : [],
        };
    } catch {
        return EMPTY;
    }
}

export const firstRunStore = withSync(
    createLocalStorageStore<FirstRunState>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: EMPTY,
    }),
    { objectType: 'first-run', holder: firstRunUserIdHolder, resolveKey },
);

function persist(next: FirstRunState): void {
    firstRunStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function markDone(step: FirstRunStep): void {
    const s = firstRunStore.getSnapshot();
    if (s.done.includes(step)) return;
    persist({ ...s, done: [...s.done, step] });
    logFirstWin(step); // plan 047 §7 metric: time-to-first-win (exactly once per step)
}

export function setNeverShow(): void {
    const s = firstRunStore.getSnapshot();
    if (s.neverShow) return;
    persist({ ...s, neverShow: true });
}

/** Test/escape-hatch reset — writes the empty default (no key deletion). */
export function resetFirstRun(): void {
    firstRunStore.reset();
    persist(EMPTY);
}

/** Plan 047 §6 — "Replay first-run" (ShortcutSheet): FirstRunCard listens and un-dismisses this session. */
export const FIRST_RUN_REPLAY_EVENT = 'dwellium:first-run:replay';

export function replayFirstRun(): void {
    resetOnboarding();
    resetFirstRun();
    try { sessionStorage.removeItem(FIRST_RUN_DISMISSED_SESSION_KEY); } catch { /* sandboxed */ }
    try { window.dispatchEvent(new CustomEvent(FIRST_RUN_REPLAY_EVENT)); } catch { /* SSR */ }
}

/** Pure: live signals OR sticky `done` → per-step ticks + count. */
export function deriveSteps(
    live: { hasLlm: boolean; hasData: boolean; araReplied: boolean },
    state: FirstRunState,
): { done: number; total: 3; steps: Array<{ id: FirstRunStep; done: boolean }> } {
    const steps: Array<{ id: FirstRunStep; done: boolean }> = [
        { id: 'key', done: live.hasLlm || state.done.includes('key') },
        { id: 'data', done: live.hasData || state.done.includes('data') },
        { id: 'ara', done: live.araReplied || state.done.includes('ara') },
    ];
    return { done: steps.filter(s => s.done).length, total: 3, steps };
}

/** Pure: false when never-show, all three done, or dismissed this session. */
export function shouldShowFirstRun(state: FirstRunState, sessionDismissed: boolean): boolean {
    if (state.neverShow || sessionDismissed) return false;
    return FIRST_RUN_STEPS.some(s => !state.done.includes(s));
}

/** Hook for the card. */
export function useFirstRun(): FirstRunState {
    // Single writer: sets every per-user holder to the active user.id at once.
    usePerUserIdentity();
    return useSyncExternalStore(
        firstRunStore.subscribe,
        firstRunStore.getSnapshot,
        firstRunStore.getServerSnapshot,
    );
}
