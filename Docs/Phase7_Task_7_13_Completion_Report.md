# Phase-7 Task 7.13 Completion Report — calendar.test.tsx darwin flake stabilization (TEST-INFRA-FIX; vi.useFakeTimers + React 19 scheduler-primitive anti-pattern; Block C 3-of-3 ✓; Phase-7 14-of-14 ✓ FULL CLOSURE)

## §1. Summary

**Status.** ✓ CLOSED 2026-05-15 (TEST-INFRA-FIX closure shape; test-spec-only edit at `qualia-shell/src/test/appfolioParity/calendar.test.tsx`; sister + upcoming RTL tests; symmetric structural repair per Cowork Q5 MODERATE same-file dual-fix verdict).
**Commit (HEAD on `main`):** `0db9f2b` (squash commit for PR #67, Task 7.13 — Phase-7 Block C item #2; resolved at Phase-7 closer sweep per established 25-consecutive-cross-phase-sweep-resolutions convention extending 24-pattern at 7.13 → 25-pattern at closer).
**Green CI run:** Parity Gate run 25951257790 ✓ SUCCESS at PR #67 open + PII Scan run 25951257741 ✓ SUCCESS (parity-gate auto-fire RESET CONFIRMED via paths-filter `qualia-shell/src/**` glob covering `src/test/appfolioParity/calendar.test.tsx`; sister to 7.1 + 7.10 production-source-edit auto-fire RESET pattern; CodeRabbit non-blocking pass).

**📌 INLINE CORRECTION FOOTNOTE [Phase-7 closer 2026-05-16; retroactive-correction-in-place pattern per Option A locked Cowork verdict]:** This §1's text below frames Phase-7 as introducing **"NEW class TEST-INFRA-FIX project-wide 15th cumulative"** + describes "Phase-7 introducing 2 NEW classes" framing in some narrative spots. The empirically-correct count cemented at Phase-7 closer §3 is **4 NEW Phase-7-introduced classes** (CI-CONFIG-ONLY at 7.3 + BASELINE-ARTIFACT at 7.5 + PERF-LEVER-LAZY-LOAD at 7.10 + TEST-INFRA-FIX at 7.13 = project-wide 12th + 13th + 14th + 15th cumulative). The "2 NEW classes" framing in this §1 (and in the v2.59 Plan amendment + CLAUDE.md HEAD pointer at the time of 7.13 close) was an **anchor-bias artifact** — sister-shape comparison to Phase-6's 2-NEW-class precedent anchored the count without re-derivation against Phase-7's empirical class-introduction record. Per Option A locked retroactive-correction-in-place pattern (sister-shape to 7.14 inline-footnote-at-`Docs/Phase5_Perf_Report.md §2` precedent + v2.55.1 in-place patch), the original §1 text below is preserved verbatim as the substantive empirical record at 7.13-close-time; the empirically-correct count is documented in this footnote + at `Docs/Phase7_Closure_Report.md §3` (canonical source of truth). Sister to 3-pattern anchor-bias-mitigation finding cluster cemented at Phase-7 closer §4 (v2.60.1 falsified-hypothesis + v2.60.4 per-task NEW-class tracker + v2.60.6 closer scope codification). [End inline correction footnote]

**Phase-7 Block C item #2 CLOSED via TEST-INFRA-FIX closure shape; eliminated `vi.useFakeTimers()` from sister grid-regression + upcoming-events list RTL tests at `qualia-shell/src/test/appfolioParity/calendar.test.tsx` (L212-294); replaced with `vi.setSystemTime()` alone (Date-only mocking; no scheduler-primitive mocking) + `waitFor()` polling on real-clock for async fetchEvents settle. Empirical 20-of-20 PASS post-fix vs 20-of-20 FAIL pre-edit baseline = binary deterministic variance-collapse.**

**🎯 Falsified-hypothesis → re-investigation → empirical-root-cause trajectory (process-discipline win foregrounded per Cowork verdict):** The kickoff-brief hypothesis was *"50ms real-clock wait insufficient at L260; `waitFor()` wrap with longer poll fixes the flake."* This was empirically WRONG. The mid-investigation 19/20 FAIL post-`waitFor`-wrap result was the falsification signal that triggered HARD HALT-IF #2 from kickoff brief. Step-5a render-pipeline inspection + Step-5b 30s-timeout diagnostic experiment + Step-5c isolated Q3 candidate #4 test (eliminate fake timers) surfaced the actual root cause: **`vi.useFakeTimers()` mocks React 19's scheduler primitives (MessageChannel / microtask queue) that the React renderer uses for state-update commits. When the test transitions to `vi.useRealTimers()` mid-async-cascade, pending render commits stranded under the fake primitives never fire on the real clock.** The sister grid-regression test happened to work by timing luck (different render-commit ordering); the upcoming-events list test deterministically lost the race. The HALT-then-deepen discipline prevented escalating to fix candidates #2 / #3 without root-cause confirmation — escalation without diagnosis would have been guess-and-check pathology. Recommended for GR-15 PRE-FLIGHT discipline addition at Plan v2.60+ amendment: "Kickoff-brief hypothesis correctness IS verifiable empirically; surface the falsification signal early; do not escalate fix candidates without root-cause confirmation."

**🎯 Variance-collapse signal achieved at 7.13 close (binary deterministic; sister-shape to 7.10 lever-effectiveness signal):** Pre-edit 20-of-20 FAIL deterministic in single-file isolation on darwin LOCAL (raw data: `Docs/Baselines/2026-05-15_Phase7_task_7_13_pre_edit_flake_baseline.txt`); post-edit 20-of-20 PASS deterministic (raw data: `Docs/Baselines/2026-05-15_Phase7_task_7_13_post_edit_validation_burst.txt`). Binary structural inversion with no statistical-power ambiguity at the boundary — strongest possible empirical signal for structural fix at this altitude. **3pt cross-phase deterministic-validation pattern at 7.13 close:** 7.10 (perf-lever; pre-edit n=3 LCP range 151ms / stddev 71ms → post-edit range 1ms / stddev 0ms) + 7.11 (n=10 noise-floor; LCP CV 2.29% as project-wide measurement infrastructure) + **7.13 (test-infra-fix; pre/post 20-of-20 binary inversion)**. Variance-collapse-as-fix-effectiveness pattern empirically calibrated at 3pt cross-phase.

**🎯 Diagnostic methodology captured for Phase-8+ structured-diagnostic-protocol reuse:**
1. **Step-5a render-pipeline inspection** RULED OUT 4 hypotheses systematically: (a) permission gate (mock returns true for all); (b) date filter (`vi.setSystemTime` produces `todayStr='2026-04-24'`; 9 inspections at 2026-04-27..30 pass `dueDate >= todayStr` filter); (c) render-pipeline split (grid + upcoming both read from same `events` state populated by `fetchEvents` at L80-101); (d) async-cascade signatures inside CalendarModule body (no `setTimeout` / `setInterval` / `requestAnimationFrame` / `queueMicrotask`).
2. **Step-5b 30s-timeout diagnostic experiment** confirmed OUTCOME β (infinite-hang at 30000ms; 3-of-3 FAIL; runtime 30.55s with `Tests 30.19s`); DOM diagnostic at the post-advance-useRealTimers checkpoint revealed body HTML ends with `<LoadingState>` (`fetchEvents` NEVER resolves; `setEvents/setLoading(false)` never commits).
3. **Step-5c sister-test cross-comparison diagnostic** revealed sister test at SAME checkpoint ALSO has `insp=0, grid=0, stillLoading=true` BUT passes in 157ms via waitFor poll. This isolated the cause to **waitFor polling interaction with React 19 scheduler primitives under fake-timer mocking**.
4. **Step-5c Q3 candidate #4 isolated test** (eliminate `vi.useFakeTimers`; use `vi.setSystemTime` alone + `waitFor`): 5-of-5 PASS confirmed structural fix family.
5. **Step-5d Q5 MODERATE same-file dual-fix verification** (apply same fix to sister + upcoming preventively): 20-of-20 PASS deterministic; full vitest 259/259 PASS; tsc clean.

**🎯 NEW class TEST-INFRA-FIX docked at 7.13 close — project-wide 15th cumulative class** (was 14 at 7.14 close → **15 at 7.13 close**). Defined by EDIT-SHAPE: targeted structural correction of test-tooling anti-pattern that produces deterministic flake (binary FAIL → binary PASS); structurally distinct from MEASUREMENT-ONLY (no measurement; the test is the measurement boundary itself) + E2E-PLAYWRIGHT (vitest+RTL altitude, not Playwright e2e altitude) + COMPONENT-FIX (production source preserved byte-for-byte; only test spec changes). Sub-domain: `vi.useFakeTimers` + React 19 scheduler primitive interaction at vitest + RTL + jsdom altitude. **1pt within Phase-7 at 7.13 close**; 2pt cross-phase calibration at first Phase-8+ recurrence (recommended monitoring: any `vi.useFakeTimers` usage in vitest tests with React 19 components having async-cascade-to-render paths).

**🎯 Substantive Phase-7 engineering-finding catalog now reads 2 publishable-level findings cemented at 7.13 close (sister-shape to 7.10's substantive engineering finding pivot):**
- **Finding (A) — Lazy-load IS structurally-correct lever family at React 19 + Vite 6 + 4,500 ms-LCP baseline architecture** (cemented across 4 cross-referenced closes 6.7 + 7.10 + 7.11 + 7.14 retroactive footnote). Bottleneck is initial-paint JS parse+execute time, NOT critical-path bytes-downloaded. 3 lever data points calibrate the 2-direction perf-lever class (1 SHIP + 2 REVERT cross-phase).
- **Finding (B) — `vi.useFakeTimers` + React 19 scheduler primitives is structurally fragile when component-under-test has async-cascade-to-render path** (cemented at 7.13). Fake-timer mocking of `MessageChannel` / microtask queue strands pending render commits across the `useFakeTimers → useRealTimers` handoff. Convention: prefer `vi.setSystemTime()` alone for Date-only mocking when component has no `setTimeout`/`setInterval`/`requestAnimationFrame` in its body; let RTL `waitFor()` handle async settlement against the real clock.

**🎯 Phase-7 14-of-14 ✓ FULL CLOSURE achieved at 7.13 close** — all 14 Phase-7 tasks closed (7.1 + 7.2 + 7.3 + 7.4 + 7.5 + 7.6 + 7.7 co-closed at 7.5 + 7.8 + 7.9 + 7.10 + 7.11 + 7.12 co-closed at 7.3 + 7.13 + 7.14 = 14 of 14 ✓; 12 PRs total since 7.7 + 7.12 were opportunistic co-closures). **Block C 3-of-3 FULLY CLOSED at 7.13** (7.12 ✓ at 7.3 + 7.14 ✓ at e657b89 + **7.13 ✓ at this commit**). **Phase-7 closer becomes IMMEDIATE next deliverable** — CLOSURE-NARRATIVE-CONSOLIDATION 2nd data point cross-phase (1st = Phase-6 Task 6.9; sister-shape closure shape; project-wide 11th class extends to 2pt cross-phase).

**🎯 28-of-28 cross-phase chunk-axis preservation cumulative at 7.13 close** (Phase-5 6 LAW + Phase-6 8 + Phase-7 14 [7.2 + 7.3 + 7.4 + 7.5 + 7.6 + 7.8 + 7.9-REVERT + v2.55.1 in-place patch + 7.10-NEW-canonical-established + 7.10-post-merge-sweep + 7.11 + 7.14 + 7.13 + 7.13-post-merge-sweep] = 28); 5-of-5 within-Phase-7-post-BREAK at 7.13 (HEAD-post-7.10 baseline + 7.11 + 7.14 + 7.13 + post-merge-sweep verification = 5-of-5 preservation since 7.10 BREAK reset); test-spec-only edit at `qualia-shell/src/test/**` is fully outside Vite entry graph (test-tooling consumed by vitest at test-validation time; not bundled into production `dist/`); sister-shape to 7.2 axe-baseline.spec.ts spec-only edit + 7.11 + 7.14 DOC-only preservation patterns.

**🎯 24 consecutive cross-phase sweep-resolutions cemented at 7.13 sweep** (meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6 → 7.8 → 7.9 → 7.10 → 7.11 → 7.14 → **7.13**). Resolved across §9 row 7.14 squash-SHA cell `TBD → e657b89` in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` + Phase status line at top of `Docs/Phases/Phase_7_Plan.md` + Task 7.14 closure-narrative TBD references in `Docs/Phase7_Task_7_14_Completion_Report.md` (4 reference spots: §1 Commit + §1 Green CI run + §5 verification matrix Parity-gate+CodeRabbit rows + §6 Rollback SHA) + this HEAD pointer.

**🎯 Paths-filter quirk auto-fire RESET at 7.13** — vitest-spec at `qualia-shell/src/test/appfolioParity/calendar.test.tsx` IS inside the parity-gate paths filter via the `qualia-shell/src/**` glob at L19+L29 of `.github/workflows/appfolio-parity-gate.yml`. Sister to 7.1 + 7.10 production-source-edit auto-fire RESET pattern (16-task cross-phase scope at 7.14 → 16-task scope at 7.13 since 7.13 RESETS via test-spec-at-src/test/** path; cross-phase tracking distinguishes vitest-at-`src/test/**` AUTO-FIRE vs playwright-at-`e2e/**` MANUAL-DISPATCH empirically). Manual-dispatch fallback available but not needed.

7 file edits + 1 NEW baseline (1 source/test: UPDATE `qualia-shell/src/test/appfolioParity/calendar.test.tsx` at L34 import + L212-294 sister + upcoming RTL tests / NEW `Docs/Phase7_Task_7_13_Completion_Report.md` 8-section template / NEW `Docs/Baselines/2026-05-15_Phase7_task_7_13_post_edit_validation_burst.txt` 20-of-20 PASS ledger / UPDATE `Docs/AppFolio_Parity_Implementation_Plan_v2.md` v2.59 amendment closes row 7.13 + v2.59 Changelog entry + 7.14 squash-SHA cell `TBD` → `e657b89` + Pending row (Phase-7) 1 → 0 (FULL CLOSURE) + NEW class TEST-INFRA-FIX docked at 15th project-wide cumulative / UPDATE `Docs/Phases/Phase_7_Plan.md` Phase status row 7.14 closure + 7.13 closure narrative + Block C 3-of-3 FULLY CLOSED milestone + Phase-7 14-of-14 ✓ FULL CLOSURE / UPDATE `Docs/Phase7_Task_7_14_Completion_Report.md` 7.14 TBD → `e657b89` / `#66` across 4 reference spots / UPDATE this CLAUDE.md HEAD pointer pivot + Phase summary 13 → 14 of 14 ✓ + Calibration classes 14 → 15 with NEW TEST-INFRA-FIX docked + 2-finding Phase-7 engineering-finding catalog cemented + Conventions block NEW entry on vi.useFakeTimers + React 19 scheduler anti-pattern + Block C 3-of-3 FULLY CLOSED milestone). NEW pre-edit baseline (`Docs/Baselines/2026-05-15_Phase7_task_7_13_pre_edit_flake_baseline.txt`) was already created at Step-1 of execution; it remains the canonical pre-edit baseline. Vitest 259/259 LOCAL clean post-fix (FIRST clean LOCAL 259/259 since Phase-6 Task 6.3; calendar.test.tsx:260 darwin flake structurally eliminated).

---

## §2. Falsified-hypothesis → empirical-root-cause trajectory + diagnostic methodology (publishable-level Phase-7 finding)

### §2.1 Hypothesis trajectory (kickoff-brief hypothesis → falsification → root cause)

**Original hypothesis (kickoff-brief framing):** *"The 50ms real-clock wait at calendar.test.tsx:259-260 (`await new Promise(r => setTimeout(r, 50))`) is insufficient for the upcoming-events list to render after `vi.useFakeTimers + advanceTimersByTimeAsync(100) + useRealTimers` handoff. `waitFor()` wrap with longer poll fixes the flake by giving the render more real-clock time."*

**Step-1 PRE0 finding (sub-rejection #1):** kickoff-brief claimed `waitFor` was already imported at L34; empirical inspection showed L34 imports were `render, screen` only. Sub-finding for v2.60+ amendment candidate "Kickoff-brief import-statement precision verification" (sister to source-provenance verification GR-14 v2.21 step zero).

**Step-1 PRE0 finding (sub-rejection #2):** kickoff-brief assumed source path `src/components/Calendar/`; empirical path is `src/components/StrataDashboard/modules/CalendarModule.tsx`. Sister to #1; both surface kickoff-brief-as-input-vs-empirical-reality discipline.

**Mid-execution falsification signal (Step-5d post-fix verification gate):** With `waitFor()` wrap + fake-timer pattern intact, 20-iter post-fix burst yielded 19-of-20 FAIL (Iter 1-16 FAIL, Iter 17 PASS, Iter 18-20 FAIL). HARD HALT-IF #2 from kickoff brief triggered: *"If even 1-of-20 FAILS, HALT for Cowork investigation — the structural fix didn't address the root cause."* Halt-recovery discipline prevented escalation to Q3 fix candidates #2/#3 without root-cause confirmation.

**Hypothesis revision (5 substantive empirical refinements at HALT):**
1. NOT a partial-render race — `getAllByTestId('calendar-inspection-event')` finds ZERO elements within 5000ms waitFor window (originally hypothesized as 3-8 partial elements);
2. vitest test-level timeout (5000ms) hit, NOT waitFor-level timeout — runtime 5007ms = vitest's default `testTimeout: 5000ms`;
3. Sister grid-regression test PASSES consistently with structurally-identical setup — only upcoming-events test fails;
4. act() warning on CalendarModule state updates suggests async cascade fires after the test believes render is complete;
5. 20-of-20 deterministic FAIL pre-edit baseline already showed fail-mode is structurally always present in single-file isolation; historical 5-of-11 full-suite firing was warm-up-state masking.

**Step-5b 30s-timeout diagnostic experiment OUTCOME = β (infinite-hang confirmed):** 3-of-3 FAIL at 30000ms timeout; runtime 30.55s with `Tests 30.19s`; the upcoming-events list NEVER renders under the fake→real timer handoff in single-file isolation, even with 30 seconds of wall-clock real time.

**Step-5c sister-test cross-comparison diagnostic (the smoking-gun isolation):** Sister grid-regression test in isolation reports `insp=0, grid=0, stillLoading=true` at the SAME post-advance-useRealTimers checkpoint — BUT sister passes in 157ms via waitFor poll (grid=9+ within 2000ms timeout). Both tests share identical state at the diagnostic checkpoint; difference must be in the waitFor polling interaction with React 19's render commit cycle under fake-timer-mocked scheduler primitives.

**Step-5c Q3 candidate #4 isolated test (eliminate vi.useFakeTimers):** 5-of-5 PASS without `vi.useFakeTimers()` (use `vi.setSystemTime` alone + `waitFor`). **Root cause empirically confirmed.**

### §2.2 Root cause framing (publishable-level)

**`vi.useFakeTimers()` mocks React 19's scheduler primitives — specifically `MessageChannel` and microtask queue — that the React renderer uses for state-update commits in concurrent rendering mode.** When the test transitions to `vi.useRealTimers()` mid-async-cascade (specifically: after `await vi.advanceTimersByTimeAsync(100)` flushes the `await strataGet()` microtask that fires `setEvents(seed) + setLoading(false)`, but BEFORE React's scheduler has fully committed the resulting re-render), pending render commits scheduled under the fake `MessageChannel` are stranded and never fire on the real `MessageChannel` post-handoff. The CalendarModule renders only the initial `<LoadingState>` and is structurally unable to commit the calendar tab content (grid + upcoming-events list) re-render. Sister grid-regression test happens to work by timing luck — the specific ordering of commits between the grid-render path and the upcoming-list-render path puts the grid commit on the side of the handoff that fires; the upcoming-list commit deterministically lands on the stranded side. Both render paths ARE structurally identical (read from same `events` state; same loading-gate; same permission-gate); the timing-luck differential is at React's internal render-commit cycle ordering, not at the component/test-spec altitude.

### §2.3 Variance-collapse signal (sister-shape to 7.10's lever-effectiveness signal)

**Pre-edit baseline:** 20-of-20 FAIL (deterministic in single-file isolation). Raw data: `Docs/Baselines/2026-05-15_Phase7_task_7_13_pre_edit_flake_baseline.txt`.
**Post-edit validation burst:** 20-of-20 PASS (deterministic). Raw data: `Docs/Baselines/2026-05-15_Phase7_task_7_13_post_edit_validation_burst.txt`. Total wallclock 17s; per-iter avg 0.85s.
**Binary structural inversion:** 100% → 0% fail rate; 0% → 100% pass rate. No statistical-power ambiguity at the boundary — strongest possible empirical signal for structural fix at this altitude (sister-shape to 7.10's pre-edit n=3 LCP range 151ms / stddev 71ms → post-edit range 1ms / stddev 0ms variance-collapse signal).

**3pt cross-phase deterministic-validation pattern at 7.13 close:** 7.10 (perf-lever; variance-collapse on LCP) + 7.11 (n=10 noise-floor; LCP CV 2.29%) + **7.13 (test-infra-fix; pre/post 20-of-20 binary inversion)**. Variance-collapse-as-fix-effectiveness pattern empirically calibrated at 3pt cross-phase; recommended for inclusion as substantive Phase-7 engineering-finding pattern in Phase-7 closer narrative.

### §2.4 Diagnostic methodology pattern (recommended for Phase-8+ structured-diagnostic-protocol reuse)

The Step-5a / 5b / 5c sequence at 7.13 is a 5-stage structured-diagnostic-protocol that can be reused for any future flake stabilization:

1. **Step-5a code-pipeline inspection** — surface-area-rule-out via systematic code reading. Identify all candidate hypotheses (permission gates, data filters, render-pipeline splits, async-cascade signatures, etc.); for each, read the relevant source to either confirm or rule out. Goal: shrink hypothesis space from broad to narrow before any code edit.
2. **Step-5b timeout-bump diagnostic experiment** — disambiguate infinite-hang vs slow-render. Outcomes: (α) all PASS at extended timeout = root cause is async-cascade-needs-real-clock-time (fix: bump testTimeout); (β) all FAIL at extended timeout = infinite-hang pathology (fix: structural change required); (γ) mixed = real timing race (fix: findBy* queries with longer timeout).
3. **Step-5c cross-comparison diagnostic** — find a sister test with structurally-identical setup that exhibits different failure mode. Compare DOM state at same checkpoint; differentials isolate the causal mechanism.
4. **Step-5c isolated fix-candidate test** — apply ONE fix candidate in isolation; run small burst (5-iter); confirm fix family before applying broadly.
5. **Step-5d full-burst validation** — apply fix preventively to symmetric sister sites; run full burst (20-iter); confirm binary deterministic post-fix state vs pre-edit baseline.

This protocol is reusable for any test-infra flake regardless of root-cause domain (timer-handoff, network-mock, DOM-cleanup, test-pollution, scheduler-primitive). Recommended for GR-15 amendment candidate at Plan v2.60+: "Test-infra flake stabilization tasks should follow the 5-stage structured-diagnostic-protocol from 7.13 close before any structural fix is committed."

---

## §3. Source diff summary

**1 test-spec edit at `qualia-shell/src/test/appfolioParity/calendar.test.tsx` (32 insertions / 15 deletions; net +17 LoC):**

- L34: `+ waitFor` added to `@testing-library/react` import
- L212-255 (sister grid-regression test): removed `vi.useFakeTimers() + vi.advanceTimersByTimeAsync(100) + vi.useRealTimers() + await new Promise(r => setTimeout(r, 50))` setup chain; added `await waitFor(..., { timeout: 2000 })` wrap around the assertion; comment block updated to reflect Phase-7 Task 7.13 root-cause framing; preserved `toBeGreaterThanOrEqual(9)` assertion strictness per Cowork Q5 MODERATE verdict; `finally { vi.useRealTimers() }` simplified (idempotent; no need for `isFakeTimers()` guard since fake timers were never enabled)
- L257-294 (upcoming-events list test): identical surgical structural change at the L260 firing site; preserved `toBe(9)` assertion strictness; comment block updated to root-cause framing

**Zero production-source / config / e2e-spec / workflow / baseline-PNG edits.** All work is at test-spec altitude (`qualia-shell/src/test/**`) consumed by vitest at test-validation time; outside Vite entry graph; production `dist/` chunk axes preserved byte-for-byte vs HEAD-post-7.14 canonical.

5 doc edits + 1 NEW baseline ledger:

- NEW `Docs/Phase7_Task_7_13_Completion_Report.md` (this document; 8-section template; byte-shape mirror of 7.14 + substantive 7.13 narrative)
- NEW `Docs/Baselines/2026-05-15_Phase7_task_7_13_post_edit_validation_burst.txt` (20-of-20 PASS ledger; sister-shape to pre-edit baseline)
- UPDATE `Docs/AppFolio_Parity_Implementation_Plan_v2.md` (v2.59 amendment closes row 7.13 + Changelog + 7.14 squash-SHA `TBD → e657b89` + Pending Phase-7 1 → 0 + NEW class TEST-INFRA-FIX docked)
- UPDATE `Docs/Phases/Phase_7_Plan.md` (Phase status row 7.14 closure + row 7.13 closure narrative + Block C 3-of-3 FULLY CLOSED milestone + Phase-7 14-of-14 ✓ FULL CLOSURE)
- UPDATE `Docs/Phase7_Task_7_14_Completion_Report.md` (7.14 TBD → `e657b89` / `#66` across 4 reference spots; 24-consecutive cross-phase sweep-resolutions cemented)
- UPDATE `CLAUDE.md` (HEAD pointer pivot + Phase summary 13 → 14 of 14 ✓ + Calibration classes 14 → 15 with NEW TEST-INFRA-FIX + 2-finding Phase-7 engineering-finding catalog + Conventions block NEW entry on vi.useFakeTimers + React 19 scheduler anti-pattern + Block C 3-of-3 FULLY CLOSED milestone)

---

## §4. Chunk-axis preservation (test-spec-only shape; production source preserved byte-for-byte)

Test-spec edit at `qualia-shell/src/test/appfolioParity/calendar.test.tsx` + 5 doc-sweep edits + 1 NEW baseline at HEAD-post-7.14 preserves all production chunk axes byte-for-byte vs HEAD-post-7.14 canonical (which is identical to HEAD-post-7.10 canonical since 7.11 + 7.14 were both DOC-only):

| Chunk | HEAD-post-7.10 canonical | 7.13 close | Match |
|---|---|---|:-:|
| Eager `<script>` JS (parity-gate canonical) | `index-MO01qt09.js` / 253,683 / `07b36c4a…2b22` | UNCHANGED | ✅ byte-for-byte |
| Eager `<link>` CSS | `index-BebuHEVu.css` / 49,312 / `8fced46a…1815` | UNCHANGED | ✅ byte-for-byte |
| Vendor JS | `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` | UNCHANGED | ✅ byte-for-byte (cumulative preserved-since-6.x stability) |
| 7 lazy chunks | aggregate 217,607 B | UNCHANGED | ✅ byte-for-byte |

**28-of-28 cross-phase chunk-axis preservation cumulative at 7.13** (Phase-5 6 LAW + Phase-6 8 + Phase-7 14 = 28); 5-of-5 within-Phase-7-post-BREAK at 7.13 (HEAD-post-7.10 baseline + 7.11 + 7.14 + 7.13 + post-merge-sweep verification = 5-of-5 preservation since 7.10 BREAK reset). Test-spec edit at `qualia-shell/src/test/**` is consumed by vitest at test-validation time; not bundled into production `dist/`; sister-shape to 7.2 axe-baseline.spec.ts spec-only edit + 7.11 + 7.14 DOC-only preservation patterns. Very strong inductive evidence at scale.

---

## §5. Verification matrix

| Check | Target | Result | Status |
|---|---|---|:-:|
| Step-1 pre-edit baseline burst (20-iter) | 20-of-20 FAIL deterministic | 20-of-20 FAIL captured at `Docs/Baselines/2026-05-15_Phase7_task_7_13_pre_edit_flake_baseline.txt` | ✓ |
| Step-5a render-pipeline inspection | 4 candidate hypotheses ruled out | permission gate / date filter / render-pipeline split / async-cascade signatures all RULED OUT | ✓ |
| Step-5b 30s-timeout diagnostic experiment | OUTCOME α / β / γ disambiguation | OUTCOME β infinite-hang confirmed (3-of-3 FAIL at 30000ms; runtime 30.55s) | ✓ |
| Step-5c sister-test cross-comparison diagnostic | identify causal mechanism via DOM state at same checkpoint | sister `insp=0, grid=0, stillLoading=true` matches upcoming; isolation to waitFor-React-scheduler interaction | ✓ |
| Step-5c Q3 candidate #4 isolated test | eliminate `vi.useFakeTimers`; 5-iter PASS | 5-of-5 PASS; root cause confirmed | ✓ |
| Step-5d Q5 MODERATE same-file dual-fix | symmetric structural repair on sister + upcoming | both tests fixed surgically (32 insertions / 15 deletions) | ✓ |
| Step-5d post-fix verification 20-iter burst | binary 20-of-20 PASS | 20-of-20 PASS captured at `Docs/Baselines/2026-05-15_Phase7_task_7_13_post_edit_validation_burst.txt`; total wallclock 17s; per-iter avg 0.85s | ✓ HARD HALT-IF #2 cleared |
| Step-5d strict gate `tsc -b` | clean | silent success (no TS errors) | ✓ |
| Step-5d strict gate `vitest run` (full suite) | 259/259 PASS | 259/259 PASS across 37 test files in 2.73s; FIRST clean LOCAL 259/259 since Phase-6 Task 6.3 | ✓ |
| Step-6 doc sweep | 5 EDIT + 2 NEW files (1 test-spec + 1 NEW Completion Report + 1 NEW baseline + 4 doc-sweep edits) | per §3 above | ✓ |
| Step-7 commit + push | branch `phase-7/task-7.13-calendar-test-darwin-flake-stabilization` | TBD | TBD |
| Step-7 parity-gate auto-fire RESET | paths-filter `qualia-shell/src/**` covers `src/test/**` | TBD | TBD |
| Parity Gate per PR | 16-of-16 SUCCESS via auto-fire | TBD | Run pending post-PR-open |
| PII Scan per push | success | TBD | Run pending post-PR-open |
| CodeRabbit review per PR | pass | TBD (expect Trivial-to-Simple effort given test-spec-only changeset) | Run pending post-PR-open |
| §9 row 7.13 sub-tracker | R → ✓ (closed-as-TEST-INFRA-FIX) | ✓ | Plan v2.59 amendment |
| §9 row 7.14 squash-SHA cell | TBD → `e657b89` | ✓ | Plan v2.59 amendment (24-consecutive sweep-resolutions) |
| §9 Pending row Phase-7 | 1 → 0 (FULL CLOSURE) | ✓ | Plan v2.59 amendment |
| NEW class TEST-INFRA-FIX | project-wide 15th cumulative; 1pt within Phase-7 | ✓ | Plan v2.59 + CLAUDE.md Calibration classes block |
| Block C 3-of-3 FULLY CLOSED milestone | 7.12 ✓ at 7.3 + 7.14 ✓ at e657b89 + 7.13 ✓ at this commit | ✓ at this commit | Phase-7 progress 14 of 14 ✓ |
| Phase-7 14-of-14 ✓ FULL CLOSURE milestone | all 14 Phase-7 tasks closed | ✓ at this commit | Phase-7 closer becomes IMMEDIATE next deliverable |

---

## §6. Rollback SHA

Rollback target: `git revert <7.13-squash-SHA>` (Phase-7 7.13 close; reverts to HEAD-post-7.14 state at `e657b89`). Trivial test-spec-only revert; the calendar.test.tsx change is structural fix; reverting restores the pre-edit `vi.useFakeTimers + advanceTimersByTimeAsync + useRealTimers + setTimeout(50)` pattern and the 20-of-20 darwin flake. Production source preserved through 7.13 by construction (test-spec-only edit). Phase-7 7.13 squash SHA `TBD` (will be revertable independently once merged; resolution at next-task sweep — Phase-7 closer — per established absorb-into-next-sweep convention).

---

## §7. Carry-forward to Phase-7 closer / Phase-8

1. **🎯 Phase-7 14-of-14 ✓ FULL CLOSURE achieved at 7.13 close** — Block C 3-of-3 FULLY CLOSED (7.12 ✓ at 7.3 v2.50.1+v2.50.2 + 7.14 ✓ at e657b89 + **7.13 ✓ at this commit**). All Phase-7 substantive task work complete; **Phase-7 closer (CLOSURE-NARRATIVE-CONSOLIDATION 2nd cross-phase data point; sister to 6.9) becomes the IMMEDIATE next deliverable** — final Phase-7 substantive work is the closure narrative consolidation, mirroring Phase-1 / 3 / 4 / 5 / 6 single-closure-per-phase precedent.

2. **🎯 NEW class TEST-INFRA-FIX docked at 7.13 close — project-wide 15th cumulative class** (was 14 at 7.14 close → **15 at 7.13 close**). Defined by EDIT-SHAPE: targeted structural correction of test-tooling anti-pattern that produces deterministic flake (binary FAIL → binary PASS); structurally distinct from MEASUREMENT-ONLY (no measurement; the test is the measurement boundary itself) + E2E-PLAYWRIGHT (vitest+RTL altitude, not Playwright e2e altitude) + COMPONENT-FIX (production source preserved byte-for-byte; only test spec changes). Sub-domain: `vi.useFakeTimers` + React 19 scheduler primitive interaction at vitest + RTL + jsdom altitude. **1pt within Phase-7 at 7.13 close**; 2pt cross-phase calibration at first Phase-8+ recurrence (recommended monitoring: any `vi.useFakeTimers` usage in vitest tests with React 19 components having async-cascade-to-render paths).

3. **🎯 Substantive Phase-7 engineering-finding catalog cemented at 2 publishable-level findings** (for Phase-7 closer §1 + §3 inclusion):
   - **Finding (A) — Lazy-load IS structurally-correct lever family at React 19 + Vite 6 + 4,500 ms-LCP baseline architecture** (cemented across 4 cross-referenced closes 6.7 + 7.10 + 7.11 + 7.14 retroactive footnote). Bottleneck is initial-paint JS parse+execute time, NOT critical-path bytes-downloaded. 3 lever data points calibrate the 2-direction perf-lever class (1 SHIP + 2 REVERT cross-phase): 6.7 font deferral REVERT (network-transfer; NO-OP) + 7.9 vendor split REVERT (download bytes; NO-OP) + 7.10 lazy-load SHIP (parse+execute; SUBSTANTIVE WIN −550 ms / −12.4%). LCP CV 2.29% at HEAD-post-7.10 (7.11) = first non-degenerate noise-floor metric; project-wide measurement infrastructure deliverable.
   - **Finding (B) — `vi.useFakeTimers` + React 19 scheduler primitives is structurally fragile when component-under-test has async-cascade-to-render path** (cemented at 7.13). Fake-timer mocking of `MessageChannel` / microtask queue strands pending render commits across the `useFakeTimers → useRealTimers` handoff. Convention: prefer `vi.setSystemTime()` alone for Date-only mocking when component has no `setTimeout`/`setInterval`/`requestAnimationFrame` in its body; let RTL `waitFor()` handle async settlement against the real clock.

4. **🎯 28-of-28 cross-phase chunk-axis preservation cumulative at 7.13 close** (Phase-5 6 LAW + Phase-6 8 + Phase-7 14 = 28); 5-of-5 within-Phase-7-post-BREAK at 7.13. Test-spec-only edit at `qualia-shell/src/test/**` fully outside Vite entry graph. Very strong inductive evidence at scale.

5. **🎯 24 consecutive cross-phase sweep-resolutions cemented at 7.13 sweep** (extends 23-pattern at 7.14 → 24-pattern at 7.13); 7.14 TBD → `e657b89` / `#66` resolution co-shipped across §9 row 7.14 + Phase_7_Plan.md Phase status line + Phase7_Task_7_14_Completion_Report.md 4 reference spots + this HEAD pointer pivot.

6. **🎯 Paths-filter quirk auto-fire RESET at 7.13** — vitest-spec at `qualia-shell/src/test/appfolioParity/calendar.test.tsx` IS inside the parity-gate paths filter via `qualia-shell/src/**` glob; sister to 7.1 + 7.10 production-source-edit auto-fire RESET pattern. Cross-phase tracking distinguishes vitest-at-`src/test/**` AUTO-FIRE vs playwright-at-`e2e/**` MANUAL-DISPATCH empirically.

7. **🎯 Phase-7 deferred-items state at 7.13 close: 4 → 7 (NEW additions from 7.13 trajectory)** — 4 carried forward from 7.14 close (#1 repo Actions-PR-create setting + #2 first-real-execution-as-truth-signal + #4 REFRAMED lazy-load-correct-family + #5 retention-days hygiene + #6 Suspense+ErrorBoundary production-polish; plus #7 parameterization absorbed at 7.11) + 3 NEW from 7.13 close: (A) GR-15 amendment candidate v2.60+: "Kickoff-brief hypothesis correctness IS verifiable empirically; surface the falsification signal early; do not escalate fix candidates without root-cause confirmation" (sister to source-provenance verification GR-14 v2.21 step zero); (B) GR-15 amendment candidate v2.60+: "Kickoff-brief import-statement precision verification" (PRE-FLIGHT discipline; sister to A); (C) GR-15 amendment candidate v2.60+: "Test-infra flake stabilization tasks should follow the 5-stage structured-diagnostic-protocol from 7.13 close before any structural fix is committed". All 7 carry forward to Phase-7 closer for consolidation + Phase-8+ priority statement.

8. **🎯 Phase-7 closer drafting recommended-next** (CLOSURE-NARRATIVE-CONSOLIDATION 2nd cross-phase data point; sister to 6.9 Phase-6 closer). Suggested closer narrative scope:
   - 14-task arc summary (Block A 8-of-8 + Block B 3-of-3 + Block C 3-of-3 = 14 of 14 ✓)
   - 2-finding substantive engineering-finding catalog (Finding A lazy-load + Finding B fake-timer-anti-pattern)
   - 5pt cross-phase chunk-axis preservation pattern empirical evidence (28-of-28 cumulative)
   - 24-consecutive cross-phase sweep-resolutions cementation
   - 15-class project-wide cumulative calibration state (NEW classes at 7.10 + 7.13 = 2 NEW Phase-7-introduced classes; sister to Phase-6's COMPONENT-FIX + CLOSURE-NARRATIVE-CONSOLIDATION = 2 NEW Phase-6-introduced classes)
   - 7-item carry-forward to Phase-8 (3 NEW kickoff-brief PRE-FLIGHT discipline items + 4 prior deferred items)
   - GR-15 PERMANENT process changes for v2.60+ (fake-timer-anti-pattern + structured-diagnostic-protocol + kickoff-brief verification)

---

## §8. Lessons learned for Plan v2.59+ amendment

**Engineering insight 1 — Falsified-hypothesis trajectory is itself a substantive engineering finding.** Task 7.13's process-discipline win (HALT-then-deepen rather than escalate fix candidates) is structurally important — the 19/20 mid-investigation FAIL was the falsification signal that prevented guess-and-check pathology. The kickoff-brief hypothesis was empirically wrong; the empirical evidence at HALT showed it; the right discipline was to surface the HALT to Cowork rather than escalate to Q3 fix candidates #2/#3 without root-cause confirmation. Recommended for GR-15 PRE-FLIGHT discipline addition at Plan v2.60+: "When mid-investigation empirical signal contradicts kickoff-brief hypothesis, HALT and deepen; do not escalate fix candidates without root-cause confirmation."

**Engineering insight 2 — `vi.useFakeTimers` + React 19 scheduler primitive interaction is structurally fragile at vitest+RTL+jsdom altitude.** The vi.useFakeTimers → vi.advanceTimersByTimeAsync → vi.useRealTimers handoff is empirically unsafe when the component-under-test has an async-cascade-to-render path. Pending render commits stranded under fake primitives never fire on the real clock post-handoff. Convention codification at Plan v2.59+ amendment: "Reach for vi.useFakeTimers() ONLY when the component-under-test has explicit setTimeout/setInterval/requestAnimationFrame in its body that the test needs to advance synchronously; for Date-only mocking, prefer vi.setSystemTime() alone (which mocks Date without mocking scheduler primitives) + RTL waitFor() for async settlement." Sister to GR-15 v2.43 build-mode-aware chunk-axis comparison protocol but at vitest-test-infra altitude.

**Engineering insight 3 — 5-stage structured-diagnostic-protocol for test-infra flake stabilization** (5a code-pipeline inspection → 5b timeout-bump α/β/γ disambiguation → 5c sister-test cross-comparison + isolated fix-candidate test → 5d full-burst validation). Reusable for any test-infra flake regardless of root-cause domain. Recommended for GR-15 amendment candidate at Plan v2.60+: "Test-infra flake stabilization tasks should follow the 5-stage structured-diagnostic-protocol from 7.13 close before any structural fix is committed."

**Engineering insight 4 — 3pt cross-phase deterministic-validation pattern empirically calibrated at 7.13 close.** Variance-collapse-as-fix-effectiveness signal now anchored at 3 data points: 7.10 (perf-lever; LCP variance collapse) + 7.11 (n=10 noise-floor; LCP CV 2.29%) + 7.13 (test-infra-fix; pre/post 20-of-20 binary inversion). Pattern: when an edit produces binary deterministic post-state (no statistical-power ambiguity at the boundary), the structural fix is empirically validated at the strongest-possible signal. Recommended pattern codification at Plan v2.59+ amendment: "Variance-collapse signal (binary deterministic post-state) is the highest-confidence structural-fix-effectiveness empirical signal at our altitude; preserve as deliverable when achieved across multiple data points."

**Engineering insight 5 — Kickoff-brief hypothesis correctness IS verifiable empirically.** Task 7.13's pre-edit baseline (20-of-20 FAIL) + post-fix mid-investigation (19-of-20 FAIL) + post-fix post-correction (20-of-20 PASS) sequence empirically verified that the original kickoff-brief hypothesis was wrong. The empirical method works: surface mid-investigation signals; if signal contradicts hypothesis, surface HALT to Cowork; do not escalate fix candidates without root-cause confirmation. Recommended for GR-15 amendment at Plan v2.60+: "Kickoff-brief hypothesis correctness IS verifiable empirically; surface the falsification signal early; do not escalate fix candidates without root-cause confirmation" (sister to source-provenance verification GR-14 v2.21 step zero; both surface kickoff-brief-as-input-vs-empirical-reality discipline).

**Engineering insight 6 — Redundant post-condition assertions preserved per minimal-diff + test-as-documentation principle** (Cowork-flexible at Step-4 GO verdict). Sister test L240 `expect(inspectionDots.length).toBeGreaterThanOrEqual(9)` and upcoming test L278 `expect(rows.length).toBe(9)` are structurally redundant with their preceding waitFor assertions but preserved for test-as-documentation clarity (the assertion-after-wait pattern explicitly states what the test guarantees post-render-settle; the wait pattern alone leaves the guarantee implicit in the polling structure). Both styles are acceptable; minimal-diff preserved the original intent. Recommended pattern codification at Plan v2.59+ amendment: "Test-spec edits should default to minimal-diff (preserve adjacent stylistic patterns even if structurally redundant) unless explicit refactoring scope is stated."

---

**End of Phase-7 Task 7.13 Completion Report.**
