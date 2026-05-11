# Phase 6 — Accessibility Re-Measurement Report (Post-Block-C Confirmation)

**Task**: Phase-6 Task 6.6 — Re-execute confirmation a11y measurement post-Phase-6 Block C remediation (6.3 + 6.4).
**Captured**: 2026-05-11T04:02Z (UTC).
**Branch / commit**: `phase-6/task-6.6-a11y-remeasurement` off `e245ebf` (pre-merge).
**Methodology**: see §1.
**Raw data**: `Docs/Baselines/2026-05-11_Phase6_task_6_6_a11y_capture.json`.
**Mirror**: byte-shape mirror of `Docs/Phase5_A11y_Report.md` (Task 5.7) with side-by-side 362 → 0 cross-phase delta.

---

## §0. Executive summary — v1 L230 threshold vs measurement

v1 plan L230 verbatim: *"Run `axe-core` CI on the 4 detail pages. Zero WCAG AA violations."*

| Metric | v1 L230 target | Phase-5 baseline (2026-05-04) | Phase-6 post-remediation (2026-05-11) | Status |
|---|---:|---:|---:|:---:|
| **Total WCAG AA violations** | **0** | **13 distinct rules** / **362 violating nodes** | **0 / 0** | ✅ PASS |
| Distinct rule IDs | 0 | **5** (`button-name`, `color-contrast`, `aria-valid-attr-value`, `scrollable-region-focusable`, `select-name`) | **0** | ✅ PASS |
| Critical impact | 0 | **7** | **0** | ✅ PASS |
| Serious impact | 0 | **6** | **0** | ✅ PASS |
| Pages with zero violations | **4 of 4** | **0 of 4** | **4 of 4** | ✅ PASS |

**Verdict**: ✅ **v1 L230 ZERO WCAG AA threshold MET**. Phase-5 Task 5.7 §0 declared this threshold *"structurally unattainable without dedicated remediation work; captured as PASS/FAIL findings"*; Phase-6 Block C 6.3 + 6.4 IS that dedicated remediation arc and the threshold is now MET. Cross-phase trajectory: **362 (Phase-5 baseline) → 33 (post-6.3, button-name 334 → 0 on tenant rows) → 0 (post-6.4, multi-rule remediation across 6 component files) → 0 (Task 6.5 closure-snapshot confirmation) → 0 (Task 6.6 re-execute confirmation)**; **−100% cumulative reduction**. Phase-5 Task 5.7's "future-Phase-N decision deferred (tuning arc OR deliberate v1 spec amendment)" recommendation is closed: option (a) was executed and succeeded; option (b) is no longer needed.

**Empirical consistency with Phase-5 baseline**: Phase-5 Task 5.7 captured 362 nodes (button-name 338 dominated by Brianna tenant page 334 / color-contrast 8 / aria-valid-attr-value 10 / scrollable-region-focusable 2 / select-name 4). Per-rule elimination at Phase-6 Block C close: aria-valid-attr-value **15 → 0** / button-name **338 → 0** / color-contrast **8 → 0** / scrollable-region-focusable **2 → 0** / select-name **4 → 0**. The aria-valid-attr-value 10 → 15 mid-trajectory increase between 5.7 and 6.4 is documented in CLAUDE.md (Tenant-row icon-button conventions entry; 5 new Section-accordion-header violations on the Brianna page were *structurally surfaced* — not caused — by the Task 6.1a `.s-detail-panel` layout fix, then remediated at 6.4).

---

## §1. Methodology

The 4 enriched detail pages (128 BV property / 2-STORY vendor / WO 19511-1 maintenance / Brianna Jackson tenant) are **NOT addressable as standalone URLs** — `qualia-shell/src/App.tsx` has zero React Router patterns; modules are React-state-driven (mirror constraint to Phase-5 Tasks 5.4/5.5/5.6/5.7 + Phase-0 baseline-spec JSDoc forecast).

Task 6.6 mirrors the Phase-5 Task 5.7 methodology byte-for-byte except for the script rename and artifact-filename convention:

1. **Playwright-driven SPA navigation** through the 4 detail pages using the same `loginAs` + `sidebar→strata→nav-item→card-click` pattern from Phase-5 Tasks 5.4/5.5/5.6/5.7.
2. **`@axe-core/playwright@4.11.2`** runs WCAG 2.0 + 2.1 AA tagged audits per page with `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()`.
3. **Per-page enumeration** of violations (rule ID / impact / description / help text / helpUrl / WCAG tags / violating node count) plus cross-page aggregation (distinct rule IDs / total violating nodes / impact distribution).

Build configuration (mirrors the Phase-5 Task 5.7 build mode verbatim):
- `VITE_USE_STATIC_API=true` (in-memory fixtures + localStorage stub; cdp_probe prereq build mode; per CLAUDE.md "Production chunk invariance state" build-mode footnote this build mode is structurally distinct from the parity-gate canonical build but is the correct measurement target for the static-API consumer path)
- `VITE_APPFOLIO_SEEDS=true` (Phase-1 through Phase-5 enrichment fixtures included)
- `vite preview` on port 4173

`localStorage` pre-seeded with `qualia_sidebar_groups: ["Property Management", "AI Tools", "Filing Cabinet"]` because the Sidebar component's default state has all groups collapsed (`Sidebar.tsx:226-232`). At Phase-6 Task 6.2, the canonical e2e `helpers/auth.ts::loginAs` was permanently amended to seed this via `page.addInitScript`, but the `Scripts/run_axe_phase6.mjs` context does not consume `helpers/auth.ts` (different module-resolution boundary), so the seed is inline-replicated in the script's own `loginAs` (3 LoC mirror of the helpers/auth.ts amendment).

**Script rename**: `Scripts/run_axe_phase5.mjs` was renamed to `Scripts/run_axe_phase6.mjs` at Task 6.6 close via `git mv` + targeted string-replace patch (Phase-5 → Phase-6 in JSDoc / console-log / JSON `task` field / artifact-filename hardcode at L353). Original Phase-5 SCOPE-COLLISION narrative preserved in git history at HEAD `e245ebf` and prior (see `git log --follow Scripts/run_axe_phase6.mjs` + `Docs/Phase5_Closure_Report.md §3`). The companion `Scripts/run_lighthouse_phase5.mjs` will follow the same rename pattern at Task 6.7 (perf re-measurement arc) per cross-script-rename convention.

**Relationship to Phase-0 axe-baseline.spec.ts** (per Phase-5 Task 5.7 user decision #5, preserved at Phase-6): explicitly bypass; complementary data scopes:
- **Phase-0 baseline** (`qualia-shell/e2e/axe-baseline.spec.ts` + `Docs/Baselines/2026-04-21_Phase0_axe_baseline.json`): repo-wide a11y on **8 routable surfaces** (Phase 0.0 Task 0.0.8 era; 18 violations / 10 critical + 18 serious; CI step is `continue-on-error: true` per `.github/workflows/appfolio-parity-gate.yml:77` — gate-flip viable at Phase-6 Task 6.6 close but **gated on Linux Playwright baseline capture**; defer to Task 6.8 CI architecture sweep per Phase-6 Task 6.5 §7 entry 4).
- **Phase-5 Task 5.7 / Phase-6 Task 6.6** (this report's scope): enriched-detail-pages a11y on **4 SPA-internal navigations** (128 BV / 2-STORY / WO 19511-1 / Brianna Jackson).

Both retained as complementary data sources; different scopes; different page sets.

---

## §2. Cross-page summary (Phase-5 → Phase-6 side-by-side delta)

Captured 2026-05-11T04:02Z; 1 run per page; chromium 1.52 with 1440×900 viewport via `chromium.launch({ headless: true })`; `@axe-core/playwright@4.11.2` with WCAG 2.0 + 2.1 AA tags.

| Aggregate | Phase-5 (2026-05-04) | Phase-6 (2026-05-11) | Δ |
|---|---:|---:|---:|
| Pages scanned | 4 (all 4 succeeded; 0 errored) | **4 (all 4 succeeded; 0 errored)** | **0** |
| **Total violations** (distinct rules per page summed) | 13 | **0** | **−13 (−100%)** |
| **Total violating nodes** | 362 | **0** | **−362 (−100%)** |
| Distinct violation rule IDs (across all 4 pages) | 5 (`aria-valid-attr-value`, `button-name`, `color-contrast`, `scrollable-region-focusable`, `select-name`) | **0** | **−5 (−100%)** |
| Violations by impact | critical: 7 / serious: 6 | **critical: 0 / serious: 0** | **−13 (−100%)** |
| Pages with zero violations | 0 of 4 | **4 of 4** | **+4** |

---

## §3. Per-page violations (axe-core full enumeration)

WCAG 2.0 + 2.1 AA tagged. Phase-6 result: **0 violations / 0 nodes across all 4 pages**.

### 128 Buena Vista Dr N (property detail) — 0 violations / 0 nodes (Phase-5: 2 / 3)

| Rule | Phase-5 (nodes) | Phase-6 (nodes) | Eliminated by |
|---|---:|---:|---|
| `button-name` | 1 | **0** | Task 6.4 (3-instance RefreshCw ghost-button aria-label conv.) |
| `color-contrast` | 2 | **0** | Task 6.4 (`Sidebar.css` token adjustment) |

### 2-STORY TECHNICAL ROOFING LLC (vendor detail) — 0 violations / 0 nodes (Phase-5: 5 / 16)

| Rule | Phase-5 (nodes) | Phase-6 (nodes) | Eliminated by |
|---|---:|---:|---|
| `aria-valid-attr-value` | 10 | **0** | Task 6.4 (`<Section>` content-div `id` linkage in `VendorsModule.tsx`) |
| `button-name` | 1 | **0** | Task 6.4 (RefreshCw ghost-button aria-label) |
| `color-contrast` | 2 | **0** | Task 6.4 (`Sidebar.css` token adjustment) |
| `scrollable-region-focusable` | 1 | **0** | Task 6.4 (`tabIndex=0` + `role=region` + `aria-label` triplet on list-panel) |
| `select-name` | 2 | **0** | Task 6.4 (`aria-label` on `<select>` elements) |

### WO 19511-1 / Fire alarm needs replaced (maintenance detail) — 0 violations / 0 nodes (Phase-5: 3 / 5)

| Rule | Phase-5 (nodes) | Phase-6 (nodes) | Eliminated by |
|---|---:|---:|---|
| `button-name` | 2 | **0** | Task 6.4 (RefreshCw + ProfileSpaces aria-labels) |
| `color-contrast` | 2 | **0** | Task 6.4 (`Sidebar.css` token adjustment) |
| `scrollable-region-focusable` | 1 | **0** | Task 6.4 (`tabIndex=0` + `role=region` + `aria-label` triplet) |

### Brianna Jackson (tenant detail) — 0 violations / 0 nodes (Phase-5: 3 / 338)

| Rule | Phase-5 (nodes) | Phase-6 (nodes) | Eliminated by |
|---|---:|---:|---|
| `button-name` | **334** | **0** | **Task 6.3** (single-line `aria-label` on `ResidentsModule.tsx:833` tenant-row icon-button with `t.name` null-safety fallback; one template-level edit fixed all 334 simultaneously) |
| `color-contrast` | 2 | **0** | Task 6.4 (`Sidebar.css` token adjustment) |
| `select-name` | 2 | **0** | Task 6.4 (`aria-label` on `<select>` elements) |

**Brianna tenant page dominated the Phase-5 violation count** (338 of 362 total = ~93%) due to virtualized tenant list rendering; one component change at `ResidentsModule.tsx:833` fixed all 334 button-name nodes simultaneously, validating Phase-5 Task 5.7 §3 prediction ("structurally a single-pattern fix … one component change; ~334 button instances all fixed simultaneously"). Cross-phase difficulty estimate was "Low"; empirical execution at Task 6.3 confirmed the estimate.

**aria-valid-attr-value mid-trajectory rise** (10 → 15 at the 6.3 ↔ 6.4 boundary): the 5 new violations were Section-accordion-header `<button aria-controls="...">` elements that lacked matching `id` attributes on the controlled content divs; STRUCTURALLY surfaced post-Task-6.1a `.s-detail-panel` layout fix (pre-6.1a the detail panel rendered-but-zero-width so axe-core didn't traverse the interior; 6.1a's 434×700 layout made the previously-hidden elements visible to axe-core); NOT caused by 6.3 edit; remediated at 6.4 via `id={\`{tenant|vendor}-block-${slug}\`}` linkage. See CLAUDE.md "Section content-div `id` attribute linking (Phase-6 Task 6.4)" Conventions entry.

---

## §4. WCAG AA threshold matrix — closure reconciliation

Phase-5 Task 5.7 §4 estimated remediation difficulty per rule. Phase-6 Block C empirical execution validates / refines those estimates:

| Rule | Impact | Phase-5 nodes | Phase-5 difficulty estimate | Phase-6 remediation task | Empirical complexity |
|---|---|---:|---|---|---|
| `button-name` | critical | 338 | **Low** (single-pattern fix on tenant-row icon button) | Task 6.3 (Brianna 334) + Task 6.4 (RefreshCw 3-instance + ProfileSpaces) | ✅ matched (Low — 2 LoC at 6.3; 4 aria-label additions at 6.4) |
| `color-contrast` | serious | 8 | **Low** (CSS color token adjustment; theme-wide pass) | Task 6.4 (`Sidebar.css` token) | ✅ matched (Low) |
| `aria-valid-attr-value` | critical | 10 → 15 mid-trajectory | **Low** (ARIA attribute typos in vendor-specific component) | Task 6.4 (Vendors + Residents `<Section>` content-div `id` linkage) | ⚠️ slightly underestimated — was actually a structural `aria-controls`/`id` linkage gap, not "typos"; +5 nodes surfaced post-6.1a layout fix; still Low difficulty per LoC count |
| `select-name` | critical | 4 | **Low** (form `<select>` `aria-label`) | Task 6.4 (4 select `aria-label` additions) | ✅ matched (Low) |
| `scrollable-region-focusable` | serious | 2 | **Medium** (scrollable regions need keyboard access) | Task 6.4 (`tabIndex=0` + `role=region` + `aria-label` triplet on list-panels) | ✅ matched (Medium — proper triplet pattern, not just `tabindex=0`) |

**Phase-5 estimated total remediation scope**: "~5 component changes … 1-2 day Phase-6 a11y arc". **Phase-6 actual remediation scope**: **2 tasks (6.3 + 6.4) / 13 source-line edits across 6 component files / ~0.5 day empirical execution**. Phase-5 estimate accurate within order-of-magnitude; the per-task split (6.3 button-name pattern fix first, then 6.4 multi-rule sweep) refined the original 6.5-row-2-monolithic-task into a 3-task block (6.3 + 6.4 + 6.5 closure-snapshot).

---

## §5. Reproducibility

To reproduce this measurement on another machine:

```bash
cd "$REPO_ROOT/qualia-shell"
rm -rf dist
VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build
cd ..
node Scripts/run_axe_phase6.mjs
# Output: Docs/Baselines/<YYYY-MM-DD>_Phase6_task_6_6_a11y_capture.json
```

Run conditions for the 2026-05-11 capture:
- **Host**: Darwin 25.5.0 (macOS)
- **Chromium (Playwright)**: `@playwright/test@^1.52.0`; viewport 1440×900; `headless: true`
- **@axe-core/playwright**: 4.11.2
- **Tags**: `['wcag2a', 'wcag2aa']`

Variance expectations: axe-core violation counts are deterministic for a given DOM state. **Zero-state determinism**: 5 independent confirmations of the 0-state at HEAD `fc3ce46` / `e245ebf` (post-6.4 measurement → 6.5 PRE0 cdp_probe → 6.5 post-edit cdp_probe → 6.6 PRE0 cdp_probe → 6.6 post-edit `run_axe_phase6.mjs`); confidence in zero-state stability is high.

---

## §6. Threshold-MET confirmation — closure narrative

Phase-5 Task 5.7 §6 captured threshold-drift findings as "future-Phase-N decision deferred — surface to product/engineering leadership at Phase-5 closure decision point" with two options:

| Phase-5 §6 option | Phase-6 outcome |
|---|---|
| (a) Phase-6 a11y remediation arc (~1-2 days estimated; ~5 component changes) | ✅ **EXECUTED** — Phase-6 Block C 6.3 + 6.4 (~0.5 day empirical; 13 source-line edits across 6 component files); threshold MET |
| (b) Deliberate v1 spec amendment (e.g., violation-count ≤ N for some N) | **NOT NEEDED** — option (a) succeeded; v1 L230 ZERO threshold preserved as the canonical target |

**Recommendation closed**: the Phase-5 decision recommendation has been resolved by Phase-6 Block C execution; no further action needed at the spec-amendment layer. The companion Phase-5 perf threshold drift (Task 5.6 v1 L228) remains open and will be re-measured at Task 6.7 (perf re-measurement arc) — same per-task pattern as 6.6 (rename `run_lighthouse_phase5.mjs` → `run_lighthouse_phase6.mjs` + re-execute + produce `Docs/Phase6_Perf_Report.md` byte-shape mirror of `Docs/Phase5_Perf_Report.md`).

**Carry-forward consistency with Phase-5 closure-decision-point convention**: Phase-5 Task 5.7 §6 noted "Joint recommendation: Phase-5 closure decision should address BOTH thresholds together (perf + a11y are related — many a11y improvements also improve perf score)". Phase-6 splits the joint into 6.6 (a11y) + 6.7 (perf) sequentially, but the joint reconciliation will still happen — at Phase-6 closure (6.9) the two re-measurement reports will be cross-referenced in the closure narrative.

---

## §7. Notes & known limitations

1. **Single run** for the per-page measurements; axe-core is deterministic so variance is zero across the 5 independent confirmations of the 0-state. For higher-confidence measurements at a future remediation gate, run 3× and aggregate — but the 5-confirmation cross-task pattern at Phase-6 Block C close already provides equivalent confidence.
2. **Static-API mode build** (`VITE_USE_STATIC_API=true`): the correct measurement target for the SPA's offline-by-default consumer path; backend-mode measurement against staging DB is deferred to a real dev box with sibling repo present (R-4 v2.26 cross-repo amendment).
3. **CI integration deferred** to Task 6.8 (Feature spec CI integration). With Phase-6 Block C 0-state established, the `axe-baseline.spec.ts` gate-flip from `continue-on-error: true` to blocking is structurally viable but **gated on Linux Playwright baseline capture** (still a Phase-0 deferred item per `Docs/Baselines/phase_0_0_exit_gate_report.md` "Deferred Item" section). Per Phase-6 Task 6.5 §7 entry 4 + Cowork-aligned recommendation, the actual flip is co-decided with Linux-baseline capture at Task 6.8 as a single CI-architecture sweep.
4. **Phase-0 axe-baseline.spec.ts is NOT superseded by this report**; it remains the repo-wide a11y safety net on 8 routable surfaces. Task 6.6 measures a different scope (the 4 enriched detail pages); both retained as complementary data sources.
5. **Brianna tenant page button-name fix (Phase-5 forecast validated)**: Phase-5 Task 5.7 §7 entry 6 predicted "single-pattern fix (one component change fixes all 334) … ~30 minutes for the tenant-row component". Phase-6 Task 6.3 empirical execution: 1 LoC edit (`aria-label` with `t.name` null-safety fallback) at `ResidentsModule.tsx:833`, completed in well under 30 min; 334 → 0 nodes confirmed. Phase-5 prediction validated.
6. **5th-data-point chunk-axis preservation pattern**: at Phase-6 Task 6.6 close, the DOC-only-plus-script-rename path preserves the parity-gate canonical production chunk axes byte-for-byte (the `Scripts/run_axe_phase6.mjs` rename is outside the Vite entry graph, so it structurally cannot touch the production chunk). Extends the Phase-6 pattern from 5 to **6 data points** of "test-tooling-only / DOC-only edits preserve all 3 production chunk axes within a single capture session on the same env + same build-mode" — very strong inductive evidence at 6 data points; per CLAUDE.md the categorical Phase-5 "STRUCTURAL LAW" claim was retired at the Phase-6 boundary but the empirical pattern continues to hold for test-tooling / DOC-only / Scripts-rename edits.
