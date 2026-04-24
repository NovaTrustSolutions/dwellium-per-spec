/**
 * AppFolio parity contract test — AuditModule unified timeline (Task 2.7)
 *
 * Contract: /audit/unified-timeline is a QUERY-TIME JOIN across 5 source
 * tables (compliance + insurance + workitem actionsLog + audit_log +
 * communication). Each AuditEvent carries an explicit `source` provenance
 * tag drawn from the AuditEventSource literal union — no computed-key
 * source propagation from input params. Type-confusion (a compliance row
 * masquerading as an insurance event and carrying insurance-exclusive
 * keys) is structurally impossible by the handler's design.
 *
 * The /audit/unified-timeline/snapshot route reads audit_timeline_index.json
 * (2-row metadata rollup). Both rows use REAL properties.json UUIDs
 * (DoR-PRE2 — no synthetic propertyIds, lesson from Task 2.5).
 *
 * Cross-type contamination guard (HARD GR): bidirectional.
 *   - No AuditEvent-exclusive key appears on any compliance / insurance /
 *     workitem / recurring_charge row.
 *   - No Task-1.x or Task-2.3 or Task-2.5 exclusive key appears on any
 *     audit_timeline_index row.
 *
 * PII guard: audit_timeline_index.json is scanned for SSN, bank, card,
 * real-email, and phone patterns.
 *
 * Source of truth: plan v2.2 §8 Task 2.7 (+ scheduling-pass §6 item #9).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
    AuditEvent,
    AuditEventSource,
    AuditEventSeverity,
    AuditEventCategory,
    UnifiedTimelineView,
} from '../../components/StrataDashboard/strataTypes';
import auditTimelineIndexSeed from '../../../public/data/audit_timeline_index.json';
import complianceSeed from '../../../public/data/compliance.json';
import insuranceSeed from '../../../public/data/insurance_policies.json';
import workitemsSeed from '../../../public/data/workitems.json';
import recurringChargesSeed from '../../../public/data/recurring_charges.json';
import auditLogSeed from '../../../public/data/audit_log.json';
import communicationsSeed from '../../../public/data/communications.json';
import propertiesSeed from '../../../public/data/properties.json';

// Canonical FKs — both real properties.json UUIDs (DoR-PRE2 verified).
const BUENA_VISTA_PROPERTY_ID = 'e4b440e9-5062-4da1-ae25-818dffab8b3b';
const WOODLAND_PARC_PROPERTY_ID = '52d4e301-3cbf-4a32-91eb-d20be9d06959';

const ALLOWED_AUDIT_SOURCES: AuditEventSource[] = [
    'compliance', 'insurance', 'workitem', 'audit_log', 'communication',
];
const ALLOWED_AUDIT_SEVERITIES: AuditEventSeverity[] = [
    'info', 'warning', 'critical',
];
const ALLOWED_AUDIT_CATEGORIES: AuditEventCategory[] = [
    'compliance_change', 'policy_enforcement', 'work_order_action',
    'user_action', 'communication',
];

// Task 2.7 — keys UNIQUE to AuditEvent / UnifiedTimelineView. Grep-
// verified at commit time (see commit message): 0 hits across
// compliance.json / insurance_policies.json / workitems.json /
// recurring_charges.json, so all 5 are safe to enforce as forbidden on
// those fixtures. `source` + `sourceId` are intentionally OMITTED
// because `source` collides with ComplianceRecord.source (Task 2.3 —
// "who reported the compliance item"), which is a legitimate shared
// key rather than a contamination signal.
const TASK_2_7_EXCLUSIVE_KEYS = [
    'category',
    'relatedComplianceId', 'relatedPolicyId', 'relatedWorkitemId',
    'sourceBreakdown',
];

// Reused (narrower) Task-1..2.5 forbidden-key lists for the reverse
// direction — audit_timeline_index.json rows must not carry any of
// these. Lists mirror insurance.test.ts but pruned for legitimate
// rollup-shared keys (propertyId, propertyName, total, generatedAt).
const TASK_1_1_EXCLUSIVE_KEYS = ['occupancyId', 'emergencyContacts', 'animals', 'vehicles', 'isPrimaryTenant'];
const TASK_1_2_EXCLUSIVE_KEYS = ['vendorFederalTax', 'vendorAccountingInfo', 'vendorCompliance', 'paymentMethod', 'send1099'];
const TASK_1_3_EXCLUSIVE_KEYS = ['purchaseHistory', 'lateFeePolicy', 'maintenanceConfig', 'fixedAssets', 'parcelNumber'];
const TASK_1_4_EXCLUSIVE_KEYS = [
    'residentAvailability', 'actionsLog', 'laborEntries', 'purchaseOrders',
    'workOrderNumber', 'permissionToEnter', 'ownerApproved', 'trade',
    'vendorInstructions', 'nextFollowUpDate',
];
const TASK_1_5_EXCLUSIVE_KEYS = ['account', 'nextChargeDate', 'previousChargeDate', 'previousStatus', 'tenantId'];
const TASK_2_3_COMPLIANCE_EXCLUSIVE = ['itemType', 'coverageLimits', 'lastAuditedAt', 'expirationDate'];
const TASK_2_5_EXCLUSIVE_KEYS = [
    'enforcementStatus', 'leaseRequiresInsurance', 'insuranceRequirement',
    'activeCoverageVerified', 'policyType', 'agentName', 'agentPhone',
    'premiumAnnual', 'coverageAmount', 'deductible', 'effectiveDate',
    'carrier', 'policyNumber', 'lapsedRatio',
];

describe('audit parity — AuditModule unified timeline (Task 2.7)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/compliance.json')) {
                return { ok: true, json: async () => complianceSeed } as Response;
            }
            if (url.endsWith('/data/insurance_policies.json')) {
                return { ok: true, json: async () => insuranceSeed } as Response;
            }
            if (url.endsWith('/data/workitems.json')) {
                return { ok: true, json: async () => workitemsSeed } as Response;
            }
            if (url.endsWith('/data/audit_log.json')) {
                return { ok: true, json: async () => auditLogSeed } as Response;
            }
            if (url.endsWith('/data/communications.json')) {
                return { ok: true, json: async () => communicationsSeed } as Response;
            }
            if (url.endsWith('/data/audit_timeline_index.json')) {
                return { ok: true, json: async () => auditTimelineIndexSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('canonical unions exist with expected membership (AuditEventSource 5, AuditEventSeverity 3, AuditEventCategory 5)', () => {
        // Allowlists double as runtime-union declarations. If someone
        // widens a union in packages/types without updating this test,
        // new values will silently pass the runtime checks below but
        // the static type annotation above will flag at compile time.
        expect(ALLOWED_AUDIT_SOURCES).toHaveLength(5);
        expect(ALLOWED_AUDIT_SEVERITIES).toHaveLength(3);
        expect(ALLOWED_AUDIT_CATEGORIES).toHaveLength(5);

        // Sanity: AuditEventSource matches the seed's sourceBreakdown keys.
        const rollupRows = auditTimelineIndexSeed as unknown as Array<Record<string, unknown>>;
        for (const row of rollupRows) {
            const sb = row.sourceBreakdown as Record<string, unknown>;
            for (const src of ALLOWED_AUDIT_SOURCES) {
                expect(sb, `row ${String(row.propertyId)} sourceBreakdown.${src}`).toHaveProperty(src);
            }
        }
    });

    it('static API /audit/unified-timeline (no param) returns UnifiedTimelineView; sourceBreakdown sums equal events.length; events sorted chronologically descending', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const view = await strataGet<UnifiedTimelineView>('/audit/unified-timeline');

        expect(view).toBeDefined();
        expect(Array.isArray(view.events)).toBe(true);
        expect(view.propertyId).toBeNull();
        expect(typeof view.generatedAt).toBe('string');
        expect(typeof view.total).toBe('number');

        // Every event has a literal source tag from the union.
        for (const ev of view.events) {
            expect(ALLOWED_AUDIT_SOURCES.includes(ev.source)).toBe(true);
            expect(ALLOWED_AUDIT_SEVERITIES.includes(ev.severity)).toBe(true);
            expect(ALLOWED_AUDIT_CATEGORIES.includes(ev.category)).toBe(true);
        }

        // sourceBreakdown is keyed on the full AuditEventSource union.
        for (const src of ALLOWED_AUDIT_SOURCES) {
            expect(view.sourceBreakdown).toHaveProperty(src);
        }

        // Totals agree. view.events is sliced at limit (default 100), so
        // sourceBreakdown counts the UNSLICED set — compare against total.
        const sum = ALLOWED_AUDIT_SOURCES.reduce((s, k) => s + (view.sourceBreakdown[k] ?? 0), 0);
        expect(sum).toBe(view.total);

        // Chronological descending.
        for (let i = 1; i < view.events.length; i++) {
            expect(view.events[i - 1].timestamp >= view.events[i].timestamp).toBe(true);
        }

        // Must include audit_log events when unscoped (370 rows in fixture).
        expect(view.sourceBreakdown.audit_log).toBeGreaterThan(0);
    });

    it('static API /audit/unified-timeline?propertyId=<BV UUID> filters every source; audit_log is EXCLUDED from property-scoped queries (cross-property leak guard)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const view = await strataGet<UnifiedTimelineView>('/audit/unified-timeline', {
            propertyId: BUENA_VISTA_PROPERTY_ID,
        });

        expect(view.propertyId).toBe(BUENA_VISTA_PROPERTY_ID);
        // BV has 2 insurance events, 0 compliance, 0 workitem actions, 0 comm.
        // audit_log must be excluded (rows have no propertyId — including
        // them would leak unscoped system events into the property view).
        expect(view.sourceBreakdown.audit_log).toBe(0);
        expect(view.sourceBreakdown.insurance).toBe(2);
        for (const ev of view.events) {
            if (ev.propertyId !== null) {
                expect(ev.propertyId).toBe(BUENA_VISTA_PROPERTY_ID);
            }
            // No event carrying `source: 'audit_log'` may appear in a
            // property-scoped response under any condition.
            expect(ev.source).not.toBe('audit_log');
        }

        // Woodland Parc: 2 workitem actionsLog events, 0 elsewhere.
        const wpView = await strataGet<UnifiedTimelineView>('/audit/unified-timeline', {
            propertyId: WOODLAND_PARC_PROPERTY_ID,
        });
        expect(wpView.sourceBreakdown.audit_log).toBe(0);
        expect(wpView.sourceBreakdown.workitem).toBe(2);
        expect(wpView.sourceBreakdown.insurance).toBe(0);
    });

    it('source provenance guard: no cross-source key leakage in event rows (type-confusion defense)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const view = await strataGet<UnifiedTimelineView>('/audit/unified-timeline');

        for (const ev of view.events) {
            // Every event carries exactly ONE related* FK matched to its source.
            if (ev.source === 'compliance') {
                expect(ev.relatedComplianceId).toBeDefined();
                expect(ev.relatedPolicyId).toBeUndefined();
                expect(ev.relatedWorkitemId).toBeUndefined();
            }
            if (ev.source === 'insurance') {
                expect(ev.relatedPolicyId).toBeDefined();
                expect(ev.relatedComplianceId).toBeUndefined();
                expect(ev.relatedWorkitemId).toBeUndefined();
            }
            if (ev.source === 'workitem') {
                expect(ev.relatedWorkitemId).toBeDefined();
                expect(ev.relatedComplianceId).toBeUndefined();
                expect(ev.relatedPolicyId).toBeUndefined();
            }
            if (ev.source === 'audit_log' || ev.source === 'communication') {
                expect(ev.relatedComplianceId).toBeUndefined();
                expect(ev.relatedPolicyId).toBeUndefined();
                expect(ev.relatedWorkitemId).toBeUndefined();
            }
            // Source literal integrity — cannot be an arbitrary string.
            expect(ALLOWED_AUDIT_SOURCES).toContain(ev.source);
        }
    });

    it('static API /audit/unified-timeline/snapshot returns the 3-row fixture; ?propertyId=<BV UUID> resolves to BV; all rows key on REAL properties.json UUIDs (DoR-PRE2)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');

        // No-param returns the full array. Length bumped 2 -> 3 by
        // Task 2.2 (+ Riverwood Club Apartments row added alongside
        // the communications.json seed). All three propertyIds remain
        // real properties.json UUIDs (DoR-PRE2 preserved).
        const all = await strataGet<typeof auditTimelineIndexSeed>('/audit/unified-timeline/snapshot');
        expect(Array.isArray(all)).toBe(true);
        expect(all).toHaveLength(3);

        // Every snapshot row's propertyId exists in properties.json (DoR-PRE2).
        const realPropertyIds = new Set((propertiesSeed as unknown as Array<{ id: string }>).map(p => p.id));
        for (const row of all as unknown as Array<{ propertyId: string; propertyName: string; total: number; sourceBreakdown: Record<string, number> }>) {
            expect(realPropertyIds.has(row.propertyId)).toBe(true);
            expect(typeof row.propertyName).toBe('string');
            expect(typeof row.total).toBe('number');
            const sbSum = ALLOWED_AUDIT_SOURCES.reduce((s, k) => s + (row.sourceBreakdown[k] ?? 0), 0);
            expect(sbSum).toBe(row.total);
        }

        // BV lookup.
        const bv = await strataGet<{ propertyId: string; propertyName: string; total: number } | null>(
            '/audit/unified-timeline/snapshot',
            { propertyId: BUENA_VISTA_PROPERTY_ID },
        );
        expect(bv).not.toBeNull();
        expect(bv!.propertyId).toBe(BUENA_VISTA_PROPERTY_ID);
        expect(bv!.propertyName).toBe('128 BUENA VISTA DR N');

        // Unknown propertyId returns null.
        const missing = await strataGet<{ propertyId: string } | null>(
            '/audit/unified-timeline/snapshot',
            { propertyId: 'definitely-not-in-the-fixture' },
        );
        expect(missing).toBeNull();
    });

    it('cross-type contamination guard (bidirectional): TASK_2_7 keys forbidden on compliance/insurance/workitem/recurring_charge rows; TASK_1..2.5 keys forbidden on audit_timeline_index rows', () => {
        const rollupRows = auditTimelineIndexSeed as unknown as Record<string, unknown>[];
        const compRows = complianceSeed as unknown as Record<string, unknown>[];
        const insRows = insuranceSeed as unknown as Record<string, unknown>[];
        const wiRows = workitemsSeed as unknown as Record<string, unknown>[];
        const rcRows = recurringChargesSeed as unknown as Record<string, unknown>[];

        // Direction A: no AuditEvent-/UnifiedTimelineView-exclusive key
        // may appear on any Task-2.3 / 2.5 / 1.x fixture row.
        // (Grep-verified at commit time across all 4 files: 0 hits.)
        for (const row of [...compRows, ...insRows, ...wiRows, ...rcRows]) {
            for (const key of TASK_2_7_EXCLUSIVE_KEYS) {
                expect(
                    row[key],
                    `upstream fixture row must not carry Task-2.7 exclusive key '${key}'`,
                ).toBeUndefined();
            }
        }

        // Direction B: no Task-1.x / 2.3 / 2.5 exclusive key may appear
        // on any audit_timeline_index.json row.
        const forbiddenOnRollup = [
            ...TASK_1_1_EXCLUSIVE_KEYS, ...TASK_1_2_EXCLUSIVE_KEYS,
            ...TASK_1_3_EXCLUSIVE_KEYS, ...TASK_1_4_EXCLUSIVE_KEYS,
            ...TASK_1_5_EXCLUSIVE_KEYS, ...TASK_2_3_COMPLIANCE_EXCLUSIVE,
            ...TASK_2_5_EXCLUSIVE_KEYS,
        ];
        for (const row of rollupRows) {
            for (const key of forbiddenOnRollup) {
                expect(
                    row[key],
                    `audit_timeline_index row ${String(row.propertyId)} must not carry forbidden key '${key}'`,
                ).toBeUndefined();
            }
        }
    });

    it('PII guard: no SSN / bank / card / real-email-domain / parenthesized-phone patterns in audit_timeline_index.json', () => {
        const blob = JSON.stringify(auditTimelineIndexSeed);
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
        // Dashed US phone (NNN-NNN-NNNN).
        expect(blob).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
    });
});
