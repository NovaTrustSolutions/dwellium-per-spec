#!/usr/bin/env node
/**
 * Scripts/run_lighthouse_phase9.mjs
 *
 * Phase-9+ Task 9.3 — B-α CDN-edge POC empirical measurement (POC-4).
 *
 * Sister-shape to Scripts/run_lighthouse_phase8.mjs (Phase-8+ Task 8.12 n=10
 * LCP re-measurement) at REMOTE-URL altitude vs localhost altitude.
 *
 * Phase-8+ Task 8.12 baseline reference (HEAD-post-Task-8.11 `eae7c88`;
 * ssr:true framework-mode; LOCALHOST react-router-serve):
 *   LCP n=10 median 2,723.65 ms / mean 2,498.81 ms / CV 13.5% (bimodal:
 *   Cluster A 20% server-paint LCP ≈ FCP ≈ 1,953 ms; Cluster B 80%
 *   post-hydration LCP ≈ 2,254-2,802 ms).
 *   FCP n=10 median 1,953.66 ms (deterministic; range 4.31 ms / CV 0.06%).
 *   Baseline artifact:
 *   Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json
 *
 * Task 9.3 POC-4 target — n=10 re-measurement against live Vercel POC at
 * https://dwellium-per-spec.vercel.app/ (greenfield Vercel POC project per
 * Cowork Scenario D LOCK; deployed from feat/phase-9-task-9.3-vercel-deploy-
 * only throwaway branch at commit `7e822a2` per Ilya POC-2 step).
 *
 * 🔴 MEASUREMENT METHODOLOGY (Cowork POC-5 rule + network-latency caveat;
 *    both mandatory; sister-shape but extends Task 8.12 protocol):
 *
 *   1. Capture LCP, FCP, TTFB per run. Report median + CV for EACH,
 *      SEPARATELY (NOT blended). The v1 L228 gate is LCP — edge delivery
 *      primarily improves TTFB/FCP; LCP benefit is only the propagated
 *      TTFB saving UNLESS the LCP element is server-painted (Cluster A).
 *
 *   2. Report bimodal cluster A/B split (Cluster A server-paint LCP ≈ FCP
 *      vs Cluster B post-hydration LCP > FCP), characterized empirically.
 *
 *   3. 🔴 PRIMARY edge-benefit signal = Vercel cache-MISS (cold) vs
 *      cache-HIT (warm) on the SAME platform. Capture BOTH:
 *      • COLD-MISS via unique cache-busting query param per run (e.g.
 *        ?cb=<timestamp>_<run>) → fresh cache key → guaranteed Vercel
 *        Edge MISS by construction (different URL per run).
 *      • WARM-HIT via repeated hits to the fixed URL → after first warm
 *        run, expect Vercel Edge HIT (within TTL window).
 *      Report the MISS-vs-HIT LCP/FCP/TTFB delta as the headline.
 *
 *   4. Log x-vercel-cache + age headers per probe (via curl HEAD before
 *      each Lighthouse run) so HIT/MISS state is correctly attributed.
 *
 *   5. SECONDARY (caveated): vs-Task-8.12-localhost-baseline comparison
 *      is APPLES-TO-ORANGES (localhost = 0 RTT; Vercel = real client→edge
 *      RTT not controlled). Report this comparison EXPLICITLY caveated.
 *
 * PART A FINDING CONTEXT (informational; cemented at this PRE0):
 *   POC-3 curl on the live URL surfaced x-vercel-cache: MISS→HIT pattern
 *   working, BUT custom `s-maxage=300, stale-while-revalidate=600` from
 *   the headers() export at routes/default.tsx did NOT appear — only the
 *   Vercel default `public, max-age=0`. Diagnosis: H2 — RR v7 framework-
 *   mode only invokes a route's headers() export when that route OR an
 *   ancestor has a loader/action; loaderless default.tsx → headers() never
 *   called. Vercel's MISS→HIT comes from default edge-caching behavior of
 *   public Function responses (NOT our custom Cache-Control). POC-4 still
 *   measures whether this default-edge-cache behavior moves LCP — the
 *   headers() fix is a SECONDARY question (POC-6 gate).
 *
 * Env-var parameterization (sister-shape to phase8 conventions):
 *   LH_TASK_FIELD       — slug for JSON output `task` field + filename base.
 *                         Default: `phase9_task_9_3_poc_b_alpha`.
 *   LH_CAPTURE_SUFFIX   — filename suffix.
 *                         Default: empty. POC-4 usage: `_n10_vercel_edge`
 *                         per sister-shape to 7.11/8.12 cadence.
 *   LH_ROOT_RUNS        — number of cold-MISS Lighthouse runs (warm-HIT runs
 *                         use the same N). Default: 10.
 *   LH_TARGET           — base URL for measurement (no trailing query string).
 *                         Default: `https://dwellium-per-spec.vercel.app/`.
 *
 * Usage:
 *   # No local server spawn needed (target is the live Vercel POC):
 *   LH_TASK_FIELD=phase9_task_9_3_poc_b_alpha \
 *     LH_CAPTURE_SUFFIX=_n10_vercel_edge \
 *     LH_ROOT_RUNS=10 \
 *     node Scripts/run_lighthouse_phase9.mjs
 *
 * Output:
 *   Docs/Baselines/<YYYY-MM-DD>_<PascalCaseTaskField>_perf_capture<SUFFIX>.json
 *   e.g. 2026-05-22_Phase9_task_9_3_poc_b_alpha_perf_capture_n10_vercel_edge.json
 *
 * Exit codes:
 *   0 — measurement captured (regardless of cache-state attribution).
 *   1 — measurement / chrome / lighthouse / curl failure.
 *   2 — missing deps (lighthouse / chrome-launcher).
 *
 * Class designation (PER COWORK PART G): DEFERRED at Task 9.3 PRE0 per
 * Decision-#5 LOCK. Candidates: (a) CONFIG-ONLY sister to CI-CONFIG-ONLY
 * 12th (this script alone fits; the deploy-config lives on throwaway); (b)
 * NEW class EDGE-CACHE-POC; (c) MEASUREMENT-ONLY 10pt → 11pt extension
 * (sister-shape extends Task 8.12 protocol at REMOTE-URL altitude; most
 * likely fit given this is the empirical measurement deliverable). Resolve
 * at POC completion.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(__filename, '..', '..');

const TASK_FIELD = process.env.LH_TASK_FIELD || 'phase9_task_9_3_poc_b_alpha';
const CAPTURE_SUFFIX = process.env.LH_CAPTURE_SUFFIX || '';
const ROOT_RUNS = parseInt(process.env.LH_ROOT_RUNS || '10', 10);
const TARGET = process.env.LH_TARGET || 'https://dwellium-per-spec.vercel.app/';
const FILENAME_BASE = TASK_FIELD.charAt(0).toUpperCase() + TASK_FIELD.slice(1);

let lighthouse;
let chromeLauncher;

try {
  lighthouse = (await import('lighthouse')).default;
  chromeLauncher = await import('chrome-launcher');
} catch (err) {
  console.error('[ERROR] Missing dependency:');
  console.error(err.message);
  process.exit(2);
}

/**
 * Run Lighthouse navigation audit against the given URL and return
 * extracted metrics (LCP / FCP / TBT / CLS / SI / TTI + server-response-time
 * proxy for TTFB) + category scores. Sister-shape to phase8 runRootLighthouse
 * but parameterized by URL (cold-MISS uses unique ?cb=<id> URL; warm-HIT
 * uses fixed URL).
 */
async function runLighthouseAgainst(url, port) {
  const result = await lighthouse(url, {
    port,
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  });
  const lhr = result.lhr;
  return {
    url,
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
      // TTFB proxy: Lighthouse's 'server-response-time' audit gives the
      // measured TTFB from origin. NOT identical to network-level TTFB but
      // close enough for relative cold-vs-warm comparison.
      TTFB: lhr.audits['server-response-time']?.numericValue ?? null,
    },
  };
}

/**
 * Curl HEAD request against the URL to capture Vercel cache-state headers
 * (x-vercel-cache + age + cache-control). Used pre-Lighthouse to attribute
 * the cache state for each run. Returns parsed header dict + raw response.
 * Note: this curl itself may warm the edge cache for the URL on first hit;
 * downstream Lighthouse against the SAME URL within TTL will then HIT.
 * For cold-MISS attribution, each run uses a UNIQUE URL (different cache
 * key), so the curl pre-probe is also MISS by construction.
 */
async function curlHead(url) {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const proc = spawn('curl', ['-sIL', '--max-time', '15', url]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', () => {
      const headers = {};
      const lines = stdout.split(/\r?\n/);
      let status = null;
      for (const line of lines) {
        const m = /^HTTP\/[\d.]+\s+(\d+)/.exec(line);
        if (m) { status = parseInt(m[1], 10); continue; }
        const idx = line.indexOf(':');
        if (idx > 0) {
          const k = line.slice(0, idx).trim().toLowerCase();
          const v = line.slice(idx + 1).trim();
          headers[k] = v;
        }
      }
      resolve({
        status,
        xVercelCache: headers['x-vercel-cache'] ?? null,
        age: headers['age'] ?? null,
        cacheControl: headers['cache-control'] ?? null,
        server: headers['server'] ?? null,
        rawError: stderr || null,
      });
    });
  });
}

function computeStats(values) {
  const filtered = values.filter((v) => v != null && !Number.isNaN(v));
  if (filtered.length === 0) {
    return { n: 0, mean: null, median: null, range: null, stddev: null, cv: null };
  }
  const sorted = [...filtered].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const range = sorted[n - 1] - sorted[0];
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const cv = mean !== 0 ? (stddev / mean) * 100 : null;
  return { n, mean, median, min: sorted[0], max: sorted[n - 1], range, stddev, cv };
}

function computeMetricsStats(runs) {
  const keys = ['FCP', 'LCP', 'TBT', 'CLS', 'SI', 'TTI', 'TTFB'];
  const out = {};
  for (const k of keys) out[k] = computeStats(runs.map((r) => r.metrics[k]));
  return out;
}

/**
 * Classify a run as Cluster A (server-paint; LCP ≈ FCP) vs Cluster B
 * (post-hydration; LCP > FCP). Threshold: per Task 8.12 Finding KK
 * empirical signal, Cluster A = LCP within +50 ms of FCP (i.e. LCP - FCP
 * <= 50). Anything else is Cluster B (post-hydration cascade contributes
 * to LCP).
 */
function classifyCluster(run) {
  if (run.metrics.LCP == null || run.metrics.FCP == null) return 'unknown';
  return (run.metrics.LCP - run.metrics.FCP) <= 50 ? 'A' : 'B';
}

async function runOneProbe(url, runIndex, totalRuns, label) {
  const preHeaders = await curlHead(url);
  console.log(`  ... ${label} probe ${runIndex}/${totalRuns}: curl x-vercel-cache=${preHeaders.xVercelCache}, age=${preHeaders.age}, cache-control=${preHeaders.cacheControl}`);
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  try {
    const lhResult = await runLighthouseAgainst(url, chrome.port);
    console.log(`  ... ${label} probe ${runIndex}/${totalRuns}: LCP=${lhResult.metrics.LCP?.toFixed(0)}ms FCP=${lhResult.metrics.FCP?.toFixed(0)}ms TTFB=${lhResult.metrics.TTFB?.toFixed(0)}ms`);
    return {
      runIndex,
      label,
      url,
      preProbeHeaders: preHeaders,
      ...lhResult,
      cluster: classifyCluster(lhResult),
    };
  } finally {
    try { await chrome.kill(); } catch { /* chrome-launcher kill may be sync-undefined; ignore */ }
  }
}

async function main() {
  console.log(`Phase 9+ Task 9.3 — B-α CDN-edge POC empirical measurement (POC-4)`);
  console.log(`Target: ${TARGET}`);
  console.log(`Root runs per cohort (n): ${ROOT_RUNS}`);
  console.log(`Task field: ${TASK_FIELD} | Capture suffix: '${CAPTURE_SUFFIX}'`);
  console.log('');

  // Cohort 1 — COLD-MISS: unique ?cb=<id> URL per run forces fresh cache
  // key at Vercel Edge → guaranteed MISS by construction.
  console.log('--- Cohort 1: COLD-MISS (unique ?cb=<id> URL per run) ---');
  const coldMissRuns = [];
  for (let i = 1; i <= ROOT_RUNS; i++) {
    const cb = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 10)}`;
    const url = TARGET + (TARGET.includes('?') ? '&' : '?') + `cb=${cb}`;
    const run = await runOneProbe(url, i, ROOT_RUNS, 'COLD-MISS');
    coldMissRuns.push(run);
  }

  // Brief pause to ensure Vercel edge state has settled before warm-HIT phase.
  console.log('');
  console.log('--- Pause 2s before warm-HIT cohort ---');
  await sleep(2000);

  // Cohort 2 — WARM-HIT: fixed URL across runs. First run may MISS (if
  // not previously hit during cold cohort or beyond TTL); subsequent runs
  // should HIT (within edge cache TTL).
  console.log('');
  console.log('--- Cohort 2: WARM-HIT (fixed URL across runs) ---');
  const warmHitRuns = [];
  for (let i = 1; i <= ROOT_RUNS; i++) {
    const run = await runOneProbe(TARGET, i, ROOT_RUNS, 'WARM-HIT');
    warmHitRuns.push(run);
  }

  const coldMissStats = computeMetricsStats(coldMissRuns);
  const warmHitStats = computeMetricsStats(warmHitRuns);

  const coldClusterA = coldMissRuns.filter((r) => r.cluster === 'A').length;
  const coldClusterB = coldMissRuns.filter((r) => r.cluster === 'B').length;
  const warmClusterA = warmHitRuns.filter((r) => r.cluster === 'A').length;
  const warmClusterB = warmHitRuns.filter((r) => r.cluster === 'B').length;

  const cacheAttribution = {
    coldMiss: {
      runsWithMiss: coldMissRuns.filter((r) => r.preProbeHeaders.xVercelCache === 'MISS').length,
      runsWithHit: coldMissRuns.filter((r) => r.preProbeHeaders.xVercelCache === 'HIT').length,
      runsWithOther: coldMissRuns.filter((r) => r.preProbeHeaders.xVercelCache !== 'MISS' && r.preProbeHeaders.xVercelCache !== 'HIT').length,
    },
    warmHit: {
      runsWithMiss: warmHitRuns.filter((r) => r.preProbeHeaders.xVercelCache === 'MISS').length,
      runsWithHit: warmHitRuns.filter((r) => r.preProbeHeaders.xVercelCache === 'HIT').length,
      runsWithOther: warmHitRuns.filter((r) => r.preProbeHeaders.xVercelCache !== 'MISS' && r.preProbeHeaders.xVercelCache !== 'HIT').length,
    },
  };

  // PRIMARY delta: warm-HIT MEDIAN vs cold-MISS MEDIAN per metric.
  // Positive delta = warm-HIT is FASTER (lower number) = cache is helping.
  const primaryDelta = {};
  for (const k of ['FCP', 'LCP', 'TBT', 'CLS', 'SI', 'TTI', 'TTFB']) {
    const cold = coldMissStats[k]?.median;
    const warm = warmHitStats[k]?.median;
    if (cold == null || warm == null) {
      primaryDelta[k] = { coldMedian: cold, warmMedian: warm, deltaAbs: null, deltaPct: null };
    } else {
      const deltaAbs = warm - cold; // negative = warm faster
      const deltaPct = cold !== 0 ? (deltaAbs / cold) * 100 : null;
      primaryDelta[k] = {
        coldMedian: cold,
        warmMedian: warm,
        deltaAbs,
        deltaPct,
      };
    }
  }

  // SECONDARY delta: warm-HIT MEDIAN vs Task 8.12 localhost baseline
  // (CAVEATED — apples-to-oranges; network latency not controlled).
  const TASK_8_12_BASELINE = {
    LCP: 2723.65,
    FCP: 1953.66,
    TTFB: null, // not captured at 8.12; left null for transparency
  };
  const secondaryDelta = {};
  for (const k of Object.keys(TASK_8_12_BASELINE)) {
    const base = TASK_8_12_BASELINE[k];
    const warm = warmHitStats[k]?.median;
    if (base == null || warm == null) {
      secondaryDelta[k] = { baseline: base, warmMedian: warm, deltaAbs: null, deltaPct: null };
    } else {
      const deltaAbs = warm - base;
      const deltaPct = base !== 0 ? (deltaAbs / base) * 100 : null;
      secondaryDelta[k] = { baseline: base, warmMedian: warm, deltaAbs, deltaPct };
    }
  }

  // v1 L228 ≤500 ms LCP gate-crossing per-run rate (for both cohorts).
  const gateThreshold = 500;
  const gateCrossingPerRun = {
    threshold_ms: gateThreshold,
    coldMissCrossingCount: coldMissRuns.filter((r) => r.metrics.LCP != null && r.metrics.LCP <= gateThreshold).length,
    coldMissCrossingPct: coldMissRuns.length > 0 ? (coldMissRuns.filter((r) => r.metrics.LCP != null && r.metrics.LCP <= gateThreshold).length / coldMissRuns.length) * 100 : 0,
    warmHitCrossingCount: warmHitRuns.filter((r) => r.metrics.LCP != null && r.metrics.LCP <= gateThreshold).length,
    warmHitCrossingPct: warmHitRuns.length > 0 ? (warmHitRuns.filter((r) => r.metrics.LCP != null && r.metrics.LCP <= gateThreshold).length / warmHitRuns.length) * 100 : 0,
  };

  const payload = {
    capturedAt: new Date().toISOString(),
    repo: 'Dwellium-per-spec / qualia-shell',
    task: TASK_FIELD,
    captureSuffix: CAPTURE_SUFFIX,
    rootRunCount: ROOT_RUNS,
    target: TARGET,
    methodology:
      'Cold-MISS (unique ?cb=<id> per run; guaranteed fresh cache key) vs Warm-HIT (fixed URL; expected edge cache HIT after first warm) cohorts; n=LH_ROOT_RUNS each; Lighthouse navigation against the live URL with default simulated throttling (matches Task 8.12 method byte-for-byte); PRIMARY delta = warm-HIT median vs cold-MISS median per metric; SECONDARY delta = warm-HIT median vs Task 8.12 localhost baseline (CAVEATED apples-to-oranges)',
    v1Thresholds: {
      LCP_ms: 500,
      CLS: 0.1,
      a11yScore: 95,
      source: 'AppFolio_Parity_Implementation_Plan.md L228',
    },
    pocContext: {
      pocDeployUrl: TARGET,
      pocDeployBranch: 'feat/phase-9-task-9.3-vercel-deploy-only',
      pocDeployCommit: '7e822a2',
      partAFinding: 'H2 — RR v7 framework-mode only invokes route headers() when loader/action present; loaderless default.tsx → custom Cache-Control NOT applied. Vercel MISS→HIT pattern at default-edge behavior (public, max-age=0). POC-4 measures default-edge-cache impact, NOT custom-Cache-Control impact.',
    },
    coldMissRuns,
    warmHitRuns,
    coldMissStats,
    warmHitStats,
    clusterDistribution: {
      coldMiss: { clusterA: coldClusterA, clusterB: coldClusterB, total: coldMissRuns.length },
      warmHit: { clusterA: warmClusterA, clusterB: warmClusterB, total: warmHitRuns.length },
    },
    cacheAttribution,
    primaryDelta_warmHit_vs_coldMiss: primaryDelta,
    secondaryDelta_warmHit_vs_task8_12_localhost_baseline: secondaryDelta,
    gateCrossingPerRun,
  };

  const baselinesDir = join(REPO_ROOT, 'Docs', 'Baselines');
  await mkdir(baselinesDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = join(baselinesDir, `${stamp}_${FILENAME_BASE}_perf_capture${CAPTURE_SUFFIX}.json`);
  await writeFile(outPath, JSON.stringify(payload, null, 2));
  console.log('');
  console.log(`[OK] capture written to ${outPath}`);
  console.log('');
  console.log('─── PRIMARY signal: WARM-HIT vs COLD-MISS (same-platform delta) ───');
  for (const k of ['LCP', 'FCP', 'TTFB']) {
    const d = primaryDelta[k];
    if (d.deltaAbs == null) {
      console.log(`  ${k}: cold=${d.coldMedian} warm=${d.warmMedian} (incomputable)`);
    } else {
      const sign = d.deltaAbs <= 0 ? '↓' : '↑';
      console.log(`  ${k}: cold ${d.coldMedian?.toFixed(0)}ms → warm ${d.warmMedian?.toFixed(0)}ms (Δ ${sign}${Math.abs(d.deltaAbs).toFixed(0)}ms / ${d.deltaPct?.toFixed(1)}%)`);
    }
  }
  console.log('');
  console.log('─── Cohort stats (median / CV) ───');
  for (const k of ['LCP', 'FCP', 'TTFB']) {
    const c = coldMissStats[k];
    const w = warmHitStats[k];
    console.log(`  ${k}: cold median=${c?.median?.toFixed(0)}ms CV=${c?.cv?.toFixed(1)}% | warm median=${w?.median?.toFixed(0)}ms CV=${w?.cv?.toFixed(1)}%`);
  }
  console.log('');
  console.log('─── Cluster A (server-paint LCP≈FCP) vs B (post-hydration) split ───');
  console.log(`  Cold-MISS: A=${coldClusterA} B=${coldClusterB} (A=${((coldClusterA / Math.max(1, coldMissRuns.length)) * 100).toFixed(0)}%)`);
  console.log(`  Warm-HIT:  A=${warmClusterA} B=${warmClusterB} (A=${((warmClusterA / Math.max(1, warmHitRuns.length)) * 100).toFixed(0)}%)`);
  console.log('');
  console.log('─── v1 L228 ≤500 ms LCP gate-crossing per-run ───');
  console.log(`  Cold-MISS: ${gateCrossingPerRun.coldMissCrossingCount}/${ROOT_RUNS} (${gateCrossingPerRun.coldMissCrossingPct.toFixed(0)}%)`);
  console.log(`  Warm-HIT:  ${gateCrossingPerRun.warmHitCrossingCount}/${ROOT_RUNS} (${gateCrossingPerRun.warmHitCrossingPct.toFixed(0)}%)`);
  console.log('');
  console.log('─── Cache attribution (curl pre-probe x-vercel-cache headers) ───');
  console.log(`  Cold-MISS cohort: MISS=${cacheAttribution.coldMiss.runsWithMiss} HIT=${cacheAttribution.coldMiss.runsWithHit} OTHER=${cacheAttribution.coldMiss.runsWithOther}`);
  console.log(`  Warm-HIT cohort:  MISS=${cacheAttribution.warmHit.runsWithMiss} HIT=${cacheAttribution.warmHit.runsWithHit} OTHER=${cacheAttribution.warmHit.runsWithOther}`);
  console.log('');
  console.log('─── SECONDARY (caveated apples-to-oranges) — warm-HIT vs Task 8.12 LOCALHOST baseline ───');
  for (const k of ['LCP', 'FCP']) {
    const d = secondaryDelta[k];
    if (d.deltaAbs == null) {
      console.log(`  ${k}: baseline=${d.baseline} warm=${d.warmMedian} (incomputable)`);
    } else {
      const sign = d.deltaAbs <= 0 ? '↓' : '↑';
      console.log(`  ${k}: baseline ${d.baseline?.toFixed(0)}ms (localhost) → warm-HIT ${d.warmMedian?.toFixed(0)}ms (Vercel edge) (Δ ${sign}${Math.abs(d.deltaAbs).toFixed(0)}ms / ${d.deltaPct?.toFixed(1)}%)`);
    }
  }
  console.log('  ⚠️ CAVEAT: localhost = 0 RTT; Vercel = real network RTT not controlled — apples-to-oranges.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.stack || err.message}`);
  process.exit(1);
});
