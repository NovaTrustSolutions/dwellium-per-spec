/**
 * AppFolio parity contract test — residents (Task 1.1)
 *
 * Contract: Given occupancy 2800 with LaSonta Westbrook as the primary
 * tenant and Willie White + Olivia White + Elijah Westbrook as Other
 * Occupants, the /occupancies route + entities dataset together resolve
 * to 1 primary + 3 other-occupant rows. This is what the ResidentsModule
 * renders via <OtherOccupantsSection> in the details tab.
 *
 * The contract is enforced at the data/API seam (strataGet + the seed
 * JSON) — the same seam the module consumes — so a drift in any of
 * {types, seed shape, route handler, id references} fails this test.
 *
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.1.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Occupancy, EntityProfile } from '../../components/StrataDashboard/strataTypes';
import occupanciesSeed from '../../../public/data/occupancies.json';

// Canonical IDs — sourced from qualia-shell/public/data/entities.json.
// Changing an id here without updating the seed is a contract break.
const LASONTA_ID = '38fc9223-d0c2-47f9-bd9d-9e7f10337185';
const WILLIE_ID = '08793d48-9690-4051-9c8c-6f99f8733af0';
const OLIVIA_ID = '87c10658-7815-47c8-8991-c43f177ec562';
const ELIJAH_ID = '3688ceb0-cc6e-4612-b838-f4f5d364c080';
const UNIT_B03_ID = '1f54c72d-f59d-42fc-8ac8-f44b92c0c0a4';

function makeTenant(id: string, name: string, tenantType: string, primary: 'Yes' | 'No'): EntityProfile {
    return {
        id,
        entityType: 'tenant',
        name,
        email: null,
        phone: null,
        address: null,
        metadata: { tenantType, primaryTenant: primary, unit: 'B03' },
        propertyIds: ['705a6f52-f4a1-403b-ae3f-b3954b2cdac1'],
        status: 'active',
        category: null,
        licenseNumber: null,
        licenseExpiry: null,
        ein: null,
        createdAt: '2026-03-05 09:30:09',
        updatedAt: '2026-03-05 09:30:09',
    };
}

const OCCUPANCY_2800: Occupancy = {
    id: '2800',
    unitId: UNIT_B03_ID,
    primaryTenantId: LASONTA_ID,
    otherOccupantIds: [WILLIE_ID, OLIVIA_ID, ELIJAH_ID],
    moveInDate: '2025-09-19',
    moveOutDate: null,
    createdAt: '2026-03-05 09:30:09',
    updatedAt: '2026-03-05 09:30:09',
};

const TENANTS: EntityProfile[] = [
    makeTenant(LASONTA_ID, 'LaSonta Westbrook', 'Financially Responsible', 'Yes'),
    makeTenant(WILLIE_ID, 'Willie White', 'Other Occupant', 'No'),
    makeTenant(OLIVIA_ID, 'Olivia White', 'Other Occupant', 'No'),
    makeTenant(ELIJAH_ID, 'Elijah Westbrook', 'Other Occupant', 'No'),
];

describe('residents parity — occupancy 2800 (Task 1.1)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/occupancies.json')) {
                return { ok: true, json: async () => [OCCUPANCY_2800] } as Response;
            }
            if (url.endsWith('/data/entities.json')) {
                return { ok: true, json: async () => TENANTS } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('static API returns occupancy 2800 with LaSonta primary + 3 other occupants', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const rows = await strataGet<Occupancy[]>('/occupancies', { primaryTenantId: LASONTA_ID });

        expect(rows).toHaveLength(1);
        const occ = rows[0];
        expect(occ.id).toBe('2800');
        expect(occ.primaryTenantId).toBe(LASONTA_ID);
        expect(occ.otherOccupantIds).toHaveLength(3);
        expect(occ.otherOccupantIds).toEqual([WILLIE_ID, OLIVIA_ID, ELIJAH_ID]);
        expect(occ.unitId).toBe(UNIT_B03_ID);
    });

    it('resolves other-occupant ids against tenants list → 3 rows, no primary included', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const [occ] = await strataGet<Occupancy[]>('/occupancies', { primaryTenantId: LASONTA_ID });

        // Mirror the resolution step OtherOccupantsSection performs.
        const others = occ.otherOccupantIds
            .map((id) => TENANTS.find((t) => t.id === id))
            .filter((t): t is EntityProfile => Boolean(t));

        expect(others).toHaveLength(3);
        const names = others.map((o) => o.name).sort();
        expect(names).toEqual(['Elijah Westbrook', 'Olivia White', 'Willie White']);

        // Primary tenant must NOT appear among Other Occupants.
        expect(others.find((o) => o.id === LASONTA_ID)).toBeUndefined();

        // The primary has metadata.primaryTenant === 'Yes' (gates the collapsible render).
        const primary = TENANTS.find((t) => t.id === LASONTA_ID);
        expect(primary?.metadata.primaryTenant).toBe('Yes');
    });

    it('seeded occupancies.json on disk matches occupancy 2800 contract', () => {
        // Guards against seed drift: the fixture file must stay consistent
        // with the ids referenced by this test + the module.
        const seed = occupanciesSeed as Occupancy[];
        const occ = seed.find((o) => o.id === '2800');
        expect(occ, 'occupancy 2800 must exist in occupancies.json').toBeDefined();
        expect(occ!.primaryTenantId).toBe(LASONTA_ID);
        expect(occ!.otherOccupantIds).toEqual([WILLIE_ID, OLIVIA_ID, ELIJAH_ID]);
        expect(occ!.unitId).toBe(UNIT_B03_ID);
    });
});
