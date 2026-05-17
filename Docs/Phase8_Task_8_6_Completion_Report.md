# Phase-8+ Task 8.6 — Completion Report

**Task.** Phase-8+ Task 8.6 — React Router v7 framework-mode adoption (Phase-8+ Block B OPENER; framework installation + dependency audit + framework-config setup per `Docs/Phases/Phase_8_Plan.md §4 Block B item 8.6` + Cowork Option β LOCK from Task 8.2 close at v2.62 amendment + reaffirmed at Task 8.5 close per empirical Block A foundation readiness verdict).

**Class.** `FRAMEWORK-INSTALLATION` (NEW class; **project-wide 18th cumulative**; 1pt within Phase-8+ at 8.6 close; pending 2nd cross-phase data point for full calibration at Phase-9+ framework-decision recurrence OR Phase-8+ internal 2nd FRAMEWORK-INSTALLATION instance if ssr:false→true flip at Task 8.8 qualifies as 2nd data point). Cowork Verdict 1 LOCK at PRE0 selected Option α NEW class designation over Option β CONFIG-FILE-EDIT carry-over per Finding Q empirical refutation of "CONFIG-FILE-EDIT carry-over" plan-doc shipping-time framing (the project-wide class taxonomy at HEAD-post-8.5 contains no CONFIG-FILE-EDIT class; closest precedent CI-CONFIG-ONLY 12th class is structurally distinct from production-source framework-installation altitude). Class definition: framework-installation deliverable that wires a framework's full primitive set (Vite plugin + server runtime + entry directory + framework config + scripts cutover) at production-source altitude, structurally distinct from CI-CONFIG-ONLY (CI orchestration sub-domain) + SCOPING-ONLY (forward-scoping no production source) + SSR-MIGRATION-PREP (framework-agnostic SSR prep) classes; calibration sub-shape candidate `react-router-v7-framework-mode-via-@react-router-dev-vite-plugin` (1pt at Task 8.6).

**Commit (HEAD on `main`):** `TBD` (squash commit for PR #TBD, Task 8.6 — RR v7 framework-mode adoption; resolved at Task 8.7 OPENING sweep per 31-consecutive-cross-phase-sweep-resolutions convention extending 30-pattern milestone ROUND-DECADE CONVENTION CEMENTATION at 8.5 → 31-pattern at 8.6).

**Green CI run.** AppFolio Parity Gate — TBD (Parity Gate auto-fires per paths-filter Q6 LOCK at PRE0 — production-source edit at `qualia-shell/src/App.tsx` named-export promotion + NEW edits at `qualia-shell/app/**` are within `qualia-shell/src/**` glob OR `qualia-shell/-root` parent altitude per Q5 LOCK; sister-shape to Task 8.4 paths-filter auto-fire precedent; sister-shape to Task 8.2 + Task 7.10 + Task 7.13 paths-filter auto-fire pattern). PII Scan run — TBD. CodeRabbit Review — TBD.

**Vitest delta.** 264 → 264 (+0). FRAMEWORK-INSTALLATION class structural-refactor-only shape preserves semantic at vitest+RTL+jsdom altitude. routing.test.tsx Task 8.2 5/5 PASS preserved byte-for-byte (MemoryRouter import from `react-router` core unchanged post-framework-installation; `@react-router/dev` + `@react-router/node` are PEER packages that ADD framework infrastructure without shadowing core package exports).

---

## §0 — Substantive Phase-8+ Task 8.6 engineering findings (publishable-level)

### (N) Finding N — File-count empirical refutation of Plan §4 L130 shipping-time "1-3 config files" framing

**Cemented per Cowork Verdict 4 LOCK at PRE0.** `Docs/Phases/Phase_8_Plan.md §4 L130` shipping-time framing posited "1-3 config files (`package.json` dependency additions + framework config file like `vike.config.ts` OR `react-router.config.ts`) + possibly minor `vite.config.ts` additive amendment". Empirical Step-3 implementation at Task 8.6 surfaced **9-file impact** at HEAD-post-8.6:

1. `qualia-shell/package.json` — scripts update (build → `react-router build`; dev → `react-router dev`; preview → `vite preview --outDir build/client`) + deps add `@react-router/node@7.15.1` + auto-installed `isbot@^5` peer + devDeps add `@react-router/dev@7.15.1`
2. NEW `qualia-shell/react-router.config.ts` — `ssr: false` initial state per Q3.d LOCK
3. NEW `qualia-shell/app/root.tsx` — canonical root layout per Cowork Verdict 2 LOCK (ports `qualia-shell/index.html` FOUC IIFE + 5 SSR-ready meta tags + Google Fonts preconnect/preload + Meta/Links/Outlet/Scripts/ScrollRestoration)
4. NEW `qualia-shell/app/routes.ts` — declarative 3-branch route config
5. NEW `qualia-shell/app/routes/security.tsx` — thin re-export bridge to `src/App.tsx::SecurityRoute`
6. NEW `qualia-shell/app/routes/default.tsx` — thin re-export bridge to `src/App.tsx::DefaultRoute`
7. SPLIT `qualia-shell/vite.config.ts` (Vite + reactRouter() plugin; removed test block + server proxy from prior dual-purpose config) + NEW `qualia-shell/vitest.config.ts` (Vitest-only config; test block preserved byte-for-byte) per Cowork Verdict 3 LOCK Finding R remediation
8. UPDATE `qualia-shell/tsconfig.json` — added `app/` to include array
9. UPDATE `qualia-shell/src/App.tsx` — `function SecurityRoute()` → `export function SecurityRoute()`; `function DefaultRoute()` → `export function DefaultRoute()` (2-line promotion edit; default `App` export preserved for Task 8.7 cutover)

**Empirical 9-file impact** (5 NEW + 4 MODIFIED at qualia-shell/) vs plan-doc shipping-time "1-3 config files" framing = **3× under-estimation**. Substantive engineering record durable for Phase-8+ Block B Tasks 8.7-8.11 planning: framework-installation tasks at React Router v7 framework-mode altitude empirically require ~7-10 file impact at first installation; downstream Block B tasks may inherit similar empirical-vs-hypothetical file-count gaps. Finding extends v2.65.0 Phase-plan-document audit-content empirical-vs-hypothetical-distinction PRE-FLIGHT discipline (sister-shape to v2.64.0 audit-doc altitude precedent + Task 8.5 Finding M Phase-plan-document altitude precedent; Task 8.6 Finding N extends to Phase-plan-document file-count audit altitude). Plan §4 L130 inline-footnote-correction shipped sister-shape to Task 8.5 D-3 LOCK byte-for-byte.

### (O) Finding O — Task 8.6 + 8.7 partition empirical infeasibility; minimal app/root.tsx canonical root layout required at Task 8.6 close

**Cemented per Cowork Verdict 2 LOCK at PRE0.** Pre-PRE0 plan-doc framing (`Docs/Phases/Phase_8_Plan.md §4 Block B items 8.6 + 8.7` taken as strict partition) hypothesized Task 8.6 = framework installation config-only (no `app/root.tsx`; no entry boundaries) + Task 8.7 = entry boundaries (entry.server.tsx + entry.client.tsx + app/root.tsx). Empirical research at Step-2 PRE0 surfaced that RR v7 framework-mode build orchestration requires `app/root.tsx` to exist for `react-router build` to succeed — the framework-mode runtime references the canonical root layout component at build time for route-module compilation + manifest emission. **Strict partition empirically infeasible.** Cowork Verdict 2 LOCK refined partition: Task 8.6 includes **minimal** `app/root.tsx` as canonical root layout (ports `qualia-shell/index.html` FOUC IIFE + 5 meta tags from Task 8.4 to RR v7 framework-mode root altitude byte-for-byte; sister-shape to Task 8.4's framework-agnostic FOUC pattern applied at RR v7 framework-mode altitude); Task 8.7 retains `entry.server.tsx` + `entry.client.tsx` scope (custom entry boundary override of RR v7's built-in defaults; sister to Task 8.4's index.html template + Task 8.6's app/root.tsx altitude-distinct evolution of static-shell content).

Substantive engineering record: 2-task partition (framework-installation altitude vs entry-boundary-override altitude) is structurally clean at Cowork's refined Task 8.6/8.7 verdict but the strict version (config-only at 8.6) was empirically infeasible. Finding O extends Task 8.5 Finding L scope-existence-empirical-refutation pattern to Task-partition altitude (vs scope-existence altitude at Task 8.5 origin); v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline at Task-partition altitude.

### (P) Finding P — Plan §4 L132 class-count "17th cumulative candidate" mismatch vs current 17-class taxonomy

**Cemented per Cowork Verdict 4 LOCK at PRE0.** `Docs/Phases/Phase_8_Plan.md §4 L132` shipping-time framing posited "17th cumulative candidate per v2.60.4 discipline". Empirical verification at Task 8.6 PRE0 surfaced **class-count off-by-one** at Phase-plan-document audit altitude: at HEAD-post-8.5, project-wide cumulative class count was already **17** (Phase-6 closing at 11 + Phase-7 closing at 15 [4 NEW: CI-CONFIG-ONLY 12th + BASELINE-ARTIFACT 13th + PERF-LEVER-LAZY-LOAD 14th + TEST-INFRA-FIX 15th] + Phase-8+ 16th SCOPING-ONLY at 8.1 + 17th SSR-MIGRATION-PREP at 8.2 = **17 at HEAD-post-8.5**). Empirically-correct class count for Task 8.6 NEW class = **18th cumulative**.

Root-cause: plan-doc shipping-time class-count framing at v2.61 OPENING was anchored on Phase-7 closer 14-class baseline (BEFORE Phase-7's 4 NEW classes were retroactively recognized at Phase-7 closer §3 per Option A LOCK + v2.60.4 discipline cementation; sister to Phase-7 closer "2 NEW classes" anchor-bias artifact retroactively-corrected to "4 NEW classes" at v2.60.4 amendment). Plan §4 L132 placeholder pre-dates Phase-7 closer retroactive correction propagation; sister-shape to Task 8.5 Finding M class-name placeholder pre-class-stabilization terminology mismatch + Task 8.5 v2.65.0 Phase-plan-document audit-content cross-altitude-applicability validation extending to Task 8.6 class-count audit altitude. Finding P extends v2.65.0 cluster from class-name altitude (Task 8.5 origin) to class-count altitude (Task 8.6 close); recursive-validation discipline pattern at scale.

### (Q) Finding Q — Plan §4 L132 class-designation "CONFIG-FILE-EDIT carry-over" empirically false; no CONFIG-FILE-EDIT class at HEAD-post-8.5

**Cemented per Cowork Verdict 4 LOCK at PRE0.** `Docs/Phases/Phase_8_Plan.md §4 L132` shipping-time framing posited "**CONFIG-FILE-EDIT carry-over** (Phase-8+ 2nd distinct data point; sister to 8.4) OR **NEW class FRAMEWORK-INSTALLATION**". Empirical verification at Task 8.6 PRE0 surfaced **class-designation false-precedent claim**: the project-wide class taxonomy at HEAD-post-8.5 contains **no CONFIG-FILE-EDIT class**. The closest cousins are:

- **CI-CONFIG-ONLY** (12th class; introduced at Phase-7 Task 7.3; structurally distinct from production-source framework-installation altitude — CI-CONFIG-ONLY operates at `.github/workflows/**` altitude vs Task 8.6 operates at `qualia-shell/-root + qualia-shell/app/**` production-source altitude)
- **SSR-MIGRATION-PREP** (17th class; introduced at Phase-8+ Task 8.2; framework-agnostic production-source edits at App.tsx + index.html altitudes preparing for SSR adoption regardless of framework — structurally distinct from FRAMEWORK-INSTALLATION which is framework-specific full primitive set adoption)
- **MEASUREMENT-ONLY** with sub-shape `with-source-rename` (5pt cross-phase; Scripts/run_axe_phase{5,6}.mjs + Scripts/run_lighthouse_phase{5,6,7}.mjs script-rename precedents at Phase-5/6/7; structurally distinct — measurement-tooling-rename vs production-source-framework-installation)

Per Cowork Verdict 1 LOCK Option α: NEW class **FRAMEWORK-INSTALLATION** introduced at Task 8.6 close (project-wide 18th cumulative). Class definition formalized in §3 of this report. Plan §4 L132 inline-footnote-correction shipped per Verdict 5 LOCK extending Task 8.5 D-3 LOCK + Task 8.4 D-1 LOCK precedent chain across 3 distinct empirical-verification altitudes within Phase-8+.

### (R) Finding R — `vite.config.ts` SPLIT pattern required for `@react-router/dev/vite::reactRouter()` plugin compat

**Cemented per Cowork Verdict 3 LOCK at PRE0.** Pre-PRE0 plan-doc framing (`Docs/Phases/Phase_8_Plan.md §4 L130` "possibly minor vite.config.ts additive amendment") hypothesized reactRouter() plugin could be added as additive plugin to existing `vite.config.ts`. Empirical research at Step-2 PRE0 surfaced **structural conflict**: existing `qualia-shell/vite.config.ts` at HEAD-post-8.5 imports from `'vitest/config'` (NOT `'vite'`) per dual-purpose Vite-build-config-+-Vitest-config pattern. `@react-router/dev/vite::reactRouter()` plugin requires standard `defineConfig` from `'vite'` package (Vite plugin API) — `vitest/config` is a Vitest-specific extension that breaks reactRouter() plugin's plugin-API expectations.

Preventive remediation pattern per Cowork Verdict 3 LOCK: **SPLIT** the dual-purpose `vite.config.ts` into:
- (a) `qualia-shell/vite.config.ts` — Vite-only config; imports from `'vite'`; wires `reactRouter()` plugin; preserves server proxy block for `/api` + `/health` at dev mode
- (b) `qualia-shell/vitest.config.ts` — Vitest-only config; imports from `'vitest/config'`; preserves test block byte-for-byte from prior `vite.config.ts` L13-L18 (globals, environment, setupFiles, include); auto-discovered by Vitest CLI (canonical Vitest convention sister-shape to `react-router.config.ts` discovery)

**Empirical Step-4 verification CONFIRMED:** post-split `npx vitest run` auto-discovers `vitest.config.ts` and 264/264 PASS preserved; post-split `npx react-router build` succeeds via vite.config.ts reactRouter() plugin invocation. Finding R represents preventive-remediation engineering pattern surfaced at PRE0 BEFORE Step-3 implementation — sister-shape to v2.60.1 falsified-hypothesis discipline applied at config-file-shape altitude (4th altitude after hypothesis-content + implementation-shipping + audit-shipping origins) preventively at PRE0 rather than reactively at Step-4 strict gate failure.

### (S) Finding S — `@react-router/node` must live in production `dependencies` (NOT `devDependencies`); v2.60.1 5th altitude install-shipping

**Cemented per Cowork Verdict Q1 LOCK at Step-3+Step-4 checkpoint.** Initial Step-3 implementation installed `@react-router/node` via `npm install --save-dev` (anchored on PRE0 hypothesis that "@react-router/node parallels @react-router/dev devDep position" per package-naming sister-shape pattern). Empirical Step-4 strict-gate failure at first `react-router build` attempt surfaced server-runtime-detection error verbatim:

```
Error: Could not determine server runtime. Please install @react-router/node,
or provide a custom entry.server.tsx/jsx file in your app directory.
```

PRE0 hypothesis empirically refuted at install-shipping altitude. Remediation: uninstall `--save-dev` placement + reinstall to production `dependencies` via `npm install @react-router/node` (NOT `--save-dev`). Post-remediation Step-4 `react-router build` succeeds. **Auto-installed `isbot@^5` peer dependency** also lands in production `dependencies` (added to package.json automatically by RR v7 framework-mode build orchestration).

Sister-shape to **v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline at install-shipping altitude (5th altitude per recursive-validation discipline cluster)**:

1. Hypothesis-content altitude — Phase-7 7.13 origin
2. Implementation-shipping altitude — Phase-7 7.13 close
3. Audit-shipping altitude — Phase-8+ Task 8.4 finding J close
4. Scope-existence altitude — Phase-8+ Task 8.5 finding L close
5. **Install-shipping altitude — Phase-8+ Task 8.6 finding S close (NEW)**

Substantive engineering record durable for downstream Phase-8+ Block B Tasks 8.7-8.11 framework-mode work + Phase-9+ onboarding: any future `@react-router/node` version bump must preserve production-`dependencies` placement. Finding cementation IS itself the engineering deliverable demonstrating v2.60.1 discipline cluster's empirical scaling property across 5 distinct empirical-verification altitudes within ~10 weeks elapsed time (Phase-7 7.13 origin date ~2026-05-13 → Phase-8+ Task 8.6 install-shipping cementation 2026-05-17).

### (T) Finding T — `npx vite build` is SILENT NO-OP when `@react-router/dev/vite::reactRouter()` plugin is wired

**Cemented per Cowork Verdict Q2 LOCK at Step-3+Step-4 checkpoint.** Empirical Step-4-bis verification surfaced that `npx vite build` (direct vite CLI invocation with reactRouter() plugin wired in vite.config.ts) is structurally distinct from `npx react-router build` (RR v7 framework-mode CLI invocation):

```bash
$ cd qualia-shell && rm -rf dist build && npx vite build
$ ls build/ dist/
ls: build/: No such file or directory
ls: dist/: No such file or directory
$ echo "exit=$?"
exit=0
```

Empirical signature: **exit code 0 + zero stdout + zero build artifacts produced**. The reactRouter() plugin detects direct vite-CLI invocation (NOT routed through react-router-CLI orchestration) and silently no-ops the build pipeline. The empirical reality is that build orchestration **MUST** use `npx react-router build` (the RR v7 framework-mode CLI); `npx vite build` is structurally a no-op despite reactRouter() being a standard Vite-plugin-API plugin.

**Empirical CI blast-radius substantial:** `.github/workflows/appfolio-parity-gate.yml::L103+L109` at HEAD-post-8.5 invoked `npx vite build` directly. Post-Task-8.6-merge, those 2 steps would silently exit 0 with zero build artifacts — **build-regression detection STRUCTURALLY BROKEN** until workflow patched. Highest-CI-blast-radius single-finding surface in Phase-8+ to date per Cowork Verdict 2 framing.

Remediation per Cowork Verdict Q3 LOCK: **in-place v2.66.1 workflow patch at `.github/workflows/appfolio-parity-gate.yml::L103+L109`** (`npx vite build` → `npx react-router build`). Sister-shape to v2.55.1 in-place CI patch precedent at Phase-7 Task 7.9 (workflow-step continue-on-error TRUE direction making baseline-artifact-upload non-blocking) + v2.51.1 in-place patch at Phase-7 Task 7.4 (timeout 60s → 90s round-3). Established convention: in-place v2.X.1 amendments within a single task to remediate empirical CI compat issues surfaced at implementation are structurally acceptable + recommended. HALT-IF #1 grep verification at v2.66.1 patch scope confirmed zero `dist/` matches in parity gate workflow → 2-line edit minimal-scope patch (no downstream path updates required).

---

## §1 — Empirical evidence

**Test sweep:** Step-4 strict gate ALL PASS at HEAD-post-Step-3.

| Gate | Pre-Step-3 (HEAD-post-8.5 d98bd48) | Post-Step-3 (HEAD-post-8.6) | Δ |
|---|---|---|---|
| `npx tsc -b` | ✓ Zero errors | ✓ Zero errors | preserved |
| `npx vitest run` | 264/264 | **264/264** | +0 (FRAMEWORK-INSTALLATION class structural-refactor-only; vitest.config.ts auto-discovered post-SPLIT) |
| `npx react-router build` bare | N/A (Vite SPA build) | ✓ SPA Mode (`build/client/index.html` emitted) | NEW shape |
| `VITE_APPFOLIO_SEEDS=false npx react-router build` | N/A | ✓ SPA Mode emitted | NEW shape |
| `node Scripts/verify_no_pii_leak.mjs` | ✓ 51 files / 0 leaks | ✓ 51 files / 0 leaks | preserved |

**Chunk-axis empirical capture:**

| Chunk | HEAD-post-8.5 (`dist/assets/`) | HEAD-post-8.6 (`build/client/assets/`) | Δ |
|---|---|---|---|
| Eager entry JS | `index-MO01qt09.js` / 253,683 B | `entry.client-UEY9SPBa.js` / **187,619 B** | **−66,064 B / −26.0%** at framework-mode altitude |
| Eager `<link>` CSS | `index-BebuHEVu.css` / 49,312 B | `default-BebuHEVu.css` / 49,312 B | byte-for-byte PRESERVED (filename hash unchanged; renamed by route-module association) |
| Vendor JS | `index-1yBoi7Al.js` / 87,711 B | `index-1yBoi7Al.js` / 87,711 B | byte-for-byte PRESERVED (filename hash unchanged from 6.x through 8.6 continuum) |
| StrataDashboard | `StrataDashboard-BrMjCxpY.js` / 1,032,104 B | `StrataDashboard-Cuka4DA6.js` / 1,032,178 B | +74 B chunk-graph reshuffle (+0.007%) |
| NEW route-module-default | — | `default-DzAZAavy.js` / 54,974 B | NEW (framework-mode emission) |
| NEW shared chunk | — | `index-DaNYx0sO.js` / 117,774 B | NEW (framework-mode runtime/shared chunk) |

**Phase-7 7.10 LCP-reduction lever PRESERVED + FURTHER COMPRESSED at framework-mode altitude:** eager entry chunk 253,683 B → 187,619 B = **−66,064 B / −26.0%** further reduction at framework-mode altitude (compounding Phase-7 7.10's −343,836 B / −57.5% reduction from pre-Phase-7 anchor); 7 NEW lazy chunks emit as separate files preserving lazy-load architecture. Substantive engineering deliverable for Phase-8+ Block C LCP n=10 re-measurement at Task 8.12.

**Build-output-graph empirical transformation (Step-4-bis Finding T cementation):** `dist/` → `build/client/`; SPA Mode (`ssr: false` per `react-router.config.ts` LOCK) emits `build/client/index.html` + `Removing the server build in build/server due to ssr:false` confirmation log. HALT-IF #1 grep verification: zero `dist/` matches in `.github/workflows/appfolio-parity-gate.yml` post-v2.66.1 patch — no downstream path references in CI workflow.

**Routing test sweep (Task 8.2 5/5 PASS preservation verification at Step-2.5 pre-Step-3 baseline):** `routing.test.tsx` 5/5 PASS isolated (481ms wallclock; jsdom environment 292ms); MemoryRouter import shape `import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router';` sourced from `react-router` core v7.15.1 (NOT `react-router-dom`; NOT `react-router/testing`). Framework-mode compat-by-construction: `@react-router/dev` + `@react-router/node` are PEER packages that ADD framework infrastructure without shadowing core package exports.

---

## §2 — Reasoning narrative

**Phase-8+ Block B OPENER kickoff context.** At Task 8.5 close, Block A 4-of-4 COMPLETE milestone + Block A → Block B transition gate GREEN-LIGHT per Cowork Verdict 4 LOCK unblocked Task 8.6 RR v7 framework-mode adoption (framework decision LOCKED at Task 8.2 close per Option β LOCK + reaffirmed at Task 8.5 close per empirical Block A foundation readiness). Task 8.6 OPENS the 6-task Block B chosen-framework-adoption arc per `Docs/Phases/Phase_8_Plan.md §4 Block B narrative`.

**Step-2 PRE0 empirical inventory surfaced 5 substantive engineering finding candidates (N+O+P+Q+R) at single-task PRE0** — sister-shape to Phase-7 closer §2 2-finding catalog depth applied prospectively at OPENING altitude rather than retrospectively at close altitude. Cowork verdict LOCKED all 5 findings at PRE0 + introduced NEW v2.60.1 5-altitude cluster framing (1-4 altitude precedents + Finding S install-shipping 5th altitude). Step-3 implementation surfaced 2 ADDITIONAL empirical findings (S install-shipping + T npx-vite-build-silent-no-op) at implementation altitude per v2.60.1 falsified-hypothesis empirical-verification discipline applied at install-shipping + build-CLI-invocation altitudes — recursive-validation discipline pattern continues at scale per per-task PRE0 + implementation altitudes.

**Cowork verdicts LOCKED across 6 PRE0 verdicts + 4 implementation-checkpoint verdicts** at Task 8.6 totaling **10 distinct Cowork verdicts at single-task altitude**:

- PRE0 verdicts: Q1 Class LOCK Option α NEW FRAMEWORK-INSTALLATION (project-wide 18th); Q2/Q5 Finding O LOCK (Task 8.6 includes minimal app/root.tsx); Q3 Finding R LOCK (SPLIT vite.config.ts); Q4 All 5 PRE0 Findings (N+O+P+Q+R) cementation; Q5 Plan §4 L130+L132 inline-footnote-corrections; Q6 paths-filter app/ at qualia-shell/app/ canonical
- Implementation-checkpoint verdicts: Q1 Finding S cementation (5th altitude of v2.60.1 cluster); Q2 Finding T cementation; Q3 GO in-place v2.66.1 workflow patch (sister-shape to v2.55.1 + v2.51.1 precedents); Q4 catalog growth 13 → 20

**Substantive engineering pivot at Task 8.6 close: framework-mode altitude unlocks +26.0% further LCP-reduction-lever compression** beyond Phase-7 7.10's substantive win. Combined with Block C's planned LCP n=10 re-measurement at Task 8.12, Task 8.6 generates substantive empirical signal for v1 L228 ≤500 ms LCP target reachability verdict at Phase-8+ closure (binary MET-vs-STRUCTURALLY-UNATTAINABLE refinement OR 3rd partial-MET outcome per Cowork Verdict 3 LOCK from Phase-8+ Task 8.1 OPENER).

**+7-finding cadence acceleration vs Phase-7 closer's 2-finding catalog (10× scaling factor):** Phase-8+ Block A averaged ~2-3 findings per task (4+2+3+2+2 = 13 findings across 5 Block A tasks); Block B OPENER at Task 8.6 surfaces +7 findings at single-task altitude (PRE0 5 + implementation 2). Closer projection refines upward to **24-26+ findings at full closure** if Phase-8+ Block B Tasks 8.7-8.11 + Block C 8.12-8.14 sustain per-task ~2-3 findings cadence on top of 20 cumulative at 8.6 close. Phase-8+ becomes substantively distinct engineering deliverable phase at scale (10× scaling factor vs Phase-7 closer's 2-finding catalog depth).

---

## §3 — Calibration class taxonomy update

**FRAMEWORK-INSTALLATION** (NEW class; **project-wide 18th cumulative**; introduced at Phase-8+ Task 8.6).

**Class definition:** Production-source-altitude framework-installation deliverable wiring a chosen framework's full primitive set: (i) package installation (framework Vite plugin + server runtime + peer dependencies); (ii) framework config file (e.g., `react-router.config.ts`; `vike.config.ts`; `next.config.js`); (iii) NEW framework-canonical directory structure (e.g., `app/` for RR v7 framework-mode + Remix; `pages/` for Next.js; `+/` filesystem routing for Vike); (iv) framework-canonical root layout / entry boundary scaffolding (e.g., `app/root.tsx` for RR v7); (v) framework-canonical declarative route config (e.g., `app/routes.ts` for RR v7 framework-mode); (vi) scripts cutover at `package.json` (e.g., `vite build` → `react-router build`); (vii) any structural production-source refactor required for framework adoption (e.g., named-export promotion at `src/App.tsx` for route-file bridging at Task 8.6).

**Sub-shape candidate at 8.6:** `react-router-v7-framework-mode-via-@react-router-dev-vite-plugin` (1pt at Task 8.6; calibration baseline).

**Structurally distinct from:**
- **CI-CONFIG-ONLY** (12th class; CI orchestration sub-domain at `.github/workflows/**` altitude; 6pt within Phase-7 + extends to v2.66.1 in-place CI patch at Task 8.6)
- **SCOPING-ONLY** (16th class; forward-scoping no production source; 3pt within Phase-8+)
- **SSR-MIGRATION-PREP** (17th class; framework-agnostic SSR prep at App.tsx + index.html altitudes; 2pt within Phase-8+ fully calibrated; SSR-prep WITHOUT framework adoption)
- **CONFIG-FILE-EDIT** (no such class exists at HEAD-post-8.5; closest cousin CI-CONFIG-ONLY is structurally distinct per altitude; per Finding Q)

**Project-wide class count progression at Task 8.6 close:** 17 → **18** (+1 NEW FRAMEWORK-INSTALLATION class).

**Per-task NEW-class tracker (v2.60.4 discipline):**
- Phase-6: 2 NEW classes (10th COMPONENT-FIX + 11th CLOSURE-NARRATIVE-CONSOLIDATION)
- Phase-7: 4 NEW classes (12th CI-CONFIG-ONLY + 13th BASELINE-ARTIFACT + 14th PERF-LEVER-LAZY-LOAD + 15th TEST-INFRA-FIX)
- Phase-8+ Block A: 2 NEW classes (16th SCOPING-ONLY + 17th SSR-MIGRATION-PREP)
- Phase-8+ Block B OPENER (Task 8.6): **1 NEW class (18th FRAMEWORK-INSTALLATION)**
- Phase-8+ cumulative NEW classes at HEAD-post-8.6: **3** (16th + 17th + 18th)

**Cumulative Phase-8+ engineering-finding catalog at Task 8.6 close: 20 findings** (was 13 at 8.5 close → +7 at 8.6 = 20). Per-task cadence at Phase-8+: 4 + 2 + 3 + 2 + 2 + 7 = 20 cumulative at 6 tasks; Block B opener +7 cadence acceleration vs Block A's ~2-3 cadence per task (sister-shape to Phase-7 closer's compounding cadence pattern from per-task ~1-2 to closer-altitude ~2-3+ as discipline cluster extends).

---

## §4 — Verdict matrix at Task 8.6 close

| Verdict scope | Cowork verdict | Empirical outcome | Cross-link |
|---|---|---|---|
| Q1 — Class designation | Option α NEW FRAMEWORK-INSTALLATION | Class introduced; sub-shape `react-router-v7-framework-mode-via-@react-router-dev-vite-plugin` 1pt | §3 |
| Q2 — Finding O (Task partition) | LOCK minimal app/root.tsx at 8.6 | Implementation included; canonical root layout shipped | §0 Finding O |
| Q3 — Finding R (vite.config.ts SPLIT) | LOCK preventive SPLIT | Step-3 SPLIT applied; vitest.config.ts auto-discovered post-split; 264/264 PASS preserved | §0 Finding R |
| Q4 — PRE0 findings cementation | All 5 (N+O+P+Q+R) CEMENTED | §0 cementation shipped | §0 |
| Q5 — Plan §4 L130+L132 inline-footnote | CONFIRMED sister-shape to L116 D-3 LOCK | Inline-footnote-correction shipped per Verdict 5 LOCK | `Phase_8_Plan.md §4 L130 + L132` |
| Q6 — paths-filter app/ canonical | qualia-shell/app/ at qualia-shell/-root | Empirically inside parity-gate filter via `qualia-shell/src/**` glob OR root-parent altitude | §5 below |
| Implementation Q1 — Finding S | CEMENT 5th altitude of v2.60.1 cluster | Production-deps placement remediated; install verified | §0 Finding S |
| Implementation Q2 — Finding T | CEMENT | Empirical signature exit=0 / zero artifacts cemented | §0 Finding T |
| Implementation Q3 — v2.66.1 workflow patch | GO in-place sister to v2.55.1 + v2.51.1 | Workflow L103+L109 patched; HALT-IF #1 grep confirmed zero downstream dist/ references | `.github/workflows/appfolio-parity-gate.yml::L103+L109` |
| Implementation Q4 — Catalog growth | 13 → 20 cumulative | 7-finding cadence acceleration empirically cemented | §3 |

---

## §5 — Verification matrix

| Verification | Acceptance | Empirical outcome | Cross-link |
|---|---|---|---|
| tsc -b strict | zero errors | ✓ silent success | Step-4 |
| vitest 264/264 | ≥264 | ✓ **264/264** (38 test files; 2.51s) | Step-4; pre-Step-3 264 baseline preserved |
| react-router build (bare) | SPA Mode emit | ✓ `build/client/index.html` + 100+ chunks | Step-4 |
| react-router build (SEEDS=false) | SPA Mode emit | ✓ identical shape | Step-4 |
| PII guard | 0 leaks | ✓ 51 files / 0 leaks | Step-4 |
| routing.test.tsx 5/5 isolated | ≥5/5 | ✓ 5/5 PASS (481ms) | Step-2.5 pre-Step-3 baseline |
| Chunk-axis preservation taxonomy | structurally distinct shape | ✓ dist/ → build/client/ build-output-directory transformation | §1 |
| Phase-7 7.10 LCP lever preservation | eager-chunk ≤ Phase-7 baseline | ✓ −26.0% further compression at framework-mode altitude | §1 |
| HALT-IF #1 grep dist/ in workflow | zero matches | ✓ exit=1 (zero matches); v2.66.1 patch 2-line minimal-scope | Step-5 pre-patch |
| Parity Gate run | ✓ SUCCESS | TBD at Step-7 | TBD |
| Manual paths-filter at parity gate dispatch | auto-fire expected via `qualia-shell/src/**` glob (App.tsx named-export promotion) OR root-parent altitude | TBD at Step-7 | Q6 LOCK |
| CodeRabbit review per PR | pass | TBD | TBD |
| 31-pattern milestone cross-phase sweep-resolutions cementation | Task 8.5 TBD → `d98bd48` / `#73` resolution co-shipped | Already resolved at Step-1 sweep at Task 8.6 OPENING (sister-shape to 30-pattern at Task 8.5 sweep ROUND-DECADE CONVENTION CEMENTATION) | §6 below |

---

## §6 — Rollback plan

Rollback target: `git revert d98bd48` (Phase-8+ Task 8.5 squash; pre-Task-8.6 state restoring SPA Vite-build pipeline). Resolved at Task 8.7 OPENING sweep ✓.

Rollback safety: FRAMEWORK-INSTALLATION class structural-refactor-only; semantic preservation at vitest+RTL+jsdom altitude (264/264 PASS preserved); routing.test.tsx 5/5 preserved byte-for-byte. Production-source edits at qualia-shell/src/App.tsx are minimal 2-line named-export promotions (no functional change at React component altitude); NEW edits at qualia-shell/app/** + qualia-shell/react-router.config.ts + qualia-shell/vitest.config.ts are additive scaffolding (rollback just removes those files); SPLIT vite.config.ts revert reverses Verdict 3 LOCK preventive remediation. In-place v2.66.1 workflow patch at .github/workflows/appfolio-parity-gate.yml::L103+L109 reverses cleanly via `git revert TBD`.

Build-output-graph rollback note: rollback restores `dist/` shape; no in-flight `build/client/` references in production code or CI orchestration outside the workflow file patched at v2.66.1. Reversible without DB or fixture state implications.

---

## §7 — Phase-7 deferred-items carry-forward (Phase-8+ Task 8.6 contributions; 7 NEW items)

1. **Task 8.7 entry boundary creation scope inheritance** — `entry.server.tsx` + `entry.client.tsx` deferred from Task 8.6 per Cowork Verdict 2 LOCK + Finding O Task-partition refinement; canonical app/root.tsx delivered at Task 8.6; Task 8.7 scope retains entry boundary override + framework-canonical entry-point creation.
2. **Scripts/run_lighthouse_phase{5,6,7}.mjs JSDoc dist/ comments** (per Cowork Q3 verdict at Step-3+Step-4 checkpoint) — JSDoc comments at Scripts/run_lighthouse_baseline.mjs:22 + Scripts/run_lighthouse_phase7.mjs:100 reference `emit dist/` at JSDoc altitude. Defer to **Phase-8+ Task 8.12 OPENING sweep** per absorb-into-next-sweep convention; sister-shape to per-phase Lighthouse script-rename pattern at Phase-6 6.6 + Phase-7 7.4. Task 8.6 scope NOT expanded to include historical Scripts/ JSDoc comments per Cowork verdict.
3. **Plan v2.66+ amendment candidate: 5th altitude of v2.60.1 cluster cementation** (Finding S install-shipping altitude) — formalize v2.66.0 PRE-FLIGHT discipline at install-shipping altitude as standing PRE-FLIGHT discipline for downstream Phase-8+ Block B Tasks 8.7-8.11 framework-mode tasks + Phase-9+ onboarding.
4. **7-pattern anchor-bias-mitigation cluster recognition extension** — v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1 + v2.64.0 + v2.65.0 + **v2.66.0 (install-shipping altitude)** = 7-pattern at HEAD-post-8.6. Sister-shape to 6-pattern recognition at Task 8.5 close; recursive-validation discipline pattern continues at scale.
5. **Build-output-graph chunk-axis-preservation taxonomy refinement** — NEW Conventions block entry: at framework-mode altitude, build-output directory transforms (e.g., `dist/` → `build/client/` at RR v7 framework-mode); chunk-axis preservation tracking shifts to `build/client/assets/**` glob; sister-shape extension to Task 8.4 parent-altitude taxonomy at build-output-shape-change variant.
6. **Phase-7 7.10 LCP-reduction lever framework-mode-amplification empirical record** — substantive Phase-8+ Block C carry-forward deliverable: lazy-load lever (Phase-7 7.10 origin) + React.lazy expansion preserved + further −26.0% eager-chunk compression at framework-mode altitude; combined with Block C's planned LCP n=10 re-measurement at Task 8.12 generates empirical signal for v1 L228 reachability verdict.
7. **react-router-serve preview script gap** — Task 8.6 set `package.json::scripts::preview` to `vite preview --outDir build/client` as SPA-mode workaround (per `ssr: false` LOCK at react-router.config.ts; react-router-serve only serves SSR builds). Once SSR enablement at Task 8.8 (ssr:false → true flip), preview script needs update to `react-router-serve build/server/index.js`. Defer to Task 8.8 OPENING sweep per absorb-into-next-sweep convention.

---

## §8 — Cowork verdict gate

**Phase-8+ Task 8.6 closure verdict at this Completion Report:** GO if Parity Gate run at Step-7 PR open + manual fallback dispatch (if needed per Q6 paths-filter prediction) confirms ✓ SUCCESS + zero downstream regression at parity-gate-canonical build mode (`react-router build` bare + SEEDS=false variants).

**Block B 1-of-6 milestone at this close.** Block B 6-task arc opens (8.6 ✓ + 8.7 R + 8.8 R + 8.9 R + 8.10 R + 8.11 R). Task 8.7 next: entry boundary creation (`entry.server.tsx` + `entry.client.tsx`; production-source-edit at app/ altitude; calibration class candidate per Plan §4 L144 — PRODUCTION-SOURCE-EDIT with sub-shape SSR-ENTRY-BOUNDARY 1st data point). Cowork verdict at Task 8.7 PRE0.

**Cumulative Phase-8+ engineering-finding catalog at 20 findings post-Task-8.6 close** (sister-shape to Phase-7 closer §2 2-finding catalog depth applied at 10× scaling factor + cadence acceleration empirically cemented at Block B opener +7-finding-per-task altitude). Phase-8+ closer projection refines upward to 24-26+ findings at full closure if Block B Tasks 8.7-8.11 + Block C 8.12-8.14 sustain per-task ~2-3 findings cadence on top of 20 cumulative at 8.6 close.

---

### Reference

- `Docs/Phases/Phase_8_Plan.md §4 Block B item 8.6` (plan-doc shipping-time framing pre-v2.66 amendment + Plan §4 L130 + L132 inline-footnote-corrections at this close per Verdict 5 LOCK)
- `Docs/AppFolio_Parity_Implementation_Plan_v2.md §9` row 8.6 closure at v2.66 amendment
- `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §5.2` (Cowork Q3 SSR-safety remediation roadmap referenced from Task 8.6 PRE0)
- `Docs/Phase8_Task_8_4_Completion_Report.md` (Finding J audit-content empirical-vs-hypothetical distinction at 3rd altitude precedent + FOUC IIFE pattern ported to Task 8.6 app/root.tsx altitude)
- `Docs/Phase8_Task_8_5_Completion_Report.md` (Finding L scope-existence-empirical-refutation + Finding M Phase-plan-document audit-content cross-altitude-applicability + 6-pattern anchor-bias-mitigation cluster precedent extending to 7-pattern at Task 8.6 v2.66.0)
- `qualia-shell/react-router.config.ts` + `qualia-shell/app/root.tsx` + `qualia-shell/app/routes.ts` + `qualia-shell/app/routes/{security,default}.tsx` NEW at Step-3
- `qualia-shell/vite.config.ts` + `qualia-shell/vitest.config.ts` SPLIT per Verdict 3 LOCK at PRE0
- `qualia-shell/package.json` deps + scripts post-RR-v7-framework-mode-install
- `.github/workflows/appfolio-parity-gate.yml::L99-L122` v2.66.1 in-place patch per Finding T + Verdict Q3 LOCK
- HEAD `d98bd48` post-Task-8.5 baseline + HEAD-post-8.6 framework-mode chunk-axis empirical capture
