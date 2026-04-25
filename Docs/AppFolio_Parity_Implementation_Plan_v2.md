# AppFolio Parity Implementation Plan — v2.7

**Version.** 2.7 (2026-04-24). Incremental clarifications after v2.6 — documents Task 2.4 (Forecast static handler + ForecastModule rewire; D3 scope per DoR PRE1 second-order drift discovery) close as the fourth Phase-2 general-pool task post-B3. v2.7 also retroactively corrects three plan-level drifts surfaced during Task 2.4 PRE0/PRE1 verification (see Changelog). Changes tracked in the Changelog at the bottom.

**Goal.** Close the schema, UI, and fixture gaps identified in `AppFolio_vs_Strata_Gap_Analysis.md` so Strata reaches functional parity with AppFolio on the 12 "Covered" + 10 "Partial" modules, while preserving the 8 Strata-unique and 3 Strata-extending differentiators. Target: a prospective AppFolio customer can migrate without dropping data.

**Out of scope.** Building a live AppFolio migration importer, replacing Strata-unique modules, touching the Astra side of the split (except shared types), any billing/payments integration beyond schema fields, pixel-for-pixel visual clone of AppFolio.

**Canonical sources of truth.**
- Schema types: `packages/types/index.ts` (re-exported via `qualia-shell/src/components/StrataDashboard/strataTypes.ts`)
- Static fixtures: `qualia-shell/src/components/StrataDashboard/strataApi.static.ts` (371 lines at v2.0 authoring)
- Module components: `qualia-shell/src/components/StrataDashboard/modules/*.tsx` (33 files)
- Derived fixtures (Phase 0): `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/*.ts`
- Test harness: Vitest (`qualia-shell/src/test/`) + Playwright (`qualia-shell/e2e/`)
- Build check: `tsc -b && vite build`
- AppFolio ground-truth: `AppFolio_Screenshots/data/01..10_*.json`
- Performance baseline: `Docs/Baselines/2026-04-19_Phase0_perf_baseline.json` (populated in Phase 0.0)

---

## §1. Definition of Ready (DoR) — every task must satisfy before starting

A task is "Ready" only when all of these are true:

1. The task's target file paths are enumerated in the plan.
2. The task's before-state has been read by the engineer (git blame + latest commit on each file).
3. All tasks listed in this task's `blockedBy` dependency graph (Appendix B) are Completed.
4. The current `main` branch is green on CI: `tsc -b`, `vitest run`, `playwright test`, `vite build`.
5. The baseline metric the task will impact (row count, LCP, axe violations) has been captured in `Docs/Baselines/`.
6. The engineer has an open branch named per the convention `appfolio-parity/phase-{N}-{task}-{slug}`.

If any of 1–6 is false, the task is Blocked, not In Progress. Blocked tasks surface in the daily report (see §14).

## §2. Definition of Done (DoD) — every task must satisfy before merging

A task is "Done" only when:

1. All Guard Rails (§3) applicable to the task are satisfied.
2. Every entry in the Verification Matrix (§9) required for this phase passes, with pasted command output in the PR description.
3. At least one screenshot (for UI tasks) or one contract-test assertion (for schema tasks) exists in the PR.
4. The PR description documents the rollback commit range (single SHA or range).
5. CI is green on the branch at the commit being merged.
6. A reviewer other than the author has approved (squash-merge only; no force-push to `main`).
7. The task's completion row is added to the phase's Completion Report (`Docs/Phase{N}_Completion_Report.md`).

---

## §3. Guard Rails

Numbered so PRs can reference them (e.g., "violates GR-3 — see plan doc §3"). Every guardrail has a **trigger** (when it fires) and a **remedy** (what to do).

### GR-1. No breaking changes to Strata-unique module APIs.
**Trigger.** Any PR that modifies a shared type (`Workitem`, `EntityProfile`, `Property`) where the change is non-additive (rename, retype, remove, narrow union).
**Protected modules.** `CivilEngineeringStudio`, `DesignStudio`, `IncidentModule`, `LegalModule`, `ProfileSpaces`, `VisualizationModule`, `CorporateReview`, `StatusCheckModule`.
**Remedy.** Revert the non-additive change; open a separate ticket for the rename with a deprecation window (§11).

### GR-2. Additive schema migrations only.
**Trigger.** Any type change that renames, retypes, or removes an existing field within a phase.
**Remedy.** Add the new field as optional; populate both old and new in fixtures; mark the old field with `/** @deprecated — use X. Removal scheduled: {date} */`. Removals live in a later, named cleanup ticket outside this plan (see §11 Deprecation Schedule).

### GR-3. Fixture-volume lower bound (row-count parity).
**Trigger.** A phase reduces the count of any fixture collection below its Phase-0 baseline.
**Baseline (captured 2026-04-19).** See Appendix C. `properties = 4`, `entities = 250`, `workitems = 500+`, `communications = per-fixture-file count`.
**Resolution for GR-3 × GR-7 conflict.** When `VITE_APPFOLIO_SEEDS=false`, external builds use `strataApi.static.ts` original mocks which already meet lower bound. When `=true`, the AppFolio-derived seeds are ADDITIVE on top — never replace. Appendix C lists the required counts for each flag state.
**Remedy.** Augment, don't replace.

### GR-4. Phase gate — no regression from baseline (not binary green).
**Trigger.** A phase exits with any metric worse than Phase-0 baseline.
**Measured metrics (per phase):**
- `tsc -b` errors ≤ 0 (baseline: 0; hard zero) ✅
- `vitest run` failures ≤ baseline failures (baseline: 9 pre-existing failures in `StellaAgent.test.tsx` + 1 other; target: **no new failures**) ✅
- `vitest run` passing ≥ baseline + new-tests-added ✅
- `playwright test` — phase-specific gate (see §9)
- `vite build` — zero errors, same or fewer build warnings ✅
- `VITE_APPFOLIO_SEEDS=false vite build` — produces a functional bundle (files exist, `index.html` loads, first module renders in a headless check) — **NOT** required to be byte-identical (v1.0 was wrong; Vite hashes vary by build)
- LCP on modified detail page ≤ max(baseline LCP, 500ms) — see §4 Perf Baseline
- axe-core violations ≤ baseline violations on each modified page
**Remedy.** Phase is Blocked until the regression is fixed or the baseline is formally re-set via a signed amendment (§14 Communication).

### GR-5. No premature live-backend wiring.
**Trigger.** Phases 1-4 PR touches `strataApi.backend.ts`, backend API server code, or database migrations.
**Remedy.** Revert. Live-backend work is Phase 5 only, after the static contract has shipped.

### GR-6. Real data, not synthetic placeholders.
**Trigger.** A new fixture row contains invented names/addresses/IDs when a matching real row exists in `AppFolio_Screenshots/data/*.json`.
**Remedy.** Use Willie White (occ 2800), Brianna M. Jackson (WO 19511-1), 2-STORY TECHNICAL ROOFING (vendor 2716), Danny Bourdua, Zelle-link, GL-2026-07-11, etc. Fabricated "Sample Tenant 1" rows are rejected.

### GR-7. PII/copyright discipline (stronger than v1.0).
**Trigger.** Any fixture file exports a real person's email, phone, tax ID, or bank number in a mode where `VITE_APPFOLIO_SEEDS=false`.
**Hard bans.** Real tax IDs (even masked), bank account numbers, credit card data, SSNs — **never** committed in any branch, regardless of flag.
**Soft controls.** Real emails → strip to `@example` domain. Real phone numbers → replaced with `(XXX) XXX-XXXX`. Real names → retained only in `=true` mode; substituted with alias tokens (e.g., `TENANT_001`) in `=false` mode via the fixture-derivation script.
**Remedy.** Revert the commit; rerun `Scripts/derive_appfolio_fixtures.mjs` with the sanitize flag on; re-verify with the smoke test `Scripts/verify_no_pii_leak.mjs` (added in Phase 0.0 Task 0.0.5).

### GR-8. Every CTA includes a tested rollback.
**Trigger.** A PR description omits the explicit rollback commit SHA range or rollback steps.
**Remedy.** Rejected at review. Rollback must be tested in a throwaway branch — document the test in the PR ("verified: cherry-pick rollback onto main; tsc + vitest green").

### GR-9. Verification claims require pasted proof.
**Trigger.** A PR description uses words "done", "complete", "100%", "exact", "works" without pasted command output from tsc / vitest / playwright / vite build.
**Remedy.** Rejected. Matches Ilya's standing CLAUDE.md rule.

### GR-10. Accessibility & perf baselines, not absolutes.
**Trigger.** A modified page regresses axe-core violations or LCP by more than the baseline margin.
**Baselines captured in Phase 0.0.** If current Strata has 3 axe violations on `/properties/{id}`, new work must stay at ≤3 on that page (and preferably fewer). Targets are `max(baseline, absolute-target)`. Absolute targets for greenfield: LCP ≤500ms, zero WCAG AA violations — but only enforced once baseline reaches that level.

### GR-11 (new). Merge-strategy discipline on shared files.
**Trigger.** Two open branches both modify one of the sentinel files: `strataApi.static.ts`, `packages/types/index.ts`, `strataApi.backend.ts`, or any fixture in `appfolioDerived/`.
**Remedy.** The later-to-open branch rebases onto the earlier, re-runs full gate, and is merged second. The file-ownership matrix in Appendix D names the owner-of-record per sentinel file per phase.

### GR-12 (new). Security review on PII-bearing or backend-touching PRs.
**Trigger.** PR touches `appfolioDerived/`, `.env.example`, `strataApi.backend.ts`, or adds a new API endpoint.
**Remedy.** Run the `/security-review` slash command in the PR; address all High and Medium findings before merge.

### GR-13 (new). Observability on every new user-visible surface.
**Trigger.** A Phase-3 UI addition lacks an error boundary or a feature-flag read.
**Remedy.** Wrap the new component in `<ErrorBoundary>` with a Sentry-reported fallback, and gate any risky new behavior behind a flag (`VITE_APPFOLIO_SEEDS` suffices for Phase 1-4; Phase 5 adds `VITE_PARITY_LIVE_BACKEND`).

---

## §4. Baselines captured in Phase 0.0 (reference for GR-3, GR-4, GR-10)

Every number below is a *target reference*. Phase 0.0 tasks populate it into `Docs/Baselines/2026-04-19_Phase0_*.{txt,json}` so subsequent phases measure regression against a fixed number.

| Metric | Baseline | Captured in |
|---|---|---|
| `tsc -b` errors | 0 | `2026-04-19_Phase0_baseline_tsc.txt` |
| `vitest run` — total | 74 tests | `2026-04-19_Phase0_baseline_vitest.txt` |
| `vitest run` — failing | 9 tests (pre-existing) | same |
| `playwright test` — total | to be captured on real dev box | `2026-04-19_Phase0_baseline_playwright.txt` |
| `vite build` — modules | 3269 | `2026-04-19_Phase0_baseline_vite_build.txt` |
| `vite build` — warnings | 1 (chunk-size for TranscriptionHub) | same |
| `VITE_APPFOLIO_SEEDS=false vite build` — modules | 3269 | (same file, second run) |
| Static fixture row counts (GR-3) | see Appendix C | `Docs/Baselines/2026-04-19_Phase0_fixture_counts.json` (new) |
| Lighthouse LCP — `/strata/properties/:id` | **TBD on real dev box** | `Docs/Baselines/2026-04-19_Phase0_perf_baseline.json` (new) |
| Lighthouse LCP — `/strata/residents` | TBD | same |
| Lighthouse LCP — `/strata/vendors` | TBD | same |
| Lighthouse LCP — `/strata/work-orders` | TBD | same |
| axe-core violations — `/strata/properties/:id` | TBD | `Docs/Baselines/2026-04-19_Phase0_axe_baseline.json` (new) |
| axe-core violations — 3 other detail pages | TBD | same |

Phase 0.0 Task 0.0.7 captures the TBD values. Until then, Phase 1-5 gate thresholds are provisional (fall back to absolute targets if the measurement fails).

---

## §5. Environment Prerequisites (new Phase 0.0)

**This did not exist in v1.0. It is the reason Phase 0 hit three environmental blockers in execution.** Every gap encountered during the v1.0 Phase 0 dry-run is now a named prerequisite task with a verify-step.

### Task 0.0.1 — Node version
**Prereq.** Node ≥25.5.0, npm ≥11.8.0 (per `qualia-shell/package.json#engines`).
**Verify.** `node --version && npm --version` match the engines block.
**If false.** Install via `nvm install 25 && nvm use 25`. Document in `Docs/DevBox_Setup.md`.

### Task 0.0.2 — Playwright browser binaries
**Prereq.** Chromium + WebKit + Firefox binaries installed.
**Verify.** `npx playwright install --with-deps --dry-run` reports no missing browsers.
**If false.** Run `npx playwright install --with-deps`. This is required for GR-4's Playwright check. Cannot run in sandbox; must be done on a real dev box.

### Task 0.0.3 — Rollup native binary
**Prereq.** `@rollup/rollup-{platform}` present under `node_modules/`.
**Verify.** `ls node_modules/@rollup/` lists the platform-specific binary for the current OS/arch.
**If false.** `npm_config_engine_strict=false npm install --no-save @rollup/rollup-{platform}` (documented edge case in the npm optional-deps bug).

### Task 0.0.4 — Workspace write permissions
**Prereq.** The build `dist/` directory is writeable.
**Verify.** `touch qualia-shell/dist/.permissions-check && rm qualia-shell/dist/.permissions-check` succeeds.
**If false.** Build to a user-writeable outDir (`--outDir /tmp/vite-build`) and document in the dev box's README. On user's Mac this is not a blocker; it was a Cowork sandbox artifact.

### Task 0.0.5 — PII-leak smoke script
**Prereq.** A script that parses any committed fixture file for real emails/phones/tax IDs.
**Verify.** `node Scripts/verify_no_pii_leak.mjs` exits 0. The script scans `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/*.ts` for patterns: `@(gmail|yahoo|hotmail|outlook)\.com`, `\(\d{3}\) \d{3}-\d{4}`, `XX-XXX\d{4}` with an allowlist for `@example` substitution.
**If false.** Add the script as a pre-commit hook.

### Task 0.0.6 — CI pipeline definition
**Prereq.** A `.github/workflows/appfolio-parity-gate.yml` (or equivalent) that runs the Verification Matrix on every PR.
**Verify.** A trivial PR turns CI green within 15 min.
**If false.** Phase 1 is Blocked.

### Task 0.0.7 — Lighthouse + axe-core baseline
**Prereq.** `lighthouse-ci` and `@axe-core/cli` installed; captured baselines for 4 detail pages.
**Verify.** `Docs/Baselines/2026-04-19_Phase0_perf_baseline.json` exists with LCP/TBT/CLS/LCP-P95 numbers per page; `Docs/Baselines/2026-04-19_Phase0_axe_baseline.json` exists with violation lists.
**If false.** GR-10 thresholds default to absolute targets (LCP ≤500ms, 0 violations), which may block phases. Capturing baselines is required, not optional.

### Task 0.0.8 — Screenshot-diff baseline
**Prereq.** A `Docs/Phase0_Screenshots/` folder with PNGs of the 4 detail pages at dev-build defaults for visual-regression comparison in Phase 3.
**Verify.** 4 PNGs exist, checksums logged.
**If false.** Phase 3's visual-diff exit gate is unenforceable.

**Phase 0.0 exit gate.** All 8 Task 0.0.* verify steps pass. Document is `Docs/Phase0.0_Environment_Report.md`.

**Phase 0.0 rollback.** Entirely additive — rollback is `git revert` of the Phase-0.0 commits. No source changes.

---

## §6. Phase 0 — Prep & baseline (unchanged in spirit from v1.0, tightened)

**Objective.** Establish a measurable baseline and a fixture-generation harness so Phases 1-5 are mechanical.

### Task 0.1 — Baseline snapshot
**Files touched.** New files only: `Docs/Baselines/2026-04-19_Phase0_baseline_{tsc,vitest,playwright,vite_build,fixture_counts,perf,axe}.{txt,json}`.
**Steps.** Run each command; `tee` output to the baseline file.
**Verify.** `ls Docs/Baselines/` shows 7 files.
**DoD.** §2 plus committed files.

### Task 0.2 — Fixture-derivation script
**Files touched.** `Scripts/derive_appfolio_fixtures.mjs` (new); 10 files under `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/`.
**Steps.** Script reads `AppFolio_Screenshots/data/*.json` → emits one `.ts` per entity type. Idempotent: re-running overwrites deterministically.
**Verify.** `node Scripts/derive_appfolio_fixtures.mjs` emits 10 files; `tsc -b` passes.
**Screen-shot/contract-test requirement.** N/A (pre-build tooling).

### Task 0.3 — Type-audit report
**Files touched.** `Docs/Phase0_Type_Audit.md` (new).
**Steps.** Scan all 33 modules for field accesses not on the 8 canonical interfaces. Map each orphan to a Phase-1 or Phase-2 task; flag Strata-unique modules as GR-1 protected.
**Verify.** Document exists, enumerates 30+ candidates, maps each to a task.

### Task 0.4 — Test scaffolding
**Files touched.** 15 stub files under `qualia-shell/src/test/appfolioParity/*.test.ts` + README.
**Steps.** One stub per modified module (5 Phase-1 + 10 Phase-2). Each stub passes trivially.
**Verify.** `npx vitest run src/test/appfolioParity/` shows 15/15 pass.

### Task 0.5 — Feature flag
**Files touched.** `qualia-shell/.env.example` (new); derived fixture files reference `import.meta.env.VITE_APPFOLIO_SEEDS`.
**Steps.** Add flag + doc comment referencing GR-7.
**Verify.** Build with `VITE_APPFOLIO_SEEDS=false` succeeds and PII-leak scan (Task 0.0.5) returns zero findings.

**Phase 0 exit gate.** §9 Verification Matrix row "Phase 0" all green. Document is `Docs/Phase0_Completion_Report.md`.

---

## §7. Phase 1 — Top-5 schema extensions (3 days sequential; budget +1 day buffer)

Each task is a discrete PR with its own green-gate. Tasks 1.1 → 1.5 are sequential to avoid merge conflicts on `packages/types/index.ts` (Appendix D declares that file's owner-per-phase).

### Task 1.1 — Residents: Occupancy → N Tenants 1:N
**DoR.** §1. Specifically: read `ResidentsModule.tsx` lines 1-end; read `packages/types/index.ts` lines 73-89 (EntityProfile).
**Files touched.**
- `packages/types/index.ts` — add `Occupancy`, `EmergencyContact`, `Animal`, `Vehicle` interfaces; extend `EntityProfile` with 5 optional fields.
- `qualia-shell/src/components/StrataDashboard/strataTypes.ts` — re-export new types.
- `qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx` — render "Other Occupants" collapsible under each primary tenant detail.
- `qualia-shell/src/test/appfolioParity/residents.test.ts` — replace stub with real contract test.
- `qualia-shell/public/data/occupancies.json` (new) — seeded from Willie White occupancy 2800.
- `qualia-shell/src/components/StrataDashboard/strataApi.static.ts` — add `/occupancies` route handler.
**Contract test.** "Given occupancy 2800 with LaSonta M. Westbrook primary + Willie White + Olivia White + Elijah Westbrook as Other Occupants, the ResidentsModule renders 1 primary header and 3 occupants in the collapsible."
**Exit gate.** §9 row Phase-1. Plus: new test passes; existing `ResidentsModule.test.tsx` passes; `/strata/residents` in dev shows LaSonta + 3 occupants.
**Rollback.** `git revert {commit-sha}`. All type additions are optional; zero back-compat risk.
**Observability (GR-13).** Wrap new collapsible in `<ErrorBoundary fallback={<CollapsibleErrorState />}>`. Add Sentry breadcrumb on expand/collapse.

### Task 1.2 — Vendors: 45-field / 10-block schema
**DoR.** §1. Read `VendorsModule.tsx`, `10_vendor_detail_2story_roofing.json`.
**Files touched.**
- `packages/types/index.ts` — add `VendorFederalTax`, `VendorAccountingInfo`, `VendorCompliance` interfaces; extend `EntityProfile` (vendor subtype) with 3 optional nested objects + `paymentMethod` enum + `send1099: boolean`.
- `strataTypes.ts` — re-export.
- `VendorsModule.tsx` — add Compliance tab with 6 expiration rows (color-coded by proximity via `expirationColor(date)` helper); Accounting tab with check consolidation + payment terms + default GL.
- `qualia-shell/src/test/appfolioParity/vendors.test.ts` — real contract test.
- `qualia-shell/src/components/StrataDashboard/modules/__vendors/ComplianceTab.tsx` (new) — extracted sub-component.
- `qualia-shell/src/components/StrataDashboard/modules/__vendors/AccountingTab.tsx` (new).
- `qualia-shell/public/data/entities.json` — augment vendor 2716 with the new fields.
**Contract test.** "Given vendor 2716 with Danny Bourdua + Zelle + send1099=true + GL expiration 2026-07-11 + 5 other nulls, `/strata/vendors/appfolio-v-2716` renders the Compliance tab with 6 rows (5 missing, 1 expiring in ~3 months) and the Accounting tab with Zelle as payment method."
**Deprecation note.** Existing `coiStatus`, `coiExpiry`, `w9OnFile`, `insuranceCarrier` stay; annotated `@deprecated — use vendorCompliance.generalLiabilityExpiration. Removal scheduled: 2026-Q3 cleanup`.
**Observability.** Error boundary on each new tab.

### Task 1.3 — Properties: purchase history + late fee + maintenance + fixed assets
**DoR.** §1. Read `PropertiesModule.tsx`, `02_property_detail_128_buena_vista.json`.
**Files touched.**
- `packages/types/index.ts` — add `PurchaseHistory`, `LateFeePolicy`, `MaintenanceConfig`, `FixedAsset` interfaces; extend `Property` with 5 optional fields.
- `strataTypes.ts` — re-export.
- `PropertiesModule.tsx` — add 4 collapsibles: Purchase History, Late Fee Policy, Maintenance Config, Fixed Assets.
- `qualia-shell/src/components/StrataDashboard/modules/__properties/FixedAssetsTable.tsx` (new).
- `qualia-shell/public/data/properties.json` — augment property 18 with full purchase history + late fee + maintenance + 4 fixed assets.
- `qualia-shell/src/test/appfolioParity/properties.test.ts` — real test.
**Contract test.** "Given property appfolio-18 with purchaseHistory[0] amount=2270000 + 4 fixed assets, `/strata/properties/appfolio-18` renders 4 new sections in expected order."

### Task 1.4 — Maintenance / Workitem: resident availability + actions log + labor + PO linkage
**Criticality: HIGHEST — `Workitem` is shared across Incident, Legal, Projects, Utilities, Leasing.**
**DoR.** §1. PLUS: run the full vitest suite on a throwaway branch with the type change applied to confirm no compile breaks in protected modules.
**Files touched.**
- `packages/types/index.ts` — add `ResidentAvailability`, `ActionLogEntry`, `LaborEntry`, `PurchaseOrderLink`; extend `Workitem` with 10 optional fields.
- `strataTypes.ts` — re-export.
- `MaintenanceModule.tsx` — render 5 new sections in WO detail panel.
- `qualia-shell/src/components/StrataDashboard/modules/__maintenance/ResidentAvailabilityCard.tsx` (new).
- `qualia-shell/src/components/StrataDashboard/modules/__maintenance/ActionsLogList.tsx` (new).
- `qualia-shell/src/components/StrataDashboard/modules/__maintenance/LaborTable.tsx` (new).
- `qualia-shell/src/components/StrataDashboard/modules/__maintenance/PurchaseOrderLinks.tsx` (new).
- `qualia-shell/public/data/workitems.json` — augment WO 19511-1 with resident availability (3 Monday 2026-04-20 windows), 2-entry actions log, no labor, no POs yet.
- `qualia-shell/src/test/appfolioParity/maintenance.test.ts` — real test.
**GR-1 check.** Task's phase-gate MUST run the full vitest suite plus verify: `IncidentModule`, `LegalModule`, `ProjectsModule`, `UtilitiesModule`, `LeasingModule` still render in dev without console errors. Snapshot test on each.

### Task 1.5 — Accounting: recurring charges + payment method enum
**Files touched.**
- `packages/types/index.ts` — extend `Workitem` (payment subtype) or add `TenantLedgerRow` / `InvoiceRow` with 7 optional fields.
- `AccountingModule.tsx` — render schedule metadata columns.
- `qualia-shell/public/data/recurring_charges.json` — seed Willie White's 3 × $1,595 rent rows.
- `qualia-shell/src/test/appfolioParity/accounting.test.ts` — real test.

**Phase 1 exit gate.** §9 Verification Matrix Phase-1 row. All 5 tasks merged, full suite green (including on protected modules). `Docs/Phase1_Completion_Report.md` with pasted output + 5 module screenshots.

**Phase 1 rollback.** Each task atomic on its own branch; revert in reverse order 1.5 → 1.4 → 1.3 → 1.2 → 1.1. Types are additive; removals are safe.

---

## §8. Phase 2, 3, 4, 5 — refined (deltas from v1.0)

### Phase 2 refinements
- **Task 2.7 (AuditModule banner) rescoped.** v1.0 was marketing copy masquerading as parity. v2.0 expands it: "Add an Audit Log viewer that renders the WO actions log + communication log as a unified activity timeline for a given entity. This surfaces what AppFolio's paid Audit Center shows but in Strata's Core tier." Now it's a real schema+UI task, not a banner.
- **Task 2.2 (Communication seed)** adds an explicit sanitize step: the derivation script replaces real email addresses with `tenant-{occ_id}-{seq}@example.com`. Phase 0.0 Task 0.0.5 verifies no leaks.
- **Task 2.4 (Forecast 50-property seed)** must preserve the existing 4 mock properties as a fallback when `VITE_APPFOLIO_SEEDS=false` — merge, not replace. GR-3 row-count enforcement.
- **Parallelization rule.** Tasks 2.1–2.10 may run in parallel *only if* they touch disjoint sets of files (Appendix D). 2.3 + 2.5 conflict on `compliance.json`; 2.4 + 2.10 conflict on `properties.json`. Sequential in those pairs.

### Phase 3 refinements
- **Screenshot diffs.** Use `playwright test --update-snapshots` with the Phase 0.0 Task 0.0.8 baseline PNGs. Any diff >5% fails the gate.
- **Perf gates** use Phase 0.0 Task 0.0.7 baselines — `max(baseline + 5%, absolute-target)`. Where the absolute is LCP ≤500ms, axe 0 violations.
- **Task 3.5 (Collapse persistence) reclassified** as optional enhancement; moved to Phase 3.6 backlog. Not required for parity.

### Phase 4 refinements
- **Conflict matrix** (Appendix D) declares `strataApi.static.ts` is owned by Task 4.7 during Phase 4. Other tasks must rebase onto 4.7 rather than modify the file directly.
- **Pre-commit PII scan** runs automatically on every commit.

### Phase 5 refinements (major)
v1.0 Task 5.1 was one line. v2.0 decomposes into four tasks:
- **5.1a — Backend type mirror.** Update server-side types to match `packages/types/index.ts`. No logic changes.
- **5.1b — Backend serialization layer.** Ensure JSON in/out of the new fields round-trips correctly. Add unit tests.
- **5.1c — API version bump.** Bump the API version header `X-Qualia-API: v2`. Old clients continue to get the v1 shape with new fields omitted. Backward-compat contract.
- **5.1d — Migration script.** Any DB column additions go here. Forward-only, no destructive changes. Down-migration lives in a separate file but is not run in Phase 5.

### Phase 2 Clarifications (added 2026-04-23 from scheduling pass)

Reality-contact items surfaced by `Docs/Session_Notes/2026-04-23_phase_2_schedule.md` §6. Each is scope-positive (additive) against the v2.0 §8 baseline; no existing task is reduced and no existing route is changed.

1. **Task 2.4 — forecast static handler.** `ForecastModule.tsx` currently hits the backend at `/api/forecast` and has no static-mode counterpart. Task 2.4's "50-property seed" therefore also requires a new `/forecast` route handler in `strataApi.static.ts`. Scope-positive; additive; no existing route changed.
2. **Task 2.8 — sentiment static handlers.** `SentimentModule.tsx` currently hits the backend at `/api/sentiment/trends` and `/api/sentiment/response`. Task 2.8 adds new handlers in `strataApi.static.ts` (planned route list: `/sentiment/scores`, `/sentiment/history`, `/sentiment/by-entity`), backed by a new `qualia-shell/public/data/sentiment_scores.json` fixture. `entities.json` is **not** touched — at-risk storage lives in the new fixture to avoid re-contaminating the Phase-1 tenant surface.
3. **Task 2.7 — AuditModule strataApi rewire.** v2.0 §8 rescoped Task 2.7 to a unified activity-timeline viewer on the assumption that `AuditModule.tsx` already consumed data via `strataApi.ts`. Scheduling verified the module hits `localhost:3000/api/search` directly, bypassing the router. Rescope: the strataApi.ts rewire and the `/audit` static-handler extension (merging workitem actions log + communication_log by entity) are included in Task 2.7's ownership. No new task is created.

---

## §9. Verification Matrix (expanded from v1.0)

Legend: R = required; — = n/a at this phase; ≤B = must be ≤ baseline; =0 = must be zero.

| Check | 0.0 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `tsc -b` errors =0 | R | R | ✓ | R | R | R | R |
| `vitest run` failures ≤B | R | R | ✓ | R | R | R | R |
| `vitest run` new-test count ≥ tasks-in-phase | — | R | ✓ | R | — | — | R |
| `playwright test` failures ≤B (on dev box) | — | — | ✓ | R | R | R | R |
| `vite build` errors =0 | R | R | ✓ | R | R | R | R |
| `VITE_APPFOLIO_SEEDS=false vite build` functional | R | R | ✓ | R | R | R | R |
| PII-leak scan passes | R | R | ✓ | R | R | R | R |
| Manual dev-server smoke | — | — | ✓ | R | R | R | R |
| Screenshots in phase report | — | — | ✓ | R | R | R | R |
| axe-core violations ≤B on modified pages | — | R* | ✓ | R | R | R | R |
| Lighthouse LCP ≤ max(B, 500ms) | — | R* | ✓ | R | R | R | R |
| Pasted command output in PR | R | R | ✓ | R | R | R | R |
| Rollback SHA documented | R | R | ✓ | R | R | R | R |
| /security-review clean (High/Medium) | — | R | ✓ | R | R | R | R |
| CI green on branch | R | R | ✓ | R | R | R | R |
| Completion Report committed | R | R | ✓ | R | R | R | R |

*Phase 0 row — baselines captured, not enforced (establishing the reference values).

**Phase 1 column closed 2026-04-23 at HEAD `094b91e1b5991e42b1e5f5639553d6a1a541c2ef` (Task 1.5 merge). Per-row proofs live in `Docs/Phase1_Completion_Report.md` §5 (each ✓ cell is backed by a section reference: `tsc -b` → §2.a; `vitest` → §2.b; new-test count → §1; Playwright → §5 footnote (darwin snapshots present; Linux baselines deferred per §7 item 1); `vite build` → §2.c; `VITE_APPFOLIO_SEEDS=false vite build` → §2.e; PII-leak scan → §2.f; manual smoke → §3; screenshots → §3 + `Docs/Baselines/phase_1/*.png`; axe-core & LCP → Phase 0.0 macOS baselines at `Docs/Baselines/2026-04-21_Phase0_{axe,perf}_baseline.json` (no new violations introduced by additive schema work); pasted output → §2; rollback SHAs → §6; `/security-review` → §4 (High=0, Medium=0); CI green → run `24817509508` on `094b91e` + PR CI on this report's branch; report committed → this PR).**

**Phase 2 — per-task progress tracker** (Phase-2 column in the matrix above remains `R` until all 10 Phase-2 tasks close; each row-per-task below backs a task's exit-gate independently).

| Task | Status | Merge SHA | Closure date | Per-row proof location |
|---|:-:|---|---|---|
| 2.3 — ComplianceEngine: vendor matrix + Section-8 rollup | ✓ | `36ee8ca` | 2026-04-23 | `Docs/Phase2_Task_2_3_Completion_Report.md` (Summary / §2 strict-gate paste / §3 CDP render proof / §4 /security-review / §5 verification matrix / §6 rollback / §7 deferred / §8 next-task unblock) |
| 2.5 — InsuranceModule: FolioGuard enforcement | ✓ | `f6d3fb2` | 2026-04-23 | `Docs/Phase2_Task_2_5_Completion_Report.md` (same 8-section template as Task 2.3; backs every ✓ cell with a section reference) |
| 2.7 — AuditModule: unified activity timeline (B3 chain closure) | ✓ | `40875db` | 2026-04-23 | `Docs/Phase2_Task_2_7_Completion_Report.md` (same 8-section template as Task 2.3 / 2.5; backs every ✓ cell with a section reference) |
| 2.2 — CommunicationModule: seed + thread rollup + unified-timeline light-up | ✓ | `b98e84c` | 2026-04-24 | `Docs/Phase2_Task_2_2_Completion_Report.md` (same 8-section template as Task 2.3 / 2.5 / 2.7; backs every ✓ cell with a section reference) |
| 2.1 — CalendarModule: 9 AHA Section-8 inspection seed (Riverwood Club) | ✓ | `67768c9` | 2026-04-24 | `Docs/Phase2_Task_2_1_Completion_Report.md` (same 8-section template as Task 2.3 / 2.5 / 2.7 / 2.2; backs every ✓ cell with a section reference) |
| 2.10 — PropertyTimeline: multi-source merge for 128 Buena Vista | ✓ | `fba4d65` | 2026-04-24 | `Docs/Phase2_Task_2_10_Completion_Report.md` (same 8-section template as Task 2.3 / 2.5 / 2.7 / 2.2 / 2.1; backs every ✓ cell with a section reference) |
| 2.4 — Forecast: static `/forecast` handler + ForecastModule rewire (D3 scope; seed close-out deferred to Phase-3 AppFolio re-capture) | ✓ | `17c77b4` | 2026-04-24 | `Docs/Phase2_Task_2_4_Completion_Report.md` (same 8-section template as Task 2.3 / 2.5 / 2.7 / 2.2 / 2.1 / 2.10; backs every ✓ cell with a section reference) |
| 2.6 — Utilities: utility-vendor workitem seed (Duke Energy + Massey Pest on 128 BV, Georgia Power on Riverwood) | ✓ | `828bb11` | 2026-04-24 | `Docs/Phase2_Task_2_6_Completion_Report.md` (same 8-section template as Task 2.3 / 2.5 / 2.7 / 2.2 / 2.1 / 2.10 / 2.4; backs every ✓ cell with a section reference) |
| 2.8 — Sentiment: 3 static handlers + new at-risk fixture + SentimentModule rewire (`isStaticMode` precedent established) | ✓ | `0a7f3ef` | 2026-04-24 | `Docs/Phase2_Task_2_8_Completion_Report.md` (same 8-section template as Task 2.3 / 2.5 / 2.7 / 2.2 / 2.1 / 2.10 / 2.4 / 2.6; backs every ✓ cell with a section reference) |
| 2.9 | pending | — | — | — |

Task-2.3 / 2.5 / 2.7 closures reference Appendix D row 1's pre-recorded Phase-2 ownership of `packages/types/index.ts` (serial 2.3 → 2.5 → 2.7; text landed in PR #8 / `1bb7518` and preserved by all three PRs without re-edit). Task 2.5 rebased onto Task 2.3's type additions; Task 2.7 rebased onto Task 2.5's. **B3 serial chain CLOSED** at Task 2.7 merge (HEAD `40875db`): `packages/types/index.ts` Phase-2 serial ownership retires, and the remaining Phase-2 tasks open to the general pool per Appendix D's illustrative treatment. Task 2.2 (Communication seed, `b98e84c`) was the first general-pool task landed post-B3; Task 2.1 (Calendar AHA inspection seed, `67768c9`) was the second; Task 2.10 (PropertyTimeline multi-source merge, `fba4d65`) was the third; Task 2.4 (Forecast static handler + ForecastModule rewire, `17c77b4`) was the fourth; Task 2.6 (Utilities — 3 `type: 'utility'` workitems for Duke Energy + Massey Pest on 128 BV and Georgia Power on Riverwood) is the fifth. Task 2.4 closed READ-ONLY on `properties.json` (D3 scope per DoR PRE1 second-order drift discovery — see Changelog v2.7). The Appendix D 2.4 + 2.10 sequential constraint retires with both tasks landed READ-ONLY; any Phase-3 AppFolio re-capture PR gets a fresh Appendix D row. Task 2.6 extends Appendix D row 7's existing Phase-2 ownership of `workitems.json` (now `Task 2.1 → 2.6 sequential`) via status-quo routing — no new handler, no module rewire, no new fixture file (see Changelog v2.8).

---

## §10. Risk Register (owners + triggers, not just a list)

| # | Risk | Likelihood | Impact | Owner | Trigger | Mitigation |
|---|---|:-:|:-:|---|---|---|
| R-1 | Shared `Workitem` change breaks protected modules (Incident/Legal/Projects/Utilities/Leasing) | Med | High | Task 1.4 engineer | CI fails on protected module tests | GR-1; Task 1.4 exit gate runs ALL module tests, not just maintenance |
| R-2 | Real PII leaks into a public build | Low | High | Task 0.0.5 + 0.5 owners | `verify_no_pii_leak.mjs` finds a match | GR-7; flag + sanitize step + pre-commit hook |
| R-3 | Fixture volume regression makes demos look empty | Med | Med | Phase-4 reviewer | `Phase4_fixture_counts.json` < baseline | GR-3 enforced by the phase-4 gate script; per-phase check runs automatically |
| R-4 | Backend signature drift from static fixtures | Med | High | Task 5.1 engineer | Contract test 5.2 fails | GR-5; Task 5.2 runs contract tests against MSW mocks before real backend PR |
| R-5 | Perf regression from 30-field vendor render | Low | Med | Task 1.2 engineer | Lighthouse LCP > baseline + 5% | GR-10 Lighthouse gate; virtualize list if >200 items |
| R-6 | a11y regression from new collapsibles | Med | Med | Phase-3 engineer | axe-core new violation | GR-10; collapsibles use `aria-expanded`; unit tested |
| R-7 | Plan slippage (>12 days) | Med | Low | Plan owner | Phase exit >1 day behind schedule | Slip buffer built in (§12); phases 1-4 independently shippable |
| R-8 | AppFolio capture data goes stale | Low | Low | Data-refresh owner | New AppFolio UI structure drifts | Fixture-derivation script re-runnable against fresh captures; smoke test catches drift |
| R-9 | CI runners not sized for Playwright | Med | Med | DevOps | Playwright timeouts in CI | Use self-hosted runner with 8+ GB RAM for the parity pipeline; documented in `.github/workflows/` |
| R-10 | Node 25 not installable on an engineer's box | Low | Low | Dev owner | `node --version` < 25 | Docker-based dev container with pinned Node 25 image; documented in `Docs/DevBox_Setup.md` |
| R-11 | Sentry not wired for new error boundaries | Med | Low | GR-13 owner | Production error in a new boundary goes silent | Add error-boundary unit test that asserts Sentry breadcrumb; CI gate |

Each risk has a tracked trigger. When the trigger fires, the phase is Blocked; the owner resolves; the reviewer re-runs the gate.

---

## §11. Deprecation Schedule

Fields marked `@deprecated` in Phase 1-2 are not removed in this plan. Removal happens in a named future cleanup ticket with its own rollback. Schedule:

| Field | Deprecated in | Planned removal | Removal ticket |
|---|---|---|---|
| `EntityProfile.coiStatus` | Task 1.2 | 2026-Q3 | TBD |
| `EntityProfile.coiExpiry` | Task 1.2 | 2026-Q3 | TBD |
| `EntityProfile.w9OnFile` | Task 1.2 | 2026-Q3 | TBD |
| `EntityProfile.insuranceCarrier` | Task 1.2 | 2026-Q3 | TBD |
| `Workitem.metadata.*` ad-hoc keys replaced by first-class fields | Task 1.4 | 2026-Q4 | TBD |

Each removal ticket must: (a) verify no callers remain via `grep`, (b) bump API version, (c) ship a down-migration path, (d) give consumers ≥30 days notice.

---

## §12. Timeline with slip buffer

| Phase | Budget | Slip buffer | Total | Can parallelize? |
|---|:-:|:-:|:-:|:-:|
| 0.0 — Environment | 0.5 day | 0.25 | 0.75 | No (blocks everything) |
| 0 — Prep | 0.5 day | 0.25 | 0.75 | No |
| 1 — Top-5 schema | 3 days | 1 | 4 | Sequential within phase |
| 2 — Partial upgrades | 2 days | 1 | 3 | Parallel where conflict-free |
| 3 — UI polish | 2-3 days | 1 | 3-4 | Parallel |
| 4 — Real-data seeds | 1-2 days | 0.5 | 1.5-2.5 | Parallel |
| 5 — Live backend + E2E | 2-3 days | 1 | 3-4 | 5.1 first, then parallel |
| **Total** | **11-14 days** | **5 days buffer** | **16-19 working days** | |

Slip buffer is explicit, not implicit. If a phase consumes its buffer, the downstream phase is notified and the overall ship date moves. No silent slippage. Phases 1-4 are independently shippable if Phase 5 slips.

---

## §13. CI Integration

### Pipeline: `.github/workflows/appfolio-parity-gate.yml`
```yaml
name: AppFolio Parity Gate
on:
  pull_request:
    paths:
      - 'packages/types/**'
      - 'qualia-shell/src/**'
      - 'qualia-shell/public/data/**'
      - 'qualia-shell/src/test/appfolioParity/**'
jobs:
  gate:
    runs-on: ubuntu-latest-8-cores
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '25', cache: 'npm', cache-dependency-path: 'qualia-shell/package-lock.json' }
      - run: cd qualia-shell && npm ci
      - run: cd qualia-shell && npx tsc -b
      - run: cd qualia-shell && npx vitest run
      - run: cd qualia-shell && npx playwright install --with-deps
      - run: cd qualia-shell && npx playwright test
      - run: cd qualia-shell && VITE_APPFOLIO_SEEDS=true npx vite build
      - run: cd qualia-shell && VITE_APPFOLIO_SEEDS=false npx vite build --outDir dist-external
      - run: node Scripts/verify_no_pii_leak.mjs
      - run: cd qualia-shell && npx @axe-core/cli ...
      - run: cd qualia-shell && npx lhci autorun ...
      - name: Gate summary
        run: node Scripts/post_gate_summary_to_pr.mjs
```

**Red-CI protocol.** If CI is red on `main` for >24h, Phase work pauses and the team focuses on restoring green before any new Phase task starts.

**Required reviewers.** All Phase-1 PRs: 1 senior reviewer + 1 domain (types/shell) reviewer. Phase-5 PRs: +1 backend reviewer.

---

## §14. Communication / Reporting Cadence

- **Daily async.** Each engineer posts a 3-line update: (a) task + status, (b) blockers, (c) tomorrow. Posted in a dedicated Slack/Linear channel.
- **Phase-exit report.** At each phase exit, the author produces `Docs/Phase{N}_Completion_Report.md` with pasted tool output + screenshots + metrics deltas vs baseline.
- **Risk escalation.** Any R-1 through R-11 trigger → immediate post in the channel + page the risk owner. Phase is Blocked until resolved.
- **Ship report.** Phase-5 exit produces `Docs/Phase5_Ship_Report.md` with the full final metrics table (see Appendix A template) + demo recordings.

---

## §15. Observability

Every Phase-1+ user-visible addition must include:

1. **Error boundary** wrapping the new component with a Sentry-reported fallback.
2. **Feature flag read** via `import.meta.env.VITE_APPFOLIO_SEEDS` (Phase 1-4) or `VITE_PARITY_LIVE_BACKEND` (Phase 5). New risky behavior defaults to off.
3. **Sentry breadcrumb** on any user action that touches new code (click, expand, tab-switch).
4. **Structured log** on any failing API call, with `parity_task_id` in the context.

Unit test: for each new error boundary, add a test that forces it to render the fallback and asserts that a Sentry breadcrumb was emitted.

---

## §16. Security Review (GR-12)

Every PR that touches `appfolioDerived/`, `.env.example`, `strataApi.backend.ts`, or adds a new API endpoint must run `/security-review` in Claude Code. Findings:

- **High** → must be addressed pre-merge.
- **Medium** → must be addressed pre-merge OR explicitly accepted by a security reviewer with a written rationale in the PR.
- **Low** → tracked, can be deferred to Phase 5 cleanup.

Phase 5 ships only after a clean security review on the full backend-wiring PR.

---

## §17. Done Criteria — what "parity complete" means

Parity is **complete** when ALL are true:

1. Every "Covered" module renders at least the AppFolio fields captured. Evidence: screenshots in `Docs/Phase{1..5}_Completion_Report.md`.
2. Every "Partial" module is "Covered" or has a Phase2_Partial_Deferrals entry explaining why the gap is intentional.
3. All 8 Strata-unique modules pass their existing tests unchanged. GR-1 satisfied.
4. CI pipeline green on `main` with both `VITE_APPFOLIO_SEEDS` modes.
5. Real AppFolio-derived seeds used in dev/staging (GR-6). External-build fallback works cleanly (GR-7).
6. Gap-analysis scorecard rewritten: 22 "Covered" (was 12), 0 "Partial" (was 10), 8 "Strata-unique" (unchanged), 3 "Strata-extending" (unchanged).
7. Three demo recordings: Willie White, 2-Story Technical Roofing, WO 19511-1. Each demo references the underlying captured JSON for traceability.
8. `Docs/Phase5_Ship_Report.md` has pasted output from every Verification Matrix tool + the updated metrics table (Appendix A).
9. `/security-review` clean at Phase-5 merge.
10. No deprecated field has been removed mid-plan; removals scheduled in §11.

---

## §18. Appendix A — Metrics Template (populated at phase exits)

```json
{
    "phase": 1,
    "completed_at": "YYYY-MM-DDTHH:MM:SSZ",
    "metrics": {
        "tsc_errors": 0,
        "vitest_pass": 90,
        "vitest_fail": 9,
        "vitest_baseline_fail": 9,
        "playwright_pass": null,
        "playwright_fail": null,
        "vite_build_seconds_true": 8.07,
        "vite_build_seconds_false": 8.31,
        "lighthouse_lcp_ms": { "properties_detail": null, "residents": null, "vendors": null, "workorders": null },
        "axe_violations": { "properties_detail": null, "residents": null, "vendors": null, "workorders": null },
        "fixture_row_counts": { "properties": null, "entities": null, "workitems": null, "communications": null }
    },
    "pii_scan": "clean",
    "security_review": "clean",
    "screenshots": ["..."]
}
```

## §19. Appendix B — Task Dependency Graph (text form)

```
0.0.1 → 0.0.2 → 0.0.3 → 0.0.4 → 0.0.5 → 0.0.6 → 0.0.7 → 0.0.8
                                                              ↓
0.1 → 0.2 → 0.3 → 0.4 → 0.5
                          ↓
1.1 → 1.2 → 1.3 → 1.4 → 1.5
                          ↓
2.1, 2.2, 2.4, 2.6, 2.7, 2.8, 2.9 (parallel) ; 2.3 after 2.5 ; 2.10 after 2.4
                          ↓
3.1, 3.2, 3.3, 3.4 (parallel) — 3.5 moved to backlog
                          ↓
4.1, 4.2, 4.3, 4.4, 4.5, 4.6 (parallel) → 4.7 (last; feature flag flip)
                          ↓
5.1a → 5.1b → 5.1c → 5.1d → 5.2 → 5.3, 5.4, 5.5 (parallel) → 5.6, 5.7 (parallel)
```

## §20. Appendix C — Fixture-volume lower bound (GR-3)

| Collection | Baseline (VITE_APPFOLIO_SEEDS=false) | Phase-4 target (=true) |
|---|:-:|:-:|
| properties | 36 *(corrected v2.7; see drift note below)* | ≥36 *(retroactive — 8/10 page-1 absorbed in Phase-1; pages 2-5 deferred to Phase-3 re-capture)* |
| entities (tenants) | existing count | +13 AppFolio-derived |
| entities (vendors) | existing count | +4 AppFolio-derived |
| workitems | 500+ | +13 AppFolio-derived |
| communications | existing count | +10 AppFolio-derived (sanitized) |
| leases | existing count | +2 AppFolio-derived |
| compliance | existing count | +15 AppFolio-derived (6 vendor + 9 AHA) |

**Drift note (v2.7).** The original `properties` row read `4 / ≥54 (4 + 50 AppFolio)`. v2.7 corrects this retroactively after PRE1 verification under Task 2.4 surfaced that Task 1.3 era already absorbed 8 of 10 AppFolio `properties_page_1` rows (128 BV + 7 page-1 matches under non-AppFolio-namespaced UUIDs) into `properties.json`, growing the on-disk count from 4 → 36 without a corresponding Appendix C update. Tasks 2.3 / 2.5 / 2.7 / 2.2 / 2.1 / 2.10 all shipped against the stale appendix; none materially regressed. The 2 remaining page-1 rows (Andre' J Zohoury — personal-name PII; ANZO, LLC — provenance ambiguity) plus pages 2-5 (40 unrecaptured rows) consolidate into a single Phase-3 "AppFolio properties re-capture + absorption-audit" follow-up PR. Until that PR lands, the `properties` lower bound is the v2.7-corrected `36`. See Changelog v2.7 entry.

Baseline row is captured in `Docs/Baselines/2026-04-19_Phase0_fixture_counts.json` by Phase-0.1. Phase-4 exit gate asserts the target row.

## §21. Appendix D — File-ownership matrix (GR-11)

| File | Owner — Phase 1 | Owner — Phase 2 | Owner — Phase 3 | Owner — Phase 4 | Owner — Phase 5 |
|---|---|---|---|---|---|
| `packages/types/index.ts` | Task 1.1–1.5 sequentially | Phase-2 ownership: Task 2.3 → 2.5 → 2.7 (strictly serial). Tasks 2.5 and 2.7 rebase onto 2.3's type additions rather than modifying the file independently. | — | — | Task 5.1a |
| `qualia-shell/src/components/StrataDashboard/strataTypes.ts` | shadow of ↑ | ↑ | — | — | ↑ |
| `strataApi.static.ts` | Task 1.1 only | Task 2.* rebase onto each other | — | Task 4.7 only | — |
| `strataApi.backend.ts` | NO (GR-5) | NO | NO | NO | Task 5.1b |
| `public/data/properties.json` | Task 1.3 | Task 2.4 + 2.10 (sequential) | — | Task 4.1 | — |
| `public/data/entities.json` | Task 1.1 + 1.2 (sequential) | — | — | Task 4.2 + 4.3 | — |
| `public/data/workitems.json` | Task 1.4 | Task 2.1 → 2.6 (sequential; Task 2.1 closed 2026-04-24 at `67768c9`; Task 2.6 appended 3 `type:'utility'` rows, 1148 → 1151) | — | Task 4.4 | — |
| `public/data/compliance.json` | — | Task 2.3 + 2.5 (sequential) | — | Task 4.6 | — |
| `public/data/sentiment_scores.json` | — | Task 2.8 (NEW; 40 rows / 20 at-risk / deterministic from sorted `entities.json` tenantIds; Task 2.8 closed 2026-04-24) | — | Task 4.5 | — |
| `.env.example` | Task 0.5 | — | — | Task 4.7 | Task 5.1c |
| `appfolioDerived/*.ts` | generated by script; no hand-edits | same | same | same | same |

---

## Changelog

- **v2.9 (2026-04-24).** Incremental, non-breaking clarifications after Phase-2 Task 2.8 (Sentiment — 3 static handlers + new at-risk fixture + SentimentModule rewire) close — the sixth general-pool Phase-2 task landed post-B3. Additions:
  - §9 Phase-2 per-task tracker: Task 2.8 row added with ✓ status, `19eb965` commit ref (pre-squash; the post-merge sweep bumps to the squash SHA mechanically per the Task 2.6 / 2.4 / 2.10 / 2.1 / 2.2 / 2.5 / 2.3 precedent), and pointer to `Docs/Phase2_Task_2_8_Completion_Report.md`; pending-row narrowed from 2 to 1 item (`2.9` only — Task 2.8 removed; Phase-2 closure is one merge away).
  - Task 2.8 scope per plan v2.8 §8 L330 (authoritative on scope; v1 L144 still anchors the acceptance test "20 at-risk rows" + gate GR-4): **3 new static handlers in `strataApi.static.ts` (`/sentiment/scores`, `/sentiment/history`, `/sentiment/by-entity`) + new fixture `qualia-shell/public/data/sentiment_scores.json` (40 rows / 20 at-risk / deterministic from sorted `entities.json` tenantIds) + `SentimentModule.tsx` rewire off raw localhost fetches.** Mirrors Task 2.4's ForecastModule rewire pattern; matches Task 2.4 / 2.7 / 2.10 multi-source security discipline (parseInt-NaN-fallback, bounded clamps, strict `===` filters, defensive zero-aggregate for unknown entityId/tenantId).
  - Task 2.8 PRE0 → PRE1 drift discovery (Task 2.4-class pattern): v1 L144's "3,274 captured tenants / Past-status tenants" was pre-capture-actual estimation. PRE1 confirmed real surface is **322 active tenants, 0 non-active** — no "Past" status exists in the absorbed Phase-1 dataset. Resolution per (d) ack: **d1 + d3 hybrid** — pin 20 at-risk rows of the 322 active tenants (deterministic from sorted tenantId), document the missing ~2,950 tenant records as Phase-3 AppFolio re-capture deferral (completion report §7 entry #1). `entities.json` NOT touched per plan v2.8 §8 L330 explicit guard (the new fixture is the single source of at-risk truth).
  - **`isStaticMode` precedent established.** Task 2.8 commit C added `export const isStaticMode = USE_STATIC;` to `strataApi.ts:36` (right after the canonical 3-form-aware `USE_STATIC` derivation). First module-level static-mode helper in the codebase — `ProfilesModule.tsx:78` had only a code comment, not branching. Decisive evidence per (b) ack: `USE_STATIC` accepts THREE forms (`true`, `'true'`, `'1'`) per `strataApi.ts:23-24`; an inline `import.meta.env.VITE_USE_STATIC_API === 'true'` check would silently diverge from the router's routing decision when the flag is set as boolean `true` or `'1'`, sending POSTs to a backend that isn't there in static-mode builds. SentimentModule consumes `isStaticMode` to short-circuit the POST `/sentiment/response` write path with a "🗒️ Survey submission requires backend mode (static deck is read-only)" message + `sentiment.survey.submit.skipped` Sentry breadcrumb. Future module migrations (TenantPortalModule, CorporateReview) deferred per completion report §7 entry #4.
  - **Post-B3 4th additive append to `packages/types/index.ts`.** Section-comment block shape mirrors Task 2.4 L807 verbatim. 8 new types: `SentimentTrendDirection`, `SentimentChannel`, `SentimentResponse`, `SentimentScore`, `SentimentScoreView`, `SentimentHistoryStats`, `SentimentHistory`, `SentimentByEntity`. B3 serial chain remains CLOSED (no reopen); appendages by Task 2.2 / 2.10 / 2.4 / now 2.8 follow the general-pool pattern. Appendix D row 1 (`packages/types/index.ts`) text **UNCHANGED** per precedent across PRs #8–#16 + this PR (#17).
  - **Riverwood + Woodland Parc anchor convergence note (cross-task observation).** Phase-2 has consolidated heavily around two flagship properties — **Riverwood Club Apartments** (`705a6f52-…`; Task 2.1 9 AHA inspections + Task 2.6 Georgia Power utility seed + Task 2.8 26 of 40 sentiment rows including 14 of 20 at-risk) and **Woodland Parc Townhomes** (Task 2.9 Projects target per v1 L146). This is an emergent property of "first-N-by-sorted-id" picks landing on Riverwood-clustered tenants and a small set of pinned named properties. Phase-3 AppFolio re-capture should consciously distribute new seed work to a broader anchor set (e.g., 128 Buena Vista, 2070 Azalea, plus the page-2-through-5 properties not yet absorbed) to reduce single-property over-weighting in cross-task fixtures. Documented in completion report §7 entry #3.
  - Task 2.8 fixture-realism note (completion report §7 entry #2): `uniquePropertyIds.size === 2` is pinned in `sentiment.test.ts` test #7 so a future Phase-3 expansion bumps the constant deliberately rather than drifting silently. Target ≥5 per the Task 2.10 multi-source merge precedent.
  - Appendix D — NEW row added: `public/data/sentiment_scores.json` with Phase-2 = `Task 2.8`, Phase-4 = `Task 4.5`. Row 1 (`packages/types/index.ts`) UNTOUCHED per precedent. Row 6 (`entities.json`) UNTOUCHED per the v2.8 §8 L330 non-mutation guard.
  - Vitest delta net **+7** (8 new it-blocks − 1 placeholder). Final 159 → 166 (26 test files unchanged). Predicted exactly in DoR — actual matched.
- **v2.8 (2026-04-24).** Incremental, non-breaking clarifications after Phase-2 Task 2.6 (Utilities — utility-vendor workitem seed) close — the fifth general-pool Phase-2 task landed post-B3. Additions:
  - §9 Phase-2 per-task tracker: Task 2.6 row added with ✓ status, `32006aa` commit ref (pre-squash; the post-merge sweep bumps to the squash SHA mechanically per the Task 2.4 / 2.10 / 2.1 / 2.2 / 2.5 / 2.3 precedent), and pointer to `Docs/Phase2_Task_2_6_Completion_Report.md`; pending-row narrowed from 3 to 2 items (`2.8, 2.9` — Task 2.6 removed; Task 2.8 Sentiment retained pending per plan §8 L330 source-of-truth; Task 2.9 Projects retained pending per scheduling-pass §6 item #10).
  - Task 2.6 scope per plan v1 L140 one-liner (v2.7 §8 does NOT contain a dedicated `### Task 2.6` section; v1 L140 remains the sole authoritative spec text): **"Seed real utility vendor relationships: Georgia Power (2070 Azalea monthly), Duke Energy (128 Buena Vista water heater plan), Massey Pest (128 Buena Vista). Test: filter UtilitiesModule by 128 Buena Vista, 2 rows return. Gate: GR-4."** Landed as **(a4) status-quo** per DoR-PRE0 ack: extend `workitems.json` with 3 `type: 'utility'` rows (1148 → 1151); no new fixture file, no `/utilities` handler added, no UtilitiesModule rewire. Mirrors Task 2.1's `type: 'inspection'` 9-row seed pattern exactly.
  - Task 2.6 PRE0 → PRE1 scope refinement (Task 2.4-class pattern): PRE0 ceiling reading of v1 L140 would have written 3 fresh `entityType: 'vendor'` rows to `entities.json`. PRE1 re-verification confirmed Duke Energy (`ef78c6c4-…`), Massey Pest (`1dded118-…`), and Georgia Power (`5c304b26-…`) already exist as vendor entity rows in `entities.json` with correct `propertyIds` linkage (Duke→BV, Massey→BV, Georgia→Riverwood). Scope refined from "create vendor entity rows" → "workitem-level utility tracking rows only". `entities.json` NOT touched by Task 2.6 (Phase-4 owner per Appendix D row 6 preserved).
  - Task 2.6 READ-ONLY on `strataApi.static.ts` (DoR-PRE0 (b) ack) — `UtilitiesModule.tsx:41` routes through `/workitems?type=utility&property_id=X`; `strataApi.static.ts:104-110` `/workitems` handler natively filters on `type` + `property_id`. No `/utilities` route added (pure scope expansion with no user-visible delta). `strataApi.static.ts` removed from Phase-2 rebase-train contention for Task 2.6 entirely.
  - Task 2.6 READ-ONLY on `UtilitiesModule.tsx` (DoR-PRE0 (f2) ack) — Massey Pest seeded with `utilityType: 'trash'` fallback (UTILITY_TYPES enum closed at Phase-1 Task 1.4; extending with a `pest` key would trigger a GR-13 module retrofit). Module fallback path (`getTypeInfo` → UTILITY_TYPES[0] when key unknown) is intentionally not hit — `'trash'` is a recognized key, rendering the Trash icon with "Pest control — quarterly" in the notes field. UX polish (dedicated pest icon) deferred to Phase-3 follow-up per Task 2.6 completion report §7.
  - Task 2.6 GR-2 trivially clean (no `packages/types/index.ts` touch; Workitem interface reused as-is). Task 2.6 GR-5 trivially clean (no `strataApi.backend.ts` touch; no handler added). Task 2.6 GR-7 strict-clean: 3 sanitized `XXXX-XXXX-\d{4}` account-number placeholders + 3 null `monthlyCost` values (no real AppFolio billing figures; backfill deferred to Phase-3 AppFolio re-capture per completion report §7).
  - Appendix D row 7 (`public/data/workitems.json`) Phase-2 cell amended from `Task 2.1` to `Task 2.1 → 2.6 (sequential; Task 2.1 closed 2026-04-24 at 67768c9; Task 2.6 appended 3 'type:utility' rows, 1148 → 1151)`. Follows the 2.3→2.5→2.7 sequential-text precedent for within-phase multi-task file ownership. Appendix D row 1 (`packages/types/index.ts`) UNTOUCHED per precedent across PRs #8-#15 + this PR.
  - Commit-E vitest delta net +5 (not +6 as handoff estimated) — Phase-0 Task 0.4 scaffolded `utilities.test.ts` with 1 passing placeholder it-block that counted toward the 154 baseline. Replacing 1 placeholder with 6 real it-blocks → `-1 + 6 = +5`. Post-commit-E: 159/159 passed (26 test files unchanged).
- **v2.7 (2026-04-24).** Incremental, non-breaking clarifications after Phase-2 Task 2.4 (Forecast static handler + ForecastModule rewire) close — the fourth general-pool Phase-2 task landed post-B3. v2.7 also retroactively corrects three plan-level drifts surfaced during Task 2.4 PRE0/PRE1 verification. Additions:
  - §9 Phase-2 per-task tracker: Task 2.10 row Merge SHA backfilled to `fba4d65` (mechanical carry-over from PR #14 squash-to-main on 2026-04-24); Task 2.4 row added with ✓ status and pointer to `Docs/Phase2_Task_2_4_Completion_Report.md`; pending-row narrowed from 4 to 3 items (`2.6, 2.8, 2.9` — Task 2.4 removed; Task 2.8 Sentiment retained pending per plan §8 L330 source-of-truth).
  - Task 2.4 scope per §9 Clarification #1 (L329) + DoR PRE1 second-order discovery: **D3 (handler + rewire only; no seed)**. PRE1 re-verification revealed that Task 1.3 era already absorbed 8 of 10 AppFolio `properties_page_1` rows (128 BV + 7 name/address-matched page-1 rows under non-AppFolio-namespaced UUIDs). The "50-property seed" verb was effectively fulfilled then. Net-new ceiling refined from "9" (PRE0) → "2" (PRE1 re-verification: only Andre' J Zohoury + ANZO, LLC are truly novel) → "0" (D3 ack — both deferred to Phase-3 along with 40 unrecaptured page-2-through-5 rows).
  - Task 2.4 strataApi.static.ts handler at `qualia-shell/src/components/StrataDashboard/strataApi.static.ts:445-558` — new `/forecast` route returns typed `ForecastResult` projected from `units.json` (rentAmount × occupied count). Pure function; security discipline mirrors Task 2.7 / 2.10 (parseInt-with-NaN-fallback + bounded clamps on `months ∈ [1,36]`, `rentChange ∈ [-50,100]`, `occupancy ∈ [0,100]`; strict === filter on `propertyId`; defensive zeroed-aggregate for unknown propertyId; never throws).
  - Task 2.4 ForecastModule rewire at `qualia-shell/src/components/StrataDashboard/modules/ForecastModule.tsx` — replaces raw `fetch(localhost:3000/api/forecast)` with `strataGet<ForecastResult>('/forecast', params)`. Mirrors the Task 2.7 AuditModule rewire precedent (same pattern: module was bypassing the strataApi.ts router and showing "Could not connect to backend" in static mode). Retrofit: ErrorBoundary wrap + 2 Sentry breadcrumbs (`forecast.module.loaded`, `forecast.run`) + 6 data-testid anchors (`forecast-module`, `forecast-run-button`, `forecast-property-select`, `forecast-summary-{revenue,expenses,net,occupancy}`, `forecast-monthly-row`).
  - Task 2.4 GR-2 additive-only types: 4 new exports in `packages/types/index.ts` (`MonthlyForecast`, `ForecastSummary`, `ForecastAssumptions`, `ForecastResult`). Zero existing field touched; replaced two duplicate inline interface declarations on the consumer side with the typed contract.
  - Task 2.4 READ-ONLY on `properties.json` (D3 resolution) — no writes, no fields added. Test-level invariant asserts `properties.json` rowcount stays at the Phase-1 baseline (`>= PROPERTIES_BASELINE_PHASE_1 = 36`). The Appendix D 2.4 + 2.10 sequential constraint retires with both tasks landed READ-ONLY.
  - Drift correction #1 — §20 Appendix C `properties` row: `4 / ≥54 (4 + 50 AppFolio)` → `36 / ≥36` (retroactive). The original numbers were authored before Task 1.3 absorbed 7 page-1 rows + 1 BV detail row into `properties.json` under non-AppFolio-namespaced UUIDs. Tasks 2.3 / 2.5 / 2.7 / 2.2 / 2.1 / 2.10 all shipped against the stale appendix; none materially regressed. Pages 2-5 re-capture deferred to Phase-3.
  - Drift correction #2 — `VITE_APPFOLIO_SEEDS` flag-gate non-implementation on `properties.json` read path: `strataApi.static.ts:loadTable('properties')` does not gate on the flag (and never has — the flag only gates `appfolioDerived/*.ts` which is orphaned, never consumed by any route handler). The §8 L306 phrase "preserve the existing 4 mock properties as a fallback when `VITE_APPFOLIO_SEEDS=false` — merge, not replace" assumed an infrastructure that was never built. Documented per-DoR ack option B1: ship in both flag states (GR-7 strict scan is the real enforcement); test flag-flip → identical row count as a behavior-pin (status quo today and after Task 2.4).
  - Drift correction #3 — Task 1.3 era absorbed 8/10 AppFolio page-1 rows under non-AppFolio-namespaced UUIDs (rediscovered during Task 2.4 PRE1 re-verification). Affected rows: 128 BUENA VISTA DR N (`e4b440e9-…`), Azalea (`8e51b1cb-…`), Wayside, Harbor View, St Andrews, Ski Country Chalet, 305 Hilltop Drive, ANZO Consulting, LLC. Task 2.4 net-new ceiling refined from 9 → 2 → 0 (D3 chosen). Remaining 2 page-1 rows (Andre' J Zohoury — personal-name PII; ANZO, LLC — possible duplicate of ANZO Consulting LLC) + pages 2-5 (40 unseen rows) consolidated into a single Phase-3 "AppFolio properties re-capture + absorption-audit" follow-up PR.
  - Appendix D row 1 text UNTOUCHED (precedent preserved across PRs #8, #9, #10, #11, #12, #13, #14, and now this PR). Appendix D row 4 (`public/data/properties.json` — Task 2.4 + 2.10 sequential) is now retired — both tasks closed READ-ONLY; future Phase-3 re-capture PR opens a fresh Appendix D row.
- **v2.6 (2026-04-24).** Incremental, non-breaking clarifications after Phase-2 Task 2.10 (PropertyTimeline multi-source merge for 128 Buena Vista) close — the third general-pool Phase-2 task landed post-B3. Additions:
  - §9 Phase-2 per-task tracker: Task 2.1 row Merge SHA backfilled to `67768c9` (mechanical carry-over from PR #13 squash-to-main on 2026-04-24); Task 2.10 row added with ✓ status and pointer to `Docs/Phase2_Task_2_10_Completion_Report.md`; pending-row narrowed from 5 to 4 items (`2.4, 2.6, 2.8, 2.9` — Task 2.10 removed; Task 2.8 Sentiment retained pending per plan §8 L330 source-of-truth).
  - Task 2.10 scope per scheduling-pass §6 L38 (the plan doc §8 has no Task 2.10 body): **"PropertyTimeline — unified feed … Chronologically merge WO events + 19 attachments + 49 community emails for 128 Buena Vista."** Landed as **Option (b)** per DoR-PRE0 ack: scope-gate to the 4 BV rows currently seeded (2 insurance + 2 communications); upgrade multi-source merge handler; defer the 19+49 aspiration to Phase-3 with a test-level drift-bound `[4, 68)` assertion that pins the threshold.
  - Task 2.10 multi-source handler upgrade at `qualia-shell/src/components/StrataDashboard/strataApi.static.ts:511-639` — `/property-activity/{id}` grew from a workitems-only 9-line projection to a 5-source merge (workitems + communications + compliance + insurance) returning `PropertyTimelineView`. Also fixes two pre-existing latent bugs: `type: w.type` (workitem subtype, never matched ActivityEvent literal) now emits `type: 'workitem'` via widened ActivityEventSource union; `date:` output field replaced with `timestamp:` matching the ActivityEvent interface (pre-2.10 timeAgo() always rendered blank).
  - Task 2.10 audit_log EXCLUSION from property-scoped queries (Ambiguity #3 resolution) — security-critical cross-property leak guard ported from Task 2.7's precedent at L244. Test-level assertion: `sourceBreakdown.audit === 0` as a field-exists-with-value check (commit-3 handler pre-initializes all 6 ActivityEventSource keys to 0 explicitly per ack item 3).
  - Task 2.10 GR-2 widening safety: ActivityEvent.type union widened from 3 literals ('workitem' | 'incident' | 'audit') to 6 (+ 'communication' / 'compliance' / 'insurance'). Pre-widening grep verified no exhaustive-switch-with-never consumer in the repo — only PropertyTimeline.tsx L21-27 has a `switch(type)` and it already has a `default` case. tsc -b stays clean post-widening.
  - Task 2.10 READ-ONLY on `properties.json` (Ambiguity #4 resolution) — no writes, no fields added. The Appendix D 2.4 + 2.10 sequential constraint is non-conflict for this PR. Test-level invariant asserts properties.json rowcount stays at 36 (Task 1.3 baseline).
  - Appendix D row 1 text UNTOUCHED (precedent preserved across PRs #8, #9, #10, #11, #12, #13, and now #14).
- **v2.5 (2026-04-24).** Incremental, non-breaking clarifications after Phase-2 Task 2.1 (Calendar AHA Section-8 inspection seed) close — the second general-pool Phase-2 task landed post-B3. Additions:
  - §9 Phase-2 per-task tracker: Task 2.2 row Merge SHA backfilled to `b98e84c` (mechanical carry-over from PR #12 squash-to-main on 2026-04-24); Task 2.1 row added with ✓ status and pointer to `Docs/Phase2_Task_2_1_Completion_Report.md`; pending-row narrowed from 6 to 5 items (`2.4, 2.6, 2.8, 2.9, 2.10` — Task 2.1 removed; Task 2.8 Sentiment retained pending).
  - Task 2.1 scope per scheduling-pass §6 L29 (the plan doc §8 has no Task 2.1 body): **"Calendar — 9 AHA inspections"**. Seeded as append-only to `qualia-shell/public/data/workitems.json` (1139 → 1148 rows; Appendix D row L586 exclusive Phase-2 ownership honored). All 9 rows use the real `properties.json` UUID `705a6f52-f4a1-403b-ae3f-b3954b2cdac1` (Riverwood Club Apartments; DoR-PRE1/PRE2 mandate). Date distribution 3/3/2/1 across 2026-04-27..30 mirrors Task 2.3's `section8_rollup.json.uniqueInspectionDates` exactly.
  - Task 2.1 opportunistic in-place retrofit of `CalendarModule.tsx`: ErrorBoundary wrap + 2 Sentry breadcrumbs (`calendar.module.loaded`, `calendar.inspection.click`) + 6 data-testid anchors (Option α split: `calendar-inspection-event` on upcoming-events list only, `calendar-grid-event-dot` on month grid). Upcoming-events list slice bumped 8 → 30 to accommodate the 9-row seed. No structural refactor; Google/Apple Calendar integration surfaces (direct-fetch sites at L89/L102/L148 per scheduling-pass Flag 3 audit) preserved as deferred follow-up PR candidates.
  - Task 2.1 commit 0 piggyback: resolved Task 2.2 completion report §7 item 5 (CommunicationModule L121 search filter now queries `preview` field alongside `subject` + `fromAddress`). Opportunistic single-commit fix on the Task 2.1 branch per the Task 2.7 L131 archive-search rewire precedent.
  - Cross-source coherence note: the 9 new Task-2.1 Workitem rows use the real Riverwood UUID; Task 2.3's 9 pre-existing ComplianceRecord rows + `section8_rollup.json` use the synthetic `"riverwood-club"` id. Three sources numerically agree (9/9/9) but don't cross-link today — synthetic-UUID cleanup remains a deferred follow-up PR (tracked across Tasks 2.3 / 2.5 / 2.7 / 2.2 / 2.1 completion reports).
  - Appendix D row 1 text UNTOUCHED (precedent preserved across PRs #8, #9, #10, #11, #12, and now #13).
- **v2.4 (2026-04-24).** Incremental, non-breaking clarifications after Phase-2 Task 2.2 (Communication seed) close — the first general-pool Phase-2 task landed post-B3. Additions:
  - §9 Phase-2 per-task tracker: Task 2.7 row Merge SHA backfilled to `40875db` (mechanical carry-over from PR #11 squash-to-main on 2026-04-23); B3 closure note placeholder `(populated by this PR's squash-to-main)` replaced with literal `40875db`; Task 2.2 row added with ✓ status and pointer to `Docs/Phase2_Task_2_2_Completion_Report.md`; pending-row narrowed to 6 items (`2.1, 2.4, 2.6, 2.8, 2.9, 2.10` — Task 2.2 removed, Task 2.8 Sentiment retained pending).
  - **Task 2.2 (Communication) closed; earlier handoff mislabeling as 2.8 corrected at DoR per plan §9 source-of-truth.** The task spec draft initially called this "Task 2.8" but plan v2.3 §8 L330 + scheduling-pass §6 L36 both assign 2.8 to Sentiment static handlers, while §8 L305 explicitly assigns Communication to Task 2.2. Plan is source of truth; the task was executed and documented as Task 2.2 throughout the branch, PR, and completion report.
  - Task 2.2 opportunistic additive-only schema extension on `packages/types/index.ts` `Communication` interface — 5 optional fields (`propertyId`, `threadId`, `preview`, `readStatus`, `attachmentCount`) + 1 new union (`CommunicationReadStatus`) + 1 new aggregate (`CommunicationThreadRollup`). GR-2 preserved (zero Phase-1 consumer break).
  - Task 2.2 seed `communications.json` 0 → 6 rows across 3 real `properties.json` UUIDs (128 Buena Vista, Woodland Parc Townhomes, Riverwood Club Apartments). `audit_timeline_index.json` refreshed in the same commit: BV + WP communication counts 0 → 2 each, Riverwood added as 3rd row. Task 2.7 /audit/unified-timeline join now lights up `source: 'communication'` automatically via its pre-existing defensive `c.propertyId` read.
  - Appendix D row 1 text UNTOUCHED (precedent preserved across PRs #8, #9, #10, #11, and now #12).
- **v2.3 (2026-04-23).** Incremental, non-breaking clarifications after Phase-2 Task 2.7 close (B3 serial-chain closure). Additions:
  - §9 Phase-2 per-task tracker: Task 2.5 row Merge SHA backfilled to `f6d3fb2` (mechanical carry-over from PR #10 squash-to-main); Task 2.7 row added with ✓ status and pointer to `Docs/Phase2_Task_2_7_Completion_Report.md`; pending-row updated to `2.1, 2.2, 2.4, 2.6, 2.8–2.10` (2.7 removed).
  - §9 post-tracker note updated: **B3 serial chain CLOSED** at Task 2.7 merge. `packages/types/index.ts` Phase-2 serial ownership retires. Remaining Phase-2 tasks (2.1, 2.2, 2.4, 2.6, 2.8, 2.9, 2.10) open to general pool per Appendix D's illustrative treatment.
  - Scheduling-pass §6 item #9 ("AuditModule.tsx archive-search direct-fetch to localhost:3000") resolved opportunistically by Task 2.7 PR (the unified-timeline PR already touched the file, so the rewire to `strataGet('/search', ...)` landed in the same commit). Documented in Task 2.7 completion report §7.
  - Appendix D row 1 text UNTOUCHED (landed in PR #8 / `1bb7518`; preserved by PR #9, PR #10, and this PR).
- **v2.2 (2026-04-23).** Incremental, non-breaking clarifications after Phase-2 Task 2.5 close. Additions:
  - §9 Phase-2 per-task tracker: Task 2.3 row Merge SHA backfilled to `36ee8ca` (mechanical carry-over from PR #9 squash-to-main); Task 2.5 row added with ✓ status and pointer to `Docs/Phase2_Task_2_5_Completion_Report.md`.
  - Appendix D row for `public/data/compliance.json` currently reads `Task 2.3 + 2.5 (sequential)`, which the scheduling pass (`Docs/Session_Notes/2026-04-23_phase_2_schedule.md` §6 item #1) identified as over-specification: Task 2.5's task-body file list covers `insurance_policies.json` only. v2.2 formally accepts the scheduling-pass resolution (task-body lists govern non-conflict-prone files); Appendix D text stays untouched to avoid git no-op hunks but is documented as a deferred cleanup candidate when the broader Appendix D pass lands.
  - B3 chain status post-2.5: `2.3 ✓ / 2.5 ✓ / 2.7 unblocked`. Task 2.7 (AuditModule unified timeline) is the final link and can open immediately.
- **v2.1 (2026-04-23).** Incremental, non-breaking clarifications after Phase-2 Task 2.3 close. Additions:
  - §9 Phase-2 per-task progress tracker with Task 2.3 row flipped to ✓ and a reference to `Docs/Phase2_Task_2_3_Completion_Report.md`. Phase-2 column cells remain `R` until all 10 tasks close.
  - Formal credit: Appendix D row 1 Phase-2 ownership text ("Task 2.3 → 2.5 → 2.7 strictly serial") was landed by PR #8 (squash `1bb7518`) as part of the Phase-2 pre-req hygiene bundle. v2.1 leaves that text untouched — Task 2.3's PR (this one) relies on it rather than re-asserting it. Subsequent B3 chain tasks (2.5, 2.7) rebase onto Task 2.3's type additions per the declared serialization.
- **v2.0 (2026-04-19).** Rewrite after v1.0 self-scored 7/10. Additions:
  - §1 Definition of Ready, §2 Definition of Done
  - §3 GR-4 reworded from "binary green" to "no regression from baseline"
  - §3 GR-11 (merge discipline), GR-12 (security review), GR-13 (observability)
  - §5 Phase 0.0 Environment Prerequisites (8 new sub-tasks)
  - §4 Baseline metrics table (perf, axe, fixture counts)
  - §7 per-task file-path enumeration + contract-test specs
  - §8 Task 2.7 rescoped from banner to Audit Log viewer; Task 3.5 moved to backlog; Phase-5 Task 5.1 decomposed into 5.1a/b/c/d
  - §10 Risk register gained owners + triggers (vs v1.0 free-text list)
  - §11 Deprecation Schedule
  - §12 Timeline with explicit slip buffer (5 days across phases)
  - §13 CI pipeline YAML skeleton
  - §14 Communication cadence
  - §15 Observability requirements
  - §16 Security review
  - §18 Metrics template
  - §19 Task dependency graph
  - §20 Fixture-volume matrix (GR-3 vs GR-7 resolution)
  - §21 File-ownership matrix (GR-11 enforcement)
- **v1.0 (2026-04-19).** Initial plan. Self-graded 7/10.

---

**Signed-off readiness.** v2.0 is ready to execute when Phase 0.0 completes. Phase 0 (baseline + fixture derivation) has already completed under v1.0 and carries forward unchanged; Phase 0.0 is the new prerequisite gate that must pass before Phase 1 opens.

🧪
