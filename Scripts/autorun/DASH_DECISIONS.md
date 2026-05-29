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
