/**
 * Backend API client for the Workspace widget — METADATA layer only.
 *
 * All endpoints are under /api/workspace (see Docs/backend-workspace-routes.ts).
 * Per the Cycle 2 plan §6 + Cycle 3 contract (D1–D3), Workspace REUSES the
 * file-explorer 3-tier backend for folder STRUCTURE (Domaine/Project/Thread are
 * derived from `GET /api/file-explorer/tree`) and folder CRUD. This client adds
 * only the metadata surface the raw filesystem can't express:
 *   - Domaine color / description / position  (`.domaine.json` sidecar)
 *   - Thread status / stage / counts / honcho  (`.thread.json` sidecar)
 *
 * Cycle 4 (this file): client surface defined; SSR-safe (no module-eval fetch).
 *   NOT yet consumed by any store/view — the drill-down store (workspaceStore.ts)
 *   stays fetch-free this cycle. Cycle 5 wires `fetchDomaines()` into the index view.
 *
 * Mirrors fileExplorerApi.ts: API_BASE + getAuthHeaders(), { success, data } envelope.
 */
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/UserContext';

/**
 * Domaine metadata — folder name is the canonical id (rename via file-explorer);
 * color/description/position come from the `.domaine.json` sidecar.
 * Client mirror of the DomaineMeta shape in Docs/backend-workspace-routes.ts.
 */
export interface DomaineMeta {
    /** Folder name — canonical id of the domaine. */
    name: string;
    /** Relative path from the user root (depth-1 folder name). */
    path: string;
    description: string;
    color: string;
    position: number;
}

/**
 * Thread metadata stored in the `.thread.json` sidecar. `name`/`projectName`
 * are derived from the path server-side and never accepted on write.
 * Client mirror of the ThreadMeta shape in Docs/backend-workspace-routes.ts.
 */
export interface ThreadMeta {
    name: string;
    projectName: string;
    createdAt: string;
    lastModified: string;
    status: 'active' | 'complete';
    stage: string | null;
    continuedFrom: string | null;
    inheritedContext: string | null;
    honchoSessionId: string | null;
    compressionCount: number;
    dumpCount: number;
    reportCount: number;
    lastDreamQuery: string | null;
    intakePromptShown: boolean;
}

/** Fields the client may upsert on a domaine sidecar (never the folder name). */
export type DomainePatch = Partial<Pick<DomaineMeta, 'color' | 'description' | 'position'>>;

/** Fields the client may upsert on a thread sidecar (whitelist mirrors the route). */
export type ThreadMetaPatch = Partial<Omit<ThreadMeta, 'name' | 'projectName' | 'createdAt' | 'lastModified'>>;

async function call<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}/api/workspace${path}`, {
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

/** GET /domaines → DomaineMeta for every depth-1 folder (sorted by position). */
export async function fetchDomaines(): Promise<DomaineMeta[]> {
    const data = await call<{ data: DomaineMeta[] }>('/domaines');
    return Array.isArray(data.data) ? data.data : [];
}

/** PUT /domaine — upsert a domaine sidecar (color/description/position). */
export async function putDomaine(domainePath: string, patch: DomainePatch): Promise<DomainePatch> {
    const data = await call<{ data: DomainePatch }>('/domaine', {
        method: 'PUT',
        body: JSON.stringify({ path: domainePath, ...patch }),
    });
    return data.data ?? {};
}

/** GET /thread-meta?path=… → ThreadMeta (server supplies defaults if no sidecar). */
export async function fetchThreadMeta(threadPath: string): Promise<ThreadMeta> {
    const data = await call<{ data: ThreadMeta }>(`/thread-meta?path=${encodeURIComponent(threadPath)}`);
    return data.data;
}

/** PUT /thread-meta — upsert a thread sidecar (whitelisted fields only). */
export async function putThreadMeta(threadPath: string, patch: ThreadMetaPatch): Promise<Partial<ThreadMeta>> {
    const data = await call<{ data: Partial<ThreadMeta> }>('/thread-meta', {
        method: 'PUT',
        body: JSON.stringify({ path: threadPath, ...patch }),
    });
    return data.data ?? {};
}
