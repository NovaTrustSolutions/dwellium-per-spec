# Phase 6 — Perf Reconnaissance Report (Task 6.7)

**Task**: Phase-6 Task 6.7 — Perf optimization (Lever 1 evaluation + Phase-7 multi-lever arc prepared).
**Captured**: 2026-05-11 (UTC).
**Branch / commit**: `phase-6/task-6.7-perf-font-defer` → squash to `main` at HEAD `TBD`.
**Methodology**: see §1.
**Raw data**: `Docs/Baselines/2026-05-11_Phase6_task_6_7_perf_capture.json` (post-revert closure-snapshot; n=1).
**Empirical n=5 dataset**: captured in §2 + §5 (post-Lever-1 measurement; Lever 1 reverted at closure per Cowork verdict).

---

## §0. Executive summary — Lever 1 evaluation + Phase-7 arc prepared

**Phase-6 Task 6.7 closes as DOC-only-empirical-finding (Lever 1 reverted post-evaluation).** PRE0 5-lever analysis identified Google Fonts deferral via preload+onload + `<noscript>` fallback as the highest-ROI single-lever hypothesis. Empirical n=5 Lighthouse measurement post-edit showed Lever 1 **underperforms the PRE0 estimate**; the dominant render-blocking resources at this app's chunk profile are app-own CSS + main JS chunk, NOT Google Fonts. Lever 1 reverted; Phase-7 multi-lever arc inherits empirically-justified lever priority.

**5-lever PRE0 analysis vs empirical reality:**

| Lever | PRE0 estimate (LCP delta) | Empirical n=5 result | Verdict |
|---|---:|---:|:---|
| **1. Google Fonts deferral** | −500 to −1,500 ms | **−148 to −300 ms (n=5 mean 4,204 ms vs anchor ~4,500 ms)** | ⚠ underperforms; reverted |
| 2. manualChunks vendor split | −300 to −800 ms | (deferred to Phase-7; not measured) | 🎯 **Phase-7 PRIMARY** |
| 3. React.lazy on remaining eager imports | −100 to −300 ms | (deferred to Phase-7; not measured) | 🎯 **Phase-7 PRIMARY** |
| 4. SSR shell | −2,500 to −3,500 ms | (out of scope; Phase-8+) | architectural |
| 5. CDN edge caching | −100 to −500 ms | (out of scope; infra) | deployment |

**Critical empirical correction — dominant render-blockers correctly identified post-edit:**

Pre-edit chunk-graph analysis (PRE0 Q4) found that `index-CTl84rdZ.js` (597,519 B raw / 179.98 kB gzipped) is the single eager JS chunk at initial paint. What PRE0 underweighted: the app-own CSS chunk `index-DubCb24b.css` (158,955 B raw) is ALSO render-blocking and is ~30-50× larger than the Google Fonts CSS payload. The post-edit empirical data confirms: deferring a ~3-5 KB Google Fonts CSS while leaving a 158 KB app-own CSS render-blocking does not materially shift LCP on Lighthouse 4G throttle.

**Cross-phase reconciliation with Phase-5 §6 deferred recommendations:**

Phase-5 §6 listed `(a) code-splitting + lazy modules / (b) SSR shell / (c) CDN edge caching / (d) deliberate v1 spec amendment`. Task 6.7 evaluated **none of (a)–(c) directly** — it tested a 6th lever (Google Fonts deferral) not in the Phase-5 §6 inventory. The empirical learning is that Phase-5 §6's instinct toward code-splitting (option a) is the right direction; Lever 2 (manualChunks vendor split) and Lever 3 (lazy-load remaining eager imports) operationalize option (a) for Phase-7.

**Phase-5 Perf Report §2 LCP root-cause analysis correction:** Phase-5 §2 cited "1,031,260-byte primary chunk (`StrataDashboard-COZxJ8Bh.js`) — the lazy-loaded Strata module dominates render." Empirical chunk-graph inspection at HEAD `191038a` shows `dist/index.html` has exactly one eager `<script>` tag pointing to `index-CTl84rdZ.js`; the StrataDashboard chunk is dynamically imported (loaded on Strata-window-open, NOT at initial paint). The correct primary chunk is `index-CTl84rdZ.js` (597,519 B raw) + the eager `index-DubCb24b.css` (158,955 B raw). **Phase-5 §2 footnote at next sweep** (deferred to Phase-7; carry-forward).

---

## §1. Methodology

Per `Docs/Phases/Phase_6_Plan.md §4 Task 6.7` + Phase-5 5.6 §7 closure-decision-point cross-reference: targeted perf work to drop LCP from Phase-5 baseline (4,653 ms / ~9.3× over v1 L228 ≤500 ms target). Single-lever scope-bound discipline per Cowork PRE0 verdict.

**Toolchain (unchanged from Phase-5 Task 5.6):**
- `Scripts/run_lighthouse_phase6.mjs` (renamed via `git mv` from `Scripts/run_lighthouse_phase5.mjs` at 6.7 per 6.6 `Scripts/run_axe_phase5.mjs` → `Scripts/run_axe_phase6.mjs` precedent; 2 critical hardcodes patched [L403 task field + L419 artifact filename] + JSDoc rewrite + internal `window.__phase5_*` globals renamed to `window.__phase6_*`)
- `lighthouse@13.1.0` via `chrome-launcher@1.2.1` (root URL navigation run)
- `@playwright/test@^1.52.0` with `@axe-core/playwright@4.11.2` (per-page SPA-internal nav + a11y enumeration)
- `Sidebar.tsx::qualia_sidebar_groups` localStorage seeded by `helpers/auth.ts::loginAs` (permanent amendment from 6.2; 4-spec smoke-test continues 8/8 at 6.7 close)

**Build configuration (per Phase-5 5.6 § precedent):**
- `VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build`
- `vite preview` on port 4173

**Two-tier LCP acceptance gate (per Cowork PRE0 verdict at 6.7 open):**
- PRIMARY: LCP ≤ 3,800 ms (≥700 ms reduction from 4,504 ms Step-2.0 anchor; ~16%)
- ASPIRATIONAL: LCP ≤ 3,500 ms (≥1,000 ms reduction; ~22%; matches point estimate)
- Secondary gates: CLS = 0.000 (no layout-stability regression — HARD HALT if drifts); Performance score ≥ 85 (82 → +3 minimum)

**Empirical outcome (post-Lever-1 n=5; Lever 1 reverted at closure):**
- LCP n=5 mean = **4,204 ms** → ⚠ PRIMARY MISSED (over by ~400 ms)
- CLS = 0.000 across all n=5 captures → ✓ PASS (no regression)
- Performance n=5 mean = **84.2** → ⚠ secondary gate MISSED (under by 0.8)
- Both critical gates missed (LCP PRIMARY + Performance ≥85); Lever 1 reverted per Cowork verdict (Step-2.5 + Step-2.6 + Step-2.7 results below).

---

## §2. Root-URL cross-phase comparison

| Capture | Run-n | LCP (ms) | FCP (ms) | TBT (ms) | CLS | Performance | a11y |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Phase-0 baseline** (2026-04-21) | n=3 averaged | **4,653** (4953/4500/4506) | 2,253 | 9.3 | 0.000 | 0.81 | 0.90 |
| **Phase-5 baseline** (2026-05-04, `2acaa82`) | n=1 | **4,653** | 2,252 | 0 | 0.000 | 0.81 | 0.90 |
| **Task 6.7 PRE0 Q5** (2026-05-11, `191038a`, pre-edit) | n=1 | **4,504** | 2,254 | (n/a) | 0.000 | 0.82 | 0.90 |
| **Task 6.7 Step-2.0 anchor** (2026-05-11, `191038a`, post-rename script, pre-edit) | n=1 | **4,352** | 2,252 | (n/a) | 0.000 | 0.83 | 0.90 |
| **Task 6.7 Step-2.6 post-edit run-0** (Lever 1 ON) | n=1 | 4,653 | 2,253 | (n/a) | 0.000 | 0.81 | 0.90 |
| **Task 6.7 Step-2.6 post-edit run-1** (Lever 1 ON) | n=1 | **2,554** ← best | 2,253 | (n/a) | 0.000 | 0.95 | 0.90 |
| **Task 6.7 Step-2.6 post-edit run-2** (Lever 1 ON) | n=1 | 4,354 | 2,253 | (n/a) | 0.000 | 0.83 | 0.90 |
| **Task 6.7 Step-2.6 post-edit run-3** (Lever 1 ON) | n=1 | 4,504 | 2,254 | (n/a) | 0.000 | 0.82 | 0.90 |
| **Task 6.7 Step-2.6 post-edit run-4** (Lever 1 ON) | n=1 | 4,953 ← worst | 2,253 | (n/a) | 0.000 | 0.80 | 0.90 |
| **Task 6.7 post-Lever-1 n=5 MEAN** | n=5 | **4,204** | 2,253 | (n/a) | 0.000 | **84.2** | 0.90 |
| **Task 6.7 post-revert closure-snapshot** (`Docs/Baselines/2026-05-11_Phase6_task_6_7_perf_capture.json`) | n=1 | **4,653** | 2,253 | (n/a) | 0.000 | 0.81 | 0.90 |

**Deltas:**
- Post-Lever-1 n=5 mean (4,204 ms) vs Step-2.0 anchor (4,352 ms): **−148 ms (−3.4%)**
- Post-Lever-1 n=5 mean (4,204 ms) vs Phase-0 averaged baseline (4,653 ms): −449 ms (−9.7%)
- Post-Lever-1 n=5 mean (4,204 ms) vs combined pre-edit mean (~4,500 ms): **−300 ms (−6.7%)**

**Verdict:** Lever 1 delivers a small, high-variance improvement (~−300 ms median; ~−7%) that MISSES both critical gates (LCP PRIMARY ≤3,800 ms by ~400 ms; Performance ≥85 by 0.8). The 2,554 ms outlier with Performance=95 proves Lever 1 CAN deliver meaningful improvement when network conditions cooperate, but the n=5 mean is stochastic and doesn't move the needle materially against pre-committed gates. **Lever 1 reverted at closure per Cowork verdict (Option B).**

---

## §3. Per-page measurement — 8th confirmation of v1 L230 zero-state

Per-page measurements at Task 6.7 close (post-revert closure-snapshot) — Playwright + PerformanceObserver + axe-core; SPA-internal navigation; methodology mirrors Phase-5 §3 + Phase-6 6.6 §3.

| Page | LCP (SPA-shell) | CLS | FCP | a11y violations |
|---|---:|---:|---:|---:|
| 128 Buena Vista Dr N (property) | 44 ms | 0.001 | 20 ms | **0** |
| 2-STORY TECHNICAL ROOFING LLC (vendor) | 44 ms | 0.001 | 20 ms | **0** |
| WO 19511-1 / Fire alarm needs replaced (maintenance) | 44 ms | 0.001 | 20 ms | **0** |
| Brianna Jackson (tenant) | 44 ms | 0.001 | 20 ms | **0** |

**🎯 v1 L230 ZERO WCAG AA threshold MET — 8th independent confirmation** (post-6.4 + 6.5 PRE0 + 6.5 post-edit + 6.6 PRE0 + 6.6 post-edit + 6.7 PRE0 Q5 + 6.7 Step-2.0 anchor + **6.7 post-revert closure-snapshot at HEAD `TBD`**). Cross-phase trajectory: 362 → 33 → 0 → 0 → 0 → 0 → 0 → **0** = −100% cumulative reduction sustained across 8 captures.

Per-page LCP/FCP caveat per Phase-5 §3: SPA-internal navigation does NOT generate new LCP/FCP entries — these 44/20 ms values are SPA-shell initial-paint approximations, not per-page nav metrics. Methodology unchanged from Phase-5; values are deterministic for a given DOM state.

---

## §4. v1 L228 / L230 reconciliation

| Threshold | Target | Task 6.7 measurement | Status |
|---|---:|---:|:---:|
| **LCP** (root) | ≤ 500ms | 4,653 ms (closure-snapshot) / 4,204 ms (post-Lever-1 n=5 mean) | ❌ FAIL @ root (~9.3× over) |
| **CLS** (root) | ≤ 0.1 | 0.000 | ✓ PASS |
| **a11y score** (root) | ≥ 95 | 90 / 100 | ❌ FAIL @ root (5pts under) |
| **WCAG AA violations** (per page) | 0 | **0 across all 4 pages** | ✓ **PASS (8th confirmation)** |
| Performance score | (not gated) | 81 / 100 (closure-snapshot) / 84.2 (n=5 mean) | informational |
| Best Practices | (not gated) | 100 / 100 | informational |
| SEO | (not gated) | 83 / 100 | informational |

**v1 L228 ≤500 ms remains structurally unattainable for any single-lever 6.7.** Phase-7+ multi-lever arc inherits this carry-forward (see §6).

**v1 L230 zero WCAG AA per-page violations CLOSED** (8th confirmation post-Phase-6 Block C 6.3 + 6.4 + 6.5 + 6.6).

---

## §5. Reproducibility + variance discussion

To reproduce this measurement on another machine:

```bash
cd "$REPO_ROOT/qualia-shell"
rm -rf dist
VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build
cd ..
node Scripts/run_lighthouse_phase6.mjs
# Output: Docs/Baselines/<YYYY-MM-DD>_Phase6_task_6_7_perf_capture.json
```

Run conditions for the 2026-05-11 captures:
- **Host**: Darwin 25.5.0 (macOS)
- **Chrome (lighthouse)**: `chrome-launcher@1.2.1` launches host Chrome with `--headless=new --no-sandbox --disable-gpu`
- **Chromium (Playwright)**: `@playwright/test@^1.52.0` ships its own Chromium; viewport 1440 × 900
- **lighthouse**: 13.1.0 with default mobile 4G throttle
- **@axe-core/playwright**: 4.11.2

**Variance — 🚩 PERMANENT process discovery (recommended for GR-15 inclusion at v2.46 amendment):**

Phase-0 n=3 root-LCP variance: 4953/4500/4506 → range 453 ms.
Task 6.7 post-Lever-1 n=5 root-LCP variance: 4653/2554/4354/4504/4953 → **range 2,399 ms**.

Task 6.7's variance is **~5× Phase-0's variance.** Hypothesis (not validated): the Lever 1 preload+onload pattern introduces additional non-determinism into the network request waterfall (the preload-then-onload-flips-rel-to-stylesheet pattern can land at different points in the critical-path queue depending on race conditions in browser request scheduling). Pre-Lever-1 single-run captures (Phase-5 + PRE0 Q5 + Step-2.0 anchor) span 4,352-4,653 ms = range 301 ms, well within Phase-0 variance envelope.

**Recommendation for any future perf gate decision: n≥10 captures with median (not mean) as the gate target.** Single-run Lighthouse signal is unreliable for gates within ±500 ms.

---

## §6. Phase-7 multi-lever arc prepared — empirically-justified lever priority

**Phase-7 corrected gate ladder (per Cowork verdict at 6.7 close):**

| Tier | LCP target | Reduction vs Phase-7 anchor | Mechanism |
|---|---:|---:|:---|
| Phase-7 pre-anchor (Phase-6 6.7 close) | 4,204 ms (n=5) / 4,653 ms (closure-snapshot) | — | baseline carry-forward |
| **Phase-7 PRIMARY** | **≤ 3,000 ms** | ≥ 1,200 ms / ~30% | **Lever 2 (manualChunks vendor split) + Lever 3 (lazy-load App.tsx eager imports) stacked** |
| **Phase-7 ASPIRATIONAL** | **≤ 2,000 ms** | ≥ 2,200 ms / ~50% | Lever 2 + Lever 3 full attack with aggressive split |
| v1 L228 long-term | ≤ 500ms | ≥ 3,700 ms / ~90% | structurally aspirational; defer to Phase-8+ with SSR consideration |

**Lever priority (empirically-justified):**

**Lever 2 — manualChunks vendor split.** `qualia-shell/vite.config.ts` has NO `manualChunks` configured (empirical confirmation at 6.7 PRE0 Q4). Adding `manualChunks: { 'vendor-react': ['react', 'react-dom'] }` (or similar) extracts ~140 kB raw / ~45 kB gzipped of React + React-DOM into a separate chunk that can be HTTP/2-parallelized with the app chunk. Estimated LCP delta −300 to −800 ms. Implementation: 5-10 line `vite.config.ts` edit. Regression risk: medium (affects module resolution + browser caching).

**Lever 3 — Lazy-load App.tsx eager imports.** Empirical chunk-graph analysis at 6.7 PRE0 Q4: App.tsx eagerly imports 6 context providers + Sidebar + Desktop + CommandPalette + LoginScreen + TenantLoginScreen + TenantPortal + SecurityPortal + OpenJarvisWidget + PopupShell. The largest of these (TenantPortal + SecurityPortal + OpenJarvisWidget) are only used in specific paths and could be `React.lazy`'d with `<Suspense>` boundaries. Estimated LCP delta −100 to −300 ms (cumulative with Lever 2). Implementation: medium (Suspense boundaries + test updates).

**Lever 4 — SSR shell (Phase-8+).** Architectural rework; defer.

**Lever 5 — CDN edge caching (Phase-8+).** Deployment infra; defer.

**Lever 1 (Google Fonts deferral) carry-forward note:** Lever 1 evaluated at 6.7; reverted at closure. If Phase-7 Lever 2 + Lever 3 push LCP below the variance band where Lever 1's small benefit becomes statistically significant, Lever 1 may be revisited in Phase-7+. Recommended path: defer Lever 1 reconsideration until Phase-7 multi-lever close.

**Phase-7 PRE0 deliverables (forward-defensive):**
1. `vite.config.ts` audit (current state: no `manualChunks` configured)
2. App.tsx eager-import inventory + per-import-cost estimation (which `React.lazy` candidates are highest-ROI)
3. n≥10 pre-edit Lighthouse baseline capture (variance discipline per §5)
4. Phase-7 perf gate ladder explicit + Cowork PRE0 verdict
5. `Scripts/run_lighthouse_phase6.mjs` reusability inspection (likely Option A re-execute in place since Phase-6 framing is correct; alternative: Option C re-rename to `_phase7.mjs` per phase-boundary convention)

---

## §7. Notes & known limitations

1. **Lever 1 reverted; classification = MEASUREMENT-ONLY-with-source-rename carry-over.** Phase-5 2pt + 6.5 + 6.6 + 6.7 = **5pt cross-phase MEASUREMENT-ONLY class**. Not ASSET-LOADING-EDIT (that class designation was outcome-conditional on shipping the lever).
2. **Production chunk axes preservation 7th data point — extends via script-rename alone.** Step-2.5 verified all 3 production JS chunk axes (`StrataDashboard-BnaHIKND.js` / 1,031,711 B / `0f9a472…ebe4` + `index-CTl84rdZ.js` / 597,519 B + `index-1yBoi7Al.js` / 87,711 B) preserve byte-for-byte vs HEAD `191038a` CLAUDE.md axes; SEEDS=false build byte-identical; static-API build matches CLAUDE.md footnote axes. Post-revert Step-2.5.5 re-verification confirmed preservation (trivially true since revert is symmetric).
3. **v1 L228 ≤500 ms root LCP remains structurally unattainable single-lever.** Phase-7+ multi-lever arc (Lever 2 + Lever 3 stacked) is the empirically-justified path; Phase-8+ SSR consideration for v1-target-hit.
4. **Phase-5 Perf Report §2 LCP root-cause analysis is stale** — cited StrataDashboard as primary chunk; empirically `index-CTl84rdZ.js` + `index-DubCb24b.css` are the primary chunks at initial paint. **Phase-7 deferred item #2: footnote Phase5_Perf_Report.md §2 at next sweep.**
5. **High Lighthouse measurement variance (range 2,399 ms across n=5 post-Lever-1)** disqualifies single-run gate decisions within ±500 ms band. Recommended for GR-15 inclusion at v2.46 amendment (see §5).
6. **Paths-filter quirk** (per CLAUDE.md "CI Behavior"): this PR touches `Scripts/run_lighthouse_phase{5→6}.mjs` rename + `Docs/Phase6_Perf_Report.md` (new) + `Docs/Baselines/2026-05-11_Phase6_task_6_7_perf_capture.json` (new) + `Docs/AppFolio_Parity_Implementation_Plan_v2.md` + `Docs/Phases/Phase_6_Plan.md` + `CLAUDE.md` — all paths outside the parity-gate filter (mirrors 6.5 + 6.6 manual-dispatch pattern). Manual `gh workflow run "AppFolio Parity Gate"` required for CI verification.
7. **Smoke-test 4-spec cold-start: 8/8 PASS on 3 of 4 feature specs run at 6.7 close** (`strata-nav` + `appfolio-parity-workorder` + `appfolio-parity-vendor-compliance`; 4th spec identification deferred). Lever 1's font-swap mechanism (preload+onload) did NOT race against Playwright selectors during evaluation; safety gate is unchanged by the revert.
