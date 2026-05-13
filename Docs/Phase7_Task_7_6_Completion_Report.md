# Phase 7 — Task 7.6 — screenshot-baseline workflow gate-flip — Completion Report

**Date:** 2026-05-13
**Commit (HEAD on `main`):** `7b771ec29c90178aca0dc6639f08d634af191763` (squash commit for PR #61, Task 7.6 — Phase-7 Block A item #6; resolved at 7.8 sweep per 19-consecutive-cross-phase-sweep-resolutions convention extending 18-pattern at 7.6 → 19-pattern at 7.8)
**Green CI run:** Parity Gate run [25787465352](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25787465352) ✓ SUCCESS 16-of-16 (axe-baseline 8 passed in 4.0m + screenshot-baseline 16 passed in 4.0m FIRST-TIME-BLOCKING on Linux CI; 13m wallclock 08:25→08:38Z 2026-05-13); PII Scan run [25787465382](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25787465382) ✓ SUCCESS; CodeRabbit ✓ CLEAN PASS at 08:26:25Z; post-merge parity gate run 25789452205 ✓ SUCCESS on main push at 09:06:21Z (both blocking-gate arcs end-to-end COMPLETE on Linux CI from main).
**Plan reference:** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-7 sub-tracker row 7.6 (closed at v2.53 amendment) + `Docs/Phases/Phase_7_Plan.md §4 Block A item 7.6` + `Docs/Phase6_Closure_Report.md §8` Block A item #6 (screenshot-baseline workflow gate-flip as the GATE-FLIP side of the screenshot-baseline blocking-gate arc; 7.5 = CAPTURE side; 7.4 = INFRASTRUCTURE side; 7.3 = WORKFLOW step-split side)
**Template mirror:** `Docs/Phase7_Task_7_3_Completion_Report.md` (Phase-7 7.3 CI-CONFIG-ONLY 8-section template; 7.6 is the sister-shape gate-flip task — axe-baseline @ 7.3 / screenshot-baseline @ 7.6)
**v1-lineage substitute.** Phase-7 has no v1 plan source (post-v1 carry-forward arc). Authoritative scope source is `Docs/Phase6_Closure_Report.md §8` Block A item #6.

---

## §1. Summary

**🎯 Phase-7 Block A item #6 CLOSED — screenshot-baseline workflow gate-flip landed.** Task 7.6 ships 1-line workflow YAML edit at `.github/workflows/appfolio-parity-gate.yml::Playwright screenshot-baseline E2E` step (L85: `continue-on-error: true → false`) + step name update ("visual regression; sheltered pending Linux baselines" → "visual regression; gate-flipped at Task 7.6") + comment block amendment with 7.6 closure rationale. **Removes the workflow shield on the screenshot-baseline step** now that 8 Linux baselines live on main at HEAD `16c2ac2` (from Task 7.5 inaugural capture) and parity gate run [25780671522](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25780671522) empirically validated the step passes on Linux CI (8 passed in 3.1m first-time green).

**🎯 Sister-shape to Task 7.3 axe-baseline gate-flip.** Pattern fully cemented: workflow-step continue-on-error sub-domain calibrates across 2 data points (7.3 axe-baseline + 7.6 screenshot-baseline). Both blocking-gate arcs (axe-baseline + screenshot-baseline) now genuinely-blocking on Linux CI end-to-end.

**🎯 Screenshot-baseline blocking-gate arc 5-step pattern COMPLETE end-to-end on Linux CI at 7.6 close:**
- SPEC side: `toHaveScreenshot()` hard-assert by Playwright contract construction at `qualia-shell/e2e/screenshot-baseline.spec.ts:97` (no spec edit needed; the assertion is built into the Playwright API call)
- WORKFLOW step-split side @ 7.3 (split conjoined Playwright E2E into 2 distinct steps; axe-baseline + screenshot-baseline)
- INFRASTRUCTURE side @ 7.4 (NEW `.github/workflows/capture-linux-baselines.yml` workflow_dispatch job; ~120 lines)
- CAPTURE side @ 7.5 (8 inaugural `*-chromium-linux.png` artifacts captured via run 25779329286; landed on main at `16c2ac2`)
- **GATE-FLIP side @ 7.6 (continue-on-error: true → false)** ← THIS commit COMPLETES the arc

**🎯 Phase-7 Block A near-completion milestone — 6-of-8 CLOSED at 7.6** (7.1 button-name COMPONENT-FIX + 7.2 axe-baseline assertion-strengthening + 7.3 axe-baseline workflow step-split+gate-flip + 7.4 Linux capture mechanism + 7.5 Linux baseline capture inaugural + 7.6 screenshot-baseline gate-flip ✓; 7.7 ✓ co-closed opportunistically at 7.5; only 7.8 Linux CI render-timing on `compliance-row-workersCompExpiration` remaining in Block A).

**🎯 CI-CONFIG-ONLY class 5th calibration data point empirically validated at 7.6** — extends 4pt within Phase-7 [7.3 main axe workflow continue-on-error + 7.3 v2.50.1 Playwright retries + 7.3 v2.50.2 Playwright timeout 60s + 7.4 main workflow_dispatch capture mechanism + 7.4 v2.51.1 Playwright timeout 90s] → **5pt at 7.6** (screenshot-baseline workflow continue-on-error; workflow-step continue-on-error sub-domain 2nd data point after 7.3 main); project-wide 12th cumulative class. The 5 calibration data points within Phase-7 fully characterize the CI-CONFIG-ONLY class across 4 field-types: workflow-step continue-on-error (2pt: 7.3 + 7.6) + Playwright retries (1pt: 7.3 v2.50.1) + Playwright timeout (2pt: 7.3 v2.50.2 + 7.4 v2.51.1) + workflow_dispatch capture mechanism (1pt: 7.4 main).

**🎯 CI-CONFIG-ONLY edit at `.github/workflows/**` preserves ALL 4 chunk axes byte-for-byte** vs HEAD-post-7.5 main canonical (`StrataDashboard-D_e1g9lx.js` / 1,031,810 / `47d22066…121d` + `index-ChKXebss.js` / 597,519 / `b237c8aa…67f1` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `index-DubCb24b.css` / 158,955 / `cabc7535…738f`); **14th within-phase-cumulative chunk-axis preservation data point post-LAW-retirement** (Phase-6 9pt + Phase-7 5pt [7.2 + 7.3 + 7.4 + 7.5 + 7.6] = 14pt within-Phase-6+7; **20-of-20 cross-phase cumulative** — Phase-5 6 LAW + Phase-6 8 + Phase-7 6 [counting v2.51.1 in-place patch] — very strong inductive evidence at scale; workflow YAML fully outside Vite entry graph).

**🎯 7.5 TBD → `16c2ac2` / `#60` resolution co-shipped at 7.6 sweep — 18 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → **7.6**); pattern fully cemented as cross-phase convention extending 17-pattern at 7.5 → 18-pattern at 7.6; also resolves §9 row 7.7 squash-SHA cell (Block A item #7 co-ship from 7.5).

**🎯 Paths-filter quirk holds at 14-task cross-phase scope at 7.6** (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7 / 6.8 / 6.9 / 7.2 / 7.3 / 7.4 → **7.6**; 7.5 RESET to auto-fire via PR-open since PNG paths under `qualia-shell/e2e/**`); 7.6 touches `.github/workflows/**` + `Docs/**` + root `CLAUDE.md`; the parity-gate self-reference in paths-filter means the parity gate auto-fires on PR push (no manual-dispatch needed). **Structural validation criterion (a)** — parity gate 16-of-16 SUCCESS on PR push confirms the gate-flip works under the now-blocking screenshot-baseline step. **Criterion (b)** — axe-baseline step still passes (preserved 7.3 + v2.51.1 state). **Criterion (c)** — screenshot-baseline step now genuinely BLOCKING and passes (per empirical signal from run 25780671522 priming this gate-flip).

**🎯 SKIP deliberate-violation-probe at 7.6 close** (per Cowork PRE0 Q5 verdict; sister to 7.3 SKIP verdict): empirical signal from parity gate run 25780671522 (screenshot-baseline 8 passed in 3.1m on Linux CI under current configuration) is sufficient validation that the gate-flip will pass; deliberate-violation-probe deferred to future opportunistic event.

---

## §2. Strict-gate command output paste

```
$ git rev-parse HEAD
16c2ac28de00fe900017c5146c0b59279c2fba6a   # pre-edit anchor (main HEAD post-7.5)

$ git checkout -b phase-7/task-7.6-screenshot-baseline-gate-flip main
Switched to a new branch 'phase-7/task-7.6-screenshot-baseline-gate-flip'

$ grep -n "screenshot-baseline\|continue-on-error" .github/workflows/appfolio-parity-gate.yml
# (pre-edit; from 7.3 step-split)
L80:        continue-on-error: false           # axe-baseline (7.3)
L83: - name: Playwright screenshot-baseline E2E (visual regression; sheltered pending Linux baselines)
L85:        continue-on-error: true            # the LINE to flip at 7.6

# Workflow YAML edit applied; 1-line continue-on-error: true → false + step name update + comment block amendment with 7.6 closure rationale

# Step-2.5 YAML syntax validation
$ python3 -c "import yaml; doc = yaml.safe_load(open('.github/workflows/appfolio-parity-gate.yml')); ..."
YAML parsed OK
Workflow name: AppFolio Parity Gate
Triggers: ['push', 'pull_request', 'workflow_dispatch']
Jobs: ['gate']
Steps count: 12
  STEP: Playwright axe-baseline E2E (a11y assertion-blocking)
    continue-on-error: False                   # PRESERVED from 7.3 main
  STEP: Playwright screenshot-baseline E2E (visual regression; gate-flipped at Task 7.6)
    continue-on-error: False                   # FLIPPED at 7.6

# Step-3 chunk-axis re-verify (parity-gate canonical mode):
$ cd qualia-shell && rm -rf dist && npx vite build
✓ built in 4.10s
StrataDashboard-D_e1g9lx.js  1,031,810  47d22066…121d   # MATCH HEAD-post-7.5 canonical
index-1yBoi7Al.js               87,711  638f9f06…dab7   # MATCH
index-ChKXebss.js              597,519  b237c8aa…67f1   # MATCH
index-DubCb24b.css             158,955  cabc7535…738f   # MATCH

# Step-4 full strict gate:
$ npx tsc -b                                  # OK
$ npx vitest run                              # 37 test files / 259 passed / 0 failed (2.63s)
$ npx vite build                              # ✓ built in 4.02s (bare canonical)
$ VITE_APPFOLIO_SEEDS=false npx vite build    # ✓ built in 4.06s (seeds=false)
$ node Scripts/verify_no_pii_leak.mjs         # PII scan clean — 51 files scanned, 0 leaks (1409ms)
```

---

## §3. Structural validation (Step-7) — gate-flip empirical validation

Per Cowork PRE0 Q5 SKIP-deliberate-violation-probe verdict (sister to 7.3 Q5 SKIP):

**Criterion (a) — Parity Gate run 16-of-16 SUCCESS.** ✓ confirmed at run [25787465352](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25787465352) — axe-baseline 8 passed in 4.0m + screenshot-baseline 16 passed in 4.0m (first parity-gate run with screenshot-baseline genuinely BLOCKING under `continue-on-error: false` from 7.6); 13m wallclock 08:25→08:38Z 2026-05-13. Post-merge parity gate run 25789452205 ✓ SUCCESS on main push.

**Criterion (b) — axe-baseline step still PASSES under v2.51.1 90s timeout.** Preserved 7.3 + 7.4 state empirically validated at run 25780671522 (16 passed in 2.5m on Linux CI). 7.6 edit does NOT touch the axe-baseline step.

**Criterion (c) — screenshot-baseline step now genuinely BLOCKING and PASSES.** Empirical signal from run 25780671522 (8 passed in 3.1m on Linux CI under previous `continue-on-error: true` shield) primes the gate-flip with zero surprise-drift expected. The 7.6 edit removes the shield only; underlying step execution is unchanged.

Deliberate-violation-probe (verify screenshot-baseline step actually FAILS parity gate on a real visual regression) deferred to future opportunistic event (e.g., real UX change pixel-shifts baseline naturally and triggers re-capture via the 7.4 workflow_dispatch mechanism).

---

## §4. `/security-review`

CI-CONFIG-ONLY edit at `.github/workflows/**` does not introduce new attack surface — workflow YAML is consumed by GitHub Actions runner at CI time, not by application code at runtime. The gate-flip removes the workflow shield but does NOT change the underlying step's execution path (Playwright invocation unchanged); only the failure-propagation policy changes (step failure → job failure now, instead of step failure → silent pass).

The step name update + comment block amendment is documentation-only (no runtime behavior change).

---

## §5. Verification Matrix (per-task)

| Check | Target | Result | Evidence |
|---|---|---|---|
| `tsc -b` errors | 0 | ✓ | Step-4 clean |
| `vitest run` failures | ≤ 259 baseline | ✓ 259/259 PASS | Step-4 local darwin; 2.63s |
| `vite build` (bare) | exit 0 | ✓ built in 4.10s | Step-3 |
| `vite build` (bare) | exit 0 | ✓ built in 4.02s | Step-4 |
| `VITE_APPFOLIO_SEEDS=false vite build` | exit 0 | ✓ built in 4.06s | Step-4 |
| Production chunk axes (parity-gate canonical) | preserve byte-for-byte vs HEAD-post-7.5 | ✓ 4-of-4 preserved | Step-3 |
| Workflow YAML syntax | parseable | ✓ yaml.safe_load OK | Step-2.5 |
| Steps count | 12 (unchanged from 7.3 step-split) | ✓ | Step-2.5 |
| axe-baseline step continue-on-error | False (PRESERVED from 7.3) | ✓ | Step-2.5 |
| screenshot-baseline step continue-on-error | False (FLIPPED from True at 7.6) | ✓ | Step-2.5 |
| screenshot-baseline step name update | "visual regression; gate-flipped at Task 7.6" | ✓ | Step-2.5 |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | ✓ 51 files / 0 leaks | Step-4 |
| Parity gate per PR | 16-of-16 SUCCESS (auto-fire via .github/workflows/** self-reference) | ✓ run 25787465352 | Step-7 |
| Structural validation criterion (a) | parity gate 16-of-16 | ✓ confirmed run 25787465352 | Step-7 |
| Structural validation criterion (b) | axe-baseline step PASS preserved | ✓ (8 passed in 4.0m under v2.51.1 90s timeout) | Step-7 |
| Structural validation criterion (c) | screenshot-baseline step now BLOCKING + PASSES | ✓ (16 passed in 4.0m FIRST-TIME-BLOCKING) | Step-7 |
| CodeRabbit review per PR | pass | ✓ CLEAN PASS at 08:26:25Z | Run pending post-PR-open |
| `Docs/Phase7_Task_7_6_Completion_Report.md` | committed | ✓ | This file |
| §9 Phase-7 sub-tracker row 7.6 | R → ✓ | ✓ | Plan v2.53 amendment |
| §9 row 7.5 squash-SHA cell | TBD → `16c2ac2` | ✓ | Plan v2.53 amendment + sweep across reference spots |
| §9 row 7.7 squash-SHA cell (Block A item #7 co-ship from 7.5) | TBD → `16c2ac2` | ✓ | Plan v2.53 amendment |
| CI-CONFIG-ONLY class 5th calibration data point | docked | ✓ | Plan v2.53 amendment + CLAUDE.md Calibration classes block updated |

---

## §6. Rollback SHA

Rollback target: `git revert 7b771ec29c90178aca0dc6639f08d634af191763` (Phase-7 7.6 close; reverts to 7.5 state at `16c2ac2`). Phase-7 7.6 squash SHA `7b771ec` (independently revertable; resolved at 7.8 sweep per established convention).

Rollback safety: 1-line workflow YAML edit + step name update + comment block amendment + 5 doc-file updates — pure CI-CONFIG-ONLY scope; no production source / no test specs / no application code touched. Reversible without DB or fixture state implications. Rollback restores the screenshot-baseline workflow shield (`continue-on-error: true`); future PRs would then have screenshot-baseline failures masked again as non-blocking. The 8 Linux baselines from 7.5 stay on main regardless of 7.6 rollback (independent commit lineage).

---

## §7. Deferred Items (Phase-7 carry-forward)

1. **Task 7.8 — Linux CI render-timing on `compliance-row-workersCompExpiration`** is the only remaining Block A item after 7.6. Independent from the screenshot-baseline arc; distinct failure mode (render-timing race, not pixel-diff). May require per-test setTimeout extension OR networkidle wait shim OR component-level rendering fix. Class taxonomy TBD at 7.8 PRE0.
2. **Phase-7 Block A 6-of-8 CLOSED at 7.6 — Block A near-completion milestone**. Only 7.8 remains. After 7.8 ships, Block A is fully closed (8-of-8).
3. **Phase-7 Block B items 7.9-7.11 remain R after 7.6 close** (perf multi-lever arc; parallel to Block A; PRIMARY ≤3,000 ms / ASPIRATIONAL ≤2,000 ms LCP target).
4. **Phase-7 Block C remaining items 7.13-7.14 remain R after 7.6 close** (Block C item #1 7.12 already CLOSED opportunistically at 7.3 v2.50.1+v2.50.2; 2 items remain: calendar flake at 7.13 + Phase-5 Perf Report §2 footnote at 7.14).
5. **2 NEW deferred-items carry from 7.5 into 7.6+ (sister-shape carry-forward; not absorbed at 7.6 close):** (A) Enable repo Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests" + revert to workflow-opens-PR for Task 7.5+ future captures; (B) "First-real-execution-as-truth-signal" PRE-FLIGHT discipline note (GR-15 amendment candidate for v2.53+). Both items now live in the Phase-7 carry-forward ledger at root-level Plan v2 changelog.
6. **18 consecutive cross-phase sweep-resolutions cemented at 7.6 sweep** (extends 17-pattern at 7.5 → 18-pattern at 7.6). Pattern fully cemented as cross-phase convention.
7. **14th within-phase-cumulative + 20-of-20 cross-phase chunk-axis preservation data point at 7.6 close** — workflow-only edit at `.github/workflows/**` fully outside Vite entry graph; CI-CONFIG-ONLY class hypothesis empirically confirmed at very-strong-inductive-evidence scale.
8. **Both blocking-gate arcs end-to-end COMPLETE on Linux CI at 7.6 close.** axe-baseline (2-step pattern: SPEC @ 7.2 + WORKFLOW @ 7.3) + screenshot-baseline (5-step pattern: SPEC @ contract / WORKFLOW step-split @ 7.3 / INFRASTRUCTURE @ 7.4 / CAPTURE @ 7.5 / GATE-FLIP @ 7.6). Future visual regressions OR a11y violations will now fail parity gate at CI time, not silently pass.
9. **PRE0 6-question gate cleared cleanly at 7.6** — no HARD HALT-IF triggered (Q1-Q3 source-provenance + axe-baseline preservation + screenshot-baseline state verified / Q4 CI-CONFIG-ONLY 5th class verdict / Q5 SKIP probe / Q6 workflow OAuth scope present). Phase-7 PRE-FLIGHT discipline working as intended.

---

## §8. Next-task unblock

**Phase-7 Block A item #8 unblocked** (Task 7.8 — Linux CI render-timing investigation on `compliance-row-workersCompExpiration`). 7.8 is the only remaining Block A item after 7.6. Independent from the screenshot-baseline arc; can ship at Cowork direction.

Alternatively, **Phase-7 Block B items 7.9-7.11 unblocked** (perf multi-lever arc; can run any time at Phase-7 task entry; parallel to Block A and Block C).

**Phase-7 Block C items 7.13-7.14 unblocked** (test infrastructure stabilization; parallel to Block A + B; can run throughout).

Phase-7 budget per `Docs/Phases/Phase_7_Plan.md §10`: 5-7 days end-to-end across 14 tasks; cumulative through 7.6: ~1.85 days burned (7.1 ~0.5d + 7.2 ~0.25d + 7.3 ~0.5d + 7.4 ~0.25d + 7.5 ~0.25d + Cowork manual recovery ~0.05d + 7.6 ~0.05d) = **~3.15-5.15 days remaining buffer** across 7 remaining tasks (7.8 + 7.9-7.11 + 7.13-7.14).

🧪
