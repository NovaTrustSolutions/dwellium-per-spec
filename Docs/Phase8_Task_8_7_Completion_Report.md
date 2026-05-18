# Phase-8+ Task 8.7 — Completion Report

**Task.** Phase-8+ Task 8.7 — Entry boundary creation (Phase-8+ Block B item 2; NEW `qualia-shell/app/entry.client.tsx` + NEW `qualia-shell/app/entry.server.tsx` + UPDATE `qualia-shell/app/root.tsx` to canonical RR v7 framework-mode Layout/Root/HydrateFallback 3-export pattern per `Docs/Phases/Phase_8_Plan.md §4 Block B item 8.7` + Cowork Verdicts 12-18 LOCK at PRE0).

**Class.** `FRAMEWORK-INSTALLATION` (1pt → **2pt CROSS-TASK-SHAPE FULL CALIBRATION** at Task 8.7 close per Cowork Verdict 12 LOCK; project-wide class count stays at 18 per class-already-introduced pattern at Task 8.6). Sister-shape constellation to SCOPING-ONLY 2pt FULL CALIBRATION at Tasks 8.1+8.3 + SSR-MIGRATION-PREP 2pt FULL CALIBRATION at Tasks 8.2+8.4 — **3-of-3 Phase-8+-introduced classes fully calibrated by Task 8.7 close**. NEW sub-shape `entry-boundary-customization-via-entry.client.tsx-+-entry.server.node.tsx` (sister to Task 8.6's `react-router-v7-framework-mode-via-@react-router-dev-vite-plugin` 1pt baseline sub-shape; class extends to 2 sub-shapes within Phase-8+ at HEAD-post-8.7).

**Commit (HEAD on `main`):** `79f0ced9e445e55771878aa1b48abcbf1a4bbe0f` (squash commit for PR #75, Task 8.7 — entry boundary creation; resolved at Task 8.8 OPENING sweep per 33-consecutive-cross-phase-sweep-resolutions convention extending 32-pattern at 8.7 → 33-pattern at 8.8). Pre-merge branch commits: original Task 8.7 production-source-edits at `c35fbdd` + Step-7 §7 Finding X carry-forward addendum at `cb16b19` (DOC-only follow-up commit; sister-shape to Task 8.6 Step-4-bis Z1 remediation cycle 2-commit-per-PR precedent).

**Green CI run.** AppFolio Parity Gate — [run 26012383285](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26012383285) ✓ SUCCESS on substantive commit `c35fbdd` (all 17 steps PASS; ~12 min runtime) + [run 26012787621](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26012787621) ✓ SUCCESS on PR HEAD `cb16b19` belt-and-suspenders re-run. Both runs manual-dispatch per Finding X paths-filter quirk empirical signature (production-source edits at `qualia-shell/app/**` are OUTSIDE `qualia-shell/src/**` paths-filter glob; Cowork Q6 LOCK Task 8.7 auto-fire prediction PARTIALLY REFUTED at Step-7 — Finding X candidate deferred to Task 8.8 PRE0 carry-forward per Cowork provisional verdict). PII Scan run — [26012361574](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26012361574) ✓ SUCCESS on `c35fbdd` + [26012703379](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26012703379) ✓ SUCCESS on `cb16b19`. CodeRabbit Review — ✓ SUCCESS (auto-pass clean).

**Vitest delta.** 264 → 264 (+0). FRAMEWORK-INSTALLATION 2pt class structural-refactor-only shape preserves semantic at vitest+RTL+jsdom altitude. `routing.test.tsx` Task 8.2 5/5 PASS preserved byte-for-byte (MemoryRouter import from `react-router` core unchanged post-entry-boundary-creation; entry boundary files do NOT affect vitest test discovery or runner config; `vitest.config.ts` auto-discovered SPLIT companion at Task 8.6 close preserved unchanged).

---

## §0 — Substantive Phase-8+ Task 8.7 engineering findings (publishable-level)

### (V) Finding V — FOUC IIFE HTML-shipping regression at framework-mode SPA Mode altitude post-Task-8.6 (cemented per Cowork Verdict 15 LOCK; remediated at HydrateFallback altitude)

**Cemented per Cowork Verdict 15 LOCK at Step-2 PRE0 empirical inventory + Step-4 strict-gate empirical remediation verification.** Task 8.4's HTML-altitude FOUC mitigation engineering record (production-source edit at `qualia-shell/index.html` altitude per Cowork Q2 + Q4(b) LOCK shipping `className` pattern FOUC IIFE per Finding β empirical correction) is **STRUCTURALLY REGRESSED at framework-mode SPA Mode altitude post-Task-8.6**. Empirical signature at Step-2 PRE0 inventory (HEAD `8e04061`):

```bash
$ cd qualia-shell && VITE_APPFOLIO_SEEDS=true VITE_USE_STATIC_API=true npx react-router build
SPA Mode: Generated build/client/index.html
Removing the server build in /.../build/server due to ssr:false

$ grep -c "dwellium-theme" build/client/index.html
0
```

`build/client/index.html` content at HEAD-post-8.6 (FOUC IIFE absent):

```html
<!DOCTYPE html><html lang="en"><head>
  <meta charSet="utf-8"/>
  <meta name="viewport" content="..."/>
  <title>Loading...</title>          <!-- NOT "AstraStrata — Property Management" -->
  <link rel="modulepreload" href="..."/>  <!-- 5 modulepreload links only -->
</head>
<body>
  <main>...💿 Hey developer 👋...</main>  <!-- RR v7 default HydrateFallback dev-message -->
  <script>window.__reactRouterContext = {...}</script>
</body></html>
```

**Root cause empirical refinement (substantively distinct from Task 8.6 §7 deferred-item framing):** Build-time `renderToPipeableStream` in `entry.server.node.tsx` renders the RR v7 default `HydrateFallback` placeholder shell (the "💿 Hey developer 👋" dev-console message page), NOT our `Root()` component. Our Root() head content (5 meta tags + Google Fonts + FOUC IIFE) is React-rendered ONLY post-hydration on the client; `<script>` elements appended to DOM post-page-load are **functionally inert per DOM spec** — even when React renders them via `dangerouslySetInnerHTML`. Task 8.4's HTML-altitude FOUC mitigation engineering record is STRUCTURALLY REGRESSED at framework-mode altitude.

**Remediation per Cowork Verdict 15 LOCK: HydrateFallback named export at `app/root.tsx` (canonical RR v7 framework-mode pattern).** Combined with REFACTOR of root.tsx to canonical Layout/Root/HydrateFallback 3-export pattern: `Layout` wraps the document shell (5 meta tags + FOUC IIFE + Google Fonts in `<head>`); `Root` renders `<Outlet />` for matched routes; `HydrateFallback` renders the build-time SPA Mode body placeholder (per Finding W cementation: entry.server.tsx IS invoked at build time even at ssr: false). Layout wraps both Root AND HydrateFallback per RR v7 framework-mode canonical convention — single source of truth for document shell.

**Post-remediation empirical signature at Step-4 strict-gate verification (HEAD-post-Task-8.7):**

```bash
$ grep -c "dwellium-theme" build/client/index.html
1
```

`build/client/index.html` content post-Task-8.7-HydrateFallback (FOUC IIFE shipped to HTML at build time):

```html
<!DOCTYPE html><html lang="en"><head>
  <meta charSet="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
  <link rel="icon" type="image/svg+xml" href="/vite.svg"/>
  <meta name="theme-color" content="#6366f1"/>
  <link rel="manifest" href="/manifest.json"/>
  <title>AstraStrata — Property Management</title>     <!-- Layout head ships at build time -->
  <meta name="description" content="AstraStrata — ..."/>
  <meta property="og:title" content="..."/>
  ... (5 meta tags + Google Fonts preconnect + modulepreload + ...)
  <script>(function () {try {var theme = localStorage.getItem('dwellium-theme') || ...}})();</script>
  <!-- FOUC IIFE shipped to HTML at build time -->
</head>
```

**Binary-inversion deterministic-validation signal at Z1-style cycle:** 0 → 1 (pre-edit FOUC IIFE absent in HTML; post-edit FOUC IIFE shipped in HTML; `grep -c "dwellium-theme"` binary inversion). Sister-shape to Task 8.6's Z1.A binary-inversion validation signal at routing-config altitude (8/8 FAIL → 8/8 PASS).

**Substantive engineering record:** Task 8.4's FOUC mitigation engineering record now requires **framework-mode-aware remediation pattern at HydrateFallback altitude** for SPA Mode + at entry.server.tsx altitude for ssr:true mode (per Verdict 15 remediation roadmap). Sister-shape to Phase-7 7.10 lever-preservation engineering record — engineering records may regress at framework-mode altitude and require structurally-distinct remediation patterns at the new altitude.

### (W) Finding W — RR v7 framework-mode `entry.server.tsx` IS structurally invoked at build time even at `ssr: false` SPA Mode (8th altitude of v2.60.1 cluster)

**Cemented per Cowork Verdict 16 LOCK at Step-2 PRE0 empirical inventory.** Pre-PRE0 kickoff brief Q3.c hypothesis: "entry.server.tsx is functionally inactive at ssr: false (auto-generated by framework; skipped at build time; Task 8.7 entry boundaries exist as preparation for Task 8.8 ssr flip)". **Empirically REFUTED** at Step-2 PRE0 inspection of `node_modules/@react-router/dev/dist/config/defaults/entry.server.node.tsx`:

```typescript
let readyOption: keyof RenderToPipeableStreamOptions =
    (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";
```

The default `entry.server.node.tsx` ships an explicit `routerContext.isSpaMode` branch that selects the `onAllReady` callback (wait for full content render before shipping HTML). This branch is structurally invoked at build time in SPA Mode (`ssr: false`) — the build orchestration calls `entry.server.node.tsx::handleRequest` with `routerContext.isSpaMode: true` to generate the static `build/client/index.html` shell via `renderToPipeableStream(<ServerRouter />)`. Only the *server build output* at `build/server/` is post-emission removed per the verbatim build log:

```
SPA Mode: Generated build/client/index.html
Removing the server build in /.../build/server due to ssr:false
✓ built in 30ms
```

The `build/client/index.html` shell IS generated by entry.server.tsx at build time even at ssr:false; the build/server/ output is removed post-emission because no runtime server is needed in SPA Mode.

**Substantive engineering record:** Task 8.7 entry boundary creation is **substantively useful at ssr: false** (NOT structurally-deferred-to-Task-8.8 as kickoff brief framing anticipated). Customization of entry.server.tsx at SPA Mode altitude controls the build-time HTML-shipping path; customization of entry.client.tsx at SPA Mode altitude controls the runtime hydration path. Sister-shape to v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline at **entry-boundary-build-time-invocation altitude (8th distinct altitude for v2.60.1 cluster alone at Task 8.7 close)** after hypothesis-content (Phase-7 7.13) + implementation-shipping (Phase-7 7.13) + audit-shipping (Phase-8+ Task 8.4 finding J) + scope-existence (Phase-8+ Task 8.5 finding L) + install-shipping (Phase-8+ Task 8.6 finding S) + routing-config (Phase-8+ Task 8.6 finding U-REVISED) + nested route-id-derivation sub-altitude (Phase-8+ Task 8.6 Z1.A patch cycle) + **entry-boundary-build-time-invocation (Phase-8+ Task 8.7 finding W; NEW)**.

**Refutation pattern continues at scale across 3 consecutive Task PRE0s:**
1. **Task 8.5 PRE0:** "static-data extraction needed" → REFUTED (Finding L scope-existence altitude)
2. **Task 8.6 PRE0:** "Task 8.6/8.7 partition strict (no app/root.tsx at 8.6)" → REFUTED (Finding O Task-partition altitude)
3. **Task 8.7 PRE0:** "entry.server.tsx functionally inactive at ssr: false" → REFUTED (Finding W entry-boundary-build-time-invocation altitude)

Standing PRE-FLIGHT discipline cluster's purpose empirically vindicated at substantive scale across 3 consecutive Task PRE0s. Recursive-validation discipline pattern continues at scale — the discipline cluster catches its own wrong-hypothesis Cowork verdicts at Step-2 PRE0 altitude BEFORE Step-3 implementation propagation.

---

## §1 — Empirical evidence

**Test sweep:** Step-4 strict gate ALL PASS at HEAD-post-Step-3.

| Gate | Pre-Step-3 (HEAD-post-8.6 8e04061) | Post-Step-3 (HEAD-post-8.7) | Δ |
|---|---|---|---|
| `npx tsc -b` | ✓ Zero errors | ✓ Zero errors | preserved |
| `npx vitest run` | 264/264 | **264/264** | +0 (FRAMEWORK-INSTALLATION 2pt structural-refactor-only) |
| `npx react-router build` (SEEDS=true) | ✓ SPA Mode emit | ✓ SPA Mode emit | preserved |
| `VITE_APPFOLIO_SEEDS=false npx react-router build` | ✓ SPA Mode emit | ✓ SPA Mode emit | preserved |
| `node Scripts/verify_no_pii_leak.mjs` | ✓ 51 files / 0 leaks | ✓ 51 files / 0 leaks | preserved |
| `grep -c "dwellium-theme" build/client/index.html` | **0** (Finding V empirical signature; FOUC IIFE absent) | **1** (Finding V remediation empirical signature; FOUC IIFE HTML-shipped) | **binary inversion** at HydrateFallback altitude |
| `npx playwright test axe-baseline.spec.ts` (local; CI=true mode) | 8/8 PASS (Task 8.6 Z1.B precedent) | **8/8 PASS** (54.9s wallclock; 0 violations × 8 surfaces) | preserved; HALT-IF #4 NOT TRIGGERED |

**Chunk-axis empirical capture (Q7 BREAK prediction empirically validated; 7th cross-phase production-source-edit BREAK data point):**

| Chunk | HEAD-post-8.6 (`build/client/assets/`) | HEAD-post-8.7 (`build/client/assets/`) | Δ |
|---|---|---|---|
| Eager entry JS | `entry.client-UEY9SPBa.js` / 187,619 B | `entry.client-PwuHOHUl.js` / **187,619 B** | **filename hash BREAK** (UEY9SPBa → PwuHOHUl); byte-count PRESERVED |
| Eager CSS | `default-BebuHEVu.css` / 49,312 B | `default-BebuHEVu.css` / 49,312 B | **PRESERVED byte-for-byte** (filename hash + size; no CSS source edit at Task 8.7) |
| Vendor JS | `index-1yBoi7Al.js` / 87,711 B | `index-1yBoi7Al.js` / 87,711 B | **PRESERVED byte-for-byte** (filename hash unchanged from 6.x through 8.7 continuum) |
| StrataDashboard JS | `StrataDashboard-Cuka4DA6.js` / 1,032,178 B | `StrataDashboard-Bgo3zZ7l.js` / **1,031,519 B** | **filename hash BREAK + −659 B / −0.06%** (chunk-graph reshuffle) |
| Shared chunk | `index-DaNYx0sO.js` / 117,774 B | `index-DJi_CBRm.js` / 117,774 B | filename hash BREAK; byte-count PRESERVED |
| Root chunk | `root-CCVW2l7u.js` (~10 KB) | `root-CqOWs2us.js` (~14 KB est.) | filename hash BREAK; +Layout/HydrateFallback shapes added |
| StrataDashboard CSS | (absent) | `StrataDashboard-DXselcqa.css` / 53,856 B | NEW chunk (CSS split from default-BebuHEVu by route-module association) |

**7th cross-phase production-source-edit BREAK data point cemented** (sister to 6.1a + 6.3 + 6.4 + 7.1 + 7.10 + 8.2 + 8.6 BREAK precedents). NEW canonical at HEAD-post-8.7 documented above. Production chunk axes BREAK is structurally expected at entry-boundary altitude per Q7 prediction (entry boundary files change the entry-graph head; chunk filename hashes derive from full module dependency graph).

**Build-output-graph empirical preservation:** `build/client/` shape preserved from Task 8.6 (no Vite plugin or framework convention change at Task 8.7); SPA Mode emission per `ssr: false` LOCK preserved unchanged. `build/server/` removed post-emission per verbatim build log preserved unchanged.

**Phase-7 7.10 LCP-reduction lever PRESERVED through Task 8.7:** Eager entry chunk byte-count unchanged at 187,619 B; lazy-load architecture preserved across entry boundary refactor (entry.client.tsx hydrates the same client-side route tree; HydrateFallback ships only minimal splash placeholder body at build time).

**HALT-IF #2 grep verification PASS at Step-4 strict-gate:** post-edit `grep -c "dwellium-theme" build/client/index.html` = **1** (binary inversion from pre-edit signature = 0; Finding V remediation empirically vindicated at HydrateFallback altitude per Cowork Verdict 15 LOCK).

**HALT-IF #4 axe-baseline 8/8 PASS at Step-4-bis local re-verification:** Sister-shape to Task 8.6 Z1.B precedent (8/8 PASS within 10s overlay-visible budget; 0 violations across all 8 surfaces; 54.9s wallclock — within ±5% of Task 8.6 Z1.B 52.2s baseline; no entry-boundary-altitude regression).

---

## §2 — Reasoning narrative

**Phase-8+ Block B item 2 kickoff context.** At Task 8.6 close (8e04061 / PR #74), Block B 1-of-6 milestone established (Block B OPENER); Block B 5-of-6 remaining (8.7-8.11). Task 8.7 OPENS the entry boundary creation sub-arc per `Docs/Phases/Phase_8_Plan.md §4 Block B item 8.7` — NEW `app/entry.client.tsx` + NEW `app/entry.server.tsx` per RR v7 framework-mode canonical convention.

**Step-2 PRE0 empirical inventory surfaced 2 substantive engineering findings (V + W) at single-task PRE0** — sister-shape to Task 8.6's Step-2 PRE0 5-finding surface but at the more focused entry-boundary scope altitude. Both findings landed via 8-pattern PRE-FLIGHT discipline cluster application:

- **Finding W** surfaced via v2.60.1 falsified-hypothesis empirical-verification (kickoff brief Q3.c hypothesis "entry.server.tsx is functionally inactive at ssr: false") → Q4-d inspection of `node_modules/@react-router/dev/dist/config/defaults/entry.server.node.tsx` empirically refuted hypothesis at entry-boundary-build-time-invocation altitude.
- **Finding V** surfaced via Q4-e empirical verification of `build/client/index.html` content at HEAD-post-8.6 (`grep -c "dwellium-theme" build/client/index.html` = 0) → empirical refinement of Task 8.6 §7 deferred-item framing surfaced root cause at HydrateFallback altitude (RR v7 default HydrateFallback placeholder rendered instead of our Root()).

**Cowork verdicts LOCKED across 6 PRE0 verdicts + 1 bonus PRE-FLIGHT discipline candidate** at Task 8.7 totaling **7 distinct Cowork verdicts at single-task altitude**:

- Verdict 12 — Q1 Class LOCK: Option α FRAMEWORK-INSTALLATION 2pt FULL CALIBRATION
- Verdict 13 — Q3.a Runtime LOCK: renderToPipeableStream + entry.server.node.tsx (Node.js)
- Verdict 14 — Q3.b Streaming LOCK: Streaming (RR v7 framework-mode canonical default)
- Verdict 15 — Q5 Finding V cementation LOCK: Option a CEMENT + HydrateFallback remediation candidate
- Verdict 16 — Q5-bis Finding W cementation LOCK: CEMENT 22nd cumulative at Task 8.7 §0
- Verdict 17 — Q5-ter Catalog growth LOCK: 21 → 23 at Task 8.7 close (+2 net)
- Bonus Verdict 18 — NEW v2.68.0 PRE-FLIGHT discipline candidate at entry-boundary-build-time-invocation altitude (8th v2.60.1 cluster altitude; 9-pattern anchor-bias-mitigation cluster extension)

**Substantive engineering pivot at Task 8.7 close: FRAMEWORK-INSTALLATION class 2pt CROSS-TASK-SHAPE FULL CALIBRATION + 3-of-3 Phase-8+-introduced classes fully calibrated by Task 8.7 close** (SCOPING-ONLY 2pt at Tasks 8.1+8.3 + SSR-MIGRATION-PREP 2pt at Tasks 8.2+8.4 + FRAMEWORK-INSTALLATION 2pt at Tasks 8.6+8.7). Phase-8+ class-taxonomy-completion pattern empirically cemented at Block B item 2 close.

**+2-finding cadence at Task 8.7 close + per-task ~2-3 Block B cadence sustained.** Phase-8+ cumulative catalog 21 → 23 at Task 8.7 close (was 21 at 8.6 close → +2 at 8.7 = 23). Closer projection refines to **25-30+ findings at full Phase-8+ closure** if remaining Block B Tasks 8.8-8.11 + Block C 8.12-8.14 sustain per-task ~2-3 cadence on top of 23 cumulative at 8.7 close.

---

## §3 — Calibration class taxonomy update

**FRAMEWORK-INSTALLATION class 1pt → 2pt CROSS-TASK-SHAPE FULL CALIBRATION at Task 8.7 close per Cowork Verdict 12 LOCK** (sister-shape to SCOPING-ONLY 2pt FULL CALIBRATION at Tasks 8.1+8.3 + SSR-MIGRATION-PREP 2pt FULL CALIBRATION at Tasks 8.2+8.4 — **3-of-3 Phase-8+-introduced classes fully calibrated by Task 8.7 close**).

**Empirical 2pt calibration scope:**
- **Task 8.6 (1pt baseline):** sub-shape `react-router-v7-framework-mode-via-@react-router-dev-vite-plugin` (framework Vite plugin install + framework config + canonical directory structure + root layout scaffolding + declarative route config + scripts cutover)
- **Task 8.7 (2pt FULL CALIBRATION):** sub-shape `entry-boundary-customization-via-entry.client.tsx-+-entry.server.node.tsx` (entry boundary file customization at framework-canonical altitude; renderToPipeableStream Node.js runtime + hydrateRoot + HydratedRouter + Layout/Root/HydrateFallback 3-export refactor at app/root.tsx)

**Project-wide class count progression at Task 8.7 close:** 18 → **18** (+0 NEW class; FRAMEWORK-INSTALLATION 2pt FULL CALIBRATION at Task 8.7 close is class-already-introduced pattern at Task 8.6).

**Per-task NEW-class tracker (v2.60.4 discipline):**
- Phase-6: 2 NEW classes (10th + 11th)
- Phase-7: 4 NEW classes (12th + 13th + 14th + 15th)
- Phase-8+ Block A: 2 NEW classes (16th SCOPING-ONLY + 17th SSR-MIGRATION-PREP)
- Phase-8+ Block B (first 2 of 6 items): 1 NEW class at Task 8.6 (18th FRAMEWORK-INSTALLATION); **0 NEW class at Task 8.7** (class-extension within FRAMEWORK-INSTALLATION at sub-shape altitude)
- Phase-8+ cumulative NEW classes at HEAD-post-8.7: **3** (16th + 17th + 18th)

**Cumulative Phase-8+ engineering-finding catalog at Task 8.7 close: 23 findings** (was 21 at 8.6 close → +2 at 8.7 = 23). Per-task cadence at Phase-8+ Block B: 8 at 8.6 + 2 at 8.7 = 10 cumulative at 2 Block B tasks; Phase-8+ overall 4 + 2 + 3 + 2 + 2 + 8 + 2 = 23 cumulative at 7 tasks. Block B cadence sustains per-task ~2-3 on top of Block B opener's +8 cadence acceleration at Task 8.6.

**NEW v2.68.0 PRE-FLIGHT discipline candidate at entry-boundary-build-time-invocation altitude per Cowork Bonus Verdict 18 LOCK.** v2.68.0 framing: *"v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline applies at entry-boundary-build-time-invocation altitude — at every framework-mode entry-boundary task PRE0, verify build-time empirical invocation behavior of entry.server.tsx + entry.client.tsx at ssr: false vs ssr: true states by inspecting framework-canonical build log + empirically running react-router build AND inspecting output directory; PRE0 hypothesis adopting library-mode/Vite-SPA-mode sister-shape semantics may empirically refute at framework-mode build-time."*

**9-pattern anchor-bias-mitigation cluster recognition extension** at Task 8.7 close: cluster patterns span hypothesis-content + class-count + closer-scope + scope-shape + audit-content + Phase-plan-document-audit-content + install-shipping + routing-config + **entry-boundary-build-time-invocation** = 9 distinct empirical-verification altitudes (v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1 + v2.64.0 + v2.65.0 + v2.66.0 + v2.67.0 + **v2.68.0**). v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline now applied across **7 distinct empirical-verification altitudes for v2.60.1 cluster alone at Task 8.7 close** (hypothesis-content + implementation-shipping + audit-shipping + scope-existence + install-shipping + routing-config + entry-boundary-build-time-invocation) + nested route-id-derivation sub-altitude (carried from Task 8.6).

---

## §4 — Verdict matrix at Task 8.7 close

| Verdict scope | Cowork verdict | Empirical outcome | Cross-link |
|---|---|---|---|
| Q1 — Class designation | Option α FRAMEWORK-INSTALLATION 2pt FULL CALIBRATION | Class 1pt → 2pt full-calibration; sub-shape `entry-boundary-customization-via-entry.client.tsx-+-entry.server.node.tsx` added | §3 |
| Q3.a — Runtime selection | renderToPipeableStream + entry.server.node.tsx (Node.js) | Step-3 implementation: NEW entry.server.tsx wraps renderToPipeableStream + ServerRouter + isbot + onAllReady/onShellReady branch | §0 Finding V; §0 Finding W |
| Q3.b — Streaming vs blocking | Streaming (RR v7 framework-mode canonical default) | Step-3 implementation: streaming via renderToPipeableStream + isbot detection; SPA Mode + bots use onAllReady | §0 Finding W |
| Q5 — Finding V cementation | Option a CEMENT at Task 8.7 §0 + HydrateFallback remediation | §0 Finding V cementation shipped; Step-3 HydrateFallback named export added; Step-4 grep verification 0 → 1 binary inversion | §0 Finding V; §1 binary-inversion table |
| Q5-bis — Finding W cementation | CEMENT 22nd cumulative at Task 8.7 §0 | §0 Finding W cementation shipped; 8th v2.60.1 cluster altitude documented | §0 Finding W; §3 |
| Q5-ter — Catalog growth | 21 → 23 at Task 8.7 close (+2 net) | Cumulative Phase-8+ catalog 21 → 23 empirically cemented | §3 |
| Bonus Verdict 18 — v2.68.0 | CEMENT NEW v2.68.0 PRE-FLIGHT discipline at entry-boundary-build-time-invocation altitude | §3 v2.68.0 cementation; 9-pattern cluster recognition extension | §3 |

---

## §5 — Verification matrix

| Verification | Acceptance | Empirical outcome | Cross-link |
|---|---|---|---|
| tsc -b strict | zero errors | ✓ silent success | Step-4 |
| vitest 264/264 | ≥264 | ✓ **264/264** (38 test files; 2.75s) | Step-4; pre-Step-3 264 baseline preserved |
| react-router build (SEEDS=true) | SPA Mode emit | ✓ `build/client/index.html` + chunk graph | Step-4 |
| react-router build (SEEDS=false) | SPA Mode emit | ✓ identical shape | Step-4 |
| PII guard | 0 leaks | ✓ 51 files / 0 leaks | Step-4 |
| HALT-IF #2 grep dwellium-theme in build/client/index.html | non-zero | ✓ **1** (binary inversion from pre-edit 0) | §0 Finding V remediation; §1 binary-inversion table |
| HALT-IF #4 local Playwright axe-baseline 8/8 PASS | 8/8 within 10s overlay-visible budget | ✓ **8/8 PASS** (54.9s wallclock; 0 violations × 8 surfaces) | §1 |
| Chunk-axis BREAK prediction (Q7) | filename hash BREAK at production-source-edit | ✓ entry.client + StrataDashboard + index shared chunks BREAK; vendor + CSS PRESERVED byte-for-byte | §1 chunk-axis table |
| 32-pattern milestone cross-phase sweep-resolutions cementation | Task 8.6 TBD → `8e04061` / `#74` resolution co-shipped at Task 8.7 OPENING sweep | ✓ Resolved at Step-1 sweep at Task 8.7 OPENING (5 reference spots: §9 row 8.6 + Phase_8_Plan Phase status + Task 8.6 Completion Report Commit/Green CI/Verification Matrix/Rollback SHA + CLAUDE.md HEAD pointer pivot) | §6 below |
| Step-7 fresh-push Parity Gate (substantive `c35fbdd`) | ✓ SUCCESS | ✓ [run 26012383285](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26012383285) SUCCESS (all 17 steps; ~12 min) | §0 Finding V remediation empirical signature 0 → 1 |
| Step-7 belt-and-suspenders Parity Gate (PR HEAD `cb16b19`) | ✓ SUCCESS | ✓ [run 26012787621](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26012787621) SUCCESS | Cowork CONDITIONAL MERGE GO verify-first guardrail |
| Manual paths-filter at parity gate dispatch | auto-fire expected via `qualia-shell/src/**` glob OR root-parent altitude (Q6 LOCK prediction) | **EMPIRICALLY PARTIALLY REFUTED** at Step-7: production-source edits at `qualia-shell/app/**` ALONE (no `qualia-shell/src/**` simultaneous edits) do NOT trigger auto-fire; manual-dispatch required at both Parity Gate runs; sister-shape to Finding X candidate carry-forward to Task 8.8 PRE0 | §7 Finding X deferred-item |
| CodeRabbit review per PR | pass | ✓ SUCCESS (auto-pass clean) | PR #75 statusCheckRollup |

---

## §6 — Rollback plan

Rollback target: `git revert 8e04061` (Phase-8+ Task 8.6 squash; pre-Task-8.7 state restoring framework-mode without entry boundary customization + HydrateFallback). Resolved at Task 8.8 OPENING sweep ✓.

Rollback safety: FRAMEWORK-INSTALLATION 2pt class structural-refactor-only at sub-shape altitude; semantic preservation at vitest+RTL+jsdom altitude (264/264 PASS preserved); routing.test.tsx 5/5 preserved byte-for-byte; entry boundary files are additive scaffolding (rollback removes those 2 files + reverts root.tsx refactor); NO `package.json` deps changes (all RR v7 framework-mode deps installed at Task 8.6 Finding S calibration unchanged at Task 8.7). Build-output-graph preserved at HEAD-post-Task-8.7 (`build/client/` shape unchanged from Task 8.6); HydrateFallback addition produces structurally-equivalent SPA Mode shell with FOUC IIFE shipped to HTML (no breaking change to existing CI workflow consumers).

Phase-8+ Block B item 2 reversibility verified by construction: entry boundary files are entirely opt-in (RR v7 framework auto-generates defaults if absent; removing custom entry boundaries restores default behavior with empirical signature `grep -c "dwellium-theme"` → 0 at HEAD-pre-Task-8.7).

---

## §7 — Phase-8+ deferred-items carry-forward (Phase-8+ Task 8.7 contributions; 5 NEW items)

1. **Task 8.8 ssr: false → ssr: true flip scope inheritance** — `react-router.config.ts` `ssr: false` initial state at HEAD-post-Task-8.7 unchanged; Task 8.8 OPENS the ssr flip arc per `Docs/Phases/Phase_8_Plan.md §4 Block B item 8.8`. Entry boundary files become RUNTIME-active at ssr: true (per-request server rendering via `entry.server.tsx::handleRequest`); HydrateFallback continues to ship at build time for non-SSR routes per RR v7 framework-mode convention.
2. **Plan v2.67+ amendment candidate: 9-pattern anchor-bias-mitigation cluster cementation** — formalize 9-pattern cluster (v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1 + v2.64.0 + v2.65.0 + v2.66.0 + v2.67.0 + **v2.68.0 entry-boundary-build-time-invocation altitude**) as standing PRE-FLIGHT discipline for downstream Phase-8+ Block B Tasks 8.8-8.11 + Block C 8.12-8.14 + Phase-9+ onboarding.
3. **Edge runtime variant carry-forward** — Task 8.7 LOCKED renderToPipeableStream + Node.js runtime per Verdict 13 (matches existing /api proxy backend + production Node deployment plan). If Phase-9+ Edge/Web Workers deployment emerges as future requirement, ADD NEW `qualia-shell/app/entry.server.edge.tsx` (sister-shape to canonical RR v7 default at `node_modules/@react-router/dev/dist/config/defaults/entry.server.web.tsx` if shipped in future RR v7 versions) using `renderToReadableStream` + Web Streams API. Deferred to Phase-9+ kickoff if applicable.
4. **`entry.client.tsx` customization opportunities** — Task 8.7 ships minimal canonical entry.client.tsx wrapper (sister-shape to RR v7 default; preserves StrictMode + HydratedRouter primitives). Future customization candidates: (a) custom hydration error boundary at hydrateRoot altitude; (b) StrictMode opt-out for production (controversial; React 19 strict-mode-double-fire-only-in-dev convention); (c) explicit onCaughtError/onUncaughtError/onRecoverableError callbacks for hydration error telemetry. All deferred to Phase-9+ kickoff if telemetry/observability arc emerges as Phase-9+ Block A scope.
5. **Finding X candidate — paths-filter taxonomy refinement at `qualia-shell/app/**` altitude (DEFER to Task 8.8 PRE0 per Cowork provisional verdict at Step-7).** Empirical signature at Task 8.7 Step-7 PR #75 push: production-source-edits at `qualia-shell/app/**` ALONE (without simultaneous `qualia-shell/src/**` edits) do NOT trigger parity-gate auto-fire — only PII Scan auto-fires (paths-filter `qualia-shell/**` glob is broader); Parity Gate paths-filter at `.github/workflows/appfolio-parity-gate.yml` is scoped to `qualia-shell/src/**` glob which does NOT include `qualia-shell/app/**`. Task 8.6 paths-filter auto-fire was triggered by `src/App.tsx` named-export promotion edit (production-source-edit inside `qualia-shell/src/**` glob); simultaneous `app/**` edits were NOT the trigger. Task 8.7 production-source-edit footprint at `qualia-shell/app/**` + zero `src/**` edits empirically isolates `app/**` paths-filter scope — sister-shape to `qualia-shell/e2e/**` + `Docs/**` + root `CLAUDE.md` manual-dispatch precedents (extends 16-task cross-phase manual-dispatch scope at Task 8.5 → 17-task cross-phase at Task 8.7). **Substantive paths-filter taxonomy refinement candidate:** parity-gate paths-filter at `.github/workflows/appfolio-parity-gate.yml` should be amended at Plan v2.68+ to include `qualia-shell/app/**` glob (matches RR v7 framework-mode canonical app/ directory convention) — recommended for Phase-8+ deferred-items carry-forward to **Task 8.8 OPENING sweep** OR Block C closer 8.14 amendment per Cowork provisional verdict at Task 8.7 Step-7 acknowledgment. Refines Cowork Q6 LOCK Task 8.7 prediction at empirical-paths-filter-scope altitude; 4th consecutive Task PRE0-or-execution-cycle empirical refutation pattern (8.5 PRE0 + 8.6 PRE0 + 8.7 PRE0 + 8.7 Step-7 paths-filter empirical refinement). Finding X cementation at Task 8.8 PRE0 carry-forward would extend 9-pattern anchor-bias-mitigation cluster to 10-pattern at empirical-paths-filter-scope altitude (v2.69.0 PRE-FLIGHT discipline candidate at paths-filter-scope altitude).

---

## §8 — Cowork verdict gate

**Phase-8+ Task 8.7 closure verdict at this Completion Report:** GO if Step-7 PR open + Parity Gate dispatch confirms ✓ SUCCESS + zero downstream regression at parity-gate-canonical build mode (`react-router build` bare + SEEDS=false variants) + Approach A CI hygiene preserved (pre-Playwright build + `vite preview --outDir build/client` from Task 8.6 Verdict 6 Z1 LOCK).

**Block B 2-of-6 milestone at this close.** Block B 6-task arc continues (8.6 ✓ + 8.7 ✓ + 8.8 R + 8.9 R + 8.10 R + 8.11 R). Task 8.8 next: per-route SSR opt-in + `ssr: false → ssr: true` flip + hydration smoke-test per `Phase_8_Plan.md §4 Block B item 8.8`. Cowork verdict at Task 8.8 PRE0.

**Cumulative Phase-8+ engineering-finding catalog at 23 findings post-Task-8.7 close** (sister-shape to Phase-7 closer §2 2-finding catalog depth applied at 11.5× scaling factor + cadence sustained at Block B item 2 per-task +2 cadence post-Block B opener's +8 cadence acceleration). Phase-8+ closer projection refines to **25-30+ findings at full closure** if remaining Block B Tasks 8.8-8.11 + Block C 8.12-8.14 sustain per-task ~2-3 cadence on top of 23 cumulative at 8.7 close.

---

### Reference

- `Docs/Phases/Phase_8_Plan.md §4 Block B item 8.7` (plan-doc shipping-time framing pre-v2.67 amendment; entry boundary creation scope)
- `Docs/AppFolio_Parity_Implementation_Plan_v2.md §9` row 8.7 closure at v2.67 amendment
- `Docs/Phase8_Task_8_6_Completion_Report.md §0` Finding V deferred-item carry-forward + §3 class definition item (iv) entry boundary scaffolding + §7 Task 8.7 PRE0 context
- `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §4` TanStack Query SSR-hydration discipline + §6 Block B implementation roadmap (Task 8.8 ssr flip prerequisite)
- `node_modules/@react-router/dev/dist/config/defaults/entry.client.tsx` + `entry.server.node.tsx` (canonical RR v7 framework-mode entry boundary defaults inspected at Step-2 PRE0 Q4-d for Finding W empirical signature)
- RR v7 framework-mode HydrateFallback canonical convention (sister-shape to React Suspense boundary fallback pattern; build-time HTML-shipping at SPA Mode altitude per Finding V remediation pattern)
- HEAD `8e04061` post-Task-8.6 baseline + HEAD-post-8.7 framework-mode entry boundary chunk-axis empirical capture
- Parity Gate runs 26012383285 (substantive `c35fbdd`) + 26012787621 (PR HEAD `cb16b19`) ✓ SUCCESS at Step-7 push; PII Scan runs 26012361574 + 26012703379 ✓ SUCCESS; CodeRabbit ✓ SUCCESS — PR #75 squash-merged at `79f0ced9e445e55771878aa1b48abcbf1a4bbe0f` 2026-05-18T04:12:48Z per Cowork Verdict 11 (Task 8.6) sister-shape unconditional merge + Task 8.7 CONDITIONAL MERGE GO confirmed
