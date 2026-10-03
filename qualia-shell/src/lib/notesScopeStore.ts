/**
 * notesScopeStore — plan 070: god-only "Show other users' notes" toggle.
 *
 * Per-USER + One Save synced (sister of stellaPrefsStore.ts): a god account's
 * choice to read/edit/delete every user's notes follows them across devices.
 * Non-god users never see the toggle and the param helper below always
 * evaluates to '' for them, regardless of what's in storage.
 *
 * Storage: dynamic-key `createLocalStorageStore` (`dwellium-notes-scope:<userId>`)
 * + `withSync('notesScope')`.
 */
import { useContext } from 'react';
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { notesScopeUserIdHolder } from './perUserIdentity';
import { UserContext } from '../context/UserContext';

export interface NotesScopePrefs {
    readOthers: boolean;
}

export const DEFAULT_NOTES_SCOPE: NotesScopePrefs = {
    readOthers: false,
};

const KEY_PREFIX = 'dwellium-notes-scope';

function resolveKey(): string {
    const uid = notesScopeUserIdHolder.current;
    return uid ? `${KEY_PREFIX}:${uid}` : `${KEY_PREFIX}:_anonymous`;
}

function normalize(raw: unknown): NotesScopePrefs {
    const saved: Partial<NotesScopePrefs> = raw && typeof raw === 'object' ? (raw as Partial<NotesScopePrefs>) : {};
    return { readOthers: saved.readOthers === true };
}

function deserialize(raw: string | null): NotesScopePrefs {
    if (!raw) return normalize(null);
    try { return normalize(JSON.parse(raw)); } catch { return normalize(null); }
}

const syncedStore = withSync(
    createLocalStorageStore<NotesScopePrefs>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: { ...DEFAULT_NOTES_SCOPE },
    }),
    { objectType: 'notesScope', holder: notesScopeUserIdHolder, resolveKey },
);

function persist(next: NotesScopePrefs): void {
    syncedStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export const notesScopeStore = {
    subscribe(l: () => void): () => void { return syncedStore.subscribe(l); },
    getSnapshot(): NotesScopePrefs { return syncedStore.getSnapshot(); },
    getServerSnapshot(): NotesScopePrefs { return DEFAULT_NOTES_SCOPE; },
    setReadOthers(value: boolean): void {
        persist(normalize({ ...syncedStore.getSnapshot(), readOthers: value }));
    },
    reset(): void {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
        syncedStore.reset();
    },
};

/**
 * `'scope=all'` iff the caller is `god` AND has the toggle on; otherwise `''`
 * — a non-god `readOthers: true` (shouldn't happen, but storage can't be
 * trusted) is silently ignored, never honoured.
 */
export function notesScopeParam(role: string | null | undefined, readOthers: boolean): string {
    return role === 'god' && readOthers ? 'scope=all' : '';
}

/**
 * Reads the active user's role (raw `UserContext`, not `useUser()` — degrades
 * to `''` outside a provider instead of throwing) + the store, and returns
 * the ready-to-append query param.
 */
export function useNotesScopeParam(): string {
    const userCtx = useContext(UserContext);
    notesScopeUserIdHolder.current = userCtx?.user?.id ?? null;
    const prefs = useSyncExternalStore(notesScopeStore.subscribe, notesScopeStore.getSnapshot, notesScopeStore.getServerSnapshot);
    return notesScopeParam(userCtx?.user?.role ?? null, prefs.readOthers);
}
