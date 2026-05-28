/**
 * Backend API client for the FileExplorer widget.
 * All endpoints are under /api/file-explorer (see Docs/backend-file-explorer-routes.ts).
 * Each call carries the user's session token via getAuthHeaders().
 */
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/UserContext';
import type { FileEntry } from './FileExplorerCell';

async function call<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}/api/file-explorer${path}`, {
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

export async function fetchTree(): Promise<FileEntry[]> {
    const data = await call<{ data: FileEntry[] }>('/tree');
    return Array.isArray(data.data) ? data.data : [];
}

export async function mkdir(path: string): Promise<void> {
    await call('/mkdir', { method: 'POST', body: JSON.stringify({ path }) });
}

export async function touch(path: string, content = ''): Promise<void> {
    await call('/touch', { method: 'POST', body: JSON.stringify({ path, content }) });
}

export async function readFile(path: string): Promise<{ content: string; size: number; modified: string }> {
    const data = await call<{ content: string; size: number; modified: string }>(`/read?path=${encodeURIComponent(path)}`);
    return { content: data.content, size: data.size, modified: data.modified };
}

export async function rename(fromPath: string, toName: string): Promise<{ fromPath: string; toPath: string }> {
    return call<{ fromPath: string; toPath: string }>('/rename', {
        method: 'POST',
        body: JSON.stringify({ fromPath, toName }),
    });
}

export async function move(fromPath: string, toPath: string, copy = false): Promise<void> {
    await call('/move', { method: 'POST', body: JSON.stringify({ fromPath, toPath, copy }) });
}

export async function deleteEntry(path: string): Promise<void> {
    await call('/entry', { method: 'DELETE', body: JSON.stringify({ path }) });
}
