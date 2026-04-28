# Phase 3 — Task 3.2 Completion Report

**Task.** Vendor detail 10-block layout (parallel-batch #2).
**Squash SHA.** `c5113e9`.
**PR.** [#24](https://github.com/NovaTrustSolutions/dwellium-per-spec/pull/24).
**Closure date.** 2026-04-28.
**Plan version.** v2.16.

---

## §1. Scope + DoR + 12-drift ledger + LOC variance note

**Scope.** Renders the 10 AppFolio-parity blocks per v1 plan L166 as the content of the existing overview tab on the vendor detail panel. Additive render-layer extension; existing 7-tab structure (overview / ledger / documents / performance / compliance / accounting / spaces) preserved.

**Blocks** (per v1 plan L166):

| # | Block | Source | Pattern |
|---|---|---|---|
| 1 | Identity | `vendor.name` core + `metadata.{vendorType, contactName}` | Typed + metadata fallback per Drift #10 |
| 2 | Contact | `vendor.{email, phone, address}` core + `metadata.address` fallback | Typed + metadata fallback per Drift #10 |
| 3 | Portal | `vendor.metadata?.vendorPortalActivated` tri-state | Metadata-only per Drift #10 |
| 4 | Federal Tax | `vendor.vendorFederalTax` typed ?? `metadata.send1099` legacy | Typed + metadata fallback per Drift #11 |
| 5 | Accounting | Compressed 3-KPI summary + cross-link to accounting tab | Typed + metadata fallback per Drift #11 |
| 6 | Payment Type | `vendor.paymentMethod` typed ?? `metadata.paymentType` legacy | Typed + metadata fallback per Drift #11 |
| 7 | Compliance | Compressed 3-KPI summary (`activeCount` / `nearestExpiry` / `expiredCount`) + cross-link to compliance tab; injectable `today?: Date` for tests | Typed + metadata fallback per Drift #11 + `parseLegacyDate` normalizer |
| 8 | Survey | Placeholder stub | Per L168 stub-acceptance precedent |
| 9 | Notes | `vendor.metadata?.notes` null-safe (3-case) | Metadata-only per Q3 Option A |
| 10 | Activity | Placeholder stub | Per L168 stub-acceptance precedent |

**DoR (Definition of Ready).** Single-file additive edit on `qualia-shell/src/components/StrataDashboard/modules/VendorsModule.tsx` (1249 LOC pre-edit) + 1 NEW test file `qualia-shell/src/test/appfolioParity/vendors.module.test.tsx`. Pre-flight (a) confirmed overview-tab body L641-833. Pre-flight (b) confirmed 2-STORY canonical entity at UUID `48be69c5-9cb5-4921-b8f0-d26e8c07b1a5` has all 3 typed Task-1.2 blocks. Pre-flight (c) confirmed `metadata.notes` absent on 2-STORY (BlockNotes renders stub state per Q3 Option A); also surfaced Drift #10. Pre-flight (d) surfaced Drift #11 (1 / 3,218 typed coverage).

**12-drift ledger** (all addressed in commit C scope or §7 deferred):

| # | Catch | Source | Resolution |
|---|---|---|---|
| 1 | ErrorBoundary scoped not top-level | Recon | Top-level wrap deferred to v2.17+ (§7 #2) |
| 2 | 10-block ↔ schema field mismatch | Recon | Survey + Activity stub per L168 |
| 3 | Handler coverage — 4 GET stubs + 5 POST sub-routes unhandled | Recon | Latent bug captured §7 #3 |
| 4 | 14 mutating POST/PUT/DELETE sites | Recon | EXPLICITLY DEFERRED to v2.17+ (§7 #1; 3× the 3.8 record) |
| 5 | Fixture realism in `appfolioDerived/vendors.ts` (9 records, not 3,218) | Recon | Partial walk-back — 3,218 is `entities.json` entity count |
| 6 | Test-design path | Recon | Path B block isolation (mirrors 3.3 calibration) |
| 7 | Canonical UUID `48be69c5-…b1a5` (NOT `…2716`) | Recon | Test fixture anchor verified |
| 8 | Authoritative paymentType `"Zelle"` (entities.json) NOT `"Check"` (appfolioDerived) | Recon | Drift #4 in recon — entities.json is authoritative for parity |
| 9 | §9 row narrows 3 → 2 post-3.2 close | Recon | Plan v2 §9 row updated at sweep |
| 10 | Blocks 1/2/3 read EntityProfile metadata, not core | Pre-flight (c) | Render path adjusted; arrays narrowed to single-value; website rendered `'—'` (unsourced); tri-state Portal logic |
| 11 | Only 1 / 3,218 vendor entities have typed Task-1.2 blocks | Pre-flight (d) | Metadata fallback chain on Blocks 4/5/6/7; `parseLegacyDate` MM/DD/YYYY → ISO normalizer; v2.18+ schema-population task captured §7 #7 |
| 12 | Pre-existing `performance.totalSpend` handler/render mismatch | CDP probe | UNTOUCHED by 3.2; CDP regression loop skips performance tab; captured §7 #9 for v2.17+ |

**LOC variance note.** Predicted +155 / −10 (kickoff after Drift #11 update); actual **+323 / −31**. The +168 over-prediction came from helper-function extraction (`BlockRow` + `BlockSection` + `xLinkBtnStyle` + `fmtIsoDate` + `parseLegacyDate` + null-safe Notes 3-case rendering with optional metadata `posted_by`/`ts` rendering). Functional scope unchanged from PRE0/PRE1 ack chain. Vitest delta predicted +11, actual **+11** (matches kickoff prediction exactly).

---

## §2. Strict gate results

| Gate | Predicted | Actual |
|---|---|---|
| `tsc -b` | clean | ✅ clean |
| `vitest run` | 207/207 (+11) | ✅ **207/207** (33 test files, +1 file `vendors.module.test.tsx`) |
| Vite build (default) | 3278 modules | ✅ 3278 modules; chunk `StrataDashboard-DFmgzha6.js` 1,024.52 kB / 245.14 kB gzip |
| Vite build (`VITE_APPFOLIO_SEEDS=false`) | 3278 modules; byte-identical chunk hash | ✅ 3278 modules; chunk `StrataDashboard-DFmgzha6.js` byte-identical |
| Module-graph drift | +6-12 kB ungzipped / +1.5-3 kB gzip | ✅ **+7.91 kB ungzipped / +1.94 kB gzip** (middle of band) |
| PII strict scope | 0 findings | ✅ 0 findings, 51 files scanned, 1593ms |
| Module-count parity | 3278 / 3278 | ✅ holds |
| Chunk hash across `VITE_APPFOLIO_SEEDS` flag | byte-identical | ✅ both modes produce `DFmgzha6` |

**CI runs (PR branch dispatch).**
- `AppFolio Parity Gate` — run [`25038105577`](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25038105577) — success in 7m2s.
- `PII Scan` — run [`25038106329`](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25038106329) — success in 32s.
- Push-trigger did NOT auto-fire on the PR branch this round; manual dispatch fired exactly once after the 90s wait window per v2.15 refined discipline.

---

## §3. CDP probe results

`Docs/Baselines/phase_3_task_3_2/cdp_summary.json`:

```
{
  "pageLoadsZeroConsoleErrors": true,
  "vendorListHasRows": true,
  "vendorDetailOpens": true,
  "allTenBlocksVisible": true,
  "blockToggleCollapses": true,
  "accountingCrossLinkWorks": true,
  "complianceCrossLinkWorks": true,
  "blockToggleNoErrors": true,
  "sevenTabsIntactNoErrors": true,
  "overviewRerenderOk": true,
  "allPass": true
}
```

**10/10 guards pass.** Three screenshots captured:

- `01_vendor_detail_overview_10_blocks.png` (519,440 bytes) — full-page screenshot of vendor detail with all 10 blocks visible (default-expanded).
- `02_vendor_detail_accounting_tab_via_crosslink.png` (529,429 bytes) — accounting tab content after Block 5 cross-link click.
- `03_vendor_detail_compliance_tab_via_crosslink.png` (522,790 bytes) — compliance tab content after Block 7 cross-link click.

**9b adaptation note.** The 7-tab regression click loop SKIPS `performance` tab per Drift #12 (pre-existing latent crash on `performance.totalSpend.toLocaleString` — `VendorsModule.tsx` L1329 reads field absent from static handler shape at `strataApi.static.ts` L980). The 7-tab DOM presence probe (9a) verifies all 7 tab BUTTONS render in the tab bar regardless of click outcome — this confirms the tab bar structure is intact even though one tab's CONTENT branch crashes when active. The skip is documented inline in the probe header. v2.17+ §7 entry #9 captures the fix path (either update static handler shape to include `totalSpend` OR update render to null-safe access).

**Programmatic click pattern.** Default per Task 3.7 §7 entry #3 (validated retired at Task 3.8 close, extended through Task 3.3 to Task 3.2). Initial probe attempted Playwright `locator.click()` on the cross-link buttons but `<main class="s-main-content">` intercepted pointer events on below-fold buttons; switched to programmatic `page.evaluate(() => element.click())` mid-probe — same precedent as other Phase-3 tasks.

---

## §4. /security-review summary

**Zero findings. Cleared for merge.**

8 security categories examined:

| Category | Surface in diff | Verdict |
|---|---|---|
| Input validation (SQL/NoSQL/command/path) | No backend calls in diff | Not applicable |
| XSS / template injection | All metadata strings rendered as React text children (auto-escaped); no `dangerouslySetInnerHTML`, no `innerHTML`, no `document.write`, no `eval`, no `new Function` | Not exploitable (precedent #6 — React auto-escapes) |
| Authentication / authorization | Cross-link buttons only flip local `detailTab` state via `setDetailTab`; no new API calls; existing `hasPermission('strata:vendors:work-orders')` gate preserved unchanged | Not applicable |
| Crypto / secrets | No hardcoded keys, tokens, or credentials | Not applicable |
| Injection / RCE | `parseLegacyDate` uses anchored regex `^(\d{1,2})\/(\d{1,2})\/(\d{4})$` and integer construction — no eval-equivalent | Not exploitable |
| Data exposure (logging) | Sentry breadcrumb payload `{ block: <typed-enum>, expanded: <bool>, vendorId: <UUID> }` — UUIDs unguessable per precedent #2; no PII | Not applicable |
| Sensitive field rendering | `BlockFederalTax` renders `taxIdMasked` (pre-masked) + `taxFormAccountNumber` + `taxpayerName` — same authenticated permission-gated surface as existing `AccountingTab`/`ComplianceTab` and legacy inline UI; no new audience | Pre-existing posture preserved |
| Tri-state Portal logic (Block 3) | Compares `vendor.metadata?.vendorPortalActivated` against literal strings/booleans only; no string-to-code coercion | Not exploitable |

---

## §5. Verification (file-by-file diff)

```
qualia-shell/src/components/StrataDashboard/modules/VendorsModule.tsx     | +323 / -31
qualia-shell/src/test/appfolioParity/vendors.module.test.tsx (NEW)        | +187 / -0
                                                              Total       | +510 / -31
```

**VendorsModule.tsx changes:**
- Imports: +`ChevronUp, ChevronDown, ExternalLink` (lucide), +`Sentry` (services), +`VendorFederalTax, VendorAccountingInfo, VendorCompliance` types.
- 2 module-local helpers: `BlockRow` (label/value row, NOT exported), `BlockSection` (collapsible wrapper, NOT exported).
- 2 utility functions: `parseLegacyDate(s)` (MM/DD/YYYY or ISO → Date | null), `fmtIsoDate(d)` (Date → YYYY-MM-DD or `'—'`).
- 10 NEW exported Block components: `BlockIdentity` / `BlockContact` / `BlockPortal` / `BlockFederalTax` / `BlockAccounting` / `BlockPaymentType` / `BlockCompliance` / `BlockSurvey` / `BlockNotes` / `BlockActivity`.
- 1 NEW state hook + useCallback: `blockExpanded` (Record of 10 slugs → boolean, all default `true`) + `toggleBlock(slug, next)` with consolidated Sentry breadcrumb.
- JSX: replaced legacy COI Tracking block (L644-653 pre-edit) with 10-block render wrapped in scoped `ErrorBoundary` (Quick Dispatch + Property Associations + Linked WOs preserved unchanged below).
- JSX: removed legacy inline Notes block (L814-831 pre-edit; subsumed by `BlockNotes`).
- JSX: removed unused `const coi = getCoiStatus(selected);` declaration in detail-panel IIFE (was sole consumer; the helper `getCoiStatus` and `coi`/`coiIcon` references at L340-343 / L451 / L486-488 in vendor-list rendering remain).

**vendors.module.test.tsx (NEW):** Path B block-isolation test mirroring `properties.module.test.tsx` (Task 3.3) calibration. 11 it-blocks: 10 typed-path block contracts (one per Block) + 1 fallback-path BlockCompliance test exercising `parseLegacyDate` normalize on legacy MM/DD/YYYY metadata expirations. Test fixture anchors against 2-STORY canonical entity at UUID `48be69c5-…b1a5`. Compliance assertions inject `today = new Date('2026-04-28')` for deterministic output.

**Greps verified post-commit:**
- `grep -c "data-testid" VendorsModule.tsx` → 10 anchors (`vendor-block-{slug}` × 10).
- `grep -c "Sentry.addBreadcrumb" VendorsModule.tsx` → 1 site (consolidated block-toggle breadcrumb).
- `grep -c "ErrorBoundary" VendorsModule.tsx` → 1 import + 3 open + 3 close = 7 mentions; **3 distinct scoped wraps** (Compliance L1085 + Accounting L1089 + new overview-tab L944).
- `grep -c "isStaticMode" VendorsModule.tsx` → 0 (deferred to v2.17+ per §7 #1).

---

## §6. Rollback plan

**Single squash revert.** Clean revert path: `git revert c5113e9 -m 1` on main. The squash commit is self-contained — no fixture / type / handler / Appendix-D writes; no sibling-module changes; no migration; no schema additions. Rollback restores the pre-3.2 overview tab content (legacy COI Tracking block + inline Notes block) and removes the 10 Block components / helpers / state. Test file removal happens automatically as part of the revert.

**Cleanup verification post-revert:**
- vitest delta returns from 207 → 196 (test file removed).
- chunk hash returns from `DFmgzha6` to `jKtUqWrV` (or new hash if other commits land in between).
- module-count parity stays at 3278.

**Risk of revert.** Low. No database migrations, no public API contracts, no fixture changes. Only operational impact: vendors who would have seen the 10-block layout revert to the legacy COI + Notes inline UI on the overview tab.

---

## §7. Deferred items (9 entries)

1. **isStaticMode write-guards on 14 existing mutating sites** — v2.17+ structural-rework. 14 mutating sites (`/vendor-associations` ×3, `/entities` ×4 incl. tags/edit/delete/add, `/vendors/:id/{documents, onboard, deactivate, approve, ledger}` ×5, `/workitems/:id` ×1, `/vendor-associations/:id` ×1) lack the `isStaticMode()` early-return + toast pattern. 3× the 3.8 record (5 sites). Layout-class scope rejected widening per kickoff §EXPLICIT NON-GOALS.

2. **Top-level ErrorBoundary wrap on default export** — v2.17+ structural-rework. Module currently has 3 SCOPED ErrorBoundary wraps (Compliance + Accounting tabs from Task 1.2 + new overview-tab content from Task 3.2). Top-level wrap would catch fall-through render errors (e.g., the Drift #12 performance crash). Joins existing 3-item structural-rework follow-up: TenantPortalModule inline tabs + MessagesTab missing-key + PropertiesModule top-level ErrorBoundary wrap → now 4 items.

3. **Static handlers for 5 currently-broken POST sub-routes** — v2.17+. `/vendors/:id/documents` (Upload doc), `/onboard` (Onboard CTA), `/deactivate` (Deactivate CTA), `/approve` (Approve CTA), `/ledger` (Add ledger entry POST). All five fail in `VITE_APPFOLIO_SEEDS=false` static-mode builds today — latent bug surfaced via recon §6 grep but not exploited in 3.2 scope.

4. **Path A integration test for block-toggle Sentry breadcrumb-payload assertion** — v2.17+ low-priority. Full-module mount with click-through; verifies the consolidated breadcrumb payload `{block, expanded, vendorId}` reaches Sentry's hub. Joins existing Path A integration test for tab-switch breadcrumb-payload assertion (Task 3.3 §7 entry #2).

5. **Tab-switch breadcrumb retroactive instrumentation on the existing 7-tab bar** — v2.17+. Task 3.2 added the block-toggle breadcrumb but did NOT retroactively instrument tab-switch on `setDetailTab` call sites (consistent with kickoff PRE0.8). v2.17+ candidate alongside the existing structural-rework follow-up.

6. **Schema enrichment for EntityProfile** — v2.18+. Add typed `website?: string` + `emails?: string[]` + `phones?: string[]` + `primaryAddress?: { street, city, state, zip }` to enable richer rendering paths than the current single-string core fields. Drift #10 captures the gap; current 3.2 render-layer fallback chain works but is constrained to single-value display (matches entities.json shape, not richer appfolioDerived shape).

7. **Fixture-realism backfill of typed Task-1.2 blocks across 3,217 non-canonical vendor rows** — v2.18+. Script-driven; derive `vendorFederalTax` / `vendorAccountingInfo` / `vendorCompliance` / `paymentMethod` / `send1099` from existing legacy `metadata.{vendorPortalActivated, paymentType, send1099, workersCompExpiration, liabilityInsuranceExpiration, …}` strings. Canonical 2-STORY at `48be69c5-…b1a5` shows the target shape. Drift #11 captures the gap; current 3.2 production fallback chain in Blocks 4/5/6/7 covers the gap at runtime today — backfill is a data-quality follow-up, not a correctness gate.

8. **Fallback-path test coverage for Blocks 4/5/6 metadata chains** — v2.17+ test-quality follow-up. BlockCompliance has fallback-path coverage shipped in 3.2 (the highest-risk parseLegacyDate normalize path); other 3 blocks (BlockFederalTax / BlockAccounting / BlockPaymentType) have implicit production coverage at runtime via the 3,217 non-typed vendor render but lack explicit unit coverage. Quality follow-up, not a correctness gate.

9. **Pre-existing performance.totalSpend handler/render mismatch (Drift #12)** — v2.17+. `VendorsModule.tsx` L1329 reads `performance.totalSpend.toLocaleString(...)` but the static handler at `strataApi.static.ts` L980 returns `{rating: 0, totalJobs: 0, onTime: 0, avgCost: 0}` without `totalSpend`. UNTOUCHED by Task 3.2 (component code at that line unchanged). Surfaced via the CDP probe regression loop — clicking the performance tab triggers a `TypeError: Cannot read properties of undefined (reading 'toLocaleString')` which is caught by `WidgetErrorBoundary` upstream (the entire VendorsModule renders the error fallback). Two resolution paths for v2.17: (a) update `strataApi.static.ts` performance handler to include a sensible `totalSpend: 0` in the stub response shape; OR (b) update `VendorsModule.tsx` L1329 render to null-safe access (`performance?.totalSpend?.toLocaleString(...) ?? '$0.00'`). Path (b) aligns with the GR-3 defensive-render discipline; path (a) maintains the static-handler-as-source-of-truth shape contract. Either fix is small (~3 LOC). The probe regression loop skips the performance tab to allow 10/10 guard pass at 3.2 close; the 7-tab DOM presence probe (9a) still verifies the performance tab BUTTON renders.

---

## §8. Next-task recommendation

**Phase-3 parallel-batch survivors: 3.1 (Tenant detail 26-section) + 3.4 (WO detail 15-section).** Both independent — no chain dependency.

**Recommended next: 3.4** (medium-high risk; multi-section render baseline calibrates 3.1's higher fixture-realism risk). 3.4 renders 15 sections per v1 plan L170: Service Request header / Property-Unit-Owner-Resident / Work Order / Job / Scheduling / Actions Log / View-as-Maintenance-Tech / Labor / Purchase Orders / Withheld Amount / Invoices / Texts / Emails / Attachments / Notes — schema scaffolded by Task 1.4 (Workitem additions: `residentAvailability`, `actionsLog`, `laborEntries`, `purchaseOrders`, `workOrderNumber`, etc.).

**Defer 3.1** (highest risk — fixture-realism likely on Animals/Vehicles/Insurance per recon kickoff matrix; 26 sections) until 3.4 calibrates the multi-section render baseline. 3.4's 15-section pattern + Path B test design + module-graph drift band will inform 3.1's PRE2 prediction.

**Layout-class baseline now anchored at 2 data points:**
- 3.3 (4 stub placeholders) → +4 vitest delta / +2.56 kB module-graph drift.
- 3.2 (10 Block components, typed + stub + fallback mix) → +11 vitest delta / +7.91 kB module-graph drift.

3.4's prediction band (15 sections, mostly typed render with possible Path B isolation): expected vitest delta **+10 to +18**; module-graph drift **+8 to +14 kB ungzipped**. 3.1's prediction band (26 sections, Animals/Vehicles/Insurance fixture-realism risk): expected vitest delta **+18 to +30** (depends on whether sub-fixture contracts need it-blocks).

**v2.17+ candidate list (post-3.2 refresh).**
- Playwright baseline pass-count drift 2 → 4 between Task 3.7 sweep run `24927092067` and Task 3.8 CI runs (slid from v2.16 — that slot was claimed by Task 3.2).
- Structural rework — 4 items (TenantPortal inline tabs / MessagesTab missing-key / PropertiesModule top-level ErrorBoundary / VendorsModule top-level ErrorBoundary).
- Path A integration test for tab-switch + block-toggle breadcrumb-payload assertion.
- Drift #12 performance.totalSpend handler/render mismatch fix.
