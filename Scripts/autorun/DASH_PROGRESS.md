# PM-Exec Dashboard — Progress log

Branch: `feat/pm-exec-dashboard` (off `feat/ara-stella-inbox-linkage`)
Baseline at branch base: vitest 385 passed / 51 files.

Legend: ✅ done+committed · 🚧 in progress (continue next iteration) · ⬜ not started

| Cycle | Title | Status |
|------:|-------|--------|
| 1 | Dashboard audit + plan (docs-only) | ✅ |
| 2 | Panel data layer (`dashboardData.ts` + test) | ✅ |
| 3 | Wire existing sections to real data | ⬜ |
| 4 | Composable panel grid + per-user persistence | ⬜ |
| 5 | Compliance + Legal/Litigation panels | ⬜ |
| 6 | Operations: Maintenance + Leases + Vendors | ⬜ |
| 7 | Finance + Risk panels | ⬜ |
| 8 | HR + Research panels | ⬜ |
| 9 | Interactivity + a11y + polish | ⬜ |
| 10 | Closure | ⬜ |

---

## Iteration 1 — 2026-05-29 — Cycle 1 (audit + plan) ✅
- Created branch `feat/pm-exec-dashboard` off `feat/ara-stella-inbox-linkage`.
- Read AstraDashboard.tsx (481 L) + confirmed 9 empty mock arrays + 3-col grid + 5 tabs.
- Read `strataApi.ts`, `useStrataQueries.ts` (9 ready hooks + key factory), static-impl endpoint
  inventory (~35 endpoints; no HR endpoint), `createLocalStorageStore`, `savedLayoutsStore` +
  `dwellium:open-widget` bus + `workspaceScribe.ts` pattern, `StrataNavContext` (drill-down feasibility).
- Wrote `DASH_PLAN.md` (remit→panel→source map, 5 decisions, 10-cycle sequence, risks),
  `DASH_DECISIONS.md` (DASH-D1..D5), this file.
- Key decisions: extend AstraDashboard (D1); new `dashboardLayoutStore` for panel composition over
  reusing savedLayoutsStore — more reversible (D2); new `dashboardData.ts` composing existing fetchers (D3);
  drill-down via open-widget bus (D4); visible mock labels (D5).
- Gate: docs-only cycle → `git status` only (no source touched). Committing.
- **Next:** Cycle 2 — `dashboardData.ts` typed fetchers + unit test with mocked strataApi; FULL gate.

## Iteration 2 — 2026-05-29 — Cycle 2 (panel data layer) ✅
- Created `src/components/AstraDashboard/dashboardData.ts` (~430 L) — typed fetchers composing
  existing `strataGet` endpoints into AstraDashboard's panel shapes. NO fetch logic duplicated;
  one injectable side effect (`deps.get`, defaults to `strataGet`) mirroring `workspaceScribe.ts`.
- Fetchers (feed the 7 real panels): `fetchHeatmap` (/properties+/units+/workitems → occupancy% +
  open-maint count), `fetchWatchdog` (/workitems open∧high-priority, due asc), `fetchFinancialCards`
  (/forecast summary → NOI/revenue/expense/occupancy), `fetchCalendarEvents` (/compliance →
  month-keyed due dates; timezone-stable date-only parsing), `fetchAgentLog` (/audit {entries}),
  `fetchActiveWorkitems` (open, newest-first + age label), `fetchDomainSnapshots` (group-by-domain
  +critical). `fetchHrSnapshot` returns `{ mock: true }` (DASH-D5; no HR endpoint). `loadDashboardData`
  aggregate with per-section failure isolation (Promise-settle → empty section, not whole-dashboard fail).
- `asArray` normalizer handles `T[] | {data} | {entries} | nullish` (Cycle-1 §5 shape-variance risk).
- Created `src/test/appfolioParity/dashboardData.test.ts` (13 tests) — injectable fake `get`, no
  module mock; pins normalizer, occupancy math, watchdog filter+sort, forecast→cards, month filter,
  audit shape, age label, domain grouping, mock label, and per-section failure isolation.
- One fix mid-cycle: date-only `YYYY-MM-DD` compliance dates parsed as UTC-midnight shifted day-of-month
  by TZ → added `parseLocalDate` (local-time construction for date-only strings).
- **GATE 6/6 GREEN:** tsc ✓ · vitest **398 passed / 52 files** (baseline 385/51 → **+13** = exactly the
  new test file) ✓ · build seeds=true ✓ · build seeds=false ✓ · PII clean (51 files, 0 leaks) ✓ ·
  SSR smoke PASS @ :3458 (0 console errors/warnings, 0 page errors) ✓.
- No UI touched this cycle (Cycle 3 wires these fetchers into the panels).
- **Next:** Cycle 3 — replace AstraDashboard's 9 empty mock arrays with the Cycle-2 fetchers via a
  loader hook + loading/empty/error states; keep arbitrage/domain-views labeled mock where no source.

## Iteration 3 — 2026-05-29 — Cycle 3 (wire AstraDashboard sections to real data) ✅
- Created `src/components/AstraDashboard/useDashboardData.ts` — SSR-safe loader hook wrapping
  Cycle-2 `loadDashboardData`. Fetch lives in `useEffect` (effect-time SAFE per repo SSR taxonomy →
  no-op on server, fills in on client). Returns `{ data, loading, error, reload }`; `deps` injectable
  via a ref (excluded from effect deps so an inline-object `deps` can't retrigger fetches); `reload()`
  bumps a nonce to refetch.
- Refactored `AstraDashboard.tsx`: deleted the 7 empty mock arrays (HEATMAP_PROPERTIES, WATCHDOG_ITEMS,
  FINANCIAL_CARDS, CALENDAR_EVENTS, AGENT_LOG, ACTIVE_WORKITEMS, DOMAIN_SNAPSHOTS); made those 7 panels
  prop-driven and added a shared `<PanelStatus>` (loading spinner / error `role=alert` / empty label).
  DashboardContent now calls `useDashboardData()` and threads `data?.<section> ?? []` + loading + error
  into each. Calendar renders its grid whenever not loading/error (empty events = no dots, still useful).
- The 2 panels with NO real source (QuickArbitrage, DomainViews) keep their empty arrays + got a visible
  `<MockBadge>` ("Sample" pill) in their titles (DASH-D5 — clearly label non-live data). HR stays mock
  (not rendered until Cycle 8 HR panel).
- Added topbar Refresh button (dashboard tab only) → `reload()`, `aria-label="Refresh dashboard data"`,
  disabled+spinning while loading (mirrors the 6-instance RefreshCw ghost-button a11y convention).
- CSS: appended `.a-panel-state` (+`--error`/`--empty`), `@keyframes a-panel-spin`, `.a-badge-mock`,
  `.a-tab-refresh` to AstraDashboard.css (uses existing `--a-text-dim`/`--a-accent` vars).
- Added `src/test/appfolioParity/useDashboardData.test.tsx` (3 tests, renderHook + waitFor, REAL clock —
  no fake timers per React-19 scheduler anti-pattern): initial-loading→resolved-populated-sections,
  `reload()` refetch (endpoint-read count doubles), graceful per-section degradation on a throwing `get`.
- **GATE 6/6 GREEN:** tsc ✓ · vitest **401 passed / 53 files** (baseline 398/52 → **+3 / +1 file** = the
  new hook test) ✓ · build seeds=true ✓ · build seeds=false ✓ · PII clean (51 files, 0 leaks) ✓ ·
  SSR smoke PASS @ :3458 (200, 5949 B, 0 console errors/warnings, 0 page errors) ✓.
- **Next:** Cycle 4 — composable panel grid + per-user persistence (add/remove/rearrange panels;
  `dashboardLayoutStore` via `createLocalStorageStore` dynamic per-user key, mirror savedLayoutsStore);
  persist shown-panels + order; add a test. FULL gate.

## Iteration 4 — 2026-05-29 — Cycle 4 (composable panel grid + per-user persistence) ✅
- Created `src/components/AstraDashboard/dashboardLayoutStore.ts` — per-user dynamic-key store
  (`qualia_dashboard_panels_${user.id}`, DASH-D2) via `createLocalStorageStore` object signature,
  mirroring `integrationsStore`/`savedLayoutsStore`. Persists `{ columns: {left,center,right}, hidden }`.
  Exports PURE transforms `reconcileLayout` / `hidePanelIn` / `showPanelIn` / `movePanelIn` (total,
  never-throw) so the store is unit-testable without React. `reconcileLayout` drops unknown ids,
  de-dups (first wins), and grafts known-but-missing ids onto their default column → forward/backward
  schema-drift safe. SSR-safe by construction (`getServerSnapshot` → DEFAULT_LAYOUT; no render-path read).
- Created `src/components/AstraDashboard/useDashboardLayout.ts` — thin React adapter mirroring
  `useIntegrations` exactly: raw `useContext(UserContext)` (degrades to `_anonymous`, no provider throw),
  updates the id holder DURING render before `useSyncExternalStore`, returns `{ layout, hidePanel,
  showPanel, movePanel, replace, reset }`.
- Refactored `AstraDashboard.tsx`: added a `PANEL_META` title map + `renderPanel(id,…)` registry switch
  over the 9 panels; `DashboardContent` now renders `DASHBOARD_COLUMNS.map` from the persisted layout.
  New `<PanelFrame>` wraps each panel; in **edit mode** overlays move (←↑↓→) + hide (×) controls
  (buttons, NOT drag-drop → keyboard-accessible, zero new deps, more reversible — Cycle 9 a11y groundwork).
  Topbar gains an **Edit/Done** toggle (`Settings2`, `aria-pressed`) beside Refresh (dashboard tab only),
  and an "Hidden panels" add-bar (`+ <title>`) appears while editing. Default (non-edit) UX is unchanged.
- CSS: appended `.a-tab-edit`, `.a-panel-frame`, `.a-panel-controls`/`.a-panel-ctrl`(+`--hide`),
  `.a-layout-addbar`(+label/empty/btn), `.a-grid-empty` to AstraDashboard.css (reuses `--a-accent`/
  `--a-text-dim`/`--a-border`).
- Added `src/test/appfolioParity/dashboardLayout.test.ts` (21 tests, pure — no React/fake timers per the
  React-19 scheduler convention; `.reset()` in `beforeEach` per v2.72.1): pins reconcile (seed/drop/
  de-dup/graft/garbage), hide/show round-trip, move up/down/left/right + all no-op edges + universe
  preservation, and store SSR/persistence/per-user-isolation(Andy≠Lisa)/corrupt-JSON/reset.
- **GATE 6/6 GREEN:** tsc ✓ · vitest **422 passed / 54 files** (baseline 401/53 → **+21 / +1 file** = the
  new layout test) ✓ · build seeds=true ✓ · build seeds=false ✓ · PII clean (51 files, 0 leaks) ✓ ·
  SSR smoke PASS @ :3458 (200, 5949 B, 0 console errors/warnings, 0 page errors) ✓.
- **Next:** Cycle 5 — Compliance + Legal/Litigation panels: compliance calendar (filings/inspections/
  certs/due dates) + litigation matter tracker (status/deadlines/counsel) from ComplianceEngine/
  LegalModule data; drill-down opens the relevant module via `dwellium:open-widget`. FULL gate.

## Iteration 5 — 2026-05-29 — Cycle 5 (Compliance + Litigation panels + Strata drill-down) ✅
- **Commit `2e1df63`.** Two new exec panels wired to real Strata data + module-target drill-down.
- `dashboardData.ts`: + `fetchComplianceItems` (`/compliance`, urgency-ranked expired→missing→
  warning→scheduled→tracked→valid then soonest expiry; `daysUntil` + synthetic ids when a row lacks
  one) + `fetchLegalMatters` (`/workitems` domain=legal, open-only, earliest-deadline-first, counsel
  = `assignedTo`, client-side domain re-filter so static/param-blind mode stays correct). Both joined
  into `loadDashboardData` (existing per-section settle/[] isolation). + `complianceStatusRank` /
  `daysUntil` exported helpers. Extended `ComplianceRow` (+id,+entityName) + `WorkitemRow` (+assignedTo).
- `strataDeepLink.ts` (NEW, DASH-D6): `openStrataModule(module, deps?)` stages a module-level holder
  `pendingStrataModule` (cold-open) + fires `dwellium:open-widget` for `strata-dashboard` + emits a
  `dwellium:strata-module` CustomEvent (warm-focus). Pure + injectable (mirrors araLinkage/
  workspaceScribe). `consumePendingStrataModule` reads-and-clears (idempotent, StrictMode-safe).
- `StrataDashboard.tsx`: ONE additive mount `useEffect` — consumes the holder on mount (cold lands on
  the deep-linked module, not overview) + listens for `dwellium:strata-module` (warm). ~8 lines; fully
  removable. No bus-contract change.
- `AstraDashboard.tsx`: `ComplianceTracker` + `LitigationTracker` panels (status badges, overdue/
  due-soon tones, clickable rows → `openStrataModule`, "Open in Strata" header button via
  `DrillToStrata`). Registered in `PANEL_META` + `renderPanel`. `DEFAULT_LAYOUT` grows `litigation`
  (center) + `compliance` (right) — `reconcileLayout` grafts them onto returning users' stored layouts
  by construction (schema-drift safe; existing layout test passes unchanged — it reads DEFAULT_LAYOUT
  dynamically). CSS appended (rows/status/due + focus-visible rings).
- Tests: +6 data-layer (`dashboardData.test.ts`: rank, daysUntil, compliance sort+limit+synthetic-id,
  legal filter+sort+counsel-fallback) + 3 new `strataDeepLink.test.ts` (injected deps, consume
  idempotency, real default-emit dispatch).
- **GATE 6/6 GREEN:** tsc ✓ · vitest **431 passed / 55 files** (baseline 422/54 → **+9 / +1 file**) ✓ ·
  build seeds=true ✓ · build seeds=false ✓ · PII clean (51 files, 0 leaks) ✓ · SSR smoke PASS @ :3458
  (200, 5949 B, 0 console errors/warnings, 0 page errors) ✓.
- **Next:** Cycle 6 — Operations panels: Maintenance work-order queue + Lease-expirations + Vendor/
  contract status, each from the existing modules' data with a filter + drill-down handoff (reuse
  `openStrataModule('maintenance'|'leasing'|'vendors')`). FULL gate.

## Iteration 6 — 2026-05-29 — Cycle 6 (Operations panels: Maintenance + Leases + Vendors) ✅
- **Commit `e387b9e`.** Three new exec operations panels wired to real Strata data + filter + drill-down.
- `dashboardData.ts`: + `fetchMaintenanceQueue` (`/workitems` domain=maintenance, open-only, priority-rank
  then soonest-due; client-side domain re-filter so static/param-blind mode stays correct; +age label)
  + `fetchLeaseExpirations` (`/units` with `leaseEnd`, soonest-first incl. expired holdovers at top,
  tenant fallback `—`, synthetic `unit-${i}` id, `daysUntil`) + `fetchVendorStatus`
  (`/vendor-associations` joined to `/entities`?type=vendor name map; suspended/expired/terminated/pending
  first via `vendorStatusRank`, then soonest contract end; raw-id fallback when no name join). All three
  joined into `loadDashboardData` (existing per-section settle/[] isolation). + exported
  `workitemPriorityRank` (critical<urgent<high<medium/normal<low) + `vendorStatusRank` helpers.
  Extended `UnitRow` (+id,+unitNumber,+currentTenantId,+leaseEnd) + new `VendorAssociationRow` /
  `VendorEntityRow` raw types. Source ground truth verified: workitems maintenance = `domain:'maintenance'`
  (type `work_order`, 382 rows) NOT `type:'maintenance'`; units carry `leaseEnd` (31 dated / 187 occupied);
  vendor_associations (1 seeded row) joins to entities `entityType:'vendor'` (3218) by `vendorId`.
- `AstraDashboard.tsx`: `MaintenanceQueue` (priority All/Urgent toggle), `LeaseExpirations` (30/60/90/All
  segmented window, default 90), `VendorStatusPanel` (All/Needs-attention toggle) — shared `.a-ops-*` row
  idiom mirroring Cycle-5 trackers; status/priority badges, clickable rows → `openStrataModule`, "Open"
  header button via widened `DrillToStrata` (`DrillModule` now compliance|legal|maintenance|leasing|vendors).
  Registered in `PANEL_META` + `renderPanel`. Each filter is panel-local `useState` (no store coupling).
- `dashboardLayoutStore.ts`: `DEFAULT_LAYOUT` grows `maintenance`+`leases` (center) + `vendors` (right);
  `reconcileLayout` grafts them onto returning users' stored layouts by construction (schema-drift safe).
  Left column kept `[heatmap, finance, domains]` UNCHANGED — layout test asserts its exact order at
  movePanelIn up/down. Existing dashboardLayout test passes unchanged (reads DEFAULT_LAYOUT dynamically).
- CSS appended (~150 L): `.a-ops-list/row/title/age/due/arrow`, `.a-lease-unit` chip, `.a-vendor-status` +
  `.a-vstatus-*` tones, `.a-panel-filter`(--on) toggle, `.a-panel-segctl/.a-panel-seg`(--on) segmented
  control, all with focus-visible rings (Cycle-9 a11y groundwork).
- Tests: +8 data-layer (`dashboardData.test.ts`: rank-helper pinning ×2, maintenance sort+filter+age+empty,
  lease sort+tenant-fallback+empty, vendor name-join+suspended-first+raw-id-fallback+empty).
- **GATE 6/6 GREEN:** tsc ✓ · vitest **439 passed / 55 files** (baseline 431/55 → **+8**) ✓ · build
  seeds=true ✓ · build seeds=false ✓ · PII clean (51 files, 0 leaks) ✓ · SSR smoke PASS @ :3458
  (200, 5949 B, 0 console errors/warnings, 0 page errors) ✓.
- **Next:** Cycle 7 — Finance + Risk panels: NOI/delinquencies/budget-vs-actual snapshot (Forecast/
  Accounting) + a risk register (Incident/Insurance). Date-range filter on finance. FULL gate.
