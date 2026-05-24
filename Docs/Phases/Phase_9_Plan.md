# Phase 9+ Plan — Kickoff Brief

**Status.** **Phase-9+ Task 9.1 OPENER MERGED via PR #85 at `d70f18d` 2026-05-21**; Cowork OQ-1 through OQ-5 LOCKED at Phase-9+ Task 9.2 OPENING (this commit). Phase-9+ R OPEN at Task 9.2 (B-α CDN-edge SCOPING-ONLY active at branch `feat/phase-9-task-9.2-cdn-edge-scoping`).
**Created.** 2026-05-21 (stub) — Phase-8+ Task 8.15 publishing handoff per Cowork Q3 LOCK Option (i).
**Expanded.** 2026-05-21 (full brief) — Phase-9+ Task 9.1 OPENER per Cowork Q1-Q4 LOCK at PRE0 ledger.
**Phase-9+ disposition.** **🔴 RE-RATIFIED (a) STRUCTURALLY UNATTAINABLE per Ilya-lock 2026-05-23** (Task 9.3 close; supersedes 2026-05-21 (b) PARTIAL-MET lock; see §2). Engineering-judgment disposition (NOT mathematical impossibility-proof): best LCP ~2,724 ms at Phase-8+ Task 8.12 = 5.4× over the 500 ms gate; Phase-9+ Block-B levers B-α + B-γ empirically refuted (Task 9.3 POC + attribution); residual LCP = FCP-dominant + Lighthouse CSS-animation artifact. Crossing ≤500 ms would require fundamental re-architecture (separate static/SSR landing replacing SPA shell), OUT OF v1 SCOPE. (b) PARTIAL-MET RETAINED as progress-record (4,653 → 2,724 ms, −41% cumulative). **Phase-9+ Block-B LCP-architectural-exploration arc CONCLUDED as documented negative result.** Remaining Phase-9+ scope = Block A (widget/provider polish) + Block C (housekeeping). No further LCP-gate-crossing levers pursued under v1.
**Phase-8+ closure cross-reference.** Full Phase-8+ closure narrative at `Docs/Phase8_Closure_Report.md` (488 lines / 88,075 B / ~86 KB; 3rd cross-phase CLOSURE-NARRATIVE-CONSOLIDATION data point). Phase-8+ FULLY CLOSED at Task 8.15 publishing-handoff (15 of 15 ✓; PRs #69-#76 + #78-#84; HEAD on main = `1f4b9c0`; 2026-05-16 → 2026-05-21).

> **🎯 Doc-wide terminology correction (Task 9.2 PRE0 per recursive-validation discipline P2 standing).** All references to "AuthGate (Branch 3)" in this doc are corrected to "AuthGate (Branch 3)". Prior "Branch 1" label was a category error per Phase-9+ Task 9.2 source-provenance verification — **Branch 1 is `/security` (SecurityRoute component; standalone viewport-fill; NO providers)**, NOT a sub-branch of AuthGate. **AuthGate is Branch 3** (default route; 3-provider tree Theme + User + Query). Code reference: `qualia-shell/src/App.tsx:80-90` SecurityRoute (Branch 1) + `qualia-shell/src/App.tsx:33-78` AuthGate function (Branch 3) + `qualia-shell/src/App.tsx:139-141` branch-routing comment block. The edge-cacheable claim is preserved in spirit (AuthGate non-user-specific spinner IS edge-cacheable) but applied to Branch 3, not Branch 1.

---

## §1. Phase-8+ → Phase-9+ carry-forward — 11 items in 3 blocks + 2 process improvements

Per Cowork Q2 LOCK at Phase-9+ kickoff verdict-lock. Empirically-verified item-count matches closer §8 enumeration (Block A 4 + Block B 2 + Block C 3 + Process improvements 2 = 11). Block B elevated from disposition-stub to PRIMARY workstream by Q1=(b) ratification.

### Block A — Widget + provider SSR polish (4 items; carry-forward continues)

| # | Item | Source | Phase-9+ disposition |
|--:|:--|:--|:--|
| A1 | **Finding II widget-altitude SSR audit** — `TranscriptionHub.tsx:376` `useState(() => window.SpeechRecognition)` + sweep for sibling widget-altitude init-time-UNSAFE patterns gated behind AuthGate (Branch 3) | Closer §7 Block A 1; Task 8.11 Q6 LOCK INFORMATIONAL deferred | Phase-9+ task candidate (post-9.1 OPENER); see §3 |
| A2 | **Finding EE Option β** — Suspense at AuthGate altitude (hydration-flash polish) | Closer §7 Block A 2; Task 8.11 Q2 LOCK Finding EE Option α cemented as PERMANENT baseline | Phase-9+ task candidate; **STAYS in Block A polish per OQ-2 LOCK** (FLAGGED B-γ-adjacent — re-evaluate when island-hydration scoped; island-hydration may subsume the Suspense-at-AuthGate work); see §3 |
| A3 | **Finding EE Option γ** — pre-hydration cookie infrastructure (sister to Option β; cookie-based instead of Suspense) | Closer §7 Block A 3 | Phase-9+ task candidate (post-9.1 OPENER); see §3 |
| A4 | **Finding KK** — LCP bimodal-at-server-vs-client-rendered-paint investigation (Cluster A FCP-coincident ~1,953 ms × 2 runs + Cluster B post-hydration ~2,255-2,802 ms × 8 runs at Task 8.12 n=10 capture) | Closer §7 Block A 4; Task 8.12 Finding KK | Phase-9+ measurement-investigation candidate (informational; could resolve structurally via Option β) |

### Block B — LCP architectural exploration (PRIMARY; 2 items elevated by Q1=(b))

| # | Item | Source | Phase-9+ disposition |
|--:|:--|:--|:--|
| B1 | **v1 L228 ≤500 ms LCP objective** — **🔴 RE-RATIFIED (a) STRUCTURALLY UNATTAINABLE per Ilya-lock 2026-05-23 at Task 9.3 close** (supersedes 2026-05-21 (b) PARTIAL-MET lock); Block-B architectural-exploration arc CONCLUDED as documented negative result; B-α + B-γ empirically refuted | Closer §6.2 + §7 Block B 1; original (b) Q1 LOCK at 2026-05-21; flipped to (a) at 2026-05-23 Ilya stakeholder decision per §2 | **CONCLUDED**; no further LCP-gate-crossing levers under v1 |
| B2 | **Perf-lever-exhaustion-confirmed baseline at React 19 + Vite 6 + RR v7 architecture** — Task 8.13 cemented 0-of-3 in-architecture candidates (SSR already-applied + per-route Vike-mode N/A-by-construction + asset-preload structurally-insufficient); any new lever requires architectural-axis shift | Closer §2 Signal (5) + §7 Block B 2; Task 8.13 Finding LL | **Substrate for §4 architectural-axis exploration**; see §4 |

### Block C — Project-wide housekeeping (3 items; pre-existing)

| # | Item | Source | Phase-9+ disposition |
|--:|:--|:--|:--|
| C1 | **Linux Playwright baselines** — 8 `*-chromium-linux.png` capture + commit + flip screenshot-baseline CI step `continue-on-error: false` BLOCKING; infrastructure laid at Phase-7 Task 7.4 (`capture-linux-baselines.yml` workflow_dispatch) | Closer §7 Block C 1; Phase-0 Exit Gate carry-forward via Phase-7 7.4/7.5/7.6 | Phase-9+ CI-architecture task candidate; see §5 |
| C2 | **`nebula-bg.mp4` 70.96 MB asset** — over GitHub's 100 MB soft limit; future push needs Git LFS, CDN, or smaller replacement | Closer §7 Block C 2; pre-existing CLAUDE.md carry-forward | Phase-9+ project-infrastructure task candidate; see §5 |
| C3 | **~7 untracked baseline JSON artifacts** — Phase-0 axe-baselines + Phase-6 6.7 perf capture | Closer §7 Block C 3; `Docs/Phase8_SSR_Architectural_Scoping.md §7.3` commit-recommendation | **🎯 RESOLVED at Phase-9+ Task 9.1 OPENER commit `5043587`**: 6 baseline JSONs (1 fewer than projected ~7) committed as historical baselines; total 8,572 B. Empirical-vs-projection drift candidate (sister to v2.60.1 cluster). |

### Process improvements for Phase-9+ PRE-FLIGHT discipline (2 items)

| # | Item | Source | Phase-9+ disposition |
|--:|:--|:--|:--|
| P1 | **v2.76.0 Cowork-directive-gate-citation-verification PRE-FLIGHT discipline** — rule: "At every task PRE0, empirically verify the Cowork directive's gate-citation against (i) Plan-row literal text + (ii) project-spec gate-of-record. Category errors at task-directive altitude are sister-shape to audit-content errors at v2.64.0 cluster altitude." | Closer §7 process item 1; Task 8.13 close NEW v2.76.0 | **PROMOTED as Phase-9+ standing PRE-FLIGHT discipline** at this 9.1 OPENER per Q2 LOCK process-improvements adoption; GR-15 amendment candidate v2.77.0 |
| P2 | **Recursive-validation discipline as cross-phase standing convention** — treat audit citations + Plan-row text + Cowork-directive gate-claims as STARTING-POINT-HYPOTHESES requiring empirical verification | Closer §2 Signal (3) + §7 process item 2 | **CEMENTED as Phase-8+ ↔ Phase-9+ cross-phase standing convention** at this 9.1 OPENER per Q2 LOCK |

---

## §2. v1 L228 ≤500 ms LCP verdict-record — **🔴 RE-RATIFIED (a) STRUCTURALLY UNATTAINABLE per Ilya-lock 2026-05-23** (supersedes 2026-05-21 (b)-lock)

**Status flip 2 (LATEST):** RATIFIED (b) PARTIAL-MET (2026-05-21) → **RE-RATIFIED (a) STRUCTURALLY UNATTAINABLE (2026-05-23 at Task 9.3 close)** per Ilya stakeholder decision. Supersedes the prior (b)-PARTIAL-MET primary disposition.

**Precise framing (verbatim per Cowork ship verdict-lock 2026-05-23):**

> "v1 L228 ≤500 ms LCP is STRUCTURALLY UNATTAINABLE within the current React 19 SPA-shell architecture. Empirical basis: best measured LCP ~2,724 ms (Phase-8 Task 8.12 localhost; −41% from the Phase-6 4,653 ms baseline) — still 5.4× over the 500 ms gate. Phase-9 Block-B architectural exploration empirically refuted the remaining candidate levers: B-α CDN-edge (−1.5% LCP; Task 9.3 POC) and B-γ island-hydration (TBT=0 → no JS-blocking cost to remove; Task 9.3 attribution). Residual LCP is dominated by FCP (JS bundle download/parse + first paint; Phase-7 lazy-load already exhausted) plus a Lighthouse CSS-animation artifact. Crossing ≤500 ms would require fundamental re-architecture (e.g. a separate truly-static / server-rendered real-content landing replacing the SPA shell at `/`), OUT OF v1 SCOPE. (b) PARTIAL-MET is retained as the record of progress achieved (4,653 → 2,724 ms, −41%); (a) is now the ratified primary disposition."

**Engineering-judgment disposition, NOT a mathematical impossibility-proof.** "Structurally unattainable" here means: NOT achievable within the current React 19 SPA-shell architecture + v1 scope + remaining empirically-falsified lever candidates. A different architecture (separate landing; Astro/Fresh-style islands; server-side templating) could theoretically cross the gate — but is OUT OF v1 SCOPE per Ilya 2026-05-23.

**Consequence:** Phase-9+ Block-B LCP-architectural-exploration arc is CONCLUDED as a documented negative result. Remaining Phase-9+ scope = Block A (widget/provider polish) + Block C (housekeeping). No further LCP-gate-crossing levers will be pursued under v1.

Per canonical DUAL-FRAMING narrative at `Docs/Phase8_Closure_Report.md §6.2` (frozen retrospective) + Phase-9+ Task 9.3 empirical evidence cemented at `Docs/Phase9_Task_9_3_POC_HandoffPackage.md §4`: cumulative −41% gap-closure trajectory (4,653 ms → 3,903 ms → 2,724 ms) RETAINED as substantive engineering progress (per (b) progress-record framing). The ≤500 ms target is no longer a live Phase-9+ objective; it is documented as structurally unattainable at v1 scope.

### Cross-phase LCP trajectory (frozen empirical record)

| Phase | HEAD | LCP measurement | Cumulative gap-closure |
|:-:|:--|:--|:-:|
| Phase-6 6.7 closure-snapshot | (n=1; `Docs/Baselines/2026-05-11_Phase6_task_6_7_perf_capture.json`) | **4,653 ms** | baseline |
| Phase-7 7.10/7.11 close | `6a7eab5` (n=10 noise-floor; `Docs/Baselines/2026-05-15_Phase7_task_7_11_perf_capture_n10_baseline_post_7.10.json`) | **3,903 ms** median | **−16.1%** vs Ph-6 |
| Phase-8+ 8.12 close | `264c5c0` (n=10 ssr:true; `Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json`) | **2,724 ms** median | **−41.5%** cumulative vs Ph-6 |

Each architectural arc closed ~30-40% of remaining gap to ≤500 ms target. None crossed 500 ms threshold. **Phase-9+ goal: continue closing the gap via architectural-axis-shift exploration.**

### Framing (a) — **🔴 PRIMARY / RE-RATIFIED 2026-05-23 (supersedes the prior (b)-PRIMARY lock of 2026-05-21)**

Phase-8+ 8.12 LCP median 2,724 ms = 5.45× over v1 L228 ≤500 ms target. Three architectural arcs each closed ~30-40% of remaining gap but none crossed 500 ms threshold:
- Phase-6: STRUCTURALLY UNATTAINABLE single-lever (font-deferral REVERT)
- Phase-7: STRUCTURALLY UNATTAINABLE multi-lever within React 19 + Vite 6 SPA architecture
- Phase-8+: STRUCTURALLY UNATTAINABLE multi-lever + SSR-migration within React 19 + Vite 6 + RR v7 framework-mode architecture
- **Phase-9+ (NEW empirical evidence):** Block-B architectural-axis exploration RAN + REFUTED. B-α CDN-edge POC (Task 9.3) yielded −1.5% LCP (warm-HIT vs cold-MISS; same-platform PRIMARY signal; ROBUST claim "HTML-delivery edge-caching does not move LCP"). B-γ island-hydration was REFUTED at Task 9.3 attribution altitude — TBT=0 + TTI===LCP exactly across all 20 runs = NO hydration-JS cost to eliminate. Residual LCP is dominated by FCP (JS bundle download/parse + first paint; Phase-7 lazy-load lever already exhausted at HEAD-post-7.10) plus a Lighthouse CSS-animation artifact (Task 9.3 POC-6 attribution; LCP element = `.login-start-text`; metric-hygiene-only, NOT user-perceived delay).

Matches `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` Outcome (B). **Re-ratified as PRIMARY disposition** per Ilya stakeholder decision 2026-05-23 at Task 9.3 close. Crossing ≤500 ms would require fundamental re-architecture (e.g., separate truly-static / server-rendered real-content landing replacing the SPA shell at `/`; Astro/Fresh-style island hydration architecture; or alternative gate definition for v2). **OUT OF v1 SCOPE.** v1 disposition cemented at (a) STRUCTURALLY UNATTAINABLE; Phase-9+ Block-B arc CONCLUDED.

### Framing (b) — **DEMOTED to progress-record (retained as record of −41% cumulative gap-closure)**

Cumulative −1,929 ms / ~41% cumulative gap-closure across three architectural arcs is real, measurable, monotonic progress at every architectural step. Per Cowork Verdict 3 LOCK 3rd-outcome stance (originally cemented at Phase-6 close): progress is engineering-substantive even where target not crossed. Phase-8+ MEASUREMENT-ONLY 10pt → 11pt cross-phase milestone (extended at Phase-9+ Task 9.3 POC-4 + POC-6) empirically validates this framing — the measurement infrastructure itself is a publishable deliverable independent of v1 L228 reachability binary.

**Prior Ilya-lock rationale (2026-05-21; superseded but retained for cross-phase history):** trajectory shape (monotonic gap-closure with each architectural arc) was taken as evidence that further architectural exploration could continue the trajectory. Phase-9+ Block-B was scoped under this hypothesis. Empirical Task 9.3 evidence (cold-vs-warm −1.5%; TBT=0 attribution; CSS-animation artifact as remaining contributor) REFUTED the hypothesis — the trajectory has plateaued at this architecture; Framing (a) becomes the empirical-default verdict. Ilya re-ratified (a) on 2026-05-23 per supersession of the 2026-05-21 (b)-lock.

### Framing (c) — **RESOLVED at this Q1 LOCK**

STAKEHOLDER-DECISION-PENDING disposition is no longer pending; Q1 LOCK chose (b). Framing (c) "defer decision" is no longer applicable. Recorded for completeness.

### Cross-reference index

- Canonical DUAL-FRAMING narrative: `Docs/Phase8_Closure_Report.md §6.2` (frozen retrospective)
- Phase-8+ scoping recommendation: `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` Outcome (B) definition
- Cross-phase empirical baselines: `Docs/Baselines/2026-05-11_Phase6_task_6_7_perf_capture.json` (committed at Phase-9+ 9.1 OPENER `5043587`) + `Docs/Baselines/2026-05-15_Phase7_task_7_11_perf_capture_n10_baseline_post_7.10.json` (Phase-7) + `Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json` (Phase-8+ ssr:true)
- v1 spec citation: project-spec v1 L228 ≤500 ms LCP (gate-of-record; STAYS LIVE per Q1 LOCK)
- Phase-9+ architectural-axis exploration scope: §4 below

---

## §3. Block A scope — Widget + provider SSR polish

Block A is **carry-forward continuation** of Phase-8+ provider SSR remediation arc (PROVIDER-SSR-REMEDIATION class 3pt at Phase-8+) extending to widget-altitude (Finding II) and hydration-flash polish (Finding EE Options β + γ). Sister-shape to Phase-8+ Tasks 8.9 + 8.10 + 8.11 (provider-tree + leaf-component + smoke-test-validation arc).

### A1 — Finding II widget-altitude SSR audit

**Scope.** Audit all widget-altitude `useState(() => browser-global)` patterns gated behind AuthGate (Branch 3). Known site: `TranscriptionHub.tsx:376` `useState(() => window.SpeechRecognition)`. Sweep candidates: any widget under `qualia-shell/src/widgets/**` + `qualia-shell/src/components/**/widgets/**` with init-time browser-global access.

**Why operationally unreachable at HEAD-post-8.11 ssr:true.** AuthGate (Branch 3) server-renders a spinner gate BEFORE widget tree mounts → widget-altitude init-time-UNSAFE patterns never fire on server-side render attempts (Finding II reachability analysis cemented at Task 8.11 Q6 LOCK; smoke-test EMPIRICALLY confirmed zero `ReferenceError` at chromium-headless probe).

**Audit deliverable shape (candidate task).** Whole-widget-tree grep at `useState(() => ` altitude + classification per 3-altitude taxonomy (init-time UNSAFE / effect-time SAFE / event-handler-time SAFE) per the standing PROVIDER-SSR-REMEDIATION class convention. Output: structured audit document at `Docs/Phase9_Widget_SSR_Audit.md` (sister-shape to `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md`).

**Remediation candidate (post-audit).** IF any widget surfaces a reachability-positive init-time UNSAFE pattern → `useSyncExternalStore` + `createLocalStorageStore` factory migration (extends existing 14 factory-produced stores). IF all reachability-negative (AuthGate-gated) → cement INFORMATIONAL-only catalog entries with reachability proof.

**Estimated task altitude.** PROVIDER-SSR-REMEDIATION extension (4th sub-shape `widget-altitude-SSR-audit-and-conditional-remediation`) OR SCOPING-ONLY (if audit concludes NO remediation needed).

### A2 — Finding EE Option β: Suspense at AuthGate altitude

**Scope.** Replace AuthGate (Branch 3) spinner-during-auth-check with React `<Suspense>` boundary delivering server-rendered hydratable content. Goal: reduce hydration-flash transitions from 1 (spinner → final-view at ssr:true) to 0 (server-rendered final-view directly).

**Current AuthGate hydration-flash baseline (Finding EE Option α cemented PERMANENT at Task 8.11 Q2 LOCK).** Flash exists at BOTH `ssr:false` AND `ssr:true` (NOT a `ssr:true` regression); `ssr:true` empirically REDUCES transitions (1 spinner → final-view vs 2 HydrateFallback → spinner → final-view at `ssr:false`). Option β goal: 0 transitions at ssr:true.

**Implementation candidate.** Wrap `<AuthGate>` children in `<Suspense fallback={<AuthGateSpinner />}>`; use `use(authPromise)` or `useSuspenseQuery` for the auth-check resolution. Coexists with FOUC IIFE at root.tsx Layout altitude (NO conflict; FOUC handles theme attribute pre-hydration while Suspense handles auth-check resolution).

**Risks.** (1) Suspense at AuthGate altitude could regress LCP if server-side auth-check resolution adds latency. (2) Edge cases with `react-router-serve` Suspense streaming need empirical validation. (3) Finding KK bimodal LCP could RESOLVE structurally if Suspense eliminates the client-render-path bimodality cluster.

**Estimated task altitude.** Production-source edit at `qualia-shell/src/components/AuthGate.tsx` + `app/root.tsx` Layout integration; vitest delta ~+2-3 (Suspense behavior); smoke-test re-validation BLOCKING.

**🎯 Taxonomy note per OQ-2 LOCK (Phase-9+ Task 9.2 OPENING).** A2 STAYS in Block A polish framing — Suspense at AuthGate does NOT shift the architecture axis; it's hydration-flash polish WITHIN the existing ssr:true RR-v7 framework. Block A = current-architecture polish; Block B = architectural-axis shifts. A2 is **FLAGGED B-γ-adjacent** (re-evaluate when island-hydration is scoped at Task 9.X — island hydration may subsume the Suspense-at-AuthGate work since island-hydration eliminates whole-app hydration cascade by construction). A2 does NOT migrate to Block B.

### A3 — Finding EE Option γ: pre-hydration cookie infrastructure

**Scope.** Alternative to Option β: read auth state from server-side cookie BEFORE React hydrates; eliminate hydration-flash by server-rendering the post-auth view directly. Sister-shape to FOUC IIFE pre-hydration theme attribute (already cemented at Task 8.7 v2.66.3 in-place patch).

**Implementation candidate.** Server-side `loader()` at `app/root.tsx` reads `auth-token` cookie via RR v7 `request.headers.get('cookie')` → injects auth state into hydration data → AuthGate reads pre-hydrated state synchronously on first render. Coexists with FOUC IIFE pattern at Layout altitude.

**Trade-off vs Option β.** Option γ requires cookie-handling infrastructure (auth token in cookie vs localStorage); larger architectural delta. Option β stays within React's Suspense primitive. Phase-9+ scope decision: pick ONE (Option β OR Option γ), not both.

**Estimated task altitude.** Production-source edits across `app/root.tsx` + auth flow + cookie-handling middleware; vitest delta ~+5-8 (cookie-based auth state); smoke-test re-validation BLOCKING.

### A4 — Finding KK LCP bimodal investigation

**Scope.** Empirical investigation of LCP bimodal-at-server-vs-client-rendered-paint distribution at ssr:true (Task 8.12 Finding KK). Cluster A FCP-coincident ~1,953 ms × 2 runs (server-rendered paint) + Cluster B post-hydration ~2,255-2,802 ms × 8 runs (client-rendered paint).

**Hypothesis (informational).** Bimodality is structurally tied to AuthGate (Branch 3) hydration-flash: when AuthGate-spinner server-renders as final-paint candidate vs when post-AuthGate-resolution view becomes final-paint candidate. IF Option β cementation occurs (A2), bimodality may RESOLVE structurally (single cluster at server-rendered post-AuthGate paint).

**Block A interdependency.** A4 is informational-only at Phase-9+ scope; SHOULD interleave with A2 measurement post-Option-β-cementation. NOT standalone-scoped at this 9.1 OPENER.

**Estimated task altitude.** MEASUREMENT-ONLY shape (extends existing 10pt class to 11pt CROSS-PHASE-SHAPE-ROBUSTNESS if executed at Phase-9+); n=10 re-measurement post-A2 implementation; vitest delta +0.

---

## §4. Block B scope — LCP architectural exploration (PRIMARY Phase-9+ spine)

**Block B is the PRIMARY Phase-9+ workstream** per Q1=(b) ratification + Q2 LOCK elevation. Goal: continue the cumulative trajectory (4,653 → 3,903 → 2,724 ms) via architectural-axis shifts beyond the React 19 + Vite 6 + RR v7 framework-mode foundation.

**Standing PRE-FLIGHT discipline at Block B altitude (P1 cemented).** Each architectural-axis-shift lever MUST be scoped against (i) v1 L228 ≤500 ms gate-of-record + (ii) Phase-8+ 8.12 2,724 ms empirical baseline + (iii) feasibility verdict empirically grounded (NOT projection-only). Sister-shape to Phase-8+ Task 8.1 SCOPING-ONLY OPENER (architectural inventory + framework decision tree) + Phase-8+ Task 8.13 SCOPING-ONLY perf-lever-exhaustion refutation (empirical scope-existence verification).

### Lever B-α — CDN edge rendering / origin-shielding **🎯 SCOPED FIRST per OQ-1 LOCK (Task 9.2 active)**

**Hypothesis.** CDN-edge delivery (Cloudflare Workers / Vercel Edge Functions / AWS Lambda@Edge) co-located with users could reduce first-byte latency 200-500 ms; if origin-shielding caches the `react-router-serve` SSR output regionally, repeat LCP could drop into sub-1,000 ms range.

**Feasibility considerations (NON-EMPIRICAL at this OPENER; empirical verification deferred to Block B α scoping task).**
- RR v7 framework-mode with `react-router-serve` is a Node.js HTTP server — runs OK at Vercel/Netlify/Cloudflare Workers compatibility layers
- ssr:true means dynamic per-request rendering; edge caching requires cache-key discipline (auth state via cookie ⇒ varies-by-cookie cache rules)
- Phase-8+ AuthGate (Branch 3, the default route) renders a hardcoded non-user-specific "Validating session…" spinner during `isLoading=true`; UserContext `getServerSnapshot` returns null → `isLoading=true` at SSR initial render → server-rendered HTML is the spinner shell (smoke-test pre-hydration HTML = 5,949 B at Task 8.11 chromium-headless probe), which is edge-cacheable by construction. Branch 1 = `/security` route (SecurityRoute; standalone viewport-fill; NO providers); distinct surface from the AuthGate spinner
- Current LCP baseline 2,724 ms includes ~1,953 ms FCP (network + initial render) + ~770-850 ms hydration-cascade-to-LCP → edge-cache could primarily reduce the 1,953 ms FCP component
- Theoretical floor: if FCP drops from 1,953 ms to ~300 ms (edge-cache HIT) and LCP stays paint-coincident at server-rendered cluster A → LCP could drop to ~300-500 ms range = **POTENTIALLY GATE-CROSSING**

**Risks.** (1) Edge platform lock-in. (2) Cache invalidation discipline at every deploy. (3) Cookie-handling at edge needs care for auth state. (4) Authenticated user paths cannot edge-cache user-specific content; need split cache strategies.

**Sister-shape precedent at NULL.** No prior Phase touched CDN-edge architecture. Phase-9+ B-α scoping would be FIRST cross-phase data point at this altitude.

### Lever B-β — HTTP/3 + early hints + resource prioritization

**Hypothesis.** HTTP/3 (QUIC) reduces connection-establishment latency 1-RTT vs HTTP/2 3-RTT; `103 Early Hints` allows server to push critical CSS/JS preload links before HTML response. Combined: ~100-300 ms LCP reduction on cold-cache loads.

**Feasibility considerations.**
- HTTP/3 requires server + CDN + browser support; Chrome ≥87 + Safari 14+ + Firefox 88+ all support
- Vercel + Cloudflare + AWS CloudFront all support HTTP/3
- `react-router-serve` runs over HTTP/1.1 in dev; production deployment determines transport
- Early Hints require server-side capability to emit `103` response before main response
- Theoretical LCP delta: ~100-300 ms reduction; would bring 2,724 ms → ~2,400-2,600 ms = **NON-GATE-CROSSING alone** but **COMPOSABLE with B-α** (compound reduction)

**Risks.** (1) Early Hints emission requires `react-router-serve` or middleware support; may need custom server wrapper. (2) HTTP/3 requires production-deployment-platform support; not testable locally with default tooling.

**Sister-shape precedent at Phase-7 Task 7.10.** Phase-7 lazy-load lever WAS network-latency-adjacent (vendor-split reduces critical bundle size). B-β is sister-shape to network-latency-adjacent lever family but at transport-protocol altitude.

### Lever B-γ — Island hydration architecture (Astro/Fresh-style)

**Hypothesis.** Replace whole-app hydration with island-hydration: ship interactive components hydrated server-rendered + interactive-only-where-needed. Eliminates ~770-850 ms hydration-cascade-to-LCP delta observed at Phase-8+ 8.12; brings LCP coincident with server-rendered paint (~1,953 ms target).

**Feasibility considerations.**
- RR v7 framework-mode SUPPORTS partial hydration via `clientLoader` / `clientAction` boundaries + `useSyncExternalStore` server-snapshot primitives (Phase-8+ 8.9/8.10 cemented this pattern)
- Phase-8+ 14 factory-produced stores ARE island-hydration-compatible by construction (server-snapshot + client-hydrate dual-signature)
- Architectural delta: requires identifying which routes/components NEED hydration (interactive) vs CAN stay static (display-only); StrataDashboard widget tree is the primary candidate inventory
- Theoretical LCP delta: ~500-800 ms reduction if hydration-cascade eliminated; brings 2,724 ms → ~1,950-2,200 ms = **NON-GATE-CROSSING alone** but materially advances trajectory
- Bimodal cluster A vs B (Finding KK) RESOLVES structurally — all paint becomes server-rendered paint
- **Most architecturally-substantive lever** — requires per-route-component-tree audit + selective hydration markers

**Risks.** (1) Per-route hydration markers require careful classification (interactive vs display-only); regression risk if interactive component classified static. (2) Compatibility with current widget-registry pattern + AuthGate (Branch 3) + StrataDashboard sub-routing needs empirical verification. (3) Phase-8+ Finding U-REVISED RR v7 framework-mode primitives — must verify `clientLoader` boundary semantics for island hydration usage.

**Sister-shape precedent.** Astro/Fresh ecosystem pattern; first-time application within React + RR v7 framework-mode context at this project.

### Lever stacking + interaction effects

Levers B-α + B-β + B-γ are **architecturally orthogonal** (network/transport/hydration axes); composable. Theoretical compound projection (NOT empirical):
- B-α alone: LCP 2,724 → ~300-500 ms (edge-cache HIT) = potentially gate-crossing
- B-β alone: LCP 2,724 → ~2,400-2,600 ms = non-gate-crossing
- B-γ alone: LCP 2,724 → ~1,950-2,200 ms = non-gate-crossing
- B-α + B-γ stacked: LCP could drop into sub-500 ms range = **MOST LIKELY GATE-CROSSING PATH** if both ship as scoped

**This OPENER does NOT prioritize levers.** Block B lever prioritization is the Cowork verdict-pending HALT per execution-order Step 6. §7 below surfaces the OQs.

### Block B scoping discipline (PROCESS NOTE)

Per Phase-8+ Task 8.13 SCOPING-ONLY 5pt cementation — perf-lever scoping discipline: each lever MUST be scoped against (a) v1 L228 gate (≤500 ms; gate-of-record) + (b) empirical baseline (2,724 ms; Phase-8+ 8.12) + (c) feasibility verdict (SCOPING discipline: NO production source touched; output = architectural inventory + qualitative projections + risks/OQs + Cowork decision gate). Each lever-scoping task = SCOPING-ONLY shape extension OR PROVIDER-SSR-REMEDIATION extension OR NEW class (depending on lever shape).

---

## §5. Block C scope — Project-wide housekeeping (**🎯 FULLY CLOSED at Phase-9+ Task 9.5 — DOC-CORRECTION-ONLY**)

**🎯 Block C FULLY CLOSED at Phase-9+ Task 9.5 close (2026-05-23) per Ilya stakeholder verdict-lock.** All 3 Block C items resolved: C1 RESOLVED at Phase-7 (pre-Phase-9+ baseline); C2 ACCEPTED+MONITORED per Ilya 2026-05-23; C3 RESOLVED at 9.1 OPENER. Task 9.5 DOC-CORRECTION-ONLY: refutes the stale C1 CLAUDE.md entry + reframes C2 disposition + cements C3 resolution. ZERO production source touched; +0 vitest; +0 new classes.

### C1 — Linux Playwright baselines (8 *-chromium-linux.png) — **🎯 RESOLVED at Phase-7 Tasks 7.5 + 7.6 (`16c2ac2` PR #60 2026-05-13)**

**🎯 RESOLVED PRE-PHASE-9+.** Empirically verified at Phase-9+ Task 9.5 PRE0:
- 8 `*-chromium-linux.png` baselines committed at `qualia-shell/e2e/screenshot-baseline.spec.ts-snapshots/` (accounting + leasing + maintenance + overview + owners + properties + residents + vendors)
- Squash-SHA `16c2ac2` via PR #60 at Phase-7 Task 7.5 capture cycle (capture run 25779329286 on `phase-7/linux-baseline-capture-25779329286` auto-branch)
- Phase-7 Task 7.6 (`continue-on-error: true → false` GATE-FLIP) completed the 5-step screenshot-baseline blocking-gate arc (SPEC `toHaveScreenshot` hard-assert by construction + WORKFLOW step-split @ 7.3 + INFRASTRUCTURE @ 7.4 + CAPTURE @ 7.5 + GATE-FLIP @ 7.6); empirical signal parity gate run 25780671522 PASSED 3.1m on Linux CI under flipped config
- Both blocking-gate arcs (axe-baseline + screenshot-baseline) now genuinely blocking on Linux CI per `.github/workflows/appfolio-parity-gate.yml:158` + `:165` `continue-on-error: false`

**C1 stale-deferred-item refutation cemented at `Docs/CLAUDE_history.md`** as v2.60.1 cluster 17th-altitude candidate (sub-shape: `cited-deferred-item-DOES-NOT-MATCH-repo-state-empirical-refutation`; cited "Linux baselines open" REFUTED by 8 committed PNGs + blocking CI step + PR #60 squash-SHA verifiable). Sister-altitude to Task 9.4 PRE0 17th-altitude candidate `cited-directory-paths-DO-NOT-EXIST` (both surface as PRE0 empirical-vs-cited refutations at Phase-9+ task-PRE0-discipline altitude). Final v2.60.1 17th-altitude cementation at Cowork verdict-altitude (deferred to closer / next opener).

### C2 — `nebula-bg.mp4` 74,409,677 B asset — **🎯 ACCEPTED + MONITORED per Ilya 2026-05-23**

**🎯 ACCEPTED + MONITORED disposition per Ilya stakeholder verdict-lock 2026-05-23 (Phase-9+ Task 9.5 close).** 74,409,677 B / 70.96 MiB asset committed in git at `qualia-shell/public/assets/nebula-bg.mp4`; under GitHub's 100 MB hard limit (only over 50 MB soft-warning). No action required at this Phase-9+ closure altitude. **LFS-migrate guardrail REMAINS in force** — `git lfs migrate` is OUT OF SCOPE on `main` without explicit instruction (history rewrite); revisit only if a future push approaches the 100 MB hard limit or asset count grows. Original decision tree (Option (i) LFS / Option (ii) CDN / Option (iii) smaller replacement) preserved at history altitude but NOT executed at v1.

**Reframed from "needs LFS/CDN/replacement"** to ACCEPTED + MONITORED disposition; preserves cross-phase traceability while reflecting empirical state (under hard limit; sustainable as-is at v1).

### C3 — Untracked baseline JSONs — **🎯 RESOLVED at Phase-9+ Task 9.1 OPENER `5043587`**

**RESOLVED via commit `5043587`** (Phase-9+ Task 9.1 OPENER): 6 baseline JSONs (5 Phase-0 axe + 1 Phase-6 6.7 perf) committed as historical baselines. Total: 8,572 B.

**Empirical-vs-projection drift CEMENTED as v2.60.1 cluster 16th altitude** (cross-phase-AND-task-BOUNDARY-projection-over-estimate-drift; closer projection ~7, empirical 6 = 86% accuracy; see Conventions block). Cluster 16th altitude already cemented in `CLAUDE.md` Conventions at 9.2 PRE0 (BROADENED scope from cross-phase-BOUNDARY-only to cross-task-BOUNDARY + cross-phase-BOUNDARY).

---

## §6. Phase-9+ Task 9.1 OPENER designation + SCOPING-ONLY 6pt class

**Task 9.1 = THIS Phase-9+ Task 9.1 OPENER deliverable** (kickoff brief) per Cowork Q4 LOCK Option (γ) expand-stub-in-place.

### Class designation: SCOPING-ONLY 5pt → 6pt CROSS-PHASE-BOUNDARY extension

**🎯 First cross-phase-BOUNDARY data point for SCOPING-ONLY class** per Cowork Q3 LOCK. Class trajectory:

| Calibration point | Task | Phase | Sub-shape |
|:--|:--|:--|:--|
| 1pt (introduction) | Phase-8+ 8.1 | Phase-8+ Block A OPENER | forward-scoping-roadmap |
| 2pt CROSS-TASK-SHAPE | Phase-8+ 8.3 | Phase-8+ Block A | provider-tree-audit |
| 3pt CROSS-TASK-SHAPE-ROBUSTNESS | Phase-8+ 8.5 | Phase-8+ Block A closer | empirical-inventory-confirming-NO-extraction-needed |
| 4pt | Phase-8+ 8.8 | Phase-8+ Block B mid | per-route-SSR-opt-out-INFEASIBLE |
| 5pt | Phase-8+ 8.13 | Phase-8+ Block C item 2 | perf-lever-stacking-EXHAUSTED |
| **6pt CROSS-PHASE-BOUNDARY** | **Phase-9+ 9.1** | **Phase-9+ Block A OPENER (kickoff brief)** | **cross-phase-boundary-kickoff-with-stakeholder-decision-resolution** |

**🎯 SCOPING-ONLY now the highest-calibrated class in the project** at 6pt (cross-phase Phase-8+ + Phase-9+ at HEAD-post-9.1-OPENER). Previously: MEASUREMENT-ONLY 10pt cross-phase (Phase-7 + Phase-8+) — note MEASUREMENT-ONLY is higher absolute count BUT SCOPING-ONLY 6pt is now the highest cross-phase-distributed class (Phase-8+ 5pt + Phase-9+ 1pt with cross-phase-BOUNDARY shape ROBUSTNESS).

**Sub-shape definition for cross-phase-boundary-kickoff-with-stakeholder-decision-resolution.** Kickoff brief shape at phase-BOUNDARY altitude that ALSO resolves a stakeholder-decision-pending verdict carried forward from prior phase closure. Composite deliverable: (i) carry-forward synthesis + (ii) stakeholder-verdict RATIFICATION (Q1 LOCK flip from PENDING) + (iii) forward-scoping inventory across multiple blocks + (iv) class designation + risk-register cementation. Sister-shape candidate at Phase-10+ 10.1 OPENER IF Phase-9+ produces a similar stakeholder-decision-pending carry-forward.

### Task 9.1 OPENER deliverable scope (THIS doc)

- ✓ TBD-8.15 → 1f4b9c0 cross-phase-BOUNDARY sweep (committed `b86ecde`; 41-pattern milestone)
- ✓ Phase-9+ kickoff PRE0 ledger (in prior conversation turn)
- ✓ Cowork Q1-Q4 verdict-lock cementation (this doc §1-§7)
- ✓ Block C item 3 resolution (baseline JSONs committed `5043587`)
- ✓ Phase_9_Plan.md stub → full kickoff brief expansion (Q4 LOCK Option γ; this doc)
- ✓ CLAUDE.md SCOPING-ONLY 5pt → 6pt cementation + Phase-9+ pivot (Cowork execution-order Step 5)
- ✓ Process improvements P1 (v2.76.0 promotion) + P2 (recursive-validation cross-phase standing) cementation

### Pre-PROMOTION state record

Pre-Phase-9+ 9.1 OPENER state: SCOPING-ONLY 5pt at HEAD-post-Task-8.13. Highest-calibrated cross-phase class: MEASUREMENT-ONLY 10pt cross-phase (Phase-7 7.10/7.11/7.14 + Phase-8+ 8.12).
Post-Phase-9+ 9.1 OPENER state: SCOPING-ONLY 6pt cross-phase-BOUNDARY (highest cross-phase-distributed class). MEASUREMENT-ONLY remains 10pt (unchanged at this OPENER).

### ZERO production source touched at this OPENER

Per SCOPING-ONLY class definition (CLAUDE.md Conventions block): "No production source touched; no measurement; no closure narrative." This Phase-9+ Task 9.1 OPENER touches ONLY: CLAUDE.md (Phase-9+ pivot + class extension) + Docs/AppFolio_Parity_Implementation_Plan_v2.md (sweep) + Docs/Phases/Phase_9_Plan.md (this expansion) + Docs/Baselines/*.json (Block C item 3 historical commits). Zero `qualia-shell/src/**` + `qualia-shell/app/**` + `Scripts/**` touches.

---

## §7. Risks / open questions / Cowork decision gates for Task 9.1

### OQ-1: Block B lever prioritization — **🎯 LOCKED 2026-05-21 → B-α CDN-EDGE SCOPED FIRST (Task 9.2)**

**Ilya verdict 2026-05-21.** Rationale: largest standalone LCP-reduction potential + the lever most likely to actually cross ≤500 ms on a cache HIT (server-rendered AuthGate (Branch 3) spinner IS edge-cacheable for unauth'd users; edge-cache could reduce the ~1,953 ms FCP component toward ~300-500 ms). Task 9.2 = B-α CDN-edge SCOPING-ONLY deliverable.

**Historical-record (question at OPENER PRE0).** Candidate orderings considered: (i) B-α first / (ii) B-γ first / (iii) B-β first / (iv) parallel scoping. Ilya chose (i) per the standalone-cross-rate hypothesis.

### OQ-2: Block A interleave timing — **🎯 LOCKED 2026-05-21 → A2 STAYS IN BLOCK A POLISH (B-γ-adjacent FLAG)**

**Verdict.** A2 (Suspense at AuthGate) STAYS in Block A polish framing; does NOT migrate to Block B. Block A = current-architecture polish; Block B = architectural-axis shifts. A2 is FLAGGED B-γ-adjacent — re-evaluate when island-hydration is scoped (island-hydration may subsume Suspense-at-AuthGate work by construction). Taxonomy note recorded in §3 A2 row + A2 detailed section.

### OQ-3: Block C ordering — **🎯 LOCKED 2026-05-21 → PARALLEL / OPPORTUNISTIC, non-gating**

**Verdict.** Block C runs PARALLEL / OPPORTUNISTIC; none of C1+C2 gates Block B (B-α scoping spine). C3 already RESOLVED at 9.1 OPENER `5043587`. Block C items can interleave with Block A polish or Block B architectural-axis exploration; ordering is opportunistic-based-on-availability. Recorded in §5 heading.

### OQ-4: Phase-9+ duration projection — **🎯 LOCKED 2026-05-21 → INFORMATIONAL ONLY (no hard lock)**

**Verdict.** No hard duration lock per v2.60.1 anchor-bias discipline (pre-committing durations at OPENER altitude is structurally fragile). Phase-9+ duration becomes empirical post-hoc at Phase-9+ closer altitude.

### OQ-5: Phase-9+ closer LCP baseline target — **🎯 LOCKED 2026-05-21 → DEFERRED to Phase-9+ closer (informational only)**

**Verdict.** Pre-committing measurement-targets at OPENER altitude is structurally fragile (anchor-bias risk). Deferred to Phase-9+ closer terminal-task altitude where empirical baselines inform the verdict directly.

### Risk register entry — Framing (a) PROMOTED to ratified primary 2026-05-23 (was minority)

🔴 **PROMOTED from minority footnote → ratified PRIMARY disposition** per Ilya-lock 2026-05-23. Phase-9+ Block-B levers were empirically scoped + REFUTED at Task 9.3 (B-α CDN-edge POC −1.5% LCP + B-γ island-hydration REFUTED at attribution altitude TBT=0). Per §2 RE-RATIFIED narrative above, the prior closer-obligation language ("IF Block B levers fail → Framing (a) becomes empirical default") has now FIRED — the empirical refutation is documented; Framing (a) is the empirical-default verdict; Ilya ratified it on 2026-05-23. The "may force a fundamental architecture pivot decision" branch is OUT OF v1 SCOPE per Ilya 2026-05-23 (separate landing / Astro/Fresh / etc. reserved for v2 consideration). No further LCP-gate-crossing levers pursued under v1.

### Cowork verdict-pending HALT per execution-order Step 6

This OPENER HALTS at the end of execution-order Step 6 for Cowork verdict on:
- **Block B lever prioritization** (OQ-1; primary substantive question)
- **Block A interleave timing** (OQ-2)
- **Block C ordering** (OQ-3)
- **Phase-9+ duration projection** (OQ-4; informational)
- **Phase-9+ Task 9.2 OPENING** (depends on OQ-1 + OQ-2 verdict)

---

## §8. Phase-9+ entry-state at HEAD-post-Task-8.15 → post-Phase-9+ 9.1 OPENER

Architectural state at HEAD-on-`main` (`1f4b9c0`) + working state at HEAD-on-feat-branch post-9.1 OPENER:

| Domain | State at HEAD-on-`main` (`1f4b9c0`) | State at HEAD-on-feat-branch post-9.1 OPENER |
|--------|-------|-------|
| **SSR mode** | `ssr: true` at `qualia-shell/react-router.config.ts` (Task 8.11 close) | unchanged |
| **Framework-mode** | RR v7.15.1 framework-mode adopted at Task 8.6 | unchanged |
| **Build output** | `build/client/` + `build/server/` (NOT `dist/`) | unchanged |
| **Provider tree** | 4 audit-scoped providers + Sidebar leaf-component migrated to `useSyncExternalStore` + factory | unchanged |
| **Factory-produced stores** | 14 cumulative under true SSR runtime | unchanged |
| **a11y state** | v1 L230 ZERO WCAG AA SUSTAINED across 8-routable-surface scope | unchanged |
| **LCP state** | n=10 median 2,724 ms / mean 2,499 ms / CV 13.49% bimodal at ssr:true | unchanged |
| **vitest** | 278/278 | unchanged (+0 at SCOPING-ONLY 9.1 OPENER) |
| **Engineering findings** | 36 active + 1 INFORMATIONAL | unchanged |
| **Project-wide classes** | 19 cumulative | unchanged (Phase-9+ class additions deferred to substantive tasks) |
| **Anchor-bias cluster** | 19 patterns | candidate 20th altitude (empirical-vs-projection drift; baseline JSONs ~7 → 6 + sweep spots ~8-10 → 5) |
| **v2.X.X patches** | 9 cumulative in-place | unchanged |
| **Sweep-resolutions** | 40-pattern at Task 8.15 OPENING | **41-pattern cemented at this Phase-9+ 9.1 OPENER** (cross-phase-BOUNDARY) |
| **Calibration class extension** | SCOPING-ONLY 5pt highest in-phase Phase-8+ | **SCOPING-ONLY 6pt cross-phase-BOUNDARY** (highest cross-phase-distributed class) |
| **Standing conventions** | v2.72.1 `.reset()` + v2.74.1 branch-base + v2.76.0 directive-gate-citation | + **P1 v2.76.0 PROMOTED to Phase-9+ standing PRE-FLIGHT** + **P2 recursive-validation CEMENTED as cross-phase standing convention** at this 9.1 OPENER |
| **v1 L228 disposition** | STAKEHOLDER-DECISION-PENDING per Closer §6.2 | **🔴 RE-RATIFIED (a) STRUCTURALLY UNATTAINABLE per Ilya-lock 2026-05-23 at Task 9.3 close** (supersedes 2026-05-21 (b)-lock; (b) retained as progress-record) |

---

## §9. Closure-completion-FUNCTION sister-shape precedent clarification (preserved from stub)

Per Cowork Q1 LOCK at Task 8.15 PRE0 (preserved verbatim from stub state):

> "Plan v2 §9 8.15 row 'sister-shape to Phase-7 7.14 + Phase-6 6.9 publishing' is accurate at closure-completion-FUNCTION altitude (both Phase-6 6.9 and Phase-7 closer cemented closure-completion ⊂ publishing-equivalent function: closure-narrative + Phase-N+1 kickoff pointer + v1 verdict-record + §9 column flip). Phase-8+'s 2-step closer(8.14)/publishing(8.15) separation is structurally NOVEL at task-decomposition altitude — first publishing-task instance in project history. CLOSURE-NARRATIVE-CONSOLIDATION class stays 3pt cross-phase with NEW sub-shape `closer-publishing-handoff` added at Task 8.15 (sister-shape to existing `single-task-closure-per-phase` sub-shape @ Phase-6 6.9 + Phase-7 closer)."

---

## §10. Phase-9+ → Phase-10+ transition signal projection (preserved from stub)

Phase-9+ transition signal will be empirically-grounded per Phase-9+ closer (terminal task TBD) cementation. **Updated 2026-05-23 per Ilya v1 L228 disposition flip:** the conditional projection above has been resolved empirically. Framing (a) became the empirical default at Task 9.3 close; Ilya ratified (a) as PRIMARY disposition. Phase-10+ direction (if Phase-10+ is undertaken) would target fundamental architecture (separate landing / Astro/Fresh / server-side templating) OR alternative gate definitions — but those are v2-scope decisions out of v1.

---

**Phase-9+ Task 9.1 OPENER deliverable LOCKED at this doc.** Phase-9+ R OPEN; substantive task scoping awaits Cowork verdict on OQ-1 through OQ-4 above.

🎯
