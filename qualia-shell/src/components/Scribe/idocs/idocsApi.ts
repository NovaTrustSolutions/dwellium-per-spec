/**
 * idocsApi — typed client for the Interactive Docs wave-3 backend
 * (`Docs/idocs-wave3-api.md` §1–§3, §5). One function per route, all over an
 * injectable `fetchFn` (default: the global fetch, which `installApiAuthFetch`
 * has already patched to add `Authorization: Bearer …` for `/api/*`).
 *
 * Every non-2xx / `success:false` reply throws `IdocsApiError { status, code }`;
 * a 409 on `putSharedDoc` also carries `current` (the server's doc + version).
 * Network failures surface as `IdocsApiError { status: 0, code: 'network' }` —
 * callers keep the session either way (backend down ≠ logged out).
 */
import { API_BASE } from '../../../config';
import type { BlockComment, IDoc } from './idocTypes';

export type ShareRole = 'view' | 'comment' | 'edit';

export interface IdocsApiDeps {
    /** Late-bound so tests can stub `globalThis.fetch` after import. */
    fetchFn?: typeof fetch;
    /** Defaults to `API_BASE` (same-origin '' in prod). */
    base?: string;
}

export interface SharedCurrent { doc: IDoc; version: number; updatedAt: string; updatedBy?: { id: string; name: string } }

export class IdocsApiError extends Error {
    status: number;
    code: string;
    /** 409 version-conflict: the server's current doc. */
    current?: SharedCurrent;
    /** 400 unknown-users: the emails that didn't resolve. */
    emails?: string[];
    constructor(status: number, code: string, message?: string, extra: { current?: SharedCurrent; emails?: string[] } = {}) {
        super(message ?? code);
        this.name = 'IdocsApiError';
        this.status = status;
        this.code = code;
        this.current = extra.current;
        this.emails = extra.emails;
    }
}

// ── §1 publishing ──
export interface PublishInput { docId: string; title: string; html: string; slug?: string; password?: string; seo?: { title?: string; description?: string; noindex?: boolean }; embedAllowed?: boolean }
export interface PublishResult { slug: string; url: string; publishedAt: string }
export interface PublicationItem { slug: string; docId: string; title: string; url: string; hasPassword: boolean; seo?: { title?: string; description?: string; noindex?: boolean }; embedAllowed: boolean; publishedAt: string; updatedAt: string; views: number }
export interface PublicationAnalytics { views: number; uniqueViewers30d: number; lastViewedAt: string | null; perCard: { cardId: string; views: number; avgSeconds: number; pctOfViewers: number }[] }

// ── §2 sharing ──
export interface SharedDocResult extends SharedCurrent { updatedBy: { id: string; name: string }; role: ShareRole | 'owner'; owner: { id: string; name: string }; members: SharedMember[] }
export interface SharedMember { userId: string; name: string; email: string; role: ShareRole }
export interface SharedListItem { docId: string; title: string; owner: { id: string; name: string }; role: ShareRole | 'owner'; version: number; updatedAt: string; memberCount: number }
export interface PresenceEntry { userId: string; name: string; cardId?: string; at: string }

// ── §3 generate ──
export interface GenerateInput { prompt: string; kind?: 'document' | 'deck' | 'onepager'; amount?: 'brief' | 'medium' | 'detailed'; audience?: string; language?: string; tone?: string; userLlmKey?: { provider: 'openai'; apiKey: string; model?: string } }

interface Envelope<T> { success?: boolean; data?: T; error?: string; current?: SharedCurrent; emails?: string[] }

async function call<T>(method: string, path: string, body: unknown, deps: IdocsApiDeps): Promise<T> {
    const fetchFn = deps.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
    const url = `${deps.base ?? API_BASE}/api/idocs${path}`;
    let res: Response;
    try {
        res = await fetchFn(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-Qualia-API': 'v2' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (e) {
        throw new IdocsApiError(0, 'network', (e as Error).message);
    }
    let env: Envelope<T> = {};
    try { env = (await res.json()) as Envelope<T>; } catch { /* non-JSON body → status-only error below */ }
    if (!res.ok || env.success === false) {
        const code = env.error ?? `http-${res.status}`;
        // Tolerate `current` / `emails` at the top level or nested under `data`.
        const nested = (env.data ?? {}) as { current?: SharedCurrent; emails?: string[] };
        throw new IdocsApiError(res.status, code, code, { current: env.current ?? nested.current, emails: env.emails ?? nested.emails });
    }
    return (env.data ?? env) as T;
}

const enc = encodeURIComponent;

export const publishDoc = (input: PublishInput, deps: IdocsApiDeps = {}) => call<PublishResult>('POST', '/publish', input, deps);
export const listPublications = (deps: IdocsApiDeps = {}) => call<{ items: PublicationItem[] }>('GET', '/publications', undefined, deps).then((r) => r.items ?? []);
export const unpublish = (slug: string, deps: IdocsApiDeps = {}) => call<{ ok: true }>('DELETE', `/publications/${enc(slug)}`, undefined, deps);
export const publicationAnalytics = (slug: string, deps: IdocsApiDeps = {}) => call<PublicationAnalytics>('GET', `/publications/${enc(slug)}/analytics`, undefined, deps);

export const putSharedDoc = (docId: string, body: { doc: IDoc; version?: number }, deps: IdocsApiDeps = {}) => call<{ version: number; updatedAt: string }>('PUT', `/shared/${enc(docId)}`, body, deps);
export const getSharedDoc = (docId: string, deps: IdocsApiDeps = {}) => call<SharedDocResult>('GET', `/shared/${enc(docId)}`, undefined, deps);
export const listShared = (deps: IdocsApiDeps = {}) => call<{ items: SharedListItem[] }>('GET', '/shared', undefined, deps).then((r) => r.items ?? []);
export const setMembers = (docId: string, members: { email: string; role: ShareRole }[], deps: IdocsApiDeps = {}) => call<{ members: SharedMember[] }>('PUT', `/shared/${enc(docId)}/members`, { members }, deps).then((r) => r.members ?? []);
export const unshare = (docId: string, deps: IdocsApiDeps = {}) => call<{ ok: true }>('DELETE', `/shared/${enc(docId)}`, undefined, deps);
export const postComment = (docId: string, body: { cardId: string; blockId?: string; text: string }, deps: IdocsApiDeps = {}) => call<{ comment: BlockComment; version: number }>('POST', `/shared/${enc(docId)}/comments`, body, deps);
export const postPresence = (docId: string, body: { cardId?: string }, deps: IdocsApiDeps = {}) => call<{ others: PresenceEntry[] }>('POST', `/shared/${enc(docId)}/presence`, body, deps).then((r) => r.others ?? []);

export const generateDoc = (input: GenerateInput, deps: IdocsApiDeps = {}) => call<{ doc: IDoc }>('POST', '/generate', input, deps).then((r) => r.doc);
export const generateSchema = (deps: IdocsApiDeps = {}) => call<{ blockTypes: string[]; example: IDoc }>('GET', '/generate/schema', undefined, deps);

/** Public URL for a slug on this origin (Netlify `/p/*` → backend `/api/idocs/p/:splat`). */
export function publicUrlFor(slug: string): string {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    return `${origin}/p/${enc(slug)}`;
}
export const embedCodeFor = (slug: string): string => `<iframe src="${publicUrlFor(slug)}" width="100%" height="700" style="border:0" allowfullscreen></iframe>`;
export const linkedInShareUrl = (url: string): string => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`;

const SLUG_RE = /^[a-z0-9-]{3,64}$/;
export const isValidSlug = (s: string): boolean => SLUG_RE.test(s);
/** Title → slug candidate (lowercase, dashes, ≤64, ≥3 padded with 'doc'). */
export function slugify(title: string): string {
    const s = title.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/, '');
    return s.length >= 3 ? s : `${s}${s ? '-' : ''}doc`.slice(0, 64);
}
