/**
 * openNotebookClient — fail-soft REST client for a running Open Notebook
 * instance. Verifies base-URL resolution (derive :5055 from a :8502 UI URL +
 * explicit override), shape tolerance (bare array AND { items: [] }), optional
 * bearer auth (header present only when token set), and the never-throw
 * fail-soft contract (network error / non-OK → { ok: false }). Mocked fetch,
 * no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    resolveOpenNotebookApiBase,
    listNotebooks,
} from '../lib/openNotebookClient';

const LS_API_URL = 'dwellium-open-notebook-api-url';
const LS_UI_URL = 'dwellium-open-notebook-url';
const LS_TOKEN = 'dwellium-open-notebook-token';

/** Install a fetch mock that records the call and returns a chosen body/status. */
function mockFetch(impl: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
    const seen: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
        seen.push({ url: String(url), init: init as RequestInit | undefined });
        const r = impl(String(url), init as RequestInit | undefined);
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body ?? {},
        } as Response;
    }) as unknown as typeof fetch;
    return seen;
}

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('resolveOpenNotebookApiBase', () => {
    it('defaults to http://localhost:5055 when nothing is configured', () => {
        expect(resolveOpenNotebookApiBase()).toBe('http://localhost:5055');
    });

    it('derives :5055 from a :8502 web-UI URL', () => {
        localStorage.setItem(LS_UI_URL, 'http://localhost:8502');
        expect(resolveOpenNotebookApiBase()).toBe('http://localhost:5055');
    });

    it('derives :5055 from a :8502 URL that has a trailing slash (and strips it)', () => {
        localStorage.setItem(LS_UI_URL, 'http://localhost:8502/');
        expect(resolveOpenNotebookApiBase()).toBe('http://localhost:5055');
    });

    it('honors an explicit api-url key over the derived UI URL', () => {
        localStorage.setItem(LS_UI_URL, 'http://localhost:8502');
        localStorage.setItem(LS_API_URL, 'http://192.168.1.9:9000/');
        expect(resolveOpenNotebookApiBase()).toBe('http://192.168.1.9:9000'); // explicit wins + trailing slash stripped
    });

    it('leaves a non-:8502 UI URL untouched (only the port pattern is rewritten)', () => {
        localStorage.setItem(LS_UI_URL, 'http://my-host:7000');
        expect(resolveOpenNotebookApiBase()).toBe('http://my-host:7000');
    });
});

describe('listNotebooks — shape tolerance', () => {
    it('parses a bare array body', async () => {
        mockFetch(() => ({
            status: 200,
            body: [
                { id: 'notebook:a', name: 'Alpha', description: 'first', created: 'c', updated: 'u' },
                { id: 'notebook:b', title: 'Beta' }, // title → name fallback
            ],
        }));
        const r = await listNotebooks();
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.notebooks).toHaveLength(2);
            expect(r.notebooks[0]).toMatchObject({ id: 'notebook:a', name: 'Alpha', description: 'first' });
            expect(r.notebooks[1].name).toBe('Beta'); // title used when name absent
        }
    });

    it('parses an { items: [...] } envelope', async () => {
        mockFetch(() => ({ status: 200, body: { items: [{ id: 'notebook:x', name: 'X' }] } }));
        const r = await listNotebooks();
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.notebooks).toHaveLength(1);
            expect(r.notebooks[0].id).toBe('notebook:x');
        }
    });

    it('tolerates missing fields with safe defaults', async () => {
        mockFetch(() => ({ status: 200, body: [{}] }));
        const r = await listNotebooks();
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.notebooks[0].id).toBe('');
            expect(r.notebooks[0].name).toBe('Untitled notebook');
        }
    });
});

describe('listNotebooks — optional bearer auth', () => {
    it('sends an Authorization header when a token is set', async () => {
        localStorage.setItem(LS_TOKEN, 'secret-pw');
        const seen = mockFetch(() => ({ status: 200, body: [] }));
        await listNotebooks();
        const headers = seen[0].init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer secret-pw');
    });

    it('omits the Authorization header when no token is set', async () => {
        const seen = mockFetch(() => ({ status: 200, body: [] }));
        await listNotebooks();
        const headers = (seen[0].init?.headers as Record<string, string>) ?? {};
        expect(headers.Authorization).toBeUndefined();
    });

    it('hits the resolved base + /notebooks path', async () => {
        localStorage.setItem(LS_API_URL, 'http://localhost:5055');
        const seen = mockFetch(() => ({ status: 200, body: [] }));
        await listNotebooks();
        expect(seen[0].url).toBe('http://localhost:5055/notebooks');
    });
});

describe('listNotebooks — fail-soft (never throws)', () => {
    it('returns { ok: false } on a non-OK status', async () => {
        mockFetch(() => ({ status: 500 }));
        const r = await listNotebooks();
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/500/);
    });

    it('returns { ok: false } on a network error (does not throw)', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
        await expect(listNotebooks()).resolves.toMatchObject({ ok: false });
        const r = await listNotebooks();
        if (!r.ok) expect(r.error).toBe('ECONNREFUSED');
    });
});
