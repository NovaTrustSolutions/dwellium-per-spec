# Phase 3 — UI Polish to Match AppFolio

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §8 (Phase 3 refinements)
**Phase status.** Not started. Blocked on Phase 2 exit gate.
**Budget.** 2-3 days + 1 day buffer = 3-4 days
**Owner.** TBD (UI engineer + QA reviewer)
**Dependencies.** Phase 2 complete; Phase 0.0 Task 0.0.9 screenshot baseline captured.
**Parallelizable?** Yes. Tasks 3.1–3.4 touch different pages.

---

## §1. Scope

Bring Strata's visual rendering within 5% pixel-diff of AppFolio's equivalent pages. This is the phase where table densities, column widths, chip colors, padding scales, and empty-states all get normalized to match the captured screenshots. No schema work, no new data, no new modules — just pixel-level parity on existing Phase 1-2 deliverables.

Scope boundaries:

- IN — CSS / Tailwind classes, layout density, chip colors, empty states, focus rings, scroll behavior, keyboard navigation, axe-compliance fixes.
- OUT — any schema change; any new module; any backend work. Task 3.5 (collapse-state persistence) is MOVED to backlog per v2.0 §8.

---

## §2. Definition of Ready

Per task 3.N:

1. Phase 2 exit gate passed.
2. Screenshot baseline (`qualia-shell/e2e/__screenshots__/baseline/`) exists from Phase 0.0 Task 0.0.9.
3. Lighthouse + axe baselines (`Docs/Baselines/2026-04-19_Phase0_perf_baseline.json` + `...axe_baseline.json`) exist.
4. The AppFolio reference screenshot for the page is available at `AppFolio_Screenshots/ui/*.png`.

---

## §3. Definition of Done

Per task:

1. Screenshot diff ≤ 5% vs AppFolio reference AND ≤ 2% vs Phase 2 baseline for unchanged regions.
2. Lighthouse LCP ≤ max(baseline, 500ms) on modified pages.
3. axe-core violations ≤ baseline on modified pages (never worse).
4. Keyboard nav tested: Tab through the page reaches every interactive element in logical order.
5. `/security-review` pass (no CSP injection introduced by inline style changes).
6. `Docs/Phase3_<page>_Diff_Report.md` — a 2-column before/after set of screenshots.

---

## §4. Tasks

### Task 3.1 — Property detail page polish

**Target pages.** `/strata/properties` (list), `/strata/properties/appfolio-18` (detail).

**Reference captures.** `AppFolio_Screenshots/ui/properties_list.png`, `property_detail_128_buena_vista.png`.

**Files touched.**

- `qualia-shell/src/components/StrataDashboard/modules/PropertiesModule.tsx` — adjust column widths, sticky header, row density to ~48px/row.
- `qualia-shell/src/components/StrataDashboard/modules/__properties/*.tsx` — padding + font-weight normalization.
- `qualia-shell/src/index.css` or Tailwind config — if a new density token is needed (e.g., `.text-table` = 13px/20px).

**Steps.**

1. Capture current state: `npx playwright test e2e/screenshot-baseline.spec.ts --update-snapshots`.
2. Overlay AppFolio reference; measure deltas on: column widths, row padding, chip colors, font sizes.
3. Adjust Tailwind utilities; rerun screenshot diff.
4. Iterate until ≤ 5% diff region-by-region.
5. Verify keyboard tab order.

**Verify.**

```
npx playwright test e2e/properties-diff.spec.ts
# expect: 0 diff regions > 5%
npx lighthouse http://localhost:5173/strata/properties/appfolio-18 --preset=desktop --output=json
# expect: LCP ≤ max(baseline, 500ms)
```

**Rollback.** `git revert`. CSS-only; no data impact.

---

### Task 3.2 — Residents + Vendors page polish

**Target pages.** `/strata/residents`, `/strata/vendors`, `/strata/vendors/appfolio-v-2716`.

**Reference captures.** `AppFolio_Screenshots/ui/tenants_page1.png`, `vendors_page1.png`, `vendor_detail_2story_roofing.png`.

**Files touched.**

- `ResidentsModule.tsx`, `VendorsModule.tsx`, `__vendors/ComplianceTab.tsx`, `__vendors/AccountingTab.tsx`.

**Key polish items.**

- Tab bar: 44px height, bottom 2px accent bar on active.
- Empty states: muted-gray icon + one-line copy; no page-level emptiness.
- Chip colors for compliance: green #2f9e44, yellow #f59f00, red #e03131, gray #adb5bd. Implement in Tailwind palette extension.
- Compliance table: right-align dates; color-code by proximity.

**Verify.** Same pattern as 3.1.

---

### Task 3.3 — Maintenance page polish

**Target pages.** `/strata/maintenance`, `/strata/maintenance/19511-1`.

**Reference captures.** `AppFolio_Screenshots/ui/workorders_page1.png`, `wo_detail_19511.png`.

**Files touched.**

- `MaintenanceModule.tsx`, the 4 new `__maintenance/` sub-components from Phase 1 Task 1.4.

**Key polish items.**

- Detail panel: left rail 280px summary + right main content.
- Action log: timestamp / actor / event columns, monospace for timestamp.
- Resident availability card: 3-column grid (day / start / end).
- Labor table: right-aligned hours + $.

**Verify.** Same pattern.

---

### Task 3.4 — Dashboard + list navigation polish

**Target pages.** `/strata/dashboard`, any remaining list pages not covered by 3.1–3.3.

**Files touched.**

- `StrataDashboard/index.tsx`, sidebar nav, breadcrumb.

**Key polish items.**

- Sidebar: 224px width, 40px row height, active item has 3px left accent bar.
- Breadcrumb: small caps, slate-400 separators, last segment bold.
- Dashboard cards: 16px gap, 8px radius, subtle shadow.

**Verify.** Same pattern.

---

### Task 3.5 — Cross-cutting a11y sweep

**Goal.** Drive axe-core violations to zero on the 8 baseline pages.

**Files touched.** Small targeted edits only.

**Common violations to fix.**

- Form inputs without `<label>` associations.
- Icons-as-buttons without `aria-label`.
- Color-contrast issues (darken slate-500 → slate-600 where appropriate).
- Tab-trapping in modals (add `FocusTrap`).

**Verify.**

```
npx playwright test e2e/axe-all-pages.spec.ts
# expect: 0 violations across 8 pages
```

---

## §5. Verification Matrix

| Check | Target | Evidence |
|---|---|---|
| Screenshot diff ≤ 5% | all 8 pages | `playwright test --update-snapshots` output |
| Lighthouse LCP ≤ max(B, 500ms) | each modified page | Lighthouse JSON |
| Lighthouse TBT ≤ max(B, 200ms) | each modified page | Lighthouse JSON |
| Lighthouse CLS ≤ 0.1 | each modified page | Lighthouse JSON |
| axe violations ≤ baseline (0 target) | all 8 pages | axe JSON |
| Keyboard nav: tab order logical | all 8 pages | manual walkthrough note |
| `vitest run` ≤ baseline | pass | paste output |
| `playwright test` ≤ baseline | pass | paste output |
| `vite build` both flag states | pass | paste output |
| `tsc -b` = 0 | pass | paste output |
| `/security-review` | no High/Medium | review output |
| Pasted diff report | present | `Docs/Phase3_<page>_Diff_Report.md` |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-3-1 | Screenshot diff flaky from rendering timing | Med | Low | Inject `prefers-reduced-motion: reduce` + wait for network idle |
| R-3-2 | Tailwind config change breaks non-parity pages | Low | High | Additive config only; keep existing tokens; name new tokens distinctly |
| R-3-3 | LCP regressed by new fonts / images | Low | Med | Lighthouse gate; preload critical fonts |
| R-3-4 | axe fixes introduce visual regression | Med | Low | Screenshot diff guards against it |
| R-3-5 | Cross-browser drift (Safari vs Chrome) | Med | Med | Playwright runs all 3 engines per task |

---

## §7. Rollback Plan

Phase 3 is CSS-only + small a11y-targeted edits. `git revert` at any point is safe. No schema, no data, no tests removed.

---

## §8. Exit Gate

Phase 3 is complete when:

1. All 5 tasks merged to main.
2. Screenshot diff ≤ 5% on all 8 baseline pages.
3. axe violations = 0 on all 8 pages.
4. Lighthouse LCP ≤ max(baseline, 500ms) on all 8 pages.
5. Keyboard nav documented for all 8 pages.
6. `Docs/Phase3_Completion_Report.md` committed with pasted diff reports + pasted Lighthouse + axe outputs.
7. Ilya verifies "go Phase 4".

---

## §9. Deliverables

- 4 page-polish PRs (3.1–3.4) + 1 a11y sweep (3.5).
- 8 before/after screenshot pairs in `Docs/Phase3_*_Diff_Report.md`.
- Lighthouse JSON per page in `Docs/Baselines/Phase3_lh_<page>.json`.
- axe JSON per page in `Docs/Baselines/Phase3_axe_<page>.json`.
- `Docs/Phase3_Completion_Report.md`.

---

## §10. Backlog (moved from v1.0 Task 3.5)

**Collapse-state persistence.** Originally proposed as Task 3.5: persist which collapsibles each user has expanded across sessions. Moved to backlog; not required for parity. Track in a separate ticket post-parity.

---

## §11. Timeline

| Task | Budget | Can run in parallel? |
|---|:-:|:-:|
| 3.1 Property detail | 0.75 day | Yes |
| 3.2 Residents + Vendors | 0.75 day | Yes |
| 3.3 Maintenance | 0.5 day | Yes |
| 3.4 Dashboard + nav | 0.5 day | Yes |
| 3.5 a11y sweep | 0.5 day | After 3.1–3.4 |
| Buffer | 1 day | — |
| **Total** | **3-4 days** | |

🧪
