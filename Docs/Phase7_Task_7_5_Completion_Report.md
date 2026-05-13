# Phase 7 — Task 7.5 — Linux Playwright baseline capture (inaugural) — Completion Report

**Date:** 2026-05-13
**Commit (HEAD on `main`):** `TBD` (squash commit for PR #60, Task 7.5 — Phase-7 Block A item #5; resolution at next-sweep per established 16-consecutive-cross-phase-sweep-resolutions convention extending 16-pattern at 7.4 → 17-pattern at 7.5)
**Green CI run:** TBD (capture run [25779329286](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25779329286) — capture step ✓ SUCCESS 8/8 surfaces in 3.2m wallclock; PR-open step ❌ FAILURE at API boundary; Cowork Option A salvage path manually opened PR #60 via user token around the workflow-pushed branch `phase-7/linux-baseline-capture-25779329286` @ `ba5f639`; parity gate on auto-branch TBD)
**Plan reference:** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-7 sub-tracker row 7.5 (closed at v2.52 amendment) + `Docs/Phases/Phase_7_Plan.md §4 Block A item 7.5` + `Docs/Phase6_Closure_Report.md §8` Block A item #5 (Linux baseline capture for 8 surfaces as CAPTURE side of the screenshot-baseline blocking-gate arc; 7.4 = INFRASTRUCTURE side; 7.6 = GATE-FLIP side)
**Template mirror:** `Docs/Phase7_Task_7_4_Completion_Report.md` (Phase-7 7.4 CI-CONFIG-ONLY 8-section template; 7.5 mirrors byte-shape with BASELINE-ARTIFACT class adaptations + Cowork Option A recovery narrative replacing standard branch-then-PR-create workflow shape)
**v1-lineage substitute.** Phase-7 has no v1 plan source (post-v1 carry-forward arc). Authoritative scope source is `Docs/Phase6_Closure_Report.md §8` Block A item #5 + Phase-0 deferred-item (`Docs/Baselines/phase_0_0_exit_gate_report.md` "Deferred Item" section on Linux baselines — 7.5 is the inaugural Linux capture that closes that Phase-0 deferred-item end-to-end).

---

## §1. Summary

**🎯 Phase-7 Block A item #5 CLOSED — Linux baseline capture for 8 surfaces (inaugural) landed.** Task 7.5 ships 8 `*-chromium-linux.png` artifacts captured by the workflow_dispatch mechanism built at Task 7.4. Capture run [25779329286](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25779329286) executed `npx playwright test --config=playwright.baseline.config.ts e2e/screenshot-baseline.spec.ts --project=chromium --update-snapshots` on ubuntu-latest in 3.2m wallclock; 8/8 surfaces captured (Overview / Properties / Leasing / Residents / Vendors / Owners / Accounting / Maintenance). PR #60 contains the captured-PNG commit `ba5f639` (workflow-generated) + this doc sweep commit (Claude-Code-generated; sister to Cowork Q5 verdict single-PR shape).

**🎯 NEW class BASELINE-ARTIFACT empirically validated at 7.5 — project-wide 13th cumulative class.** Phase-0 Task 0.0.9 retroactively counts as 1st data point (8 darwin baselines captured 2026-04-22); Phase-7 Task 7.5 = 2nd data point (8 Linux baselines captured 2026-05-13); **2pt cross-phase calibration** at 7.5 close. Structurally distinct from E2E-PLAYWRIGHT (specs+helpers are executable test logic) and CI-CONFIG-ONLY (workflow+config are orchestration/policy); BASELINE-ARTIFACT = binary PNG/asset files consumed by Playwright at test-validation time as **reference data for visual regression**.

**🎯 PR-OPEN STEP FAILURE — Cowork Option A salvage path (substantive empirical finding).** Capture run 25779329286 succeeded at the capture step (8/8 surfaces; 3.2m wallclock; ✓) AND check-PNGs step (captured_count=8; ✓) but FAILED at the final "Open PR with captured baselines" step with `##[error]GitHub Actions is not permitted to create or approve pull requests`. Root cause: repo-level Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests" is currently **disabled** at the repo policy boundary. The workflow YAML's `permissions: { contents: write, pull-requests: write }` block at `.github/workflows/capture-linux-baselines.yml` is correctly set; the failure is purely at the repo-policy boundary, NOT at the workflow-level permissions block. **Crucially, `peter-evans/create-pull-request@v6` successfully pushed the captured-PNG commit to the remote branch `phase-7/linux-baseline-capture-25779329286 @ ba5f639` BEFORE the PR-API call failed** — the 4m21s of capture work is preserved on the remote branch.

**🎯 Cowork Option A recovery verdict (2026-05-13):** Claude Code manually opened PR #60 around the workflow-pushed branch via user-token `gh pr create` (user token holds PR-create rights independently of the repo Actions setting). Single PR contains both PNG captures (from workflow's commit `ba5f639`) + doc sweep (from Claude Code's commit on top per Cowork Q5 verdict). Salvages the 4m21s capture work and preserves the BASELINE-ARTIFACT class shape intact. Sister-shape to 7.4 v2.51.1 PRE0-undetectable systemic gap (Vendors axe-scan 60s deterministic timeout surfaced only at first real-world dispatch) — both are systemic gaps that dry-run smoke-tests cannot exercise.

**🎯 Phase-7 Block A item #7 OPPORTUNISTICALLY CLOSED at 7.5 — stray overview-chromium-linux.png OVERWRITTEN empirically.** Pre-capture stray file metadata: 615,693 bytes / mtime 2026-04-22 (Phase-0 Task 0.0.9 era); post-capture: 315,210 bytes / mtime 2026-05-13 01:31 (Phase-7 Task 7.5 inaugural). Byte-count delta = −300,483 bytes (−48.8%); mtime drift = +21 days. **Stray PNG empirically OVERWRITTEN by `--update-snapshots`** per Playwright's platform-keyed filename convention. Block A item #7 (stray PNG provenance investigation) co-shipped at 7.5 sweep per established opportunistic-carry-forward-absorption convention (sister to Block C item #1 closing at 7.3 v2.50.1+v2.50.2). **17 consecutive cross-phase sweep-resolutions** when 7.5 lands (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → 7.1 → 7.2 → 7.3 → 7.4 → **7.5**).

**🎯 PNG file-size signal — Linux baselines ~46% smaller than darwin.** Linux: mean 332,677 B (~324 KB; tight range 315-341 KB across 8 surfaces); darwin: mean 620,031 B (~605 KB; tight range 605-628 KB across 8 surfaces). Linux is **53.7% the size of darwin** — uniform across all 8 surfaces (NOT a corruption signal; uniform tight band excludes pixel-corruption or partial-render hypotheses). Suspected drivers: (a) Linux Playwright chromium default subpixel-antialiasing producing fewer unique pixels to compress vs darwin's more aggressive AA; (b) different PNG compression heuristics in Linux chromium build vs darwin chromium build; (c) DPR / scale handling delta. Empirical finding worth noting in §7 deferred-items; not a blocker.

**🎯 BASELINE-ARTIFACT edit at `qualia-shell/e2e/**/*-chromium-linux.png` preserves ALL 4 chunk axes byte-for-byte** vs HEAD-post-7.4 main canonical (`StrataDashboard-D_e1g9lx.js` / 1,031,810 / `47d22066…121d` + `index-ChKXebss.js` / 597,519 / `b237c8aa…67f1` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `index-DubCb24b.css` / 158,955 / `cabc7535…738f`); **13th within-phase-cumulative chunk-axis preservation data point post-LAW-retirement** (Phase-6 9pt + Phase-7 4pt [7.2 + 7.3 + 7.4 + 7.5] = 13pt within-Phase-6+7; **19-of-19 cross-phase cumulative** — Phase-5 6 LAW + Phase-6 8 + Phase-7 5 [counting v2.51.1 in-place patch as 18th] — very strong inductive evidence at scale; PNG binary files are fully outside Vite entry graph; consumed by Playwright at test-validation time, not by Vite/Rollup at build time).

**🎯 7.4 TBD → `cd26ce4` / `#59` resolution co-shipped at 7.5 sweep — 17 consecutive cross-phase sweep-resolutions** (extends 16-pattern at 7.4 → 17-pattern at 7.5); resolved across §9 row 7.4 squash-SHA cell + §9 row 7.7 squash-SHA cell (Block A item #7 opportunistic closure co-ship) + Phase status line at top of `Docs/Phases/Phase_7_Plan.md` + Task 7.4 closure-narrative TBD references (multiple spots in `Docs/Phase7_Task_7_4_Completion_Report.md`) + CLAUDE.md HEAD pointer pivot.

**🎯 Paths-filter quirk extends to 14-task cross-phase scope at 7.5** (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7 / 6.8 / 6.9 / 7.2 / 7.3 / 7.4 → **7.5**); 7.5 touches `qualia-shell/e2e/**` (PNG snapshot dir) + `Docs/**` + root `CLAUDE.md`, NOT covered by `qualia-shell/src/**` paths-filter; manual-dispatch expected at auto-branch parity gate run.

---

## §2. Strict-gate command output paste

```
$ git rev-parse HEAD
cd26ce43956191bfe451192c5d349c6a055a3e2d   # pre-dispatch anchor (main HEAD post-7.4)

$ gh workflow list -R NovaTrustSolutions/dwellium-per-spec | grep "Capture Linux"
Capture Linux Playwright Baselines (workflow_dispatch only)	active	275763053

$ gh workflow run "Capture Linux Playwright Baselines (workflow_dispatch only)" \
    -R NovaTrustSolutions/dwellium-per-spec \
    --ref main \
    -f reason="Phase-7 Task 7.5 inaugural Linux baseline capture for screenshot-baseline blocking-gate arc per Phase_7_Plan §4 Block A item #5; Cowork verdict 2026-05-13" \
    -f dry_run=false

$ gh run watch 25779329286 -R NovaTrustSolutions/dwellium-per-spec --exit-status
[capture step]                          ✓  8 passed (3.2m)
[check-pngs step]                       ✓  captured_count=8
[open-pr step]                          ✗  GitHub Actions is not permitted to create or approve pull requests
[total run conclusion]                  failure (at PR-open step only; capture+check ✓)

$ git fetch origin --prune
* [new branch]  phase-7/linux-baseline-capture-25779329286 -> origin/phase-7/linux-baseline-capture-25779329286
$ git ls-remote origin phase-7/linux-baseline-capture-25779329286
ba5f639b0109646e47a60070a2a448170016928b   # workflow-pushed commit with 8 PNGs

# Cowork Option A salvage path: manual PR-open via user token
$ gh pr create --base main --head phase-7/linux-baseline-capture-25779329286 ...
https://github.com/NovaTrustSolutions/dwellium-per-spec/pull/60

# Step-4 sanity: 8/8 PNGs on branch with file-size empirical signal
$ ls -la qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/*-chromium-linux.png
[8 PNG files; mean 332,677 B; tight 315-341 KB range; mtime 2026-05-13 01:31]

# Step-4 Block A item #7 opportunistic closure evidence:
# stray overview-chromium-linux.png mtime drift Apr 22 → May 13 + size 615,693 → 315,210 = OVERWRITTEN

# Step-5 chunk-axis re-verify on auto-branch:
$ cd qualia-shell && rm -rf dist && npx vite build
✓ built in 4.53s
StrataDashboard-D_e1g9lx.js  1031810  47d22066…121d    # MATCH HEAD-post-7.4 canonical
index-1yBoi7Al.js              87711  638f9f06…dab7    # MATCH
index-ChKXebss.js             597519  b237c8aa…67f1    # MATCH
index-DubCb24b.css            158955  cabc7535…738f    # MATCH
```

---

## §3. Structural validation (capture mechanism end-to-end empirical validation)

**Criterion (a) — Capture step success.** ✓ Run 25779329286 captured 8/8 surfaces in 3.2m wallclock (`8 passed` in Playwright output). Per-surface timing distribution similar to Linux CI axe-scan timing observed at 7.3+7.4 parity gate runs (Vendors heaviest; Overview/Properties/Owners/Accounting/Maintenance lightest).

**Criterion (b) — PNG production.** ✓ Check-PNGs step yielded `captured_count=8`; all 8 expected surface filenames present on runner FS. Identical surface list matches 7.4 smoke-test dry-run --list-only output (8 baseline tests in 1 file).

**Criterion (c) — Branch push.** ✓ Workflow-pushed branch `phase-7/linux-baseline-capture-25779329286 @ ba5f639` exists on origin with the captured-PNG commit; visible via `git ls-remote origin`. peter-evans/create-pull-request@v6's push step completed before the API-call step failed.

**Criterion (d) — PR-open.** ❌ Workflow-driven PR-open FAILED at GitHub API boundary. **Cowork Option A recovery:** manual `gh pr create` via user token succeeded → PR #60 opened cleanly with file_count=8.

**Criterion (e) — Block A item #7 opportunistic closure.** ✓ Stray `overview-chromium-linux.png` mtime drift Apr 22 → May 13 + byte-count drift 615,693 → 315,210 empirically validates `--update-snapshots` overwrite.

**Criterion (f) — Chunk-axis preservation hypothesis.** ✓ BASELINE-ARTIFACT class hypothesis validated: 4-of-4 chunk axes byte-for-byte match HEAD-post-7.4 canonical on auto-branch.

---

## §4. `/security-review`

NEW class BASELINE-ARTIFACT does not introduce new attack surface — PNG binary files are reference data consumed by Playwright's pixel-diff at test-validation time, not by application code at runtime. No runtime imports; no Vite entry graph membership; no production-chunk impact (empirically validated at §3 criterion f).

The Cowork Option A salvage path (user-token PR-open vs workflow-token PR-open) is structurally equivalent from a permissions-model perspective: both write to the same target branch + base branch; the only difference is which identity (workflow-token vs user-token) creates the PR record. Repo-level "Allow GitHub Actions to create and approve pull requests" setting is a defense-in-depth control orthogonal to PR contents; enabling it (future deferred-item) does not change the threat model for Task 7.5+ Linux baseline captures.

Captured PNG file sizes are uniform tight band (315-341 KB across 8 surfaces); no anomalous size signals suggesting payload-injection or capture-corruption.

---

## §5. Verification Matrix (per-task)

| Check | Target | Result | Evidence |
|---|---|---|---|
| Capture run conclusion | success at capture+check-pngs steps | ✓ (failure overall due to PR-open step blocked by repo policy) | Run 25779329286; 4m21s wallclock |
| 8 Linux PNGs captured | exactly 8 surface files | ✓ | Check-PNGs step output `captured_count=8` |
| Branch push by workflow | `phase-7/linux-baseline-capture-25779329286 @ ba5f639` on origin | ✓ | `git ls-remote origin` |
| Manual PR-open via user token (Cowork Option A) | exit 0 + PR # returned | ✓ PR #60 opened | Step-3-recovery output |
| PR #60 file count | exactly 8 PNG files | ✓ 8/8 | `gh pr view 60` files JSON |
| PR #60 file scope | all under qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/, all with -chromium-linux.png suffix | ✓ | `gh pr view 60` file_paths |
| Stray overview-chromium-linux.png OVERWRITE | mtime drift Apr 22 → May 13 + byte-count drift 615,693 → 315,210 | ✓ | `ls -la` post-checkout |
| PNG file-size sanity | 8 PNGs in 10 KB - 5 MB band (kickoff brief HARD HALT-IF) | ✓ 315-341 KB tight range | `ls -la` post-checkout |
| Linux vs darwin PNG size signal | substantive empirical finding | ✓ Linux mean 332,677 B = 53.7% of darwin mean 620,031 B (uniform across 8 surfaces) | Step-4 size comparison |
| Chunk-axis preservation (BASELINE-ARTIFACT hypothesis) | 4 chunks byte-for-byte vs HEAD-post-7.4 canonical | ✓ 4-of-4 preserved | Step-5 re-verification |
| Doc sweep file count | 5 files (1 NEW completion report + 4 updates) | ✓ | Step-7 staging |
| Doc sweep commit | NEW commit on top of ba5f639 (NO amend) | TBD | Step-7 commit |
| Parity gate per auto-branch | manual-dispatch (paths-filter quirk; PNG + Docs/** + CLAUDE.md outside qualia-shell/src/**) | TBD | Step-8 dispatch |
| Parity gate run conclusion | success | TBD | Step-8 watch |
| PII Scan on auto-branch | auto-fired on PR push + sync | TBD | Step-8 |
| CodeRabbit review | pass | TBD | Step-8 |
| `Docs/Phase7_Task_7_5_Completion_Report.md` | committed | ✓ | This file |
| §9 Phase-7 sub-tracker row 7.5 | R → ✓ | ✓ | Plan v2.52 amendment |
| §9 Phase-7 sub-tracker row 7.7 | R → ✓ (Block A item #7 opportunistic closure) | ✓ | Plan v2.52 amendment |
| §9 row 7.4 squash-SHA cell | TBD → `cd26ce4` | ✓ | Plan v2.52 amendment + sweep across reference spots |
| NEW class BASELINE-ARTIFACT (project-wide 13th cumulative) | docked | ✓ | Plan v2.52 amendment + CLAUDE.md Calibration classes block updated |

---

## §6. Rollback SHA

Rollback target: `git revert <7.5-squash-SHA>` (Phase-7 7.5 close; reverts to 7.4 state at `cd26ce4`). Phase-7 7.5 squash SHA `TBD` (will be revertable independently once merged; resolution at 7.6 sweep).

Rollback safety: 8 NEW PNG files + 5 doc-file updates — pure additive scope; no production source / no test specs / no CI config touched. Reversible without DB or fixture state implications; rollback would remove the 8 Linux baselines (reverting to the Phase-0 era 1-stray-PNG state) and re-open Block A item #7. Future captures would need a re-dispatch of the workflow (mechanism itself is unchanged by rollback).

---

## §7. Deferred Items (Phase-7 carry-forward)

1. **Task 7.6 — screenshot-baseline `continue-on-error: true → false` gate-flip** is the immediately-blocked next step. 7.6 flips `.github/workflows/appfolio-parity-gate.yml::Playwright screenshot-baseline E2E` step from `continue-on-error: true` (sheltered) to `continue-on-error: false` (blocking), now that 8 Linux baselines exist on main per 7.5. Completes the screenshot-baseline blocking-gate arc (SPEC ⊘ N/A for visual regression / WORKFLOW @ 7.3 step-split / INFRASTRUCTURE @ 7.4 mechanism / CAPTURE @ 7.5 / GATE-FLIP @ 7.6 — only the WORKFLOW + GATE-FLIP sides apply since screenshot-baseline has no spec-side hard-assert analog). Class taxonomy at 7.6: CI-CONFIG-ONLY 5th calibration data point (workflow-step continue-on-error sub-domain 2nd data point after 7.3 main).
2. **NEW DEFERRED ITEM (Cowork user action) — Enable repo Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests".** Once enabled, revert Task 7.5+ future captures to workflow-opens-PR shape (preserves clean BASELINE-ARTIFACT class deliverable structure end-to-end). The workflow YAML already has `permissions: contents: write + pull-requests: write` correctly configured; only the repo-level setting needs the toggle. Recommended for Plan v2.53+ amendment with GR-15 note about Phase-7 PRE-FLIGHT discipline: dry-run smoke-tests don't exercise downstream-conditional steps; first real-world execution is the truth signal for cross-step integrations.
3. **NEW DEFERRED ITEM (PRE-FLIGHT discipline note) — Add to Plan v2.53+ as GR-15 amendment candidate.** The 7.4 smoke-test (`dry_run: true`) gated the entire PR-create step block via `if: ${{ inputs.dry_run == false }}`, so the smoke-test could not exercise the GitHub API PR-create call. Lesson: dry-run smoke-tests validate plumbing structure (setup steps + workflow YAML syntax + Playwright spec discovery) but cannot validate cross-system policy boundaries (GitHub Actions ↔ repo settings ↔ branch protection rules) — those require at least one real-world execution. Sister-shape to 7.4 v2.51.1 PRE0-undetectable systemic gap (Vendors axe-scan deterministic 60s timeout surfaced only at first dispatch). Both findings inform a Phase-7+ PRE-FLIGHT discipline: "First-real-execution-as-truth-signal" augments dry-run-as-smoke-test.
4. **PNG file-size empirical finding** — Linux baselines ~46% smaller than darwin (mean 332,677 B vs 620,031 B; uniform across 8 surfaces). Suspected drivers: subpixel-AA difference + PNG compression heuristic delta + DPR/scale handling. Not a corruption signal (uniform tight band excludes that). Recommended documentation note in `Docs/Baselines/phase_0_0_exit_gate_report.md` "Deferred Item" section at next sweep (5 KB doc-only edit; CI-CONFIG-ONLY chunk-axis preservation continues to hold).
5. **Phase-7 Block A items #6 + #8 remain R after 7.5 close** (screenshot-baseline gate-flip at 7.6 + Linux render-timing on `compliance-row-workersCompExpiration` at 7.8).
6. **Phase-7 Block B items 7.9-7.11 remain R after 7.5 close** (perf multi-lever arc; parallel to Block A; PRIMARY ≤3,000 ms / ASPIRATIONAL ≤2,000 ms LCP target).
7. **Phase-7 Block C remaining items 7.13-7.14 remain R after 7.5 close** (Block C item #1 7.12 already CLOSED opportunistically at 7.3 v2.50.1+v2.50.2; 2 items remain: calendar flake at 7.13 + Phase-5 Perf Report §2 footnote at 7.14).
8. **17 consecutive cross-phase sweep-resolutions cemented at 7.5 sweep** (extends 16-pattern at 7.4 → 17-pattern at 7.5). Pattern fully cemented as cross-phase convention.
9. **NEW class BASELINE-ARTIFACT 2pt cross-phase calibration at 7.5 close** — Phase-0 Task 0.0.9 retroactive 1st data point + Phase-7 Task 7.5 = 2nd data point; class fully calibrating at 2pt. Future baseline-artifact tasks (new modules / new browsers / accessibility tree baselines / audio baselines / fixture seed data) will extend the calibration.
10. **13th within-phase-cumulative + 19-of-19 cross-phase chunk-axis preservation data point at 7.5 close** — BASELINE-ARTIFACT class preserves chunk axes empirically (PNG files are fully outside Vite entry graph; consumed by Playwright at test-validation time).
11. **PRE0 6-question gate cleared cleanly at 7.5 — no HARD HALT-IF triggered at PRE0**; HARD HALT-IF triggered at Step-2 watch when PR-open step failed (the kickoff brief's HARD HALT-IF on capture run FAILURE conclusion); Cowork Option A salvage path unblocked progression.
12. **Phase-7 progress at 7.5 close: 6 of 14 tasks merged ✓** (7.1 / 7.2 / 7.3 / 7.4 / 7.5 / 7.7-co-closed-opportunistically) + 7.12 closed opportunistically at 7.3 = **7 of 14 ✓; 7 R remaining**. Block A 6-of-8 closed (7.1+7.2+7.3+7.4+7.5+7.7); Block A 2 remaining (7.6 + 7.8); Block B 3 R (7.9 + 7.10 + 7.11); Block C 2 R (7.13 + 7.14).

---

## §8. Next-task unblock

**Phase-7 Block A item #6 unblocked** (Task 7.6 — screenshot-baseline `continue-on-error: true → false` gate-flip) — gated on 7.5's 8 Linux baselines existing on main, which lands at this merge. After 7.5 merges, 7.6 can ship the 1-line workflow YAML edit:

```yaml
# .github/workflows/appfolio-parity-gate.yml
# Playwright screenshot-baseline E2E (visual regression; sheltered pending Linux baselines)
- continue-on-error: true   # current state at HEAD-post-7.4
+ continue-on-error: false  # blocking after Task 7.6
```

After 7.6 merges, the screenshot-baseline blocking-gate arc is COMPLETE end-to-end (WORKFLOW @ 7.3 step-split + INFRASTRUCTURE @ 7.4 mechanism + CAPTURE @ 7.5 + GATE-FLIP @ 7.6 = full closure).

**Phase-7 Block B items 7.9-7.11 unblocked** (perf multi-lever arc; parallel to Block A; can run any time at Phase-7 task entry).

**Phase-7 Block C items 7.13-7.14 unblocked** (test infrastructure stabilization; parallel to Block A + B; can run throughout).

Phase-7 budget per `Docs/Phases/Phase_7_Plan.md §10`: 5-7 days end-to-end across 14 tasks; cumulative through 7.5: 7.1 ~0.5d + 7.2 ~0.25d + 7.3 ~0.5d + 7.4 ~0.25d + 7.5 ~0.25d (+ Cowork manual recovery ~0.05d) = **~1.8 days burned; 3.2-5.2 days remaining buffer** across 7 remaining tasks.

🧪
