/**
 * ingestionHandleStore — per-user IndexedDB persistence of picked directory handles.
 *
 * Resolves DECISION D-2 (see ingestionStore.ts): a `FileSystemDirectoryHandle`
 * is NOT JSON-serializable (so it can't live in localStorage), but it IS
 * structured-cloneable, so IndexedDB can persist it across reloads. We store the
 * source + backup handles keyed by `<userId>:source` / `<userId>:backup`, mirroring
 * the per-user namespacing of ingestionStore. On the next session the handle is
 * restored and re-validated via queryPermission(); a single requestPermission()
 * re-grant (user gesture) replaces the full folder re-pick.
 *
 * SSR safety: every `indexedDB` access lives inside a function body and is guarded
 * by `idbAvailable()`. Nothing touches `indexedDB` at module-eval time, and on the
 * server (or jsdom, which lacks IndexedDB) every call degrades to a null / no-op.
 */
import type { FsDirectoryHandle } from './fsAccess';

const DB_NAME = 'dwellium-scribe-ingestion';
const STORE = 'handles';
const DB_VERSION = 1;

export type IngestionHandleKind = 'source' | 'backup';

function idbAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function keyFor(uid: string | null, kind: IngestionHandleKind): string {
    return `${uid ?? '_anonymous'}:${kind}`;
}

function openDb(): Promise<IDBDatabase | null> {
    if (!idbAvailable()) return Promise.resolve(null);
    return new Promise((resolve) => {
        let req: IDBOpenDBRequest;
        try {
            req = indexedDB.open(DB_NAME, DB_VERSION);
        } catch {
            resolve(null);
            return;
        }
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
    });
}

/** Persist a picked directory handle for this user. No-op without IndexedDB. */
export async function saveIngestionHandle(
    uid: string | null,
    kind: IngestionHandleKind,
    handle: FsDirectoryHandle,
): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(handle, keyFor(uid, kind));
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
    db.close();
}

/** Load a previously-picked directory handle for this user, or null. */
export async function loadIngestionHandle(
    uid: string | null,
    kind: IngestionHandleKind,
): Promise<FsDirectoryHandle | null> {
    const db = await openDb();
    if (!db) return null;
    const result = await new Promise<FsDirectoryHandle | null>((resolve) => {
        try {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(keyFor(uid, kind));
            req.onsuccess = () => resolve((req.result as FsDirectoryHandle | undefined) ?? null);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    db.close();
    return result;
}

/** Delete both persisted handles for this user (used by the full reset). */
export async function deleteIngestionHandles(uid: string | null): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            store.delete(keyFor(uid, 'source'));
            store.delete(keyFor(uid, 'backup'));
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
    db.close();
}
