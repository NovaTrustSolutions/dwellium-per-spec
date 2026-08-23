/**
 * broadcastsApi — thin client for the plan-047 listmonk backend proxy
 * (/api/broadcasts/*).
 *
 * The backend answers 503 while its LISTMONK_* env is unset (listmonk runs on
 * the free e2-micro — tools/listmonk/README.md), so callers key a "needs
 * setup" UI on the typed result instead of throwing. Same authFetch shape as
 * esignApi.ts; the listmonk token never reaches the browser.
 */
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';

export interface BroadcastList {
    id: number;
    name: string;
    subscriber_count?: number;
}

export interface BroadcastTemplate {
    id: number;
    name: string;
}

export interface BroadcastCampaign {
    id: number;
    name: string;
    subject: string;
    status: string;
    created_at?: string;
    lists?: Array<{ id: number; name?: string }>;
}

export type BroadcastsResult<T> =
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

async function getArray<T>(path: string): Promise<BroadcastsResult<T[]>> {
    try {
        const res = await authFetch(`${API_BASE}/api/broadcasts${path}`);
        if (res.status === 503) return { kind: 'needs-setup' };
        if (!res.ok) return { kind: 'error', message: `Backend answered ${res.status}` };
        const body = await res.json().catch(() => null);
        return { kind: 'ok', data: Array.isArray(body?.data) ? body.data : [] };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

export const listBroadcastLists = () => getArray<BroadcastList>('/lists');
export const listBroadcastTemplates = () => getArray<BroadcastTemplate>('/templates');
export const listBroadcastCampaigns = () => getArray<BroadcastCampaign>('/campaigns');

export async function createCampaignDraft(input: {
    name?: string;
    subject: string;
    lists: number[];
    template_id?: number;
    body?: string;
    content_type?: string;
}): Promise<BroadcastsResult<BroadcastCampaign>> {
    try {
        const res = await authFetch(`${API_BASE}/api/broadcasts/campaigns`, {
            method: 'POST',
            body: JSON.stringify(input),
        });
        if (res.status === 503) return { kind: 'needs-setup' };
        const body = await res.json().catch(() => null);
        if (!res.ok) return { kind: 'error', message: body?.error || `Backend answered ${res.status}` };
        return { kind: 'ok', data: body?.data ?? null };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

export async function sendCampaignTest(campaignId: number, subscribers: string[]): Promise<BroadcastsResult<{ sent: string[] }>> {
    try {
        const res = await authFetch(`${API_BASE}/api/broadcasts/campaigns/${campaignId}/test`, {
            method: 'POST',
            body: JSON.stringify({ subscribers }),
        });
        if (res.status === 503) return { kind: 'needs-setup' };
        const body = await res.json().catch(() => null);
        if (!res.ok) return { kind: 'error', message: body?.error || `Backend answered ${res.status}` };
        return { kind: 'ok', data: body?.data ?? { sent: subscribers } };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

// ── plan 053: full daily workflow ───────────────────────────────────────────

export interface BroadcastSubscriber {
    id: number;
    email: string;
    name?: string;
    status?: string;
    attribs?: Record<string, unknown>;
    lists?: Array<{ id: number; name?: string }>;
}

export interface CampaignStats {
    id: number;
    name: string;
    status: string;
    sent: number;
    to_send: number;
    views: number;
    clicks: number;
    bounces: number;
    started_at?: string | null;
    send_at?: string | null;
}

export interface ImportOutcome {
    created: number;
    updated: number;
    failed: Array<{ email: string; error: string }>;
}

/** Shared JSON request against /api/broadcasts — same typed result mapping. */
async function send<T>(path: string, method: string, body?: unknown): Promise<BroadcastsResult<T>> {
    try {
        const res = await authFetch(`${API_BASE}/api/broadcasts${path}`, {
            method,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (res.status === 503) return { kind: 'needs-setup' };
        const parsed = await res.json().catch(() => null);
        if (!res.ok) return { kind: 'error', message: parsed?.error || `Backend answered ${res.status}` };
        return { kind: 'ok', data: parsed?.data as T };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

export const createBroadcastList = (input: {
    name: string; type?: 'private' | 'public'; optin?: 'single' | 'double'; description?: string;
}) => send<BroadcastList>('/lists', 'POST', input);

export async function listSubscribers(params: {
    listId?: number; page?: number; perPage?: number; query?: string;
} = {}): Promise<BroadcastsResult<{ subscribers: BroadcastSubscriber[]; total: number }>> {
    const qs = new URLSearchParams();
    if (params.listId !== undefined && Number.isInteger(params.listId)) qs.set('list_id', String(params.listId));
    if (params.page) qs.set('page', String(params.page));
    if (params.perPage) qs.set('per_page', String(params.perPage));
    if (params.query) qs.set('query', params.query);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    try {
        const res = await authFetch(`${API_BASE}/api/broadcasts/subscribers${suffix}`);
        if (res.status === 503) return { kind: 'needs-setup' };
        const parsed = await res.json().catch(() => null);
        if (!res.ok) return { kind: 'error', message: parsed?.error || `Backend answered ${res.status}` };
        const subscribers = Array.isArray(parsed?.data) ? parsed.data : [];
        return { kind: 'ok', data: { subscribers, total: typeof parsed?.total === 'number' ? parsed.total : subscribers.length } };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

/** Bulk UPSERT into listmonk (backend merges on duplicate e-mail — never deletes). */
export const importSubscribers = (input: {
    subscribers: Array<{ email: string; name?: string; attribs?: Record<string, unknown> }>;
    lists: number[];
    preconfirm: boolean;
}) => send<ImportOutcome>('/subscribers/import', 'POST', input);

export const updateCampaign = (campaignId: number, input: {
    name?: string; subject?: string; lists?: number[]; template_id?: number;
    body?: string; content_type?: string; send_at?: string | null;
}) => send<BroadcastCampaign>(`/campaigns/${campaignId}`, 'PUT', input);

/** Change status. 'running'/'scheduled' start REAL sends — the backend rejects
 *  them without confirm:true, so only the widget's confirm dialog can send. */
export const setCampaignStatus = (
    campaignId: number,
    status: 'scheduled' | 'running' | 'paused' | 'cancelled',
    confirm = false,
) => send<BroadcastCampaign>(`/campaigns/${campaignId}/status`, 'PUT', { status, ...(confirm ? { confirm: true } : {}) });

export const getCampaignStats = (campaignId: number) => send<CampaignStats>(`/campaigns/${campaignId}/stats`, 'GET');

/** Rendered HTML preview of a template (shown in a sandboxed iframe). */
export async function getTemplatePreview(templateId: number): Promise<BroadcastsResult<string>> {
    try {
        const res = await authFetch(`${API_BASE}/api/broadcasts/templates/${templateId}/preview`);
        if (res.status === 503) return { kind: 'needs-setup' };
        if (!res.ok) return { kind: 'error', message: `Backend answered ${res.status}` };
        return { kind: 'ok', data: await res.text() };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}
