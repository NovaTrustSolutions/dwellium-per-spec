import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import type { ReactNode } from 'react';

// InboxZero pulls in ThemeContext + UserContext + React Query. We mock the two
// contexts (preserving ThemeContext's value-exports) and provide a real, retry-
// disabled QueryClient so query error/empty/success states are deterministic.

const authFetch = vi.fn();
// mock-prefixed so Vitest's hoisting allows referencing it inside vi.mock below.
let mockRole: string = 'god';

vi.mock('../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../context/UserContext')>();
    return {
        ...actual,
        useUser: () => ({
            role: mockRole,
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
import { patchWidgetMemory, readWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';

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
        // Newsletters must come back as an array — the tab maps over it directly.
        if (url.includes('/api/inbox/newsletters')) return Promise.resolve(jsonResponse({ success: true, data: [] }));
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
        resetWidgetMemory(); // plan 055 phase 2 — v2.72.1 standing convention
        mockRole = 'god';
    });

    // Plan 055 phase 2 — widget memory round-trip.
    it('reopens on the remembered tab/filter and remembers tab clicks', async () => {
        authFetch.mockImplementation(
            routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))
        );
        patchWidgetMemory('inbox-zero', { activeTab: 'stats', expandedId: 'gone-mail-99' });

        renderInbox();

        const statsTab = await screen.findByRole('tab', { name: /Stats/ });
        expect(statsTab).toHaveAttribute('aria-selected', 'true');

        fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
        expect(readWidgetMemory('inbox-zero', { activeTab: 'triage' }).activeTab).toBe('settings');
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
        // Plan 060 §8 — no backend /stream route exists; polling is the only mechanism.
        expect(authFetch.mock.calls.some(([url]) => String(url).endsWith('/stream'))).toBe(false);
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

    // Plan 066 §5c/§5b — Rules and Audit came back; 6 tabs total now.
    it('renders exactly the six surviving tabs: Triage, Newsletters, Rules, Audit, Stats, Settings', async () => {
        authFetch.mockImplementation(
            routeFetch(() => jsonResponse({ success: true, data: [], pagination: { hasMore: false } }))
        );

        renderInbox();

        const tabs = await screen.findAllByRole('tab');
        expect(tabs.map(t => t.textContent?.trim())).toEqual(['Triage', 'Newsletters', 'Rules', 'Audit', 'Stats', 'Settings']);
    });

    // Plan 066 §6c — Settings tab extracted into SettingsTab.tsx with no
    // behavior change; it still renders its major sections when opened.
    it('renders the Settings tab sections after the §6c SettingsTab.tsx extraction', async () => {
        authFetch.mockImplementation((url: string) => {
            // routeFetch's catch-all `{success:true, data:{}}` is fine for most
            // "everything else" endpoints, but the Legal Shield and LLM Safety
            // Audit panels expect a full shape when success is true — say no
            // data for those here rather than let them render on `{}`.
            if (typeof url === 'string' && url.includes('/legal-shield-health')) {
                return Promise.resolve(jsonResponse({ success: false }));
            }
            if (typeof url === 'string' && (url.includes('/api/security/status') || url.includes('/llm-safety-events/stats'))) {
                return Promise.resolve(jsonResponse({ success: false }));
            }
            if (typeof url === 'string' && url.includes('/llm-safety-events')) {
                return Promise.resolve(jsonResponse({ success: true, data: [] }));
            }
            return routeFetch(() => jsonResponse({ success: true, data: [], pagination: { hasMore: false } }))(url);
        });

        renderInbox();

        fireEvent.click(await screen.findByRole('tab', { name: /Settings/ }));

        expect(await screen.findByRole('heading', { name: /Legal Shield/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Themes/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Typography/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Animations & Interactions/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Permissions/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /AI & Routing/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Gmail Integration/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Trello Integration/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Google Drive & Sharing/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Security & Guard/ })).toBeInTheDocument();
    });

    // Plan 066 §6c review: unsaved Settings edits survived a tab switch while that state lived in
    // InboxZero; the extracted SettingsTab must not drop them on unmount.
    it('keeps unsaved Settings edits across a tab switch', async () => {
        authFetch.mockImplementation((url: string) => {
            if (typeof url === 'string' && (url.includes('/legal-shield-health') || url.includes('/api/security/status') || url.includes('/llm-safety-events/stats'))) {
                return Promise.resolve(jsonResponse({ success: false }));
            }
            if (typeof url === 'string' && url.includes('/llm-safety-events')) return Promise.resolve(jsonResponse({ success: true, data: [] }));
            return routeFetch(() => jsonResponse({ success: true, data: [], pagination: { hasMore: false } }))(url);
        });
        renderInbox();
        fireEvent.click(await screen.findByRole('tab', { name: /Settings/ }));
        fireEvent.click(await screen.findByRole('switch', { name: /Gmail Fetcher/ }));
        expect(await screen.findByText('● Unsaved changes')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /Triage/ }));
        fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
        expect(await screen.findByText('● Unsaved changes')).toBeInTheDocument();
    });

    // Plan 066 §2a — a persisted tab that no longer exists (e.g. the deleted
    // NIF Intel tab) falls back to Triage instead of rendering nothing.
    it('falls back to the Triage tab when the persisted activeTab was removed', async () => {
        authFetch.mockImplementation(
            routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))
        );
        patchWidgetMemory('inbox-zero', { activeTab: 'nif' });

        renderInbox();

        const triageTab = await screen.findByRole('tab', { name: /Triage/ });
        expect(triageTab).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByText('Lease renewal for Unit 4B')).toBeInTheDocument();
    });

    // Plan 066 §5c/§5b — clicking Rules/Audit mounts the real sub-components,
    // which call their own backend routes (not a route the tab list fakes).
    it('mounts Rules and Audit on click and each calls its own backend route', async () => {
        const calledUrls: string[] = [];
        authFetch.mockImplementation((url: string) => {
            if (typeof url === 'string') calledUrls.push(url);
            if (typeof url === 'string' && /\/inbox\/rules(\?|$)/.test(url)) {
                return Promise.resolve(jsonResponse({ success: true, data: [] }));
            }
            if (typeof url === 'string' && /\/inbox\/audit\/global/.test(url)) {
                return Promise.resolve(jsonResponse({ success: true, data: [], pagination: { hasMore: false, total: 0 } }));
            }
            return routeFetch(() => jsonResponse({ success: true, data: [], pagination: { hasMore: false } }))(url);
        });

        renderInbox();
        await screen.findAllByRole('tab');

        fireEvent.click(screen.getByRole('tab', { name: /Rules/ }));
        await waitFor(() => expect(calledUrls.some(u => /\/inbox\/rules(\?|$)/.test(u))).toBe(true));

        fireEvent.click(screen.getByRole('tab', { name: /Audit/ }));
        await waitFor(() => expect(calledUrls.some(u => /\/inbox\/audit\/global/.test(u))).toBe(true));
    });

    // Plan 066 §5c — rules are global config; only `canEdit` (god) sees write
    // controls. A non-god inbox user gets a read-only list.
    it('hides Rules write controls for a non-god role', async () => {
        mockRole = 'management';
        authFetch.mockImplementation((url: string) => {
            if (typeof url === 'string' && /\/inbox\/rules(\?|$)/.test(url)) {
                return Promise.resolve(jsonResponse({ success: true, data: [] }));
            }
            return routeFetch(() => jsonResponse({ success: true, data: [], pagination: { hasMore: false } }))(url);
        });

        renderInbox();
        fireEvent.click(await screen.findByRole('tab', { name: /Rules/ }));

        await screen.findByText('No routing rules yet.');
        expect(screen.queryByRole('button', { name: /New Rule/ })).not.toBeInTheDocument();
    });

    // Plan 066 §2d — every mutation checks res.ok before touching cache/state
    // and surfaces failure via the qualia-toast event; the item is never removed
    // and no success is shown on a non-2xx.
    it('marks an unread message read once on expand — collapsing does not fire it again', async () => {
        authFetch.mockImplementation(routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } })));
        renderInbox();
        await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
        const card = screen.getByText('Lease renewal for Unit 4B').closest('.iz-card__content')!;
        fireEvent.click(card); // expand
        fireEvent.click(card); // collapse
        const reads = authFetch.mock.calls.filter(([u]) => typeof u === 'string' && /\/read$/.test(u));
        expect(reads).toHaveLength(1);
    });

    // Plan 066 §6b — the triage card's expand toggle is a real <button> now
    // (not a div with an onClick), so Enter/Space on the focused button must
    // expand/collapse it exactly like a click does.
    it('keyboard: Enter/Space on the focused expand button expands and collapses the triage card', async () => {
        const user = userEvent.setup();
        authFetch.mockImplementation(routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } })));
        renderInbox();
        await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
        const expandButton = screen.getByText('Lease renewal for Unit 4B').closest('.iz-card__content') as HTMLElement;
        expect(expandButton).toHaveAttribute('aria-expanded', 'false');

        expandButton.focus();
        await user.keyboard('{Enter}');
        expect(expandButton).toHaveAttribute('aria-expanded', 'true');

        await user.keyboard(' ');
        expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    });

    // Plan 066 §6b — a document-level Escape handler closes the full email
    // viewer while it is open (wired imperatively, not via JSX onClick).
    it('Escape closes the full email viewer', async () => {
        authFetch.mockImplementation((url: string) => {
            if (typeof url === 'string' && /\/mail-1\/body$/.test(url)) {
                return Promise.resolve(jsonResponse({ success: true, data: { body: 'Full body text' } }));
            }
            return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
        });
        renderInbox();
        await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Lease renewal for Unit 4B').closest('.iz-card__content')!); // expand
        fireEvent.click(await screen.findByRole('button', { name: /View Full Email/i }));

        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('shows an error toast and keeps the item when archive fails', async () => {
        const onToast = vi.fn();
        window.addEventListener('qualia-toast', onToast);
        try {
            authFetch.mockImplementation((url: string) => {
                if (typeof url === 'string' && /\/archive$/.test(url)) {
                    return Promise.resolve(jsonResponse({ success: false, error: 'boom' }, false, 500));
                }
                return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
            });

            renderInbox();

            await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('button', { name: /Archive/ }));

            await waitFor(() => expect(onToast).toHaveBeenCalledTimes(1));
            const detail = (onToast.mock.calls[0][0] as CustomEvent<string>).detail;
            expect(detail).toMatch(/failed/i);

            // The item must stay in the list — no success, no removal, on a non-2xx.
            expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument();
        } finally {
            window.removeEventListener('qualia-toast', onToast);
        }
    });

    // Plan 066 §2c — bulk Add Label and bulk AI Classify never came back (no
    // backend route in this plan); Snooze (§5e) and Undo (§5a, but only after
    // a successful archive/delete) are real again.
    it('has no add-label, AI-classify or unsubscribe controls, and no undo bar before any action', async () => {
        authFetch.mockImplementation(
            routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))
        );

        renderInbox();
        await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
        // No undo bar exists just from rendering — only a successful archive/delete shows one.
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^undo$/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /Newsletters/ }));
        await screen.findByText('No newsletters detected');

        for (const pattern of [/add label/i, /ai classify/i, /unsubscribe/i]) {
            expect(screen.queryByRole('button', { name: pattern })).not.toBeInTheDocument();
        }
    });

    // Plan 066 §5a — a successful single archive shows a session-only undo bar
    // naming the subject; Undo restores it via PUT /:id/status.
    it('shows an undo bar with the subject after a successful archive, and Undo restores it', async () => {
        const statusPuts: Array<Record<string, unknown>> = [];
        authFetch.mockImplementation((url: string, init?: RequestInit) => {
            if (typeof url === 'string' && /\/archive$/.test(url)) {
                return Promise.resolve(jsonResponse({ success: true }));
            }
            if (typeof url === 'string' && /\/mail-1\/status$/.test(url)) {
                statusPuts.push(init?.body ? JSON.parse(init.body as string) : {});
                return Promise.resolve(jsonResponse({ success: true, data: { ...ITEM, status: 'pending' } }));
            }
            return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
        });

        renderInbox();
        await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Archive/ }));

        const bar = await screen.findByRole('status');
        expect(bar.textContent).toMatch(/Archived/);
        expect(bar.textContent).toMatch(/Lease renewal for Unit 4B/);

        fireEvent.click(within(bar).getByRole('button', { name: /Undo/i }));

        await waitFor(() => expect(statusPuts).toHaveLength(1));
        expect(statusPuts[0]).toEqual({ status: 'pending', reason: 'Undo' });
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    });

    // Plan 066 §5a — Undo is Gmail-first: a 502 from the status route must show
    // the mutationFailed error toast, and the bar stays put rather than
    // silently vanishing (no half-restored state, no false "gone").
    it('shows an error toast when Undo fails and does not silently dismiss the bar', async () => {
        const onToast = vi.fn();
        window.addEventListener('qualia-toast', onToast);
        try {
            authFetch.mockImplementation((url: string) => {
                if (typeof url === 'string' && /\/archive$/.test(url)) return Promise.resolve(jsonResponse({ success: true }));
                if (typeof url === 'string' && /\/mail-1\/status$/.test(url)) return Promise.resolve(jsonResponse({ error: 'Gmail label failed' }, false, 502));
                return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
            });

            renderInbox();
            await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('button', { name: /Archive/ }));

            const bar = await screen.findByRole('status');
            fireEvent.click(within(bar).getByRole('button', { name: /Undo/i }));

            await waitFor(() => expect(onToast).toHaveBeenCalledTimes(1));
            expect((onToast.mock.calls[0][0] as CustomEvent<string>).detail).toMatch(/Undo failed/i);
            expect(screen.getByRole('status')).toBeInTheDocument();
        } finally {
            window.removeEventListener('qualia-toast', onToast);
        }
    });

    // Plan 066 §5a — a failed archive must never show a false "recovered"-style
    // undo bar (this was the exact bug §2c removed the old Undo for).
    it('shows no undo bar when the archive itself fails', async () => {
        const onToast = vi.fn();
        window.addEventListener('qualia-toast', onToast);
        try {
            authFetch.mockImplementation((url: string) => {
                if (typeof url === 'string' && /\/archive$/.test(url)) return Promise.resolve(jsonResponse({ success: false, error: 'boom' }, false, 500));
                return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
            });

            renderInbox();
            await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('button', { name: /Archive/ }));

            await waitFor(() => expect(onToast).toHaveBeenCalledTimes(1));
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
        } finally {
            window.removeEventListener('qualia-toast', onToast);
        }
    });

    // Plan 066 §5e — the snooze menu posts an ISO `until` roughly an hour out.
    it('snoozes an item for 1 hour via the snooze menu', async () => {
        let snoozeBody: { until?: string } | null = null;
        authFetch.mockImplementation((url: string, init?: RequestInit) => {
            if (typeof url === 'string' && /\/mail-1\/snooze$/.test(url)) {
                snoozeBody = init?.body ? JSON.parse(init.body as string) : null;
                return Promise.resolve(jsonResponse({ success: true, data: { ...ITEM, status: 'snoozed' } }));
            }
            return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
        });

        renderInbox();
        await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Snooze/i }));
        fireEvent.click(await screen.findByRole('button', { name: /^1 hour$/i }));

        await waitFor(() => expect(snoozeBody).not.toBeNull());
        const untilMs = new Date(snoozeBody!.until as string).getTime();
        expect(untilMs).toBeGreaterThan(Date.now() + 55 * 60_000);
        expect(untilMs).toBeLessThan(Date.now() + 65 * 60_000);
    });

    it('shows an error toast when snooze fails', async () => {
        const onToast = vi.fn();
        window.addEventListener('qualia-toast', onToast);
        try {
            authFetch.mockImplementation((url: string) => {
                if (typeof url === 'string' && /\/mail-1\/snooze$/.test(url)) return Promise.resolve(jsonResponse({ success: false, error: 'bad until' }, false, 400));
                return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
            });

            renderInbox();
            await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('button', { name: /Snooze/i }));
            fireEvent.click(await screen.findByRole('button', { name: /^1 hour$/i }));

            await waitFor(() => expect(onToast).toHaveBeenCalledTimes(1));
            expect((onToast.mock.calls[0][0] as CustomEvent<string>).detail).toMatch(/failed/i);
        } finally {
            window.removeEventListener('qualia-toast', onToast);
        }
    });

    // Plan 066 §5f — Draft reply mounts DraftReplyPanel, which posts to /:id/draft.
    it('mounts the draft reply panel and posts a draft request', async () => {
        let draftCalled = false;
        authFetch.mockImplementation((url: string) => {
            if (typeof url === 'string' && /\/mail-1\/draft$/.test(url)) {
                draftCalled = true;
                return Promise.resolve(jsonResponse({ success: true, data: { subject: 'Re: Lease renewal', body: 'Sounds good.', confidence: 0.8 } }));
            }
            return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
        });

        renderInbox();
        await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Lease renewal for Unit 4B').closest('.iz-card__content')!); // expand

        fireEvent.click(await screen.findByRole('button', { name: /Draft reply/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Generate Draft/i }));

        await waitFor(() => expect(draftCalled).toBe(true));
        expect(await screen.findByText('Re: Lease renewal')).toBeInTheDocument();
    });

    // Plan 066 §4h — the list endpoint no longer carries `body` (ITEM above has
    // none); the expanded card fetches it on demand, once, and renders it into
    // the inline iframe. Collapsing and re-expanding must not refetch.
    it('fetches the body once on expand and renders it in the card iframe; re-expanding after collapse does not refetch', async () => {
        let bodyCalls = 0;
        authFetch.mockImplementation((url: string) => {
            if (typeof url === 'string' && /\/mail-1\/body$/.test(url)) {
                bodyCalls++;
                return Promise.resolve(jsonResponse({
                    success: true,
                    data: { body: 'The full lease terms are attached for your review.', subject: ITEM.subject, sender: ITEM.sender },
                }));
            }
            return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
        });

        renderInbox();
        await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
        const card = screen.getByText('Lease renewal for Unit 4B').closest('.iz-card__content')!;

        fireEvent.click(card); // expand
        await waitFor(() => expect(bodyCalls).toBe(1));
        const frame = await screen.findByTitle('email-body-inline');
        await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('The full lease terms are attached for your review.'));

        fireEvent.click(card); // collapse
        fireEvent.click(card); // re-expand
        await screen.findByTitle('email-body-inline');
        expect(bodyCalls).toBe(1); // cached — no second network call
    });

    it('renders the snippet in the card iframe when the body fetch fails', async () => {
        authFetch.mockImplementation((url: string) => {
            if (typeof url === 'string' && /\/mail-1\/body$/.test(url)) {
                return Promise.resolve(jsonResponse({ success: false, error: 'boom' }, false, 500));
            }
            return routeFetch(() => jsonResponse({ success: true, data: [ITEM], pagination: { hasMore: false } }))(url);
        });

        renderInbox();
        await waitFor(() => expect(screen.getByText('Lease renewal for Unit 4B')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Lease renewal for Unit 4B').closest('.iz-card__content')!);

        const frame = await screen.findByTitle('email-body-inline');
        await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('would like to renew my lease'));
    });
});
