# PM-Exec Dashboard — Plan (Cycle 1 audit + roadmap)

**Branch:** `feat/pm-exec-dashboard` (off `feat/ara-stella-inbox-linkage`)
**Date:** 2026-05-29
**Mandate:** EXTEND `src/components/AstraDashboard/AstraDashboard.tsx` into the real PM-exec
dashboard. Do NOT build a parallel one. Reuse existing data hooks, composition primitives,
and the cross-widget bus. Clearly-label mock only where the app has no real source.

---

## 1. Audit findings (ground truth verified this cycle)

### AstraDashboard (the head start — confirmed)
- `AstraDashboard.tsx` (481 L) — 5 tabs (Dashboard / Workspace / Channels / Intelligence /
  Observability). The **Dashboard** tab is a fixed 3-column grid (`a-dashboard-grid`):
  - **left:** PortfolioHeatmap, FinancialQuickViz, CrossDomainSnapshots
  - **center:** WatchdogList, ActiveWorkitems, DomainViews
  - **right:** ComplianceCalendar, AIAgentLog, QuickArbitrage
- **9 mock arrays, ALL empty `[]`:** `HEATMAP_PROPERTIES`, `WATCHDOG_ITEMS`, `FINANCIAL_CARDS`,
  `CALENDAR_EVENTS`, `AGENT_LOG`, `ACTIVE_WORKITEMS`, `DOMAIN_SNAPSHOTS`,
  `ARBITRAGE_OPPORTUNITIES`, `DOMAIN_VIEWS`. Panels already handle the empty case (render
  nothing / "No opportunities yet"). ComplianceCalendar already computes the real month grid.
- One real fetch already present: `ActiveWorkitems.handlePromote` POSTs to
  `${API_BASE}/api/dwellium/workitems/:id/promote` with offline catch.
- Registered `astra-dashboard` at `widgetRegistry.ts:58`, in "Property Management" sidebar group.

### Data layer (REUSE — do not duplicate)
- **`strataApi.ts`** router → `strataGet/strataPost/strataPut/strataDelete/strataGetPaginated/strataUpload`.
  Auto-routes backend vs static (`VITE_USE_STATIC_API`). Same shape both modes → tests & CI work offline.
- **`useStrataQueries.ts`** — React Query hooks already exist: `useProperties`, `useUnits`,
  `useEntities`, `useWorkitems`, `useLinkedData`, `useLeases`, `useCalendarEvents`, `useAuditLog`,
  `useCommunications` + a `strataKeys` factory + `useStrataInvalidate`. **Prefer these hooks; for
  endpoints without a hook, call `strataGet` directly inside the new data module.**
- **Endpoints confirmed present in static impl** (so offline gate stays green): `/properties`,
  `/units`, `/entities`, `/workitems`, `/leases`, `/calendar`(via hook), `/audit`, `/communications`,
  `/compliance`, `/compliance/gaps`, `/compliance/portfolio-rollup`, `/inspections`,
  `/legal-issues`, `/legal-snippets`, `/incidents`, `/insurance-policies`,
  `/insurance/folioguard-rollup`, `/invoices`, `/recurring-charges`, `/occupancies`, `/forecast`,
  `/reports`, `/vehicles`, `/vendor-associations`, `/reporting/vendor-compliance-rollup`,
  `/reporting/vendor-by-property`, `/reporting/insurance-rollup`, `/predictive-flags`,
  `/maintenance/sla-report`, `/maintenance/history`, `/leasing/alerts`, `/intake/queue`,
  `/intake/stats`, `/sentiment/scores`.
- **NO endpoint for HR.** HR panel → clearly-labeled mock.

### Composition + persistence primitives (REUSE)
- `createLocalStorageStore` factory (`src/utils/createLocalStorageStore.ts`) — dual signature;
  **object signature `{ key: () => string, deserializer, defaultValue }` supports per-user dynamic
  keys**. SSR-safe (`useSyncExternalStore` 3-method shape) + `.reset()` test escape-hatch.
- `savedLayoutsStore` (`WindowContext.tsx:81`) — dynamic key `qualia_saved_layouts_${user.id}` via a
  module-level `savedLayoutsUserIdHolder` updated during render. **This stores OS-WINDOW layouts
  (desktop window positions), NOT dashboard-internal panels** → see decision DASH-D2.
- **Cross-widget intent bus:** fire `window.dispatchEvent(new CustomEvent('dwellium:open-widget',
  { detail: { widgetId, label, icon } }))`; `WindowContext.tsx:450` handler opens/focuses the widget.
  `workspaceScribe.ts` is the canonical injectable-deps + `dispatchOpenWidget` pattern to mirror.

### Drill-down feasibility
- Strata sub-modules (compliance, maintenance, legal, leasing, vendors, accounting) are NOT separate
  widgets — they live INSIDE the single `strata-dashboard` widget, navigated via `StrataNavContext`
  (`navigateToProperty/Resident/Unit` + internal `setActiveModule`). That nav context is local to the
  Strata window; there is no global module-target deep-link bus today.
- **Reversible drill-down for this arc:** fire `dwellium:open-widget` → `strata-dashboard` (opens the
  Strata window at 1100×800 default). Module-targeted deep-linking (open Strata AND jump to the
  Compliance module) is a DEFERRED enhancement (would need a new bus event consumed inside Strata).

---

## 2. Exec remit → panel map → data source

| Remit area        | Panel                         | Data source (real)                                              | Cycle |
|-------------------|-------------------------------|-----------------------------------------------------------------|------:|
| Operations/portfolio | Portfolio Heatmap          | `/properties` + `/occupancies` + `/workitems` (open-count)      | 3 |
| Risk/triage       | Watchdog List                 | `/workitems`(critical) + `/compliance/gaps` + `/predictive-flags` | 3 |
| Finance           | Financial Quick-viz           | `/forecast` + `/invoices` + `/recurring-charges`                | 3 |
| Compliance        | Compliance Calendar           | `/compliance` (due dates) + `/inspections`                      | 3 |
| Ops/AI            | AI Agent Log                  | `/audit`                                                        | 3 |
| Ops               | Active Workitems              | `/workitems`                                                    | 3 |
| Cross-domain      | Cross-Domain Snapshots        | composed counts (workitems/compliance/legal/incidents)          | 3 |
| Compliance        | Compliance panel              | `/compliance` + `/compliance/gaps` + `/inspections`             | 5 |
| Litigation/legal  | Matter tracker                | `/legal-issues` (status/deadlines)                              | 5 |
| Maintenance       | Work-order queue              | `/workitems`(maintenance) + `/maintenance/sla-report`           | 6 |
| Lease mgmt        | Lease expirations             | `/leases` + `/leasing/alerts`                                   | 6 |
| Vendors           | Vendor/contract status        | `/vendor-associations` + `/reporting/vendor-compliance-rollup`  | 6 |
| Finance           | NOI / delinquency / budget    | `/forecast` + `/invoices` + `/recurring-charges`                | 7 |
| Risk              | Risk register                 | `/incidents` + `/insurance-policies` + `/insurance/folioguard-rollup` | 7 |
| HR                | HR snapshot                   | **MOCK (no HR endpoint)** — labeled `{ mock: true }`            | 8 |
| Research          | Research feed                 | `callLlm` (per-user LLM via `useIntegrations`); graceful no-LLM | 8 |

---

## 3. Approach decisions (full rationale in DASH_DECISIONS.md)

- **DASH-D1 — EXTEND AstraDashboard.** Confirmed by audit; the panels + CSS + tab shell already exist.
- **DASH-D2 — Composability via a NEW `dashboardLayoutStore`** (per-user dynamic key
  `qualia_dashboard_panels_${user.id}` via `createLocalStorageStore`), NOT `savedLayoutsStore`.
  Rationale: `savedLayoutsStore` persists OS-window positions; repurposing it would entangle
  dashboard-internal panel composition with the desktop window system. A dedicated, isolated store is
  **more reversible** (delete one file + one import to back out) and mirrors the proven
  `savedLayoutsStore`/`fileExplorerStore` shape. Stores `{ visiblePanelIds: string[]; order: string[] }`.
- **DASH-D3 — Data via a new `dashboardData.ts`** that composes existing `strataGet`/React Query hooks.
  Each fetcher returns a typed shape; endpoints with no real source return `{ mock: true, ... }`.
  Unit-tested with mocked `strataApi`. No fetch logic duplicated.
- **DASH-D4 — Drill-down via `dwellium:open-widget` → `strata-dashboard`** (mirrors `workspaceScribe`;
  injectable dep for testability). Module-target deep-link deferred.
- **DASH-D5 — Mock labeling:** any panel without a real endpoint renders a visible "Sample data"
  badge and carries `mock: true` in its data shape.

---

## 4. Cycle sequence (this arc)

1. ✅ **Audit + plan** (this doc) — docs-only.
2. **Panel data layer** — `dashboardData.ts` + test. Typed fetchers over existing endpoints; `{mock:true}` where none.
3. **Wire existing sections to real data** — replace 9 empty arrays with Cycle-2 fetchers + loading/empty/error states.
4. **Composable panel grid + per-user persistence** — `dashboardLayoutStore`; add/remove/reorder panels; test.
5. **Compliance + Legal/Litigation panels** — calendar of filings/inspections/certs + matter tracker; drill-down.
6. **Operations panels** — maintenance queue + lease expirations + vendor status; filter + drill-down each.
7. **Finance + Risk panels** — NOI/delinquency/budget snapshot (date-range filter) + risk register.
8. **HR + Research panels** — HR (mock-labeled) + LLM research feed (graceful no-LLM).
9. **Interactivity + a11y + polish** — global portfolio/date filters, consistent loading/empty/error UI, WCAG AA labels, keyboard nav.
10. **Closure** — `DASH_CLOSURE.md`, fresh full gate, `ALL_DONE`.

## 5. Risks / open questions
- **Endpoint response shapes** vary (some return `T[]`, some `{ data: T[] }`, some bespoke). Cycle 2
  fetchers must normalize defensively (mirror `Property[] | { data: Property[] }` handling seen in modules).
- **Strict gate cost:** every source-touching cycle runs tsc + vitest + 2 builds + PII + SSR smoke
  (`SMOKE_TEST_PORT=3458`). Budget ~one cycle per iteration; split big cycles.
- **SSR safety:** new store uses the SSR-safe factory; new components must avoid init-time browser
  globals (per repo Per-provider-SSR-safety taxonomy).
- **vitest baseline = 385 passed / 51 files.** Higher count after added tests = good; note delta.
