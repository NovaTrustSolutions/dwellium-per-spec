/**
 * AppFolio parity contract test — InsuranceModule FolioGuard (Task 2.5)
 *
 * Contract: InsuranceModule consumes 6 rows from insurance_policies.json
 * (2 pre-existing rows with Task-2.5 optional FolioGuard fields added +
 *  4 new AppFolio-parity rows covering the 4-state EnforcementStatus
 *  union) and a 1-row folioguard_rollup.json aggregate. The two fixtures
 * agree — the rollup's totalPolicies / required / lapsed / fulfilled /
 * lapsedRatio are derivable from the 3 Riverwood Club rows in
 * insurance_policies.json.
 *
 * Pre-Task-2.5 snapshot: insurance_policies.json length === 2;
 * folioguard_rollup.json did not exist. Post-Task-2.5 expected:
 * insurance_policies.json length === 6; folioguard_rollup.json length === 1.
 *
 * Cross-type contamination guard (HARD GR): bidirectional.
 *   - No InsurancePolicy row carries any Task-1.1..1.5-exclusive key OR
 *     any Task-2.3 key that is *exclusive to ComplianceRecord* (narrower
 *     than complianceEngine.test.ts's full Task-2.3 list — `expirationDate`
 *     is legitimately shared between ComplianceRecord and InsurancePolicy,
 *     so we drop it from the forbidden set here).
 *   - No ComplianceRecord / Workitem / RecurringCharge row carries any
 *     Task-2.5-exclusive key.
 *
 * PII guard: both JSON blobs scanned for SSN, bank-run, card, real-email
 * domain, and parenthesized-phone patterns. Corporate carrier names
 * (State Farm, FEMA NFIP, Travelers, Liberty Mutual, Chubb, Farmers) are
 * allowed. Existing rows' agentName/agentPhone were redacted to "" per
 * the Task 2.5 micro-plan ack.
 *
 * Source of truth: AppFolio_Screenshots/data/07_insurance_compliance.json
 * (Insurance Enforcement Report schema; current_rows='No Rows To Show' in
 * AppFolio's own portfolio). Task 2.5 synthesizes enforcement rows across
 * the full 4-state EnforcementStatus union to demonstrate the surface.
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §8 + scheduling-pass
 * §1 row for Task 2.5.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
    InsurancePolicy,
    InsurancePolicyType,
    InsurancePolicyStatus,
    EnforcementStatus,
    FolioGuardRollup,
} from '../../components/StrataDashboard/strataTypes';
import insuranceSeed from '../../../public/data/insurance_policies.json';
import folioguardRollupSeed from '../../../public/data/folioguard_rollup.json';
import complianceSeed from '../../../public/data/compliance.json';
import workitemsSeed from '../../../public/data/workitems.json';
import recurringChargesSeed from '../../../public/data/recurring_charges.json';

// Canonical FKs — if these drift, tests fail deliberately.
const RIVERWOOD_PROPERTY_ID = 'riverwood-club';
const RIVERWOOD_PROPERTY_NAME = 'Riverwood Club Apartments';
const BUENA_VISTA_PROPERTY_ID = 'appfolio-18';
const PRE_EXISTING_PROPERTY_ID = 'e4b440e9-5062-4da1-ae25-818dffab8b3b';

// Enumerate runtime-union shapes so any future accidental widening fails
// this test rather than silently leaking into consumers.
const ALLOWED_POLICY_TYPES: InsurancePolicyType[] = [
    'liability', 'property', 'flood', 'umbrella', 'workers_comp', 'auto', 'other',
];
const ALLOWED_POLICY_STATUSES: InsurancePolicyStatus[] = [
    'active', 'expired', 'cancelled', 'pending',
];
const ALLOWED_ENFORCEMENT_STATUSES: EnforcementStatus[] = [
    'required', 'not-required', 'lapsed', 'fulfilled',
];

// Keys exclusive to Task 1.1..1.5 schemas; must NEVER appear on an
// InsurancePolicy row.
const TASK_1_1_EXCLUSIVE_KEYS = ['occupancyId', 'emergencyContacts', 'animals', 'vehicles', 'isPrimaryTenant'];
const TASK_1_2_EXCLUSIVE_KEYS = ['vendorFederalTax', 'vendorAccountingInfo', 'vendorCompliance', 'paymentMethod', 'send1099'];
const TASK_1_3_EXCLUSIVE_KEYS = ['purchaseHistory', 'lateFeePolicy', 'maintenanceConfig', 'fixedAssets', 'parcelNumber'];
const TASK_1_4_EXCLUSIVE_KEYS = [
    'residentAvailability', 'actionsLog', 'laborEntries', 'purchaseOrders',
    'workOrderNumber', 'permissionToEnter', 'ownerApproved', 'trade',
    'vendorInstructions', 'nextFollowUpDate',
];
const TASK_1_5_EXCLUSIVE_KEYS = ['account', 'nextChargeDate', 'previousChargeDate', 'previousStatus', 'tenantId'];

// Narrower than complianceEngine.test.ts's TASK_2_3_EXCLUSIVE_KEYS:
// `expirationDate` is legitimately shared between ComplianceRecord and
// InsurancePolicy, so we drop it from the set of keys forbidden on
// InsurancePolicy rows. The remaining three are truly 2.3-exclusive.
const TASK_2_3_COMPLIANCE_EXCLUSIVE = ['itemType', 'coverageLimits', 'lastAuditedAt'];

// Keys exclusive to Task 2.5 InsurancePolicy; must NEVER appear on
// ComplianceRecord / Workitem / RecurringCharge rows. 11 keys total.
// `carrier` and `policyNumber` are omitted because they are already
// declared on ComplianceRecord (Task 2.3) and are legitimately shared.
const TASK_2_5_EXCLUSIVE_KEYS = [
    'enforcementStatus', 'leaseRequiresInsurance', 'insuranceRequirement',
    'activeCoverageVerified', 'policyType', 'agentName', 'agentPhone',
    'premiumAnnual', 'coverageAmount', 'deductible', 'effectiveDate',
];

describe('insurance parity — InsuranceModule FolioGuard enforcement (Task 2.5)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/insurance_policies.json')) {
                return { ok: true, json: async () => insuranceSeed } as Response;
            }
            if (url.endsWith('/data/folioguard_rollup.json')) {
                return { ok: true, json: async () => folioguardRollupSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('seed length is exactly 6 (2 pre-existing + 4 Task-2.5 new) vs pre-Task-2.5 length-2 snapshot', () => {
        const seed = insuranceSeed as unknown as InsurancePolicy[];
        expect(seed).toHaveLength(6);
        const riverwood = seed.filter(r => r.propertyId === RIVERWOOD_PROPERTY_ID);
        const buenaVista = seed.filter(r => r.propertyId === BUENA_VISTA_PROPERTY_ID);
        const preExisting = seed.filter(r => r.propertyId === PRE_EXISTING_PROPERTY_ID);
        expect(riverwood).toHaveLength(3);
        expect(buenaVista).toHaveLength(1);
        expect(preExisting).toHaveLength(2);
    });

    it('all 6 rows honor the declared union shapes: policyType ∈ 7, status ∈ 4, enforcementStatus ∈ 4', () => {
        const seed = insuranceSeed as unknown as InsurancePolicy[];
        for (const row of seed) {
            expect(ALLOWED_POLICY_TYPES.includes(row.policyType)).toBe(true);
            expect(ALLOWED_POLICY_STATUSES.includes(row.status)).toBe(true);
            if (row.enforcementStatus !== undefined) {
                expect(ALLOWED_ENFORCEMENT_STATUSES.includes(row.enforcementStatus)).toBe(true);
            }
        }
        // Every row in the seed carries enforcementStatus post-Task-2.5
        // (both pre-existing rows got the optional field added).
        for (const row of seed) {
            expect(row.enforcementStatus).toBeDefined();
        }
    });

    it('Task-2.5 added rows exercise all 4 EnforcementStatus values across the property set', () => {
        const seed = insuranceSeed as unknown as InsurancePolicy[];
        const statuses = new Set(seed.map(r => r.enforcementStatus));
        expect(statuses.has('fulfilled')).toBe(true);
        expect(statuses.has('lapsed')).toBe(true);
        expect(statuses.has('required')).toBe(true);
        expect(statuses.has('not-required')).toBe(true);

        // Riverwood Club must cover fulfilled / lapsed / required (for the rollup).
        const river = seed.filter(r => r.propertyId === RIVERWOOD_PROPERTY_ID);
        const riverStatuses = new Set(river.map(r => r.enforcementStatus));
        expect(riverStatuses.has('fulfilled')).toBe(true);
        expect(riverStatuses.has('lapsed')).toBe(true);
        expect(riverStatuses.has('required')).toBe(true);

        // PII redaction: all rows' agentName + agentPhone are empty strings.
        for (const row of seed) {
            expect(row.agentName).toBe('');
            expect(row.agentPhone).toBe('');
        }
    });

    it('FolioGuard rollup lineage: folioguard_rollup.json aggregate agrees with Riverwood Club rows in insurance_policies.json', () => {
        const rollups = folioguardRollupSeed as unknown as FolioGuardRollup[];
        expect(rollups).toHaveLength(1);
        const rollup = rollups[0];
        expect(rollup.propertyId).toBe(RIVERWOOD_PROPERTY_ID);
        expect(rollup.propertyName).toBe(RIVERWOOD_PROPERTY_NAME);

        // Derive the aggregate from the 3 Riverwood rows and compare.
        const river = (insuranceSeed as unknown as InsurancePolicy[])
            .filter(r => r.propertyId === RIVERWOOD_PROPERTY_ID);
        expect(rollup.totalPolicies).toBe(river.length);
        expect(rollup.fulfilled).toBe(river.filter(r => r.enforcementStatus === 'fulfilled').length);
        expect(rollup.lapsed).toBe(river.filter(r => r.enforcementStatus === 'lapsed').length);
        expect(rollup.required).toBe(river.filter(r => r.enforcementStatus === 'required').length);
        expect(rollup.notRequired).toBe(river.filter(r => r.enforcementStatus === 'not-required').length);

        const denom = rollup.required + rollup.fulfilled + rollup.lapsed;
        const derivedRatio = denom > 0 ? rollup.lapsed / denom : 0;
        // Fixture stores 0.333; allow ±0.001 tolerance for rounding.
        expect(Math.abs(rollup.lapsedRatio - derivedRatio)).toBeLessThan(0.001);
        expect(['on-track', 'attention', 'overdue']).toContain(rollup.status);
    });

    it('static API: /insurance-policies returns 6 rows; ?enforcementStatus=lapsed returns 2; /insurance/folioguard-rollup returns rollup by propertyId', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const all = await strataGet<InsurancePolicy[]>('/insurance-policies');
        expect(all).toHaveLength(6);

        const lapsed = await strataGet<InsurancePolicy[]>('/insurance-policies', { enforcementStatus: 'lapsed' });
        // 2 lapsed: pre-existing FEMA NFIP + new Liberty Mutual Riverwood.
        expect(lapsed).toHaveLength(2);
        for (const row of lapsed) {
            expect(row.enforcementStatus).toBe('lapsed');
        }

        const riverRollup = await strataGet<FolioGuardRollup | null>('/insurance/folioguard-rollup', { propertyId: RIVERWOOD_PROPERTY_ID });
        expect(riverRollup).not.toBeNull();
        expect(riverRollup!.propertyId).toBe(RIVERWOOD_PROPERTY_ID);
        expect(riverRollup!.totalPolicies).toBe(3);
        expect(riverRollup!.lapsed).toBe(1);

        // No-param form returns the first rollup (demo-friendly fallback).
        const defaultRollup = await strataGet<FolioGuardRollup | null>('/insurance/folioguard-rollup');
        expect(defaultRollup).not.toBeNull();
        expect(defaultRollup!.propertyId).toBe(RIVERWOOD_PROPERTY_ID);
    });

    it('cross-type contamination guard (bidirectional): InsurancePolicy and ComplianceRecord/Workitem/RecurringCharge schemas do not bleed', () => {
        const insRows = insuranceSeed as unknown as Record<string, unknown>[];
        const compRows = complianceSeed as unknown as Record<string, unknown>[];
        const wiRows = workitemsSeed as unknown as Record<string, unknown>[];
        const rcRows = recurringChargesSeed as unknown as Record<string, unknown>[];

        // Direction A: InsurancePolicy rows must NOT carry any Task-1.x
        // exclusive key OR any key that is exclusive to ComplianceRecord
        // (narrower than full TASK_2_3_EXCLUSIVE_KEYS — drops expirationDate).
        const forbiddenOnInsurance = [
            ...TASK_1_1_EXCLUSIVE_KEYS, ...TASK_1_2_EXCLUSIVE_KEYS,
            ...TASK_1_3_EXCLUSIVE_KEYS, ...TASK_1_4_EXCLUSIVE_KEYS,
            ...TASK_1_5_EXCLUSIVE_KEYS, ...TASK_2_3_COMPLIANCE_EXCLUSIVE,
        ];
        for (const row of insRows) {
            for (const key of forbiddenOnInsurance) {
                expect(
                    row[key],
                    `InsurancePolicy ${String(row.id)} must not carry forbidden key '${key}'`,
                ).toBeUndefined();
            }
        }

        // Direction B: ComplianceRecord / Workitem / RecurringCharge rows must
        // NOT carry any Task-2.5-exclusive key.
        for (const row of compRows) {
            for (const key of TASK_2_5_EXCLUSIVE_KEYS) {
                expect(
                    row[key],
                    `ComplianceRecord ${String(row.id)} must not carry Task-2.5 key '${key}'`,
                ).toBeUndefined();
            }
        }
        for (const wi of wiRows) {
            for (const key of TASK_2_5_EXCLUSIVE_KEYS) {
                expect(
                    wi[key],
                    `Workitem ${String(wi.id)} must not carry Task-2.5 key '${key}'`,
                ).toBeUndefined();
            }
        }
        for (const rc of rcRows) {
            for (const key of TASK_2_5_EXCLUSIVE_KEYS) {
                expect(
                    rc[key],
                    `RecurringCharge ${String(rc.id)} must not carry Task-2.5 key '${key}'`,
                ).toBeUndefined();
            }
        }
    });

    it('PII guard: no SSN / bank / card / real-email-domain / parenthesized-phone patterns in insurance_policies.json or folioguard_rollup.json', () => {
        const blob = `${JSON.stringify(insuranceSeed)}\n${JSON.stringify(folioguardRollupSeed)}`;
        // SSN (NNN-NN-NNNN).
        expect(blob).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
        // 9+ contiguous digits (raw bank routing / account runs).
        expect(blob).not.toMatch(/\b\d{9,}\b/);
        // Credit-card style 13-19 digit runs.
        expect(blob).not.toMatch(/\b(?:\d[ -]*?){13,19}\b/);
        // Real-email domains.
        expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|aol|icloud|me|mac|live|msn)\.(?:com|net|org)\b/i);
        // Parenthesized US phone.
        expect(blob).not.toMatch(/\(\d{3}\)\s*\d{3}-\d{4}/);
        // Dashed US phone (NNN-NNN-NNNN) — also a PII-scanner pattern.
        expect(blob).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
    });
});
