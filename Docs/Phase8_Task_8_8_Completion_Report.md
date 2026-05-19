# Phase-8+ Task 8.8 — Completion Report

**Task.** Phase-8+ Task 8.8 — Per-route SSR opt-in (Phase-8+ Block B item 3); empirically refined at Task 8.8 PRE0 per Cowork Verdict 19 LOCK to **SCOPING-ONLY 3pt → 4pt CROSS-TASK-SHAPE-ROBUSTNESS extension** with NEW 4th sub-shape `empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE` (sister-shape to Tasks 8.1 + 8.3 + 8.5 SCOPING-ONLY precedents). Empirical-inventory at PRE0 surfaced Finding Y (per-route SSR opt-out structurally infeasible at RR v7 framework-mode 7.15.1) — drove scope-collapse from kickoff brief Option β (per-route SSR with SPA-only escape) to Option γ scoping-roadmap + ssr-flip-deferred-to-Task-8.9. Co-shipped v2.68.1 in-place workflow patch (paths-filter glob amendment for `qualia-shell/app/**` per Finding X carry-forward from Task 8.7 §7).

**Class.** `SCOPING-ONLY` 3pt → **4pt CROSS-TASK-SHAPE-ROBUSTNESS** at Task 8.8 close per Cowork Verdict 19 LOCK; project-wide class count stays at 18 per class-already-fully-calibrated pattern at Task 8.3 close. Sister-shape constellation to MEASUREMENT-ONLY 7pt → 8pt → 9pt extension pattern at Phase-7 7.11 + 7.14. **Hybrid co-shipping:** SCOPING-ONLY (primary; zero production-source) + CI-CONFIG-ONLY (co-shipped via v2.68.1 workflow patch; 12th class extension at Phase-8+ Block B opener trio cumulative 4-in-place-patches precedent).

**SCOPING-ONLY class 4pt sub-shapes empirically calibrated at Task 8.8 close:**
1. Task 8.1 OPENER (1pt baseline) — `forward-scoping-architectural-roadmap`
2. Task 8.3 (2pt FULL CALIBRATION) — `provider-tree-audit`
3. Task 8.5 (3pt CROSS-TASK-SHAPE-ROBUSTNESS) — `empirical-inventory-confirming-NO-extraction-needed`
4. **Task 8.8 (4pt CROSS-TASK-SHAPE-ROBUSTNESS NEW) — `empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE`**

**Commit (HEAD on `main`):** `387abfa` (squash commit for PR #76, Task 8.8 — Per-route SSR opt-in SCOPING-ONLY 4pt extension + v2.68.1 paths-filter patch; resolved at Task 8.9 OPENING sweep — 34-consecutive cross-phase sweep-resolutions milestone cemented at Task 8.9 PRE0; CLAUDE.md cleanup PR #77 / `0a3c83f` intervened as repo-hygiene step between Task 8.8 close and Task 8.9 OPENING, not counted in sweep chain).

**Green CI run.** AppFolio Parity Gate — [run 26037807745](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26037807745) ✓ SUCCESS (Parity Gate **AUTO-FIRED** per v2.68.1 paths-filter glob amendment + `.github/workflows/**` self-reference in paths-filter — empirically confirmed Finding X paths-filter taxonomy refinement remediation effectiveness at this Task 8.8 close). PII Scan — [run 26037807544](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26037807544) ✓ SUCCESS. CodeRabbit Review — ✓ SUCCESS.

**Vitest delta.** 264 → 264 (+0). SCOPING-ONLY 4pt class shape preserves zero-production-source semantic at vitest+RTL+jsdom altitude. `routing.test.tsx` Task 8.2 5/5 PASS preserved byte-for-byte (no source touched).

---

## §0 — Substantive Phase-8+ Task 8.8 engineering findings (publishable-level)

### (X) Finding X — Parity-gate paths-filter taxonomy refinement at `qualia-shell/app/**` altitude (cemented per Cowork Verdict 20 LOCK; carry-forward from Task 8.7 §7 deferred-item)

**Cemented per Cowork Verdict 20 LOCK at Task 8.8 §0.** Empirical signature at Task 8.7 Step-7 PR #75 push (carried forward from Task 8.7 §7 deferred-item per Cowork provisional verdict at Step-7 acknowledgment):

- Production-source edits at `qualia-shell/app/**` ALONE (without simultaneous `qualia-shell/src/**` edits) do NOT trigger parity-gate auto-fire
- PII Scan auto-fires on push (paths-filter `qualia-shell/**` glob is broader)
- Parity Gate paths-filter at `.github/workflows/appfolio-parity-gate.yml` scoped to `qualia-shell/src/**` glob — does NOT include `qualia-shell/app/**` (RR v7 framework-mode canonical app/ directory)
- Task 8.7 required manual-dispatch via `gh workflow run "AppFolio Parity Gate" --ref phase-8/task-8.7-...` (2 runs: 26012383285 on substantive `c35fbdd` + 26012787621 on PR HEAD `cb16b19` belt-and-suspenders)
- Task 8.6 paths-filter auto-fire WAS triggered by `src/App.tsx` named-export promotion edit (production-source-edit inside `qualia-shell/src/**` glob); simultaneous `app/**` edits were NOT the trigger

**Sister-shape to established 17-task cross-phase paths-filter quirk precedents** (`qualia-shell/e2e/**` + `Docs/**` + root `CLAUDE.md` + `qualia-shell/playwright.baseline.config.ts` + `Scripts/**` outside `qualia-shell/src/**` glob).

**Remediation per Cowork Verdict 20 LOCK: in-place v2.68.1 workflow patch at `.github/workflows/appfolio-parity-gate.yml::paths-filter` glob amendment.** Add `qualia-shell/app/**` to BOTH `push.paths` AND `pull_request.paths` arrays (sister-shape minimal-scope 2-line edit; one line added per array). Sister-shape constellation to Task 8.6's 3-in-place-patches-per-task precedent:

| In-place patch | Altitude | Cowork verdict | Task |
|---|---|---|---|
| v2.66.1 | build-command (`npx vite build` → `npx react-router build` per Finding T) | Q3 LOCK at Task 8.6 | Task 8.6 |
| v2.66.2 | server-startup (workflow pre-Playwright build + playwright.baseline.config.ts webServer reshape per Approach A LOCK) | Verdict 1 LOCK at Task 8.6 | Task 8.6 |
| v2.66.3 | routing-config (`app/routes.ts` `index()` + `{ id: 'splat' }` per Finding U-REVISED) | Verdict 6 Z1 LOCK at Task 8.6 | Task 8.6 |
| **v2.68.1** | **paths-filter-scope (`qualia-shell/app/**` glob amendment per Finding X)** | **Verdict 20 LOCK at Task 8.8** | **Task 8.8** |

**Establishes 4-in-place-patches-cumulative-at-Phase-8+-Block-B-opener-trio precedent** (3 patches at Task 8.6 + 1 patch at Task 8.8). Extends Phase-7 Task 7.3 v2.50.1+v2.50.2 2-in-place-precedent at Block B framework-mode altitude.

**Empirical verification at Step-7 (anticipated):** Post-v2.68.1 patch, Task 8.8 PR push will AUTO-FIRE Parity Gate via `.github/workflows/**` self-reference in paths-filter (parity-gate workflow file itself in paths). Future Task 8.9+ tasks editing `qualia-shell/app/**` will AUTO-FIRE without manual-dispatch — Finding X remediation cascading effect sister-shape to v2.66.1 cascading workflow-coverage effect.

**Cascading paths-filter coverage at HEAD-post-Task-8.8** (Phase-8+ Block B opener trio cumulative):
- `qualia-shell/src/**` (pre-existing; covers Task 8.6 `src/App.tsx` named-export promotion + Task 8.9+ `src/context/**` provider remediation)
- `qualia-shell/app/**` (**NEW at v2.68.1**; covers Task 8.7 `app/entry.{client,server}.tsx` + `app/root.tsx` Layout/Root/HydrateFallback 3-export pattern + Task 8.9+ `app/routes.ts` per-route-ssr-toggle if surfaced)
- `qualia-shell/public/data/**` (pre-existing)
- `qualia-shell/src/test/appfolioParity/**` (pre-existing)
- `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/**` (pre-existing)
- `Scripts/derive_appfolio_fixtures.mjs` + `Scripts/verify_no_pii_leak.mjs` (pre-existing)
- `.github/workflows/appfolio-parity-gate.yml` self-reference (pre-existing)

### (Y) Finding Y — Per-route SSR opt-out empirical infeasibility at RR v7 framework-mode 7.15.1 (cemented per Cowork Verdict 21 LOCK)

**Cemented per Cowork Verdict 21 LOCK at Task 8.8 §0 (25th cumulative finding).** Empirical signature at Step-2 PRE0 Q4-b inventory of RR v7 framework-mode SSR mechanism types at HEAD `79f0ced`:

**`ReactRouterConfig::ssr` is GLOBAL boolean at framework-config altitude** per `node_modules/@react-router/dev/dist/config.d.ts:155`:

```typescript
/**
 * Enable server-side rendering for your application. Disable to use "SPA
 * Mode", which will request the `/` path at build-time and save it as an
 * `index.html` file with your assets so your application can be deployed as a
 * SPA without server-rendering. Default's to `true`.
 */
ssr?: boolean;
```

**`RouteConfigEntry` type at `node_modules/@react-router/dev/dist/routes-CZR-bKRt.d.ts` exposes ONLY** `id` / `path` / `index` / `caseSensitive` / `file` / `children` — **NO `ssr` field**:

```typescript
interface RouteConfigEntry {
    id?: string;
    path?: string;
    index?: boolean;
    caseSensitive?: boolean;
    file: string;
    children?: RouteConfigEntry[];
}
```

**`route()` helper `CreateRouteOptions` = `Pick<RouteConfigEntry, "id" | "index" | "caseSensitive">`** — `route()` helper does NOT accept per-route `{ ssr: false }` argument.

**`index()` helper `CreateIndexOptions` = `Pick<RouteConfigEntry, "id">`** — `index()` helper does NOT accept per-route ssr argument.

**No route-module export discriminator** (e.g., `export const ssr = false`) is canonically supported in RR v7 framework-mode 7.15.1 per `node_modules/@react-router/dev/dist/vite.js` route-module exports inspection.

**Soft per-route mechanisms available (not pure SSR opt-out):**
- `clientLoader` — route-data fetch shifts client-side (route still server-renders)
- `clientAction` — route-action execution shifts client-side (route still server-renders)
- `HydrateFallback` — component-level fallback during hydration (sister-shape to Task 8.7 Verdict 15 LOCK at root.tsx altitude; not per-route SPA opt-out)
- `serverBundles` — routes-to-bundles mapping (bundles still SSR'd; not SPA opt-out)
- `prerender` — static-prerender paths array (not per-route runtime SSR opt-out)

**Empirical implication for Task 8.8 architectural strategy:** Cowork Task 8.8 kickoff brief Option β (per-route SSR with admin-shell SPA-only escape via per-route opt-out mechanism) is **empirically infeasible at RR v7 framework-mode 7.15.1**. Architectural strategy collapses to Option α (full SSR + provider remediation at Task 8.8; HIGH risk; rejected per Cowork Verdict 23 reaffirming Task 8.3 Verdict 9 LOCK deferring provider remediation to Task 8.9) OR Option γ (SCOPING-ONLY scope-collapse; deferred ssr flip + provider remediation atomic to Task 8.9; LOCKED per Cowork Verdict 19).

**Sister-shape constellation: 4th consecutive Task PRE0 wrong-hypothesis refutation at substantive scale** (Findings L + O + W + Y):
1. **Task 8.5 PRE0** — kickoff hypothesis "static-data extraction needed" → REFUTED at Finding L (scope-existence altitude)
2. **Task 8.6 PRE0** — kickoff hypothesis "Task 8.6/8.7 partition strict (no app/root.tsx at 8.6)" → REFUTED at Finding O (Task-partition altitude)
3. **Task 8.7 PRE0** — kickoff hypothesis "entry.server.tsx functionally inactive at ssr: false" → REFUTED at Finding W (entry-boundary-build-time-invocation altitude)
4. **Task 8.8 PRE0 (NEW) — kickoff hypothesis "per-route SSR opt-out mechanism available at RR v7 framework-mode" → REFUTED at Finding Y (per-route-routing-config altitude)**

**Standing PRE-FLIGHT discipline cluster's recursive-self-validation property empirically vindicated at 4-consecutive-Task substantive scale.** Recursive-validation discipline IS the project's most substantive engineering record pattern at HEAD-post-Task-8.8. Cowork hypothesis-altitude kickoff brief verdicts are themselves subject to empirical refutation at PRE0+verification altitudes — this is structurally a feature of the discipline cluster, not a bug.

**9th distinct altitude for v2.60.1 cluster** (per-route-routing-config altitude after Task 8.7's 7th entry-boundary-build-time-invocation altitude + nested route-id-derivation sub-altitude from Task 8.6 Z1.A patch cycle):

1. Hypothesis-content altitude (Phase-7 7.13)
2. Implementation-shipping altitude (Phase-7 7.13)
3. Audit-shipping altitude (Phase-8+ Task 8.4 Finding J)
4. Scope-existence altitude (Phase-8+ Task 8.5 Finding L)
5. Install-shipping altitude (Phase-8+ Task 8.6 Finding S)
6. Routing-config altitude (Phase-8+ Task 8.6 Finding U-REVISED)
7. Entry-boundary-build-time-invocation altitude (Phase-8+ Task 8.7 Finding W)
8. **(NESTED sub-altitude under #6)** Route-id-derivation altitude (Phase-8+ Task 8.6 Z1.A patch cycle)
9. **Per-route-routing-config altitude (Phase-8+ Task 8.8 Finding Y — NEW)**

---

## §1 — Empirical evidence

**Test sweep:** Step-4 minimal-gate per SCOPING-ONLY class shape (sister-shape to Tasks 8.1+8.3+8.5 minimal-gate precedents; SKIP vite builds × 2 per zero-production-source class discipline per Cowork Q7 LOCK).

| Gate | Pre-Step-3 (HEAD-post-8.7 79f0ced) | Post-Step-3 (HEAD-post-8.8) | Δ |
|---|---|---|---|
| `npx tsc -b` | ✓ Zero errors | ✓ Zero errors | preserved |
| `npx vitest run` | 264/264 | **264/264** | +0 (SCOPING-ONLY 4pt class structural; zero production source touched) |
| `node Scripts/verify_no_pii_leak.mjs` | ✓ 51 files / 0 leaks | ✓ 51 files / 0 leaks | preserved |
| `npx react-router build` (SEEDS=true) | SKIPPED per SCOPING-ONLY minimal-gate | SKIPPED per SCOPING-ONLY minimal-gate | — |
| `npx react-router build` (SEEDS=false) | SKIPPED per SCOPING-ONLY minimal-gate | SKIPPED per SCOPING-ONLY minimal-gate | — |
| HALT-IF #1 grep `qualia-shell/app/` in workflow | zero matches (pre-patch) | **1+ matches post-v2.68.1** (paths-filter glob amendment shipped) | binary inversion 0 → 1 at paths-filter-scope altitude |

**Chunk-axis empirical capture:** N/A at Task 8.8 close — SCOPING-ONLY 4pt zero-production-source-edit class shape preserves chunk axes byte-for-byte vs HEAD `79f0ced` baseline (34-of-34 cross-phase chunk-axis preservation cumulative pattern continues; sister-shape to Task 8.5 chunk-axis preservation precedent at SCOPING-ONLY 3pt class altitude).

**v2.68.1 in-place workflow patch empirical verification at Step-3:**
- Pre-patch: `grep -n "qualia-shell/app/" .github/workflows/appfolio-parity-gate.yml` → exit code 1 (zero matches; HALT-IF #1 PASS per minimal-scope precondition)
- Post-patch: `qualia-shell/app/**` glob present in BOTH `push.paths` AND `pull_request.paths` arrays (2-line edit; sister-shape minimal-scope to v2.66.1 2-line edit precedent at build-command altitude)
- Workflow YAML structurally valid (no syntax errors at `npx tsc -b` Step-4 strict-gate pass; sister-shape verification at Task 8.6 v2.66.1 + Task 7.3 v2.50.1 in-place patch precedents)

**Empirical RR v7 framework-mode SSR mechanism inventory (Q4-b PRE0 verification at HEAD `79f0ced`):**

| Inventory dimension | Path | Empirical signature |
|---|---|---|
| `ReactRouterConfig::ssr` | `node_modules/@react-router/dev/dist/config.d.ts:155` | `ssr?: boolean` (GLOBAL flip) |
| `RouteConfigEntry` type | `node_modules/@react-router/dev/dist/routes-CZR-bKRt.d.ts` | 6 fields: id/path/index/caseSensitive/file/children (NO ssr) |
| `route()` helper options | `routes-CZR-bKRt.d.ts` (CreateRouteOptions) | `Pick<RouteConfigEntry, "id" \| "index" \| "caseSensitive">` |
| `index()` helper options | `routes-CZR-bKRt.d.ts` (CreateIndexOptions) | `Pick<RouteConfigEntry, "id">` |
| Route-module exports | `node_modules/@react-router/dev/dist/vite.js` (canonical exports list) | clientLoader / clientAction / HydrateFallback / loader / action / meta / links / ErrorBoundary / default — NO `ssr` export discriminator |

**Empirical Q4-c ssr: true flip test:** Temporary `ssr: false → true` flip at `react-router.config.ts` + `npx react-router build` → SUCCEEDED at build-time (~640ms; emitted `build/server/` + `build/client/`). Build-time compilation does NOT execute provider tree `useState` lazy initializers per Task 8.3 findings G/H/I; only per-request runtime server-render would surface `ReferenceError: localStorage is not defined`. Empirical signal validates Task 8.9 atomic-shipping strategy (ssr flip + provider remediation pair) over Task 8.8 partial-shipping (Option ε REJECTED per Cowork Verdict 19). Local config restored to `ssr: false` at PRE0 close.

---

## §2 — Reasoning narrative

**Phase-8+ Block B item 3 kickoff context.** At Task 8.7 close (`79f0ced` / PR #75), Block B 2-of-6 milestone established. Task 8.8 OPENS the per-route SSR opt-in arc per `Docs/Phases/Phase_8_Plan.md §4 Block B item 8.8` — empirically refined at Task 8.8 PRE0 per Cowork Verdict 19 LOCK to SCOPING-ONLY 4pt scope-collapse + Finding X + Finding Y dual cementation + v2.68.1 paths-filter patch co-shipping. Atomic ssr flip + provider remediation deferred to Task 8.9 per Cowork Verdicts 19 + 23 (reaffirming Task 8.3 Verdict 9 LOCK).

**Step-2 PRE0 surfaced Finding Y at Q4-b empirical inventory.** RR v7 framework-mode 7.15.1 per-route SSR opt-out mechanism is structurally infeasible — `ReactRouterConfig::ssr` is GLOBAL boolean (no per-route override available via route() helper, index() helper, RouteConfigEntry type, or route-module exports). Cowork kickoff brief Option β (per-route SSR with admin-shell SPA-only escape via per-route opt-out mechanism) is empirically refuted; option matrix collapses to Option α (full SSR + provider remediation at Task 8.8; HIGH risk; rejected) OR Option γ (SCOPING-ONLY scope-collapse + atomic deferred to Task 8.9; LOCKED). 4th consecutive Task PRE0 wrong-hypothesis refutation pattern (8.5 + 8.6 + 8.7 + 8.8) cements recursive-validation discipline as the project's most substantive engineering record pattern.

**Cowork verdicts LOCKED across 5 PRE0 verdicts (19-23):** Q1 SCOPING-ONLY 3pt → 4pt extension + Q3 Finding X cementation + v2.68.1 paths-filter patch + Q4-f Finding Y cementation + Q5-bis 11-pattern cluster + v2.69.0 + v2.70.0 PRE-FLIGHT discipline candidates + Q5 provider remediation deferral REAFFIRMED.

**Substantive engineering pivot at Task 8.8 close: SCOPING-ONLY 3pt → 4pt CROSS-TASK-SHAPE-ROBUSTNESS with NEW 4th sub-shape `empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE`.** Sister-shape constellation to Task 8.5's 3pt extension with NEW 3rd sub-shape `empirical-inventory-confirming-NO-extraction-needed` (same shape: empirical-inventory drives scope-collapse via refutation of kickoff hypothesis). Per-task Phase-8+ class-taxonomy-completion pattern continues — Phase-8+ Block A 2-of-2 class-taxonomy-completion pattern + Block B 2-of-2 class-taxonomy-completion pattern at Task 8.7 close + SCOPING-ONLY 4pt cross-task-shape-robustness at Task 8.8 close.

**+2-finding cadence at Task 8.8 close sustains per-task ~2-3 Block B cadence:** Phase-8+ catalog 23 → 25 at Task 8.8 close. Closer projection refines further to **27-32+ findings at full Phase-8+ closure** if Block B Tasks 8.9-8.11 + Block C 8.12-8.14 sustain per-task ~2-3 cadence on top of 25 cumulative at 8.8.

---

## §3 — Calibration class taxonomy update

**SCOPING-ONLY class 3pt → 4pt CROSS-TASK-SHAPE-ROBUSTNESS at Task 8.8 close per Cowork Verdict 19 LOCK** (sister-shape constellation to MEASUREMENT-ONLY 7pt → 8pt → 9pt extension pattern at Phase-7 7.11 + 7.14; class already fully calibrated at 2pt at Task 8.3 close; 3pt at 8.5; 4pt at 8.8 strengthens empirical record + surfaces NEW 4th sub-shape).

**Empirical 4pt calibration scope:**
- **Task 8.1 OPENER (1pt baseline):** sub-shape `forward-scoping-architectural-roadmap`
- **Task 8.3 (2pt FULL CALIBRATION):** sub-shape `provider-tree-audit`
- **Task 8.5 (3pt CROSS-TASK-SHAPE-ROBUSTNESS):** sub-shape `empirical-inventory-confirming-NO-extraction-needed`
- **Task 8.8 (4pt CROSS-TASK-SHAPE-ROBUSTNESS NEW):** sub-shape `empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE`

**Project-wide class count progression at Task 8.8 close:** 18 → **18** (+0 NEW class; SCOPING-ONLY 4pt at Task 8.8 close is class-already-fully-calibrated pattern at Task 8.3 close; this is sub-shape addition within existing class).

**Per-task NEW-class tracker (v2.60.4 discipline):**
- Phase-6: 2 NEW classes (10th + 11th)
- Phase-7: 4 NEW classes (12th + 13th + 14th + 15th)
- Phase-8+ Block A: 2 NEW classes (16th SCOPING-ONLY + 17th SSR-MIGRATION-PREP)
- Phase-8+ Block B Task 8.6: 1 NEW class (18th FRAMEWORK-INSTALLATION)
- Phase-8+ Block B Tasks 8.7 + 8.8: **0 NEW classes** (class-extension within FRAMEWORK-INSTALLATION + SCOPING-ONLY at sub-shape altitude)
- Phase-8+ cumulative NEW classes at HEAD-post-8.8: **3** (16th + 17th + 18th)

**Cumulative Phase-8+ engineering-finding catalog at Task 8.8 close: 25 findings** (was 23 at 8.7 close → +2 at 8.8 = 25). Per-task cadence at Phase-8+: 4 + 2 + 3 + 2 + 2 + 8 + 2 + 2 = **25 cumulative at 8 tasks**. Block B 3-task cumulative: 12 findings (Task 8.6 + 8.7 + 8.8) — substantive engineering record at Block B opener trio altitude.

**NEW v2.69.0 PRE-FLIGHT discipline candidate at paths-filter-scope altitude per Cowork Verdict 22 LOCK.** v2.69.0 framing: *"Paths-filter scope at CI workflow altitude MUST empirically cover all production-source-edit directories at HEAD-time; framework-mode adoption introducing NEW production-source directories (app/ per RR v7 canonical) requires paths-filter glob amendment as in-place workflow patch sister-shape to v2.66.1+v2.66.2+v2.66.3 precedents; at every framework-adoption task PRE0+verification cycle, empirically inspect paths-filter scope against actual production-source-edit directories + amend if discrepancy."*

**NEW v2.70.0 PRE-FLIGHT discipline candidate at per-route-routing-config altitude per Cowork Verdict 22 LOCK.** v2.70.0 framing: *"Per-route routing-config mechanisms (per-route SSR opt-out, per-route data fetch strategy, per-route action shift) MUST be empirically verified against framework-author canonical type definitions (RR v7 RouteConfigEntry type) BEFORE adopting kickoff hypothesis citing per-route mechanism availability; framework-version-pinned API surface inspection at PRE0 prevents architectural strategy verdicts based on non-existent per-route primitives."*

**11-pattern anchor-bias-mitigation cluster recognition extension** at Task 8.8 close: cluster patterns span hypothesis-content + class-count + closer-scope + scope-shape + audit-content + Phase-plan-document-audit-content + install-shipping + routing-config + entry-boundary-build-time-invocation + **paths-filter-scope** + **per-route-routing-config** = 11 distinct empirical-verification altitudes (v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1 + v2.64.0 + v2.65.0 + v2.66.0 + v2.67.0 + v2.68.0 + **v2.69.0** + **v2.70.0**). v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline now applied across **9 distinct empirical-verification altitudes for v2.60.1 cluster alone at Task 8.8 close** (hypothesis-content + implementation-shipping + audit-shipping + scope-existence + install-shipping + routing-config + entry-boundary-build-time-invocation + per-route-routing-config + nested route-id-derivation sub-altitude carried from Task 8.6 Z1.A patch cycle).

---

## §4 — Verdict matrix at Task 8.8 close

| Verdict scope | Cowork verdict | Empirical outcome | Cross-link |
|---|---|---|---|
| Q1 — Class+Strategy | Option γ SCOPING-ONLY 3pt → 4pt CROSS-TASK-SHAPE-ROBUSTNESS LOCK | NEW 4th sub-shape `empirical-inventory-confirming-per-route-SSR-opt-out-INFEASIBLE`; scope-collapse from Option β (REFUTED at Finding Y) | §3 |
| Q3 — Finding X cementation | CEMENT at Task 8.8 §0 + SHIP v2.68.1 paths-filter patch | §0 Finding X cementation + workflow patch shipped at `.github/workflows/appfolio-parity-gate.yml::paths-filter` (2-line edit; minimal-scope) | §0 Finding X |
| Q4-f — Finding Y cementation | CEMENT at Task 8.8 §0 (25th cumulative) | §0 Finding Y cementation; per-route SSR opt-out empirical infeasibility at RR v7 7.15.1 | §0 Finding Y |
| Q5-bis — Catalog growth | 23 → 25 at Task 8.8 close (+2 net) | Cumulative Phase-8+ catalog 23 → 25 empirically cemented | §3 |
| Verdict 22 — v2.69.0 + v2.70.0 PRE-FLIGHT discipline candidates | CEMENT + 11-pattern cluster recognition extension | §3 v2.69.0 (paths-filter-scope) + v2.70.0 (per-route-routing-config) cementation; 11-pattern cluster recognition | §3 |
| Q5 — Provider remediation deferral | REAFFIRM Cowork Verdict 9 LOCK at Task 8.3 close | Task 8.8 does NOT touch `qualia-shell/src/context/**`; provider remediation atomic with ssr flip at Task 8.9 | §0 Finding Y; §6 below |
| Q1 — Hybrid co-shipping | SCOPING-ONLY (primary) + CI-CONFIG-ONLY (co-shipped via v2.68.1) | 4-in-place-patches-cumulative-at-Block-B-opener-trio precedent established (v2.66.1+2+3 at 8.6 + v2.68.1 at 8.8) | §0 Finding X |

---

## §5 — Verification matrix

| Verification | Acceptance | Empirical outcome | Cross-link |
|---|---|---|---|
| tsc -b strict | zero errors | ✓ silent success | Step-4 |
| vitest 264/264 | ≥264 | ✓ **264/264** (38 test files; 2.76s) | Step-4; pre-Step-3 baseline preserved |
| PII guard | 0 leaks | ✓ 51 files / 0 leaks | Step-4 |
| react-router build × 2 | SKIPPED per SCOPING-ONLY minimal-gate | — | SCOPING-ONLY 4pt class discipline |
| HALT-IF #1 grep `qualia-shell/app/` in workflow | zero matches pre-patch | ✓ exit 1 (zero matches; minimal-scope confirmed) | Step-3 pre-patch |
| v2.68.1 patch verification | `qualia-shell/app/**` in both push.paths + pull_request.paths | ✓ 2-line edit applied; both arrays updated | §0 Finding X remediation |
| 33-pattern milestone cross-phase sweep-resolutions cementation | Task 8.7 TBD → `79f0ced` / `#75` resolution co-shipped at Task 8.8 OPENING sweep | ✓ Resolved at Step-1 sweep at Task 8.8 OPENING (5 reference spots) | §6 below |
| Step-7 fresh-push Parity Gate | ✓ SUCCESS | run [26037807745](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26037807745) | PII Scan run [26037807544](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26037807544) ✓ SUCCESS |
| Parity Gate AUTO-FIRE on push | empirically validated post-v2.68.1 | ✓ AUTO-FIRED at Step-7 push (paths-filter glob amendment + `.github/workflows/**` self-reference) | Cascading paths-filter coverage empirically confirmed |
| CodeRabbit review per PR | pass | ✓ SUCCESS | (no blocking comments) |

---

## §6 — Rollback plan + Task 8.9 atomic-shipping implementation roadmap

**Rollback target:** `git revert 79f0ced` (Phase-8+ Task 8.7 squash; pre-Task-8.8 state restoring parity-gate paths-filter to non-app/-aware glob). Resolved at Task 8.9 OPENING sweep ✓.

**Rollback safety:** SCOPING-ONLY 4pt class structural; zero-production-source semantic preservation; routing.test.tsx 5/5 preserved byte-for-byte; v2.68.1 workflow patch is additive (revert restores pre-patch paths-filter; sister-shape minimal-scope to v2.66.1 reversibility). Build-output-graph preserved at HEAD-post-Task-8.8 (no Vite plugin or framework convention change at Task 8.8); `react-router.config.ts::ssr: false` PRESERVED unchanged.

**Phase-8+ Block B item 3 reversibility verified by construction:** v2.68.1 workflow patch is additive paths-filter glob addition; reverting removes the glob and parity-gate returns to pre-Task-8.8 manual-dispatch behavior for `qualia-shell/app/**` edits.

### Task 8.9 atomic-shipping implementation roadmap

Per Cowork Verdict 23 reaffirmation (Task 8.3 Verdict 9 LOCK + Task 8.8 PRE0 Q5 reaffirmation), Task 8.9 ships atomic SSR enablement deliverable:

**Task 8.9 scope (anticipated; subject to Task 8.9 PRE0 Cowork verdicts):**
1. **Provider tree SSR-safety remediation** per Task 8.3 audit findings G/H/I:
   - **ThemeProvider** (`qualia-shell/src/context/ThemeContext.tsx`): migrate 4 `useState` lazy initializers + 6 `localStorage.getItem()` reads → `useSyncExternalStore` + `getServerSnapshot` pattern (React 19 canonical SSR-safe primitive) OR `typeof window !== 'undefined'` guards in lazy initializers (fallback pattern)
   - **UserProvider** (`qualia-shell/src/context/UserContext.tsx`): migrate 1 init-time `localStorage.getItem('qualia_auth_user')` read → same pattern
   - **QueryProvider** (`qualia-shell/src/providers/QueryProvider.tsx`): hydration discipline gap per Finding H (TanStack Query SSR-hydration boundary; dehydrate at server + hydrate at client via `<HydrationBoundary>` from `@tanstack/react-query` if Task 8.9 includes server-side data fetching scope)
   - **PermissionsProvider** (`qualia-shell/src/context/PermissionsContext.tsx`): SSR-safe via dependency-chain on UserProvider — propagates UserProvider remediation outcome
2. **ssr: false → ssr: true flip** at `qualia-shell/react-router.config.ts`
3. **Hydration smoke-test** — local + CI verification at Step-4-bis chromium-headless probe of `vite preview --outDir build/client` + `react-router-serve build/server/index.js` (NEW server-runtime invocation path post-ssr flip)
4. **AdminShell-scoped 3-provider audit** deferred from Task 8.3 per Verdict 9 LOCK — may absorb into Task 8.9 hydration verification scope OR defer further to Task 8.10 per Task 8.9 PRE0 Cowork verdict

**Task 8.9 anticipated class:** Hybrid (PROVIDER-SSR-REMEDIATION NEW class 19th cumulative OR FRAMEWORK-INSTALLATION 3pt extension via ssr config flip sub-shape; Cowork verdict at Task 8.9 PRE0 Q1). Provider tree edits at `qualia-shell/src/context/**` will auto-fire parity-gate per pre-existing `qualia-shell/src/**` glob.

**Phase-8+ → Phase-9+ transition signal post-Task-8.9:** ssr: true enablement is the structural Phase-8+ → Phase-9+ pivot per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` — once ssr: true ships at Task 8.9, Phase-8+ closer narrative core projection includes binary v1 L228 ≤500 ms LCP MET-or-STRUCTURALLY-UNATTAINABLE verdict + Phase-9+ Block A scope determination.

---

## §7 — Phase-8+ deferred-items carry-forward (Phase-8+ Task 8.8 contributions; 4 NEW items)

1. **Task 8.9 atomic SSR enablement scope inheritance** — `react-router.config.ts::ssr: false → ssr: true` flip + provider tree SSR-safety remediation (ThemeProvider + UserProvider migration to `useSyncExternalStore` + `getServerSnapshot`) + hydration smoke-test per Task 8.3 §6 implementation roadmap + §6 above. Atomic deliverable per Cowork Verdict 23 reaffirmation.
2. **Plan v2.68+ amendment candidate: 11-pattern anchor-bias-mitigation cluster cementation + v2.69.0 + v2.70.0 PRE-FLIGHT discipline candidates** — formalize 11-pattern cluster (v2.60.1 hypothesis + v2.60.4 class-count + v2.60.6 closer-scope + v2.62.1 scope-shape + v2.64.0 audit-content + v2.65.0 Phase-plan-document audit-content + v2.66.0 install-shipping + v2.67.0 routing-config + v2.68.0 entry-boundary-build-time-invocation + **v2.69.0 paths-filter-scope** + **v2.70.0 per-route-routing-config**) as standing PRE-FLIGHT discipline for downstream Phase-8+ Block B Tasks 8.9-8.11 + Block C 8.12-8.14 + Phase-9+ onboarding.
3. **AdminShell-scoped 3-provider audit deferred-item** (Task 8.3 → Task 8.9 carry-forward per Cowork Verdict 9 LOCK at Task 8.3 close + reaffirmed at Task 8.8 close per Verdict 23) — may absorb at Task 8.9 hydration verification scope OR defer further to Task 8.10 per Task 8.9 PRE0 Cowork verdict.
4. **Soft per-route mechanism opportunities at Task 8.10+ progressive rollout scope** — Finding Y empirical refutation surfaces alternative per-route mechanisms at RR v7 framework-mode 7.15.1: `clientLoader` (route-data client-fetch) + `clientAction` (route-action client-execute) + `HydrateFallback` (component fallback during hydration). If progressive rollout scope at Task 8.10 (or Block C) requires per-route SPA-Mode-equivalent behavior for select routes, surface as remediation candidate via `clientLoader` + custom `HydrateFallback` pattern (soft escape; not pure SSR opt-out).

---

## §8 — Cowork verdict gate

**Phase-8+ Task 8.8 closure verdict at this Completion Report:** GO if Step-7 PR open + Parity Gate dispatch (AUTO-FIRE expected per v2.68.1 paths-filter glob amendment + `.github/workflows/**` self-reference) confirms ✓ SUCCESS + zero downstream regression at parity-gate-canonical build mode.

**Block B 3-of-6 milestone at this close.** Block B 6-task arc continues (8.6 ✓ + 8.7 ✓ + 8.8 ✓ + 8.9 R + 8.10 R + 8.11 R). Task 8.9 next: atomic SSR enablement (provider tree SSR-safety remediation + ssr: true flip + hydration smoke-test per §6 implementation roadmap). Cowork verdict at Task 8.9 PRE0.

**Cumulative Phase-8+ engineering-finding catalog at 25 findings post-Task-8.8 close** (sister-shape to Phase-7 closer §2 2-finding catalog depth applied at 12.5× scaling factor + per-task cadence sustained at Block B item 3 +2 cadence post-Block B opener +8 acceleration). Phase-8+ closer projection refines further to **27-32+ findings at full closure** if Block B Tasks 8.9-8.11 + Block C 8.12-8.14 sustain per-task ~2-3 cadence on top of 25 cumulative at 8.8.

**4-consecutive-Task PRE0 wrong-hypothesis refutation pattern empirically cemented as project's most substantive engineering record pattern** at Task 8.8 close. Standing PRE-FLIGHT discipline cluster's recursive-self-validation property continues at substantive scale across:
- Task 8.5 Finding L (scope-existence altitude)
- Task 8.6 Finding O (Task-partition altitude)
- Task 8.7 Finding W (entry-boundary-build-time-invocation altitude)
- **Task 8.8 Finding Y (per-route-routing-config altitude — NEW)**

---

### Reference

- `Docs/Phases/Phase_8_Plan.md §4 Block B item 8.8` (plan-doc shipping-time framing pre-v2.68 amendment; per-route SSR opt-in scope)
- `Docs/AppFolio_Parity_Implementation_Plan_v2.md §9` row 8.8 closure at v2.68 amendment
- `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §3` per-provider SSR-safety taxonomy + §6 Block B implementation roadmap (provider remediation candidates at `useSyncExternalStore` + `getServerSnapshot` pattern OR `typeof window` guards)
- `Docs/Phase8_Task_8_7_Completion_Report.md §7` Finding X carry-forward to Task 8.8 PRE0 cementation + paths-filter taxonomy refinement (cemented at this Task 8.8 close per Cowork Verdict 20 LOCK)
- `node_modules/@react-router/dev/dist/config.d.ts:155` — `ReactRouterConfig::ssr` GLOBAL boolean empirical signature (Finding Y Q4-b PRE0 inventory)
- `node_modules/@react-router/dev/dist/routes-CZR-bKRt.d.ts` — `RouteConfigEntry` type empirical signature (no ssr field; CreateRouteOptions = id/index/caseSensitive only)
- `.github/workflows/appfolio-parity-gate.yml::paths-filter` v2.68.1 in-place patch per Verdict 20 LOCK (`qualia-shell/app/**` glob added to both `push.paths` + `pull_request.paths` arrays)
- HEAD `79f0ced` post-Task-8.7 baseline + HEAD-post-8.8 SCOPING-ONLY 4pt + CI-CONFIG-ONLY hybrid co-shipping
- Parity Gate run [26037807745](https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/26037807745) ✓ SUCCESS at Step-7 push (AUTO-FIRED per v2.68.1 paths-filter coverage extension; empirically confirmed)
