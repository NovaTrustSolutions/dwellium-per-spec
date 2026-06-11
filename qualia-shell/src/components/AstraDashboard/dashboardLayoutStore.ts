/**
 * dashboardLayoutStore — per-user persistence of the AstraDashboard panel
 * layout (which panels are shown + their order across the 3 columns).
 *
 * Cycle 4 (PM-exec dashboard arc, DASH-D2). Uses the dynamic-key
 * createLocalStorageStore signature (Phase-8+ Task 8.10 Option β) so each
 * user (Andy / Lisa / …) gets a separate namespace:
 *   qualia_dashboard_panels_<userId>
 *
 * Sister-shape to integrationsStore.ts / savedLayoutsStore: the storage key
 * resolves per-render from a module-level holder; the factory invalidates its
 * cache automatically when the holder changes. SSR-safe by construction —
 * getServerSnapshot returns DEFAULT_LAYOUT and no localStorage is touched on
 * the render path.
 *
 * The transform helpers (reconcileLayout / hidePanelIn / showPanelIn /
 * movePanelIn) are PURE functions exported for direct unit-testing — the hook
 * (useDashboardLayout) is a thin React adapter over them.
 */

import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export type DashboardColumn = 'left' | 'center' | 'right';
export const DASHBOARD_COLUMNS: DashboardColumn[] = ['left', 'center', 'right'];

export interface DashboardLayout {
    /** Ordered panel ids per column. Panels not present anywhere are hidden. */
    columns: Record<DashboardColumn, string[]>;
    /** Panel ids the user has explicitly removed from the canvas. */
    hidden: string[];
}

/**
 * Canonical default arrangement — must mirror the panel registry's
 * default column assignment in AstraDashboard.tsx. reconcileLayout() uses
 * this to (a) seed first-time users and (b) graft newly-introduced panels
 * onto an older stored layout.
 */
export const DEFAULT_LAYOUT: DashboardLayout = {
    columns: {
        left: ['heatmap', 'finance', 'domains'],
        center: ['watchdog', 'maintenance', 'litigation', 'leases', 'financials', 'research', 'workitems', 'domainviews'],
        right: ['calendar', 'compliance', 'vendors', 'risk', 'hr', 'agentlog', 'arbitrage'],
    },
    hidden: [],
};

/** All panel ids known to the default layout (the canonical universe). */
function defaultPanelIds(): string[] {
    return [
        ...DEFAULT_LAYOUT.columns.left,
        ...DEFAULT_LAYOUT.columns.center,
        ...DEFAULT_LAYOUT.columns.right,
        ...DEFAULT_LAYOUT.hidden,
    ];
}

/** Default column for a panel id (where reconcile re-homes orphaned ids). */
function defaultColumnFor(id: string): DashboardColumn {
    for (const col of DASHBOARD_COLUMNS) {
        if (DEFAULT_LAYOUT.columns[col].includes(id)) return col;
    }
    return 'left';
}

function emptyColumns(): Record<DashboardColumn, string[]> {
    return { left: [], center: [], right: [] };
}

/**
 * Reconcile a (possibly stale / partial) stored layout against the canonical
 * panel universe:
 *   - Drop ids that no longer exist in the registry.
 *   - De-dup ids that appear in more than one place (first wins).
 *   - Graft known ids missing from the stored layout onto their default
 *     column (so a panel added in a later release shows up for returning
 *     users without wiping their customisation).
 * Pure + total — never throws, always returns a valid DashboardLayout.
 */
export function reconcileLayout(
    stored: Partial<DashboardLayout> | null | undefined,
    universe: string[] = defaultPanelIds(),
): DashboardLayout {
    const known = new Set(universe);
    const seen = new Set<string>();
    const columns = emptyColumns();
    const hidden: string[] = [];

    const take = (ids: unknown): string[] =>
        Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];

    for (const col of DASHBOARD_COLUMNS) {
        for (const id of take(stored?.columns?.[col])) {
            if (known.has(id) && !seen.has(id)) {
                seen.add(id);
                columns[col].push(id);
            }
        }
    }
    for (const id of take(stored?.hidden)) {
        if (known.has(id) && !seen.has(id)) {
            seen.add(id);
            hidden.push(id);
        }
    }
    // Graft any known-but-unseen ids onto their default column.
    for (const id of universe) {
        if (!seen.has(id)) {
            seen.add(id);
            columns[defaultColumnFor(id)].push(id);
        }
    }
    return { columns, hidden };
}

/** Remove a panel from its column → hidden. Returns a new layout. */
export function hidePanelIn(layout: DashboardLayout, id: string): DashboardLayout {
    const columns = { left: [...layout.columns.left], center: [...layout.columns.center], right: [...layout.columns.right] };
    let removed = false;
    for (const col of DASHBOARD_COLUMNS) {
        const i = columns[col].indexOf(id);
        if (i !== -1) { columns[col].splice(i, 1); removed = true; break; }
    }
    if (!removed) return layout;
    const hidden = layout.hidden.includes(id) ? layout.hidden : [...layout.hidden, id];
    return { columns, hidden };
}

/** Restore a hidden panel → appended to its default column. */
export function showPanelIn(layout: DashboardLayout, id: string): DashboardLayout {
    if (!layout.hidden.includes(id)) return layout;
    const columns = { left: [...layout.columns.left], center: [...layout.columns.center], right: [...layout.columns.right] };
    const col = defaultColumnFor(id);
    if (!columns[col].includes(id)) columns[col].push(id);
    return { columns, hidden: layout.hidden.filter(h => h !== id) };
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Move a visible panel within / across columns. up/down swap with the
 * neighbour in the same column; left/right move to the adjacent column
 * (appended at the end). No-op when the move isn't possible (top of column,
 * leftmost column, etc.). Returns a new layout.
 */
export function movePanelIn(layout: DashboardLayout, id: string, dir: MoveDirection): DashboardLayout {
    const columns = { left: [...layout.columns.left], center: [...layout.columns.center], right: [...layout.columns.right] };
    let fromCol: DashboardColumn | null = null;
    let idx = -1;
    for (const col of DASHBOARD_COLUMNS) {
        const i = columns[col].indexOf(id);
        if (i !== -1) { fromCol = col; idx = i; break; }
    }
    if (!fromCol) return layout;

    if (dir === 'up' || dir === 'down') {
        const arr = columns[fromCol];
        const swap = dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= arr.length) return layout;
        [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
        return { columns, hidden: layout.hidden };
    }

    const colIdx = DASHBOARD_COLUMNS.indexOf(fromCol);
    const targetIdx = dir === 'left' ? colIdx - 1 : colIdx + 1;
    if (targetIdx < 0 || targetIdx >= DASHBOARD_COLUMNS.length) return layout;
    const targetCol = DASHBOARD_COLUMNS[targetIdx];
    columns[fromCol].splice(idx, 1);
    columns[targetCol].push(id);
    return { columns, hidden: layout.hidden };
}

/* ───────────────────────────  STORE  ─────────────────────────── */

/** Holder updated by useDashboardLayout during render BEFORE the store reads. */
export const dashboardLayoutUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = dashboardLayoutUserIdHolder.current;
    return uid ? `qualia_dashboard_panels_${uid}` : 'qualia_dashboard_panels__anonymous';
}

function deserialize(raw: string | null): DashboardLayout {
    if (!raw) return reconcileLayout(null);
    try {
        return reconcileLayout(JSON.parse(raw));
    } catch {
        return reconcileLayout(null);
    }
}

export const dashboardLayoutStore = withSync(
    createLocalStorageStore<DashboardLayout>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: DEFAULT_LAYOUT,
    }),
    { objectType: 'dashboard-layout', holder: dashboardLayoutUserIdHolder, resolveKey },
);

/** Persist a layout to the active user's namespace. */
export function saveDashboardLayout(layout: DashboardLayout): void {
    if (typeof window === 'undefined') return;
    dashboardLayoutStore.set(layout, () => {
        try {
            localStorage.setItem(resolveKey(), JSON.stringify(layout));
        } catch {
            /* sandboxed / full — in-memory cache still current */
        }
    });
}

/** Reset the active user's layout back to DEFAULT_LAYOUT. */
export function resetDashboardLayout(): void {
    if (typeof window === 'undefined') return;
    dashboardLayoutStore.set(reconcileLayout(null), () => {
        try {
            localStorage.removeItem(resolveKey());
        } catch {
            /* sandboxed */
        }
    });
}
