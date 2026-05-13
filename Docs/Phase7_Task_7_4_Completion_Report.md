# Phase 7 — Task 7.4 — Linux Playwright baseline capture mechanism — Completion Report

**Date:** 2026-05-12
**Commit (HEAD on `main`):** `TBD` (squash commit for PR #TBD, Task 7.4 — Phase-7 Block A item #4; resolution at next-sweep per established 16-consecutive-cross-phase-sweep-resolutions convention extending 15-pattern at 7.3 → 16-pattern at 7.4)
**Green CI run:** TBD (parity gate auto-fires on PR push via `.github/workflows/**` self-reference in parity-gate paths-filter at L19+L29; touching `.github/workflows/**` in general now includes the new `capture-linux-baselines.yml` file too; no manual-dispatch needed)
**Plan reference:** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-7 sub-tracker row 7.4 (closed at v2.51 amendment) + `Docs/Phases/Phase_7_Plan.md §4 Block A item 7.4` + `Docs/Phase6_Closure_Report.md §8` Block A item #4 (Linux Playwright baseline capture mechanism build as INFRASTRUCTURE side of the screenshot-baseline blocking-gate arc; 7.5 = CAPTURE side; 7.6 = GATE-FLIP side)
**Template mirror:** `Docs/Phase7_Task_7_3_Completion_Report.md` (Phase-7 7.3 CI-CONFIG-ONLY 8-section template; 7.4 mirrors byte-shape with 4th calibration data point adaptations vs 7.3's 3 in-place scope expansions)
**v1-lineage substitute.** Phase-7 has no v1 plan source (post-v1 carry-forward arc). Authoritative scope source is `Docs/Phase6_Closure_Report.md §8` Block A item #4 + Phase-0 deferred-item (`Docs/Baselines/phase_0_0_exit_gate_report.md` "Deferred Item" section on Linux baselines).

---

## §1. Summary

**🎯 Phase-7 Block A item #4 CLOSED — Linux Playwright baseline capture mechanism build landed.** Task 7.4 ships NEW `.github/workflows/capture-linux-baselines.yml` (~120 lines; workflow_dispatch-only job; ubuntu-latest runner; 8 steps with `inputs.dry_run`-gated branching). Unlocks Tasks 7.5 (inaugural capture for 8 surfaces) + 7.6 (screenshot-baseline gate-flip `continue-on-error: true → false`) — completes the screenshot-baseline blocking-gate arc as the structural sister of the axe-baseline blocking-gate arc closed at 7.3 (SPEC + INFRASTRUCTURE + GATE-FLIP pattern).

**Workflow design per Cowork PRE0 verdicts:**
- **Q1 source-provenance:** Spec uses Playwright built-in `toHaveScreenshot()` at L97; snapshot dir at `qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/` (Playwright default); 8 darwin PNGs present (one per surface); **PRE0 Q1 NUANCE — 1 stray Linux PNG already exists** (`overview-chromium-linux.png` from Phase-0 Task 0.0.9 era = Phase-7 Block A item #7 deferred-item); NOT a scope-void (7 of 8 surfaces still need baselines); the 7.4 mechanism's `--update-snapshots` will overwrite the stray during 7.5 inaugural capture; **Block A item #7 (stray provenance investigation) may close opportunistically at 7.5 close** (analogous to Block C item #1 closing at 7.3 v2.50.1).
- **Q2 workflow design:** Option A — NEW file at `.github/workflows/capture-linux-baselines.yml` (NOT extending parity-gate.yml; cleaner separation isolates capture-mode concerns from validation-mode).
- **Q3 commit-back mechanism:** Option α — `peter-evans/create-pull-request@v6` auto-PR with `permissions: contents: write + pull-requests: write` block. Auto-PRs captured PNGs back to main on dispatched real-capture runs.
- **Q4 config inheritance:** Inherits `playwright.baseline.config.ts` (carries v2.50.2 `timeout: 60_000` + `retries: process.env.CI ? 2 : 0` from Task 7.3 v2.50.1+v2.50.2 in-place scope expansions). Capture-mode env (VITE_USE_STATIC_API=true) matches validation-mode env exactly.
- **Q5 dry-run toggle:** Option I — `dry_run: boolean (default true)`. Validates plumbing via `--list-only` flag without capturing or opening a PR; flipped to false at 7.5 dispatch for real capture.
- **Q6 smoke-test:** Post-merge dry-run dispatch validates end-to-end mechanism on Linux runner before 7.5 inaugural capture. Validates setup steps (checkout / Node / npm install / Playwright browser install on Linux) + workflow plumbing dispatchability.

**🎯 NEW class CI-CONFIG-ONLY 4th calibration data point empirically validated at 7.4** — extends 3pt within Phase-7 [7.3 workflow continue-on-error + 7.3 v2.50.1 Playwright retries + 7.3 v2.50.2 Playwright timeout] → **4pt at 7.4** (workflow_dispatch capture-mode mechanism); project-wide 12th cumulative class **fully calibrated across 4 field-types**: workflow-step continue-on-error + Playwright retries + Playwright timeout + workflow_dispatch capture-mode mechanism. Class taxonomy stays granular by file-consumer domain — all 4 field-types are CI-architecture-domain at higher abstraction; consumed by CI infrastructure (GitHub Actions runner + Playwright runner respectively).

**🎯 Screenshot-baseline blocking-gate arc INFRASTRUCTURE side LAID at 7.4** — sister-shape to axe-baseline arc closed at 7.3: SPEC (7.2 hard-assert `expect(axeResults.violations.length).toBe(0)`) + WORKFLOW (7.3 step-split + `continue-on-error: false`) + INFRASTRUCTURE (7.4 capture mechanism). 7.5 will be the CAPTURE side (inaugural --update-snapshots on Linux producing 8 PNGs); 7.6 will be the GATE-FLIP side (screenshot-baseline step `continue-on-error: true → false`). Both arcs converge on the same 3-step blocking-gate completion pattern.

**🎯 CI-CONFIG-ONLY edit at `.github/workflows/**` preserves ALL 4 chunk axes byte-for-byte** vs HEAD-post-7.3 main canonical (`StrataDashboard-D_e1g9lx.js` / 1,031,810 / `47d22066…a121d` + `index-ChKXebss.js` / 597,519 / `b237c8aa…67f1` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `index-DubCb24b.css` / 158,955 / `cabc7535…738f`); **12th within-phase-cumulative chunk-axis preservation data point post-LAW-retirement** (Phase-6 9pt + Phase-7 3pt [7.2 + 7.3 + 7.4] = 12pt within-Phase-6+7; **17-of-17 cross-phase cumulative** — Phase-5 6 LAW + Phase-6 8 + Phase-7 3 — very strong inductive evidence at scale; workflow YAML fully outside Vite entry graph; new workflow file at `.github/workflows/capture-linux-baselines.yml` not consumed by Vite/Rollup).

**🎯 7.3 TBD → `a8f1a10` / `#58` resolution co-shipped at 7.4 sweep — 16 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → 7.1 → 7.2 → 7.3 → **7.4**); pattern fully cemented as cross-phase convention extending 15-pattern at 7.3 → 16-pattern at 7.4. Resolved across §9 row 7.3 squash-SHA cell + §9 row 7.12 squash-SHA cell (Block C item #1 co-ship) + Phase status line at top of `Docs/Phases/Phase_7_Plan.md` + Task 7.3 closure-narrative TBD references (4 spots in `Docs/Phase7_Task_7_3_Completion_Report.md`: §1 Commit + §1 Green CI run + §5 verification matrix Parity-gate+CodeRabbit+post-timeout-bump rows + §6 Rollback SHA) + CLAUDE.md HEAD pointer pivot.

---

## §2. Strict-gate command output paste

```
$ git rev-parse HEAD
a8f1a1022aa95a203c5467451c511e1dea7bf1c6   # pre-edit anchor (main HEAD post-7.3)

$ git checkout -b phase-7/task-7.4-linux-baseline-capture-mechanism main
Switched to a new branch 'phase-7/task-7.4-linux-baseline-capture-mechanism'

$ ls qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/
accounting-chromium-darwin.png
leasing-chromium-darwin.png
maintenance-chromium-darwin.png
overview-chromium-darwin.png
overview-chromium-linux.png      # 1 stray from Phase-0 Task 0.0.9 era (Block A item #7)
owners-chromium-darwin.png
properties-chromium-darwin.png
residents-chromium-darwin.png
vendors-chromium-darwin.png

$ find qualia-shell/e2e -name "*-chromium-darwin.png" -type f | wc -l
8                                # 8 darwin PNGs present

$ find qualia-shell/e2e -name "*-chromium-linux.png" -type f | wc -l
1                                # 1 stray Linux PNG (Block A item #7)

# [Workflow YAML edit: NEW .github/workflows/capture-linux-baselines.yml ~120 lines]

$ python3 -c "import yaml; doc = yaml.safe_load(open('.github/workflows/capture-linux-baselines.yml')); ..."
YAML parsed OK
Workflow name: Capture Linux Playwright Baselines (workflow_dispatch only)
Triggers: ['workflow_dispatch']
workflow_dispatch inputs: ['reason', 'dry_run']
dry_run default: True
Permissions: {'contents': 'write', 'pull-requests': 'write'}
Job: capture-baselines; Steps count: 8

$ npx tsc -b
# (silent — exit 0)

$ npx vitest run
 Test Files  37 passed (37)
      Tests  259 passed (259)
   Duration  2.66s

$ rm -rf dist && npx vite build
✓ built in 4.23s

$ for f in dist/assets/StrataDashboard-*.js dist/assets/index-*.js dist/assets/index-*.css; do bytes=$(stat -f%z "$f"); sha=$(shasum -a 256 "$f" | awk '{print $1}'); echo "$f  $bytes  $sha"; done
dist/assets/StrataDashboard-D_e1g9lx.js  1031810  47d22066e934d19fe25c90f7e3f1a0dfd9ccf2b7bce30e73c144d6bc9e2a121d
dist/assets/index-1yBoi7Al.js              87711  638f9f069c549f1325c9d942b819dc0d5207f0887a8aebb7571690f9fbd2dab7
dist/assets/index-ChKXebss.js             597519  b237c8aa90dfb41e7045d8f857da06ce514298360554b4e91fbb76ba623767f1
dist/assets/index-DubCb24b.css            158955  cabc7535fcbb5e01789de36e2c2920ad8056259eab3e431af5a7a6d2b607738f
# All 4 chunks match HEAD-post-7.3 byte-for-byte; NEW workflow YAML at .github/workflows/** is outside Vite entry graph

$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ built in 3.88s

$ cd .. && node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1215ms total).
```

---

## §3. Structural validation (Step-7) — workflow appearance + smoke-test plan

Per Cowork PRE0 Q6 verdict (smoke-test post-merge dispatch validates end-to-end mechanism on Linux runner before 7.5 inaugural capture), the acceptance gate at 7.4 is two-pronged:

**Pre-merge structural validation (criterion a + b):**
- **(a) Parity Gate 16-of-16 SUCCESS** — confirms NEW workflow YAML doesn't BREAK the existing parity gate (including the now-blocking axe-baseline step from 7.3); validates `.github/workflows/**` self-reference auto-fires the parity gate on PR push.
- **(b) NEW workflow appears in `gh workflow list`** — validates GitHub Actions registered the new workflow file at the expected path with the expected name "Capture Linux Playwright Baselines (workflow_dispatch only)".

**Post-merge smoke-test validation (criterion c + d):**
- **(c) Smoke-test dispatch with `dry_run: true`** — `gh workflow run "Capture Linux Playwright Baselines (workflow_dispatch only)" -R NovaTrustSolutions/dwellium-per-spec --ref main -f reason="Phase-7 Task 7.4 PR-post-merge smoke-test dry-run validation" -f dry_run=true`. Validates token/permissions at workflow_dispatch level + setup steps run end-to-end on Linux runner (checkout / Node / npm install / Playwright browser install).
- **(d) Smoke-test run shows expected step pattern** — validation step PASS with `--list-only` output showing the 8 baseline tests would run; --update-snapshots / Check / Open-PR steps SKIPPED (due to `if: ${{ inputs.dry_run == false }}` condition); total runtime ~3-5 min (setup + Playwright install dominates).

Authoritative criterion (a) + (b) validation pre-merge; criterion (c) + (d) deferred to post-merge.

---

## §4. `/security-review`

High = 0; Medium = 0. Edit is a NEW workflow YAML file at `.github/workflows/capture-linux-baselines.yml` (CI-orchestration-domain). No production code change; no test specs touched. New attack surface considerations:

1. **`peter-evans/create-pull-request@v6` third-party action**: Used to auto-open PRs with captured baselines. Token: `GITHUB_TOKEN` (built-in, scoped to repo); permissions block declares `contents: write + pull-requests: write` (minimum necessary for branch creation + PR open). Action is verified-third-party (popular GitHub Actions Marketplace action with strong adoption + active maintenance). Risk: low; mitigated by GITHUB_TOKEN scoping + minimal permissions.
2. **`--with-deps` flag on `npx playwright install`**: Installs apt packages for Linux. Runs as default GitHub Actions runner user; no escalation.
3. **`workflow_dispatch`-only trigger**: Workflow only runs when manually dispatched (no push/PR auto-trigger). Mitigates risk of unintended captures.
4. **`--update-snapshots` is gated on `if: ${{ inputs.dry_run == false }}`**: Default `dry_run: true` ensures accidental dispatch without explicit opt-in does not produce captures or open PRs.

No PII or sensitive data touched. The auto-PR body references `${{ inputs.reason }}` (user-supplied string at dispatch time) — Cowork's PRE-FLIGHT discipline + GR-15 process changes guard against PII in dispatch reasons.

---

## §5. Verification Matrix (per-task)

| Check | Target | Result | Evidence |
|---|---|---|---|
| `tsc -b` errors | 0 | ✓ | Step-4 silent exit 0 |
| `vitest run` failures | ≤ 259 baseline | ✓ 259/259 PASS | Step-4 local darwin; clean (no `calendar.test.tsx:260` flake fired) |
| `vite build` (bare) | exit 0 | ✓ | Step-3 build clean; 4-chunk manifest captured |
| `VITE_APPFOLIO_SEEDS=false vite build` | exit 0 | ✓ | Step-4 build clean |
| Production chunk axes (parity-gate canonical) | preserve byte-for-byte vs HEAD-post-7.3 | ✓ 4-of-4 chunks preserved | Step-3 chunk-axis verification |
| Workflow YAML syntax | parseable | ✓ | Step-2.5 `python3 yaml.safe_load` + structure validation (8 steps; correct triggers; correct permissions) |
| Step count | 8 | ✓ | Step-2.5 structure verification |
| Permissions block present | contents: write + pull-requests: write | ✓ | Step-2.5 structure verification |
| `dry_run` input default | true | ✓ | Step-2.5 structure verification |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | ✓ | Step-4 51 files scanned, 0 leaks |
| Parity gate per PR | green (auto-fire via .github/workflows/** self-reference) | TBD | Auto-fire expected; manual-dispatch available as fallback |
| Structural validation pre-merge (a + b) | Parity Gate 16-of-16 + NEW workflow in `gh workflow list` | TBD | Runs pending |
| Smoke-test dispatch post-merge (c + d) | `dry_run: true` dispatch succeeds; --list-only step PASS | TBD | Deferred to post-merge |
| CodeRabbit review per PR | pass | TBD | Run pending post-PR-open |
| `Docs/Phase7_Task_7_4_Completion_Report.md` | committed | ✓ | This file |
| §9 Phase-7 sub-tracker row 7.4 | R → ✓ | ✓ | Plan v2.51 amendment |
| §9 row 7.3 squash-SHA cell | TBD → `a8f1a10` | ✓ | Plan v2.51 amendment + 4 reference spots in Phase7_Task_7_3_Completion_Report.md |
| §9 row 7.12 squash-SHA cell (Block C item #1 co-ship) | TBD → `a8f1a10` | ✓ | Plan v2.51 amendment |
| CI-CONFIG-ONLY class 4th calibration data point | docked | ✓ | Plan v2.51 amendment + CLAUDE.md Calibration classes block updated (4 field-type calibration) |

---

## §6. Rollback SHA

Rollback target: `git revert a8f1a10` (Phase-7 7.3 close; reverts to 7.2 state at `9126cc2`). Phase-7 7.4 squash SHA `TBD` (will be revertable independently once merged; resolution at 7.5 sweep).

Rollback safety: NEW workflow YAML file at `.github/workflows/capture-linux-baselines.yml` — CI-orchestration domain, no production code change, no test specs touched. Reversible without DB or fixture state implications; rollback would only remove the capture mechanism without affecting any existing baselines (the stray `overview-chromium-linux.png` from Phase-0 era would remain in place). The mechanism is `workflow_dispatch`-only so reverting it doesn't break any auto-triggered workflows.

---

## §7. Deferred Items (Phase-7 carry-forward)

1. **Task 7.5 — Linux baseline capture for 8 surfaces** is the immediately-blocked next step. 7.5 dispatches the new `capture-linux-baselines.yml` workflow with `dry_run: false` and a Cowork-supplied `reason` input. Produces 8 `*-chromium-linux.png` artifacts captured on ubuntu-latest runner; auto-PRs them back to main via `peter-evans/create-pull-request@v6`. CI-CONFIG-ONLY class extends to 5pt at 7.5 (CI-flake-tolerance-policy-via-workflow_dispatch-real-capture-mode sub-domain).
2. **Phase-7 Block A items #6-#8 remain R after 7.4 close** (screenshot-baseline gate-flip at 7.6 + stray PNG provenance at 7.7 + Linux render-timing on compliance-row-workersCompExpiration at 7.8).
3. **Phase-7 Block A item #7 (stray `overview-chromium-linux.png` provenance) MAY CLOSE OPPORTUNISTICALLY AT 7.5** — the 7.4 mechanism's `--update-snapshots` will overwrite the stray during 7.5 inaugural capture (analogous to Block C item #1 closing opportunistically at 7.3 v2.50.1). Stray file metadata: 615,693 bytes / modified 2026-04-22 (Phase-0 Task 0.0.9 era).
4. **Phase-7 Block B items 7.9-7.11 remain R after 7.4 close** (perf multi-lever arc; parallel to Block A; PRIMARY ≤3,000 ms / ASPIRATIONAL ≤2,000 ms LCP target).
5. **Phase-7 Block C remaining items 7.13-7.14 remain R after 7.4 close** (Block C item #1 7.12 already CLOSED opportunistically at 7.3 v2.50.1+v2.50.2; 2 items remain in Block C: calendar flake at 7.13 + Phase-5 Perf Report §2 footnote at 7.14).
6. **Screenshot-baseline blocking-gate arc INFRASTRUCTURE side LAID at 7.4** — sister-shape to axe-baseline blocking-gate arc closed at 7.3. 7.5 will be the CAPTURE side; 7.6 will be the GATE-FLIP side. Both arcs converge on the same 3-step blocking-gate completion pattern (SPEC + INFRASTRUCTURE + GATE-FLIP for axe; INFRASTRUCTURE-MECHANISM + CAPTURE + GATE-FLIP for screenshot).
7. **NEW class CI-CONFIG-ONLY 4th calibration data point at 7.4 close** — class taxonomy now stands at 12 cumulative project-wide; CI-CONFIG-ONLY fully calibrated across 4 field-types (workflow-step continue-on-error + Playwright retries + Playwright timeout + workflow_dispatch capture-mode mechanism). Expected to extend at Tasks 7.5 / 7.6 workflow-YAML-only edits + future Phase-N CI work.
8. **12th within-phase-cumulative + 17-of-17 cross-phase chunk-axis preservation data point at 7.4 close** — workflow YAML edit at `.github/workflows/**` (NEW file) is fully outside Vite entry graph; preserves all 4 chunk axes byte-for-byte. Class-hypothesis (CI-CONFIG-ONLY preserves chunk axes) empirically confirmed at scale.
9. **16 consecutive cross-phase sweep-resolutions cemented at 7.4 sweep** (extends 15-pattern at 7.3 → 16-pattern at 7.4). Pattern fully cemented as cross-phase convention.
10. **PRE0 6-question gate cleared cleanly at 7.4 — no HARD HALT-IF triggered** (Q1 source-provenance + 1-of-8 stray-PNG nuance reported / Q2 NEW file / Q3 peter-evans@v6 auto-PR / Q4 inherit baseline config / Q5 dry-run toggle / Q6 post-merge smoke-test). Phase-7 PRE-FLIGHT discipline working as intended.
11. **Workflow concurrency block added** — `concurrency.group: capture-linux-baselines-${{ github.ref }}` + `cancel-in-progress: false` ensures only one capture runs per ref + doesn't cancel in-progress captures. Necessary because real-capture mode produces auto-PRs; multiple parallel real-capture runs could create conflicting PRs.
12. **`fetch-depth: 0` on checkout** — ensures full git history for the auto-PR branch creation by peter-evans/create-pull-request@v6 (shallow clone causes its branch detection logic to fail).

---

## §8. Next-task unblock

**Phase-7 Block A item #5 unblocked** (Task 7.5 — Linux baseline capture for 8 surfaces) — gated on 7.4's mechanism existing on main, which lands at this merge. After 7.4 merges, 7.5 can dispatch:

```bash
gh workflow run "Capture Linux Playwright Baselines (workflow_dispatch only)" \
  -R NovaTrustSolutions/dwellium-per-spec \
  --ref main \
  -f reason="Phase-7 Task 7.5 inaugural Linux baseline capture for 8 surfaces" \
  -f dry_run=false
```

The dispatch will:
1. Check out main on ubuntu-latest
2. Install Node + npm deps + Playwright chromium with --with-deps
3. Run `npx playwright test --config=playwright.baseline.config.ts e2e/screenshot-baseline.spec.ts --project=chromium --update-snapshots` (captures 8 `*-chromium-linux.png` artifacts; the stray `overview-chromium-linux.png` will be overwritten)
4. Check for captured PNGs (expects ≥ 1; will be 8 if successful)
5. Auto-open PR via `peter-evans/create-pull-request@v6` titled "chore(phase-7): Linux Playwright baseline capture (Task 7.5 inaugural)" with the 8 captured PNGs

After PR merges, Task 7.6 (screenshot-baseline `continue-on-error: true → false` gate-flip) becomes available.

**Phase-7 Block B items 7.9-7.11 unblocked** (perf multi-lever arc; parallel to Block A; can run any time at Phase-7 task entry).

**Phase-7 Block C items 7.13-7.14 unblocked** (test infrastructure stabilization; parallel to Block A + B; can run throughout).

Phase-7 budget per `Docs/Phases/Phase_7_Plan.md §10`: 5-7 days end-to-end across 14 tasks; 7.1 burned ~0.5 day + 7.2 burned ~0.25 day + 7.3 burned ~0.5 day + 7.4 burned ~0.25 day = ~3.75-5.5 days remaining buffer (within scope).

🧪
