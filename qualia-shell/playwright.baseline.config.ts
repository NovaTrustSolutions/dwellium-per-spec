import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 0.0 baseline-only Playwright config — FRONTEND + STATIC API.
 *
 * The main playwright.config.ts boots both qualia-shell (5173) AND a
 * sibling ai-dashboard369-file-manager backend (3000). This config skips
 * the backend dependency by setting VITE_USE_STATIC_API=true on the
 * vite dev server, which routes all strataApi calls to the in-memory
 * fixtures + localStorage stub (strataApi.static.ts). Result: real
 * fixture data renders WITHOUT needing the sibling backend running.
 *
 * When to use which config:
 *   - playwright.baseline.config.ts (this file): the default for
 *     dev-box baseline captures. Vite-only, static API, real fixture
 *     UI. Snapshots reflect the in-memory dataset.
 *   - playwright.config.ts (main): only needed when validating against
 *     the live backend. Requires ../ai-dashboard369-file-manager
 *     cloned and running on :3000.
 *
 * This config runs ONLY screenshot-baseline.spec.ts and
 * axe-baseline.spec.ts via testMatch, so it won't accidentally pick up
 * other e2e tests that depend on the backend.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['screenshot-baseline.spec.ts', 'axe-baseline.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

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
  ],

  // Only the frontend — VITE_USE_STATIC_API=true routes strataApi calls
  // to the in-memory fixtures, so no sibling backend dependency.
  webServer: {
    command: 'npm run dev',
    port: 5173,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_USE_STATIC_API: 'true',
    },
  },
});
