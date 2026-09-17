import { test, expect, type Page } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * Plan 057 — Cognitive Memory Network (CMN) end-to-end proof.
 *
 * Andy's user id + the CMN's per-user localStorage key
 * (`dwellium-cmn-v1:<userId>`, src/lib/memoryGraphRag/shared.ts).
 */
const ANDY_ID = USERS.andy.id!;
const CMN_KEY = `dwellium-cmn-v1:${ANDY_ID}`;
const EVIDENCE = '/Users/ilyaklipinitser/dev/ringer-cmn-057/evidence';

const PASTE_TEXT = 'The Maple Street lease renews in March. Acme Heating serviced the boiler last week.';
const PASTE_PLACEHOLDER = 'Paste text to ingest into the three-layer memory…';
const QUERY_PLACEHOLDER = 'Ask a question over the memory graph…';

/**
 * Opens a widget that lives in the sidebar's "AI Tools" group. `loginAs`
 * seeds that group (and the other two) as expanded via `qualia_sidebar_groups`,
 * but the group holds ~22 items against a 6-item preview
 * (Sidebar.tsx SIDEBAR_GROUP_PREVIEW) — 'Cognitive M Network' / 'System
 * Health' / 'Harness' all fall past the preview and need "Show N more"
 * clicked first. Grouped rows (unlike the 5 pinned front-door widgets) are a
 * <div class="sidebar-widget"> wrapping a <button class="sidebar-widget__main">,
 * so the inner button is what needs the click.
 */
async function openAiToolsWidget(page: Page, label: string): Promise<void> {
  const group = page.locator('.sidebar__widget-group').filter({
    has: page.locator('.sidebar__widget-group-label', { hasText: 'AI Tools' }),
  });
  const header = group.locator('.sidebar__widget-group-header');
  await expect(header).toBeVisible({ timeout: 15_000 });
  const toggle = header.locator('.sidebar__widget-group-toggle');
  if ((await toggle.textContent())?.trim() === '+') {
    await header.click();
  }

  const row = group.locator('.sidebar-widget', {
    has: page.locator('.sidebar-widget__label', { hasText: label, exact: true }),
  });
  if (!(await row.isVisible().catch(() => false))) {
    const showMore = group.locator('.sidebar-widget--more');
    if (await showMore.isVisible().catch(() => false)) {
      await showMore.click();
    }
  }
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('.sidebar-widget__main').click();
}

test.describe('Cognitive Memory Network (plan 057)', () => {
  test('persists what you paste across a reload', async ({ page }) => {
    await loginAs(page, USERS.andy);
    await openAiToolsWidget(page, 'Cognitive M Network');

    const widget = page.locator('.mgr');
    await expect(widget).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder(PASTE_PLACEHOLDER).fill(PASTE_TEXT);
    await page.getByRole('button', { name: 'Ingest text', exact: true }).click();
    await expect(widget.getByText(/Saved locally/)).toBeVisible({ timeout: 15_000 });

    const raw1 = await page.evaluate((key) => localStorage.getItem(key), CMN_KEY);
    expect(raw1).toBeTruthy();
    const parsed1 = JSON.parse(raw1!);
    expect(parsed1.snapshot.passages.length).toBeGreaterThan(0);
    const passageCount = parsed1.snapshot.passages.length;

    await page.screenshot({ path: `${EVIDENCE}/01-ingested.png` });

    await page.reload();
    await expect(page.locator('.sidebar__logo-text', { hasText: 'DWELLIUM' })).toBeVisible({ timeout: 15_000 });
    if (!(await widget.isVisible().catch(() => false))) {
      await openAiToolsWidget(page, 'Cognitive M Network');
    }
    await expect(widget).toBeVisible({ timeout: 15_000 });
    await expect(widget.getByText(/Saved locally/)).toBeVisible({ timeout: 15_000 });

    const raw2 = await page.evaluate((key) => localStorage.getItem(key), CMN_KEY);
    expect(raw2).toBeTruthy();
    const parsed2 = JSON.parse(raw2!);
    expect(parsed2.snapshot.passages.length).toBe(passageCount);

    await page.screenshot({ path: `${EVIDENCE}/02-after-reload.png` });
  });

  test('auto-feeds app content without opening the widget', async ({ page }) => {
    // Seed one Foundry capture for Andy — foundryStore.ts key + FoundryItem shape.
    const foundryKey = `dwellium:foundry:${ANDY_ID}`;
    const foundryItem = {
      id: 'e2e-foundry-057',
      createdAt: new Date().toISOString(),
      sourceType: 'paste',
      sourceUrl: null,
      rawContent: 'Roof inspection scheduled for the Elm Street duplex; contractor is Summit Roofing.',
      tags: [],
      target: null,
      qualityScore: null,
      assessment: null,
      status: 'captured',
      triagedBy: null,
    };
    await page.addInitScript(([key, item]) => {
      try { localStorage.setItem(key as string, JSON.stringify([item])); } catch { /* private-mode storage denial */ }
    }, [foundryKey, foundryItem] as const);

    await loginAs(page, USERS.andy);

    // cognitiveMemoryBridge.ts debounces 1.5s before ingesting; poll for the
    // 'foundry:<id>' seen-key without ever opening the widget.
    await expect.poll(async () => {
      const raw = await page.evaluate((key) => localStorage.getItem(key), CMN_KEY);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        return Object.keys(parsed.seen ?? {}).some((k: string) => k.startsWith('foundry:'));
      } catch {
        return false;
      }
    }, { timeout: 15_000, intervals: [500] }).toBe(true);

    await openAiToolsWidget(page, 'Cognitive M Network');
    const widget = page.locator('.mgr');
    await expect(widget.getByText(/Saved locally/)).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: `${EVIDENCE}/03-autofeed.png` });
  });

  test('HUD shows measured values, not invented ones', async ({ page }) => {
    await loginAs(page, USERS.andy);
    await openAiToolsWidget(page, 'Cognitive M Network');

    const widget = page.locator('.mgr');
    await expect(widget).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder(PASTE_PLACEHOLDER).fill(PASTE_TEXT);
    await page.getByRole('button', { name: 'Ingest text', exact: true }).click();
    await expect(widget.getByText(/Saved locally/)).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder(QUERY_PLACEHOLDER).fill('Who serviced the boiler?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(widget.locator('.mgr__answer')).toBeVisible({ timeout: 15_000 });

    // MemoryGraphView.tsx HUD: real m.lastQueryMs / m.persistedBytes, never fabricated telemetry.
    const hudText = await widget.innerText();
    expect(hudText).toMatch(/LATENCY\s*\d+ ms/);
    expect(hudText).toMatch(/SAVED · \d+ KB/);
    expect(hudText).not.toContain('TPS');
    expect(hudText).not.toMatch(/99\.\d%/);
    expect(hudText).not.toContain('VERIFIED');

    await page.screenshot({ path: `${EVIDENCE}/04-hud.png` });
  });

  test('System Health lists the network as a real probe', async ({ page }) => {
    await loginAs(page, USERS.andy);
    await openAiToolsWidget(page, 'System Health');

    const widget = page.locator('.sysh');
    await expect(widget).toBeVisible({ timeout: 15_000 });

    const row = widget.locator('.sysh-item', {
      has: page.locator('.sysh-label', { hasText: 'Cognitive M Network' }),
    });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator('.sysh-detail')).toHaveText(/Local engine ready/);

    await page.screenshot({ path: `${EVIDENCE}/05-system-health.png` });
  });

  test('Cognitive Harness is bound to the network', async ({ page }) => {
    await loginAs(page, USERS.andy);
    // Sidebar label is 'Harness' (src/data/hierarchy.ts:67), not the widget
    // registry's 'Cognitive Harness' (widgetRegistry.ts:534) — dockItems
    // resolve their label from hierarchy.ts's defaultDockItems on every load.
    await openAiToolsWidget(page, 'Harness');

    const widget = page.locator('.cognitive-harness');
    await expect(widget).toBeVisible({ timeout: 15_000 });
    await expect(widget.getByText('COGNITIVE HARNESS ORCHESTRATION')).toBeVisible();

    // Pause the 6s auto-cycle so the active subsystem card holds still.
    await widget.locator('.ch-play-btn').click();

    // Default active tab is RAG — a WIRED_IDS subsystem — CONNECTED/DEGRADED.
    await expect(widget.locator('.ch-panel-status-indicator')).toHaveText(/CONNECTED|DEGRADED/);

    // Switch to an unwired subsystem — 'Not connected'.
    await widget.locator('.ch-bar-item', { hasText: 'PROMPT OPTIMIZATION' }).click();
    await expect(widget.locator('.ch-panel-status-indicator')).toHaveText(/Not connected/);

    await page.screenshot({ path: `${EVIDENCE}/06-harness.png` });
  });
});
