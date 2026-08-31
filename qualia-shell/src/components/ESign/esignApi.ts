/**
 * esignApi — thin client for the Documenso backend proxy (/api/esign/*).
 *
 * Plan 047 phase 1 + plan 053: full daily workflow. The backend answers 503
 * while its DOCUMENSO_* env is unset (no Documenso account yet — gate G2), so
 * callers key a "needs setup" UI on the typed result instead of throwing. Same
 * authFetch shape as TrelloBoard.tsx; the Documenso API key never reaches the
 * browser — the frontend only ever talks to the Dwellium backend.
 */
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';

export interface EsignRecipient {
    email: string;
    name?: string;
    role?: string;
    status?: string;
    /** Documenso signing token (from template/use / distribute responses) — builds the /sign/<token> link. */
    token?: string;
    id?: number;
    signingStatus?: string;
}

export interface EsignDocument {
    workitemId: string;
    title: string;
    docStatus: string;
    envelopeId: string | null;
    documentId?: number | string | null;
    status?: string | null;
    recipients: EsignRecipient[];
    sentAt: string | null;
}

/** Raw envelope row from Documenso's own list (GET /api/esign/envelopes) — tolerant shape. */
export interface DocumensoEnvelope {
    id?: string | number;
    envelopeId?: string;
    title?: string;
    status?: string;
    externalId?: string | null;
    recipients?: EsignRecipient[];
    createdAt?: string;
    [key: string]: unknown;
}

export interface EsignTemplate {
    id: number;
    title?: string;
    [key: string]: unknown;
}

export interface MySigningRow {
    workitemId: string;
    title: string;
    docStatus: string;
    status: string | null;
    signingUrl: string;
}

export interface EsignFileRow {
    id: string;
    name: string;
    type?: string;
    size?: number;
}

export type EsignResult<T> =
    | { kind: 'ok'; data: T }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string };

export type EsignListResult =
    | { kind: 'ok'; documents: EsignDocument[] }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string };

export type EsignSendResult =
    | { kind: 'ok'; envelopeId: string; recipients?: EsignRecipient[] }
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

/** Shared JSON call → typed result. `pick` maps the parsed body to the payload. */
async function callJson<T>(path: string, init: RequestInit | undefined, pick: (body: any) => T): Promise<EsignResult<T>> {
    try {
        const res = await authFetch(`${API_BASE}${path}`, init);
        if (res.status === 503) return { kind: 'needs-setup' };
        const body = await res.json().catch(() => null);
        if (!res.ok) return { kind: 'error', message: body?.error || `Backend answered ${res.status}` };
        return { kind: 'ok', data: pick(body) };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

export async function listEsignDocuments(): Promise<EsignListResult> {
    const r = await callJson<EsignDocument[]>('/api/esign/documents', undefined, b => (Array.isArray(b?.data) ? b.data : []));
    return r.kind === 'ok' ? { kind: 'ok', documents: r.data } : r;
}

/** Envelopes straight from Documenso (plan 053) — the live half of the merged list. */
export function listDocumensoEnvelopes(): Promise<EsignResult<DocumensoEnvelope[]>> {
    return callJson('/api/esign/envelopes', undefined, b => (Array.isArray(b?.data) ? b.data : []));
}

export function listEsignTemplates(): Promise<EsignResult<{ templates: EsignTemplate[]; leaseTemplateId: number | null }>> {
    return callJson('/api/esign/templates', undefined, b => ({
        templates: Array.isArray(b?.data) ? b.data : [],
        leaseTemplateId: typeof b?.leaseTemplateId === 'number' ? b.leaseTemplateId : null,
    }));
}

/** PDFs in the Dwellium files store — the fileId picker for the send flow. */
export function listPdfFiles(): Promise<EsignResult<EsignFileRow[]>> {
    return callJson('/api/files?limit=200', undefined, b => {
        const rows: EsignFileRow[] = Array.isArray(b?.data) ? b.data : [];
        return rows.filter(f => String(f.type || '').toLowerCase().includes('pdf') || String(f.name || '').toLowerCase().endsWith('.pdf'));
    });
}

export async function sendForEsign(
    workitemId: string,
    body?: { recipients?: EsignRecipient[]; templateId?: number; fileId?: string; subject?: string; message?: string },
): Promise<EsignSendResult> {
    const r = await callJson<{ envelopeId: string; recipients?: EsignRecipient[] }>(
        `/api/esign/leases/${encodeURIComponent(workitemId)}/send`,
        { method: 'POST', body: JSON.stringify(body || {}) },
        b => ({ envelopeId: b?.data?.envelopeId ?? '', recipients: b?.data?.recipients }),
    );
    return r.kind === 'ok' ? { kind: 'ok', envelopeId: r.data.envelopeId, recipients: r.data.recipients } : r;
}

/** Generic send (plan 053) — template OR fileId flow, not bound to a lease. */
export function sendEnvelope(body: {
    title: string;
    recipients: EsignRecipient[];
    templateId?: number;
    fileId?: string;
    subject?: string;
    message?: string;
}): Promise<EsignResult<{ envelopeId?: string | null; documentId?: number | null; recipients?: EsignRecipient[]; status?: string }>> {
    return callJson('/api/esign/send', { method: 'POST', body: JSON.stringify(body) }, b => b?.data || {});
}

/** Live status check (?live=1 hits Documenso, then returns the refreshed metadata). */
export function checkEsignStatus(workitemId: string): Promise<EsignResult<{ docStatus: string; esign: Record<string, unknown> | null }>> {
    return callJson(`/api/esign/leases/${encodeURIComponent(workitemId)}/status?live=1`, undefined, b => b?.data || { docStatus: 'draft', esign: null });
}

export type EsignRef = { workitemId?: string; envelopeId?: string; documentId?: number | string };

export function resendEnvelope(ref: EsignRef): Promise<EsignResult<{ resent: boolean }>> {
    return callJson('/api/esign/resend', { method: 'POST', body: JSON.stringify(ref) }, b => b?.data || { resent: false });
}

export function cancelEnvelope(ref: EsignRef): Promise<EsignResult<{ envelopeId: string; status: string }>> {
    return callJson('/api/esign/cancel', { method: 'POST', body: JSON.stringify(ref) }, b => b?.data || { envelopeId: '', status: '' });
}

/** Signing links waiting on the CURRENT session user (tenant portal). */
export function listMySigning(): Promise<EsignResult<MySigningRow[]>> {
    return callJson('/api/esign/my-signing', undefined, b => (Array.isArray(b?.data) ? b.data : []));
}

/** Fetch a backend-proxied PDF and hand it to the browser as a download. */
async function downloadPdf(path: string, filename: string): Promise<EsignResult<true>> {
    try {
        const res = await authFetch(`${API_BASE}${path}`);
        if (res.status === 503) return { kind: 'needs-setup' };
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            return { kind: 'error', message: body?.error || `Backend answered ${res.status}` };
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return { kind: 'ok', data: true };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

export function downloadSignedPdf(workitemId: string, title: string): Promise<EsignResult<true>> {
    return downloadPdf(`/api/esign/leases/${encodeURIComponent(workitemId)}/signed-pdf`, `${title || 'signed-document'} (signed).pdf`);
}

export function downloadAuditLog(ref: EsignRef, title: string): Promise<EsignResult<true>> {
    const qs = new URLSearchParams();
    if (ref.workitemId) qs.set('workitemId', ref.workitemId);
    else if (ref.envelopeId) qs.set('envelopeId', ref.envelopeId);
    else if (ref.documentId !== undefined) qs.set('documentId', String(ref.documentId));
    return downloadPdf(`/api/esign/audit-log?${qs.toString()}`, `${title || 'document'} (audit log).pdf`);
}

type ViteEnv = Record<string, string | undefined> | undefined;
const importMetaEnv = (): ViteEnv => (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

/** Raw self-host URL (VITE_DOCUMENSO_URL) or null when unset — the embed panel keys its setup card on this. */
export function documensoConfiguredUrl(env: ViteEnv = importMetaEnv()): string | null {
    const raw = env?.VITE_DOCUMENSO_URL?.trim();
    return raw ? raw.replace(/\/+$/, '') : null;
}

/**
 * Hosted Documenso (app.documenso.com / *.documenso.com) sends X-Frame-Options
 * SAMEORIGIN → it can't be embedded. The self-host sends `frame-ancestors *`, so
 * only the cloud host is blocked. Any parse failure counts as cloud (safe: falls back to a tab).
 */
export function isCloudDocumensoHost(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'documenso.com' || host.endsWith('.documenso.com');
    } catch {
        return true;
    }
}

/** Documenso app base for deep links — VITE_DOCUMENSO_URL, else Documenso cloud. */
export function documensoAppUrl(env: ViteEnv = importMetaEnv()): string {
    return documensoConfiguredUrl(env) || 'https://app.documenso.com';
}

/** Deep link into the exact document screen (never a bare homepage). */
export function documensoDocumentUrl(doc: { documentId?: number | string | null; envelopeId?: string | null; id?: string | number }, env: ViteEnv = importMetaEnv()): string {
    const id = doc.documentId ?? doc.id ?? doc.envelopeId;
    return `${documensoAppUrl(env)}/documents/${encodeURIComponent(String(id ?? ''))}`;
}

/** Signing link from a recipient token (same shape the backend builds for tenants). */
export function signingUrlFromToken(token: string, env: ViteEnv = importMetaEnv()): string {
    return `${documensoAppUrl(env)}/sign/${encodeURIComponent(token)}`;
}
