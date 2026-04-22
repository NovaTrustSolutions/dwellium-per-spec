# AppFolio Real-Data Capture — zohouryproperties.appfolio.com

**Captured:** 2026-04-19 by Claude via Chrome MCP (DOM extraction, not scraping)
**Purpose:** Seed the Dwellium property-management shell build with realistic data models and workflow fixtures drawn from a live, in-production AppFolio tenant.

## Portfolio facts (ground truth)

- **ZP Group** (vhost: `zohouryproperties`), AppFolio **Core tier** (all paid add-ons DISABLED per feature-flag blob decoded from page headers)
- **50 properties**, SFR-heavy, Zohoury-family trust ownership structure
- **3,274 tenants** (`/occupancies`), **3,040 vendors** (`/vendors`), **1,563 work orders** (Open filter)
- Primary multi-unit properties: Woodland Parc Townhomes (Smyrna GA), Riverwood Club Apartments (Atlanta GA 30331), Summerfield Apartments (Orlando FL), Huntington Lane Apartments (Marietta GA), Washington Gardens (Atlanta GA 30349)
- Active Section 8 / AHA (Atlanta Housing Authority) inspection batch observed at Riverwood Club: 9 inspections scheduled 04/27/2026–04/30/2026

## Files in `data/`

| # | File | What it contains |
|---|------|------------------|
| 01 | `01_properties_page1.json` | `/properties` listing, 50 total, page-1 sample + address pattern |
| 02 | `02_property_detail_128_buena_vista.json` | `/properties/18` full detail — purchase history, fixed assets, attachments, late-fee policy, maintenance limits |
| 03 | `03_work_orders_page1.json` | `/maintenance/service_requests/work_orders` listing — 1,563 open WOs, statuses, assignees, saved filters, 13 newest-first samples including Section 8 AHA batch |
| 04 | `04_tenants_page1.json` | `/occupancies` listing — 3,274 total, mostly Past status, 13 sample rows across 5 properties |
| 05 | `05_vendors_page1.json` | `/vendors` listing — 3,040 total, 39 trade categories, mixed-purpose observation (restaurants/retail are AP entities not maintenance vendors) |
| 06 | `06_leases.json` | `/lease_documents` — Ready to Countersign tab, 2 pending (Jamel D. Brown → Riverwood H12, Vanessa V. Blunt → Riverwood D14) |
| 07 | `07_insurance_compliance.json` | `/buffered_reports/insurance_enforcement` — Insurance Enforcement report schema + full compliance feature-flag matrix (renters insurance, Section 8, tax credit) |
| 08 | `08_work_order_detail_19511.json` | `/maintenance/service_requests/19511/work_orders/19523` — full WO detail for "Fire alarm needs replaced" at Woodland Parc 2789-1-4, including actions log, scheduling, resident availability, 15 sub-sections |
| 09 | `09_tenant_detail_willie_white.json` | `/occupancies/2800/selected_tenant/5538` — Willie White (Other Occupant) at Riverwood B03, $1,595/mo, primary LaSonta M. Westbrook, 49 community emails from Ashley Johnson |
| 10 | `10_vendor_detail_2story_roofing.json` | `/vendors/2716` — 2-STORY TECHNICAL ROOFING LLC (Danny Bourdua), W-9/1099/tax-ID, 6-expiration compliance block, payment/check-consolidation settings, 2 Lisa Zohoury notes |

## Key URL pattern map (discovered, not conventional)

| Module | URL |
|--------|-----|
| Properties | `/properties`, `/properties/{id}` |
| Tenants | `/occupancies`, `/occupancies/{occ_id}/selected_tenant/{tenant_id}` |
| Vendors | `/vendors`, `/vendors/{id}` |
| Owners | `/owners` |
| Work Orders | `/maintenance/service_requests/work_orders`, `/maintenance/service_requests/{sr_id}/work_orders/{wo_id}` |
| Recurring WOs | `/maintenance/recurring_work_orders` |
| Unit Turns | `/maintenance/unit_turns` |
| Purchase Orders | `/maintenance/purchase_orders` |
| Inventory | `/maintenance/inventory_management/inventories` |
| Leases | `/lease_documents`, `/lease_documents/{id}` |
| Vacancies | `/vacancies` |
| Rental Applications | `/rental_applications` |
| Renewals | `/lease_renewals` |
| Guest Cards | `/guest_cards` |
| Reports (index) | `/reports` |
| Buffered reports | `/buffered_reports/{report_slug}` |
| Accounting receivables | `/accounting/receivable_payments` |
| Accounting payables | `/accounting/payable_invoices` |
| Bank accounts | `/accounting/bank_accounts` |
| Journal entries | `/accounting/journal_entries` |
| GL accounts | `/accounting/gl_accounts` |

## Noteworthy real-world patterns (direct inputs to Dwellium design)

1. **Tier encoding at page-level.** Every page embeds a base64-encoded feature-flag blob in the `<main>` region. The decoded JSON (see `08` and `10`) confirms the portfolio is on the **Core** tier with ~42 premium entitlements marked `DISABLED` (no Leasing CRM, no revenue management, no workflow management, no affordable-housing add-on, no audit center, no realm-x performers of any variant). This directly validates Dwellium's ICP: **Core-tier SFR operators who can't afford premium AppFolio**.

2. **FolioGuard Smart Ensure upsell** appears on every tenant detail page. AppFolio aggressively pushes insurance-enforcement automation to Core-tier customers → Dwellium should ship this baseline in the Compliance module.

3. **Occupancy ≠ Tenant.** One Occupancy has N Tenants with distinct Type (Primary / Other Occupant) + Status (Current / Past). See `09` — Willie White is an Other Occupant under LaSonta M. Westbrook's primary Occupancy.

4. **Section 8 / HCV / LIHTC stack is enabled in reports** (`AffordableHousingHapVoucherSummary`, `AffordableHousingHudWaitlist`, `TaxCreditCompliance`, `IncomeCertifications`) — consistent with the 9 AHA inspections at Riverwood Club. Astra's Section 8 ledger must separate HAP portion + Tenant portion + Voucher status + Income recert date.

5. **Vendor Compliance has 6 distinct expiration dates**: Workers' Comp, General Liability, EPA, Auto Insurance, State License, Contract. Dwellium's Vendor Compliance widget should roll up "next expiring cert" with per-vendor drilldown.

6. **Zelle bypass for 1099** is a real AP exception (see Lisa Zohoury's 2024-01-17 note on vendor 2716). Dwellium's AP module must support this.

7. **System-generated SMS dispatch notifications** use `appfol.io` shortlinks + "Reply STOP to unsubscribe" footer. Canonical template for Dwellium C-1 dispatch notifications.

8. **Georgia Power recurring WO** chain for 2070 AZALEA DRIVE (monthly auto-generation Aug 2024 → current) is a real-world exemplar for GAP-BILL-01 (Bill Pay / Invoice Pipeline).

## Capture method

- Navigated via Chrome MCP (`mcp__Claude_in_Chrome__*` tools) using Ilya's active AppFolio session cookie
- Extracted data via `get_page_text` + `javascript_tool` DOM queries, NOT PNG screenshots (pivoted away from PNG because Chrome MCP's `save_to_disk` writes to user's real ~/Downloads outside the sandbox)
- No data modifications performed; every `navigate` was to a GET route, no POST/DELETE actions taken
- All 10 JSON files are structured observations only — no live credentials, SSNs, bank accounts, or payment info captured (tax IDs are masked XX-XXX4232 as shown in the AppFolio UI itself)

🧪
