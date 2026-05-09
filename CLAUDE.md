# CLAUDE.md — Repo-level Agent Notes

**Repo.** `NovaTrustSolutions/dwellium-per-spec` (private)
**Default branch.** `main`
**Subtree.** `qualia-shell/` imported 2026-04-22 from upstream `qualia-shell` via `git subtree add`.

> Per-task / per-phase detail lives in `Docs/Phase<N>_Task_<X>_Completion_Report.md` and `Docs/Phase<N>_Closure_Report.md`. Read those for narrative; this file is a pointer index.

---

## Current State (as of 2026-05-09)

- **HEAD:** TBD — Task 6.1c squash-merged 2026-05-09 (`feat(phase-6): Task 6.1c — appfolio-parity-workorder spec full audit + remediation (#TBD)`); Phase-6 row 6.1c CLOSED. **Phase-6 Block A CLOSED** (6.1a + 6.1b + 6.1c).
- **Task 6.1b squash-merged 2026-05-09** at `718f6db` (`feat(phase-6): Task 6.1b — appfolio-parity spec-defect remediation (partial; 6.1c spawned) (#46)`); 4 contract-drift axes closed; 5th deferred to 6.1c per Path B.split.
- **Task 6.1a squash-merged 2026-05-05** at `20a62d0` (`feat(phase-6): Task 6.1a — .s-detail-panel layout collapse fix + Phase-6 opener (#45)`); Phase-6 OPENED.
- **Phase-6 sub-tracker** (Plan v2.38): 11 rows total — 6.1a ✓ + 6.1b ✓ + 6.1c ✓ + 6.2 R + 6.3 R + 6.4 R + 6.5 R + 6.6 R + 6.7 R + 6.8 R + 6.9 R. Phase plan: `Docs/Phases/Phase_6_Plan.md` (cites `Docs/Phase5_Closure_Report.md §6` as v1-lineage substitute since Phase-6 has no v1 plan source). 6.1c closed via audit-first methodology empirically validated — PRE0 26-row full-spec audit characterized 8 ❌ rows as ONE root drift class (the 4th already-known from 6.1b); single-file batch edit; 12/12 cold-start smoke-test ACHIEVED on FIRST run; POST-EDIT HARD HALT-IF NOT triggered. Original kickoff target deferred 6.1a → 6.1b → 6.1c is now CLOSED.
- **Phase-5 CLOSED 2026-05-04.** Closure narrative: `Docs/Phase5_Closure_Report.md`. Plan §9 Phase-5 column header `R → ✓` across all 16 rows.
- **Production chunk invariance state:**
  - **Byte-count axis (canonical per Plan v2.28 dual-axis reframe):** 1,031,260 bytes — **20-of-20 cross-phase invariance milestone** (extends 19-of-19 → 20-of-20 even through Task 6.1c's spec-only edits; test-tooling-isolation empirical pattern preserves byte-count by construction since e2e/ outside Vite entry graph).
  - **SHA256 axis:** `81e1fdc508b3ea6cfb4579e71224baef9f3140fa35788db323aae68c3966d1d4` — **PRESERVED across spec-only edits at 6.1b + 6.1c** (test-tooling-isolation empirical pattern continues to hold for test-tooling-only edits at 3 Phase-6 data points). Was broken at 6.1a (`1ab4a9c…14ea` → `81e1fdc…d1d4`) per COMPONENT-FIX class.
  - **Filename axis (NEW at 6.1a):** `StrataDashboard-BqghmASj.js` — **PRESERVED across spec-only edits at 6.1b + 6.1c**. Pattern shifted at 6.1a from hash-only `COZxJ8Bh.js` → `[name]-[hash]` without any vite.config edit; **4th distinct calibration axis surfaced**; structural cause deferred to future-N investigation.
  - **Chunk-graph isolation STRUCTURAL LAW: retired at Phase-6 boundary as categorical claim** (was Phase-5-specific test-tooling property at 6 data points; 6.1a was first production-source edit and structurally distinct; production-source edits INSIDE the entry graph break SHA256 by construction). **🎯 Empirical pattern continues to hold for test-tooling-only edits** — 6.1b + 6.1c spec-only edits preserved all 3 production chunk axes; confirmed at Phase-6's 3rd data point post-LAW-retirement (strong inductive evidence).
- **Vitest:** 259 passing (+0 at 6.1a + 0 at 6.1b + 0 at 6.1c).
- **Smoke-test 4-spec cold-start:** **12/12** (workorder spec full audit closed at 6.1c via audit-first methodology; vendor-compliance closed at 6.1b). Original kickoff target deferred 6.1a → 6.1b → 6.1c is now CLOSED.

### Phase summary

| Phase | Closed | HEAD at close | PRs | Vitest delta | Notes |
|------:|:------:|:--------------|----:|-------------:|:------|
| 0.0   | 2026-04-22 | — | — | — | Exit gate: `Docs/Baselines/phase_0_0_exit_gate_report.md` |
| 1     | 2026-04-23 | `094b91e` | — | — | `Docs/Phase1_Completion_Report.md` |
| 2     | 2026-04-25 | `1a7a39b` | 10 | +87 | Per-task reports `Docs/Phase2_Task_2_X_Completion_Report.md` |
| 3     | 2026-04-28 | `0cfb8a8` | 9  | +32 | Closure: `Docs/Phase3_Closure_Report.md` |
| 4     | 2026-04-30 | `3a41cdf` | 7  | +0  | Closure: `Docs/Phase4_Closure_Report.md` (first phase with byte-identical chunk across all tasks) |
| 5     | 2026-05-04 | `2acaa82` | 10 | +35 | Closure: `Docs/Phase5_Closure_Report.md` |
| 6     | OPENED 2026-05-05 | TBD | 3 (6.1a, 6.1b, 6.1c) | +0 | Plan: `Docs/Phases/Phase_6_Plan.md` (11-task production-readiness arc — Block A 6.1a/6.1b/6.1c CLOSED; Block B unblocks at 6.2) |

### Next task

Phase-6 row 6.1c CLOSED. **Phase-6 Block A complete.** **Recommended next: Task 6.2** — `helpers/auth.ts::loginAs` permanent amendment to seed `qualia_sidebar_groups` localStorage with `Property Management` widget group on cold start. Replaces the A2 inline-seed pattern used at 5.7 / 6.1b / 6.1c smoke-tests (5 data points of temporary inline-seed deferred-to-6.2). After 6.2 lands, the inline-seed pattern can be removed from all measurement scripts + future smoke-tests will work without temp edits. **CONSUMER-SIDE-FETCH-WRAPPER carry-over class extends 1pt → 2pt** at 6.2. See `Docs/Phases/Phase_6_Plan.md §5 Task 6.2` for scope.

### Calibration classes (in-repo, project-wide)

**10 distinct classes** seen across phases. Phase-6 introduces COMPONENT-FIX (1pt at 6.1a; expected to extend to 4pt across Block C 6.3/6.4/6.5 a11y arc). Phase-5 introduced 6: NEAR-NULL-OP carry-over (3pt) / CONSUMER-SIDE-CONTRACT-TEST (1) / CONSUMER-SIDE-FETCH-WRAPPER (1) / MSW-CONTRACT-TEST (1) / E2E-PLAYWRIGHT (3pt Phase-5 + 1pt at 6.1b + 1pt at 6.1c = **5pt cross-phase**) / MEASUREMENT-ONLY (2). See `Docs/Phase5_Closure_Report.md §3` for cross-phase consolidated table.

### Surviving deferred-items ledger

~157 entries cross-phase: ~133 carried from Phase-5 closure + 7 NEW at Phase-6 6.1a §7 + 7 NEW at Phase-6 6.1b §7 + **10 NEW at Phase-6 6.1c §7** (audit-methodology-empirical-validation / E2E-PLAYWRIGHT-5pt / 12/12-cold-start-achieved / test-tooling-isolation-3rd-Phase-6-data-point / byte-count-20-of-20 milestone / hypotheses-(a)+(c)-RULED-OUT-(b)-CONFIRMED / 6.1b TBD resolution co-shipped / Phase-6 Block A CLOSED Block B unblocks / POST-EDIT HARD HALT-IF NOT triggered / CDP-probe VITE_USE_STATIC_API methodology-hardening deferred-item).

---

## CI Behavior

- `AppFolio Parity Gate` (`.github/workflows/appfolio-parity-gate.yml`) runs on push to `main` + PRs touching parity paths. Blocking gates: `tsc -b`, `vitest`, both `vite build` modes (`VITE_APPFOLIO_SEEDS={true,false}`), `verify_no_pii_leak.mjs` strict-scope.
- Playwright baseline E2E is `continue-on-error: true` pending Linux snapshot capture (Task 0.0.9 captured darwin-only). Do not flip back to blocking without committing the Linux snapshots first.
- `PII Scan` (`.github/workflows/pii-scan.yml`) runs on every push and PR.
- **Paths-filter quirk.** Sweeps and tasks touching only `Scripts/**`, `Docs/**`, `qualia-shell/e2e/**`, `playwright.config.ts`, or `.env.example` fall outside the parity-gate paths filter — verification needs `gh workflow run` (workflow_dispatch). Established precedent across 4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7.
- **Push-trigger flake.** Push-triggered runs have not fired reliably; prefer manual dispatch when no auto-run appears within ~90s.

---

## Deferred Items (not blocking)

1. **Linux Playwright baselines.** Capture 8 `*-chromium-linux.png` baselines (Linux dev box or CI `--update-snapshots`). See `Docs/Baselines/phase_0_0_exit_gate_report.md` "Deferred Item" section. Until done, the Playwright CI step is informational.
2. **`qualia-shell/public/assets/nebula-bg.mp4`** — 70.96 MB asset in git, over GitHub's 100 MB soft limit. Future push of this file needs Git LFS, a CDN, or a smaller replacement. **Do not** `git lfs migrate` on `main` without explicit instruction (history rewrite is out of scope).

---

## Conventions (repo-specific)

- **Phase-plan locality (PRE-FLIGHT discipline, Plan v2.29).** When scoping a task in a phase, check `Docs/Phases/Phase_<N>_Plan.md` alongside the parent plan — the phase-spec may refine per-task scope. Missed in 5.1a/5.1b/5.1c PRE0s; elevated to standing PRE-FLIGHT step.
- **Phase-spec vs parent (GR-14, Plan v2.32 amendment).** When phase-spec *contradicts* (not refines) parent, **parent + v1-lineage wins**. Established after Task 5.3 surfaced `Docs/Phases/Phase_5_Plan.md` L160+ diverging from parent §9 rows 5.4–5.7. Phase_5_Plan.md L160-end carries a DEPRECATION banner; scopes preserved for potential Phase-6 production-readiness arc.
- **Source-provenance verification (Step Zero of DC-pre-flight).** Phase-4 closure §4 elevated this to permanent process after 4 SCOPE-COLLISION findings (4.3 / 4.5 / 4.6 / 4.7). Verify the kickoff-named source actually contains what the spec assumes before committing to a path.
- **Subtree discipline.** `qualia-shell/` is a subtree; changes ideally flow back to the upstream `qualia-shell` repo via `git subtree push`. Local-only changes land directly on `main`.
- **PII.** `Scripts/verify_no_pii_leak.mjs` guards strict (`appfolioDerived/`) and legacy (`qualia-shell/public/data/`) scopes. Both strict-clean as of 2026-04-19 (Task 0.0.5b). Do not re-introduce PII. PII guard regex `/\b(?:\d[ -]*?){13,19}\b/` at `complianceEngine.test.ts:228` will false-positive on raw UUID 16-digit hex prefixes — use slug-namespace IDs in fixtures (see Phase-5 5.1b §7 / 5.2 carry-forward).
- **Feature flag.** `VITE_APPFOLIO_SEEDS` gates the AppFolio-derived seed layer. Both `true` and `false` builds must succeed (CI verifies both).
- **API version header.** `strataApi.backend.ts` emits `X-Qualia-API: v2` unconditionally on `request()` and `strataUpload()` (Task 5.1c). Server-side v1/v2 routing is out-of-repo per R-4 v2.26 cross-repo amendment.
- **E2E target.** `playwright.config.ts` is dual-project: default `chromium` (static API) and `real-backend` (live backend, requires sibling repo `../ai-dashboard369-file-manager` + seeded staging DB). Select with `E2E_TARGET=real-backend npx playwright test` (Task 5.3).
- **Cold-start sidebar.** Feature specs (`strata-nav` / `appfolio-parity-workorder` / `appfolio-parity-vendor-compliance`) require the `Property Management` widget group expanded — `Sidebar.tsx:226-232` defaults `expandedGroups` to empty Set. Current mitigation is inline `localStorage.setItem('qualia_sidebar_groups', ...)` in measurement scripts + smoke-test temp-edits to `helpers/auth.ts::loginAs` (Tasks 5.6 / 5.7 / 6.1b smoke / 6.1c smoke). **🎯 6.2 NOW UNBLOCKED at 6.1c close** — feature-spec suite is 12/12 green; Task 6.2 will land the permanent `helpers/auth.ts::loginAs` amendment to seed `qualia_sidebar_groups` on cold start, replacing the A2 inline-seed pattern across all 5 deferred-to-6.2 sites.
- **Strata window default size (Phase-6 Task 6.1a).** `'strata-dashboard'` opens at **1100×800** (centered, auto-region-snap-skipped) via `WindowContext.tsx::COMPONENT_DEFAULT_SIZES`. The quadrant-spawn default (~518–598 px on 1200 px desktop) was too narrow for the 3-column grid (sub-sidebar 248 px + list-panel 320 px + detail-panel 1fr); 1fr collapsed to 0 → `.s-detail-panel` rendered-but-zero-width. Other components keep quadrant-spawn behavior. Container query at `StrataDashboard.css::.s-module` (`container-type: inline-size`) collapses `.s-split-view` to 1-col when actual rendered width < 700 px (defense-in-depth if user narrows the window manually). UX-shift is deliberate, not a regression — see `Docs/Phase6_Task_6_1a_Completion_Report.md §7` entry 5.

---

## Useful commands

- **Strict gate (mirrors CI):**
  `cd qualia-shell && npx tsc -b && npx vitest run && npx vite build && VITE_APPFOLIO_SEEDS=false npx vite build && cd .. && node Scripts/verify_no_pii_leak.mjs`
- **Dispatch parity gate:**
  `gh workflow run "AppFolio Parity Gate" -R NovaTrustSolutions/dwellium-per-spec --ref main`
- **Watch latest run:**
  `gh run watch $(gh run list -R NovaTrustSolutions/dwellium-per-spec --workflow "AppFolio Parity Gate" --limit 1 --json databaseId -q '.[0].databaseId') -R NovaTrustSolutions/dwellium-per-spec --exit-status`
