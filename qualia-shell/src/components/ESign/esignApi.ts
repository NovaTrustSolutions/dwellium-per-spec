/**
 * esignApi — thin client for the plan-047 Documenso backend proxy (/api/esign/*).
 *
 * The backend answers 503 while its DOCUMENSO_* env is unset (no live
 * Documenso yet — decision gate G2), so callers key a "needs setup" UI on
 * the typed result instead of throwing. Same authFetch shape as
 * TrelloBoard.tsx; the Documenso API key never reaches the browser.
 */
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';

export interface EsignRecipient {
    email: string;
    name?: string;
    role?: string;
    status?: string;
}

export interface EsignDocument {
    workitemId: string;
    title: string;
    docStatus: string;
    envelopeId: string;
    recipients: EsignRecipient[];
    sentAt: string | null;
}

export type EsignListResult =
    | { kind: 'ok'; documents: EsignDocument[] }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string };

export type EsignSendResult =
    | { kind: 'ok'; envelopeId: string }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string };

/** Authenticated fetch — attaches the session token (TrelloBoard.tsx pattern). */
function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = getAuthToken();
    const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...init, headers });
}

export async function listEsignDocuments(): Promise<EsignListResult> {
    try {
        const res = await authFetch(`${API_BASE}/api/esign/documents`);
        if (res.status === 503) return { kind: 'needs-setup' };
        if (!res.ok) return { kind: 'error', message: `Backend answered ${res.status}` };
        const body = await res.json().catch(() => null);
        return { kind: 'ok', documents: Array.isArray(body?.data) ? body.data : [] };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

export async function sendForEsign(workitemId: string): Promise<EsignSendResult> {
    try {
        const res = await authFetch(`${API_BASE}/api/esign/leases/${encodeURIComponent(workitemId)}/send`, {
            method: 'POST',
            body: '{}',
        });
        if (res.status === 503) return { kind: 'needs-setup' };
        const body = await res.json().catch(() => null);
        if (!res.ok) return { kind: 'error', message: body?.error || `Backend answered ${res.status}` };
        return { kind: 'ok', envelopeId: body?.data?.envelopeId ?? '' };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}
