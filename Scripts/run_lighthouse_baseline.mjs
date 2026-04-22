#!/usr/bin/env node
/**
 * Scripts/run_lighthouse_baseline.mjs
 *
 * Phase 0.0 Task 0.0.7 — Lighthouse performance baseline.
 *
 * Boots `vite preview` on port 4173, runs Lighthouse against the app root
 * N times (default 3) to smooth out variance, aggregates the results into
 * a single JSON under Docs/Baselines/.
 *
 * Why root-only?
 *   Strata modules are React-state-driven (not URL-addressable), so
 *   Lighthouse's standalone run model cannot traverse them. Per-module
 *   perf is captured separately via Playwright's performance.getEntries()
 *   inside axe-baseline.spec.ts / screenshot-baseline.spec.ts on the real
 *   dev box if needed.
 *
 * Dependencies (not in current package.json — install on real dev box):
 *   npm install --save-dev lighthouse chrome-launcher
 *
 * Usage on real dev box (from repo root):
 *   cd qualia-shell && npm run build   # emit dist/
 *   cd ..
 *   node Scripts/run_lighthouse_baseline.mjs
 *
 * Output:
 *   Docs/Baselines/<YYYY-MM-DD>_Phase0_perf_baseline.json
 *
 * Exit codes:
 *   0 — baseline captured.
 *   1 — Chrome launch / lighthouse failure.
 *   2 — missing deps.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(__filename, '..', '..');

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/`;
const RUNS = parseInt(process.env.LH_RUNS || '3', 10);

let lighthouse;
let chromeLauncher;
try {
  lighthouse = (await import('lighthouse')).default;
  chromeLauncher = await import('chrome-launcher');
} catch (err) {
  console.error(`[ERROR] Missing dependency. Install on dev box:`);
  console.error(`  cd qualia-shell && npm install --save-dev lighthouse chrome-launcher`);
  console.error(`(scoped to qualia-shell so the main repo stays deps-free)`);
  console.error(`Underlying error: ${err.message}`);
  process.exit(2);
}

async function waitForPort(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok || res.status === 304) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function runOneLighthouse(url) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    const lhr = result.lhr;
    return {
      performance: lhr.categories.performance?.score ?? null,
      accessibility: lhr.categories.accessibility?.score ?? null,
      bestPractices: lhr.categories['best-practices']?.score ?? null,
      seo: lhr.categories.seo?.score ?? null,
      metrics: {
        FCP: lhr.audits['first-contentful-paint']?.numericValue ?? null,
        LCP: lhr.audits['largest-contentful-paint']?.numericValue ?? null,
        TBT: lhr.audits['total-blocking-time']?.numericValue ?? null,
        CLS: lhr.audits['cumulative-layout-shift']?.numericValue ?? null,
        SI: lhr.audits['speed-index']?.numericValue ?? null,
        TTI: lhr.audits['interactive']?.numericValue ?? null,
      },
    };
  } finally {
    await chrome.kill();
  }
}

function average(arr, k) {
  const vals = arr.map((r) => r[k]).filter((v) => v !== null && v !== undefined);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function averageMetrics(arr) {
  const keys = Object.keys(arr[0]?.metrics || {});
  const out = {};
  for (const k of keys) {
    const vals = arr.map((r) => r.metrics?.[k]).filter((v) => v !== null && v !== undefined);
    out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}

async function main() {
  console.log(`Phase 0.0 Task 0.0.7 — Lighthouse baseline (${RUNS} runs)`);
  console.log(`Target: ${PREVIEW_URL}`);
  console.log(``);

  // 1. Spawn vite preview in the background.
  const vite = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: join(REPO_ROOT, 'qualia-shell'),
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  vite.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
  vite.stderr.on('data', (d) => process.stderr.write(`[vite-err] ${d}`));

  try {
    await waitForPort(PREVIEW_URL);
    console.log(`[OK] vite preview ready`);

    // 2. Run Lighthouse RUNS times.
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      console.log(`  ... run ${i + 1}/${RUNS}`);
      const r = await runOneLighthouse(PREVIEW_URL);
      runs.push(r);
    }

    // 3. Aggregate.
    const payload = {
      capturedAt: new Date().toISOString(),
      repo: 'Dwellium-per-spec / qualia-shell',
      phase: 'Phase 0.0 Task 0.0.7 — Lighthouse baseline',
      target: PREVIEW_URL,
      runs: RUNS,
      averages: {
        scores: {
          performance: average(runs, 'performance'),
          accessibility: average(runs, 'accessibility'),
          bestPractices: average(runs, 'bestPractices'),
          seo: average(runs, 'seo'),
        },
        metrics: averageMetrics(runs),
      },
      rawRuns: runs,
    };

    // 4. Write.
    const baselinesDir = join(REPO_ROOT, 'Docs', 'Baselines');
    await mkdir(baselinesDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const outPath = join(baselinesDir, `${stamp}_Phase0_perf_baseline.json`);
    await writeFile(outPath, JSON.stringify(payload, null, 2));
    console.log(``);
    console.log(`[OK] baseline written to ${outPath}`);
    const s = payload.averages.scores;
    console.log(
      `  perf=${(s.performance * 100).toFixed(0)}  a11y=${(s.accessibility * 100).toFixed(0)}  bp=${(s.bestPractices * 100).toFixed(0)}  seo=${(s.seo * 100).toFixed(0)}`
    );

    process.exit(0);
  } catch (err) {
    console.error(`[ERROR] Lighthouse run failed: ${err.stack || err.message}`);
    process.exit(1);
  } finally {
    vite.kill('SIGTERM');
  }
}

main();
