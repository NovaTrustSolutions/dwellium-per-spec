/**
 * oneSaveClient — swarm C item 3c: a 429 must be VISIBLE (syncRateLimitStore),
 * not just swallowed as the same `null` as any other failure. `ONE_SAVE_ENABLED`
 * is a module-load-time constant from `import.meta.env.VITE_ONE_SAVE`, so each
 * test stubs the env and re-imports fresh (vi.resetModules) rather than mocking
 * the module itself — this is a test OF oneSaveClient.ts, not a caller of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(data: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => data };
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

        expect(syncRateLimitStore.getSnapshot()).toEqual({ limited: false, lastLimitedAt: null });

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
