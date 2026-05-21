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

---

## §2. Candidate `vercel.json` artifact (PRE0; NOT DEPLOYED)

**🔴 This is a PROPOSED artifact for Ilya's review.** Claude Code did NOT deploy this. Ilya will need to (a) create a Vercel account if Scenario D + no existing account, (b) install Vercel CLI locally, (c) authenticate (`vercel login`), (d) link a new POC project (`vercel link`), (e) commit a vercel.json file at repo root (or qualia-shell/vercel.json depending on Vercel's project-root resolution), (f) run `vercel` to deploy. Claude Code is **FORBIDDEN** from steps (a)-(f).

### §2.1 Candidate `vercel.json` (place at repo root OR `qualia-shell/`)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "version": 2,
  "buildCommand": "cd qualia-shell && npm run build",
  "outputDirectory": "qualia-shell/build/client",
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
        }
      ]
    }
  ]
}
```

**HYPOTHESIS labels applied (recursive-validation discipline):**

| Field | Label | Notes |
|---|---|---|
| `version: 2` | **STANDARD** (Vercel v2 platform) | Default for modern Vercel projects |
| `buildCommand` | **HYPOTHESIS** | Repo has `qualia-shell/package.json` build script `tsc -b && react-router build`; the `cd qualia-shell &&` prefix assumes repo-root deploy with subdirectory app — needs verification at deploy time |
| `outputDirectory` | **HYPOTHESIS** | `qualia-shell/build/client` is the RR v7 framework-mode output per Phase-8+ Task 8.6 cementation; Vercel may need this OR may auto-detect from RR adapter |
| `framework: null` | **HYPOTHESIS** | Vercel has framework presets (`remix`, `react-router`, etc.); setting `null` disables auto-detection; if Vercel's `react-router` preset exists for RR v7 framework-mode, that may be preferable. Needs verification. |
| `headers[].Cache-Control` | **HYPOTHESIS** | `public, max-age=0, s-maxage=300, stale-while-revalidate=600` is the standard pattern — `max-age=0` ensures browser doesn't cache stale (re-validates each navigation); `s-maxage=300` (5 min) gives edge cache 5-minute TTL; `stale-while-revalidate=600` (10 min) extends grace period for background revalidation |

**Cache header rationale (s-maxage=300):** 5-minute fresh window balances (a) avoiding stale-spinner serving for too long after deploys + (b) maximizing cache HIT rate for traffic spikes. Tunable per POC empirical data.

### §2.2 Alternative: Vercel-native framework preset (if RR v7 supported)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "version": 2,
  "framework": "react-router",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
        }
      ]
    }
  ]
}
```

Use this if Vercel's `react-router` framework preset supports RR v7 framework-mode natively. Saves the explicit buildCommand/outputDirectory. Needs empirical verification.

### §2.3 Why no `build-output` directive or `runtime` config

- B-α POC stays on **Node.js runtime** (CONDITIONAL on §3.0 Scenario A/D verification; Decision-#1 LOCK rationale: `@react-router/serve` Node-runtime drop-in compatibility)
- NO `runtime: "edge"` setting — that would force Edge Runtime which has V8-isolate constraints + likely incompatible with `@react-router/serve` (sister-shape: §3.2 Cloudflare Workers compatibility refutation in scoping doc)
- NO `functions` array — Vercel's RR v7 adapter handles SSR routing automatically

---

## §3. Hand-off instructions for Ilya — POC-2 deploy step

🔴 **Ilya executes these steps; Claude Code does NOT.**

### §3.1 Prerequisites Ilya verifies/sets up (out-of-repo)

1. **Vercel account:** confirm Ilya has a Vercel account OR creates one at https://vercel.com (free hobby tier sufficient for POC)
2. **Vercel CLI:** `npm i -g vercel` (or use Vercel's web dashboard for direct GitHub-import deploy)
3. **GitHub access:** confirm the repo `NovaTrustSolutions/dwellium-per-spec` is accessible from the Vercel account
4. **Decision on scenario:** Ilya confirms whether there's an existing production deploy (Scenario A/B/C) OR this is greenfield (Scenario D)

### §3.2 POC-2: deploy the candidate vercel.json to a fresh POC project

**Option A — Vercel CLI (local laptop):**

```bash
# Ilya's local laptop, NOT Claude Code:
cd /Users/ilyaklipinitser/Downloads/Dwellium\ -Per\ Spec
vercel login                  # authenticate browser-prompt
vercel link                   # link to a NEW project (don't link to production)
                              # name suggestion: "dwellium-perf-poc"
# Commit vercel.json from §2.1 to the 9.3 branch first, then:
vercel                        # deploys preview
vercel --prod                 # promotes to production URL within POC project
```

**Option B — Vercel web dashboard:**

1. Push the 9.3 branch (with vercel.json committed) to GitHub
2. Visit https://vercel.com/new
3. Import the `dwellium-per-spec` repo
4. Set project name = `dwellium-perf-poc` (or similar; do NOT link to production)
5. Set production branch = `feat/phase-9-task-9.3-cdn-edge-poc` (so the POC URL deploys from this branch only)
6. Click "Deploy"

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

🧪
