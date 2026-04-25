/**
 * AppFolio parity contract test — CalendarModule AHA inspection seed (Task 2.1)
 *
 * Contract: workitems.json grows 1139 -> 1148 rows; the +9 delta is
 * exactly 9 new Workitems with type='inspection', propertyId=705a6f52-...
 * (real Riverwood Club UUID — DoR-PRE1/PRE2 verified), dueDate across
 * 2026-04-27..30 in a 3/3/2/1 distribution that mirrors Task 2.3's
 * section8_rollup.uniqueInspectionDates exactly.
 *
 * Task 2.1 intentionally touches NO Workitem type declarations — the
 * existing WorkitemType union (packages/types/index.ts:21) already
 * includes 'inspection' and Workitem's 27 required + 10 Task-1.4
 * optional fields already cover every row's shape. TASK_2_1_EXCLUSIVE_KEYS
 * is therefore EMPTY — this is a seed-only task and the contamination
 * guard flows only one direction (existing exclusive-key lists are
 * forbidden on the 9 new rows; nothing is exclusive to Task 2.1).
 *
 * Cross-source coherence: the 9 new Workitem rows (real UUID) run
 * parallel to Task 2.3's 9 pre-existing ComplianceRecord rows on the
 * synthetic "riverwood-club" id. The numbers agree (3 sources report
 * 9) but the UUIDs don't link today — synthetic-UUID cleanup remains
 * a separate deferred PR.
 *
 * Grid-regression RTL it-block (Option α mitigation per Ilya's ack):
 * since the CDP guard only covers the upcoming-events list surface,
 * we render CalendarModule in jsdom + assert the month-grid also
 * paints 9 inspection dots on the 4 scheduled dates. Compile-time
 * regression gate for grid rendering.
 *
 * Source of truth: Docs/Session_Notes/2026-04-23_phase_2_schedule.md
 * §6 L29 (Task 2.1 row) + plan v2.4 §9 tracker.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { Workitem, WorkitemType } from '../../components/StrataDashboard/strataTypes';
import workitemsSeed from '../../../public/data/workitems.json';
import section8RollupSeed from '../../../public/data/section8_rollup.json';
import complianceSeed from '../../../public/data/compliance.json';
import propertiesSeed from '../../../public/data/properties.json';

// Mock UserContext so CalendarModule renders without a real provider.
// hasPermission returns true for every key — gives the test full
// render-tree coverage (grid + event detail + upcoming list).
vi.mock('../../context/UserContext', () => ({
    useUser: () => ({ hasPermission: () => true, user: { id: 'test' } }),
    getAuthToken: () => 'test-token',
}));

// Mock the strataApi module so CalendarModule's fetchEvents resolves
// to the seed without hitting localhost or a real static handler.
vi.mock('../../components/StrataDashboard/strataApi', async () => {
    const seed = (await import('../../../public/data/workitems.json')).default;
    return {
        strataGet: async (path: string) => {
            if (path === '/workitems') return seed;
            return [];
        },
        strataPost: async () => ({}),
        strataPut: async () => ({}),
        strataDelete: async () => ({}),
    };
});

// Canonical FKs — all real properties.json UUIDs (DoR-PRE1 verified).
const RIVERWOOD_PROPERTY_ID = '705a6f52-f4a1-403b-ae3f-b3954b2cdac1';
const SECTION8_DATES = ['2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30'] as const;

// Reverse-direction forbidden keys from all prior tasks. The 9 new
// Task 2.1 rows must NOT carry any of these.
const TASK_1_1_EXCLUSIVE_KEYS = ['occupancyId', 'emergencyContacts', 'animals', 'vehicles', 'isPrimaryTenant'];
const TASK_1_2_EXCLUSIVE_KEYS = ['vendorFederalTax', 'vendorAccountingInfo', 'vendorCompliance', 'paymentMethod', 'send1099'];
const TASK_1_3_EXCLUSIVE_KEYS = ['purchaseHistory', 'lateFeePolicy', 'maintenanceConfig', 'fixedAssets', 'parcelNumber'];
const TASK_1_5_EXCLUSIVE_KEYS = ['account', 'nextChargeDate', 'previousChargeDate', 'previousStatus', 'tenantId'];
const TASK_2_3_COMPLIANCE_EXCLUSIVE = ['itemType', 'coverageLimits', 'lastAuditedAt', 'expirationDate'];
const TASK_2_5_EXCLUSIVE_KEYS = [
    'enforcementStatus', 'leaseRequiresInsurance', 'insuranceRequirement',
    'activeCoverageVerified', 'policyType', 'agentName', 'agentPhone',
    'premiumAnnual', 'coverageAmount', 'deductible', 'effectiveDate',
    'carrier', 'policyNumber', 'lapsedRatio',
];
const TASK_2_7_EXCLUSIVE_KEYS = [
    'category', 'relatedComplianceId', 'relatedPolicyId',
    'relatedWorkitemId', 'sourceBreakdown',
];
const TASK_2_2_EXCLUSIVE_KEYS = [
    'threadId', 'preview', 'readStatus', 'attachmentCount',
    'fromAddress', 'toAddress', 'channel', 'direction',
];
// TASK_1_4 keys (residentAvailability / actionsLog / laborEntries /
// purchaseOrders / etc.) are LEGITIMATELY shared with Task 2.1 — both
// write Workitem rows; Task 1.4 fields may appear on future Task-2.1
// rows without being a contamination signal. Today's 9 Task-2.1 rows
// don't populate them, but the contamination guard does NOT forbid
// them (would break the shared-schema design of Workitem).

function getTask21Rows(): Workitem[] {
    const seed = workitemsSeed as unknown as Workitem[];
    return seed.filter(w =>
        w.type === 'inspection' &&
        w.propertyId === RIVERWOOD_PROPERTY_ID &&
        typeof w.id === 'string' && w.id.startsWith('wi-task-2-1-riverwood-insp-')
    );
}

describe('calendar parity — 9 AHA Section-8 inspection WOs for Riverwood Club (Task 2.1)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/workitems.json')) {
                return { ok: true, json: async () => workitemsSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('seed contract — workitems.json 1139 -> 1148 -> 1151 -> 1152 (+9 Task-2.1 AHA / +3 Task-2.6 utility / +1 Task-2.9 project); Task-2.1 rows still on real Riverwood UUID (DoR-PRE2)', () => {
        const seed = workitemsSeed as unknown as Workitem[];
        // 1152 = 1138 pre-Task-1.4 + 1 (Task 1.4) + 9 (Task 2.1) + 3 (Task 2.6) + 1 (Task 2.9 project WO 19441-1).
        expect(seed).toHaveLength(1152);

        const task21Rows = getTask21Rows();
        expect(task21Rows).toHaveLength(9);

        // DoR-PRE2 — every propertyId is a real properties.json UUID.
        const realPropertyIds = new Set((propertiesSeed as unknown as Array<{ id: string }>).map(p => p.id));
        for (const r of task21Rows) {
            expect(realPropertyIds.has(r.propertyId as string)).toBe(true);
            expect(r.propertyId).toBe(RIVERWOOD_PROPERTY_ID);
        }
    });

    it('date distribution — 3/3/2/1 across 2026-04-27..30 mirrors Task 2.3 section8_rollup.uniqueInspectionDates', () => {
        const rows = getTask21Rows();
        const counts: Record<string, number> = {};
        for (const r of rows) {
            if (r.dueDate) counts[r.dueDate] = (counts[r.dueDate] || 0) + 1;
        }
        expect(counts['2026-04-27']).toBe(3);
        expect(counts['2026-04-28']).toBe(3);
        expect(counts['2026-04-29']).toBe(2);
        expect(counts['2026-04-30']).toBe(1);

        // Every dueDate lands in the allowed 4-date set.
        const allowed = new Set<string>(SECTION8_DATES);
        for (const r of rows) {
            expect(r.dueDate).toBeTruthy();
            expect(allowed.has(r.dueDate as string)).toBe(true);
        }

        // Task 2.3 section8_rollup.json uniqueInspectionDates agrees.
        const rollup = (section8RollupSeed as unknown as Array<{ uniqueInspectionDates: string[] }>)[0];
        expect([...rollup.uniqueInspectionDates].sort()).toEqual([...SECTION8_DATES].sort());
    });

    it('shape conformance — every Task-2.1 row satisfies existing Workitem schema; title matches /Section 8 \\(AHA\\) Inspection/', () => {
        const rows = getTask21Rows();
        const allowedTypes: WorkitemType[] = ['task', 'work_order', 'lease', 'inspection', 'payment', 'recurring', 'notice'];
        for (const r of rows) {
            expect(allowedTypes.includes(r.type)).toBe(true);
            expect(r.type).toBe('inspection');
            expect(r.domain).toBe('compliance');
            expect(r.status).toBe('open');
            expect(r.priority).toBe('medium');
            expect(r.trackingState).toBe('scheduled');
            expect(r.moduleKey).toBe('calendar');
            expect(r.title).toMatch(/Section 8 \(AHA\) Inspection/);
            // Tags include section8/aha/inspection.
            expect(r.tags).toEqual(expect.arrayContaining(['section8', 'aha', 'inspection']));
            // Metadata carries provenance markers.
            const meta = r.metadata as Record<string, unknown>;
            expect(meta.inspectionType).toBe('section_8_aha');
            expect(meta.source).toBe('task-2-1-calendar-inspection-seed');
        }
    });

    it('static API /workitems?type=inspection&property_id=<Riverwood> returns exactly 9 rows', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const all = await strataGet<Workitem[]>('/workitems', {
            type: 'inspection',
            property_id: RIVERWOOD_PROPERTY_ID,
        });
        expect(all).toHaveLength(9);
        for (const w of all) {
            expect(w.type).toBe('inspection');
            expect(w.propertyId).toBe(RIVERWOOD_PROPERTY_ID);
        }
    });

    it('cross-source coherence — 3 parallel surfaces all report 9 Riverwood Section-8 inspections', () => {
        // Surface 1: workitems.json Task-2.1 rows (real UUID).
        const taskRows = getTask21Rows();
        expect(taskRows).toHaveLength(9);

        // Surface 2: compliance.json Task-2.3 rows (synthetic id).
        const compRows = (complianceSeed as unknown as Array<{
            itemType: string; entityId: string;
        }>).filter(c => c.itemType === 'section_8_aha' && c.entityId === 'riverwood-club');
        expect(compRows).toHaveLength(9);

        // Surface 3: section8_rollup.json totalScheduled (synthetic id).
        const rollup = (section8RollupSeed as unknown as Array<{ totalScheduled: number; propertyId: string }>)[0];
        expect(rollup.totalScheduled).toBe(9);
        expect(rollup.propertyId).toBe('riverwood-club');

        // 3 numbers agree (9/9/9) but surfaces don't cross-link today —
        // Task-2.1 uses real UUID 705a6f52; Task-2.3 uses synthetic
        // 'riverwood-club'. Cleanup is a deferred PR.
    });

    it('grid-regression RTL — CalendarModule renders 9 inspection event dots on 4 scheduled dates via data-testid="calendar-grid-event-dot" + data-type="inspection"', async () => {
        const { default: CalendarModule } = await import('../../components/StrataDashboard/modules/CalendarModule');
        // Freeze time to 2026-04-24 so the initial month-grid view
        // lands on April 2026 (covers the 04/27-04/30 target dates).
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-24T12:00:00.000Z'));
        try {
            render(React.createElement(CalendarModule));

            // Wait a tick for strataGet promise + state commit.
            await vi.advanceTimersByTimeAsync(100);
            vi.useRealTimers();
            await new Promise(r => setTimeout(r, 50));

            const inspectionDots = screen.getAllByTestId('calendar-grid-event-dot').filter(
                el => el.getAttribute('data-type') === 'inspection',
            );

            // Month grid caps at 3 events per cell (dayEvents.slice(0,3));
            // our 3/3/2/1 distribution never exceeds 3 on any day, so
            // all 9 dots render.
            expect(inspectionDots.length).toBeGreaterThanOrEqual(9);

            // Every inspection dot's closest day-cell carries a data-date
            // in the allowed 4-date set.
            const allowedDates = new Set<string>(SECTION8_DATES);
            for (const dot of inspectionDots) {
                const cell = dot.closest('[data-date]');
                expect(cell).not.toBeNull();
                const d = cell!.getAttribute('data-date');
                expect(d).toBeTruthy();
                expect(allowedDates.has(d as string)).toBe(true);
            }
        } finally {
            if (vi.isFakeTimers()) vi.useRealTimers();
        }
    });

    it('upcoming-events list RTL — data-testid="calendar-inspection-event" renders exactly 9 rows, data-due-date carries the 3/3/2/1 distribution (CDP guard surrogate)', async () => {
        const { default: CalendarModule } = await import('../../components/StrataDashboard/modules/CalendarModule');
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-24T12:00:00.000Z'));
        try {
            render(React.createElement(CalendarModule));
            await vi.advanceTimersByTimeAsync(100);
            vi.useRealTimers();
            await new Promise(r => setTimeout(r, 50));

            const rows = screen.getAllByTestId('calendar-inspection-event');
            // Upcoming-list slice bumped 8 -> 30 in commit 2; all 9
            // inspections fit alongside any other upcoming WOs.
            expect(rows.length).toBe(9);

            // Programmatic 3/3/2/1 distribution assertion via data-due-date
            // attribute — cleaner than text-content parsing.
            const dates = rows.map(el => el.getAttribute('data-due-date'));
            const counts: Record<string, number> = {};
            for (const d of dates) {
                if (d) counts[d] = (counts[d] || 0) + 1;
            }
            expect(counts['2026-04-27']).toBe(3);
            expect(counts['2026-04-28']).toBe(3);
            expect(counts['2026-04-29']).toBe(2);
            expect(counts['2026-04-30']).toBe(1);
        } finally {
            if (vi.isFakeTimers()) vi.useRealTimers();
        }
    });

    it('bidirectional contamination guard (one-way) — Task-2.1 rows must NOT carry Task-1.1/1.2/1.3/1.5/2.2/2.3/2.5/2.7 exclusive keys; TASK_2_1_EXCLUSIVE_KEYS is empty (seed-only task)', () => {
        const rows = getTask21Rows();
        const forbiddenOnTask21 = [
            ...TASK_1_1_EXCLUSIVE_KEYS, ...TASK_1_2_EXCLUSIVE_KEYS,
            ...TASK_1_3_EXCLUSIVE_KEYS, ...TASK_1_5_EXCLUSIVE_KEYS,
            ...TASK_2_3_COMPLIANCE_EXCLUSIVE, ...TASK_2_5_EXCLUSIVE_KEYS,
            ...TASK_2_7_EXCLUSIVE_KEYS, ...TASK_2_2_EXCLUSIVE_KEYS,
        ];
        for (const row of rows as unknown as Record<string, unknown>[]) {
            for (const key of forbiddenOnTask21) {
                expect(
                    row[key],
                    `Task-2.1 Workitem ${String(row.id)} must not carry forbidden key '${key}'`,
                ).toBeUndefined();
            }
        }
    });

    it('PII guard — no SSN / 9+-digit / card / real-email-domain / phone patterns on any Task-2.1 row', () => {
        const rows = getTask21Rows();
        const blob = JSON.stringify(rows);
        expect(blob).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
        expect(blob).not.toMatch(/\b\d{9,}\b/);
        expect(blob).not.toMatch(/\b(?:\d[ -]*?){13,19}\b/);
        expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|aol|icloud|me|mac|live|msn)\.(?:com|net|org)\b/i);
        expect(blob).not.toMatch(/\(\d{3}\)\s*\d{3}-\d{4}/);
        expect(blob).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
    });
});
