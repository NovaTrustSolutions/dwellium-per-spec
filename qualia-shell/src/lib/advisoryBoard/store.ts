/**
 * advisoryBoardStore — per-user saved advisory-board sessions.
 *
 * Sister shape to `whiteboardStore`: `createLocalStorageStore` dynamic-key
 * store (`advisory-board:<userId>`) as the instant offline cache, wrapped in
 * `withSync` so One Save mirrors it per account when the flag is on.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../oneSaveStore';
import { advisoryBoardUserIdHolder } from '../perUserIdentity';
import type { AdvisoryBoardSession } from './types';

/** Keep the last N sessions per user; older ones drop off. */
export const SESSION_LIMIT = 20;

export const EMPTY_SESSIONS: AdvisoryBoardSession[] = [];

export function resolveAdvisoryBoardKey(): string {
    const uid = advisoryBoardUserIdHolder.current;
    return uid ? `advisory-board:${uid}` : 'advisory-board:_anonymous';
}

function deserialize(raw: string | null): AdvisoryBoardSession[] {
    if (!raw) return EMPTY_SESSIONS;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return EMPTY_SESSIONS;
        return parsed.filter((s): s is AdvisoryBoardSession =>
            !!s && typeof s === 'object' && typeof (s as AdvisoryBoardSession).id === 'string');
    } catch {
        return EMPTY_SESSIONS;
    }
}

export const advisoryBoardStore = withSync(
    createLocalStorageStore<AdvisoryBoardSession[]>({
        key: resolveAdvisoryBoardKey,
        deserializer: deserialize,
        defaultValue: EMPTY_SESSIONS,
    }),
    { objectType: 'advisory-board', holder: advisoryBoardUserIdHolder, resolveKey: resolveAdvisoryBoardKey },
);

function persist(next: AdvisoryBoardSession[]): void {
    advisoryBoardStore.set(next, () => {
        try { localStorage.setItem(resolveAdvisoryBoardKey(), JSON.stringify(next)); } catch { /* quota/sandboxed */ }
    });
}

/** Insert or replace one session (by id), newest first, capped at SESSION_LIMIT. */
export function saveSession(session: AdvisoryBoardSession): void {
    const rest = advisoryBoardStore.getSnapshot().filter((s) => s.id !== session.id);
    persist([session, ...rest].slice(0, SESSION_LIMIT));
}

/** Remove one session (user-initiated only). */
export function removeSession(id: string): void {
    persist(advisoryBoardStore.getSnapshot().filter((s) => s.id !== id));
}

/** Test/escape-hatch reset (v2.72.1 standing convention). */
export function resetAdvisoryBoard(): void {
    advisoryBoardStore.reset();
}
