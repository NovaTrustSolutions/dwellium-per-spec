/**
 * AppFolio parity contract test — ComplianceEngine (Task 2.3)
 *
 * Contract: ComplianceEngine consumes 15 rows from compliance.json
 * (6 vendor compliance rows for 2-Story Technical Roofing LLC +
 *  9 AHA Section-8 inspection rows for Riverwood Club Apartments) and
 * a 1-row section8_rollup.json aggregate. The two fixtures agree —
 * the rollup's totalScheduled, uniqueInspectionDates, and
 * nextInspectionDate are derivable from the 9 Section-8 rows.
 *
 * Pre-Task-2.3 snapshot: compliance.json length === 0; section8_rollup.json
 * did not exist. Post-Task-2.3 expected: compliance.json length === 15;
 * section8_rollup.json length === 1. The length assertions guard against
 * accidental deletion of seeded rows.
 *
 * Cross-type contamination guard (HARD GR): asserts that no ComplianceRecord
 * carries any Task-1.1..1.5-exclusive key and conversely no Workitem /
 * RecurringCharge row carries any Task-2.3-exclusive key. Preserves the
 * Phase-1 surface stability.
 *
 * PII guard: both JSON blobs scanned for SSN, bank, card, real-email-domain,
 * parenthesized-phone patterns. Corporate entity names (business LLC /
 * apartment complex) are allowed.
 *
 * Source of truth: AppFolio_Screenshots/data/10_vendor_detail_2story_roofing.json
 * (vendor compliance block) + AppFolio_Screenshots/data/07_insurance_compliance.json
 * (Section-8 / AHA / HCV / LIHTC feature-flag context).
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Phase 2 Task 2.3 row.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
    ComplianceRecord,
    ComplianceEntityType,
    ComplianceItemType,
    ComplianceStatus,
    Section8Rollup,
} from '../../components/StrataDashboard/strataTypes';
import complianceSeed from '../../../public/data/compliance.json';
import section8RollupSeed from '../../../public/data/section8_rollup.json';
import workitemsSeed from '../../../public/data/workitems.json';
import recurringChargesSeed from '../../../public/data/recurring_charges.json';

// Canonical FKs — if any of these drift, the tests fail deliberately.
const VENDOR_ID = 'appfolio-v-2716';
const VENDOR_NAME = '2-STORY TECHNICAL ROOFING LLC';
const AHA_PROPERTY_ID = 'riverwood-club';
const AHA_PROPERTY_NAME = 'Riverwood Club Apartments';
const AHA_DATE_RANGE = ['2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30'] as const;

// Enumerate runtime-union shapes so any future accidental widening fails
// this test rather than silently leaking into consumers.
const ALLOWED_ENTITY_TYPES: ComplianceEntityType[] = ['vendor', 'inspection', 'policy', 'property'];
const ALLOWED_STATUSES: ComplianceStatus[] = ['valid', 'tracked', 'warning', 'expired', 'missing', 'scheduled'];
const ALLOWED_ITEM_TYPES: ComplianceItemType[] = [
    'workers_comp', 'general_liability', 'epa_certification', 'auto_insurance',
    'state_license', 'contract', 'section_8_aha', 'insurance', 'coi', 'w9',
    'llc_renewal', 'pool_permit', 'business_license', 'tax_filing',
];
const VENDOR_KIND_ORDER: ComplianceItemType[] = [
    'workers_comp', 'general_liability', 'epa_certification',
    'auto_insurance', 'state_license', 'contract',
];

// Keys exclusive to Task 1.1..1.5 schemas; must NEVER appear on a ComplianceRecord.
const TASK_1_1_EXCLUSIVE_KEYS = ['occupancyId', 'emergencyContacts', 'animals', 'vehicles', 'isPrimaryTenant'];
const TASK_1_2_EXCLUSIVE_KEYS = ['vendorFederalTax', 'vendorAccountingInfo', 'vendorCompliance', 'paymentMethod', 'send1099'];
const TASK_1_3_EXCLUSIVE_KEYS = ['purchaseHistory', 'lateFeePolicy', 'maintenanceConfig', 'fixedAssets', 'parcelNumber'];
const TASK_1_4_EXCLUSIVE_KEYS = [
    'residentAvailability', 'actionsLog', 'laborEntries', 'purchaseOrders',
    'workOrderNumber', 'permissionToEnter', 'ownerApproved', 'trade',
    'vendorInstructions', 'nextFollowUpDate',
];
const TASK_1_5_EXCLUSIVE_KEYS = ['account', 'nextChargeDate', 'previousChargeDate', 'previousStatus', 'tenantId'];
// Keys exclusive to Task 2.3; must NEVER appear on a workitem or recurring_charge row.
const TASK_2_3_EXCLUSIVE_KEYS = ['itemType', 'expirationDate', 'coverageLimits', 'lastAuditedAt'];

describe('complianceEngine parity — 2-Story Technical Roofing + Riverwood Club Section-8 (Task 2.3)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/compliance.json')) {
                return { ok: true, json: async () => complianceSeed } as Response;
            }
            if (url.endsWith('/data/section8_rollup.json')) {
                return { ok: true, json: async () => section8RollupSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('seed length is exactly 15 (6 vendor + 9 AHA Section-8 rows) vs pre-Task-2.3 empty snapshot', () => {
        const seed = complianceSeed as unknown as ComplianceRecord[];
        expect(seed).toHaveLength(15);
        const vendor = seed.filter(r => r.entityType === 'vendor');
        const aha = seed.filter(r => r.entityType === 'inspection');
        expect(vendor).toHaveLength(6);
        expect(aha).toHaveLength(9);
    });

    it('vendor block: all 6 reference appfolio-v-2716, cover the 6-kind AppFolio schema, GL expires 2026-07-11 tracked, other 5 missing', () => {
        const vendorRows = (complianceSeed as unknown as ComplianceRecord[])
            .filter(r => r.entityType === 'vendor');
        expect(vendorRows).toHaveLength(6);
        for (const row of vendorRows) {
            expect(row.entityId).toBe(VENDOR_ID);
            expect(row.entityName).toBe(VENDOR_NAME);
            expect(row.source).toBe('vendor-2716');
            expect(ALLOWED_ENTITY_TYPES.includes(row.entityType)).toBe(true);
            expect(ALLOWED_ITEM_TYPES.includes(row.itemType)).toBe(true);
            expect(ALLOWED_STATUSES.includes(row.status)).toBe(true);
        }
        const kinds = vendorRows.map(r => r.itemType).sort();
        expect(kinds).toEqual([...VENDOR_KIND_ORDER].sort());
        const gl = vendorRows.find(r => r.itemType === 'general_liability')!;
        expect(gl.expirationDate).toBe('2026-07-11');
        expect(gl.status).toBe('tracked');
        const missing = vendorRows.filter(r => r.status === 'missing');
        expect(missing).toHaveLength(5);
    });

    it('Section-8 block: all 9 reference riverwood-club, itemType=section_8_aha, status=scheduled, dates within 2026-04-27..30', () => {
        const ahaRows = (complianceSeed as unknown as ComplianceRecord[])
            .filter(r => r.entityType === 'inspection');
        expect(ahaRows).toHaveLength(9);
        const allowedDates = new Set(AHA_DATE_RANGE);
        for (const row of ahaRows) {
            expect(row.entityId).toBe(AHA_PROPERTY_ID);
            expect(row.propertyId).toBe(AHA_PROPERTY_ID);
            expect(row.entityName).toBe(AHA_PROPERTY_NAME);
            expect(row.itemType).toBe('section_8_aha');
            expect(row.status).toBe('scheduled');
            expect(row.source).toBe('appfolio-aha-inspection-batch');
            expect(row.expirationDate).not.toBeNull();
            expect(allowedDates.has(row.expirationDate as (typeof AHA_DATE_RANGE)[number])).toBe(true);
        }
    });

    it('Section-8 rollup lineage: section8_rollup.json aggregate agrees with the 9 Section-8 rows in compliance.json', () => {
        const rollups = section8RollupSeed as unknown as Section8Rollup[];
        expect(rollups).toHaveLength(1);
        const rollup = rollups[0];
        expect(rollup.propertyId).toBe(AHA_PROPERTY_ID);
        expect(rollup.propertyName).toBe(AHA_PROPERTY_NAME);

        // Derive the aggregate from the 9 raw rows and compare.
        const ahaRows = (complianceSeed as unknown as ComplianceRecord[])
            .filter(r => r.itemType === 'section_8_aha');
        expect(rollup.totalScheduled).toBe(ahaRows.length);
        const derivedDates = [...new Set(ahaRows.map(r => r.expirationDate).filter((d): d is string => d !== null))].sort();
        expect(rollup.uniqueInspectionDates).toEqual(derivedDates);
        expect(rollup.nextInspectionDate).toBe(derivedDates[0]);
        expect(['on-track', 'attention', 'overdue']).toContain(rollup.status);
    });

    it('static API: /compliance returns 15 rows; /compliance/section8-rollup returns the rollup; /compliance/portfolio-rollup exposes section8 key with overall+categories preserved', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const rows = await strataGet<ComplianceRecord[]>('/compliance');
        expect(rows).toHaveLength(15);

        const s8 = await strataGet<Section8Rollup | null>('/compliance/section8-rollup');
        expect(s8).not.toBeNull();
        expect(s8!.propertyId).toBe(AHA_PROPERTY_ID);
        expect(s8!.totalScheduled).toBe(9);

        const portfolio = await strataGet<{ overall: number; categories: Record<string, unknown>; section8: Section8Rollup | null }>(
            '/compliance/portfolio-rollup',
        );
        expect(typeof portfolio.overall).toBe('number');
        expect(portfolio.categories).toBeDefined();
        expect(Object.keys(portfolio.categories)).toEqual(
            expect.arrayContaining(['vendor', 'inspection', 'policy', 'property']),
        );
        expect(portfolio.section8).not.toBeNull();
        expect(portfolio.section8!.propertyId).toBe(AHA_PROPERTY_ID);

        // /compliance/audit with an entityType filter narrows the result set.
        const auditVendor = await strataGet<ComplianceRecord[]>('/compliance/audit', { entityType: 'vendor' });
        expect(auditVendor).toHaveLength(6);
        const auditInspection = await strataGet<ComplianceRecord[]>('/compliance/audit', { entityType: 'inspection' });
        expect(auditInspection).toHaveLength(9);
    });

    it('cross-type contamination guard: ComplianceRecord and Workitem/RecurringCharge schemas do not bleed', () => {
        const compRows = complianceSeed as unknown as Record<string, unknown>[];
        const wiRows = workitemsSeed as unknown as Record<string, unknown>[];
        const rcRows = recurringChargesSeed as unknown as Record<string, unknown>[];

        const forbiddenOnCompliance = [
            ...TASK_1_1_EXCLUSIVE_KEYS, ...TASK_1_2_EXCLUSIVE_KEYS,
            ...TASK_1_3_EXCLUSIVE_KEYS, ...TASK_1_4_EXCLUSIVE_KEYS,
            ...TASK_1_5_EXCLUSIVE_KEYS,
        ];

        for (const row of compRows) {
            for (const key of forbiddenOnCompliance) {
                expect(
                    row[key],
                    `ComplianceRecord ${String(row.id)} must not carry Task-1.x key '${key}'`,
                ).toBeUndefined();
            }
        }
        for (const wi of wiRows) {
            for (const key of TASK_2_3_EXCLUSIVE_KEYS) {
                expect(
                    wi[key],
                    `Workitem ${String(wi.id)} must not carry Task-2.3 ComplianceRecord key '${key}'`,
                ).toBeUndefined();
            }
        }
        for (const rc of rcRows) {
            for (const key of TASK_2_3_EXCLUSIVE_KEYS) {
                expect(
                    rc[key],
                    `RecurringCharge ${String(rc.id)} must not carry Task-2.3 ComplianceRecord key '${key}'`,
                ).toBeUndefined();
            }
        }
    });

    it('PII guard: no SSN / bank / card / real-email-domain / parenthesized-phone patterns in compliance.json or section8_rollup.json', () => {
        const blob = `${JSON.stringify(complianceSeed)}\n${JSON.stringify(section8RollupSeed)}`;
        // SSN (NNN-NN-NNNN).
        expect(blob).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
        // 9+ contiguous digits (raw bank routing / account runs).
        // Dwellium UUIDs hyphenate and won't trip this; our ISO date '2026-07-11' won't either.
        expect(blob).not.toMatch(/\b\d{9,}\b/);
        // Credit-card style 13-19 digit runs.
        expect(blob).not.toMatch(/\b(?:\d[ -]*?){13,19}\b/);
        // Real-email domains.
        expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|aol|icloud|me|mac|live|msn)\.(?:com|net|org)\b/i);
        // Parenthesized US phone.
        expect(blob).not.toMatch(/\(\d{3}\)\s*\d{3}-\d{4}/);
    });
});
