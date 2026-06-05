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

## Iteration 7 — 2026-05-29 — Cycle 7 (Finance + Risk panels) ✅
- Two NEW exec panels wired to real Strata data; existing `finance` Quick-viz untouched (DASH-D7).
- `dashboardData.ts`: + `fetchFinanceSnapshot(deps, months=12, now)` — `/forecast?months=N`
  (NaN-safe + clamped [1,36]; revenue/expenses scale with the window = the date-range filter)
  joined to `/recurring-charges` for booked monthly rent (active = endDate null or ≥ now) +
  AR delinquency (counts only known-unpaid `previousStatus`: late/overdue/unpaid/past_due/
  partial/failed/delinquent — `null`/`PAID` are NOT delinquent so fresh schedules don't
  overstate AR). Returns NOI/revenue/expenses/occupancy + projectedMonthlyRevenue +
  bookedMonthlyRent + budgetVariance + delinquentCount/Amount. + `fetchRiskRegister(deps,
  limit, now)` — `/insurance-policies` (real, 6 seeded) + `/incidents` (empty today →
  degrades): lapsed/expired→high, expiring≤30d→medium, healthy fulfilled/not-required
  filtered out, `required` kept as low; incidents map critical/high→high; sorted by
  severity then soonest date. + exported `riskSeverityRank` helper + `UNPAID_STATUSES`.
  New raw types RecurringChargeRow/InsurancePolicyRow/IncidentRow. Both joined into
  `loadDashboardData` (financeSnapshot default 12mo via EMPTY_FINANCE_SNAPSHOT fallback;
  riskRegister []). `DashboardData` + `+financeSnapshot` + `riskRegister`.
  Source ground truth verified: forecast.summary = {totalRevenue,totalExpenses,totalNet,
  avgOccupancy} (units×rentAmount projection); recurring_charges = 3 rows ($1595 rent,
  previousStatus 1 PAID/2 null); insurance_policies = 6 (enforcementStatus fulfilled/lapsed/
  required/not-required + expirationDate); incidents/incident_logs empty.
- `AstraDashboard.tsx`: `FinancialSnapshotPanel` (3/6/12/24-mo segmented control re-fetches
  via injectable `fetchSnapshot`; 12mo reuses aggregate → no extra first-paint fetch; 5 cards
  NOI/Revenue/Expenses/Budget-vs-Actual/Delinquency w/ trend arrows) + `RiskRegisterPanel`
  (All/High-only filter, severity badge + status, clickable rows → `openStrataModule`). Both
  use shared `.a-finance-cards`/`.a-ops-*` idiom + widened `DrillToStrata` (`DrillModule` now
  +forecast +incidents). Registered in PANEL_META + renderPanel. Local `fmtMoney` (K/M).
- `dashboardLayoutStore.ts`: DEFAULT_LAYOUT center +`financials`, right +`risk`; left
  `[heatmap,finance,domains]` UNCHANGED (layout test asserts its exact order). reconcileLayout
  grafts both onto returning users by construction.
- CSS: + `.a-risk-sev`/`.a-sev-high|medium|low` (mirror `.a-vstatus-*`) + `.a-risk-status` +
  `.a-panel-seg:disabled`.
- Tests: +6 data-layer (riskSeverityRank pin; finance derive+clamp/forward+empty; risk
  surface/filter/sort+empty) + extended loadDashboardData assertion (financeSnapshot zeroed
  on /forecast failure + riskRegister array).
- **GATE 6/6 GREEN:** tsc ✓ · vitest **445 passed / 55 files** (baseline 439/55 → **+6**) ✓ ·
  build seeds=true ✓ · build seeds=false ✓ · PII clean (51 files, 0 leaks) ✓ · SSR smoke PASS
  @ :3458 (200, 5949 B, 0 console errors/warnings, 0 page errors) ✓.
- **Next:** Cycle 8 — HR + Research panels: HR snapshot (mock-labeled, no HR endpoint) +
  Research feed via `callLlm` (per-user LLM, graceful no-LLM state). FULL gate.

## Iteration 8 — 2026-05-29 — Cycle 8 (HR + Research panels) ✅
- Two NEW exec panels: `hr` (right col, after risk) + `research` (center col, after
  financials). DEFAULT_LAYOUT extended; reconcileLayout grafts both onto returning users
  by construction. Left column UNCHANGED (movePanel test pins its order).
- **HR Snapshot (`hr`) — clearly MOCK-labeled** (no HR endpoint exists; Cycle-1 audit):
  `dashboardData.ts::fetchHrSnapshot()` upgraded from all-zero stub → representative
  sample org for a mid-size PM company. NEW types `HrDept` + extended `HrSnapshot`
  (+turnoverRate +departments). 6 departments (Property Mgmt 18/+2, Maintenance&Ops 24/+3,
  Leasing 9/+1, Accounting 7, Legal&Compliance 4/+1, Admin 5) → headcount 67, openRoles 7,
  incidents 2, turnover 12%. Dept headcounts/opens SUM to the top-line totals (honest
  roll-up math even for sample data). Panel `HrSnapshotPanel` (4 stat cards + dept list w/
  open-role pills) carries the existing `<MockBadge/>` ("Sample").
- **Research Feed (`research`) — per-user LLM, graceful no-LLM state:** `ResearchFeedPanel`
  uses `useIntegrations` + `hasActiveLlm` + `callLlm` (mirrors ThoughtWeaver/FactCheck
  pattern). No-LLM → Settings→API Keys call-to-action (no input shown). LLM-ready → free-text
  topic input + 5 quick-pick topic chips (`RESEARCH_TOPICS`) + result card with provider
  disclaimer ("verify before acting"). Pure helpers extracted for testability:
  `buildResearchPrompt(topic)` (trim + whitespace-collapse + exec framing) +
  `RESEARCH_SYSTEM_PROMPT` (concise exec-briefing system prompt) + `RESEARCH_TOPICS`.
  `runLlm` is injectable (defaults to real callLlm router) → testable without timers.
- `AstraDashboard.tsx`: +imports (Users/Sparkles/Search/Settings icons, useIntegrations,
  callLlm/hasActiveLlm, HrSnapshot type). Registered `hr`+`research` in PANEL_META +
  renderPanel. CSS: +`.a-hr-*` (cards/dept list/open pill) + `.a-research-*` (nokey CTA,
  form, topic chips, result card, disclaimer) + `.a-badge-ok` + `.a-sr-only` +
  `.a-panel-state--loading`. Reuses `.a-finance-cards` grid idiom for HR stat cards.
- Tests (+4): HR dept-sum invariant (headcount/openRoles == dept sums; turnover 0-100) +
  buildResearchPrompt (whitespace-collapse + exec framing + nullish-guard) + RESEARCH_TOPICS
  non-empty. Existing `hr: toMatchObject({mock:true})` still green (shape extended, not broken).
- **GATE 6/6 GREEN:** tsc exit 0 ✓ · vitest **449 passed / 55 files** (baseline 445/55 → **+4**) ✓ ·
  build seeds=true (854ms) ✓ · build seeds=false (840ms) ✓ · PII clean (51 files, 0 leaks) ✓ ·
  SSR smoke PASS @ :3458 (200, 5949 B, 0 console errors/warnings, 0 page errors) ✓.
- **Next:** Cycle 9 — Interactivity + a11y + polish: global filters (portfolio/date),
  consistent loading/empty/error UI across panels, WCAG AA control labels, keyboard nav.
  FULL gate.

## Iteration 9 — 2026-05-29 — Cycle 9 (Interactivity + a11y + polish) ✅
- NEW `dashboardFilters.ts` — pure `applyGlobalFilters(data, filters)` narrows EVERY
  list panel at once from a global filter bar, applied centrally BEFORE data reaches the
  panels. Two controls, both default-OFF (no-op = same reference returned → unfiltered
  dashboard byte-identical, fully reversible):
  - **Text quick-filter** (`query`): case-insensitive substring across each panel's
    primary display text. Works on all 13 list panels. Aggregates (financeSnapshot, hr)
    left intact.
  - **"Attention only"** toggle: per-panel needs-attention predicate (priority hot /
    compliance at-risk / overdue / lease ≤30d / vendor flagged / risk high / heatmap
    delinq>5·maint>10·occ<85). No-op for calendar + agent log (no action axis).
  - Helpers `filtersActive` + `visibleRowCount` + `EMPTY_FILTERS` exported.
- `AstraDashboard.tsx`: +`GlobalFilterBar` component (search input + attention toggle +
  live `N of M items` count + Clear; all controls labelled for WCAG 4.1.2). Main component
  threads `filters` state → `applyGlobalFilters(data, filters)` → `filteredData` to panels;
  bar shown on Dashboard tab only.
- **a11y / keyboard nav:** top tab row promoted to WAI-ARIA tablist — `role="tablist"`
  wrapper + `role="tab"` + `aria-selected` + roving `tabIndex` + Arrow/Home/End key nav
  (activation-follows-focus via tabRefs); content = `role="tabpanel"` + `aria-labelledby`.
  Edit/Refresh kept OUTSIDE the tablist. `:focus-visible` accent rings on tabs + filter-bar
  controls. Loading/empty/error UI already unified via `PanelStatus` since Cycle 3.
- **Deferred (logged in DASH_DECISIONS):** true portfolio DROPDOWN (needs shared id↔name
  map the data layer lacks — query covers the honest subset) + global date-range (Financial
  Snapshot owns its own 3/6/12/24-mo horizon). Carried to DASH_CLOSURE.
- CSS: +`.a-filterbar*` (field/input/clearq/toggle/count/clear) + `.a-tablist` +
  `.a-tab:focus-visible`. Reuses existing `--a-*` tokens + `.a-sr-only`.
- Tests (+10, +1 file): `dashboardFilters.test.ts` — EMPTY_FILTERS no-op (same ref) +
  null passthrough + query substring (all panels, case-insensitive) + no-match empties +
  attentionOnly per-panel predicates + no-action-axis no-op + query∧attention compose +
  filtersActive (whitespace-only=false) + visibleRowCount (null=0; 13×2=26; narrows).
- **GATE 6/6 GREEN:** tsc exit 0 ✓ · vitest **459 passed / 56 files** (baseline 449/55 →
  **+10 tests, +1 file**) ✓ · build seeds=true (852ms) ✓ · build seeds=false (763ms) ✓ ·
  PII clean (51 files, 0 leaks) ✓ · SSR smoke PASS @ :3458 (200, 5949 B, 0 console
  errors/warnings, 0 page errors) ✓.
- **Next:** Cycle 10 — CLOSURE: write `DASH_CLOSURE.md` (commit SHAs, panel→source table,
  composability/persistence summary, deferred items incl. portfolio-dropdown + global
  date-range, push commands). Re-run FULL gate at closure HEAD. `touch ALL_DONE`.

## Iteration 10 — 2026-05-29 — Cycle 10 (CLOSURE) ✅ — ARC COMPLETE
- Wrote `Scripts/autorun/DASH_CLOSURE.md`: commit ledger (Cycles 1-9 SHAs 94b237f→2b6f415),
  final 16-row panel→data-source table (15 real / 1 labeled-mock HR), composability +
  per-user persistence summary (`dashboardLayoutStore`, key `qualia_dashboard_panels_${user.id}`),
  interactivity summary (global filter bar + per-panel filters + drill-down + tablist a11y),
  test delta (385/51 base → 459/56 = +74 tests / +5 files), 4 deferred items
  (portfolio dropdown · global date-range · module-target deep-link · /incidents real data),
  push commands (NOT executed).
- **FRESH FULL GATE 6/6 GREEN at closure HEAD** (proof, captured /tmp/dash_gate.log, EXIT=0):
  - `TSC_OK` — tsc -b exit 0 ✓
  - vitest **459 passed / 56 files** ✓ (baseline 385/51 → +74 tests, +5 files)
  - `BUILD_TRUE_OK` (seeds=true) ✓ · `BUILD_FALSE_OK` (seeds=false, 758ms) ✓
  - `PII_OK` — 51 files / 2 roots, 0 leaks ✓
  - `SMOKE_OK` — SSR @ :3458, status 200, 5949 B, 0 console errors, 0 console warnings,
    0 page errors, Result ✓ PASS
- Docs-only cycle (only `Scripts/autorun/**` touched) — gate not source-gated, but re-run
  fresh at closure HEAD per Cycle-10 spec; all 6 stages green.
- **ALL 10 CYCLES DONE. Arc COMPLETE.** `touch Scripts/autorun/ALL_DONE`.
- **Push (Ilya runs, NOT auto-pushed):** `git push -u origin feat/pm-exec-dashboard`
  then open PR → `main`. Zero commits to `main` in this arc.
