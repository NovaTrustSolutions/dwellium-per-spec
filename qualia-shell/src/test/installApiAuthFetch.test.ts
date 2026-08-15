import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installApiAuthFetch } from '../lib/installApiAuthFetch';

const TOKEN_KEY = 'dwellium-auth-token';

describe('installApiAuthFetch', () => {
    const origFetch = window.fetch;
    let calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>;

    beforeEach(() => {
        calls = [];
        localStorage.clear();
        delete (window as unknown as Record<string, unknown>).__dwelliumApiAuthFetch;
        window.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ input, init });
            return Promise.resolve(new Response('{}'));
        }) as typeof fetch;
        installApiAuthFetch();
    });

    afterEach(() => {
        window.fetch = origFetch;
        delete (window as unknown as Record<string, unknown>).__dwelliumApiAuthFetch;
    });

    const authHeader = (i: number) => new Headers(calls[i].init?.headers).get('Authorization');

    it('adds Bearer <token> to same-origin /api/* calls', async () => {
        localStorage.setItem(TOKEN_KEY, 'abc123');
        await fetch('/api/inbox');
        await fetch(`${window.location.origin}/api/tasks?q=x`, { method: 'GET' });
        expect(authHeader(0)).toBe('Bearer abc123');
        expect(authHeader(1)).toBe('Bearer abc123');
    });

    it('does not override an explicit Authorization header', async () => {
        localStorage.setItem(TOKEN_KEY, 'abc123');
        await fetch('/api/inbox', { headers: { Authorization: 'Bearer mine' } });
        expect(authHeader(0)).toBe('Bearer mine');
    });

    it('leaves non-API, cross-origin, no-token and static- sessions untouched', async () => {
        await fetch('/api/inbox'); // no token
        localStorage.setItem(TOKEN_KEY, 'static-123-architect');
        await fetch('/api/inbox'); // offline pseudo-session
        localStorage.setItem(TOKEN_KEY, 'abc123');
        await fetch('/assets/x.js'); // not /api
        await fetch('https://api.openai.com/api/v1'); // cross-origin
        for (let i = 0; i < 4; i++) expect(authHeader(i)).toBeNull();
    });

    it('is idempotent', () => {
        const patched = window.fetch;
        installApiAuthFetch();
        expect(window.fetch).toBe(patched);
    });
});
