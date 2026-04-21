import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration — Phase 4.2
 *
 * Runs against the local dev stack:
 *   - Backend: Express on port 3000  (ai-dashboard369-file-manager)
 *   - Frontend: Vite on port 5173    (qualia-shell)
 *
 * Usage:
 *   npm run e2e            # headless
 *   npm run e2e:headed     # visible browser
 *   npm run e2e:ui         # interactive Playwright UI
 */
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
  ],

  /* Start both servers before tests */
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../ai-dashboard369-file-manager',
      port: 3000,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      port: 5173,
      timeout: 15_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
