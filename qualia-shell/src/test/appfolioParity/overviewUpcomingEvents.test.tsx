/**
 * StrataDashboard Overview — "Upcoming" calendar events (item 4 fix).
 *
 * fetchOverviewData used to do `Array.isArray(calData) ? calData.slice(0, 6) : []`
 * against the calendar endpoint's response. The real backend wraps its
 * response as `{ success, data: [] }` (same envelope /properties and /comms
 * already defend against a few lines above it) — a bare object is never an
 * array, so `Array.isArray` was always false and every calendar event was
 * silently dropped, even on a healthy backend. Fixed at
 * StrataDashboard.tsx's fetchOverviewData to accept both shapes.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const EVENT = { id: 'evt-1', summary: 'Board Meeting — Test Fixture', start: '2026-09-10T15:00:00.000Z', end: '2026-09-10T16:00:00.000Z' };

// Mutable per-test fixture — the authFetch mock below reads this at call
// time, so each `it()` can set its own calendar payload before rendering.
let calendarEvents: Array<Record<string, unknown>> = [EVENT];

vi.mock('../../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../context/UserContext')>();
    return {
        ...actual,
        useUser: () => ({
            user: { id: 'andy' },
            role: 'god',
            token: 'test-token',
            hasMinRole: () => true,
            hasPermission: () => true,
            isAuthenticated: true,
            logout: vi.fn(),
            // The fix under test lives on the calendar branch of
            // fetchOverviewData, which reads via authFetch (a separate,
            // non-dwellium service) rather than strataGet.
            authFetch: vi.fn(async (url: string) => {
                if (url.includes('/api/calendar/events')) {
                    return { ok: true, json: async () => ({ success: true, data: calendarEvents }) } as Response;
                }
                return { ok: false, json: async () => ({}) } as Response;
            }),
        }),
    };
});

vi.mock('../../components/StrataDashboard/strataApi', () => ({
    strataGet: async (path: string) => {
        if (path === '/stats') return { totalProperties: 0, totalUnits: 0, occupiedUnits: 0, occupancyRate: '0', openWorkOrders: 0 };
        return [];
    },
    strataPost: async () => ({}),
    strataPut: async () => ({}),
    strataDelete: async () => ({}),
}));

import StrataDashboard from '../../components/StrataDashboard/StrataDashboard';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe('StrataDashboard Overview — Upcoming events accept the { success, data: [] } envelope', () => {
    it('lists a calendar event returned as { success: true, data: [event] }', async () => {
        calendarEvents = [EVENT];
        render(<StrataDashboard />);
        expect(await screen.findByText('Board Meeting — Test Fixture')).toBeTruthy();
        expect(screen.queryByText('No upcoming events.')).toBeNull();
    });

    it('shows the honest empty state when the calendar has no events', async () => {
        calendarEvents = [];
        render(<StrataDashboard />);
        expect(await screen.findByText('No upcoming events.')).toBeTruthy();
        expect(screen.queryByText('Board Meeting — Test Fixture')).toBeNull();
    });
});
