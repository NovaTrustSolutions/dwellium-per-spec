# CLAUDE.md — Repo-level Agent Notes

**Repo.** `NovaTrustSolutions/dwellium-per-spec` (private)
**Default branch.** `main`
**Subtree.** `qualia-shell/` imported 2026-04-22 from upstream `qualia-shell` via `git subtree add`.

> Per-task / per-phase detail lives in `Docs/Phase<N>_Task_<X>_Completion_Report.md` and `Docs/Phase<N>_Closure_Report.md`. Read those for narrative; this file is a pointer index.

---

## Current State (as of 2026-05-09)

- **HEAD:** TBD — Task 6.3 squash-merged 2026-05-09 (`feat(phase-6): Task 6.3 — tenant-row icon-button accessible-name fix (#TBD)`); Phase-6 row 6.3 CLOSED. **Phase-6 Block C OPENED.** **🎯 button-name on Brianna tenant page: 334 → 0 (100% ELIMINATION — exceeds kickoff `≤4` acceptance gate by 4 nodes); total Brianna page nodes 338 → 9 (-97.3%); total all-pages 362 → 33 (-91%).** Single-line `aria-label` addition at `ResidentsModule.tsx:833` with defensive `t.name ?` null-safety fallback. **🎯 PRE0 mathematical-exactness signal — NEW PERMANENT process discovery** (1 button pattern × 334 tenant rows = 334 violations EXACTLY; single-pattern hypothesis confirmed without CDP probe). **COMPONENT-FIX carry-over 2nd Phase-6 data point** (extends 1pt → 2pt). **5 NEW aria-valid-attr-value violations** on Brianna page surfaced post-fix (Section accordion-headers `<button aria-controls="tenant-block-{slug}">`; STRUCTURALLY surfaced post-Task-6.1a layout fix; NOT caused by 6.3 edit; Task 6.4 scope per Phase_6_Plan.md §4 row 6.4). Production chunk axes: SHA256 BREAK / filename hash rotation / byte-count +99 bytes (21-of-21 milestone retired; reset to 1-of-1).
- **Task 6.2 squash-merged 2026-05-09** at `68e35d0` (`feat(phase-6): Task 6.2 — helpers/auth.ts permanent cold-start sidebar amendment (#48)`); Phase-6 row 6.2 CLOSED. **Phase-6 Block B CLOSED**. 24/24 cold-start smoke-test ACHIEVED on FIRST run WITHOUT temp-edits (4× kickoff prediction; chromium + real-backend, both Playwright projects). E2E-PLAYWRIGHT carry-over 6pt cross-phase (**class-correction at v2.39** from prior CONSUMER-SIDE-FETCH-WRAPPER mis-designation in Phase_6_Plan.md row 6.2). A2 inline-seed pattern RETIRED across 3 Playwright sites (6.1b smoke + 6.1c smoke + 6.1c CDP probe).
- **Task 6.1c squash-merged 2026-05-09** at `ebb9cce` (`feat(phase-6): Task 6.1c — appfolio-parity-workorder spec full audit + remediation (#47)`); Phase-6 Block A CLOSED (6.1a + 6.1b + 6.1c). Audit-first methodology empirically validated; 12/12 cold-start smoke-test on FIRST batch-edit run; POST-EDIT HARD HALT-IF NOT triggered.
- **Task 6.1b squash-merged 2026-05-09** at `718f6db` (`feat(phase-6): Task 6.1b — appfolio-parity spec-defect remediation (partial; 6.1c spawned) (#46)`); 4 contract-drift axes closed; 5th deferred to 6.1c per Path B.split.
- **Task 6.1a squash-merged 2026-05-05** at `20a62d0` (`feat(phase-6): Task 6.1a — .s-detail-panel layout collapse fix + Phase-6 opener (#45)`); Phase-6 OPENED.
- **Phase-6 sub-tracker** (Plan v2.40): 11 rows total — 6.1a ✓ + 6.1b ✓ + 6.1c ✓ + 6.2 ✓ + 6.3 ✓ + 6.4 R + 6.5 R + 6.6 R + 6.7 R + 6.8 R + 6.9 R. Phase plan: `Docs/Phases/Phase_6_Plan.md` (cites `Docs/Phase5_Closure_Report.md §6` as v1-lineage substitute since Phase-6 has no v1 plan source). 6.3 closed via single-line `aria-label` addition at `ResidentsModule.tsx:833` (`aria-label={isBulk ? \`Deselect tenant${t.name ? \` ${t.name}\` : ''}\` : \`Select tenant${t.name ? \` ${t.name}\` : ''}\`}`) with defensive `t.name ?` null-safety fallback per user GO refinement. **Phase-6 Block A complete; Block B complete; Block C (a11y arc) OPENED at 6.3; 6.4 + 6.5 unblocked and parallelizable per Phase_6_Plan.md §10.**
- **Phase-5 CLOSED 2026-05-04.** Closure narrative: `Docs/Phase5_Closure_Report.md`. Plan §9 Phase-5 column header `R → ✓` across all 16 rows.
- **Production chunk invariance state:**
  - **Byte-count axis (canonical per Plan v2.28 dual-axis reframe):** **1,031,359 bytes** at HEAD post-6.3 (was 1,031,260 across 21-of-21 invariance milestone; **milestone RETIRED at 6.3** production-source edit — `+99 bytes` within kickoff prediction range; **reset to 1-of-1**; post-COMPONENT-FIX edits structurally rotate byte-count by source-code delta after minification, rate ~66% chars-to-bytes pass-through consistent with prior data points).
  - **SHA256 axis:** `6c17f2f3464e9dcffc0bf9a41394addc161d47f112601b65b98ad6cc9b1ca768` at HEAD post-6.3 (was `81e1fdc…d1d4` across 6.2; **BREAK at 6.3** as predicted by COMPONENT-FIX class — production-source edit class structurally breaks SHA256 by construction; mirrors 6.1a as 2nd Phase-6 production-source edit data point). Earlier history: was broken at 6.1a (`1ab4a9c…14ea` → `81e1fdc…d1d4`) and PRESERVED across test-tooling-only edits at 6.1b + 6.1c + 6.2.
  - **Filename axis (NEW at 6.1a):** `StrataDashboard-DhcqiSlI.js` at HEAD post-6.3 (was `StrataDashboard-BqghmASj.js` across 6.2; **HASH PORTION ROTATED at 6.3** — the `[name]-[hash]` filename pattern shifted at 6.1a is preserved across 6.2 + 6.3, validating it's structural-not-incidental; only the 8-char hash portion rotates per Vite content-hashing). Earlier: pattern shifted at 6.1a from hash-only `COZxJ8Bh.js` → `[name]-[hash]` without any vite.config edit; **4th distinct calibration axis**; structural cause deferred to future-N investigation.
  - **Chunk-graph isolation STRUCTURAL LAW: retired at Phase-6 boundary as categorical claim** (was Phase-5-specific test-tooling property at 6 data points; 6.1a was first production-source edit and structurally distinct; production-source edits INSIDE the entry graph break SHA256 by construction). **🎯 Empirical pattern continues to hold for test-tooling-only edits** — 6.1b + 6.1c spec-only edits + 6.2 helpers/auth.ts edit preserved all 3 production chunk axes; confirmed at Phase-6's 4th data point post-LAW-retirement (very strong inductive evidence). 6.3 PRODUCTION-SOURCE edit broke all 3 axes as expected — distinguishes the two empirical patterns cleanly.
- **Vitest:** 259 passing in CI (+0 at 6.1a + 0 at 6.1b + 0 at 6.1c + 0 at 6.2 + 0 at 6.3 vs prior CI runs); 258 passing LOCAL on darwin host at 6.3 due to pre-existing `calendar.test.tsx:260` environmental flake (verified via `git stash` + re-run on clean main HEAD `68e35d0` WITHOUT 6.3 edit); CI passed 259/259 on PR #48 at HEAD `9c69543` on 2026-05-09T08:20Z (same logical code as `68e35d0` post-squash); CI is the authoritative gate; suspected `vi.useFakeTimers()` + real-clock interaction; capture deferred for future-Phase-N stabilization.
- **Smoke-test 4-spec cold-start:** **12/12** PASS on chromium project at 6.3 (kickoff acceptance criterion met; helpers/auth.ts permanent amendment from 6.2 continues to seed `qualia_sidebar_groups` correctly across the 6.3 production-source edit — cross-validation that no regression introduced in test-tooling isolation). Earlier: 24/24 at 6.2 with permanent helpers/auth.ts amendment WITHOUT temp-edits (4× kickoff prediction); workorder spec full audit closed at 6.1c via audit-first methodology; vendor-compliance closed at 6.1b. Original kickoff target deferred 6.1a → 6.1b → 6.1c CLOSED + extended to permanent helpers/auth.ts at 6.2.
- **A11y violation count (post-Phase-6 Block C 6.3):** **33 nodes** across 4 enriched detail pages at HEAD post-6.3 (was **362 nodes** at Phase-5 Task 5.7 baseline 2026-05-04; **−91% cross-page reduction**; Brianna tenant page **338 → 9** = **−97.3%** dominated by the single-pattern button-name fix at L833 which eliminated 334 → 0). 5 NEW aria-valid-attr-value violations on Brianna surfaced post-fix (Section accordion-headers `<button aria-controls="tenant-block-{slug}">`; STRUCTURALLY surfaced post-Task-6.1a layout fix; NOT caused by 6.3 edit; Task 6.4 scope). Raw data: `Docs/Baselines/2026-05-09_Phase6_task_6_3_a11y_capture.json`.

### Phase summary

| Phase | Closed | HEAD at close | PRs | Vitest delta | Notes |
|------:|:------:|:--------------|----:|-------------:|:------|
| 0.0   | 2026-04-22 | — | — | — | Exit gate: `Docs/Baselines/phase_0_0_exit_gate_report.md` |
| 1     | 2026-04-23 | `094b91e` | — | — | `Docs/Phase1_Completion_Report.md` |
| 2     | 2026-04-25 | `1a7a39b` | 10 | +87 | Per-task reports `Docs/Phase2_Task_2_X_Completion_Report.md` |
| 3     | 2026-04-28 | `0cfb8a8` | 9  | +32 | Closure: `Docs/Phase3_Closure_Report.md` |
| 4     | 2026-04-30 | `3a41cdf` | 7  | +0  | Closure: `Docs/Phase4_Closure_Report.md` (first phase with byte-identical chunk across all tasks) |
| 5     | 2026-05-04 | `2acaa82` | 10 | +35 | Closure: `Docs/Phase5_Closure_Report.md` |
| 6     | OPENED 2026-05-05 | TBD | 5 (6.1a, 6.1b, 6.1c, 6.2, 6.3) | +0 | Plan: `Docs/Phases/Phase_6_Plan.md` (11-task production-readiness arc — Block A 6.1a/6.1b/6.1c CLOSED; Block B 6.2 CLOSED; Block C OPENED at 6.3; 6.4/6.5 unblocked and parallelizable) |

### Next task

Phase-6 row 6.3 CLOSED. **Phase-6 Block C OPENED.** **Recommended next: Task 6.4** — Targeted a11y fixes (color-contrast / select-name / aria-valid-attr-value / scrollable-region-focusable; ~33 remaining nodes target — original ~28 from Phase-5 baseline + 5 NEW Brianna aria-valid-attr-value surfaced post-Task-6.1a layout fix and confirmed at 6.3 axe re-measurement). **COMPONENT-FIX class extends 2pt → 3pt** at 6.4 (3rd Phase-6 data point). Task 6.5 (a11y closure cleanup + axe-baseline.spec.ts re-enable assessment) is parallelizable with 6.4 within Block C. See `Docs/Phases/Phase_6_Plan.md §4 Task 6.4` for scope.

### Calibration classes (in-repo, project-wide)

**10 distinct classes** seen across phases. Phase-6 COMPONENT-FIX class now at **2pt** (1pt at 6.1a CSS-LAYOUT-FIX shape + 1pt at 6.3 A11Y-COMPONENT-FIX shape; expected to extend to 4pt across Block C 6.4/6.5 remaining a11y arc; sub-classes deferred per Phase_6_Plan.md §11 until Phase-7+ third structurally-distinct production-chunk-edit shape). Phase-5 introduced 6: NEAR-NULL-OP carry-over (3pt) / CONSUMER-SIDE-CONTRACT-TEST (1) / CONSUMER-SIDE-FETCH-WRAPPER (1) / MSW-CONTRACT-TEST (1) / E2E-PLAYWRIGHT (3pt Phase-5 + 1pt at 6.1b + 1pt at 6.1c + 1pt at 6.2 = **6pt cross-phase**; class-correction at v2.39 added 6.2 to E2E-PLAYWRIGHT after prior CONSUMER-SIDE-FETCH-WRAPPER mis-designation in Phase_6_Plan.md row 6.2 — purely classificatory, no source/test changes) / MEASUREMENT-ONLY (2). See `Docs/Phase5_Closure_Report.md §3` for cross-phase consolidated table.

### Surviving deferred-items ledger

~173 entries cross-phase: ~133 carried from Phase-5 closure + 7 NEW at Phase-6 6.1a §7 + 7 NEW at Phase-6 6.1b §7 + 10 NEW at Phase-6 6.1c §7 + 7 NEW at Phase-6 6.2 §7 + **9 NEW at Phase-6 6.3 §7** (PRE0-mathematical-exactness-NEW-PERMANENT-process-discovery / COMPONENT-FIX-2pt-Phase-6 / a11y-violation-reduction-Brianna-97.3%-cross-page-91% / NEW-finding-5-aria-valid-attr-value-Brianna-post-Task-6.1a-NOT-6.3 / production-chunk-axes-SHA256-BREAK-filename-rotation-byte-count-+99 / 6.2-TBD-resolution-co-shipped / calendar.test.tsx-environmental-flake-NEW-deferred-item / helpers-auth.ts-6.2-amendment-cross-validation / Phase-6-Block-C-OPENED-6.4-6.5-unblocked).

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
- **Cold-start sidebar.** Feature specs (`strata-nav` / `appfolio-parity-workorder` / `appfolio-parity-vendor-compliance`) require the `Property Management` widget group expanded — `Sidebar.tsx:226-232` defaults `expandedGroups` to empty Set. **🎯 LANDED AT 6.2** — `helpers/auth.ts::loginAs` permanently seeds `qualia_sidebar_groups` localStorage with `["Property Management","AI Tools","Filing Cabinet"]` via `await page.addInitScript()` block at L43, before `await page.goto('/')`. addInitScript registers a script that runs before any page script on every navigation, so cold-start `Sidebar.tsx:228` `localStorage.getItem(...)` returns the seeded value when the `useState` initializer fires. **24/24 cold-start smoke-test** (12 chromium static-API + 12 real-backend) confirmed permanent amendment IS the seeding (no temp-edits required; 4× kickoff prediction). **A2 inline-seed pattern RETIRED** across 3 Playwright sites (6.1b smoke + 6.1c smoke + 6.1c CDP probe) — future test infrastructure relies on `helpers/auth.ts::loginAs` as canonical e2e auth helper. `Scripts/run_axe_phase5.mjs` + `Scripts/run_lighthouse_phase5.mjs` RETAIN inline-seed as design choice (non-Playwright contexts; Lighthouse/axe-core CI runs reimplement loginAs inline; not deferred tech debt).
- **Strata window default size (Phase-6 Task 6.1a).** `'strata-dashboard'` opens at **1100×800** (centered, auto-region-snap-skipped) via `WindowContext.tsx::COMPONENT_DEFAULT_SIZES`. The quadrant-spawn default (~518–598 px on 1200 px desktop) was too narrow for the 3-column grid (sub-sidebar 248 px + list-panel 320 px + detail-panel 1fr); 1fr collapsed to 0 → `.s-detail-panel` rendered-but-zero-width. Other components keep quadrant-spawn behavior. Container query at `StrataDashboard.css::.s-module` (`container-type: inline-size`) collapses `.s-split-view` to 1-col when actual rendered width < 700 px (defense-in-depth if user narrows the window manually). UX-shift is deliberate, not a regression — see `Docs/Phase6_Task_6_1a_Completion_Report.md §7` entry 5.
- **Tenant-row icon-button a11y aria-label (Phase-6 Task 6.3).** The bulk-select icon-only `<button>` at `qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx:833` (within `filtered.map(t => { ... })` row template) carries a dynamic `aria-label={isBulk ? \`Deselect tenant${t.name ? \` ${t.name}\` : ''}\` : \`Select tenant${t.name ? \` ${t.name}\` : ''}\`}`. The defensive `t.name ?` fallback handles the unlikely null/undefined case for stub or partial-fixture rows (yields "Select tenant" instead of "Select tenant undefined"); both branches pass axe-core's `button-name` rule. **PRE0 mathematical-exactness signal**: when an a11y enumeration-rule violation count exactly equals (per-row-pattern-count × rendered-row-count), single-pattern hypothesis is confirmable WITHOUT a CDP probe — at 6.3, button-name=334 / per-row-pattern-count=1 / rendered-rows=334 → exact match → single template-level edit fixes all 334 simultaneously. Future a11y tasks targeting `button-name` / `link-name` / `aria-required-attr` / similar enumeration-rule classes should run this math at PRE0 before writing any CDP probe. Recommended for inclusion in GR-15 PERMANENT process changes at next plan amendment.

---

## Useful commands

- **Strict gate (mirrors CI):**
  `cd qualia-shell && npx tsc -b && npx vitest run && npx vite build && VITE_APPFOLIO_SEEDS=false npx vite build && cd .. && node Scripts/verify_no_pii_leak.mjs`
- **Dispatch parity gate:**
  `gh workflow run "AppFolio Parity Gate" -R NovaTrustSolutions/dwellium-per-spec --ref main`
- **Watch latest run:**
  `gh run watch $(gh run list -R NovaTrustSolutions/dwellium-per-spec --workflow "AppFolio Parity Gate" --limit 1 --json databaseId -q '.[0].databaseId') -R NovaTrustSolutions/dwellium-per-spec --exit-status`
