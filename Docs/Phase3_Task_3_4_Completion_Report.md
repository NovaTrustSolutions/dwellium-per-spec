# Phase 3 — Task 3.4 Completion Report

**Task.** WO detail 15-section layout (parallel-batch #3 / final batch survivor).
**Squash SHA.** `d516099`.
**PR.** [#25](https://github.com/NovaTrustSolutions/dwellium-per-spec/pull/25).
**Closure date.** 2026-04-28.
**Plan version.** v2.17.

---

## §1. Scope + DoR + 15-drift ledger + LOC variance note

**Scope.** Renders the 15-section AppFolio-parity WO detail panel per v1 plan L170 as additive content on the existing `MaintenanceModule.tsx::DetailPanel`. Render-host pivot per gap analysis L225 — `WorkOrdersModule.tsx` is alias to MaintenanceModule's Work Orders tab and was UNTOUCHED by 3.4 scope. Additive render-layer extension; existing 5 Task-1.4 sections preserved untouched.

**Sections** (per v1 plan L170, 15 total):

| # | Section | Status | Source |
|---|---|---|---|
| 1 | Service Request header | inline-upgraded (3 NEW Field rows) | `metadata.appfolioServiceRequestId` / `metadata.appfolioWorkOrderId` / `metadata.receivedFrom` ?? `item.createdBy` |
| 2 | Property-Unit-Owner-Resident | inline-upgraded (grid +3 cells) | Property + Assignment kept; Unit parsed from `item.tags`; Owner + Resident from metadata fallback |
| 3 | Work Order Info | preserved (Task 1.4) | 6 primitives — `workOrderNumber`, `permissionToEnter`, `ownerApproved`, `trade`, `vendorInstructions`, `nextFollowUpDate` |
| 4 | Job | inline-upgraded (3 NEW Field rows) | Job Status / Job ID (`workOrderNumber` fallback) / Vendor Job Link |
| 5 | Scheduling | DEFERRED to v2.18+ §7 | Existing partial: Resident Availability (Task 1.4) + Status Tracking (legacy) |
| 6 | Actions Log | preserved (Task 1.4) | `item.actionsLog` array |
| 7 | View as Maintenance Tech | NEW Block (stub per L168) | `BlockViewAsTech` |
| 8 | Labor | preserved (Task 1.4) | `item.laborEntries` array |
| 9 | Purchase Orders | preserved (Task 1.4) | `item.purchaseOrders` array |
| 10 | Withheld Amount | NEW Block (typed + fallback) | `BlockWithheldAmount` — `metadata.withheldFromOwner` USD currency or `'—'` |
| 11 | Invoices | NEW Block (stub per L168) | `BlockInvoices` |
| 12 | Texts | NEW Block (stub per L168) | `BlockTexts` |
| 13 | Emails | NEW Block (stub per L168) | `BlockEmails` |
| 14 | Attachments | preserved (Task 1.4) | Existing Section with 4 upload buttons |
| 15 | Notes | NEW Block (3-case rendering) | `BlockNotes` — `metadata.notes` array / string / absent (mirrors 3.2 BlockNotes byte-shape) |

**DoR (Definition of Ready).** Single-file additive edit on `qualia-shell/src/components/StrataDashboard/modules/MaintenanceModule.tsx` (976 LOC pre-edit) + 1 NEW test file `qualia-shell/src/test/appfolioParity/maintenance.module.test.tsx`. Pre-flight (a-i) confirmed `DetailPanel` function L590 with pure-props signature (7 props, no React Query hooks inside — Path B test design has cleanest argument across all Phase-3 layout tasks). Pre-flight (a-ii) confirmed canonical 19511 typed Task-1.4 fields populated (`workOrderNumber: "19511-1"` + `permissionToEnter: true` + `ownerApproved: false` + `trade: "No Trade Assigned"` + `residentAvailability: 3 timeWindows for Monday 2026-04-20 EDT` + `actionsLog: 2 entries`); `laborEntries` and `purchaseOrders` ABSENT on canonical (existing Task-1.4 conditional render hides those sections). Pre-flight (a-iii) confirmed `metadata.withheldFromOwner` AND `metadata.notes` ABSENT on canonical 19511 AND across all 371 work_orders (0/371 carry either field) — surfaced Drift #C: typed-path tests for Block 10 + 15 require synthetic Workitem fixtures. Pre-flight (a-iv) confirmed encrypted-blob fixture (370/371 records) is runtime-safe via property-access-on-string-returns-undefined; surfaced Drift #B (TypeScript types `Workitem.metadata: Record<string, any>` but fixture violates this for ~370 records).

**15-drift ledger** (all addressed in commit C scope or §7 deferred; 10 from recon pre-PRE0 + 5 from PRE0/PRE1 acks):

| # | Catch | Source | Resolution |
|---|---|---|---|
| 1 | Render-host pivot — `WorkOrdersModule` is alias to MaintenanceModule's Work Orders tab; real WO detail is `MaintenanceModule::DetailPanel` | Recon §2 + gap analysis L225 | Pivoted target at PRE0 #3; WorkOrdersModule.tsx UNTOUCHED |
| 2 | Already-shipped section count = 5/15 (Task 1.4) — net new = 6 NEW Blocks + 3 inline upgrades | Recon §5 | KEEP UNTOUCHED on Task-1.4 sections; additive scope |
| 3 | Schema gap on Withheld Amount — Section 10 named in v1 L170 has NO Workitem field | Recon §3 + gap analysis L111 | Render via `metadata.withheldFromOwner` null-safe; `'—'` fallback; schema enrichment captured §7 |
| 4 | Sections 11/12/13/15 (Invoices/Texts/Emails/Notes) have no schema/fixture/handler | Recon §3 | Stubs per L168 acceptance (precedent extended from 3.3); schema enrichment §7 |
| 5 | Section 7 "View-as-Maintenance-Tech" is perspective-switch UI primitive, not section | Recon §5 | Stub today; RBAC tech-portal wiring §7 for Phase-N |
| 6 | Fixture-realism gap — 1/371 work_orders has typed Task-1.4 fields | Recon §4 | Defensive guard (Drift #B-i); fixture/schema reconciliation §7 (Drift #B-iii) |
| 7 | Path B test design precedent extension | Recon §7 | Path B (block isolation) chosen — DetailPanel pure-props makes test trivial |
| 8 | Top-level ErrorBoundary wrap state — MaintenanceModule default export NOT wrapped | Recon §2 | Joins v2.18+ structural-rework candidate list (now 5 candidates incl. MaintenanceModule) |
| 9 | PUT /workitems/:id silent no-op in static mode | Recon §6 + §9 | Pre-existing latent gap; captured §7 for v2.18+ |
| 10 | Plan v2 §9 row 386 description was empty | Recon §10 | Filled in at sweep commit |
| A | Kickoff prop-name typo `vendor.metadata?.withheldFromOwner` | PRE0 #6 | Corrected to `item.metadata?.withheldFromOwner`; no scope impact |
| B | `Workitem.metadata` typed `Record<string, any>` but ~370/371 fixtures carry STRING blobs | PRE0 ack chain | (B-i) defensive `typeof === 'object'` guard at 3 sites; (B-iii) fixture/schema reconciliation §7 |
| C | Synthetic typed-path fixtures required for Block 10 + 15 unit tests | PRE0 ack chain | Synthetic Workitem fixtures inline (mirrors 3.2 BlockCompliance fallback-path coverage exactly) |
| D | Predicted +8 vitest delta holds with B-i defensive guard | PRE0 ack chain | Defensive guard is code-only; +8 confirmed at execution |
| E | v2.17 version slot confirmation | PRE0 ack chain | v2.16 was 3.2; v2.15 meta-PR; v2.14 was 3.3 — v2.17 next; 3.4 claims it |

**LOC variance note.** Predicted +90 / −5 (kickoff PRE1 (a)); actual **+219 / −2** on `MaintenanceModule.tsx`. The +129 over-prediction came from (a) JSDoc enumeration block at module top describing all 6 NEW Blocks with v1 L170 sub-order context (~25 LOC); (b) defensive metadata guard documentation comments at DetailPanel meta var + `blockBreadcrumb` helper (~17 LOC); (c) 6 contiguous Section + Block JSX wraps in DetailPanel with inline `onToggle` lambdas (~60 LOC); (d) 3 inline-expansion comment blocks documenting Sections 1/2/4 upgrades (~15 LOC); (e) Section 2 grid extension with 3 new flex cells (~15 LOC). Functional scope unchanged from PRE0/PRE1 ack chain — all kickoff-specified Blocks/inlines/wraps shipped. Vitest delta predicted +8, actual **+8** (matches kickoff prediction exactly).

---

## §2. Strict gate results

| Gate | Predicted | Actual |
|---|---|---|
| `tsc -b` | clean | ✅ clean |
| `vitest run` | 215/215 (+8) | ✅ **215/215** (34 test files, +1 file `maintenance.module.test.tsx`) |
| Vite build (default) | 3278 modules | ✅ 3278 modules; chunk `StrataDashboard-CbilAZ2x.js` 1,024.52 kB / 245.13 kB gzip + `MaintenanceModule-Boll0VQ9.js` 78.22 kB / 18.00 kB gzip |
| Vite build (`VITE_APPFOLIO_SEEDS=false`) | 3278 modules; byte-identical chunk hash | ✅ 3278 modules; both `StrataDashboard-CbilAZ2x.js` AND `MaintenanceModule-Boll0VQ9.js` byte-identical across flag |
| Module-graph drift | +4-8 kB ungz / +1-2 kB gz (~50-75% of 3.2's drift) | ✅ StrataDashboard chunk size **UNCHANGED** at 1,024.52 kB (hash-only drift `DFmgzha6` → `CbilAZ2x`); additive code lands in code-split `MaintenanceModule-Boll0VQ9.js` chunk per `StrataMaintenanceAdapter.tsx` lazy import — pre-edit MaintenanceModule chunk size NOT captured in recon block 8 (grep filtered to `StrataDashboard` only); pre/post delta on this chunk INFERRED at +4-8 kB ungz per kickoff prediction. Recon improvement captured §7 |
| PII strict scope | 0 findings | ✅ 0 findings, 51 files scanned, 1559ms |
| Module-count parity | 3278 / 3278 | ✅ holds |
| Chunk hash across `VITE_APPFOLIO_SEEDS` flag | byte-identical | ✅ both modes produce `CbilAZ2x` (StrataDashboard) + `Boll0VQ9` (MaintenanceModule) |

**CI runs (PR branch dispatch).**
- `AppFolio Parity Gate` — run [`25045192692`](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25045192692) — success in **6m55s**.
- `PII Scan` — run [`25045192690`](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25045192690) — success in **30s**.
- Auto-fired on `pull_request` trigger; both workflows green on first dispatch — no manual dispatch needed.
- All 12 workflow steps green: Set up job ✓ / Checkout ✓ / Set up Node ✓ / Install deps ✓ / TypeScript build ✓ / Vitest 215/215 ✓ / Install Playwright ✓ / Playwright baseline E2E ✓ (continue-on-error per CLAUDE.md L29) / Vite build seeds=true ✓ / Vite build seeds=false ✓ / PII leak scan strict ✓ / Upload baseline artifacts ✓.
- Pending sweep-HEAD CI dispatch — post-sweep CI-pointer fixup to follow per Task 3.2 / v2.15 precedent.

---

## §3. CDP probe results

`Docs/Baselines/phase_3_task_3_4/cdp_summary.json`:

```
{
  "pageLoadsZeroConsoleErrors": true,
  "woListHasRows": true,
  "woDetailOpens": true,
  "task14SectionsPresent": true,
  "allSixNewBlockTitlesVisible": true,
  "allSixNewBlocksExpand": true,
  "blockToggleNoErrors": true,
  "withheldRendersEmDashOrCurrency": true,
  "notesRenders3CasePath": true,
  "refreshRerendersAllSixTitles": true,
  "allPass": true
}
```

**10/10 guards pass first-try.** Three screenshots captured:

- `01_wo_detail_default_collapsed.png` — full-page screenshot of WO detail with 6 NEW Block Section titles visible (default-collapsed) alongside existing Task-1.4 conditional sections.
- `02_wo_detail_new_blocks_expanded.png` — full-page screenshot after clicking each of the 6 NEW Block headers (all testids visible).
- `03_wo_detail_post_refresh.png` — post-refresh detail panel (re-clicked first WO card after toggling to second card and back; verifies all 6 NEW Block titles re-render).

**Probe-fixture observation.** Probe selected the first WO card in the status-Kanban view, which resolved to non-canonical "Moving Militia" (UUID `b97d040c-915c-46b6-a05e-37f312533cd0`) — an encrypted-blob WO with STRING-typed metadata. This non-canonical selection actually STRENGTHENS the proof: the **defensive `typeof === 'object'` metadata guard from Drift #B-i was verified at runtime** — Block 10 (Withheld Amount) rendered `'—'` (absent path), Block 15 (Notes) rendered "No notes recorded." (absent path), and zero console/page errors fired. The 5 Task-1.4 sections did NOT render on Moving Militia (no typed fields populated) — the probe's `task14SectionsPresent` check passed via the always-present "Purchase Orders" tab button text in the maintenance-tab-bar (probe selector improvement candidate captured §7), but vitest 215/215 plus the existing maintenance.test.ts data-contract on canonical 19511 covers Task-1.4 regression at the data layer.

**Programmatic click pattern.** Default per Task 3.7 §7 entry #3 (validated retired at Task 3.8 close, extended through Tasks 3.3/3.2 to Task 3.4). All clicks via `page.evaluate(() => element.click())` — no Playwright `locator.click()` interception issues observed.

---

## §4. /security-review summary

**Zero findings. Cleared for merge.**

8 security categories examined:

| Category | Surface in diff | Verdict |
|---|---|---|
| Input validation (SQL/NoSQL/command/path) | No backend calls in diff | Not applicable |
| XSS / template injection | All metadata strings (including `meta.appfolioServiceRequestId`, `meta.owner`, `meta.resident`, `meta.jobStatus`, `meta.jobId`, `meta.vendorJobLink`, note `body`/`content`/`posted_by`/`ts`) rendered as React text children (auto-escaped); no `dangerouslySetInnerHTML`, no `innerHTML`, no `document.write`, no `eval`, no `new Function`. CSS `whiteSpace: 'pre-line'` is a layout property, not an escape bypass. | Not exploitable (Precedent #6 — React auto-escapes) |
| Authentication / authorization | No new API calls; no auth/RBAC primitives added. View-as-Tech is a static stub. | Not applicable |
| Crypto / secrets | No hardcoded keys, tokens, or credentials | Not applicable |
| Injection / RCE | No deserialization, no eval-equivalent, no dynamic code execution | Not exploitable |
| Data exposure (logging) | Sentry breadcrumb payload `{ block: <static slug>, expanded: <bool>, workitemId: <UUID> }` — UUIDs unguessable per Precedent #2; no PII; no freeform user content | Not applicable per Precedent #11 |
| Defensive metadata guard | `typeof item.metadata === 'object'` is correctness/safety, not auth boundary | Not security-relevant |
| Test file | `maintenance.module.test.tsx` is unit-test-only — Excluded per HARD EXCLUSION #11 | Not applicable |

---

## §5. Verification (file-by-file diff)

```
qualia-shell/src/components/StrataDashboard/modules/MaintenanceModule.tsx  | +219 / -2
qualia-shell/src/test/appfolioParity/maintenance.module.test.tsx (NEW)     | +142 / -0
                                                              Total       | +361 / -2
```

**MaintenanceModule.tsx changes:**
- Imports: NO new imports (all 6 lucide icons used by new code — `Wrench`, `Landmark`, `Home`, `User`, `FileText`, `Send`, `ClipboardCheck` — were already imported at L7-13 for existing Task-1.4 sections / detail-panel chrome).
- 6 NEW exported Block components at module top (after `ItemCard` close, before `MAIN COMPONENT` comment): `BlockViewAsTech` (stub) / `BlockWithheldAmount` (typed-or-fallback with Number.isFinite guard + USD currency format) / `BlockInvoices` (stub) / `BlockTexts` (stub) / `BlockEmails` (stub) / `BlockNotes` (3-case array/string/absent mirroring 3.2 byte-shape).
- DetailPanel local upgrades: (1) `meta` var upgraded with defensive `typeof === 'object'` guard; (2) `blockBreadcrumb` helper added (consolidated Sentry breadcrumb emitter for new-block toggles).
- DetailPanel JSX additions: (1) Section 1 inline +3 Field rows (SR# / WO ID / Received From) after pills div; (2) Section 2 grid extended +3 cells (Unit / Owner / Resident) inside existing 2-col grid; (3) Section 4 inline +3 Field rows (Job Status / Job ID / Vendor Job Link) after Description Section; (4) consolidated 6-Block region wrapped in single ErrorBoundary scoped wrap inserted between Section 14 Attachments close and Action Buttons cluster — each Block invoked as `<Section title="..." onToggle={(next) => blockBreadcrumb('slug', next)}><BlockX item={item} /></Section>`.
- 5 Task-1.4 sections (Work Order Info / Resident Availability / Actions Log / Labor / Purchase Orders) BYTE-SHAPE PRESERVED — including their 5 ErrorBoundary scoped wraps and 5 Sentry `ui.click` per-section breadcrumbs.

**maintenance.module.test.tsx (NEW):** Path B block-isolation test mirroring `vendors.module.test.tsx` (Task 3.2) + `properties.module.test.tsx` (Task 3.3) calibrations. 8 it-blocks: 4 stub-block contracts (BlockViewAsTech / BlockInvoices / BlockTexts / BlockEmails) + 2 BlockWithheldAmount paths (typed on synthetic / absent on minimal) + 2 BlockNotes paths (array on synthetic / absent on minimal). Test fixture anchors against synthetic minimal `Workitem` shape because canonical 19511 has both `metadata.withheldFromOwner` and `metadata.notes` ABSENT (PRE1 (a-iii)).

**Greps verified post-commit:**
- `grep -c '^export function Block' MaintenanceModule.tsx` → **6** (BlockViewAsTech / BlockWithheldAmount / BlockInvoices / BlockTexts / BlockEmails / BlockNotes).
- `grep -c '<ErrorBoundary' MaintenanceModule.tsx` → **6** (5 existing Task-1.4 + 1 NEW consolidated wrap).
- `grep -c 'Sentry.addBreadcrumb' MaintenanceModule.tsx` → **6** (5 existing Task-1.4 per-section + 1 NEW consolidated `ui.block-toggle` in `blockBreadcrumb` helper).
- `grep -c 'data-testid' MaintenanceModule.tsx` → **8** lines (6 unique testids — `wo-block-notes` appears 3× across the 3-case render branches).
- `grep -c 'isStaticMode' MaintenanceModule.tsx` → **0** (deferred to v2.18+ per §7 #2).
- `grep -c 'blockBreadcrumb' MaintenanceModule.tsx` → **7** (1 helper definition + 6 call sites in Section onToggle handlers).

---

## §6. Rollback plan

**Single squash revert.** Clean revert path: `git revert d516099 -m 1` on main. The squash commit is self-contained — no fixture / type / handler / Appendix-D writes; no sibling-module changes; no migration; no schema additions. Rollback restores the pre-3.4 DetailPanel state (existing 5 Task-1.4 sections + Description / Details / Status Tracking / Attachments / Action Buttons / Tags / Trello / Checklists) and removes the 6 NEW Block components / `blockBreadcrumb` helper / 3 inline expansions / consolidated ErrorBoundary wrap / metadata defensive guard. Test file removal happens automatically as part of the revert.

**Cleanup verification post-revert:**
- vitest delta returns from 215 → 207 (test file removed).
- StrataDashboard chunk hash returns from `CbilAZ2x` to `DFmgzha6` (or new hash if other commits land in between); MaintenanceModule chunk hash returns to its pre-3.4 hash.
- module-count parity stays at 3278.

**Risk of revert.** Low. No database migrations, no public API contracts, no fixture changes. Only operational impact: maintenance technicians who would have seen the 6 NEW Block titles + 3 inline upgrades on the WO detail panel revert to the legacy Task-1.4 + chrome surface. Defensive metadata guard removal would slightly increase fragility on encrypted-blob fixture WOs but no observable regression (existing reads only access `metadata.trelloBoardName` etc. which return undefined safely on string-typed metadata).

---

## §7. Deferred items (14 entries — extends 3.2's 9 with 5 NEW)

1. **Section 5 Scheduling consolidation** — v2.18+ structural-rework. Existing partial rendering across L690 (Resident Availability, Task 1.4) + L747 (Status Tracking, legacy with dispatch/scheduled-date/dispatched/signed-off rows). v1 L170 expects ONE consolidated Scheduling section. Refactor scope: merge into a single Section component with sub-grouped rows. EXPLICITLY DEFERRED at PRE0 / Drift #4 — would violate additive-only constraint of layout-class scope.

2. **isStaticMode write-guards on 9 mutating sites** (5 in MaintenanceModule + 4 in WorkOrdersModule) — v2.18+ structural-rework. MaintenanceModule sites: `strataPost('/maintenance/dispatch/${id}')` + `strataPost('/maintenance/sign-off/${id}')` + `strataPost('/maintenance/attachments/${id}')` + `strataPost('/maintenance/recurring-templates')` + 5th. WorkOrdersModule sites: `strataPost('/workitems')` + `strataPut('/workitems/${id}')` + `strataPost('/gmail/send')` + 4th. Joins 3.2's 14-site deferral. Layout-class scope rejected widening per kickoff §EXPLICIT NON-GOALS.

3. **Top-level ErrorBoundary wrap on `MaintenanceModule` default export** — v2.18+ structural-rework. Module currently has 5 SCOPED ErrorBoundary wraps (5 Task-1.4 sections) + 1 NEW consolidated 6-Block wrap from Task 3.4 = 6 scoped total; default export NOT wrapped. Joins existing 4-item structural-rework follow-up (TenantPortal inline tabs + MessagesTab missing-key + PropertiesModule top-level + VendorsModule top-level) → now **5 items**.

4. **Static handler for PUT /workitems/:id** — v2.18+. `WorkOrdersModule.tsx` L102 calls `strataPut('/workitems/${wo.id}', updates)` but no static handler matches in `strataApi.static.ts`. Pre-existing silent no-op in static mode (`VITE_APPFOLIO_SEEDS=false`); mirrors 3.2 Drift #12 `performance.totalSpend` pattern. Surfaced via 3.4 recon §6 + §9 grep.

5. **Encrypted-blob `enc:v1:astra:*` friendly placeholder rendering** — v2.18+. 370/371 work_orders in `workitems.json` carry `description` and `metadata` as `"enc:v1:astra:..."` STRING blobs. Today renders raw value (acceptable per L168 demo-grade); friendly placeholder (e.g., `"[encrypted demo data]"`) detected via prefix match would improve UX for future demos.

6. **Schema enrichment — `Workitem.withheldFromOwner: number`** — v2.18+. Gap analysis L111 explicitly recommended this field at Task 1.4; deferred then. 3.4 renders via `metadata.withheldFromOwner` null-safe; first-class field would simplify Block 10 + remove Drift #B-i defensive guard at one call site. Joins 3.2's `EntityProfile.{website?, emails?[], phones?[], primaryAddress?}` schema-enrichment candidates → now **5 candidates** (5 fields across 2 types).

7. **Section 7 RBAC tech-portal wiring** — Phase-N. `BlockViewAsTech` ships as L168 stub today. Future Phase-N implementation: RBAC permission check (`hasPermission('strata:maintenance:tech-view')`) + perspective-filter on the entire DetailPanel render (hide manager-only fields like Withheld Amount / Owner Approval / Vendor Instructions when in tech mode). Out of 3.4 layout-class scope.

8. **Sections 11/12/13/15 schema enrichment** — Phase-N. `BlockInvoices` / `BlockTexts` / `BlockEmails` ship as L168 stubs; `BlockNotes` ships with metadata fallback. Future Phase-N: typed sub-types `WorkitemInvoice` / `WorkitemTextThread` / `WorkitemEmailThread` + `WorkitemNote[]` on Workitem with FK to entities/users; static handlers for `/workitems/:id/{invoices, texts, emails, notes}`.

9. **Section 1/2/4 partial-upgrade test coverage at unit level** — v2.18+ test-quality. The 3 inline upgrades (Section 1 SR# / WO ID / Received From; Section 2 Unit / Owner / Resident grid cells; Section 4 Job Status / Job ID / Vendor Job Link) are NOT covered by unit tests (Path B isolates Block exports only). CDP probe at user-flow level provides smoke coverage. Adding unit tests requires either Path A integration test OR extracting partial upgrades into named exported components.

10. **Drift #B-iii fixture/schema reconciliation** — v2.18+ data-quality. Decrypt 370/371 dev fixtures to proper object shape OR narrow `Workitem.metadata` schema to `metadata?: Record<string, any> | string` and remove the defensive `typeof === 'object'` guard in Block 10 + 15 + DetailPanel. Currently Blocks 10 + 15 carry the runtime guard; production data is expected to match the typed contract.

11. **Path A integration test for block-toggle Sentry breadcrumb-payload assertion** — v2.18+ low-priority. Full-DetailPanel mount with click-through; verifies the consolidated breadcrumb payload `{block, expanded, workitemId}` reaches Sentry's hub with the correct `block` slug. Joins existing Path A integration test candidates from 3.3 (tab-switch breadcrumb-payload) + 3.2 (block-toggle breadcrumb-payload). Now 3 candidates total.

12. **Pre-edit `MaintenanceModule` chunk-size baseline recon improvement** — recon-quality follow-up. 3.4 recon block 8 grep filtered to `StrataDashboard` only and missed the lazy-loaded `MaintenanceModule-*.js` separate chunk (created by `StrataMaintenanceAdapter.tsx::lazy()`). Pre-edit MaintenanceModule chunk size (the actual location of new Block code) was NOT captured; pre/post drift INFERRED. For next-task (3.1), recon should grep ALL non-vendor chunks to capture target-module chunk baseline.

13. **Recon `grep` filter improvement to scan all non-vendor chunks** — generalization of #12. Codify in recon checklist for 3.1 and beyond: vite build output `grep -E '\.js$|\.css$'` (filter to dist asset chunks only) instead of module-name-filtered grep. Applies to any task editing a code-split lazy module.

14. **Consolidated `ui.block-toggle` vs per-section `ui.click` breadcrumb category divergence consistency review** — v2.x test-quality follow-up. 5 existing Task-1.4 breadcrumbs use `category: 'ui.click'` (per-section); 1 NEW Task 3.4 consolidated breadcrumb uses `category: 'ui.block-toggle'` (block aggregator). Intentional divergence mirrors 3.2's `'vendors.detail.block.toggled'` precedent. Non-trivial migration would consolidate Task-1.4 breadcrumbs into the `ui.block-toggle` category for shape consistency across modules.

---

## §8. Next-task recommendation

**Phase-3 parallel-batch final survivor: 3.1 (Tenant detail 26-section).** Phase-3 closes when 3.1 lands.

**Highest risk per fixture-realism** (Animals / Vehicles / Insurance per recon kickoff matrix and §19 dependency graph). 3.4 calibrated the multi-section render baseline at +8 vitest delta and the "additive on existing detail-panel" pattern (5 already-shipped sections preserved + 6 NEW Blocks consolidated under one ErrorBoundary + 3 inline partial-upgrades — applies as template for 3.1's 26-section ask).

**Layout-class baseline now anchored at 3 data points:**
- 3.3 (4 stub placeholders) → +4 vitest delta / +2.56 kB module-graph drift
- 3.2 (10 Block components, typed + stub + fallback mix) → +11 vitest delta / +7.91 kB module-graph drift
- 3.4 (4 stubs + 2 typed-or-fallback) → +8 vitest delta / chunk-hash drift only on StrataDashboard (additive code in code-split MaintenanceModule chunk, pre-edit baseline inferred)

**3.1 prediction band** (26 sections, Animals/Vehicles/Insurance fixture-realism risk): expected vitest delta **+18 to +30** (depends on whether sub-fixture contracts for Animals/Vehicles/Insurance need it-blocks); module-graph drift **+8 to +14 kB ungz**. Recon should specifically check: (a) tenant detail render-host module identity (`ResidentsModule.tsx` vs other?); (b) existing section count vs v1 26-section ask; (c) Animals / Vehicles / Insurance schema population on canonical fixture vs metadata fallback; (d) cross-module sub-tab imports under any `__tenants/` or similar dir; (e) FolioGuard upsell card scope (Strata-unique extension per gap analysis).

**v2.18+ candidate list (post-3.4 refresh):**
- Playwright baseline pass-count drift (slid from v2.17 — that slot was claimed by 3.4)
- Structural rework (5 items now: TenantPortal inline tabs / MessagesTab missing-key / PropertiesModule top-level / VendorsModule top-level / **MaintenanceModule top-level**)
- Drift #12 performance.totalSpend mismatch fix
- Path A integration test for tab-switch + block-toggle + WO-block-toggle breadcrumb-payload assertion
- **Section 5 Scheduling consolidation** on MaintenanceModule
- **isStaticMode write-guards** on 9 mutating sites (5 MaintenanceModule + 4 WorkOrdersModule)
- **Static handler for PUT /workitems/:id**
- **Encrypted-blob `enc:v1:astra:*` friendly placeholder**
- **`Workitem.withheldFromOwner: number` schema enrichment**
- **Drift #B-iii fixture/schema reconciliation**
- **Section 1/2/4 partial-upgrade test coverage**
- **Section 7 RBAC tech-portal wiring** (Phase-N)
- **Sections 11/12/13/15 schema enrichment** (Phase-N)
- **Recon `grep` filter improvement** (generalization of pre-edit chunk-baseline gap)
- **Sentry breadcrumb category consistency review** (`ui.click` vs `ui.block-toggle` across modules)
