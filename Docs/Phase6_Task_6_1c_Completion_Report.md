# Phase-6 Task 6.1c — appfolio-parity-workorder spec full audit + remediation

**Task.** Close the workorder spec's 5th surviving axis (time-windows-rendering at L161) AND any further latent axes by mandating a full PRE0 audit of every assertion in `appfolio-parity-workorder.spec.ts` against actual production rendering contract BEFORE applying spec edits. Acceptance: cold-start smoke-test 12/12 (the original kickoff target deferred 6.1a → 6.1b → 6.1c per task-split chain). **E2E-PLAYWRIGHT carry-over class** — Phase-6 2nd E2E-spec data point / extends 4pt → **5pt cross-phase**. **🎯 PRE0 audit characterized 8 ❌ rows as ONE root drift class** (not a 6th distinct class — same `block-default-collapsed + click-mechanism-scrollbar-interception` as 6.1b's 4th known class). HALT-IF gates all PASS at audit-end. Single-file scope (no helper extraction; threshold not met). **🎯 12/12 smoke-test achieved on FIRST batch-edit run** — POST-EDIT HARD HALT-IF NOT triggered. Audit-first vs whack-a-mole methodology empirically validated. **🎯 chunk-graph isolation empirical pattern preserved at 3rd Phase-6 data point** — all 3 production chunk axes (SHA256 / filename / byte-count) PRESERVED across spec-only edits. **byte-count cross-phase invariance milestone extends 19-of-19 → 20-of-20**. **Vitest 259 → 259** (+0). **Smoke-test 11/12 → 12/12** (workorder 0/1 → 1/1; vendor-compliance unchanged 1/1; CDP probe regression check confirmed 9-of-9 phase-row pwVis=true — no 6.1a/6.1b regression). **6.1b TBD → `718f6db` / #46 resolution co-shipped** at this commit per absorb-into-next-sweep precedent. **Phase-6 Block A (layout fix + spec defects) CLOSED** — Block B unblocks at 6.2 (helpers/auth.ts amendment).

**Squash SHA.** TBD (PR #TBD).

**Sources.**

- 1 spec file modified (no helper / fixture / unit-test / source / schema changes):
  - `qualia-shell/e2e/appfolio-parity-workorder.spec.ts` (+34 / −20; extend evaluate() matcher with `startsWith(title + ' (')` OR-arm + add `'Resident Availability'` and `'Actions Log'` to sectionTitles + delete L154-156 + delete L167-169 + comment refresh)
- 4 doc files updated/new:
  - **NEW** `Docs/Phase6_Task_6_1c_Completion_Report.md` (this file; embeds full PRE0 audit table in §1 — the audit IS the deliverable artifact)
  - **UPDATE** `Docs/Phase6_Task_6_1b_Completion_Report.md` (TBD → `718f6db` / PR #46 resolution; §1 squash SHA + §5 verification matrix CI rows)
  - **UPDATE** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` (v2.37 → v2.38 amendment; §9 row 6.1b TBD/PR# → `718f6db`/`#46`; row 6.1c R → ✓; Changelog v2.38 entry)
  - **UPDATE** `CLAUDE.md` (HEAD pointer; Phase-6 PRs "2 (6.1a, 6.1b)" → "3 (6.1a, 6.1b, 6.1c)"; smoke-test status "11/12" → "12/12"; Conventions block notes 6.2 unblocked)

**No source changes to.** packages/types/index.ts (canonical surface unchanged) / strataApi.{static,backend,ts} runtime code (Task 5.1c X-Qualia-API: v2 emission preserved) / fixtures (envelope preserved per kickoff "NO source-of-truth fixture changes") / unit tests / Playwright config / qualia-shell/package.json / helpers/auth.ts (smoke-test temp-edit reverted via `git restore` before staging; permanent amendment deferred to Task 6.2 per Phase_6_Plan.md Block B).

---

## §1. Scope + DoR + 5-DC ledger

### Scope (Path A spec-only edits — single-file batch)

**Kickoff GO Path A:** 1 spec edit cluster — extend the existing `evaluate()` toggle helper at L116-126 to additionally toggle `'Resident Availability'` and `'Actions Log (N)'` (entry-count-robust via `startsWith(title + ' (')` OR-arm), then delete the 2 brittle `.click().catch()` fallback blocks at L154-156 + L167-169 superseded by the unified toggle. Predicted 12/12 cold-start smoke-test acceptance.

**Empirical PRE3 result:** 12/12 PASS on FIRST smoke-test run post-batch-edit. NO 6th-axis surfacing. POST-EDIT HARD HALT-IF NOT triggered. Audit-first methodology empirically validated.

### PRE0 mandatory full-spec audit (the structural deliverable)

Walked every `expect()` / `await expect(...).toBeVisible()` / `toContainText()` / `toHaveText()` / `not.toBeVisible()` / `getByText()` / `locator(...).first()` in `qualia-shell/e2e/appfolio-parity-workorder.spec.ts:1-203`. Cross-referenced against production render path at `qualia-shell/src/components/StrataDashboard/modules/MaintenanceModule.tsx:1-1193` + `__maintenance/ResidentAvailabilityCard.tsx` + `__maintenance/ActionsLogList.tsx` + WO 19511-1 fixture at `qualia-shell/public/data/workitems.json:32102-32171`. Produced per-assertion ✓/⚠️/❌/🔍 table covering production render path / data dependency on WO 19511-1 fixture / DOM textContent vs visual text / click-mechanism scrollbar-interception risk.

#### WO 19511-1 fixture facts (cited verbatim, `workitems.json:32102-32171`)

| Field | Value | Conditional render impact |
|---|---|---|
| `title` | `"Fire alarm needs replaced. Beeping and can't reach."` | ItemCard substring-matches `WO_TITLE_TEXT='Fire alarm needs replaced'` ✓ |
| `description` | `"Fire alarm needs replaced. Beeping and can't reach."` | Description Section renders (defaultOpen=true; L797-803) |
| `workOrderNumber` | `"19511-1"` | Job ID Field renders unconditionally at L810 (top-level Field, NOT inside Section); also Work Order Info Section renders (L827) but `defaultOpen=false` |
| `metadata.tenantStatus` | **ABSENT** | Status Tracking Section (L903) does NOT render — already handled at 6.1b |
| `vendorInstructions` | `null` | Field auto-hides (L130-131); "Vendor Instructions" text never in DOM |
| `nextFollowUpDate` | `null` | No "Scheduling" Section exists in code (only in CODE COMMENT L199 — comments are not in DOM); negative assert structurally guaranteed |
| `residentAvailability` | `{date:"2026-04-20", dayOfWeek:"monday", timeWindows:["8:00am-12:00pm","10:00am-2:00pm","1:00pm-5:00pm"], timezone:"EDT"}` | Section RENDERS (L846 truthy) but `defaultOpen=false` (L851) — children hidden until expanded |
| `actionsLog` | 2 entries: `(System,"Resident submitted preferred times","04/20/2026 at 08:00AM-12:00PM EDT…")` + `(Brianna Jackson,"Submitted online",null)` | Section RENDERS (L860 truthy) but `defaultOpen=false` (L865) — children hidden until expanded. **Detail format is uppercase `08:00AM-12:00PM` — does NOT match spec lowercase `'8:00am-12:00pm'` even if rendered → Hypothesis (a) from 6.1b §1 RULED OUT.** |
| `laborEntries` | `[]` | Section L874 condition `{item.laborEntries && ...}` is **truthy for empty array** — Section header renders with title `"Labor (0)"` (NOT just "Labor"); negative assert exact="Labor" passes by 0 matches |
| `purchaseOrders` | `[]` | Same as labor: header `"Purchase Orders (0)"`; negative assert exact="Purchase Orders" passes |

#### Full audit table — 26 rows characterized

| # | Spec line | Assertion (excerpt) | Locator type | Production render path | Data dependency | DOM text match | Click-mechanism risk | Status |
|---:|---|---|---|---|---|---|---|---|
| 1 | L73 | `strataNav.toBeVisible({timeout:10_000})` | CSS `.s-sidebar-nav` | StrataDashboard sidebar (Phase-3 baseline) | none | unconditional | none | ✓ |
| 2 | L83 | `mainContent.toBeVisible({timeout:10_000})` | CSS `.s-main-content` | StrataDashboard main region | none | unconditional | none | ✓ |
| 3 | L90 | `woCard.toBeVisible({timeout:10_000})` (`text=Fire alarm needs replaced`) | text substring | ItemCard L174 renders `item.title` | `title` populated ✓ | substring of title | none | ✓ |
| 4 | L97 | `detailPanel.toBeVisible()` | CSS `.s-detail-panel` | DetailPanel rendered after card click | woCard click populates `selectedItemId` | unconditional | none | ✓ (6.1a fix made detail-panel render at non-zero width) |
| 5 | L129 | `[data-testid="wo-block-view-as-tech"]` | testid | Section L953 `defaultOpen={false}` → BlockViewAsTech inside | none | testid present only when section open | mitigated via L120-126 `evaluate()` dispatch | ✓ (closed at 6.1b) |
| 6 | L130 | `[data-testid="wo-block-withheld-amount"]` | testid | Section L961 `defaultOpen={false}` | none | "" | mitigated via 6.1b evaluate() | ✓ |
| 7 | L131 | `[data-testid="wo-block-invoices"]` | testid | Section L969 `defaultOpen={false}` | none | "" | mitigated | ✓ |
| 8 | L132 | `[data-testid="wo-block-texts"]` | testid | Section L977 `defaultOpen={false}` | none | "" | mitigated | ✓ |
| 9 | L133 | `[data-testid="wo-block-emails"]` | testid | Section L985 `defaultOpen={false}` | none | "" | mitigated | ✓ |
| 10 | L134 | `[data-testid="wo-block-notes"]` | testid | Section L993 `defaultOpen={false}` | none | "" | mitigated | ✓ |
| 11 | L145 | `getByText('Description', exact:true).first()` | exact text | Section L799 button text "Description" (defaultOpen=true; renders unconditionally when description truthy) | description populated ✓ | exact "Description" — only button-text match | none | ✓ |
| 12 | L146 | `text=/Attachments \(/.first()` | regex | Section L915 button title=`"Attachments (${attachments.length})"` ALWAYS rendered (Section button stays in DOM regardless of open state) | none | regex "Attachments (" matches "Attachments (0)" | none | ✓ |
| 13 | L149 | `getByText(WO_NUMBER='19511-1').first()` | text | Field L810 `Job ID` renders at top-level (NOT inside Section; auto-fallback `meta.jobId ?? item.workOrderNumber`) | `workOrderNumber` populated ✓ | substring "19511-1" | none | ✓ |
| 14 | L154-156 | `availabilityHeader.click().catch()` (toggle) | text loc | Section L848-855 `defaultOpen={false}`; button title="Resident Availability" | residentAvailability populated ✓ | button text exact-match | **HIGH** — same `.s-detail-panel` overlay-scrollbar interception that broke 6.1b's 6 block-titles. `.catch()` swallows the failure; section stays collapsed | ❌ **block-default-collapsed + click-mechanism-scrollbar-interception** (drift class identical to 6.1b axis-1; 4th known class, not new) |
| 15 | L161 | `text=8:00am-12:00pm` (loop iter 1) | text substring | ResidentAvailabilityCard L40-53 renders timeWindows verbatim as `<span>{w}</span>` ONLY when parent Section open | timeWindows[0]=`"8:00am-12:00pm"` ✓ | exact substring match if section open | depends on row #14 toggle succeeding | ❌ **5th-axis surfaced at 6.1b L161** — DOWNSTREAM of row #14; same drift class. Detail-line in actionsLog uses uppercase "08:00AM-12:00PM" so does NOT provide alternate match path |
| 16 | L161 | `text=10:00am-2:00pm` (loop iter 2) | text substring | "" | timeWindows[1] ✓ | "" | depends on row #14 | ❌ same as #15 |
| 17 | L161 | `text=1:00pm-5:00pm` (loop iter 3) | text substring | "" | timeWindows[2] ✓ | "" | depends on row #14 | ❌ same as #15 |
| 18 | L167-169 | `actionsLogHeader.click().catch()` (toggle) | text loc | Section L862-869 `defaultOpen={false}`; button title=`"Actions Log (${item.actionsLog.length})"` = "Actions Log (2)" | actionsLog populated (2 entries) ✓ | button substring `Actions Log` matches `Actions Log (2)` | **HIGH** — same scrollbar interception. `.catch()` swallows | ❌ **same drift class** (4th known class, not new) |
| 19 | L172 | `text=Resident submitted preferred times` (event) | text substring | ActionsLogList L49 `<span>{e.event}</span>` only when parent Section open | actionsLog[0].event populated ✓ | exact substring | depends on row #18 | ❌ DOWNSTREAM of row #18; same drift class |
| 20 | L172 | `text=Submitted online` (event) | text substring | "" | actionsLog[1].event populated ✓ | "" | depends on row #18 | ❌ same as #19 |
| 21 | L177 | `text=Brianna Jackson` | text substring | ActionsLogList L47 `<span>{e.actor}</span>` for entry[1] only when Section open | actionsLog[1].actor=`"Brianna Jackson"` ✓ | exact substring | depends on row #18 | ❌ DOWNSTREAM of row #18; same drift class |
| 22 | L194 | `getByText('Labor', exact:true).toHaveCount(0)` | exact text | Section L876 title=`"Labor (0)"` (laborEntries=[] → length=0; condition `{item.laborEntries && …}` truthy for empty array; section RENDERS) | laborEntries=[] ✓ | exact "Labor" ≠ "Labor (0)" → 0 matches | none | ✓ (negative-assert structurally satisfied) |
| 23 | L195 | `getByText('Purchase Orders', exact:true).toHaveCount(0)` | exact text | Section L890 title=`"Purchase Orders (0)"` | purchaseOrders=[] ✓ | exact "Purchase Orders" ≠ "Purchase Orders (0)" | none | ✓ |
| 24 | L196 | `getByText('Scheduling', exact:true).toHaveCount(0)` | exact text | NO "Scheduling" Section exists in MaintenanceModule.tsx (only in CODE COMMENT L199 — comments are not in DOM) | n/a | guaranteed 0 matches | none | ✓ |
| 25 | L197 | `getByText('Vendor Instructions', exact:true).toHaveCount(0)` | exact text | Field L839 inside Work Order Info Section L829 (defaultOpen=false). Field auto-hides when value null. vendorInstructions=null → Field returns null even if section toggled open. Section is also NOT in the `sectionTitles` array, so it stays closed | vendorInstructions=null ✓ | guaranteed 0 matches | none | ✓ |
| 26 | L200-201 | `errorBoundary not.toBeVisible` (`text=encountered an error`) | text substring | Desktop.tsx:62 widget-level ErrorBoundary fallback. WO 19511-1 has no malformed fields; all Section-internal ErrorBoundaries should pass-through | none | requires render fault to fire | none | ✓ |

#### Audit tally + drift class characterization

- **✓ unconditional/already-passing/structurally-satisfied:** 13 rows (#1-13, #22-26)
- **⚠️ data-dependent (verified populated):** 0 (all data dependencies confirmed populated in fixture)
- **❌ contract-drift requiring spec edit:** **8 rows** (#14, #15, #16, #17, #18, #19, #20, #21)
- **🔍 unknown (CDP probe required):** 0 — all 8 ❌ rows characterized via static analysis + cross-reference with 6.1b's documented click-mechanism finding

**ALL 8 ❌ rows reduce to ONE root drift class** — the **4th already-known class** from 6.1b: `block-default-collapsed + click-mechanism-scrollbar-interception`. Sections wrapped in `defaultOpen={false}` keep children out of the DOM until their header `<button>` is toggled; `.s-detail-panel`'s overlay-scrollbar intercepts Playwright's pointer-based `.click()` at the buttons' right edge; `.click().catch(() => {})` swallows the actionability failure silently → Section stays collapsed → child text/testids never reach the DOM → downstream `expect().toBeVisible()` fails. **No 6th distinct contract-drift class surfaced.** The audit confirms the 4 known classes from 6.1b (block-default-collapsed / Status-Tracking-conditional-render / Compliance-regex-case-mismatch / click-mechanism-scrollbar-interception) cover all observed defects. Hypothesis (b) from 6.1b §1 (mirrors my evaluate()-pre-expand pattern) is CONFIRMED; (a) and (c) are RULED OUT by static analysis (timeWindows fixture format DOES match `'8:00am-12:00pm'` verbatim; ResidentAvailabilityCard DOES emit timeWindows as searchable text-node spans).

#### HALT-IF gate evaluation (audit verdict)

| Gate | Threshold | Observed | Verdict |
|---|---|---|---|
| 10+ ❌ rows | escalate (split or rewrite) | 8 ❌ rows, all ONE class | **PASS** — under threshold AND single drift class makes batch-edit safe |
| Fixture data inconsistency requiring `workitems.json` edit | escalate | none — all data populated | **PASS** |
| 6th DISTINCT contract-drift class | flag + decide | 4 known classes cover everything; no new class | **PASS** |
| 🔍 rows un-characterizable via CDP probe | escalate | 0 🔍 rows | **PASS** |
| 9th absolute SCOPE-COLLISION pattern | escalate | none surfaced | **PASS** |

**Audit verdict: GO Path A — apply batched spec edits. User confirmed Option (a) startsWith matcher + single-file scope + Commit C scope.**

### DoR (Definition of Ready) — verbatim

- ✅ Phase-6 OPENED (✓ at `20a62d0` 2026-05-05).
- ✅ Phase-5 closed (✓ at `2acaa82` 2026-05-04).
- ✅ Task 6.1b CLOSED (✓ at `718f6db` 2026-05-09; PR #46) — 4 contract-drift axes characterized; 5th axis explicitly deferred-by-design to 6.1c per Path B.split + HARD HALT-IF discipline.
- ✅ `Docs/Phase6_Task_6_1b_Completion_Report.md §7` carry-forward enumerates 5th-axis-deferred-to-6.1c + click-mechanism-workaround-hardening + case-mismatch-tab-bar-audit + 3 working hypotheses.
- ✅ `Docs/Phases/Phase_6_Plan.md §4 Task 6.1c` mandates PRE0 full-spec-audit-FIRST + whack-a-mole-prohibited + 12/12 acceptance + ZERO-6th-axis HARD HALT-IF.
- ✅ PRE0 DC-A 4-query discovery + Step Zero source-provenance verification per Plan v2.29 PERMANENT process change. None of the 5 hard halts triggered at PRE0.

### 5-DC ledger (PRE0 audit-first → PRE1 → PRE2 → PRE3 → PRE4 commit)

| DC | Stage | Outcome |
|---|---|---|
| **DC-A** | PRE0 mandatory full-spec audit | 26 rows characterized: 13 ✓ unconditional + 0 ⚠️ data-dependent + 8 ❌ contract-drift + 0 🔍 unknown. All 8 ❌ rows reduce to ONE root drift class (4th known from 6.1b). HALT-IF gates all PASS. Hypotheses (a)+(c) RULED OUT via static analysis; (b) CONFIRMED. **Audit verdict: GO Path A.** User confirmation: option (a) startsWith matcher + single-file scope + 5-item Commit C scope. **No HALT-IFs triggered at PRE0.** |
| **DC-B** | PRE1 (none required) | Spec-only edit; no CDP probe needed for PRE1 since Path A scope is test-tooling-only. |
| **DC-C** | PRE2 (apply 1 spec edit cluster) | Single-file batch: extend `evaluate()` matcher with `startsWith(title + ' (')` OR-arm + add 2 titles ('Resident Availability', 'Actions Log') to sectionTitles array + delete L154-156 + delete L167-169 + comment refresh. Edits compile via tsc; chunk axes preserved by construction. |
| **DC-D** | PRE3 (smoke-test verify) | **12/12 PASS on FIRST run.** No iteration required. Audit-first methodology validated. POST-EDIT HARD HALT-IF NOT triggered. |
| **DC-E** | PRE4 commit | Working tree: 1 spec file M (workorder) + 4 doc files (Plan v2.38 + 6.1b TBD resolution + NEW 6.1c completion report + CLAUDE.md). helpers/auth.ts smoke-test temp-edit reverted via `git restore`. cdp_probe + Docs/Baselines/phase_6_task_6_1/ stay session-local untracked per CDP-probe convention. |

---

## §2. Strict-gate output (captured pre-merge on PR-branch HEAD)

```
$ cd qualia-shell && npx tsc -b
(exit 0)

$ npx vitest run
Test Files  37 passed (37)
     Tests  259 passed (259)
   Duration  2.56s (transform 4.10s, setup 2.73s, import 7.59s, tests 6.46s, environment 20.46s)
(exit 0)

$ rm -rf dist && VITE_APPFOLIO_SEEDS=true npx vite build
dist/assets/StrataDashboard-BqghmASj.js   1,031.26 kB │ gzip:  246.76 kB
✓ built in 3.90s
(exit 0)

$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
dist/assets/StrataDashboard-BqghmASj.js   1,031.26 kB │ gzip:  246.76 kB
✓ built in 3.88s
(exit 0)

$ cd .. && node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1385ms total).
(exit 0)
```

### Production chunk capture (both build modes; 3-axis preservation verified)

```
PROD-CHUNK seeds=true:  StrataDashboard-BqghmASj.js  1031260  81e1fdc508b3ea6cfb4579e71224baef9f3140fa35788db323aae68c3966d1d4
PROD-CHUNK seeds=false: StrataDashboard-BqghmASj.js  1031260  81e1fdc508b3ea6cfb4579e71224baef9f3140fa35788db323aae68c3966d1d4
```

| Axis | Pre-edit (6.1b @ 718f6db) | Post-edit (this build) | Delta |
|---|---|---|---|
| Byte count | 1,031,260 | 1,031,260 | **PRESERVED** — extends 19-of-19 → **20-of-20** cross-phase byte-count invariance milestone |
| SHA256 | `81e1fdc…d1d4` | `81e1fdc…d1d4` | **PRESERVED** — test-tooling-isolation empirical pattern confirmed at 3rd Phase-6 data point post-LAW-retirement |
| Filename | `StrataDashboard-BqghmASj.js` | `StrataDashboard-BqghmASj.js` | **PRESERVED** — 4th calibration axis stable for spec-only edits |

**ALL 3 AXES PRESERVED** — empirical pattern `chunk-graph-isolation for test-tooling-only edits` continues to hold (the categorical claim was retired at Phase-6 boundary; the empirical pattern is reaffirmed here). E2E-spec edits are categorically chunk-graph-isolated by construction (e2e/ outside Vite entry graph; not in main build's testMatch).

---

## §3. CDP render proof + smoke-test verification

### CDP probe regression check (defensive — should match 6.1a/6.1b baseline)

Re-ran `qualia-shell/cdp_probe_task_6_1.cjs` (session-local; not committed) post-spec-edits. Required `VITE_USE_STATIC_API=true` env on dev server (else strataApi routes to `/api/dwellium` backend not running in this session).

**Result: 9-of-9 phase-rows playwrightVisible=true** (matches 6.1a/6.1b post-fix baseline; expected by construction since e2e specs don't affect production chunk):

```
── maintenance-wo-19511-1 ──
  beforeClick:        rect=434×700  pwVis=true  inner=517b   children=1   h3=none  empty=true
  afterClick_50ms:    rect=434×700  pwVis=true  inner=27257b children=18  h3="Fire alarm needs replaced. Bee"  empty=false
  afterClick_550ms:   rect=434×700  pwVis=true  inner=27257b children=18  h3="Fire alarm needs replaced. Bee"  empty=false
  afterClick_1550ms:  rect=434×700  pwVis=true  inner=27257b children=18  h3="Fire alarm needs replaced. Bee"  empty=false

── vendors-2-story-roofing ──
  beforeClick:        rect=434×700  pwVis=true  inner=581b   children=1   h3=none  empty=true
  afterClick_50ms:    rect=434×700  pwVis=true  inner=29018b children=16  h3="2-STORY TECHNICAL ROOFING LLC"  empty=false
  afterClick_550ms:   rect=434×700  pwVis=true  inner=29018b children=16  h3="2-STORY TECHNICAL ROOFING LLC"  empty=false
  afterClick_1550ms:  rect=434×700  pwVis=true  inner=29018b children=16  h3="2-STORY TECHNICAL ROOFING LLC"  empty=false
  afterTabClick_500ms:rect=434×700  pwVis=true  inner=27118b children=16  h3="2-STORY TECHNICAL ROOFING LLC"  empty=false
```

No regression in detail-panel layout from spec-only edits — confirmed by construction (3-axis chunk preservation) AND empirically via probe.

### Cold-start smoke-test (THE acceptance gate)

A2 inline-seeded `helpers/auth.ts` with `qualia_sidebar_groups` localStorage seeding (Task 5.7 / 6.1b precedent; NOT committed; reverted via `git restore` before staging). Ran the 4-spec set cold-start with `--project=chromium` (static-API mode):

```
$ npx playwright test e2e/login.spec.ts e2e/strata-nav.spec.ts e2e/appfolio-parity-workorder.spec.ts e2e/appfolio-parity-vendor-compliance.spec.ts --project=chromium --reporter=line

Running 12 tests using 1 worker

[1/12]  [chromium] › appfolio-parity-vendor-compliance.spec.ts:68:3 › … 6 rows + only General Liability populated
[2/12]  [chromium] › appfolio-parity-workorder.spec.ts:65:3        › … 15-section DetailPanel + 3 windows + 2 actions log
[3/12]  [chromium] › login.spec.ts:17:3                            › quick-select avatar login loads the shell
[4/12]  [chromium] › login.spec.ts:29:3                            › wrong passphrase shows error without crashing
[5/12]  [chromium] › login.spec.ts:55:3                            › manual email/password login works
[6/12]  [chromium] › login.spec.ts:73:3                            › splash overlay is clickable and reveals login form
[7/12]  [chromium] › strata-nav.spec.ts:30:3                       › can open Strata widget from sidebar
[8/12]  [chromium] › strata-nav.spec.ts:43:5                       › navigating to "Overview" does not crash
[9/12]  [chromium] › strata-nav.spec.ts:43:5                       › navigating to "Properties" does not crash
[10/12] [chromium] › strata-nav.spec.ts:43:5                       › navigating to "Leasing" does not crash
[11/12] [chromium] › strata-nav.spec.ts:43:5                       › navigating to "Residents" does not crash
[12/12] [chromium] › strata-nav.spec.ts:43:5                       › navigating to "Maintenance" does not crash

  12 passed (22.0s)
```

**🎯 12/12 PASS on FIRST run.** Closes the original kickoff target deferred 6.1a → 6.1b → 6.1c. Audit-first methodology empirically validated: zero iteration, zero whack-a-mole.

| Spec | Pre-6.1c (6.1b @ 718f6db) | Post-6.1c (this PR) | Delta |
|---|---|---|---|
| `login.spec.ts` (4 cases) | 4/4 | 4/4 | unchanged |
| `strata-nav.spec.ts` (6 cases) | 6/6 | 6/6 | unchanged |
| `appfolio-parity-vendor-compliance.spec.ts` (1 case) | 1/1 | 1/1 | unchanged (closed at 6.1b) |
| `appfolio-parity-workorder.spec.ts` (1 case) | 0/1 | **1/1** | **+1 (5th axis closed at 6.1c)** |
| **Total** | **11/12** | **12/12** | **+1** |

---

## §4. Pre/post-edit working-tree view (1-spec single-file batch)

### Edit cluster — `qualia-shell/e2e/appfolio-parity-workorder.spec.ts`

**1. Extend the existing `evaluate()` toggle helper at L116-126** to additionally toggle `'Resident Availability'` and `'Actions Log'`. Matcher uses exact-equality OR `startsWith(title + ' (')` — open-paren is the discriminator for sections that bake an entry count into the button text (e.g. "Actions Log (2)"). Title + ' (' guard prevents accidental substring matches like "Actions Log Foo".

**2. Delete L154-156** (`availabilityHeader.click().catch()` block) — superseded by the unified `evaluate()` toggle at edit #1.

**3. Delete L167-169** (`actionsLogHeader.click().catch()` block) — same.

Plus comment refresh on the `sectionTitles` block to document the 8-section coverage and entry-count tolerance.

### Defensive sanity grep (per user kickoff)

```
$ grep -n "click().catch" qualia-shell/e2e/appfolio-parity-workorder.spec.ts
171:    // The prior `.click().catch()` fallback at this site silently swallowed
(1 hit — comment-prose documenting the removal; ZERO live hits)

$ grep -c "evaluate" qualia-shell/e2e/appfolio-parity-workorder.spec.ts
5
(5 hits: 1 LIVE call at L133 `await detailPanel.evaluate(...)` + 4 comment-prose references)
```

Both checks satisfy the kickoff intent: zero LIVE `.click().catch()` blocks; exactly 1 LIVE `evaluate()` toggle call.

---

## §5. Verification matrix (15 rows)

| Gate | Expected | Observed | Reference |
|---|---|---|---|
| `npx tsc -b` | exit 0 | ✓ | §2 |
| `npx vitest run` | 259 passing | ✓ 259/259 (+0) | §2 |
| `VITE_APPFOLIO_SEEDS=true npx vite build` | exit 0 | ✓ | §2 |
| `VITE_APPFOLIO_SEEDS=false npx vite build` | exit 0 | ✓ | §2 |
| Production chunk byte count | preserved at 1,031,260 | ✓ 20-of-20 cross-phase invariance | §2 |
| Production chunk SHA256 | preserved at `81e1fdc…d1d4` | ✓ test-tooling-isolation 3rd Phase-6 data point | §2 |
| Production chunk filename | preserved at `StrataDashboard-BqghmASj.js` | ✓ | §2 |
| Smoke-test cold-start | 12/12 (the acceptance gate) | ✓ **12/12** on FIRST run | §3 |
| CDP probe regression check | 9-of-9 phase-rows pwVis=true (no 6.1a/6.1b regression) | ✓ 9-of-9 | §3 |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | ✓ | §2 |
| Manual-dispatch parity gate | green | TBD (post-PR) | §6 |
| CodeRabbit review | pass | TBD (post-PR) | §6 |
| POST-EDIT HARD HALT-IF (12/12 first try; ZERO 6th axis) | NOT triggered | ✓ NOT triggered | §1 + §7 entry 1 |
| 6.1b TBD → `718f6db` / `#46` resolution | co-shipped | ✓ | §1 + §7 entry 7 |
| `Docs/Phase6_Task_6_1c_Completion_Report.md` | committed | ✓ this file | §8 |

---

## §6. CI / merge protocol (post-merge fill-in)

- Branch: `feat/phase-6-task-6-1c-workorder-full-audit`
- PR title: `feat(phase-6): Task 6.1c — appfolio-parity-workorder spec full audit + remediation (#TBD)`
- **Paths-filter quirk:** 6.1c touches only `qualia-shell/e2e/**` + `Docs/**` + `CLAUDE.md` — all OUTSIDE parity-paths filter. Manual-dispatch parity gate REQUIRED (mirrors meta-PR #44 + 6.1b precedent).
- Squash-merge on user GO; do NOT skip hooks; Co-Authored-By trailer required.

---

## §7. §7 carry-forward findings (NEW + cross-phase + meta-observations)

1. **🎯 Audit-first vs whack-a-mole methodology — empirically validated.** PRE0 26-row audit characterized 8 ❌ rows as ONE root drift class; predicted batch-edit fix; smoke-test 12/12 on FIRST run confirmed audit-first discipline. This is the structural antithesis of 6.1b's iterative-fix pattern (which surfaced 4 distinct axes across 3 PRE3 rounds before HARD HALT-IF discipline forced the split). Empirical generalization: when a spec exhibits 2+ contract-drift axes, the structurally-correct response is full audit BEFORE any edit, not iterative fix-test-fix. **PERMANENT process recommendation:** if 3+ ❌ axes surface across 2+ smoke-test rounds in a single spec, mandate PRE0 full-audit on the next sweep. Add to GR-15 PERMANENT process changes (next plan amendment).

2. **🎯 E2E-PLAYWRIGHT carry-over class extends 4pt → 5pt cross-phase.** Phase-5 5.3 + 5.4 + 5.5 (3pt) + Phase-6 6.1b (1pt) + Phase-6 6.1c (1pt) = 5pt. Class trajectory: spec-only edits / chunk-graph-isolated by construction / vitest delta=0 / acceptance gate is smoke-test cold-start.

3. **🎯 12/12 cold-start smoke-test ACHIEVED — original kickoff target finally closed.** Deferred chain: kickoff target → 6.1a (deferred at 5th-axis HALT-IF) → 6.1b (deferred at 5th-axis Path B.split) → **6.1c (CLOSED)**. Total deferred span: 3 task units / 3 PRs / ~9 calendar days. The discipline of HARD HALT-IF + Path B.split paid off vs the alternative of iterative whack-a-mole within 6.1b which would have kept surfacing successor axes.

4. **🎯 Test-tooling-isolation empirical pattern preserved at 3rd Phase-6 data point post-LAW-retirement.** All 3 production chunk axes (SHA256 + filename + byte-count) PRESERVED across spec-only edits at 6.1c (mirrors 6.1b). The chunk-graph-isolation STRUCTURAL LAW was retired at Phase-6 boundary as a categorical claim (because production-source edits inside the entry graph break SHA256 by construction at 6.1a's COMPONENT-FIX). The empirical pattern continues to hold for test-tooling-only edits at 3 Phase-6 data points (6.1b + 6.1c + meta) — strong inductive evidence that the empirical isolation property is robust for the test-tooling subset, even though the full categorical claim no longer applies.

5. **🎯 Byte-count cross-phase invariance milestone extends 19-of-19 → 20-of-20.** Continuous chain across Phases 4 + 5 + 6 (every production-affecting task EXCEPT 6.1a's COMPONENT-FIX which preserved byte-count by coincidence after 1ab4a9c…14ea → 81e1fdc…d1d4 SHA flip; 6.1b + 6.1c preserve all 3 axes by test-tooling-isolation construction). Byte-count axis is the most resilient of the 3 — it's preserved across COMPONENT-FIX (6.1a) AND test-tooling (6.1b, 6.1c).

6. **🎯 Hypotheses (a) + (c) from 6.1b §1 RULED OUT via static analysis; hypothesis (b) CONFIRMED.** PRE0 audit definitively settled the 3 working hypotheses for the 5th axis: (a) timeWindows fixture format mismatch — RULED OUT (`workitems.json:32148-32152` shows verbatim match `'8:00am-12:00pm'` etc.); (c) sub-component renders timeWindows as non-text-node — RULED OUT (`ResidentAvailabilityCard.tsx:40-53` emits `<span>{w}</span>` with timeWindows as searchable text); (b) Section default-collapsed + click-to-expand doesn't fire React onClick — CONFIRMED (mirrors 6.1b's `evaluate()` direct DOM dispatch pattern verbatim; same scrollbar-interception root cause). The audit reduced 3 hypotheses + 8 ❌ rows to 1 root cause + 1 batched fix.

7. **🎯 6.1b TBD → `718f6db` / PR #46 resolution co-shipped at 6.1c sweep.** Pre-merge `TBD` placeholders in `Docs/Phase6_Task_6_1b_Completion_Report.md` (§1 squash SHA + §5 verification matrix CI rows for parity gate + CodeRabbit review) resolved at 6.1c sweep per "absorb into next sweep" preference established at meta-PR #44 → 6.1a sweep → 6.1b sweep → 6.1c sweep. The pattern is now established as cross-phase convention.

8. **🎯 Phase-6 Block A CLOSED — Block B unblocks at Task 6.2.** Phase_6_Plan.md Block A (layout fix at 6.1a + spec-defect remediation at 6.1b + spec-defect full audit at 6.1c) is now complete: layout-collapse fixed, vendor-compliance spec fixed, workorder spec fixed via audit-first methodology. Block B Task 6.2 (helpers/auth.ts permanent amendment) is the next dependency — replaces the A2 inline-seed pattern used at 5.7 / 6.1b / 6.1c (5 data points of temporary inline-seed deferred-to-6.2). After 6.2, A2 inline-seed pattern can be removed from all measurement scripts + future smoke-tests will work without temp edits.

9. **POST-EDIT HARD HALT-IF NOT triggered.** Audit was the contract; if it had been wrong (a 6th class surfacing), I would have STOPPED and escalated rather than patched. Audit was correct. This is the discipline 6.1c was designed for, validated empirically.

10. **CDP probe regression check methodology hardening (deferred-item).** Probe needed `VITE_USE_STATIC_API=true` env var on the dev server to avoid backend-mode 500s. The probe header comment at L36 says "REQUIRES: vite dev server already running at http://127.0.0.1:5173/" but doesn't mention the static-API env var. Future-N hardening: update probe header to document the env var, OR add a probe-internal check that fails fast with a clear error if backend mode is detected.

---

## §8. Closure (≥10 entries)

1. ✅ **PRE0 mandatory full-spec audit COMPLETE** — 26 rows characterized in `Docs/Phase6_Task_6_1c_Completion_Report.md §1`; HALT-IF gates all PASS; user GO confirmed; option (a) startsWith matcher selected.
2. ✅ **Path A spec-only batch edit applied** — single-file (workorder.spec.ts); 3 minimal edits; +34 / −20.
3. ✅ **Defensive sanity grep PASS** — 0 live `.click().catch()` hits; 1 live `evaluate()` call (matches kickoff intent).
4. ✅ **tsc -b clean** — exit 0; no errors.
5. ✅ **vitest 259/259** — +0 delta (test-tooling edits don't add unit tests).
6. ✅ **2 vite builds clean** — both modes produce dist/.
7. ✅ **3 production chunk axes PRESERVED** — byte 1,031,260 / SHA `81e1fdc…d1d4` / filename `StrataDashboard-BqghmASj.js`. byte-count milestone extends 19-of-19 → 20-of-20.
8. ✅ **PII scan strict-clean** — 51 files, 0 leaks.
9. ✅ **Cold-start smoke-test 12/12 on FIRST run** — original kickoff target achieved; audit-first methodology validated.
10. ✅ **CDP probe regression check** — 9-of-9 phase-rows pwVis=true; matches 6.1a/6.1b baseline.
11. ✅ **POST-EDIT HARD HALT-IF NOT triggered** — no 6th distinct axis surfaced.
12. ✅ **helpers/auth.ts smoke-test temp-edit reverted** via `git restore`; permanent amendment deferred to Task 6.2.
13. ✅ **6.1b TBD → `718f6db` / PR #46 resolution co-shipped** at this commit.
14. ✅ **Plan v2.37 → v2.38 amendment** — §9 row 6.1c R → ✓; row 6.1b TBD/PR# → `718f6db`/`#46`; Changelog v2.38 entry.
15. ✅ **CLAUDE.md updated** — HEAD pointer; Phase-6 PRs "2 → 3"; smoke-test "11/12 → 12/12"; Conventions block notes 6.2 unblocked.
16. ✅ **NEW `Docs/Phase6_Task_6_1c_Completion_Report.md`** — embeds full PRE0 audit table in §1 (the audit IS the deliverable artifact, not just internal scratch).
17. ✅ **Phase-6 Block A CLOSED** — Block B unblocks at Task 6.2 (helpers/auth.ts amendment).

---

🧪 **Phase-6 6.1c CLOSED. Audit-first methodology empirically validated: 12/12 cold-start smoke-test achieved on FIRST batch-edit run; ZERO 6th-axis surfacing; POST-EDIT HARD HALT-IF NOT triggered. Original kickoff target deferred 6.1a → 6.1b → 6.1c is now CLOSED. byte-count 20-of-20. E2E-PLAYWRIGHT carry-over 5pt. 6.1b TBD → `718f6db` / `#46` resolution co-shipped. Phase-6 Block A complete; Block B unblocks at 6.2.**
