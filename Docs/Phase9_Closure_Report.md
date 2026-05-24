# Phase-9+ Closure Report

**Status.** Phase-9+ FULLY CLOSED 2026-05-23.
**HEAD on `main` at closer authoring:** `3564f0d` (Task 9.5 squash; closer-SHA pending squash of this PR).
**Phase duration.** 2026-05-21 → 2026-05-23 (3 calendar days; 6 PRs at #85 → #90 + closer #91).
**Phase character.** **Pure zero-production-source phase** — ZERO `qualia-shell/src/**` + `qualia-shell/app/**` + `Scripts/**` production-runtime touched across all 6 squashes. Doc / scoping / audit / measurement / decision phase entirely.
**Class designation.** CLOSURE-NARRATIVE-CONSOLIDATION (11th class; sister to Phase-6 + Phase-7 + Phase-8+ closure reports; this is the 4th project-wide CLOSURE-NARRATIVE-CONSOLIDATION data point).
**Cross-references.**
- `Docs/Phase8_Closure_Report.md` — sister-shape Phase-8+ closure (488L / 88,075 B; 3rd CLOSURE-NARRATIVE-CONSOLIDATION data point).
- `Docs/Phases/Phase_9_Plan.md` — Phase-9+ kickoff brief (376L / 38,033 B; canonical Block A/B/C scope record + per-task disposition cement).
- `Docs/Phase9_Task_9_3_POC_HandoffPackage.md` — Block B B-α POC empirical record + LCP attribution + B-γ refutation.
- `Docs/Phase9_LCP_Element_Render_Delay_Scoping.md` — CSS-animation lever DEFERRED scoping doc.
- `Docs/Phase9_Widget_SSR_Audit.md` — Task 9.4 widget-altitude SSR audit (274L / 24,614 B).
- `Docs/CLAUDE_history.md` — demoted verbose narratives + v2.60.1 cluster altitude candidates.

---

## §0. Executive summary

Phase-9+ ran 2026-05-21 → 2026-05-23 across 6 PRs (#85 through #90 + closer #91). The phase is structurally distinct from prior phases at this project: **no production source was modified**. Every task delivered docs, scopes, audits, empirical measurements, or stakeholder-decision cementations — not code. This is the **first pure zero-production-source phase** in the project.

The **headline outcome** is the v1 L228 ≤500 ms LCP disposition flip from (b) PARTIAL-MET → **(a) STRUCTURALLY UNATTAINABLE** per Ilya stakeholder verdict-lock 2026-05-23 (supersedes the 2026-05-21 (b) Q1 LOCK at Phase-9+ kickoff). The flip is engineering-judgment, NOT a mathematical impossibility-proof: best measured LCP at Phase-8 Task 8.12 was 2,724 ms = 5.4× over the 500 ms gate; Phase-9 Block-B empirically refuted the candidate architectural levers (B-α CDN-edge: −1.5% LCP; B-γ island-hydration: REFUTED via TBT=0 + TTI===LCP); residual LCP is FCP-dominant + a Lighthouse CSS-animation artifact; crossing ≤500 ms would require fundamental re-architecture out of v1 scope. (b) PARTIAL-MET is retained as a progress-record (4,653 → 2,724 ms = −41% cumulative across Phase-6/7/8 architectural arcs).

The other notable outcomes: Block A item A1 (widget-altitude SSR audit, Task 9.4) cemented 3 init-time-UNSAFE hits as INFORMATIONAL via a reachability-negative DOUBLE mechanism (AuthGate Branch 3 gating + `lazyWithReload` Suspense-shield at `WINDOW_COMPONENTS`). Block C closed fully — C1 (Linux Playwright baselines) was discovered to have been RESOLVED at Phase-7 (stale-deferred-item refutation; the CLAUDE.md entry had decayed across phases); C2 (`nebula-bg.mp4` 70.96 MiB) ACCEPTED+MONITORED per Ilya 2026-05-23; C3 (untracked baseline JSONs) RESOLVED at the 9.1 OPENER.

Exit-gate strict-mirror runs CLEAN at this closer altitude (tsc + vitest 278/39 + 2 react-router builds + PII verify + SSR smoke-test — all 6 stages green), empirically validating the zero-production-source phase character — no independent regression risk introduced.

---

## §1. Arc narrative — Block A + Block B + Block C

### §1.1 Block A — Widget + provider SSR polish

4 items in Block A at Phase-9+ kickoff: A1 widget-altitude SSR audit + A2 AuthGate hydration-flash Option β Suspense + A3 AuthGate hydration-flash Option γ pre-hydration cookie + A4 LCP bimodal cluster A investigation.

| Item | Task | Disposition |
|:--|:--|:--|
| **A1** widget-altitude SSR audit | Task 9.4 (`9f7b96e` PR #89) | ✅ **RESOLVED — INFORMATIONAL catalog.** 3 init-time-UNSAFE hits at widget altitude (TranscriptionHub.tsx:312 + :376 + StellaAgent.tsx:270) all reachability-NEGATIVE via DOUBLE mechanism (AuthGate Branch 3 gating + `lazyWithReload` Suspense-shield). Empirically validated by Phase-8 Task 8.11 5-phase SSR smoke-test. NO remediation required. Audit doc at `Docs/Phase9_Widget_SSR_Audit.md`. |
| **A2** AuthGate hydration-flash polish (Option β Suspense) | NOT executed | ⏳ Optional UX polish, Ilya-gated. LCP-regression caveat MOOT post v1 L228 (a)-flip. Mutually-redundant with A3 (pick-one if pursued). Carries forward to Phase-10+ (optional). |
| **A3** AuthGate hydration-flash polish (Option γ pre-hydration cookie) | NOT executed | ⏳ Optional UX polish, Ilya-gated. LCP-regression caveat MOOT. Mutually-redundant with A2. Carries forward to Phase-10+ (optional). |
| **A4** LCP bimodal cluster A investigation (Phase-8 5,500 ms vs 2,724 ms bimodal at localhost) | NOT executed | 🔴 **MOOT.** Two-fold: (i) LCP no longer a live objective post-(a)-flip; (ii) Task 9.3 POC-4 empirically showed cluster A entirely collapsed at Vercel (10/10 runs in single cluster — bimodal shape was localhost-specific). No further investigation warranted. |

**Block A disposition at Phase-9+ close:** 1 RESOLVED (A1) + 2 deferred-optional (A2/A3) + 1 MOOT (A4). Net: Block A is "as-resolved-as-it-needs-to-be" for v1; remaining items are cosmetic Ilya-gated polish.

### §1.2 Block B — LCP architectural exploration

2 items at kickoff: B-α CDN-edge HTML-delivery + B-γ island-hydration. (B-β HTTP/3 was kickoff-considered but not formally scoped; subsumed into "remaining levers post B-α B-γ refutation".)

**Block B arc trajectory (per task close):**

| Step | Task | Outcome |
|:--|:--|:--|
| Scoping | Task 9.2 (`6c430c4` PR #86) | B-α CDN-edge SCOPING-ONLY 7pt extension — Vercel platform selected; SSR-preserving via `@vercel/react-router` preset; pre-deploy reconciliation surfaced. |
| POC | Task 9.3 (`a2a253e` PR #87) | B-α POC-4 + POC-6 EMPIRICAL: −1.5% LCP cold-vs-warm (ROBUST claim: "HTML-delivery edge-caching does not move LCP"); 0/10 gate-crossing both cohorts. B-γ HYPOTHESIS REFUTED at attribution altitude — TBT=0 + TTI===LCP exactly across all 20 runs = NO hydration-JS cost to eliminate. Empirical LCP bottleneck = CSS animation on `.login-start-text` (`flashText` 3s opacity 0.3↔1.0 keyframe; ~1,095 ms raw `elementRenderDelay` per Lighthouse `lcp-breakdown-insight`). CSS-fix scoped at `Docs/Phase9_LCP_Element_Render_Delay_Scoping.md` then **DEFERRED** per Cowork ship verdict 2026-05-23 — metric-hygiene-only (Lighthouse artifact, NOT user-perceived; text human-visible at opacity 0.3 throughout) + gate still NOT crossed at projected post-fix LCP. |
| Disposition flip | v1 L228 disposition (`bfcc654` PR #88) | v1 L228 disposition RE-RATIFIED (b) → **(a) STRUCTURALLY UNATTAINABLE** per Ilya stakeholder verdict 2026-05-23 across 4 canonical locations (Phase_9_Plan.md frontmatter + §1 B1 row + §2 verdict-record + §7 risk register + §8 entry-state + §10 transition signal; Phase9_Task_9_3_POC_HandoffPackage.md §4.4 + §4.7; CLAUDE.md L13 + L28 + L33). |

**Block B disposition at Phase-9+ close:** CONCLUDED as **documented negative result**. The architectural-axis-exploration arc was scoped, POC-validated, refuted, and ratified-as-conclusive. No further LCP-gate-crossing levers will be pursued under v1. (b) PARTIAL-MET is retained as the progress-record of the cumulative −41% trajectory; (a) STRUCTURALLY UNATTAINABLE is the empirical-default verdict against the v1 L228 gate.

### §1.3 Block C — Project-wide housekeeping

3 items at kickoff: C1 Linux Playwright baselines + C2 nebula-bg.mp4 LFS-migration decision + C3 untracked baseline JSONs.

| Item | Disposition |
|:--|:--|
| **C1** Linux Playwright baselines | ✅ **RESOLVED PRE-PHASE-9+** at Phase-7 Tasks 7.5+7.6 (`16c2ac2` PR #60 2026-05-13). The CLAUDE.md "Deferred Items" entry #1 was empirically refuted at Task 9.5 PRE0 sweep: 8 `*-chromium-linux.png` baselines committed + screenshot-baseline CI step `continue-on-error: false` BLOCKING per `.github/workflows/appfolio-parity-gate.yml`. **Stale-deferred-item refutation cemented as v2.60.1 17th-altitude candidate** (sub-shape: `cited-deferred-item-DOES-NOT-MATCH-repo-state-empirical-refutation`). |
| **C2** `nebula-bg.mp4` 74,409,677 B / 70.96 MiB | ✅ **ACCEPTED + MONITORED per Ilya 2026-05-23.** Under GitHub 100 MB hard limit (only over 50 MB soft-warning). No migration required at v1. LFS-migrate guardrail REMAINS in force. Reframed from "needs LFS/CDN/replacement" to ACCEPTED+MONITORED disposition. |
| **C3** Untracked baseline JSONs | ✅ **RESOLVED at Phase-9+ Task 9.1 OPENER `5043587`.** 6 baseline JSONs (5 Phase-0 axe + 1 Phase-6 6.7 perf) committed as historical baselines (8,572 B total). Empirical-vs-projection drift (~7 projected → 6 empirical = 86% accuracy) cemented as v2.60.1 cluster 16th altitude (cross-phase-AND-task-BOUNDARY drift). |

**Block C disposition at Phase-9+ close:** 🎯 **FULLY CLOSED.** 3-of-3 items resolved (2 pre-existing-resolved-but-surfaced + 1 newly resolved at Task 9.1 OPENER).

---

## §2. Headline engineering-signals

### §2.1 Zero-production-source phase character (FIRST in project)

**Empirically verified across all 6 squashes:** ZERO files touched under `qualia-shell/src/**` or `qualia-shell/app/**` or `Scripts/**` (production-runtime scope). Every deliverable was a `Docs/**` file or `CLAUDE.md` or a `Docs/Baselines/**` artifact commit.

This is structurally distinct from prior phases:
- Phase-6: production-source edits (a11y fixes + perf font-defer revert)
- Phase-7: production-source edits (lazy-load architecture + test-infra fixes)
- Phase-8: heavy production-source edits (RR v7 framework adoption + SSR migration + provider remediation)
- **Phase-9: NO production-source edits**

Phase-9 is a **doc / scoping / audit / measurement / decision phase**. Its character matches the SCOPING-ONLY class definition extended to phase-altitude (vs task-altitude). This phase character is a publishable engineering-signal in itself — it demonstrates the project can run a substantive multi-week arc on docs alone when the empirical verdict requires it.

### §2.2 v1 L228 (a) STRUCTURALLY UNATTAINABLE final verdict + rationale

**Precise framing (cemented verbatim per Cowork verdict 2026-05-23):**

> "v1 L228 ≤500 ms LCP is STRUCTURALLY UNATTAINABLE within the current React 19 SPA-shell architecture. Empirical basis: best measured LCP ~2,724 ms (Phase-8 Task 8.12 localhost; −41% from the Phase-6 4,653 ms baseline) — still 5.4× over the 500 ms gate. Phase-9 Block-B architectural exploration empirically refuted the remaining candidate levers: B-α CDN-edge (−1.5% LCP; Task 9.3 POC) and B-γ island-hydration (TBT=0 → no JS-blocking cost to remove; Task 9.3 attribution). Residual LCP is dominated by FCP (JS bundle download/parse + first paint; Phase-7 lazy-load already exhausted) plus a Lighthouse CSS-animation artifact. Crossing ≤500 ms would require fundamental re-architecture (e.g. a separate truly-static / server-rendered real-content landing replacing the SPA shell at `/`), OUT OF v1 SCOPE. (b) PARTIAL-MET is retained as the record of progress achieved (4,653 → 2,724 ms, −41%); (a) is now the ratified primary disposition."

**Disposition delta:**
- 2026-05-21 (Phase-9+ Task 9.1 OPENER Q1 LOCK): RATIFIED **(b) PARTIAL-MET** PRIMARY; (a) STRUCTURALLY UNATTAINABLE retained as minority footnote for architectural risk register.
- 2026-05-23 (Phase-9+ Task 9.3 close → disposition flip PR #88): RE-RATIFIED **(a) STRUCTURALLY UNATTAINABLE** PRIMARY; (b) PARTIAL-MET demoted to progress-record.

**Engineering-judgment vs impossibility-proof.** The (a) verdict is engineering-judgment, not a mathematical impossibility-proof. It rests on three empirical legs: (i) the Phase-6/7/8 architectural arcs each closed ~30-40% of the remaining gap but none crossed 500 ms; (ii) Phase-9 Block-B empirically refuted both remaining candidate levers in the React 19 + Vite 6 + RR v7 framework-mode + ssr:true architecture; (iii) the residual LCP attribution shows FCP-dominance + a Lighthouse measurement artifact — neither addressable by levers within the current architecture. Crossing ≤500 ms is RESERVED for v2 architecture (separate static landing / Astro/Fresh-style island-hydration architecture / alternative gate definition).

### §2.3 Block B negative-result discipline (B-α + B-γ refuted + CSS-artifact attribution)

Phase-9 Block B established a **strong negative-result discipline pattern** at the project. The arc:
1. **B-α SCOPED** at Task 9.2 with empirical decision-tree (5 deploy-platform candidates considered; Vercel selected; SSR-preserving via preset).
2. **B-α POC-deployed** at throwaway branch `feat/phase-9-task-9.3-vercel-deploy-only` @ `7e822a2` (do-not-merge; preserved as deploy artifact).
3. **B-α empirically MEASURED** (n=10 cold-MISS vs warm-HIT against live Vercel POC): PRIMARY −1.5% LCP cold-vs-warm; 0/10 gate-crossing both cohorts. ROBUST claim: "HTML-delivery edge-caching does not move LCP." The confounded localhost-vs-Vercel +72.7% comparison was held at empirical-data altitude but NOT used as a disposition driver.
4. **B-γ HYPOTHESIS REFUTED** at attribution altitude via Cowork PART B verdict — TBT=0 + TTI===LCP exactly across all 20 runs = NO hydration-JS cost to eliminate; B-γ would NOT move LCP.
5. **Empirical bottleneck attributed** to CSS animation on the LCP element (`.login-start-text` "CLICK TO ACCESS TERMINAL"; `flashText` 3s opacity 0.3↔1.0 keyframe causes ~1,095 ms raw `elementRenderDelay` per Lighthouse `lcp-breakdown-insight`).
6. **CSS-fix lever DEFERRED** per Cowork ship verdict 2026-05-23 — metric-hygiene-only (Lighthouse artifact, NOT user-perceived delay; text human-visible at opacity 0.3 throughout) + gate still NOT crossed at projected post-fix LCP.
7. **(a)-flip** at PR #88.

This is a publishable engineering-record pattern: **rigorous architectural lever refutation requires SCOPE → POC → empirical measurement → attribution → disposition cement**. The arc resolved to a defensible negative result rather than a guess-and-implement loop.

Caveats cemented as standing engineering record:
- **Lighthouse-LCP-metric vs user-perception distinction.** LCP-detection threshold-crossing on opacity-ramped animation is a Lighthouse measurement artifact. Real users SEE text at opacity 0.3 (human-visible) throughout. CSS-fix lever value-prop is metric-hygiene-only.
- **Raw-vs-throttled timebase reconciliation gap.** `lcp-breakdown-insight` reports RAW observed-trace timings (TTFB 188 + ERD 1,095 ≈ 1,283 ms) that do NOT cleanly reconcile with throttled-simulated LCP (~4,750 ms median; gap ~3,467 ms unexplained at throttled altitude). Breakdown identifies LCP element + names dominant raw phase but does NOT predict exact magnitude of throttled-LCP recovery post-fix.

### §2.4 Recursive-validation continuation (P2 standing convention)

Phase-9 cemented **two more empirical refutations** of cited starting-point hypotheses at task PRE0 altitude:

- **Task 9.4 PRE0:** Cited "widget directories" likely paths (`qualia-shell/src/widgets/**` + `components/**/widgets/**`) **EMPIRICALLY REFUTED** via `ls`+`find` sweep — those directories DO NOT EXIST. Widgets are a registry-membership-defined set at `qualia-shell/src/registry/widgetRegistry.ts:WIDGET_REGISTRY` under `components/<WidgetName>/` siblings (24 entries + 1 sibling file).
- **Task 9.5 PRE0:** Cited "Deferred Items" entry #1 ("Linux Playwright baselines… Until done, the Playwright CI step is informational") **EMPIRICALLY REFUTED** — 8 `*-chromium-linux.png` baselines committed at Phase-7 7.5/7.6 (`16c2ac2` PR #60); screenshot-baseline CI step BLOCKING.

Both surface as PRE0 empirical-vs-cited refutations at task-PRE0-discipline altitude. P2 recursive-validation discipline (CEMENTED at Phase-9+ Task 9.1 OPENER per Q2 LOCK) continues to deliver substantive engineering record per task.

### §2.5 Widget-audit reachability-negative DOUBLE mechanism (NEW Finding KK)

**Task 9.4 Finding KK (NEW; per-route Suspense-shield SSR-safety pattern).** Library-mode RR v7 + framework-mode `ssr:true` + `lazyWithReload`-at-widgetRegistry-altitude is a **structurally-SSR-safe pattern at React 19**. Any future widget added via the `widgetRegistry.ts:WIDGET_REGISTRY` table inherits the reachability-negative SSR-safety guarantee by construction. The audit catalogued 3 init-time-UNSAFE widget hits (`useState(() => browser-global)` lazy initializers at TranscriptionHub.tsx:312 + :376 + StellaAgent.tsx:270) and confirmed all 3 unreachable via:
- **Mechanism (A):** AuthGate Branch 3 gating — fresh-session widgets unmounted at `/` (LoginScreen renders instead).
- **Mechanism (B):** `lazyWithReload` Suspense-shield at `WINDOW_COMPONENTS` (`React.LazyExoticComponent<...>`) — Suspense-catches lazy promise server-side at ALL branches including popup direct-URL.

Mechanism (B) is the STRONGER guarantee — independent of branch routing.

### §2.6 Class extensions without new classes (calibration past extensions)

Phase-9 introduced **ZERO new classes**. The cumulative class count stays at **19** (1 PRE-PHASE-6 + Phase-6 +2 + Phase-7 +4 + Phase-8 +4 + Phase-9 +0). Phase-9 instead **extended existing classes via cross-phase calibration**:

- **SCOPING-ONLY** 5pt → 8pt across 9.1 + 9.2 + 9.4 close-cycles (NEW sub-shapes: (6) cross-phase-boundary-kickoff-with-stakeholder-decision-resolution @ 9.1 + (7) architectural-axis-shift-scoping-CDN-edge-deploy-platform-decision-tree @ 9.2 + (8) widget-altitude-SSR-safety-audit-with-reachability-negative-verdict @ 9.4). SCOPING-ONLY now **highest cross-phase-distributed class** in the project (Phase-8 5pt + Phase-9 3pt = 8pt cross-phase-distributed; vs MEASUREMENT-ONLY 11pt absolute-count concentrated in Phase-7 + Phase-8 + Phase-9).
- **MEASUREMENT-ONLY** 10pt → 11pt @ Task 9.3 (NEW sub-shape (11) `LCP-cold-vs-warm-cohort-comparison-AND-element-attribution-at-remote-URL`; folds POC-4 cohort comparison + POC-6 LCP-attribution into a single Task 9.3 deliverable).
- **DOC-CORRECTION-ONLY** applied @ Task 9.5 (Block C close; pre-existing class — first Phase-9 application).
- **CLOSURE-NARRATIVE-CONSOLIDATION** 3pt → 4pt at this closer (NEW sub-shape: zero-production-source-phase-closure).

The pattern: phases CAN deliver substantive engineering record via existing-class extensions when sister-shape extensions are structurally available, without spawning new classes. This is conservative-default discipline (sister to Task 8.13 perf-lever-refutation precedent).

---

## §3. Finding / disposition catalog (single-line cross-refs)

**Phase-9-introduced findings (3 widget-altitude INFORMATIONAL at Task 9.4 + various per-task PRE0/POC findings):**

- **Finding II (cross-phase; PROMOTED Phase-8 Task 8.11 → Phase-9 Task 9.4 catalog).** `TranscriptionHub.tsx:376` `useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition))`. Init-time-UNSAFE; REACHABILITY-NEGATIVE via DOUBLE mechanism. INFORMATIONAL. See `Docs/Phase9_Widget_SSR_Audit.md §2.1 / §3.3`.
- **Finding JJ (NEW; reachability-negative DOUBLE mechanism).** Widget-altitude init-time-UNSAFE hits are protected by BOTH (A) AuthGate Branch 3 gating AND (B) `lazyWithReload` Suspense-shield at `WINDOW_COMPONENTS`. Mechanism (B) holds independent of branch. See `Docs/Phase9_Widget_SSR_Audit.md §3.2 / §3.3`.
- **Finding KK (NEW; structural SSR-safety pattern).** Library-mode RR v7 + framework-mode `ssr:true` + `lazyWithReload`-at-widgetRegistry-altitude is structurally-SSR-safe at React 19. NEW widgets inherit the guarantee by registry-convention adherence. See `Docs/Phase9_Widget_SSR_Audit.md §0 / §6.2`.
- **Widget-altitude INFORMATIONAL catalog (3 hits):** TranscriptionHub.tsx:312 (`crypto.randomUUID()`) + TranscriptionHub.tsx:376 (`window.SpeechRecognition`; = Finding II) + StellaAgent.tsx:270 (`localStorage.getItem(...)`). All REACHABILITY-NEGATIVE via DOUBLE mechanism. See `Docs/Phase9_Widget_SSR_Audit.md §2.1`.
- **Task 9.3 POC-4 ROBUST claim.** "HTML-delivery edge-caching does not move LCP" (PRIMARY signal: −1.5% LCP cold-MISS vs warm-HIT; same-platform; internally valid). See `Docs/Phase9_Task_9_3_POC_HandoffPackage.md §4.2 / §4.3`.
- **Task 9.3 POC-6 LCP element attribution.** LCP element = `body > div.login-start-overlay > div.login-start-text` ("CLICK TO ACCESS TERMINAL"); `flashText` 3s opacity 0.3↔1.0 keyframe; ~1,095 ms raw `elementRenderDelay`. Lighthouse measurement artifact, NOT user-perceived delay. See `Docs/Phase9_Task_9_3_POC_HandoffPackage.md §4.6` + `Docs/Phase9_LCP_Element_Render_Delay_Scoping.md §1.3`.
- **B-γ empirical refutation at attribution altitude.** TBT=0 + TTI===LCP exactly across all 20 runs (n=10 cold + n=10 warm) = NO hydration-JS cost to eliminate. Sister-shape to Task 8.11 attribution discipline. See `Docs/Phase9_Task_9_3_POC_HandoffPackage.md §4.3 / §4.6`.
- **C1 stale-deferred-item refutation (Task 9.5).** Cited CLAUDE.md "Deferred Items" entry #1 "Linux Playwright baselines… Until done, the Playwright CI step is informational" REFUTED by 8 committed `*-chromium-linux.png` + blocking CI step. v2.60.1 17th-altitude candidate (sub-shape: `cited-deferred-item-DOES-NOT-MATCH-repo-state-empirical-refutation`). See `Docs/CLAUDE_history.md` bullet (post-Task-9.5 close).
- **Task 9.4 PRE0 directory-citation refutation.** Cited "widgets/**" directory paths DO NOT EXIST; widgets are registry-membership-defined set in `components/<Name>/` siblings. v2.60.1 17th-altitude candidate (sub-shape: `cited-directory-paths-DO-NOT-EXIST-empirical-refutation`). See `Docs/Phase9_Widget_SSR_Audit.md §7.4`.

**Phase-9-cemented disposition records:**
- **v1 L228 (a) STRUCTURALLY UNATTAINABLE.** RE-RATIFIED per Ilya 2026-05-23 across 8 canonical locations (Phase_9_Plan.md frontmatter + §1 B1 row + §2 verdict-record dual-framing + §2 Framing (a) section + §2 Framing (b) demotion + §7 risk register + §8 entry-state + §10 transition signal; Phase9_Task_9_3_POC_HandoffPackage.md §4.4 + §4.7; CLAUDE.md L13 + L28 + L33 — all flipped at `bfcc654` PR #88). See §2.2 above.
- **Block B CONCLUDED as documented negative result.** No further LCP-gate-crossing levers under v1.
- **CSS-fix lever DEFERRED.** Doc preserved at `Docs/Phase9_LCP_Element_Render_Delay_Scoping.md` as documented future option; NOT authorized for implementation. Metric-hygiene-only.
- **headers() Cache-Control fix DECLINED** per Cowork PART D — hygiene-only; zero LCP impact per POC-4.

---

## §4. Class calibration final-state

**19 distinct classes** cumulative at Phase-9+ close (UNCHANGED from Phase-8+ closure; Phase-9 +0 NEW classes per zero-production-source-phase character + Cowork-ratified sister-shape rationale).

| Class | Cumulative | Phase-9 contribution | Notes |
|:--|:-:|:--|:--|
| **SCOPING-ONLY** (16th cumulative class; Phase-8+ Task 8.1) | **8pt** | 5pt → 8pt (5→6 @ 9.1 + 6→7 @ 9.2 + 7→8 @ 9.4) | **Highest cross-phase-distributed class** (Phase-8 5pt + Phase-9 3pt). Sub-shapes (8): (1) forward-scoping-roadmap @ 8.1 + (2) provider-tree-audit @ 8.3 + (3) NO-extraction-empirical-refutation @ 8.5 + (4) per-route-SSR-opt-out-INFEASIBLE @ 8.8 + (5) perf-lever-stacking-EXHAUSTED @ 8.13 + (6) cross-phase-boundary-kickoff-with-stakeholder-decision-resolution @ 9.1 + (7) architectural-axis-shift-scoping-CDN-edge-deploy-platform-decision-tree @ 9.2 + (8) widget-altitude-SSR-safety-audit-with-reachability-negative-verdict @ 9.4. |
| **MEASUREMENT-ONLY** (9th cumulative class; Phase-7 Task 7.10) | **11pt** | 10pt → 11pt @ 9.3 | **Highest absolute-count cross-phase** (Phase-7 3pt + Phase-8 1pt + Phase-9 1pt). NEW sub-shape (11) `LCP-cold-vs-warm-cohort-comparison-AND-element-attribution-at-remote-URL` (folds POC-4 cohort comparison + POC-6 LCP-attribution into a single Task 9.3 deliverable). |
| **CLOSURE-NARRATIVE-CONSOLIDATION** (11th cumulative class; Phase-6 closer) | **4pt** | 3pt → 4pt at THIS closer | NEW sub-shape: `zero-production-source-phase-closure` (first Phase to close without ANY production-source touches). |
| **DOC-CORRECTION-ONLY** (PRE-PHASE-6 cumulative class; project-wide) | (applied @ 9.5) | First Phase-9 application | C1 stale-deferred-item refutation + C2 ACCEPTED+MONITORED reframe + C3 already-resolved confirmation at Task 9.5 close. |
| **PROVIDER-SSR-REMEDIATION** (19th cumulative class; Phase-8) | **3pt** | +0 (Phase-9 widget audit was audit-only, NOT remediation) | Reachability-negative DOUBLE mechanism at Task 9.4 obviated remediation. Would extend to 4pt only if a reachability-positive widget hit had surfaced. |

**Other class calibration unchanged at Phase-9 close:** SSR-MIGRATION-PREP 2pt (Phase-8); FRAMEWORK-INSTALLATION 3pt (Phase-8); 12 other PRE-Phase-8 classes (Phase-6 + Phase-7 + earlier) unchanged.

**Catalog state at HEAD-post-closer:** 36 active findings + 1 INFORMATIONAL deferred-to-Phase-9+ (Finding II, now resolved-as-INFORMATIONAL at Task 9.4) + 3 NEW Phase-9 widget-altitude INFORMATIONAL (Findings II + JJ + KK from Task 9.4). Vitest 278 / 39 files (UNCHANGED from Phase-8 closure; +0 vitest delta across all of Phase-9). 14 factory-produced stores (UNCHANGED). 9 in-place v2.X.X patches (UNCHANGED from Phase-8 closure; Phase-9 added 0 in-place patches per zero-production-source-phase character).

---

## §5. Cluster + discipline final-state

### §5.1 v2.60.1 anchor-bias cluster reconciliation

**Phase-8 closure cemented v2.60.1 cluster at 15 altitudes.** Phase-9 extended the cluster:

| Altitude | Source task | Sub-shape | State at Phase-9 close |
|--:|:--|:--|:--|
| 16th | Phase-9+ Task 9.1 OPENER → Task 9.2 PRE0 | `cross-phase-AND-task-BOUNDARY-projection-over-estimate-drift` (BROADENED from cross-phase-BOUNDARY-only to cross-phase + cross-task BOUNDARY) | **CEMENTED at 9.2 PRE0 per Cowork Decision-(c) cement-prompt.** 4 empirical data points (TBD-8.15 50% + baseline-JSON 86% + TBD-9.1 20% + TBD-9.2 0%). Phase-9 added 2 more confirmations at TBD-9.4 0% + TBD-9.5 0% — 6 data points total cement task-BOUNDARY 0-20% drift band. |
| 17th candidate | Phase-9+ Task 9.4 PRE0 | `cited-directory-paths-DO-NOT-EXIST-empirical-refutation` | Candidate; cementation deferred to Cowork verdict at next-altitude. |
| 17th sister-candidate | Phase-9+ Task 9.5 PRE0 | `cited-deferred-item-DOES-NOT-MATCH-repo-state-empirical-refutation` | Candidate; sister-altitude to 9.4 candidate (both surface as PRE0 empirical-vs-cited refutations at task-PRE0-discipline altitude). Cementation deferred to Cowork verdict. |

**v2.60.1 cluster verified count at Phase-9 close:** **16 altitudes CEMENTED** (15 from Phase-8 + 16th BROADENED at 9.2 PRE0) + **2 candidate altitudes** at Phase-9 Task 9.4 + 9.5 PRE0 (both sister-shape; cementation as 17th or as joint 17th-altitude pair deferred to Cowork verdict at next-altitude or Phase-10+ opener). This is the **empirically-verified count** per recursive-validation P2 — NOT projected, NOT asserted.

### §5.2 v2.74.1 branch-base discipline

**Phase-8 close cemented 5-consecutive vindication** (8.11+8.12+8.13+8.14+8.15). Phase-9 extended monotonically:
- 9.1 OPENER (6-consecutive)
- 9.2 (7-consecutive at 9.2 OPENING)
- 9.3 (8-consecutive)
- 9.4 (9-consecutive)
- 9.5 (10-consecutive)
- **Phase-9 closer (this PR): 11-consecutive vindication**

Every Phase-9 branch was created off the immediately-prior squash-SHA on `main`, never off a stale base. Discipline holds across the full phase.

### §5.3 Process-improvement standing conventions (P1 + P2)

Phase-9 inherited 2 process improvements cemented at Phase-9+ Task 9.1 OPENER per Q2 LOCK:
- **P1 v2.76.0 Cowork-directive-gate-citation-verification** at task PRE0 (PROMOTED to Phase-9+ standing PRE-FLIGHT).
- **P2 recursive-validation** (CEMENTED as cross-phase standing convention).

Both held throughout Phase-9. P2 produced two empirical refutations (Task 9.4 directory-citation + Task 9.5 deferred-item-stale; see §2.4). P1 held without notable Cowork-directive gate-citation errors.

---

## §6. v1 commitment trajectory at Phase-9 close

| Commitment | Phase-9 disposition | Empirical signal |
|:--|:--|:--|
| **v1 L230 ZERO WCAG AA threshold (4-page scope)** | ✅ **SUSTAINED.** Phase-9 touched ZERO production source → no a11y regression risk; threshold remains MET from Phase-6 cementation. | Phase-9 +0 production source delta; Phase-6 4-page WCAG AA-MET signal preserved by construction. |
| **v1 L228 ≤500 ms LCP gate** | 🔴 **(a) STRUCTURALLY UNATTAINABLE FINAL — RE-RATIFIED per Ilya 2026-05-23.** (b) PARTIAL-MET retained as progress-record. | LCP trajectory across phases (medians): Phase-6 4,653 ms → Phase-7 3,903 ms → Phase-8 2,724 ms (−41% cumulative). Phase-9 Block-B empirically refuted remaining candidate levers; gate-crossing requires v2-architecture; OUT OF v1 SCOPE. |
| **v1 ≤8 active accessibility findings (project-wide)** | ✅ **SUSTAINED.** Phase-9 introduced no new active findings; 3 NEW INFORMATIONAL widget-altitude entries are reachability-negative-cataloged (not active). | 36 active + 1 INFORMATIONAL deferred-to-Phase-9+ (now resolved) + 3 NEW INFORMATIONAL @ Task 9.4 — active count unchanged. |

---

## §7. Phase-9+ exit-gate verification (empirical)

**Strict-mirror gate run at Phase-9+ closer altitude (2026-05-23; HEAD-on-feat-branch = pre-closer-squash):**

| Stage | Command | Result | Detail |
|:--|:--|:--|:--|
| 1 | `npx tsc -b` | ✅ **PASS** (exit 0) | TypeScript build clean across all referenced projects. |
| 2 | `npx vitest run` | ✅ **PASS** (exit 0) | **278 tests across 39 files PASS** (UNCHANGED from Phase-8 close baseline; +0 vitest delta across Phase-9). Duration 2.76s. |
| 3 | `npx react-router build` (seeds=true default) | ✅ **PASS** (exit 0) | Built in 629ms; SPA Mode + ssr:true at framework-mode altitude; `build/client/index.html` + `build/server/index.js` generated; FOUC IIFE HTML-shipped via HydrateFallback per Finding V convention. |
| 4 | `VITE_APPFOLIO_SEEDS=false npx react-router build` | ✅ **PASS** (exit 0) | Built in 629ms; dual-mode SEEDS=false gate clean. |
| 5 | `node Scripts/verify_no_pii_leak.mjs` | ✅ **PASS** (exit 0) | Strict scope: 51 files scanned across 2 roots, 0 leaks (1231ms). Legacy scope: 0 files scanned, 0 findings. |
| 6 | `SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs` | ✅ **PASS** (exit 0) | 5-phase SSR smoke-test under `ssr:true` runtime: Phase A bootstrap (skip-build) + Phase B server start (HTTP 200 on `HEAD /`) + Phase C probe (raw fetch 200 / 5,949 bytes) + Phase D assertions (zero console errors + zero warnings + zero page errors; FOUC IIFE + AuthGate sanity HARD-blocking checks) + Phase E cleanup. |

**Exit-gate verdict.** **ALL 6 STAGES GREEN.** Phase-9 zero-production-source character empirically validated at closer altitude — no independent regression risk introduced (would have surfaced via tsc / vitest / build / PII / smoke-test).

---

## §8. Carry-forward to Phase-10+

### §8.1 Open items (Ilya-gated optional / cosmetic)

| Item | Source | Disposition | Phase-10+ scope candidacy |
|:--|:--|:--|:--|
| **Block A A2** AuthGate hydration-flash polish (Option β Suspense fallback) | Phase-8+ closer §7 + Phase_9_Plan.md §3 | Optional UX polish; LCP-regression caveat MOOT post-(a)-flip; Ilya-gated. | Phase-10+ candidate if pursued. Mutually-redundant with A3 (pick-one). |
| **Block A A3** AuthGate hydration-flash polish (Option γ pre-hydration cookie) | Phase-8+ closer §7 + Phase_9_Plan.md §3 | Optional UX polish; LCP-regression caveat MOOT; Ilya-gated. | Phase-10+ candidate if pursued. Mutually-redundant with A2. |
| **`.gitignore` gap (non-blocking)** | Surfaced at Phase-9 closer | `qualia-shell/build/` + `qualia-shell/.react-router/` are not in `.gitignore` — they appear in `git status` as untracked across all sessions but never staged (project convention preserves; would need explicit `git add` to commit which has never happened). Non-blocking; documented for future cleanup awareness. | Phase-10+ housekeeping candidate (CONFIG-ONLY shape). |
| **`nebula-bg.mp4` 74,409,677 B** | Phase-9+ Task 9.5 ACCEPTED+MONITORED | Under 100 MB hard limit; LFS-migrate guardrail REMAINS. Revisit only if asset count grows or future push approaches limit. | Phase-10+ monitoring (no active task). |
| **CSS-animation fix lever (LCP `.login-start-text`)** | Phase-9+ Task 9.3 DEFERRED scoping doc | Metric-hygiene-only; Lighthouse artifact, NOT user-perceived. NOT authorized for implementation. | Phase-10+ candidate IF a future lever requires clean Lighthouse-LCP baseline OR external stakeholder constraint surfaces. Otherwise stays deferred. |
| **v2.60.1 cluster 17th-altitude candidates** | Task 9.4 + Task 9.5 PRE0 | Two sister-shape candidates (directory-paths + deferred-items); both PRE0 empirical-vs-cited refutations. | Phase-10+ Cowork verdict-altitude cementation (either as 17th altitude or as joint 17th-altitude pair). |

### §8.2 Closed items (no Phase-10+ scope)

- Block A A1 widget-altitude SSR audit — CLOSED at Task 9.4 (INFORMATIONAL catalog; reachability-negative DOUBLE mechanism).
- Block A A4 LCP bimodal investigation — MOOT (LCP no longer live + bimodal collapsed at Vercel).
- Block B B-α CDN-edge POC — CLOSED at Task 9.3 (empirically refuted).
- Block B B-γ island-hydration — CLOSED at Task 9.3 (empirically refuted via TBT=0 attribution).
- Block B B-β HTTP/3 — IMPLICITLY CLOSED (was subsumed into "remaining levers post B-α B-γ refutation"; not formally scoped before Block-B arc CONCLUDED).
- Block C C1 Linux Playwright baselines — RESOLVED PRE-PHASE-9 at Phase-7 7.5/7.6.
- Block C C3 baseline JSONs — RESOLVED at 9.1 OPENER `5043587`.
- v1 L228 stakeholder-decision — RESOLVED at PR #88 (a)-flip.

### §8.3 Standing conventions persisting into Phase-10+

- **v2.74.1 branch-base discipline** — every feat branch off the immediately-prior squash-SHA on `main`.
- **P1 v2.76.0 Cowork-directive-gate-citation-verification** at task PRE0 — Phase-9+ standing PRE-FLIGHT (Phase-10+ inheritance).
- **P2 recursive-validation** — cross-phase standing convention; treat cited sources (audits / Plan-row text / Cowork-directive gate-claims / CLAUDE.md cross-refs) as STARTING-POINT-HYPOTHESES requiring empirical verification at every task PRE0.
- **CLAUDE.md byte-guard ≤40,000 B** — demote older detail to `Docs/CLAUDE_history.md` when approaching limit.
- **DOC-CORRECTION-ONLY discipline** — applied @ Task 9.5; available for future stale-doc refutation cycles.
- **Zero-production-source-phase character** — Phase-9 demonstrates phases can run substantive multi-week arcs on docs alone when empirical verdict requires it. Phase-10+ direction is Ilya-gated.

---

## §9. Closer-cementation

**Phase-9+ FULLY CLOSED 2026-05-23 (6 PRs).**

Phase-9+ delivers a substantive engineering record across docs + scoping + audit + measurement + decision altitudes without modifying any production source. The headline outcome is the v1 L228 (a) STRUCTURALLY UNATTAINABLE engineering-judgment ratification per Ilya stakeholder verdict-lock, supported by Block-B empirical refutation of the candidate architectural levers. Block A item A1 resolves via reachability-negative DOUBLE mechanism INFORMATIONAL catalog; Block C closes fully across 3 items (1 stale-deferred-item refutation + 1 ACCEPTED+MONITORED reframe + 1 newly resolved).

Phase-9+ is the **first pure zero-production-source phase** at the project. The 6-stage exit-gate strict-mirror run at this closer altitude (tsc + vitest 278/39 + 2 react-router builds + PII verify + SSR smoke-test) PASSES all stages green — empirically validating the zero-production-source phase character. The class catalog stays at 19 cumulative (Phase-9 +0); SCOPING-ONLY 8pt is the highest cross-phase-distributed class; MEASUREMENT-ONLY 11pt is the highest absolute-count. v2.74.1 branch-base discipline holds across all 11 consecutive Phase-8/9 task closes including this closer.

Phase-10+ direction is Ilya-gated. Carry-forward items are cosmetic/optional (A2/A3 mutually-redundant UX polish) + housekeeping monitoring (nebula-bg.mp4) + standing conventions (v2.74.1 + P1 + P2 + byte-guard + zero-production-source-phase as available phase-character).

🧪
