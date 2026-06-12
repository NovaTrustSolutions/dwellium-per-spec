/**
 * defaultStack — default startup workspace (Ilya, 2026-06-11).
 *
 * On the first launch with an EMPTY canvas, the One-Front-Door pinned set
 * (ARA · Strata · Scribe · Inbox Zero · Task Board — the sidebar PINNED
 * five) auto-opens tiled as the default workspace, via the existing
 * `dwellium:apply-space` bus (Desktop's spaces handler tiles 4+ widgets into
 * quadrants with overflow tabs).
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

/** The pinned One-Front-Door set (keep in sync with Sidebar PINNED). */
export const DEFAULT_STARTUP_STACK: ReadonlyArray<string> = [
    'ara-console',
    'strata-dashboard',
    'scribe',
    'inbox',
    'task-board',
];

/** Fire only when the flag is unset AND the canvas is empty. */
export function shouldOpenDefaultStack(storedFlag: string | null, openWindowCount: number): boolean {
    return storedFlag !== DEFAULT_STACK_DONE && openWindowCount === 0;
}
