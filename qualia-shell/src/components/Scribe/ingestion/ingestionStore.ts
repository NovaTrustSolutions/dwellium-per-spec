/**
 * ingestionStore — per-user Scribe ingestion state (Cycle 2 storage layer).
 *
 * Backs the Scribe folder-picker → convert → backup-write pipeline (Cycle 4-5).
 * Each user (Andy ≠ Lisa) has their own picked-folder metadata + converted-file
 * index, loaded on login and persisted across logout. Sister-shape to
 * fileExplorerStore / honchoDreamStore (Phase-8+ Task 8.10 Option β dynamic-key
 * createLocalStorageStore).
 *
 * SSR safety: NO localStorage / window access at module-eval time. localStorage
 * is touched only inside getSnapshot() (client-only via useSyncExternalStore) and
 * inside set()'s persist callback (event-handler / effect contexts only).
 *
 * METADATA-ONLY persistence (DECISION D-2): the live
 * `FileSystemDirectoryHandle` is NOT serialized to localStorage — handles are
 * not reliably JSON-persistable across reloads in all browsers. We persist the
 * folder NAME + last-sync time + converted-file index only; the live handle is
 * held in module/component memory (see ingestionHandles below) and a re-pick is
 * required after reload. Reversal path: IndexedDB handle persistence +
 * queryPermission() re-grant flow in a follow-up (logged D-2).
 *
 * Storage key:  scribe-ingestion:<userId>
 */
import { createLocalStorageStore } from '../../../utils/createLocalStorageStore';
import { deleteIngestionHandles } from './ingestionHandleStore';

/**
 * Per-file conversion outcome recorded in the index after a "Convert now" run.
 *  - 'converted'      → html/txt → markdown produced client-side and written to dest
 *  - 'passthrough'    → already .md/.markdown, copied verbatim to dest
 *  - 'queued-backend' → pdf/docx/etc. — NOT browser-convertible; needs /api/ingest/convert
 *  - 'error'          → read/convert/write failed (note carries the reason)
 */
export type IngestFileStatus = 'converted' | 'passthrough' | 'queued-backend' | 'error';

export interface ConvertedFileEntry {
    /** File name in the source folder (e.g. "notes.html"). */
    sourceName: string;
    /** File name written to the backup destination (e.g. "notes.md"), or null when queued/errored. */
    destName: string | null;
    status: IngestFileStatus;
    /** Source file size in bytes when known (0 if unknown). */
    bytes: number;
    /** ISO timestamp of when this entry was recorded. */
    convertedAt: string;
    /** Human-readable note — reason for queued-backend / error, else undefined. */
    note?: string;
}

export interface IngestionState {
    /** Picked source-folder name (metadata only — live handle in memory; D-2). */
    sourceFolderName: string | null;
    /** Picked backup-destination folder name (metadata only). */
    backupFolderName: string | null;
    /** ISO timestamp of the last completed "Convert now" run, or null. */
    lastSyncAt: string | null;
    /** Converted-file index — most-recent run's per-file outcomes (newest first). */
    converted: ConvertedFileEntry[];
}

export const DEFAULT_STATE: IngestionState = {
    sourceFolderName: null,
    backupFolderName: null,
    lastSyncAt: null,
    converted: [],
};

/**
 * Live `FileSystemDirectoryHandle` refs — module-memory only, NOT persisted
 * (D-2). Populated by the picker onClick handlers (Cycle 4) and read by the
 * "Convert now" handler (Cycle 5). Cleared on logout / reset. `unknown` typed
 * here so this store file carries no DOM-lib dependency; the UI layer narrows
 * to FileSystemDirectoryHandle at the call site (event-handler-gated, SSR-safe).
 */
export const ingestionHandles: { source: unknown | null; backup: unknown | null } = {
    source: null,
    backup: null,
};

/**
 * Handles restored from IndexedDB but awaiting a permission re-grant (a user
 * gesture). The "Reconnect" button promotes a pending handle into
 * `ingestionHandles` once requestPermission() resolves 'granted'. Module-memory
 * only — successor to D-2 (the durable copy lives in IndexedDB via
 * ingestionHandleStore).
 */
export const pendingHandles: { source: unknown | null; backup: unknown | null } = {
    source: null,
    backup: null,
};

export const ingestionUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = ingestionUserIdHolder.current;
    return uid ? `scribe-ingestion:${uid}` : 'scribe-ingestion:_anonymous';
}

function normalizeEntry(raw: unknown): ConvertedFileEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.sourceName !== 'string') return null;
    const status: IngestFileStatus =
        o.status === 'passthrough' || o.status === 'queued-backend' || o.status === 'error'
            ? o.status
            : 'converted';
    return {
        sourceName: o.sourceName,
        destName: typeof o.destName === 'string' ? o.destName : null,
        status,
        bytes: typeof o.bytes === 'number' && o.bytes >= 0 ? o.bytes : 0,
        convertedAt: typeof o.convertedAt === 'string' ? o.convertedAt : '',
        note: typeof o.note === 'string' ? o.note : undefined,
    };
}

function normalize(raw: unknown): IngestionState {
    if (!raw || typeof raw !== 'object') return DEFAULT_STATE;
    const o = raw as Record<string, unknown>;
    return {
        sourceFolderName: typeof o.sourceFolderName === 'string' ? o.sourceFolderName : null,
        backupFolderName: typeof o.backupFolderName === 'string' ? o.backupFolderName : null,
        lastSyncAt: typeof o.lastSyncAt === 'string' ? o.lastSyncAt : null,
        converted: Array.isArray(o.converted)
            ? (o.converted as unknown[]).map(normalizeEntry).filter((e): e is ConvertedFileEntry => e !== null)
            : [],
    };
}

export const ingestionStore = createLocalStorageStore<IngestionState>({
    key: resolveKey,
    deserializer: (raw) => {
        if (!raw) return DEFAULT_STATE;
        try { return normalize(JSON.parse(raw)); } catch { return DEFAULT_STATE; }
    },
    defaultValue: DEFAULT_STATE,
});

function persist(next: IngestionState): void {
    ingestionStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Merge a partial patch into the current state and persist. */
export function saveIngestion(patch: Partial<IngestionState>): void {
    const prev = ingestionStore.getSnapshot();
    persist({ ...prev, ...patch });
}

/**
 * Replace the converted-file index with a fresh run's results and stamp
 * `lastSyncAt`. Called at the end of a "Convert now" pass (Cycle 5). The
 * timestamp is passed in (not computed here) so callers control the clock and
 * tests stay deterministic.
 */
export function setConvertedIndex(entries: ConvertedFileEntry[], syncedAt: string): void {
    const prev = ingestionStore.getSnapshot();
    persist({ ...prev, converted: entries, lastSyncAt: syncedAt });
}

/** Prepend a single entry to the index (incremental record during a run). */
export function recordConverted(entry: ConvertedFileEntry): void {
    const prev = ingestionStore.getSnapshot();
    persist({ ...prev, converted: [entry, ...prev.converted] });
}

/** Clear the converted index only (keep picked-folder metadata). */
export function clearConvertedIndex(): void {
    const prev = ingestionStore.getSnapshot();
    persist({ ...prev, converted: [], lastSyncAt: null });
}

/** Full reset — wipe persisted state, the in-memory handles, AND the durable
 *  IndexedDB handles for the current user (e.g. an explicit "forget folders"). */
export function clearIngestion(): void {
    ingestionHandles.source = null;
    ingestionHandles.backup = null;
    pendingHandles.source = null;
    pendingHandles.backup = null;
    void deleteIngestionHandles(ingestionUserIdHolder.current);
    ingestionStore.set(DEFAULT_STATE, () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}
