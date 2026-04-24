/**
 * AppFolio parity contract test — utilities (Task 2.6)
 *
 * Task 2.6 scope — plan v1 L140 (v2.7 §9 tracker pending row, consolidated
 * with 2.8 + 2.9 pre-this-PR): seed real utility-vendor relationships for
 *   • Duke Energy (Water Heater Plan)         — 128 Buena Vista Dr N
 *   • Massey Pest Control (Quarterly Service) — 128 Buena Vista Dr N
 *   • Georgia Power (Monthly Electric)        — 2070 Azalea / Riverwood Club
 *
 * Status-quo wiring (DoR-PRE0 (a4) resolution): UtilitiesModule.tsx:41 reads
 * `/workitems?type=utility&property_id=X`; strataApi.static.ts:104-110
 * supports the filter natively. Task 2.6 extends `workitems.json` with 3
 * `type: 'utility'` rows — no new fixture, no new handler, no module rewire.
 * Mirrors Task 2.1's 9-row `type: 'inspection'` seed pattern exactly.
 *
 * entities.json is NOT touched by Task 2.6 (PRE1 (c2) resolution): all three
 * target vendors already exist as `entityType: 'vendor'` rows with correct
 * `propertyIds` linkage. Task 2.6 references vendors by provider-name string
 * only, leaving entities.json to its Phase-4 owner (Appendix D row 6).
 *
 * Gate: GR-4 (phase-gate no-regression).
 */
import { describe, it, expect } from 'vitest';

import workitemsSeed from '../../../public/data/workitems.json';
import entitiesSeed from '../../../public/data/entities.json';
import propertiesSeed from '../../../public/data/properties.json';

// Canonical property UUIDs (DoR-PRE1 verified):
//   BV       — propertyTimeline.test.ts:44 constant + Task 2.10 report §DoR-PRE1.
//   Riverwood — Task 2.1 completion report L37 ("Riverwood Club Apartments").
const BUENA_VISTA_PROPERTY_ID = 'e4b440e9-5062-4da1-ae25-818dffab8b3b';
const RIVERWOOD_PROPERTY_ID = '705a6f52-f4a1-403b-ae3f-b3954b2cdac1';

// Task 2.6 commit B seeded exactly 3 rows. Floor-pin for future drift.
const UTILITIES_TASK_2_6_BASELINE = 3;

// GR-7 sanitized account-number placeholder — literal XXXX-XXXX- prefix +
// 4-digit synthetic suffix (no real account derivation). No regex match
// against the PII scanner's ssn-mask or phone patterns (Scripts/verify_no_pii_leak.mjs).
const PII_SAFE_ACCOUNT_NUMBER = /^XXXX-XXXX-\d{4}$/;

interface UtilityWorkitem {
    id: string;
    type: string;
    title: string;
    propertyId: string;
    domain?: string;
    tags?: string[];
    metadata?: {
        utilityType?: string;
        provider?: string;
        accountNumber?: string;
        monthlyCost?: number | null;
        notes?: string;
        source?: string;
    };
}

describe('utilities parity — Task 2.6 utility-vendor workitem seed', () => {
    const utilities = (workitemsSeed as unknown as UtilityWorkitem[]).filter(
        w => w.type === 'utility',
    );

    it('baseline — workitems.json has exactly 3 Task-2.6 utility rows (DoR-PRE2 floor); every row carries the canonical Task-2.6 source marker', () => {
        expect(utilities).toHaveLength(UTILITIES_TASK_2_6_BASELINE);

        for (const u of utilities) {
            expect(u.metadata?.source).toBe('task-2-6-utilities-seed');
            expect(u.id).toMatch(/^wi-task-2-6-util-0[1-3]$/);
        }
    });

    it('plan v1 L140 spec gate — filter by 128 BV UUID returns exactly 2 rows (Duke Energy + Massey Pest); GR-4 phase-gate criterion', () => {
        const bvRows = utilities.filter(u => u.propertyId === BUENA_VISTA_PROPERTY_ID);
        expect(bvRows).toHaveLength(2);

        const providers = bvRows.map(r => r.metadata?.provider).sort();
        expect(providers).toEqual(['Duke Energy', 'Massey Pest']);

        // Cross-check: BV UUID must resolve to a real properties.json row
        // (no synthetic placeholder — DoR-PRE2 invariant).
        const bvProperty = (propertiesSeed as unknown as Array<{ id: string }>).find(
            p => p.id === BUENA_VISTA_PROPERTY_ID,
        );
        expect(bvProperty, 'BV UUID must resolve to a real properties.json row').toBeDefined();
    });

    it('Riverwood filter — exactly 1 row (Georgia Power) on the canonical 2070 Azalea UUID shared with Task-2.1 seed', () => {
        const rwRows = utilities.filter(u => u.propertyId === RIVERWOOD_PROPERTY_ID);
        expect(rwRows).toHaveLength(1);
        expect(rwRows[0].metadata?.provider).toBe('Georgia Power');

        // Cross-check: Riverwood UUID must resolve to a real properties.json
        // row AND match Task-2.1's canonical (same UUID seeded 9 inspections).
        const rwProperty = (propertiesSeed as unknown as Array<{ id: string }>).find(
            p => p.id === RIVERWOOD_PROPERTY_ID,
        );
        expect(rwProperty, 'Riverwood UUID must resolve to a real properties.json row').toBeDefined();
    });

    it('schema sanity — every Task-2.6 row carries the Workitem core shape + required utility metadata fields consumed by UtilitiesModule.tsx:42-51', () => {
        for (const u of utilities) {
            // Workitem core fields.
            expect(typeof u.id).toBe('string');
            expect(u.type).toBe('utility');
            expect(typeof u.title).toBe('string');
            expect(typeof u.propertyId).toBe('string');
            expect(u.domain).toBe('operations');

            // Tags include both the generic 'utility' marker and the Task-2.6
            // provenance marker — symmetric to Task 2.1's ['section8','aha','inspection'].
            expect(u.tags).toContain('utility');
            expect(u.tags).toContain('task-2-6');

            // Utility-specific metadata required for UtilitiesModule render path.
            // Module code at UtilitiesModule.tsx:42-51 reads these exact keys.
            expect(u.metadata?.utilityType).toBeDefined();
            expect(typeof u.metadata?.provider).toBe('string');
            expect(u.metadata!.provider!.length).toBeGreaterThan(0);
            expect('accountNumber' in (u.metadata ?? {})).toBe(true);
            expect('monthlyCost' in (u.metadata ?? {})).toBe(true);
        }
    });

    it('PII discipline (GR-7) — account numbers match XXXX-XXXX-#### sanitized placeholder pattern; monthlyCost null until Phase-3 AppFolio re-capture', () => {
        for (const u of utilities) {
            const acct = u.metadata?.accountNumber;
            expect(acct, `${u.id} must have an accountNumber field`).toBeDefined();
            expect(acct!).toMatch(PII_SAFE_ACCOUNT_NUMBER);

            // No real billing figures seeded — task handoff mandates
            // sanitization, and no AppFolio-captured utility billing is
            // in scope until a future Phase-3 re-capture PR.
            expect(u.metadata?.monthlyCost).toBeNull();
        }
    });

    it('cross-source vendor-name coherence — each Task-2.6 provider resolves to an entities.json vendor row via token-contained name match', () => {
        const vendorNames = (entitiesSeed as unknown as Array<{ entityType?: string; name?: string }>)
            .filter(e => e.entityType === 'vendor' && typeof e.name === 'string')
            .map(e => e.name!.toLowerCase());

        expect(vendorNames.length).toBeGreaterThan(0);

        for (const u of utilities) {
            const provider = u.metadata?.provider;
            expect(provider).toBeDefined();

            // Token-contained fuzzy match handles real-world entities.json
            // naming drift:
            //   "Duke Energy"   ⊂ "Duke Energy (Progress) (Electric Service)"
            //   "Massey Pest"   ⊂ "Pest Control - Massey"
            //   "Georgia Power" ⊂ "Georgia Power Co" / "Georgia Power"
            const tokens = provider!.toLowerCase().split(/\s+/).filter(t => t.length > 1);
            expect(tokens.length).toBeGreaterThan(0);

            const hasMatch = vendorNames.some(n => tokens.every(t => n.includes(t)));
            expect(
                hasMatch,
                `${u.id} provider "${provider}" must resolve to an entities.json vendor row via token-contained match`,
            ).toBe(true);
        }
    });
});
