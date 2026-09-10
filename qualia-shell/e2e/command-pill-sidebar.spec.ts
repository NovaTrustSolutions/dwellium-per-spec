import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * The "Search ⌘K" trigger lives in the left sidebar on the SPACES row, to the
 * right of the label — not as a fixed pill floating over the desktop, which
 * covered window title bars (Ilya, 2026-09-10). Checks the geometry in the
 * expanded sidebar and the icon rail, and that clicking it opens the palette.
 */
test('⌘K trigger sits in the sidebar SPACES row and floats over nothing', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await loginAs(page, USERS.andy);
  const sidebar = page.locator('.sidebar').first();
  await expect(sidebar).toBeVisible({ timeout: 15_000 });

  const btn = page.getByRole('button', { name: 'Search or ask anything (⌘K)' });
  await expect(btn).toBeVisible();
  const sb = (await sidebar.boundingBox())!;
  const b = (await btn.boundingBox())!;
  expect(b.x, 'inside the sidebar (left)').toBeGreaterThanOrEqual(sb.x);
  expect(b.x + b.width, 'inside the sidebar (right)').toBeLessThanOrEqual(sb.x + sb.width + 0.5);

  const label = page.locator('.spaces-switcher__label');
  await expect(label).toContainText('SPACES');
  const lb = (await label.boundingBox())!;
  expect(b.y, 'on the SPACES row (top)').toBeGreaterThanOrEqual(lb.y - 0.5);
  expect(b.y + b.height, 'on the SPACES row (bottom)').toBeLessThanOrEqual(lb.y + lb.height + 0.5);
  const labelTextBox = await label.locator('span').first().boundingBox();
  expect(b.x, 'to the right of the SPACES text').toBeGreaterThan((labelTextBox?.x ?? 0) + (labelTextBox?.width ?? 0));

  // nothing fixed at the top centre of the shell any more
  const fixedAtTop = await page.evaluate(() => Array.from(document.querySelectorAll('.cmd-pill-wrap')).some((el) => getComputedStyle(el).position === 'fixed'));
  expect(fixedAtTop, 'no position:fixed pill').toBe(false);
  await page.screenshot({ path: test.info().outputPath('sidebar-expanded.png') });

  // opens the palette
  await btn.click();
  await expect(page.locator('.command-palette input').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // icon rail: still there, icon-only, inside the rail
  await page.locator('.sidebar__collapse-toggle').click();
  const rail = page.locator('.sidebar').first();
  await expect(rail).toHaveClass(/sidebar--icon-only/);
  const btn2 = page.getByRole('button', { name: 'Search or ask anything (⌘K)' });
  await expect(btn2).toBeVisible();
  const rb = (await rail.boundingBox())!;
  const b2 = (await btn2.boundingBox())!;
  expect(b2.x + b2.width, 'inside the rail').toBeLessThanOrEqual(rb.x + rb.width + 0.5);
  expect((await btn2.innerText()).trim(), 'icon-only in the rail').toBe('');
  await page.screenshot({ path: test.info().outputPath('sidebar-rail.png') });
  await page.locator('.sidebar__collapse-toggle').click(); // restore
});
