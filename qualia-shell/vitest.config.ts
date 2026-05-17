import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Phase-8+ Task 8.6 — Vitest config (SPLIT from vite.config.ts per Cowork Verdict 3 LOCK)
 *
 * Split rationale (Finding R preventive remediation):
 *   The original `qualia-shell/vite.config.ts` mixed Vite build config (server
 *   proxy + plugins) with Vitest config (test block). Wiring `@react-router/dev/vite`
 *   reactRouter() plugin at Task 8.6 step-3 would conflict with vitest/config's
 *   `defineConfig` import — reactRouter() expects standard Vite `defineConfig`
 *   from 'vite' (NOT 'vitest/config'). The conflict surfaces as type-checking
 *   failure at Step-4 strict gate.
 *
 *   Per Cowork Verdict 3 LOCK at Task 8.6 PRE0: SPLIT vite.config.ts into
 *   (a) `vite.config.ts` — Vite build config with reactRouter() plugin
 *   (b) `vitest.config.ts` — Vitest-only config with test block here
 *
 *   Vitest auto-discovers vitest.config.ts when invoked (canonical Vitest
 *   convention; sister-shape to react-router.config.ts discovery convention).
 *
 * Test-block content preserved byte-for-byte from `vite.config.ts` L13-L18
 * pre-split state at HEAD-post-8.5 (d98bd48).
 */
export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        include: ['src/**/*.test.{ts,tsx}'],
    },
});
