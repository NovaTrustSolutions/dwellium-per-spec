import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';

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
export default defineConfig({
    plugins: [reactRouter()],
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000',
            '/health': 'http://localhost:3000',
        },
    },
});
