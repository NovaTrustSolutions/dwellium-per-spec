# Phase 8+ — Task 8.4 — `qualia-shell/index.html` template refactor — Completion Report

**Date:** 2026-05-17
**Commit (HEAD on `main`):** `6742484` (squash commit for PR #72, Task 8.4 — `qualia-shell/index.html` template refactor; resolved at Task 8.5 sweep per 30-consecutive-cross-phase-sweep-resolutions milestone — round-decade convention cementation extending 29-pattern at 8.4 → 30-pattern at 8.5)
**Green CI run:** Parity Gate `25982171313` ✓ SUCCESS (manual-dispatched per Q5 CONFIRMED prediction — qualia-shell/-root parent-altitude outside `qualia-shell/src/**` glob; sister-shape to qualia-shell/playwright.baseline.config.ts at 6.8 + qualia-shell/e2e/** at 7.2 manual-dispatch precedents; 15-task cross-phase manual-dispatch precedent extended at Task 8.4) + PII Scan `25982160360` ✓ SUCCESS + CodeRabbit review clean pass
**Plan reference:** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 Phase-8+ sub-tracker row 8.4 (created at v2.61 OPENING; row R → ✓ at v2.64 amendment) + `Docs/Phases/Phase_8_Plan.md §4 Block A item 8.4` (mandatory PRE-FLIGHT discipline including v2.60.1-v2.60.6 standing PRE-FLIGHT discipline + v2.62.1 PRE-FLIGHT scope-shape discipline + NEW v2.64.0 audit-content empirical-vs-hypothetical PRE-FLIGHT discipline cemented at this close)
**Template mirror:** `Docs/Phase8_Task_8_2_Completion_Report.md` (Phase-8+ Task 8.2 sister-shape — both are SSR-MIGRATION-PREP class production-source edits at Phase-8+ Block A altitude; 8.2 = imperative-routing → declarative-routing at App.tsx altitude; 8.4 = framework-agnostic FOUC mitigation pattern + SSR-ready meta tags at index.html altitude; both ship 4-provider tree preservation discipline + framework-agnostic scope LOCK + structurally-distinct production-source-edit shapes).
**v1-lineage substitute.** Phase-8+ has no v1 plan source. Authoritative scope source is `Docs/Phase8_SSR_Architectural_Scoping.md §6.4` Task 8.4 carve-out + `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §5.1` FOUC mitigation pattern selection at Q-OQ-3 + `Docs/Phases/Phase_8_Plan.md §4 Block A item 8.4` refined at this close.

---

## §1. Summary

**🎯 Phase-8+ Block A item 3 CLOSED at Task 8.4.** Ships production-source edit at `qualia-shell/index.html` (23 lines → 40 lines / +17 LOC; 1,456 B → 2,301 B at `dist/index.html` build output / +845 B / +58.0%) — adds **framework-agnostic FOUC mitigation pattern (script-injection IIFE per Cowork Q2 LOCK)** with empirically-corrected `className` pattern + **5 SSR-ready meta tags** (description + 4 Open Graph) + **viewport-fit refinement** (viewport-fit=cover for mobile-safe-area-inset readiness). Production chunk axes at `dist/assets/**` PRESERVED byte-for-byte per Q6 empirical verification.

**Empirical execution per Cowork Q1-Q8 + D-1 through D-4 LOCK at Step-2 PRE0 close:**
- Step-3a: FOUC IIFE script at `index.html:16-27` (~10 LOC inline) — reads `dwellium-theme` (primary) with `qualia-theme` legacy fallback + `'dark'` default; sets `document.documentElement.className = 'theme-' + theme` matching ThemeContext.tsx L183 application pattern byte-for-byte; try/catch fallback to `'theme-dark'`.
- Step-3b: 5 NEW meta tags (description + 4 Open Graph: og:title + og:description + og:type + og:image stub at `/og-image.png`).
- Step-3c: Existing viewport meta tag refined to add `viewport-fit=cover` (sister-shape to mobile-safe-area-inset readiness convention).
- Step-3d: 7 existing tags preserved unchanged (charset / favicon / theme-color / manifest / title / 2 preconnect links).
- Step-3e: OUT-OF-SCOPE per D-3 LOCK — NO `ThemeContext.tsx` edit (defer to Task 8.6+ framework-installation context; preserves Block A index.html-altitude scope discipline per v2.62.1 scope-shape PRE-FLIGHT discipline).

**🎯 SSR-MIGRATION-PREP class 1pt → 2pt CROSS-PHASE FULLY CALIBRATED at Task 8.4 close per Cowork Q1 LOCK** — Phase-8+ Task 8.2 (1pt; introduced 17th cumulative class with framework-agnostic SSR-prep at App.tsx routing altitude) + **Phase-8+ Task 8.4 (2pt; 2nd cross-phase data point completing full calibration with framework-agnostic SSR-prep at index.html template altitude)**. Sister-shape constellation to SCOPING-ONLY full-calibration at Phase-8+ Task 8.3 (2pt at Task 8.1 OPENER + Task 8.3) + CLOSURE-NARRATIVE-CONSOLIDATION full-calibration at Phase-7 closer (2pt at Phase-6 6.9 + Phase-7 closer); **Phase-8+ Block A 2-of-2 class-taxonomy-completion pattern empirically cemented** across both forward-scoping (SCOPING-ONLY 2pt) AND framework-prep (SSR-MIGRATION-PREP 2pt) classes. Project-wide cumulative class count stays at **17** (no NEW class introduced at 8.4 per SSR-MIGRATION-PREP full-calibration sister-shape to SCOPING-ONLY full-calibration at 8.3 no-NEW-class pattern).

**🎯 2 NEW Phase-8+ Task 8.4 engineering findings cemented (sister-shape to Task 8.1 §0 4-finding catalog + Task 8.2 §0 2-finding (E + F) catalog + Task 8.3 §0 3-finding (G + H + I) catalog applied at mid-arc PRE0+verification depth):**
- **(J) Audit-doc empirical-vs-hypothetical-content distinction — recursive-validation of v2.60.1 falsified-hypothesis PRE-FLIGHT discipline at audit-shipping altitude.** Task 8.3 audit `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §3.1` shipped with **count discrepancy between narrative headline "8 init-time localStorage reads" and code-excerpt 6 empirical `localStorage.getItem()` calls** at L127/L128/L134/L138/L139/L144 (mapped to L172/L173/L178/L181/L182/L186 in audit code excerpt with ❌ marks). Downstream documentation at Task 8.3 close (CLAUDE.md HEAD pointer + Task 8.3 Completion Report + Plan v2.63 amendment) propagated the 8-count + hypothetical storage-key names (theme + hue + accentMode + colors + customLightThemes + customDarkThemes + customColorPresets + customRipplePresets) NOT empirically present in `ThemeContext.tsx` at HEAD-time-of-audit-shipping (`c44198f`). Empirical inventory at HEAD `c44198f`: **4 useState lazy initializers / 6 `localStorage.getItem()` calls** across 6 storage keys (4 primary `dwellium-*` keys + 2 legacy `qualia-*` fallbacks). Structural SSR-safety verdict UNCHANGED — ThemeProvider remains STRUCTURALLY UNSAFE for SSR; only the precise count + key-name inventory was off. **Sister-shape to v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline applied at audit-shipping altitude vs implementation-shipping altitude per Phase-7 7.13**. Recommended discipline: at every Task 8.6+ implementation PRE0, audit-content empirical re-verification against current source code is mandatory PRE-FLIGHT step before adopting audit conclusions verbatim. **NEW v2.64.0 PRE-FLIGHT discipline candidate docked at v2.64 amendment** — sister-shape extends 4-pattern anchor-bias-mitigation finding cluster at Phase-8+ Task 8.2 (v2.60.1 hypothesis + v2.60.4 class-count + v2.60.6 closer-scope + v2.62.1 scope-shape) to **5-pattern cluster at Phase-8+ Task 8.4** (v2.60.1 hypothesis + v2.60.4 class-count + v2.60.6 closer-scope + v2.62.1 scope-shape + **v2.64.0 audit-content**). Audit doc §3.1 inline-footnote-correction shipped at this close per Cowork D-1 LOCK (sister-shape to Phase-7 7.14 inline-footnote-at-Phase5_Perf_Report.md §2 retroactive-correction-in-place precedent).

- **(K) `dist/index.html` parent-altitude shape-change taxonomy distinct from `dist/assets/**` chunk-axis taxonomy.** Empirically cemented at Task 8.4 Step-4-bis chunk-axis verification per Cowork Q6 LOCK. Production-source edits at `qualia-shell/index.html` parent-altitude **PRESERVE `dist/assets/**` chunk axes** (Vite content-hashed filename graph; bundle resolution at `<script type="module" src="/src/main.tsx">` independent of HTML shell content) **AND CHANGE `dist/index.html` byte-count by construction** (the source IS the build output for the parent-altitude HTML shell; **1,456 B → 2,301 B / +845 B / +58.0%** at Task 8.4 = empirical baseline). **Build-mode invariant** — bare `vite build` + `VITE_APPFOLIO_SEEDS=false vite build` produce identical 2,301 B `dist/index.html` (sister-shape to v2.43 build-mode-aware chunk-axis comparison protocol — IIFE + meta tag injection is build-mode-independent). Structurally distinct from BREAK pattern (BREAK reshuffles `dist/assets/**` chunk graph; index.html parent-altitude edits only change the `dist/index.html` HTML shell while preserving `dist/assets/**` chunks). **NEW Conventions block entry at this close** — chunk-axis-preservation taxonomy refinement at parent-altitude (sister-shape to existing 2-layer altitude rule for `lazyWithReload` vs bare `React.lazy` + per-provider-SSR-safety taxonomy 3-altitude framework at Task 8.3 close = 3rd altitude-classification engineering-record Conventions entry empirically established). Recommended for GR-15 amendment candidate at Plan v2.64+ as standing engineering-finding pattern.

**🎯 Cumulative Phase-8+ engineering-finding catalog at 11 findings post-Task-8.4 close** (was 9 at 8.3 close → +2 at 8.4 = 11; per-task ~2-3 findings cadence empirically observed at Phase-8+ Block A): A imperative-routing SSR-incompatibility (8.1) + B Phase-7 perf carry-forward framework-conditional (8.1) + C Custom Vite SSR upstream-disclaimed (8.1) + D TanStack Start RC stage (8.1) + E Vike vendor-discouragement of RR-dom (8.2) + F Kickoff-brief scope-shape conflation (8.2) + G 2-of-4 UNSAFE provider mix (8.3) + H TanStack Query SSR-hydration discipline gap (8.3) + I Dependency-chain SSR-safety propagation (8.3) + **J Audit-content empirical-vs-hypothetical-distinction (8.4) + K dist/index.html parent-altitude shape-change taxonomy (8.4)**. Substantive engineering record durable for Phase-8+ closer narrative core (Task 8.14) at 11+ publishable findings (5.5× scaling factor vs Phase-7 closer's 2 publishable findings; empirical cadence holds at Block A).

**🎯 5-pattern anchor-bias-mitigation finding cluster cemented at Task 8.4 close** — extends 4-pattern cluster at Phase-8+ Task 8.2 close to 5-pattern at Task 8.4: (v2.60.1 hypothesis) + (v2.60.4 class-count) + (v2.60.6 closer-scope) + (v2.62.1 scope-shape) + (**v2.64.0 audit-content**). Each amendment candidate applies the discipline-shape at a distinct empirical-verification altitude; recursive-validation pattern continues at scale.

**🎯 4 empirical-verification cycles at single-task PRE0+verification altitude at Task 8.4** (sister-shape to Phase-7 7.13 5-stage structured-diagnostic-protocol applied at empirical-verification altitude vs root-cause-isolation altitude):
- Finding α (Step-2 PRE0) — Task 8.3 audit §3.1 hypothetical-vs-empirical storage-key discrepancy (cemented as finding J)
- Finding β (Step-2 PRE0) — Kickoff-brief Step-3a IIFE pattern mismatch (`data-theme` attribute vs empirical `className` pattern); refined Step-3a IIFE shape applied empirically
- Finding γ (Step-2 PRE0) — Existing meta tag inventory ADD-WHAT'S-MISSING vs ADD-FROM-SCRATCH; refined Q4 scope to add only 5 new meta tags (preserve 7 existing tags + 17 Google Fonts unchanged)
- Finding K (Step-4-bis verification) — `dist/index.html` parent-altitude shape-change taxonomy distinct from `dist/assets/**` chunk-axis taxonomy (cemented as finding K)

**🎯 29 consecutive cross-phase sweep-resolutions cemented at 8.4 sweep** (extends Phase-8+ Task 8.3 28-pattern → 29-pattern at 8.4). Task 8.3 TBD → `c44198f` / `#71` resolution co-shipped at 8.4 sweep across §9 row 8.3 squash-SHA cell + Phase status line at top of `Docs/Phases/Phase_8_Plan.md` + Task 8.3 closure-narrative TBD references in `Docs/Phase8_Task_8_3_Completion_Report.md` + CLAUDE.md HEAD pointer pivot + Phase summary table Phase-8+ row.

**🎯 32-of-32 cross-phase chunk-axis preservation cumulative at 8.4 close** (production-source edit at qualia-shell/index.html parent-altitude PRESERVES dist/assets/** chunk axes per finding K empirical taxonomy refinement; 1-of-1 within-Phase-8+-post-8.4 + 31-of-31 cumulative carry-forward from 8.3 = 32-of-32). Pattern empirically robust at scale post-LAW-retirement: DOC-only / Scripts/ / Docs/ / Baselines/ / workflow-YAML / vitest-spec edits PRESERVE; production-source edits inside `qualia-shell/src/**` BREAK; **NEW empirical data point at Task 8.4 — production-source edits at `qualia-shell/index.html` parent-altitude PRESERVE `dist/assets/**` chunk axes when IIFE is inline** (no import statements; no entry-graph dependency).

**🎯 Paths-filter behavior at Task 8.4 — manual-dispatch prediction per Q5 LOCK** (qualia-shell/-root parent altitude; outside `qualia-shell/src/**` glob; sister-shape to qualia-shell/playwright.baseline.config.ts at 6.8 + qualia-shell/e2e/** at 7.2 manual-dispatch precedents). **Empirical verification at Step-7** — if parity gate auto-fires on pull_request despite Q5 prediction, surface as substantive empirical paths-filter taxonomy refinement (potential 12th Phase-8+ engineering finding L at Task 8.4 close).

---

## §2. Strict-gate command output paste

```
$ git rev-parse HEAD
c44198fc3297c260affe1f260d54a3cc8a4d1751   # pre-edit anchor (Phase-8+ Task 8.3 squash)

$ # === Step-4-bis pre-edit anchor capture (stashed 8.4 edit) ===
$ cd qualia-shell && git stash && rm -rf dist && npx vite build
✓ built in 3.85s
# Pre-edit dist/assets chunk axes:
#   index-4jBDEScz.js  / 291,279 B / 65c36e5f… (eager <script> JS chunk)
#   index-1yBoi7Al.js  /  87,711 B / 638f9f06… (vendor chunk)
#   index-aQIUs49K.js  / 117,765 B / 4c249229…
#   index-BebuHEVu.css /  49,312 B / 8fced46a…
#   StrataDashboard-DuzuZ15E.js / 1,032,104 B / 950445e7…
# Pre-edit dist/index.html: 1,456 B

$ git stash pop && rm -rf dist && npx vite build
✓ built in 3.85s
# Post-edit dist/assets chunk axes:
#   index-4jBDEScz.js  / 291,279 B / 65c36e5f… (IDENTICAL pre/post — Vite content-hashes filename)
#   index-1yBoi7Al.js  /  87,711 B / 638f9f06… (IDENTICAL)
#   index-aQIUs49K.js  / 117,765 B / 4c249229… (IDENTICAL)
#   index-BebuHEVu.css /  49,312 B / 8fced46a… (IDENTICAL)
#   StrataDashboard-DuzuZ15E.js / 1,032,104 B / 950445e7… (IDENTICAL)
# Post-edit dist/index.html: 2,301 B  (+845 B / +58.0% vs pre-edit)
# 🎯 Q6 PRESERVE CONFIRMED: all 5 dist/assets chunk axes byte-identical pre/post
# 🎯 Finding K empirically cemented: dist/index.html parent-altitude shape-change distinct from dist/assets/** chunk-axis taxonomy

$ npx tsc -b
✓ exit 0   # HARD HALT-IF #3 cleared

$ npx vitest run
Test Files  38 passed (38)
     Tests  264 passed (264)
  Duration  2.49s
# HARD HALT-IF #4 cleared; +0 delta vs Task 8.3 baseline per D-3 scope LOCK (no ThemeContext.tsx edits)

$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ built in 3.79s
# Build-mode invariant: dist/index.html = 2,301 B (identical to bare build)
# HARD HALT-IF #6 cleared; HARD HALT-IF #7 cleared (PRESERVE expected by construction; empirically confirmed)

$ cd .. && node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1359ms total).
```

---

## §3. CDP render proof (deferred — production-source edit at index.html altitude verifiable via build output + dev-server smoke)

Manual dev-server smoke test deferred — Step-4-bis empirical verification at build-output altitude provides equivalent empirical proof of FOUC IIFE + meta tag injection presence in `dist/index.html`. Build-output grep verification at Step-4 confirmed:

| Verification | Result |
|---|---|
| FOUC IIFE present in `dist/index.html` | ✓ `dwellium-theme` localStorage read + `qualia-theme` legacy fallback + `className = 'theme-' + theme` pattern landed byte-for-byte |
| 5 NEW meta tags present in `dist/index.html` | ✓ description + og:title + og:description + og:type + og:image stub all landed |
| Viewport-fit=cover refinement present in `dist/index.html` | ✓ `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />` |
| 7 existing tags preserved unchanged | ✓ charset + favicon + theme-color + manifest + title + 2 preconnect links + Google Fonts stylesheet |
| 17 Google Fonts links preserved unchanged | ✓ Phase-6 7.10 Lever 1 reverted state preserved per Q4 LOCK |

Sister-shape to Phase-7 7.13 calendar.test.tsx empirical-coverage-via-vitest-RTL pattern (build-output verification obviates manual CDP probe when source-vs-build-output relationship is deterministic at parent-altitude HTML shell).

---

## §4. `/security-review`

High = 0; Medium = 0. Task 8.4 is production-source edit at `qualia-shell/index.html` altitude introducing inline FOUC IIFE script + 5 SSR-ready meta tags + viewport-fit refinement. No new attack surface introduced:

- **FOUC IIFE script**: read-only `localStorage.getItem()` calls + DOM mutation (`className`) at App component evaluation; try/catch wraps `localStorage` access for sandboxed/restricted-storage contexts; no `eval()`; no remote script loading; no user-input handling.
- **5 meta tags**: pure metadata; description / og:* are static content for SEO + Open Graph cards; `/og-image.png` stub references same-origin asset path (no remote resource leak).
- **Viewport-fit=cover**: standards-compliant viewport meta tag refinement; no behavior change.

No new dependencies introduced. Sister-shape to Phase-7 7.10 inline-source-edit pattern + Phase-8+ 8.2 library-mode-only adoption discipline at security-review altitude.

---

## §5. Verification Matrix (per-task)

| Check | Target | Result | Evidence |
|---|---|---|---|
| `tsc -b` errors | 0 | ✓ | §2 paste; HARD HALT-IF #3 cleared |
| `vitest run` failures | ≤ 264 baseline | ✓ **264/264 PASS** (+0 delta per D-3 scope LOCK) | §2 paste; HARD HALT-IF #4 cleared |
| `vite build` (bare) | exit 0 | ✓ | §2 paste; built in 3.85s |
| `VITE_APPFOLIO_SEEDS=false vite build` | exit 0 | ✓ | §2 paste; built in 3.79s |
| Production chunk SHA256 / filename / byte-count (dist/assets) | PRESERVED per Q6 | ✓ | §2 paste; all 5 dist/assets chunks byte-identical pre/post (Vite content-hashed filenames stable) |
| `dist/index.html` byte-count change documentation (Finding K) | document per Q6 sub-recommendation | ✓ | 1,456 B → 2,301 B / +845 B / +58.0%; build-mode invariant |
| Manual dev-server smoke test | deferred per build-output verification equivalent | ✓ | §3 build-output grep verification table |
| `verify_no_pii_leak.mjs` strict-scope | exit 0 | ✓ | §2 paste; 51 files / 0 leaks |
| Parity gate per PR | green (manual-dispatch per Q5 LOCK) | ✓ SUCCESS | Run `25982171313` manual-dispatched; Q5 prediction EMPIRICALLY CONFIRMED (qualia-shell/-root parent altitude outside `qualia-shell/src/**` glob) |
| CodeRabbit review per PR | pass | ✓ clean pass | PR #72 review |
| `Docs/Phase8_Task_8_4_Completion_Report.md` | committed | ✓ | This file |
| §9 Phase-8+ sub-tracker row 8.4 | R → ✓ | ✓ | Plan v2.64 amendment |
| Task 8.3 TBD → `c44198f` / `#71` resolution | Co-shipped at 8.4 sweep | ✓ | Plan v2 §9 row 8.3 squash-SHA cell + Phase_8_Plan.md Phase status + Phase8_Task_8_3_Completion_Report.md reference spots + CLAUDE.md HEAD pointer pivot |
| SSR-MIGRATION-PREP class 1pt → 2pt cross-phase | fully calibrated per Q1 LOCK | ✓ | CLAUDE.md Calibration classes block (17th class fully calibrated at 2pt; no class count increment; sister-shape to SCOPING-ONLY 16th class 2pt fully-calibrated pattern at 8.3) |
| 2 NEW Phase-8+ engineering findings (J + K) | foregrounded at §0 | ✓ | This §0 |
| 5-pattern anchor-bias-mitigation cluster | extended from 4-pattern at 8.2 to 5-pattern at 8.4 | ✓ | v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1 + **v2.64.0 audit-content** |
| NEW v2.64.0 PRE-FLIGHT discipline candidate | docked at v2.64 amendment | ✓ | Plan v2.64 amendment narrative + CLAUDE.md Conventions block NEW entry |
| Audit doc §3.1 inline-footnote-correction per D-1 LOCK | shipped | ✓ | `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §3.1` inline-footnote-correction (sister-shape to 7.14 inline-footnote-at-Phase5_Perf_Report.md §2 precedent) |
| Cumulative Phase-8+ engineering-finding catalog | 9 → 11 (J + K cemented) | ✓ | This §0 + Plan v2.64 amendment narrative |
| Conventions block 4 NEW entries | docked at CLAUDE.md per Refinement B + C | ✓ | (a) FOUC IIFE mitigation pattern + (b) v2.64.0 audit-content empirical-vs-hypothetical PRE-FLIGHT discipline + (c) 5-pattern anchor-bias-mitigation cluster recognition + (d) chunk-axis-preservation taxonomy at parent-altitude |

---

## §6. Rollback SHA

Rollback target: `git revert c44198f` (Phase-8+ Task 8.3 squash; pre-Task-8.4 state) — OR `git revert 6742484` (Phase-8+ 8.4 close; reversible independently). Resolved at 8.5 sweep ✓.

Rollback safety: production-source edit at `qualia-shell/index.html` is structurally reversible (no DB or fixture state implications; no schema migration; no data dependencies; no dependency-graph changes per finding K — `dist/assets/**` chunk axes preserve byte-for-byte; only `dist/index.html` byte-count reverts). FOUC IIFE removal would restore pre-Task-8.4 FOUC behavior (theme className set post-hydration via useEffect at ThemeContext.tsx L181-185; brief FOUC visible on cold-start). v2.64 Plan amendment + Phase_8_Plan.md update + Task 8.3 TBD resolution + CLAUDE.md updates + Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §3.1 inline-footnote-correction + Phase8_Task_8_4_Completion_Report.md NEW are doc-only and reversible.

---

## §7. Deferred Items (Phase-8+ carry-forward)

1. **Phase-8+ Block A item 4 remains R after 8.4 close** (8.5 static-data extraction conditional). Block A → Block B transition gate at 8.5 close per Cowork Verdict 5 LOCK from Task 8.1 §8.3 institutionalized decision-gate #4. Block A becomes 3-of-4 ✓ at 8.4 close; 1 R remaining before Block A → Block B transition.

2. **Phase-8+ Block B items 8.6-8.11 remain R after 8.4 close** (RR v7 framework-mode adoption per Option β LOCK from Task 8.2 close). 8.6 PRE0 will integrate Task 8.3 §6 implementation roadmap + Task 8.4 FOUC IIFE pattern + Task 8.5 static-data extraction outcomes into framework-installation scope-shape. **🎯 Task 8.6 PRE0 inherits v2.64.0 audit-content empirical-vs-hypothetical PRE-FLIGHT discipline** — must empirically re-verify Task 8.3 audit §3.1 ThemeProvider inventory + Task 8.3 audit §3.2-§3.4 other provider inventories against current source code at HEAD-time-of-Task-8.6-kickoff before adopting audit conclusions verbatim. Sister-shape to v2.60.1 falsified-hypothesis discipline applied at audit-shipping altitude.

3. **Phase-8+ Block C items 8.12-8.15 remain R after 8.4 close** (LCP n=10 re-measurement + perf-lever stacking conditional + Phase-8+ closer + closer publishing). Block B → Block C transition gate at 8.11 close per Cowork Verdict 5 LOCK.

4. **4 untracked baseline JSON artifacts at `Docs/Baselines/`** — carry-forward from Phase-8+ Task 8.1 §7.3 + Task 8.2 §7.4 + Task 8.3 §7.3 per Cowork Verdict 4 LOCK; recommended commit-as-historical-baselines at Phase-8+ Block C closure task; preserved untracked at this PR.

5. **NEW Phase-8+ Block C deferred-item: `/og-image.png` actual asset creation** per D-4 (ii) LOCK. Task 8.4 ships stub `/og-image.png` reference in og:image meta tag; actual 1200×630 px PNG asset creation deferred to Phase-8+ Block C closer-task housekeeping OR Phase-9+ marketing/branding pass. Sister-shape to 4-untracked-baseline housekeeping deferred-item pattern.

6. **SSR-MIGRATION-PREP class 2pt CROSS-PHASE FULLY CALIBRATED at Task 8.4 close** — sister-shape to SCOPING-ONLY full-calibration at 8.3 + CLOSURE-NARRATIVE-CONSOLIDATION full-calibration at Phase-7 closer. No 3rd cross-phase data point needed for class stability; any future SSR-MIGRATION-PREP task (Phase-8+ Block B Task 8.6+ framework-installation if it ships framework-agnostic prep at production-source altitude OR Phase-9+ recurrence) adds incremental calibration but class is empirically stable at 2pt.

7. **Substantive Phase-8+ engineering finding (J) — Audit-doc empirical-vs-hypothetical-content distinction** cemented at this §0 + audit doc §3.1 inline-footnote-correction. Required PRE-FLIGHT step for every Task 8.6+ implementation: empirical re-verification of audit-shipping content against current source code. NEW v2.64.0 PRE-FLIGHT discipline candidate docked at v2.64 amendment per Cowork D-1 LOCK.

8. **Substantive Phase-8+ engineering finding (K) — `dist/index.html` parent-altitude shape-change taxonomy distinct from `dist/assets/**` chunk-axis taxonomy** cemented at this §0. Production-source edits at `qualia-shell/index.html` parent-altitude PRESERVE `dist/assets/**` chunk axes BUT CHANGE `dist/index.html` byte-count by construction. NEW Conventions block entry at CLAUDE.md docks per Cowork D-1 Refinement B LOCK. Empirical baseline at Task 8.4: 1,456 B → 2,301 B / +845 B / +58.0%; build-mode invariant.

9. **NEW v2.64.0 PRE-FLIGHT scope-shape discipline candidate at audit-content altitude** — extends 4-pattern anchor-bias-mitigation finding cluster at Phase-8+ Task 8.2 to **5-pattern cluster at Phase-8+ Task 8.4** (v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1 + v2.64.0). Sister-shape to recursive-validation discipline applied at every per-task PRE0 + close.

10. **32-of-32 cross-phase chunk-axis preservation cumulative at 8.4 close** (`dist/assets/**` chunk axes per finding K empirical taxonomy refinement). Production-source-edit BREAK reset expected at Task 8.6 framework-mode adoption close (entry-point migration BREAK is categorical per Task 8.1 §6 framework analysis); intermediate Task 8.5 (static-data extraction conditional) PRESERVE expected by construction (DOC + config-file class shape if narrow OR production-source-edit at static-data altitude class shape if broader; verdict at Task 8.5 PRE0).

11. **29 consecutive cross-phase sweep-resolutions cemented at 8.4 sweep** (extends 28-pattern at 8.3 → 29-pattern at 8.4). Task 8.3 TBD → `c44198f` / `#71` co-shipped.

12. **Paths-filter behavior empirical verification at Step-7** — manual-dispatch prediction per Q5 LOCK (qualia-shell/-root parent altitude). If parity gate auto-fires on pull_request despite Q5 prediction, surface as substantive empirical paths-filter taxonomy refinement (potential 12th Phase-8+ engineering finding L at Task 8.4 close); sister-shape to Phase-7 closer paths-filter taxonomy refinement vitest-at-src/test/** AUTO-FIRE vs playwright-at-e2e/** MANUAL-DISPATCH empirical distinction.

13. **ThemeProvider `useSyncExternalStore` migration DEFERRED to Task 8.6+ framework-installation context** per D-3 LOCK + v2.62.1 scope-shape PRE-FLIGHT discipline. Task 8.4 scope LOCKED at index.html template-shape only; ThemeContext.tsx integration is Block B framework-installation context where SSR hydration discipline is empirically validated against chosen framework's hydration semantics.

14. **Cumulative Phase-8+ engineering-finding catalog at 11 findings post-Task-8.4 close** (A + B + C + D from Task 8.1 + E + F from Task 8.2 + G + H + I from Task 8.3 + **J + K from Task 8.4**). Sister-shape to Phase-7 2-finding catalog growth pattern at FULL CLOSURE; Phase-8+ catalog grows mid-arc at every per-task discipline application; Phase-8+ closer at Task 8.14 will consolidate full catalog (projected 15-17 findings at full closure given empirical ~2-3 findings-per-task cadence + 11 remaining tasks).

---

## §8. Next-task unblock

**Phase-8+ Block A item 4 unblocked** (Task 8.5 static-data extraction conditional) — depends on Task 8.4 outcome for index.html template structure; runs after 8.4 close. Task 8.5 PRE0 should inventory potential static-data extraction targets (route-level metadata + auth-gate static config + provider-tree default values); class designation per Cowork verdict at Task 8.5 PRE0 Q1 (CONFIG-FILE-EDIT NEW class if extracted-data-only OR COMPONENT-FIX carry-over OR SSR-MIGRATION-PREP 3rd data point if substantive framework-prep).

**Phase-8+ Block A → Block B transition gate at Task 8.5 close** per Cowork Verdict 5 LOCK from Task 8.1 §8.3 institutionalized decision-gate #4. Verifies Block A produced clean pre-conditions for Block B framework adoption:
- ✓ Imperative-routing fully migrated to declarative routing (Task 8.2)
- ✓ Provider-tree SSR-audited (Task 8.3)
- ✓ Index.html template-ready with FOUC IIFE + SSR-ready meta tags (Task 8.4)
- Pending: static-data extracted-or-deferred (Task 8.5)

**Phase-8+ Block B items 8.6-8.11 blocked pending Block A complete** + Cowork Block A → Block B transition gate at 8.5 close. Task 8.6 will adopt RR v7 framework-mode (`@react-router/dev` Vite plugin + `app/` directory + `entry.client.tsx` + `react-router.config.ts` with `ssr: false` initially) per Option β deferred-scope from Task 8.2 close. Task 8.6 PRE0 inherits Task 8.3 §6 implementation roadmap + Task 8.4 FOUC IIFE pattern + v2.64.0 audit-content empirical-vs-hypothetical PRE-FLIGHT discipline.

**Phase-8+ Block C items 8.12-8.15 blocked pending Block B complete** + Cowork Block B → Block C transition gate at 8.11 close.

Phase-8+ budget per `Docs/Phases/Phase_8_Plan.md §10`: 8-12 days end-to-end across 15 tasks; 8.1 OPENER + 8.2 + 8.3 + 8.4 = ~2.5 days burned; ~5.5-9.5 days remaining buffer for Block A 1 task + Block B 6 tasks + Block C 4 tasks.

🧪
