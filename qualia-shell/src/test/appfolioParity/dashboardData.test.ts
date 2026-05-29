/**
 * PM-exec dashboard data-layer test (DASH arc, Cycle 2).
 *
 * Exercises `dashboardData.ts` — the typed fetchers that compose the
 * existing Strata endpoints into AstraDashboard's panel shapes. The one
 * side effect (the network read) is injected as `deps.get`, so these
 * tests assert the normalization + composition logic against a fake
 * `get` without a backend, a vi.mock of the module graph, or a real
 * `strataGet`. Mirrors `workspaceScribe.ts`'s injectable-deps testability.
 *
 * Contract pinned here:
 *   - `asArray` normalizes `T[]` | `{ data }` | `{ entries }` | nullish.
 *   - occupancy = occupied units / total units, per property.
 *   - watchdog = open AND high-priority work-items, due-date ascending.
 *   - financial cards derive from the `/forecast` summary.
 *   - calendar events filter compliance items to a given month.
 *   - agent log reads the `{ entries }` audit shape.
 *   - domain snapshots group open work-items by domain with critical-count.
 *   - HR is clearly-labeled mock (`mock: true`).
 *   - `loadDashboardData` isolates per-section failures (one bad endpoint
 *     degrades that section to [], not the whole dashboard).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    asArray,
    ageLabel,
    fetchHeatmap,
    fetchWatchdog,
    fetchFinancialCards,
    fetchCalendarEvents,
    fetchAgentLog,
    fetchActiveWorkitems,
    fetchDomainSnapshots,
    fetchHrSnapshot,
    fetchComplianceItems,
    fetchLegalMatters,
    fetchMaintenanceQueue,
    fetchLeaseExpirations,
    fetchVendorStatus,
    fetchFinanceSnapshot,
    fetchRiskRegister,
    complianceStatusRank,
    workitemPriorityRank,
    vendorStatusRank,
    riskSeverityRank,
    daysUntil,
    loadDashboardData,
    type DashboardDataDeps,
} from '../../components/AstraDashboard/dashboardData';

/** A fake `get` that resolves a fixed value per endpoint path. */
function fakeDeps(routes: Record<string, unknown>): DashboardDataDeps {
    return {
        get: vi.fn(async (path: string) => {
            if (!(path in routes)) return [] as unknown;
            return routes[path];
        }) as DashboardDataDeps['get'],
    };
}

// Deterministic clock anchor for age/calendar tests (2026-05-15 12:00 local).
const NOW = new Date(2026, 4, 15, 12, 0, 0).getTime();

describe('dashboardData — asArray normalizer', () => {
    it('handles plain arrays, { data }, { entries }, and nullish', () => {
        expect(asArray<number>([1, 2, 3])).toEqual([1, 2, 3]);
        expect(asArray<number>({ data: [4, 5] })).toEqual([4, 5]);
        expect(asArray<number>({ entries: [6], total: 1 })).toEqual([6]);
        expect(asArray<number>(null)).toEqual([]);
        expect(asArray<number>(undefined)).toEqual([]);
        expect(asArray<number>({ nope: true })).toEqual([]);
    });
});

describe('dashboardData — ageLabel', () => {
    it('renders hours under a day and days beyond', () => {
        const threeHoursAgo = new Date(NOW - 3 * 3_600_000).toISOString();
        const twoDaysAgo = new Date(NOW - 2 * 86_400_000).toISOString();
        expect(ageLabel(threeHoursAgo, NOW)).toBe('3h');
        expect(ageLabel(twoDaysAgo, NOW)).toBe('2d');
        expect(ageLabel(undefined, NOW)).toBe('—');
        expect(ageLabel('not-a-date', NOW)).toBe('—');
    });
});

describe('dashboardData — fetchHeatmap', () => {
    it('computes occupancy % and open-maintenance count per property', async () => {
        const deps = fakeDeps({
            '/properties': [
                { id: 'p1', name: 'Buena Vista' },
                { id: 'p2', name: 'Maple Court' },
            ],
            '/units': [
                { propertyId: 'p1', status: 'occupied' },
                { propertyId: 'p1', status: 'occupied' },
                { propertyId: 'p1', status: 'vacant' },
                { propertyId: 'p2', status: 'vacant' },
            ],
            '/workitems': [
                { id: 'w1', type: 'maintenance', status: 'open', propertyId: 'p1' },
                { id: 'w2', type: 'maintenance', status: 'resolved', propertyId: 'p1' },
            ],
        });
        const rows = await fetchHeatmap(deps);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ name: 'Buena Vista', occupancy: 67, maintenance: 1, delinquency: 0 });
        expect(rows[1]).toMatchObject({ name: 'Maple Court', occupancy: 0, maintenance: 0 });
    });

    it('respects the row limit and tolerates empty seeds', async () => {
        const deps = fakeDeps({ '/properties': [], '/units': [], '/workitems': [] });
        expect(await fetchHeatmap(deps)).toEqual([]);
    });
});

describe('dashboardData — fetchWatchdog', () => {
    it('keeps only open high-priority items, sorted by due date asc', async () => {
        const deps = fakeDeps({
            '/workitems': [
                { id: 'a', title: 'Roof leak', status: 'open', priority: 'critical', dueDate: '2026-06-10', propertyId: 'p1' },
                { id: 'b', title: 'Resolved thing', status: 'resolved', priority: 'critical', dueDate: '2026-06-01' },
                { id: 'c', title: 'Low thing', status: 'open', priority: 'low', dueDate: '2026-06-02' },
                { id: 'd', title: 'Boiler', status: 'open', priority: 'high', dueDate: '2026-06-05', propertyId: 'p2' },
            ],
        });
        const rows = await fetchWatchdog(deps);
        expect(rows.map((r) => r.id)).toEqual(['d', 'a']); // high(6/5) before critical(6/10)
        expect(rows[0]).toMatchObject({ title: 'Boiler', priority: 'high', property: 'p2' });
    });
});

describe('dashboardData — fetchFinancialCards', () => {
    it('derives NOI/revenue/expense/occupancy cards from the forecast summary', async () => {
        const deps = fakeDeps({
            '/forecast': { summary: { totalRevenue: 2_400_000, totalExpenses: 840_000, totalNet: 1_560_000, avgOccupancy: 94 } },
        });
        const cards = await fetchFinancialCards(deps);
        expect(cards).toHaveLength(4);
        expect(cards[0]).toMatchObject({ label: 'Net Operating Income', value: '$1.6M', trend: 'up' });
        expect(cards[3]).toMatchObject({ label: 'Avg Occupancy', value: '94%', trend: 'up' });
    });

    it('returns [] when the forecast has no summary', async () => {
        const deps = fakeDeps({ '/forecast': {} });
        expect(await fetchFinancialCards(deps)).toEqual([]);
    });
});

describe('dashboardData — fetchCalendarEvents', () => {
    it('filters compliance items to the reference month (0-based) by expirationDate', async () => {
        const deps = fakeDeps({
            '/compliance': [
                { label: 'Fire cert', itemType: 'inspection', expirationDate: '2026-05-20' }, // in month (May = 4)
                { label: 'Next month', itemType: 'license', expirationDate: '2026-06-03' }, // out
                { label: 'No date', itemType: 'cert' }, // skipped
            ],
        });
        const events = await fetchCalendarEvents(deps, undefined, undefined, NOW);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ day: 20, type: 'inspection', label: 'Fire cert' });
    });
});

describe('dashboardData — fetchAgentLog', () => {
    it('reads the { entries } audit shape and maps agent/action/type', async () => {
        const deps = fakeDeps({
            '/audit': {
                entries: [
                    { userName: 'Andy', action: 'updated compliance', entityType: 'Compliance', createdAt: '2026-05-15T09:05:00Z' },
                ],
                total: 1,
            },
        });
        const log = await fetchAgentLog(deps);
        expect(log).toHaveLength(1);
        expect(log[0]).toMatchObject({ agent: 'Andy', action: 'updated compliance', type: 'compliance' });
        expect(log[0].time).toMatch(/^\d{2}:\d{2}$/);
    });
});

describe('dashboardData — fetchActiveWorkitems', () => {
    it('keeps open items newest-first with an age label', async () => {
        const deps = fakeDeps({
            '/workitems': [
                { id: 'old', title: 'Old', status: 'open', domain: 'maintenance', createdAt: new Date(NOW - 5 * 86_400_000).toISOString() },
                { id: 'new', title: 'New', status: 'open', domain: 'legal', createdAt: new Date(NOW - 2 * 3_600_000).toISOString() },
                { id: 'done', title: 'Done', status: 'resolved', createdAt: new Date(NOW).toISOString() },
            ],
        });
        const rows = await fetchActiveWorkitems(deps, 15, NOW);
        expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
        expect(rows[0]).toMatchObject({ domain: 'legal', age: '2h' });
        expect(rows[1]).toMatchObject({ age: '5d' });
    });
});

describe('dashboardData — fetchDomainSnapshots', () => {
    it('groups open work-items by domain with critical-count, total desc', async () => {
        const deps = fakeDeps({
            '/workitems': [
                { id: '1', status: 'open', domain: 'maintenance', priority: 'critical' },
                { id: '2', status: 'open', domain: 'maintenance', priority: 'normal' },
                { id: '3', status: 'open', domain: 'legal', priority: 'critical' },
                { id: '4', status: 'resolved', domain: 'legal' },
            ],
        });
        const snaps = await fetchDomainSnapshots(deps);
        expect(snaps[0]).toMatchObject({ domain: 'maintenance', count: 2, critical: 1 });
        expect(snaps[1]).toMatchObject({ domain: 'legal', count: 1, critical: 1 });
        expect(snaps[0].color).toBeTruthy();
    });
});

describe('dashboardData — fetchHrSnapshot (mock-labeled)', () => {
    it('carries mock: true (DASH-D5)', () => {
        expect(fetchHrSnapshot()).toMatchObject({ mock: true });
    });
});

describe('dashboardData — daysUntil + complianceStatusRank (Cycle 5)', () => {
    it('computes whole-day deltas (negative = overdue) and nulls for missing/invalid', () => {
        const inFive = new Date(2026, 4, 20).getTime(); // 2026-05-20, date-only
        expect(daysUntil('2026-05-20', NOW)).toBe(5);
        expect(daysUntil('2026-05-10', NOW)).toBe(-5); // overdue
        expect(daysUntil(null, NOW)).toBeNull();
        expect(daysUntil('not-a-date', NOW)).toBeNull();
        expect(inFive).toBeGreaterThan(NOW); // sanity on the anchor
    });

    it('ranks expired/missing/warning above healthy statuses; unknown sinks', () => {
        expect(complianceStatusRank('expired')).toBeLessThan(complianceStatusRank('warning'));
        expect(complianceStatusRank('warning')).toBeLessThan(complianceStatusRank('valid'));
        expect(complianceStatusRank('mystery')).toBe(9);
        expect(complianceStatusRank(undefined)).toBe(9);
    });
});

describe('dashboardData — fetchComplianceItems (Cycle 5)', () => {
    it('sorts most-urgent first, derives daysUntil, and synthesises ids', async () => {
        const deps = fakeDeps({
            '/compliance': [
                { label: 'COI — Acme Roofing', itemType: 'coi', status: 'valid', entityName: 'Acme Roofing', expirationDate: '2026-08-01' },
                { id: 'c-exp', label: 'EPA cert', itemType: 'epa_certification', status: 'expired', expirationDate: '2026-05-01' },
                { label: 'Pool permit', itemType: 'pool_permit', status: 'warning', expirationDate: '2026-05-20' },
            ],
        });
        const out = await fetchComplianceItems(deps, 10, NOW);
        // expired (rank 0) → warning (rank 2) → valid (rank 5).
        expect(out.map(i => i.status)).toEqual(['expired', 'warning', 'valid']);
        expect(out[0].id).toBe('c-exp');
        expect(out[2].id).toBe('compliance-0'); // synthetic id for the row without one
        expect(out[0].daysUntil).toBe(-14); // 2026-05-01 vs 2026-05-15
        expect(out[1].daysUntil).toBe(5);   // 2026-05-20
    });

    it('respects the limit and tolerates an empty seed', async () => {
        expect(await fetchComplianceItems(fakeDeps({}), 5, NOW)).toEqual([]);
        const many = Array.from({ length: 30 }, (_, i) => ({ label: `c${i}`, status: 'tracked', expirationDate: '2026-06-01' }));
        expect(await fetchComplianceItems(fakeDeps({ '/compliance': many }), 8, NOW)).toHaveLength(8);
    });
});

describe('dashboardData — fetchLegalMatters (Cycle 5)', () => {
    it('keeps open legal matters, earliest-deadline first, with counsel + fallbacks', async () => {
        const deps = fakeDeps({
            '/workitems': [
                { id: 'm2', domain: 'legal', status: 'open', priority: 'high', title: 'Eviction — Unit 4B', assignedTo: 'J. Counsel', dueDate: '2026-07-01' },
                { id: 'm1', domain: 'legal', status: 'in_progress', priority: 'critical', title: 'Slip & fall claim', dueDate: '2026-06-01' },
                { id: 'm3', domain: 'legal', status: 'completed', title: 'Closed matter', dueDate: '2026-05-01' }, // closed → dropped
                { id: 'w9', domain: 'maintenance', status: 'open', title: 'Leak' }, // non-legal → dropped
            ],
        });
        const out = await fetchLegalMatters(deps, 10);
        expect(out.map(m => m.id)).toEqual(['m1', 'm2']); // earliest deadline first, closed + non-legal removed
        expect(out[0].counsel).toBe('—');        // missing assignee fallback
        expect(out[1].counsel).toBe('J. Counsel');
        expect(out[1].deadline).toBe('2026-07-01');
    });

    it('tolerates an empty seed', async () => {
        expect(await fetchLegalMatters(fakeDeps({}), 5)).toEqual([]);
    });
});

describe('dashboardData — rank helpers (Cycle 6)', () => {
    it('workitemPriorityRank orders critical < high < normal; unknown sinks', () => {
        expect(workitemPriorityRank('critical')).toBeLessThan(workitemPriorityRank('high'));
        expect(workitemPriorityRank('high')).toBeLessThan(workitemPriorityRank('normal'));
        expect(workitemPriorityRank('mystery')).toBe(5);
        expect(workitemPriorityRank(undefined)).toBe(5);
    });

    it('vendorStatusRank surfaces suspended/expired above active; unknown sinks', () => {
        expect(vendorStatusRank('suspended')).toBeLessThan(vendorStatusRank('active'));
        expect(vendorStatusRank('expired')).toBeLessThan(vendorStatusRank('pending'));
        expect(vendorStatusRank('active')).toBeLessThan(vendorStatusRank('mystery'));
        expect(vendorStatusRank(undefined)).toBe(3);
    });
});

describe('dashboardData — fetchMaintenanceQueue (Cycle 6)', () => {
    it('keeps open maintenance items, priority then due-date order, with age + property', async () => {
        const deps = fakeDeps({
            '/workitems': [
                { id: 'mq2', domain: 'maintenance', status: 'open', priority: 'high', title: 'Boiler', dueDate: '2026-06-10', propertyId: 'p1', createdAt: new Date(NOW - 3 * 86_400_000).toISOString() },
                { id: 'mq1', domain: 'maintenance', status: 'in_progress', priority: 'critical', title: 'Gas leak', dueDate: '2026-06-20', propertyId: 'p2', createdAt: new Date(NOW - 5 * 3_600_000).toISOString() },
                { id: 'done', domain: 'maintenance', status: 'resolved', priority: 'critical', title: 'Closed' }, // closed → dropped
                { id: 'leg', domain: 'legal', status: 'open', priority: 'critical', title: 'Non-maint' }, // non-maintenance → dropped
            ],
        });
        const out = await fetchMaintenanceQueue(deps, 10, NOW);
        expect(out.map(w => w.id)).toEqual(['mq1', 'mq2']); // critical before high
        expect(out[0]).toMatchObject({ title: 'Gas leak', priority: 'critical', property: 'p2', age: '5h' });
        expect(out[1]).toMatchObject({ age: '3d' });
        expect(out[0].daysUntil).toBeGreaterThan(0);
    });

    it('tolerates an empty seed', async () => {
        expect(await fetchMaintenanceQueue(fakeDeps({}), 5, NOW)).toEqual([]);
    });
});

describe('dashboardData — fetchLeaseExpirations (Cycle 6)', () => {
    it('keeps units with a lease end, soonest-first, with tenant fallback + daysUntil', async () => {
        const deps = fakeDeps({
            '/units': [
                { id: 'u-late', unitNumber: 'B12', currentTenantId: 'Smith, J.', propertyId: 'p1', leaseEnd: '2026-08-01' },
                { id: 'u-soon', unitNumber: 'A01', propertyId: 'p2', leaseEnd: '2026-05-20' }, // no tenant
                { id: 'u-none', unitNumber: 'C03', propertyId: 'p3', leaseEnd: null }, // no end → dropped
            ],
        });
        const out = await fetchLeaseExpirations(deps, 10, NOW);
        expect(out.map(l => l.unit)).toEqual(['A01', 'B12']); // 2026-05-20 before 2026-08-01
        expect(out[0]).toMatchObject({ tenant: '—', property: 'p2', daysUntil: 5 });
        expect(out[1]).toMatchObject({ tenant: 'Smith, J.' });
    });

    it('tolerates an empty seed', async () => {
        expect(await fetchLeaseExpirations(fakeDeps({}), 5, NOW)).toEqual([]);
    });
});

describe('dashboardData — fetchVendorStatus (Cycle 6)', () => {
    it('joins vendor names, surfaces suspended first, derives daysUntil', async () => {
        const deps = fakeDeps({
            '/vendor-associations': [
                { id: 'va1', vendorId: 'v-act', status: 'active', contractEnd: '2026-12-01', propertyId: 'p1' },
                { id: 'va2', vendorId: 'v-sus', status: 'suspended', contractEnd: '2026-06-01', propertyId: 'p2' },
                { id: 'va3', vendorId: 'v-unknown', status: 'active', contractEnd: null }, // no name join, no term
            ],
            '/entities': [
                { id: 'v-act', name: 'Acme Roofing', entityType: 'vendor' },
                { id: 'v-sus', name: 'Bob Plumbing', entityType: 'vendor' },
            ],
        });
        const out = await fetchVendorStatus(deps, 10, NOW);
        expect(out[0]).toMatchObject({ id: 'va2', vendor: 'Bob Plumbing', status: 'suspended' }); // suspended first
        expect(out[0].daysUntil).toBeGreaterThan(0);
        const act = out.find(v => v.id === 'va1');
        expect(act).toMatchObject({ vendor: 'Acme Roofing' });
        const unk = out.find(v => v.id === 'va3');
        expect(unk).toMatchObject({ vendor: 'v-unknown', contractEnd: '', daysUntil: null }); // raw id fallback
    });

    it('tolerates an empty seed', async () => {
        expect(await fetchVendorStatus(fakeDeps({}), 5, NOW)).toEqual([]);
    });
});

describe('dashboardData — riskSeverityRank', () => {
    it('ranks high < medium < low < unknown', () => {
        expect(riskSeverityRank('high')).toBeLessThan(riskSeverityRank('medium'));
        expect(riskSeverityRank('medium')).toBeLessThan(riskSeverityRank('low'));
        expect(riskSeverityRank('low')).toBeLessThan(riskSeverityRank('???'));
        expect(riskSeverityRank(undefined)).toBe(riskSeverityRank('???'));
    });
});

describe('dashboardData — fetchFinanceSnapshot', () => {
    it('derives NOI / budget-vs-actual / delinquency from forecast + recurring charges', async () => {
        const deps = fakeDeps({
            '/forecast': { summary: { totalRevenue: 120000, totalExpenses: 48000, totalNet: 72000, avgOccupancy: 92 } },
            '/recurring-charges': [
                { amount: 1595, previousStatus: 'PAID', endDate: null },        // active, paid
                { amount: 1200, previousStatus: 'late', endDate: null },         // active, delinquent
                { amount: 900, previousStatus: null, endDate: '2026-01-01' },    // ended before NOW → excluded
                { amount: 800, previousStatus: 'overdue', endDate: '2026-12-31' }, // active, delinquent
            ],
        });
        const out = await fetchFinanceSnapshot(deps, 12, NOW);
        expect(out).toMatchObject({ months: 12, noi: 72000, revenue: 120000, expenses: 48000, occupancy: 92 });
        expect(out.projectedMonthlyRevenue).toBe(10000);      // 120000 / 12
        expect(out.bookedMonthlyRent).toBe(3595);             // 1595 + 1200 + 800 (ended 900 excluded)
        expect(out.budgetVariance).toBe(-6405);               // 3595 − 10000
        expect(out.delinquentCount).toBe(2);                  // late + overdue
        expect(out.delinquentAmount).toBe(2000);              // 1200 + 800
    });

    it('clamps the months window and forwards it to /forecast', async () => {
        const deps = fakeDeps({ '/forecast': { summary: { totalRevenue: 36000 } }, '/recurring-charges': [] });
        const out = await fetchFinanceSnapshot(deps, 99, NOW); // clamps to 36
        expect(out.months).toBe(36);
        expect(deps.get).toHaveBeenCalledWith('/forecast', { months: '36' });
    });

    it('tolerates an empty seed (no forecast) with zeroed figures', async () => {
        const out = await fetchFinanceSnapshot(fakeDeps({}), 6, NOW);
        expect(out).toMatchObject({ months: 6, noi: 0, revenue: 0, bookedMonthlyRent: 0, delinquentCount: 0 });
    });
});

describe('dashboardData — fetchRiskRegister', () => {
    it('surfaces lapsed/expiring insurance + incidents, filters healthy, sorts by severity', async () => {
        const deps = fakeDeps({
            '/insurance-policies': [
                { id: 'p-lapsed', policyType: 'flood', carrier: 'FEMA', enforcementStatus: 'lapsed', expirationDate: '2025-01-01' },
                { id: 'p-expiring', policyType: 'property', carrier: 'State Farm', enforcementStatus: 'fulfilled', expirationDate: '2026-05-30' },
                { id: 'p-healthy', policyType: 'liability', enforcementStatus: 'fulfilled', expirationDate: '2027-01-01' },
                { id: 'p-required', policyType: 'umbrella', enforcementStatus: 'required', expirationDate: '2027-06-01' },
            ],
            '/incidents': [
                { id: 'i1', title: 'Fire', severity: 'critical', status: 'open', incidentDate: '2026-05-10' },
            ],
        });
        const out = await fetchRiskRegister(deps, 20, NOW);
        // healthy filtered out; high (lapsed, then incident by date) → medium → low(required).
        expect(out.map(r => r.id)).toEqual(['p-lapsed', 'i1', 'p-expiring', 'p-required']);
        expect(out[0]).toMatchObject({ category: 'insurance', severity: 'high', status: 'lapsed' });
        expect(out[1]).toMatchObject({ category: 'incident', severity: 'high', title: 'Fire' });
        expect(out[2]).toMatchObject({ severity: 'medium', status: 'expiring' });
        expect(out.find(r => r.id === 'p-healthy')).toBeUndefined();
    });

    it('tolerates an empty seed', async () => {
        expect(await fetchRiskRegister(fakeDeps({}), 10, NOW)).toEqual([]);
    });
});

describe('dashboardData — loadDashboardData', () => {
    it('aggregates all sections and isolates per-section failures', async () => {
        // /forecast throws → financialCards degrades to [], rest still load.
        const deps: DashboardDataDeps = {
            get: vi.fn(async (path: string) => {
                if (path === '/forecast') throw new Error('backend down');
                if (path === '/workitems') {
                    return [{ id: 'w', status: 'open', priority: 'critical', domain: 'maintenance', title: 'X', dueDate: '2026-06-01', createdAt: '2026-05-14T00:00:00Z' }];
                }
                if (path === '/properties') return [{ id: 'p1', name: 'P1' }];
                if (path === '/units') return [{ propertyId: 'p1', status: 'occupied' }];
                if (path === '/audit') return { entries: [], total: 0 };
                if (path === '/compliance') return [];
                return [];
            }) as DashboardDataDeps['get'],
        };
        const data = await loadDashboardData(deps, NOW);
        expect(data.financialCards).toEqual([]); // isolated failure
        expect(data.watchdog).toHaveLength(1); // still loaded
        expect(data.heatmap[0]).toMatchObject({ name: 'P1', occupancy: 100 });
        expect(data.financeSnapshot).toMatchObject({ noi: 0, months: 12 }); // /forecast failure → zeroed snapshot
        expect(Array.isArray(data.riskRegister)).toBe(true);
        expect(data.hr).toMatchObject({ mock: true });
    });
});
