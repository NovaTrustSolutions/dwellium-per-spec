# Dev Box Setup — qualia-shell

One-page bring-up for a new contributor. Get to a green `tsc / vitest / playwright / vite build` in under 10 minutes.

## 1. Prerequisites

- macOS, Linux, or WSL2 on Windows. Native Windows (PowerShell) is untested — use WSL.
- ~4 GB free disk (browser binaries dominate).
- Git + a shell (`bash` or `zsh`).

## 2. Node + npm (Phase 0.0 Task 0.0.1)

`qualia-shell/package.json` declares `engines.node >= 25.5.0` and `engines.npm >= 11.8.0`. A `.nvmrc` pinning Node **25.5.0** lives at `qualia-shell/.nvmrc`.

Install + switch:

```
# macOS / Linux — preferred
nvm install 25
nvm use 25

# Windows (fnm)
fnm use 25
```

Verify:

```
node --version   # expect v25.x.x
npm --version    # expect 11.x.x or later
```

If your shell doesn't auto-load `.nvmrc`, run `cd qualia-shell && nvm use` after entering the directory.

## 3. Install dependencies

```
cd qualia-shell
npm install
```

### Rollup native-binary workaround (Phase 0.0 Task 0.0.3)

If `npm install` complains about a missing `@rollup/rollup-<arch>` optional dep (a known npm issue: https://github.com/npm/cli/issues/4828), run once:

```
npm_config_engine_strict=false npm install --no-save @rollup/rollup-<arch>
```

Replace `<arch>` with your platform: `linux-arm64-gnu`, `linux-x64-gnu`, `darwin-arm64`, `darwin-x64`, `win32-x64-msvc`.

Then delete `node_modules` + `package-lock.json` once and re-run `npm install` so the lockfile regenerates clean.

## 4. Playwright browsers (Phase 0.0 Task 0.0.2)

```
cd qualia-shell
npx playwright install --with-deps chromium firefox webkit
```

≈200 MB download. Needed only on a real dev box; the Cowork sandbox cannot launch browsers (`spawn /bin/sh ENOENT`).

Verify:

```
npx playwright test --list   # expect ≥1 spec listed
```

## 5. Build verification

```
cd qualia-shell
npx tsc -b                   # expect: 0 errors
npx vitest run               # expect: ≤ baseline failures (9 pre-existing in StellaAgent.test.tsx + 1 other)
npx playwright test          # expect: ≤ baseline failures on real dev box
npx vite build               # expect: 3269+ modules, success
```

### Cowork sandbox only — outDir workaround (Phase 0.0 Task 0.0.4)

The user-selected folder is mount-locked from inside Cowork, so `vite build` to the default `dist/` fails with `EPERM` on `.DS_Store`. Workaround for sandbox runs only:

```
npx vite build --outDir /tmp/vite-dist --emptyOutDir
```

On a real dev box, the default `dist/` works normally — no workaround needed.

## 6. Environment variables

Copy `.env.example` to `.env` and populate:

```
cp qualia-shell/.env.example qualia-shell/.env
```

Key vars:

- `VITE_APPFOLIO_SEEDS=true` — dev/staging default; surfaces the AppFolio-derived fixtures.
- `VITE_APPFOLIO_SEEDS=false` — required for external / customer-demo builds to avoid leaking real tenant/vendor PII (GR-7).

## 7. Pre-commit hook (Phase 4 Task 4.8 enables; Phase 0.0 documents)

Once Phase 4 lands, every commit touching `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/` or `qualia-shell/public/data/` triggers the PII scanner:

```
node Scripts/verify_no_pii_leak.mjs
```

Non-zero exit blocks the commit.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `Error: Node version 22.x is incompatible` | `nvm use 25`; if no nvm, install it |
| `Cannot find module @rollup/rollup-linux-arm64-gnu` | §3 rollup workaround |
| `vite build` fails with `EPERM` on `.DS_Store` | Cowork sandbox only; use `--outDir /tmp/...` |
| `spawn /bin/sh ENOENT` in Playwright | Cowork sandbox only; run on a real dev box |
| `npm install` hangs on `engines` check | Run once: `npm_config_engine_strict=false npm install` |
| Port 5173 in use | `npm run dev -- --port 5174` |

## 9. Links

- Implementation plan: `Docs/AppFolio_Parity_Implementation_Plan_v2.md`
- Phase 0.0 plan: `Docs/Phases/Phase_0.0_Plan.md`
- Phase 0 completion report: `Docs/Phase0_Completion_Report.md`
- Baselines: `Docs/Baselines/2026-04-19_Phase0_baseline_*.txt`
