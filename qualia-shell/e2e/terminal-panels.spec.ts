import { test, expect, Page } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * Terminal widget tabs inside narrow containers (the Cockpit centre pane and a
 * Classic window):
 *  - the Paperclip toolbar's buttons must stay inside the panel (they overflowed
 *    to the right because the toolbar never wrapped);
 *  - the CrewAI "control plane" embed must not iframe app.crewai.com, which
 *    refuses to be framed; it shows an Open ↗ card instead.
 */

const LAYOUTS: Array<{ name: string; seed: Record<string, string> }> = [
  { name: 'Classic desktop', seed: {} },
  {
    name: 'Cockpit',
    seed: {
      'dwellium-fluid-os': JSON.stringify({ enabled: true, open: true }),
      // The Cockpit's work column hosts a Terminal permanently; at its minimum
      // width (300 px, default 420) the Paperclip toolbar used to spill out.
      // Key = `dwellium-cockpit:<user id>` (cockpitPrefsStore, per user).
      'dwellium-cockpit:9a921527-84b0-497f-b682-45df315c13d1': JSON.stringify({ navW: 260, workW: 300, rightW: 380, workSplit: 0.6, rightCollapsed: true, lastUrl: '' }),
    },
  },
];

type Loc = ReturnType<Page['locator']>;

/** Opens the Terminal and returns it with the visible container it must stay inside of. */
async function openTerminal(page: Page, layout: string): Promise<{ container: Loc; terminal: Loc }> {
  if (layout === 'Cockpit') {
    // The work column's Terminal is always mounted; nothing to open.
    const container = page.locator('.fos-work').first();
    await expect(container).toBeVisible({ timeout: 10_000 });
    return { container, terminal: container.locator('.qualia-terminal').first() };
  }
  const sidebarEntry = page.locator('.sidebar-widget', {
    has: page.locator('.sidebar-widget__label', { hasText: /^Terminal$/ }),
  });
  if (await sidebarEntry.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
    await sidebarEntry.first().click();
  } else {
    // Terminal is hidden from the sidebar by default (hiddenWidgetsStore); open it
    // through the app's own widget-open event, the same path ARA and Scribe use.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dwellium:open-widget', {
        detail: { widgetId: 'terminal', label: 'Terminal', icon: 'terminal' },
      }));
    });
  }
  const terminal = page.locator('.qualia-terminal').first();
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  return { container: page.locator('.window', { has: terminal }).first(), terminal };
}

for (const layout of LAYOUTS) {
  test(`Terminal tabs stay inside their container in ${layout.name}`, async ({ page }) => {
    // Classic: a 900 px viewport spawns a ~300 px quadrant window. Cockpit: the
    // 300 px work column is seeded above; keep the viewport wide so the column is on screen.
    await page.setViewportSize({ width: layout.name === 'Cockpit' ? 1280 : 900, height: 720 });
    await page.addInitScript((seed) => {
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }, layout.seed);
    await loginAs(page, USERS.andy);
    const { container, terminal } = await openTerminal(page, layout.name);
    await expect(terminal).toBeVisible({ timeout: 10_000 });

    // ── Paperclip: every toolbar control inside the panel box ──
    await terminal.getByRole('button', { name: 'Paperclip', exact: true }).click();
    const panel = terminal.locator('.pc-panel');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(300); // let the column/window settle after the tab switch
    const containerBox = (await container.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    const buttons = terminal.locator('.pc-toolbar button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < count; i++) {
      const b = (await buttons.nth(i).boundingBox())!;
      const label = await buttons.nth(i).innerText();
      expect(b.x + b.width, `"${label}" right edge inside the container (${layout.name}, container ${Math.round(containerBox.width)} px)`).toBeLessThanOrEqual(containerBox.x + containerBox.width + 1);
      expect(b.x, `"${label}" left edge inside the container (${layout.name})`).toBeGreaterThanOrEqual(containerBox.x - 1);
    }
    expect(panelBox.x + panelBox.width, 'panel inside its container').toBeLessThanOrEqual(containerBox.x + containerBox.width + 1);
    await page.screenshot({ path: `test-results/terminal-paperclip-${layout.name.replace(/\W+/g, '-').toLowerCase()}.png` });

    // ── CrewAI: no iframe of a host that refuses framing; the card instead ──
    await terminal.getByRole('button', { name: 'CrewAI', exact: true }).click();
    await terminal.getByRole('button', { name: /Show control plane/ }).click();
    await expect(terminal.locator('.cr-blocked')).toBeVisible();
    await expect(terminal.locator('.cr-blocked-title')).toHaveText(/app\.crewai\.com doesn.t allow embedding/);
    await expect(terminal.locator('iframe.cr-frame')).toHaveCount(0);
    await page.screenshot({ path: `test-results/terminal-crewai-${layout.name.replace(/\W+/g, '-').toLowerCase()}.png` });
  });
}
