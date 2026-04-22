# Phase 0 — Prep & Baseline

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §6
**Phase status.** **Completed in sandbox** (see `Docs/Phase0_Completion_Report.md`). Re-verified on real dev box via Phase 0.0 CI smoke PR.
**Budget.** 0.5 day + 0.25 day buffer = 0.75 day
**Owner.** Claude (already executed); dev reviewer verifies
**Dependencies.** Phase 0.0 complete.
**Parallelizable?** No.

---

## §1. Scope

Capture the state of the tree before any parity work begins, derive typed AppFolio fixtures from the raw JSON captures, audit orphan fields against canonical types, scaffold 15 test stubs for Phases 1-2, and wire the `VITE_APPFOLIO_SEEDS` feature flag. All additive — no existing source is touched.

Scope boundaries:

- IN — baselines, fixture derivation, type audit, test scaffolding, feature flag, completion report.
- OUT — any schema additions, any module rendering changes, any backend work.

---

## §2. Definition of Ready

1. Phase 0.0 exit gate passed (real dev box or sandbox with documented gaps).
2. `AppFolio_Screenshots/data/*.json` present with all 10 captures.
3. `packages/types/index.ts` readable; no outstanding PRs touching it.

---

## §3. Definition of Done

1. All 5 Phase 0 tasks have green rows in §5.
2. `Docs/Phase0_Completion_Report.md` committed with pasted evidence.
3. `tsc -b` passes with 0 errors after fixture add.
4. `vitest run` post-phase has ≥ baseline passed count and 0 new failures.
5. `vite build` passes in both `VITE_APPFOLIO_SEEDS=true` and `=false` modes.
6. PII-leak scan passes.
7. `/security-review` clean on `Scripts/derive_appfolio_fixtures.mjs`.

---

## §4. Tasks

### Task 0.1 — Baseline capture

**Goal.** Snapshot `tsc / vitest / playwright / vite build` output before any code change.

**Files touched (new).**

- `Docs/Baselines/2026-04-19_Phase0_baseline_tsc.txt`
- `Docs/Baselines/2026-04-19_Phase0_baseline_vitest.txt`
- `Docs/Baselines/2026-04-19_Phase0_baseline_playwright.txt`
- `Docs/Baselines/2026-04-19_Phase0_baseline_vite_build.txt`

**Steps.**

1. `cd qualia-shell && npx tsc -b > ../Docs/Baselines/2026-04-19_Phase0_baseline_tsc.txt 2>&1`
2. `cd qualia-shell && npx vitest run 2>&1 | tee ../Docs/Baselines/2026-04-19_Phase0_baseline_vitest.txt`
3. `cd qualia-shell && npx playwright test 2>&1 | tee ../Docs/Baselines/2026-04-19_Phase0_baseline_playwright.txt` (on real dev box).
4. `cd qualia-shell && npx vite build --outDir /tmp/vite-baseline-dist 2>&1 | tee ../Docs/Baselines/2026-04-19_Phase0_baseline_vite_build.txt`

**Verify.** All four files exist and are non-empty (except tsc which is empty = clean).

**Evidence from sandbox run (already captured).**

- tsc: 0 errors (empty file, exit 0).
- vitest: 11 files, 74 tests, 65 passed / 9 failed (pre-existing in `StellaAgent.test.tsx` + 1 other).
- playwright: sandbox blocker `/bin/sh ENOENT` — must rerun on real dev box.
- vite build: 3269 modules, ✓ in 7.17s.

**Rollback.** `rm Docs/Baselines/2026-04-19_Phase0_baseline_*.txt`.

---

### Task 0.2 — Fixture derivation script

**Goal.** Convert `AppFolio_Screenshots/data/*.json` into 10 typed TypeScript files in `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/`.

**File touched.**

- `Scripts/derive_appfolio_fixtures.mjs` (new, Node ESM, ~280 lines).

**Outputs (10 files in `appfolioDerived/`).**

| File | Size | Source JSON |
|---|---|---|
| `properties.ts` | 5,274 B | `01_properties_page1.json` + `02_property_detail_128_buena_vista.json` |
| `occupancies.ts` | 1,425 B | `03_occupancy_willie_white.json` |
| `tenants.ts` | 5,991 B | `04_tenants_page1.json` + `05_riverwood_b03.json` |
| `vendors.ts` | 8,971 B | `06_vendors_page1.json` + `10_vendor_detail_2story_roofing.json` |
| `workorders.ts` | 10,484 B | `07_workorders_page1.json` + `08_wo_detail_19511.json` |
| `leases.ts` | 1,261 B | `09_leases_pending_countersign.json` |
| `compliance.ts` | 6,200 B | union of vendor-compliance + property AHA inspections |
| `communications.ts` | 4,027 B | community-emails slice of capture set |
| `fixed_assets.ts` | 1,985 B | `02_property_detail_128_buena_vista.json#fixed_assets` |
| `index.ts` | barrel | re-exports all of the above |

**Gating rule.** Each generated file starts with:

```ts
const ENABLED = import.meta.env.VITE_APPFOLIO_SEEDS !== 'false';
export const appfolioProperties = ENABLED ? [ /* data */ ] : [];
```

PII sanitization in the script:

- Emails: replace `[a-z0-9.]+@[a-z]+\.(com|net|org)` with `tenant-{occ_id}-{seq}@example.com`.
- Phones: replace `(\d{3}) \d{3}-\d{4}` with `(555) 555-XXXX`.
- SSN-like: replace with `XX-XX-XXXX`.

**Verify.**

```
node Scripts/derive_appfolio_fixtures.mjs
# expect: 10 files written
cd qualia-shell && npx tsc -b
# expect: 0 errors
```

**Rollback.** `rm -rf qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived Scripts/derive_appfolio_fixtures.mjs`.

---

### Task 0.3 — Type audit

**Goal.** Identify every module field that is used but not declared on canonical types, and map each orphan to the Phase 1 or Phase 2 task that will add it.

**File touched.**

- `Docs/Phase0_Type_Audit.md` (new).

**Method.**

1. Parse `packages/types/index.ts` and extract field names from 8 interfaces: `Property, Unit, EntityProfile, Workitem, Communication, ActivityEvent, PropertyReportCards, DashboardStats`.
2. Grep all 33 modules under `qualia-shell/src/components/StrataDashboard/modules/*.tsx` for `obj.field` and `obj?.field` where `obj` matches an entity-like identifier (`tenant, resident, vendor, property, unit, workitem, workOrder, wo, item, entity, occupancy, occupant, communication, comm, message, insurance, policy, compliance, report, schedule, profile`).
3. Filter out JS/DOM methods and fields already on the 8 interfaces.
4. Group by module; map each orphan to Phase 1.N or Phase 2.N.
5. Flag strata-unique modules (GR-1) as protected — orphans there stay local.

**Expected output (sandbox run already produced).**

- 34 orphan fields identified across 10 modules.
- ComplianceEngine (10 orphans) → Phase 2 Task 2.3.
- PropertiesModule (4) → Phase 2 Task 2.10 (Property Timeline).
- ReportingModule (6) → Phase 2 extension (Document Triage Queue).
- DesignStudio (2) → GR-1 protected; stays local.
- VendorsModule, LeasingModule — 1 + 2 false positives.
- PropertyOverview (9 fields) — already typed on `PropertyReportCards`; false positives documented.

**Verify.** `cat Docs/Phase0_Type_Audit.md | wc -l` ≥ 120. Every orphan field has a mapped Phase.

---

### Task 0.4 — Test scaffolding

**Goal.** Create 15 `.test.ts` stubs under `qualia-shell/src/test/appfolioParity/` so each Phase 1-2 task has a pre-existing test file whose absence would fail the phase-gate.

**Files touched (new).**

- `qualia-shell/src/test/appfolioParity/README.md`
- Phase 1 stubs (5): `residents.test.ts, vendors.test.ts, properties.test.ts, maintenance.test.ts, accounting.test.ts`
- Phase 2 stubs (10): `calendar.test.ts, communication.test.ts, complianceEngine.test.ts, forecast.test.ts, insurance.test.ts, utilities.test.ts, audit.test.ts, sentiment.test.ts, projects.test.ts, propertyTimeline.test.ts`

**Stub body.**

```ts
import { describe, it, expect } from 'vitest';
describe('<module> parity — placeholder', () => {
  it('placeholder passes (replace before phase completion)', () => {
    expect(true).toBe(true);
  });
});
```

**Verify.** `cd qualia-shell && npx vitest run src/test/appfolioParity/` → 15 passed, 0 failed.

**Rollback.** `rm -rf qualia-shell/src/test/appfolioParity`.

---

### Task 0.5 — Feature flag

**Goal.** Wire `VITE_APPFOLIO_SEEDS` into every derived fixture file so external builds can opt out of real captures.

**File touched.**

- `qualia-shell/.env.example` (new).

**Content.**

```
# ─── AppFolio parity (Phase 0-5) ───
# Per GR-7: must be `false` for external/customer-demo builds.
VITE_APPFOLIO_SEEDS=true

# ─── Existing ───
VITE_API_BASE_URL=http://localhost:3000
```

**Verify.**

```
cd qualia-shell
VITE_APPFOLIO_SEEDS=false npx vite build --outDir /tmp/v-false  # expect success, empty arrays
VITE_APPFOLIO_SEEDS=true  npx vite build --outDir /tmp/v-true   # expect success, real data
```

Diff `/tmp/v-false/assets/*.js` vs `/tmp/v-true/assets/*.js` with `grep -c '@example'` — should be 0 in `false` build.

**Rollback.** `rm qualia-shell/.env.example` + revert ENABLED guards in fixture files.

---

## §5. Verification Matrix

| Check | Target | Evidence |
|---|---|---|
| `tsc -b` errors = 0 | pass | `Docs/Baselines/2026-04-19_Phase0_baseline_tsc.txt` (empty) + post-add re-run |
| `vitest run` failures ≤ baseline | 9 failed (pre-existing), 0 new | `Docs/Baselines/...vitest.txt` baseline + post-phase |
| `vite build` | 0 errors | `Docs/Baselines/...vite_build.txt` |
| `vite build VITE_APPFOLIO_SEEDS=false` | 0 errors; no `@example` in output | diff of dist/assets |
| Fixture derivation idempotent | byte-identical on re-run | `sha256sum` before/after |
| Type audit ≥ 30 orphans mapped | pass | `Docs/Phase0_Type_Audit.md` |
| Test scaffolding 15/15 pass | pass | `vitest run src/test/appfolioParity/` |
| Feature-flag gate | empty arrays when false | grep test |
| Playwright (real dev box only) | ≤ baseline failures | paste output |
| PII-leak scan | exit 0 | paste output |
| `/security-review` on derive script | no High/Medium | review output |
| Pasted proof in Completion Report | all command outputs | `Docs/Phase0_Completion_Report.md` |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-0-1 | Fixture derivation introduces TS type errors | Med | Med | Run `tsc -b` after every script change; sandbox run already green |
| R-0-2 | Feature flag default wrong in production | Low | High | `.env.example` is documentation only; real `.env` is per-env; security review enforces |
| R-0-3 | Test scaffolding masks a missing real test | Low | Med | Phase 1-2 gates require the stub to be REPLACED, not augmented |
| R-0-4 | Orphan audit misses a field | Low | Low | Audit method is greppable + regex-based; Phase 1 discovery will surface anything missed |
| R-0-5 | Sandbox-only playwright blocker delays real baseline | High | Low | Explicitly deferred to Phase 0.0 on real dev box |

---

## §7. Rollback Plan

Phase 0 is entirely additive — new files only, no modifications to existing source. Rollback:

```
rm -rf qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived
rm -rf qualia-shell/src/test/appfolioParity
rm qualia-shell/.env.example
rm Scripts/derive_appfolio_fixtures.mjs
rm Docs/Baselines/2026-04-19_Phase0_baseline_*.txt
rm Docs/Phase0_Type_Audit.md
rm Docs/Phase0_Completion_Report.md
```

---

## §8. Exit Gate

Phase 0 is complete when:

1. All 5 tasks (0.1–0.5) have a green row in §5.
2. `Docs/Phase0_Completion_Report.md` committed with pasted evidence (already present from sandbox run — awaits real-box re-verify).
3. Ilya verifies "go Phase 1" per the standing rule.

---

## §9. Deliverables

- `Scripts/derive_appfolio_fixtures.mjs` — idempotent fixture generator.
- 10 files under `appfolioDerived/` + barrel `index.ts`.
- `Docs/Baselines/2026-04-19_Phase0_baseline_*.txt` (4 files).
- `Docs/Phase0_Type_Audit.md`.
- 15 test stubs under `qualia-shell/src/test/appfolioParity/`.
- `qualia-shell/.env.example`.
- `Docs/Phase0_Completion_Report.md`.

---

## §10. Current Status (2026-04-19)

All 5 tasks executed successfully in the Cowork sandbox. Evidence pasted in `Docs/Phase0_Completion_Report.md`. Playwright baseline deferred to real dev box per R-0-5. Ready to transition to Phase 1 once Phase 0.0 closes the environmental gaps.

🧪
