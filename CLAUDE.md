# CLAUDE.md — Repo-level Agent Notes

**Repo.** `NovaTrustSolutions/dwellium-per-spec` (private)
**Default branch.** `main`
**Subtree.** `qualia-shell/` imported 2026-04-22 from upstream `qualia-shell` via `git subtree add`.

---

## Current State (as of 2026-04-26)

- **HEAD:** `08fc669` (`feat(phase-3): Task 3.9 — TenantPortalModule GR-13 retrofit + authFetch → strataApi rewire (final retrofit-chain task) (#21)`) — third and final retrofit-chain task landed. **Phase-3 OPEN; 3-PR retrofit chain RETIRED — same-day triple-close 3.7 + 3.8 + 3.9 on 2026-04-25 → 2026-04-26.**
- **Last green CI run:** `(post-sweep dispatch — backfilled by sweep CI-pointer fixup commit)` — `AppFolio Parity Gate` — HEAD at sweep commit on `main` post-3.9. The PR-branch run `24956896403` (dispatched on `feat/phase-3-task-3.9-tenant-portal-gr13-retrofit`) was independently confirmed `success` in 6m57s before the merge — all 12 strict-gate steps green (tsc + vitest 192/192 + Playwright baseline `continue-on-error: true` per CLAUDE.md L25 + dual vite build + PII scan strict + artifact upload).
- **Phase 0.0 closed:** 2026-04-22. Exit gate report: `Docs/Baselines/phase_0_0_exit_gate_report.md`. All 10 verify-steps (0.0.1 – 0.0.9 + 0.0.5b) pass. CI integrated and green on the strict gates (tsc + vitest 192/192 post-Task-3.9 + vite dual-mode build + PII scan strict).
- **Phase 1 closed:** 2026-04-23 at HEAD `094b91e1b5991e42b1e5f5639553d6a1a541c2ef` (Task 1.5 merge). See `Docs/Phase1_Completion_Report.md`.
- **Phase 2 closed:** 2026-04-25 at HEAD `1a7a39b` (Task 2.9 merge). All 10 Phase-2 tasks merged green: B3 serial chain (Tasks 2.3 `36ee8ca` → 2.5 `f6d3fb2` → 2.7 `40875db`, closed 2026-04-23 on `packages/types/index.ts`) + general pool post-B3 (all seven: Task 2.2 Communication seed `b98e84c` → Task 2.1 Calendar AHA inspections `67768c9` → Task 2.10 PropertyTimeline multi-source merge `fba4d65` → Task 2.4 Forecast static handler + ForecastModule rewire `17c77b4` → Task 2.6 Utilities utility-vendor workitem seed `828bb11` → Task 2.8 Sentiment 3 static handlers + at-risk fixture + SentimentModule rewire (`isStaticMode` precedent) `0a7f3ef` → Task 2.9 Projects WO 19441-1 canonical project workitem `1a7a39b`). Plan §9 Phase-2 column flips `R` → `✓` for all 16 verification rows. Per-task completion reports at `Docs/Phase2_Task_2_X_Completion_Report.md` (X = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10).
- **Phase 3 opened:** 2026-04-25 at HEAD `fe9b642` (Task 3.7 squash-merge — PR #19). Task 3.7 (ProjectsModule GR-13 retrofit — ErrorBoundary + 4 Sentry breadcrumbs + 7 `data-testid` anchors + isStaticMode write-guard) is the **first** Phase-3 task and the first PR in the 3-PR GR-13 retrofit chain (3.7 Projects → 3.8 CorporateReview → 3.9 TenantPortal; sequential). Per-task completion report at `Docs/Phase3_Task_3_7_Completion_Report.md`.
- **Phase 3 second task closed:** 2026-04-25 at HEAD `b4b7c9a` (Task 3.8 squash-merge — PR #20). Task 3.8 (CorporateReview GR-13 retrofit + raw fetch → strataApi rewire — ErrorBoundary + 6 consolidated Sentry breadcrumbs + 11 `data-testid` anchors + 5 isStaticMode write-guards across all POST sites + sticky `statusFeedback` banner two-channel split) is the second PR in the retrofit chain. Per-task completion report at `Docs/Phase3_Task_3_8_Completion_Report.md`. Establishes the **first multipart export through the strataApi router** (`strataUpload<T>`) and the **first-in-suite static-handler direct-test pattern** (`vi.resetModules()` + fetch mocking).
- **Phase 3 retrofit chain RETIRED:** 2026-04-26 at HEAD `08fc669` (Task 3.9 squash-merge — PR #21). Task 3.9 (TenantPortalModule GR-13 retrofit + authFetch → strataApi rewire — ErrorBoundary + 4 consolidated Sentry breadcrumbs + 11 `data-testid` anchors + 1 isStaticMode write-guard on the SINGLE message-send POST site + sticky `statusFeedback` banner between gradient header and KPI row + 7 NEW static handlers [6 GET + 1 POST] + 4-item types hoist [6th post-B3 additive amendment] + 2 NEW fixtures [`tenant_portal_payments.json` + `tenant_portal_messages.json`, FK-correct, PII-clean]) is the third and final PR in the retrofit chain. Per-task completion report at `Docs/Phase3_Task_3_9_Completion_Report.md`. Plan §9 Phase-3 sub-tracker pending row narrows 5 → 4: `3.1, 3.2, 3.3, 3.4` (parallel batch only — sequential chain RETIRED). Phase-3 deferred-items ledger drops 6 → 5 items (Task 2.8 §7 cross-module write-guard "TenantPortalModule" entry retires — final entry in that ledger retires). Vitest 183 → **192** (+9 net; +2 files, 31 total — third consecutive retrofit-chain task to match vitest delta prediction exactly: 3.7 +3, 3.8 +9, 3.9 +9). Module-graph drift `StrataDashboard-B9P7mtqe.js` → `DpkpCMoo.js` (+0.04 kB ungzipped, +0.01 kB gzip — retrofit + 7 static handlers + 11 testids + ErrorBoundary + statusFeedback state + Inner/Outer split + import block restructure; module-count parity 3278 holds across both build modes; chunk hash byte-identical across `VITE_APPFOLIO_SEEDS` flag). Task 3.9 also establishes the **first post-3.8 task to skip strataApi.ts and strataApi.backend.ts amendments** — TenantPortal consumes the existing strataGet + strataPost patterns exclusively (precedent: retrofit-chain tasks add to strataApi only when introducing a new transport pattern). 6th post-B3 additive amendment to `packages/types/index.ts` (after Tasks 2.2 / 2.10 / 2.4 / 2.8 / 3.8). Plan v2.13 retires the sequential retrofit chain entirely.
- **Next task:** Phase-3 parallel batch (`3.1, 3.2, 3.3, 3.4` from §19 dependency graph) — none of which depends on the retired retrofit chain; can land in any order based on user prioritization. Surviving 5 deferred-items ledger items at `Docs/Phase2_Task_2_9_Completion_Report.md` §8 + `Docs/Phase3_Task_3_9_Completion_Report.md` §7 still apply. Open Phase-3 plan-version follow-ups: **v2.14** (Node.js 20 actions deprecation workflow bump — due 2026-09-16; deferred per Task 3.9 PRE0-5 to a standalone PR; scheduling decision deferred to Phase-3 parallel-batch closure review when 3.1-3.4 cadence is visible); **v2.15 candidate** (Playwright baseline pass-count drift 2 → 4 between Task 3.7 sweep run `24927092067` and Task 3.8 CI runs); **v2.16 candidate** (lift the 5 inline tab components out of TenantPortalModuleInner + fix the pre-existing React missing-key warning in MessagesTab — both surfaced as Task 3.9 §7 follow-ups; same structural-rework scope).

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
