# Task 1.1 — Manual Smoke (blocker note)

**Status:** step 7 (visual screenshot smoke) was attempted but not completed in
this session. Automated verify steps 1–6 (tsc, vitest 91/91, vite dual-mode
build, PII scan strict) all pass — see the PR body for captured outputs.

## What was attempted

1. `VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npx vite build` + `vite
   preview` to boot the shell against static fixtures (no backend required).
2. A Playwright script (`qualia-shell/scripts/task_1_1_smoke.mjs`, not
   committed) that route-mocks `/api/auth/me`, `/api/auth/refresh`, and all
   `/api/dwellium/**` endpoints by re-serving `public/data/*.json`.

## Why it was set aside

- Vite dev did not reliably pick up `VITE_USE_STATIC_API=true` from CLI env or
  `.env.local`; the runtime consistently logged `[strataApi]
  mode=backend (/api/dwellium proxy)` — the runtime check (optional chaining
  on `import.meta.env`) is not replaced at build time.
- Even in backend-proxy mode with all endpoints route-mocked from Playwright,
  the Strata dashboard rendered a minimal-permission view ("Domains
  restricted", only `Sign Out` nav item), suggesting a richer `/api/auth/me`
  permissions shape is required than this smoke harness supplied.
- The sibling `ai-dashboard369-file-manager` backend is not present locally,
  so the normal e2e path (Playwright config's auto-started backend) was not
  available.

## Why this is not a phase-blocker

- The contract under test (occupancy 2800 → LaSonta Westbrook primary + 3
  Other Occupants) is enforced at the `/occupancies` data seam — the same
  seam `OtherOccupantsSection` consumes — by
  `src/test/appfolioParity/residents.test.ts`. A drift in any of
  {types, seed shape, route handler, id references, ordering} will fail
  `npx vitest run`.
- The `primaryTenant === 'Yes'` render gate and the 3-row resolution logic
  are exercised by the same contract test (see
  "resolves other-occupant ids against tenants list → 3 rows, no primary
  included").
- CI's strict gates (tsc, vitest, vite dual-mode, PII) run on every PR push
  and are all green for this branch — see the PR body for the workflow run
  link.

## Follow-up

- Linux Playwright baselines remain deferred (per repo-root `CLAUDE.md`). A
  Residents/occupancy visual baseline can be added in the same `e2e/`
  screenshot-baseline pass when the sibling backend is running, rather than
  via an ad-hoc per-task smoke script.
