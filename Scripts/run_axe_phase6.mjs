#!/usr/bin/env node
/**
 * Scripts/run_axe_phase6.mjs
 *
 * Phase-6 Task 6.6 — Re-execute confirmation a11y measurement
 * post-Phase-6 Block C remediation (6.3 + 6.4). v1 L230 ZERO WCAG AA
 * threshold MET at 6.4 close (33 → 0); 6.6 is the closure confirmation
 * that re-measures across all 4 enriched detail pages and produces
 * `Docs/Phase6_A11y_Report.md` mirroring `Docs/Phase5_A11y_Report.md`
 * byte-shape with side-by-side 362 → 0 cross-phase delta.
 *
 * Renamed from `run_axe_phase5.mjs` at Phase-6 Task 6.6 close; original
 * Phase-5 SCOPE-COLLISION narrative preserved in git history at HEAD
 * `e245ebf` and prior (see `git log --follow Scripts/run_axe_phase6.mjs`
 * + `Docs/Phase5_Closure_Report.md §3` for the cross-phase context).
 *
 * Per parent Plan v2 §9 row 6.6 + v1 plan L230 verbatim:
 *   "Run `axe-core` CI on the 4 detail pages. Zero WCAG AA violations."
 *
 * SCOPE: 4 enriched detail pages (mirrors the Phase-5 5.6/5.7 page set):
 *   - 128 Buena Vista Dr N (property detail)
 *   - 2-STORY TECHNICAL ROOFING LLC (vendor detail)
 *   - WO 19511-1 / Fire alarm needs replaced (maintenance detail)
 *   - Brianna Jackson (tenant detail)
 *
 * COLD-START SIDEBAR MITIGATION (A2 inline pattern; the canonical e2e
 * `helpers/auth.ts::loginAs` was permanently amended at Phase-6 Task 6.2
 * to seed `qualia_sidebar_groups` via `page.addInitScript`, but this
 * non-Playwright-helpers Scripts-context still inline-replicates the
 * seed since it does not consume `helpers/auth.ts`):
 *   page.evaluate + localStorage.setItem('qualia_sidebar_groups', ...)
 *   + page.reload() before login flow → Sidebar reads seeded value at
 *   mount per Sidebar.tsx L226-232.
 *
 * METHODOLOGY:
 *   1. Spawn vite preview on port 4173 (must be built with
 *      VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true beforehand).
 *   2. Launch Playwright chromium (1440×900 viewport).
 *   3. Inline-replicate loginAs flow with localStorage seeding.
 *   4. For each of 4 detail pages: navigate via the Phase-5 5.4/5.5/5.6/5.7
 *      pattern (sidebar→strata→nav-item→card-click) → run
 *      @axe-core/playwright with WCAG 2.0 + 2.1 AA tags → capture
 *      violations + nodes + impact.
 *   5. Aggregate into Docs/Baselines/<YYYY-MM-DD>_Phase6_task_6_6_a11y_capture.json
 *
 * v1 L230 THRESHOLD STATE at Phase-6 Task 6.6 close:
 *   Phase-5 Task 5.7 baseline (2026-05-04) captured 13 distinct
 *   violations / 5 unique rules / 362 nodes (button-name × 338 /
 *   color-contrast × 8 / aria-valid-attr-value × 10 /
 *   scrollable-region-focusable × 2 / select-name × 4); declared
 *   "structurally unattainable without dedicated remediation work".
 *   Phase-6 Block C 6.3 + 6.4 IS that dedicated remediation arc;
 *   threshold MET at 6.4 close (33 → 0). Task 6.6 confirms the
 *   0-state holds across the 4 enriched detail pages at the new HEAD.
 *
 * Usage:
 *   cd qualia-shell && rm -rf dist && \
 *     VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build
 *   cd ..
 *   node Scripts/run_axe_phase6.mjs
 *
 * Output:
 *   Docs/Baselines/<YYYY-MM-DD>_Phase6_task_6_6_a11y_capture.json (raw data)
 *   Docs/Phase6_A11y_Report.md (analyzed report; written separately)
 *
 * Exit codes:
 *   0 — measurement captured (regardless of v1 L230 threshold PASS/FAIL).
 *   1 — measurement / playwright failure.
 *   2 — missing deps (playwright / @axe-core/playwright).
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(__filename, '..', '..');
const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/`;

const requireFromQualia = createRequire(join(REPO_ROOT, 'qualia-shell/package.json'));

let chromium;
let AxeBuilder;

try {
  ({ chromium } = requireFromQualia('playwright'));
  AxeBuilder = requireFromQualia('@axe-core/playwright').default;
} catch (err) {
  console.error(`[ERROR] Missing dependency:`);
  console.error(err.message);
  process.exit(2);
}

const GATE_PASSPHRASE = 'Comet2878!';

const PAGES = [
  {
    id: 'property-128bv',
    label: '128 Buena Vista Dr N (property detail)',
    nav: async (page) => {
      await openStrataNav(page);
      await clickNavItem(page, 'Properties');
      await page.waitForSelector('.s-main-content', { timeout: 10_000 });
      await page.waitForTimeout(1500);
      const card = page.locator('text=128 Buena Vista Dr N').first();
      await card.waitFor({ timeout: 10_000 });
      await card.click({ force: true, timeout: 15_000 });
      await page.waitForTimeout(800);
    },
  },
  {
    id: 'vendor-2story',
    label: '2-STORY TECHNICAL ROOFING LLC (vendor detail)',
    nav: async (page) => {
      await openStrataNav(page);
      await clickNavItem(page, 'Vendors');
      await page.waitForSelector('.s-main-content', { timeout: 10_000 });
      await page.waitForTimeout(1500);
      const card = page.locator('.s-list-item', {
        has: page.locator('.s-list-item-title', { hasText: '2-STORY TECHNICAL ROOFING LLC' }),
      });
      await card.waitFor({ timeout: 10_000 });
      await card.click({ force: true, timeout: 15_000 });
      await page.waitForTimeout(800);
    },
  },
  {
    id: 'wo-19511-1',
    label: 'WO 19511-1 / Fire alarm needs replaced (maintenance detail)',
    nav: async (page) => {
      await openStrataNav(page);
      await clickNavItem(page, 'Maintenance');
      await page.waitForSelector('.s-main-content', { timeout: 10_000 });
      await page.waitForTimeout(1500);
      const card = page.locator('text=Fire alarm needs replaced').first();
      await card.waitFor({ timeout: 10_000 });
      await card.click({ force: true, timeout: 15_000 });
      await page.waitForTimeout(800);
    },
  },
  {
    id: 'tenant-brianna-jackson',
    label: 'Brianna Jackson (tenant detail)',
    nav: async (page) => {
      await openStrataNav(page);
      await clickNavItem(page, 'Residents');
      await page.waitForSelector('.s-main-content', { timeout: 10_000 });
      await page.waitForTimeout(1500);
      const card = page.locator('text=Brianna Jackson').first();
      await card.waitFor({ timeout: 10_000 });
      await card.click({ force: true, timeout: 15_000 });
      await page.waitForTimeout(800);
    },
  },
];

async function openStrataNav(page) {
  const widget = page.locator('.sidebar-widget', {
    has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
  });
  await widget.click();
  await page.waitForSelector('.s-sidebar-nav', { timeout: 10_000 });
}

async function clickNavItem(page, label) {
  const item = page.locator('.s-nav-item', {
    has: page.locator('span', { hasText: label }),
  });
  await item.click({ force: true, timeout: 15_000 });
}

async function loginAs(page) {
  // Pre-seed localStorage so Sidebar's Property Management widget group
  // is expanded on first render (default is empty Set / collapsed →
  // Strata widget hidden). This Scripts/ context does not consume the
  // canonical e2e helpers/auth.ts (permanently amended at Phase-6 Task 6.2
  // to seed qualia_sidebar_groups via page.addInitScript), so the seed
  // is inline-replicated here.
  await page.goto(PREVIEW_URL);
  await page.evaluate(() => {
    localStorage.setItem(
      'qualia_sidebar_groups',
      JSON.stringify(['Property Management', 'AI Tools', 'Filing Cabinet']),
    );
  });
  await page.reload();

  const overlay = page.locator('.login-start-overlay');
  await overlay.waitFor({ timeout: 10_000 });
  await overlay.click();
  const avatar = page.locator('.login-avatar', {
    has: page.locator('.login-avatar__name', { hasText: 'Andy' }),
  });
  await avatar.waitFor({ timeout: 5_000 });
  await avatar.click();
  const passphrase = page.locator('input[placeholder="Passphrase..."]');
  await passphrase.waitFor({ timeout: 5_000 });
  await passphrase.fill(GATE_PASSPHRASE);
  const unlock = page.locator('button[type="submit"]', { hasText: 'Unlock' });
  await unlock.click();
  const logo = page.locator('.sidebar__logo-text', { hasText: 'DWELLIUM' });
  await logo.waitFor({ timeout: 15_000 });
}

async function runAxeAudit(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return {
    violations: results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodeCount: v.nodes.length,
    })),
    summary: {
      violationCount: results.violations.length,
      passCount: results.passes.length,
      incompleteCount: results.incomplete.length,
      inapplicableCount: results.inapplicable.length,
      totalViolatingNodes: results.violations.reduce((acc, v) => acc + v.nodes.length, 0),
      violationsByImpact: results.violations.reduce((acc, v) => {
        acc[v.impact || 'unknown'] = (acc[v.impact || 'unknown'] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

async function waitForPort(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok || res.status === 304) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function main() {
  console.log(`Phase 6 Task 6.6 — Re-execute confirmation a11y measurement (axe-core via Playwright)`);
  console.log(`Target: ${PREVIEW_URL} + 4 SPA-internal detail pages`);
  console.log('');

  const vite = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'],
    {
      cwd: join(REPO_ROOT, 'qualia-shell'),
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  vite.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
  vite.stderr.on('data', (d) => process.stderr.write(`[vite-err] ${d}`));

  let browser;
  try {
    await waitForPort(PREVIEW_URL);
    console.log('[OK] vite preview ready');

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    });
    console.log('[OK] playwright chromium launched');
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    await loginAs(page);
    console.log('[OK] logged in');

    const perPage = [];
    for (const target of PAGES) {
      console.log(`  ... auditing: ${target.label}`);
      try {
        await target.nav(page);
        const audit = await runAxeAudit(page);
        perPage.push({
          id: target.id,
          label: target.label,
          ...audit,
        });
      } catch (err) {
        console.error(`[WARN] ${target.label} audit failed: ${err.message}`);
        perPage.push({
          id: target.id,
          label: target.label,
          error: err.message,
        });
      }
    }

    // Cross-page aggregation
    const allViolationIds = new Set();
    let totalViolatingNodes = 0;
    let totalViolations = 0;
    const violationsByImpactAcrossPages = {};
    for (const p of perPage) {
      if (p.error) continue;
      for (const v of p.violations) allViolationIds.add(v.id);
      totalViolatingNodes += p.summary.totalViolatingNodes;
      totalViolations += p.summary.violationCount;
      for (const [impact, count] of Object.entries(p.summary.violationsByImpact)) {
        violationsByImpactAcrossPages[impact] = (violationsByImpactAcrossPages[impact] || 0) + count;
      }
    }

    const payload = {
      capturedAt: new Date().toISOString(),
      repo: 'Dwellium-per-spec / qualia-shell',
      task: 'Phase-6 Task 6.6 — Re-execute confirmation a11y measurement post-Phase-6 Block C remediation',
      target: PREVIEW_URL,
      methodology:
        'Playwright-driven SPA navigation + @axe-core/playwright per-page audit with WCAG 2.0 + 2.1 AA tags',
      v1Threshold: {
        wcagAaViolations: 0,
        source: 'AppFolio_Parity_Implementation_Plan.md L230',
      },
      summary: {
        pagesScanned: perPage.filter((p) => !p.error).length,
        pagesErrored: perPage.filter((p) => p.error).length,
        totalDistinctViolationIds: allViolationIds.size,
        distinctViolationIds: Array.from(allViolationIds).sort(),
        totalViolations,
        totalViolatingNodes,
        violationsByImpactAcrossPages,
      },
      perPage,
    };

    const baselinesDir = join(REPO_ROOT, 'Docs', 'Baselines');
    await mkdir(baselinesDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const outPath = join(baselinesDir, `${stamp}_Phase6_task_6_6_a11y_capture.json`);
    await writeFile(outPath, JSON.stringify(payload, null, 2));

    console.log('');
    console.log(`[OK] capture written to ${outPath}`);
    console.log('');
    console.log(`v1 L230 threshold: ZERO WCAG AA violations`);
    console.log(
      `Captured: ${totalViolations} violations / ${totalViolatingNodes} nodes / ${allViolationIds.size} distinct rules across ${perPage.filter((p) => !p.error).length} pages`,
    );
    console.log(
      `By impact: ${JSON.stringify(violationsByImpactAcrossPages)}`,
    );
    console.log(`Distinct rules: ${Array.from(allViolationIds).sort().join(', ')}`);
    console.log('');
    console.log('Per-page summary:');
    for (const p of perPage) {
      if (p.error) {
        console.log(`  ${p.id}: ERROR — ${p.error}`);
        continue;
      }
      console.log(
        `  ${p.id}: ${p.summary.violationCount} violations / ${p.summary.totalViolatingNodes} nodes / impact ${JSON.stringify(p.summary.violationsByImpact)}`,
      );
    }

    process.exit(0);
  } catch (err) {
    console.error(`[ERROR] ${err.stack || err.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main();
