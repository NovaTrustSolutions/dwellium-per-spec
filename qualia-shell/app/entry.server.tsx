import { PassThrough } from 'node:stream';

import type { AppLoadContext, EntryContext } from 'react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';

/**
 * Phase-8+ Task 8.7 — React Router v7 framework-mode canonical server entry boundary
 *
 * Custom override of RR v7 default `entry.server.node.tsx` per Cowork Verdict 13 LOCK
 * (renderToPipeableStream + Node.js runtime; matches existing /api proxy backend at
 * localhost:3000 + production Node.js deployment plan). Edge variant
 * `renderToReadableStream` + `entry.server.edge.tsx` deferred to Phase-9+ if Edge
 * deployment emerges as future requirement.
 *
 * Finding W cementation (per Cowork Verdict 16 LOCK at Task 8.7 §0 of Completion Report):
 * Kickoff brief Q3.c hypothesis "entry.server.tsx is functionally inactive at ssr: false"
 * is EMPIRICALLY REFUTED. This file IS structurally invoked at build time in SPA Mode
 * via `routerContext.isSpaMode: true` branch (selects `onAllReady` callback over
 * `onShellReady`). The build-time invocation produces `build/client/index.html` shell
 * via `renderToPipeableStream(<ServerRouter />)` — only the *server build output* at
 * `build/server/` is post-emission removed per verbatim build log "Removing the server
 * build in /.../build/server due to ssr:false". 8th distinct altitude for v2.60.1
 * cluster (entry-boundary-build-time-invocation altitude).
 *
 * Finding V remediation candidate (HydrateFallback path per Verdict 15 LOCK): the
 * companion `app/root.tsx::HydrateFallback` named export carries the FOUC IIFE + 5
 * SSR-ready meta tags + Google Fonts preconnect to the build-time `build/client/index.html`
 * shell. This entry.server.tsx renders `<ServerRouter context={routerContext} url={url} />`
 * which composes HydrateFallback into the static shell at SPA Mode build time.
 *
 * Empirical equivalence to RR v7 default `entry.server.node.tsx` (276 B / 9 LOC for
 * entry.client.tsx + 2,962 B / ~85 LOC for entry.server.node.tsx per Q4-d default
 * inspection at `node_modules/@react-router/dev/dist/config/defaults/`):
 *   - `streamTimeout: 5_000` ms (5s server-side render timeout; canonical RR v7 default)
 *   - HEAD request short-circuit (RFC 9110 compliance; empty body + status + headers)
 *   - `routerContext.isSpaMode || isbot(user-agent)` selects `onAllReady` (wait for full
 *     content render before shipping HTML; SPA Mode + crawlers/bots use case)
 *   - Otherwise `onShellReady` (streaming use case; ship shell ASAP + stream body
 *     content as it renders; human user-agent default)
 *   - `PassThrough` + `createReadableStreamFromReadable` bridge Node.js stream API
 *     to web Response stream
 *   - Error boundaries: `onShellError` (rejects promise; shell render failure) +
 *     `onError` (logs streaming render error; non-fatal post-shell)
 *
 * Task 8.8 follow-on: ssr: false → ssr: true flip will make this entry boundary
 * runtime-active for per-request server-side rendering. At ssr: false (current state),
 * this entry boundary is invoked ONCE at build time to generate the SPA Mode shell
 * (build/client/index.html) per Finding W empirical signature.
 */

export const streamTimeout = 5_000;

export default function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    _loadContext: AppLoadContext,
) {
    // RFC 9110 §9.3.2: HEAD must return same headers as GET with empty body.
    if (request.method.toUpperCase() === 'HEAD') {
        return new Response(null, {
            status: responseStatusCode,
            headers: responseHeaders,
        });
    }

    return new Promise((resolve, reject) => {
        let shellRendered = false;
        const userAgent = request.headers.get('user-agent');

        // Ensure requests from bots AND SPA Mode build-time renders wait for all
        // content to load before responding. SPA Mode build emits a static shell;
        // crawlers/bots need full HTML for SEO; both benefit from onAllReady.
        const readyOption: keyof RenderToPipeableStreamOptions =
            (userAgent && isbot(userAgent)) || routerContext.isSpaMode
                ? 'onAllReady'
                : 'onShellReady';

        // Abort rendering stream after streamTimeout + 1s headroom to flush
        // rejected Suspense boundaries.
        let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
            () => abort(),
            streamTimeout + 1000,
        );

        const { pipe, abort } = renderToPipeableStream(
            <ServerRouter context={routerContext} url={request.url} />,
            {
                [readyOption]() {
                    shellRendered = true;
                    const body = new PassThrough({
                        final(callback) {
                            clearTimeout(timeoutId);
                            timeoutId = undefined;
                            callback();
                        },
                    });
                    const stream = createReadableStreamFromReadable(body);

                    responseHeaders.set('Content-Type', 'text/html');

                    pipe(body);

                    resolve(
                        new Response(stream, {
                            headers: responseHeaders,
                            status: responseStatusCode,
                        }),
                    );
                },
                onShellError(error: unknown) {
                    reject(error);
                },
                onError(error: unknown) {
                    responseStatusCode = 500;
                    // Log streaming render errors INSIDE the shell only. Pre-shell
                    // errors reject onShellError + get logged in handleDocumentRequest.
                    if (shellRendered) {
                        console.error(error);
                    }
                },
            },
        );
    });
}
