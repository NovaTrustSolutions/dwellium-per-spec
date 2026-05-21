# Phase 9+ Plan — Kickoff Pointer Stub

**Status.** **R OPEN** at Phase-9+ kickoff-pointer cementation (Phase-8+ Task 8.15 publishing-handoff; sister-shape to existing `Docs/Phases/Phase_<0-8>_Plan.md` files at OPENING-stub depth per Cowork Q2 LOCK Option α minimal-pointer scope).
**Created.** 2026-05-21 at Phase-8+ Task 8.15 (closer publishing) per Cowork Q3 LOCK Option (i) location verdict — canonical at `Docs/Phases/` per project file-organization convention.
**Phase-9+ scope.** **STAKEHOLDER-DECISION-PENDING** per v1 L228 ≤500 ms LCP DUAL-FRAMING verdict at Phase-8+ closer §6.2 (Ilya-level decision LOCKED at Task 8.14 PRE0). Phase-9+ task-scoping deferred to the dedicated Phase-9+ kickoff brief (post-publishing-merge deliverable).
**Phase-8+ closure cross-reference.** Full Phase-8+ closure narrative at `Docs/Phase8_Closure_Report.md` (488 lines / 88,075 B / ~86 KB; 3rd cross-phase CLOSURE-NARRATIVE-CONSOLIDATION data point). Phase-8+ FULLY CLOSED at Task 8.15 publishing-handoff (15 of 15 ✓; PRs #69-#76 + #78-#84; 2026-05-16 → 2026-05-21).

---

## §1. Phase-8+ → Phase-9+ carry-forward — ~11 items in 3 substantive blocks + 2 process improvements

Per Cowork Q4 LOCK at Task 8.14 PRE0 (closer carry-forward consolidation). Full per-item detail at `Docs/Phase8_Closure_Report.md §7`. Pointer enumeration at stub depth:

### Block A — Widget + provider polish (4 items)

| # | Item | Source |
|--:|:--|:--|
| 1 | Finding II widget-altitude SSR-safety audit (TranscriptionHub.tsx:376 + sister widget patterns) | Closer §7 Block A item 1; Task 8.11 Q6 LOCK Finding II INFORMATIONAL |
| 2 | Finding EE Option β — Suspense at AuthGate altitude | Closer §7 Block A item 2; Task 8.11 Q2 LOCK Finding EE polish enhancement |
| 3 | Finding EE Option γ — pre-hydration cookie infrastructure | Closer §7 Block A item 3 |
| 4 | Finding KK LCP bimodal-at-server-vs-client-rendered-paint investigation | Closer §7 Block A item 4; Task 8.12 Finding KK |

### Block B — LCP-objective disposition (STAKEHOLDER-DECISION-PENDING; 2 items)

| # | Item | Source |
|--:|:--|:--|
| 1 | v1 L228 LCP-objective disposition per DUAL-FRAMING (Phase-9+ kickoff-brief PRE0 Q1 candidate) | Closer §6.2 + §7 Block B item 1; Ilya-lock at Task 8.14 PRE0 |
| 2 | Perf-lever-exhaustion-confirmed baseline at React 19 + Vite 6 + RR v7 architecture (substrate for Phase-9+ scope kickoff IF objective continued) | Closer §2 Signal (5) + §7 Block B item 2; Task 8.13 Finding LL + perf-lever 3-candidate exhaustion |

### Block C — Project-wide housekeeping (3 items; pre-existing)

| # | Item | Source |
|--:|:--|:--|
| 1 | Linux Playwright baselines (re-capture after darwin-vs-Linux render-equivalence convention) | Closer §7 Block C item 1; Phase-7 closure §8 Block A item #3 carry-forward |
| 2 | `nebula-bg.mp4` 70.96 MB asset LFS migration | Closer §7 Block C item 2; pre-existing carry-forward at CLAUDE.md |
| 3 | ~7 untracked baseline JSON artifacts (commit-as-historical-baselines candidate) | Closer §7 Block C item 3; `Docs/Phase8_SSR_Architectural_Scoping.md §7.3` recommendation |

### Process improvements for Phase-9+ PRE-FLIGHT discipline (2 items)

| # | Item | Source |
|--:|:--|:--|
| 1 | v2.76.0 Cowork-directive-gate-citation-verification PRE-FLIGHT discipline (promote as standing convention for Phase-9+) | Closer §7 process item 1; Task 8.13 close NEW v2.76.0 |
| 2 | Recursive-validation discipline as project's most substantive engineering-record pattern (cement as Phase-8+ ↔ Phase-9+ cross-phase standing convention) | Closer §2 Signal (3) + §7 process item 2 |

---

## §2. v1 L228 ≤500 ms LCP verdict-trajectory-outcome-record (consolidated per Q4 LOCK)

Per Cowork Q4 LOCK Option (i) at Task 8.15 PRE0: consolidate v1 L228 verdict-trajectory-outcome-record WITHIN this Phase_9_Plan.md stub (avoids doc-proliferation). This satisfies Plan v2 §9 8.15 row "locks v1 L228 verdict outcome trajectory" mandate without a separate standing-record doc.

**v1 L228 ≤500 ms LCP DUAL-FRAMING verdict per Ilya-level decision** — LOCKED at Phase-8+ Task 8.14 PRE0; cemented at `Docs/Phase8_Closure_Report.md §6.2` (488L / 88,075 B / ~86 KB closer doc; shipped on main at PR #83 squash `99b41ac` 2026-05-21T05:57:46Z). NOT a new verdict at this publishing — a permanent record of the DUAL-FRAMING + STAKEHOLDER-DECISION-PENDING disposition.

### Cross-phase LCP trajectory

| Phase | HEAD | LCP measurement | Cumulative gap-closure |
|:-:|:--|:--|:-:|
| Phase-6 6.7 closure-snapshot | (n=1; `Docs/Baselines/2026-05-11_Phase6_task_6_7_perf_capture.json`) | **4,653 ms** | baseline |
| Phase-7 7.10/7.11 close | `6a7eab5` (n=10 noise-floor; `Docs/Baselines/2026-05-15_Phase7_task_7_11_perf_capture_n10_baseline_post_7.10.json`) | **3,903 ms** median | **−16.1%** vs Ph-6 |
| Phase-8+ 8.12 close | `264c5c0` (n=10 ssr:true; `Docs/Baselines/2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json`) | **2,724 ms** median | **−41.5%** cumulative vs Ph-6 |

Each architectural arc closed ~30-40% of remaining gap to ≤500 ms target. None crossed 500 ms threshold.

### Framing (a) — STRUCTURALLY-UNATTAINABLE-even-with-SSR-migration

Phase-8+ 8.12 LCP median 2,724 ms = **5.45× over v1 L228 ≤500 ms target**. Three architectural arcs across Phase-6 → 7 → 8+ each closed ~30-40% of remaining gap but none crossed 500 ms threshold:

- Phase-6: STRUCTURALLY UNATTAINABLE single-lever (font-deferral REVERT)
- Phase-7: STRUCTURALLY UNATTAINABLE multi-lever within React 19 + Vite 6 SPA architecture (1 SHIP lazy-load + 2 REVERT font-deferral + vendor-split)
- **Phase-8+ (NEW):** STRUCTURALLY UNATTAINABLE multi-lever + SSR-migration within React 19 + Vite 6 + RR v7 framework-mode architecture

Categorically out of reach at React 19 + Vite 6 + RR v7 framework-mode architecture. Matches `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` **Outcome (B)** trajectory definition: "NEW empirical refinement to 'STRUCTURALLY UNATTAINABLE even with SSR migration at React 19 + chosen-framework architecture.'" Phase-9+ priority recommendation candidates: infrastructure-level optimization (CDN edge rendering / HTTP/3 / aggressive caching); fundamental architecture pivot (server-side templating + island hydration architecture per Astro/Fresh patterns).

### Framing (b) — PARTIAL-MET

Phase-6 4,653 ms → Phase-7 3,903 ms → Phase-8+ 2,724 ms = cumulative **−1,929 ms / ~41% cumulative gap-closure** across three architectural arcs. Real, measurable, monotonic progress at every architectural step. Gate not met but materially advanced. Per Cowork Verdict 3 LOCK 3rd-outcome stance: progress is engineering-substantive even where target not crossed.

### Framing (c) — NO single forced verdict; STAKEHOLDER-DECISION-PENDING

Both framings ship with equivalent rigor per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` "all outcomes are publishable deliverables" stance. The empirical evidence supports BOTH framings simultaneously. The choice between framings is a **stakeholder decision** about Phase-9+ scope:

- IF stakeholders judge v1 L228 ≤500 ms LCP as binding closure criterion → Framing (a) supports formal closure as STRUCTURALLY UNATTAINABLE; Phase-9+ may pivot to alternative gate definitions OR alternative architecture exploration
- IF stakeholders judge ~41% cumulative gap-closure as substantive engineering progress worth continuing → Framing (b) supports continued architectural exploration in Phase-9+ (CDN edge / HTTP/3 / island hydration / etc.)

**Phase-9+ kickoff-brief PRE0 Q1 candidate**: stakeholder decision on v1 L228 LCP-objective disposition. Until resolved, Phase-9+ scope is bounded by the carry-forward §1 above + the stakeholder verdict.

### Cross-reference index

- Canonical DUAL-FRAMING narrative: `Docs/Phase8_Closure_Report.md §6.2`
- §6.6 Outcome (B) trajectory definition: `Docs/Phase8_SSR_Architectural_Scoping.md §6.6`
- Cross-phase trajectory empirical data: `Docs/Baselines/2026-05-11_Phase6_task_6_7_perf_capture.json` + `2026-05-15_Phase7_task_7_11_perf_capture_n10_baseline_post_7.10.json` + `2026-05-19_Phase8_task_8_12_perf_capture_n10_baseline_post_8.11.json`
- v1 spec citation: project-spec v1 L228 ≤500 ms LCP
- Phase-9+ kickoff-brief PRE0 Q1 cross-reference: this §2 (when authored)

---

## §3. Phase-9+ entry-state at HEAD-post-Task-8.15

Architectural state at HEAD-post-Phase-8+ closure:

| Domain | State |
|--------|-------|
| **SSR mode** | `ssr: true` at `qualia-shell/react-router.config.ts` (Task 8.11 close) |
| **Framework-mode** | React Router v7.15.1 framework-mode adopted at Task 8.6 (RR v7 + `@react-router/dev` + `@react-router/node` + `@react-router/serve`) |
| **Build output** | `build/client/` + `build/server/` (NOT `dist/`); Phase-7 7.10 lazy-load lever preserved byte-for-byte at lazy-loading-pattern altitude |
| **Provider tree** | All 4 audit-scoped providers + Sidebar.tsx leaf-component migrated to `useSyncExternalStore` + `createLocalStorageStore` factory (Theme + User + Layout + Hierarchy + Window) |
| **Factory-produced stores** | 14 cumulative (5 at Task 8.9 + 9 at Task 8.10) under true SSR runtime (smoke-test EMPIRICALLY VALIDATED at Task 8.11) |
| **a11y state** | v1 L230 ZERO WCAG AA SUSTAINED across 8-routable-surface scope through Phase-8+ (per-page a11y 100/100 / 0 violations at Task 8.12 measurement) |
| **LCP state** | n=10 median 2,724 ms / mean 2,499 ms / CV 13.49% bimodal at ssr:true (Task 8.12 measurement; Finding KK bimodal-at-server-vs-client-rendered-paint) |
| **vitest** | 278/278 (+19 cumulative across Phase-8+; +5 at 8.2 + +5 at 8.9 + +9 at 8.10) |
| **Engineering findings** | 36 active + 1 INFORMATIONAL (II deferred-to-Phase-9+-widget-SSR-audit) |
| **Project-wide classes** | 19 (4 Phase-8+-introduced; 2 cross-phase extensions: MEASUREMENT-ONLY 10pt + CLOSURE-NARRATIVE-CONSOLIDATION 3pt) |
| **Anchor-bias-mitigation cluster** | 19 patterns (Phase-7 founding 4 + Phase-8+ 15 NEW; retroactive-correction-in-place at closer §5) |
| **In-place v2.X.X patches** | 9 cumulative (v2.66.1/2/3 + v2.68.1 + v2.72.1 + v2.73.1/2/3 + v2.75.1) |
| **Standing conventions** | v2.72.1 `.reset()` factory escape-hatch (PERMANENT); v2.74.1 branch-base discipline (4-consecutive empirical vindication at 8.11-8.14); v2.76.0 Cowork-directive-gate-citation-verification (NEW at 8.13) |

---

## §4. Phase-9+ kickoff-brief preview

Phase-9+ kickoff-brief is the next deliverable post-Task-8.15-publishing-merge (NOT scoped at this publishing; Cowork Q2 LOCK Option α minimal-pointer discipline). Preview-only at this stub:

- **PRE0 Q1 candidate**: v1 L228 LCP-objective disposition resolution per DUAL-FRAMING (per §2 above; STAKEHOLDER-DECISION-PENDING):
  - (a) Ratify Framing (a) STRUCTURALLY UNATTAINABLE as formal closure → Phase-9+ pivot to alternative gate definitions OR alternative architecture
  - (b) Ratify Framing (b) PARTIAL-MET as substantive progress worth continuing → Phase-9+ architectural exploration (CDN edge / HTTP/3 / island hydration)
  - (c) Defer decision → Phase-9+ kickoff-brief surfaces choice explicitly to stakeholders
- **PRE0 Q2-Qn candidates**: deferred to dedicated kickoff brief; bounded by §1 carry-forward + §3 entry-state above
- **Phase-9+ standing PRE-FLIGHT discipline adoption candidates**: v2.76.0 Cowork-directive-gate-citation-verification (promote to standing per process improvement 1) + recursive-validation discipline (cement as cross-phase standing convention per process improvement 2)

---

## §5. Closure-completion-FUNCTION sister-shape precedent clarification

Per Cowork Q1 LOCK at Task 8.15 PRE0 — sister-shape narrative clarification (NOT a new cataloged finding; catalog FROZEN at 36 active per Phase-8+ closer cementation):

> "Plan v2 §9 8.15 row 'sister-shape to Phase-7 7.14 + Phase-6 6.9 publishing' is accurate at closure-completion-FUNCTION altitude (both Phase-6 6.9 and Phase-7 closer cemented closure-completion ⊂ publishing-equivalent function: closure-narrative + Phase-N+1 kickoff pointer + v1 verdict-record + §9 column flip). Phase-8+'s 2-step closer(8.14)/publishing(8.15) separation is structurally NOVEL at task-decomposition altitude — first publishing-task instance in project history. CLOSURE-NARRATIVE-CONSOLIDATION class stays 3pt cross-phase with NEW sub-shape `closer-publishing-handoff` added at Task 8.15 (sister-shape to existing `single-task-closure-per-phase` sub-shape @ Phase-6 6.9 + Phase-7 closer)."

This clarification is also reflected in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 row 8.15 close cell + CLAUDE.md Calibration classes section.

---

## §6. Phase-9+ → Phase-10+ transition signal projection (pre-empt at stub depth)

Phase-9+ transition signal will be empirically-grounded per stakeholder verdict on v1 L228 disposition (per §2 Framing (c) above). At stub depth: Phase-9+ closer (terminal task TBD) will cement Phase-9+ → Phase-10+ transition signal per established Phase-N closer convention.

---

**Phase-9+ kickoff pointer cemented at Task 8.15 publishing.** Phase-8+ FULLY CLOSED; Phase-9+ R OPEN at this pointer; Phase-9+ kickoff brief = next deliverable.

🎯
