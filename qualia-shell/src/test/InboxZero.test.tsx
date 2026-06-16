import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import type { ReactNode } from 'react';

// InboxZero pulls in ThemeContext + UserContext + React Query. We mock the two
// contexts (preserving ThemeContext's value-exports) and provide a real, retry-
// disabled QueryClient so query error/empty/success states are deterministic.

const authFetch = vi.fn();

vi.mock('../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../context/UserContext')>();
    return {
        ...actual,
        useUser: () => ({
            role: 'god',
            token: 'test-token',
            authFetch,
            hasMinRole: () => true,
            isAuthenticated: true,
        }),
    };
});

vi.mock('../context/ThemeContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../context/ThemeContext')>();
    return {
        ...actual,
        useTheme: () => ({
            theme: 'dark',
            setTheme: vi.fn(),
            fontPairing: actual.FONT_PAIRINGS[0],
            setFontPairing: vi.fn(),
            animationsEnabled: true,
            setAnimationsEnabled: vi.fn(),
        }),
    };
});

// jsdom has no EventSource; InboxZero opens an SSE stream on mount. Stub it.
class FakeEventSource {
    onerror: ((this: EventSource, ev: Event) => void) | null = null;
    addEventListener() {}
    removeEventListener() {}
    close() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).EventSource = FakeEventSource;

import InboxZero from '../components/InboxZero/InboxZero';

function jsonResponse(data: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: async () => data,
        headers: new Headers(),
    } as Response;
}

const ITEM = {
    id: 'mail-1',
    source: 'gmail',
    subject: 'Lease renewal for Unit 4B',
    sender: 'tenant@example.com',
    snippet: 'Hi, I would like to renew my lease…',
    signalClass: 'signal',
    urgency: 'high',
    status: 'pending',
    hasAttachments: false,
    createdAt: '2026-05-01T12:00:00Z',
    isRead: false,
};

/** Route the InboxZero on-mount fetches. `itemsResponse` controls the items endpoint. */
function routeFetch(itemsResponse: () => Response) {
    return (url: string) => {
        if (typeof url !== 'string') return Promise.resolve(jsonResponse({ success: false }, false, 500));
        // The items list endpoint is `/api/inbox?...` (no trailing path segment).
        if (/\/api\/inbox\?/.test(url)) return Promise.resolve(itemsResponse());
        if (url.includes('/api/inbox/stats')) return Promise.resolve(jsonResponse({ success: true, data: {} }));
        if (url.includes('/api/inbox/metrics')) return Promise.resolve(jsonResponse({ success: true, data: {} }));
        // Everything else (settings, security, etc.) — benign empty success.
        return Promise.resolve(jsonResponse({ success: true, data: {} }));
    };
}

function renderInbox() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return render(<InboxZero />, { wrapper });
}

describe('InboxZero', () => {
    beforeEach(() => {
        authFetch.mockReset();
        localStorage.clear();
    });

    it('renders pending email cards on the main triage view (happy path)', async () => {
        authFetch.mockImplementation(
            routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))
        );

        renderInbox();

        await waitFor(() => {
            expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument();
        });
        // The false-empty guard must NOT fire when items loaded successfully.
        expect(screen.queryByText('Inbox Zero!')).not.toBeInTheDocument();
        expect(screen.queryByText('Couldn’t load inbox')).not.toBeInTheDocument();
    });

    it('tags an email card with its source Gmail account (multi-account)', async () => {
        authFetch.mockImplementation(
            routeFetch(() => jsonResponse({ success: true, data: [{ ...ITEM, sourceAccount: 'andy@dwellium.com' }], pagination: { hasMore: false } }))
        );

        renderInbox();

        await waitFor(() => {
            expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument();
        });
        // The source-account badge surfaces which mailbox the email came from.
        expect(screen.getByText(/andy@dwellium\.com/)).toBeInTheDocument();
    });

    it('shows the celebratory empty state only when the fetch genuinely returns zero items', async () => {
        authFetch.mockImplementation(
            routeFetch(() => jsonResponse({ success: true, data: [], pagination: { hasMore: false } }))
        );

        renderInbox();

        await waitFor(() => {
            expect(screen.getByText('Inbox Zero!')).toBeInTheDocument();
        });
        expect(screen.queryByText('Couldn’t load inbox')).not.toBeInTheDocument();
    });

    it('shows an error state (not the false "Inbox Zero!") when the items fetch fails', async () => {
        // Non-2xx with no usable body — the exact case parseJson turns into a clear message.
        authFetch.mockImplementation(routeFetch(() => jsonResponse({}, false, 500)));

        renderInbox();

        await waitFor(() => {
            expect(screen.getByText('Couldn’t load inbox')).toBeInTheDocument();
        });
        // Regression guard: the misleading success message must NOT appear on failure.
        expect(screen.queryByText('Inbox Zero!')).not.toBeInTheDocument();
        // The hardened error message surfaces the status, and a retry affordance exists.
        expect(screen.getByText(/Inbox items fetch failed \(500\)/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
    });

    // Cycle 9 a11y — icon-only controls must expose a discernible accessible name
    // (WCAG 2.0 AA 4.1.2 button-name). The search-clear "X" is the icon-only button
    // reachable from the default triage view; it renders only once the query is set.
    it('gives the icon-only search-clear button an accessible name (WCAG 4.1.2)', async () => {
        authFetch.mockImplementation(
            routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))
        );

        renderInbox();

        const search = await screen.findByPlaceholderText('Search emails…');
        // No query yet → no clear button.
        expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

        fireEvent.change(search, { target: { value: 'lease' } });

        // Once a query exists, the "X" clear button appears WITH an accessible name
        // (queryable by role+name only because aria-label is present — proves the fix).
        const clear = await screen.findByRole('button', { name: 'Clear search' });
        expect(clear).toBeInTheDocument();
        expect(clear.querySelector('svg')).toBeInTheDocument();
    });
});
