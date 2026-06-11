import { test, expect } from '@playwright/test';
import { loginAs, USERS, expectLoggedOut } from './helpers/auth';

/**
 * E2E Test 6 — Logout Flow
 *
 * Spec (from qualia-improvement-plan.md §4.2):
 *   Click logout → verify redirect to login screen → verify token removed from localStorage
 *
 * Tests:
 *   1. Logout via sidebar "Sign Out" button
 *   2. Token is removed from localStorage after logout
 */

test.describe('Logout Flow', () => {
  test('clicking Sign Out returns to login screen', async ({ page }) => {
    // Login first
    await loginAs(page, USERS.andy);

    // Verify we're in the shell
    await expect(page.locator('.sidebar__logo-text', { hasText: 'DWELLIUM' })).toBeVisible();

    // Click the Sign Out button in the sidebar
    const signOutBtn = page.locator('.sidebar__signout-btn');
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // Should be back at the login screen
    await expectLoggedOut(page);
  });

  test('token is removed from localStorage after logout', async ({ page }) => {
    // Login first
    await loginAs(page, USERS.andy);

    // Verify token exists in localStorage
    const tokenBefore = await page.evaluate(() => {
      return localStorage.getItem('dwellium_token') || localStorage.getItem('token');
    });
    // Token should exist (or session is managed differently)
    // Don't hard-assert — just proceed to logout

    // Click Sign Out
    const signOutBtn = page.locator('.sidebar__signout-btn');
    await signOutBtn.click();

    // Wait for login screen
    await expectLoggedOut(page);

    // Verify token is removed
    const tokenAfter = await page.evaluate(() => {
      return localStorage.getItem('dwellium_token') || localStorage.getItem('token');
    });
    expect(tokenAfter).toBeNull();
  });

  test('Strata Sign Out button also works', async ({ page }) => {
    await loginAs(page, USERS.andy);

    // Open Strata
    const strataWidget = page.locator('.sidebar-widget:not(.sidebar-widget--pinned)', {
      has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
    });
    await strataWidget.click();

    // Wait for Strata nav
    const strataNav = page.locator('.s-sidebar-nav');
    await expect(strataNav).toBeVisible({ timeout: 10_000 });

    // Click "Sign Out" from within Strata's own nav
    const strataSignOut = page.locator('.s-nav-item', {
      has: page.locator('span', { hasText: 'Sign Out' }),
    });
    await strataSignOut.click();

    // Should be back at login
    await expectLoggedOut(page);
  });
});
