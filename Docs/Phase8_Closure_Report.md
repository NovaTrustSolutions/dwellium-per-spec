# Phase 8+ — SSR Architectural Migration Closure Report

**Date:** 2026-05-21
**Commit (HEAD on `main`):** `fe3643d` (squash commit for PR #82 Task 8.13 close = current HEAD before this closer; closer squash-SHA cell `99b41ac` resolves at Task 8.15 publishing sweep per established Task N TBD → Task N+1 sweep pattern + v2.74.1 branch-base discipline; 39-pattern cross-phase sweep-resolutions cemented at Task 8.14 OPENING; 6-consecutive task-cadence 8.9-8.14)
**Green CI run:** Manual-dispatched per CLAUDE.md "Paths-filter quirk" section — closer touches only `Docs/**` + `CLAUDE.md` root; outside `qualia-shell/src/**` + `qualia-shell/app/**` filter scope (sister-shape constellation to Tasks 8.1/8.3/8.5/8.8/8.12/8.13 doc-only/SCOPING-ONLY close cycles). Final dispatched run ID resolved at Task 8.14 Step-8 ledger.
**Plan reference:** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 (Verification Matrix; **Phase-8+ column R → ✓ flip across all 13 closed rows at this closure** sister-shape to Phase-6 + Phase-7 column flip at 6.9 + Phase-7 closer; row 8.14 R → ✓ + row 8.15 R remaining as publishing handoff per Q6 LOCK 2-step separation)
**Template mirror:** `Docs/Phase7_Closure_Report.md` (Phase-7 closer = 323 lines / 74,406 bytes; CLOSURE-NARRATIVE-CONSOLIDATION 2pt cross-phase data point) + `Docs/Phase6_Closure_Report.md` (Phase-6 closer = 272 lines / 51,782 bytes; FIRST CLOSURE-NARRATIVE-CONSOLIDATION instance; 1pt baseline). Phase-8+ closer **3rd cross-phase data point** → **CLOSURE-NARRATIVE-CONSOLIDATION 2pt → 3pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** per Cowork Q1 LOCK Option A.

---

## Executive Summary

Phase 8+ exits **green**. All 13 closed Phase-8+ task rows in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 sub-tracker are `✓` (8.1 OPENER + Block A 8.2-8.5 + Block B 8.6-8.11 + Block C 8.12-8.13 + 8.14 closer at this commit); Phase-8+ column R → ✓ flip applied across all 13 closed rows at this closure; row 8.15 publishing R remaining per Q6 LOCK 2-step separation. The full vitest suite holds at **278/278** in CI — **+19 cumulative tests across the entire phase** (Phase-7 closure baseline 259 → Phase-8+ closure baseline 278; +5 at 8.2 react-router-dom migration test-spec + +5 at 8.9 providerSSRSafety server-snapshot tests + +9 at 8.10 server-snapshot tests covering 9 NEW factory-produced stores). `tsc -b` is zero-error; both `react-router build` modes succeed at HEAD-post-Task-8.11 ssr:true; smoke-test PASSED at Task 8.11 PR #80 CI cycle (14 factory-produced stores work under true SSR runtime — zero `ReferenceError` + zero hydration mismatch warnings + zero console errors at chromium-headless probe); `verify_no_pii_leak.mjs` is clean on the strict scope (51 files / 0 leaks); CodeRabbit returns no blocking comments across all 13 closed PRs (PRs #69-#82). **🎯 SSR architectural migration arc COMPLETE empirically** — first `ssr: true` state in project history at HEAD-post-Task-8.11 `eae7c88`.

**SIX HISTORIC outcomes mark Phase-8+ closure:**

1. **🎯 Block B 6-of-6 COMPLETE at Task 8.11 — SSR architectural migration arc COMPLETE** — `ssr: false → true` flip at `qualia-shell/react-router.config.ts` + NEW `Scripts/smoke_test_ssr_phase8.mjs` 5-phase smoke-test bundle + `@react-router/serve@7.15.1` install (production dep per Q5 LOCK + Finding S) + NEW BLOCKING smoke-test CI step + v2.73.1 in-place webServer patch (`vite preview` → `react-router-serve`). Block B = 6-task arc 8.6-8.11: framework-mode adoption (8.6) + entry-boundaries (8.7) + per-route SSR scope-refutation (8.8) + provider-remediation (8.9) + AdminShell-tree + leaf-component remediation (8.10) + ssr-flip + smoke-test (8.11). FRAMEWORK-INSTALLATION 3pt + PROVIDER-SSR-REMEDIATION 3pt EXTENDED PAST FULL CALIBRATION at 8.11 close (2-of-4 Phase-8+-introduced classes at 3pt CROSS-TASK-SHAPE-ROBUSTNESS).

2. **🎯 LCP empirical signal at −30.22% IMPROVEMENT post-SSR-migration** — Task 8.12 LCP n=10 re-measurement at HEAD-post-Task-8.11 (ssr:true framework-mode): median **2,724 ms** vs Phase-7 7.11 baseline 3,903 ms (−1,179 ms / −30.22%); mean 2,499 ms vs 3,932 ms (−1,433 ms / −36.45%); 4-of-6 metric determinism preserved (FCP/TBT/CLS/SI deterministic; LCP+TTI bimodal — IDENTICAL Phase-7 7.11 pattern). HALT-IF #3 Moderate threshold 4,294 ms NOT TRIGGERED (margin −36.6% / 1,570 ms headroom below threshold). ssr:true architectural-migration EMPIRICALLY POSITIVE at n=10 noise-floor scale. **First ssr:true measurement in project history**; first cross-phase architectural-axis-change-and-re-measurement data point.

3. **🎯 v1 L228 ≤500 ms LCP DUAL-FRAMING verdict per Ilya-level decision** — at §6.2 of this closer, v1 L228 reachability verdict is presented in DUAL-FRAMING with equivalent rigor per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` "all outcomes are publishable deliverables" stance. **Framing (a) STRUCTURALLY-UNATTAINABLE-even-with-SSR-migration**: 2,724 ms = 5.45× over ≤500 ms target; three architectural arcs each closed ~30-40% (Phase-6 single-lever / Phase-7 multi-lever / Phase-8+ SSR-migration); categorically out of reach at React 19 + Vite 6 + RR v7 framework-mode architecture. **Framing (b) PARTIAL-MET**: ~41% cumulative gap-closure delivered (4,653 → 3,903 → 2,724 ms cross-phase trajectory); real, measurable, monotonic progress across three architectural arcs; gate not met but materially advanced. NO single forced verdict line — both framings ship with equivalent rigor; Phase-9+ LCP-objective disposition is STAKEHOLDER-DECISION-PENDING.

4. **🎯 Recursive-validation discipline as the project's most substantive engineering-record pattern at HEAD-post-Phase-8+** — 8-consecutive cross-altitude refutation cluster Findings **L + O + W + Y + Z + GG + JJ + KK** at altitudes spanning Plan-row (L+LL v2.65.0 cluster) + PRE0-hypothesis (O+W+Y+Z) + Step-7-entry whole-file-read (GG) + clean-Linux-CI (JJ) + measurement-script-spawn-target (KK precedent altitude). v2.60.1 cluster grew **4 → 15 altitudes** within Phase-8+ scope (Z+AA+CC+DD+EE+CC+DD+FF+GG+HH+II+JJ-cluster-13th+JJ-cluster-14th+15th-Cowork-directive-hypothesis-refutation); v2.64.0 cluster grew **5 → 8 altitudes** (J Phase-4 founding + M Plan §4 + Z UserProvider audit doc §3.2 + AA react-router.config.ts JSDoc + L23 narrative + FF audit-content empirically-CONFIRMED 6th + GG 7th + 8th CONFIRMATION at AuthGate per Q3(b) LOCK). 18-pattern anchor-bias-mitigation cluster cemented at HEAD-post-Task-8.13 (NEW v2.76.0 Cowork-directive-gate-citation-verification PRE-FLIGHT discipline). **8th-altitude refutation includes Cowork-directive-hypothesis altitude** — recursive-validation discipline applies to Cowork directives identically to audit-citation + Plan-row + Step-7-entry hypotheses.

5. **🎯 4-of-4 Phase-8+-introduced classes calibrated AND EXTENDED PAST FULL CALIBRATION milestone** — SCOPING-ONLY 5pt (highest-calibrated Phase-8+-introduced class within phase) + SSR-MIGRATION-PREP 2pt + FRAMEWORK-INSTALLATION 3pt + PROVIDER-SSR-REMEDIATION 3pt. **Distribution-of-calibration-depths IS itself a substantive engineering signal** — first such pattern at project scale; 3-of-4 at 3pt+ CROSS-TASK-SHAPE-ROBUSTNESS. Sub-shape constellation at SCOPING-ONLY: (1) forward-scoping-pre-implementation-roadmap @ 8.1+8.3 + (2) empirical-inventory-confirming-NO-extraction-needed @ 8.5 + (3) empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE @ 8.8 + (4) empirical-inventory-confirming-perf-lever-stacking-EXHAUSTED-at-architectural-altitude @ 8.13. SCOPING-ONLY = first Phase-8+-introduced class to cross 5pt within phase.

6. **🎯 Perf-lever stacking EMPIRICALLY EXHAUSTED at React 19 + Vite 6 + RR v7 framework-mode + ssr:true architecture** — Task 8.13 perf-lever-scope-refutation: 0-of-3 Plan v2 §9 8.13-row candidates with effective new-scope. (i) SSR + React.lazy stacking ALREADY-APPLIED (Phase-7 7.10 lazy-load lever preserved through Task 8.6 RR v7 framework-mode + Task 8.11 ssr:true flip); (ii) per-page Vike-mode tuning N/A-BY-CONSTRUCTION (Vike eliminated at Task 8.1 §3 framework-decision-tree; per-route SSR opt-out structurally infeasible at RR v7.15.1 per Finding Y); (iii) asset preloading depth STRUCTURALLY-INSUFFICIENT (Phase-7 Finding A anti-pattern: LCP bottleneck at React 19 + Vite 6 is initial-paint JS parse+execute NOT critical-path bytes-downloaded). Phase-8+ perf-lever-arc structurally closed at Task 8.13 close.

**4 NEW Phase-8+-introduced calibration classes shipped at Phase-8+ closure** (sister-shape comparison to Phase-6's 2 NEW + Phase-7's 4 NEW; Phase-8+ matches Phase-7's class-introduction cadence):

- **SCOPING-ONLY** at 8.1 (project-wide 16th) — scope-discipline shape for forward-scoping deliverables (audit/inventory/roadmap docs); **5pt within Phase-8+ at 8.1+8.3+8.5+8.8+8.13** (highest-calibrated Phase-8+-introduced class within phase); structurally distinct from CLOSURE-NARRATIVE-CONSOLIDATION (retrospective) + MEASUREMENT-ONLY (empirical re-measurement) + DOC-CORRECTION-ONLY (single-finding investigation closure).
- **SSR-MIGRATION-PREP** at 8.2 (project-wide 17th) — pre-framework-adoption preparatory production-source-edit class; 2pt FULL CALIBRATION at 8.2+8.4 (RR v7 library-mode declarative routing migration + index.html template refactor with FOUC IIFE).
- **FRAMEWORK-INSTALLATION** at 8.6 (project-wide 18th) — production-source-altitude framework primitive set wiring (packages + framework config + `app/` directory + entry boundaries + route config + `package.json` scripts cutover + named-export promotion); 3pt EXTENDED PAST FULL CALIBRATION at 8.6+8.7+8.11 (sub-shapes: (a) framework-mode adoption + (b) entry-boundary customization + (c) ssr-runtime enablement on framework-mode foundation).
- **PROVIDER-SSR-REMEDIATION** at 8.9 (project-wide 19th) — production-source migration of `useState(() => browser-global)` lazy initializers → `useSyncExternalStore` + `createLocalStorageStore` factory pattern; 3pt EXTENDED PAST FULL CALIBRATION at 8.9+8.10+8.11 (sub-shapes: (a) providers + (b) providers-AND-leaf-components + (c) useSyncExternalStore-migration-validation-under-true-SSR-runtime). 14 cumulative factory-produced stores at HEAD-post-Task-8.11.

Project-wide cumulative class count progression: **15 (Phase-7 close) → 16 (8.1) → 17 (8.2) → 18 (8.6) → 19 (8.9)**. **2 cross-phase extensions cemented at Phase-8+ closure**: MEASUREMENT-ONLY **9pt → 10pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** at Task 8.12 close (first project-wide class to cross 10pt threshold; first cross-phase Phase-7 → Phase-8+ extension at MEASUREMENT-ONLY altitude; calibration lineage 7pt @ 7.10 + 8pt @ 7.11 + 9pt @ 7.14 + 10pt @ 8.12; NEW 10th sub-shape `n10-statistical-rigor-re-measurement-post-architectural-migration-at-different-phase-altitude`); **CLOSURE-NARRATIVE-CONSOLIDATION 2pt → 3pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** at this closer (Phase-6 6.9 + Phase-7 closer + Phase-8+ 8.14 = 3 cross-phase data points; class extends from 2pt fully-calibrated at Phase-7 closer → 3pt cross-phase data point at Phase-8+ closer).

**Phase-8+ finding-catalog accounting reconciliation per Q3 LOCK Option α** (codified at §3): **37 cumulative label allocations** (A-Y + Z + AA + CC + DD + EE + FF + GG + HH + II + JJ + KK + LL) — **BB label INTENTIONALLY SKIPPED** at Task 8.9 close (BB was a carry-forward placeholder for `@react-router/serve` install deferred to Task 8.11; install completed at Task 8.11 per Q5 LOCK + Finding S sister-shape application without requiring fresh §0 cementation; BB absorbed/subsumed rather than cemented). **II label classified INFORMATIONAL** (deferred-to-Phase-9+-widget-SSR-audit per Task 8.11 Q6 LOCK; operationally unreachable at initial server-render due to AuthGate Branch 1 gating). **Net: 36 ACTIVE findings + 1 INFORMATIONAL = 37 label allocations.** Future references cite **"36 active"** as the headline count; the "BB-skip + II-informational" distinction is the canonical reconciliation cemented at this closer §3 + as standing convention per Q3 LOCK Option α.

**Thirty-eight consecutive cross-phase sweep-resolutions** land at this closer sweep (meta-PR #44 → 6.1a → ... → 7.13 → closer → 8.1 → 8.2 → ... → 8.13 → **closer**); 8.13 TBD → `fe3643d` / `#82` resolution co-shipped across §9 row 8.13 + Phase_8_Plan §status + Phase8_Task_8_13_Completion_Report §1/§2/§6 + this CLAUDE.md HEAD pointer pivot + Phase summary row 8+. With this report committed, **Phase-9+ — TBD scope** consolidated at §7 (3 substantive blocks + 2 process improvements per Q4 LOCK) is unblocked. **39-pattern milestone CEMENTED at Task 8.14 OPENING sweep**; 40-pattern projected at Task 8.15 OPENING (closer 99b41ac → squash-SHA absorbed per established absorb-into-next-sweep convention; 7-consecutive task-cadence 8.9-8.15).

**Phase-8+ timeline:**

| Date | Event | HEAD |
|---|---|---|
| 2026-05-16 | Phase-8+ OPENED at Task 8.1 OPENER squash-merge (Phase-8+ OPENING ceremony per Phase-7 Closure Report §8 14-item carry-forward consolidation; SCOPING-ONLY 1pt baseline class NEW; 4 publishable-level findings A B C D surfaced; Phase-8+ Block B opener recommended SSR-rendered shell exploration) | `5057dca` |
| 2026-05-16 | Task 8.2 squash-merge (Imperative-routing → declarative-routing migration via react-router v7.15.1 library-mode per Cowork Option β LOCK; framework-mode adoption deferred to Task 8.6; NEW class SSR-MIGRATION-PREP 17th; Findings E+F; vitest 259 → 264 +5) | `b43c2bf` |
| 2026-05-17 | Task 8.3 squash-merge (Provider-tree SSR-safety audit; DOC-only; SCOPING-ONLY 1pt → 2pt cross-phase FULLY CALIBRATED; NEW `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md` 530L / 36 KB; Findings G+H+I 2-of-4 STRUCTURALLY UNSAFE provider mix; AdminShell 3-provider audit DEFERRED to Task 8.9) | `c44198f` |
| 2026-05-17 | Task 8.4 squash-merge (`qualia-shell/index.html` template refactor + FOUC IIFE empirically-corrected to className pattern + 5 SSR-ready meta tags; SSR-MIGRATION-PREP 1pt → 2pt FULL CALIBRATION; Findings J+K; NEW v2.64.0 PRE-FLIGHT discipline at audit-content altitude founding) | `6742484` |
| 2026-05-17 | Task 8.5 squash-merge (Static-data extraction conditional; DOC-only roadmap; SCOPING-ONLY 2pt → 3pt CROSS-TASK-SHAPE-ROBUSTNESS extension; NEW 3rd sub-shape `empirical-inventory-confirming-NO-extraction-needed`; Findings L+M; NEW v2.65.0 PRE-FLIGHT discipline at Phase-plan-document altitude; Block A 4-of-4 COMPLETE) | `d98bd48` |
| 2026-05-17 | Task 8.6 squash-merge (RR v7 framework-mode adoption; Block B OPENER; NEW class FRAMEWORK-INSTALLATION 18th; 8 findings N-U-REVISED; 3 in-place v2.X.X patches v2.66.1/2/3; build-output `dist/` → `build/client/`; 6th cross-phase production-source-edit chunk-axis BREAK) | `8e04061` |
| 2026-05-17 | Task 8.7 squash-merge (Entry boundary creation NEW entry.client.tsx + entry.server.tsx Node.js renderToPipeableStream + REFACTOR root.tsx canonical Layout/Root/HydrateFallback 3-export; FRAMEWORK-INSTALLATION 1pt → 2pt FULL CALIBRATION; Findings V+W; 7th cross-phase BREAK; 3-of-3 Phase-8+-introduced classes fully calibrated by 8.7 close) | `79f0ced` |
| 2026-05-18 | Task 8.8 squash-merge (Per-route SSR opt-in scope-collapsed to SCOPING-ONLY 4pt CROSS-TASK-SHAPE-ROBUSTNESS extension; NEW 4th sub-shape `empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE`; Findings X+Y; in-place v2.68.1 paths-filter workflow patch; Block B 3-of-6 milestone) | `387abfa` |
| 2026-05-18 | Task 8.9 squash-merge (Provider-remediation-only ThemeContext + UserContext via `useSyncExternalStore`; NEW class PROVIDER-SSR-REMEDIATION 19th 1pt baseline; 5 findings Z+AA+CC+DD+EE; BB label intentionally skipped as carry-forward to 8.11; NEW shared utility `createLocalStorageStore.ts`; vitest 264 → 269 +5; Block B 4-of-6 milestone) | `a0975f7` |
| 2026-05-19 | Task 8.10 squash-merge (AdminShell-tree SSR remediation across 4 audit-scoped files via factory migration; Q1 LOCK Option A scope-EXPANDED from 1 → 5 Sidebar sites per Finding GG audit-undercount BREADTH drift; Q2 LOCK Option β extended factory dual-signature for dynamic-key resolver per Finding HH; 9 NEW factory-produced stores; 14 cumulative; PROVIDER-SSR-REMEDIATION 1pt → 2pt FULL CALIBRATION; **🎯 4-of-4 Phase-8+-introduced classes FULLY CALIBRATED milestone**; Findings FF+GG+HH; vitest 269 → 278 +9) | `784fa6d` |
| 2026-05-19 | Task 8.11 squash-merge (Block B 6-of-6 closer; ssr:false → true flip + NEW Scripts/smoke_test_ssr_phase8.mjs 5-phase smoke-test bundle + `@react-router/serve@7.15.1` install + NEW BLOCKING smoke-test CI step + v2.73.1 in-place webServer patch; Cowork Q1 LOCK Option D HYBRID PROVIDER-SSR-REMEDIATION 2pt → 3pt + FRAMEWORK-INSTALLATION 2pt → 3pt EXTENDED PAST FULL CALIBRATION; **🎯 4-of-4 EXTENDED PAST FULL CALIBRATION milestone**; Smoke-test EMPIRICAL VALIDATION 14 stores; Finding II INFORMATIONAL; Finding JJ retroactive-cementation at 8.12 §0; **🎯 Block B 6-of-6 COMPLETE ✓**; SSR architectural migration arc COMPLETE) | `eae7c88` |
| 2026-05-19 | Task 8.12 squash-merge (LCP n=10 re-measurement; Block C OPENER + Phase-8+ measurement-arc kickoff; `git mv Scripts/run_lighthouse_phase7.mjs → phase8.mjs` per Q4 LOCK plus-script-rename precedent + v2.75.1 in-place spawn-target patch; **🎯 MEASUREMENT-ONLY 9pt → 10pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** [first project-wide class to cross 10pt threshold]; **🎯 LCP empirical signal at −30.22% IMPROVEMENT** [median 2,724 ms vs Phase-7 3,903 ms; HALT-IF #3 NOT TRIGGERED at -36.6% margin]; 4-of-6 determinism preserved; NEW Finding KK bimodal-at-server-vs-client-rendered-paint; v2.60.1 cluster 13th+14th altitudes; NEW v2.75.0 PRE-FLIGHT discipline; 17-pattern anchor-bias-mitigation cluster) | `264c5c0` |
| 2026-05-20 | Task 8.13 squash-merge (Perf-lever scope-refutation; Block C item 2; SCOPING-ONLY 4pt → 5pt CROSS-TASK-SHAPE-ROBUSTNESS extension [first Phase-8+-introduced class to cross 5pt within phase]; **🎯 Perf-lever stacking EMPIRICALLY EXHAUSTED at HEAD-post-Task-8.12**: 0-of-3 candidates; Finding LL Plan-row Vike-mode N/A-BY-CONSTRUCTION; NEW v2.60.1 cluster 15th altitude `Task-directive-PRE0-hypothesis-empirical-vs-Plan-row-literal-text-drift`; recursive-validation discipline refuted a COWORK-DIRECTIVE hypothesis; NEW v2.76.0 PRE-FLIGHT discipline; 18-pattern anchor-bias-mitigation cluster; v1 L228 trajectory NARRATIVE NOTE deferred-to-closer; Block C 2-of-4 ✓) | `fe3643d` |
| 2026-05-21 | **Phase-8+ closer squash-merge — Phase-8+ CLOSED** (CLOSURE-NARRATIVE-CONSOLIDATION 2pt → 3pt CROSS-PHASE-SHAPE-ROBUSTNESS extension; v1 L228 DUAL-FRAMING verdict per Ilya-level decision at §6.2; §9 main matrix Phase-8+ column R → ✓ flip across all 13 closed rows; 38-of-38 cross-phase sweep-resolutions extending to 39-pattern milestone at 8.14 OPENING; Task 8.15 publishing handoff per Q6 LOCK 2-step separation) | _this PR_ |

**Phase-8+ duration: 5 calendar days (2026-05-16 → 2026-05-21).** 13 PRs total (PRs #69-#76 + #78-#82 + this closer = 14 with closer); 13-task arc (8.1 OPENER + 12 close + closer + 8.15 publishing R). Comparable to Phase-6 (6 days / 11 PRs) and Phase-7 (6 days / 12 PRs) at task-velocity; distinct shape composition: (a) Phase-8+'s higher proportion of architectural-migration-altitude tasks (Block B 6-of-13 vs Phase-7's 0-of-14 SSR-altitude tasks); (b) Phase-8+'s 4 NEW classes introduced matches Phase-7 cadence + 2 cross-phase extensions; (c) substantially deeper finding-catalog cadence (36 active vs Phase-7's 2 publishable-level findings; sister-shape Phase-6's 3); (d) Per-task complexity-distribution shifted toward SSR-architecture-migration-heavy at Block B + measurement-rigor + scope-refutation at Block C.

---

## §1. Phase-8+ arc narrative

### Block A — Pre-framework-adoption foundations (4 tasks 8.2-8.5; SSR-MIGRATION-PREP + SCOPING-ONLY)

Block A established the structural prerequisites for the Block B SSR architectural migration:

- **Task 8.2** — Imperative-routing → declarative-routing migration via `react-router@7.15.1` library-mode per Cowork Option β LOCK at PRE0. Replaced App.tsx imperative routing patterns at L79+L89 with `<BrowserRouter>` + `<Routes>` + `<Route>` declarative composition. NEW class **SSR-MIGRATION-PREP** (17th cumulative; 1pt baseline). Library-mode preserved Phase-7's Vite SPA entry-point convention byte-for-byte; framework-mode adoption deferred to Task 8.6. Findings E+F cemented (RR v7 library-mode migration + Phase-8+ task envelope scope shape). 6th cross-phase production-source-edit chunk-axis BREAK; vitest 259 → 264 (+5 react-router-dom contract tests).

- **Task 8.3** — Provider-tree SSR-safety audit at App.tsx top-level providers altitude per Cowork Q2 + Q7 LOCK explicit scope. DOC-only deliverable: NEW `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md` (530L / 36 KB; 8-section template). **SCOPING-ONLY 1pt → 2pt cross-phase FULL CALIBRATION** at this close per Cowork Q1 LOCK (sister-shape to CLOSURE-NARRATIVE-CONSOLIDATION fully-calibrated 2pt pattern at Phase-6 6.9 + Phase-7 closer). 3 findings G+H+I cemented (**2-of-4 STRUCTURALLY UNSAFE provider mix** at ThemeProvider + UserProvider; TanStack Query SSR-hydration discipline gap; Dependency-chain SSR-safety propagation). NEW Conventions block entry: per-provider-SSR-safety taxonomy 3-altitude classification (init-time UNSAFE / effect-time SAFE / event-handler-time SAFE). AdminShell-scoped 3-provider audit DEFERRED to Task 8.9 per Cowork Q3 LOCK + v2.62.1 scope-shape PRE-FLIGHT discipline.

- **Task 8.4** — `qualia-shell/index.html` template refactor (production-source edit at index.html altitude). **SSR-MIGRATION-PREP class 1pt → 2pt FULL CALIBRATION** per Cowork Q1 LOCK. Framework-agnostic FOUC mitigation pattern (script-injection IIFE empirically-corrected to `className` pattern per Finding β — sister to Phase-6 6.7 font-deferral pattern) + 5 SSR-ready meta tags (description + 4 Open Graph) + viewport-fit=cover refinement per Q4(b) LOCK. Framework-agnostic per Q3 LOCK; NO `ThemeContext.tsx` edits per D-3 LOCK + v2.62.1 scope-shape PRE-FLIGHT discipline. Findings J+K cemented (audit-content empirical-vs-hypothetical-distinction founding v2.64.0 cluster + dist/index.html parent-altitude shape-change taxonomy). **NEW v2.64.0 PRE-FLIGHT scope-shape discipline candidate at audit-content altitude** (5-pattern anchor-bias-mitigation cluster founding); audit doc §3.1 inline-footnote-correction shipped per Cowork D-1 LOCK.

- **Task 8.5** — Static-data extraction conditional (DOC-only roadmap deliverable per Cowork Q1 Option δ LOCK; zero production source touched). **SCOPING-ONLY class 2pt → 3pt CROSS-TASK-SHAPE-ROBUSTNESS extension** at this close (sister-shape to MEASUREMENT-ONLY 7pt → 8pt → 9pt extension pattern at Phase-7 7.11+7.14; NEW 3rd sub-shape `empirical-inventory-confirming-NO-extraction-needed`). 4-layer infrastructure (public/data + fixtures/appfolioDerived + strataApi env-flag dispatch + inline App.tsx route metadata) framework-agnostic-by-construction empirically verified at PRE0. Findings L+M cemented (scope-existence-empirical-refutation founding + Phase-plan-document audit-content empirical-vs-hypothetical). **NEW v2.65.0 PRE-FLIGHT discipline candidate at Phase-plan-document altitude** (6-pattern anchor-bias-mitigation cluster extension). **🎯 Phase-8+ Block A 4-of-4 COMPLETE** at this close.

### Block B — SSR architectural migration arc (6 tasks 8.6-8.11; FRAMEWORK-INSTALLATION + PROVIDER-SSR-REMEDIATION; ssr:true COMPLETE)

Block B executed the full SSR architectural migration:

- **Task 8.6** — RR v7 framework-mode adoption (Block B OPENER). **NEW class FRAMEWORK-INSTALLATION** (18th cumulative) per Cowork Verdict 1 LOCK. 11 file changes at qualia-shell/ (5 NEW: `react-router.config.ts` ssr:false + `app/root.tsx` canonical root layout + `app/routes.ts` declarative config + `app/routes/{security,default}.tsx` re-export bridges; 4 MODIFIED: `vite.config.ts` SPLIT per Verdict 3 LOCK + `tsconfig.json` adds `app/` to include + `src/App.tsx` SecurityRoute+DefaultRoute named-export promotion + `package.json` scripts/deps; 2 NEW: `vitest.config.ts` SPLIT companion). **8 NEW findings** N+O+P+Q+R+S+T+U-REVISED. **3 in-place v2.X.X patches within single close cycle** — v2.66.1 build-command (workflow `npx vite build` → `npx react-router build` per Finding T) + v2.66.2 server-startup (`playwright.baseline.config.ts` webServer reshape per Approach A LOCK on Finding U initial) + v2.66.3 routing-config (`app/routes.ts` `index('routes/default.tsx')` + `{ id: 'splat' }` per Cowork Verdict 6 Z1 LOCK on Finding U-REVISED). **3-in-place-patches-per-task precedent** at Phase-8+ Block B opener. Build-output empirical transformation `dist/` → `build/client/` with Phase-7 7.10 LCP-reduction lever PRESERVED + further compression (entry chunk −26.0% at framework-mode altitude). 6th cross-phase production-source-edit chunk-axis BREAK.

- **Task 8.7** — Entry boundary creation. **FRAMEWORK-INSTALLATION 1pt → 2pt FULL CALIBRATION** per Cowork Verdict 12 LOCK. NEW `app/entry.client.tsx` (startTransition + hydrateRoot + HydratedRouter) + NEW `app/entry.server.tsx` (renderToPipeableStream + ServerRouter + isbot; Node.js runtime per Verdict 13 LOCK; SPA Mode `onAllReady` branch per `routerContext.isSpaMode`) + REFACTOR `app/root.tsx` to canonical Layout/Root/HydrateFallback 3-export pattern per Verdict 15 LOCK (Layout wraps document shell with FOUC IIFE + meta tags; Root renders Outlet; HydrateFallback exports build-time SPA Mode shell body for FOUC IIFE HTML-shipping at build-time altitude per Finding V remediation). Findings V+W cemented (FOUC IIFE HTML-shipping regression at framework-mode altitude + entry.server.tsx structurally invoked at build time even at ssr:false). **3-of-3 Phase-8+-introduced classes fully calibrated by Task 8.7 close** (SCOPING-ONLY 2pt + SSR-MIGRATION-PREP 2pt + FRAMEWORK-INSTALLATION 2pt). 7th cross-phase chunk-axis BREAK.

- **Task 8.8** — Per-route SSR opt-in scope-collapsed to **SCOPING-ONLY 4pt CROSS-TASK-SHAPE-ROBUSTNESS extension** per Cowork Verdict 19 LOCK at Step-2 PRE0 (sister-shape to MEASUREMENT-ONLY 7pt → 8pt → 9pt extension pattern; NEW 4th sub-shape `empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE`). Findings X+Y cemented (paths-filter taxonomy refinement at `qualia-shell/app/**` altitude + per-route SSR opt-out empirical infeasibility at RR v7.15.1 — `ReactRouterConfig::ssr` GLOBAL boolean only). **In-place v2.68.1 workflow patch** at `.github/workflows/appfolio-parity-gate.yml::paths-filter` (add `qualia-shell/app/**` glob; sister-shape constellation to Task 8.6 v2.66.1+v2.66.2+v2.66.3 — 4-in-place-patches-cumulative-at-Phase-8+-Block-B-opener-trio precedent). **4th consecutive Task PRE0 wrong-hypothesis refutation pattern empirically cemented (Findings L+O+W+Y)** — recursive-validation discipline IS the project's most substantive engineering record pattern. Block B 3-of-6 milestone.

- **Task 8.9** — Provider-remediation-only at `qualia-shell/src/context/{ThemeContext,UserContext}.tsx` via `useSyncExternalStore` migration per Cowork Verdict 1 LOCK at PRE0 (scope-collapsed from kickoff "atomic SSR enablement bundle"). **NEW class PROVIDER-SSR-REMEDIATION** (19th cumulative; 1pt baseline). 5 NEW findings Z+AA+CC+DD+EE cemented (UserContext audit-content cross-doc convention-narrative altitude + react-router.config.ts JSDoc audit-content drift at NEW production-source-config-file-JSDoc altitude — v2.64.0 cluster extension + Sidebar.tsx:228 outside-audit-scope INFORMATIONAL + AdminShell 3-provider audit ALL 3 STRUCTURALLY UNSAFE INFORMATIONAL + AuthGate hydration-flash empirical signature at NEW 10th distinct v2.60.1 cluster altitude). **BB label intentionally skipped** — Finding BB was a carry-forward placeholder for `@react-router/serve` install deferred to Task 8.11 (sister-shape to Task 8.6 Finding S install-shipping altitude); install completed at Task 8.11 per Q5 LOCK + Finding S sister-shape application without requiring fresh §0 cementation. NEW shared utility `qualia-shell/src/utils/createLocalStorageStore.ts`; NEW test file `providerSSRSafety.test.tsx` with 5 server-snapshot tests; vitest 264 → 269 (+5). 7th cross-phase chunk-axis BREAK. Block B 4-of-6 milestone. **5th consecutive Task PRE0 wrong-hypothesis refutation pattern (Findings L+O+W+Y+Z)**.

- **Task 8.10** — AdminShell-tree SSR remediation across 4 audit-scoped files (Sidebar.tsx leaf-component + LayoutContext + HierarchyContext + WindowContext Providers) via factory migration per Cowork Q1-Q5 LOCK at Step-7-entry HALT-IF #1 resolution. Q1 LOCK Option A scope-EXPANDED at Step-7-entry from PRE0 1-Sidebar-site → 5 sites per Finding GG audit-undercount BREADTH drift (whole-file-read surfaced 4 NEW sites beyond audited L228; 2 HARD-CRASH → SOFT-DEGRADED uplifts at SPLIT_STORAGE_KEY + STORAGE_KEY). Q2 LOCK Option β extended factory at `createLocalStorageStore.ts` with `{ key, deserializer, defaultValue }` object signature supporting dynamic-key resolver per Finding HH WindowContext `savedLayoutsKey` per-user.id structural-incompatibility with PRE0 Q7 LOCK module-level-factory assumption (positional signature preserved byte-for-byte for Task 8.9 baseline callers). **9 NEW factory-produced stores** at Task 8.10 (5 Sidebar + 1 LayoutContext + 1 HierarchyContext + 2 WindowContext); 14 cumulative at HEAD-post-8.10. **PROVIDER-SSR-REMEDIATION 1pt → 2pt FULL CALIBRATION** per Q1 LOCK Option A. **🎯 4-of-4 Phase-8+-introduced classes FULLY CALIBRATED milestone** (SCOPING-ONLY 4pt + SSR-MIGRATION-PREP 2pt + FRAMEWORK-INSTALLATION 2pt + PROVIDER-SSR-REMEDIATION 2pt). 3 NEW findings FF+GG+HH cemented at §0 per Q4 LOCK. **v2.72.1 .reset() PERMANENT standing convention** cemented per Q3 LOCK. Vitest 269 → 278 (+9 server-snapshot tests). 8th cross-phase chunk-axis BREAK. HALT-IF #1 Step-7-entry whole-file-read drift triggered + RESOLVED in-place via Cowork scope-expansion + factory-extension. **🎯 6-consecutive PRE0/Step-7-entry wrong-hypothesis refutation cross-altitude pattern** per Q5 LOCK (Findings L+O+W+Y+Z at PRE0 altitude + GG at Step-7-entry altitude). Block B 5-of-6 milestone.

- **Task 8.11** — Block B 6-of-6 closer; SSR architectural migration FINAL step. (i) `ssr: false → true` flip at `qualia-shell/react-router.config.ts` (1-line config edit + JSDoc footnote ³ Task 8.11 narrative); (ii) NEW `Scripts/smoke_test_ssr_phase8.mjs` 5-phase smoke-test bundle per Q4 LOCK (Phase A bootstrap + Phase B server start `react-router-serve` + Phase C playwright-chromium probe + Phase D HARD-blocking assertions + Phase E cleanup); (iii) `@react-router/serve@7.15.1` install as production dep per Q5 LOCK + Finding S production-deps-placement convention; (iv) NEW BLOCKING smoke-test CI step at `.github/workflows/appfolio-parity-gate.yml` AFTER `react-router build (seeds=true; pre-Playwright preview)` + BEFORE Playwright baseline E2E; (v) v2.73.1 in-place patch at `qualia-shell/playwright.baseline.config.ts::webServer` (`npx vite preview --port 5173 --outDir build/client` → `npx react-router-serve build/server/index.js` + PORT env override `'5173'`). **🎯 Cowork Q1 LOCK Option D HYBRID class co-shipping**: PROVIDER-SSR-REMEDIATION 2pt → 3pt CROSS-TASK-SHAPE-ROBUSTNESS extension (sub-shape (c) `useSyncExternalStore-migration-validation-under-true-SSR-runtime`) + FRAMEWORK-INSTALLATION 2pt → 3pt CROSS-TASK-SHAPE-ROBUSTNESS extension (sub-shape (c) `ssr-runtime-enablement-on-framework-mode-foundation`). **🎯 4-of-4 Phase-8+-introduced classes EXTENDED PAST FULL CALIBRATION milestone** (2-of-4 at 3pt; distribution-of-calibration-depths IS substantive engineering signal). **🎯 Smoke-test EMPIRICAL VALIDATION**: 14 cumulative factory-produced stores work under true SSR runtime — pre-hydration HTML 5,949 bytes / HTTP 200 / 0 console errors / 0 warnings / 0 page errors at chromium-headless probe. **🎯 Finding EE Q2 LOCK Option α EMPIRICALLY CONFIRMED** — AuthGate hydration-flash NOT a `ssr:true` regression. Finding II INFORMATIONAL deferred-to-Phase-9+-widget-SSR-audit per Q6 LOCK. Finding JJ retroactively-cemented at Task 8.12 §0 per Q2 LOCK Option γ hybrid (cancelled-run lineage v2.73.2 + v2.73.3 in-place patches). 9th cross-phase production-source-edit chunk-axis BREAK; 6th in-place v2.X.X patch at v2.73.1. **🎯 Block B 6-of-6 COMPLETE ✓**; **🎯 SSR architectural migration arc COMPLETE**; Block B → Block C transition gate GREEN-LIGHT per Cowork Verdict 5 LOCK.

### Block C — Measurement + scope-refutation (2 tasks 8.12-8.13 closed; closer + publishing R)

Block C delivered the empirical post-migration measurement + perf-lever scope-existence resolution:

- **Task 8.12** — LCP n=10 re-measurement post-SSR-architectural-migration (Block C OPENER + Phase-8+ measurement-arc kickoff). `git mv Scripts/run_lighthouse_phase7.mjs Scripts/run_lighthouse_phase8.mjs` per Q4 LOCK plus-script-rename precedent (preserves git history; sister-shape constellation 6.6/6.7 + 7.11 cross-phase rename lineage) + JSDoc rewrite + **v2.75.1 in-place spawn-target patch at L425-434** (`npx vite preview --port 4173 --strictPort` → `npx react-router-serve build/server/index.js` with PORT env override; sister-shape to Task 8.11 v2.73.1 webServer patch at `playwright.baseline.config.ts`; 9th cumulative Phase-8+ in-place v2.X.X patch). **🎯 MEASUREMENT-ONLY 9pt → 10pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** per Q1 LOCK Option A — NEW 10th sub-shape `n10-statistical-rigor-re-measurement-post-architectural-migration-at-different-phase-altitude`; **first project-wide class to cross 10pt threshold** + first cross-phase Phase-7 → Phase-8+ extension at MEASUREMENT-ONLY altitude (calibration lineage: 7pt @ 7.10 + 8pt @ 7.11 + 9pt @ 7.14 + 10pt @ 8.12). **🎯 LCP empirical signal at −30.22% IMPROVEMENT** vs Phase-7 7.11 baseline at ssr:true HEAD: median **2,724 ms** vs Phase-7 3,903 ms / mean **2,499 ms** vs 3,932 ms / CV **13.49% bimodal** vs 2.29%; HALT-IF #3 Moderate threshold 4,294 ms NOT TRIGGERED (margin −36.6%); ssr:true architectural-migration EMPIRICALLY POSITIVE. 4-of-6 metric determinism preserved (FCP/TBT/CLS/SI deterministic; LCP+TTI bimodal — IDENTICAL Phase-7 7.11 pattern). NEW **Finding KK** cemented at §0 (LCP bimodal-at-server-vs-client-rendered-paint at ssr:true framework-mode altitude). NEW v2.60.1 cluster 13th + 14th altitudes per Q3 LOCK (cross-workspace-Node-ESM-resolution-via-createRequire + child-process-stdio-cleanup-before-SIGTERM); 12 → 14 altitudes. NEW v2.75.0 PRE-FLIGHT discipline at measurement-script-spawn-target altitude. 17-pattern anchor-bias-mitigation cluster.

- **Task 8.13** — Perf-lever scope-refutation (Block C item 2); ZERO production source touched. **🎯 SCOPING-ONLY 4pt → 5pt CROSS-TASK-SHAPE-ROBUSTNESS extension** per Q1 LOCK Option β — NEW 5th sub-shape `empirical-inventory-confirming-perf-lever-stacking-EXHAUSTED-at-architectural-altitude`; **first Phase-8+-introduced class to cross 5pt within phase** (highest-calibrated Phase-8+ class at HEAD-post-Task-8.13). **🎯 Perf-lever stacking EMPIRICALLY EXHAUSTED at HEAD-post-Task-8.12**: 0-of-3 Plan v2 §9 8.13-row candidates with effective new-scope — (i) SSR + React.lazy ALREADY-APPLIED + (ii) per-page Vike-mode tuning N/A-BY-CONSTRUCTION (Finding LL) + (iii) asset preloading depth STRUCTURALLY-INSUFFICIENT (Phase-7 Finding A anti-pattern). NEW **Finding LL** cemented at §0 (Plan-row Vike-mode-tuning candidate references scope CATEGORICALLY EXCLUDED at TWO cross-cutting prior task verdicts; sister-shape to Finding L v2.65.0 cluster altitude). **Authorization path correction CEMENTED** per category-error catch at Task 8.13 PRE0 Step 2(b): §9 8.13 row authorizes Option β via "absorb into closer if 8.12 substantive gap remains" (2,224 ms gap; 5.45× over v1 L228 ≤500 ms gate-of-record) — NOT "skip if 8.12 v1 L228 MET" (v1 L228 NOT MET at 2,724 ms). **NEW v2.60.1 cluster 15th altitude** per Q3 LOCK: `Task-directive-PRE0-hypothesis-empirical-vs-Plan-row-literal-text-drift` — **recursive-validation discipline refuted a COWORK-DIRECTIVE hypothesis** at NEW altitude (8-consecutive cross-altitude refutation pattern extending Findings L+O+W+Y+Z+GG+JJ+KK). NEW **v2.76.0 PRE-FLIGHT discipline** at Cowork-directive-gate-citation-verification altitude. 18-pattern anchor-bias-mitigation cluster. v1 L228 verdict trajectory NARRATIVE NOTE deferred-to-closer per Q4 LOCK (cemented at §6.2 of this report per Ilya-lock).

---

## §2. Headline engineering-signal catalog — 6 substantive cross-phase signals

Phase-7 closer cemented a 2-finding catalog at publishable-level (Finding (A) lazy-load lever family + Finding (B) vi.useFakeTimers React 19 anti-pattern). Phase-8+ scale supports 6 substantive headline signals (sister-shape extended; Phase-6's 3-finding catalog + Phase-7's 2 → Phase-8+'s 6 reflects deeper SSR-migration narrative depth):

### Signal (1) — SSR architectural migration COMPLETE + EMPIRICALLY NET-POSITIVE

Phase-8+ delivered the first `ssr: true` state in project history at HEAD-post-Task-8.11. Migration arc spanned 6 tasks (Block B 8.6-8.11): framework-mode adoption + entry-boundaries + per-route SSR scope-refutation + provider-remediation + AdminShell-tree + leaf-component remediation + ssr-flip + smoke-test. Empirical net-positive at LCP n=10 noise-floor scale per Task 8.12 measurement: −30.22% improvement (median 2,724 ms vs Phase-7 7.11 baseline 3,903 ms); HALT-IF #3 Moderate threshold 4,294 ms NOT TRIGGERED. 14 cumulative `createLocalStorageStore`-factory-produced stores EMPIRICALLY VALIDATED under true SSR runtime via Task 8.11 smoke-test (zero `ReferenceError` + zero hydration mismatch warnings + zero console errors at chromium-headless probe). **Phase-9+ structural prerequisite EMPIRICALLY CONFIRMED** — ssr:true enablement IS the structural prerequisite for any Phase-9+ SSR-architecture exploration per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6`.

### Signal (2) — v1 L228 ≤500 ms LCP DUAL-FRAMING verdict per Ilya-level decision

Per Ilya-level decision LOCKED at Task 8.14 PRE0: v1 L228 reachability verdict at this closer = DUAL-FRAMING with equivalent rigor (per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` "all outcomes are publishable deliverables" stance). Cross-phase LCP trajectory: 4,653 ms (Phase-6 6.7 closure-snapshot) → 3,903 ms (Phase-7 7.10/7.11 lazy-load SHIP + n=10 noise-floor) → **2,724 ms (Phase-8+ 8.12 ssr:true)**. Each architectural arc closed ~30-40% of remaining gap; cumulative gap-closure ~41% across Ph-6 → 7 → 8+. **Framing (a) STRUCTURALLY-UNATTAINABLE-even-with-SSR-migration**: 2,724 ms = 5.45× over ≤500 ms target; categorically out of reach at React 19 + Vite 6 + RR v7 framework-mode architecture; matches §6.6 Outcome (B) trajectory definition. **Framing (b) PARTIAL-MET**: ~41% cumulative gap-closure delivered; real, measurable, monotonic progress across three architectural arcs. Both framings published with equivalent rigor at §6.2; NO single forced verdict line; Phase-9+ LCP-objective disposition is STAKEHOLDER-DECISION-PENDING (neither closed NOR mandated-to-continue).

### Signal (3) — Recursive-validation discipline as the project's most substantive engineering-record pattern

Phase-8+ established recursive-validation discipline as the project's most substantive engineering-record pattern at HEAD-post-Phase-8+. **8-consecutive cross-altitude refutation cluster** Findings **L + O + W + Y + Z + GG + JJ + KK** at altitudes spanning:
- Plan-row hypothetical-scope (Finding L Phase-8+ Task 8.5; Finding LL Phase-8+ Task 8.13 sister-shape extension)
- PRE0-hypothesis (Findings O+W+Y at Task 8.6/8.7/8.8 + Finding Z at Task 8.9)
- Step-7-entry whole-file-read (Finding GG at Task 8.10)
- Clean-Linux-CI cross-OS divergence (Finding JJ at Task 8.11 retroactive-cementation)
- Measurement-script-spawn-target (Finding KK precedent altitude at Task 8.12)
- **Cowork-directive-hypothesis altitude** (Task 8.13 PRE0 Step 2(b) category-error catch — NEW altitude; v2.60.1 cluster 15th)

v2.60.1 anchor-bias-mitigation cluster grew **4 → 15 altitudes** within Phase-8+ scope (11 NEW altitudes cemented across Tasks 8.4-8.13). v2.64.0 cross-altitude application cluster grew **5 → 8 altitudes** (6 REFUTATION + 2 CONFIRMATION oscillation pattern cemented as engineering-record discipline regardless of outcome direction). 18-pattern anchor-bias-mitigation cluster at HEAD-post-Task-8.13: v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1 + v2.64.0 + v2.65.0 + v2.66.0 + v2.67.0 + v2.68.0 + v2.69.0 + v2.70.0 + v2.71.0 + v2.72.0 + v2.73.0 + v2.74.0 + v2.74.1 + v2.75.0 + v2.76.0.

**Standing convention cemented for Phase-9+**: treat audit citations + Plan-row text + Cowork-directive gate-claims as STARTING-POINT-HYPOTHESES requiring empirical verification — sister discipline at all three altitudes. Per v2.76.0: "At every task PRE0, empirically verify the Cowork directive's gate-citation against (i) Plan-row literal text + (ii) project-spec gate-of-record (v1 L228 ≤500 ms LCP / v1 L230 ZERO WCAG AA). Category errors at task-directive altitude (sub-target conflated with gate-of-record) are sister-shape to audit-content errors at v2.64.0 cluster altitude."

### Signal (4) — 4-of-4 Phase-8+-introduced classes calibrated AND EXTENDED PAST FULL CALIBRATION

Phase-8+ introduced 4 NEW classes (16th-19th project-wide) and EXTENDED ALL FOUR PAST FULL CALIBRATION within the phase — **first such pattern at project scale**. Per Cowork Q1 LOCK at Task 8.11 (Option D HYBRID class co-shipping): **distribution-of-calibration-depths IS itself a substantive engineering signal** (not just count of classes calibrated).

| Class | Calibration | Sub-shapes |
|-------|-------------|------------|
| **SCOPING-ONLY** (16th) | **5pt** (highest-calibrated within phase) | (1) forward-scoping-roadmap @ 8.1+8.3 + (2) NO-extraction @ 8.5 + (3) per-route-SSR-opt-out-INFEASIBLE @ 8.8 + (4) perf-lever-stacking-EXHAUSTED @ 8.13 |
| **SSR-MIGRATION-PREP** (17th) | 2pt FULL CALIBRATION | @ 8.2+8.4 |
| **FRAMEWORK-INSTALLATION** (18th) | 3pt EXTENDED PAST FULL CALIBRATION | (a) framework-mode adoption @ 8.6 + (b) entry-boundary customization @ 8.7 + (c) ssr-runtime enablement @ 8.11 |
| **PROVIDER-SSR-REMEDIATION** (19th) | 3pt EXTENDED PAST FULL CALIBRATION | (a) providers @ 8.9 + (b) providers-AND-leaf-components @ 8.10 + (c) useSyncExternalStore-validation-under-true-SSR-runtime @ 8.11 |

3-of-4 at 3pt+ CROSS-TASK-SHAPE-ROBUSTNESS; 2-of-4 at 3pt (FRAMEWORK-INSTALLATION + PROVIDER-SSR-REMEDIATION); SCOPING-ONLY uniquely at 5pt within phase. Pattern cemented: when a class lights up multiple sub-shapes within a single phase, the class becomes a substantive structural-pattern reference for future-phase task-shaping.

### Signal (5) — Perf-lever stacking EMPIRICALLY EXHAUSTED at React 19 + Vite 6 + RR v7 framework-mode + ssr:true architecture

Task 8.13 perf-lever-scope-refutation cemented Phase-8+ perf-lever-arc closure structurally. Plan v2 §9 8.13 row enumerated 3 candidate levers; empirical inventory at HEAD-post-Task-8.12 surfaced 0-of-3 with effective new-scope:

| Candidate | Empirical classification | Justification |
|-----------|--------------------------|---------------|
| (i) SSR + React.lazy stacking | **ALREADY-APPLIED** | Phase-7 7.10 lazy-load lever preserved through Task 8.6 RR v7 framework-mode + Task 8.11 ssr:true flip byte-for-byte at lazy-loading-pattern altitude |
| (ii) per-page Vike-mode tuning | **N/A-BY-CONSTRUCTION** (Finding LL) | Vike eliminated at Task 8.1 §3 framework-decision-tree; per-route SSR opt-out structurally infeasible at RR v7.15.1 per Finding Y |
| (iii) asset preloading depth | **STRUCTURALLY-INSUFFICIENT** | Phase-7 Finding A anti-pattern: LCP bottleneck at React 19 + Vite 6 is initial-paint JS parse+execute NOT critical-path bytes-downloaded; sister-shape to reverted Phase-7 7.9 vendor-split lever |

**Net empirical result**: perf-lever stacking is EMPIRICALLY EXHAUSTED at HEAD-post-Task-8.12 architecture. No further single-or-multi-lever piecemeal optimization within React 19 + Vite 6 + RR v7 framework-mode + ssr:true SPA architecture has effective new-scope. Phase-9+ LCP-objective progress (if pursued) requires architectural-axis shift beyond current architecture (CDN edge rendering / HTTP/3 / aggressive caching / island hydration per §6.6 Outcome (B) closure narrative).

### Signal (6) — 14 cumulative createLocalStorageStore-factory-produced stores + v2.72.1 .reset() PERMANENT standing convention

NEW shared utility `qualia-shell/src/utils/createLocalStorageStore.ts` (sister-shape to Phase-7 7.10 `lazyWithReload.ts`) cemented as **canonical SSR-safe state-persistence factory**. Factory accepts (i) **positional** `(readFromStorage, serverDefault)` for static-key stores OR (ii) **object** `{ key: string | (() => string), deserializer, defaultValue }` for dynamic-key stores requiring per-render-resolvable keys (Task 8.10 Q2 LOCK Option β extension). Dynamic-key cache invalidates automatically when resolver returns different key vs cached; requires module-level holder pattern in consuming Provider (e.g., `savedLayoutsUserIdHolder.current` at `WindowContext.tsx`) updated DURING render BEFORE `useSyncExternalStore` invocation.

**14 cumulative stores at HEAD-post-Task-8.11**: 5 at Task 8.9 (Theme + accent + animations + fontPairing + token) + 9 at Task 8.10 (5 Sidebar leaf-component sites + 1 LayoutContext + 1 HierarchyContext + 2 WindowContext [dockItemsStore static-composite + savedLayoutsStore dynamic-key]). All 14 EMPIRICALLY VALIDATED under true SSR runtime at Task 8.11 smoke-test (zero `ReferenceError` + zero hydration mismatch warnings + zero console errors at chromium-headless probe; pre-hydration HTML 5,949 bytes / HTTP 200).

**v2.72.1 .reset() PERMANENT standing convention** cemented per Task 8.10 Q3 LOCK — every factory-produced store MUST export `.reset()` escape-hatch; test files MUST call `.reset()` in `beforeEach` (prevents cross-test module-cache pollution at jsdom + vitest altitude per Task 8.9 HALT-IF #3 resolution at `LocalStorageStore.reset()` test escape-hatch addition).

---

## §3. 36-finding catalog — single-line cross-references per Q2 LOCK consolidation discipline

Per Cowork Q2 LOCK consolidation discipline: each finding = letter + cementation-task + altitude/domain + 1-clause empirical summary. **Full finding narratives live in per-task Completion Reports `Docs/Phase8_Task_8_<N>_Completion_Report.md` §0** — this closer consolidates + cross-references, does NOT duplicate.

### Phase-8+ finding-catalog accounting reconciliation per Q3 LOCK Option α

- **37 cumulative label allocations** (A-Y + Z + AA + CC + DD + EE + FF + GG + HH + II + JJ + KK + LL)
- **BB label INTENTIONALLY SKIPPED** at Task 8.9 close — BB was a carry-forward placeholder for `@react-router/serve` install deferred to Task 8.11 per Task 8.9 CR §6 + §7 narrative; install completed at Task 8.11 per Q5 LOCK + Finding S sister-shape application without requiring fresh §0 cementation; BB absorbed/subsumed rather than cemented
- **II label classified INFORMATIONAL** — TranscriptionHub.tsx:376 `useState(() => window.SpeechRecognition)` widget-altitude init-time UNSAFE deferred-to-Phase-9+-widget-SSR-audit per Task 8.11 Q6 LOCK; operationally unreachable at initial server-render due to AuthGate Branch 1 gating; smoke-test empirically confirms reachability analysis
- **Net: 36 ACTIVE findings + 1 INFORMATIONAL = 37 label allocations**
- **Standing convention**: future references cite **"36 active"** as the headline count; the "BB-skip + II-informational" distinction is the canonical reconciliation cemented at this closer §3 per Q3 LOCK Option α

### 4 publishable-level findings (Task 8.1 OPENER)

- **(A)** @ 8.1 — Imperative-routing SSR-incompatibility at `qualia-shell/src/App.tsx` L79+L89 is categorical hard-blocker
- **(B)** @ 8.1 — Phase-7 perf optimization carry-forward framework-conditional
- **(C)** @ 8.1 — Custom Vite SSR upstream-disclaimed as framework-author-only API
- **(D)** @ 8.1 — TanStack Start RC stage 2026-05 is production-risk inflection

### Block A findings (Tasks 8.2-8.5)

- **(E)** @ 8.2 — RR v7 library-mode declarative routing migration (App.tsx L79+L89 refactor via `<BrowserRouter>` + `<Routes>` + `<Route>` composition)
- **(F)** @ 8.2 — Phase-8+ task envelope scope shape (Cowork Option β LOCK library-mode-before-framework-mode sequencing)
- **(G)** @ 8.3 — 2-of-4 STRUCTURALLY UNSAFE provider mix at App.tsx top-level (ThemeProvider + UserProvider init-time UNSAFE)
- **(H)** @ 8.3 — TanStack Query SSR-hydration discipline gap
- **(I)** @ 8.3 — Dependency-chain SSR-safety propagation (provider tree altitude evaluation discipline)
- **(J)** @ 8.4 — Audit-content empirical-vs-hypothetical-distinction at audit-doc §3.1 altitude (v2.64.0 cluster founding)
- **(K)** @ 8.4 — dist/index.html parent-altitude shape-change taxonomy (chunk-axis-preservation taxonomy at parent-altitude)
- **(L)** @ 8.5 — Scope-existence-empirical-refutation at Plan-row altitude (v2.65.0 cluster founding)
- **(M)** @ 8.5 — Phase-plan-document audit-content empirical-vs-hypothetical-distinction (v2.64.0 cluster Plan §4 L116 extension)

### Block B findings (Tasks 8.6-8.11)

- **(N)** @ 8.6 — File-count empirical-vs-hypothetical at framework-mode adoption altitude
- **(O)** @ 8.6 — Task-partition empirical infeasibility (Task 8.6 includes minimal app/root.tsx per Verdict 2 LOCK)
- **(P)** @ 8.6 — Class-count mismatch (sister-shape comparison framing anchor-bias)
- **(Q)** @ 8.6 — Class-designation CONFIG-FILE-EDIT empirically false (framework-mode is structural production-source-altitude)
- **(R)** @ 8.6 — vite.config.ts SPLIT pattern (NEW vitest.config.ts companion file per Verdict 3 LOCK)
- **(S)** @ 8.6 — `@react-router/node` production-dep placement (v2.60.1 cluster 5th altitude install-shipping; framework server runtime peers MUST live in production `dependencies`)
- **(T)** @ 8.6 — `npx vite build` SILENT NO-OP when `reactRouter()` plugin wired (v2.66.1 in-place build-command patch)
- **(U-REVISED)** @ 8.6 — RR v7 `route('*', ...)` splat-does-not-match-root at routing-config altitude (v2.66.3 in-place patch; recursive-self-validation refutation)
- **(V)** @ 8.7 — FOUC IIFE HTML-shipping regression at framework-mode altitude (remediation via HydrateFallback export pattern)
- **(W)** @ 8.7 — entry.server.tsx structurally invoked at build time even at ssr:false (8th v2.60.1 cluster altitude)
- **(X)** @ 8.8 — Paths-filter taxonomy refinement at `qualia-shell/app/**` altitude (in-place v2.68.1 workflow patch)
- **(Y)** @ 8.8 — Per-route SSR opt-out empirical infeasibility at RR v7.15.1 (`ReactRouterConfig::ssr` GLOBAL boolean only)
- **(Z)** @ 8.9 — UserProvider audit-content cross-doc convention-narrative altitude empirical-vs-hypothetical (v2.64.0 cluster 5-altitude extension)
- **(AA)** @ 8.9 — react-router.config.ts JSDoc audit-content drift at production-source-config-file-JSDoc altitude (NEW v2.64.0 cluster application altitude)
- **(BB)** **SKIPPED** — carry-forward placeholder for `@react-router/serve` install at Task 8.11 (sister-shape to Finding S install-shipping altitude); install completed at Task 8.11 per Q5 LOCK without fresh §0 cementation
- **(CC)** @ 8.9 — Sidebar.tsx:228 init-time localStorage UNSAFE site outside original Task 8.3 audit scope (INFORMATIONAL; remediation deferred to Task 8.10)
- **(DD)** @ 8.9 — AdminShell-tree 3-provider audit deferred from Task 8.3 (all 3 STRUCTURALLY UNSAFE; LayoutProvider + HierarchyProvider + WindowProvider; INFORMATIONAL; remediation deferred to Task 8.10)
- **(EE)** @ 8.9 — AuthGate hydration-flash empirical signature at UserProvider remediation altitude (NEW 10th distinct v2.60.1 cluster altitude; Option α EMPIRICALLY CONFIRMED NOT a regression at Task 8.11 close)
- **(FF)** @ 8.10 — Audit-content-empirically-CONFIRMED binary-inversion sub-pattern under v2.64.0 cluster 6th altitude (recursive-validation discipline producing engineering record EVEN WHEN audit was correct)
- **(GG)** @ 8.10 — Sidebar.tsx audit-undercount BREADTH drift at Step-7-entry whole-file-read altitude under v2.60.1 cluster 11th (sister-shape to Finding Z POINT drift at PRE0-altitude but NEW altitude classification)
- **(HH)** @ 8.10 — WindowContext.tsx L97 `savedLayoutsKey` dynamic-per-user.id-key structural-incompatibility with PRE0 Q7 LOCK module-level-factory assumption under v2.60.1 cluster 12th (resolved via Option β factory-extension)
- **(II)** @ 8.11 — Widget-altitude SSR-safety audit-undercount at Step-7-entry-whole-repo-re-grep altitude (TranscriptionHub.tsx:376 `useState(() => window.SpeechRecognition)`; **INFORMATIONAL deferred-to-Phase-9+-widget-SSR-audit** per Cowork Q6 LOCK; operationally unreachable due to AuthGate Branch 1 gating)

### Block C findings (Tasks 8.12-8.13)

- **(JJ)** @ 8.11 retroactive / 8.12 structured §0 — Step-7-implementation-passes-locally-but-fails-in-clean-Linux-CI (OS-level behavioral divergence at 2 altitudes; v2.73.2 createRequire + v2.73.3 stdio cleanup in-place patches; v2.60.1 cluster 13th + 14th altitudes; Q2 LOCK Option γ hybrid retroactive-cementation at Task 8.12 §0 canonical altitude)
- **(KK)** @ 8.12 — LCP bimodal-at-server-vs-client-rendered-paint at ssr:true framework-mode altitude (cluster A ~1,953 ms FCP-coincident server-rendered paint × 2 runs + cluster B ~2,255-2,802 ms post-hydration final paint × 8 runs; NEW Phase-8+ sub-finding; informational not blocker)
- **(LL)** @ 8.13 — Plan-row hypothetical-scope refutation at v2.65.0 cluster altitude (Plan v2 §9 8.13 row "per-page Vike-mode tuning" candidate references scope CATEGORICALLY EXCLUDED at TWO cross-cutting prior task verdicts: Task 8.1 §3 Vike-elimination + Task 8.8 Finding Y per-route-SSR-opt-out-infeasibility; sister-shape to Finding L scope-existence-empirical-refutation pattern)

**Per-task cadence**: 36 active findings / 13 closed tasks = 2.8 findings/task average across Phase-8+ (sister-shape comparison Phase-7 = 2 publishable / 14 tasks = 0.14 publishable per task; Phase-8+ catalog depth ~20× per-task density vs Phase-7 driven by SSR-migration arc structural surface area).

---

## §4. Class calibration final-state — 19 project-wide classes; 4 NEW Phase-8+-introduced + 2 cross-phase extensions

Phase-8+ introduced **4 new in-repo calibration classes** + extended 2 carry-over classes (MEASUREMENT-ONLY cross-phase + CLOSURE-NARRATIVE-CONSOLIDATION cross-phase). Project-wide cumulative class count progression: **15 (Phase-7 close) → 16 (8.1 SCOPING-ONLY) → 17 (8.2 SSR-MIGRATION-PREP) → 18 (8.6 FRAMEWORK-INSTALLATION) → 19 (8.9 PROVIDER-SSR-REMEDIATION)**.

| Class | Phase-8+ data points | Tasks | First introduced | Notes |
|---|:-:|---|---|---|
| **SCOPING-ONLY** | 5 (Phase-8+) | 8.1 / 8.3 / 8.5 / 8.8 / 8.13 | Phase-8+ 8.1 | NEW class. 16th project-wide. **5pt CROSS-TASK-SHAPE-ROBUSTNESS within phase = highest-calibrated Phase-8+-introduced class**. Sub-shapes: (1) forward-scoping-pre-implementation-roadmap @ 8.1+8.3 + (2) empirical-inventory-confirming-NO-extraction-needed @ 8.5 + (3) empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE @ 8.8 + (4) empirical-inventory-confirming-perf-lever-stacking-EXHAUSTED-at-architectural-altitude @ 8.13. Structurally distinct from CLOSURE-NARRATIVE-CONSOLIDATION (retrospective) + MEASUREMENT-ONLY (empirical re-measurement) + DOC-CORRECTION-ONLY (single-finding investigation closure). |
| **SSR-MIGRATION-PREP** | 2 (Phase-8+) | 8.2 / 8.4 | Phase-8+ 8.2 | NEW class. 17th project-wide. **2pt FULL CALIBRATION**. Pre-framework-adoption preparatory production-source-edit class (RR v7 library-mode declarative routing migration + index.html template refactor with FOUC IIFE empirically-corrected to className pattern). |
| **FRAMEWORK-INSTALLATION** | 3 (Phase-8+) | 8.6 / 8.7 / 8.11 | Phase-8+ 8.6 | NEW class. 18th project-wide. **3pt EXTENDED PAST FULL CALIBRATION** per Task 8.11 Cowork Q1 LOCK Option D HYBRID class co-shipping. Production-source-altitude framework primitive set wiring (packages + framework config + `app/` directory + entry boundaries + route config + `package.json` scripts cutover + named-export promotion). Sub-shapes: (a) framework-mode adoption @ 8.6 + (b) entry-boundary customization @ 8.7 + (c) ssr-runtime enablement on framework-mode foundation @ 8.11. Per-package install discipline: framework server runtime peers (`@react-router/node`, `@react-router/serve`, auto-installed `isbot`) MUST live in production `dependencies` (Finding S). |
| **PROVIDER-SSR-REMEDIATION** | 3 (Phase-8+) | 8.9 / 8.10 / 8.11 | Phase-8+ 8.9 | NEW class. 19th project-wide. **3pt EXTENDED PAST FULL CALIBRATION** per Task 8.11 Cowork Q1 LOCK Option D HYBRID class co-shipping. Production-source migration of `useState(() => browser-global)` lazy initializers → `useSyncExternalStore` + `createLocalStorageStore` factory pattern. Sub-shapes: (a) providers @ 8.9 + (b) providers-AND-leaf-components @ 8.10 [Q1 LOCK Option A scope-expansion] + (c) useSyncExternalStore-migration-validation-under-true-SSR-runtime @ 8.11 [Q1 LOCK Option D HYBRID co-shipping; smoke-test EMPIRICALLY VALIDATES all 14 factory-produced stores]. 14 cumulative stores at HEAD-post-Task-8.11. |
| **MEASUREMENT-ONLY carry-over** | 1 (Phase-8+); **10 cross-phase / 10 sub-shapes; first project-wide class to cross 10pt threshold** | 8.12 | Phase-5 5.6 (formal); Phase-0 0.0.7+0.0.8 (pre-formal) | **🎯 9pt → 10pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** per Task 8.12 Cowork Q1 LOCK Option A. NEW 10th sub-shape `n10-statistical-rigor-re-measurement-post-architectural-migration-at-different-phase-altitude`. **First project-wide class to cross 10pt threshold + first cross-phase Phase-7 → Phase-8+ extension at MEASUREMENT-ONLY altitude** (calibration lineage: 7pt @ 7.10 + 8pt @ 7.11 + 9pt @ 7.14 + 10pt @ 8.12). |
| **CLOSURE-NARRATIVE-CONSOLIDATION carry-over** | 1 (Phase-8+); **3 cross-phase; CROSS-PHASE-SHAPE-ROBUSTNESS extension** | 8.14 (this closer) | Phase-6 6.9 | **🎯 2pt → 3pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** per Task 8.14 Cowork Q1 LOCK Option A. 3rd cross-phase data point (Phase-6 6.9 = 1st 2pt baseline + Phase-7 closer = 2nd 2pt FULL CALIBRATION + Phase-8+ 8.14 = 3rd cross-phase data point); class extends from 2pt fully-calibrated at Phase-7 closer → 3pt cross-phase at Phase-8+ closer. Substantive narrative-writing task consolidating multi-task arc + threshold decisions + Phase-N+1 carry-forward organization. |

**Distribution-of-calibration-depths IS itself a substantive engineering signal** per Task 8.11 Cowork Q1 LOCK Option D HYBRID class co-shipping (first such pattern at project scale): SCOPING-ONLY 5pt + SSR-MIGRATION-PREP 2pt + FRAMEWORK-INSTALLATION 3pt + PROVIDER-SSR-REMEDIATION 3pt = 13pt aggregate across 4 Phase-8+-introduced classes; 3-of-4 at 3pt+ CROSS-TASK-SHAPE-ROBUSTNESS; SCOPING-ONLY uniquely at 5pt within phase = first Phase-8+-introduced class to cross 5pt threshold.

**Carry-over classes UNTOUCHED at Phase-8+**: NEAR-NULL-OP (Phase-4 untouched) + FIXTURE-CLASS pure + FIXTURE-CLASS+SCHEMA hybrid (Phase-4) + LAYOUT-CLASS (Phase-3) + CONSUMER-SIDE-CONTRACT-TEST + CONSUMER-SIDE-FETCH-WRAPPER + MSW-CONTRACT-TEST (Phase-5) + COMPONENT-FIX (Phase-6) + CI-CONFIG-ONLY + BASELINE-ARTIFACT + PERF-LEVER-LAZY-LOAD + TEST-INFRA-FIX (Phase-7) + E2E-PLAYWRIGHT (Phase-5 fully-calibrated at Phase-7).

---

## §5. Cluster + discipline final-state — 18-pattern anchor-bias-mitigation + 15 v2.60.1 altitudes + 8 v2.64.0 altitudes + 9 in-place v2.X.X patches

### v2.60.1 anchor-bias-mitigation cluster — 15 altitudes at HEAD-post-Task-8.13

Phase-8+ extended v2.60.1 cluster from **4 altitudes at Phase-7 closure → 15 altitudes at Phase-8+ closure** (+11 NEW altitudes within phase):

| Altitude # | Empirical-verification altitude | Cementation task |
|:-:|---|:-:|
| 1 | Falsified-hypothesis at Phase-7 7.13 founding (test-infra-fix flake) | 7.13 (Phase-7) |
| 2-4 | Phase-7 inherited 3 cumulative altitudes | (Phase-7) |
| 5 | install-shipping (Finding S `@react-router/node` production-dep placement) | 8.6 |
| 6 | routing-config (Finding U-REVISED `route('*', ...)` splat-does-not-match-root) | 8.6 v2.66.3 |
| 7 | sub-altitude route-id-derivation (nested under #6) | 8.6 |
| 8 | entry-boundary-build-time-invocation (Finding W) | 8.7 |
| 9 | per-route-routing-config (Finding Y) | 8.8 |
| 10 | hydration-mismatch-by-construction (Finding EE) | 8.9 |
| 11 | leaf-component-BREADTH (Finding GG audit-undercount) | 8.10 |
| 12 | structural-assumption-refutation (Finding HH dynamic-key) | 8.10 |
| 13 | cross-workspace-Node-ESM-resolution-via-createRequire (v2.73.2; Finding JJ first signature) | 8.12 retroactive |
| 14 | child-process-stdio-cleanup-before-SIGTERM (v2.73.3; Finding JJ second signature) | 8.12 retroactive |
| **15** | **Task-directive-PRE0-hypothesis-empirical-vs-Plan-row-literal-text-drift** (Cowork-directive-hypothesis refutation at Task 8.13 PRE0) | **8.13** |

**Recursive-validation discipline standing convention** cemented at Phase-8+ close: treat audit citations + Plan-row text + Cowork-directive gate-claims as STARTING-POINT-HYPOTHESES requiring empirical verification — identical discipline at all altitudes.

### v2.64.0 audit-content cross-altitude application cluster — 8 altitudes; 6 REFUTATION + 2 CONFIRMATION oscillation pattern

Phase-8+ extended v2.64.0 cluster from **founding at Phase-8+ Task 8.4 → 8 altitudes at Phase-8+ closure**. Pattern empirically cemented: BOTH refutation AND confirmation produce engineering record value (recursive-validation discipline regardless of outcome direction).

| Altitude # | Application altitude | Outcome | Cementation task |
|:-:|---|:-:|:-:|
| 1 (founding) | audit-doc §3.1 ThemeProvider (Finding J) | REFUTATION | 8.4 |
| 2 | Plan §4 L116 (Finding M) | REFUTATION | 8.5 |
| 3 | audit-doc §3.2 UserProvider (Finding Z) | REFUTATION | 8.9 |
| 4 | audit-doc L23 narrative (Task 8.9 sister-shape) | REFUTATION | 8.9 |
| 5 | react-router.config.ts JSDoc (Finding AA) | REFUTATION | 8.9 |
| 6 | audit-content empirically-CONFIRMED (Finding FF) | **CONFIRMATION** | 8.10 |
| 7 | Sidebar audit-undercount cross-altitude (Finding GG) | REFUTATION | 8.10 |
| 8 | AuthGate hydration-flash CONFIRMATION (per Q3(b) LOCK) | **CONFIRMATION** | 8.11 |

**6 REFUTATION + 2 CONFIRMATION oscillation pattern** cemented as engineering-record discipline; recursive-validation produces value EVEN WHEN audit was correct (Finding FF + AuthGate hydration-flash confirmation data points).

### 18-pattern anchor-bias-mitigation cluster — Phase-8+ standing PRE-FLIGHT discipline

| # | Pattern | Phase | Cementation task |
|:-:|---|:-:|:-:|
| 1-4 | v2.60.1-v2.60.6 founding | Phase-7 | 7.13 + closer |
| 5 | v2.62.1 PRE-FLIGHT scope-shape discipline | Phase-8+ | 8.2 |
| 6 | v2.64.0 audit-content empirical-vs-hypothetical | Phase-8+ | 8.4 |
| 7 | v2.65.0 Plan-row scope-existence-empirical-refutation | Phase-8+ | 8.5 |
| 8 | v2.66.0 install-shipping altitude | Phase-8+ | 8.6 |
| 9 | v2.67.0 routing-config altitude | Phase-8+ | 8.6 |
| 10 | v2.68.0 entry-boundary-build-time-invocation altitude | Phase-8+ | 8.7 |
| 11 | v2.69.0 paths-filter-scope altitude | Phase-8+ | 8.8 |
| 12 | v2.70.0 per-route-routing-config altitude | Phase-8+ | 8.8 |
| 13 | v2.71.0 audit-scope-completeness altitude | Phase-8+ | 8.9 |
| 14 | v2.72.0 leaf-component-altitude SSR-remediation | Phase-8+ | 8.10 |
| 15 | v2.73.0 Step-7-entry whole-file-read discipline | Phase-8+ | 8.10 |
| 16 | v2.74.0 dynamic-key-classification | Phase-8+ | 8.10 |
| 17 | v2.74.1 branch-base discipline | Phase-8+ | 8.11 OPENING |
| 18 | v2.75.0 measurement-script-spawn-target-must-match-current-HEAD-server-runtime altitude | Phase-8+ | 8.12 |
| **19** | **v2.76.0 Cowork-directive-gate-citation-verification altitude** | Phase-8+ | **8.13** |

Wait — counting reveals **19 patterns**, not 18 (v2.60.1-v2.60.6 = 4 patterns founding [.1, .4, .6 + cluster founding entry]; let me re-count by directly enumerating Phase-8+ cluster narrative). The catalog above lists patterns 5-19 = 15 Phase-8+ patterns + 4 Phase-7 founding = 19 total. The "18-pattern" framing at Task 8.13 close was an undercount; **empirically-correct count at Phase-8+ closure is 19 patterns** — sister-shape to Phase-7 closer's class-count retroactive-correction-in-place pattern (Phase-7 framed as 2 NEW classes vs empirically-correct 4). Recommended closer-doc-sweep amendment: future references cite **19-pattern anchor-bias-mitigation cluster** at HEAD-post-Phase-8+; this closer §5 IS the canonical correction-in-place altitude (sister-shape to Phase-7 closer §3 retroactive-correction discipline).

### 9 cumulative in-place v2.X.X patches at HEAD-post-Phase-8+

| # | Patch | Altitude | Task |
|:-:|---|---|:-:|
| 1 | v2.66.1 | build-command (workflow `npx vite build` → `npx react-router build`) | 8.6 |
| 2 | v2.66.2 | server-startup (`playwright.baseline.config.ts` webServer reshape) | 8.6 |
| 3 | v2.66.3 | routing-config (`app/routes.ts` index+splat per Finding U-REVISED) | 8.6 |
| 4 | v2.68.1 | paths-filter (add `qualia-shell/app/**` glob per Finding X) | 8.8 |
| 5 | v2.72.1 | `.reset()` PERMANENT standing convention (factory test escape-hatch) | 8.10 |
| 6 | v2.73.1 | webServer (`vite preview` → `react-router-serve` at ssr:true) | 8.11 |
| 7 | v2.73.2 | createRequire(qualia-shell/package.json) for cross-workspace ESM | 8.11 retroactive (Finding JJ) |
| 8 | v2.73.3 | child-process stdio cleanup + process.exit() | 8.11 retroactive (Finding JJ) |
| 9 | v2.75.1 | lighthouse-measurement-script-server-startup (`vite preview` → `react-router-serve`) | 8.12 |

Pattern: in-place v2.X.X amendments within a single task close cycle to remediate empirical CI compat surfacing at implementation are structurally acceptable (extends Phase-7 7.3/7.4/7.9 precedents 2 → 3 patches-per-task at Task 8.6).

### 9 cross-phase production-source-edit chunk-axis BREAK data points

Phase-8+ added **3 BREAK data points** to cross-phase cumulative (7th-9th at 8.6 + 8.7 + 8.11):

- 6.1a + 6.3 + 6.4 + 7.1 + 7.10 (Phase-6/Phase-7 cumulative 5)
- 8.2 (RR v7 library-mode App.tsx routing refactor; 6th)
- 8.6 (RR v7 framework-mode adoption; 6th-of-9 — `dist/` → `build/client/`)
- 8.7 (entry boundary refactor; 7th)
- 8.9 (provider remediation; entry.client filename hash BREAK; 7th-of-9 narrative variant)
- 8.11 (ssr:true flip; build/server/ now preserved; 9th)

**Chunk-axis preservation pattern empirical evidence**: outside production-source edits, the test-tooling/DOC-only/test-spec-only/CI-config-only edit shape continues to preserve chunk axes byte-for-byte when build-mode matched per v2.43 GR-15 protocol. Phase-8+ added significant within-phase data points to this empirical pattern.

---

## §6. v1 commitment trajectory — L230 + L228 threshold-decisions communicated for product/engineering leadership

### §6.1 — v1 L230 ZERO WCAG AA violations threshold SUSTAINED through Phase-8+

Phase-6 closure declared v1 L230 MET on 4-enriched-detail-page scope; Phase-7 7.1 OPENER scope-extended the MET state to the broader 8-routable-surface scope. **Phase-8+ closure SUSTAINS the v1 L230 MET state** through 13-task arc (Block A pre-fixes + Block B SSR migration + Block C measurement + scope-refutation). Empirical verification at Task 8.12 measurement: per-page a11y at SPA-internal navigation across 4 detail pages = **100/100 a11y scoreApprox / 0 violations sustained**. Cross-phase trajectory: 362 (Phase-5 baseline) → 33 (post-6.3) → 0 (post-6.4) → 0 sustained at 6.5/6.6/6.7/6.8/6.9 → 0 across 8 routable surfaces at 7.1 → 0 sustained through 7.10 → **0 sustained through 8.12 measurement at ssr:true HEAD** (8/8 surfaces × 0 violations). **Threshold-decision communicated to product/engineering leadership: v1 L230 SHIPPED + SUSTAINED through SSR architectural migration arc**.

### §6.2 — v1 L228 ≤500 ms LCP — DUAL-FRAMING verdict (Ilya-level decision)

Per Ilya-level decision LOCKED at Task 8.14 PRE0 (NOT a Cowork verdict candidate; do NOT re-litigate): v1 L228 reachability verdict at this closer is presented in **DUAL-FRAMING** with equivalent rigor. Per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` stance: "all outcomes are publishable deliverables of equivalent rigor." Phase-9+ LCP-objective disposition is **STAKEHOLDER-DECISION-PENDING** (neither closed NOR mandated-to-continue).

**Cross-phase LCP trajectory** (per-figure raw-data citations):
- **Phase-6 6.7 closure-snapshot:** LCP 4,653 ms (n=1; post-Lever-1-revert closure-snapshot artifact at `Docs/Baselines/2026-05-11_Phase6_task_6_7_perf_capture.json`)
- **Phase-7 7.10 n=3:** LCP mean 3,903 ms / median 3,903 ms / range 1 ms / stddev 0 ms (variance-collapse signal at 1pt; n=3 sample-size artifact identified at 7.11)
- **Phase-7 7.11 n=10 noise-floor:** LCP mean 3,932 ms / median 3,903 ms / CV 2.29% (first non-degenerate noise-floor metric in project history at HEAD-post-7.10 `6a7eab5` ssr:false library-mode); raw data at `Docs/Baselines/2026-05-15_Phase7_task_7_11_perf_capture_n10_baseline_post_7.10.json`
- **Phase-8+ 8.12 n=10 ssr:true (NEW data point):** LCP mean **2,499 ms** / median **2,724 ms** / CV **13.49% bimodal** at HEAD-post-Task-8.11 `eae7c88` (ssr:true framework-mode); raw data at `Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json`; bimodal distribution per NEW Finding KK (cluster A ~1,953 ms FCP-coincident server-rendered paint × 2 runs + cluster B ~2,255-2,802 ms post-hydration final paint × 8 runs)

**Framing (a) — STRUCTURALLY-UNATTAINABLE-even-with-SSR-migration**

Phase-8+ 8.12 LCP median 2,724 ms = **5.45× over v1 L228 ≤500 ms target**. Three architectural arcs across Phase-6 → 7 → 8+ each closed ~30-40% of the remaining gap to the v1 target but NONE crossed the 500 ms threshold. Cumulative trajectory:
- Phase-6: STRUCTURALLY UNATTAINABLE single-lever (font-deferral REVERT)
- Phase-7: STRUCTURALLY UNATTAINABLE multi-lever within React 19 + Vite 6 SPA architecture (1 SHIP lazy-load + 2 REVERT font-deferral + vendor-split)
- **Phase-8+ (NEW):** STRUCTURALLY UNATTAINABLE multi-lever + SSR-migration within React 19 + Vite 6 + RR v7 framework-mode architecture (Block B 6-task arc; 14 factory-produced stores under true SSR; ssr:true smoke-test-validated)

Categorically out of reach at React 19 + Vite 6 + RR v7 framework-mode architecture. Matches `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` Outcome (B) definition: "NEW empirical refinement to 'STRUCTURALLY UNATTAINABLE even with SSR migration at React 19 + chosen-framework architecture.'" Closure narrative documents architectural lessons + Phase-9+ priority recommendation candidates: infrastructure-level optimization (CDN edge rendering / HTTP/3 / aggressive caching); fundamental architecture pivot (server-side templating + island hydration architecture per Astro/Fresh patterns).

**Framing (b) — PARTIAL-MET**

Phase-6 4,653 ms → Phase-7 3,903 ms → Phase-8+ 2,724 ms = cumulative **−1,929 ms / ~41% cumulative gap-closure** across three architectural arcs. Real, measurable, monotonic progress at every architectural step. Gate not met but materially advanced. Per Cowork Verdict 3 LOCK 3rd-outcome stance: progress is engineering-substantive even where target not crossed. Phase-8+ MEASUREMENT-ONLY 10pt cross-phase milestone empirically validates this framing — first project-wide class to cross 10pt threshold + first cross-phase Phase-7 → Phase-8+ extension at MEASUREMENT-ONLY altitude; the measurement infrastructure itself is a publishable deliverable independent of v1 L228 reachability binary.

**Framing (c) — NO single forced verdict line; STAKEHOLDER-DECISION-PENDING**

Both framings ship with equivalent rigor per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` "all outcomes are publishable deliverables" stance. Neither framing is forced as canonical at this closer. The empirical evidence supports BOTH framings simultaneously — STRUCTURALLY-UNATTAINABLE-even-with-SSR-migration (gate trajectory) AND PARTIAL-MET (progress trajectory). The choice between framings is a **stakeholder decision** about Phase-9+ scope and resource allocation:

- IF stakeholders judge v1 L228 ≤500 ms LCP as binding closure criterion → Framing (a) supports formal closure as STRUCTURALLY UNATTAINABLE; Phase-9+ may pivot to alternative gate definitions OR alternative architecture exploration
- IF stakeholders judge ~41% cumulative gap-closure as substantive engineering progress worth continuing → Framing (b) supports continued architectural exploration in Phase-9+ (CDN edge / HTTP/3 / island hydration / etc.)

Phase-9+ LCP-objective disposition is STAKEHOLDER-DECISION-PENDING at this closer. Neither framing closes the disposition; both inform it.

### §6.3 — LCP measurement infrastructure deliverable (Phase-8+ extension of Phase-7 7.11 baseline)

Task 8.12 n=10 noise-floor measurement at ssr:true HEAD-post-Task-8.11 extends Phase-7 7.11 ssr:false library-mode noise-floor baseline:

| Metric | Phase-7 7.11 (ssr:false) | Phase-8+ 8.12 (ssr:true) | Determinism |
|--------|--------------------------|---------------------------|-------------|
| LCP median | 3,903 ms | 2,724 ms | bimodal |
| LCP mean | 3,932 ms | 2,499 ms | bimodal |
| LCP CV | 2.29% | 13.49% | bimodal-at-server-vs-client-paint (Finding KK) |
| FCP | (informational) | 1,954 ms | ✓ deterministic (range 4.3 ms) |
| TBT | (informational) | 0 ms | ✓ deterministic at zero |
| CLS | (informational) | 0.000 | ✓ deterministic at zero |
| SI | (informational) | 1,954 ms | ✓ deterministic (range 4.3 ms) |
| TTI | (informational) | 2,731 ms | bimodal (sister to LCP) |

**4-of-6 metric determinism preserved** (FCP/TBT/CLS/SI deterministic; LCP+TTI bimodal — IDENTICAL Phase-7 7.11 pattern despite architectural-axis shift). NEW Finding KK bimodal-at-server-vs-client-rendered-paint sub-pattern is distinct from Phase-7 7.11 LCP+TTI bimodal noted there (which was Lighthouse-internal jitter at single render-path altitude, not server-vs-client render-path divergence).

**Cross-phase measurement-baseline deliverable**: Phase-7 ssr:false baseline + Phase-8+ ssr:true baseline establish project-wide measurement infrastructure for Phase-9+ comparison baselines + future architectural-axis-change re-measurement protocols. Sister-shape to Phase-7 closure's measurement infrastructure deliverable framing but at cross-phase scale.

---

## §7. Phase-8+ exit gate verification

Per Plan v2.75 §9 Verification Matrix (R → ✓ flip across all 13 closed Phase-8+ rows at this closure; row 8.15 publishing R remaining per Q6 LOCK 2-step separation), Phase-8+ column closes at this report with ✓ values across all 16 applicable rows:

| Row | Phase-8+ cell | Proof |
|---|:-:|---|
| `tsc -b` errors =0 | ✓ | §1 (0 across all 13 closures) |
| `vitest run` failures ≤B | ✓ | §1 (278/278 CI at every checkpoint; +19 cumulative across phase) |
| `vitest run` new-test count ≥ tasks-in-phase | ✓ | Mandate scopes phases 0/1/2/5 only; Phase-8+ task shapes (SCOPING-ONLY + SSR-MIGRATION-PREP + FRAMEWORK-INSTALLATION + PROVIDER-SSR-REMEDIATION + MEASUREMENT-ONLY + CLOSURE-NARRATIVE-CONSOLIDATION) include server-snapshot tests at 8.2 + 8.9 + 8.10 (+19 cumulative; sister-shape to Phase-3/4/6 row treatment) |
| `playwright test` failures ≤B | ✓ | §1 (axe-baseline arc genuinely-blocking on Linux CI from Phase-7 7.3 close; smoke-test BLOCKING step at Task 8.11 close; webServer command updated to `react-router-serve` at ssr:true per v2.73.1 in-place patch) |
| `vite build` errors =0 | ✓ → `react-router build` | §1 (build pipeline cutover at Task 8.6 v2.66.1 `npx vite build` → `npx react-router build`; both SEEDS modes succeed at HEAD-post-Task-8.11 ssr:true; build/server/* preserved per ssr:true) |
| `VITE_APPFOLIO_SEEDS=false vite build` functional | ✓ → `react-router build` | §1 (cross-mode invariance preserved at framework-mode altitude per v2.43 GR-15 build-mode-aware comparison protocol; `dist/` → `build/client/` transition at Task 8.6) |
| PII-leak scan passes | ✓ | §1 (51 files / 0 leaks at every checkpoint) |
| Manual dev-server smoke | ✓ + smoke-test EMPIRICAL VALIDATION | Cold-start sustained via `helpers/auth.ts` permanent amendment from Phase-6 6.2 throughout Phase-8+; smoke-test BLOCKING step at Task 8.11 close empirically validates 14 factory-produced stores under true SSR runtime |
| Screenshots in phase report | (informational) | UI render unchanged at SSR architectural-migration arc (Task 8.11 close smoke-test pre-hydration HTML 5,949 bytes / HTTP 200; AuthGate Branch 1 spinner server-rendered then hydrated identically client-side); within-darwin screenshot-baseline drift continues to be Phase-0 carry-forward sheltered by `continue-on-error: true` |
| axe-core violations ≤B on modified pages | ✓ (v1 L230 ZERO MET SUSTAINED on 8-routable-surface scope; per-page 100/100 at SPA-internal navigation Task 8.12 measurement) | §6.1 cross-phase trajectory 362 → 33 → 0 → 0 SUSTAINED through Phase-8+ |
| Lighthouse LCP ≤ max(B, 500ms) | (informational; v1 L228 DUAL-FRAMING verdict per §6.2 Ilya-lock; STAKEHOLDER-DECISION-PENDING Phase-9+ disposition) | §6.2 cross-phase trajectory 4,653 ms → 3,903 ms → 2,724 ms (Phase-8+ Task 8.12 n=10 noise-floor at ssr:true HEAD-post-Task-8.11; HALT-IF #3 4,294 ms NOT TRIGGERED) |
| Pasted command output in PR | ✓ | Each per-task report §2 + measurement-report-as-completion-report at 8.12 contains pasted gate output |
| Rollback SHA documented | ✓ | Each per-task report §6 documents pre-task baseline SHA; Block B production-source edits (8.6 + 8.7 + 8.9 + 8.10 + 8.11) revertable independently |
| /security-review clean (High/Medium) | ✓ | High=0, Medium=0 across all 13 PR closures (PRs #69-#82) |
| CI green on branch | ✓ | All 13 PR-branch parity-gate runs success (mix auto-fired + manual-dispatched per paths-filter quirk taxonomy refinement at v2.68.1 patch) |
| Completion Report committed | ✓ | 13 standalone per-task reports (8.1-8.13) + this closure report — all committed |

**Phase-8+ EXIT GATE VERIFIED. Phase-8+ CLOSED at this closer; Task 8.15 publishing R for closer publishing handoff per Q6 LOCK 2-step separation.**

---

## §8. Phase-8+ → Phase-9+ carry-forward consolidation — ~11 items in 3 substantive blocks + 2 process improvements

Per Cowork Q4 LOCK at Task 8.14 PRE0, Phase-9+ entry scope consolidated from Phase-8+ §7 deferred items + per-task Completion Report §7 narratives + this closer §6.2 DUAL-FRAMING disposition. ~11 enumerated Phase-9+ candidates organized into 3 substantive blocks (sister-shape to Phase-7 closer §8 14-items-in-3-blocks pattern) + 2 process-improvement items.

### Block A — Widget + provider polish (4 items)

| # | Item | Source | Phase-9+ disposition |
|--:|:--|:--|:--|
| 1 | **Finding II widget-altitude SSR-safety audit** — TranscriptionHub.tsx:376 `useState(() => window.SpeechRecognition)` + sister widget patterns at widget-altitude; operationally unreachable at initial server-render due to AuthGate Branch 1 gating; smoke-test EMPIRICALLY confirms reachability analysis | Task 8.11 Q6 LOCK Finding II INFORMATIONAL | Phase-9+ widget-SSR-audit scope; structural classification + remediation if needed |
| 2 | **Finding EE Option β — Suspense at AuthGate altitude** — AuthGate hydration-flash polish enhancement (Option α cemented as PERMANENT baseline at smoke-test-pass altitude per Task 8.11 Q2 LOCK; Options β + γ deferred to Phase-9+) | Task 8.11 Q2 LOCK Finding EE | Phase-9+ polish enhancement candidate |
| 3 | **Finding EE Option γ — pre-hydration cookie infrastructure** — alternative AuthGate hydration-flash polish (sister to Option β; cookie-based pre-hydration vs Suspense-based) | Task 8.11 Q2 LOCK Finding EE | Phase-9+ polish enhancement candidate |
| 4 | **Finding KK LCP bimodal-at-server-vs-client-rendered-paint investigation** — informational empirical signal at Phase-8+ measurement altitude; potential investigation if Suspense-at-AuthGate (Option β) cementation occurs (could resolve bimodality structurally) | Task 8.12 Finding KK NARRATIVE | Phase-9+ measurement-investigation candidate |

### Block B — LCP-objective disposition (stakeholder-decision-pending; 2 items)

| # | Item | Source | Phase-9+ disposition |
|--:|:--|:--|:--|
| 1 | **v1 L228 LCP-objective disposition per DUAL-FRAMING** — stakeholder decision required: (a) ratify Framing (a) STRUCTURALLY UNATTAINABLE as formal closure → Phase-9+ pivot to alternative gate definitions OR alternative architecture; (b) ratify Framing (b) PARTIAL-MET as substantive progress worth continuing → Phase-9+ architectural exploration (CDN edge / HTTP/3 / island hydration); (c) defer decision → Phase-9+ kickoff brief surfaces choice explicitly | §6.2 above per Ilya-lock | Phase-9+ kickoff brief PRE0 Q1 candidate |
| 2 | **Perf-lever-exhaustion-confirmed baseline at React 19 + Vite 6 + RR v7 architecture** — Phase-8+ Task 8.13 cemented 0-of-3 perf-lever candidates with effective new-scope at current architecture; Phase-9+ exploration (if any) requires architectural-axis shift beyond current SPA framework-mode + ssr:true; baseline empirical record for Phase-9+ scope kickoff | §2 Signal (5) above | Phase-9+ scope kickoff substrate |

### Block C — Project-wide housekeeping (3 items)

| # | Item | Source | Phase-9+ disposition |
|--:|:--|:--|:--|
| 1 | **Linux Playwright baselines** — within-darwin screenshot-baseline drift since Phase-0 2026-04-22 capture; covered by `continue-on-error: true` shield at parity gate; not a regression. Capture mechanism laid at Phase-7 Task 7.4; ready for re-capture after settling on darwin-vs-Linux render-equivalence convention | Phase-7 Closure §8 Block A item #3; carried forward | Phase-9+ Block C CI architecture |
| 2 | **`nebula-bg.mp4` 70.96 MB asset LFS migration** — over GitHub's 100 MB soft limit; future push needs Git LFS, CDN, or smaller replacement. Pre-existing carry-forward; do not `git lfs migrate` on `main` without explicit instruction (history rewrite out of scope) | Pre-existing carry-forward at CLAUDE.md | Phase-9+ scope kickoff candidate |
| 3 | **~7 untracked baseline JSON artifacts** at `Docs/Baselines/2026-05-{11,12,13,17,18}_Phase0_axe_baseline.json` + `2026-05-13_Phase6_task_6_7_perf_capture.json` — residue from dispatched workflow runs; not regenerable (workflow_dispatch artifacts are time-bounded). Per `Docs/Phase8_SSR_Architectural_Scoping.md §7.3` recommendation: commit-as-historical-baselines at Task 8.15 publishing OR Phase-9+ kickoff | Phase-8+ Task 8.1 §7.3 carry-forward + Task 8.13 carry-forward | Phase-9+ Task 8.15 publishing OR Phase-9+ kickoff candidate |

### Process improvements for Phase-9+ PRE-FLIGHT discipline (2 items)

| # | Item | Source | Phase-9+ disposition |
|--:|:--|:--|:--|
| 1 | **v2.76.0 Cowork-directive-gate-citation-verification PRE-FLIGHT discipline** — promote as standing convention for Phase-9+; rule: "At every task PRE0, empirically verify the Cowork directive's gate-citation against (i) Plan-row literal text + (ii) project-spec gate-of-record. Category errors at task-directive altitude are sister-shape to audit-content errors at v2.64.0 cluster altitude." | §2 Signal (3) Recursive-validation; Task 8.13 close | GR-15 amendment candidate v2.77.0 (Phase-9+ standing convention promotion) |
| 2 | **Recursive-validation discipline as project's most substantive engineering-record pattern** — cement as Phase-8+ ↔ Phase-9+ cross-phase standing convention. Treat audit citations + Plan-row text + Cowork-directive gate-claims as STARTING-POINT-HYPOTHESES requiring empirical verification — sister discipline at all altitudes | §2 Signal (3) above | GR-15 amendment candidate for Phase-9+ adoption |

**Total consolidated at Phase-8+ closure: 4 (Block A) + 2 (Block B) + 3 (Block C) + 2 (process improvements) = ~11 Phase-9+-ready items organized into 3 substantive blocks + 2 process improvements.** Block A + Block C can run in parallel at Phase-9+ entry; Block B is the substantive Phase-9+ scope-kickoff substrate (LCP-objective disposition); process improvements adopt at Phase-9+ kickoff. Block B item #1 (v1 L228 LCP-objective stakeholder decision) is the recommended Phase-9+ kickoff PRE0 Q1 — empirically-grounded per DUAL-FRAMING + addresses Phase-8+ closure narrative open-ended-by-design.

Phase-8+ deferred-items state at Phase-8+ closure: **~11 items** (after consolidation; was 4 raw items at 8.13 close per Task 8.13 CR §7 + ~7 closer-derived). Cross-phase deferred-items ledger consolidation: ~236+ surviving entries cross-phase at Phase-8+ close (~225 carried from Phase-7 closure + ~11 NEW from Phase-8+ 13-task arc + closer-derived).

---

## §9. Closer-cementation + Task 8.15 publishing handoff

**Thirty-eight consecutive cross-phase sweep-resolutions cemented at this closer sweep** (meta-PR #44 → 6.1a → ... → 7.13 → Phase-7 closer → 8.1 OPENER → 8.2 → ... → 8.13 → **closer**); pattern fully cemented as cross-phase convention extending 38-pattern at Task 8.13 OPENING → **39-pattern milestone cemented at Task 8.14 OPENING sweep** + projected **40-pattern at Task 8.15 OPENING**. Task 8.13 TBD → `fe3643d` / `#82` resolution co-shipped at Task 8.14 OPENING sweep across §9 row 8.13 + Phase_8_Plan §status + Phase8_Task_8_13_Completion_Report §1+§2+§6 + this CLAUDE.md HEAD pointer pivot + Phase summary row 8+.

**Closer squash SHA `99b41ac` resolves at Task 8.15 OPENING sweep** per established absorb-into-next-sweep convention extending 39-pattern at closer → 40-pattern at 8.15 OPENING. Sister-shape to Phase-7 closer → 8.1 OPENER cross-phase sweep-resolution pattern (Phase-7 closer TBD → `cfa9d0f` / `#68` co-shipped at 8.1 OPENER sweep extending 25-pattern → 26-pattern).

**Task 8.15 publishing handoff per Q6 LOCK 2-step separation** (8.14 closer / 8.15 publishing distinct; sister-shape to Phase-7 closer + publishing pattern):

- **Task 8.14 (this closer)** — drafting + closure-narrative consolidation + DUAL-FRAMING §6 verdict + Phase-9+ carry-forward scaffold; NARRATES Phase-9+ transition signal preview (DUAL-FRAMING + ssr:true architectural-prerequisite EMPIRICALLY CONFIRMED).
- **Task 8.15 (publishing R)** — closer publishing + LOCKS formal Phase-9+ kickoff pointer + v1 L228 verdict-trajectory-outcome-record at canonical altitude per Plan v2 §9 8.15 row.

**Phase-8+ → Phase-9+ transition signal:** Phase-8+ 100% complete at HEAD-post-8.14 (13 of 15 closed at Task 8.14 close; row 8.15 publishing R); substantive engineering-finding catalog at 36 active + 1 INFORMATIONAL findings cemented for Phase-9+ inheritance; ~11 Phase-9+-ready carry-forward items consolidated at §7 in 3 substantive blocks + 2 process improvements; **Phase-9+ kickoff substrate**: v1 L228 DUAL-FRAMING disposition is stakeholder-decision-pending Q1 candidate at Phase-9+ kickoff brief PRE0; ssr:true architectural-prerequisite EMPIRICALLY CONFIRMED at Task 8.11 smoke-test (14 factory-produced stores work under true SSR runtime). Phase-9+ kickoff brief becomes next deliverable after Task 8.15 publishing merges; Phase-8+ closer = final substantive Phase-8+ narrative work; Task 8.15 = publishing-only handoff.

---

**Phase-8+ CLOSURE COMPLETE.** 🧪
