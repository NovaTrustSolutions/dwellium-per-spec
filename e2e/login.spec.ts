import { test, expect } from '@playwright/test';
import { loginAs, USERS, expectLoggedOut } from './helpers/auth';

/**
 * E2E Test 1 — Login Flow
 *
 * Spec (from qualia-improvement-plan.md §4.2):
 *   Navigate to app → galaxy splash click → avatar click → verify shell loads
 *
 * Tests:
 *   1. Full happy-path login via quick-select avatar
 *   2. Manual email/password login
 *   3. Login with wrong passphrase shows error
 */

test.describe('Login Flow', () => {
  test('quick-select avatar login loads the shell', async ({ page }) => {
    await loginAs(page, USERS.andy);

    // Verify shell elements are present
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.desktop')).toBeVisible();

    // Verify greeting shows the user's name
    const greeting = page.locator('.sidebar__greeting');
    await expect(greeting).toContainText('Andy');
  });

  test('wrong passphrase shows error without crashing', async ({ page }) => {
    await page.goto('/');

    // Click splash overlay
    await page.locator('.login-start-overlay').click();

    // Click Andy's avatar
    const avatar = page.locator('.login-avatar', {
      has: page.locator('.login-avatar__name', { hasText: 'Andy' }),
    });
    await avatar.click();

    // Enter wrong passphrase
    const input = page.locator('input[placeholder="Passphrase..."]');
    await input.fill('wrong passphrase');

    // Click Unlock
    await page.locator('button[type="submit"]', { hasText: 'Unlock' }).click();

    // Should show "Incorrect passphrase" error
    await expect(page.getByText('Incorrect passphrase')).toBeVisible();

    // Login card should still be present (not crashed)
    await expect(page.locator('.login-card')).toBeVisible();
  });

  test('manual email/password login works', async ({ page }) => {
    await page.goto('/');

    // Click splash overlay
    await page.locator('.login-start-overlay').click();

    // Fill manual login form
    await page.locator('#login-email').fill('andy@dwellium.com');
    await page.locator('#login-password').fill('admin123');

    // Submit form
    await page.locator('.login-submit').click();

    // Wait for shell to load
    const sidebarLogo = page.locator('.sidebar__logo-text', { hasText: 'DWELLIUM' });
    await expect(sidebarLogo).toBeVisible({ timeout: 15_000 });
  });

  test('splash overlay is clickable and reveals login form', async ({ page }) => {
    await page.goto('/');

    // Splash overlay should be visible initially
    const overlay = page.locator('.login-start-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Click to Access Terminal');

    // After clicking, the login backdrop should become active
    await overlay.click();
    const backdrop = page.locator('.login-backdrop.is-active');
    await expect(backdrop).toBeVisible();
  });
});
