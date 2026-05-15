#!/usr/bin/env node
/**
 * Scripts/run_lighthouse_phase7.mjs
 *
 * Phase-7 Task 7.10 — Perf optimization (Lever 3: React.lazy expansion of
 * App.tsx eager imports + AdminShell wrapper consolidation).
 *
 * Per Docs/Phases/Phase_7_Plan.md §4 Block B Task 7.10 (expanded scope
 * post-7.9 strategic pivot; absorbs Lever 2 vendor-split as conditional
 * secondary lever only if empirically motivated at round-2). Pre-Phase-7
 * anchor LCP = 4,204 ms n=5 mean (Phase-6 6.7 close) / 4,602.3 ms n=3
 * mean (Phase-7 7.9 pre-edit baseline). v1 L228 ≤500 ms remains
 * structurally unattainable single-lever; Phase-7 Block B PRIMARY gate
 * ≤3,000 ms (~30% reduction) / ASPIRATIONAL ≤2,000 ms (~50%).
 *
 * RENAMED VIA `git mv` from Scripts/run_lighthouse_phase6.mjs at Phase-7
 * Task 7.10 (2026-05-15) per 6.6/6.7 precedent (`Scripts/run_axe_phase5.mjs`
 * → `run_axe_phase6.mjs`; `run_lighthouse_phase5.mjs` →
 * `run_lighthouse_phase6.mjs`). Phase-6 Task 6.7 hardcodes patched + JSDoc
 * rewrite to Phase-7 Task 7.10 framing + internal `window.__phase7_*`
 * globals renamed to `window.__phase7_*` + NEW env-var parameterization
 * (LH_TASK_FIELD / LH_CAPTURE_SUFFIX / LH_ROOT_RUNS) for n=3 looping +
 * pre-edit/post-edit suffix support + future Task 7.10.1/7.11 reuse without
 * re-editing. Historical Phase-5/Phase-6 narrative preserved via
 * `git log --follow Scripts/run_lighthouse_phase7.mjs` +
 * `Docs/Phase5_Closure_Report.md §3` + `Docs/Phase5_Perf_Report.md` +
 * `Docs/Phase6_Closure_Report.md §3` + `Docs/Phase6_Perf_Report.md`
 * cross-reference.
 *
 * LEVER 3 (React.lazy expansion of App.tsx eager imports) — empirical
 * justification per Phase-6 6.7 + Phase-7 7.9 cross-phase 2pt perf-lever
 * underperformance pattern:
 *   6.7 Lever 1 (Google Fonts deferral): −148 ms / −3.4% → REVERT
 *   7.9 Lever 2 (manualChunks vendor split via vite.config.ts; v2.55.1
 *     expanded shape ['react','react-dom','react-dom/client','scheduler']
 *     + 'icons-vendor': ['lucide-react']): STRUCTURAL chunk-axis BREAK
 *     SUCCESS (index eager-chunk shrunk −218 KB / −36.5%; +2 vendor
 *     chunks 264 KB aggregate) but empirical LCP delta −24.6 ms / −0.5%
 *     → REVERT.
 *   Substantive engineering finding: LCP bottleneck at React 19 + Vite 6
 *   + 4,500 ms baseline is JS EXECUTION + PARSE + RENDER on initial paint,
 *   NOT critical-path bytes-downloaded. Vendor extraction moves bytes but
 *   parallel HTTP/2 streams save marginal time when browser wasn't
 *   bottlenecked on serial download. Lever 3 addresses this directly by
 *   reducing what the browser parses + executes on initial paint:
 *   ~6,598 LoC of App.tsx eager-imported components (Sidebar 949 +
 *   Desktop 1048 + CommandPalette 1011 + OpenJarvisWidget 1089 + 3
 *   admin-shell providers 1104 = AdminShell wrapper 5201; TenantPortal 636;
 *   TenantLoginScreen 341; SecurityPortal 277; PopupShell 143) move from
 *   eager index-ChKXebss.js (597,519 B baseline) into lazy chunks behind
 *   3 branch-local <Suspense> boundaries at the App.tsx 3-branch inline
 *   conditional routing structure (/security → SecurityPortal; ?popup= →
 *   PopupShell; default → AuthGate → LoginScreen[eager]|TenantLoginScreen|
 *   TenantPortal|AdminShell).
 *
 * SPA-ONLY NAVIGATION CONSTRAINT (unchanged from 6.7 / 7.9):
 *   App.tsx has zero React Router patterns; 4 enriched detail pages
 *   accessed via Playwright-driven sidebar→strata→nav-item pattern.
 *   Root Lighthouse run on `/` captures root LCP/FCP/CLS/Performance/a11y
 *   for cross-phase comparison. Per-page Playwright + axe + Web Vitals
 *   capture supplementary data per existing 6.7 methodology.
 *
 * Phase-7 Task 7.10 LCP acceptance gate (per Cowork verdict at PRE0
 * close 2026-05-15):
 *   OUTCOME A+: LCP reduction ≥1,500 ms AND post-edit LCP ≤3,000 ms
 *               (Block B PRIMARY gate; "lazy-load = structurally-correct
 *               lever" thesis CONFIRMED).
 *   OUTCOME A:  LCP reduction ≥1,000 ms AND post-edit LCP ≤3,500 ms
 *               (substantive win short of A+; Block B PRIMARY not met but
 *               materially closer).
 *   OUTCOME B:  LCP reduction <100 ms (NO-OP per measurement noise band
 *               ~225 ms at n=3) → REVERT; 3pt cross-phase perf-lever
 *               underperformance pattern cements SSR pivot recommendation.
 *   OUTCOME C:  LCP reduction 100-1,000 ms (partial; ambiguous) → round-2
 *               PRE0 on vendor-split (7.9 v2.55.1 manualChunks shape)
 *               stacking on top.
 *
 * Env-var parameterization (NEW at 7.10 for future Task 7.10.1/7.11 reuse):
 *   LH_TASK_FIELD       — slug embedded in JSON output `task` field AND
 *                         filename base (PascalCase-derived; e.g.
 *                         `phase7_task_7_10` → `Phase7_task_7_10`).
 *                         Default: `phase7_task_7_10`.
 *   LH_CAPTURE_SUFFIX   — suffix appended to filename before `.json`.
 *                         Default: empty string. Brief usage at 7.10:
 *                         `_pre_edit` for Step-2 baseline; `_post_edit_round1`
 *                         for Step-5 post-edit capture.
 *   LH_ROOT_RUNS        — number of root Lighthouse captures to loop;
 *                         all captures + computed mean/median/range/stddev
 *                         persisted to single JSON output. Default: 1
 *                         (backward-compat with 6.7 single-capture mode).
 *                         Brief usage at 7.10: 3 (matches 7.9 n=3 cadence;
 *                         escalate to 10 if Step-5 round-1 lands in
 *                         100-1,000 ms ambiguous OUTCOME C band).
 *   LH_RUNS             — per-page Playwright run count (vestigial from 6.7;
 *                         not consumed in the per-page loop; preserved for
 *                         backward-compat; defaults to 1).
 *
 * Usage:
 *   cd qualia-shell && VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true \
 *     npx vite build   # emit dist/
 *   cd ..
 *   # Step-2 pre-edit baseline (n=3):
 *   LH_CAPTURE_SUFFIX=_pre_edit LH_ROOT_RUNS=3 \
 *     node Scripts/run_lighthouse_phase7.mjs
 *   # Step-5 post-edit round-1 (n=3):
 *   LH_CAPTURE_SUFFIX=_post_edit_round1 LH_ROOT_RUNS=3 \
 *     node Scripts/run_lighthouse_phase7.mjs
 *
 * Output:
 *   Docs/Baselines/<YYYY-MM-DD>_<PascalCaseTaskField>_perf_capture<SUFFIX>.json
 *   e.g. 2026-05-15_Phase7_task_7_10_perf_capture_pre_edit.json
 *   Docs/Phase7_Perf_Report.md (analyzed report; written separately at 7.10
 *   close)
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

// Phase-7 Task 7.10 env-var parameterization (NEW). See JSDoc above.
const TASK_FIELD = process.env.LH_TASK_FIELD || 'phase7_task_7_10';
const CAPTURE_SUFFIX = process.env.LH_CAPTURE_SUFFIX || '';
const ROOT_RUNS = parseInt(process.env.LH_ROOT_RUNS || '1', 10);
// PascalCase the slug for filename base: 'phase7_task_7_10' → 'Phase7_task_7_10'.
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
  console.log(`Phase 7 Task 7.10 — Perf optimization (Lighthouse + Playwright + axe-core; Lever 3: React.lazy expansion of App.tsx eager imports)`);
  console.log(`Target: ${PREVIEW_URL} + 4 SPA-internal detail pages`);
  console.log(`Root Lighthouse runs (n): ${ROOT_RUNS}`);
  console.log(`Per-page Playwright runs: ${RUNS_PER_PAGE}`);
  console.log(`Task field: ${TASK_FIELD} | Capture suffix: '${CAPTURE_SUFFIX}'`);
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
    vite.kill('SIGTERM');
  }
}

main();
