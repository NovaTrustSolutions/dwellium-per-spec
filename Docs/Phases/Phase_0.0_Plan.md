# Phase 0.0 — Environment Prerequisites

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §5
**Phase status.** Not started (sandbox-partial evidence only; real dev box run required)
**Budget.** 0.5 day + 0.25 day buffer = 0.75 day
**Owner.** Dev owner (Ilya)
**Dependencies.** None. Blocks everything downstream.
**Parallelizable?** No. This phase gates all others.

---

## §1. Scope

Before any code is touched, every engineer's local box (and the CI runner) must be able to run the full toolchain `tsc → vitest → playwright → vite build → lighthouse → axe` end-to-end without environmental fudging. Phase 0 captured a sandbox-only baseline; Phase 0.0 captures the real dev-box baseline and closes the 4 environmental blockers documented in `Docs/Phase0_Completion_Report.md` §"Known environmental blockers".

Scope boundaries:

- IN — toolchain version pinning, native binaries, browser binaries, PII-leak smoke script, CI skeleton, Lighthouse baseline, axe baseline, screenshot-diff baseline.
- OUT — any product code change, any type change, any fixture expansion beyond what Phase 0 already produced.

---

## §2. Definition of Ready

Before any Phase 0.0 task can begin, all of:

1. A real dev box (not the Cowork sandbox) is available with admin rights to install Node, npm, Playwright browsers.
2. `Docs/Phase0_Completion_Report.md` is committed and signed off.
3. The engineer has pulled the latest branch containing the Phase 0 deliverables.
4. CI repository has permission to enable GitHub Actions (or equivalent) for `qualia-shell`.

---

## §3. Definition of Done

Every Task 0.0.N below must have:

1. Pasted command output or file path in the Completion Report.
2. A green row in §5 Verification Matrix.
3. Rollback instructions captured.
4. No real PII in any committed file.
5. `/security-review` pass on any script added.
6. `Docs/Phase0.0_Environment_Report.md` committed with all evidence.

---

## §4. Tasks

### Task 0.0.1 — Node + npm version pin

**Goal.** Every contributor runs the version `qualia-shell/package.json#engines` declares.

**Prereq read.** `qualia-shell/package.json` (lines with `engines`).

**Steps.**

1. Verify local `node --version` ≥ 25.5.0, `npm --version` ≥ 11.8.0.
2. If below, install via `nvm install 25 && nvm use 25` (macOS/Linux) or `fnm use 25` (Windows).
3. Write `Docs/DevBox_Setup.md` with the three commands above plus a troubleshooting footer.
4. Add `.nvmrc` at `qualia-shell/.nvmrc` with contents `25`.

**Files touched.**

- `qualia-shell/.nvmrc` (new)
- `Docs/DevBox_Setup.md` (new)

**Verify.**

```
cd qualia-shell && node --version   # expect v25.x.x
cd qualia-shell && npm --version    # expect 11.x.x or later
```

Paste both outputs into the phase report.

**Rollback.** `rm qualia-shell/.nvmrc Docs/DevBox_Setup.md && git commit -m "revert 0.0.1"`.

---

### Task 0.0.2 — Playwright browser binaries

**Goal.** `npx playwright test` runs on the dev box.

**Steps.**

1. `cd qualia-shell && npx playwright install --with-deps chromium firefox webkit` (≈200 MB download).
2. Run `npx playwright test --list` to confirm discovery. Expect ≥1 test file listed.
3. Run one smoke spec: `npx playwright test --grep="smoke"` (or the first file in `e2e/`). Document result.

**Verify.** Paste the test-list count and the smoke-test pass count into the phase report.

**Rollback.** `npx playwright uninstall` (removes binaries; no code change).

**Known sandbox blocker.** `/bin/sh ENOENT` error in the Cowork sandbox is environmental. On a real box this step passes; on the sandbox it is skipped and documented.

---

### Task 0.0.3 — Rollup native binary (Linux ARM64 / macOS ARM64 / Linux x64)

**Goal.** `vite build` doesn't crash on missing `@rollup/rollup-*` optional dep.

**Steps.**

1. From `qualia-shell/`, run `npm install` (not `npm ci` the first time — we need optional deps to resolve for the host arch).
2. If the error `Cannot find module @rollup/rollup-<arch>` appears, run `npm_config_engine_strict=false npm install --no-save @rollup/rollup-<arch>` where `<arch>` is `linux-arm64-gnu`, `darwin-arm64`, `linux-x64-gnu`, etc.
3. Delete `node_modules` and `package-lock.json`, re-run `npm install`, verify the optional dep is picked up cleanly.
4. Add a row to `Docs/DevBox_Setup.md` describing the workaround and linking npm issue #4828.

**Verify.** `cd qualia-shell && npx vite build --outDir /tmp/v1` completes with 0 errors.

**Rollback.** None required — optional deps are installed locally only.

---

### Task 0.0.4 — Workspace permission / outDir workaround

**Goal.** Remove the Cowork-only `--outDir /tmp/...` hack for local dev.

**Steps.**

1. On the real dev box, `cd qualia-shell && npx vite build` (default `dist/`). Confirm it succeeds without permission errors. The mount-lock only applies inside Cowork.
2. Keep the `--outDir /tmp/vite-*` fallback documented in `Docs/DevBox_Setup.md` for Cowork users.

**Verify.** Normal `dist/` contains an `index.html` with current timestamps.

**Rollback.** N/A.

---

### Task 0.0.5 — PII-leak smoke script

**Goal.** Any commit containing a real email, phone, or SSN-like pattern in an `appfolioDerived` fixture fails CI before merge.

**Files touched.**

- `Scripts/verify_no_pii_leak.mjs` (new).
- `.github/workflows/pii-scan.yml` (new, minimal).

**Script behavior.**

```js
// Scripts/verify_no_pii_leak.mjs — pseudo-spec
// 1. Read every .ts file under qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/
// 2. Scan for patterns:
//    - /@(gmail|yahoo|hotmail|outlook|aol|icloud)\.com/i
//    - /\(\d{3}\)\s?\d{3}-\d{4}/   (US phone)
//    - /\bXX-XXX\d{4}\b/           (SSN mask leak)
//    - /\b\d{3}-\d{2}-\d{4}\b/     (raw SSN)
// 3. Allowlist: @example.com, @dwellium.test
// 4. Exit 1 on any match; print filename:line:matched-string.
// 5. Exit 0 clean.
```

**Verify.**

```
node Scripts/verify_no_pii_leak.mjs
# expect: exit 0, "PII scan clean — N files scanned, 0 leaks found"
```

**Rollback.** Delete both files. CI skips the pii-scan job.

**Security review.** Run `/security-review` on the script before merge (GR-12).

---

### Task 0.0.6 — CI pipeline skeleton

**Goal.** Every PR touching `packages/types/**`, `qualia-shell/src/**`, `qualia-shell/public/data/**`, or `qualia-shell/src/test/appfolioParity/**` triggers the parity gate.

**File touched.**

- `.github/workflows/appfolio-parity-gate.yml` (new — see v2.0 §13 for the full YAML skeleton).

**Jobs.**

1. `setup-node@v4` with `node-version: '25'`.
2. `npm ci` in `qualia-shell/`.
3. `npx tsc -b`.
4. `npx vitest run`.
5. `npx playwright install --with-deps` then `npx playwright test`.
6. `npx vite build`.
7. `node ../Scripts/verify_no_pii_leak.mjs`.
8. Upload Lighthouse + axe artifacts.

**Verify.** Open a throwaway PR that touches one of the trigger paths; confirm the gate runs; confirm it passes on the clean branch.

**Rollback.** Delete the workflow file. CI returns to default behavior.

---

### Task 0.0.7 — Lighthouse + performance baseline

**Goal.** Establish LCP/TBT/CLS numbers for the 8 pages that Phase 3 will gate against.

**Pages baseline.**

- `/strata/dashboard`
- `/strata/properties` (list)
- `/strata/properties/appfolio-18` (detail)
- `/strata/residents`
- `/strata/vendors`
- `/strata/vendors/appfolio-v-2716`
- `/strata/maintenance`
- `/strata/maintenance/19511-1`

**Steps.**

1. Start dev server: `cd qualia-shell && npm run dev`.
2. For each URL, run `npx lighthouse <url> --preset=desktop --output=json --output-path=./lh-<slug>.json`.
3. Write `Docs/Baselines/2026-04-19_Phase0_perf_baseline.json` aggregating: `{ page, LCP_ms, TBT_ms, CLS, LCP_p95_ms }` rows.

**Verify.** File exists; row count = 8; no `null` metrics.

**Rollback.** Delete the JSON; the Phase 3 gate then runs without a baseline floor (absolute-target only).

---

### Task 0.0.8 — axe-core accessibility baseline

**Goal.** Capture the current a11y violation list for the same 8 pages so Phase 3's "≤ baseline" gate has a reference.

**Steps.**

1. Add `@axe-core/playwright` as a dev dep (optional — skip if already present).
2. Write a one-off spec `qualia-shell/e2e/axe-baseline.spec.ts` that visits each page and writes the violation list.
3. Output aggregated to `Docs/Baselines/2026-04-19_Phase0_axe_baseline.json`.

**Verify.** File exists; 8 rows; each row has `{ page, violations: [{ id, impact, count }] }`.

**Rollback.** Delete both files.

---

### Task 0.0.9 — Screenshot-diff baseline (Playwright snapshot)

**Goal.** Freeze the current rendering of the same 8 pages so Phase 3 can detect >5% pixel drift.

**Steps.**

1. Write `qualia-shell/e2e/screenshot-baseline.spec.ts` using `page.screenshot({ fullPage: true })`.
2. Commit PNGs to `qualia-shell/e2e/__screenshots__/baseline/`.
3. Phase 3 runs `playwright test --update-snapshots` and diffs.

**Verify.** 8 PNGs committed; each ≥ 100 KB (non-empty).

**Rollback.** Delete the PNGs + the spec.

---

## §5. Verification Matrix

Every row must be green for Phase 0.0 exit.

| Check | Target | Evidence |
|---|---|---|
| Node ≥ 25.5 | pass | pasted `node --version` |
| npm ≥ 11.8 | pass | pasted `npm --version` |
| `.nvmrc` committed | exists | `cat qualia-shell/.nvmrc` |
| Playwright browsers installed | ≥1 spec listed | `npx playwright test --list` output |
| `vite build` (default `dist/`) | 0 errors | pasted build output |
| PII-leak smoke script | exit 0 on clean repo | pasted output |
| CI pipeline | green on smoke PR | PR link |
| Lighthouse baseline JSON | 8 rows, all metrics present | `Docs/Baselines/2026-04-19_Phase0_perf_baseline.json` |
| axe baseline JSON | 8 rows | `Docs/Baselines/2026-04-19_Phase0_axe_baseline.json` |
| Screenshot baseline PNGs | 8 files committed | `ls qualia-shell/e2e/__screenshots__/baseline/` |
| `/security-review` on scripts | no High/Medium | review output |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-0.0-1 | Engineer on Node < 25 can't compile | Med | Low | `.nvmrc` + `Docs/DevBox_Setup.md`; fail-fast on `npm install` via `engines.strict=true` in package.json |
| R-0.0-2 | Playwright download flaky in CI | Med | Med | cache browsers in CI; use `--with-deps` to install system libs |
| R-0.0-3 | Lighthouse flake from cold start | Med | Low | run dev server warmup; median over 3 runs |
| R-0.0-4 | axe baseline includes pre-existing violations that Phase 3 is expected to fix | Low | Med | document the delta in the baseline JSON's `comments` field |
| R-0.0-5 | Screenshot baseline captures a flaky UI state | Low | Med | disable animations via `prefers-reduced-motion: reduce` injected CSS during capture |

---

## §7. Rollback Plan

Phase 0.0 is entirely additive — new config + new scripts. Rollback:

```
rm qualia-shell/.nvmrc
rm Docs/DevBox_Setup.md
rm Scripts/verify_no_pii_leak.mjs
rm .github/workflows/appfolio-parity-gate.yml
rm .github/workflows/pii-scan.yml
rm Docs/Baselines/2026-04-19_Phase0_perf_baseline.json
rm Docs/Baselines/2026-04-19_Phase0_axe_baseline.json
rm -rf qualia-shell/e2e/__screenshots__/baseline
rm qualia-shell/e2e/screenshot-baseline.spec.ts qualia-shell/e2e/axe-baseline.spec.ts
```

No source code or types are touched. Rollback is safe at any time.

---

## §8. Exit Gate

Phase 0.0 is complete when:

1. All 9 tasks (0.0.1 – 0.0.9) have a green row in §5.
2. `Docs/Phase0.0_Environment_Report.md` is committed with pasted evidence (see §9).
3. One smoke PR has run through `.github/workflows/appfolio-parity-gate.yml` end-to-end and landed green.
4. Ilya has reviewed the Completion Report and verbally verified "go Phase 1" per the standing rule.

---

## §9. Deliverables (for the Completion Report)

The `Docs/Phase0.0_Environment_Report.md` file must include:

1. Pasted output of `node --version` and `npm --version`.
2. Pasted output of `npx playwright test --list`.
3. Pasted output of `npx vite build` (default outDir).
4. Pasted output of `node Scripts/verify_no_pii_leak.mjs`.
5. Link to the smoke-PR run of the parity gate (green).
6. The three baseline JSON files' paths + row counts.
7. The 8 screenshot PNG paths.
8. Known-issues section (if any) with ETA to close.

---

## §10. Handoff to Phase 0

Phase 0 was already executed and green in the Cowork sandbox (see `Docs/Phase0_Completion_Report.md`). The only items Phase 0.0 adds on top are the three baseline captures (perf, axe, screenshot) that could not run in the sandbox. Phase 0 does not re-run; it is re-verified on the real dev box via the CI smoke PR.

🧪
