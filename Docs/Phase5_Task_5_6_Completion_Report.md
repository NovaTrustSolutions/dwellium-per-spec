# Phase 5 — Task 5.6 Completion Report

**Task.** Perf validation — Lighthouse on 4 enriched detail pages per v1 plan L228 (Phase-5 NINTH task; **first of 2 PARALLEL BATCH B closures** per §19 dependency graph L596 `{5.3,5.4,5.5} → 5.6, 5.7 (parallel)`; chosen execution: **sequential within batch** mirroring Phase-5 PARALLEL BATCH A precedent of 3 sequential sweeps one per merge; **🚨 8th absolute SCOPE-COLLISION pattern catch (4th in Phase-5)** — Lighthouse infrastructure pre-existed at Phase 0.0 Task 0.0.7 era (`Scripts/run_lighthouse_baseline.mjs` 190 lines + `lighthouse@13.1.0` devDep + `chrome-launcher@1.2.1` + `Docs/Baselines/2026-04-21_Phase0_perf_baseline.json`); kickoff predicted FIRST data point but actual is FIRST formal Phase-5 data point with explicit acknowledgment of Phase-0 pre-formal-calibration era seeding; **MEASUREMENT-ONLY class — Phase-5 6th distinct in-repo class; project-wide 9th cumulative class**; **🚨 v1 L228 thresholds blown through** captured as PASS/FAIL findings (root LCP 4653ms vs ≤500ms / a11y 90 vs ≥95 / CLS 0.000 PASSES); future-Phase-N decision deferred (tuning arc OR deliberate spec amendment); **BOTH invariance axes PRESERVED** — SHA256 stays at `1ab4a9c…14ea` (6-of-6 since 5.1c break) + byte-count stays at 1,031,260 → **16-of-16 cross-phase byte-count invariance milestone**; **🎯 chunk-graph isolation STRUCTURAL LAW extends 4pt → 5pt** (5.2 MSW + 5.3 Playwright config + 5.4 spec + 5.5 spec + 5.6 script) — Scripts/ stays outside chunk graph; pattern fully cemented for Phase-5 closer (5.7).

**Squash SHA.** `3a71364` (PR #42). Closed 2026-05-04.

**Sources.**
- NEW `Scripts/run_lighthouse_phase5.mjs` (~325 lines): Playwright + chrome-launcher + lighthouse + axe-core orchestration; reuses Tasks 5.4/5.5 navigation patterns; localStorage seeding for cold-start sidebar widget visibility
- NEW `Docs/Phase5_Perf_Report.md` (per v1 L228 verbatim filename; 8-section analyzed report)
- NEW `Docs/Baselines/2026-05-04_Phase5_perf_capture.json` (raw measurement data)

Per parent Plan v2 §9 row 5.6 (canonical per OPTION B resolution + GR-14 amendment v2.32) verbatim from v1 plan L228: *"Run Lighthouse on the 4 enriched detail pages. Assert LCP ≤ 500ms, CLS ≤ 0.1, a11y score ≥ 95. Commit numbers to `Docs/Phase5_Perf_Report.md`."*

**Plan v2 anchor.** Plan v2.34 (Changelog `v2.34 (2026-05-04)` entry — added at post-merge sweep; **MEASUREMENT-ONLY class FIRST formal Phase-5 data point** captured + **16-of-16 byte-count milestone** enumerated + **8th absolute SCOPE-COLLISION pattern catch (4th in Phase-5)** logged + **chunk-graph isolation STRUCTURAL LAW extended 4pt → 5pt** + **v1 L228 threshold drift** captured as PASS/FAIL findings + **PARALLEL BATCH B 1-of-2 closures landed** annotation).

---

## §1. Scope + DoR + 5-DC ledger (5 enumerated → 3 layered SCOPE-COLLISION findings + clean Path A confirmation) + scope-narrowing context

### Scope-narrowing context (kickoff predicted 3 path forks → DC-A surfaced 3 layered SCOPE-COLLISION findings; Path A retained with adjusted methodology)

Kickoff prompt scoped Task 5.6 across three path forks:

| Fork | Scope | Predicted byte-count drift | ETA |
|---|---|---|---|
| **Path A — MEASUREMENT-ONLY class FIRST data point** (PRIMARY; chosen with adjustment) | NEW `Scripts/run_lighthouse_phase5.mjs` + NEW `Docs/Phase5_Perf_Report.md` artifact + NEW raw capture JSON; standalone measurement run | +0 / 1,031,260 preserved → 16-of-16 | 60-90 min |
| Path B — MEASUREMENT-ONLY-WITH-CI-GATE | Adds CI workflow with Lighthouse threshold gating | larger scope; possible chunk drift if workflow adds parity-paths | 90-120 min |
| Path C — SCOPE-COLLISION CATCH if URL-routing absent | Path B-equivalent intent-preserving navigation | +0 / preserved | 60-90 min |

PRE0 DC-A 5-query Lighthouse-locus discovery confirmed **3 layered SCOPE-COLLISION findings**:
1. Lighthouse infrastructure pre-existed at Phase-0 Task 0.0.7 era (Q1 HIT) → class designation adjusted from "FIRST data point" to "FIRST formal Phase-5 data point with explicit acknowledgment of Phase-0 pre-formal-calibration era seeding".
2. SPA-only navigation constraint: 4 enriched detail pages NOT addressable as standalone URLs (Q3 HIT; App.tsx zero React Router patterns) → measurement strategy adjusted to hybrid Lighthouse-root + Playwright-driven-per-page-Web-Vitals + axe-core-per-page.
3. Phase-0 baseline already empirically established LCP=4653ms vs v1 ≤500ms target (~9.3× over) + a11y=0.90 vs ≥95 → THRESHOLD-DRIFT confirmation captured as PASS/FAIL findings (NOT blocking gate); future-Phase-N decision deferred.

User-confirmed Path A (re-issued as GO) with 5 explicit decisions (kickoff §5 enumeration):
1. Path commitment: **Path A** (Playwright-driven per-page Lighthouse + hybrid root run)
2. Threshold-drift handling: **PASS/FAIL findings only** (not tuning work scope; not spec amendment at task level)
3. Class designation: **MEASUREMENT-ONLY class FIRST formal Phase-5 data point** with Phase-0 acknowledgment
4. Script structure: **NEW Scripts/run_lighthouse_phase5.mjs** (preserves Phase-0 baseline script as historical artifact)
5. Manual vs CI: **manual run + results captured into report** (CI integration deferred to Phase-6+)

### Scope (per v1 plan L228 + parent Plan v2 §9 row 5.6 + v2.34 §9 sub-tracker, Path A MEASUREMENT-ONLY FIRST formal data point)

**Calibration class:** **MEASUREMENT-ONLY (NEW; Phase-5 6th distinct in-repo class; project-wide 9th cumulative class)**. Structurally distinct from prior 8 in-repo classes by introducing perf measurement orchestration (Lighthouse navigation run + Playwright-driven SPA navigation + PerformanceObserver Web Vitals + axe-core a11y enumeration) + report-only artifact output. Phase-0 Task 0.0.7 seeded the infrastructure; Phase-5 Task 5.6 is the FIRST formal calibration data point (calibration framework was introduced at Phase-4 era after Task 0.0.7).

| ID | Deliverable | Status |
|---|---|:-:|
| D-1 | NEW `Scripts/run_lighthouse_phase5.mjs` (~325 lines): Lighthouse navigation run on root via chrome-launcher + Playwright-driven SPA navigation through 4 detail pages + PerformanceObserver Web Vitals + @axe-core/playwright a11y audit per page; localStorage pre-seeding for sidebar widget cold-start visibility | ✅ |
| D-2 | NEW `Docs/Phase5_Perf_Report.md` (per v1 L228 verbatim filename; 8-section analyzed report with v1 L228 PASS/FAIL matrix + methodology + per-page violations + reproducibility notes + threshold-drift findings) | ✅ |
| D-3 | NEW `Docs/Baselines/2026-05-04_Phase5_perf_capture.json` (raw measurement data) | ✅ |
| D-4 | NO source changes to: `packages/types/index.ts` / `strataApi.{static,backend,ts}` runtime code (Task 5.1c X-Qualia-API: v2 emission preserved) / fixtures / unit tests / existing 11 e2e specs / Playwright config (Task 5.3 dual-project preserved verbatim) / `package.json` (all deps already present from Phase-0 era: lighthouse@13.1.0 + chrome-launcher@1.2.1 + @playwright/test@^1.52.0 + @axe-core/playwright@4.11.2) | ✅ |
| D-5 | NO existing-test invariant relaxations | ✅ |
| D-6 | Phase-5 ninth-task 3-file sweep at post-merge (CLAUDE.md + Plan v2.34 + this report; NO Phase-5 closure file yet — closure deferred to Task 5.7 sweep per single-closure-per-phase precedent) | ✅ (sweep) |
| D-7 | Plan v2.34 §9 Phase-5 sub-tracker row 5.6 R → ✓ + Changelog v2.34 + Appendix D NEW row for `Scripts/run_lighthouse_phase5.mjs` + `Docs/Phase5_Perf_Report.md` + `Docs/Baselines/2026-05-04_Phase5_perf_capture.json` | ✅ (sweep) |

### 5-DC enumeration → 5 actuals (3 layered SCOPE-COLLISION findings; Path A retained with methodology adjustment)

| # | DC | Finding | Action |
|---|---|---|:--|
| 1 | DC-A (1) Lighthouse infrastructure | **🚨 PRE-EXISTED at Phase-0 Task 0.0.7 era** — `lighthouse@13.1.0` direct devDep at qualia-shell/package.json:46; `chrome-launcher@1.2.1` direct devDep at L44; `Scripts/run_lighthouse_baseline.mjs` 190 lines; 2 Phase-0 baseline JSONs in `Docs/Baselines/`. **8th absolute SCOPE-COLLISION pattern catch (4th in Phase-5)**. Action: class designation adjusted to "FIRST formal Phase-5 data point with Phase-0 acknowledgment"; new script created to preserve Phase-0 baseline script as historical artifact (acted; §7 entry 1) |
| 2 | DC-A (2) Phase5_Perf_Report.md | ABSENT (NEW artifact target). Action: written from raw capture (acted) |
| 3 | DC-A (3) 4 enriched detail pages URL-routing | **🚨 NOT URL-addressable** — `qualia-shell/src/App.tsx` (225 lines) has ZERO React Router patterns / Routes / path= / useNavigate / BrowserRouter. **Phase-0 baseline script JSDoc explicitly forecasted this** ("Strata modules are React-state-driven (not URL-addressable), so Lighthouse's standalone run model cannot traverse them. Per-module perf is captured separately via Playwright's performance.getEntries()..."). Action: hybrid measurement strategy adopted — Lighthouse navigation run on root only + Playwright-driven SPA navigation + PerformanceObserver per-page Web Vitals + axe-core per-page a11y enumeration (acted; §7 entry 4) |
| 4 | DC-A (4) Existing perf scripts in src/Scripts | `Scripts/run_lighthouse_baseline.mjs` exists (Q1); 0 web-vitals/getLCP/getCLS hits in `qualia-shell/src` (greenfield consumer-side perf measurement). Action: Web Vitals capture implemented in script via PerformanceObserver + getEntriesByType('paint') (acted) |
| 5 | DC-A (5) CI integration | 0 lighthouse/perf-gate workflow hits in `.github/workflows/`. Action: CI integration deferred to Phase-6+ scope per user decision #5 (acted) |

**🎯 EMERGENT post-DC finding — existing e2e feature specs cold-start failure mode**: while debugging the measurement script's navigation, ran existing `e2e/strata-nav.spec.ts` directly: 12 of 12 tests FAIL locally because `Property Management` widget group is collapsed by default in Sidebar (Sidebar.tsx:226-232 — empty `expandedGroups` Set on cold-start; persisted to localStorage so subsequent runs after manual expansion would pass). CI uses `playwright.baseline.config.ts` with `testMatch: ['screenshot-baseline.spec.ts', 'axe-baseline.spec.ts']` — feature specs (`strata-nav.spec.ts`, `appfolio-parity-workorder.spec.ts` from Task 5.4, `appfolio-parity-vendor-compliance.spec.ts` from Task 5.5) are OUT of CI scope and were never verified to run green in cold-start. Forward-defensive finding captured §7 entry 4 with mitigation options: (a) seed `qualia_sidebar_groups` localStorage in `helpers/auth.ts::loginAs`; (b) add `globalSetup` to `playwright.config.ts`; (c) defer to Task 5.7 (a11y validation will encounter the same constraint). Task 5.6 script applies (a) inline via `page.evaluate` + `localStorage.setItem` + `page.reload()` to unblock measurement.

**🎯 EMERGENT post-DC finding — per-page LCP/FCP not measurable for SPA-internal nav** without architecture changes (React Router + URL-addressable detail pages). PerformanceObserver's `largest-contentful-paint` event fires ONCE on initial document load; SPA-internal route changes do NOT generate new LCP/FCP entries (browser-API limitation, not a script bug). Reported per-page LCP=40ms / FCP=20ms values are SPA-shell initial-paint approximations, NOT per-page nav metrics. Methodology caveat documented in `Docs/Phase5_Perf_Report.md §3` with three remediation options for future-Phase-N. CLS captured per-page IS meaningful (layout-shift events DO fire during SPA-internal re-render; all 4 pages reported CLS=0.000 PASSES v1 ≤0.1). Action: caveat documented in report (acted; §7 entry 5).

### DoR (Definition of Ready) — verbatim

- ✅ Scope-class confirmed via DC-A (MEASUREMENT-ONLY class FIRST formal Phase-5 data point with Phase-0 Task 0.0.7 acknowledgment; Path A hybrid Lighthouse-root + Playwright-per-page methodology)
- ✅ GR-checks: GR-1 backward compat preserved (script + report are additive; no source-code changes) / GR-2 no schema change / GR-5 no runtime-code edits to `strataApi.backend.ts` / GR-7 strict (no PII; report uses already-sanitized entity names from data fixtures + measurement metrics) / GR-13 no observability surface modified
- ✅ **GR-14 (standing PRE-FLIGHT at v2.29; AMENDED at v2.32)** — `Docs/Phases/Phase_5_Plan.md` L160-end scope DEPRECATED at v2.32; parent Plan v2 §9 row 5.6 used as canonical spec per OPTION B resolution at Task 5.3 sweep + GR-14 amendment ("when phase-spec CONTRADICTS parent vs refines, parent + v1-lineage wins")
- ✅ Test surface: vitest 259 → 259 (+0; perf measurement separate from unit tests); ZERO existing-test invariant relaxations; ZERO source-file edits beyond NEW script + NEW report + NEW raw JSON
- ✅ Module-graph drift: PREDICTED 0 bytes (Scripts/ stays outside chunk graph per chunk-graph isolation STRUCTURAL LAW); pre-edit chunk SHA `1ab4a9c…14ea` captured; post-edit verified UNCHANGED on both build modes — STRUCTURAL LAW extends 4pt → 5pt (5.2 MSW + 5.3 Playwright config + 5.4 spec + 5.5 spec + 5.6 script)
- ✅ Plan v2 surgery: §9 row 5.6 R → ✓ + Changelog v2.34 + Appendix D NEW rows + pending-row narrative narrows 2 → 1 + PARALLEL BATCH B 1-of-2 closures annotation
- ✅ Test design: 0 new vitest tests (MEASUREMENT-ONLY class is exempt from per-task vitest contract; measurement is run-on-demand artifact generation); measurement run reproducible per `Docs/Phase5_Perf_Report.md §5`

---

## §2. Strict-gate output (captured pre-merge on PR-branch HEAD `d4abaf5`)

```
2026-05-04T02:53:00Z
$ cd qualia-shell && npx tsc -b
[exit: 0 — zero output]

$ npx vitest run

 Test Files  37 passed (37)
      Tests  259 passed (259)
   Start at  22:53:15
   Duration  4.46s

[exit: 0]

2026-05-04T02:51:00Z [pre-edit verification — production-mode build]
$ rm -rf dist && VITE_APPFOLIO_SEEDS=true npx vite build
✓ built in 5.19s
[exit: 0]
$ shasum -a 256 dist/assets/StrataDashboard-COZxJ8Bh.js
1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea  dist/assets/StrataDashboard-COZxJ8Bh.js
$ wc -c dist/assets/StrataDashboard-COZxJ8Bh.js
 1031260 dist/assets/StrataDashboard-COZxJ8Bh.js

2026-05-04T02:50:00Z [measurement build — VITE_USE_STATIC_API=true; transient; not committed to main]
$ rm -rf dist && VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build
✓ built in 5.31s
[exit: 0]
$ shasum -a 256 dist/assets/StrataDashboard-DDW20uGT.js
7658e3391add0c86a97cd4c7d7cb7f4b39d7e72ee931f9e437447557395b61b7  dist/assets/StrataDashboard-DDW20uGT.js
$ wc -c dist/assets/StrataDashboard-DDW20uGT.js
 1030601 dist/assets/StrataDashboard-DDW20uGT.js
[NOTE: This static-mode build is INTERNAL to the measurement process; NOT committed to main. The default-mode build (no VITE_USE_STATIC_API set) is what's tested below for chunk invariance.]

2026-05-04T02:53:30Z [post-edit verification — production-mode SEEDS=true]
$ rm -rf dist && VITE_APPFOLIO_SEEDS=true npx vite build
✓ built in 5.19s
[exit: 0]
$ shasum -a 256 dist/assets/StrataDashboard-COZxJ8Bh.js
1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea  dist/assets/StrataDashboard-COZxJ8Bh.js
$ wc -c dist/assets/StrataDashboard-COZxJ8Bh.js
 1031260 dist/assets/StrataDashboard-COZxJ8Bh.js

2026-05-04T02:54:00Z [post-edit verification — production-mode SEEDS=false]
$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ built in 5.35s
[exit: 0]
$ shasum -a 256 dist/assets/StrataDashboard-COZxJ8Bh.js
1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea  dist/assets/StrataDashboard-COZxJ8Bh.js
$ wc -c dist/assets/StrataDashboard-COZxJ8Bh.js
 1031260 dist/assets/StrataDashboard-COZxJ8Bh.js

2026-05-04T02:54:30Z
$ node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1669ms total).
```

**Module-graph drift: BOTH invariance axes PRESERVED (production-mode default)**

- **Filename**: `COZxJ8Bh.js` UNCHANGED across both build modes (no content-hash rotation; mirrors Tasks 5.1c/5.1d/5.2/5.3/5.4/5.5 post-break filename — seven-task streak)
- **SHA256**: `1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea` UNCHANGED across both build modes (extends 5-of-5 since 5.1c break to **6-of-6**)
- **Byte-count**: `1,031,260` UNCHANGED across both build modes (extends 15-of-15 cross-phase to **16-of-16 cross-phase byte-count invariance milestone**)
- **Intra-task cross-mode invariance preserved**: =true and =false builds both produce identical SHA + byte-count (`Scripts/run_lighthouse_phase5.mjs` is outside the Vite project root + entry-graph; doesn't reach the production chunk)

**Measurement-mode build note** (TRANSIENT; not committed): the `VITE_USE_STATIC_API=true` build produces a different chunk (`DDW20uGT.js / 1,030,601` bytes / SHA `7658e339…b1b7`) because the static-API codepath is selected via `import.meta.env.VITE_USE_STATIC_API` at build time (Vite inlines the env var). This measurement-mode build is INTERNAL to the perf measurement process; the default-mode chunk (`COZxJ8Bh.js / 1,031,260 / 1ab4a9c…14ea`) is what ships and what's tracked for invariance.

**🎯 Chunk-graph isolation STRUCTURAL LAW extends 4pt → 5pt** (5.2 MSW + 5.3 Playwright config + 5.4 spec + 5.5 spec + 5.6 script). Five different test-tooling / measurement-tooling addition shapes — Node-side test framework dep + test-file additions (5.2) / Playwright config refactor + env-var annotation (5.3) / new e2e spec file (5.4) / new e2e spec file (5.5) / new measurement orchestration script + report artifact + raw JSON (5.6) — all produce 0 production-chunk drift. Pattern is now empirically validated at 5 data points: **Scripts/ files + e2e specs + tests + Playwright config + .env config files all stay outside the Vite production entry graph**. Predictive value for Phase-5 closer (5.7): a11y measurement run + report artifact will preserve chunk invariance (predicted 17-of-17 byte-count + 7-of-7 SHA256).

---

## §3. CDP render proof

**No CDP probe required for Task 5.6 in the conventional sense.** Task 5.6 IS the perf measurement — the script's per-page navigation IS the equivalent of a CDP probe (driven via Playwright/CDP under the hood). Verification surface entirely fetch-side / build-side / measurement-side: chunk SHA256 + byte-count + filename capture across both build modes (production-mode default; measurement-mode transient); vitest pass count 259/259 confirms test-side correctness unchanged; Lighthouse navigation run on root + Playwright-driven SPA navigation + PerformanceObserver per-page Web Vitals + axe-core per-page a11y audit all completed end-to-end (4-of-4 detail pages captured; root captured); raw data at `Docs/Baselines/2026-05-04_Phase5_perf_capture.json`; analyzed report at `Docs/Phase5_Perf_Report.md`.

**Cross-phase regression-clean evidence preserved at this commit** — all Phase-4 + Phase-5 prior-task absorptions verified intact post-Task-5.6-merge:

- Task 4.1: properties.json 37 rows ✅
- Task 4.2: entities.json 3562 rows ✅
- Task 4.3: 2-STORY bridge intact ✅ (verified directly during measurement — DC-A query 2 + Brianna tenant nav)
- Task 4.4: workitems.json 1165 rows ✅
- Task 4.5: Jamel D. Brown lease at status='pending_countersign' ✅
- Task 4.6: compliance.json 16 rows + Duke Energy warranty ✅ + 2-STORY 6-row vendor compliance subset for `appfolio-v-2716` intact ✅
- Task 4.7: .env.example L8 comment intact ✅
- Task 5.1a: strataTypes.ts JSDoc header refresh intact ✅
- Task 5.1b: serialization.test.ts (366 lines / 5 it-blocks) intact ✅
- Task 5.1c: strataApi.backend.ts +2 lines + .env.example +8 lines + strataApi.test.ts +37 lines intact ✅
- Task 5.1d: strataApi.backend.ts JSDoc header +5 lines intact ✅
- Task 5.2: real-vs-static-api.test.ts NEW (428 lines / 28 it-blocks) intact ✅; msw@2.14.2 devDep intact ✅
- Task 5.3: playwright.config.ts dual-project + env-gated webServer intact ✅; .env.example E2E_TARGET annotation intact ✅
- Task 5.4: appfolio-parity-workorder.spec.ts NEW (172 lines / 1 it-block / 2 tests across both projects) intact ✅
- Task 5.5: appfolio-parity-vendor-compliance.spec.ts NEW (147 lines / 1 it-block / 2 tests across both projects) intact ✅
- **Task 5.6: run_lighthouse_phase5.mjs NEW (~325 lines) + Phase5_Perf_Report.md NEW + 2026-05-04_Phase5_perf_capture.json NEW raw data ✅; chunk SHA + filename + byte-count all unchanged in production-mode build ✅**

No Phase-5-task-5-6 baseline screenshot directory created (`Docs/Baselines/phase_5_task_5_6/` would be empty — the measurement artifact `2026-05-04_Phase5_perf_capture.json` IS the baseline data; per-page screenshots not part of v1 L228 deliverable scope).

---

## §4. /security-review

**Result.** High=0, Medium=0. Task 5.6's surface is 3 NEW files (script + report + raw JSON). No new code paths in production code. No new data exposed. **No new dependencies** (lighthouse@13.1.0 / chrome-launcher@1.2.1 / @playwright/test@^1.52.0 / @axe-core/playwright@4.11.2 all pre-existed from Phase-0 era). No schema changes. No fixture changes. No `strataApi.backend.ts` runtime-code changes. The script uses an inline-replicated login flow (helpers/auth.ts is TS; can't be imported into Node ESM without compilation) with the same hardcoded gate passphrase from `helpers/auth.ts:GATE_PASSPHRASE` (`'Comet2878!'`) — **identical credential surface as existing e2e specs**, no new credential exposure. The script's text references entity names from data fixtures (data-canonical: "128 Buena Vista Dr N" / "2-STORY TECHNICAL ROOFING LLC" / "Brianna Jackson" / "Fire alarm needs replaced") — all already PII-clean per Phase-1 absorption discipline. The report contains LCP/FCP/CLS/a11y measurement values + axe-core violation help text (e.g., "Buttons must have discernible text"); no PII; no production secrets. GR-5 (real-backend logic unchanged) preserved by construction. GR-7 (PII discipline) preserved by construction. GR-14 (phase-plan locality at v2.29; AMENDED at v2.32) honored — `Phase_5_Plan.md` L160-end scope DEPRECATED per OPTION B resolution at Task 5.3 sweep; parent Plan v2 §9 row 5.6 used as canonical spec.

---

## §5. Verification matrix snapshot (Phase-5 NINTH task; column header remains `R` until Task 5.7 closure)

Per Plan v2.34 §9 main matrix, Phase-5 column **remains `R`** (Phase-5 column header flips `R` → `✓` only at Task 5.7 closure per single-closure-per-phase precedent). Task 5.6 per-row proofs — Phase-5 sub-tracker row 5.6 flipped `R` → `✓` at this commit:

| Row | Task 5.6 cell | Proof |
|---|:-:|---|
| `tsc -b` errors =0 | ✓ | §2 (exit 0) |
| `vitest run` failures ≤B | ✓ | §2 (259/259 passed; +0 vs Task 5.5 baseline 259) |
| `vitest run` new-test count ≥ tasks-in-phase | (cumulative tracking) | +0 vitest at 5.6 (MEASUREMENT-ONLY class is exempt from per-task vitest contract); cumulative Phase-5 new-test count = 0+5+2+0+28+0+0+0+0 = **35**; mandate satisfied progressively |
| `playwright test` failures ≤B | ✓ | `continue-on-error: true` per CLAUDE.md L29 deferred-item discipline; CI uses `playwright.baseline.config.ts` (separate from default `playwright.config.ts`); the 9 reported failures in CI run `25298728473` are all in pre-existing axe-baseline + screenshot-baseline specs (Linux-snapshot-deferred per CLAUDE.md L25), NOT new specs (Task 5.6 added zero specs) |
| `vite build` errors =0 | ✓ | §2 (chunk SHA `1ab4a9c…14ea` UNCHANGED; chunk filename `COZxJ8Bh.js` UNCHANGED; chunk byte-count 1,031,260 UNCHANGED) |
| `VITE_APPFOLIO_SEEDS=false vite build` functional | ✓ | §2 (chunk SHA byte-identical to =true build) |
| PII-leak scan passes | ✓ | §2 (51 files / 0 leaks total) |
| Manual dev-server smoke | (n/a) | No UI surface changes for measurement-script-only edit; chunk byte-count + SHA + filename invariance confirms no runtime regression possible |
| Screenshots in phase report | (n/a) | No UI render changes; per-page measurement IS the verification surface |
| axe-core violations ≤B on modified pages | (informational) | Phase 0.0 baselines hold (no render-layer changes from this task); per-page axe violations DOCUMENTED in `Docs/Phase5_Perf_Report.md §4` as carry-forward to Task 5.7; v1 L230 ZERO WCAG AA target failure deferred to future-Phase-N decision |
| Lighthouse LCP ≤ max(B, 500ms) | (informational; v1 L228 captured as PASS/FAIL findings) | Root LCP 4653ms vs ≤500ms target FAILS by ~9.3×; matches Phase-0 baseline 4653ms (no regression from enrichment); chunk SHA + byte-count UNCHANGED → perf delta from this task is provably 0 |
| Pasted command output in PR | ✓ | PR #42 description + §2 of this report |
| Rollback SHA documented | ✓ | §6 |
| /security-review clean (High/Medium) | ✓ | §4 |
| CI green on branch | ✓ | PR-branch parity-gate `25298728473` (manual-dispatched per paths-filter quirk; success ~6m54s) + PII Scan `25298727147` (auto-fired on `pull_request`; success 22s) on `d4abaf5` |
| Completion Report committed | ✓ | This report at sweep |

---

## §6. Rollback SHA

**Pre-task baseline (Task 5.5 sweep HEAD):** `06755a3` (`chore(phase-5): post-Task-5.5 sweep — CLAUDE.md + plan v2.33 + Phase5_Task_5_5_Completion_Report.md`).

**Task 5.6 squash SHA:** `3a71364` (`feat(phase-5): Task 5.6 — Perf validation Lighthouse (#42)`).

**Rollback procedure (if Phase-5+ surfaces a regression attributable to Task 5.6):** `git revert 3a71364` cleanly removes the new script + report + raw capture. Zero production-chunk impact since the change has zero functional surface (chunk SHA + byte-count + filename all unchanged pre/post). Local `node Scripts/run_lighthouse_phase5.mjs` reverts to "command not found"; `Scripts/run_lighthouse_baseline.mjs` (Phase-0 era) remains intact for root URL measurement. The reverted state is structurally identical to the pre-merge state on every observable axis except (a) the new script + report + raw JSON files (deleted by revert).

---

## §7. Deferred items (5 entries)

1. **🚨 8th absolute SCOPE-COLLISION pattern catch (4th in Phase-5) — Lighthouse infrastructure pre-existed at Phase-0 Task 0.0.7 era.** Pattern series: 4.3 (Task 4.6 forward-collision finding) / 4.5 (greenfield-class morning-halt) / 4.6 (source-provenance correction) / 4.7 (flag-default-already-done) / 5.1a (cross-repo backend partition) / 5.1d (Phase_5_Plan.md missed) / 5.4 (Residents → Work Orders tab structurally absent) / **5.6 (Lighthouse infrastructure pre-existed)**. **META-OBSERVATION**: catch rate stable post-Phase-3 at 8 catches across 15 tasks closing in series 4.1 → 5.6; the discipline is **mission-accomplished, NOT signal-of-process-failure**. DC-A pre-flight Step Zero source-provenance verification (PERMANENT process change at Phase-4-closure §4 + GR-14 elevation at v2.29 + GR-14 amendment at v2.32) is doing exactly what it was elevated to do. Task 5.6's specific catch: kickoff predicted "FIRST data point" but actual is "FIRST FORMAL Phase-5 data point with explicit acknowledgment of Phase-0 Task 0.0.7 pre-formal-calibration era seeding". Phase-0 Task 0.0.7 (2026-04-21) shipped Scripts/run_lighthouse_baseline.mjs (190 lines) + lighthouse@13.1.0 devDep + chrome-launcher@1.2.1 devDep + 2 baseline JSONs in Docs/Baselines/. All Phase-5 Task 5.6 needed was incremental scope (Playwright per-page + axe + report artifact at v1 L228 verbatim filename) — NOT greenfield infrastructure.

2. **MEASUREMENT-ONLY class FIRST formal Phase-5 data point — Phase-5 6th distinct in-repo class; project-wide 9th cumulative class.** Structurally distinct from prior 8 in-repo classes (NEAR-NULL-OP carry-over / CONSUMER-SIDE-CONTRACT-TEST / CONSUMER-SIDE-FETCH-WRAPPER / MSW-CONTRACT-TEST / E2E-PLAYWRIGHT + Phase-4's pure FIXTURE-CLASS / FIXTURE-CLASS+SCHEMA hybrid / NEAR-NULL-OP) by introducing perf measurement orchestration (Lighthouse navigation run + Playwright-driven SPA navigation + PerformanceObserver Web Vitals + axe-core a11y enumeration) + report-only artifact output. Phase-0 Task 0.0.7 seeded the infrastructure; Phase-5 Task 5.6 is the FIRST FORMAL calibration data point. **Carry-forward for Task 5.7** (Accessibility validation per parent §9 row 5.7 + v1 plan L230): predicted MEASUREMENT-ONLY 2nd data point (carry-over); script structure can be derived from `Scripts/run_lighthouse_phase5.mjs` Playwright navigation pattern; @axe-core/playwright already integrated; a11y report at `Docs/Phase5_A11y_Report.md` likely. **Phase-5 closure** lands at Task 5.7 sweep per single-closure-per-phase precedent.

3. **🚨 v1 L228 thresholds blown through — captured as PASS/FAIL findings; future-Phase-N decision deferred.** v1 L228 verbatim: LCP ≤ 500ms / CLS ≤ 0.1 / a11y ≥ 95. Measured (production-realistic Phase-5-enriched build):
   - **LCP**: ROOT 4653ms vs ≤500ms target → FAIL by ~9.3× (matches Phase-0 baseline; no regression from enrichment; SPA shell render dominates). Per-page LCP not measurable for SPA-internal nav (browser API limitation).
   - **CLS**: 0.000 across root + all 4 pages → PASS at all levels (only v1 L228 threshold passing).
   - **a11y**: ROOT 90/100 vs ≥95 target → FAIL by 5pts. Per-page axe-core enumeration: 13 distinct violations across 5 rule IDs / 362 violating nodes (button-name × 338 / color-contrast × 8 / aria-valid-attr-value × 10 / scrollable-region-focusable × 2 / select-name × 4). Brianna tenant page has 334 button-name nodes (every tenant row icon button missing aria-label).

   Future-Phase-N options (deferred per user decision #2 — "PASS/FAIL findings only, not tuning work scope, not spec amendment at task level"):
   - **(a) Tuning arc as Phase-6 (or "Phase-5.5")**: code-splitting beyond manualChunks / lazy-loading routes / SSR shell / CDN edge caching / a11y remediation pass on tenant rows + vendor selects + ARIA-attribute fixes. Significant FEATURE-CLASS scope.
   - **(b) Deliberate v1 spec amendment**: adjust L228 to SPA-realistic targets (e.g., LCP ≤ 5000ms / a11y ≥ 90 / WCAG AA violations ≤ N) based on measured baseline + remediation roadmap. Cleaner closure for Phase-5 but commits to lower targets.

   Recommendation surface to product/engineering leadership at Phase-5 closure decision point (after Task 5.7 closes).

4. **🎯 SPA-only navigation constraint + forward-defensive finding — existing e2e feature specs cold-start failure mode.** Two layered findings:
   - **a) The 4 enriched detail pages are NOT URL-addressable** (`qualia-shell/src/App.tsx` 225 lines / zero React Router). Phase-0 Task 0.0.7 baseline script JSDoc explicitly forecasted: "Strata modules are React-state-driven (not URL-addressable), so Lighthouse's standalone run model cannot traverse them." Per-page LCP/FCP measurement requires architecture changes (React Router + URL-addressable routes) OR application-code instrumentation (performance.mark in render paths) OR Lighthouse `timespan` mode wrapped around SPA-internal navigation (TBT + CLS captured but LCP/FCP still browser-API-blocked). All three are FEATURE-CLASS scope deferred to future-Phase-N or Task 5.7-adjacent tuning arc.
   - **b) Existing e2e feature specs all FAIL in cold-start locally** (verified: `npx playwright test e2e/strata-nav.spec.ts` → 12-of-12 fail). Root cause: `Sidebar.tsx:226-232` — `expandedGroups` defaults to empty Set; `qualia_sidebar_groups` localStorage backing means subsequent runs after manual expansion would pass. CI uses `playwright.baseline.config.ts` with `testMatch: ['screenshot-baseline.spec.ts', 'axe-baseline.spec.ts']` — feature specs (`strata-nav.spec.ts`, Task 5.4 `appfolio-parity-workorder.spec.ts`, Task 5.5 `appfolio-parity-vendor-compliance.spec.ts`) are OUT of CI scope and were never verified to run green in cold-start. **Carry-forward to Task 5.7**: the same constraint applies to a11y measurement; mitigation is required before Task 5.7 can run. **Mitigation options**: (1) seed `qualia_sidebar_groups` localStorage in `helpers/auth.ts::loginAs` (3-line addition); (2) add `globalSetup` to `playwright.config.ts` that pre-seeds; (3) add explicit "expand widget groups" step in feature specs. Task 5.6 script applies (1) inline via `page.evaluate` + `localStorage.setItem` + `page.reload()` to unblock measurement; the helpers/auth.ts amendment is a clean follow-up for Task 5.7 OR a dedicated cleanup task.

5. **🎯 Chunk-graph isolation STRUCTURAL LAW extends 4pt → 5pt** (5.2 MSW + 5.3 Playwright config + 5.4 spec + 5.5 spec + 5.6 script). Five different test-tooling / measurement-tooling addition shapes (Node-side test framework dep + test-file additions / Playwright config refactor + env-var annotation / new e2e spec file [5.4] / new e2e spec file [5.5] / new measurement orchestration script + report artifact + raw JSON [5.6]) all produce 0 production-chunk drift. **Pattern is now empirically validated at 5 data points**: Scripts/ files + e2e specs + tests + Playwright config + .env config files all stay outside the Vite production entry graph. Mechanism: Vitest `include: ['src/**/*.test.{ts,tsx}']` glob keeps unit tests out; e2e specs at `qualia-shell/e2e/**` are excluded by Vite project root + entry-point convention; Playwright config + .env.example are config files outside the entry-graph; **`Scripts/` (repo-root, outside qualia-shell project) is even MORE outside the chunk graph by virtue of being a separate directory entirely**. **Predictive value for Phase-5 closer (5.7)**: a11y measurement run + report artifact will preserve chunk invariance (predicted byte-count axis 17-of-17 + SHA256 axis 7-of-7); Task 5.7 closure with `Docs/Phase5_A11y_Report.md` + possible Scripts/run_axe_phase5.mjs (or extension of run_lighthouse_phase5.mjs) follows same MEASUREMENT-ONLY class shape. **If a future task BREAKS the structural law** (e.g., production code starts importing from Scripts/), DC-A pre-flight should flag it as a HALT-IF case requiring explicit user resolution.

---

## §8. Next-task unblock

**Phase 5 NINTH task closed** at this commit (squash SHA `3a71364`). 9 of 10 Phase-5 task rows in §9 sub-tracker now `✓` (5.1a + 5.1b + 5.1c + 5.1d + 5.2 + 5.3 + 5.4 + 5.5 + 5.6); Phase-5 sub-tracker pending row narrows 2 → **1** (`5.7`).

**🚀 PARALLEL BATCH B 1-of-2 closures landed** per Plan v2 §19 dependency graph L596: `{5.3,5.4,5.5} → 5.6, 5.7 (parallel)`. Sequential-within-batch orchestration mirrors Phase-5 PARALLEL BATCH A precedent (3 sequential sweeps, one per merge). **5.6 ✓; 5.7 surviving as final batch-B task AND Phase-5 closer.**

**🚨 Recommended next: Task 5.7 — Accessibility validation** per parent Plan v2 §9 row 5.7 + v1 plan L230 verbatim: *"Run axe-core CI on the 4 detail pages. Zero WCAG AA violations."* GR-14 amendment v2.32 operational — DC-A pre-flight anchors on parent §9 + v1 plan; Phase_5_Plan.md L160+ DEPRECATED.

**5.7 kickoff DC-A pre-flight predictions** (anchored on parent §9 row 5.7):

- Predicted Path A: **MEASUREMENT-ONLY class 2nd data point — carry-over** (extends Task 5.6's first formal data point to 2 cross-phase data points within Phase-5; class designation unchanged from MEASUREMENT-ONLY). Script can be derived from `Scripts/run_lighthouse_phase5.mjs` Playwright navigation pattern + the existing axe-core integration; report at `Docs/Phase5_A11y_Report.md`.
- **🚨 v1 L230 threshold blow-through PREDICTED**: Task 5.6 captured 13 distinct WCAG AA violations across 4 detail pages (362 violating nodes; Brianna tenant page has 334 button-name nodes). v1 L230 ZERO target is structurally unattainable without remediation; Task 5.7 will likely capture the same as PASS/FAIL findings + future-Phase-N decision deferred.
- **Forward-defensive carry-forward**: Task 5.6 §7 entry 4 mitigation for cold-start sidebar widget visibility must be applied OR re-applied in Task 5.7 measurement script. Recommend amending `helpers/auth.ts::loginAs` once + reusing in Task 5.7.
- **Phase-5 closure** (`Docs/Phase5_Closure_Report.md` NEW) lands at Task 5.7 sweep per single-closure-per-phase precedent (mirrors Phase-1 + Phase-3 + Phase-4 closure pattern; not Phase-2 per-task-only). Phase-5 column header in §9 main matrix flips `R` → `✓` at that closure.
- Production chunk likely byte-count-invariant per chunk-graph isolation STRUCTURAL LAW at 5 data points → **extends 16-of-16 byte-count invariance to 17-of-17** if structural law holds; SHA256 axis 6-of-6 since 5.1c break would extend to 7-of-7.
- After 5.7 closes, Phase-5 sub-tracker pending row narrows 1 → **0 — Phase-5 CLOSED**. Phase-5 column header in §9 main matrix flips `R` → `✓`.

**Phase-5 unblock-conditions met:**
- ✅ Tasks 5.1a + 5.1b + 5.1c + 5.1d + 5.2 + 5.3 + 5.4 + 5.5 + 5.6 CLOSED
- ✅ Canonical type mirror surface verified intact
- ✅ `strataApi.backend.ts` GR-5 invariant intact
- ✅ Cumulative Phase-4 + Phase-5 vitest baseline at 259/259; SHA256 invariance axis 6-of-6 since 5.1c break; byte-count invariance axis intact at **16-of-16 across phases**
- ✅ R-4 Risk Register amendment with cross-repo nuance from v2.26 carries forward to 5.7 kickoff DC-A discipline
- ✅ **GR-14 NEW at v2.29** (phase-plan locality check) elevated to standing PRE-FLIGHT discipline; **GR-14 AMENDED at v2.32** (when phase-spec CONTRADICTS parent vs refines, parent + v1-lineage wins); both carry forward to all future task kickoffs
- ✅ Playwright config dual-project + env-gated webServer pattern landed at 5.3; reusable
- ✅ Cross-repo handoff JSDoc convention extended to playwright.config.ts at 5.3; reusable
- ✅ E2E-PLAYWRIGHT navigation pattern (`.sidebar-widget` → `.s-sidebar-nav` → `.s-nav-item`) landed at Task 5.4 + reused at Task 5.5 + 5.6; reusable for Task 5.7
- ✅ Phase_5_Plan.md L160-end DEPRECATION banner landed at Task 5.4 sweep
- ✅ Chunk-graph isolation STRUCTURAL LAW upgraded to 5 data points (5.2 + 5.3 + 5.4 + 5.5 + 5.6); future task DC-A pre-flight can predict byte-count axis preservation with very high confidence
- ✅ NEGATIVE ASSERTIONS pattern landed at Task 5.4 + extended at Task 5.5; available for Task 5.7
- ✅ NAME DRIFT pattern documented at 2 data points (Task 5.4 + 5.5); future task DC-A's anchor on data-canonical names
- ✅ MEASUREMENT-ONLY class FIRST formal data point landed at Task 5.6 with reusable script architecture for Task 5.7
- ✅ Cold-start sidebar widget visibility constraint surfaced at Task 5.6 §7 entry 4; mitigation options enumerated for Task 5.7 application

**Phase-5 closure report** (`Docs/Phase5_Closure_Report.md` NEW) lands at Task 5.7 sweep per single-closure-per-phase precedent. Phase-5 column header in §9 main matrix flips `R` → `✓` at that closure.
