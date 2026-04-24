/**
 * AppFolio parity contract test — CommunicationModule seed (Task 2.2)
 *
 * Contract: communications.json grows 0 -> 6 rows spanning 3 real
 * properties.json UUIDs, 4 ChannelType values (email/sms/portal/
 * internal), both DirectionType values, 2 threads + 1 solo message.
 * /communications/thread-rollup aggregates these into
 * CommunicationThreadRollup objects. Task 2.7's /audit/unified-timeline
 * join "lights up" source: 'communication' automatically via its
 * pre-existing defensive propertyId read at strataApi.static.ts:252.
 *
 * Cross-type contamination guard (HARD GR): bidirectional.
 *   - TASK_2_2_EXCLUSIVE_KEYS forbidden on compliance.json /
 *     insurance_policies.json / workitems.json / recurring_charges.json /
 *     audit_timeline_index.json rows.
 *   - Task-1.x + 2.3 + 2.5 + 2.7 exclusive keys forbidden on
 *     communications.json rows (communications has no upstream-task
 *     schema concerns; the Communication interface is Phase-0).
 *
 * PII guard: communications.json is the highest-PII-risk fixture in
 * the parity surface. Every row's addresses use @dwellium.example
 * (fictional domain — deliberately outside the PII scanner's
 * real-domain set gmail|yahoo|hotmail|outlook|aol|icloud|me|mac|live|msn
 * × com|net|org). Bodies are fabricated helpful-content paragraphs.
 * Scan verifies SSN / 9+-digit / card / real-email-domain /
 * parenthesized-phone / dashed-phone all 0 matches.
 *
 * Source of truth: Plan v2.3 §8 L305 ("Task 2.2 (Communication seed)")
 * + v2.4 §9 tracker row added by this PR.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
    Communication,
    CommunicationReadStatus,
    CommunicationThreadRollup,
    ChannelType,
    DirectionType,
} from '../../components/StrataDashboard/strataTypes';
import communicationsSeed from '../../../public/data/communications.json';
import auditTimelineIndexSeed from '../../../public/data/audit_timeline_index.json';
import complianceSeed from '../../../public/data/compliance.json';
import insuranceSeed from '../../../public/data/insurance_policies.json';
import workitemsSeed from '../../../public/data/workitems.json';
import recurringChargesSeed from '../../../public/data/recurring_charges.json';
import propertiesSeed from '../../../public/data/properties.json';

// Canonical FKs — all real properties.json UUIDs (DoR-PRE1 verified).
const BUENA_VISTA_PROPERTY_ID = 'e4b440e9-5062-4da1-ae25-818dffab8b3b';
const WOODLAND_PARC_PROPERTY_ID = '52d4e301-3cbf-4a32-91eb-d20be9d06959';
const RIVERWOOD_PROPERTY_ID = '705a6f52-f4a1-403b-ae3f-b3954b2cdac1';

const ALLOWED_CHANNELS: ChannelType[] = ['email', 'phone', 'sms', 'portal', 'internal'];
const ALLOWED_DIRECTIONS: DirectionType[] = ['inbound', 'outbound'];
const ALLOWED_READ_STATUSES: CommunicationReadStatus[] = ['unread', 'read', 'archived'];

// Task 2.2 — keys EXCLUSIVE to Communication / CommunicationThreadRollup.
// Grep-verified at commit time (see commit 5 message body): 8 keys, all
// 0-hit across the 5 target fixtures. `channel` and `direction` promoted
// from "potentially shared" to "confirmed exclusive" by the extended grep.
// `subject` + `body` deliberately NOT added (0-hit today but semantically
// generic English words that future fixtures might legitimately use —
// e.g., notification templates, form schemas).
const TASK_2_2_EXCLUSIVE_KEYS = [
    'threadId', 'preview', 'readStatus', 'attachmentCount',
    'fromAddress', 'toAddress', 'channel', 'direction',
];

// Reverse-direction forbidden keys: Task-1.x + 2.3 + 2.5 + 2.7 exclusive
// keys must NOT appear on any Communication row.
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
const TASK_2_7_EXCLUSIVE_KEYS = [
    'category', 'relatedComplianceId', 'relatedPolicyId',
    'relatedWorkitemId', 'sourceBreakdown',
];

describe('communication parity — CommunicationModule seed + thread rollup (Task 2.2)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/communications.json')) {
                return { ok: true, json: async () => communicationsSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('canonical types shape — Communication additive fields, CommunicationReadStatus 3-value union, CommunicationThreadRollup shape', () => {
        expect(ALLOWED_CHANNELS).toHaveLength(5);
        expect(ALLOWED_DIRECTIONS).toHaveLength(2);
        expect(ALLOWED_READ_STATUSES).toHaveLength(3);

        // Every seeded row carries the Task 2.2 additive fields.
        const seed = communicationsSeed as unknown as Communication[];
        for (const r of seed) {
            expect(r.propertyId).toBeDefined();
            expect(r.threadId !== undefined).toBe(true); // may be null
            expect(r.preview).toBeDefined();
            expect(r.readStatus).toBeDefined();
            expect(r.attachmentCount).toBeDefined();
        }
    });

    it('seed contract — communications.json has 6 rows; every propertyId exists in properties.json (DoR-PRE2); union values all allowed', () => {
        const seed = communicationsSeed as unknown as Communication[];
        expect(seed).toHaveLength(6);

        // DoR-PRE2: every propertyId is a real properties.json UUID.
        const realPropertyIds = new Set((propertiesSeed as unknown as Array<{ id: string }>).map(p => p.id));
        for (const r of seed) {
            expect(r.propertyId).toBeTruthy();
            expect(realPropertyIds.has(r.propertyId as string)).toBe(true);
        }

        // Union membership on every row.
        for (const r of seed) {
            expect(ALLOWED_CHANNELS.includes(r.channel)).toBe(true);
            expect(ALLOWED_DIRECTIONS.includes(r.direction)).toBe(true);
            if (r.readStatus !== undefined) {
                expect(ALLOWED_READ_STATUSES.includes(r.readStatus)).toBe(true);
            }
        }

        // Property distribution: 2 / 2 / 2 across BV / WP / RV.
        expect(seed.filter(r => r.propertyId === BUENA_VISTA_PROPERTY_ID)).toHaveLength(2);
        expect(seed.filter(r => r.propertyId === WOODLAND_PARC_PROPERTY_ID)).toHaveLength(2);
        expect(seed.filter(r => r.propertyId === RIVERWOOD_PROPERTY_ID)).toHaveLength(2);
    });

    it('static API /communications returns 6 rows (no param); ?propertyId=<BV UUID> returns 2; camelCase+snake_case auto-map via filterBy', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const all = await strataGet<Communication[]>('/communications');
        expect(all).toHaveLength(6);

        // filterBy auto-handles camelCase.
        const bvCamel = await strataGet<Communication[]>('/communications', { propertyId: BUENA_VISTA_PROPERTY_ID });
        expect(bvCamel).toHaveLength(2);
        for (const r of bvCamel) expect(r.propertyId).toBe(BUENA_VISTA_PROPERTY_ID);

        const wp = await strataGet<Communication[]>('/communications', { propertyId: WOODLAND_PARC_PROPERTY_ID });
        expect(wp).toHaveLength(2);

        const rv = await strataGet<Communication[]>('/communications', { propertyId: RIVERWOOD_PROPERTY_ID });
        expect(rv).toHaveLength(2);
    });

    it('static API /communications?channel=email&direction=inbound compound filter returns exactly 1 row (BV inbound email)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const inboundEmails = await strataGet<Communication[]>('/communications', {
            channel: 'email',
            direction: 'inbound',
        });
        expect(inboundEmails).toHaveLength(1);
        expect(inboundEmails[0].propertyId).toBe(BUENA_VISTA_PROPERTY_ID);
        expect(inboundEmails[0].subject).toMatch(/Scheduled maintenance/i);
    });

    it('static API /communications?threadId=<bv-maint-thread> returns the 2 BV messages in that thread', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const thread = await strataGet<Communication[]>('/communications', {
            threadId: 'thread-bv-maint-001',
        });
        expect(thread).toHaveLength(2);
        for (const r of thread) {
            expect(r.threadId).toBe('thread-bv-maint-001');
            expect(r.propertyId).toBe(BUENA_VISTA_PROPERTY_ID);
        }
        // Thread covers both directions.
        const dirs = new Set(thread.map(r => r.direction));
        expect(dirs.has('inbound')).toBe(true);
        expect(dirs.has('outbound')).toBe(true);
    });

    it('static API /communications/thread-rollup aggregates by threadId; no-param returns 4 rollups (3 threads + 1 solo); ?propertyId= filters', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const rollups = await strataGet<CommunicationThreadRollup[]>('/communications/thread-rollup');
        // 3 threads (bv-maint / wp-alarm / rv-rent) + 1 solo for comm-rv-002 = 4.
        expect(rollups).toHaveLength(4);

        const bvMaint = rollups.find(r => r.threadId === 'thread-bv-maint-001')!;
        expect(bvMaint).toBeDefined();
        expect(bvMaint.messageCount).toBe(2);
        expect(bvMaint.propertyId).toBe(BUENA_VISTA_PROPERTY_ID);
        expect(bvMaint.unreadCount).toBe(1); // comm-bv-002 is unread
        expect(bvMaint.participantCount).toBe(2); // manager + resident-bv-01
        expect(bvMaint.channels).toEqual(['email']);

        const wpAlarm = rollups.find(r => r.threadId === 'thread-wp-alarm-001')!;
        expect(wpAlarm.messageCount).toBe(2);
        expect([...wpAlarm.channels].sort()).toEqual(['portal', 'sms']);
        expect(wpAlarm.unreadCount).toBe(0);

        // Solo row (threadId === null).
        const solo = rollups.find(r => r.threadId === null);
        expect(solo).toBeDefined();
        expect(solo!.messageCount).toBe(1);

        // Chronological descending by lastMessageAt.
        for (let i = 1; i < rollups.length; i++) {
            expect(rollups[i - 1].lastMessageAt >= rollups[i].lastMessageAt).toBe(true);
        }

        // Property scope: Riverwood returns 1 thread + 1 solo = 2.
        const rvRollups = await strataGet<CommunicationThreadRollup[]>('/communications/thread-rollup', { propertyId: RIVERWOOD_PROPERTY_ID });
        expect(rvRollups).toHaveLength(2);
        for (const r of rvRollups) expect(r.propertyId).toBe(RIVERWOOD_PROPERTY_ID);
    });

    it('cross-type contamination guard (bidirectional): Task 2.2 keys forbidden on upstream fixtures; Task-1.x/2.3/2.5/2.7 keys forbidden on communications rows', () => {
        const commRows = communicationsSeed as unknown as Record<string, unknown>[];
        const compRows = complianceSeed as unknown as Record<string, unknown>[];
        const insRows = insuranceSeed as unknown as Record<string, unknown>[];
        const wiRows = workitemsSeed as unknown as Record<string, unknown>[];
        const rcRows = recurringChargesSeed as unknown as Record<string, unknown>[];
        const atiRows = auditTimelineIndexSeed as unknown as Record<string, unknown>[];

        // Direction A: no TASK_2_2 exclusive key on any upstream row.
        for (const row of [...compRows, ...insRows, ...wiRows, ...rcRows, ...atiRows]) {
            for (const key of TASK_2_2_EXCLUSIVE_KEYS) {
                expect(
                    row[key],
                    `upstream fixture row must not carry Task-2.2 exclusive key '${key}'`,
                ).toBeUndefined();
            }
        }

        // Direction B: no Task-1.x / 2.3 / 2.5 / 2.7 exclusive key on any Communication row.
        const forbiddenOnComm = [
            ...TASK_1_1_EXCLUSIVE_KEYS, ...TASK_1_2_EXCLUSIVE_KEYS,
            ...TASK_1_3_EXCLUSIVE_KEYS, ...TASK_1_4_EXCLUSIVE_KEYS,
            ...TASK_1_5_EXCLUSIVE_KEYS, ...TASK_2_3_COMPLIANCE_EXCLUSIVE,
            ...TASK_2_5_EXCLUSIVE_KEYS, ...TASK_2_7_EXCLUSIVE_KEYS,
        ];
        for (const row of commRows) {
            for (const key of forbiddenOnComm) {
                expect(
                    row[key],
                    `Communication row ${String(row.id)} must not carry forbidden key '${key}'`,
                ).toBeUndefined();
            }
        }
    });

    it('PII guard: no SSN / bank / card / real-email-domain / parenthesized-phone / dashed-phone patterns in communications.json', () => {
        const blob = JSON.stringify(communicationsSeed);
        // SSN (NNN-NN-NNNN).
        expect(blob).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
        // 9+ contiguous digits (raw bank routing / account runs).
        expect(blob).not.toMatch(/\b\d{9,}\b/);
        // Credit-card style 13-19 digit runs.
        expect(blob).not.toMatch(/\b(?:\d[ -]*?){13,19}\b/);
        // Real-email domains (matches PII scanner's regex exactly).
        expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|aol|icloud|me|mac|live|msn)\.(?:com|net|org)\b/i);
        // Parenthesized US phone.
        expect(blob).not.toMatch(/\(\d{3}\)\s*\d{3}-\d{4}/);
        // Dashed US phone.
        expect(blob).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);

        // Positive check — all addresses use the fictional @dwellium.example domain
        // OR are explicit non-email labels ("Dwellium Alerts" on the sms row).
        const seed = communicationsSeed as unknown as Communication[];
        for (const r of seed) {
            const from = r.fromAddress || '';
            if (from.includes('@')) {
                expect(from).toMatch(/@dwellium\.example$/);
            }
            const to = r.toAddress || '';
            if (to.includes('@')) {
                expect(to).toMatch(/@dwellium\.example$/);
            }
        }
    });
});
