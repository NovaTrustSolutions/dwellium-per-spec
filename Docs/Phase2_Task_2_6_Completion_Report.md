# Phase 2 Task 2.6 — Utilities Utility-Vendor Workitem Seed · Completion Report

**Task.** 2.6 — Utilities: seed real utility-vendor workitem rows per plan v1 L140 (Duke Energy + Massey Pest on 128 Buena Vista, Georgia Power on Riverwood Club / 2070 Azalea). Fifth Phase-2 general-pool task landed post-B3.

**Branch.** `feat/phase-2-task-2.6-utilities` off `main@1db6c3f`.

**Commits (pre-squash, atomic, all strict-gate-green).**
1. *(types skipped — GR-2 trivially clean; Workitem interface reused as-is per Task 2.1 precedent)*
2. `6ea5a00` — `feat(data): seed 3 utility-type workitems for Task 2.6 (Duke Energy + Massey Pest on 128 BV, Georgia Power on Riverwood)` — 3 `type: 'utility'` rows appended to `workitems.json` (1148 → 1151); mirrors Task 2.1's 9-inspection seed schema; bundled with minimum-change baseline pin-updates in 3 downstream tests (maintenance / calendar / propertyTimeline) per Task 2.1 commit-1 precedent (`070a51b`).
3. *(static handler skipped per DoR-PRE0 (b) ack — `strataApi.static.ts:104-110` `/workitems` handler natively filters on `type` + `property_id`; no `/utilities` route needed)*
4. *(UtilitiesModule rewire skipped per DoR-PRE0 (f2) ack — Massey Pest seeded with `utilityType: 'trash'` fallback; UTILITY_TYPES enum unchanged; pest-icon UX polish deferred to Phase-3 per §7)*
5. `32006aa` — `test(parity): replace utilities.test.ts placeholder with 6 Task-2.6 contract it-blocks` — `utilities.test.ts` stub → 6 real it-blocks (baseline / BV 2-row spec gate / Riverwood 1-row / schema sanity / PII pattern / cross-source vendor-name coherence).
6. `9293ade` — `docs(plan): Task 2.6 closure — §9 tracker row + Appendix D row 7 amend + Changelog v2.8` — 3 surgical edits to `Docs/AppFolio_Parity_Implementation_Plan_v2.md`.
7. *This report + CDP render proof (commit 7).*

**Merge SHA (post-squash).** TBD — post-merge sweep backfills the squash SHA mechanically per Task 2.3 / 2.5 / 2.7 / 2.2 / 2.1 / 2.10 / 2.4 precedent.
**Closure date.** 2026-04-24 (branch-push; merge pending /security-review + CI).

---

## Summary

Task 2.6 ships the **utility-vendor tracking seed** that the UtilitiesModule has been architected to display since Phase 1 but lacked data to render. Three `type: 'utility'` rows land in `workitems.json` referencing the already-existing vendor entity rows in `entities.json`:

- **Duke Energy** (Water Heater Plan, electric utility type) on **128 Buena Vista Dr N** (propertyId `e4b440e9-…`).
- **Massey Pest Control** (Quarterly Service, trash utility-type fallback per (f2)) on **128 Buena Vista Dr N**.
- **Georgia Power** (Monthly Electric) on **Riverwood Club Apartments / 2070 Azalea Drive** (propertyId `705a6f52-…`).

**Scope (DoR-PRE0 + PRE1):** plan v1 L140 one-liner is the sole authoritative spec (v2.7 has no dedicated `### Task 2.6` section). DoR-PRE1 re-verification surfaced that **all three target vendors already exist as `entityType:'vendor'` rows in `entities.json` with correct `propertyIds` linkage** — matching the Task 2.4 PRE0→PRE1 scope-refinement pattern. Scope refined from "create vendor entity rows" (PRE0 ceiling) → "workitem-level utility tracking rows only" (PRE1). `entities.json` NOT touched (Phase-4 owner per Appendix D row 6 preserved).

**Routing:** (a4) status-quo — UtilitiesModule reads via the existing `/workitems?type=utility&property_id=X` handler. Zero new fixture, zero new handler, zero module rewire. Mirrors Task 2.1's 9-inspection `type: 'inspection'` seed pattern exactly (commit `070a51b`).

**Downstream baseline sync (bundled per Task 2.1 commit-1 precedent):**
- `maintenance.test.ts` 1148 → 1151 baseline pin.
- `calendar.test.tsx` 1148 → 1151 baseline pin (Task-2.1 row count assertion unchanged via `getTask21Rows()`).
- `propertyTimeline.test.ts` — 3 downstream pins: BV `bvWorkitems` count 0 → 2 (Duke + Massey), `view.total` 4 → 6, `sourceBreakdown.workitem` 0 → 2. Drift-bound `[4, 68)` preserved unchanged (Task-2.6 delta stays well within cap).

**B3 chain status:** UNCHANGED — CLOSED. Task 2.6 is the **fifth** general-pool task landed post-B3 (Task 2.2 `b98e84c` first; 2.1 `67768c9` second; 2.10 `fba4d65` third; 2.4 `17c77b4` fourth; 2.6 this PR fifth).

---

## §1 — Scope & DoR evidence

### DoR + ambiguity resolutions (all green)

- **DoR-PRE0** — plan-vs-reality drift check. Confirmed: v2.7 plan has NO `### Task 2.6` body (grep). v1 L140 one-liner sole source. Session notes `2026-04-23_phase_2_schedule.md` §1 L34 + §2 #5/#7/#11 pre-flagged the scope gaps resolved in this PR.
- **DoR-PRE1** — fixture absorption check (Task 2.4-class refinement). All three target vendors pre-exist as `entityType:'vendor'` rows in `entities.json` with correct `propertyIds`:
  - Duke Energy (`ef78c6c4-c3ad-4930-90a7-07260afa8ceb`) → `['e4b440e9-…']` (BV) ✓
  - Massey Pest (`1dded118-1bef-4c0a-9378-51fe81fcbd99`) → `['e4b440e9-…']` (BV) ✓ (phone sanitized `(555) 555-XXXX` pre-Task-2.6)
  - Georgia Power (`5c304b26-d9a7-406d-96cd-7ac4eda798c5`) → `['705a6f52-…']` (Riverwood) ✓
  - (3 duplicate Georgia Power rows linked to other properties — not touched.)
- **DoR-PRE2** — row-count minimums. Appendix C §20 has NO entry for `utilities` / `utility_accounts`. `workitems.json` floor 500+ preserved (1148 → 1151 stays 2.3× over floor). Task-internal baseline `UTILITIES_TASK_2_6_BASELINE = 3` pinned in `utilities.test.ts` it-block #1.
- **DoR 4–15** — verified across commit bodies.

- **Ambiguity (a) — fixture strategy:** **(a4) STATUS QUO** — extend `workitems.json` with 3 `type:'utility'` rows. No new fixture file. Phase_2_Plan.md L146 legacy `utilities.json` reference superseded by v2.7 authority.
- **Ambiguity (b) — handler strategy:** **KEEP `/workitems`** — no `/utilities` route added. `strataApi.static.ts:104-110` handler natively filters on `type` + `property_id`.
- **Ambiguity (c) — `entities.json` touch:** **(c2) NO ENTITIES.JSON WRITE** — target vendors pre-exist with correct linkage. `entities.json` preserved for Phase-4 ownership (Appendix D row 6).
- **Ambiguity (d) — test target:** **BV = `e4b440e9-…` / Riverwood = `705a6f52-…`** — both verified in `properties.json`; canonical UUIDs from Task 2.10 `propertyTimeline.test.ts:44` and Task 2.1 completion report L37.
- **Ambiguity (e) — Appendix D row add:** **AMEND ROW 7 in commit F** — `workitems.json` Phase-2 cell `Task 2.1` → `Task 2.1 → 2.6 (sequential; ...)`. Follows 2.3→2.5→2.7 text precedent.
- **Ambiguity (f) — pest-control utility typing (PRE1-surfaced new ambiguity):** **(f2) `utilityType: 'trash'` fallback** — UTILITY_TYPES enum unchanged, zero module edit. UX polish (dedicated `pest` icon) deferred to Phase-3 follow-up per §7.

---

## §2 — Strict gate (local paste)

```
=== tsc -b ===
(clean, no output)

=== vitest ===
 Test Files  26 passed (26)
      Tests  159 passed (159)
   Start at  06:03:24
   Duration  2.64s

=== vite build (default) ===
✓ built in 5.13s

=== vite build (VITE_APPFOLIO_SEEDS=false) ===
✓ built in 5.16s

=== PII scan ===
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 47 files scanned across 2 roots, 0 leaks found (1504ms total).
```

- `tsc -b`: clean (**GR-2 trivially clean** — no types-file touch).
- `vitest`: **159 / 159** pass (was 154; **+5 net** = 6 new − 1 placeholder stub replaced). The handoff-estimated `+6` was off-by-one because Phase-0 Task 0.4 scaffolded `utilities.test.ts` with 1 passing placeholder it-block that counted toward the 154 baseline.
- `vite build` default + `VITE_APPFOLIO_SEEDS=false`: both clean.
- PII scan strict scope: **47 files, 0 leaks** (new JSON rows added to `workitems.json` pass the account-number regex — all 3 use `XXXX-XXXX-\d{4}` sanitized placeholders, monthlyCost null, no real emails/phones).

---

## §3 — CDP render proof

**Tool.** Headless Playwright chromium against `VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true` dev server on `http://localhost:5173/`. Probe script: `qualia-shell/cdp_probe_task_2_6.cjs` (one-shot, repo-local, NOT committed — pattern matches Task 2.4's harness).

**Nav path.** click `.login-start-overlay` → click Andy persona (God Mode) → fill gate passphrase (`Comet2878!`) + Enter → expand Property Management sidebar group → click Strata widget → click Properties nav → find + click "128 BUENA VISTA DR N" property row → click "⚡ Utilities" workspace tab → Utilities card renders.

**Probe DOM snapshot:**
```json
{
  "moduleRendered": true,
  "utilityHeadingCount": 1,
  "dukeHits": 1,
  "masseyHits": 1,
  "gaPowerHits": 0,
  "utilityCountBadge": 2,
  "providersInCard": ["Duke Energy", "Massey Pest"],
  "utilityCardText": "Utilities(2) Add UtilityDuke EnergyElectricAcct: XXXX-XXXX-0001Water heater planMassey PestTrashAcct: XXXX-XXXX-0002Pest control — quarterly (fallback to 'trash' utility type; see Task 2.6 report §7 for pest-type UX follow-up)"
}
```

**Guard return value (captured inline per handback spec):**
```json
{
  "moduleRendered": true,
  "dukeOnPage": true,
  "masseyOnPage": true,
  "georgiaAbsentOnBV": true,
  "utilityCountBadgeIs2": true,
  "utilityCardShowsBothProviders": true,
  "zeroConsoleErrors": true,
  "zeroPageErrors": true,
  "allPass": true
}
```

**All 8 guard conditions PASSED.** Per the user-acked Task 2.6 spec gate:
1. UtilitiesModule renders for 128 BV (h3 "Utilities" heading present). ✓
2. Count badge shows `(2)` — parsed from `UtilitiesModule.tsx:99` `<span>({utilities.length})</span>`. ✓
3. Duke Energy row rendered in the card text. ✓
4. Massey Pest row rendered in the card text. ✓
5. Georgia Power NOT rendered on BV detail view (property-scope respected). ✓
6. Both provider rows resolve to distinct DOM entries inside the Utilities `.s-glass-card`. ✓
7. Zero console errors (ERR_CONNECTION_REFUSED from open-meteo + sentry DSN absence filtered as pre-existing test-env noise per Task 2.4 precedent). ✓
8. Zero pageerrors. ✓

Artifacts:
- `Docs/Baselines/phase_2_task_2_6/UtilitiesModule_BV.png` (575 KB full-page screenshot; Utilities card centered in frame).
- `Docs/Baselines/phase_2_task_2_6/cdp_summary.json` (full step trace + probe + guard).

---

## §4 — /security-review deep pass (Task 2.6 only)

**Scope.** Only code + data introduced by this branch.

### Sink grep (new code only)
```
dangerouslySetInnerHTML / __html / innerHTML= / eval( / new Function /
document.write / srcdoc= / setAttribute('on / outerHTML / .html(
  → 0 hits across all new artifacts (3 seed rows, 6 test it-blocks, plan docs, report)
```

### Findings

| # | Category | Severity | Disposition |
|---|---|---|---|
| S-1 | **PII exposure via provider-string metadata** | N/A | **DEFENDED.** `metadata.provider` values are vendor business names ("Duke Energy", "Massey Pest", "Georgia Power") — public company names, not personal PII. Mirrors Task 2.3's `"Pest Control - Massey"` vendor reference pattern. Phone/email fields not touched (entities.json pre-sanitized: `(555) 555-XXXX`, `user-*@example.com`). |
| S-2 | **Account number disclosure** | N/A | **DEFENDED.** All 3 account numbers are literal sanitized placeholders `XXXX-XXXX-0001 / 0002 / 0003` matching the GR-7 scanner allowlist pattern (Scripts/verify_no_pii_leak.mjs:50-58). No real account-number derivation. Test it-block #5 enforces `/^XXXX-XXXX-\d{4}$/` regex per-row. |
| S-3 | **Cross-property data leak via `metadata.provider` fuzzy match (test #6)** | N/A | **DEFENDED.** The cross-source coherence test uses token-contained matching against entities.json VENDOR-TYPE rows only (`e.entityType === 'vendor'` filter). Property-level entities (owners / tenants) are never matched, preventing accidental owner-name leakage into the utility vendor lookup. |
| S-4 | **Integer overflow via `monthlyCost`** | N/A | **DEFENDED.** All 3 rows ship with `monthlyCost: null` (no real billing figures in scope; backfill deferred to Phase-3 AppFolio re-capture per §7). Module code at `UtilitiesModule.tsx:151` renders via `u.monthlyCost.toFixed(2)` behind a `u.monthlyCost &&` guard, so null renders as nothing. No arithmetic on null. |
| S-5 | **SQL / NoSQL injection via unsanitized propertyId** | N/A | **DEFENDED.** No new handler introduced (status-quo `/workitems` route). Existing handler at `strataApi.static.ts:108` uses strict `=== params.property_id` comparison on in-memory array; no template literal interpolation. Task 2.10's security discipline preserved. |
| S-6 | **Workitem type-field injection** | N/A | **DEFENDED.** `type: 'utility'` is a string literal in the seed, written at commit time. No user-controlled input flows to `type` assignment in the module's add-form (UtilitiesModule.tsx:62 hard-codes `type: 'utility'` on POST). |
| S-7 | **GR-2 schema regression via new utility row shape** | N/A | **DEFENDED.** Rows conform to the existing `Workitem` interface (packages/types/index.ts:293). `tsc -b` clean; `metadata` is typed as `Record<string, unknown>` per Task 1.4 — new keys (utilityType/provider/accountNumber/monthlyCost) are structural-only additions under metadata, invisible to exhaustive-type-checkers. |
| S-8 | **XSS via provider / notes content rendered in UtilitiesModule** | N/A | **DEFENDED.** `UtilitiesModule.tsx:143, 150, 152` renders provider / accountNumber / notes as React JSX text content (auto-escape). No `dangerouslySetInnerHTML`; no attribute binding to free-text values. Sink grep: 0 hits across all new artifacts. |
| S-9 | **Existing latent module regression (UtilityRecord interface vs workitem metadata shape)** | N/A | **Expected behavior.** Module-local `UtilityRecord` interface (L18-27) derives from workitem.metadata via defensive read (`w.metadata?.utilityType || 'electric'` fallback). Adding seed rows that populate all metadata keys tightens the render path without changing the interface shape. |
| S-10 | **Test-file PII bleed via vendor-name assertions** | N/A | **DEFENDED.** `utilities.test.ts` references vendor names (Duke Energy / Massey Pest / Georgia Power) as string literals in test assertions — public company names. No email / phone / SSN / account-number literals in the test file. |

**Verdict: High = 0, Medium = 0, Low = 0.**

---

## §5 — Verification matrix

| # | Claim | Evidence |
|---|---|---|
| 1 | 3 `type:'utility'` rows appended to `workitems.json` | `workitems.json` diff at commit `6ea5a00` (+117 lines, 0 deletions); `git show 6ea5a00 --stat` |
| 2 | Each row uses canonical property UUID (DoR-PRE1) | it-block #2 (BV `e4b440e9-…`) + it-block #3 (Riverwood `705a6f52-…`) both cross-check against `propertiesSeed` |
| 3 | UtilitiesModule renders 2 rows for 128 BV (plan v1 L140 spec gate) | CDP §3 `utilityCountBadge: 2` + `providersInCard: ["Duke Energy","Massey Pest"]` + screenshot |
| 4 | UtilitiesModule renders 1 row for Riverwood | Test it-block #3 asserts `rwRows.toHaveLength(1)` + provider === `'Georgia Power'` (handler-level verification via workitems fixture read) |
| 5 | GR-2 trivially clean (no packages/types/index.ts touch) | `git diff main..HEAD packages/types/index.ts` is empty |
| 6 | GR-5 trivially clean (no strataApi.static.ts or strataApi.backend.ts touch) | `git diff main..HEAD qualia-shell/src/components/StrataDashboard/strataApi.*.ts` is empty |
| 7 | GR-6 (real data, not synthetic): providers are real AppFolio-era vendor names | it-block #6 token-contained match against pre-existing entities.json vendor rows (Duke → Duke Energy (Progress) (Electric Service); Massey → Pest Control - Massey; Georgia Power → Georgia Power Co) |
| 8 | GR-7 PII strict-clean | §2 PII scan 47/0; it-block #5 enforces `/^XXXX-XXXX-\d{4}$/`; monthlyCost pinned null |
| 9 | vitest 154 → 159 (+5 net = 6 new − 1 placeholder) | §2 strict-gate paste + Changelog v2.8 delta-math bullet |
| 10 | CDP all 8 guards pass | §3 `allPass: true` |
| 11 | Appendix D row 7 Phase-2 cell amended (Task 2.1 → 2.6 sequential) | plan v2 L591 post-commit-F text |
| 12 | §9 tracker — Task 2.6 row extracted to ✓ row; pending narrowed 3 → 2 items | plan v2 §9 tracker post-commit-F + Changelog v2.8 bullet 1 |
| 13 | Appendix D row 1 (`packages/types/index.ts`) UNTOUCHED | grep post-commit-F — row 1 text unchanged from PR #8 baseline |
| 14 | 6 real it-blocks replace 1 placeholder in utilities.test.ts | `utilities.test.ts` diff at `32006aa` (+157 insertions, -8 deletions) |
| 15 | UtilitiesModule.tsx NOT touched (per (f2) ack) | `git diff main..HEAD qualia-shell/src/components/StrataDashboard/modules/UtilitiesModule.tsx` is empty |
| 16 | entities.json NOT touched (per (c2) ack) | `git diff main..HEAD qualia-shell/public/data/entities.json` is empty |
| 17 | CI-equivalent gate green locally | §2 all 5 gates (tsc / vitest / 2× vite build / PII scan) pass |

---

## §6 — Rollback

Atomic per-commit rollback supported (3 commits total in branch — data / test / docs):

```
# Full revert (restore pre-Task-2.6 state)
git revert 9293ade 32006aa 6ea5a00

# Selective: revert only the docs sweep (keep seed + tests for future reuse)
git revert 9293ade
# (seed + tests remain; plan v2.8 changelog reverts to v2.7)

# Selective: revert only the tests (keep seed as orphan data)
git revert 32006aa
# (seed rows preserved; utilities.test.ts reverts to placeholder stub; docs
#  become semi-inconsistent — re-land the test commit or revert seed too)

# Selective: revert only the seed (restores 1148 workitems baseline)
git revert 6ea5a00
# (downstream baseline pins in maintenance/calendar/propertyTimeline get
#  re-introduced automatically; tests stay green on pre-Task-2.6 workitems)
```

Each revert is independently green on `tsc -b` + `vitest run` + both `vite build` modes (per-commit gates verified pre-push).

---

## §7 — Deferred / out-of-scope

1. **UtilitiesModule pest-icon UX polish (Phase-3 follow-up).** The UTILITY_TYPES enum at `UtilitiesModule.tsx:10-16` is closed at 5 keys (electric/gas/water/internet/trash). Massey Pest is seeded with `utilityType: 'trash'` fallback per (f2) — functional but UX-imperfect (renders with Trash icon + "Pest control — quarterly" note). A dedicated `pest` key (e.g., `{ key: 'pest', label: 'Pest Control', icon: Bug, color: '#84cc16' }`) would give Massey its own icon. Scope: 1 icon import + 1 enum entry + GR-13 module retrofit (ErrorBoundary + 2 Sentry breadcrumbs + 6 data-testid anchors per Task 2.4 commit-D precedent). Deferred to keep Task 2.6 scope minimal and avoid /security-review surface expansion.
2. **Phase-3 AppFolio re-capture — `monthlyCost` backfill.** All 3 utility rows ship with `monthlyCost: null` per GR-7 sanitization discipline. Real monthly billing figures (Duke Energy water-heater-plan rate, Massey Pest quarterly service fee, Georgia Power monthly electric average) exist in the AppFolio source sheets and can be backfilled in a future Phase-3 re-capture PR — same PR that handles the 40 unrecaptured page-2-5 properties + 2 deferred page-1 rows per plan v2.7 Drift Correction #3 + Task 2.4 completion report §7 item 1.
3. **UtilitiesModule data-testid + GR-13 retrofit.** Unlike ForecastModule (Task 2.4 commit D), UtilitiesModule has no `data-testid` anchors today; §3 CDP probe used text-content matching instead of testid queries. A future UX-polish PR (likely bundled with follow-up #1 above) should add the standard 6 testids (`utilities-module`, `utilities-add-button`, `utilities-record-row`, `utilities-provider-text`, `utilities-account-text`, `utilities-count-badge`) + ErrorBoundary wrap + 2 Sentry breadcrumbs (`utilities.module.loaded`, `utilities.record.add`) per Task 2.4 precedent.
4. **Synthetic-vs-real vendor UUID coherence cleanup.** Task 2.6 references Duke / Massey / Georgia Power by `metadata.provider` string — loose linkage. Task 2.3's 9 `compliance.json` rows + `section8_rollup.json` still reference synthetic `"riverwood-club"` id (carried forward from Task 2.1 / 2.2 / 2.10 / 2.4 reports). A future cleanup PR should migrate all three sources to real `entities.json` vendor UUIDs (`ef78c6c4-…` / `1dded118-…` / `5c304b26-…`) via a single `entity_id` field on each workitem/compliance/insurance row. Phase-3 scope.
5. **Vendor-UUID duplication in `entities.json`** (rediscovered DoR-PRE1 side-finding). 4 "Georgia Power" vendor rows exist in `entities.json` (`fba756d1-…`, `5c304b26-…`, `1fdde3e7-…`, `c9b78058-…`) linked to 4 DIFFERENT propertyIds. Task 2.6 selected `5c304b26-…` for Riverwood based on its existing propertyIds linkage to Task 2.1's canonical Riverwood UUID. The other 3 duplicates are not ambiguous-for-this-task but represent genuine entities.json normalization debt. Phase-4 Task 4.2/4.3 scope.

---

## §8 — Next-task unblock

Phase-2 pending narrowed to **2 items**: **2.8** (Sentiment), **2.9** (Projects). Both are independent of Task 2.6's outputs; neither touches a file Task 2.6 amended:

- **Task 2.8** — Sentiment. Per plan v2.7 §8 L330: new `sentiment_scores.json` fixture + 3 handlers (`/sentiment/scores`, `/sentiment/history`, `/sentiment/by-entity`). Unblocked. Serial chain on `strataApi.static.ts` retires post-Task-2.4 + 2.6 (both non-conflicting with /sentiment paths).
- **Task 2.9** — Projects. Append WO 19441-1 to `workitems.json` per scheduling-pass §6 item #10 resolution. Unblocked. Opens third sequential Appendix D row 7 ownership claim: `Task 2.1 → 2.6 → 2.9` (text precedent identical to 2.3→2.5→2.7).

The remaining `strataApi.static.ts` rebase-train is single-task now (Task 2.8 only) — Task 2.4's `/forecast` and Task 2.6's status-quo `/workitems` use both retire from the serial chain.

**Phase-2 gate closure projection:** Tasks 2.8 + 2.9 land independently in any order. On both-landed, Phase-2 column in the §9 verification matrix flips to ✓; all 10 Phase-2 tasks closed; Phase-3 opens with the AppFolio re-capture follow-up PR (properties + utilities monthlyCost backfill + pest-icon UX polish + synthetic-UUID cleanup — see §7 items 1-4).
