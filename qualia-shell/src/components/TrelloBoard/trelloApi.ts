/**
 * trelloApi — the ONE place the frontend talks to /api/trello (plan 078 Phase 1).
 *
 * Every caller (TrelloBoard, TrelloCardModal) goes through `trelloFetch`, which
 * throws `TrelloApiError` on a non-OK status, a `success: false` body, the
 * permission gate's 403 body, a non-JSON body, or a network failure. Before this
 * helper existed each caller checked (or forgot to check) these itself — a
 * rejected card move was shown as a success (plan 078 FE1).
 *
 * Backend contract (ai-dashboard369-file-manager/src/services/trelloService.ts):
 *   error body  { success: false, code: TrelloErrorCode, error: <end-user sentence> }
 *   gate 403    { error: 'Insufficient permissions', requiredPermissions: string[] }
 *   HTTP        NOT_CONFIGURED 503 · BAD_ID 400 · NOT_FOUND 404 · RATE_LIMITED 429 · UPSTREAM_AUTH 502 · TIMEOUT 504 · UPSTREAM 502
 */
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';
import { backendStatusStore } from '../../lib/backendStatusStore';

export type TrelloErrorCode =
    | 'NOT_CONFIGURED' | 'BAD_ID' | 'BAD_REQUEST' | 'NOT_FOUND' | 'RATE_LIMITED' | 'UPSTREAM_AUTH' | 'TIMEOUT' | 'UPSTREAM'
    | 'FORBIDDEN'        // the permission gate (403 without a `code`)
    | 'UNAUTHENTICATED'  // 401 without a `code`
    | 'BAD_RESPONSE'     // non-JSON or unexpected body
    | 'NETWORK'          // fetch rejected (offline, DNS, CORS)
    | 'HTTP';            // any other non-OK status without a `code`

export class TrelloApiError extends Error {
    readonly code: TrelloErrorCode;
    readonly status: number;
    constructor(code: TrelloErrorCode, status: number, message: string) {
        super(message);
        this.name = 'TrelloApiError';
        this.code = code;
        this.status = status;
    }
}

// ── Shared types (mirror the backend contract) ─────────────────────────────

export interface TrelloBoard { id: string; name: string; url: string }
export interface TrelloList { id: string; name: string; idBoard: string }
export interface TrelloLabel { id: string; name: string; color: string | null }
export interface TrelloCard {
    id: string;
    name: string;
    desc?: string;
    url: string;
    idList: string;
    pos?: number;
    due?: string | null;
    dueComplete?: boolean;
    labels?: TrelloLabel[];
    idMembers?: string[];
    dateLastActivity?: string;
    badges?: { comments?: number; attachments?: number; checkItems?: number; checkItemsChecked?: number; description?: boolean };
}
export interface TrelloBoardFull { board: TrelloBoard; lists: TrelloList[]; cards: TrelloCard[]; truncated: boolean }
export interface CheckItem { id: string; name: string; state: 'complete' | 'incomplete' }
export interface Checklist { id: string; name: string; checkItems: CheckItem[] }
export interface Attachment { id: string; name: string; url: string; date: string }
export interface CardDetail extends TrelloCard {
    checklists?: Checklist[];
    attachments?: Attachment[];
    members?: { id: string; fullName: string; avatarUrl?: string }[];
}
export interface Activity {
    id: string;
    type: string;
    date: string;
    memberCreator?: { fullName: string };
    data?: { text?: string; card?: { name: string }; listBefore?: { name: string }; listAfter?: { name: string } };
}

// ── The helper ─────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/trello`;

/** Fetch `/api/trello<path>` and return the `data` of a `{ success: true, data }` body; throw otherwise. */
export async function trelloFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
        res = await fetch(`${BASE}${path}`, { ...init, headers });
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e; // a cancelled request is not an error to report
        // A failed fetch never logs the user out; it only raises the global "reconnect" banner.
        backendStatusStore.markOffline("Can't reach the Dwellium server.");
        throw new TrelloApiError('NETWORK', 0, "Can't reach the Dwellium server.");
    }
    backendStatusStore.markOnline(); // any HTTP answer, even an error status, proves the backend is reachable

    let body: unknown = null;
    try {
        body = await res.json();
    } catch {
        throw new TrelloApiError('BAD_RESPONSE', res.status, res.ok ? 'The server sent an unreadable reply.' : `The server answered with an error (${res.status}).`);
    }
    const b = (body ?? {}) as { success?: boolean; data?: T; code?: string; error?: string; message?: string };

    if (!res.ok || b.success === false) {
        const code: TrelloErrorCode = isTrelloErrorCode(b.code) ? b.code
            : res.status === 403 ? 'FORBIDDEN'
            : res.status === 401 ? 'UNAUTHENTICATED'
            : 'HTTP';
        throw new TrelloApiError(code, res.status, b.error || b.message || defaultMessage(code, res.status));
    }
    if (b.success !== true || !('data' in b)) {
        throw new TrelloApiError('BAD_RESPONSE', res.status, 'The server sent an unexpected reply.');
    }
    return b.data as T;
}

const CODES: ReadonlySet<string> = new Set(['NOT_CONFIGURED', 'BAD_ID', 'BAD_REQUEST', 'NOT_FOUND', 'RATE_LIMITED', 'UPSTREAM_AUTH', 'TIMEOUT', 'UPSTREAM']);
function isTrelloErrorCode(v: unknown): v is TrelloErrorCode { return typeof v === 'string' && CODES.has(v); }

function defaultMessage(code: TrelloErrorCode, status: number): string {
    switch (code) {
        case 'FORBIDDEN': return "You don't have access to Trello in Dwellium.";
        case 'UNAUTHENTICATED': return 'Your session has expired — sign in again.';
        default: return `Trello request failed (${status}).`;
    }
}

const MAX_MESSAGE = 300;
const clamp = (s: string): string => (s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 1)}…` : s);

/** Message for a toast / inline alert (clamped to 300 chars). `isAdmin` adds where the setting lives. */
export function describeTrelloError(err: unknown, opts: { isAdmin?: boolean } = {}): string {
    return clamp(describeRaw(err, opts));
}

function describeRaw(err: unknown, opts: { isAdmin?: boolean }): string {
    if (err instanceof TrelloApiError) {
        switch (err.code) {
            case 'NOT_CONFIGURED':
                return opts.isAdmin
                    ? 'Trello not configured — set TRELLO_API_KEY and TRELLO_TOKEN on the backend (Secret Manager in production).'
                    : "Trello isn't connected yet. Ask an administrator to connect it.";
            case 'FORBIDDEN': return "You don't have access to Trello in Dwellium.";
            case 'RATE_LIMITED': return 'Trello is rate-limiting requests — try again in a few seconds.';
            case 'TIMEOUT': return 'Trello took too long to answer — try again.';
            case 'NETWORK': return "Can't reach the Dwellium server.";
            default: return err.message;
        }
    }
    return err instanceof Error && err.message ? err.message : 'Something went wrong talking to Trello.';
}

// ── Typed calls ────────────────────────────────────────────────────────────

export const trelloApi = {
    /** `fresh` bypasses the backend's 60 s boards cache (the Refresh button). */
    boards: (signal?: AbortSignal, opts: { fresh?: boolean } = {}) => trelloFetch<TrelloBoard[]>(opts.fresh ? '/boards?fresh=1' : '/boards', { signal }),
    boardFull: (boardId: string, signal?: AbortSignal) => trelloFetch<TrelloBoardFull>(`/boards/${encodeURIComponent(boardId)}/full`, { signal }),
    card: (cardId: string, signal?: AbortSignal) => trelloFetch<CardDetail>(`/cards/${encodeURIComponent(cardId)}`, { signal }),
    activity: (cardId: string, signal?: AbortSignal) => trelloFetch<Activity[]>(`/cards/${encodeURIComponent(cardId)}/activity`, { signal }),
    moveCard: (cardId: string, listId: string, pos?: 'top' | 'bottom' | number) =>
        trelloFetch<TrelloCard>(`/cards/${encodeURIComponent(cardId)}/move`, {
            method: 'PUT',
            body: JSON.stringify(pos === undefined ? { listId } : { listId, pos }),
        }),
    createCard: (input: { name: string; desc?: string; listId: string }) =>
        trelloFetch<TrelloCard>('/cards', { method: 'POST', body: JSON.stringify(input) }),
};
