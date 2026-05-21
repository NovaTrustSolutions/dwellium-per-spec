# Phase 8+ Task 8.12 Completion Report — Block C OPENER; LCP n=10 Re-Measurement Post-SSR-Architectural-Migration

**Branch.** `feat/phase-8-task-8.12-lcp-n10-remeasurement`
**Close date.** 2026-05-19
**Cowork Verdict shape.** Q1-Q8 LOCK at PRE0 (Option A MEASUREMENT-ONLY 9pt → 10pt CROSS-PHASE-SHAPE-ROBUSTNESS extension + Option γ Finding JJ hybrid cementation + Option II HALT-IF #3 Moderate threshold + Option I naming convention + 17-pattern anchor-bias-mitigation cluster + Option I pre-authorized demotion-on-close).
**Class.** **MEASUREMENT-ONLY 9pt → 10pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** per Q1 LOCK.
- NEW 10th sub-shape: `n10-statistical-rigor-re-measurement-post-architectural-migration-at-different-phase-altitude`.
- First project-wide class to cross **10pt threshold** + first cross-phase **Phase-7 → Phase-8+ extension** at MEASUREMENT-ONLY altitude.
- Calibration lineage: 7pt @ 7.10 + 8pt @ 7.11 + 9pt @ 7.14 + **10pt @ 8.12**.
**Phase-8+ position.** Block C **1-of-4 ✓** (8.12 OPENER); Block C 8.13-8.15 R.
**🎯 LCP empirical signal:** ssr:true architectural-migration **EMPIRICALLY POSITIVE** at n=10 noise-floor scale — LCP median **2,724 ms** vs Phase-7 7.11 baseline 3,903 ms = **-1,179 ms / -30.22% IMPROVEMENT**.

---

## §0 — Findings cemented (1 NEW Finding KK + Finding JJ structured cementation per Q2 LOCK Option γ)

**(KK) LCP bimodal-at-server-vs-client-rendered-paint at ssr:true framework-mode altitude (NEW Phase-8+ sub-finding at Task 8.12 measurement close)** — Empirical signature at n=10 capture:
- **Cluster A (2 runs; runs #5, #10):** LCP ≈ **1,953 ms** — FCP-coincident; Lighthouse LCP detector picks up server-rendered Branch 1 spinner content (`isLoading: true` useState initial state at AuthGate).
- **Cluster B (8 runs; runs #1, #2, #3, #4, #6, #7, #8, #9):** LCP ≈ **2,255-2,802 ms** — Lighthouse LCP detector picks up post-hydration final paint (LoginScreen).
- Empirical-vs-hypothetical: Phase-7 7.11 baseline was unimodal-tight (CV 2.29%; ssr:false library-mode HydrateFallback shell → hydrate → LCP painted at canonical 3,903 ms post-hydration). Phase-8+ Task 8.12 measurement at ssr:true exhibits NEW bimodal pattern at server-vs-client-rendered-paint altitude — distinct from Phase-7 7.11 LCP+TTI bimodal noted there (which was Lighthouse-internal jitter at single render-path altitude, not server-vs-client render-path divergence).
- **Net effect:** Lower bound (1,953 ms) AND upper bound (2,802 ms) both substantially below Phase-7 baseline (3,903 ms). Even the WORST Phase-8 run beats Phase-7 median.
- Catalog 34 → **35** (Finding KK). NOT a blocker — IS a substantive cross-phase empirical engineering signal.

**(JJ) Step-7-implementation-passes-locally-but-fails-in-clean-Linux-CI — OS-level behavioral divergence at 2 altitudes (Task 8.11 retroactive structured cementation per Q2 LOCK Option γ; hybrid: Task 8.11 CR §1 L39 narrative reference PRESERVED in-place + structured §0 entry cemented HERE at Task 8.12 OPENING canonical altitude)** — Empirical signatures at Task 8.11 PR #80 CI cycle:
1. **Run 26090991698 FAILURE** — `ERR_MODULE_NOT_FOUND: 'playwright'`. Local macOS Node resolved `playwright` via path quirk (Scripts/ is root-level; playwright is `qualia-shell/` workspace devDep); clean Linux CI cannot. Remediation: **v2.73.2 in-place patch** — `createRequire(qualia-shell/package.json)` at `Scripts/smoke_test_ssr_phase8.mjs:67-68` (sister-shape to Phase-7 `Scripts/run_lighthouse_phase7.mjs:121-126` createRequire precedent; PERMANENT cross-workspace Node ESM resolution discipline).
2. **Run 26094673300 CANCELLED** (30-min workflow timeout) — script printed PASS but Node process hung post-PASS due to lingering pipe handles to spawned `react-router-serve` child. Remediation: **v2.73.3 in-place patch** — explicit `process.exit()` + `stdio.destroy()` cleanup at `Scripts/smoke_test_ssr_phase8.mjs:336` + cleanup() handler (PERMANENT child-process-stdio-cleanup-before-SIGTERM discipline).

Catalog 33 → **34** (Finding JJ; cemented at Task 8.11 close 2026-05-19; structured §0 entry at this Task 8.12 OPENING canonical altitude per Q2 LOCK Option γ hybrid). NEW v2.60.1 cluster 13th + 14th altitudes per Q3 LOCK (`cross-workspace-Node-ESM-resolution-via-createRequire` + `child-process-stdio-cleanup-before-SIGTERM`).

**Catalog state.** Cumulative Phase-8+ engineering-finding catalog: 34 → **35** at 8.12 close (A-Y + Z + AA + CC + DD + EE + FF + GG + HH + II + JJ + KK). Per-task cadence at Phase-8+ averaged 2.9 findings/task across 12 closed tasks.

---

## §1 — Commit + Green CI references

**Commit.** `264c5c0` (squash commit for PR #81, Task 8.12 — Block C OPENER; merged 2026-05-20T20:35:56Z; resolved at Task 8.13 OPENING sweep 2026-05-20 — 38-pattern cross-phase sweep-resolutions milestone cemented at this Task 8.13 PRE0 sweep across 9 reference spots).
**PR.** [#81](https://github.com/NovaTrustSolutions/dwellium-per-spec/pull/81) (sister-shape to PR #80 close pattern).
**Branch.** `feat/phase-8-task-8.12-lcp-n10-remeasurement` (branched from `origin/main` HEAD = `eae7c88` per v2.74.1 branch-base discipline VERIFIED pre-branch — 2nd task close to leverage v2.74.1 branch-base discipline post-cementation; sister-shape to Task 8.11 close pattern).
**Green CI.** Manual dispatch expected per HALT-IF #5 EXPECTED-ABSENT pattern (Task 8.12 touches ONLY `Scripts/**` + `Docs/**` + `Docs/Baselines/**` + `CLAUDE.md` — ALL outside parity-gate paths filter; sister-shape to Tasks 8.1/8.3/8.5/8.8 doc-only/scoping-only close cycles). PII Scan runs on every push regardless. Step-8 ledger reports.

---

## §2 — Scope summary

**3-deliverable Task 8.12 ship per Cowork Q1-Q8 LOCK at PRE0:**

1. **`git mv Scripts/run_lighthouse_phase7.mjs Scripts/run_lighthouse_phase8.mjs`** — plus-script-rename per Q4 LOCK (preserves git history; sister-shape to 6.6/6.7/7.10/7.11 plus-script-rename precedent constellation). Inline edits at renamed script: (a) JSDoc rewrite (Phase-7 7.10 → Phase-8+ 8.12 framing + v2.75.1 spawn-target patch narrative + Phase-7 7.11 baseline reference + Q5 LOCK HALT-IF #3 threshold + Phase-7 → Phase-8+ rename lineage); (b) `LH_TASK_FIELD` default `phase7_task_7_10` → `phase8_task_8_12`; (c) main() console.log header Phase-7 → Phase-8+; (d) **v2.75.1 in-place spawn-target patch at L425-434** — `npx vite preview --port 4173 --strictPort` → `npx react-router-serve build/server/index.js` with PORT env var override (preserves port 4173 byte-for-byte; sister-shape to Task 8.11 v2.73.1 webServer patch at `playwright.baseline.config.ts`; 9th cumulative Phase-8+ in-place v2.X.X patch); (e) cleanup() handler v2.60.1 cluster 14th altitude discipline applied (stdio.destroy() BEFORE SIGTERM + explicit process.exit() at main() resolution; sister-shape to Finding JJ v2.73.3 remediation).
2. **NEW `Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json`** — n=10 lighthouse capture at HEAD-post-Task-8.11 `eae7c88` (ssr:true framework-mode); naming convention per Q6 LOCK Option I (preserves Phase-7 7.11 `_n10_baseline_post_X.Y` LH_CAPTURE_SUFFIX convention byte-for-byte; sister-shape to `Docs/Baselines/2026-05-15_Phase7_task_7_11_perf_capture_n10_baseline_post_7.10.json`).
3. **NEW `Docs/Phase8_Task_8_12_Completion_Report.md`** — this file. 8-section template; MEASUREMENT-ONLY 10pt class shape per Q1 LOCK; Finding JJ + KK structured §0 cementation per Q2 LOCK Option γ; v2.60.1 cluster 13th+14th + v2.75.0 PRE-FLIGHT + v2.75.1 in-place patch cementations per Q3+Q4+Q7 LOCK.

**Documentation (4 files):**

4. `Docs/AppFolio_Parity_Implementation_Plan_v2.md` — NEW v2.74 amendment at top + v2.73 demoted to historical blockquote + §9 row 8.12 R → ✓ + `264c5c0` (#81) squash-SHA cell (resolved at Task 8.13 OPENING sweep).
5. `Docs/Phases/Phase_8_Plan.md` — Task 8.12 close note appended to Phase status line (sister-shape to prior task closures).
6. `CLAUDE.md` — HEAD pointer pivot to `264c5c0`; Phase summary row 8+ updated (11 of 15 ✓ → 12 of 15 ✓; +19 vitest unchanged); Next-task pivoted to Task 8.13 (perf-lever stacking CONDITIONAL on 8.12 empirical signal — net-positive signal at -30.2% LCP improvement empirically GREEN-LIGHTS proceeding without additional perf-lever investigation; Block C 8.13-8.15 R); Calibration classes MEASUREMENT-ONLY 9pt → 10pt extension; Q8 LOCK demotion-on-close applied per Option I.
7. `Docs/Phase8_Task_8_11_Completion_Report.md` — TBD → `eae7c88` sweep completed at Task 8.12 OPENING (already resolved at Step 1).

**No production source touched at Task 8.12** — measurement-arc task per Q1 LOCK MEASUREMENT-ONLY class shape (script rename + measurement script env-var-driven invocation only; sister-shape to Phase-7 7.11 measurement-script-rename pattern).

---

## §3 — Strict-gate verification matrix

| Step | Command | Result |
|------|---------|--------|
| 1 | `cd qualia-shell && npx tsc -b` | NOT RUN (no production source touched; Q1 LOCK MEASUREMENT-ONLY class; sister-shape to Phase-7 7.11 close pattern) |
| 2 | `cd qualia-shell && npx vitest run` | NOT RUN (same reason) |
| 3 | `cd qualia-shell && npx react-router build` | ✓ PASS (build/server/index.js + build/client/ emitted; 651ms wallclock at server bundle; required for measurement step 5) |
| 4 | `cd qualia-shell && VITE_APPFOLIO_SEEDS=false npx react-router build` | NOT RUN (Q1 LOCK MEASUREMENT-ONLY; CI gate verifies seeds=false at PR open) |
| 5 | `LH_TASK_FIELD=phase8_task_8_12 LH_CAPTURE_SUFFIX=_n10_baseline_post_8.11 LH_ROOT_RUNS=10 node Scripts/run_lighthouse_phase8.mjs` | ✓ PASS (n=10 capture complete; HALT-IF #2 + HALT-IF #3 NOT TRIGGERED) |
| 6 | `node Scripts/verify_no_pii_leak.mjs` | NOT RUN (no production source touched) |
| 7 | `SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs` | NOT RUN (Task 8.11 smoke-test already PASSED at PR #80 CI; Task 8.12 does NOT touch production source) |

---

## §4 — LCP n=10 empirical signal (Phase-8+ Task 8.12 vs Phase-7 7.11 baseline)

### Phase-8+ Task 8.12 measurement (HEAD-post-Task-8.11 `eae7c88`; ssr:true framework-mode)

| Metric | n | min | max | median | mean | range | stddev | CV | Determinism |
|--------|---|-----|-----|--------|------|-------|--------|-----|-------------|
| **LCP** | 10 | 1,953.0 | 2,801.8 | **2,723.6** | **2,498.8** | 848.7 | 337.2 | 13.5% | bimodal |
| **FCP** | 10 | 1,953.0 | 1,957.3 | 1,953.7 | 1,954.0 | 4.3 | 1.2 | 0.06% | ✓ deterministic |
| **TBT** | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0% | ✓ deterministic |
| **CLS** | 10 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0% | ✓ deterministic |
| **SI** | 10 | 1,953.0 | 1,957.3 | 1,953.7 | 1,954.0 | 4.3 | 1.2 | 0.06% | ✓ deterministic |
| **TTI** | 10 | 1,953.0 | 2,801.8 | 2,731.1 | 2,501.1 | 848.7 | 338.7 | 13.5% | bimodal |

**Per-metric determinism count: 4-of-6 (FCP/TBT/CLS/SI deterministic; LCP+TTI bimodal) — IDENTICAL to Phase-7 7.11 pattern ✓**

### Phase-7 7.11 baseline (HEAD-post-7.10 `6a7eab5`; ssr:false library-mode)

LCP n=10 median **3,903 ms** / mean **3,932 ms** / CV **2.29%**.

### Cross-phase delta (Phase-8+ ssr:true vs Phase-7 ssr:false)

| Sub-threshold | Phase-7 7.11 | Phase-8+ 8.12 | Delta | % |
|--------------|--------------|---------------|-------|---|
| **LCP median** | 3,903 ms | **2,723.6 ms** | **-1,179 ms** | **-30.22% IMPROVEMENT** |
| **LCP mean** | 3,932 ms | **2,498.8 ms** | **-1,433 ms** | **-36.45% IMPROVEMENT** |
| **LCP p50** | 3,903 ms | 2,723.6 ms | -1,179 ms | -30.22% |
| **LCP p90** | ~3,995 ms | 2,801.6 ms | -1,193 ms | -29.87% |
| **LCP p99** | ~3,995 ms | 2,801.8 ms | -1,193 ms | -29.87% |
| **CV** | 2.29% | 13.49% | **+11.20 pp** | (NEW bimodal-at-server-vs-client-paint pattern per Finding KK) |
| **Determinism** | 4-of-6 | 4-of-6 | ±0 | IDENTICAL ✓ |

### HALT-IF #3 (Q5 LOCK Moderate >10% LCP regression = 4,294 ms threshold)

**STATUS: NOT TRIGGERED ✓** — Phase-8+ LCP median 2,724 ms vs threshold 4,294 ms (margin **-1,570 ms / -36.6% below threshold**).

ssr:true architectural-migration EMPIRICALLY POSITIVE at n=10 noise-floor scale. Cowork-awareness reporting (all sub-thresholds reported even if non-triggering per Q5 LOCK).

---

## §5 — Cluster cementations + sub-finding analysis

### v2.60.1 anchor-bias-mitigation cluster (Q3 LOCK 13th + 14th altitudes)

- **Pre-Task-8.12:** 12 altitudes at HEAD-post-Task-8.11.
- **Post-Task-8.12:** **14 altitudes** at HEAD-post-Task-8.12.
- 13th altitude (NEW): `cross-workspace-Node-ESM-resolution-via-createRequire` (v2.73.2 remediation at Finding JJ first signature). PERMANENT discipline: any `Scripts/**.mjs` importing workspace-installed packages MUST use `createRequire(workspace/package.json)` pattern (sister-shape to Phase-7 lighthouse precedent at `Scripts/run_lighthouse_phase7.mjs:121-126`; preserved at renamed `Scripts/run_lighthouse_phase8.mjs:141`).
- 14th altitude (NEW): `child-process-stdio-cleanup-before-SIGTERM` (v2.73.3 remediation at Finding JJ second signature). PERMANENT discipline: `child.stdout?.destroy(); child.stderr?.destroy()` BEFORE SIGTERM in cleanup() handlers for ALL spawned child processes in `Scripts/**.mjs`. Empirically extended to lighthouse script cleanup at Task 8.12 (defense-in-depth; not strictly required for n=10 capture which exited cleanly, but cements the pattern at measurement-script altitude).

### v2.64.0 cross-altitude application cluster (UNCHANGED at Task 8.12 close per Q7 LOCK)

- 8 altitudes at HEAD-post-Task-8.11 (Plan §4 L116 + audit doc §3.1 + audit doc §3.2 + L23 + `react-router.config.ts` JSDoc + smoke-test-bundle altitude + Layout-shipped FOUC IIFE + AuthGate altitude).
- Task 8.12 measurement-only scope does NOT extend v2.64.0 cross-altitude cluster (audit-content-empirical-vs-hypothetical verification altitudes); v2.75.0 + v2.75.1 cluster cementations map to anchor-bias-mitigation cluster, NOT v2.64.0 (per Q7 LOCK clusters-disjoint discipline).
- **Post-Task-8.12:** 8 altitudes UNCHANGED.

### Anchor-bias-mitigation cluster recognition (Q7 LOCK 17-pattern milestone)

- **Pre-Task-8.12:** 16 patterns at HEAD-post-Task-8.11 (v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1 + v2.64.0 + v2.65.0 + v2.66.0 + v2.67.0 + v2.68.0 + v2.69.0 + v2.70.0 + v2.71.0 + v2.72.0 + v2.73.0 + v2.74.0 + v2.74.1).
- **Post-Task-8.12:** **17 patterns** at HEAD-post-Task-8.12.
- NEW 17th pattern: **v2.75.0** — `measurement-script-spawn-target-must-match-current-HEAD-server-runtime-altitude`. Rule shape: "At any measurement task PRE0, verify `process.spawn()` targets in measurement scripts against current HEAD's server-runtime shape (`react-router-serve` vs `vite preview` vs `vite dev`) BEFORE executing measurement." Generalization of Finding JJ + v2.75.1 lighthouse patch pattern. Sister-shape to v2.64.0 production-source-config-file empirical-verification discipline.

### In-place v2.X.X patch cluster (Q4 LOCK 9th cumulative Phase-8+ patch)

- **Pre-Task-8.12:** 8 cumulative Phase-8+ in-place v2.X.X patches (v2.66.1 + v2.66.2 + v2.66.3 at Task 8.6 + v2.68.1 at 8.8 + v2.72.1 at 8.10 + v2.73.1 + v2.73.2 + v2.73.3 at 8.11).
- **Post-Task-8.12:** **9 cumulative** (NEW v2.75.1 at Task 8.12 close).
- v2.75.1 sub-shape: `measurement-script-server-startup-altitude` (sister-shape to v2.73.1 `playwright-webServer-altitude` at Task 8.11; same RR v7 framework-mode + ssr:true architectural altitude; same `vite preview` → `react-router-serve` swap pattern; same PORT env var override discipline).

### Calibration classes (MEASUREMENT-ONLY 10pt extension per Q1 LOCK)

- **Pre-Task-8.12:** 9pt class at HEAD-post-Task-8.11 (9 sub-shapes from 7.10 + 7.11 + 7.14 cross-phase calibration).
- **Post-Task-8.12:** **10pt class** at HEAD-post-Task-8.12.
- NEW 10th sub-shape: `n10-statistical-rigor-re-measurement-post-architectural-migration-at-different-phase-altitude`. First project-wide class to cross 10pt threshold. First cross-phase Phase-7 → Phase-8+ extension at MEASUREMENT-ONLY altitude.

---

## §6 — Phase-8+ → Phase-9+ transition contingencies

**Task 8.12 LCP empirical signal at -30.22% IMPROVEMENT vs Phase-7 baseline** structurally CONFIRMS ssr:true architectural-migration net-positive perf signal at n=10 noise-floor scale. Downstream Block C 8.13-8.15 unblocked at Phase-7 baseline assumptions.

**Block C 8.13 perf-lever stacking decision (post-Task-8.12 empirical-conditional):**
- Cowork Q1 LOCK Option α RECOMMENDED (deferred to Task 8.13 OPENING PRE0): ssr:true measured LCP 2,724 ms is well below v1 L228 ≤500 ms aspirational but ALSO well below Phase-7 Block B PRIMARY gate ≤3,000 ms (~30% reduction target met EMPIRICALLY at ssr:true alone).
- Empirical signal: ssr:true substantively absorbed Phase-7 Block B's ~30% LCP-reduction target without additional perf-lever stacking required.
- Task 8.13 scope projection: Block C measurement-arc continues OR perf-lever-stacking-deferred-to-Phase-9+ closure-narrative consolidation per Cowork verdict at 8.13 PRE0.

**Phase-8+ closer (Task 8.15) projection:** Empirical-record consolidation for Phase-8+ measurement-arc + SSR architectural-migration arc. Closure-narrative shape (CLOSURE-NARRATIVE-CONSOLIDATION 11th class altitude per existing Phase-6/7 closer precedents).

---

## §7 — Deferred items + carry-forward

**Phase-8+ → Phase-9+ deferred items (carry-forward to Phase-8+ closer §8):**

1. **Finding II widget-altitude SSR-safety audit** — INFORMATIONAL deferred-to-Phase-9+-widget-SSR-audit per Task 8.11 Q6 LOCK. TranscriptionHub.tsx:376 `useState(() => window.SpeechRecognition)` operationally unreachable at initial server-render due to AuthGate Branch 1 gating; smoke-test EMPIRICALLY confirms reachability analysis at Task 8.11 close. Phase-9+ widget-SSR-audit scope.
2. **Finding EE Options β + γ polish enhancements** — Suspense at AuthGate altitude (β) + pre-hydration cookie infrastructure (γ); DEFERRED to Phase-9+ per Task 8.11 Q2 LOCK. Option α (current state) cemented as PERMANENT baseline at smoke-test-pass altitude.
3. **Finding KK bimodal-at-server-vs-client-rendered-paint** — informational empirical signal at Phase-8+ measurement altitude; does NOT block Block C continuation; Phase-9+ potential investigation if Suspense-at-AuthGate (Option β) cementation occurs.

**Task 8.13 OPENING PRE0 candidates:**
1. **TBD sweep** — Task 8.12 TBD → `264c5c0` resolved at Task 8.13 OPENING sweep 2026-05-20 (38-pattern cross-phase sweep-resolutions milestone CEMENTED at Task 8.13 OPENING across 9 reference spots; extending 37-pattern at Task 8.12 OPENING; 5-consecutive TBD → squash-SHA task-cadence 8.9+8.10+8.11+8.12+8.13).
2. **Q1 verdict** — Block C 8.13 scope decision: continue measurement-arc OR pivot to closure-narrative consolidation (perf-lever stacking absorbed by ssr:true architectural-migration).
3. **Q2 verdict** — Finding KK structured cementation altitude (Task 8.12 §0 retroactive vs Task 8.13 OPENING §0 sister-shape to Q2 LOCK Option γ hybrid precedent at Task 8.12).

---

## §8 — Empirical-record summary (Task 8.12 close cementation)

**🎯 Phase-8+ Task 8.12 ships as Block C OPENER + Phase-8+ measurement-arc kickoff:**

1. **MEASUREMENT-ONLY 10pt class extension** — first project-wide class to cross 10pt threshold; first cross-phase Phase-7 → Phase-8+ extension at MEASUREMENT-ONLY altitude.
2. **LCP -30.22% IMPROVEMENT** vs Phase-7 7.11 baseline at ssr:true HEAD-post-Task-8.11 — ssr:true architectural-migration empirically POSITIVE at n=10 noise-floor scale.
3. **HALT-IF #3 NOT TRIGGERED** — Phase-8+ LCP median 2,724 ms vs Q5 LOCK Moderate threshold 4,294 ms (margin -36.6%).
4. **4-of-6 determinism preserved** — IDENTICAL pattern to Phase-7 7.11 baseline (FCP/TBT/CLS/SI deterministic; LCP+TTI bimodal).
5. **NEW Finding KK** — LCP bimodal-at-server-vs-client-rendered-paint at ssr:true framework-mode altitude (NEW Phase-8+ sub-finding; informational; not a blocker).
6. **Finding JJ structured §0 cementation** at canonical Task 8.12 OPENING altitude per Q2 LOCK Option γ hybrid (Task 8.11 CR §1 L39 narrative reference PRESERVED in-place + structured §0 entry HERE).
7. **v2.60.1 cluster 13th + 14th altitudes cemented** — cross-workspace Node ESM resolution + child-process stdio cleanup discipline.
8. **17-pattern anchor-bias-mitigation cluster** — NEW v2.75.0 PRE-FLIGHT discipline (measurement-script-spawn-target verification).
9. **9th cumulative Phase-8+ in-place v2.X.X patch** — NEW v2.75.1 at lighthouse measurement-script-server-startup altitude (sister-shape to v2.73.1 webServer patch at Task 8.11).
10. **plus-script-rename precedent extension** — sister-shape constellation Phase-5 → Phase-6 → Phase-7 → Phase-8+ rename lineage cemented at `Scripts/run_lighthouse_phase8.mjs` (git history preserved via `git mv`).

**Cumulative state at HEAD-post-Task-8.12:** 35 findings + 14 v2.60.1 cluster altitudes + 8 v2.64.0 cross-altitude application altitudes (unchanged) + 17-pattern anchor-bias-mitigation cluster + 9 cumulative in-place v2.X.X patches + 19 project-wide classes (MEASUREMENT-ONLY now 10pt at cross-phase milestone) + vitest 278 unchanged + 14 cumulative factory-produced stores (unchanged; no provider remediation at 8.12) + 10th cross-phase production-source-edit chunk-axis BREAK data point N/A (no production source touched at 8.12 per Q1 LOCK MEASUREMENT-ONLY class).

**TBD sweep convention APPLIED at Task 8.13 OPENING 2026-05-20:** Task 8.12 TBD references at CLAUDE.md HEAD (3) + Plan v2 §9 row 8.12 (2) + Phase_8_Plan §status (1) + this Completion Report §1 + §5 + §6 (3) — **9 reference spots RESOLVED** to actual squash-SHA `264c5c0` at Task 8.13 OPENING sweep per established Task N TBD → Task N+1 sweep pattern + v2.74.1 branch-base discipline (sister-shape constellation extending 37-pattern → **38-pattern cross-phase sweep-resolutions milestone CEMENTED** at Task 8.13 OPENING).
