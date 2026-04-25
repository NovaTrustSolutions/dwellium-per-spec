# CLAUDE.md — Repo-level Agent Notes

**Repo.** `NovaTrustSolutions/dwellium-per-spec` (private)
**Default branch.** `main`
**Subtree.** `qualia-shell/` imported 2026-04-22 from upstream `qualia-shell` via `git subtree add`.

---

## Current State (as of 2026-04-25)

- **HEAD:** `1a7a39b` (`feat(phase-2): Task 2.9 — Projects: WO 19441-1 canonical project workitem (Phase-2 closure) (#18)`) — seventh and **final** general-pool Phase-2 task landed post-B3. **🎉 Phase-2 closed.**
- **Last green CI run:** `24923624351` — `AppFolio Parity Gate` — HEAD at `1a7a39b` — `https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/24923624351`
- **Phase 0.0 closed:** 2026-04-22. Exit gate report: `Docs/Baselines/phase_0_0_exit_gate_report.md`. All 10 verify-steps (0.0.1 – 0.0.9 + 0.0.5b) pass. CI integrated and green on the strict gates (tsc + vitest 171/171 post-Task-2.9 + vite dual-mode build + PII scan strict).
- **Phase 1 closed:** 2026-04-23 at HEAD `094b91e1b5991e42b1e5f5639553d6a1a541c2ef` (Task 1.5 merge). See `Docs/Phase1_Completion_Report.md`.
- **Phase 2 closed:** 2026-04-25 at HEAD `1a7a39b` (Task 2.9 merge). All 10 Phase-2 tasks merged green: B3 serial chain (Tasks 2.3 `36ee8ca` → 2.5 `f6d3fb2` → 2.7 `40875db`, closed 2026-04-23 on `packages/types/index.ts`) + general pool post-B3 (all seven: Task 2.2 Communication seed `b98e84c` → Task 2.1 Calendar AHA inspections `67768c9` → Task 2.10 PropertyTimeline multi-source merge `fba4d65` → Task 2.4 Forecast static handler + ForecastModule rewire `17c77b4` → Task 2.6 Utilities utility-vendor workitem seed `828bb11` → Task 2.8 Sentiment 3 static handlers + at-risk fixture + SentimentModule rewire (`isStaticMode` precedent) `0a7f3ef` → Task 2.9 Projects WO 19441-1 canonical project workitem `1a7a39b`). Plan §9 Phase-2 column flips `R` → `✓` for all 16 verification rows. Per-task completion reports at `Docs/Phase2_Task_2_X_Completion_Report.md` (X = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10).
- **Next phase starting point:** Phase 3 (AppFolio re-capture). Consolidated Phase-3 deferred-items ledger (10 items spanning Tasks 2.4 / 2.6 / 2.8 / 2.9) lives in `Docs/Phase2_Task_2_9_Completion_Report.md` §8. Top candidates: (i) AppFolio re-capture pipeline for missing tenant/property surfaces (v1 "3,274 captured tenants" → 322 actual; "50-property seed" → 36 actual); (ii) 3-module GR-13 retrofit grouped PR (TenantPortalModule + CorporateReview + ProjectsModule — recommended order: ProjectsModule first since it's already routed through `strataApi.ts`).

---

## CI Behavior

- `AppFolio Parity Gate` (`.github/workflows/appfolio-parity-gate.yml`) runs on push to `main` + PRs touching the parity paths. Blocking gates: `tsc -b`, `vitest`, both `vite build` modes, and `verify_no_pii_leak.mjs` strict-scope.
- Playwright baseline E2E is currently `continue-on-error: true` pending Linux snapshot capture (Task 0.0.9 captured darwin-only). Do not flip this back to blocking without committing the Linux snapshots first.
- `PII Scan` (`.github/workflows/pii-scan.yml`) runs on every push and PR.
- **Known quirk.** Push-triggered workflow runs have not been firing reliably on this repo in recent pushes; prefer `gh workflow run` (workflow_dispatch) for verification after a push when no automatic run appears within ~90 seconds.

---

## Deferred Items (not blocking Phase 1)

1. **Linux Playwright baselines.** Capture 8 `*-chromium-linux.png` baselines on a Linux dev box (or via CI `--update-snapshots`). See `Docs/Baselines/phase_0_0_exit_gate_report.md` "Deferred Item" section for resolution steps. Until done, the Playwright step in CI is informational only.
2. **`qualia-shell/public/assets/nebula-bg.mp4`.** 70.96 MB asset tracked in git. Exceeds GitHub's 100 MB per-file soft limit; a future push of this file would need Git LFS, a CDN, or a smaller replacement asset. **Do not** run `git lfs migrate` on `main` without explicit instruction — history rewrite is out of scope.

---

## Conventions (repo-specific)

- **Subtree discipline.** `qualia-shell/` is a subtree; changes under it should ideally flow back to the upstream `qualia-shell` repo via `git subtree push` when appropriate. Local-only changes land directly on `main`.
- **PII.** `Scripts/verify_no_pii_leak.mjs` guards both strict (`appfolioDerived/`) and legacy (`qualia-shell/public/data/`) scopes. Both are strict-clean as of 2026-04-19 (Task 0.0.5b). Do not re-introduce PII.
- **Feature flag.** `VITE_APPFOLIO_SEEDS` gates the AppFolio-derived seed layer. Both `true` and `false` builds must succeed (CI verifies both).

---

## Useful commands

- Run strict gate locally (mirrors CI): `cd qualia-shell && npx tsc -b && npx vitest run && npx vite build && VITE_APPFOLIO_SEEDS=false npx vite build && cd .. && node Scripts/verify_no_pii_leak.mjs`
- Dispatch parity gate: `gh workflow run "AppFolio Parity Gate" -R NovaTrustSolutions/dwellium-per-spec --ref main`
- Watch latest run: `gh run watch $(gh run list -R NovaTrustSolutions/dwellium-per-spec --workflow "AppFolio Parity Gate" --limit 1 --json databaseId -q '.[0].databaseId') -R NovaTrustSolutions/dwellium-per-spec --exit-status`
