/**
 * oneSaveClient — swarm C item 3c: a 429 must be VISIBLE (syncRateLimitStore),
 * not just swallowed as the same `null` as any other failure. `ONE_SAVE_ENABLED`
 * is a module-load-time constant from `import.meta.env.VITE_ONE_SAVE`, so each
 * test stubs the env and re-imports fresh (vi.resetModules) rather than mocking
 * the module itself — this is a test OF oneSaveClient.ts, not a caller of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(data: unknown, ok = true, status = 200, headers?: Record<string, string>) {
    return {
        ok,
        status,
        json: async () => data,
        headers: { get: (name: string) => headers?.[name] ?? null },
    };
}

describe('oneSaveClient 429 handling (syncRateLimitStore)', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_ONE_SAVE', 'true');
        vi.resetModules();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('a 429 flips syncRateLimitStore.limited; a later success clears it', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { oneSaveClient, syncRateLimitStore } = await import('../lib/oneSaveClient');

        expect(syncRateLimitStore.getSnapshot()).toEqual({ limited: false, lastLimitedAt: null, retryAt: null });

        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, false, 429));
        const result = await oneSaveClient.get('obj-1');
        expect(result).toBeNull(); // still the existing no-throw contract
        expect(syncRateLimitStore.getSnapshot().limited).toBe(true);
        expect(syncRateLimitStore.getSnapshot().lastLimitedAt).toBeTypeOf('number');

        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'obj-1' } }));
        await oneSaveClient.get('obj-1');
        expect(syncRateLimitStore.getSnapshot().limited).toBe(false);
    });

    it('a non-429 failure (e.g. 500) does not touch the rate-limit flag', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { oneSaveClient, syncRateLimitStore } = await import('../lib/oneSaveClient');

        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, false, 500));
        await oneSaveClient.get('obj-1');
        expect(syncRateLimitStore.getSnapshot().limited).toBe(false);
    });

    it('a 429 with Retry-After sets retryAt from the header (seconds → epoch ms)', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { oneSaveClient, syncRateLimitStore } = await import('../lib/oneSaveClient');

        const before = Date.now();
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, false, 429, { 'Retry-After': '30' }));
        await oneSaveClient.get('obj-1');

        const { retryAt } = syncRateLimitStore.getSnapshot();
        expect(retryAt).not.toBeNull();
        expect(retryAt as number).toBeGreaterThanOrEqual(before + 30_000);
        expect(retryAt as number).toBeLessThanOrEqual(Date.now() + 30_000);
    });

    it('a 429 with no Retry-After header defaults to a 60s pause', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { oneSaveClient, syncRateLimitStore } = await import('../lib/oneSaveClient');

        const before = Date.now();
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, false, 429));
        await oneSaveClient.get('obj-1');

        const { retryAt } = syncRateLimitStore.getSnapshot();
        expect(retryAt).not.toBeNull();
        expect(retryAt as number).toBeGreaterThanOrEqual(before + 60_000);
        expect(retryAt as number).toBeLessThanOrEqual(Date.now() + 60_000);
    });

    it('putBatch: 200 parses into { saved, failed }', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { oneSaveClient } = await import('../lib/oneSaveClient');

        fetchMock.mockResolvedValueOnce(
            jsonResponse({ success: true, data: { saved: ['a', 'b'], failed: [] } }),
        );
        const result = await oneSaveClient.putBatch([
            { id: 'a', type: 't', ownerId: 'u', payload: 1 },
            { id: 'b', type: 't', ownerId: 'u', payload: 2 },
        ]);
        expect(result).toEqual({ saved: ['a', 'b'], failed: [] });
    });

    it('putBatch: 404 (old backend without the route) resolves to "unsupported"', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { oneSaveClient } = await import('../lib/oneSaveClient');

        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'not found' }, false, 404));
        const result = await oneSaveClient.putBatch([{ id: 'a', type: 't', ownerId: 'u', payload: 1 }]);
        expect(result).toBe('unsupported');
    });

    it('putBatch: 429 resolves to null and marks the rate-limit store', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { oneSaveClient, syncRateLimitStore } = await import('../lib/oneSaveClient');

        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, false, 429, { 'Retry-After': '30' }));
        const result = await oneSaveClient.putBatch([{ id: 'a', type: 't', ownerId: 'u', payload: 1 }]);
        expect(result).toBeNull();
        expect(syncRateLimitStore.getSnapshot().limited).toBe(true);
    });

    it('listAll: null on a failed bulk call, the array (possibly empty) on success', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { oneSaveClient } = await import('../lib/oneSaveClient');

        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'down' }, false, 503));
        expect(await oneSaveClient.listAll('user-1')).toBeNull();

        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));
        expect(await oneSaveClient.listAll('user-1')).toEqual([]);
    });
});
