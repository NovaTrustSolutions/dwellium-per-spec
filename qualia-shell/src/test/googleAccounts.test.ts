/**
 * googleAccounts — the multi-account Gmail/Calendar client. Verifies graceful
 * degradation when the backend route is absent, response normalization, and the
 * OAuth-start flow. All with a mocked fetch (no network).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    listGoogleAccounts,
    startGoogleAuth,
    disconnectGoogleAccount,
    failureNote,
} from '../lib/googleAccounts';

function mockFetch(impl: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
    globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
        const r = impl(String(url), init as RequestInit | undefined);
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body ?? {},
        } as Response;
    }) as unknown as typeof fetch;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('listGoogleAccounts', () => {
    it('reports unavailable when the backend route is missing (404)', async () => {
        mockFetch(() => ({ status: 404 }));
        const r = await listGoogleAccounts();
        expect(r.available).toBe(false);
        expect(r.accounts).toEqual([]);
        expect(r.error).toMatch(/backend/i);
    });

    it('normalizes accounts from a { success, data } envelope', async () => {
        mockFetch(() => ({
            status: 200,
            body: { success: true, data: { accounts: [
                { id: 'acc1', email: 'a@x.com', scopes: ['gmail', 'calendar', 'bogus'], enabled: false, connectedAt: 123 },
            ] } },
        }));
        const r = await listGoogleAccounts();
        expect(r.available).toBe(true);
        expect(r.accounts).toHaveLength(1);
        expect(r.accounts[0].scopes).toEqual(['gmail', 'calendar']); // bogus scope filtered out
        expect(r.accounts[0].enabled).toBe(false);
        expect(r.accounts[0].connectedAt).toBe(123);
    });

    it('accepts a bare array and defaults id/scopes/enabled', async () => {
        mockFetch(() => ({ status: 200, body: [{ email: 'b@x.com' }] }));
        const r = await listGoogleAccounts();
        expect(r.available).toBe(true);
        expect(r.accounts[0].id).toBe('b@x.com'); // id falls back to email
        expect(r.accounts[0].scopes).toEqual([]);
        expect(r.accounts[0].enabled).toBe(true); // default
    });

    it('is unavailable (not throwing) on a network error', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('boom'); }) as unknown as typeof fetch;
        const r = await listGoogleAccounts();
        expect(r.available).toBe(false);
        expect(r.error).toMatch(/boom/);
    });
});

describe('startGoogleAuth', () => {
    it('returns the consent URL the popup should open', async () => {
        mockFetch((url, init) => {
            expect(url).toMatch(/\/api\/google\/auth\/start$/);
            expect(init?.method).toBe('POST');
            return { status: 200, body: { success: true, data: { url: 'https://accounts.google.com/o/oauth2/consent?x=1' } } };
        });
        const r = await startGoogleAuth(['gmail', 'calendar']);
        expect(r.available).toBe(true);
        expect(r.url).toContain('accounts.google.com');
    });

    it('reports unavailable when the start route is missing', async () => {
        mockFetch(() => ({ status: 404 }));
        const r = await startGoogleAuth(['gmail']);
        expect(r.available).toBe(false);
        expect(r.url).toBeUndefined();
    });
});

describe('disconnectGoogleAccount', () => {
    it('returns ok on success and surfaces a backend error otherwise', async () => {
        mockFetch(() => ({ status: 200 }));
        expect((await disconnectGoogleAccount('acc1')).ok).toBe(true);
        mockFetch(() => ({ status: 500 }));
        const r = await disconnectGoogleAccount('acc1');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/500/);
    });
});

describe('failure reasons (a live backend saying no is not a missing patch)', () => {
    it.each([
        [404, 'missing-route', /apply the backend patch/i],
        [401, 'unauthorized', /sign out and back in/i],
        [403, 'unauthorized', /sign out and back in/i],
        [429, 'rate-limited', /rate-limiting/i],
        [503, 'unavailable', /answered 503/i],
    ])('maps HTTP %s to %s', async (status, reason, text) => {
        mockFetch(() => ({ status }));
        const r = await listGoogleAccounts();
        expect(r.available).toBe(false);
        expect(r.reason).toBe(reason);
        expect(r.error).toMatch(text);
        expect(failureNote(r.reason, r.error)).toMatch(text);
    });

    it('only the missing-route note mentions the backend patch', () => {
        expect(failureNote('missing-route')).toMatch(/Google_MultiAccount_Backend\.md/);
        for (const reason of ['unauthorized', 'rate-limited', 'unavailable', 'network'] as const) {
            expect(failureNote(reason)).not.toMatch(/backend patch/i);
        }
    });

    it('network failures say the backend could not be reached', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('boom'); }) as unknown as typeof fetch;
        const r = await listGoogleAccounts();
        expect(r.reason).toBe('network');
        expect(r.error).toMatch(/could not be reached/);
    });
});
