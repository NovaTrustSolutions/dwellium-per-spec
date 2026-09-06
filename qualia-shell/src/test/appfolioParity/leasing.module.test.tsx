/**
 * LeasingModule — real data, honest empty states (follow-up to 945c6d2 and
 * ea6cb34; same class of bug, the file Docs/code.md 2026-09-05 named "next in line").
 *
 * Old behavior: four module-level constants (MOCK_GUEST_CARDS, MOCK_APPLICATIONS,
 * MOCK_RENEWALS, MOCK_AGENTS) rendered fabricated prospects ("Cullins, Kenderequs",
 * "Mary H. Gallogly-Schmitt", …), applicants ("Tracy W. Terry", …), renewals
 * ("John Basher & Erin H. Devine" $2,650 → $2,915, …) and leasing agents ("Lisa M.",
 * "Andy K.") on every account — plus hardcoded "23" days-to-lease / "60%" online
 * payments / "51%" portal adoption cards on Metrics → Overview.
 *
 * Fix: Rental Applications and Renewals derive from the real feeds the module already
 * fetches (/workitems?type=lease for application-stage rows and stage='renewal_offered'
 * offers; /units for occupied units whose lease ends within 90 days; /entities?type=tenant
 * for names). Guest Cards and Agent Performance have no source in strataApi.static.ts,
 * strataApi.backend.ts or the sibling backend's dwelliumRoutes.ts and show an honest
 * empty state with the shared <NotYet> chip. Metric cards with no source read
 * "Not available".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';

vi.mock('../../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../context/UserContext')>();
    return { ...actual, useUser: () => ({ hasPermission: () => true, user: { id: 'test' } }) };
});

// Mutable per-test fixtures — the strataApi mock reads them at call time, so each
// `it()` shapes its own responses (bare array or { data } envelope).
let workitems: unknown = [];
let units: unknown = [];
let properties: unknown = [];
let tenants: unknown = [];
const { postSpy } = vi.hoisted(() => ({ postSpy: vi.fn(async (_path: string, _body?: unknown) => ({ success: true })) }));

vi.mock('../../components/StrataDashboard/strataApi', () => ({
    strataGet: async (path: string) => {
        if (path === '/workitems') return workitems;
        if (path === '/units') return units;
        if (path === '/properties') return properties;
        if (path === '/entities') return tenants;
        if (path === '/leasing/alerts') return { alerts: [] };
        return [];
    },
    strataPost: postSpy,
    strataPut: async () => ({}),
    strataDelete: async () => ({}),
}));

import LeasingModule from '../../components/StrataDashboard/modules/LeasingModule';

const OLD_FAKE_STRINGS = [
    // MOCK_GUEST_CARDS (+ the source-breakdown bar and prospect counter built from it)
    'Cullins, Kenderequs', 'Atterbury, Marilyn', 'Mary H. Gallogly-Schmitt', 'Brianna L. Keck', 'Michael Maselli', 'David Canoy',
    '12 prospects', 'Zumper', 'Lead Source Breakdown',
    // MOCK_APPLICATIONS
    'Tracy W. Terry', 'Marcella V. Walker', 'Bradley D. Beishir', 'Riverwood Club Apartments - H07', 'Rental Applications (3)',
    // MOCK_RENEWALS
    'John Basher & Erin H. Devine', 'Eumeko K. Fuller-Barrow', 'Jonathan G. Laosy', 'Fletcher A. Glass', 'Jillian C. Ellison',
    'Woodland Parc 2771-2', 'Riverwood D09', '$2,915', 'Include M2M',
    // MOCK_AGENTS
    'Lisa M.', 'Andy K.',
    // hardcoded metric literals on the Overview cards
    '23', '60%', '51%', 'Leases Signed (MTD)',
];

const CHANGED_TABS = ['Guest Cards', 'Rental Applications', 'Renewals', 'Metrics'];
const METRIC_VIEWS = ['Leasing Funnel', 'Box Score', 'Agent Performance', 'Overview'];

const inDays = (n: number): string => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

type WI = {
    id: string; type: string; title: string; status: string; priority: string; domain: string;
    propertyId: string | null; unitId: string | null; tags: string[]; metadata: Record<string, unknown>;
    createdAt: string; updatedAt: string;
};
const lease = (over: Partial<WI>): WI => ({
    id: 'w1', type: 'lease', title: 'Lease Application — Dana Okafor', status: 'open', priority: 'medium', domain: 'leasing',
    propertyId: 'p1', unitId: null, tags: [], createdAt: '2026-08-20T12:00:00.000Z', updatedAt: '2026-08-20T12:00:00.000Z',
    metadata: { applicantName: 'Dana Okafor', requestedUnit: 'A01', monthlyRent: 1295, moveInDate: '2026-10-01', stage: 'applied' },
    ...over,
});

type U = {
    id: string; propertyId: string; unitNumber: string; bedrooms: number; bathrooms: number; sqFt: number; rentAmount: number;
    status: string; currentTenantId: string | null; leaseStart: string | null; leaseEnd: string | null; createdAt: string; updatedAt: string;
};
const unit = (over: Partial<U>): U => ({
    id: 'u1', propertyId: 'p1', unitNumber: 'A01', bedrooms: 2, bathrooms: 1, sqFt: 900, rentAmount: 1295, status: 'occupied',
    currentTenantId: 't1', leaseStart: '2025-10-01', leaseEnd: inDays(45), createdAt: '2026-01-01', updatedAt: '2026-01-01',
    ...over,
});

const PROPERTIES = [{ id: 'p1', name: 'Riverwood Club', address: null, type: 'multifamily', unitCount: 4, ownerId: null }];
const TENANTS = [
    { id: 't1', entityType: 'tenant', name: 'Dana Okafor' },
    { id: 't2', entityType: 'tenant', name: 'Far Future Tenant' },
];

beforeEach(() => {
    workitems = []; units = []; properties = []; tenants = [];
    postSpy.mockReset();
    postSpy.mockResolvedValue({ success: true });
    // Freeze "now" (vi.setSystemTime only — no vi.useFakeTimers; see
    // managerHome.module.test.tsx) so inDays(N) fixtures and the component's own
    // daysUntil() read the same instant.
    vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** Render, wait for the initial fetch to settle (tab bodies only render once
 * !loading), then optionally open a tab by its button label. */
async function renderAndOpen(tabName?: string) {
    render(<LeasingModule />);
    await waitFor(() => expect(screen.queryByText('Loading leasing data…')).toBeNull());
    if (tabName) fireEvent.click(screen.getByRole('button', { name: tabName }));
}
const openMetric = (view: string) => fireEvent.click(screen.getByRole('button', { name: view }));
const cardOf = (label: string): HTMLElement => screen.getByText(label).closest('.s-glass-card') as HTMLElement;
// "Leasing Funnel" is both the sub-tab button and the card heading — anchor on the heading.
const funnelCard = () => within(screen.getByRole('heading', { name: 'Leasing Funnel' }).closest('.s-glass-card') as HTMLElement);

function expectNoneOf(strings: string[]) {
    for (const s of strings) expect(screen.queryByText(s), s).toBeNull();
}

describe('LeasingModule · empty account → honest empty states, never the old hardcoded arrays', () => {
    it('Guest Cards: "No guest cards yet." + Coming-soon chip, no fake prospects or bulk actions', async () => {
        await renderAndOpen('Guest Cards');
        expect(await screen.findByText('No guest cards yet.')).toBeTruthy();
        expect(screen.getByRole('note')).toHaveTextContent(/Coming soon/);
        expectNoneOf(['Cullins, Kenderequs', 'Mary H. Gallogly-Schmitt', 'David Canoy', '12 prospects', 'Lead Source Breakdown', 'Zumper']);
        expect(screen.queryByRole('button', { name: /Send App Link/ })).toBeNull();
        expect(screen.queryByRole('checkbox')).toBeNull();
        // plan 053 cal.com bridge survives as a generic showing link
        expect(screen.getByRole('button', { name: /Schedule showing/ })).toBeTruthy();
    });

    it('Rental Applications: honest empty state, no fake applicants', async () => {
        await renderAndOpen('Rental Applications');
        expect(await screen.findByText(/No rental applications yet/)).toBeTruthy();
        expect(screen.getByText('Rental Applications (0)')).toBeTruthy();
        expectNoneOf(['Tracy W. Terry', 'Marcella V. Walker', 'Bradley D. Beishir', 'Rental Applications (3)']);
        expect(screen.queryByText('SCREENING')).toBeNull(); // the fake "Screening: Approved" column has no source
    });

    it('Renewals: honest empty state, no fake tenants, no dead M2M toggle', async () => {
        await renderAndOpen('Renewals');
        expect(await screen.findByText(/No renewals due yet/)).toBeTruthy();
        expectNoneOf(['John Basher & Erin H. Devine', 'Eumeko K. Fuller-Barrow', 'Jonathan G. Laosy', 'Fletcher A. Glass', 'Jillian C. Ellison', 'Woodland Parc 2771-2', 'Riverwood D09', '$2,915']);
        expect(screen.queryByText('Include M2M')).toBeNull();
        expect(screen.queryByRole('button', { name: /Prepare Offer/ })).toBeNull();
    });

    it('Metrics → Agent Performance: "Not available" + Coming-soon chip, no fake agents', async () => {
        await renderAndOpen('Metrics');
        openMetric('Agent Performance');
        expect(await screen.findByText('Leasing Agent Performance')).toBeTruthy();
        expect(screen.getByText('Not available')).toBeTruthy();
        expect(screen.getByRole('note')).toHaveTextContent(/Coming soon/);
        expectNoneOf(['Lisa M.', 'Andy K.', '25%']);
    });

    it('Metrics → Overview: cards without a live source read "Not available" instead of 23 / 60% / 51%', async () => {
        await renderAndOpen('Metrics');
        expect(await screen.findByText('Avg. Days to Lease')).toBeTruthy();
        for (const label of ['Avg. Days to Lease', 'Online Payments', 'Portal Adoption']) {
            expect(cardOf(label), label).toHaveTextContent('Not available');
        }
        expect(cardOf('Active Applications')).toHaveTextContent('0');
        expect(cardOf('Pending Renewals')).toHaveTextContent('0');
        expectNoneOf(['23', '60%', '51%', 'Leases Signed (MTD)']);
    });

    it('Metrics → Leasing Funnel: starts at Applications — no invented guest-card / tour stages', async () => {
        await renderAndOpen('Metrics');
        openMetric('Leasing Funnel');
        const funnel = funnelCard();
        expect(funnel.getByText('Applications')).toBeTruthy();
        expect(funnel.getByText('Approved')).toBeTruthy();
        expect(funnel.getByText('Leases Signed')).toBeTruthy();
        expect(funnel.queryByText('Guest Cards')).toBeNull();
        expect(funnel.queryByText('Tours/Showings')).toBeNull();
        expect(funnel.getByRole('note')).toHaveTextContent(/Coming soon/);
        expect(screen.queryByText('Leasing Funnel — This Month')).toBeNull();
    });

    it('sweep: none of the old fake strings render on any changed tab or metric view', async () => {
        await renderAndOpen();
        expectNoneOf(OLD_FAKE_STRINGS);
        for (const tab of CHANGED_TABS) {
            fireEvent.click(screen.getByRole('button', { name: tab }));
            expectNoneOf(OLD_FAKE_STRINGS);
        }
        for (const view of METRIC_VIEWS) {
            openMetric(view);
            expectNoneOf(OLD_FAKE_STRINGS);
        }
    });
});

describe('LeasingModule · mocked real rows render on the derived tabs', () => {
    it('Rental Applications lists the real application-stage lease workitems, not signed leases', async () => {
        workitems = [
            lease({ id: 'w1', metadata: { applicantName: 'Dana Okafor', requestedUnit: 'A01', monthlyRent: 1295, moveInDate: '2026-10-01', stage: 'screening' } }),
            lease({ id: 'w2', title: 'Application: Lee Tran', propertyId: null, metadata: { applicantName: 'Lee Tran', requestedUnit: 'B02', monthlyRent: 0, stage: 'approved', property: 'Riverwood Club' } }),
            lease({ id: 'w3', title: 'Lease: Signed Person', metadata: { applicantName: 'Signed Person', requestedUnit: 'C03', monthlyRent: 1500, stage: 'lease_signed' } }),
        ];
        properties = PROPERTIES;
        await renderAndOpen('Rental Applications');

        const table = within(cardOf('Rental Applications (2)'));
        expect(table.getByText('Dana Okafor')).toBeTruthy();
        expect(table.getByText('Riverwood Club — A01')).toBeTruthy();
        expect(table.getByText('$1,295')).toBeTruthy();
        expect(table.getByText('2026-10-01')).toBeTruthy();
        expect(table.getByText('screening')).toBeTruthy();
        expect(table.getByText('Lee Tran')).toBeTruthy();
        expect(table.getByText('Riverwood Club — B02')).toBeTruthy(); // metadata.property fallback when propertyId is null
        expect(table.getByText('approved')).toBeTruthy();
        expect(table.queryByText('Signed Person')).toBeNull(); // lease_signed is not an application
        expect(screen.queryByText(/No rental applications yet/)).toBeNull();
    });

    it('Renewals: eligible rows come from occupied units expiring within 90 days; prepared offers show as pending', async () => {
        units = [
            unit({ id: 'u1', unitNumber: 'A01', leaseEnd: inDays(45), currentTenantId: 't1', rentAmount: 1295 }),
            unit({ id: 'u2', unitNumber: 'B02', leaseEnd: inDays(200), currentTenantId: 't2' }),        // outside the window
            unit({ id: 'u3', unitNumber: 'C03', leaseEnd: inDays(10), status: 'vacant', currentTenantId: null }), // not occupied
            unit({ id: 'u4', unitNumber: 'D04', leaseEnd: inDays(20), currentTenantId: 'Raw Tenant String' }),   // offer already out → pending, not duplicated
        ];
        workitems = [lease({
            id: 'r1', title: 'Renewal Offer — Pat Quinn',
            metadata: { stage: 'renewal_offered', applicantName: 'Pat Quinn', unitId: 'u4', unitNumber: 'D04', propertyName: 'Riverwood Club', currentRent: 1400, proposedRent: 1500, leaseEnd: inDays(20) },
        })];
        properties = PROPERTIES;
        tenants = TENANTS;
        await renderAndOpen('Renewals');

        const table = within(await screen.findByRole('table'));
        expect(table.getByText('Dana Okafor')).toBeTruthy();       // t1 resolved via /entities
        expect(table.getByText('Riverwood Club · A01')).toBeTruthy();
        expect(table.getByText('$1,295')).toBeTruthy();
        expect(table.getByText('eligible')).toBeTruthy();
        expect(table.getByText('Pat Quinn')).toBeTruthy();
        expect(table.getByText('$1,500')).toBeTruthy();
        expect(table.getByText('+$100')).toBeTruthy();
        expect(table.getByText('pending')).toBeTruthy();
        expect(table.queryByText('Far Future Tenant')).toBeNull();
        expect(table.queryByText('Riverwood Club · C03')).toBeNull();
        expect(table.queryByText('Raw Tenant String')).toBeNull();
        expect(table.getAllByRole('row')).toHaveLength(3); // header + 2 rows
        expect(screen.getByText('1 eligible · 1 offers out')).toBeTruthy();

        // Prepare Offer: proposed rent is asked for, never guessed — cancel posts nothing.
        const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce(null).mockReturnValueOnce('1300');
        fireEvent.click(screen.getByRole('button', { name: /Prepare Offer/ }));
        expect(postSpy).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Prepare Offer/ }));
        await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/leasing/renewals', expect.objectContaining({
            tenantName: 'Dana Okafor', unitId: 'u1', unitNumber: 'A01', propertyId: 'p1', propertyName: 'Riverwood Club',
            currentRent: 1295, proposedRent: 1300, leaseEnd: inDays(45),
        })));
        expect(prompt).toHaveBeenCalledTimes(2);
    });

    it('Renewals: search matches tenant, unit or property; status filter narrows', async () => {
        units = [unit({ id: 'u1', unitNumber: 'A01', currentTenantId: 't1' })];
        workitems = [lease({ id: 'r1', title: 'Renewal Offer — Pat Quinn', metadata: { stage: 'renewal_offered', applicantName: 'Pat Quinn', unitId: 'u9', unitNumber: 'Z09', propertyName: 'Elsewhere', currentRent: 900, proposedRent: 950 } })];
        properties = PROPERTIES; tenants = TENANTS;
        await renderAndOpen('Renewals');
        expect(await screen.findByText('Dana Okafor')).toBeTruthy();

        fireEvent.change(screen.getByPlaceholderText('Search tenant, unit or property...'), { target: { value: 'pat' } });
        expect(screen.queryByText('Dana Okafor')).toBeNull();
        expect(screen.getByText('Pat Quinn')).toBeTruthy();

        fireEvent.change(screen.getByPlaceholderText('Search tenant, unit or property...'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'eligible' }));
        expect(screen.getByText('Dana Okafor')).toBeTruthy();
        expect(screen.queryByText('Pat Quinn')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'pending' }));
        fireEvent.change(screen.getByPlaceholderText('Search tenant, unit or property...'), { target: { value: 'nobody' } });
        expect(screen.getByText('No renewals match this filter.')).toBeTruthy();
    });

    it('Metrics → Overview and Funnel count the real applications and eligible renewals', async () => {
        workitems = [
            lease({ id: 'w1', metadata: { applicantName: 'Dana Okafor', stage: 'screening', monthlyRent: 1200 } }),
            lease({ id: 'w2', metadata: { applicantName: 'Lee Tran', stage: 'approved', monthlyRent: 1400 } }),
            lease({ id: 'w3', metadata: { applicantName: 'Signed Person', stage: 'lease_signed', monthlyRent: 1000 } }),
        ];
        units = [unit({ id: 'u1', currentTenantId: 't1' }), unit({ id: 'u2', unitNumber: 'B02', leaseEnd: inDays(300), currentTenantId: 't2' })];
        properties = PROPERTIES; tenants = TENANTS;
        await renderAndOpen('Metrics');

        expect(await screen.findByText('Active Applications')).toBeTruthy();
        expect(cardOf('Active Applications')).toHaveTextContent('2');
        expect(cardOf('Pending Renewals')).toHaveTextContent('1');
        expect(cardOf('Leases Signed')).toHaveTextContent('1');
        expect(cardOf('Avg. Days to Lease')).toHaveTextContent('Not available');

        openMetric('Leasing Funnel');
        const funnel = funnelCard();
        expect(funnel.getByText('Applications').parentElement).toHaveTextContent('2');
        expect(funnel.getByText('Approved').parentElement).toHaveTextContent('1');
        expect(funnel.getByText('50% conversion')).toBeTruthy();
    });

    it('accepts the { data: [] } envelope shape from /workitems and /units', async () => {
        workitems = { data: [lease({ id: 'w1', metadata: { applicantName: 'Envelope Applicant', stage: 'applied', requestedUnit: 'A01' } })] };
        units = { data: [unit({ id: 'u1', currentTenantId: 't1' })] };
        properties = { data: PROPERTIES };
        tenants = { data: TENANTS };
        await renderAndOpen('Rental Applications');
        expect(await screen.findByText('Rental Applications (1)')).toBeTruthy();
        expect(within(cardOf('Rental Applications (1)')).getByText('Envelope Applicant')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Renewals' }));
        expect(await screen.findByText('Dana Okafor')).toBeTruthy();
    });
});
