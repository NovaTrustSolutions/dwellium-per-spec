/**
 * googleOAuthConnect — Task A. The Connect Google flow must NOT do a raw
 * top-level navigation to the protected /oauth/start endpoint (that 401s because
 * a navigation can't carry the Authorization header). Instead the client makes
 * an AUTHENTICATED fetch that returns the public consent URL as { url }, which
 * the caller then opens. These tests assert exactly that contract:
 *   • the OAuth-start call is a fetch (not window.open) carrying the Bearer token,
 *   • it returns the consent URL from a { success, data: { url } } envelope,
 *   • auth/no-url/backend-down all degrade gracefully (no throw, no 401 tab).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGoogleOAuthStatus, startGoogleOAuthConnect } from '../lib/googleOAuthConnect';

interface Captured { url: string; init?: RequestInit }

function mockFetch(impl: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
    const calls: Captured[] = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
        calls.push({ url: String(url), init: init as RequestInit | undefined });
        const r = impl(String(url), init as RequestInit | undefined);
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body ?? {},
            text: async () => JSON.stringify(r.body ?? {}),
        } as Response;
    }) as unknown as typeof fetch;
    return calls;
}

function authHeaderOf(init?: RequestInit): string | undefined {
    const h = init?.headers as Record<string, string> | undefined;
    return h?.['Authorization'];
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('dwellium-auth-token', 'test-bearer-token-1234567890abcdefghi'); // 39-ish chars
});
afterEach(() => { vi.restoreAllMocks(); });

describe('startGoogleOAuthConnect — authenticated fetch-then-redirect (Task A)', () => {
    it('fetches /oauth/start with the Bearer token and returns the consent URL (not a raw navigation)', async () => {
        const calls = mockFetch(() => ({
            status: 200,
            body: { success: true, data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x' } },
        }));

        // window.open must NOT be used to hit the protected endpoint.
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

        const res = await startGoogleOAuthConnect();

        expect(res.url).toBe('https://accounts.google.com/o/oauth2/v2/auth?client_id=x');
        expect(res.error).toBeUndefined();
        // Exactly one fetch, to the start endpoint, carrying auth — i.e. fetch-then-redirect.
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain('/api/google/oauth/start');
        expect(calls[0].url).toContain('mode=json');
        expect(authHeaderOf(calls[0].init)).toBe('Bearer test-bearer-token-1234567890abcdefghi');
        // The client itself never navigates to the protected endpoint.
        expect(openSpy).not.toHaveBeenCalled();
    });

    it('reads a bare { url } (no envelope) too', async () => {
        mockFetch(() => ({ status: 200, body: { url: 'https://accounts.google.com/consent' } }));
        const res = await startGoogleOAuthConnect();
        expect(res.url).toBe('https://accounts.google.com/consent');
    });

    it('returns a friendly error (no throw) on 401 instead of dumping the user in a broken tab', async () => {
        mockFetch(() => ({ status: 401, body: { error: 'Authentication required' } }));
        const res = await startGoogleOAuthConnect();
        expect(res.url).toBeUndefined();
        expect(res.error).toMatch(/authoriz/i);
    });

    it('surfaces the backend-needs-{url}-update case when 200 carries no url', async () => {
        mockFetch(() => ({ status: 200, body: { success: true, data: {} } }));
        const res = await startGoogleOAuthConnect();
        expect(res.url).toBeUndefined();
        expect(res.error).toMatch(/consent url/i);
    });

    it('does not throw on a network error', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('down'); }) as unknown as typeof fetch;
        const res = await startGoogleOAuthConnect();
        expect(res.url).toBeUndefined();
        expect(res.error).toBe('down');
    });
});

describe('getGoogleOAuthStatus — authenticated status probe', () => {
    it('sends the Bearer token and parses the status envelope', async () => {
        const calls = mockFetch(() => ({
            status: 200,
            body: { success: true, data: { configured: true, connected: false } },
        }));
        const r = await getGoogleOAuthStatus();
        expect(r.reachable).toBe(true);
        expect(r.status).toEqual({ configured: true, connected: false, blocker: undefined });
        expect(calls[0].url).toContain('/api/google/oauth/status');
        expect(authHeaderOf(calls[0].init)).toBe('Bearer test-bearer-token-1234567890abcdefghi');
    });

    it('reports unreachable (not connected) when the backend errors', async () => {
        mockFetch(() => ({ status: 502 }));
        const r = await getGoogleOAuthStatus();
        expect(r.reachable).toBe(false);
        expect(r.status).toBeNull();
    });
});
