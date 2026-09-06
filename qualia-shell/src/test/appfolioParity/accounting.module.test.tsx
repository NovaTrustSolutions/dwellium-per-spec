/**
 * AccountingModule — real data, honest empty states (follow-up to 945c6d2's
 * ManagerHome / ReportingModule fixes; same class of bug).
 *
 * Old behavior: five module-level constants (MOCK_TENANT_LEDGER,
 * MOCK_BANK_ACCOUNTS, MOCK_JOURNAL_ENTRIES, MOCK_GL_ACCOUNTS, MOCK_DIAGNOSTICS)
 * rendered fabricated tenants (John Basher & Erin H. Devine, ...), bank
 * balances ($284,500 Chase Operations, ...), journal entries (JE-2026-0301
 * ...), GL balances and diagnostic sentences ("12 tenants have outstanding
 * balances totaling $19,050 ...") unconditionally on the Tenant Ledger, Bank
 * Accounts, Bank Transfers, Journal Entries, GL Accounts and Diagnostics tabs
 * — plus a fake $427,550 "Bank Balance" card on Overview — regardless of the
 * account's real data.
 *
 * Fix: Tenant Ledger, Journal Entries and Diagnostics derive from the real
 * /invoices rows the module already fetches (receivables per tenant;
 * type='journal' rows the New Entry modal writes; overdue / due-soon
 * warnings). Bank Accounts, Bank Transfers, GL Accounts and the Bank Balance
 * card have no backend source (strataApi.static.ts, strataApi.backend.ts and
 * the sibling backend's dwelliumRoutes.ts expose no bank / GL / journal
 * routes) and show an honest "Not available — connect QuickBooks" state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../context/UserContext')>();
    return { ...actual, useUser: () => ({ hasPermission: () => true, user: { id: 'test' } }) };
});

// Mutable per-test fixture — the strataApi mock reads it at call time, so each
// `it()` shapes its own /invoices response (bare array or { data } envelope).
let invoices: unknown = [];

vi.mock('../../components/StrataDashboard/strataApi', () => ({
    strataGet: async (path: string) => (path === '/invoices' ? invoices : []),
    strataPost: async () => ({}),
    strataPut: async () => ({}),
    strataDelete: async () => ({}),
}));

import AccountingModule from '../../components/StrataDashboard/modules/AccountingModule';

const OLD_FAKE_STRINGS = [
    // MOCK_TENANT_LEDGER
    'John Basher & Erin H. Devine', 'Eumeko K. Fuller-Barrow', 'Fletcher A. Glass', 'Woodland 2771-2', 'Riverwood D09',
    // MOCK_BANK_ACCOUNTS (+ the Overview card and Bank Transfers chips built from it)
    'ZP Operations', 'Chase Bank', '****7392', 'Reserve Fund', 'Petty Cash', '$427,550', 'ZP Operations: $284,500',
    // MOCK_JOURNAL_ENTRIES
    'JE-2026-0301', 'March Rent Roll — All Properties', 'Vendor payments — plumbing + HVAC',
    // MOCK_GL_ACCOUNTS
    'Operating Cash', 'Security Deposits Held', 'Property Management Fee',
    // MOCK_DIAGNOSTICS
    '12 tenants have outstanding balances totaling $19,050 — oldest delinquency is 45 days',
    'All bank account reconciliations are up to date as of March 6, 2026',
    'QuickBooks sync not configured — connect to enable automated journal posting',
    'March rent roll posted — $146,500 across 4 properties, 240 occupied units',
];

const CHANGED_TABS = ['Bank Accounts', 'Journal Entries', 'Bank Transfers', 'GL Accounts', 'Tenant Ledger', 'Diagnostics'];

type Row = {
    id: string; type: string; vendorOrTenant: string; amount: number; status: string;
    dueDate: string; propertyId: string; description: string; createdAt: string; entityId: string | null;
};
const row = (over: Partial<Row>): Row => ({
    id: 'r1', type: 'receivable', vendorOrTenant: 'Dana Okafor', amount: 1200, status: 'pending',
    dueDate: '2026-09-01', propertyId: 'p1', description: 'September rent', createdAt: '2026-08-15', entityId: 't1',
    ...over,
});
const inDays = (n: number): string => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

beforeEach(() => {
    invoices = [];
    // Freeze "now" (vi.setSystemTime only — no vi.useFakeTimers; see
    // managerHome.module.test.tsx) so inDays(N) fixtures and the component's
    // own Date.now() in deriveDiagnostics read the same instant.
    vi.setSystemTime(new Date('2026-09-05T12:00:00.000Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** Render, wait for the /invoices fetch to settle (tab bodies only render once
 * !loading), then optionally open a sub-tab by its button label. */
async function renderAndOpen(tabName?: string) {
    render(<AccountingModule />);
    await waitFor(() => expect(screen.queryByText('Loading accounting data…')).toBeNull());
    if (tabName) fireEvent.click(screen.getByRole('button', { name: tabName }));
}

function expectNoneOf(strings: string[]) {
    for (const s of strings) expect(screen.queryByText(s), s).toBeNull();
}

describe('AccountingModule · empty account → honest empty states, never the old hardcoded arrays', () => {
    it('Overview: the Bank Balance card is honest instead of a fake $427,550 total', async () => {
        await renderAndOpen();
        expect(screen.getByText('Total Receivable')).toBeTruthy();
        expect(screen.getByText('Bank Balance')).toBeTruthy();
        expect(screen.getByText('Not available — connect QuickBooks')).toBeTruthy();
        expect(screen.queryByText('$427,550')).toBeNull();
    });

    it('Bank Accounts: "Not available — connect QuickBooks", no fake Chase/Ally balances', async () => {
        await renderAndOpen('Bank Accounts');
        expect(await screen.findByText('Not available — connect QuickBooks')).toBeTruthy();
        expect(screen.getByRole('note')).toHaveTextContent(/Coming soon/);
        expectNoneOf(['ZP Operations', 'Chase Bank', 'Ally Bank', '****7392', 'Reserve Fund', 'Petty Cash']);
    });

    it('Bank Transfers: no fake account chips and no dead "New Transfer" button', async () => {
        await renderAndOpen('Bank Transfers');
        expect(await screen.findByText('Not available — connect QuickBooks')).toBeTruthy();
        expectNoneOf(['ZP Operations: $284,500', 'Security Deposits: $97,200', 'Reserve Fund: $45,000']);
        expect(screen.queryByRole('button', { name: /New Transfer/ })).toBeNull();
    });

    it('Journal Entries: honest empty state, no fake JE-2026-* rows', async () => {
        await renderAndOpen('Journal Entries');
        expect(await screen.findByText('No journal entries yet.')).toBeTruthy();
        expectNoneOf(['JE-2026-0301', 'JE-2026-0305', 'March Rent Roll — All Properties', '$146,500']);
    });

    it('GL Accounts: "Not available — connect QuickBooks", no fake chart of accounts', async () => {
        await renderAndOpen('GL Accounts');
        expect(await screen.findByText('Not available — connect QuickBooks')).toBeTruthy();
        expectNoneOf(['Operating Cash', 'Security Deposits Held', 'Rental Income', 'Property Management Fee', '$284,500']);
    });

    it('Tenant Ledger: honest empty state, no fake tenants', async () => {
        await renderAndOpen('Tenant Ledger');
        expect(await screen.findByText('No receivables on file yet.')).toBeTruthy();
        expectNoneOf(['John Basher & Erin H. Devine', 'Eumeko K. Fuller-Barrow', 'Fletcher A. Glass', 'Owes $4,050']);
    });

    it('Diagnostics: honest "nothing to diagnose", none of the invented sentences', async () => {
        await renderAndOpen('Diagnostics');
        expect(await screen.findByText('No invoices on file yet — nothing to diagnose')).toBeTruthy();
        expectNoneOf([
            '12 tenants have outstanding balances totaling $19,050 — oldest delinquency is 45 days',
            'QuickBooks sync not configured — connect to enable automated journal posting',
            'All bank account reconciliations are up to date as of March 6, 2026',
        ]);
        expect(screen.queryByRole('button', { name: 'Setup QB' })).toBeNull();
    });

    it('sweep: none of the old fake strings render on any changed tab', async () => {
        await renderAndOpen();
        expectNoneOf(OLD_FAKE_STRINGS);
        for (const tab of CHANGED_TABS) {
            fireEvent.click(screen.getByRole('button', { name: tab }));
            expectNoneOf(OLD_FAKE_STRINGS);
        }
    });
});

describe('AccountingModule · mocked real /invoices rows render on the derived tabs', () => {
    it('Tenant Ledger groups real receivables per tenant with a running balance', async () => {
        invoices = [
            row({ id: 'r1', amount: 1200, status: 'paid', dueDate: '2026-08-01', description: 'August rent' }),
            row({ id: 'r2', amount: 1200, status: 'overdue', dueDate: '2026-09-01', description: 'September rent' }),
            row({ id: 'p1', type: 'payable', vendorOrTenant: 'City Plumbing Co', amount: 400, dueDate: inDays(3), description: 'Drain repair', entityId: 'v1' }),
        ];
        await renderAndOpen('Tenant Ledger');

        expect(await screen.findByText('Dana Okafor')).toBeTruthy();
        expect(screen.getByText('Owes $1,200')).toBeTruthy();
        expect(screen.getByText('August rent')).toBeTruthy();
        expect(screen.getByText('September rent')).toBeTruthy();
        // Aug: charge 1,200 + payment 1,200 → balance $0; Sep: charge 1,200, unpaid → balance $1,200.
        expect(screen.getAllByText('$1,200')).toHaveLength(4);
        expect(screen.getByText('$0')).toBeTruthy();
        expect(screen.queryByText('City Plumbing Co')).toBeNull(); // payables are not tenant ledger rows
        expect(screen.queryByText('No receivables on file yet.')).toBeNull();
    });

    it('Journal Entries renders the type=journal rows the New Entry modal writes to /invoices', async () => {
        invoices = [row({ id: 'j1', type: 'journal', vendorOrTenant: 'JE-2026-0905', description: 'Opening balance adjustment', amount: 500, dueDate: '2026-09-05', entityId: null })];
        await renderAndOpen('Journal Entries');

        expect(await screen.findByText('JE-2026-0905')).toBeTruthy();
        expect(screen.getByText('Opening balance adjustment')).toBeTruthy();
        expect(screen.getByText('$500')).toBeTruthy();
        expect(screen.getByText('pending')).toBeTruthy();
        expect(screen.queryByText('No journal entries yet.')).toBeNull();
    });

    it('Diagnostics derives its warnings from real overdue / due-soon invoices and its buttons switch tabs', async () => {
        invoices = [
            row({ id: 'r1', status: 'overdue', amount: 1200, dueDate: '2026-08-01' }),
            row({ id: 'r2', status: 'overdue', amount: 800, dueDate: '2026-08-15', description: 'Late fee' }),
            row({ id: 'p1', type: 'payable', vendorOrTenant: 'City Plumbing Co', amount: 400, status: 'pending', dueDate: inDays(3), entityId: 'v1' }),
            row({ id: 'p2', type: 'payable', vendorOrTenant: 'Settled Vendor', amount: 999, status: 'paid', dueDate: inDays(2), entityId: 'v2' }),
        ];
        await renderAndOpen('Diagnostics');

        expect(await screen.findByText('2 overdue receivables totaling $2,000')).toBeTruthy();
        expect(screen.getByText('1 payable due within 7 days — $400')).toBeTruthy();
        expect(screen.queryByText(/QuickBooks sync/)).toBeNull();
        expect(screen.queryByText(/reconciliations/)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'View Receivables' }));
        expect(screen.getByPlaceholderText('Search receivables…')).toBeTruthy();
        expect(screen.getByText('Late fee')).toBeTruthy();
    });

    it('Diagnostics with rows but nothing wrong → honest all-clear, not an invented rent-roll line', async () => {
        invoices = [row({ id: 'r1', status: 'paid' })];
        await renderAndOpen('Diagnostics');
        expect(await screen.findByText('No overdue receivables or payables, and nothing due within 7 days')).toBeTruthy();
        expect(screen.queryByText(/rent roll posted/)).toBeNull();
    });

    it('accepts the { data: [] } envelope shape from /invoices', async () => {
        invoices = { data: [row({ id: 'j1', type: 'journal', vendorOrTenant: 'JE-2026-0905', description: 'Envelope-shaped row', amount: 75, entityId: null })] };
        await renderAndOpen('Journal Entries');
        expect(await screen.findByText('JE-2026-0905')).toBeTruthy();
        expect(screen.getByText('Envelope-shaped row')).toBeTruthy();
    });
});
