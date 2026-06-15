/**
 * fsAccess — minimal, SSR-safe File System Access API surface for Scribe ingestion.
 *
 * The TS DOM lib at this version ships `FileSystemDirectoryHandle` WITHOUT the
 * async-iteration members (`values()`/`entries()`/`keys()`) and does NOT declare
 * `window.showDirectoryPicker`. We declare exactly the slice we use here so the
 * rest of the ingestion code (Cycles 4-5) stays strongly typed without a global
 * lib bump.
 *
 * SSR safety (CRITICAL — smoke test enforces): every `window` access lives
 * INSIDE a function body (event-handler / effect contexts only). Nothing touches
 * `window` at module-eval time, so this module imports cleanly during server
 * render. Callers must invoke `pickDirectory` from a user gesture (onClick) —
 * browsers reject programmatic `showDirectoryPicker` calls.
 */

/** Permission states returned by the File System Access permission API. */
export type FsPermissionState = 'granted' | 'denied' | 'prompt';

/** The async-iterable directory handle slice we rely on (superset of lib.dom's). */
export interface FsDirectoryHandle {
    readonly kind: 'directory';
    readonly name: string;
    /** Async-iterate child handles (files + sub-directories). */
    values(): AsyncIterableIterator<FsHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirectoryHandle>;
    /**
     * Permission query/request (File System Access API; not in the TS DOM slice).
     * Optional — older implementations omit them, in which case callers treat the
     * handle as usable ('granted'). Used to re-validate handles restored from
     * IndexedDB across sessions (see ingestionHandleStore).
     */
    queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<FsPermissionState>;
    requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<FsPermissionState>;
}

export interface FsFileHandle {
    readonly kind: 'file';
    readonly name: string;
    getFile(): Promise<File>;
    /** Open a writable stream — used by the Cycle-5 backup-write path. */
    createWritable(): Promise<FsWritableStream>;
}

export type FsHandle = FsDirectoryHandle | FsFileHandle;

export interface FsWritableStream {
    write(data: string | BufferSource | Blob): Promise<void>;
    close(): Promise<void>;
}

interface ShowDirectoryPickerWindow {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite'; id?: string }): Promise<FsDirectoryHandle>;
}

/** True when the running browser exposes the directory picker. SSR-safe (no throw). */
export function isFsAccessSupported(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof (window as unknown as Partial<ShowDirectoryPickerWindow>).showDirectoryPicker === 'function'
    );
}

/**
 * Open the OS directory picker and return the chosen handle, or `null` when the
 * user cancels (AbortError) or the API is unavailable. MUST be called from a
 * user gesture (onClick).
 *
 *  - `mode: 'read'`      → source folder (enumerate + read files)
 *  - `mode: 'readwrite'` → backup destination (write converted .md files)
 */
export async function pickDirectory(mode: 'read' | 'readwrite' = 'read'): Promise<FsDirectoryHandle | null> {
    if (!isFsAccessSupported()) return null;
    try {
        const w = window as unknown as ShowDirectoryPickerWindow;
        return await w.showDirectoryPicker({ mode });
    } catch (err) {
        // User-cancel surfaces as AbortError — treat as a no-op, not a failure.
        if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') return null;
        throw err;
    }
}

/**
 * Query a restored handle's current permission WITHOUT prompting. SSR-safe; never
 * throws. Returns 'granted' when the permission API is absent (older browsers
 * that nonetheless hand back a usable handle).
 */
export async function queryDirectoryPermission(
    handle: FsDirectoryHandle,
    mode: 'read' | 'readwrite',
): Promise<FsPermissionState> {
    if (typeof handle.queryPermission !== 'function') return 'granted';
    try {
        return await handle.queryPermission({ mode });
    } catch {
        return 'denied';
    }
}

/**
 * Request permission for a restored handle. MUST be called from a user gesture
 * (the "Reconnect" button) — browsers reject programmatic requestPermission.
 */
export async function requestDirectoryPermission(
    handle: FsDirectoryHandle,
    mode: 'read' | 'readwrite',
): Promise<FsPermissionState> {
    if (typeof handle.requestPermission !== 'function') return 'granted';
    try {
        return await handle.requestPermission({ mode });
    } catch {
        return 'denied';
    }
}
