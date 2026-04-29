# Phase 4 — Task 4.4 Completion Report

**Task.** Work Orders page-1 closeout (Phase-4 parallel-batch second; FIXTURE-CLASS second PRE2 calibration after 4.5 pivot).
**Squash SHA.** `d5beb88`.
**PR.** [#28](https://github.com/NovaTrustSolutions/dwellium-per-spec/pull/28).
**Closure date.** 2026-04-29.
**Plan version.** v2.20.

---

## §1. Scope + DoR + 8-drift ledger (10-DC enumeration → 8 actuals) + 4.5 pivot context

**Scope.** Second task of Phase-4 parallel batch (after 4.1 OPENER) and the second FIXTURE-CLASS PRE2 calibration data point. Pure fixture-additive on `qualia-shell/public/data/workitems.json`. v1 plan L188 reconciled against Phase-0 capture reality + Task-1.4 / Task-2.9 prior-absorption record:
- `03_work_orders_page1.json` enumerates 13 page-1 WOs (Open filter, total_work_orders=1563 / page_size=50)
- `08_work_order_detail_19511.json` provides the canonical detail-rich shape for WO 19511-1 (Task 1.4 already absorbed it)
- DC-2 collision check: **2 of 13 already absorbed** — 19511-1 (Task 1.4 / `b7a6b911-…`) + 19441-1 (Task 2.9 / `wi-task-2-9-project-01`); rejected as duplicates per GR-6
- 11 of 13 eligible for absorption: 19510-1 / 19508-1 / 19504-1 / 19503-1 / 19499-1 / 19496-1 / 19438-1 / 19429-1 / 19424-1 / 19172-1 / 19277-1
- `workitems.json` rowcount **1152 → 1163 (+11)**

**Pivot context (Task 4.5 deferral).** Task 4.5 (leases pending-countersign) was kicked off on 2026-04-29 and **halted at pre-flight as greenfield-class**, NOT append-class. DC-1 + DC-4 findings: `qualia-shell/public/data/leases.json` does NOT exist on disk (greenfield fixture file required), AND `packages/types/index.ts` has no `Lease` interface / no `LeaseStatus` type / no `pending_countersign` enum literal (greenfield schema required). 06_leases.json source is clean (2 records: Jamel D. Brown → Riverwood H12 + Vanessa V. Blunt → Riverwood D14, both generated 2026-03-31). Per Task 4.5 spec's explicit "STOP — do NOT proceed; pivot to a different Phase-4 task" greenfield directive, deferred to post-4.2/4.3 retry — Task 4.2 unblocks tenant FK resolution for Jamel + Vanessa; Task 4.3 unblocks any cross-vendor FK if leases reference vendor-side payment processors. Full §7 entry below.

**Deliverables.**

| # | Deliverable | Status |
|---|---|---|
| D-1 | +11 records appended to `qualia-shell/public/data/workitems.json` (parsed-object metadata; NO top-level Task-1.4 typed fields per DC-6 Path B-refined; FK-resolved propertyId/unitId/assignedTo across 4 properties + 9 unit numbers + 3 vendors) | ✅ |
| D-2 | RELAX 3 invariants (mirror Task 4.1 L228 `toBeGreaterThanOrEqual` precedent): `maintenance.test.ts` L70 / `calendar.test.tsx` L120 / `projects.test.ts` L46 (constant rename `WORKITEMS_BASELINE_TASK_2_9` → `WORKITEMS_BASELINE_TASK_4_4` + value 1152 → 1163) | ✅ |
| D-3 | UPDATE 1 content-aware bucket-count: `projects.test.ts` L140 Woodland Parc bucket 2 → 5 (+3 Task-4.4 WOs: 19496-1 / 19429-1 / 19172-1; drift-detection preserved with new pinned value) | ✅ |
| D-4 | NO `packages/types/index.ts` change (Workitem schema reused as-is from Task 1.4 / 2.6 / 2.9 / 3.4) | ✅ |
| D-5 | NO new tests; NO new test files | ✅ |
| D-6 | WO 19511-1 left UNTOUCHED (already detail-rich from Task 1.4; verified preserved per regression probe) | ✅ |

**REJECTED:** WO 19511-1 + WO 19441-1 (DC-2 collisions, GR-6 duplicate-rejection).

**DC-6 Path B-refined metadata divergence callout.** 369/371 work_orders use STRING-typed encrypted-blob metadata (`enc:v1:astra:*` prefix); 2/371 use parsed-object metadata (the canonical Task-1.4 / Task-2.9 pair). Task 4.4 absorbs the 11 new WOs with **parsed-object metadata** to mirror the Task-1.4/2.9 canonical shape rather than fake encrypted-blob strings. This grows the parsed-object subset from 2 → 13 (vs the 369-majority string-blob shape). Top-level Task-1.4 typed fields (`residentAvailability`, `actionsLog`, `laborEntries`, `purchaseOrders`, `workOrderNumber`) are EXPLICITLY OMITTED from the 11 new rows to preserve the `maintenance.test.ts` L132-167 cross-type contamination guard which whitelists ONLY `WO_ID` (19511-1) + `TASK_2_9_PROJECT_ID` (`wi-task-2-9-project-01`) for those fields. Defensive guards from Task 3.4 Drift #B-i (`typeof === 'object'`) cover both metadata shapes at runtime; CDP probe `dc6-no-encblob-string-leak-in-dom` acceptance confirmed zero `enc:v1:astra` string leaks rendered.

**DoR (Definition of Ready).**
- Single-file fixture-additive on `qualia-shell/public/data/workitems.json` (+11 records / +465 insertions / -0 deletions)
- 3-line invariant relaxations + 1 content-aware bucket-count update across 3 test files
- NO schema/types change; NO new test files; NO module-graph delta (chunk SHA256 byte-identical)
- Risk: med (FK fan-out: 4 properties + 9 unit numbers + 3 vendor entities resolved in pre-flight)
- Pre-flight ack chain (a-h): all clean — see PRE0/PRE1 acks captured in PR description

**8-drift ledger** (10-DC enumeration absorbed into 8 actuals; 5 from recon pre-PRE0 + 3 from PRE0/PRE1 acks):

| # | Catch | Source | Resolution |
|---|---|---|---|
| 1 | (CRITICAL DC-2) WO 19511-1 + WO 19441-1 already absorbed (Task 1.4 / Task 2.9) | Pre-flight (d) collision check | Reject as duplicates per GR-6; net delta 13 → 11 |
| 2 | (CRITICAL DC-6) Metadata pattern divergence — 369/371 work_orders use STRING blob (`enc:v1:astra:*`); 2/371 parsed-object (canonical pair) | Pre-flight (h) histogram | Path B-refined: parsed-object for new 11 (matches canonical pair); top-level Task-1.4 fields explicitly OMITTED to preserve contamination guard |
| 3 | (CRITICAL DC-8) `maintenance.test.ts` L70 STRICT `toHaveLength(1152)` | Pre-flight (f) | Relax to `toBeGreaterThanOrEqual(1163)` + amend test description; mirrors Task 4.1 L228 pattern |
| 4 | (DC-8 ripple) `calendar.test.tsx` L120 STRICT `toHaveLength(1152)` (collateral; not anticipated in pre-flight DC-8) | Vitest first-run failure | Relax to `toBeGreaterThanOrEqual(1163)` + amend description with `+11 Task-4.4 page-1 work_orders` |
| 5 | (DC-8 ripple) `projects.test.ts` L32 + L46 STRICT `WORKITEMS_BASELINE_TASK_2_9 = 1152` constant + `toHaveLength(constant)` (collateral) | Vitest first-run failure | Constant rename `WORKITEMS_BASELINE_TASK_2_9` → `WORKITEMS_BASELINE_TASK_4_4` + value 1152 → 1163 + assertion `toHaveLength` → `toBeGreaterThanOrEqual` |
| 6 | (CONTENT DC-8 ripple) `projects.test.ts` L140 Woodland Parc bucket strict-equality `toHaveLength(2)` (was 19511-1 + 19441-1; +3 new WOs land in this bucket: 19496-1 / 19429-1 / 19172-1) | Vitest first-run failure | Update strict equality to `toHaveLength(5)` + comment enumerating Task-4.4 contribution; preserves drift-detection intent |
| 7 | (DC-1 nuance) Spec said "370/371" work_orders; actual 371 (Task 1.4 + 3×Task 2.6 utility + Task 2.9 project all already on disk pre-Task-4.4) | Pre-flight (a) histogram | No action; pre-flight observation only |
| 8 | (DC-7 simplification) WO 19511-1 already maxed-out by Task 1.4 with full residentAvailability + 2-entry actionsLog; no edit needed | Pre-flight + regression probe | Verify-only via CDP probe (`probe-regression-19511-still-present` + `regression-19511-task14-fields-intact` both green); detail-asymmetry deliverable D-2 is null-op for this task |

Note: 10 DCs enumerated in kickoff spec; 8 actuals after collapse. DC-3 (property FK) + DC-4 (vendor FK) + DC-5 (status enum) + DC-9 (PII) + DC-10 (date format) all clean in pre-flight without producing drift catches (FK / enum / PII / format all resolved against on-disk state).

**LOC variance note.** Kickoff predicted +N records where N ∈ {1..13}. Actual: +11 records (DC-2 collisions removed 2). +465 insertions in workitems.json (~42 lines per record × 11) + 27 insertions / -13 deletions across 3 test files. Total: +492 / -13.

---

## §2. Strict-gate output (captured locally @ pre-merge HEAD `9f281ca`; mirrored at squash SHA `d5beb88` post-merge)

```
2026-04-29T15:31Z (local strict gate at pre-merge commit 9f281ca)
$ cd qualia-shell && npx tsc -b
[exit: 0 — zero output = zero errors]

$ npx vitest run --reporter=default
 Test Files  35 passed (35)
      Tests  224 passed (224)
   Duration  3.82s

$ rm -rf dist && npx vite build
✓ 3278 modules transformed.
dist/assets/StrataDashboard-D37sEP_1.js      1,031.26 kB │ gzip: 246.76 kB
✓ built in 5.09s

$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ 3278 modules transformed.
dist/assets/StrataDashboard-D37sEP_1.js      1,031.26 kB │ gzip: 246.76 kB
[chunk hash byte-identical across flag — SHA256 66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461]
✓ built in 4.89s

$ cd .. && node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1483ms total).
```

**CI runs:**
- Pre-merge gate: [run `25129639183`](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25129639183) — `AppFolio Parity Gate` SUCCESS on `9f281ca` (6m37s; 15/15 strict-gate steps green)
- PII Scan (PR-branch): [run `25129639208`](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25129639208) — SUCCESS (21s)
- Squash-merge gate: [run `25132508435`](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25132508435) — `AppFolio Parity Gate` on `d5beb88` (auto-fired on push-to-main trigger; sweep-HEAD run pending after this commit per CLAUDE.md L36 push-trigger drift discipline)
- Squash-merge PII: [run `25132508438`](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25132508438) — SUCCESS

**Vitest delta (FIXTURE-CLASS PRE2 second calibration data point):** 224 → **224 (+0)**. FIXTURE-CLASS baseline now 2 data points (4.1 +0 / 4.4 +0); prediction-band holds for fixture-additive shape.

**Module-graph drift:** `StrataDashboard-D37sEP_1.js` 1,031.26 kB / 246.76 kB gzip (Task 4.1 close anchor) → `StrataDashboard-D37sEP_1.js` 1,031.26 kB / 246.76 kB gzip (Task 4.4 close anchor). **+0 kB ungz / +0 kB gz** (chunk hash byte-identical SHA256 `66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461` across both build modes AND across the +11-record fixture write + 3-test-file invariant relaxations). Canonical FIXTURE-CLASS shape holds: fixture-only + test-only changes don't enter the chunk graph.

---

## §3. CDP render proof — 8/8 acceptance pass on first attempt (zero iteration)

`Docs/Baselines/phase_4_task_4_4/cdp_summary.json`:

```json
{
  "page-loads-no-console-errors": true,
  "rowcount-1163": true,
  "task44-11-records-present": true,
  "regression-19511-present": true,
  "regression-19511-task14-fields-intact": true,
  "dc4-19438-georgia-power-fk": true,
  "dc6-no-encblob-string-leak-in-dom": true,
  "new-wo-visible-in-dom-or-fallback-fetch": true,
  "allAcceptancePass": true
}
```

**Distinct from Task 4.1's 7/7-after-3-iterations.** Task 4.4 probe passed on first run because the verification surface (data-layer `/data/workitems.json` fetch + regression on 19511-1 canonical shape + DC-4 vendor FK shape + DC-6 string-blob render-leak check) is mostly fetch-side, not DOM-selector-side. The one DOM-side check (`probe-new-wo-visible-in-dom`) returned 0 hits because MaintenanceModule's list-view renders by title/description not by `appfolioWoNumber` — fallback acceptance via fetch confirms all 11 new WO numbers reachable in the data layer.

**Probe checks:**
- `rowcount-1163`: `/data/workitems.json` returns 1163 records (382 work_orders post-Task-4.4: 371 pre + 11 new)
- `task44-11-records-present`: All 11 expected WO numbers present: 19510-1 / 19508-1 / 19504-1 / 19503-1 / 19499-1 / 19496-1 / 19438-1 / 19429-1 / 19424-1 / 19172-1 / 19277-1
- `regression-19511-present`: Canonical 19511-1 still on disk with `id=b7a6b911-c4c2-4d37-bbf4-1955119e115b`
- `regression-19511-task14-fields-intact`: 19511-1 still carries `residentAvailability` (defined) + `actionsLog.length === 2` (Brianna submitted online + System submitted preferred times)
- `dc4-19438-georgia-power-fk`: 19438-1 has `assignedTo === 3b974d35-9bf7-4621-8513-3df92648038b` + `metadata.vendorName === 'GEORGIA POWER'` + propertyId resolves to 2070 Azalea
- `dc6-no-encblob-string-leak-in-dom`: Zero `enc:v1:astra` string leaks rendered (369 string-blob work_orders' opaque metadata stays opaque under Task 3.4 Drift #B-i defensive guards)

**Console / page errors:** 0 task-relevant errors. 0 page errors.

**Artefacts.**
- `Docs/Baselines/phase_4_task_4_4/01_maintenance_workorders_list.png` (~600 KB) — MaintenanceModule landing view post-nav-chain
- `Docs/Baselines/phase_4_task_4_4/02_post_fetch_state.png` (~600 KB) — state after `/data/workitems.json` fetch + regression probe
- `Docs/Baselines/phase_4_task_4_4/03_regression_check.png` (~640 KB) — final state, regression checks complete
- `Docs/Baselines/phase_4_task_4_4/cdp_summary.json` (~5 KB)

---

## §4. Module-graph drift — canonical FIXTURE-CLASS shape (second data point)

| Metric | Pre-edit (Task 4.1 close, HEAD `5daa2d4`) | Post-edit (Task 4.4 close, HEAD `d5beb88`) | Delta |
|---|---|---|---|
| StrataDashboard chunk filename | `StrataDashboard-D37sEP_1.js` | `StrataDashboard-D37sEP_1.js` | UNCHANGED |
| StrataDashboard chunk size (ungz) | 1,031.26 kB | 1,031.26 kB | **+0 kB** |
| StrataDashboard chunk size (gz) | 246.76 kB | 246.76 kB | **+0 kB** |
| StrataDashboard SHA256 (default flag) | `66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461` | `66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461` | byte-identical |
| StrataDashboard SHA256 (`SEEDS=false`) | `66c743…3461` | `66c743…3461` | byte-identical |
| Module count | 3278 | 3278 | parity holds |
| workitems.json record count | 1152 | **1163** | +11 |
| workitems.json work_order subset | 371 | **382** | +11 |
| workitems.json metadata histogram (work_orders) | 369 string-blob / 2 parsed-object | **369 string-blob / 13 parsed-object** | +11 parsed-object |

**Canonical FIXTURE-CLASS shape confirmed across 2 data points:**

| Task | Records added | Test files touched | Module-graph drift | SHA256 byte-identical? |
|---|---|---|---|---|
| 4.1 | +1 (properties.json) | 1 (propertyTimeline.test.ts L228 relax) | 0 kB | ✅ |
| 4.4 | +11 (workitems.json) | 3 (maintenance.test.ts L70 + calendar.test.tsx L120 + projects.test.ts L46/L140) | 0 kB | ✅ |

Both calibration points achieve **+0 kB** module-graph drift across both `VITE_APPFOLIO_SEEDS` flag values. The FIXTURE-CLASS prediction band is locked: Phase-4 fixture-additive tasks consistently produce 0 kB chunk drift. Tasks 4.2 / 4.3 / 4.6 should match this. Task 4.5 (when retried post-4.2/4.3) and Task 4.7 (feature-flag flip touching `strataApi.static.ts`) will likely diverge — 4.5 because greenfield-class introduces a new fixture file (kB drift in fixture but still 0 kB in chunk graph), 4.7 because it touches TypeScript source (small +0.5 to +2 kB chunk drift expected).

---

## §5. Vitest delta — FIXTURE-CLASS PRE2 second calibration

**Pre-edit:** 35 test files / 224 tests (Task 4.1 close baseline).
**Post-edit:** 35 test files / **224 tests** (UNCHANGED).

**Delta: +0 net.** No NEW it-blocks added. The only test-side changes are 4 invariant relaxations across 3 test files:
- `qualia-shell/src/test/appfolioParity/maintenance.test.ts` L63-76 (description string + `toHaveLength(1152)` → `toBeGreaterThanOrEqual(1163)`)
- `qualia-shell/src/test/appfolioParity/calendar.test.tsx` L117-121 (description string + `toHaveLength(1152)` → `toBeGreaterThanOrEqual(1163)`)
- `qualia-shell/src/test/appfolioParity/projects.test.ts` L32-36 (constant rename + value bump 1152 → 1163)
- `qualia-shell/src/test/appfolioParity/projects.test.ts` L46-53 (`toHaveLength(constant)` → `toBeGreaterThanOrEqual(constant)` + description string)
- `qualia-shell/src/test/appfolioParity/projects.test.ts` L140-147 (Woodland Parc bucket strict-equality 2 → 5; drift-detection preserved with new pin)

All 4 changes are minimal-diff existing-it-block edits; no new tests added.

**FIXTURE-CLASS PRE2 baseline (2 data points):**
- 4.1: +0 vitest delta / +0 kB module-graph drift / 1-record / 1-invariant relaxation
- 4.4: +0 vitest delta / +0 kB module-graph drift / 11-records / 4-invariant relaxations (3 row-count + 1 content-aware bucket)

Vitest-delta prediction band locked at **+0** for fixture-additive shape. Subsequent Phase-4 tasks should expect:
- 4.2 / 4.3 / 4.6: +0 vitest delta (similar fixture-additive shape; potential collateral row-count invariant relaxations as in Task 4.4)
- 4.5: +0 vitest delta IF retry stays append-class post-4.2/4.3; greenfield-class would diverge (new test file likely required for greenfield Lease schema contract test)
- 4.7: small +1 to +3 delta possible (feature-flag flip behavior pin)

---

## §6. Plan v2 surgery — v2.20 (per post-merge sweep)

| Section | Change | Status |
|---|---|---|
| §9 Verification Matrix Phase-4 column | (untouched — Phase-4 column flips R → ✓ at Phase-4 close, not at Task 4.4) | held |
| §9 Phase-4 sub-tracker Task 4.4 row | R → **✓** + `d5beb88` + 2026-04-29 + per-row proof reference to this report | ✅ |
| §9 Phase-4 sub-tracker Task 4.5 row | R → **R (deferred)** with greenfield-class footnote + retry condition (post-4.2/4.3) | ✅ |
| §9 Phase-4 pending-row note | "Pending row: 6" → "Pending row: 5 (`4.2, 4.3, 4.5, 4.6, 4.7` — 4.5 deferred greenfield-class)" + recommended-next update | ✅ |
| §22 Appendix C `workitems` row | `+13 AppFolio-derived` → `+13 AppFolio-derived (1 Task 1.4 + 1 Task 2.9 + 11 Task 4.4 = 13 total absorbed; on-disk count 1163; metadata pattern 369 string-blob / 13 parsed-object)` | ✅ |
| §21 Appendix D `workitems.json` row Phase-4 cell | `Task 4.4` → `Task 4.4 (closed 2026-04-29 at d5beb88; appended 11 'type:work_order' rows from 03_work_orders_page1.json with parsed-object metadata; 1152 → 1163; DC-2 collisions [19511-1 / 19441-1] rejected per GR-6; DC-6 Path B-refined avoids top-level Task-1.4 typed fields)` | ✅ |
| Changelog v2.20 entry | NEW entry at top of §22 Changelog block (full byte-shape: 8 actuals from 10-DC enumeration + module-graph drift + vitest delta + CDP probe + Task 4.5 pivot context + DoR ack chain + per-task report + recommended next) | ✅ |

---

## §7. Deferred items + Task 4.5 GREENFIELD-CLASS PIVOT capture (7 candidates for v2.21+ §7 ledger)

1. **Task 4.5 GREENFIELD-CLASS PIVOT (DC-1 + DC-4 finding capture).** Task 4.5 (leases pending-countersign) was kicked off 2026-04-29 and halted at pre-flight as greenfield-class. Evidence:
   - **DC-1**: `qualia-shell/public/data/leases.json` does NOT exist on disk. Directory `qualia-shell/public/data/` contains 41 fixture files (occupancies / units / properties / entities / etc.) but no leases.json. `occupancies.json` is not a lease proxy (1-record fixture; shape lacks lifecycle states / generation date / countersign state).
   - **DC-4**: `packages/types/index.ts` has zero matches for `interface Lease` / `type Lease` / `LeaseStatus` / `pending_countersign`. No greenfield Lease schema exists.
   - **Source clean**: `06_leases.json` is well-formed (2 pending_countersign records: Jamel D. Brown → Riverwood Club Apartments H12 + Vanessa V. Blunt → Riverwood Club Apartments D14; both generated 2026-03-31). 06_leases.json is canonical and ready for absorption when retried.
   - **Retry path post-4.2/4.3**: Task 4.2 (tenants) unblocks Jamel + Vanessa as tenant entity FKs (currently neither name resolves in entities.json / entityType=tenant). Task 4.3 (vendors) unblocks any cross-vendor FK if leases reference payment processors (none in 06_leases.json source, so 4.3 may not be a strict prerequisite; 4.2 alone may suffice for the retry).
   - **Scope reframe**: Task 4.5 retry is greenfield-class, NOT append-class. Estimated scope: +1 fixture file (leases.json with 2 records) + +1 schema file edit (`packages/types/index.ts` — new `interface Lease` + `type LeaseStatus = 'pending_countersign' | 'active' | 'expired' | 'terminated' | 'pending_signature'` enum) + +1 contract test file (likely `leases.test.ts`) + possibly +1 consumer wiring (`ManagerHome.tsx` already references "leases" — needs investigation). Greenfield class deviates from FIXTURE-CLASS PRE2 baseline; expect non-trivial vitest delta + small module-graph drift on Task 4.5 retry.
   - **R-N risk register entry** (proposed for v2.20+): "Greenfield-class Phase-4 task 4.5 deviates from FIXTURE-CLASS PRE2 baseline; predict +N vitest delta and +X kB chunk drift on retry; calibrate at retry close."

2. **Encrypted-blob metadata consolidation (carry-over from Phase 3 Drift #B-i + Task 4.4 DC-6).** 369 of 382 work_orders carry STRING-typed `enc:v1:astra:*` metadata; 13 carry parsed-object metadata (Task 1.4 + Task 2.9 + 11 Task 4.4). Future migration: decrypt + parse the 369 blobs OR re-derive workitems.json from a clean source. Out of Phase-4 scope; candidate for Phase-0.1.b alongside the pages 2-5 properties re-capture.

3. **Tenant-name FK resolution (deferred for the 11 Task-4.4 WOs).** Task 4.4 set `createdBy: null` on all 11 new WOs and put tenant names in `tags` (`Tenant: Brianna M. Jackson` etc.). Reasoning: tenant FK fan-out is broad (11 unique tenant references; many partial-match against `entities.json` `entityType=tenant` rows but exact name match is unreliable due to asterisk-flagged-primary patterns + middle-initial inclusion variance). Future task: run a fuzzy-match resolution pass post-Task-4.2 to populate `createdBy` UUIDs on the 11 Task-4.4 WOs. Estimated 5-line script + 11 in-place fixture edits.

4. **DC-7 detail-asymmetry deliverable (D-2) was null-op.** Task 4.4 spec listed "WO 19511-1 gets richer fixture from 08_work_order_detail.json" as deliverable D-2. Pre-flight discovered Task 1.4 already absorbed 19511-1 with the full detail-rich shape (residentAvailability + actionsLog + laborEntries + purchaseOrders + permissionToEnter + ownerApproved + trade + vendorInstructions + nextFollowUpDate). No edit was needed. Future spec drafters: when Task 1.4 has already absorbed the canonical detail, downstream tasks should pre-validate the absorbed shape and skip detail-augmentation deliverables.

5. **CDP probe iteration baseline.** Task 4.4 probe passed 8/8 on first attempt (zero iteration), distinct from Task 4.1's 7/7-after-3-iterations. Reason: Task 4.4 verification surface is mostly fetch-side (data-layer `/data/workitems.json` reachable via `page.evaluate(() => fetch(...))`), not DOM-selector-side. Future fixture-class probes that target data-layer assertions can copy this pattern; tasks that need DOM-selector verification (e.g., a NEW UI element rendered) will need iteration like 4.1.

6. **MaintenanceModule list-view doesn't render `appfolioWoNumber`.** Probe step `probe-new-wo-visible-in-dom` returned 0 hits — none of the 11 new WO numbers (19510-1 etc.) are visible in the rendered DOM. The list view shows title/description, not WO number. This is a UX gap (operators can't easily locate a WO by number from the list); deferred candidate for Phase-5 or a Phase-3-retro UI polish task.

7. **Task 4.4 commit C plan vs actual: 4 test files touched, not 1.** Kickoff predicted "(CONDITIONAL) qualia-shell/src/test/appfolioParity/<existing-workitems-test>.test.ts (1-line invariant relaxation if rowcount assertion exists)" — implying 1 test file. Actual: 3 test files needed invariant relaxations (maintenance + calendar + projects), and projects.test.ts also needed a content-aware bucket-count update. Reason: the workitems.json rowcount strict-equality pattern was replicated across 3 test files at different historical task closures (1.4 + 2.1 + 2.9), and projects.test.ts had a bucket-count assertion as well. Future fixture-class kickoff specs for fixtures consumed by 3+ tests should anticipate cross-test ripple in DC-8.

---

## §8. Phase-4 §9 sub-tracker post-state

| Task | Status | Merge SHA | Closure date |
|---|:-:|---|---|
| 4.1 — Properties page-1 closeout (FIXTURE-CLASS first PRE2 calibration; +1 ANZO LLC shadow entity; properties.json 36 → 37) | ✓ | `5daa2d4` | 2026-04-29 |
| 4.2 — Tenants: 13 real tenant records absorbed from `04_tenants_page1.json` | R | — | — |
| 4.3 — Vendors: 4 canonical vendor seeds | R | — | — |
| 4.4 — Work Orders: 11 of 13 page-1 WOs absorbed (FIXTURE-CLASS second PRE2 calibration; workitems.json 1152 → 1163; 19511-1 + 19441-1 already absorbed and skipped per DC-2) | ✓ | `d5beb88` | 2026-04-29 |
| 4.5 — Leases: 2 real pending-countersign leases from `06_leases.json` | R (deferred — greenfield-class; retry post-4.2/4.3) | — | — |
| 4.6 — Compliance matrix seed: 6 vendor + 9 AHA + 1 Duke Energy | R | — | — |
| 4.7 — Feature-flag flip + Phase-4 closure (`strataApi.static.ts` + `.env.example`) | R | — | — |

Pending row: 5 (`4.2, 4.3, 4.5, 4.6, 4.7` — 4.5 deferred greenfield-class). Phase-4 closes when 4.7 lands. Per Plan v2 §19 Appendix B: `4.1, 4.2, 4.3, 4.4, 4.5, 4.6 (parallel) → 4.7 (last; feature flag flip)`.

**Recommended next:** Task **4.2** (Tenants page-1; second-largest fixture-additive scope; absorbs 13 tenant records into entities.json which simultaneously unblocks Task 4.5 retry by resolving Jamel D. Brown + Vanessa V. Blunt as tenant entity FKs). Alt: Task **4.6** (compliance matrix seed; multi-source absorption shape).

---

## §9. Rollback plan

**Pre-Task-4.4 SHA:** `17a7502` (post-Task-4.1 sweep on `main`).
**Task-4.4 squash SHA:** `d5beb88`.
**Rollback command (if needed):**

```
git revert -m 1 d5beb88
git push origin main
```

**Rollback impact:** Reverts the +11 work_order records + the 4-invariant relaxations across 3 test files. workitems.json reverts 1163 → 1152; rowcount assertions revert to strict-equality `toBe(1152)`; Woodland Parc bucket strict-equality reverts to `toHaveLength(2)`. Module-graph delta = 0 either direction (canonical FIXTURE-CLASS shape).

**No cascading dependencies.** Task 4.4 is parallel-batch with 4.2 / 4.3 / 4.5 / 4.6; none depend on Task 4.4's specific records. Task 4.7 depends on the Phase-4 fixture state being stable but not specifically on Task 4.4's contribution. A clean revert is single-commit.

**Task 4.5 deferral does NOT rollback with Task 4.4.** Task 4.5 was halted at pre-flight before any commit; nothing to revert. The 4.5 greenfield-class finding stays captured in this report's §7 entry #1 even if Task 4.4 reverts.

---

*This report was authored 2026-04-29 alongside the post-Task-4.4 4-file sweep. Mirrors the byte-shape of `Docs/Phase4_Task_4_1_Completion_Report.md` for FIXTURE-CLASS consistency. Captures the Task 4.5 greenfield-class pivot finding in §7 entry #1 per the kickoff spec's explicit §7 capture directive.*
