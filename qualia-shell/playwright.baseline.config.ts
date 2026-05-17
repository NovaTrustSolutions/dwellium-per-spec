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
 *
 * Phase-7 Task 7.3 v2.50.2 (2026-05-12): timeout field added at 60_000
 * (vs Playwright default 30_000) per Cowork Option B.2 verdict in response
 * to PR #58 parity gate run 25746991992 empirical finding (retries-bump
 * alone did NOT fix the Linux render-timing flake — failures hit
 * MULTIPLE surfaces [Residents/Vendors/Overview] across retries =
 * deterministic Linux runner slowness, not jitter). 60s = 2× Playwright
 * default = ~12× local darwin baseline (5.15s/test average); conservative
 * safety margin for Linux CI runner variance without masking real perf
 * regressions on non-axe specs. Class taxonomy stays CI-CONFIG-ONLY
 * (CI-flake-tolerance-policy sub-domain; same shape as retries field).
 *
 * Phase-7 Task 7.4 v2.51.1 (2026-05-12): timeout field bumped further
 * from 60_000 to 90_000 per Cowork Option B.3 verdict in response to
 * PR #59 parity gate run 25774373725 empirical failure (Vendors axe scan
 * hits deterministic 60s timeout across 3 retries; CI variance drift since
 * 7.3 close pushed Vendors from ~55s observed margin → ~60s+ wall).
 * 90s = 3× Playwright default = ~64% headroom over 55s baseline observed
 * at 7.3 run 25754846170. 3rd calibration data point on the timeout field
 * sub-domain (30s default → 60s v2.50.2 → 90s v2.51.1).
 *
 * Phase-8+ Task 8.6 v2.66.2 (2026-05-17): webServer command swapped from
 * `npm run dev` → `npx vite preview --port 5173 --outDir build/client` per
 * Cowork Verdict 1 Approach A LOCK in response to Parity Gate run
 * 25986642863 ✗ FAILURE at step 8 (Playwright axe-baseline E2E) per
 * Finding U empirical-CI-runtime-altitude. Empirical signature: `react-router
 * dev` at framework-mode altitude (HEAD-post-8.6) returns RR v7 default
 * HydrateFallback shell ("💿 Hey developer 👋" developer-console message)
 * on initial server response; full hydration chain (virtual modules + RR
 * runtime + app/root.tsx Root() + route modules + LoginScreen) must
 * complete client-side before `.login-start-overlay` mounts to DOM; on
 * Linux CI this exceeds expect(overlay).toBeVisible({ timeout: 10_000 })
 * budget at helpers/auth.ts:59. Approach A canonical pattern: CI gate
 * tests the production-build path users consume, not dev-server hydration
 * overhead. Sister-shape to v2.66.1 in-place CI patch within Task 8.6
 * (build-command altitude vs v2.66.2 at server-startup altitude) —
 * establishes 2-in-place-patches-per-task precedent at Phase-8+ Block B
 * opener mirroring Phase-7 Task 7.3 v2.50.1+v2.50.2 escalation shape.
 * Pre-Playwright `npx react-router build` step inserted at
 * .github/workflows/appfolio-parity-gate.yml (Deliverable A1) produces
 * `qualia-shell/build/client/` for `vite preview` consumption by this
 * webServer. Post-Playwright build steps preserved unchanged (preserve
 * dual-mode SEEDS=true/false gate semantics).
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
  timeout: 90_000,
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
  // Phase-8+ Task 8.6 v2.66.2: serves the production build at
  // `build/client/` (Approach A LOCK per Finding U). Pre-Playwright
  // `npx react-router build` step in appfolio-parity-gate.yml produces
  // the bundle BEFORE this server starts; reuseExistingServer flag
  // preserves local dev-loop ergonomics.
  webServer: {
    command: 'npx vite preview --port 5173 --outDir build/client',
    port: 5173,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_USE_STATIC_API: 'true',
    },
  },
});
