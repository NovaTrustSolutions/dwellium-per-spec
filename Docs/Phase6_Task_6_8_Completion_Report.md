# Phase-6 Task 6.8 — Feature spec CI integration (Path A STRICT CONFIG-ONLY)

**Task.** Phase-6 Block D 3rd task — Feature spec CI integration. Per `Docs/Phases/Phase_6_Plan.md §4 Task 6.8`, this is a config-only addition that promotes the 3 AppFolio-parity feature specs (`strata-nav.spec.ts` + `appfolio-parity-workorder.spec.ts` + `appfolio-parity-vendor-compliance.spec.ts`) from `playwright.config.ts::chromium`-only execution (where they've been running cleanly 8/8 across 6.6/6.7 task closes) into `playwright.baseline.config.ts::testMatch` so the parity-gate CI runs them on every PR alongside the existing `screenshot-baseline.spec.ts` + `axe-baseline.spec.ts`. Gates on 6.1b + 6.2 complete (specs must be 12/12 green cold-start) — both satisfied since Phase-6 Block A close at 6.1c (`ebb9cce`) + Block B close at 6.2 (`68e35d0`). **🎯 Substantive PRE0 finding — the deferred gate-flip co-decision (per 6.5 §7 entry 4 — flipping `axe-baseline.spec.ts` `continue-on-error: true → false` at `.github/workflows/appfolio-parity-gate.yml:77`) was originally framed as a workflow-only edit; empirical PRE0 Q5 inspection of `qualia-shell/e2e/axe-baseline.spec.ts:127` surfaced the spec is soft-assert-by-design** ("Soft-assert: this is a baseline capture, not a blocker. Just log."; no `expect()` calls on violation count; spec only collects → JSON write → console.log). **Workflow-only `continue-on-error: true → false` flip is structurally no-op for axe-baseline** — strict mode still passes regardless of violation count. Making axe blocking requires: (1) SPEC EDIT adding `expect(violations).toBe(0)` post-L130; (2) workflow step-split (axe and screenshot are currently in the same step at L75-78); (3) pre-task COMPONENT-FIX on PRE0 Q3 empirical finding of **3 `button-name` violations on Leasing/Owners/Accounting module landing pages** (Block C scope was strictly the 4 enriched detail pages — Vendors/Residents/Maintenance/Properties — and the 8 routable module-landing surfaces scanned by axe-baseline.spec.ts still carry pre-Phase-6 a11y issues). The empirically-correct path forward is a 3-subtask Phase-7 Block A arc (a11y-landing-page-extension + assertion-strengthening + workflow step-split + Linux baseline capture co-decision), NOT a workflow-only edit at 6.8. **Cowork GO Path A STRICT CONFIG-ONLY verdict** — 6.8 lands as 1-line testMatch extension; the gate-flip + Linux baselines + button-name COMPONENT-FIX defer to Phase-7 as a coherent arc. **🎯 Substantive PRE0 re-attribution finding — the 9 e2e failures at 6.7's parity gate (run [25656801730](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25656801730)) were screenshot-baseline darwin-vs-Linux render diffs ONLY, NOT axe-baseline failures** (axe-baseline is soft-assert-by-design and cannot fail on violation count); this re-attribution lands in CLAUDE.md "CI Behavior" section as an honest correction to the working understanding. **🎯 Substantive PRE0 within-darwin drift finding — screenshot-baseline darwin baselines have drifted within-environment since Phase-0 2026-04-22 capture due to Phase-1→6 component changes** (full 5-spec local run at PRE2 showed 8/8 screenshot fails on darwin even against darwin baselines; 31510 pixels = 3% diff exceeds 1% threshold; distinct from the CI darwin-vs-Linux failure mode but same `continue-on-error: true` shield in CI). **🎯 E2E-PLAYWRIGHT carry-over class extends 6pt → 7pt cross-phase** (Phase-5 3pt [5.3 + 5.4 + 5.5] + 6.1b + 6.1c + 6.2 + **6.8** = 7pt; mirrors Phase_6_Plan.md row 6.2 v2.39 class-correction precedent — test-tooling-config-edit nature of 6.2's helpers/auth.ts amendment carries forward to 6.8's playwright.baseline.config.ts amendment). **Production chunk axes PRESERVED byte-for-byte** at HEAD post-6.8 against the Step-2.0 pre-edit anchor across all 3 parity-gate-canonical build modes (bare / SEEDS=true / SEEDS=false) — extends Phase-6 from 7 to **8 data points of test-tooling/DOC-only/script-rename/asset-loading-edit-then-reverted/config-only preservation pattern** (very strong inductive evidence at 8 cross-phase data points post-LAW-retirement). **🎯 6.7 TBD → `be1bd42` / `#53` resolution co-shipped at 6.8 sweep — 11 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → **6.8**); pattern fully cemented as cross-phase convention. **Paths-filter quirk extends to 10-task cross-phase scope** (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7 / **6.8** — `qualia-shell/playwright.baseline.config.ts` is at `qualia-shell/-root`, NOT covered by the `qualia-shell/src/**` paths-filter); manual-dispatch expected at PR open per established precedent. **Phase-6 Block D 3-of-4 CLOSED at 6.8** (Block A 6.1a/6.1b/6.1c ✓ + Block B 6.2 ✓ + Block C 6.3/6.4/6.5 ✓ + **Block D 6.6 ✓ + 6.7 ✓ + 6.8 ✓ + 6.9 R**). 1 config file / +5 / −1 (single testMatch array extension + JSDoc Phase-6 Task 6.8 amendment).

**Squash SHA.** `34bd76c` (PR #54). Resolved at Phase-6 Task 6.9 sweep per established "absorb into next sweep" cross-phase convention (12 consecutive sweep-resolutions).

**Sources.**

- **1 config file modified** — `qualia-shell/playwright.baseline.config.ts` (single testMatch array extension; +5 lines for 3 new spec entries with array reformat from single-line to multi-line + JSDoc Phase-6 Task 6.8 amendment block).
- **N files updated/new** (file sweep complete):
  - **NEW** `Docs/Phase6_Task_6_8_Completion_Report.md` (this file; 8-section template; §7 carries 10 entries)
  - **UPDATE** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` (v2.45 → v2.46 amendment; §9 row 6.8 R → ✓; row 6.7 TBD/PR# → `be1bd42`/`#53`; Changelog v2.46 entry)
  - **UPDATE** `Docs/Phases/Phase_6_Plan.md` (Phase status line: 6.7 TBD → `be1bd42` + 6.8 closure added; row 6.7 header TBD → resolved; row 6.8 closure narrative replaces stub; Block D 3-of-4 marker)
  - **UPDATE** `CLAUDE.md` (HEAD pointer `be1bd42` → TBD; Phase summary "9 (6.1a..6.7)" → "10 (6.1a..6.8)"; 8th data point preservation note; paths-filter quirk extension 9-task → 10-task; class-designation entry [E2E-PLAYWRIGHT 7pt cross-phase]; re-attribution of 6.7's 9 e2e failures as screenshot-baseline-only; ~10 Phase-7 deferred-items in ledger)

**No source changes to.** any `qualia-shell/src/` file (production code unchanged) / `qualia-shell/e2e/**` specs or helpers (test-tooling unchanged; helpers/auth.ts 6.2 amendment preserved unchanged; 3 specs already exist and are unmodified) / fixtures / unit tests / `qualia-shell/playwright.config.ts` (dual-mode config preserved; baseline config is the parity-gate target) / vite.config.ts / TypeScript config / `.github/workflows/appfolio-parity-gate.yml` (workflow YAML preserved; gate-flip deferred to Phase-7). **Pure config-only edit on test-tooling.**

---

## §1. Scope + DoR + 5-DC ledger

### Scope (Path A STRICT CONFIG-ONLY per Cowork GO — 0 source edits / 1 config edit / N doc edits)

**Kickoff GO:** Cowork verdict "GO Path A — STRICT CONFIG-ONLY" — three deltas to original kickoff plan:

1. **Path B/C empirically re-framed as infeasible at HEAD `be1bd42`** without a pre-req COMPONENT-FIX arc on the 3 button-name violations surfaced at PRE0 Q3 (Leasing/Owners/Accounting module landing pages). Workflow-only `continue-on-error` flip is structurally no-op for axe-baseline.spec.ts (soft-assert-by-design per L127). The 3-subtask Phase-7 Block A arc captures this empirical reality.
2. **6.7 TBD → `be1bd42` / `#53` resolution co-shipped at 6.8 sweep** per 11-consecutive-cross-phase-sweep-resolutions precedent (extends 10 → 11).
3. **Defer 9 deferred-items to Phase-7** captured at 6.8 §7 ledger: (i) 3 button-name violations on Leasing/Owners/Accounting module landing pages, (ii) axe-baseline.spec.ts assertion-strengthening `expect(violations).toBe(0)`, (iii) workflow step-split for axe vs screenshot decoupling, (iv) Linux Playwright baseline capture mechanism build, (v) Linux baseline capture for 8 surfaces, (vi) Screenshot-baseline `continue-on-error: true → false`, (vii) Stray `overview-chromium-linux.png` provenance, (viii) Lighthouse measurement variance characterization (GR-15 v2.46 amendment carry from 6.7), (ix) retries discrepancy between playwright.baseline.config.ts (0) and playwright.config.ts (CI 2) — flake-surface delta.

**Empirical PRE3 result:** **🎯 3 NEW feature specs 8/8 PASS** under `playwright.baseline.config.ts` post-edit (mirrors 8/8 at 6.7 under `playwright.config.ts::chromium`; 19.8s wallclock; helpers/auth.ts 6.2 amendment continues to seed `qualia_sidebar_groups` correctly across the new config invocation). Full 5-spec run: 16 PASS (8 axe-baseline soft-pass + 6 strata-nav + 1 workorder + 1 vendor-compliance) / 8 FAIL screenshot-baseline (pre-existing darwin-within-environment drift; not a regression introduced by 6.8; same `continue-on-error: true` shield in CI). All acceptance gates met.

### PRE0 DC-A 5-query discovery (per Plan v2.29 PERMANENT process change)

| # | Question | Finding | HALT-IF |
|---|----------|---------|---------|
| Q1 | Confirm HEAD = `be1bd42` + working tree clean | ✓ PASS — `git rev-parse HEAD` → `be1bd42cd5fd4a9025dead31585c68aba8b31b62`; `git status --short` returns zero lines; `git branch --show-current` returns `main` | NOT TRIGGERED |
| Q2 | Inspect `playwright.baseline.config.ts` + `playwright.config.ts` shapes; confirm 3 specs are clean inclusion target | ✓ PASS — `playwright.baseline.config.ts:27` currently `testMatch: ['screenshot-baseline.spec.ts', 'axe-baseline.spec.ts']`; 3-spec extension is a clean array reformat. Config is `VITE_USE_STATIC_API=true` + `npm run dev` + chromium-only + `workers: 1` + `retries: 0` — functionally identical (modulo retries) to `playwright.config.ts::chromium` default project where the 3 specs run cleanly (8/8 at 6.7). **Caveat:** baseline config has `retries: 0` vs default `retries: process.env.CI ? 2 : 0` — CI flake surface ↑ for the 3 specs under baseline; captured as Phase-7 deferred-item #9. | NOT TRIGGERED |
| Q3 | Run axe-baseline.spec.ts locally on darwin against fresh `playwright.baseline.config.ts` dev server; capture per-surface violation state at HEAD `be1bd42` | ⚠ EMPIRICAL FINDING — 8/8 PASS structurally (spec is soft-assert; cannot fail on violation count), BUT **3 violation rules surfaced** across 3 of 8 surfaces (all `button-name` critical / WCAG 4.1.2): Leasing 1 node / Owners 1 node / Accounting 1 node; the 5 other surfaces (Overview / Properties / Residents / Vendors / Maintenance) report 0 violations. Block C zero-state is scope-correct (4 enriched detail pages = 0) but the broader 8-module landing-page surface scope still carries pre-Phase-6 a11y issues. Raw at `Docs/Baselines/2026-05-11_Phase0_axe_baseline.json` (PRE0 diagnosis artifact; not for commit — overwritten on next axe-baseline run). | NOT TRIGGERED (empirical input for path verdict; Path B re-framing) |
| Q4 | Inspect `.github/workflows/appfolio-parity-gate.yml` for any `--update-snapshots` mechanism; estimate Linux baseline capture cost | ✓ PASS — L77 `continue-on-error: true` covers BOTH axe-baseline + screenshot-baseline as a single shared step (L75-78). Decoupling requires step-split. **No `--update-snapshots` mechanism exists** in the workflow — Path C Linux baseline capture would require building a new workflow (additional scope ≫ 6.8 budget). L75 step lacks step-id; flipping by spec requires either restructure (2 separate steps) or workflow_dispatch matrix. | NOT TRIGGERED |
| Q5 | Inspect `qualia-shell/e2e/axe-baseline.spec.ts` for assertion shape — is it `expect(violations).toEqual([])` per-surface, or fixture-based, or threshold-based? | 🎯 CRITICAL FINDING — **axe-baseline.spec.ts is soft-assert by design.** L127 comment: *"Soft-assert: this is a baseline capture, not a blocker. Just log."* There are NO `expect()` calls on violation count — the spec only collects into `results[]`, `console.log`s the count, and writes JSON to `Docs/Baselines/`. **Workflow-only `continue-on-error: true → false` flip is structurally no-op** — even strict mode passes regardless of violation count. Path B as originally framed in the brief is therefore not viable as a workflow-only edit. Making axe blocking requires SPEC EDIT (`expect(violations).toBe(0)` post-L130) + workflow step-split. | NOT TRIGGERED (empirical input for path verdict; Path B re-framing) |

**All 5 HARD HALT-IFs CLEAR. Path A STRICT CONFIG-ONLY confirmed; 1 config edit; Path B/C empirically re-framed as 3-subtask Phase-7 Block A arc.**

**🚩 Substantive PRE0 finding — re-attribution of 6.7's 9 e2e failures.** The brief noted "the 9 e2e failures at 6.7's parity gate (run 25656801730) included axe-baseline." Empirically this is incorrect — axe-baseline.spec.ts is soft-assert-by-design and cannot fail on violation count. The 9 failures were exclusively screenshot-baseline.spec.ts darwin-vs-Linux render diffs (Phase-0 deferred item; baselines captured on darwin 2026-04-22 / CI runs on Linux). Re-attribution lands in CLAUDE.md "CI Behavior" section.

**🚩 Substantive PRE0 finding — within-darwin screenshot baseline drift.** Full 5-spec local run at Step-2.2 surfaced **all 8 screenshot-baseline tests FAIL on darwin against darwin baselines** (31510 pixels = 3% of image; tolerance is 1%; not just darwin-vs-Linux). The Phase-0 baselines (2026-04-22) pre-date the Phase-1→6 component changes (Block C aria-labels / Section content IDs / list-panel triplets / Sidebar.css color-contrast / etc.) that shifted rendered pixel output. **NOT a regression introduced by 6.8** — these baselines were already failing on darwin pre-6.8. Captured as Phase-7 deferred-item (distinct from but related to Linux-baseline capture deferred-item).

### 5-DC ledger (DC-A through DC-E)

| Phase | Action | Result |
|-------|--------|--------|
| **DC-A** | PRE0 5-query discovery + Path B re-framing + 3-button-name-violations finding | All 5 queries PASS / HALT-IFs CLEAR; substantive Path B re-framing surfaced and routed to Cowork; GO Path A STRICT CONFIG-ONLY verdict received |
| **DC-B** | Branch creation | `phase-6/task-6.8-feature-spec-ci-integration` from `main` at `be1bd42` |
| **DC-C** | Source edits applied | **1 config file** — `qualia-shell/playwright.baseline.config.ts` testMatch extension (+5 / −1; 3 new spec entries; array reformat single-line → multi-line; JSDoc Phase-6 Task 6.8 amendment block) |
| **DC-D** | Sanity grep + gates 1-7 GREEN | tsc -b clean; vitest 258/259 LOCAL (same `calendar.test.tsx:260` pre-existing darwin-environmental flake from 6.3/6.4/6.5/6.6/6.7 §7; CI authoritative; expect 259/259 in CI); all 3 vite builds (bare + SEEDS=true + SEEDS=false) green; **chunk axes PRESERVED byte-for-byte** vs Step-2.0 anchor across all 3 build modes (`StrataDashboard-BnaHIKND.js` / 1,031,711 B / `0f9a472…ebe4` + `index-CTl84rdZ.js` / 597,519 / `768be277…10af0` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `index-DubCb24b.css` / 158,955 / `cabc7535…738f`); PII strict-clean (51 files / 0 leaks); 3 NEW feature specs 8/8 PASS under `playwright.baseline.config.ts` (19.8s); full 5-spec run 16 PASS / 8 FAIL screenshot-baseline (pre-existing within-darwin drift, not regression) |
| **DC-E** | PRE4 commit | Working tree: 1 config M (`qualia-shell/playwright.baseline.config.ts`) + N doc/config files (NEW `Docs/Phase6_Task_6_8_Completion_Report.md` + UPDATE `Docs/AppFolio_Parity_Implementation_Plan_v2.md` v2.46 amendment + UPDATE `Docs/Phases/Phase_6_Plan.md` row 6.8 closure + UPDATE `CLAUDE.md` HEAD pointer + Phase summary "9 → 10" + 8th data point + paths-filter 10-task + 6.7 9-failures re-attribution + 9 Phase-7 deferred-items). PRE0 axe-baseline diagnosis artifact at `Docs/Baselines/2026-05-11_Phase0_axe_baseline.json` stays session-local untracked (overwritten on next axe-baseline run; not a per-task closure artifact). |

### DoR (Definition of Ready) compliance check

| DoR | Status | Evidence |
|-----|--------|----------|
| Phase-plan locality (PERMANENT process change v2.29) | ✓ | PRE0 read Phase_6_Plan.md row 6.8 (L225-231) alongside parent §9 row 6.8 (L492); scope alignment confirmed at PRE0 Q2; class-correction NOT needed (E2E-PLAYWRIGHT carry-over from row 6.8 designation matches empirical execution); empirical execution adds 5pt → 7pt cross-phase per Phase_6_Plan.md row 6.8 prediction "extends to 5 cross-phase data points" — but the prediction was made under the assumption that 6.1b/6.1c/6.2 (3pt extension) hadn't yet landed; at empirical close E2E-PLAYWRIGHT = 6pt cross-phase pre-6.8 [Phase-5 3pt + 6.1b + 6.1c + 6.2] + 1 at 6.8 = 7pt fully calibrated |
| GR-14 amendment v2.32 (phase-spec authoritative for Phase-6) | ✓ | Phase_6_Plan.md is authoritative phase-spec; cites Phase5_Closure_Report.md §6 carry-forward as v1-lineage substitute |
| DC-A Step Zero source-provenance verification (PERMANENT process change Phase-4 §4) | ✓ | Verified each PRE0 query against the live filesystem state at HEAD `be1bd42` BEFORE any commit; Path B re-framing surfaced at Q5 and escalated to Cowork before proceeding |
| PRE0 mathematical-exactness signal carry-forward (GR-15 v2.42) | ✓ N/A | 6.8 is config-only; no a11y enumeration-rule classes to enumerate; mathematical-exactness signal is for a11y tasks |
| Build-mode-aware chunk-axis comparison (GR-15 v2.43) | ✓ | Pre-edit Step-2.0 baseline captured under bare `npx vite build` (parity-gate canonical mode); post-edit Step-2.5 rebuild under SAME mode; matched byte-for-byte across all 4 chunk axes; like-vs-like build-mode comparison protocol applied |

---

## §2. Strict-gate output (captured pre-merge on PR-branch HEAD)

### tsc -b

```
$ cd qualia-shell && npx tsc -b
[no output — clean]
```

✓ PASS — exit 0; no errors. (No-op since 0 source/test changes; config-only edit at playwright.baseline.config.ts is type-checked transparently.)

### vitest

```
$ cd qualia-shell && npx vitest run
 RUN  v4.1.0 /Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell

 Test Files  1 failed | 36 passed (37)
      Tests  1 failed | 258 passed (259)
   Duration  2.73s

 FAIL  src/test/appfolioParity/calendar.test.tsx > upcoming-events list RTL
   getAllByTestId('calendar-inspection-event') — Unable to find any elements
```

⚠️ DEGRADED 1-of-259 LOCAL — same pre-existing local environmental flake from 6.3/6.4/6.5/6.6/6.7 §7 (intermittent on darwin per CLAUDE.md "259/259 PASS clean local first since 6.3" — flake did NOT fire at 6.7 but fired at 6.8; classic darwin-host intermittent). CI passed 259/259 on PR #51 / #52 / #53 in succession; CI is the authoritative gate. NOT caused by 6.8 (1 config edit — structurally cannot affect calendar test).

### vite build (bare / parity-gate canonical)

```
$ cd qualia-shell && rm -rf dist && npx vite build
dist/assets/StrataDashboard-BnaHIKND.js      1,031.71 kB │ gzip: 246.89 kB
dist/assets/index-CTl84rdZ.js                  597.52 kB │ gzip: 179.98 kB
dist/assets/index-1yBoi7Al.js                   87.71 kB │ gzip:  22.21 kB
dist/assets/index-DubCb24b.css                 158.96 kB │ gzip:  21.95 kB
✓ built in 4.04s
```

✓ PASS — exit 0; all 4 chunk axes PRESERVED byte-for-byte vs Step-2.0 pre-edit anchor.

### vite build (SEEDS=true)

```
$ cd qualia-shell && rm -rf dist && VITE_APPFOLIO_SEEDS=true npx vite build
✓ built in 3.96s
```

✓ PASS — exit 0; all 4 chunk axes byte-identical to bare build.

### vite build (SEEDS=false)

```
$ cd qualia-shell && rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ built in 3.84s
```

✓ PASS — exit 0; all 4 chunk axes byte-identical to SEEDS=true.

### Production chunk axes (post-edit verification — 8th data point of preservation pattern)

```
$ for f in dist/assets/StrataDashboard-BnaHIKND.js dist/assets/index-CTl84rdZ.js dist/assets/index-1yBoi7Al.js dist/assets/index-DubCb24b.css; do
    bytes=$(wc -c < "$f"); sha=$(shasum -a 256 "$f" | awk '{print $1}'); echo "$f | $bytes B | sha256=$sha"
  done
dist/assets/StrataDashboard-BnaHIKND.js |  1031711 B | sha256=0f9a472654580cd7a5aea7f6ad994d27ebbb2413d3419edb319cfac3b729ebe4
dist/assets/index-CTl84rdZ.js           |   597519 B | sha256=768be277c34b390569377c5f5d82c70d4830872cb83836e690b6c91b5f610af0
dist/assets/index-1yBoi7Al.js           |    87711 B | sha256=638f9f069c549f1325c9d942b819dc0d5207f0887a8aebb7571690f9fbd2dab7
dist/assets/index-DubCb24b.css          |   158955 B | sha256=cabc7535fcbb5e01789de36e2c2920ad8056259eab3e431af5a7a6d2b607738f
```

| Axis | Step-2.0 pre-edit anchor (HEAD `be1bd42`) | Post-edit (HEAD post-6.8) | Result |
|------|--------------------------------------------|---------------------------|--------|
| **StrataDashboard SHA256** | `0f9a472654580cd7a5aea7f6ad994d27ebbb2413d3419edb319cfac3b729ebe4` | `0f9a472654580cd7a5aea7f6ad994d27ebbb2413d3419edb319cfac3b729ebe4` | ✓ **PRESERVED** byte-for-byte |
| **StrataDashboard filename** | `StrataDashboard-BnaHIKND.js` | `StrataDashboard-BnaHIKND.js` | ✓ **PRESERVED** byte-for-byte |
| **StrataDashboard byte-count** | `1,031,711` | `1,031,711` | ✓ **PRESERVED** byte-for-byte |
| **index-CTl84rdZ SHA256** | `768be277c34b390569377c5f5d82c70d4830872cb83836e690b6c91b5f610af0` | `768be277c34b390569377c5f5d82c70d4830872cb83836e690b6c91b5f610af0` | ✓ **PRESERVED** byte-for-byte |
| **index-CTl84rdZ byte-count** | `597,519` | `597,519` | ✓ **PRESERVED** byte-for-byte |
| **index-1yBoi7Al SHA256** | `638f9f069c549f1325c9d942b819dc0d5207f0887a8aebb7571690f9fbd2dab7` | `638f9f069c549f1325c9d942b819dc0d5207f0887a8aebb7571690f9fbd2dab7` | ✓ **PRESERVED** byte-for-byte |
| **index-1yBoi7Al byte-count** | `87,711` | `87,711` | ✓ **PRESERVED** byte-for-byte |
| **index-DubCb24b CSS SHA256** | `cabc7535fcbb5e01789de36e2c2920ad8056259eab3e431af5a7a6d2b607738f` | `cabc7535fcbb5e01789de36e2c2920ad8056259eab3e431af5a7a6d2b607738f` | ✓ **PRESERVED** byte-for-byte |
| **index-DubCb24b CSS byte-count** | `158,955` | `158,955` | ✓ **PRESERVED** byte-for-byte |

**Empirical pattern continues to hold for config-only edits at qualia-shell/-root (outside Vite entry graph).** Phase-6 data-point count extends 7 → 8 (very strong inductive evidence). The v2.43 GR-15 like-vs-like build-mode protocol applied — pre-edit anchor and post-edit verification both captured under bare `npx vite build` (parity-gate canonical mode).

### PII scan

```
$ node Scripts/verify_no_pii_leak.mjs
[OK] strict scope: 51 files scanned, 0 findings.
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1326ms total).
```

✓ PASS — 0 leaks; 51 files.

---

## §3. Feature spec verification under playwright.baseline.config.ts (3 NEW specs 8/8 PASS)

### Build + spec invocation protocol

```
$ cd qualia-shell && npx playwright test --config=playwright.baseline.config.ts e2e/strata-nav.spec.ts e2e/appfolio-parity-workorder.spec.ts e2e/appfolio-parity-vendor-compliance.spec.ts

Running 8 tests using 1 worker

  ✓  1 [chromium] › e2e/appfolio-parity-vendor-compliance.spec.ts:68:3 › AppFolio parity — 2-STORY Technical Roofing compliance › Vendors → 2-STORY → Compliance tab → 6 rows + only General Liability populated (6.3s)
  ✓  2 [chromium] › e2e/appfolio-parity-workorder.spec.ts:65:3 › AppFolio parity — WO 19511-1 round-trip (Brianna Jackson) › Maintenance → WO 19511-1 → 15-section DetailPanel + 3 windows + 2 actions log (3.6s)
  ✓  3 [chromium] › e2e/strata-nav.spec.ts:30:3 › Strata Module Navigation › can open Strata widget from sidebar (1.1s)
  ✓  4 [chromium] › e2e/strata-nav.spec.ts:43:5 › Strata Module Navigation › navigating to "Overview" does not crash (1.6s)
  ✓  5 [chromium] › e2e/strata-nav.spec.ts:43:5 › Strata Module Navigation › navigating to "Properties" does not crash (1.6s)
  ✓  6 [chromium] › e2e/strata-nav.spec.ts:43:5 › Strata Module Navigation › navigating to "Leasing" does not crash (1.6s)
  ✓  7 [chromium] › e2e/strata-nav.spec.ts:43:5 › Strata Module Navigation › navigating to "Residents" does not crash (1.6s)
  ✓  8 [chromium] › e2e/strata-nav.spec.ts:43:5 › Strata Module Navigation › navigating to "Maintenance" does not crash (1.6s)

  8 passed (19.8s)
```

**8/8 PASS** on 3 NEW feature specs under `playwright.baseline.config.ts` — mirrors 8/8 at 6.7 under `playwright.config.ts::chromium` exactly. 19.8s wallclock. helpers/auth.ts 6.2 amendment continues to seed `qualia_sidebar_groups` correctly across the new config invocation (`reuseExistingServer: !process.env.CI` reused the dev server from prior axe-baseline run; vite-dev mode parity preserved).

### Full 5-spec run (verify no regression on existing 2 specs)

```
$ cd qualia-shell && npx playwright test --config=playwright.baseline.config.ts
Running 24 tests using 1 worker
...
  16 passed (1.5m)
   8 failed
    [chromium] › e2e/screenshot-baseline.spec.ts:87:5 › Screenshot baseline — AppFolio parity modules › Overview — baseline snapshot
    [chromium] › e2e/screenshot-baseline.spec.ts:87:5 › Screenshot baseline — AppFolio parity modules › Properties — baseline snapshot
    [chromium] › e2e/screenshot-baseline.spec.ts:87:5 › Screenshot baseline — AppFolio parity modules › Leasing — baseline snapshot
    [chromium] › e2e/screenshot-baseline.spec.ts:87:5 › Screenshot baseline — AppFolio parity modules › Residents — baseline snapshot
    [chromium] › e2e/screenshot-baseline.spec.ts:87:5 › Screenshot baseline — AppFolio parity modules › Vendors — baseline snapshot
    [chromium] › e2e/screenshot-baseline.spec.ts:87:5 › Screenshot baseline — AppFolio parity modules › Owners — baseline snapshot
    [chromium] › e2e/screenshot-baseline.spec.ts:87:5 › Screenshot baseline — AppFolio parity modules › Accounting — baseline snapshot
    [chromium] › e2e/screenshot-baseline.spec.ts:87:5 › Screenshot baseline — AppFolio parity modules › Maintenance — baseline snapshot
```

**16 PASS / 8 FAIL** — full 5-spec total = 24 tests (8 screenshot + 8 axe + 6 strata-nav + 1 workorder + 1 vendor-compliance). The 8 screenshot-baseline failures are pre-existing within-darwin baseline drift (31510 pixels = 3% of image; tolerance is 1%; Phase-0 2026-04-22 baselines pre-date Phase-1→6 component changes) — NOT a regression introduced by 6.8 since these baselines were already failing on darwin pre-6.8. Same `continue-on-error: true` shield in CI applies. The 16 passing tests cover all 3 NEW feature specs (8/8) + axe-baseline 8/8 soft-pass (3 button-name violations logged but soft-asserted — not blocking).

### axe-baseline.spec.ts soft-pass detail (PRE0 Q3 diagnosis preserved)

```
[axe][Overview] 0 violation rule(s) flagged
[axe][Properties] 0 violation rule(s) flagged
[axe][Leasing] 1 violation rule(s) flagged
[axe][Residents] 0 violation rule(s) flagged
[axe][Vendors] 0 violation rule(s) flagged
[axe][Owners] 1 violation rule(s) flagged
[axe][Accounting] 1 violation rule(s) flagged
[axe][Maintenance] 0 violation rule(s) flagged
[axe] baseline written to Docs/Baselines/2026-05-11_Phase0_axe_baseline.json
```

3 violation rules across Leasing / Owners / Accounting (all `button-name` critical / WCAG 4.1.2 / 1 node each). All 8 tests PASS structurally per soft-assert design (L127). Captured as Phase-7 deferred-item #1 (3 button-name violations on non-enriched-detail-page module-landing surfaces).

### Acceptance gate verification

| Gate | Expected | Actual | Result |
|------|----------|--------|--------|
| All 5 specs execute under playwright.baseline.config.ts | ✓ all 24 tests fire | ✓ 24 tests fired (8 screenshot + 8 axe + 6 strata-nav + 1 workorder + 1 vendor-compliance) | ✓ MET |
| 3 NEW feature specs PASS (no regression vs 8/8 at 6.7) | 8/8 PASS | **8/8 PASS** | ✓ MET |
| screenshot-baseline fails on darwin-vs-Linux render diffs per established `continue-on-error: true` behavior; NOT a regression | continues to fail (or pass on darwin against darwin baselines if no drift) | 8/8 FAIL on darwin (within-darwin drift since Phase-0); NOT regression introduced by 6.8 | ✓ MET (failure mode is broader than Linux-only but still covered by `continue-on-error: true`) |
| axe-baseline soft-passes per spec design (3 button-name violations log but don't fail) | 8/8 PASS structurally; violations logged | 8/8 PASS structurally; 3 violation rules logged (Leasing / Owners / Accounting) | ✓ MET |
| Chunk axes byte-identical post-edit vs pre-edit anchor | all 4 chunks PRESERVED | all 4 chunks PRESERVED byte-for-byte | ✓ MET |
| Standard CI gates green (tsc / vitest / both vite builds / PII) | all green | tsc clean; vitest 258/259 LOCAL (darwin flake; CI authoritative); 3 vite builds green; PII strict-clean | ✓ MET |

**All 6 acceptance gates MET. Path A STRICT CONFIG-ONLY landed cleanly.**

---

## §4. Pre/post-edit working-tree view (1-config + N-doc multi-file batch)

### git diff stat (expected post-commit)

```
$ git diff --stat HEAD~1
 CLAUDE.md                                                                   | NN +-
 Docs/AppFolio_Parity_Implementation_Plan_v2.md                              | NN +-
 Docs/Phase6_Task_6_8_Completion_Report.md                                   | NNN ++++++++++++++++++++++++++++++
 Docs/Phases/Phase_6_Plan.md                                                 |  N +-
 qualia-shell/playwright.baseline.config.ts                                  | NN +-
 5 files changed, NNN insertions(+), NN deletions(-)
```

(Exact counts populated post-commit at PRE4.)

### Defensive sanity grep

```
$ git diff -- qualia-shell/playwright.baseline.config.ts | grep "spec.ts'"
+    'screenshot-baseline.spec.ts',
+    'axe-baseline.spec.ts',
+    'strata-nav.spec.ts',
+    'appfolio-parity-workorder.spec.ts',
+    'appfolio-parity-vendor-compliance.spec.ts',
[5 lines — 2 original specs preserved + 3 new specs added]

$ git diff --stat -- "*.tsx" "*.ts" qualia-shell/src/
[empty — confirms 0 source edits]

$ git diff --stat -- qualia-shell/e2e/
[empty — confirms 0 spec/helper edits]

$ git diff --stat -- .github/workflows/
[empty — confirms 0 workflow YAML edits (gate-flip deferred to Phase-7 per Path A scope-commitment)]
```

✓ PASS — 1 config M (playwright.baseline.config.ts); 0 source / 0 spec / 0 helper / 0 workflow edits confirmed; testMatch extension is the entire scope of the edit.

---

## §5. Verification matrix (16 rows)

| Row | Gate | Expected | Actual | Section |
|-----|------|----------|--------|---------|
| 1 | DC-A 5-query discovery + Path B re-framing | All 5 PASS / HALT-IFs CLEAR; Path B/C empirically re-framed; GO Path A STRICT CONFIG-ONLY | 5-of-5 PASS / 5-of-5 HALT-IFs NOT triggered; Q3 surfaced 3 button-name violations on Leasing/Owners/Accounting; Q5 surfaced axe-baseline.spec.ts is soft-assert by design; Cowork GO Path A confirmed | §1 |
| 2 | tsc -b clean | exit 0 | exit 0 | §2 |
| 3 | Vitest unit tests | 259 passing in CI | 258/259 LOCAL (same pre-existing `calendar.test.tsx:260` darwin-flake from 6.3/6.4/6.5/6.6/6.7); CI authoritative; expect 259/259 in CI | §2 |
| 4 | Vite build (bare / parity-gate canonical) | dist/ green; chunk axes preserved vs Step-2.0 anchor | green at ~4s; all 4 chunk axes PRESERVED byte-for-byte | §2 |
| 5 | Vite build SEEDS=true | dist/ green; byte-identical to bare | green at ~4s; byte-identical to bare across all 4 chunks | §2 |
| 6 | Vite build SEEDS=false | dist/ green; byte-identical to bare | green at ~4s; byte-identical to bare across all 4 chunks | §2 |
| 7 | Production chunk SHA256 axis (all 4 chunks) | PRESERVED (config-only edit doesn't affect Vite entry graph) | ✓ PRESERVED byte-for-byte across all 4 chunks | §2 |
| 8 | Production chunk filename axis | PRESERVED | ✓ PRESERVED byte-for-byte | §2 |
| 9 | Production chunk byte-count axis | PRESERVED | ✓ PRESERVED byte-for-byte | §2 |
| 10 | PII scan strict-clean | 0 leaks | 0 leaks; 51 files | §2 |
| 11 | 3 NEW feature specs under playwright.baseline.config.ts | 8/8 PASS (mirrors 6.7 chromium 8/8) | **8/8 PASS** in 19.8s | §3 |
| 12 | Full 5-spec run regression check | 16 PASS (3 new + axe soft-pass) / 8 screenshot fails (pre-existing not regression) | 16 PASS / 8 screenshot-baseline FAIL (within-darwin drift; pre-existing; covered by `continue-on-error: true`) | §3 |
| 13 | axe-baseline soft-pass per spec design | 8/8 PASS; 3 button-name violations logged | 8/8 PASS; 3 button-name violations logged (Leasing / Owners / Accounting; captured as Phase-7 deferred-item #1) | §3 |
| 14 | Defensive sanity grep | 1 config M + 0 source/spec/helper/workflow edits | grep counts match (1 / 0 / 0 / 0 / 0) | §4 |
| 15 | Manual-dispatch parity gate | green (paths-filter quirk applies; `qualia-shell/playwright.baseline.config.ts` at qualia-shell/-root NOT covered by `qualia-shell/src/**` paths-filter) | ✓ `gh workflow run "AppFolio Parity Gate" -R NovaTrustSolutions/dwellium-per-spec --ref phase-6/task-6.8-feature-spec-ci-integration` executed at PR open per established precedent (10-task cross-phase scope); merged at 6.9 sweep as PR #54 / `34bd76c` | §6 |
| 16 | CodeRabbit review | pass | ✓ (PR #54 status-check passed) | §6 |
| 17 | NEW Docs/Phase6_Task_6_8_Completion_Report.md | committed | ✓ committed (this file; 8-section template; §7 carries 10 entries) | §1 |
| 18 | UPDATE 6.7 TBD → `be1bd42` / `#53` resolution co-shipped at 6.8 sweep | ✓ | ✓ §9 row 6.7 squash-SHA cell in Plan v2 + Phase status line at top of Phase_6_Plan.md + CLAUDE.md HEAD pointer (3 spots resolved) | §1 + §7 entry 6 |
| 19 | Plan v2.45 → v2.46 amendment | committed | ✓ §9 row 6.8 R → ✓ + E2E-PLAYWRIGHT 7pt + path-A-strict-config-only narrative + 9 Phase-7 deferred-items captured; row 6.7 TBD/PR# → `be1bd42`/`#53`; v2.46 Changelog entry | §1 |

---

## §6. CI / merge protocol (post-merge fill-in)

- Branch: `phase-6/task-6.8-feature-spec-ci-integration`
- PR title: `feat(phase-6): Task 6.8 — feature spec CI integration (Path A STRICT CONFIG-ONLY) (#54)`
- CI behavior: 1 config edit at `qualia-shell/playwright.baseline.config.ts` (qualia-shell/-root) + N doc/config edits at `Docs/**` + `CLAUDE.md` root. Paths-filter check — touched paths are `Docs/**`, `CLAUDE.md`, `qualia-shell/playwright.baseline.config.ts`; ALL OUTSIDE the AppFolio Parity Gate paths filter (per CLAUDE.md "Paths-filter quirk" entry; filter covers `qualia-shell/src/**` not `qualia-shell/-root`). Expect parity gate to **NOT auto-fire on `pull_request`**; manual-dispatch fallback via `gh workflow run "AppFolio Parity Gate" -R NovaTrustSolutions/dwellium-per-spec --ref phase-6/task-6.8-feature-spec-ci-integration` (mirrors 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7 precedent for paths-outside-filter sweeps; **10-task cross-phase scope now including 6.8**).
- Manual-dispatch fallback: ✓ executed at PR open per established paths-filter quirk precedent (10-task cross-phase scope extending to 11-task at 6.9).
- CodeRabbit review: ✓ PR #54 status-check passed.
- Squash-merge target: `main`.
- Post-merge sweep ✅ **EXECUTED AT 6.9 SWEEP** per absorb-into-next-sweep precedent (12 consecutive sweep-resolutions cross-phase: meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → **6.9**): 6.8 squash SHA → `34bd76c` / PR #54 resolved in this report's §1 + §5 verification matrix rows 15-16 + §6 PR title + §6 manual-dispatch fallback + §6 CodeRabbit review (6 placeholders resolved) + §9 row 6.8 squash-SHA cell in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` + Phase status line at top of `Docs/Phases/Phase_6_Plan.md` + CLAUDE.md HEAD pointer.

---

## §7. §7 carry-forward findings (NEW + cross-phase + meta-observations)

1. **🎯 NEW SUBSTANTIVE PRE0 FINDING at 6.8 — axe-baseline.spec.ts is soft-assert by design; Path B as originally framed in kickoff brief is structurally infeasible as a workflow-only edit.** L127 comment in `qualia-shell/e2e/axe-baseline.spec.ts`: *"Soft-assert: this is a baseline capture, not a blocker. Just log."* There are NO `expect()` calls on violation count — the spec only collects into `results[]`, `console.log`s the count, and writes JSON to `Docs/Baselines/`. **Flipping `.github/workflows/appfolio-parity-gate.yml:77` `continue-on-error: true → false` is structurally no-op for axe-baseline** — strict mode still passes regardless of violation count because there's no failing assertion. Making axe blocking requires: (a) SPEC EDIT adding `expect(axeResults.violations.length).toBe(0)` after L130; (b) workflow step-split (axe and screenshot are currently in the same step at L75-78); (c) pre-task COMPONENT-FIX on the 3 button-name violations surfaced at PRE0 Q3 (Leasing/Owners/Accounting module landing pages). This re-framing was surfaced at PRE0 Q5 and routed to Cowork — Cowork GO Path A STRICT CONFIG-ONLY verdict acknowledged the original Path B framing was structurally wrong; defer the gate-flip arc to Phase-7 as a coherent 3-subtask Block A.

2. **🎯 NEW SUBSTANTIVE PRE0 FINDING at 6.8 — 3 `button-name` violations on Leasing/Owners/Accounting module landing pages.** PRE0 Q3 ran axe-baseline.spec.ts locally on darwin against HEAD `be1bd42` and surfaced 3 violation rules across 3 of 8 module landing surfaces — all `button-name` critical / WCAG 4.1.2 / 1 node each. Block C scope was strictly the 4 enriched detail pages (Vendors / Residents / Maintenance / Properties), and the broader 8-routable-surface scope still carries pre-Phase-6 a11y issues. **Block C zero-state is scope-correct (4 enriched detail pages = 0)** but does NOT extend to module landing pages. Captured as Phase-7 deferred-item #1; sister-shape to 6.3/6.4 COMPONENT-FIX arc; recommend Phase-7 Block A: a11y-landing-page-extension as a coherent extension of Phase-6 Block C remediation arc. Raw axe data at `Docs/Baselines/2026-05-11_Phase0_axe_baseline.json` (PRE0 diagnosis artifact; session-local, not committed — overwritten on next axe-baseline run; the canonical Phase-6 closure-snapshot at `Docs/Baselines/2026-05-09_Phase6_post_remediation_a11y_capture.json` remains scoped to the 4 enriched detail pages per Cowork GO at 6.5).

3. **🎯 NEW SUBSTANTIVE PRE0 FINDING at 6.8 — re-attribution of 6.7's 9 e2e failures.** The kickoff brief noted "the 9 e2e failures at 6.7's parity gate (run [25656801730](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25656801730)) included axe-baseline." Empirically this is incorrect — axe-baseline.spec.ts is soft-assert by design and cannot fail on violation count. **The 9 failures were exclusively screenshot-baseline.spec.ts darwin-vs-Linux render diffs** (Phase-0 deferred item; baselines captured on darwin 2026-04-22; CI runs on Linux). This is an honest correction to the working understanding and lands in CLAUDE.md "CI Behavior" section. Captured as Phase-7 deferred-item-adjacent note (no new ledger entry; just a documentation correction co-shipped at 6.8 sweep).

4. **🎯 NEW SUBSTANTIVE PRE0 FINDING at 6.8 — within-darwin screenshot-baseline drift since Phase-0.** Full 5-spec local run at Step-2.2 surfaced **all 8 screenshot-baseline tests FAIL on darwin against darwin baselines** (31510 pixels = ~3% of image; tolerance is `maxDiffPixelRatio: 0.01` per `screenshot-baseline.spec.ts:100`; not just darwin-vs-Linux). The Phase-0 baselines (2026-04-22) pre-date Phase-1→6 component changes (Block C aria-labels / Section content IDs / list-panel triplets / Sidebar.css color-contrast / etc.) that shifted rendered pixel output. **NOT a regression introduced by 6.8** — these baselines were already failing on darwin pre-6.8. Captured as Phase-7 deferred-item (distinct from but related to Linux-baseline capture deferred-item; both modes resolve to "needs Phase-7 Linux baseline + darwin re-capture co-decision"). Same `continue-on-error: true` shield in CI applies.

5. **🎯 E2E-PLAYWRIGHT carry-over class extends 6pt → 7pt cross-phase at 6.8 close.** Phase-5 introduced E2E-PLAYWRIGHT at 3 data points (5.3 + 5.4 + 5.5); Phase-6 added 3 more (6.1b + 6.1c + 6.2 per v2.39 class-correction); 6.8 is the 7th data point. Mirrors Phase_6_Plan.md row 6.2 v2.39 class-correction precedent — test-tooling-config-edit nature of 6.2's helpers/auth.ts addInitScript amendment carries forward to 6.8's playwright.baseline.config.ts testMatch amendment (both are test-tooling-config edits outside Vite entry graph; both preserve all production chunk axes byte-for-byte). **COMPONENT-FIX class stays at 3pt within Phase-6** (no extension; 6.8 is E2E-PLAYWRIGHT not COMPONENT-FIX). **MEASUREMENT-ONLY-with-source-rename class stays at 5pt cross-phase** (no extension at 6.8 — that class is for measurement tasks like 6.5/6.6/6.7; 6.8 is config-only).

6. **🎯 Production chunk axes PRESERVED byte-for-byte across all 3 parity-gate-canonical modes — 8th data point of preservation pattern.** Step-2.5 post-edit verification under bare `npx vite build` + Step-2.5b SEEDS=true rebuild + Step-2.5c SEEDS=false rebuild all yielded byte-identical chunk axes to the Step-2.0 pre-edit anchor across all 4 production chunks (`StrataDashboard-BnaHIKND.js` / 1,031,711 / `0f9a472…ebe4` + `index-CTl84rdZ.js` / 597,519 / `768be277…10af0` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `index-DubCb24b.css` / 158,955 / `cabc7535…738f`). This extends Phase-6 from 7 to **8 data points** of "test-tooling-only / DOC-only / script-rename / asset-loading-edit-then-reverted / config-only edits preserve all production chunk axes within a single capture session on the same env + same build mode" (very strong inductive evidence at 8 cross-phase data points post-LAW-retirement). The v2.43 GR-15 like-vs-like build-mode protocol applied — pre-edit anchor and post-edit verification both captured under bare `npx vite build` (parity-gate canonical mode).

7. **🎯 6.7 TBD → `be1bd42` / `#53` resolution co-shipped at 6.8 sweep — 11 consecutive cross-phase sweep-resolutions.** Pre-merge `TBD` placeholders in `Docs/Phases/Phase_6_Plan.md` (Phase status line top of file + Task 6.7 closure header L213 + L219 closure narrative TBD references + L221 Calibration class HEAD reference) and in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` (§9 row 6.7 squash-SHA cell L491 + v2.45 prelude opening "Phase-6 row 6.7 CLOSED ... HEAD `TBD`" reference) all resolved at 6.8 sweep per "absorb into next sweep" cross-phase convention now established at **11 consecutive sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → **6.8**); pattern fully cemented as cross-phase convention. Future tasks should NOT plan to resolve their own TBD references inline; defer-to-next-sweep is the established norm.

8. **🎯 Paths-filter quirk extends to 10-task cross-phase scope.** `qualia-shell/playwright.baseline.config.ts` is at `qualia-shell/-root`, NOT covered by the `qualia-shell/src/**` paths-filter at `.github/workflows/appfolio-parity-gate.yml:5-29`. 6.8 extends the established 9-task cross-phase precedent (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7) to **10-task** (adding 6.8). Manual-dispatch expected at PR open per established precedent. CLAUDE.md "Paths-filter quirk" entry updated to reflect 10-task scope at 6.8 sweep.

9. **🎯 Phase-6 Block D 3-of-4 CLOSED at 6.8; next: 6.9 Phase-6 closer.** Phase-6 sub-tracker (Plan v2.46): 11 rows total — 6.1a ✓ + 6.1b ✓ + 6.1c ✓ + 6.2 ✓ + 6.3 ✓ + 6.4 ✓ + 6.5 ✓ + 6.6 ✓ + 6.7 ✓ + **6.8 ✓** + 6.9 R. Block A (detail panel + spec remediation) CLOSED at 6.1c; Block B (helpers/auth.ts amendment) CLOSED at 6.2; Block C (a11y arc) CLOSED at 6.5; Block D (perf + CI integration + closure) NOW 3-of-4 CLOSED at 6.8 (6.6 + 6.7 + **6.8**); only 6.9 (Phase-6 closer) remains in Block D. **82% phase complete → 91% phase complete at 6.8** (10 of 11 tasks closed); 6.9 is the single-closure-per-phase precedent (mirrors Phase-1 + Phase-3 + Phase-4 + Phase-5).

10. **🎯 9 Phase-7 deferred-items captured at 6.8 §7 ledger.** Path A scope-commitment deferred substantial work to Phase-7 as a coherent arc; the 9 items below should anchor Phase-7 Block A (a11y-landing-page-extension + axe-baseline gate-flip co-decision arc) and Block B (Linux-baseline + screenshot-baseline co-decision arc) planning:
    - **#1** — 3 button-name violations on Leasing/Owners/Accounting module landing pages (sister-shape to 6.3/6.4 COMPONENT-FIX arc; recommend Phase-7 Block A: a11y-landing-page-extension)
    - **#2** — axe-baseline.spec.ts assertion-strengthening (`expect(axeResults.violations.length).toBe(0)` after L130; gated on #1 landing)
    - **#3** — Workflow step-split for axe vs screenshot decoupling (`.github/workflows/appfolio-parity-gate.yml:75-78` becomes 2 separate steps with distinct `continue-on-error` directives; gated on #2 landing)
    - **#4** — Linux Playwright baseline capture mechanism build (CI workflow_dispatch + `--update-snapshots`; ties to Phase-0 deferred-item at `Docs/Baselines/phase_0_0_exit_gate_report.md` "Deferred Item" section L54-65)
    - **#5** — Linux baseline capture for 8 surfaces (after #4; produces 8 `*-chromium-linux.png` baselines in `qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/`)
    - **#6** — Screenshot-baseline `continue-on-error: true → false` (after #5; requires within-darwin baseline re-capture as well per §7 entry 4 — Phase-0 baselines drift since Phase-1→6 component changes)
    - **#7** — Stray `overview-chromium-linux.png` provenance at `qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/overview-chromium-linux.png` (1 of 8 Linux baselines already present — either Linux capture was partial-then-abandoned OR auto-generated on a Linux CI run; investigate at Phase-7 #4 build; either re-use as part of #5 or delete as stale)
    - **#8** — Lighthouse measurement variance characterization (carry from 6.7 §7 — range 2,399 ms across n=5 = ~5× Phase-0 variance; possible Lever-1-induced waterfall non-determinism hypothesis not validated; recommend GR-15 inclusion at v2.46 amendment co-shipped at 6.8 sweep)
    - **#9** — `playwright.baseline.config.ts::retries: 0` vs `playwright.config.ts::retries: process.env.CI ? 2 : 0` flake-surface delta — baseline config has stricter retry policy than default; CI flake surface ↑ for the 3 NEW feature specs; if specs flake under baseline config's retries: 0 post-merge, that becomes empirical evidence to address at Phase-7 close

---

## §8. Closure (≥7 entries — kickoff quoted ≥7-entry §7 envelope)

1. ✅ **PRE0 DC-A 5-query discovery PASS** — all 5 queries clean (Q1 + Q4 clean; Q2 surfaced retries discrepancy as deferred-item #9; Q3 surfaced 3 button-name violations as deferred-item #1; Q5 surfaced axe-baseline soft-assert design as Path B re-framing critical input); all HALT-IFs NOT triggered; substantive Path B re-framing surfaced at PRE0 + routed to Cowork before proceeding.
2. ✅ **Path A STRICT CONFIG-ONLY applied as Cowork GO** — 1 config edit (qualia-shell/playwright.baseline.config.ts testMatch extension) + N doc/config edits; within envelope.
3. ✅ **All pre-merge gates GREEN** (with one local environmental flake captured as carry-forward from 6.3-6.7 §7 — `calendar.test.tsx:260` darwin-environmental flake; CI authoritative at 259/259) — tsc clean; 3 vite builds green (bare / SEEDS=true / SEEDS=false); PII strict-clean (51 files / 0 leaks); 3 NEW feature specs 8/8 PASS under playwright.baseline.config.ts (19.8s); full 5-spec run 16 PASS / 8 screenshot-baseline FAIL (pre-existing within-darwin drift; not regression introduced by 6.8).
4. ✅ **🎯 Production chunk axes PRESERVED byte-for-byte against Step-2.0 pre-edit anchor across all 3 parity-gate-canonical build modes** — extends Phase-6 from 7 to **8 data points** of test-tooling/DOC-only/script-rename/asset-loading-edit-then-reverted/config-only preservation pattern (very strong inductive evidence at 8 cross-phase data points post-LAW-retirement).
5. ✅ **🎯 NEW SUBSTANTIVE PRE0 FINDING #1 — axe-baseline.spec.ts is soft-assert by design** — Path B as originally framed in kickoff brief is structurally infeasible as a workflow-only edit; requires 3-subtask Phase-7 Block A arc; captured as §7 entry 1 + Phase-7 deferred-items #2 + #3.
6. ✅ **🎯 NEW SUBSTANTIVE PRE0 FINDING #2 — 3 button-name violations on Leasing/Owners/Accounting module landing pages** — Block C scope was strictly the 4 enriched detail pages; 8-routable-surface scope still carries pre-Phase-6 a11y issues; captured as §7 entry 2 + Phase-7 deferred-item #1.
7. ✅ **🎯 NEW SUBSTANTIVE PRE0 FINDING #3 — re-attribution of 6.7's 9 e2e failures as screenshot-baseline-only** — axe-baseline.spec.ts cannot fail on violation count per soft-assert design; correction lands in CLAUDE.md "CI Behavior" section; captured as §7 entry 3.
8. ✅ **🎯 NEW SUBSTANTIVE PRE0 FINDING #4 — within-darwin screenshot-baseline drift since Phase-0** — distinct from but related to Linux-baseline capture deferred-item; captured as §7 entry 4 + Phase-7 deferred-item #6.
9. ✅ **🎯 E2E-PLAYWRIGHT carry-over class extends 6pt → 7pt cross-phase** — Phase-5 3pt + 6.1b + 6.1c + 6.2 + 6.8 = 7pt fully calibrated; mirrors Phase_6_Plan.md row 6.2 v2.39 class-correction precedent.
10. ✅ **🎯 6.7 TBD → `be1bd42` / `#53` resolution co-shipped at 6.8 sweep** — 11 consecutive cross-phase sweep-resolutions pattern fully cemented; resolved in 3 spots (Plan v2 §9 row 6.7 squash-SHA cell + Plan v2 v2.45 prelude + Phase_6_Plan.md Phase status line + Task 6.7 closure narrative TBD references + CLAUDE.md HEAD pointer = 5+ spots actually).
11. ✅ **🎯 Paths-filter quirk extends to 10-task cross-phase scope** — 6.8 extends 9-task precedent (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7) to 10-task adding 6.8; manual-dispatch expected at PR open.
12. ✅ **Plan v2.45 → v2.46 amendment** — §9 row 6.8 R → ✓ + E2E-PLAYWRIGHT 7pt + Path A STRICT CONFIG-ONLY narrative + 9 Phase-7 deferred-items captured; row 6.7 TBD/PR# → `be1bd42`/`#53`; v2.46 Changelog entry; v2.45 prelude demoted to historical blockquote with closure note appended.
13. ✅ **NEW Docs/Phase6_Task_6_8_Completion_Report.md** committed (this file; 8-section template; §7 carries 10 entries).
14. ✅ **CLAUDE.md updated** — HEAD pointer + Phase-6 PRs row "9 → 10" + 8th data point preservation note + paths-filter quirk extension to 10-task cross-phase + class-designation entry [E2E-PLAYWRIGHT 7pt cross-phase] + re-attribution of 6.7's 9 e2e failures as screenshot-baseline-only + 9 Phase-7 deferred-items in ledger + 6.7 TBD resolved within HEAD bullet.
15. ✅ **Phase-6 Block D 3-of-4 CLOSED** — Block A (6.1a + 6.1b + 6.1c) + Block B (6.2) + Block C (6.3 + 6.4 + 6.5) complete; Block D (6.6 + 6.7 + **6.8** ✓) 3-of-4; only 6.9 (Phase-6 closer) remains.

🧪 **Phase-6 6.8 CLOSED. Feature spec CI integration landed: 3 NEW feature specs (`strata-nav.spec.ts` + `appfolio-parity-workorder.spec.ts` + `appfolio-parity-vendor-compliance.spec.ts`) promoted to `playwright.baseline.config.ts::testMatch` and verified 8/8 PASS under the new config (mirrors 6.7's 8/8 under playwright.config.ts::chromium). Gate-flip co-decision deferred to Phase-7 as a coherent 3-subtask Block A arc (a11y-landing-page-extension on 3 button-name violations + axe-baseline assertion-strengthening + workflow step-split) per Path B empirical re-framing at PRE0 Q5 (axe-baseline.spec.ts is soft-assert by design; workflow-only flip is structurally no-op). E2E-PLAYWRIGHT carry-over class extends 6pt → 7pt cross-phase. Production chunk axes PRESERVED byte-for-byte vs Step-2.0 anchor across all 3 parity-gate-canonical build modes (8th Phase-6 data point of test-tooling/DOC-only/config-only preservation pattern). 6.7 TBD → `be1bd42` / `#53` resolution co-shipped (11 consecutive sweep-resolutions). Paths-filter quirk extends to 10-task cross-phase scope. Phase-6 Block D 3-of-4 CLOSED; only 6.9 Phase-6 closer remains.**
