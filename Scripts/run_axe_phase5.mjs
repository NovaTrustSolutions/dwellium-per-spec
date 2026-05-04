#!/usr/bin/env node
/**
 * Scripts/run_axe_phase5.mjs
 *
 * Phase-5 Task 5.7 — Accessibility validation (axe-core via Playwright).
 *
 * Per parent Plan v2 §9 row 5.7 + v1 plan L230 verbatim:
 *   "Run `axe-core` CI on the 4 detail pages. Zero WCAG AA violations."
 *
 * SCOPE: 4 enriched detail pages (mirrors Task 5.6 page set):
 *   - 128 Buena Vista Dr N (property detail)
 *   - 2-STORY TECHNICAL ROOFING LLC (vendor detail)
 *   - WO 19511-1 / Fire alarm needs replaced (maintenance detail)
 *   - Brianna Jackson (tenant detail)
 *
 * SCOPE-COLLISION CARRY-FORWARD (sibling of Task 5.6 finding; per user
 * decision #4 NOT incremented as standalone catch — count preserved at
 * 8 absolute / 4 distinct in Phase-5):
 *   Phase 0.0 Task 0.0.7 (perf) + 0.0.8 (a11y) co-shipped baseline
 *   infrastructure as a SET. Task 5.6 caught 0.0.7's pre-existence;
 *   Task 5.7's catching of 0.0.8's pre-existence is the same shape —
 *   `qualia-shell/e2e/axe-baseline.spec.ts` (Phase-0 era; 8 routable
 *   surfaces, repo-wide a11y) + `Docs/Baselines/2026-04-21_Phase0_axe_baseline.json`
 *   (18 violations / 10 critical + 18 serious).
 *
 *   Task 5.7 EXPLICITLY BYPASSES axe-baseline.spec.ts per user decision
 *   #5 — different scopes / complementary data:
 *     - Phase-0 baseline: repo-wide a11y on 8 routable surfaces
 *     - Phase-5 Task 5.7: enriched-detail-pages a11y on 4 SPA-internal
 *       navigations (128 BV / 2-STORY / WO 19511-1 / Brianna)
 *   Both retained as complementary data sources.
 *
 * COLD-START SIDEBAR MITIGATION (A2 inline pattern; helpers/auth.ts
 * amendment was attempted but smoke-test surfaced downstream
 * .s-detail-panel hidden failures on appfolio-parity specs not caused
 * by amendment but exposed by it; per smoke-test fallback rule, A2
 * inline-only retained — mirrors Task 5.6 Scripts/run_lighthouse_phase5.mjs
 * pattern verbatim):
 *   page.evaluate + localStorage.setItem('qualia_sidebar_groups', ...)
 *   + page.reload() before login flow → Sidebar reads seeded value at
 *   mount per Sidebar.tsx L226-232.
 *
 * METHODOLOGY:
 *   1. Spawn vite preview on port 4173 (must be built with
 *      VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true beforehand).
 *   2. Launch Playwright chromium (1440×900 viewport).
 *   3. Inline-replicate loginAs flow with localStorage seeding.
 *   4. For each of 4 detail pages: navigate via Tasks 5.4/5.5 pattern
 *      (sidebar→strata→nav-item→card-click) → run @axe-core/playwright
 *      with WCAG 2.0 + 2.1 AA tags → capture violations + nodes + impact.
 *   5. Aggregate into Docs/Baselines/<YYYY-MM-DD>_Phase5_a11y_capture.json
 *
 * v1 L230 THRESHOLD DRIFT acknowledgment (predicted from Task 5.6
 * empirical baseline — captured as PASS/FAIL findings, NOT tuning work
 * scope; future-Phase-N decision deferred per Task 5.7 §7 entry 3
 * mirroring Task 5.6 v1 L228 pattern):
 *   Task 5.6 captured 13 distinct violations / 5 unique rules / 362
 *   nodes (button-name × 338 / color-contrast × 8 / aria-valid-attr-value
 *   × 10 / scrollable-region-focusable × 2 / select-name × 4); v1 L230
 *   ZERO target structurally unattainable without remediation.
 *
 * Usage:
 *   cd qualia-shell && rm -rf dist && \
 *     VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build
 *   cd ..
 *   node Scripts/run_axe_phase5.mjs
 *
 * Output:
 *   Docs/Baselines/<YYYY-MM-DD>_Phase5_a11y_capture.json (raw data)
 *   Docs/Phase5_A11y_Report.md (analyzed report; written separately)
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
  // Strata widget hidden). Inline mirror of Task 5.6 mitigation per
  // user decision #2 fallback to A2 (inline-only) after smoke-test
  // surfaced downstream .s-detail-panel hidden failures on appfolio-parity
  // specs that are NOT caused by helpers/auth.ts amendment but exposed
  // by it. helpers/auth.ts amendment reverted; mitigation lives here only.
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
  console.log(`Phase 5 Task 5.7 — Accessibility validation (axe-core via Playwright)`);
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
      task: 'Phase-5 Task 5.7 — Accessibility validation',
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
    const outPath = join(baselinesDir, `${stamp}_Phase5_a11y_capture.json`);
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
