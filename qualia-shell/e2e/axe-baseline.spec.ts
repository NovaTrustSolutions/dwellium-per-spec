import { test, expect, Page } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * E2E — Phase 0.0 Task 0.0.8 — axe accessibility baseline.
 *
 * Logs in, walks the 8 AppFolio-parity modules, runs axe-core on each,
 * aggregates the results into a single JSON under Docs/Baselines/. The
 * baseline is intentionally NON-BLOCKING on first run — the goal is to
 * freeze a number we can regress against. Subsequent work should only
 * lower the violation count.
 *
 * Dependency (not in current package.json):
 *   npm install --save-dev @axe-core/playwright
 *
 * Usage on real dev box:
 *   npm install --save-dev @axe-core/playwright
 *   npx playwright test e2e/axe-baseline.spec.ts
 *
 * Output:
 *   ../Docs/Baselines/<YYYY-MM-DD>_Phase0_axe_baseline.json
 *
 * JSON shape:
 *   {
 *     capturedAt: ISO timestamp,
 *     summary: { totalViolations, violationsByImpact: {...} },
 *     pages: [ { module, url, violations: [...] } ]
 *   }
 */

const BASELINE_MODULES = [
  { id: 'overview', label: 'Overview' },
  { id: 'properties', label: 'Properties' },
  { id: 'leasing', label: 'Leasing' },
  { id: 'residents', label: 'Residents' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'owners', label: 'Owners' },
  { id: 'accounting', label: 'Accounting' },
  { id: 'maintenance', label: 'Maintenance' },
] as const;

// Emit exactly one combined baseline JSON after all tests finish.
type PageResult = {
  module: string;
  label: string;
  url: string;
  violations: Array<{
    id: string;
    impact: string | null;
    description: string;
    nodes: number;
    tags: string[];
  }>;
};

const results: PageResult[] = [];

async function ensurePropertyManagementExpanded(page: Page) {
  // Widget groups are collapsed by default; expand Property Management
  // so the Strata widget becomes clickable.
  const pmGroup = page.locator('.sidebar__widget-group', {
    has: page.locator('.sidebar__widget-group-label', { hasText: 'Property Management' }),
  });
  const strataWidget = pmGroup.locator('.sidebar-widget:not(.sidebar-widget--pinned)', {
    has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
  });
  if (!(await strataWidget.isVisible().catch(() => false))) {
    await pmGroup.locator('.sidebar__widget-group-header').click();
    await expect(strataWidget).toBeVisible({ timeout: 5_000 });
  }
}

async function openStrataAndNavigate(page: Page, label: string) {
  const strataNav = page.locator('.s-sidebar-nav');
  if (!(await strataNav.isVisible().catch(() => false))) {
    await ensurePropertyManagementExpanded(page);
    const strataWidget = page.locator('.sidebar-widget:not(.sidebar-widget--pinned)', {
      has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
    });
    await strataWidget.click();
    await expect(strataNav).toBeVisible({ timeout: 10_000 });
  }
  const navButton = page.locator('.s-nav-item', {
    has: page.locator('span', { hasText: label }),
  });
  await navButton.click();
  await expect(page.locator('.s-main-content')).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
}

test.describe.configure({ mode: 'serial' });

test.describe('axe accessibility baseline — AppFolio parity modules', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, USERS.andy);
  });

  for (const mod of BASELINE_MODULES) {
    test(`${mod.label} — axe scan`, async ({ page }) => {
      await openStrataAndNavigate(page, mod.label);

      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        // Exclude the LoginScreen splash (won't appear post-login).
        .exclude('.login-start-overlay')
        .analyze();

      results.push({
        module: mod.id,
        label: mod.label,
        url: page.url(),
        violations: axeResults.violations.map((v) => ({
          id: v.id,
          impact: v.impact ?? null,
          description: v.description,
          nodes: v.nodes.length,
          tags: v.tags,
        })),
      });

      // Strict-assert: assertion-strengthened at Phase-7 Task 7.2 — fails on any WCAG AA violation.
      // Pre-7.2 was soft-assert console.log only (Phase 0.0 Task 0.0.8 baseline capture intent);
      // post-7.1's 8-routable-surface zero-state MET makes the hard assertion safe (sister-arc to 7.3 workflow flip).
      const count = axeResults.violations.length;
      // eslint-disable-next-line no-console
      console.log(`[axe][${mod.label}] ${count} violation rule(s) flagged`);
      expect(axeResults.violations.length).toBe(0);
    });
  }

  test.afterAll(async () => {
    const totalViolations = results.reduce((n, p) => n + p.violations.length, 0);
    const violationsByImpact: Record<string, number> = {};
    for (const p of results) {
      for (const v of p.violations) {
        const k = v.impact || 'unknown';
        violationsByImpact[k] = (violationsByImpact[k] || 0) + v.nodes;
      }
    }

    const payload = {
      capturedAt: new Date().toISOString(),
      repo: 'Dwellium-per-spec / qualia-shell',
      phase: 'Phase 0.0 Task 0.0.8 — axe baseline',
      summary: {
        totalViolations,
        pagesScanned: results.length,
        violationsByImpact,
      },
      pages: results,
    };

    const __filename = fileURLToPath(import.meta.url);
    const baselinesDir = join(dirname(__filename), '..', '..', 'Docs', 'Baselines');
    await mkdir(baselinesDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const outPath = join(baselinesDir, `${stamp}_Phase0_axe_baseline.json`);
    await writeFile(outPath, JSON.stringify(payload, null, 2));
    // eslint-disable-next-line no-console
    console.log(`[axe] baseline written to ${outPath}`);
  });
});
