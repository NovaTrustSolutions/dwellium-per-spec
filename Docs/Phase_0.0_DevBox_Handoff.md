# Phase 0.0 — Real Dev Box Handoff

**Date written:** 2026-04-19
**Author:** Claude (Cowork sandbox)
**Target audience:** the next session running on a real macOS/Linux dev box with browser support.
**Goal:** close the 4 remaining Phase 0.0 tasks in under 15 minutes of wall-clock time.

## TL;DR

Four tasks still need a real dev box. Everything else (scanner, CI YAML, derive-script sanitizers, legacy-PII cleanup, static-API env switch) is already merged and green.

**Default mode: static API.** `strataApi.ts` is a router that picks `strataApi.static.ts` (in-memory fixtures + localStorage stub) when `VITE_USE_STATIC_API=true`, otherwise `strataApi.backend.ts` (real fetch to `/api/dwellium/*`). `playwright.baseline.config.ts` sets the flag automatically, so **baselines now render with real fixture data and require no sibling backend.**

| Mode | Prereq | Baselines capture |
|---|---|---|
| **Static API (default for baselines)** | None — vite-only; env flag wired into `playwright.baseline.config.ts` | Real fixture data from `public/data/*.json` via the static client |
| **Live backend (optional)** | Clone `ai-dashboard369-file-manager` next to this repo; run `npm ci && npm run dev` on `:3000` in a second terminal | Real fixture data from the backend's DB |

Both modes use the same specs and scripts; only the Playwright config differs. All per-task artifacts are already committed.

| # | Task | Artifact (already committed) | Command (static API, default) | Command (live backend) |
|---|---|---|---|---|
| 0.0.2 | Playwright browsers | `qualia-shell/playwright.config.ts` | `npx playwright install --with-deps chromium firefox webkit` | same |
| 0.0.7 | Lighthouse baseline | `Scripts/run_lighthouse_baseline.mjs` | `VITE_USE_STATIC_API=true npm run build --prefix qualia-shell && node Scripts/run_lighthouse_baseline.mjs` | `node Scripts/run_lighthouse_baseline.mjs` (needs backend on :3000) |
| 0.0.8 | axe baseline | `e2e/axe-baseline.spec.ts` | `npx playwright test --config playwright.baseline.config.ts e2e/axe-baseline.spec.ts` | `npx playwright test e2e/axe-baseline.spec.ts` (main config) |
| 0.0.9 | Screenshot baseline | `e2e/screenshot-baseline.spec.ts` | `npx playwright test --config playwright.baseline.config.ts --update-snapshots` | `npx playwright test e2e/screenshot-baseline.spec.ts --update-snapshots` |

> **How the API switch works.** `strataApi.ts` is now a thin router: it imports both `strataApi.backend.ts` and `strataApi.static.ts` and dispatches to one based on the `VITE_USE_STATIC_API` vite env flag (inlined at build time). Both impls expose identical function signatures and `PaginatedResponse<T>` shapes, so callers can't tell which one they're hitting. The console logs `[strataApi] mode=static|backend` once at boot for debuggability.

## Step 0 — Sanity

```
cd /path/to/dwellium-per-spec
git pull origin main
git status --short
# Expect: clean, no untracked files
```

**Only if capturing baselines against the live backend (optional):**

```
# Sibling backend — clone once, then leave running in a dedicated terminal
cd ..
[ -d ai-dashboard369-file-manager ] || git clone <backend-url> ai-dashboard369-file-manager
cd ai-dashboard369-file-manager
nvm use 25.5.0 || true
npm ci
npm run dev   # keeps :3000 up; leave this terminal running for Steps 4-5
```

The default path uses the static API (`VITE_USE_STATIC_API=true`) via `playwright.baseline.config.ts`, which requires no backend at all.

## Step 1 — Node 25 + dependencies (~2 min)

```
# From repo root
cat qualia-shell/.nvmrc            # expect: 25.5.0
nvm install                        # reads .nvmrc
nvm use                            # uses 25.5.0
node --version                     # expect: v25.5.x
npm --version                      # expect: >= 11.8.x

cd qualia-shell
npm ci --prefer-offline --no-audit # uses package-lock.json
cd ..
```

If `npm ci` fails on rollup native binary (known issue, see `Docs/DevBox_Setup.md §3`):

```
cd qualia-shell
npm_config_engine_strict=false npm install @rollup/rollup-darwin-arm64 --no-save
cd ..
```

## Step 2 — Install Playwright browsers (Task 0.0.2, ~3 min)

```
cd qualia-shell
npx playwright install --with-deps chromium firefox webkit
npx playwright test --list | head -20
cd ..
```

**Expected output:** `--list` prints all e2e specs, including `screenshot-baseline.spec.ts` and (once axe dep is installed) `axe-baseline.spec.ts`. Paste the first ~10 lines into `Docs/Phase0.0_Environment_Report.md` under a new `## Deferred-run` section.

## Step 3 — Install baseline-only dev deps (~1 min)

axe and Lighthouse aren't in `package.json` yet to keep the sandbox build lean. Install them on the dev box:

```
cd qualia-shell
npm install --save-dev @axe-core/playwright lighthouse chrome-launcher
cd ..
```

After this, re-run `git status` — expect `qualia-shell/package.json` and `package-lock.json` modified. Commit separately with message `chore: add baseline-only dev deps (axe, lighthouse)`.

## Step 4 — Capture screenshot baseline (Task 0.0.9, ~2 min)

**Static API (default; no backend needed):**
```
cd qualia-shell
npx playwright test --config playwright.baseline.config.ts --update-snapshots
cd ..
```

**Live backend (only if backend running on :3000):**
```
cd qualia-shell
npx playwright test e2e/screenshot-baseline.spec.ts --update-snapshots
cd ..
```

**Expected output:** 8 PNGs written into `qualia-shell/e2e/__screenshots__/screenshot-baseline.spec.ts-snapshots/` — one per module (overview.png, properties.png, leasing.png, residents.png, vendors.png, owners.png, accounting.png, maintenance.png). Each at ~1440×900 full-page.

Commit: `test(e2e): capture Phase 0.0 screenshot baselines (8 modules)`.

## Step 5 — Capture axe baseline (Task 0.0.8, ~2 min)

**Static API (default; no backend needed):**
```
cd qualia-shell
npx playwright test --config playwright.baseline.config.ts e2e/axe-baseline.spec.ts
cd ..
```

**Live backend (only if backend running on :3000):**
```
cd qualia-shell
npx playwright test e2e/axe-baseline.spec.ts
cd ..
```

**Expected output:** `Docs/Baselines/<YYYY-MM-DD>_Phase0_axe_baseline.json` with a `summary.totalViolations` count and per-module breakdown. Non-blocking on first run — the number itself is the baseline; later phases must not regress it.

Commit: `chore: capture Phase 0.0 axe accessibility baseline`.

## Step 6 — Capture Lighthouse baseline (Task 0.0.7, ~3 min)

**Static API (default; no backend needed):**
```
cd qualia-shell && VITE_USE_STATIC_API=true npm run build && cd ..
node Scripts/run_lighthouse_baseline.mjs
```

**Live backend (only if backend running on :3000):**
```
cd qualia-shell && npm run build && cd ..
node Scripts/run_lighthouse_baseline.mjs
```

**Expected output:** `Docs/Baselines/<YYYY-MM-DD>_Phase0_perf_baseline.json` with averaged scores across 3 runs (performance / accessibility / best-practices / SEO) plus Core Web Vitals (FCP / LCP / TBT / CLS / SI / TTI). The final terminal line prints the 4 scores as percentages.

Commit: `chore: capture Phase 0.0 Lighthouse performance baseline`.

## Step 7 — Update Phase 0.0 report (~2 min)

Open `Docs/Phase0.0_Environment_Report.md` and flip the four deferred rows to ✅:

```
| 0.0.2 | Playwright browser binaries | ✅ dev-box complete | see Deferred-run section |
| 0.0.7 | Lighthouse + perf baseline  | ✅ dev-box complete | Docs/Baselines/<stamp>_Phase0_perf_baseline.json |
| 0.0.8 | axe-core a11y baseline      | ✅ dev-box complete | Docs/Baselines/<stamp>_Phase0_axe_baseline.json |
| 0.0.9 | Screenshot-diff baseline    | ✅ dev-box complete | 8 PNGs in qualia-shell/e2e/__screenshots__/ |
```

Append a new `## Deferred-run proof` section containing the 4 terminal outputs (truncate Lighthouse JSON — just the `averages.scores` block is enough).

Commit: `docs(phase0.0): close deferred-run tasks with dev-box proof`.

## Step 8 — Run the smoke CI PR (~5 min)

```
git checkout -b chore/phase-0.0-smoke-pr
git commit --allow-empty -m "ci: Phase 0.0 smoke PR"
git push -u origin chore/phase-0.0-smoke-pr
gh pr create --title "Phase 0.0 — smoke CI" --body "$(cat <<'EOF'
## Summary
- Empty smoke PR to verify .github/workflows/appfolio-parity-gate.yml runs green end-to-end on the real dev box.
- Exercises: checkout, Node 25 setup, npm ci, tsc -b, vitest, playwright install, playwright test, vite build (seeds=true), vite build (seeds=false), PII scan (strict), artifact upload.

## Test plan
- [ ] Parity-gate workflow green
- [ ] pii-scan workflow green
- [ ] Artifacts uploaded with ci_vitest_<runid>.xml
EOF
)"
```

Once green, the Phase 0.0 exit gate is formally closed and Phase 1 is unblocked.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Error: Browser not installed` | Re-run `npx playwright install --with-deps chromium firefox webkit` inside `qualia-shell/`. |
| `Cannot find module '@axe-core/playwright'` | `cd qualia-shell && npm install --save-dev @axe-core/playwright`. |
| `Cannot find module 'lighthouse'` | `cd qualia-shell && npm install --save-dev lighthouse chrome-launcher`. Lighthouse is resolved by Node from the nearest `node_modules`, so qualia-shell is fine. |
| `EADDRINUSE :::5173` or `:::4173` | Kill the stale dev/preview process (`lsof -ti :5173 \| xargs kill`) then retry. |
| Screenshot test fails with large pixel diff on first run | First run MUST be `--update-snapshots`. Without it, Playwright errors because no baseline exists. |
| Lighthouse hangs on `waitForPort` | Ensure `vite preview` is listening — test with `curl -I http://localhost:4173/` in a separate shell. The script spawns vite; if `npm run build` wasn't run first there's nothing to preview. |
| axe baseline has 0 pages scanned | `test.describe.configure({ mode: 'serial' })` is in the spec; if you overrode it to parallel, the `afterAll` runs before all tests — revert to serial. |

## Rollback

All Phase 0.0 artifacts are additive. To revert the dev-box session:

```
# Remove captured baselines
rm -rf qualia-shell/e2e/__screenshots__/screenshot-baseline.spec.ts-snapshots
rm -f Docs/Baselines/*_Phase0_axe_baseline.json
rm -f Docs/Baselines/*_Phase0_perf_baseline.json

# Optionally remove baseline-only deps
cd qualia-shell
npm uninstall @axe-core/playwright lighthouse chrome-launcher
cd ..
```

Playwright browser binaries are cached in `~/.cache/ms-playwright` and can be freed with `npx playwright uninstall` if disk pressure becomes an issue.

## Files referenced

- `qualia-shell/playwright.config.ts` — pre-existing dual-server config (vite + sibling backend), chromium project.
- `qualia-shell/playwright.baseline.config.ts` — baseline-only config (vite-only; NEW for Phase 0.0).
- `qualia-shell/e2e/helpers/auth.ts` — shared `loginAs()` helper.
- `qualia-shell/e2e/screenshot-baseline.spec.ts` — Task 0.0.9 spec.
- `qualia-shell/e2e/axe-baseline.spec.ts` — Task 0.0.8 spec.
- `Scripts/run_lighthouse_baseline.mjs` — Task 0.0.7 script.
- `Docs/Baselines/README.md` — output folder contract.
- `.github/workflows/appfolio-parity-gate.yml` — CI pipeline that the smoke PR exercises.
- `Docs/Phase0.0_Environment_Report.md` — the final completion report to update.
