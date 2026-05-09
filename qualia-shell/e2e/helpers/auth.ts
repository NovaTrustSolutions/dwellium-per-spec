import { Page, expect } from '@playwright/test';

/**
 * Shared login helper for E2E tests.
 *
 * Replicates the Dwellium login flow:
 *  1. Click the splash overlay ("Click to Access Terminal")
 *  2. Click the avatar for the given user
 *  3. Enter the passphrase in the gate modal
 *  4. Wait for the Shell to load (Sidebar with "DWELLIUM" visible)
 */

/** Default gate passphrase (matches LoginScreen.tsx) */
const GATE_PASSPHRASE = 'Comet2878!';

interface QuickUser {
  name: string;
  email: string;
  role: string;
}

/**
 * Available quick-login users (must match LoginScreen QUICK_USERS).
 * Add more as needed.
 */
export const USERS: Record<string, QuickUser> = {
  andy: { name: 'Andy', email: 'andy@dwellium.com', role: 'god' },
  lisa: { name: 'Lisa', email: 'lisa@zpgroup.io', role: 'corporate' },
  wendy: { name: 'Wendy', email: 'wendy@dwellium.com', role: 'management' },
  lee: { name: 'Lee', email: 'lee@dwellium.com', role: 'maintenance' },
};

/**
 * Perform a full login as the specified user.
 *
 * @param page Playwright Page
 * @param user Which quick-select user to log in as (defaults to Andy / god)
 */
export async function loginAs(
  page: Page,
  user: QuickUser = USERS.andy,
): Promise<void> {
  // Seed before goto: cold-start Sidebar useState (Sidebar.tsx:226-232) reads this Set
  // synchronously; without seeding, all widget groups default to collapsed.
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'qualia_sidebar_groups',
        '["Property Management","AI Tools","Filing Cabinet"]',
      );
    } catch { /* private-mode storage denial */ }
  });

  // Navigate to app
  await page.goto('/');

  // 1. Click the splash overlay to reveal the login form
  const overlay = page.locator('.login-start-overlay');
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await overlay.click();

  // 2. Wait for login card to appear, then click the user's avatar
  const avatarButton = page.locator('.login-avatar', {
    has: page.locator('.login-avatar__name', { hasText: user.name }),
  });
  await expect(avatarButton).toBeVisible({ timeout: 5_000 });
  await avatarButton.click();

  // 3. Enter the gate passphrase
  const passphraseInput = page.locator('input[placeholder="Passphrase..."]');
  await expect(passphraseInput).toBeVisible({ timeout: 5_000 });
  await passphraseInput.fill(GATE_PASSPHRASE);

  // 4. Click "Unlock"
  const unlockBtn = page.locator('button[type="submit"]', { hasText: 'Unlock' });
  await unlockBtn.click();

  // 5. Wait for the shell to load — sidebar logo text is the indicator
  const sidebarLogo = page.locator('.sidebar__logo-text', { hasText: 'DWELLIUM' });
  await expect(sidebarLogo).toBeVisible({ timeout: 15_000 });
}

/**
 * Verify the user is logged out — login overlay should be visible.
 */
export async function expectLoggedOut(page: Page): Promise<void> {
  const overlay = page.locator('.login-start-overlay');
  await expect(overlay).toBeVisible({ timeout: 10_000 });
}
