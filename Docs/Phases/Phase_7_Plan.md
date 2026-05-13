# Phase 7 — Carry-Forward Closeout Arc (Phase-6 §8 consolidation + a11y CI architecture + perf multi-lever)

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-7 sub-tracker (created at v2.48; 14 rows: 7.1 OPENER + 7 a11y/CI rows + 3 perf rows + 3 test-infra rows). Authoritative scope source is `Docs/Phase6_Closure_Report.md §8` 16-item carry-forward consolidation (organized into 3 substantive blocks + 2 process improvements absorbed into PRE-FLIGHT discipline).
**Phase status.** R OPEN 2026-05-11; **Task 7.1 OPENER closed at squash SHA `ddf1404` (PR #56) 2026-05-11**; **Task 7.2 closed at squash SHA `9126cc2` (PR #57) 2026-05-11**; **Task 7.3 closed at squash SHA `a8f1a10` (PR #58) 2026-05-12** (resolved at 7.4 sweep per 16-consecutive-cross-phase-sweep-resolutions convention extending 15-pattern at 7.3 → 16-pattern at 7.4). **Task 7.4 closing 2026-05-12 at squash SHA `TBD` (PR #TBD; resolution at 7.5 sweep per established absorb-into-next-sweep convention).** **Block A** (a11y + CI architecture; 8 items 7.1-7.8): **7.1 ✓** (button-name landing-page COMPONENT-FIX at `ddf1404`/`#56`) + **7.2 ✓** (axe-baseline.spec.ts assertion-strengthening at `9126cc2`/`#57`; E2E-PLAYWRIGHT 8pt cross-phase) + **7.3 ✓** (axe-baseline workflow step-split + continue-on-error flip + 2 in-place scope expansions for Linux CI flake-tolerance at `a8f1a10`/`#58`; NEW CI-CONFIG-ONLY class — project-wide 12th cumulative) + **7.4 ✓ at this commit** (Linux Playwright baseline capture mechanism; CI-CONFIG-ONLY 4th calibration data point) / 7.5-7.8 R / **Block B** (perf multi-lever arc; 3 items 7.9-7.11): R / **Block C** (test infrastructure stabilization; 2 remaining items 7.13 + 7.14; item #1 7.12 ✓ CLOSED opportunistically at 7.3 v2.50.1+v2.50.2): R. **🎯 Phase-7 §9 main matrix column ADDED at OPENING per Process Improvement #1 from `Docs/Phase6_Closure_Report.md §8`** — corrects Phase-6's missed-maintenance pattern (Phase-6 column was deferred and recovered at 6.9 closure via sweep-resolution-precedent; Phase-7 establishes the right convention at OPENING).
**Budget.** 5–7 days end-to-end (each task ~0.25–1 day; 1 day buffer; mirrors Phase-6 cadence at 4-6 days for 11 tasks; Phase-7 carries 14 tasks so +1 day).
**Owner.** Frontend engineer + QA + CI engineer (for Linux Playwright baseline mechanism build at 7.4).
**Dependencies.** Phase 6 closed at `b99a8ac` (PR #55; Task 6.9). No backend work in Phase-7 (R-4 cross-repo partition unchanged from Phase-6).
**Parallelizable?** Block A and Block B can run in parallel at Phase-7 entry (no dependencies between a11y+CI and perf multi-lever work). Block C runs throughout. Within Block A: 7.1 → 7.2 → 7.3 sequential (axe-baseline assertion-strengthening at 7.2 unlocks workflow step-split at 7.3); 7.4 → 7.5 → 7.6 sequential (Linux baseline mechanism → capture → gate-flip). Within Block B: 7.9 + 7.10 parallel; 7.11 measurement-only after 7.9/7.10 land.

---

## §1. Scope

Carry-forward closeout arc bridging the gap between "Phase-6 production-readiness work landed on the 4 enriched detail pages" and "AppFolio-parity is shippable across the full 8-routable-surface scope with hardened CI architecture + meaningful perf trajectory". Three empirical findings drive Phase-7 entry:

1. **`Docs/Phase6_Closure_Report.md §8` carry-forward consolidation** — 16 items organized into 3 substantive blocks (Block A a11y + CI architecture 8 items / Block B perf multi-lever 3 items / Block C test infra stabilization 3 items) + 2 process improvements absorbed into Phase-7 PRE-FLIGHT discipline.
2. **Phase-6 Task 6.8 PRE0 Q3 empirical finding** — 3 button-name violations on Leasing/Owners/Accounting module landing pages (broader 8-routable-surface scope; sister-shape to Phase-6 6.3+6.4 COMPONENT-FIX arc on the 4 enriched detail pages); 7.1 (THIS task) closes this finding.
3. **Phase-6 Task 6.7 empirical finding** — v1 L228 ≤500 ms LCP threshold STRUCTURALLY UNATTAINABLE single-lever (Lever 1 Google Fonts deferral underperformed PRE0 estimate; dominant render-blockers are app-own resources `index-DubCb24b.css` + `index-CTl84rdZ.js`, NOT Google Fonts); pre-Phase-7 anchor LCP 4,204 ms (n=5 mean) / 4,653 ms (closure-snapshot); Block B inherits multi-lever stacked approach.

Phase-7 closes all three gaps: (1) extend a11y zero-state to the full 8-routable-surface scope; (2) harden the axe-baseline + Linux Playwright baseline CI architecture (Block A items #2-#7) so a11y is genuinely blocking in CI; (3) ship multi-lever perf optimization (Block B Lever 2 manualChunks + Lever 3 lazy-load App.tsx eager imports stacked) targeting PRIMARY ≤3,000 ms / ASPIRATIONAL ≤2,000 ms LCP; (4) stabilize test infrastructure (Block C items 12-14); (5) absorb Phase-6 Process Improvements #1 + #2 into Phase-7 PRE-FLIGHT discipline as GR-15 amendment candidates at next plan sweep.

**v1-lineage substitute.** Phase-7 has no v1 plan source — this is post-v1 carry-forward arc. Authoritative scope source is `Docs/Phase6_Closure_Report.md §8` 16-item carry-forward enumeration + Plan v2 §9 Phase-7 sub-tracker (14 rows) + GR-14 v2.32 phase-spec-vs-parent precedent (when phase-spec contradicts parent, parent + v1-lineage wins; Phase-7 has no v1 parent row to contradict so this phase-spec IS the authoritative source).

Scope boundaries:

- **IN** — frontend a11y component-fix on 3 module landing pages (7.1); axe-baseline spec assertion-strengthening (7.2); CI workflow step-split for axe-vs-screenshot decoupling (7.3); Linux Playwright baseline mechanism build (7.4); Linux baseline capture for 8 surfaces (7.5); screenshot-baseline gate-flip (7.6); stray overview-chromium-linux.png provenance investigation (7.7); Linux CI render-timing failure investigation (7.8); Lever 2 manualChunks via `vite.config.ts` (7.9); Lever 3 lazy-load App.tsx eager imports (7.10); Lighthouse measurement variance characterization (7.11); playwright config retries delta investigation (7.12); calendar.test.tsx:260 darwin flake stabilization (7.13); Phase-5 Perf Report §2 stale LCP footnote (7.14).
- **OUT** — backend changes (cross-repo per R-4 v2.26 unchanged); destructive component refactors; new module/route additions; v1 L228 ≤500 ms LCP target (carry-forward to Phase-8+ with SSR consideration; v1 L230 zero-WCAG-AA target IS in Phase-7 scope via 7.1 — 8-surface threshold extension).

---

## §2. Definition of Ready

1. Phase 6 closed (✓ at `b99a8ac` 2026-05-11; PR #55).
2. `Docs/Phase6_Closure_Report.md` committed (272 lines / 51,745 bytes; 8-section template + 16-item carry-forward §8).
3. Phase-6 deferred-items ledger consolidated (✓ at `Docs/Phase6_Closure_Report.md §8` 16-item carry-forward into 3 blocks + 2 process improvements).
4. Per-task PRE0 DC-A 5-query discovery (per Plan v2.29 PERMANENT process change + v2.42 mathematical-exactness-signal refinement at 6.4 + v2.43 build-mode-aware chunk-axis comparison protocol at 6.5).
5. Per-task Step Zero source-provenance verification (per Phase-4 closure §4).
6. **🎯 NEW at Phase-7 OPENING — Process Improvement #1 absorbed:** Phase-N column ADDED to §9 main matrix at OPENING task close (Phase-7 establishes the right convention; corrects Phase-6 missed-maintenance pattern surfaced at 6.9 PRE0 Q4).
7. **🎯 NEW at Phase-7 OPENING — Process Improvement #2 absorbed:** Measurement-report-as-completion-report pattern recognized as legitimate convention (6.6 closure narrative lived in `Phase6_A11y_Report.md`; 6.7 closure narrative lived in `Phase6_Perf_Report.md`; Phase-7 measurement-style tasks may use this pattern at executor discretion — particularly 7.11 Lighthouse variance characterization).

---

## §3. Definition of Done

Per task:

1. PRE-merge gates green: `tsc -b` + `vitest run` (≥259 baseline) + both `vite build` modes + `verify_no_pii_leak.mjs` strict-clean.
2. Production chunk SHA256 + filename + byte-count captured pre-edit + post-edit; invariance state documented per dual-axis convention (Plan v2.28 reframe — byte-count is canonical; Plan v2.43 build-mode-aware comparison protocol).
3. CDP probe or axe re-scan re-verification on the actual changed surface (a11y violation count / panel rect width / Lighthouse metrics / etc.).
4. Smoke-test pass-count meets per-task acceptance criterion (4-spec cold-start 12/12 chromium continues as baseline gate; helpers/auth.ts 6.2 amendment continues to seed correctly).
5. Parity-gate green on PR-branch — for tasks touching `qualia-shell/src/**` paths the parity gate auto-fires on `pull_request` (no manual-dispatch quirk); for tasks touching only paths outside the paths-filter (`Docs/**` / `Scripts/**` / `qualia-shell/e2e/**` / `qualia-shell/playwright.baseline.config.ts` / root `CLAUDE.md` / root `.gitignore`) manual-dispatch is required (precedent: 4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7 / 6.8 / 6.9 — 11-task cross-phase pattern at Phase-6 close).
6. CodeRabbit review pass.
7. `Docs/Phase7_Task_7_X_Completion_Report.md` committed with 8-section template — OR measurement-report-as-completion-report pattern per Process Improvement #2 absorbed (executor discretion for 7.11 in particular).
8. §9 Phase-7 sub-tracker row flips `R → ✓` at task close; §9 main matrix Phase-7 column header flips `R → ✓` at Phase-7 closure (Task 7.X-final).

---

## §4. Tasks

### Block A — a11y + CI architecture (8 items 7.1-7.8)

Block A items 7.1-7.3 form a coherent 3-subtask sub-arc that flips the axe-baseline workflow gate from `continue-on-error: true` to blocking (7.1 ships the a11y fix → 7.2 assertion-strengthens the spec → 7.3 workflow step-splits axe-vs-screenshot decoupling). Block A items 7.4-7.7 form a coherent 4-subtask sub-arc that builds the Linux Playwright baseline mechanism and flips the screenshot-baseline workflow gate from `continue-on-error: true` to blocking (7.4 mechanism → 7.5 capture → 7.6 gate-flip → 7.7 stray provenance). 7.8 stands alone (CI render-timing failure investigation on compliance-row-workersCompExpiration; structurally parallel to #4-6 but distinct failure mode).

#### Task 7.1 — button-name landing-page COMPONENT-FIX on Leasing/Owners/Accounting (Phase-7 OPENER)

**Goal.** Eliminate 3 button-name WCAG 2.0 AA critical violations on the 3 module landing pages (Leasing / Owners / Accounting) surfaced at Phase-6 Task 6.8 PRE0 Q3 axe scan against the 8 routable surfaces. Sister-shape to Phase-6 6.3 (Brianna tenant page button-name 334 → 0) + 6.4 (4 enriched detail page COMPONENT-FIX-MULTI-RULE: color-contrast / select-name / aria-valid-attr-value / scrollable-region-focusable).

**Root cause** (per PRE0 Q2 source-grep inspection): all 3 violations are the structurally identical RefreshCw `s-btn-ghost` icon-only button pattern with zero text content and zero aria-label. Identical shape to Phase-6 6.4's 3-instance RefreshCw closure (Vendors+Maintenance+Properties at L668 / L513 / L522 respectively). Per Phase-6 6.4 Conventions inheritance: `aria-label="Refresh {entity-plural}"`.

**Path A.1 (single-pattern fix; 3-line source diff).** Per Cowork GO Q1 + Q2:

- **A.1.1 LeasingModule.tsx:373** — `<button className="s-btn s-btn-ghost" onClick={fetchLeases} aria-label="Refresh leases"><RefreshCw size={14} /></button>` (was `<button className="s-btn s-btn-ghost" onClick={fetchLeases}><RefreshCw size={14} /></button>`).
- **A.1.2 OwnersModule.tsx:107** — `<button className="s-btn s-btn-ghost" onClick={fetchOwners} aria-label="Refresh owners"><RefreshCw size={14} /></button>` (was identical pattern without aria-label).
- **A.1.3 AccountingModule.tsx:185** — `<button className="s-btn s-btn-ghost" onClick={fetchData} aria-label="Refresh accounting data"><RefreshCw size={14} /></button>` (was identical pattern without aria-label; "Refresh accounting data" chosen per Cowork GO Q1 — `fetchData` is the abstract data entity; "accounting data" is the correct entity-noun per Conventions inheritance vs (b) "Refresh accounting" reads as refreshing the function or (c) "Refresh entries" too narrow if module renders multiple data types).

**Files touched.** 3 source files (no fixture / unit-test / spec / schema changes):

- `qualia-shell/src/components/StrataDashboard/modules/LeasingModule.tsx` — single aria-label addition at L373.
- `qualia-shell/src/components/StrataDashboard/modules/OwnersModule.tsx` — single aria-label addition at L107.
- `qualia-shell/src/components/StrataDashboard/modules/AccountingModule.tsx` — single aria-label addition at L185.

**Math-exactness signal verdict (per v2.42 GR-15 PRE0 discipline).** 3 violations / 3 surfaces / 1 node each = even distribution ✓; 3 distinct files BUT 1 structurally identical pattern ✓. Per v2.42 refinement: math is necessary-but-not-sufficient when distribution is uneven (6.4 RefreshCw had 4 nodes split 1+1+2 across pages requiring CDP probe sub-pattern disambiguation). Here distribution is EVEN AND pattern is IDENTICAL across all 3 surfaces → single-pattern hypothesis confirmed at PRE0 WITHOUT CDP probe. Sister-shape to 6.3 mathematical-exactness signal (334 violations / 334 rendered rows / 1 per-row-pattern-count = exact match → single-pattern hypothesis confirmed without probe).

**Acceptance gate.** Axe re-scan on post-edit dist via `e2e/axe-baseline.spec.ts`: 3 button-name violations → 0 across Leasing/Owners/Accounting; 5 other surfaces (Overview / Properties / Residents / Vendors / Maintenance) remain at 0 (no regressions; Phase-6 6.3+6.4 zero-state preserved on Residents/Vendors/Maintenance/Properties detail pages). Total 8 surfaces × 0 violations = **8-routable-surface scope MET at 7.1 close**.

**Calibration class.** **COMPONENT-FIX carry-over (Phase-7 1st distinct data point; extends Phase-6 3pt → 4pt cross-phase).** Sub-class: **A11Y-COMPONENT-FIX** (mirrors 6.3 shape). Production-source edit affecting bundle output — chunk-axis BREAK by construction (4th cross-phase production-source-edit data point: 6.1a + 6.3 + 6.4 + 7.1; resets the 9-data-point chunk-axis preservation pattern's relevance to non-production-source edits only).

**Calibration carry-over for 6-instance RefreshCw pattern.** With 7.1 close the `<button className="s-btn s-btn-ghost"><RefreshCw size={14} /></button>` icon-only refresh-button pattern reaches 6 module instances across StrataDashboard module landing pages: Vendors+Maintenance+Properties (Phase-6 6.4) + Leasing+Owners+Accounting (Phase-7 7.1). All 6 carry contextual `aria-label="Refresh {entity-plural}"`. Future StrataDashboard module additions following the s-btn-ghost RefreshCw pattern should inherit this aria-label convention from CLAUDE.md Conventions block (extended at 7.1 close).

---

#### Task 7.2 — axe-baseline.spec.ts assertion-strengthening

**Goal.** Convert `qualia-shell/e2e/axe-baseline.spec.ts` from informational-by-spec-design (soft-assert at L127 `console.log` only; no `expect()` on violation count) to genuine blocking assertion (`expect(axeResults.violations.length).toBe(0)`) so the spec actually fails CI when violations are introduced.

**Why split (not in 7.1).** Block C scope at Phase-6 was strictly the 4 enriched detail pages; 7.1 extends a11y zero-state to the 8-routable-surface scope. Spec assertion-strengthening is a CI-architecture change, structurally distinct from the a11y component-fix at 7.1. Pre-7.1, flipping the assertion would fail CI on the 3 known button-name violations. Post-7.1 (and per 7.1's axe re-scan verification at 8-surface zero-state), the assertion-strengthening is safe.

**Files touched.** 1 spec file: `qualia-shell/e2e/axe-baseline.spec.ts` — replace L127-130 soft-assert (`console.log` only) with hard assertion. Mirror the assertion-strengthening pattern from existing strict-mode specs (`appfolio-parity-workorder.spec.ts` / `appfolio-parity-vendor-compliance.spec.ts`).

**Acceptance gate.** Pre-7.2: post-7.1 axe re-scan shows 0 violations across 8 surfaces. Post-7.2: spec assertion-strengthening lands; CI parity gate runs the spec under `continue-on-error: true` (still — gate-flip is 7.3); spec produces hard assertion failure if violations regress.

**Calibration class.** **E2E-PLAYWRIGHT carry-over (Phase-7 1st distinct data point; extends Phase-6 4pt cross-phase → 5pt at 7.2).** Spec-only edit; chunk-graph isolated.

---

#### Task 7.3 — axe-baseline workflow step-split (axe-vs-screenshot decoupling)

**Goal.** Split `.github/workflows/appfolio-parity-gate.yml:77` axe-baseline + screenshot-baseline conjoined step into two separate workflow steps so the axe-baseline can be flipped `continue-on-error: true → false` without coupling to screenshot-baseline (which has its own Linux-baseline-capture deferred-item via Block A items 7.4-7.6).

**Files touched.** 1 workflow file: `.github/workflows/appfolio-parity-gate.yml` — step-split + `continue-on-error: false` flip on the axe-baseline step (after 7.2 assertion-strengthening lands).

**Acceptance gate.** Workflow step-split lands; axe-baseline runs under blocking `continue-on-error: false`; screenshot-baseline remains under `continue-on-error: true` pending Block A items 7.4-7.6.

**Calibration class.** **CI-CONFIG-FIX (Phase-7 1st distinct data point; project-wide candidate for NEW class designation if confirmed at second cross-phase data point).**

---

#### Task 7.4 — Linux Playwright baseline capture mechanism build

**Goal.** Build the mechanism for capturing Linux-host Playwright screenshot baselines (currently Phase-0 Task 0.0.9 captured darwin-only baselines; Linux baselines are the structural unlock for Block A items 7.5-7.6).

**Files touched.** Likely 1 new file: `.github/workflows/capture-linux-baselines.yml` (or equivalent ad-hoc workflow_dispatch workflow) + 1 doc file `Docs/Baselines/linux_baseline_capture_protocol.md` documenting the protocol.

**Acceptance gate.** Workflow_dispatch invocation produces 8 `*-chromium-linux.png` artifacts (or commits them to repo) covering the 8 routable surfaces.

**Calibration class.** **CI-CONFIG-FIX carry-over (extends 7.3 1pt → 2pt within Phase-7; second cross-phase data point confirms NEW class designation pending; project-wide 12th cumulative class).**

---

#### Task 7.5 — Linux baseline capture for 8 surfaces

**Goal.** Execute the Linux Playwright baseline capture mechanism from 7.4 against the 8 routable surfaces; commit the resulting `*-chromium-linux.png` baselines into the repo at `qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/`.

**Files touched.** 8 PNG baseline files committed (per-surface darwin + Linux pair: 8 × 2 = 16 baseline files at end-state; 8 darwin pre-existing; 8 Linux NEW at 7.5).

**Acceptance gate.** 8 Linux baselines committed; screenshot-baseline.spec.ts runs green on both darwin AND Linux locally + CI.

**Calibration class.** **TEST-INFRASTRUCTURE-CAPTURE (Phase-7 1st distinct data point of this shape).** Asset-only edits outside Vite entry graph; production chunk axes preserved.

---

#### Task 7.6 — Screenshot-baseline workflow gate-flip

**Goal.** Flip `.github/workflows/appfolio-parity-gate.yml` screenshot-baseline step from `continue-on-error: true` to blocking (`continue-on-error: false`) after Linux baselines land at 7.5.

**Files touched.** 1 workflow file (continued from 7.3 step-split).

**Acceptance gate.** Screenshot-baseline runs blocking; CI fails if pixel-diff exceeds tolerance on darwin OR Linux.

**Calibration class.** **CI-CONFIG-FIX carry-over (extends 7.3 1pt → 2pt → 3pt; project-wide 12th class fully calibrated at 3pt within-Phase-7).**

---

#### Task 7.7 — Stray `overview-chromium-linux.png` provenance investigation

**Goal.** Investigate the existing `qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/overview-chromium-linux.png` artifact (only Linux baseline currently in repo; provenance unclear; surfaced at Phase-6 6.8 §7); either preserve as part of 7.5's 8-Linux-baselines deliverable or document as residual artifact.

**Files touched.** 0-1 files (1 if the stray artifact is removed; 0 if it integrates with 7.5).

**Calibration class.** **DOC-INVESTIGATION-ONLY** (mirrors Phase-6 6.7 DOC-only-empirical-finding shape).

---

#### Task 7.8 — Linux CI render-timing failure investigation on `compliance-row-workersCompExpiration`

**Goal.** Investigate the Linux CI render-timing failure on `compliance-row-workersCompExpiration` testid (post-6.8 PR-open finding; structurally parallel to Block A items 7.4-7.6 but distinct failure mode — render-timing race not pixel-diff). Likely root cause: workerscompexpiration data field hydration timing differs darwin-vs-Linux on Vendor-detail page.

**Files touched.** Likely 1 spec file: `qualia-shell/e2e/appfolio-parity-vendor-compliance.spec.ts` — add explicit wait-for-text/locator timeout extension on the compliance-row-workersCompExpiration assertion.

**Calibration class.** **E2E-PLAYWRIGHT carry-over (extends 7.2 1pt → 2pt within Phase-7; 6pt cross-phase).**

---

### Block B — Perf multi-lever arc (3 items 7.9-7.11)

Block B inherits empirically-justified lever priority from Phase-6 Task 6.7 post-Lever-1-revert: Lever 2 (manualChunks vendor split) + Lever 3 (lazy-load App.tsx eager imports) stacked → PRIMARY ≤3,000 ms (~30% reduction) / ASPIRATIONAL ≤2,000 ms (~50%). Pre-Phase-7 anchor: LCP 4,204 ms (n=5 mean) / 4,653 ms (closure-snapshot). v1 L228 ≤500 ms remains structurally unattainable single-lever; carry-forward to Phase-8+ with SSR consideration.

#### Task 7.9 — Lever 2 `manualChunks` vendor split via `vite.config.ts`

**Goal.** Configure `vite.config.ts::build.rollupOptions.output.manualChunks` to split vendor dependencies into separate chunks (currently `vite.config.ts` has NO `manualChunks` configured per Phase-6 6.7 PRE0 Q4 empirical confirmation — all vendor code is baked into the monolithic `index-CTl84rdZ.js` 597 KB chunk).

**Files touched.** 1 config file: `qualia-shell/vite.config.ts` — add `manualChunks` factory function with vendor groupings (react / react-dom / lucide-react / @react-pdf / @axe-core / etc.).

**Acceptance gate.** Post-edit Lighthouse measurement (n=10+ per 7.11 GR-15 candidate) shows LCP delta vs pre-Phase-7 anchor; PRIMARY ≤3,000 ms target evaluated.

**Calibration class.** **COMPONENT-FIX carry-over (extends 7.1 1pt → 2pt within Phase-7; 5pt cross-phase).** Sub-class: **CONFIG-PERF-OPTIMIZATION** (sister to A11Y-COMPONENT-FIX; same umbrella class).

---

#### Task 7.10 — Lever 3 lazy-load App.tsx eager imports

**Goal.** Convert App.tsx eager imports (TenantPortal / SecurityPortal / OpenJarvisWidget / etc. — exact inventory at Phase-7 PRE0 of 7.10) to `React.lazy()` dynamic imports so they're not bundled into the initial-paint `index-CTl84rdZ.js` chunk.

**Files touched.** 1 source file: `qualia-shell/src/App.tsx` + possibly `Suspense` boundary additions.

**Acceptance gate.** Post-edit Lighthouse measurement (n=10+ per 7.11) shows additional LCP delta vs post-7.9 state; stacked Lever 2 + Lever 3 → PRIMARY ≤3,000 ms target.

**Calibration class.** **COMPONENT-FIX carry-over (extends 7.9 2pt → 3pt within Phase-7; 6pt cross-phase).**

---

#### Task 7.11 — Lighthouse measurement variance characterization (n≥10)

**Goal.** Characterize Lighthouse measurement variance via n≥10 captures (Phase-6 6.7 surfaced ~5× Phase-0 variance at n=5 = 2,399 ms range across 5 captures; recommended for GR-15 inclusion at v2.46 amendment as carry-over). Captures inform Block B Lever 2/3 perf gate decisions.

**Files touched.** NEW `Docs/Phase7_Perf_Report.md` (mirrors `Docs/Phase6_Perf_Report.md` byte-shape) + NEW `Docs/Baselines/2026-MM-DD_Phase7_task_7_11_perf_capture.json`. Possibly: `Scripts/run_lighthouse_phase7.mjs` via `git mv` from `Scripts/run_lighthouse_phase6.mjs` (mirrors Phase-6 6.6/6.7 script-rename precedent).

**Acceptance gate.** Variance characterization committed; PRIMARY ≤3,000 ms gate evaluated against n≥10 data; GR-15 amendment candidate for variance protocol documented.

**Calibration class.** **MEASUREMENT-ONLY-with-source-rename carry-over (extends Phase-6 3pt → 4pt within Phase-7; 6pt cross-phase).** Measurement-report-as-completion-report convention per Process Improvement #2 absorbed.

---

### Block C — Test infrastructure stabilization (3 items 7.12-7.14)

Block C is the longest-running block by calendar but lowest-priority by impact; can run parallel to Block A + Block B throughout Phase-7.

#### Task 7.12 — `playwright.baseline.config.ts::retries` vs `playwright.config.ts::retries` flake-surface delta — **✓ CLOSED at 7.3 PR-pre-merge-stabilization (2026-05-12)**

**Status.** ✓ CLOSED opportunistically at Phase-7 Task 7.3 PR-pre-merge-stabilization per Cowork Option C verdict (in response to PR #58 parity gate Linux render-timing flake at `axe-baseline.spec.ts:93` Residents 30s timeout). Resolution: `qualia-shell/playwright.baseline.config.ts::retries: 0` → `retries: process.env.CI ? 2 : 0` (1-line bump; mirrors `playwright.config.ts` CI default; preserves local darwin `retries: 0` for fast-feedback-loop). Class taxonomy stays CI-CONFIG-ONLY (retries field is CI-flake-tolerance-policy domain consumed by Playwright runner; both `.github/workflows/**` and `playwright.baseline.config.ts::retries` are CI-architecture-domain at higher abstraction). **v2.50.2 scope expansion round 2 at PR-pre-merge (timeout-bump)**: retries-bump alone insufficient against deterministic Linux runner slowness (run 25746991992 empirical failure); ADDED `timeout: 60_000` (vs Playwright default 30_000) per Cowork Option B.2 verdict; both retries+timeout fields stay CI-flake-tolerance-policy sub-domain under CI-CONFIG-ONLY class.

**Goal (historical).** Investigate why `playwright.baseline.config.ts` has `retries: 0` while `playwright.config.ts` has `retries: process.env.CI ? 2 : 0`; either align the two configs OR document the intentional delta as a flake-surface visibility mechanism.

**Files touched.** 1 config file (`qualia-shell/playwright.baseline.config.ts`) at 7.3 scope-expansion commit on top of 97cb73e.

**Calibration class.** **CI-CONFIG-ONLY** (extended class designation per 7.3 Cowork Option C verdict; mirrors 7.3 main commit class).

---

#### Task 7.13 — `calendar.test.tsx:260` darwin intermittent flake stabilization

**Goal.** Stabilize the `calendar.test.tsx:260` darwin-host intermittent flake (5-of-11 task closes across Phase-6 surfaced this flake; suspected `vi.useFakeTimers()` + real-clock interaction; CI is authoritative; capture is darwin-specific).

**Files touched.** 1 test file: `qualia-shell/src/components/Calendar/calendar.test.tsx` — explicit timer cleanup or assertion-timing fix at L260.

**Acceptance gate.** 10 consecutive `vitest run` invocations on darwin produce 259/259 PASS without `calendar.test.tsx:260` flake.

**Calibration class.** **TEST-INFRASTRUCTURE-FIX** (project-wide 13th cumulative class candidate pending second cross-phase data point).

---

#### Task 7.14 — Phase-5 Perf Report §2 stale LCP root-cause footnote

**Goal.** Add footnote to `Docs/Phase5_Perf_Report.md §2` noting that the cited primary chunk (StrataDashboard) is empirically NOT the initial-paint dominant render-blocker per Phase-6 6.7 finding (`index-CTl84rdZ.js` + `index-DubCb24b.css` are the empirical primary chunks at initial paint).

**Files touched.** 1 doc file: `Docs/Phase5_Perf_Report.md` — add §2 footnote.

**Calibration class.** **DOC-CORRECTION-ONLY** (sister to 7.7 + 7.12).

---

## §5. Verification Matrix

| Check | Target | Evidence |
|---|---|---|
| `tsc -b` per task | exit 0 | paste output |
| `vitest run` per task | ≥259 baseline | paste output |
| Both `vite build` modes per task | exit 0 | paste output |
| Production chunk byte-count tracked per task | break documented for production-source edits; preserved for non-production-source edits | per-task `wc -c` capture |
| Production chunk SHA256 tracked per task | break documented per task | per-task `shasum -a 256` capture |
| Smoke-test 4-spec cold-start | 12/12 chromium baseline (helpers/auth.ts 6.2 amendment) | playwright list-reporter output |
| Axe re-scan on changed surface (Block A) | per-task acceptance | `Docs/Baselines/Phase7_*_a11y_capture.json` |
| Lighthouse re-measurement (Block B) | per-task acceptance; PRIMARY ≤3,000 ms / ASPIRATIONAL ≤2,000 ms LCP | `Docs/Phase7_Perf_Report.md` |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | paste output |
| Parity gate per PR | green | `gh run view` JSON (paths-filter quirk only for non-`qualia-shell/src/**` paths) |
| CodeRabbit review per PR | pass | review comment |
| Linux Playwright baselines captured (post-7.5) | 8 `*-chromium-linux.png` committed | repo file presence |
| Axe-baseline workflow gate (post-7.3) | blocking `continue-on-error: false` | workflow YAML diff |
| Screenshot-baseline workflow gate (post-7.6) | blocking `continue-on-error: false` | workflow YAML diff |
| 8-surface a11y zero-state (post-7.1) | 0 violations across Overview / Properties / Leasing / Residents / Vendors / Owners / Accounting / Maintenance | `Docs/Baselines/2026-05-11_Phase7_task_7_1_a11y_capture.json` |
| `Docs/Phase7_Closure_Report.md` | committed at final-task close | file present |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-7-1 | Lever 2 manualChunks split introduces hydration-order bug | Med | Med | n≥10 Lighthouse + 4-spec smoke per 7.9 close; revert if any new-failure mode emerges |
| R-7-2 | Lever 3 React.lazy() breaks SecurityPortal / TenantPortal initial render | Med | Med | Suspense boundary required; smoke-test on the lazy-loaded routes per 7.10 |
| R-7-3 | Linux Playwright baseline mechanism build cost overruns | Med | Low | 7.4 is scoped to mechanism only; 7.5 capture is structurally separate |
| R-7-4 | Axe-baseline assertion-strengthening exposes hidden regressions | Low | Med | 7.2 lands AFTER 7.1 axe re-scan confirms 8-surface zero-state |
| R-7-5 | Workflow step-split breaks unrelated CI flows | Low | Low | 7.3 is YAML-only; revert via single-commit if breakage |
| R-7-6 | calendar.test.tsx:260 flake stabilization breaks other timer-based tests | Med | Low | 7.13 vitest run before/after on affected suites |
| R-7-7 | Lighthouse variance characterization (n=10) exceeds time budget for re-run cycles | Low | Low | 7.11 is async / measurement-report convention permits sectioned commits |

---

## §7. Rollback Plan

Per task: `git revert` of the squash-merge commit. Phase-7 has no schema / migration / fixture work — every task is reversible without DB or data state implications. Block B perf optimizations carry slightly higher revert-complexity (chunk-graph rotations) but no data state implications.

---

## §8. Exit Gate

Phase 7 is complete when:

1. All 14 tasks (7.1 / 7.2 / 7.3 / 7.4 / 7.5 / 7.6 / 7.7 / 7.8 / 7.9 / 7.10 / 7.11 / 7.12 / 7.13 / 7.14) merged to `main`.
2. 8-routable-surface a11y zero-state preserved across Phase-7 close (no regression introduced by Block B perf work).
3. Axe-baseline workflow gate blocking (`continue-on-error: false`).
4. Screenshot-baseline workflow gate blocking (`continue-on-error: false`).
5. 8 Linux Playwright baselines committed.
6. Lighthouse LCP improvement vs pre-Phase-7 anchor 4,204 / 4,653 ms — PRIMARY ≤3,000 ms target evaluated; ASPIRATIONAL ≤2,000 ms target evaluated.
7. Lighthouse measurement variance characterized (n≥10).
8. Process Improvement #1 + #2 absorbed into PRE-FLIGHT discipline; GR-15 amendment candidates documented.
9. `Docs/Phase7_Closure_Report.md` committed (mirrors Phase-1 + Phase-3 + Phase-4 + Phase-5 + Phase-6 single-closure-per-phase precedent; closure-narrative-consolidation class data point #2 → 2pt cross-phase fully calibrating that class).
10. Plan v2.X (final Phase-7 version) §9 main matrix Phase-7 column header `R → ✓`.

---

## §9. Deliverables

- 3 source files (Task 7.1): `LeasingModule.tsx` + `OwnersModule.tsx` + `AccountingModule.tsx`.
- 1 spec file (Task 7.2): `axe-baseline.spec.ts`.
- 1-2 workflow files (Tasks 7.3 / 7.6): `appfolio-parity-gate.yml` + possibly `capture-linux-baselines.yml`.
- 8 Linux PNG baselines (Task 7.5): `qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/*-chromium-linux.png`.
- 1 spec file (Task 7.8): `appfolio-parity-vendor-compliance.spec.ts`.
- 1 config file (Task 7.9): `vite.config.ts`.
- 1 source file (Task 7.10): `App.tsx`.
- NEW `Docs/Phase7_Perf_Report.md` (Task 7.11; possibly serves dual-purpose as 7.11 closure narrative per Process Improvement #2 measurement-report-as-completion-report convention).
- Possibly: `Scripts/run_lighthouse_phase7.mjs` via `git mv` from `Scripts/run_lighthouse_phase6.mjs` (Task 7.11; mirrors Phase-6 6.6/6.7 script-rename precedent).
- 1 test file (Task 7.13): `calendar.test.tsx`.
- 1 doc file (Task 7.14): `Docs/Phase5_Perf_Report.md` footnote.
- 0-1 doc files (Task 7.7 / 7.12): provenance investigations.
- NEW `Docs/Phase7_Task_7_X_Completion_Report.md` × ~13 (one per task except possibly 7.11 absorbed into perf report).
- NEW `Docs/Phase7_Closure_Report.md` (final-task close; closure-narrative-consolidation class data point #2).

---

## §10. Timeline

| Task | Budget | Prereq | Can parallelize |
|---|:-:|---|:-:|
| 7.1 button-name landing-page COMPONENT-FIX (OPENER) | 0.5 day | Phase-6 closed | No (OPENING ceremony) |
| 7.2 axe-baseline assertion-strengthening | 0.25 day | 7.1 | No (gated on 8-surface zero-state) |
| 7.3 axe-baseline workflow step-split | 0.25 day | 7.2 | No |
| 7.4 Linux baseline mechanism build | 1 day | Phase-6 closed | Yes (parallel to Block A axe arc + Block B) |
| 7.5 Linux baseline capture for 8 surfaces | 0.5 day | 7.4 | No (gated on 7.4 mechanism) |
| 7.6 screenshot-baseline gate-flip | 0.25 day | 7.5 | No |
| 7.7 stray overview-chromium-linux.png provenance | 0.25 day | — | Yes (anytime) |
| 7.8 Linux CI render-timing failure investigation | 0.5 day | Phase-6 closed | Yes (parallel to all Block A + B + C) |
| 7.9 Lever 2 manualChunks vendor split | 0.5 day | Phase-6 closed | Yes (parallel to Block A + C) |
| 7.10 Lever 3 lazy-load App.tsx eager imports | 0.5 day | 7.9 | No (Lever 2 + 3 stacked require sequential gate evaluation) |
| 7.11 Lighthouse variance characterization | 0.5 day | 7.10 | No (post-Block-B measurement) |
| 7.12 playwright config retries delta | 0.25 day | — | Yes (anytime) |
| 7.13 calendar.test.tsx:260 darwin flake | 0.5 day | — | Yes (anytime) |
| 7.14 Phase-5 Perf Report §2 footnote | 0.25 day | — | Yes (anytime) |
| Buffer | 1 day | — | — |
| **Total** | **5–7 days** | | |

---

## §11. Notes for executor

- Phase-7 has no v1 plan source. Cite `Docs/Phase6_Closure_Report.md §8` 16-item carry-forward + this Phase_7_Plan.md as authoritative scope source per GR-14 (v2.32 amendment) — when phase-spec contradicts parent, parent + v1-lineage wins; Phase-7 has no parent v1 row to contradict, so this phase-spec IS the authoritative source (mirrors Phase-6's authority structure).
- Phase-6 deferred-items ledger consolidated at `Docs/Phase6_Closure_Report.md §8` carries 16 items in 3 blocks + 2 process improvements + ~216 cumulative cross-phase deferred-items. Phase-7 tasks should reference rather than re-enumerate.
- Calibration class shorthand at task level: prefer the umbrella **COMPONENT-FIX** for any production-source edit shape (7.1 A11Y-COMPONENT-FIX + 7.9 CONFIG-PERF-OPTIMIZATION + 7.10). Resolve sub-classes only if Phase-7 surfaces a third structurally-distinct production-chunk-edit shape that doesn't fit the umbrella.
- **NEW class candidate at Phase-7:** CI-CONFIG-FIX (7.3 + 7.4 + 7.6 — 3pt within Phase-7 fully calibrating the class as project-wide 12th cumulative class). TEST-INFRASTRUCTURE-CAPTURE (7.5 — 1pt; pending second cross-phase data point). TEST-INFRASTRUCTURE-FIX (7.13 — 1pt; pending second cross-phase data point as project-wide 13th cumulative class). DOC-CORRECTION-ONLY + DOC-INVESTIGATION-ONLY (7.7 + 7.12 + 7.14 — possible 3pt within Phase-7 fully calibrating).
- **Process Improvement #1 absorbed:** Phase-N column ADDED to §9 main matrix at OPENING task close (Phase-7 establishes the right convention at 7.1 OPENING; corrects Phase-6 missed-maintenance pattern surfaced at 6.9 PRE0 Q4).
- **Process Improvement #2 absorbed:** Measurement-report-as-completion-report pattern recognized as legitimate convention (executor discretion for 7.11 in particular; possibly 7.7 + 7.12 + 7.14 as DOC-only-investigation/correction shapes).
- **Path-filter quirk re-baseline at Phase-7:** Tasks touching `qualia-shell/src/**` paths (7.1 + 7.10) trigger parity-gate auto-fire on `pull_request` (no manual-dispatch). Tasks touching only paths outside the paths-filter (7.2 spec / 7.3 workflow / 7.4-7.6 workflow+PNG / 7.7 + 7.11 + 7.12 + 7.13 + 7.14 docs/tests) require manual-dispatch per established 11-task Phase-6 precedent (4.7 / 5.3-5.7 / 6.5-6.9). 7.9 vite.config.ts is at qualia-shell/-root, NOT covered by `qualia-shell/src/**` filter → manual-dispatch expected at 7.9 PR open.
- **Sweep-resolution-precedent extending to 13+ cross-phase at Phase-7 OPENING:** 7.1 sweep co-ships 6.9 TBD → `b99a8ac` / `#55` resolution (13 consecutive cross-phase sweep-resolutions: meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → **7.1**); pattern fully cemented as cross-phase convention; resolved across §9 row 6.9 squash-SHA cell + Phase status line at top of `Docs/Phases/Phase_6_Plan.md` + Task 6.9 closure-narrative TBD references + CLAUDE.md HEAD pointer.

🧪
