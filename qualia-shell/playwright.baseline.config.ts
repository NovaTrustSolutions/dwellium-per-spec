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
 * Phase 6 Task 6.8 (2026-05-11): extended testMatch from the original 2
 * baseline specs (screenshot-baseline + axe-baseline) to also include
 * the 3 AppFolio-parity feature specs that have been running cleanly
 * under playwright.config.ts::chromium since 6.6/6.7 (8/8 PASS). Feature
 * specs run cleanly under this config since it is functionally the
 * static-API subset of playwright.config.ts::chromium (both use
 * VITE_USE_STATIC_API=true + npm run dev + chromium-only + workers: 1).
 * Phase-7 Task 7.3 (2026-05-12): retries field bumped from `0` to
 * `process.env.CI ? 2 : 0` per Cowork Option C verdict in response to
 * Linux CI render-timing flake at axe-baseline.spec.ts:93 (Residents
 * 30s timeout). Mirrors playwright.config.ts CI default of 2. Local
 * darwin retains retries: 0 to preserve fast-feedback-loop. Closes
 * Phase-7 Block C item #1 (retries-delta carry-forward) opportunistically.
 * Class taxonomy stays CI-CONFIG-ONLY (CI-flake-tolerance-policy domain
 * distinct from testMatch test-discovery domain).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'screenshot-baseline.spec.ts',
    'axe-baseline.spec.ts',
    'strata-nav.spec.ts',
    'appfolio-parity-workorder.spec.ts',
    'appfolio-parity-vendor-compliance.spec.ts',
  ],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
