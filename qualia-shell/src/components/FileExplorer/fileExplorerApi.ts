/**
 * Backend API client for the FileExplorer widget.
 * All endpoints are under /api/file-explorer. Source of truth is the backend repo's
 * src/routes/fileExplorerRoutes.ts on backend/ship (the Docs/ copy is stale).
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
        throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data.code);
    }
    return data as T;
}

/** An /api/file-explorer failure; `code` is the backend's machine code (DEST_EXISTS, HIDDEN_PATH, TOO_LARGE, BINARY). */
export class ApiError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

/** True when the backend refused because the destination is taken (409). */
export function isConflict(err: unknown): boolean {
    return err instanceof ApiError && err.status === 409;
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

/** Soft delete: the backend moves the entry into the user's hidden .trash (backend PR #6). */
export async function deleteEntry(path: string): Promise<{ trashedTo?: string }> {
    const data = await call<{ trashedTo?: string }>('/entry', { method: 'DELETE', body: JSON.stringify({ path }) });
    return { trashedTo: data.trashedTo };
}

/** One soft-deleted entry in the user's hidden .trash (plan 076 P3). */
export interface TrashItem {
    id: string;
    path: string;
    name: string;
    isDir: boolean;
    deletedAt: string | null;
    size?: number;
}

export async function listTrash(): Promise<TrashItem[]> {
    const data = await call<{ data: TrashItem[] }>('/trash');
    return Array.isArray(data.data) ? data.data : [];
}

/** Put a trashed entry back at its original path, or at `as`. 409 (isConflict) if that path is taken. */
export async function restoreFromTrash(id: string, as?: string): Promise<{ path: string }> {
    return call<{ path: string }>('/trash/restore', { method: 'POST', body: JSON.stringify(as ? { id, as } : { id }) });
}

/** Permanently delete one trashed entry (user-initiated only). */
export async function deleteFromTrash(id: string): Promise<void> {
    await call(`/trash/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Permanently delete everything in the trash (user-initiated only; the UI asks for a typed confirm). */
export async function emptyTrash(): Promise<{ removed: number }> {
    return call<{ removed: number }>('/trash', { method: 'DELETE', body: JSON.stringify({ confirm: 'EMPTY' }) });
}
