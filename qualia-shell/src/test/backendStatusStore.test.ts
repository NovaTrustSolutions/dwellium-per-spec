/**
 * backendStatusStore tests — the global "backend down + reconnect" state.
 * Requirement: a backend failure surfaces the banner; it NEVER touches auth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { backendStatusStore } from '../lib/backendStatusStore';

vi.mock('../config', () => ({ API_BASE: '' }));

describe('backendStatusStore', () => {
    beforeEach(() => {
        backendStatusStore.reset();
        globalThis.fetch = vi.fn();
        localStorage.clear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts online with no message', () => {
        const s = backendStatusStore.getSnapshot();
        expect(s.state).toBe('online');
        expect(s.message).toBeNull();
    });

    it('markOffline sets offline + a friendly message and notifies subscribers', () => {
        const listener = vi.fn();
        const unsub = backendStatusStore.subscribe(listener);
        backendStatusStore.markOffline('Failed to fetch');
        const s = backendStatusStore.getSnapshot();
        expect(s.state).toBe('offline');
        expect(s.message).toBeTruthy();
        expect(listener).toHaveBeenCalled();
        unsub();
    });

    it('markOnline clears the banner', () => {
        backendStatusStore.markOffline('Failed to fetch');
        backendStatusStore.markOnline();
        expect(backendStatusStore.getSnapshot().state).toBe('online');
        expect(backendStatusStore.getSnapshot().message).toBeNull();
    });

    it('reportError only flips offline for backend-down signatures', () => {
        backendStatusStore.reportError(new Error('Failed to fetch'));
        expect(backendStatusStore.getSnapshot().state).toBe('offline');

        backendStatusStore.reset();
        backendStatusStore.reportError(new Error('title and projectId are required'));
        expect(backendStatusStore.getSnapshot().state).toBe('online');
    });

    it('checkConnection → online when the backend answers (even a 401)', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 401 });
        backendStatusStore.markOffline('Failed to fetch');
        const ok = await backendStatusStore.checkConnection();
        expect(ok).toBe(true);
        expect(backendStatusStore.getSnapshot().state).toBe('online');
    });

    it('checkConnection → stays offline when fetch throws', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Failed to fetch'));
        const ok = await backendStatusStore.checkConnection();
        expect(ok).toBe(false);
        expect(backendStatusStore.getSnapshot().state).toBe('offline');
    });

    it('getServerSnapshot is always online (SSR-safe)', () => {
        backendStatusStore.markOffline('Failed to fetch');
        expect(backendStatusStore.getServerSnapshot().state).toBe('online');
    });
});
