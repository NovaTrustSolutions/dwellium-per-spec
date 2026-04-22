# AppFolio Parity Implementation Plan — v2.0

**Version.** 2.0 (2026-04-19). Supersedes v1.0 after self-graded 7/10 review. Changes tracked in the Changelog at the bottom.

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

---

## §9. Verification Matrix (expanded from v1.0)

Legend: R = required; — = n/a at this phase; ≤B = must be ≤ baseline; =0 = must be zero.

| Check | 0.0 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `tsc -b` errors =0 | R | R | R | R | R | R | R |
| `vitest run` failures ≤B | R | R | R | R | R | R | R |
| `vitest run` new-test count ≥ tasks-in-phase | — | R | R | R | — | — | R |
| `playwright test` failures ≤B (on dev box) | — | — | R | R | R | R | R |
| `vite build` errors =0 | R | R | R | R | R | R | R |
| `VITE_APPFOLIO_SEEDS=false vite build` functional | R | R | R | R | R | R | R |
| PII-leak scan passes | R | R | R | R | R | R | R |
| Manual dev-server smoke | — | — | R | R | R | R | R |
| Screenshots in phase report | — | — | R | R | R | R | R |
| axe-core violations ≤B on modified pages | — | R* | R | R | R | R | R |
| Lighthouse LCP ≤ max(B, 500ms) | — | R* | R | R | R | R | R |
| Pasted command output in PR | R | R | R | R | R | R | R |
| Rollback SHA documented | R | R | R | R | R | R | R |
| /security-review clean (High/Medium) | — | R | R | R | R | R | R |
| CI green on branch | R | R | R | R | R | R | R |
| Completion Report committed | R | R | R | R | R | R | R |

*Phase 0 row — baselines captured, not enforced (establishing the reference values).

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
| properties | 4 | ≥54 (4 + 50 AppFolio) |
| entities (tenants) | existing count | +13 AppFolio-derived |
| entities (vendors) | existing count | +4 AppFolio-derived |
| workitems | 500+ | +13 AppFolio-derived |
| communications | existing count | +10 AppFolio-derived (sanitized) |
| leases | existing count | +2 AppFolio-derived |
| compliance | existing count | +15 AppFolio-derived (6 vendor + 9 AHA) |

Baseline row is captured in `Docs/Baselines/2026-04-19_Phase0_fixture_counts.json` by Phase-0.1. Phase-4 exit gate asserts the target row.

## §21. Appendix D — File-ownership matrix (GR-11)

| File | Owner — Phase 1 | Owner — Phase 2 | Owner — Phase 3 | Owner — Phase 4 | Owner — Phase 5 |
|---|---|---|---|---|---|
| `packages/types/index.ts` | Task 1.1–1.5 sequentially | Task 2.3 only | — | — | Task 5.1a |
| `qualia-shell/src/components/StrataDashboard/strataTypes.ts` | shadow of ↑ | ↑ | — | — | ↑ |
| `strataApi.static.ts` | Task 1.1 only | Task 2.* rebase onto each other | — | Task 4.7 only | — |
| `strataApi.backend.ts` | NO (GR-5) | NO | NO | NO | Task 5.1b |
| `public/data/properties.json` | Task 1.3 | Task 2.4 + 2.10 (sequential) | — | Task 4.1 | — |
| `public/data/entities.json` | Task 1.1 + 1.2 (sequential) | — | — | Task 4.2 + 4.3 | — |
| `public/data/workitems.json` | Task 1.4 | Task 2.1 | — | Task 4.4 | — |
| `public/data/compliance.json` | — | Task 2.3 + 2.5 (sequential) | — | Task 4.6 | — |
| `.env.example` | Task 0.5 | — | — | Task 4.7 | Task 5.1c |
| `appfolioDerived/*.ts` | generated by script; no hand-edits | same | same | same | same |

---

## Changelog

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
