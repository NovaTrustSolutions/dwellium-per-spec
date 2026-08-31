/**
 * walkthroughStore — the interactive onboarding walkthrough (spotlight tour).
 *
 * Two pieces:
 * 1. A per-user One Save store ('walkthrough', firstRunStore sister shape)
 *    holding one durable flag: `done`. The tour auto-starts once per user on
 *    their first login (Classic layout only — see WalkthroughOverlay) and both
 *    Skip and Finish set `done`.
 * 2. An in-memory "session" store (`walkthroughActiveStore`) that the overlay
 *    publishes into while the tour runs, so the FirstRunCard and the System
 *    Health banner can hide (they crowd the spotlight — 055-P5 finding) and
 *    come back untouched when the tour ends. `spotlightFirstWin` is true on
 *    the final step, which points AT the first-win card — that step un-hides
 *    the card so there is something to point at.
 *
 * Replay: `replayWalkthrough()` dispatches WALKTHROUGH_REPLAY_EVENT (the
 * ShortcutSheet row and the ⌘K "walkthrough"/"tour" command both use it);
 * the overlay listens and reopens regardless of `done`.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { walkthroughUserIdHolder, usePerUserIdentity } from './perUserIdentity';

export interface WalkthroughState {
    done: boolean;
}

export { walkthroughUserIdHolder };

const EMPTY: WalkthroughState = { done: false };

function resolveKey(): string {
    const uid = walkthroughUserIdHolder.current;
    return uid ? `walkthrough:${uid}` : 'walkthrough:_anonymous';
}

function deserialize(raw: string | null): WalkthroughState {
    if (!raw) return EMPTY;
    try {
        const parsed = JSON.parse(raw) as Partial<WalkthroughState> | null;
        if (!parsed || typeof parsed !== 'object') return EMPTY;
        return { done: parsed.done === true };
    } catch {
        return EMPTY;
    }
}

export const walkthroughStore = withSync(
    createLocalStorageStore<WalkthroughState>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: EMPTY,
    }),
    { objectType: 'walkthrough', holder: walkthroughUserIdHolder, resolveKey },
);

function persist(next: WalkthroughState): void {
    walkthroughStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Skip and Finish both land here — the tour never auto-starts again. */
export function markWalkthroughDone(): void {
    if (walkthroughStore.getSnapshot().done) return;
    persist({ done: true });
}

/** Test/escape-hatch reset — writes the empty default (no key deletion). */
export function resetWalkthrough(): void {
    walkthroughStore.reset();
    persist(EMPTY);
}

/** Pure: auto-start only for a user who has never finished or skipped it. */
export function shouldAutoStartWalkthrough(state: WalkthroughState): boolean {
    return !state.done;
}

/** Hook for the overlay. Single identity writer first, then subscribe. */
export function useWalkthrough(): WalkthroughState {
    usePerUserIdentity();
    return useSyncExternalStore(
        walkthroughStore.subscribe,
        walkthroughStore.getSnapshot,
        walkthroughStore.getServerSnapshot,
    );
}

/* ── Replay entry points (ShortcutSheet row + ⌘K "walkthrough") ──────────── */

export const WALKTHROUGH_REPLAY_EVENT = 'dwellium:walkthrough-replay';

export function replayWalkthrough(): void {
    try { window.dispatchEvent(new CustomEvent(WALKTHROUGH_REPLAY_EVENT)); } catch { /* SSR */ }
}

/* ── In-memory tour-session store (suppression signal) ───────────────────── */

export interface WalkthroughActiveState {
    /** A tour is on screen right now. */
    active: boolean;
    /** The final step is up — it spotlights the first-win card, so the card must render. */
    spotlightFirstWin: boolean;
}

const INACTIVE: WalkthroughActiveState = { active: false, spotlightFirstWin: false };
let activeState: WalkthroughActiveState = INACTIVE;
const activeListeners = new Set<() => void>();

export const walkthroughActiveStore = {
    subscribe(listener: () => void): () => void {
        activeListeners.add(listener);
        return () => activeListeners.delete(listener);
    },
    getSnapshot(): WalkthroughActiveState {
        return activeState;
    },
    getServerSnapshot(): WalkthroughActiveState {
        return INACTIVE;
    },
    set(next: WalkthroughActiveState): void {
        if (next.active === activeState.active && next.spotlightFirstWin === activeState.spotlightFirstWin) return;
        activeState = next.active ? next : INACTIVE;
        activeListeners.forEach(l => l());
    },
    /** Standing convention: reset to defaults (tests). */
    reset(): void {
        this.set(INACTIVE);
    },
};

/** Hook for the suppressed chrome (FirstRunCard, SystemHealthBanner). */
export function useWalkthroughActive(): WalkthroughActiveState {
    return useSyncExternalStore(
        walkthroughActiveStore.subscribe,
        walkthroughActiveStore.getSnapshot,
        walkthroughActiveStore.getServerSnapshot,
    );
}
