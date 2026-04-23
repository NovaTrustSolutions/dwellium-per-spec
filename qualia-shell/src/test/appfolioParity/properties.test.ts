/**
 * AppFolio parity contract test — properties (Task 1.3)
 *
 * Contract: the 128 Buena Vista property (UUID
 * e4b440e9-5062-4da1-ae25-818dffab8b3b) carries typed Task 1.3 shapes
 * at the Property top level — `purchaseHistory`, `lateFeePolicy`,
 * `maintenanceConfig`, `fixedAssets`, and `parcelNumber`. The contract
 * is enforced at the data/API seam (strataGet + the seed JSON) — the
 * same seam PropertiesModule consumes — so drift in any of
 * {types, seed shape, route handler, id references} fails this test.
 *
 * Source of truth: AppFolio_Screenshots/data/02_property_detail_128_buena_vista.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.3.
 *
 * Entry-point note: the plan's placeholder id `appfolio-18` does not
 * exist in the seed. 128 Buena Vista's real canonical UUID was already
 * present (`appfolio_csv` import); Task 1.3 extends that entry in
 * place rather than inventing a new id. Every other property entry is
 * untouched (asserted below).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Property } from '../../components/StrataDashboard/strataTypes';
import propertiesSeed from '../../../public/data/properties.json';

const BV_ID = 'e4b440e9-5062-4da1-ae25-818dffab8b3b';

describe('properties parity — 128 Buena Vista (Task 1.3)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/properties.json')) {
                return { ok: true, json: async () => propertiesSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('static API returns 128 Buena Vista with purchaseHistory[0].amount === 2270000', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const rows = await strataGet<Property[]>('/properties', { id: BV_ID });
        const prop = rows.find((p) => p.id === BV_ID);
        expect(prop, 'property 128 Buena Vista must resolve from /properties').toBeDefined();
        expect(prop!.purchaseHistory).toBeDefined();
        expect(prop!.purchaseHistory!).toHaveLength(1);
        expect(prop!.purchaseHistory![0].amount).toBe(2270000);
        expect(prop!.purchaseHistory![0].purchaseDate).toBe('2009-10-16');
        expect(prop!.purchaseHistory![0].settlementAgent).toBe('Wolinka & Wolinka Title Ins Agency');
        // PII redaction enforced — prior-owner name must not leak into the seed.
        expect(prop!.purchaseHistory![0].seller).not.toMatch(/Ricketts/i);
    });

    it('128 Buena Vista has exactly 4 fixed assets matching DoR asset_ids 8/9/15/16', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const rows = await strataGet<Property[]>('/properties', { id: BV_ID });
        const prop = rows.find((p) => p.id === BV_ID);
        expect(prop!.fixedAssets).toHaveLength(4);
        const ids = prop!.fixedAssets!.map((a) => a.assetId).sort();
        expect(ids).toEqual(['15', '16', '8', '9']);
        const types = prop!.fixedAssets!.map((a) => a.type);
        expect(types).toContain('Refrigerator');
        expect(types).toContain('Toilet/Tank/Plumbing');
        expect(types.filter((t) => t === 'Pump: Pool, Fountain')).toHaveLength(2);
    });

    it('seeded properties.json on disk matches the 128 Buena Vista contract', () => {
        const seed = propertiesSeed as unknown as Property[];
        const prop = seed.find((p) => p.id === BV_ID);
        expect(prop, 'property 128 Buena Vista must exist in properties.json').toBeDefined();
        expect(prop!.purchaseHistory?.[0].amount).toBe(2270000);
        expect(prop!.fixedAssets).toHaveLength(4);
        expect(prop!.lateFeePolicy).toBeDefined();
        expect(prop!.lateFeePolicy!.effectiveOn).toBe('2021-02-01');
        expect(prop!.lateFeePolicy!.gracePeriod).toMatch(/4 days/);
        expect(prop!.maintenanceConfig).toBeDefined();
        expect(prop!.maintenanceConfig!.homeWarranty).toBe(false);
        expect(prop!.maintenanceConfig!.preAuthEntry).toBe(false);
        // Guard against accidentally extending a different property entry.
        const others = seed.filter((p) => p.id !== BV_ID);
        const othersTouched = others.filter(
            (p) => p.purchaseHistory || p.lateFeePolicy || p.maintenanceConfig || p.fixedAssets || p.parcelNumber,
        );
        expect(othersTouched, 'only 128 Buena Vista should carry Task 1.3 typed fields').toHaveLength(0);
    });

    it('parcelNumber on 128 Buena Vista equals "22/28/15/23310/011/0160"', () => {
        const seed = propertiesSeed as unknown as Property[];
        const prop = seed.find((p) => p.id === BV_ID);
        expect(prop!.parcelNumber).toBe('22/28/15/23310/011/0160');
    });
});
