/**
 * ingestionApi — typed client for the `/api/ingest/*` backend-watcher contract
 * (Cycle 2). The full route contract is documented in
 * `Docs/backend-ingest-routes.ts` (written Cycle 3).
 *
 * SCOPE: this client is the in-app surface for the ALWAYS-ON watcher daemon +
 * server-side non-html conversion (pdf/docx → md), which a browser cannot do.
 * Those routes are implemented by the sibling backend / the planned Electron
 * main process and are OUT OF SCOPE for this branch — the client is shipped so
 * the UI can call them the moment the backend lands, and degrades gracefully
 * (throws a typed error) until then.
 *
 * The client-side "Convert now" path (Cycle 5) does NOT use this client — it
 * converts browser-convertible files (html/txt/md) entirely in-browser via
 * htmlToMarkdown and the File System Access API. This client covers only the
 * parts the browser structurally cannot: a persistent watcher + server-side
 * binary-format conversion.
 *
 * Mirrors fileExplorerApi.ts: API_BASE + getAuthHeaders(), { success, data }
 * envelope, single `call<T>` helper. SSR-safe: no module-eval fetch.
 */
import { API_BASE } from '../../../config';
import { getAuthHeaders } from '../../../context/UserContext';

/** A folder registered with the backend watcher daemon. */
export interface WatchedFolder {
    /** Server-assigned id for the registration. */
    id: string;
    /** Absolute path on the machine running the backend/Electron process. */
    sourcePath: string;
    /** Absolute path where converted .md files are written. */
    destPath: string;
    /** Optional human label. */
    label?: string;
    /** ISO timestamp the folder was registered. */
    registeredAt: string;
}

/** Snapshot of the watcher daemon's state. */
export interface IngestStatus {
    /** Folders currently under watch. */
    watching: WatchedFolder[];
    /** ISO timestamp of the last conversion pass, or null if none yet. */
    lastRunAt: string | null;
    /** Number of files awaiting server-side conversion. */
    queueDepth: number;
}

/** One server-converted file (binary formats the browser can't handle). */
export interface BackendConvertedFile {
    sourcePath: string;
    destPath: string;
    /** Detected source format, e.g. "pdf" | "docx" | "rtf". */
    format: string;
    /** Byte size of the produced markdown. */
    bytes: number;
    convertedAt: string;
}

async function call<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}/api/ingest${path}`, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...(opts.headers ?? {}),
        },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data as T;
}

/** POST /ingest/watch — register a source→dest folder pair with the daemon. */
export async function registerWatch(
    sourcePath: string,
    destPath: string,
    label?: string,
): Promise<WatchedFolder> {
    const data = await call<{ data: WatchedFolder }>('/watch', {
        method: 'POST',
        body: JSON.stringify({ sourcePath, destPath, label }),
    });
    return data.data;
}

/** GET /ingest/status — current watcher state. */
export async function fetchIngestStatus(): Promise<IngestStatus> {
    const data = await call<{ data: IngestStatus }>('/status');
    return data.data;
}

/** POST /ingest/convert — server-side convert a single non-html file → markdown. */
export async function convertOnBackend(sourcePath: string, destPath: string): Promise<BackendConvertedFile> {
    const data = await call<{ data: BackendConvertedFile }>('/convert', {
        method: 'POST',
        body: JSON.stringify({ sourcePath, destPath }),
    });
    return data.data;
}

/** GET /ingest/converted — list files the backend has converted. */
export async function fetchBackendConverted(): Promise<BackendConvertedFile[]> {
    const data = await call<{ data: BackendConvertedFile[] }>('/converted');
    return Array.isArray(data.data) ? data.data : [];
}
