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

    // ── Logout ──────────────────────────────────────────────────────────────

    it('logout() clears user state and token', async () => {
        // Setup: login first
        (globalThis.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    token: 'jwt-123',
                    user: MOCK_USER,
                    permissions: {},
                }),
            })
            .mockResolvedValueOnce({ ok: true }); // logout POST

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
});
