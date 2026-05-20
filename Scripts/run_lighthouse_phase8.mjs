#!/usr/bin/env node
/**
 * Scripts/run_lighthouse_phase8.mjs
 *
 * Phase-8+ Task 8.12 — LCP n=10 re-measurement post-SSR-architectural-migration
 * (Block C OPENER + Phase-8+ measurement-arc kickoff).
 *
 * Per Docs/Phases/Phase_8_Plan.md §4 Block C Task 8.12 + Cowork PRE0 Q1-Q8
 * LOCK 2026-05-19: MEASUREMENT-ONLY 9pt → 10pt CROSS-PHASE-SHAPE-ROBUSTNESS
 * extension (NEW 10th sub-shape `n10-statistical-rigor-re-measurement-post-
 * architectural-migration-at-different-phase-altitude`). First project-wide
 * class to cross 10pt threshold + first cross-phase Phase-7 → Phase-8+
 * extension at MEASUREMENT-ONLY class altitude (calibration lineage: 7pt @
 * 7.10 + 8pt @ 7.11 + 9pt @ 7.14 + 10pt @ 8.12).
 *
 * Phase-7 7.11 baseline reference (HEAD-post-7.10 `6a7eab5`; ssr:false
 * library-mode SPA build):
 *   LCP n=10 median 3,903 ms / mean 3,932 ms / CV 2.29% (~6× variance
 *   reduction vs n=3 cadence; first non-degenerate noise-floor metric).
 *   4-of-6 metrics deterministic at n=10 (FCP/TBT/CLS/SI deterministic;
 *   LCP+TTI bimodal with bounded outlier).
 *   Baseline artifact:
 *   Docs/Baselines/2026-05-15_Phase7_task_7_11_perf_capture_n10_baseline_post_7.10.json
 *
 * Task 8.12 target — n=10 re-measurement at HEAD-post-Task-8.11 `eae7c88`
 * (ssr:true framework-mode; Block B 6-of-6 closer; SSR architectural
 * migration arc COMPLETE) — characterize Phase-8+ noise-floor vs Phase-7
 * 7.11 baseline (architectural-axis change: ssr:false library-mode →
 * ssr:true framework-mode).
 *
 * RENAMED VIA `git mv` from Scripts/run_lighthouse_phase7.mjs at Phase-8+
 * Task 8.12 (2026-05-19) per Q4 LOCK plus-script-rename precedent (6.6/6.7
 * + 7.11 cross-phase sister-shape constellation:
 * `Scripts/run_axe_phase5.mjs` → `run_axe_phase6.mjs`;
 * `run_lighthouse_phase5.mjs` → `run_lighthouse_phase6.mjs` → `_phase7.mjs`
 * → `_phase8.mjs`). Preserves git history per plus-script-rename precedent
 * (NOT fork-copy which orphans history). Historical Phase-5/6/7 narrative
 * preserved via `git log --follow Scripts/run_lighthouse_phase8.mjs` +
 * `Docs/Phase{5,6,7}_Closure_Report.md §3` cross-reference +
 * `Docs/Phase7_Task_7_11_Completion_Report.md` n=10 statistical-rigor
 * protocol precedent.
 *
 * v2.75.1 in-place spawn-target patch at L425-434 (sister-shape to Task
 * 8.11 v2.73.1 webServer patch at playwright.baseline.config.ts):
 *   Phase-7 7.10/7.11 spawned `npx vite preview --port 4173 --strictPort`
 *   for measurement server-startup — INCOMPATIBLE with ssr:true mode at
 *   HEAD-post-Task-8.11 (vite preview serves static client assets only;
 *   ssr:true requires per-request server-side rendering). Swapped to
 *   `npx react-router-serve build/server/index.js` (canonical RR v7
 *   production server runtime; `@react-router/serve@7.15.1` installed as
 *   production dep at Task 8.11 Q5 LOCK). PORT env var override preserves
 *   port 4173 + LH_TASK_FIELD convention byte-for-byte (sister-shape to
 *   v2.73.1 PORT='5173' override pattern at Task 8.11). 9th cumulative
 *   Phase-8+ in-place v2.X.X patch (v2.66.1+v2.66.2+v2.66.3+v2.68.1+v2.72.1
 *   +v2.73.1+v2.73.2+v2.73.3+v2.75.1).
 *
 * v2.75.0 PRE-FLIGHT discipline (cemented at Task 8.12 PRE0 anchor-bias-
 * mitigation cluster 17-pattern milestone; rule: "At any measurement task
 * PRE0, verify process.spawn() targets in measurement scripts against
 * current HEAD's server-runtime shape [react-router-serve vs vite preview
 * vs vite dev] BEFORE executing measurement"; sister-shape to v2.64.0
 * production-source-config-file empirical-verification discipline).
 *
 * SPA-ONLY NAVIGATION CONSTRAINT (preserved from 6.7 / 7.9 / 7.10 / 7.11
 * methodology byte-for-byte at Phase-8+ measurement altitude):
 *   App.tsx has zero React Router DOM v6 patterns at HEAD-post-Task-8.11;
 *   RR v7 framework-mode adopted with declarative route config at
 *   `qualia-shell/app/routes.ts` (single catch-all index route + splat).
 *   4 enriched detail pages accessed via Playwright-driven sidebar→strata→
 *   nav-item pattern. Root Lighthouse run on `/` captures root LCP/FCP/CLS
 *   /Performance/a11y for cross-phase comparison.
 *
 * Phase-8+ Task 8.12 LCP HALT-IF #3 threshold (Q5 LOCK Option II Moderate
 * 2026-05-19): Phase-8 LCP n=10 median > 4,294 ms (3,903 ms × 1.10 = 10%
 * regression threshold) → cement empirical signal in baseline JSON +
 * Completion Report §0; HALT for Cowork verdict on Block C 8.13 perf-lever
 * investigation OR rollback consideration. Sub-thresholds for Cowork
 * awareness (reported all even if non-triggering):
 *   - Median delta vs 3,903 ms baseline (absolute + %)
 *   - CV delta vs 2.29% baseline (noise-floor preservation check)
 *   - p50/p90/p99 deltas
 *   - Per-metric determinism count (Phase-7 baseline: 4-of-6 deterministic)
 *
 * Env-var parameterization (carries forward from 7.10/7.11; Phase-8+ default):
 *   LH_TASK_FIELD       — slug embedded in JSON output `task` field AND
 *                         filename base (PascalCase-derived; e.g.
 *                         `phase8_task_8_12` → `Phase8_task_8_12`).
 *                         Default: `phase8_task_8_12`.
 *   LH_CAPTURE_SUFFIX   — suffix appended to filename before `.json`.
 *                         Default: empty string. Brief usage at 8.12:
 *                         `_n10_baseline_post_8.11` per Q6 LOCK byte-for-byte
 *                         Phase-7 7.11 LH_CAPTURE_SUFFIX naming convention.
 *   LH_ROOT_RUNS        — number of root Lighthouse captures to loop;
 *                         all captures + computed mean/median/range/stddev
 *                         persisted to single JSON output. Default: 1
 *                         (backward-compat). Brief usage at 8.12: 10 (matches
 *                         7.11 n=10 cadence per Q1 LOCK MEASUREMENT-ONLY
 *                         10pt cross-phase shape extension).
 *   LH_RUNS             — per-page Playwright run count (vestigial from 6.7;
 *                         not consumed in the per-page loop; preserved for
 *                         backward-compat; defaults to 1).
 *
 * Usage:
 *   cd qualia-shell && VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true \
 *     npx react-router build   # emit build/client/ + build/server/
 *   cd ..
 *   # Task 8.12 n=10 baseline (Phase-8+ noise-floor characterization at
 *   # ssr:true HEAD-post-Task-8.11):
 *   LH_TASK_FIELD=phase8_task_8_12 LH_CAPTURE_SUFFIX=_n10_baseline_post_8.11 \
 *     LH_ROOT_RUNS=10 node Scripts/run_lighthouse_phase8.mjs
 *
 * Output:
 *   Docs/Baselines/<YYYY-MM-DD>_<PascalCaseTaskField>_perf_capture<SUFFIX>.json
 *   e.g. 2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json
 *
 * Exit codes:
 *   0 — measurement captured (regardless of HALT-IF #3 trigger status).
 *   1 — measurement / chrome / playwright / react-router-serve failure.
 *   2 — missing deps (lighthouse / chrome-launcher / playwright /
 *       @react-router/serve).
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

// Phase-8+ Task 8.12 env-var parameterization (carried forward from 7.10/7.11).
// See JSDoc above.
const TASK_FIELD = process.env.LH_TASK_FIELD || 'phase8_task_8_12';
const CAPTURE_SUFFIX = process.env.LH_CAPTURE_SUFFIX || '';
const ROOT_RUNS = parseInt(process.env.LH_ROOT_RUNS || '1', 10);
// PascalCase the slug for filename base: 'phase8_task_8_12' → 'Phase8_task_8_12'.
const FILENAME_BASE = TASK_FIELD.charAt(0).toUpperCase() + TASK_FIELD.slice(1);

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
    window.__phase7_lcp = 0;
    window.__phase7_cls = 0;
    window.__phase7_cls_entries = [];
    try {
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          if (entry.startTime > window.__phase7_lcp) {
            window.__phase7_lcp = entry.startTime;
          }
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__phase7_cls += entry.value;
            window.__phase7_cls_entries.push({
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
    LCP: window.__phase7_lcp || null,
    CLS: window.__phase7_cls || 0,
    CLS_entries: window.__phase7_cls_entries?.length ?? 0,
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

/**
 * Compute per-metric statistics (mean / median / range / stddev) across
 * a set of root Lighthouse captures. Returns null-safe sentinel object
 * when any individual capture has missing metric (defensive — Lighthouse
 * occasionally emits null for one metric on a failed sub-audit).
 * NEW at Phase-7 Task 7.10 — supports n=3+ aggregate reporting.
 */
function computeRootStats(runs) {
  const metricKeys = ['FCP', 'LCP', 'TBT', 'CLS', 'SI', 'TTI'];
  const scoreKeys = ['performance', 'accessibility', 'bestPractices', 'seo'];
  const stat = (values) => {
    const filtered = values.filter((v) => v != null && !Number.isNaN(v));
    if (filtered.length === 0) return { n: 0, mean: null, median: null, range: null, stddev: null };
    const sorted = [...filtered].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const range = sorted[n - 1] - sorted[0];
    const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);
    return { n, mean, median, min: sorted[0], max: sorted[n - 1], range, stddev };
  };
  const metrics = {};
  for (const k of metricKeys) metrics[k] = stat(runs.map((r) => r.metrics[k]));
  const scores = {};
  for (const k of scoreKeys) scores[k] = stat(runs.map((r) => r.scores[k]));
  return { metrics, scores };
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
  console.log(`Phase 8+ Task 8.12 — LCP n=10 re-measurement post-SSR-architectural-migration (Lighthouse + Playwright + axe-core; ssr:true framework-mode at HEAD-post-Task-8.11 eae7c88)`);
  console.log(`Target: ${PREVIEW_URL} + 4 SPA-internal detail pages`);
  console.log(`Root Lighthouse runs (n): ${ROOT_RUNS}`);
  console.log(`Per-page Playwright runs: ${RUNS_PER_PAGE}`);
  console.log(`Task field: ${TASK_FIELD} | Capture suffix: '${CAPTURE_SUFFIX}'`);
  console.log('');

  // v2.75.1 in-place spawn-target patch — react-router-serve (NOT vite preview)
  // at ssr:true mode. See JSDoc above + Task 8.11 v2.73.1 webServer patch
  // precedent at qualia-shell/playwright.baseline.config.ts.
  const server = spawn(
    'npx',
    ['react-router-serve', 'build/server/index.js'],
    {
      cwd: join(REPO_ROOT, 'qualia-shell'),
      env: { ...process.env, PORT: String(PREVIEW_PORT), BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[server-err] ${d}`));

  let chrome;
  let browser;
  try {
    await waitForPort(PREVIEW_URL);
    console.log('[OK] react-router-serve ready');

    // 1. Root Lighthouse run(s) — independent chrome per run via
    //    chrome-launcher (fresh chrome state per run; matches Phase-0
    //    baseline methodology). NEW at Phase-7 Task 7.10: loop N runs
    //    when LH_ROOT_RUNS > 1 and compute mean/median/range/stddev
    //    for LCP and other metrics; persist all N raw captures + stats
    //    summary in single JSON payload.
    const rootRuns = [];
    for (let i = 1; i <= ROOT_RUNS; i++) {
      chrome = await chromeLauncher.launch({
        chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
      });
      console.log(`[OK] chrome (lighthouse) launched on port ${chrome.port} (run ${i}/${ROOT_RUNS})`);
      console.log(`  ... root lighthouse run ${i}/${ROOT_RUNS}`);
      const runResult = await runRootLighthouse(chrome.port);
      rootRuns.push(runResult);
      await chrome.kill();
      chrome = null;
      console.log(`[OK] root lighthouse run ${i}/${ROOT_RUNS} done; chrome killed; LCP=${runResult.metrics.LCP?.toFixed(0)}ms`);
    }
    // Compute per-metric stats across runs (LCP / FCP / TBT / CLS / SI / TTI
    // + Performance score). Single run: stats trivially mean=median=value,
    // range=0, stddev=0 — sister-shape to 6.7 single-capture output.
    const rootStats = computeRootStats(rootRuns);
    // Sister-shape to 6.7 output: a `rootLighthouse` field holds the
    // representative capture (the median run for n>1; the only run for n=1)
    // so downstream readers that consumed 6.7's `rootLighthouse.*` shape
    // continue to work without modification.
    const medianIdx = Math.floor(rootRuns.length / 2);
    const sortedByLcp = [...rootRuns].sort((a, b) => (a.metrics.LCP ?? 0) - (b.metrics.LCP ?? 0));
    const rootLighthouse = sortedByLcp[medianIdx] ?? rootRuns[0];

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
      task: TASK_FIELD,
      captureSuffix: CAPTURE_SUFFIX,
      rootRunCount: ROOT_RUNS,
      target: PREVIEW_URL,
      methodology: 'Lighthouse navigation run on root (n=LH_ROOT_RUNS) + Playwright-driven SPA navigation + PerformanceObserver Web Vitals + @axe-core/playwright a11y audit per page',
      v1Thresholds: {
        LCP_ms: 500,
        CLS: 0.1,
        a11yScore: 95,
        source: 'AppFolio_Parity_Implementation_Plan.md L228',
      },
      root: rootLighthouse,
      rootRuns,
      rootStats,
      perPage,
    };

    const baselinesDir = join(REPO_ROOT, 'Docs', 'Baselines');
    await mkdir(baselinesDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const outPath = join(baselinesDir, `${stamp}_${FILENAME_BASE}_perf_capture${CAPTURE_SUFFIX}.json`);
    await writeFile(outPath, JSON.stringify(payload, null, 2));
    console.log('');
    console.log(`[OK] capture written to ${outPath}`);

    const rs = rootLighthouse.scores;
    console.log(
      `  root (median run) perf=${(rs.performance * 100).toFixed(0)} a11y=${(rs.accessibility * 100).toFixed(0)} bp=${(rs.bestPractices * 100).toFixed(0)} seo=${(rs.seo * 100).toFixed(0)}`,
    );
    console.log(
      `  root (median run) LCP=${rootLighthouse.metrics.LCP?.toFixed(0)}ms CLS=${rootLighthouse.metrics.CLS?.toFixed(3)} FCP=${rootLighthouse.metrics.FCP?.toFixed(0)}ms`,
    );
    if (ROOT_RUNS > 1) {
      const m = rootStats.metrics;
      const fmt = (s, suffix = 'ms') => s.mean == null
        ? '—'
        : `mean=${s.mean.toFixed(0)}${suffix} median=${s.median.toFixed(0)}${suffix} range=${s.range.toFixed(0)}${suffix} stddev=${s.stddev.toFixed(0)}${suffix}`;
      console.log(`  root n=${ROOT_RUNS} stats:`);
      console.log(`    LCP  ${fmt(m.LCP)}`);
      console.log(`    FCP  ${fmt(m.FCP)}`);
      console.log(`    TBT  ${fmt(m.TBT)}`);
      console.log(`    CLS  ${m.CLS.mean == null ? '—' : `mean=${m.CLS.mean.toFixed(3)} median=${m.CLS.median.toFixed(3)} range=${m.CLS.range.toFixed(3)} stddev=${m.CLS.stddev.toFixed(3)}`}`);
      console.log(`    SI   ${fmt(m.SI)}`);
      console.log(`    TTI  ${fmt(m.TTI)}`);
      const ps = rootStats.scores.performance;
      console.log(`    perf score  mean=${ps.mean == null ? '—' : (ps.mean * 100).toFixed(1)} median=${ps.median == null ? '—' : (ps.median * 100).toFixed(1)} range=${ps.range == null ? '—' : (ps.range * 100).toFixed(1)}`);
    }
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
    // v2.60.1 cluster 14th altitude discipline (Finding JJ sister-shape):
    // destroy stdio pipes BEFORE SIGTERM to prevent Node process hanging on
    // lingering pipe handles to spawned child (smoke-test v2.73.3 precedent).
    try { server.stdout?.destroy(); } catch {}
    try { server.stderr?.destroy(); } catch {}
    server.kill('SIGTERM');
  }
}

main().then(() => {
  // v2.60.1 cluster 14th altitude discipline (Finding JJ sister-shape):
  // explicit process.exit() to prevent Node hanging on lingering handles
  // after main() resolves (smoke-test v2.73.3 precedent).
  process.exit(process.exitCode || 0);
}).catch((err) => {
  console.error(`[FATAL] ${err.stack || err.message}`);
  process.exit(1);
});
