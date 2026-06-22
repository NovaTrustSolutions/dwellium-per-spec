/**
 * openNotebookClient — fail-soft REST client for a running Open Notebook
 * instance (lfnovo/open-notebook, the self-hosted NotebookLM alternative).
 *
 * Open Notebook runs its web UI on :8502 and a SEPARATE REST API on :5055.
 * This client talks to the API so the OpenNotebookPanel can auto-populate the
 * user's notebooks instead of only embedding the web UI in an iframe.
 *
 * Everything here is FAIL-SOFT: no method ever throws to the UI. Each call
 * wraps fetch in try/catch + an AbortController timeout and returns a result
 * object (`{ ok: true, … } | { ok: false, error }`). The panel keeps working
 * (its existing iframe path) when the instance is down — the list is purely
 * additive.
 *
 * Auth is OPTIONAL: most dev instances have no password. If the user stores a
 * token in localStorage (`dwellium-open-notebook-token`) we send it as
 * `Authorization: Bearer <token>`; otherwise the header is omitted.
 *
 * CORS: Open Notebook allows all origins in dev, so a browser fetch to
 * localhost:5055 works directly — no backend/proxy involved in this phase.
 */

/** localStorage key holding an explicit API base URL (overrides derivation). */
const LS_API_URL = 'dwellium-open-notebook-api-url';
/** localStorage key holding the web-UI URL (the iframe target, normally :8502). */
const LS_UI_URL = 'dwellium-open-notebook-url';
/** localStorage key holding an optional bearer token (most dev instances: none). */
const LS_TOKEN = 'dwellium-open-notebook-token';

/** Fallback API base when nothing is configured. */
const DEFAULT_API_BASE = 'http://localhost:5055';
/** Per-request timeout so a hung instance never wedges the panel. */
const TIMEOUT_MS = 5000;

// ── Public types ─────────────────────────────────────────────────────────

export interface OpenNotebook {
    id: string;
    name: string;
    description?: string;
    created?: string;
    updated?: string;
}

export interface OpenNotebookSource {
    id: string;
    title?: string;
}

export type ListNotebooksResult =
    | { ok: true; notebooks: OpenNotebook[] }
    | { ok: false; error: string };

export type ListSourcesResult =
    | { ok: true; sources: OpenNotebookSource[] }
    | { ok: false; error: string };

export type SearchResult =
    | { ok: true; results: unknown[] }
    | { ok: false; error: string };

// ── Base-URL resolution (pure / testable) ─────────────────────────────────

/**
 * Resolve the Open Notebook REST API base URL, in priority order:
 *   1. explicit `dwellium-open-notebook-api-url` (if set)
 *   2. derived from the web-UI URL `dwellium-open-notebook-url` by swapping a
 *      trailing `:8502` → `:5055` (the API runs on a different port)
 *   3. default `http://localhost:5055`
 * Trailing slash is always stripped. Pure aside from the localStorage read —
 * safe to call during render (guards against SSR / sandboxed storage).
 */
export function resolveOpenNotebookApiBase(): string {
    let explicit: string | null = null;
    let uiUrl: string | null = null;
    try {
        explicit = localStorage.getItem(LS_API_URL);
        uiUrl = localStorage.getItem(LS_UI_URL);
    } catch {
        /* SSR / sandboxed storage — fall through to default */
    }

    let base: string;
    if (explicit && explicit.trim()) {
        base = explicit.trim();
    } else if (uiUrl && uiUrl.trim()) {
        // Derive the API port from the UI port. Match a trailing :8502 (with an
        // optional trailing slash) and rewrite to :5055; leave anything else as-is.
        base = uiUrl.trim().replace(/:8502(\/?)$/, ':5055$1');
    } else {
        base = DEFAULT_API_BASE;
    }
    return base.replace(/\/+$/, '');
}

/** Read the optional bearer token from localStorage. */
function readToken(): string | null {
    try {
        const t = localStorage.getItem(LS_TOKEN);
        return t && t.trim() ? t.trim() : null;
    } catch {
        return null;
    }
}

/** Build request headers, attaching Authorization only when a token is set. */
function buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    const token = readToken();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
}

/**
 * Run a fetch with our standard timeout, honoring a caller-supplied signal too.
 * The caller's AbortSignal (effect cleanup) and our timeout both abort the request.
 */
async function timedFetch(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    if (signal) {
        if (signal.aborted) ctrl.abort();
        else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
    }
}

function errMessage(e: unknown): string {
    return e instanceof Error ? e.message : 'Network error';
}

// ── Defensive shape normalization ─────────────────────────────────────────

/** Accept a bare array, an `{ items: [...] }`, or a `{ notebooks: [...] }` shape. */
function extractArray(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        const o = data as Record<string, unknown>;
        if (Array.isArray(o.items)) return o.items;
        if (Array.isArray(o.notebooks)) return o.notebooks;
        if (Array.isArray(o.sources)) return o.sources;
        if (Array.isArray(o.results)) return o.results;
        if (Array.isArray(o.data)) return o.data;
    }
    return [];
}

function normalizeNotebook(n: unknown): OpenNotebook {
    const o = (n ?? {}) as Record<string, unknown>;
    return {
        id: String(o.id ?? ''),
        name: String(o.name ?? o.title ?? 'Untitled notebook'),
        description: typeof o.description === 'string' ? o.description : undefined,
        created: typeof o.created === 'string' ? o.created : undefined,
        updated: typeof o.updated === 'string' ? o.updated : undefined,
    };
}

function normalizeSource(s: unknown): OpenNotebookSource {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
        id: String(o.id ?? ''),
        title: typeof o.title === 'string' ? o.title : (typeof o.name === 'string' ? o.name : undefined),
    };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * GET /notebooks → list of notebooks. Tolerates a bare-array body, an
 * `{ items: [...] }` envelope, or a `{ notebooks: [...] }` envelope, and
 * missing per-notebook fields. Never throws.
 */
export async function listNotebooks(signal?: AbortSignal): Promise<ListNotebooksResult> {
    if (typeof window === 'undefined') return { ok: false, error: 'No browser context' };
    const base = resolveOpenNotebookApiBase();
    try {
        const res = await timedFetch(`${base}/notebooks`, { headers: buildHeaders() }, signal);
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const data = (await res.json()) as unknown;
        return { ok: true, notebooks: extractArray(data).map(normalizeNotebook) };
    } catch (e) {
        return { ok: false, error: errMessage(e) };
    }
}

/**
 * GET /sources?notebook_id=<id> → sources for one notebook. Used only to show a
 * best-effort source COUNT; tolerate failure (return ok:false, caller hides count).
 */
export async function listSources(notebookId: string, signal?: AbortSignal): Promise<ListSourcesResult> {
    if (typeof window === 'undefined') return { ok: false, error: 'No browser context' };
    if (!notebookId) return { ok: false, error: 'Missing notebook id' };
    const base = resolveOpenNotebookApiBase();
    try {
        const url = `${base}/sources?notebook_id=${encodeURIComponent(notebookId)}`;
        const res = await timedFetch(url, { headers: buildHeaders() }, signal);
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const data = (await res.json()) as unknown;
        return { ok: true, sources: extractArray(data).map(normalizeSource) };
    } catch (e) {
        return { ok: false, error: errMessage(e) };
    }
}

/**
 * POST /search → cross-notebook search. Body is kept minimal/defensive:
 * `{ query }` plus an optional `notebook_id` / `limit` when provided. Returns
 * the raw result array (callers shape it). Never throws.
 */
export async function search(
    query: string,
    opts?: { notebookId?: string; limit?: number },
    signal?: AbortSignal,
): Promise<SearchResult> {
    if (typeof window === 'undefined') return { ok: false, error: 'No browser context' };
    const base = resolveOpenNotebookApiBase();
    try {
        const body: Record<string, unknown> = { query };
        if (opts?.notebookId) body.notebook_id = opts.notebookId;
        if (typeof opts?.limit === 'number') body.limit = opts.limit;
        const res = await timedFetch(
            `${base}/search`,
            { method: 'POST', headers: { ...buildHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
            signal,
        );
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const data = (await res.json()) as unknown;
        return { ok: true, results: extractArray(data) };
    } catch (e) {
        return { ok: false, error: errMessage(e) };
    }
}

/** Convenience namespace import: `import { openNotebookClient } from '…'`. */
export const openNotebookClient = {
    resolveApiBase: resolveOpenNotebookApiBase,
    listNotebooks,
    listSources,
    search,
};
