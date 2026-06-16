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
    console.log(`[netlify] Emitting /health and /api/* proxy redirects to ${target}`);
} else {
    console.warn('[netlify] NETLIFY_API_PROXY_TARGET is not set; backend-backed features will use offline/reconnect handling until an API target is configured.');
}

lines.push('/* /index.html 200');

await mkdir(clientDir, { recursive: true });
await writeFile(redirectsPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`[netlify] Wrote ${redirectsPath}`);
