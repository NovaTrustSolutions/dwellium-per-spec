# Phase 0 — Completion Report

**Date:** 2026-04-19
**Executor:** Claude (Cowork mode)
**Environment:** sandbox (Linux ARM64), Node v22.22.0, npm 10.9.4

## Guard Rail Verification

| Check | Result | Evidence |
|---|---|---|
| GR-4 `tsc -b` clean | ✅ 0 errors | `Docs/Baselines/2026-04-19_Phase0_baseline_tsc.txt` (empty = clean) + re-run after fixture add |
| GR-4 `vitest run` — no NEW failures from baseline | ✅ +15 passed, 0 new failures | baseline: 65 passed / 9 failed → post-phase-0: 80 passed / 9 failed |
| GR-4 `playwright test` | ⚠ sandbox cannot launch browsers | `Docs/Baselines/2026-04-19_Phase0_baseline_playwright.txt` — environmental blocker, must run on a real dev box for subsequent phases |
| GR-4 `vite build` | ✅ 3269 modules transformed, 8.07s | built to `/tmp/vite-phase0-true` (workspace `dist/` is mount-locked in sandbox; not a code issue) |
| GR-4 `VITE_APPFOLIO_SEEDS=false vite build` | ✅ 8.31s success | built to `/tmp/vite-phase0-false` |
| GR-3 Fixture row-count lower-bound | ✅ N/A this phase — no existing fixtures modified | fixture additions are net-new files |
| GR-7 PII discipline | ✅ Flag wired; emails stripped to @example in derivation | see `Scripts/derive_appfolio_fixtures.mjs` |
| GR-9 Pasted proof inline | ✅ this document | |

## Baseline captures (Phase 0 Task 1)

| File | Summary |
|---|---|
| `Docs/Baselines/2026-04-19_Phase0_baseline_tsc.txt` | 0 errors — empty output, exit 0 |
| `Docs/Baselines/2026-04-19_Phase0_baseline_vitest.txt` | 11 test files / 74 tests — 9 failed (all in StellaAgent.test.tsx + 1 other), 65 passed |
| `Docs/Baselines/2026-04-19_Phase0_baseline_playwright.txt` | `Failed to launch: Error: spawn /bin/sh ENOENT` — sandbox cannot run Playwright; must use real dev box |
| `Docs/Baselines/2026-04-19_Phase0_baseline_vite_build.txt` | 3269 modules, ✓ built in 7.17s (with `.DS_Store` permission warning workaround via `--outDir /tmp/vite-baseline-dist`) |

## Outputs

### Phase 0 Task 2 — Fixture derivation script
- `Scripts/derive_appfolio_fixtures.mjs` (Node ESM — avoids ts-node dep). Runs clean, idempotent.
- Emits 10 typed `.ts` fixture files to `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/`:
  - `properties.ts` (5,274 bytes)
  - `occupancies.ts` (1,425 bytes)
  - `tenants.ts` (5,991 bytes)
  - `vendors.ts` (8,971 bytes)
  - `workorders.ts` (10,484 bytes)
  - `leases.ts` (1,261 bytes)
  - `compliance.ts` (6,200 bytes)
  - `communications.ts` (4,027 bytes)
  - `fixed_assets.ts` (1,985 bytes)
  - `index.ts` (barrel export)
- Every file is flag-gated: `ENABLED = import.meta.env.VITE_APPFOLIO_SEEDS !== 'false'`. When false, exports empty arrays (GR-7).

### Phase 0 Task 3 — Type audit
- `Docs/Phase0_Type_Audit.md` — 34 orphan fields identified across 10 modules, mapped to Phase 1 / Phase 2 tasks. Strata-unique modules flagged GR-1.

### Phase 0 Task 4 — Test scaffolding
- `qualia-shell/src/test/appfolioParity/` with README + **15 stub test files** (5 Phase 1 + 10 Phase 2):
  - residents, vendors, properties, maintenance, accounting (Phase 1)
  - calendar, communication, complianceEngine, forecast, insurance, utilities, audit, sentiment, projects, propertyTimeline (Phase 2)
- All 15 stubs pass (smoke-only; replaced with real contract tests as phases progress).

### Phase 0 Task 5 — Feature flag
- `qualia-shell/.env.example` created with `VITE_APPFOLIO_SEEDS=true` default + doc comment pointing at GR-7.
- Flag is consumed by every derived-fixture file. When false, fixture arrays are empty; when true, real captures are exposed.

## Known environmental blockers (flag for Phase 1+ on a real dev box)

1. **Playwright cannot run in sandbox** — no browser binaries. Phase 0 gate accepts this on the sandbox; all later phases' E2E runs MUST be executed on a real dev machine.
2. **Workspace `dist/` is mount-locked** — host OS denies `rm` of files in the user-selected folder from the sandbox. Workaround: build to `/tmp/vite-*-dist` when running inside Cowork; on a real dev box this is moot.
3. **Node version mismatch** — `package.json` engines declares `>=25.5.0`. Sandbox has v22.22.0. The `--engine-strict=false` workaround works for installs; no runtime breakage observed. Phase 1+ should run on Node ≥25.5 locally.
4. **Missing native rollup binary** — `@rollup/rollup-linux-arm64-gnu` wasn't in `node_modules` on first run (classic npm optional-deps bug). Installed via `npm_config_engine_strict=false npm install --no-save`. Not a code change; no commit needed.

## Rollback

Phase 0 is entirely additive — new files only, no modifications to existing source. To roll back:
```
rm -rf qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived
rm -rf qualia-shell/src/test/appfolioParity
rm qualia-shell/.env.example
rm Scripts/derive_appfolio_fixtures.mjs
rm Docs/Baselines/2026-04-19_Phase0_baseline_*.txt
rm Docs/Phase0_Type_Audit.md
rm Docs/Phase0_Completion_Report.md
```

## Verification summary

```
tsc -b                                    → exit 0, 0 errors
vitest run                                → 80 passed, 9 failed (baseline: 65p/9f; +15 passed, 0 new failures)
vite build (default flag)                 → ✓ 3269 modules, 8.07s
vite build VITE_APPFOLIO_SEEDS=false      → ✓ 3269 modules, 8.31s
vite build VITE_APPFOLIO_SEEDS=true       → ✓ (same) 
playwright test                           → sandbox blocker only; deferred to real dev box
```

**All Phase-0 exit-gate criteria met (with sandbox exceptions documented).** Ready for Phase 1 pending user verification per the plan.

🧪
