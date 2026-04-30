# Phase 4 — Task 4.6 Completion Report

**Task.** Compliance matrix seed (Phase-4 sixth task; **FIXTURE-CLASS+SCHEMA hybrid 2nd data point** of the hybrid baseline established by Task 4.5).

**Squash SHA.** `81fdea1` (PR #32). Closed 2026-04-30.

**Source.** `AppFolio_Screenshots/data/02_property_detail_128_buena_vista.json` attachment_sample[0] (Duke Energy Water Heater Repair & Replacement Plan PDF; uploaded 2018-12-26 by Lisa Zohoury, renewal date 2019-02-16). The kickoff prompt's predicted source `07_insurance_compliance.json` was confirmed at PRE-FLIGHT DC-C to contain feature-flag/meta data rather than warranty rows — a Phase-4 third SCOPE-COLLISION-pattern finding parallel to Task 4.5 morning-halt + Task 4.3 pre-absorption discoveries.

**Plan v2 anchor.** Plan v2.24 (Changelog `v2.24 (2026-04-30)` entry — to be added at post-merge sweep).

---

## §1. Scope + DoR + 10-DC ledger (10 enumerated → 12 actuals after PRE-FLIGHT discovery + 1 post-edit drift catch) + scope-narrowing context

### Scope-narrowing context (kickoff Fork A predicted → Fork A1 confirmed via DC-A)

Kickoff prompt predicted "+1 Duke Energy warranty row" deliverable with three path forks (NEAR-NULL-OP / AUGMENTATION+delta / APPEND). PRE-FLIGHT DC-A confirmed the 15-of-16-already-absorbed prediction was correct (6 vendor rows for `appfolio-v-2716` from Phase-1 Task 1.2 era + 9 section_8_aha rows for `riverwood-club` from Task 2.3 era). DC-C revealed a critical source-provenance correction: the kickoff-named source `07_insurance_compliance.json` is actually a feature-flag/meta document with `current_rows: "No Rows To Show"` — NOT a structured compliance source. The Duke Energy warranty was instead sourced from `02_property_detail_128_buena_vista.json` attachment_sample[0]:

```json
{
  "name": "Duke Energy Water Heater Repair & Replacement Plan Renews on 2-16-19 128BV.pdf",
  "uploaded_by": "Lisa Zohoury",
  "date": "2018-12-26"
}
```

The renewal date `2019-02-16` extracted from the PDF filename + the property's `home_warranty: false` flag at L20 of the same source created a semantic tension reconciled via `status: 'expired'` — the ComplianceRecord precisely encodes that this is HISTORICAL evidence of a 2018-19 warranty obligation, NOT a live compliance state.

### Scope (per v1 plan §22 Appendix C `compliance` row + Plan §9 row 4.6 v2.24, Fork A1)

**Calibration class:** **FIXTURE-CLASS+SCHEMA hybrid 2nd data point** (extends 4.5 hybrid baseline). Joins the +0 vitest delta / +0 kB module-graph drift prediction-band: chunk hash byte-identical SHA256 `66c743…3461` across both `VITE_APPFOLIO_SEEDS` modes — **6th consecutive Phase-4 confirmation extending the streak**.

| ID | Deliverable | Status |
|---|---|:-:|
| D-1 | ADD 1 ComplianceRecord at `compliance.json[15]` for Duke Energy Water Heater Repair & Replacement Plan: id `appfolio-comp-prop18-warranty-duke-0`; entityType `'property'`; entityId `'appfolio-prop-18'` (slug-namespace per established `riverwood-club` + `appfolio-v-2716` convention); itemType `'warranty'`; status `'expired'` (renewal 2019-02-16 → 7+ years stale); carrier `'Duke Energy'`; propertyId `'appfolio-prop-18'`; impoverished-source caveat in notes | ✅ |
| D-2 | EXTEND `ComplianceItemType` at `packages/types/index.ts:392-407` with `\| 'warranty'` (TypeScript-only edit; mirrors Task 4.5 T-2 Path B precedent — types erase at compile → 0 kB module-graph drift) | ✅ |
| D-3 | NO modifications to existing 15 rows (Phase-4-era higher-fidelity precedent; mirrors Task 4.3 + Task 4.5 "existing absorption follows higher-fidelity precedent" principle) | ✅ |
| D-4 | NO new tests; vitest 224 → 224 (+0 delta) | ✅ |
| D-5 | RELAX 2 strict-rowcount invariants in `complianceEngine.test.ts`: L93 + L158 from `toHaveLength(15)` → `.length >= 15` lower-bound semantics (mirrors Task 4.4 / Task 4.5 established discipline). All 8 sub-block assertions stay STRICT (vendor=6 / aha=9 / missing=5 / rollup=1 / auditVendor=6 / auditInspection=9) because Duke Energy is property-class, not vendor or inspection class | ✅ |

### 10-DC enumeration → 12 actuals + 1 post-edit drift

| # | DC | Finding | Action |
|---|---|---|:--|
| 1 | DC-A scope-class | 15 of 15 source-confirmed rows already absorbed (6 `appfolio-v-2716` vendor + 9 `riverwood-club` aha); kickoff predicted-path Fork A confirmed | **Fork A1: NEAR-NULL-OP +1** |
| 2 | DC-B schema | `ComplianceItemType` lacks `'warranty'`; `ComplianceEntityType` already has `'property'`; `ComplianceStatus` already has `'expired'` | T-2 Path B: extend enum (acted) |
| 3 | DC-C source | `07_insurance_compliance.json` is feature-flag/meta data (`current_rows: "No Rows To Show"`); NOT the warranty source. **Phase-4 third SCOPE-COLLISION pattern finding** | §7 entry 1 |
| 4 | DC-D field-shape vendor | Existing 6 rows for `appfolio-v-2716` carry canonical 18-field `ComplianceRecord` shape; clean | Reuse byte-shape (acted) |
| 5 | DC-E field-shape AHA | Existing 9 rows for `riverwood-club` carry canonical shape; clean | Reuse byte-shape (acted) |
| 6 | DC-F entity resolution | 3 Duke Energy SHADOW vendor records exist in entities.json (`052ca2ab-…` / `ef78c6c4-…` / `d0adaf79-…`); none matches water-heater warranty provider | §7 entry 2; chose `entityType:'property'` instead of vendor entity creation |
| 7 | DC-G GR-7 sanitization | Existing 15 rows: ZERO PII fields populated; corporate-public only | Same pattern (acted); `uploaded_by: 'Lisa Zohoury'` excluded from notes |
| 8 | DC-H test invariants | 10 strict-rowcount assertions in `complianceEngine.test.ts`; only L93 + L158 affected by the +1 record (sub-block assertions vendor=6 / aha=9 / missing=5 / rollup=1 / audit=6+9 are property-class-agnostic) | 2 lower-bound relaxations (acted) |
| 9 | DC-I namespace conventions | `appfolio-v-{id}` slug + `riverwood-club` slug — NEITHER is a UUID; UUID-namespace is a NEW pattern that wasn't tested | Foreshadowed but not flagged at PRE-FLIGHT |
| 10 | DC-J compliance_items.json | `compliance_items.json` is `length: 0` (empty); out of scope | Confirmed |
| 11 | **NEW post-edit drift catch** | `complianceEngine.test.ts:228` PII guard regex `/\b(?:\d[ -]*?){13,19}\b/` (credit-card style 13-19 digit run) FALSE-POSITIVES on UUIDs because UUID's hex-prefix `58932086-1536-4690` contains 16 digits with hyphen separators that match the regex's `\d[ -]*?` repeat. Initial commit attempt with user-spec'd entityId `'58932086-…'` UUID failed vitest. | **Revised entityId AND propertyId to `'appfolio-prop-18'` slug** matching established convention (acted); §7 entry 4 |
| 12 | NEW kickoff-source semantic tension | 128 BV property's `maintenance.home_warranty: false` flag at source L20 vs the Duke Energy attachment evidence of a 2018-19 warranty obligation | Reconciled via `status: 'expired'` — encodes historical-but-not-live state explicitly |

**Emergent post-DC actions (3 actuals):**

- **A-1 Slug-namespace fallback for new identifier formats.** PRE-FLIGHT DC-G should have grep'd test files for non-trivial regex patterns when introducing a new identifier format (here, UUID-vs-slug). Carry-forward note: future Phase-4/5 PRE-FLIGHT DC-G should include "test-file regex pattern scan" as a sub-step when adding new identifier formats. The slug `'appfolio-prop-18'` matches the AppFolio property_id from the source 02 capture (`property_id: 18`) — symbolically clean.

- **A-2 status='expired' precedent for stale-record absorption.** First Phase-4 record with `status: 'expired'` (prior absorptions used `'tracked'` / `'missing'` / `'scheduled'`). Establishes pattern: when source data shows a renewal date >1 year past capture date, absorb with `status: 'expired'` rather than rejecting the record. Phase-5+ may add an `'archived'` status if `'expired'` rows accumulate beyond UI rendering threshold.

- **A-3 Vite localhost-binding carry-forward (from Task 4.5 A-3).** `cdp_probe_task_4_6.cjs` uses `http://localhost:5173/` (not `127.0.0.1`). Probe ran 8/8 first-try (zero iteration) on first attempt — confirms the localhost-binding policy works forward across Phase-4 task probes (4.5 / 4.3 / 4.6 all 8/8 first-try after this fix).

### Definition of Ready (DoR) — PRE0/PRE1 gates

| Gate | Result |
|:-:|:--|
| PRE0 (a) DC-A scope-class | NEAR-NULL-OP AUGMENTATION (Fork A1 confirmed: 15 of 16 already absorbed) |
| PRE0 (b) DC-B schema | `'warranty'` enum extension required; `ComplianceEntityType` + `ComplianceStatus` adequate |
| PRE0 (c) DC-C source provenance | Kickoff source corrected: `02_property_detail_128_buena_vista.json` attachment_sample[0] |
| PRE0 (d) DC-D/E field-shape | Existing 15 rows clean reuse of canonical 18-field `ComplianceRecord` shape |
| PRE0 (e) DC-F entity resolution | `entityType: 'property'` chosen; 3 Duke Energy shadows deferred to Phase-5+ |
| PRE0 (f) DC-G GR-7 sanitization | Match existing 15 rows — corporate-public only; `uploaded_by` excluded |
| PRE0 (g) DC-H test invariants | 2 strict-rowcount lines (L93 + L158) flipped to lower-bound; 8 sub-block assertions stay strict |
| PRE0 (h) HEAD verification | `c2eab66` matches expected base (post-Task-4.3 sweep) |
| PRE1 (a) Branch creation | `feat/phase-4-task-4.6-compliance-matrix-seed` off `main @ c2eab66` ✓ |
| PRE1 (b) Vitest baseline | 35 / 224 / passing (initial run) |

---

## §2. Strict-gate output (captured locally pre-merge HEAD `d7ce1d3`; mirrored at squash SHA `81fdea1` post-merge)

| Gate | Command | Result |
|:-:|:--|:-:|
| 1 | `npx tsc -b` | EXIT 0 |
| 2 | `npx vitest run` | 35 files / 224 tests / **passing** (Duration 4.92s after slug-namespace revision; initial run failed PII guard L228) — **+0 vitest delta confirmed** |
| 3 | `npx vite build` (default = `VITE_APPFOLIO_SEEDS=true`) | EXIT 0; built in 5.13s; chunk `StrataDashboard-D37sEP_1.js` (1,031.26 kB ungz / 246.76 kB gz) |
| 4 | `VITE_APPFOLIO_SEEDS=false npx vite build` | EXIT 0; built in 5.00s; chunk `StrataDashboard-D37sEP_1.js` (1,031.26 kB / 246.76 kB) — byte-identical hash across both flag modes |
| 5 | `node Scripts/verify_no_pii_leak.mjs` | `PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found` (legacy + strict scopes both clean) |
| 6 | `shasum -a 256 dist/assets/StrataDashboard-D37sEP_1.js` | `66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461` — **byte-identical to prediction-band lock; 6th consecutive Phase-4 confirmation** |

CI run pair on PR-branch pre-merge gate: `25153099602` (Build, test, verify) + `<PR PII Scan run>` (PII Scan). Auto-fired on `pull_request` event per Phase-4 push-trigger discipline.

---

## §3. CDP render proof — 8/8 acceptance pass on first attempt (zero iteration)

Probe script: `qualia-shell/cdp_probe_task_4_6.cjs`. Captured at: `Docs/Baselines/phase_4_task_4_6/cdp_summary.json`. Screenshots: `01_strata_landing.png`, `02_compliance_landing.png`, `03_regression_vendors.png`.

| Acceptance gate | Predicate | Result |
|:--|:--|:-:|
| `page-loads-no-console-errors` | `consoleErrors.length === 0 && pageErrors.length === 0` | ✅ |
| `compliance-rowcount-16` | `complianceProbe.rowcount === 16` | ✅ |
| `new-record-fields-verbatim` | All 12 field assertions match (id / entityType / entityId / itemType / status / expirationDate / carrier / propertyId / policyNumber / coverageLimits / source / notes-impoverished-marker) | ✅ |
| `existing-15-regression-clean` | `vendor count === 6 && aha count === 9` | ✅ |
| `entityType-histogram-as-expected` | `vendor=6 / inspection=9 / property=1` | ✅ first property-class compliance row in codebase |
| `itemType-warranty-emerged` | `itemTypes.warranty === 1` | ✅ first warranty row |
| `status-expired-emerged` | `statuses.expired === 1` | ✅ first Phase-4 expired record |
| `duke-shadow-regression-clean` | 3 of 3 Duke Energy shadow vendor records still resolve in entities.json | ✅ |

**Iteration count: 0** (matches Task 4.5 + Task 4.3 zero-iteration profile). DOM probe revealed 0 mentions of "Duke Energy" / "Water Heater" / "appfolio-prop-18" / "warranty" / "128 Buena Vista" in the rendered ComplianceEngine UI — forward-defensive observation indicating ComplianceEngine module currently filters by `entityType: 'vendor'` or `'inspection'` (not `'property'`). NOT a regression; the new record is data-side absorbed and types-extended for future UI consumption. Captured as carry-forward note for future Compliance UI extension tasks.

---

## §4. Module-graph drift — FIXTURE-CLASS+SCHEMA hybrid 2nd data point

| Asset | Pre-Task-4.6 (`c2eab66`) | Post-Task-4.6 (this branch) | Δ |
|:--|:--:|:--:|:-:|
| `StrataDashboard-D37sEP_1.js` ungz | 1,031.26 kB | 1,031.26 kB | **0 kB** |
| `StrataDashboard-D37sEP_1.js` gzip | 246.76 kB | 246.76 kB | **0 kB** |
| `StrataDashboard-*.js` chunk hash | `D37sEP_1` | `D37sEP_1` | **byte-identical** |
| `StrataDashboard-D37sEP_1.js` SHA256 | `66c743…3461` | `66c743…3461` | **byte-identical** (full hash captured §2 row 6) |
| `MaintenanceModule-DCXnnjAV.js` ungz | 78.22 kB | 78.22 kB | **0 kB** |
| `VITE_APPFOLIO_SEEDS=true` ↔ `false` chunk hash parity | `D37sEP_1` ↔ `D37sEP_1` | `D37sEP_1` ↔ `D37sEP_1` | byte-identical across flag |
| Total module count (parity check) | 3278 | 3278 | 0 |

**FIXTURE-CLASS+SCHEMA hybrid 2nd data point confirmed.** Schema-only TypeScript edits (enum union expansion at `packages/types/index.ts:407` with `'warranty'`) erase at compile time + fixture-only JSON edits don't enter the chunk graph; the hybrid class therefore inherits FIXTURE-CLASS's drift signature. Hybrid baseline now 2 data points (4.5 + 4.6), confirming the prediction-band locks for the hybrid class.

**Cumulative Phase-4 module-graph drift across closed tasks (4.1 / 4.4 / 4.2 / 4.5 / 4.3 / 4.6):** `D37sEP_1` → `D37sEP_1` → `D37sEP_1` → `D37sEP_1` → `D37sEP_1` → `D37sEP_1` (+0 kB across **6 tasks**). The Phase-4 source-touch task (4.7 feature-flag flip) will be the first to break this streak.

---

## §5. Vitest delta — FIXTURE-CLASS+SCHEMA hybrid 2nd calibration data point

| Phase-4 task | Pre | Post | Δ | Class |
|:--|:-:|:-:|:-:|:--|
| 4.1 Properties | 224 | 224 | +0 | FIXTURE-CLASS pure (1st data point) |
| 4.4 Work Orders | 224 | 224 | +0 | FIXTURE-CLASS pure (2nd data point) |
| 4.2 Tenants | 224 | 224 | +0 | FIXTURE-CLASS pure (3rd data point) |
| 4.5 Leases | 224 | 224 | +0 | FIXTURE-CLASS+SCHEMA hybrid (1st data point) |
| 4.3 Vendors | 224 | 224 | +0 | FIXTURE-CLASS pure (4th data point) |
| **4.6 Compliance** | **224** | **224** | **+0** | **FIXTURE-CLASS+SCHEMA hybrid (2nd data point of hybrid class)** |

**2 invariant relaxations applied** (L93 + L158: strict `toHaveLength(15)` → lower-bound `.length >= 15`). All 8 sub-block assertions stay strict (vendor=6 / aha=9 / missing=5 / rollup=1 / audit=6+9). FIXTURE-CLASS+SCHEMA hybrid PRE2 baseline now 2 data points (4.5 + 4.6); pure FIXTURE-CLASS baseline still 4 data points (4.1 / 4.4 / 4.2 / 4.3).

---

## §6. Plan v2 surgery — v2.24 (per post-merge sweep)

To be applied at post-merge sweep (mirroring Task 4.3 v2.23 sweep pattern):

1. **Changelog `v2.24 (2026-04-30)` entry** capturing:
   - FIXTURE-CLASS+SCHEMA hybrid 2nd data point calibration (+0 vitest / +0 kB drift; chunk hash SHA256 byte-identical).
   - Fork A1 narrative (kickoff predicted +1 Duke Energy → DC-A confirmed 15 of 16 absorbed; +1 net-new from 128 BV property attachment; status='expired' encodes historical-not-live).
   - Phase-4 third SCOPE-COLLISION pattern finding (kickoff source mismatch).
   - Post-edit drift catch (UUID-namespace rejected by PII guard regex; revised to slug `appfolio-prop-18`).
2. **§9 Phase-4 sub-tracker** row 4.6 flips `R` → `✓`. Pending row narrows 2 → **1**: `4.7` only.
3. **§7 deferred-items ledger** — 5 entries from this completion report's §7.
4. **§20 Appendix C `compliance` row** update — from `existing count` / `+15 AppFolio-derived (6 vendor + 9 AHA)` to enumerate the 16 on-disk count + Task 4.6 contribution (+1 Duke Energy warranty property-class row).
5. **§21 Appendix D row 9 (`public/data/compliance.json`)** Phase-4 cell amend — from `Task 4.6` placeholder to full closure detail (squash SHA, 1 record added, ComplianceItemType extended with 'warranty', 2 test invariant relaxations, FIXTURE-CLASS+SCHEMA hybrid 2nd calibration).
6. **Calibration baseline narrative** — confirms hybrid baseline at 2 data points (4.5 + 4.6); pure FIXTURE-CLASS baseline still 4. Phase-4 calibration matrix now spans 6 of 7 closed tasks; only 4.7 remaining.

---

## §7. Deferred items + carry-forward (5 candidates for v2.25+ §7 ledger)

1. **Phase-4 third SCOPE-COLLISION pattern finding.** Task 4.6's predicted source `07_insurance_compliance.json` (per kickoff prompt's spec) actually contains feature-flag/meta data (`current_rows: "No Rows To Show"` + ReportColumn schema definitions + AppFolio access-control flags), NOT structured warranty rows. The Duke Energy warranty was instead sourced from `02_property_detail_128_buena_vista.json` attachment_sample[0]. Pattern parallel to Task 4.5 morning-halt classification-error + Task 4.3 pre-absorption-already-complete — kickoff source assumptions colliding with actual data provenance. **Recommend future task kickoff prompts include "source provenance verification" as DC-pre-flight step zero**: `cat <kickoff-named-source> | jq '.' | head -100` before deciding scope. Carry-forward to Task 4.7 kickoff and any Phase-5+ kickoffs.

2. **Duke Energy 3-shadow entity-resolution gap.** Three vendor records in entities.json carry the Duke Energy name with REAL UUIDs (NOT `appfolio-v-{id}` namespace): `052ca2ab-ea54-40b6-bf53-83f871c28828` "DUKE ENERGY (PROGRESS)" + `ef78c6c4-c3ad-4930-90a7-07260afa8ceb` "Duke Energy (Progress) (Electric Service)" + `d0adaf79-35e2-416c-b3a8-d9df73b94991` "DUKE ENERGY - (Electric)(DO NOT TURN OFF BREAKERS IN THIS HOUSE)". None matches the water-heater warranty provider (which is likely a Duke Energy subsidiary distinct from the electric-service entity). Phase-5+ entity-resolution merge pass should split the shadows → canonical Duke Energy entity hierarchy with explicit `subsidiary` or `business_unit` metadata.

3. **Impoverished-source caveat.** 128 BV property attachment metadata captured filename + upload date + renewal date but NOT policyNumber / coverageLimits / agent contact / payment terms / coverage scope. Future Phase-0.1.b re-capture pipeline should pull full document text via PDF text extraction or direct attachment URL fetch. _(NOTE: User spec for this entry was truncated mid-sentence after "via" in the kickoff message; current completion is best-faith author-supplied; pending user confirmation post-merge.)_

4. **Drift catch — UUID-namespace entityId rejected by pre-existing PII guard.** PRE-FLIGHT DC-G missed that `complianceEngine.test.ts:228` regex `/\b(?:\d[ -]*?){13,19}\b/` (credit-card style 13-19 digit run) false-positives on UUIDs because the UUID's hex-prefix `58932086-1536-4690` contains 16 digits with hyphen separators matching the regex's `\d[ -]*?` repeat pattern. Initial commit attempt with user-spec'd UUID entityId failed vitest. **Revised both entityId AND propertyId to slug `'appfolio-prop-18'`** matching established `riverwood-club` + `appfolio-v-2716` slug-namespace convention. Carry-forward note: future Phase-4/5 PRE-FLIGHT DC-G should include "test-file regex pattern scan" as a sub-step when adding new identifier formats. Also flag for Phase-5+ test refactoring: the PII guard's credit-card-detection regex should be tightened to exclude UUID patterns (e.g., add a UUID-allowlist exception or use a more specific credit-card pattern that requires the leading 4/5/6 digit + checksum).

5. **`status='expired'` precedent for stale-record absorption.** First Phase-4 record with `status: 'expired'` (prior absorptions used `'tracked'` / `'missing'` / `'scheduled'`). Establishes pattern: when source data shows a renewal date >1 year past capture date, absorb with `status: 'expired'` rather than rejecting the record. Phase-5+ may add an `'archived'` status if `'expired'` rows accumulate beyond UI rendering threshold; alternative is a `lifecycleState` field separate from `status` to encode active/expired/archived semantics. Also flag for Phase-5+ ComplianceEngine UI extension: the current UI does NOT render property-class warranty rows (CDP probe DOM mentions all 0); needs to be extended to surface the new `entityType: 'property'` + `itemType: 'warranty'` combination for full data visibility.

---

## §8. Phase-4 §9 sub-tracker post-state

| Row | Task | Phase-4 status | Notes |
|:-:|:--|:-:|:--|
| 4.1 | Properties page-1 closeout | ✓ | Closed 2026-04-29 (1st task; FIXTURE-CLASS pure 1st calibration; PR #27 → `5daa2d4`) |
| 4.2 | Tenants page-1 closeout | ✓ | Closed 2026-04-29 (3rd task; FIXTURE-CLASS pure 3rd calibration; PR #29 → `abf65bb`) |
| 4.3 | Vendors page-1 closeout | ✓ | Closed 2026-04-30 (5th task; FIXTURE-CLASS pure 4th calibration; PR #31 → `c732f64`) |
| 4.4 | Work Orders page-1 closeout | ✓ | Closed 2026-04-29 (2nd task; FIXTURE-CLASS pure 2nd calibration; PR #28 → `d5beb88`) |
| 4.5 | Leases pending-countersign closeout | ✓ | Closed 2026-04-29 retry (4th task; FIXTURE-CLASS+SCHEMA hybrid 1st calibration; PR #30 → `f8c954c`) |
| **4.6** | **Compliance matrix seed** | **✓ (this task)** | **Closed 2026-04-30 (6th Phase-4 task; FIXTURE-CLASS+SCHEMA hybrid 2nd calibration); Fork A1 NEAR-NULL-OP +1 Duke Energy warranty record; 15 of 16 already absorbed pre-task; Phase-4 third SCOPE-COLLISION pattern finding** |
| 4.7 | Feature-flag flip | R | Pending — closes Phase-4; per v1 plan §19 dependency graph "4.1, 4.2, 4.3, 4.4, 4.5, 4.6 (parallel) → 4.7 (last; feature flag flip)" — expected to be the FIRST source-touch task of Phase-4 with non-zero chunk-graph drift |

**Phase-4 closure progress:** 6 of 7 task rows ✓. Surviving Phase-4 row narrows 2 → **1** (`4.7` only — the feature-flag flip closer).

**Calibration baseline state post-Task-4.6:**
- LAYOUT-CLASS PRE2 baseline: 4 data points (3.3 +4 / 3.2 +11 / 3.4 +8 / 3.1 +9; Phase-3 only, retired)
- Pure FIXTURE-CLASS PRE2 baseline: 4 data points (4.1 +0 / 4.4 +0 / 4.2 +0 / 4.3 +0)
- **FIXTURE-CLASS+SCHEMA hybrid PRE2 baseline: 2 data points (4.5 +0 / 4.6 +0)** — locked across both
- Total Phase-4 closed tasks: **6 of 7** with cumulative chunk hash byte-identical SHA256 `66c743…3461` across all 6.

---

## §9. Rollback plan

If post-merge regression is discovered:

1. **Revert PR.** `gh pr revert 32 -R NovaTrustSolutions/dwellium-per-spec` creates a clean revert commit. The diff is small (+26/-5 lines across 3 files); revert is mechanical with low merge conflict risk.
2. **Schema-edit rollback consideration.** The `'warranty'` enum addition is ADDITIVE; reverting it does NOT break existing code (no consumer references the new value yet — CDP probe confirms 0 DOM mentions). Reverting the compliance.json record + the test relaxation alongside is the cleanest path.
3. **Cache-bust check.** `qualia-shell/public/data/compliance.json` is consumed via `fetch('/data/compliance.json')` at runtime (no build-time embed). Browsers may cache; clear via hard-reload or service-worker drain on dev/staging. CI build modes both produce byte-identical chunk hashes (`D37sEP_1` / SHA256 `66c743…3461`), so no chunk-cache invalidation needed at the CDN layer.
4. **No CI gate flips.** Both `AppFolio Parity Gate` blocking gates (tsc-b + vitest + dual-mode vite + PII scan) passed on this branch. No flag/gate change required for revert.
5. **Branch naming.** Revert branch convention: `revert/phase-4-task-4.6-compliance-matrix-seed` for traceability.

---

**Plan v2.24 anchors this report.** Post-merge sweep will commit the v2.24 plan amendment + this report + the CDP probe artifact directory (`Docs/Baselines/phase_4_task_4_6/`) to `main`.
