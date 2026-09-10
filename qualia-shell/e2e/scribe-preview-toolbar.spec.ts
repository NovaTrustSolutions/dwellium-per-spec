import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * Scribe's "Preview" toggle belongs in the document toolbar with the other
 * view toggles. It used to float over the editor's top-right corner, covering
 * the first line of text. This opens Scribe, creates a file (offline here:
 * the store keeps a local copy and shows its banner), and checks that the
 * button sits inside the toolbar's box and overlaps neither the editor nor
 * any other toolbar control, in a Classic window and maximized.
 */
test('Scribe Preview button sits in the toolbar and overlaps nothing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await loginAs(page, USERS.andy);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: 'scribe', label: 'Scribe', icon: 'pen-tool' } }));
  });
  const scribe = page.locator('.scribe').first();
  await expect(scribe).toBeVisible({ timeout: 15_000 });

  // Open a document: "+ New File" → inline name field → Create.
  await scribe.getByRole('button', { name: /New File/ }).click();
  const name = scribe.getByPlaceholder('filename.md');
  await expect(name).toBeVisible();
  await name.fill('preview-check.md');
  await scribe.getByRole('button', { name: 'Create', exact: true }).click();
  const toolbar = scribe.locator('.scribe__toolbar');
  await expect(toolbar).toBeVisible({ timeout: 15_000 });

  const check = async (label: string) => {
    await page.waitForTimeout(300);
    const btn = toolbar.getByRole('button', { name: 'Preview', exact: true });
    await expect(btn, label).toBeVisible();
    const tb = (await toolbar.boundingBox())!;
    const b = (await btn.boundingBox())!;
    // inside the toolbar box
    expect(b.x, `${label}: left edge`).toBeGreaterThanOrEqual(tb.x - 0.5);
    expect(b.x + b.width, `${label}: right edge`).toBeLessThanOrEqual(tb.x + tb.width + 0.5);
    expect(b.y, `${label}: top edge`).toBeGreaterThanOrEqual(tb.y - 0.5);
    expect(b.y + b.height, `${label}: bottom edge`).toBeLessThanOrEqual(tb.y + tb.height + 0.5);
    // below the toolbar, not over the editor
    const editor = (await scribe.locator('.scribe__editor').boundingBox())!;
    expect(b.y + b.height, `${label}: above the editor`).toBeLessThanOrEqual(editor.y + 0.5);
    // no overlap with any sibling control
    const others = toolbar.locator('button');
    for (let i = 0; i < await others.count(); i++) {
      const o = await others.nth(i).boundingBox();
      if (!o || (await others.nth(i).innerText()).trim() === 'Preview') continue;
      const overlap = b.x < o.x + o.width && o.x < b.x + b.width && b.y < o.y + o.height && o.y < b.y + b.height;
      expect(overlap, `${label}: overlaps "${(await others.nth(i).innerText()).trim()}"`).toBe(false);
    }
    // nothing floats over the editor's top-right corner any more
    expect(await scribe.locator('.scribe__preview-toggle').count(), `${label}: floating toggle`).toBe(0);
    return btn;
  };

  const btn = await check('Classic window');
  await btn.click();
  await expect(scribe.locator('.scribe__preview-wrap')).toBeVisible();
  await expect(scribe.locator('.scribe-preview__bar')).toContainText('PREVIEW');
  await check('Classic window, preview open');

  // Maximized window
  const win = page.locator('.window', { has: scribe }).first();
  const maximize = win.locator('[title="Maximize"], [aria-label="Maximize"], .window__btn--max, .window-control.maximize').first();
  if (await maximize.isVisible().catch(() => false)) {
    await maximize.click();
    await check('Maximized');
  }
  await page.screenshot({ path: test.info().outputPath('scribe-preview-toolbar.png') });
});
