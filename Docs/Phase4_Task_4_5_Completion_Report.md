# Phase 4 — Task 4.5 Completion Report

**Task.** Leases pending-countersign closeout (Phase-4 fourth task; FIXTURE-CLASS+SCHEMA hybrid — FIRST data point of new calibration class).

**Squash SHA.** `f8c954c` (PR #30; full SHA `f8c954c3fa0ee749c99bf46db5b28dc1ee0b7fdc`). Closed 2026-04-29 (retry; original kickoff halted at pre-flight 2026-04-29 morning as greenfield-class — see §1 pivot context).

**Source.** `AppFolio_Screenshots/data/06_leases.json` (2 pending_countersign records: Jamel D. Brown* / Riverwood H12 / 2026-03-31 17:58 + Vanessa V. Blunt* / Riverwood D14 / 2026-03-31 17:24).

**Plan v2 anchor.** Plan v2.22 (Changelog `v2.22 (2026-04-29)` entry — to be added at post-merge sweep).

---

## §1. Scope + DoR + 11-drift ledger (14-DC enumeration → 11 actuals after PRE0 scope-class flip) + retry context

### Pivot context (greenfield-class → FIXTURE-CLASS+SCHEMA hybrid retry)

Original 2026-04-29 morning kickoff halted at pre-flight as greenfield-class (DC-1 + DC-4 of the original prompt: `qualia-shell/public/data/leases.json` does NOT exist; `packages/types/index.ts` has no `Lease` interface or `LeaseStatus` enum). Deferred and pivoted to Task 4.4 same day.

The 2026-04-29 evening retry began with a **decisive PRE0 scope-class flip**: DC-A counted **556 lease workitems already in `qualia-shell/public/data/workitems.json`** (per `WorkitemType = '… | lease | …'` at `packages/types/index.ts:21`). Path forward: **append 2 lease workitems to existing fixture**, NOT create a new `leases.json` greenfield artifact. The morning halt's classification was incomplete — it correctly observed `leases.json` absence but missed the existing `type: 'lease'` workitem subset in the canonical workitem fixture.

The 2026-04-29 evening retry also leveraged Task 4.2's CRITICAL post-CDP DC-EMERGENT finding (the "Task 4.5 unblock-status FLIP" at Plan v2.21): both target tenant FKs already resolve in `entities.json` from Phase-1 era under different name formats:

- **Jamel Brown\*** → tenantId `8d79d391-1ea6-4a69-826c-f7351e587691` (Riverwood H12, status active, source `google-sheets-resident-directory`)
- **Blunt, Vanessa V.** → tenantId `0e9213db-78db-4f92-8bf9-933a85562cec` (Riverwood D14, status active, source `appfolio_csv`, metadata.propertyId already linked to Riverwood)

### Scope (per v1 plan L189 + Plan §9 row 4.5 v2.22)

**Calibration class:** FIXTURE-CLASS+SCHEMA hybrid — FIRST data point. Distinct from pure FIXTURE-CLASS (4.1 / 4.4 / 4.2) because the JSON-fixture append is paired with a TypeScript-only schema-enum addition (`pending_countersign` to `WorkitemStatus`). The schema edit is types-only (erased at compile), so module-graph drift remains 0 kB.

| ID | Deliverable | Status |
|---|---|:-:|
| D-1 | ADD 2 pending_countersign lease workitems to `qualia-shell/public/data/workitems.json` (1163 → 1165) with FULL FK resolution (T-1 PATH B): `propertyId` / `unitId` / `metadata.tenantId` populated | ✅ |
| D-2 | ADD `'pending_countersign'` to `WorkitemStatus` enum at `packages/types/index.ts:22` (T-2 PATH B; new value distinct from existing 9 values) | ✅ |
| D-3 | NO new fixture file (no `leases.json` creation; would have been greenfield-class deliverable) | ✅ |
| D-4 | NO new test file (no `leases.test.ts` creation; existing strict-rowcount tests already at `≥1163`) | ✅ |
| D-5 | NO static handler addition in `strataApi.static.ts` (DC-L: `useLeases()` hook at `useStrataQueries.ts:165` is dead code with 0 src/ consumers) | ✅ |
| D-6 | NO retroactive migration of existing 554 leases (T-2 PATH A; Tracy W. Terry exemplar `bb7a7cec-…` preserved at `status='completed'` — semantic error flagged for Phase-5+ cleanup in §7) | ✅ |
| D-7 | NO test invariant relaxation needed — 3 strict-rowcount tests already at `≥1163` (`maintenance.test.ts:76` + `projects.test.ts:48` + `calendar.test.tsx:121`); +2 → 1165 still passes | ✅ verified at PRE0 DC-D + Gate 2 vitest |

### 14-DC enumeration → 11 actuals

| # | DC | Finding | Action |
|---|---|---|:--|
| 1 | DC-A scope-class | 556 lease workitems already in `workitems.json`; greenfield classification was wrong | **DECISIVE FLIP** to FIXTURE-CLASS+SCHEMA hybrid |
| 2 | DC-A.1 status histogram | 549 open / 3 completed / 2 in_progress / 2 review; ZERO `pending_countersign` | T-2 PATH B: add new enum value (acted) |
| 3 | DC-A.2/3 FK collision | Jamel + Vanessa have 0 lease workitems linked via `tenantId` (trivially 0 because no existing lease has a `tenantId` field at all) | Confirms zero collision; proceed with T-1 PATH B |
| 4 | DC-A.4 status existence | 0 records use `pending_countersign` anywhere | First-instance status; `WorkitemStatus` enum edit required |
| 5 | DC-B enum check | Existing union: `'open' \| 'in_progress' \| 'review' \| 'completed' \| 'cancelled' \| 'on_hold' \| 'pending' \| 'resolved' \| 'tenant_signoff'`; `'pending_countersign'` NOT present | Schema edit at `packages/types/index.ts:22` (acted) |
| 6 | DC-C byte-shape exemplar | Tracy W. Terry record `bb7a7cec-…`: `propertyId: null` / `unitId: null` / **no `tenantId` field at all** / parsed-object metadata / **top-level `status: 'completed'`** despite source `metadata.appFolioStatus: 'Ready to Countersign'` | T-1 PATH B divergence intentional; T-2 semantic-error preserved (§7 entry) |
| 7 | DC-D rowcount tests | 3 strict-rowcount tests already at `≥1163`: `maintenance.test.ts:76`, `projects.test.ts:48`, `calendar.test.tsx:121` | +2 → 1165 passes without further relaxation (verified at Gate 2) |
| 8 | DC-E name match | 15 lease titles match Jamel/Brown/Vanessa/Blunt = 5 base titles × 3 duplicates each. Closest near-match: `"H12 Jamal Brown Incident Report 8/15/23"` (note **Jamal vs Jamel**, and **incident report not lease**) | T-3 + T-4 §7 entries; no FK collision; no scope impact |
| 9 | DC-F.1 metadata heterogeneity | 550 lease records have **string-typed encrypted-blob metadata** (`enc:v1:astra:*`); only 6 are parsed-object | Same heterogeneity as Task 4.4 DC-6; CDP probe carries the no-blob-leak guard forward |
| 10 | DC-F.2 FK coverage | **0 of 556 existing leases have FK resolution** (all `propertyId=null` AND `unitId=null`) | T-1 PATH B 2-of-2 records establish FIRST FK-resolved lease byte-shape (intentional divergence per scope decision) |
| 11 | DC-G source | 2 records confirmed in `06_leases.json`: Jamel D. Brown* / H12 / 2026-03-31 17:58 + Vanessa V. Blunt* / D14 / 2026-03-31 17:24, both `"Ready to Countersign"` | Source provenance verified; T-5 §7 entry (existing 554 came from a different absorption pass) |
| 12 | DC-H/I/J/K FK targets | Riverwood `705a6f52-…` ✓ / H12 `bb4b68dc-…` (1BR/occupied) ✓ / D14 `1cf0d2c5-…` (2BR/occupied) ✓ / Jamel `8d79d391-…7691` ✓ name `"Jamel Brown*"` / Vanessa `0e9213db-…2cec` ✓ name `"Blunt, Vanessa V."` (metadata.propertyId already linked to Riverwood) | All FK targets verified existent; proceed with T-1 PATH B as planned |
| 13 | DC-L /leases consumer | `useLeases()` defined at `useStrataQueries.ts:165` but **0 consumers in src/** — dead hook | Static-handler scope eliminated; lease records flow through existing workitem-based modules via `workitems.json` |
| 14 | DC-M vitest baseline | 35 files / 224 tests / passing / ~3.79s | Confirms `c8cc568` pre-Task-4.5 state (matches CLAUDE.md `Vitest 215 → 224` from Task 3.1) |

**Emergent post-DC actions (4 actuals beyond the DC table):**

- **A-1 `tenantId` placement decision.** `Workitem` interface at `packages/types/index.ts:293` does NOT have a top-level `tenantId` field. Rather than expand the typed surface for a lease-specific concern, placed `tenantId` in `metadata.tenantId` (matches the flexible-metadata pattern for lease-domain data; precedent-respecting). Cross-task check: ZERO existing workitems use `metadata.tenantId` — first instance of this field across all 1163 prior records.
- **A-2 Tag convention decision.** Mirrored Tracy W. Terry exemplar's 3 tags exactly: `["appfolio_source", "countersign", "lease"]`. Did NOT add a `"source: appfolio-task-4-5"` traceability tag (which would have followed Task 4.4 convention of `"source: appfolio-task-4-4"`) because the lease absorption tradition (Tracy pattern) uses `appfolio_source` underscore-tag while the Task-4.4 work-order tradition uses `source: appfolio-task-4-4` colon-tag — combining both would introduce a third pattern. Instead added `metadata.absorbedBy: "phase4_task_4_5"` for traceability without altering tag semantics.
- **A-3 Vite localhost-binding quirk.** Initial probe used `http://127.0.0.1:5173/` (matching task_4_4 pattern) but Vite 6.4.2 in this environment binds only to `localhost`, not `127.0.0.1`. Probe edited to use `http://localhost:5173/`. Carry-forward note for future Phase-4/5 tasks: prefer `localhost` over `127.0.0.1` to avoid IPv6/IPv4 binding ambiguity.
- **A-4 Tenant name format mismatch (cosmetic).** Source 06_leases.json has names `"Jamel D. Brown*"` and `"Vanessa V. Blunt*"` (with middle initial + asterisk). Existing entities.json records (linked via FK) use `"Jamel Brown*"` (no middle initial) and `"Blunt, Vanessa V."` (last-first format). The 2 new lease records preserve the source 06_leases.json name format in `metadata.applicantName`; the FK linkage via `metadata.tenantId` resolves to the entities.json formats. No reconciliation needed — these are display-time concerns, not data-integrity concerns.

### Definition of Ready (DoR) — PRE0/PRE1 gates

| Gate | Result |
|:-:|:--|
| PRE0 (a) DC-A scope-class | FIXTURE-CLASS+SCHEMA hybrid (greenfield ruled out) |
| PRE0 (b) DC-H/I/J/K FK targets | All 5 FK targets verified existent in respective fixtures |
| PRE0 (c) DC-L static-handler scope | useLeases is dead code — no handler addition needed |
| PRE0 (d) DC-D test-invariant scan | 3 strict tests already at ≥1163; +2 → 1165 passes without further edits |
| PRE0 (e) HEAD verification | `c8cc568` matches expected base |
| PRE0 (f) Working tree | Untracked artifacts only (Docs/Baselines/* + cdp_probe_*.cjs + AGENTS.md — pre-existing, not gitignored, never committed by prior tasks; left alone) |
| PRE1 (a) Branch creation | `feat/phase-4-task-4.5-leases-pending-countersign-retry` off `main @ c8cc568` ✓ |
| PRE1 (b) UUID generation | 2 fresh UUIDs: Jamel `6753c272-fe6a-484c-9314-fe5ffda438d5` / Vanessa `65d4d4f4-7ef6-4b35-91f4-9f609783faac` |
| PRE1 (c) Vitest baseline | 35 / 224 / passing |

---

## §2. Strict-gate output (captured locally pre-merge HEAD `3cb601d`; mirrored at squash SHA `f8c954c` post-merge)

| Gate | Command | Result |
|:-:|:--|:-:|
| 1 | `npx tsc -b` | EXIT 0 |
| 2 | `npx vitest run` | 35 files / 224 tests / **passing** (Duration 4.11s) — **+0 vitest delta confirmed** |
| 3 | `npx vite build` (default = `VITE_APPFOLIO_SEEDS=true`) | EXIT 0; built in 5.15s; chunk `StrataDashboard-D37sEP_1.js` (1,031.26 kB ungz / 246.76 kB gz) |
| 4 | `VITE_APPFOLIO_SEEDS=false npx vite build` | EXIT 0; built in 4.84s; chunk `StrataDashboard-D37sEP_1.js` (1,031.26 kB / 246.76 kB) — byte-identical hash across both flag modes |
| 5 | `node Scripts/verify_no_pii_leak.mjs` | `PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found` (legacy + strict scopes both clean) |

**Net diff stats** (`git diff --stat`):
```
 packages/types/index.ts                 |  2 +-
 qualia-shell/public/data/workitems.json | 88 +++++++++++++++++++++++++++++++++
 2 files changed, 89 insertions(+), 1 deletion(-)
```

The 88 insertions = 2 new lease records × 44 lines each (parsed-object metadata + 30+ workitem fields at 2-space indent).

---

## §3. CDP render proof — 9/9 acceptance pass on first attempt (zero iteration)

Probe script: `qualia-shell/cdp_probe_task_4_5.cjs`. Captured at: `Docs/Baselines/phase_4_task_4_5/cdp_summary.json`. Screenshots: `01_strata_landing.png`, `02_post_fetch_state.png`, `03_regression_check.png`.

| Acceptance gate | Predicate | Result |
|:--|:--|:-:|
| `page-loads-no-console-errors` | `consoleErrors.length === 0 && pageErrors.length === 0` | ✅ |
| `rowcount-1165` | `fetchProbe.rowcount === 1165` | ✅ |
| `pending-countersign-count-2` | `fetchProbe.pendingCountersignCount === 2` | ✅ (`Lease: Jamel D. Brown* — H12` + `Lease: Vanessa V. Blunt* — D14`) |
| `jamel-record-found-with-fk` | `id+status+propertyId+unitId+metadata.tenantId all match expected` | ✅ |
| `vanessa-record-found-with-fk` | `id+status+propertyId+unitId+metadata.tenantId all match expected` | ✅ |
| `t2-tracy-not-retro-migrated` | `tracy.status === 'completed' && tracy.propertyId === null && tracy.unitId === null` | ✅ (Path A no-retro-migration verified at runtime) |
| `lease-histogram-as-predicted` | `549 open / 3 completed / 2 in_progress / 2 review / 2 pending_countersign` | ✅ exact match |
| `fk-targets-all-resolve` | H12 / D14 / Jamel / Vanessa / Riverwood all resolve in fixtures via fetch | ✅ |
| `dc6-no-encblob-string-leak-in-dom` | DOM textContent contains 0 occurrences of `enc:v1:astra:` | ✅ (carry-forward from Task 4.4 DC-6) |

**Iteration count: 0** (matches Task 4.4's zero-iteration profile; distinct from Task 4.1's 3-selector-iteration profile and Task 4.2's 1-guard-flip-iteration profile). The localhost-binding edit (`A-3` above) was a one-time pre-probe correction, not an iteration on probe content. Final lease subset count rendered at runtime: **558** (was 556, +2).

---

## §4. Module-graph drift — FIXTURE-CLASS+SCHEMA hybrid first data point

| Asset | Pre-Task-4.5 (`c8cc568`) | Post-Task-4.5 (this branch) | Δ |
|:--|:--:|:--:|:-:|
| `StrataDashboard-D37sEP_1.js` ungz | 1,031.26 kB | 1,031.26 kB | **0 kB** |
| `StrataDashboard-D37sEP_1.js` gzip | 246.76 kB | 246.76 kB | **0 kB** |
| `StrataDashboard-*.js` chunk hash | `D37sEP_1` | `D37sEP_1` | **byte-identical** |
| `MaintenanceModule-DCXnnjAV.js` ungz | 78.22 kB | 78.22 kB | **0 kB** |
| `VITE_APPFOLIO_SEEDS=true` ↔ `false` chunk hash parity | `D37sEP_1` ↔ `D37sEP_1` | `D37sEP_1` ↔ `D37sEP_1` | byte-identical across flag |
| Total module count (parity check) | 3278 | 3278 | 0 |

**FIXTURE-CLASS+SCHEMA hybrid prediction confirmed**: TypeScript-only schema edits (enum union expansion at `packages/types/index.ts:22`) are erased at compile time and produce zero chunk-graph drift, identical to pure FIXTURE-CLASS (data-only changes). The hybrid class therefore inherits FIXTURE-CLASS's `+0 kB` drift signature. Future Phase-4/5 hybrid-class tasks should expect the same shape unless the schema edit is paired with runtime usage changes (e.g., a new branch in module rendering that consumes the new enum value).

**Cumulative Phase-4 module-graph drift across closed tasks (4.1 / 4.4 / 4.2 / 4.5):** `D37sEP_1` → `D37sEP_1` → `D37sEP_1` → `D37sEP_1` (+0 kB across 4 tasks). The Phase-4 source-touch task (4.7 feature-flag flip) will be the first to break this streak.

---

## §5. Vitest delta — FIXTURE-CLASS+SCHEMA hybrid first calibration data point

| Phase-4 task | Pre | Post | Δ | Class |
|:--|:-:|:-:|:-:|:--|
| 4.1 Properties | 224 | 224 | +0 | FIXTURE-CLASS (1st data point) |
| 4.4 Work Orders | 224 | 224 | +0 | FIXTURE-CLASS (2nd data point) |
| 4.2 Tenants | 224 | 224 | +0 | FIXTURE-CLASS (3rd data point) |
| 4.5 Leases | 224 | 224 | +0 | **FIXTURE-CLASS+SCHEMA hybrid (1st data point)** |

The hybrid class behaves identically to pure FIXTURE-CLASS for vitest delta because:
1. The enum addition is types-only — no runtime change to consume the new value.
2. The 3 strict-rowcount tests already shifted to `≥1163` lower-bound semantics during Task 4.4; +2 records to 1165 passes the same lower-bound assertion without further test surgery.
3. The lease-subset behavior was already covered by the propertyTimeline-style tests with `≥` semantics (Task 4.1 era), so adding 2 leases doesn't trip any strict equality.

**No invariant relaxations needed** for Task 4.5 (distinct from Task 4.4 which needed 4 relaxations across 3 files, and Task 4.2 which needed 1 dual-line relaxation in `sentiment.test.ts`).

---

## §6. Plan v2 surgery — v2.22 (per post-merge sweep)

To be applied at post-merge sweep (mirroring Task 4.2 v2.21 sweep pattern):

1. **Changelog `v2.22 (2026-04-29)` entry** capturing:
   - FIXTURE-CLASS+SCHEMA hybrid first data point calibration (+0 vitest / +0 kB drift).
   - Greenfield → FIXTURE-CLASS+SCHEMA scope-class flip narrative (DC-A 556 lease workitems pre-existing).
   - T-1 PATH B FK divergence vs prior 554 byte-shape (intentional, documented).
   - T-2 PATH B status semantic divergence (Tracy W. Terry preserved as Phase-5+ data-quality flag).
2. **§9 Phase-4 sub-tracker** row 4.5 flips `R` → `✓`. Pending row narrows 4 → 3: `4.3, 4.6, 4.7`.
3. **§7 deferred-items ledger** — 5 entries from this completion report's §7.
4. **Appendix D** — NO row updates required. `workitems.json` was pre-allocated to row 7 Phase-4 cell at v2.18 era (Task 4.4 amendment); v2.22 amends that cell to enumerate Task 4.5's contribution (`+2 lease workitems with full FK resolution; introduces `pending_countersign` status`).
5. **Calibration baseline narrative** — adds the first FIXTURE-CLASS+SCHEMA hybrid data point alongside the existing 4-data-point LAYOUT-CLASS baseline (3.3/3.2/3.4/3.1) and 3-data-point pure-FIXTURE-CLASS baseline (4.1/4.4/4.2). Phase-4 calibration matrix now has 2 distinct classes (FIXTURE / FIXTURE+SCHEMA) with predictive prediction-bands locked at `+0 vitest / +0 kB drift` for both.

---

## §7. Deferred items + carry-forward (5 candidates for v2.23+ §7 ledger)

1. **Tracy W. Terry semantic-error flag** (T-2 PATH A preservation). Lease workitem `bb7a7cec-7c32-43ed-983f-63ea553d6325` carries source `metadata.appFolioStatus: 'Ready to Countersign'` but top-level `status: 'completed'` — semantically incorrect (a "Ready to Countersign" lease has not yet been countersigned, so its workflow state is NOT `completed`). Phase-4 Task 4.5 explicitly chose NOT to retroactively migrate (T-2 PATH A) to avoid blast-radius expansion. Flag for Phase-5+ data-quality cleanup pass: re-classify the 6 parsed-object leases with `metadata.appFolioStatus === 'Ready to Countersign'` to `status: 'pending_countersign'`. Cross-check needed: are any of the 550 string-blob leases also semantically `'pending_countersign'` once decrypted? Out of scope for Task 4.5 (no decryption infra in dev/static mode).

2. **Duplicate-title pattern in 556 existing leases** (T-3). DC-E surfaced 5 base titles × 3 duplicates = 15 lease workitems matching Brown/Jamel/Vanessa/Blunt names (e.g., `"H12 Jamal Brown Incident Report 8/15/23"` × 3 instances with different IDs). Strong signal of triplicated absorption from a prior import pass. Out of scope for Task 4.5; flag for Phase-5+ data-quality dedup task: identify all `(type=='lease', title)` groups with `count > 1` and reconcile via canonical-pick + soft-delete or hard-delete based on traceability.

3. **Jamal vs Jamel name disambiguation** (T-4). Existing lease workitem `"H12 Jamal Brown Incident Report 8/15/23"` (open status) likely refers to the same person as Task 4.5's new `"Lease: Jamel D. Brown* — H12"` record — both at H12, both Brown surname. Source-data spelling differs (`Jamal` vs `Jamel`); the 2023-08-15 incident report predates the 2026-03-31 lease document by ~2.5 years. NOT an absorption collision (different recordType semantics: incident report vs lease document). Flag for Phase-5+ data-quality entity-resolution task: fuzzy-match on `(unit, surname)` to merge incident-report lease workitems with lease-document lease workitems where they refer to the same legal-tenant entity, OR canonicalize the spelling across the entire tenant graph.

4. **Source provenance asymmetry** (T-5). Existing 554 lease workitems came from a different absorption pass than `06_leases.json` (which only has 2 pending_countersign records — the entire scope of Task 4.5's source). The 554's origin is unknown from this codebase: likely a full-table earlier import or a different page of leases-source data. Flag for Phase-0.1.b re-capture pipeline (per CLAUDE.md "Deferred Items"): ensure all leases-source pages are captured so subsequent absorption tasks have full provenance traceability.

5. **First FK-resolved lease byte-shape divergence** (T-1 PATH B). Task 4.5's 2 new records establish the FIRST FK-resolved lease byte-shape in the codebase: `propertyId` populated, `unitId` populated, and `metadata.tenantId` populated (the latter being a precedent-establishing field — zero existing workitems of any type used `metadata.tenantId` before Task 4.5). Carry-forward implication: any future task that adds lease records SHOULD follow the FK-resolved precedent (rather than the prior 554's all-null-FK precedent), and any future task that retroactively migrates the 554 should backfill these 3 FKs from a source like `metadata.applicantName` + `metadata.requestedUnit` (string parse + entities.json lookup). Flag for Phase-5+ data-quality backfill task.

**Carry-forward A-3 networking note.** Vite 6.4.2 in this environment binds to `localhost` only, NOT `127.0.0.1`. Future probe scripts should use `http://localhost:5173/` to avoid IPv6/IPv4 binding ambiguity. Existing probes (cdp_probe_task_2_8 through cdp_probe_task_4_4) use `127.0.0.1` and would need editing if the environment were rebuilt. NOT modifying retroactively to preserve historical capture integrity; the standing recommendation applies forward-only.

---

## §8. Phase-4 §9 sub-tracker post-state

| Row | Task | Phase-4 status | Notes |
|:-:|:--|:-:|:--|
| 4.1 | Properties page-1 closeout | ✓ | Closed 2026-04-29 (1st task; FIXTURE-CLASS 1st calibration; PR #27 → `5daa2d4`) |
| 4.2 | Tenants page-1 closeout | ✓ | Closed 2026-04-29 (3rd task; FIXTURE-CLASS 3rd calibration; PR #29 → `abf65bb`) |
| 4.3 | Vendors canonical seeds | R | Pending — recommended next per dependency graph |
| 4.4 | Work Orders page-1 closeout | ✓ | Closed 2026-04-29 (2nd task; FIXTURE-CLASS 2nd calibration; PR #28 → `d5beb88`) |
| **4.5** | **Leases pending-countersign closeout** | **✓ (this task)** | **Closed 2026-04-29 retry (4th Phase-4 task; FIXTURE-CLASS+SCHEMA hybrid 1st calibration); originally halted as greenfield same-day morning then retried evening as FIXTURE-CLASS+SCHEMA hybrid post-DC-A scope-class flip** |
| 4.6 | Compliance matrix seed | R | Pending |
| 4.7 | Feature-flag flip | R | Pending — closes Phase-4; per v1 plan §19 dependency graph "4.1, 4.2, 4.3, 4.4, 4.5, 4.6 (parallel) → 4.7 (last)" |

**Phase-4 closure progress:** 4 of 7 task rows ✓ (4.1 + 4.4 + 4.2 + 4.5). Surviving Phase-4 row narrows 4 → **3** (`4.3, 4.6, 4.7`).

**Calibration baseline state post-Task-4.5:**
- LAYOUT-CLASS PRE2 baseline: 4 data points (3.3 +4 / 3.2 +11 / 3.4 +8 / 3.1 +9; Phase-3 only, retired)
- Pure FIXTURE-CLASS PRE2 baseline: 3 data points (4.1 +0 / 4.4 +0 / 4.2 +0; locked at +0 vitest / +0 kB)
- **FIXTURE-CLASS+SCHEMA hybrid PRE2 baseline: 1 data point (4.5 +0 / +0 kB) — first data point of new class; one more hybrid task needed for confirmation but not blocking**

---

## §9. Rollback plan

If post-merge regression is discovered:

1. **Revert PR.** `gh pr revert <PR#> -R NovaTrustSolutions/dwellium-per-spec` creates a clean revert commit. The diff is small (89 line additions across 2 files; 1 line deletion); revert is mechanical with no merge conflicts expected.
2. **Schema-edit rollback consideration.** The `'pending_countersign'` enum addition is ADDITIVE; reverting it does NOT break existing code (no consumer references the new value yet). Reverting the workitem fixture additions ALSO does not require coordinated enum revert — but doing both via `git revert` is cleanest.
3. **Cache-bust check.** `qualia-shell/public/data/workitems.json` is consumed via `fetch('/data/workitems.json')` at runtime (no build-time embed). Browsers may cache; clear via hard-reload or service-worker drain on dev/staging. CI build modes both produce byte-identical chunk hashes (`D37sEP_1`), so no chunk-cache invalidation needed at the CDN layer.
4. **No CI gate flips.** Both `AppFolio Parity Gate` blocking gates (tsc-b + vitest + dual-mode vite + PII scan) passed on this branch. No flag/gate change required for revert.
5. **Branch naming.** Revert branch convention: `revert/phase-4-task-4.5-leases-pending-countersign-retry` for traceability.

---

**Plan v2.22 anchors this report.** Post-merge sweep will commit the v2.22 plan amendment + this report + the CDP probe artifact directory (`Docs/Baselines/phase_4_task_4_5/`) + this completion report to `main`.
