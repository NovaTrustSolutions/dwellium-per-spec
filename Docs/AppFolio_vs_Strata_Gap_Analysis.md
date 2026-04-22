# AppFolio vs Strata — Section-by-Section Gap Analysis

**Source data:** `AppFolio_Screenshots/data/*.json` (captured 2026-04-19 from live zohouryproperties.appfolio.com via Chrome MCP DOM extraction) vs `qualia-shell/src/components/StrataDashboard/modules/*.tsx` (read 2026-04-19).

**Scope:** All 33 Strata modules. Each section is scored on AppFolio coverage: **Covered** (AppFolio has a direct equivalent), **Partial** (AppFolio has pieces but missing key features), **Strata-unique** (no AppFolio equivalent), or **AppFolio-unique** (AppFolio ships it, Strata does not).

**Reading key:**
- **AppFolio** = what the AppFolio UI actually shows on the captured pages
- **Strata** = current Strata module content (sections/fields actually rendered)
- **Gap** = what's missing or different
- **Recommendation** = concrete next step

---

## Global portfolio ground-truth (for reference)

From AppFolio capture: **50 properties**, **3,274 tenants** (`/occupancies`), **3,040 vendors** (`/vendors`), **1,563 open work orders**, **Core tier** (paid add-ons disabled). Strata static fixtures currently ship: **4 properties, 240 units, 250 entities, 500+ workitems, 15 insurance policies, 100+ notes, 50 compliance rows**. Fixture-vs-reality ratio is roughly **1:12** for properties and **1:13** for tenants — Strata mocks are order-of-magnitude smaller than a real mid-market portfolio.

---

## 1. AccountingModule

- **AppFolio coverage:** **Covered.** AppFolio has `/accounting/receivable_payments`, `/accounting/payable_invoices`, `/accounting/bank_accounts`, `/accounting/journal_entries`, `/accounting/bank_transfers`, `/accounting/gl_accounts`, `/accounting/financial_diagnostics`. Strata section list (Overview, Receivables, Payables, Bank Accounts, Journal Entries, Bank Transfers, GL Accounts, Tenant Ledger, Diagnostics) is a 1:1 mirror.
- **AppFolio fields on tenant ledger** (from `09_tenant_detail_willie_white.json`): account (e.g. "4100: Rent Income"), amount, start/end dates, next/previous charge dates, status (PAID), NSF fee ($49), deposit paid ($850), eligible-for-rent-increase date. Strata tenant-ledger renders: charge, payment, date, balance.
- **Gap:** Strata's `invoices` mock has 25 rows vs AppFolio's real 3,040-vendor × months-of-history volume. Strata is missing: **recurring-charge schedule metadata** (start/end/next/previous), **per-tenant NSF fee override**, **rent-increase-eligibility date**, **Zelle-bypass-1099 flag** (seen in vendor 2716 note).
- **Recommendation:** Extend `strataTypes.ts` tenant-ledger row to include `{ accountCode, accountName, scheduleStart, scheduleEnd, nextChargeDate, previousChargeDate, status: 'PAID'|'DUE'|'PAST_DUE' }`. Add vendor AP flag `paymentMethod: 'Check'|'ACH'|'Zelle'|'eCheck'` with `send1099` boolean.

## 2. AuditModule

- **AppFolio coverage:** **Partial (AppFolio-gated).** AppFolio's `apm_audit_center` entitlement is **DISABLED** on the Core tier per the decoded feature-flag blob. ZP Group doesn't get audit center. Strata ships its own.
- **AppFolio fields** (per-entity Audit Log seen on tenant/vendor/WO detail pages): timestamp + user + action + detail. No archive search, no severity scoring.
- **Gap:** Strata audit has userId/userRole/action/entityType/entityId/severity/category — richer than AppFolio's plain log. **This is a Strata differentiator**, not a gap.
- **Recommendation:** Position Strata audit as a Core-tier-friendly alternative to AppFolio's locked-off audit center. Market copy: "Audit center included — no premium upgrade required."

## 3. CalendarModule

- **AppFolio coverage:** **Partial.** AppFolio has lease-expiration reports and scheduled-inspection lists (9 AHA inspections at Riverwood Club scheduled 04/27-04/30/2026 per `03_work_orders_page1.json`) but no Google/Apple Calendar sync.
- **Gap:** AppFolio lacks the Integrations tab entirely. Strata's Google Calendar + Apple Calendar subscribe/download is **Strata-unique**.
- **Recommendation:** When seeding Strata calendar fixtures, backfill the 9 AHA inspections from AppFolio `03_work_orders` as concrete calendar rows (title: "AHA Inspection – Unit {X}", location: "Riverwood Club", dueDate: 2026-04-27..30). Proves Strata calendar absorbs real Section-8 compliance cadence.

## 4. CivilEngineeringStudio

- **AppFolio coverage:** **Strata-unique.** AppFolio has no AI engineering plan generation feature. Not present in any captured page or feature-flag.
- **Gap:** None. Pure differentiator.
- **Recommendation:** N/A for AppFolio parity. Position this as a Dwellium-only capability.

## 5. CommunicationModule

- **AppFolio coverage:** **Partial.** AppFolio surfaces per-entity email + text history (49 community emails from Ashley Johnson → LaSonta M. Westbrook on `09_tenant_detail_willie_white.json`, 1 system SMS on `10_vendor_detail_2story_roofing.json`). AppFolio has a Communication menu section but no "Letters" or "Forms" builders in the current capture.
- **AppFolio fields:** status (Opened), sentAt, to, from, subject. Each tenant/vendor has a Texts + Emails block with send forms (donotreply@appfolio.com from-address).
- **Gap:** Strata's Letters + Forms tabs are **Strata-unique**. AppFolio does have bulk-letter functionality but it's gated behind `apm_mailing_batches` (not in Core-tier feature flag).
- **Recommendation:** Seed Strata Inbox fixture with the 10 community-announcement email subjects from `09_tenant_detail_willie_white.json` ("Important Community Notice: Vehicle Safety Reminder", "Paperless Payment Transition", "Water Service Interruption Notice – April 15, 2026", etc.) to show realistic property-manager outbound cadence.

## 6. ComplianceEngine

- **AppFolio coverage:** **Partial.** AppFolio's closest equivalent is the **Insurance Enforcement buffered report** (captured in `07_insurance_compliance.json`) which is a flat tabular report, not a 6-view dashboard. AppFolio has `TaxCreditComplianceReport: true`, `AffordableHousingProgramStatusReport: true`, `AffordableHousingHudWaitlistReport: true`, and `IncomeCertifications: true` as separate reports.
- **AppFolio fields:** Property, Unit, Resident, LeaseRequiresInsurance, InsuranceRequirement, ActiveCoverage. Per-vendor compliance expiration dates: Workers' Comp, General Liability, EPA, Auto Insurance, State License, Contract (see `10_vendor_detail_2story_roofing.json` – 2-STORY TECHNICAL ROOFING has only General Liability 2026-07-11; all 5 others are empty).
- **Gap:** AppFolio does **not** roll insurance/HCV/LIHTC/vendor-COI compliance into a single pane. Strata's 6 views (Heatmap, Mind Map, Timeline, Risk, Vendor Matrix, Predictions) are all **Strata-unique**.
- **Recommendation:** Seed `compliance` fixture with: (a) the 6 blank vendor-COI rows from vendor 2716 (pretend each has an expiration), (b) the 9 AHA inspection items as Section-8 compliance rows, (c) empty "Lease Requires Insurance" rows across the 50-property portfolio to illustrate the "No Rows To Show" state that AppFolio gets stuck on. Dwellium's Predictions view is the headline differentiator.

## 7. CorporateReview

- **AppFolio coverage:** **Strata-unique.** AppFolio has attachments per-entity (property 128 Buena Vista has 19 PDF attachments uploaded 2017-2018 by Lisa Zohoury / Debbie Stokes per `02_property_detail_128_buena_vista.json`) but no triage → approval → workitem pipeline.
- **Gap:** None. Pure differentiator.
- **Recommendation:** Use the 19 real PDF filenames from property 18 (e.g., "Duke Energy Water Heater Repair & Replacement Plan Renews on 2-16-19 128BV.pdf", "Contract_with_Southern_Green_4-5-18_128BV.pdf", "Massey_Pest_Prevention_Agreement_4-28-17.pdf", "2017_Notice_of_Proposed_Property_Taxes_128_BV.pdf") as seed fixtures in corporate-review queue to demo triage workflow.

## 8. DesignStudio

- **AppFolio coverage:** **Strata-unique.** AppFolio has no AI floor-plan generation. Not in any capture.
- **Gap:** None.
- **Recommendation:** N/A for AppFolio parity.

## 9. ForecastModule

- **AppFolio coverage:** **Partial.** AppFolio has `BufferedPropertyBudgetReport: true`, `BufferedAnnualBudgetForecastReport: true`, `BufferedTwelveMonthCashFlowReport: true`, `BufferedTwelveMonthIncomeStatementReport: true` — static 12-month reports. No scenario modeling (occupancy override, rent-change slider).
- **Gap:** Strata's interactive sliders for occupancy + rent change are **Strata-unique**. AppFolio's revenue-management add-on (`apm_revenue_management`) is **DISABLED** on Core tier — so ZP Group cannot scenario-model within AppFolio at all.
- **Recommendation:** Seed forecast fixture with the 50 real properties and their market-rent-implied revenue, not the 4 mock properties. Story: "your AppFolio Core tier gives you static reports only; Strata Forecast lets you flex occupancy + rent and see impact in real time."

## 10. IncidentModule

- **AppFolio coverage:** **Strata-unique.** AppFolio conflates incidents with work orders (all resident-reported issues go through `/maintenance/service_requests/work_orders`). No separate severity/witness/police-report/insurance-claim schema in any capture.
- **Gap:** None for Strata (differentiator). AppFolio lacks this.
- **Recommendation:** Position as a Strata advantage: distinct entity type with formal escalation path beyond maintenance ticket.

## 11. InsuranceModule

- **AppFolio coverage:** **Partial.** AppFolio has the Insurance Enforcement buffered report (5 Core-tier compliance columns) but also aggressively upsells **FolioGuard Smart Ensure** on every tenant detail page (per `09_tenant_detail_willie_white.json`). AppFolio's `BufferedInsuranceAuditReport: false` and `BufferedInsuranceUsageReport: false` are **DISABLED** on Core tier — portfolio can't use them.
- **AppFolio fields on Enforcement report:** Property, Unit, Resident, LeaseRequiresInsurance, InsuranceRequirement, ActiveCoverage (only 6 visible columns, 10 hidden). Strata renders: policyType, policyNumber, carrier, agentName, agentPhone, premiumAnnual, coverageAmount, deductible, effectiveDate, expirationDate — 10+ fields, **richer than AppFolio's exposed schema**.
- **Gap:** Strata **surpasses** AppFolio on per-policy detail. AppFolio's report is thinner. Strata missing: the **FolioGuard-equivalent upsell tracking** (tenant → policy → fulfillment status).
- **Recommendation:** Call this out explicitly in the deck: "Strata ships 10-field policy detail by default; AppFolio's Core tier only shows 6 and charges extra for the audit report." Seed Strata insurance fixture with 50 policies (one per property) matching the real property names from `01_properties_page1.json`.

## 12. LeasingModule

- **AppFolio coverage:** **Covered.** AppFolio menu has Vacancies / Guest Cards / Rental Applications / Leases / Renewals / Metrics / Signals — Strata's 7-tab list is an exact 1:1 mirror.
- **AppFolio fields on Leases page** (`06_leases.json`): tenant, unit, lease_generation_date, status, action (Countersign). Tabs: All / Ready to Countersign / Out for Signing / Printed.
- **AppFolio gotchas:** `apm_leasing_crm: DISABLED`, `apm_leasing_revenue_management: DISABLED`, `apm_signals: DISABLED`, `apm_leasing_metrics_dashboard: DISABLED`, `apm_rental_app_price_quotes: DISABLED`, `apm_rental_applications_multiple_templates: DISABLED`. Core-tier customers see the tabs but can't use most of the features.
- **Gap:** Strata renders all 7 tabs with full functionality; AppFolio Core tier hides the good parts behind upgrades.
- **Recommendation:** Seed Leasing fixture with the 2 real pending-countersign leases (Jamel D. Brown → Riverwood H12 2026-03-31, Vanessa V. Blunt → Riverwood D14 2026-03-31). Adds concrete realism.

## 13. LegalModule

- **AppFolio coverage:** **Strata-unique.** AppFolio has no legal-matter tracking module. Not present.
- **Gap:** None.
- **Recommendation:** N/A for parity.

## 14. MaintenanceModule

- **AppFolio coverage:** **Covered (with Strata extending).** AppFolio menu: Work Orders / Recurring Work Orders / Inspections / Unit Turns / Projects / Purchase Orders / Inventory / Fixed Assets / Maintenance Performer. Strata: Work Orders / Recurring / Inspections / Unit Turns / Projects / Purchase Orders / Inventory / Fixed Assets / History — exact 9-tab match except Strata's "History" vs AppFolio's "Maintenance Performer".
- **AppFolio WO detail** (`08_work_order_detail_19511.json`): service_request → work_order → job → scheduling → resident_availability (3 time windows) → actions_log (timestamped) → assignee → labor → purchase_orders → withheld_amount → invoices → texts → emails → attachments → notes. **15 sub-sections**. Strata renders title/priority/status/propertyId/unitId/assignedTo/createdAt/resolvedAt/resolutionHours/technicianName/signedOffBy/completionNotes — **12 fields but missing the sub-sections**.
- **Gap:** Strata missing: **resident_availability time windows** (AppFolio captures 3 windows per request), **actions_log** (AppFolio logs every state change with timestamp + actor + system-vs-user), **labor block** (per-tech hours), **PO/invoice linkage**, **withheld-from-owner amount**. Also missing: **Trello-style Kanban+4-view toggle is Strata-unique** (AppFolio has table view only). Strata's `metadata.trelloBoardName` is an extension.
- **Recommendation:** Augment `workitem` type with `{ residentAvailability: [{day, windows}], actionsLog: [{ts, actor, event, detail}], labor: [{tech, date, hours, description}], withheldFromOwner: number }`. Seed with the real WO 19511-1 (Brianna M. Jackson, Woodland Parc 2789-1-4, "Fire alarm needs replaced. Beeping and can't reach.", 3 Monday 04/20/2026 time windows).

## 15. ManagerHome

- **AppFolio coverage:** **Partial.** AppFolio's closest equivalent is the `/` dashboard landing, but no side-by-side Move-Ins/Outs + WOs + Lease-Expirations + Tasks + AP Calendar + Portfolio Income card layout was captured.
- **Gap:** AppFolio dashboard is coarser; Strata's 6-widget grid is **Strata-unique** in composition.
- **Recommendation:** Seed the 6 widgets with real data: **Move-Ins** (Willie White occupancy 2025-09-19 → Riverwood B03), **Move-Outs** (draw from 3,274-tenant Past-status list), **Outstanding WOs** (first 50 from `03_work_orders_page1.json`), **Lease Expirations** (Willie White 2026-09-30, Jamel D. Brown + Vanessa V. Blunt countersigns), **My Tasks** (Lisa Zohoury's two vendor-compliance follow-ups on 2-STORY TECHNICAL ROOFING), **Portfolio Income** ($1,595/unit × 50 units estimate).

## 16. OwnersModule

- **AppFolio coverage:** **Covered.** AppFolio has `/owners` as a top-level menu with Entity profile + Ownership %. Property detail (`02_property_detail_128_buena_vista.json`) shows `owners: [{name: "The Nasser Zohoury Revocable Trust", percent_owned: 100.0, percent_distributed: 100.0}]` and `portfolio: "NASSER J. ZOHOURY, MD"`.
- **AppFolio fields on property owner block:** name, percent_owned, percent_distributed. On WO detail: owner name + notes.
- **Gap:** Strata owner fields (name, email, phone, entityType, type, ownershipPercent, linkedProperties, distributions, period, amount, status) are a **superset** of AppFolio. Strata missing: **percent_distributed** (AppFolio distinguishes ownership % from distribution %), **trust-vs-LLC-vs-individual structure label** (the real portfolio uses "The Nasser Zohoury Revocable Trust" as an owner entity).
- **Recommendation:** Add `percent_distributed` field to owner rows. Seed owner fixtures with real portfolio structure: Nasser Zohoury Revocable Trust, Southeastern Apartment Investment Corp (WO 19511-1 owner), and the distinct Zohoury-family LLCs implied by the 50-property footprint.

## 17. ProfileSpaces

- **AppFolio coverage:** **Strata-unique.** AppFolio has no user-definable entity tabs or cross-entity links.
- **Gap:** None.
- **Recommendation:** N/A.

## 18. ProfilesModule

- **AppFolio coverage:** **Covered.** AppFolio's top nav (Tenants / Owners / Vendors) corresponds to Strata's unified Profiles browser. AppFolio splits into three separate URLs (`/occupancies`, `/owners`, `/vendors`) where Strata unifies all 7 entity types (Properties, Units, Tenants, Contractors, Employees, Owners, Corporate) behind one browser.
- **Gap:** Strata unification is **Strata-unique**. AppFolio requires 3 separate navigation destinations for what Strata gives in one.
- **Recommendation:** Seed with: 50 real properties from `01`, ~240 units (match AppFolio's real 3,274-tenant scale but keep seed tight), 13 sample tenants from `04`, real vendors from `05` (2-STORY TECHNICAL ROOFING LLC, CS COOPER RESIDENTIAL CONTRACTORS LLC, GEORGIA POWER, JIMENEZ HOME REPAIRS LLC).

## 19. ProjectsModule

- **AppFolio coverage:** **Partial.** AppFolio has `/maintenance/projects` as one submenu item. No Trello-style Kanban, no "By Entity" rollup.
- **Gap:** Strata's entity-grouped Kanban is **Strata-unique**.
- **Recommendation:** Seed project fixture with real capital-improvement patterns from the portfolio (e.g., "Replace sheetrock from leak 2 weeks ago" at Woodland Parc 2767-3 which is WO 19441-1 in `03_work_orders_page1.json` — this WO is Assigned to CS COOPER RESIDENTIAL CONTRACTORS and is essentially a small project).

## 20. PropertiesModule

- **AppFolio coverage:** **Covered.** AppFolio `/properties` (50 properties) and `/properties/{id}` detail with tabs Property / Budget / Marketing / Comparables / Showing Settings.
- **AppFolio fields on property detail** (`02_property_detail_128_buena_vista.json`): name, type (Single-Family), address, county, status (Vacant / Rent Ready Y/N / Lockbox), description (full purchase history as prose), portfolio, management_start, rental (bedrooms/bathrooms/sqft/market_rent/application_fee/nsf_fee), non_revenue_unit metadata, owners array, late_fee_policy {effective, base_fee, grace_days, grace_balance}, maintenance {limit, insurance_expiration, home_warranty, pre_auth_entry}, fixed_assets array, attachment_count.
- **Gap:** Strata renders name/address/type/status/unitCount/occupancyRate/totalRent/workOrderCount/openIncidents — **9 fields vs AppFolio's ~30**. Strata missing: **purchase history prose block** (AppFolio's description field captures "Purchased on Oct. 16, 2009 From: Dolan & Brenda Ricketts, 1750 Santa Barbara Dr., Dunedin, FL 34698. Settlement Agent: Wolinka & Wolinka Title Ins Agency. Purchase Price: $2,270,000"), **late-fee policy block** (effective date + base fee + grace days + grace balance), **maintenance limit + home warranty + pre-auth-entry flags**, **non-revenue-unit metadata**, **fixed-assets inline list** (property 18 has 4 assets: 2 pool pumps, refrigerator, toilet).
- **Recommendation:** Expand `property` type to include `{ purchaseHistory: {date, seller, price, settlementAgent, parcel}, lateFeePolicy: {effective, baseFee, graceDays, graceBalance}, maintenance: {limit, insuranceExpiration, homeWarranty, preAuthEntry}, nonRevenueUnit: {status, type, start}, fixedAssets: FixedAsset[] }`. Seed with the 4 real fixed assets from 128 Buena Vista.

## 21. PropertyOverview

- **AppFolio coverage:** **Covered.** AppFolio property detail page opens with status cards: Status, Rent Ready, Lockbox, Market Rent, Portfolio. Strata renders Occupancy / Rent Roll / Open Work Orders / High Priority / Incidents / Compliance cards. Slightly different KPI selection.
- **Gap:** AppFolio lacks a direct "compliance score" card. Strata lacks "rent ready" boolean.
- **Recommendation:** Add `rentReady` boolean to Strata property card. Pull `occupancyRate` from real AppFolio data — the portfolio has many Past-status tenants (from `04_tenants_page1.json`) so real occupancy is likely 70-85%, not the 95%+ the static mocks imply.

## 22. PropertyTimeline

- **AppFolio coverage:** **Partial.** AppFolio's property detail has the Audit Log block (per-entity chronological events) but no unified WO+incident+audit timeline. Actions-log on WO 19511-1 shows "2026-04-17 08:24 PM Submitted online by Brianna M. Jackson" + "2026-04-17 08:24 PM Resident submitted preferred times – System".
- **Gap:** Strata's cross-entity unification is **Strata-unique**. AppFolio makes you jump between audit log, WO detail, and email log per-entity.
- **Recommendation:** Seed timeline fixture merging the 13 WO events from `03_work_orders_page1.json` with Lisa Zohoury's 19 attachment uploads on property 18 and the 49 community emails from Ashley Johnson. Proves the unified feed.

## 23. ReportingModule

- **AppFolio coverage:** **Covered (strongly).** AppFolio has `/reports` with hundreds of buffered reports enumerated in `07_insurance_compliance.json` accessControl dict: ~200 report types including BalanceSheet, CashFlow, IncomeStatement, TrialBalance, DuesRoll, LeaseExpirationDetail, RentRoll, AgedReceivablesDetail, ChargeDetail, Owner1099, Vendor1099, InsuranceEnforcement, etc.
- **Strata tabs:** Reports / Scheduled / Metrics / Surveys / Custom Query / Rollups / Intake — Intake is **Strata-unique (Phase 10)**.
- **Gap:** AppFolio has **far more report templates out-of-the-box** (~200 vs Strata's ~12 snapshots). AppFolio missing: **Custom Query** (`apm_reporting_api: DISABLED`), **Rollups**, **Intake queue**.
- **Recommendation:** For parity demos, seed Strata reports fixture with the 30 most-used AppFolio report names. But differentiate via Custom Query + Intake queue — features AppFolio Core tier literally cannot offer.

## 24. ResidentsModule

- **AppFolio coverage:** **Covered.** AppFolio `/occupancies` = Strata Residents list. 3,274 tenants.
- **AppFolio fields on tenant detail** (`09_tenant_detail_willie_white.json`): 26 visible sections including Summary / Tenants (primary + other occupants) / Status / Tags / **FolioGuard Smart Ensure upsell** / Contact / Phone / Emails / Addresses / Occupant Status / Electronic Cash Payments / Screening / Emergency Contact / Upcoming Activities / Insurance Coverage / Notes / Texts / Emails / Monthly Charges / Recurring Charges / Lease Information / Financials / Late Fee Policy / Animals / Vehicles / Audit Log / Attachments.
- **Strata fields:** name, email, phone, status, leaseStartDate, leaseEndDate, rentAmount, securityDeposit, unitId, propertyId, moveInDate — **11 fields vs AppFolio's ~30**.
- **Gap:** Strata missing: **Occupancy → Tenants 1:N structure** (AppFolio: LaSonta M. Westbrook is Primary, Willie White + Olivia White + Elijah Westbrook are Other Occupants on same occupancy), **tenant type enum** (Primary/Other), **emergency contact**, **animals** (shih poo on WO 19511-1), **vehicles** (dedicated panel exists in Strata but not wired), **electronic cash payments**, **screening data**, **tenant tags**, **recurring-charge schedule metadata**.
- **Recommendation:** Refactor Strata `tenant` into `{ occupancy: { id, unitId, startDate, endDate }, tenants: [{ id, name, type: 'Primary'|'Other', ...contact }] }`. This is the single biggest schema upgrade required. Seed with Willie White occupancy as the canonical example.

## 25. SentimentModule

- **AppFolio coverage:** **Partial (via Surveys).** AppFolio has `BufferedSurveysSummaryReport: true` in the report catalog but no per-tenant sentiment score or at-risk flag in any capture. Strata's sentiment scoring is richer.
- **Gap:** At-risk flag, sentiment score are **Strata-unique**.
- **Recommendation:** Seed at-risk fixture with the Past-status tenants from `04_tenants_page1.json` (ABREU MARIO, ABDELSADEK MOHAMED, etc. — they churned; hypothetically they had low sentiment before moving out).

## 26. StatusCheckModule

- **AppFolio coverage:** **Strata-unique.** Infrastructure status monitoring is not a property-management feature; AppFolio doesn't ship this.
- **Gap:** None.
- **Recommendation:** N/A for AppFolio comparison.

## 27. TenantPortalModule

- **AppFolio coverage:** **Covered (tenant-facing only).** AppFolio has a resident portal at resident-login URL; Strata wraps it in management-side view. AppFolio's portal-activation status is displayed on tenant detail (`09_tenant_detail_willie_white.json`: "Online Portal Status: Active").
- **Gap:** Strata's in-Strata management-side view + 50 UX improvements (animations, gradients, glassmorphism) is **Strata-unique**.
- **Recommendation:** Connect the KPI grid to real metrics: 3,274 tenants, 50 properties, 1,563 work orders, average compliance score across vendor compliance matrix.

## 28. UtilitiesModule

- **AppFolio coverage:** **Partial.** AppFolio tracks utilities as recurring bill-pay entries — Georgia Power has a monthly recurring WO chain on 2070 AZALEA DRIVE Aug 2024 → Apr 2026 (per `03_work_orders_page1.json` observation), paid by check. AppFolio doesn't have a dedicated utilities data type.
- **Gap:** Strata's utility-type enum (Water/Electric/Gas/Internet/Trash) + per-utility account number + provider + monthly cost + billing date is **Strata-unique** as a first-class data model.
- **Recommendation:** Seed utilities fixture with: Georgia Power for 2070 Azalea, Duke Energy for 128 Buena Vista (property 18 has a Duke Energy water heater plan per attachment list), Massey Pest for 128 Buena Vista (also in attachments). These are real vendor-utility relationships.

## 29. VehiclesPanel

- **AppFolio coverage:** **Covered.** Tenant detail (`09_tenant_detail_willie_white.json`) shows a "Vehicles" section with Edit button — the tenant has none currently added. Property-level vehicle tracking not seen.
- **AppFolio fields on vehicles section:** edit-only stub — no fields visible until populated, implied schema: year/make/model/license/color/spot.
- **Gap:** Strata's schema matches AppFolio. Parity.
- **Recommendation:** Seed with 2-3 vehicles on a few sample tenants.

## 30. VendorsModule

- **AppFolio coverage:** **Covered (with AppFolio exceeding Strata).** AppFolio `/vendors` (3,040 vendors) and `/vendors/{id}`.
- **AppFolio fields on vendor detail** (`10_vendor_detail_2story_roofing.json`): name + contact name (Danny Bourdua), website, vendor_type, phone (with Zelle-linked flag), emails (plural array), addresses (plural), vendor_portal_activated, federal_tax {taxpayer_name, w9_requested, tax_id_masked, tax_form_account_number, send_1099}, accounting_information {check_consolidation, check_stub_breakdown, hold_payments, email_echeck_receipt, payment_terms, default_check_memo, default_gl_account, work_order_adjustment_percent, discount, online_payables_enabled, payment_type, bank_routing_number, bank_account_number, savings_account}, compliance {workers_comp_expiration, general_liability_expiration, epa_certification_expiration, auto_insurance_expiration, state_license_expiration, contract_expiration}, survey_responses, notes, texts, emails, audit_log, attachments — **~45 fields across 10 blocks**.
- **Strata fields:** name, vendorType, email, phone, contactName, coiStatus, coiExpiry, w9OnFile, insuranceCarrier, rating, totalJobs, balance — **12 fields**.
- **Gap:** Strata missing: **federal_tax block** (tax ID, 1099 flag, taxpayer name distinct from vendor name), **accounting_information block** (check consolidation, payment terms, default GL), **6-expiration compliance block** (Strata has 1 coiExpiry vs AppFolio's 6 distinct dates: Workers' Comp, General Liability, EPA, Auto Insurance, State License, Contract), **Zelle-linked phone + bypass-1099 flag** (real exception from Lisa Zohoury's note), **work_order_adjustment_percent**, **default_check_memo**, **survey_responses**.
- **Recommendation:** This is the **second-biggest schema gap after ResidentsModule**. Expand Strata `vendor` to match AppFolio's 10-block structure. Seed with 2-STORY TECHNICAL ROOFING's real values (Danny Bourdua, 3122 OLD CORNELIA HWY GAINESVILLE GA 30507, General Liability 2026-07-11, Zelle, no 1099) as the canonical example.

## 31. VisualizationModule

- **AppFolio coverage:** **Strata-unique.** AppFolio has no entity-relationship graph view.
- **Gap:** None.
- **Recommendation:** N/A.

## 32. WorkOrdersModule

- **AppFolio coverage:** **Covered (redirect).** Per Strata inventory, WorkOrdersModule is an alias to MaintenanceModule's Work Orders tab. See section 14 gap analysis.
- **Gap:** Same as MaintenanceModule.
- **Recommendation:** Same as MaintenanceModule.

## 33. (Reserved for 33rd module if added)

The inventory returned 32 distinct module files plus `WorkOrdersModule` as an alias. Section 33 is reserved if additional modules are added to `modules/` directory.

---

## Summary scorecard

| Category | Count | Modules |
|---|---|---|
| **Covered** — AppFolio has direct 1:1 equivalent | 7 | Accounting, Leasing, Maintenance, OwnersModule, Profiles, Properties, PropertyOverview, Residents, Reporting, Vehicles, Vendors, WorkOrders |
| **Partial** — AppFolio has some pieces, missing key features | 9 | Audit (gated), Calendar, Communication, ComplianceEngine, Forecast, Insurance, Projects, PropertyTimeline, Sentiment, Utilities |
| **Strata-unique** — AppFolio has no equivalent | 8 | CivilEngineering, CorporateReview, Design, Incident, Legal, ProfileSpaces, StatusCheck, Visualization |
| **Strata-extending** — Strata adds notable features on top | 4 | ManagerHome (6-widget layout), Reporting (Intake + Custom Query + Rollups), TenantPortal (management-side view), ComplianceEngine (6-view dashboard) |

## Top 5 highest-leverage schema extensions (ranked)

1. **ResidentsModule** — adopt Occupancy 1:N Tenants structure. Every downstream module (Maintenance, Accounting, Communication) depends on getting this right.
2. **VendorsModule** — expand to AppFolio's 45-field / 10-block schema (federal tax, accounting, 6-expiration compliance). Real vendor 2716 is the canonical seed.
3. **PropertiesModule** — add purchase history, late-fee policy, maintenance settings (limit, warranty, pre-auth-entry), non-revenue-unit metadata, fixed assets inline. Property 18 is the canonical seed.
4. **MaintenanceModule** — add resident_availability, actions_log, labor, PO/invoice linkage, withheld_from_owner. WO 19511-1 is the canonical seed.
5. **AccountingModule** — add recurring-charge schedule metadata (start/end/next/previous) and vendor payment-method enum with send_1099 exception. Willie White ledger + 2-STORY TECHNICAL ROOFING are canonical seeds.

## Top 3 Strata-unique differentiators for the deck

1. **Compliance in a single pane** (AppFolio fragments compliance across Insurance Enforcement report + HUD Waitlist report + Tax Credit Compliance report + vendor COI check + audit log — Strata rolls all into ComplianceEngine with 6 views + Predictions).
2. **Core-tier audit center + custom reporting** (AppFolio Core-tier has `apm_audit_center: DISABLED`, `apm_reporting_api: DISABLED`, `apm_workflow_management: DISABLED` — Strata includes all of these out of the box).
3. **AI Civil Engineering + Design Studio** (AppFolio has neither; zero equivalent in its ~200-report catalog).

## Evidence files

All findings cite these captured files under `AppFolio_Screenshots/data/`:

- `01_properties_page1.json` — property list
- `02_property_detail_128_buena_vista.json` — property 18 canonical detail
- `03_work_orders_page1.json` — 1,563 WO volume + AHA Section-8 batch
- `04_tenants_page1.json` — tenant list scale
- `05_vendors_page1.json` — vendor list scale + trade categories
- `06_leases.json` — pending-countersign queue
- `07_insurance_compliance.json` — Insurance Enforcement schema + feature-flag matrix
- `08_work_order_detail_19511.json` — WO detail canonical
- `09_tenant_detail_willie_white.json` — tenant detail canonical (26 sub-sections)
- `10_vendor_detail_2story_roofing.json` — vendor detail canonical (10 blocks, 45 fields)

🧪
