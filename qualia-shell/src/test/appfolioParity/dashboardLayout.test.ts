/**
 * Cycle 4 (PM-exec dashboard arc) — dashboardLayoutStore unit tests.
 *
 * Covers the per-user composable-panel layout primitives:
 *   1. Pure transforms: reconcileLayout / hidePanelIn / showPanelIn / movePanelIn.
 *   2. Store contract: SSR getServerSnapshot, deserialize (incl. corruption +
 *      stale-schema reconciliation), per-user isolation, persistence round-trip.
 *
 * Pure synchronous assertions — no React render, no fake timers (Phase-7
 * Finding (B) convention). Per the v2.72.1 standing convention, the
 * factory-produced store is .reset() in beforeEach to avoid cross-test
 * module-cache pollution.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    dashboardLayoutStore,
    dashboardLayoutUserIdHolder,
    saveDashboardLayout,
    resetDashboardLayout,
    reconcileLayout,
    hidePanelIn,
    showPanelIn,
    movePanelIn,
    DEFAULT_LAYOUT,
    DASHBOARD_COLUMNS,
} from '../../components/AstraDashboard/dashboardLayoutStore';

beforeEach(() => {
    localStorage.clear();
    dashboardLayoutStore.reset();
    dashboardLayoutUserIdHolder.current = null;
});

/** Flatten all visible+hidden ids of a layout (order-insensitive set check). */
function allIds(layout: { columns: Record<string, string[]>; hidden: string[] }): string[] {
    return [...layout.columns.left, ...layout.columns.center, ...layout.columns.right, ...layout.hidden];
}

describe('Cycle 4 — reconcileLayout (pure)', () => {
    it('seeds the default layout from null', () => {
        expect(reconcileLayout(null)).toEqual(DEFAULT_LAYOUT);
    });

    it('drops unknown ids and de-dups repeated ids (first wins)', () => {
        const out = reconcileLayout({
            columns: { left: ['heatmap', 'bogus', 'heatmap'], center: [], right: [] },
            hidden: ['watchdog', 'also-bogus'],
        });
        // heatmap kept at head; 'bogus' dropped; the dup 'heatmap' collapsed.
        expect(out.columns.left[0]).toBe('heatmap');
        expect(out.columns.left.filter(x => x === 'heatmap')).toHaveLength(1);
        expect(out.hidden).toContain('watchdog');
        expect(allIds(out)).not.toContain('bogus');
        expect(allIds(out)).not.toContain('also-bogus');
        // and unknown ids never resurrect a known id more than once
        expect(allIds(out).sort()).toEqual(allIds(DEFAULT_LAYOUT).sort());
    });

    it('grafts known-but-missing ids onto their default column (stale-schema upgrade)', () => {
        // A stored layout that only knew about 2 panels still surfaces the rest.
        const out = reconcileLayout({
            columns: { left: ['finance'], center: ['watchdog'], right: [] },
            hidden: [],
        });
        // Every default panel id must be present exactly once.
        const ids = allIds(out).sort();
        const expected = allIds(DEFAULT_LAYOUT).sort();
        expect(ids).toEqual(expected);
        // finance kept its (non-default) position at the head of left.
        expect(out.columns.left[0]).toBe('finance');
        // heatmap (default-left) was grafted back into left.
        expect(out.columns.left).toContain('heatmap');
    });

    it('never throws on garbage shapes', () => {
        // @ts-expect-error intentional bad shape
        expect(() => reconcileLayout({ columns: 'nope', hidden: 42 })).not.toThrow();
        // @ts-expect-error intentional bad shape
        const out = reconcileLayout({ columns: 'nope', hidden: 42 });
        expect(allIds(out).sort()).toEqual(allIds(DEFAULT_LAYOUT).sort());
    });
});

describe('Cycle 4 — hide / show (pure)', () => {
    it('hidePanelIn removes from its column and adds to hidden', () => {
        const out = hidePanelIn(DEFAULT_LAYOUT, 'watchdog');
        expect(out.columns.center).not.toContain('watchdog');
        expect(out.hidden).toContain('watchdog');
    });

    it('hidePanelIn is a no-op for an unknown / already-hidden id', () => {
        const once = hidePanelIn(DEFAULT_LAYOUT, 'watchdog');
        const twice = hidePanelIn(once, 'watchdog');
        expect(twice).toEqual(once);
        expect(hidePanelIn(DEFAULT_LAYOUT, 'nope')).toEqual(DEFAULT_LAYOUT);
    });

    it('showPanelIn restores a hidden panel to its default column', () => {
        const hidden = hidePanelIn(DEFAULT_LAYOUT, 'agentlog');
        const restored = showPanelIn(hidden, 'agentlog');
        expect(restored.hidden).not.toContain('agentlog');
        expect(restored.columns.right).toContain('agentlog'); // agentlog's default col
    });

    it('hide → show round-trips id membership (positions may differ)', () => {
        const restored = showPanelIn(hidePanelIn(DEFAULT_LAYOUT, 'finance'), 'finance');
        expect(allIds(restored).sort()).toEqual(allIds(DEFAULT_LAYOUT).sort());
    });
});

describe('Cycle 4 — movePanelIn (pure)', () => {
    it('moves a panel down within its column', () => {
        const out = movePanelIn(DEFAULT_LAYOUT, 'heatmap', 'down');
        expect(out.columns.left).toEqual(['finance', 'heatmap', 'domains']);
    });

    it('moves a panel up within its column', () => {
        const out = movePanelIn(DEFAULT_LAYOUT, 'domains', 'up');
        expect(out.columns.left).toEqual(['heatmap', 'domains', 'finance']);
    });

    it('up at top / down at bottom is a no-op', () => {
        expect(movePanelIn(DEFAULT_LAYOUT, 'heatmap', 'up')).toEqual(DEFAULT_LAYOUT);
        expect(movePanelIn(DEFAULT_LAYOUT, 'domains', 'down')).toEqual(DEFAULT_LAYOUT);
    });

    it('moves a panel right into the next column (appended)', () => {
        const out = movePanelIn(DEFAULT_LAYOUT, 'heatmap', 'right');
        expect(out.columns.left).not.toContain('heatmap');
        expect(out.columns.center[out.columns.center.length - 1]).toBe('heatmap');
    });

    it('moves a panel left into the previous column (appended)', () => {
        const out = movePanelIn(DEFAULT_LAYOUT, 'watchdog', 'left');
        expect(out.columns.center).not.toContain('watchdog');
        expect(out.columns.left[out.columns.left.length - 1]).toBe('watchdog');
    });

    it('left from leftmost / right from rightmost is a no-op', () => {
        expect(movePanelIn(DEFAULT_LAYOUT, 'heatmap', 'left')).toEqual(DEFAULT_LAYOUT);
        expect(movePanelIn(DEFAULT_LAYOUT, 'calendar', 'right')).toEqual(DEFAULT_LAYOUT);
    });

    it('preserves the full panel universe across any move', () => {
        const out = movePanelIn(movePanelIn(DEFAULT_LAYOUT, 'heatmap', 'right'), 'watchdog', 'right');
        expect(allIds(out).sort()).toEqual(allIds(DEFAULT_LAYOUT).sort());
    });
});

describe('Cycle 4 — dashboardLayoutStore (SSR + persistence + per-user)', () => {
    it('getServerSnapshot returns DEFAULT_LAYOUT (no render-path localStorage read)', () => {
        expect(dashboardLayoutStore.getServerSnapshot()).toEqual(DEFAULT_LAYOUT);
    });

    it('first client read with no stored value yields the default', () => {
        dashboardLayoutUserIdHolder.current = 'user-andy';
        expect(dashboardLayoutStore.getSnapshot()).toEqual(DEFAULT_LAYOUT);
    });

    it('persists per active user and isolates namespaces (Andy ≠ Lisa)', () => {
        dashboardLayoutUserIdHolder.current = 'user-andy';
        saveDashboardLayout(hidePanelIn(dashboardLayoutStore.getSnapshot(), 'watchdog'));
        expect(dashboardLayoutStore.getSnapshot().hidden).toContain('watchdog');
        // Andy's choice is written under his namespaced key.
        expect(localStorage.getItem('qualia_dashboard_panels_user-andy')).toContain('watchdog');

        // Switch to Lisa — holder change invalidates cache → she sees the default.
        dashboardLayoutUserIdHolder.current = 'user-lisa';
        expect(dashboardLayoutStore.getSnapshot()).toEqual(DEFAULT_LAYOUT);

        // Back to Andy — his customisation survived.
        dashboardLayoutUserIdHolder.current = 'user-andy';
        expect(dashboardLayoutStore.getSnapshot().hidden).toContain('watchdog');
    });

    it('deserializes corrupt JSON to the reconciled default', () => {
        dashboardLayoutUserIdHolder.current = 'user-andy';
        localStorage.setItem('qualia_dashboard_panels_user-andy', '{not valid json');
        dashboardLayoutStore.reset();
        expect(dashboardLayoutStore.getSnapshot()).toEqual(DEFAULT_LAYOUT);
    });

    it('resetDashboardLayout clears the active user back to default', () => {
        dashboardLayoutUserIdHolder.current = 'user-andy';
        saveDashboardLayout(movePanelIn(dashboardLayoutStore.getSnapshot(), 'heatmap', 'down'));
        expect(dashboardLayoutStore.getSnapshot().columns.left[0]).toBe('finance');
        resetDashboardLayout();
        expect(dashboardLayoutStore.getSnapshot()).toEqual(DEFAULT_LAYOUT);
        expect(localStorage.getItem('qualia_dashboard_panels_user-andy')).toBeNull();
    });

    it('exposes all 3 columns in canonical order', () => {
        expect(DASHBOARD_COLUMNS).toEqual(['left', 'center', 'right']);
    });
});
