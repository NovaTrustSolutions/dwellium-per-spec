/**
 * apiProxy — server-side reverse proxy for /api/* (resource route).
 *
 * In this production deployment the frontend is served by `react-router-serve`
 * on :5173 and the backend runs on :3000. Components that call same-origin
 * relative paths (`fetch('/api/tasks/...')`) would otherwise hit the SPA splat
 * route on :5173 (→ 405, no action). This resource route catches `/api/*` and
 * forwards it to the backend origin SERVER-SIDE (node→node, so no CORS),
 * passing method, path, query, headers, and body straight through.
 *
 * Resource route = no default component export; `loader` handles GET/HEAD,
 * `action` handles POST/PUT/PATCH/DELETE. Wired in app/routes.ts as
 * `route('/api/*', 'routes/apiProxy.tsx')` (more specific than the '*' splat).
 *
 * Backend origin is configurable via BACKEND_ORIGIN (default http://localhost:3000).
 */
import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';

export const BACKEND_ORIGIN: string =
    (typeof process !== 'undefined' && process.env && process.env.BACKEND_ORIGIN) || 'http://localhost:3000';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// Hop-by-hop / recomputed headers we must not forward verbatim.
const STRIP_REQUEST_HEADERS = ['host', 'connection', 'content-length'];
const STRIP_RESPONSE_HEADERS = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];

/**
 * Forward an incoming /api/* request to the backend, preserving method, path,
 * query, headers, and body. `fetchImpl` is injected so this is unit-testable.
 * A backend that's unreachable yields a clean 502 (never a crash) — which the
 * app's routeCard treats as "queued/offline".
 */
export async function proxyRequest(request: Request, backendOrigin: string, fetchImpl: FetchLike = fetch): Promise<Response> {
    const url = new URL(request.url);
    const target = backendOrigin.replace(/\/$/, '') + url.pathname + url.search;

    const headers = new Headers(request.headers);
    for (const h of STRIP_REQUEST_HEADERS) headers.delete(h);

    const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        try { init.body = await request.arrayBuffer(); } catch { /* no/empty body */ }
    }

    let upstream: Response;
    try {
        upstream = await fetchImpl(target, init);
    } catch (err) {
        return new Response(
            JSON.stringify({ error: 'backend_unreachable', target, detail: String((err as Error)?.message ?? err) }),
            { status: 502, headers: { 'content-type': 'application/json' } },
        );
    }

    const respHeaders = new Headers(upstream.headers);
    for (const h of STRIP_RESPONSE_HEADERS) respHeaders.delete(h);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: respHeaders });
}

export async function loader({ request }: LoaderFunctionArgs) {
    return proxyRequest(request, BACKEND_ORIGIN);
}

export async function action({ request }: ActionFunctionArgs) {
    return proxyRequest(request, BACKEND_ORIGIN);
}
