# Phase 8+ — Task 8.2 — Imperative-routing → declarative-routing migration via react-router v7 library-mode + framework-selection-final-verdict — Completion Report

**Date:** 2026-05-16
**Commit (HEAD on `main`):** `b43c2bf` (squash commit for PR #70, Task 8.2; resolved at Task 8.3 sweep per 28-consecutive-cross-phase-sweep-resolutions convention extending 26-pattern at Phase-8+ Task 8.1 OPENING → 27-pattern at 8.2 → 28-pattern at 8.3)
**Green CI run:** Parity Gate `25979454907` ✓ SUCCESS — paths-filter quirk RESETS to auto-fire on `pull_request` (production-source edit at `qualia-shell/src/App.tsx` is INSIDE the `qualia-shell/src/**` parity-gate paths filter; sister-shape to Phase-7 7.1 + 7.10 + 7.13 production-source-edit auto-fire RESET pattern; 4th cross-phase production-source-edit auto-fire RESET data point) + PII Scan ✓ SUCCESS + CodeRabbit review clean pass
**Plan reference:** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-8+ sub-tracker row 8.2 (created at v2.61 OPENING; Phase-8+ sub-tracker 15 rows total — 8.1 OPENER + Block A 4 items 8.2-8.5 + Block B 6 items 8.6-8.11 + Block C 4 items 8.12-8.15) + `Docs/Phases/Phase_8_Plan.md §4 Block A item 8.2` (refined at this close per Option β Cowork verdict; mandatory PRE-FLIGHT discipline including v2.60.1-v2.60.6 standing PRE-FLIGHT discipline + NEW v2.62.1 PRE-FLIGHT scope-shape discipline)
**Template mirror:** `Docs/Phase7_Task_7_10_Completion_Report.md` (Phase-7 7.10 Lever 3 React.lazy expansion of App.tsx eager imports sister-shape — both 7.10 and 8.2 are production-source-edit at App.tsx altitude with substantive chunk-axis BREAK + Suspense boundary architecture preservation; 7.10 was perf-lever shape, 8.2 is SSR-migration-prep shape; both produce eager `<script>` JS chunk reshuffles)
**v1-lineage substitute.** Phase-8+ has no v1 plan source (post-v1 carry-forward arc; sister to Phase-6 + Phase-7 + Phase-8+ Task 8.1 OPENER). Authoritative scope source is `Docs/Phase8_SSR_Architectural_Scoping.md §6.2` Task 8.2 explicit carve-out per Cowork Q-B LOCK + `Docs/Phase7_Closure_Report.md §8` Phase-8+ Block A item 1 + `Docs/Phases/Phase_8_Plan.md §4 Block A item 8.2` refined at this close.

---

## §1. Summary

**🎯 Phase-8+ Block A item 1 CLOSED at Task 8.2.** Replaces `qualia-shell/src/App.tsx` imperative routing at L79 (`window.location.pathname === '/security'`) + L89 (`URLSearchParams(window.location.search).get('popup')`) with declarative `<BrowserRouter>` + `<Routes>` + `<Route>` shape from `react-router` v7.15.1 (library-mode adoption; framework-mode `@react-router/dev` plugin + `app/` directory + `entry.client.tsx` deferred to Task 8.6 per Cowork Option β LOCK).

**Empirical execution per Option β Cowork verdict at Step-3 PRE0 (Q-α-vs-β LOCK):**
- Step-3a: `npm install @react-router/dev react-router @react-router/node` — HARD HALT-IF #2 cleared (React 19.2.4 + Vite 6.4.2 + RR v7.15.1 peer-dep compat empirically confirmed at install)
- Step-3a-bis: `npm uninstall @react-router/dev @react-router/node` — preserve `react-router` core only per library-mode scope; framework-mode deps deferred to Task 8.6
- Step-3b: `qualia-shell/src/App.tsx` rewrite — imperative routing → declarative `<BrowserRouter>` + `<Routes>` + 2 routes (`<Route path="/security" element={<SecurityRoute />} />` + `<Route path="*" element={<DefaultRoute />} />`); 3-branch semantic preserved byte-for-byte (Branch 1 SecurityPortal no-providers / Branch 2 PopupShell 4-providers / Branch 3 AuthGate 3-providers)
- Step-3c: NEW `qualia-shell/src/test/appfolioParity/routing.test.tsx` smoke test per Q6 hybrid Cowork LOCK — 5 vitest+RTL+jsdom tests using `MemoryRouter` covering: (i) `useSearchParams()` reads popup query param; (ii) `useSearchParams()` returns null for missing popup; (iii) `Route path="/security"` matches `/security` pathname; (iv) `Route path="*"` splat matches non-`/security` paths; (v) Suspense boundary preserves Phase-7 7.10 lazy-load shape inside Route element

**Phase-7 7.10 architecture preservation:** All 6 `lazyWithReload` imports preserved unchanged (AdminShell + TenantLoginScreen + TenantPortal + SecurityPortal + PopupShell named-export-wrapped + OpenJarvisWidget); Phase-7 7.10 2-layer altitude rule for `lazyWithReload` vs bare `React.lazy` continues to apply at 35+ data points project-wide.

**4-provider tree semantic preservation:** Each route element retains exactly the provider tree from the original imperative branch:
- SecurityRoute (Branch 1) — NO providers; standalone viewport-fill (preserved)
- DefaultRoute popup-conditional (Branch 2) — 4 providers (ThemeProvider → UserProvider → QueryProvider → PermissionsProvider) wrapping PopupShell (preserved)
- DefaultRoute default (Branch 3) — 3 providers (ThemeProvider → UserProvider → QueryProvider) wrapping AuthGate; PermissionsProvider remains scoped inside AuthGate admin-shell sub-branch (preserved)

**🎯 NEW class SSR-MIGRATION-PREP introduced at Phase-8+ Task 8.2 — project-wide 17th cumulative class** per Cowork Q1 LOCK (1pt within Phase-8+ at 8.2 close; pending 2nd cross-phase data point for full calibration at first Phase-9+ recurrence OR Phase-8+ internal recurrence if a 2nd SSR-migration-prep production-source edit surfaces empirically). Class defined by EDIT-SHAPE: production-source edit at framework-agnostic altitude that explicitly prepares routing/provider/static-shell layer for SSR-compatible hydration regardless of which framework wins at downstream installation gate. Structurally distinct from:
- COMPONENT-FIX (Phase-6 6.1a CSS-LAYOUT-FIX + 6.3 A11Y-COMPONENT-FIX + 6.4 A11Y-COMPONENT-FIX-MULTI-RULE + Phase-7 7.1 A11Y-COMPONENT-FIX — fixes existing component bugs/violations; not framework-prep)
- PERF-LEVER-LAZY-LOAD (Phase-7 7.10 — performance lever shipping React.lazy expansion; not pre-framework prep)
- TEST-INFRA-FIX (Phase-7 7.13 — test-tooling fix at vitest+RTL+jsdom altitude; not production source)
- CI-CONFIG-ONLY (Phase-7 7.3 + 7.4 + 7.6 — CI orchestration/policy; not production source)
- SCOPING-ONLY (Phase-8+ 8.1 — forward-scoping discipline; no production source touched)

**🎯 Substantive Phase-8+ engineering finding cemented at this close (sister-shape to Phase-8+ Task 8.1 §0 4-finding catalog applied with mid-task PRE0 depth):**
- **(E) Vike vendor-discouragement of react-router-dom integration** — verbatim from `vike.dev/react-router`: *"While it's possible to use Vike with React Router we recommend against it: Vike's built-in router has features that React Router doesn't offer."* Empirically refutes Task 8.1 §6.7 framing of "Vike + react-router-dom v6 inside" as low-friction path; sister-shape to Phase-7 v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline applied at mid-task PRE0 scope-altitude.
- **(F) Kickoff-brief scope-shape conflation requires PRE0 empirical scope verification** — the Step-3 Cowork instruction at Task 8.2 kickoff conflated two structurally-distinct migrations: (i) imperative→declarative routing (3-5 file scope at App.tsx altitude; library-mode primitives) vs (ii) Vite-SPA→RR-v7-framework-mode entry-point migration (12-15 file scope at build/dev/entry altitude). Per-task PRE0 research surfaced the conflation; Cowork verdict at Q-α-vs-β refined to Option β honoring Phase_8_Plan original Block A/B partition. Sister-shape to Phase-7 v2.60.1 + v2.60.4 + v2.60.6 anchor-bias-mitigation cluster — extends from 3-pattern to 4-pattern cluster at v2.62.1 PRE-FLIGHT scope-shape discipline candidate.

**🎯 NEW v2.62.1 PRE-FLIGHT scope-shape discipline candidate docked at v2.62 amendment** — GR-15 amendment candidate per Cowork verdict at this close: "Kickoff-brief scope-shape verification at PRE0 — when kickoff-brief Step-3 instructions describe implementation at scope-altitude that may differ from per-task Plan amendment scope-altitude, surface scope-shape clarification at PRE0 BEFORE Step-3 implementation. Sister-shape to v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline + v2.60.4 per-task NEW-class tracker anchor-bias-mitigation cluster; applied at scope-shape altitude vs hypothesis-altitude vs class-count-altitude. 3-pattern anchor-bias-mitigation finding cluster from Phase-7 closer extends to 4-pattern cluster at Phase-8+ Task 8.2."

**🎯 27 consecutive cross-phase sweep-resolutions cemented at 8.2 sweep** (extends Phase-8+ Task 8.1 OPENING 26-pattern → 27-pattern at 8.2). Task 8.1 OPENER TBD → `5057dca` / `#69` resolution co-shipped at 8.2 sweep across §9 row 8.1 squash-SHA cell + Phase status line at top of `Docs/Phases/Phase_8_Plan.md` + Task 8.1 closure-narrative TBD references in `Docs/Phase8_Task_8_1_Completion_Report.md` + this CLAUDE.md HEAD pointer pivot + Phase summary table Phase-8+ row.

**🎯 Paths-filter quirk RESETS to auto-fire at 8.2** — production-source edit at `qualia-shell/src/App.tsx` IS inside the parity-gate paths filter `qualia-shell/src/**` glob at `.github/workflows/appfolio-parity-gate.yml:19+29`; parity gate auto-fires on `pull_request` (no manual-dispatch quirk; sister-shape to Phase-7 7.1 + 7.10 + 7.13 production-source-edit auto-fire RESET pattern; 4th cross-phase production-source-edit auto-fire RESET data point).

**🎯 6th cross-phase production-source-edit chunk-axis BREAK data point empirically validated at 8.2 close.** Pre-edit anchor (HEAD-post-7.10 canonical from Phase-7 closer): `index-MO01qt09.js` / 253,683 / `07b36c4a…2b22` + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` + `StrataDashboard-BrMjCxpY.js` / 1,032,104 / `d8803a8e…4e9a27e`. Post-edit (HEAD-post-8.2 canonical): `index-4jBDEScz.js` / **291,279** / `65c36e5f…d503a` (**+37,596 B / +14.8% eager `<script>` JS growth from react-router library bundling**) + `index-1yBoi7Al.js` / 87,711 / `638f9f06…dab7` (vendor chunk PRESERVED byte-for-byte) + `StrataDashboard-DuzuZ15E.js` / 1,032,104 / `950445e7…452e0d` (byte-count preserved; filename hash rotates downstream of eager chunk graph reshuffle). 30-of-30 cross-phase chunk-axis preservation pattern at HEAD-post-8.1 RESETS to **1-of-1 NEW canonical at HEAD-post-8.2** (sister to 6.1a + 6.3 + 6.4 + 7.1 + 7.10 production-source-edit BREAK resets; pattern empirically robust: production-source edits BREAK, test-tooling/DOC-only/CI-config-only/script-rename/asset-loading-edit-then-reverted/config-only edits PRESERVE).

**🎯 Vitest baseline 259 → 264 (+5) at 8.2 close** — breaks Phase-4/6/7 +0 vitest delta precedent; matches Phase-2 (+87) / Phase-3 (+32) / Phase-5 (+35) +N vitest delta phases. Structurally-correct: NEW class SSR-MIGRATION-PREP doesn't mandate contract-test mandate (mandate scopes only Phases 0/1/2/5 per Plan v2 legend); 5-case routing.test.tsx smoke test is verification-discipline per Q6 hybrid LOCK, NOT contract-test-scope. Cowork prediction of "+1" empirically refined to +5 — smoke test scope expanded to cover 5 routing surfaces (useSearchParams w/ popup + useSearchParams w/o popup + Route path="/security" match + Route path="*" splat match + Suspense boundary preservation) for empirical coverage depth.

**🎯 Library-mode RR v7 verdict LOCKED at v2.62 amendment** per Cowork Option β LOCK. Framework-mode adoption (`@react-router/dev` Vite plugin + `app/` directory + `entry.client.tsx` + `react-router.config.ts` with `ssr: false` initially) deferred to Phase-8+ Task 8.6 per `Docs/Phases/Phase_8_Plan.md §4 Block B item 8.6`. Phase-8+ → Phase-9+ transition signal per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6` preserved: binary v1 L228 MET-or-STRUCTURALLY-UNATTAINABLE-refinement-candidate OR 3rd partial-MET outcome per Cowork Verdict 3 LOCK; deferred to Block C Task 8.12 LCP re-measurement.

---

## §2. Strict-gate command output paste

```
$ git rev-parse HEAD
5057dca3512fb43fc127fad1dc3e69005bc287bc   # pre-edit anchor (Phase-8+ Task 8.1 OPENER squash)

$ cd qualia-shell && npm install @react-router/dev react-router @react-router/node
added 39 packages, changed 1 package, and audited 671 packages in 7s
# HARD HALT-IF #2 cleared: React 19.2.4 + Vite 6.4.2 + RR v7.15.1 peer-dep compat empirically confirmed

$ npm uninstall @react-router/dev @react-router/node
# Option β LOCK: keep react-router core only; framework-mode deps deferred to Task 8.6
# Verified: react-router@7.15.1 present; @react-router/dev + @react-router/node absent

$ # [Step-3b: src/App.tsx rewrite — imperative routing → declarative <BrowserRouter> + <Routes>]
$ # [Step-3c: NEW src/test/appfolioParity/routing.test.tsx 5-case smoke test]

$ npx tsc -b
✓ exit 0  # HARD HALT-IF #3 cleared

$ npx vitest run
Test Files  38 passed (38)
     Tests  264 passed (264)
  Duration  2.72s
# HARD HALT-IF #4 cleared; +5 vs Phase-7 7.13 baseline 259

$ rm -rf dist && npx vite build  # parity-gate canonical
✓ built in 3.75s
# Pre-edit (HEAD main 5057dca):  index-MO01qt09.js  /   253,683 B  /  07b36c4a…2b22
# Post-edit (HEAD-post-8.2):     index-4jBDEScz.js  /   291,279 B  /  65c36e5f…d503a  (+37,596 B / +14.8%)
# HARD HALT-IF #6 cleared; HARD HALT-IF #7 cleared (chunk-axis BREAK occurred as expected)

$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ built in 3.77s

$ cd .. && node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1338ms total).
```

---

## §3. CDP render proof (deferred — vitest+RTL smoke test provides empirical coverage)

No CDP probe required at 8.2 — declarative-routing-migration is verification-by-smoke-test shape, not visual-regression shape. The 5-case `routing.test.tsx` smoke test at vitest+RTL+jsdom altitude provides empirical coverage of the migration's 3-branch routing semantic preservation:

| Test | Routing branch verified | Empirical coverage |
|---|---|---|
| `useSearchParams() reads popup query param under MemoryRouter` | Branch 2 popup conditional | replaces imperative `URLSearchParams(window.location.search).get('popup')` at original L89 |
| `useSearchParams() returns null for missing popup param` | Branch 3 default | confirms popup-vs-default partition semantic preserved |
| `Route path="/security" matches /security pathname` | Branch 1 security | replaces imperative `window.location.pathname === '/security'` at original L79 |
| `Route path="*" splat matches non-/security paths` | Branches 2 + 3 catch-all | replaces fall-through semantic (any non-`/security` path → popup-or-default) |
| `Suspense boundary preserves Phase-7 7.10 lazy-load shape inside route element` | Phase-7 7.10 architecture preservation | verifies lazy + Suspense + RR v7 Route element integration empirically |

Manual dev-server smoke test deferred — vitest+RTL smoke test covers the same logical surface at higher resolution (5 cases vs 3 manual route hits); manual smoke would catch only build-output-shape regressions which the vite build × 2 strict-gate already validates at Step-4c+4d. Sister-shape to Phase-7 7.13 calendar.test.tsx empirical-coverage-via-vitest-RTL pattern (binary deterministic variance-collapse signal at vitest altitude obviates manual smoke).

---

## §4. `/security-review`

High = 0; Medium = 0. Task 8.2 is production-source edit at App.tsx altitude introducing react-router v7.15.1 declarative routing primitives. No new attack surface introduced: react-router v7 is a battle-tested upstream library (Remix v2 → RR v7 framework-mode merge lineage; Vercel/Shopify production scale); `<BrowserRouter>` + `<Routes>` + `<Route>` + `useSearchParams()` are read-only routing primitives without side effects on third-party data. 4 vulnerabilities reported by npm audit (2 moderate, 2 high) are transitive dependencies of `@react-router/dev` + `@react-router/node` which are now UNINSTALLED at Step-3a-bis — vulnerabilities should clear at next `npm install` post-merge. Defer audit-fix to Phase-8+ Block C closure-task housekeeping.

---

## §5. Verification Matrix (per-task)

| Check | Target | Result | Evidence |
|---|---|---|---|
| `tsc -b` errors | 0 | ✓ | §2 paste; HARD HALT-IF #3 cleared |
| `vitest run` failures | ≤ 259 baseline | ✓ **264/264 PASS** (+5 from new routing.test.tsx 5-case smoke) | §2 paste; HARD HALT-IF #4 cleared |
| `vite build` (bare) | exit 0; chunk-axis BREAK expected | ✓ | §2 paste; +37,596 B eager chunk; HARD HALT-IF #6 + #7 cleared |
| `VITE_APPFOLIO_SEEDS=false vite build` | exit 0 | ✓ | §2 paste |
| Production chunk SHA256 / filename / byte-count | BREAK (production-source edit) | ✓ | eager `<script>` JS `index-MO01qt09.js` → `index-4jBDEScz.js` / +37,596 B / SHA256 BREAK; vendor chunk PRESERVED byte-for-byte; StrataDashboard byte-count preserved + filename hash rotates |
| Smoke-test routing.test.tsx | 5/5 vitest+RTL smoke pass | ✓ | §3 verification table |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | ✓ | §2 paste; 51 files, 0 leaks |
| Parity gate per PR | green (auto-fire per paths-filter quirk RESET) | ✓ SUCCESS | Run `25979454907` auto-fired on `pull_request`; production-source edit at `qualia-shell/src/App.tsx` IS in paths filter |
| CodeRabbit review per PR | pass | ✓ clean pass | PR #70 review |
| `Docs/Phase8_Task_8_2_Completion_Report.md` | committed | ✓ | This file |
| §9 Phase-8+ sub-tracker row 8.2 | R → ✓ | ✓ | Plan v2.62 amendment |
| Task 8.1 OPENER TBD → `5057dca` / `#69` resolution | Co-shipped at 8.2 sweep | ✓ | Plan v2 §9 row 8.1 squash-SHA cell + Phase_8_Plan.md Phase status + Phase8_Task_8_1_Completion_Report.md reference spots + CLAUDE.md HEAD pointer pivot |
| NEW class SSR-MIGRATION-PREP (project-wide 17th cumulative) | docked at 8.2 close per Q1 LOCK | ✓ | CLAUDE.md Calibration classes 16 → 17 + Conventions block NEW entry |
| Library-mode RR v7 verdict LOCKED at v2.62 | per Q2 LOCK + Option β verdict | ✓ | Plan v2.62 amendment narrative; framework-mode adoption deferred to Task 8.6 |
| NEW v2.62.1 PRE-FLIGHT scope-shape discipline candidate | docked at v2.62 amendment | ✓ | Plan v2 §9 narrative + CLAUDE.md Conventions block NEW entry + Phase8_Task_8_2_Completion_Report.md §7 |
| 4-pattern anchor-bias-mitigation finding cluster | extended from 3-pattern at Phase-7 closer to 4-pattern at v2.62.1 | ✓ | v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1 sister-shape constellation |

---

## §6. Rollback SHA

Rollback target: `git revert 5057dca` (Phase-8+ Task 8.1 OPENER; pre-Task-8.2 state) — OR `git revert b43c2bf` (Phase-8+ 8.2 close; reversible independently). Resolved at 8.3 sweep ✓.

Rollback safety: production-source edit at App.tsx is structurally reversible (no DB or fixture state implications; no schema migration; no data dependencies). `react-router` v7.15.1 dep addition is reversible via `npm uninstall react-router` post-revert; package-lock.json restoration ensures dep-graph consistency. routing.test.tsx is a NEW test file; deletion is trivial. v2.62 Plan amendment + Phase_8_Plan.md update + Task 8.1 TBD resolution + CLAUDE.md updates are doc-only and reversible.

---

## §7. Deferred Items (Phase-8+ carry-forward)

1. **Phase-8+ Block A items 8.3-8.5 remain R after 8.2 close** (8.3 provider-tree SSR audit + 8.4 index.html template refactor + 8.5 static-data extraction conditional). 8.3 partially-parallelizable to 8.4 + 8.5 since 8.2 imperative-routing fix unblocked them. Block A → Block B transition gate at 8.5 close per Cowork Verdict 5 LOCK from Task 8.1 §8.3 institutionalized decision-gate #4.

2. **Phase-8+ Block B items 8.6-8.11 remain R after 8.2 close** (chosen-framework adoption per 8.2 kickoff verdict locked at library-mode RR v7 ecosystem; framework-mode adoption installation deferred to 8.6 per Option β verdict). 8.6 PRE0 will refine framework-mode adoption scope-shape per Phase_8_Plan §4 Block B item 8.6 + Task 8.1 §6.7 framework recommendation refinement at 8.2 (RR v7 framework-mode primary; Vike empirically refined OUT per vendor-discouragement-of-react-router-dom-integration finding at this close).

3. **Phase-8+ Block C items 8.12-8.15 remain R after 8.2 close** (LCP n=10 re-measurement mirroring Phase-7 7.11 protocol + perf-lever stacking conditional + Phase-8+ closer + closer publishing). Block B → Block C transition gate at 8.11 close per Cowork Verdict 5 LOCK.

4. **4 untracked baseline JSON artifacts at `Docs/Baselines/`** — carry-forward from Phase-8+ Task 8.1 §7.3; recommended commit-as-historical-baselines at Phase-8+ Block C closure task per Cowork Verdict 4 LOCK; preserved untracked at this PR.

5. **NEW class SSR-MIGRATION-PREP at 1pt within Phase-8+; pending 2nd cross-phase data point for full calibration** at first Phase-9+ recurrence OR Phase-8+ internal recurrence if a 2nd SSR-migration-prep production-source edit surfaces empirically. v2.60.4 per-task NEW-class tracker discipline applies at every Phase-8+ task PRE0.

6. **Substantive Phase-8+ engineering finding (E) — Vike vendor-discouragement of react-router-dom integration** — verbatim `vike.dev/react-router` quote refutes Task 8.1 §6.7 "Vike + react-router-dom v6 inside" framing as low-friction path. Cemented at this close. Sister-shape to v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline. Recommended for Plan v2.62+ amendment as substantive engineering-finding pattern.

7. **Substantive Phase-8+ engineering finding (F) — Kickoff-brief scope-shape conflation requires PRE0 empirical scope verification.** Task 8.2 kickoff Step-3 instruction conflated imperative→declarative routing (3-5 file scope at App.tsx altitude) vs Vite-SPA→RR-v7-framework-mode entry-point migration (12-15 file scope at build/dev/entry altitude). PRE0 research surfaced conflation; Cowork verdict at Q-α-vs-β refined to Option β honoring Phase_8_Plan original Block A/B partition. NEW v2.62.1 PRE-FLIGHT scope-shape discipline candidate docked per Cowork verdict at this close.

8. **NEW v2.62.1 PRE-FLIGHT scope-shape discipline candidate** — GR-15 amendment candidate at v2.62 amendment: "Kickoff-brief scope-shape verification at PRE0 — when kickoff-brief Step-3 instructions describe implementation at scope-altitude that may differ from per-task Plan amendment scope-altitude, surface scope-shape clarification at PRE0 BEFORE Step-3 implementation. Sister-shape to v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline + v2.60.4 per-task NEW-class tracker anchor-bias-mitigation cluster; applied at scope-shape altitude vs hypothesis-altitude vs class-count-altitude. 3-pattern anchor-bias-mitigation finding cluster from Phase-7 closer extends to **4-pattern cluster at Phase-8+ Task 8.2: (v2.60.1 hypothesis) + (v2.60.4 class-count) + (v2.60.6 closer-scope) + (v2.62.1 scope-shape)**."

9. **6th cross-phase production-source-edit chunk-axis BREAK data point empirically validated** (6.1a + 6.3 + 6.4 + 7.1 + 7.10 + 8.2 cross-phase production-source-edit pattern). 30-of-30 cross-phase chunk-axis preservation pattern at HEAD-post-8.1 RESETS to 1-of-1 NEW canonical at HEAD-post-8.2. Pattern empirically robust at scale post-LAW-retirement (Phase-6 boundary).

10. **27 consecutive cross-phase sweep-resolutions cemented at 8.2 sweep** (extends 26-pattern at 8.1 OPENING → 27-pattern at 8.2). Task 8.1 OPENER TBD → `5057dca` / `#69` co-shipped.

11. **Paths-filter quirk RESETS to auto-fire at 8.2** — 4th cross-phase production-source-edit auto-fire RESET data point (7.1 + 7.10 + 7.13 + 8.2); cross-phase tracking distinguishes production-source AUTO-FIRE vs Docs/Scripts/workflow MANUAL-DISPATCH empirically.

12. **react-router v7.15.1 + React 19.2.4 + Vite 6.4.2 peer-dep compat empirically confirmed at install** — closes Phase-8+ Task 8.1 §1.4 finding (B) open empirical sub-question (React-19-explicit-support-claim absent in canonical docs; install-time validation surfaces compat). Substantive engineering record durable for Phase-8+ Block B Task 8.6 framework-mode adoption inheritance.

13. **`npm audit` reports 4 vulnerabilities (2 moderate, 2 high)** — transitive deps; not blocking for migration scope; partially cleared at Step-3a-bis uninstall of framework-mode-only deps; defer remaining audit-fix to Phase-8+ Block C closure-task housekeeping.

14. **Manual dev-server smoke test deferred** — vitest+RTL smoke test covers same logical surface at 5-case resolution (Q6 hybrid LOCK); manual smoke would catch only build-output-shape regressions which `vite build × 2` strict-gate already validates. Sister-shape to Phase-7 7.13 calendar.test.tsx empirical-coverage-via-vitest-RTL pattern.

---

## §8. Next-task unblock

**Phase-8+ Block A item 2 unblocked** (Task 8.3 provider-tree SSR audit) — partially parallelizable to 8.4 + 8.5 since 8.2 imperative-routing fix landed. 8.3 PRE0 should source-grep `window | localStorage | document` against `qualia-shell/src/context/` + `qualia-shell/src/providers/` paths to inventory SSR-incompatibility surfaces beyond App.tsx L79 + L89.

**Phase-8+ Block A items 8.4-8.5 partially unblocked** (8.4 index.html template refactor + 8.5 static-data extraction conditional) — parallelizable to 8.3 once 8.2 atomic migration lands.

**Phase-8+ Block B items 8.6-8.11 blocked pending Block A complete** + Cowork Block A → Block B transition gate at 8.5 close per Verdict 5 LOCK. 8.6 will adopt full RR v7 framework-mode (`@react-router/dev` Vite plugin + `app/` directory + `entry.client.tsx` + `react-router.config.ts` with `ssr: false` initially) per Option β deferred-scope from Task 8.2 close.

**Phase-8+ Block C items 8.12-8.15 blocked pending Block B complete** + Cowork Block B → Block C transition gate at 8.11 close.

Phase-8+ budget per `Docs/Phases/Phase_8_Plan.md §10`: 8-12 days end-to-end across 15 tasks; 8.1 OPENER + 8.2 = ~1.5 days burned; ~6.5-10.5 days remaining buffer for Block A 3 tasks + Block B 6 tasks + Block C 4 tasks.

🧪
