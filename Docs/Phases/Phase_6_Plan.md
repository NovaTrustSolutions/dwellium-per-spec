# Phase 6 — Production-Readiness Arc (post-Phase-5 carry-forward)

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-6 sub-tracker (created at v2.36; expanded at v2.37 to 11 rows: 6.1a / 6.1b / **6.1c** / 6.2 / 6.3 / 6.4 / 6.5 / 6.6 / 6.7 / 6.8 / 6.9).
**Phase status.** OPENED 2026-05-05 at squash SHA TBD (Task 6.1a — `.s-detail-panel` layout collapse fix; Phase-6 OPENER).
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

**Calibration class.** **CONSUMER-SIDE-FETCH-WRAPPER carry-over (extends 1 → 2 data points; 5.1c was the 1st).** No source edit; e2e helper module change. Chunk-graph isolated.

---

### Block C — a11y remediation arc (parallel within block; gated on Block A complete)

#### Task 6.3 — Tenant-row icon-button accessible-name (largest a11y impact)

**Goal.** Resolve ~334 of 362 violating nodes from `Docs/Phase5_A11y_Report.md` in a single targeted fix. The Brianna tenant page (~338 nodes / ~93% of total) carries a virtualized tenant-list with icon-only buttons missing `aria-label`. Single-pattern fix at the icon-button component or virtualized-row template should drop the count significantly.

**Files touched.** Estimated 1-2 component files in the residents/tenants module owning the icon-button row template.

**Verify.** Re-run `Scripts/run_axe_phase5.mjs` (or `npx playwright test e2e/axe-baseline.spec.ts`) on the Brianna tenant page; expect violation count ≤ ~28 (362 − 334).

**Calibration class.** **COMPONENT-FIX 2nd data point (extends 1 → 2 within Phase-6).**

---

#### Task 6.4 — color-contrast / select-name targeted fixes

**Goal.** Resolve the remaining ~28 nodes spread across color-contrast (8 nodes / 4 pages), select-name (4 nodes / 2 pages), aria-valid-attr-value (10 nodes / 1 page), scrollable-region-focusable (2 nodes / 2 pages).

**Files touched.** Estimated 3-5 component files (palette tokens or component-local color overrides + label associations).

**Verify.** Re-run a11y measurement; expect total violations ≤ 0 (or document residual rationale at §7).

**Calibration class.** **COMPONENT-FIX 3rd data point.**

---

#### Task 6.5 — a11y closure cleanup (any residuals + axe-baseline.spec.ts re-enable assessment)

**Goal.** Address any residual a11y violations not captured at 6.3/6.4. Decide whether to flip `axe-baseline.spec.ts` from informational to blocking gate (Phase-0 baseline; currently informational pending Linux snapshot capture). Cross-repo coordination if backend-rendered HTML carries violations.

**Calibration class.** **COMPONENT-FIX 4th data point — class fully calibrated as 4-data-point class.**

---

#### Task 6.6 — Re-run a11y measurement post-remediation

**Goal.** Re-execute `Scripts/run_axe_phase5.mjs` (or rename → `Scripts/run_axe_phase6.mjs` if convention prefers per-phase; defer the rename decision to PRE0 of this task) to capture the new violation count for closure narrative. NEW `Docs/Phase6_A11y_Report.md` mirrors `Docs/Phase5_A11y_Report.md` byte-shape with side-by-side delta table.

**Calibration class.** **MEASUREMENT-ONLY carry-over (extends 2 → 3 cross-phase data points).**

---

### Block D — Perf + CI integration + closure (sequential)

#### Task 6.7 — Perf optimization arc (joint with a11y per Phase-5 5.6 §7)

**Goal.** Targeted perf work to drop LCP from Phase-5 baseline (4653 ms / ~9.3× over v1 L228 ≤500 ms target). Candidate levers per Phase5_Perf_Report.md §6: code-splitting beyond `manualChunks`, lazy-loading routes, SSR shell, CDN edge caching, image preloading. Scope decision at PRE0 — pick the 1-2 highest-ROI levers given Phase-6 budget.

**Re-measurement.** Re-run `Scripts/run_lighthouse_phase5.mjs`; capture `Docs/Phase6_Perf_Report.md` with side-by-side delta.

**Calibration class.** **COMPONENT-FIX or NEW PERF-OPTIMIZATION class** depending on scope choice.

---

#### Task 6.8 — Feature spec CI integration

**Goal.** Add the 3 feature specs (`strata-nav.spec.ts` + `appfolio-parity-workorder.spec.ts` + `appfolio-parity-vendor-compliance.spec.ts`) to `playwright.baseline.config.ts::testMatch` (currently scoped to `screenshot-baseline.spec.ts` + `axe-baseline.spec.ts` only). Gates on 6.1b + 6.2 complete (specs must be 12/12 green cold-start).

**Files touched.** 1 config file: `qualia-shell/playwright.baseline.config.ts` — add 3 entries to `testMatch` array.

**Calibration class.** **E2E-PLAYWRIGHT carry-over (extends to 5 cross-phase data points; class structurally retired per E2E-PLAYWRIGHT retirement at 5.5 — this is a config-only addition that doesn't add a new spec).**

---

#### Task 6.9 — Phase-6 closer (single-closure-per-phase precedent)

**Goal.** v1 L228 + L230 threshold-decision gate communicated to product/engineering leadership; closure artifact `Docs/Phase6_Closure_Report.md` consolidates the 9-task arc; §9 main matrix Phase-6 column header `R → ✓`.

**Threshold gate.** Surface decision: (a) tune Phase-6 measurements vs. v1 L228/L230 prove parity is achievable; or (b) explicit v1 spec amendment if reality-vs-spec gap is structural. Decision is non-blocking on Phase-6 close — communication is the deliverable, not the resolution.

**Closure narrative.** Mirror `Docs/Phase5_Closure_Report.md` byte-shape (~28 KB / 8-section). Cumulative Phase-6 metrics: PR count / vitest delta / chunk byte-count cross-phase invariance state / new calibration classes / SCOPE-COLLISION catches.

**Calibration class.** **DOC-ONLY closure (carry-over from prior Phase-N closer convention).**

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
