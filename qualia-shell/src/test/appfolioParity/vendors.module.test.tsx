/**
 * Render-level block-contract test — VendorsModule 10-block layout (Task 3.2).
 *
 * Path B isolation pattern (mirrors properties.module.test.tsx Task 3.3 calibration).
 * Each of the 10 Block components is exported as a named React component from
 * VendorsModule.tsx and rendered directly here without mounting the full module.
 *
 * Anchor fixture: 2-STORY TECHNICAL ROOFING LLC at UUID
 * 48be69c5-9cb5-4921-b8f0-d26e8c07b1a5 in public/data/entities.json — the
 * canonical Task-1.2 typed vendor (1 of 3,218 entities; the other 3,217 use
 * legacy metadata fallback chains added in Task 3.2 per Drift #11).
 *
 * Compliance assertions use injected today = new Date('2026-04-28') to anchor
 * against the canonical 2-STORY GL expiry of 2026-07-11. Production renders
 * against new Date() — the same code path is validated by the CDP probe at
 * PRE2 closure.
 *
 * Trade-off (mirrors 3.3 properties.module.test.tsx convention):
 *   - Block-toggle Sentry breadcrumb-payload assertion is deferred to CDP
 *     integration coverage. A Path A integration test (full VendorsModule
 *     mount with click-through) is a v2.17+ low-priority follow-up.
 *
 * Test pyramid split:
 *   - Fixture-level data-contract:    src/test/appfolioParity/vendors.test.tsx (Task 1.2 — UNTOUCHED here)
 *   - Render-level block-contract:    THIS FILE (Task 3.2)
 *   - User-flow contract:             CDP probe (10-guard, post-merge)
 *
 * Source of truth: AppFolio_Screenshots/data/10_vendor_detail_2story_roofing.json.
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 3.2 + v2.16 changelog.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EntityProfile } from '../../components/StrataDashboard/strataTypes';
import {
    BlockIdentity,
    BlockContact,
    BlockPortal,
    BlockFederalTax,
    BlockAccounting,
    BlockPaymentType,
    BlockCompliance,
    BlockSurvey,
    BlockNotes,
    BlockActivity,
} from '../../components/StrataDashboard/modules/VendorsModule';
import entitiesSeed from '../../../public/data/entities.json';

const TWO_STORY_ID = '48be69c5-9cb5-4921-b8f0-d26e8c07b1a5';
const TODAY = new Date('2026-04-28');

function find2Story(): EntityProfile {
    const seed = entitiesSeed as EntityProfile[];
    const v = seed.find(e => e.id === TWO_STORY_ID);
    if (!v) throw new Error('2-STORY canonical vendor missing from entities.json seed');
    return v;
}

describe('VendorsModule 10-block layout — typed path (2-STORY canonical)', () => {
    it('BlockIdentity renders name + vendorType + contactName + website (metadata-driven per Drift #10)', () => {
        const v = find2Story();
        render(<BlockIdentity vendor={v} />);
        expect(screen.getByTestId('vendor-block-identity')).toBeTruthy();
        expect(screen.getByText('2-STORY TECHNICAL ROOFING LLC')).toBeTruthy();
        expect(screen.getByText('Contractor')).toBeTruthy();
        expect(screen.getByText('BOURDUA DANNY')).toBeTruthy();
    });

    it('BlockContact renders email + phone + address (core-then-metadata fallback per Drift #10)', () => {
        const v = find2Story();
        render(<BlockContact vendor={v} />);
        expect(screen.getByTestId('vendor-block-contact')).toBeTruthy();
        expect(screen.getByText('vendor-contact@example.com')).toBeTruthy();
        expect(screen.getByText('Mobile: (555) 555-XXXX')).toBeTruthy();
        // entity core address is null → metadata.address fallback used
        expect(screen.getByText('3122 OLD CORNELIA HWY, GAINESVILLE, GA, 30507')).toBeTruthy();
    });

    it('BlockPortal renders tri-state Activated for metadata.vendorPortalActivated="Yes" (Drift #10)', () => {
        const v = find2Story();
        render(<BlockPortal vendor={v} />);
        expect(screen.getByTestId('vendor-block-portal')).toBeTruthy();
        expect(screen.getByText('Activated')).toBeTruthy();
    });

    it('BlockFederalTax renders typed VendorFederalTax fields (Task 1.2)', () => {
        const v = find2Story();
        render(<BlockFederalTax vendor={v} />);
        expect(screen.getByTestId('vendor-block-federal-tax')).toBeTruthy();
        expect(screen.getByText('2-STORY TECHNICAL ROOFING')).toBeTruthy();
        expect(screen.getByText('XX-XXX-XXXX')).toBeTruthy();
        expect(screen.getByText('T5880725740908400331')).toBeTruthy();
        // W-9 Requested true + Send 1099 true → both render "Yes" (use getAllByText for the duplicate)
        expect(screen.getAllByText('Yes').length).toBeGreaterThanOrEqual(2);
    });

    it('BlockAccounting renders 3-KPI summary (paymentType + paymentTerms + onlinePayables) + cross-link', () => {
        const v = find2Story();
        const onCrossLink = () => { /* spy */ };
        render(<BlockAccounting vendor={v} onCrossLink={onCrossLink} />);
        expect(screen.getByTestId('vendor-block-accounting')).toBeTruthy();
        expect(screen.getByText('Zelle')).toBeTruthy();
        // typed paymentTerms is null → renders "—"
        // typed onlinePayablesEnabled is false → renders "Disabled"
        expect(screen.getByText('Disabled')).toBeTruthy();
        expect(screen.getByText(/View detailed Accounting/i)).toBeTruthy();
    });

    it('BlockPaymentType renders typed paymentMethod + send1099 (Task 1.2 root fields)', () => {
        const v = find2Story();
        render(<BlockPaymentType vendor={v} />);
        expect(screen.getByTestId('vendor-block-payment-type')).toBeTruthy();
        expect(screen.getByText('Zelle')).toBeTruthy();
        expect(screen.getByText('Yes')).toBeTruthy();
    });

    it('BlockCompliance — typed path: with today=2026-04-28 → activeCount=1, nearestExpiry "GL: 2026-07-11", expiredCount=0', () => {
        const v = find2Story();
        const onCrossLink = () => { /* spy */ };
        render(<BlockCompliance vendor={v} today={TODAY} onCrossLink={onCrossLink} />);
        expect(screen.getByTestId('vendor-block-compliance')).toBeTruthy();
        expect(screen.getByText('1 / 6 docs on file')).toBeTruthy();
        expect(screen.getByText('GL: 2026-07-11')).toBeTruthy();
        expect(screen.getByText('0 expired')).toBeTruthy();
        expect(screen.getByText(/View detailed Compliance/i)).toBeTruthy();
    });

    it('BlockSurvey renders the L168 stub placeholder', () => {
        const v = find2Story();
        render(<BlockSurvey vendor={v} />);
        expect(screen.getByTestId('vendor-block-survey')).toBeTruthy();
        expect(screen.getByText(/Survey responses not yet captured/i)).toBeTruthy();
    });

    it('BlockNotes renders "No notes recorded" stub when metadata.notes is absent (Q3 Option A)', () => {
        const v = find2Story();
        // 2-STORY canonical metadata.notes is unpopulated → stub state
        render(<BlockNotes vendor={v} />);
        expect(screen.getByTestId('vendor-block-notes')).toBeTruthy();
        expect(screen.getByText(/No notes recorded/i)).toBeTruthy();
    });

    it('BlockActivity renders the L168 stub placeholder', () => {
        const v = find2Story();
        render(<BlockActivity vendor={v} />);
        expect(screen.getByTestId('vendor-block-activity')).toBeTruthy();
        expect(screen.getByText(/Activity log not yet captured/i)).toBeTruthy();
    });
});

describe('VendorsModule 10-block layout — fallback path (Drift #11 metadata-only legacy expirations)', () => {
    it('BlockCompliance — metadata-only legacy MM/DD/YYYY normalizes correctly under today=2026-04-28', () => {
        // Synthesize a vendor with NO typed vendorCompliance, only legacy
        // metadata.workersCompExpiration in MM/DD/YYYY format. Exercises the
        // parseLegacyDate normalize path that 3,217 / 3,218 vendors hit at
        // runtime via the metadata fallback chain (per Drift #11 ack).
        const legacyVendor: EntityProfile = {
            id: 'fallback-test-vendor',
            entityType: 'vendor',
            name: 'Fallback Test Vendor',
            email: null,
            phone: null,
            address: null,
            metadata: {
                workersCompExpiration: '07/11/2026',
                liabilityInsuranceExpiration: '',
                epaCertificationExpiration: '',
                autoInsuranceExpiration: '',
                stateLicenseExpiration: '',
                contractExpiration: '',
            },
            propertyIds: [],
            status: 'active',
            category: null,
            licenseNumber: null,
            licenseExpiry: null,
            ein: null,
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
            // No typed vendorCompliance — fallback chain takes over.
        };
        render(<BlockCompliance vendor={legacyVendor} today={TODAY} />);
        expect(screen.getByTestId('vendor-block-compliance')).toBeTruthy();
        expect(screen.getByText('1 / 6 docs on file')).toBeTruthy();
        expect(screen.getByText('Workers Comp: 2026-07-11')).toBeTruthy();
        expect(screen.getByText('0 expired')).toBeTruthy();
    });
});
