# AppFolio Parity Implementation Plan

**Goal.** Close the schema, UI, and fixture gaps identified in `AppFolio_vs_Strata_Gap_Analysis.md` so Strata reaches functional parity with AppFolio on the 12 "Covered" + 10 "Partial" modules, while preserving the 8 Strata-unique and 3 Strata-extending differentiators. Not to clone AppFolio pixel-for-pixel — to match the real schema richness observed in `zohouryproperties.appfolio.com` so a prospective customer can migrate without dropping data.

**Out of scope.** Building a live AppFolio migration importer, replacing the Strata-unique modules, touching the Astra side of the split (except where shared types are modified), and any billing/payments integration beyond schema fields.

**Canonical sources of truth.**
- Schema types: `packages/types/index.ts` (imported via `strataTypes.ts`)
- Static fixtures: `qualia-shell/src/components/StrataDashboard/strataApi.static.ts` (371 lines)
- Module components: `qualia-shell/src/components/StrataDashboard/modules/*.tsx` (33 files)
- Test harness: Vitest (`src/test/`) + Playwright (`e2e/`)
- Build check: `tsc -b && vite build`
- AppFolio ground-truth: `AppFolio_Screenshots/data/01..10_*.json`

---

## GUARD RAILS — non-negotiable rules for this work

These are numbered so PRs can reference them (e.g., "violates GR-3 — see plan doc").

**GR-1. No breaking changes to existing Strata-unique module APIs.** `CivilEngineeringStudio`, `DesignStudio`, `IncidentModule`, `LegalModule`, `ProfileSpaces`, `VisualizationModule`, `CorporateReview`, `StatusCheckModule` must continue to render and pass their existing tests at the end of every phase. If a shared type (e.g., `Workitem`) changes in a way that affects them, the change must be **additive only** — new optional fields, never renamed/removed.

**GR-2. Additive schema migrations only.** When expanding `Tenant`, `Vendor`, `Property`, `Workitem`, etc., every new field is `optional`. No existing field is renamed, retyped, or removed within this plan. If AppFolio parity demands a semantic rename (e.g., `coiExpiry` → `generalLiabilityExpiration`), add the new field, populate both in fixtures, deprecate the old one in a later phase with a JSDoc `@deprecated` tag. Atomic renames require their own ticket outside this plan.

**GR-3. Fixtures must preserve existing row counts as a lower bound.** `strataApi.static.ts` currently ships 4 properties, 250 entities, 500+ workitems, etc. Every phase that touches fixtures must maintain OR expand these counts. A phase that reduces fixture volume is rejected. New real-data seed fixtures go into new files (`strataApi.static.appfolio.ts`) and merge into the exported collections, not replace them.

**GR-4. Every phase gate is green-or-blocked.** No phase advances to the next until: (a) `tsc -b` passes with zero errors, (b) `vitest run` passes with zero failures, (c) `playwright test` passes with zero failures, (d) a fresh `vite build` succeeds, (e) the module being modified renders in `vite dev` without console errors. See the **Verification Matrix** below for the exact checks per phase.

**GR-5. No premature live-backend wiring.** Phases 1-4 touch only static fixtures and static UI. Live `strataApi.backend.ts` endpoints are modified only in Phase 5 after the static version is already shipping the new schema. This prevents fan-out breakage when the backend signature drifts.

**GR-6. Real data, not synthetic placeholders.** When seeding new fixtures, use the actual values captured in `AppFolio_Screenshots/data/*.json`. Willie White's occupancy 2800, Brianna M. Jackson's fire-alarm WO 19511-1, 2-STORY TECHNICAL ROOFING's Danny Bourdua + Zelle-link + GL-2026-07-11 expiration. Fabricated "Sample Tenant 1" rows are rejected in review. Keeps demos honest.

**GR-7. Copyright/PII discipline on AppFolio-derived fixtures.** Tenant emails (`brianna87@gmail.com`), phone numbers (`(404) 824-1830`), and tax IDs appear in the captured JSON because that's what AppFolio displays. These are real people at a real portfolio. The fixture files must be flagged as **internal-only seeds** — not committed to a public repo or included in any shipped customer demo build. A build-time macro `VITE_INCLUDE_APPFOLIO_SEEDS=false` stripes them out for any external artifact. The JSON files under `AppFolio_Screenshots/` stay in the private workspace folder only.

**GR-8. Every CTA in the plan includes a rollback step.** Each phase documents: "If X breaks in production, revert by reverting commits {A..B} and running `vite build`." No phase may ship without the explicit rollback commit range identified in the PR description.

**GR-9. Verification claims require proof in the PR body.** Per Ilya's standing CLAUDE.md rule: "Never say done, complete, 100%, exact without first running a verification command and reading its output." PR description must include: pasted `tsc -b` output (0 errors), pasted `vitest run` summary line (X passed, Y failed=0), pasted `playwright test` summary line, and at least one screenshot of the affected module rendering with the new fixtures. No proof → PR rejected at review.

**GR-10. Accessibility and perf are not regressions.** Every modified module must pass an axe-core scan (no new WCAG AA violations) and the rendered panel must stay under 500ms Largest Contentful Paint on a mid-tier laptop. Acceptance bar matches Dwellium's existing Phase-3 baseline; this plan tightens, never loosens.

---

## Phase 0 — Prep & baseline (half-day, must complete before Phase 1)

**Objective:** Establish a clean, measurable baseline and a fixture-generation harness so Phases 1-4 are mechanical.

**Tasks:**
1. **Baseline snapshot.** Run `tsc -b`, `vitest run`, `playwright test` on the current `main`. Capture the output as `Docs/Baselines/2026-04-19_Phase0_baseline.txt`. This is the "before" state every later phase must match or beat.
2. **Fixture-derivation script.** Create `Scripts/derive_appfolio_fixtures.ts` that reads `AppFolio_Screenshots/data/*.json` and emits typed TypeScript fixture constants into `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/`. One file per entity type (`properties.ts`, `tenants.ts`, `vendors.ts`, `workorders.ts`, `leases.ts`, `compliance.ts`). Script is idempotent: re-running overwrites deterministically.
3. **Type-audit report.** Generate `Docs/Phase0_Type_Audit.md` listing every field referenced in every module's JSX that is NOT currently on the imported type. Produces the target field list for Phase 1.
4. **Test scaffolding.** Add a `src/test/appfolioParity/` folder with one empty `.test.ts` file per module being modified. Gives a home for contract tests added in later phases.
5. **Feature flag.** Add `VITE_APPFOLIO_SEEDS=true|false` to `.env.example` and wire it through `strataApi.static.ts` so the expanded fixtures can be toggled per-build. Default `true` in dev, `false` in production builds until Phase 5 completes.

**Phase 0 exit gate (all must pass):**
- Baseline file committed to `Docs/Baselines/`
- `Scripts/derive_appfolio_fixtures.ts` runs clean and emits 10 files
- Type-audit doc lists every orphan field
- `tsc -b`, `vitest run`, `playwright test` all green on a fresh clone
- `VITE_APPFOLIO_SEEDS=false vite build` produces identical output to pre-Phase-0 `vite build` (byte-for-byte in the JS bundle)

**Rollback:** Revert all Phase 0 commits. No schema or UI touched; rollback is a pure `git revert`.

---

## Phase 1 — Top-5 schema extensions (3 days, sequential within phase)

**Objective:** Expand the five types with the highest leverage per the gap analysis. Each task is a discrete PR with its own green-gate.

**Task 1.1 — Residents: Occupancy → N Tenants 1:N structure.**
*Guard rails: GR-1, GR-2, GR-4, GR-9.*
- Add new type `Occupancy` in `packages/types/index.ts` with `{ id, unitId, leaseId, startDate, endDate, status: 'Current'|'Past'|'Future' }`.
- Extend `EntityProfile` (tenant subtype) with optional `{ occupancyId: string, occupantType: 'Primary'|'Other Occupant', emergencyContact: EmergencyContact, animals: Animal[], vehicles: Vehicle[], tags: string[] }`.
- Do NOT remove existing `leaseStartDate`, `leaseEndDate`, `moveInDate`, `rentAmount` from the tenant type — keep for back-compat per GR-2.
- Update `ResidentsModule.tsx` to render an "Other Occupants" collapsible block under each tenant detail.
- Add unit test: "Given an occupancy with one Primary + two Other tenants, ResidentsModule renders the primary header + both occupants in the collapsible."
- Seed fixtures: include Willie White occupancy (2800) with LaSonta M. Westbrook primary + Willie White + Olivia White + Elijah Westbrook.
- **Phase-gate:** `tsc -b` + Vitest + Playwright all green. New test passes. Existing `ResidentsModule` test still passes. Manual check: open `/strata/residents` in dev, verify LaSonta's detail panel shows the 3 other occupants.

**Task 1.2 — Vendors: 45-field / 10-block schema.**
*Guard rails: GR-1, GR-2, GR-4, GR-9.*
- Add new types `VendorFederalTax`, `VendorAccountingInfo`, `VendorComplianceExpiration` (with 6 distinct date fields: workersCompExpiration, generalLiabilityExpiration, epaCertificationExpiration, autoInsuranceExpiration, stateLicenseExpiration, contractExpiration).
- Extend `EntityProfile` (vendor subtype) with the 3 new nested objects as optional.
- Add `paymentMethod: 'Check'|'ACH'|'Zelle'|'eCheck'` enum and `send1099: boolean` at vendor root.
- Keep existing `coiStatus`, `coiExpiry`, `w9OnFile`, `insuranceCarrier` — annotate with `@deprecated, use complianceExpiration.generalLiabilityExpiration` JSDoc. Populate both in fixtures.
- Update `VendorsModule.tsx` to render a new "Compliance" tab with all 6 expiration rows, color-coded by proximity to today. Add an "Accounting" tab with check consolidation + payment terms + default GL.
- Seed: 2-STORY TECHNICAL ROOFING LLC (vendor 2716) with Danny Bourdua, Zelle + send1099=true, GL expiration 2026-07-11, all other 5 compliance dates null.
- **Phase-gate:** `tsc -b` + tests green. Manual check: open `/strata/vendors`, find 2-Story Technical Roofing, verify Compliance tab shows 6 rows (5 missing, 1 expiring in ~3 months).

**Task 1.3 — Properties: purchase history + late-fee policy + maintenance config + fixed assets.**
*Guard rails: GR-1, GR-2, GR-4, GR-9.*
- Add types `PurchaseHistory`, `LateFeePolicy`, `MaintenanceConfig`, `FixedAsset`.
- Extend `Property` with optional `{ purchaseHistory, lateFeePolicy, maintenanceConfig, nonRevenueUnit, fixedAssets: FixedAsset[] }`.
- Update `PropertiesModule.tsx` detail view with new collapsible sections: "Purchase History", "Late Fee Policy", "Maintenance Config", "Fixed Assets".
- Seed: 128 Buena Vista (property 18) with full purchase history ($2.27M from Dolan & Brenda Ricketts 2009-10-16), late-fee policy (effective 2021-02-01, $0 base, 4 grace days), maintenance (limit $0, no warranty, no pre-auth), 4 fixed assets (2 pool pumps, refrigerator, toilet).
- **Phase-gate:** `tsc -b` + tests green. Manual check: open `/strata/properties/18`, verify all 4 new sections render with real data.

**Task 1.4 — Maintenance / Workitems: resident availability + actions log + labor + PO linkage.**
*Guard rails: GR-1, GR-2, GR-4, GR-9.* (GR-1 is critical — many modules share `Workitem`.)
- Add types `ResidentAvailability`, `ActionLogEntry`, `LaborEntry`, `PurchaseOrderLink`.
- Extend `Workitem` with optional `{ residentAvailability: ResidentAvailability[], actionsLog: ActionLogEntry[], labor: LaborEntry[], linkedPurchaseOrders: PurchaseOrderLink[], withheldFromOwner: number, serviceRequestId: string, permissionToEnter: boolean, jobDescription: string, vendorTrade: string, vendorInstructions: string }`.
- Update `MaintenanceModule.tsx` work-order detail panel to render the 5 new sections.
- **Critical GR-1 check:** `IncidentModule`, `LegalModule`, `ProjectsModule`, `UtilitiesModule`, `LeasingModule` all use `Workitem` — run their tests after this change before merging.
- Seed: WO 19511-1 (Brianna M. Jackson, Woodland Parc 2789-1-4) with fire-alarm description, 3 Monday 2026-04-20 availability windows, 2-entry actions log (resident-submitted + system-logged), no labor yet, no POs yet.
- **Phase-gate:** `tsc -b` + full test suite (NOT just maintenance tests) green. Manual check: open WO 19511-1 detail, verify all sections render.

**Task 1.5 — Accounting: recurring-charge schedule metadata + payment-method enum.**
*Guard rails: GR-1, GR-2, GR-4, GR-9.*
- Extend `TenantLedgerRow` / `InvoiceRow` with optional `{ accountCode: string, accountName: string, scheduleStart: Date, scheduleEnd: Date|null, nextChargeDate: Date, previousChargeDate: Date, paymentStatus: 'PAID'|'DUE'|'PAST_DUE' }`.
- Reuse `paymentMethod` enum from Task 1.2 on the AP side.
- Update `AccountingModule.tsx` tenant-ledger view to show the schedule metadata.
- Seed: Willie White's three $1,595.00 rent recurring charges (account 4100 Rent Income, start 2025-09-23, next 2026-05-01, previous 2026-04-01 PAID).
- **Phase-gate:** `tsc -b` + tests green. Manual check: open Willie White ledger, verify schedule columns render.

**Phase 1 exit gate:**
- All 5 tasks merged and green
- Full test suite passes: `tsc -b && vitest run && playwright test`
- `vite build` succeeds
- `VITE_APPFOLIO_SEEDS=false vite build` still produces a functional bundle (fallback to existing mocks)
- No new console errors in dev
- `Docs/Phase1_Completion_Report.md` committed with pasted test output and 5 module screenshots

**Phase 1 rollback:** Each task is an atomic commit on its own branch. Revert the merge commits in reverse order (1.5 → 1.4 → 1.3 → 1.2 → 1.1). Types are additive so removing them is safe.

---

## Phase 2 — Partial-coverage module upgrades (2 days)

**Objective:** Close the feature gaps in the 10 "Partial" modules. Each is a smaller schema-or-UI task than Phase 1.

**Task 2.1 — Calendar: backfill 9 AHA inspections.** Seed `workitems` with Riverwood Club AHA inspection rows dated 04/27-04/30/2026. Integration tabs (Google/Apple) stay; just seed the data. Test: Calendar month view of April 2026 shows 9 inspection entries at Riverwood. Gate: GR-4, GR-9.

**Task 2.2 — Communication: real community announcement seed.** Import 10 email subjects from `09_tenant_detail_willie_white.json` as seed rows in the `communications` fixture. Mark `direction='outbound'`, `channel='email'`, `fromAddress='ashley.johnson@zp-group.example'`. Test: Inbox shows 10 rows for LaSonta M. Westbrook. Gate: GR-4, GR-7 (sanitize the email to `@example` domain, not live addresses).

**Task 2.3 — ComplianceEngine: vendor matrix seed + Section-8 rollup.** Seed `compliance` fixture with a row for each of the 6 vendor expiration dates for 2-Story Technical Roofing + the 9 AHA inspection items. Wire the Vendor Matrix view to render rows by vendor × expiration-type grid. Test: navigate to ComplianceEngine → Vendor Matrix, verify 2-Story shows "General Liability: 07/11/2026 (83 days)" and 5 empty cells. Gate: GR-4.

**Task 2.4 — Forecast: 50-property seed.** Replace the 4 mock properties in the Forecast fixture with 50 real properties from `01_properties_page1.json`. Implied revenue = occupied-unit-count × $1,595 (portfolio average rent inferred from Willie White). Occupancy override sliders keep working. Test: open Forecast, verify property dropdown shows 50 entries. Gate: GR-3 (no fewer than current), GR-4.

**Task 2.5 — InsuranceModule: FolioGuard-equivalent upsell tracking.** Add `enforcementStatus: 'required'|'not-required'|'lapsed'|'fulfilled'` to `InsurancePolicy`. Add a "Policies Requiring Action" card at the top of the module showing count of 'lapsed' + 'required-but-not-fulfilled'. Test: set 2 fixtures to 'lapsed', verify card shows "2 policies need attention". Gate: GR-4.

**Task 2.6 — Utilities: seed real utility vendor relationships.** Populate with Georgia Power (2070 Azalea Drive monthly), Duke Energy (128 Buena Vista water heater plan), Massey Pest (128 Buena Vista). Test: filter UtilitiesModule by 128 Buena Vista, 2 rows return. Gate: GR-4.

**Task 2.7 — AuditModule: position as Core-tier alternative.** No schema change. Add a subtle "Included with Strata — no premium upgrade required" banner. Add a test verifying the banner renders. Gate: GR-4.

**Task 2.8 — Sentiment: seed at-risk from Past-status tenants.** Mark 20 of the 3,274 captured tenants as at-risk with sample sentiment scores. Test: At Risk tab shows 20 rows. Gate: GR-4.

**Task 2.9 — Projects: entity-grouped Kanban seed.** Reuse WO 19441-1 (Replace sheetrock, Woodland Parc 2767-3, assigned to CS Cooper) as the canonical project fixture. Test: open ProjectsModule → By Entity, verify it groups under Woodland Parc Townhomes. Gate: GR-4.

**Task 2.10 — PropertyTimeline: unified-feed seed.** Merge events from WO `03_work_orders_page1.json` + 19 attachment uploads on property 18 + 49 community emails. Test: open 128 Buena Vista timeline, verify chronological merge. Gate: GR-4.

**Phase 2 exit gate:**
- All 10 tasks merged green
- Full test suite green
- `Docs/Phase2_Completion_Report.md` with 10 screenshots (one per module)
- Manual walkthrough: every Partial module on the gap-analysis scorecard flips to "Covered" or "Strata-exceeds"

**Phase 2 rollback:** Per-task revert. These are fixture-only changes for 9 of 10 tasks; low rollback risk.

---

## Phase 3 — UI polish to match AppFolio sub-section depth (2-3 days)

**Objective:** The schema gaps close in Phase 1-2. This phase closes the UI gaps — rendering the new fields in a way that matches or exceeds AppFolio's visual density per tenant/vendor/property/WO detail page.

**Task 3.1 — Tenant detail page: expand to 26-section layout.** AppFolio tenant detail has 26 distinct sections (`09_tenant_detail_willie_white.json`). Current Strata residents detail has ~5. Add collapsible sections for: FolioGuard-equivalent upsell card, Emergency Contact, Upcoming Activities, Insurance Coverage, Animals, Vehicles. Existing sections keep their current appearance.

**Task 3.2 — Vendor detail page: expand to 10-block layout.** Render the 10 blocks from Task 1.2 schema as distinct collapsible sections matching AppFolio's visual grouping: Identity / Contact / Portal / Federal Tax / Accounting / Payment Type / Compliance / Survey / Notes / Activity.

**Task 3.3 — Property detail page: tab parity.** AppFolio property detail has tabs Property / Budget / Marketing / Comparables / Showing Settings. Strata currently has Overview / Info / Units / Work / Documents. Add Budget, Marketing, Comparables, Showing Settings tabs (stubbed with "Coming soon" cards is acceptable for this phase; wiring happens in Phase 5).

**Task 3.4 — WO detail page: 15-section layout.** Render Service Request header / Property-Unit-Owner-Resident / Work Order / Job / Scheduling / Actions Log / View-as-Maintenance-Tech / Labor / Purchase Orders / Withheld Amount / Invoices / Texts / Emails / Attachments / Notes — in AppFolio's order.

**Task 3.5 — Consistent collapse/expand + persistence.** Each collapsible section persists its open/closed state per-user in localStorage. Add a Vitest test for the persistence hook. This is a Dwellium-quality touch that AppFolio doesn't ship.

**Phase 3 exit gate:**
- All 5 tasks merged green
- Full test suite green
- Visual regression: screenshot the 4 detail pages (tenant, vendor, property, WO) before and after. Commit `Docs/Phase3_Visual_Diff/` with before+after PNGs.
- axe-core scan: zero new WCAG AA violations
- `Docs/Phase3_Completion_Report.md` with perf numbers (LCP under 500ms per GR-10)

**Phase 3 rollback:** UI-only changes; `git revert` per task. Schema changes from Phase 1-2 remain.

---

## Phase 4 — Real-data fixture expansion (1-2 days)

**Objective:** Replace or augment the synthetic mocks with AppFolio-derived seeds. Keeps `VITE_APPFOLIO_SEEDS=false` functional fallback for external demos.

**Task 4.1 — 50 real properties.** Run `Scripts/derive_appfolio_fixtures.ts` and merge the 50 properties from `01_properties_page1.json` into `strataApi.static.appfolio.ts`. Each property gets: name, address, county, purchase history (where captured), fixed assets (where captured).

**Task 4.2 — 13 real tenants across 5 properties.** Seed tenants from `04_tenants_page1.json` spread across Huntington Lane, Washington Gardens, Summerfield, Riverwood Club, Woodland Parc. Include status (Current/Past) and phone numbers where captured. Apply GR-7: emails stripped to `@example` domain for any tenant with a visible email.

**Task 4.3 — 4 canonical vendor seeds.** 2-STORY TECHNICAL ROOFING (vendor 2716, full detail), CS COOPER RESIDENTIAL CONTRACTORS, GEORGIA POWER (utility), JIMENEZ HOME REPAIRS. Each with vendor-type, trade-category, compliance state.

**Task 4.4 — 13 real work orders.** Seed from `03_work_orders_page1.json` — 19511-1 (fire alarm), 19510-1 (plug outlet), 19508-1 (kitchen plugs), 19504-1 (AC reservoir), 19503-1 (stove vent), 19499-1 (AC hot air), 19496-1 (microwave light), 19441-1 (sheetrock — Assigned), 19438-1 (Georgia Power — Assigned), 19429-1 (kitchen sink — Assigned), 19424-1 (yellow jackets), 19172-1 (dishwasher — Work Done), 19277-1 (floor dipping — Waiting).

**Task 4.5 — 2 real pending-countersign leases.** Jamel D. Brown → Riverwood H12, Vanessa V. Blunt → Riverwood D14. Both generated 2026-03-31.

**Task 4.6 — Compliance matrix seed.** Six vendor-compliance rows for 2-Story Technical Roofing + 9 AHA inspection rows + 1 Duke Energy warranty row from property 18 attachments.

**Task 4.7 — Feature-flag flip.** Default `VITE_APPFOLIO_SEEDS=true` in dev and staging builds. External/public-demo builds use `false` and fall back to the original anonymized mocks per GR-7.

**Phase 4 exit gate:**
- Every seed matches a verifiable row in `AppFolio_Screenshots/data/*.json` (GR-6)
- Full test suite green
- Dev build renders every module with real data visible
- External build (`VITE_APPFOLIO_SEEDS=false`) renders every module without console errors and without leaking any real-person data
- `Docs/Phase4_Completion_Report.md` with fixture row-count deltas and one screenshot per module

**Phase 4 rollback:** Fixture-only changes. Revert the 7 task commits, `VITE_APPFOLIO_SEEDS` defaults back to `false`.

---

## Phase 5 — Live backend wiring + E2E validation (2-3 days)

**Objective:** Connect the expanded schema to `strataApi.backend.ts`. Until now everything has been static. This phase makes the schema real end-to-end and executes the full verification suite.

**Task 5.1 — Backend schema mirror.** Update `strataApi.backend.ts` (and any corresponding API server code) to accept + return the fields added in Phases 1-2. Use the same optionality as the types so existing clients keep working.

**Task 5.2 — Contract tests.** Add `src/test/appfolioParity/*.test.ts` contract tests that assert: given a static AppFolio-derived fixture, the live-API response shape (mocked via MSW) matches the fixture shape byte-for-byte. Fails on any drift between static and live.

**Task 5.3 — E2E: Willie White round-trip.** New Playwright spec `e2e/appfolio-parity-tenant.spec.ts`: log in → navigate to Residents → find LaSonta M. Westbrook → expand other occupants → verify Willie White visible → click Willie → verify occupancy detail panel renders 26 sections → close.

**Task 5.4 — E2E: WO 19511-1 round-trip.** Playwright spec: Residents → Brianna M. Jackson → Work Orders → 19511-1 → verify 15 sections render → verify 3 time windows for Monday 04/20/2026 → verify actions log has 2 entries.

**Task 5.5 — E2E: 2-Story Technical Roofing compliance.** Playwright spec: Vendors → 2-STORY TECHNICAL ROOFING → Compliance tab → verify 6 expiration rows → verify only General Liability is populated.

**Task 5.6 — Perf validation.** Run Lighthouse on the 4 enriched detail pages. Assert LCP ≤ 500ms, CLS ≤ 0.1, a11y score ≥ 95. Commit numbers to `Docs/Phase5_Perf_Report.md`.

**Task 5.7 — Accessibility validation.** Run `axe-core` CI on the 4 detail pages. Zero WCAG AA violations.

**Phase 5 exit gate (this is the ship gate):**
- Full test suite green: `tsc -b`, `vitest run`, `playwright test` — 0 failures
- `vite build` succeeds
- 3 E2E specs (5.3, 5.4, 5.5) pass on CI
- Lighthouse numbers meet GR-10
- axe-core clean
- `Docs/Phase5_Ship_Report.md` committed with **pasted output** from every verification command (per GR-9)
- Manual smoke on mobile (iOS Safari) and desktop (Chrome + Firefox) — no layout breaks

**Phase 5 rollback:** Revert Task 5.1 backend changes, then revert Tasks 5.2-5.5 test files. Phases 1-4 still functional in static mode. This is the designed safety net — Phases 1-4 are complete without Phase 5.

---

## Verification Matrix — required gate per phase

| Check | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `tsc -b` clean | R | R | R | R | R | R |
| `vitest run` all green | R | R | R | R | R | R |
| `playwright test` all green | R | R | R | R | R | R |
| `vite build` succeeds | R | R | R | R | R | R |
| `VITE_APPFOLIO_SEEDS=false` build succeeds | R | R | R | R | R | R |
| Manual dev-server smoke | — | R | R | R | R | R |
| Screenshots in phase report | — | R | R | R | R | R |
| axe-core clean on modified pages | — | — | — | R | — | R |
| Lighthouse LCP ≤ 500ms | — | — | — | R | — | R |
| Pasted command output in PR | R | R | R | R | R | R |
| Rollback commit range documented | R | R | R | R | R | R |

R = required. — = not applicable at that phase.

---

## Risk matrix

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Shared `Workitem` type change breaks Incident / Legal / Projects / Utilities modules | Medium | High | GR-1 + Task 1.4 phase-gate runs ALL module tests, not just maintenance |
| Real tenant/vendor PII leaks into a public build | Low | High | GR-7 + `VITE_APPFOLIO_SEEDS=false` fallback + external-build smoke test in Phase 4 |
| Fixture volume regression makes modules look empty in demos | Medium | Medium | GR-3 enforces lower-bound row counts; per-phase check script |
| Backend signature drift from static fixtures | Medium | High | GR-5 defers backend work to Phase 5 + Task 5.2 contract tests catch drift |
| Perf regression from 30-field vendor render | Low | Medium | GR-10 + Lighthouse gate in Phase 3 + Phase 5 |
| Accessibility regression from new collapsible sections | Medium | Medium | axe-core gate in Phase 3 + Phase 5; persistence via localStorage uses proper ARIA expanded states |
| Plan slippage (taking longer than 10 days) | Medium | Low | Each phase is independently shippable; Phase 5 is optional for static-only demos |
| AppFolio capture data becomes stale | Low | Low | Fixture-derivation script (Phase 0 Task 2) can be re-run against fresh AppFolio captures |

---

## Done criteria — what does "parity complete" mean

Parity is **complete** when ALL of the following are true:

1. Every "Covered" module in the gap analysis renders at least the fields that appeared on its canonical AppFolio capture page. Verified by the module-by-module screenshots in `Docs/Phase{1..5}_Completion_Report.md`.
2. Every "Partial" module has either been upgraded to "Covered" or has an explicit `Docs/Phase2_Partial_Deferrals.md` entry explaining why the remaining gap is intentional (e.g., Calendar's Google/Apple sync is intentionally richer than AppFolio, so no further work needed).
3. All 8 "Strata-unique" modules continue to pass their existing tests unchanged. Per GR-1.
4. The full CI pipeline is green: `tsc -b`, `vitest run`, `playwright test`, `vite build`, both `VITE_APPFOLIO_SEEDS` modes, axe-core, Lighthouse.
5. Real AppFolio-derived seeds are used in dev and staging (GR-6), and the external-build fallback still works cleanly (GR-7).
6. The gap analysis scorecard at the bottom of `AppFolio_vs_Strata_Gap_Analysis.md` has been rewritten to reflect the new state, showing 22 "Covered" (was 12), 0 "Partial" (was 10), 8 "Strata-unique" (unchanged), 3 "Strata-extending" (unchanged).
7. Three demo scripts have been recorded showing Willie White tenant, 2-Story Technical Roofing vendor, and WO 19511-1 work order — each demo references the underlying captured JSON file so a reviewer can trace every rendered value back to AppFolio.
8. The CLAUDE.md verification ritual (GR-9) has been applied to the final ship report — **pasted output from tsc, vitest, playwright, vite build, Lighthouse, axe-core all present in `Docs/Phase5_Ship_Report.md`** before anyone types the word "done".

---

## Timeline estimate

| Phase | Duration | Can run in parallel? |
|---|:---:|:---:|
| 0 — Prep | 0.5 day | No (blocks everything) |
| 1 — Top-5 schema | 3 days | Tasks 1.1-1.5 sequential to avoid merge conflicts |
| 2 — Partial upgrades | 2 days | Tasks 2.1-2.10 can parallelize across 2 engineers |
| 3 — UI polish | 2-3 days | Tasks 3.1-3.5 mostly parallel |
| 4 — Real data seeds | 1-2 days | Tasks 4.1-4.6 parallel; 4.7 last |
| 5 — Live backend + E2E | 2-3 days | 5.1 first, then 5.2-5.7 parallel |
| **Total** | **~10-12 working days** | |

Phases 1-4 are shippable independently. Phase 5 is required for "parity complete" but not for a functioning demo.

---

## First action (Phase 0 kickoff)

1. Run `cd qualia-shell && npm ci && tsc -b 2>&1 | tee ../Docs/Baselines/2026-04-19_Phase0_baseline_tsc.txt`
2. Run `npm run test -- --reporter=verbose 2>&1 | tee ../Docs/Baselines/2026-04-19_Phase0_baseline_vitest.txt`
3. Run `npm run e2e 2>&1 | tee ../Docs/Baselines/2026-04-19_Phase0_baseline_playwright.txt`
4. Commit as baseline.
5. Open branch `appfolio-parity/phase-0-prep`, implement the 5 Phase-0 tasks in one PR, ship with the GR-9 proof-of-verification block in the PR description.

Then Phase 1 Task 1.1 opens on branch `appfolio-parity/phase-1-1-residents-occupancy`.

🧪
