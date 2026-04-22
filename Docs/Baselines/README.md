# Baselines

Generated artifacts that freeze known-good measurements so later phases can regress against them. Each baseline is additive — re-running produces a new timestamped file without overwriting older ones.

## Files produced here

| File | Written by | Purpose |
|---|---|---|
| `YYYY-MM-DD_Phase0_perf_baseline.json` | `Scripts/run_lighthouse_baseline.mjs` | Lighthouse scores + Core Web Vitals on app root, averaged over 3 runs |
| `YYYY-MM-DD_Phase0_axe_baseline.json` | `qualia-shell/e2e/axe-baseline.spec.ts` | axe-core violation counts per parity module |
| `ci_vitest_<runid>.xml` | `.github/workflows/appfolio-parity-gate.yml` | JUnit-formatted vitest output per CI run |

Screenshot baselines live in `qualia-shell/e2e/__screenshots__/screenshot-baseline.spec.ts-snapshots/` — not in this folder because Playwright's snapshot tooling expects them colocated with the spec.

## Regenerating (real dev box only)

```
# From repo root
cd qualia-shell
nvm use 25.5.0
npm ci
npm install --save-dev @axe-core/playwright lighthouse chrome-launcher
npx playwright install --with-deps chromium firefox webkit

# Screenshots
npx playwright test e2e/screenshot-baseline.spec.ts --update-snapshots

# axe
npx playwright test e2e/axe-baseline.spec.ts

# Lighthouse (from repo root)
cd ..
npm run build --prefix qualia-shell
node Scripts/run_lighthouse_baseline.mjs
```

See `Docs/Phase_0.0_DevBox_Handoff.md` for the full one-shot runbook.
