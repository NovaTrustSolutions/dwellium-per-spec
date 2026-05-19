/**
 * Phase-8+ Task 8.9 — Provider SSR-safety smoke tests
 *
 * Verifies the PROVIDER-SSR-REMEDIATION migration: ThemeProvider (4 stores)
 * + UserProvider (1 token store) migrated from useState lazy initializers
 * to useSyncExternalStore + getServerSnapshot per Cowork Verdict 3 LOCK.
 *
 * Test scope (per Cowork Verdict 6 — "+4 tests for getServerSnapshot
 * defaults"; extended to 5 to cover both providers):
 *
 *   1. themeStore.getServerSnapshot() === 'dark'
 *   2. fontPairingStore.getServerSnapshot() === 'default'
 *   3. accentColorStore.getServerSnapshot() === '#0088cc'
 *   4. animationsEnabledStore.getServerSnapshot() === true
 *   5. tokenStore.getServerSnapshot() === null
 *
 * These assertions are the SSR-safety contract: each store's
 * getServerSnapshot returns a documented default that matches:
 *   - The app/root.tsx::Layout FOUC IIFE-set className for theme
 *   - The unauthenticated initial state for token (server renders
 *     SecurityRoute / login screen; client hydrates with real token
 *     if present — Finding EE hydration-flash deferred to Task 8.11)
 *
 * Phase-7 Finding (B) convention preserved:
 *   - NO vi.useFakeTimers() — pure synchronous assertions
 *   - No React render needed — stores are module-level externalable
 */

import { describe, it, expect } from 'vitest';

import {
    themeStore,
    fontPairingStore,
    accentColorStore,
    animationsEnabledStore,
} from '../../context/ThemeContext';
import { tokenStore } from '../../context/UserContext';

describe('Phase-8+ Task 8.9 — Provider SSR-safety: getServerSnapshot contract', () => {
    it("themeStore.getServerSnapshot() returns 'dark' (matches app/root.tsx FOUC IIFE default)", () => {
        expect(themeStore.getServerSnapshot()).toBe('dark');
    });

    it("fontPairingStore.getServerSnapshot() returns 'default' (FONT_PAIRINGS[0].id)", () => {
        expect(fontPairingStore.getServerSnapshot()).toBe('default');
    });

    it("accentColorStore.getServerSnapshot() returns '#0088cc' (canonical accent default)", () => {
        expect(accentColorStore.getServerSnapshot()).toBe('#0088cc');
    });

    it('animationsEnabledStore.getServerSnapshot() returns true (animations-on default)', () => {
        expect(animationsEnabledStore.getServerSnapshot()).toBe(true);
    });

    it('tokenStore.getServerSnapshot() returns null (unauthenticated initial state)', () => {
        // Server renders auth-token=null → AuthGate renders SecurityRoute
        // (login screen) → client hydrates → if real token present,
        // useSyncExternalStore triggers re-render to DefaultRoute.
        // Hydration flash for authenticated users is Finding EE
        // (deferred to Task 8.11 architectural decision).
        expect(tokenStore.getServerSnapshot()).toBe(null);
    });
});
