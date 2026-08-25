/**
 * Scheduling — plan 053 (cal.com API proxy, Links + QR, Strata bridges).
 *
 * Covers the TWO INDEPENDENT gates (VITE_CALCOM_URL embed vs backend 503 API),
 * the Upcoming tab against a mocked proxy, the four Andy event types, the
 * prefilled-link builder used by both bridges, and the QR encoder.
 *
 * The plan-047 states (needs-setup card, iframe) stay covered by
 * src/test/schedulingWidget.test.tsx.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Scheduling from '../components/Scheduling/Scheduling';
import {
    ANDY_EVENT_TYPES, ANDY_PROPERTIES, buildBookingLink, bookingLinkFor, calcomBase,
} from '../components/Scheduling/calcomLinks';
import { qrMatrix, qrDataUri } from '../components/Scheduling/qr';

const URL_ENV = { VITE_CALCOM_URL: 'https://cal.com/andy' };

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); });

/** Stub the backend proxy: `status` drives the response for /api/scheduling/*. */
function mockProxy(status: number, body: unknown) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
        } as unknown as Response;
    }) as typeof fetch;
    return calls;
}

describe('calcomBase / buildBookingLink (shared by the widget and both bridges)', () => {
    it('recovers the user page from either a user URL or an event-type URL', () => {
        expect(calcomBase({ VITE_CALCOM_URL: 'https://cal.com/andy' })).toBe('https://cal.com/andy');
        expect(calcomBase({ VITE_CALCOM_URL: 'https://cal.com/andy/unit-showing' })).toBe('https://cal.com/andy');
        expect(calcomBase({ VITE_CALCOM_URL: '  ' })).toBeUndefined();
        expect(calcomBase({})).toBeUndefined();
    });

    it('builds a prefilled link and omits blank / AppFolio "—" placeholder fields', () => {
        expect(buildBookingLink('https://cal.com/andy', 'showing-30min', { name: 'Brianna L. Keck', email: 'b@example.com' }))
            .toBe('https://cal.com/andy/showing-30min?name=Brianna+L.+Keck&email=b%40example.com');
        // AppFolio guest cards carry "—" for an unknown email — it must not become a query param
        expect(buildBookingLink('https://cal.com/andy/', 'showing-30min', { name: 'Cullins, Kenderequs', email: '—' }))
            .toBe('https://cal.com/andy/showing-30min?name=Cullins%2C+Kenderequs');
        expect(buildBookingLink('https://cal.com/andy', 'vendor-visit-1h', {})).toBe('https://cal.com/andy/vendor-visit-1h');
    });

    it('bookingLinkFor returns undefined without VITE_CALCOM_URL (bridges then stay honest)', () => {
        expect(bookingLinkFor('showing-30min', { name: 'X' }, {})).toBeUndefined();
        expect(bookingLinkFor('showing-30min', { name: 'X' }, URL_ENV))
            .toBe('https://cal.com/andy/showing-30min?name=X');
    });
});

describe("Andy's four event types", () => {
    it('are exactly the plan-053 set, with the slugs the webhook labels key off', () => {
        expect(ANDY_EVENT_TYPES.map(e => [e.slug, e.minutes])).toEqual([
            ['showing-30min', 30],
            ['maintenance-window-2h', 120],
            ['vendor-visit-1h', 60],
            ['move-in-out-walkthrough-45min', 45],
        ]);
        expect(ANDY_PROPERTIES).toEqual(['Woodland Parc Townhomes', 'Riverwood Club Apartments']);
    });
});

describe('Scheduling widget — separate embed and API gates', () => {
    it('env unset: Book shows the EMBED needs-setup card, Upcoming shows the API card (503)', async () => {
        mockProxy(503, { success: false, needsSetup: true });
        render(<Scheduling env={{}} />);
        expect(screen.getByText('Connect Cal.com')).toBeInTheDocument();
        expect(document.querySelector('[data-state="needs-setup-embed"]')).not.toBeNull();

        fireEvent.click(screen.getByRole('tab', { name: 'Upcoming' }));
        await screen.findByText('Cal.com API key not set');
        expect(document.querySelector('[data-state="needs-setup-api"]')).not.toBeNull();
    });

    it('env SET but backend 503: the iframe still renders, only Upcoming reports needs-setup', async () => {
        mockProxy(503, { success: false, needsSetup: true });
        render(<Scheduling env={URL_ENV} />);
        expect(screen.getByTitle('Scheduling booking page')).toHaveAttribute('src', 'https://cal.com/andy');
        expect(screen.queryByText('Connect Cal.com')).toBeNull();

        fireEvent.click(screen.getByRole('tab', { name: 'Upcoming' }));
        await screen.findByText('Cal.com API key not set');
    });

    it('Upcoming lists bookings from the proxy and cancels one', async () => {
        const calls = mockProxy(200, {
            success: true,
            data: [{ uid: 'bk_1', title: 'Showing (30 min)', start: '2026-09-01T15:00:00Z', end: '2026-09-01T15:30:00Z', status: 'accepted', attendees: [{ name: 'Brianna L. Keck' }] }],
        });
        render(<Scheduling env={URL_ENV} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Upcoming' }));

        await screen.findByText('Showing (30 min)');
        expect(screen.getByText(/Brianna L\. Keck/)).toBeInTheDocument();
        expect(calls[0].url).toContain('/api/scheduling/bookings?status=upcoming');

        vi.spyOn(window, 'prompt').mockReturnValue('Unit taken');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel Showing (30 min)' }));
        await waitFor(() => {
            const cancel = calls.find(c => c.url.includes('/bookings/bk_1/cancel'));
            expect(cancel).toBeDefined();
            expect(cancel!.init?.method).toBe('POST');
            expect(JSON.parse(String(cancel!.init?.body))).toEqual({ reason: 'Unit taken' });
        });
    });

    it('Upcoming surfaces a retryable error state when the backend is not 503', async () => {
        mockProxy(500, { success: false, error: 'boom' });
        render(<Scheduling env={URL_ENV} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Upcoming' }));
        await screen.findByText('Could not reach the booking API');
        expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
    });

    it('Links tab lists the four event types per property with copy + QR, no API key needed', async () => {
        mockProxy(503, { success: false, needsSetup: true });
        render(<Scheduling env={URL_ENV} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Links' }));

        for (const ev of ANDY_EVENT_TYPES) {
            expect(screen.getByText(`${ev.label} · ${ev.minutes} min`)).toBeInTheDocument();
        }
        // property selector drives the notes prefill
        expect(screen.getByText(/showing-30min\?notes=Woodland\+Parc\+Townhomes/)).toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Riverwood Club Apartments' } });
        expect(screen.getByText(/showing-30min\?notes=Riverwood\+Club\+Apartments/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Show QR for Showing' }));
        const img = await screen.findByAltText('QR code for the Showing booking link');
        expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
    });

    it('Links tab falls back to the embed needs-setup card when VITE_CALCOM_URL is unset', () => {
        mockProxy(503, {});
        render(<Scheduling env={{}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Links' }));
        expect(document.querySelector('[data-state="needs-setup-embed"]')).not.toBeNull();
    });
});

describe('qr encoder', () => {
    it('produces the right version per payload size and a stable data URI', () => {
        // v1 = 21 modules, v6 = 41 — size is 17 + 4 × version
        expect(qrMatrix('HELLO')!.length).toBe(21);
        expect(qrMatrix('https://cal.com/andy')!.length).toBe(25);
        expect(qrDataUri('https://cal.com/andy')).toMatch(/^data:image\/svg\+xml,/);
    });

    it('every Andy booking link encodes (none exceeds the supported capacity)', () => {
        for (const ev of ANDY_EVENT_TYPES) {
            const link = buildBookingLink('https://cal.com/andy', ev.slug, { notes: ANDY_PROPERTIES[0] });
            expect(qrMatrix(link), ev.slug).not.toBeNull();
        }
    });

    it('returns null (not a broken image) beyond the supported capacity', () => {
        expect(qrMatrix('x'.repeat(200))).toBeNull();
        expect(qrDataUri('x'.repeat(200))).toBeNull();
    });

    it('finder patterns and the dark module are placed per spec', () => {
        const m = qrMatrix('https://cal.com/andy/showing-30min')!;
        const size = m.length;
        for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
            expect(m[r][c]).toBe(true);           // finder outer ring corner
            expect(m[r + 1][c + 1]).toBe(false);  // white ring
            expect(m[r + 3][c + 3]).toBe(true);   // 3×3 core
        }
        expect(m[size - 8][8]).toBe(true);        // dark module
    });
});
