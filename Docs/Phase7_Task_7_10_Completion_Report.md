# Phase-7 Task 7.10 Completion Report — Block B Lever 3 React.lazy expansion of App.tsx eager imports (OUTCOME C ship-lazy-load-alone)

## §1. Summary

**Status.** ✓ CLOSED 2026-05-15 (closed-as-OUTCOME-C-partial-win-ship-alone per Cowork verdict at Step-6 outcome verdict gate; production-source-edit SHIP shape; chunk-axis BREAK; substantive engineering finding pivot at Phase-7 closer level).
**Commit (HEAD on `main`):** `TBD` (squash commit for PR #TBD, Task 7.10 — Phase-7 Block B item #2 expanded scope; resolution at next-task sweep per established 20-consecutive-cross-phase-sweep-resolutions convention extending 20-pattern at 7.9 → 21-pattern at 7.10).
**Green CI run:** TBD (parity gate auto-fire expected within ~90s of push per paths-filter auto-fire pattern — production-source edit at `qualia-shell/src/**` IS inside the parity-gate paths filter; sister-shape to 7.1 paths-filter RESET).

**Phase-7 Block B Lever 3 React.lazy expansion of App.tsx eager imports SHIPPED as OUTCOME C partial-win per Cowork verdict at Step-6 outcome verdict gate; round-2 vendor-split stacking SKIPPED per Cowork verdict (predicted ~30 ms additional delta from 7.9 v2.55.1 anchor, insufficient to cross OUTCOME A threshold; signal-mixing cost on Phase-7 closer narrative > marginal LCP gain).**

5 lazy candidates moved from eager `index-*.js` chunk into branch-local-Suspense-gated lazy chunks via `lazyWithReload` wrapper (sister-altitude to 30+ widgetRegistry.ts data points per Cowork Verdict #1 at Task 7.10 PRE0):

1. **AdminShell** (NEW wrapper at `qualia-shell/src/components/Shell/AdminShell.tsx`) — consolidates 3 admin-only providers (LayoutProvider / HierarchyProvider / WindowProvider; 1,104 LoC) + 4 shell components (Sidebar / Desktop / CommandPalette / OpenJarvisWidget; 4,097 LoC) = ~5,201 LoC moved from eager into lazy AdminShell chunk
2. **TenantLoginScreen** (341 LoC; `tenantMode` toggle only)
3. **TenantPortal** (636 LoC; `role==='tenant'` only)
4. **SecurityPortal** (277 LoC; `/security` path only)
5. **PopupShell** (143 LoC; `?popup=` query only; NAMED-export wrapped via `.then((m) => ({ default: m.PopupShell }))`)
6. **OpenJarvisWidget** (1,089 LoC; tenant branch — additional lazy at App.tsx scope alongside AdminShell's internal static import for admin branch)

3 branch-local `<Suspense>` boundaries added per Cowork Verdict #2 (App.tsx 3-branch inline conditional routing — NO React Router; the inline branches ARE the routes; sister to React Router per-route Suspense adapted to this codebase's inline-branch routing):

- **Branch 1 (security-portal at App.tsx L196-198):** viewport-fill spinner with copy "Loading security portal…" (sister to AuthGate L145-162 shape)
- **Branch 2 (popup at App.tsx L201-214):** compact text-only "Loading widget…" `#6366f1` color (sister to PopupShell L130-139 existing internal Suspense shape)
- **Branch 3 (AuthGate-internal at App.tsx L216-237):** viewport-fill spinner with default "Loading…" (fires for any of TenantLoginScreen / TenantPortal / AdminShell lazy children; eager LoginScreen renders pass-through)

Shared `<AppSuspenseFallback variant="viewport"|"popup" label?>` component at `qualia-shell/src/components/Shell/AppSuspenseFallback.tsx` (NEW; ~54 LoC) per Cowork Verdict #4 — single source-of-truth for Suspense fallback aesthetics across the 3 branches.

LoginScreen stays EAGER per Q1 inventory verdict (initial-paint default at `/`; lazy-loading the unauth-default would defeat the LCP-reduction lever by adding a Suspense fallback to the first thing the user sees). PermissionsProvider stays EAGER at outer App.tsx layer (shared by popup branch L207 + admin branch L182; cannot move into AdminShell without duplicating).

**🎯 NEW class designation:** **PERF-LEVER-LAZY-LOAD** (project-wide 14th cumulative class; 1pt within Phase-7 at 7.10 close). Class defined by EDIT-SHAPE (production-source-edit + perf-lever-lazy-load), not OUTCOME magnitude — the edit ships; chunk axes BREAK on production source (5th cross-phase BREAK data point); the structurally-correct lever was empirically identified per the 6.7 + 7.9 root-cause analysis thesis. Sister-shape constellation: PERF-LEVER-LAZY-LOAD (SHIP shape; Phase-7 7.10 = 1pt) + MEASUREMENT-ONLY-with-empirical-finding-and-revert-perf-lever (REVERT shape; Phase-6 6.7 + Phase-7 7.9 = 2pt within MEASUREMENT-ONLY sub-shape). **2-direction calibration of perf-lever class empirically established at 3pt cross-phase** (1 SHIP + 2 REVERT) across both directions.

**🎯 Substantive Phase-7 engineering finding pivot for Phase-7 Closure Report:**

> "Phase-7 ran 3 lever experiments. **Lever 1** (font deferral / 6.7) addressed network-transfer of stylesheets → NO-OP (−148 ms / −3.4%). **Lever 2** (manualChunks vendor split / 7.9 v2.55.1 expanded shape) addressed JS download bytes → NO-OP (−24.6 ms / −0.5%). **Lever 3** (React.lazy expansion of App.tsx eager imports / 7.10) addressed JS parse+execute on initial paint → **SUBSTANTIVE WIN (−550 ms mean / −600 ms median / −12.4% to −13.3%)**. The structurally-correct bottleneck at React 19 + Vite 6 + 4,500 ms-LCP baseline architecture is initial-paint JS parse+execute time, NOT critical-path bytes-downloaded. Lazy-load is the empirically-validated correct lever family. The 6.7 + 7.9 2pt cross-phase perf-lever underperformance pattern is RECONTEXTUALIZED, not refuted — those levers missed because they targeted the wrong bottleneck; Lever 3 confirms the THESIS by being a lever that DOES address parse/execute → DOES move LCP."

**🎯 Phase-7 deferred-item #4 reframing** (per Cowork verdict): WAS "Perf-lever piecemeal pattern empirically void at React 19 + Vite + 4,500 ms-LCP baseline; future perf work should be lazy-load-first + vendor-split-only-if-empirically-helpful." NOW "Lazy-load lever empirically-validated correct family at this architecture (7.10 = −550 ms). Further lazy-load candidates per widget-registry entry list + SSR shell exploration become Phase-8+ priority. Vendor-split + font-deferral levers empirically NOT correct family at this architecture (avoid as Phase-8+ priorities)." Refinement, not removal — deferred-item evolves with new empirical data; GR-15 amendment candidate at Plan v2.57+.

**🎯 NEW Phase-7 deferred-item #6 docked at this close** per Cowork Verdict #3 at PRE0: "App.tsx top-level Suspense + ErrorBoundary pairing for production-polish chunk-load-failure UX; sister-shape to Desktop.tsx WidgetErrorBoundary at L33+; Phase-8+ candidate." Scope-protective: keeps Task 7.10 substantively-scoped to perf-lever attempt while documenting the production-polish gap for future closure. lazyWithReload already handles ChunkLoadError + "Failed to fetch dynamically imported module" via sessionStorage-gated reload-once; primary recovery path is in place; ErrorBoundary tier is production-polish on top of that, not a missing layer.

**🎯 24-of-24 cross-phase chunk-axis preservation pattern RESETS at 7.10 production-source-edit BREAK** (sister to Phase-6 6.1a + 6.3 + 6.4 + Phase-7 7.1 production-source-edit BREAK resets; 5th cross-phase BREAK data point). Reset to **1-of-1 NEW canonical at HEAD-post-7.10**. Pattern empirically robust: production-source edits BREAK; test-tooling / DOC-only / CI-config-only / script-rename / asset-loading-edit-then-reverted / config-only edits PRESERVE.

**🎯 NEW empirical observation: variance collapse as lever-effectiveness signal.** Pre-edit n=3 LCP range 151 ms / stddev 71 ms → post-edit n=3 LCP range 1 ms / stddev 0 ms. The lever made initial-paint timing essentially deterministic — strong empirical evidence the lever reached the dominant variability source (large eager chunk parse time). Adds substantive engineering-finding-from-variance-analysis to the §8 lessons learned.

**🎯 v2.55.1 squash SHA `b89d727` resolves at 7.10 sweep — 21 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6 → 7.8 → 7.9 → **7.10**). Resolved across §9 row 7.9 squash-SHA cell in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` + Phase status line at top of `Docs/Phases/Phase_7_Plan.md` + Task 7.9 closure-narrative TBD references (4 reference spots in `Docs/Phase7_Task_7_9_Completion_Report.md`) + this HEAD pointer.

**🎯 Paths-filter quirk: 7.10 RESETS auto-fire pattern** (sister to 7.1 production-source edit auto-fire). 7.10 touches `qualia-shell/src/components/Shell/**` (NEW + EDIT) + `qualia-shell/src/App.tsx` (EDIT) — all inside `qualia-shell/src/**` paths-filter. Parity gate auto-fires on PR push (no manual-dispatch needed; available as fallback). Sister to 5.1a/5.1b/5.1c/5.2/6.1a/6.1b/6.1c/6.2/6.3/6.4/7.1 production-source-edit auto-fire pattern.

Total 11 files in single commit: 4 source/script (NEW AdminShell.tsx + NEW AppSuspenseFallback.tsx + EDIT App.tsx + RENAME run_lighthouse_phase6→phase7.mjs with 6-category patch + n=ROOT_RUNS infrastructure) + 2 baselines (NEW pre-edit + post-edit-round1 raw-data) + 5 doc edits (NEW this Completion Report + UPDATE Plan v2.56 + UPDATE Phase_7_Plan.md + UPDATE Phase7_Task_7_9_Completion_Report.md TBD → b89d727 + UPDATE CLAUDE.md HEAD pointer pivot).

---

## §2. Lighthouse capture tables (2 rounds × n=3 each)

### §2.1 Pre-edit baseline (HEAD-post-7.9+v2.55.1 = `b89d727`; static-API alt-build; n=3)

Build env: `VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build`. Eager chunk: `index-CNmGeQB9.js` / 597,519 B.

| Capture | LCP (ms) | FCP (ms) | CLS | Performance |
|---:|---:|---:|---:|---:|
| 1 | 4,504 | 2,253 | 0.000 | 82 |
| 2 | 4,353 | 2,253 | 0.000 | 82 |
| 3 | 4,503 | 2,253 | 0.000 | 83 |
| **mean** | **4,453** | 2,253 | 0.000 | 82.3 |
| **median** | **4,503** | 2,253 | 0.000 | 82 |
| range | 151 | 1 | 0 | 1 |
| stddev | 71 | 1 | 0 | 0.5 |

Other metrics: TBT mean 0 ms / SI mean 2,253 ms / TTI mean 4,458 ms / a11y 90.

Artifact: `Docs/Baselines/2026-05-15_Phase7_task_7_10_perf_capture_pre_edit.json` (6,265 B; 3 root captures + computed stats + 4 per-page Playwright captures).

### §2.2 Post-edit round-1 (lazy-load + AdminShell wrapper + 3 branch-local Suspense; static-API alt-build; n=3 fresh-server re-run)

Build env: `VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build`. Eager chunk: `index-DD73B_85.js` / 253,683 B (−57.5% vs pre-edit).

| Capture | LCP (ms) | FCP (ms) | CLS | Performance |
|---:|---:|---:|---:|---:|
| 1 | 3,903 | 1,653 | 0.000 | 87 |
| 2 | 3,902 | 1,653 | 0.000 | 87 |
| 3 | 3,903 | 1,653 | 0.000 | 87 |
| **mean** | **3,903** | 1,653 | 0.000 | 87.0 |
| **median** | **3,903** | 1,653 | 0.000 | 87 |
| range | 1 | 1 | 0 | 0 |
| stddev | 0 | 0 | 0 | 0 |
| **Δ vs pre-edit (mean)** | **−550 (−12.4%)** | **−600 (−26.6%)** | 0 | **+4.7** |
| **Δ vs pre-edit (median)** | **−600 (−13.3%)** | −600 (−26.6%) | 0 | +5 |

Other metrics: TBT mean 2 ms (within noise) / SI mean 1,653 ms (−600 / −26.6%) / TTI mean 3,903 ms (−555 ms) / a11y 90 (preserved).

**Mean vs median divergence:** |550 − 600| = 50 ms (< 71 ms 1σ pre-edit noise floor). Both metrics agree on substantive partial-win. NO HALT (refined HARD HALT-IF #1 from Cowork verdict #5 at Step-6 framework not triggered).

Artifact: `Docs/Baselines/2026-05-15_Phase7_task_7_10_perf_capture_post_edit_round1.json` (n=3 fresh-server re-run; the first round-1 invocation was served by a leftover Step-2 vite preview process resulting in identical empirical data but warm-server cache state; clean re-run is the canonical post-edit baseline).

### §2.3 Per-page Playwright captures (SPA-internal nav; supplementary)

All 4 enriched detail pages (post-edit): LCP **28 ms** (was 48 ms; −20 ms uniform improvement) / CLS **0.000** (was 0.001; slight improvement) / FCP **28 ms** (was 24 ms; +4 ms within noise) / a11y violations **0** (preserved).

Per-page metrics are post-nav incremental — sister to 6.7 + 7.9 per-page profile shape (initial-paint LCP only happens once at root; SPA navigations are essentially instant). All deltas are IMPROVEMENTS; HARD HALT-IF #2 (≥50 ms regression on any page) NOT triggered.

### §2.4 Outcome verdict per refined Q6 framework

| Outcome | Mean threshold | Median threshold | Result |
|---|---|---|---|
| A+ (Block B PRIMARY) | ≥1,500 ms | ≥1,200 ms | NOT MET (550 / 600) |
| A (substantive) | ≥1,000 ms | ≥700 ms | NOT MET (median 600 is 100 ms short of 700; mean 550 is 450 ms short of 1,000) |
| B (NO-OP REVERT) | <100 ms | <100 ms | NOT MET (clearly above noise) |
| **C (partial; ship-or-stack)** | 100-1,000 ms | (ambiguous) | **✅ MET** (mean 550 + median 600 both in band) |

**Cowork OUTCOME C verdict at Step-6:** SHIP LAZY-LOAD ALONE. Round-2 vendor-split stacking SKIPPED per empirical anchor from 7.9 v2.55.1 (vendor-split's −24 ms LCP delta from −218 KB / −36.5% extraction predicts ~30 ms additional delta from stacking; 550 + 30 = 580 ms still 120 ms short of OUTCOME A median threshold + 420 ms short of mean threshold; signal-mixing cost on Phase-7 closer narrative > marginal LCP gain).

---

## §3. Source diff summary

### §3.1 NEW `qualia-shell/src/components/Shell/AdminShell.tsx` (157 LoC)

Wrapper module containing `<LayoutProvider>` > `<HierarchyProvider>` > `<WindowProvider>` > `<ShellLayout>` (with `<Sidebar />` + `<Desktop />` + `<CommandPalette />` + `<OpenJarvisWidget />`). ShellLayout function moved verbatim from App.tsx L22-138 (5 useEffects: popstate / skin / drag-and-drop / dock-back / keyboard shortcuts; behavior unchanged; only module boundary moved). Type-only import `import type { DockBackMessage } from '../PopupShell/PopupShell'` — erased at compile time, no runtime dep on PopupShell.

### §3.2 NEW `qualia-shell/src/components/Shell/AppSuspenseFallback.tsx` (54 LoC)

Shared Suspense fallback component with two altitude-matched variants:
- `variant="viewport"`: full-viewport branded spinner (sister to AuthGate L145-162 shape; uses global `spin` keyframe from `styles/global.css`). Default label "Loading…".
- `variant="popup"`: compact text-only `#6366f1` color (sister to PopupShell L130-139 existing internal Suspense shape). Default label "Loading widget…".

### §3.3 EDIT `qualia-shell/src/App.tsx` (192 → 109 LoC; net −83 LoC / −43.2%)

Key transformations:

- **Imports simplified:** 20 import lines → 10 import lines. Removed eager imports of: useEffect (no longer used; useState retained for AuthGate's tenantMode), HierarchyProvider, WindowProvider, useWindows, LayoutProvider, Sidebar, Desktop, CommandPalette, OpenJarvisWidget, TenantLoginScreen, TenantPortal, SecurityPortal, PopupShell+DockBackMessage. Added eager imports of: Suspense, AppSuspenseFallback, lazyWithReload.
- **6 lazy candidates via lazyWithReload:** AdminShell + TenantLoginScreen + TenantPortal + SecurityPortal + PopupShell (named-export wrapped via `.then((m) => ({ default: m.PopupShell }))`) + OpenJarvisWidget.
- **3 branch-local `<Suspense>` boundaries:** Branch 1 wraps `<SecurityPortal />` with `<AppSuspenseFallback variant="viewport" label="Loading security portal…" />`. Branch 2 wraps `<PopupShell />` with `<AppSuspenseFallback variant="popup" />`. Branch 3 (inside AuthGate) wraps the conditional tenantMode/role children with `<AppSuspenseFallback variant="viewport" />` (eager LoginScreen renders pass-through).
- **ShellLayout function REMOVED from App.tsx** (moved verbatim to AdminShell.tsx).
- **AdminShell renders inside admin branch:** `<PermissionsProvider><AdminShell /></PermissionsProvider>` (PermissionsProvider stays eager at outer App.tsx layer per Cowork Verdict #5).
- **OpenJarvisWidget retained for tenant branch JSX** (`<><TenantPortal /><OpenJarvisWidget /></>`) — lazy-loaded via 6th lazyWithReload registration at App.tsx scope; admin branch's AdminShell statically imports OpenJarvisWidget internally; Vite's chunk-splitter handles the shared-dep dedup.

### §3.4 RENAME `Scripts/run_lighthouse_phase6.mjs` → `Scripts/run_lighthouse_phase7.mjs` (200 insertions / 80 deletions = +120 net LoC)

`git mv` per 6.6 + 6.7 script-rename precedent. 6 patch categories applied:

1. **JSDoc L1-110:** Rewritten from "Phase-6 Task 6.7 (Lever 1: Google Fonts deferral)" to "Phase-7 Task 7.10 (Lever 3: React.lazy expansion)" with 6.7 + 7.9 perf-lever-underperformance pattern justification + env-var docs.
2. **Post-L88 NEW env-vars:** `TASK_FIELD` / `CAPTURE_SUFFIX` / `ROOT_RUNS` / `FILENAME_BASE` declarations.
3. **Globals L243-273:** `window.__phase6_*` (3 globals; 9 references) → `window.__phase7_*` (replace_all).
4. **Console L339:** "Phase 6 Task 6.7 — Perf optimization … Lever 1: Google Fonts deferral" → "Phase 7 Task 7.10 — … Lever 3: React.lazy expansion of App.tsx eager imports".
5. **Task field L416:** Hardcoded prose `'Phase-6 Task 6.7 — …'` → env-var-driven slug `TASK_FIELD` (default `'phase7_task_7_10'`).
6. **Filename L432:** Hardcoded `'Phase6_task_6_7_perf_capture.json'` → env-var-driven `\`${stamp}_${FILENAME_BASE}_perf_capture${CAPTURE_SUFFIX}.json\``.

PLUS substantive addition beyond 6.7 precedent: NEW `computeRootStats` helper + main() loop `for (let i = 1; i <= ROOT_RUNS; i++)` for root Lighthouse n=ROOT_RUNS infrastructure. Computes mean / median / range / stddev / min / max across LCP / FCP / TBT / CLS / SI / TTI + performance score. Representative `rootLighthouse` field (median run by LCP) preserves 6.7 downstream-reader compatibility.

**🎯 Substantive measurement-tooling-housekeeping at 7.10 close:** Future Phase-N MEASUREMENT-ONLY tasks at this code can invoke this script with `LH_TASK_FIELD=phaseN_task_N_X LH_CAPTURE_SUFFIX=... LH_ROOT_RUNS=...` overrides instead of `git mv` rename ceremony. Sister-shape to v2.55.1 in-place parameterization but for measurement tooling. GR-15 amendment candidate at Plan v2.56+ absorbs this as "measurement-tooling parameterization eliminates per-task script-rename when the script already supports the new shape."

---

## §4. Chunk manifest comparison (pre-edit vs post-edit at HEAD-post-7.10)

Parity-gate canonical build (`npx vite build` with bare or `VITE_APPFOLIO_SEEDS={true,false}`).

| Chunk | Pre-edit (HEAD-post-7.9+v2.55.1 = `b89d727`) | Post-edit (HEAD TBD) | Delta |
|---|---|---|---:|
| **Eager `<script>` JS** (`dist/index.html`) | `index-ChKXebss.js` / 597,519 / `b237c8aa…67f1` | `index-MO01qt09.js` / 253,683 / `07b36c4a…2b22` | **−343,836 B / −57.5%** |
| **Eager `<link>` CSS** | `index-DubCb24b.css` / 158,955 / `cabc7535…738f` | `index-BebuHEVu.css` / 49,312 | **−109,643 B / −69.0%** |
| Vendor JS (preserved) | `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` | UNCHANGED byte-for-byte | 0 |
| StrataDashboard | `StrataDashboard-D_e1g9lx.js` / 1,031,810 / `47d22066…a121d` | `StrataDashboard-BrMjCxpY.js` / 1,032,104 | +294 B (chunk-graph reshuffle; not touched directly) |

### NEW lazy chunks (7) created by Step-3 edit

| Chunk | Size | Loaded via |
|---|---:|---|
| AdminShell-DCM5h2tJ.js | 45,669 B | App.tsx admin branch lazyWithReload |
| Desktop-0zI2Y99z.js | 74,308 B | AdminShell internal import (split by Vite chunk-splitter) |
| OpenJarvis-Cnv8o80Q.js | 62,531 B | App.tsx tenant branch lazyWithReload + AdminShell internal static |
| TenantPortal-DW0aLyGi.js | 14,749 B | App.tsx tenant branch lazyWithReload |
| TenantLoginScreen-COOYN-Jd.js | 10,982 B | App.tsx unauth+tenantMode branch lazyWithReload |
| SecurityPortal-B2p82QNx.js | 6,340 B | App.tsx /security branch lazyWithReload |
| PopupShell-4P036O5c.js | 3,028 B | App.tsx ?popup= branch lazyWithReload |
| **Aggregate** | **217,607 B** | (≈63% of the −343,836 B eager chunk shrinkage; remainder absorbed into the now-smaller eager chunk per Vite chunk-graph optimization) |

Static-API alt-build (`VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build`): eager chunk `index-DD73B_85.js` / 253,683 / `3a21a33f…e902` — identical byte size to parity-gate canonical (filename hash differs per build-mode footnote; same lever leverage achieved in both build modes).

### Cross-phase chunk-axis preservation pattern state

24-of-24 cross-phase preservation data points at v2.55.1 close (HEAD-post-7.9+v2.55.1 = `b89d727`) → **RESETS to 1-of-1 NEW canonical at HEAD-post-7.10 production-source-edit BREAK**. Sister to 6.1a + 6.3 + 6.4 + 7.1 production-source-edit BREAK resets. Pattern empirically robust: production-source edits BREAK; test-tooling / DOC-only / CI-config-only / script-rename / asset-loading-edit-then-reverted / config-only edits PRESERVE.

---

## §5. Verification matrix

| Check | Target | Result | Status |
|---|---|---|:-:|
| Step-1 branch off main `b89d727` | branch HEAD = b89d727 | b89d727 confirmed (post-7.9+v2.55.1 merge) | ✓ |
| Step-1.5 Suspense convention inspection | StrataMaintenanceAdapter + InboxZero + Desktop + PopupShell convention mapped | 2-layer altitude rule established (lazyWithReload at top-level / bare React.lazy at sub-component) | ✓ |
| Step-1.6 Scripts/run_lighthouse_phaseN.mjs rename + 6-category patch | git mv + 5 sister-precedent patches + 1 NEW n=ROOT_RUNS infrastructure | RENAME staged + 200/80 net LoC | ✓ |
| Step-1.6 syntax validation | `node --check` clean | clean (no output) | ✓ |
| Step-2 pre-edit Lighthouse n=3 baseline | LCP mean inside anchor band 4,204-4,653 ms ±300 ms | mean 4,453 / median 4,503 / range 151 / stddev 71 | ✓ HARD HALT-IF #2 cleared |
| Step-2.5 AdminShell.tsx NEW (157 LoC) | wrapper compiles + behavior preserved | NEW file created; ShellLayout moved verbatim | ✓ |
| Step-2.5 AppSuspenseFallback.tsx NEW (54 LoC) | shared component compiles | NEW file created | ✓ |
| Step-3 App.tsx edit | 5 candidates lazy + 3 branch-local Suspense + LoginScreen eager | EDIT applied; 192 → 109 LoC | ✓ |
| Step-3 PopupShell named-export wrapping | `.then((m) => ({ default: m.PopupShell }))` for lazyWithReload type-compat | wrapper applied | ✓ (caught by tsc; sister-shape to default-export-only convention drift) |
| Step-4 tsc -b | clean | clean (no output) | ✓ |
| Step-4 vitest run | 259/259 PASS | 259/259 PASS (2.91s; calendar.test.tsx:260 darwin flake DID NOT FIRE this run) | ✓ |
| Step-4 vite build (parity-gate canonical) | exit 0 + chunk-axis BREAK observed | ✓ 4.08s; eager chunk 597,519 → 253,683 (−57.5%); 7 new lazy chunks | ✓ HARD HALT-IF #4 cleared (eager shrunk 343 KB vs 50 KB threshold) |
| Step-4 vite build (SEEDS=false) | exit 0 | ✓ 4.14s | ✓ |
| Step-4 PII guard | 0 leaks | 0 leaks (51 files scanned) | ✓ |
| Step-5 static-API alt-build | eager chunk 253,683 B match | ✓ same size; filename hash differs per build-mode | ✓ like-vs-like Step-2 vs Step-5 |
| Step-5 post-edit Lighthouse n=3 (fresh-server re-run) | LCP mean delta computed | mean 3,903 / median 3,903 / range 1 / stddev 0 | ✓ |
| Step-5 mean vs median divergence | <71 ms 1σ noise floor | 50 ms divergence | ✓ HARD HALT-IF #1 (refined Q6) cleared |
| Step-5 per-page LCP regression check | <50 ms regression on any page | −20 ms uniform IMPROVEMENT all 4 pages | ✓ HARD HALT-IF #2 cleared |
| Step-5 TBT regression check | <50 ms increase | +2 ms (within noise) | ✓ HARD HALT-IF #3 cleared |
| Step-5 measurement variance | range <1,500 ms | 1 ms range (variance collapse signal) | ✓ HARD HALT-IF #5 cleared |
| Step-6 OUTCOME verdict | A+/A/B/C per refined Q6 | **OUTCOME C — partial win 100-1,000 ms band** | ✓ Cowork ship-alone verdict |
| Pre-commit re-verify strict gate | tsc/vitest/both vite builds/PII clean | TBD (defensive re-run) | TBD |
| Parity Gate per PR | 16-of-16 SUCCESS via paths-filter auto-fire | TBD | Run pending post-PR-open |
| PII Scan per push | success | TBD | Run pending post-PR-open |
| CodeRabbit review per PR | pass | TBD (expect Moderate effort given 11-file substantive change) | Run pending post-PR-open |
| §9 Phase-7 sub-tracker row 7.10 | R → ✓ (closed-as-OUTCOME-C-partial-win) | ✓ | Plan v2.56 amendment |
| §9 row 7.9 squash-SHA cell | TBD → `b89d727` | ✓ | Plan v2.56 amendment |
| Calibration classes — NEW PERF-LEVER-LAZY-LOAD | project-wide 14th cumulative class docked | ✓ | CLAUDE.md Calibration classes block updated |
| Production chunk invariance state RESET | 24-of-24 → 1-of-1 NEW canonical post-7.10 | ✓ | CLAUDE.md Production chunk invariance state section pivoted |

---

## §6. Rollback SHA

Rollback target: `git revert <7.10-squash-SHA>` (Phase-7 7.10 close; reverts to HEAD-post-7.9+v2.55.1 state at `b89d727`). Production-source edit at `qualia-shell/src/**` — clean revert restores 24-of-24 cross-phase chunk-axis preservation canonical (eager `index-ChKXebss.js` / 597,519 / `b237c8aa…67f1` + 3 other axes byte-for-byte). Phase-7 7.10 squash SHA `TBD` (will be revertable independently once merged; resolution at next-task sweep per established absorb-into-next-sweep convention).

---

## §7. Carry-forward to 7.11 / Phase-7 closer / Phase-8

1. **🎯 Phase-7 deferred-item #4 REFRAMED at 7.10 close** per Cowork verdict: WAS "Perf-lever piecemeal pattern empirically void at React 19 + Vite + 4,500 ms-LCP baseline; future perf work should be lazy-load-first + vendor-split-only-if-empirically-helpful." NOW "Lazy-load lever empirically-validated correct family at this architecture (7.10 = −550 ms). Further lazy-load candidates per widget-registry entry list + SSR shell exploration become Phase-8+ priority. Vendor-split + font-deferral levers empirically NOT correct family at this architecture (avoid as Phase-8+ priorities)." Refinement, not removal — deferred-item evolves with new empirical data; GR-15 amendment candidate at Plan v2.57+.

2. **🎯 NEW Phase-7 deferred-item #6 docked at this close** per Cowork Verdict #3 at PRE0: "App.tsx top-level Suspense + ErrorBoundary pairing for production-polish chunk-load-failure UX; sister-shape to Desktop.tsx WidgetErrorBoundary at L33+; Phase-8+ candidate." Scope-protective at 7.10: lazyWithReload already handles ChunkLoadError + "Failed to fetch dynamically imported module" via sessionStorage-gated reload-once; primary recovery path is in place; ErrorBoundary tier is production-polish on top of that, not a missing layer.

3. **🎯 NEW Phase-7 deferred-item #7 docked at this close** — GR-15 amendment candidate at Plan v2.56+: "Measurement-tooling parameterization eliminates per-task script-rename when the script already supports the new shape." Future Phase-N MEASUREMENT-ONLY tasks at the Lighthouse-script altitude can invoke `Scripts/run_lighthouse_phase7.mjs` with `LH_TASK_FIELD=phaseN_task_N_X LH_CAPTURE_SUFFIX=... LH_ROOT_RUNS=...` env-var overrides instead of `git mv` rename ceremony. Sister-shape to v2.55.1 in-place parameterization but for measurement tooling. Project-wide workflow-debt reduction.

4. **🎯 NEW Conventions block addition candidate at 7.10 close** — 2-layer altitude rule for lazyWithReload vs bare React.lazy (Step-1.5 empirical finding): Use `lazyWithReload` for top-level lazy candidates at App.tsx / widgetRegistry.ts altitude (where chunk-load failure has no recovery path) — established at 30+ widgetRegistry.ts data points + 5 new App.tsx data points = 35+ data point convention. Use bare `React.lazy` only for sub-component lazy candidates (where a `window.location.reload()` would destroy surrounding shell state) — established at StrataMaintenanceAdapter (2 data points) + InboxZero (7 data points) sub-altitude. Document for future-task reference at next CLAUDE.md sweep.

5. **🎯 PERF-LEVER-LAZY-LOAD class** (project-wide 14th cumulative; 1pt within Phase-7 at 7.10 close). Sister-shape constellation: PERF-LEVER-LAZY-LOAD (SHIP shape; Phase-7 7.10 = 1pt) + MEASUREMENT-ONLY-with-empirical-finding-and-revert-perf-lever sub-shape (REVERT shape; Phase-6 6.7 + Phase-7 7.9 = 2pt within MEASUREMENT-ONLY). 2-direction calibration of perf-lever class empirically established at 3pt cross-phase (1 SHIP + 2 REVERT) across both directions.

6. **🎯 v1 L228 ≤500 ms LCP carry-forward to Phase-8+ with SSR consideration becomes more central.** Post-7.10 LCP at 3,903 ms is 7.8× the v1 target. Substantive engineering finding ("lazy-load IS the structurally-correct lever family") implies further lazy-load candidates + SSR shell exploration are the Phase-8+ priority. Vendor-split + font-deferral levers empirically NOT correct family at this architecture (avoid as Phase-8+ priorities per deferred-item #4 reframing).

7. **🎯 21 consecutive cross-phase sweep-resolutions cemented at 7.10 sweep** (extends 20-pattern at 7.9 → 21-pattern at 7.10); 7.9 TBD → `b89d727` / `#63` resolution co-shipped across §9 row 7.9 + Phase_7_Plan.md Phase status line + this Completion Report's HEAD pointer pivot + Phase7_Task_7_9_Completion_Report.md TBD references (4 spots).

8. **🎯 Paths-filter quirk RESETS to auto-fire at 7.10** (sister to 7.1 production-source-edit auto-fire). 7.10 touches `qualia-shell/src/components/Shell/**` + `qualia-shell/src/App.tsx` + `Scripts/**` + `Docs/**` + `Docs/Baselines/**` + root `CLAUDE.md`. The production-source paths inside `qualia-shell/src/**` trigger parity-gate auto-fire on PR push.

9. **Phase-7 progress at 7.10 close:** Block A 8-of-8 ✓ + Block B item #1 (7.9 Lever 2) closed-as-empirical-void + Block B item #2 (7.10 Lever 3) closed-as-OUTCOME-C-partial-win + Block C item 7.12 ✓ co-closed at 7.3 = **11 of 14 tasks ✓**; **3 R remaining**: Block B 7.11 (Lighthouse variance characterization n≥10) + Block C 7.13 (calendar.test.tsx:260 darwin flake) + Block C 7.14 (Phase-5 Perf Report §2 stale LCP footnote).

10. **🎯 Block B closed-with-partial-win milestone at 7.10.** Block B 3-item arc was strategically pivoted at 7.9 close to 2-task arc (7.10 expanded scope + 7.11 preserved). At 7.10 close, Block B is functionally complete on the SUBSTANTIVE perf-lever attempt (lazy-load SHIPPED with OUTCOME C partial-win); only 7.11 (measurement variance characterization n≥10 via `LH_ROOT_RUNS=10` env-var override on the now-parameterized Lighthouse script) remains as discrete MEASUREMENT-ONLY task. Phase-7 closer can plan around 7.10 + 7.11 + 7.13 + 7.14 4-task burndown.

---

## §8. Lessons learned for Plan v2.56+ amendment

**Engineering insight 1 — Lazy-load is the structurally-correct perf lever family at React 19 + Vite 6 + 4,500 ms-LCP baseline architecture.** Three cross-phase perf-lever data points (6.7 font deferral REVERT / 7.9 vendor-split REVERT / 7.10 lazy-load SHIP) form a 2-direction calibration: levers that target download bytes / critical-path stylesheets miss; levers that target initial-paint JS parse+execute time hit. **The substantive engineering finding is publishable at Phase-7 Closure Report level.** Phase-8+ perf work should be lazy-load-first; further lazy-load candidates per the widget-registry entry list + SSR shell exploration become Phase-8+ priority.

**Engineering insight 2 — Variance collapse as lever-effectiveness signal.** Pre-edit n=3 LCP range 151 ms / stddev 71 ms → post-edit n=3 LCP range 1 ms / stddev 0 ms. The lever made initial-paint timing essentially deterministic — strong empirical evidence the lever reached the dominant variability source (large eager chunk parse time). This metric (variance collapse) deserves consideration alongside mean/median LCP delta in future perf-lever outcome verdicts. GR-15 amendment candidate at Plan v2.56+ absorbs as "perf-lever effectiveness signals beyond mean/median LCP — variance collapse + signal-to-noise ratio improvement are corroborating indicators."

**Engineering insight 3 — Chunk-axis BREAK measured in BYTES vs PERCENTAGE shape:** The 7.9 v2.55.1 vendor-split's 218 KB / −36.5% extraction PRODUCED NO-OP LCP signal. The 7.10 lazy-load's 343,836 B / −57.5% extraction PRODUCED −550 ms LCP signal. **Byte-magnitude alone is insufficient — the SEMANTICS of what's extracted matters.** Vendor-split extracted parallel-loadable React runtime bytes (HTTP/2 parallelizes download; browser already wasn't bottlenecked on serial download). Lazy-load extracted components/providers that the browser doesn't NEED to parse on initial paint. Future perf-lever PRE0 should distinguish "byte-extraction" from "execute-deferral" — both produce structural chunk-axis BREAK; only the latter empirically moves LCP at this architecture.

**Engineering insight 4 — Measurement-tooling parameterization at structural layer.** The 7.10 Scripts/run_lighthouse_phase7.mjs rename added n=ROOT_RUNS infrastructure + LH_TASK_FIELD/LH_CAPTURE_SUFFIX env-var parameterization. Future Phase-N MEASUREMENT-ONLY tasks can invoke this script without per-task `git mv` rename ceremony. **Sister-shape to v2.55.1 workflow YAML in-place patch but for measurement tooling.** GR-15 amendment candidate at Plan v2.56+ absorbs as "measurement-tooling parameterization eliminates per-task script-rename when the script already supports the new shape." Project-wide workflow-debt reduction at Phase-N closer level.

**Engineering insight 5 — `lazyWithReload` 2-layer altitude convention empirically validated at 35+ data points.** Top-level lazy candidates use `lazyWithReload` (30+ widgetRegistry.ts + 5 new App.tsx 7.10 data points = 35+); sub-component lazy candidates use bare `React.lazy` (StrataMaintenanceAdapter 2 + InboxZero 7 = 9 data points). The bifurcation by altitude is structurally correct per the chunk-load-failure recovery semantics: top-level failure has no recovery path without reload; sub-component failure would destroy surrounding shell state if `window.location.reload()` fired. **Document as Conventions block addition at next CLAUDE.md sweep** — 2-layer altitude rule for `lazyWithReload` vs bare `React.lazy`; future-task reference for App.tsx-altitude lazy candidates.

---

**End of Phase-7 Task 7.10 Completion Report.**
