/**
 * photoVaultApi — thin client for the plan-053 Immich backend proxy (/api/photos/*).
 *
 * The backend answers 503 `needsSetup:true` while its IMMICH_URL/IMMICH_API_KEY
 * env is unset (Immich not stood up on the office Mac yet), so callers key a
 * "needs setup" UI on the typed result instead of throwing — never a crash.
 * Same authFetch shape as ESign/esignApi.ts; the Immich API key never reaches
 * the browser.
 */
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';

export interface PhotoAlbum {
    id: string;
    albumName: string;
    description?: string;
    assetCount?: number;
    albumThumbnailAssetId?: string | null;
    shared?: boolean;
}

export interface PhotoAsset {
    id: string;
    originalFileName?: string;
    type?: string;
    fileCreatedAt?: string;
}

export interface PhotoAlbumDetail extends PhotoAlbum {
    assets?: PhotoAsset[];
}

export interface PhotoSharedLink {
    id: string;
    key?: string;
    slug?: string;
    type?: string;
    expiresAt?: string | null;
    shareUrl?: string | null;
    album?: { id: string; albumName: string } | null;
}

export type PhotosResult<T> =
    | { kind: 'ok'; data: T }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string };

/** Album naming convention (plan 053): one album per unit, "<Property> — <Unit>". */
export function albumNameFor(property: string, unit?: string | null): string {
    const p = String(property || '').trim();
    const u = String(unit || '').trim();
    return u ? `${p} — ${u}` : p;
}

/** Inverse of albumNameFor — groups the Albums tab by property. */
export function parseAlbumName(albumName: string): { property: string; unit?: string } {
    const idx = albumName.indexOf(' — ');
    if (idx < 0) return { property: albumName };
    return { property: albumName.slice(0, idx), unit: albumName.slice(idx + 3) };
}

/** Authenticated fetch — attaches the session token (esignApi.ts pattern). */
function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = getAuthToken();
    const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (init?.body && typeof init.body === 'string' && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...init, headers });
}

async function toResult<T>(work: () => Promise<Response>, pick: (body: unknown) => T): Promise<PhotosResult<T>> {
    try {
        const res = await work();
        if (res.status === 503) return { kind: 'needs-setup' };
        const body = await res.json().catch(() => null);
        if (!res.ok) return { kind: 'error', message: (body as { error?: string } | null)?.error || `Backend answered ${res.status}` };
        return { kind: 'ok', data: pick(body) };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

export function listAlbums(): Promise<PhotosResult<PhotoAlbum[]>> {
    return toResult(
        () => authFetch(`${API_BASE}/api/photos/albums`),
        body => (Array.isArray((body as { data?: unknown })?.data) ? (body as { data: PhotoAlbum[] }).data : []),
    );
}

export function getAlbum(id: string): Promise<PhotosResult<PhotoAlbumDetail>> {
    return toResult(
        () => authFetch(`${API_BASE}/api/photos/albums/${encodeURIComponent(id)}`),
        body => ((body as { data?: PhotoAlbumDetail })?.data ?? { id, albumName: '' }),
    );
}

/** Find-or-create the "<Property> — <Unit>" album (backend enforces the convention). */
export function ensureAlbum(property: string, unit?: string): Promise<PhotosResult<PhotoAlbum>> {
    return toResult(
        () => authFetch(`${API_BASE}/api/photos/albums/ensure`, { method: 'POST', body: JSON.stringify({ property, unit }) }),
        body => ((body as { data?: PhotoAlbum })?.data ?? { id: '', albumName: '' }),
    );
}

/** Browser → proxy → Immich upload (multipart field `assetData`; albumId adds the asset to that album). */
export function uploadAsset(file: File, albumId?: string): Promise<PhotosResult<{ id: string }>> {
    const form = new FormData();
    form.append('assetData', file, file.name);
    if (file.lastModified) {
        form.append('fileCreatedAt', new Date(file.lastModified).toISOString());
        form.append('fileModifiedAt', new Date(file.lastModified).toISOString());
    }
    const qs = albumId ? `?albumId=${encodeURIComponent(albumId)}` : '';
    return toResult(
        () => authFetch(`${API_BASE}/api/photos/assets${qs}`, { method: 'POST', body: form }),
        body => ((body as { data?: { id: string } })?.data ?? { id: '' }),
    );
}

/** Smart (CLIP) search when the ML container runs; the backend falls back to metadata search otherwise. */
export function searchPhotos(query: string): Promise<PhotosResult<{ mode: string; assets: PhotoAsset[] }>> {
    return toResult(
        () => authFetch(`${API_BASE}/api/photos/search`, { method: 'POST', body: JSON.stringify({ query }) }),
        body => ({
            mode: String((body as { mode?: string })?.mode || 'metadata'),
            assets: Array.isArray((body as { data?: unknown })?.data) ? (body as { data: PhotoAsset[] }).data : [],
        }),
    );
}

export function listSharedLinks(): Promise<PhotosResult<PhotoSharedLink[]>> {
    return toResult(
        () => authFetch(`${API_BASE}/api/photos/shared-links`),
        body => (Array.isArray((body as { data?: unknown })?.data) ? (body as { data: PhotoSharedLink[] }).data : []),
    );
}

export function createSharedLink(albumId: string, expiresAt?: string | null): Promise<PhotosResult<PhotoSharedLink>> {
    return toResult(
        () => authFetch(`${API_BASE}/api/photos/shared-links`, {
            method: 'POST',
            body: JSON.stringify({ albumId, expiresAt: expiresAt || undefined }),
        }),
        body => ((body as { data?: PhotoSharedLink })?.data ?? { id: '' }),
    );
}

export type ProxyStatus = 'ready' | 'needs-setup' | 'unreachable';

/** Distinguishes "backend env unset" (needs-setup) from "Immich down" (unreachable). */
export async function getPhotosStatus(): Promise<ProxyStatus> {
    try {
        const res = await authFetch(`${API_BASE}/api/photos/status`);
        if (res.status === 503) return 'needs-setup';
        if (!res.ok) return 'unreachable';
        const body = await res.json().catch(() => null);
        return (body as { data?: { reachable?: boolean } } | null)?.data?.reachable ? 'ready' : 'unreachable';
    } catch {
        return 'unreachable';
    }
}

// ── Thumbnails ──────────────────────────────────────────────────────────────
// <img src> can't carry the session header, so thumbnails come down as blobs.
// Module-level cache: an object URL per asset survives re-renders and tab
// switches for the session. ponytail: unbounded cache; LRU if memory matters.
const thumbCache = new Map<string, string>();

export async function fetchThumbnail(assetId: string): Promise<string | null> {
    const hit = thumbCache.get(assetId);
    if (hit) return hit;
    try {
        const res = await authFetch(`${API_BASE}/api/photos/assets/${encodeURIComponent(assetId)}/thumbnail`);
        if (!res.ok) return null;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        thumbCache.set(assetId, url);
        return url;
    } catch {
        return null;
    }
}

/** Test escape hatch — clears the object-URL cache between tests. */
export function resetThumbnailCache(): void {
    for (const url of thumbCache.values()) {
        try { URL.revokeObjectURL(url); } catch { /* jsdom */ }
    }
    thumbCache.clear();
}
