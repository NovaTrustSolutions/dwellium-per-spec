/**
 * AppFolio parity contract test — accounting / recurring charges (Task 1.5)
 *
 * Contract: the AccountingModule's new Recurring Charges tab reads
 * from recurring_charges.json via the /recurring-charges route, and
 * the seed carries Willie White's 3 × $1,595 rent rows per AppFolio
 * (1 canonical + 2 display-duplicate rows, annotated in `notes`).
 *
 * Pre-Task-1.5 snapshot: recurring_charges.json length === 0.
 * Post-Task-1.5 expected: length === 3 (+3 delta). The length
 * assertion guards against accidental deletion of seeded rows.
 *
 * Cross-type contamination guard (HARD GR): asserts that no Workitem
 * carries RecurringCharge fields and no RecurringCharge carries
 * Workitem fields. This protects the Task 1.4 surface just shipped —
 * the two schemas MUST NOT merge at the seed level.
 *
 * Source of truth: AppFolio_Screenshots/data/09_tenant_detail_willie_white.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.5.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
    RecurringCharge,
    RecurringChargeStatus,
    TenantPaymentMethod,
} from '../../components/StrataDashboard/strataTypes';
import recurringChargesSeed from '../../../public/data/recurring_charges.json';
import workitemsSeed from '../../../public/data/workitems.json';

// Canonical FKs — if any of these drift, the test fails deliberately.
const WILLIE_TENANT_ID = '08793d48-9690-4051-9c8c-6f99f8733af0';
const RIVERWOOD_PROPERTY_ID = '705a6f52-f4a1-403b-ae3f-b3954b2cdac1';
const UNIT_B03_ID = '1f54c72d-f59d-42fc-8ac8-f44b92c0c0a4';
const OCCUPANCY_ID = '2800';

// Enumerate the runtime shape unions so a future accidental widening
// fails this test rather than silently leaking into consumers.
const ALLOWED_STATUSES: RecurringChargeStatus[] = ['PAID', 'UNPAID', 'PARTIAL', 'SCHEDULED'];
const ALLOWED_METHODS: TenantPaymentMethod[] = ['Check', 'ACH', 'Zelle', 'Wire', 'Credit Card', 'Other'];

// Keys that are Workitem-exclusive (Task 1.4 schema) and must NEVER
// appear on a RecurringCharge, and vice versa. Derived from the
// interfaces in packages/types/index.ts.
const WORKITEM_EXCLUSIVE_KEYS = [
    'residentAvailability', 'actionsLog', 'laborEntries', 'purchaseOrders',
    'workOrderNumber', 'permissionToEnter', 'ownerApproved', 'trade',
    'vendorInstructions', 'nextFollowUpDate',
];
const RECURRING_EXCLUSIVE_KEYS = [
    'occupancyId', 'tenantId', 'account', 'nextChargeDate',
    'previousChargeDate', 'previousStatus',
];

describe('accounting parity — Willie White recurring charges (Task 1.5)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/recurring_charges.json')) {
                return { ok: true, json: async () => recurringChargesSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('seed length is exactly 3 (+3 delta vs pre-Task-1.5 empty snapshot)', () => {
        const seed = recurringChargesSeed as unknown as RecurringCharge[];
        expect(seed).toHaveLength(3);
    });

    it('all 3 rows are typed Willie White × $1,595 4100: Rent Income entries', () => {
        const seed = recurringChargesSeed as unknown as RecurringCharge[];
        for (const rc of seed) {
            expect(rc.tenantId).toBe(WILLIE_TENANT_ID);
            expect(rc.propertyId).toBe(RIVERWOOD_PROPERTY_ID);
            expect(rc.unitId).toBe(UNIT_B03_ID);
            expect(rc.occupancyId).toBe(OCCUPANCY_ID);
            expect(rc.account).toBe('4100: Rent Income');
            expect(rc.amount).toBe(1595);
        }

        // Row 1 is the canonical schedule row (full metadata).
        const canonical = seed[0];
        expect(canonical.startDate).toBe('2025-09-23');
        expect(canonical.nextChargeDate).toBe('2026-05-01');
        expect(canonical.previousChargeDate).toBe('2026-04-01');
        expect(canonical.previousStatus).toBe('PAID');
        expect(canonical.paymentMethod).toBe('ACH');

        // Rows 2 and 3 are the AppFolio display-duplicate rows — preserved
        // per Ilya's ack ("Phase 1 is AppFolio PARITY, not AppFolio cleanup").
        // Each carries the duplicate annotation in `notes`.
        expect(seed[1].notes).toMatch(/duplicate row/i);
        expect(seed[2].notes).toMatch(/duplicate row/i);
    });

    it('static API returns all 3 rows via /recurring-charges?tenantId=Willie', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const rows = await strataGet<RecurringCharge[]>('/recurring-charges', { tenantId: WILLIE_TENANT_ID });
        expect(rows).toHaveLength(3);
        expect(rows.every((r) => r.amount === 1595)).toBe(true);
        expect(rows[0].paymentMethod).toBe('ACH');
    });

    it('union guards: previousStatus and paymentMethod values fall within the declared unions', () => {
        const seed = recurringChargesSeed as unknown as RecurringCharge[];
        for (const rc of seed) {
            if (rc.previousStatus !== null) {
                expect(ALLOWED_STATUSES.includes(rc.previousStatus)).toBe(true);
            }
            if (rc.paymentMethod !== undefined) {
                expect(ALLOWED_METHODS.includes(rc.paymentMethod)).toBe(true);
            }
        }
    });

    it('cross-type contamination guard: RecurringCharge and Workitem schemas do not bleed', () => {
        const rcSeed = recurringChargesSeed as unknown as Record<string, unknown>[];
        const wiSeed = workitemsSeed as unknown as Record<string, unknown>[];

        // No RecurringCharge row may carry a Workitem-exclusive key.
        for (const rc of rcSeed) {
            for (const k of WORKITEM_EXCLUSIVE_KEYS) {
                expect(rc[k], `RecurringCharge ${String(rc.id)} must not carry Workitem key '${k}'`).toBeUndefined();
            }
        }

        // No Workitem entry may carry a RecurringCharge-exclusive key.
        // (tenantId lives only on RecurringCharge; Workitem uses createdBy /
        // assignedTo for tenant references. account / previousStatus / etc.
        // are AR-specific.)
        for (const wi of wiSeed) {
            for (const k of RECURRING_EXCLUSIVE_KEYS) {
                expect(wi[k], `Workitem ${String(wi.id)} must not carry RecurringCharge key '${k}'`).toBeUndefined();
            }
        }
    });

    it('PII guard: no SSN / bank-account / credit-card patterns in recurring_charges.json', () => {
        const blob = JSON.stringify(recurringChargesSeed);
        // SSN (NNN-NN-NNNN).
        expect(blob).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
        // 9+ contiguous digits (raw bank-routing or account runs).
        // Dwellium UUIDs hyphenate and won't trip this.
        expect(blob).not.toMatch(/\b\d{9,}\b/);
        // Credit-card style 13-19 digit runs (with optional spaces/dashes).
        expect(blob).not.toMatch(/\b(?:\d[ -]*?){13,19}\b/);
    });
});
