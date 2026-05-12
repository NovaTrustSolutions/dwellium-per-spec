# Phase 7 — Task 7.2 — axe-baseline.spec.ts assertion-strengthening — Completion Report

**Date:** 2026-05-11
**Commit (HEAD on `main`):** `9126cc2` (squash commit for PR #57, Task 7.2 — Phase-7 Block A item #2; 7.2 squash-SHA cell `9126cc2` / `#57` resolved at 7.3 sweep per 15-consecutive-cross-phase-sweep-resolutions convention extending 14-pattern at 7.2 → 15-pattern at 7.3)
**Green CI run:** Parity Gate `25690307174` ✓ SUCCESS (15-of-15 steps; manual-dispatch per CLAUDE.md "Paths-filter quirk" section — 7.2 touched `qualia-shell/e2e/**` + `Docs/**` + root `CLAUDE.md` outside `qualia-shell/src/**` filter scope; first manual-dispatch since 7.1's paths-filter RESET) + PII Scan `25690301437` ✓ SUCCESS + CodeRabbit clean pass (Simple / ~12 min effort).
**Plan reference:** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-7 sub-tracker row 7.2 (closed at v2.49 amendment) + `Docs/Phases/Phase_7_Plan.md §4 Block A item 7.2` + `Docs/Phase6_Closure_Report.md §8` Block A item #2 (axe-baseline.spec.ts assertion-strengthening as the SPEC-EDIT side of the 2-subtask blocking-gate arc; Task 7.3 is the WORKFLOW-FLIP side completing the arc)
**Template mirror:** `Docs/Phase7_Task_7_1_Completion_Report.md` (Phase-7 OPENER 8-section template; 7.2 mirrors byte-shape with E2E-PLAYWRIGHT-class adaptations vs 7.1's A11Y-COMPONENT-FIX-class)
**v1-lineage substitute.** Phase-7 has no v1 plan source (post-v1 carry-forward arc). Authoritative scope source is `Docs/Phase6_Closure_Report.md §8` Block A item #2 + Phase-6 Task 6.8 PRE0 Q5 empirical finding (axe-baseline.spec.ts is informational-by-spec-design at L127 — `console.log` soft-assert only, no `expect()` on violation count; workflow `continue-on-error` flip alone is structurally no-op).

---

## §1. Summary

**🎯 Phase-7 Block A item #2 CLOSED — axe-baseline.spec.ts assertion-strengthening landed.** Task 7.2 ships 1-line spec assertion-strengthening at `qualia-shell/e2e/axe-baseline.spec.ts:131` (`expect(axeResults.violations.length).toBe(0)` replacing the L127 soft-assert `console.log` per Phase-6 Task 6.8 PRE0 Q5 finding). 3-line comment block updated from soft-assert framing to strict-assert framing ("// Strict-assert: assertion-strengthened at Phase-7 Task 7.2 — fails on any WCAG AA violation."). Workflow `continue-on-error: true → false` flip is Task 7.3 scope (completes the 2-subtask blocking-gate arc).

**Empirical execution:** 1-line `expect()` addition + 3-line comment block rewrite at `qualia-shell/e2e/axe-baseline.spec.ts`. `expect` already imported on L1 (`import { test, expect, Page } from '@playwright/test';`) — no import addition needed.

**🎯 E2E-PLAYWRIGHT carry-over Phase-7 1st distinct data point — extends Phase-6 7pt cross-phase → 8pt at 7.2** (Phase-5 3pt [5.3 + 5.4 + 5.5] + Phase-6 4pt [6.1b + 6.1c + 6.2 + 6.8] + Phase-7 1pt at 7.2 = **8pt cross-phase**; class fully calibrated at 8pt).

**🎯 Spec-only edit at `qualia-shell/e2e/**` preserves ALL 4 chunk axes byte-for-byte** vs HEAD-post-7.1 main canonical (`StrataDashboard-D_e1g9lx.js` / 1,031,810 / `47d22066…a121d` + `index-ChKXebss.js` / 597,519 / `b237c8aa…67f1` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `index-DubCb24b.css` / 158,955 / `cabc7535…738f`); **10th within-phase-cumulative chunk-axis preservation data point post-LAW-retirement** (Phase-6 9pt + Phase-7 1pt at 7.2 = 10pt within-Phase-6+7; **15-of-15 cross-phase cumulative** — Phase-5 6 LAW + Phase-6 8 + Phase-7 1 — very strong inductive evidence at scale).

**🎯 Post-edit axe-baseline.spec.ts 8/8 PASS on local darwin with hard assertion** (43.1s wallclock vs 39.7s pre-edit; ~9% overhead for `expect()` evaluation per surface; sub-second per-surface; all 8 surfaces 0 violations confirmed under blocking assertion).

**🎯 v1 L230 ZERO WCAG AA threshold 8-routable-surface MET state HOLDS at 7.2 close** — pre-edit FRESH axe scan at HEAD `ddf1404` confirmed 8/8 × 0 violations (3 surfaces from 7.1 Leasing/Owners/Accounting + 5 surfaces preserved); post-edit re-scan PASS under hard assertion. PRE0 mathematical-exactness signal trivially applies (8 × 0 = 0; `expect(violations.length).toBe(0)` holds on every surface by construction post-7.1).

**🎯 7.1 TBD → `ddf1404` / `#56` resolution co-shipped at 7.2 sweep — 14 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → 7.1 → **7.2**); pattern fully cemented as cross-phase convention extending 13-pattern at Phase-7 OPENING → 14-pattern at 7.2. Resolved across §9 row 7.1 squash-SHA cell + Phase status line at top of `Docs/Phases/Phase_7_Plan.md` + Task 7.1 closure-narrative TBD references (4 spots in `Docs/Phase7_Task_7_1_Completion_Report.md`: §1 Commit + §1 Green CI run + §5 verification matrix 7 rows + §6 Rollback SHA) + CLAUDE.md HEAD pointer pivot.

---

## §2. Strict-gate command output paste

```
$ git rev-parse HEAD
ddf140444ff766d7e06cbbb751951484863f7537   # pre-edit anchor (main HEAD post-7.1)

$ git checkout -b phase-7/task-7.2-axe-baseline-assertion main
Switched to a new branch 'phase-7/task-7.2-axe-baseline-assertion'

$ npx playwright test --config=playwright.baseline.config.ts e2e/axe-baseline.spec.ts --project=chromium
# PRE-EDIT (Q2 baseline state re-verify; 8/8 PASS in 39.7s; all 8 surfaces 0 violations)
  ✓  1  Overview — axe scan (3.3s)
  ✓  2  Properties — axe scan (2.9s)
  ✓  3  Leasing — axe scan (2.9s)
  ✓  4  Residents — axe scan (3.6s)
  ✓  5  Vendors — axe scan (16.6s)
  ✓  6  Owners — axe scan (3.1s)
  ✓  7  Accounting — axe scan (2.9s)
  ✓  8  Maintenance — axe scan (3.5s)
  8 passed (39.7s)

# [Edit operation: qualia-shell/e2e/axe-baseline.spec.ts L127-131 — comment block rewrite + expect() addition]

$ git diff qualia-shell/e2e/axe-baseline.spec.ts
-      // Soft-assert: this is a baseline capture, not a blocker. Just log.
+      // Strict-assert: assertion-strengthened at Phase-7 Task 7.2 — fails on any WCAG AA violation.
+      // Pre-7.2 was soft-assert console.log only (Phase 0.0 Task 0.0.8 baseline capture intent);
+      // post-7.1's 8-routable-surface zero-state MET makes the hard assertion safe (sister-arc to 7.3 workflow flip).
       const count = axeResults.violations.length;
       // eslint-disable-next-line no-console
       console.log(`[axe][${mod.label}] ${count} violation rule(s) flagged`);
+      expect(axeResults.violations.length).toBe(0);

$ npx playwright test --config=playwright.baseline.config.ts e2e/axe-baseline.spec.ts --project=chromium
# POST-EDIT (Step-2.5; 8/8 PASS in 43.1s; all 8 surfaces PASS under hard assertion)
  ✓  1  Overview — axe scan (3.1s)
  ✓  2  Properties — axe scan (2.9s)
  ✓  3  Leasing — axe scan (3.0s)
  ✓  4  Residents — axe scan (3.6s)
  ✓  5  Vendors — axe scan (16.2s)
  ✓  6  Owners — axe scan (6.3s)
  ✓  7  Accounting — axe scan (3.6s)
  ✓  8  Maintenance — axe scan (3.5s)
  8 passed (43.1s)

$ npx tsc -b
# (silent — exit 0)

$ npx vitest run
 Test Files  37 passed (37)
      Tests  259 passed (259)
   Duration  2.60s

$ rm -rf dist && npx vite build
✓ built in 3.87s
dist/assets/StrataDashboard-D_e1g9lx.js  1,031.81 kB   # POST-7.2 (matches HEAD-post-7.1 byte-for-byte)
dist/assets/index-ChKXebss.js              597.52 kB
dist/assets/index-1yBoi7Al.js               87.71 kB
dist/assets/index-DubCb24b.css             158.96 kB

$ shasum -a 256 dist/assets/StrataDashboard-*.js dist/assets/index-*.js dist/assets/index-*.css
47d22066e934d19fe25c90f7e3f1a0dfd9ccf2b7bce30e73c144d6bc9e2a121d  dist/assets/StrataDashboard-D_e1g9lx.js
b237c8aa90dfb41e7045d8f857da06ce514298360554b4e91fbb76ba623767f1  dist/assets/index-ChKXebss.js
638f9f069c549f1325c9d942b819dc0d5207f0887a8aebb7571690f9fbd2dab7  dist/assets/index-1yBoi7Al.js
cabc7535fcbb5e01789de36e2c2920ad8056259eab3e431af5a7a6d2b607738f  dist/assets/index-DubCb24b.css
# All 4 chunks match HEAD-post-7.1 byte-for-byte; spec-only edit at qualia-shell/e2e/** is outside Vite entry graph

$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ built in 3.83s

$ cd .. && node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1430ms total).
```

---

## §3. Verification proof (axe re-scan + chunk-axis preservation)

Empirical proof at 7.2 close is two-pronged:

1. **Post-edit axe-baseline.spec.ts** with hard assertion `expect(axeResults.violations.length).toBe(0)` PASSES 8/8 on local darwin under `playwright.baseline.config.ts` (43.1s; chromium project; static-API mode via `VITE_USE_STATIC_API=true npm run dev`). The hard assertion holds trivially because the 7.1 close achieved 8-routable-surface zero-state and 7.2 introduces no a11y regressions.

2. **Chunk-axis preservation** across all 4 production chunks verified via `npx vite build` parity-gate canonical (bare invocation, no env vars). Step-3 verification matched HEAD-post-7.1 main canonical byte-for-byte:
   - `StrataDashboard-D_e1g9lx.js` / **1,031,810** / `47d22066…a121d` ✓
   - `index-ChKXebss.js` / 597,519 / `b237c8aa…67f1` ✓
   - `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` ✓
   - `index-DubCb24b.css` / 158,955 / `cabc7535…738f` ✓

E2E-PLAYWRIGHT carry-over class-hypothesis empirically confirmed: test-tooling-only edit at `qualia-shell/e2e/**` (outside Vite entry graph) preserves all 4 chunk axes byte-for-byte. Sister-shape to 6.1b / 6.1c / 6.2 / 6.8 spec-only edits which all preserved chunk axes.

---

## §4. `/security-review`

High = 0; Medium = 0. Edit is a 1-line `expect()` addition + 3-line comment block rewrite to an existing test spec. No production code change; no behavior change in shipped artifacts (test specs don't reach production); no new code paths; no new dependencies; no new attack surface. The post-edit hard assertion only changes test-failure behavior, which is a hardening (not a regression).

---

## §5. Verification Matrix (per-task)

| Check | Target | Result | Evidence |
|---|---|---|---|
| `tsc -b` errors | 0 | ✓ | Step-4 silent exit 0 |
| `vitest run` failures | ≤ 259 baseline | ✓ 259/259 PASS | Step-4 local darwin; clean (no `calendar.test.tsx:260` flake fired) |
| `vite build` (bare) | exit 0 | ✓ | Step-3 build clean; 4-chunk manifest captured |
| `VITE_APPFOLIO_SEEDS=false vite build` | exit 0 | ✓ | Step-4 build clean |
| Production chunk axes (parity-gate canonical) | preserve byte-for-byte vs HEAD-post-7.1 | ✓ 4-of-4 chunks preserved | Step-3 chunk-axis verification |
| Smoke-test 4-spec cold-start | (deferred — 7.2 doesn't gate smoke) | n/a | Spec-only edit at `qualia-shell/e2e/**`; 4-spec smoke is for production-source edits per kickoff |
| Axe-baseline post-edit on darwin | 8/8 PASS with hard assertion | ✓ 8/8 PASS | Step-2.5 43.1s |
| 8-routable-surface a11y zero-state | All 8 surfaces 0 violations | ✓ (HOLDS at 7.2 from 7.1) | PRE0 Q2 + Step-2.5 both 8/8 × 0 violations |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | ✓ | Step-4 51 files scanned, 0 leaks |
| Parity gate per PR | green (manual-dispatch) | ✓ SUCCESS | Run `25690307174` 15-of-15 PASS; manual-dispatched per paths-filter quirk (7.2 outside `qualia-shell/src/**` filter) |
| CodeRabbit review per PR | pass | ✓ clean pass | Simple / ~12 min effort; walkthrough accurate; no substantive concerns; review URL at PR #57 comment 4423791400 |
| `Docs/Phase7_Task_7_2_Completion_Report.md` | committed | ✓ | This file |
| §9 Phase-7 sub-tracker row 7.2 | R → ✓ | ✓ | Plan v2.49 amendment |
| §9 row 7.1 squash-SHA cell | TBD → `ddf1404` | ✓ | Plan v2.49 amendment + 4 reference spots in Phase7_Task_7_1_Completion_Report.md |

---

## §6. Rollback SHA

Rollback target: `git revert ddf1404` (Phase-7 7.1 close; reverts to Phase-6 close state at `b99a8ac`) — OR `git revert 9126cc2` (Phase-7 7.2 close; reverts to 7.1 state at `ddf1404`). Resolved at 7.3 sweep.

Rollback safety: 1-line `expect()` addition + 3-line comment block rewrite to test spec. No production code change; test-only edit. Reversible without DB or fixture state implications; rollback would only relax the assertion strictness (return to soft-assert console.log) without affecting production behavior.

---

## §7. Deferred Items (Phase-7 carry-forward)

1. **Task 7.3 — axe-baseline workflow step-split + `continue-on-error: true → false` gate-flip** is the immediately-blocked next step. 7.2 made the SPEC genuinely-blocking (hard assertion); 7.3 removes the WORKFLOW shield to complete the 2-subtask blocking-gate arc. Workflow YAML edit at `.github/workflows/appfolio-parity-gate.yml` ~5-10 lines.
2. **Phase-7 Block A items #4-#8 remain R after 7.2 close** (Linux baseline mechanism + capture + gate-flip + stray PNG + Linux render-timing). Block A items #4-#7 form a coherent 4-subtask sub-arc; item #8 is independent.
3. **Phase-7 Block B items 7.9-7.11 remain R after 7.2 close** (perf multi-lever arc; parallel to Block A; PRIMARY ≤3,000 ms / ASPIRATIONAL ≤2,000 ms LCP target).
4. **Phase-7 Block C items 7.12-7.14 remain R after 7.2 close** (test infrastructure stabilization; runs throughout).
5. **v1 L230 ZERO WCAG AA threshold 8-routable-surface MET state HOLDS at 7.2 close** — preserved across 7.1 close + 7.2 close. Post-7.3 (workflow flip), regression detection becomes CI-blocking (the spec hard assertion was the necessary precondition; 7.3 removes the workflow shield).
6. **10th within-phase-cumulative chunk-axis preservation data point at 7.2 close** — class-hypothesis (E2E-PLAYWRIGHT spec-only edit preserves chunk axes byte-for-byte) confirmed empirically. 15-of-15 cross-phase cumulative post-LAW-retirement; very strong inductive evidence at scale.
7. **E2E-PLAYWRIGHT carry-over class fully calibrated at 8pt cross-phase** (Phase-5 3pt + Phase-6 4pt + Phase-7 1pt at 7.2). Next E2E-PLAYWRIGHT data point candidates: Phase-7 Block A items #2-#3 spec-related edits (7.3 is workflow-only, would form a NEW CI-CONFIG-FIX class data point per Phase_7_Plan.md §11) + future Phase-N spec edits.
8. **Paths-filter quirk extends to 11-task cross-phase scope at 7.2** (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7 / 6.8 / 6.9 → 7.2; 7.1 broke the pattern temporarily with auto-fire RESET via production-source edit; 7.2 returns to manual-dispatch).
9. **14 consecutive cross-phase sweep-resolutions cemented at 7.2 sweep** (extends 13-pattern at Phase-7 OPENING → 14-pattern at 7.2). Pattern fully cemented as cross-phase convention.
10. **PRE0 5-question gate cleared cleanly at 7.2 — no HARD HALT-IF triggered**. Q1 source-provenance / Q2 baseline state / Q3 build-mode-aware / Q4 math signal / Q5 scope creep all PASS. Phase-7 PRE-FLIGHT discipline working as intended.

---

## §8. Next-task unblock

**Phase-7 Block A item #3 unblocked** (Task 7.3 — axe-baseline workflow step-split + `continue-on-error: true → false` gate-flip) — gated on 7.2's spec hard assertion which is now landed. 7.3 completes the 2-subtask blocking-gate arc: 7.2 strengthens the SPEC (done); 7.3 removes the WORKFLOW shield + splits the conjoined axe-baseline + screenshot-baseline step in `.github/workflows/appfolio-parity-gate.yml` so axe-baseline can be flipped to blocking independently of screenshot-baseline (which remains under `continue-on-error: true` pending Block A items 7.4-7.6 Linux baseline arc).

**Phase-7 Block B items 7.9-7.11 unblocked** (perf multi-lever arc; parallel to Block A; can run any time at Phase-7 task entry).

**Phase-7 Block C items 7.12-7.14 unblocked** (test infrastructure stabilization; parallel to Block A + B; can run throughout).

Phase-7 budget per `Docs/Phases/Phase_7_Plan.md §10`: 5-7 days end-to-end across 14 tasks; 7.1 burned ~0.5 day + 7.2 burned ~0.25 day = ~4.25-6.25 days remaining buffer (within scope).

🧪
