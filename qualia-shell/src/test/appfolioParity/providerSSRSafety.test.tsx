/**
 * Phase-8+ Task 8.9 + Task 8.10 — Provider SSR-safety smoke tests
 *
 * Verifies the PROVIDER-SSR-REMEDIATION migration across BOTH closes:
 *
 *   Task 8.9 baseline (5 stores):
 *     1. themeStore                   → 'dark'
 *     2. fontPairingStore             → 'default'
 *     3. accentColorStore             → '#0088cc'
 *     4. animationsEnabledStore       → true
 *     5. tokenStore                   → null
 *
 *   Task 8.10 extension (9 NEW stores per Cowork Q1 LOCK Option A
 *   scope-expansion at Step-7-entry HALT-IF #1 resolution; covers
 *   Sidebar.tsx 5 stores + LayoutContext + HierarchyContext +
 *   WindowContext × 2):
 *     6.  domainsCollapsedStore       → true (collapsed by default)
 *     7.  iconOnlyStore               → false (expanded by default)
 *     8.  sidebarGroupsStore          → empty Set
 *     9.  sidebarSplitStore           → 0.5 (50/50 split)
 *     10. sidebarWidthStore           → 240 (px)
 *     11. layoutSettingsStore         → DEFAULT_SETTINGS
 *     12. hierarchyStore              → defaultHierarchy
 *     13. dockItemsStore              → defaultDockItems
 *     14. savedLayoutsStore (DYNAMIC) → [] (factory Option β extension;
 *                                          getServerSnapshot returns
 *                                          defaultValue regardless of
 *                                          dynamic key resolver state)
 *
 * These assertions are the SSR-safety contract: each store's
 * getServerSnapshot returns a documented default that matches:
 *   - The app/root.tsx::Layout FOUC IIFE-set className for theme
 *   - The unauthenticated initial state for token (server renders
 *     SecurityRoute / login screen; client hydrates with real token
 *     if present — Finding EE hydration-flash deferred to Task 8.11)
 *   - The "no saved customizations" baseline for AdminShell-tree stores
 *     (server renders default UI shell; client hydrates with persisted
 *     state if present)
 *
 * Phase-7 Finding (B) convention preserved:
 *   - NO vi.useFakeTimers() — pure synchronous assertions
 *   - No React render needed — stores are module-level externalable
 *
 * Final count: 5 (Task 8.9) + 9 (Task 8.10) = 14 server-snapshot tests.
 * Per-task vitest delta: Task 8.9 +5; Task 8.10 +9 (= +1 vs Cowork
 * projection due to Q1 LOCK Option A Sidebar.tsx scope expansion from
 * 1 → 5 stores per HALT-IF #1 resolution).
 */

import { describe, it, expect } from 'vitest';

// Task 8.9 baseline stores
import {
    themeStore,
    fontPairingStore,
    accentColorStore,
    animationsEnabledStore,
} from '../../context/ThemeContext';
import { tokenStore } from '../../context/UserContext';

// Task 8.10 NEW stores
import {
    domainsCollapsedStore,
    iconOnlyStore,
    sidebarGroupsStore,
    sidebarSplitStore,
    sidebarWidthStore,
} from '../../components/Sidebar/Sidebar';
import { layoutSettingsStore } from '../../context/LayoutContext';
import { hierarchyStore } from '../../context/HierarchyContext';
import { dockItemsStore, savedLayoutsStore } from '../../context/WindowContext';

describe('Phase-8+ Task 8.9 — Provider SSR-safety: getServerSnapshot contract (baseline)', () => {
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

describe('Phase-8+ Task 8.10 — AdminShell-tree SSR-safety: getServerSnapshot contract (extension)', () => {
    it('domainsCollapsedStore.getServerSnapshot() returns true (Domains panel collapsed by default)', () => {
        expect(domainsCollapsedStore.getServerSnapshot()).toBe(true);
    });

    it('iconOnlyStore.getServerSnapshot() returns true (Sidebar icon-rail by default; one-click expand via »)', () => {
        expect(iconOnlyStore.getServerSnapshot()).toBe(true);
    });

    it('sidebarGroupsStore.getServerSnapshot() returns empty Set (all widget groups collapsed by default)', () => {
        const result = sidebarGroupsStore.getServerSnapshot();
        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    it('sidebarSplitStore.getServerSnapshot() returns 0.5 (50/50 split default)', () => {
        expect(sidebarSplitStore.getServerSnapshot()).toBe(0.5);
    });

    it('sidebarWidthStore.getServerSnapshot() returns 240 (canonical sidebar width default)', () => {
        expect(sidebarWidthStore.getServerSnapshot()).toBe(240);
    });

    it('layoutSettingsStore.getServerSnapshot() returns DEFAULT_SETTINGS (Inter font / 32px grid / halves-h regions)', () => {
        const result = layoutSettingsStore.getServerSnapshot();
        expect(result.fontFamily).toBe('Inter');
        expect(result.fontScale).toBe(1.0);
        expect(result.gridSize).toBe(32);
        expect(result.snapEnabled).toBe(true);
        expect(result.regionLayout).toBe('halves-h');
    });

    it('hierarchyStore.getServerSnapshot() returns deepCloned defaultHierarchy (empty seed; users build dynamically)', () => {
        const result = hierarchyStore.getServerSnapshot();
        expect(Array.isArray(result)).toBe(true);
        // defaultHierarchy at src/data/hierarchy.ts:9 is `[]` by design —
        // "Users build their own hierarchy dynamically." Server-render
        // snapshot must match the documented empty default.
        expect(result).toEqual([]);
    });

    it('dockItemsStore.getServerSnapshot() returns defaultDockItems (no localStorage / no DOCK_VERSION write on server)', () => {
        const result = dockItemsStore.getServerSnapshot();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
    });

    it('savedLayoutsStore.getServerSnapshot() returns [] (factory Option β dynamic-key extension; default regardless of user.id)', () => {
        // savedLayoutsStore uses the NEW { key: () => string, deserializer,
        // defaultValue } signature (factory Option β). getServerSnapshot
        // MUST return defaultValue ([]) without invoking the key resolver
        // (server has no user state; resolver would read holder.current
        // which is null at module-eval; SSR-safe by construction).
        expect(savedLayoutsStore.getServerSnapshot()).toEqual([]);
    });
});
