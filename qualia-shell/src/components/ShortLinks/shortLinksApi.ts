/**
 * shortLinksApi — thin client for the Dub backend proxy (/api/links).
 *
 * Plan 047 phase 2, extended for plan 053: update/archive, tags, domains,
 * clicks analytics (timeseries + totals) and bulk create. The backend answers
 * 503 while DUB_API_KEY is unset, so callers key a "needs setup" UI on the
 * typed result. NOTE: dub.co's pricing page currently lists NO free plan —
 * check current pricing before assuming a $0 workspace. Same authFetch shape
 * as esignApi.ts; the Dub key never reaches the browser. QR PNGs come straight
 * from Dub's unauthenticated qr endpoint (the `qrCode` field on each link).
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

/** Shared response mapping: 503 → needs-setup, non-ok → backend error text, throw → unreachable. */
async function requestJson<T>(path: string, init: RequestInit | undefined, pick: (body: Envelope) => T): Promise<ShortLinksResult<T>> {
    try {
        const res = await authFetch(`${API_BASE}${path}`, init);
        if (res.status === 503) return { kind: 'needs-setup' };
        const body = (await res.json().catch(() => null)) as Envelope;
        if (!res.ok) {
            const message = typeof body?.error === 'string' ? body.error : `Backend answered ${res.status}`;
            return { kind: 'error', message };
        }
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

export function listShortLinks(showArchived = false): Promise<ShortLinksResult<ShortLink[]>> {
    return requestJson(`/api/links${showArchived ? '?showArchived=true' : ''}`, undefined, dataList<ShortLink>);
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

export function bulkCreateShortLinks(links: CreateShortLinkInput[]): Promise<ShortLinksResult<ShortLink[]>> {
    return requestJson('/api/links/bulk', { method: 'POST', body: JSON.stringify({ links }) }, dataList<ShortLink>);
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
