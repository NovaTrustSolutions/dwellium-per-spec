# Phase-6 Task 6.4 — Targeted a11y fixes (color-contrast / select-name / aria-valid-attr-value / scrollable-region-focusable / residual button-name)

**Task.** Resolve all remaining 33 a11y violation nodes across 4 enriched detail pages per `Docs/Baselines/2026-05-09_Phase6_task_6_3_a11y_capture.json` (post-6.3 baseline). 13 source-line edits across 6 component files. **🎯 v1 L230 ZERO WCAG AA violations threshold MET — full compliance achieved.** Phase-5 Task 5.7 §0 declared the v1 L230 threshold "structurally unattainable without dedicated remediation work"; Phase-6 Block C (6.3 + 6.4) is exactly that dedicated remediation arc, and the threshold is now MET — 33 → **0** violations across all 4 detail pages (-100% reduction). Cross-phase trajectory: 362 (Phase-5 baseline 2026-05-04) → 33 (post-6.3 2026-05-09) → **0** (post-6.4 2026-05-09); -100% cumulative reduction. **COMPONENT-FIX carry-over class** — Phase-6 3rd distinct data point of class (extends 2pt → 3pt within Phase-6; project-wide 10 cumulative classes unchanged; A11Y-COMPONENT-FIX shape continues from 6.3 — both 6.3 and 6.4 share production-source A11Y aria-attribute additions across multiple modules). **🎯 PRE0 mathematical-exactness signal — REFINEMENT at 6.4** (per 6.3 §7 entry 1 carry-forward) — math `(rule-count) ÷ (per-pattern-count)` worked for **4-of-5 rules** at 6.4: color-contrast 8÷4=2 (single-pattern partial confirmed, 2 distinct sidebar elements × 4 pages); aria-valid-attr-value 15÷15=1 (single-pattern fully confirmed, Section component bug × 15 instances); select-name 4÷4=1 (single-pattern fully confirmed, unlabeled `<select>` × 4 instances); scrollable-region-focusable 2÷2=1 (single-pattern fully confirmed, `.s-list-panel` × 2 instances). **FAILED for button-name** (4 nodes split 1+1+2 across pages → 2 distinct sub-patterns: ProfileSpaces Send icon + s-btn-ghost RefreshCw; required CDP probe `cdp_probe_task_6_4.cjs` to disambiguate). **Refinement for GR-15 PERMANENT process changes**: the math is necessary-but-not-sufficient. When per-page distribution is uneven (not all pages have same count), CDP probe is still required to characterize sub-patterns. Recommended for capture in GR-15 at v2.41 amendment. **🎯 SHA256 axis BREAK predicted + observed** — `6c17f2f…a768` → `0f9a472…ebe4` (production-source edit class structurally breaks SHA256 by construction; mirrors 6.1a + 6.3). **🎯 Filename hash rotation observed** — `StrataDashboard-DhcqiSlI.js` → `StrataDashboard-BnaHIKND.js` (the `[name]-[hash]` filename pattern shifted at 6.1a is preserved across 6.2 + 6.3 + 6.4, validating it's structural-not-incidental at 4 cross-phase data points). **🎯 byte-count axis BREAK** — `1,031,359` → `1,031,711` (**+352 bytes**, slightly above kickoff prediction range +50-200 due to 13 source-line edits across 6 files including Sidebar.css multi-line WCAG-rationale comment; reset to **2-of-2** post-6.3 reset → reset again at 6.4 since byte-count rotated; effectively 1-of-1 from 6.4 forward). **Vitest 259 → 258 LOCAL** persists (same `calendar.test.tsx:260` darwin-environmental flake from 6.3 §7 entry 7; CI is the authoritative gate; expect 259/259 in CI). **🎯 Smoke-test 4-spec cold-start: 12/12 PASS** on chromium project (kickoff acceptance criterion met; helpers/auth.ts permanent amendment from 6.2 continues to seed correctly across the production-source edits). **🎯 Plan-v-reality drift documented** — Phase_6_Plan.md row 6.4 said "~28 nodes" target but actual at 6.4 PRE0 was 33 nodes (28 baseline + 5 NEW Brianna `aria-valid-attr-value` surfaced post-Task-6.1a layout fix and confirmed at 6.3 axe re-measurement); Plan v2.41 amendment notes the reconciliation. **🎯 6.3 TBD → `13c6692` / #49 resolution co-shipped** at 6.4 sweep per absorb-into-next-sweep cross-phase convention now established at **7 consecutive sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4); pattern fully cemented as cross-phase convention. **Phase-6 Block C 2-of-3 closed** — 6.3 ✓ + 6.4 ✓; only 6.5 (a11y closure cleanup + axe-baseline.spec.ts re-enable assessment) remains in Block C. With 0 residual violations at 6.4, **6.5 may close as a near-no-op cleanup** — the only remaining substantive work is the axe-baseline.spec.ts re-enable assessment (Phase-0-era informational gate; flipping to blocking is now structurally viable since violations = 0). **3-instance RefreshCw pattern closure** — preventive aria-label added on PropertiesModule.tsx:522 RefreshCw button (axe didn't detect because Property page rendered another button instead, but source-grep confirmed identical pattern as Vendors:668 + Maintenance:513); all 3 instances now consistently aria-labeled across all 3 modules; future module additions following this pattern should inherit the convention.

**Squash SHA.** `fc3ce46` (PR #50). Resolved at 6.5 sweep per absorb-into-next-sweep cross-phase convention (8 consecutive sweep-resolutions: meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5).

**Sources.**

- 6 source files modified (+14 / −13 net; below 3-6 file kickoff envelope at the high end with the +1 PropertiesModule preventive RefreshCw):
  - `qualia-shell/src/components/Sidebar/Sidebar.css` (+2 / −1; bumped `.sidebar__panel-title` color from `var(--text-tertiary, #64748b)` resolving to measured `#5f6570` → `#94a3b8` for ≥4.5 WCAG AA contrast on `#15181d` background; +2-line WHY comment justifying the constant choice and citing the measurement)
  - `qualia-shell/src/components/StrataDashboard/modules/VendorsModule.tsx` (+5 / −5; 5 edits: Section content `<div>` `id={\`vendor-block-${slug}\`}` add at L98 + RefreshCw button `aria-label="Refresh vendors"` at L668 + 2 select aria-labels at L707 (`aria-label="Filter vendors by compliance status"`) + L717 (`aria-label="Filter vendors by property"`) + `.s-list-panel` `tabIndex={0} role="region" aria-label="Vendor list"` at L729)
  - `qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx` (+3 / −3; 3 edits: Section content `<div>` `id={\`tenant-block-${slug}\`}` add at L146 + 2 select aria-labels at L740 (`aria-label="Filter residents by property"`) + L744 (`aria-label="Filter residents by lease expiration"`))
  - `qualia-shell/src/components/StrataDashboard/modules/MaintenanceModule.tsx` (+2 / −2; 2 edits: RefreshCw button `aria-label="Refresh maintenance items"` at L513 + `.s-list-panel` `tabIndex={0} role="region" aria-label="Maintenance work-order list"` at L597)
  - `qualia-shell/src/components/StrataDashboard/modules/PropertiesModule.tsx` (+1 / −1; 1 edit: RefreshCw button `aria-label="Refresh properties"` at L522 — preventive per user GO Path 2 since Property page rendered another button at axe scan time but source-grep confirmed identical pattern as Vendors+Maintenance)
  - `qualia-shell/src/components/StrataDashboard/modules/ProfileSpaces.tsx` (+1 / −1; 1 edit: Send icon button `aria-label="Add note"` at L404 — fixes 2 nodes by construction since ProfileSpaces is rendered via PropertiesModule:2197 + MaintenanceModule:677, so a single source fix resolves the Property + Maintenance violations simultaneously)
- 5 doc files updated/new:
  - **NEW** `Docs/Phase6_Task_6_4_Completion_Report.md` (this file; 8-section template)
  - **NEW** `Docs/Baselines/2026-05-09_Phase6_task_6_4_a11y_capture.json` (post-fix axe-core re-measurement raw data; 2 KB; mirrors `Docs/Baselines/2026-05-09_Phase6_task_6_3_a11y_capture.json` schema; ZERO violations across all 4 pages; `task` field amended in-place to identify Phase-6 6.4 origin since the capture script `Scripts/run_axe_phase5.mjs` was reused without modification)
  - **UPDATE** `Docs/Phase6_Task_6_3_Completion_Report.md` (TBD → `13c6692` / PR #49 resolution; §1 squash SHA + §5 verification matrix CI rows + §6 PR title)
  - **UPDATE** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` (v2.40 → v2.41 amendment; §9 row 6.3 TBD/PR# → `13c6692`/`#49`; row 6.4 R → ✓ + COMPONENT-FIX 3pt + a11y delta narrative; Changelog v2.41 entry; GR-15 PERMANENT process refinement note for PRE0 mathematical-exactness signal — math is necessary-but-not-sufficient when per-page distribution is uneven)
  - **UPDATE** `Docs/Phases/Phase_6_Plan.md` row 6.4 closure narrative
  - **UPDATE** `CLAUDE.md` (HEAD pointer; Phase-6 PRs "5 (6.1a, 6.1b, 6.1c, 6.2, 6.3)" → "6 (6.1a, 6.1b, 6.1c, 6.2, 6.3, 6.4)"; Conventions block 3-instance RefreshCw aria-label pattern entry; production chunk axes update with SHA256 break + filename hash rotation + byte-count delta; resolve 6.3 TBD → `13c6692`; A11y violation count update 33 → 0; v1 L230 threshold MET narrative)

**No source changes to.** packages/types/index.ts (canonical surface unchanged) / strataApi.{static,backend,ts} runtime code (Task 5.1c X-Qualia-API: v2 emission preserved) / fixtures (envelope preserved per kickoff "NO source-of-truth fixture changes") / unit tests (no test gap — verification via axe re-run is the structural fix-axis gate) / Playwright config / qualia-shell/package.json / e2e helpers/auth.ts (6.2 amendment preserved unchanged) / e2e specs.

---

## §1. Scope + DoR + 5-DC ledger

### Scope (Path A + Path 2 preventive RefreshCw — 13 source edits across 6 files)

**Kickoff GO Path 2:** Path A (12 edits / 5 files: Sidebar.css color + Vendors+Residents Section ids + 3 button-name aria-labels [ProfileSpaces Send + Vendors+Maint RefreshCw] + 4 select aria-labels + 2 list-panel tabIndex) + preventive RefreshCw aria-label on PropertiesModule.tsx:522 (1 additional edit / 1 additional file = 13 edits / 6 files total). User rationale: PropertiesModule:522 is grep-verified same source pattern as Vendors:668 + Maintenance:513; axe scan on Property page rendered another button so didn't detect, but template-level coherent fix closes all 3 instances simultaneously.

**Empirical PRE3 result:** **🎯 33 → 0 violations across all 4 pages — 100% elimination — v1 L230 ZERO WCAG AA threshold MET.** All target rules cleared: aria-valid-attr-value 15 → 0 (Section content `id` adds linked the dangling `aria-controls` references); color-contrast 8 → 0 (single CSS rule in Sidebar.css fixed 8 nodes); button-name 4 → 0 (3 source aria-labels resolve all 4 detected nodes; ProfileSpaces fix is shared so 1 source edit = 2 nodes); select-name 4 → 0 (4 select aria-labels); scrollable-region-focusable 2 → 0 (2 list-panel tabIndex+role+aria-label triplets).

### PRE0 DC-A 5-query discovery (per Plan v2.29 PERMANENT process change)

| # | Question | Finding | HALT-IF |
|---|----------|---------|---------|
| Q1 | Enumerate the remaining 33 violation nodes per-page per-rule | ✓ PASS — script-extracted from `Docs/Baselines/2026-05-09_Phase6_task_6_3_a11y_capture.json::perPage`; sum verified = 33 exact: aria-valid-attr-value 15 (vendor 10 + brianna 5) + color-contrast 8 (2 × 4 pages) + button-name 4 (property 1 + vendor 1 + maint 2) + select-name 4 (vendor 2 + brianna 2) + scrollable-region-focusable 2 (vendor 1 + maint 1) | NOT TRIGGERED |
| Q2 | For each rule, identify source-code locations | ✓ PASS — color-contrast: `Sidebar.css:591-597 .sidebar__panel-title`; aria-valid-attr-value: `VendorsModule.tsx:80-100` Section + `ResidentsModule.tsx:125-148` Section (each module has its OWN inline Section component — NOT shared); button-name sub-pattern A (Send icon): `ProfileSpaces.tsx:404-407` rendered via PropertiesModule:2197 + MaintenanceModule:677; button-name sub-pattern B (RefreshCw ghost): `VendorsModule.tsx:668` + `MaintenanceModule.tsx:513` + `PropertiesModule.tsx:522` (3 instances; only Vendor + Maint detected); select-name: `VendorsModule.tsx:707` + `:717` + `ResidentsModule.tsx:740` + `:744`; scrollable-region-focusable: `VendorsModule.tsx:729` + `MaintenanceModule.tsx:597` `.s-list-panel` instances | NOT TRIGGERED |
| Q3 | CDP probe for aria-valid-attr-value root-cause + button-name disambiguation | ✓ PASS — session-local `cdp_probe_task_6_4.cjs` (NOT committed; mirrors prior 6.x probes) ran across all 4 detail pages; aria-valid-attr-value confirmed as 1 root pattern (Section component renders `aria-controls="..."` but content `<div>` lacks matching `id` — 1 fix per module); button-name disambiguated as 2 sub-patterns (ProfileSpaces Send icon × 2 + RefreshCw ghost × 2 = 4 nodes) — required CDP probe because per-page distribution was uneven (1+1+2 across 3 pages) which broke the PRE0 mathematical-exactness signal | NOT TRIGGERED |
| Q4 | Source-provenance Step Zero | ✓ PASS — `Docs/Phases/Phase_6_Plan.md` row 6.4 (L165-173) verbatim aligns with discovery on the 4 target rules; minor Plan-v-reality drift on node count (~28 in plan vs 33 actual; 5 NEW Brianna aria-valid-attr-value surfaced post-Task-6.1a) captured for §7 entry; Plan v2.41 amendment notes the reconciliation in row 6.4 closure narrative | NOT TRIGGERED |
| Q5 | Class-correction check | ✓ PASS — Phase_6_Plan.md row 6.4 designates COMPONENT-FIX class extends 2pt → 3pt; this is CORRECT (6.4 mirrors 6.3 as production-source A11Y-COMPONENT-FIX shape); no correction needed at v2.41 amendment | NOT TRIGGERED |

**All 5 HARD HALT-IFs CLEAR. Path 2 confirmed; 13 source edits applied; 33 → 0 violations achieved.**

### 5-DC ledger (DC-A through DC-E)

| Phase | Action | Result |
|-------|--------|--------|
| **DC-A** | PRE0 5-query discovery + CDP probe | All 5 queries PASS; all HALT-IFs CLEAR; CDP probe complete with full per-node attribution; Path 2 confirmed |
| **DC-B** | Branch creation | `feat/phase-6-task-6-4-targeted-a11y-fixes` from `main` at `13c6692` |
| **DC-C** | Source edits applied | 6 source files (+14 / −13 net); 13 source-line edits across Sidebar.css + VendorsModule.tsx + ResidentsModule.tsx + MaintenanceModule.tsx + PropertiesModule.tsx + ProfileSpaces.tsx |
| **DC-D** | Sanity grep + gates 1-7 GREEN | tsc -b clean; vitest 258/259 LOCAL (1 pre-existing `calendar.test.tsx:260` darwin-environmental flake from 6.3 §7 entry 7; CI authoritative); both vite builds (SEEDS=true + SEEDS=false) green; chunk axes ROTATED (SHA256 BREAK + filename hash rotation + byte-count +352); PII scan strict-clean; smoke-test 12/12 PASS on chromium project; **a11y axe re-measurement: 33 → 0 violations across all 4 pages (100% elimination; v1 L230 ZERO WCAG AA threshold MET)** |
| **DC-E** | PRE4 commit | Working tree: 6 source files M + 5 doc files (Plan v2.41 prelude + Changelog v2.41 entry + 6.3 TBD resolution + NEW 6.4 completion report + NEW Baselines/2026-05-09_Phase6_task_6_4_a11y_capture.json + Phase_6_Plan.md row 6.4 closure + CLAUDE.md HEAD pointer + Phase summary "5 → 6" + Conventions block 3-instance RefreshCw entry + a11y violation count 33 → 0). cdp_probe_task_6_4.cjs stays session-local untracked per CDP-probe convention. |

### DoR (Definition of Ready) compliance check

| DoR | Status | Evidence |
|-----|--------|----------|
| Phase-plan locality (PERMANENT process change v2.29) | ✓ | PRE0 read Phase_6_Plan.md row 6.4 (L165-173) alongside parent §9 row 6.4; scope alignment confirmed at PRE0 Q4; Plan-v-reality drift on node count surfaced |
| GR-14 amendment v2.32 (phase-spec authoritative for Phase-6) | ✓ | Phase_6_Plan.md is authoritative phase-spec; cites Phase5_Closure_Report.md §6 carry-forward as v1-lineage substitute |
| DC-A Step Zero source-provenance verification (PERMANENT process change Phase-4 §4) | ✓ | Verified each rule's source location via grep + CDP probe BEFORE any edit; mathematical-exactness signal applied at PRE0 (worked for 4-of-5 rules; CDP probe disambiguated button-name) |
| PRE0 mathematical-exactness signal (NEW PERMANENT process discovery from 6.3 §7 entry 1) | ✓ refined | Math `(rule-count) ÷ (per-pattern-count)` works for true single-pattern violations (4-of-5 rules at 6.4); CDP probe still required when per-page distribution is uneven (button-name 1+1+2 → 2 sub-patterns); REFINEMENT for GR-15: necessary-but-not-sufficient |
| 3-instance pattern closure (NEW at 6.4 per user GO Path 2) | ✓ | Preventive RefreshCw aria-label on PropertiesModule.tsx:522 closes the source-pattern across all 3 module instances (Vendors+Maint+Properties); future module additions following the pattern should inherit the convention; capture in CLAUDE.md Conventions block |

---

## §2. Strict-gate output (captured pre-merge on PR-branch HEAD)

### tsc -b

```
$ cd qualia-shell && npx tsc -b
[no output — clean]
```

✓ PASS — exit 0; no errors.

### vitest

```
$ cd qualia-shell && npx vitest run
 RUN  v4.1.0 /Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell

 Test Files  1 failed | 36 passed (37)
      Tests  1 failed | 258 passed (259)
   Start at  12:29:57
   Duration  2.81s

 FAIL  src/test/appfolioParity/calendar.test.tsx > upcoming-events list RTL
   getAllByTestId('calendar-inspection-event') — Unable to find any elements
```

⚠️ DEGRADED 1-of-259 — same pre-existing local environmental flake from 6.3 §7 entry 7 (`vi.useFakeTimers()` + `vi.setSystemTime(new Date('2026-04-24T12:00:00.000Z'))` + `setTimeout(r, 50)` cross-bleed on darwin host); CI passed 259/259 on PR #49 at HEAD `2ee3e4c` (same logical code as `13c6692` post-squash) on 2026-05-09T09:28Z; CI is the authoritative gate. NOT caused by 6.4 edits; ResidentsModule isolation 12/12 PASS confirms 6.4 doesn't introduce ResidentsModule regressions; same for VendorsModule + MaintenanceModule + PropertiesModule + ProfileSpaces (no dedicated test files but smoke-test 12/12 cold-start covers integration paths).

### vite build (SEEDS=true)

```
$ cd qualia-shell && rm -rf dist && npx vite build
dist/assets/StrataDashboard-BnaHIKND.js      1,031.71 kB │ gzip: 246.91 kB
✓ built in 3.92s
```

✓ PASS — exit 0; chunk filename rotated `StrataDashboard-DhcqiSlI.js` → `StrataDashboard-BnaHIKND.js`; raw byte-count `1,031,711` (was `1,031,359`; +352 bytes, slightly above kickoff +50-200 prediction range due to 13 source-line edits + Sidebar.css multi-line WCAG-rationale comment).

### vite build (SEEDS=false)

```
$ cd qualia-shell && VITE_APPFOLIO_SEEDS=false npx vite build
dist/assets/StrataDashboard-BnaHIKND.js      1,031.71 kB │ gzip: 246.91 kB
✓ built in 3.79s
```

✓ PASS — exit 0; identical chunk to SEEDS=true.

### Production chunk axes (post-edit capture)

```
$ shasum -a 256 dist/assets/StrataDashboard*.js && wc -c dist/assets/StrataDashboard*.js
0f9a472654580cd7a5aea7f6ad994d27ebbb2413d3419edb319cfac3b729ebe4  dist/assets/StrataDashboard-BnaHIKND.js
1031711 dist/assets/StrataDashboard-BnaHIKND.js
```

| Axis | Pre-edit (HEAD `13c6692` post-6.3) | Post-edit | Result |
|------|----------------------------|-----------|--------|
| **SHA256** | `6c17f2f3464e9dcffc0bf9a41394addc161d47f112601b65b98ad6cc9b1ca768` | `0f9a472654580cd7a5aea7f6ad994d27ebbb2413d3419edb319cfac3b729ebe4` | ✗ **BREAK** as predicted (production-source edit class structurally breaks SHA256; mirrors 6.1a + 6.3) |
| **Filename** | `StrataDashboard-DhcqiSlI.js` | `StrataDashboard-BnaHIKND.js` | ⟲ **HASH ROTATED** (the `[name]-[hash]` filename pattern shifted at 6.1a is preserved across 6.2 + 6.3 + 6.4 — 4 cross-phase data points) |
| **Byte-count** | `1,031,359` | `1,031,711` | ✗ **BREAK** (+352 bytes; slightly above kickoff prediction range +50-200 due to 13 source edits + WCAG comment; effectively reset to 1-of-1 from 6.4 forward) |

### PII scan

```
$ node Scripts/verify_no_pii_leak.mjs
[OK] strict scope: 51 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1306ms total).
```

✓ PASS — 0 leaks; 51 files; 1306ms.

---

## §3. a11y axe re-measurement (THE acceptance gate) — 33 → 0

### Build + measurement protocol

```
$ cd qualia-shell && rm -rf dist && VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build
✓ built in 3.81s

$ node Scripts/run_axe_phase5.mjs
[vite] vite preview ready at :4173
[OK] playwright chromium launched
[OK] logged in
  ... auditing: 128 Buena Vista Dr N (property detail)
  ... auditing: 2-STORY TECHNICAL ROOFING LLC (vendor detail)
  ... auditing: WO 19511-1 / Fire alarm needs replaced (maintenance detail)
  ... auditing: Brianna Jackson (tenant detail)

[OK] capture written to Docs/Baselines/2026-05-09_Phase5_a11y_capture.json
                       (renamed → Docs/Baselines/2026-05-09_Phase6_task_6_4_a11y_capture.json)

v1 L230 threshold: ZERO WCAG AA violations
Captured: 0 violations / 0 nodes / 0 distinct rules across 4 pages
By impact: {}
Distinct rules:

Per-page summary:
  property-128bv:         0 violations / 0 nodes
  vendor-2story:          0 violations / 0 nodes
  wo-19511-1:             0 violations / 0 nodes
  tenant-brianna-jackson: 0 violations / 0 nodes
```

### Cross-phase a11y delta (THE acceptance evidence)

| Page | Phase-5 baseline 2026-05-04 | Post-6.3 (2026-05-09) | Post-6.4 (2026-05-09) | Total Δ |
|------|--------------------:|----------------:|----------------:|--------:|
| 128 Buena Vista Dr N | 3 | 3 | **0** | **−3 (−100%)** |
| 2-STORY TECHNICAL ROOFING LLC | 16 | 16 | **0** | **−16 (−100%)** |
| WO 19511-1 / Fire alarm needs replaced | 5 | 5 | **0** | **−5 (−100%)** |
| Brianna Jackson (tenant detail) | 338 | 9 | **0** | **−338 (−100%)** |
| **Cross-page total** | **362** | **33** | **0** | **−362 (−100%)** |

### Per-rule cross-phase delta

| Rule | Phase-5 baseline | Post-6.3 | Post-6.4 | Result |
|------|----------------:|---------:|---------:|--------|
| `aria-valid-attr-value` | 10 | 15 (+5 from 6.1a layout fix surfacing) | **0** | ✓ ELIMINATED — Section content `id` linked aria-controls references in Vendors+Residents |
| `button-name` | 338 | 4 | **0** | ✓ ELIMINATED — ProfileSpaces Send + 3 RefreshCw aria-labels (incl. preventive Properties); 6.3 fixed the tenant-row 334 |
| `color-contrast` | 8 | 8 | **0** | ✓ ELIMINATED — single Sidebar.css rule fix (1 source edit / 8 node resolution at 1:8 ratio) |
| `scrollable-region-focusable` | 2 | 2 | **0** | ✓ ELIMINATED — `.s-list-panel` tabIndex+role+aria-label in Vendors+Maintenance |
| `select-name` | 4 | 4 | **0** | ✓ ELIMINATED — 4 select aria-labels (compliance + property in Vendors; property + lease in Residents) |

**Acceptance gate verification:** kickoff target was *"total cross-page nodes ≤5 (33 → ≤5; ≥85% reduction); optimistic 0 = full WCAG AA"*. Actual: **33 → 0 (100% elimination — full WCAG AA compliance achieved)**; v1 L230 ZERO WCAG AA violations threshold MET (long deemed structurally unattainable per Phase-5 Task 5.7 §0 "v1 L230 ZERO target structurally unattainable without dedicated remediation work" — Phase-6 Block C 6.3 + 6.4 IS that dedicated remediation arc).

---

## §4. Pre/post-edit working-tree view (6-source multi-file batch)

### git diff stat

```
$ git diff --stat HEAD
 qualia-shell/src/components/Sidebar/Sidebar.css                  |  3 ++-
 qualia-shell/src/components/StrataDashboard/modules/MaintenanceModule.tsx |  4 ++--
 qualia-shell/src/components/StrataDashboard/modules/ProfileSpaces.tsx     |  2 +-
 qualia-shell/src/components/StrataDashboard/modules/PropertiesModule.tsx  |  2 +-
 qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx   |  6 +++---
 qualia-shell/src/components/StrataDashboard/modules/VendorsModule.tsx     | 10 +++++-----
 6 files changed, 14 insertions(+), 13 deletions(-)
```

### Defensive sanity grep

```
$ grep -c "aria-label" qualia-shell/src/components/StrataDashboard/modules/VendorsModule.tsx
4   # 1 RefreshCw + 2 selects + 1 list-panel
$ grep -c "aria-label" qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx
3   # 2 selects + 1 from 6.3 (tenant-row aria-label)
$ grep -c "aria-label" qualia-shell/src/components/StrataDashboard/modules/MaintenanceModule.tsx
2   # 1 RefreshCw + 1 list-panel
$ grep -c "aria-label" qualia-shell/src/components/StrataDashboard/modules/PropertiesModule.tsx
1   # 1 RefreshCw (preventive)
$ grep -c "aria-label" qualia-shell/src/components/StrataDashboard/modules/ProfileSpaces.tsx
1   # 1 Send icon
$ grep -nE "id=.\`(vendor|tenant)-block-" qualia-shell/src/components/StrataDashboard/modules/VendorsModule.tsx qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx
qualia-shell/src/components/StrataDashboard/modules/VendorsModule.tsx:98:            {expanded && <div id={`vendor-block-${slug}`} style={{ marginTop: 8 }}>{children}</div>}
qualia-shell/src/components/StrataDashboard/modules/ResidentsModule.tsx:146:            {expanded && <div id={`tenant-block-${slug}`} style={{ padding: '0 14px 12px' }}>{children}</div>}
```

✓ PASS — all expected aria-label additions in place; 2 Section content `id` adds verified.

---

## §5. Verification matrix (16 rows)

| Row | Gate | Expected | Actual | Section |
|-----|------|----------|--------|---------|
| 1 | DC-A 5-query discovery + CDP probe | All 5 PASS; all HALT-IFs CLEAR; full per-node attribution | 5-of-5 PASS; 5-of-5 HALT-IFs NOT triggered; CDP probe captured 33-node attribution | §1 |
| 2 | tsc -b clean | exit 0 | exit 0 | §2 |
| 3 | Vitest unit tests | 259 passing in CI | 258/259 LOCAL (same pre-existing `calendar.test.tsx:260` darwin-flake from 6.3); CI authoritative | §2 |
| 4 | Vite build SEEDS=true | dist/ green; chunk axes captured | green at 3.92s; new SHA256 `0f9a472…ebe4`; new filename `StrataDashboard-BnaHIKND.js`; new byte-count `1,031,711` | §2 |
| 5 | Vite build SEEDS=false | dist/ green; byte-identical chunk | green at 3.79s; chunk byte-identical to SEEDS=true | §2 |
| 6 | Production chunk SHA256 axis | BREAK predicted (production-source edit) | ✗ BREAK as predicted | §2 |
| 7 | Production chunk filename axis | hash rotation predicted | ⟲ ROTATED `DhcqiSlI` → `BnaHIKND`; `[name]-[hash]` pattern preserved | §2 |
| 8 | Production chunk byte-count axis | break +50-200 predicted | ✗ BREAK +352 bytes (slightly above range due to 13 edits + WCAG comment) | §2 |
| 9 | PII scan strict-clean | 0 leaks | 0 leaks; 51 files; 1306ms | §2 |
| 10 | Smoke-test 4-spec cold-start | 12/12 PASS chromium | 12/12 PASS in 21.8s | §3 |
| 11 | a11y axe re-measurement (THE acceptance gate) | 33 → ≤5 (≥85% reduction) | **33 → 0 (100% ELIMINATION; v1 L230 ZERO WCAG AA threshold MET)** | §3 |
| 12 | Per-rule elimination | all 5 rules → 0 | aria-valid-attr-value 15→0 / button-name 4→0 / color-contrast 8→0 / scrollable-region-focusable 2→0 / select-name 4→0 | §3 |
| 13 | NEW Docs/Baselines/2026-05-09_Phase6_task_6_4_a11y_capture.json | committed | ✓ committed (2 KB; mirrors Phase-5 schema; 0 violations everywhere) | §3 + §1 |
| 14 | Defensive sanity grep | aria-label counts as expected | grep counts match (Vendors=4 / Residents=3 / Maint=2 / Property=1 / ProfileSpaces=1 / Section ids=2) | §4 |
| 15 | Manual-dispatch parity gate | green (production-source edit may auto-fire on `pull_request`) | ✓ green at squash time on PR #50 (resolved at 6.5 sweep) | §6 |
| 16 | CodeRabbit review | pass | ✓ pass at squash time on PR #50 (resolved at 6.5 sweep) | §6 |
| 17 | 6.3 TBD → `13c6692` / `#49` resolution | co-shipped | ✓ | §1 + §7 entry 6 |

---

## §6. CI / merge protocol (post-merge fill-in)

- Branch: `feat/phase-6-task-6-4-targeted-a11y-fixes`
- PR title: `feat(phase-6): Task 6.4 — targeted a11y fixes (color-contrast / select-name / aria-valid-attr-value / scrollable-region-focusable) (#50)` (resolved at 6.5 sweep)
- CI behavior: Production-source edit (6 component files in `qualia-shell/src/components/`) is INSIDE the parity-paths filter; parity gate will likely **auto-fire on `pull_request`** (mirrors 6.1a + 6.3 precedent at PR #45 + #49 which both auto-fired). Manual-dispatch fallback if no auto-fire within ~90s.
- Manual-dispatch fallback: not required — production-source edit auto-fired on `pull_request` per CI convention (resolved at 6.5 sweep).
- CodeRabbit review: ✓ pass at squash time on PR #50 (resolved at 6.5 sweep).
- Squash-merge target: `main`.
- Post-merge sweep (deferred to 6.5 sweep per absorb-into-next-sweep precedent): resolve 6.4 TBD squash SHA + PR # in this report's §1 + §5 verification matrix CI rows + §6 PR title; resolve 6.4 TBD in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 row 6.4 squash-SHA cell + Changelog v2.41 entry "6.4 closes at squash SHA TBD (PR #TBD)"; update CLAUDE.md HEAD pointer.

---

## §7. §7 carry-forward findings (NEW + cross-phase + meta-observations)

1. **🎯 v1 L230 ZERO WCAG AA violations threshold MET — Phase-6 Block C 6.3 + 6.4 IS the dedicated remediation arc.** Phase-5 Task 5.7 §0 verbatim declared the v1 L230 threshold "structurally unattainable without dedicated remediation work" (362 violating nodes / 13 distinct violations / 5 distinct rule IDs). Phase-6 Block C entered exactly that scope and delivered: 6.3 closed 334 button-name nodes (Brianna tenant rows; single-pattern fix) and surfaced 5 NEW aria-valid-attr-value violations as Block A side-effect; 6.4 closed all 33 remaining nodes across 5 distinct rules in 13 source-line edits across 6 component files. **v1 L230 = MET** at HEAD post-6.4 (pending CI re-measurement on PR-branch). This is a **Phase-6 closure-level milestone** — Phase-6 §17 exit gate requirement #4 ("Post-remediation a11y violation count ≤ 0 OR documented residual rationale at `Docs/Phase6_A11y_Report.md`") is satisfied at violation count = 0; future Task 6.6 a11y re-measurement may be a near-no-op confirmation.

2. **🎯 COMPONENT-FIX class extends 2pt → 3pt within Phase-6 (project-wide 10 cumulative classes unchanged).** 6.1a was 1st distinct in-repo COMPONENT-FIX (CSS-LAYOUT-FIX shape); 6.3 was 2nd (A11Y-COMPONENT-FIX shape via single-line aria-label addition); 6.4 is 3rd (A11Y-COMPONENT-FIX shape continued via multi-rule batched fixes). Class is now empirically calibrated against 3 distinct sub-shapes (CSS-LAYOUT-FIX / A11Y-COMPONENT-FIX / A11Y-COMPONENT-FIX-MULTI-RULE). Per Phase_6_Plan.md §11: sub-class resolution deferred until Phase-7+ surfaces a third structurally-distinct production-chunk-edit shape that doesn't fit the umbrella; 6.3 + 6.4 share the A11Y-COMPONENT-FIX shape so still the same sub-shape.

3. **🎯 PRE0 mathematical-exactness signal — REFINEMENT at 6.4 for GR-15 PERMANENT process changes.** Per 6.3 §7 entry 1, the mathematical-exactness signal `(rule-count) ÷ (per-pattern-count)` was discovered as a way to confirm single-pattern hypotheses without CDP probe. At 6.4, the math worked for 4-of-5 rules (color-contrast / aria-valid-attr-value / select-name / scrollable-region-focusable) but **failed for button-name** (4 nodes split 1+1+2 across pages → 2 distinct sub-patterns required CDP probe to disambiguate). **REFINEMENT for GR-15 PERMANENT process recommendation**: the math is necessary-but-not-sufficient. *"For a11y tasks targeting `button-name` / `link-name` / `aria-required-attr` / similar enumeration-rule classes, compute `(rule-count) ÷ (per-page-count)` at PRE0; if integer division yields a clean integer (e.g., 8 ÷ 4 = 2) AND per-page distribution is even (every page has same count), single-pattern hypothesis is confirmed without CDP probe. If per-page distribution is uneven (e.g., 1+1+2), CDP probe is still required to characterize sub-patterns."* Recommended for Plan v2.41 amendment in GR-15 process changes section.

4. **🎯 Plan-v-reality drift documented — Phase_6_Plan.md row 6.4 said "~28 nodes" but actual was 33.** Phase_6_Plan.md row 6.4 (L165-173) was authored at v2.36 Phase-6 OPENER (2026-05-05) before 6.1a's layout fix landed and before 6.3's axe re-measurement surfaced the 5 NEW Brianna aria-valid-attr-value violations. The actual node count at 6.4 PRE0 was 33 (28 baseline + 5 NEW Brianna aria-valid-attr-value surfaced post-Task-6.1a layout fix and confirmed at 6.3 axe re-measurement). Plan v2.41 amendment notes the reconciliation; row 6.4 closure narrative cites actual = 33 and final result = 0. Captured for §7 because this is a recurring pattern: phase-spec written ahead of empirical measurement may carry stale node counts; future Phase-N a11y plans should anchor scope to "all violations as of PRE0 axe measurement" rather than absolute counts.

5. **🎯 3-instance RefreshCw pattern closure (Vendors+Maintenance+Properties).** Per user GO Path 2, preventive aria-label was added to PropertiesModule.tsx:522 RefreshCw button despite axe not detecting it on Property page (rendering-order coincidence — Property page rendered another button at scan time but source-grep confirmed identical pattern as Vendors:668 + Maintenance:513). All 3 instances are now consistently aria-labeled across all 3 modules; future module additions following this pattern should inherit the aria-label convention. **Captured as Conventions block update in CLAUDE.md**: "RefreshCw ghost-button pattern across StrataDashboard modules carries `aria-label="Refresh {entity-plural}"` per Phase-6 Task 6.4 closure (Vendors+Maintenance+Properties consistent post-6.4)."

6. **🎯 6.3 TBD → `13c6692` / PR #49 resolution co-shipped at 6.4 sweep.** Pre-merge `TBD` placeholders in `Docs/Phase6_Task_6_3_Completion_Report.md` (§1 squash SHA + §5 verification matrix CI rows for parity gate + CodeRabbit review + §6 PR title) resolved at 6.4 sweep per "absorb into next sweep" cross-phase convention now established at **7 consecutive sweep-resolutions** (meta-PR #44 → 6.1a sweep → 6.1b sweep → 6.1c sweep → 6.2 sweep → 6.3 sweep → 6.4 sweep — pattern fully cemented as cross-phase convention).

7. **🎯 Production chunk axes — SHA256 BREAK + filename hash rotation + byte-count +352.** Mirrors 6.1a + 6.3 as 3rd Phase-6 production-source edit. Predicted by COMPONENT-FIX class:
   - **SHA256:** `6c17f2f…a768` → `0f9a472…ebe4` (BREAK; structurally expected for production-source edit)
   - **Filename:** `StrataDashboard-DhcqiSlI.js` → `StrataDashboard-BnaHIKND.js` (hash portion rotates; the `[name]-[hash]` pattern shift first observed at 6.1a is preserved across 6.2 + 6.3 + 6.4 — 4 cross-phase data points validating the pattern is structural-not-incidental)
   - **Byte-count:** `1,031,359` → `1,031,711` (+352 bytes; slightly above kickoff prediction range +50-200 due to 13 source-line edits across 6 files including Sidebar.css multi-line WCAG-rationale comment; effectively reset to 1-of-1 from 6.4 forward since byte-count rotated from prior 6.3 reset)

   The byte-count delta breakdown (approximate arithmetic): 13 source-line additions × ~30 chars/line = ~390 chars source-side; after Vite/Rollup minification + tree-shaking + gzip-precomputation absorbed to +352 bytes in production chunk. Rate ~90% chars-to-bytes pass-through (higher than 6.3's ~66% rate because 6.4's edits include verbose aria-label string literals + role + tabIndex attributes that minify less efficiently than 6.3's single template-literal interpolation).

8. **🎯 helpers/auth.ts 6.2 amendment continues to seed correctly across 6.4 smoke-test.** 12/12 cold-start smoke-test on chromium project confirms the permanent `addInitScript` block at L43 of helpers/auth.ts continues to seed `qualia_sidebar_groups` localStorage correctly across the 6.4 multi-file production-source edits. The 6.2 amendment is **independent of the 6.4 edits by construction** (helpers/auth.ts is in `e2e/`, outside Vite entry graph; 6.4 source edits all in `src/`, inside entry graph), but the smoke-test serves as cross-validation that no regression was introduced.

9. **🎯 Phase-6 Block C 2-of-3 closed; only 6.5 remains in Block C; 6.5 may close as near-no-op.** Phase-6 sub-tracker (Plan v2.41): 11 rows total — 6.1a ✓ + 6.1b ✓ + 6.1c ✓ + 6.2 ✓ + 6.3 ✓ + **6.4 ✓** + 6.5 R + 6.6 R + 6.7 R + 6.8 R + 6.9 R. Block A (detail panel + spec remediation) CLOSED at 6.1c; Block B (helpers/auth.ts amendment) CLOSED at 6.2; Block C (a11y arc) NOW 2-of-3 CLOSED at 6.4; only 6.5 (a11y closure cleanup + axe-baseline.spec.ts re-enable assessment) remains. With 0 residual violations at 6.4, **6.5 may close as a near-no-op cleanup** — the only remaining substantive work is the axe-baseline.spec.ts re-enable assessment (Phase-0-era informational gate; flipping from `continue-on-error: true` to blocking is now structurally viable since violations = 0). Subsequent: 6.6 a11y re-measurement → may produce a near-trivial NEW `Docs/Phase6_A11y_Report.md` confirming the zero-state.

---

## §8. Closure (≥7 entries — kickoff quoted ≥7-entry §7 envelope)

1. ✅ **PRE0 DC-A 5-query discovery + CDP probe PASS** — all 5 queries clean; all HALT-IFs NOT triggered; full per-node attribution captured for all 33 violation nodes.
2. ✅ **Path 2 applied as user GO confirmed** — 13 source edits across 6 files (Path A 12 edits / 5 files + preventive RefreshCw on Properties = 13 / 6); ALL within envelope.
3. ✅ **All pre-merge gates GREEN** (with one local environmental flake captured as carry-forward from 6.3 §7 entry 7) — tsc clean; ResidentsModule isolation 12/12 PASS; both vite builds green; PII strict-clean; smoke-test 12/12 PASS on chromium project.
4. ✅ **🎯 a11y axe re-measurement: 33 → 0 violations across all 4 pages (100% ELIMINATION)** — v1 L230 ZERO WCAG AA threshold MET; long deemed structurally unattainable per Phase-5 closure but now achieved at Phase-6 Block C 6.3 + 6.4 closure.
5. ✅ **Production chunk axes: SHA256 BREAK + filename hash rotation + byte-count +352 bytes** — predicted by COMPONENT-FIX class (production-source edit); mirrors 6.1a + 6.3 as 3rd Phase-6 production-source edit.
6. ✅ **PRE0 mathematical-exactness signal — REFINEMENT for GR-15** — math works for 4-of-5 rules; CDP probe still required for uneven per-page distributions; recommended for v2.41 amendment.
7. ✅ **Plan-v-reality drift documented** — Phase_6_Plan.md row 6.4 said "~28 nodes" but actual was 33; reconciled in v2.41 amendment.
8. ✅ **6.3 TBD → `13c6692` / PR #49 resolution co-shipped** at this commit — 7 consecutive sweep-resolutions cross-phase pattern fully cemented.
9. ✅ **3-instance RefreshCw pattern closure** — Vendors+Maintenance+Properties consistently aria-labeled; CLAUDE.md Conventions block updated.
10. ✅ **Plan v2.40 → v2.41 amendment** — §9 row 6.4 R → ✓; row 6.3 TBD/PR# → `13c6692`/`#49`; Changelog v2.41 entry; v2.40 prelude demoted to historical blockquote with closure note appended; GR-15 PERMANENT process refinement captured.
11. ✅ **NEW Docs/Baselines/2026-05-09_Phase6_task_6_4_a11y_capture.json** committed (2 KB; raw axe data; 0 violations across all pages).
12. ✅ **NEW Docs/Phase6_Task_6_4_Completion_Report.md** committed (this file; 8-section template; §7 carries 9 entries).
13. ✅ **CLAUDE.md updated** — HEAD pointer + Phase-6 PRs row "5 → 6" + Conventions block 3-instance RefreshCw entry + production chunk axes update + a11y violation count 33 → 0 + v1 L230 threshold MET narrative + 6.3 TBD resolved within HEAD bullet.
14. ✅ **Phase-6 Block C 2-of-3 CLOSED** — Block A (6.1a + 6.1b + 6.1c) + Block B (6.2) complete; Block C (6.3 + 6.4 ✓) 2-of-3; only 6.5 remains (likely near-no-op given 0 residuals).

🧪 **Phase-6 6.4 CLOSED. Targeted a11y fixes landed: 33 → 0 violations across all 4 enriched detail pages (100% ELIMINATION). v1 L230 ZERO WCAG AA threshold MET — Phase-5 declared this structurally unattainable; Phase-6 Block C 6.3 + 6.4 IS the dedicated remediation arc that achieved it. COMPONENT-FIX class extends 2pt → 3pt within Phase-6 (project-wide 10 cumulative classes unchanged). PRE0 mathematical-exactness signal REFINED — necessary-but-not-sufficient when per-page distribution is uneven; CDP probe still required for sub-pattern disambiguation; recommended for GR-15 inclusion at v2.41 amendment. SHA256 break + filename hash rotation + byte-count +352 bytes. Plan-v-reality drift on ~28 vs 33 documented. 3-instance RefreshCw pattern closure (Vendors+Maintenance+Properties). 6.3 TBD → `13c6692` / `#49` resolution co-shipped (7 consecutive sweep-resolutions). Phase-6 Block C 2-of-3 CLOSED; only 6.5 remains (likely near-no-op given 0 residuals).**
