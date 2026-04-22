# Phase 1 — Top-5 Schema Extensions

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §7
**Phase status.** Not started. Blocked on Phase 0.0 and Phase 0 exit gates.
**Budget.** 3 days + 1 day buffer = 4 days
**Owner.** TBD per task (single engineer recommended to keep type-file ownership clean)
**Dependencies.** Phase 0 complete; `Docs/Phase0_Type_Audit.md` signed off.
**Parallelizable?** **No within-phase.** Tasks 1.1 → 1.5 are sequential to avoid `packages/types/index.ts` merge conflicts (see Appendix D of parent plan).

---

## §1. Scope

Extend the 5 highest-leverage canonical types — `EntityProfile`, `Property`, `Workitem`, and their companion interfaces — with the optional fields AppFolio captures and Strata currently lacks. Wire each type change through `strataTypes.ts`, the relevant module UI, and one `appfolioParity/*.test.ts` contract test. All additions are OPTIONAL per GR-2 (zero back-compat risk).

Scope boundaries:

- IN — type additions, re-exports, module UI that consumes the new fields, one contract test per task, seed data augmentation in `qualia-shell/public/data/*.json`.
- OUT — any change to non-top-5 modules; any backend wiring; any deprecation removals (those live in §11 schedule of parent plan).

---

## §2. Definition of Ready

For every task 1.N:

1. Phase 0 exit gate passed.
2. Engineer has read the linked module source and the matching AppFolio JSON capture.
3. Engineer has pulled the latest branch and re-run `npx tsc -b` clean on their box.
4. The prior task 1.(N-1) is merged to main (sequential rule).
5. The task's contract-test spec has been written on paper and linked in the task ticket.

---

## §3. Definition of Done

Every task must:

1. Add types as OPTIONAL fields (GR-2).
2. Re-export via `strataTypes.ts`.
3. Keep existing fields untouched; mark deprecated ones with `@deprecated — use <new-field>. Removal scheduled: 2026-Q3 cleanup`.
4. Ship one contract test replacing the Phase 0 stub at `appfolioParity/{module}.test.ts`.
5. Wrap any new UI in an `<ErrorBoundary fallback={...}>` (GR-13).
6. Add a Sentry breadcrumb for key interactions.
7. Paste `tsc / vitest / vite build / playwright` output into the PR.
8. Pass `/security-review` with no High/Medium.
9. Document rollback SHA in PR.

---

## §4. Tasks

### Task 1.1 — Residents: Occupancy → N Tenants (1:N)

**Goal.** Support AppFolio's occupancy model where a single occupancy record links one primary tenant + N "Other Occupants" (spouse, kids, roommates).

**Reference data.** `AppFolio_Screenshots/data/03_occupancy_willie_white.json` — occupancy 2800: LaSonta M. Westbrook (primary) + Willie White + Olivia White + Elijah Westbrook.

**DoR read list.**

- `qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx` (full)
- `packages/types/index.ts` lines 73-89 (`EntityProfile`)

**Files touched.**

- `packages/types/index.ts` — add interfaces:
  - `Occupancy { id, unitId, leaseId, startDate, endDate, status: 'Current' | 'Past' | 'Future', primaryTenantId, otherOccupantIds: string[] }`
  - `EmergencyContact { name, relationship, phone?, email? }`
  - `Animal { species, breed?, name?, weight?, registered?: boolean }`
  - `Vehicle { make, model, year?, color?, plate?, state? }`
  - Extend `EntityProfile` with 5 optional fields: `occupancyId?`, `occupantType?: 'Primary' | 'Other Occupant'`, `emergencyContact?`, `animals?: Animal[]`, `vehicles?: Vehicle[]`.
- `qualia-shell/src/components/StrataDashboard/strataTypes.ts` — re-export the 4 new types.
- `qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx` — render "Other Occupants" collapsible under each primary tenant detail; show animals + vehicles + emergency contact.
- `qualia-shell/src/components/StrataDashboard/strataApi.static.ts` — add `/occupancies` route handler returning the Phase 0 derived fixture.
- `qualia-shell/public/data/occupancies.json` (new) — seeded from Willie White occupancy 2800.
- `qualia-shell/src/test/appfolioParity/residents.test.ts` — replace stub with real contract test.

**Contract test.** "Given occupancy 2800 with LaSonta M. Westbrook primary + 3 Other Occupants, the ResidentsModule renders 1 primary header and 3 occupants in the collapsible; emergency contact block visible; 0 animal/vehicle rows when not present."

**Steps.**

1. Type additions + re-export.
2. `tsc -b` clean.
3. Static-api route handler.
4. Module UI with collapsible + error boundary.
5. Seed `occupancies.json`.
6. Contract test.
7. Dev-server smoke: `/strata/residents` shows LaSonta + 3 occupants.

**Verify.**

```
cd qualia-shell
npx tsc -b                  # 0 errors
npx vitest run              # ≤ baseline failures + new test passes
npx playwright test         # ≤ baseline
npx vite build              # 0 errors
```

Screenshot of `/strata/residents` attached to PR.

**Rollback.** `git revert {commit-sha}`. All additions optional; no back-compat risk.

**Observability.** ErrorBoundary around collapsible; Sentry breadcrumb `residents.occupants.toggle`.

---

### Task 1.2 — Vendors: 45-field / 10-block schema

**Goal.** Match AppFolio's vendor detail: federal tax block (W-9, 1099), accounting block (check consolidation, GL defaults, payment terms), compliance block (6 expiration dates).

**Reference data.** `AppFolio_Screenshots/data/10_vendor_detail_2story_roofing.json` — vendor 2716: Danny Bourdua, Zelle payment, send1099=true, GL expiration 2026-07-11, 5 other compliance nulls.

**DoR read list.**

- `qualia-shell/src/components/StrataDashboard/modules/VendorsModule.tsx`
- `10_vendor_detail_2story_roofing.json`

**Files touched.**

- `packages/types/index.ts`:
  - `VendorFederalTax { taxpayerName?, w9Requested?, taxIdMasked?, taxFormAccountNumber?, send1099? }`
  - `VendorAccountingInfo { checkConsolidation?, checkStubBreakdown?, holdPayments?, emailECheckReceipt?, paymentTerms?, defaultCheckMemo?, defaultGlAccount?, workOrderAdjustmentPercent?, discount?, onlinePayablesEnabled?, paymentType?, savingsAccount? }`
  - `VendorCompliance { workersCompExpiration?, generalLiabilityExpiration?, epaCertificationExpiration?, autoInsuranceExpiration?, stateLicenseExpiration?, contractExpiration?, requestComplianceDocumentsCta? }`
  - Extend vendor-subtype `EntityProfile` with `vendorFederalTax?`, `vendorAccounting?`, `vendorCompliance?`, `paymentMethod?: 'Check' | 'ACH' | 'Zelle' | 'eCheck'`, `send1099?: boolean`.
- `strataTypes.ts` — re-export.
- `VendorsModule.tsx` — add Compliance tab (6 rows color-coded by proximity via `expirationColor(date)` helper) + Accounting tab (check consolidation, payment terms, default GL).
- `qualia-shell/src/components/StrataDashboard/modules/__vendors/ComplianceTab.tsx` (new).
- `qualia-shell/src/components/StrataDashboard/modules/__vendors/AccountingTab.tsx` (new).
- `qualia-shell/public/data/entities.json` — augment vendor 2716 with the new fields.
- `qualia-shell/src/test/appfolioParity/vendors.test.ts` — real contract test.

**Helper.** `expirationColor(dateISO: string) → 'green' | 'yellow' | 'red' | 'gray'`:

- green: > 60 days out
- yellow: 0–60 days
- red: expired or < 0 days
- gray: null/undefined

**Contract test.** "Given vendor 2716 with 5 null compliance fields + 1 GL expiration 2026-07-11, `/strata/vendors/appfolio-v-2716` renders the Compliance tab with 6 rows (5 gray 'Missing', 1 yellow 'expiring in ~3 months'); the Accounting tab shows Zelle as payment method + send1099=Yes."

**Deprecation note.** Existing fields `coiStatus`, `coiExpiry`, `w9OnFile`, `insuranceCarrier` stay in place; annotated `@deprecated — use vendorCompliance.generalLiabilityExpiration. Removal scheduled: 2026-Q3 cleanup.` Added to parent §11 schedule.

**Verify.** Same four-command gate as 1.1 + screenshot of both tabs.

**Observability.** ErrorBoundary around each new tab; breadcrumbs `vendors.compliance.view` and `vendors.accounting.view`.

---

### Task 1.3 — Properties: purchase history + late fee + maintenance + fixed assets

**Goal.** Render 4 new collapsibles on the property detail page: purchase history, late fee policy, maintenance config, fixed assets.

**Reference data.** `AppFolio_Screenshots/data/02_property_detail_128_buena_vista.json` — property 18: purchaseHistory[0].amount=2270000, late fee policy, maintenance config, 4 fixed assets.

**DoR read list.**

- `qualia-shell/src/components/StrataDashboard/modules/PropertiesModule.tsx`
- `02_property_detail_128_buena_vista.json`

**Files touched.**

- `packages/types/index.ts`:
  - `PurchaseHistory { date, amount, seller?, titleCompany? }`
  - `LateFeePolicy { effective?, baseFee?, graceDays?, graceBalance?, percentage? }`
  - `MaintenanceConfig { maintenanceLimit?, homeWarrantyCompany?, homeWarrantyExpires?, preAuthRequired? }`
  - `FixedAsset { assetId?, type?, status?, placedInService?, warrantyExpiration?, notes? }`
  - Extend `Property` with 5 optional fields: `purchaseHistory?: PurchaseHistory[]`, `lateFeePolicy?`, `maintenanceConfig?`, `nonRevenueUnit?: boolean`, `fixedAssets?: FixedAsset[]`.
- `strataTypes.ts` — re-export.
- `PropertiesModule.tsx` — 4 collapsibles in declared order: Purchase History → Late Fee Policy → Maintenance Config → Fixed Assets.
- `qualia-shell/src/components/StrataDashboard/modules/__properties/FixedAssetsTable.tsx` (new).
- `qualia-shell/public/data/properties.json` — augment property 18.
- `qualia-shell/src/test/appfolioParity/properties.test.ts` — real test.

**Contract test.** "Given property appfolio-18 with purchaseHistory[0].amount=2270000 + 4 fixed assets, `/strata/properties/appfolio-18` renders 4 new sections in declared order; Fixed Assets table has 4 rows with columns assetId/type/status/placedInService/warrantyExpiration."

**Verify.** Standard four-command gate + screenshot.

---

### Task 1.4 — Maintenance / Workitem: resident availability + actions log + labor + PO linkage

**Criticality: HIGHEST. `Workitem` is shared across Incident, Legal, Projects, Utilities, Leasing — GR-1 protected modules.**

**Reference data.** `08_wo_detail_19511.json` — WO 19511-1: Brianna M. Jackson fire alarm, 3 Monday 2026-04-20 availability windows, 2-entry actions log, no labor, no POs yet.

**DoR read list.**

- `qualia-shell/src/components/StrataDashboard/modules/MaintenanceModule.tsx`
- `08_wo_detail_19511.json`
- PLUS run the full vitest suite on a throwaway branch with ONLY the type change applied, confirming no compile breaks in `IncidentModule`, `LegalModule`, `ProjectsModule`, `UtilitiesModule`, `LeasingModule`.

**Files touched.**

- `packages/types/index.ts`:
  - `ResidentAvailability { day, startTime?, endTime?, notes? }`
  - `ActionLogEntry { ts, actor, event?, action?, detail? }`
  - `LaborEntry { date, technicianId, hours, rate }`
  - `PurchaseOrderLink { poId, amount, status }`
  - Extend `Workitem` with 10 optional fields: `residentAvailability?`, `actionsLog?`, `labor?`, `linkedPurchaseOrders?`, `withheldFromOwner?`, `serviceRequestId?`, `permissionToEnter?`, `jobDescription?`, `vendorTrade?`, `vendorInstructions?`.
- `strataTypes.ts` — re-export.
- `MaintenanceModule.tsx` — render 5 new sections in WO detail panel.
- `__maintenance/ResidentAvailabilityCard.tsx` (new).
- `__maintenance/ActionsLogList.tsx` (new).
- `__maintenance/LaborTable.tsx` (new).
- `__maintenance/PurchaseOrderLinks.tsx` (new).
- `qualia-shell/public/data/workitems.json` — augment WO 19511-1.
- `qualia-shell/src/test/appfolioParity/maintenance.test.ts` — real test.

**GR-1 check (mandatory).** Task's phase-gate MUST run the full vitest suite PLUS verify that each of the 5 protected modules still renders in dev without console errors. Add snapshot tests for each of the 5 under `qualia-shell/src/test/protected-smoke/`.

**Contract test.** "Given WO 19511-1 with 3 Monday availability windows + 2-entry action log + 0 labor + 0 POs, the detail panel renders: ResidentAvailabilityCard (3 rows), ActionsLogList (2 rows), LaborTable (empty state), PurchaseOrderLinks (empty state)."

**Verify.** Standard four-command gate + 5 protected-module screenshots.

---

### Task 1.5 — Accounting: recurring charges + payment method enum

**Goal.** Extend the ledger row / invoice row to carry AppFolio's schedule metadata: account code, account name, schedule start/end, next charge, previous charge, payment status.

**Reference data.** Willie White occupancy's 3 × $1,595 monthly rent rows from the occupancy capture.

**DoR read list.**

- `qualia-shell/src/components/StrataDashboard/modules/AccountingModule.tsx`

**Files touched.**

- `packages/types/index.ts` — extend `Workitem` (payment subtype) or add `TenantLedgerRow` / `InvoiceRow` with 7 optional fields: `accountCode?, accountName?, scheduleStart?, scheduleEnd?, nextChargeDate?, previousChargeDate?, paymentStatus?`.
- `AccountingModule.tsx` — render schedule metadata columns.
- `qualia-shell/public/data/recurring_charges.json` — seed Willie White's 3 × $1,595 rent rows.
- `qualia-shell/src/test/appfolioParity/accounting.test.ts` — real test.

**Contract test.** "Given Willie White occupancy 2800 with 3 recurring rent charges at $1,595, the Accounting view lists 3 rows with accountName='Rent', scheduleStart + nextChargeDate populated, paymentStatus populated."

**Verify.** Standard four-command gate.

---

## §5. Verification Matrix (Phase 1 row expanded)

| Check | 1.1 | 1.2 | 1.3 | 1.4 | 1.5 |
|---|:-:|:-:|:-:|:-:|:-:|
| `tsc -b` = 0 | R | R | R | R | R |
| `vitest run` ≤ baseline | R | R | R | R | R |
| New contract test added | R | R | R | R | R |
| `playwright test` ≤ baseline | R | R | R | R | R |
| `vite build` both flag states | R | R | R | R | R |
| Manual dev-server smoke | R | R | R | R | R |
| Screenshot attached | R | R | R | R | R |
| GR-1 protected-module snapshot | — | — | — | **R** | — |
| axe-core ≤ baseline on modified pages | R | R | R | R | R |
| Lighthouse LCP ≤ max(baseline, 500ms) | R | R | R | R | R |
| `/security-review` clean | R | R | R | R | R |
| PII-leak scan | R | R | R | R | R |
| Rollback SHA documented | R | R | R | R | R |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-1-1 | `Workitem` type change breaks GR-1 protected modules | Med | High | Task 1.4 DoR requires a throwaway-branch compile-check first; 5 snapshot tests |
| R-1-2 | Merge conflict on `packages/types/index.ts` | Med | Med | Sequential 1.1 → 1.5; Appendix D owner-per-phase |
| R-1-3 | Deprecated fields used in unseen modules | Low | Med | grep confirms zero callers before Phase 3 deprecation removal |
| R-1-4 | Vendor 30+ field render regresses LCP | Low | Med | Lighthouse gate; virtualize list if >200 items |
| R-1-5 | a11y regression from new collapsibles / tabs | Med | Med | use `aria-expanded`, `role="tablist"`; axe tests |
| R-1-6 | Contract test is wrong and masks a real bug | Low | Med | Test reviewed by a second pair of eyes before merge |

---

## §7. Rollback Plan

Each of 1.1–1.5 is a discrete PR. Rollback in reverse order 1.5 → 1.4 → 1.3 → 1.2 → 1.1. All type changes are additive + optional, so `git revert` is safe at any point. Data files in `qualia-shell/public/data/*.json` revert cleanly.

---

## §8. Exit Gate

Phase 1 is complete when:

1. All 5 tasks merged to main.
2. Full-suite `vitest run` has ≤ baseline failures.
3. Full-suite `playwright test` has ≤ baseline failures.
4. `vite build` succeeds in both flag states.
5. GR-1 protected modules still render without console errors (5 snapshot tests green).
6. `Docs/Phase1_Completion_Report.md` committed with pasted output + 5 module screenshots.
7. Ilya verifies "go Phase 2" per standing rule.

---

## §9. Deliverables

- 4 new / extended canonical type modules (`packages/types/index.ts`).
- 4 new sub-components: `ComplianceTab.tsx`, `AccountingTab.tsx`, `FixedAssetsTable.tsx`, plus 4 maintenance cards.
- 5 new `.test.ts` contract tests replacing the Phase 0 stubs.
- 5 dev-server screenshots.
- 5 GR-1 protected-module snapshot tests.
- `Docs/Phase1_Completion_Report.md`.

---

## §10. Timeline

| Task | Budget | Owner | Start gate |
|---|:-:|---|---|
| 1.1 Residents | 0.5 day | TBD | Phase 0 green |
| 1.2 Vendors | 1 day | TBD | 1.1 merged |
| 1.3 Properties | 0.5 day | TBD | 1.2 merged |
| 1.4 Maintenance / Workitem | 1 day | TBD | 1.3 merged (highest care) |
| 1.5 Accounting | 0.25 day | TBD | 1.4 merged |
| Buffer | 1 day | — | — |
| **Total** | **4 days** | | |

🧪
