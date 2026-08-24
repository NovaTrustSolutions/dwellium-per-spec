/**
 * designApi — thin client for the plan-053 Penpot backend proxy (/api/design).
 *
 * The backend answers 503 `{ needsSetup: true }` while PENPOT_ACCESS_TOKEN is
 * unset, so callers key a "needs setup" UI on the typed result — same shape as
 * shortLinksApi.ts. The token never reaches the browser. Upstream surface is
 * Penpot's documented RPC API (get-teams / get-projects / get-project-files /
 * export-binfile — https://design.penpot.app/api/main/doc); export downloads
 * the portable `.penpot` binary.
 */
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';

export interface DesignProject {
    id: string;
    name: string;
    teamId: string;
    teamName: string;
}

export interface DesignFile {
    id: string;
    name: string;
    modifiedAt: string | null;
}

export type DesignResult<T> =
    | { kind: 'ok'; data: T }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string };

/** Authenticated fetch — attaches the session token (esignApi.ts pattern). */
function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = getAuthToken();
    const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...init, headers });
}

export async function listDesignProjects(): Promise<DesignResult<DesignProject[]>> {
    try {
        const res = await authFetch(`${API_BASE}/api/design/projects`);
        if (res.status === 503) return { kind: 'needs-setup' };
        if (!res.ok) return { kind: 'error', message: `Backend answered ${res.status}` };
        const body = await res.json().catch(() => null);
        return { kind: 'ok', data: Array.isArray(body?.data) ? body.data : [] };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

export async function listDesignFiles(projectId: string): Promise<DesignResult<DesignFile[]>> {
    try {
        const res = await authFetch(`${API_BASE}/api/design/projects/${encodeURIComponent(projectId)}/files`);
        if (res.status === 503) return { kind: 'needs-setup' };
        if (!res.ok) return { kind: 'error', message: `Backend answered ${res.status}` };
        const body = await res.json().catch(() => null);
        return { kind: 'ok', data: Array.isArray(body?.data) ? body.data : [] };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

/** Download a file's portable `.penpot` binary via the proxy (auth header ⇒ fetch+blob, not a bare href). */
export async function exportDesignFile(fileId: string): Promise<DesignResult<Blob>> {
    try {
        const res = await authFetch(`${API_BASE}/api/design/files/${encodeURIComponent(fileId)}/export`);
        if (res.status === 503) return { kind: 'needs-setup' };
        if (!res.ok) return { kind: 'error', message: `Backend answered ${res.status}` };
        return { kind: 'ok', data: await res.blob() };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

/** The full client, bundled so the widget can take it as an injectable prop in tests. */
export const designApi = { listDesignProjects, listDesignFiles, exportDesignFile };
export type DesignApi = typeof designApi;
