# Phase-9+ Task 9.2 — B-α CDN-Edge SCOPING-ONLY Deliverable

**Status.** **R OPEN** — Phase-9+ Task 9.2 active at branch `feat/phase-9-task-9.2-cdn-edge-scoping`; this doc IS the Task 9.2 deliverable per Cowork Decision-(c) LOCK at Phase-9+ Task 9.2 PRE0. **Draft state; HALT for Cowork verdict before PR-open per Cowork execution-order Step 4.**
**Class.** **SCOPING-ONLY 6pt → 7pt CROSS-PHASE-BOUNDARY-SHAPE-CONTINUATION extension** per Cowork Decision-(b) LOCK; sub-shape (7) `architectural-axis-shift-scoping-CDN-edge-deploy-platform-decision-tree`. SCOPING-ONLY now highest cross-phase-distributed class in project (Phase-8+ 5pt + Phase-9+ 2pt at HEAD-post-9.2-PRE0).
**Authored.** 2026-05-21 (this draft) — Phase-9+ Task 9.2 PRE0 → mid-task per Cowork execution-order Step 3.
**Sister-shape precedent.** Forward-scoping doc at architectural-axis altitude. Sister-shape to `Docs/Phase8_SSR_Architectural_Scoping.md` (Phase-8+ SSR migration scoping; 80-92 KB band) but at CDN-edge altitude (a new architectural axis vs Phase-8+'s SSR-runtime axis).
**Cross-references.** `Docs/Phases/Phase_9_Plan.md` §4 B-α (lever scoping foundation; OQ-1 LOCK B-α SCOPED FIRST per Ilya verdict 2026-05-21) + `Docs/Phase8_Closure_Report.md §6.2` (v1 L228 DUAL-FRAMING; RATIFIED (b) PARTIAL-MET) + `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` (Outcome (B) trajectory definition) + `Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json` (n=10 empirical baseline).

---

## §0. Scope + cross-reference + **load-bearing deploy-target-unknown caveat**

### §0.1 Scope

This doc scopes the **B-α CDN-edge delivery lever** — first of three Phase-9+ Block B architectural-axis-shift candidates (B-α CDN-edge / B-β HTTP-3 / B-γ island-hydration). B-α was prioritized FIRST per Cowork OQ-1 LOCK at Phase-9+ Task 9.2 OPENING (Ilya verdict 2026-05-21) on the basis of: largest standalone LCP-reduction potential + lever most likely to actually cross ≤500 ms on a cache HIT for the unauth'd-user path.

**Scope IN:** architectural inventory (CDN platforms + compatibility with `@react-router/serve` Node runtime), cache-key discipline, LCP projection model grounded in empirical bimodal baseline, risks/OQs, Cowork decision gate recommendation.

**Scope OUT (deferred to Task 9.3 implementation altitude per SCOPING-ONLY class discipline):** production source touches, deploy-target migration, POC implementation, empirical post-edge-cache LCP measurement, B-β + B-γ scoping (separate Phase-9+ tasks).

### §0.2 🎯 LOAD-BEARING CAVEAT — Deploy target is OUT-OF-REPO (R-4 v2.26 cross-repo amendment)

**Per source-provenance verification at Phase-9+ Task 9.2 PRE0:** `@react-router/serve@7.15.1` is **VERIFIED as the production server runtime** at three repo-observable altitudes — (i) `qualia-shell/package.json:24` production dependency placement (per Finding S production-deps-placement convention) + (ii) `Scripts/smoke_test_ssr_phase8.mjs:163-168` spawns `['react-router-serve', 'build/server/index.js']` for the Phase-8+ Task 8.11 smoke-test BLOCKING CI step + (iii) `qualia-shell/playwright.baseline.config.ts` webServer command (post-v2.73.1 in-place patch at Task 8.11).

**But the ACTUAL deploy target is OUT-OF-REPO** per R-4 v2.26 cross-repo amendment. The repo cannot observe (a) which deploy platform is currently in use (Vercel / Netlify / Cloudflare / AWS / Heroku / custom) + (b) whether edge-cache infrastructure is already configured + (c) whether `@react-router/serve` is the actual production HTTP server OR whether a different platform-specific adapter is used at deploy altitude.

**Implications for this doc:**
1. **Every §3 platform recommendation is CONDITIONAL** on the actual deploy infrastructure verified out-of-band. If the infra is already on a specific platform (e.g., Vercel), the §3 decision tree collapses to "does the existing platform support edge-cache for the Branch-3 spinner shell."
2. **Every §5 LCP projection is a PROJECTION grounded in repo-observable empirical baselines** — NOT a post-edge-cache empirical measurement. POC verification (Task 9.3 implementation altitude) is required before any projection becomes a fact.
3. **§7 Cowork decision gate** explicitly delegates: (a) confirm current deploy infra with infra owner + (b) decide platform IF greenfield + (c) authorize POC scope.

### §0.3 Cross-reference index

| Source | Use |
|---|---|
| `Docs/Phases/Phase_9_Plan.md §4 B-α` | Lever foundation; OQ-1 LOCK rationale (Ilya verdict 2026-05-21) |
| `Docs/Phase8_Closure_Report.md §6.2` | v1 L228 DUAL-FRAMING verdict; RATIFIED (b) PARTIAL-MET disposition |
| `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` | Outcome (B) trajectory definition; sister-shape scoping precedent |
| `Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json` | n=10 empirical baseline; FCP/LCP/bimodal data |
| `qualia-shell/src/App.tsx:33-78` | AuthGate (Branch 3) function body — spinner shell semantics |
| `qualia-shell/src/context/UserContext.tsx:73-74` | `useSyncExternalStore` + `getServerSnapshot` + `useState(true)` for `isLoading` |
| `Scripts/smoke_test_ssr_phase8.mjs` | Smoke-test runtime evidence for `react-router-serve` |
| `qualia-shell/package.json:24` | `@react-router/serve@7.15.1` production dependency |

---

## §1. Executive summary + B-α verdict-candidate

### §1.1 The question

**Can CDN-edge delivery cross v1 L228 ≤500 ms LCP at the current React 19 + Vite 6 + RR v7 framework-mode ssr:true architecture?** Per Q1 LOCK at Phase-9+ kickoff (Ilya verdict 2026-05-21), the ≤500 ms gate STAYS LIVE; B-α is the first architectural-axis-shift lever scoped to drive LCP downward from the Phase-8+ 8.12 empirical median of 2,724 ms.

### §1.2 The empirical baseline (VERIFIED)

Per `Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json` `rootStats.metrics`:

| Metric | n=10 mean | n=10 median | n=10 range | CV |
|---|---|---|---|---|
| FCP | 1,953.99 ms | 1,953.66 ms | 4.31 ms | 0.06% (deterministic) |
| LCP | 2,498.81 ms | 2,723.65 ms | 848.74 ms | 13.5% (bimodal — Finding KK) |
| TBT | 0 ms | 0 ms | 0 ms | deterministic |
| CLS | 0 | 0 | 0 | deterministic |
| TTI | 2,501.06 ms | 2,731.15 ms | 848.74 ms | bimodal (sister to LCP) |

**Bimodal LCP distribution decomposition (NEW empirical signal cemented at Task 9.2 PRE0):**

| Cluster | Run count | LCP characteristic | LCP value |
|---|---|---|---|
| **A** (server-rendered paint IS LCP) | 2 of 10 / **20%** | LCP coincident with FCP | **~1,953 ms** |
| **B** (post-hydration paint is LCP) | 8 of 10 / **80%** | LCP > FCP by ~770 ms hydration-cascade-to-LCP | **~2,254-2,802 ms** (median ~2,724 ms) |

**20% of runs ALREADY achieve LCP at FCP** — this is the load-bearing insight for B-α: edge-caching the FCP-determining server-rendered HTML can reduce FCP (and Cluster A LCP) toward sub-second range.

### §1.3 The hypothesis (PROJECTION-ONLY at this scoping altitude)

**🎯 IF** edge-cache reduces FCP from 1,953 ms to ~300 ms on cache HIT (theoretical floor; not yet empirically verified), **THEN**:
- **Cluster A LCP** (paint-coincident) drops to **~300 ms** = **POTENTIALLY GATE-CROSSING** (≤500 ms target)
- **Cluster B LCP** drops to **~300 + 770 = ~1,070 ms** = non-gate-crossing but materially advanced
- **Mixed distribution** depending on cluster A vs B run proportions post-B-α; if architectural change tilts proportions toward Cluster A (e.g., via stale-while-revalidate edge config), Cluster A's share could grow

**🎯 Verdict-candidate at this scoping altitude:** B-α is the **highest-probability gate-crossing lever** among the 3 Block B candidates per pure-projection arithmetic. The gate-crossing scenario is conditional on (a) edge-cache HIT rates being high (depends on cache TTL + invalidation discipline) + (b) FCP reduction actually reaching the ~300 ms floor (depends on geographic distribution + connection latency) + (c) Cluster A vs B proportions post-B-α.

**🎯 Recommendation:** Authorize POC scope at a single CDN-edge platform to empirically verify FCP reduction + cluster proportion shift before full-migration commitment. POC scope detailed in §7.3.

---

## §2. Empirical baseline — extended at Task 9.2 PRE0

### §2.1 LCP decomposition (VERIFIED from Task 8.12 capture JSON)

- **FCP median = 1,953.66 ms** (deterministic; range 4.31 ms / CV 0.06%) — represents network + initial server-render + browser paint
- **LCP - FCP delta = ~770 ms** for Cluster B (post-hydration cascade contribution to LCP)
- **LCP - FCP delta = ~0 ms** for Cluster A (server-rendered paint IS LCP)
- **TBT = 0 ms deterministic** — no main-thread blocking work observed at the scoped routes
- **CLS = 0 deterministic** — no layout shift observed

### §2.2 Bimodal distribution implications for edge-caching

The bimodal Cluster A vs Cluster B distribution at the same HEAD-post-8.11 ssr:true HEAD is structurally significant for B-α:

**Cluster A** (20% of runs): the post-hydration paint candidate is NOT later/larger than the server-rendered paint. LCP fires at FCP coincident. Server-rendered HTML's spinner shell IS the largest contentful paint candidate at first paint.

**Cluster B** (80% of runs): the post-hydration paint candidate IS later/larger than the server-rendered paint. LCP fires after hydration when post-AuthGate content paints. Server-rendered HTML's spinner shell is REPLACED in the largest-contentful-paint determination.

**For B-α purposes:**
- Reducing FCP via edge-cache directly improves Cluster A LCP linearly (LCP = FCP for Cluster A)
- Reducing FCP via edge-cache improves Cluster B LCP by the same delta (LCP = FCP + ~770 ms hydration cascade for Cluster B) — proportionally smaller relative improvement
- IF edge-cache also affects hydration-cascade timing (e.g., by serving prefetched JS chunks faster from edge), Cluster B benefits further — but this is HYPOTHESIS-ONLY at this scoping altitude

### §2.3 Server-rendered HTML composition (VERIFIED via PRE0 source-provenance)

**AuthGate (Branch 3, default route) renders during `isLoading=true` (App.tsx:37-55):**

```tsx
function AuthGate() {
    const { isAuthenticated, isLoading, role } = useUser();
    const [tenantMode, setTenantMode] = useState(false);

    if (isLoading) {
        return (
            <div style={{
                position: 'fixed', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#0a0e1a', color: '#64748b', fontSize: 14,
                fontFamily: 'Inter, -apple-system, sans-serif',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 24, height: 24, margin: '0 auto 12px',
                        border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1',
                        borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                    }} />
                    Validating session…
                </div>
            </div>
        );
    }
    // ... post-auth branches (LoginScreen / TenantPortal / AdminShell)
}
```

**Why server-rendered HTML = spinner shell at SSR initial render (VERIFIED):**

- `UserContext.tsx:73` uses `useSyncExternalStore(tokenStore.subscribe, tokenStore.getSnapshot, tokenStore.getServerSnapshot)` (Phase-8+ Task 8.9 SSR-remediation)
- `tokenStore.getServerSnapshot` returns `null` per Phase-8+ Task 8.9 Cowork Verdict 3 LOCK
- `UserContext.tsx:74` initializes `isLoading` via `useState(true)` — true on first render
- During SSR initial render at server: token = null + isLoading = true → AuthGate Branch 3 renders spinner shell
- Empirical signature: Phase-8+ Task 8.11 smoke-test pre-hydration HTML = **5,949 B** (consistent with spinner-only content; full UI would be much larger; signature documented at CLAUDE.md Conventions block)

**Crucially: the spinner shell is COMPLETELY non-user-specific.** Hardcoded colors, hardcoded text "Validating session…", hardcoded inline styles, no user-data injection. **Edge-cacheable by construction** for the unauth'd-user path.

### §2.4 PRE0 terminology correction (cross-reference to Phase_9_Plan.md correction at commit `bc4e4c8`)

Phase_9_Plan.md initially referenced "AuthGate Branch 1" 8 times; corrected to "AuthGate (Branch 3)" at Task 9.2 PRE0 per recursive-validation discipline (P2 standing convention). **Branch 1 = `/security` route (SecurityRoute; standalone viewport-fill; NO providers; App.tsx:80-90)** — distinct surface from the AuthGate spinner. **Branch 3 = AuthGate (default route; 3 providers Theme + User + Query; App.tsx:33-78)** — the spinner-shell surface relevant to B-α edge-caching. This doc uses corrected terminology throughout.

---

## §3. CDN platform inventory + decision tree

### §3.0 🎯 VERIFY CURRENT DEPLOY INFRASTRUCTURE FIRST (mandatory addition per Cowork Decision-(c))

**🚨 Before treating §3.1-§3.5 as a greenfield decision tree:**

The actual production deploy target is OUT-OF-REPO per §0.2 caveat. **Step Zero of B-α scoping execution (Task 9.3 implementation altitude) MUST be**: confirm current deploy infrastructure with the infra owner. Possible outcomes:

| Scenario | Implication for B-α decision tree |
|---|---|
| **A.** Existing deploy is already on a CDN-edge-capable platform (e.g., Vercel + Edge Functions configured) | Decision tree COLLAPSES to "does the existing platform support edge-cache for the Branch-3 spinner shell + what config is needed to enable it?" Skip §3.1-§3.5 platform comparison. |
| **B.** Existing deploy is on a Node.js-runtime platform without edge-cache config (e.g., Vercel Serverless / Heroku / Render / Railway) | Decision tree partially collapses. Evaluate "can we enable edge-cache on the existing platform?" If yes, prefer continuity over platform migration. |
| **C.** Existing deploy is on a non-Node.js-edge platform (e.g., classic AWS EC2 + ALB) | Decision tree applies fully. §3.1-§3.5 platform recommendation drives migration scope at Task 9.X. |
| **D.** Greenfield (no production deploy yet) | Decision tree applies fully + can recommend optimal platform without migration friction. |

**Verdict-candidate at this scoping altitude:** WITHOUT knowing the current platform, the §3 recommendation is CONDITIONAL. Cowork verdict needed on (a) which scenario applies + (b) IF migration is acceptable for B-α gate-crossing potential.

### §3.1 Vercel (Edge Functions + Edge Runtime + Hosting)

**Capability claim (HYPOTHESIS — not verified at this scoping altitude):**
- Native React Router v7 framework-mode adapter exists per Vercel docs
- Edge Functions support per-request rendering at global edge POPs
- Built-in CDN with `s-maxage` + `stale-while-revalidate` cache primitives
- Supports both Node.js runtime (for full @react-router/serve) and Edge Runtime (V8-isolate; subset of Node API)

**Compatibility with `@react-router/serve`:**
- Node.js Runtime path: drop-in (verified runtime compat in repo's smoke-test); standard SSR delivery; edge cache opt-in via Cache-Control headers
- Edge Runtime path: REQUIRES rewriting any Node-specific APIs (fs, child_process, etc.); `@react-router/serve`'s dependencies may need audit (HYPOTHESIS — not verified)

**Pricing model (HYPOTHESIS):** per-request + bandwidth tiers; free hobby tier sufficient for POC; production deployments need Pro plan.

**Pros:** lowest-friction onboarding; native RR v7 framework-mode adapter; visible perf-improvement case studies for similar React + SSR setups.
**Cons:** vendor lock-in; pricing scales with traffic; Edge Runtime constraints if full @react-router/serve doesn't run on Edge Runtime.

### §3.2 Cloudflare Workers (Workers + Pages + Workers KV)

**Capability claim (HYPOTHESIS):**
- V8 isolates at global edge POPs (~300 worldwide)
- Workers Pages supports React framework deployments via `@cloudflare/pages-plugin-vite-react-router` (HYPOTHESIS — exact plugin name + RR v7 compat needs verification)
- Workers KV + Cache API for storage; standard `Cache-Control` honored
- NO direct Node.js runtime; requires node:* polyfills via compatibility flags

**Compatibility with `@react-router/serve`:**
- `@react-router/serve` is a Node.js HTTP server — DOES NOT run natively on Workers V8 isolates
- Migration path: rewrite SSR delivery using Workers-native `fetch` handler + RR v7's lower-level `createRequestHandler` API
- Substantial architectural delta from current `@react-router/serve` integration

**Pricing model (HYPOTHESIS):** Workers free tier 100K requests/day; paid tier per-request + CPU time; Workers KV reads/writes priced separately.

**Pros:** lowest latency at global edge POPs (Workers run at every POP); aggressive free tier; mature edge-cache primitives (Cache API).
**Cons:** highest architectural delta from `@react-router/serve` Node runtime; rewrite scope at Task 9.X if migrated; CPU time limits per request (~10-50 ms CPU; SSR may exceed); HYPOTHESIS-heavy compatibility claim.

### §3.3 AWS Lambda@Edge + CloudFront

**Capability claim (HYPOTHESIS):**
- Node.js runtime (18+) at CloudFront edge locations (~~400+ POPs)
- Lambda@Edge functions trigger at CloudFront events (viewer-request / origin-request / origin-response / viewer-response)
- Standard CloudFront edge cache with `Cache-Control` honored

**Compatibility with `@react-router/serve`:**
- Node.js runtime supports @react-router/serve in principle (HYPOTHESIS — Lambda@Edge function size limits + cold-start performance need verification)
- Lambda@Edge function size limit (5 MB) may not fit full @react-router/serve + RR v7 framework + app bundle (HYPOTHESIS — bundle size at HEAD-post-8.11 needs measurement)
- Migration path: package `@react-router/serve` SSR handler as Lambda@Edge function + configure CloudFront cache behaviors

**Pricing model (HYPOTHESIS):** per-invocation + duration + bandwidth; CloudFront edge cache pricing separate; potentially most expensive of the 3 candidates at scale.

**Pros:** AWS-ecosystem-aligned (if existing infra is AWS); long-running edge POPs (no cold isolate eviction like Workers); fine-grained CloudFront cache control.
**Cons:** highest setup complexity; bundle-size constraint risk; coldest-cache-start of the 3 candidates; pricing complexity.

### §3.4 Compatibility matrix — `@react-router/serve` runtime support

| Platform | Node.js Runtime | Edge Runtime / V8 Isolate | Bundle Size Cap | Cold Start |
|---|---|---|---|---|
| Vercel Node Runtime | ✅ Native | n/a | ~250 MB (HYPOTHESIS) | ~100-500 ms (HYPOTHESIS) |
| Vercel Edge Runtime | ❌ | ⚠️ Polyfills needed | ~1 MB (HYPOTHESIS) | ~5-50 ms (HYPOTHESIS) |
| Cloudflare Workers | ❌ | ⚠️ Rewrite required | ~10 MB (HYPOTHESIS) | ~1-10 ms (HYPOTHESIS) |
| AWS Lambda@Edge | ✅ Native | n/a | ~5 MB hard cap (HYPOTHESIS) | ~100-1000 ms (HYPOTHESIS) |

**All bundle size + cold-start claims labeled HYPOTHESIS** — empirical verification at POC altitude (Task 9.3).

### §3.5 Platform decision criteria + verdict-candidate

**Decision criteria (weighted):**

| Criterion | Weight | Vercel Node | Cloudflare Workers | AWS Lambda@Edge |
|---|---|---|---|---|
| `@react-router/serve` compat | HIGH | ✅ drop-in | ❌ rewrite | ⚠️ size-risk |
| Architectural delta from current | HIGH | LOW | HIGH | MEDIUM |
| Edge POP coverage | MEDIUM | ~global (Vercel POPs) | best (Workers POPs) | best (CloudFront) |
| Setup complexity for POC | HIGH | LOW | MEDIUM | HIGH |
| Pricing for low-volume POC | MEDIUM | free hobby | free tier | per-invocation |
| Auth-cookie handling at edge | MEDIUM | needs verification | Workers KV native | Lambda@Edge events |
| LCP reduction projection | HIGH | sufficient for gate-crossing | best (fastest cold start) | sufficient |

**🎯 RECOMMENDED PLATFORM verdict-candidate: Vercel (Node Runtime path) for POC** — IF §3.0 verification reveals scenario A (already on Vercel) OR scenario D (greenfield). Rationale:
1. **Lowest architectural delta** — `@react-router/serve` runs drop-in on Vercel Node Runtime; current production-deps placement at `package.json` flows through unchanged
2. **Lowest setup complexity** — Vercel's RR v7 framework-mode adapter handles SSR + edge-cache integration with minimal config
3. **Sufficient LCP reduction potential** — Vercel's edge cache primitives (`Cache-Control: public, s-maxage=300, stale-while-revalidate=600`) are sufficient for the unauth'd-spinner-shell cache scenario
4. **Free hobby tier sufficient for POC validation** — empirical FCP + LCP measurement before committing to paid tier
5. **Smallest migration scope** — IF scenario A (already on Vercel), POC scope reduces to "add edge-cache headers + verify FCP reduction"

**🎯 Alternative recommendation IF scenarios B or C (existing platform requires evaluation):**
- IF scenario B (Node.js platform without edge-cache config): evaluate whether the existing platform supports edge-cache enablement (e.g., Render → Cloudflare in front; Heroku → Fastly in front); prefer enabling over migrating
- IF scenario C (non-Node.js-edge platform): Vercel still recommended as migration target on architectural-delta grounds; Cloudflare Workers recommended IF the team has appetite for the rewrite + sub-10ms-cold-start is critical

**Cowork verdict needed at §7 before POC implementation.**

---

## §4. Cache-key discipline

### §4.1 Unauth'd path — full-page edge cache (vary by nothing)

**Hypothesis:** unauth'd users requesting `/` (or any non-`/security` route) see the AuthGate spinner shell at server-rendered first paint. This shell is BIT-IDENTICAL across unauth'd users (no user-data injection). Therefore: cacheable at edge with `Cache-Control: public, s-maxage=<TTL>` and vary by NOTHING.

**Cache headers candidate:** `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` (5-minute fresh + 10-minute background revalidation).

**Verified vs assumed:**
- VERIFIED: AuthGate Branch 3 spinner shell is bit-identical (App.tsx:37-55; no user-data injection)
- VERIFIED: smoke-test pre-hydration HTML = 5,949 B
- ASSUMED: empirical FCP improvement on edge-cache HIT (~300 ms theoretical floor) — needs POC verification

### §4.2 Auth'd path — bypass cache (cookie-based)

**Hypothesis:** auth'd users present a session cookie (e.g., `dwellium-auth-token` or similar — actual cookie name needs verification at UserContext source). Cookie presence → cache MISS at edge → request flows to origin (`@react-router/serve` Node runtime) → user-specific render.

**Cache-key strategy:** edge rules:
- IF `Cookie` header contains auth token → bypass cache + proxy to origin
- IF `Cookie` header absent (or no auth token) → cache lookup + serve cached spinner shell if HIT + cache MISS triggers origin fetch + cache write

**Verified vs assumed:**
- VERIFIED: UserContext post-Task-8.9 uses tokenStore via `useSyncExternalStore`; client-side `localStorage` for token persistence (UserContext.tsx)
- ASSUMED: server-side cookie-based auth detection is feasible at edge (CRITICAL HYPOTHESIS — actual cookie vs localStorage mechanism needs source-provenance verification at Task 9.3 PRE0)

### §4.3 Split-cache architecture

For routes where SOME users see user-specific content (auth'd) and OTHERS see generic content (unauth'd), use the split-cache pattern:

```
                  ┌──────────────────────────────────────┐
GET /  ──────►   │ Edge cache (vary by auth-cookie-presence) │
                  ├──────────────────────────────────────┤
                  │ unauth (no token)   │ auth (token)   │
                  │ ↓ cached spinner    │ ↓ bypass cache │
                  │ ↓ ~300 ms LCP      │ ↓ origin render│
                  └──────────────────────────────────────┘
```

**Cache rules:**
1. unauth path: cache-key = `(path, method)`; vary by NOTHING
2. auth path: cache-key irrelevant (bypass entirely)
3. detection: presence-of-cookie at edge before cache lookup

### §4.4 Invalidation discipline (deploy hooks + selective purge)

**Deploy-time invalidation:** every deploy MUST invalidate cached spinner shell (since shell can change between deploys — color tweaks, copy changes, etc.). Mechanisms:
- Vercel: automatic purge on deploy via build-output content-hashing
- Cloudflare: explicit `purge_everything` API call in CI deploy step
- AWS CloudFront: explicit `CreateInvalidation` API call

**Selective purge (post-incident):** if a content bug ships and edge-cached shell is wrong, purge specific cache-key without invalidating everything. Per-platform tooling.

**Failure mode:** stale shell served for full TTL window post-deploy if invalidation fails. Mitigation: `stale-while-revalidate` minimizes stale-period.

---

## §5. LCP projection model (empirical-grounded; PROJECTIONS labeled)

### §5.1 Cluster A scenario (FCP-coincident; edge cache HIT)

**Baseline (verified at HEAD-post-8.11):** Cluster A LCP = FCP ≈ 1,953 ms (2 of 10 runs / 20%).

**Post-B-α projection (HYPOTHESIS):**
- Edge cache HIT → FCP reduced from 1,953 ms to ~300 ms (HYPOTHESIS; theoretical floor based on edge POP latency 30-100 ms + initial-paint ~200 ms)
- Cluster A LCP = FCP → LCP ~300 ms = **GATE-CROSSING ≤500 ms target** (assuming projection floor holds)

**Sensitivity analysis (HYPOTHESIS):**
- IF actual cache HIT FCP = 200 ms (favorable): Cluster A LCP ~200 ms (well under gate)
- IF actual cache HIT FCP = 500 ms (unfavorable): Cluster A LCP ~500 ms (just at gate)
- IF actual cache HIT FCP = 800 ms (poor edge performance): Cluster A LCP ~800 ms (over gate)

### §5.2 Cluster B scenario (post-hydration; edge cache HIT)

**Baseline (verified):** Cluster B LCP = FCP + ~770 ms hydration cascade ≈ 2,724 ms (8 of 10 runs / 80%).

**Post-B-α projection (HYPOTHESIS):**
- Edge cache HIT → FCP reduced to ~300 ms (same projection as Cluster A)
- Hydration cascade still adds ~770 ms (assumes edge-cache doesn't accelerate hydration JS delivery — HYPOTHESIS that may understate B-α benefit)
- Cluster B LCP = ~300 + ~770 = ~1,070 ms = **NON-GATE-CROSSING** but materially advanced (was 2,724 ms; now ~1,070 ms = ~61% reduction)

**Sensitivity analysis (HYPOTHESIS):**
- IF edge-cache ALSO accelerates JS chunk delivery (likely if static asset paths cached separately): hydration cascade could compress to ~400 ms → Cluster B LCP ~700 ms
- IF hydration cascade is server-render-dependent (e.g., RSC streaming): Cluster B may compress further

### §5.3 Combined model — projected LCP distribution post-B-α

**HYPOTHESIS-ONLY projections; require POC empirical verification:**

| Scenario | Cluster A LCP | Cluster B LCP | Gate-crossing per run | Gate-crossing % overall |
|---|---|---|---|---|
| Baseline (HEAD-post-8.11; VERIFIED) | ~1,953 ms | ~2,724 ms | 0% (no runs cross gate) | 0% |
| Post-B-α best case (FCP 200 ms; hydration accel) | ~200 ms | ~600 ms | Cluster A (20%) + partial B (some <500 ms) | ~30-40% |
| Post-B-α expected case (FCP 300 ms; standard hydration) | ~300 ms | ~1,070 ms | Cluster A only (20%) | ~20% |
| Post-B-α worst case (FCP 500 ms; no hydration accel) | ~500 ms | ~1,270 ms | Cluster A marginally (~20%) | ~10-20% |

### §5.4 Gate-crossing probability verdict

**🎯 Gate-crossing verdict at this scoping altitude:** B-α offers **20-40% gate-crossing probability per measurement run** (vs current 0%). For median-LCP gate measurement at n=10, this likely yields **median LCP in the 500-1,200 ms range** — NOT a clean gate-crossing but a **substantial advance** from 2,724 ms baseline.

**Caveat:** projections are HYPOTHESIS-ONLY at this scoping altitude. POC empirical verification is the recommended next step (§7.3) BEFORE declaring gate-crossing achieved.

**Implication for v1 L228 disposition:** B-α alone unlikely to FULLY cross the gate on median. Likely Phase-9+ outcome (per current projections):
- Best case: median LCP ~600-1,000 ms = Framing (b) PARTIAL-MET strongly continued (further reduction from 2,724 ms)
- Expected case: median LCP ~1,000-1,500 ms = Framing (b) PARTIAL-MET continues
- Worst case: median LCP ~1,500-2,000 ms = Framing (b) PARTIAL-MET marginally continues

In NO projected case does B-α alone empirically validate Framing (a) STRUCTURALLY UNATTAINABLE. Phase-9+ Block B B-γ (island-hydration) likely needed for additional gap-closure if pursuing gate-crossing aggressively.

---

## §6. Risks + open questions

### §6.1 Deploy-platform lock-in

**Risk:** committing to a specific CDN-edge platform creates vendor lock-in. Migration cost between platforms is non-trivial (different deploy mechanisms, edge cache primitives, runtime constraints).

**Mitigation:** POC at recommended platform (Vercel) first; defer full-platform commitment to post-POC verdict. IF POC verifies projections, full-commit makes sense; IF POC refutes, evaluate alternative platform OR alternative lever (B-β / B-γ).

### §6.2 Edge runtime constraints

**Risk:** Edge Runtimes (Vercel Edge / Cloudflare Workers) have subset-of-Node-API constraints. `@react-router/serve` dependencies may include Node-specific APIs (fs, child_process, native bindings) incompatible with V8 isolates.

**Mitigation:** stay on Node Runtime path for POC (Vercel Node Runtime). Defer Edge Runtime evaluation until Node Runtime POC proven.

### §6.3 Cache invalidation failure modes

**Risk:** stale spinner shell served for full TTL window if invalidation fails post-deploy. User-facing impact: minor (stale colors, copy, or animation) but visually-noticeable.

**Mitigation:** `stale-while-revalidate` cache directive minimizes stale-period. Monitor CI deploy step for invalidation API success. Manual purge fallback for incident response.

### §6.4 Auth flow + cookie-handling at edge

**Risk:** if auth mechanism is LOCALSTORAGE-only (not cookie), edge cannot detect auth status server-side → cannot apply cache rules correctly. Current UserContext post-Task-8.9 uses tokenStore via `useSyncExternalStore` + `localStorage` — needs source-provenance verification of cookie vs localStorage at server-readable altitude.

**Mitigation:** investigate at Task 9.3 PRE0 whether auth token is cookie-readable at server. IF localStorage-only: requires migration to cookie-based auth (architectural delta beyond B-α scope) OR cache-bypass-everything (no edge cache benefit for auth'd users — fine if unauth'd path is the primary edge-cache target).

**Verified at Task 9.2 PRE0 (partial):**
- UserContext.tsx:73 uses tokenStore via useSyncExternalStore (server-snapshot returns null)
- localStorage is the client-side persistence mechanism (verified via Phase-8+ Task 8.9 SSR-remediation arc)
- Cookie-based auth at server-readable altitude: NOT VERIFIED at this scoping altitude — Task 9.3 PRE0 critical path

### §6.5 Cost considerations (HYPOTHESIS pricing)

**Risk:** edge-cache infrastructure adds cost; per-request pricing scales with traffic.

**Cost projection (HYPOTHESIS):**
- POC: free tier sufficient (Vercel hobby; Cloudflare free tier; AWS free tier)
- Production at moderate scale (~100K req/day): Vercel Pro $20/month; Cloudflare Workers ~$5/month; AWS Lambda@Edge ~$10-50/month (HYPOTHESIS)
- Production at scale (~1M req/day): Vercel team plans ~$100+/month; Cloudflare Workers ~$50+/month; AWS Lambda@Edge ~$100-500/month (HYPOTHESIS)

**Mitigation:** POC at free tier first; commit to paid tier only post-POC verdict.

### §6.6 Local dev parity

**Risk:** edge-cache behavior not testable in local dev (no edge POPs locally); CI dev-environment parity question.

**Mitigation:** use platform-specific local-dev tooling (Vercel CLI `vercel dev`; Wrangler `wrangler dev` for Cloudflare; SAM Local for AWS Lambda@Edge). Local-dev parity is imperfect but sufficient for smoke-test-altitude verification.

### §6.7 Hydration race conditions at edge

**Risk:** if edge serves a cached spinner shell but client-side JS loads/hydrates with different state (e.g., user already authed from cookie), hydration mismatch could fire. Phase-8+ Task 8.11 cemented Finding EE (AuthGate hydration-flash); B-α may amplify if edge-cache delivers spinner to a user who's already authenticated.

**Mitigation:** investigate whether edge can detect auth status (cookie-based) BEFORE serving cached shell. IF auth detected at edge → bypass cache (per §4.2). IF auth detection at edge is infeasible → accept hydration-flash trade-off OR pursue Block A A2 (Suspense at AuthGate) IN PARALLEL with B-α to eliminate hydration mismatch.

### §6.8 Interaction with Block B B-γ (island-hydration)

**Open question:** if B-γ island-hydration is later scoped + implemented, does B-α edge-cache benefit STACK with B-γ benefit, or are they architecturally exclusive?

**Hypothesis:** they stack. Edge-cache reduces FCP (B-α benefit); island-hydration eliminates Cluster B post-hydration cascade (B-γ benefit). Combined: Cluster A and Cluster B converge at ~300 ms LCP = both gate-crossing.

**Caveat:** HYPOTHESIS-ONLY; needs verification when B-γ scoped at Task 9.X.

---

## §7. Cowork decision gate

### §7.0 🎯 Cowork ratification (2026-05-21) — Decision points LOCKED

This scoping doc was ratified by Cowork at 2026-05-21 with the following 5 LOCKS:

| # | Decision | LOCK |
|---|---|---|
| **#1** | §3.5 + §7.1 platform recommendation | **Vercel (Node Runtime path) RATIFIED** — CONDITIONAL on §3.0 deploy-target verification (A/B/C/D scenario resolves at Task 9.3 PRE0) |
| **#2** | §7.2 cache-key strategy | **Cookie-presence split-cache RATIFIED** — unauth'd → full edge cache; auth'd → bypass |
| **#3** | §7.3 POC scope | **POC-1 through POC-6 RATIFIED** |
| **#4** | §7.5 B-α + B-γ stacking | **B-α POC FIRST (Ilya verdict)** — empirical edge-cache data BEFORE B-γ scoping; reassess B-γ stacking at POC-6 decision gate; **B-γ scoping DEFERRED to post-POC-empirical-data** (NOT scoped now) |
| **#5** | §7.4 Task 9.3 OPENING class designation | **DEFERRED to Task 9.3 PRE0** per anchor-bias discipline — deliverable shape isn't determined until §3.0 + POC-1 resolve at Task 9.3 PRE0 |

**Phase-9+ scope cementation at this ratification:** Task 9.2 ships the B-α scoping doc + ratified locks. Task 9.3 = B-α POC (per §7.3); class designation deferred to Task 9.3 PRE0. **B-α POC is the next substantive Phase-9+ workstream; B-γ island-hydration HOLDS at scope-pending pending POC-6 empirical verdict.**

### §7.1 Recommended platform (CONDITIONAL on §3.0 verification)

**🎯 RECOMMENDED PLATFORM: Vercel (Node Runtime path)** — CONDITIONAL on §3.0 deploy-target verification.

| §3.0 scenario | Platform recommendation |
|---|---|
| A (already on Vercel) | Vercel — no migration; add edge-cache config |
| B (Node.js platform without edge-cache; e.g., Render/Heroku/Railway) | Evaluate enabling edge-cache on existing platform first (Cloudflare in front / Fastly in front); fallback to Vercel migration if not feasible |
| C (non-Node.js-edge platform) | Vercel — migration justified for B-α gate-crossing potential |
| D (greenfield) | Vercel — lowest setup complexity for POC |

Alternative: **Cloudflare Workers** IF (a) team has rewrite appetite (Workers V8 isolate vs Node.js delta is substantial) + (b) sub-10ms-cold-start is critical (likely not for our 1,953 ms FCP baseline).

### §7.2 Recommended cache-key strategy

**🎯 Cache-key strategy: cookie-presence-detection at edge with split-cache architecture (§4.3).**

- Unauth'd path: full-page edge cache; `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`
- Auth'd path: bypass cache; proxy to origin (`@react-router/serve` Node runtime)
- Detection: edge function inspects `Cookie` header for auth token presence; bypass if present

**CONDITIONAL on §6.4 verification:** if auth token is NOT cookie-readable at server (currently localStorage-only at HEAD-post-8.11), this strategy is INFEASIBLE without architectural change. Task 9.3 PRE0 MUST verify cookie-vs-localStorage at server-readable altitude.

### §7.3 Recommended POC scope (small-scale empirical test before full migration)

**🎯 POC SCOPE proposal (for Cowork verdict before Task 9.3 implementation):**

| POC step | Deliverable | Acceptance gate |
|---|---|---|
| **POC-1** | Source-provenance verification at Task 9.3 PRE0 — auth token cookie vs localStorage at server | Cookie-based auth detection feasible at edge (IF localStorage-only: POC pivots to unauth-only edge-cache) |
| **POC-2** | Deploy current `@react-router/serve` build to Vercel POC project (free tier) | Successful deploy; smoke-test passes against POC URL |
| **POC-3** | Configure edge-cache headers for unauth'd path; verify cache HIT/MISS via `x-vercel-cache` response header | Cache HIT achievable; cache TTL behavior matches §4 spec |
| **POC-4** | n=10 Lighthouse run against POC URL (sister-shape to Phase-8+ Task 8.12 protocol) — measure FCP + LCP distribution post-edge-cache | FCP reduction empirical (target: ≤500 ms FCP on cache HIT runs) |
| **POC-5** | Compare cluster A vs B proportions vs Phase-8+ 8.12 baseline | Empirical cluster shift quantified |
| **POC-6** | Decision gate: B-α full-migration vs B-α-with-modifications vs B-α abandon | Empirical FCP + LCP data informs verdict |

**POC duration projection: ~5-10 days** (HYPOTHESIS; informational only per OQ-4 LOCK no-hard-lock).

**POC-success criterion:** ≥20% gate-crossing per-run rate (matching Cluster A baseline 20% but at sub-500 ms LCP). **POC-refutation criterion:** <10% gate-crossing per-run rate at projected platform settings.

### §7.4 IF Cowork ratifies — Task 9.3 OPENING projection

**Task 9.3 candidate scope (post-Cowork-verdict):** B-α POC implementation per §7.3.

**Task 9.3 candidate class:**
- IF POC delivers production-source touches (Vercel adapter config, edge function code, Cache-Control headers): NEW class candidate `EDGE-CACHE-POC` (sister-shape candidate to FRAMEWORK-INSTALLATION at architectural-installation altitude)
- IF POC stays at SCOPING-and-config-only (Vercel config files + measurement script): SCOPING-ONLY 7pt → 8pt extension OR MEASUREMENT-ONLY 10pt → 11pt extension
- Cowork verdict needed on which classification at Task 9.3 PRE0

**Task 9.3 OQ at OPENING:** which platform for POC (Vercel default per §7.1; alternatives if §3.0 verification surfaces different scenario)? Authoring lock at Task 9.3 PRE0.

### §7.5 Cowork verdict-pending items

This doc HALTS for Cowork verdict on:

1. **§7.1 platform recommendation** — Vercel (recommended) OR Cloudflare Workers OR AWS Lambda@Edge OR existing-platform-evaluation (per §3.0 scenario)
2. **§7.2 cache-key strategy** — cookie-presence-detection with split-cache (recommended) OR alternative
3. **§7.3 POC scope** — POC-1 through POC-6 (recommended) OR modified shape OR full-skip-to-implementation
4. **B-α gate-crossing expectation calibration** — given §5.4 verdict that B-α alone unlikely to fully cross gate on median, is the partial-MET trajectory continuation sufficient OR is stacking with B-γ from the start preferred (parallel-scope vs sequential)?

---

## §8. Carry-forward + interactions with B-β / B-γ levers

### §8.1 Interactions with B-β (HTTP/3 + Early Hints)

**Hypothesis:** B-α + B-β stack additively. B-α reduces FCP via edge-cache; B-β reduces connection-establishment latency via QUIC. Combined: FCP could drop further (e.g., from B-α-only ~300 ms to B-α+B-β ~150 ms).

**Caveat:** HTTP/3 support depends on deploy platform (Vercel + Cloudflare + AWS CloudFront all support HTTP/3 per HYPOTHESIS). B-α platform recommendation (Vercel) is HTTP/3-ready by HYPOTHESIS — B-β may be effectively-free if B-α ships first.

### §8.2 Interactions with B-γ (island-hydration)

**Hypothesis:** B-α + B-γ stack additively for Cluster B. B-α reduces FCP (Cluster A + Cluster B both benefit); B-γ eliminates hydration cascade (Cluster B specifically benefits — converges with Cluster A). Combined: median LCP could drop to ~300-500 ms = **GATE-CROSSING with high probability**.

**Caveat:** B-γ is most architecturally substantive lever; requires per-route-component classification (interactive vs display-only). Scope-cost is significant.

**Stacking recommendation:** if B-α POC verifies projections (§7.3 POC-success criterion), Phase-9+ may schedule B-γ as Task 9.X (post-Task-9.3 B-α) for additional gap-closure. IF B-α POC refutes, B-γ becomes the next-priority lever to attempt gate-crossing.

### §8.3 Interactions with Block A A2 (Suspense at AuthGate)

**Hypothesis:** B-α + A2 are architecturally complementary at hydration-flash altitude. B-α reduces FCP; A2 eliminates hydration-flash (the 1 spinner-to-final-view transition per Phase-8+ Task 8.11 Finding EE). Combined: smoother user-perceived loading + reduced LCP variance.

**Caveat:** A2 is FLAGGED B-γ-adjacent per OQ-2 LOCK; if B-γ scoped, A2 may be subsumed. IF B-α POC reveals hydration-flash is amplified at edge-cache HIT (per §6.7 hydration race risk), A2 may need to ship IN PARALLEL with B-α.

---

## §9. Sister-shape precedent + class designation cementation

### §9.1 Sister-shape precedent — Phase-8+ Task 8.1 SCOPING-ONLY OPENER

This doc is sister-shape to `Docs/Phase8_SSR_Architectural_Scoping.md` at architectural-axis-scoping altitude:

| Dimension | Phase-8+ Task 8.1 | Phase-9+ Task 9.2 (this doc) |
|---|---|---|
| Architectural axis | SSR runtime (SPA → SSR migration) | CDN-edge delivery (Node-runtime → edge-cache) |
| Class | SCOPING-ONLY 1pt (introduction) | SCOPING-ONLY 6pt → 7pt CROSS-PHASE-BOUNDARY-SHAPE-CONTINUATION |
| Sub-shape | (1) forward-scoping-roadmap | (7) architectural-axis-shift-scoping-CDN-edge-deploy-platform-decision-tree |
| Deliverable shape | Architectural inventory + framework decision tree + qualitative projections + roadmap + risks/OQs + Cowork decision gate | IDENTICAL shape (sister-shape) |
| Production source touched | ZERO | ZERO |
| Vitest delta | +0 | +0 |
| Doc location | `Docs/Phase8_SSR_Architectural_Scoping.md` | `Docs/Phase9_Task_9_2_CDN_Edge_Scoping.md` |

### §9.2 Class designation cementation

**🎯 SCOPING-ONLY 6pt → 7pt CROSS-PHASE-BOUNDARY-SHAPE-CONTINUATION extension** per Cowork Decision-(b) LOCK at Phase-9+ Task 9.2 PRE0.

Calibration trajectory (CLAUDE.md Calibration-classes block aligned):

| Calibration | Task | Sub-shape |
|:--|:--|:--|
| 1pt | 8.1 | forward-scoping-roadmap |
| 2pt | 8.3 | provider-tree-audit |
| 3pt | 8.5 | NO-extraction-empirical-refutation |
| 4pt | 8.8 | per-route-SSR-opt-out-INFEASIBLE |
| 5pt | 8.13 | perf-lever-stacking-EXHAUSTED |
| 6pt CROSS-PHASE-BOUNDARY | 9.1 | cross-phase-boundary-kickoff-with-stakeholder-decision-resolution |
| **7pt CROSS-PHASE-BOUNDARY-SHAPE-CONTINUATION** | **9.2** | **architectural-axis-shift-scoping-CDN-edge-deploy-platform-decision-tree** |

**🎯 SCOPING-ONLY now highest cross-phase-distributed class in project** (Phase-8+ 5pt + Phase-9+ 2pt at HEAD-post-9.2-PRE0). MEASUREMENT-ONLY 10pt cross-phase remains higher in absolute count but lacks the cross-phase-distributed sub-shape diversity.

**Rationale for NOT spawning NEW class:**
1. Deliverable shape matches SCOPING-ONLY definition exactly (forward-scoping + zero production source + decision-tree + qualitative projections + risks/OQs + Cowork gate)
2. Sister-shape precedent: Phase-8+ Task 8.13 perf-lever-refutation also stayed SCOPING-ONLY rather than spawning a class
3. Phase-9+ standing convention: extend existing classes by adding sub-shapes; introduce NEW classes only when deliverable shape is structurally novel

---

## §10. Recursive-validation discipline summary

Per P2 cross-phase standing convention (Phase-9+ Task 9.1 OPENER cementation), this doc applies recursive-validation throughout:

| Claim category | Label | Source |
|---|---|---|
| AuthGate Branch 3 spinner shell composition | **VERIFIED** | `qualia-shell/src/App.tsx:33-78` (read at Task 9.2 PRE0) |
| `@react-router/serve` production runtime | **VERIFIED with nuance** | `qualia-shell/package.json:24` + smoke-test spawning + playwright webServer; nuance: actual deploy-target runtime out-of-repo |
| 2,724 ms LCP median + 1,953 ms FCP median | **VERIFIED** | `Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json` `rootStats.metrics` |
| Bimodal LCP cluster A vs B (20%/80%) | **VERIFIED via empirical refinement** | n=10 raw runs in Task 8.12 capture JSON enumerated at Task 9.2 PRE0 |
| Auth token = localStorage at HEAD-post-8.11 | **VERIFIED via Phase-8+ Task 8.9 SSR-remediation** | UserContext.tsx:73-74 (read at Task 9.2 PRE0) |
| Auth token cookie-readable at server | **NOT VERIFIED** (HYPOTHESIS — Task 9.3 PRE0 critical path) | Requires server-readable auth-detection investigation |
| Vercel Edge Functions support per-request rendering | **HYPOTHESIS** (per Vercel public docs assertion only) | Needs POC empirical verification |
| Cloudflare Workers V8 isolate compatibility with `@react-router/serve` | **HYPOTHESIS** (architectural rewrite likely required) | Needs POC empirical verification |
| AWS Lambda@Edge 5 MB bundle-size hard cap | **HYPOTHESIS** | Needs POC empirical verification |
| FCP reduction from 1,953 ms → ~300 ms on edge-cache HIT | **HYPOTHESIS** (theoretical floor) | Needs POC empirical verification (POC-4) |
| Cluster A LCP gate-crossing post-B-α | **HYPOTHESIS** | Needs POC empirical verification (POC-5) |
| All pricing claims | **HYPOTHESIS** | Needs out-of-band verification with platform docs at Task 9.3 PRE0 |
| HTTP/3 support claims (per platform) | **HYPOTHESIS** | Needs B-β scoping verification at Task 9.X |

**Discipline applied:** every load-bearing claim is labeled verified-vs-hypothesis. POC verification at Task 9.3 implementation altitude is the formal mechanism to convert HYPOTHESIS labels → VERIFIED labels.

---

**Phase-9+ Task 9.2 B-α CDN-Edge SCOPING-ONLY draft LOCKED at this doc.** HALT for Cowork verdict on:
1. §7.1 platform recommendation ratification (Vercel default)
2. §7.2 cache-key strategy ratification
3. §7.3 POC scope ratification
4. §7.5 B-α + B-γ stacking expectation calibration
5. Task 9.3 OPENING class designation (per §7.4 candidates)

ZERO production source touched. Doc-only. Paths-filter auto-fire EXPECTED ABSENT.

🎯
