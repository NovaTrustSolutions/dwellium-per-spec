#!/usr/bin/env node
/**
 * Scripts/analyze_lcp_attribution_phase9.mjs
 *
 * Phase-9+ Task 9.3 POC-6 follow-up — LCP attribution analysis.
 *
 * Cowork PART C authorization (2026-05-23): determine which lever family
 * the empirical bottleneck actually points to. Runs Lighthouse n=N (default
 * 3) against the live Vercel POC URL with FULL artifact capture and dumps:
 *
 *   (a) LCP element: lhr.audits['largest-contentful-paint-element'].details
 *       → the exact DOM node Lighthouse attributes LCP to (selector, snippet)
 *   (b) Network requests in the FCP→LCP window:
 *       lhr.audits['network-requests'].details.items filtered by startTime
 *       between FCP and LCP → what was being fetched on the critical path
 *   (c) Critical request chains: lhr.audits['critical-request-chains']
 *   (d) Throttling config: result.lhr.configSettings (CPU + network +
 *       formFactor + throttlingMethod) → compares phase8 vs phase9
 *   (e) Per-metric numericValues: FCP / LCP / TBT / TTI / TTFB
 *   (f) FCP→LCP gap analysis + main-thread-idle assessment via TBT=0
 *
 * Output: Docs/Baselines/<YYYY-MM-DD>_Phase9_task_9_3_lcp_attribution.json
 *
 * Cowork-flagged HYPOTHESIS to test: "LCP is gated on a post-hydration
 * auth/data round-trip — AuthGate spinner (FCP) → useEffect → GET
 * /api/auth/me → real content paints (LCP)."
 *
 * Empirical refinement (this PRE0 source inspection):
 *   UserContext.tsx:285-288 — useEffect exits IMMEDIATELY if token is null
 *   (setIsLoading(false) + return). Lighthouse runs with fresh state (no
 *   localStorage token) → token IS null → /api/auth/me fetch DOES NOT FIRE.
 *   So the 2-sec FCP→LCP gap must come from something ELSE.
 *
 * Refined hypothesis (also test): "LCP is gated on lazy-chunk loading of
 * the LoginScreen component (Suspense-wrapped lazy import) over network."
 *   - App.tsx wraps AuthGate children in <Suspense fallback={spinner}>
 *   - LoginScreen is imported via React.lazy or lazyWithReload
 *   - After hydration, Suspense renders → chunk fetch over network → LCP
 *     fires when the LoginScreen's avatar grid (largest element) paints
 *
 * Whichever hypothesis (or neither) the empirical data attributes LCP to,
 * THIS script returns the evidence with which to decide.
 *
 * No deploy. No credentials. No production-source changes. Public URL only.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(__filename, '..', '..');

const TARGET = process.env.LH_TARGET || 'https://dwellium-per-spec.vercel.app/';
const RUNS = parseInt(process.env.LH_ROOT_RUNS || '3', 10);

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

async function runLighthouseFull(url, port) {
  // NOTE: NO onlyCategories — the LCP-attribution audits we need
  // (lcp-breakdown-insight, lcp-discovery-insight) are NOT in the
  // 'performance' category and would be filtered out. Run full default
  // audit set instead. Discovered empirically at Phase-9+ Task 9.3 POC-6
  // PRE0 first-attempt-debug — original `onlyCategories: ['performance']`
  // returned LCP audits with null details and empty network-requests.
  const result = await lighthouse(url, {
    port,
    logLevel: 'error',
    output: 'json',
  });
  const lhr = result.lhr;

  const metrics = {
    FCP: lhr.audits['first-contentful-paint']?.numericValue ?? null,
    LCP: lhr.audits['largest-contentful-paint']?.numericValue ?? null,
    TBT: lhr.audits['total-blocking-time']?.numericValue ?? null,
    TTI: lhr.audits['interactive']?.numericValue ?? null,
    SI: lhr.audits['speed-index']?.numericValue ?? null,
    TTFB: lhr.audits['server-response-time']?.numericValue ?? null,
  };

  const fcpToLcpGap = (metrics.FCP != null && metrics.LCP != null)
    ? metrics.LCP - metrics.FCP : null;

  // (a) LCP element attribution — Lighthouse newer versions use
  // 'lcp-breakdown-insight' instead of legacy 'largest-contentful-paint-element'.
  // The breakdown includes both the per-subpart timing (TTFB / resourceLoadDelay
  // / resourceLoadDuration / elementRenderDelay) AND the LCP element DOM node.
  const lcpBreakdown = lhr.audits['lcp-breakdown-insight'];
  const lcpDiscovery = lhr.audits['lcp-discovery-insight'];
  // Within details.items, there's typically:
  //   - items[0]: { type: 'table', items: [{ subpart, label, duration }, ...] }
  //   - items[1]: { type: 'node', lhId, path, selector, snippet, nodeLabel, boundingRect }
  const lcpBreakdownItems = lcpBreakdown?.details?.items ?? [];
  const lcpBreakdownTable = lcpBreakdownItems.find((it) => it.type === 'table');
  const lcpBreakdownNode = lcpBreakdownItems.find((it) => it.type === 'node');
  const lcpElement = lcpBreakdownNode ? {
    nodeLabel: lcpBreakdownNode.nodeLabel ?? null,
    selector: lcpBreakdownNode.selector ?? null,
    snippet: lcpBreakdownNode.snippet?.slice(0, 300) ?? null,
    path: lcpBreakdownNode.path ?? null,
    boundingRect: lcpBreakdownNode.boundingRect ?? null,
  } : null;
  const lcpPhases = lcpBreakdownTable?.items?.map((it) => ({
    subpart: it.subpart,
    label: it.label,
    durationMs: it.duration,
  })) ?? null;

  // (b) Network requests in the FCP→LCP window
  // network-requests audit returns items with startTime + endTime (ms relative
  // to navigation start). Filter to those that overlap the FCP→LCP window
  // OR that completed AFTER FCP but BEFORE LCP (= on critical path).
  const networkAudit = lhr.audits['network-requests'];
  const allRequests = networkAudit?.details?.items ?? [];
  // Newer Lighthouse uses `networkRequestTime` / `networkEndTime` (not the
  // legacy `startTime` / `endTime`). Normalize for attribution.
  const normRequests = allRequests.map((r) => ({
    url: r.url,
    startTimeMs: r.networkRequestTime ?? r.startTime ?? null,
    endTimeMs: r.networkEndTime ?? r.endTime ?? null,
    durationMs: ((r.networkEndTime ?? r.endTime) != null && (r.networkRequestTime ?? r.startTime) != null)
      ? ((r.networkEndTime ?? r.endTime) - (r.networkRequestTime ?? r.startTime)) : null,
    transferSize: r.transferSize,
    resourceSize: r.resourceSize,
    resourceType: r.resourceType,
    statusCode: r.statusCode,
    mimeType: r.mimeType,
  }));
  const requestsInFcpLcpWindow = (metrics.FCP != null && metrics.LCP != null)
    ? normRequests.filter((r) =>
        r.endTimeMs != null && r.endTimeMs >= metrics.FCP && r.endTimeMs <= metrics.LCP + 100,
      )
    : [];
  const topLatestRequests = [...normRequests]
    .filter((r) => r.endTimeMs != null)
    .sort((a, b) => (b.endTimeMs ?? 0) - (a.endTimeMs ?? 0))
    .slice(0, 10);

  // (c) Critical request chains
  const criticalChainsAudit = lhr.audits['critical-request-chains'];
  const criticalChains = criticalChainsAudit?.details?.chains ?? null;
  const longestChainDurationMs = criticalChainsAudit?.details?.longestChain?.duration ?? null;

  // (d) Throttling config
  const configSettings = result.lhr.configSettings ?? null;
  const throttling = configSettings?.throttling ?? null;
  const throttlingMethod = configSettings?.throttlingMethod ?? null;
  const formFactor = configSettings?.formFactor ?? null;

  // (e) (f) Already captured in metrics + fcpToLcpGap above.

  // Additional audit findings worth surfacing for attribution
  const totalByteWeight = lhr.audits['total-byte-weight']?.numericValue ?? null;
  const mainThreadTasks = lhr.audits['mainthread-work-breakdown']?.numericValue ?? null;
  const renderBlockingResources = lhr.audits['render-blocking-resources']?.details?.items ?? [];

  return {
    url,
    metrics,
    fcpToLcpGap,
    lcpElement,
    lcpPhases,
    lcpDiscoveryStatus: lcpDiscovery?.scoreDisplayMode ?? null,
    requestsInFcpLcpWindow,
    topLatestRequests,
    criticalChains: criticalChains ? Object.keys(criticalChains) : null,
    longestChainDurationMs,
    throttling: {
      method: throttlingMethod,
      formFactor,
      cpuSlowdownMultiplier: throttling?.cpuSlowdownMultiplier ?? null,
      requestLatencyMs: throttling?.requestLatencyMs ?? null,
      downloadThroughputKbps: throttling?.downloadThroughputKbps ?? null,
      uploadThroughputKbps: throttling?.uploadThroughputKbps ?? null,
      rttMs: throttling?.rttMs ?? null,
    },
    additional: {
      totalByteWeight,
      mainThreadTasksMs: mainThreadTasks,
      renderBlockingResourceCount: renderBlockingResources.length,
      renderBlockingTopFive: renderBlockingResources.slice(0, 5).map((r) => ({
        url: r.url,
        totalBytes: r.totalBytes,
      })),
    },
  };
}

async function main() {
  console.log(`Phase 9+ Task 9.3 POC-6 — LCP attribution analysis`);
  console.log(`Target: ${TARGET}`);
  console.log(`Runs: ${RUNS}`);
  console.log('');

  const runs = [];
  for (let i = 1; i <= RUNS; i++) {
    console.log(`--- Run ${i}/${RUNS} ---`);
    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    });
    try {
      const data = await runLighthouseFull(TARGET, chrome.port);
      runs.push({ runIndex: i, ...data });
      console.log(`  LCP=${data.metrics.LCP?.toFixed(0)}ms FCP=${data.metrics.FCP?.toFixed(0)}ms FCP→LCP gap=${data.fcpToLcpGap?.toFixed(0)}ms TBT=${data.metrics.TBT?.toFixed(0)}ms`);
      console.log(`  LCP element: ${data.lcpElement?.nodeLabel ?? '(none)'} (selector: ${data.lcpElement?.selector ?? '(none)'})`);
      console.log(`  Requests in FCP→LCP window: ${data.requestsInFcpLcpWindow.length}`);
      console.log(`  Throttling: method=${data.throttling.method} formFactor=${data.throttling.formFactor} cpuMult=${data.throttling.cpuSlowdownMultiplier}× rtt=${data.throttling.rttMs}ms`);
    } finally {
      try { await chrome.kill(); } catch { /* ignore */ }
    }
  }

  const payload = {
    capturedAt: new Date().toISOString(),
    repo: 'Dwellium-per-spec / qualia-shell',
    task: 'phase9_task_9_3_lcp_attribution',
    target: TARGET,
    runCount: RUNS,
    methodology: 'Lighthouse n=N against live URL; full artifact capture; LCP element + network FCP→LCP window + critical chains + throttling config + main-thread-idle assessment',
    cowork_partC_authorization: 'Phase-9+ Task 9.3 POC-6 LCP-attribution analysis per Cowork verdict-lock 2026-05-23',
    sourceProvenanceNotes: {
      UserContext_post_hydration_fetch: 'UserContext.tsx:285-288 — useEffect exits IMMEDIATELY if token is null (setIsLoading(false) + return). Lighthouse runs with fresh state (no localStorage token) → /api/auth/me fetch DOES NOT FIRE in Lighthouse runs. Original hypothesis NEEDS empirical REFINEMENT.',
      LoginScreen_data_fetching: 'qualia-shell/src/components/Auth/LoginScreen.tsx — pure render component; NO useEffect, NO fetch on mount.',
      LoginScreen_lazy_loaded: 'App.tsx wraps AuthGate children in <Suspense fallback={spinner}>; LoginScreen is imported via lazyWithReload pattern. After hydration, Suspense renders → chunk fetch over network → potential FCP→LCP gap contributor.',
    },
    runs,
  };

  const baselinesDir = join(REPO_ROOT, 'Docs', 'Baselines');
  await mkdir(baselinesDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = join(baselinesDir, `${stamp}_Phase9_task_9_3_lcp_attribution.json`);
  await writeFile(outPath, JSON.stringify(payload, null, 2));
  console.log('');
  console.log(`[OK] capture written to ${outPath}`);
  console.log('');

  // Aggregate findings
  console.log('─── Aggregate findings across runs ───');
  console.log('');
  for (const r of runs) {
    console.log(`Run ${r.runIndex}:`);
    console.log(`  LCP element: ${r.lcpElement?.nodeLabel ?? '(none)'} | selector: ${r.lcpElement?.selector ?? '(none)'}`);
    console.log(`  LCP element snippet: ${r.lcpElement?.snippet?.slice(0, 120) ?? '(none)'}`);
    console.log(`  Throttling: ${r.throttling.method} | CPU ${r.throttling.cpuSlowdownMultiplier}× | RTT ${r.throttling.rttMs}ms | DL ${r.throttling.downloadThroughputKbps}kbps`);
    console.log(`  Requests in FCP→LCP window (top by endTime):`);
    const sorted = [...r.requestsInFcpLcpWindow].sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0)).slice(0, 5);
    for (const req of sorted) {
      console.log(`    ${req.endTime?.toFixed(0)}ms (dur ${req.durationMs?.toFixed(0)}ms) ${req.resourceType ?? '?'} ${req.statusCode ?? '?'} ${req.transferSize ?? 0}B ${(req.url ?? '').slice(0, 90)}`);
    }
    console.log('');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.stack || err.message}`);
  process.exit(1);
});
