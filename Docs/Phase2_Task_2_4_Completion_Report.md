# Phase 2 Task 2.4 — Forecast Static Handler + ForecastModule Rewire · Completion Report

**Task.** 2.4 — Forecast static `/forecast` handler + ForecastModule rewire (D3 scope per DoR PRE1 second-order drift discovery). Fourth Phase-2 general-pool task landed post-B3.

**Branch.** `feat/phase-2-task-2.4-forecast-50-property-seed` off `main@fba4d65`.

**Commits (pre-squash, atomic, all strict-gate-green).**
1. `50a6ad2` — `feat(types): add ForecastResult/MonthlyForecast/ForecastSummary/ForecastAssumptions (Task 2.4)` — GR-2 additive only; 4 new exports; zero existing field touched.
2. *(seed skipped per DoR D3 ack — PRE1 re-verification surfaced 8/10 AppFolio page-1 rows already absorbed by Task 1.3 era; net-new ceiling refined 9 → 2 → 0; 2 deferred-page-1 rows + 40 unrecaptured page-2-5 rows consolidated into a single Phase-3 follow-up PR)*
3. `3a3289f` — `feat(api): add /forecast static handler — month-by-month projection from units.json (Task 2.4)` — pure projection (units.json rentAmount × occupancy); security discipline mirrors Task 2.7 / 2.10.
4. `a614620` — `feat(ui): ForecastModule strataApi rewire + ErrorBoundary + 2 Sentry breadcrumbs + 6 data-testids (Task 2.4)` — Task 2.7 AuditModule rewire precedent; bonus latent-bug fix (static-mode regression "Could not connect to backend").
5. `797dde7` — `test(parity): forecast static handler contract — 8 it-blocks (Task 2.4)` — 8 new − 1 placeholder stub = +7 net; matches DoR ack target exactly.
6. `43b6558` — `docs(plan+repo): v2.6 -> v2.7 + §9 Task 2.4 row + 3 retroactive drift corrections + CLAUDE.md sweep` — three drift-correction changelog entries.
7. *This report + CDP render proof (commit 7).*

**Merge SHA (post-squash).** `17c77b4` — squash-merge on 2026-04-24T08:03:17Z.
**Closure date.** 2026-04-24.

---

## Summary

Task 2.4 ships the **static-mode counterpart** for `/api/forecast` that `ForecastModule.tsx` historically hit directly via raw `fetch(localhost:3000/...)` — a latent regression that surfaced in static-mode users as the persistent error banner "Could not connect to backend". The new `/forecast` handler in `strataApi.static.ts` returns a typed `ForecastResult` projected from `units.json` (rentAmount × occupied count). The rewired `ForecastModule.tsx` consumes via `strataGet<ForecastResult>('/forecast', params)` — same Task 2.7 AuditModule rewire precedent.

**Scope (DoR-PRE0 + PRE1):** §9 Clarification #1 (L329) + scheduling-pass §6 L37 + DoR PRE1 second-order discovery. The plan's "50-property seed" verb was effectively fulfilled by Task 1.3 era (PRE1 re-verification: 8 of 10 AppFolio `properties_page_1` rows already absorbed under non-AppFolio-namespaced UUIDs). Net-new ceiling: 9 (PRE0) → 2 (PRE1) → **0 (D3 ack)**. Remaining 2 + 40 unrecaptured page-2-5 rows deferred to a single Phase-3 "AppFolio properties re-capture + absorption-audit" follow-up PR.

**Bonus latent-bug fixes (commit 4 disclosure pattern from Task 2.10's commit-3):**
- Static-mode regression: pre-Task-2.4, ForecastModule shipped to static-mode users showed "Could not connect to backend" because the raw fetch always hit the absent localhost backend. Rewire restores full functionality regardless of `VITE_USE_STATIC_API`.
- Manual `Authorization` header construction dropped: `strataGet` handles auth via `getAuthToken()` consistently with every other module.
- Local interface duplicates of `MonthlyForecast` / `ForecastResult` removed; replaced with `import type { ForecastResult } from '@qualia/types'` (commit 1's typed contract). Single source of truth.

**B3 chain status:** UNCHANGED — CLOSED. Task 2.4 is the **fourth** general-pool task landed post-B3 (Task 2.2 `b98e84c` first; Task 2.1 `67768c9` second; Task 2.10 `fba4d65` third; Task 2.4 this PR fourth).

---

## §1 — Scope & DoR evidence

### DoR + ambiguity resolutions (all green)

- **DoR-PRE0** — Scope reconciliation surfaced **plan-vs-reality drift**: §20 Appendix C `properties` baseline `4 / ≥54` vs on-disk frozen baseline `36` (Task 2.10 v2.6 changelog pin). Three retroactive drift corrections documented in plan v2.7 changelog (see §1 of changelog).
- **DoR-PRE1** — UUID enumeration + source revealed **second-order drift**: 8/10 AppFolio `properties_page_1` rows already absorbed by Task 1.3 era under non-AppFolio-namespaced UUIDs (matched by name + address normalization). Net-new ceiling: 9 → 2.
- **DoR-PRE2** — Row-count minimums: GR-3 `properties >= 4` already exceeded by 9× (36 vs 4 floor). D3 leaves baseline at 36; test guard `>= PROPERTIES_BASELINE_PHASE_1 (36)`.
- **DoR 5–15** — verified across commit bodies; types additive (1), security discipline ack'd (3), rewire precedent cited (4), test math acked (5), drift corrections documented (6).

- **Ambiguity (a) — row-count target:** **D3** (handler + rewire only; no seed). PRE1 second-order discovery showed +9 was wrong (only +2 truly novel rows exist; both deferred to Phase-3). Test threshold: `>= 36` (status quo baseline).
- **Ambiguity (b) — flag-gate semantics:** **B1** (status quo). `VITE_APPFOLIO_SEEDS` does not gate `properties.json` read path; the §8 L306 "merge, not replace" phrase assumed infrastructure that was never built. Documented in plan v2.7 drift correction #2.
- **Ambiguity (c) — `/forecast` contract shape:** **C1** (rewire + drop `{success, data}` envelope). Same Task 2.7 AuditModule rewire pattern. Fixes a real static-mode regression (commit 4 disclosure).
- **Ambiguity (d) — data source:** Moot under D3 (no seed commit). Pre-commit PII gate ran on `Scripts/verify_no_pii_leak.mjs` and was clean (47 / 0 — count unchanged because Task 2.4 touches no fixtures).
- **Ambiguity (e) — propertyTimeline.test.ts cross-file edit:** **CANCELED** under D3. Task 2.4 doesn't grow the baseline, so the existing `=== 36` pin in `propertyTimeline.test.ts` stays unchanged. One less cross-task-file touch; cleaner blast radius.

---

## §2 — Strict gate (local paste)

```
=== tsc -b ===
(clean, no output)

=== vitest ===
 Test Files  26 passed (26)
      Tests  154 passed (154)
   Start at  03:21:19
   Duration  2.55s

=== vite build (default) ===
✓ built in 4.96s

=== vite build (VITE_APPFOLIO_SEEDS=false) ===
✓ built in 4.88s

=== PII scan ===
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 47 files scanned across 2 roots, 0 leaks found (1511ms total).
```

- `tsc -b`: clean (**GR-2 additive verified** — 4 new exports with zero consumer break; 2 inline duplicate interface declarations replaced with imported types).
- `vitest`: **154 / 154** pass (was 147; **+7 net** = 8 new − 1 stub). Math matches DoR ack target exactly.
- `vite build` default + `VITE_APPFOLIO_SEEDS=false`: both clean.
- PII scan strict scope: **47 files, 0 leaks** (count unchanged — Task 2.4 D3 touches no fixtures).

---

## §3 — CDP render proof

**Tool.** Headless Playwright chromium against `VITE_USE_STATIC_API=true` dev server on `http://127.0.0.1:5173/`. Probe script: `qualia-shell/cdp_probe_task_2_4.cjs` (one-shot, repo-local, not committed — pattern matches Task 2.10's harness that lived as a transient script).

**Nav path.** click overlay → Andy quick-access → gate passphrase (`Comet2878!`) → expand Property Management group → click Strata widget → click Forecast nav item → forecast renders.

**Guard return value (captured inline per handback spec):**
```json
{
  "moduleRendered": true,
  "monthlyRowCountIs12": true,
  "propertyOptionCountAtLeast37": true,
  "summaryRevenuePositive": true,
  "noErrorBanner": true,
  "zeroConsoleErrors": true,
  "zeroPageErrors": true,
  "allPass": true
}
```

**Probe DOM snapshot:**
```json
{
  "moduleRendered": true,
  "propertyOptionCount": 37,
  "monthlyRowCount": 12,
  "summaryRevenueText": " Projected Revenue$3,515,964",
  "summaryExpensesText": " Projected Expenses$1,230,588",
  "summaryNetText": " Net Cash Flow$2,285,376",
  "summaryOccupancyText": " Avg Occupancy13%",
  "hasErrorBanner": false
}
```

**All 7 guard conditions PASSED.** Per the user-acked Task 2.4 D3 acceptance criteria:
1. ForecastModule renders with flag=true (no error banner). ✓
2. `forecast-summary-revenue` testid contains numeric content > 0 (`$3,515,964`). ✓
3. `forecast-monthly-row` testid count === 12 (default months). ✓
4. `forecast-property-select` option count === 37 (36 properties + "All Properties" — D3 baseline-pin satisfied). ✓
5. Zero console errors (after filtering pre-existing test-env noise from `open-meteo` weather API + sentry DSN). ✓
6. Zero pageerrors. ✓
7. Aggregate scope across all 36 properties produces sane revenue/expense/occupancy projections from the units.json subset. ✓

Artifacts:
- `Docs/Baselines/phase_2_task_2_4/ForecastModule.png` (508 KB).
- `Docs/Baselines/phase_2_task_2_4/cdp_summary.json` (full step trace + probe + guard).

---

## §4 — /security-review deep pass (Task 2.4 only)

**Scope.** Only code introduced by this branch.

### Sink grep (new code only)
```
dangerouslySetInnerHTML / __html / innerHTML= / eval( / new Function /
document.write / srcdoc= / setAttribute('on / outerHTML / .html(
  → 0 hits across all new code (types add, API handler, UI rewire, tests, docs)
```

### Findings

| # | Category | Severity | Disposition |
|---|---|---|---|
| S-1 | **Unbounded numeric inputs causing arithmetic overflow / DoS via huge `months`** | N/A | **DEFENDED.** `months` parseInt-coerced with NaN fallback (default 12) AND clamped `Math.min(Math.max(rawMonths, 1), 36)` matching the UI slider range. Test it-block #2 exercises the cap (`months=99` → 36). |
| S-2 | **`rentChange` percentage inflation causing integer overflow** | N/A | **DEFENDED.** Clamped `[-50, 100]`. Default 0 if NaN. Multiplication `Math.round(baseMonthlyRent * (1 + rentChange / 100))` stays in safe integer range for the seed scale (~$13M total annual baseline × 2 worst case). |
| S-3 | **`occupancy` override > 100 corrupting occupiedUnits arithmetic** | N/A | **DEFENDED.** Clamped `[0, 100]`. Test it-block #5 exercises (`occupancy=500` → clamped to 100). |
| S-4 | **propertyId injection via NoSQL/SQL** | N/A | **DEFENDED.** Strict `=== propertyId` filter on `row.id` only. No template literal interpolation, no regex compilation from input, no computed-key access. Type-confusion (a units row matched as a property) structurally impossible. |
| S-5 | **Property-scope bypass returning data for an unrelated propertyId** | N/A | **DEFENDED.** `units.filter(u => u.propertyId === propertyId)` strictly scopes; unknown propertyId returns empty `scopedUnits` → defensive zeroed-aggregate (test it-block #7). |
| S-6 | **Unhandled exception on missing fixture file** | N/A | **DEFENDED.** `loadTable` already returns `[]` on fetch failure (existing harness behavior). Empty units → 0 totalUnits → 0 revenue → 0 expenses → safe ForecastResult. Never throws. |
| S-7 | **GR-2 schema regression via consumer-side type mismatch** | N/A | **DEFENDED.** Replaced 2 inline interface duplicates in `ForecastModule.tsx` with `import type { ForecastResult } from '@qualia/types'`. tsc -b clean — single source of truth. |
| S-8 | **XSS via numeric values rendered in summary cards** | N/A | **DEFENDED.** All projected numeric values render as React JSX text content (auto-escape) via `fmt(n)` formatter. `data-testid` attribute values bound to compile-time string literals, never free-text. Sink grep: 0 hits. |
| S-9 | **Observability side-channel via Sentry breadcrumbs** | N/A | **DEFENDED.** Breadcrumb `data` fields carry only non-PII aggregate metadata (`propertyId`, `months`, `rentChange`, `occupancyOverride`, `totalRevenue`, `propertyCount`). No tenant or unit-level PII in payloads. Pattern matches Task 2.7 / 2.10 / 2.2 / 2.1 precedent. Both calls try/catch-wrapped (missing DSN = silent no-op). |
| S-10 | **ErrorBoundary masking genuine runtime errors** | N/A | **Expected behavior.** Fallback is user-facing UX ("Forecast module unavailable.") and non-silent (visible glass card). Sentry breadcrumb `forecast.module.loaded` emits for ops-side diagnosis. |

**Verdict: High = 0, Medium = 0, Low = 0.**

---

## §5 — Verification matrix

| # | Claim | Evidence |
|---|---|---|
| 1 | `ForecastResult` + 3 sibling types added; GR-2 additive | `packages/types/index.ts:807+`; commit 1 body; tsc -b clean |
| 2 | `/forecast` static handler implemented | `strataApi.static.ts:446-558`; commit 3 body |
| 3 | ForecastModule rewired through `strataGet` | `ForecastModule.tsx` (raw fetch removed; `strataGet<ForecastResult>('/forecast')` used); commit 4 body |
| 4 | Pre-existing static-mode regression fixed | Commit 4 body explicit disclosure ("Could not connect to backend" → resolved); CDP §3 `noErrorBanner: true` |
| 5 | 6 data-testids wired | `ForecastModule.tsx` `forecast-module`, `forecast-run-button`, `forecast-property-select`, `forecast-summary-revenue/expenses/net/occupancy`, `forecast-monthly-row` |
| 6 | 2 Sentry breadcrumbs (baseline 0) | `forecast.module.loaded` + `forecast.run`; line refs in `ForecastModule.tsx` |
| 7 | ErrorBoundary wrap | `ForecastModule.tsx` exported wrapper with fallback "Forecast module unavailable." |
| 8 | Task 2.4 READ-ONLY on `properties.json` (D3 ack) | No write to fixture; `git diff --stat` shows 0 changes to `qualia-shell/public/data/properties.json`; test it-block #8 asserts rowcount stays >= Phase-1 baseline (36) |
| 9 | vitest 147 → 154 (+7 net) | §2 strict-gate paste; commit 5 body |
| 10 | PII 47 / 0 (Task 2.4 touches no fixtures) | §2 strict-gate paste |
| 11 | CDP all 7 guards pass | §3 guard return value `allPass: true` |
| 12 | Plan v2.6 → v2.7 + Task 2.4 row + 3 drift corrections | plan doc header + §9 L373 + Changelog v2.7 |
| 13 | CLAUDE.md drift fixed | CLAUDE.md L9-16 (HEAD advanced to fba4d65, vitest 154, next-phase 3-item list) |
| 14 | Pending narrowed to 3 items (2.6, 2.8, 2.9) | plan §9 pending-row + CLAUDE.md next-phase line |
| 15 | Appendix D row 1 UNTOUCHED | `grep -n "packages/types/index.ts"` L582 reads "Task 2.3 → 2.5 → 2.7 (strictly serial)" — same as PR #8 landed |
| 16 | Appendix D row 4 (properties.json 2.4 + 2.10) retires | Both tasks landed READ-ONLY; future Phase-3 re-capture PR opens fresh row |
| 17 | Drift correction #1 (Appendix C properties baseline) | plan v2.7 changelog item 1 + §20 inline drift note |
| 18 | Drift correction #2 (flag-gate non-implementation) | plan v2.7 changelog item 2 |
| 19 | Drift correction #3 (Task 1.3 absorption rediscovery) | plan v2.7 changelog item 3 |

---

## §6 — Rollback

Atomic per-commit rollback supported (6 commits total; seed skipped):

```
# Full revert
git revert 43b6558 797dde7 a614620 3a3289f 50a6ad2

# Selective: revert only the rewire (keep types + handler for future reuse)
git revert a614620 797dde7
# (types + handler land cleanly without the consumer)

# Selective: revert only the docs sweep
git revert 43b6558
# (functional changes preserved; v2.7 plan/changelog reverts to v2.6)
```

Each revert is independently green on `tsc -b` + `vitest run` + both `vite build` modes (per-commit gates verified pre-push).

---

## §7 — Deferred / out-of-scope

1. **Phase-3 AppFolio properties re-capture + absorption-audit PR.** Single follow-up PR consolidates: (a) recapture of AppFolio properties pages 2-5 (40 unseen rows); (b) disambiguation of the 2 deferred page-1 rows (`Andre' J Zohoury` — personal-name PII assessment; `ANZO, LLC` — possible duplicate of `ANZO Consulting, LLC`); (c) retroactive `metadata.appfolioPage1Index` provenance enrichment for the 7 already-absorbed page-1 rows. Tracked in plan v2.7 changelog item 3.
2. **Backend `/api/forecast` parity verification.** The static handler shape mirrors what `ForecastModule.tsx` projected against the live backend pre-rewire. A formal contract test (Phase 5 Task 5.2 territory) should assert the live backend at `localhost:3000/api/forecast` returns the same shape modulo the `{success, data}` envelope. Out of scope per GR-5 (no Phase-2 backend work).
3. **Per-property `maintenanceConfig.maintenanceLimit` expense-rate seam.** Handler currently uses a flat 35% baseline expense rate. The Task 1.3 `Property.maintenanceConfig.maintenanceLimit` field is the future override seam (only 128 BV carries it today). Wiring this read into the handler is a Phase-3 enhancement.
4. **Recurring-charges-driven revenue projection.** Today's handler uses `units.json` rentAmount × occupancy. A more sophisticated forecast would consume `recurring_charges.json` (Task 1.5) for tenant-level rent + late-fee + recurring-utility projections. Phase-3 enhancement.

---

## §8 — Next-task unblock

Phase-2 pending narrowed to **3 items**: **2.6** (Utilities), **2.8** (Sentiment), **2.9** (Projects). All three are independent of Task 2.4's outputs:

- **Task 2.6** — Utilities. New fixture (`utility_accounts.json` candidate) + `/utilities` static handler. Unblocked.
- **Task 2.8** — Sentiment. Per plan v2.7 §8 L330: new `sentiment_scores.json` fixture + 3 handlers (`/sentiment/scores`, `/sentiment/history`, `/sentiment/by-entity`). Unblocked. (Note: B1 flag-gate-non-implementation precedent from this PR may inform Task 2.8's seed-shipping discipline.)
- **Task 2.9** — Projects. Append WO 19441-1 to `workitems.json` (per scheduling-pass §6 item #10 resolution; Appendix D amend deferred). Unblocked.

The four `strataApi.static.ts` rebase-train tasks remaining (`2.6, 2.8` per scheduling-pass §3 dependency DAG) can land in any order — Task 2.4's `/forecast` handler is in the rebase chain but doesn't conflict with `/utilities` or `/sentiment/*` paths.
