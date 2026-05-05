# CLAUDE.md — Repo-level Agent Notes

**Repo.** `NovaTrustSolutions/dwellium-per-spec` (private)
**Default branch.** `main`
**Subtree.** `qualia-shell/` imported 2026-04-22 from upstream `qualia-shell` via `git subtree add`.

> Per-task / per-phase detail lives in `Docs/Phase<N>_Task_<X>_Completion_Report.md` and `Docs/Phase<N>_Closure_Report.md`. Read those for narrative; this file is a pointer index.

---

## Current State (as of 2026-05-04)

- **HEAD:** `2acaa82` — Task 5.7 squash-merged 2026-05-04 (`feat(phase-5): Task 5.7 — Accessibility validation axe-core (#43)`).
- **Phase-5 CLOSED 2026-05-04.** Closure narrative: `Docs/Phase5_Closure_Report.md`. Plan §9 Phase-5 column header `R → ✓` across all 16 rows. Plan v2.35 anchors closure.
- **Last green CI:** Task 5.7 PR-branch — `AppFolio Parity Gate` run `25301594733` (~7m07s, **manual-dispatch** per `Scripts/**` + `Docs/**` not in parity-gate paths filter; mirrors 5.6/5.5/5.4/5.3/4.7 precedent) + `PII Scan` run `25301593300` (auto-fired, 25s) + CodeRabbit review.
- **Production chunk invariance:** SHA256 `1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea` / filename `COZxJ8Bh.js` / size 1,031,260 bytes — preserved 7-of-7 within Phase-5 since the 5.1c break, and 17-of-17 byte-count across phases. Test-tooling additions are categorically chunk-graph-isolated (validated across 6 distinct shapes: MSW + Playwright config + 3 e2e specs + 2 measurement scripts).
- **Vitest:** 259 passing.

### Phase summary

| Phase | Closed | HEAD at close | PRs | Vitest delta | Notes |
|------:|:------:|:--------------|----:|-------------:|:------|
| 0.0   | 2026-04-22 | — | — | — | Exit gate: `Docs/Baselines/phase_0_0_exit_gate_report.md` |
| 1     | 2026-04-23 | `094b91e` | — | — | `Docs/Phase1_Completion_Report.md` |
| 2     | 2026-04-25 | `1a7a39b` | 10 | +87 | Per-task reports `Docs/Phase2_Task_2_X_Completion_Report.md` |
| 3     | 2026-04-28 | `0cfb8a8` | 9  | +32 | Closure: `Docs/Phase3_Closure_Report.md` |
| 4     | 2026-04-30 | `3a41cdf` | 7  | +0  | Closure: `Docs/Phase4_Closure_Report.md` (first phase with byte-identical chunk across all tasks) |
| 5     | 2026-05-04 | `2acaa82` | 10 | +35 | Closure: `Docs/Phase5_Closure_Report.md` |

### Next task

Phase-5 has zero surviving rows. **Recommended next: Phase 6** (or "Phase-5.5" if scoped narrowly). Scope candidates per `Docs/Phase5_Closure_Report.md §5`:

1. `.s-detail-panel` latent bug investigation — blocks `helpers/auth.ts` cold-start sidebar amendment from landing and blocks existing appfolio-parity feature specs from running green in CI cold-start.
2. **a11y remediation arc** (~1–2 days est., ~5 component changes per `Docs/Phase5_A11y_Report.md §4`): primary fix is tenant-row icon-button accessible-name (~334 of 362 violating nodes); plus targeted fixes for color-contrast / aria-valid-attr-value / select-name / scrollable-region-focusable.
3. **Perf optimization arc** (joint with a11y per Task 5.6 §7 / 5.7 §6): code-splitting beyond `manualChunks`, lazy-loading routes, SSR shell, CDN edge caching.
4. **CI integration of feature specs** (post-detail-panel-fix): add `e2e/strata-nav.spec.ts` + `e2e/appfolio-parity-workorder.spec.ts` + `e2e/appfolio-parity-vendor-compliance.spec.ts` to `playwright.baseline.config.ts::testMatch` (currently scoped to screenshot-baseline + axe-baseline only).
5. **Threshold-decision gate** for v1 L228 (perf) + v1 L230 (a11y) blow-throughs — surface to product/engineering for tuning-vs-spec-amendment call.

### Calibration classes (in-repo, project-wide)

9 distinct classes seen across phases. See `Docs/Phase5_Closure_Report.md §3` for the consolidated table. Phase-5 alone introduced 6 distinct classes: NEAR-NULL-OP carry-over (3 pts) / CONSUMER-SIDE-CONTRACT-TEST (1) / CONSUMER-SIDE-FETCH-WRAPPER (1) / MSW-CONTRACT-TEST (1) / E2E-PLAYWRIGHT (3) / MEASUREMENT-ONLY (2).

### Surviving deferred-items ledger

~133 entries across `Docs/Phase3_Closure_Report.md §7` + Phase-4 + Phase-5 per-task reports. Consolidated index in `Docs/Phase5_Closure_Report.md §5`.

---

## CI Behavior

- `AppFolio Parity Gate` (`.github/workflows/appfolio-parity-gate.yml`) runs on push to `main` + PRs touching parity paths. Blocking gates: `tsc -b`, `vitest`, both `vite build` modes (`VITE_APPFOLIO_SEEDS={true,false}`), `verify_no_pii_leak.mjs` strict-scope.
- Playwright baseline E2E is `continue-on-error: true` pending Linux snapshot capture (Task 0.0.9 captured darwin-only). Do not flip back to blocking without committing the Linux snapshots first.
- `PII Scan` (`.github/workflows/pii-scan.yml`) runs on every push and PR.
- **Paths-filter quirk.** Sweeps and tasks touching only `Scripts/**`, `Docs/**`, `qualia-shell/e2e/**`, `playwright.config.ts`, or `.env.example` fall outside the parity-gate paths filter — verification needs `gh workflow run` (workflow_dispatch). Established precedent across 4.7 / 5.3 / 5.4 / 5.5 / 5.6 / 5.7.
- **Push-trigger flake.** Push-triggered runs have not fired reliably; prefer manual dispatch when no auto-run appears within ~90s.

---

## Deferred Items (not blocking)

1. **Linux Playwright baselines.** Capture 8 `*-chromium-linux.png` baselines (Linux dev box or CI `--update-snapshots`). See `Docs/Baselines/phase_0_0_exit_gate_report.md` "Deferred Item" section. Until done, the Playwright CI step is informational.
2. **`qualia-shell/public/assets/nebula-bg.mp4`** — 70.96 MB asset in git, over GitHub's 100 MB soft limit. Future push of this file needs Git LFS, a CDN, or a smaller replacement. **Do not** `git lfs migrate` on `main` without explicit instruction (history rewrite is out of scope).

---

## Conventions (repo-specific)

- **Phase-plan locality (PRE-FLIGHT discipline, Plan v2.29).** When scoping a task in a phase, check `Docs/Phases/Phase_<N>_Plan.md` alongside the parent plan — the phase-spec may refine per-task scope. Missed in 5.1a/5.1b/5.1c PRE0s; elevated to standing PRE-FLIGHT step.
- **Phase-spec vs parent (GR-14, Plan v2.32 amendment).** When phase-spec *contradicts* (not refines) parent, **parent + v1-lineage wins**. Established after Task 5.3 surfaced `Docs/Phases/Phase_5_Plan.md` L160+ diverging from parent §9 rows 5.4–5.7. Phase_5_Plan.md L160-end carries a DEPRECATION banner; scopes preserved for potential Phase-6 production-readiness arc.
- **Source-provenance verification (Step Zero of DC-pre-flight).** Phase-4 closure §4 elevated this to permanent process after 4 SCOPE-COLLISION findings (4.3 / 4.5 / 4.6 / 4.7). Verify the kickoff-named source actually contains what the spec assumes before committing to a path.
- **Subtree discipline.** `qualia-shell/` is a subtree; changes ideally flow back to the upstream `qualia-shell` repo via `git subtree push`. Local-only changes land directly on `main`.
- **PII.** `Scripts/verify_no_pii_leak.mjs` guards strict (`appfolioDerived/`) and legacy (`qualia-shell/public/data/`) scopes. Both strict-clean as of 2026-04-19 (Task 0.0.5b). Do not re-introduce PII. PII guard regex `/\b(?:\d[ -]*?){13,19}\b/` at `complianceEngine.test.ts:228` will false-positive on raw UUID 16-digit hex prefixes — use slug-namespace IDs in fixtures (see Phase-5 5.1b §7 / 5.2 carry-forward).
- **Feature flag.** `VITE_APPFOLIO_SEEDS` gates the AppFolio-derived seed layer. Both `true` and `false` builds must succeed (CI verifies both).
- **API version header.** `strataApi.backend.ts` emits `X-Qualia-API: v2` unconditionally on `request()` and `strataUpload()` (Task 5.1c). Server-side v1/v2 routing is out-of-repo per R-4 v2.26 cross-repo amendment.
- **E2E target.** `playwright.config.ts` is dual-project: default `chromium` (static API) and `real-backend` (live backend, requires sibling repo `../ai-dashboard369-file-manager` + seeded staging DB). Select with `E2E_TARGET=real-backend npx playwright test` (Task 5.3).
- **Cold-start sidebar.** Feature specs (`strata-nav` / `appfolio-parity-workorder` / `appfolio-parity-vendor-compliance`) require the `Property Management` widget group expanded — `Sidebar.tsx:226-232` defaults `expandedGroups` to empty Set. `helpers/auth.ts::loginAs` amendment landed empirically broken (`.s-detail-panel` latent bug exposed); current mitigation is inline `localStorage.setItem('qualia_sidebar_groups', ...)` in measurement scripts only (Tasks 5.6 / 5.7). Phase-6 needs to investigate the detail-panel bug before the helper amendment can land.

---

## Useful commands

- **Strict gate (mirrors CI):**
  `cd qualia-shell && npx tsc -b && npx vitest run && npx vite build && VITE_APPFOLIO_SEEDS=false npx vite build && cd .. && node Scripts/verify_no_pii_leak.mjs`
- **Dispatch parity gate:**
  `gh workflow run "AppFolio Parity Gate" -R NovaTrustSolutions/dwellium-per-spec --ref main`
- **Watch latest run:**
  `gh run watch $(gh run list -R NovaTrustSolutions/dwellium-per-spec --workflow "AppFolio Parity Gate" --limit 1 --json databaseId -q '.[0].databaseId') -R NovaTrustSolutions/dwellium-per-spec --exit-status`
