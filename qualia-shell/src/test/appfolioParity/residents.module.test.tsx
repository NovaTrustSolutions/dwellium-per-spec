/**
 * Render-level block-contract test — ResidentsModule tenant detail v1-L164 expansion (Task 3.1).
 *
 * Path B isolation pattern (mirrors maintenance.module.test.tsx Task 3.4 +
 * vendors.module.test.tsx Task 3.2 + properties.module.test.tsx Task 3.3 calibrations).
 * Each of the 5 NEW Block components + 1 NEW InsuranceStatusBadge is exported as a
 * named React component from ResidentsModule.tsx and rendered directly here without
 * mounting the full module.
 *
 * Anchor fixture: John Basher (id `dd980938-8130-4a1a-9484-a978343ee6cf`) per recon §4
 * verification — fully-populated string-bag tenant with metadata.insuranceExpiration
 * "01/13/2027" (legacy MM/DD/YYYY → parseLegacyDate test path; today=2026-04-28 →
 * Active badge with ~260 days remaining).
 *
 * Typed-path coverage for Block 2 (Emergency Contact) / Block 4 (Animals) / Block 5
 * (Vehicles) uses SYNTHETIC EntityProfile fixtures because 0/322 tenant entities
 * carry typed Task-1.1 fields (animals[] / vehicles[] / emergencyContacts[]) per
 * recon §4 + PRE1-(b) verification. Synthetic fixtures mirror 3.4 BlockWithheldAmount
 * + BlockNotes synthetic-fixture pattern exactly: real fixtures don't carry the
 * typed shape, so the test constructs it.
 *
 * Encrypted-blob defensive guard pattern (Drift #B-i from Task 3.4) is NOT applicable
 * to tenants — 0/322 carry STRING-typed metadata or `enc:v1:astra:*` prefix. Plain
 * `Array.isArray()` guards in the Block bodies suffice.
 *
 * Trade-offs (mirror 3.2/3.3/3.4 precedent):
 *   - Block-toggle Sentry breadcrumb-payload assertion → CDP integration coverage.
 *   - Insurance status badge tri-state cycling (Active → Expiring soon → Expired)
 *     under date-mock injection → CDP integration with date mocking.
 *   - Cross-block ErrorBoundary fallback rendering ("Tenant detail blocks unavailable.")
 *     → CDP integration (5 Blocks throw simulation; v2.18+ Path A).
 *   - Path A integration test (full ResidentsModule mount with click-through) is a
 *     v2.18+ low-priority follow-up — joins existing Path A candidates from 3.2/3.3/3.4.
 *
 * Test pyramid split:
 *   - Fixture-level data-contract:   src/test/appfolioParity/residents.test.ts (Task 1.1 — UNTOUCHED)
 *   - Render-level block-contract:   THIS FILE (Task 3.1)
 *   - User-flow contract:            cdp_probe_task_3_1.cjs (10-guard, post-merge)
 *
 * Source of truth: AppFolio_Screenshots/data/09_tenant_detail_willie_white.json.
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 3.1 + v2.18 changelog.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EntityProfile, Animal, Vehicle, EmergencyContact } from '../../components/StrataDashboard/strataTypes';
import {
    BlockFolioGuardUpsell,
    BlockEmergencyContact,
    BlockUpcomingActivities,
    BlockAnimals,
    BlockVehicles,
    InsuranceStatusBadge,
} from '../../components/StrataDashboard/modules/ResidentsModule';

/** Minimal EntityProfile representing a tenant with no Task-1.1 typed extensions
 *  and an empty metadata bag. Used as the absent-path fixture for all 5 typed Blocks
 *  + as the host shell for the 2 stub-only Blocks (FolioGuard / Upcoming Activities). */
const minimalTenant: EntityProfile = {
    id: 'test-tenant-3-1',
    entityType: 'tenant',
    name: 'Test Tenant',
    email: null,
    phone: null,
    address: null,
    metadata: {},
    propertyIds: [],
    status: 'active',
    category: null,
    licenseNumber: null,
    licenseExpiry: null,
    ein: null,
    createdAt: '2026-04-28T00:00:00Z',
    updatedAt: '2026-04-28T00:00:00Z',
};

describe('Task 3.1 — Tenant detail v1-L164 expansion (Path B block isolation)', () => {
    it('BlockFolioGuardUpsell renders the L168 stub placeholder + testid', () => {
        render(<BlockFolioGuardUpsell tenant={minimalTenant} />);
        expect(screen.getByTestId('tenant-block-folioguard')).toBeTruthy();
        expect(screen.getByText(/FolioGuard Smart Ensure/i)).toBeTruthy();
        expect(screen.getByText(/Coming soon/i)).toBeTruthy();
    });

    it('BlockUpcomingActivities renders the L168 stub placeholder + testid', () => {
        render(<BlockUpcomingActivities tenant={minimalTenant} />);
        expect(screen.getByTestId('tenant-block-upcoming-activities')).toBeTruthy();
        expect(screen.getByText(/Upcoming activities not yet captured/i)).toBeTruthy();
    });

    it('BlockEmergencyContact typed-path: renders all contact fields when emergencyContacts is populated (synthetic; 0/322 fixtures carry typed path per PRE1-(b))', () => {
        const contacts: EmergencyContact[] = [
            { name: 'Jane Doe', relationship: 'Spouse', phone: '555-0100', email: 'jane@example.com' },
            { name: 'Bob Smith', relationship: 'Brother', phone: '555-0200', email: null },
        ];
        const synthetic: EntityProfile = { ...minimalTenant, emergencyContacts: contacts };
        render(<BlockEmergencyContact tenant={synthetic} />);
        expect(screen.getByTestId('tenant-block-emergency-contact')).toBeTruthy();
        expect(screen.getByText('Jane Doe')).toBeTruthy();
        expect(screen.getByText('Spouse')).toBeTruthy();
        expect(screen.getByText('555-0100')).toBeTruthy();
        expect(screen.getByText('jane@example.com')).toBeTruthy();
        expect(screen.getByText('Bob Smith')).toBeTruthy();
        expect(screen.getByText('Brother')).toBeTruthy();
    });

    it('BlockEmergencyContact absent-path: renders "No emergency contact on file" when emergencyContacts undefined (real-fixture path on 322/322 tenants per recon §4)', () => {
        render(<BlockEmergencyContact tenant={minimalTenant} />);
        expect(screen.getByTestId('tenant-block-emergency-contact')).toBeTruthy();
        expect(screen.getByText(/No emergency contact on file/i)).toBeTruthy();
    });

    it('BlockAnimals typed-path: renders all animal fields incl. service-animal flag when animals is populated (synthetic; 0/322 fixtures carry typed path)', () => {
        const animals: Animal[] = [
            { id: 'a1', species: 'Dog', breed: 'Shih Poo', name: 'Mochi', weight: 12, isServiceAnimal: false },
            { id: 'a2', species: 'Dog', breed: 'Labrador', name: 'Service Buddy', weight: 70, isServiceAnimal: true },
        ];
        const synthetic: EntityProfile = { ...minimalTenant, animals };
        render(<BlockAnimals tenant={synthetic} />);
        expect(screen.getByTestId('tenant-block-animals')).toBeTruthy();
        expect(screen.getByText('Mochi')).toBeTruthy();
        expect(screen.getByText('Shih Poo')).toBeTruthy();
        expect(screen.getByText('12 lb')).toBeTruthy();
        expect(screen.getByText('Service Buddy')).toBeTruthy();
        expect(screen.getByText('70 lb')).toBeTruthy();
        // The "Yes" service-animal pill renders only on the second animal.
        expect(screen.getByText('Yes')).toBeTruthy();
    });

    it('BlockAnimals absent-path: renders "No animals on file" when animals undefined (real-fixture path on 322/322 tenants)', () => {
        render(<BlockAnimals tenant={minimalTenant} />);
        expect(screen.getByTestId('tenant-block-animals')).toBeTruthy();
        expect(screen.getByText(/No animals on file/i)).toBeTruthy();
    });

    it('BlockVehicles typed-path: renders all vehicle fields when vehicles is populated (synthetic; 0/322 fixtures carry typed path)', () => {
        const vehicles: Vehicle[] = [
            { id: 'v1', make: 'Honda', model: 'Civic', year: 2018, color: 'White', licensePlate: 'SAV5040', state: 'GA' },
        ];
        const synthetic: EntityProfile = { ...minimalTenant, vehicles };
        render(<BlockVehicles tenant={synthetic} />);
        expect(screen.getByTestId('tenant-block-vehicles')).toBeTruthy();
        expect(screen.getByText('2018')).toBeTruthy();
        expect(screen.getByText('Honda')).toBeTruthy();
        expect(screen.getByText('Civic')).toBeTruthy();
        expect(screen.getByText('White')).toBeTruthy();
        expect(screen.getByText('SAV5040')).toBeTruthy();
        expect(screen.getByText('GA')).toBeTruthy();
    });

    it('BlockVehicles absent-path: renders "No vehicles on file" when vehicles undefined (real-fixture path on 322/322 tenants)', () => {
        render(<BlockVehicles tenant={minimalTenant} />);
        expect(screen.getByTestId('tenant-block-vehicles')).toBeTruthy();
        expect(screen.getByText(/No vehicles on file/i)).toBeTruthy();
    });

    it('InsuranceStatusBadge Active-path: renders "Active" pill when expiration is >30d in future (canonical John Basher path: insuranceExpiration "01/13/2027" + today=2026-04-28 → 260 days remaining)', () => {
        const tenant: EntityProfile = { ...minimalTenant, metadata: { insuranceExpiration: '01/13/2027' } };
        const today = new Date(2026, 3, 28); // April 28, 2026 (month is 0-indexed)
        render(<InsuranceStatusBadge tenant={tenant} today={today} />);
        const badge = screen.getByTestId('tenant-insurance-status-badge');
        expect(badge).toBeTruthy();
        expect(badge.textContent).toMatch(/Active/);
        expect(badge.textContent).toMatch(/days remaining/);
    });
});
