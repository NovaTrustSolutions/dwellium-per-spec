/**
 * AppFolio parity contract test — Forecast static handler (Task 2.4)
 *
 * Contract: GET /forecast in strataApi.static.ts is the static-mode
 * counterpart for the live backend at localhost:3000/api/forecast that
 * ForecastModule.tsx historically hit directly. Pre-Task-2.4, static
 * mode was effectively broken — the raw fetch always failed, surfacing
 * "Could not connect to backend". The Task 2.4 rewire (commit D)
 * routes the module through strataGet<ForecastResult>('/forecast') and
 * the new handler (commit C) returns a typed projection from
 * units.json (rentAmount × occupancy) — every number traces back to
 * seed; zero synthetic data.
 *
 * Source of truth: plan v2.6 §8 L306 + §9 Clarification #1 (L329) +
 * Appendix D row 4. PRE0/PRE1/PRE2 verification surfaced that 8 of 10
 * AppFolio properties_page_1 rows were already absorbed during Task
 * 1.3 era under non-AppFolio-namespaced UUIDs — the "50-property seed"
 * verb was effectively fulfilled then. Task 2.4 ships D3 scope: handler
 * + ForecastModule rewire. The properties.json baseline (36, frozen by
 * Task 2.10's PR #14) is asserted as a lower-bound drift guard so
 * future row deletes fail the test.
 *
 * Cross-test note: Task 2.10's propertyTimeline.test.ts pins the same
 * baseline (=== 36). D3 leaves that pin untouched (no seed grows the
 * baseline this PR). When the deferred Phase-3 AppFolio re-capture PR
 * lands, both tests should flex to the new bound in lockstep.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ForecastResult } from '@qualia/types';
import propertiesSeed from '../../../public/data/properties.json';
import unitsSeed from '../../../public/data/units.json';

// Drift-bound constant (refined from PRE0 ack — see commit message).
// Pinned at the Task 1.3 close baseline, which is also the Task 2.10
// READ-ONLY baseline. Task 2.4 (D3) does not grow this; the bound is
// asserted as `>=` so a future PR that legitimately grows the seed is
// not blocked, but accidental row deletes are caught.
const PROPERTIES_BASELINE_PHASE_1 = 36;

// Canonical FK — real properties.json UUID (DoR-PRE2 verified across
// Tasks 1.3 / 2.5 / 2.7 / 2.10 / and this Task 2.4).
const BUENA_VISTA_PROPERTY_ID = 'e4b440e9-5062-4da1-ae25-818dffab8b3b';

describe('forecast parity — static /forecast handler (Task 2.4)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/properties.json')) {
                return { ok: true, json: async () => propertiesSeed } as Response;
            }
            if (url.endsWith('/data/units.json')) {
                return { ok: true, json: async () => unitsSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    // ── 1. Default shape + month count ──────────────────────────────────
    it('GET /forecast (no params) returns a typed ForecastResult; months defaults to 12; aggregate scope (propertyId === null)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const result = await strataGet<ForecastResult>('/forecast');
        expect(result).toBeDefined();
        expect(result.propertyId).toBeNull();
        expect(result.propertyName).toBe('All Properties');
        expect(Array.isArray(result.months)).toBe(true);
        expect(result.months).toHaveLength(12);
        // Each MonthlyForecast row carries every field from the type.
        for (const m of result.months) {
            expect(typeof m.month).toBe('string');
            expect(typeof m.label).toBe('string');
            expect(typeof m.projectedRevenue).toBe('number');
            expect(typeof m.projectedExpenses).toBe('number');
            expect(typeof m.netCashFlow).toBe('number');
            expect(typeof m.occupancyRate).toBe('number');
            expect(typeof m.occupiedUnits).toBe('number');
            expect(typeof m.totalUnits).toBe('number');
            // Net is exactly revenue - expenses (no rounding drift).
            expect(m.netCashFlow).toBe(m.projectedRevenue - m.projectedExpenses);
        }
    });

    // ── 2. months param respected + bounded ─────────────────────────────
    it('months query param is honored; out-of-range coerces (months=99 → clamped to 36; months=garbage → defaults to 12)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const r6 = await strataGet<ForecastResult>('/forecast', { months: '6' });
        expect(r6.months).toHaveLength(6);
        const r24 = await strataGet<ForecastResult>('/forecast', { months: '24' });
        expect(r24.months).toHaveLength(24);
        const rOver = await strataGet<ForecastResult>('/forecast', { months: '99' });
        expect(rOver.months).toHaveLength(36);
        const rJunk = await strataGet<ForecastResult>('/forecast', { months: 'NaN-here' });
        expect(rJunk.months).toHaveLength(12);
    });

    // ── 3. propertyId scope returns single-property forecast ───────────
    it('propertyId filter returns the property name and scopes totalUnits to that property', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const result = await strataGet<ForecastResult>('/forecast', { propertyId: BUENA_VISTA_PROPERTY_ID });
        expect(result.propertyId).toBe(BUENA_VISTA_PROPERTY_ID);
        expect(result.propertyName).toBe('128 BUENA VISTA DR N');
        // BV is a single-family home — totalUnits per month is 1 (the unit
        // count for the property).
        const bvUnits = (unitsSeed as any[]).filter(u => u.propertyId === BUENA_VISTA_PROPERTY_ID);
        for (const m of result.months) {
            expect(m.totalUnits).toBe(bvUnits.length);
        }
    });

    // ── 4. rentChange scales projectedRevenue linearly ──────────────────
    it('rentChange query param scales projectedRevenue linearly; assumptions.rentChangePercent reflects input', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const baseline = await strataGet<ForecastResult>('/forecast');
        const plus10 = await strataGet<ForecastResult>('/forecast', { rentChange: '10' });
        const minus5 = await strataGet<ForecastResult>('/forecast', { rentChange: '-5' });

        expect(baseline.assumptions.rentChangePercent).toBe(0);
        expect(plus10.assumptions.rentChangePercent).toBe(10);
        expect(minus5.assumptions.rentChangePercent).toBe(-5);

        // Per-month revenue scales by (1 + pct/100) — allow ±1 from
        // round() drift on each integer month.
        const baseMonthly = baseline.months[0].projectedRevenue;
        expect(Math.abs(plus10.months[0].projectedRevenue - Math.round(baseMonthly * 1.1))).toBeLessThanOrEqual(1);
        expect(Math.abs(minus5.months[0].projectedRevenue - Math.round(baseMonthly * 0.95))).toBeLessThanOrEqual(1);
    });

    // ── 5. occupancy override pins occupancyRate ────────────────────────
    it('occupancy override pins occupancyRate to the override; assumptions.occupancyRateOverride records it', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const natural = await strataGet<ForecastResult>('/forecast');
        const overridden = await strataGet<ForecastResult>('/forecast', { occupancy: '95' });

        expect(natural.assumptions.occupancyRateOverride).toBeNull();
        expect(overridden.assumptions.occupancyRateOverride).toBe(95);
        for (const m of overridden.months) {
            expect(m.occupancyRate).toBe(95);
        }
        // Out-of-range override clamps to [0, 100].
        const tooHigh = await strataGet<ForecastResult>('/forecast', { occupancy: '500' });
        expect(tooHigh.assumptions.occupancyRateOverride).toBe(100);
    });

    // ── 6. summary invariants (sanity bounds) ───────────────────────────
    it('summary fields are internally consistent (totalNet === totalRevenue - totalExpenses; breakEvenOccupancy in [0, 100]; avgOccupancy === months[*].occupancyRate when uniform)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const result = await strataGet<ForecastResult>('/forecast');
        expect(result.summary.totalNet).toBe(result.summary.totalRevenue - result.summary.totalExpenses);
        expect(result.summary.breakEvenOccupancy).toBeGreaterThanOrEqual(0);
        expect(result.summary.breakEvenOccupancy).toBeLessThanOrEqual(100);
        expect(result.summary.avgOccupancy).toBeGreaterThanOrEqual(0);
        expect(result.summary.avgOccupancy).toBeLessThanOrEqual(100);
        // months are deterministically uniform in the v1 handler — every
        // month's occupancyRate equals summary.avgOccupancy.
        for (const m of result.months) {
            expect(m.occupancyRate).toBe(result.summary.avgOccupancy);
        }
    });

    // ── 7. unknown propertyId returns zeroed aggregate; never throws ───
    it('unknown propertyId returns the zeroed-month aggregate (defensive; never throws)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const result = await strataGet<ForecastResult>('/forecast', { propertyId: 'no-such-property-uuid' });
        expect(result.propertyId).toBe('no-such-property-uuid');
        // No matching property → propertyName falls through to "All Properties".
        expect(result.propertyName).toBe('All Properties');
        // No matching units → 0 totalUnits and 0 revenue.
        for (const m of result.months) {
            expect(m.totalUnits).toBe(0);
            expect(m.occupiedUnits).toBe(0);
            expect(m.projectedRevenue).toBe(0);
            expect(m.projectedExpenses).toBe(0);
            expect(m.netCashFlow).toBe(0);
        }
        expect(result.summary.totalRevenue).toBe(0);
    });

    // ── 8. GR-3 drift-bound on properties.json (D3 baseline guard) ─────
    it('GR-3 drift bound: properties.json row count >= Phase-1 baseline (36); Task 2.4 (D3) does not grow the seed', () => {
        const seed = propertiesSeed as unknown as Array<{ id: string }>;
        expect(seed.length).toBeGreaterThanOrEqual(PROPERTIES_BASELINE_PHASE_1);
        // BV is still present (DoR-PRE2 anchor across all Phase-2 tasks).
        const bv = seed.find(p => p.id === BUENA_VISTA_PROPERTY_ID);
        expect(bv, 'BUENA VISTA anchor must remain seeded for cross-task continuity').toBeDefined();
    });
});
