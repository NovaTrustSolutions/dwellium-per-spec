# Phase 4 — Real-Data Fixture Expansion

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §8 (Phase 4 refinements)
**Phase status.** Not started. Blocked on Phase 3 exit gate.
**Budget.** 1-2 days + 0.5 day buffer = 1.5-2.5 days
**Owner.** TBD (data engineer + reviewer)
**Dependencies.** Phase 3 complete; all Phase 1-2 schemas stable.
**Parallelizable?** Yes, with the conflict matrix (Appendix D of parent plan) enforcing `strataApi.static.ts` as owned by Task 4.7 during Phase 4 — other tasks rebase onto 4.7.

---

## §1. Scope

Scale from "one representative record per entity type" (Phase 0 seeds) to "full AppFolio capture" (dozens of tenants, vendors, workorders, properties per type) so demos, screenshots, and internal testing feel populated. All data passes through the derivation script + sanitize pipeline. The feature-flag escape hatch stays intact.

Scope boundaries:

- IN — bulk-load AppFolio captures into seed files; sanitize; re-run fixture derivation; row-count enforcement (GR-3); pre-commit PII hook.
- OUT — any schema addition; any new UI; any backend work; any customer-visible copy.

---

## §2. Definition of Ready

1. Phase 3 exit gate passed.
2. All AppFolio raw captures committed to `AppFolio_Screenshots/data/`.
3. The derivation script (`Scripts/derive_appfolio_fixtures.mjs`) runs clean on Phase 0 captures.
4. Baseline row counts recorded in `Docs/Baselines/2026-04-19_Phase0_fixture_counts.json`.
5. Pre-commit hook + PII scanner from Phase 0.0 Task 0.0.5 is installed locally.

---

## §3. Definition of Done

Per task:

1. GR-3 row count never < baseline; every phase gate checks this.
2. PII-leak scan exit 0 on every commit.
3. `VITE_APPFOLIO_SEEDS=false` build still produces Strata's original mocks (merge-not-replace rule).
4. `vitest / tsc / vite build / playwright` pass.
5. `/security-review` clean.
6. `Docs/Phase4_<task>_Data_Report.md` documenting sources + row counts.

---

## §4. Tasks

### Task 4.1 — Bulk property load (50 → N)

**Goal.** Expand the Forecast and Property list from 50 captured rows to the full AppFolio export set (~200-500 depending on capture breadth).

**Files touched.**

- `AppFolio_Screenshots/data/properties_bulk.json` (existing raw capture — if not present, capture now).
- `Scripts/derive_appfolio_fixtures.mjs` — extend to read `properties_bulk.json`.
- `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/properties.ts` — regenerated.
- `qualia-shell/public/data/properties.json` — mergeable output keyed by AppFolio property ID.

**Merge rule.** Strata's original 4 mocks retained under IDs `strata-001..004`. AppFolio additions keyed `appfolio-{id}`. Never overwrite Strata IDs.

**Verify.**

```
node Scripts/derive_appfolio_fixtures.mjs
node Scripts/check_fixture_rowcounts.mjs
# expect: properties ≥ baseline (4 + N AppFolio)
```

**Rollback.** Revert the commit; derivation script regenerates smaller set on next run.

---

### Task 4.2 — Bulk tenant / occupancy load

**Goal.** Every property has ≥1 occupancy; every occupancy has ≥1 primary tenant; Other Occupants come from AppFolio where captured.

**Files touched.**

- `AppFolio_Screenshots/data/tenants_bulk.json`, `occupancies_bulk.json`.
- `fixtures/appfolioDerived/tenants.ts`, `occupancies.ts` — regenerated.
- `qualia-shell/public/data/tenants.json`, `occupancies.json`.

**Sanitize rule (mandatory).** Every real email → `tenant-{occupancy_id}-{seq}@example.com`. Every real phone → `(555) 555-XXXX`. Script enforces.

**Verify.** Row count ≥ baseline + N; PII scan exit 0.

---

### Task 4.3 — Bulk vendor load

**Files touched.**

- `AppFolio_Screenshots/data/vendors_bulk.json`.
- `fixtures/appfolioDerived/vendors.ts` + `qualia-shell/public/data/entities.json` (vendor subtype rows).

**Verify.** Vendors count ≥ baseline + N.

---

### Task 4.4 — Bulk workitem / workorder load

**Files touched.**

- `AppFolio_Screenshots/data/workorders_bulk.json`.
- `fixtures/appfolioDerived/workorders.ts` + `qualia-shell/public/data/workitems.json`.

**GR-1 check.** Since `Workitem` is shared across protected modules, run the full 5-protected-module snapshot suite after load to confirm no regressions.

**Verify.** WO count ≥ baseline + N; protected-module snapshots pass.

---

### Task 4.5 — Bulk compliance + insurance load

**Files touched.**

- `AppFolio_Screenshots/data/compliance_bulk.json`.
- `fixtures/appfolioDerived/compliance.ts` + `qualia-shell/public/data/compliance.json`.

**Verify.** Compliance rows ≥ baseline + N.

---

### Task 4.6 — Bulk communication load (sanitized)

**Files touched.**

- `AppFolio_Screenshots/data/communications_bulk.json`.
- `fixtures/appfolioDerived/communications.ts` + `qualia-shell/public/data/communications.json`.

**Sanitize rule.** Subject lines may stay; email bodies snipped to ≤200 chars + `"…[truncated for parity fixture]"`; email addresses sanitized per Task 4.2 rule.

**Verify.** PII scan exit 0 — MANDATORY BLOCKER.

---

### Task 4.7 — `strataApi.static.ts` route expansion

**This task owns `strataApi.static.ts` during Phase 4.** All other tasks rebase onto the 4.7 branch.

**Goal.** Ensure every new bulk-loaded fixture has a corresponding GET route handler in the static-api layer so the real app can consume them via the same MSW-style interface as the real backend.

**Files touched.**

- `qualia-shell/src/components/StrataDashboard/strataApi.static.ts` — add/extend handlers for `/properties`, `/tenants`, `/vendors`, `/workitems`, `/communications`, `/occupancies`, `/compliance`, `/fixed-assets`, `/entity-links`, `/projects`, `/showings`.

**Route shape rule.** Each handler returns `{ items: T[], total: number, page: number, pageSize: number }` matching AppFolio's paging shape. Sub-paths support filters via query params.

**Verify.**

```
npx vitest run src/components/StrataDashboard/strataApi.static.test.ts
```

All handlers have at least one unit test.

**Rollback.** `git revert`; routes return empty arrays.

---

### Task 4.8 — Pre-commit PII hook

**Goal.** The `verify_no_pii_leak.mjs` script from Phase 0.0 Task 0.0.5 runs on every commit that touches `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/` or `qualia-shell/public/data/`.

**Files touched.**

- `.husky/pre-commit` (new, or extended).
- `qualia-shell/package.json` — add `"prepare": "husky install"` if not present.

**Behavior.** On commit, run PII scan. If it exits non-zero, abort the commit with the offending line number.

**Verify.** Stage a test change with a real email; commit; confirm abort. Revert.

---

## §5. Verification Matrix

| Check | Target | Evidence |
|---|---|---|
| `tsc -b` = 0 | pass | paste output |
| `vitest run` ≤ baseline | pass | paste output |
| `vite build` both flag states | pass | paste output |
| `playwright test` ≤ baseline | pass | paste output |
| GR-3 row count ≥ baseline | pass | `Docs/Baselines/Phase4_fixture_counts.json` |
| PII-leak scan | exit 0 | pre-commit hook + CI job |
| Pre-commit hook wired | pass | manual "try to commit a leak" rehearsal |
| `VITE_APPFOLIO_SEEDS=false` build produces Strata-only rows | pass | diff of dist output |
| GR-1 protected-module snapshots | pass | post-4.4 verify |
| `/security-review` | no High/Medium | review output |
| Phase report committed | present | `Docs/Phase4_Completion_Report.md` |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-4-1 | PII leak in a bulk load | Med | High | Task 4.8 pre-commit hook; CI job; manual rehearsal test |
| R-4-2 | Row-count regresses on `VITE_APPFOLIO_SEEDS=false` | Low | High | Merge-not-replace rule enforced by derive script; GR-3 gate |
| R-4-3 | Bulk WO change breaks GR-1 protected modules | Med | High | Task 4.4 GR-1 check |
| R-4-4 | Demo performance degrades with 500+ rows | Med | Med | Virtualize any table crossing 200 rows; Lighthouse gate |
| R-4-5 | Parallel tasks conflict on `strataApi.static.ts` | High | Med | Task 4.7 owns the file; others rebase |
| R-4-6 | Fixture derivation non-deterministic | Low | Med | Sort all output by stable ID; diff against prior run |

---

## §7. Rollback Plan

Each of 4.1–4.8 is a discrete PR. Since all changes are additive data (plus merge-not-replace rule), revert order is flexible. `git revert` restores the prior smaller fixture set.

---

## §8. Exit Gate

Phase 4 is complete when:

1. All 8 tasks merged to main.
2. Full suite `vitest / playwright / vite build / tsc` passes per §5.
3. Row-count JSON ≥ Phase 2 counts.
4. Pre-commit hook is live and has been rehearsal-tested.
5. GR-1 protected-module snapshots pass.
6. `Docs/Phase4_Completion_Report.md` committed with pasted evidence + row-count diffs.
7. Ilya verifies "go Phase 5".

---

## §9. Deliverables

- Expanded `appfolioDerived/*.ts` files (10 regenerated).
- Expanded `qualia-shell/public/data/*.json` files (10 regenerated or augmented).
- `strataApi.static.ts` with ~11 route handlers.
- `.husky/pre-commit` with PII scan wired.
- `Docs/Baselines/Phase4_fixture_counts.json`.
- `Docs/Phase4_Completion_Report.md`.

---

## §10. Timeline

| Group | Tasks | Budget | Can parallelize |
|---|---|:-:|:-:|
| A | 4.1 Properties, 4.2 Tenants/Occupancy, 4.3 Vendors | 0.5 day | Yes |
| B | 4.4 Workitems (+ GR-1 smoke), 4.5 Compliance, 4.6 Communication | 0.75 day | Yes |
| C | 4.7 static-api routes | 0.5 day | After A+B |
| D | 4.8 pre-commit hook | 0.25 day | Any time |
| Buffer | — | 0.5 day | — |
| **Total** | **8 tasks** | **2-2.5 days** | |

🧪
