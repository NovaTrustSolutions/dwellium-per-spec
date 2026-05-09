# Phase-6 Task 6.1a — `.s-detail-panel` layout collapse fix (Phase-6 OPENER)

**Task.** Fix the `.s-detail-panel` rendered-but-zero-width latent bug surfaced empirically at Phase-5 Task 5.7 PRE2 smoke-test. Land a defense-in-depth combined fix: (A.1) per-component default-size override in `WindowContext.tsx` so the Strata window opens at 1100×800 rather than the quadrant-spawn default (~518–598 px on a 1200 px desktop); (A.1 second-order) Desktop.tsx auto-region-snap effect skips components that declare an explicit default size (otherwise the 1100×800 default would be immediately overridden by the 600×900 halves-h region snap); (A.2) container-query swap in StrataDashboard.css so `.s-split-view` collapses to 1-col when its actual rendered width is too narrow for the 320 px-fixed first column, regardless of viewport. **Phase-6 OPENER.** **COMPONENT-FIX 1st distinct in-repo class** — Phase-6 1st distinct class / project-wide 10th cumulative class. **Chunk-graph isolation STRUCTURAL LAW retires at Phase-6 boundary** — was a Phase-5-specific test-tooling property (6 data points across MSW + Playwright config + 3 e2e specs + 2 measurement scripts); 6.1a is the first production-source edit and structurally distinct. **🎯 HALT-IF triggered at PRE2 — task split into 6.1a + 6.1b** per user directive: 6.1a (this task) ships source-only fix; 6.1b ships spec-defect remediation (6 `<Section defaultOpen={false}>` assertions + 1 ambiguous tab-button locator). **🎯 NEW filename-pattern-shift calibration axis surfaced** — production chunk filename shifted from hash-only (`COZxJ8Bh.js`) to `[name]-[hash]` (`StrataDashboard-BqghmASj.js`) without any vite.config edit; 4th distinct calibration axis joining SHA256 / byte-count / chunk-count; structural cause deferred to future-N investigation. **🎯 byte-count cross-phase invariance milestone** extends 17-of-17 → **18-of-18** — canonical signal preserved even through production-source edit, validating Plan v2.28 dual-axis reframe. **Vitest 259 → 259** (+0; no unit-test gap surfaced; smoke-test is the actual fix-axis gate). **Smoke-test 10/12** — failure-locus shifted from panel-visibility (Phase-5 baseline 0/2) to downstream spec-defects (Phase-6 6.1b scope); CDP probe confirms 8/8 phase-rows playwrightVisible (the actual fix-axis gate met).

**Squash SHA.** `20a62d0` (PR #45). Closed 2026-05-05.

**Sources.**

- 3 source files modified:
  - `qualia-shell/src/context/WindowContext.tsx` (+19 / −5; new `COMPONENT_DEFAULT_SIZES` exported lookup + branched `winW`/`winH`/`winX`/`winY` calculation in `openWindow`)
  - `qualia-shell/src/components/Shell/Desktop.tsx` (+5 / −1; import `COMPONENT_DEFAULT_SIZES` + skip clause in auto-region-snap effect)
  - `qualia-shell/src/components/StrataDashboard/StrataDashboard.css` (+12 / −4; `container-type: inline-size` on `.s-module` + `@container (max-width: 700px)` rule replacing the `.s-split-view` clause inside the prior `@media (max-width: 900px)`)

**No source changes to.** packages/types/index.ts (canonical surface unchanged) / strataApi.{static,backend,ts} runtime code / fixtures / unit tests / existing e2e specs / helpers/auth.ts (deferred to 6.2 per task split) / playwright.config.ts / qualia-shell/package.json.

---

## §1. Scope + DoR + 5-DC ledger

### Scope (Path A.1 + A.2 combined defense-in-depth)

**Failure axis confirmed at PRE1.** CDP probe `cdp_probe_task_6_1.cjs` (session-local; not committed per CDP-probe convention from Tasks 3.1/3.4) characterized the failure mode across 8 phase-rows (Maintenance/WO 19511-1 + Vendors/2-STORY at beforeClick / afterClick_50ms / afterClick_550ms / afterClick_1550ms; Vendors also at afterTabClick_500ms):

| Phase | panel rect | splitView rect | grid-template-columns (computed) | playwrightVisible | innerHTML | h3? |
|---|---|---|---|---|---|---|
| pre-fix all 8 rows | **0×700** | 268×700 | `320px 0px` | ❌ | 27 KB (Maint) / 29 KB (Vendors) | ✓ |
| post-fix all 8 rows | **434×700** | 770×700 | `320px 1fr` | ✅ | (same) | ✓ |

**Root cause** (parent-chain probe at 1440×900 viewport): the Strata "window" (an OS-paradigm draggable resizable container inside `.desktop-canvas`) opens at quadrant-spawn default (~518 px → snapped to 598 px by the auto-region-snap effect). After:

- `window__content` border (~2 px loss)
- `strata-shell` 16+16 px padding (32 px loss)
- strata sub-sidebar (~248 px allocated to `flex: 0 1 auto` first child of strata-shell)
- `s-module` 24+24 px padding (48 px loss)

…only ~268 px remains for the `.s-split-view` grid. CSS rule `grid-template-columns: 320px 1fr` resolves to `320px 0px` because the parent is narrower than the 320 px first column. List-panel claims its 320 px. Detail-panel renders width 0 × height 700 with full content (innerHTML 27 KB, `<h3>` rendered with WO title, 18 children).

**Path B (state-management) and Path D (defensive-guard) ruled out at PRE1.** DetailPanel renders correctly with full content; React state propagates correctly; no render race, no null-return, no missing-prop guard needed. Pure CSS layout collapse from window-default underflow.

**Path A.1 + A.2 combined chosen** per user direction at PRE1 GO. Defense-in-depth matches the design intent: open at a sane default that fits the 3-column grid AND degrade gracefully if the user narrows the window.

### DoR (Definition of Ready) — verbatim

- ✅ Phase-5 closed (✓ at `2acaa82` 2026-05-04).
- ✅ `Docs/Phase5_Closure_Report.md` committed.
- ✅ Phase-5 deferred-items ledger consolidated.
- ✅ CDP probe re-runnable against local dev server with inline `qualia_sidebar_groups` localStorage seeding (A2 fallback per Phase-5 5.6/5.7 measurement-script precedent).
- ✅ PRE0 DC-A 5-query discovery + Step Zero source-provenance verification per Plan v2.29 PERMANENT process change.

### 5-DC ledger (PRE0 discovery → PRE1 probe → PRE2 HALT-IF → PRE3 fix-verify → PRE4 commit)

| DC | Stage | Outcome |
|---|---|---|
| **DC-A** | PRE0 5-query | Located 5 `.s-detail-panel`-rendering modules; identified Maintenance + Vendors as Task 5.4/5.5 owners; spec assertion shape captured; phase-plan locality (`Phase_6_Plan.md` absent, to be created); GR-14 compliance (Phase-6 has no v1 source — `Phase5_Closure_Report.md §6` is authoritative substitute). HARD HALT-IF none triggered. |
| **DC-B** | PRE1 CDP probe | Failure axis isolated as **CSS layout collapse** (Path A) — not Path B/D as PRE0 leaning predicted. DetailPanel renders correctly; bug is grid-1fr-column collapse from parent-too-narrow. 8/8 phase-rows reproduce 0×700 panel pre-fix. |
| **DC-C** | PRE2 HALT-IF | Smoke-test post-fix shows 10/12 pass (panel visibility ✅; downstream spec-defects ❌). Workorder spec asserts 6 testids inside `<Section defaultOpen={false}>` (children not rendered when collapsed); vendor-compliance spec uses ambiguous Compliance-button locator that resolves to Section accordion-header instead of tab-bar. **HALT-IF triggered at 6 ≥ 4 sections threshold.** User directive: split task into 6.1a + 6.1b. |
| **DC-D** | PRE3 fix-verify | Post-fix CDP probe: 8/8 phase-rows playwrightVisible=true with 434×700 detail panel inside 2-col 320+434 layout. Container-query @container (max-width: 700px) verified to fire only when split-view is too narrow; happy-path 1100 px window keeps 2-col. Window-state localStorage shows correct 1100×800 persistence; auto-snap opt-out skips Strata. |
| **DC-E** | PRE4 commit | Working tree clean (3 source files M; helpers/auth.ts smoke-test temp-edit reverted via `git restore`; cdp_probe_task_6_1.cjs + Docs/Baselines/phase_6_task_6_1/ stay session-local untracked per CDP-probe convention). Pre-merge gates: tsc + vitest 259/259 + both vite builds + PII strict-clean all green. |

---

## §2. Strict-gate output (captured pre-merge on PR-branch HEAD)

```
$ cd qualia-shell && npx tsc -b
(exit 0)

$ npx vitest run
Test Files  37 passed (37)
     Tests  259 passed (259)
   Duration  2.75s (transform 4.08s, setup 3.08s, import 8.20s, tests 7.39s, environment 21.98s)
(exit 0)

$ rm -rf dist && VITE_APPFOLIO_SEEDS=true npx vite build
dist/assets/StrataDashboard-BqghmASj.js   1,031.26 kB │ gzip:  246.76 kB
✓ built in 3.96s
(exit 0)

$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
dist/assets/StrataDashboard-BqghmASj.js   1,031.26 kB │ gzip:  246.76 kB
✓ built in 3.85s
(exit 0)

$ cd .. && node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1359ms total).
(exit 0)
```

### Production chunk capture (both build modes)

```
PROD-CHUNK seeds=true:  StrataDashboard-BqghmASj.js  1031260  81e1fdc508b3ea6cfb4579e71224baef9f3140fa35788db323aae68c3966d1d4
PROD-CHUNK seeds=false: StrataDashboard-BqghmASj.js  1031260  81e1fdc508b3ea6cfb4579e71224baef9f3140fa35788db323aae68c3966d1d4
```

| Axis | Pre-edit (CLAUDE.md baseline @ 744e608) | Post-edit (this build) | Delta |
|---|---|---|---|
| Byte count | 1,031,260 | 1,031,260 | **IDENTICAL** — extends 17-of-17 → **18-of-18** cross-phase invariance milestone |
| SHA256 | `1ab4a9c…14ea` | `81e1fdc…d1d4` | **CHANGED** (predicted; COMPONENT-FIX class breaks SHA256 by construction — minified bundle has different content) |
| Filename | `COZxJ8Bh.js` | `StrataDashboard-BqghmASj.js` | **PATTERN SHIFT** (unexpected; 4th distinct calibration axis surfaced — see §7 entry 4) |

---

## §3. CDP render proof

Session-local probe `qualia-shell/cdp_probe_task_6_1.cjs` (NOT committed per CDP-probe convention from Tasks 3.1/3.4). Output at `Docs/Baselines/phase_6_task_6_1/cdp_probe_summary.json` + 5 screenshots. Pre-fix vs post-fix delta:

```
PRE-FIX (8 phase-rows):
  beforeClick (Maint):       rect=0×700  pwVis=false  inner=517b   children=1   h3=none  empty=true
  afterClick_50ms (Maint):   rect=0×700  pwVis=false  inner=27257b children=18  h3="Fire alarm needs replaced. Bee"
  afterClick_550ms (Maint):  rect=0×700  pwVis=false  inner=27257b children=18  h3="Fire alarm needs replaced. Bee"
  afterClick_1550ms (Maint): rect=0×700  pwVis=false  inner=27257b children=18  h3="Fire alarm needs replaced. Bee"
  beforeClick (Vendors):     rect=0×700  pwVis=false  inner=581b   children=1   h3=none  empty=true
  afterClick_50ms (Vendors): rect=0×700  pwVis=false  inner=29018b children=16  h3="2-STORY TECHNICAL ROOFING LLC"
  afterClick_550ms (Vendors):rect=0×700  pwVis=false  inner=29018b children=16  h3="2-STORY TECHNICAL ROOFING LLC"
  afterClick_1550ms (Vendors):rect=0×700 pwVis=false  inner=29018b children=16  h3="2-STORY TECHNICAL ROOFING LLC"
  afterTabClick_500ms (Vendors):rect=0×700 pwVis=false inner=27118b children=16 h3="2-STORY TECHNICAL ROOFING LLC"

POST-FIX (8 phase-rows + tab-click row):
  beforeClick (Maint):       rect=434×300  pwVis=true   inner=517b   children=1   h3=none  empty=true
  afterClick_50ms (Maint):   rect=434×700  pwVis=true   inner=27257b children=18  h3="Fire alarm needs replaced. Bee"
  afterClick_550ms (Maint):  rect=434×700  pwVis=true   inner=27257b children=18  h3="Fire alarm needs replaced. Bee"
  afterClick_1550ms (Maint): rect=434×700  pwVis=true   inner=27257b children=18  h3="Fire alarm needs replaced. Bee"
  beforeClick (Vendors):     rect=434×300  pwVis=true   inner=581b   children=1   h3=none  empty=true
  afterClick_50ms (Vendors): rect=434×700  pwVis=true   inner=29018b children=16  h3="2-STORY TECHNICAL ROOFING LLC"
  afterClick_550ms (Vendors):rect=434×700  pwVis=true   inner=29018b children=16  h3="2-STORY TECHNICAL ROOFING LLC"
  afterClick_1550ms (Vendors):rect=434×700 pwVis=true   inner=29018b children=16  h3="2-STORY TECHNICAL ROOFING LLC"
  afterTabClick_500ms (Vendors):rect=434×700 pwVis=true inner=27118b children=16  h3="2-STORY TECHNICAL ROOFING LLC"
```

**Acceptance: 8/8 phase-rows playwrightVisible=true** (was 0/8 pre-fix). The actual fix-axis gate met.

### Smoke-test 4-spec cold-start (with helpers/auth.ts inline localStorage seeding A2 — temp edit, reverted via `git restore` before staging)

```
$ npx playwright test e2e/login.spec.ts e2e/strata-nav.spec.ts e2e/appfolio-parity-workorder.spec.ts e2e/appfolio-parity-vendor-compliance.spec.ts --project=chromium --reporter=list

10 passed (33.6s)
2 failed:
  [chromium] › e2e/appfolio-parity-vendor-compliance.spec.ts:68:3 — vendor-compliance-tab testid not found (locator ambiguity — 6.1b scope)
  [chromium] › e2e/appfolio-parity-workorder.spec.ts:65:3 — wo-block-view-as-tech testid not found (Section defaultOpen={false} — 6.1b scope)
```

**Failure-locus shift (Phase-5 baseline → Phase-6 6.1a):**

- Phase-5 baseline 10/12: panel-visibility 0/2 + spec-defects masked (never reached) = effective 7/9 reachable + 0/2 panel = 10/12 nominal.
- Phase-6 6.1a 10/12: panel-visibility 2/2 ✅ + spec-defects 0/2 ❌ = 10/12.

Same headline number; **different failure axis**. Source-fix delivered the intended outcome (panel visibility); the 2 surviving failures are now 6.1b scope (spec-defect remediation).

---

## §4. /security-review

Surface scanned: 3 source files modified.

- `WindowContext.tsx` — exported new `COMPONENT_DEFAULT_SIZES` lookup; per-component opt-in default sizing. No PII surface; no secret handling; no auth-gated logic; no fetch/network surface. Defensive: `Math.min(explicit.w, desktopW − 40)` clamps to canvas bounds.
- `Desktop.tsx` — auto-region-snap effect skip clause for components in lookup. No security surface; pure UI layout.
- `StrataDashboard.css` — `container-type: inline-size` + `@container` rule. No JS execution surface. Container-query is a CSS-engine feature; no client-side polyfill needed.

No High / Medium findings. Mirror Phase-5 review-style outcome verbatim.

---

## §5. Verification matrix snapshot (Phase-6 OPENER; column header opens at this commit + sweep)

| Check | Target | Status | Reference |
|---|---|---|---|
| `tsc -b` per task | exit 0 | ✓ | §2 |
| `vitest run` per task | ≥259 | ✓ 259/259 | §2 |
| Both `vite build` modes | exit 0 | ✓ both | §2 |
| Production chunk byte-count cross-phase invariance | preserved at 1,031,260 | ✓ 18-of-18 | §2 |
| Production chunk SHA256 invariance state | break documented | ✓ predicted (COMPONENT-FIX) | §2 + §7 entry 4 |
| Production chunk filename invariance state | track | ⚠️ NEW pattern shift documented | §7 entry 4 |
| Smoke-test 4-spec cold-start | ≥10/12 | ✓ 10/12 (panel-fix axis met) | §3 |
| CDP probe re-verify on changed surface | ≥8/8 phase-rows playwrightVisible | ✓ 8/8 (was 0/8) | §3 |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | ✓ 51 files / 0 leaks | §2 |
| Manual-dispatch parity gate | green | ✓ run `25386819380` (workflow_dispatch ~9m) + run `25386818834` (auto-fired pull_request 9m48s) | §6 |
| CodeRabbit review | pass | ✓ "Review completed" | §6 |
| HALT-IF triggered (DC-C) | task split | ✓ 6.1a + 6.1b per user directive | §1 + §7 entry 7 |
| `Docs/Phase6_Task_6_1a_Completion_Report.md` | committed | ✓ this file | §8 |

---

## §6. Rollback SHA

Pre-task HEAD: `744e608` (meta-PR #44 squash; CLAUDE.md condensation).
Rollback: `git revert <task-6-1a-squash-SHA>` on `main`. No schema / migration / fixture work; rollback restores the latent layout-collapse bug + reverts auto-snap and container-query swap. Phase-5 closure SHA `2acaa82` remains intact.

---

## §7. Deferred items (7 entries)

1. **Filename-pattern-shift NEW calibration axis (4th distinct).** Production chunk filename shifted from hash-only (`COZxJ8Bh.js`) to `[name]-[hash]` (`StrataDashboard-BqghmASj.js`) without any vite.config edit. Existing `vite.config.ts` has no `chunkFileNames` / `entryFileNames` / `assetFileNames` overrides; default Vite 6.x naming is `[name]-[hash].js`. Hypothesis: Phase-5 era reports may have always observed `StrataDashboard-XXXX.js` filenames but quoted only the trailing 8-char hash as shorthand; OR my 6.1a edits added something to the chunk's import graph that gives Vite/Rollup a stable name hint where there wasn't one before. **Deferred-item for future-N investigation**; the byte-count axis (canonical signal per Plan v2.28 dual-axis reframe) is preserved at 1,031,260, so the filename shift does not block 6.1a closure. Surfaces a 4th calibration axis joining SHA256 / byte-count / chunk-count.

2. **Byte-count cross-phase invariance milestone 17-of-17 → 18-of-18.** The canonical invariance signal preserved through a production-source edit (3 source files modified affecting the StrataDashboard chunk). Validates Plan v2.28 dual-axis reframe (which moved byte-count to canonical position vs SHA256 after 5.1c break). Empirically: minification + tree-shaking absorbed the Window/Desktop/CSS deltas without changing total bundle size. Implies COMPONENT-FIX class has a structural property where small surgical edits preserve byte-count via minification-noise absorption — predict-band hypothesis for Phase-6 Block C a11y fixes.

3. **Chunk-graph isolation STRUCTURAL LAW retired at Phase-6 boundary.** Was a Phase-5-specific test-tooling property at 6 data points (5.2 MSW + 5.3 Playwright config + 5.4 spec + 5.5 spec + 5.6 measurement script + 5.7 measurement script). 6.1a is the first production-source edit and structurally distinct — the law applied to additions OUTSIDE the entry graph (test-tooling, measurement-tooling, e2e specs); it does NOT apply to source edits INSIDE the entry graph. SHA256 break is expected and predicted for this and all subsequent Block C component-fix tasks. Byte-count preservation is the new invariance signal (entry 2). Pattern fully retired — Phase-7+ tasks should not cite chunk-graph isolation as a predictive property unless they're test-tooling / measurement-tooling additions.

4. **COMPONENT-FIX 1st distinct in-repo class** (Phase-6 1st distinct class / project-wide 10th cumulative class). Distinct from all 9 prior classes: NEAR-NULL-OP carry-over (3pt) + CONSUMER-SIDE-CONTRACT-TEST (1pt) + CONSUMER-SIDE-FETCH-WRAPPER (1pt) + MSW-CONTRACT-TEST (1pt) + E2E-PLAYWRIGHT (3pt) + MEASUREMENT-ONLY (2pt) + FIXTURE-CLASS (4pt Phase-4) + FIXTURE-CLASS+SCHEMA hybrid (2pt Phase-4) + DOC-ONLY (closure cycles). Calibration axes for COMPONENT-FIX: SHA256 BREAK predicted by construction; byte-count invariance preserved (minification absorbs surgical edits per entry 2); chunk-graph isolation does NOT apply (structural law retired per entry 3); vitest delta typically +0 unless task scope includes new unit tests. Phase-6 Block C tasks (6.3/6.4/6.5) extend this class to 4 data points; the umbrella keeps cohesion for both layout-fix (6.1a) and a11y-fix (6.3-6.5) sub-shapes — re-classify only if Phase-7+ surfaces a third structurally-distinct production-chunk-edit shape.

5. **Window-default UX-shift behavioral note.** Strata dashboard window default size changed from quadrant-spawn (~518–598 px on 1200 px desktop) to **1100×800** for `'strata-dashboard'` component string. User-visible behavior: clicking the Strata sidebar widget now opens a noticeably larger window centered in the desktop canvas. This is a deliberate UX-shift, NOT a regression. If anyone questions why Strata windows "open bigger now", this §7 entry has the provenance. Other components in `COMPONENT_DEFAULT_SIZES` lookup (currently only `'strata-dashboard'`; the constant is exported for future per-component additions) inherit auto-region-snap opt-out — Desktop.tsx skips them in the snap effect to preserve the explicit-size intent.

6. **Auto-snap second-order finding.** PRE3 first re-probe attempt showed 268 px split-view despite my 1100×800 default landing in localStorage. Investigation revealed `Desktop.tsx::useEffect` was unconditionally auto-snapping every new window into the active `regionLayout` (default `'halves-h'` = left/right halves of desktop-canvas). The 1100×800 window was being immediately snapped to a 600×900 region, re-collapsing the layout. Fix: `Desktop.tsx` imports `COMPONENT_DEFAULT_SIZES` and adds `if (COMPONENT_DEFAULT_SIZES[win.component]) continue;` to skip snap for explicit-size components. This was an unanticipated second-order edit not in the original A.1 scope; surfaced empirically and absorbed into 6.1a within scope budget.

7. **🎯 6.1a HALT-IF: 6 sections asserting against `defaultOpen={false}` content + 1 ambiguous tab-button locator → task split into 6.1a + 6.1b per user directive.** PRE2 audit of the workorder spec's downstream assertions found that **all 6 of the 6** `wo-block-*` testid assertions at L102-107 are wrapped in `<Section defaultOpen={false}>` (MaintenanceModule.tsx:951-1000). The `<Section>` component conditionally renders children: `{open && <div>{children}</div>}` — when collapsed, the testid is **not in the DOM at all**, so `toBeVisible()` fails because element doesn't exist. Vendor-compliance spec uses `detailPanel.locator('button', { hasText: /^Compliance$/ })` which is **ambiguous** between the tab-bar button and a Section accordion-header button (`aria-controls="vendor-block-compliance"`). Both are spec-authored against UI states the production code never had — confirms Phase-5 §7 entry 4 finding that "the appfolio-parity specs were never CI-verified end-to-end." HALT-IF threshold was **4+ sections**; 6 ≥ 4 triggers user-directed split. **6.1b carries the spec-defect remediation**: workorder spec adds 6-section pre-expand loop; vendor-compliance spec narrows locator via `:not([aria-controls])` filter. 6.1a smoke-test acceptance relaxed from 12/12 to ≥10/12 panel-fix axis met; 12/12 deferred to 6.1b acceptance.

---

## §8. Next-task unblock

**Phase-6 row 6.1a closes with §9 main matrix + §9 Phase-6 sub-tracker row 6.1a flipping `R → ✓` at this commit. Sub-tracker row 6.1b opens as next task.**

**Phase-6 calibration baseline set:**

- 1 distinct in-repo class introduced: **COMPONENT-FIX** (1pt at 6.1a).
- Project-wide cumulative classes: **10** (9 carried from Phase-5 closure + 1 new at Phase-6 OPENER).
- Chunk-graph isolation STRUCTURAL LAW retired (Phase-5 6pt → retired at Phase-6 boundary).
- Byte-count cross-phase invariance: **18-of-18** (extends Phase-5 17-of-17).
- SHA256 invariance: **broken at 6.1a** (was 7-of-7 since 5.1c break within Phase-5; expected per COMPONENT-FIX class).
- Filename-pattern-shift NEW axis (4th distinct calibration axis).

**Carry-forward to 6.1b:**

- 6 `<Section defaultOpen={false}>` block titles to expand pre-assert in `appfolio-parity-workorder.spec.ts:102-107`: View as Maintenance Tech / Withheld Amount / Invoices / Texts / Emails / Notes (MaintenanceModule.tsx:951-1000).
- 1 ambiguous `'button', { hasText: /^Compliance$/ }` locator in `appfolio-parity-vendor-compliance.spec.ts:114` to disambiguate via `:not([aria-controls])` filter (or alternative).
- Smoke-test 4-spec cold-start gate: 12/12.
- Class extension: E2E-PLAYWRIGHT carry-over (extends 3 → 4 cross-phase data points).

**Carry-forward to 6.2 (helpers/auth.ts re-amendment):**

- helpers/auth.ts `loginAs` adds 3-line localStorage seeding for `qualia_sidebar_groups` (mirrors A2 inline pattern from `Scripts/run_axe_phase5.mjs::loginAs` and `Scripts/run_lighthouse_phase5.mjs::loginAs`).
- Gates on 6.1a + 6.1b complete.
- Class extension: CONSUMER-SIDE-FETCH-WRAPPER carry-over (extends 1 → 2 data points).

**Carry-forward to Block C (a11y arc 6.3/6.4/6.5):**

- Phase-5 a11y baseline: 13 distinct violations / 5 unique rules / 362 violating nodes / 7 critical + 6 serious / 0-of-4 pages clean. Brianna tenant page = 338 nodes (~93% of total); single-pattern fix at icon-button accessible-name resolves ~334 nodes.
- COMPONENT-FIX class extends 1 → 4 data points across Block C.
- Byte-count invariance prediction (per entry 2): preserved through small surgical a11y edits via minification-absorption.

**Carry-forward to 6.7 (perf):**

- Phase-5 LCP baseline 4653 ms / ~9.3× over v1 L228 500 ms target. Block C a11y work may move LCP — re-measurement at 6.6 captures the joint effect; 6.7 picks targeted optimization levers from the new baseline.
- Chunk-graph property is no longer relied on (retired at 6.1a per entry 3) — perf work is allowed to break it deliberately for code-splitting / lazy-routing.

**Phase-5 deferred-items ledger consolidated at `Docs/Phase5_Closure_Report.md §5` (~133 cross-phase items) — Phase-6 carries forward + adds 7 NEW Phase-6 6.1a entries (this §7).**

---

🧪 **Phase-6 OPENER. COMPONENT-FIX 1st data point. Chunk-graph isolation STRUCTURAL LAW retired. Filename-pattern-shift NEW axis. Byte-count 18-of-18 milestone. 6.1a → 6.1b task split per HALT-IF. CDP probe 8/8 phase-rows playwrightVisible.**
