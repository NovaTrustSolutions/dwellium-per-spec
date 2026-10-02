import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(scriptDir, '../build/client');
const redirectsPath = path.join(clientDir, '_redirects');

const rawTarget = process.env.NETLIFY_API_PROXY_TARGET || '';
const lines = [];

if (rawTarget) {
    const target = rawTarget.replace(/\/+$/, '');
    lines.push(`/health ${target}/health 200!`);
    lines.push(`/api/* ${target}/api/:splat 200!`);
    // Interactive Docs public pages: https://<site>/p/<slug> → backend `/api/idocs/p/:slug`
    // (Docs/idocs-wave3-api.md §1b). Must sit before the SPA catch-all.
    lines.push(`/p/* ${target}/api/idocs/p/:splat 200!`);
    // plan 077 — short links live on the app domain; the backend answers 302 to the destination.
    // Verify after deploy with `curl -sI https://<app>/l/<slug>` expecting `302` + `Location`,
    // NOT a `200 text/html` (Netlify serves index.html with 200 for anything it does not proxy).
    lines.push(`/l/* ${target}/l/:splat 200!`);
    console.log(`[netlify] Emitting /health, /api/*, /p/* and /l/* proxy redirects to ${target}`);
} else {
    console.warn('[netlify] NETLIFY_API_PROXY_TARGET is not set; backend-backed features will use offline/reconnect handling until an API target is configured.');
}

lines.push('/* /index.html 200');

await mkdir(clientDir, { recursive: true });
await writeFile(redirectsPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`[netlify] Wrote ${redirectsPath}`);
