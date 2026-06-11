import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * E2E Test 4 — ARA Chat
 *
 * Spec (from qualia-improvement-plan.md §4.2):
 *   Open ARA console → select a mode → type message → verify AI response renders
 *
 * Opens the ARA Console widget from the sidebar and verifies
 * the chat interface renders. Sends a message and waits for
 * a response to appear (even if the AI backend is unavailable,
 * we should see the message in the chat history and no crash).
 */

test.describe('ARA Chat', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.andy);
  });

  test('can open ARA console and send a message', async ({ page }) => {
    // 1. Open ARA Console from sidebar
    const araWidget = page.locator('.sidebar-widget:not(.sidebar-widget--pinned)', {
      has: page.locator('.sidebar-widget__label', { hasText: 'ARA' }),
    });
    await araWidget.click();

    // 2. Wait for the ARA window to appear
    const araWindow = page.locator('.window').filter({
      has: page.locator('text=ARA'),
    });
    await expect(araWindow).toBeVisible({ timeout: 10_000 });

    // 3. Find the chat input (textarea or input)
    const chatInput = araWindow.locator('textarea, input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 5_000 });

    // 4. Type a test message
    const testMessage = 'Hello, this is an E2E test message';
    await chatInput.fill(testMessage);

    // 5. Send the message (press Enter or click send button)
    await chatInput.press('Enter');

    // 6. The user message should appear in the chat
    await expect(araWindow.getByText(testMessage)).toBeVisible({ timeout: 5_000 });

    // 7. Wait briefly for a response to start rendering (or a loading indicator)
    //    Don't fail if the AI backend isn't available — just verify no crash
    await page.waitForTimeout(2000);

    // 8. Verify no error boundary was triggered
    const errorBoundary = araWindow.locator('text=encountered an error');
    await expect(errorBoundary).not.toBeVisible();
  });

  test('ARA console loads without crashing', async ({ page }) => {
    // Open ARA
    const araWidget = page.locator('.sidebar-widget:not(.sidebar-widget--pinned)', {
      has: page.locator('.sidebar-widget__label', { hasText: 'ARA' }),
    });
    await araWidget.click();

    // Wait for the window
    const araWindow = page.locator('.window').filter({
      has: page.locator('text=ARA'),
    });
    await expect(araWindow).toBeVisible({ timeout: 10_000 });

    // Verify no error boundary
    const errorBoundary = araWindow.locator('text=encountered an error');
    await expect(errorBoundary).not.toBeVisible();
  });
});
