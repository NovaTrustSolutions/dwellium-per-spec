#!/usr/bin/env node
/**
 * Scripts/run_lighthouse_phase6.mjs
 *
 * Phase-6 Task 6.7 — Perf optimization (Lever 1: Google Fonts deferral via
 * preload+onload + <noscript> fallback).
 *
 * Per Docs/Phases/Phase_6_Plan.md §4 Task 6.7 + Phase-5 5.6 §7
 * closure-decision-point cross-reference: targeted perf work to drop LCP
 * from Phase-5 baseline (4,653 ms / ~9.3× over v1 L228 ≤500 ms target)
 * toward a single-lever Phase-6 mid-target.
 *
 * RENAMED VIA `git mv` from Scripts/run_lighthouse_phase5.mjs at Phase-6
 * Task 6.7 (2026-05-11) per 6.6 precedent (`Scripts/run_axe_phase5.mjs` →
 * `Scripts/run_axe_phase6.mjs`). 2 critical hardcodes patched (L403 task
 * field + L419 artifact filename) + JSDoc rewrite to Phase-6 Task 6.7
 * framing + internal `window.__phase6_*` globals renamed to
 * `window.__phase6_*`. Historical Phase-5 5.6 SCOPE-COLLISION narrative
 * preserved via `git log --follow Scripts/run_lighthouse_phase6.mjs` +
 * `Docs/Phase5_Closure_Report.md §3` + `Docs/Phase5_Perf_Report.md`
 * cross-reference.
 *
 * LEVER 1 (Google Fonts deferral) — empirical justification:
 *   Phase-5 baseline TBT=0 indicates the LCP bottleneck is NETWORK
 *   transfer, not main-thread JS execution. `qualia-shell/index.html`
 *   loads 17 Google Font families in a single render-blocking
 *   `<link rel="stylesheet">` tag. The preload+onload pattern (with
 *   `<noscript>` fallback) removes this stylesheet from the critical
 *   render path; `display=swap` (already in the URL) yields FOUT for
 *   ~100-500 ms while font CSS loads in the background.
 *
 * SPA-ONLY NAVIGATION CONSTRAINT:
 *   The 4 enriched detail pages (128 BV property / 2-STORY vendor /
 *   WO 19511-1 maintenance / Brianna Jackson tenant) are NOT addressable
 *   as standalone URLs — App.tsx has zero React Router patterns. This
 *   script honors that intent:
 *     1. Lighthouse navigation run on root URL — captures root
 *        LCP/FCP/CLS/Performance/a11y for cross-phase comparison.
 *     2. Playwright drives per-page navigation via the same loginAs +
 *        sidebar→strata→nav-item pattern from Tasks 5.4/5.5; captures
 *        Web Vitals via PerformanceObserver + getEntriesByType('paint').
 *     3. @axe-core/playwright captures per-page a11y violations against
 *        WCAG AA (matches Lighthouse's a11y category which uses axe-core
 *        internally).
 *
 * Phase-6 Task 6.7 two-tier LCP acceptance gate (per Cowork verdict at
 * PRE0 close 2026-05-11):
 *   PRIMARY:      LCP ≤ 3,800 ms (≥700 ms reduction from 4,504 ms anchor;
 *                 ~16% improvement; defensible single-lever ROI with
 *                 measurement-variance headroom).
 *   ASPIRATIONAL: LCP ≤ 3,500 ms (≥1,000 ms reduction; matches point
 *                 estimate; bragging right at close).
 *   Secondary gates: CLS=0.000 (no layout-stability regression — HARD
 *   HALT if drifts); Performance score ≥85 (82 → +3 minimum).
 *
 *   v1 L228 ≤500 ms remains structurally unattainable for any single-lever
 *   6.7; carry-forward to Phase-7+ multi-lever arc (Lever 2 manualChunks
 *   vendor split + Lever 3 React.lazy expansion + Lever 4 SSR shell +
 *   Lever 5 CDN edge caching).
 *
 * Usage:
 *   cd qualia-shell && VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true \
 *     npx vite build   # emit dist/
 *   cd ..
 *   node Scripts/run_lighthouse_phase6.mjs
 *
 * Output:
 *   Docs/Baselines/<YYYY-MM-DD>_Phase6_task_6_7_perf_capture.json (raw data)
 *   Docs/Phase6_Perf_Report.md (analyzed report; written separately)
 *
 * Exit codes:
 *   0 — measurement captured (regardless of acceptance-gate PASS/FAIL).
 *   1 — measurement / chrome / playwright failure.
 *   2 — missing deps (lighthouse / chrome-launcher / playwright).
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
const RUNS_PER_PAGE = parseInt(process.env.LH_RUNS || '1', 10);

const requireFromQualia = createRequire(join(REPO_ROOT, 'qualia-shell/package.json'));

let lighthouse;
let chromeLauncher;
let chromium;
let AxeBuilder;

try {
  lighthouse = (await import('lighthouse')).default;
  chromeLauncher = await import('chrome-launcher');
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
  // force: true bypasses element-intercept checks; safe here since the
  // sidebar nav is always interactable post-render even when other panels
  // overlay portions of the main content area.
  await item.click({ force: true, timeout: 15_000 });
}

async function loginAs(page) {
  // Pre-seed localStorage so Sidebar's Property Management widget group is
  // expanded on first render (default is collapsed → Strata widget hidden).
  // The Sidebar reads `qualia_sidebar_groups` at mount per Sidebar.tsx L226-232.
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

async function captureWebVitals(page) {
  return await page.evaluate(() => {
    const paint = performance.getEntriesByType('paint');
    const fcpEntry = paint.find((e) => e.name === 'first-contentful-paint');
    const navigation = performance.getEntriesByType('navigation')[0];
    return {
      FCP: fcpEntry?.startTime ?? null,
      domContentLoaded:
        navigation && 'domContentLoadedEventEnd' in navigation
          ? navigation.domContentLoadedEventEnd - navigation.startTime
          : null,
      loadEvent:
        navigation && 'loadEventEnd' in navigation
          ? navigation.loadEventEnd - navigation.startTime
          : null,
      transferSize: navigation?.transferSize ?? null,
      decodedBodySize: navigation?.decodedBodySize ?? null,
    };
  });
}

async function captureLcpAndCls(page) {
  // Inject observers, then wait for them to settle
  await page.evaluate(() => {
    window.__phase6_lcp = 0;
    window.__phase6_cls = 0;
    window.__phase6_cls_entries = [];
    try {
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          if (entry.startTime > window.__phase6_lcp) {
            window.__phase6_lcp = entry.startTime;
          }
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__phase6_cls += entry.value;
            window.__phase6_cls_entries.push({
              value: entry.value,
              startTime: entry.startTime,
            });
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });
  await page.waitForTimeout(1500);
  return await page.evaluate(() => ({
    LCP: window.__phase6_lcp || null,
    CLS: window.__phase6_cls || 0,
    CLS_entries: window.__phase6_cls_entries?.length ?? 0,
  }));
}

async function runAxeAudit(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  // Lighthouse-style a11y score: 100 - (violations weighted by impact)
  // Simple proxy: 100 - (count_of_violations * 5), floor 0
  const violationCount = results.violations.length;
  const scoreApprox = Math.max(0, 100 - violationCount * 5);
  return {
    violations: results.violations.length,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
    scoreApprox,
    topViolations: results.violations.slice(0, 5).map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
    })),
  };
}

async function runRootLighthouse(port) {
  const result = await lighthouse(PREVIEW_URL, {
    port,
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  });
  const lhr = result.lhr;
  return {
    scores: {
      performance: lhr.categories.performance?.score ?? null,
      accessibility: lhr.categories.accessibility?.score ?? null,
      bestPractices: lhr.categories['best-practices']?.score ?? null,
      seo: lhr.categories.seo?.score ?? null,
    },
    metrics: {
      FCP: lhr.audits['first-contentful-paint']?.numericValue ?? null,
      LCP: lhr.audits['largest-contentful-paint']?.numericValue ?? null,
      TBT: lhr.audits['total-blocking-time']?.numericValue ?? null,
      CLS: lhr.audits['cumulative-layout-shift']?.numericValue ?? null,
      SI: lhr.audits['speed-index']?.numericValue ?? null,
      TTI: lhr.audits['interactive']?.numericValue ?? null,
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
  console.log(`Phase 6 Task 6.7 — Perf optimization (Lighthouse + Playwright + axe-core; Lever 1: Google Fonts deferral)`);
  console.log(`Target: ${PREVIEW_URL} + 4 SPA-internal detail pages`);
  console.log(`Runs per page: ${RUNS_PER_PAGE}`);
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

  let chrome;
  let browser;
  try {
    await waitForPort(PREVIEW_URL);
    console.log('[OK] vite preview ready');

    // 1. Root Lighthouse run (independent chrome via chrome-launcher;
    //    matches Phase-0 baseline methodology — fresh chrome per run)
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    });
    console.log(`[OK] chrome (lighthouse) launched on port ${chrome.port}`);
    console.log('  ... root lighthouse run');
    const rootLighthouse = await runRootLighthouse(chrome.port);
    await chrome.kill();
    chrome = null;
    console.log('[OK] root lighthouse done; chrome killed');

    // 2. Per-page Playwright + axe + Web Vitals (fresh chrome via Playwright)
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
      console.log(`  ... measuring: ${target.label}`);
      try {
        await target.nav(page);
        const vitals = await captureWebVitals(page);
        const lcpCls = await captureLcpAndCls(page);
        const axe = await runAxeAudit(page);
        perPage.push({
          id: target.id,
          label: target.label,
          vitals,
          lcpCls,
          axe,
        });
      } catch (err) {
        console.error(`[WARN] ${target.label} measurement failed: ${err.message}`);
        perPage.push({
          id: target.id,
          label: target.label,
          error: err.message,
        });
      }
    }

    const payload = {
      capturedAt: new Date().toISOString(),
      repo: 'Dwellium-per-spec / qualia-shell',
      task: 'Phase-6 Task 6.7 — Perf optimization (Lever 1: Google Fonts deferral)',
      target: PREVIEW_URL,
      methodology: 'Lighthouse navigation run on root + Playwright-driven SPA navigation + PerformanceObserver Web Vitals + @axe-core/playwright a11y audit per page',
      v1Thresholds: {
        LCP_ms: 500,
        CLS: 0.1,
        a11yScore: 95,
        source: 'AppFolio_Parity_Implementation_Plan.md L228',
      },
      root: rootLighthouse,
      perPage,
    };

    const baselinesDir = join(REPO_ROOT, 'Docs', 'Baselines');
    await mkdir(baselinesDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const outPath = join(baselinesDir, `${stamp}_Phase6_task_6_7_perf_capture.json`);
    await writeFile(outPath, JSON.stringify(payload, null, 2));
    console.log('');
    console.log(`[OK] capture written to ${outPath}`);

    const rs = rootLighthouse.scores;
    console.log(
      `  root perf=${(rs.performance * 100).toFixed(0)} a11y=${(rs.accessibility * 100).toFixed(0)} bp=${(rs.bestPractices * 100).toFixed(0)} seo=${(rs.seo * 100).toFixed(0)}`,
    );
    console.log(
      `  root LCP=${rootLighthouse.metrics.LCP?.toFixed(0)}ms CLS=${rootLighthouse.metrics.CLS?.toFixed(3)} FCP=${rootLighthouse.metrics.FCP?.toFixed(0)}ms`,
    );
    console.log('  per-page summary:');
    for (const p of perPage) {
      if (p.error) {
        console.log(`    ${p.id}: ERROR — ${p.error}`);
        continue;
      }
      console.log(
        `    ${p.id}: LCP=${p.lcpCls.LCP?.toFixed(0)}ms CLS=${p.lcpCls.CLS?.toFixed(3)} FCP=${p.vitals.FCP?.toFixed(0)}ms a11yScoreApprox=${p.axe.scoreApprox} a11yViolations=${p.axe.violations}`,
      );
    }
    process.exit(0);
  } catch (err) {
    console.error(`[ERROR] ${err.stack || err.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (chrome) await chrome.kill().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main();
