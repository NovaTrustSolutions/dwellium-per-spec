# Phase 6 — Production-Readiness Arc (post-Phase-5 carry-forward)

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-6 sub-tracker (created at v2.36; expanded at v2.37 to 11 rows: 6.1a / 6.1b / **6.1c** / 6.2 / 6.3 / 6.4 / 6.5 / 6.6 / 6.7 / 6.8 / 6.9).
**Phase status.** ✓ CLOSED 2026-05-11 at squash SHA `TBD` (PR #TBD) (Task 6.9 — Phase-6 closer; resolution at next-sweep per established 12-consecutive-cross-phase-sweep-resolutions convention). **Block A** (6.1a + 6.1b + 6.1c) + **Block B** (6.2) + **Block C** (6.3 + 6.4 + 6.5) + **Block D** (6.6 + 6.7 + 6.8 + **6.9**) ✓ ALL CLOSED; **Phase-6 100% complete — 11 of 11 tasks closed**. Phase-6 OPENED 2026-05-05 at squash SHA `20a62d0` (PR #45). 6.8 feature spec CI integration closed 2026-05-11 at squash SHA `34bd76c` (PR #54; resolved at 6.9 sweep per 12-consecutive-cross-phase-sweep-resolutions precedent). **6.9 Phase-6 closer closed 2026-05-11 at squash SHA TBD (PR #TBD; resolution at next-sweep per established convention); NEW class CLOSURE-NARRATIVE-CONSOLIDATION introduced — project-wide 11th cumulative class; v1 L228 + L230 threshold-decisions communicated to product/engineering leadership; NEW `Docs/Phase6_Closure_Report.md` consolidates the 11-task arc + 16-item Phase-7 carry-forward into 3 blocks + 2 process improvements; §9 main matrix Phase-6 column ADDED with ✓ values directly per sweep-resolution-precedent missed-maintenance recovery; 9th data point chunk-axis preservation pattern**. Phase-6 closure narrative consolidated at `Docs/Phase6_Closure_Report.md` (mirrors Phase-1 + Phase-3 + Phase-4 + Phase-5 single-closure-per-phase precedent).
**Budget.** 4–6 days end-to-end (each task ~0.25–1 day; 1 day buffer).
**Owner.** Frontend engineer + QA.
**Dependencies.** Phase 5 closed at `2acaa82`. No backend work in Phase-6 (R-4 cross-repo partition unchanged).
**Parallelizable?** 6.1a → 6.1b → 6.2 sequential (each unblocks the next). 6.3/6.4/6.5 parallel within Block C. 6.6 → 6.7 sequential (a11y re-measurement gates perf optimization). 6.8 sequential after 6.2 lands. 6.9 closure.

---

## §1. Scope

Production-readiness arc bridging the gap between "Phase-5 measurement reports captured threshold-blow-throughs" and "Strata is shippable to a paying AppFolio prospect". Two empirical findings drive Phase-6 entry:

1. **Phase-5 Task 5.7 §7 entry 4** — appfolio-parity feature specs fail cold-start CI because the `.s-detail-panel` is rendered-but-zero-width when the Strata window opens at the quadrant-spawn default. Latent layout-collapse bug.
2. **Phase-5 Tasks 5.6 + 5.7 measurement reports** — v1 L228 (perf LCP ≤500ms) and v1 L230 (a11y ≤0 WCAG AA violations) thresholds blown through (LCP 4653ms; 362 violating nodes). Captured as PASS/FAIL findings with future-Phase-N decision deferred.

Phase-6 closes both gaps: (1) ship the layout fix + spec remediation + helpers/auth.ts amendment so feature specs run green in CI cold-start; (2) ship the targeted a11y remediation arc to drop violations to zero (or document a defensible new threshold); (3) re-measure perf post-a11y to confirm no regression and pursue targeted optimization if budget allows; (4) integrate the now-green feature specs into `playwright.baseline.config.ts::testMatch`; (5) surface the v1 L228/L230 threshold-decision gate to product/engineering leadership.

**v1-lineage substitute.** Phase-6 has no v1 plan source — this is post-v1 production-readiness arc. Authoritative scope source is `Docs/Phase5_Closure_Report.md §5/§6` carry-forward enumeration (5 items) + Plan v2 §9 row carry-forward + the Task 6.1a HALT-IF discovery (contract-drift in spec assertions) which surfaced the existence of row 6.1b at PRE2 of 6.1a.

Scope boundaries:

- **IN** — frontend layout-collapse fix; spec-defect remediation; helpers/auth.ts amendment; targeted a11y component fixes; perf re-measurement (a11y arc may move LCP); CI testMatch integration; threshold-decision gate communication.
- **OUT** — backend changes (cross-repo per R-4 v2.26); destructive component refactors; new module/route additions; v1 spec amendment (gate decision is communication-only in 6.9).

---

## §2. Definition of Ready

1. Phase 5 closed (✓ at `2acaa82` 2026-05-04).
2. `Docs/Phase5_Closure_Report.md` committed.
3. Phase-5 deferred-items ledger consolidated (✓ at `Docs/Phase5_Closure_Report.md §5`).
4. CDP probe re-runnable against local dev server with inline localStorage seeding pattern (A2 fallback per Phase-5 5.6/5.7 precedent).
5. Per-task PRE0 DC-A 5-query discovery (per Plan v2.29 PERMANENT process change) + Step Zero source-provenance verification (per Phase-4 closure §4).

---

## §3. Definition of Done

Per task:

1. PRE-merge gates green: `tsc -b` + `vitest run` (≥259 baseline) + both `vite build` modes + `verify_no_pii_leak.mjs` strict-clean.
2. Production chunk SHA256 + filename + byte-count captured pre-edit + post-edit; invariance state documented per dual-axis convention (Plan v2.28 reframe — byte-count is canonical).
3. CDP probe re-verification on the actual changed surface (panel rect width / a11y violation count / Lighthouse metrics).
4. Smoke-test pass-count meets per-task acceptance criterion.
5. Manual-dispatch parity-gate green on PR-branch (paths-filter quirk persists; mirrors Phase-5 5.3-5.7 / meta-PR #44 precedent).
6. CodeRabbit review pass.
7. `Docs/Phase6_Task_6_X_Completion_Report.md` committed with 8-section template.
8. §9 sub-tracker row flips `R → ✓`.

---

## §4. Tasks

### Block A — Detail panel + spec remediation (sequential)

#### Task 6.1a — `.s-detail-panel` layout collapse fix (Phase-6 OPENER)

**Goal.** Fix the Strata `.s-detail-panel` rendered-but-zero-width bug surfaced empirically at Phase-5 Task 5.7 PRE2 smoke-test.

**Root cause** (per PRE1 CDP probe `cdp_probe_task_6_1.cjs`): the Strata window opens at quadrant-spawn default (~518–598 px on a 1200 px desktop canvas); after the strata sub-sidebar (~248 px) and 80 px chrome, only ~268 px remains for the `.s-split-view` grid (`grid-template-columns: 320px 1fr`). The 1fr column collapses to 0 because the parent is narrower than the 320 px first column. Detail panel renders at width 0 × height 700 with full content (innerHTML 27 KB, `<h3>` present, 18 children) but Playwright's `toBeVisible()` reports false because zero bounding-box width fails the visibility test.

**Path A.1 + A.2 combined (defense-in-depth).** Per PRE1 review:

- **A.1** — Per-component default-size override in `WindowContext.tsx`. New constant `COMPONENT_DEFAULT_SIZES` exports a lookup `{ 'strata-dashboard': { w: 1100, h: 800 } }` consumed inside `openWindow`. Width clamped to `min(explicit.w, desktopW − 40)` so the window never overflows on smaller displays.
- **A.1 second-order fix** — `Desktop.tsx::useEffect` auto-region-snap (was unconditionally snapping every new window into the active `regionLayout` half/quadrant); imports `COMPONENT_DEFAULT_SIZES` and skips snap for any component declaring an explicit size. Without this, the 1100 × 800 default would be immediately overridden by the 600 × 900 halves-h region snap.
- **A.2** — `StrataDashboard.css` container query. Add `container-type: inline-size` to `.s-module`. Move the previous `@media (max-width: 900px) .s-split-view { grid-template-columns: 1fr }` into a new `@container (max-width: 700px)` rule scoped to the container. Remaining `@media` rules (`.s-kanban`, `.s-detail-stats`, `.s-bids-grid`, `.s-form-row`) stay viewport-driven (genuinely viewport-responsive). Container-query browser support: Chrome 105+ / Firefox 110+ / Safari 16+ — universal as of 2026.

**Files touched.** 3 source files (no fixture / unit-test / spec / schema changes):

- `qualia-shell/src/context/WindowContext.tsx` — exported `COMPONENT_DEFAULT_SIZES` lookup + `openWindow` overrides.
- `qualia-shell/src/components/Shell/Desktop.tsx` — auto-snap opt-out import + skip clause.
- `qualia-shell/src/components/StrataDashboard/StrataDashboard.css` — `container-type` on `.s-module` + `@container` rule for `.s-split-view`.

**Smoke-test gate (relaxed for 6.1a; full 12/12 deferred to 6.1b per task split).** CDP probe `cdp_probe_task_6_1.cjs` (session-local; not committed) must show `panel rect width > 0` across all 8 phase-rows (was 0/8 pre-fix; achieved 8/8 in PRE3 re-probe with measured 434 × 700 detail panel inside 2-col layout). Smoke-test 4-spec set passes ≥10/12 (panel-visibility axis met; the 2 remaining failures are downstream spec defects scoped to Task 6.1b).

**HALT-IF discovery.** PRE2 audit revealed 6 of 6 `wo-block-*` testid assertions in `appfolio-parity-workorder.spec.ts:102-107` are wrapped in `<Section defaultOpen={false}>` (MaintenanceModule.tsx:951-1000) — the `<Section>` component conditionally renders children (`{open && <div>{children}</div>}`), so testids are absent from DOM when collapsed. The vendor-compliance spec `detailPanel.locator('button', { hasText: /^Compliance$/ })` is ambiguous between the tab-bar button and the Section accordion-header button (`aria-controls="vendor-block-compliance"`). Both are spec-authored against UI states the production code never had — surfaced by 6.1a's panel-fix unblocking the runner. **Per user directive at v2.36 amendment: split into 6.1a (source fix only — current task) + 6.1b (spec-defect remediation — next task).**

**Calibration class.** **COMPONENT-FIX (Phase-6 1st distinct in-repo class; project-wide 10th cumulative class).** Production-source edit affecting bundle output. Distinct from all 9 prior classes which were either fixture-class (Phase-1/2/4), backend-mirror (Phase-5 5.1a/d), consumer-side test/wrapper (5.1b/c), MSW-contract (5.2), E2E-Playwright (5.3-5.5), or measurement-only (5.6-5.7).

---

#### Task 6.1b — appfolio-parity spec-defect remediation

**Goal.** Land the 2 spec edits surfaced by 6.1a's HALT-IF so smoke-test reaches 12/12 cold-start and the feature specs become CI-eligible (unblocks 6.8).

**Files touched.** 2 spec files:

- `qualia-shell/e2e/appfolio-parity-workorder.spec.ts` — pre-expand the 6 `<Section defaultOpen={false}>` blocks before the testid-visibility assertions at L102-107 (View as Maintenance Tech / Withheld Amount / Invoices / Texts / Emails / Notes). Use stable section-title text via the existing `<Section>` button. Single ~6-line `for` loop.
- `qualia-shell/e2e/appfolio-parity-vendor-compliance.spec.ts` — narrow the Compliance tab-button locator at L114 to exclude Section accordion-header buttons via `:not([aria-controls])` (or equivalent; alternative is to add a `data-testid="vendor-tab-bar"` on the `<div>` at VendorsModule.tsx:912 — defer the source-edit option unless the spec-only fix has stability issues).

**Smoke-test gate (relaxed at v2.37 task split).** **11/12** — vendor-compliance fully fixed (1/1); workorder spec partially fixed (block-default-collapsed axis + Status-Tracking-conditional-render axis closed); time-windows-rendering axis (5th, surfaced empirically at 6.1b PRE3) deferred to **Task 6.1c** per HARD HALT-IF discipline ("cap latent-exposure chase at 2 expansions of 6.1b"). Original kickoff 12/12 target deferred to 6.1c acceptance.

**Calibration class.** **E2E-PLAYWRIGHT carry-over (extends 3 → 4 cross-phase data points within Phase-5 + Phase-6).** Spec-only edit; no source change; chunk-graph isolated by construction (e2e/ outside Vite entry graph). Vitest 259 → 259 (+0). Production chunk byte-count axis preserved at 1,031,260 (extends Phase-6's 1-of-1 → 2-of-2 byte-count invariance; cross-phase 18-of-18 → 19-of-19).

---

#### Task 6.1c — appfolio-parity-workorder spec full audit (mandatory PRE0; whack-a-mole prohibited)

**Goal.** Close the workorder spec's 5th surviving axis (residentAvailability time-windows-rendering at L161) AND any further latent axes by mandating a full PRE0 audit of every assertion in `appfolio-parity-workorder.spec.ts` against actual rendering contract before applying spec edits.

**Why split (not amend in 6.1b).** 6.1b empirically surfaced **4 distinct contract-drift axes** inside this single spec (block-default-collapsed `<Section defaultOpen={false}>` / Status-Tracking-conditional-render `{meta.tenantStatus && ...}` / Compliance-regex-case-mismatch / time-windows-rendering deferred). The pattern is "spec authored against an idealized UI universe that production never had" — fixing it whack-a-mole-style risks endless successor axes (a 6th, 7th, etc.). Plan v2.36 HARD HALT-IF capped 6.1b at 2 expansions; 6.1c is the structurally cleaner remediation path.

**Mandatory PRE0 audit.** Before ANY spec edit:

1. Walk every `expect(...).toBeVisible()` / `expect(...).toContainText()` / `expect(...).toHaveText()` / `expect(...).not.toBeVisible()` assertion in the spec.
2. For each assertion, identify the production-side render path: `<Section>` wrapper / conditional-render guard / data-dependency on the WO 19511-1 fixture / textContent-vs-visual-text mismatch potential.
3. Cross-reference the WO 19511-1 fixture data (`qualia-shell/public/data/workitems.json`; ~370/371 records carry STRING-typed metadata per Phase-3 Drift #B-i) against the spec's data assumptions.
4. Produce a per-assertion table: ✓ unconditional / ⚠️ data-dependent (verify fixture) / ❌ contract-drift (needs spec edit).
5. Apply spec edits in batch; do NOT enter the 6.1c spec-edit phase until the audit table covers all assertions.

**Files predicted.** 1 spec file (`appfolio-parity-workorder.spec.ts`) + possibly 1 helper file if a section-toggle utility is extracted (e.g., `e2e/helpers/sections.ts`). NO source-of-truth fixture changes (fixture envelope preserved).

**Smoke-test gate.** **12/12** — the original kickoff acceptance criterion deferred from 6.1a → 6.1b → 6.1c.

**Calibration class.** **E2E-PLAYWRIGHT carry-over (extends 4 → 5 cross-phase data points).** Spec-only; chunk-graph isolated.

**Carry-forward from 6.1b §7 (deferred-items relevant to 6.1c):**

- **Click-mechanism workaround captured at 6.1b**: Section accordion-header `<button>` clicks via Playwright's `getByRole(...).click()` are intercepted by `.s-detail-panel`'s overflow scrollbar at the right-edge click coordinate. `force: true` clicks dispatch but don't fire React's onClick state update (likely synthetic-event boundary). 6.1b workaround: `detailPanel.evaluate((panel, titles) => {...native .click()...})` direct DOM dispatch, which React's document-root delegation picks up. **6.1c hardening candidate**: add `data-testid="wo-section-{slug}"` markers to MaintenanceModule.tsx Section component (lets specs use testid-based clicking) OR investigate scrollbar overlap (`scrollbar-gutter: stable` CSS fix candidate). Decision deferred to 6.1c PRE0.
- **Spec-vs-DOM case-mismatch finding at 6.1b**: VendorsModule tab-bar uses lowercase string-array values (`'compliance'`); CSS `textTransform: capitalize` is presentation-only and doesn't change DOM textContent. Future spec authors should prefer `data-testid` markers over visible-text matching for tab-bar buttons. **6.1c hardening candidate**: audit all tab-bar interactions across e2e specs for similar latent case-mismatches.

---

#### Task 6.2 — helpers/auth.ts cold-start sidebar amendment (re-attempt)

**Goal.** Land the helpers/auth.ts amendment originally attempted at Phase-5 Task 5.7 PRE2 then reverted per smoke-test fallback rule (because the unrelated `.s-detail-panel` bug surfaced 0/2 failures). With 6.1a fix on `main` and 6.1b spec-defects remediated, the amendment can now land green.

**Files touched.** 1 spec file:

- `qualia-shell/e2e/helpers/auth.ts` — add 3-line `page.evaluate` + `localStorage.setItem('qualia_sidebar_groups', ...)` + `page.reload()` block before the splash-overlay click in `loginAs`. Mirrors the proven A2 inline pattern from `Scripts/run_axe_phase5.mjs::loginAs` and `Scripts/run_lighthouse_phase5.mjs::loginAs` (Phase-5 5.6/5.7 precedent). Post-amendment, A2 inline duplicates in the measurement scripts can stay (don't refactor; defer Scripts cleanup to a future closure sweep).

**Smoke-test gate.** Same 12/12 target as 6.1b — confirms helpers/auth.ts amendment doesn't regress the now-green feature-spec suite.

**Calibration class.** **E2E-PLAYWRIGHT carry-over (extends 5 → 6 cross-phase data points).** Class-correction landed at Plan v2.39 amendment: prior designation conflated 5.1c X-Qualia-API:v2 emission on `strataApi.backend.ts::request/strataUpload` (production-code transport-layer fetch wrapper — correctly CONSUMER-SIDE-FETCH-WRAPPER) with 6.2's `helpers/auth.ts` addInitScript seeding (e2e test-tooling helper, outside Vite entry graph, alongside Phase-5 5.3/5.4/5.5 + Phase-6 6.1b/6.1c). Correction is purely classificatory; no source/test changes. No source edit; e2e helper module change. Chunk-graph isolated by construction.

---

### Block C — a11y remediation arc (parallel within block; gated on Block A complete)

#### Task 6.3 — Tenant-row icon-button accessible-name (largest a11y impact) — **CLOSED 2026-05-09 at squash SHA `13c6692` (PR #49)**

**Goal.** Resolve ~334 of 362 violating nodes from `Docs/Phase5_A11y_Report.md` in a single targeted fix. The Brianna tenant page (~338 nodes / ~93% of total) carries a tenant-list with icon-only buttons missing `aria-label`. Single-pattern fix at the icon-button component or row template should drop the count significantly.

**Files touched.** 1 source file (below 1-2 estimate): `qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx` (+4 / −1; single-line `aria-label` addition with multi-line reformat at L833 — `aria-label={isBulk ? \`Deselect tenant${t.name ? \` ${t.name}\` : ''}\` : \`Select tenant${t.name ? \` ${t.name}\` : ''}\`}`; defensive `t.name ?` null-safety fallback per user GO refinement; per-row context for screen-reader users e.g. "Select tenant Brianna Jackson").

**Verify (achieved).** Re-ran `Scripts/run_axe_phase5.mjs` on the build with `VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true`; **button-name on Brianna tenant page: 334 → 0 (100% ELIMINATION — EXCEEDS kickoff `≤4` acceptance gate by 4 nodes)**; total Brianna page nodes 338 → 9 (-329 / -97.3%); total all-pages 362 → 33 (-329 / -91%); raw data captured at `Docs/Baselines/2026-05-09_Phase6_task_6_3_a11y_capture.json` (NEW; 11 KB; mirrors Phase-5 schema). **NEW finding** — 5 aria-valid-attr-value violations on Brianna page surfaced post-fix (`<button aria-controls="tenant-block-{slug}">` Section accordion-headers in detail-panel sections folioguard / emergency-contact / upcoming-activities / animals / vehicles); CDP probe `cdp_probe_task_6_3.cjs` (session-local NOT committed) root-caused the violations; STRUCTURALLY surfaced post-Task-6.1a layout fix (detail panel was rendered-but-zero-width pre-6.1a so axe-core didn't traverse interior; 6.1a's 434×700px detail panel made these previously-hidden elements visible); NOT caused by 6.3 edit; falls cleanly under Task 6.4 scope per §4 row 6.4 which already enumerates `aria-valid-attr-value`; 6.4 a11y target now extended to ~33 nodes (was ~28 in pre-6.3 plan).

**🎯 PRE0 mathematical-exactness signal — NEW PERMANENT process discovery at 6.3.** DC-A query 3 found 1 distinct icon-only button pattern at row template L833 × ~334 rendered tenant rows = 334 button-name violations EXACTLY (cross-referenced against `Docs/Baselines/2026-05-04_Phase5_a11y_capture.json::perPage[3].violations[0].nodeCount = 334`); single-pattern hypothesis confirmed via direct count match WITHOUT CDP probe. Audit-first methodology working at PRE0 (not just PRE1 like 6.1c — at 6.1c the audit was a per-row assertion table; at 6.3 the audit is a single counting argument; both shapes structurally validate audit-first vs whack-a-mole). PERMANENT process recommendation captured at 6.3 §7 entry 1 for GR-15 inclusion at next plan amendment.

**Calibration class.** **COMPONENT-FIX carry-over (extends 1 → 2 within Phase-6; project-wide 10 cumulative classes unchanged).** 6.1a was 1st distinct in-repo COMPONENT-FIX with CSS-LAYOUT-FIX shape; 6.3 is 2nd with A11Y-COMPONENT-FIX shape. Sub-classes deferred per §11 until Phase-7+ third structurally-distinct production-chunk-edit shape surfaces.

**Production chunk axes.** SHA256 BREAK predicted + observed (`81e1fdc…d1d4` → `6c17f2f…a768` — production-source edit class structurally breaks SHA256 by construction; mirrors 6.1a as 2nd Phase-6 production-source edit data point); filename hash rotated `StrataDashboard-BqghmASj.js` → `StrataDashboard-DhcqiSlI.js` (the `[name]-[hash]` filename pattern shifted at 6.1a is preserved across 6.2 + 6.3, validating it's structural-not-incidental); byte-count BREAK `1,031,260` → `1,031,359` (+99 bytes within kickoff prediction range +30-100); 21-of-21 cross-phase byte-count invariance milestone retired at this Phase-6 production-source edit; reset to 1-of-1.

**Smoke-test gate (preserved post-edit).** 12/12 cold-start smoke-test PASS on chromium project (kickoff acceptance criterion met); helpers/auth.ts permanent amendment from 6.2 continues to seed `qualia_sidebar_groups` correctly across the production-source edit. Vitest 259 → 258 LOCAL only — `calendar.test.tsx:260` pre-existing environmental flake on darwin host (verified via `git stash` + re-run on clean `main` HEAD `68e35d0`); CI passed 259/259 on PR #48 at HEAD `9c69543` on 2026-05-09T08:20Z; CI is the authoritative gate.

**Block C status.** **🎯 Phase-6 Block C OPENED at 6.3 closure** — Block A (6.1a + 6.1b + 6.1c) + Block B (6.2) complete; Block C (6.3 + 6.4 + 6.5 a11y arc) opens with 6.3 closure; 6.4 + 6.5 unblocked and parallelizable per §10 timeline.

**Sweep co-ship.** 6.2 TBD → `68e35d0` / `#48` resolution co-shipped at 6.3 sweep per absorb-into-next-sweep cross-phase convention now established at 6 consecutive sweep-resolutions (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3); pattern fully cemented.

---

#### Task 6.4 — color-contrast / select-name / aria-valid-attr-value / scrollable-region-focusable targeted fixes — **CLOSED 2026-05-09 at squash SHA `fc3ce46` (PR #50)**

**Goal.** Resolve the remaining a11y violations spread across the 4 target rules (color-contrast / select-name / aria-valid-attr-value / scrollable-region-focusable) plus residual button-name nodes outside the tenant-row pattern fixed at 6.3.

**Files touched (achieved).** **6 source files** (above 3-5 estimate): `qualia-shell/src/components/Sidebar/Sidebar.css` (1 CSS edit; closes 8 color-contrast nodes via single rule × 2 elements × 4 pages = 8) + `qualia-shell/src/components/StrataDashboard/modules/VendorsModule.tsx` (5 edits: Section content `id` add + RefreshCw aria-label + 2 select aria-labels + list-panel triplet) + `qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx` (3 edits: Section content `id` add + 2 select aria-labels) + `qualia-shell/src/components/StrataDashboard/modules/MaintenanceModule.tsx` (2 edits: RefreshCw aria-label + list-panel triplet) + `qualia-shell/src/components/StrataDashboard/modules/PropertiesModule.tsx` (1 edit: RefreshCw aria-label, preventive per user GO Path 2) + `qualia-shell/src/components/StrataDashboard/modules/ProfileSpaces.tsx` (1 edit: Send icon aria-label, closes 2 nodes by construction since rendered in PropertiesModule:2197 + MaintenanceModule:677); 13 source-line edits / +14 / −13 net.

**Verify (achieved).** **🎯 33 → 0 violations across all 4 enriched detail pages — 100% ELIMINATION — v1 L230 ZERO WCAG AA THRESHOLD MET.** Re-ran `Scripts/run_axe_phase5.mjs` on the build with `VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true`; raw data captured at `Docs/Baselines/2026-05-09_Phase6_task_6_4_a11y_capture.json` (NEW; 2 KB; mirrors Phase-5 schema; ZERO violations everywhere). Cross-phase trajectory: 362 (Phase-5 baseline 2026-05-04) → 33 (post-6.3) → **0** (post-6.4). Per-rule elimination: aria-valid-attr-value 15→0 / button-name 4→0 / color-contrast 8→0 / scrollable-region-focusable 2→0 / select-name 4→0.

**🎯 PRE0 mathematical-exactness signal — REFINEMENT at 6.4 for GR-15 PERMANENT process changes.** Per 6.3 §7 entry 1, the math `(rule-count) ÷ (per-pattern-count)` was discovered as a way to confirm single-pattern hypotheses without CDP probe. At 6.4, the math worked for **4-of-5 rules** (color-contrast 8÷4=2 / aria-valid-attr-value 15÷15=1 / select-name 4÷4=1 / scrollable-region-focusable 2÷2=1) but **failed for button-name** (4 nodes split 1+1+2 across pages → 2 distinct sub-patterns required CDP probe `cdp_probe_task_6_4.cjs` to disambiguate ProfileSpaces Send vs RefreshCw ghost). REFINEMENT: math is necessary-but-not-sufficient when per-page distribution is uneven; CDP probe still required for sub-pattern disambiguation. Recommended for GR-15 inclusion at v2.41 amendment.

**🎯 Plan-v-reality drift documented.** This row originally said "~28 nodes" target but actual at 6.4 PRE0 was 33 nodes (28 baseline + 5 NEW Brianna `aria-valid-attr-value` surfaced post-Task-6.1a layout fix and confirmed at 6.3 axe re-measurement). Reconciliation: row 6.4 closure narrative cites actual = 33 → final = 0. Recurring pattern observation: phase-spec written ahead of empirical measurement may carry stale node counts; future Phase-N a11y plans should anchor scope to "all violations as of PRE0 axe measurement" rather than absolute counts.

**Calibration class.** **COMPONENT-FIX carry-over Phase-6 3rd distinct data point of class** (extends 2pt → 3pt within Phase-6; project-wide 10 cumulative classes unchanged). 6.1a was 1st (CSS-LAYOUT-FIX shape); 6.3 was 2nd (A11Y-COMPONENT-FIX shape); 6.4 is 3rd (A11Y-COMPONENT-FIX-MULTI-RULE shape — same umbrella, similar sub-shape to 6.3). Sub-classes deferred per §11 until Phase-7+ third structurally-distinct production-chunk-edit shape surfaces.

**Production chunk axes.** SHA256 BREAK predicted + observed (`6c17f2f…a768` → `0f9a472…ebe4` — production-source edit class structurally breaks SHA256 by construction; mirrors 6.1a + 6.3 as 3rd Phase-6 production-source edit data point); filename hash rotated `StrataDashboard-DhcqiSlI.js` → `StrataDashboard-BnaHIKND.js` (the `[name]-[hash]` filename pattern preserved across 4 cross-phase data points 6.1a + 6.2 + 6.3 + 6.4); byte-count BREAK `1,031,359` → `1,031,711` (+352 bytes; slightly above kickoff prediction range +50-200 due to 13 source-line edits + Sidebar.css multi-line WCAG-rationale comment).

**Smoke-test gate (preserved post-edit).** 12/12 cold-start smoke-test PASS on chromium project (kickoff acceptance criterion met); helpers/auth.ts permanent amendment from 6.2 continues to seed `qualia_sidebar_groups` correctly across the multi-file production-source edits. Vitest 259 → 258 LOCAL persists (same `calendar.test.tsx:260` pre-existing darwin-environmental flake from 6.3 §7 entry 7); CI authoritative; expect 259/259 in CI on PR-branch parity gate run.

**🎯 3-instance RefreshCw pattern closure.** Per user GO Path 2, preventive aria-label was added on PropertiesModule.tsx:522 RefreshCw button despite axe not detecting it on Property page (rendering-order coincidence — Property page rendered another button at axe scan time but source-grep confirmed identical pattern as Vendors:668 + Maintenance:513). All 3 instances are now consistently aria-labeled across all 3 modules; future module additions following this pattern should inherit the convention; captured as Conventions block update in CLAUDE.md.

**Block C status.** **🎯 Phase-6 Block C 2-of-3 CLOSED at 6.4** — Block A (6.1a + 6.1b + 6.1c) + Block B (6.2) complete; Block C (6.3 ✓ + 6.4 ✓) 2-of-3; only 6.5 (a11y closure cleanup + axe-baseline.spec.ts re-enable assessment) remains in Block C. With 0 residual violations at 6.4, **6.5 may close as a near-no-op cleanup** — only remaining substantive work is the axe-baseline.spec.ts re-enable assessment (Phase-0-era informational gate; flipping from `continue-on-error: true` to blocking is now structurally viable since violations = 0).

**Sweep co-ship.** 6.3 TBD → `13c6692` / `#49` resolution co-shipped at 6.4 sweep per absorb-into-next-sweep cross-phase convention now established at **7 consecutive sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4); pattern fully cemented as cross-phase convention.

---

#### Task 6.5 — a11y closure cleanup (any residuals + axe-baseline.spec.ts re-enable assessment) ✓ CLOSED 2026-05-09

**Goal.** Address any residual a11y violations not captured at 6.3/6.4. Decide whether to flip `axe-baseline.spec.ts` from informational to blocking gate (Phase-0 baseline; currently informational pending Linux snapshot capture). Cross-repo coordination if backend-rendered HTML carries violations.

**Closure narrative (2026-05-09).** Task 6.5 closed at squash SHA `e245ebf` (PR #51; merged 2026-05-11T03:11Z UTC; TBD resolved at 6.6 sweep) as **DOC-only-with-baseline-recapture** per Cowork GO Option A reframe. Empirical execution: **0 source edits** / **6 doc/config edits** (NEW `Docs/Phase6_Task_6_5_Completion_Report.md` 8-section template + NEW `Docs/Baselines/2026-05-09_Phase6_post_remediation_a11y_capture.json` canonical Phase-6 closure-snapshot artifact + UPDATE `Docs/Phase6_Task_6_4_Completion_Report.md` 6.4 TBD resolution + UPDATE `Docs/AppFolio_Parity_Implementation_Plan_v2.md` v2.42 + v2.43 amendments + UPDATE `CLAUDE.md` HEAD pointer + Production chunk axes kept at parity-gate canonical per corrected Option A reframe + NEW build-mode footnote per v2.43 GR-15 + Block D opens marker + NEW `.gitignore` defensive update). v1 L230 ZERO WCAG AA threshold MET continues to hold at HEAD `fc3ce46` PRE0 (re-confirmed via fresh `vite build` + `vite preview` + `cdp_probe_task_6_4.cjs` re-scan: 0 violation rules / 0 nodes across all 4 enriched detail pages). Gate-flip viability assessed but NOT executed at 6.5 — flipping `axe-baseline.spec.ts` `continue-on-error: true → false` at `.github/workflows/appfolio-parity-gate.yml:77` is structurally viable now (violations = 0) but is gated on the Linux Playwright baseline capture (still a Phase-0 deferred item per `Docs/Baselines/phase_0_0_exit_gate_report.md` "Deferred Item" section L54-65); per Cowork-aligned recommendation, defer the actual flip to Task 6.8 (Feature spec CI integration) where Linux-baseline + axe-gate-flip can be co-decided as a single CI-architecture sweep. **🎯 Substantive PRE0 discovery surfaced at 6.5 (initially framed as env-nondeterminism; CORRECTED at post-edit verification to build-mode dependency once a 4-row env-var matrix at HEAD `fc3ce46` fully attributed the variance):** production chunk axes captured under `VITE_USE_STATIC_API=true npx vite build` (the `cdp_probe_task_6_4.cjs` prereq mode) produce a structurally distinct chunk vs the parity-gate canonical (`npx vite build` / `VITE_APPFOLIO_SEEDS={true,false}` — all three byte-identical to `BnaHIKND.js` / 1,031,711 / `0f9a472…ebe4`). The static-API-mode alt-build at HEAD `fc3ce46` is `StrataDashboard-5qXj0bDb.js` / 1,031,052 B / `0deb2e80…d5a0` (-659 bytes; static-API runtime path bakes fewer bytes into the StrataDashboard chunk). CLAUDE.md HEAD-post-6.4 axes are CORRECT for the parity-gate canonical build. Cowork Option A reframe (corrected at post-edit verification) kept the parity-gate canonical axes as HEAD-post-6.5 reference and added a build-mode footnote to CLAUDE.md per v2.43 GR-15. Option B remained rejected (drop chunk-axis prediction would lose 4 cross-phase data points of structural insight); Option C ("investigate first — multi-hour Vite/Rollup determinism investigation") was rejected at PRE0 but turned out trivially short at post-edit verification (the 4-row matrix attributed the variance in minutes); deferred Phase-7 build-determinism arc is no longer required for this specific discovery. **🎯 NEW PERMANENT process discovery at 6.5 §7 entry 1** — build-mode-aware chunk-axis comparison protocol: document the exact env-var combination of the build invocation (`VITE_APPFOLIO_SEEDS={true|false}`, `VITE_USE_STATIC_API={true|unset}`); capture pre-edit baseline IMMEDIATELY before the edit using the SAME env-var combination that will be used post-edit; do not compare cdp_probe-build axes against parity-gate-build axes. Recommended for GR-15 inclusion at v2.43 amendment (one-up from v2.42 PRE0-mathematical-exactness inclusion already planned for 6.5; corrected at post-edit verification from PRE0's initial env-nondeterminism framing). **🎯 6.4 TBD → `fc3ce46` / `#50` resolution co-shipped at 6.5 sweep — 8 consecutive sweep-resolutions cross-phase pattern fully cemented.** **🎯 Phase-6 Block C 3-of-3 CLOSED at 6.5; Block D opens with 6.6.** See `Docs/Phase6_Task_6_5_Completion_Report.md` for full 8-section narrative.

**Calibration class.** **MEASUREMENT-ONLY carry-over — Phase-6 1st distinct data point of class; extends Phase-5 2pt → 3pt cross-phase.** Class-correction on the fly per kickoff brief authorization ("If source changes prove necessary (unlikely), reclassify on the fly"; converse case here — original Phase_6_Plan.md row 6.5 designation was COMPONENT-FIX-4pt assuming source edits, but empirical execution is DOC-only-with-baseline-recapture so MEASUREMENT-ONLY applies). **COMPONENT-FIX class stays at 3pt within Phase-6** (no extension to 4pt; Phase-6 6.1a CSS-LAYOUT-FIX shape + 6.3 A11Y-COMPONENT-FIX shape + 6.4 A11Y-COMPONENT-FIX-MULTI-RULE shape). MEASUREMENT-ONLY may extend to 4pt cross-phase at 6.6 close (Phase-5 2pt + 6.5 + 6.6).

---

#### Task 6.6 — Re-run a11y measurement post-remediation — **CLOSED 2026-05-11 at squash SHA `191038a` (PR #52; resolved at 6.7 sweep)**

**Goal.** Re-execute `Scripts/run_axe_phase5.mjs` (or rename → `Scripts/run_axe_phase6.mjs` if convention prefers per-phase; defer the rename decision to PRE0 of this task) to capture the new violation count for closure narrative. NEW `Docs/Phase6_A11y_Report.md` mirrors `Docs/Phase5_A11y_Report.md` byte-shape with side-by-side delta table.

**Closure narrative (2026-05-11).** Task 6.6 closed at squash SHA TBD (resolution at 6.7 sweep per 9-consecutive-cross-phase-sweep-resolutions precedent). **Block D's first task; opens Block D.** **🎯 v1 L230 ZERO WCAG AA threshold MET — 5th independent confirmation at HEAD `e245ebf`** (post-6.4 axe-core measurement → 6.5 PRE0 cdp_probe → 6.5 post-edit cdp_probe → 6.6 PRE0 cdp_probe → 6.6 post-edit `run_axe_phase6.mjs`); zero-state deterministic across all 5 captures. **Substantive PRE0 finding** — Q4 reusability inspection caught critical L353 artifact-filename hardcode in `Scripts/run_axe_phase5.mjs` (15 Phase-5 hardcodes total; L353 would have produced misnamed `2026-05-11_Phase5_a11y_capture.json` artifact violating phase-versioned-artifact-naming convention) → Cowork-resolved Option C: `git mv Scripts/run_axe_phase5.mjs Scripts/run_axe_phase6.mjs` + targeted string-replace patch with JSDoc rewrite to Phase-6 framing per Cowork Q3 verdict; historical Phase-5 SCOPE-COLLISION narrative preserved via `git log --follow` + `Docs/Phase5_Closure_Report.md §3` cross-reference; active-code JSDoc reflects current Phase-6 Task 6.6 purpose. 6 doc-config edits + 1 script-rename via `git mv` + 1 new raw-data artifact (`Docs/Baselines/2026-05-11_Phase6_task_6_6_a11y_capture.json` per Cowork Q2 verdict — per-task raw-data, NOT closure-snapshot duplicate; the canonical Phase-6 closure-snapshot remains the 6.5 `_post_remediation_a11y_capture.json` artifact) + 1 new analyzed report (`Docs/Phase6_A11y_Report.md` 176 lines / 18,057 bytes byte-shape mirror of `Docs/Phase5_A11y_Report.md` 170 lines / 12,756 bytes; slight expansion for side-by-side cross-phase delta cols in §0/§2/§3/§4; §6 inverts Phase-5's "threshold-drift findings → future-Phase-N decision deferred" to "threshold-MET confirmation → Phase-5 deferred recommendation closed"). **🎯 6.5 TBD → `e245ebf` / `#51` resolution co-shipped at 6.6 sweep — 9 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → **6.6**); pattern fully cemented as cross-phase convention; resolved in 6 spots across `Docs/Phase6_Task_6_5_Completion_Report.md` (§1 squash SHA + §5 verification matrix CI rows 15-16 + §6 PR title + §6 manual-dispatch fallback + §6 CodeRabbit review + §6 post-merge-sweep description) + 1 spot in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 row 6.5 squash-SHA cell. **🎯 6th data point of test-tooling/DOC-only production-chunk-axis preservation pattern** (Scripts/-rename + DOC-only edits are outside Vite entry graph; parity-gate canonical PRESERVED byte-for-byte at `BnaHIKND.js` / 1,031,711 / `0f9a472…ebe4`; very strong inductive evidence at 6 cross-phase data points post-LAW-retirement). **🎯 Paths-filter quirk extension co-shipped** — 3 NEW root-file patterns documented in CLAUDE.md (`.gitignore` root + `CLAUDE.md` root + `Docs/Baselines/**`) extending the 4.7/5.3-5.7 established-precedent count to 7-task cross-phase scope. See `Docs/Phase6_A11y_Report.md` for the cross-phase delta narrative + per-rule per-page elimination breakdown.

**Calibration class.** **MEASUREMENT-ONLY carry-over — Phase-6 2nd distinct data point of class; extends to 4pt cross-phase at empirical close** per Cowork Q4 verdict (Phase-5 2pt [Tasks 5.6 + 5.7] + 6.5 + 6.6 = 4pt cross-phase; class fully calibrated as 4-data-point class at 6.6 close). **Plan-v-reality reconciliation:** row 6.6 §3 above predicted 3pt extension when authored under the assumption 6.5 was COMPONENT-FIX-4pt; 6.5 on-the-fly reclassification at 6.5 close to MEASUREMENT-ONLY (per kickoff brief authorization "If source changes prove necessary (unlikely), reclassify on the fly"; converse case at 6.5 — DOC-only-with-baseline-recapture so MEASUREMENT-ONLY applies) pushed the count +1; at 6.6 empirical close MEASUREMENT-ONLY = 4pt fully calibrated cross-phase class. **COMPONENT-FIX class stays at 3pt within Phase-6** (no extension; 6.6 is MEASUREMENT-ONLY not COMPONENT-FIX).

---

### Block D — Perf + CI integration + closure (sequential) — **OPENED 2026-05-11 at Task 6.6 close (squash SHA `191038a` / PR #52); 3-of-4 CLOSED at 6.8 (6.6 + 6.7 [`be1bd42` / PR #53; resolved at 6.8 sweep] + 6.8 [squash SHA TBD; resolution at 6.9 sweep])**

#### Task 6.7 — Perf reconnaissance + Lever 1 evaluation + Phase-7 multi-lever arc prepared — **CLOSED 2026-05-11 at squash SHA `be1bd42` (PR #53; resolved at 6.8 sweep per 11-consecutive-cross-phase-sweep-resolutions precedent)**

**Goal.** Targeted perf work to drop LCP from Phase-5 baseline (4,653 ms / ~9.3× over v1 L228 ≤500 ms target). Candidate levers per Phase5_Perf_Report.md §6: code-splitting beyond `manualChunks`, lazy-loading routes, SSR shell, CDN edge caching, image preloading. Scope decision at PRE0 — single-lever scope-bound discipline per Cowork verdict.

**Re-measurement.** Re-run `Scripts/run_lighthouse_phase6.mjs` (renamed from `Scripts/run_lighthouse_phase5.mjs` at 6.7 per 6.6 precedent); capture `Docs/Phase6_Perf_Report.md` with side-by-side delta + Phase-7 multi-lever arc prepared.

**Closure narrative (2026-05-11).** Task 6.7 closed at squash SHA `be1bd42` (PR #53; resolved at 6.8 sweep per 11-consecutive-cross-phase-sweep-resolutions precedent). **DOC-only-empirical-finding closure per Cowork GO Option B REVERT.** PRE0 5-lever empirical analysis identified Google Fonts deferral (Lever 1) via preload+onload + `<noscript>` fallback as highest-ROI single-lever hypothesis (estimated LCP delta −500 to −1,500 ms). Empirical n=5 Lighthouse measurement post-edit underperformed PRE0 estimate: **LCP mean 4,204 ms vs Step-2.0 anchor 4,352 ms = −148 ms / −3.4%; vs combined pre-edit mean ~4,500 ms = −300 ms / −6.7%; PRIMARY gate ≤3,800 ms MISSED by ~400 ms; Performance score 84.2 mean MISSED gate ≥85 by 0.8**; high Lighthouse measurement variance (range 2,399 ms across n=5 captures = ~5× Phase-0 baseline variance of ~450 ms) disqualifies the small improvement. **🎯 Dominant render-blockers correctly identified empirically post-edit — `index-DubCb24b.css` (158,955 B raw) + `index-CTl84rdZ.js` (597,519 B raw) + `index-1yBoi7Al.js` (87,711 B raw)** — NOT Google Fonts (which is ~3-5 KB CSS); kickoff hypothesis ("React.lazy on StrataDashboard chunk; the 1,031,711 B chunk is dominant initial-paint") empirically disconfirmed — `dist/index.html` shows ONE eager `<script>` for `index-CTl84rdZ.js`; StrataDashboard / TranscriptionHub / pdf / PDFButton / all module chunks are dynamically imported and NOT initial-paint-blocking. **Cowork GO Option B verdict (REVERT):** Lever 1 reverted at closure (`git checkout HEAD -- qualia-shell/index.html`); 6.7 closes as DOC-only-empirical-finding (analogous to 6.5/6.6 DOC-only shapes); Phase-7 multi-lever arc inherits empirically-justified lever priority: Lever 2 (manualChunks vendor split via `vite.config.ts` which currently has NO `manualChunks` configured per 6.7 PRE0 Q4 empirical confirmation) + Lever 3 (lazy-load App.tsx eagerly-imported components TenantPortal / SecurityPortal / OpenJarvisWidget / etc.) stacked → Phase-7 PRIMARY ≤3,000 ms (~30% reduction) / ASPIRATIONAL ≤2,000 ms (~50%); v1 L228 ≤500 ms remains structurally unattainable single-lever (defer to Phase-8+ with SSR consideration). **🎯 v1 L230 ZERO WCAG AA threshold MET — 8th independent confirmation at HEAD `be1bd42`** (post-6.4 → 6.5 PRE0 → 6.5 post-edit → 6.6 PRE0 → 6.6 post-edit → 6.7 PRE0 Q5 → 6.7 Step-2.0 anchor → 6.7 post-revert closure-snapshot); zero-state deterministic across all 8 captures. **Substantive PRE0 finding #2 — `Scripts/run_lighthouse_phase5.mjs` Q3 reusability inspection identical pattern to 6.6's `run_axe_phase5.mjs` inspection** (2 critical hardcodes — L403 task JSON field + L419 artifact filename — + ~12 JSDoc Phase-5 references + 3 runtime-injected `window.__phase5_*` globals) → Cowork-resolved Option C identical to 6.6: `git mv Scripts/run_lighthouse_phase5.mjs Scripts/run_lighthouse_phase6.mjs` + targeted string-replace patch with JSDoc rewrite to Phase-6 framing + internal globals renamed to `window.__phase6_*`; historical Phase-5 5.6 SCOPE-COLLISION narrative preserved via `git log --follow Scripts/run_lighthouse_phase6.mjs` + `Docs/Phase5_Closure_Report.md §3` + `Docs/Phase5_Perf_Report.md` cross-reference. **🎯 6.6 TBD → `191038a` / `#52` resolution co-shipped at 6.7 sweep — 10 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → **6.7**); resolved across §9 row 6.6 squash-SHA cell in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` + Phase status line at top of this plan. **🎯 7th data point of test-tooling/DOC-only/script-rename production-chunk-axis preservation pattern** (Step-2.5 verified all 3 production JS chunk axes preserved byte-for-byte vs HEAD `191038a` parity-gate canonical at `StrataDashboard-BnaHIKND.js` / 1,031,711 / `0f9a472…ebe4` + `index-CTl84rdZ.js` / 597,519 / `768be277…10af0` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7`; SEEDS=false build byte-identical; static-API build matches CLAUDE.md footnote axes; Step-2.5.5 post-revert re-verification confirmed preservation trivially since revert is symmetric); very strong inductive evidence at 7 cross-phase data points post-LAW-retirement. **Substantive Phase-7 deferred-item #1 — Lighthouse measurement variance characterization** (recommended for GR-15 inclusion at v2.46 amendment). **Substantive Phase-7 deferred-item #2 — Phase-5 Perf Report §2 LCP root-cause analysis is stale** (footnote at next sweep). **🎯 Paths-filter quirk holds — 8-task cross-phase scope now**: 4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / **6.7**. 0 source files / 4 doc-config edits + 1 script-rename via `git mv` + 1 new analyzed report (`Docs/Phase6_Perf_Report.md` byte-shape mirror of Phase5_Perf_Report.md 185 lines / 15,428 bytes) + 1 new raw-data artifact (`Docs/Baselines/2026-05-11_Phase6_task_6_7_perf_capture.json` — post-revert closure-snapshot; final authoritative Phase-6 perf snapshot, analogous to the 6.5 `_post_remediation_a11y_capture.json` closure-snapshot for a11y). Vitest 259/259 PASS LOCAL on darwin at 6.7 (clean run; first clean local run since 6.3 — `calendar.test.tsx:260` flake didn't fire); CI authoritative; expect 259/259 in CI.

**Calibration class.** **MEASUREMENT-ONLY-with-source-rename carry-over — Phase-6 3rd distinct data point of class; extends to 5pt cross-phase at empirical close** per Cowork verdict (Phase-5 2pt [Tasks 5.6 + 5.7] + 6.5 + 6.6 + 6.7 = 5pt cross-phase). **NOT ASSET-LOADING-EDIT** (that class designation was outcome-conditional on shipping the lever; reverting keeps 6.7 in the MEASUREMENT-ONLY lineage where 6.5 + 6.6 sit). **Plan-v-reality reconciliation:** row 6.7 §3 above predicted "COMPONENT-FIX or NEW PERF-OPTIMIZATION class depending on scope choice"; empirical execution was DOC-only-empirical-finding (Lever 1 reverted) so MEASUREMENT-ONLY-with-source-rename applies — per kickoff brief authorization "If source changes prove necessary (unlikely), reclassify on the fly"; converse case at 6.7 — Lever 1 source change was made and reverted, so net source change is zero. **COMPONENT-FIX class stays at 3pt within Phase-6** (no extension; 6.7 is MEASUREMENT-ONLY not COMPONENT-FIX).

---

#### Task 6.8 — Feature spec CI integration — **CLOSED 2026-05-11 at squash SHA `34bd76c` (PR #54; resolved at 6.9 sweep per 12-consecutive-cross-phase-sweep-resolutions precedent)**

**Goal.** Add the 3 feature specs (`strata-nav.spec.ts` + `appfolio-parity-workorder.spec.ts` + `appfolio-parity-vendor-compliance.spec.ts`) to `playwright.baseline.config.ts::testMatch` (currently scoped to `screenshot-baseline.spec.ts` + `axe-baseline.spec.ts` only). Gates on 6.1b + 6.2 complete (specs must be 12/12 green cold-start) — both satisfied since Phase-6 Block A close at 6.1c (`ebb9cce`) + Block B close at 6.2 (`68e35d0`).

**Files touched.** 1 config file: `qualia-shell/playwright.baseline.config.ts` — add 3 entries to `testMatch` array (+5 / −1 with JSDoc Phase-6 Task 6.8 amendment block; single-line array reformat to multi-line).

**Closure narrative (2026-05-11).** Task 6.8 closed at squash SHA `34bd76c` (PR #54; resolved at 6.9 sweep per 12-consecutive-cross-phase-sweep-resolutions precedent). **Path A STRICT CONFIG-ONLY per Cowork GO.** Empirical execution: **1 config file edit** / **N doc/config edits**. 3 NEW feature specs **8/8 PASS** under new `playwright.baseline.config.ts` invocation (mirrors 8/8 at 6.7 under `playwright.config.ts::chromium`; 19.8s wallclock; helpers/auth.ts 6.2 amendment continues to seed `qualia_sidebar_groups` correctly across the new config invocation). **🎯 Substantive PRE0 Q5 finding — `qualia-shell/e2e/axe-baseline.spec.ts` is soft-assert by design** (L127 comment: *"Soft-assert: this is a baseline capture, not a blocker. Just log."*; NO `expect()` calls on violation count; spec only collects → JSON write → console.log). **Flipping `.github/workflows/appfolio-parity-gate.yml:77` `continue-on-error: true → false` is structurally no-op for axe-baseline** — strict mode still passes regardless of violation count because there's no failing assertion. **Path B as originally framed in kickoff brief is structurally infeasible as a workflow-only edit**; requires SPEC EDIT (`expect(axeResults.violations.length).toBe(0)`) + workflow step-split + pre-task COMPONENT-FIX on **3 button-name violations surfaced at PRE0 Q3 (Leasing / Owners / Accounting module landing pages, 1 node each, critical WCAG 4.1.2)** — Block C scope was strictly the 4 enriched detail pages (Vendors / Residents / Maintenance / Properties) and does NOT extend to module landing pages; sister-shape to 6.3/6.4 COMPONENT-FIX arc; recommend Phase-7 Block A: a11y-landing-page-extension. **Cowork GO Path A STRICT CONFIG-ONLY verdict** — 6.8 lands as 1-line testMatch extension; gate-flip + Linux baselines + button-name COMPONENT-FIX defer to Phase-7 as a coherent 3-subtask Block A arc. **🎯 Substantive PRE0 finding — re-attribution of 6.7's 9 e2e failures as screenshot-baseline-only** (axe-baseline cannot fail on violation count per soft-assert design; the 9 failures at run [25656801730](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25656801730) were exclusively screenshot-baseline darwin-vs-Linux render diffs); CLAUDE.md "CI Behavior" section corrected. **🎯 Substantive PRE0 finding — within-darwin screenshot-baseline drift since Phase-0** (full 5-spec local run at Step-2.2 surfaced all 8 screenshot tests FAIL on darwin against darwin baselines; 31510 pixels = 3% > 1% tolerance; Phase-0 2026-04-22 baselines pre-date Phase-1→6 component changes); NOT a regression introduced by 6.8; same `continue-on-error: true` shield in CI. **🎯 8th data point of test-tooling/DOC-only/script-rename/asset-loading-edit-then-reverted/config-only production-chunk-axis preservation pattern** (Step-2.5 verified all 4 production chunk axes preserved byte-for-byte vs HEAD `be1bd42` parity-gate canonical across all 3 modes [bare / SEEDS=true / SEEDS=false byte-identical]: `StrataDashboard-BnaHIKND.js` / 1,031,711 / `0f9a472…ebe4` + `index-CTl84rdZ.js` / 597,519 / `768be277…10af0` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `index-DubCb24b.css` / 158,955 / `cabc7535…738f`); very strong inductive evidence at 8 cross-phase data points post-LAW-retirement. **🎯 6.7 TBD → `be1bd42` / `#53` resolution co-shipped at 6.8 sweep — 11 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → **6.8**); resolved across Phase status line at top of this plan + Task 6.7 closure-narrative + §9 row 6.7 squash-SHA cell in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` + CLAUDE.md HEAD pointer (5+ spots). **🎯 Paths-filter quirk extends to 10-task cross-phase scope** — `qualia-shell/playwright.baseline.config.ts` is at `qualia-shell/-root`, NOT covered by the `qualia-shell/src/**` paths-filter; extends established 9-task precedent (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7) to **10-task** adding **6.8**; manual-dispatch expected at PR open. **🎯 Phase-6 Block D 3-of-4 CLOSED at 6.8** (only 6.9 Phase-6 closer remains; 91% phase complete — 10 of 11 tasks closed). 9 Phase-7 deferred-items captured at 6.8 §7 (3 button-name on Leasing/Owners/Accounting / axe-baseline assertion-strengthening / workflow step-split / Linux baseline capture mechanism build / Linux baseline capture for 8 surfaces / screenshot-baseline gate-flip / stray overview-chromium-linux.png provenance / Lighthouse variance characterization carry from 6.7 / retries discrepancy baseline vs default). See `Docs/Phase6_Task_6_8_Completion_Report.md` for full 8-section narrative.

**Calibration class.** **E2E-PLAYWRIGHT carry-over — Phase-6 4th distinct data point of class within Phase-6; extends to 7pt cross-phase at empirical close** (Phase-5 3pt [5.3 + 5.4 + 5.5] + 6.1b + 6.1c + 6.2 + **6.8** = 7pt; mirrors row 6.2 v2.39 class-correction precedent — test-tooling-config-edit nature of 6.2's helpers/auth.ts addInitScript amendment carries forward to 6.8's playwright.baseline.config.ts testMatch amendment; both outside Vite entry graph; both preserve all production chunk axes byte-for-byte). **Plan-v-reality reconciliation:** the original row 6.8 stub said "extends to 5 cross-phase data points; class structurally retired per E2E-PLAYWRIGHT retirement at 5.5" — that designation was authored before the v2.39 class-correction landed; empirical execution carries 7pt at 6.8 close per the v2.39 reclassification (Phase-5 3pt + Phase-6 4pt). **COMPONENT-FIX class stays at 3pt within Phase-6** (no extension; 6.8 is E2E-PLAYWRIGHT not COMPONENT-FIX). **MEASUREMENT-ONLY-with-source-rename class stays at 5pt cross-phase** (no extension at 6.8 — that class is for measurement tasks like 6.5/6.6/6.7).

---

#### Task 6.9 — Phase-6 closer (single-closure-per-phase precedent) — **CLOSED 2026-05-11 at squash SHA `TBD` (PR #TBD; resolution at next-sweep per established 12-consecutive-cross-phase-sweep-resolutions convention)**

**Goal.** v1 L228 + L230 threshold-decision gate communicated to product/engineering leadership; closure artifact `Docs/Phase6_Closure_Report.md` consolidates the 11-task arc; §9 main matrix Phase-6 column ADDED with `✓` values (sweep-resolution-precedent missed-maintenance recovery; column was never added at Phase-6 OPENING — surfaced at 6.9 PRE0 Q4).

**Threshold gate.** Surface decision: (a) tune Phase-6 measurements vs. v1 L228/L230 prove parity is achievable; or (b) explicit v1 spec amendment if reality-vs-spec gap is structural. Decision is non-blocking on Phase-6 close — communication is the deliverable, not the resolution.

**Closure narrative (2026-05-11).** Task 6.9 closed at squash SHA `TBD` (PR #TBD; resolution at next-sweep per established 12-consecutive-cross-phase-sweep-resolutions convention). **DOC-ONLY-CLOSURE-NARRATIVE-CONSOLIDATION per Cowork GO** — single-path scope-bound discipline strictly maintained. 0 source/test edits / 5 doc-config edits. **🎯 NEW class CLOSURE-NARRATIVE-CONSOLIDATION introduced — project-wide 11th cumulative class** (Phase-6 1st distinct data point; structurally distinct from MEASUREMENT-ONLY [no re-measurement] / DOC-only-with-baseline-recapture [no new baseline artifact] / script-rename DOC-only shapes [no script moves] / NEAR-NULL-OP [which was for trivial production-source bumps, not substantive doc writing]; substantive narrative writing task ~272 lines / ~52 KB; **Prefiguring-precedent note:** Phase-1 + Phase-3 + Phase-4 + Phase-5 closers all carry the same closure-shape but pre-date class formalization — retroactive reclassification creates bookkeeping noise; not undertaken; Phase-7+ closer continues the convention → would form 2pt cross-phase at Phase-7 close, fully calibrating the class). **🎯 v1 L230 + L228 threshold decisions communicated to product/engineering leadership** at `Docs/Phase6_Closure_Report.md §6` (L230 MET on 4-enriched-detail-page scope — 8 independent zero-state confirmations preserved at HEAD TBD; broader 8-module-landing-page scope carries 3 button-name violations on Leasing/Owners/Accounting → Phase-7 Block A item #1 / L228 STRUCTURALLY UNATTAINABLE single-lever — empirically confirmed at Task 6.7 PRE0 5-lever analysis + post-edit Lever 1 evaluation + revert; pre-Phase-7 anchor LCP 4,204 ms / 4,653 ms; Phase-7 Block B multi-lever arc PRIMARY ≤3,000 ms via Lever 2 + Lever 3 stacked; v1 L228 ≤500 ms carry-forward to Phase-8+ with SSR consideration). **NEW `Docs/Phase6_Closure_Report.md` lands** at this commit (272 lines / 51,745 bytes; 8-section template byte-shape mirror of `Docs/Phase5_Closure_Report.md` 214 lines / 27,791 bytes with Phase-6-specific adaptations — Block A/B/C/D narrative + 2 GR-15 PERMANENT process changes [v2.42 + v2.43] + 8 within-phase chunk-axis preservation data points + 2 v1 threshold decisions + 11-task arc + 16-item Phase-7 carry-forward consolidation organized into 3 substantive blocks + 2 process improvements). **🎯 §9 main matrix Phase-6 column ADDED at this closure with ✓ values directly** — sweep-resolution-precedent missed-maintenance recovery (Phase-6 was OPENED 2026-05-05 at Task 6.1a but a Phase-6 column was never added to §9 main matrix during the 11-task arc; surfaced at 6.9 PRE0 Q4; per Cowork GO ADD with ✓ values directly at 6.9 closure mirrors Phase-1/3/4/5 closure-narrative blockquote pattern; same end-state as "ADD with R then immediately flip" without the bookkeeping noise of two amendments in the same PR for the same cell). **🎯 9th data point of test-tooling/DOC-only/script-rename/asset-loading-edit-then-reverted/config-only/closure-narrative-consolidation production-chunk-axis preservation pattern** (Step-2.5 verified all 4 production chunk axes preserved byte-for-byte vs Step-2.0 anchor at HEAD `34bd76c`: `StrataDashboard-BnaHIKND.js` / 1,031,711 / `0f9a472…ebe4` + `index-CTl84rdZ.js` / 597,519 / `768be277…10af0` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `index-DubCb24b.css` / 158,955 / `cabc7535…738f`); within-phase 8-of-8 data points + post-merge 9th verification; very strong inductive evidence post-LAW-retirement at 14-of-14 cross-phase data points cumulative (Phase-5 6 LAW + Phase-6 8 post-LAW). **🎯 6.8 TBD → `34bd76c` / `#54` resolution co-shipped at 6.9 sweep — 12 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → **6.9**); pattern fully cemented as cross-phase convention at Phase-6 closure; resolved across §9 row 6.8 squash-SHA cell + Phase status line at top of this plan + Task 6.8 closure-narrative TBD references (5 spots in `Docs/Phase6_Task_6_8_Completion_Report.md`) + CLAUDE.md HEAD pointer. **🎯 Paths-filter quirk extends to 11-task cross-phase scope** (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7 / 6.8 + **6.9**); 6.9 touches only `Docs/**` + root `CLAUDE.md`, NOT covered by `qualia-shell/src/**` filter; manual-dispatch expected at PR open. **🎯 Phase-6 Block D 4-of-4 CLOSED at 6.9 — Phase-6 100% complete (11 of 11 tasks closed); Phase-6 closes as SECOND PHASE in project history with ZERO new tests across entire phase (mirrors Phase-4 +0 precedent)**. Vitest 259/259 LOCAL clean at 6.9 / 259/259 CI authoritative. **🎯 2 process improvements for Phase-7 PRE-FLIGHT discipline documented at Closure Report §4 + §8**: (1) Add Phase-N column at OPENING task close — extends GR-14 phase-plan locality + GR-14 v2.32 phase-spec-vs-parent precedents; (2) Measurement-report-as-completion-report pattern documented as legitimate convention (6.6 + 6.7 closure narratives live in `Phase6_A11y_Report.md` + `Phase6_Perf_Report.md` rather than standalone Completion Reports). Both are GR-15 amendment candidates at next plan sweep co-shipped with this 6.9 sweep. 16 Phase-7-ready items consolidated at `Docs/Phase6_Closure_Report.md §8` (Block A a11y + CI architecture 8 items / Block B perf multi-lever 3 items / Block C test infra stabilization 3 items + 2 process improvements). See `Docs/Phase6_Closure_Report.md` for full 8-section closure narrative.

**Calibration class.** **NEW class CLOSURE-NARRATIVE-CONSOLIDATION — Phase-6 1st distinct data point of class; project-wide 11th cumulative class** (substantively distinct from MEASUREMENT-ONLY / DOC-only-with-baseline-recapture / script-rename / NEAR-NULL-OP per §3 calibration baseline in the Closure Report; substantive narrative writing task ~272 lines / ~52 KB consolidating multi-task arc + threshold decisions + Phase-N+1 carry-forward organization). **Plan-v-reality reconciliation:** the original row 6.9 stub said "DOC-ONLY closure (carry-over from prior Phase-N closer convention)" — that designation was a placeholder; empirical execution at PRE0 Q3 routed to Cowork verdict GO on NEW class designation per the 4-option matrix (CLOSURE-NARRATIVE-CONSOLIDATION vs NEAR-NULL-OP carry-over; recommendation for NEW class accepted). **COMPONENT-FIX class stays at 3pt within Phase-6** (no extension; 6.9 is CLOSURE-NARRATIVE-CONSOLIDATION not COMPONENT-FIX). **E2E-PLAYWRIGHT carry-over class stays at 7pt cross-phase** (no extension at 6.9 — that class is for test-tooling-config edits). **MEASUREMENT-ONLY-with-source-rename class stays at 5pt cross-phase** (no extension at 6.9 — that class is for measurement tasks).

---

## §5. Verification Matrix

| Check | Target | Evidence |
|---|---|---|
| `tsc -b` per task | exit 0 | paste output |
| `vitest run` per task | ≥259 baseline | paste output |
| Both `vite build` modes per task | exit 0 | paste output |
| Production chunk byte-count cross-phase invariance | preserved at 1,031,260 | per-task `wc -c` capture |
| Production chunk SHA256 invariance state | break documented per task | per-task `shasum -a 256` capture |
| Smoke-test 4-spec cold-start | ≥10/12 (6.1a) → 12/12 (6.1b+) | playwright list-reporter output |
| CDP probe re-verify on changed surface | per-task acceptance | session-local cdp_probe_task_6_X.cjs output |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | paste output |
| Manual-dispatch parity gate per PR | green | `gh run view` JSON |
| CodeRabbit review per PR | pass | review comment |
| a11y violation count (post-Block-C) | ≤ 0 (or documented residual) | `Docs/Phase6_A11y_Report.md` |
| LCP delta (post-6.7) | improved vs Phase-5 4653 ms baseline | `Docs/Phase6_Perf_Report.md` |
| Feature specs in CI | added to `playwright.baseline.config.ts::testMatch` | config diff |
| `Docs/Phase6_Closure_Report.md` | committed | file present |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-6-1 | Container-query browser-support edge case (Safari ≤15) | Low | Low | Browserslist target excludes Safari ≤15; container queries GA since 2023 |
| R-6-2 | Window auto-snap opt-out leaks to other multi-column apps | Low | Med | Opt-out is keyed on `COMPONENT_DEFAULT_SIZES` membership; only Strata declared |
| R-6-3 | a11y component-fix introduces visual regression | Med | Med | Screenshot-baseline.spec.ts (informational on Linux) re-runs darwin per-task; manual eyeball-check at PRE2 |
| R-6-4 | helpers/auth.ts amendment regresses a now-fixed test | Low | High | 6.2 smoke-test gate is strict 12/12; revert if any new-failure mode emerges |
| R-6-5 | Perf optimization breaks chunk-graph isolation property | Med | Low | Phase-6 chunk-graph law was retired at Phase-6 boundary; perf work is allowed to break it deliberately |
| R-6-6 | a11y re-measurement reveals NEW violations introduced by 6.1a/6.1b/6.2 | Low | Med | 6.6 measurement is the gate; if NEW violations appear, address in same task or split |
| R-6-7 | v1 L228/L230 threshold-decision blocks 6.9 closure | Low | Low | Communication is the deliverable; decision can defer past closure |

---

## §7. Rollback Plan

Per task: `git revert` of the squash-merge commit. Phase-6 has no schema / migration / fixture work — every task is reversible without DB or data state implications.

---

## §8. Exit Gate

Phase 6 is complete when:

1. All 11 tasks (6.1a / 6.1b / **6.1c** / 6.2 / 6.3 / 6.4 / 6.5 / 6.6 / 6.7 / 6.8 / 6.9) merged to `main`.
2. Smoke-test 4-spec set passes 12/12 cold-start.
3. Feature specs in `playwright.baseline.config.ts::testMatch`.
4. Post-remediation a11y violation count ≤ 0 OR documented residual rationale at `Docs/Phase6_A11y_Report.md`.
5. Post-optimization LCP measurement captured at `Docs/Phase6_Perf_Report.md` (improvement target soft; meaningful delta required).
6. v1 L228 + L230 threshold-decision communicated to product/engineering.
7. `Docs/Phase6_Closure_Report.md` committed.
8. Plan v2.X (final Phase-6 version) §9 main matrix Phase-6 column header `R → ✓`.

---

## §9. Deliverables

- 3 source files (Task 6.1a): `WindowContext.tsx` + `Desktop.tsx` + `StrataDashboard.css`.
- 2 spec files (Task 6.1b): `appfolio-parity-workorder.spec.ts` + `appfolio-parity-vendor-compliance.spec.ts`.
- 1 e2e helper file (Task 6.2): `helpers/auth.ts`.
- ~5-7 component files (Block C): a11y remediation across residents/tenants/forms.
- 1-2 perf-optimization files (Task 6.7): scope-dependent.
- 1 config file (Task 6.8): `playwright.baseline.config.ts`.
- NEW `Docs/Phase6_A11y_Report.md` (Task 6.6).
- NEW `Docs/Phase6_Perf_Report.md` (Task 6.7).
- NEW `Docs/Phase6_Task_6_X_Completion_Report.md` × 10.
- NEW `Docs/Phase6_Closure_Report.md` (Task 6.9).

---

## §10. Timeline

| Task | Budget | Prereq | Can parallelize |
|---|:-:|---|:-:|
| 6.1a Layout fix (OPENER) | 0.5 day | Phase-5 closed | No |
| 6.1b Spec remediation (partial — 2 of 3 axes; vendor-compliance 1/1) | 0.25 day | 6.1a | No |
| 6.1c workorder spec full audit (mandatory PRE0; whack-a-mole prohibited) | 0.5 day | 6.1b | No |
| 6.2 helpers/auth.ts amendment | 0.25 day | 6.1c | No |
| 6.3 Tenant-row a11y (largest impact) | 0.5 day | 6.2 | Block C parallel |
| 6.4 Targeted a11y fixes | 0.5 day | 6.2 | Block C parallel |
| 6.5 a11y closure cleanup | 0.25 day | 6.3 + 6.4 | No |
| 6.6 a11y re-measurement | 0.25 day | 6.5 | No |
| 6.7 Perf optimization | 0.5–1 day | 6.6 | No (perf may move a11y) |
| 6.8 Feature spec CI integration | 0.25 day | 6.2 | Yes with Block C/D |
| 6.9 Phase-6 closer | 0.5 day | all above | No |
| Buffer | 1 day | — | — |
| **Total** | **4–5 days** | | |

---

## §11. Notes for executor

- Phase-6 has no v1 plan source. Cite `Docs/Phase5_Closure_Report.md §5/§6` carry-forward + this Phase_6_Plan.md as authoritative scope source per GR-14 (v2.32 amendment) — when phase-spec contradicts parent, parent + v1-lineage wins; Phase-6 has no parent v1 row to contradict, so this phase-spec IS the authoritative source.
- 6.1a HALT-IF discovery (6 sections asserting against `defaultOpen={false}` + 1 ambiguous tab-button locator) is the empirical anchor for the 6.1b row's existence; cited at `Docs/Phase6_Task_6_1a_Completion_Report.md §7`.
- Phase-5 deferred-items ledger consolidated at `Docs/Phase5_Closure_Report.md §5` carries ~133 cross-phase items. Phase-6 tasks should reference rather than re-enumerate.
- Calibration class shorthand at task level: prefer the umbrella **COMPONENT-FIX** for any production-source edit shape (Block A 6.1a + Block C all). Resolve sub-classes (e.g., CSS-LAYOUT-FIX, A11Y-COMPONENT-FIX) only if Phase-7+ surfaces a third structurally-distinct production-chunk-edit shape that doesn't fit the umbrella.

🧪
