import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * E2E Test 2 — Strata Module Navigation
 *
 * Spec (from qualia-improvement-plan.md §4.2):
 *   Open Strata → click each of 5 main module tabs → verify no error boundary
 *
 * We open Strata via the sidebar widget, then click through the key modules
 * in the Strata nav panel. We verify:
 *   - No WidgetErrorBoundary appears (no crash)
 *   - The module content area renders
 */

// Top 5 Strata modules to test navigation (most critical to the business)
const MODULES_TO_TEST = [
  { label: 'Overview', selector: '.s-dashboard' },
  { label: 'Properties', selector: '.s-main-content' },
  { label: 'Leasing', selector: '.s-main-content' },
  { label: 'Residents', selector: '.s-main-content' },
  { label: 'Maintenance', selector: '.s-main-content' },
];

test.describe('Strata Module Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.andy);
  });

  test('can open Strata widget from sidebar', async ({ page }) => {
    // Find and click the Strata widget in the sidebar
    const strataWidget = page.locator('.sidebar-widget', {
      has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
    });
    await strataWidget.click();

    // Strata should load inside a window — look for the Strata nav sidebar
    const strataNav = page.locator('.s-sidebar-nav');
    await expect(strataNav).toBeVisible({ timeout: 10_000 });
  });

  for (const mod of MODULES_TO_TEST) {
    test(`navigating to "${mod.label}" does not crash`, async ({ page }) => {
      // Open Strata
      const strataWidget = page.locator('.sidebar-widget', {
        has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
      });
      await strataWidget.click();

      // Wait for Strata nav
      const strataNav = page.locator('.s-sidebar-nav');
      await expect(strataNav).toBeVisible({ timeout: 10_000 });

      // Click the module tab
      const navButton = page.locator('.s-nav-item', {
        has: page.locator('span', { hasText: mod.label }),
      });
      await navButton.click();

      // Wait a beat for the module to render
      await page.waitForTimeout(500);

      // Verify no error boundary triggered
      const errorBoundary = page.locator('text=encountered an error');
      await expect(errorBoundary).not.toBeVisible();

      // The main content area should still be present
      const mainContent = page.locator('.s-main-content');
      await expect(mainContent).toBeVisible();
    });
  }
});
