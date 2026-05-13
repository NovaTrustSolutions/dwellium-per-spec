# Phase-7 Task 7.8 Completion Report — Linux CI render-timing investigation closes via empirical NO-OP (v2.51.1 absorption)

## §1. Summary

**Status.** ✓ CLOSED 2026-05-13.
**Commit (HEAD on `main`):** `f0b01275bc87851cf39d327c4dee4032d558ff0c` (squash commit for PR #62, Task 7.8 — Phase-7 Block A item #8; resolved at 7.9 sweep per 20-consecutive-cross-phase-sweep-resolutions convention extending 19-pattern at 7.8 → 20-pattern at 7.9).
**Green CI run:** Parity Gate run [25798266867](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25798266867) ✓ SUCCESS 16-of-16 (axe-baseline 8 passed in 4.2m + screenshot-baseline 16 passed in 4.2m; 16m 37s wallclock 12:11:21→12:27:58Z; 5th consecutive empirical compliance-row PASS); PII Scan run [25798262087](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25798262087) ✓ SUCCESS; CodeRabbit ✓ CLEAN PASS at 12:12:43Z.

**Phase-7 Block A item #8 CLOSED via empirical NO-OP per Cowork Option E verdict.** PRE0 6-question empirical gate revealed that the v2.51.1 timeout-bump (60_000 → 90_000 ms on `qualia-shell/playwright.baseline.config.ts:69` at Task 7.4) **absorbed the `compliance-row-workersCompExpiration` render-timing flake as a side-effect** of the Vendors axe-scan absorption. 4 consecutive 7.x parity-gate runs (25775177388 + 25780671522 + 25787465352 + 25789452205) PASS the compliance-row test under the 90s budget, **including the 7.6 FIRST-TIME-BLOCKING parity-gate run 25787465352** where the screenshot-baseline step ran 16 tests (8 screenshot + 8 feature specs including `appfolio-parity-vendor-compliance`) under `continue-on-error: false` and the compliance-row test was inside that 16/16 PASS step.

**🎯 Block A 8-of-8 CLOSED — Phase-7 a11y + CI architecture sub-arc entirely complete.** Both blocking-gate arcs end-to-end COMPLETE on Linux CI from main: axe-baseline (2-step at 7.2 + 7.3) and screenshot-baseline (5-step at SPEC contract + 7.3 WORKFLOW step-split + 7.4 INFRASTRUCTURE + 7.5 CAPTURE + 7.6 GATE-FLIP).

**Class taxonomy:** **MEASUREMENT-ONLY 5pt → 6pt cross-phase extension** with NEW sub-shape **"DOC-only-empirical-void-closure"**. Project-wide class count stays at 13 (no new top-level class introduced; 4 sub-shapes calibrated under MEASUREMENT-ONLY now: source-rename + with-baseline-recapture + plus-script-rename + DOC-only-empirical-void-closure).

**🎯 NEW Phase-7 deferred-item #3 (GR-15 amendment candidate for Plan v2.54+):** "Timeout-bump empirical reach may exceed original scope" — a CI-flake-tolerance-policy timeout amendment intended to absorb flake A may also absorb structurally-similar flake B that surfaced independently. Sister-shape to 7.5's "first-real-execution-as-truth-signal" PRE-FLIGHT discipline note: both speak to the gap between intent-at-amendment-time and empirical-reach-after-execution.

---

## §2. PRE0 empirical signal narrative (6-question gate)

### Q1 — Source-Provenance (EMPIRICAL)

- **Spec file:** `qualia-shell/e2e/appfolio-parity-vendor-compliance.spec.ts`
- **Test block:** L63-162 (single test in spec): `test.describe('AppFolio parity — 2-STORY Technical Roofing compliance') → test('Vendors → 2-STORY → Compliance tab → 6 rows + only General Liability populated', ...)`.
- **Assertion line:** L55-61 define `EMPTY_KEYS` constant array including `'workersCompExpiration'` as the **1st of 5 empty keys**; L147-154 iterate over `EMPTY_KEYS` with `for (const key of EMPTY_KEYS) { const row = detailPanel.locator(\`[data-testid="compliance-row-${key}"]\`); await expect(row).toBeVisible(); ... }`. Empirical failure site at **L148-149** (`workersCompExpiration` is the FIRST locator to flake when render-timing races; subsequent keys never reach assertion).
- **Production source:** `qualia-shell/src/components/StrataDashboard/modules/__vendors/ComplianceTab.tsx:33` defines `{ label: "Workers' Comp", key: 'workersCompExpiration' }` (1st entry in `rows` array); L76 renders `data-testid={\`compliance-row-${row.key}\`}`.

### Q2 — Failure Mode Empirical Reading

**Origin failure** at run [25659376515](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25659376515) — 6.8 PR (#54) parity gate, 2026-05-11T08:35Z, **SUCCESS-overall** because the conjoined `Playwright baseline E2E` step had `continue-on-error: true` at that time. Failure mode inside the (then-sheltered) step:

```
1) [chromium] › e2e/appfolio-parity-vendor-compliance.spec.ts:68:3 ›
   AppFolio parity — 2-STORY Technical Roofing compliance ›
   Vendors → 2-STORY → Compliance tab → 6 rows + only General Liability populated
   Locator: locator('.s-detail-panel').locator('[data-testid="compliance-row-workersCompExpiration"]')
   - waiting for locator(...)
   148 | const row = detailPanel.locator(`[data-testid="compliance-row-${key}"]`);
   at qualia-shell/e2e/appfolio-parity-vendor-compliance.spec.ts:149:25
```

Failure mode: `expect(row).toBeVisible()` waits-for-locator timeout (default 5s assertion timeout via Playwright's auto-wait; total test timeout was Playwright default 30s at that time). The compliance-row didn't render within the assertion deadline on Linux CI.

**Frequency since:** Searched all 100 most recent parity-gate runs (back to 2026-05-09). Every failure run (6 total: 25774373725, 25755988603, 25754851261, 25747004498, 25746991992, 25745601100) failed on **axe-baseline.spec.ts Vendors axe scan**, NOT compliance-row. **0 compliance-row failures since the 6.8 PR run.**

| Run | Date | Context | Test timeout | compliance-row result |
|---|---|---|---|---|
| 25775177388 | 2026-05-13T02:48Z | 7.4 retry post-v2.51.1 | 90s (v2.51.1) | ✓ PASS |
| 25780671522 | 2026-05-13T05:39Z | 7.5 PR (#60) | 90s (v2.51.1) | ✓ PASS |
| **25787465352** | **2026-05-13T08:25Z** | **7.6 PR (#61) FIRST-TIME-BLOCKING (screenshot-baseline step `continue-on-error: false`)** | **90s (v2.51.1)** | **✓ PASS (16/16 in step)** |
| 25789452205 | 2026-05-13T09:06Z | main push post-7.6 squash (#61) | 90s (v2.51.1) | ✓ PASS |

**🎯 Substantive empirical reading.** The flake has been **absorbed by the v2.51.1 timeout-bump** at `playwright.baseline.config.ts:69`. The 6.8 origin failure ran under Playwright default 30s test timeout; v2.50.2 raised it to 60s; v2.51.1 raised it to 90s. The flake has NOT fired in any 7.x parity-gate run.

### Q3 — Darwin Local Reproduction Attempt

```
$ cd qualia-shell && npx playwright test --config=playwright.baseline.config.ts \
    e2e/appfolio-parity-vendor-compliance.spec.ts --project=chromium
Running 1 test using 1 worker
  ✓  1 [chromium] › e2e/appfolio-parity-vendor-compliance.spec.ts:68:3 ›
        AppFolio parity — 2-STORY Technical Roofing compliance ›
        Vendors → 2-STORY → Compliance tab → 6 rows + only General Liability populated (6.3s)
  1 passed (7.1s)
```

**Result: ✓ PASS on darwin (6.3s wallclock).** Confirms Linux-CI-specific timing characteristic (sister to Vendors axe-scan: darwin 17.4s pass vs Linux 60s timeout pre-v2.51.1). Darwin renders the compliance rows ~10× faster than the Linux CI runner needed pre-absorption; under v2.51.1 90s test-timeout budget on Linux, the inner 5s default assertion timeout still has enough page-render headroom to pass.

### Q4 — Deferred-Item Cross-Reference

`Docs/Phases/Phase_7_Plan.md §4 Task 7.8` and `Docs/Phase6_Closure_Report.md §8 Block A item #8` both scope the 7.8 deferred-item to the compliance-row-workersCompExpiration Linux CI render-timing failure. No scope drift detected. Phase_7_Plan anticipated a likely-spec-edit shape (per-locator timeout extension); v2.51.1 absorbed the flake at workflow/config layer first, structurally rendering the spec-edit unnecessary — sister to Block C item #1 retries-delta closing opportunistically at 7.3 v2.50.1+v2.50.2 and Block A item #7 stray-PNG closing opportunistically at 7.5 `--update-snapshots`.

### Q5 — Fix Mechanism Verdict

**Cowork verdict: Option E (Empirical NO-OP / DOC-only-empirical-void-closure).** Class designation: E1 (MEASUREMENT-ONLY 5pt → 6pt cross-phase extension with NEW sub-shape "DOC-only-empirical-void-closure").

### Q6 — gh OAuth Workflow Scope

Token scopes: `gist, read:org, repo, workflow`. Workflow scope present (not exercised at 7.8 since DOC-only closure).

---

## §3. Class taxonomy

**MEASUREMENT-ONLY class — 6pt cross-phase calibration at 7.8 close**:
- 5.6 (perf measurement; source-rename `run_lighthouse_phase4.mjs` → `run_lighthouse_phase5.mjs`)
- 5.7 (a11y measurement; source-rename `run_axe_phase4.mjs` → `run_axe_phase5.mjs`)
- 6.5 (a11y closure cleanup; DOC-only-with-baseline-recapture; Phase-6 1st data point)
- 6.6 (a11y re-measurement; DOC-only-plus-script-rename `run_axe_phase5.mjs` → `run_axe_phase6.mjs`)
- 6.7 (perf reconnaissance + Lever 1 evaluation REVERT; DOC-only-empirical-finding-with-source-rename)
- **7.8 (compliance-row render-timing investigation; DOC-only-empirical-void-closure — NEW sub-shape; 6th data point of MEASUREMENT-ONLY class).**

**Sub-shape taxonomy under MEASUREMENT-ONLY (4 sub-shapes calibrated)**:
1. **MEASUREMENT-ONLY-with-source-rename** (5.6 + 5.7; 2pt) — re-running prior phase's perf/a11y measurement after a `git mv` to phase-version the script.
2. **MEASUREMENT-ONLY-with-baseline-recapture** (6.5; 1pt) — fresh canonical closure-snapshot artifact while re-validating zero-state.
3. **MEASUREMENT-ONLY-plus-script-rename** (6.6; 1pt) — sister of 5.6/5.7 but Phase-6 internal generation rather than retroactive rename.
4. **MEASUREMENT-ONLY-with-empirical-finding** (6.7; 1pt) — initial source-edit attempted (Lever 1 preload+onload Google Fonts deferral) then REVERTED at closure when empirical post-edit measurement disconfirmed the kickoff hypothesis.
5. **NEW: MEASUREMENT-ONLY-DOC-only-empirical-void-closure** (7.8; 1pt) — deferred-item became void via UPSTREAM workflow/config side-effect from a prior task (v2.51.1 timeout-bump at 7.4 absorbed flake that this task was scheduled to remediate). Structurally distinct from MEASUREMENT-ONLY-with-empirical-finding because there's no source-edit-attempted-then-reverted; the absorbing intervention already shipped under a different task's scope.

**Project-wide cumulative class count stays at 13** (unchanged from 7.6 close). The new sub-shape is a finer-grain taxonomy of an existing class; the class taxonomy framework remains "granular by file-consumer domain + functional-shape" per Cowork PRE0 Q4 verdict at 7.3.

**Cross-class opportunistic-closure constellation now 3-of-3 within Phase-7** (orthogonal to MEASUREMENT-ONLY sub-shape catalog):
- Block A item #7 stray `overview-chromium-linux.png` ← 7.5 `--update-snapshots`
- Block C item #1 retries-delta carry-forward ← 7.3 v2.50.1+v2.50.2 in-place scope expansion
- Block A item #8 compliance-row render-timing ← 7.4 v2.51.1 timeout-bump-2 (7.8 close)

These are 3 distinct meta-tasks closed via 3 distinct upstream side-effects across Phase-7. Pattern empirically validated at 3pt within-Phase-7; sufficient calibration to recommend a GR-15 PRE-FLIGHT discipline addition: **"For carry-forward deferred-items, run an empirical-reach check at the close of any in-place scope expansion or capture-step landing — the intervention may have absorbed an unrelated deferred-item."** (Plan v2.54+ amendment candidate.)

---

## §4. Files touched (5 DOC files)

| File | Change |
|---|---|
| `Docs/Phase7_Task_7_8_Completion_Report.md` | NEW (this file; 8-section template adapted to DOC-only-empirical-void-closure shape) |
| `Docs/AppFolio_Parity_Implementation_Plan_v2.md` | v2.54 amendment (Phase-7 row 7.8 closure + §9 sub-tracker row 7.6 squash-SHA TBD → `7b771ec` + row 7.8 R → ✓ + NEW deferred-item docked + 7.4 squash-SHA cell TBD → `cd26ce4` opportunistic catch-up of v2.52 doc-sweep gap) |
| `Docs/Phases/Phase_7_Plan.md` | Phase status line + row 7.6 TBD → `7b771ec` + row 7.8 closure cell |
| `Docs/Phase7_Task_7_6_Completion_Report.md` | 7.6 TBD references resolved → `7b771ec` / `#61` (§1 commit + §1 Green CI run + §5 verification matrix rows + §6 Rollback SHA) |
| `CLAUDE.md` | HEAD pointer pivot `7b771ec` → TBD-7.8 (with cross-references to 7.4 squash `cd26ce4` correction) + Phase summary table Phase-7 row PR counter 6 → 7 + Production chunk invariance state preservation `15th` within-phase + `21-of-21` cross-phase + Calibration classes MEASUREMENT-ONLY 5pt → 6pt sub-shape catalog updated + Block A 8-of-8 CLOSED milestone + NEW Phase-7 deferred-item #3 docked |

**0 source/spec/config files touched.** All edits are documentation-layer; DOC-only-empirical-void-closure class hypothesis empirically confirmed (see §5 chunk-axis preservation row).

---

## §5. Verification matrix

| Step | Expected | Actual | Status |
|---|---|---|---|
| Step-1 branch off main 7b771ec | Branch HEAD = `7b771ec29c90178aca0dc6639f08d634af191763` | `7b771ec29c90178aca0dc6639f08d634af191763` | ✓ |
| Step-2 source edits | 0 (NO-OP per Cowork Option E) | 0 | ✓ |
| Step-3 chunk-axis preservation (4 axes) | Byte-for-byte MATCH HEAD-post-7.6 canonical | `StrataDashboard-D_e1g9lx.js / 1,031,810 / 47d22066…a121d` + `index-ChKXebss.js / 597,519 / b237c8aa…67f1` + `index-1yBoi7Al.js / 87,711 / 638f9f06…dab7` + `index-DubCb24b.css / 158,955 / cabc7535…738f` ALL MATCH | ✓ (21-of-21 cross-phase) |
| Step-4 tsc -b | clean | clean (no output) | ✓ |
| Step-4 vitest run | 259/259 (CI authoritative; darwin may show 258 if calendar.test.tsx:260 fires) | 259/259 PASS (no calendar flake fire) | ✓ |
| Step-4 vite build (SEEDS=true) | ✓ built | ✓ built in 4.04s | ✓ |
| Step-4 vite build (SEEDS=false) | ✓ built | ✓ built in 3.94s | ✓ |
| Step-4 PII guard | 0 leaks | 51 files scanned across 2 roots, 0 leaks (1403ms) | ✓ |
| Step-7 Parity Gate per PR | 16-of-16 SUCCESS via manual-dispatch | ✓ run 25798266867 (16m 37s; axe 8 + screenshot 16) | Step-7 |
| Compliance-row test 5th consecutive empirical PASS | PASS in screenshot-baseline step | ✓ confirmed in 16/16 step pass | Step-7 |
| Step-7 PII Scan per push | success | ✓ run 25798262087 | Step-7 |
| Step-7 CodeRabbit review per PR | pass | ✓ CLEAN PASS at 12:12:43Z | Step-7 |
| §9 row 7.6 squash-SHA cell | TBD → `7b771ec` | ✓ | Plan v2.54 amendment + sweep across reference spots |
| §9 row 7.4 squash-SHA cell (opportunistic catch-up of v2.52 doc-sweep gap) | TBD → `cd26ce4` | ✓ | Plan v2.54 amendment |
| §9 row 7.8 R → ✓ | ✓ | ✓ | Plan v2.54 amendment |

---

## §6. Rollback

Rollback target: `git revert f0b01275bc87851cf39d327c4dee4032d558ff0c` (Phase-7 7.8 close; reverts to 7.6 state at `7b771ec`). Trivial DOC-only revert; no source state to roll back. Phase-7 7.8 squash SHA `f0b0127` (independently revertable; resolved at 7.9 sweep per established convention).

If a future Phase-7 PR surfaces a `compliance-row-workersCompExpiration` regression, the spec-edit fallback (Fix Candidate B from 7.8 PRE0 Q5: per-locator `waitForSelector` with longer timeout) remains available as a future opportunistic edit; no scope conflict with the 7.8 DOC-only closure.

---

## §7. Carry-forward to Phase-7 next-task (7.9 / 7.13 / 7.X) or Phase-8

1. **NEW deferred-item #3 — GR-15 amendment candidate for Plan v2.54+: "Timeout-bump empirical reach may exceed original scope."** When a CI-flake-tolerance-policy in-place scope expansion bumps a timeout/retries field to absorb flake A, run an empirical-reach check at the close of subsequent tasks — the same intervention may also absorb structurally-similar flake B that was scheduled as a separate deferred-item. Concrete pattern: v2.51.1 timeout 60s → 90s absorbed Vendors axe-scan deterministic flake (intent) AND also absorbed compliance-row-workersCompExpiration render-timing flake (empirical side-effect; 7.8 closure). Sister-shape to 7.5's "first-real-execution-as-truth-signal" PRE-FLIGHT discipline note (both speak to the gap between intent-at-amendment-time and empirical-reach-after-execution). **Together with 7.5's deferred-item this forms 2-of-2 cross-phase calibration of "empirical-reach vs amendment-intent" PRE-FLIGHT discipline class.**
2. **MEASUREMENT-ONLY 6pt cross-phase calibration with 5 sub-shapes** (source-rename + with-baseline-recapture + plus-script-rename + with-empirical-finding-and-revert + DOC-only-empirical-void-closure). Class fully calibrated; future Phase-N measurement-style tasks can reach back to any of these sub-shapes by precedent without further class drift.
3. **Cross-class opportunistic-closure constellation 3-of-3 within Phase-7** (Block A item #7 ← 7.5; Block C item #1 ← 7.3; Block A item #8 ← 7.4 v2.51.1). Pattern calibrated at 3pt within Phase-7; recommended for GR-15 PRE-FLIGHT discipline addition: "For carry-forward deferred-items, run an empirical-reach check at the close of any in-place scope expansion or capture-step landing." This is the same discipline as deferred-item #1 above but generalized to all upstream side-effects (not just timeout-bumps).
4. **🎯 Block A 8-of-8 CLOSED — Phase-7 a11y + CI architecture sub-arc entirely complete.** Both blocking-gate arcs end-to-end COMPLETE on Linux CI from main. Remaining Phase-7 work: Block B perf multi-lever (3 items 7.9-7.11) + Block C test-infra stabilization (2 items remaining 7.13 + 7.14). Phase-7 9 of 14 tasks ✓; **5 R tasks left**.
5. **18 consecutive cross-phase sweep-resolutions extended to 19 at 7.8 close** (extends 18-pattern at 7.6 → 19-pattern at 7.8); pattern fully cemented as cross-phase convention through 14+ sweep-resolutions within Phase-7. 7.8 sweep co-ships 7.6 TBD → `7b771ec` / `#61` (planned) + 7.4 TBD → `cd26ce4` opportunistic catch-up of v2.52 doc-sweep gap (substantive process-improvement finding).
6. **Paths-filter quirk HOLDS at 14-task cross-phase scope at 7.8** (7.8 touches only `Docs/**` + root `CLAUDE.md`; no new file domain; manual-dispatch expected at PR open since `qualia-shell/src/**` filter doesn't cover doc-only edits and 7.8 doesn't touch `.github/workflows/**` either).
7. **Chunk-axis preservation 21-of-21 cross-phase data point post-LAW-retirement at 7.8 close** (Phase-6 9pt + Phase-7 6pt [7.2 + 7.3 + 7.4 + 7.5 + 7.6 + 7.8] = 15 within-Phase-6+7; Phase-5 6 LAW + Phase-6 8 + Phase-7 7 [counting v2.51.1 in-place patch] = 21 cross-phase cumulative; very strong inductive evidence at scale; DOC-only edits fully outside Vite entry graph).

---

## §8. Process discoveries (GR-15 PERMANENT process amendments)

**Recommended amendment for Plan v2.54+ (1 candidate)**: Timeout-bump-empirical-reach-discipline as PRE-FLIGHT step. The deferred-item #3 captured at §7 above is the concrete form. Phrasing draft:

> **PRE-FLIGHT step: At the close of any in-place scope expansion that bumps a CI-flake-tolerance-policy field (retries / timeout / continue-on-error / etc.) OR after any capture-step that lands artifacts touching paths shared with multiple deferred-items, run an empirical-reach check against the open deferred-items ledger. The intervention may have absorbed an unrelated deferred-item as side-effect (sister-pattern to opportunistic-closure constellation: 7.3 v2.50.1 closed Block C item #1; 7.5 `--update-snapshots` closed Block A item #7; 7.4 v2.51.1 closed Block A item #8 at 7.8). If an empirical-reach absorption is detected, close the affected deferred-item opportunistically via a DOC-only-empirical-void-closure task (sister to Task 7.8).**

**No prior-amendment refinements at 7.8** (existing GR-15 amendments at v2.42 PRE0 math-exactness + v2.43 build-mode-aware chunk-axis comparison protocol carry forward unchanged; v2.46 Lighthouse measurement variance characterization remains a deferred candidate awaiting 7.11 empirical signal).

---

**End of Phase-7 Task 7.8 Completion Report.**
