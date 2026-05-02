import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration — Phase 4.2 (extended at Phase-5 Task 5.3)
 *
 * Runs against the local dev stack:
 *   - Backend: Express on port 3000  (ai-dashboard369-file-manager)
 *   - Frontend: Vite on port 5173    (qualia-shell)
 *
 * Usage:
 *   npm run e2e            # headless (default project: chromium / static-API mode)
 *   npm run e2e:headed     # visible browser
 *   npm run e2e:ui         # interactive Playwright UI
 *   E2E_TARGET=real-backend npx playwright test  # real-backend project (Phase-5 Task 5.3)
 *
 * Phase-5 Task 5.3 (2026-05-02): added `--project=real-backend` alternative to
 * the default per Plan v2 §8 + Docs/Phases/Phase_5_Plan.md L142-159 verbatim.
 * Default project (`chromium`) preserves the rollback statement at
 * Phase_5_Plan.md L159 — "E2E continues to run against the static API as the
 * default profile". The real-backend project requires the sibling repo
 * `../ai-dashboard369-file-manager` AND a Phase-4-bulk-data-seeded staging DB
 * to be present (out-of-repo per Docs/Phases/Phase_5_Plan.md L142-159 + R-4
 * v2.26 cross-repo amendment); cross-repo handoff convention captured in
 * JSDoc here mirrors Task 5.1d strataApi.backend.ts JSDoc precedent.
 *
 * E2E_TARGET env var: defined-but-not-required convention mirrors Task 5.1c
 * VITE_PARITY_LIVE_BACKEND at .env.example:17. Unset → chromium project
 * (static-API mode); `real-backend` → real-backend project (live-backend mode
 * with Vite VITE_USE_STATIC_API=false + sibling-repo Express on :3000).
 */
const E2E_TARGET = process.env.E2E_TARGET || 'static';
const IS_REAL_BACKEND = E2E_TARGET === 'real-backend';

const viteEnv: Record<string, string> = IS_REAL_BACKEND
  ? { VITE_USE_STATIC_API: 'false', VITE_PARITY_LIVE_BACKEND: 'true' }
  : { VITE_USE_STATIC_API: 'true' };

const viteWebServer = {
  command: 'npm run dev',
  port: 5173,
  timeout: 15_000,
  reuseExistingServer: !process.env.CI,
  env: viteEnv,
};

const realBackendWebServer = {
  command: 'npm run dev',
  cwd: '../ai-dashboard369-file-manager',
  port: 3000,
  timeout: 30_000,
  reuseExistingServer: !process.env.CI,
};

const webServers = IS_REAL_BACKEND
  ? [realBackendWebServer, viteWebServer]
  : [viteWebServer];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tests share auth state → run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker to avoid port contention
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'real-backend',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start servers before tests. webServer composition switches per E2E_TARGET:
   *   E2E_TARGET unset / "static" (default) → Vite only (VITE_USE_STATIC_API=true)
   *   E2E_TARGET=real-backend → sibling-repo Express + Vite (VITE_USE_STATIC_API=false)
   */
  webServer: webServers,
});
