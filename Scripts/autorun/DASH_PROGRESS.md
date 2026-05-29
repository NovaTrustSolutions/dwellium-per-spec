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
