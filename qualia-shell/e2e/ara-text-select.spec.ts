import { test, expect, Page } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * ARA window text must be selectable with the mouse in every interface layout:
 * Classic desktop (window), Holocron OS (tab), Cockpit / Fluid OS (pane).
 * <body> is `user-select: none` (global.css); `.ara-console` opts back in.
 *
 * Each case seeds the layout store before the shell loads, opens ARA, sends a
 * message so there is user text in the transcript, drags the mouse across it
 * and asserts the browser's own selection contains the text. Computed style on
 * the console root is checked too, so a regression is named precisely.
 */

const MESSAGE = 'Selectable text check';

const LAYOUTS: Array<{ name: string; seed: Record<string, string> }> = [
  { name: 'Classic desktop', seed: {} },
  {
    name: 'Holocron OS',
    seed: { 'dwellium-halocron-os': JSON.stringify({ enabled: true, open: true }) },
  },
  {
    name: 'Cockpit',
    seed: { 'dwellium-fluid-os': JSON.stringify({ enabled: true, open: true }) },
  },
];

async function dismissIntro(page: Page): Promise<void> {
  // Boot / intro overlays offer a Skip control; use it when present.
  const skip = page.getByRole('button', { name: /skip/i }).first();
  if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) await skip.click();
}

async function openAra(page: Page): Promise<void> {
  // Cockpit: its own nav sits over the sidebar; open from the nav row
  // (accessible name "Open ARA Console").
  const cockpitRow = page.locator('.fos-nav__row', { hasText: 'ARA Console' }).first();
  if (await cockpitRow.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await cockpitRow.click();
    return;
  }
  // Holocron OS: the shell covers the sidebar; its AGENTS rail has an "ARA" button.
  if (await page.locator('.hos-nav').first().isVisible({ timeout: 1_500 }).catch(() => false)) {
    await page.getByRole('main').getByRole('button', { name: 'ARA', exact: true }).first().click();
    return;
  }
  const sidebarEntry = page.locator('.sidebar-widget', {
    has: page.locator('.sidebar-widget__label', { hasText: 'ARA' }),
  });
  if (await sidebarEntry.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
    await sidebarEntry.first().click();
    return;
  }
  // Layouts without the sidebar: the command palette.
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('combobox').or(page.locator('input[placeholder*="Search" i]')).first();
  await expect(palette).toBeVisible({ timeout: 5_000 });
  await palette.fill('ARA Console');
  await page.keyboard.press('Enter');
}

/** Holocron OS keeps the Classic window mounted underneath its own tab, so more
 *  than one `.ara-console` can exist. Use the one the mouse would actually hit. */
async function visibleConsole(page: Page) {
  const consoles = page.locator('.ara-console');
  await expect(consoles.first()).toBeVisible({ timeout: 10_000 });
  const count = await consoles.count();
  for (let i = count - 1; i >= 0; i--) {
    const c = consoles.nth(i);
    const hit = await c.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && el.contains(top);
    }).catch(() => false);
    if (hit) return { console_: c, count, index: i };
  }
  return { console_: consoles.first(), count, index: 0 };
}

for (const layout of LAYOUTS) {
  test(`ARA text is mouse-selectable in ${layout.name}`, async ({ page }) => {
    await page.addInitScript((seed) => {
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
      // Holocron OS boot video plays once per session and covers the shell.
      sessionStorage.setItem('halocron-boot-played', '1');
      sessionStorage.setItem('halocron-os-intro-played', '1');
    }, layout.seed);
    await loginAs(page, USERS.andy);
    await dismissIntro(page);
    await openAra(page);

    const { console_, count, index } = await visibleConsole(page);
    console.log(`[${layout.name}] .ara-console instances=${count}, using #${index}`);
    await expect(console_).toBeVisible({ timeout: 10_000 });

    // Root opts back into selection (global body rule is `none`).
    const rootUserSelect = await console_.evaluate((el) => getComputedStyle(el).userSelect);
    expect(rootUserSelect, 'computed user-select on .ara-console').toBe('text');

    // Put user text in the transcript.
    const input = console_.locator('textarea, input[type="text"]').last();
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill(MESSAGE);
    await input.press('Enter');
    const body = console_.locator('.ara-message--user .ara-message-body', { hasText: MESSAGE }).last();
    await expect(body).toBeVisible({ timeout: 5_000 });
    // In Holocron OS the short chat area leaves the newest body below the fold
    // (the header row shows, the text is clipped): bring it into view first.
    await body.scrollIntoViewIfNeeded();

    // Rectangle of the text node itself (layouts differ in padding/headers), and
    // the chat area smooth-scrolls after a send: poll until it stops moving.
    const textRect = () => body.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.includes('Selectable')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getClientRects()[0];
        if (r) return { x: r.x, y: r.y, w: r.width, h: r.height };
      }
      return null;
    });
    // Stable for three consecutive samples AND actually hit-testable at its centre
    // (the "Conversation Actions" / notice panels appear after the send and can
    // push the body under them in the short Holocron chat area).
    let rect = await textRect();
    let stable = 0;
    for (let i = 0; i < 40 && stable < 3; i++) {
      await page.waitForTimeout(150);
      const next = await textRect();
      const same = !!(rect && next && rect.x === next.x && rect.y === next.y && rect.w === next.w);
      rect = next;
      const hit = await body.evaluate((el, r) => {
        if (!r) return false;
        const top = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2);
        return !!top && el.contains(top);
      }, rect);
      if (same && hit) { stable++; continue; }
      stable = 0;
      if (!hit) await body.scrollIntoViewIfNeeded();
    }
    expect(rect, 'text node rectangle').not.toBeNull();
    // Drag across the text like a person would, then read the browser selection.
    const y = rect!.y + rect!.h / 2;
    await page.mouse.move(rect!.x + 1, y);
    await page.mouse.down();
    await page.mouse.move(rect!.x + rect!.w - 1, y, { steps: 12 });
    await page.mouse.up();
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    // Proof image with the live selection highlight (test-results/ is gitignored).
    await page.screenshot({ path: `test-results/ara-select-${layout.name.replace(/\W+/g, '-').toLowerCase()}.png` });
    expect(selected, `mouse selection in ${layout.name}`).toContain('Selectable');
  });
}
