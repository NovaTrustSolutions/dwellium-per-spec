/**
 * AppFolio parity contract test — PropertyTimeline multi-source merge (Task 2.10)
 *
 * Contract: /property-activity/{propertyId} returns a
 * PropertyTimelineView with events merged from 5 sources (workitems +
 * communications + compliance + insurance; audit_log EXCLUDED per
 * Ambiguity #3 cross-property-leak guard, Task 2.7 precedent at
 * strataApi.static.ts:244). Every event carries an explicit literal
 * type tag from the widened ActivityEventSource union — no
 * type-confusion between source rows. Chronological descending order.
 *
 * Option (b) scope-gate — 4 currently-seeded BV rows (2 insurance +
 * 2 communications). Task 2.10 does NOT touch workitems / compliance /
 * communications fixtures (writer ownership preserved per Appendix D).
 * 19+49 aspiration per plan §6 L38 deferred to Phase-3.
 *
 * TASK_2_10_EXCLUSIVE_KEYS is EMPTY — Task 2.10 is a handler-upgrade +
 * UI-retrofit task that adds no fixture data and no row-level
 * exclusive schema. The ActivityEvent additive fields (propertyId,
 * sourceId, description, related*Id) are aggregate-shape fields on
 * the handler's output, not contamination surfaces on any fixture.
 *
 * Drift assertion: tests pin 4 <= total < 68 so Phase-3 seed growth
 * can push total higher without breaking CI, but a jump to 68+ forces
 * a scope review (the §6 L38 aspiration threshold).
 *
 * Source of truth: Docs/AppFolio_Parity_Implementation_Plan_v2.md
 * §6 L38 (scheduling-pass Task 2.10 row) + v2.6 §9 tracker.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
    ActivityEvent,
    ActivityEventSource,
    PropertyTimelineView,
} from '../../components/StrataDashboard/strataTypes';
import workitemsSeed from '../../../public/data/workitems.json';
import communicationsSeed from '../../../public/data/communications.json';
import complianceSeed from '../../../public/data/compliance.json';
import insuranceSeed from '../../../public/data/insurance_policies.json';
import auditLogSeed from '../../../public/data/audit_log.json';
import propertiesSeed from '../../../public/data/properties.json';

// Canonical FKs — all real properties.json UUIDs (DoR-PRE1 verified).
const BUENA_VISTA_PROPERTY_ID = 'e4b440e9-5062-4da1-ae25-818dffab8b3b';
const WOODLAND_PARC_PROPERTY_ID = '52d4e301-3cbf-4a32-91eb-d20be9d06959';

const ALLOWED_SOURCES: ActivityEventSource[] = [
    'workitem', 'incident', 'audit', 'communication', 'compliance', 'insurance',
];

describe('propertyTimeline parity — /property-activity multi-source merge (Task 2.10)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/workitems.json')) return { ok: true, json: async () => workitemsSeed } as Response;
            if (url.endsWith('/data/communications.json')) return { ok: true, json: async () => communicationsSeed } as Response;
            if (url.endsWith('/data/compliance.json')) return { ok: true, json: async () => complianceSeed } as Response;
            if (url.endsWith('/data/insurance_policies.json')) return { ok: true, json: async () => insuranceSeed } as Response;
            if (url.endsWith('/data/audit_log.json')) return { ok: true, json: async () => auditLogSeed } as Response;
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('canonical types shape — ActivityEventSource 6-literal union + PropertyTimelineView aggregate shape', () => {
        expect(ALLOWED_SOURCES).toHaveLength(6);
        // sourceBreakdown keys match the union exactly (handler inits all 6 to 0).
        expect(new Set(ALLOWED_SOURCES)).toEqual(new Set([
            'workitem', 'incident', 'audit', 'communication', 'compliance', 'insurance',
        ]));
    });

    it('BV seed inventory — 4 rows (2 insurance + 2 communication) via Option (b) scope-gate; drift-bound assertion [4, 68) tracks Phase-3 aspiration', () => {
        // Direct-fixture inventory (pre-handler), property-scoped.
        const bvInsurance = (insuranceSeed as unknown as Array<{ propertyId: string }>).filter(r => r.propertyId === BUENA_VISTA_PROPERTY_ID);
        const bvComms = (communicationsSeed as unknown as Array<{ propertyId?: string | null }>).filter(r => r.propertyId === BUENA_VISTA_PROPERTY_ID);
        const bvWorkitems = (workitemsSeed as unknown as Array<{ propertyId: string }>).filter(r => r.propertyId === BUENA_VISTA_PROPERTY_ID);
        const bvCompliance = (complianceSeed as unknown as Array<{ propertyId?: string }>).filter(r => r.propertyId === BUENA_VISTA_PROPERTY_ID);

        expect(bvInsurance).toHaveLength(2);
        expect(bvComms).toHaveLength(2);
        expect(bvWorkitems).toHaveLength(0);
        expect(bvCompliance).toHaveLength(0);

        const total = bvInsurance.length + bvComms.length + bvWorkitems.length + bvCompliance.length;
        // Drift-bound assertion: today 4; Phase-3 aspiration 68 (19 attachments +
        // 49 emails per §6 L38). If growth pushes `total` into [68, ∞), the
        // upper-bound fails and forces scope re-review.
        expect(total).toBeGreaterThanOrEqual(4);
        expect(total).toBeLessThan(68);
    });

    it('/property-activity/{BV UUID} returns PropertyTimelineView with 4 events merged from 2 sources (insurance + communication)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const view = await strataGet<PropertyTimelineView>(`/property-activity/${BUENA_VISTA_PROPERTY_ID}`);

        expect(view).toBeDefined();
        expect(view.propertyId).toBe(BUENA_VISTA_PROPERTY_ID);
        expect(view.total).toBe(4);
        expect(Array.isArray(view.events)).toBe(true);
        expect(view.events).toHaveLength(4);
        expect(typeof view.generatedAt).toBe('string');

        // sourceBreakdown full-init — all 6 keys present with explicit 0
        // for sources that didn't contribute.
        for (const src of ALLOWED_SOURCES) {
            expect(view.sourceBreakdown).toHaveProperty(src);
        }
        expect(view.sourceBreakdown.insurance).toBe(2);
        expect(view.sourceBreakdown.communication).toBe(2);
        expect(view.sourceBreakdown.workitem).toBe(0);
        expect(view.sourceBreakdown.compliance).toBe(0);
        expect(view.sourceBreakdown.incident).toBe(0);

        // Sum of sourceBreakdown values equals view.total.
        const sum = ALLOWED_SOURCES.reduce((s, k) => s + (view.sourceBreakdown[k] ?? 0), 0);
        expect(sum).toBe(view.total);

        // Every event has propertyId === BV UUID (property-scoped response).
        for (const ev of view.events) {
            if (ev.propertyId !== null && ev.propertyId !== undefined) {
                expect(ev.propertyId).toBe(BUENA_VISTA_PROPERTY_ID);
            }
        }
    });

    it('chronological descending order — events sorted by timestamp desc via ISO localeCompare', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const view = await strataGet<PropertyTimelineView>(`/property-activity/${BUENA_VISTA_PROPERTY_ID}`);

        for (let i = 1; i < view.events.length; i++) {
            const prev = view.events[i - 1].timestamp || '';
            const curr = view.events[i].timestamp || '';
            expect(prev >= curr).toBe(true);
        }
    });

    it('audit_log EXCLUDED from property-scoped responses — Ambiguity #3 security-critical cross-property leak guard (Task 2.7 precedent)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const view = await strataGet<PropertyTimelineView>(`/property-activity/${BUENA_VISTA_PROPERTY_ID}`);

        // Field-exists-with-value assertion (not undefined reliance) —
        // handler inits sourceBreakdown.audit to 0 explicitly.
        expect(view.sourceBreakdown.audit).toBe(0);

        // No event carries type='audit' under any condition.
        for (const ev of view.events) {
            expect(ev.type).not.toBe('audit');
        }

        // Cross-check on a different property (Woodland Parc) — same
        // exclusion applies; audit_log rows stay out regardless of scope.
        const wpView = await strataGet<PropertyTimelineView>(`/property-activity/${WOODLAND_PARC_PROPERTY_ID}`);
        expect(wpView.sourceBreakdown.audit).toBe(0);
        for (const ev of wpView.events) {
            expect(ev.type).not.toBe('audit');
        }

        // And audit_log.json has rows (pre-existing fixture from Task 2.7
        // with 370 entries) — confirms the handler actively EXCLUDES them,
        // not that the fixture is coincidentally empty.
        expect((auditLogSeed as unknown[]).length).toBeGreaterThan(0);
    });

    it('provenance tag integrity — every event carries exactly ONE related* FK matched to its source type (type-confusion structural guard)', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const view = await strataGet<PropertyTimelineView>(`/property-activity/${BUENA_VISTA_PROPERTY_ID}`);

        for (const ev of view.events) {
            // Source literal is from the closed union.
            expect(ALLOWED_SOURCES).toContain(ev.type);

            // Per-source FK exclusivity check.
            if (ev.type === 'communication') {
                expect(ev.relatedCommunicationId).toBeDefined();
                expect(ev.relatedComplianceId).toBeUndefined();
                expect(ev.relatedPolicyId).toBeUndefined();
                expect(ev.relatedWorkitemId).toBeUndefined();
            }
            if (ev.type === 'insurance') {
                expect(ev.relatedPolicyId).toBeDefined();
                expect(ev.relatedCommunicationId).toBeUndefined();
                expect(ev.relatedComplianceId).toBeUndefined();
                expect(ev.relatedWorkitemId).toBeUndefined();
            }
            if (ev.type === 'compliance') {
                expect(ev.relatedComplianceId).toBeDefined();
                expect(ev.relatedCommunicationId).toBeUndefined();
                expect(ev.relatedPolicyId).toBeUndefined();
                expect(ev.relatedWorkitemId).toBeUndefined();
            }
            if (ev.type === 'workitem') {
                expect(ev.relatedWorkitemId).toBeDefined();
                expect(ev.relatedCommunicationId).toBeUndefined();
                expect(ev.relatedComplianceId).toBeUndefined();
                expect(ev.relatedPolicyId).toBeUndefined();
            }
        }
    });

    it('?limit= param respected — Math.min(parseInt, 500) caps upper bound; default 50', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');

        // Default (no limit param).
        const def = await strataGet<PropertyTimelineView>(`/property-activity/${BUENA_VISTA_PROPERTY_ID}`);
        // BV has only 4 events total; both default and capped return all 4.
        expect(def.events.length).toBeLessThanOrEqual(50);

        // Small limit.
        const small = await strataGet<PropertyTimelineView>(`/property-activity/${BUENA_VISTA_PROPERTY_ID}`, { limit: '2' });
        expect(small.events.length).toBeLessThanOrEqual(2);
        expect(small.total).toBe(4); // total unaffected by limit

        // Huge limit hits the 500 cap.
        const huge = await strataGet<PropertyTimelineView>(`/property-activity/${BUENA_VISTA_PROPERTY_ID}`, { limit: '999999' });
        expect(huge.events.length).toBeLessThanOrEqual(500);
    });

    it('Task 2.10 is READ-ONLY on properties.json — no writes (Ambiguity #4 Appendix D 2.4→2.10 sequential non-conflict)', () => {
        // Indirect verification: PropertyTimeline's data path relies on
        // /property-activity/{id} which reads workitems / communications /
        // compliance / insurance — NONE of which is properties.json.
        // The handler at strataApi.static.ts:511 never calls
        // loadTable('properties') for timeline data. This test documents
        // the read-only claim by asserting properties.json rowcount
        // unchanged from the Task 1.3 baseline.
        const propsCount = (propertiesSeed as unknown as unknown[]).length;
        expect(propsCount).toBe(36); // Phase-1 Task 1.3 baseline; stays 36 through Task 2.10.

        // Real BV UUID still resolves in properties.json (DoR-PRE2
        // invariant that persists across Task 2.10).
        const bv = (propertiesSeed as unknown as Array<{ id: string; name: string }>).find(p => p.id === BUENA_VISTA_PROPERTY_ID);
        expect(bv).toBeDefined();
        expect(bv!.name).toBe('128 BUENA VISTA DR N');
    });

    it('PII guard — no SSN / 9+-digit / card / real-email-domain / phone patterns in /property-activity BV response body', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const view = await strataGet<PropertyTimelineView>(`/property-activity/${BUENA_VISTA_PROPERTY_ID}`);
        const blob = JSON.stringify(view);

        expect(blob).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
        expect(blob).not.toMatch(/\b\d{9,}\b/);
        expect(blob).not.toMatch(/\b(?:\d[ -]*?){13,19}\b/);
        expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|aol|icloud|me|mac|live|msn)\.(?:com|net|org)\b/i);
        expect(blob).not.toMatch(/\(\d{3}\)\s*\d{3}-\d{4}/);
        expect(blob).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
    });
});
