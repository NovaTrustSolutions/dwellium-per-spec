/**
 * F-016 regression — a dead backend session must be IMPOSSIBLE to miss.
 *
 * Background: an expired session left the shell fully interactive while every
 * One Save write bounced 401; keys/workspaces/knowledge-graph silently
 * degraded to localStorage-only and no re-auth UI ever surfaced. These tests
 * pin the new contract: oneSaveClient distinguishes "auth rejected" from
 * "offline", flips sessionHealthStore, and a fresh credential heals it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN_KEY = 'dwellium-auth-token';
const REAL_TOKEN = 'a1b2c3'.repeat(16); // 96 hex chars — real-session shape

async function freshModules() {
    vi.resetModules();
    const health = await import('../lib/sessionHealthStore');
    const client = await import('../lib/oneSaveClient');
    return { sessionHealthStore: health.sessionHealthStore, oneSaveClient: client.oneSaveClient };
}

beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.stubEnv('VITE_ONE_SAVE', 'true');
});

describe('sessionHealthStore transitions', () => {
    it('starts healthy, flips on markAuthRejected, heals on markAuthOk', async () => {
        const { sessionHealthStore } = await freshModules();
        expect(sessionHealthStore.getSnapshot().authDead).toBe(false);
        sessionHealthStore.markAuthRejected();
        expect(sessionHealthStore.getSnapshot().authDead).toBe(true);
        expect(sessionHealthStore.getSnapshot().rejectedWrites).toBe(1);
        sessionHealthStore.markAuthOk();
        expect(sessionHealthStore.getSnapshot().authDead).toBe(false);
        expect(sessionHealthStore.getSnapshot().rejectedWrites).toBe(0);
    });

    it('notifies subscribers on transitions', async () => {
        const { sessionHealthStore } = await freshModules();
        const cb = vi.fn();
        sessionHealthStore.subscribe(cb);
        sessionHealthStore.markAuthRejected();
        expect(cb).toHaveBeenCalledTimes(1);
    });
});

describe('oneSaveClient auth-death detection (F-016)', () => {
    it('401 with a REAL token marks the session dead (this is NOT offline)', async () => {
        localStorage.setItem(TOKEN_KEY, REAL_TOKEN);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response('{"error":"Authentication required"}', { status: 401 }),
        ));
        const { sessionHealthStore, oneSaveClient } = await freshModules();
        await oneSaveClient.get('workspaces_user-1');
        expect(sessionHealthStore.getSnapshot().authDead).toBe(true);
    });

    it('401 with a static- dev token does NOT nag (client-side accounts are local-only by design)', async () => {
        localStorage.setItem(TOKEN_KEY, `static-${Date.now()}-architect-9a921527`);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response('{"error":"Authentication required"}', { status: 401 }),
        ));
        const { sessionHealthStore, oneSaveClient } = await freshModules();
        await oneSaveClient.get('workspaces_user-1');
        expect(sessionHealthStore.getSnapshot().authDead).toBe(false);
    });

    it('a network error stays "offline", not auth-dead', async () => {
        localStorage.setItem(TOKEN_KEY, REAL_TOKEN);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        const { sessionHealthStore, oneSaveClient } = await freshModules();
        await oneSaveClient.get('workspaces_user-1');
        expect(sessionHealthStore.getSnapshot().authDead).toBe(false);
    });

    it('a successful round-trip heals a previously dead session', async () => {
        localStorage.setItem(TOKEN_KEY, REAL_TOKEN);
        const ok = new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(new Response('{"error":"Authentication required"}', { status: 401 }))
            .mockResolvedValueOnce(ok));
        const { sessionHealthStore, oneSaveClient } = await freshModules();
        await oneSaveClient.get('a');
        expect(sessionHealthStore.getSnapshot().authDead).toBe(true);
        await oneSaveClient.get('b');
        expect(sessionHealthStore.getSnapshot().authDead).toBe(false);
    });
});
