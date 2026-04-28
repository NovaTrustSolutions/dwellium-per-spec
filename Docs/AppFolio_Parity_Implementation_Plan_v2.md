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
| 2.9 — Projects: canonical project workitem WO 19441-1 (Replace sheetrock, Woodland Parc Townhomes Unit 2767-3, vendor CS Cooper) — **Phase-2 closure** | ✓ | `1a7a39b` | 2026-04-25 | `Docs/Phase2_Task_2_9_Completion_Report.md` (same 8-section template as Task 2.3 / 2.5 / 2.7 / 2.2 / 2.1 / 2.10 / 2.4 / 2.6 / 2.8; backs every ✓ cell with a section reference) |

Task-2.3 / 2.5 / 2.7 closures reference Appendix D row 1's pre-recorded Phase-2 ownership of `packages/types/index.ts` (serial 2.3 → 2.5 → 2.7; text landed in PR #8 / `1bb7518` and preserved by all three PRs without re-edit). Task 2.5 rebased onto Task 2.3's type additions; Task 2.7 rebased onto Task 2.5's. **B3 serial chain CLOSED** at Task 2.7 merge (HEAD `40875db`): `packages/types/index.ts` Phase-2 serial ownership retires, and the remaining Phase-2 tasks open to the general pool per Appendix D's illustrative treatment. Task 2.2 (Communication seed, `b98e84c`) was the first general-pool task landed post-B3; Task 2.1 (Calendar AHA inspection seed, `67768c9`) was the second; Task 2.10 (PropertyTimeline multi-source merge, `fba4d65`) was the third; Task 2.4 (Forecast static handler + ForecastModule rewire, `17c77b4`) was the fourth; Task 2.6 (Utilities — 3 `type: 'utility'` workitems for Duke Energy + Massey Pest on 128 BV and Georgia Power on Riverwood) is the fifth. Task 2.4 closed READ-ONLY on `properties.json` (D3 scope per DoR PRE1 second-order drift discovery — see Changelog v2.7). The Appendix D 2.4 + 2.10 sequential constraint retires with both tasks landed READ-ONLY; any Phase-3 AppFolio re-capture PR gets a fresh Appendix D row. Task 2.6 extends Appendix D row 7's existing Phase-2 ownership of `workitems.json` (now `Task 2.1 → 2.6 sequential`) via status-quo routing — no new handler, no module rewire, no new fixture file (see Changelog v2.8).

**Phase 3 — per-task progress tracker** (Phase-3 column in the matrix above remains `R` until all Phase-3 tasks close; mirrors the Phase-2 sub-tracker shape used during 2.3 → 2.9 closure sequence).

| Task | Status | Merge SHA | Closure date | Per-row proof location |
|---|:-:|---|---|---|
| 3.1 — (parallel batch; not yet started) | R | — | — | — |
| 3.2 — Vendor detail 10-block layout (10 NEW exported Block components for Identity / Contact / Portal / Federal Tax / Accounting / Payment Type / Compliance / Survey / Notes / Activity per v1 plan L166; 1 NEW scoped ErrorBoundary wrap on overview-tab content; 1 NEW consolidated Sentry breadcrumb on block-toggle; 10 NEW `data-testid` anchors; Accounting/Compliance blocks compressed 3-KPI cross-link summaries; Survey/Activity blocks Placeholder stubs per L168; metadata fallback chain on Blocks 1-7 per Drift #10 + Drift #11; `parseLegacyDate` helper normalizes legacy MM/DD/YYYY metadata expirations to ISO; `BlockCompliance` accepts injectable `today?: Date` for deterministic test assertions) — second parallel-batch task; LAYOUT-CLASS second PRE2 calibration data point (typed+stub+fallback mix) | ✓ | `c5113e9` | 2026-04-28 | `Docs/Phase3_Task_3_2_Completion_Report.md` (same 8-section template as Tasks 3.7 / 3.8 / 3.9 / 3.3; backs every ✓ cell with a section reference) |
| 3.3 — Property detail tab parity (4 NEW AppFolio core tabs: Budget / Marketing / Comparables / Showing Settings — stubs only per v1 L168 acceptance, Phase-5 wires real content; 1 NEW tab-switch breadcrumb + 8 NEW data-testid anchors + 4 NEW Placeholder components mirroring L52-72 byte-shape) — first parallel-batch task; LAYOUT-CLASS first PRE2 calibration | ✓ | `d2c5652` | 2026-04-27 | `Docs/Phase3_Task_3_3_Completion_Report.md` (same 8-section template as Tasks 3.7 / 3.8 / 3.9; backs every ✓ cell with a section reference) |
| 3.4 — (parallel batch; not yet started) | R | — | — | — |
| 3.7 — Projects: GR-13 retrofit (ErrorBoundary + 4 Sentry breadcrumbs + 7 `data-testid` anchors + isStaticMode write-guard) — first PR in 3-PR retrofit chain | ✓ | `fe9b642` | 2026-04-25 | `Docs/Phase3_Task_3_7_Completion_Report.md` (same 8-section template as Task 2.9; backs every ✓ cell with a section reference) |
| 3.8 — CorporateReview: GR-13 retrofit + raw fetch → strataApi rewire (ErrorBoundary + 6 Sentry breadcrumbs + 11 `data-testid` anchors + 5 isStaticMode write-guards + `strataUpload<T>` multipart precedent + 6 static handlers + 12-doc fixture + 5th post-B3 type hoist) — second PR in 3-PR retrofit chain | ✓ | `b4b7c9a` | 2026-04-25 | `Docs/Phase3_Task_3_8_Completion_Report.md` (same 8-section template as Task 3.7; backs every ✓ cell with a section reference) |
| 3.9 — TenantPortal: GR-13 retrofit + authFetch → strataApi rewire (ErrorBoundary + 4 Sentry breadcrumbs + 11 `data-testid` anchors + 1 isStaticMode write-guard + 6 GET + 1 POST static handlers + 2 NEW fixtures + 6th post-B3 type hoist) — third and **final** PR in 3-PR retrofit chain (closure retires the sequential chain entirely) | ✓ | `08fc669` | 2026-04-26 | `Docs/Phase3_Task_3_9_Completion_Report.md` (same 8-section template as Tasks 3.7 + 3.8; backs every ✓ cell with a section reference) |

Pending row: `3.1, 3.4` (Task 3.7 closed 2026-04-25 at squash SHA `fe9b642`; Task 3.8 closed 2026-04-25 at squash SHA `b4b7c9a`; Task 3.9 closed 2026-04-26 at squash SHA `08fc669` — the retrofit chain is now RETIRED in entirety; Task 3.3 closed 2026-04-27 at squash SHA `d2c5652` — first parallel-batch task; LAYOUT-CLASS first PRE2 baseline calibrated at +4 vitest delta; Task 3.2 closed 2026-04-28 at squash SHA `c5113e9` — second parallel-batch task; LAYOUT-CLASS second PRE2 calibration data point at +11 vitest delta with metadata-fallback chain on Blocks 4/5/6/7). Phase-3 column flips `R` → `✓` when the last row closes. Phase-3 GR-13 retrofit chain (3.7 → 3.8 → 3.9) is sequential by design (each rebases on prior to inherit the Inner-wrapper + ErrorBoundary precedent without churn); 3.1–3.4 are the parallel batch from §19 dependency graph and remain unblocked by the retrofit chain. Task 3.7 was the first Phase-3 task to land (closed Task 2.8 §7 "ProjectsModule" entry + Task 2.9 (f) §7 + §8 row 8 "ProjectsModule GR-13 retrofit" — see Changelog v2.11). Task 3.8 is the second to land (closed Task 2.8 §7 "CorporateReview" entry + Task 3.7 §7 entry #3 Playwright workaround — VALIDATED at Task 3.8 CDP probe; see Changelog v2.12). Task 3.9 is the third and final retrofit-chain task (closes Task 2.8 §7 "TenantPortalModule" entry — final entry in that ledger retires; see Changelog v2.13). Phase-3 deferred-items ledger drops 6 → 5 with Task 3.9's close. Appendix D Phase-3 column was UNTOUCHED through Task 3.7 (precedent extended PRs #8 → #19); Task 3.8 supersedes (4 row updates + 1 NEW row for `corporate_review.json`); Task 3.9 extends with 4 row updates + 2 NEW rows for the tenant_portal fixtures — see Changelog v2.13.

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

Unit test: for each new error boundary, add a test that forces it to render the fallback and asserts that `reportError` was called with the `ErrorBoundary` tag (which then routes to `Sentry.captureException` via `services/errorReporter`). [v2.12 wording correction — see Changelog. Tasks 3.7 / 3.8 / 3.9 follow this corrected mandate; the original "Sentry breadcrumb was emitted" wording predated the `services/errorReporter.ts` indirection.]

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
| `packages/types/index.ts` | Task 1.1–1.5 sequentially | Phase-2 ownership: Task 2.3 → 2.5 → 2.7 (strictly serial). Tasks 2.5 and 2.7 rebase onto 2.3's type additions rather than modifying the file independently. | Task 3.8 → 3.9 sequential (Task 3.8: 5th post-B3 additive amendment — `ReviewStatus` + `DocPriority` + `ReviewDocument` hoist from `CorporateReview.tsx:14-28`; precedent break from Task 3.7 which was the only post-B3 task to skip; Task 3.9: 6th post-B3 additive amendment — `PortalTab` + `TenantPortalPagination` + `TenantPortalStats` + `TenantPortalMessage` hoist from `TenantPortalModule.tsx`; v2.11 prediction "stays empty for all rows" superseded by v2.12 → v2.13) | — | Task 5.1a |
| `qualia-shell/src/components/StrataDashboard/strataTypes.ts` | shadow of ↑ | ↑ | ↑ (Task 3.8 adds 3 re-exports: `ReviewStatus`, `DocPriority`, `ReviewDocument`; Task 3.9 adds 4 re-exports: `PortalTab`, `TenantPortalPagination`, `TenantPortalStats`, `TenantPortalMessage`) | — | ↑ |
| `strataApi.static.ts` | Task 1.1 only | Task 2.* rebase onto each other | Task 3.8 → 3.9 sequential (Task 3.8: 6 NEW handlers — 1 GET `/corporate-review` with status+search filter + 5 POST: upload [multipart with `static-upload-${randomUUID}` ID prefix] / triage / approve / reject / create-workitem; +1 export `strataUpload<T>` for FormData; +86 lines. Task 3.9: 7 NEW handlers — 6 GET `/tenant/admin/{stats,directory,maintenance,payments,messages,lease-alerts}` [4 derived from existing fixtures + 2 fixture-backed; substring-search filter on string fields only; lease-alerts uses Number.isFinite-guarded Date arithmetic] + 1 POST `/tenant/admin/messages/{tenantId}` [`static-msg-${randomUUID}` ID prefix mirrors Task 3.8 precedent]; +246 lines. NO additions to strataApi.ts or strataApi.backend.ts in 3.9 — first post-3.8 task to consume existing patterns exclusively, establishing the precedent that retrofit-chain tasks add to strataApi only when introducing a new transport pattern.) | Task 4.7 only | — |
| `strataApi.backend.ts` | NO (GR-5) | NO | Task 3.8 (shape-contract addition only — `strataUpload<T>` re-export, +16 lines; required to keep static/backend impl-parity per `strataApi.ts:8-9` invariant; does NOT change real-backend logic, so GR-5 spirit preserved). Task 3.9 SKIPS — no shape-contract changes (consumes existing strataGet + strataPost only). | NO | Task 5.1b |
| `public/data/properties.json` | Task 1.3 | Task 2.4 + 2.10 (sequential) | — | Task 4.1 | — |
| `public/data/entities.json` | Task 1.1 + 1.2 (sequential) | — | — | Task 4.2 + 4.3 | — |
| `public/data/workitems.json` | Task 1.4 | Task 2.1 → 2.6 → 2.9 (sequential; Task 2.1 closed 2026-04-24 at `67768c9`; Task 2.6 appended 3 `type:'utility'` rows, 1148 → 1151; Task 2.9 appended 1 `type:'work_order'` project row WO 19441-1, 1151 → 1152) | — | Task 4.4 | — |
| `public/data/compliance.json` | — | Task 2.3 + 2.5 (sequential) | — | Task 4.6 | — |
| `public/data/sentiment_scores.json` | — | Task 2.8 (NEW; 40 rows / 20 at-risk / deterministic from sorted `entities.json` tenantIds; Task 2.8 closed 2026-04-24) | — | Task 4.5 | — |
| `public/data/corporate_review.json` | — | — | Task 3.8 (NEW; 12 docs / 4 pending / 3 triaged / 3 approved / 2 rejected; deterministic uuid5 IDs from `00000000-0000-0000-0000-000000003008` namespace; FK-correct workitemId on all 3 approved rows pointing into `workitems.json`; PII-clean per strict allowlist `*.dwellium.test`) | TBD (likely N/A — Dwellium-native surface, no AppFolio source) | — |
| `public/data/tenant_portal_payments.json` | — | — | Task 3.9 (NEW; 10 rows / 6 paid / 2 pending / 2 overdue; stable IDs `tp-pay-NNN`; FK-correct on every row's tenantId pointing at an `entityType=tenant` row in `entities.json` AND propertyId pointing at a row in `properties.json`; PII-clean — no email/phone fields in the row shape; serves /tenant/admin/payments static handler) | TBD (likely N/A — Dwellium-native surface, no AppFolio source) | — |
| `public/data/tenant_portal_messages.json` | — | — | Task 3.9 (NEW; 10 rows / 6 inbound / 4 outbound; 3 reply pairs across Jimmy Armour faucet leak / Aletha Armstrong lease renewal / Navana Williams late fee threads; stable IDs `tp-msg-NNN`; FK-correct on every row's tenantId pointing at an `entityType=tenant` row in `entities.json`; PII-clean — synthetic operational language in body fields; serves /tenant/admin/messages static handler AND the POST `/tenant/admin/messages/{tenantId}` createRecord write target) | TBD (likely N/A — Dwellium-native surface, no AppFolio source) | — |
| `.env.example` | Task 0.5 | — | — | Task 4.7 | Task 5.1c |
| `appfolioDerived/*.ts` | generated by script; no hand-edits | same | same | same | same |

---

## Changelog

- **v2.16 (2026-04-28). Phase-3 parallel-batch SECOND task lands.** Task 3.2 (Vendor detail 10-block layout — additive overview-tab render extension per v1 plan L166: 10 NEW exported Block components + 1 NEW scoped ErrorBoundary wrap + 1 NEW consolidated Sentry breadcrumb on block-toggle + 10 NEW `data-testid` anchors; Accounting/Compliance blocks render as compressed 3-KPI summaries cross-linking to existing dedicated tabs; Survey/Activity blocks render as Placeholder stubs per L168 precedent) is the **second** PR in the Phase-3 parallel batch (`3.1, 3.2, 3.3, 3.4`). Selected second per the recommendation matrix: medium-low risk (matches CLAUDE.md L21 ack); schema defined in Task 1.2; data-driven render extends the 3.3 stub baseline. Scope: 1 single-file additive edit (`VendorsModule.tsx` +323 / −31 at commit C — LOC variance from kickoff predicted +155 / −10 due to helper-function extraction `BlockRow` + `BlockSection` + `xLinkBtnStyle` + `fmtIsoDate` + `parseLegacyDate` + null-safe Notes 3-case rendering; functional scope unchanged) + 1 NEW test file (`vendors.module.test.tsx`, 187 lines / 11 it-blocks). NO fixture / type / handler / Appendix-D writes — additive-only render-layer extension. Additions:
  - §9 Phase-3 sub-tracker Task 3.2 row description filled in at sweep commit on main; status flipped `R` → ✓ + backfilled squash SHA `c5113e9` + closure date 2026-04-28 (mirrors Task 3.7 / 3.8 / 3.9 / 3.3 sweep precedent).
  - §21 Appendix D — **NO row updates required** (VendorsModule.tsx is component code, not in the file-ownership matrix; mirrors Task 3.3 precedent / Plan v2.14 entry ruling). The Appendix D activation triggered at Task 3.8 (5th post-B3 type hoist) does NOT extend to layout-class tasks unless they amend a matrix-tracked file.
  - DoR ack chain — Q1 Block 5 KPIs (`paymentType` + `paymentTerms` + `onlinePayablesEnabled`) and Block 7 KPIs counter-proposed (`activeCount` + `nearestExpiry` + `expiredCount` with red-text affordance for delinquency); Q2 default-EXPANDED state (AppFolio parity per v1 plan L166 "matching AppFolio's visual grouping"); Q3 Block 9 Notes Option A (`vendor.metadata?.notes` null-safe; stub if absent); date-injection on `BlockCompliance` via optional `today?: Date` prop (default `new Date()`) for deterministic test assertions while keeping production caller surface unchanged. (a)–(f): (a) additive-only render-layer extension; (b) 10 Block render bodies with `BlockRow` label/value rows; (c) +1 consolidated breadcrumb on block-toggle (post-3.2 total: 0 existing + 1 new = 1; module Sentry breadcrumb count 0 → 1); (d) 10 NEW testids (`vendor-block-{slug}` per block); (e) append-overview-tab content (legacy COI Tracking subsumed by Block 7 + legacy inline Notes subsumed by Block 9 — both removed); (f) NEW `vendors.module.test.tsx` with 11 it-blocks (10 typed-path + 1 fallback-path BlockCompliance for `parseLegacyDate` normalize); **+11 vitest delta → 207/207 (33 test files, +1 file)**; LAYOUT-CLASS second baseline calibration data point (matches kickoff prediction exactly).
  - **12 drift catches absorbed at commit C** (9 from recon pre-PRE0 + 3 from pre-flight discovery; all addressed in scope or §7 deferred): (1) ErrorBoundary surface scoped not top-level — top-level wrap deferred to v2.17+ structural-rework; (2) 10-block ↔ schema field mismatch — Survey + Activity stub per L168; (3) handler coverage — 4 GET stubs exist + 5 POST sub-routes have no static handler (latent bug captured §7); (4) POST sites — 14 mutating sites EXPLICITLY DEFERRED to v2.17+ (3× the 3.8 record); (5) fixture realism in appfolioDerived/vendors.ts (9 records, not 3,218 as kickoff said — partial walk-back); (6) test-design path B (block isolation, mirrors 3.3 calibration); (7) `vendors.test.tsx` fixture UUID `48be69c5-…b1a5` is canonical, NOT `…2716`-suffix UUID (Randy's Tub-N-Tile coincidental different vendor); (8) authoritative `paymentType` is `"Zelle"` (entities.json), NOT `"Check"` (appfolioDerived divergence per gap analysis L213); (9) Plan v2 row narrows 3 → 2 post-3.2 close; (10) Drift #10 — Blocks 1/2/3 read `EntityProfile.metadata` (not core); arrays narrowed to single-value (`emails[]` / `phones[]` are NOT on EntityProfile core); website rendered as `'—'` (unsourced); tri-state Portal logic (`'Yes'` / `'No'` / absent → `'Activated'` / `'Not activated'` / `'Not configured'`); (11) Drift #11 — only 1/3,218 vendor entities have typed Task-1.2 blocks; Blocks 4/5/6/7 implement metadata fallback chains for the 3,217 remaining vendors per the deprecation comment at `packages/types/index.ts` L237-241 ("string-bag fields are retained on metadata for back-compat"); `parseLegacyDate()` helper normalizes legacy MM/DD/YYYY metadata expirations to ISO Date for `BlockCompliance` KPIs; fixture-realism backfill of typed Task-1.2 blocks across 3,217 non-canonical vendor rows is a v2.18+ task; (12) Drift #12 — pre-existing latent crash on performance tab (`VendorsModule.tsx` L1329 reads `performance.totalSpend` but static handler at `strataApi.static.ts` L980 returns `{rating, totalJobs, onTime, avgCost}` without `totalSpend`); UNTOUCHED by 3.2 (component code unchanged at that line); CDP probe regression loop skips `performance` tab to avoid the crash but verifies all 7 tab BUTTONS render (DOM presence check); captured as v2.17+ §7 follow-up.
  - GR-checks (additive-only — no removals beyond the COI/Notes legacy subsumption; no signature changes; existing 9 vendor records in `appfolioDerived/vendors.ts` unchanged) / GR-1 N/A (no schema change) / GR-2 N/A (no fixture changes) / GR-3 (+1 scoped ErrorBoundary wrap on overview-tab content [module count 2 → 3] + 1 consolidated Sentry breadcrumb on block-toggle [module count 0 → 1]) / GR-5 N/A (zero new POST sites; existing 14 mutating sites explicitly deferred to v2.17+ per scoping decision) / GR-7 (+10 testids, no retroactive tab-button anchors) / GR-13 N/A (chain RETIRED 2026-04-26 at Task 3.9; 3.2 is layout-class parallel-batch, not retrofit).
  - **CDP render proof — 10/10 guards passed** (`Docs/Baselines/phase_3_task_3_2/cdp_summary.json`): pageLoadsZeroConsoleErrors + vendorListHasRows + vendorDetailOpens + allTenBlocksVisible + blockToggleCollapses + accountingCrossLinkWorks + complianceCrossLinkWorks + blockToggleNoErrors + sevenTabsIntactNoErrors + overviewRerenderOk + allPass. **9b adaptation note**: regression click loop skips the `performance` tab per Drift #12 (pre-existing latent bug surfaced — captured §7 entry #9). The 7-tab DOM presence probe (9a) verifies all 7 tab BUTTONS render in the tab bar regardless of click outcome. 3 PNG screenshots saved (vendor detail with 10 blocks / accounting tab via cross-link / compliance tab via cross-link). Programmatic native click via `page.evaluate(...)` was the DEFAULT (Task 3.7 §7 entry #3 retired by demonstration at Task 3.8 — extends through 3.3 to 3.2 with the same surface; switched from Playwright `locator.click()` mid-probe when `<main>` element intercepted pointer events on below-fold cross-link buttons).
  - **/security-review** — zero findings (8 categories examined). React JSX auto-escaping protects all rendered fields; no `dangerouslySetInnerHTML` / no `eval` / no `new Function` / no untrusted-input → exec path. Sentry breadcrumb payload (`{block: <typed-enum>, expanded: <bool>, vendorId: <UUID>}`) contains no PII. `BlockFederalTax` renders `taxIdMasked` (already pre-masked) and `taxFormAccountNumber` — same authenticated authorized-user surface as existing `AccountingTab`/`ComplianceTab` subcomponents and the legacy inline COI/Notes UI. No new attack surface introduced.
  - **Module-graph drift**: `StrataDashboard-jKtUqWrV.js` (Task 3.3 close, held byte-identical through v2.15 meta-PR) → `StrataDashboard-DFmgzha6.js` (Task 3.2 commit C); chunk size 1,016.61 → 1,024.52 kB (**+7.91 kB ungzipped, +1.94 kB gzip — middle of predicted +6-12 kB / +1.5-3 kB band**). Bigger drift than Task 3.3's +2.56 kB / +0.44 kB because Task 3.2 adds 10 Block functions (~2.5× 3.3's 4 placeholders) + helpers (`BlockRow` + `BlockSection` + `xLinkBtnStyle` + `parseLegacyDate` + `fmtIsoDate`) + overview-tab JSX restructure + ErrorBoundary scoped wrap + breadcrumb wrap + 10 testid templates + collapse-state map + metadata fallback chains. Module-count parity **3278 === 3278** holds across both build modes. Chunk hash byte-identical across `VITE_APPFOLIO_SEEDS` flag (additive render code only, no flag-conditional logic).
  - **Vitest delta net +11** (10 typed-path block contracts + 1 fallback-path BlockCompliance for `parseLegacyDate` normalize). 196 → **207** (33 test files, +1 file). LAYOUT-CLASS second PRE2 calibration data point — matches DoR (f) prediction exactly. Layout-class baseline now anchored across two data points: 3.3 +4 (4 placeholder stubs) / 3.2 +11 (10 Block components + 1 fallback-path test). Subsequent parallel-batch tasks (3.1 26-section / 3.4 15-section) will calibrate further.
  - **Deferred items § 7 ledger** grows from kickoff's 5 entries to 9 entries: (1) 14 isStaticMode write-guards on existing mutating sites — v2.17+; (2) Top-level ErrorBoundary wrap on default export — v2.17+ (joins TenantPortalModule + PropertiesModule top-level wrap candidates); (3) Static handlers for 5 currently-broken POST sub-routes (`/vendors/:id/documents`, `/onboard`, `/deactivate`, `/approve`, `/ledger`) — v2.17+; (4) Path A integration test for block-toggle Sentry breadcrumb-payload assertion — v2.17+; (5) Tab-switch breadcrumb retroactive instrumentation — v2.17+ (joins existing tab-bar testid candidate from §9 row 3.3 follow-up); (6) Schema enrichment for `EntityProfile` — `website?: string` + `emails?: string[]` + `phones?: string[]` + `primaryAddress?: { street, city, state, zip }` per Drift #10 — v2.18+; (7) Fixture-realism backfill of typed Task-1.2 blocks across 3,217 non-canonical vendor rows in entities.json by deriving from existing legacy metadata strings (script-driven; canonical 2-STORY shows the target shape) per Drift #11 — v2.18+; (8) Fallback-path test coverage for Blocks 4/5/6 metadata chains (BlockCompliance has fallback-path coverage shipped in 3.2; other 3 blocks deferred) — v2.17+; (9) Pre-existing performance.totalSpend handler/render mismatch per Drift #12 — v2.17+ (either update static handler shape to include `totalSpend` OR update render to null-safe access).
  - **v2.17+ candidate list refresh**: Playwright baseline pass-count drift (slid from v2.16 — that slot was claimed by Task 3.2); structural rework (4 items now: 5 inline tab components in TenantPortalModuleInner + MessagesTab missing-key warning + PropertiesModule top-level ErrorBoundary wrap + VendorsModule top-level ErrorBoundary wrap); Path A integration test for tab-switch + block-toggle breadcrumb-payload assertion; Drift #12 performance.totalSpend mismatch fix.

- **v2.15 (2026-04-27). Node.js 20 Actions deprecation bump (standalone meta-PR).** Standalone meta-PR (PR #23, squash-merge `2f8a423`) — 5 GitHub Actions references bumped @v4 → @v5 across `.github/workflows/appfolio-parity-gate.yml` (L44/47/97 — `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`) and `.github/workflows/pii-scan.yml` (L25/28 — `actions/checkout`, `actions/setup-node`). Driver: GitHub Actions Node 20 runtime deprecation (cutoff 2026-09-16). v5 actions run on Node 24. Backward compatibility: parity-gate uses `node-version-file: 'qualia-shell/.nvmrc'` (Node 22 — overrides v5 default of 24); pii-scan hardcodes `node-version: '25'` (overrides v5 default). No runtime drift. CI: both workflows green on first dispatch — auto-fired on `pull_request` trigger, no manual dispatch needed; `PII Scan` 30s + `AppFolio Parity Gate` 6m49s on PR-branch run pair `25031727036` + `25031727047`; single-dispatch discipline per Task 3.8 closure held. Drift: zero source/schema/data/test changes. Module-graph parity holds (chunk hash `jKtUqWrV` byte-identical from Task 3.3 close). PII strict scope clean. vitest 196/196 unchanged. Both vite build modes pass. Plan surgery: NO §9 sub-tracker row (meta-PR, not Phase-3 task); NO §21 Appendix D row update (workflows not in file-ownership matrix); NO per-task completion report file (`Docs/Phase3_Task_*` naming reserved for tracked tasks). Closes one of the four Phase-3 plan-version follow-ups (Node 20 deprecation bump) tracked at v2.13 / v2.14 ack chains; surviving 3 follow-ups: Playwright baseline pass-count drift (slid to v2.16+ candidate), structural rework (3 items: TenantPortalModule inline tabs + MessagesTab missing-key + PropertiesModule top-level ErrorBoundary wrap), Path A integration test for tab-switch breadcrumb-payload assertion. Next: Phase-3 parallel batch resumes with Task 3.2 (Vendor detail 10-block).
- **v2.14 (2026-04-27). Phase-3 parallel-batch FIRST task lands.** Task 3.3 (Property detail tab parity — 4 NEW AppFolio core tabs as stubs per v1 L168 acceptance) is the **first** PR in the Phase-3 parallel batch (`3.1, 3.2, 3.3, 3.4` — independent of the now-retired sequential retrofit chain `3.7 → 3.8 → 3.9`). Selected first per the recommendation matrix: lowest blast radius (stubs explicitly acceptable per v1 L168), pattern-establishing for the detail-page UI class (3.1/3.2/3.4 inherit), no fixture dependencies, fast PRE2 recalibration for the layout-task class. Scope: 1 single-file additive edit (`PropertiesModule.tsx` +60 / −3 at commit C; +4 / −0 at commit D for `export` keywords) + 1 NEW test file (`properties.module.test.tsx`, 99 lines / 4 it-blocks). NO fixture / type / handler / Appendix-D writes — additive-only render-layer extension. Additions:
  - §9 Phase-3 sub-tracker Task 3.3 row description filled in at this commit; status stays `R` until post-merge sweep flips to ✓ + backfills squash SHA + closure date 2026-04-27 (mirrors Task 3.7 / 3.8 / 3.9 sweep precedent).
  - §21 Appendix D — **NO row updates required** (PropertiesModule.tsx is component code, not in the file-ownership matrix; no fixture/type/handler writes; layout-task-class precedent established here for parallel batch). The Appendix D activation triggered at Task 3.8 (5th post-B3 type hoist) does NOT extend to layout-class tasks unless they amend a matrix-tracked file.
  - DoR ack chain: PRE0-1 extend `CORE_TABS` directly (path A) — v1 names these as core tabs, not optional/feature-flagged; PRE0-2 kebab-case `'showing-settings'` matches existing single-word-lowercase + kebab-multi-word convention; PRE0-3 append-after-existing tab order preserves user muscle memory; PRE0-4 clone L52-72 placeholder pattern with 4 emojis (💰📣📊🗓️) + Phase-5 wiring intent body; PRE0-5 v2.14 sequential-by-closure-order claim (the v2.14 advisory tag from Task 3.9 §7 was a sequence marker, not a literal version reservation — Node 20 actions deprecation bump remains deferred to standalone PR per Task 3.9 PRE0-5 ack); PRE0-6 ADD 1 NEW `properties.detail.tab.switched` breadcrumb at L917 onClick (PRE1 verified setActiveTab had no breadcrumb at any of its 3 call sites L185/L202/L917; the 4 existing `Sentry.addBreadcrumb` calls are tab-CONTENT collapsible toggles, not the tab-switch handler). (a)–(f): (a) additive-only render-layer extension; (b) 4 placeholder copy lines per DoR-final wording; (c) +1 breadcrumb (post-3.3 total: 4 existing + 1 new = 5); (d) 8 NEW testids (4 button + 4 content) + existing 5 tabs gain button-testid via single template-literal addition; (e) append-after-existing; (f) NEW `properties.module.test.tsx` with 4 it-blocks; +4 vitest delta → 196/196 (32 files); LAYOUT-CLASS first baseline calibration.
  - **Three DoR drift catches surfaced pre-commit-C and acked into Task 3.3 §1 ledger** (none affected scope; all corrected before write): (1) PropertiesModule "ErrorBoundary at default export" claim was inaccurate — actual state is **4 SCOPED ErrorBoundary wraps** at L1215/L1249/L1340/L1374 around individual collapsible sections (Purchase History / Late Fee Policy / Maintenance Config / Fixed Assets); the default export is NOT wrapped at module level. The 9 grep matches on "ErrorBoundary" are: 1 import + 4 open tags + 4 close tags = 9 mentions (not 9 distinct usages). Top-level ErrorBoundary wrap is **v2.16+ candidate** alongside the existing TenantPortalModule structural-rework follow-up — OUT OF SCOPE for 3.3 per (a) minimal-scope rule. (2) Placeholder pattern at L52-72 (NOT L51-63) — off-by-line in kickoff. Each function is 6 lines (signature + return). (3) `setActiveTab` does NOT currently emit a Sentry breadcrumb at any call site; PRE0-6 ADD path validated.
  - **Two test-design discoveries surfaced post-DoR + acked into §1 ledger**: (4) **Path B test design chosen over DoR (f)-recommended Path A** — full PropertiesModule render with 4 click-through it-blocks would require ~80 lines of hook mocks (7 React Query hooks + useUser + useQueryClient + 7 child components) for a 2,511-LOC module; the actual NEW surface in commit C is the 4 self-contained Placeholder stubs whose render correctness IS the subject of the test. Path B (placeholder isolation tests) exercises that surface directly; the tab-switch + breadcrumb integration path is verified end-to-end by the CDP probe (10/10 guards passed first-try). Test pyramid split: fixture-level data-contract in `properties.test.ts` + render-level placeholder-contract in `properties.module.test.tsx` + user-flow contract in CDP probe. Trade-off: breadcrumb-payload assertion deferred to CDP integration coverage; future low-priority follow-up to add Path A integration test (§7 entry). (5) Stale git locks at branch creation — third consecutive Phase-3 task with this dual-sandbox shape (`HEAD.lock` + `main.lock` 0-byte, no PIDs, pre-existing branch ref at exact target SHA `e148906`); cleared atomically + checked out existing ref. Confirmed pattern across 3 consecutive Phase-3 task openings.
  - Task 3.3 closes **zero** Phase-3 deferred-items ledger entries directly (3.3's primary deliverable is layout-pattern-establishing for 3.1/3.2/3.4). Phase-3 ledger stays at 5 items post-3.3.
  - **Module-graph drift**: `StrataDashboard-DpkpCMoo.js` (Task 3.9 close) → `StrataDashboard-jKtUqWrV.js` (Task 3.3 commit C); chunk size 1,014.05 → 1,016.61 kB (+2.56 kB ungzipped, +0.44 kB gzip). Bigger drift than Task 3.9's +0.04 kB because Task 3.3 adds 4 NEW Placeholder functions + 4 activeTab content branches + breadcrumb wrap + testid template + WorkspaceTab type extend + CORE_TABS append. Module-count parity **3278 === 3278** holds. Test files (commit D, +4 export keywords on placeholders) and docs/probe artifacts (commit F) do not enter the prod bundle — chunk hash holds at `jKtUqWrV` from C through D through F.
  - **Vitest delta net +4** (4 it-blocks; one per new Placeholder). 192 → **196** (32 test files, +1 file). LAYOUT-CLASS first PRE2 calibration; matches DoR (f) prediction exactly. The 3 retrofit-chain consecutive prediction matches (3.7 +3, 3.8 +9, 3.9 +9) are model-calibrated for retrofit/rewire scope and do NOT extend to layout-class tasks; 3.3 establishes a separate layout-class baseline. Subsequent parallel-batch tasks (3.1 26-section / 3.2 10-block / 3.4 15-section) will diverge from this baseline as fixture-realism work likely surfaces (especially 3.1 Animals/Vehicles/Insurance fixtures).
  - GR-2 (additive only — no removals, no signature changes; existing 3 placeholders unchanged) / GR-3 (no FK surface — no fixtures touched) / GR-5 (clean — no strataApi.backend.ts changes) / GR-7 (PII-clean — 51 files / 0 leaks; no new fixtures) / GR-13 (clean — module already has 4 scoped ErrorBoundaries; new tabs inherit Sentry breadcrumb + testid surface; render-test in place) all clean.
  - **CDP render proof — 10/10 guards passed first-try** (`Docs/Baselines/phase_3_task_3_3/cdp_summary.json`): moduleRendered + allNineTabsPresent + budgetContentVisible + marketingContentVisible + comparablesContentVisible + showingSettingsContentVisible + budgetBodyTextCorrect + marketingBodyTextCorrect + zeroConsoleErrors + zeroPageErrors + allPass. Programmatic native click via `page.evaluate(...)` was the DEFAULT (Task 3.7 §7 entry #3 retired by demonstration at Task 3.8 — no regression at 3.3).
- **v2.13 (2026-04-25). Phase-3 third task lands — RETROFIT CHAIN RETIRED.** Task 3.9 (TenantPortal — GR-13 retrofit + authFetch → strataApi rewire) is the **third and final** PR in the 3-PR Phase-3 retrofit chain (3.7 Projects → 3.8 CorporateReview → **3.9 TenantPortal**). Closure retires the sequential retrofit chain entirely; pending row narrows from 5 to 4 (`3.1, 3.2, 3.3, 3.4` parallel batch only). Mirrors Task 3.8 byte-shape line-for-line where applicable; multipart `strataUpload<T>` NOT consumed (no file-upload paths in TenantPortal — first post-3.8 task to skip strataApi.ts amendments + consume the existing patterns exclusively, establishing the precedent that retrofit-chain tasks amend strataApi only when introducing a new transport pattern). Scope: 1 module retrofit + 0 strataApi.ts additions + 0 strataApi.backend.ts shape-contract additions + 7 strataApi.static.ts handlers (6 GET + 1 POST) + 1 type hoist (6th post-B3 amendment) + 2 NEW fixtures + 2 NEW test files. Additions:
  - §9 Phase-3 sub-tracker Task 3.9 row flipped `R` → ✓ post-merge (sweep commit backfills squash SHA + closure date 2026-04-25). Pending row narrows from 5 to 4: `3.1, 3.2, 3.3, 3.4`. The 3-PR retrofit chain is RETIRED in entirety (same-day triple-close on 2026-04-25 from a 2026-04-25 v2.11 phase open — sub-2-day chain ETA per scheduling-pass).
  - §21 Appendix D updates: row 1 (`packages/types/index.ts`) — Phase-3 column extends with "Task 3.8 → 3.9 sequential" and the 4-item Task 3.9 hoist (PortalTab + TenantPortalPagination + TenantPortalStats + TenantPortalMessage); row 2 (`strataTypes.ts`) — shadow re-export of 4 new types; row 3 (`strataApi.static.ts`) — 7 NEW handlers, +246 lines, with security-contract notes on substring-search + Number.isFinite-guarded date arithmetic; row 4 (`strataApi.backend.ts`) — Task 3.9 SKIPS (precedent break in the OTHER direction — 3.9 is the first post-3.8 task to NOT amend strataApi.backend.ts since 3.7 was retrofit-only); 2 NEW rows inserted for `public/data/tenant_portal_payments.json` (Phase-3 owner = Task 3.9; 10 rows / 6 paid / 2 pending / 2 overdue) + `public/data/tenant_portal_messages.json` (Phase-3 owner = Task 3.9; 10 rows / 6 inbound / 4 outbound; FK-correct on tenantId; PII-clean).
  - Task 3.9 closes one Phase-3 → ledger entry: Task 2.8 §7 cross-module write-guard ledger entry "TenantPortalModule" — final entry in that ledger retires. With this closed, the Phase-3 deferred-items ledger drops from 6 → 5 items.
  - DoR ack chain: PRE0-1 hybrid drop approved (authFetch fully removed; hasPermission stays); PRE0-2 4-item hoist approved (PortalTab + TenantPortalPagination + TenantPortalStats + TenantPortalMessage; 6th post-B3 amendment); PRE0-3 fixture strategy approved (2 NEW + 4 derived); PRE0-4 v2.13 changelog slot approved (Playwright tag retired by demonstration in 3.8 §7 entry #8 without consuming the slot); PRE0-5 v2.14 Node 20 bump DEFERRED to standalone PR (cleaner attribution + zero retrofit-chain risk); PRE0-6 envelope drop at module side approved (raw strataGet/strataPost return; matches Task 3.8 byte-shape across all 3 fetch sites). (a)–(g): (a) status-quo retrofit + 7 handlers + 4-item hoist + 2 NEW fixtures + 2 NEW test files; (b) "Tenant Portal module unavailable." byte-shape mirror; (c) 4 consolidated breadcrumbs (smaller than 3.8's 6 since 1 POST vs 5 — `module.loaded` / `fetch.error` consolidated via `data.action` / `message.sent` / `message.skipped`); (d) 11 testid families (exact-tie with 3.8; KPI cards intentionally skipped per variable-count); (e) sticky `statusFeedback` banner between gradient header `</div>` and `<KpiRow />` (TenantPortal HAS h2 header at L737 → 3.8 §1 entry #6 drift does NOT apply); (f) split fixture (6 it-blocks) + render (3 it-blocks); (g) `crypto.randomUUID()` static-msg ID prefix per 3.8 (g) precedent.
  - **Two PRE1 count refinements** (DoR vs PRE1 ground truth): (i) `recurring_charges.json` row count 1 → 3 (DoR estimate vs PRE1 actual; still insufficient for /payments — confirmed NEW fixture path); (ii) `units.json` non-null leaseEnd count 33 → 31 (DoR estimate vs PRE1 actual; still derivable for /lease-alerts — confirmed NEW fixture not needed).
  - **Ten-item PRE1 second-order discovery ledger** (DoR / commits B/C/D/F): (1) `invoices.json` is empty `[]` → kickoff "reuse if present" not viable → /payments NEW fixture; (2) `communications.json` has 6 rows + `fromAddress`/`toAddress` email shape (no `tenantId`) → shape mismatch → /messages NEW fixture; (3) `recurring_charges.json` has 3 rows only → reuse for /payments not viable → NEW fixture; (4) `units.json` has 31/1471 units with non-null leaseEnd (ISO format) → sufficient for /lease-alerts derivation without a new fixture; (5) module's `{success, data, pagination}` envelope expectation predates strataApi convention → retrofit drops the envelope check (matches 3.8 byte-shape); (6) `Pagination` interface at L80 is page-based (`{page, limit, total, totalPages}`) — distinct from `strataApi.ts` `PaginatedResponse<T>` cursor-based shape; retrofit keeps page-based + computes client-side from `data.length`; (7) module has h2 `<h2 className="tp-title">Tenant Portal</h2>` at L737 → banner placement clean (between header and KpiRow); UNLIKE 3.8's CorporateReview which had no h2 (3.8 §1 entry #6 drift); (8) `authFetch` is destructured from `useUser()` context (NOT a standalone wrapper) → `hasPermission` co-destructure stays; `authFetch` drops entirely; (9) KpiRow has 5 cards including occupancy ring SVG → testid surface intentionally skipped on KPIs (variable-count + non-write-trigger); (10) **inline-tab-component anti-pattern** — TenantPortalModule.tsx pre-Task-3.9 defines all 5 tab components (DirectoryTab / MaintenanceTab / PaymentsTab / MessagesTab / LeaseAlertsTab) as NESTED CLOSURES inside TenantPortalModuleInner; every parent re-render creates a new function reference → React reconciler unmounts/remounts the entire tab subtree → user-event's per-character typing fails on a stale element reference; resolved at test-side via single-shot `fireEvent.change` (controlled-input value still propagates correctly via React state). Production behavior is unaffected since human typing speed allows React to settle between keystrokes; documented as a §7 follow-up candidate (Phase-3 v2.16 — lift the 5 tab components out of TenantPortalModuleInner). FIRST test-driven exposure of this React anti-pattern in the AppFolio parity suite.
  - **One additional CDP-time discovery (commit F)**: pre-existing React missing-key warning in MessagesTab — present in the original (pre-retrofit) module since Phase-1 (out of scope for the GR-13 retrofit). Surfaced here only because Task 3.9 is the first CDP probe to navigate into TenantPortal's messages tab. Filtered as known pre-existing in the probe regex (alongside `ERR_CONNECTION_REFUSED`/`sentry`/`open-meteo`/`favicon`). Documented as a §7 follow-up candidate (Phase-3 v2.16 alongside the inline-tab-component anti-pattern lift — same scope).
  - Task 3.9 GR-2 (additive only — packages/types + 2 NEW fixtures append; no removals, no signature changes) / GR-3 (FK integrity verified — every messages.tenantId AND payments.tenantId points at an `entityType=tenant` row in entities.json) / GR-5 (trivially satisfied — no strataApi.backend.ts touch; precedent break from 3.8 in the OTHER direction) / GR-7 (PII-clean — 51 files / 0 leaks; both NEW fixtures scanned clean per strict allowlist on first pass) / GR-13 (explicitly satisfied — ErrorBoundary + 4 breadcrumbs + 11 testids + 1 isStaticMode write-guard + render-test) all clean.
  - **Module-graph drift**: `StrataDashboard-B9P7mtqe.js` (Task 3.8 close) → `StrataDashboard-DpkpCMoo.js` (Task 3.9 commit C); chunk size 1,014.05 → 1,014.09 kB (+0.04 kB ungzipped, +0.01 kB gzip). Expected for retrofit + 7 endpoint handlers + 11 testid attributes + 4 try/catch breadcrumb wrappers + statusFeedback state + ErrorBoundary wrap + Inner/Outer split + import block restructure (drop authFetch + drop API_BASE + add strataGet/strataPost/isStaticMode/ErrorBoundary/Sentry + replace inline types with strataTypes imports). Module-count parity **3278 === 3278** holds. Test files (commit D) and docs/probe artifacts (commit F) do not enter the prod bundle — chunk-hash holds at `DpkpCMoo` from commit C through D through F.
  - **Vitest delta net +9** (6 fixture + 3 render). 183 → **192** (29 → 31 test files, +2 files). Matched DoR (f) prediction exactly — third consecutive retrofit-chain task to land within ±1 of the predicted vitest delta (3.7 +3 = +3; 3.8 +9 = +9; 3.9 +9 = +9).
  - **Surviving Phase-3 plan-version follow-ups** (post-3.9 close): **v2.14** (Node.js 20 actions deprecation workflow bump — actions/checkout@v4 → v5 + actions/setup-node@v4 → v5 + actions/upload-artifact@v4 → v5; due 2026-09-16 per GitHub deprecation calendar; deferred to standalone PR per PRE0-5 ack); **v2.15 candidate** (Playwright baseline pass-count drift 2 → 4 between Task 3.7 sweep CI run `24927092067` and Task 3.8 CI runs — could be timing-sensitive stabilization or coincidental Task 3.8 changes enabling assertions); **v2.16 candidate** (lift the 5 inline tab components out of TenantPortalModuleInner + fix the pre-existing React missing-key warning in MessagesTab — both surfaced as Task 3.9 §7 follow-ups; same structural-rework scope).
- **v2.12 (2026-04-25). Phase-3 second task lands.** Task 3.8 (CorporateReview — GR-13 retrofit + raw fetch → strataApi rewire) is the second PR in the 3-PR Phase-3 retrofit chain (3.7 Projects → **3.8 CorporateReview** → 3.9 TenantPortal). Bigger scope than 3.7 (which was retrofit-only): 1 module retrofit + 1 strataApi.ts addition (`strataUpload<T>` multipart precedent) + 1 strataApi.backend.ts shape-contract addition + 6 strataApi.static.ts handlers + 1 type hoist (5th post-B3 amendment) + 1 NEW fixture + 2 NEW test files. Mirrors Task 3.7 Inner/Outer split shape AND Task 2.8 strataApi rewire shape. Additions:
  - §15 L491 wording correction bundled in this PR per DoR PRE0-4 (ii) — §15 now reads "asserts that `reportError` was called with the `ErrorBoundary` tag (which then routes to `Sentry.captureException` via `services/errorReporter`)" instead of the original "asserts that a Sentry breadcrumb was emitted". Closes the v2.12 follow-up tagged in v2.11 changelog at the same PR that re-tests it (Task 3.8's `corporate-review.module.test.tsx` test #2 follows the corrected mandate). Tasks 3.9 onward inherit the corrected wording.
  - §9 Phase-3 sub-tracker Task 3.8 row flipped `R` → ✓ post-merge (sweep commit backfills squash SHA + closure date 2026-04-25). Pending row narrows from 6 to 5: `3.1, 3.2, 3.3, 3.4, 3.9`. The 3-PR retrofit chain proceeds sequentially; 3.9 (TenantPortal) rebases on 3.8 post-merge.
  - §21 Appendix D updates (precedent break — first within-phase task in the 3-PR retrofit chain to amend the file-ownership matrix; v2.11 prediction "stays empty for all rows" superseded): row 1 (`packages/types/index.ts`) — Phase-3 column now reads "Task 3.8 (5th post-B3 additive amendment: ReviewStatus + DocPriority + ReviewDocument hoist from CorporateReview.tsx:14-28)"; row 2 (`strataTypes.ts`) — shadow re-export of 3 new types; row 3 (`strataApi.static.ts`) — 6 NEW handlers + strataUpload export, +86 lines; row 4 (`strataApi.backend.ts`) — shape-contract addition only (`strataUpload<T>` re-export, +16 lines), required to keep static/backend impl-parity per `strataApi.ts:8-9` invariant; GR-5 spirit preserved (no real-backend logic changes); NEW row inserted for `public/data/corporate_review.json` (Phase-3 owner = Task 3.8; 12 docs / 4 pending / 3 triaged / 3 approved / 2 rejected; FK-correct on all 3 approved rows; deterministic uuid5 IDs; PII-clean per strict allowlist `*.dwellium.test`).
  - Task 3.8 closes two Phase-3 → ledger entries: (i) Task 2.8 §7 cross-module write-guard ledger entry "CorporateReview" — retires; (ii) Phase-3 v2.11 changelog §7 entry #3 (Playwright `page.locator(...).click()` vs React event delegation) — VALIDATED at Task 3.8 CDP probe; programmatic native click via `page.evaluate(...)` was the DEFAULT (not fallback) and worked first-try across all 3 testid-anchored click paths (status-filter-pending, expand-pending-card, click-triage-high). With these closed, the Phase-3 deferred-items ledger drops from 8 → 6 items. Surviving 6 items inherit at Task 2.9 §8.
  - DoR ack chain: PRE0-1 strataUpload (a) approved (multipart precedent); PRE0-2 ReviewDocument hoist approved (5th post-B3 amendment); PRE0-3 synthetic-but-realistic 12-doc fixture with FK integrity to workitems.json approved (rejected AppFolio re-capture surface); PRE0-4 task-driven v2.12 versioning (ii) approved + bundle §15 wording fix. (a)–(g): (a) status-quo retrofit + minimal rewire; (b) "Corporate Review module unavailable." byte-shape mirror; (c) 6 consolidated breadcrumbs via `data.action` field consolidation (smart vs 5×2=10 fan-out — module.loaded / fetch.error / submit.{sent,skipped} / upload.{sent,skipped}); (d) 11 testid families (drift catch — DOM is card-divs not rows; testid is `corporate-review-card-${doc.id}`); (e3) two-channel feedback split (preexisting 3000ms `feedback` toast preserved for backend mode + NEW sticky `statusFeedback` for static-mode write-skip messages with banner above status filter row — drift catch: no h2 header in CorporateReview, banner placed at top of module); (f) split fixture (6 it-blocks) + render (3 it-blocks); (g) `crypto.randomUUID()` over `Date.now()` for static-upload IDs (uniqueness-safe under burst-test).
  - **Seven DoR drift catches surfaced pre-commit-B and acked into Task 3.8 §1 ledger**: (1) `ReviewDocument` source line 17-28 (kickoff said 18-29; off-by-one); (2) "5 strataPost + 1 strataGet" was internally inconsistent under (a) — corrected to 4 strataPost + 1 strataUpload + 1 strataGet (separate multipart export); (3) DOM is card-divs not table-rows → testid template `corporate-review-card-${doc.id}` (mirrors Task 3.7 `projects-card-${wi.id}`); (4) status filter has 5 buttons (`all` + 4 statuses including `rejected`), not 4 as kickoff implied; (5) preexisting `feedback` state at L56 — collision risk with 3.7's `statusFeedback` precedent → resolved via two-channel split (e3); (6) no h2 header in CorporateReview → "between header and search row" placement doesn't map → top-of-module banner adopted; (7) `crypto.randomUUID()` recommended over `Date.now()` for static-upload IDs (preemptive uniqueness fix).
  - **Three additional discoveries surfaced post-DoR**: (8) testid attribute count: user grep returned 12, canonical count is 11 unique families verified at commit C HEAD via `grep -n 'data-testid=' CorporateReview.tsx` (11 lines, 1 per family — user grep was artifact); (9) **first-in-suite static-handler direct-test pattern** — `corporate-review.test.ts` tests #5-6 exercise the static GET handler via direct module import (NOT the `strataApi.ts` barrel) + fetch mocking + `vi.resetModules()` for dataCache eviction. This is the FIRST AppFolio-parity fixture test to exercise a static handler directly; the pattern is documented in the file header for future module-test reuse; (10) stale git locks at branch creation (`HEAD.lock` + `main.lock`, 0-byte, ~50 min old, no git PID); pre-existing branch ref already present at exact target SHA `757e0f4` (clean leftover from prior crashed checkout — same shape as Task 3.7 §1 entry #5). Cleared locks + checked out the existing ref instead of forcing — zero data loss, traceable via reflog.
  - Task 3.8 GR-2 (additive only — packages/types + corporate_review.json append; no removals, no signature changes) / GR-3 (FK integrity verified — 3/3 approved rows have non-null workitemId pointing into workitems.json) / GR-5 (spirit preserved — strataApi.backend.ts amendment is a shape-contract export only, no real-backend logic) / GR-7 (PII-clean — 49 files / 0 leaks; corporate_review.json scanned clean per strict allowlist) / GR-13 (explicitly satisfied — ErrorBoundary + 6 breadcrumbs + 11 testids + 5 isStaticMode write-guards + render-test) all clean.
  - **Module-graph drift**: `StrataDashboard-BoN7HPsN.js` (Task 3.7 close) → `StrataDashboard-B9P7mtqe.js` (Task 3.8 commit C); chunk size 1,012.98 → 1,014.05 kB (+1.07 kB ungzipped, +0.29 kB gzip). Expected for retrofit + 6 endpoint handlers + strataUpload multipart code + 11 testid attributes + 6 try/catch breadcrumb wrappers + statusFeedback state + ErrorBoundary wrap. Module-count parity **3278 === 3278** holds. Test files (commit D) and docs/probe artifacts (commit F) do not enter the prod bundle — chunk-hash holds at `B9P7mtqe` from commit C through D through F.
  - **Vitest delta net +9** (6 fixture + 3 render). 174 → **183** (29 test files, +2 files). Matched DoR (f) prediction exactly.
- **v2.11 (2026-04-25). Phase-3 OPENS.** Task 3.7 (Projects — ProjectsModule GR-13 retrofit: ErrorBoundary wrap + 4 Sentry breadcrumbs + 7 `data-testid` anchors + isStaticMode write-guard with sticky read-only feedback banner) is the **first** Phase-3 task and the first PR in the 3-task GR-13 retrofit chain (3.7 Projects → 3.8 CorporateReview → 3.9 TenantPortal; sequential by design). Status-quo retrofit per (a) ack: zero schema/handler/fixture writes; pure additive surface on `ProjectsModule.tsx` + new sibling render-test file. Mirrors Task 2.8 SentimentModule retrofit shape line-for-line. Additions:
  - §9 NEW sibling sub-section "**Phase 3 — per-task progress tracker**" at L378 (mirrors Phase-2 sub-tracker shape; pending row: `3.1, 3.2, 3.3, 3.4, 3.7, 3.8, 3.9`). Task 3.7 row added with `R` status; pointer to `Docs/Phase3_Task_3_7_Completion_Report.md`. Recommended retrofit-chain order inherited from Task 2.9 §7 entry #1.
  - Task 3.7 closes two Phase-2 → Phase-3 ledger deferrals: (i) Task 2.8 §7 cross-module write-guard ledger entry "ProjectsModule"; (ii) Task 2.9 (f) §7 + Task 2.9 §8 row 8 "ProjectsModule GR-13 retrofit". With these closed, the Phase-3 deferred-items ledger drops from 10 → 8 items.
  - DoR ack chain: (a) status-quo retrofit only (no rewire — already routed through `strataApi.ts` since Phase-1; PRE1 verified at L19 / L46 / L47 / L60); (b) fallback text `"Projects module unavailable."` mirrors `SentimentModule.tsx:323`; (c) 4 try/catch-wrapped breadcrumbs (`projects.module.loaded` / `projects.fetch.error` / `projects.status.toggle.sent` / `projects.status.toggle.skipped`); (d) 7 testid anchors — root + 3 view-mode tabs + refresh + search + entity-group + project-card + 5 kanban-column (DoR caught the kanban count: actual 5 status values, not 3-4 per kickoff message); (e) isStaticMode write-guard at `toggleStatus` with new `statusFeedback` state surfacing read-only banner between header and search; (f) Option B confirmed — 3 render-level it-blocks in **NEW sibling file** `qualia-shell/src/test/appfolioParity/projects.module.test.tsx` (preserves Task 2.9's 6 fixture it-blocks frozen in `projects.test.ts`). Lifts the testing bar above Task 2.8's silence to close plan v2 §15 L491 GR-13 unit-test mandate.
  - Task 3.7 establishes the `isStaticMode` export precedent under a non-Sentiment consumer — first test of the Task 2.8 export beyond its origin module. Vitest delta net **+3** (3 new it-blocks; 0 placeholder removed). 171 → **174** (27 test files, +1 file). Matched DoR prediction exactly.
  - **Ten PRE1 second-order discoveries surfaced across DoR / commit C / commit D**: (1) kickoff "3-4 kanban columns" → actual 5; (2) kickoff "+2 to +3 vitest delta" → +3; (3) `strataPost` dead import (pre-existing at `ProjectsModule.tsx:19`; leave per minimal-scope rule, document as Phase-3 cleanup candidate); (4) test-file split decision (new sibling `.tsx` vs. promote `.ts → .tsx`; chose split to preserve Task 2.9 fixture suite frozen); (5) stale git locks at branch creation (`HEAD.lock` + `main.lock`, 0-byte, 49 min old, no git PID; cleared after `lsof` verification — only Apple Virtualization XPC scanner held read-only fds, doesn't conflict with git's `O_CREAT|O_EXCL`); (6) BUG-1 pre-write — mocking `strataGet` to throw won't trigger ErrorBoundary (catch swallows it; fix via render-time throw on `lucide-react` `FolderKanban`); (7) BUG-2 pre-write — `Sentry.addBreadcrumb` spy won't fire on boundary path (boundary calls `reportError → Sentry.captureException`; fix by spying `reportError`); (8) BUG-3 post-write — `lucide-react` icons are `React.forwardRef`, not plain functions (calling `actual.FolderKanban(props)` directly throws TypeError; fix via JSX `<RealFolderKanban {...props} />`); (9) BUG-4 post-write — testid sits on OUTER card wrapper at `ProjectsModule.tsx:148`, but `onClick` for expand sits on INNER div at L156; click events bubble UP not down, so clicking the wrapper doesn't trigger expand (fix via descendant click); (10) **plan v2 §15 L491 wording mismatch** — §15 says "Sentry breadcrumb was emitted" but actual `ErrorBoundary.componentDidCatch` calls `reportError → Sentry.captureException` (NOT addBreadcrumb). Phase-3 v2.12 follow-up: update §15 wording (option (i), recommended) — keeps ErrorBoundary scope minimal.
  - **One CDP-time discovery (commit F)**: Playwright `page.locator(...).click()` reports `found:true` and the actionability check passes, but React's root-level synthetic event handler does NOT fire — for both card-expand inner-div onClick and Mark Inactive button onClick (2 of 17 probe steps). Workaround: programmatic click via `page.evaluate(...)` dispatching native `.click()` — picked up by React's event delegation reliably. Phase-3 v2.13 follow-up candidate: investigate root cause (React 19 event delegation? Playwright build mismatch?).
  - Task 3.7 GR-2 / GR-5 / GR-7 trivially clean (no types/handler/fixture/PII surface). Task 3.7 GR-13 explicitly satisfied (modulo the §15 wording follow-up above — Phase-3 v2.12).
  - Module-graph drift: `StrataDashboard-Cyc6wJ5v.js` (Task 2.9 close) → `StrataDashboard-BoN7HPsN.js` (Task 3.7 commit C); chunk size 1,012.00 → 1,012.98 kB (+0.98 kB ungzipped, +0.18 kB gzip). Expected for retrofit additive surface (4 breadcrumb call sites + try/catch wrappers + statusFeedback state + ErrorBoundary wrap + 7 testid attributes + 2 imports). Module-count parity 3278 === 3278. Test files (commit D) and docs/probe (commit F) do not enter the prod bundle — chunk-hash holds at `BoN7HPsN` from commit C through F.
  - Appendix D row 1 (`packages/types/index.ts`) UNTOUCHED — precedent extends from PRs #8 → #19 (Task 3.7). Appendix D Phase-3 column **stays empty** for all rows. The 3-PR retrofit chain (3.7 → 3.8 → 3.9) is the first within-phase task sequence to ship without amending the file-ownership matrix.
- **v2.10 (2026-04-25). 🎉 Phase-2 CLOSED.** Task 2.9 (Projects — canonical project workitem WO 19441-1 on Woodland Parc Townhomes Unit 2767-3, vendor CS Cooper Residential Contractors LLC) is the seventh and **final** general-pool Phase-2 task landed post-B3. All 10 Phase-2 tasks merged green; §9 Phase-2 column flips from `R` to `✓` for all 16 verification rows; pending list is empty. Additions:
  - §9 Phase-2 per-task tracker: Task 2.9 row added with ✓ status, `c27e1bc` commit ref (pre-squash; the post-merge sweep bumps to the squash SHA mechanically per the Task 2.8 / 2.6 / 2.4 / 2.10 / 2.1 / 2.2 / 2.5 / 2.3 precedent), and pointer to `Docs/Phase2_Task_2_9_Completion_Report.md`. **Pending-row removed entirely** — no Phase-2 task remains.
  - Task 2.9 scope per plan v1 L146 one-liner (v2.7+ §8 does NOT contain a dedicated `### Task 2.9` section; v1 L146 remains the sole authoritative spec text — same as Task 2.6 v1 L140 pattern): **"Reuse WO 19441-1 (Replace sheetrock, Woodland Parc 2767-3, assigned to CS Cooper) as the canonical project fixture. Test: open ProjectsModule → By Entity, verify it groups under Woodland Parc Townhomes. Gate: GR-4."** Landed as **status-quo** per (a) ack: extend `workitems.json` with 1 `type: 'work_order'` row (1151 → 1152); no new fixture file, no `/projects` handler, no module rewire. Mirrors Task 2.6 (Utilities) shape exactly.
  - Task 2.9 PRE0 → PRE1 drift correction (per scheduling-pass §6 item #10): **WO 19441-1 was NOT in workitems.json** despite v1 L146's "Reuse" verb. PRE1 grep returned 0 matches; resolution per §6 #10 was "amend Appendix D to Task 2.1 → 2.9 sequential, append-only WRITE." Combined with Task 2.6's prior amendment, Appendix D row 7 now reads `Task 2.1 → 2.6 → 2.9 sequential` — a 3-task within-phase ownership chain on `workitems.json` (mirrors the 2.3 → 2.5 → 2.7 sequential text precedent for `packages/types/index.ts` from Phase-2 B3 chain).
  - Task 2.9 (b1) ack — `type: 'work_order'` (no `WorkitemType` enum extension). v1's "WO 19441-1" prefix points at `work_order`; adding `'project'` to the union would touch `packages/types/index.ts` (5th post-B3 amendment) AND trigger full Incident/Legal/Projects/Utilities/Leasing snapshot/render tests per §6 R-1 — out of proportion for a 1-row task. ProjectsModule's by-entity grouping at `ProjectsModule.tsx:82-110` doesn't filter on `type` — groups any workitem under its `propertyId` bucket — so `type: 'work_order'` satisfies v1 L146's acceptance with zero downstream impact.
  - Task 2.9 (c1) ack — **NO TOUCH on `packages/types/index.ts`**. Workitem interface and WorkitemType union reused as-is. Appendix D row 1 text **UNCHANGED** per precedent across PRs #8 → #18. Task 2.9 is the **second post-2.6 Phase-2 task to skip this surface** (Task 2.6 was the first; Task 2.8 hoisted Sentiment* types). B3 chain remains permanently closed at `40875db`; no reopen, no general-pool amendment for this task.
  - Task 2.9 (d1) + (d4) ack — `metadata.vendorId = 'e013ce70-3930-43db-94fc-743bcac83779'` (canonical mixed-case CS Cooper). PRE1 surfaced 3 duplicate CS Cooper vendor entries in `entities.json` (uppercase + 2 mixed-case); the 2 unused duplicates are documented for Phase-3 dedupe deferral (Phase-4 owner per Appendix D row 6).
  - Task 2.9 (f) ack — **ProjectsModule retrofit deferred**. Module already routes through `strataApi.ts` (no rewire needed) but lacks ErrorBoundary / Sentry / `data-testid` anchors. Documented in completion report §7 alongside Task 2.8's TenantPortalModule + CorporateReview retrofit-candidate list — **3-module Phase-3 grouped-PR cleanup**. Recommended order: ProjectsModule (purely additive, lowest risk) → CorporateReview (multi-POST + `isStaticMode` guard) → TenantPortalModule.
  - Task 2.9 PRE1 second-order discovery (Task 2.4-class pattern): **`maintenance.test.ts:132` cross-type contamination guard** asserts that among ~370 work_orders, only WO 19511-1 carries Task 1.4 typed fields (`workOrderNumber`, `trade`, etc.). Task 2.9's WO 19441-1 legitimately uses `workOrderNumber` + `trade`, so the guard's allowlist required widening from "only WO 19511-1" to "WO 19511-1 OR WO 19441-1". DoR PRE2 file-touch table named `maintenance.test.ts` for the row-count baseline pin update but didn't surface the contamination-guard allowlist; vitest caught it during commit B. Bundled with the seed in commit B (`b8fc555`) per Task 2.6's commit-1 baseline-pin precedent. Lesson for next-task DoRs: PRE2's surface-touch list is necessary but not sufficient; vitest is the final source of truth on which lines actually need to change.
  - Task 2.9 GR-2 trivially clean (no `packages/types/index.ts` touch; Workitem interface reused as-is). Task 2.9 GR-5 trivially clean (no `strataApi.backend.ts` touch; no handler added). Task 2.9 GR-7 strict-clean (PII scan 48 strict files / 0 leaks; new row uses UUIDs from already-strict-clean Phase-1 surfaces + opaque `workOrderNumber` "19441-1"). Task 2.9 chunk-hash byte-for-byte match with Task 2.8 baseline (`StrataDashboard-Cyc6wJ5v.js` + `TranscriptionHub-C7honbnz.js`) — strongest possible evidence that (b1) / (c1) / (f) decisions held end-to-end with **zero module-graph impact**.
  - Appendix D row 7 (`public/data/workitems.json`) Phase-2 cell amended from `Task 2.1 → 2.6 (sequential…)` to `Task 2.1 → 2.6 → 2.9 (sequential…)`. 3-task within-phase ownership chain. Appendix D row 1 (`packages/types/index.ts`) UNTOUCHED per precedent across PRs #8-#17 + this PR.
  - Vitest delta net **+5** (6 new − 1 placeholder). 159 → 166 (Task 2.8 close) → **171** (Task 2.9 close; 26 test files unchanged).
  - **Phase-3 transition gate.** After Task 2.9 squash-merge + post-merge 3-file sweep, the next DoR will be **Phase-3 Task 3.x kickoff** (per scheduling-pass — Phase 3 starts with AppFolio re-capture infrastructure). Consolidated Phase-3 deferred-items ledger spans Tasks 2.4 / 2.6 / 2.8 / 2.9 — see `Docs/Phase2_Task_2_9_Completion_Report.md` §8 for the full backlog table (10 items). Top-of-list candidates: (i) AppFolio re-capture pipeline for missing tenant/property surfaces; (ii) 3-module GR-13 retrofit grouped PR (TenantPortal + CorporateReview + ProjectsModule).
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
