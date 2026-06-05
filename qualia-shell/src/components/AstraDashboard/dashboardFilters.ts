/**
 * dashboardFilters — global, centrally-applied cross-panel filters (DASH arc, Cycle 9).
 *
 * The Cycle-9 filter bar exposes two GLOBAL controls that act on every list
 * panel at once, applied here as a single pure function over `DashboardData`
 * BEFORE the data reaches the panels. Keeping the logic pure (no React, no
 * network) makes it unit-testable without a render, and keeps both controls a
 * strict no-op at their defaults so the dashboard is byte-identical when no
 * filter is active (reversible by construction).
 *
 *   - `query`        — case-insensitive substring match across each panel's
 *                      primary display text. Empty string = no-op.
 *   - `attentionOnly`— keep only the rows a PM-exec would act on (high
 *                      priority / at-risk status / overdue / high severity),
 *                      using fields every panel reliably carries. `false` = no-op.
 *
 * NOTE (logged in DASH_DECISIONS.md): a true *portfolio dropdown* filter is
 * intentionally NOT shipped here — the heatmap keys properties by display
 * `name` while the ops panels key by `propertyId`, and the data layer exposes
 * no shared id↔name map, so a dropdown would silently fail to filter half the
 * panels. The `query` field covers the honest subset (type a property name to
 * narrow the panels that surface it); a real dropdown is deferred to a future
 * data-layer (Cycle-2-altitude) change that adds a canonical property list.
 */
import type {
    DashboardData,
    HeatmapProperty, WatchdogItem, ComplianceSummaryItem, LegalMatter,
    MaintenanceWorkOrder, LeaseExpiration, VendorStatus, RiskRegisterItem,
    ActiveWorkitem, AgentLogEntry, DashCalendarEvent, DomainSnapshot, FinancialCard,
} from './dashboardData';

export interface GlobalFilters {
    /** Case-insensitive substring; '' disables the text filter. */
    query: string;
    /** When true, keep only attention-worthy rows; false disables it. */
    attentionOnly: boolean;
}

export const EMPTY_FILTERS: GlobalFilters = { query: '', attentionOnly: false };

/** True when at least one global filter would change the rendered rows. */
export function filtersActive(f: GlobalFilters): boolean {
    return f.query.trim().length > 0 || f.attentionOnly;
}

const HOT_PRIORITY = new Set(['critical', 'high', 'urgent']);
const AT_RISK_COMPLIANCE = new Set(['expired', 'missing', 'warning']);
const AT_RISK_VENDOR = new Set(['suspended', 'expired', 'terminated', 'pending']);

/** Lower-cased substring test; an empty needle always matches. */
function matches(needle: string, ...haystacks: (string | undefined | null)[]): boolean {
    const q = needle.trim().toLowerCase();
    if (!q) return true;
    return haystacks.some((h) => (h ?? '').toLowerCase().includes(q));
}

/**
 * A per-panel filter spec: how to extract searchable text from a row and
 * whether the row needs attention. `attention` is omitted for panels that
 * have no meaningful "needs action" axis (the attentionOnly toggle is then a
 * no-op for that panel, leaving its rows untouched).
 */
interface RowSpec<T> {
    text: (row: T) => string;
    attention?: (row: T) => boolean;
}

function filterRows<T>(rows: T[], spec: RowSpec<T>, f: GlobalFilters): T[] {
    return rows.filter((row) => {
        if (!matches(f.query, spec.text(row))) return false;
        if (f.attentionOnly && spec.attention && !spec.attention(row)) return false;
        return true;
    });
}

const heatmapSpec: RowSpec<HeatmapProperty> = {
    text: (p) => p.name,
    attention: (p) => p.delinquency > 5 || p.maintenance > 10 || p.occupancy < 85,
};
const watchdogSpec: RowSpec<WatchdogItem> = {
    text: (w) => `${w.title} ${w.property}`,
    attention: (w) => HOT_PRIORITY.has(w.priority.toLowerCase()),
};
const complianceSpec: RowSpec<ComplianceSummaryItem> = {
    text: (c) => `${c.label} ${c.entity}`,
    attention: (c) => AT_RISK_COMPLIANCE.has(c.status.toLowerCase()) || (c.daysUntil !== null && c.daysUntil < 0),
};
const legalSpec: RowSpec<LegalMatter> = {
    text: (m) => `${m.title} ${m.counsel}`,
    attention: (m) => HOT_PRIORITY.has(m.priority.toLowerCase())
        || (!!m.deadline && Date.parse(m.deadline) < Date.now()),
};
const maintenanceSpec: RowSpec<MaintenanceWorkOrder> = {
    text: (w) => w.title,
    attention: (w) => HOT_PRIORITY.has(w.priority.toLowerCase()) || (w.daysUntil !== null && w.daysUntil < 0),
};
const leaseSpec: RowSpec<LeaseExpiration> = {
    text: (l) => `${l.unit} ${l.tenant}`,
    attention: (l) => l.daysUntil !== null && l.daysUntil <= 30,
};
const vendorSpec: RowSpec<VendorStatus> = {
    text: (v) => v.vendor,
    attention: (v) => AT_RISK_VENDOR.has(v.status.toLowerCase()),
};
const riskSpec: RowSpec<RiskRegisterItem> = {
    text: (r) => `${r.title} ${r.status}`,
    attention: (r) => r.severity.toLowerCase() === 'high',
};
const workitemSpec: RowSpec<ActiveWorkitem> = {
    text: (w) => `${w.title} ${w.domain}`,
    attention: (w) => HOT_PRIORITY.has(w.priority.toLowerCase()),
};
// Text-only panels (attentionOnly is a no-op — no action axis).
const agentLogSpec: RowSpec<AgentLogEntry> = { text: (e) => `${e.action} ${e.agent}` };
const calendarSpec: RowSpec<DashCalendarEvent> = { text: (e) => e.label };
const domainSpec: RowSpec<DomainSnapshot> = { text: (d) => d.domain };
const financialCardSpec: RowSpec<FinancialCard> = { text: (c) => c.label };

/**
 * Apply the global filters to a loaded `DashboardData`, returning a new object
 * with the row arrays narrowed. Returns the input unchanged (same reference)
 * when `data` is null or no filter is active — so an inactive bar adds zero
 * work and zero re-render churn.
 */
export function applyGlobalFilters(
    data: DashboardData | null,
    f: GlobalFilters,
): DashboardData | null {
    if (data === null || !filtersActive(f)) return data;
    return {
        ...data,
        heatmap: filterRows(data.heatmap, heatmapSpec, f),
        watchdog: filterRows(data.watchdog, watchdogSpec, f),
        financialCards: filterRows(data.financialCards, financialCardSpec, f),
        calendarEvents: filterRows(data.calendarEvents, calendarSpec, f),
        agentLog: filterRows(data.agentLog, agentLogSpec, f),
        activeWorkitems: filterRows(data.activeWorkitems, workitemSpec, f),
        domainSnapshots: filterRows(data.domainSnapshots, domainSpec, f),
        complianceItems: filterRows(data.complianceItems, complianceSpec, f),
        legalMatters: filterRows(data.legalMatters, legalSpec, f),
        maintenanceQueue: filterRows(data.maintenanceQueue, maintenanceSpec, f),
        leaseExpirations: filterRows(data.leaseExpirations, leaseSpec, f),
        vendorStatus: filterRows(data.vendorStatus, vendorSpec, f),
        riskRegister: filterRows(data.riskRegister, riskSpec, f),
        // financeSnapshot + hr are single aggregates (no rows) — left intact.
    };
}

/** Count of rows visible across the filterable list panels — for the bar's match readout. */
export function visibleRowCount(data: DashboardData | null): number {
    if (data === null) return 0;
    return data.heatmap.length + data.watchdog.length + data.complianceItems.length
        + data.legalMatters.length + data.maintenanceQueue.length + data.leaseExpirations.length
        + data.vendorStatus.length + data.riskRegister.length + data.activeWorkitems.length
        + data.calendarEvents.length + data.agentLog.length + data.domainSnapshots.length
        + data.financialCards.length;
}
