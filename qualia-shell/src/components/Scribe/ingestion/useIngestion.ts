/**
 * useIngestion — hook for the Scribe folder-ingestion surface (Cycle 4).
 *
 * Mirrors useFileExplorer: reads UserContext directly (NOT useUser(), which
 * throws outside a provider — test/anonymous envs degrade to the `_anonymous`
 * namespace), updates the per-user holder DURING render BEFORE the
 * useSyncExternalStore read (dynamic-key cache invalidates on a fresh key), and
 * exposes event-handler-gated picker actions.
 *
 * SSR safety: the picker actions touch `window.showDirectoryPicker` only inside
 * onClick callbacks (via fsAccess.pickDirectory); `supported` derives from the
 * SSR-safe `isFsAccessSupported()` (returns false on the server, no throw).
 */
import { useContext, useState, useSyncExternalStore } from 'react';
import { UserContext } from '../../../context/UserContext';
import {
    ingestionStore,
    ingestionUserIdHolder,
    ingestionHandles,
    saveIngestion,
    setConvertedIndex,
    type IngestionState,
} from './ingestionStore';
import { pickDirectory, isFsAccessSupported, type FsDirectoryHandle } from './fsAccess';
import { convertFolder } from './ingestionConvert';

export interface UseIngestion extends IngestionState {
    /** Browser exposes the File System Access API. */
    supported: boolean;
    /** A live source handle is held in memory (re-pick required after reload — D-2). */
    hasSource: boolean;
    /** A live backup-destination handle is held in memory. */
    hasBackup: boolean;
    /** A conversion pass is in progress. */
    converting: boolean;
    /** Error from the last conversion run, or null. */
    convertError: string | null;
    /** Open the picker for the source folder (read). Event-handler only. */
    pickSource: () => Promise<void>;
    /** Open the picker for the backup destination (readwrite). Event-handler only. */
    pickBackup: () => Promise<void>;
    /** Run a "Convert now" pass over the picked folders. Event-handler only. */
    convert: () => Promise<void>;
}

export function useIngestion(): UseIngestion {
    const userCtx = useContext(UserContext);
    ingestionUserIdHolder.current = userCtx?.user?.id ?? null;

    const state = useSyncExternalStore(
        ingestionStore.subscribe,
        ingestionStore.getSnapshot,
        ingestionStore.getServerSnapshot,
    );

    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState<string | null>(null);

    const pickSource = async (): Promise<void> => {
        const handle = await pickDirectory('read');
        if (!handle) return; // user cancelled / unsupported
        ingestionHandles.source = handle;
        // Persisting the NAME re-renders (useSyncExternalStore) → hasSource recomputes.
        saveIngestion({ sourceFolderName: handle.name });
    };

    const pickBackup = async (): Promise<void> => {
        const handle = await pickDirectory('readwrite');
        if (!handle) return;
        ingestionHandles.backup = handle;
        saveIngestion({ backupFolderName: handle.name });
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
        converting,
        convertError,
        pickSource,
        pickBackup,
        convert,
    };
}
