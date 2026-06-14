import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * Journey suite — the daily-driver five (assessment sweep 2026-06-12,
 * weakness #2). Mounts each pinned widget the way a user reaches it and
 * asserts it renders inside the new Widget Enhancement Layer WITHOUT tripping
 * the error boundary. This is the "widgets work", not just "stores pass",
 * coverage the Honest Assessment called for.
 *
 * Runs on the Mac against a real dev server:
 *   cd qualia-shell && npx playwright test e2e/journey-daily-drivers.spec.ts
 * (The sandbox that authored this can't run a live browser against the dev
 * server — these specs are written to run on Ilya's machine / CI.)
 */

const PINNED = [
  { label: 'ARA', mustSee: 'textarea, input[type="text"]' },
  { label: 'Strata', mustSee: '.s-module, .strata-dashboard' },
  { label: 'Scribe', mustSee: '[contenteditable], textarea, .scribe' },
  { label: 'Inbox Zero', mustSee: '.inbox, [class*="inbox"]' },
  { label: 'Task Board', mustSee: '[class*="board"], [class*="task"]' },
];

test.describe('Daily-driver five — open + enhancement-layer survival', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.andy);
  });

  for (const widget of PINNED) {
    test(`${widget.label} opens, renders, and does not trip the error boundary`, async ({ page }) => {
      // Open from the sidebar (pinned or grouped).
      const entry = page
        .locator('.sidebar-widget', {
          has: page.locator('.sidebar-widget__label', { hasText: widget.label }),
        })
        .first();
      await entry.click();

      // The window mounts.
      const win = page.locator('.window').filter({ has: page.locator('text=' + widget.label) }).first();
      await expect(win).toBeVisible({ timeout: 10_000 });

      // It renders INSIDE the WidgetShell enhancement layer.
      const shell = win.locator('.widget-shell').first();
      await expect(shell).toBeVisible({ timeout: 5_000 });

      // And the error boundary did NOT catch a crash.
      await expect(win.locator('.widget-error')).toHaveCount(0);

      // The widget's primary surface is present.
      await expect(win.locator(widget.mustSee).first()).toBeVisible({ timeout: 10_000 });
    });
  }

  test('a widget can be opened, focused, and closed without error', async ({ page }) => {
    const ara = page
      .locator('.sidebar-widget', { has: page.locator('.sidebar-widget__label', { hasText: 'ARA' }) })
      .first();
    await ara.click();
    const win = page.locator('.window').filter({ has: page.locator('text=ARA') }).first();
    await expect(win).toBeVisible({ timeout: 10_000 });
    await win.locator('.window__btn--close').click();
    await expect(win).toHaveCount(0);
  });
});
