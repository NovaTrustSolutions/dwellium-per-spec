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
