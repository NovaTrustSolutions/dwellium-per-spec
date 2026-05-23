# Phase-9+ Next-Lever Scoping — LCP Element Render Delay (CSS-animation audit)

**Status.** Sister-shape next-lever scoping doc to `Docs/Phase9_Task_9_2_CDN_Edge_Scoping.md` at Phase-9+ Task 9.3 POC-6 close. **Drafted at Task 9.3 close per Cowork PART C empirical attribution finding** + Cowork autonomy authorization. **🔴 DEFERRED — NOT authorized per Cowork verdict-lock 2026-05-23.** Reason: per Cowork ship-decision, this lever is **metric-hygiene-only** (still ~5.5× over the v1 L228 ≤500 ms gate; alters a deliberate design effect; text is human-visible at opacity 0.3 throughout so users do NOT perceive the artifact delay). This doc remains as a **documented future option** — Ilya may revisit if/when LCP-metric hygiene becomes load-bearing for some downstream consideration. **Do NOT implement; do NOT touch `LoginScreen.css` on this evidence alone.**
**Class candidate.** SCOPING-ONLY 7pt → 8pt CROSS-PHASE-SHAPE-ROBUSTNESS extension (sister to Task 9.2 sub-shape `architectural-axis-shift-scoping-CDN-edge-...`; this is `LCP-element-render-delay-CSS-animation-audit-scoping` sub-shape — NEW; smaller architectural axis than CDN migration; same SCOPING-ONLY shape per Cowork-ratified rationale at Task 9.2 LOCK).
**Authored.** 2026-05-23 (Phase-9+ Task 9.3 POC-6 LCP-attribution close).
**Cross-references.**
- `Docs/Phase9_Task_9_3_POC_HandoffPackage.md §4` — POC-4 + POC-6 empirical findings + attribution evidence (this doc derives its lever recommendation from §4 attribution data).
- `Docs/Phase9_Task_9_2_CDN_Edge_Scoping.md` — sister-shape B-α scoping (REJECTED at Task 9.3 POC-6 per empirical evidence; this doc supersedes B-α as the next-lever recommendation).
- `Docs/Baselines/2026-05-23_Phase9_task_9_3_lcp_attribution.json` — n=3 Lighthouse attribution capture.

---

## §0. 🎯 Headline finding

**The Phase-9+ LCP bottleneck (per empirical attribution at Task 9.3 POC-6) is NOT network / NOT hydration / NOT auth-data round-trip / NOT edge-cache.** It is **a CSS animation on the LCP element** (`.login-start-text` "CLICK TO ACCESS TERMINAL") whose initial opacity is `0.3`, ramping to `1.0` over a 3-second infinite `flashText` keyframe cycle. Lighthouse's LCP timing waits for the opacity to cross the visibility threshold → **`elementRenderDelay: ~1,095 ms` (raw) / ~2,000 ms (4× CPU-throttled)** added on top of FCP.

**Fix is a 1-3 line CSS change to `qualia-shell/src/components/Auth/LoginScreen.css`** (sister-shape to a hygiene CSS-fix; not an architectural-axis shift). Empirical re-measurement post-fix is required to confirm LCP impact.

---

## §1. Executive summary + verdict-candidate

### §1.1 The question
**Given Task 9.3 POC-6 attribution refuted both B-α (CDN-edge) and B-γ (island-hydration) as gate-crossing levers, what lever family does the empirical bottleneck actually point to?**

### §1.2 The empirical baseline (VERIFIED at Task 9.3 POC-6 attribution)

Per `Docs/Baselines/2026-05-23_Phase9_task_9_3_lcp_attribution.json` (n=3 Lighthouse runs against live `https://dwellium-per-spec.vercel.app/`):

| Metric | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| LCP | 4,794 ms | 4,729 ms | 4,749 ms | **~4,750 ms** (throttled simulated) |
| FCP | 2,733 ms | 2,728 ms | 2,746 ms | ~2,730 ms |
| FCP→LCP gap | 2,062 ms | 2,001 ms | 2,003 ms | ~2,000 ms |
| TBT | 0 | 0 | 0 | **0** (throttling=4× CPU; truly idle) |
| Network requests in FCP→LCP window | 0 | 0 | 0 | **0** (all 15 requests complete by ~700 ms) |

**LCP phases breakdown (per Lighthouse `lcp-breakdown-insight` audit, RAW timings):**

| Phase | Run 1 | Run 2 | Run 3 | Notes |
|---|---|---|---|---|
| timeToFirstByte | 208 ms | 171 ms | 188 ms | Network + server (Vercel edge) |
| elementRenderDelay | **1,078 ms** | **1,103 ms** | **1,095 ms** | **directional indicator (raw-trace timebase)** |

🔴 **Timebase reconciliation caveat (Cowork PART E LOCK 2026-05-23):** the breakdown values are RAW observed-trace timings (TTFB 188 + ERD 1,095 = ~1,283 ms) and **DO NOT cleanly reconcile** with the throttled-simulated LCP metric (~4,750 ms median). The elementRenderDelay is also only ~half of the throttled FCP→LCP gap (~2,000 ms). Treat the breakdown as **directional attribution** identifying the LCP element + naming the dominant raw phase; do NOT project exact throttled-LCP recovery from it. Precise post-fix LCP requires empirical re-measurement.

🔴 **Lighthouse-artifact vs user-perception caveat:** the LCP detection waits for opacity threshold crossing on the animated text, but real users SEE the text at opacity 0.3 throughout — it is human-visible from first paint. This is a **Lighthouse measurement artifact**, NOT a user-experience delay. The CSS-fix lever is **metric-hygiene-only**: it improves the Lighthouse-LCP number but does NOT improve user-perceived time-to-content. This shifts the lever's value-proposition from "user-experience improvement" to "measurement-baseline-cleanup for subsequent lever work".
| resourceLoadDelay / Duration | (not applicable for text LCP) |

### §1.3 LCP element identification (VERIFIED across all 3 runs)

| Element attribute | Value |
|---|---|
| Selector | `body > div.login-start-overlay > div.login-start-text` |
| Path | `1,HTML,1,BODY,1,DIV,0,DIV` |
| Snippet | `<div class="login-start-text">` |
| Text content (nodeLabel) | **"CLICK TO ACCESS TERMINAL"** |
| Type | text content (NOT image; LCP discovery audit `notApplicable`) |

### §1.4 The verdict-candidate

**🎯 The LCP bottleneck is the `.login-start-text` CSS animation.** Per `qualia-shell/src/components/Auth/LoginScreen.css:48-65`:

```css
.login-start-text {
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
    letter-spacing: 4px;
    text-transform: uppercase;
    font-family: 'Inter', sans-serif;
    font-weight: 500;
    animation: flashText 3s infinite ease-in-out;
}

@keyframes flashText {
    0%, 100% { opacity: 0.3; }
    50%      { opacity: 1; }
}
```

The element's opacity oscillates between `0.3` (frames 0% and 100%) and `1.0` (frame 50%, i.e., 1.5 seconds into the 3-second cycle). At first paint, the element is at `opacity: 0.3` — below the Chromium LCP visibility threshold. The opacity ramps from 0.3 → 1.0 linearly (per `ease-in-out` curve) over 1.5 seconds. Lighthouse's LCP detection fires when the opacity crosses the threshold, which adds the observed `elementRenderDelay`.

### §1.5 Recommended fix family

**Lever family: UI-RENDER-OPTIMIZATION / CSS-ANIMATION-AUDIT.**

**Fix scope:** 1-3 line CSS change to `LoginScreen.css`. NO production-source touches to `src/**` or `app/**` beyond CSS. NO architectural-axis shift. NO new dependencies. NO migration cost.

**Estimated LCP impact — DIRECTIONAL ONLY; precise post-fix LCP requires empirical re-measurement:**
- Eliminating the elementRenderDelay artifact MAY drop LCP toward ~FCP value (~2,730 ms throttled / aligning with Task 8.12 localhost baseline ~2,724 ms)
- Raw-vs-throttled timebase reconciliation gap (see §1.4 caveat) means the exact post-fix LCP cannot be projected from breakdown data alone
- **Lever value-prop is METRIC-HYGIENE** (cleaner Lighthouse number), NOT user-experience improvement — the text is human-visible at opacity 0.3 throughout, so users never perceive the artifact delay
- **Even at the optimistic projection (~2,730 ms), the v1 L228 ≤500 ms gate is NOT crossed** (5.5× over)

---

## §2. Why this REFUTES B-α + B-γ + the post-hydration-fetch hypothesis

### §2.1 B-α (CDN-edge HTML caching) — REFUTED at Task 9.3 POC-4

Empirical PRIMARY signal (warm-HIT vs cold-MISS same-platform delta): **−1.5% LCP improvement.** Edge-caching the HTML shell cannot move LCP because the bottleneck is post-FCP element-render-timing, NOT pre-FCP HTML delivery. Edge cache benefits TTFB + (partially) FCP; it cannot affect what happens AFTER FCP on the client.

### §2.2 B-γ (island-hydration) — REFUTED at Task 9.3 POC-6 attribution

The B-γ rationale assumes the FCP→LCP gap is **hydration-JS execution cost**. Empirical evidence: **TBT=0** under 4× CPU throttling — there is genuinely NO main-thread work in the FCP→LCP window. Island hydration eliminates hydration-JS cost; there's no JS cost to eliminate. B-γ would NOT move LCP.

### §2.3 Post-hydration auth/data round-trip hypothesis — REFUTED

The Cowork-flagged hypothesis assumed: AuthGate spinner (FCP) → useEffect → `GET /api/auth/me` → real content (LCP). **Source-provenance refutation:** `UserContext.tsx:285-288` shows `useEffect` exits IMMEDIATELY if `token` is null (`setIsLoading(false); return;` before any fetch). Lighthouse runs with fresh state (no localStorage token) → `token` IS null → fetch DOES NOT FIRE.

**Empirical refutation:** 0 network requests in FCP→LCP window across all 3 runs (Lighthouse `network-requests` audit). The 15 captured requests (HTML + JS chunks) all complete by ~700 ms — before FCP.

### §2.4 What this leaves: CSS-animation-audit as the unambiguous lever

By eliminating B-α / B-γ / post-hydration-fetch as candidates AND empirically attributing LCP to the `.login-start-text` animated element, the lever family is **unambiguously** the CSS-animation that delays the LCP element's visibility threshold crossing.

---

## §3. Fix candidates + UX trade-offs

Four candidate fixes, ordered by minimal-UX-delta first.

### §3.1 Fix Option A — Initial-opacity-1 keyframes (RECOMMENDED)

```diff
 @keyframes flashText {
-    0%, 100% { opacity: 0.3; }
-    50%      { opacity: 1; }
+    0%       { opacity: 1; }
+    50%      { opacity: 0.3; }
+    100%     { opacity: 1; }
 }
```

| Pros | Cons |
|---|---|
| Element renders at opacity:1 from frame 0 → LCP fires immediately on first paint | Animation phase flips (now fades OUT first, then back IN, vs original IN-then-OUT) |
| Preserves the "flashing/breathing" UX rhythm | Subtle visual shift; UX team approval may be needed |
| Smallest production-source delta (3-line CSS keyframe edit) | |

### §3.2 Fix Option B — Explicit `opacity:1` baseline + animation-delay

```diff
 .login-start-text {
     color: rgba(255, 255, 255, 0.7);
     font-size: 14px;
     letter-spacing: 4px;
     text-transform: uppercase;
     font-family: 'Inter', sans-serif;
     font-weight: 500;
+    opacity: 1;
-    animation: flashText 3s infinite ease-in-out;
+    animation: flashText 3s infinite ease-in-out 2s;
 }
```

| Pros | Cons |
|---|---|
| Preserves EXACT original animation keyframes | Adds 2s of static opacity:1 before pulsation begins (very subtle UX delay) |
| Element starts at opacity:1 → LCP fires immediately | Animation-delay value is heuristic (2s should cover LCP capture; needs empirical verification) |
| 2-line CSS edit | |

### §3.3 Fix Option C — Remove animation entirely

```diff
-    animation: flashText 3s infinite ease-in-out;
```
plus delete the `@keyframes flashText` block.

| Pros | Cons |
|---|---|
| Maximum LCP improvement | LOSES the flashing animation entirely — UX regression |
| Cleanest production-source delta (1-line + dead-code removal) | UX team likely REJECTS without consultation |

### §3.4 Fix Option D — Switch to `visibility-based` animation

```diff
- animation: flashText 3s infinite ease-in-out;
+ animation: pulseGlow 3s infinite ease-in-out;
 ...
+ @keyframes pulseGlow {
+   0%, 100% { text-shadow: 0 0 0px rgba(255,255,255,0); }
+   50%      { text-shadow: 0 0 20px rgba(255,255,255,0.8); }
+ }
```

Replace opacity-based animation with text-shadow-based (animates GLOW instead of opacity).

| Pros | Cons |
|---|---|
| Preserves "alive/breathing" visual effect via glow pulsation | Substantively different UX (glow vs opacity-fade) |
| Element at opacity:1 from frame 0 → LCP fires immediately | Larger CSS delta (3-4 lines) |
| Glow may render BETTER aesthetically | Needs UX review for visual-design coherence |

### §3.5 Fix recommendation

**RECOMMENDED: Fix Option A** (initial-opacity-1 keyframes; 3-line CSS keyframe edit). Rationale:
- Smallest production-source delta
- Preserves the "flashing" effect AT ITS ORIGINAL FREQUENCY (3-second cycle unchanged)
- UX shift is subtle (phase-shifted animation) — likely acceptable without UX review
- Empirical verifiability: deploy + re-measure LCP

**Alternative: Fix Option B** if UX team requires the exact original keyframe sequence preserved.

---

## §4. LCP projection model (post-fix; empirical-verification required)

### §4.1 Projected LCP distribution post-fix — DIRECTIONAL ONLY

**HYPOTHESIS (DIRECTIONAL ONLY; requires empirical re-measurement post-deploy):** removing the elementRenderDelay artifact MAY drop LCP toward ~FCP value. The raw-vs-throttled timebase reconciliation gap (see §1.4) means **projections from breakdown data alone are unreliable** — the back-of-envelope estimates below are intended to set expectation direction, not precision.

| Cohort | Pre-fix LCP median (Task 9.3 POC-4) | Post-fix LCP (directional estimate) | (Hypothetical) recovery |
|---|---|---|---|
| Cold-MISS | ~4,775 ms | **~2,810 ms (= FCP median; back-of-envelope)** | ~1,965 ms (41%) |
| Warm-HIT | ~4,705 ms | **~2,730 ms (= FCP median; back-of-envelope)** | ~1,975 ms (42%) |

🔴 Precise post-fix LCP **cannot be reliably projected from breakdown data** because of the timebase reconciliation gap. Empirical re-measurement is the only way to determine actual recovery.

### §4.2 Gate-crossing analysis

**Even in the optimistic projection (~2,730 ms), LCP remains ~5.5× over the v1 L228 ≤500 ms gate.** This fix does NOT cross the gate. Value-prop framing:
- Removes a Lighthouse-measurement artifact (the opacity-ramp animation triggers LCP-detection threshold-wait); **does NOT improve user-perceived time-to-content** (text is human-visible at opacity 0.3 from first paint)
- Aligns Vercel Lighthouse-LCP with Task 8.12 localhost baseline (≈ 2,724 ms) — eliminating an apparent "Vercel network overhead" that was actually a CSS-animation artifact in the LCP metric, conflated with some smaller residual network overhead
- Reveals the TRUE post-FCP Lighthouse-LCP baseline on Vercel, exposing what real architectural levers would target

**Per-run gate-crossing post-fix (directional projection):** 0/n — same 0% as pre-fix; the fix does not approach the gate.

### §4.3 What the fix REVEALS about subsequent lever options

Post-fix, the new bottleneck distribution becomes:
- FCP (median ~2,730 ms): network + server + initial-paint
- LCP ≈ FCP

To cross the ≤500 ms gate, FCP itself must drop to ~500 ms. That requires:
- **Reducing initial bundle size** (currently ~11.6 MB `totalByteWeight` per attribution audit; even with throttled measurement, this is large for an initial paint)
- **Inlining critical CSS + first paint content**
- **OR architectural pivot to a different paint-strategy** (e.g., minimal-shell + progressive content)

But this is **OUT OF SCOPE for the CSS-animation fix lever.** The fix is a hygiene improvement that prepares the ground for subsequent FCP-reduction levers.

---

## §5. Risks + open questions

### §5.1 Risk: fix doesn't recover the full 2,000 ms

Lighthouse's LCP detection model + Chromium's element-visibility heuristics are not fully transparent. The fix MAY recover less than projected if:
- LCP has other contributors beyond the opacity ramp (e.g., font-load delay for the Inter font)
- The animation duration is somehow affecting LCP independently of opacity

**Mitigation:** empirical verification post-deploy via re-running `Scripts/analyze_lcp_attribution_phase9.mjs` against the post-fix POC URL.

### §5.2 Risk: fix introduces UX regression

The animation pulsation is a marketing/aesthetic choice. Fix Options A/B/D each preserve some form of pulsation; Option C removes it entirely.

**Mitigation:** UX team review for Option A (subtle phase-shift); SKIP Option C without UX approval.

### §5.3 Open question: what is the "true" LCP after CSS fix?

The CSS fix removes the artifact penalty. After fix, what's the actual LCP attribution? It might surface NEW bottlenecks (e.g., font-load wait, post-paint async work).

**Resolution:** post-deploy empirical attribution re-run will identify what the next REAL bottleneck is. Without this fix, the animation artifact MASKS subsequent bottlenecks.

### §5.4 Open question: does this fix affect SecurityRoute LCP?

The `/security` route renders SecurityPortal in a Suspense fallback (not the LoginScreen overlay). The CSS animation fix only affects the default route's LCP. SecurityRoute LCP attribution is a separate question.

**Resolution:** out-of-scope for this fix; if SecurityRoute LCP matters for v1 L228, a separate attribution pass is needed.

### §5.5 Open question: are there OTHER opacity-ramping animations causing similar LCP artifacts elsewhere?

The `flashText` animation is one occurrence. Are there sister-shape animations in:
- LoginScreen avatar entry animations
- AdminShell launch animations
- StrataDashboard tab animations

**Resolution:** post-fix codebase grep for `opacity` + `animation` + `keyframes` patterns; cross-check against any future LCP element identifications.

---

## §6. Cowork decision gate — RESOLVED 2026-05-23

🔴 **Cowork verdict-lock 2026-05-23: CSS-animation fix DEFERRED, not authorized at this time.** Reason: metric-hygiene-only (Lighthouse-LCP artifact, NOT user-experience delay); still ~5.5× over the v1 L228 ≤500 ms gate even at optimistic projection; alters a deliberate design effect (the flashing pulsation is intentional UX). This doc stays as a **documented future option**.

### §6.1 Decision-state (post-Cowork-verdict)

| Decision | Outcome |
|---|---|
| Fix Option selection (A/B/C/D) | **DEFERRED — none selected** |
| UX team consultation | NOT triggered (no fix authorized) |
| Task numbering for implementation | NOT assigned (no implementation task scoped) |
| Deploy gate | N/A (no deploy authorized; this doc is the entire deliverable) |
| Class designation for THIS scoping doc | SCOPING-ONLY 7pt → 8pt extension CANDIDATE (see §8.2); cementation deferred — Cowork has not authorized further calibration extensions on this lever alone |

### §6.2 Conditions under which this lever might be revisited

This doc remains usable IF Cowork or Ilya later determines that Lighthouse-LCP metric hygiene becomes load-bearing — e.g.:
- A subsequent lever is scoped that REQUIRES a clean Lighthouse-LCP baseline to attribute its impact (the current ~1,000 ms artifact would obscure the lever's effect)
- An external stakeholder/marketing constraint requires Lighthouse-LCP improvement specifically (vs user-perceived performance)
- The flashing pulsation UX is retired for a separate UX reason, naturally removing the artifact

Otherwise this lever should stay deferred — fixing a Lighthouse-only artifact provides no user-experience value, and the v1 L228 gate is not approached either way.

### §6.3 What this scoping doc does NOT do (cemented at Cowork DEFERRED verdict)

- **NO production-source edit** (DEFERRED; `LoginScreen.css` UNTOUCHED)
- **NO redeploy** (DEFERRED; throwaway branch stays at `7e822a2`)
- **NO PR for implementation** (no implementation task scoped)
- **NO assumption** that future levers depend on this fix landing first
- **NO ratification** of the fix UX-trade-offs (UX team not consulted; not needed for DEFERRED state)

---

## §7. Carry-forward + interactions

### §7.1 Interaction with B-α (REJECTED)

B-α was rejected at Task 9.3 POC-4. This CSS fix lever does NOT depend on B-α; can ship independent of any CDN-edge decision.

### §7.2 Interaction with B-γ (REJECTED)

B-γ (island-hydration) was rejected at Task 9.3 POC-6 attribution (TBT=0 contradicts hydration-JS-cost rationale). This CSS fix lever supersedes B-γ as the next-priority lever.

### §7.3 Post-fix lever recommendations (informational)

After the CSS fix (IF authorized + landed), the empirical LCP baseline would directionally fall toward ~2,730 ms (per §4.1 directional estimate; precise number requires empirical re-measurement). To progress further toward the v1 L228 ≤500 ms gate, candidate lever families:
- **FCP reduction:** bundle-size reduction (Phase-7 7.10 lazy-load lever was directionally correct but exhausted; revisit other code-splitting opportunities), critical-CSS inlining
- **Initial-paint minimization:** smaller initial DOM tree; defer non-critical components to post-paint
- **Architectural pivot:** separate static-landing-page architecture (e.g., a `/` route that's truly static, separate from the React app) — out-of-scope for Phase-9+ without explicit authorization

Per Phase-8+ Task 8.13 perf-lever-stacking-EXHAUSTED finding at HEAD-post-8.11 architecture, in-architecture perf-lever options are saturated. Cross-architecture levers (separate static landing) are the next family to scope IF the v1 L228 gate remains a live objective post-CSS-fix.

---

## §8. Sister-shape precedent + class designation

### §8.1 Sister-shape to Phase-9+ Task 9.2 (B-α CDN-edge scoping)

| Dimension | Task 9.2 B-α scoping | THIS doc (CSS-fix scoping) |
|---|---|---|
| Lever family | CDN-edge (architectural-axis shift) | UI-render / CSS-animation (hygiene-level fix) |
| Architectural delta | LARGE (deploy migration; preset adoption; smoke-test/CI co-shipping) | SMALL (1-3 line CSS edit) |
| Scoping doc size | 46,742 B / 605 lines | this doc — projected smaller |
| Class designation | SCOPING-ONLY 6pt → 7pt CROSS-PHASE-BOUNDARY-SHAPE-CONTINUATION | SCOPING-ONLY 7pt → 8pt CROSS-PHASE-SHAPE-ROBUSTNESS-EXTENSION |
| Empirical-evidence basis | Projection-based (§5 projections; REFUTED by POC-4) | Empirical-evidence-based (Task 9.3 POC-6 attribution; LCP element + breakdown identified) |
| Implementation task altitude | Task 9.3 POC (deploy + measure) | Future Task 9.X (CSS edit + deploy + re-measure) |

### §8.2 Class designation rationale

**SCOPING-ONLY 7pt → 8pt CROSS-PHASE-SHAPE-ROBUSTNESS extension** (NOT a NEW class).

NEW sub-shape (8): **`empirical-attribution-driven-lever-family-redirection`**. Sister-shape rationale:
- Task 9.2 sub-shape (7) was projection-based architectural-axis-shift scoping (CDN-edge from §5 projection)
- Task 9.3 POC-6 EMPIRICALLY REFUTED the §5 projection + identified a DIFFERENT lever family via attribution
- This doc scopes the empirically-attributed lever family — sister-shape to a "course-correction" scoping deliverable
- Empirically-grounded scoping (post-attribution) is structurally distinct from projection-based scoping (Task 9.2) → NEW sub-shape

Deliverable shape matches SCOPING-ONLY definition exactly: forward-scoping + no production source touched + decision-tree (Fix Options A/B/C/D) + qualitative projections + risks/OQs + Cowork decision gate.

---

**Phase-9+ next-lever scoping doc LOCKED at this draft.** Recommendation: ratify Fix Option A as Task 9.4 deliverable; Ilya gates implementation + deploy.

🧪
