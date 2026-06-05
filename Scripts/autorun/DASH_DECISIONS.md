# PM-Exec Dashboard — Decisions log

Reversible defaults, logged as I go. Format: ID — decision — rationale — how to back out.

---

## DASH-D1 — Extend AstraDashboard, do not build parallel
**Decision:** All dashboard work extends `src/components/AstraDashboard/*`.
**Rationale:** Audit confirmed AstraDashboard already has the right sections, tabs, CSS, and empty
mock arrays wired to render-on-empty. Mandated by arc prompt.
**Back out:** n/a (this is the arc premise).

## DASH-D2 — Panel composition via NEW `dashboardLayoutStore`, not `savedLayoutsStore`
**Decision:** Add `dashboardLayoutStore` (per-user dynamic key `qualia_dashboard_panels_${user.id}`)
via `createLocalStorageStore` object signature. Persists `{ visiblePanelIds, order }`.
**Rationale:** `savedLayoutsStore` persists OS-window positions on the desktop; reusing it would
couple dashboard-internal panel layout to the window system. A dedicated store is more reversible
(one file + one import to remove) and mirrors the proven `savedLayoutsStore`/`fileExplorerStore`
dynamic-key pattern. "More reversible" was the tie-breaker per arc instructions.
**Back out:** delete the store file + revert AstraDashboard to fixed grid.

## DASH-D3 — Data via new `dashboardData.ts` composing existing fetchers
**Decision:** New `src/components/AstraDashboard/dashboardData.ts` with typed fetchers that call
existing `strataGet` / React Query hooks. No duplicated fetch logic. `{ mock: true, ... }` where no
real endpoint.
**Rationale:** Reuse-before-build; `useStrataQueries` + `strataApi` already centralize fetch + cache +
offline routing. Keeps Astra panels thin.
**Back out:** delete `dashboardData.ts`; panels fall back to empty arrays.

## DASH-D4 — Drill-down via `dwellium:open-widget` → `strata-dashboard`
**Decision:** Panel drill-down fires the existing cross-widget bus to open the Strata window. Use an
injectable `openWidget` dep (mirror `workspaceScribe.ts`) for testability.
**Rationale:** Strata sub-modules are not separate widgets and have no global deep-link bus today;
opening the Strata window is the reversible, already-supported handoff. Module-target deep-link is a
deferred enhancement.
**Back out:** remove the onClick handlers.

## DASH-D5 — Visible mock labeling
**Decision:** Panels with no real endpoint render a "Sample data" badge and carry `mock: true`.
**Rationale:** Arc requires clearly-labeled mock only where the app lacks real data (HR).
**Back out:** n/a.

## DASH-D6 — Strata module-target deep-link (Cycle 5; refines DASH-D4)
**Decision:** Implement the module-target drill-down DASH-D4 deferred. New
`src/components/StrataDashboard/strataDeepLink.ts` exports `openStrataModule(module, deps?)`:
sets a module-level holder `pendingStrataModule`, fires `dwellium:open-widget` for
`strata-dashboard` (surfaces the window), then emits a `dwellium:strata-module` CustomEvent.
StrataDashboard gets a single additive `useEffect`: it `consumePendingStrataModule()` on mount
(cold-open lands on the deep-linked module) AND listens for `dwellium:strata-module`
(warm-focus when the window is already open). Helper is pure + injectable → unit-tested
without a DOM listener (mirrors araLinkage/workspaceScribe).
**Rationale:** The GOAL emphasises drill-down; opening only the overview was a weak handoff.
The holder+event pair covers both cold and warm cases without changing the open-widget bus
contract. StrataDashboard touch is ~8 lines, fully additive/removable.
**Back out:** delete `strataDeepLink.ts`; revert the StrataDashboard `useState` initializer to
`'overview'` and remove the effect. Panels fall back to opening the Strata window (DASH-D4).

## DASH-D7 — Finance + Risk as NEW additive panels (Cycle 7)
**Decision:** Cycle 7 adds two NEW panels (`financials` = Financial Snapshot, `risk` =
Risk Register) rather than mutating the Cycle-3 `finance` (Financial Quick-viz) panel.
- **Financial Snapshot:** NOI / revenue / expenses / occupancy + budget-vs-actual
  (forecast projected monthly revenue vs booked monthly rent from `/recurring-charges`)
  + AR delinquency tally. A segmented date-range control (3/6/12/24 mo) re-fetches
  `fetchFinanceSnapshot(months)` — the 12-mo view reuses the aggregate snapshot so no
  extra fetch fires on first paint. Drill → `forecast` module.
- **Risk Register:** insurance lapses/expirations (`/insurance-policies`, real) + logged
  incidents (`/incidents`, empty today → degrades). Healthy fulfilled/not-required policies
  filtered out; severity high/medium/low; All/High-only filter. Drill → `incidents` module
  (insurance rows → `compliance`, the engine that tracks insurance enforcement).
**Rationale:** Plan §2 lists Cycle-3 Financial Quick-viz and Cycle-7 NOI/delinquency/budget
as SEPARATE rows. Additive panels mirror the Cycle-5/6 pattern (new panel + reconcileLayout
graft) and are maximally reversible (no existing panel touched). Delinquency counts only
known-unpaid `previousStatus` (late/overdue/…); `null`/`PAID` are NOT delinquent so freshly
seeded schedules don't overstate AR risk.
**Back out:** remove the two `renderPanel` cases + PANEL_META entries + the two panel
components; drop `financials`/`risk` from DEFAULT_LAYOUT; remove `fetchFinanceSnapshot`/
`fetchRiskRegister` + the two `DashboardData` fields. reconcileLayout drops unknown ids by
construction, so stored layouts self-heal.

---

## Cycle 9 (2026-05-29) — Global filters, a11y, keyboard nav

**Fork: how to implement the "global portfolio/date filter" the spec asks for.**
**Decision:** Ship a GLOBAL FILTER BAR (Dashboard tab only) with two cross-panel
controls, applied centrally via a pure `applyGlobalFilters(data, filters)` in
`dashboardFilters.ts` BEFORE data reaches the panels — NOT a per-panel rewrite.
- **Text quick-filter (`query`)** — case-insensitive substring across each panel's
  primary display text (title / property / entity / tenant / vendor / label …).
  Works reliably on every list panel.
- **"Attention only" toggle** — keeps only rows a PM-exec would act on
  (priority critical/high/urgent · compliance expired/missing/warning · overdue
  daysUntil<0 · lease ≤30d · vendor suspended/expired/terminated/pending ·
  risk severity high · heatmap delinquency>5/maint>10/occ<85). No-op for panels
  with no action axis (calendar, agent log).
- Both default OFF → `applyGlobalFilters` returns the SAME reference (zero churn);
  the unfiltered dashboard is byte-identical = fully reversible.
- Match count (`N of M items`) + Clear affordance in the bar.

**Deliberately NOT shipped — true portfolio DROPDOWN filter (logged, deferred).**
The heatmap keys properties by display `name`; the ops panels key by `propertyId`;
the data layer exposes no shared id↔name map. A dropdown would silently fail to
filter ~half the panels (misleading). The `query` field covers the honest subset
(type a property name to narrow the panels that surface it). A real dropdown is
deferred to a Cycle-2-altitude data-layer change adding a canonical property list.
A global *date-range* filter is likewise heterogeneous across panels; the Financial
Snapshot already owns its own 3/6/12/24-mo horizon control (Cycle 7), which is the
honest home for date-windowing. Both deferrals carried to DASH_CLOSURE.

**a11y / keyboard nav.** Promoted the top tab row to a WAI-ARIA tablist:
`role="tablist"` wrapper + each tab `role="tab"` + `aria-selected` + roving
`tabIndex` (active=0, others=-1) + Arrow/Home/End key nav (activation-follows-focus);
content region is `role="tabpanel"` with `aria-labelledby`. Added `:focus-visible`
accent rings on tabs + all filter-bar controls. Edit/Refresh buttons kept OUTSIDE
the tablist (they are not tabs). Loading/empty/error UI was already unified via
`PanelStatus` since Cycle 3 — no change needed there.

**Back out:** delete `dashboardFilters.ts` + its test; revert the AstraDashboard.tsx
import, `filters` state, `applyGlobalFilters` call, `<GlobalFilterBar>`, and the
tablist/tabpanel role markup back to the plain `.a-tab` buttons; drop the Cycle-9
CSS block. No data-layer or store changes were made.
