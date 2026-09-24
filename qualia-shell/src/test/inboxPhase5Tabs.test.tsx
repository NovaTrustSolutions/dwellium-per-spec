/**
 * Plan 066 Phase 5 (F5) — unit tests for the four InboxZero sub-components
 * remounted this phase: GlobalAuditTab (§5b), RulesManager (§5c),
 * DraftReplyPanel (§5f) and NewslettersTab's unsubscribe (§5d).
 *
 * Each component is rendered standalone (not through InboxZero) with an
 * injected `authFetch` mock, mirroring InboxZero.test.tsx's `jsonResponse`
 * pattern. A mutation is a failure when `!res.ok` OR the JSON has
 * `success:false` — every test below exercises that boundary.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';

import { GlobalAuditTab, parseSqliteUtc } from '../components/InboxZero/GlobalAuditTab';
import RulesManager from '../components/InboxZero/RulesManager';
import { DraftReplyPanel } from '../components/InboxZero/SmartActions';
import NewslettersTab from '../components/InboxZero/NewslettersTab';
import type { NewsletterSender } from '../components/InboxZero/InboxZeroTypes';

function jsonResponse(data: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => data, headers: new Headers() } as Response;
}

function collectToasts(): { onToast: ReturnType<typeof vi.fn>; cleanup: () => void } {
    const onToast = vi.fn();
    window.addEventListener('qualia-toast', onToast);
    return { onToast, cleanup: () => window.removeEventListener('qualia-toast', onToast) };
}

// ════════════════════════════════════════════════════════════
// GlobalAuditTab
// ════════════════════════════════════════════════════════════
describe('GlobalAuditTab', () => {
    it('fetches the first page at the exact contract URL and shows the subject', async () => {
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({
            success: true,
            data: [{ id: 'a1', inbox_item_id: 'mail-1', action: 'approved', actor: 'andy', reason: null, details: '{}', created_at: '2026-09-01T00:00:00Z', subject: 'Lease renewal' }],
            pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
        }));
        render(<GlobalAuditTab apiBase="/api/inbox" authFetch={authFetch} />);
        await waitFor(() => expect(screen.getByText('Lease renewal')).toBeInTheDocument());
        expect(authFetch).toHaveBeenCalledWith('/api/inbox/audit/global?limit=50&offset=0');
    });

    it('Load more sends the next offset and appends (does not replace) results', async () => {
        const page = (offset: number, hasMore: boolean) => jsonResponse({
            success: true,
            data: [{ id: `a${offset}`, inbox_item_id: `mail-${offset}`, action: 'read', actor: null, reason: null, details: '{}', created_at: '2026-09-01T00:00:00Z', subject: `Subject ${offset}` }],
            pagination: { total: 2, limit: 1, offset, hasMore },
        });
        const authFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('offset=0')) return Promise.resolve(page(0, true));
            if (url.includes('offset=1')) return Promise.resolve(page(1, false));
            return Promise.resolve(jsonResponse({}, false, 500));
        });
        render(<GlobalAuditTab apiBase="/api/inbox" authFetch={authFetch} />);
        await waitFor(() => expect(screen.getByText('Subject 0')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Load more/ }));

        await waitFor(() => expect(screen.getByText('Subject 1')).toBeInTheDocument());
        expect(screen.getByText('Subject 0')).toBeInTheDocument();
        expect(authFetch).toHaveBeenCalledWith('/api/inbox/audit/global?limit=50&offset=1');
    });

    it('shows Recover only for recoverable actions (archive|bulk_archive|delete|snooze)', async () => {
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({
            success: true,
            data: [
                { id: 'a1', inbox_item_id: 'mail-1', action: 'archive', actor: null, reason: null, details: '{}', created_at: '2026-09-01T00:00:00Z', subject: 'Archived one' },
                { id: 'a2', inbox_item_id: 'mail-2', action: 'approved', actor: null, reason: null, details: '{}', created_at: '2026-09-01T00:00:00Z', subject: 'Approved one' },
            ],
            pagination: { total: 2, limit: 50, offset: 0, hasMore: false },
        }));
        render(<GlobalAuditTab apiBase="/api/inbox" authFetch={authFetch} />);
        await waitFor(() => expect(screen.getByText('Archived one')).toBeInTheDocument());
        expect(screen.getAllByRole('button', { name: /Recover/ })).toHaveLength(1);
    });

    it('renders the server error via toast on a 500', async () => {
        const { onToast, cleanup } = collectToasts();
        try {
            const authFetch = vi.fn().mockResolvedValue(jsonResponse({ success: false, error: 'boom' }, false, 500));
            render(<GlobalAuditTab apiBase="/api/inbox" authFetch={authFetch} />);
            await waitFor(() => expect(onToast).toHaveBeenCalled());
            expect((onToast.mock.calls[0][0] as CustomEvent<string>).detail).toBe('boom');
        } finally {
            cleanup();
        }
    });

    it('Recover PUTs status:pending with the contract reason', async () => {
        const authFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (!init) {
                return Promise.resolve(jsonResponse({
                    success: true,
                    data: [{ id: 'a1', inbox_item_id: 'mail-1', action: 'archive', actor: null, reason: null, details: '{}', created_at: '2026-09-01T00:00:00Z', subject: 'Archived one' }],
                    pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
                }));
            }
            return Promise.resolve(jsonResponse({ success: true, data: {} }));
        });
        render(<GlobalAuditTab apiBase="/api/inbox" authFetch={authFetch} />);
        await waitFor(() => expect(screen.getByText('Archived one')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Recover/ }));
        await waitFor(() => {
            const call = authFetch.mock.calls.find(([, init]) => init?.method === 'PUT');
            expect(call).toBeTruthy();
            expect(call![0]).toBe('/api/inbox/mail-1/status');
            expect(JSON.parse(call![1].body as string)).toEqual({ status: 'pending', reason: 'Recovered from audit log' });
        });
    });
});

// ════════════════════════════════════════════════════════════
// RulesManager
// ════════════════════════════════════════════════════════════
describe('RulesManager', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const RULE = {
        id: 'rule-1', name: 'Vendor', field: 'subject' as const, pattern: 'invoice',
        targetProjectId: 'proj-1', urgency: 'high' as const, priority: 10, enabled: true,
    };

    it('canEdit=false renders a read-only list — no write buttons', async () => {
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [RULE] }));
        render(<RulesManager apiBase="/api/inbox" authFetch={authFetch} canEdit={false} />);
        await waitFor(() => expect(screen.getByText('Vendor')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /New Rule/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Edit rule' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete rule' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Disable rule|Enable rule/ })).not.toBeInTheDocument();
    });

    it('add sends POST /rules with the form payload', async () => {
        const authFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            if (!init) return Promise.resolve(jsonResponse({ success: true, data: [] }));
            return Promise.resolve(jsonResponse({ success: true, data: { ...RULE, id: 'rule-2' } }, true, 201));
        });
        render(<RulesManager apiBase="/api/inbox" authFetch={authFetch} canEdit={true} />);
        await waitFor(() => expect(authFetch).toHaveBeenCalledWith('/api/inbox/rules'));

        fireEvent.click(screen.getByRole('button', { name: /New Rule/ }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Vendor' } });
        fireEvent.change(screen.getByLabelText('Pattern (regex)'), { target: { value: 'invoice' } });
        fireEvent.change(screen.getByLabelText('Route To (project ID)'), { target: { value: 'proj-1' } });
        fireEvent.click(screen.getByRole('button', { name: /Create Rule/ }));

        await waitFor(() => {
            const call = authFetch.mock.calls.find(([, init]) => init?.method === 'POST');
            expect(call).toBeTruthy();
            expect(call![0]).toBe('/api/inbox/rules');
            expect(JSON.parse(call![1].body as string)).toMatchObject({ name: 'Vendor', pattern: 'invoice', targetProjectId: 'proj-1' });
        });
    });

    it('edit sends PUT /rules/:id', async () => {
        const authFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            if (!init) return Promise.resolve(jsonResponse({ success: true, data: [RULE] }));
            return Promise.resolve(jsonResponse({ success: true, data: RULE }));
        });
        render(<RulesManager apiBase="/api/inbox" authFetch={authFetch} canEdit={true} />);
        await waitFor(() => expect(screen.getByText('Vendor')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Edit rule' }));
        fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

        await waitFor(() => {
            const call = authFetch.mock.calls.find(([, init]) => init?.method === 'PUT' && init.body && JSON.parse(init.body as string).name);
            expect(call).toBeTruthy();
            expect(call![0]).toBe('/api/inbox/rules/rule-1');
            // An edit is partial — it must never re-enable a rule the operator turned off.
            expect(JSON.parse(call![1]!.body as string)).not.toHaveProperty('enabled');
        });
    });

    it('delete sends DELETE /rules/:id after confirm', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const authFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            if (!init) return Promise.resolve(jsonResponse({ success: true, data: [RULE] }));
            return Promise.resolve(jsonResponse({ success: true }));
        });
        render(<RulesManager apiBase="/api/inbox" authFetch={authFetch} canEdit={true} />);
        await waitFor(() => expect(screen.getByText('Vendor')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Delete rule' }));

        await waitFor(() => {
            const call = authFetch.mock.calls.find(([, init]) => init?.method === 'DELETE');
            expect(call).toBeTruthy();
            expect(call![0]).toBe('/api/inbox/rules/rule-1');
        });
    });

    it('toggle sends PUT /rules/:id {enabled}', async () => {
        const authFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            if (!init) return Promise.resolve(jsonResponse({ success: true, data: [RULE] }));
            return Promise.resolve(jsonResponse({ success: true, data: { ...RULE, enabled: false } }));
        });
        render(<RulesManager apiBase="/api/inbox" authFetch={authFetch} canEdit={true} />);
        await waitFor(() => expect(screen.getByText('Vendor')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Disable rule' }));

        await waitFor(() => {
            const call = authFetch.mock.calls.find(([, init]) => init?.method === 'PUT');
            expect(call).toBeTruthy();
            expect(call![0]).toBe('/api/inbox/rules/rule-1');
            expect(JSON.parse(call![1].body as string)).toEqual({ enabled: false });
        });
    });

    it('shows the server 400 error inline on save failure', async () => {
        const authFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            if (!init) return Promise.resolve(jsonResponse({ success: true, data: [] }));
            return Promise.resolve(jsonResponse({ success: false, error: 'pattern is not a valid regex' }, false, 400));
        });
        render(<RulesManager apiBase="/api/inbox" authFetch={authFetch} canEdit={true} />);
        await waitFor(() => expect(authFetch).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: /New Rule/ }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bad' } });
        fireEvent.change(screen.getByLabelText('Pattern (regex)'), { target: { value: '(' } });
        fireEvent.change(screen.getByLabelText('Route To (project ID)'), { target: { value: 'proj-1' } });
        fireEvent.click(screen.getByRole('button', { name: /Create Rule/ }));

        expect(await screen.findByText('pattern is not a valid regex')).toBeInTheDocument();
    });
});

// ════════════════════════════════════════════════════════════
// DraftReplyPanel (SmartActions.tsx)
// ════════════════════════════════════════════════════════════
describe('parseSqliteUtc', () => {
    it("reads SQLite datetime('now') as UTC, not local time", () => {
        expect(parseSqliteUtc('2026-09-24 21:30:00').toISOString()).toBe('2026-09-24T21:30:00.000Z');
        expect(parseSqliteUtc('2026-09-24T21:30:00.000Z').toISOString()).toBe('2026-09-24T21:30:00.000Z');
    });
});

describe('DraftReplyPanel', () => {
    beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
    });

    it('POSTs the contract URL and renders the draft as TEXT (no HTML element from the body)', async () => {
        const maliciousBody = '<img src=x onerror="window.__pwned=true">';
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({
            success: true,
            data: { subject: 'Re: lease', body: maliciousBody, confidence: 0.82 },
        }));
        render(<DraftReplyPanel itemId="mail-1" apiBase="/api/inbox" authFetch={authFetch} />);

        fireEvent.click(screen.getByRole('button', { name: /Generate Draft/ }));

        await waitFor(() => expect(screen.getByText(maliciousBody)).toBeInTheDocument());
        expect(authFetch).toHaveBeenCalledWith('/api/inbox/mail-1/draft', expect.objectContaining({ method: 'POST' }));
        // Rendered as a text node, not parsed — no <img> element exists anywhere in the tree.
        expect(document.querySelector('img')).toBeNull();
        expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    });

    it('shows the 503 error inline', async () => {
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ success: false, error: 'AI drafting needs an OpenAI key on the server' }, false, 503));
        render(<DraftReplyPanel itemId="mail-1" apiBase="/api/inbox" authFetch={authFetch} />);

        fireEvent.click(screen.getByRole('button', { name: /Generate Draft/ }));

        expect(await screen.findByText('AI drafting needs an OpenAI key on the server')).toBeInTheDocument();
    });

    it('handoff copies the draft body to the clipboard, then opens the widget via the bus', async () => {
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({
            success: true,
            data: { subject: 'Re: lease', body: 'Thanks for reaching out.', confidence: 0.9 },
        }));
        render(<DraftReplyPanel itemId="mail-1" apiBase="/api/inbox" authFetch={authFetch} />);
        fireEvent.click(screen.getByRole('button', { name: /Generate Draft/ }));
        await screen.findByText('Thanks for reaching out.');

        const openWidget = vi.fn();
        window.addEventListener('dwellium:open-widget', openWidget);
        try {
            fireEvent.click(screen.getByRole('button', { name: 'Edit in Scribe' }));

            await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Thanks for reaching out.'));
            expect(openWidget).toHaveBeenCalledTimes(1);
            const detail = (openWidget.mock.calls[0][0] as CustomEvent).detail;
            expect(detail).toEqual({ widgetId: 'scribe', label: 'Edit in Scribe', icon: 'pen-tool' });
        } finally {
            window.removeEventListener('dwellium:open-widget', openWidget);
        }
    });

    it('a clipboard failure never claims the draft was copied', async () => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        });
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({
            success: true,
            data: { subject: 'Re: lease', body: 'Thanks for reaching out.', confidence: 0.9 },
        }));
        render(<DraftReplyPanel itemId="mail-1" apiBase="/api/inbox" authFetch={authFetch} />);
        fireEvent.click(screen.getByRole('button', { name: /Generate Draft/ }));
        await screen.findByText('Thanks for reaching out.');
        const { onToast, cleanup } = collectToasts();
        try {
            fireEvent.click(screen.getByRole('button', { name: 'Edit in Scribe' }));
            await waitFor(() => expect(onToast).toHaveBeenCalled());
            const msg = String((onToast.mock.calls[0][0] as CustomEvent).detail);
            expect(msg).not.toMatch(/Draft copied/);
            expect(msg).toMatch(/Couldn't copy/);
        } finally {
            cleanup();
        }
    });
});

// ════════════════════════════════════════════════════════════
// NewslettersTab — unsubscribe
// ════════════════════════════════════════════════════════════
describe('NewslettersTab unsubscribe', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function nl(over: Partial<NewsletterSender> = {}): NewsletterSender {
        return {
            sender: 'news@example.com', count: 5, readCount: 3, archivedCount: 1,
            readRate: 0.6, lastSeen: '2026-09-01T00:00:00Z', unsubscribed: false, ...over,
        };
    }

    it('one-click PATCHes the contract URL, toasts Unsubscribed, refreshes', async () => {
        const { onToast, cleanup } = collectToasts();
        const onRefresh = vi.fn();
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { method: 'one-click' } }));
        try {
            render(<NewslettersTab newsletters={[nl()]} authFetch={authFetch} inboxApiBase="/api/inbox" onRefresh={onRefresh} />);
            fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

            await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
            expect(authFetch).toHaveBeenCalledWith('/api/inbox/newsletters/news%40example.com/unsubscribe', { method: 'PATCH' });
            expect(onToast.mock.calls.some(([e]) => (e as CustomEvent).detail === 'Unsubscribed')).toBe(true);
        } finally {
            cleanup();
        }
    });

    it('url target opens in a new tab (noopener,noreferrer)', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { method: 'url', target: 'https://example.com/unsub' } }));
        render(<NewslettersTab newsletters={[nl()]} authFetch={authFetch} inboxApiBase="/api/inbox" onRefresh={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

        await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://example.com/unsub', '_blank', 'noopener,noreferrer'));
    });

    it('mailto target opens directly', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { method: 'mailto', target: 'mailto:unsub@example.com' } }));
        render(<NewslettersTab newsletters={[nl()]} authFetch={authFetch} inboxApiBase="/api/inbox" onRefresh={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

        await waitFor(() => expect(openSpy).toHaveBeenCalledWith('mailto:unsub@example.com', '_blank', 'noopener,noreferrer'));
    });

    it('none shows "No unsubscribe link" and opens nothing', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const { onToast, cleanup } = collectToasts();
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { method: 'none' } }));
        try {
            render(<NewslettersTab newsletters={[nl()]} authFetch={authFetch} inboxApiBase="/api/inbox" onRefresh={vi.fn()} />);
            fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

            await waitFor(() => expect(onToast.mock.calls.some(([e]) => (e as CustomEvent).detail === 'No unsubscribe link')).toBe(true));
            expect(openSpy).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    // Security-relevant: a `javascript:` (or any non-https/mailto) target must never
    // reach window.open — the target comes from an attacker-controlled email header.
    it('refuses a javascript: target — no window.open is called', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const { onToast, cleanup } = collectToasts();
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { method: 'url', target: 'javascript:alert(1)' } }));
        try {
            render(<NewslettersTab newsletters={[nl()]} authFetch={authFetch} inboxApiBase="/api/inbox" onRefresh={vi.fn()} />);
            fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

            await waitFor(() => expect(onToast.mock.calls.some(([e]) => (e as CustomEvent).detail === 'No unsubscribe link')).toBe(true));
            expect(openSpy).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    it('failure (non-2xx) shows the server error via toast', async () => {
        const { onToast, cleanup } = collectToasts();
        const authFetch = vi.fn().mockResolvedValue(jsonResponse({ success: false, error: 'sender not found' }, false, 404));
        try {
            render(<NewslettersTab newsletters={[nl()]} authFetch={authFetch} inboxApiBase="/api/inbox" onRefresh={vi.fn()} />);
            fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

            await waitFor(() => expect(onToast.mock.calls.some(([e]) => (e as CustomEvent).detail === 'sender not found')).toBe(true));
        } finally {
            cleanup();
        }
    });

    it('shows the Unsubscribed badge (no button) once unsubscribed', () => {
        render(<NewslettersTab newsletters={[nl({ unsubscribed: true })]} authFetch={vi.fn()} inboxApiBase="/api/inbox" onRefresh={vi.fn()} />);
        expect(screen.getByText('Unsubscribed')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument();
    });
});
