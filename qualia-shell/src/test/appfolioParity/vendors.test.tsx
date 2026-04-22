/**
 * AppFolio parity contract test — vendors (Task 1.2)
 *
 * Contract: the 2-STORY TECHNICAL ROOFING LLC vendor exists in
 * public/data/entities.json with the typed Task 1.2 shapes —
 * vendorFederalTax, vendorAccountingInfo, vendorCompliance — plus
 * paymentMethod = 'Zelle' and send1099 = true. The ComplianceTab
 * and AccountingTab subcomponents render the typed values faithfully.
 *
 * Source of truth: AppFolio_Screenshots/data/10_vendor_detail_2story_roofing.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.2.
 *
 * Data-collision note: the existing 2-STORY entry at UUID
 * 48be69c5-9cb5-4921-b8f0-d26e8c07b1a5 was EXTENDED with typed blocks
 * rather than duplicated. Randy's Tub-N-Tile at UUID ending …2716 is
 * a coincidental-id different vendor and is untouched.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type {
    EntityProfile,
    VendorFederalTax,
    VendorAccountingInfo,
    VendorCompliance,
} from '../../components/StrataDashboard/strataTypes';
import entitiesSeed from '../../../public/data/entities.json';
import ComplianceTab, { expirationColor } from '../../components/StrataDashboard/modules/__vendors/ComplianceTab';
import AccountingTab from '../../components/StrataDashboard/modules/__vendors/AccountingTab';

const TWO_STORY_ID = '48be69c5-9cb5-4921-b8f0-d26e8c07b1a5';
const RANDY_ID = 'fa79b182-724a-4530-b7c9-6576531b2716';

function find2StoryVendor(): EntityProfile {
    const seed = entitiesSeed as EntityProfile[];
    const v = seed.find((e) => e.id === TWO_STORY_ID);
    if (!v) throw new Error('2-STORY TECHNICAL ROOFING vendor missing from entities.json seed');
    return v;
}

describe('vendors parity — 2-STORY TECHNICAL ROOFING (Task 1.2)', () => {
    it('entity lookup: 2-STORY has typed vendorFederalTax/AccountingInfo/Compliance + Zelle + send1099', () => {
        const v = find2StoryVendor();

        expect(v.entityType).toBe('vendor');
        expect(v.name).toBe('2-STORY TECHNICAL ROOFING LLC');

        const ft = v.vendorFederalTax as VendorFederalTax | undefined;
        expect(ft, 'vendorFederalTax must be present').toBeDefined();
        expect(ft!.taxpayerName).toBe('2-STORY TECHNICAL ROOFING');
        expect(ft!.w9Requested).toBe(true);
        expect(ft!.send1099).toBe(true);

        const ai = v.vendorAccountingInfo as VendorAccountingInfo | undefined;
        expect(ai, 'vendorAccountingInfo must be present').toBeDefined();
        expect(ai!.paymentType).toBe('Zelle');
        expect(ai!.checkConsolidation).toContain('single check');

        const vc = v.vendorCompliance as VendorCompliance | undefined;
        expect(vc, 'vendorCompliance must be present').toBeDefined();
        expect(vc!.generalLiabilityExpiration).toBe('2026-07-11');
        expect(vc!.workersCompExpiration).toBeNull();
        expect(vc!.requestComplianceDocumentsCta).toBe(true);

        expect(v.paymentMethod).toBe('Zelle');
        expect(v.send1099).toBe(true);

        // Randy's Tub-N-Tile (UUID ends in …2716) is a different vendor
        // and must not have been mutated by the 2-Story wiring.
        const seed = entitiesSeed as EntityProfile[];
        const randy = seed.find((e) => e.id === RANDY_ID);
        expect(randy, 'Randy entry must still exist').toBeDefined();
        expect(randy!.name).toBe("RANDY'S TUB-N-TILE REFINISHING");
        expect(randy!.vendorFederalTax).toBeUndefined();
    });

    it('ComplianceTab: 6 rows render with GL = Expiring at mock-now, 5 others = Missing', () => {
        const v = find2StoryVendor();
        // Fixed mock now: 2026-04-22 — the test date anchor. GL expires
        // 2026-07-11, which is 80 days out → Expiring (<=90-day horizon).
        const now = new Date('2026-04-22T12:00:00.000Z');

        render(<ComplianceTab vendor={v} now={now} />);

        // The 6 canonical compliance rows all render.
        expect(screen.getByTestId('compliance-row-workersCompExpiration')).toBeInTheDocument();
        expect(screen.getByTestId('compliance-row-generalLiabilityExpiration')).toBeInTheDocument();
        expect(screen.getByTestId('compliance-row-epaCertificationExpiration')).toBeInTheDocument();
        expect(screen.getByTestId('compliance-row-autoInsuranceExpiration')).toBeInTheDocument();
        expect(screen.getByTestId('compliance-row-stateLicenseExpiration')).toBeInTheDocument();
        expect(screen.getByTestId('compliance-row-contractExpiration')).toBeInTheDocument();

        // GL at 2026-07-11 relative to 2026-04-22 → Expiring.
        expect(screen.getByTestId('compliance-badge-generalLiabilityExpiration')).toHaveTextContent('Expiring');

        // Five null fields render Missing.
        for (const key of [
            'workersCompExpiration',
            'epaCertificationExpiration',
            'autoInsuranceExpiration',
            'stateLicenseExpiration',
            'contractExpiration',
        ]) {
            expect(screen.getByTestId(`compliance-badge-${key}`)).toHaveTextContent('Missing');
        }

        // Compliance documents CTA surfaces when requestComplianceDocumentsCta = true.
        expect(screen.getByTestId('compliance-request-cta')).toBeInTheDocument();

        // expirationColor helper boundary checks. Dates are parsed as
        // midnight-UTC; `now` here is noon-UTC — so same-day ISO dates
        // read as 12h past due. Assertions use cleanly-bucketed inputs
        // to avoid midnight-UTC boundary ambiguity.
        expect(expirationColor(null, now).status).toBe('Missing');
        expect(expirationColor('2026-05-15', now).status).toBe('Expiring'); // 23 days out
        expect(expirationColor('2026-04-20', now).status).toBe('Expired');  // 2 days prior
        expect(expirationColor('2030-01-01', now).status).toBe('Valid');   // years out
    });

    it('AccountingTab: renders Zelle payment method and send1099 = Yes', () => {
        const v = find2StoryVendor();

        render(<AccountingTab vendor={v} />);

        expect(screen.getByTestId('accounting-payment-method')).toHaveTextContent('Zelle');
        expect(screen.getByTestId('accounting-send-1099')).toHaveTextContent('Yes');
    });
});
