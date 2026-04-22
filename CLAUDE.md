# CLAUDE.md — Repo-level Agent Notes

**Repo.** `NovaTrustSolutions/dwellium-per-spec` (private)
**Default branch.** `main`
**Subtree.** `qualia-shell/` imported 2026-04-22 from upstream `qualia-shell` via `git subtree add`.

---

## Current State (as of 2026-04-22)

- **HEAD:** `934c304` (`docs(phase-0.0): close exit gate — all 10 verify steps green`)
- **Last green CI run:** `24792493110` — `AppFolio Parity Gate` — HEAD at `42c1d31` — `https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/24792493110`
- **Phase 0.0 closed:** 2026-04-22. Exit gate report: `Docs/Baselines/phase_0_0_exit_gate_report.md`. All 10 verify-steps (0.0.1 – 0.0.9 + 0.0.5b) pass. CI integrated and green on the strict gates (tsc + vitest 89/89 + vite dual-mode build + PII scan strict).
- **Next phase starting point:** Phase 1 — Top-5 schema extensions, 5 sequential tasks on `packages/types/index.ts`. See `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §7 (Phase 1). Open first PR from HEAD `934c304`.

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
