/**
 * defaultStack — default startup workspace (Ilya, 2026-06-11; trimmed 2026-08-17
 * per plan 045 §B2: two windows, not five).
 *
 * On the first launch with an EMPTY canvas, ARA + Strata auto-open as the
 * default workspace via the existing `dwellium:apply-space` bus. The full
 * One-Front-Door pinned set (PINNED_WIDGETS below) stays one click away in
 * the sidebar's PINNED rail.
 *
 * One-time per browser (localStorage flag, honchoAutoOpen sister shape) AND
 * empty-canvas-guarded — a returning user's saved layout is never stomped:
 * WindowContext hydrates synchronously, so `openWindowCount > 0` on the
 * first Desktop effect for anyone with an existing layout.
 *
 * Pure + SSR-safe: no top-level browser globals; the predicate takes its
 * inputs as arguments (honchoAutoOpen pattern).
 */

/** localStorage key recording that the one-time default-stack open fired. */
export const DEFAULT_STACK_KEY = 'dwellium:default-stack:v1';

/** Value written once the auto-open has fired. */
export const DEFAULT_STACK_DONE = 'done';

export interface PinnedWidget {
    component: string;
    label: string;
    icon: string;
}

/**
 * The One-Front-Door pinned five — single source of truth for the sidebar's
 * PINNED rail (Sidebar.tsx) and for excluding these ids from the widget groups.
 */
export const PINNED_WIDGETS: ReadonlyArray<PinnedWidget> = [
    { component: 'ara-console', label: 'ARA', icon: 'brain-circuit' },
    { component: 'strata-dashboard', label: 'Strata', icon: 'building-2' },
    { component: 'scribe', label: 'Scribe', icon: 'pen-tool' },
    { component: 'inbox', label: 'Inbox Zero', icon: 'mail-open' },
    { component: 'task-board', label: 'Task Board', icon: 'layout-grid' },
];

/** First screen: ARA + Strata (the first two pinned) — plan 045 §B2. */
export const DEFAULT_STARTUP_STACK: ReadonlyArray<string> = PINNED_WIDGETS.slice(0, 2).map(p => p.component);

/** Fire only when the flag is unset AND the canvas is empty. */
export function shouldOpenDefaultStack(storedFlag: string | null, openWindowCount: number): boolean {
    return storedFlag !== DEFAULT_STACK_DONE && openWindowCount === 0;
}
