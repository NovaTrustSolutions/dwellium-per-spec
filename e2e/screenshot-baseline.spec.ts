import { test, expect, Page } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * E2E — Phase 0.0 Task 0.0.9 — Screenshot baseline.
 *
 * Logs in once, opens Strata, navigates to each of the 8 AppFolio-parity
 * baseline modules, waits for layout to settle, and captures a full-page
 * screenshot. First-run generates the golden snapshots in
 * e2e/__screenshots__/screenshot-baseline.spec.ts-snapshots/. Subsequent
 * runs diff against them.
 *
 * Usage on real dev box:
 *   # First run — capture baselines
 *   npx playwright test e2e/screenshot-baseline.spec.ts --update-snapshots
 *
 *   # Subsequent runs — diff against baselines
 *   npx playwright test e2e/screenshot-baseline.spec.ts
 *
 * Notes:
 *   - Strata modules are state-driven (not URL-driven), so each test clicks
 *     the nav button instead of navigating.
 *   - We wait for .s-main-content + a short settle to avoid animation flake.
 *   - The 8 pages mirror the AppFolio parity scope.
 */

const BASELINE_MODULES = [
  { id: 'overview', label: 'Overview' },
  { id: 'properties', label: 'Properties' },
  { id: 'leasing', label: 'Leasing' },
  { id: 'residents', label: 'Residents' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'owners', label: 'Owners' },
  { id: 'accounting', label: 'Accounting' },
  { id: 'maintenance', label: 'Maintenance' },
] as const;

async function ensurePropertyManagementExpanded(page: Page) {
  // Widget groups are collapsed by default. Expand "Property Management"
  // so the Strata widget becomes clickable.
  const pmGroup = page.locator('.sidebar__widget-group', {
    has: page.locator('.sidebar__widget-group-label', { hasText: 'Property Management' }),
  });
  const strataWidget = pmGroup.locator('.sidebar-widget', {
    has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
  });
  if (!(await strataWidget.isVisible().catch(() => false))) {
    await pmGroup.locator('.sidebar__widget-group-header').click();
    await expect(strataWidget).toBeVisible({ timeout: 5_000 });
  }
}

async function openStrataAndNavigate(page: Page, label: string) {
  // Open Strata window from sidebar (unless already open).
  const strataNav = page.locator('.s-sidebar-nav');
  if (!(await strataNav.isVisible().catch(() => false))) {
    await ensurePropertyManagementExpanded(page);
    const strataWidget = page.locator('.sidebar-widget', {
      has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
    });
    await strataWidget.click();
    await expect(strataNav).toBeVisible({ timeout: 10_000 });
  }

  // Click the target module.
  const navButton = page.locator('.s-nav-item', {
    has: page.locator('span', { hasText: label }),
  });
  await navButton.click();

  // Wait for the module content pane.
  await expect(page.locator('.s-main-content')).toBeVisible();

  // Settle: animations, fixture hydration, chart renders.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

test.describe('Screenshot baseline — AppFolio parity modules', () => {
  test.beforeEach(async ({ page }) => {
    // Seed a consistent viewport so diffs are meaningful across machines.
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, USERS.andy);
  });

  for (const mod of BASELINE_MODULES) {
    test(`${mod.label} — baseline snapshot`, async ({ page }) => {
      await openStrataAndNavigate(page, mod.label);

      // Mask dynamic surfaces (clocks, "N seconds ago", unsanitized seed ids).
      const dynamicMasks = [
        page.locator('.sidebar__clock'),
        page.locator('[data-dynamic="timestamp"]'),
        page.locator('.s-relative-time'),
      ];

      await expect(page).toHaveScreenshot(`${mod.id}.png`, {
        fullPage: true,
        mask: dynamicMasks,
        maxDiffPixelRatio: 0.01, // Tolerate ~1% pixel drift (font AA, scrollbars).
        animations: 'disabled',
      });
    });
  }
});
