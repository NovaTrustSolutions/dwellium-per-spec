/**
 * shortLinksApi — thin client for the link-shortener proxy (/api/links).
 *
 * Plan 047 phase 2, extended for plan 053: update/archive, tags, domains,
 * clicks analytics (timeseries + totals) and bulk create. The backend runs in
 * one of two modes and says which on the list response (`mode: 'builtin'`):
 * the built-in SQLite shortener (default, no setup — stores only url, key and
 * title) or Dub when DUB_API_KEY is set (Dub responses carry no `mode`). Only
 * an OLD backend answered `503 {needsSetup:true}`, which callers still map to
 * a typed needs-setup result; any other 503 is an ordinary error. Same
 * authFetch shape as esignApi.ts; the Dub key never reaches the browser.
 * Built-in bulk is an upsert by key (re-minting re-aims already-printed codes).
 * Dub rows carry a hosted `qrCode` URL; built-in rows carry '' (client-side QR).
 *
 * Capabilities (plan 077 phase 3): the widget deploys separately from the backend, so it gates
 * expiry / tags / sparkline on the LIST response's `features` array, not on the mode. Dub mode
 * (no `mode` key) supports all three. Built-in mode supports exactly the recognised strings the
 * backend lists; an OLDER built-in backend sends no `features` -> empty set -> the widget hides
 * expiry, tags and the sparkline.
 */
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';

export interface LinkTag {
    id: string;
    name: string;
    color: string;
}

export interface ShortLink {
    id: string;
    shortLink: string;
    url: string;
    key: string;
    domain?: string;
    clicks: number;
    qrCode: string;
    archived?: boolean;
    expiresAt?: string | null;
    tags?: LinkTag[];
    comments?: string | null;
}

export interface LinkDomain {
    id: string;
    slug: string;
    verified: boolean;
    primary: boolean;
    archived: boolean;
}

/** One point of the clicks timeseries (Dub /analytics groupBy=timeseries). */
export interface ClicksPoint {
    start: string;
    clicks: number;
}

export interface CreateShortLinkInput {
    url: string;
    /** Stored by the built-in backend (door-sheet cells send "<property> unit <unit>"). */
    title?: string;
    key?: string;
    domain?: string;
    tagNames?: string[];
    expiresAt?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
}

export interface UpdateShortLinkInput {
    url?: string;
    key?: string;
    domain?: string;
    tagNames?: string[];
    expiresAt?: string | null;
    archived?: boolean;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
}

/** Which backend mode answered the list: built-in shortener or Dub. */
export type LinksMode = 'dub' | 'builtin';

/** Optional capabilities a backend advertises on the list response. */
export type LinkFeature = 'expiry' | 'tags' | 'timeseries';
const ALL_FEATURES: readonly LinkFeature[] = ['expiry', 'tags', 'timeseries'];

export type ShortLinksResult<T> =
    | { kind: 'ok'; data: T }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string };

/** Authenticated fetch — attaches the session token (esignApi.ts pattern). */
function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = getAuthToken();
    const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...init, headers });
}

/** Parsed JSON body of a proxy response — always an object envelope or null. */
type Envelope = Record<string, unknown> | null;

/** Shared response mapping: 503 + needsSetup body → needs-setup, other non-ok → backend error text, throw → unreachable. */
async function requestJson<T>(path: string, init: RequestInit | undefined, pick: (body: Envelope) => T): Promise<ShortLinksResult<T>> {
    try {
        const res = await authFetch(`${API_BASE}${path}`, init);
        const body = (await res.json().catch(() => null)) as Envelope;
        // Only the old backend's explicit marker — a bare 503 is a cold start/overload, not "unconfigured".
        if (res.status === 503 && body?.needsSetup === true) return { kind: 'needs-setup' };
        if (!res.ok) {
            const message = typeof body?.error === 'string' ? body.error : `Backend answered ${res.status}`;
            return { kind: 'error', message };
        }
        // A 200 that is not our JSON envelope (e.g. a host's SPA fallback serving index.html) is a broken
        // backend, not an empty list — and must not be read as "Dub mode".
        if (!body || typeof body !== 'object' || Array.isArray(body)) return { kind: 'error', message: 'Backend sent an unexpected response' };
        return { kind: 'ok', data: pick(body) };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

/** `data` as a list (empty when the proxy answered something else). */
function dataList<T>(body: Envelope): T[] {
    return Array.isArray(body?.data) ? (body.data as T[]) : [];
}
/** `data` as a single record. */
function dataOne<T>(body: Envelope): T {
    return (body?.data ?? null) as T;
}

/** Dub: everything. Built-in: only the known strings in `body.features` (unknown ignored, missing -> none). */
function featuresOf(body: Envelope, builtin: boolean): Set<LinkFeature> {
    if (!builtin) return new Set(ALL_FEATURES);
    const listed = Array.isArray(body?.features) ? body.features : [];
    return new Set(ALL_FEATURES.filter(f => listed.includes(f)));
}

export function listShortLinks(showArchived = false): Promise<ShortLinksResult<{ links: ShortLink[]; mode: LinksMode; features: Set<LinkFeature> }>> {
    return requestJson(`/api/links${showArchived ? '?showArchived=true' : ''}`, undefined, body => {
        const builtin = body?.mode === 'builtin';
        return { links: dataList<ShortLink>(body), mode: builtin ? 'builtin' : 'dub', features: featuresOf(body, builtin) };
    });
}

export function createShortLink(input: CreateShortLinkInput): Promise<ShortLinksResult<ShortLink>> {
    return requestJson('/api/links', { method: 'POST', body: JSON.stringify(input) }, dataOne<ShortLink>);
}

export function updateShortLink(id: string, input: UpdateShortLinkInput): Promise<ShortLinksResult<ShortLink>> {
    return requestJson(`/api/links/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }, dataOne<ShortLink>);
}

/** Soft archive — never a delete; the link stops resolving in the active list only. */
export function archiveShortLink(id: string, archived = true): Promise<ShortLinksResult<ShortLink>> {
    return updateShortLink(id, { archived });
}

/** Backend cap per POST /api/links/bulk. */
const BULK_CHUNK = 100;

/** Sequential chunks of <=100; stops at the first non-ok result and returns it. */
export async function bulkCreateShortLinks(links: CreateShortLinkInput[]): Promise<ShortLinksResult<ShortLink[]>> {
    const all: ShortLink[] = [];
    for (let i = 0; i < links.length; i += BULK_CHUNK) {
        const res = await requestJson('/api/links/bulk',
            { method: 'POST', body: JSON.stringify({ links: links.slice(i, i + BULK_CHUNK) }) }, dataList<ShortLink>);
        if (res.kind !== 'ok') return res;
        all.push(...res.data);
    }
    return { kind: 'ok', data: all };
}

export function listLinkTags(): Promise<ShortLinksResult<LinkTag[]>> {
    return requestJson('/api/links/tags', undefined, dataList<LinkTag>);
}

export function createLinkTag(name: string, color?: string): Promise<ShortLinksResult<LinkTag>> {
    return requestJson('/api/links/tags', { method: 'POST', body: JSON.stringify({ name, ...(color ? { color } : {}) }) },
        dataOne<LinkTag>);
}

export function listLinkDomains(): Promise<ShortLinksResult<{ domains: LinkDomain[]; defaultDomain: string | null }>> {
    return requestJson('/api/links/domains', undefined, body => ({
        domains: dataList<LinkDomain>(body),
        defaultDomain: typeof body?.defaultDomain === 'string' ? body.defaultDomain : null,
    }));
}

/** Per-link clicks timeseries for the row sparkline. */
export function getClicksTimeseries(linkId: string, interval = '30d'): Promise<ShortLinksResult<ClicksPoint[]>> {
    return requestJson(`/api/links/analytics?groupBy=timeseries&linkId=${encodeURIComponent(linkId)}&interval=${encodeURIComponent(interval)}`,
        undefined, dataList<ClicksPoint>);
}

/** Workspace-wide clicks total (Dub /analytics groupBy=count). */
export function getClicksTotal(interval = '30d'): Promise<ShortLinksResult<number>> {
    return requestJson(`/api/links/analytics?groupBy=count&interval=${encodeURIComponent(interval)}`, undefined, body => {
        const data = body?.data as { clicks?: unknown } | undefined;
        return typeof data?.clicks === 'number' ? data.clicks : 0;
    });
}
