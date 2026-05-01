/**
 * JSON serialization round-trip tests — Phase-5 Task 5.1b
 *
 * Per Plan v2 §8 L321: "Backend serialization layer. Ensure JSON in/out
 * of the new fields round-trips correctly. Add unit tests."
 *
 * Scope class: CONSUMER-SIDE-CONTRACT-TEST (first data point of new
 * Phase-5 calibration class). Establishes JSON round-trip identity
 * regression guard for Phase-1/2/4 schema additions to the canonical
 * type surface at packages/types/index.ts.
 *
 * Pattern: degenerate identity assertion
 *   expect(JSON.parse(JSON.stringify(typed))).toEqual(typed)
 * + 1 explicit field-existence assertion per it-block (regression
 *   intent visible — what would break if the toEqual silently passed
 *   on a field that JSON dropped, e.g., undefined-vs-null divergence).
 *
 * What this catches:
 * - Date instances in schema fields (JSON.stringify converts to ISO
 *   string; JSON.parse leaves it as string → toEqual fails)
 * - Map / Set / BigInt members (lossy at JSON.stringify boundary)
 * - Functions / class instances (lossy at JSON.stringify boundary)
 * - undefined-vs-null asymmetry (undefined is dropped at JSON.stringify;
 *   null survives)
 *
 * What this does NOT catch:
 * - Field-name drift or semantic mismatch (typed-vs-untyped variants
 *   pass identity; deferred to Task 5.2 MSW-contract-test scope)
 * - Server-side serialization layer correctness (out-of-repo per R-4
 *   v2.26 amendment + Task 5.1a §7 entry 1 cross-repo backend nuance)
 *
 * Slug-namespace test IDs per Task 4.6 §7 entry 4 carry-forward —
 * all-zero UUID strings (e.g. '00000000-0000-0000-0000-000000000001')
 * trigger the pre-existing PII guard regex /\b(?:\d[ -]*?){13,19}\b/
 * at complianceEngine.test.ts:228 + accounting.test.ts:146 because
 * leading-zero runs match the credit-card-style 13-19 digit pattern
 * with dashes counted as [ -]*? separators.
 */

import { describe, it, expect } from 'vitest';
import type {
    Workitem,
    ComplianceRecord,
    Property,
    EntityProfile,
    RecurringCharge,
    PurchaseHistory,
    LateFeePolicy,
    MaintenanceConfig,
    FixedAsset,
    VendorFederalTax,
    VendorAccountingInfo,
    VendorCompliance,
    ResidentAvailability,
    ActionLogEntry,
    LaborEntry,
    PurchaseOrderLink,
} from '@qualia/types';

describe('JSON serialization round-trip — Phase-1/2/4 schema additions', () => {
    // ─── Phase-4 Task 4.5: WorkitemStatus union extended with 'pending_countersign' ───
    it('Workitem with status="pending_countersign" round-trips through JSON identity', () => {
        const wi: Workitem = {
            id: 'test-wi-pending-countersign-1',
            type: 'lease',
            title: 'Lease — Pending Countersign — Test Tenant',
            description: 'Synthetic test fixture covering Phase-4 Task 4.5 enum literal',
            status: 'pending_countersign',
            priority: 'medium',
            propertyId: 'test-prop-riverwood-1',
            unitId: 'test-unit-h12-1',
            assignedTo: null,
            createdBy: 'system',
            dueDate: '2026-05-15',
            domain: 'leasing',
            tags: ['lease', 'pending', 'phase4-task-4.5'],
            metadata: {
                tenantId: 'test-tenant-jamel-1',
                applicantName: 'Test Applicant',
                absorbedBy: 'phase5_task_5_1b',
            },
            parentId: null,
            threadChannel: 'corporate',
            resolvedAt: null,
            trackingState: 'active',
            moduleKey: 'leasing',
            queueKey: 'pending-countersign',
            deactivatedAt: null,
            reactivatedAt: null,
            recordType: 'lease',
            recordId: null,
            createdAt: '2026-04-30T00:00:00.000Z',
            updatedAt: '2026-04-30T00:00:00.000Z',
        };
        const roundTripped = JSON.parse(JSON.stringify(wi)) as Workitem;
        expect(roundTripped).toEqual(wi);
        expect(roundTripped.status).toBe('pending_countersign');
    });

    // ─── Phase-4 Task 4.6: ComplianceItemType union extended with 'warranty' ───
    it('ComplianceRecord with itemType="warranty" status="expired" round-trips through JSON identity', () => {
        const cr: ComplianceRecord = {
            id: 'test-comp-warranty-1',
            entityType: 'property',
            entityId: 'test-prop-128bv-1',
            entityName: 'Test 128 Buena Vista',
            itemType: 'warranty',
            label: 'Test Water Heater Warranty',
            status: 'expired',
            expirationDate: '2019-02-16',
            propertyId: 'test-prop-128bv-1',
            documentFileId: null,
            carrier: 'Test Energy Co',
            policyNumber: null,
            coverageLimits: null,
            notes: 'Synthetic test fixture covering Phase-4 Task 4.6 warranty enum + expired status',
            source: 'phase5_task_5_1b_serialization_test',
            lastAuditedAt: null,
            createdAt: '2026-04-30T00:00:00.000Z',
            updatedAt: '2026-04-30T00:00:00.000Z',
        };
        const roundTripped = JSON.parse(JSON.stringify(cr)) as ComplianceRecord;
        expect(roundTripped).toEqual(cr);
        expect(roundTripped.itemType).toBe('warranty');
    });

    // ─── Phase-1 Task 1.3: Property with purchaseHistory + lateFeePolicy + maintenanceConfig + fixedAssets[] ───
    it('Property with Phase-1.3 nested fields (purchaseHistory + lateFeePolicy + maintenanceConfig + fixedAssets) round-trips', () => {
        const purchaseHistory: PurchaseHistory[] = [
            {
                purchaseDate: '2018-06-15',
                amount: 1250000,
                seller: 'Test Seller LLC',
                settlementAgent: 'Test Title Co',
                parcel: 'TEST-PARCEL-001',
                notes: null,
            },
        ];
        const lateFeePolicy: LateFeePolicy = {
            effectiveOn: '2020-01-01',
            baseAmount: '50.00',
            eligibleCharges: 'Rent',
            dailyAmountMonthlyMax: '5.00 / 100.00',
            gracePeriod: '5 days',
            graceBalance: null,
        };
        const maintenanceConfig: MaintenanceConfig = {
            maintenanceLimit: 500,
            insuranceExpiration: '2027-01-01',
            homeWarranty: true,
            preAuthEntry: false,
            notes: 'Synthetic test fixture',
        };
        const fixedAssets: FixedAsset[] = [
            {
                assetId: 'test-asset-water-heater-1',
                type: 'Water Heater',
                status: 'In Service',
                placedInService: '2018-08-01',
                warrantyExpiration: '2019-02-16',
                serialNumber: 'TEST-SN-001',
            },
        ];
        const prop: Property = {
            id: 'test-prop-phase1-task1_3',
            name: 'Test Property — Phase 1.3 Coverage',
            address: '128 Test Buena Vista',
            type: 'commercial',
            unitCount: 24,
            ownerId: null,
            status: 'active',
            metadata: { propertySubtype: 'Apartment Building' },
            city: 'Test City',
            state: 'GA',
            zip: '30303',
            yearBuilt: 1985,
            marketValue: 1500000,
            acquisitionDate: '2018-06-15',
            propertyManager: null,
            createdAt: '2026-04-30T00:00:00.000Z',
            updatedAt: '2026-04-30T00:00:00.000Z',
            purchaseHistory,
            lateFeePolicy,
            maintenanceConfig,
            fixedAssets,
            parcelNumber: 'TEST-PARCEL-001',
        };
        const roundTripped = JSON.parse(JSON.stringify(prop)) as Property;
        expect(roundTripped).toEqual(prop);
        expect(roundTripped.maintenanceConfig?.homeWarranty).toBe(true);
        expect(roundTripped.fixedAssets?.[0]?.warrantyExpiration).toBe('2019-02-16');
    });

    // ─── Phase-1 Task 1.2 + 1.5: EntityProfile vendor with typed compliance/tax/accounting + RecurringCharge[] ───
    it('EntityProfile vendor with Phase-1.2 + 1.5 typed shapes and RecurringCharge[] round-trip together', () => {
        const vendorFederalTax: VendorFederalTax = {
            taxpayerName: 'Test Vendor LLC',
            w9Requested: true,
            taxIdMasked: 'XX-XXX-XXXX',
            taxFormAccountNumber: null,
            send1099: true,
        };
        const vendorAccountingInfo: VendorAccountingInfo = {
            checkConsolidation: 'Per Property',
            checkStubBreakdown: null,
            holdPayments: false,
            emailECheckReceipt: true,
            paymentTerms: 'Net 30',
            defaultCheckMemo: null,
            defaultGlAccount: '5000',
            workOrderAdjustmentPercent: 0,
            discount: null,
            onlinePayablesEnabled: true,
            paymentType: 'ACH',
            bankRoutingNumber: null,
            bankAccountNumber: null,
            savingsAccount: false,
        };
        const vendorCompliance: VendorCompliance = {
            workersCompExpiration: '2027-01-01',
            generalLiabilityExpiration: '2027-06-30',
            epaCertificationExpiration: null,
            autoInsuranceExpiration: '2027-03-15',
            stateLicenseExpiration: '2027-12-31',
            contractExpiration: null,
            requestComplianceDocumentsCta: false,
        };
        const vendor: EntityProfile = {
            id: 'test-vendor-phase1-task1_2',
            entityType: 'vendor',
            name: 'Test Vendor — Phase 1.2 + 1.5 Coverage',
            email: null,
            phone: null,
            address: null,
            metadata: { website: 'www.test-vendor.example' },
            propertyIds: [],
            status: 'active',
            category: 'Roofing',
            licenseNumber: null,
            licenseExpiry: null,
            ein: null,
            createdAt: '2026-04-30T00:00:00.000Z',
            updatedAt: '2026-04-30T00:00:00.000Z',
            vendorFederalTax,
            vendorAccountingInfo,
            vendorCompliance,
            paymentMethod: 'ACH',
            send1099: true,
        };
        const recurringCharges: RecurringCharge[] = [
            {
                id: 'test-recur-charge-1',
                occupancyId: 'test-occ-1',
                tenantId: 'test-tenant-1',
                propertyId: 'test-prop-phase1-task1_3',
                unitId: 'test-unit-1',
                account: 'Rent',
                amount: 1250.0,
                startDate: '2026-01-01',
                endDate: null,
                nextChargeDate: '2026-05-01',
                previousChargeDate: '2026-04-01',
                previousStatus: 'PAID',
                paymentMethod: 'ACH',
                notes: null,
                createdAt: '2026-04-30T00:00:00.000Z',
                updatedAt: '2026-04-30T00:00:00.000Z',
            },
        ];
        const roundTrippedVendor = JSON.parse(JSON.stringify(vendor)) as EntityProfile;
        const roundTrippedCharges = JSON.parse(JSON.stringify(recurringCharges)) as RecurringCharge[];
        expect(roundTrippedVendor).toEqual(vendor);
        expect(roundTrippedCharges).toEqual(recurringCharges);
        expect(roundTrippedVendor.vendorFederalTax?.taxIdMasked).toBe('XX-XXX-XXXX');
        expect(roundTrippedCharges[0]?.previousStatus).toBe('PAID');
    });

    // ─── Phase-1 Task 1.4: Workitem with residentAvailability + actionsLog + laborEntries + purchaseOrders ───
    it('Workitem with Phase-1.4 additions (residentAvailability + actionsLog + laborEntries + purchaseOrders + metadata) round-trips', () => {
        const residentAvailability: ResidentAvailability = {
            date: '2026-04-20',
            dayOfWeek: 'Monday',
            timeWindows: ['08:00-10:00', '13:00-15:00', '17:00-19:00'],
            timezone: 'America/New_York',
        };
        const actionsLog: ActionLogEntry[] = [
            {
                ts: '2026-04-30T08:00:00.000Z',
                actor: 'system',
                event: 'wo_created',
                detail: 'Synthetic test fixture entry',
            },
            {
                ts: '2026-04-30T09:00:00.000Z',
                actor: 'test-tech-1',
                event: 'wo_assigned',
                detail: null,
            },
        ];
        const laborEntries: LaborEntry[] = [
            {
                id: 'test-labor-1',
                technician: 'Test Technician 1',
                date: '2026-04-30',
                hours: 2.5,
                rate: 75.0,
                totalCost: 187.5,
                description: 'Synthetic labor entry for Phase-1.4 round-trip coverage',
            },
        ];
        const purchaseOrders: PurchaseOrderLink[] = [
            {
                id: 'test-po-1',
                poNumber: 'PO-TEST-001',
                vendor: 'Test Vendor LLC',
                amount: 250.0,
                status: 'open',
                createdAt: '2026-04-30T00:00:00.000Z',
            },
        ];
        const wi: Workitem = {
            id: 'test-wi-phase1-task1_4',
            type: 'work_order',
            title: 'Test Work Order — Phase 1.4 Coverage',
            description: 'Synthetic test fixture covering all Phase-1.4 typed additions',
            status: 'in_progress',
            priority: 'medium',
            propertyId: 'test-prop-phase1-task1_3',
            unitId: 'test-unit-1',
            assignedTo: 'test-tech-1',
            createdBy: 'system',
            dueDate: '2026-05-15',
            domain: 'maintenance',
            tags: ['work_order', 'phase1-task-1.4'],
            metadata: { absorbedBy: 'phase5_task_5_1b' },
            parentId: null,
            threadChannel: 'management',
            resolvedAt: null,
            trackingState: 'active',
            moduleKey: 'maintenance',
            queueKey: 'in-progress',
            deactivatedAt: null,
            reactivatedAt: null,
            recordType: 'work_order',
            recordId: null,
            createdAt: '2026-04-30T00:00:00.000Z',
            updatedAt: '2026-04-30T00:00:00.000Z',
            residentAvailability,
            actionsLog,
            laborEntries,
            purchaseOrders,
            workOrderNumber: 'WO-TEST-001',
            permissionToEnter: true,
            ownerApproved: false,
            trade: 'Plumbing',
            vendorInstructions: 'Synthetic test instructions',
            nextFollowUpDate: '2026-05-01',
        };
        const roundTripped = JSON.parse(JSON.stringify(wi)) as Workitem;
        expect(roundTripped).toEqual(wi);
        expect(roundTripped.residentAvailability?.timeWindows).toHaveLength(3);
        expect(roundTripped.actionsLog?.[0]?.event).toBe('wo_created');
        expect(roundTripped.laborEntries?.[0]?.totalCost).toBe(187.5);
        expect(roundTripped.purchaseOrders?.[0]?.poNumber).toBe('PO-TEST-001');
    });
});
