# Phase 4 — Task 4.3 Completion Report

**Task.** Vendors page-1 closeout (Phase-4 fifth task; **FIXTURE-CLASS pure — 4th data point** of the established baseline).

**Squash SHA.** `c732f64` (PR #31; full SHA captured at `git log -1 --format=%H c732f64`). Closed 2026-04-30.

**Source.** `AppFolio_Screenshots/data/05_vendors_page1.json` + `AppFolio_Screenshots/data/10_vendor_detail_2story_roofing.json`.

**Plan v2 anchor.** Plan v2.23 (Changelog `v2.23 (2026-04-30)` entry — to be added at post-merge sweep).

---

## §1. Scope + DoR + 10-DC ledger (10-DC enumeration → 12 actuals after PRE-FLIGHT discovery) + scope-reduction context

### Scope-reduction context (3 predicted paths → Fork B-Refined single-record touch)

The kickoff prompt enumerated three candidate paths (AUGMENTATION-Path-A all-4-vendor / AUGMENTATION-Path-B 2-STORY-only / FIXTURE-CLASS APPEND if 2-STORY missing). PRE-FLIGHT DC-A revealed all 4 canonical vendors EXIST in `qualia-shell/public/data/entities.json` — eliminating APPEND. PRE-FLIGHT also surfaced two unscoped findings that decisively narrowed the path further:

1. **Phase-1 Task 1.2 era already absorbed the 10_vendor_detail typed-shape.** The 2-STORY record at id `48be69c5-9cb5-4921-b8f0-d26e8c07b1a5` already carries the typed top-level fields (`vendorFederalTax`, `vendorAccountingInfo`, `vendorCompliance`, `paymentMethod`, `send1099`) populated from 10_vendor_detail content. The `VendorFederalTax` / `VendorAccountingInfo` / `VendorCompliance` interfaces at `packages/types/index.ts` L179/187/204 — purpose-defined for vendor schema — are already consumed by this record.

2. **`compliance.json` already contains 6 vendor-compliance rows for `appfolio-v-2716`** (workers_comp, general_liability, epa_certification, auto_insurance, state_license, contract — full 6-itemType coverage matching DC-C's 6 expiration dates). This is a **Task 4.6 SCOPE-COLLISION finding** (parallel to Task 4.5's morning-halt greenfield-classification error): the Task 4.6 spec's "6 vendor-compliance rows for 2-Story Technical Roofing" is at minimum partially absorbed.

User confirmation **Fork B-Refined** narrowed deliverables to single-record metadata-bag augmentation on 2-STORY only, mirroring Task 4.5's "Phase-4-era absorption follows higher-fidelity precedent" principle (existing 554 leases not retro-migrated; same applies to CS Cooper / Georgia Power / Jimenez where no 10_vendor_detail capture exists).

### Scope (per v1 plan L185-186 + Plan §9 row 4.3 v2.23, Fork B-Refined)

**Calibration class:** **FIXTURE-CLASS pure — 4th data point** of the baseline. Joins 4.1 / 4.4 / 4.2 in the prediction-band: +0 vitest delta / +0 kB module-graph drift / chunk hash byte-identical SHA256 `66c743…3461`.

| ID | Deliverable | Status |
|---|---|:-:|
| D-1 | ADD 4 metadata-bag fields under 2-STORY's `metadata` block at id `48be69c5-9cb5-4921-b8f0-d26e8c07b1a5`: `appfolioVendorId: "appfolio-v-2716"` (namespace bridge) + `website: "www.2stroofing.com"` + `primaryContactName: "Danny Bourdua"` + `taxIdMasked: "XX-XX-XXXX"` (per appfolioDerived/vendors.ts L74 sanitization precedent) | ✅ |
| D-2 | NO modifications to CS Cooper (`cf16e446-…`), Georgia Power (`3b974d35-…`), Jimenez (`38c6919a-…`) records — Fork B-Refined precedent (no AppFolio detail capture; existing CSV-source rollup metadata stays) | ✅ |
| D-3 | NO `appfolioVendorId: null` backfill on the 3 untouched records — noise without value (mirrors Task 4.5's "existing 554 leases not retroactively migrated" principle) | ✅ |
| D-4 | NO schema change at `packages/types/index.ts` — `VendorFederalTax`/`VendorAccountingInfo`/`VendorCompliance` interfaces already define the typed shape on entities.json's typed top-level layer; metadata bag stays loose-typed `Record<string,any>` per existing pattern (back-compat layer per L237-241; scheduled for retirement 2026-Q3) | ✅ |
| D-5 | NO new test file; vitest 224 → 224 (+0 delta) — vendor-count is unconstrained per DC-I (zero `VENDORS_BASELINE`/`toHaveLength` pins) | ✅ |
| D-6 | NO test invariant relaxation needed (4th pure-FIXTURE-CLASS data point inherits the no-relaxation baseline from 4.1 / 4.4 / 4.2) | ✅ |

### 10-DC enumeration → 12 actuals

| # | DC | Finding | Action |
|---|---|---|:--|
| 1 | DC-A scope-class | All 4 canonical vendors EXIST in entities.json with rich CSV-source metadata (2-STORY at `48be69c5-…`, CS Cooper at `cf16e446-…`, Georgia Power at `3b974d35-…`, Jimenez at `38c6919a-…`) | **DECISIVE PATH ELIMINATION**: APPEND ruled out; AUGMENTATION-only |
| 2 | DC-A.1 shadow proliferation | 15 shadow vendor records surfaced across the 4 canonical names (4× "2 Story" lowercase, 4× "Georgia Power" lowercase, 5× "Jimenez" variants, 2× "CS Cooper" lowercase) | §7 entry 1: Phase-5+ entity-resolution merge pass |
| 3 | DC-A.2 byte-identical UUID-distinct dup | `JIMENEZ HOME REPAIRS LLC` exists at TWO UUIDs: canonical `38c6919a-…` AND `ffd94c6e-…` — same uppercase byte-identical name | §7 entry 2: Phase-5+ dedup |
| 4 | DC-B schema | `EntityType = '… \| vendor \| …'` at L19; `VendorFederalTax`/`VendorAccountingInfo`/`VendorCompliance` interfaces at L179/187/204; no vendor-subtype enum | NO schema change required (D-4) |
| 5 | DC-C source byte-shape | `10_vendor_detail_2story_roofing.json` carries 30+ fields including federal_tax (raw masked tax-id `XX-XXX4232`), accounting (full payment + bank info), 6 compliance dates (general_liability=2026-07-11 only set), 2 internal notes, 1 system text | Fork B-Refined picks 4 fields of these 30+; rest already absorbed via Phase-1 Task 1.2 typed-shape and `appfolioDerived/vendors.ts` |
| 6 | DC-D source list | `05_vendors_page1.json` lists 8 sample vendors of 3040 total at page_size 20; "active_maintenance_vendors_spotted_in_work_orders" lists exactly the 4 canonical | Confirms scope = 4 maintenance-active vendors per Plan §9 row 4.3 |
| 7 | DC-E existing metadata | All 4 canonical vendors carry rich CSV-source metadata (address, paymentType, send1099, vendorPortalActivated, expiration dates, contactName/firstName/lastName, trades). 2-STORY's CSV-source data ALREADY matches 10_vendor_detail capture (paymentType=Zelle, liabilityInsuranceExpiration=07/11/2026 ✓) | Confirms Phase-1 Task 1.2 absorption |
| 8 | DC-F WO vendor FK | **PRE-EXISTING SHADOW-FK BUG**: WO `wi-task-2-9-project-01` (Phase-2 Task 2.9 era) `metadata.vendorId = "e013ce70-…"` (lowercase shadow CS Cooper) instead of canonical `cf16e446-…`. Task 4.4's 11 new WOs + Task 1.4 era WOs use `metadata.vendorName` STRING only (no UUID) — clean string-based linkage | §7 entry 3: Phase-5+ FK normalization |
| 9 | DC-G compliance ownership | `compliance.json` exists; ALREADY contains 6 rows for `entityId: "appfolio-v-2716"` covering all 6 itemTypes; canonical state-of-record. **Task 4.6 SCOPE-COLLISION finding** | §7 entry 4: Recommend Task 4.6 kickoff include DC-A scope-class flip pre-flight mirroring Task 4.5 retry pattern |
| 10 | DC-H GR-7 vendor PII | `appfolioDerived/vendors.ts` L57-74 establishes precedent: phone `(678) 936-2606` → SANITIZED `(555) 555-XXXX`; email `daniel@2stroofing.com` KEPT (corporate identifier); secondary email → SANITIZED; tax-id `XX-XXX4232` → flattened to `XX-XX-XXXX`; names KEPT; corporate addresses KEPT | Fork B-Refined uses already-sanitized values (no new PII introduced) |
| 11 | DC-I test invariants | ZERO vendor-count assertions (`grep -rnE "VENDORS_BASELINE|toHaveLength.*vendor"` returns no test matches; only render-side `vendors.length` references in `ComplianceEngine.tsx` / `ReportingModule.tsx` / `VendorsModule.tsx`) | NO invariant relaxation required (D-6) |
| 12 | DC-J/K/L parallel namespace | `appfolioDerived/vendors.ts` (280 lines) ALREADY contains the full 10_vendor_detail content for 2-STORY at `appfolio-v-2716` PLUS 8 page-1 vendors at `appfolio-v-p1-1` through `appfolio-v-p1-8`. Strict-scope GR-7 layer behind `VITE_APPFOLIO_SEEDS` flag | Confirms most-of-scope already-absorbed; namespace-bridge gap is the actionable surface |

**Emergent post-DC actions (4 actuals beyond the DC table):**

- **A-1 metadata-bag vs typed top-level masking-variant divergence.** The 2-STORY record's existing typed `vendorFederalTax.taxIdMasked` is `"XX-XXX-XXXX"` (3-3-4 grouping). Fork B-Refined adds `metadata.taxIdMasked = "XX-XX-XXXX"` (2-2-4 grouping per appfolioDerived/vendors.ts L74). Two layers will hold different masking-variants until 2026-Q3 metadata-bag retirement (per `packages/types/index.ts` L237-241 schema comment). Captured in §7 entry 6.

- **A-2 Cross-namespace consumer absence.** VendorsModule reads entities.json only; appfolioDerived consumers read `appfolioDerived/vendors.ts` only. No current cross-namespace consumer of `metadata.appfolioVendorId`. The bridge field is added forward-defensively for future consumers (e.g., a Compliance-to-Entity resolver, or a vendor identity-graph query). CDP probe acceptance gate `bridge-field-not-leaked-in-dom` verifies 0 DOM mentions, confirming the field is added but not yet rendered.

- **A-3 Schema layer separation discipline.** Adding the 4 fields to the metadata bag (back-compat layer) rather than expanding the EntityProfile typed surface (forward-looking layer) is intentional — matches the schema's L237-241 explicit dual-layer design. Future Phase-5+ canonicalization (when bag is retired) will need to carefully migrate `metadata.appfolioVendorId` and `metadata.website` and `metadata.primaryContactName` to either typed top-level fields or a separate `vendor_id_map.json` artifact (§7 entry 5 candidate).

- **A-4 Vite localhost-binding carry-forward.** Per Task 4.5 A-3 carry-forward note: `cdp_probe_task_4_3.cjs` uses `http://localhost:5173/` (not `127.0.0.1`). Probe ran 8/8 first-try (zero iteration) on first attempt — confirms the localhost-binding policy works forward.

### Definition of Ready (DoR) — PRE0/PRE1 gates

| Gate | Result |
|:-:|:--|
| PRE0 (a) DC-A scope-class | AUGMENTATION-ONLY (Fork B-Refined: 2-STORY single-record touch) |
| PRE0 (b) DC-B/C/D source verification | Schema unchanged; 10_vendor_detail captured 30+ fields; 05_vendors_page1 lists exactly the 4 canonical as maintenance-active |
| PRE0 (c) DC-E existing-state | All 4 canonical vendors exist with rich CSV-source metadata; 2-STORY also carries Phase-1 Task 1.2 typed top-level shape |
| PRE0 (d) DC-G compliance ownership | `compliance.json` owns vendor compliance; 6 rows already present for `appfolio-v-2716` (Task 4.6 scope-collision flagged) |
| PRE0 (e) DC-H GR-7 policy | Use `appfolioDerived/vendors.ts` already-sanitized values; no new PII |
| PRE0 (f) DC-I test invariants | ZERO vendor-count assertions; +0 relaxations needed |
| PRE0 (g) HEAD verification | `9ab70a7` matches expected base (post-Task-4.5-retry sweep) |
| PRE0 (h) Working tree | Untracked artifacts only (Docs/Baselines/* + cdp_probe_*.cjs + AGENTS.md — pre-existing across Phase-3+) |
| PRE1 (a) Branch creation | `feat/phase-4-task-4.3-vendors-page1-closeout` off `main @ 9ab70a7` ✓ |
| PRE1 (b) Vitest baseline | 35 / 224 / passing |

---

## §2. Strict-gate output (captured locally pre-merge HEAD `81de0b7`; mirrored at squash SHA `<TBD>` post-merge)

| Gate | Command | Result |
|:-:|:--|:-:|
| 1 | `npx tsc -b` | EXIT 0 |
| 2 | `npx vitest run` | 35 files / 224 tests / **passing** (Duration 4.04s) — **+0 vitest delta confirmed** |
| 3 | `npx vite build` (default = `VITE_APPFOLIO_SEEDS=true`) | EXIT 0; built in 5.57s; chunk `StrataDashboard-D37sEP_1.js` (1,031.26 kB ungz / 246.76 kB gz) |
| 4 | `VITE_APPFOLIO_SEEDS=false npx vite build` | EXIT 0; built in 5.33s; chunk `StrataDashboard-D37sEP_1.js` (1,031.26 kB / 246.76 kB) — byte-identical hash across both flag modes |
| 5 | `node Scripts/verify_no_pii_leak.mjs` | `PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found` (legacy + strict scopes both clean) |
| 6 | `shasum -a 256 dist/assets/StrataDashboard-D37sEP_1.js` | `66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461` — **byte-identical to prediction-band lock** (post-Task-4.5 baseline) |

CI run pair on PR-branch pre-merge gate: `25149115287` (Build, test, verify — success) + `25149115304` (PII Scan — success). Auto-fired on `pull_request` event per Phase-4 push-trigger discipline.

---

## §3. CDP render proof — 8/8 acceptance pass on first attempt (zero iteration)

Probe script: `qualia-shell/cdp_probe_task_4_3.cjs`. Captured at: `Docs/Baselines/phase_4_task_4_3/cdp_summary.json`. Screenshots: `01_strata_landing.png`, `02_vendors_landing.png`, `03_regression_nav.png`.

| Acceptance gate | Predicate | Result |
|:--|:--|:-:|
| `page-loads-no-console-errors` | `consoleErrors.length === 0 && pageErrors.length === 0` | ✅ |
| `2story-4-fields-absorbed` | All 4 metadata fields verified verbatim (`appfolioVendorId`/`website`/`primaryContactName`/`taxIdMasked`) | ✅ |
| `2story-typed-top-level-untouched` | `vendorFederalTax.taxIdMasked === 'XX-XXX-XXXX'` && `paymentMethod === 'Zelle'` | ✅ confirms metadata bag vs typed top-level masking-variant divergence preserved as designed |
| `2story-csv-source-fields-preserved` | `metadata.contactName === 'BOURDUA DANNY'` (CSV-source field stays) | ✅ |
| `4-canonical-vendors-active` | All 4 (2-STORY/CS Cooper/Georgia Power/Jimenez) resolve and `status === 'active'` | ✅ regression-clean for 3 untouched |
| `3-untouched-no-bridge-field` | CS Cooper / Georgia Power / Jimenez `metadata.appfolioVendorId` NOT present (Fork B-Refined precedent) | ✅ |
| `compliance-6-rows-regression-clean` | `compliance.json` still has 6 rows for `appfolio-v-2716` covering all 6 itemTypes | ✅ Task 4.6 scope-collision finding regression-clean |
| `bridge-field-not-leaked-in-dom` | DOM textContent contains 0 occurrences of `appfolio-v-2716` | ✅ confirms A-2 cross-namespace consumer absence |

**Iteration count: 0** (matches Task 4.4 + Task 4.5 zero-iteration profile). Total vendors confirmed at runtime: **3218** (preserved); total compliance.json rows: 15 (6 for 2-STORY + 9 section_8_aha for Riverwood Club; both unchanged from pre-task baseline).

---

## §4. Module-graph drift — FIXTURE-CLASS pure 4th data point

| Asset | Pre-Task-4.3 (`9ab70a7`) | Post-Task-4.3 (this branch) | Δ |
|:--|:--:|:--:|:-:|
| `StrataDashboard-D37sEP_1.js` ungz | 1,031.26 kB | 1,031.26 kB | **0 kB** |
| `StrataDashboard-D37sEP_1.js` gzip | 246.76 kB | 246.76 kB | **0 kB** |
| `StrataDashboard-*.js` chunk hash | `D37sEP_1` | `D37sEP_1` | **byte-identical** |
| `StrataDashboard-D37sEP_1.js` SHA256 | `66c743…3461` | `66c743…3461` | **byte-identical** (full hash captured §2 row 6) |
| `MaintenanceModule-DCXnnjAV.js` ungz | 78.22 kB | 78.22 kB | **0 kB** |
| `VITE_APPFOLIO_SEEDS=true` ↔ `false` chunk hash parity | `D37sEP_1` ↔ `D37sEP_1` | `D37sEP_1` ↔ `D37sEP_1` | byte-identical across flag |
| Total module count (parity check) | 3278 | 3278 | 0 |

**FIXTURE-CLASS pure 4th data point confirmed.** Fixture-only JSON edits (4 metadata-bag string-key additions on a single record) do not enter the chunk graph; chunk hash byte-identical SHA256 across both build modes.

**Cumulative Phase-4 module-graph drift across closed tasks (4.1 / 4.4 / 4.2 / 4.5 / 4.3):** `D37sEP_1` → `D37sEP_1` → `D37sEP_1` → `D37sEP_1` → `D37sEP_1` (+0 kB across 5 tasks). The Phase-4 source-touch task (4.7 feature-flag flip) will be the first to break this streak.

---

## §5. Vitest delta — FIXTURE-CLASS pure 4th calibration data point

| Phase-4 task | Pre | Post | Δ | Class |
|:--|:-:|:-:|:-:|:--|
| 4.1 Properties | 224 | 224 | +0 | FIXTURE-CLASS pure (1st data point) |
| 4.4 Work Orders | 224 | 224 | +0 | FIXTURE-CLASS pure (2nd data point) |
| 4.2 Tenants | 224 | 224 | +0 | FIXTURE-CLASS pure (3rd data point) |
| 4.5 Leases | 224 | 224 | +0 | FIXTURE-CLASS+SCHEMA hybrid (1st data point of hybrid class) |
| **4.3 Vendors** | **224** | **224** | **+0** | **FIXTURE-CLASS pure (4th data point)** |

**No invariant relaxations needed** for Task 4.3 (zero vendor-count assertions per DC-I). Pure FIXTURE-CLASS PRE2 baseline now locked at **4 data points** with prediction-band held at +0 vitest / +0 kB across all of them.

---

## §6. Plan v2 surgery — v2.23 (per post-merge sweep)

To be applied at post-merge sweep (mirroring Task 4.5 v2.22 sweep pattern):

1. **Changelog `v2.23 (2026-04-30)` entry** capturing:
   - FIXTURE-CLASS pure 4th data point calibration (+0 vitest / +0 kB drift; chunk hash SHA256 byte-identical).
   - Fork B-Refined narrative (single-record touch on 2-STORY only; mirrors Task 4.5 "existing 554 leases not retro-migrated" precedent).
   - Phase-1 Task 1.2 era already-absorbed typed-shape recognition (no schema change required).
   - Task 4.6 SCOPE-COLLISION finding (compliance.json already has 6 rows for `appfolio-v-2716` — recommend Task 4.6 kickoff include DC-A scope-class flip pre-flight).
2. **§9 Phase-4 sub-tracker** row 4.3 flips `R` → `✓`. Pending row narrows 3 → 2: `4.6, 4.7`.
3. **§7 deferred-items ledger** — 6 entries from this completion report's §7.
4. **Appendix C** — `entities (vendors)` row update enumerating Task 4.3 contribution (1 record metadata-bag enrichment with namespace-bridge field).
5. **Appendix D** — NO row updates required as ADD. `entities.json` was pre-allocated to row 6 Phase-4 cell at v2.7 era (Task 4.2 absorbed it). v2.23 amends that cell to enumerate Task 4.3's contribution (`+0 records, 4-field metadata-bag augmentation on 2-STORY (48be69c5-…); namespace-bridge to appfolio-v-2716`).
6. **Calibration baseline narrative** — adds the 4th pure-FIXTURE-CLASS data point alongside the existing 4-data-point LAYOUT-CLASS baseline (3.3/3.2/3.4/3.1, Phase-3 retired) and the 1-data-point FIXTURE-CLASS+SCHEMA hybrid baseline (4.5). Phase-4 calibration matrix now has 2 distinct classes with 4 + 1 = 5 total Phase-4 data points; prediction-band locked at +0 vitest / +0 kB drift for both classes.

---

## §7. Deferred items + carry-forward (6 candidates for v2.24+ §7 ledger)

1. **Shadow-vendor proliferation cleanup.** DC-A.1 surfaced 15 shadow vendor records across the 4 canonical names (4× "2 Story" lowercase variants + 4× "Georgia Power" lowercase + 5× "Jimenez" variants + 2× "CS Cooper" lowercase). Strong signal of imperfect dedup during a prior import pass. Out of scope for Task 4.3; flag for Phase-5+ entity-resolution merge pass: identify all `(entityType=='vendor', name)` near-duplicates via fuzzy-match (case-insensitive + token-level edit distance) and reconcile via canonical-pick + soft-delete or hard-delete based on traceability.

2. **Byte-identical UUID-distinct JIMENEZ HOME REPAIRS LLC dup.** DC-A.2 surfaced two distinct UUIDs (`38c6919a-6b46-4a0b-8c74-3ad27b5f13d9` and `ffd94c6e-4773-4dce-b770-961742707cba`) carrying byte-identical UPPERCASE name `JIMENEZ HOME REPAIRS LLC`. This is a true duplicate (not a case-variant shadow). Flag for Phase-5+ dedup task: pick canonical (recommend `38c6919a-…` since it's the WO-FK target and matches the entity-resolution conventions of Task 4.4 era), migrate any FK references on the dup, soft-delete or hard-delete the dup.

3. **Pre-existing shadow-FK bug.** DC-F surfaced WO `wi-task-2-9-project-01` (Phase-2 Task 2.9 era) `metadata.vendorId = "e013ce70-3930-43db-94fc-743bcac83779"` (lowercase shadow `"CS Cooper Residential Contractors LLC"`) instead of canonical `cf16e446-…`. Out of scope for Task 4.3; flag for Phase-5+ FK normalization pass: scan all workitems for `metadata.vendorId` referencing shadow vendor records (post-resolution from §7 entry 1) and rewrite to canonical UUIDs.

4. **Task 4.6 SCOPE-COLLISION finding (CRITICAL).** DC-G surfaced that `compliance.json` already contains 6 rows for `entityId: "appfolio-v-2716"` covering all 6 itemTypes (workers_comp, general_liability, epa_certification, auto_insurance, state_license, contract). The Task 4.6 spec ("6 vendor-compliance rows for 2-Story Technical Roofing") is at minimum partially absorbed. Recommend Task 4.6 kickoff include a DC-A scope-class flip pre-flight mirroring Task 4.5 retry pattern: enumerate which compliance rows from `06_compliance_matrix_*.json` source files are already absorbed and which are net-new. Likely path forward for Task 4.6 (predicted post-PRE0): scope-reduction to net-new compliance rows only (probably 9 AHA rows for Riverwood already absorbed too — check at Task 4.6 kickoff).

5. **Namespace-bridge gap (post-Task-4.3).** Task 4.3 closes the namespace-bridge gap for 2-STORY (1 of 1 vendor with current AppFolio detail capture). 14 OTHER `appfolioDerived/vendors.ts` records (`appfolio-v-p1-1` through `appfolio-v-p1-8` from page-1 sample, plus possibly more from future captures) have no `metadata.appfolioVendorId` in `entities.json`. If/when those vendors gain entities.json canonical records, the bridge field should be backfilled per the Task 4.3 precedent. Phase-5+ carry-forward options: (a) per-record bridge pass on each absorption, OR (b) introduce a `qualia-shell/public/data/vendor_id_map.json` artifact mapping `entities.json[id]` ↔ `appfolio-v-{id}` for centralized lookup (decouples bridge from per-record metadata bag).

6. **`metadata.taxIdMasked` vs `vendorFederalTax.taxIdMasked` masking-variant divergence.** A-1 captured the post-edit divergence: metadata bag carries `"XX-XX-XXXX"` (2-2-4 grouping per `appfolioDerived/vendors.ts` L74); typed top-level `vendorFederalTax.taxIdMasked` carries `"XX-XXX-XXXX"` (3-3-4 grouping from Phase-1 Task 1.2 era). Two layers will hold different masking-variants until 2026-Q3 metadata-bag retirement (per `packages/types/index.ts` L237-241 schema comment). Phase-5+ canonicalization pass: pick a single masking variant (recommend the more-restrictive `"XX-XX-XXXX"` 2-2-4 grouping per appfolioDerived sanitization standard) and migrate the typed top-level to match before bag retirement. Tracking ID: bag-retirement-2026Q3.

---

## §8. Phase-4 §9 sub-tracker post-state

| Row | Task | Phase-4 status | Notes |
|:-:|:--|:-:|:--|
| 4.1 | Properties page-1 closeout | ✓ | Closed 2026-04-29 (1st task; FIXTURE-CLASS 1st calibration; PR #27 → `5daa2d4`) |
| 4.2 | Tenants page-1 closeout | ✓ | Closed 2026-04-29 (3rd task; FIXTURE-CLASS 3rd calibration; PR #29 → `abf65bb`) |
| **4.3** | **Vendors canonical seeds** | **✓ (this task)** | **Closed 2026-04-30 (5th Phase-4 task; FIXTURE-CLASS pure 4th calibration); Fork B-Refined single-record metadata-bag touch on 2-STORY only; Phase-1 Task 1.2 era already-absorbed typed-shape recognition; Task 4.6 scope-collision flagged for Task 4.6 kickoff** |
| 4.4 | Work Orders page-1 closeout | ✓ | Closed 2026-04-29 (2nd task; FIXTURE-CLASS 2nd calibration; PR #28 → `d5beb88`) |
| 4.5 | Leases pending-countersign closeout | ✓ | Closed 2026-04-29 retry (4th Phase-4 task; FIXTURE-CLASS+SCHEMA hybrid 1st calibration; PR #30 → `f8c954c`) |
| 4.6 | Compliance matrix seed | R | Pending — recommend DC-A scope-class flip pre-flight at kickoff (Task 4.3 §7 entry 4 finding) |
| 4.7 | Feature-flag flip | R | Pending — closes Phase-4; per v1 plan §19 dependency graph "4.1, 4.2, 4.3, 4.4, 4.5, 4.6 (parallel) → 4.7 (last)" |

**Phase-4 closure progress:** 5 of 7 task rows ✓ (4.1 + 4.2 + 4.3 + 4.4 + 4.5). Surviving Phase-4 row narrows 3 → **2** (`4.6, 4.7`).

**Calibration baseline state post-Task-4.3:**
- LAYOUT-CLASS PRE2 baseline: 4 data points (3.3 +4 / 3.2 +11 / 3.4 +8 / 3.1 +9; Phase-3 only, retired)
- **Pure FIXTURE-CLASS PRE2 baseline: 4 data points (4.1 +0 / 4.4 +0 / 4.2 +0 / 4.3 +0; locked at +0 vitest / +0 kB; chunk hash SHA256 byte-identical across all 4)**
- FIXTURE-CLASS+SCHEMA hybrid PRE2 baseline: 1 data point (4.5 +0 / +0 kB)

---

## §9. Rollback plan

If post-merge regression is discovered:

1. **Revert PR.** `gh pr revert 31 -R NovaTrustSolutions/dwellium-per-spec` creates a clean revert commit. The diff is tiny (5 line additions, 1 line modification in a single file `qualia-shell/public/data/entities.json`); revert is mechanical with zero merge conflict risk.
2. **No coordinated revert needed.** No schema change, no test-file change, no fixture-file creation. Reverting the 5-line metadata-bag addition is fully self-contained.
3. **Cache-bust check.** `qualia-shell/public/data/entities.json` is consumed via `fetch('/data/entities.json')` at runtime (no build-time embed). Browsers may cache; clear via hard-reload or service-worker drain on dev/staging. CI build modes both produce byte-identical chunk hashes (`D37sEP_1` / SHA256 `66c743…3461`), so no chunk-cache invalidation needed at the CDN layer.
4. **No CI gate flips.** Both `AppFolio Parity Gate` blocking gates (tsc-b + vitest + dual-mode vite + PII scan) passed on this branch. No flag/gate change required for revert.
5. **Branch naming.** Revert branch convention: `revert/phase-4-task-4.3-vendors-page1-closeout` for traceability.

---

**Plan v2.23 anchors this report.** Post-merge sweep will commit the v2.23 plan amendment + this report + the CDP probe artifact directory (`Docs/Baselines/phase_4_task_4_3/`) + this completion report to `main`.
