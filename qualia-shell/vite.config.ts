import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import netlifyPlugin from '@netlify/vite-plugin-react-router';
import { cloneAndAnalyze } from './scripts/kgAnalyze.mjs';
import { scanFolder } from './scripts/kbScan.mjs';
import fs from 'node:fs';
import path from 'node:path';

/**
 * kgGraphRepoPlugin — dev-server route that REALLY clones + graphs a repo for
 * the Halocron Knowledge Graph "Add a project" flow. Runs on the dev machine
 * (which has git + node), so it genuinely clones the URL, builds the static
 * import graph, writes public/data/kg/<id>.json, and returns the project card.
 * Path is OUTSIDE /api so it isn't swallowed by the backend proxy below.
 */
function kgGraphRepoPlugin() {
    return {
        name: 'kg-graph-repo',
        configureServer(server: import('vite').ViteDevServer) {
            server.middlewares.use('/__kg/graph-repo', (req, res) => {
                if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
                let body = '';
                req.on('data', (c) => { body += c; });
                req.on('end', async () => {
                    res.setHeader('Content-Type', 'application/json');
                    try {
                        const { url } = JSON.parse(body || '{}');
                        const card = await cloneAndAnalyze(String(url || ''));
                        res.end(JSON.stringify({ success: true, project: card }));
                    } catch (e) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ success: false, error: (e as Error).message }));
                    }
                });
            });
        },
    };
}

/**
 * Phase-8+ Task 8.6 — Vite config (SPLIT from prior dual-purpose config per Cowork Verdict 3 LOCK)
 *
 * Wires `@react-router/dev/vite` reactRouter() plugin for RR v7 framework-mode
 * build orchestration. Replaces prior `@vitejs/plugin-react` direct usage —
 * reactRouter() internally composes the React plugin alongside RR v7 routing
 * infrastructure (entry point generation, route module compilation, manifest
 * emission).
 *
 * Split rationale: prior vite.config.ts imported from 'vitest/config' (mixed
 * Vite + Vitest config), which is incompatible with @react-router/dev/vite's
 * standard 'vite' defineConfig expectation. Vitest config moved to dedicated
 * `vitest.config.ts` (auto-discovered by Vitest CLI; canonical convention).
 *
 * Build output shape change (Task 8.6 introduces; surfaces as Finding S candidate
 * at Step-4-bis verification):
 *   - Pre-split (HEAD-post-8.5 d98bd48): `npx vite build` → `dist/` directory
 *     with `dist/index.html` + `dist/assets/*.js` + `dist/assets/*.css`
 *   - Post-split (HEAD-post-8.6): `npm run build` (→ `react-router build`) →
 *     `build/client/` directory (ssr: false initial state per react-router.config.ts)
 *     with framework-mode client manifest + route module chunks
 *
 * Server proxy block from prior config preserved unchanged for dev mode
 * (`npm run dev` → `react-router dev` → internally consumes this config's
 * server block for /api + /health proxying to backend at localhost:3000).
 */
/**
 * kbScanPlugin — dev-server route for Scribe's knowledge-base folder. Walks a
 * local folder on the dev machine and returns its text files so the client can
 * AI-summarize each into a short wiki. Path is outside /api (not proxied).
 */
function kbScanPlugin() {
    return {
        name: 'kb-scan',
        configureServer(server: import('vite').ViteDevServer) {
            server.middlewares.use('/__kb/scan', (req, res) => {
                if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
                let body = '';
                req.on('data', (c) => { body += c; });
                req.on('end', () => {
                    res.setHeader('Content-Type', 'application/json');
                    try {
                        const { folder } = JSON.parse(body || '{}');
                        if (!folder || typeof folder !== 'string') throw new Error('Provide a folder path');
                        res.end(JSON.stringify({ success: true, ...scanFolder(folder) }));
                    } catch (e) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ success: false, error: (e as Error).message }));
                    }
                });
            });
            server.middlewares.use('/__kb/list-directories', (req, res) => {
                if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
                let body = '';
                req.on('data', (c) => { body += c; });
                req.on('end', () => {
                    res.setHeader('Content-Type', 'application/json');
                    try {
                        const { folder } = JSON.parse(body || '{}');
                        let targetDir = folder ? String(folder).replace(/^~(?=\/|$)/, process.env.HOME || '') : (process.env.HOME || '.');
                        targetDir = path.resolve(targetDir);
                        const stats = fs.statSync(targetDir);
                        if (!stats.isDirectory()) {
                            throw new Error('Not a directory');
                        }
                        const items = fs.readdirSync(targetDir, { withFileTypes: true });
                        const subdirs = items
                            .filter((item: any) => item.isDirectory() && !item.name.startsWith('.'))
                            .map((item: any) => item.name);
                        const parent = path.dirname(targetDir);
                        res.end(JSON.stringify({
                            success: true,
                            current: targetDir,
                            parent: parent !== targetDir ? parent : null,
                            subdirs: subdirs.sort()
                        }));
                    } catch (e) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ success: false, error: (e as Error).message }));
                    }
                });
            });
        },
    };
}

/**
 * eyeContactPlugin — dev-server route that serves the standalone MediaPipe
 * eye-correction prototype files from host's scratch folder under the dev origin
 * /__eye-contact path. Pre-bundled/cached in memory or read from disk.
 */
function eyeContactPlugin() {
    return {
        name: 'eye-contact-plugin',
        configureServer(server: import('vite').ViteDevServer) {
            server.middlewares.use('/__eye-contact', (req, res) => {
                const url = new URL(req.url || '', 'http://localhost');
                let pathname = url.pathname;
                if (pathname === '/' || !pathname) pathname = '/index.html';

                const targetPath = path.join('/Users/ilyaklipinitser/.gemini/antigravity-ide/scratch/eye-contact-prototype', pathname);
                if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
                    const ext = path.extname(targetPath);
                    const mimeTypes: Record<string, string> = {
                        '.html': 'text/html',
                        '.js': 'application/javascript',
                        '.css': 'text/css',
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.json': 'application/json'
                    };
                    res.setHeader('Content-Type', mimeTypes[ext] || 'text/plain');
                    res.end(fs.readFileSync(targetPath));
                } else {
                    res.statusCode = 404;
                    res.end('Not found');
                }
            });
        },
    };
}

export default defineConfig({
    // netlifyPlugin() adapts the RR v7 framework-mode SSR build for Netlify
    // Functions. Gated on the NETLIFY env var (Netlify sets it during its own
    // builds) so LOCAL builds + the strict-gate SSR smoke test keep emitting the
    // standard build/server/index.js, while Netlify's build reshapes the server
    // output into a deployable function. Without this gate the smoke test fails
    // (the plugin renames the server entry to server.js / server-build.js).
    plugins: [
        reactRouter(),
        ...(process.env.NETLIFY ? [netlifyPlugin()] : []),
        kgGraphRepoPlugin(),
        kbScanPlugin(),
        eyeContactPlugin(),
    ],
    // 2026-06-12 live-sweep fix: pre-bundle the heavy deps that widgets pull
    // in via dynamic import (terminal → @xterm, doc-viewer/pdf-gear →
    // pdf-lib/pdfjs/tesseract/mammoth/docx, scribe → codemirror family).
    // Without this, the FIRST open of each widget triggered a mid-flight Vite
    // dep re-optimization → the dynamic import failed → lazyWithReload
    // force-reloaded the page (felt like being logged out). Pre-bundling
    // removes the failure at the source; lazyWithReload's in-place retry
    // covers anything else.
    optimizeDeps: {
        // Scan ALL widget source at server start so esbuild discovers every
        // dependency (including ones behind dynamic import()) up front —
        // a dep discovered MID-SESSION forces a re-optimization that 504s
        // in-flight imports and ends in a forced page reload (the
        // "clicking a widget / Space logs you out" bug, F-013).
        entries: [
            './index.html',
            './src/registry/widgetRegistry.ts',
            './src/components/**/*.tsx',
        ],
        // Explicit union of heavy/dynamic-imported deps (belt and braces).
        include: [
            '@xterm/xterm',
            '@xterm/addon-fit',
            'pdf-lib',
            'pdfjs-dist',
            'tesseract.js',
            'mammoth',
            'docx',
            'codemirror',
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/language',
            '@codemirror/search',
            '@codemirror/autocomplete',
            '@codemirror/lang-markdown',
            '@lezer/highlight',
            '@lezer/markdown',
            'recharts',
            'react-markdown',
            'remark-gfm',
            'dompurify',
            'zustand',
            '@tanstack/react-query',
            '@sentry/react',
            '@anam-ai/js-sdk',
            'lucide-react',
        ],
        // wasm/worker-based AI packages must be served natively (pre-bundling
        // breaks their worker/wasm resolution); excluded deps never trigger
        // a mid-session re-optimization either.
        exclude: [
            '@huggingface/transformers',
            '@moonshine-ai/moonshine-js',
        ],
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000',
            '/health': 'http://localhost:3000',
        },
    },
});
