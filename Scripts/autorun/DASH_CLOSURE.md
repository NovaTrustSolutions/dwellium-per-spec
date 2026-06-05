# PM-Exec Dashboard arc — CLOSURE (Cycle 10)

**Branch:** `feat/pm-exec-dashboard` (off `feat/ara-stella-inbox-linkage`)
**Closed:** 2026-05-29
**Mandate met:** EXTENDED `src/components/AstraDashboard/AstraDashboard.tsx` into a real,
composable, interactive PM-exec dashboard wired to live Strata data. No parallel dashboard
built. All composition/persistence/bus primitives reused; no fetch logic duplicated.

---

## 1. Commit ledger (this arc, oldest → newest)

| Cycle | SHA | Summary |
|------:|:----|:--------|
| 1 | `94b237f` | Audit + plan — remit→panel→source map, 5 decisions (DASH-D1..D5), 10-cycle sequence (docs-only) |
| 2 | `8bbe9de` | `dashboardData.ts` typed fetchers + 13-test data layer (mocked strataApi) |
| 3 | `8440403` | Wire AstraDashboard's 7 panels to real data + loader hook + loading/empty/error states |
| 4 | `d431568` | Composable panel grid + per-user persistence (`dashboardLayoutStore`) |
| 5 | `2e1df63` | Compliance + Litigation panels with Strata drill-down (+ `62725ff` progress) |
| 6 | `e387b9e` | Operations panels (Maintenance / Leases / Vendors) + filters + drill-down (+ `2497722` progress) |
| 7 | `f81fbcb` | Finance Snapshot (date-range) + Risk Register panels |
| 8 | `a4b7511` | HR Snapshot (mock-labeled) + Research Feed (per-user LLM) panels |
| 9 | `2b6f415` | Global filter bar + WAI-ARIA tablist a11y / keyboard nav |
| 10 | _(this commit)_ | CLOSURE — `DASH_CLOSURE.md` + fresh 6/6 gate + `ALL_DONE` |

Base of arc: `main` HEAD `4cefebf` → first arc commit parent. (The `feat/...` workspace +
ARA arcs that precede `94b237f` in `main..HEAD` belong to earlier autonomous arcs already
closed on this same long-lived feature branch; the PM-exec arc proper begins at `94b237f`.)

---

## 2. Final panel → data-source table

| Remit area | Panel | Data source | Real / Mock |
|:-----------|:------|:------------|:------------|
| Operations/portfolio | Portfolio Heatmap | `/properties` + `/occupancies` + `/workitems` (open-count) | **Real** |
| Risk/triage | Watchdog List | `/workitems`(critical) + `/compliance/gaps` + `/predictive-flags` | **Real** |
| Finance | Financial Quick-viz | `/forecast` + `/invoices` + `/recurring-charges` | **Real** |
| Compliance | Compliance Calendar | `/compliance` (due dates) + `/inspections` | **Real** |
| Ops/AI | AI Agent Log | `/audit` | **Real** |
| Ops | Active Workitems | `/workitems` | **Real** |
| Cross-domain | Cross-Domain Snapshots | composed counts (workitems/compliance/legal/incidents) | **Real** |
| Compliance | Compliance panel | `/compliance` + `/compliance/gaps` + `/inspections` | **Real** |
| Litigation/legal | Matter tracker | `/legal-issues` (status/deadlines/counsel) | **Real** |
| Maintenance | Work-order queue | `/workitems`(maintenance) + `/maintenance/sla-report` | **Real** |
| Lease mgmt | Lease expirations | `/leases` + `/leasing/alerts` | **Real** |
| Vendors | Vendor/contract status | `/vendor-associations` + `/reporting/vendor-compliance-rollup` | **Real** |
| Finance | NOI / delinquency / budget | `/forecast` + `/invoices` + `/recurring-charges` | **Real** |
| Risk | Risk register | `/incidents` + `/insurance-policies` + `/insurance/folioguard-rollup` | **Real** (degrades gracefully when `/incidents` empty) |
| HR | HR snapshot | **No HR endpoint** — `{ mock: true }`, visible "Sample data" badge | **Mock (labeled)** |
| Research | Research feed | `callLlm` (per-user LLM via `useIntegrations`); graceful no-LLM state | **Real LLM / graceful empty** |

15 of 16 panels on real Strata data; HR is the only mock and is explicitly labeled
(`{ mock: true }` + on-screen "Sample data" badge per DASH-D5). All panels share the
unified `PanelStatus` loading / empty / error component (Cycle 3).

---

## 3. Composability + per-user persistence

- **New isolated store** `dashboardLayoutStore` — per-user dynamic key
  `qualia_dashboard_panels_${user.id}` via `createLocalStorageStore` object signature
  (SSR-safe `useSyncExternalStore` shape + `.reset()` test escape-hatch). Stores
  `{ visiblePanelIds, order }`. Deliberately NOT `savedLayoutsStore` (which owns OS-window
  positions) — see DASH-D2; a dedicated store is maximally reversible.
- **Add / remove / reorder** panels via the dashboard Edit mode; `reconcileLayout` drops
  unknown ids by construction, so stored layouts self-heal across panel-set changes and
  back-out cleanly.
- **Persistence is per-user** (Andy ≠ Lisa), loads on login, survives logout — mirrors the
  established `savedLayoutsStore` / `fileExplorerStore` factory pattern.

## 4. Interactivity

- **Global filter bar** (Dashboard tab) — text quick-filter (case-insensitive substring
  across every list panel's primary text) + "Attention only" toggle (per-panel
  needs-attention predicate). Pure `applyGlobalFilters(data, filters)` applied centrally
  BEFORE data reaches panels; both controls default-OFF → same-reference no-op (unfiltered
  view byte-identical = fully reversible). Live `N of M items` count + Clear.
- **Per-panel filters** — Compliance (status), Litigation (status), Maintenance (priority),
  Vendors (compliance flag), Risk (All/High-only), Finance (3/6/12/24-mo date-range).
- **Drill-down** — every panel fires `dwellium:open-widget` → `strata-dashboard` (mirrors
  `workspaceScribe` injectable-dep pattern for testability).
- **a11y / keyboard nav** — top tabs promoted to WAI-ARIA tablist (`role=tablist/tab` +
  `aria-selected` + roving `tabIndex` + Arrow/Home/End nav); content = `role=tabpanel` +
  `aria-labelledby`; `:focus-visible` rings; all controls WCAG 2.0 AA 4.1.2-labelled.

---

## 5. Test delta

- **Branch base (post-ARA arc):** 385 passed / 51 files.
- **Closure HEAD:** 459 passed / 56 files (**+74 tests, +5 files** across the arc).
- New test files: `dashboardData.test.ts` (Cycle 2), plus per-cycle panel/store/filter
  suites (`dashboardLayoutStore`, compliance+litigation, operations, finance+risk,
  `dashboardFilters`).

---

## 6. Deferred items (Ilya-gated; non-blocking)

1. **True portfolio DROPDOWN filter** — heatmap keys properties by display `name`, ops
   panels key by `propertyId`; no shared id↔name map in the data layer. A dropdown would
   silently fail to filter ~half the panels. Honest interim: the global `query` field
   narrows panels that surface a typed property name. Real fix = a Cycle-2-altitude data
   layer change adding a canonical property list (id + name).
2. **Global date-range filter** — date semantics are heterogeneous across panels; the
   Financial Snapshot owns its own 3/6/12/24-mo horizon (the honest home for date-windowing).
3. **Module-targeted deep-link drill-down** — today drill-down opens the Strata window at
   its default module. Jumping straight to e.g. the Compliance module needs a new bus event
   consumed inside `StrataNavContext` (the Strata nav context is window-local; no global
   module-target deep-link bus exists yet).
4. **`/incidents` real data** — Risk Register degrades gracefully (insurance rows only)
   until the incidents endpoint returns data.

---

## 7. Verification at closure HEAD

Fresh FULL gate re-run at closure HEAD — see proof pasted into `DASH_PROGRESS.md`
Iteration 10 entry (tsc / vitest / build×2 / PII / SSR smoke @ :3458).

---

## 8. Push commands (DO NOT auto-push — Ilya runs these)

```bash
# from repo root
git push origin main                          # if any direct-to-main work landed (none in this arc)
git push -u origin feat/pm-exec-dashboard      # push the arc branch + open a PR
```

This arc made **zero** commits to `main`; all work is on `feat/pm-exec-dashboard`.
Open a PR from `feat/pm-exec-dashboard` → `main` for review.
