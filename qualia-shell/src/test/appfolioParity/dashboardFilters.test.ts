/**
 * PM-exec dashboard global-filter test (DASH arc, Cycle 9).
 *
 * Exercises `dashboardFilters.ts` — the pure `applyGlobalFilters` function that
 * narrows every list panel at once from the Cycle-9 filter bar. Pinned here:
 *   - both filters default to a strict no-op (same reference returned);
 *   - `query` substring-matches across each panel's primary display text;
 *   - `attentionOnly` keeps only attention-worthy rows per panel predicate,
 *     and is a no-op for panels with no action axis (calendar/agentLog);
 *   - aggregate sections (financeSnapshot, hr) survive filtering untouched;
 *   - null data + filter-active bookkeeping behave.
 */
import { describe, it, expect } from 'vitest';
import {
    applyGlobalFilters, filtersActive, visibleRowCount, EMPTY_FILTERS,
} from '../../components/AstraDashboard/dashboardFilters';
import type { DashboardData } from '../../components/AstraDashboard/dashboardData';

function fixture(): DashboardData {
    return {
        heatmap: [
            { name: 'Maple Court', occupancy: 98, delinquency: 1, maintenance: 2 },     // healthy
            { name: 'Oak Ridge', occupancy: 80, delinquency: 9, maintenance: 14 },       // attention
        ],
        watchdog: [
            { id: 'w1', title: 'Roof leak', priority: 'critical', due: '2d', status: 'open', property: 'Oak Ridge' },
            { id: 'w2', title: 'Repaint lobby', priority: 'low', due: '30d', status: 'open', property: 'Maple Court' },
        ],
        financialCards: [
            { label: 'NOI', value: '$1.2M', change: '+3%', trend: 'up' },
            { label: 'Expenses', value: '$400K', change: '-1%', trend: 'down' },
        ],
        calendarEvents: [
            { day: 5, type: 'inspection', label: 'Fire inspection — Oak Ridge' },
            { day: 12, type: 'deadline', label: 'Tax filing' },
        ],
        agentLog: [
            { time: '1m', agent: 'Stella', action: 'Routed Oak Ridge work order', type: 'route' },
            { time: '5m', agent: 'ARA', action: 'Flagged delinquency', type: 'alert' },
        ],
        activeWorkitems: [
            { id: 'a1', title: 'Vendor renewal', priority: 'high', domain: 'Vendors', age: '3d' },
            { id: 'a2', title: 'Newsletter', priority: 'low', domain: 'Marketing', age: '1d' },
        ],
        domainSnapshots: [
            { domain: 'Maintenance', count: 12, critical: 2, color: '#f00' },
            { domain: 'Leasing', count: 4, critical: 0, color: '#0f0' },
        ],
        complianceItems: [
            { id: 'c1', label: 'Elevator cert', itemType: 'cert', status: 'expired', entity: 'Oak Ridge', due: '', daysUntil: -5 },
            { id: 'c2', label: 'Fire extinguisher', itemType: 'cert', status: 'valid', entity: 'Maple Court', due: '', daysUntil: 200 },
        ],
        legalMatters: [
            { id: 'm1', title: 'Tenant dispute', status: 'open', priority: 'high', deadline: '', counsel: 'Smith LLP' },
            { id: 'm2', title: 'Easement review', status: 'open', priority: 'low', deadline: '', counsel: 'Jones PC' },
        ],
        maintenanceQueue: [
            { id: 'wo1', title: 'HVAC down', priority: 'urgent', status: 'open', due: '', daysUntil: 1, property: 'Oak Ridge', age: '2d' },
            { id: 'wo2', title: 'Light bulb', priority: 'low', status: 'open', due: '', daysUntil: 40, property: 'Maple Court', age: '1d' },
        ],
        leaseExpirations: [
            { id: 'l1', unit: '101', tenant: 'Alice', property: 'Oak Ridge', leaseEnd: '', daysUntil: 15 },   // attention (<=30)
            { id: 'l2', unit: '202', tenant: 'Bob', property: 'Maple Court', leaseEnd: '', daysUntil: 120 },
        ],
        vendorStatus: [
            { id: 'v1', vendor: 'Acme HVAC', status: 'suspended', contractEnd: '', daysUntil: null, property: 'Oak Ridge' },
            { id: 'v2', vendor: 'Bright Cleaning', status: 'active', contractEnd: '', daysUntil: 90, property: 'Maple Court' },
        ],
        financeSnapshot: {
            months: 12, noi: 1_200_000, revenue: 2_000_000, expenses: 800_000, occupancy: 94,
            projectedMonthlyRevenue: 166_000, bookedMonthlyRent: 170_000, budgetVariance: 4_000,
            delinquentCount: 3, delinquentAmount: 12_000,
        },
        riskRegister: [
            { id: 'r1', category: 'insurance', title: 'GL policy lapsed', severity: 'high', status: 'lapsed', property: 'Oak Ridge', date: '', daysUntil: null },
            { id: 'r2', category: 'incident', title: 'Slip report', severity: 'low', status: 'open', property: 'Maple Court', date: '', daysUntil: null },
        ],
        hr: {
            mock: true, headcount: 67, openRoles: 7, incidents: 2, turnoverRate: 12,
            departments: [{ name: 'Ops', headcount: 24, open: 3 }],
        },
    };
}

describe('applyGlobalFilters', () => {
    it('EMPTY_FILTERS is a no-op (returns the same reference)', () => {
        const data = fixture();
        expect(applyGlobalFilters(data, EMPTY_FILTERS)).toBe(data);
    });

    it('passes null data through unchanged', () => {
        expect(applyGlobalFilters(null, { query: 'oak', attentionOnly: true })).toBeNull();
    });

    it('query substring-matches across every list panel (case-insensitive)', () => {
        const out = applyGlobalFilters(fixture(), { query: 'oak', attentionOnly: false })!;
        expect(out.heatmap.map(h => h.name)).toEqual(['Oak Ridge']);
        expect(out.watchdog.map(w => w.id)).toEqual(['w1']);          // "Oak Ridge" in property
        expect(out.complianceItems.map(c => c.id)).toEqual(['c1']);    // entity Oak Ridge
        expect(out.calendarEvents.map(e => e.label)).toEqual(['Fire inspection — Oak Ridge']);
        expect(out.agentLog.map(a => a.action)).toEqual(['Routed Oak Ridge work order']);
        // aggregates untouched
        expect(out.financeSnapshot).toEqual(fixture().financeSnapshot);
        expect(out.hr.headcount).toBe(67);
    });

    it('query that matches nothing empties the row panels', () => {
        const out = applyGlobalFilters(fixture(), { query: 'zzz-no-match', attentionOnly: false })!;
        expect(out.watchdog).toEqual([]);
        expect(out.maintenanceQueue).toEqual([]);
        expect(out.legalMatters).toEqual([]);
    });

    it('attentionOnly keeps only attention-worthy rows per panel', () => {
        const out = applyGlobalFilters(fixture(), { query: '', attentionOnly: true })!;
        expect(out.heatmap.map(h => h.name)).toEqual(['Oak Ridge']);             // delinquency>5 / maint>10 / occ<85
        expect(out.watchdog.map(w => w.id)).toEqual(['w1']);                     // critical
        expect(out.complianceItems.map(c => c.id)).toEqual(['c1']);             // expired + overdue
        expect(out.legalMatters.map(m => m.id)).toEqual(['m1']);                // high priority
        expect(out.maintenanceQueue.map(w => w.id)).toEqual(['wo1']);          // urgent
        expect(out.leaseExpirations.map(l => l.id)).toEqual(['l1']);           // <=30d
        expect(out.vendorStatus.map(v => v.id)).toEqual(['v1']);               // suspended
        expect(out.riskRegister.map(r => r.id)).toEqual(['r1']);               // high severity
        expect(out.activeWorkitems.map(w => w.id)).toEqual(['a1']);            // high priority
    });

    it('attentionOnly is a no-op for panels with no action axis', () => {
        const out = applyGlobalFilters(fixture(), { query: '', attentionOnly: true })!;
        expect(out.calendarEvents).toHaveLength(2);   // calendar has no attention predicate
        expect(out.agentLog).toHaveLength(2);         // agent log has no attention predicate
    });

    it('query AND attentionOnly compose (intersection)', () => {
        // "maple" matches healthy rows; attention removes them → empty for those panels
        const out = applyGlobalFilters(fixture(), { query: 'maple', attentionOnly: true })!;
        expect(out.watchdog).toEqual([]);             // Maple Court row is low priority
        expect(out.heatmap).toEqual([]);              // Maple Court is healthy
    });
});

describe('filtersActive', () => {
    it('false only when both controls are at their default', () => {
        expect(filtersActive(EMPTY_FILTERS)).toBe(false);
        expect(filtersActive({ query: '   ', attentionOnly: false })).toBe(false); // whitespace-only
        expect(filtersActive({ query: 'x', attentionOnly: false })).toBe(true);
        expect(filtersActive({ query: '', attentionOnly: true })).toBe(true);
    });
});

describe('visibleRowCount', () => {
    it('is 0 for null and sums the list panels otherwise', () => {
        expect(visibleRowCount(null)).toBe(0);
        // 2 rows × 13 list panels in the fixture
        expect(visibleRowCount(fixture())).toBe(26);
    });

    it('drops as filters narrow the data', () => {
        const data = fixture();
        const filtered = applyGlobalFilters(data, { query: '', attentionOnly: true });
        expect(visibleRowCount(filtered)).toBeLessThan(visibleRowCount(data));
    });
});
