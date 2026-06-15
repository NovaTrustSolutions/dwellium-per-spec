/**
 * UserContext Tests — Regression coverage for authentication
 *
 * Ensures:
 * - login() sends credentials, stores token, sets user
 * - logout() clears token and user state
 * - hasMinRole() respects role hierarchy
 * - hasPermission() bypasses for god role
 * - Token validation on mount
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { UserProvider, useUser, tokenStore } from '../context/UserContext';
import type { ReactNode } from 'react';

// Mock the config module that UserContext imports
vi.mock('../config', () => ({
    API_BASE: '',
}));

const MOCK_USER = {
    id: 'u1',
    email: 'andy@zpgroup.com',
    name: 'Andy',
    role: 'god',
    assignedProperties: [],
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
};

const wrapper = ({ children }: { children: ReactNode }) => (
    <UserProvider>{children}</UserProvider>
);

describe('UserContext', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn();
        localStorage.clear();
        // Phase-8+ Task 8.9 — reset module-level tokenStore cache so each
        // test gets fresh state (matches pre-Task-8.9 per-mount useState
        // lazy-init behavior byte-for-byte).
        tokenStore.reset();
    });

    // ── Login ───────────────────────────────────────────────────────────────

    it('login() sends credentials and stores token on success', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>)
            // First call: mount token validation (no token, so it won't fire)
            // login call:
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    token: 'jwt-123',
                    user: MOCK_USER,
                    permissions: { dashboard: true },
                }),
            });

        const { result } = renderHook(() => useUser(), { wrapper });

        // Wait for initial load
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        let loginResult: any;
        await act(async () => {
            loginResult = await result.current.login('andy@zpgroup.com', 'password');
        });

        expect(loginResult.success).toBe(true);
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user?.email).toBe('andy@zpgroup.com');
        expect(result.current.token).toBe('jwt-123');
        expect(localStorage.getItem('dwellium-auth-token')).toBe('jwt-123');
    });

    it('login() returns error on failed login', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'Invalid credentials' }),
        });

        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        let loginResult: any;
        await act(async () => {
            loginResult = await result.current.login('bad@email.com', 'wrong');
        });

        expect(loginResult.success).toBe(false);
        expect(loginResult.error).toBe('Invalid credentials');
        expect(result.current.isAuthenticated).toBe(false);
    });

    it('login() handles network errors', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        let loginResult: any;
        await act(async () => {
            loginResult = await result.current.login('andy@zpgroup.com', 'password');
        });

        expect(loginResult.success).toBe(false);
        expect(loginResult.error).toBe('Cannot reach server');
    });

    it('loginWithGoogle() exchanges the credential and uses the Google-derived user', async () => {
        const GOOGLE_USER = { ...MOCK_USER, id: 'google-user-1', email: 'ilya@gmail.com', name: 'Ilya' };
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                token: 'google-session-token',
                user: GOOGLE_USER,
                permissions: { dashboard: true },
            }),
        });

        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        let loginResult: any;
        await act(async () => {
            loginResult = await result.current.loginWithGoogle('google-id-token');
        });

        expect(loginResult.success).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/google', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ credential: 'google-id-token' }),
        }));
        expect(result.current.user).toMatchObject({ id: 'google-user-1', name: 'Ilya', email: 'ilya@gmail.com' });
        expect(localStorage.getItem('dwellium-auth-token')).toBe('google-session-token');
    });

    // ── Logout ──────────────────────────────────────────────────────────────

    it('logout() clears user state and token', async () => {
        // Setup: login first
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
            if (url === '/api/auth/login') return {
                ok: true,
                json: async () => ({
                    token: 'jwt-123',
                    user: MOCK_USER,
                    permissions: {},
                }),
            };
            if (url === '/api/auth/logout') return { ok: true };
            if (url.includes('/api/objects/')) return { ok: false, status: 404 };
            throw new Error(`Unmocked: ${url}`);
        });

        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.login('andy@zpgroup.com', 'password');
        });

        expect(result.current.isAuthenticated).toBe(true);

        act(() => {
            result.current.logout();
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
        expect(result.current.token).toBeNull();
        expect(localStorage.getItem('dwellium-auth-token')).toBeNull();
    });

    // ── Role Hierarchy ──────────────────────────────────────────────────────

    it('hasMinRole() respects role hierarchy', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                token: 'jwt-corp',
                user: { ...MOCK_USER, role: 'corporate' },
                permissions: {},
            }),
        });

        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.login('corp@zpgroup.com', 'password');
        });

        // corporate > management > advisor > maintenance > agent > tenant
        expect(result.current.hasMinRole('tenant')).toBe(true);
        expect(result.current.hasMinRole('management')).toBe(true);
        expect(result.current.hasMinRole('corporate')).toBe(true);
        expect(result.current.hasMinRole('god')).toBe(false); // god > corporate
    });

    // ── Permissions ─────────────────────────────────────────────────────────

    it('hasPermission() returns true for god role on any permission', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                token: 'jwt-god',
                user: MOCK_USER, // role: 'god'
                permissions: {}, // empty — god bypasses
            }),
        });

        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.login('andy@zpgroup.com', 'password');
        });

        expect(result.current.hasPermission('anything')).toBe(true);
        expect(result.current.hasPermission('delete_property')).toBe(true);
    });

    it('loginAsArchitect creates a god session with Andy-level permission bypass', async () => {
        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => {
            result.current.loginAsArchitect();
        });

        expect(result.current.user).toMatchObject({
            name: 'Architect',
            email: 'architect@dwellium.com',
            role: 'god',
        });
        expect(result.current.hasMinRole('god')).toBe(true);
        expect(result.current.hasPermission('anything')).toBe(true);
        expect(localStorage.getItem('dwellium-auth-token')).toContain('architect-9a921527');
    });

    it('hasPermission() checks permissions map for non-god roles', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                token: 'jwt-mgr',
                user: { ...MOCK_USER, role: 'management' },
                permissions: { view_properties: true, delete_property: false },
            }),
        });

        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.login('mgr@zpgroup.com', 'password');
        });

        expect(result.current.hasPermission('view_properties')).toBe(true);
        expect(result.current.hasPermission('delete_property')).toBe(false);
        expect(result.current.hasPermission('unknown_perm')).toBe(false);
    });

    // ── Token Validation on Mount ───────────────────────────────────────────

    it('validates stored token on mount and sets user', async () => {
        localStorage.setItem('dwellium-auth-token', 'stored-jwt');

        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                user: MOCK_USER,
                permissions: { dashboard: true },
            }),
        });

        const { result } = renderHook(() => useUser(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user?.name).toBe('Andy');
    });

    it('clears invalid stored token on mount', async () => {
        localStorage.setItem('dwellium-auth-token', 'expired-jwt');

        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 401,
        });

        const { result } = renderHook(() => useUser(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.isAuthenticated).toBe(false);
        expect(localStorage.getItem('dwellium-auth-token')).toBeNull();
    });

    it('keeps the session on a transient /api/auth/me network failure (does NOT log out)', async () => {
        localStorage.setItem('dwellium-auth-token', 'valid-jwt');
        localStorage.setItem('dwellium-user', JSON.stringify(MOCK_USER));

        // Backend hiccup: fetch rejects (network down / backend mid-restart)
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'));

        const { result } = renderHook(() => useUser(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // Session survives — restored optimistically from localStorage, NOT cleared.
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user?.name).toBe('Andy');
        expect(localStorage.getItem('dwellium-auth-token')).toBe('valid-jwt');
    });

    it('keeps the session on a 5xx /api/auth/me failure (does NOT log out)', async () => {
        localStorage.setItem('dwellium-auth-token', 'valid-jwt');
        localStorage.setItem('dwellium-user', JSON.stringify(MOCK_USER));

        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 503,
        });

        const { result } = renderHook(() => useUser(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.isAuthenticated).toBe(true);
        expect(localStorage.getItem('dwellium-auth-token')).toBe('valid-jwt');
    });

    // ── Widget-click logout regression (authFetch → doRefresh) ────────────────
    // These exercise the ACTUAL path a widget hits: an authed data call returns
    // 401, authFetch() attempts one silent refresh, and the refresh fails. The
    // session MUST survive — only the mount /api/auth/me validator (or an explicit
    // logout) may ever clear auth. Prior bug: doRefresh() called clearTokens() on
    // ANY non-OK refresh, so clicking a widget bounced the user to the login
    // screen. The earlier "fix" only hardened the mount path, not this one.

    async function renderAuthed() {
        localStorage.setItem('dwellium-auth-token', 'valid-jwt');
        localStorage.setItem('dwellium-refresh-token', 'valid-refresh');
        localStorage.setItem('dwellium-user', JSON.stringify(MOCK_USER));
        // Mount /api/auth/me validation succeeds → confirmed logged in.
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ user: MOCK_USER, permissions: { dashboard: true } }),
        });
        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.isAuthenticated).toBe(true);
        return result;
    }

    it('does NOT log out when a widget call 401s and the refresh endpoint 5xxs', async () => {
        const result = await renderAuthed();
        (globalThis.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ ok: false, status: 401 })   // widget data call
            .mockResolvedValueOnce({ ok: false, status: 503 });  // /api/auth/refresh down

        let res: Response | undefined;
        await act(async () => {
            res = await result.current.authFetch('/api/strata/properties');
        });

        // Session survives; the widget just receives its 401 to handle locally.
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.sessionExpired).toBe(false); // transient (5xx), not dead
        expect(result.current.user?.name).toBe('Andy');
        expect(localStorage.getItem('dwellium-auth-token')).toBe('valid-jwt');
        expect(res?.status).toBe(401);
    });

    it('does NOT log out when a widget call 401s and the refresh endpoint also 401s', async () => {
        const result = await renderAuthed();
        (globalThis.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ ok: false, status: 401 })   // widget data call
            .mockResolvedValueOnce({ ok: false, status: 401 });  // refresh rejects too

        await act(async () => {
            await result.current.authFetch('/api/strata/vendors');
        });

        // A rejected refresh means the session is dead — but we DON'T bounce to
        // the login screen. The shell stays mounted (isAuthenticated stays true)
        // and sessionExpired flips so AuthGate overlays the recoverable re-auth
        // modal; the user signs back in and resumes in place.
        await waitFor(() => expect(result.current.sessionExpired).toBe(true));
        expect(result.current.isAuthenticated).toBe(true);
        expect(localStorage.getItem('dwellium-auth-token')).toBe('valid-jwt');
    });

    it('does NOT log out when a widget call 401s and the refresh endpoint 404s', async () => {
        const result = await renderAuthed();
        (globalThis.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ ok: false, status: 401 })   // widget data call
            .mockResolvedValueOnce({ ok: false, status: 404 });  // refresh route missing (dev backend)

        await act(async () => {
            await result.current.authFetch('/api/strata/maintenance');
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.sessionExpired).toBe(false); // 404 = transient, not dead
        expect(localStorage.getItem('dwellium-auth-token')).toBe('valid-jwt');
    });

    it('retries the widget call transparently when the refresh succeeds', async () => {
        const result = await renderAuthed();
        (globalThis.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ ok: false, status: 401 })   // widget data call
            .mockResolvedValueOnce({                              // /api/auth/refresh succeeds
                ok: true,
                status: 200,
                json: async () => ({
                    token: 'jwt-rotated',
                    refreshToken: 'refresh-rotated',
                    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
                }),
            })
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) }); // retry

        let res: Response | undefined;
        await act(async () => {
            res = await result.current.authFetch('/api/strata/owners');
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(res?.status).toBe(200);
        expect(localStorage.getItem('dwellium-auth-token')).toBe('jwt-rotated');
    });

    // ── Recoverable re-auth (sessionExpired) ──────────────────────────────────
    // A genuinely dead session must NOT bounce to the login screen and lose the
    // user's place. Instead the shell stays mounted (isAuthenticated stays true)
    // and `sessionExpired` flips so AuthGate overlays a re-auth modal.

    it('a confirmed-dead session WITH a stored identity stays mounted and flags sessionExpired', async () => {
        localStorage.setItem('dwellium-auth-token', 'valid-jwt');
        localStorage.setItem('dwellium-refresh-token', 'dead-refresh');
        localStorage.setItem('dwellium-user', JSON.stringify(MOCK_USER));
        (globalThis.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ ok: false, status: 401 })  // /api/auth/me — unauthorized
            .mockResolvedValueOnce({ ok: false, status: 401 }); // /api/auth/refresh — token rejected

        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await waitFor(() => expect(result.current.sessionExpired).toBe(true));

        // Shell preserved (recoverable) — NOT bounced to the login screen.
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user?.name).toBe('Andy');
    });

    it('logging in from an expired session clears sessionExpired', async () => {
        localStorage.setItem('dwellium-auth-token', 'valid-jwt');
        localStorage.setItem('dwellium-refresh-token', 'dead-refresh');
        localStorage.setItem('dwellium-user', JSON.stringify(MOCK_USER));
        (globalThis.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ ok: false, status: 401 })  // mount /api/auth/me
            .mockResolvedValueOnce({ ok: false, status: 401 }); // mount refresh → dead

        const { result } = renderHook(() => useUser(), { wrapper });
        await waitFor(() => expect(result.current.sessionExpired).toBe(true));

        // Re-auth from the modal succeeds:
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ token: 'jwt-new', refreshToken: 'refresh-new', user: MOCK_USER, permissions: {} }),
        });
        await act(async () => {
            await result.current.login('andy@zpgroup.com', 'password');
        });

        expect(result.current.sessionExpired).toBe(false);
        expect(result.current.isAuthenticated).toBe(true);
        expect(localStorage.getItem('dwellium-auth-token')).toBe('jwt-new');
    });

    it('re-validates on window focus and flags a session that died while open', async () => {
        const result = await renderAuthed(); // mount /api/auth/me → 200 (healthy)
        expect(result.current.sessionExpired).toBe(false);

        // Session dies server-side while the app is open; user refocuses the window.
        (globalThis.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ ok: false, status: 401 })  // focus → /api/auth/me
            .mockResolvedValueOnce({ ok: false, status: 401 }); // focus → refresh → dead

        await act(async () => {
            window.dispatchEvent(new Event('focus'));
        });

        await waitFor(() => expect(result.current.sessionExpired).toBe(true));
        expect(result.current.isAuthenticated).toBe(true); // shell preserved
    });
});
