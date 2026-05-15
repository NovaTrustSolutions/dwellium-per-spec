# Phase-7 Task 7.14 Completion Report — Phase-5 Perf Report §2 stale LCP root-cause footnote correction (DOC-only; Block C 2-of-3 milestone)

## §1. Summary

**Status.** ✓ CLOSED 2026-05-15 (DOC-only closure shape; zero source/spec/config/baseline edits; sister-shape to 7.8 DOC-only-empirical-void-closure pattern + 6.9 CLOSURE-NARRATIVE-CONSOLIDATION precedent).
**Commit (HEAD on `main`):** `TBD` (squash commit for PR #TBD, Task 7.14 — Phase-7 Block C item #3; resolution at next-task sweep per established 22-consecutive-cross-phase-sweep-resolutions convention extending 22-pattern at 7.11 → 23-pattern at 7.14).
**Green CI run:** TBD (manual-dispatch parity gate at PR open; paths-filter quirk HOLDS — sister to 7.5/7.6/7.8/7.9/7.11 manual-dispatch precedent since 7.14 touches `Docs/**` + root `CLAUDE.md` only; NOT in `qualia-shell/src/**` filter).

**Phase-7 Block C item #3 CLOSED via DOC-only closure shape; inline empirical-correction footnote inserted between L68 stale-claim and L70 section-closing rule at `Docs/Phase5_Perf_Report.md §2`, preserving the historical Phase-0-era LCP root-cause narrative AND adding the Phase-7-era empirical correction trajectory (6.7 → 7.10 → 7.11).**

**🎯 The corrected stale claim:** Phase-5 Perf Report §2 L68 attributed LCP root-cause to "1,031,260-byte primary chunk (`StrataDashboard-COZxJ8Bh.js`) — the lazy-loaded Strata module dominates render." This was speculative at Phase-5 close (2026-05-04) and has been empirically superseded across 3 closes:

1. **Phase-6 6.7 PRE0 empirical inspection** revealed StrataDashboard is dynamically imported (NOT eager initial-paint critical-path) — Vite's chunk-splitter places it in a separate chunk loaded on-demand after initial paint completes. The actual eager `<script>` chunk at HEAD-post-6.7 was `index-ChKXebss.js` (597,519 B) + `<link rel="stylesheet">` `index-DubCb24b.css` (158,955 B). The Phase-5 §2 claim **conflated "largest chunk in dist/" with "what blocks initial paint"** — StrataDashboard's byte-weight is downstream of the eager-chunk parse decision tree, not on the critical path.

2. **Phase-7 7.10 Lever 3 (React.lazy expansion of App.tsx eager imports + AdminShell wrapper consolidation; sister to L68's "route-level lazy-loading" mitigation path)** shrunk the eager chunk to `index-MO01qt09.js` / 253,683 B (−343,836 B / −57.5% reduction vs HEAD-post-6.7 canonical) and shipped −550 ms mean / −600 ms median LCP reduction at HEAD-post-7.10 (OUTCOME C partial-win per Cowork verdict). Phase-7 7.9 Lever 2 manualChunks vendor split (sister to L68's "code-splitting beyond existing manualChunks config" mitigation path) was attempted in 2 rounds and REVERTED-as-empirical-void (v2.55.1 expanded shape achieved structural chunk-axis BREAK SUCCESS at −217,927 B / −36.5% but empirical LCP delta only −24.6 ms / −0.5% / NO-OP). StrataDashboard chunk at HEAD-post-7.10 is `StrataDashboard-BrMjCxpY.js` / 1,032,104 B (+844 B drift across 5 cross-phase production-source-edit BREAKs at 6.1a + 6.3 + 6.4 + 7.1 + 7.10).

3. **Phase-7 7.11 n=10 Lighthouse variance characterization at HEAD-post-7.10** produced LCP CV 2.29% — the project's first non-degenerate noise-floor metric (~6× variance reduction vs pre-Phase-7 anchor estimated CV ~14-17%); bimodal distribution at n=10 (~90% modal-deterministic at 3,902-3,903 ms + ~10% bounded-jitter outlier at 4,202 ms).

**🎯 Substantive Phase-7 engineering finding (publishable level) cemented at 7.14 close:** at React 19 + Vite 6 + 4,500 ms-LCP baseline architecture, the structurally-correct LCP bottleneck is **initial-paint JS parse+execute time**, NOT critical-path bytes-downloaded. Three lever data points calibrate the 2-direction perf-lever class (1 SHIP + 2 REVERT cross-phase): 6.7 font-deferral REVERT (network-transfer; NO-OP) + 7.9 vendor-split REVERT (download bytes; NO-OP) + 7.10 lazy-load SHIP (parse+execute; SUBSTANTIVE WIN −550 ms). The Phase-5 §2 footnote at 7.14 close retroactively corrects the speculative Phase-5-era LCP root-cause claim AND traces the empirical refinement trajectory across 3 Phase-6/7 closes. The L68 "SSR-rendered shell" mitigation path remains the Phase-8+ priority; v1 L228 ≤500 ms LCP target still structurally unattainable at this architecture (post-7.10 LCP 3,903 ms = 7.8× v1 target).

**🎯 NEW MEASUREMENT-ONLY sub-shape `DOC-only-historical-footnote-correction` docked at 7.14 close** — class **8pt → 9pt cross-phase**; 9 sub-shapes calibrated under MEASUREMENT-ONLY: source-rename (5.6+5.7=2pt) + with-baseline-recapture (6.5=1pt) + plus-script-rename (6.6=1pt) + with-empirical-finding-and-revert-perf-lever (6.7+7.9=2pt) + DOC-only-empirical-void-closure (7.8=1pt) + with-n10-statistical-rigor-characterization (7.11=1pt) + **DOC-only-historical-footnote-correction (7.14=1pt NEW)**. Project-wide class count stays at 14 (no new top-level class).

**🎯 Structural distinction from 7.8's `DOC-only-empirical-void-closure` sub-shape:** 7.8 was a **fresh-empirical-finding closure** correcting CI-infrastructure framing (compliance-row flake empirically absorbed by v2.51.1 timeout-bump as side-effect of Vendors axe-scan absorption); 7.14 is a **historical-correction-of-prior-claim-now-empirically-superseded** (Phase-5 §2 narrative empirically refined by 6.7 + 7.10 + 7.11 trajectory). Both are DOC-only at MEASUREMENT-ONLY altitude but operate on structurally distinct empirical findings.

**🎯 Block C 2-of-3 closure milestone at 7.14** — Block C arc progression: 7.12 ✓ co-closed at 7.3 v2.50.1+v2.50.2 (retries+timeout escalation absorbed Block C item #1 retries-delta investigation) + **7.14 ✓ at this commit** (Block C item #3 stale footnote correction) + 7.13 R (calendar.test.tsx:260 darwin flake remaining). Block C 3-of-3 closure achievable at Phase-7 next-task close (7.13); after which Phase-7 closer becomes final deliverable.

**🎯 26-of-26 cross-phase chunk-axis preservation cumulative at 7.14 close** (Phase-5 6 LAW + Phase-6 8 + Phase-7 12 [7.2 + 7.3 + 7.4 + 7.5 + 7.6 + 7.8 + 7.9-REVERT + v2.55.1 in-place patch + 7.10-NEW-canonical-established + 7.10-post-merge-sweep + 7.11 + 7.14] = 26); 3-of-3 within-Phase-7-post-BREAK at 7.14 (HEAD-post-7.10 baseline + 7.11 + 7.14 = 3-of-3 preservation since 7.10 BREAK reset); DOC-only edit at `Docs/Phase5_Perf_Report.md §2` + 4 doc-sweep edits + root `CLAUDE.md` fully outside Vite entry graph.

**🎯 7.11 squash SHA `7ff4d5e` resolves at 7.14 sweep — 23 consecutive cross-phase sweep-resolutions** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6 → 7.8 → 7.9 → 7.10 → 7.11 → **7.14**). Resolved across §9 row 7.11 squash-SHA cell in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` + Phase status line at top of `Docs/Phases/Phase_7_Plan.md` + Task 7.11 closure-narrative TBD references in `Docs/Phase7_Task_7_11_Completion_Report.md` (4 reference spots: §1 Commit + §1 Green CI run + §5 verification matrix + §6 Rollback SHA) + this HEAD pointer.

**🎯 Paths-filter quirk extends to 16-task cross-phase scope at 7.14** (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7 / 6.8 / 6.9 / 7.2 / 7.3 / 7.4 / 7.5 / 7.6 / 7.8 / 7.9 / 7.11 / **7.14**; 7.10 RESET to auto-fire via production-source-edit was the exception); manual-dispatch expected at PR open per established convention.

5 file edits + 0 NEW baseline (0 source: UPDATE `Docs/Phase5_Perf_Report.md` §2 footnote inserted between L68 and L70 / NEW `Docs/Phase7_Task_7_14_Completion_Report.md` 8-section template / UPDATE `Docs/AppFolio_Parity_Implementation_Plan_v2.md` v2.58 amendment closes row 7.14 + v2.58 Changelog entry + 7.11 squash-SHA cell `TBD` → `7ff4d5e` + Pending row (Phase-7) 2 → 1 + MEASUREMENT-ONLY class 8pt → 9pt cross-phase with NEW sub-shape `DOC-only-historical-footnote-correction` docked / UPDATE `Docs/Phases/Phase_7_Plan.md` Phase status row 7.11 closure + 7.14 closure narrative + Block C 2-of-3 milestone / UPDATE `Docs/Phase7_Task_7_11_Completion_Report.md` 7.11 TBD → `7ff4d5e` / `#65` across 4 reference spots / UPDATE this CLAUDE.md HEAD pointer pivot + Phase summary 12 → 13 of 14 ✓ + MEASUREMENT-ONLY 8pt → 9pt with 9 sub-shapes + Perf state APPENDED footnote-corrected reference + Block C 2-of-3 milestone + deferred-items state unchanged 4 → 4). Vitest 259/259 expected LOCAL (zero source touched; tsc + vitest gates only — SKIP vite builds + PII guard per Cowork direction).

---

## §2. Footnote diff summary + cross-reference list

### §2.1 Footnote insertion at `Docs/Phase5_Perf_Report.md` §2

**Anchor:** Between L68 stale-claim paragraph and L70 section-closing `---` horizontal rule (preserves stale-claim verbatim; correction-in-place pattern per Cowork PRE0 Q1 verdict; sister to v2.55.1 in-place-patch + 7.8 doc-only-correction patterns).

**Pre-edit context (L66-70):**
- L66: Phase-0 → Phase-5 root delta paragraph (preserved)
- L67: blank
- L68: **stale-claim paragraph** (preserved verbatim) — `**LCP root cause (per Phase-0 era engineering)**: 1,031,260-byte primary chunk (\`StrataDashboard-COZxJ8Bh.js\`) — the lazy-loaded Strata module dominates render...`
- L69: blank
- L70: section-closing `---`

**Post-edit context (L66-72):**
- L66: Phase-0 → Phase-5 root delta paragraph (UNCHANGED)
- L67: blank
- L68: stale-claim paragraph (UNCHANGED byte-for-byte)
- L69: blank
- **L70: NEW empirical-correction footnote** — `**[2026-05-15 empirical correction at Phase-7 Task 7.14 close]**: The above LCP root-cause analysis was speculative at Phase-5 close (2026-05-04) and has been empirically superseded across 3 closes...` (full text in `Docs/Phase5_Perf_Report.md` post-edit)
- L71: blank
- L72: section-closing `---` (renumbered from L70 due to footnote insertion)

### §2.2 Cross-reference list (verified existence at write time per Cowork cross-check reminder)

| Cross-reference path | Status | Content reference |
|---|:-:|---|
| `Docs/Phase6_Perf_Report.md §2` | ✅ EXISTS | 6.7 PRE0 empirical inspection of `dist/index.html` + Lever 1 font-deferral evaluation data |
| `Docs/Phase7_Task_7_10_Completion_Report.md §2-§4` | ✅ EXISTS | 7.10 chunk-axis BREAK manifest + n=3 empirical LCP delta + OUTCOME C verdict |
| `Docs/Phase7_Task_7_11_Completion_Report.md §2` | ✅ EXISTS | n=10 statistical-rigor characterization + bimodal distribution + LCP CV computation |
| `Docs/Baselines/2026-05-15_Phase7_task_7_11_perf_capture_n10_baseline_post_7.10.json` | ✅ EXISTS | Raw n=10 captures + computed stats (8,457 B) |

### §2.3 Empirical-trajectory narrative across 3 closes (6.7 → 7.10 → 7.11)

The footnote retroactively traces the empirical-refinement trajectory of the LCP root-cause analysis:

| Close | Empirical finding | Effect on Phase-5 §2 claim |
|---|---|---|
| Phase-5 close 2026-05-04 | "1,031,260-byte primary chunk (`StrataDashboard-COZxJ8Bh.js`) dominates render" | Original speculative claim |
| Phase-6 6.7 close 2026-05-11 | StrataDashboard is dynamically imported (NOT eager); eager chunk = `index-ChKXebss.js` (597,519 B) + `index-DubCb24b.css` (158,955 B) | Refinement: identifies actual eager-chunk filenames |
| Phase-7 7.9 close 2026-05-13 | Lever 2 manualChunks vendor split = NO-OP empirical LCP signal (−24.6 ms / −0.5%); download-bytes-extraction does not move LCP | Confirms: bottleneck is NOT critical-path bytes-downloaded |
| Phase-7 7.10 close 2026-05-15 | Lever 3 React.lazy expansion = SUBSTANTIVE WIN (−550 ms / −12.4% LCP); parse+execute-deferral DOES move LCP | Confirms: bottleneck IS initial-paint JS parse+execute time; lazy-load is structurally-correct lever family |
| Phase-7 7.11 close 2026-05-15 | n=10 LCP CV 2.29% at HEAD-post-7.10 (~6× variance reduction vs pre-Phase-7 anchor) | Calibrates: noise-floor at HEAD-post-7.10; project-wide measurement infrastructure deliverable |
| **Phase-7 7.14 close 2026-05-15** | **Inline empirical-correction footnote at `Docs/Phase5_Perf_Report.md §2`** preserving Phase-5-era reading + adding the 3-close trajectory | **Retroactive correction of speculative claim**; sister to 7.8 doc-only-correction pattern + 6.9 closure-narrative consolidation pattern |

---

## §3. Source diff summary

**Zero source / spec / config / baseline edits.** 7.14 is pure DOC-only closure shape (sister to 7.8 DOC-only-empirical-void-closure + 6.9 CLOSURE-NARRATIVE-CONSOLIDATION precedents). All work is doc-edits across 4 EDIT + 1 NEW file:

- UPDATE `Docs/Phase5_Perf_Report.md` §2 (inline empirical-correction footnote inserted between L68 and L70 per Cowork PRE0 Q1 verdict)
- NEW `Docs/Phase7_Task_7_14_Completion_Report.md` (8-section template; this document)
- UPDATE `Docs/AppFolio_Parity_Implementation_Plan_v2.md` (v2.58 amendment)
- UPDATE `Docs/Phases/Phase_7_Plan.md` (Phase status row 7.11 + 7.14 closure + Block C 2-of-3 milestone)
- UPDATE `Docs/Phase7_Task_7_11_Completion_Report.md` (TBD → `7ff4d5e` / `#65` across 4 reference spots)
- UPDATE `CLAUDE.md` (HEAD pointer pivot + Phase summary + MEASUREMENT-ONLY 8pt → 9pt + Perf state APPENDED + Block C 2-of-3 milestone)

---

## §4. Chunk-axis preservation (DOC-only shape; no source change)

DOC-only edit at `Docs/Phase5_Perf_Report.md` + 4 doc-sweep edits at HEAD-post-7.11 preserves all chunk axes byte-for-byte vs HEAD-post-7.11 canonical (which is identical to HEAD-post-7.10 canonical since 7.11 was also DOC-only):

| Chunk | HEAD-post-7.10 canonical | 7.14 close | Match |
|---|---|---|:-:|
| Eager `<script>` JS (parity-gate canonical) | `index-MO01qt09.js` / 253,683 / `07b36c4a…2b22` | UNCHANGED | ✅ byte-for-byte |
| Eager `<link>` CSS | `index-BebuHEVu.css` / 49,312 / `8fced46a…1815` | UNCHANGED | ✅ byte-for-byte |
| Vendor JS | `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` | UNCHANGED | ✅ byte-for-byte (cumulative preserved-since-6.x stability) |
| 7 lazy chunks | aggregate 217,607 B | UNCHANGED | ✅ byte-for-byte |

**26-of-26 cross-phase chunk-axis preservation cumulative at 7.14** (Phase-5 6 LAW + Phase-6 8 + Phase-7 12 = 26); 3-of-3 within-Phase-7-post-BREAK at 7.14 (HEAD-post-7.10 baseline + 7.11 + 7.14 = 3-of-3 preservation since 7.10 BREAK reset). DOC-only edits fully outside Vite entry graph; very strong inductive evidence at scale.

---

## §5. Verification matrix

| Check | Target | Result | Status |
|---|---|---|:-:|
| Step-1 PRE0 Q1-Q3 + bonus sub-shape name | Cowork verdicts acknowledged | All 4 verdicts CONFIRMED no additional questions | ✓ |
| Step-2 read `Docs/Phase5_Perf_Report.md §2` | identify exact stale-claim location | L68 stale-claim + L70 section-closing rule identified | ✓ |
| Step-3 footnote insertion at L70 | preserve L68 stale-claim + add L70 empirical-correction footnote | edit landed at correct line range; stale paragraph byte-for-byte preserved | ✓ |
| Step-3 cross-reference targets exist | 4 paths verified at write time | all 4 ✓ (Phase6_Perf_Report.md + 7.10 Completion Report + 7.11 Completion Report + n=10 baseline JSON) | ✓ |
| Step-3 phrasing self-check vs Phase-6 + Phase-7 narratives | no cross-narrative inconsistency | StrataDashboard chunk-byte-count (1,031,810 B at HEAD-post-6.7 → 1,032,104 B at HEAD-post-7.10) + eager chunk filenames (`index-ChKXebss.js` → `index-MO01qt09.js`) + Lever 1 / 2 / 3 outcome verdicts (REVERT / REVERT / SHIP) all match prior closure narratives byte-for-byte | ✓ HARD HALT-IF #1 cleared |
| Step-3 no source/spec/config/baseline edit | DOC-only scope confirmed | only Docs/Phase5_Perf_Report.md L70 inserted; no other content modified | ✓ HARD HALT-IF #2 cleared |
| Step-4 doc sweep | 4 EDIT + 1 NEW file | NEW Completion Report + UPDATE Plan v2.58 + UPDATE Phase_7_Plan.md + UPDATE 7.11 Completion Report TBD → 7ff4d5e + UPDATE CLAUDE.md | ✓ |
| Step-5 strict gate tsc -b | clean | TBD (pending pre-commit re-run) | TBD |
| Step-5 strict gate vitest run | 259/259 PASS | TBD (pending pre-commit re-run) | TBD |
| Step-5 SKIP vite builds + PII guard | zero source touched | per Cowork direction | ✓ skipped |
| Step-6 commit + push | branch `phase-7/task-7.14-phase5-perf-footnote` | TBD | TBD |
| Step-6 manual-dispatch parity gate | paths-filter quirk; DOC-only edit | TBD | TBD |
| Parity Gate per PR | 16-of-16 SUCCESS via manual-dispatch | TBD | Run pending post-PR-open |
| PII Scan per push | success | TBD | Run pending post-PR-open |
| CodeRabbit review per PR | pass | TBD (expect Trivial effort given DOC-only changeset) | Run pending post-PR-open |
| §9 row 7.14 sub-tracker | R → ✓ (closed-as-DOC-only-historical-footnote-correction) | ✓ | Plan v2.58 amendment |
| §9 row 7.11 squash-SHA cell | TBD → `7ff4d5e` | ✓ | Plan v2.58 amendment (23-consecutive sweep-resolutions) |
| MEASUREMENT-ONLY class 8pt → 9pt cross-phase | NEW sub-shape `DOC-only-historical-footnote-correction` docked | ✓ | Plan v2.58 + CLAUDE.md Calibration classes block updated |
| Block C 2-of-3 milestone | 7.12 ✓ at 7.3 + 7.14 ✓ at this commit + 7.13 R | ✓ at this commit | Phase-7 progress 13 of 14 ✓ |

---

## §6. Rollback SHA

Rollback target: `git revert <7.14-squash-SHA>` (Phase-7 7.14 close; reverts to HEAD-post-7.11 state at `7ff4d5e`). Trivial DOC-only revert; zero source state to roll back (footnote insertion + 4 doc-sweep edits); chunk axes already preserved through 7.14 by construction. Phase-7 7.14 squash SHA `TBD` (will be revertable independently once merged; resolution at next-task sweep per established absorb-into-next-sweep convention).

---

## §7. Carry-forward to 7.13 / Phase-7 closer / Phase-8

1. **🎯 Block C 2-of-3 milestone at 7.14 close** — Block C arc progression: 7.12 ✓ co-closed at 7.3 v2.50.1+v2.50.2 + **7.14 ✓ at this commit** + 7.13 R (`calendar.test.tsx:260` darwin intermittent flake stabilization; suspected `vi.useFakeTimers()` + real-clock interaction). Phase-7 progress 12 → **13 of 14 ✓**; **1 R remaining (7.13)**. Block C 3-of-3 closure achievable at next-task close.

2. **🎯 NEW MEASUREMENT-ONLY sub-shape `DOC-only-historical-footnote-correction` docked at 7.14 close** — class **8pt → 9pt cross-phase**; 9 sub-shapes calibrated under MEASUREMENT-ONLY. Structurally distinct from 7.8's `DOC-only-empirical-void-closure` sub-shape (7.8 = fresh-empirical-finding closure correcting CI-infrastructure framing; 7.14 = historical-correction-of-prior-claim-now-empirically-superseded). Project-wide class count stays at 14 (no new top-level class introduced).

3. **🎯 Substantive Phase-7 engineering trajectory cemented across 3 closes** (6.7 → 7.10 → 7.11) with retroactive correction at 7.14 of the Phase-5 §2 speculative claim. The trajectory tells a **publishable engineering story for the Phase-7 closer:**
   - **Phase-5 speculative claim** (2026-05-04): StrataDashboard chunk dominates render → empirically rejected
   - **Phase-6 6.7 empirical narrowing** (2026-05-11): eager chunk identified as `index-ChKXebss.js` + `index-DubCb24b.css`; StrataDashboard is dynamically imported
   - **Phase-7 7.9 structural confirmation** (2026-05-13): Lever 2 vendor-split REVERT confirms download-bytes-extraction does not move LCP at this architecture
   - **Phase-7 7.10 substantive win** (2026-05-15): Lever 3 lazy-load SHIP confirms parse+execute-deferral DOES move LCP; −550 ms / −12.4%
   - **Phase-7 7.11 statistical-rigor characterization** (2026-05-15): n=10 LCP CV 2.29% at HEAD-post-7.10 = first non-degenerate noise-floor metric
   - **Phase-7 7.14 retroactive correction** (2026-05-15): inline empirical-correction footnote at `Phase5_Perf_Report.md §2` preserving historical narrative + adding 3-close trajectory
   
   Each step refines the prior with empirical signal; substantive Phase-7 engineering finding (lazy-load IS the structurally-correct lever family at React 19 + Vite 6 + 4,500 ms-LCP baseline) is now anchored across 4 cross-referenced Phase-6/7 Completion Reports + 1 raw-data baseline artifact.

4. **🎯 26-of-26 cross-phase chunk-axis preservation cumulative at 7.14 close** (Phase-5 6 LAW + Phase-6 8 + Phase-7 12 = 26); 3-of-3 within-Phase-7-post-BREAK at 7.14 (HEAD-post-7.10 baseline + 7.11 + 7.14 = 3-of-3 preservation since 7.10 BREAK reset). DOC-only edit fully outside Vite entry graph; very strong inductive evidence at scale.

5. **🎯 23 consecutive cross-phase sweep-resolutions cemented at 7.14 sweep** (extends 22-pattern at 7.11 → 23-pattern at 7.14); 7.11 TBD → `7ff4d5e` / `#65` resolution co-shipped across §9 row 7.11 + Phase_7_Plan.md Phase status line + Phase7_Task_7_11_Completion_Report.md 4 reference spots + this HEAD pointer pivot.

6. **🎯 Paths-filter quirk extends to 16-task cross-phase scope at 7.14** (4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7 / 6.5 / 6.6 / 6.7 / 6.8 / 6.9 / 7.2 / 7.3 / 7.4 / 7.5 / 7.6 / 7.8 / 7.9 / 7.11 / **7.14**); 7.10 RESET to auto-fire was the exception; manual-dispatch expected at PR open per established convention.

7. **🎯 Phase-7 deferred-items state unchanged at 7.14 close: 4 → 4** (no items absorbed or added at 7.14; remaining items #1 repo Actions-PR-create setting + #2 first-real-execution-as-truth-signal + #4 REFRAMED lazy-load-correct-family + #5 retention-days hygiene + #6 Suspense+ErrorBoundary production-polish). All 4 carry forward to Phase-7 closer for consolidation + Phase-8+ priority statement.

8. **🎯 Block C 3-of-3 closure trajectory recommended next:** Task 7.13 (`calendar.test.tsx:260` darwin intermittent flake stabilization). Expected class: CONFIG-FILE-EDIT or test-spec-edit at production-test-infrastructure altitude; sub-source-altitude sister-shape to bare-React.lazy 2-layer-altitude convention per CLAUDE.md Conventions block. After 7.13 closes Block C 3-of-3 ✓ + Phase-7 closer becomes the final Phase-7 deliverable mirroring Phase-1/3/4/5/6 single-closure-per-phase precedent (CLOSURE-NARRATIVE-CONSOLIDATION 2nd data point cross-phase; sister to 6.9 Phase-6 closer).

---

## §8. Lessons learned for Plan v2.58+ amendment

**Engineering insight 1 — Retroactive correction-in-place pattern preserves audit trail.** Task 7.14 demonstrates that inline empirical-correction footnotes (preserving the historical claim verbatim + adding the empirical correction below it) preserve the "what we believed at time T" + "what we now know at time T+N" audit trail without rewriting history. Sister-shape to v2.55.1 in-place-patch convention (workflow YAML) + 7.8 DOC-only-empirical-void-closure (CI-infrastructure correction) but applied at MEASUREMENT-REPORT altitude. Recommended pattern codification at Plan v2.58+ amendment: "Stale-claim correction in measurement reports should default to inline correction-in-place; rewriting historical narratives should require explicit Cowork verdict."

**Engineering insight 2 — Empirical trajectory narratives tell publishable engineering stories.** The 7.14 footnote ties together 3 prior closes (6.7 + 7.10 + 7.11) into a coherent empirical-refinement trajectory that retroactively corrects the Phase-5 speculative claim. This kind of trajectory narrative is the substantive Phase-7 engineering finding at publishable level — Phase-7 closer should synthesize the cross-task narrative similarly. Sister-shape to 6.9 CLOSURE-NARRATIVE-CONSOLIDATION but at footnote-altitude (single-paragraph; cross-referenced; targeted).

**Engineering insight 3 — Structural class distinction (DOC-only-empirical-void-closure vs DOC-only-historical-footnote-correction).** Two MEASUREMENT-ONLY DOC-only sub-shapes are now empirically distinct: 7.8's `DOC-only-empirical-void-closure` was a **fresh-empirical-finding closure** (compliance-row flake absorbed by v2.51.1 timeout-bump as side-effect of Vendors axe-scan absorption; the correction was the closure itself); 7.14's `DOC-only-historical-footnote-correction` is a **historical-correction-of-prior-claim-now-empirically-superseded** (Phase-5 §2 narrative empirically refined by 6.7 + 7.10 + 7.11 trajectory; the footnote corrects a prior claim, not a CI-infrastructure framing). Class taxonomy granularity is structurally informative — sub-shape calibration captures the substantive difference even when both shapes are at DOC-only altitude.

**Engineering insight 4 — Phase-N closure narratives accumulate retroactive-correction debt.** Phase-5 Perf Report §2's speculative claim went uncorrected for ~3 weeks (2026-05-04 close → 2026-05-15 7.14 footnote) despite being empirically superseded at 6.7 close (2026-05-11) and definitively refuted at 7.10 close (2026-05-15 earlier in the day). Future Phase-N closer Completion Reports should explicitly audit prior Phase-N Perf/A11y reports for stale claims and either (a) inline-correct at next-Phase-N opportunity or (b) consolidate via end-of-phase footnote sweep. Recommended Plan v2.58+ amendment: "Phase-N close Completion Report §8 includes a 'Prior phase report stale-claim audit' bullet."

---

**End of Phase-7 Task 7.14 Completion Report.**
