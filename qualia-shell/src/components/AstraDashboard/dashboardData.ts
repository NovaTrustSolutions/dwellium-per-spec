/**
 * dashboardData — the PM-exec dashboard's data layer (DASH-D3).
 *
 * AstraDashboard's panels historically rendered from empty mock arrays
 * (`HEATMAP_PROPERTIES = []`, `WATCHDOG_ITEMS = []`, …). This module
 * replaces those stubs with typed fetchers that COMPOSE the existing
 * Strata data endpoints via `strataGet` — no fetch logic is duplicated
 * here, and the same call works in backend OR static mode (strataApi
 * routes transparently), so the offline CI gate stays green.
 *
 * Each fetcher returns a shape that maps 1:1 onto the panel array it
 * feeds, so Cycle 3 can drop the result straight into the existing
 * render code. Endpoints with no real source (HR) return a
 * clearly-labeled `{ mock: true, … }` shape (DASH-D5) instead of
 * pretending to be real.
 *
 * Testability (mirrors `workspaceScribe.ts`): the one side effect —
 * the network read — is injected as `deps.get`, defaulting to the real
 * `strataGet`. Unit tests pass a fake `get` and assert the normalization
 * + composition logic without a backend or a vi.mock of the module graph.
 *
 * Response-shape defensiveness (Cycle-1 plan §5 risk): Strata endpoints
 * variously return `T[]`, `{ data: T[] }`, or `{ entries, total }`.
 * `asArray` normalizes all three; every fetcher tolerates an empty seed
 * (invoices/incidents ship empty today) by degrading to an empty panel.
 */
import { strataGet } from '../StrataDashboard/strataApi';

/* ──────────────────────────── injectable deps ─────────────────────── */

export interface DashboardDataDeps {
    /** Read a Strata endpoint. Defaults to the real `strataGet`. */
    get: <T>(path: string, params?: Record<string, string>) => Promise<T>;
}

const defaultDeps: DashboardDataDeps = { get: strataGet };

/* ──────────────────────────── panel shapes ────────────────────────── */
/* These mirror the array element types in AstraDashboard.tsx so Cycle 3
 * can consume them without an adapter layer. */

export interface HeatmapProperty {
    name: string;
    /** 0–100 occupancy %. */
    occupancy: number;
    /** 0–100 delinquency %. */
    delinquency: number;
    /** open maintenance work-item count. */
    maintenance: number;
}

export interface WatchdogItem {
    id: string;
    title: string;
    priority: string;
    due: string;
    status: string;
    property: string;
}

export interface FinancialCard {
    label: string;
    value: string;
    change: string;
    trend: 'up' | 'down';
}

export interface DashCalendarEvent {
    day: number;
    type: string;
    label: string;
}

export interface AgentLogEntry {
    time: string;
    agent: string;
    action: string;
    type: string;
}

export interface ActiveWorkitem {
    id: string;
    title: string;
    priority: string;
    domain: string;
    age: string;
}

export interface DomainSnapshot {
    domain: string;
    count: number;
    critical: number;
    color: string;
}

export interface ComplianceSummaryItem {
    id: string;
    label: string;
    itemType: string;
    /** valid | tracked | warning | expired | missing | scheduled */
    status: string;
    entity: string;
    /** expirationDate (ISO/date-only) or '' when unknown. */
    due: string;
    /** Whole days from `now` to `due`; negative = overdue; null = no date. */
    daysUntil: number | null;
}

export interface LegalMatter {
    id: string;
    title: string;
    status: string;
    priority: string;
    /** dueDate (ISO/date-only) or '' — the matter deadline. */
    deadline: string;
    /** assignedTo (counsel) or '—'. */
    counsel: string;
}

export interface MaintenanceWorkOrder {
    id: string;
    title: string;
    priority: string;
    status: string;
    /** dueDate (ISO/date-only) or '' — when the work order is due. */
    due: string;
    /** Whole days from `now` to `due`; negative = overdue; null = no date. */
    daysUntil: number | null;
    /** propertyId (drill-down handoff target) or ''. */
    property: string;
    /** coarse "Nd"/"Nh" age label from createdAt. */
    age: string;
}

export interface LeaseExpiration {
    id: string;
    /** unit number/label. */
    unit: string;
    /** current tenant name or '—'. */
    tenant: string;
    /** propertyId (drill-down handoff target) or ''. */
    property: string;
    /** leaseEnd (ISO/date-only). */
    leaseEnd: string;
    /** Whole days from `now` to `leaseEnd`; negative = expired; null = no date. */
    daysUntil: number | null;
}

export interface VendorStatus {
    id: string;
    /** vendor entity name (joined from /entities) or the raw id. */
    vendor: string;
    /** active | suspended | pending | … (association status). */
    status: string;
    /** contractEnd (ISO/date-only) or '' when open-ended/unknown. */
    contractEnd: string;
    /** Whole days from `now` to `contractEnd`; negative = expired; null = no date. */
    daysUntil: number | null;
    /** propertyId (drill-down handoff target) or ''. */
    property: string;
}

/** HR has no backend endpoint today (Cycle-1 audit) → clearly-labeled mock. */
export interface HrSnapshot {
    mock: true;
    headcount: number;
    openRoles: number;
    incidents: number;
}

/* ──────────────────────────── raw row types ───────────────────────── */
/* Minimal field subsets of the seed shapes we actually read (verified
 * against public/data/*.json in Cycle 2). Kept local — the dashboard
 * only needs these fields, and a narrow type keeps the normalizers honest. */

interface PropertyRow {
    id: string;
    name?: string;
}
interface UnitRow {
    id?: string;
    propertyId?: string;
    unitNumber?: string;
    status?: string;
    rentAmount?: number | string;
    currentTenantId?: string | null;
    leaseEnd?: string | null;
}
interface VendorAssociationRow {
    id?: string;
    propertyId?: string;
    vendorId?: string;
    status?: string;
    contractEnd?: string | null;
}
interface VendorEntityRow {
    id?: string;
    name?: string;
    entityType?: string;
}
interface WorkitemRow {
    id: string;
    title?: string;
    status?: string;
    priority?: string;
    domain?: string;
    type?: string;
    propertyId?: string;
    assignedTo?: string | null;
    dueDate?: string;
    createdAt?: string;
}
interface AuditRow {
    userName?: string;
    userRole?: string;
    action?: string;
    entityType?: string;
    createdAt?: string;
}
interface ComplianceRow {
    id?: string;
    label?: string;
    itemType?: string;
    status?: string;
    entityName?: string | null;
    expirationDate?: string | null;
}
interface ForecastResultLike {
    summary?: {
        totalRevenue?: number;
        totalExpenses?: number;
        totalNet?: number;
        avgOccupancy?: number;
    };
}

/* ──────────────────────────── helpers ─────────────────────────────── */

/** Normalize `T[]` | `{ data: T[] }` | `{ entries: T[] }` | nullish → `T[]`. */
export function asArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object') {
        const obj = res as Record<string, unknown>;
        if (Array.isArray(obj.data)) return obj.data as T[];
        if (Array.isArray(obj.entries)) return obj.entries as T[];
    }
    return [];
}

const OPEN_STATUSES = new Set(['open', 'in_progress', 'pending', 'active', 'new', 'triage']);
function isOpen(status?: string): boolean {
    if (!status) return true;
    return OPEN_STATUSES.has(String(status).toLowerCase());
}

const HIGH_PRIORITIES = new Set(['critical', 'high', 'urgent']);
function isHighPriority(priority?: string): boolean {
    return HIGH_PRIORITIES.has(String(priority ?? '').toLowerCase());
}

/** Coarse "Nd" / "Nh" age label from an ISO created timestamp, vs `now`. */
export function ageLabel(createdAt: string | undefined, now: number): string {
    if (!createdAt) return '—';
    const t = Date.parse(createdAt);
    if (Number.isNaN(t)) return '—';
    const ms = Math.max(0, now - t);
    const hours = Math.floor(ms / 3_600_000);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

/** "HH:MM" clock label from an ISO timestamp (audit-log style). */
function timeLabel(createdAt: string | undefined): string {
    if (!createdAt) return '—';
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return '—';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Parse a date string to a local Date. Date-only `YYYY-MM-DD` strings
 * are constructed in LOCAL time (not UTC midnight) so the day-of-month
 * is stable regardless of the runner's timezone — compliance seed dates
 * are date-only, and the calendar grid is keyed on local day-of-month.
 */
function parseLocalDate(s: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(s);
}

function money(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
}

const DOMAIN_COLORS: Record<string, string> = {
    maintenance: '#f59e0b',
    compliance: '#ef4444',
    legal: '#8b5cf6',
    leasing: '#10b981',
    finance: '#3b82f6',
    operations: '#6b7280',
};
function domainColor(domain: string): string {
    return DOMAIN_COLORS[domain.toLowerCase()] ?? '#6b7280';
}

/**
 * Compliance status urgency rank (lower = more urgent) so the tracker
 * surfaces expired/missing items above healthy ones. Unknown statuses
 * sort last. Exported for the panel's sort + test pinning.
 */
const COMPLIANCE_STATUS_RANK: Record<string, number> = {
    expired: 0, missing: 1, warning: 2, scheduled: 3, tracked: 4, valid: 5,
};
export function complianceStatusRank(status: string | undefined): number {
    return COMPLIANCE_STATUS_RANK[String(status ?? '').toLowerCase()] ?? 9;
}

/**
 * Work-item priority urgency rank (lower = more urgent) so the maintenance
 * queue surfaces critical work orders above routine ones. Unknown sinks.
 * Exported for the panel's sort + test pinning (Cycle 6).
 */
const WORKITEM_PRIORITY_RANK: Record<string, number> = {
    critical: 0, urgent: 1, high: 2, medium: 3, normal: 3, low: 4,
};
export function workitemPriorityRank(priority: string | undefined): number {
    return WORKITEM_PRIORITY_RANK[String(priority ?? '').toLowerCase()] ?? 5;
}

/**
 * Vendor association status rank (lower = needs attention first): suspended /
 * expired surface above active/pending. Unknown sinks. Exported for test
 * pinning (Cycle 6).
 */
const VENDOR_STATUS_RANK: Record<string, number> = {
    suspended: 0, expired: 0, terminated: 0, pending: 1, active: 2,
};
export function vendorStatusRank(status: string | undefined): number {
    return VENDOR_STATUS_RANK[String(status ?? '').toLowerCase()] ?? 3;
}

/** Whole days from `now` to a date-only/ISO string; negative = overdue; null = no/invalid date. */
export function daysUntil(date: string | null | undefined, now: number): number | null {
    if (!date) return null;
    const d = parseLocalDate(date);
    if (Number.isNaN(d.getTime())) return null;
    return Math.round((d.getTime() - now) / 86_400_000);
}

/* ──────────────────────────── fetchers ────────────────────────────── */

/**
 * Portfolio heatmap: one row per property with occupancy % (occupied
 * units / total units), open-maintenance count, and delinquency %
 * (placeholder 0 until an invoices/delinquency endpoint carries real
 * data — invoices seed is empty today; kept as a real field so Cycle 7
 * can light it up without a shape change). Limited to `limit` rows.
 */
export async function fetchHeatmap(
    deps: DashboardDataDeps = defaultDeps,
    limit = 12,
): Promise<HeatmapProperty[]> {
    const [propsRes, unitsRes, workitemsRes] = await Promise.all([
        deps.get<unknown>('/properties'),
        deps.get<unknown>('/units'),
        deps.get<unknown>('/workitems', { type: 'maintenance' }),
    ]);
    const properties = asArray<PropertyRow>(propsRes);
    const units = asArray<UnitRow>(unitsRes);
    const maintenance = asArray<WorkitemRow>(workitemsRes).filter((w) => isOpen(w.status));

    return properties.slice(0, limit).map((p) => {
        const propUnits = units.filter((u) => u.propertyId === p.id);
        const occupied = propUnits.filter((u) => String(u.status).toLowerCase() === 'occupied').length;
        const occupancy = propUnits.length > 0 ? Math.round((occupied / propUnits.length) * 100) : 0;
        const maint = maintenance.filter((w) => w.propertyId === p.id).length;
        return {
            name: p.name ?? p.id,
            occupancy,
            delinquency: 0,
            maintenance: maint,
        };
    });
}

/**
 * Watchdog list: open, high-priority work-items needing exec attention,
 * newest-due first. Property column carries the propertyId until a name
 * join is wired (Cycle 6 drill-down). Limited to `limit` rows.
 */
export async function fetchWatchdog(
    deps: DashboardDataDeps = defaultDeps,
    limit = 20,
): Promise<WatchdogItem[]> {
    const res = await deps.get<unknown>('/workitems');
    const items = asArray<WorkitemRow>(res)
        .filter((w) => isOpen(w.status) && isHighPriority(w.priority))
        .sort((a, b) => Date.parse(a.dueDate ?? '') - Date.parse(b.dueDate ?? ''));
    return items.slice(0, limit).map((w) => ({
        id: w.id,
        title: w.title ?? '(untitled)',
        priority: String(w.priority ?? 'normal').toLowerCase(),
        due: w.dueDate ?? '',
        status: String(w.status ?? 'open').toLowerCase(),
        property: w.propertyId ?? '',
    }));
}

/**
 * Financial quick-viz cards from the `/forecast` projection summary:
 * NOI, revenue, expenses, occupancy. Trend is derived from the sign of
 * each metric (positive net → up). Returns [] if the projection is empty.
 */
export async function fetchFinancialCards(
    deps: DashboardDataDeps = defaultDeps,
): Promise<FinancialCard[]> {
    const res = await deps.get<ForecastResultLike>('/forecast');
    const s = res?.summary;
    if (!s) return [];
    const net = s.totalNet ?? 0;
    const revenue = s.totalRevenue ?? 0;
    const expenses = s.totalExpenses ?? 0;
    const occupancy = s.avgOccupancy ?? 0;
    return [
        { label: 'Net Operating Income', value: money(net), change: '', trend: net >= 0 ? 'up' : 'down' },
        { label: 'Projected Revenue', value: money(revenue), change: '', trend: 'up' },
        { label: 'Projected Expenses', value: money(expenses), change: '', trend: 'down' },
        { label: 'Avg Occupancy', value: `${occupancy}%`, change: '', trend: occupancy >= 90 ? 'up' : 'down' },
    ];
}

/**
 * Compliance calendar events for a given month: compliance items whose
 * `expirationDate` falls in (`year`, `month0`) become a due-date marker
 * keyed by day-of-month. `month0` is 0-based (Jan = 0) to match
 * `Date.getMonth()` and AstraDashboard's calendar grid.
 */
export async function fetchCalendarEvents(
    deps: DashboardDataDeps = defaultDeps,
    year?: number,
    month0?: number,
    now: number = Date.now(),
): Promise<DashCalendarEvent[]> {
    const ref = new Date(now);
    const y = year ?? ref.getFullYear();
    const m = month0 ?? ref.getMonth();
    const res = await deps.get<unknown>('/compliance');
    const rows = asArray<ComplianceRow>(res);
    const events: DashCalendarEvent[] = [];
    for (const r of rows) {
        if (!r.expirationDate) continue;
        const d = parseLocalDate(r.expirationDate);
        if (Number.isNaN(d.getTime())) continue;
        if (d.getFullYear() !== y || d.getMonth() !== m) continue;
        events.push({
            day: d.getDate(),
            type: String(r.itemType ?? 'compliance').toLowerCase(),
            label: r.label ?? r.itemType ?? 'Compliance item',
        });
    }
    return events;
}

/**
 * AI agent log from the `/audit` trail (returns `{ entries, total }`).
 * Newest first, limited to `limit` rows; "agent" is the acting user,
 * "type" the entity touched.
 */
export async function fetchAgentLog(
    deps: DashboardDataDeps = defaultDeps,
    limit = 12,
): Promise<AgentLogEntry[]> {
    const res = await deps.get<unknown>('/audit', { limit: String(limit) });
    const rows = asArray<AuditRow>(res);
    return rows.slice(0, limit).map((r) => ({
        time: timeLabel(r.createdAt),
        agent: r.userName ?? r.userRole ?? 'system',
        action: r.action ?? '',
        type: String(r.entityType ?? 'event').toLowerCase(),
    }));
}

/**
 * Active work-items list (all open items, any priority), newest first,
 * with a coarse age label. Limited to `limit` rows.
 */
export async function fetchActiveWorkitems(
    deps: DashboardDataDeps = defaultDeps,
    limit = 15,
    now: number = Date.now(),
): Promise<ActiveWorkitem[]> {
    const res = await deps.get<unknown>('/workitems');
    const items = asArray<WorkitemRow>(res)
        .filter((w) => isOpen(w.status))
        .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''));
    return items.slice(0, limit).map((w) => ({
        id: w.id,
        title: w.title ?? '(untitled)',
        priority: String(w.priority ?? 'normal').toLowerCase(),
        domain: String(w.domain ?? 'operations').toLowerCase(),
        age: ageLabel(w.createdAt, now),
    }));
}

/**
 * Cross-domain snapshots: open work-items grouped by `domain`, with a
 * critical-count and a stable per-domain color. Sorted by total desc.
 */
export async function fetchDomainSnapshots(
    deps: DashboardDataDeps = defaultDeps,
): Promise<DomainSnapshot[]> {
    const res = await deps.get<unknown>('/workitems');
    const items = asArray<WorkitemRow>(res).filter((w) => isOpen(w.status));
    const byDomain = new Map<string, { count: number; critical: number }>();
    for (const w of items) {
        const domain = String(w.domain ?? 'operations').toLowerCase();
        const agg = byDomain.get(domain) ?? { count: 0, critical: 0 };
        agg.count += 1;
        if (String(w.priority ?? '').toLowerCase() === 'critical') agg.critical += 1;
        byDomain.set(domain, agg);
    }
    return Array.from(byDomain.entries())
        .map(([domain, agg]) => ({ domain, count: agg.count, critical: agg.critical, color: domainColor(domain) }))
        .sort((a, b) => b.count - a.count);
}

/**
 * HR snapshot — clearly-labeled MOCK (DASH-D5). No HR endpoint exists in
 * the app today (Cycle-1 audit). Carries `mock: true` so the panel can
 * render a visible "Sample data" badge. Replace with a real fetcher if/
 * when an HR endpoint lands.
 */
export function fetchHrSnapshot(): HrSnapshot {
    return { mock: true, headcount: 0, openRoles: 0, incidents: 0 };
}

/**
 * Compliance tracker: filings / inspections / certs from `/compliance`,
 * most-urgent first (expired → missing → warning → …, then soonest
 * expiration). Each row carries a `daysUntil` for the panel's due badge.
 * Synthesises a stable id when the row lacks one. Limited to `limit` rows.
 */
export async function fetchComplianceItems(
    deps: DashboardDataDeps = defaultDeps,
    limit = 20,
    now: number = Date.now(),
): Promise<ComplianceSummaryItem[]> {
    const res = await deps.get<unknown>('/compliance');
    const rows = asArray<ComplianceRow>(res);
    const items = rows.map((r, i) => ({
        id: r.id ?? `compliance-${i}`,
        label: r.label ?? r.itemType ?? 'Compliance item',
        itemType: String(r.itemType ?? 'compliance').toLowerCase(),
        status: String(r.status ?? 'tracked').toLowerCase(),
        entity: r.entityName ?? '',
        due: r.expirationDate ?? '',
        daysUntil: daysUntil(r.expirationDate, now),
    }));
    items.sort((a, b) => {
        const byRank = complianceStatusRank(a.status) - complianceStatusRank(b.status);
        if (byRank !== 0) return byRank;
        // Within a status, soonest expiration first; undated rows sink.
        const da = a.daysUntil ?? Number.POSITIVE_INFINITY;
        const db = b.daysUntil ?? Number.POSITIVE_INFINITY;
        return da - db;
    });
    return items.slice(0, limit);
}

/**
 * Litigation / matter tracker: open legal work-items from `/workitems`
 * (domain = legal). The domain param is sent for backends that filter
 * server-side AND re-applied client-side so static-mode (param-blind)
 * reads stay correct. Earliest-deadline first; undated matters sink.
 * `counsel` is the assignee. Limited to `limit` rows.
 */
export async function fetchLegalMatters(
    deps: DashboardDataDeps = defaultDeps,
    limit = 20,
): Promise<LegalMatter[]> {
    const res = await deps.get<unknown>('/workitems', { domain: 'legal', limit: '500' });
    const items = asArray<WorkitemRow>(res)
        .filter((w) => String(w.domain ?? '').toLowerCase() === 'legal' && isOpen(w.status))
        .sort((a, b) => {
            const da = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
            const db = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
            return da - db;
        });
    return items.slice(0, limit).map((w) => ({
        id: w.id,
        title: w.title ?? '(untitled matter)',
        status: String(w.status ?? 'open').toLowerCase(),
        priority: String(w.priority ?? 'normal').toLowerCase(),
        deadline: w.dueDate ?? '',
        counsel: w.assignedTo ? String(w.assignedTo) : '—',
    }));
}

/**
 * Maintenance work-order queue: open `domain = maintenance` work-items from
 * `/workitems`, most-urgent first (priority rank, then soonest due date).
 * The domain param is sent for server-side filtering AND re-applied
 * client-side so static-mode (param-blind) reads stay correct (mirrors
 * fetchLegalMatters). Each row carries `daysUntil` + an age label. Limited
 * to `limit` rows.
 */
export async function fetchMaintenanceQueue(
    deps: DashboardDataDeps = defaultDeps,
    limit = 20,
    now: number = Date.now(),
): Promise<MaintenanceWorkOrder[]> {
    const res = await deps.get<unknown>('/workitems', { domain: 'maintenance', limit: '500' });
    const items = asArray<WorkitemRow>(res)
        .filter((w) => String(w.domain ?? '').toLowerCase() === 'maintenance' && isOpen(w.status))
        .sort((a, b) => {
            const byPrio = workitemPriorityRank(a.priority) - workitemPriorityRank(b.priority);
            if (byPrio !== 0) return byPrio;
            const da = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
            const db = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
            return da - db;
        });
    return items.slice(0, limit).map((w) => ({
        id: w.id,
        title: w.title ?? '(untitled work order)',
        priority: String(w.priority ?? 'normal').toLowerCase(),
        status: String(w.status ?? 'open').toLowerCase(),
        due: w.dueDate ?? '',
        daysUntil: daysUntil(w.dueDate, now),
        property: w.propertyId ?? '',
        age: ageLabel(w.createdAt, now),
    }));
}

/**
 * Lease expirations: units carrying a `leaseEnd` date, soonest-first (already
 * expired holdovers sort to the top — they're the most exec-relevant). The
 * panel applies a window filter (next 30/60/90 days / all) on `daysUntil`.
 * Synthesises a stable id when a unit lacks one. Limited to `limit` rows.
 */
export async function fetchLeaseExpirations(
    deps: DashboardDataDeps = defaultDeps,
    limit = 20,
    now: number = Date.now(),
): Promise<LeaseExpiration[]> {
    const res = await deps.get<unknown>('/units');
    const items = asArray<UnitRow>(res)
        .filter((u) => Boolean(u.leaseEnd) && !Number.isNaN(parseLocalDate(String(u.leaseEnd)).getTime()))
        .sort((a, b) => parseLocalDate(String(a.leaseEnd)).getTime() - parseLocalDate(String(b.leaseEnd)).getTime());
    return items.slice(0, limit).map((u, i) => ({
        id: u.id ?? `unit-${i}`,
        unit: u.unitNumber ?? u.id ?? '—',
        tenant: u.currentTenantId ? String(u.currentTenantId) : '—',
        property: u.propertyId ?? '',
        leaseEnd: u.leaseEnd ?? '',
        daysUntil: daysUntil(u.leaseEnd, now),
    }));
}

/**
 * Vendor / contract status: vendor associations from `/vendor-associations`,
 * joined to the vendor entity name via `/entities` (type = vendor). Sorted
 * by status urgency (suspended/expired first) then soonest contract end.
 * Synthesises a stable id when a row lacks one. Limited to `limit` rows.
 */
export async function fetchVendorStatus(
    deps: DashboardDataDeps = defaultDeps,
    limit = 20,
    now: number = Date.now(),
): Promise<VendorStatus[]> {
    const [assocRes, entitiesRes] = await Promise.all([
        deps.get<unknown>('/vendor-associations'),
        deps.get<unknown>('/entities', { type: 'vendor' }),
    ]);
    const assocs = asArray<VendorAssociationRow>(assocRes);
    const nameById = new Map<string, string>();
    for (const e of asArray<VendorEntityRow>(entitiesRes)) {
        if (e.id && e.name) nameById.set(e.id, e.name);
    }
    const rows = assocs.map((a, i) => ({
        id: a.id ?? `vendor-assoc-${i}`,
        vendor: (a.vendorId && nameById.get(a.vendorId)) || a.vendorId || '(unknown vendor)',
        status: String(a.status ?? 'unknown').toLowerCase(),
        contractEnd: a.contractEnd ?? '',
        daysUntil: daysUntil(a.contractEnd, now),
        property: a.propertyId ?? '',
    }));
    rows.sort((a, b) => {
        const byRank = vendorStatusRank(a.status) - vendorStatusRank(b.status);
        if (byRank !== 0) return byRank;
        const da = a.daysUntil ?? Number.POSITIVE_INFINITY;
        const db = b.daysUntil ?? Number.POSITIVE_INFINITY;
        return da - db;
    });
    return rows.slice(0, limit);
}

/* ──────────────────────────── aggregate loader ────────────────────── */

export interface DashboardData {
    heatmap: HeatmapProperty[];
    watchdog: WatchdogItem[];
    financialCards: FinancialCard[];
    calendarEvents: DashCalendarEvent[];
    agentLog: AgentLogEntry[];
    activeWorkitems: ActiveWorkitem[];
    domainSnapshots: DomainSnapshot[];
    complianceItems: ComplianceSummaryItem[];
    legalMatters: LegalMatter[];
    maintenanceQueue: MaintenanceWorkOrder[];
    leaseExpirations: LeaseExpiration[];
    vendorStatus: VendorStatus[];
    hr: HrSnapshot;
}

/**
 * Load every dashboard section in parallel with per-section error
 * isolation: a failing endpoint degrades that section to empty rather
 * than failing the whole dashboard (Cycle-3 panels render their own
 * empty state). `now` is injectable for deterministic tests.
 */
export async function loadDashboardData(
    deps: DashboardDataDeps = defaultDeps,
    now: number = Date.now(),
): Promise<DashboardData> {
    const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
        try {
            return await p;
        } catch {
            return fallback;
        }
    };
    const [
        heatmap,
        watchdog,
        financialCards,
        calendarEvents,
        agentLog,
        activeWorkitems,
        domainSnapshots,
        complianceItems,
        legalMatters,
        maintenanceQueue,
        leaseExpirations,
        vendorStatus,
    ] = await Promise.all([
        settle(fetchHeatmap(deps), []),
        settle(fetchWatchdog(deps), []),
        settle(fetchFinancialCards(deps), []),
        settle(fetchCalendarEvents(deps, undefined, undefined, now), []),
        settle(fetchAgentLog(deps), []),
        settle(fetchActiveWorkitems(deps, undefined, now), []),
        settle(fetchDomainSnapshots(deps), []),
        settle(fetchComplianceItems(deps, undefined, now), []),
        settle(fetchLegalMatters(deps), []),
        settle(fetchMaintenanceQueue(deps, undefined, now), []),
        settle(fetchLeaseExpirations(deps, undefined, now), []),
        settle(fetchVendorStatus(deps, undefined, now), []),
    ]);
    return {
        heatmap,
        watchdog,
        financialCards,
        calendarEvents,
        agentLog,
        activeWorkitems,
        domainSnapshots,
        complianceItems,
        legalMatters,
        maintenanceQueue,
        leaseExpirations,
        vendorStatus,
        hr: fetchHrSnapshot(),
    };
}
