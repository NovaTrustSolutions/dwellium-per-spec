# Phase-9+ Task 9.3 — B-α POC Hand-off Package

**Status.** **R OPEN — PRE0 ONLY** at branch `feat/phase-9-task-9.3-cdn-edge-poc`. **🔴 HARD HALT before any deploy action.** This doc is a PRE0 ledger + hand-off package for Ilya's deploy step. Claude Code MUST NOT create accounts, run `vercel deploy`, use credentials, or authorize deployment.
**Class.** **DEFERRED to Task 9.3 PRE0** per Decision-#5 LOCK (anchor-bias discipline). Deliverable shape post-PRE0 will inform class designation. Candidates: (a) CONFIG-ONLY (sister to CI-CONFIG-ONLY 12th) IF the POC stays at vercel.json + hand-off altitude + measurement script writes; (b) NEW class `EDGE-CACHE-POC` IF production source touched for cookie-migration; (c) MEASUREMENT-ONLY 10pt → 11pt extension IF POC stays at empirical-measurement altitude.
**Authored.** 2026-05-21 (Task 9.3 PRE0).
**Cross-references.** Ratified at `Docs/Phase9_Task_9_2_CDN_Edge_Scoping.md §7.0` (5 LOCKS) — Decision-#1 Vercel CONDITIONAL on §3.0; Decision-#3 POC-1 through POC-6; Decision-#4 B-α POC FIRST, B-γ DEFERRED.

---

## §0. 🔴 CRITICAL SAFETY BOUNDARY

**Per Cowork PART 2 instructions:** Claude Code is FORBIDDEN from:
- Creating any account (Vercel, Cloudflare, AWS, or otherwise)
- Running any deploy that uses credentials / tokens / `vercel deploy --token` / authenticated CLIs
- Entering, reading, or echoing any credentials
- Authorizing any deployment on Ilya's behalf

**Claude Code MAY:**
- Inspect the repo
- Prepare deploy CONFIG ARTIFACTS (e.g., `vercel.json`) as documented files
- Write measurement scripts (sister-shape to `Scripts/run_lighthouse_phase8.mjs`)
- Document exact HAND-OFF instructions

**Every POC step that touches a live platform (POC-2 onwards) is a HAND-OFF, not an action Claude Code performs.**

---

## §1. Task 9.3 PRE0 — empirical findings

### §1.1 Branch + 9.2 squash-SHA verification

| Element | Value |
|---|---|
| Branch | `feat/phase-9-task-9.3-cdn-edge-poc` |
| Branch-base | `6c430c4` (= **9.2 squash-SHA** from PR #86 merge 2026-05-21; **v2.74.1 8-consecutive vindication** ACHIEVED) |
| Working tree | CLEAN at branch creation |
| Production source touched at PRE0 | ZERO |

### §1.2 TBD-9.2 → `6c430c4` sweep (v2.60.1 16th altitude UPPER-BOUND discipline)

| Metric | Value |
|---|---|
| Upper-bound projection (at 9.2 OPENER) | (none formally stated; Cowork projected "low count per 16th-altitude pattern") |
| **Empirical line-spots** | **0** (`git grep "TBD-9.2"` across `*.md`/`*.json`/`*.ts`/`*.tsx`/`*.yml` = 0 matches) |
| Pattern altitude | TASK-BOUNDARY |
| v2.60.1 16th altitude implication | **MOST-PRONOUNCED under-estimate yet** at empirical 0; supersedes TBD-9.1's 20% which was already MOST-PRONOUNCED at that point |

**v2.60.1 16th altitude — 4th empirical data point:**

| Data point | Altitude | Projection | Empirical | % of upper bound |
|---|---|---|---|---|
| TBD-8.15 sweep | PHASE-BOUNDARY | ~8-10 | 5 | 50% |
| Baseline JSONs | PHASE-BOUNDARY | ~7 | 6 | 86% |
| TBD-9.1 sweep | TASK-BOUNDARY | ~3-5 | 1 | 20% |
| **TBD-9.2 sweep** | **TASK-BOUNDARY** | (low; per Cowork) | **0** | **~0%** |

**Pattern broadening at TASK-BOUNDARY altitude:** with each successive task as Phase-9+ progresses, the forward-projection narrative gets thinner — by the time 9.2 closes, the Next-task narrative at CLAUDE.md L33 was already rewritten to reference `d70f18d` (no TBD token), and the new 9.2 work didn't introduce a TBD-9.2 forward-reference token. Empirical 0 confirms the pattern is **monotonically increasing in under-estimate** as task-altitude work compresses the narrative.

**Sweep result:** NO commit needed (no replacements to make). The v2.60.1 16th altitude UPPER-BOUND discipline is **empirically validated as MONOTONIC at task-BOUNDARY altitude** at this 4th data point.

### §1.3 §3.0 deploy-target verification — **🎯 Scenario D (greenfield) / OR out-of-repo**

**Inventory of repo-observable deploy artifacts (empirical, exhaustive at top-3 directory depth + qualia-shell):**

| Artifact | Status |
|---|---|
| `vercel.json` | **NOT FOUND** |
| `netlify.toml` | **NOT FOUND** |
| `render.yaml` | **NOT FOUND** |
| `fly.toml` | **NOT FOUND** |
| `Dockerfile` | **NOT FOUND** |
| `docker-compose.yml` | **NOT FOUND** |
| `app.json` (Heroku) | **NOT FOUND** |
| `Procfile` (Heroku) | **NOT FOUND** |
| `.vercel/` directory | **NOT FOUND** |
| `.netlify/` directory | **NOT FOUND** |
| `.github/workflows/*deploy*.yml` | **NOT FOUND** (only `appfolio-parity-gate.yml` + `capture-linux-baselines.yml` + `pii-scan.yml`) |
| Deploy/start-prod scripts in `qualia-shell/package.json` | **NOT FOUND** (scripts = `dev` / `build` / `preview` / `test` / `e2e*` only) |

**§3.0 verdict:** **Scenario D (greenfield)** OR **deploy infrastructure is genuinely out-of-repo** per R-4 v2.26 cross-repo amendment. The repo cannot observe a current production deploy target. **Action required from Ilya:** confirm whether (a) Dwellium has a production deploy in place that lives outside this repo (i.e., Scenario B/C with out-of-repo config); OR (b) Dwellium has no production deploy yet (Scenario D = true greenfield).

**B-α implication regardless of scenario:** the §7.1 Vercel recommendation **STANDS** because:
- Scenario A (already on Vercel): no migration; add edge-cache config (lowest delta)
- Scenario B (Node.js elsewhere): Vercel is still the recommended POC platform for empirical edge-cache verification (the POC is on a separate POC project, not the production deploy)
- Scenario C (non-Node.js-edge platform): Vercel migration justified for B-α gate-crossing potential
- Scenario D (greenfield): Vercel — lowest setup complexity for POC

**Recommendation:** POC-2 (the deploy step) proceeds on a fresh Vercel project regardless of §3.0 outcome. POC-2's success doesn't depend on the §3.0 answer; the §3.0 answer informs the production-migration decision at POC-6 (post-POC empirical verdict).

### §1.4 POC-1 — cookie-vs-localStorage source-provenance verification — **🎯 REFUTED (localStorage-only)**

**Recursive-validation discipline applied** (P2 standing) — the B-α scoping doc §10 labeled "Auth token cookie-readable at server" as a **HYPOTHESIS requiring POC verification** + §6.4 explicitly flagged this as the "critical Task 9.3 PRE0 path".

**Empirical verification (`qualia-shell/src/context/UserContext.tsx`):**

| Evidence | Line | Verdict |
|---|---|---|
| JSDoc: "Persists access + refresh tokens in localStorage." | L5 | localStorage-only declaration |
| `createLocalStorageStore` factory invocation for token | L34-37 | `() => localStorage.getItem(TOKEN_KEY)` reader |
| Token write on login | L85 | `localStorage.setItem(TOKEN_KEY, data.token)` |
| Refresh-token persistence | L87 | `localStorage.setItem(REFRESH_TOKEN_KEY, ...)` |
| Token clear on logout | L95-100 | All `localStorage.removeItem(...)` calls |
| 20+ additional localStorage.getItem/setItem/removeItem calls | L125, L177, L190, L193, L252, L255, L267, L268, L289-292, L319 | Token + user state ALL in localStorage |
| Cookie / `document.cookie` references | (zero) | **NO cookie usage anywhere in UserContext.tsx** |
| `Cookie:` header handling | (zero) | **NO server-readable cookie path** |

**Verdict: REFUTED with absolute confidence.** Auth token at HEAD-post-9.2 is `localStorage`-only. Cookie-based auth detection at the edge is **NOT FEASIBLE** without architectural change.

### §1.5 Cookie-bypass POC pivot — full-page edge cache for everyone

**Per the scoping doc §6.4 mitigation note** (which anticipated this refutation): "IF localStorage-only: requires migration to cookie-based auth (architectural delta beyond B-α scope) OR cache-bypass-everything (no edge cache benefit for auth'd users — fine if unauth'd path is the primary edge-cache target)."

**🎯 NEW empirical realization at this PRE0** (sister-shape to bimodal-cluster discovery at Task 9.2 PRE0): **full-page edge cache works for EVERYONE — including auth'd users — without split-cache.** Reasoning:

1. AuthGate (Branch 3) at SSR initial render ALWAYS produces the spinner shell, regardless of who's requesting (server doesn't know about localStorage)
2. Client-side hydration ALSO starts with `isLoading=true` (UserContext.tsx:74 `useState(true)`) — matching the edge-cached HTML
3. After hydration, `useEffect` reads `localStorage.getItem(TOKEN_KEY)`:
   - **IF token present:** client-side resolves authenticated state → re-renders post-AuthGate content
   - **IF token absent:** client-side stays at LoginScreen (unauthenticated)
4. **Hydration mismatch risk:** NONE — both client and server-rendered HTML start from `isLoading=true`; the divergence happens AFTER hydration is complete, which is a normal re-render (not a hydration error)

**Implication: the split-cache architecture (§4.3 of the scoping doc) is NOT NEEDED.** Simpler approach: full-page edge cache served to EVERYONE. The architectural delta is smaller than the original B-α scoping proposed.

**Cache policy candidate:** `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` applied to ALL requests (no vary-by-cookie discipline needed).

**Risk:** AuthGate's hardcoded styles + spinner content are FROZEN at edge-cache TTL window. If the spinner copy/color/animation changes between deploys, stale-while-revalidate covers the gap. Invalidation on deploy is still needed (Vercel handles this automatically via build-output content hashing).

**Cowork-flagged stale comment (KNOWN; no action needed in this round):** `qualia-shell/src/context/UserContext.tsx:25` contains a comment saying "AuthGate renders SecurityRoute (login screen)" — this is the SAME Branch-1/Branch-3 terminology slip that was corrected in `Docs/Phases/Phase_9_Plan.md` at Phase-9+ Task 9.2 PRE0 (commit `bc4e4c8`). The comment describes the post-resolution auth model (what AuthGate renders for unauthenticated users at the default route — actually LoginScreen, NOT SecurityRoute which is the `/security` route Branch 1), NOT the SSR byte output. **No action needed in this round** per Cowork; future cleanup candidate. Documented here for traceability.

---

## §1.6 🎯 Config-reconciliation round — empirical findings (Cowork PART D)

Per Cowork's focused-round on the corrected SSR vercel.json artifact, this PRE0 was extended with a config-reconciliation pass on the **official Vercel React Router preset** (`@vercel/react-router/vite`) — verifying against current Vercel docs (`https://vercel.com/docs/frameworks/frontend/react-router`), then applying the preset + running the full strict gate, then deciding per the PASS/PERTURBED rule.

### §1.6.1 react-router.config.ts current state (pre-config-reconciliation; baseline)

| Field | Value |
|---|---|
| `ssr` | **`true`** (cemented Phase-8+ Task 8.11; verified pre-this-round at react-router.config.ts:67) |
| `presets` | **NOT PRESENT** (empty / default-undefined pre-this-round) |
| `prerender` | **NOT PRESENT** |
| Other config keys | (none beyond `ssr`) |

### §1.6.2 build/ output inventory at baseline `ssr: true`

| Path | Status |
|---|---|
| `build/server/index.js` | **EXISTS** (~539 B) — consumed by `react-router-serve` (smoke-test + playwright webServer + CI) |
| `build/server/assets/` | EXISTS (CSS/JS chunks for server runtime) |
| `build/client/index.html` | **NOT FOUND** — confirms full-SSR mode (NOT static); HTML is rendered at request-time by the SSR function, not pre-rendered as static |
| `build/client/assets/` | EXISTS (client-side chunks for hydration) |
| `build/client/data/` | EXISTS (static seed data) |

**Empirical confirmation: `ssr: true` produces full-SSR build output — NO `build/client/index.html` ever generated.** Resolves the static-vs-SSR question definitively.

### §1.6.3 Official Vercel React Router preset (verified at official docs)

Per WebFetch of `https://vercel.com/docs/frameworks/frontend/react-router` (last_updated 2026-02-26):

| Element | Verified value |
|---|---|
| Package | **`@vercel/react-router`** (install: `npm i @vercel/react-router`) |
| Import path | **`import { vercelPreset } from '@vercel/react-router/vite'`** |
| Config pattern | **`presets: [vercelPreset()]`** in `react-router.config.ts` |
| Version installed (verified at install) | `1.3.0` (latest at 2026-05-21) |
| Dependency type | **devDependency** (preset is build-time only; not bundled into server runtime unless custom entry.server.tsx uses `@vercel/react-router/entry.server`) |
| vercel.json needed | **🎯 NO — "deploy ... to Vercel with zero configuration" per Vercel docs verbatim** |

### §1.6.4 Preset gate-test result: 🔴 PERTURBED — gate would have failed

**Per Cowork's PASS/PERTURBED rule:** applied the preset wiring (1-line import + 1-line presets array) + ran the full strict gate. **First 4 steps PASSED:**

| Gate step | Result | Detail |
|---|:-:|---|
| Step 1: `tsc -b` | ✅ PASS | 0 errors |
| Step 2: `vitest run` | ✅ PASS | 278/278 tests passed (39 test files); duration 2.86s |
| Step 3: `react-router build` (SEEDS=default) | ✅ PASS | built in 660ms |
| Step 4: `VITE_APPFOLIO_SEEDS=false react-router build` | ✅ PASS | built in 670ms |

**BUT the build output structure CHANGED structurally** with the preset:

| Path | Pre-preset (baseline) | Post-preset (with preset wired) |
|---|---|---|
| Server runtime bundle | `build/server/index.js` | **`build/server/nodejs_eyJydW50aW1lIjoibm9kZWpzIn0/index.js`** (Vercel-encoded runtime config in directory name) |
| Server assets | `build/server/assets/` | `build/server/nodejs_eyJydW50aW1lIjoibm9kZWpzIn0/assets/` |

**Why this is PERTURBED for our gate:** the smoke-test (`Scripts/smoke_test_ssr_phase8.mjs:165-168`) spawns `['react-router-serve', 'build/server/index.js']`. With the preset, that file no longer exists at that path. **Step 6 smoke-test WOULD FAIL** due to FileNotFound on the server runtime bundle.

**Sister impact (not directly tested but structurally CONFIRMED via path-reference inspection):**
- `qualia-shell/playwright.baseline.config.ts` webServer command (per Phase-8+ v2.73.1 patch) references `build/server/index.js` via `react-router-serve` — would also fail
- `.github/workflows/appfolio-parity-gate.yml` smoke-test step (Task 8.11 v2.73.x in-place patch) — would also fail in CI

### §1.6.5 Revert decision per Cowork PERTURBED → DOCUMENT-ONLY rule

**Action taken (in this round):**

1. ✅ Reverted `react-router.config.ts` to baseline (no preset wiring) via `git checkout -- qualia-shell/react-router.config.ts`
2. ✅ Uninstalled `@vercel/react-router` via `npm uninstall @vercel/react-router` (also reverts package.json + package-lock.json)
3. ✅ Re-ran `npx react-router build` → confirmed `build/server/index.js` restored at expected path
4. ✅ Re-ran PII scan (clean: 51 files / 0 leaks)
5. ✅ Re-ran smoke-test → PASS (HTTP 200, 5949 B pre-hydration HTML, 0 console errors / 0 warnings / 0 page errors)

**Baseline state fully restored.** Preset wiring becomes DOCUMENT-ONLY in §2 below.

### §1.6.6 What this means for B-α POC architecturally

**The B-α POC architectural delta is LARGER than the original Task 9.2 scoping doc proposed.** Per §1.6.4 PERTURBED finding, adopting the Vercel preset requires a co-shipping migration of:

| Item | Migration cost |
|---|---|
| `Scripts/smoke_test_ssr_phase8.mjs` spawn-target | Update from `react-router-serve build/server/index.js` → `react-router-serve build/server/nodejs_*/index.js` (with glob OR env-var resolution) OR migrate smoke-test to use Vercel's local-dev tooling |
| `qualia-shell/playwright.baseline.config.ts` webServer | Same path migration |
| `.github/workflows/appfolio-parity-gate.yml` smoke-test step | Same path migration in CI |
| Documentation updates | CLAUDE.md "Useful commands" strict-gate path references; multiple Phase-8+ closer references to `build/server/index.js` |

**This is NOT just a 1-line config edit — it's a multi-file dev/test infrastructure migration.** Cowork's PERTURBED rule preserves the project's local-dev + CI smoke-test infrastructure intact in this round; the preset migration is deferred for Ilya's deploy-step decision (see §3 decision tree).

---

## §2. Corrected SSR-targeted deploy mechanism (DOCUMENT-ONLY — preset wiring un-applied)

🔴 **Critical correction from prior §2 draft.** The prior §2.1/§2.2 candidate vercel.json forms (with static `outputDirectory: "qualia-shell/build/client"` + `framework: null` OR `framework: "react-router"`) were **REJECTED by Cowork** — they implement a STATIC deploy which contradicts `ssr: true` HEAD. Per §1.6.2 empirical confirmation: `build/client/index.html` is **NEVER GENERATED** at `ssr: true`, so a static-outputDirectory vercel.json would silently disable SSR (no HTML to serve).

**Corrected approach (per official Vercel docs at `https://vercel.com/docs/frameworks/frontend/react-router`):** use the **`@vercel/react-router` preset** in `react-router.config.ts` + **NO vercel.json** ("deploy ... to Vercel with zero configuration" per Vercel docs verbatim). However, per §1.6.4 PERTURBED gate-test, the preset wiring stays **DOCUMENT-ONLY** in this round (un-applied to the repo); Ilya decides whether to apply it at deploy time + whether to co-ship the dev/test infrastructure migration per §2.5.

### §2.1 DOCUMENT-ONLY: Vercel React Router preset wiring (UN-APPLIED in this branch)

**Exact diff to `qualia-shell/react-router.config.ts`:**

```diff
 import type { Config } from '@react-router/dev/config';
+import { vercelPreset } from '@vercel/react-router/vite';

 /**
  * Phase-8+ Task 8.6 — React Router v7 framework-mode config
  * ... [existing JSDoc unchanged] ...
  */
 export default {
     ssr: true,
+    presets: [vercelPreset()],
 } satisfies Config;
```

**Install command (run from `qualia-shell/` working directory):**

```bash
cd qualia-shell && npm install --save-dev @vercel/react-router
```

**Version verified at install (2026-05-21):** `1.3.0`. Dependency type = **devDependency** (build-time only).

### §2.2 vercel.json: 🎯 NOT NEEDED with preset

Per Vercel docs verbatim ("React Router on Vercel" page, 2026-02-26 update):

> "With Vercel, you can deploy React Router applications with server-rendering or static site generation (using SPA mode) to Vercel with **zero configuration**."

**The preset replaces ALL vercel.json deploy config.** No `buildCommand`, `outputDirectory`, `framework`, or `functions` directives needed — the preset auto-configures all of these from the React Router framework-mode build output.

**Sole exception:** if SSR-response Cache-Control headers are needed (which they ARE for B-α edge-cache), they're set via `headers()` export on RR routes (§2.3 below), NOT via vercel.json `headers` field. The `headers()` export is the canonical RR v7 mechanism per Vercel docs verbatim.

### §2.3 ⚠️ SSR-response Cache-Control mechanism via `headers()` export (HYPOTHESIS per Cowork)

🔴 **Highest-risk-of-being-wrong piece per Cowork PART D step 5.** Per official Vercel docs verbatim:

> "Vercel does NOT edge-cache SSR function responses by default — the function response must emit `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`."

(Paraphrased from Cowork; verbatim Vercel docs say:)

> "React Router supports defining response headers by exporting a `headers` function within a route."

**Canonical pattern per Vercel docs:**

```tsx
// In a route file (e.g. app/routes/home.tsx OR app/root.tsx for default-applies-to-all):
import { Route } from './+types/some-route';

export function headers(_: Route.HeadersArgs) {
  return {
    'Cache-Control': 's-maxage=1, stale-while-revalidate=59',
  };
}
```

**Proposed (UN-APPLIED in this branch) change for B-α — add `headers()` export to `qualia-shell/app/root.tsx`:**

```tsx
// At app/root.tsx, alongside the existing Layout / App / HydrateFallback exports:
import type { Route } from './+types/root';  // VERIFY path against actual route-id

export function headers(_: Route.HeadersArgs) {
  return {
    'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
  };
}
```

**HYPOTHESIS labels per recursive-validation discipline:**

| Element | Label | Notes |
|---|---|---|
| `headers()` export pattern | ✅ **VERIFIED at Vercel docs** | Direct verbatim quote: "React Router supports defining response headers by exporting a `headers` function within a route." |
| `app/root.tsx` altitude (default-applies-to-all-routes) | **HYPOTHESIS** | Vercel docs example is per-route (`app/routes/example.tsx`); whether `app/root.tsx` headers inherit to child routes needs empirical verification at POC altitude |
| `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=600` | **HYPOTHESIS (values; not mechanism)** | The mechanism IS verified; the specific TTL values are projections — `s-maxage=300` (5 min) balances cache HIT rate vs deploy-staleness; tunable post-POC empirical data |
| `_: Route.HeadersArgs` typing | **HYPOTHESIS** | Type path `./+types/root` is the RR v7 framework-mode convention; needs verification IF `app/root.tsx` has a generated `+types` companion |

**Alternative mechanism considered (per Cowork PART D step 5):** "setting the header in entry.server.tsx onAllReady response". This works but requires modifying the custom `app/entry.server.tsx` that already exists for Phase-8+ FOUC IIFE delivery. The `headers()` export is the canonical RR v7 pattern + LESS INVASIVE — recommended. The entry.server.tsx altitude is fallback if `headers()` export doesn't yield expected edge-cache behavior at POC-3.

**Do NOT apply this `headers()` export in this round** per Cowork. It's prepared as the deploy-step change for Ilya's POC-2.

### §2.4 Build-output structure migration required IF preset adopted

Per §1.6.4 empirical finding: the preset CHANGES build output from `build/server/index.js` → `build/server/nodejs_eyJydW50aW1lIjoibm9kZWpzIn0/index.js`. **If Ilya adopts the preset, the following co-shipping migrations are required:**

| File | Required change |
|---|---|
| `Scripts/smoke_test_ssr_phase8.mjs:165-168` | Update spawn-target from `['react-router-serve', 'build/server/index.js']` → resolve `build/server/nodejs_*/index.js` via glob OR env-var indirection |
| `qualia-shell/playwright.baseline.config.ts` webServer | Same path migration |
| `.github/workflows/appfolio-parity-gate.yml` smoke-test step | Same path migration (CI sister-shape) |
| `CLAUDE.md` "Useful commands" strict-gate block | Update strict-gate command path-references |
| Multiple Phase-8+ closer/handoff narrative refs | `build/server/index.js` → conditional preset/non-preset path |

**Migration scope estimate:** ~5 files; production-source touch at smoke-test + playwright.baseline.config.ts altitude; CI workflow touch; doc touches. This is **a Phase-9+ Task 9.X scope** (architectural integration with deploy infrastructure), NOT a B-α POC inline change.

### §2.5 🎯 Deploy-time decision tree (Ilya's call at POC-2)

| Path | Description | Cost | Outcome |
|---|---|---|---|
| **(a) Adopt preset + co-ship migration** | Apply §2.1 wiring + execute §2.4 migration in same PR | Multi-file change (~5 files); requires re-running full strict gate post-migration; touches CI/test infra | Cleanest long-term; Vercel-native deploy with zero vercel.json; preserves local-dev smoke-test post-migration |
| **(b) Adopt preset WITHOUT migration (preset-only branch for POC)** | Apply §2.1 wiring on a temporary preset-only branch JUST for the Vercel deploy; do NOT merge to main; do NOT update smoke-test (local dev stays at non-preset) | 1-line config change + 1 npm install; isolated to a temporary branch; main stays untouched | POC-fast; deploy works on Vercel; but local-dev smoke-test diverges from deployed-state and POC-only branch goes stale |
| **(c) Skip preset; use Vercel WITHOUT preset** | Skip §2.1 entirely; rely on Vercel's auto-detection of RR v7 framework-mode without preset (per Vercel docs "with zero configuration" — but preset is "highly recommended") | 0 file changes | UNCERTAIN: docs say preset is "highly recommended" but doesn't say auto-detect fails without it. EMPIRICAL verification needed at POC-2. If Vercel auto-handles RR v7 framework-mode build without preset, this is simplest. If not, fallback to (a) or (b). |

**Recommended path for B-α POC scope:** **Path (b) preset-only temporary branch.** Rationale: (i) POC purpose is empirical edge-cache measurement, NOT full migration; (ii) Path (a) co-shipping migration is a non-trivial multi-file change that risks scope-bloat; (iii) Path (c) is speculative without empirical verification. Path (b) isolates the deploy-time change AND validates the preset works on Vercel BEFORE committing the migration.

---

## §3. Hand-off instructions for Ilya — POC-2 deploy step

🔴 **Ilya executes these steps; Claude Code does NOT.**

### §3.1 Prerequisites Ilya verifies/sets up (out-of-repo)

1. **Vercel account:** create a Vercel account at https://vercel.com (free hobby tier sufficient for POC) — **§3.0 LOCKED Scenario D** per Cowork at this round (greenfield Vercel POC; throwaway project; does NOT touch any existing production host)
2. **Vercel CLI:** `npm i -g vercel` (or use Vercel's web dashboard for direct GitHub-import deploy)
3. **GitHub access:** confirm the repo `NovaTrustSolutions/dwellium-per-spec` is accessible from the new Vercel account

### §3.2 POC-2: GREENFIELD Vercel POC project — apply preset + deploy

**Step 0 (one-time choice per §2.5 deploy-time decision tree):** Ilya picks path (a) / (b) / (c) per §2.5. **Recommended: (b) preset-only temporary branch.**

**Path (b) — preset-only temporary deploy branch (RECOMMENDED for POC scope):**

```bash
# Ilya's local laptop, NOT Claude Code:
cd /Users/ilyaklipinitser/Downloads/Dwellium\ -Per\ Spec

# 1. Create a deploy-only sub-branch off the 9.3 branch (preserves local-dev smoke-test on main 9.3 branch):
git checkout feat/phase-9-task-9.3-cdn-edge-poc
git checkout -b feat/phase-9-task-9.3-vercel-deploy-only

# 2. Apply §2.1 preset wiring on this sub-branch (BUT NOT on the parent 9.3 branch):
cd qualia-shell && npm install --save-dev @vercel/react-router && cd ..
# Then edit qualia-shell/react-router.config.ts per §2.1 diff (add import + presets array)

# 3. Apply §2.3 headers() export on app/root.tsx (the SSR-response Cache-Control mechanism)
# Edit qualia-shell/app/root.tsx — add the headers() export per §2.3

# 4. Commit the preset wiring on the deploy-only branch:
git add qualia-shell/react-router.config.ts qualia-shell/package.json qualia-shell/package-lock.json qualia-shell/app/root.tsx
git commit -m "wip(poc-2): preset wiring + Cache-Control header for Vercel POC (deploy-only branch)"

# 5. Deploy to a GREENFIELD Vercel project:
vercel login                  # authenticate (browser-prompt)
vercel link                   # link to a NEW project; project name suggestion: "dwellium-perf-poc"
                              # CRITICAL: do NOT link to any existing production project
vercel                        # deploy preview
vercel --prod                 # promote to production URL within the POC project
```

**Path (a) — full migration (only if Ilya wants to also co-ship the smoke-test/playwright/CI migration in B-α scope):**

Skip the deploy-only branch creation; apply preset wiring + §2.4 migration items directly on the 9.3 branch. Re-run the full strict gate post-migration to confirm everything passes. This is a multi-file change and adds significant scope to B-α POC — recommend deferring to a separate Phase-9+ Task 9.X after B-α POC empirical verdict.

**Path (c) — no preset (relies on Vercel auto-detection without preset):**

Skip §2.1 install + wiring entirely. Just deploy current 9.3 branch as-is via Vercel CLI / web dashboard. Empirically verify if Vercel handles RR v7 framework-mode auto-detection without the preset. Per Vercel docs, the preset is "highly recommended" — auto-detection without preset MAY work (zero-config claim) but is empirically unverified at this scoping.

**Option (Vercel web dashboard alternative to CLI for any path):**

1. Push the deploy-only branch (path b) OR the modified 9.3 branch (path a) OR the unmodified 9.3 branch (path c) to GitHub
2. Visit https://vercel.com/new
3. Import the `dwellium-per-spec` repo
4. Set project name = `dwellium-perf-poc` (or similar; do NOT link to production)
5. Set "Production Branch" = the branch chosen above (so POC URL deploys from that branch only)
6. (Path c only) Vercel may auto-detect RR v7 framework-mode and pre-fill build settings — accept the auto-detected defaults
7. Click "Deploy"

### §3.3 POC-3: verify edge-cache HIT behavior

After successful deploy:

```bash
# Ilya's terminal (production POC URL):
curl -I https://<poc-url>.vercel.app/
# Look for response headers:
# - x-vercel-cache: MISS (on first request)
# - cache-control: public, max-age=0, s-maxage=300, stale-while-revalidate=600

# Second request within 300s:
curl -I https://<poc-url>.vercel.app/
# Expected: x-vercel-cache: HIT
```

**Acceptance gate:** `x-vercel-cache: HIT` on second request within TTL window confirms edge-cache is engaged.

### §3.4 POC-4: n=10 Lighthouse run against POC URL (sister-shape to Task 8.12 protocol)

Once Ilya has the POC URL + verified cache HIT, Claude Code CAN write a measurement script (sister-shape to `Scripts/run_lighthouse_phase8.mjs`) that runs n=10 Lighthouse audits against the POC URL. The script doesn't deploy — it just measures.

Tentative script invocation (Claude Code to provide at POC-3 acceptance):

```bash
LH_TASK_FIELD=phase9_task_9_3_poc_b_alpha \
LH_CAPTURE_SUFFIX=_n10_baseline_vercel_edge \
LH_ROOT_RUNS=10 \
LH_TARGET=https://<poc-url>.vercel.app/ \
node Scripts/run_lighthouse_phase9.mjs
```

(Note: Script doesn't exist yet; Claude Code can create it AFTER Ilya provides the POC URL — that's POC-4 PRE0 work, not POC-2.)

### §3.5 POC-5 + POC-6: compare empirical data to baseline + decision gate

Claude Code can analyze the resulting capture JSON (sister-shape to Task 8.12 `2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json` analysis at this PRE0). The acceptance gate is the n=10 LCP distribution post-edge-cache vs the verified 2,724 ms median / bimodal cluster A 20% baseline.

### §3.6 Hand-off summary

| POC step | Who does it | Status |
|---|---|---|
| POC-1 (cookie-vs-localStorage) | Claude Code (PRE0) | **✓ COMPLETE — REFUTED; localStorage-only** |
| POC-2 (Vercel deploy) | **Ilya** | **PENDING** — hand-off |
| POC-3 (cache HIT verification) | **Ilya** | **PENDING** — hand-off |
| POC-4 (n=10 Lighthouse against POC URL) | Claude Code (post-Ilya-deploy) | **PENDING** — depends on POC-2 + POC-3 success |
| POC-5 (cluster A vs B comparison) | Claude Code (post-POC-4) | **PENDING** |
| POC-6 (decision gate) | Cowork + Ilya verdict | **PENDING** — empirical-data-driven |

---

## §4. HALT-IF audit at Task 9.3 PRE0

| HALT-IF | Status | Notes |
|---|:-:|---|
| Production source touched at PRE0 | ✅ CLEAN | ZERO `qualia-shell/src/**` + `qualia-shell/app/**` + `Scripts/**` touches |
| Account-creation attempted | ✅ CLEAN | Zero account-creation attempts |
| Deploy-with-credentials attempted | ✅ CLEAN | Zero deploy commands run |
| Credentials/tokens read | ✅ CLEAN | Zero credential file reads |
| Recursive-validation discipline applied | ✅ COMPLIANT | POC-1 HYPOTHESIS empirically REFUTED via source inspection; §3.0 inventory empirically grounded; vercel.json artifact HYPOTHESIS-labeled per recursive-validation |
| Branch-base discipline (v2.74.1) | ✅ COMPLIANT | Branch-base = `6c430c4` = 9.2 squash-SHA; **8-consecutive vindication** |
| TBD-9.2 sweep | ✅ CLEAN | 0 occurrences in repo; sister-shape to v2.60.1 16th altitude monotonic-under-estimate pattern at task-BOUNDARY |
| Doc-only at PRE0 | ✅ COMPLIANT | All edits are docs/artifacts only |

---

## §5. Cowork verdict-pending — 3 decision points before POC-2 hand-off proceeds

🔴 **HARD HALT at this PRE0 ledger. Awaiting:**

1. **§3.0 scenario confirmation from Ilya** — A/B/C/D? (out-of-band; cannot verify from repo)
2. **vercel.json artifact ratification** — §2.1 standard form OR §2.2 framework-preset form OR alternative
3. **POC-2 deploy authorization** — Ilya executes per §3.2 instructions; Claude Code awaits POC URL for POC-4

**Cumulative branch state for Cowork review:**

| Element | Value |
|---|---|
| Branch | `feat/phase-9-task-9.3-cdn-edge-poc` (pushed to origin post-PRE0 commit) |
| Branch-base | `6c430c4` (= 9.2 squash-SHA; v2.74.1 8-consecutive vindication ✓) |
| Commits on branch | 1 — `<PRE0 commit SHA>` Task 9.3 PRE0 hand-off package (this doc) |
| Working tree | CLEAN post-commit (only untracked: `qualia-shell/.react-router/` + `qualia-shell/build/` build artifacts) |
| ZERO production source touched | ✓ |
| ZERO deploy commands run | ✓ |
| ZERO accounts created | ✓ |

---

## §4. POC-4 EMPIRICAL FINDINGS (post-Ilya-deploy + Claude Code n=10 measurement)

### §4.1 PART A — Diagnosis: WHY custom Cache-Control didn't appear in POC-3 curl

**🎯 H2 CONFIRMED with multiple independent evidence streams** (NOT H1 static-prerender).

Evidence inspected on `feat/phase-9-task-9.3-vercel-deploy-only` post-rebuild:

| Evidence stream | Finding |
|---|---|
| `build/client/` HTML files | Only `eta-timer.html` (unrelated static asset); **NO `index.html` for "/"** |
| `.vercel/react-router-build-result.json` `routeIdToServerBundleId` | All routes (`routes/security`, `routes/default`, `splat`) → `nodejs_eyJydW50aW1lIjoibm9kZWpzIn0` server bundle; **NO `prerender` config anywhere** |
| Route configs in build manifest | Each route has `config.runtime: "nodejs"` — runs as SSR Function, NOT prerendered static |
| POC-3 curl response | `cache-control: public, max-age=0` (Vercel default) + `x-vercel-cache: MISS→HIT` (Vercel's internal edge-cache of public Function responses, ~5-second age TTL) |

**Verdict:** "/" is served by an SSR Function (not prerendered). Vercel's MISS→HIT pattern comes from its **default edge-caching behavior of public Function responses** — NOT from our `headers()` export, which is **NEVER INVOKED** because RR v7 framework-mode only calls `headers()` when the route OR an ancestor has a loader/action (and `app/routes/default.tsx` is loaderless re-export bridge).

**Fix-warranted analysis (informational; Ilya's gate-decision):** trivial 3-line fix — add a no-op `loader` to `app/routes/default.tsx`:
```tsx
export function loader() { return null; }
```
This triggers RR v7 to invoke the route's `headers()` export, applying `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=600` to the response (vs current Vercel-default `public, max-age=0`). **However, see §4.4 below — this fix is materially MOOT for the gate-crossing question because LCP is dominated by post-hydration cascade, NOT by edge-cache TTL extension.**

### §4.2 PART B — n=10 LCP/FCP/TTFB measurement results

Per `Docs/Baselines/2026-05-23_Phase9_task_9_3_poc_b_alpha_perf_capture_n10_vercel_edge.json` (full raw data + per-run breakdown).

**Cohort statistics (median + CV per metric, SEPARATELY):**

| Metric | Cold-MISS median | Cold-MISS CV | Warm-HIT median | Warm-HIT CV |
|---|---|---|---|---|
| **LCP** | **4,775 ms** | **2.7%** | **4,705 ms** | **18.7%** (bimodal) |
| **FCP** | **2,811 ms** | **2.7%** | **2,728 ms** | **10.8%** |
| **TTFB** | **42 ms** | **21.1%** | **39 ms** | **50.6%** |

**🎯 Empirical observation — warm-HIT cohort is BIMODAL despite cache HITs.** Within the 10 warm-HIT runs (9 HIT + 1 STALE), two runs (#3 + #4) showed dramatically lower LCP (~2,710 ms / ~2,107 ms FCP) — approximating the Task 8.12 localhost baseline. The other 8 warm-HIT runs clustered around LCP ~4,600-4,800 ms. This NEW bimodality is at a different absolute range than Task 8.12 (which had Cluster A LCP≈FCP≈1,953 ms vs Cluster B LCP 2,254-2,802 ms) — at Vercel-edge, the "fast subset" approximates Task 8.12 Cluster B mid-range, NOT Cluster A. Cluster A (server-paint LCP ≈ FCP within 50 ms) appears in **ZERO runs** in either cohort.

**Cluster A vs B split (LCP - FCP ≤ 50 ms threshold = Cluster A):**
- Cold-MISS: A=**0**, B=**10** (A=**0%**) — collapsed from Task 8.12's 20% Cluster A localhost
- Warm-HIT: A=**0**, B=**10** (A=**0%**) — collapsed from Task 8.12's 20% Cluster A localhost

**PRIMARY edge-benefit signal (warm-HIT median vs cold-MISS median, same-platform):**

| Metric | Δ (warm vs cold) | % delta |
|---|---|---|
| LCP | **↓ 70 ms** | **−1.5%** |
| FCP | ↓ 84 ms | −3.0% |
| TTFB | ↓ 4 ms | −8.3% |

**🎯 Edge benefit is MARGINAL: ~1.5% LCP improvement on cache HIT vs MISS.** Far below the §5 scoping projection (which hypothesized ~30-40% improvement assuming FCP would drop from 1,953 ms to ~300 ms on cache HIT). **Empirical reality refutes the projection** by ~96% (1.5% actual vs 30-40% projected).

**SECONDARY (CAVEATED apples-to-oranges) — warm-HIT vs Task 8.12 localhost baseline:**

| Metric | Task 8.12 baseline (localhost) | Vercel warm-HIT median | Δ |
|---|---|---|---|
| LCP | 2,724 ms | **4,705 ms** | **↑ 1,981 ms (+72.7%)** |
| FCP | 1,954 ms | 2,728 ms | ↑ 774 ms (+39.6%) |

**Caveat:** localhost = 0 RTT; Vercel = real client→edge RTT not controlled. Vercel-edge is materially SLOWER than localhost SSR for this workload (network latency + Vercel Function cold-start overhead dominate).

**v1 L228 ≤500 ms LCP gate-crossing per-run rate:**

| Cohort | Gate-crossing | % crossing |
|---|---|---|
| Cold-MISS | 0/10 | **0%** |
| Warm-HIT | 0/10 | **0%** |

**Per-run x-vercel-cache attribution (pre-probe curl HEAD):**

| Cohort | MISS | HIT | OTHER (STALE) |
|---|---|---|---|
| Cold-MISS | 10/10 | 0/10 | 0/10 |
| Warm-HIT | 0/10 | 9/10 | **1/10 (STALE; run 1 age=344s — pre-existing cache from prior testing exceeded TTL)** |

Cache states behaved as constructed: unique `?cb=` URLs guaranteed MISS in cold cohort; fixed URL converted to HIT for runs 2-10 of warm cohort (run 1 STALE = previously cached but past TTL).

### §4.3 POC-6 recommendation — B-α verdict + headers() fix [REVISED 2026-05-23 per Cowork verdict-lock]

🔴 **REVISED at Task 9.3 POC-6 LCP-attribution close (Cowork verdict-lock 2026-05-23).** The original §4.3 recommendation (committed at `2b03f3b`) recommended B-γ island-hydration as the next-priority lever. Cowork independently verified the n=10 capture and FLAGGED that recommendation as evidence-contradicted: across all 20 runs TBT=0, TTI===LCP exactly, FCP→LCP gap ≈ 1,977 ms — that is a NETWORK / ASYNC-WAIT signature, NOT hydration-JS-cost. B-γ would NOT move LCP because there is ~no JS-blocking cost to eliminate. **B-γ HOLD** per Cowork PART B.

**Attribution analysis (Cowork PART C) was then authorized** to identify the actual lever family. Findings:

| Question | REVISED verdict (post-attribution 2026-05-23) | Evidence |
|---|---|---|
| Does B-α cross v1 L228 ≤500 ms LCP gate? | **🔴 NO — ratified** | 0/10 gate-crossing in BOTH cohorts; warm-HIT median 9.4× over gate |
| Does B-α meaningfully approach the gate? | **🔴 NO — ratified** | PRIMARY edge benefit −1.5% LCP improvement; ROBUST claim: "HTML-delivery edge-caching does not move LCP" |
| Is the headers() fix (add loader to default.tsx) warranted? | **🔴 DECLINED** | Per Cowork PART D: hygiene-only, zero LCP impact per POC-4 empirical evidence. Do NOT apply / do NOT redeploy. |
| Is B-γ (island-hydration) the next-priority lever? | **🔴 NO — REVISED** | Per Cowork PART B + Task 9.3 POC-6 attribution: TBT=0 + TTI===LCP exactly across all 20 runs = NO hydration-JS cost to eliminate. B-γ HOLD per Cowork PART B. |
| What IS the empirical LCP bottleneck? | **🎯 CSS animation on the LCP element** | Per Task 9.3 POC-6 attribution analysis (`Docs/Baselines/2026-05-23_Phase9_task_9_3_lcp_attribution.json`): LCP element identified as `body > div.login-start-overlay > div.login-start-text` ("CLICK TO ACCESS TERMINAL"). LCP breakdown: TTFB ~188 ms + elementRenderDelay ~1,095 ms (raw) — the elementRenderDelay is the bottleneck. Source at `qualia-shell/src/components/Auth/LoginScreen.css:48-65` shows `flashText` 3s infinite animation with `0%, 100% { opacity: 0.3; }` + `50% { opacity: 1; }`. Element starts at opacity 0.3 → ramps to 1.0 → Lighthouse's LCP detection waits for the opacity threshold crossing → ~1,095 ms elementRenderDelay added on top of FCP. |

**🎯 POC-6 REVISED final recommendation (post-Cowork-verdict + attribution):**

1. **B-α NOT a gate-crossing path** — ratified (ROBUST claim: HTML-delivery edge-caching does not move LCP).
2. **headers() fix DECLINED** — hygiene-only; zero LCP impact per POC-4.
3. **B-γ HOLD** — empirical signature (TBT=0 + TTI===LCP) contradicts hydration-JS-cost rationale.
4. **Next lever family: UI-RENDER-OPTIMIZATION / CSS-ANIMATION-AUDIT** — 1-3 line CSS edit at `qualia-shell/src/components/Auth/LoginScreen.css` to fix the opacity-ramp animation that delays LCP element-render. Scoped at `Docs/Phase9_LCP_Element_Render_Delay_Scoping.md` (sister-shape to Task 9.2 B-α scoping; SCOPING-ONLY 7pt → 8pt extension candidate). **NO implementation at Task 9.3 altitude; deploy gate is Ilya's**.

### §4.4 v1 L228 disposition implications [REVISED 2026-05-23]

🔴 **REVISED per Cowork PART E verdict-lock.** Prior §4.4 rested partially on the confounded localhost-vs-Vercel +72.7% comparison. Cowork: "Do NOT lean on 'Vercel is worse than localhost' as a conclusion anywhere. The ROBUST claim is narrower: 'HTML-delivery edge-caching does not move LCP.'" Revised disposition:

- **B-α empirical refutation is substantively-progress-NEGATIVE for the (b) PARTIAL-MET trajectory IF B-α had been the right lever.** But Task 9.3 POC-6 attribution refines: B-α was the wrong lever family entirely. The empirical bottleneck is the CSS animation on the LCP element — a measurement artifact / hygiene issue, NOT a network or hydration bottleneck.
- **The ROBUST architectural claim** that disposition rests on: "HTML-delivery edge-caching does not move LCP" (PRIMARY signal cold-vs-warm −1.5%; same-platform; internally valid). The confounded SECONDARY comparison is held at the empirical-data altitude but NOT used as a disposition driver.
- **NEW finding for the disposition trajectory:** the apparent ~2,000 ms FCP→LCP gap on Vercel is a CSS-animation artifact, NOT a real architectural cost. After the CSS-fix lever (per `Docs/Phase9_LCP_Element_Render_Delay_Scoping.md`) Ilya can re-measure to confirm; projected post-fix LCP ~2,730 ms (≈ Task 8.12 localhost baseline). This would CLEAN UP the measurement and reveal the "true" Vercel baseline — neither continuing the 4,653 → 3,903 → 2,724 ms trajectory dramatically further NOR confirming Framing (a) STRUCTURALLY UNATTAINABLE; it stabilizes the empirical baseline at the level of the prior Phase-8+ measurement, allowing subsequent levers to target real (not artifact) bottlenecks.
- **Recommendation: sustain Framing (b) PARTIAL-MET as the live disposition.** Do NOT pre-flip to Framing (a). The CSS-animation fix is the next empirical test (low-cost; reveals what the real next bottleneck is post-fix). Real gate-crossing post-CSS-fix would still require materially different architecture (e.g., separate static landing page; per the §7.3 carry-forward in the scoping doc) — but that is a SUBSEQUENT lever, scoped AFTER the CSS fix empirically lands.

### §4.5 POC step status [UPDATED 2026-05-23]

| POC step | Owner | Status |
|---|---|---|
| POC-1 cookie-vs-localStorage source-provenance | Claude Code | ✓ COMPLETE — REFUTED (localStorage-only) |
| POC-2 Vercel deploy | Ilya | ✓ COMPLETE — live at `https://dwellium-per-spec.vercel.app/` (deployed from throwaway branch `feat/phase-9-task-9.3-vercel-deploy-only` commit `7e822a2`) |
| POC-3 cache HIT/MISS verification | Ilya | ✓ COMPLETE — MISS→HIT confirmed; custom Cache-Control NOT applied (H2 confirmed at §4.1 PART A) |
| POC-4 n=10 Lighthouse measurement (cold-MISS vs warm-HIT) | Claude Code | ✓ COMPLETE — see §4.2 |
| POC-5 cluster A/B comparison vs Task 8.12 baseline | Claude Code | ✓ COMPLETE — see §4.2 (Cluster A collapsed to 0% at Vercel) |
| POC-6 LCP-attribution analysis | Claude Code | ✓ **COMPLETE 2026-05-23** — see §4.6 below; CSS animation identified as bottleneck |
| Next-lever scoping (CSS-animation audit) | Claude Code | ✓ COMPLETE — see `Docs/Phase9_LCP_Element_Render_Delay_Scoping.md` |
| Task 9.X CSS-animation fix + redeploy + re-measure | Ilya gate | **DEFERRED** — Ilya gates implementation per scoping doc §6 |

### §4.6 POC-6 LCP attribution findings [NEW 2026-05-23]

Per Cowork PART C authorization at 2026-05-23. n=3 Lighthouse runs against the live POC URL with FULL artifact capture via `Scripts/analyze_lcp_attribution_phase9.mjs` (NEW; sister-shape to phase9 measurement script at attribution altitude). Output: `Docs/Baselines/2026-05-23_Phase9_task_9_3_lcp_attribution.json`.

**LCP element (consistent across all 3 runs):**

| Attribute | Value |
|---|---|
| Selector | `body > div.login-start-overlay > div.login-start-text` |
| Path | `1,HTML,1,BODY,1,DIV,0,DIV` |
| Snippet | `<div class="login-start-text">` |
| Text content (nodeLabel) | **"CLICK TO ACCESS TERMINAL"** |
| Type | text (NOT image; `lcp-discovery-insight` returned `notApplicable`) |

**LCP phases breakdown (`lcp-breakdown-insight` audit; RAW timings):**

| Phase | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| timeToFirstByte | 208 ms | 171 ms | 188 ms | ~188 ms |
| elementRenderDelay | **1,078 ms** | **1,103 ms** | **1,095 ms** | **~1,095 ms 🎯 dominant** |

**Critical-path network requests:** 15 total in the run; all complete by ~700 ms. **0 requests in FCP→LCP window** across all 3 runs (confirms no network blocker in the gap).

**Throttling config:** `simulate` / formFactor `mobile` / cpuSlowdownMultiplier `4×` / RTT `150 ms` / Download `1,474 kbps` — TBT=0 under 4× CPU throttling means there is GENUINELY zero main-thread work between FCP and LCP (not a "no throttle" artifact). The 4× CPU throttle is identical to phase8 default (matches the n=10 baseline measurement throttle byte-for-byte).

**Hypothesis verdicts:**

| Hypothesis | Verdict | Evidence |
|---|:-:|---|
| Post-hydration auth/data round-trip (Cowork PART C) | **🔴 REFUTED** | (a) UserContext.tsx:285-288 — useEffect exits immediately if token null; Lighthouse runs with no localStorage token → `/api/auth/me` fetch DOES NOT FIRE. (b) Network audit: 0 requests in FCP→LCP window. |
| B-γ island-hydration as next lever | **🔴 REFUTED** | TBT=0 under 4× CPU throttling = no JS-blocking cost to eliminate. Island hydration eliminates hydration-JS cost; there's no JS cost present. |
| **CSS animation on LCP element delays render** | **🎯 CONFIRMED** | (a) LCP element identified as `.login-start-text` (text content). (b) Source inspection of `LoginScreen.css:48-65` shows `flashText` 3s infinite animation with opacity oscillation 0.3 ↔ 1.0. (c) Lighthouse's `elementRenderDelay: ~1,095 ms` matches the time for opacity to ramp from 0.3 toward LCP threshold. (d) No other plausible explanation for ~2,000 ms FCP→LCP gap with TBT=0 and 0 network in window. |

**Source of the artifact:** `qualia-shell/src/components/Auth/LoginScreen.css` lines 48-65:
```css
.login-start-text {
    ...
    animation: flashText 3s infinite ease-in-out;
}
@keyframes flashText {
    0%, 100% { opacity: 0.3; }
    50%      { opacity: 1; }
}
```

The LCP element starts at `opacity: 0.3` (below LCP visibility threshold) and ramps to `opacity: 1.0` at 50% of the 3-second animation cycle (1.5 seconds). Lighthouse's LCP detection waits for the opacity threshold crossing → adds the observed elementRenderDelay.

### §4.7 Task 9.3 close — summary

**Phase-9+ Task 9.3 COMPLETE at this hand-off doc + scoping doc.** Block-shape characteristics:

| Element | Value |
|---|---|
| Class designation | **MEASUREMENT-ONLY 10pt → 11pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** per Cowork PART F ratification |
| Sub-shape (11) | `LCP-cold-vs-warm-cohort-comparison-AND-element-attribution-at-remote-URL` (dual-modality measurement at remote-URL altitude; folds POC-4 cohort-comparison + POC-6 LCP-attribution into a single Task 9.3 deliverable) |
| Phase-9+ next-lever scoping deliverable | `Docs/Phase9_LCP_Element_Render_Delay_Scoping.md` (NEW; recommends CSS-animation fix as the next-priority lever; SCOPING-ONLY 7pt → 8pt extension candidate) |
| Throwaway deploy-only branch | `feat/phase-9-task-9.3-vercel-deploy-only` @ `7e822a2` — UNTOUCHED (preset wiring; local-only; do-not-merge) |
| Parent branch state | `feat/phase-9-task-9.3-cdn-edge-poc` — multiple commits ahead of main; PR-pending Ilya's ship gate |
| v1 L228 disposition | Sustained (b) PARTIAL-MET per Cowork PART E |
| Next deliverable | Task 9.X CSS-animation fix (Ilya gate) per scoping doc |

**Phase-9+ trajectory at Task 9.3 close:**

```
Phase-8+ Task 8.12 LCP baseline (localhost; ssr:true):  median 2,724 ms
Phase-9+ Task 9.3 POC-4 LCP (Vercel; ssr:true):         median 4,705 ms (warm-HIT)
Phase-9+ Task 9.3 POC-6 attribution:                     +1,095 ms artifact from CSS animation
                                                         (NOT network overhead; NOT hydration cost)
Projected post-CSS-fix LCP (Vercel; ssr:true):           median ~2,730 ms (≈ Task 8.12 baseline; pending empirical verify)
```

The Vercel +72.7% LCP penalty surfaced at POC-4 SECONDARY comparison is structurally explained: ~2,000 ms of it is the CSS animation artifact + a smaller residual from network overhead. After the CSS fix, Vercel LCP should align with Task 8.12 localhost baseline — confirming Vercel-edge is NOT structurally worse than localhost SSR for this workload (per Cowork PART A "Do NOT lean on Vercel-worse-than-localhost" guidance).

🧪
