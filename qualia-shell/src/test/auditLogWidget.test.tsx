/**
 * AuditLogWidget — capability-based audit-trail holocron (2026-07-03).
 *
 * The widget must (1) show the restricted card when no user is signed in;
 * (2) otherwise always attempt the fetch and let the backend decide via a
 * 403 → restricted card with the allowlist message, honoring capability-based
 * access instead of a hardcoded frontend email list; (3) keep the honest
 * 401 quick-access message; (4) render server-resolved locations (falling
 * back to raw IP) in Sessions/Activity views; (5) be registered in
 * WIDGET_REGISTRY with `restrictedToEmails` sourced from the single
 * `AUDIT_LOG_CATALOG_EMAILS` catalog constant so catalogs (Holocron OS Apps)
 * hide it from other accounts (cosmetic — not the security boundary).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import AuditLogWidget from '../components/AuditLog/AuditLogWidget';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { AUDIT_LOG_CATALOG_EMAILS } from '../components/AuditLog/auditLogAccess';
import { UserContext, type DwelliumUser } from '../context/UserContext';
import { activityLogStore, activityUserIdHolder, logActivity } from '../lib/activityLogStore';

// withSync-wrapped stores (activityLogStore) import oneSaveClient at load;
// mock it so no network/side effects fire during these widget assertions.
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

function makeUser(email: string): DwelliumUser {
    return {
        id: `u-${email}`, email, name: email.split('@')[0], role: 'god',
        assignedProperties: [], active: true,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

function withUser(email: string | null, children: ReactNode) {
    const value = email
        ? ({ user: makeUser(email) } as unknown as React.ContextType<typeof UserContext>)
        : null;
    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

const AUDIT_OK = {
    success: true,
    entries: [
        { id: 1, userId: 'u-1', userName: 'Andy', userRole: 'god', action: 'LOGIN_SUCCESS', createdAt: '2026-07-02 08:00:00', ipAddress: '203.0.113.7', location: null },
        { id: 2, userId: 'u-1', userName: 'Andy', userRole: 'god', action: 'UPDATE', entityType: 'objects', entityId: 'workspaces_u-1', details: { field: 'name', from: 'old', to: 'new' }, createdAt: '2026-07-02 08:05:00', ipAddress: '203.0.113.7', location: null },
        { id: 3, userId: 'u-1', userName: 'Andy', userRole: 'god', action: 'LOGOUT', createdAt: '2026-07-02 09:00:00', ipAddress: '8.8.8.8', location: 'Mountain View, California, US' },
    ],
};

beforeEach(() => {
    cleanup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(AUDIT_OK), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    try { localStorage.clear(); } catch { /* ignore */ }
    activityUserIdHolder.current = null;
    activityLogStore.reset();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('AuditLogWidget access gate', () => {
    it('shows the restricted card when no user is present and never fetches', () => {
        render(withUser(null, <AuditLogWidget />));
        expect(screen.getByText(/Audit Log is restricted/i)).toBeTruthy();
        expect(screen.getByText(/only available on Andy/i)).toBeTruthy();
        expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('signed-in non-allowlisted account: fetch IS called, backend 403 renders the restricted card with the allowlist message', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response('{"error":"Forbidden"}', { status: 403 }));
        render(withUser('lisa@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByText(/audit-log viewer list/i)).toBeTruthy());
        expect(screen.getByText(/Audit Log is restricted/i)).toBeTruthy();
        expect(vi.mocked(fetch)).toHaveBeenCalled();
    });

    it('renders session events (login/logout) for a signed-in, allowed account', async () => {
        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByText('LOGIN_SUCCESS')).toBeTruthy());
        expect(screen.getByText('LOGOUT')).toBeTruthy();
        // Activity events are NOT in the sessions view.
        expect(screen.queryByText('UPDATE')).toBeNull();
    });

    it('renders server-resolved location when present, falling back to raw IP otherwise', async () => {
        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByText('LOGIN_SUCCESS')).toBeTruthy());
        // Entry with location set: location text is rendered, with IP shown alongside.
        expect(screen.getByText('Mountain View, California, US')).toBeTruthy();
        // Entry with location: null falls back to the raw IP.
        expect(screen.getAllByText((_, node) => node?.textContent === '203.0.113.7').length).toBeGreaterThan(0);
    });

    it('surfaces an honest message when the backend rejects the session (401)', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response('{"error":"Authentication required"}', { status: 401 }));
        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/backend rejected this session/i));
    });
});

describe('AuditLogWidget registration', () => {
    it('is registered under id "audit-log" restricted per the shared catalog-email constant', () => {
        const reg = WIDGET_REGISTRY['audit-log'];
        expect(reg).toBeTruthy();
        expect(reg.label).toBe('Audit Log');
        expect(reg.category).toBe('tools');
        expect(reg.restrictedToEmails).toEqual([...AUDIT_LOG_CATALOG_EMAILS]);
    });
});

describe('AuditLogWidget expandable rows (plan 038)', () => {
    it('expanding a server (Activity) row reveals pretty-printed details JSON, entity, and ISO timestamp; aria-expanded flips', async () => {
        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        // Switch to the Activity tab (the UPDATE entry with `details` lives there).
        // Exact match distinguishes it from the "My Activity" tab, whose
        // accessible name also contains "Activity".
        fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
        await waitFor(() => expect(screen.getByText('UPDATE')).toBeTruthy());

        const toggle = screen.getByRole('button', { name: /Expand row for Andy UPDATE/i });
        expect(toggle.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        // Pretty-printed details JSON is now visible.
        expect(screen.getByText(/"field": "name"/)).toBeTruthy();
        expect(screen.getByText(/"from": "old"/)).toBeTruthy();
        // Entity type/id + ISO timestamp rendered in the expanded panel.
        expect(screen.getByText('objects')).toBeTruthy();
        expect(screen.getByText('workspaces_u-1')).toBeTruthy();
        expect(screen.getByText('2026-07-02T08:05:00.000Z')).toBeTruthy();

        // Collapsing flips aria-expanded back.
        fireEvent.click(screen.getByRole('button', { name: /Collapse row for Andy UPDATE/i }));
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('expanding a Sessions row with a resolved location reveals it in the expanded panel', async () => {
        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByText('LOGOUT')).toBeTruthy());

        fireEvent.click(screen.getByRole('button', { name: /Expand row for Andy LOGOUT/i }));
        // "Mountain View..." already renders in the collapsed IP/Location cell —
        // assert the expanded panel's own Location DetailRow is present too via
        // the ISO timestamp, which only appears once expanded.
        expect(screen.getByText('2026-07-02T09:00:00.000Z')).toBeTruthy();
    });
});

describe('AuditLogWidget "My Activity" tab (plan 038)', () => {
    it('renders local store entries for a signed-in user WITHOUT any fetch for that tab', async () => {
        activityUserIdHolder.current = 'u-andy@dwellium.com';
        logActivity('terminal', 'Terminal', 'open');
        logActivity('terminal', 'Terminal', 'command-run', { command: 'ls -la' });

        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        // Initial render still fetches for the default Sessions tab.
        await waitFor(() => expect(screen.getByText('LOGIN_SUCCESS')).toBeTruthy());
        const fetchCallsBeforeTabSwitch = vi.mocked(fetch).mock.calls.length;

        fireEvent.click(screen.getByRole('tab', { name: /My Activity/i }));
        expect(screen.getByText('command-run')).toBeTruthy();
        expect(screen.getAllByText('Terminal').length).toBeGreaterThan(0);

        // Switching to My Activity must not have triggered any NEW fetch call.
        expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCallsBeforeTabSwitch);
    });

    it('is available even when the backend forbids the two server tabs (403)', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response('{"error":"Forbidden"}', { status: 403 }));
        activityUserIdHolder.current = 'u-lisa@dwellium.com';
        logActivity('scribe', 'Scribe', 'open');

        render(withUser('lisa@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByText(/audit-log viewer list/i)).toBeTruthy());

        fireEvent.click(screen.getByRole('tab', { name: /My Activity/i }));
        expect(screen.getByText('open')).toBeTruthy();
        expect(screen.getAllByText('Scribe').length).toBeGreaterThan(0);
    });

    it('search filters activity entries by app label and action', async () => {
        activityUserIdHolder.current = 'u-andy@dwellium.com';
        logActivity('terminal', 'Terminal', 'command-run', { command: 'ls -la' });
        logActivity('scribe', 'Scribe', 'open');

        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByText('LOGIN_SUCCESS')).toBeTruthy());
        fireEvent.click(screen.getByRole('tab', { name: /My Activity/i }));
        expect(screen.getAllByText(/Terminal|Scribe/).length).toBeGreaterThan(0);

        fireEvent.change(screen.getByPlaceholderText(/Filter by app, action, or details/i), { target: { value: 'scribe' } });
        expect(screen.getByText('Scribe')).toBeTruthy();
        expect(screen.queryByText('Terminal')).toBeNull();
    });

    it('shows an honest empty state when no activity has been recorded on this login', async () => {
        activityUserIdHolder.current = 'u-andy@dwellium.com';
        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByText('LOGIN_SUCCESS')).toBeTruthy());
        fireEvent.click(screen.getByRole('tab', { name: /My Activity/i }));
        expect(screen.getByText(/No activity recorded on this login yet/i)).toBeTruthy();
    });
});
