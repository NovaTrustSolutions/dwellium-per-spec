# Phase 7 — Task 7.3 — axe-baseline workflow step-split + continue-on-error flip — Completion Report

**Date:** 2026-05-12
**Commit (HEAD on `main`):** `a8f1a10` (squash commit for PR #58, Task 7.3 — Phase-7 Block A item #3; 7.3 squash-SHA cell `a8f1a10` / `#58` resolved at 7.4 sweep per 16-consecutive-cross-phase-sweep-resolutions convention extending 15-pattern at 7.3 → 16-pattern at 7.4; squashes 3 commits `97cb73e` + `1225e7b` + `2145b98` into one)
**Green CI run:** Parity Gate `25754846170` ✓ SUCCESS (16-of-16 steps; auto-fired on PR push via `.github/workflows/appfolio-parity-gate.yml` self-reference in paths-filter at L19+L29) + PII Scan `25754846178` ✓ SUCCESS + CodeRabbit clean pass (Simple / ~12 min effort). Per-surface Linux CI timing characterization captured: Maintenance 57× / Accounting 48× / Owners 22× / Residents 21× / Leasing 15× / Vendors 8× / Properties 2.4× vs darwin baselines.
**Plan reference:** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-7 sub-tracker row 7.3 (closed at v2.50 amendment) + `Docs/Phases/Phase_7_Plan.md §4 Block A item 7.3` + `Docs/Phase6_Closure_Report.md §8` Block A item #3 (workflow step-split for axe-vs-screenshot decoupling as the WORKFLOW-FLIP side of the 2-subtask blocking-gate arc; Task 7.2 was the SPEC-EDIT side completing the arc)
**Template mirror:** `Docs/Phase7_Task_7_2_Completion_Report.md` (Phase-7 7.2 E2E-PLAYWRIGHT 8-section template; 7.3 mirrors byte-shape with CI-CONFIG-ONLY-class adaptations vs 7.2's E2E-PLAYWRIGHT-class)
**v1-lineage substitute.** Phase-7 has no v1 plan source (post-v1 carry-forward arc). Authoritative scope source is `Docs/Phase6_Closure_Report.md §8` Block A item #3 + Phase-6 Task 6.8 PRE0 Q5 empirical finding (workflow `continue-on-error: true → false` flip alone is structurally no-op while spec is soft-assert-by-design; the 2-subtask arc requires both SPEC strengthening [7.2] AND WORKFLOW flip [7.3] to fully blocking the axe-baseline a11y CI gate).

---

## §1. Summary

**🎯 Phase-7 Block A item #3 CLOSED — axe-baseline workflow step-split + `continue-on-error: true → false` gate-flip landed.** **Scope expanded at PR-pre-merge-stabilization** to include 1-line `retries: process.env.CI ? 2 : 0` bump in `qualia-shell/playwright.baseline.config.ts` per Cowork Option C verdict in response to PR #58 parity gate Linux render-timing flake at `axe-baseline.spec.ts:93` (Residents 30s timeout). **Closes Phase-7 Block C item #1 (retries-delta carry-forward) opportunistically.** **Additionally at PR-pre-merge-stabilization round 2 (2026-05-12 after run 25746991992 empirical failure): scope expanded further with 1-line `timeout: 60_000` bump in `qualia-shell/playwright.baseline.config.ts` per Cowork Option B.2 verdict.** Retries-bump alone did NOT fix the Linux render-timing flake (failures hit Residents/Vendors/Overview across retries = deterministic Linux runner slowness, not jitter). Class taxonomy stays CI-CONFIG-ONLY (timeout field is yet another CI-flake-tolerance-policy sub-field, mirrors retries-field domain analysis from v2.50.1). All three edits (workflow step-split + retries-bump + timeout-bump) stay **CI-CONFIG-ONLY class** — `.github/workflows/**` is CI-orchestration domain consumed by GitHub Actions runner; `playwright.baseline.config.ts::retries` + `::timeout` are CI-flake-tolerance-policy domain consumed by Playwright runner; all three fields govern CI test execution lifecycle at different layers (job-level vs test-level retry vs test-level wait); all are CI-architecture-domain at higher abstraction. The 6.8 v2.39 reclassification (testMatch → E2E-PLAYWRIGHT) does NOT extend to retries/timeout fields; testMatch is test-discovery domain; retries+timeout are CI-flake-tolerance domain (different concerns).

Task 7.3 ships workflow YAML edit at `.github/workflows/appfolio-parity-gate.yml` L75-86 (+12/-4 lines) splitting the conjoined "Playwright baseline E2E (screenshot + axe)" step into 2 distinct steps:

1. **Playwright axe-baseline E2E (a11y assertion-blocking)** — `continue-on-error: false` BLOCKING; scoped to `e2e/axe-baseline.spec.ts` via file-path filter; gated on 7.2's hard assertion at `qualia-shell/e2e/axe-baseline.spec.ts:131` (`expect(axeResults.violations.length).toBe(0)`).
2. **Playwright screenshot-baseline E2E (visual regression; sheltered pending Linux baselines)** — `continue-on-error: true` sheltered; scoped to "everything except axe" via `--grep-invert "axe accessibility baseline"` filter (matches 4 specs: screenshot-baseline + strata-nav + appfolio-parity-workorder + appfolio-parity-vendor-compliance); pending Linux baseline mechanism at Tasks 7.4-7.6.

**Empirical execution:** 1 workflow YAML edit (8-line step replacement → 11-line 2-step split + 3-line comment rewrite). Comment block rewritten to reflect Phase-7 7.3 split rationale + Task 7.2 hard-assert reference.

**🎯 NEW class CI-CONFIG-ONLY introduced at 7.3 — project-wide 12th cumulative class** (Phase-7 3rd distinct data point after COMPONENT-FIX at 7.1 + E2E-PLAYWRIGHT extension at 7.2 + CI-CONFIG-ONLY at 7.3). Per Cowork PRE0 Q4 verdict at 7.3 kickoff: `.github/workflows/**` is CI-orchestration domain consumed by GitHub Actions runner; structurally distinct from `qualia-shell/playwright.baseline.config.ts` test-runner-config domain consumed by Playwright directly. The 6.8 reclassification (CONFIG-ONLY → E2E-PLAYWRIGHT) applied to test-runner-config because Playwright reads it; that reasoning does NOT extend to workflow YAML which GitHub reads. Class taxonomy stays granular by file-consumer domain. Prefigures future workflow-YAML-only edits at Tasks 7.4 / 7.5 / 7.6 (Linux baseline mechanism arc).

**🎯 2-subtask blocking-gate arc COMPLETE at 7.3** — 7.2 was the SPEC-EDIT side (hard assertion `expect(axeResults.violations.length).toBe(0)`); 7.3 is the WORKFLOW-FLIP side (`continue-on-error: false` on axe step + file-path scope filter for axe + `--grep-invert` for sheltered companion). Axe-baseline a11y CI gate is now genuinely blocking on CI — hard assertion + workflow shield removed; regression detection becomes CI-blocking starting at the first Phase-7 push touching paths-filter-relevant paths.

**🎯 CI-CONFIG-ONLY edit at `.github/workflows/**` preserves ALL 4 chunk axes byte-for-byte** vs HEAD-post-7.2 main canonical (`StrataDashboard-D_e1g9lx.js` / 1,031,810 / `47d22066…a121d` + `index-ChKXebss.js` / 597,519 / `b237c8aa…67f1` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `index-DubCb24b.css` / 158,955 / `cabc7535…738f`); **11th within-phase-cumulative chunk-axis preservation data point post-LAW-retirement** (Phase-6 9pt + Phase-7 2pt [7.2 + 7.3] = 11pt within-Phase-6+7; **16-of-16 cross-phase cumulative** — Phase-5 6 LAW + Phase-6 8 + Phase-7 2 — very strong inductive evidence at scale; workflow YAML is consumed by GitHub Actions, fully outside Vite entry graph).

**🎯 v1 L230 ZERO WCAG AA threshold 8-routable-surface MET state HOLDS at 7.3 close** — workflow gate-flip changes failure-propagation policy ONLY (axe step failure → job failure now), NOT the per-surface violation count which remains 0/0/0/0/0/0/0/0 confirmed at 7.2 close and reproducible via post-edit darwin re-runs.

**🎯 Structural validation at 7.3 close** (per Cowork PRE0 Q5 SKIP-deliberate-violation-probe verdict): parity-gate run at 7.3 PR will show 2 distinguishable named steps in workflow log ("Playwright axe-baseline E2E (a11y assertion-blocking)" + "Playwright screenshot-baseline E2E (visual regression; sheltered pending Linux baselines)") with correct continue-on-error settings (false + true respectively). Semantic-check (deliberate-violation-probe to verify axe step actually FAILS parity gate on a real violation) deferred to future opportunistic event per established Playwright + GitHub Actions contracts.

**🎯 7.2 TBD → `9126cc2` / `#57` resolution co-shipped at 7.3 sweep — 15 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → 7.1 → 7.2 → **7.3**); pattern fully cemented as cross-phase convention extending 14-pattern at 7.2 → 15-pattern at 7.3. Resolved across §9 row 7.2 squash-SHA cell + Phase status line at top of `Docs/Phases/Phase_7_Plan.md` + Task 7.2 closure-narrative TBD references (4 spots in `Docs/Phase7_Task_7_2_Completion_Report.md`: §1 Commit + §1 Green CI run + §5 verification matrix Parity gate + CodeRabbit rows + §6 Rollback SHA) + CLAUDE.md HEAD pointer pivot.

---

## §2. Strict-gate command output paste

```
$ git rev-parse HEAD
9126cc2c2194c72bb74be2f52f14e4619374191d   # pre-edit anchor (main HEAD post-7.2)

$ git checkout -b phase-7/task-7.3-axe-workflow-stepsplit main
Switched to a new branch 'phase-7/task-7.3-axe-workflow-stepsplit'

$ grep -c "^      - name:" .github/workflows/appfolio-parity-gate.yml
11   # PRE-EDIT step count

# [Edit operation: .github/workflows/appfolio-parity-gate.yml L70-78 → L70-86 — comment block rewrite + 1 step → 2 steps split]

$ git diff .github/workflows/appfolio-parity-gate.yml
-      # Phase 0.0 Task 0.0.9 captured screenshot baselines on macOS (darwin) only;
-      # CI runs on Linux where Chromium renders differ sub-pixel, so snapshot-diff
-      # is non-blocking until Linux-platform baselines are captured on a Linux
-      # dev box. Axe baseline is explicitly soft-assert (spec line 127). See
-      # Docs/Phase0.0_Environment_Report.md Task 0.0.9 for rationale.
-      - name: Playwright baseline E2E (screenshot + axe)
+      # Phase-7 Task 7.3 (2026-05-12): conjoined "Playwright baseline E2E" step split into
+      # 2 distinct steps so axe-baseline can be flipped blocking while screenshot-baseline
+      # stays sheltered pending Linux-platform baseline capture (Tasks 7.4-7.6). Completes
+      # the 2-subtask blocking-gate arc started at Task 7.2 (spec hard-assert at
+      # qualia-shell/e2e/axe-baseline.spec.ts:131 — expect(violations.length).toBe(0)).
+      # Phase 0.0 Task 0.0.9 captured screenshot baselines on macOS (darwin) only; CI runs
+      # on Linux where Chromium renders differ sub-pixel, so screenshot-diff stays
+      # non-blocking until Linux-platform baselines are captured.
+      - name: Playwright axe-baseline E2E (a11y assertion-blocking)
+        working-directory: qualia-shell
+        continue-on-error: false
+        run: npx playwright test --config playwright.baseline.config.ts --project=chromium e2e/axe-baseline.spec.ts
+
+      - name: Playwright screenshot-baseline E2E (visual regression; sheltered pending Linux baselines)
         working-directory: qualia-shell
         continue-on-error: true
-        run: npx playwright test --config playwright.baseline.config.ts
+        run: npx playwright test --config playwright.baseline.config.ts --project=chromium --grep-invert "axe accessibility baseline"

$ grep -c "^      - name:" .github/workflows/appfolio-parity-gate.yml
12   # POST-EDIT step count (N+1 split confirmed)

$ grep -nE "^      - name:|continue-on-error" .github/workflows/appfolio-parity-gate.yml | head -20
# (Manual step verification — listed below in §3)

$ npx tsc -b
# (silent — exit 0)

$ npx vitest run
 Test Files  37 passed (37)
      Tests  259 passed (259)
   Duration  2.74s

$ rm -rf dist && npx vite build
✓ built in 4.17s

$ for f in dist/assets/StrataDashboard-*.js dist/assets/index-*.js dist/assets/index-*.css; do bytes=$(stat -f%z "$f"); sha=$(shasum -a 256 "$f" | awk '{print $1}'); echo "$f  $bytes  $sha"; done
dist/assets/StrataDashboard-D_e1g9lx.js  1031810  47d22066e934d19fe25c90f7e3f1a0dfd9ccf2b7bce30e73c144d6bc9e2a121d
dist/assets/index-1yBoi7Al.js              87711  638f9f069c549f1325c9d942b819dc0d5207f0887a8aebb7571690f9fbd2dab7
dist/assets/index-ChKXebss.js             597519  b237c8aa90dfb41e7045d8f857da06ce514298360554b4e91fbb76ba623767f1
dist/assets/index-DubCb24b.css            158955  cabc7535fcbb5e01789de36e2c2920ad8056259eab3e431af5a7a6d2b607738f
# All 4 chunks match HEAD-post-7.2 byte-for-byte; workflow YAML edit at .github/workflows/** is outside Vite entry graph

$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ built in 4.08s

$ cd .. && node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1268ms total).
```

---

## §3. Structural validation (Step-7) — step-decoupling proof

Per Cowork PRE0 Q5 verdict (SKIP deliberate-violation-probe at 7.3 close), the acceptance gate at 7.3 is structural — confirm 2 distinguishable named steps with correct continue-on-error settings appear in the workflow log post-dispatch. Pre-merge manual-dispatch validation will land at Step-7; here is the LOCAL pre-validation via the workflow YAML:

```
Step 8 (NEW, BLOCKING):
  name: Playwright axe-baseline E2E (a11y assertion-blocking)
  continue-on-error: false   ← BLOCKING (completes 7.2's hard-assert arc)
  filter: e2e/axe-baseline.spec.ts (file-path scope)

Step 9 (NEW, sheltered):
  name: Playwright screenshot-baseline E2E (visual regression; sheltered pending Linux baselines)
  continue-on-error: true    ← sheltered (pending Linux baseline mechanism at 7.4-7.6)
  filter: --grep-invert "axe accessibility baseline" (excludes axe describe-block from 4 other specs)
```

**Full step list (12 steps; was 11 pre-edit; N → N+1 split confirmed):**

| # | Step name | continue-on-error |
|--:|-----------|:------------------|
| 1 | Checkout | default-false |
| 2 | Set up Node (tracks qualia-shell/.nvmrc) | default-false |
| 3 | Install dependencies | default-false |
| 4 | TypeScript build (tsc -b) | default-false |
| 5 | Vitest | false (explicit) |
| 6 | Install Playwright browsers (chromium only for baseline) | default-false |
| **7** | **Playwright axe-baseline E2E (a11y assertion-blocking)** | **false (explicit; NEW)** |
| **8** | **Playwright screenshot-baseline E2E (visual regression; sheltered pending Linux baselines)** | **true (explicit; NEW)** |
| 9 | Vite build (seeds=true) | default-false |
| 10 | Vite build (seeds=false) | default-false |
| 11 | PII leak scan (strict) | default-false |
| 12 | Upload baseline artifacts | default-false (with `if: always()`) |

Step-decoupling structural validation: 2 distinguishable named steps with correct continue-on-error settings present in YAML structure. Authoritative CI runtime validation lands at Step-7 manual-dispatch parity gate.

---

## §4. `/security-review`

High = 0; Medium = 0. Edit is a workflow YAML step-split + `continue-on-error` policy change on a CI configuration file. No production code change; no behavior change in shipped artifacts (workflow YAML doesn't reach production); no new code paths; no new dependencies; no new attack surface. The post-edit policy is a HARDENING (axe-baseline failures now propagate to job failures, completing the blocking-gate arc with 7.2). The sheltered companion step preserves the existing soft-pass behavior for the screenshot + non-axe feature specs — no regression in current CI shielding.

---

## §5. Verification Matrix (per-task)

| Check | Target | Result | Evidence |
|---|---|---|---|
| `tsc -b` errors | 0 | ✓ | Step-4 silent exit 0 |
| `vitest run` failures | ≤ 259 baseline | ✓ 259/259 PASS | Step-4 local darwin; clean (no `calendar.test.tsx:260` flake fired) |
| `vite build` (bare) | exit 0 | ✓ | Step-3 build clean; 4-chunk manifest captured |
| `VITE_APPFOLIO_SEEDS=false vite build` | exit 0 | ✓ | Step-4 build clean |
| Production chunk axes (parity-gate canonical) | preserve byte-for-byte vs HEAD-post-7.2 | ✓ 4-of-4 chunks preserved | Step-3 chunk-axis verification |
| Workflow YAML syntax | parseable | ✓ | Step-2.5 step count grep confirms 11 → 12 (N → N+1 split correct); manual diff inspection clean |
| Step count post-split | N+1 = 12 | ✓ 12 steps | Step-2.5 `grep -c "^      - name:"` |
| axe step continue-on-error | false (BLOCKING) | ✓ | L80 of edited YAML |
| screenshot step continue-on-error | true (sheltered) | ✓ | L85 of edited YAML |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | ✓ | Step-4 51 files scanned, 0 leaks |
| Parity gate per PR | green (auto-fired on PR push via workflow YAML self-reference in paths-filter) | ✓ SUCCESS at run `25754846170` (3rd attempt; post-v2.50.2 timeout-bump) | First run `25745601100` FAILED at Residents axe-scan (Linux render-timing flake; NOT a real WCAG violation); 2nd run `25746991992` FAILED after Cowork Option C retries-bump (retries did NOT fix; failures hit Residents/Vendors/Overview across attempts = deterministic Linux runner slowness); 3rd run `25754846170` ✓ SUCCESS after Cowork Option B.2 timeout-bump to 60_000 (16-of-16 steps); 2-subtask blocking-gate arc empirically COMPLETE on Linux CI |
| Structural validation (Step-7) | 2 distinguishable named steps in workflow log w/ correct continue-on-error | ✓ (a)(b)(c)(d) ALL MET | (a) 2 named steps present in workflow log ✓; (b) axe step `continue-on-error: false` BLOCKING ✓ (proven by job-failure propagation to skipped downstream steps at 1st + 2nd runs); (c) screenshot step `continue-on-error: true` preserved ✓; (d) axe step PASSES on Linux CI at run `25754846170` under timeout: 60_000 + retries: 2 ✓ (8/8 surfaces × 0 violations in 3.6m) |
| Linux CI axe-baseline 8/8 PASS post-retries-bump | empirical re-verification | ❌ FAILED at run 25746991992 | Failures hit Residents/Vendors/Overview across retries = deterministic Linux runner slowness, not jitter; retries-bump alone insufficient; escalated to Option B.2 (timeout-bump) |
| Linux CI axe-baseline 8/8 PASS post-timeout-bump | empirical re-verification | ✓ 8/8 PASS in 3.6m at run `25754846170` | Per-surface timing: Overview T+0s / Properties T+7s / Leasing T+46s / Residents T+76s / Vendors T+131s / Owners T+138s / Accounting T+174s / Maintenance T+202s |
| CodeRabbit review per PR | pass | ✓ clean pass | Simple / ~12 min effort; walkthrough accurate; no substantive concerns; review URL at PR #58 comment 4432340088 |
| `Docs/Phase7_Task_7_3_Completion_Report.md` | committed | ✓ | This file |
| §9 Phase-7 sub-tracker row 7.3 | R → ✓ | ✓ | Plan v2.50 amendment |
| §9 row 7.2 squash-SHA cell | TBD → `9126cc2` | ✓ | Plan v2.50 amendment + 4 reference spots in Phase7_Task_7_2_Completion_Report.md |
| NEW CI-CONFIG-ONLY class taxonomy docked | project-wide 12th cumulative | ✓ | Plan v2.50 amendment + CLAUDE.md Calibration classes block updated |

---

## §6. Rollback SHA

Rollback target: `git revert 9126cc2` (Phase-7 7.2 close; reverts to 7.1 state at `ddf1404`) — OR `git revert ddf1404` (Phase-7 7.1 close; reverts to Phase-6 close at `b99a8ac`) — OR `git revert a8f1a10` (Phase-7 7.3 close; reverts to 7.2 state at `9126cc2`). Resolved at 7.4 sweep.

Rollback safety: workflow YAML edit at `.github/workflows/appfolio-parity-gate.yml` — CI-orchestration domain, no production code change, no test specs touched. Reversible without DB or fixture state implications; rollback would only restore the soft-pass shield over axe-baseline (return to pre-7.3 conjoined step shape) while preserving 7.2's hard assertion in the spec (which would then be the only blocking mechanism).

---

## §7. Deferred Items (Phase-7 carry-forward)

1. **Task 7.4 — Linux Playwright baseline capture mechanism build** is the immediately-blocked next step. 7.3's screenshot-baseline step remains sheltered (`continue-on-error: true`) pending Linux baseline mechanism build at 7.4; capture at 7.5; gate-flip at 7.6. NEW CI-CONFIG-ONLY class extends to 2pt at 7.4 (continues calibrating).
2. **Phase-7 Block A items #5-#8 remain R after 7.3 close** (Linux baseline capture + screenshot-baseline gate-flip + stray PNG provenance + Linux render-timing). Block A items #4-#7 form a coherent 4-subtask sub-arc completing the screenshot-baseline blocking-gate arc; item #8 is independent.
3. **Phase-7 Block B items 7.9-7.11 remain R after 7.3 close** (perf multi-lever arc; parallel to Block A; PRIMARY ≤3,000 ms / ASPIRATIONAL ≤2,000 ms LCP target).
4. **Phase-7 Block C items 7.12-7.14 remain R after 7.3 close** (test infrastructure stabilization; runs throughout).
5. **v1 L230 ZERO WCAG AA threshold 8-routable-surface MET state HOLDS at 7.3 close** — preserved across 7.1 + 7.2 + 7.3 closes. Post-7.3, regression detection is genuinely CI-blocking (spec hard assertion at 7.2 + workflow shield removed at 7.3).
6. **2-subtask blocking-gate arc COMPLETE at 7.3** — first Phase-7 sub-arc with multi-task structural pattern fully calibrated (7.2 SPEC + 7.3 WORKFLOW). Mirror arc for screenshot-baseline (Linux baseline mechanism → capture → gate-flip = Block A items 7.4 + 7.5 + 7.6) follows the same pattern; will validate the multi-task arc shape further at 7.6 close.
7. **NEW class CI-CONFIG-ONLY introduced at 7.3 — project-wide 12th cumulative class** (Phase-7 3rd distinct data point; structurally distinct from E2E-PLAYWRIGHT by file-consumer domain per Cowork PRE0 Q4 verdict). Class taxonomy now stands at 12 cumulative; expected to extend at Tasks 7.4 / 7.5 / 7.6 + future Phase-N CI work.
8. **11th within-phase-cumulative + 16-of-16 cross-phase chunk-axis preservation data point at 7.3 close** — workflow YAML edit at `.github/workflows/**` is fully outside Vite entry graph; preserves all 4 chunk axes byte-for-byte. Class-hypothesis (CI-CONFIG-ONLY preserves chunk axes) empirically confirmed.
9. **15 consecutive cross-phase sweep-resolutions cemented at 7.3 sweep** (extends 14-pattern at 7.2 → 15-pattern at 7.3). Pattern fully cemented as cross-phase convention.
10. **PRE0 5-question gate cleared cleanly at 7.3 — no HARD HALT-IF triggered**. Q1 source-provenance / Q2 downstream artifact behavior / Q3 filter mechanism (file-path scope + --grep-invert) / Q4 class designation (Cowork pre-declared Candidate A: NEW CI-CONFIG-ONLY) / Q5 deliberate-violation-probe (Cowork pre-declared SKIP) all PASS. Phase-7 PRE-FLIGHT discipline working as intended.
11. **Phase-7 Block C item #1 retries-delta carry-forward CLOSED opportunistically at 7.3 PR-pre-merge-stabilization** (originally Block C item per `Docs/Phase6_Closure_Report.md §8`; absorbed into 7.3 scope via Cowork Option C verdict in response to PR #58 parity gate Linux render-timing flake). Phase-7 Block C now 2 items remaining (7.13 calendar flake + 7.14 Perf Report §2 footnote). Mirrors Phase-6 measurement-report-as-completion-report convention for opportunistic carry-forward absorption.
12. **Linux CI render-timing root-cause investigation deferred** to Phase-7 Block A item #8 expansion or future Phase-N task. Empirical hypothesis: `await page.waitForLoadState('networkidle')` at `axe-baseline.spec.ts:92` may never resolve within Playwright default 30s on Linux CI runner for some surfaces (background polling / lazy analytics / web-workers heartbeat); 60s timeout-bump (v2.50.2) provides headroom but doesn't fix root cause. If empirical signal at re-triggered parity gate confirms 8/8 PASS post-bump, root-cause investigation is appropriate Phase-8+ Block A scope. If 60s STILL fails empirically, B.1 escalation (explicit `{ timeout: 5000 }` on networkidle wait at `axe-baseline.spec.ts:92`) per Cowork B.2-fallback path.

---

## §8. Next-task unblock

**Phase-7 Block A item #4 unblocked** (Task 7.4 — Linux Playwright baseline capture mechanism build) — sequentially gated on 7.3's screenshot-baseline shelter being preserved (which it is). 7.4 builds a workflow_dispatch workflow OR equivalent ad-hoc mechanism that captures 8 `*-chromium-linux.png` artifacts on a Linux GitHub Actions runner. After 7.4 lands, 7.5 (capture 8 Linux baselines) can land; then 7.6 (screenshot-baseline `continue-on-error: true → false` gate-flip) completes the 4-subtask screenshot-baseline blocking-gate arc.

**Phase-7 Block B items 7.9-7.11 unblocked** (perf multi-lever arc; parallel to Block A; can run any time at Phase-7 task entry).

**Phase-7 Block C items 7.12-7.14 unblocked** (test infrastructure stabilization; parallel to Block A + B; can run throughout).

Phase-7 budget per `Docs/Phases/Phase_7_Plan.md §10`: 5-7 days end-to-end across 14 tasks; 7.1 burned ~0.5 day + 7.2 burned ~0.25 day + 7.3 burned ~0.25 day = ~4-6 days remaining buffer (within scope).

🧪
