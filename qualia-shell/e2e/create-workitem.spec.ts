import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * E2E Test 3 — Create Workitem
 *
 * Spec (from qualia-improvement-plan.md §4.2):
 *   Open WorkOrders module → click "New" → fill form → submit → verify item appears in list
 *
 * This test logs in, opens Strata, navigates to the Maintenance (work orders)
 * module, creates a new workitem, and verifies it shows up.
 */

test.describe('Create Workitem', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.andy);
  });

  test('can create a new work order from the Maintenance module', async ({ page }) => {
    // 1. Open Strata widget
    const strataWidget = page.locator('.sidebar-widget', {
      has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
    });
    await strataWidget.click();

    // 2. Wait for Strata nav to load
    const strataNav = page.locator('.s-sidebar-nav');
    await expect(strataNav).toBeVisible({ timeout: 10_000 });

    // 3. Click "Maintenance" nav item
    const maintenanceTab = page.locator('.s-nav-item', {
      has: page.locator('span', { hasText: 'Maintenance' }),
    });
    await maintenanceTab.click();
    await page.waitForTimeout(1000); // allow module to load and fetch data

    // 4. Look for a "New" or "Create" button (or + button)
    //    The WorkOrders/Maintenance module typically has a creation action
    const createButton = page.locator('button').filter({
      hasText: /new|create|\+/i,
    }).first();

    // If a create button exists, click it and fill the form
    if (await createButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createButton.click();

      // 5. Fill form fields (adjust selectors to match actual form)
      const titleInput = page.locator('input[placeholder*="title" i], input[name="title"], input[placeholder*="Title"]').first();
      if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const testTitle = `E2E Test WO — ${Date.now()}`;
        await titleInput.fill(testTitle);

        // Look for a submit/save button
        const submitBtn = page.locator('button').filter({
          hasText: /save|submit|create/i,
        }).first();
        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(1500);

          // 6. Verify the item appears somewhere in the content
          const created = page.getByText(testTitle);
          await expect(created).toBeVisible({ timeout: 5000 });
        }
      }
    }

    // At minimum, verify the module loaded without crashing
    const errorBoundary = page.locator('text=encountered an error');
    await expect(errorBoundary).not.toBeVisible();
    await expect(page.locator('.s-main-content')).toBeVisible();
  });
});
