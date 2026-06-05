/**
 * honchoAutoOpen — "always-on by default" open-once logic for the standalone
 * Honcho widget (Scribe-ingestion arc Cycle 8; decision D-5).
 *
 * "Always-on by default" = pinned (hierarchy.ts `dock-honcho` pinned:true,
 * Cycle 6) + opens by default. We implement "opens by default" as a ONE-TIME
 * auto-open on the first ready Desktop, gated by a localStorage flag so it
 * never fights a user who has closed it. Once the flag is set the widget will
 * not auto-reopen.
 *
 * Pure + SSR-safe: this module has NO top-level browser-global access. The
 * predicate takes the already-read flag value as an argument so it is trivially
 * unit-testable and never touches `window`/`localStorage` during module eval.
 * The Desktop effect (client-only, inside useEffect) is the sole caller that
 * reads/writes localStorage.
 *
 * To make Honcho reopen on EVERY session instead of once, change
 * `shouldAutoOpenHoncho` to `return true;` (one line) — see decision D-5.
 */

/** localStorage key recording that the one-time auto-open has fired. */
export const HONCHO_AUTO_OPEN_KEY = 'honcho:auto-open:v1';

/** Value written once the auto-open has fired. */
export const HONCHO_AUTO_OPEN_DONE = 'done';

/** Component id the auto-open opens (matches widgetRegistry + hierarchy). */
export const HONCHO_COMPONENT = 'honcho';

/**
 * Given the raw localStorage flag value, decide whether to auto-open Honcho.
 * Returns true only when the flag has not yet been set to "done".
 */
export function shouldAutoOpenHoncho(storedFlag: string | null): boolean {
    return storedFlag !== HONCHO_AUTO_OPEN_DONE;
}
