# Phase 5 — Accessibility Validation Report

**Task**: Phase-5 Task 5.7 — Accessibility validation (axe-core via Playwright).
**Captured**: 2026-05-04T07:44Z (UTC).
**Branch / commit**: `feat/phase-5-task-5.7-a11y-validation` (pre-merge).
**Methodology**: see §1.
**Raw data**: `Docs/Baselines/2026-05-04_Phase5_a11y_capture.json`.
**Mirror**: byte-shape mirror of `Docs/Phase5_Perf_Report.md` (Task 5.6).

---

## §0. Executive summary — v1 L230 threshold vs measurement

v1 plan L230 verbatim: *"Run `axe-core` CI on the 4 detail pages. Zero WCAG AA violations."*

| Metric | v1 L230 target | Measurement | Status |
|---|---:|---:|:---:|
| **Total WCAG AA violations** | **0** | **13 distinct rules** across 4 pages / **362 violating nodes** | ❌ FAIL |
| Distinct rule IDs | 0 | **5** (`button-name`, `color-contrast`, `aria-valid-attr-value`, `scrollable-region-focusable`, `select-name`) | ❌ FAIL |
| Critical impact | 0 | **7** (across all 4 pages) | ❌ FAIL |
| Serious impact | 0 | **6** (across all 4 pages) | ❌ FAIL |
| Pages with zero violations | **4 of 4** | **0 of 4** | ❌ FAIL |

**Verdict**: v1 L230 ZERO target structurally unattainable without dedicated remediation work; captured as PASS/FAIL findings per user decision (Task 5.7 §7 entry 3). Phase-5 Task 5.7's deliverable per spec is the artifact at this filename — captured. Phase-5 §17 exit gate references the §9 verification matrix where Task 5.7's a11y cell is `R` and flips `✓` on report commit (not on threshold-pass). **Future-Phase-N decision deferred** (tuning arc OR deliberate v1 spec amendment); recommendation surface to product/engineering leadership at Phase-5 closure decision point. See §6.

**Empirical consistency with Task 5.6**: Task 5.6 captured the same data inside `Docs/Baselines/2026-05-04_Phase5_perf_capture.json::perPage[].axe`. Task 5.7's standalone capture matches Task 5.6's measurements within expected variance (Task 5.6 reported 334 button-name nodes on Brianna tenant page; Task 5.7 reports 338 — minor variance likely from row-count rendering at measurement time). Both captures are retained for cross-phase comparison.

---

## §1. Methodology

The 4 enriched detail pages (128 BV property / 2-STORY vendor / WO 19511-1 maintenance / Brianna Jackson tenant) are **NOT addressable as standalone URLs** — `qualia-shell/src/App.tsx` (225 lines) has zero React Router patterns; modules are React-state-driven (mirror constraint to Task 5.6 §1 + Phase-0 baseline script JSDoc forecast).

Task 5.7 honors v1 L230 via a hybrid approach using existing dev infrastructure:

1. **Playwright-driven SPA navigation** through the 4 detail pages using the same `loginAs` + `sidebar→strata→nav-item→card-click` pattern from Tasks 5.4/5.5/5.6.
2. **`@axe-core/playwright@4.11.2`** runs WCAG 2.0 + 2.1 AA tagged audits per page with `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()`.
3. **Per-page enumeration** of violations (rule ID / impact / description / help text / helpUrl / WCAG tags / violating node count) plus cross-page aggregation (distinct rule IDs / total violating nodes / impact distribution).

Build configuration:
- `VITE_USE_STATIC_API=true` (in-memory fixtures + localStorage stub; mirrors Tasks 5.4/5.5/5.6 default chromium project)
- `VITE_APPFOLIO_SEEDS=true` (Phase-1-5 enrichment fixtures included)
- `vite preview` on port 4173 (mirrors Phase-0 + Task 5.6 measurement convention)

`localStorage` pre-seeded with `qualia_sidebar_groups: ["Property Management", "AI Tools", "Filing Cabinet"]` because the Sidebar component's default state has all groups collapsed (`Sidebar.tsx:226-232`); without seeding, the Strata widget is invisible on cold-start (Task 5.6 §7 entry 4 carry-forward; helpers/auth.ts amendment was attempted at Task 5.7 PRE2 but smoke-test surfaced downstream `.s-detail-panel` hidden failures on appfolio-parity-workorder.spec.ts + appfolio-parity-vendor-compliance.spec.ts — not caused by amendment, exposed by it; per smoke-test fallback rule, A2 inline-only retained — mitigation lives in `Scripts/run_axe_phase5.mjs::loginAs` only).

**Relationship to Phase-0 axe-baseline.spec.ts (per user decision #5)**: explicitly bypass; complementary data scopes:
- **Phase-0 baseline** (`qualia-shell/e2e/axe-baseline.spec.ts` + `Docs/Baselines/2026-04-21_Phase0_axe_baseline.json`): repo-wide a11y on **8 routable surfaces** (Phase 0.0 Task 0.0.8 era; 18 violations / 10 critical + 18 serious)
- **Phase-5 Task 5.7** (this report): enriched-detail-pages a11y on **4 SPA-internal navigations** (128 BV / 2-STORY / WO 19511-1 / Brianna Jackson)

Both retained as complementary data sources; different scopes; different page sets.

---

## §2. Cross-page summary

Captured 2026-05-04T07:44Z; 1 run per page; chromium 1.52 with 1440×900 viewport via `chromium.launch({ headless: true })`; `@axe-core/playwright@4.11.2` with WCAG 2.0 + 2.1 AA tags.

| Aggregate | Value |
|---|---:|
| Pages scanned | **4** (all 4 succeeded; 0 errored) |
| **Total violations** (distinct rules per page summed) | **13** |
| **Total violating nodes** | **362** |
| Distinct violation rule IDs (across all 4 pages) | **5** (`aria-valid-attr-value`, `button-name`, `color-contrast`, `scrollable-region-focusable`, `select-name`) |
| Violations by impact | **critical: 7** / **serious: 6** |

---

## §3. Per-page violations (axe-core full enumeration)

WCAG 2.0 + 2.1 AA tagged.

### 128 Buena Vista Dr N (property detail) — 2 violations / 3 nodes

| Rule | Impact | Nodes | Help |
|---|---|---:|---|
| `button-name` | critical | 1 | Buttons must have discernible text |
| `color-contrast` | serious | 2 | Elements must meet minimum color contrast ratio thresholds |

### 2-STORY TECHNICAL ROOFING LLC (vendor detail) — 5 violations / 16 nodes

| Rule | Impact | Nodes | Help |
|---|---|---:|---|
| `aria-valid-attr-value` | critical | 10 | ARIA attributes must conform to valid values |
| `button-name` | critical | 1 | Buttons must have discernible text |
| `color-contrast` | serious | 2 | Elements must meet minimum color contrast ratio thresholds |
| `scrollable-region-focusable` | serious | 1 | Scrollable region must have keyboard access |
| `select-name` | critical | 2 | Select element must have an accessible name |

### WO 19511-1 / Fire alarm needs replaced (maintenance detail) — 3 violations / 5 nodes

| Rule | Impact | Nodes | Help |
|---|---|---:|---|
| `button-name` | critical | 2 | Buttons must have discernible text |
| `color-contrast` | serious | 2 | Elements must meet minimum color contrast ratio thresholds |
| `scrollable-region-focusable` | serious | 1 | Scrollable region must have keyboard access |

### Brianna Jackson (tenant detail) — 3 violations / 338 nodes

| Rule | Impact | Nodes | Help |
|---|---|---:|---|
| `button-name` | critical | **334** | Buttons must have discernible text |
| `color-contrast` | serious | 2 | Elements must meet minimum color contrast ratio thresholds |
| `select-name` | critical | 2 | Select element must have an accessible name |

**Brianna tenant page dominates the violation count** (338 of 362 total = ~93%) due to virtualized tenant list rendering. Every tenant row renders icon-only action buttons missing `aria-label`. This is structurally a single-pattern fix (one component change; ~334 button instances all fixed simultaneously) rather than 334 distinct issues — but it counts as 334 axe-core violations regardless.

---

## §4. WCAG AA threshold matrix (carry-forward to Phase-6 a11y arc)

| Rule | Impact | Total Nodes | Affected Pages | Phase-6 remediation difficulty |
|---|---|---:|---:|---|
| `button-name` | critical | **338** | 4 of 4 | **Low** (~334 from Brianna tenant rows; single-pattern fix on tenant-row icon button) |
| `color-contrast` | serious | 8 | 4 of 4 | **Low** (CSS color token adjustment; theme-wide pass) |
| `aria-valid-attr-value` | critical | 10 | 1 of 4 (vendor) | **Low** (likely ARIA attribute typos in vendor-specific component) |
| `select-name` | critical | 4 | 2 of 4 (vendor + tenant) | **Low** (form `<select>` elements need accessible-name; add `aria-label` or `<label>`) |
| `scrollable-region-focusable` | serious | 2 | 2 of 4 (vendor + WO) | **Medium** (scrollable regions need keyboard access; possibly add `tabindex=0`) |

**Estimated remediation scope**: ~5 component changes (single button-name fix on tenant-row component fixes ~93% of node count; ~4 other targeted fixes for color-contrast / aria-valid-attr / select-name / scrollable-region). Could plausibly be a focused 1-2 day Phase-6 a11y arc.

---

## §5. Reproducibility

To reproduce this measurement on another machine:

```bash
cd "$REPO_ROOT/qualia-shell"
rm -rf dist
VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build
cd ..
node Scripts/run_axe_phase5.mjs
# Output: Docs/Baselines/<YYYY-MM-DD>_Phase5_a11y_capture.json
```

Run conditions for the 2026-05-04 capture:
- **Host**: Darwin 25.5.0 (macOS)
- **Chromium (Playwright)**: `@playwright/test@^1.52.0`; viewport 1440×900; `headless: true`
- **@axe-core/playwright**: 4.11.2
- **Tags**: `['wcag2a', 'wcag2aa']`

Variance expectations: axe-core violation counts are mostly deterministic for a given DOM state; minor variance can come from render-time variations (e.g., virtualized tenant list may render different row counts depending on viewport / scroll position). Task 5.6 captured 334 button-name nodes on Brianna; Task 5.7 captures 338 — within expected variance.

---

## §6. Threshold-drift findings — captured for future-Phase-N

Per Task 5.7 §7 entries, the v1 L230 threshold is aspirational and structurally unattainable for the SPA at current a11y posture. Captured drift inventory:

| Drift | v1 L230 target | Measured | Δ | Future-Phase-N options |
|---|---:|---:|---:|---|
| Total WCAG AA violations | 0 | 13 (5 distinct rules / 362 nodes) | +13 | (a) Phase-6 a11y remediation arc (~1-2 days estimated; ~5 component changes) / (b) deliberate v1 spec amendment (e.g., violation-count ≤ N for some N) |
| Critical impact violations | 0 | 7 | +7 | (a) prioritize critical impact in Phase-6 / (b) amend spec to "0 critical" rather than "0 total" |
| Pages with zero violations | 4 | 0 | -4 | (a) full remediation pass / (b) amend to "all critical fixed; serious documented as deferred" |

**Recommendation**: surface threshold drift to product/engineering leadership at the Phase-5 closure decision point. Phase-5 spec was written before Phase-1 enrichment determined the actual DOM complexity (especially virtualized tenant-list rendering); the targets reflect aspirational greenfield targets, not validated SPA-realistic targets. Either (a) plan a dedicated a11y remediation arc as Phase-6 (or "Phase-5.5"), or (b) amend v1 L230 to SPA-realistic targets.

**Carry-forward consistency with Task 5.6 v1 L228 pattern**: Task 5.6 captured perf threshold drift (LCP / a11y score) with same future-Phase-N decision deferral. Task 5.7 captures a11y threshold drift in the same shape. Joint recommendation: Phase-5 closure decision should address BOTH thresholds together (perf + a11y are related — many a11y improvements also improve perf score).

---

## §7. Notes & known limitations

1. **a11y score (axe approximation)** in Task 5.6's report used heuristic `100 - 5×violations`. This Task 5.7 report uses **violation count itself as the ground truth metric** (which is what v1 L230 actually specifies). The two metrics measure different things; both are valid for different purposes.
2. **Single run** for the per-page measurements; axe-core is mostly deterministic so variance is minor. For higher-confidence measurements at a future remediation gate, run 3× and aggregate.
3. **Static-API mode build** (`VITE_USE_STATIC_API=true`): this is the correct measurement target for the SPA's offline-by-default consumer path; backend-mode measurement against staging DB is deferred to a real dev box with sibling repo present (R-4 v2.26 cross-repo amendment).
4. **CI integration deferred** to Phase-6+ scope (mirrors Task 5.6 §7 entry 5 user decision #5). CI-gated a11y would require remediation first since current state = 13 violations would block every PR.
5. **Phase-0 axe-baseline.spec.ts is NOT superseded by this report** (per user decision #5); it remains the repo-wide a11y safety net on 8 routable surfaces. Task 5.7 measures a different scope (the 4 enriched detail pages); both retained.
6. **Brianna tenant page 334 button-name nodes**: single-pattern fix (one component change fixes all 334). Don't read 334 as "334 distinct issues" — read as "1 component bug × 334 instances". Estimated remediation: ~30 minutes for the tenant-row component; 1-day Phase-6 arc for full a11y pass.
