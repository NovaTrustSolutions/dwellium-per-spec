/**
 * Cycle 8 — Honcho "always-on by default" auto-open predicate.
 *
 * Pure logic test for the one-time auto-open gate (decision D-5). No React
 * render, no browser globals — the predicate takes the already-read flag value
 * as an argument so it is trivially testable and SSR-safe by construction.
 */
import { describe, it, expect } from 'vitest';
import {
    shouldAutoOpenHoncho,
    HONCHO_AUTO_OPEN_KEY,
    HONCHO_AUTO_OPEN_DONE,
    HONCHO_COMPONENT,
} from '../components/Shell/honchoAutoOpen';

describe('honchoAutoOpen', () => {
    it('auto-opens when the flag has never been set', () => {
        expect(shouldAutoOpenHoncho(null)).toBe(true);
    });

    it('does NOT auto-open once the flag is "done"', () => {
        expect(shouldAutoOpenHoncho(HONCHO_AUTO_OPEN_DONE)).toBe(false);
    });

    it('treats any other stored value as "not yet done" → auto-open', () => {
        // Defensive: a stale/garbage value should not silently suppress the
        // first open — only the exact done sentinel does.
        expect(shouldAutoOpenHoncho('1')).toBe(true);
        expect(shouldAutoOpenHoncho('')).toBe(true);
    });

    it('exposes stable key + component constants matching the registry', () => {
        expect(HONCHO_AUTO_OPEN_KEY).toBe('honcho:auto-open:v1');
        expect(HONCHO_COMPONENT).toBe('honcho');
        expect(HONCHO_AUTO_OPEN_DONE).toBe('done');
    });
});
