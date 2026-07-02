/**
 * AuditLogWidget — Andy-only audit-trail holocron (2026-07-02).
 *
 * The widget must (1) hard-gate on the signed-in email — everyone except
 * andy@dwellium.com sees the "restricted" card, never data; (2) render the
 * Sessions/Activity views from the backend audit feed for Andy; (3) be
 * registered in WIDGET_REGISTRY with `restrictedToEmails` so catalogs
 * (Holocron OS Apps) hide it from other accounts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import AuditLogWidget from '../components/AuditLog/AuditLogWidget';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { UserContext, type DwelliumUser } from '../context/UserContext';

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
        { id: 1, userId: 'u-1', userName: 'Andy', userRole: 'god', action: 'LOGIN_SUCCESS', createdAt: '2026-07-02 08:00:00', ipAddress: '203.0.113.7' },
        { id: 2, userId: 'u-1', userName: 'Andy', userRole: 'god', action: 'UPDATE', entityType: 'objects', entityId: 'workspaces_u-1', createdAt: '2026-07-02 08:05:00', ipAddress: '203.0.113.7' },
        { id: 3, userId: 'u-1', userName: 'Andy', userRole: 'god', action: 'LOGOUT', createdAt: '2026-07-02 09:00:00', ipAddress: '203.0.113.7' },
    ],
};

beforeEach(() => {
    cleanup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(AUDIT_OK), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('AuditLogWidget access gate', () => {
    it('shows the restricted card for a non-Andy login and never fetches', () => {
        render(withUser('lisa@dwellium.com', <AuditLogWidget />));
        expect(screen.getByText(/Audit Log is restricted/i)).toBeTruthy();
        expect(screen.getByText(/only available on Andy/i)).toBeTruthy();
        expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('shows the restricted card when no user is present', () => {
        render(withUser(null, <AuditLogWidget />));
        expect(screen.getByText(/Audit Log is restricted/i)).toBeTruthy();
    });

    it('renders session events (login/logout + IP) for Andy', async () => {
        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByText('LOGIN_SUCCESS')).toBeTruthy());
        expect(screen.getByText('LOGOUT')).toBeTruthy();
        expect(screen.getAllByText('203.0.113.7').length).toBeGreaterThan(0);
        // Activity events are NOT in the sessions view.
        expect(screen.queryByText('UPDATE')).toBeNull();
    });

    it('surfaces an honest message when the backend rejects the session', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response('{"error":"Authentication required"}', { status: 401 }));
        render(withUser('andy@dwellium.com', <AuditLogWidget />));
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/backend rejected this session/i));
    });
});

describe('AuditLogWidget registration', () => {
    it('is registered under id "audit-log" restricted to Andy', () => {
        const reg = WIDGET_REGISTRY['audit-log'];
        expect(reg).toBeTruthy();
        expect(reg.label).toBe('Audit Log');
        expect(reg.category).toBe('tools');
        expect(reg.restrictedToEmails).toEqual(['andy@dwellium.com']);
    });
});
