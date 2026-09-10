/**
 * ReportingModule — Metrics + Scheduled Reports honesty (item 2 fix).
 *
 * Old behavior: the Metrics tab rendered a hardcoded METRICS_DATA array
 * (Occupancy 94.2%, Delinquency 2.1%, NOI $142,500, ...) and the Scheduled
 * Reports tab rendered a hardcoded SCHEDULED_REPORTS array (fake report
 * names + andy@dwellium.com-style recipients) — neither came from any
 * backend call, so they showed the same numbers forever regardless of the
 * account's real data.
 *
 * Fix: Metrics shows the real /stats occupancyRate and an honest
 * "Not available" / "Not available — connect QuickBooks" placeholder for
 * every other metric (no live source exists for those yet); Scheduled
 * Reports shows an honest empty state (no backend schedule store exists).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../context/UserContext')>();
    return { ...actual, useUser: () => ({ hasPermission: () => true, user: { id: 'test' } }) };
});

// Mutable per-test fixture for /stats.
let statsResponse: Record<string, unknown> | null = { occupancyRate: '87' };

vi.mock('../../components/StrataDashboard/strataApi', () => ({
    strataGet: async (path: string) => {
        if (path === '/stats') {
            if (statsResponse === null) throw new Error('stats unavailable');
            return statsResponse;
        }
        if (path === '/reports') return [];
        if (path === '/intake/stats') return { pending: 0 };
        return [];
    },
    strataPost: async () => ({}),
    strataPut: async () => ({}),
    strataDelete: async () => ({}),
}));

import ReportingModule from '../../components/StrataDashboard/modules/ReportingModule';

beforeEach(() => { statsResponse = { occupancyRate: '87' }; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function openTab(name: string) {
    fireEvent.click(screen.getByRole('button', { name }));
}

describe('ReportingModule · Metrics tab reads real occupancy, everything else is honest (item 2 fix)', () => {
    it('shows the real /stats occupancy number and never the old hardcoded metrics', async () => {
        render(<ReportingModule />);
        openTab('Metrics');

        await waitFor(() => expect(screen.getByText('87%')).toBeTruthy());
        expect(screen.queryByText('94.2%')).toBeNull();
        expect(screen.queryByText('$142,500')).toBeNull();
        expect(screen.queryByText('2.1%')).toBeNull();
        // Every other metric has no live source — honest placeholder, not a number.
        expect(screen.getAllByText('Not available — connect QuickBooks').length).toBeGreaterThan(0);
    });

    it('shows an honest "Not available" (no number) when /stats itself is unavailable', async () => {
        statsResponse = null;
        render(<ReportingModule />);
        openTab('Metrics');

        await waitFor(() => expect(screen.getByText('Not available')).toBeTruthy());
        expect(screen.queryByText('94.2%')).toBeNull();
        expect(screen.queryByText(/\d+%/)).toBeNull();
    });
});

describe('ReportingModule · Scheduled Reports shows an honest empty state (item 2 fix)', () => {
    it('never renders the old hardcoded schedule rows', async () => {
        render(<ReportingModule />);
        openTab('Scheduled Reports');

        expect(await screen.findByText('No scheduled reports yet.')).toBeTruthy();
        expect(screen.queryByText('Monthly Delinquency')).toBeNull();
        expect(screen.queryByText('Weekly Vacancy Summary')).toBeNull();
        expect(screen.queryByText(/andy@dwellium\.com/)).toBeNull();
    });
});
