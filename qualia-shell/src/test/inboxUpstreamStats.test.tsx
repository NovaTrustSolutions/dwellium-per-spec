/**
 * Plan 066 Phase 7 (F8) — UpstreamStats, the per-user upstream Inbox Zero
 * stats proxy in the Stats tab. Rendered standalone with an injected
 * `authFetch` mock, mirroring inboxPhase5Tabs.test.tsx's `jsonResponse`
 * pattern. Fixtures for the stats endpoints are shaped exactly like
 * upstream's `responseTimeResponseSchema` / `statsByPeriodResponseSchema`
 * (apps/web/app/api/v1/stats/*\/validation.ts in the read-only ~/dev/inbox-zero clone).
 */
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, afterEach, expect } from 'vitest';

import UpstreamStats from '../components/InboxZero/UpstreamStats';

function jsonResponse(data: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => data, headers: new Headers() } as Response;
}
/** The backend's real envelope for a 2xx on every /api/inbox route: { success: true, data }. */
function okEnvelope(data: unknown): Response {
    return jsonResponse({ success: true, data });
}

function collectToasts(): { onToast: ReturnType<typeof vi.fn>; cleanup: () => void } {
    const onToast = vi.fn();
    window.addEventListener('qualia-toast', onToast);
    return { onToast, cleanup: () => window.removeEventListener('qualia-toast', onToast) };
}

const RESPONSE_TIME_FIXTURE = {
    summary: {
        medianResponseTime: 80, // upstream stores this in MINUTES -> "1 h 20 m"
        averageResponseTime: 35, // -> "35 m"
        within1Hour: 42, // upstream calculateWithin1Hour returns a PERCENTAGE, not a count
        previousPeriodComparison: null,
    },
    distribution: {
        lessThan1Hour: 5,
        oneToFourHours: 3,
        fourTo24Hours: 2,
        oneToThreeDays: 1,
        threeToSevenDays: 0,
        moreThan7Days: 0,
    },
    trend: [],
    emailsAnalyzed: 11,
    maxEmailsCap: 500,
};

function byPeriodRow(n: number) {
    return { startOfPeriod: `2026-08-${String(n).padStart(2, '0')}T00:00:00.000Z`, All: n, Sent: n, Read: n, Unread: 0, Unarchived: 0, Archived: n };
}
const BY_PERIOD_FIXTURE = { result: Array.from({ length: 10 }, (_, i) => byPeriodRow(i + 1)), allCount: 55, inboxCount: 10, readCount: 10, sentCount: 10 };

function statsRouter(overrides: Record<string, () => Response> = {}) {
    return (url: string) => {
        if (overrides[url]) return Promise.resolve(overrides[url]());
        if (url.includes('/upstream/status')) return Promise.resolve(okEnvelope({ configured: true, hasKey: true }));
        if (url.includes('/upstream/stats/response-time')) return Promise.resolve(okEnvelope(RESPONSE_TIME_FIXTURE));
        if (url.includes('/upstream/stats/by-period')) return Promise.resolve(okEnvelope(BY_PERIOD_FIXTURE));
        return Promise.resolve(jsonResponse({}, false, 500));
    };
}

describe('UpstreamStats', () => {
    afterEach(() => vi.restoreAllMocks());

    it('not configured (configured:false) shows the quiet message and no input', async () => {
        const authFetch = vi.fn().mockResolvedValue(okEnvelope({ configured: false, hasKey: false }));
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        await waitFor(() => expect(screen.getByText(/isn't connected on this server/)).toBeInTheDocument());
        expect(screen.getByText(/INBOX_ZERO_API_URL/)).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    });

    it('not configured via a 503 needsSetup status response shows the same message', async () => {
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'not set up', needsSetup: true }, false, 503));
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        await waitFor(() => expect(screen.getByText(/isn't connected on this server/)).toBeInTheDocument());
    });

    it('configured, no key (hasKey:false) shows the labelled password input and Save', async () => {
        const authFetch = vi.fn().mockResolvedValue(okEnvelope({ configured: true, hasKey: false }));
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        const input = await screen.findByLabelText(/Inbox Zero API key/i);
        expect(input).toHaveAttribute('type', 'password');
        expect(input).toHaveAttribute('autoComplete', 'off');
        expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument();
    });

    it('no key via a 409 needsKey status response shows the same input state', async () => {
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'no key', needsKey: true }, false, 409));
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        await screen.findByLabelText(/Inbox Zero API key/i);
    });

    it('Save sends PUT with the typed key, clears the input after success, and never echoes the key', async () => {
        const { onToast, cleanup } = collectToasts();
        // first status call (mount) -> no-key; PUT succeeds; second status call (after save) -> has-key -> stats
        let statusCalls = 0;
        const authFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (url.includes('/upstream/key') && init?.method === 'PUT') {
                return Promise.resolve(jsonResponse({ hasKey: true }));
            }
            if (url.includes('/upstream/status')) {
                statusCalls++;
                return Promise.resolve(okEnvelope({ configured: true, hasKey: statusCalls > 1 }));
            }
            return statsRouter()(url);
        });

        const { container } = render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        const input = await screen.findByLabelText(/Inbox Zero API key/i);
        const SECRET = 'test-upstream-key-0000';
        fireEvent.change(input, { target: { value: SECRET } });
        fireEvent.click(screen.getByRole('button', { name: /Save/ }));

        await waitFor(() => expect(authFetch).toHaveBeenCalledWith('/api/inbox/upstream/key', expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ apiKey: SECRET }),
        })));

        // Transitions to the stats view; the password field is gone entirely.
        await waitFor(() => expect(screen.queryByLabelText(/Inbox Zero API key/i)).not.toBeInTheDocument());
        expect(container.textContent).not.toContain(SECRET);
        expect(onToast).not.toHaveBeenCalled();
        cleanup();
    });

    it('Save clears the input on a failed save (400) and shows the server error inline, without echoing the key', async () => {
        const { onToast, cleanup } = collectToasts();
        const authFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (url.includes('/upstream/key') && init?.method === 'PUT') {
                return Promise.resolve(jsonResponse({ error: 'Key must be 10-512 characters' }, false, 400));
            }
            return Promise.resolve(okEnvelope({ configured: true, hasKey: false }));
        });
        const { container } = render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        const input = await screen.findByLabelText(/Inbox Zero API key/i);
        const SECRET = 'bad key';
        fireEvent.change(input, { target: { value: SECRET } });
        fireEvent.click(screen.getByRole('button', { name: /Save/ }));

        await waitFor(() => expect(screen.getByText('Key must be 10-512 characters')).toBeInTheDocument());
        expect((screen.getByLabelText(/Inbox Zero API key/i) as HTMLInputElement).value).toBe('');
        expect(container.textContent).not.toContain(SECRET);
        expect(onToast).not.toHaveBeenCalled();
        cleanup();
    });

    it('renders formatted stats: response times, % within 1 hour, emailsAnalyzed cap note, distribution, and the last-8 by-period rows', async () => {
        const authFetch = vi.fn().mockImplementation(statsRouter());
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);

        await waitFor(() => expect(authFetch).toHaveBeenCalledWith('/api/inbox/upstream/stats/response-time'));
        expect(authFetch).toHaveBeenCalledWith('/api/inbox/upstream/stats/by-period?period=week');

        expect(await screen.findByText('1 h 20 m')).toBeInTheDocument(); // medianResponseTime 80 min
        expect(screen.getByText('35 m')).toBeInTheDocument(); // averageResponseTime
        expect(screen.getByText('42%')).toBeInTheDocument(); // within1Hour
        expect(screen.getByText(/11 emails analyzed/)).toBeInTheDocument();
        expect(screen.queryByText(/capped at/)).not.toBeInTheDocument(); // 11 < maxEmailsCap 500

        // distribution counts (labelled list) — scoped under its own heading to avoid
        // colliding with the by-period table's numbers.
        const distSection = screen.getByText('Response time distribution').closest('div')!;
        expect(within(distSection).getByText('5')).toBeInTheDocument(); // lessThan1Hour

        // last 8 of 10 by-period rows: header row + 8 body rows, not 10 (rows 1 and 2 dropped)
        expect(screen.getAllByRole('row')).toHaveLength(9);
    });

    it('shows the emailsAnalyzed cap note when emailsAnalyzed >= maxEmailsCap', async () => {
        const authFetch = vi.fn().mockImplementation(statsRouter({
            '/api/inbox/upstream/stats/response-time': () => okEnvelope({ ...RESPONSE_TIME_FIXTURE, emailsAnalyzed: 500, maxEmailsCap: 500 }),
        }));
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        expect(await screen.findByText(/capped at 500/)).toBeInTheDocument();
    });

    it('Remove key calls DELETE after confirm and returns to the no-key state', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        let removed = false;
        const authFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (url.includes('/upstream/key') && init?.method === 'DELETE') {
                removed = true;
                return Promise.resolve(jsonResponse({}, true));
            }
            if (url.includes('/upstream/status')) return Promise.resolve(okEnvelope({ configured: true, hasKey: !removed }));
            return statsRouter()(url);
        });
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        const removeBtn = await screen.findByRole('button', { name: /Remove key/i });
        fireEvent.click(removeBtn);
        await waitFor(() => expect(screen.getByLabelText(/Inbox Zero API key/i)).toBeInTheDocument());
    });

    it('Remove key does NOT call DELETE when the confirm is declined', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const authFetch = vi.fn().mockImplementation(statsRouter());
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        const removeBtn = await screen.findByRole('button', { name: /Remove key/i });
        fireEvent.click(removeBtn);
        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        expect(authFetch).not.toHaveBeenCalledWith(expect.stringContaining('/upstream/key'), expect.objectContaining({ method: 'DELETE' }));
    });

    it('a failed Remove key is reported, and the stats view stays (the key is still stored)', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const authFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (url.includes('/upstream/key') && init?.method === 'DELETE') return Promise.resolve(jsonResponse({ success: false, error: 'db locked' }, false, 500));
            return statsRouter()(url);
        });
        const { onToast, cleanup } = collectToasts();
        try {
            render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
            fireEvent.click(await screen.findByRole('button', { name: /Remove key/i }));
            await waitFor(() => expect(onToast).toHaveBeenCalled());
            expect(String((onToast.mock.calls[0][0] as CustomEvent).detail)).toMatch(/Could not remove the key/);
            expect(screen.getByRole('button', { name: /Remove key/i })).toBeInTheDocument();
        } finally {
            cleanup();
        }
    });

    it('502 on a stats call shows the error and a Replace key button', async () => {
        const authFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/upstream/status')) return Promise.resolve(okEnvelope({ configured: true, hasKey: true }));
            if (url.includes('/upstream/stats/response-time')) return Promise.resolve(jsonResponse({ error: 'Upstream rejected your API key' }, false, 502));
            return Promise.resolve(okEnvelope(BY_PERIOD_FIXTURE));
        });
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        await waitFor(() => expect(screen.getByText('Upstream rejected your API key')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Replace key/i })).toBeInTheDocument();
    });

    it('504 on a stats call shows the error and a Retry button (no Replace key)', async () => {
        const authFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/upstream/status')) return Promise.resolve(okEnvelope({ configured: true, hasKey: true }));
            if (url.includes('/upstream/stats/response-time')) return Promise.resolve(jsonResponse({ error: 'Upstream timed out' }, false, 504));
            return Promise.resolve(okEnvelope(BY_PERIOD_FIXTURE));
        });
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        await waitFor(() => expect(screen.getByText('Upstream timed out')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Replace key/i })).not.toBeInTheDocument();
    });

    it('Replace key on a 502 error goes back to the no-key input state', async () => {
        const authFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/upstream/status')) return Promise.resolve(okEnvelope({ configured: true, hasKey: true }));
            if (url.includes('/upstream/stats/response-time')) return Promise.resolve(jsonResponse({ error: 'Upstream rejected your API key' }, false, 502));
            return Promise.resolve(okEnvelope(BY_PERIOD_FIXTURE));
        });
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        const replaceBtn = await screen.findByRole('button', { name: /Replace key/i });
        fireEvent.click(replaceBtn);
        expect(await screen.findByLabelText(/Inbox Zero API key/i)).toBeInTheDocument();
    });

    it('Retry on a 504 error re-runs the status/stats fetch', async () => {
        let attempt = 0;
        const authFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/upstream/status')) return Promise.resolve(okEnvelope({ configured: true, hasKey: true }));
            if (url.includes('/upstream/stats/response-time')) {
                attempt++;
                return attempt === 1
                    ? Promise.resolve(jsonResponse({ error: 'Upstream timed out' }, false, 504))
                    : Promise.resolve(okEnvelope(RESPONSE_TIME_FIXTURE));
            }
            return Promise.resolve(okEnvelope(BY_PERIOD_FIXTURE));
        });
        render(<UpstreamStats apiBase="/api/inbox" authFetch={authFetch} />);
        const retryBtn = await screen.findByRole('button', { name: /^Retry$/i });
        fireEvent.click(retryBtn);
        expect(await screen.findByText('42%')).toBeInTheDocument();
    });
});
