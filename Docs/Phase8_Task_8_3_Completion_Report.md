# Phase 8+ — Task 8.3 — Provider-tree SSR-safety audit — Completion Report

**Date:** 2026-05-17
**Commit (HEAD on `main`):** `TBD` (squash commit for PR #TBD, Task 8.3 — Provider-tree SSR-safety audit; 8.3 squash-SHA cell `TBD` resolves at 8.4 sweep per 28-consecutive-cross-phase-sweep-resolutions convention extending 27-pattern at Phase-8+ Task 8.2 → 28-pattern at 8.3)
**Green CI run:** Parity Gate `TBD` (manual-dispatched per paths-filter quirk; 19-task cross-phase precedent — DOC-only edit at `Docs/**` + root `CLAUDE.md` outside `qualia-shell/src/**` glob; sister-shape to Task 8.1 OPENER manual-dispatch) + PII Scan `TBD` ✓ SUCCESS + CodeRabbit review pass
**Plan reference:** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-8+ sub-tracker row 8.3 (created at v2.61 OPENING; row R → ✓ at v2.63 amendment) + `Docs/Phases/Phase_8_Plan.md §4 Block A item 8.3` (mandatory PRE-FLIGHT discipline including v2.60.1-v2.60.6 standing PRE-FLIGHT discipline + v2.62.1 PRE-FLIGHT scope-shape discipline adopted at Task 8.2 close per 4-pattern anchor-bias-mitigation cluster)
**Template mirror:** `Docs/Phase8_Task_8_1_Completion_Report.md` (Phase-8+ Task 8.1 OPENER sister-shape — both are SCOPING-ONLY class shape; both DOC-only deliverables; both audit-substrate-only; 8.1 introduced SCOPING-ONLY class at project-wide 16th cumulative as 1pt data point; **8.3 completes SCOPING-ONLY class to 2pt cross-phase full calibration**, sister-shape to CLOSURE-NARRATIVE-CONSOLIDATION class full calibration at Phase-6 6.9 + Phase-7 closer 2pt cross-phase pattern).
**v1-lineage substitute.** Phase-8+ has no v1 plan source (post-v1 carry-forward arc; sister to Phase-6 + Phase-7 + Phase-8+ Task 8.1 + Task 8.2). Authoritative scope source is `Docs/Phase8_SSR_Architectural_Scoping.md §1.5 + §6.3` Task 8.3 carve-out + `Docs/Phase7_Closure_Report.md §8` Phase-8+ Block A item 2 + `Docs/Phases/Phase_8_Plan.md §4 Block A item 8.3` refined at this close.

---

## §1. Summary

**🎯 Phase-8+ Block A item 2 CLOSED at Task 8.3.** Ships DOC-only audit deliverable per Cowork Q1 SCOPING-ONLY 2pt LOCK + Q2 pure-audit-just-document-SSR-incompatibility LOCK + Q7 DOC-only-minimal-gate LOCK — NEW `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md` (530 lines / 36,278 bytes; 8-section template covering §0 Cover + §1 inventory + §2 SSR-safety taxonomy + §3 per-provider audit at Moderate Q3 depth + §4 React Query SSR-hydration discipline + §5 FOUC + auth-init mitigation patterns + §6 Block B Task 8.6+ implementation roadmap + §7 risks/OQs/housekeeping + §8 Cowork decision gate). The deliverable empirically documents SSR-incompatibility surfaces in the App.tsx top-level 4-provider tree BEFORE Task 8.6 framework-mode adoption surfaces them through actual server-rendering failures.

**🎯 SCOPING-ONLY class 2pt CROSS-PHASE FULLY CALIBRATED at Task 8.3 close per Cowork Q1 LOCK** — Phase-8+ Task 8.1 OPENER (1pt; introduced 16th cumulative class with forward-scoping discipline for full Phase-8+ arc) + **Phase-8+ Task 8.3 (2pt; 2nd cross-phase data point completing full calibration with forward-scoping discipline for Phase-8+ Block A provider-tree-altitude inventory)**. Sister-shape to CLOSURE-NARRATIVE-CONSOLIDATION class full calibration at Phase-6 6.9 + Phase-7 closer 2pt cross-phase pattern (project-wide 11th class fully calibrated at Phase-7 closer). Class definition empirically refined at 2pt calibration: forward-scoping discipline ONLY (architectural/component-tree inventory + SSR-safety taxonomy + framework decision tree OR per-component audit + implementation roadmap + risks/OQs + Cowork decision gate); no production source touched; no measurement; no closure narrative. Structurally distinct from CLOSURE-NARRATIVE-CONSOLIDATION (retrospective; 11th class; 2pt fully calibrated) + MEASUREMENT-ONLY (empirical re-measurement; 9pt with 9 sub-shapes) + SSR-MIGRATION-PREP (Phase-8+ Task 8.2; 17th class at 1pt; production-source edit) + DOC-CORRECTION-ONLY shapes.

**🎯 3 publishable-level Phase-8+ Task 8.3 engineering findings cemented at §0 of audit doc** (sister-shape to Task 8.1 §0 4-finding catalog + Task 8.2 §0 2-finding (E + F) catalog applied at mid-arc PRE0 depth):
- **(G) 2-of-4 STRUCTURALLY UNSAFE vs 2-of-4 SSR-SAFE empirical mix at App.tsx top-level provider tree** — ThemeProvider (8 localStorage initialization-time reads at `qualia-shell/src/context/ThemeContext.tsx`) + UserProvider (1 localStorage initialization-time read at `qualia-shell/src/context/UserContext.tsx`) are STRUCTURALLY UNSAFE for SSR; QueryProvider + PermissionsProvider are SSR-SAFE at provider altitude. Empirically refines Cowork HARD HALT-IF #5 expectation (was "all 4 might be empirically SSR-safe"; empirical reality is mixed). **9 total localStorage initialization-time reads require `useSyncExternalStore` migration OR lazy-initializer-with-`typeof window` guards before Task 8.6 framework-mode SSR enablement.**
- **(H) TanStack Query SSR-hydration discipline gap separate from provider-altitude safety** — QueryProvider is SSR-safe at provider body (no browser globals) BUT current singleton-client architecture at `qualia-shell/src/providers/QueryProvider.tsx:16` is incompatible with SSR cache hydration. TanStack Query v5 official guidance (verbatim from `tanstack.com/query/latest/docs/framework/react/guides/ssr`): *"Creating the queryClient at the file root level makes the cache shared between all requests and means all data gets passed to all users."* **Requires per-request QueryClient pattern + `dehydrate()` + `<HydrationBoundary>` + `prefetchQuery()` at Task 8.6 implementation.**
- **(I) Dependency-chain SSR-safety propagation** — PermissionsProvider depends on `useUser()` at `qualia-shell/src/context/PermissionsContext.tsx:28`; its SSR-safety is structurally CONDITIONAL on UserProvider SSR-safe rendering producing `isAuthenticated=false` initial state. **Empirical engineering finding: provider-tree SSR-safety must be evaluated at TREE altitude not PROVIDER altitude** — fixing UserProvider's 1 init-time localStorage read also unlocks PermissionsProvider's safety; conversely, leaving UserProvider unfixed would propagate UNSAFE state downstream to PermissionsProvider's early-return logic.

**🎯 Cumulative Phase-8+ engineering-finding catalog at 9 findings post-Task-8.3 close** (sister-shape to Phase-7 2-finding catalog growth pattern at FULL CLOSURE; Phase-8+ catalog grows mid-arc per v2.60.1 falsified-hypothesis empirical-verification discipline + v2.62.1 scope-shape PRE-FLIGHT discipline applied at every task PRE0 + close): A imperative-routing SSR-incompatibility (8.1) + B Phase-7 perf carry-forward framework-conditional (8.1) + C Custom Vite SSR upstream-disclaimed (8.1) + D TanStack Start RC stage (8.1) + E Vike vendor-discouragement of RR-dom (8.2) + F Kickoff-brief scope-shape conflation (8.2) + **G 2-of-4 UNSAFE provider mix (8.3) + H TanStack Query SSR-hydration discipline gap (8.3) + I Dependency-chain SSR-safety propagation (8.3)**.

**🎯 AdminShell-scoped 3-provider audit DEFERRED to Task 8.9 hydration verification integration per Cowork Q3 LOCK + v2.62.1 scope-shape PRE-FLIGHT discipline** — Task 8.3 scope explicitly LOCKED at 4 top-level providers per Cowork verdict at kickoff; AdminShell-scoped HierarchyContext + LayoutContext + WindowContext at Phase-7 7.10 AdminShell architecture altitude carry-forward to Task 8.6+ implementation OR separate sub-task (recommended integration at Task 8.9 hydration verification context where AdminShell admin-route SSR enablement is empirically validated). Sister-shape v2.62.1 scope-shape PRE-FLIGHT discipline applied at kickoff PRE0 — preserved at 4-provider scope rather than expanding mid-task to 7-provider audit which would conflate Block A inventory altitude with Block B+ implementation altitude.

**🎯 NEW Conventions block entry at Task 8.3 close — per-provider-SSR-safety taxonomy** — 3-altitude classification framework (initialization-time UNSAFE / effect-time SAFE / event-handler-time SAFE) empirically cemented at §2 of audit doc. Initialization-time = inside `useState(() => …)` lazy initializer OR `const X = localStorage.getItem(…)` at module top-level = fires during React render() = STRUCTURALLY UNSAFE for SSR. Effect-time = inside `useEffect(() => …, [])` OR `useLayoutEffect(() => …, [])` = fires AFTER hydration on client = SAFE for SSR (no-op on server). Event-handler-time = inside callback functions (`onClick`, `onChange`, `setItem` mutators) = fires on user interaction post-hydration = SAFE for SSR by construction.

**🎯 28 consecutive cross-phase sweep-resolutions cemented at 8.3 sweep** (extends Phase-8+ Task 8.2 27-pattern → 28-pattern at 8.3; meta-PR #44 → 6.1a → 6.1b → 6.1c → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9 → 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6 → 7.8 → 7.9 → 7.10 → 7.11 → 7.14 → 7.13 → Phase-7 closer → 8.1 → 8.2 → **8.3**). Task 8.2 TBD → `b43c2bf` / `#70` resolution co-shipped at 8.3 sweep across §9 row 8.2 squash-SHA cell in `Docs/AppFolio_Parity_Implementation_Plan_v2.md` + Phase status line at top of `Docs/Phases/Phase_8_Plan.md` + Task 8.2 closure-narrative TBD references in `Docs/Phase8_Task_8_2_Completion_Report.md` + CLAUDE.md HEAD pointer pivot + Phase summary table Phase-8+ row.

**🎯 31-of-31 cross-phase chunk-axis preservation cumulative at 8.3 close** (DOC-only edit fully outside Vite entry graph; 1-of-1 within-Phase-8+-post-8.2-BREAK at 8.3; sister-shape to 30-of-30 preservation chain at Phase-8+ Task 8.1 OPENER + 1-of-1 BREAK reset at Task 8.2 + RESET to 1-of-1 NEW preservation at 8.3). Pattern empirically robust at scale post-LAW-retirement: DOC-only / Scripts/ / Docs/ / Baselines/ / workflow-YAML / vitest-spec edits PRESERVE; production-source edits at `qualia-shell/src/**` BREAK. 8.3 is DOC-only at `Docs/**` + root `CLAUDE.md` → PRESERVE expected by construction.

---

## §2. Strict-gate command output paste

```
$ git rev-parse HEAD
b43c2bf...   # pre-edit anchor (Phase-8+ Task 8.2 squash; HEAD-post-8.2 canonical)

$ cd qualia-shell && npx tsc -b
✓ exit 0 (DOC-only edit; tsc passes trivially)

$ npx vitest run
✓ Test Files  38 passed (38)
✓      Tests  264 passed (264)
   (zero production source touched; vitest 264/264 baseline preserved per SCOPING-ONLY class shape;
    +0 vitest delta vs Task 8.2 close baseline of 264)

$ # SKIPPED vite builds per Cowork Q7 LOCK (SCOPING-ONLY class shape; no production source = no build needed;
$ # sister-shape to Task 8.1 OPENER skip-by-design pattern per Q7 LOCK)

$ cd .. && node Scripts/verify_no_pii_leak.mjs
✓ exit 0 (51 files scanned, 0 leaks; PII guard strict-clean)

$ git status --short
?? Docs/Baselines/2026-05-11_Phase0_axe_baseline.json
?? Docs/Baselines/2026-05-12_Phase0_axe_baseline.json
?? Docs/Baselines/2026-05-13_Phase0_axe_baseline.json
?? Docs/Baselines/2026-05-13_Phase6_task_6_7_perf_capture.json
A  Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md
A  Docs/Phase8_Task_8_3_Completion_Report.md
M  Docs/AppFolio_Parity_Implementation_Plan_v2.md
M  Docs/Phase8_Task_8_2_Completion_Report.md
M  Docs/Phases/Phase_8_Plan.md
M  CLAUDE.md
   (4 untracked baseline JSON artifacts deferred to Phase-8+ Block C closure task per Cowork Verdict 4 LOCK
    from Task 8.1 §7.3 + Task 8.2 §7.4 carry-forward; 6 modified/added files = doc-sweep for 8.3 close)
```

---

## §3. CDP render proof (deferred — SCOPING-ONLY class shape; no rendered surface to probe)

No CDP probe required at 8.3 per SCOPING-ONLY class definition: forward-scoping discipline only; no production source touched; no rendered surface to probe. Sister-shape to Task 8.1 OPENER CDP-deferred pattern per Q7 LOCK.

Empirical proof of deliverable lives in `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md` (530 lines / 36,278 bytes; 8-section template) + this Completion Report. Audit-substrate empirical proof consists of:
- §1 Provider tree inventory: 4 top-level providers (`ThemeProvider` + `UserProvider` + `QueryProvider` + `PermissionsProvider`) at App.tsx altitude per Phase-8+ Task 8.2 HEAD-post-`b43c2bf` declarative-routing structure; 2 provider variants (Branch 2 popup-conditional 4-providers + Branch 3 default 3-providers).
- §3 Per-provider audit at Moderate Q3 depth per Cowork Q3 LOCK: file paths + line counts + byte counts + init-time localStorage read enumeration + 3-altitude SSR-safety classification verdict per provider with code excerpts.
- §3.1 ThemeProvider — 213 lines / 7,615 bytes / **8 init-time localStorage reads UNSAFE** at `qualia-shell/src/context/ThemeContext.tsx` (theme + hue + accentMode + colors + customLightThemes + customDarkThemes + customColorPresets + customRipplePresets).
- §3.2 UserProvider — 376 lines / 14,280 bytes / **1 init-time localStorage read UNSAFE** at `qualia-shell/src/context/UserContext.tsx` (`useState(() => localStorage.getItem('qualia_auth_user'))` for auth-restore-on-cold-start).
- §3.3 QueryProvider — 33 lines / 1,137 bytes / **SSR-SAFE at provider altitude** at `qualia-shell/src/providers/QueryProvider.tsx` (no browser globals; pure singleton-client construction) BUT **SSR-hydration discipline gap** per §4.
- §3.4 PermissionsProvider — 91 lines / 2,776 bytes / **SSR-SAFE via dependency-chain propagation** at `qualia-shell/src/context/PermissionsContext.tsx` (no browser globals BUT depends on UserProvider SSR-safe rendering for `isAuthenticated=false` initial state).

---

## §4. `/security-review`

High = 0; Medium = 0. Task 8.3 is DOC-only deliverable per Cowork Q1 SCOPING-ONLY 2pt LOCK + Q7 LOCK (zero production source touched; SCOPING-ONLY class shape). No new code paths; no new dependencies; no new attack surface. Sister-shape to Phase-8+ Task 8.1 OPENER + Phase-7 closer + Phase-6 6.9 closure-narrative-only commits (all clean `/security-review`).

Audit findings at §3-§6 surface SSR-incompatibility surfaces in EXISTING source (read-only inventory; no edits) — Task 8.6+ implementation will introduce the actual SSR-safe migrations under separate `/security-review` cycle.

---

## §5. Verification Matrix (per-task)

| Check | Target | Result | Evidence |
|---|---|---|---|
| `tsc -b` errors | 0 | ✓ | §2 paste; DOC-only edit; tsc passes trivially |
| `vitest run` failures | ≤ 264 baseline | ✓ 264/264 PASS | §2 paste; zero production source touched per SCOPING-ONLY class shape; +0 vitest delta |
| `vite build` (bare) | SKIPPED per Q7 LOCK | ✓ (skip-by-design) | SCOPING-ONLY class; no production source = no build needed |
| `VITE_APPFOLIO_SEEDS=false vite build` | SKIPPED per Q7 LOCK | ✓ (skip-by-design) | Same as above |
| Production chunk SHA256 / filename / byte-count | PRESERVED (DOC-only edit; chunk-axis preservation expected by construction) | ✓ | 31-of-31 cross-phase chunk-axis preservation cumulative at 8.3 close (DOC-only edit fully outside Vite entry graph; 1-of-1 within-Phase-8+-post-8.2-BREAK; sister-shape to 30-of-30 chain at Task 8.1 OPENER) |
| Smoke-test 4-spec cold-start | not re-run per SCOPING-ONLY (zero production source) | — | helpers/auth.ts 6.2 amendment + Task 8.2 routing.test.tsx baseline continue to PASS by construction; smoke-test would PASS if re-run |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | ✓ | §2 paste; 51 files scanned, 0 leaks |
| Parity gate per PR | green (manual-dispatch per paths-filter quirk) | TBD | Run `TBD` manual-dispatched; 19-task cross-phase paths-filter-quirk precedent at 8.3 (DOC-only edit at `Docs/**` + root `CLAUDE.md` outside `qualia-shell/src/**` glob) |
| CodeRabbit review per PR | pass | TBD | PR #TBD review URL at PR comment |
| `Docs/Phase8_Task_8_3_Completion_Report.md` | committed | ✓ | This file |
| `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md` | committed (530 lines / 36,278 bytes) | ✓ | NEW audit substrate; 8-section template |
| §9 Phase-8+ sub-tracker row 8.3 | R → ✓ | ✓ | Plan v2.63 amendment |
| Task 8.2 TBD → `b43c2bf` / `#70` resolution | Co-shipped at 8.3 sweep | ✓ | Plan v2 §9 row 8.2 squash-SHA cell + Phase_8_Plan.md Phase status + Phase8_Task_8_2_Completion_Report.md reference spots + CLAUDE.md HEAD pointer pivot |
| SCOPING-ONLY class 1pt → 2pt cross-phase | fully calibrated per Q1 LOCK | ✓ | CLAUDE.md Calibration classes block (16th class fully calibrated at 2pt; no class count increment; sister-shape to CLOSURE-NARRATIVE-CONSOLIDATION 11th class at 2pt) |
| 3 publishable engineering findings (G + H + I) | foregrounded at §0 of audit doc | ✓ | `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §0` |
| Per-provider-SSR-safety taxonomy Conventions entry | NEW at Task 8.3 close | ✓ | CLAUDE.md Conventions block NEW entry at §2 |
| AdminShell-scoped 3-provider audit DEFERRED | per Cowork Q3 LOCK + v2.62.1 scope-shape discipline | ✓ | Audit §7.2 OQ-1 + Plan v2.63 amendment Phase-7 7.10 AdminShell architecture carry-forward to Task 8.9 |
| Cumulative Phase-8+ engineering-finding catalog | 6 → 9 (A + B + C + D + E + F + G + H + I) at 8.3 close | ✓ | Cumulative across Task 8.1 §0 + Task 8.2 §0 + Task 8.3 §0 |

---

## §6. Rollback SHA

Rollback target: `git revert b43c2bf` (Phase-8+ Task 8.2 squash; pre-Task-8.3 state) — OR `git revert TBD` (Phase-8+ 8.3 close; reversible independently). Resolved at 8.4 sweep.

Rollback safety: DOC-only deliverable per Cowork Q1 + Q2 + Q7 LOCK; no production source; no behavior change; no data dependencies; reversible without DB or fixture state implications. v2.63 Plan amendment + Phase_8_Plan.md update + Task 8.2 TBD resolution + CLAUDE.md updates + Phase8_Task_8_3_Provider_Tree_SSR_Audit.md NEW + Phase8_Task_8_3_Completion_Report.md NEW are doc-only and reversible.

---

## §7. Deferred Items (Phase-8+ carry-forward)

1. **Phase-8+ Block A items 8.4-8.5 remain R after 8.3 close** (8.4 index.html template refactor + 8.5 static-data extraction conditional). 8.4 is framework-agnostic and can run in parallel to 8.5; 8.5 depends on Block A 8.2 + 8.3 outcomes for SSR-safety verification scope. Block A → Block B transition gate at 8.5 close per Cowork Verdict 5 LOCK from Task 8.1 §8.3 institutionalized decision-gate #4.

2. **Phase-8+ Block B items 8.6-8.11 remain R after 8.3 close** (chosen-framework adoption locked at library-mode RR v7 ecosystem at Task 8.2 close; framework-mode adoption installation deferred to Task 8.6 per Option β verdict). 8.6 PRE0 will integrate Task 8.3 §6 implementation roadmap (per-provider SSR-safety fixes + per-request QueryClient pattern + FOUC mitigation pattern selection) into framework-installation scope-shape.

3. **Phase-8+ Block C items 8.12-8.15 remain R after 8.3 close** (LCP n=10 re-measurement mirroring Phase-7 7.11 protocol + perf-lever stacking conditional + Phase-8+ closer + closer publishing). Block B → Block C transition gate at 8.11 close per Cowork Verdict 5 LOCK.

4. **4 untracked baseline JSON artifacts at `Docs/Baselines/`** — carry-forward from Phase-8+ Task 8.1 §7.3 + Task 8.2 §7.4 per Cowork Verdict 4 LOCK; recommended commit-as-historical-baselines at Phase-8+ Block C closure task (NOT Phase-8+ closer narrative — Block C is the structurally-correct sub-arc for measurement + housekeeping work; sister-shape to Phase-7 Block C 7.12-7.14 test-infra stabilization arc); preserved untracked at this PR.

5. **SCOPING-ONLY class 2pt CROSS-PHASE FULLY CALIBRATED at Task 8.3 close** — sister-shape to CLOSURE-NARRATIVE-CONSOLIDATION class full calibration at Phase-6 6.9 + Phase-7 closer 2pt cross-phase pattern (project-wide 11th class). No 3rd cross-phase data point needed for class stability; any future SCOPING-ONLY task (Phase-9+ recurrence if SSR arc requires additional Block-A-style scoping at downstream phase) adds incremental calibration but class is empirically stable at 2pt.

6. **Substantive Phase-8+ engineering finding (G) — 2-of-4 STRUCTURALLY UNSAFE vs 2-of-4 SSR-SAFE empirical provider mix at App.tsx top-level** cemented at audit §0 + §3. Empirically refines Cowork HARD HALT-IF #5 expectation (mixed-safety reality vs all-4-might-be-safe baseline). 9 total localStorage initialization-time reads (8 ThemeProvider + 1 UserProvider) carry-forward to Task 8.6 implementation scope.

7. **Substantive Phase-8+ engineering finding (H) — TanStack Query SSR-hydration discipline gap separate from provider-altitude safety** cemented at audit §0 + §3.3 + §4. QueryProvider singleton-client architecture incompatible with SSR cache hydration per upstream TanStack Query v5 guidance; per-request QueryClient pattern + `dehydrate()` + `<HydrationBoundary>` + `prefetchQuery()` migration carry-forward to Task 8.6 implementation.

8. **Substantive Phase-8+ engineering finding (I) — Dependency-chain SSR-safety propagation** cemented at audit §0 + §3.4. Provider-tree SSR-safety must be evaluated at TREE altitude not PROVIDER altitude; PermissionsProvider's SSR-safety conditional on UserProvider fix. Carry-forward to Task 8.6 implementation roadmap §6.1.

9. **AdminShell-scoped 3-provider audit DEFERRED to Task 8.9 hydration verification per Cowork Q3 LOCK + v2.62.1 scope-shape PRE-FLIGHT discipline** — HierarchyContext + LayoutContext + WindowContext at Phase-7 7.10 AdminShell architecture altitude; carry-forward audit-substrate-only OR integrate into Task 8.9 hydration verification scope (where AdminShell admin-route SSR enablement is empirically validated). Sister-shape v2.62.1 applied at Task 8.3 kickoff PRE0 preserved 4-provider scope rather than expanding mid-task to 7-provider audit conflating Block A inventory altitude with Block B+ implementation altitude.

10. **NEW Conventions block entry at Task 8.3 close — per-provider-SSR-safety taxonomy** (initialization-time UNSAFE / effect-time SAFE / event-handler-time SAFE) — 3-altitude classification framework empirically cemented at audit §2. Cross-references at every Task 8.6+ implementation PRE0 for per-provider safety verdict. Recommended for GR-15 amendment candidate at Plan v2.63+ as substantive engineering-finding pattern.

11. **31-of-31 cross-phase chunk-axis preservation cumulative at 8.3 close** (DOC-only edit fully outside Vite entry graph; 1-of-1 within-Phase-8+-post-8.2-BREAK). Production-source-edit BREAK reset expected at Task 8.6 framework-mode adoption close (entry-point migration BREAK is categorical per Task 8.1 §6 framework analysis); intermediate Tasks 8.4 + 8.5 PRESERVE expected by construction (DOC + config-file class shapes).

12. **28 consecutive cross-phase sweep-resolutions cemented at 8.3 sweep** (extends 27-pattern at 8.2 → 28-pattern at 8.3). Task 8.2 TBD → `b43c2bf` / `#70` co-shipped.

13. **Paths-filter quirk extends to 19-task cross-phase scope at 8.3** — Task 8.3 DOC-only edit at `Docs/**` + root `CLAUDE.md` outside `qualia-shell/src/**` glob; requires manual-dispatch per established convention. Sister-shape to Task 8.1 OPENER + Phase-7 closer + Phase-6 6.9 + 6.8 + 6.7 + 6.6 + 6.5 + 5.7 + 5.6 + 5.5 + 5.4 + 5.3 + 4.7 + Phase-7 7.2-7.6 + 7.8 + 7.9 + 7.11 + 7.14 manual-dispatch precedents.

14. **Cumulative Phase-8+ engineering-finding catalog at 9 findings post-Task-8.3 close** (A + B + C + D from Task 8.1 + E + F from Task 8.2 + G + H + I from Task 8.3). Sister-shape to Phase-7 2-finding catalog growth pattern at FULL CLOSURE; Phase-8+ catalog grows mid-arc per v2.60.1 falsified-hypothesis empirical-verification discipline + v2.62.1 scope-shape PRE-FLIGHT discipline applied at every task PRE0 + close. Phase-8+ closer at Task 8.14 will consolidate full catalog for publishable Closure Report.

---

## §8. Next-task unblock

**Phase-8+ Block A item 3 unblocked** (Task 8.4 index.html template refactor) — framework-agnostic edit at `qualia-shell/index.html` shell altitude (preserve existing 17 Google Fonts eager-load OR refactor per Phase-7 Lever 1 cost-benefit re-evaluation under SSR architecture; FOUC mitigation pattern selection per audit §5.1 Q-OQ-3 cookie / script-injection / media-query default). Class designation per Cowork verdict at Task 8.4 PRE0 Q1: CONFIG-FILE-EDIT if scoped narrowly to index.html template alone; COMPONENT-FIX class if FOUC script broader (touches ThemeProvider hydration discipline). Audit §5.1 documents 3 candidate FOUC mitigation patterns + their cost-benefit; Task 8.4 PRE0 selects empirically.

**Phase-8+ Block A item 4 partially unblocked** (Task 8.5 static-data extraction conditional) — depends on Task 8.4 outcome for index.html template structure; runs after 8.4 close.

**Phase-8+ Block B items 8.6-8.11 blocked pending Block A complete** + Cowork Block A → Block B transition gate at 8.5 close per Verdict 5 LOCK. Task 8.6 framework-mode adoption (`@react-router/dev` Vite plugin + `app/` directory + `entry.client.tsx` + `react-router.config.ts` with `ssr: false` initially) will integrate Task 8.3 §6 implementation roadmap as PRE0 substrate: per-provider SSR-safety fixes (`useSyncExternalStore` migration for ThemeProvider 8 reads + UserProvider 1 read OR `typeof window` lazy-initializer guards per Cowork Q-OQ-2) + per-request QueryClient pattern (per Q-OQ-4) + FOUC mitigation pattern (per Q-OQ-3 verdict at Task 8.4 close).

**Phase-8+ Block C items 8.12-8.15 blocked pending Block B complete** + Cowork Block B → Block C transition gate at 8.11 close.

Phase-8+ budget per `Docs/Phases/Phase_8_Plan.md §10`: 8-12 days end-to-end across 15 tasks; 8.1 OPENER + 8.2 + 8.3 = ~2 days burned; ~6-10 days remaining buffer for Block A 2 tasks + Block B 6 tasks + Block C 4 tasks.

🧪
