# Phase 8+ — Carry-Forward Closeout Arc (Phase-7 §8 consolidation + SSR-rendered shell architectural migration + v1 L228 reachability resolution)

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-8+ sub-tracker (created at v2.61 OPENING; 15 rows: 8.1 OPENER + Block A 4 items (8.2-8.5) + Block B 6 items (8.6-8.11) + Block C 4 items (8.12-8.15) including Phase-8+ closer at 8.14 + closer publishing at 8.15). Authoritative scope source is `Docs/Phase7_Closure_Report.md §8` 14-item carry-forward consolidation (organized into 3 substantive blocks + 2 process improvements absorbed into PRE-FLIGHT discipline as v2.60.1-v2.60.6 standing discipline).
**Phase status.** R OPEN 2026-05-16 at Task 8.1 OPENER (Phase-8+ OPENING ceremony per Phase-7 Closure Report §8 14-item carry-forward consolidation organized into 3 substantive blocks + 2 process improvements absorbed into Phase-8+ PRE-FLIGHT discipline per v2.60.1-v2.60.6 standing PRE-FLIGHT discipline adoption at v2.61 OPENING per Cowork Q4 Option (a) LOCK). **Task 8.1 OPENER closed at squash SHA `5057dca` (PR #69) 2026-05-16** — SCOPING-ONLY class shape (NEW class; project-wide 16th cumulative; 1pt within Phase-8+ at 8.1 close). **Task 8.2 closed at squash SHA `b43c2bf` (PR #70) 2026-05-16** — Imperative-routing → declarative-routing migration via react-router v7.15.1 library-mode per Cowork Option β LOCK; framework-mode adoption deferred to Task 8.6; NEW class SSR-MIGRATION-PREP (project-wide 17th cumulative); 2 NEW Phase-8+ engineering findings (E + F) cemented + NEW v2.62.1 PRE-FLIGHT scope-shape discipline candidate docked extending 3-pattern anchor-bias-mitigation cluster to 4-pattern; 6th cross-phase production-source-edit chunk-axis BREAK data point; vitest 259 → 264 (+5). **Task 8.3 closed at squash SHA `c44198f` (PR #71) 2026-05-17** — Provider-tree SSR-safety audit (DOC-only audit deliverable per Cowork Q2 + Q7 LOCK; zero production source touched); **SCOPING-ONLY class 1pt → 2pt cross-phase FULLY CALIBRATED at this close per Cowork Q1 LOCK** (sister-shape to CLOSURE-NARRATIVE-CONSOLIDATION 11th class fully-calibrated 2pt pattern at Phase-6 6.9 + Phase-7 closer); NEW `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md` (530 lines / 36,278 bytes; 8-section template); 3 NEW Phase-8+ engineering findings (G + H + I) cemented (2-of-4 UNSAFE provider mix + TanStack Query SSR-hydration discipline gap + Dependency-chain SSR-safety propagation); cumulative Phase-8+ engineering-finding catalog 6 → 9; AdminShell-scoped 3-provider audit DEFERRED to Task 8.9 hydration verification per Cowork Q3 LOCK + v2.62.1 scope-shape PRE-FLIGHT discipline; NEW Conventions block entry per-provider-SSR-safety taxonomy 3-altitude classification framework (init-time UNSAFE / effect-time SAFE / event-handler-time SAFE); 31-of-31 cross-phase chunk-axis preservation cumulative; 28 consecutive cross-phase sweep-resolutions. **Task 8.4 closed at squash SHA `6742484` (PR #72) 2026-05-17** — `qualia-shell/index.html` template refactor (production-source edit at index.html altitude); **SSR-MIGRATION-PREP class 1pt → 2pt cross-phase FULLY CALIBRATED at this close per Cowork Q1 LOCK** (sister-shape to SCOPING-ONLY 16th class fully-calibrated 2pt pattern at Tasks 8.1 + 8.3); framework-agnostic FOUC mitigation pattern (script-injection IIFE empirically-corrected to `className` pattern per Finding β) + 5 SSR-ready meta tags (description + 4 Open Graph) + viewport-fit=cover refinement per Q4(b) LOCK; framework-agnostic per Q3 LOCK; NO `ThemeContext.tsx` edits per D-3 LOCK + v2.62.1 scope-shape PRE-FLIGHT discipline; 2 NEW Phase-8+ engineering findings (J + K) cemented (audit-content empirical-vs-hypothetical-distinction + dist/index.html parent-altitude shape-change taxonomy); cumulative Phase-8+ engineering-finding catalog 9 → 11; NEW v2.64.0 PRE-FLIGHT scope-shape discipline candidate at audit-content altitude (5-pattern anchor-bias-mitigation cluster extension); audit doc §3.1 inline-footnote-correction shipped per Cowork D-1 LOCK; 4 NEW Conventions block entries (FOUC IIFE mitigation + v2.64.0 audit-content + 5-pattern cluster + chunk-axis-preservation taxonomy at parent-altitude); 32-of-32 cross-phase chunk-axis preservation cumulative per finding K (`dist/assets/**` chunks byte-identical pre/post; `dist/index.html` 1,456 B → 2,301 B / +845 B / +58.0% build-mode invariant); 29 consecutive cross-phase sweep-resolutions. **Task 8.5 closed at squash SHA `d98bd48` (PR #73) 2026-05-17** — Static-data extraction conditional (DOC-only roadmap deliverable per Cowork Q1 Option δ LOCK; zero production source touched); **SCOPING-ONLY class 2pt → 3pt CROSS-TASK-SHAPE-ROBUSTNESS extension at this close** (sister-shape to MEASUREMENT-ONLY 7pt → 8pt → 9pt extension pattern at Phase-7 7.11 + 7.14; NEW 3rd sub-shape `empirical-inventory-confirming-NO-extraction-needed`); 4-layer infrastructure (public/data + fixtures/appfolioDerived + strataApi env-flag dispatch + inline App.tsx route metadata) framework-agnostic-by-construction empirically verified at PRE0; 2 NEW Phase-8+ engineering findings (L + M) cemented (scope-existence-empirical-refutation + Phase-plan-document audit-content empirical-vs-hypothetical-distinction); cumulative Phase-8+ engineering-finding catalog 11 → 13; NEW v2.65.0 PRE-FLIGHT discipline candidate at Phase-plan-document altitude (6-pattern anchor-bias-mitigation cluster extension); Plan §4 L116 inline-footnote-correction shipped per Verdict 3 LOCK; 3 NEW Conventions block entries (Finding L scope-existence-empirical-refutation pattern + Finding M v2.65.0 cross-altitude-applicability validation + 6-pattern anchor-bias-mitigation cluster recognition); 33-of-33 cross-phase chunk-axis preservation cumulative; 30-pattern milestone cross-phase sweep-resolutions ROUND-DECADE CONVENTION CEMENTATION at 8.5 sweep. **🎯 Phase-8+ Block A 4-of-4 COMPLETE** (8.2 ✓ + 8.3 ✓ + 8.4 ✓ + 8.5 ✓). **Task 8.6 closed at squash SHA `8e04061` (PR #74) 2026-05-17** — RR v7 framework-mode adoption (Phase-8+ Block B OPENER); **NEW class FRAMEWORK-INSTALLATION introduced (project-wide 18th cumulative) per Cowork Verdict 1 LOCK at PRE0**; 11 file changes at qualia-shell/ at original commit `042606b` + 6 file changes at Step-4-bis remediation commit `6ebf63c` (squash merge → `8e04061`) (5 NEW: react-router.config.ts ssr:false + app/root.tsx canonical root layout + app/routes.ts declarative config with v2.66.3 `index('routes/default.tsx')` + `{ id: 'splat' }` per Finding U-REVISED + app/routes/security.tsx + app/routes/default.tsx; 4 MODIFIED: vite.config.ts SPLIT per Verdict 3 LOCK + tsconfig.json adds app/ to include + src/App.tsx SecurityRoute+DefaultRoute named-export promotion + package.json scripts/deps; 2 NEW: vitest.config.ts SPLIT companion); **8 NEW Phase-8+ engineering findings cemented**: N (file-count empirical-vs-hypothetical) + O (Task-partition empirical infeasibility — Task 8.6 includes minimal app/root.tsx per Verdict 2 LOCK) + P (class-count mismatch) + Q (class-designation CONFIG-FILE-EDIT empirically false) + R (vite.config.ts SPLIT pattern per Verdict 3 LOCK) + S (@react-router/node production-dep placement; v2.60.1 5th altitude install-shipping) + T (npx vite build SILENT NO-OP when reactRouter() plugin wired) + **U-REVISED (RR v7 framework-mode `route('*', ...)` splat-does-not-match-root at routing-config altitude; initial empirical-CI-runtime hypothesis EMPIRICALLY REFUTED at Step-4-bis recursive-self-validation; REVISED per Cowork Verdict 7 LOCK)**; cumulative Phase-8+ catalog 13 → 21; **NEW v2.66.0 + v2.67.0 PRE-FLIGHT discipline candidates at install-shipping + routing-config altitudes** (extending v2.60.1 cluster from 4 → 6 altitudes within single Task 8.6 close cycle + nested 7th sub-altitude route-id-derivation); 8-pattern anchor-bias-mitigation cluster recognition extension (v2.65.0 → v2.66.0 → v2.67.0); **3 in-place v2.X.X patches within single Task 8.6 close cycle**: v2.66.1 build-command altitude (`.github/workflows/appfolio-parity-gate.yml::L103+L109` per Finding T; sister-shape to v2.55.1 + v2.51.1 in-place CI patch precedents at Phase-7 Tasks 7.9 + 7.4) + v2.66.2 server-startup altitude (workflow pre-Playwright build step + `playwright.baseline.config.ts` webServer reshape per Cowork Verdict 1 Approach A LOCK) + v2.66.3 routing-config altitude (`app/routes.ts` ADDS `index('routes/default.tsx')` + `{ id: 'splat' }` per Cowork Verdict 6 Z1 LOCK on Finding U-REVISED); **3-in-place-patches-per-task precedent at Phase-8+ Block B opener** (extends Phase-7 Task 7.3 v2.50.1+v2.50.2 2-in-place escalation by +1 cluster level); Plan §4 L130 + L132 inline-footnote-corrections shipped per Verdict 5 LOCK (Findings N + P + Q cross-altitude-applicability validation); **Block B 1-of-6 milestone at this close (8.6 ✓)**; **build-output-graph empirical transformation `dist/` → `build/client/`** with Phase-7 7.10 LCP-reduction lever PRESERVED + further compression (entry chunk 253,683 B → 187,619 B = −66,064 B / −26.0% at framework-mode altitude); 34-of-34 cross-phase chunk-axis preservation pattern resets to 1-of-1 NEW canonical at HEAD-post-8.6 (production-source-edit BREAK; 6th cross-phase BREAK data point sister to 6.1a + 6.3 + 6.4 + 7.1 + 7.10 + 8.2 precedents); 31-pattern milestone cross-phase sweep-resolutions cemented at 8.6 OPENING (extends 30-pattern at 8.5 ROUND-DECADE CONVENTION CEMENTATION); vitest 264/264 LOCAL clean (+0 delta per FRAMEWORK-INSTALLATION class shape; structural refactor only; semantic preservation). **🎯 Block A → Block B transition gate GREEN-LIGHT per Cowork Verdict 4 LOCK** — Task 8.6 RR v7 framework-mode adoption SHIPPED. **Task 8.7 closed at squash SHA `79f0ced` (PR #75) 2026-05-17** — Entry boundary creation (Phase-8+ Block B item 2); **FRAMEWORK-INSTALLATION class 1pt → 2pt CROSS-TASK-SHAPE FULL CALIBRATION at this close per Cowork Verdict 12 LOCK** (sister-shape to SCOPING-ONLY 2pt at Tasks 8.1+8.3 + SSR-MIGRATION-PREP 2pt at Tasks 8.2+8.4 — **3-of-3 Phase-8+-introduced classes fully calibrated by Task 8.7 close**); 3 file changes at qualia-shell/app/ (NEW entry.client.tsx + NEW entry.server.tsx Node.js renderToPipeableStream per Verdict 13 + REFACTOR root.tsx to canonical Layout/Root/HydrateFallback 3-export pattern per Verdict 15); 2 NEW Phase-8+ engineering findings (V FOUC IIFE HTML-shipping regression + W entry.server.tsx structurally invoked at build time even at ssr:false; 8th v2.60.1 cluster altitude); cumulative Phase-8+ catalog 21 → 23; NEW v2.68.0 PRE-FLIGHT discipline candidate at entry-boundary-build-time-invocation altitude per Bonus Verdict 18 LOCK; 9-pattern anchor-bias-mitigation cluster recognition extension; 7th cross-phase production-source-edit chunk-axis BREAK data point; HALT-IF #2 grep verification 0 → 1 binary-inversion empirical signal (FOUC IIFE HTML-shipped at HydrateFallback altitude); HALT-IF #4 local axe-baseline 8/8 PASS preservation (54.9s wallclock; sister-shape to Task 8.6 Z1.B precedent); **Block B 2-of-6 milestone at this close**; recursive-validation discipline pattern empirically vindicated at 3rd consecutive Task PRE0 (8.5 + 8.6 + 8.7). **Task 8.8 closed at squash SHA `TBD` (PR #TBD) 2026-05-18** — Per-route SSR opt-in scope-collapsed to **SCOPING-ONLY 3pt → 4pt CROSS-TASK-SHAPE-ROBUSTNESS extension** per Cowork Verdict 19 LOCK at Step-2 PRE0 (sister-shape to MEASUREMENT-ONLY 7pt → 8pt → 9pt extension pattern at Phase-7 7.11+7.14); NEW 4th sub-shape `empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE` (sister to Task 8.5's 3rd sub-shape `empirical-inventory-confirming-NO-extraction-needed`); 2 NEW Phase-8+ engineering findings (X paths-filter taxonomy refinement at `qualia-shell/app/**` altitude + Y per-route SSR opt-out empirical infeasibility at RR v7 framework-mode 7.15.1; ReactRouterConfig::ssr GLOBAL boolean only, no per-route opt-out mechanism); cumulative Phase-8+ catalog 23 → 25; NEW v2.69.0 + v2.70.0 PRE-FLIGHT discipline candidates at paths-filter-scope + per-route-routing-config altitudes; 11-pattern anchor-bias-mitigation cluster recognition extension; v2.60.1 cluster now applied across 9 distinct empirical-verification altitudes + nested sub-altitude; **in-place v2.68.1 workflow patch** at `.github/workflows/appfolio-parity-gate.yml::paths-filter` (add `qualia-shell/app/**` glob; sister-shape constellation to Task 8.6 v2.66.1+v2.66.2+v2.66.3 — 4-in-place-patches-cumulative-at-Phase-8+-Block-B-opener-trio precedent); HALT-IF #1 grep verification 0 → 1+ binary inversion empirical signal; **Block B 3-of-6 milestone at this close**; **4th consecutive Task PRE0 wrong-hypothesis refutation pattern empirically cemented (Findings L+O+W+Y)** — recursive-validation discipline IS the project's most substantive engineering record pattern; provider tree SSR-safety remediation + ssr flip atomic-shipping DEFERRED to Task 8.9 per Cowork Verdict 23 reaffirming Task 8.3 Verdict 9 LOCK. 7 R remaining (8.9-8.15). **🎯 Substantive Phase-8+ engineering-finding catalog surfaced at Task 8.1 OPENER at 4 publishable-level findings** (sister-shape to Phase-7 closer §2 2-finding catalog depth applied prospectively): (A) Imperative-routing SSR-incompatibility surface at `qualia-shell/src/App.tsx` L79 + L89 is categorical hard-blocker; (B) Phase-7 perf optimization carry-forward is framework-conditional; (C) Custom Vite SSR upstream-disclaimed as framework-author-only API; (D) TanStack Start RC stage as of 2026-05 is production-risk inflection. **🎯 v2.60.1-v2.60.6 ADOPTED as standing PRE-FLIGHT discipline at v2.61 OPENING per Cowork Q4 LOCK.** **🎯 NEW v2.61.0 byte-vs-line-count refinement of v2.60.6 §4g empirical-content-density principle docked at Phase-8+ Task 8.1 close.** Phase-8+ → Phase-9+ transition signal per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6`: binary v1 L228 MET-or-STRUCTURALLY-UNATTAINABLE-refinement-candidate OR 3rd partial-MET outcome per Cowork Verdict 3 LOCK; all 3 outcomes are publishable engineering deliverables of equivalent rigor. **🎯 26 consecutive cross-phase sweep-resolutions cemented at 8.1 OPENER sweep** (extends Phase-7 closer 25-pattern → 26-pattern at 8.1 OPENING; Phase-7 closer TBD → `cfa9d0f` / `#68` co-shipped). **🎯 30-of-30 cross-phase chunk-axis preservation cumulative at 8.1 close** (DOC-only OPENER edit fully outside Vite entry graph; 1-of-1 within-Phase-8+).
**Budget.** 8-12 days end-to-end across 15 tasks (each task ~0.5-1.5 days; 2-3 day buffer; Block B 6-task framework adoption is the heaviest sub-arc; mirrors Phase-7 cadence at 5-7 days for 14 tasks expanded for SSR-migration scope).
**Owner.** Frontend engineer + (potentially) Backend integration engineer at Block B Task 8.7 (entry boundary creation; server runtime selection) + QA engineer at Block C measurement tasks.
**Dependencies.** Phase 7 closed at `cfa9d0f` (PR #68; Phase-7 closer). No backend work in Phase-8+ Block A (production-source-edit pre-fixes at frontend altitude only); Block B may require backend integration coordination per chosen framework's server runtime requirements (Vike server middleware integration with existing `/api` proxy; RR v7 framework-mode `entry.server.tsx` boundary; etc.) — TBD at Task 8.6 kickoff PRE0.
**Parallelizable?** Block A items 8.2-8.5 partially sequential (8.2 imperative-routing fix must land before 8.3 provider-tree SSR audit + 8.4 index.html template refactor + 8.5 static-data extraction can fully complete; 8.3 + 8.4 + 8.5 partially parallelizable to each other once 8.2 lands). Block B items 8.6-8.11 mostly sequential (framework installation → entry boundary → per-route SSR opt-in → hydration verification → progressive rollout → prefetching optimization). Block C items 8.12-8.15 sequential (LCP re-measurement → perf-lever stacking conditional → closer narrative → closer publishing).

---

## §1. Scope

Carry-forward closeout arc bridging the gap between "Phase-7 perf optimization landed Lever 3 React.lazy expansion with substantive LCP −550 ms partial-win" and "v1 L228 ≤500 ms LCP target reachability resolved via SSR-shell migration (chosen framework adoption) OR refined to STRUCTURALLY UNATTAINABLE even with SSR migration claim with empirical grounding". Four empirical findings drive Phase-8+ entry:

1. **`Docs/Phase7_Closure_Report.md §8` carry-forward consolidation** — 14 items organized into 3 substantive blocks (Block A pre-framework-adoption fixes 4 items / Block B chosen-framework adoption 6 items / Block C empirical re-measurement + closer 4 items) + 2 process improvements absorbed into Phase-8+ PRE-FLIGHT discipline as v2.60.1-v2.60.6.
2. **Phase-7 closer Finding (A) — lazy-load IS structurally-correct lever family at React 19 + Vite 6 + 4,500 ms-LCP baseline architecture** (cemented across 4 cross-referenced closes 6.7 + 7.10 + 7.11 + 7.14; v1 L228 ≤500 ms LCP STRUCTURALLY UNATTAINABLE empirically refined to "multi-lever within React 19 + Vite 6 architecture; SSR-shell exploration becomes Phase-8+ priority"). Phase-8+ Block B IS that SSR-shell exploration.
3. **Phase-8+ Task 8.1 OPENER PRE0 finding — imperative-routing SSR-incompatibility surface at App.tsx L79 + L89 is categorical hard-blocker across all 5 framework candidates** (`window.location.pathname` + `URLSearchParams(window.location.search)` reference browser globals at App component evaluation; throw `ReferenceError: window is not defined` on every server render attempt). Promotes pre-framework-adoption fix to Block A critical path as Task 8.2.
4. **Phase-8+ Task 8.1 OPENER PRE0 finding — Phase-7 perf optimization carry-forward is framework-conditional** (Vike + RR v7 framework-mode + TanStack Start preserve `vite.config.ts` + `lazyWithReload` architecture; Next.js discards categorically per official migration guide Step 9). Materially affects framework-choice calculus; Cowork-expected §6 recommendation at 8.1 close: Vike primary + RR v7 framework-mode close-second (Next.js eliminated per strategic discontinuity; TanStack Start deferred per RC-stage risk; Custom Vite SSR ruled out per upstream-disclaim).

Phase-8+ closes all four gaps: (1) extend imperative-routing → declarative-routing migration at Task 8.2 (framework-independent pre-task; Block A item); (2) audit provider-tree SSR-safety + refactor index.html template + extract static data at Block A items 8.3-8.5; (3) adopt chosen framework + create entry boundaries + per-route SSR opt-in + hydration verification + progressive rollout + prefetching optimization at Block B items 8.6-8.11; (4) re-measure LCP n=10 (mirror Phase-7 7.11 protocol) + perf-lever stacking conditional + Phase-8+ closer narrative + closer publishing at Block C items 8.12-8.15; (5) lock v1 L228 reachability verdict at Block C close (MET vs STRUCTURALLY UNATTAINABLE refinement OR 3rd partial-MET outcome per Cowork Verdict 3 LOCK).

**v1-lineage substitute.** Phase-8+ has no v1 plan source — this is post-v1 carry-forward arc continuing Phase-7's post-v1 lineage. Authoritative scope source is `Docs/Phase7_Closure_Report.md §8` 14-item carry-forward enumeration + Plan v2 §9 Phase-8+ sub-tracker (15 rows) + `Docs/Phase8_SSR_Architectural_Scoping.md` (Task 8.1 deliverable; 531 lines / 51 KB; 9-section template) + GR-14 v2.32 phase-spec-vs-parent precedent (when phase-spec contradicts parent, parent + v1-lineage wins; Phase-8+ has no v1 parent row to contradict so this phase-spec IS the authoritative source; mirrors Phase-6's + Phase-7's authority structure).

Scope boundaries:

- **IN** — imperative-routing → declarative-routing migration at App.tsx L79 + L89 (8.2); provider-tree SSR audit (8.3); index.html template refactor (8.4); static-data extraction if needed (8.5); chosen framework installation + dependency audit (8.6); entry boundary creation (8.7); per-route SSR opt-in (8.8); hydration verification (8.9); progressive SSR rollout (8.10 optional); prefetching/streaming optimization (8.11 optional); LCP n=10 re-measurement (8.12); perf-lever stacking conditional (8.13 optional); Phase-8+ closer narrative (8.14); closer publishing + Phase-9+ transition signal lock (8.15). v1 L228 ≤500 ms LCP target reachability resolution IS in Phase-8+ scope (Block C 8.12 close).
- **OUT** — backend changes (cross-repo per R-4 v2.26 unchanged; framework-specific server runtime integration at 8.7 may require Block B-internal coordination but no parity-gate scope); destructive component refactors beyond imperative-routing fix; new module/route additions; v1 L230 ZERO WCAG AA target (preserved at Phase-7 close; not re-tested at Phase-8+ unless SSR migration regresses); Phase-7 Lever 1 font deferral OR Lever 2 vendor split re-attempt (both REVERT data points; not correct lever family per Phase-7 Finding A).

---

## §2. Definition of Ready

1. Phase 7 closed (✓ at `cfa9d0f` 2026-05-16; PR #68).
2. `Docs/Phase7_Closure_Report.md` committed (323 lines / 74,321 bytes; 8-section template + 14-item carry-forward §8).
3. Phase-7 deferred-items ledger consolidated (✓ at `Docs/Phase7_Closure_Report.md §8` 14-item carry-forward into 3 blocks + 2 process improvements).
4. `Docs/Phase8_SSR_Architectural_Scoping.md` committed (✓ at Task 8.1 OPENER close; 531 lines / 51 KB; 9-section template; 4 publishable engineering findings + 5-framework decision tree + 14-task envelope + 8 Cowork decision gates).
5. Per-task PRE0 DC-A 5-query discovery (per Plan v2.29 PERMANENT process change + v2.42 mathematical-exactness-signal at 6.4 + v2.43 build-mode-aware chunk-axis comparison protocol at 6.5 + v2.60.1-v2.60.6 standing PRE-FLIGHT discipline adopted at v2.61 OPENING).
6. Per-task Step Zero source-provenance verification (per Phase-4 closure §4 elevated to PERMANENT process change).
7. **🎯 NEW at Phase-8+ OPENING — v2.60.1 Falsified-hypothesis empirical-verification PRE-FLIGHT discipline absorbed:** When mid-investigation empirical signal contradicts kickoff-brief hypothesis, HALT and deepen; do not escalate fix candidates without root-cause confirmation.
8. **🎯 NEW at Phase-8+ OPENING — v2.60.2 Kickoff-brief precision 3-pattern cluster absorbed:** (i) Source-provenance verification (sister to GR-14 step zero); (ii) actual-path verification; (iii) import-statement precision verification.
9. **🎯 NEW at Phase-8+ OPENING — v2.60.3 5-stage structured-diagnostic-protocol absorbed:** Reusable for any test-infra flake regardless of root-cause domain.
10. **🎯 NEW at Phase-8+ OPENING — v2.60.4 Per-task NEW-class tracker absorbed (anchor-bias-mitigation cluster):** Maintain explicit per-task NEW-class tracker; at Phase-N close, derive empirically-correct count by enumeration BEFORE applying any sister-shape comparison framing.
11. **🎯 NEW at Phase-8+ OPENING — v2.60.5 Build-mode-aware chunk-axis comparison protocol extension at vitest-test-spec altitude absorbed:** When test-tooling involves time-mocking + async-cascade-to-render path, document the exact `vi` API combination + recognize empirical fragility at React 19 + jsdom + RTL altitude.
12. **🎯 NEW at Phase-8+ OPENING — v2.60.6 Empirical-content-density-driven closer scope codification absorbed + v2.61.0 byte-vs-line-count refinement docked:** Byte-count is the structurally-correct PRIMARY content-density measure across multiple document shapes; line-count is shape-dependent.
13. **🎯 NEW at Phase-8+ OPENING — Task 8.1 §8.3 8 Cowork decision gates institutionalized:** Task 8.1 close + Task 8.2 kickoff + Task 8.2 close + Block A → Block B transition gate at 8.5 close + Task 8.6 close + Block B → Block C transition gate at 8.11 close + Task 8.12 close + Task 8.14 close. Per Cowork Verdict 5 LOCK; 2 NEW Block-boundary transition-gates institutionalize strategic-pivot discipline from Phase-7 7.9 close.

---

## §3. Definition of Done

Per task:

1. PRE-merge gates green: `tsc -b` + `vitest run` (≥259 baseline preserved) + both `vite build` modes + `verify_no_pii_leak.mjs` strict-clean. **Block B framework-adoption tasks may modify gates** (Next.js eliminated; Vike + RR v7 + TanStack Start preserve Vite-based gates) — gate framework verdict at Task 8.6 close.
2. Production chunk SHA256 + filename + byte-count captured pre-edit + post-edit; invariance state documented per dual-axis convention (Plan v2.28 reframe + v2.43 build-mode-aware comparison + v2.60.5 vitest-spec altitude extension).
3. CDP probe or measurement re-verification on the actual changed surface (Lighthouse metrics for Block C perf; React hydration audit for Block B; axe re-scan for any a11y regression).
4. Smoke-test pass-count meets per-task acceptance criterion (chromium project smoke-test 12/12 continues as baseline gate; tenant + admin shell coverage; SSR hydration verification at Block B Task 8.9).
5. Parity-gate green on PR-branch — for tasks touching `qualia-shell/src/**` paths the parity gate auto-fires on `pull_request`; for tasks touching only paths outside the paths-filter manual-dispatch is required per established 18-task cross-phase precedent at 8.1 OPENER.
6. CodeRabbit review pass.
7. `Docs/Phase8_Task_8_X_Completion_Report.md` committed with 8-section template — OR measurement-report-as-completion-report pattern per Phase-6 Process Improvement #2 (executor discretion for 8.12 LCP n=10 re-measurement in particular; mirrors Phase-7 7.11 precedent).
8. §9 Phase-8+ sub-tracker row flips `R → ✓` at task close; §9 main matrix Phase-8+ column header flips `R → ✓` at Phase-8+ closure (Task 8.15 publishing).
9. **🎯 NEW at Phase-8+ — 8 Cowork decision gates institutionalized per Task 8.1 §8.3:** at each gate, surface decision substrate from prior task empirical execution + lock verdict via Cowork before next-block tasks proceed.

---

## §4. Tasks

### Block A — Pre-framework-adoption fixes (4 items 8.2-8.5)

Block A items 8.2-8.5 form a coherent 4-subtask sub-arc that prepares the SPA shell for framework adoption (8.2 imperative-routing → declarative-routing migration unblocks all 5 framework candidates structurally; 8.3 provider-tree SSR audit + 8.4 index.html template refactor + 8.5 static-data extraction prepare the SPA shell architecture for SSR adoption). All Block A tasks are framework-independent — they execute regardless of which framework wins at §6 decision gate (Cowork Q-B carve-out LOCK).

#### Task 8.2 — Imperative-routing → declarative-routing migration (framework-independent pre-task; Cowork PRE0 verdict locks framework selection)

**Goal.** Replace `qualia-shell/src/App.tsx` L79 + L89 `window.location.pathname` / `URLSearchParams(window.location.search)` references with declarative router-library shape (likely `react-router-dom` v6 `BrowserRouter` + `Routes` + `Route`; final library verdict at PRE0 depends on framework selection). Preserves 3-branch inline routing semantics (security viewport-fill + popup compact + AuthGate default).

**Files touched.** 1-3 source files: `qualia-shell/src/App.tsx` (replace inline conditional routing with declarative `<Routes>`) + possibly NEW router-config file + possibly useEffect-localStorage shim if `Sidebar.tsx:228` `localStorage` cold-start seed needs SSR-safe abstraction.

**Acceptance gate.** vitest 259/259 PASS + smoke-test 12/12 PASS (chromium project) + parity gate PASS (production-source edit auto-fires per paths-filter) + 3 routing branches structurally preserved (verified via Playwright e2e direct URL navigation: `/` + `/security` + `/?popup=ComponentName`).

**Calibration class.** **COMPONENT-FIX carry-over (Phase-8+ 1st distinct data point; extends Phase-7 4pt → 5pt cross-phase)** OR **NEW class SSR-MIGRATION-PREP** (project-wide 17th cumulative candidate; Cowork verdict at 8.2 PRE0 Q1 per v2.60.4 per-task NEW-class tracker discipline).

**Framework selection final verdict at 8.2 kickoff per Q6 LOCK.** Vike primary recommendation OR React Router v7 framework-mode close-second per Task 8.1 §6.7. Cowork PRE0 Q1 at 8.2 kickoff locks the verdict; downstream Block B Task 8.6 framework installation executes the locked choice.

---

#### Task 8.3 — Provider-tree SSR audit

**Goal.** Audit `ThemeProvider` + `UserProvider` + `QueryProvider` + `PermissionsProvider` (App.tsx provider stack) for SSR-safety: no `window` / `localStorage` / `document` references at provider initialization; lazy-defer to `useEffect` for client-only state.

**Files touched.** 4 provider files at `qualia-shell/src/context/` + `qualia-shell/src/providers/` — likely small refactor edits to defer browser-global access.

**Acceptance gate.** Provider-tree audit committed; SSR-safe provider initialization verified via React 19 `renderToPipeableStream` smoke-test at Block B Task 8.7.

**Calibration class.** **COMPONENT-FIX carry-over** (Phase-8+ 2nd distinct data point likely; extends 5pt → 6pt cross-phase if same class) OR NEW class candidate per PRE0 verdict.

---

#### Task 8.4 — `qualia-shell/index.html` template refactor (framework-agnostic)

**Goal.** Move static `<head>` content (theme color, manifest, favicon, 17 Google Fonts at L11-15) into a framework-shape-agnostic template that can be lifted into chosen framework's root layout at Block B kickoff. Re-evaluate Phase-7 Lever 1 17-Google-Fonts cost-benefit calculus under SSR architecture (font-swap CLS risk + initial-paint-FCP gain may rebalance).

**Files touched.** 1 file: `qualia-shell/index.html` template refactor + possibly NEW `qualia-shell/src/template/head.ts` exporting head metadata for framework lifting.

**Calibration class.** **CONFIG-FILE-EDIT** (Phase-8+ 1st distinct data point; non-production-source edit; chunk-axis preserved).

---

#### Task 8.5 — Static-data extraction (CONDITIONAL on Block A PRE0)

**Goal.** Identify candidates for build-time-or-server-time data extraction (likely route-level metadata + auth-gate static config). Out-of-scope at 8.1 PRE0 depth; Block B kickoff PRE0 surfaces specific extraction targets if needed.

**Files touched.** 0-N files depending on PRE0 verdict.

**🎯 Block A → Block B transition gate at 8.5 close per Cowork Verdict 5 LOCK.** Cowork verdict on whether Block A items produced clean pre-conditions for framework adoption (imperative-routing fully migrated + provider-tree SSR-audited + index.html template-ready + housekeeping). 2 NEW Block-boundary transition-gates institutionalize strategic-pivot discipline empirically established at Phase-7 7.9 close.

**Calibration class.** **DOC-INVESTIGATION-ONLY** (Phase-8+ 1st distinct data point likely; depends on whether extraction is needed at all per PRE0 verdict).

> **🔗 Inline-footnote-correction at Phase-8+ Task 8.5 close (2026-05-17) per Cowork Verdict 3 LOCK + v2.65.0 Phase-plan-document audit-content empirical-vs-hypothetical-distinction PRE-FLIGHT discipline (cross-altitude-applicability validation of v2.64.0 from Phase-8+ Task 8.4 close).** Empirical verification at Task 8.5 PRE0 surfaced **class-terminology mismatch** between plan-doc shipping-time placeholder `DOC-INVESTIGATION-ONLY` (pre-class-stabilization terminology at v2.61 OPENING Phase-plan-document authoring time) and current project-wide 17-class taxonomy (cemented at Task 8.4 close with SSR-MIGRATION-PREP 2pt fully calibrated). **Structurally-correct equivalent class:** `SCOPING-ONLY` (at 2pt fully calibrated at Task 8.3 close; extended to 3pt cross-task-shape-robustness at Task 8.5 close per Cowork Q1 Option δ Verdict 1 LOCK with NEW 3rd sub-shape `empirical-inventory-confirming-NO-extraction-needed`). Sister-shape to Task 8.4 D-1 LOCK audit doc §3.1 inline-footnote-correction byte-for-byte (audit-doc altitude → Phase-plan-document altitude cross-altitude-applicability validation). Plan-doc shipping-time content "DOC-INVESTIGATION-ONLY" preserved verbatim above; this correction-in-place pattern sister-shape to Phase-7 7.14 inline-footnote-at-Phase5_Perf_Report.md §2 retroactive-correction-in-place precedent. **Cross-link:** `Docs/Phase8_Task_8_5_Completion_Report.md §0` finding (M) cementation + v2.65.0 PRE-FLIGHT discipline candidate at v2.65 Plan amendment.

---

### Block B — Chosen-framework adoption (6 items 8.6-8.11)

Block B inherits framework verdict from Task 8.2 kickoff (Vike OR RR v7 framework-mode per Cowork verdict). 6-task arc: 8.6 installation → 8.7 entry boundary → 8.8 per-route SSR opt-in → 8.9 hydration verification → 8.10 progressive rollout (optional) → 8.11 prefetching/streaming optimization (optional). Block B 6-task envelope absorbs Phase-7's 3-lever empirical findings as framework-specific lever stacking: chosen framework's SSR primitives + Phase-7 7.10 React.lazy expansion + per-page render-mode toggle (Vike-conditional).

#### Task 8.6 — Framework installation + dependency audit + framework-config setup

**Goal.** Adopt full RR v7 framework-mode primitives DEFERRED FROM TASK 8.2 per Cowork Option β LOCK (PRE0-refined-scope at Task 8.2; library-mode `react-router` core already installed at 8.2; this task adds `@react-router/dev` Vite plugin + `@react-router/node` server runtime + `app/` directory structure + `react-router.config.ts` with `ssr: false` initially for SPA-mode-under-framework-mode shell). 8.2 framework verdict LOCKED RR v7 framework-mode primary at v2.62 amendment per Cowork Q2 LOCK + Option β scope-refinement.

**Files touched.** 1-3 config files (`package.json` dependency additions + framework config file like `vike.config.ts` OR `react-router.config.ts`) + possibly minor `vite.config.ts` additive amendment (Vike plugin OR RR v7 plugin overlay).

> **🔗 Inline-footnote-correction at Phase-8+ Task 8.6 close (2026-05-17) per Cowork Verdict 5 LOCK + v2.65.0 Phase-plan-document audit-content empirical-vs-hypothetical-distinction PRE-FLIGHT discipline (sister-shape to Task 8.5 D-3 LOCK byte-for-byte at L116).** Empirical Step-3 implementation at Task 8.6 surfaced **file-count under-estimation** at Finding N: "1-3 config files" plan-doc shipping-time framing vs empirical 5-7+ file impact at HEAD-post-8.6 — (1) `package.json` deps update + scripts update + auto-installed `isbot@^5` peer; (2) NEW `react-router.config.ts` (`ssr: false`); (3) NEW `app/root.tsx` (canonical root layout per Cowork Verdict 2 LOCK; ports index.html FOUC IIFE + 5 meta tags); (4) NEW `app/routes.ts` (declarative 3-branch config); (5) NEW `app/routes/security.tsx` (thin re-export bridge); (6) NEW `app/routes/default.tsx` (thin re-export bridge); (7) SPLIT `vite.config.ts` (Vite + reactRouter() plugin) + NEW `vitest.config.ts` (Vitest-only config) per Cowork Verdict 3 LOCK Finding R remediation; (8) UPDATE `qualia-shell/tsconfig.json` (added `app/` to include array); (9) M `qualia-shell/src/App.tsx` (SecurityRoute + DefaultRoute named-export promotion; 2-line edit). **Empirical 9-file impact** (5 NEW + 4 MODIFIED at qualia-shell/) vs plan-doc shipping-time "1-3 config files" framing. **Cross-link:** `Docs/Phase8_Task_8_6_Completion_Report.md §0` finding (N) cementation; Verdict 5 LOCK at v2.66 Plan amendment.

**Calibration class.** **CONFIG-FILE-EDIT carry-over** (Phase-8+ 2nd distinct data point; sister to 8.4) OR **NEW class FRAMEWORK-INSTALLATION** (17th cumulative candidate per v2.60.4 discipline).

> **🔗 Inline-footnote-correction at Phase-8+ Task 8.6 close (2026-05-17) per Cowork Verdict 5 LOCK (extends L130 inline-footnote sister-shape).** Empirical refinement at Task 8.6 PRE0 surfaced **class-designation + class-count mismatch** at Findings P + Q: (P) Plan-doc shipping-time "17th cumulative candidate" framing was anchored on Phase-7 closer 14-class baseline; at HEAD-post-8.5 the project-wide class count was already 17 (SCOPING-ONLY 16th at Task 8.1 + SSR-MIGRATION-PREP 17th at Task 8.2); empirically-correct class count is **18th cumulative**. (Q) Plan-doc shipping-time `CONFIG-FILE-EDIT carry-over` framing empirically false — the class taxonomy has no CONFIG-FILE-EDIT class at HEAD-post-8.5; closest precedent is CI-CONFIG-ONLY (12th class; CI orchestration sub-domain) which is structurally distinct from production-source framework-installation altitude. **Cowork Verdict Q1 LOCKED Option α at Task 8.6 PRE0:** NEW class **FRAMEWORK-INSTALLATION** (project-wide 18th cumulative; 1pt within Phase-8+ at 8.6 close; pending 2nd cross-phase data point for full calibration at Phase-9+ framework-decision recurrence OR Phase-8+ internal 2nd FRAMEWORK-INSTALLATION instance if ssr:false→true flip at Task 8.8 qualifies as 2nd data point). **Cross-link:** `Docs/Phase8_Task_8_6_Completion_Report.md §0` findings (P + Q) cementation; Verdict 5 LOCK at v2.66 Plan amendment.

---

#### Task 8.7 — Entry boundary creation

**Goal.** Create framework-specific entry boundary files: `entry.server.tsx` + `entry.client.tsx` (RR v7 framework-mode) OR `+onRenderHtml.ts` + `+onRenderClient.ts` (Vike). React 19 streaming SSR primitives (`renderToPipeableStream` / `renderToReadableStream`) hydration smoke-test.

**Files touched.** 2-4 NEW files at chosen framework's convention paths.

**Acceptance gate.** Server-rendered HTML produced for `/` route + hydration completes without React 19 mismatch errors.

**Calibration class.** **PRODUCTION-SOURCE-EDIT** (chunk-axis BREAK expected) with sub-shape candidate **SSR-ENTRY-BOUNDARY** (1st data point; sister-shape constellation to PERF-LEVER-LAZY-LOAD at 7.10).

---

#### Task 8.8 — Per-route SSR opt-in

**Goal.** Public-facing routes (`/`, `/security`, `/?popup=`) SSR-enabled; admin-shell routes initially SPA-only (Vike per-page mode OR RR v7 framework-default SSR with audit). Surgical SSR application minimizes risk of admin-shell SSR-incompatibility blockers.

**Files touched.** Multiple route module files + possibly `+config.ts` files (Vike) OR route-module exports (RR v7).

**Calibration class.** **CONFIG-FILE-EDIT carry-over** OR **PRODUCTION-SOURCE-EDIT** depending on route module shape.

---

#### Task 8.9 — Hydration verification

**Goal.** React 19 hydration mismatch audit; instrument hydration boundaries; verify `Sidebar.tsx:228` `localStorage` cold-start seed is SSR-safe (defer to `useEffect` OR pre-seed via SSR-injected initial state).

**Files touched.** 1-3 source files + possibly NEW hydration-instrumentation utility.

**Acceptance gate.** Zero hydration mismatch warnings in chromium devtools across all routes; Lighthouse hydration timing within expected range.

**Calibration class.** **COMPONENT-FIX carry-over** OR **TEST-INFRA-FIX carry-over** depending on edit shape (extends Phase-7 15th class TEST-INFRA-FIX 1pt → 2pt cross-phase if applicable).

---

#### Task 8.10 — Progressive SSR rollout (OPTIONAL — may absorb into Block C)

**Goal.** Vike per-page mode conditional; surgical SSR application to additional admin-shell routes that empirically benefit. CONDITIONAL on 8.8 + 8.9 outcomes.

**Files touched.** Multiple `+config.ts` files (Vike) OR route-module exports (RR v7).

**Calibration class.** **CONFIG-FILE-EDIT carry-over.**

---

#### Task 8.11 — Prefetching / streaming optimization (OPTIONAL — may absorb into Block C)

**Goal.** Link prefetching + Suspense boundary streaming + asset preloading per chosen framework's primitives. CONDITIONAL on 8.8-8.10 outcomes.

**Files touched.** 1-3 component files (Link prefetch hints) + framework-specific config.

**🎯 Block B → Block C transition gate at 8.11 close per Cowork Verdict 5 LOCK.** Cowork verdict on whether Block B framework-adoption produced production-ready SSR-shell ready for empirical measurement.

**Calibration class.** **COMPONENT-FIX carry-over** OR **CONFIG-FILE-EDIT carry-over.**

---

### Block C — Empirical re-measurement + closer (4 items 8.12-8.15)

Block C closes Phase-8+ via empirical LCP re-measurement (Task 8.12 mirroring Phase-7 7.11 protocol) + conditional perf-lever stacking (8.13 conditional on 8.12 gap to v1 L228) + Phase-8+ closer narrative (8.14 CLOSURE-NARRATIVE-CONSOLIDATION 3rd cross-phase data point) + closer publishing + Phase-9+ transition signal lock (8.15).

#### Task 8.12 — LCP n=10 re-measurement (mirrors Phase-7 7.11 protocol byte-for-byte)

**Goal.** Empirical SSR-migration delta vs Phase-7 7.11 noise-floor baseline (LCP CV 2.29% / median 3,903 ms at HEAD-post-7.10). `LH_TASK_FIELD=phase8_task_8_12 LH_ROOT_RUNS=10 node Scripts/run_lighthouse_phase8.mjs` invocation per env-var-override discipline established at 7.11.

**Files touched.** NEW `Docs/Phase8_Perf_Report.md` (mirrors `Docs/Phase7_Perf_Report.md` byte-shape if exists OR `Docs/Phase6_Perf_Report.md`) + NEW `Docs/Baselines/2026-MM-DD_Phase8_task_8_12_perf_capture.json` raw + `Scripts/run_lighthouse_phase8.mjs` via `git mv` from `Scripts/run_lighthouse_phase7.mjs` per Phase-6 6.6 + 6.7 + Phase-7 7.11 MEASUREMENT-ONLY sub-shape `plus-script-rename` precedent.

**🎯 v1 L228 ≤500 ms LCP target reachability verdict at 8.12 close per Cowork Verdict 5 LOCK.** Per Cowork Verdict 3 LOCK 3rd outcome: (A) MET (v1 L228 ≤500 ms achieved); (B) STRUCTURALLY UNATTAINABLE refinement candidate (substantive engineering finding documenting why SSR-migration didn't reach target); (C) partial-MET (substantial LCP improvement crossing a tighter-than-current threshold but not reaching v1 L228 ≤500 ms; sister-shape to Phase-7 7.10 OUTCOME C partial-win pattern).

**Calibration class.** **MEASUREMENT-ONLY-with-source-rename carry-over (extends Phase-7 9pt → 10pt cross-phase; 10 sub-shapes if NEW sub-shape docked at 8.12).**

---

#### Task 8.13 — Perf-lever stacking (CONDITIONAL on 8.12 result; OPTIONAL — may absorb into closer)

**Goal.** If 8.12 reveals substantive gap to v1 L228 ≤500 ms, attempt lever stacking: SSR + React.lazy stacking (Phase-7 7.10 preserved) + per-page Vike-mode tuning (if Vike selected) + asset preloading depth. CONDITIONAL.

**Files touched.** TBD.

**Calibration class.** **PERF-LEVER-LAZY-LOAD carry-over** (extends Phase-7 14th class 1pt → 2pt cross-phase if applicable) OR NEW class candidate per PRE0 verdict.

---

#### Task 8.14 — Phase-8+ closer (CLOSURE-NARRATIVE-CONSOLIDATION 3rd cross-phase data point)

**Goal.** Sister-shape to `Docs/Phase6_Closure_Report.md` + `Docs/Phase7_Closure_Report.md`. Documents Phase-8+ engineering-finding catalog + cross-phase data points + GR-15 amendments + v1 L228 reachability verdict (MET vs STRUCTURALLY UNATTAINABLE refinement OR partial-MET per Cowork Verdict 3 LOCK 3rd outcome).

**Files touched.** NEW `Docs/Phase8_Closure_Report.md` (8-section template byte-shape-mirror; size driven by empirical-content-density per v2.60.6 §4g + v2.61.0 byte-count primary measure; expected ~300-400 lines / 60-80 KB based on Phase-6 + Phase-7 closer empirical precedents).

**Calibration class.** **CLOSURE-NARRATIVE-CONSOLIDATION carry-over (extends 2pt → 3pt cross-phase; class 3pt cross-phase fully calibrated at 3 data points — Phase-6 6.9 + Phase-7 closer + Phase-8+ closer).**

---

#### Task 8.15 — Closer publishing + Phase-9+ transition signal lock

**Goal.** Commits Phase-8+ closer; opens Phase-9+ kickoff pointer; locks v1 L228 verdict outcome trajectory; sister-shape to Phase-7 closer publishing at Task 7.14 + Phase-6 closer publishing at Task 6.9.

**Files touched.** Plan v2 (v2.NN final Phase-8+ amendment OPENING Phase-9+) + CLAUDE.md HEAD pointer pivot + Phase summary table Phase-8+ row at closure + Phase-9+ row at OPENING (if Phase-9+ scope locked at 8.15) + Calibration classes count.

**🎯 Phase-8+ → Phase-9+ transition signal at 8.15 close per Cowork Verdict 3 LOCK.** Binary v1 L228 MET-or-STRUCTURALLY-UNATTAINABLE-refinement-candidate OR 3rd partial-MET outcome documented in closer narrative + Phase-9+ priority recommendation locked.

**Calibration class.** **CLOSURE-NARRATIVE-CONSOLIDATION carry-over (8.14 + 8.15 form 2-step closure-publishing sub-arc; class continues at 3pt fully calibrated).**

---

## §5. Verification Matrix

| Check | Target | Evidence |
|---|---|---|
| `tsc -b` per task | exit 0 | paste output |
| `vitest run` per task | ≥259 baseline | paste output |
| Both `vite build` modes per task | exit 0 (Block A); framework-dependent (Block B; Vike + RR v7 preserve Vite; Next.js eliminated) | paste output |
| Production chunk byte-count tracked per task | break documented for production-source edits; preserved for non-production-source edits | per-task `wc -c` capture |
| Production chunk SHA256 tracked per task | break documented per task | per-task `shasum -a 256` capture |
| Smoke-test 4-spec cold-start | 12/12 chromium baseline (helpers/auth.ts 6.2 amendment) | playwright list-reporter output |
| Lighthouse re-measurement (Block C) | per-task acceptance; v1 L228 ≤500 ms LCP reachability verdict (MET vs STRUCTURALLY UNATTAINABLE refinement OR partial-MET per Cowork Verdict 3 LOCK) | `Docs/Phase8_Perf_Report.md` + `Docs/Baselines/2026-MM-DD_Phase8_task_8_12_perf_capture.json` |
| Hydration verification (Block B Task 8.9) | zero React 19 mismatch warnings | chromium devtools paste |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | paste output |
| Parity gate per PR | green | `gh run view` JSON (paths-filter quirk only for non-`qualia-shell/src/**` paths; Block B framework-adoption may RESET to auto-fire per Phase-7 7.1 + 7.10 + 7.13 precedents) |
| CodeRabbit review per PR | pass | review comment |
| 8 Cowork decision gates (per Task 8.1 §8.3) | each gate substrate documented + verdict locked | per-task PRE0 + per-block transition-gate narrative |
| `Docs/Phase8_Closure_Report.md` | committed at 8.14 close | file present |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-8-1 | Imperative-routing → declarative-routing migration breaks tenant + admin shell + popup branches | Med | High | 8.2 PRE0 mathematical-exactness signal (3-branch structurally preserved verification via Playwright direct URL navigation); rollback to HEAD-post-Phase-7 if smoke-test fails |
| R-8-2 | Provider-tree SSR audit reveals deeper SSR-incompatibility surfaces beyond 4 known providers | Med | Med | 8.3 PRE0 source-grep `window\|localStorage\|document` against full `src/context/` + `src/providers/` paths; absorb into 8.3 scope if found |
| R-8-3 | Chosen framework's React 19 compatibility claim fails empirical validation at Block B Task 8.7 entry boundary | Med | High | 8.7 hydration smoke-test as early-detection gate; revert to alternative framework (Vike ↔ RR v7) at 8.6 close if validation fails |
| R-8-4 | SSR-migration introduces hydration cost that re-bottlenecks LCP equivalent to pre-migration JS parse cost | Med | Med | 8.9 hydration verification + 8.12 LCP n=10 measurement as empirical gates; framework-specific hydration optimization at 8.10 + 8.11 |
| R-8-5 | TanStack Start stable 1.0 lands during Phase-8+ timeframe and Cowork retroactively chooses TanStack Start | Low | Low | Phase-9+ deferred-item per Cowork Q-D LOCK; Phase-8+ commits to Vike OR RR v7 verdict |
| R-8-6 | 17 Google Fonts eager-loading + SSR shifts CLS risk (font-swap before/after server-rendered HTML reaches paint) | Med | Med | 8.4 index.html template refactor re-evaluates Phase-7 Lever 1 cost-benefit under SSR architecture |
| R-8-7 | v1 L228 ≤500 ms LCP target STRUCTURALLY UNATTAINABLE even with SSR migration | Med | Med | Cowork Verdict 3 LOCK 3rd outcome partial-MET pre-acknowledged; closer narrative documents substantive engineering finding regardless of binary MET/UNATTAINABLE outcome |

---

## §7. Rollback Plan

Per task: `git revert` of the squash-merge commit. Phase-8+ has no schema / migration / fixture work. Block A production-source edits (8.2 imperative-routing + 8.3 provider audit + 8.4 index.html) are reversible without data state implications. Block B framework-adoption is the highest revert-complexity stage (chunk-graph rotations + dependency additions + entry boundary files); per-task revert is possible but Block B → Block C transition gate at 8.11 close locks substantive framework commitment. Block C measurement + closer narrative is purely additive.

---

## §8. Exit Gate

Phase 8+ is complete when:

1. All 15 tasks (8.1 ✓ OPENER + 8.2 / 8.3 / 8.4 / 8.5 / 8.6 / 8.7 / 8.8 / 8.9 / 8.10 / 8.11 / 8.12 / 8.13 / 8.14 / 8.15) merged to `main`.
2. v1 L228 ≤500 ms LCP target reachability verdict locked (MET / STRUCTURALLY UNATTAINABLE refinement / partial-MET per Cowork Verdict 3 LOCK 3rd outcome).
3. SSR-shell architecture committed (chosen framework integration; entry boundaries; per-route SSR opt-in; hydration verification clean).
4. Phase-7 perf carry-forward preservation verified (Vike OR RR v7 → `lazyWithReload` + `vite.config.ts` + env-vars all preserved; if Vike, per-page render-mode flexibility additionally available).
5. `Docs/Phase8_Closure_Report.md` committed (mirrors Phase-1 + Phase-3 + Phase-4 + Phase-5 + Phase-6 + Phase-7 single-closure-per-phase precedent; CLOSURE-NARRATIVE-CONSOLIDATION class data point #3 → 3pt cross-phase fully calibrating).
6. Plan v2.X (final Phase-8+ version) §9 main matrix Phase-8+ column header `R → ✓`.
7. 8 Cowork decision gates all locked + closure narratives committed.
8. Phase-9+ transition signal documented at closer §8 (priority recommendation + carry-forward enumeration).

---

## §9. Deliverables

- 1 source file (Task 8.2): `App.tsx` (imperative-routing → declarative-routing migration) + possibly NEW router-config file.
- 1-4 provider files (Task 8.3): `ThemeProvider` / `UserProvider` / `QueryProvider` / `PermissionsProvider` SSR-safety edits.
- 1-2 config files (Task 8.4): `index.html` template refactor + possibly NEW `head.ts` framework-agnostic export.
- 0-N source/config files (Task 8.5): static-data extraction (conditional).
- 1-3 config files (Task 8.6): chosen framework installation (`package.json` + framework config + minor `vite.config.ts` amendment).
- 2-4 NEW files (Task 8.7): framework-specific entry boundary files.
- Multiple route module files (Task 8.8): per-route SSR opt-in.
- 1-3 source files (Task 8.9): hydration verification edits + `Sidebar.tsx:228` localStorage shim if needed.
- 0-N files (Task 8.10 + 8.11): progressive SSR rollout + prefetching/streaming optimization (optional).
- NEW `Docs/Phase8_Perf_Report.md` (Task 8.12) + NEW `Docs/Baselines/2026-MM-DD_Phase8_task_8_12_perf_capture.json` + `Scripts/run_lighthouse_phase8.mjs` via `git mv`.
- 0-N files (Task 8.13): perf-lever stacking conditional.
- NEW `Docs/Phase8_Closure_Report.md` (Task 8.14; 8-section template; CLOSURE-NARRATIVE-CONSOLIDATION 3rd cross-phase data point).
- Final Plan v2.X amendment (Task 8.15) + CLAUDE.md HEAD pointer pivot to Phase-9+ OPENING.
- NEW `Docs/Phase8_Task_8_X_Completion_Report.md` × ~14 (one per task; some may use measurement-report-as-completion-report convention per Phase-6 Process Improvement #2; 8.12 in particular likely uses Phase8_Perf_Report.md as completion-report dual-purpose).

---

## §10. Timeline

| Task | Budget | Prereq | Can parallelize |
|---|:-:|---|:-:|
| 8.1 SSR architectural scoping (OPENER) | 0.5 day | Phase-7 closed | No (OPENING ceremony) |
| 8.2 Imperative-routing → declarative-routing | 1 day | 8.1 + Cowork framework verdict | No (Block A critical-path) |
| 8.3 Provider-tree SSR audit | 0.5 day | 8.2 | Yes (parallel to 8.4 + 8.5) |
| 8.4 index.html template refactor | 0.5 day | 8.2 | Yes (parallel to 8.3 + 8.5) |
| 8.5 Static-data extraction (conditional) | 0.5 day | 8.2 + PRE0 verdict | Yes (parallel to 8.3 + 8.4) |
| **Block A → Block B transition gate at 8.5 close** | — | 8.2 + 8.3 + 8.4 + 8.5 | — |
| 8.6 Framework installation + dependency audit | 1 day | Block A complete | No |
| 8.7 Entry boundary creation | 1.5 days | 8.6 | No |
| 8.8 Per-route SSR opt-in | 1 day | 8.7 | No |
| 8.9 Hydration verification | 1 day | 8.8 | No |
| 8.10 Progressive SSR rollout (optional) | 0.5-1 day | 8.9 | Yes (parallel to 8.11) |
| 8.11 Prefetching / streaming optimization (optional) | 0.5-1 day | 8.9 | Yes (parallel to 8.10) |
| **Block B → Block C transition gate at 8.11 close** | — | 8.6-8.11 | — |
| 8.12 LCP n=10 re-measurement | 0.5 day | Block B complete | No |
| 8.13 Perf-lever stacking (conditional) | 0.5-1 day | 8.12 | No |
| 8.14 Phase-8+ closer narrative | 0.5-1 day | 8.12 + 8.13 | No (sequential closure) |
| 8.15 Closer publishing + Phase-9+ transition signal | 0.25 day | 8.14 | No |
| Buffer | 2-3 days | — | — |
| **Total** | **8-12 days** | | |

---

## §11. Notes for executor

- Phase-8+ has no v1 plan source. Cite `Docs/Phase7_Closure_Report.md §8` 14-item carry-forward + `Docs/Phase8_SSR_Architectural_Scoping.md` (Task 8.1 deliverable) + this Phase_8_Plan.md as authoritative scope source per GR-14 (v2.32 amendment).
- Phase-7 deferred-items ledger consolidated at `Docs/Phase7_Closure_Report.md §8` carries 14 items in 3 blocks + 2 process improvements. Phase-8+ tasks should reference rather than re-enumerate.
- Calibration class shorthand at task level: prefer the umbrella **COMPONENT-FIX** for production-source edits at frontend altitude (8.2 + 8.3 + 8.9 likely). Resolve sub-classes only if Phase-8+ surfaces a third structurally-distinct production-source-edit shape that doesn't fit the umbrella.
- **NEW class candidates at Phase-8+:** SCOPING-ONLY (8.1 — 1pt; pending 2nd cross-phase data point for full calibration; project-wide 16th cumulative). SSR-MIGRATION-PREP (8.2 candidate; Cowork verdict at 8.2 PRE0 Q1 per v2.60.4 per-task NEW-class tracker discipline; 17th cumulative if confirmed). SSR-ENTRY-BOUNDARY (8.7 candidate; sub-shape of PRODUCTION-SOURCE-EDIT). FRAMEWORK-INSTALLATION (8.6 candidate; sub-shape of CONFIG-FILE-EDIT).
- **v2.60.1-v2.60.6 standing PRE-FLIGHT discipline absorbed at Phase-8+ OPENING per Cowork Q4 LOCK.** All 6 process-discipline checkpoints fire at each Phase-8+ task PRE0.
- **v2.61.0 byte-vs-line-count refinement absorbed at Phase-8+ OPENING.** Byte-count is the primary content-density measure; line-count is shape-dependent.
- **Path-filter quirk re-baseline at Phase-8+:** Tasks touching `qualia-shell/src/**` paths (8.2 + 8.3 + 8.7 + 8.8 + 8.9 likely) trigger parity-gate auto-fire on `pull_request` (no manual-dispatch). Tasks touching only paths outside the paths-filter (8.1 OPENER docs + 8.4 index.html at qualia-shell/-root + 8.6 framework config files outside `src/**` + 8.10 + 8.11 conditional + 8.12 + 8.13 + 8.14 + 8.15 doc/script) require manual-dispatch per established 18-task cross-phase precedent at 8.1 OPENER.
- **Sweep-resolution-precedent extending to 27+ cross-phase at Phase-8+ OPENING:** 8.1 sweep co-ships Phase-7 closer TBD → `cfa9d0f` / `#68` resolution (26 consecutive cross-phase sweep-resolutions); each subsequent task sweep extends the pattern.
- **8 Cowork decision gates institutionalized at Task 8.1 §8.3 per Cowork Verdict 5 LOCK.** 2 NEW Block-boundary transition-gates (Block A → Block B at 8.5 close; Block B → Block C at 8.11 close) institutionalize strategic-pivot discipline from Phase-7 7.9 close.

🧪
