/**
 * useIngestion — hook for the Scribe folder-ingestion surface (Cycle 4 +
 * IndexedDB handle persistence follow-up).
 *
 * Mirrors useFileExplorer: reads UserContext directly (NOT useUser(), which
 * throws outside a provider — test/anonymous envs degrade to the `_anonymous`
 * namespace), updates the per-user holder DURING render BEFORE the
 * useSyncExternalStore read (dynamic-key cache invalidates on a fresh key), and
 * exposes event-handler-gated picker actions.
 *
 * Handle persistence: picked directory handles are saved to IndexedDB per user
 * (ingestionHandleStore) and restored when the logged-in user changes. A restored
 * handle whose permission is still 'granted' is used immediately; one that needs a
 * re-grant is parked in `pendingHandles` and surfaced via `needsReconnect*` so a
 * single "Reconnect" click (requestPermission, user gesture) restores access —
 * no full folder re-pick.
 *
 * SSR safety: picker + permission calls touch `window`/`indexedDB` only inside
 * effects and onClick callbacks; `supported` derives from the SSR-safe
 * `isFsAccessSupported()`. The restore effect is client-only (useEffect).
 */
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { UserContext } from '../../../context/UserContext';
import {
    ingestionStore,
    ingestionUserIdHolder,
    ingestionHandles,
    pendingHandles,
    saveIngestion,
    setConvertedIndex,
    type IngestionState,
} from './ingestionStore';
import {
    pickDirectory,
    isFsAccessSupported,
    queryDirectoryPermission,
    requestDirectoryPermission,
    type FsDirectoryHandle,
} from './fsAccess';
import { saveIngestionHandle, loadIngestionHandle } from './ingestionHandleStore';
import { convertFolder } from './ingestionConvert';

export interface UseIngestion extends IngestionState {
    /** Browser exposes the File System Access API. */
    supported: boolean;
    /** A live, permission-granted source handle is held in memory. */
    hasSource: boolean;
    /** A live, permission-granted backup-destination handle is held in memory. */
    hasBackup: boolean;
    /** A source folder was restored from IndexedDB but needs a permission re-grant. */
    needsReconnectSource: boolean;
    /** A backup folder was restored from IndexedDB but needs a permission re-grant. */
    needsReconnectBackup: boolean;
    /** A conversion pass is in progress. */
    converting: boolean;
    /** Error from the last conversion run, or null. */
    convertError: string | null;
    /** Open the picker for the source folder (read). Event-handler only. */
    pickSource: () => Promise<void>;
    /** Open the picker for the backup destination (readwrite). Event-handler only. */
    pickBackup: () => Promise<void>;
    /** Re-grant permission to a restored handle (user gesture). Event-handler only. */
    reconnect: (which: 'source' | 'backup') => Promise<void>;
    /** Run a "Convert now" pass over the picked folders. Event-handler only. */
    convert: () => Promise<void>;
}

export function useIngestion(): UseIngestion {
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    ingestionUserIdHolder.current = uid;

    const state = useSyncExternalStore(
        ingestionStore.subscribe,
        ingestionStore.getSnapshot,
        ingestionStore.getServerSnapshot,
    );

    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState<string | null>(null);
    // Tracks handles restored-but-awaiting-re-grant. Also doubles as the re-render
    // trigger after async handle restoration (module-level handle refs aren't reactive).
    const [needs, setNeeds] = useState<{ source: boolean; backup: boolean }>({ source: false, backup: false });

    // Restore persisted handles whenever the logged-in user changes. Resets the
    // in-memory handles first so a previous user's grants never leak across a switch.
    useEffect(() => {
        // Nothing to restore (and no React state to churn) when the File System
        // Access API is absent — this also keeps jsdom test renders act()-clean.
        if (!isFsAccessSupported()) return;
        let cancelled = false;
        // Drop the previous user's in-memory grants so nothing leaks across a switch.
        ingestionHandles.source = null;
        ingestionHandles.backup = null;
        pendingHandles.source = null;
        pendingHandles.backup = null;

        void (async () => {
            const [src, bak] = await Promise.all([
                loadIngestionHandle(uid, 'source'),
                loadIngestionHandle(uid, 'backup'),
            ]);
            if (cancelled) return;
            if (!src && !bak) {
                // No persisted folders for this user — clear any stale "needs
                // reconnect" flag from a prior user WITHOUT forcing a re-render
                // (functional updater returns the same ref to bail out).
                setNeeds((prev) => (prev.source || prev.backup ? { source: false, backup: false } : prev));
                return;
            }
            const next = { source: false, backup: false };
            if (src) {
                const perm = await queryDirectoryPermission(src, 'read');
                if (cancelled) return;
                if (perm === 'granted') ingestionHandles.source = src;
                else { pendingHandles.source = src; next.source = true; }
            }
            if (bak) {
                const perm = await queryDirectoryPermission(bak, 'readwrite');
                if (cancelled) return;
                if (perm === 'granted') ingestionHandles.backup = bak;
                else { pendingHandles.backup = bak; next.backup = true; }
            }
            if (!cancelled) setNeeds(next);
        })();

        return () => { cancelled = true; };
    }, [uid]);

    const pickSource = async (): Promise<void> => {
        const handle = await pickDirectory('read');
        if (!handle) return; // user cancelled / unsupported
        ingestionHandles.source = handle;
        pendingHandles.source = null;
        setNeeds((n) => ({ ...n, source: false }));
        // Persisting the NAME re-renders (useSyncExternalStore) → hasSource recomputes.
        saveIngestion({ sourceFolderName: handle.name });
        await saveIngestionHandle(ingestionUserIdHolder.current, 'source', handle);
    };

    const pickBackup = async (): Promise<void> => {
        const handle = await pickDirectory('readwrite');
        if (!handle) return;
        ingestionHandles.backup = handle;
        pendingHandles.backup = null;
        setNeeds((n) => ({ ...n, backup: false }));
        saveIngestion({ backupFolderName: handle.name });
        await saveIngestionHandle(ingestionUserIdHolder.current, 'backup', handle);
    };

    const reconnect = async (which: 'source' | 'backup'): Promise<void> => {
        const pending = (which === 'source' ? pendingHandles.source : pendingHandles.backup) as FsDirectoryHandle | null;
        if (!pending) return;
        const mode = which === 'source' ? 'read' : 'readwrite';
        const perm = await requestDirectoryPermission(pending, mode);
        if (perm !== 'granted') return;
        if (which === 'source') { ingestionHandles.source = pending; pendingHandles.source = null; }
        else { ingestionHandles.backup = pending; pendingHandles.backup = null; }
        setNeeds((n) => ({ ...n, [which]: false }));
    };

    const convert = async (): Promise<void> => {
        const source = ingestionHandles.source as FsDirectoryHandle | null;
        const backup = ingestionHandles.backup as FsDirectoryHandle | null;
        if (!source || !backup) {
            setConvertError('Pick both a source folder and a backup destination first.');
            return;
        }
        setConvertError(null);
        setConverting(true);
        try {
            const { entries, syncedAt } = await convertFolder({
                source,
                backup,
                now: () => new Date().toISOString(),
            });
            setConvertedIndex(entries, syncedAt);
        } catch (err) {
            setConvertError(err instanceof Error ? err.message : 'Conversion failed.');
        } finally {
            setConverting(false);
        }
    };

    return {
        ...state,
        supported: isFsAccessSupported(),
        hasSource: ingestionHandles.source !== null,
        hasBackup: ingestionHandles.backup !== null,
        needsReconnectSource: needs.source,
        needsReconnectBackup: needs.backup,
        converting,
        convertError,
        pickSource,
        pickBackup,
        reconnect,
        convert,
    };
}
