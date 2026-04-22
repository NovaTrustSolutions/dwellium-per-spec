# Phase 5 — Live Backend + E2E

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §8 (Phase 5 refinements) + §17 done criteria
**Phase status.** Not started. Blocked on Phase 4 exit gate.
**Budget.** 2-3 days + 1 day buffer = 3-4 days
**Owner.** TBD (backend engineer + QA + DevOps)
**Dependencies.** Phase 4 complete; all canonical types frozen; backend repo accessible.
**Parallelizable?** Task 5.1 (a→b→c→d) is **sequential** within itself. Tasks 5.2+ can fan out.

---

## §1. Scope

Mirror the canonical types on the backend, ship serialization + API versioning + a forward-only migration, then run the full E2E Playwright suite against the real backend to prove parity stays green on hot data (not just static fixtures). This is the phase that takes Strata from "looks like AppFolio on static fixtures" to "behaves like AppFolio on live data".

Scope boundaries:

- IN — backend type mirror, JSON round-trip contract, API version bump, DB migration (forward-only), E2E suite, backward-compat verification.
- OUT — any UI change; any schema addition not already in Phase 1-2; destructive migrations (down-migrations live in separate tickets).

---

## §2. Definition of Ready

1. Phase 4 exit gate passed.
2. Backend repo accessible with a test DB that can be rebuilt.
3. API contract docs up to date with `packages/types/index.ts`.
4. QA environment provisioned with the parity branch.
5. Rollback plan for the migration is written BEFORE the migration runs (DoR requirement).

---

## §3. Definition of Done

Per task:

1. Backend + frontend types match exactly; type-mirror test green.
2. JSON round-trip tests pass for every new optional field.
3. API version header `X-Qualia-API: v2` returned by backend; v1 clients continue to work.
4. Migration is forward-only; idempotent; reversible (down-migration file exists even if not run).
5. E2E suite passes against the real backend on 8 baseline pages.
6. `/security-review` pass; `/security-review` on migration SQL + API changes mandatory.
7. No customer-visible downtime during migration.
8. Backward-compat proven: v1 client reads a v2 response and renders without errors.

---

## §4. Tasks

### Task 5.1a — Backend type mirror

**Goal.** Every type added in Phase 1-2 (`Occupancy`, `EmergencyContact`, `Animal`, `Vehicle`, `VendorFederalTax`, `VendorAccountingInfo`, `VendorCompliance`, `PurchaseHistory`, `LateFeePolicy`, `MaintenanceConfig`, `FixedAsset`, `ResidentAvailability`, `ActionLogEntry`, `LaborEntry`, `PurchaseOrderLink`, `ComplianceItem`, `InsurancePolicy`, `EntityLink`, `Project`) exists on the backend with identical shapes.

**Files touched.** Backend repo — `server/src/types/**/*.ts` (or equivalent language). Generate from `packages/types/index.ts` where possible.

**Method.** Prefer a codegen script that reads `packages/types/index.ts` and emits server-side types. If language differs, maintain a hand-written mirror + a structural parity test.

**Verify.** A structural-parity unit test compares every backend interface to its frontend counterpart and fails on drift.

**Rollback.** `git revert`. No DB impact yet.

---

### Task 5.1b — Serialization layer

**Goal.** JSON round-trip: `frontend → POST → backend store → GET → frontend` preserves every optional field as written.

**Files touched.** Backend serializers / ORM mappers.

**Verify.**

```
# Backend unit tests
npm test -- src/serialization/
# Each new field has a round-trip test: write, read, assert equality.
```

**Rollback.** `git revert`. No schema impact.

---

### Task 5.1c — API version bump

**Goal.** Introduce `X-Qualia-API: v2` header; old clients get v1-shaped responses (new fields omitted); new clients get v2-shaped responses.

**Files touched.** Backend API middleware + version-negotiation module.

**Rule.** Backward-compat contract: a v1 client request MUST NOT break. A v2 client request MUST receive the new fields.

**Verify.**

- Contract test with a v1 client against a v2 server → v1 shape.
- Contract test with a v2 client against a v2 server → v2 shape.
- Contract test with a v2 client against a v1 server → v1 shape, no crashes.

**Rollback.** Flip the feature flag to default the version to `v1` on the server. No data loss.

---

### Task 5.1d — Migration script (forward-only)

**Goal.** Any DB column additions for the new types land via a named migration. Down-migration file exists but is NOT run in Phase 5.

**Files touched.** Backend `db/migrations/20260420_parity_fields.up.sql` + `20260420_parity_fields.down.sql`.

**Rules.**

- Only ADD columns; never DROP or RENAME.
- New columns NULLABLE with no DEFAULT (optional-by-design; matches GR-2).
- Run on a clone of production first; measure duration; abort if >5 min on a 1M-row table.
- Migration is idempotent: running twice is a no-op.
- A manual `/security-review` is mandatory on the SQL.

**Verify.**

```
# On a seeded staging DB:
psql < 20260420_parity_fields.up.sql   # expect: all ALTER TABLE statements succeed
psql < 20260420_parity_fields.up.sql   # expect: idempotent; no errors
# Sanity query:
psql -c "SELECT column_name FROM information_schema.columns WHERE table_name IN (...) AND column_name IN (...);"
```

**Rollback.** Run the down-migration file manually on staging only. Production rollback requires a separate named ticket.

---

### Task 5.2 — Contract tests: backend vs MSW mocks

**Goal.** Prove the real backend and the MSW-style `strataApi.static.ts` return structurally identical payloads for identical inputs.

**Files touched.**

- `qualia-shell/src/test/contract/real-vs-static-api.test.ts` (new).

**Method.** For each endpoint (`/properties`, `/tenants`, …), fetch the same ID from both the real backend (against a seeded staging DB) and the static API. Run a deep-structural-equality check (shape, not values).

**Verify.** All contract tests green.

---

### Task 5.3 — E2E against real backend

**Goal.** Run the full Playwright suite against the real backend (seeded with the Phase 4 bulk data mapped to DB rows).

**Files touched.**

- `qualia-shell/e2e/**/*.spec.ts` — existing specs; point at the real backend via env var.
- `qualia-shell/playwright.config.ts` — add a `--project=real-backend` alternative to the default.

**Verify.**

```
cd qualia-shell
E2E_TARGET=real-backend npx playwright test
# expect: ≤ baseline failures (0 new)
```

**Rollback.** E2E continues to run against the static API as the default profile.

---

### Task 5.4 — Backward-compat rehearsal

**Goal.** Prove a production v1 client (pinned to a prior bundle hash) rendering a v2-server response doesn't crash.

**Method.**

1. Pin a v1 client build artifact in `qualia-shell/rehearsals/v1-client/`.
2. Start the v2 backend pointing at seeded staging.
3. Load v1 client in a Playwright browser; visit the 8 baseline pages.
4. Record console errors. Expect 0 uncaught exceptions.

**Verify.** Rehearsal spec passes; zero uncaught exceptions; screenshots attached.

**Rollback.** N/A — rehearsal does not modify prod.

---

### Task 5.5 — Production migration dry run

**Goal.** Rehearse the full migration on a production-sized clone.

**Method.**

1. Snapshot production DB to a staging clone.
2. Run 5.1d migration on the clone.
3. Time the migration; measure lock duration; measure query impact.
4. Deploy the v2 backend pointing at the migrated clone.
5. Run the full E2E suite.

**Acceptance.** Migration ≤5 min on production-sized data; zero data loss; zero user-visible errors in the staging dashboard.

**Verify.** `Docs/Phase5_MigrationRehearsal_Report.md` with pasted timings.

---

### Task 5.6 — Observability wiring

**Goal.** Sentry / error-boundary breadcrumbs hit for every new UI path; backend logs a structured JSON line per new field write.

**Files touched.**

- `qualia-shell/src/lib/sentry.ts` — add breadcrumb emitters.
- Backend logger.

**Verify.** Breadcrumb test: a deliberate error in the ResidentsModule "Other Occupants" collapsible produces a Sentry event with the breadcrumb trail.

---

## §5. Verification Matrix

| Check | Target | Evidence |
|---|---|---|
| `tsc -b` = 0 (frontend + backend) | pass | paste output |
| `vitest run` ≤ baseline | pass | paste output |
| Backend unit tests ≤ baseline | pass | backend CI output |
| Contract tests real vs static | pass | `real-vs-static-api.test.ts` |
| `playwright test --project=real-backend` ≤ baseline | pass | paste output |
| API version v1 ← v2 backward-compat | pass | pinned-client rehearsal |
| Migration up on staging clone | idempotent | paste `psql` output |
| Migration down file present + review | reviewed | `/security-review` output |
| Lighthouse LCP on 8 real-backend pages | ≤ max(B, 500ms) | Lighthouse JSON |
| axe on 8 real-backend pages | ≤ baseline (0 target) | axe JSON |
| PII-leak scan on backend logs | exit 0 | log audit |
| `/security-review` (frontend + migration) | no High/Medium | review output |
| Sentry breadcrumbs wired | pass | deliberate-error test |
| `Docs/Phase5_Completion_Report.md` | committed | file present |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-5-1 | Backend-frontend type drift post-merge | Med | High | Codegen + structural-parity test on CI |
| R-5-2 | Migration locks production too long | Med | High | Rehearse on clone first; use `ADD COLUMN … NULL` (O(1) in PG); measure |
| R-5-3 | v1 client breaks on v2 response | Med | High | Pinned-client rehearsal test; v2 MUST NOT change field names / types |
| R-5-4 | Serialization loses precision (dates, decimals) | Low | Med | Round-trip unit tests per field |
| R-5-5 | E2E flake against real backend | Med | Med | Retry flaky specs 2× in CI; log + investigate flakes |
| R-5-6 | Observability gap hides a real bug | Med | Med | Breadcrumb test; alert on any uncaught Sentry event in staging |
| R-5-7 | Down-migration is incorrect | Low | High | Write down-migration first, test, then write up-migration |

---

## §7. Rollback Plan

Phase 5 rollback is staged:

1. **Frontend revert** — `git revert` of 5.1a/5.1b/5.2 PRs. Frontend returns to static-api path.
2. **API version flag** — flip `X-Qualia-API` default from v2 to v1 on the backend. Clients default to v1.
3. **Migration rollback** — ONLY if a production deploy went wrong. Run the down-migration file on a fresh snapshot; verify; then apply to production. This rollback requires a dedicated ticket with sign-off.
4. **E2E** — continues to run against static API by default; no rollback needed.

No step is destructive by default. The migration is forward-only; reversal is a separate, explicit action.

---

## §8. Exit Gate

Phase 5 is complete when:

1. All 6 tasks (5.1a-d + 5.2 + 5.3 + 5.4 + 5.5 + 5.6) merged / deployed.
2. Full suite `vitest / playwright (both profiles) / tsc / vite build / backend tests` passes.
3. Migration rehearsed on production-sized clone; timings documented.
4. v1 client backward-compat rehearsal passes.
5. E2E against real backend ≤ baseline failures on 8 pages.
6. Sentry breadcrumbs wired + test-fired.
7. `Docs/Phase5_Completion_Report.md` committed with pasted evidence.
8. Ilya verifies "parity complete — ship it".

---

## §9. Deliverables

- Backend type mirror + structural-parity test.
- Serialization layer + per-field round-trip tests.
- API version middleware + v1/v2 contract tests.
- Migration up + down SQL files.
- `real-vs-static-api.test.ts` contract suite.
- `playwright.config.ts` with `real-backend` project.
- Pinned-client rehearsal artifact + spec.
- `Docs/Phase5_MigrationRehearsal_Report.md`.
- `Docs/Phase5_Completion_Report.md`.

---

## §10. Timeline

| Task | Budget | Prereq | Can parallelize |
|---|:-:|---|:-:|
| 5.1a Backend type mirror | 0.5 day | Phase 4 green | No (starts 5.1 chain) |
| 5.1b Serialization | 0.5 day | 5.1a | No |
| 5.1c API version | 0.5 day | 5.1b | No |
| 5.1d Migration | 0.5 day | 5.1c | No |
| 5.2 Contract tests | 0.25 day | 5.1a | Yes with 5.6 |
| 5.3 E2E real-backend | 0.5 day | 5.1d + 5.2 | Yes with 5.4 |
| 5.4 Backward-compat rehearsal | 0.25 day | 5.1c | Yes with 5.3 |
| 5.5 Migration dry run | 0.5 day | 5.1d | No |
| 5.6 Observability | 0.25 day | any | Yes |
| Buffer | 1 day | — | — |
| **Total** | **3-4 days** | | |

---

## §11. Done Criteria for the Whole Program

Reached when Phase 5 exits AND:

1. A prospective AppFolio customer can import their AppFolio export into Strata and see every captured field represented.
2. All 46 gap-analysis items closed (cross-referenced in `Docs/AppFolio_vs_Strata_Gap_Analysis.md`).
3. Every strata-unique module (GR-1) still renders and tests green.
4. No real PII anywhere in the repo (CI enforced).
5. `VITE_APPFOLIO_SEEDS=false` build is safe to demo externally.
6. Ilya signs off.

🧪
