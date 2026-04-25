# CLAUDE.md — Repo-level Agent Notes

**Repo.** `NovaTrustSolutions/dwellium-per-spec` (private)
**Default branch.** `main`
**Subtree.** `qualia-shell/` imported 2026-04-22 from upstream `qualia-shell` via `git subtree add`.

---

## Current State (as of 2026-04-25)

- **HEAD:** `fe9b642` (`feat(phase-3): Task 3.7 — ProjectsModule GR-13 retrofit (first Phase-3 task) (#19)`) — first Phase-3 task landed. **Phase-3 OPEN.**
- **Last green CI run:** `24927092067` — `AppFolio Parity Gate` — HEAD at `fe9b642` — `https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/24927092067` (dispatched on main at sweep-commit time; PR-branch run `24926823092` was the green-source for the squash content).
- **Phase 0.0 closed:** 2026-04-22. Exit gate report: `Docs/Baselines/phase_0_0_exit_gate_report.md`. All 10 verify-steps (0.0.1 – 0.0.9 + 0.0.5b) pass. CI integrated and green on the strict gates (tsc + vitest 174/174 post-Task-3.7 + vite dual-mode build + PII scan strict).
- **Phase 1 closed:** 2026-04-23 at HEAD `094b91e1b5991e42b1e5f5639553d6a1a541c2ef` (Task 1.5 merge). See `Docs/Phase1_Completion_Report.md`.
- **Phase 2 closed:** 2026-04-25 at HEAD `1a7a39b` (Task 2.9 merge). All 10 Phase-2 tasks merged green: B3 serial chain (Tasks 2.3 `36ee8ca` → 2.5 `f6d3fb2` → 2.7 `40875db`, closed 2026-04-23 on `packages/types/index.ts`) + general pool post-B3 (all seven: Task 2.2 Communication seed `b98e84c` → Task 2.1 Calendar AHA inspections `67768c9` → Task 2.10 PropertyTimeline multi-source merge `fba4d65` → Task 2.4 Forecast static handler + ForecastModule rewire `17c77b4` → Task 2.6 Utilities utility-vendor workitem seed `828bb11` → Task 2.8 Sentiment 3 static handlers + at-risk fixture + SentimentModule rewire (`isStaticMode` precedent) `0a7f3ef` → Task 2.9 Projects WO 19441-1 canonical project workitem `1a7a39b`). Plan §9 Phase-2 column flips `R` → `✓` for all 16 verification rows. Per-task completion reports at `Docs/Phase2_Task_2_X_Completion_Report.md` (X = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10).
- **Phase 3 opened:** 2026-04-25 at HEAD `fe9b642` (Task 3.7 squash-merge — PR #19). Task 3.7 (ProjectsModule GR-13 retrofit — ErrorBoundary + 4 Sentry breadcrumbs + 7 `data-testid` anchors + isStaticMode write-guard) is the **first** Phase-3 task and the first PR in the 3-PR GR-13 retrofit chain (3.7 Projects → 3.8 CorporateReview → 3.9 TenantPortal; sequential). Per-task completion report at `Docs/Phase3_Task_3_7_Completion_Report.md`. Plan §9 Phase-3 sub-tracker pending row narrows from 7 to 6: `3.1, 3.2, 3.3, 3.4, 3.8, 3.9`. Phase-2 → Phase-3 deferred-items ledger drops 10 → 8 items (Task 2.8 §7 cross-module write-guard "ProjectsModule" + Task 2.9 (f) §7 / §8 row 8 "ProjectsModule GR-13 retrofit" retire). Vitest 171 → 174 (+3 net; +1 file, 27 total). Module-graph drift `StrataDashboard-Cyc6wJ5v.js` → `BoN7HPsN.js` (+0.98 kB ungzipped retrofit additive surface; module-count parity 3278 holds).
- **Next task:** Task 3.8 (CorporateReview GR-13 retrofit) — second PR in retrofit chain; rebases on `fe9b642`. Bigger scope than 3.7: raw fetch → strataApi rewire + 6 endpoint additions including multipart upload + 5 `isStaticMode` write-guards + GR-13 retrofit. Followed by Task 3.9 (TenantPortalModule GR-13 retrofit). Phase-3 parallel batch (3.1, 3.2, 3.3, 3.4 from §19 dependency graph) remains unblocked by the chain. Surviving 8 deferred-items ledger items at `Docs/Phase2_Task_2_9_Completion_Report.md` §8 also still apply (top candidate: AppFolio re-capture pipeline for missing tenant/property surfaces — v1 "3,274 captured tenants" → 322 actual; "50-property seed" → 36 actual).

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
