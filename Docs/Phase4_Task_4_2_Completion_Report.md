# Phase 4 — Task 4.2 Completion Report

**Task.** Tenants page-1 closeout (Phase-4 third task; FIXTURE-CLASS third PRE2 calibration data point).

**Squash SHA.** `abf65bb`. Closed 2026-04-29.

**Source.** `AppFolio_Screenshots/data/04_tenants_page1.json` (13 sample_tenants_page_1 records / total_tenants=3274 / page_size=20 / 5 visible properties: Huntington Lane / Washington Gardens / Summerfield / Riverwood Club / Woodland Parc).

**Plan v2 anchor.** Plan v2.21 (Changelog `v2.21 (2026-04-29)` entry).

---

## §1. Scope + DoR + 11-drift ledger (10-DC enumeration → 11 actuals after DC-EMERGENT post-CDP) + Task 4.5 unblock-status FLIP

### Scope (per v1 plan L186 + Plan §9 row 4.2 v2.21)

Page-1 closeout on `qualia-shell/public/data/entities.json` reconciled against Phase-0 capture reality + Phase-1 Task 1.1 prior-absorption record. Net deliverables:

| ID | Deliverable | Status |
|---|---|:-:|
| D-1 | ADD up to 13 page-1 sampled tenants to `entities.json`; reject duplicates per GR-6; verify each name+phone collision | ✅ (rejected 1, absorbed 12) |
| D-2 | Willie White detail-rich vs page-1-shape asymmetry decision (Task-4.4 WO-19511-1 detail-asymmetry pattern) | ✅ Path B no-op (Willie's existing record from Phase-1 already detail-rich; no edit needed) |
| D-3 | NO `packages/types/index.ts` change (existing schema covers tenant entityType + status) | ✅ verified at PRE0 DC-5 |
| D-4 | NO new tests | ✅ verified at PRE1 (f) |
| D-5 | 1 to N test invariant relaxations (DC-8 ripple) | ✅ 1 file (`sentiment.test.ts` L36 + L180-186; const rename + 2 assertions flipped to active-subset semantic) |

### Pivot context (Task 4.5 unblock-status FLIP — post-CDP discovery)

Pre-Task-4.2 belief (per Task 4.4 §7 entry #1 + kickoff prompt): "Task 4.2 unblocks Task 4.5 retry by resolving Jamel D. Brown + Vanessa V. Blunt as tenant entity FKs". Pre-flight DC-4 verification revealed neither name appeared in `04_tenants_page1.json`'s 13 sampled tenants (alphabetic page-1 covers De dios → ABREU only; Jamel/Vanessa would be on later pages by surname-D → surname-B alphabetic ordering → middle pages). **Conclusion at PRE0**: Task 4.5 retry would remain blocked post-Task-4.2.

**Post-CDP probe DC-EMERGENT finding (FLIP).** Probe step `probe-task-4-5-unblock-status` queried `/data/entities.json` for Jamel/Brown/Vanessa/Blunt name patterns directly. Result: 1 Jamel match + 13 Brown matches + 2 Vanessa matches + 2 Blunt matches. Inspection of the matched records:

- **Jamel Brown\*** at id `8d79d391-1ea6-4a69-826c-f7351e587691` — Riverwood Club Apartments **H12**, status `'active'`, source `google-sheets-resident-directory` (Phase-1 Task 1.1 era). Direct match to `06_leases.json` row 1 (Jamel D. Brown → Riverwood H12).
- **Brown, Harold L.** at `d7a7e696-…d82c` (E08), **Brown, Michelle** at `8bd926ff-…abe8` (J06), **Brown, Clarence B.** at `d90b9ca9-…e4ca` (B04), **Brown, Lee M.** at `bd21ad1f-…dcd3` (D05), **Brown, Vickie E.** at `7ca61147-…91ca` (D03), **Jerrica Holt-Brown** at `5611fc10-…5132` (D05), and 6 Phase-1-twin records of these (each tenant has 2 records per the duplicate-tenant-pair pattern noted in §7) — none are Jamel; surname-only fan-out.
- **Blunt, Vanessa V.** at id `0e9213db-78db-4f92-8bf9-933a85562cec` — Riverwood Club Apartments **D14**, status `'active'`, source `appfolio_csv` (Phase-1 Task 1.3 era). Direct match to `06_leases.json` row 2 (Vanessa V. Blunt → Riverwood D14).
- **Vanessa Blunt\*** at `6885cb98-177e-4431-8bc2-6d78f4cf4b5f` — Riverwood D14, source `google-sheets-resident-directory`. Phase-1 duplicate-twin of `0e9213db-…2cec`.

Both canonical lease tenants already resolve in entities.json from Phase-1 era under Phase-1-style name formats (asterisk-flagged-primary or "LastName, FirstName M." format). **Task 4.5 retry is eligible at any time post-v2.21.** The unblock-pending-Task-4.2 premise was a misread of the Task 4.4 §7 entry #1 — entry #1 stated Task 4.5's tenant FKs were unresolved; PRE-flight on Task 4.2 didn't recheck existence of Jamel/Vanessa under alternate name formats prior to commit C. The CDP probe surfaced the truth.

### 11-drift ledger (10 enumerated DC at PRE0 + 1 emergent post-CDP)

| # | Drift | Surface | Resolution |
|---|---|---|---|
| 1 | DC-1: entities.json baseline 3550 records / 322 tenant subset / all status='active' | PRE-flight (a) | Confirmed; no action. |
| 2 | DC-2 (CRITICAL): tenant collision check on 13 page-1 names revealed Willie White already at `08793d48-…7af0` (Phase-1 Task 1.1 era as Other Occupant on LaSonta Westbrook lease at Riverwood B03; full metadata matches `09_tenant_detail` summary) | PRE-flight (b) + (d) | Net delta +12 not +13; reject Willie per GR-6. |
| 3 | DC-3 (CRITICAL): Riverwood disambiguation — properties.json has TWO Riverwood matches (`705a6f52` "Apartments" + `492283f5` "Apts Inc" shadow) | PRE-flight (g) | Use `705a6f52` (matches existing Willie/LaSonta/Elijah `propertyId`); shadow `492283f5` is sub-entity vendor-shaped, not used. |
| 4 | DC-4 (CRITICAL): pre-Task-4.2 thought Jamel D. Brown + Vanessa V. Blunt would land in this absorption to unblock Task 4.5; pre-flight verified they're NOT in 04_tenants_page1's 13 sampled (alphabetic page covers De dios → ABREU only) | PRE-flight (b) | At commit C, captured "STILL BLOCKED" finding in commit message. **POST-CDP DC-EMERGENT FLIPPED THIS** (see #11 below). |
| 5 | DC-5: schema unchanged. EntityType union covers 'tenant'; EntityStatus union covers both 'active' (Willie) + 'inactive' (12 new Past) | PRE-flight (e) | NO `packages/types/index.ts` edit; verified at L19-20. |
| 6 | DC-6 (CRITICAL): GR-7 sanitization tension. Source had 5/13 with raw phone numbers; 0/13 with email captures. Reconciled vs 322-baseline pattern | PRE-flight (h) | Names REAL (matches 322 baseline); phones SANITIZED to `'Mobile: (555) 555-XXXX'` or `''`; emails `''`; addresses `null`. |
| 7 | DC-7: status enum mapping source-Past → 'inactive', source-Current → 'active' | PRE-flight (e) | 12 new tenants get `'inactive'`; the 1 Current (Willie) is already absorbed → no new active. |
| 8 | DC-8: test invariant ripple — `sentiment.test.ts` L184-185 strict-equality 322 + zero-non-active | PRE-flight (f) | Const rename `TENANTS_BASELINE_PHASE_1` → `TENANTS_BASELINE_PHASE_1_ACTIVE` + 2 assertions flipped to active-subset semantic + `length >= 322` lower-bound. Single file. |
| 9 | DC-9: Willie White detail-rich asymmetry — 09_tenant_detail has rich operational data | PRE-flight (c) | Path B no-op. Willie's existing Phase-1 record already carries lease/rent/deposit/unit-type/late-fee — matches 09_tenant_detail summary. Operational fields (balance / monthly_charges / 49-sample emails / FolioGuard) live in sentiment_scores + tenant_portal, not entity profile. |
| 10 | DC-10: FK consumers — does sentiment_scores / tenant_portal need updates? | PRE-flight (f) | No fan-out scope creep. sentiment_scores derived from sorted-tenant-iteration on existing 322 (anchor stable); tenant_portal points at LaSonta Westbrook (existing); workitems.json has no Task-4.2 references. |
| 11 | **DC-EMERGENT (post-CDP) — Task 4.5 unblock-status FLIP.** Both Jamel Brown\* (`8d79d391-…7691` Riverwood H12) AND Blunt, Vanessa V. (`0e9213db-…2cec` Riverwood D14) ALREADY resolve in entities.json from Phase-1 era under Phase-1-style name formats | CDP probe `probe-task-4-5-unblock-status` step | Plan §9 row 4.5 amendment + R-N risk register entry proposed for v2.22+; FK ID anchors captured for retry kickoff. |

### DC-6 GR-7 sanitization policy (canonical per 322-baseline pattern)

| Field | New 12 records | Rationale |
|---|---|---|
| `name` | REAL | Matches `MARIO ZULIAN NETO` + `LaSonta Westbrook` precedent. |
| `phone` | `'Mobile: (555) 555-XXXX'` if source had phone (5/12); else `''` | Replaces source `(939) 228-0430` etc. with sanitized stub matching 322-baseline pattern (`Mobile: (555) 555-XXXX` / `Home: (555) 555-XXXX`). |
| `email` | `''` | Page-1 source has no email captures; matches Phase-1 `appfolio_csv` compact-pattern precedent (Duffey, Linda G. has `user-5bf12042@example.com` only because Phase-1 generator created stubs; Task 4.2 doesn't generate stubs since source had nothing). |
| `address` | `null` | Matches 322-baseline pattern; addresses live at property level. |
| `metadata.unit` | REAL (e.g., `0909 A`, `001O`, `9102`) | Source verbatim. |
| `metadata.propertyName` | REAL | Source verbatim. |
| `metadata.propertyId` | UUID | Resolved from FK lookup (5 properties). |
| `metadata.tenantStatus` | `'Past'` | Captures source label distinct from `EntityStatus` mapping. |
| `metadata.source` | `'appfolio_page1_capture'` | NEW source marker (distinct from `google-sheets-resident-directory` + `appfolio_csv` Phase-1 sources). |
| `metadata.modelUnit` | `true` for 1 brm MODEL + 2BRM model (2/12) | Captures the source "MODEL" / "model" name marker. |

---

## §2. Strict-gate output (captured locally pre-merge HEAD `c6f9a7b`; mirrored at squash SHA `abf65bb` post-merge)

### Local 5-step gate

| Step | Command | Result |
|---|---|---|
| 1 | `npx tsc -b` | clean (no output) |
| 2 | `npx vitest run` | **224 passed (224)** across 35 test files in 3.78s. No new it-blocks; only invariant relaxation in `sentiment.test.ts`. |
| 3 | `npx vite build` (default `VITE_APPFOLIO_SEEDS=true`) | ✓ built in 5.06s. Chunk `StrataDashboard-D37sEP_1.js` at 1,031.26 kB / 246.76 kB gzip. |
| 4 | `VITE_APPFOLIO_SEEDS=false npx vite build` | ✓ built in 4.89s. Same chunk hash + size. |
| 5 | `node Scripts/verify_no_pii_leak.mjs` | strict scope: 51 files / 0 leaks (1511ms). legacy scope: 0 files / 0 findings. |

### Squash-merge gate (auto-fired on `pull_request → push to main` trigger)

- **PR #29** (`feat(phase-4): Task 4.2 — Tenants page-1 closeout (+12 records; Task 4.5 ALREADY UNBLOCKED finding)`).
- **AppFolio Parity Gate** run `25143140506` on PR-branch commit `c6f9a7b`: success in ~6m, 15/15 workflow steps green. Playwright e2e step `continue-on-error: true` per CLAUDE.md (Linux snapshots deferred per Phase-0.0 exit gate report).
- **PII Scan** run `25143140491` on PR-branch commit `c6f9a7b`: success in 29s.
- **Post-merge** Parity Gate auto-fired on main at run `25143354022` (auto-trigger held; predecessor Task 4.4 + 4.1 also auto-fired on direct push-to-main from squash-merge).

### Vitest delta (FIXTURE-CLASS PRE2 third calibration data point)

224 → **224 (+0)**. FIXTURE-CLASS baseline now 3 data points (4.1 +0 / 4.4 +0 / 4.2 +0); prediction-band confirmed for fixture-additive shape across 3 confirmations.

### Module-graph drift

`StrataDashboard-D37sEP_1.js` 1,031.26 kB / 246.76 kB gzip (Task 4.4 close anchor) → `StrataDashboard-D37sEP_1.js` 1,031.26 kB / 246.76 kB gzip (Task 4.2 close anchor). **+0 kB ungz / +0 kB gz** (chunk hash byte-identical SHA256 `66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461` across both build modes AND across the +12-record fixture write + 1-test-file invariant relaxation). Canonical FIXTURE-CLASS shape holds: fixture-only + test-only changes don't enter the chunk graph.

---

## §3. CDP render proof — 8/8 acceptance pass after one guard-flip iteration

### 8-input acceptance

| # | Gate | Result |
|---|---|:-:|
| 1 | `pageLoadsZeroTaskRelevantConsoleErrors` | ✅ (1 pre-existing borderColor style warning filtered — recurs across modules) |
| 2 | `tenantListHasRows` | ✅ (≥1 `<tr cursor:pointer>` rendered in ResidentsModule list view per Task 3.1 render host) |
| 3 | `entitiesFetchTotal3562` | ✅ |
| 4 | `tenantSubsetCounts` | ✅ (tenantTotal=334 / activeCount=322 / inactiveCount=12) |
| 5 | `deDiosVisibleSomewhere` | ✅ (search input filled; "De dios" textVisible) |
| 6 | `tenantDetailH3Renders` | ✅ (clicked first row; h3 panel renders selected name) |
| 7 | `willieWhiteRegression` | ✅ (cleared search; refilled "Willie"; "Willie White" textVisible) |
| 8 | `taskFourFiveAlreadyUnblocked` | ✅ (after guard-flip; Jamel/Brown/Blunt counts ≥1 each) |

### Iteration narrative (distinct from Task 4.1's 7/7-after-3-iterations + Task 4.4's 8/8-zero-iteration)

First probe run returned `allPass: false` because gate #8 originally evaluated `taskFourFiveStillBlocked` (asserting Jamel/Vanessa/Blunt counts === 0). The data showed `jamelCount: 1` + `bluntCount: 2` + `vanessaCount: 2` + `brownCount: 13`. Inspection of the matched records confirmed both canonical tenants exist from Phase-1 era → the probe correctly observed reality, but the GUARD interpretation was inverted relative to the actual Task 4.5 unblock-status.

Single guard-flip iteration: rename gate #8 + invert pass criterion (`>= 1` instead of `=== 0`). Re-run: `allPass: true`. **NOT a selector iteration** (Task 4.1 pattern); **NOT a runtime-state iteration** (Task 4.4 had zero); a probe-guard semantic refactor in response to a DC-EMERGENT data finding.

This iteration class is a **new probe-iteration archetype** for Phase-4 + later phases: when a probe gate encodes a belief about the world that the data falsifies, the gate semantic flips while observation byte-shape stays identical.

---

## §4. Module-graph drift — canonical FIXTURE-CLASS shape (third data point)

| Metric | Pre-edit (Task 4.4 close, HEAD `bb6432e`) | Post-edit (Task 4.2 close, HEAD `abf65bb`) | Delta |
|---|---|---|---|
| Chunk filename | `StrataDashboard-D37sEP_1.js` | `StrataDashboard-D37sEP_1.js` | identical |
| Chunk size (default mode) | 1,031.26 kB ungz / 246.76 kB gzip | 1,031.26 kB ungz / 246.76 kB gzip | +0 kB |
| Chunk size (`VITE_APPFOLIO_SEEDS=false`) | 1,031.26 kB ungz / 246.76 kB gzip | 1,031.26 kB ungz / 246.76 kB gzip | +0 kB |
| SHA256 | `66c743…3461` | `66c743…3461` | byte-identical |
| Module count | 3278 | 3278 | unchanged |

### Phase-4 calibration table

| Task | Records added | Test files touched | Module-graph drift | Status |
|---|---|---|---|:-:|
| 4.1 | +1 (properties.json) | 1 (propertyTimeline.test.ts L228 lower-bound) | 0 kB | ✅ |
| 4.4 | +11 (workitems.json) | 3 (maintenance.test.ts L70 + calendar.test.tsx L120 + projects.test.ts L46/L140) | 0 kB | ✅ |
| 4.2 | +12 (entities.json) | 1 (sentiment.test.ts L36 + L180-186 active-subset semantic) | 0 kB | ✅ |

Three calibration points achieve **+0 kB** module-graph drift across both `VITE_APPFOLIO_SEEDS` flag values. The FIXTURE-CLASS prediction band is locked at 3 data points: Phase-4 fixture-additive tasks consistently produce 0 kB chunk drift. Tasks 4.3 / 4.6 should match this. Task 4.5 retry (greenfield-class introduces a new fixture file + schema edit + contract test) and Task 4.7 (TypeScript source touch) will diverge.

---

## §5. Vitest delta — FIXTURE-CLASS PRE2 third calibration

| Phase-4 Task | Vitest pre | Vitest post | Delta | Driver |
|---|---|---|---|---|
| 4.1 | 224 | 224 | +0 | propertyTimeline.test.ts strict-equality → lower-bound semantic |
| 4.4 | 224 | 224 | +0 | 3 row-count strict-equality → lower-bound + 1 content-aware bucket count update |
| 4.2 | 224 | 224 | +0 | sentiment.test.ts active-subset semantic relaxation (const rename + 2 assertions) |

**Pattern**: FIXTURE-CLASS Phase-4 tasks produce zero NEW it-blocks; only invariant relaxations on existing assertions to match the broadened fixture surface.

**Phase-4 task-class-vs-vitest-delta map (post-v2.21):**

- **FIXTURE-CLASS (4.1 / 4.4 / 4.2)**: +0 each. Pure fixture-additive on a single JSON file + 1-to-N invariant relaxations on existing tests. Module-graph 0 kB drift.
- 4.3 / 4.6: +0 vitest delta predicted (similar fixture-additive shape; potential collateral row-count invariant relaxations as in 4.1 / 4.4 / 4.2).
- 4.5 (retry): +N vitest delta predicted (greenfield-class likely requires a new contract test file for the Lease schema). Greenfield-class deviation from FIXTURE-CLASS PRE2 baseline.
- 4.7: +0 to +small vitest delta predicted (touches `strataApi.static.ts` TypeScript source); module-graph small +0.5 to +2 kB drift expected.

---

## §6. Plan v2 surgery — v2.21 (per post-merge sweep)

| Plan v2 surface | Edit | Status |
|---|---|:-:|
| §9 Verification Matrix Phase-4 column | (untouched — Phase-4 column flips R → ✓ at Phase-4 close, not at Task 4.2) | held |
| §9 Phase-4 sub-tracker Task 4.2 row | R → **✓** + `abf65bb` + 2026-04-29 + per-row proof reference to this report | ✅ |
| §9 Phase-4 sub-tracker Task 4.5 row | UNBLOCK STATUS FLIP — was "STILL BLOCKED pending Task 4.2" → "ALREADY UNBLOCKED — retry-eligible at any time" + FK ID anchors `8d79d391-…7691` + `0e9213db-…2cec` | ✅ |
| §9 Phase-4 pending-row note | "Pending row: 5 (`4.2, 4.3, 4.5, 4.6, 4.7`)" → "Pending row: 4 (`4.3, 4.5, 4.6, 4.7`)" + recommended-next update | ✅ |
| §22 Appendix C `entities (tenants)` row | `existing count / +13 AppFolio-derived` → enumerated breakdown `(on-disk count post-Task-4.2: 322 active + 12 inactive; total entities.json = 3562 / +13 absorbed = 1 Phase-1 Task 1.1 [Willie White] + 12 Task 4.2; bonus 322 active baseline carries Jamel Brown* + Blunt Vanessa V. from Phase-1 era resolving Task 4.5 leases tenant FKs)` | ✅ |
| §21 Appendix D row 6 `public/data/entities.json` Phase-4 cell | `Task 4.2 + 4.3` → `Task 4.2 (closed 2026-04-29 at abf65bb; ...) + Task 4.3` | ✅ |
| Changelog v2.21 entry | NEW entry at top of §22 Changelog block (full byte-shape: 11 actuals from 10-DC enumeration + DC-EMERGENT post-CDP + module-graph drift + vitest delta + CDP probe + Task 4.5 unblock-status FLIP narrative + DoR ack chain + per-task report + recommended next) | ✅ |

---

## §7. Deferred items + Task 4.5 unblock-status FLIP capture (5 candidates for v2.22+ §7 ledger)

1. **Task 4.5 UNBLOCK-STATUS FLIP (DC-EMERGENT post-CDP finding) — canonical record.** Both canonical lease tenants from `06_leases.json` ALREADY resolve in entities.json from Phase-1 era under Phase-1-style name formats:
   - **Jamel Brown\*** at id `8d79d391-1ea6-4a69-826c-f7351e587691` (Riverwood Club Apartments H12, status=active, source=`google-sheets-resident-directory`). Direct match to source row 1 (Jamel D. Brown → Riverwood H12).
   - **Blunt, Vanessa V.** at id `0e9213db-78db-4f92-8bf9-933a85562cec` (Riverwood Club Apartments D14, status=active, source=`appfolio_csv`). Direct match to source row 2 (Vanessa V. Blunt → Riverwood D14).

   Both pre-date Task 4.2 (NOT among the +12 absorbed page-1 tenants). Task 4.5 retry is **eligible at any time** post-v2.21. Greenfield retry scope = +1 fixture file `qualia-shell/public/data/leases.json` (with FK resolution against the 2 anchored tenant IDs above) + +1 schema edit `packages/types/index.ts` (new `interface Lease` + `type LeaseStatus = 'pending_countersign' | 'active' | 'expired' | 'terminated' | 'pending_signature'`) + +1 contract test (likely `leases.test.ts`). Greenfield-class deviates from FIXTURE-CLASS PRE2 baseline; predict +N vitest delta (1 new contract test) + small module-graph drift (new fixture file enters chunk only if statically imported by any src/* module — verify at retry kickoff). R-N risk register entry proposed for v2.22+.

2. **"Brown" surname FK ambiguity for fuzzy matching at Task 4.5 retry.** The 322 active tenant baseline carries 13 records with surname "Brown" (across Phase-1 dual-source duplication: 6 Phase-1 unique tenants × 2 source records each + 1 Jerrica Holt-Brown). At Task 4.5 retry kickoff, if the leases fixture references tenants by name (rather than by tenant UUID), fuzzy match needs to disambiguate "Jamel Brown\*" specifically (NOT "Brown, Harold L." / "Brown, Lee M." / etc.). Recommendation: leases.json should encode `tenantId: '8d79d391-…7691'` directly + `tenantName: 'Jamel D. Brown'` as a denormalized field, mirroring `tenant_portal_messages.json` Task 3.9 precedent.

3. **322-baseline duplicate-tenant pairs at Riverwood (Phase-1 dual-source duplication carry-over).** Probe data revealed 7 unit ranges (D14 / E08 / B04 / D03 / D05 / J06 / H12) each carry 2 records for the same tenant — once with source `google-sheets-resident-directory` (asterisk-flagged-primary like `Vanessa Blunt*`) and once with source `appfolio_csv` (LastName-First-format like `Blunt, Vanessa V.`). Phase-1 Task 1.1 + Task 1.3 each absorbed independently without cross-reference dedup. Future cleanup: deduplicate the 322-active baseline by name-collapse + source-prefer (`appfolio_csv` is the canonical source per Phase-1 Task 1.3 closure narrative). Out-of-Phase-4 scope; candidate for Phase-5 entity-deduplication pass or for an ad-hoc data-hygiene PR.

4. **sentiment.test.ts active-subset semantic relaxation pattern as template for any future Phase-4 status-mutation task.** The const rename + 2-assertion-flip pattern in `sentiment.test.ts` L36 + L184-185 generalizes: any future task that mutates entity status (e.g., archiving a tenant, deactivating a vendor, marking a property inactive) can re-use this pattern. Active-subset baseline + total ≥ baseline lower-bound preserves drift-detection on the canonical Phase-1 surface while allowing additive growth on derived statuses. Document the pattern in Plan v2 §3 ("Test invariant relaxation patterns") at a future v2.x entry.

5. **CDP probe guard-flip iteration baseline distinct from prior probe-iteration archetypes.** Phase-4 now has 3 distinct probe-iteration archetypes:
   - **Task 4.1 archetype**: 7/7-after-3-iterations selector iteration (DOM-side; PropertiesModule view-mode triplet differs from Residents `<table><tr>` pattern; selectors needed to be widened to grid/rows/table).
   - **Task 4.4 archetype**: 8/8-zero-iteration (verification surface mostly fetch-side; data-layer assertions reachable via `page.evaluate(() => fetch(...))` independent of DOM-selector polymorphism).
   - **Task 4.2 archetype**: 8/8-after-1-guard-flip (probe semantic encoded a belief that the data falsified; observation byte-shape stayed identical, gate interpretation flipped). NEW — captures the "your test is wrong about the world" class of probe iteration.

   Future probe-design recommendation: encode gates as data assertions first (raw counts, raw IDs, raw textVisible booleans), then layer interpretation guards atop the data assertions. A guard-flip is much cheaper than a selector iteration or a re-mock-and-re-run-vitest cycle.

---

## §8. Phase-4 §9 sub-tracker post-state

| Task | Status | Merge SHA | Closure date |
|---|:-:|---|---|
| 4.1 — Properties page-1 closeout (FIXTURE-CLASS first PRE2 calibration; +1 ANZO LLC shadow entity; properties.json 36 → 37) | ✓ | `5daa2d4` | 2026-04-29 |
| 4.2 — Tenants page-1 closeout (FIXTURE-CLASS third PRE2 calibration; +12 inactive tenants; entities.json 3550 → 3562; DC-2 collision Willie White rejected; DC-EMERGENT Task 4.5 unblock-status FLIPPED) | ✓ | `abf65bb` | 2026-04-29 |
| 4.3 — Vendors: 4 canonical vendor seeds | R | — | — |
| 4.4 — Work Orders page-1 closeout (FIXTURE-CLASS second PRE2 calibration; +11 records; workitems.json 1152 → 1163; 19511-1 + 19441-1 already absorbed and skipped per DC-2) | ✓ | `d5beb88` | 2026-04-29 |
| 4.5 — Leases: 2 real pending-countersign leases from `06_leases.json` | R (deferred — UNBLOCK-ELIGIBLE at any time per v2.21 FLIP) | — | — |
| 4.6 — Compliance matrix seed: 6 vendor + 9 AHA + 1 Duke Energy | R | — | — |
| 4.7 — Feature-flag flip + Phase-4 closure (`strataApi.static.ts` + `.env.example`) | R | — | — |

Pending row: 4 (`4.3, 4.5, 4.6, 4.7` — 4.5 deferred greenfield-class but unblock-eligible at any time per v2.21 FLIP). Phase-4 closes when 4.7 lands. Per Plan v2 §19 Appendix B: `4.1, 4.2, 4.3, 4.4, 4.5, 4.6 (parallel) → 4.7 (last; feature flag flip)`.

**Recommended next:** Task **4.5** (smallest scope — 2 pending-countersign leases; tenant FKs ALREADY resolved per the v2.21 unblock flip; greenfield retry path will produce the first non-FIXTURE-CLASS-shape calibration data point of Phase-4 — useful to baseline the greenfield class before 4.7's source-touch chunk drift). Alt: Task **4.3** (vendors fixture-additive on entities.json) OR Task **4.6** (compliance matrix multi-source absorption shape).

---

## §9. Rollback plan

**Pre-Task-4.2 SHA:** `bb6432e` (post-Task-4.4 sweep on `main`).
**Task-4.2 squash SHA:** `abf65bb`.
**Rollback command (if needed):**

```
git revert -m 1 abf65bb
git push origin main
```

**Rollback impact:** Reverts the +12 tenant records + the 1-file invariant relaxation in `sentiment.test.ts`. entities.json reverts 3562 → 3550; tenant subset reverts 334 → 322; sentiment.test.ts L36 const reverts to `TENANTS_BASELINE_PHASE_1 = 322` + L184 reverts to `expect(tenants).toHaveLength(322)` + L185 reverts to `expect(tenants.filter(t => t.status !== 'active')).toHaveLength(0)`. Module-graph delta = 0 either direction (canonical FIXTURE-CLASS shape).

**No cascading dependencies.** Task 4.2 is parallel-batch with 4.3 / 4.5 / 4.6; none depend on Task 4.2's specific records. Task 4.7 depends on the Phase-4 fixture state being stable but not specifically on Task 4.2's contribution. A clean revert is single-commit.

**Task 4.5 unblock-status FLIP does NOT rollback with Task 4.2.** The DC-EMERGENT finding (Jamel + Vanessa already in Phase-1 baseline) is a fact about pre-existing state, not about Task 4.2's contribution. Even after a Task 4.2 revert, Task 4.5 retry is still eligible at any time per the FK ID anchors captured in §1 + §7 entry #1.

---
