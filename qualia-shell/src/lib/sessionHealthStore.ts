/**
 * sessionHealthStore — makes a DEAD backend session impossible to miss.
 *
 * Born from the 2026-07-02 finding (see FUCKUPS.md F-016): an expired session
 * left the shell fully interactive while EVERY One Save write bounced 401 —
 * keys, workspaces, knowledge graph all silently degraded to localStorage-only,
 * and the SessionExpiredModal never surfaced. The user had zero indication
 * that nothing was being saved under their account.
 *
 * This store is deliberately NOT React context: it's a module-level external
 * store (useSyncExternalStore) so ANY layer — oneSaveClient, authFetch,
 * validateSession — can flip it without a provider, and AuthGate reacts even
 * if the context path fails. `authDead` becomes true when the backend
 * DEFINITIVELY rejects the app credential (401/403 on an authenticated call
 * while a user identity exists). It resets only on successful re-auth.
 *
 * SSR-safe: no browser globals at module scope; getServerSnapshot returns the
 * healthy default.
 */

export interface SessionHealth {
    /** Backend definitively rejected the session credential. */
    authDead: boolean;
    /** Count of One Save writes rejected for auth since the last good write. */
    rejectedWrites: number;
    /** Epoch ms of the most recent auth rejection (null = never). */
    lastRejectAt: number | null;
}

const HEALTHY: SessionHealth = { authDead: false, rejectedWrites: 0, lastRejectAt: null };

let state: SessionHealth = HEALTHY;
const listeners = new Set<() => void>();

function emit(next: SessionHealth): void {
    state = next;
    listeners.forEach((cb) => cb());
}

export const sessionHealthStore = {
    subscribe(cb: () => void): () => void {
        listeners.add(cb);
        return () => { listeners.delete(cb); };
    },
    getSnapshot(): SessionHealth {
        return state;
    },
    getServerSnapshot(): SessionHealth {
        return HEALTHY;
    },
    /** An authenticated backend call was rejected 401/403 with a user present. */
    markAuthRejected(): void {
        emit({
            authDead: true,
            rejectedWrites: state.rejectedWrites + 1,
            lastRejectAt: Date.now(),
        });
    },
    /** A successful authenticated round-trip — the session is alive. */
    markAuthOk(): void {
        if (state === HEALTHY || (!state.authDead && state.rejectedWrites === 0)) return;
        emit(HEALTHY);
    },
    /** Test escape hatch (repo convention: reset in beforeEach). */
    reset(): void {
        state = HEALTHY;
        // silent — matches createLocalStorageStore .reset() convention
    },
};
