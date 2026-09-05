/**
 * ManagerHome — real data, honest empty states (item 1 fix).
 *
 * Old behavior: Move-Ins/Move-Outs, AP Calendar, Portfolio Income and Lease
 * Expirations were hardcoded arrays of made-up people/properties/dollar
 * figures (Sarah Chen, Richwood, Woodland Falls, Metro Lofts, Harbor View,
 * Apex Plumbing, GreenScape Lawn, ...) rendered unconditionally, regardless
 * of what the account's real data looked like.
 *
 * Fix: every widget reads a real backend call (/stats, /units, /properties,
 * /occupancies, /invoices) and shows an honest empty state when its source
 * is empty or unavailable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const OLD_FAKE_STRINGS = [
    'Sarah Chen', 'Richwood', 'Woodland Falls', 'Metro Lofts', 'Harbor View',
    'Apex Plumbing', 'GreenScape Lawn', 'SafeGuard Insurance', 'City Water Utility',
    'Midwest Electric', 'Marcus White', 'Priya Patel', 'James Rivera',
    'D. Thompson', 'K. Martinez', 'R. Johnson', 'L. Park', 'Portfolio Yearning',
];

// Mutable per-test fixtures — the strataApi mock below reads these at call
// time so each `it()` can shape its own backend responses.
let stats: Record<string, unknown> = { byProperty: [] };
let units: unknown[] = [];
let properties: unknown[] = [];
let occupancies: unknown[] = [];
let invoices: unknown[] = [];

vi.mock('../../components/StrataDashboard/strataApi', () => ({
    strataGet: async (path: string) => {
        if (path === '/stats') return stats;
        if (path === '/units') return units;
        if (path === '/properties') return properties;
        if (path === '/occupancies') return occupancies;
        if (path === '/invoices') return invoices;
        return [];
    },
}));

import ManagerHome from '../../components/StrataDashboard/modules/ManagerHome';

function resetFixtures() {
    stats = { byProperty: [] };
    units = [];
    properties = [];
    occupancies = [];
    invoices = [];
}

const inDays = (n: number): string => new Date(Date.now() + n * 86400000).toISOString();

beforeEach(() => {
    resetFixtures();
    // Freeze "now" (vi.setSystemTime only — no vi.useFakeTimers; see
    // calendar.test.tsx's note on React 19 scheduler fragility) so fixture
    // dates built via inDays(N) and the component's own daysUntil() read
    // the exact same instant — otherwise a few ms of real elapsed time
    // between fixture setup and assertion can round a "10 days out" date
    // down to 9.
    vi.setSystemTime(new Date('2026-09-05T12:00:00.000Z'));
    // The two legacy raw-fetch widgets (work orders, tasks) — keep them
    // "offline" so this file stays focused on the item-1 widgets.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) } as Response)));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ManagerHome · empty/unavailable sources show honest empty states, never the old fake rows', () => {
    it('renders none of the hardcoded placeholder names/properties/amounts', async () => {
        render(<ManagerHome />);
        await waitFor(() => expect(screen.getByText('No properties imported yet')).toBeTruthy());

        for (const s of OLD_FAKE_STRINGS) {
            expect(screen.queryByText(s)).toBeNull();
        }
        expect(screen.getByText('No move-ins in the next 30 days')).toBeTruthy();
        expect(screen.getByText('No leases expiring in the next 60 days')).toBeTruthy();
        expect(screen.getByText('No payables due')).toBeTruthy();
    });
});

describe('ManagerHome · mocked real rows render (item 1 fix)', () => {
    it('renders a real lease expiration derived from /units', async () => {
        properties = [{ id: 'p1', name: 'Sunset Terrace' }];
        units = [{ id: 'u1', propertyId: 'p1', unitNumber: '12B', leaseEnd: inDays(10) }];
        render(<ManagerHome />);

        expect(await screen.findByText('Unit 12B')).toBeTruthy();
        expect(screen.getByText('Sunset Terrace')).toBeTruthy();
        expect(screen.getByText('10d')).toBeTruthy();
        expect(screen.queryByText('No leases expiring in the next 60 days')).toBeNull();
    });

    it('renders a real move-in derived from /occupancies + /units', async () => {
        properties = [{ id: 'p1', name: 'Sunset Terrace' }];
        units = [{ id: 'u1', propertyId: 'p1', unitNumber: '4A', leaseEnd: null }];
        occupancies = [{ unitId: 'u1', moveInDate: inDays(5), moveOutDate: null }];
        render(<ManagerHome />);

        expect(await screen.findByText('Move-In')).toBeTruthy();
        expect(screen.getByText('Unit 4A')).toBeTruthy();
        expect(screen.getByText('Sunset Terrace')).toBeTruthy();
        expect(screen.queryByText('No move-ins in the next 30 days')).toBeNull();
    });

    it('renders a real payable derived from /invoices, filtered to type=payable', async () => {
        invoices = [
            { type: 'payable', vendorOrTenant: 'City Plumbing Co', amount: 2400, dueDate: inDays(3), status: 'due' },
            { type: 'receivable', vendorOrTenant: 'Some Tenant', amount: 1500, dueDate: inDays(3), status: 'due' },
        ];
        render(<ManagerHome />);

        expect(await screen.findByText('City Plumbing Co')).toBeTruthy();
        expect(screen.getByText('$2,400')).toBeTruthy();
        expect(screen.queryByText('Some Tenant')).toBeNull(); // receivable excluded from AP Calendar
        expect(screen.queryByText('No payables due')).toBeNull();
    });

    it('renders real portfolio occupancy from /stats byProperty', async () => {
        stats = { byProperty: [{ name: 'Sunset Terrace', totalUnits: 40, occupiedUnits: 38, occupancyRate: 95 }] };
        render(<ManagerHome />);

        expect(await screen.findByText('Sunset Terrace')).toBeTruthy();
        expect(screen.getByText('40')).toBeTruthy();
        expect(screen.getByText('38')).toBeTruthy();
        expect(screen.getByText('95%')).toBeTruthy();
        expect(screen.queryByText('No properties imported yet')).toBeNull();
    });
});
